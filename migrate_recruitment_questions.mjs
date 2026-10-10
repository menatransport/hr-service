/**
 * ปรับคลังคำถามให้ตรงกับใบสมัครจาก Google Form (HR0221-04) ก่อนนำเข้าข้อมูลจริง
 *
 *   node migrate_recruitment_questions.mjs          → แสดงสิ่งที่จะเปลี่ยน ไม่เขียนอะไร
 *   node migrate_recruitment_questions.mjs --apply  → เขียนลง hr_service."recruitment_regist_question"
 *
 * ตัดสินใจร่วมกับเจ้าของงาน 29 ก.ย. 2026:
 * - **ลำดับและ `key` ของข้อเดิมไม่แตะเลย** — แก้เฉพาะถ้อยคำ ตัวเลือก ชนิด และเงื่อนไข
 * - ข้อคัดกรองที่ Google Form ถามแต่คลังคำถามไม่มี (11 ข้อที่ Driver Rating ใช้)
 *   เพิ่ม**ต่อท้ายหมวด** ตัวเลือกใช้ป้ายเดียวกับ `driver-rating.json` ทุกตัวอักษร
 *   ระบบจึงให้คะแนนจากคำตอบได้เองโดยไม่ต้องมี aliases
 *
 * รันซ้ำได้: ข้อที่แก้ไปแล้วจะไม่มี diff · ข้อใหม่ที่มีป้ายซ้ำอยู่แล้วจะถูกข้าม
 * ทุกข้อที่แก้ถูกเช็คก่อนว่ายังเป็นข้อเดิม (ป้ายตรงกับที่คาดไว้) ถ้าฝ่ายบุคคลแก้ไป
 * ก่อนแล้ว สคริปต์จะหยุดทั้งชุดแทนการเขียนทับ
 */
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";

import { hrDbName, loadEnv } from "./db_env.mjs";
import { HR } from "./lib/db/registry.mjs";

const env = loadEnv();

const QUESTIONS = HR.questions.name;
const BY = "ปรับตาม Google Form (HR0221-04)";
const apply = process.argv.includes("--apply");

const rating = JSON.parse(
  fs.readFileSync(new URL("app/recruitment/_lib/driver-rating.json", import.meta.url), "utf8"),
);
/** ตัวเลือกของข้อใหม่ = ป้ายคำตอบใน master เรียงคะแนนสูง→ต่ำ ตามที่ชีตเรียงไว้ */
const ratingOptions = (id) => {
  const q = rating.questions.find((x) => x.id === id);
  if (!q) throw new Error(`ไม่พบข้อ ${id} ใน driver-rating.json`);
  return q.answers.map((a, i) => ({ value: `o${i + 1}`, label: a.label }));
};

const ADDRESS_PLACEHOLDER = "เลขที่บ้าน , ถนน , หมู่ , ตำบล , อำเภอ , จังหวัด , ไปรษณีย์";

/* ------------------------------------------------------------ แก้ข้อเดิม */

/**
 * `expect` = ป้ายปัจจุบันที่ต้องเจอ — กันเขียนทับข้อที่มีคนแก้ไปก่อนแล้ว
 * `set` = ฟิลด์ที่จะเขียน (ไม่แตะ `key` / `section` / `order`)
 */
const EDITS = [
  {
    key: "q_9fa9fa22cc",
    expect: "ที่อยู่ตามทะเบียนบ้าน",
    why: "สะกด อำเภท → อำเภอ",
    set: { placeholder: ADDRESS_PLACEHOLDER },
  },
  {
    key: "home_province",
    expect: "ที่อยู่ปัจจุบัน",
    why: "ไม่บังคับ — Google Form ตอบแค่ 1,319 จาก 2,970 ใบ (กรอกเฉพาะคนที่ย้ายมา) + สะกด อำเภอ",
    set: {
      required: false,
      hint: "เว้นว่างได้ ถ้าอยู่ตามทะเบียนบ้าน · กรอกเมื่อย้ายมาอยู่ที่อื่น เช่น ชลบุรี / บางนา / บางจาก",
      placeholder: ADDRESS_PLACEHOLDER,
    },
  },
  {
    key: "q_8de24d29f0",
    expect: "คุณส่วนสูงเท่าไหร่",
    why: "บอกหน่วย — คำตอบเดิมพิมพ์ ซ.ม./ช.ม. ปนมาเยอะ",
    set: { hint: "หน่วยเป็นเซนติเมตร (ซม.)", placeholder: "170" },
  },
  {
    key: "q_db9c7c075d",
    expect: "คุณน้ำหนักเท่าไหร่",
    why: "ข้อความ → ตัวเลข ให้เหมือนข้อส่วนสูง + บอกหน่วย",
    set: { kind: "number", hint: "หน่วยเป็นกิโลกรัม (กก.)", placeholder: "65" },
  },
  {
    key: "q_90a852467e",
    expect: "คุณจบการศึกษาระดับใด",
    why: "เพิ่ม ปวช. / ปวส. (ราว 130 ใบใน Google Form)",
    set: {
      options: [
        { value: "o1", label: "ป.6" },
        { value: "o2", label: "ม.3" },
        { value: "o3", label: "ม.6" },
        { value: "o6", label: "ปวช." },
        { value: "o7", label: "ปวส." },
        { value: "o4", label: "ปริญญาตรี" },
        { value: "o5", label: "อื่นๆ" },
      ],
    },
  },
  {
    key: "q_101b2d7891",
    expect: "ความสัมพันธ์ (ผู้ติดต่อฉุกเฉิน) ลำดับที่ 1",
    why: "เพิ่ม สามี / แฟน / พี่/น้อง (ราว 390 ใบ)",
    set: {
      options: [
        { value: "o1", label: "บิดา" },
        { value: "o2", label: "มารดา" },
        { value: "o3", label: "ภรรยา" },
        { value: "o7", label: "สามี" },
        { value: "o8", label: "แฟน" },
        { value: "o4", label: "บุตร" },
        { value: "o9", label: "พี่/น้อง" },
        { value: "o5", label: "เพื่อน" },
        { value: "o6", label: "อื่นๆ" },
      ],
    },
  },
  {
    key: "accident_history",
    expect: "3 ปีที่ผ่านมาเคยเกิดอุบัติเหตุจากการขับรถไหม",
    why: "ถามตาม Google Form ข้อ [13] — 12 เดือน 5 ตัวเลือก ตรงกับ Driver Rating พอดี",
    set: {
      label: "ในช่วง 12 เดือนที่ผ่านมา คุณเคยเกิดอุบัติเหตุจากการขับรถหรือไม่",
      options: [
        { value: "none", label: "ไม่เคยเกิดอุบัติเหตุเลย" },
        { value: "minor", label: "เคยเกิดอุบัติเหตุเล็กน้อย (เช่น ถลอก บุบ ไม่รุนแรง) 1 ครั้ง" },
        { value: "minor_many", label: "เคยเกิดอุบัติเหตุเล็กน้อยมากกว่า 1 ครั้ง" },
        { value: "major", label: "เคยเกิดอุบัติเหตุรุนแรง 1 ครั้ง (มีผู้บาดเจ็บ/ทรัพย์สินเสียหาย)" },
        {
          value: "major_many",
          label: "เคยเกิดอุบัติเหตุรุนแรงมากกว่า 1 ครั้ง หรือเกิดจากความประมาท",
        },
      ],
    },
  },
  {
    key: "q_fa35c4e736",
    expect: "คุณสามารถขับรถประเภทไหนได้บ้าง",
    why: "เพิ่ม ขับรถน้ำมัน (241 ใบ)",
    set: {
      options: [
        { value: "o1", label: "ขับรถ 6 ล้อเล็ก" },
        { value: "o2", label: "ขับรถ 6 ล้อใหญ่" },
        { value: "o3", label: "ขับรถ 10 ล้อ" },
        { value: "o4", label: "ขับรถ 10 ล้อตู้เย็น" },
        { value: "o5", label: "ขับรถ 10 ล้อตู้แห้ง" },
        { value: "o6", label: "ขับรถเทรลเลอร์" },
        { value: "o7", label: "ขับรถโม่ปูน 6 ล้อ" },
        { value: "o8", label: "ขับรถโม่ปูน 10 ล้อ" },
        { value: "o9", label: "ขับรถ 12 ล้อ" },
        { value: "o10", label: "ขับรถ 18 ล้อ (พ่วง)" },
        { value: "o11", label: "ขับรถพ่วงเบ้าท์อาหารสัตว์" },
        { value: "o13", label: "ขับรถน้ำมัน" },
        { value: "o12", label: "อื่นๆ" },
      ],
    },
  },
  {
    key: "q_a9098272a7",
    expect: "คุณสามารถขับรถรุ่นอะไรบ้าง",
    why: "สะกด Nisson → Nissan",
    set: {
      options: [
        { value: "o1", label: "ฮีโน่ 500 (HINO 500)" },
        { value: "o2", label: "ฮีโน่ 500 วิคเตอร์ (HINO 500 VICTOR)" },
        { value: "o3", label: "อีซูซุ (ISUZU)" },
        { value: "o4", label: "อีซูซุ ISUZU 360" },
        { value: "o5", label: "นิสสัน Nissan UD" },
        { value: "o6", label: "นิสสัน Nissan UD Trucks (รุ่นใหม่)" },
        { value: "o7", label: "รถจีน FAW Sany Foton" },
        { value: "o8", label: "อื่นๆ" },
      ],
    },
  },
  {
    key: "q_d986afb10d",
    expect: "คุณสามารถขับรถประเภทเกียร์ low-high (เกียร์ต่ำ-เกียร์ดีด)  ได้หรือไม่",
    why: "ตัดช่องว่างซ้อน",
    set: { label: "คุณสามารถขับรถประเภทเกียร์ low-high (เกียร์ต่ำ-เกียร์ดีด) ได้หรือไม่" },
  },
  {
    key: "q_3ad480aaf5",
    expect: "คุณมีประสบการณ์ขับรถบรรทุก รวมทั้งหมดกี่ปี",
    why: "ขีดให้เหมือนกันทุกตัวเลือก (1–2 → 1-2)",
    set: {
      options: [
        { value: "o1", label: "มากกว่า 10 ปี" },
        { value: "o2", label: "5-10 ปี" },
        { value: "o3", label: "2-5 ปี" },
        { value: "o4", label: "1-2 ปี" },
        { value: "o5", label: "น้อยกว่า 1 ปี" },
      ],
    },
  },
  {
    key: "q_e4b18ec6a5",
    expect: "อะไรเป็นสาเหตุหลักที่ทำให้คุณลาออกจากงานเดิม",
    why: "สะกด สถานที → สถานที่ + เพิ่ม อื่นๆ (คำตอบเดิมไม่ตรงตัวเลือก 372 แบบ)",
    set: {
      options: [
        {
          value: "o1",
          label: "ย้ายที่พักหรือครอบครัว,กลับบ้านต่างจังหวัด,บริษัทย้ายสถานที่ทำงาน",
        },
        { value: "o2", label: "ค่าตอบแทนหรือสวัสดิการไม่เพียงพอ" },
        { value: "o3", label: "ความก้าวหน้าในสายงานหรือหัวหน้างาน" },
        { value: "o4", label: "ปัญหาวินัย, การทะเลาะกับเพื่อนร่วมงาน, หรือการขาดงานบ่อย" },
        { value: "o5", label: "ปัญหาสุขภาพ, อุบัติเหตุจากความประมาท" },
        { value: "o6", label: "อื่นๆ" },
      ],
    },
  },
  {
    key: "q_9fb7e98094",
    expect: "กรณีเพื่อนแนะนำเข้ามา โปรดระบุชื่อเพื่อน",
    why: "แสดงเฉพาะเมื่อตอบว่า “เพื่อนแนะนำมา” ในข้อทราบข่าว",
    set: { condition: { key: "q_555491b0ed", equals: ["o4"] } },
  },
  {
    key: "q_d2da8e4b5d",
    expect: "คุณต้องการ  ที่พักของบริษัท หรือไม่",
    why: "ตัดช่องว่างซ้อน",
    set: { label: "คุณต้องการที่พักของบริษัท หรือไม่" },
  },
  {
    key: "q_1891fa1206",
    expect: "คุณสามารถเริ่มงานได้วันที่เท่าไหร่",
    why: "ลบคำใบ้ให้พิมพ์วันที่ — ข้อนี้เลือกจากปฏิทินอยู่แล้ว",
    set: { hint: "" },
  },
  {
    key: "q_e1d004f0cb",
    expect: 'คุณใส่ "รองเท้าเซพตี้" เบอร์อะไร',
    why: "สะกด เซพตี้ → เซฟตี้",
    set: { label: 'คุณใส่ "รองเท้าเซฟตี้" เบอร์อะไร' },
  },
];

/* -------------------------------------------------------- ข้อใหม่ท้ายหมวด */

/** `rating` = id ใน driver-rating.json ที่ข้อนี้ป้อนคะแนนให้ */
const ADDITIONS = [
  /* ประสบการณ์และทักษะ — ต่อจาก “ปฏิบัติงานต่างจังหวัด” */
  {
    section: "license",
    rating: "drugs",
    label: "คุณเคยหรือมีการใช้สารเสพติดทุกชนิดหรือไม่",
    hint: "เช่น ยาบ้า, ยาไอซ์, กัญชา, กระท่อม หรือสารกระตุ้นอื่น ๆ",
    sensitive: true,
  },
  { section: "license", rating: "alcohol", label: "คุณดื่มสุราหรือเครื่องดื่มแอลกอฮอล์บ่อยแค่ไหน" },
  {
    section: "license",
    rating: "google_maps",
    label: "คุณสามารถใช้ Google Maps เพื่อนำทางไปยังจุดส่งของ / รับของ ได้หรือไม่",
  },
  {
    section: "license",
    rating: "line_app",
    label: "คุณสามารถใช้ LINE ติดต่อสื่อสารกับหัวหน้างาน / ทีมงานได้หรือไม่",
  },
  /* ข้อมูลเพิ่มเติม — ต่อจาก “ติดต่อเจ้าหน้าที่ฝ่ายบุคคลท่านใด” */
  {
    section: "ready",
    rating: "motivation_reason",
    label: "คุณสนใจมาสมัครงานกับมีนาฯ เพราะเหตุผลอะไร",
  },
  {
    section: "ready",
    rating: "expected_income",
    label: "รายได้ที่คุณต้องการประมาณเท่าไหร่ หรือรายได้ขั้นต่ำที่รับได้",
  },
  {
    section: "ready",
    rating: "other_jobs",
    label: "ก่อนมาสมัครงาน คุณสมัครงานที่อื่นไว้แล้วหรือไม่",
  },
  {
    section: "ready",
    rating: "early_income_plan",
    label:
      "รายได้ช่วงเดือนแรกประมาณ 2,000–6,000 บาท และเดือนที่สองประมาณ 8,400–18,000 บาท คุณวางแผนอย่างไร",
  },
  {
    section: "ready",
    rating: "monthly_expense",
    label: "คุณมีรายจ่ายประจำเดือนประมาณเท่าไหร่",
    hint: "รวมทุกอย่าง เช่น ค่าเช่าบ้าน ค่าใช้จ่ายครอบครัว ค่าน้ำมัน ค่าอาหาร",
  },
  {
    section: "ready",
    rating: "family_income",
    label: "ในครอบครัวของคุณ มีสมาชิกคนอื่นช่วยหารายได้ด้วยหรือไม่",
  },
  {
    section: "ready",
    rating: "informal_debt",
    label: "คุณมีหนี้สินนอกระบบหรือไม่",
    hint: "เช่น เงินกู้ยืมจากเอกชน, เงินนอกระบบ",
  },
];

/* ------------------------------------------------------------------ main */

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const show = (v) => (typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v));

const client = new MongoClient(env.MONGO_URI, { serverSelectionTimeoutMS: 15_000 });
await client.connect();
const col = client.db(hrDbName(env)).collection(QUESTIONS);
const all = await col.find({}).toArray();
const byKey = new Map(all.map((q) => [q.key, q]));

const now = new Date().toISOString();
const updates = [];
const problems = [];

console.log(`\n=== แก้ข้อเดิม (${EDITS.length} ข้อ · ลำดับและ key คงเดิม) ===`);
for (const edit of EDITS) {
  const current = byKey.get(edit.key);
  if (!current) {
    problems.push(`ไม่พบข้อ ${edit.key} (${edit.expect})`);
    continue;
  }
  const already = Object.entries(edit.set).every(([f, v]) => same(current[f], v));
  if (already) {
    console.log(`\n· ${current.label}  — แก้ไปแล้ว ข้าม`);
    continue;
  }
  if (current.label !== edit.expect) {
    problems.push(`ข้อ ${edit.key} ป้ายเปลี่ยนไปแล้ว: ${show(current.label)} (คาดว่า ${show(edit.expect)})`);
    continue;
  }
  console.log(`\n· [${current.section} #${current.order}] ${current.label}\n  เหตุผล: ${edit.why}`);
  for (const [field, value] of Object.entries(edit.set)) {
    if (same(current[field], value)) continue;
    if (field === "options") {
      const before = (current.options ?? []).map((o) => o.label);
      const after = value.map((o) => o.label);
      const added = after.filter((l) => !before.includes(l));
      const removed = before.filter((l) => !after.includes(l));
      console.log(`  options: +${show(added)} −${show(removed)}`);
      console.log(`           ลำดับใหม่ ${show(after)}`);
    } else {
      console.log(`  ${field}: ${show(current[field])} → ${show(value)}`);
    }
  }
  updates.push({
    updateOne: {
      filter: { _id: current._id, label: current.label },
      update: { $set: { ...edit.set, updatedAt: now, updatedBy: BY } },
    },
  });
}

console.log(`\n=== เพิ่มข้อใหม่ท้ายหมวด (${ADDITIONS.length} ข้อ) ===`);
const inserts = [];
for (const section of ["license", "ready"]) {
  let order = Math.max(0, ...all.filter((q) => q.section === section).map((q) => q.order));
  for (const add of ADDITIONS.filter((a) => a.section === section)) {
    if (all.some((q) => q.label === add.label)) {
      console.log(`· ${add.label} — มีอยู่แล้ว ข้าม`);
      continue;
    }
    order += 10;
    const options = ratingOptions(add.rating);
    console.log(`+ [${section} #${order}] ${add.label}  (Driver Rating: ${add.rating})`);
    console.log(`  ตัวเลือก: ${show(options.map((o) => o.label))}`);
    inserts.push({
      key: `q_${randomUUID().replace(/-/g, "").slice(0, 10)}`,
      section,
      order,
      label: add.label,
      hint: add.hint ?? "",
      placeholder: "",
      kind: "single",
      options,
      required: true,
      sensitive: add.sensitive === true,
      condition: null,
      active: true,
      updatedAt: now,
      updatedBy: BY,
    });
  }
}

if (problems.length) {
  console.log("\n⛔ หยุด — มีข้อที่ไม่ตรงกับที่คาดไว้ ไม่ได้เขียนอะไรเลย:");
  for (const p of problems) console.log(`  - ${p}`);
  await client.close();
  process.exit(1);
}

console.log(`\nสรุป: แก้ ${updates.length} ข้อ · เพิ่ม ${inserts.length} ข้อ · คลังเดิม ${all.length} ข้อ → ${all.length + inserts.length} ข้อ`);

if (!apply) {
  console.log("(ดูอย่างเดียว — ใส่ --apply เพื่อเขียนจริง)");
  await client.close();
  process.exit(0);
}

if (updates.length) {
  const res = await col.bulkWrite(updates, { ordered: true });
  if (res.modifiedCount !== updates.length) {
    console.log(`⚠️ แก้ได้ ${res.modifiedCount}/${updates.length} ข้อ — มีข้อที่ถูกแก้ระหว่างรัน`);
  }
}
if (inserts.length) await col.insertMany(inserts, { ordered: true });

/* ตรวจหลังเขียน — ลำดับและ key ของข้อเดิมต้องเหมือนก่อนรันทุกข้อ */
const after = await col.find({}).toArray();
const moved = all.filter((q) => {
  const now = after.find((a) => String(a._id) === String(q._id));
  return !now || now.key !== q.key || now.order !== q.order || now.section !== q.section;
});
console.log(
  `เขียนแล้ว — คลังมี ${after.length} ข้อ · ข้อเดิมที่ลำดับ/key เปลี่ยน: ${moved.length} ข้อ${moved.length ? " ⛔" : " ✓"}`,
);

await client.close();
