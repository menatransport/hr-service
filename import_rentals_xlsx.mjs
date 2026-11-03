/**
 * นำเข้าทะเบียนคุมห้องเช่าของบริษัท (`ห้องเช่าบริษัท_ทะเบียนคุมห้องเช่าของบริษัท.xlsx`) ลงเมนู “จัดการห้องเช่า”
 * (`/desk/rentals` · คอลเลกชัน `rental_*` — ดู `lib/rentals/store.ts`)
 *
 *   node import_rentals_xlsx.mjs <ไฟล์.xlsx>            → ลองอ่านเฉย ๆ (dry run) พิมพ์สรุป + คนที่จับคู่ทะเบียนไม่ได้
 *   node import_rentals_xlsx.mjs <ไฟล์.xlsx> --apply    → เขียนจริง (**เฉพาะเมื่อยังไม่มีห้องในระบบ** — นำเข้าครั้งแรกครั้งเดียว)
 *   --db <name>                                         → ปลายทางอื่น (ค่าตั้งต้น = MONGO_DB ของแอป)
 *   --month YYYY-MM                                     → เดือนของบิลน้ำไฟในชีต ถ้าไม่ตรงกับชื่อชีต
 *                                                         (ไฟล์ 3 พ.ย. 2569 ชีตชื่อ `2026-11` แต่เป็นบิล ต.ค. = `--month 2026-10`)
 *
 * อ่านชีตเดือน (`YYYY-MM` เช่น `2026-11`) + ชีต “แผนที่ห้องเช่า” (ลิงก์แผนที่ต่อที่พัก):
 * - หนึ่งแถว = หนึ่งผู้พัก · ที่พัก+เบอร์ห้องซ้ำกันหลายแถว = ห้องเดียวพัก 2 คน (`capacity: 2`)
 * - **คนจับคู่กับทะเบียนประวัติ พจส. ด้วยชื่อ** (ตัดคำนำหน้า/เว้นวรรค/ตัวเลข) — ไม่เจอ = เก็บชื่อไว้ `nameAtEntry`
 *   แล้วหน้าห้องเช่าขึ้นป้าย “ยังไม่ผูกทะเบียน” ให้กดผูกเอง · ข้อมูลคนอื่น ๆ ในไฟล์ (ฝ่าย/โม่/สังกัด) ไม่นำเข้า
 *   เพราะอ่านสดจากทะเบียนแทน
 * - ชื่อ “มีแจ้งสรรหา” = ห้องว่างที่แจ้งสรรหาแล้ว · “ไม่มีแจ้งสรรหา” = ห้องว่าง
 * - สถานะห้อง “ยกเลิกสัญญา …” = ยกเลิกสัญญาตั้งแต่ต้นเดือนของชีต (ไม่ลบห้อง)
 * - “สถานะอายุงานครบ 4 เดือน” → รูปแบบจ่าย: บริษัทจ่ายให้ทั้งหมด = COMPANY_FULL · Mixer (พจร) = EMPLOYEE_FULL
 *   · ที่เหลือ = COMPANY_CAP 2,000 (สูตรเดิม)
 * - ค่าไฟ/น้ำ/ส่วนกลาง → บิลของเดือนตามชื่อชีต
 */
import { createRequire } from "node:module";
import { PassThrough } from "node:stream";

import { MongoClient, ObjectId } from "mongodb";

import { hrDbName, loadEnv } from "./db_env.mjs";
import { HR } from "./lib/db/registry.mjs";

/** แก้ตัวอักษรไทยคร่อมรอยต่อ stream ของ exceljs 4.4 — ดูเหตุผลเต็มใน `import_driver_registry_xlsx.mjs` */
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

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const FILE = argv.find((a) => a.toLowerCase().endsWith(".xlsx"));
const DB_FLAG = (() => {
  const i = argv.indexOf("--db");
  return i >= 0 ? argv[i + 1] : undefined;
})();
if (!FILE) {
  console.error("ใส่พาธไฟล์ .xlsx ด้วย");
  process.exit(1);
}

const BY = "นำเข้าจาก Excel ทะเบียนคุมห้องเช่า";

/* ------------------------------------------------------------------ อ่านค่าในช่อง */

const raw = (cell) => {
  const v = cell?.value;
  if (v && typeof v === "object" && !(v instanceof Date)) {
    if ("error" in v) return null;
    if ("result" in v) return v.result ?? null;
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    /* ช่องลิงก์: `{ text, hyperlink }` — `text` เป็น `{ richText }` ได้ */
    if ("text" in v) return typeof v.text === "string" ? v.text : (v.text?.richText?.map((t) => t.text).join("") ?? null);
    if ("hyperlink" in v) return v.hyperlink;
  }
  return v ?? null;
};
const text = (cell) => {
  const v = raw(cell);
  if (v == null || typeof v === "object") return "";
  return String(v).replace(/\s+/g, " ").trim();
};
const num = (cell) => {
  const v = raw(cell);
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};
/** exceljs คืนวันที่เป็นเที่ยงคืน UTC ของวันในช่อง */
const iso = (cell) => {
  const v = raw(cell);
  return v instanceof Date && !Number.isNaN(v.getTime()) ? v.toISOString().slice(0, 10) : "";
};

/** ชื่อคนเทียบกันได้ — ตัดคำนำหน้า เว้นวรรค ตัวเลข จุด */
const normName = (s) =>
  String(s ?? "")
    .replace(/^(นาย|นางสาว|นาง|น\.ส\.)\s*/u, "")
    .replace(/[\s\d.]/g, "")
    .toLowerCase();

const newId = () => new ObjectId().toHexString();

/* ------------------------------------------------------------------ เปิดไฟล์ */

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(FILE);
const sheet = wb.worksheets.find((ws) => /^\d{4}-\d{2}$/.test(ws.name.trim()));
if (!sheet) throw new Error("ไม่พบชีตเดือน (ชื่อแบบ 2026-11)");
const monthArg = argv[argv.indexOf("--month") + 1];
const MONTH = argv.includes("--month") && /^\d{4}-\d{2}$/.test(monthArg ?? "") ? monthArg : sheet.name.trim();
console.log(`ไฟล์: ${FILE}\nชีต: ${MONTH}`);

/* ลิงก์แผนที่ — ชีต “แผนที่ห้องเช่า” หาคอลัมน์จากแถวหัว (“ชื่อที่พัก” · “แผนที่”) · เทียบชื่อแบบตัดช่องว่าง */
const keyOf = (s) => String(s ?? "").replace(/[\s​]/g, "");
const maps = new Map();
const mapSheet = wb.worksheets.find((ws) => ws.name.includes("แผนที่"));
let nameCol = 0;
let mapCol = 0;
mapSheet?.eachRow((row) => {
  if (!nameCol) {
    row.eachCell((cell, col) => {
      if (text(cell) === "ชื่อที่พัก") nameCol = col;
      if (text(cell) === "แผนที่") mapCol = col;
    });
    return;
  }
  const name = text(row.getCell(nameCol));
  const cell = row.getCell(mapCol);
  const url = /https?:\/\/\S+/.exec(text(cell))?.[0] ?? (cell.hyperlink || "");
  if (name && url) maps.set(keyOf(name), url);
});

/* ------------------------------------------------------------------ แถวข้อมูล */

const rows = [];
sheet.eachRow((row, n) => {
  if (n < 3) return;
  const apt = text(row.getCell("C"));
  const roomNo = text(row.getCell("L"));
  if (!apt || apt === "ชื่อที่พัก" || !roomNo || roomNo === "เบอร์ห้อง") return;
  rows.push({
    line: n,
    apt,
    owner: text(row.getCell("D")),
    phone: text(row.getCell("E")),
    contractStart: iso(row.getCell("F")),
    rent: num(row.getCell("G")) ?? 0,
    deposit: num(row.getCell("H")) ?? 0,
    advance: num(row.getCell("I")) ?? 0,
    plant: text(row.getCell("K")),
    roomNo,
    roomStatus: text(row.getCell("M")),
    name: text(row.getCell("P")),
    checkIn: iso(row.getCell("X")),
    checkOut: iso(row.getCell("Y")),
    living: text(row.getCell("Z")),
    payHint: text(row.getCell("AA")),
    electric: num(row.getCell("AF")),
    water: num(row.getCell("AG")),
    common: num(row.getCell("AH")),
    remark: text(row.getCell("AL")),
    bill: text(row.getCell("AM")),
    accName: text(row.getCell("AO")),
    bank: text(row.getCell("AP")),
    accNo: text(row.getCell("AQ")),
    terms: text(row.getCell("AR")),
  });
});
console.log(`แถวห้อง/ผู้พัก: ${rows.length}`);

/* ------------------------------------------------------------------ ทะเบียน พจส. */

const env = loadEnv();
const client = await MongoClient.connect(env.MONGO_URI);
const db = client.db(DB_FLAG || hrDbName(env));
console.log(`ฐานข้อมูล: ${db.databaseName}`);

const people = await db
  .collection(HR.drivers.name)
  .find(
    { registry: { $exists: true } },
    { projection: { _id: 0, drivercode: 1, driverName: 1, active: 1, statusOverride: 1 } },
  )
  .toArray();
const byName = new Map();
for (const p of people) {
  const key = normName(p.driverName);
  if (!key || !p.drivercode) continue;
  const active = p.statusOverride ? p.statusOverride === "active" : Boolean(p.active);
  const list = byName.get(key) ?? [];
  list.push({ code: String(p.drivercode).trim(), name: p.driverName, active });
  byName.set(key, list);
}
function matchPerson(name) {
  const list = byName.get(normName(name)) ?? [];
  if (!list.length) return null;
  const active = list.filter((p) => p.active);
  if (active.length === 1) return active[0];
  if (list.length === 1) return list[0];
  return { ambiguous: list };
}

/* ------------------------------------------------------------------ ประกอบเอกสาร */

const at = new Date().toISOString();
const stamp = { createdAt: at, createdBy: BY, updatedAt: at, updatedBy: BY };
const apartments = new Map();
const rooms = new Map();
const stays = [];
const bills = new Map();
const unmatched = [];
const ambiguous = [];

const payModeOf = (hint) => {
  if (hint.includes("บริษัทจ่ายให้ทั้งหมด")) return { payMode: "COMPANY_FULL", cap: null };
  if (hint.includes("พจร")) return { payMode: "EMPLOYEE_FULL", cap: null };
  if (hint.includes("2,500") || hint.includes("2500")) return { payMode: "COMPANY_CAP", cap: 2500 };
  return { payMode: "COMPANY_CAP", cap: 2000 };
};
const EXTRA_STATUS = ["รอทำสัญญา", "ย้ายออก/เปลี่ยนแพล้นท์", "เปลี่ยนสัญญาเป็นพจส."];

for (const r of rows) {
  let apt = apartments.get(r.apt);
  if (!apt) {
    apt = {
      _id: newId(),
      name: r.apt,
      owner: r.owner,
      phone: r.phone,
      mapUrl: maps.get(keyOf(r.apt)) ?? "",
      address: "",
      bankName: r.bank,
      bankAccountName: r.accName,
      bankAccountNo: r.accNo,
      minContract: r.terms,
      billSource: r.bill.includes("ทำบิลเอง") ? "self" : "owner",
      remark: "",
      active: true,
      ...stamp,
    };
    apartments.set(r.apt, apt);
  }

  const roomKey = `${apt._id}|${r.roomNo}`;
  let room = rooms.get(roomKey);
  if (!room) {
    const cancelled = r.roomStatus.startsWith("ยกเลิกสัญญา");
    room = {
      _id: newId(),
      apartmentId: apt._id,
      roomNo: r.roomNo,
      plant: r.plant,
      rent: r.rent,
      deposit: r.deposit,
      advance: r.advance,
      contractStart: r.contractStart,
      capacity: 1,
      ...payModeOf(r.payHint),
      status: cancelled ? "cancelled" : "active",
      cancelledOn: cancelled ? `${MONTH}-01` : "",
      cancelReason: cancelled ? r.roomStatus.replace(/^ยกเลิกสัญญา\s*/, "") : "",
      recruitRequested: r.name === "มีแจ้งสรรหา",
      remark: [EXTRA_STATUS.includes(r.roomStatus) ? r.roomStatus : "", r.remark].filter(Boolean).join(" · "),
      ...stamp,
      _rows: 0,
    };
    rooms.set(roomKey, room);
  }
  room._rows += 1;
  if (room._rows > 1) room.capacity = 2;

  const bill = bills.get(room._id) ?? {
    _id: `${MONTH}:${room._id}`,
    month: MONTH,
    roomId: room._id,
    electric: null,
    water: null,
    common: null,
    updatedAt: at,
    updatedBy: BY,
  };
  for (const k of ["electric", "water", "common"]) {
    if (r[k] != null) bill[k] = Math.round(((bill[k] ?? 0) + r[k]) * 100) / 100;
  }
  bills.set(room._id, bill);

  if (!r.name || r.name === "มีแจ้งสรรหา" || r.name === "ไม่มีแจ้งสรรหา") continue;
  const hit = matchPerson(r.name);
  if (!hit) unmatched.push(`แถว ${r.line}: ${r.name} (${r.apt} ห้อง ${r.roomNo})`);
  else if (hit.ambiguous) ambiguous.push(`แถว ${r.line}: ${r.name} → ${hit.ambiguous.map((p) => p.code).join(", ")}`);
  const person = hit && !hit.ambiguous ? hit : null;
  stays.push({
    _id: newId(),
    roomId: room._id,
    apartmentId: apt._id,
    drivercode: person?.code ?? "",
    nameAtEntry: person?.name ?? r.name,
    livingWith: r.living.includes("ครอบครัว") ? "family" : "alone",
    checkIn: r.checkIn,
    checkOut: r.checkOut,
    note: "",
    ...stamp,
  });
}

/* คนเดียวกันมีสองห้องที่ยังไม่ย้ายออก — รายงานให้ตรวจ (ไม่ตัดทิ้ง) */
const openByCode = new Map();
for (const s of stays) if (s.drivercode && !s.checkOut) openByCode.set(s.drivercode, (openByCode.get(s.drivercode) ?? 0) + 1);
const doubles = [...openByCode].filter(([, n]) => n > 1).map(([c]) => c);

const roomList = [...rooms.values()].map(({ _rows, ...r }) => r);
const billList = [...bills.values()].filter((b) => b.electric != null || b.water != null || b.common != null);
const matched = stays.filter((s) => s.drivercode).length;
const modes = roomList.reduce((m, r) => ((m[r.payMode] = (m[r.payMode] ?? 0) + 1), m), {});

console.log(`
ที่พัก ${apartments.size} · ห้อง ${roomList.length} (พัก 2 คน ${roomList.filter((r) => r.capacity === 2).length} · ยกเลิกสัญญา ${roomList.filter((r) => r.status === "cancelled").length})
ผู้พัก ${stays.length} คน — ผูกทะเบียนได้ ${matched} · ยังไม่ผูก ${stays.length - matched}
บิลเดือน ${MONTH}: ${billList.length} ห้อง · มีลิงก์แผนที่ ${[...apartments.values()].filter((a) => a.mapUrl).length}/${apartments.size} ที่พัก
รูปแบบจ่าย: ${Object.entries(modes).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
if (unmatched.length) console.log(`\nไม่พบในทะเบียน (${unmatched.length}):\n  ${unmatched.join("\n  ")}`);
if (ambiguous.length) console.log(`\nชื่อซ้ำหลายรหัส — ไม่ผูกให้ (${ambiguous.length}):\n  ${ambiguous.join("\n  ")}`);
if (doubles.length) {
  const where = (code) =>
    stays
      .filter((x) => x.drivercode === code && !x.checkOut)
      .map((x) => {
        const room = roomList.find((r) => r._id === x.roomId);
        const apt = [...apartments.values()].find((a) => a._id === x.apartmentId);
        return `${apt?.name} ห้อง ${room?.roomNo} (เข้า ${x.checkIn || "?"})`;
      })
      .join(" | ");
  console.log(`\n⚠️ คนเดียวมีมากกว่าหนึ่งห้องที่ยังพักอยู่ (${doubles.length}):\n  ${doubles.map((c) => `${c}: ${where(c)}`).join("\n  ")}`);
}

if (!APPLY) {
  console.log("\n(dry run) ใส่ --apply เพื่อเขียนจริง");
  await client.close();
  process.exit(0);
}

const existing = await db.collection(HR.rentalRooms.name).estimatedDocumentCount();
if (existing > 0) {
  console.error(`\nมีห้องในระบบแล้ว ${existing} ห้อง — สคริปต์นี้ใช้นำเข้าครั้งแรกเท่านั้น ไม่เขียนทับ`);
  await client.close();
  process.exit(1);
}

await db.collection(HR.rentalApartments.name).insertMany([...apartments.values()]);
await db.collection(HR.rentalRooms.name).insertMany(roomList);
if (stays.length) await db.collection(HR.rentalStays.name).insertMany(stays);
if (billList.length) await db.collection(HR.rentalBills.name).insertMany(billList);
console.log("\nนำเข้าเรียบร้อย");
await client.close();
