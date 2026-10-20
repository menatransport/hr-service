/**
 * นำเข้าไฟล์ Onboarding ของฝ่ายบุคคล (`Onboarding_Mixer_Drivers_2026_Redesigned.xlsx` ชีต “พนักงานใหม่”)
 * เป็น**คำขอสรรหา 1 ใบต่อ 1 คน** พร้อมข้อมูล 5 ฝ่ายใน `onboarding` — ดู `.claude/docs/onboarding.md`
 *
 *   node import_onboarding_xlsx.mjs [ไฟล์]            → ลองอ่านเฉย ๆ (dry run) พิมพ์สรุป ไม่เขียนอะไร
 *   node import_onboarding_xlsx.mjs [ไฟล์] --apply    → เขียนจริง (ข้ามแถวที่เคยนำเข้าแล้ว)
 *   node import_onboarding_xlsx.mjs --clean --apply   → ลบเฉพาะคำขอที่นำเข้าจากไฟล์นี้
 *   --db <name>                                       → ปลายทางอื่น (ค่าตั้งต้น = MONGO_DB ของแอป)
 *
 * - เลขที่คำขอจองผ่าน `recruitment_counters` (`requisitions:<yymm>`) ตามเดือนของ “วันที่แจ้ง”
 *   — เลขของใบที่แจ้งผ่านระบบทีหลังจึงไม่ชนกับชุดนี้
 * - กันซ้ำด้วย `import.key` (ชื่อ + วันที่แจ้ง + วันเริ่มฝึก) · ลบทิ้งได้ทั้งชุดด้วย `import.source`
 * - ครูฝึก/รหัส พจส. เทียบกับ `master_driver` · รถเทียบกับ `Boom_ETL.vehicles` (**อ่านอย่างเดียว**)
 *   เจอ = เก็บรหัส/ยี่ห้อจริง ไม่เจอ = เก็บค่าตามไฟล์ (ครูฝึกที่ไม่มีรหัสยังขึ้นชื่อได้)
 * - ค่าในช่องตัวเลือกที่ไม่ตรงกับตัวเลือกของระบบ ถูกย้ายไปต่อท้ายช่องหมายเหตุของฝ่ายนั้น ไม่ทิ้ง
 */
import os from "node:os";
import path from "node:path";

import ExcelJS from "exceljs";
import { MongoClient } from "mongodb";

import { hrDbName, loadEnv } from "./db_env.mjs";
import { DB, ETL, HR } from "./lib/db/registry.mjs";

const SOURCE = "onboarding-xlsx-2026";
const BY = "นำเข้าจาก Excel";
const SHEET = "พนักงานใหม่";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const CLEAN = argv.includes("--clean");
const dbArg = (() => {
  const i = argv.indexOf("--db");
  return i >= 0 ? argv[i + 1] : undefined;
})();
const file =
  argv.find((a) => a.toLowerCase().endsWith(".xlsx")) ??
  path.join(os.homedir(), "Desktop", "Onboarding_Mixer_Drivers_2026_Redesigned.xlsx");

/* ---------------------------------------------------------------- ค่าในเซลล์ */

/** exceljs คืนได้หลายรูป (สูตร · rich text · ลิงก์) — แปลงเหลือค่าเดียว */
function raw(cell) {
  const v = cell?.value;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return v.result ?? null;
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return v.text;
    return null;
  }
  return v;
}

const str = (v) => (v === null || v === undefined ? "" : v instanceof Date ? iso(v) : String(v).trim());

/** วันที่ในไฟล์เป็นเที่ยงคืน UTC (exceljs) — อ่านด้วยส่วน UTC ตรง ๆ */
function iso(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

const dateOf = (v) => (v instanceof Date ? iso(v) : "");
const clip = (s, max) => (s.length > max ? s.slice(0, max) : s);
const squash = (s) => s.replace(/\s+/g, " ").trim();

/* ---------------------------------------------------------- แปลงเป็นค่าระบบ */

/** ป้ายสถานะในไฟล์ → รหัสใน `OUTCOMES` (`_lib/requisitions/onboarding.ts`) */
const OUTCOME = {
  รอฝึกงาน: "waiting_training",
  ฝึกงาน: "training",
  รอรับรถ: "waiting_handover",
  สแปร์โซน: "spare_zone",
  รับรถแล้ว: "handed_over",
  ยกเลิกฝึกงาน: "cancelled_training",
  สละสิทธิ์: "waived",
  ยกเลิกสรรหา: "cancelled_recruit",
  ลาออก: "resigned",
  "ฝึกงาน 1-2 วัน(พ้นสภาพ)": "trial_exit",
  ปลด: "dismissed",
  ออก: "left",
};
const WITHDRAWN = new Set(["cancelled_training", "waived", "cancelled_recruit"]);

/** ลูกค้าในไฟล์ → `CUSTOMERS` ของคำขอ · “… MS” คือสัญญารถเล็ก ตำแหน่งบอกอยู่แล้ว (MS) */
const CUSTOMER = {
  asia: "Asia",
  scco: "SCCO",
  cpac: "Cpac",
  kpac: "Kpac",
  umo: "UMO",
  fast: "Fast",
  acon: "Acon",
  tn: "TN",
  "rp concrete": "RP Concreate",
  "หจก.จิรโชติ": "หจก.จิรโชติ",
};

function customerOf(text) {
  const base = text.replace(/\s+MS$/i, "").trim().toLowerCase();
  if (!base) return { customer: "other", customerOther: "ไม่ระบุ" };
  const hit = CUSTOMER[base];
  return hit ? { customer: hit, customerOther: "" } : { customer: "other", customerOther: text };
}

function positionOf(text, customerText) {
  const t = text.toLowerCase();
  if (t === "mixer l") return { position: "ML", positionOther: "" };
  if (t === "mixer s") return { position: "MS", positionOther: "" };
  if (t === "spare driver") return { position: "spare", positionOther: "" };
  if (/\sMS$/i.test(customerText)) return { position: "MS", positionOther: "" };
  return { position: "other", positionOther: text || "ไม่ระบุ" };
}

/** ตัวเลือกของแต่ละช่อง — ต้องตรงกับ `SECTION_SPECS` ไม่งั้นแก้ฟอร์มนั้นต่อไม่ได้ */
const OPTIONS = {
  day1: ["ผ่าน", "ไม่ตรวจ", "ไม่มาฝึกงาน", "ไม่ผ่าน สารเสพติด", "ไม่ผ่าน แอลกอฮอล์"],
  day4: ["ผ่าน ฝึกงานต่อ", "ผ่าน พร้อมรับรถ", "ไม่ผ่าน ฝึกงาน", "ไม่มาฝึกงาน", "ไม่ผ่าน สารเสพติด", "ไม่ผ่าน แอลกอฮอล์", "ลาออก"],
  day8: ["ผ่านฝึกงาน พร้อมรับรถ", "ฝึกงานต่อ", "ไม่ผ่าน ฝึกงาน", "ไม่มาฝึกงาน", "ไม่ผ่าน สารเสพติด", "ไม่ผ่าน แอลกอฮอล์", "ลาออก"],
  readiness: ["พร้อมรับรถ", "ฝึกงานต่อ", "พฤติกรรมไม่ผ่าน", "ไม่ผ่าน"],
  coDriver: ["อบรม", "ไม่ต้องอบรม"],
  passFail: ["ผ่าน", "ไม่ผ่าน"],
  handover: ["ผ่าน", "ไม่ผ่าน กลับไปฝึกใหม่", "ไม่ผ่าน ปลด"],
  fleet: ["รถพร้อมปล่อย", "รถไม่พร้อมปล่อย", "รอ QC"],
};
/** ค่าในไฟล์ที่สะกดต่างจากตัวเลือก แต่หมายถึงตัวเดียวกัน */
const ALIAS = { ฝึกงาน: "ฝึกงานต่อ" };

/**
 * เก็บค่าที่ตรงตัวเลือก — ไม่ตรงคืน `""` แล้วฝากค่าเดิมไว้ใน `spill` เพื่อต่อท้ายหมายเหตุ
 * (ไม่ทิ้งข้อมูลของฝ่ายนั้นเงียบ ๆ)
 */
function pick(value, list, label, spill) {
  const v = ALIAS[value] && list.includes(ALIAS[value]) ? ALIAS[value] : value;
  if (!v) return "";
  if (list.includes(v)) return v;
  spill.push(`${label}: ${value}`);
  return "";
}

/** ทิ้งช่องว่าง · ไม่มีอะไรเหลือ = ไม่มีส่วนนี้เลย */
function section(values, now) {
  const kept = Object.fromEntries(Object.entries(values).filter(([, v]) => v));
  return Object.keys(kept).length ? { values: kept, updatedAt: now, updatedBy: BY } : undefined;
}

/* -------------------------------------------------------------------- main */

const env = loadEnv();
const target = dbArg || hrDbName(env);
console.log(`ปลายทาง: database "${target}" · ${APPLY ? "เขียนจริง" : "dry run (ใส่ --apply เพื่อเขียน)"}`);

const client = new MongoClient(env.MONGO_URI);
await client.connect();
const db = client.db(target);
const requests = db.collection(HR.requisitions.name);
const counters = db.collection(HR.recruitmentCounters.name);

try {
  if (CLEAN) {
    const n = await requests.countDocuments({ "import.source": SOURCE });
    console.log(`คำขอที่นำเข้าจากไฟล์นี้: ${n} ใบ`);
    if (APPLY) {
      const { deletedCount } = await requests.deleteMany({ "import.source": SOURCE });
      console.log(`ลบแล้ว ${deletedCount} ใบ (ตัวนับเลขที่ไม่ถอย — เลขที่ไม่ถูกใช้ซ้ำ)`);
    }
    process.exit(0);
  }

  console.log(`อ่านไฟล์: ${file}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet(SHEET);
  if (!ws) throw new Error(`ไม่พบชีต “${SHEET}”`);

  /* ---- ทะเบียน พจส. (ชื่อ → รหัส) + รถ — อ่านครั้งเดียว */
  const drivers = await db
    .collection(HR.drivers.name)
    .find({}, { projection: { drivercode: 1, driverName: 1, active: 1 } })
    .toArray();
  const codes = new Set(drivers.map((d) => String(d.drivercode ?? "").trim()));
  const byName = new Map();
  for (const d of drivers) {
    const key = squash(String(d.driverName ?? ""));
    if (!key) continue;
    /* ชื่อซ้ำ — เลือกคนที่ยังทำงานอยู่ก่อน */
    if (!byName.has(key) || (d.active !== false && byName.get(key).active === false)) byName.set(key, d);
  }
  const vehicles = await client
    .db(DB.etl)
    .collection(ETL.vehicles)
    .find({}, { projection: { code: 1, plate_no: 1, brand: 1 } })
    .toArray();
  const vByCode = new Map(vehicles.map((v) => [String(v.code ?? "").trim(), v]));
  const vByPlate = new Map(vehicles.map((v) => [String(v.plate_no ?? "").trim(), v]));

  const existing = new Set(
    (await requests.find({ "import.source": SOURCE }, { projection: { "import.key": 1 } }).toArray()).map(
      (d) => d.import?.key,
    ),
  );

  const now = new Date().toISOString();
  const docs = [];
  const seenKeys = new Map();
  const stat = { rows: 0, skipped: 0, trainerHit: 0, trainerMiss: 0, codeHit: 0, codeMiss: [], vehicleHit: 0, vehicleMiss: 0, spill: 0 };

  ws.eachRow({ includeEmpty: false }, (row, r) => {
    if (r < 4) return;
    const c = (i) => raw(row.getCell(i));
    const s = (i) => str(c(i));
    const name = squash(s(7));
    if (!name) return;
    stat.rows++;

    const monthCell = c(2);
    const monthFirst =
      monthCell instanceof Date ? `2026-${String(monthCell.getUTCMonth() + 1).padStart(2, "0")}-01` : "";
    const notifiedOn = dateOf(c(3));
    const trainingStartOn = dateOf(c(5));
    const requestedOn = notifiedOn || trainingStartOn || monthFirst || now.slice(0, 10);

    let key = `${SOURCE}:${name}|${notifiedOn}|${trainingStartOn}`;
    const dup = (seenKeys.get(key) ?? 0) + 1;
    seenKeys.set(key, dup);
    if (dup > 1) key += `#${dup}`;
    if (existing.has(key)) {
      stat.skipped++;
      return;
    }

    /* ---- RC */
    const outcome = OUTCOME[s(12)] ?? "";
    const codeText = s(6);
    let drivercode = "";
    const rcSpill = [];
    if (/^\d{5,7}$/.test(codeText)) {
      if (codes.has(codeText)) {
        drivercode = codeText;
        stat.codeHit++;
      } else {
        stat.codeMiss.push(codeText);
        rcSpill.push(`รหัส พจส. ในไฟล์: ${codeText} (ไม่พบในทะเบียน)`);
      }
    } else if (codeText && codeText !== "สละสิทธิ์") rcSpill.push(`รหัส พจส.: ${codeText}`);
    if (s(12) && !outcome) rcSpill.push(`สถานะ พจส.: ${s(12)}`);

    /* ---- ครูฝึก + รถ (อยู่บนตัวคำขอ) */
    const trainerName = squash(s(16));
    const trainerDoc = trainerName ? byName.get(trainerName) : undefined;
    if (trainerName) {
      if (trainerDoc) stat.trainerHit++;
      else stat.trainerMiss++;
    }
    const trainer = trainerName
      ? { drivercode: trainerDoc ? String(trainerDoc.drivercode) : "", name: trainerDoc?.driverName?.trim() || trainerName }
      : null;

    const vCode = s(20);
    const vPlate = s(21);
    let vehicle = null;
    if (vCode || vPlate) {
      const v = vByCode.get(vCode) ?? vByPlate.get(vPlate);
      if (v) stat.vehicleHit++;
      else stat.vehicleMiss++;
      vehicle = {
        code: String(v?.code ?? vCode).trim(),
        plateNo: String(v?.plate_no ?? vPlate).trim(),
        brand: String(v?.brand ?? "").trim(),
      };
    }

    /* ---- KA */
    const kaSpill = [];
    const coDriverDateCell = c(23);
    if (coDriverDateCell && !(coDriverDateCell instanceof Date)) kaSpill.push(str(coDriverDateCell));
    const ka = {
      zone: s(14),
      kaName: s(15),
      trainerPhone: s(19),
      trainerCustomer: s(17),
      trainingSite: s(18),
      coDriver: pick(s(22), OPTIONS.coDriver, "ต้องอบรม Co-Driver", kaSpill),
      coDriverOn: dateOf(coDriverDateCell),
      coDriverResult: pick(s(24), OPTIONS.passFail, "ผล Co-Driver", kaSpill),
      coDriverNote: "",
    };
    ka.coDriverNote = clip([s(25), ...kaSpill].filter(Boolean).join(" · "), 120);

    /* ---- ER / ST & จป. */
    const erSpill = [];
    const er = {
      erName: s(26),
      assessedOn: dateOf(c(34)),
      day1: pick(s(27), OPTIONS.day1, "Day 1", erSpill),
      day1Note: clip(s(28), 1000),
      day4: pick(s(29), OPTIONS.day4, "Day 4", erSpill),
      day4Note: clip(s(30), 1000),
      day8: pick(s(31), OPTIONS.day8, "Day 8", erSpill),
      day8Note: clip(s(32), 1000),
      readiness: pick(s(33), OPTIONS.readiness, "สรุปความพร้อม", erSpill),
    };
    if (erSpill.length) er.day8Note = clip([er.day8Note, ...erSpill].filter(Boolean).join("\n"), 1000);

    /* ---- HRD */
    const hrd = {
      orientationOn: dateOf(c(35)),
      examScore: s(36),
      format: s(37),
      lecturer: s(38),
      note: clip(s(39), 1000),
    };

    /* ---- รับรถ */
    const hoSpill = [];
    const handover = {
      dueOn: dateOf(c(40)),
      handoverOn: dateOf(c(41)),
      result: pick(s(42), OPTIONS.handover, "ผลการรับรถ", hoSpill),
      note: "",
    };
    handover.note = clip([s(43), ...hoSpill].filter(Boolean).join(" · "), 1000);

    /* ---- ยานยนต์ */
    const flSpill = [];
    const fleet = {
      saName: s(45),
      readiness: pick(s(46), OPTIONS.fleet, "ความพร้อมรถ", flSpill),
      readyBy: dateOf(c(47)),
      notReadyReason: clip([s(48), ...flSpill].filter(Boolean).join(" · "), 1000),
      releaseIssue: clip(s(49), 1000),
    };

    const rc = {
      fullName: name,
      phone: s(8),
      notifiedOn,
      rcName: s(4),
      trainingStartOn,
      outcome,
      exitOn: dateOf(c(13)),
    };
    stat.spill += rcSpill.length + kaSpill.length + erSpill.length + hoSpill.length + flSpill.length;

    /* ---- สถานะคำขอ: สละสิทธิ์ก่อนเริ่ม = ยกเลิก · ยังไม่เริ่มฝึก = ได้ผู้สมัครแล้ว · ที่เหลือ = เริ่มฝึกงานแล้ว */
    const status = WITHDRAWN.has(outcome)
      ? "cancelled"
      : outcome === "waiting_training" || (!outcome && !trainingStartOn)
        ? "matched"
        : "filled";

    const onboarding = Object.fromEntries(
      Object.entries({ rc, ka, er, hrd, fleet, handover })
        .map(([k, v]) => [k, section(v, now)])
        .filter(([, v]) => v),
    );

    docs.push({
      requestedOn,
      ...positionOf(s(9), s(10)),
      ...customerOf(s(10)),
      plant: s(11),
      hireType: "unspecified",
      replace: null,
      vehicle,
      trainer,
      status,
      cancelReason: status === "cancelled" ? "candidate_withdrew" : "",
      filledOn: status === "filled" ? trainingStartOn || requestedOn : "",
      match: null,
      drivercode,
      onboarding,
      import: { source: SOURCE, key, row: r },
      note: rcSpill.join(" · "),
      requester: { employeeId: "", name: BY },
      history: [
        { at: now, by: BY, from: null, to: status, note: `นำเข้าจากไฟล์ Onboarding พจส. 2026 (แถว ${r})` },
      ],
      createdAt: now,
      updatedAt: now,
    });
  });

  /* ---- เลขที่คำขอ — เรียงตามวันที่แจ้งแล้วจองทีละเดือน */
  docs.sort((a, b) => a.requestedOn.localeCompare(b.requestedOn) || a.import.row - b.import.row);
  const byMonth = new Map();
  for (const d of docs) {
    const yymm = `${d.requestedOn.slice(2, 4)}${d.requestedOn.slice(5, 7)}`;
    byMonth.set(yymm, [...(byMonth.get(yymm) ?? []), d]);
  }

  const tally = (f) => docs.reduce((m, d) => m.set(f(d), (m.get(f(d)) ?? 0) + 1), new Map());
  console.log(`แถวที่มีชื่อ ${stat.rows} · นำเข้าแล้วก่อนหน้า (ข้าม) ${stat.skipped} · จะสร้างใหม่ ${docs.length}`);
  console.log("สถานะคำขอ:", Object.fromEntries(tally((d) => d.status)));
  console.log("ต่อเดือน:", Object.fromEntries([...byMonth].map(([k, v]) => [k, v.length])));
  console.log(`ครูฝึกเจอในทะเบียน ${stat.trainerHit} / ไม่เจอ ${stat.trainerMiss}`);
  console.log(`รหัส พจส. เจอ ${stat.codeHit} / ไม่เจอ ${stat.codeMiss.length}${stat.codeMiss.length ? ` (${stat.codeMiss.slice(0, 8).join(", ")}…)` : ""}`);
  console.log(`รถเจอใน Boom_ETL ${stat.vehicleHit} / ไม่เจอ ${stat.vehicleMiss} · ค่าที่ย้ายไปหมายเหตุ ${stat.spill}`);

  if (!APPLY || !docs.length) process.exit(0);

  for (const [yymm, list] of byMonth) {
    const counter = await counters.findOneAndUpdate(
      { _id: `requisitions:${yymm}` },
      { $inc: { seq: list.length } },
      { upsert: true, returnDocument: "after" },
    );
    const first = (counter?.seq ?? list.length) - list.length + 1;
    list.forEach((d, i) => {
      d.code = `RQ${yymm}-${String(first + i).padStart(3, "0")}`;
    });
  }

  const { insertedCount } = await requests.insertMany(docs, { ordered: false });
  console.log(`✔ สร้างคำขอแล้ว ${insertedCount} ใบ`);
} finally {
  await client.close();
}
