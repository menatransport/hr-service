/**
 * นำเข้าชีต DataLog ของ `Reason Code_Final (1).xlsx` (HR ส่วนกลาง 25 พ.ย. 2569) → Exit Interview ในทะเบียน
 * — เฟส 1.5 ของ `app/recruitment/_docs/2026-11-24-exit-interview.md`
 *
 *   node import_exit_datalog_2026-11-25.mjs [ไฟล์.xlsx]             → dry-run พิมพ์สรุป (ไม่เขียน)
 *   node import_exit_datalog_2026-11-25.mjs [ไฟล์.xlsx] --apply     → เขียนจริง (backup ลง backups/ ก่อน)
 *   เพิ่ม --db hr_service_dev เพื่อลองบนฐานทดลอง
 *
 * ต่อแถว (จับคู่ด้วยรหัสพนักงาน กับคนที่ “พ้นสภาพ” ในทะเบียน):
 * - `master_driver.resignation` ← รหัสสาเหตุหลักของไฟล์ (ป้าย/หมวด/ควบคุมได้/เจ้าของ จาก master) + ประเภทการออกของแถว
 *   · `reasonSource: "wave1"` · รหัสเดิม (ส่วนใหญ่ `XLS`) เก็บใน `reasonHistory` ของ interview
 * - `driver_exit_interview` ← ST Zone · RC Mass · ช่องทางสรรหา · ผลการติดต่อ · คำตอบ Q1–Q11 / QW1–QW5 · รายได้ 3 เดือน
 *   คีย์ = รหัส + วันที่พ้นสภาพ **ของทะเบียน** (ไฟล์ต่างกัน 1 วันได้) · มีแถวอยู่แล้ว (สัมภาษณ์ในระบบ) = ไม่ทับ
 *
 * ไม่แตะ: ชื่อ เบอร์ ตำแหน่ง ลูกค้า วันเริ่ม/วันออก (ทะเบียนเป็นแหล่งจริง) · คนที่ยังทำงานอยู่ / ย้ายไปรถร่วม / ไม่เจอ → รายงานแยก
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";

import { MongoClient } from "mongodb";

import { hrDbName, loadEnv } from "./db_env.mjs";
import { HR } from "./lib/db/registry.mjs";

/* exceljs 4.4 ถอด UTF-8 ทีละก้อน → ไทยคร่อมรอยต่อเพี้ยน (ดู import_driver_registry_xlsx.mjs) — แก้ก่อนโหลด */
const require = createRequire(import.meta.url);
{
  const saxPath = require.resolve("exceljs/lib/utils/parse-sax.js");
  const { SaxesParser } = require("saxes");
  require(saxPath);
  require.cache[saxPath].exports = async function* parseSax(iterable) {
    if (iterable.pipe && !iterable[Symbol.asyncIterator]) iterable = iterable.pipe(new PassThrough());
    const parser = new SaxesParser();
    const decoder = new TextDecoder("utf-8");
    let error;
    let events = [];
    parser.on("error", (err) => (error = err));
    parser.on("opentag", (value) => events.push({ eventType: "opentag", value }));
    parser.on("text", (value) => events.push({ eventType: "text", value }));
    parser.on("closetag", (value) => events.push({ eventType: "closetag", value }));
    for await (const chunk of iterable) {
      parser.write(typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true }));
      if (error) throw error;
      yield events;
      events = [];
    }
    const tail = decoder.decode();
    if (tail) {
      parser.write(tail);
      if (error) throw error;
      yield events;
    }
  };
}
const { default: ExcelJS } = await import("exceljs");

const BY = "นำเข้าจาก DataLog Exit Interview (HR ส่วนกลาง)";
const BATCH = "exit-datalog-2026-11-25";
const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const dbIdx = argv.indexOf("--db");
const file = argv.find((a) => a.toLowerCase().endsWith(".xlsx")) ?? path.join(os.homedir(), "Downloads", "Reason Code_Final (1).xlsx");

/* ---------------------------------------------------------------- ค่าในเซลล์ */

function cell(v) {
  if (v == null) return "";
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return cell(v.result);
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return String(v.text);
  }
  return v;
}
const str = (v) => {
  const c = cell(v);
  return c instanceof Date ? c.toISOString().slice(0, 10) : String(c).trim();
};
/** วันที่ในไฟล์เป็นเที่ยงคืนตามเวลาเครื่องที่บันทึก — exceljs ให้ UTC ตรงวันแล้ว */
const iso = (v) => {
  const c = cell(v);
  if (c instanceof Date && !Number.isNaN(c.getTime())) return c.toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}/.test(String(c)) ? String(c).slice(0, 10) : "";
};

const EXIT_TYPE = { สมัครใจ: "vol", บริษัทให้ออก: "inv", หายไปไม่แจ้ง: "disap" };
const YNU = { ใช่: "yes", ไม่: "no", ไม่แน่ใจ: "unsure" };
const Q1_BANDS = [
  "น้อยกว่า 1 เดือนก่อนลาออก",
  "ประมาณ 1–3 เดือนก่อนลาออก",
  "ประมาณ 4–6 เดือนก่อนลาออก",
  "ประมาณ 7–12 เดือนก่อนลาออก",
  "มากกว่า 1 ปีก่อนลาออก",
];
const zone = (s) => {
  const m = /^st\s*zone\s*(\d+)$/i.exec(s);
  return m ? `ST Zone ${Number(m[1])}` : s;
};
const jobMatch = (s) => (/^ไม่ตรง/.test(s) ? "mismatch" : /บางส่วน/.test(s) ? "partial" : /^ตรง/.test(s) ? "match" : "");
const money = (v) => {
  const s = str(v).replace(/,/g, "");
  return s && Number.isFinite(Number(s)) ? Number(s) : null;
};

/* ---------------------------------------------------------------- อ่านไฟล์ */

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
const ws = wb.getWorksheet("DataLog");
if (!ws) throw new Error("ไม่พบชีต DataLog");

/* หัวตาราง = แถว 3 (47 คอลัมน์ ตาม `DATALOG_COLUMNS` ใน exit-interview-panel.tsx) */
const rows = [];
ws.eachRow((row, n) => {
  if (n <= 3) return;
  const v = (col) => row.getCell(col).value;
  const code = str(v(1));
  if (!code || code === "รหัสพนักงาน") return;
  rows.push({ n, code, v });
});

/* ---------------------------------------------------------------- จับคู่ */

const env = loadEnv();
const dbName = dbIdx >= 0 ? argv[dbIdx + 1] : hrDbName(env);
const client = new MongoClient(env.MONGO_URI);
await client.connect();
const db = client.db(dbName);
const drivers = db.collection(HR.drivers.name);
const interviews = db.collection(HR.exitInterviews.name);

/* ป้ายหมวด = `master_resign_category.label` ผ่าน `categoryId` (แบบเดียวกับ `pickResignReason`) */
const categoryLabels = new Map((await db.collection(HR.resignCategories.name).find({}).toArray()).map((c) => [String(c._id), c.label]));
const master = new Map(
  (await db.collection(HR.resignReasons.name).find({}).toArray()).map((m) => [
    m.code,
    { ...m, categoryLabel: categoryLabels.get(String(m.categoryId)) ?? "" },
  ]),
);
const docs = await drivers
  .find({ drivercode: { $in: rows.map((r) => r.code) } }, { projection: { drivercode: 1, statusOverride: 1, resignation: 1 } })
  .toArray();
const byCode = new Map(docs.map((d) => [d.drivercode, d]));
const existing = new Set(
  (await interviews.find({ drivercode: { $in: rows.map((r) => r.code) } }, { projection: { drivercode: 1, exitDateISO: 1 } }).toArray()).map(
    (d) => `${d.drivercode}|${d.exitDateISO}`,
  ),
);

const isTransfer = (res) =>
  res.kind === "transfer" || res.kind === "pjs" || /^(โยก)?ย้าย(ไป|เป็น)(รถร่วม|\s*พจส\.?)$/.test(String(res.reasonLabel ?? ""));

const skipped = { notFound: [], active: [], transfer: [], noCode: [], unknownCode: [], hasInterview: [] };
const plan = [];
const now = new Date();

for (const { n, code, v } of rows) {
  const d = byCode.get(code);
  if (!d) {
    skipped.notFound.push(`${code} (แถว ${n})`);
    continue;
  }
  if (d.statusOverride !== "resigned" || !d.resignation) {
    skipped.active.push(code);
    continue;
  }
  const res = d.resignation;
  if (isTransfer(res)) {
    skipped.transfer.push(code);
    continue;
  }
  const exitDateISO = String(res.dateISO ?? (res.date instanceof Date ? res.date.toISOString() : res.date ?? "")).slice(0, 10);
  const primary = str(v(17)).toUpperCase();
  if (!primary) {
    skipped.noCode.push(code);
    continue;
  }
  const m = master.get(primary);
  if (!m) {
    skipped.unknownCode.push(`${code}:${primary}`);
    continue;
  }

  /* ---- รหัสลงทะเบียน */
  const exitType = EXIT_TYPE[str(v(16))] ?? m.exitType ?? "";
  const resignationSet = {
    "resignation.reasonCode": m.code,
    "resignation.reasonLabel": m.label,
    "resignation.categoryLabel": m.categoryLabel ?? "",
    "resignation.controllable": m.controllable ?? "",
    "resignation.owner": m.owner ?? "",
    "resignation.exitType": exitType,
    "resignation.reasonSource": "wave1",
  };
  const changed = Object.entries(resignationSet).some(([k, val]) => (res[k.slice("resignation.".length)] ?? "") !== val);

  /* ---- คำตอบ */
  const key = `${code}|${exitDateISO}`;
  if (existing.has(key)) {
    skipped.hasInterview.push(code);
    plan.push({ code, exitDateISO, changed, resignationSet, before: res, interview: null });
    continue;
  }
  const status = str(v(21));
  const outcome = primary === "N1" || primary === "N2" ? primary : status === "N1/N2" ? "N1" : status === "Exit interview" ? "interviewed" : "";
  const q8raw = str(v(31));
  const q8 = /^[1-5]$/.test(q8raw) ? Number(q8raw) : null;
  const q1 = str(v(22));
  const wave2Date = iso(v(37));
  const wave2 = {
    dateISO: wave2Date,
    qw1: str(v(38)),
    qw2Income: str(v(39)),
    qw21: str(v(40)),
    qw3: str(v(41)),
    qw31Code: master.has(str(v(42)).toUpperCase()) ? str(v(42)).toUpperCase() : "",
    qw4: YNU[str(v(43))] ?? "",
    qw5: str(v(44)),
    completed: false,
  };
  wave2.completed = Boolean(wave2Date && (wave2.qw1 || wave2.qw3));

  const interview = {
    drivercode: code,
    exitDateISO,
    reference: { stZone: zone(str(v(8))), rcOwner: str(v(9)) === "0" ? "" : str(v(9)), channel: str(v(10)) },
    contacts: [],
    outcome,
    wave1: {
      dateISO: iso(v(20)),
      q1Band: Q1_BANDS.includes(q1) ? q1 : "",
      q2: [Q1_BANDS.includes(q1) ? "" : q1, str(v(23))].filter(Boolean).join(" · "),
      q3: str(v(24)),
      q4: YNU[str(v(25))] ?? "",
      q41Topic: str(v(26)),
      q42: str(v(27)),
      q5: str(v(28)),
      q6Match: jobMatch(str(v(29))),
      q6: str(v(29)),
      q7: str(v(30)),
      q8Score: q8,
      q81: [q8 == null && q8raw ? q8raw : "", str(v(32))].filter(Boolean).join(" · "),
      q9Income: str(v(33)),
      q91NewIncome: str(v(34)),
      q10: str(v(35)),
      q11: str(v(36)),
      completed: outcome === "interviewed",
    },
    wave2,
    income: { net: money(v(45)), average: money(v(46)), deduction: money(v(47)) },
    safetyFlag: false,
    reasonHistory:
      res.reasonCode && res.reasonCode !== m.code
        ? [{ from: res.reasonCode, to: m.code, source: "wave1", at: now.toISOString(), by: BY }]
        : [],
    importBatch: BATCH,
    updatedAt: now,
    updatedBy: BY,
  };
  plan.push({ code, exitDateISO, changed, resignationSet, before: res, interview });
}

/* ---------------------------------------------------------------- สรุป */

const count = (f) => plan.filter(f).length;
console.log(`ไฟล์: ${file} · ฐาน: ${dbName} · ${APPLY ? "เขียนจริง" : "dry-run"}`);
console.log(`แถวในไฟล์ ${rows.length} · จับคู่ได้ ${plan.length}`);
console.log(`  รหัสสาเหตุลงทะเบียน (เปลี่ยน) ${count((p) => p.changed)}`);
console.log(`  Exit Interview ใหม่ ${count((p) => p.interview)} · สัมภาษณ์แล้ว ${count((p) => p.interview?.outcome === "interviewed")} · N1/N2 ${count((p) => /^N/.test(p.interview?.outcome ?? ""))}`);
for (const [k, list] of Object.entries(skipped)) if (list.length) console.log(`  ข้าม ${k} ${list.length}: ${list.slice(0, 20).join(", ")}`);

if (!APPLY) {
  console.log("\n(dry-run) ใส่ --apply เพื่อเขียนจริง");
  await client.close();
  process.exit(0);
}

fs.mkdirSync("backups", { recursive: true });
const backup = path.join("backups", `exit-datalog-before-${now.toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(backup, JSON.stringify(plan.map((p) => ({ drivercode: p.code, resignation: p.before })), null, 1));
console.log(`backup → ${backup}`);

const driverOps = plan
  .filter((p) => p.changed)
  .map((p) => ({ updateOne: { filter: { drivercode: p.code, statusOverride: "resigned" }, update: { $set: p.resignationSet } } }));
const ivOps = plan
  .filter((p) => p.interview)
  .map((p) => ({
    updateOne: {
      filter: { drivercode: p.code, exitDateISO: p.exitDateISO },
      update: { $setOnInsert: p.interview },
      upsert: true,
    },
  }));
if (driverOps.length) console.log("ทะเบียน:", (await drivers.bulkWrite(driverOps, { ordered: false })).modifiedCount);
if (ivOps.length) console.log("Exit Interview:", (await interviews.bulkWrite(ivOps, { ordered: false })).upsertedCount);
await client.close();
