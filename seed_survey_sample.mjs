/**
 * ใส่ข้อมูลตัวอย่างแบบสอบถามปีใหม่ 50 คน ลง hr_service."newyear-survey"
 *
 *   node seed_survey_sample.mjs          → ล้างของเดิมแล้วใส่ใหม่ 50 คน
 *   node seed_survey_sample.mjs --clean  → ลบเฉพาะข้อมูลตัวอย่าง (drivercode ขึ้นต้น SAMPLE) *
 * ⚠️ เขียนได้เฉพาะ `hr_service_dev` — ใส่ `--db hr_service_dev` (หรือ `MONGO_DB=hr_service_dev`)
 *    จะลงฐานจริงต้องใส่ `--force` เอง (ดู `seedTargetDb()` ใน `db_env.mjs`)
 *    `newyear-survey` บนฐานจริงเป็นของ ncacdb (ระบบอื่นเขียน) — `--force` ลงฐานจริงแปลว่าทับข้อมูลของเขา
 *
 * **ตัวเลือกคำตอบอ่านจากไฟล์ฟอร์มจริง** (`mena-go-lb/src/pages/newyear-survey.jsx`)
 * ไม่ได้ก๊อปมาแปะไว้ที่นี่ — แก้ข้อความตัวเลือกในฟอร์มเมื่อไหร่ ข้อมูลตัวอย่างตามทันที
 * ไม่มีทางเหลือคำตอบเวอร์ชันเก่าค้างอยู่ในฐานข้อมูล
 *
 * น้ำหนักการสุ่มอ้างอิง **ตำแหน่งของตัวเลือก** ไม่ใช่ข้อความ — เปลี่ยนคำพูดแล้วยังใช้ได้
 * สุ่มด้วย seed คงที่ รันซ้ำได้ผลเดิม
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";

import { loadEnv, seedTargetDb } from "./db_env.mjs";
import { HR } from "./lib/db/registry.mjs";

/* ---------------------------------------------------------------- env */

const env = loadEnv();
/* หยุดก่อนต่อฐานถ้าไม่ใช่ฐานทดลอง — ฐานจริง `newyear-survey` เป็นของ ncacdb ห้ามทับโดยไม่ตั้งใจ */
const dbName = seedTargetDb(env);

const client = new MongoClient(env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
await client.connect();
const col = client.db(dbName).collection(HR.newyearSurvey.name);

if (process.argv.includes("--clean")) {
  const r = await col.deleteMany({ drivercode: { $regex: "^SAMPLE" } });
  console.log("ลบข้อมูลตัวอย่าง:", r.deletedCount, "· เหลือทั้งหมด:", await col.countDocuments({}));
  await client.close();
  process.exit(0);
}

/* ---------------------------------------------------------------- อ่านชุดคำถามจากฟอร์มจริง */

/* `fileURLToPath` ไม่ใช่ `url.pathname` — โฟลเดอร์ชื่อ "project 2026" มีช่องว่าง
   ซึ่งใน URL เป็น `%20` แล้ว `fs` เปิดไม่เจอ */
const FORM_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../mena-go-lb/src/pages/newyear-survey.jsx",
);

function loadQuestions() {
  const src = fs.readFileSync(FORM_FILE, "utf8");
  const start = src.indexOf("const SECTIONS = [");
  const end = src.indexOf("\n];", start);
  if (start < 0 || end < 0) throw new Error(`อ่าน SECTIONS จาก ${FORM_FILE} ไม่ได้`);

  // ตัวอาร์เรย์มีแค่ string/number/boolean + ชื่อไอคอน + `showIf: isAttending`
  // จึงประเมินได้ตรง ๆ โดยยัด stub เข้าไปแทนของที่ import มาจริง
  const body = src.slice(start, end + 3);
  const build = new Function(
    "NOT_ATTENDING",
    "isAttending",
    "Bus",
    "Info",
    "Utensils",
    "Gift",
    "Heart",
    `${body}\nreturn SECTIONS;`,
  );
  const sections = build("ไม่สะดวกมาร่วมงาน", () => true, 0, 0, 0, 0, 0);

  const questions = {};
  for (const s of sections) for (const q of s.questions) questions[q.id] = q;
  return questions;
}

const Q = loadQuestions();
const opts = (id) => Q[id].options;
const NOT_ATTENDING = Q.q3.options[Q.q3.options.length - 1];

/* ---------------------------------------------------------------- สุ่มแบบ seed คงที่ */

let seed = 20570128;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

/** เลือกตามน้ำหนักที่อ้างอิง "ตำแหน่ง" ของตัวเลือก — เปลี่ยนข้อความแล้วยังใช้ได้ */
const byWeight = (id, weights) => {
  const list = opts(id);
  const w = list.map((_, i) => weights[i] ?? 1);
  const total = w.reduce((s, n) => s + n, 0);
  let t = rnd() * total;
  for (let i = 0; i < list.length; i += 1) {
    t -= w[i];
    if (t <= 0) return list[i];
  }
  return list[list.length - 1];
};

const pickSome = (list, n) => [...list].sort(() => rnd() - 0.5).slice(0, n);
const pickOne = (list) => list[Math.floor(rnd() * list.length)];

/* ---------------------------------------------------------------- ข้อมูลอ้างอิง */

const FIRST = ["สมชาย", "ประยุทธ", "วิชัย", "อนุชา", "สมศักดิ์", "ธนากร", "บุญมี", "เอกชัย", "ไพโรจน์", "สุรชัย", "มานพ", "จักรกฤษณ์", "พิชัย", "ทองสุข", "ณรงค์", "สมพงษ์", "อดิศักดิ์", "วีระ", "ชาญณรงค์", "ปรีชา", "สุพจน์", "กิตติศักดิ์", "รังสรรค์", "ทวีศักดิ์", "นิรันดร์"];
const LAST = ["ใจดี", "แสงทอง", "ศรีสุข", "พันธุ์ดี", "บุญเรือง", "ทองคำ", "วงศ์สุวรรณ", "มั่นคง", "สอนดี", "รักไทย", "เพชรงาม", "อินทร์ทอง", "จันทร์เพ็ญ", "สายทอง", "ดวงแก้ว", "พรมมา", "คำแสน", "นาคสุข", "โพธิ์ทอง", "บัวศรี"];

const PLANTS = [
  { name: "หัวหมาก", code: "SU46", customer: "บริษัท เอเซียผลิตภัณฑ์ซีเมนต์ จำกัด", weight: 26 },
  { name: "ลาดกระบัง", code: "SU12", customer: "บริษัท เอเซียผลิตภัณฑ์ซีเมนต์ จำกัด", weight: 24 },
  { name: "สระบุรี", code: "IN08", customer: "บริษัท ปูนซีเมนต์นครหลวง จำกัด", weight: 20 },
  { name: "บางนา", code: "CP21", customer: "บริษัท ผลิตภัณฑ์และวัตถุก่อสร้าง จำกัด", weight: 18 },
  { name: "รังสิต", code: "CP34", customer: "บริษัท ผลิตภัณฑ์และวัตถุก่อสร้าง จำกัด", weight: 12 },
];

const pickPlant = () => {
  const total = PLANTS.reduce((s, p) => s + p.weight, 0);
  let t = rnd() * total;
  for (const p of PLANTS) {
    t -= p.weight;
    if (t <= 0) return p;
  }
  return PLANTS[PLANTS.length - 1];
};

/** น้ำหนักตามตำแหน่งตัวเลือก — ให้กราฟมีรูปทรง ไม่ใช่แท่งเท่ากันหมด */
const W = {
  q1: [8, 22, 24, 28, 18],
  q2: [16, 14, 34, 20, 8, 4, 4],
  q3: [26, 18, 8, 34, 14],
  q4: [24, 26, 30, 10, 10],
  q5: [46, 34, 20],
  q8: [62, 38],
  q9: [32, 68],
  q10: [32, 38, 8, 22],
  q11: [30, 28, 32, 10],
  q12: [76, 12, 8],
  q16: [42, 18, 28, 12],
  q17: [16, 18, 22, 30, 14],
  q18: [26, 38, 18, 18],
  q20: [34, 66],
};

const ALLERGY = ["แพ้อาหารทะเล", "แพ้ถั่ว", "แพ้กุ้ง ปู"];
const OTHER_REASON = ["รถเสีย ต้องซ่อม", "มีธุระที่บ้านต่างจังหวัด"];
const NOTES = [
  "อยากให้จัดวันเสาร์ครับ วันอาทิตย์ต้องเตรียมตัวทำงานวันจันทร์",
  "ขอรถรับส่งจากแพล้นท์ด้วยครับ จะได้พาครอบครัวมาสะดวก",
  "อาหารขอเผ็ดน้อยหน่อย มีเด็กมาด้วยครับ",
  "อยากให้มีของที่ระลึกให้ทุกคนที่มาร่วมงานครับ",
  "ขอบคุณบริษัทที่จัดงานให้ทุกปีครับ",
  "อยากให้เริ่มงานเร็วหน่อย จะได้กลับบ้านไม่ดึกครับ",
  "ปีที่แล้วเสียงดังไปหน่อย คุยกันไม่ค่อยรู้เรื่องครับ",
  "อยากให้มีมุมถ่ายรูปให้ครอบครัวครับ",
  "ขอที่จอดรถเยอะ ๆ ครับ ปีที่แล้วหาที่จอดยาก",
  "อยากให้ผู้บริหารลงมาคุยกับพวกเราบ้างครับ",
  "จัดใกล้แพล้นท์จะดีมากครับ เดินทางง่าย",
  "ของรางวัลอยากให้เป็นของใช้ในบ้านครับ ได้ใช้จริง",
];

const q = (id, type, value, extra = {}) => ({
  id,
  no: Q[id].no,
  section_id: "s",
  section: "s",
  question: Q[id].label,
  type,
  value,
  other: null,
  ...extra,
});

/* ---------------------------------------------------------------- สร้างเอกสาร */

const docs = [];
for (let i = 0; i < 50; i += 1) {
  const plant = pickPlant();
  const q3 = byWeight("q3", W.q3);
  const absent = q3 === NOT_ATTENDING;

  // กระจาย 12 วัน แบบเข้ามาถี่ช่วงแรกแล้วค่อยเบาลง — เส้นสะสมจะได้โค้งจริง
  const day = 17 + Math.floor(Math.pow(rnd(), 1.7) * 12);
  const at = new Date(Date.UTC(2026, 7, day, 1 + Math.floor(rnd() * 12), Math.floor(rnd() * 60)));

  const detail = [
    q("q1", "choice", byWeight("q1", W.q1)),
    q("q2", "choice", byWeight("q2", W.q2)),
    q("q3", "choice", q3),
  ];

  if (absent) {
    const reasons = pickSome(opts("q6"), 1 + Math.round(rnd()));
    const withOther = rnd() < 0.2;
    detail.push(
      q("q6", "checkbox", withOther ? [reasons[0], Q.q6.otherLabel] : reasons, {
        other: withOther ? pickOne(OTHER_REASON) : null,
      }),
    );
  } else {
    const ranked = pickSome(Q.q7.rows, Q.q7.rows.length);
    const q12 = rnd() < 0.04 ? Q.q12.otherLabel : byWeight("q12", W.q12);
    detail.push(
      q("q4", "choice", byWeight("q4", W.q4)),
      q("q5", "choice", byWeight("q5", W.q5)),
      q("q7", "rank", Object.fromEntries(ranked.map((r, n) => [r, n + 1])), { ranked }),
      q("q8", "choice", byWeight("q8", W.q8)),
      q("q9", "choice", byWeight("q9", W.q9)),
      q("q10", "choice", byWeight("q10", W.q10)),
      q("q11", "choice", byWeight("q11", W.q11)),
      q12 === Q.q12.otherLabel
        ? q("q12", "choice", q12, { other: pickOne(ALLERGY) })
        : q("q12", "choice", q12),
      q("q13", "checkbox", pickSome(opts("q13"), Q.q13.max)),
      q("q14", "checkbox", pickSome(opts("q14"), Q.q14.max)),
      q("q15", "checkbox", pickSome(opts("q15"), Q.q15.max)),
      q("q16", "choice", byWeight("q16", W.q16)),
      q("q17", "choice", byWeight("q17", W.q17)),
    );
  }

  detail.push(
    q("q18", "choice", byWeight("q18", W.q18)),
    q("q19", "paragraph", rnd() < 0.42 ? pickOne(NOTES) : ""),
    q("q20", "choice", byWeight("q20", W.q20)),
  );

  docs.push({
    survey_id: "newyear-2570-mixer",
    survey_version: 1,
    survey_title: "แบบสำรวจเสียงพจส. รถมิกเซอร์ งานปีใหม่ 2570",
    drivercode: `SAMPLE${String(i + 1).padStart(3, "0")}`,
    driver_name: `${pickOne(FIRST)} ${pickOne(LAST)}`,
    plant: plant.name,
    customer: plant.customer,
    // ฟิลด์ที่ ncacdb เติมจาก masterdrivers ให้เอกสารจริง — ใส่ให้ตรงรูปกัน
    plant_name: plant.name,
    plant_code: plant.code,
    client_name: plant.customer,
    truckplate: `${70 + Math.floor(rnd() * 9)}-${1000 + Math.floor(rnd() * 8999)}`,
    line_user_id: null,
    attending: !absent,
    path: absent ? ["s1", "s2", "s5"] : ["s1", "s3", "s4", "s5"],
    answers: Object.fromEntries(
      detail.map((d) => [d.question, d.ranked ?? (Array.isArray(d.value) ? d.value : d.value)]),
    ),
    answers_detail: detail,
    answered_count: detail.filter((d) => d.value !== "" && d.value != null).length,
    started_at: new Date(at.getTime() - (90 + Math.floor(rnd() * 180)) * 1000),
    submitted_at: at,
    duration_seconds: 90 + Math.floor(rnd() * 180),
    client: "mena-go-lb",
    created_at: at,
    updated_at: at,
  });
}

/* ---------------------------------------------------------------- เขียนลงฐานข้อมูล */

const removed = await col.deleteMany({ drivercode: { $regex: "^SAMPLE" } });
await col.insertMany(docs);

const attending = docs.filter((d) => d.attending).length;
console.log(`ล้างของเดิม ${removed.deletedCount} · ใส่ใหม่ ${docs.length} คน (มา ${attending} · ไม่สะดวก ${docs.length - attending})`);
console.log("ตัวเลือกที่ใช้ อ่านจาก:", path.relative(process.cwd(), FORM_FILE));
console.log("ตัวอย่าง ข้อ 8 :", opts("q8").join("  |  "));
console.log("ตัวอย่าง ข้อ 9 :", opts("q9").join("  |  "));
console.log("เอกสารทั้งหมดใน newyear-survey:", await col.countDocuments({}));
await client.close();
