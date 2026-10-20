import type { AnyBulkWriteOperation } from "mongodb";

import { hrCol } from "@/lib/db";
import { IN_REGISTRY } from "./master";
import {
  DRIVER_EDIT_FIELDS,
  type PasteImportReport,
  type PasteRowAction,
  type PasteRowResult,
} from "./types";

/**
 * ปุ่ม “วางจาก Excel” บนหน้าทะเบียน — คัดลอกแถวจากชีต “ทะเบียน 2026” (แถวเดียวหรือหลายแถว) มาวาง
 * แล้วนำเข้าเฉพาะช่องที่ทะเบียนเก็บ · **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 *
 * กติกาเดียวกับ `import_driver_registry_xlsx.mjs` (สถานะ · การแปลงเบอร์/เลขบัญชี/วันที่ · ค่าที่ฝ่ายบุคคล
 * แก้บนเว็บชนะ) — ถ้าแก้กติกาที่นั่น แก้ที่นี่ด้วย · ต่างกันสองข้อ:
 * - **ช่องว่างไม่ลบค่าเดิม** — วางแถวที่ยังกรอกไม่ครบได้โดยไม่ทำให้ของในทะเบียนหาย
 * - คัดลอกมาไม่ครบทุกคอลัมน์ได้ — ช่องที่ไม่ได้คัดลอกมาไม่ถูกแตะ
 *
 * อ่านข้อความได้สองแบบ: มีแถวหัวตาราง (เทียบชื่อคอลัมน์) หรือไม่มี (เทียบตำแหน่งคอลัมน์ของชีต
 * โดยหาคอลัมน์ “คำนำหน้า” เป็นหลัก — คัดลอกเริ่มคอลัมน์ไหนก็ได้ ขอให้มีคำนำหน้ากับชื่อ)
 */

const SHEET = "ทะเบียน 2026";
/** ข้อความเดียวกับตัวนำเข้า — ตัวนำเข้ารอบหน้าจะรู้ว่าสถานะนี้มาจากไฟล์ ไม่ใช่ฝ่ายบุคคลกดเอง */
const BY = "นำเข้าจาก Excel ทะเบียน 2026";
const SOURCE = "excel-2026";
/** ไฟล์นี้เป็นของลาดกระบังทั้งไฟล์ (`DRIVER_SITES`) */
const BRANCH = "2";
const MAX_ROWS = 2_000;

const ACTIVE = new Set(["ปกติ/วิ่งงาน", "ปกติ/ลาป่วยยาว", "ฝึกงาน"]);
const RESIGNED = new Set(["ออก", "ย้ายเป็นรถร่วม", "คืนรถร่วม", "เกษียณ"]);
const PENDING = new Set(["รอสรรหา", "รอฝึกงาน", "สำรอง รอเริ่มงาน", "รอรับรถ"]);

export class PasteImportError extends Error {}

/* ---------------------------------------------------------------- คอลัมน์ */

type Col =
  | "vehicle" | "startDate" | "code" | "prefix" | "name" | "phone" | "dept" | "position" | "customer"
  | "plant" | "emergencyRelation" | "emergencyName" | "emergencyPhone" | "bankAccountNo" | "bankBranch"
  | "nationalId" | "idCardExpiry" | "licenseType" | "licenseNo" | "licenseExpiry" | "status"
  | "resignDate" | "reason" | "reasonDetail" | "reasonGroup";

/** หัวคอลัมน์ (ตัดช่องว่างทิ้ง) · `*` = เทียบแค่ต้นคำ · `at` = ตำแหน่งในชีต (คอลัมน์ A = 0) */
const COLUMNS: Record<Col, { label: string; at: number }> = {
  vehicle: { label: "เบอร์รถ", at: 1 },
  startDate: { label: "วันเริ่มงาน", at: 2 },
  code: { label: "รหัสพนักงาน", at: 3 },
  prefix: { label: "คำนำหน้า", at: 4 },
  name: { label: "ชื่อ-นามสกุล", at: 5 },
  phone: { label: "เบอร์ติดต่อ", at: 6 },
  dept: { label: "ฝ่าย", at: 7 },
  position: { label: "ตำแหน่ง", at: 8 },
  customer: { label: "ลูกค้า", at: 9 },
  plant: { label: "แพล้น", at: 10 },
  emergencyRelation: { label: "ความสัมพันธ์ผู้ติดต่อฉุกเฉิน", at: 11 },
  emergencyName: { label: "ชื่อของผู้ติดต่อฉุกเฉิน", at: 12 },
  emergencyPhone: { label: "เบอร์ติดต่อฉุกเฉิน", at: 13 },
  bankAccountNo: { label: "เลขที่บัญชีกสิกรไทยเท่านั้น*", at: 17 },
  bankBranch: { label: "สาขา", at: 18 },
  nationalId: { label: "เลขที่บัตรประชาชน*", at: 21 },
  idCardExpiry: { label: "วันหมดอายุบัตรประชาชน", at: 28 },
  licenseType: { label: "ประเภทใบขับขี่", at: 34 },
  licenseNo: { label: "เลขที่ใบขับขี่", at: 35 },
  licenseExpiry: { label: "วันหมดอายุ(ค.ศ.)", at: 37 },
  status: { label: "สถานะ", at: 46 },
  resignDate: { label: "วันที่พ้นสภาพ", at: 47 },
  reason: { label: "สาเหตุการลาออก", at: 48 },
  reasonDetail: { label: "รายะละเอียดของสาเหตุการลาออก", at: 49 },
  reasonGroup: { label: "NewGroupลาออก", at: 53 },
};

/** ชื่อช่องในทะเบียนสำหรับรายงาน — ใช้ป้ายเดียวกับฟอร์มแก้ไขข้อมูล */
const FIELD_LABEL: Record<string, string> = {
  ...Object.fromEntries(DRIVER_EDIT_FIELDS.map((f) => [f.key, f.label])),
  prefix: "คำนำหน้า",
  department: "ฝ่าย",
  idCardExpiryDate: "บัตรประชาชนหมดอายุ",
  status: "สถานะ",
};

const COL_LABEL: Record<Col, string> = {
  vehicle: "เบอร์รถ", startDate: "วันเริ่มงาน", code: "รหัสพนักงาน", prefix: "คำนำหน้า", name: "ชื่อ – สกุล",
  phone: "เบอร์โทร", dept: "ฝ่าย", position: "ตำแหน่ง", customer: "ลูกค้า", plant: "แพล้นท์",
  emergencyRelation: "ผู้ติดต่อฉุกเฉิน", emergencyName: "ผู้ติดต่อฉุกเฉิน", emergencyPhone: "ผู้ติดต่อฉุกเฉิน",
  bankAccountNo: "บัญชีธนาคาร", bankBranch: "บัญชีธนาคาร", nationalId: "เลขบัตรประชาชน",
  idCardExpiry: "บัตรประชาชนหมดอายุ", licenseType: "ใบขับขี่", licenseNo: "ใบขับขี่", licenseExpiry: "ใบขับขี่",
  status: "สถานะ", resignDate: "การพ้นสภาพ", reason: "การพ้นสภาพ", reasonDetail: "การพ้นสภาพ", reasonGroup: "การพ้นสภาพ",
};

/* ---------------------------------------------------------------- ข้อความที่วาง */

/**
 * แยกข้อความที่คัดลอกจาก Excel/Google Sheets (คั่นแท็บ) เป็นแถว — เซลล์ที่มีขึ้นบรรทัด/แท็บ/อัญประกาศ
 * ถูกครอบด้วย `"…"` และอัญประกาศข้างในเป็น `""`
 */
function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let atCellStart = true;
  const src = text.replace(/\r\n?/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"' && atCellStart) {
      quoted = true;
      atCellStart = false;
    } else if (ch === "\t") {
      row.push(cell);
      cell = "";
      atCellStart = true;
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      atCellStart = true;
    } else {
      cell += ch;
      atCellStart = false;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const headerKey = (s: string) => s.replace(/\s+/g, "");
const isPrefix = (s: string) => /^(นาย|นาง|นางสาว|น\.ส\.?|Mr\.?|Mrs\.?|Ms\.?|Miss)$/i.test(squash(s));

interface Layout {
  mode: "header" | "position";
  /** ตำแหน่งในแถวที่วางของแต่ละช่อง · ไม่มี = ไม่ได้คัดลอกมา */
  index: Partial<Record<Col, number>>;
  /** แถวแรกของข้อมูล (หลังหัวตาราง) */
  start: number;
}

function layoutOf(rows: string[][]): Layout {
  /* มีแถวหัวตาราง — ใช้ชื่อคอลัมน์ (ไฟล์ขยับคอลัมน์ได้โดยไม่พัง) */
  const headerAt = rows.findIndex((r) => {
    const keys = r.map(headerKey);
    return keys.includes("รหัสพนักงาน") && keys.includes("ชื่อ-นามสกุล");
  });
  if (headerAt >= 0) {
    const keys = rows[headerAt].map(headerKey);
    const index: Partial<Record<Col, number>> = {};
    for (const [col, { label }] of Object.entries(COLUMNS) as [Col, { label: string }][]) {
      const i = label.endsWith("*")
        ? keys.findIndex((k) => k.startsWith(label.slice(0, -1)))
        : keys.indexOf(label);
      if (i >= 0) index[col] = i;
    }
    return { mode: "header", index, start: headerAt + 1 };
  }

  /* ไม่มีหัวตาราง — หาคอลัมน์ “คำนำหน้า” ในแถวแรกที่มี แล้วเลื่อนตำแหน่งของชีตตามนั้น */
  let prefixAt = -1;
  for (const r of rows) {
    prefixAt = r.findIndex(isPrefix);
    if (prefixAt >= 0) break;
  }
  if (prefixAt < 0) {
    throw new PasteImportError(
      "อ่านคอลัมน์ไม่ออก — คัดลอกให้มีคอลัมน์ “คำนำหน้า” กับ “ชื่อ-นามสกุล” ด้วย หรือคัดลอกแถวหัวตารางมาด้วย",
    );
  }
  const shift = prefixAt - COLUMNS.prefix.at;
  const index: Partial<Record<Col, number>> = {};
  for (const [col, { at }] of Object.entries(COLUMNS) as [Col, { at: number }][]) {
    if (at + shift >= 0) index[col] = at + shift;
  }
  return { mode: "position", index, start: 0 };
}

/* ---------------------------------------------------------------- ค่าในเซลล์ (กติกาเดียวกับตัวนำเข้า) */

const ymd = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const THAI_MONTHS = ["มค", "กพ", "มีค", "เมย", "พค", "มิย", "กค", "สค", "กย", "ตค", "พย", "ธค"];
const THAI_MONTHS_FULL = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const EN_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function monthOf(word: string): number {
  const w = word.replace(/\./g, "").toLowerCase();
  const th = THAI_MONTHS.indexOf(w);
  if (th >= 0) return th + 1;
  const full = THAI_MONTHS_FULL.indexOf(w);
  if (full >= 0) return full + 1;
  const en = EN_MONTHS.indexOf(w.slice(0, 3));
  return en >= 0 ? en + 1 : 0;
}

/**
 * วันที่ตามที่ชีตแสดง — `1 Apr 2019` · `1 เม.ย. 2019` · `01/04/2019` · `2019-04-01` · `1-Apr-19`
 * · ปีเกิน 2400 = พ.ศ. · `range` = ช่วงปีที่เป็นไปได้ นอกช่วงถือว่าพิมพ์ผิด ทิ้งเป็นค่าว่าง
 */
function dateOf(raw: string, range: [number, number] = [1950, 2100]): string {
  const s = squash(raw);
  if (!s) return "";
  let d = 0;
  let mo = 0;
  let y = 0;
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s))) [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if ((m = /^(\d{1,2})[\s-]*([A-Za-zก-๙.]+?)\.?[\s-]*(\d{2,4})$/.exec(s))) {
    d = Number(m[1]);
    mo = monthOf(m[2]);
    y = Number(m[3]);
  }
  if (y > 0 && y < 100) y += y <= 50 ? 2000 : 1900;
  if (y > 2400) y -= 543;
  if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return "";
  return y >= range[0] && y <= range[1] ? ymd(y, mo, d) : "";
}

const EXPIRY_YEARS: [number, number] = [2000, 2045];

/** คำกันช่องว่างของไฟล์ · `0` = สูตรที่ยังไม่มีค่า · `#N/A` `#REF!` = สูตรพัง */
const blankIfPlaceholder = (s: string) =>
  /^(ใส่ให้ครบ|ยังไม่รุ้|ยังไม่รู้|ไม่ทราบ|ยังไม่เปิดบัญชี|-+$|0$|#[A-Z/0!?]+)/.test(s) ? "" : s;

function onePhone(s: string): string {
  const digits = s.replace(/\D/g, "");
  return digits.length === 9 && /^[689]/.test(digits) ? `0${digits}` : digits;
}

/**
 * เบอร์ — ชีตแสดงเป็น `082-198-1335` (ขีดมาจากรูปแบบเซลล์) · หลายเบอร์ในช่องเดียวคั่น `/` `,` หรือเว้นวรรค
 * เบอร์แรกเป็นเบอร์หลัก ที่เหลือไปที่ `phoneAlt`
 */
function phonesOf(raw: string) {
  const all = blankIfPlaceholder(squash(raw))
    .split(/\s*[,/]\s*|\s{2,}|\s(?=0\d)/)
    .map(onePhone)
    .filter(Boolean);
  const parts = all.filter((d) => d.length === 9 || d.length === 10);
  return { phone: parts[0] ?? "", phoneAlt: parts.slice(1).join(", "), dropped: all.length - parts.length };
}

/** เลขบัญชีกสิกรไทย — ตัวเลขล้วน · 9 หลัก = ศูนย์หน้าหาย เติมคืน */
function bankAccountOf(raw: string): string {
  const digits = blankIfPlaceholder(squash(raw)).replace(/\D/g, "");
  return digits.length === 9 ? `0${digits}` : digits;
}

const nameOf = (s: string) => squash(s).replace(/\s*\(\d+\)\s*$/, "").replace(/(?<=[ก-๙])\d+$/, "").trim();

function ownerTypeOf(dept: string, position: string): string {
  if (/พจร/.test(dept)) return "2";
  if (/spare/i.test(position)) return "4";
  return "1";
}

/** เลขบัตรประชาชน — ชีตแสดงเป็น `3 3508 00889 44 6` · ไม่ครบ 13 หลัก = พิมพ์ผิด ทิ้ง */
function nationalIdOf(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.length === 13 ? digits : "";
}

function nationalIdChecks(d: string): boolean {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(d[12]);
}

const vehicleOf = (s: string) => (/\d/.test(s) ? squash(s) : "");

/* ---------------------------------------------------------------- แปลงแถว */

interface Entry {
  line: number;
  code: string;
  name: string;
  status: string;
  skip?: string;
  /** เฉพาะช่องที่คัดลอกมาและมีค่า */
  profile: Record<string, string>;
  /** `null` = ไม่ได้คัดลอกคอลัมน์สถานะมา */
  active: boolean | null;
  resignation: Record<string, string> | null;
  idCardExpiry: string;
  notes: string[];
}

function toEntry(cells: string[], line: number, index: Layout["index"]): Entry | null {
  const has = (col: Col) => index[col] !== undefined && (index[col] as number) < cells.length;
  const get = (col: Col) => (has(col) ? (cells[index[col] as number] ?? "").trim() : "");
  const text = (col: Col) => blankIfPlaceholder(squash(get(col)));

  const code = squash(get("code")).replace(/\.0$/, "");
  const name = nameOf(get("name"));
  const status = squash(get("status"));
  if (!code && !name && !status) return null;

  const base: Entry = { line, code, name, status, profile: {}, active: null, resignation: null, idCardExpiry: "", notes: [] };
  if (!code || /^รอสรรหา/.test(code)) return { ...base, skip: "ยังไม่มีรหัสพนักงาน" };
  if (PENDING.has(status)) return { ...base, skip: `สถานะ “${status}” — เข้าทะเบียนเองตอนผูกรหัสในหน้าติดตามพนักงานใหม่` };
  if (status && !ACTIVE.has(status) && !RESIGNED.has(status)) return { ...base, skip: `ไม่รู้จักสถานะ “${status}”` };

  const notes: string[] = [];
  const p: Record<string, string> = { drivercode: code };
  const put = (key: string, value: string) => {
    if (value) p[key] = value;
  };

  put("driverName", name);
  if (name !== squash(get("name"))) notes.push("ตัดเลขท้ายชื่อ");
  put("prefix", text("prefix"));
  put("vehicleCode", vehicleOf(get("vehicle")));
  put("startDate", dateOf(get("startDate")));

  if (has("phone")) {
    const phones = phonesOf(get("phone"));
    put("phone", phones.phone);
    put("phoneAlt", phones.phoneAlt);
    if (phones.dropped) notes.push("ทิ้งเบอร์ที่ไม่ใช่ 9–10 หลัก");
  }
  const dept = text("dept");
  const position = text("position");
  put("department", dept);
  put("position", position);
  if (has("dept")) p.ownerType = ownerTypeOf(dept, position);
  put("customer", text("customer"));
  put("plant", text("plant"));

  const nidRaw = get("nationalId");
  const nid = nationalIdOf(nidRaw);
  put("nationalId", nid);
  if (nidRaw.replace(/\D/g, "") && !nid) notes.push("เลขบัตรประชาชนไม่ครบ 13 หลัก (ไม่นำเข้า)");
  if (nid && !nationalIdChecks(nid)) notes.push("เลขบัตรประชาชนหลักตรวจสอบไม่ผ่าน — เช็กกับบัตรจริง");

  put("licenseNo", text("licenseNo"));
  put("licenseType", text("licenseType"));
  const licenseExpiry = dateOf(get("licenseExpiry"), EXPIRY_YEARS);
  put("licenseExpiryDate", licenseExpiry);
  if (get("licenseExpiry") && !licenseExpiry) notes.push("อ่านวันหมดอายุใบขับขี่ไม่ได้");

  put("emergencyContactName", text("emergencyName"));
  put("emergencyContactRelation", text("emergencyRelation"));
  if (has("emergencyPhone")) {
    const em = phonesOf(get("emergencyPhone"));
    put("emergencyContactPhone", [em.phone, em.phoneAlt].filter(Boolean).join(", "));
  }
  const bank = bankAccountOf(get("bankAccountNo"));
  put("bankAccountNo", bank);
  if (bank && bank.length !== 10) notes.push("เลขบัญชีไม่ใช่ 10 หลัก");
  put("bankBranch", text("bankBranch"));

  const idCardExpiry = dateOf(get("idCardExpiry"), EXPIRY_YEARS);
  if (get("idCardExpiry") && !idCardExpiry) notes.push("อ่านวันหมดอายุบัตรประชาชนไม่ได้");

  let active: boolean | null = null;
  let resignation: Record<string, string> | null = null;
  if (status) {
    active = ACTIVE.has(status);
    if (!active) {
      const dateISO = dateOf(get("resignDate"));
      if (!dateISO) return { ...base, skip: `สถานะ “${status}” แต่ไม่มีวันที่พ้นสภาพ` };
      const reason = text("reason");
      resignation = {
        dateISO,
        reasonCode: "XLS",
        reasonLabel: reason || status,
        categoryLabel: "",
        exitType: "",
        note: [status !== reason ? status : "", text("reasonDetail"), text("reasonGroup")]
          .filter(Boolean)
          .join(" · "),
      };
    }
  }

  return { ...base, profile: p, active, resignation, idCardExpiry, notes };
}

/* ---------------------------------------------------------------- main */

interface ExistingDoc {
  drivercode: string;
  registry?: unknown;
  editedFields?: unknown;
  statusOverride?: unknown;
  resignation?: { recordedBy?: unknown; dateISO?: unknown; reasonLabel?: unknown; note?: unknown } | null;
  idCardExpiryDate?: unknown;
  idCardExpiryUpdatedBy?: unknown;
  active?: unknown;
  [key: string]: unknown;
}

const asText = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

/**
 * ตรวจ (`commit: false` ไม่เขียนอะไร) หรือนำเข้าจริง — สองทางเดินตรรกะเดียวกันทุกขั้น
 * ตอนนำเข้าจริงคิดใหม่จากฐานล่าสุด ไม่เชื่อผลตรวจที่หน้าจอถืออยู่
 */
export async function importPastedRows(text: string, commit: boolean, actor: string): Promise<PasteImportReport> {
  const table = parseTsv(text).filter((r) => r.some((c) => c.trim()));
  if (!table.length) throw new PasteImportError("ไม่มีข้อมูลที่วาง");

  const layout = layoutOf(table);
  if (layout.index.code === undefined || layout.index.name === undefined) {
    throw new PasteImportError("ต้องคัดลอกคอลัมน์ “รหัสพนักงาน” และ “ชื่อ-นามสกุล” มาด้วย");
  }

  const dataRows = table.slice(layout.start);
  if (dataRows.length > MAX_ROWS) throw new PasteImportError(`วางได้ครั้งละไม่เกิน ${MAX_ROWS.toLocaleString("th-TH")} แถว`);

  const entries = dataRows
    .map((cells, i) => toEntry(cells, layout.start + i + 1, layout.index))
    .filter((e): e is Entry => e !== null);
  if (!entries.length) throw new PasteImportError("ไม่พบแถวข้อมูลในสิ่งที่วาง");

  /* รหัสซ้ำในสิ่งที่วาง — ใช้แถวล่างสุด (ชีตเพิ่มแถวใหม่ไว้ด้านล่าง) */
  const lastLine = new Map<string, number>();
  for (const e of entries) if (!e.skip) lastLine.set(e.code, e.line);
  for (const e of entries) {
    if (!e.skip && lastLine.get(e.code) !== e.line) e.skip = `รหัสซ้ำกับบรรทัด ${lastLine.get(e.code)} — ใช้บรรทัดล่าง`;
  }

  const drivers = await hrCol<ExistingDoc>("drivers");
  const codes = entries.filter((e) => !e.skip).map((e) => e.code);
  const existing = new Map(
    (await drivers.find({ drivercode: { $in: codes } }, { projection: { _id: 0, documents: 0, profileEdits: 0 } }).toArray())
      .map((d) => [asText(d.drivercode), d]),
  );

  /* ลูกค้า/แพล้นท์ที่สะกดต่างกันแค่ช่องว่าง — ใช้ตัวสะกดที่มีในทะเบียนอยู่แล้ว (ตัวกรองบนหน้านับตามข้อความ) */
  const spelling = new Map<string, string>();
  for (const field of ["customer", "plant"] as const) {
    for (const v of (await drivers.distinct(field, IN_REGISTRY)) as unknown[]) {
      const s = asText(v);
      if (s) spelling.set(`${field}:${s.replace(/\s+/g, "").toLowerCase()}`, s);
    }
  }

  const now = new Date();
  const results: PasteRowResult[] = [];
  const ops: AnyBulkWriteOperation<ExistingDoc>[] = [];

  for (const e of entries) {
    const result: PasteRowResult = {
      line: e.line, code: e.code, name: e.name, status: e.status,
      action: "skip", reason: e.skip, changes: [], kept: [], notes: e.notes,
    };
    results.push(result);
    if (e.skip) continue;

    for (const field of ["customer", "plant"] as const) {
      const v = e.profile[field];
      const known = v && spelling.get(`${field}:${v.replace(/\s+/g, "").toLowerCase()}`);
      if (known) e.profile[field] = known;
    }

    const before = existing.get(e.code);
    const inRegistry = Boolean(before?.registry);
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, ""> = {};
    const edited = new Set(Array.isArray(before?.editedFields) ? before.editedFields.map(String) : []);

    const profile = { ...e.profile };
    if (!before || !asText(before.branch)) profile.branch = BRANCH;
    for (const [key, value] of Object.entries(profile)) {
      if (key === "drivercode") continue;
      if (before && edited.has(key)) {
        if (asText(before[key]) !== value) result.kept.push(FIELD_LABEL[key] ?? key);
        continue;
      }
      if (asText(before?.[key]) === value) continue;
      $set[key] = value;
      if (before) result.changes.push(FIELD_LABEL[key] ?? key);
    }

    /* สถานะ — ฝ่ายบุคคลกดเองบนหน้าทะเบียน (ไม่ใช่ของตัวนำเข้า) ชนะไฟล์ */
    const hrStatus = inRegistry && before?.statusOverride && asText(before.resignation?.recordedBy) !== BY;
    const wasResigned = before?.statusOverride === "resigned";
    if (e.active === null) {
      if (!before) $set.active = true;
    } else if (hrStatus) {
      const fileSays = e.active ? "ปฏิบัติงาน" : "พ้นสภาพ";
      if ((e.active && wasResigned) || (!e.active && !wasResigned)) result.kept.push(`สถานะ (ไฟล์ว่า${fileSays})`);
    } else if (e.active) {
      if (!before || wasResigned || before.active !== true) {
        $set.active = true;
        Object.assign($unset, { statusOverride: "", resignation: "" });
        if (before) result.changes.push(FIELD_LABEL.status);
      }
    } else if (e.resignation) {
      const r = before?.resignation;
      const same =
        wasResigned && asText(r?.dateISO) === e.resignation.dateISO && asText(r?.reasonLabel) === e.resignation.reasonLabel;
      if (!same) {
        $set.active = false;
        $set.statusOverride = "resigned";
        $set.resignation = { ...e.resignation, recordedAt: now, recordedBy: BY };
        if (before) result.changes.push(FIELD_LABEL.status);
      }
    }

    /* วันหมดอายุบัตรประชาชน — ค่าที่ฝ่ายบุคคลกรอกบนหน้าทะเบียน (`idCardExpiryUpdatedBy`) ไม่ทับ */
    if (e.idCardExpiry && !before?.idCardExpiryUpdatedBy && asText(before?.idCardExpiryDate) !== e.idCardExpiry) {
      $set.idCardExpiryDate = e.idCardExpiry;
      if (before) result.changes.push(FIELD_LABEL.idCardExpiryDate);
    }

    const changed = Object.keys($set).length > 0 || Object.keys($unset).length > 0;
    result.action = !before || !inRegistry ? "insert" : changed ? "update" : "same";
    if (result.action === "same") continue;

    $set.syncedAt = now;
    if (!inRegistry) $set.registry = { source: SOURCE, sheet: SHEET, via: "paste", importedAt: now, by: actor };
    else Object.assign($set, { "registry.pastedAt": now, "registry.pastedBy": actor });

    ops.push({
      updateOne: {
        filter: { drivercode: e.code },
        update: Object.keys($unset).length ? { $set, $unset } : { $set },
        upsert: true,
      },
    });
  }

  if (commit && ops.length) await drivers.bulkWrite(ops, { ordered: false });

  const counts: Record<PasteRowAction, number> = { insert: 0, update: 0, same: 0, skip: 0 };
  for (const r of results) counts[r.action]++;
  const columns = [...new Set((Object.keys(layout.index) as Col[]).filter((c) => {
    const i = layout.index[c] as number;
    return dataRows.some((r) => i < r.length);
  }).map((c) => COL_LABEL[c]))];

  return { mode: layout.mode, columns, rows: results, counts, committed: commit && ops.length > 0 };
}
