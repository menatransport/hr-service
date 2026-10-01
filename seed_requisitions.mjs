/**
 * ใส่คำขอสรรหาตัวอย่างลง hr_service."recruitment_requests" — **ใบละหนึ่งอัตรา
 * ต่อผู้สมัครหนึ่งคน** ที่มีอยู่จริงในฐานข้อมูล
 *
 *   node seed_requisitions.mjs          → ล้างตัวอย่างเดิมแล้วใส่ใหม่
 *   node seed_requisitions.mjs --clean  → ลบเฉพาะตัวอย่าง (ฟิลด์ `sample: true`)
 *
 * **ทุกอย่างอ่านจากของจริงในฐานข้อมูล ไม่ได้ก๊อปมาแปะไว้ที่นี่:**
 * - ผู้สมัคร ← `recruitment_regist_answer` (ทั้งชื่อ เลขที่ใบ และสถานะปัจจุบัน)
 * - ครูฝึก / พจส. ที่ถูกแทน ← `hr_service.master_driver` (คนที่ยังทำงานอยู่)
 * - รถ และแพล้นท์ ← `Boom_ETL.vehicles` (คันที่ยังใช้งานอยู่) — **อ่านอย่างเดียว**
 *
 * จึงได้ข้อมูลที่ “sync กันได้จริง”: กดที่คำขอแล้วเห็นชื่อผู้สมัครจริง กดไปหน้า
 * ผู้สมัครก็เจอใบเดียวกัน และครูฝึกเป็นชื่อ พจส. ที่มีอยู่ในทะเบียนจริง
 *
 * **สถานะของคำขอไม่ได้ตั้งเอง แต่คิดจากสถานะใบสมัคร** ตามกฎเดียวกับ
 * `store.ts` เป๊ะ ๆ — ข้อมูลตัวอย่างจึงไม่มีทางขัดกับกฎของระบบ:
 *
 * | ใบสมัคร | คำขอ |
 * |---|---|
 * | `training` | `filled` (เริ่มฝึกงานแล้ว) + `filledOn` |
 * | `interview_passed` | `matched` (ได้ผู้สมัครแล้ว) |
 * | อื่น ๆ | `open` — ยังผูกใครไม่ได้ อัตรายังเปิดรับอยู่ |
 *
 * ทุกใบมีฟิลด์ `sample: true` ติดไว้ ลบทีหลังได้โดยไม่แตะคำขอจริงแม้แต่ใบเดียว
 */
import fs from "node:fs";
import { MongoClient } from "mongodb";

/* ---------------------------------------------------------------- env */

const env = Object.fromEntries(
  fs
    .readFileSync(new URL(".env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const REQUISITIONS = "recruitment_requests";
const APPLICATIONS = "recruitment_regist_answer";
const COUNTERS = "recruitment_counters";
const DRIVERS = "master_driver";

/* ------------------------------------------------------- ชุดค่าที่หมุนใช้ */

/** ลอกจาก `CUSTOMERS` ใน `_lib/requisitions/types.ts` — ห้ามตั้งชื่อลูกค้าใหม่เอง */
const CUSTOMERS = ["Cpac", "SCCO", "Asia", "TPI", "Acon", "Fast", "ORC", "KP99"];
const POSITIONS = ["ML", "MS", "ML", "MS", "spare"];
/** รหัสจาก Reason Code Master (`seed_resign_reasons.mjs`) — ป้ายต้องตรงกับใน master */
const REPLACE_REASONS = [
  { code: "P4", label: "ที่อื่นให้ค่าตอบแทนสูงกว่า" },
  { code: "X3", label: "ลูกค้าส่งคืน" },
  { code: "X1", label: "ไม่ผ่านการฝึกงาน" },
  { code: "X5", label: "ปลดเนื่องจากทำผิดวินัย" },
  { code: "F1", label: "ต้องกลับไปดูแลครอบครัว" },
];

/**
 * เหตุผลที่บางใบถูกยกเลิก — ใส่ไว้ให้หน้าจอมีแถวสถานะ “ยกเลิกคำขอ” ให้ดูด้วย
 * (ไม่งั้นการ์ดสรุปกับชิปสีแดงจะไม่มีวันถูกเห็นตอนเปิดครั้งแรก)
 */
const CANCEL_REASONS = ["customer_cancelled", "postponed", "filled_elsewhere"];

/** สุ่มแบบคงที่ — รันซ้ำได้ผลเดิม (ท่าเดียวกับ `seed_recruitment_candidates.mjs`) */
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

const ymd = (d) => new Date(d).toISOString().slice(0, 10);

/** `YYYY-MM-DD` ของ n วันก่อนหน้าวันที่ให้มา */
function daysBefore(iso, n) {
  const d = new Date(`${iso}T00:00:00+07:00`);
  d.setUTCDate(d.getUTCDate() - n);
  return ymd(d);
}

/* --------------------------------------------------------------- main */

const clean = process.argv.includes("--clean");

const client = new MongoClient(env.MONGO_URI);
await client.connect();

const db = client.db(env.MONGO_DB || "hr_service");
const col = db.collection(REQUISITIONS);

const removed = await col.deleteMany({ sample: true });
console.log(`ลบคำขอตัวอย่างเดิม ${removed.deletedCount} ใบ`);

if (clean) {
  await client.close();
  console.log("เสร็จแล้ว (โหมด --clean ไม่ได้ใส่ของใหม่)");
  process.exit(0);
}

/* ---------------------------------------------- อ่านของจริงมาประกอบ */

const apps = await db
  .collection(APPLICATIONS)
  .find({}, { projection: { ref: 1, fullName: 1, status: 1, createdAt: 1 } })
  .sort({ createdAt: -1 })
  .toArray();

if (!apps.length) {
  await client.close();
  throw new Error(
    "ไม่มีใบสมัครในฐานข้อมูลเลย — รัน `node seed_recruitment_candidates.mjs` ก่อน",
  );
}

/** พจส. ที่ยังทำงานอยู่ — ใช้เป็นทั้งครูฝึกและคนที่ถูกแทน */
const drivers = await db
  .collection(DRIVERS)
  .find(
    { active: true, driverName: { $nin: [null, ""] } },
    { projection: { drivercode: 1, driverName: 1, startDate: 1 } },
  )
  .limit(400)
  .toArray();

if (drivers.length < 20) {
  await client.close();
  throw new Error("ทะเบียน พจส. มีข้อมูลน้อยเกินไป — ตรวจ `master_driver` ก่อน");
}

const vehicles = await client
  .db("Boom_ETL")
  .collection("vehicles")
  .find(
    { active: true, code: { $nin: [null, ""] }, plant: { $nin: [null, ""] } },
    { projection: { code: 1, plate_no: 1, brand: 1, plant: 1 } },
  )
  .limit(400)
  .toArray();

console.log(
  `อ่านของจริงมาแล้ว — ใบสมัคร ${apps.length} · พจส. ${drivers.length} · รถ ${vehicles.length}`,
);

/**
 * ครูฝึกมาจากคนที่ **เริ่มงานนานที่สุด** ในชุดที่อ่านมา — ไม่ได้สุ่มล้วน
 * เพราะครูฝึกในชีวิตจริงคือคนเก่าที่คุมคนใหม่ ข้อมูลตัวอย่างจึงควรอ่านแล้วสมเหตุผล
 * (`startDate` เก็บเป็น `DD/MM/YYYY` จึงต้องกลับลำดับก่อนเทียบ)
 */
const toSortable = (s) => {
  const m = String(s ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}${m[2]}${m[1]}` : "9999";
};
const trainers = [...drivers]
  .sort((a, b) => toSortable(a.startDate).localeCompare(toSortable(b.startDate)))
  .slice(0, 8);

console.log(
  "ครูฝึกที่จะใช้:",
  trainers.map((t) => `${t.driverName} (${t.drivercode})`).join(" · "),
);

/* ------------------------------------------------------- ประกอบคำขอ */

const rnd = seeded(20260921);
const pick = (list, i) => list[i % list.length];

/** สถานะใบสมัครชุดเก่า → ชุดปัจจุบัน (ลอกจาก `LEGACY_STATUS` ใน `_lib/types.ts`) */
const LEGACY = {
  submitted: "pending_contact",
  screening: "pending_contact",
  interview: "interview_scheduled",
  road_test: "interview_waiting",
  offer: "interview_passed",
  hired: "training",
  rejected: "cancelled",
  interview_failed: "cancelled",
  withdrawn: "cancelled",
};
const statusOf = (raw) => LEGACY[raw] ?? raw ?? "pending_contact";

const now = new Date().toISOString();
const requester = { employeeId: "HRSVC-DESK", name: "ระบบ (ข้อมูลตัวอย่าง)" };

/** ตัวนับแยกตามเดือนของ **วันที่แจ้ง** — เลขที่คำขอจึงอ่านแล้วตรงกับเดือนที่แจ้งจริง */
const monthSeq = new Map();

const docs = apps.map((app, i) => {
  const appStatus = statusOf(app.status);
  const linkable = appStatus === "interview_passed" || appStatus === "training";

  /* อัตราถูกแจ้งก่อนผู้สมัครยื่นใบเสมอ — 5 ถึง 40 วันก่อน · ใบท้าย ๆ ถูกดันให้
     ค้างนานเป็นพิเศษ เพื่อให้การ์ด “ค้างเกิน 30 วัน” มีของให้นับตั้งแต่เปิดหน้า */
  const lead = 5 + Math.floor(rnd() * 20) + (i >= apps.length - 4 ? 25 : 0);
  const requestedOn = daysBefore((app.createdAt ?? now).slice(0, 10), lead);

  const yymm = requestedOn.slice(2, 4) + requestedOn.slice(5, 7);
  const seq = (monthSeq.get(yymm) ?? 0) + 1;
  monthSeq.set(yymm, seq);

  const vehicle = vehicles.length ? pick(vehicles, i * 7 + 3) : null;
  const position = pick(POSITIONS, i);

  /* สลับ “แทนคนเดิม” กับ “อัตราใหม่” ประมาณสองต่อหนึ่ง — ของจริงส่วนใหญ่
     เป็นการหาคนมาแทนคนที่ออกไป ไม่ใช่การเปิดอัตราใหม่ */
  const replacing = i % 3 !== 2;
  const replaced = pick(drivers, i * 13 + 5);

  /* ครูฝึกถูกระบุตั้งแต่ตอนแจ้งสำหรับใบที่เดินไปไกลแล้ว ส่วนอัตราที่เพิ่งเปิด
     ปล่อยว่างไว้บ้าง — หน้าจอจะได้เห็นทั้งชิป “+ ระบุครูฝึก” และชื่อจริง */
  const trainer = linkable || i % 3 === 0 ? pick(trainers, i * 3 + 1) : null;

  /* สองใบที่ผู้สมัครยกเลิกไปแล้ว ทำเป็นคำขอที่ถูกยกเลิกด้วย — จะได้มีแถวสถานะ
     “ยกเลิกคำขอ” ให้เห็น · ที่เหลือยังเปิดรับอยู่ตามปกติ */
  const cancelled = appStatus === "cancelled" && i % 2 === 1;

  const status = cancelled
    ? "cancelled"
    : appStatus === "training"
      ? "filled"
      : linkable
        ? "matched"
        : "open";

  const linkedAt = daysBefore(ymd(now), 3 + (i % 5));

  return {
    code: `RQ${yymm}-${String(seq).padStart(3, "0")}`,
    requestedOn,

    position,
    positionOther: "",
    customer: pick(CUSTOMERS, i),
    customerOther: "",
    plant: vehicle?.plant?.trim() || "ลาดกระบัง",

    hireType: replacing ? "replace" : "new_rate",
    replace: replacing
      ? {
          drivercode: replaced.drivercode,
          name: (replaced.driverName ?? "").trim(),
          reason: pick(REPLACE_REASONS, i).code,
          reasonLabel: pick(REPLACE_REASONS, i).label,
          reasonNote: "",
        }
      : null,

    vehicle: vehicle
      ? {
          code: (vehicle.code ?? "").trim(),
          plateNo: (vehicle.plate_no ?? "").trim(),
          brand: (vehicle.brand ?? "").trim(),
        }
      : null,

    trainer: trainer
      ? { drivercode: trainer.drivercode, name: (trainer.driverName ?? "").trim() }
      : null,

    status,
    cancelReason: cancelled ? pick(CANCEL_REASONS, i) : "",
    filledOn: status === "filled" ? linkedAt : "",

    /* ผูกเฉพาะใบที่ผูกได้จริงตามกฎของระบบ (`LINKABLE_STATUSES`) — ใบที่ยัง
       ไม่ผ่านสัมภาษณ์ผูกไม่ได้ เซิร์ฟเวอร์ก็ปฏิเสธอยู่แล้ว ข้อมูลตัวอย่างจึง
       ต้องไม่ฝืนกฎนั้น ไม่งั้นหน้าจอจะโชว์สภาพที่ระบบสร้างเองไม่ได้ */
    match:
      linkable && !cancelled
        ? {
            applicationId: app._id.toHexString(),
            ref: app.ref ?? "",
            fullName: (app.fullName ?? "").trim() || (app.ref ?? ""),
            linkedAt,
            linkedBy: requester.name,
          }
        : null,

    /* ว่างทุกใบโดยตั้งใจ — รหัส พจส. ของผู้สมัครที่เพิ่งเริ่มฝึกมาจาก ATMS
       ซึ่งยังไม่มีในตัวอย่าง · ใบที่ `filled` จึงไปโผล่ในแถบ “รอขึ้นทะเบียน”
       ของหน้าติดตามฝึกงานเมื่อทำรอบสอง (ดู `.claude/docs/requisitions.md`) */
    drivercode: "",

    note: "",
    requester,
    history: [
      {
        at: `${requestedOn}T02:00:00.000Z`,
        by: requester.name,
        from: null,
        to: "open",
        note: "แจ้งขอสรรหา",
      },
      ...(status === "open"
        ? []
        : [
            {
              at: `${linkedAt}T03:00:00.000Z`,
              by: requester.name,
              from: "open",
              to: status,
              note:
                status === "cancelled"
                  ? "ยกเลิกคำขอ"
                  : `ผูกผู้สมัคร ${(app.fullName ?? "").trim()}`,
            },
          ]),
    ],
    createdAt: `${requestedOn}T02:00:00.000Z`,
    updatedAt: now,
    sample: true,
  };
});

await col.insertMany(docs);

/* ดันตัวนับของทุกเดือนที่ใช้ไป ให้สูงกว่าเลขสุดท้ายที่ใส่ลงไป — คำขอจริงใบถัดไป
   จะได้ไม่ชนกับตัวอย่าง (ดัชนี `code_unique` จะปฏิเสธและผู้ใช้จะบันทึกไม่ได้) */
for (const [yymm, seq] of monthSeq) {
  await db
    .collection(COUNTERS)
    .updateOne(
      { _id: `requisitions:${yymm}` },
      { $max: { seq } },
      { upsert: true },
    );
}

/* ------------------------------------------------------------ สรุปผล */

const tally = docs.reduce((acc, d) => {
  acc[d.status] = (acc[d.status] ?? 0) + 1;
  return acc;
}, {});

console.log(`\nใส่คำขอสรรหาตัวอย่าง ${docs.length} ใบแล้ว (เท่ากับจำนวนผู้สมัคร)`);
console.log("แยกตามสถานะ:", tally);
console.log("ตัวนับรายเดือนที่ดันไว้:", Object.fromEntries(monthSeq));

console.log("\nตัวอย่างที่ได้:");
for (const d of docs.slice(0, 8)) {
  console.log(
    `  ${d.code}  ${d.requestedOn}  ${d.customer.padEnd(6)} ${d.position.padEnd(5)}` +
      `  ${d.status.padEnd(9)}  ครูฝึก ${d.trainer?.name ?? "—"}` +
      `  ผู้สมัคร ${d.match ? `${d.match.fullName} (${d.match.ref})` : "—"}`,
  );
}

await client.close();
