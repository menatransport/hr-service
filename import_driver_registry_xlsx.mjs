/**
 * นำเข้าทะเบียนประวัติ พจส. จากไฟล์ฝ่ายบุคคล (`HR_ทะเบียนประวัติพจส.ลาดกระบัง Mixer.xlsx` ชีต “ทะเบียน 2026”)
 * ลง `hr_service.master_driver` — ทะเบียนตัวจริงของหน้า `/recruitment/admin/drivers` (ดู `app/recruitment/_lib/drivers/master.ts`)
 *
 *   node import_driver_registry_xlsx.mjs [ไฟล์]            → ลองอ่านเฉย ๆ (dry run) พิมพ์สรุป ไม่เขียนอะไร
 *   node import_driver_registry_xlsx.mjs [ไฟล์] --apply    → เขียนจริง (สำรองเอกสารเดิมลง `backups/` ก่อนทุกครั้ง)
 *   --db <name>                                            → ปลายทางอื่น (ค่าตั้งต้น = MONGO_DB ของแอป)
 *
 * แบ่งกลุ่มตามคอลัมน์ “สถานะ” (ตกลงกับ Bew 19 ต.ค. 2569 · ปฏิบัติงาน = 540 คน):
 * - **ปฏิบัติงาน** — ปกติ/วิ่งงาน · ปกติ/ลาป่วยยาว · ฝึกงาน
 * - **พ้นสภาพ** — ออก · ย้ายเป็นรถร่วม · คืนรถร่วม · เกษียณ (ใช้ “วันที่พ้นสภาพ” + “สาเหตุการลาออก”)
 * - **ไม่นำเข้า** — รอสรรหา · รอฝึกงาน · สำรอง รอเริ่มงาน · รอรับรถ และแถวที่ยังไม่มีรหัสพนักงาน
 *   (คนกลุ่มนี้เข้าทะเบียนเองตอนหน้าติดตามพนักงานใหม่ผูกรหัส — `requisitions/registry-sync.ts`)
 *
 * รันซ้ำได้ — ไฟล์ชนะเรื่องประวัติ **ยกเว้นของที่ฝ่ายบุคคลแก้เองบนหน้าทะเบียน**: สถานะ (ดูจาก
 * `resignation.recordedBy`) · ช่องประวัติที่แก้ผ่าน “แก้ไขข้อมูล” (`editedFields`) · รูป/แฟ้มเอกสาร/
 * วันหมดอายุบัตรที่กรอกไว้แล้ว — ไม่ถูกแตะ
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import { PassThrough } from "node:stream";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MongoClient } from "mongodb";

import { hrDbName, loadEnv } from "./db_env.mjs";
import { HR } from "./lib/db/registry.mjs";

/**
 * แก้บั๊กของ exceljs 4.4 ตัวอ่านแบบ stream — `lib/utils/parse-sax.js` ถอดรหัส UTF-8 ทีละก้อนแยกกัน
 * ตัวอักษรไทย (3 ไบต์) ที่คร่อมรอยต่อก้อนกลายเป็น `�` (19 ต.ค. 2569 ทำให้สาขาธนาคาร/ชื่อผู้ติดต่อฉุกเฉิน
 * เพี้ยน 12 คน) · ใส่ตัวแทนที่ถอดรหัสต่อเนื่องทั้ง stream ลง require cache **ก่อนโหลด exceljs**
 * ทุกตัวอ่านข้างใน (shared strings · ชีต) จึงได้ตัวที่ถูก — ต้องโหลด exceljs ด้วย `import()` หลังบรรทัดนี้เท่านั้น
 */
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

const SOURCE = "excel-2026";
const BY = "นำเข้าจาก Excel ทะเบียน 2026";
const SHEET = "ทะเบียน 2026";
/** แถวหัวตาราง (แถว 1–2 เป็นชื่อไฟล์กับหมายเหตุ) */
const HEADER_ROW = 3;
/** หน้าทะเบียนแบ่งสาขาด้วยรหัส ATMS — ไฟล์นี้เป็นของลาดกระบังทั้งไฟล์ (`DRIVER_SITES`) */
const BRANCH = "2";

const ACTIVE = new Set(["ปกติ/วิ่งงาน", "ปกติ/ลาป่วยยาว", "ฝึกงาน"]);
const RESIGNED = new Set(["ออก", "ย้ายเป็นรถร่วม", "คืนรถร่วม", "เกษียณ"]);
const PENDING = new Set(["รอสรรหา", "รอฝึกงาน", "สำรอง รอเริ่มงาน", "รอรับรถ"]);

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const dbArg = (() => {
  const i = argv.indexOf("--db");
  return i >= 0 ? argv[i + 1] : undefined;
})();
const file =
  argv.find((a) => a.toLowerCase().endsWith(".xlsx")) ??
  path.join(os.homedir(), "Desktop", "HR_ทะเบียนประวัติพจส.ลาดกระบัง Mixer.xlsx");

/* ---------------------------------------------------------------- ค่าในเซลล์ */

/** exceljs คืนได้หลายรูป (สูตร · rich text · ลิงก์) — แปลงเหลือค่าเดียว */
function raw(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return raw(v.result);
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return v.text;
    if ("error" in v) return null;
    return null;
  }
  return v;
}

const squash = (s) => s.replace(/\s+/g, " ").trim();
const str = (v) => (v === null || v === undefined ? "" : v instanceof Date ? iso(v) : squash(String(v)));

const ymd = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * วันที่ในไฟล์เป็นเที่ยงคืน UTC (exceljs) — อ่านด้วยส่วน UTC ตรง ๆ · ก่อนปี 1950 = เซลล์เวลาเปล่า ไม่ใช่วันที่
 * · ปีเกิน 2400 = พิมพ์ พ.ศ. ลงช่องวันที่ (พบ 2570 · 2577) ลบ 543 ให้
 */
function iso(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  let y = d.getUTCFullYear();
  if (y > 2400) y -= 543;
  if (y < 1950) return "";
  return ymd(y, d.getUTCMonth() + 1, d.getUTCDate());
}

/** ชื่อย่อเดือนไทย → เลขเดือน (ตัดจุดทิ้งก่อนเทียบ) */
const THAI_MONTHS = ["มค", "กพ", "มีค", "เมย", "พค", "มิย", "กค", "สค", "กย", "ตค", "พย", "ธค"];

/**
 * วันที่ที่พิมพ์เป็นข้อความ — `17/08/2028` · `23พ.ย.2028` · `16 พ.ย 2571` (พ.ศ.) · ปีเกิน 2400 = พ.ศ.
 * · `range` = ช่วงปีที่เป็นไปได้ของช่องนั้น นอกช่วงถือว่าพิมพ์ผิด ทิ้งเป็นค่าว่าง (ดีกว่าโชว์ปี 1934)
 */
function dateOf(v, range = [1950, 2100]) {
  let out = "";
  if (v instanceof Date) out = iso(v);
  else {
    const s = str(v);
    const slash = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(s);
    const thai = /^(\d{1,2})\s*([ก-๙.]+?)\.?\s*(\d{4})$/.exec(s);
    let d = 0;
    let mo = 0;
    let y = 0;
    if (slash) [, d, mo, y] = slash.map(Number);
    else if (thai) {
      d = Number(thai[1]);
      mo = THAI_MONTHS.indexOf(thai[2].replace(/\./g, "")) + 1;
      y = Number(thai[3]);
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) out = s;
    if (y > 2400) y -= 543;
    if (!out && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) out = ymd(y, mo, d);
  }
  const year = Number(out.slice(0, 4));
  return out && year >= range[0] && year <= range[1] ? out : "";
}

/** ช่วงปีที่เป็นไปได้ของวันหมดอายุบัตร/ใบขับขี่ — 2518 (= ค.ศ. 1975) หรือ 1934 คือพิมพ์ผิดช่อง */
const EXPIRY_YEARS = [2000, 2045];

/** เบอร์หนึ่งเบอร์ — ตัวเลขในไฟล์ศูนย์หน้าหาย (9 หลักขึ้นต้น 6/8/9) เติม 0 ให้ */
function onePhone(s) {
  const digits = s.replace(/\.0$/, "").replace(/\D/g, "");
  return digits.length === 9 && /^[689]/.test(digits) ? `0${digits}` : digits;
}

/**
 * เบอร์ติดต่อ — บางแถวใส่หลายเบอร์ในช่องเดียว (`084-775-8449/088-874-4146` · `062-…,086-…` · เว้นวรรค)
 * เบอร์แรกเป็นเบอร์หลัก ที่เหลือเก็บไว้ที่ `phoneAlt` · เก็บเป็นตัวเลขล้วน · ไม่ใช่ 9–10 หลัก = ทิ้ง
 * (สองเบอร์ติดกันในช่องตัวเลขกลายเป็น `6259630990936150000` — ทศนิยมกินหลักไปแล้ว กู้ไม่ได้)
 */
function phonesOf(v) {
  const raw = blankIfPlaceholder(str(v).replace(/\.0$/, ""));
  const all = raw
    .split(/\s*[,/]\s*|\s{2,}|\s(?=0\d)/)
    .map(onePhone)
    .filter(Boolean);
  const parts = all.filter((d) => d.length === 9 || d.length === 10);
  return { phone: parts[0] ?? "", phoneAlt: parts.slice(1).join(", "), dropped: all.length - parts.length };
}

/** ข้อความกันช่องว่างที่ไฟล์ใส่ไว้แทนค่า (`ใส่ให้ครบ` · `ยังไม่รู้…` · `ไม่ทราบสาขา` · `ยังไม่เปิดบัญชี`) */
const blankIfPlaceholder = (s) => (/^(ใส่ให้ครบ|ยังไม่รุ้|ยังไม่รู้|ไม่ทราบ|ยังไม่เปิดบัญชี|-+$)/.test(s) ? "" : s);

/**
 * เลขบัญชีกสิกรไทย 10 หลัก — ช่องตัวเลขของ Excel กิน 0 หน้าไป (`461672299` = `0461672299`) เติมคืนให้
 * · ช่องข้อความเก็บตัวเลขล้วนตามที่พิมพ์
 */
function bankAccountOf(v) {
  if (typeof v === "number" && Number.isInteger(v) && v > 0 && v < 1e10) return String(v).padStart(10, "0");
  return blankIfPlaceholder(str(v)).replace(/\D/g, "");
}

/** ชื่อ — ไฟล์ติดเลขท้ายชื่อไว้แยกระเบียนซ้ำ (`… (1)` · `…เสถียร1`) ไม่ใช่ส่วนของชื่อจริง */
const nameOf = (v) => str(v).replace(/\s*\(\d+\)\s*$/, "").replace(/(?<=[ก-๙])\d+$/, "").trim();

/** ฝ่าย/ตำแหน่ง → รหัสประเภทของ ATMS (`OWNER_TYPE_LABELS`: 1=พจส. 2=พจร. 4=พจส.สแปร์) */
function ownerTypeOf(dept, position) {
  if (/พจร/.test(dept)) return "2";
  if (/spare/i.test(position)) return "4";
  return "1";
}

/** เลขบัตรประชาชน — ช่องตัวเลขของ Excel · เก็บเป็นตัวเลขล้วน 13 หลัก ไม่ครบ = พิมพ์ผิด ทิ้งเป็นค่าว่าง */
function nationalIdOf(v) {
  const digits = str(v).replace(/\.0$/, "").replace(/\D/g, "");
  return digits.length === 13 ? digits : "";
}

/** หลักสุดท้ายของเลขบัตรเป็นหลักตรวจสอบ — ไม่ผ่าน = พิมพ์ผิดสักหลัก (ยังเก็บไว้ ฝ่ายบุคคลต้องเช็กกับบัตรจริง) */
function nationalIdChecks(d) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(d[12]);
}

/** เบอร์รถ — คำอย่าง “ฝึกงาน” “Spare” ไม่ใช่เลขรถ */
function vehicleOf(v) {
  const s = str(v).replace(/\.0$/, "");
  return /\d/.test(s) ? s : "";
}

/* ---------------------------------------------------------------- อ่านไฟล์ */

/** หัวคอลัมน์ที่ใช้ — เทียบแบบตัดช่องว่าง/ขึ้นบรรทัดทิ้ง ไฟล์ขยับคอลัมน์ได้โดยไม่พัง */
const COLUMNS = {
  vehicle: "เบอร์รถ",
  startDate: "วันเริ่มงาน",
  code: "รหัสพนักงาน",
  prefix: "คำนำหน้า",
  name: "ชื่อ-นามสกุล",
  phone: "เบอร์ติดต่อ",
  dept: "ฝ่าย",
  position: "ตำแหน่ง",
  customer: "ลูกค้า",
  plant: "แพล้น",
  /* หัวคอลัมน์จริงยาวกว่านี้ (“เลขที่ บัตรประชาชน (พิมพ์เลขติดกันได้เลย)”) — เทียบแค่ต้นคำ */
  nationalId: "เลขที่บัตรประชาชน*",
  idCardExpiry: "วันหมดอายุบัตรประชาชน",
  licenseType: "ประเภทใบขับขี่",
  licenseNo: "เลขที่ใบขับขี่",
  licenseExpiry: "วันหมดอายุ(ค.ศ.)",
  emergencyRelation: "ความสัมพันธ์ผู้ติดต่อฉุกเฉิน",
  emergencyName: "ชื่อของผู้ติดต่อฉุกเฉิน",
  emergencyPhone: "เบอร์ติดต่อฉุกเฉิน",
  /* “เลขที่บัญชี กสิกรไทยเท่านั้น (ไม่ต้องใส่ขีด)” · “สาขา” คือสาขาธนาคารของบัญชีนั้น (ไม่ใช่สาขาบริษัท) */
  bankAccountNo: "เลขที่บัญชีกสิกรไทยเท่านั้น*",
  bankBranch: "สาขา",
  status: "สถานะ",
  resignDate: "วันที่พ้นสภาพ",
  reason: "สาเหตุการลาออก",
  reasonDetail: "รายะละเอียดของสาเหตุการลาออก",
  reasonGroup: "NewGroupลาออก",
};

const headerKey = (v) => str(v).replace(/\s+/g, "");

async function readSheet() {
  /* อ่านแบบ stream — ไฟล์ 10 MB 7 ชีต อ่านทั้งเล่มด้วย `readFile()` ช้าเกินไป */
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(file, {
    sharedStrings: "cache",
    styles: "cache",
    hyperlinks: "ignore",
    worksheets: "emit",
  });

  for await (const ws of reader) {
    if (ws.name !== SHEET) continue;
    let index = null;
    const rows = [];
    for await (const row of ws) {
      if (row.number < HEADER_ROW) continue;
      const cells = row.values; // 1-based
      if (row.number === HEADER_ROW) {
        /* `row.values` เป็น array เว้นช่อง (คอลัมน์ว่าง) — `forEach` ข้ามช่องว่างให้ */
        const at = new Map();
        cells.forEach((v, i) => at.set(headerKey(raw(v)), i));
        index = Object.fromEntries(
          Object.entries(COLUMNS).map(([key, label]) => {
            const i = label.endsWith("*")
              ? [...at].find(([k]) => k.startsWith(label.slice(0, -1)))?.[1]
              : at.get(label);
            if (i === undefined) throw new Error(`ไม่พบคอลัมน์ “${label}” ในแถวหัวตาราง`);
            return [key, i];
          }),
        );
        continue;
      }
      const get = (key) => raw(cells[index[key]]);
      if (!str(get("name")) && !str(get("code")) && !str(get("status"))) continue;
      rows.push({ row: row.number, get });
    }
    return rows;
  }
  throw new Error(`ไม่พบชีต “${SHEET}” ในไฟล์`);
}

/* ---------------------------------------------------------------- แปลงเป็นเอกสาร */

function toEntry({ row, get }) {
  const status = str(get("status"));
  const code = str(get("code")).replace(/\.0$/, "");
  const base = { row, status, code, name: nameOf(get("name")) };

  if (!code || /^รอสรรหา/.test(code)) return { ...base, skip: "ยังไม่มีรหัสพนักงาน" };
  if (PENDING.has(status)) return { ...base, skip: `สถานะ “${status}”` };
  if (!ACTIVE.has(status) && !RESIGNED.has(status)) return { ...base, skip: `ไม่รู้จักสถานะ “${status}”` };

  const dept = str(get("dept"));
  const position = str(get("position"));
  const phones = phonesOf(get("phone"));
  const emergency = phonesOf(get("emergencyPhone"));
  const profile = {
    drivercode: code,
    driverName: base.name,
    prefix: str(get("prefix")),
    phone: phones.phone,
    phoneAlt: phones.phoneAlt,
    ownerType: ownerTypeOf(dept, position),
    branch: BRANCH,
    vehicleCode: vehicleOf(get("vehicle")),
    startDate: dateOf(get("startDate")),
    nationalId: nationalIdOf(get("nationalId")),
    licenseNo: str(get("licenseNo")).replace(/\.0$/, ""),
    licenseType: str(get("licenseType")),
    licenseExpiryDate: dateOf(get("licenseExpiry"), EXPIRY_YEARS),
    emergencyContactName: blankIfPlaceholder(str(get("emergencyName"))),
    emergencyContactRelation: blankIfPlaceholder(str(get("emergencyRelation"))),
    /* ผู้ติดต่อฉุกเฉินเก็บเบอร์เดียว — เบอร์ที่สองต่อท้ายไม่ได้ จึงรวมไว้ด้วยกันคั่นจุลภาค */
    emergencyContactPhone: [emergency.phone, emergency.phoneAlt].filter(Boolean).join(", "),
    bankAccountNo: bankAccountOf(get("bankAccountNo")),
    bankBranch: blankIfPlaceholder(str(get("bankBranch"))),
    customer: str(get("customer")),
    plant: str(get("plant")),
    position,
    department: dept,
  };

  const active = ACTIVE.has(status);
  let resignation = null;
  if (!active) {
    const dateISO = dateOf(get("resignDate"));
    if (!dateISO) return { ...base, skip: `สถานะ “${status}” แต่ไม่มีวันที่พ้นสภาพ` };
    const reason = str(get("reason"));
    resignation = {
      dateISO,
      /* ไฟล์ใช้ชุดเหตุผลของตัวเอง ไม่ตรงกับ Reason Code Master — เก็บข้อความตามไฟล์ แก้เป็นรหัสจริงได้จากหน้าทะเบียน */
      reasonCode: "XLS",
      reasonLabel: reason || status,
      categoryLabel: "",
      exitType: "",
      note: [status !== reason ? status : "", str(get("reasonDetail")), str(get("reasonGroup"))]
        .filter(Boolean)
        .join(" · "),
    };
  }

  /* ร่องรอยการปรับค่า — พิมพ์ในสรุปให้รู้ว่าไฟล์มีอะไรที่ไม่ได้เก็บตามตัวอักษร */
  const idCardExpiry = dateOf(get("idCardExpiry"), EXPIRY_YEARS);
  const fixes = [
    base.name !== str(get("name")) && "ตัดเลขท้ายชื่อ",
    str(get("nationalId")) && !profile.nationalId && "ทิ้งเลขบัตรประชาชนที่ไม่ครบ 13 หลัก",
    profile.nationalId && !nationalIdChecks(profile.nationalId) && "เลขบัตรประชาชนหลักตรวจสอบไม่ผ่าน (เก็บไว้ · ต้องเช็กบัตรจริง)",
    profile.phoneAlt && "แยกเบอร์สำรอง",
    (phones.dropped || emergency.dropped) && "ทิ้งเบอร์ที่ไม่ใช่ 9–10 หลัก",
    typeof get("bankAccountNo") === "number" && profile.bankAccountNo !== String(get("bankAccountNo")) && "เติม 0 หน้าเลขบัญชี",
    profile.bankAccountNo && profile.bankAccountNo.length !== 10 && "เลขบัญชีไม่ใช่ 10 หลัก (เก็บตามไฟล์)",
    str(get("emergencyName")) && !profile.emergencyContactName && "ล้างคำกันช่องว่างในผู้ติดต่อฉุกเฉิน",
    get("licenseExpiry") !== null && !(get("licenseExpiry") instanceof Date) && profile.licenseExpiryDate && "แปลงวันหมดอายุใบขับขี่จากข้อความ",
    get("licenseExpiry") !== null && !profile.licenseExpiryDate && "ทิ้งวันหมดอายุใบขับขี่ที่อ่านไม่ได้",
    get("idCardExpiry") !== null && !idCardExpiry && "ทิ้งวันหมดอายุบัตรที่ผิดช่วงปี",
    [get("licenseExpiry"), get("idCardExpiry")].some((v) => v instanceof Date && v.getUTCFullYear() > 2400) && "แปลงปี พ.ศ. ในช่องวันที่",
  ].filter(Boolean);
  return { ...base, profile, active, resignation, idCardExpiry, fixes };
}

/**
 * ชื่อลูกค้า/แพล้นท์ที่สะกดต่างกันแค่ช่องว่าง (`พระราม9/2` กับ `พระราม 9/2`) ยุบเป็นแบบที่ใช้มากสุดในไฟล์
 * — ตัวกรองบนหน้าทะเบียนนับตามข้อความ สะกดต่างกันนิดเดียวจะกลายเป็นสองแพล้นท์
 */
function canonicalize(rows, field) {
  const key = (v) => v.replace(/\s+/g, "").toLowerCase();
  const votes = new Map();
  for (const e of rows) {
    const v = e.profile[field];
    if (!v) continue;
    const byKey = votes.get(key(v)) ?? new Map();
    byKey.set(v, (byKey.get(v) ?? 0) + 1);
    votes.set(key(v), byKey);
  }
  const fixed = [];
  for (const e of rows) {
    const v = e.profile[field];
    if (!v) continue;
    const [best] = [...votes.get(key(v))].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
    if (best[0] !== v) {
      fixed.push(`${v} → ${best[0]}`);
      e.profile[field] = best[0];
    }
  }
  return fixed;
}

/* ---------------------------------------------------------------- main */

const tally = (xs) => xs.reduce((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {});

async function main() {
  const env = loadEnv();
  const dbName = dbArg || hrDbName(env);
  console.log(`ไฟล์: ${file}`);
  console.log(`ปลายทาง: ${dbName}.${HR.drivers.name} ${APPLY ? "(เขียนจริง)" : "(dry run — ไม่เขียน)"}`);

  const started = Date.now();
  const entries = (await readSheet()).map(toEntry);
  console.log(`อ่านชีต “${SHEET}” ${entries.length} แถว (${((Date.now() - started) / 1000).toFixed(1)} วินาที)`);

  const skipped = entries.filter((e) => e.skip);
  const rows = entries.filter((e) => !e.skip);

  for (const field of ["customer", "plant"]) {
    const fixed = canonicalize(rows, field);
    if (fixed.length) console.log(`ยุบตัวสะกด ${field}:`, tally(fixed));
  }
  console.log("ปรับค่าจากไฟล์:", tally(rows.flatMap((e) => e.fixes)));

  /* กันพลาด — ตัวอักษรเพี้ยนต้องไม่หลุดลงฐานอีก (ดูตัวแก้ parse-sax ด้านบน) */
  const garbled = rows.filter((e) => JSON.stringify([e.profile, e.resignation]).includes("�"));
  if (garbled.length) throw new Error(`อ่านตัวอักษรเพี้ยน (�) ${garbled.length} แถว: ${garbled.map((e) => e.row).join(", ")} — ไม่เขียนอะไร`);

  const dup = Object.entries(tally(rows.map((e) => e.code))).filter(([, n]) => n > 1);
  if (dup.length) throw new Error(`รหัสพนักงานซ้ำในไฟล์: ${dup.map(([c, n]) => `${c}×${n}`).join(", ")}`);
  for (const e of rows.filter((x) => x.fixes.some((f) => /เลขบัตร/.test(f))))
    console.log(`  ⚠ แถว ${e.row} ${e.code} ${e.name} (${e.status}) — ${e.fixes.filter((f) => /เลขบัตร/.test(f)).join(" · ")}`);
  /* คนเดียวกันหลายรหัสเป็นเรื่องปกติของไฟล์ (รหัสฝึกงาน MTM… แล้วได้รหัสจริง · กลับมาทำงานใหม่) —
     แจ้งเฉพาะคู่ที่ยังปฏิบัติงานพร้อมกันทั้งสองรหัส */
  const byNid = Map.groupBy(rows.filter((e) => e.active && e.profile.nationalId), (e) => e.profile.nationalId);
  const twins = [...byNid.values()].filter((g) => g.length > 1);
  if (twins.length) console.log(`  ⚠ เลขบัตรเดียวกันแต่ปฏิบัติงานอยู่หลายรหัส ${twins.length} คน:`, twins.map((g) => g.map((e) => e.code).join("/")).join(", "));

  const client = await MongoClient.connect(env.MONGO_URI);
  try {
    const db = client.db(dbName);
    const col = db.collection(HR.drivers.name);
    const existing = new Map(
      (await col.find({}, { projection: { _id: 0, documents: 0 } }).toArray()).map((d) => [String(d.drivercode).trim(), d]),
    );

    const now = new Date();
    const ops = [];
    const stats = { insert: 0, update: 0, keptHrStatus: 0, idCardFilled: 0, keptEdits: 0 };

    for (const e of rows) {
      const before = existing.get(e.code);
      /* สถานะที่ฝ่ายบุคคลกดเองบนหน้าทะเบียน (ไม่ใช่ของตัวนำเข้านี้) ชนะไฟล์ */
      const hrStatus =
        before?.registry && before.statusOverride && before.resignation?.recordedBy !== BY;

      const $set = {
        ...e.profile,
        syncedAt: now,
        registry: { source: SOURCE, sheet: SHEET, row: e.row, importedAt: now, by: BY },
      };
      const $unset = {};

      /* ช่องที่ฝ่ายบุคคลแก้เองบนหน้าทะเบียน (`updateDriverProfile()`) — ค่าบนเว็บชนะไฟล์ */
      const edited = Array.isArray(before?.editedFields) ? before.editedFields : [];
      for (const key of edited) delete $set[key];
      if (edited.length) stats.keptEdits++;

      if (hrStatus) stats.keptHrStatus++;
      else if (e.active) {
        $set.active = true;
        Object.assign($unset, { statusOverride: "", resignation: "" });
      } else {
        $set.active = false;
        $set.statusOverride = "resigned";
        $set.resignation = { ...e.resignation, recordedAt: now, recordedBy: BY };
      }

      /* วันหมดอายุบัตรประชาชน — ช่องที่ฝ่ายบุคคลกรอกเองได้ · ค่าที่กรอกบนหน้าทะเบียนมี `idCardExpiryUpdatedBy`
         เสมอ ห้ามทับ · ที่ไม่มีคือของตัวนำเข้านี้เอง ทับ/ล้างตามไฟล์ได้ */
      if (!before?.idCardExpiryUpdatedBy) {
        if (e.idCardExpiry) {
          $set.idCardExpiryDate = e.idCardExpiry;
          stats.idCardFilled++;
        } else if (before?.idCardExpiryDate) $unset.idCardExpiryDate = "";
      }

      if (before) stats.update++;
      else stats.insert++;
      ops.push({
        updateOne: {
          filter: { drivercode: e.code },
          update: Object.keys($unset).length ? { $set, $unset } : { $set },
          upsert: true,
        },
      });
    }

    const fileCodes = new Set(rows.map((e) => e.code));
    const orphaned = [...existing.values()].filter(
      (d) => d.registry?.source === SOURCE && !fileCodes.has(String(d.drivercode).trim()),
    );
    const reqs = await db
      .collection(HR.requisitions.name)
      .find({ drivercode: { $type: "string", $gt: "" }, status: { $ne: "cancelled" } }, { projection: { _id: 0, drivercode: 1 } })
      .toArray();
    const waiting = [...new Set(reqs.map((r) => r.drivercode.trim()))].filter(
      (c) => !fileCodes.has(c) && !existing.get(c)?.registry,
    );

    const activeCount = rows.filter((e) => e.active).length;
    console.log("\n── สรุป ──");
    console.log(`ปฏิบัติงาน ${activeCount} คน`, tally(rows.filter((e) => e.active).map((e) => e.status)));
    console.log(`พ้นสภาพ ${rows.length - activeCount} คน`, tally(rows.filter((e) => !e.active).map((e) => e.status)));
    console.log(`ไม่นำเข้า ${skipped.length} แถว`, tally(skipped.map((e) => e.skip)));
    for (const e of skipped.filter((x) => /^ไม่รู้จัก|ไม่มีวันที่/.test(x.skip)))
      console.log(`  ⚠ แถว ${e.row} ${e.code} ${e.name} — ${e.skip}`);
    console.log(`เอกสาร: เพิ่มใหม่ ${stats.insert} · เขียนทับแถวเดิม ${stats.update} · คงสถานะที่ฝ่ายบุคคลกดเอง ${stats.keptHrStatus} · คงช่องที่แก้บนเว็บ ${stats.keptEdits} คน · เติมวันหมดอายุบัตร ${stats.idCardFilled}`);
    console.log(`แถวเก่าใน master_driver ที่ไม่อยู่ในทะเบียน (ไม่ลบ · ไม่นับ): ${[...existing.keys()].filter((c) => !fileCodes.has(c) && !existing.get(c)?.registry).length}`);
    if (orphaned.length) console.log(`⚠ เคยนำเข้าจากไฟล์นี้แต่ไม่อยู่ในไฟล์แล้ว ${orphaned.length} คน (ไม่แตะ):`, orphaned.map((d) => d.drivercode).join(", "));
    console.log(`คำขอสรรหาที่ผูกรหัสแล้วแต่ยังไม่อยู่ในทะเบียน ${waiting.length} รหัส — เข้าทะเบียนเองเมื่อบันทึก RC/รับรถครั้งถัดไป`);

    if (!APPLY) {
      console.log("\n(dry run) ใส่ --apply เพื่อเขียนจริง");
      return;
    }

    /* สำรองเอกสารเดิมทุกแถวที่จะถูกแตะ — `backups/` อยู่ใน .gitignore (มีข้อมูลส่วนบุคคล) */
    const backupDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "backups");
    fs.mkdirSync(backupDir, { recursive: true });
    const backupFile = path.join(backupDir, `master_driver-before-registry-import-${now.toISOString().replace(/[:.]/g, "-")}.json`);
    const touched = await col.find({ drivercode: { $in: [...fileCodes] } }).toArray();
    fs.writeFileSync(backupFile, JSON.stringify(touched, null, 1));
    console.log(`\nสำรองเอกสารเดิม ${touched.length} แถว → ${backupFile}`);

    const res = await col.bulkWrite(ops, { ordered: false });
    console.log(`เขียนแล้ว: เพิ่ม ${res.upsertedCount} · แก้ ${res.modifiedCount} · ตรงเดิม ${res.matchedCount - res.modifiedCount}`);
    const inRegistry = await col.countDocuments({ registry: { $exists: true } });
    const activeNow = await col.countDocuments({ registry: { $exists: true }, active: true, statusOverride: { $ne: "resigned" } });
    console.log(`ทะเบียนตอนนี้ ${inRegistry} คน · ปฏิบัติงาน ${activeNow} คน`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
