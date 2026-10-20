import { createHash } from "node:crypto";

import ExcelJS from "exceljs";
import { etlCol, hrCol } from "@/lib/db";
import { readDrivers } from "@/app/recruitment/_lib/drivers/master";
import { nextSeq } from "@/lib/db/counters";
import { listBlacklist, snapshotOf } from "./applications";
import { EXIT_STATUS_CODES, workStatusFullLabel } from "./drivers/types";
import {
  composeName,
  digitsOnly,
  findByRole,
  isValidThaiNationalId,
  validateDocumentField,
} from "./form";
import { FORM_SHEET_HEADERS } from "./form-sheet-headers";
import { listActiveQuestions, RecruitmentError } from "./questions";
import { findBlacklistHit, nameKey, OTHER_EXIT_REASON, EXIT_REASON_NOTE_MAX } from "./types";
import {
  DOCUMENT_FIELDS,
  EMPTY_DOCUMENT_DATA,
  EMPTY_DOCUMENT_META,
  EMPTY_INTERVIEW,
  type AnswerMap,
  type AnswerValue,
  type BlacklistEntry,
  type BlacklistHit,
  type ApplicationFile,
  type ApplicationStatus,
  type ConsentRecord,
  type DocumentData,
  type DocumentMeta,
  type ExitReason,
  type ImportAnswerStat,
  type ImportOutcome,
  type ImportReport,
  type ImportRow,
  type ImportSkipReason,
  type InterviewRecord,
  type Question,
  type QuestionOption,
  type QuestionSnapshot,
  type TimelineEntry,
} from "./types";

/**
 * นำเข้าใบสมัครจากไฟล์ Excel ของ Google Form รุ่นเก่า (ชีต “การตอบแบบฟอร์ม 1”)
 * — **ฝั่งเซิร์ฟเวอร์เท่านั้น** และ**ต้องรันได้นอก Next ด้วย** (ดู scratch runner
 * ที่เรียกผ่าน `npx tsx`) จึงพึ่งแค่ `@/lib/db`, `questions.ts`, และ helper
 * ล้วน ๆ — ห้าม import อะไรที่ลาก React/Next runtime เข้ามา
 *
 * โครงสร้างไฟล์:
 * 1. ตัวช่วยข้อความ/ตัวเลข/วันที่ (ไม่มีที่ไหนในระบบมีวันที่แบบ Google Form
 *    ปนภาษาไทยมาก่อน จึงเขียนตัวแยกเองที่นี่ ไม่ใช้ `Intl` ตามกติกาโปรเจกต์)
 * 2. ตารางจับคู่คอลัมน์ Excel → คำถามในคลังปัจจุบัน (ดู `.claude/CLAUDE.md`
 *    งานที่มอบหมายสำหรับ fragment คำอธิบายที่มาของแต่ละคอลัมน์)
 * 3. ตัวแปลงคำตอบต่อชนิดคำถาม (matched / mapped / raw)
 * 4. โหลดทะเบียน พจส. มาจับคู่ชื่อ/เบอร์
 * 5. อ่านแถว → จัดกลุ่มตัดซ้ำ → จัดสถานะ → ประกอบรายงาน
 * 6. `previewImport()` / `commitImport()` — ตัวเดียวกันเกือบทั้งหมด ต่างกันแค่
 *    ปลายทางเขียนฐานข้อมูลจริงหรือไม่
 */

/** สถานะเก่าที่ยังนับว่า “มีใบที่กำลังพิจารณาอยู่” ตามกติกาเดียวกับ `guardDuplicate()` */
const DUPLICATE_BLOCKING_STATUSES = new Set([
  "cancelled",
  "interview_failed",
  "withdrawn",
  "rejected",
]);
const DUPLICATE_WINDOW_DAYS = 30;
const TRAINING_WINDOW_DAYS = 30;
/** คอลัมน์ “สถานะสัมภาษณ์” ของชีตเขียนว่า `แบล็คลิส(นัดเริ่มงานหลายรอบไม่มา)` / `❌ Black List (พจส.เก่า)` */
const BLACKLIST_RE = /แบล็[คก]|black\s*-?\s*list/i;
const MAX_PASTE_ROWS = 2_000;

/** ที่มาของแถว — ไฟล์ .xlsx (อัป/ชี้ path) หรือข้อความที่คัดลอกแถวจากชีตมาวาง */
export type ImportSource = { buffer: Buffer | ArrayBuffer } | { text: string };

/* ------------------------------------------------------------------ ข้อความ/ตัวเลข */

/** NFC + ตัด zero-width + รวมช่องว่าง + ขีดกลางทุกแบบ → `-` — ก่อนเทียบข้อความใด ๆ */
function normalizeText(raw: unknown): string {
  if (raw == null) return "";
  const s = typeof raw === "string" ? raw : String(raw);
  return s
    .normalize("NFC")
    .replace(/[​-‍﻿]/g, "")
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** ตัวเลขตัวแรกที่เจอในข้อความ (ตัด , คั่นหลักออกก่อน) — คืน `null` ถ้าไม่มีเลยสักตัว */
function extractFirstNumber(text: string): number | null {
  const m = text.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/* ----------------------------------------------------------------------- วันที่ */

/**
 * exceljs คืนวันที่แบบ Excel เป็น `Date` ที่ **ฟิลด์ UTC ตรงกับเวลาตามผนังของกรุงเทพฯ**
 * (ตรวจกับแถวจริงแล้ว: แถวแรกอ่านได้ 07 เม.ย. 2025 15:29:26 ตามเวลาไทย ตรงกับที่
 * openpyxl อ่านได้) — เวลาจริง (UTC) จึงเท่ากับค่านี้ลบ 7 ชั่วโมง **เฉพาะเซลล์ที่มี
 * เวลาจริงติดมาด้วยอย่าง “ประทับเวลา”** ห้ามใช้กติกานี้กับเซลล์ที่เป็นวันที่ล้วน
 * (เกิด/ใบขับขี่) เพราะเวลาของเซลล์พวกนั้นเป็น 00:00:00 เสมอ ลบ 7 ชม.ไปจะเพี้ยนวัน
 */
function timestampInstant(value: unknown): Date | null {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return new Date(value.getTime() - 7 * 3600 * 1000);
}

/** เซลล์วันที่ล้วน (ไม่มีเวลา) → `YYYY-MM-DD` · ปี > 2400 ถือเป็น พ.ศ. แล้วลบ 543 */
function dateOnlyIsoFromExcelDate(value: Date): string {
  let y = value.getUTCFullYear();
  const m = value.getUTCMonth() + 1;
  const d = value.getUTCDate();
  if (y > 2400) y -= 543;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const THAI_MONTHS: { num: number; full: string; abbr: string }[] = [
  { num: 1, full: "มกราคม", abbr: "ม.ค" },
  { num: 2, full: "กุมภาพันธ์", abbr: "ก.พ" },
  { num: 3, full: "มีนาคม", abbr: "มี.ค" },
  { num: 4, full: "เมษายน", abbr: "เม.ย" },
  { num: 5, full: "พฤษภาคม", abbr: "พ.ค" },
  { num: 6, full: "มิถุนายน", abbr: "มิ.ย" },
  { num: 7, full: "กรกฎาคม", abbr: "ก.ค" },
  { num: 8, full: "สิงหาคม", abbr: "ส.ค" },
  { num: 9, full: "กันยายน", abbr: "ก.ย" },
  { num: 10, full: "ตุลาคม", abbr: "ต.ค" },
  { num: 11, full: "พฤศจิกายน", abbr: "พ.ย" },
  { num: 12, full: "ธันวาคม", abbr: "ธ.ค" },
];

/** `ม.ค` → `มค` เผื่อคนพิมพ์ไม่ใส่จุด (`31สค2511`, `4มิย72` ที่เจอจริงในไฟล์) */
const MONTH_ALT = THAI_MONTHS.flatMap((m) => [m.full, m.abbr, m.abbr.replace(/\./g, "")])
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join("|");

const THAI_DATE_RE = new RegExp(`^(\\d{1,2})\\.?(${MONTH_ALT})\\.?(\\d{2,4})$`);

/**
 * วันที่ข้อความภาษาไทยที่พบในไฟล์ฟอร์มเก่า เช่น `21ก.พ2518` `31สค2511`
 * `21ส.ค.พ.ศ.2519` `18 พฤษภาคม 2572` `4 มิย 72` → `YYYY-MM-DD` (ค.ศ.)
 *
 * กติกาปี: 2 หลัก = พ.ศ. (บวก 2500) · ≥ 2400 = พ.ศ. (ลบ 543) · < 2400 = ค.ศ.ตรงตัว
 * (พบจริงในไฟล์ว่าบางแถวพิมพ์ปี ค.ศ. ทั้งที่เดือนเป็นไทย เช่น `20 พ.ย.2025`)
 *
 * แปลงไม่ได้ → คืน `null` ให้ผู้เรียกเก็บข้อความเดิมไว้แทน (เช่น `ทันที`)
 */
function parseThaiDate(raw: string): string | null {
  let s = normalizeText(raw);
  if (!s) return null;
  s = s.replace(/พ\.?ศ\.?/g, "");
  const compact = s.replace(/\s+/g, "");
  const m = THAI_DATE_RE.exec(compact);
  if (!m) return null;

  const day = Number(m[1]);
  const monthToken = normalizeText(m[2]).toLowerCase();
  const month = THAI_MONTHS.find(
    (mo) =>
      mo.full.toLowerCase() === monthToken ||
      mo.abbr.toLowerCase() === monthToken ||
      mo.abbr.replace(/\./g, "").toLowerCase() === monthToken,
  )?.num;
  let year = Number(m[3]);
  if (!month || day < 1 || day > 31) return null;

  if (year < 100) year += 2500;
  if (year > 2400) year -= 543;

  if (year < 1900 || year > 2100) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** เผื่อบางเซลล์เป็นวันที่รูป ISO/สแลชอยู่แล้ว (ไม่ค่อยเจอ แต่กันไว้) */
function parseLooseDate(raw: string): string | null {
  const s = normalizeText(raw);
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  const slash = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(s);
  if (slash) {
    const d = Number(slash[1]);
    const m = Number(slash[2]);
    let y = Number(slash[3]);
    if (y > 2400) y -= 543;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  return null;
}

function parseAnyDateText(raw: string): string | null {
  return parseThaiDate(raw) ?? parseLooseDate(raw);
}

/** วันนี้ตามเวลาไทยแบบ `YYYY-MM-DD` โดยไม่ใช้ `Intl` — บวก UTC+7 แล้วอ่านฟิลด์ UTC */
function bangkokDateKey(instant: Date): string {
  const shifted = new Date(instant.getTime() + 7 * 3600 * 1000);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth() + 1;
  const d = shifted.getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** จำนวนวันจาก `YYYY-MM-DD` หนึ่งไปอีกอัน (เทียบเป็น UTC เที่ยงคืนตรง ๆ) */
function daysBetweenKeys(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/* ------------------------------------------------------------------- เบอร์โทร */

/**
 * ดึงเบอร์มือถือจากข้อความ — ตามกติกาที่เจ้าของงานให้ไว้: หา `\d[\d\- ]{7,}\d`
 * เอาเฉพาะตัวเลข ถ้าได้ 9 หลักขึ้นต้น 6–9 เติม 0 นำหน้า แล้วลองจับกับรูป
 * `0[6-9]XXXXXXXX` ตัวแรกที่ผ่าน · เซลล์ตัวเลขล้วนที่ขาด 0 นำหน้า (เช่น
 * `825465737`) เข้าเงื่อนไขนี้พอดีเพราะ `\d` ครอบตัวเลขไว้แล้วในตัวมันเอง
 */
function parsePhone(raw: string): { value: string; ok: boolean } {
  const text = normalizeText(raw);
  if (!text) return { value: "", ok: true };

  const candidates = text.match(/\d[\d\- ]{7,}\d/g) ?? [text];
  for (const c of candidates) {
    let digits = digitsOnly(c);
    if (digits.length === 9 && /^[6-9]/.test(digits)) digits = `0${digits}`;
    if (/^0[6-9]\d{8}$/.test(digits)) return { value: digits, ok: true };
  }

  const digitsAll = digitsOnly(text);
  return { value: digitsAll || text, ok: false };
}

/* ---------------------------------------------------------------- ตัวเลือกคำตอบ */

interface SynonymRule {
  test: (atomNormalized: string) => boolean;
  to: string;
}

/**
 * คำเก่าจากฟอร์มรุ่นก่อน → ตัวเลือกปัจจุบัน — เก็บเป็นข้อมูล ไม่ใช่โค้ด เพื่อให้เพิ่ม
 * กติกาใหม่ได้ง่าย ๆ โดยไม่ต้องแตะตัวแปลงคำตอบ (ตามที่เจ้าของงานสั่งไว้)
 */
const SYNONYMS: Record<string, SynonymRule[]> = {
  education: [
    { test: (a) => a.startsWith("ปวช"), to: "ปวช." },
    { test: (a) => a.startsWith("ปวส"), to: "ปวส." },
  ],
  relationship: [
    {
      test: (a) => ["พี่สาว", "พี่ชาย", "น้องสาว", "น้องชาย", "น้อง", "พี่"].includes(a),
      to: "พี่/น้อง",
    },
  ],
  religion: [{ test: (a) => a === "ศาสนาพุทธ", to: "พุทธ" }],
  source: [{ test: (a) => a.includes("เฟซ") || a.includes("เฟส"), to: "Facebook" }],
  hr_contact: [
    { test: (a) => a.includes("พี่เล็ก"), to: "เล็ก" },
    { test: (a) => /(^|\s)(คุณ|hr)\s*เจมส์/i.test(a), to: "เจมส์" },
  ],
  upcountry: [{ test: (a) => a === "ไม่ได้", to: "ไม่สามารถไปต่างจังหวัดได้" }],
  health: [
    { test: (a) => a === "ไม่เคย", to: "สุขภาพแข็งแรง ไม่เคยป่วยหนัก หรือไม่มีโรคติดต่อร้ายแรง" },
  ],
  gear: [{ test: (a) => a === "ยังไม่เคยขับ", to: "ยังไม่เคยขับมาก่อน" }],
  alcohol: [
    { test: (a) => a === "ไม่ดื่ม", to: "ไม่ดื่มเลย" },
    { test: (a) => a === "ดื่มเฉพาะเทศกาล", to: "ดื่มนาน ๆ ครั้ง (เช่น ปีละ 1–2 ครั้ง ในเทศกาล)" },
  ],
  exit_reason: [{ test: (a) => a === "รายได้ไม่พอใช้", to: "ค่าตอบแทนหรือสวัสดิการไม่เพียงพอ" }],
  /* ฟอร์มเก่าเขียน “ฮีโน่ 500” เฉย ๆ และสะกด Nisson — ตัวเลือกปัจจุบันมีวงเล็บ/สะกด Nissan */
  car_model: [
    { test: (a) => a === "ฮีโน่ 500", to: "ฮีโน่ 500 (HINO 500)" },
    { test: (a) => /nisson ud trucks/i.test(a), to: "นิสสัน Nissan UD Trucks (รุ่นใหม่)" },
    { test: (a) => /^นิสสัน nisson ud$/i.test(a), to: "นิสสัน Nissan UD" },
  ],
};

type Stat = "matched" | "mapped" | "raw";

function optionByLabel(options: QuestionOption[], label: string): QuestionOption | undefined {
  const norm = normalizeText(label);
  return options.find((o) => normalizeText(o.label) === norm);
}

/** ช่วง (min–max) ที่เดาได้จากข้อความตัวเลือก เช่น `5–10 ปี` `25,000 บาทขึ้นไป` */
function parseOptionRange(label: string): { min: number; max: number } | null {
  const cleaned = normalizeText(label).replace(/,/g, "");
  const nums = [...cleaned.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  if (!nums.length) return null;
  const hasUp = /ขึ้นไป|มากกว่า|เกิน/.test(cleaned);
  const hasDown = /น้อยกว่า|ต่ำกว่า|ไม่ถึง/.test(cleaned);
  if (nums.length === 1) {
    if (hasUp) return { min: nums[0], max: Infinity };
    if (hasDown) return { min: 0, max: nums[0] };
    return { min: nums[0], max: nums[0] };
  }
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

function matchNumericBucket(num: number, options: QuestionOption[]): QuestionOption | null {
  const hits = options.filter((o) => {
    const r = parseOptionRange(o.label);
    return r && num >= r.min && num <= r.max;
  });
  return hits.length === 1 ? hits[0] : null;
}

function convertGenericSingle(
  question: Question,
  raw: string,
  synonyms: SynonymRule[] | undefined,
): { value: string; stat: Stat } {
  const norm = normalizeText(raw);
  const exact = optionByLabel(question.options, norm);
  if (exact) return { value: exact.value, stat: "matched" };

  const rule = synonyms?.find((r) => r.test(norm));
  if (rule) {
    const opt = optionByLabel(question.options, rule.to);
    return { value: opt ? opt.value : rule.to, stat: "mapped" };
  }

  return { value: norm, stat: "raw" };
}

/** ประสบการณ์ขับรถบรรทุกกี่ปี (`[2]`) — มีกติกาปรับช่วงเฉพาะตามที่เจ้าของงานสั่ง */
function convertTruckYears(question: Question, raw: string): { value: string; stat: Stat } {
  const norm = normalizeText(raw);
  const exact = optionByLabel(question.options, norm);
  if (exact) return { value: exact.value, stat: "matched" };

  if (norm.includes("3-4") && norm.includes("ปี")) {
    const target = optionByLabel(question.options, "2-5 ปี");
    if (target) return { value: target.value, stat: "mapped" };
  }
  if (norm.includes("5-6") && norm.includes("ปี")) {
    const target = optionByLabel(question.options, "5-10 ปี");
    if (target) return { value: target.value, stat: "mapped" };
  }
  if (/^7\s*ปีขึ้นไป$/.test(norm)) return { value: norm, stat: "raw" };

  const num = extractFirstNumber(norm);
  if (num != null) {
    const hit = matchNumericBucket(num, question.options);
    if (hit) return { value: hit.value, stat: "mapped" };
  }
  return { value: norm, stat: "raw" };
}

/** รายได้เฉลี่ย 3–6 เดือนของบริษัทล่าสุด — ตัวเลข ≥ 25,000 ปัดเข้ากลุ่มสูงสุดเสมอ */
function convertAvgIncome(question: Question, raw: string): { value: string; stat: Stat } {
  const norm = normalizeText(raw);
  const exact = optionByLabel(question.options, norm);
  if (exact) return { value: exact.value, stat: "matched" };

  const num = extractFirstNumber(norm);
  if (num != null) {
    if (num >= 25000) {
      const top = question.options.find((o) => /25,?000/.test(o.label) && /ขึ้นไป/.test(o.label));
      if (top) return { value: top.value, stat: "mapped" };
    }
    const hit = matchNumericBucket(num, question.options);
    if (hit) return { value: hit.value, stat: "mapped" };
  }
  return { value: norm, stat: "raw" };
}

/**
 * ตัวแปลงคำตอบแบบ `multi` ทั่วไป — หาตัวเลือกที่ปรากฏอยู่ในข้อความก่อน (ยาวสุดก่อน
 * กันทับกัน) ตัดออก ส่วนที่เหลือค่อยแยกด้วยจุลภาคแล้วลองเทียบ synonym ทีละก้อน
 */
function convertGenericMulti(
  question: Question,
  raw: string,
  synonyms: SynonymRule[],
): { value: string[]; stat: Stat } {
  let remaining = normalizeText(raw);
  const matchedValues: string[] = [];
  const sortedOptions = [...question.options].sort((a, b) => b.label.length - a.label.length);

  for (const opt of sortedOptions) {
    const label = normalizeText(opt.label);
    if (!label) continue;
    const idx = remaining.indexOf(label);
    if (idx !== -1) {
      remaining = `${remaining.slice(0, idx)} , ${remaining.slice(idx + label.length)}`;
      matchedValues.push(opt.value);
    }
  }

  const atoms = remaining
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);

  const mappedValues: string[] = [];
  const rawValues: string[] = [];
  for (const atom of atoms) {
    const rule = synonyms.find((r) => r.test(atom));
    if (rule) {
      const opt = optionByLabel(question.options, rule.to);
      mappedValues.push(opt ? opt.value : rule.to);
    } else {
      rawValues.push(atom);
    }
  }

  /* หลายท่อนแปลงเป็นตัวเลือกเดียวกันได้ (ท่อนของป้ายเดิมที่ถูกตัดด้วยจุลภาค) — เก็บครั้งเดียว */
  const value = [...new Set([...matchedValues, ...mappedValues, ...rawValues])];
  const stat: Stat = rawValues.length
    ? "raw"
    : mappedValues.length
      ? "mapped"
      : matchedValues.length
        ? "matched"
        : "raw";
  return { value, stat };
}

/**
 * เหตุผลที่ลาออกจากงานเดิม (`[4]`, multi) — วลีเดียว 3 ท่อนที่มีจุลภาคฝังอยู่ในตัวเอง
 * (`ย้ายที่พักหรือครอบครัว,กลับบ้านต่างจังหวัด`) ต้องกันไว้ก่อนตัดด้วยจุลภาคทั่วไป
 * ไม่งั้นจะถูกแยกเป็นสองท่อนที่ไม่มีความหมายเดี่ยว ๆ
 */
function convertExitReasonMulti(question: Question, raw: string): { value: string[]; stat: Stat } {
  const norm = normalizeText(raw);
  const wholePhrase = normalizeText("ย้ายที่พักหรือครอบครัว,กลับบ้านต่างจังหวัด");
  if (norm === wholePhrase) {
    const first = question.options[0];
    return first ? { value: [first.value], stat: "mapped" } : { value: [norm], stat: "raw" };
  }

  const firstLabel = question.options[0]?.label ?? "";
  const synonyms: SynonymRule[] = [
    ...SYNONYMS.exit_reason,
    { test: (a) => a === "ย้ายที่พัก", to: firstLabel },
    { test: (a) => a === "กลับบ้านต่างจังหวัด", to: firstLabel },
    /* ป้ายเดิมของตัวเลือกแรกสะกด “สถานที” และถูกตัดด้วยจุลภาคเป็นท่อน ๆ */
    { test: (a) => a === "ย้ายที่พักหรือครอบครัว", to: firstLabel },
    { test: (a) => /^บริษัทย้ายสถานที่?ทำงาน$/.test(a), to: firstLabel },
  ];
  return convertGenericMulti(question, raw, synonyms);
}

/** ผลการแปลงคำตอบหนึ่งข้อ — `null` = เซลล์ว่าง ไม่ต้องเซ็ตคำตอบ */
function convertAnswer(
  question: Question,
  rawText: string,
  topic?: string,
): { value: AnswerValue; stat: Stat } | null {
  const raw = rawText.trim();
  if (!raw) return null;

  switch (question.kind) {
    case "single":
      if (topic === "truck_years") return convertTruckYears(question, raw);
      if (topic === "avg_income") return convertAvgIncome(question, raw);
      return convertGenericSingle(question, raw, topic ? SYNONYMS[topic] : undefined);
    case "multi":
      if (topic === "exit_reason") return convertExitReasonMulti(question, raw);
      return convertGenericMulti(question, raw, topic ? (SYNONYMS[topic] ?? []) : []);
    case "number": {
      const num = extractFirstNumber(raw);
      return num != null ? { value: String(Math.round(num)), stat: "matched" } : { value: raw, stat: "raw" };
    }
    case "date": {
      const iso = parseAnyDateText(raw);
      return iso ? { value: iso, stat: "matched" } : { value: raw, stat: "raw" };
    }
    case "tel": {
      const p = parsePhone(raw);
      return { value: p.value, stat: p.ok ? "matched" : "raw" };
    }
    case "nid": {
      const digits = digitsOnly(raw);
      return { value: digits, stat: isValidThaiNationalId(digits) ? "matched" : "raw" };
    }
    default:
      return { value: raw.slice(0, 2000), stat: "matched" };
  }
}

/* --------------------------------------------------------- คอลัมน์ Excel → ปลายทาง */

interface ExcelHeader {
  col: number;
  text: string;
}

/** ตำแหน่งคอลัมน์ที่หัวตารางมีครบทุกคำใน `includes` (และไม่มีคำใน `excludes`) */
function findCol(headers: ExcelHeader[], includes: string[], excludes: string[] = []): number | null {
  const hit = headers.find(
    (h) => includes.every((f) => h.text.includes(f)) && !excludes.some((f) => h.text.includes(f)),
  );
  return hit ? hit.col : null;
}

function findColExact(headers: ExcelHeader[], exact: string): number | null {
  const hit = headers.find((h) => h.text === exact);
  return hit ? hit.col : null;
}

/** หาคำถามที่ยังเปิดใช้อยู่ตอนนี้จากกุญแจที่รู้จักก่อน แล้วค่อยไล่จาก fragment ข้อความ */
function findQuestion(
  questions: Question[],
  includes: string[],
  excludes: string[] = [],
  keys: string[] = [],
): Question | undefined {
  if (keys.length) {
    const byKey = questions.find((q) => keys.includes(q.key));
    if (byKey) return byKey;
  }
  return questions.find(
    (q) => includes.every((f) => q.label.includes(f)) && !excludes.some((f) => q.label.includes(f)),
  );
}

/**
 * คอลัมน์ Excel ธรรมดา 1 คอลัมน์ → คำถาม 1 ข้อในคลังปัจจุบัน — ใช้ fragment ข้อความ
 * เดียวกันทั้งหาคอลัมน์ใน Excel และหาคำถามในคลัง เพราะหัวคอลัมน์เดิมก็ลอกมาจาก
 * ข้อความคำถามของฟอร์มอยู่แล้ว (ยกเว้นไม่กี่ข้อที่ระบุ `questionIncludes` แยกไว้)
 *
 * 11 ข้อใหม่ท้ายตาราง (drugs/alcohol/... ตามที่เจ้าของงานแจ้ง) ยังไม่มีในคลังตอน
 * เขียนโค้ดนี้ — คาดว่า `findQuestion()` จะหาไม่เจอในรอบทดสอบ แล้วจะเจอเองทันทีที่
 * อีกทีมเพิ่มคำถามเข้าคลัง โดยไม่ต้องแก้โค้ดนี้อีก
 */
const QUESTION_COLUMNS: {
  find: string[];
  questionIncludes?: string[];
  excludes?: string[];
  keys?: string[];
  topic?: string;
}[] = [
  { find: ["คำนำหน้า"] },
  { find: ["ชื่อเล่น"] },
  { find: ["อายุเท่าไหร่"], questionIncludes: ["อายุ"] },
  { find: ["นับถือศาสนา"], questionIncludes: ["ศาสนา"], topic: "religion" },
  { find: ["ส่วนสูงเท่าไหร่"], questionIncludes: ["ส่วนสูง"] },
  { find: ["น้ำหนักเท่าไหร่"], questionIncludes: ["น้ำหนัก"] },
  { find: ["สถานภาพของคุณ"], questionIncludes: ["สถานภาพ"] },
  { find: ["จบการศึกษาระดับใด"], questionIncludes: ["การศึกษา"], topic: "education" },
  { find: ["ประสบการณ์ขับรถมาจากบริษัท"] },
  { find: ["ขับรถประเภทไหนได้บ้าง"] },
  { find: ["ระยะเวลาที่ทำงานของบริษัทล่าสุด"] },
  { find: ["รายได้เฉลี่ย"], topic: "avg_income" },
  { find: ["ชื่อ", "ผู้ติดต่อฉุกเฉิน"], questionIncludes: ["ผู้ติดต่อฉุกเฉิน"] },
  {
    find: ["ความสัมพันธ์", "ผู้ติดต่อฉุกเฉิน"],
    questionIncludes: ["ความสัมพันธ์", "ฉุกเฉิน"],
    topic: "relationship",
  },
  { find: ["อาชญากรรม"] },
  { find: ["ยานพาหนะ"] },
  { find: ["ต่างจังหวัด"], topic: "upcountry" },
  { find: ["ทราบข่าวการรับสมัคร"], questionIncludes: ["ทราบข่าว"], topic: "source" },
  { find: ["ป่วยหนัก"], questionIncludes: ["ป่วย"], topic: "health" },
  { find: ["เกียร์"], topic: "gear" },
  { find: ["ขับรถรุ่นอะไรบ้าง"], topic: "car_model" },
  { find: ["ลาออกจากงานเดิม"], questionIncludes: ["ลาออก"], topic: "exit_reason" },
  { find: ["เพื่อนแนะนำเข้ามา"], questionIncludes: ["เพื่อนแนะนำ"] },
  { find: ["ขับรถบรรทุก", "กี่ปี"], topic: "truck_years" },
  { find: ["ที่พักของบริษัท"] },
  { find: ["เสื้อฟอร์ม"] },
  { find: ["รองเท้า"] },
  { find: ["โม่ปูน"] },
  { find: ["เคยทำงานกับ", "มีนาทรานสปอร์ต"] },
  { find: ["ดื่มสุราหรือเครื่องดื่มแอลกอฮอล์"], topic: "alcohol" },
  { find: ["รายจ่ายประจำเดือน"] },
  { find: ["สนใจมาสมัคร", "เพราะเหตุผลอะไร"] },
  { find: ["ช่วยหารายได้อีก"], questionIncludes: ["ช่วยหารายได้"] },
  { find: ["ขั้นต่ำที่รับได้"] },
  { find: ["สารเสพติด"] },
  { find: ["หนี้สินนอกระบบ"] },
  { find: ["สมัครงานที่อื่นไว้แล้ว"] },
  { find: ["วางแผนอย่างไรบ้าง"], questionIncludes: ["รายได้ช่วงเดือนแรก"] },
  { find: ["Google Maps"] },
  { find: ["ใช้ LINE"] },
];

/* ------------------------------------------------------------------ ทะเบียน พจส. */

interface DriverLite {
  code: string;
  name: string;
  phone: string;
  effectiveActive: boolean;
  latestStatus: string;
  latestWorkDateISO: string;
}

/** เหมือน `toIsoDate()` ใน `drivers/registry.ts` แต่เขียนแยกไว้ที่นี่เพราะไฟล์นั้น
 *  เป็นของฝั่ง UI/route และไม่ควรแตะระหว่างที่อีก agent กำลังแก้ไฟล์อื่นในโมดูลนี้ */
function toIsoDateLoose(raw: unknown): string {
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? "" : raw.toISOString().slice(0, 10);
  }
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "";
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value);
  const slash = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(value);
  let y = 0;
  let m = 0;
  let d = 0;
  if (iso) [, y, m, d] = iso.map(Number);
  else if (slash) [, d, m, y] = slash.map(Number);
  else return "";
  if (y > 2400) y -= 543;
  if (m < 1 || m > 12 || d < 1 || d > 31) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

async function loadDriverLites(): Promise<DriverLite[]> {
  const driverDocs = await readDrivers<{
    drivercode?: unknown;
    driverName?: unknown;
    phone?: unknown;
    active?: unknown;
    statusOverride?: unknown;
  }>(["drivercode", "driverName", "phone", "active", "statusOverride"]);

  const codes = [...new Set(driverDocs.map((d) => String(d.drivercode ?? "").trim()).filter(Boolean))];

  interface WorkStatusLite {
    employee_code?: unknown;
    latest_status?: unknown;
    latest_work_date?: unknown;
  }
  let workDocs: WorkStatusLite[] = [];
  if (codes.length) {
    const workStatus = await etlCol<WorkStatusLite>("workStatus");
    workDocs = await workStatus
      .find(
        { employee_code: { $in: codes } },
        { projection: { employee_code: 1, latest_status: 1, latest_work_date: 1 } },
      )
      .toArray();
  }
  const workMap = new Map(workDocs.map((w) => [String(w.employee_code ?? "").trim(), w]));

  return driverDocs
    .map((d): DriverLite => {
      const code = String(d.drivercode ?? "").trim();
      const override = d.statusOverride === "active" || d.statusOverride === "resigned" ? d.statusOverride : null;
      const w = workMap.get(code);
      return {
        code,
        name: String(d.driverName ?? "").trim(),
        phone: String(d.phone ?? "").trim(),
        effectiveActive: override ? override === "active" : Boolean(d.active),
        latestStatus: String(w?.latest_status ?? "").trim(),
        latestWorkDateISO: toIsoDateLoose(w?.latest_work_date),
      };
    })
    .filter((d) => d.code);
}

interface DriverIndex {
  byName: Map<string, DriverLite[]>;
  byPhone: Map<string, DriverLite[]>;
}

function buildDriverIndex(drivers: DriverLite[]): DriverIndex {
  const byName = new Map<string, DriverLite[]>();
  const byPhone = new Map<string, DriverLite[]>();
  for (const d of drivers) {
    if (d.name.trim().length >= 2) {
      const k = nameKey(d.name);
      const arr = byName.get(k) ?? [];
      arr.push(d);
      byName.set(k, arr);
    }
    const p = digitsOnly(d.phone);
    if (p.length >= 9) {
      const arr = byPhone.get(p) ?? [];
      arr.push(d);
      byPhone.set(p, arr);
    }
  }
  return { byName, byPhone };
}

type MatchedBy = "name+phone" | "name" | "phone" | null;

/**
 * จับคู่แถวหนึ่งกับทะเบียน พจส. — ชื่อตรง **หรือ** เบอร์ตรงอย่างใดอย่างหนึ่งก็พอ
 * (ตามคำสั่งเจ้าของงาน 29 ก.ย. 2026) เลือกตัวที่ตรงทั้งคู่ก่อนเสมอ ถ้ามีหลาย
 * ตัวเลือกในกลุ่มเดียวกัน ให้สิทธิ์ตัวที่ effective active ก่อน
 */
function matchDriver(
  index: DriverIndex,
  fullNameForMatch: string,
  phoneDigits: string,
): { driver: DriverLite | null; matchedBy: MatchedBy } {
  const nk = fullNameForMatch.trim().length >= 2 ? nameKey(fullNameForMatch) : "";
  const nameCands = nk ? (index.byName.get(nk) ?? []) : [];
  const phoneCands = phoneDigits.length >= 9 ? (index.byPhone.get(phoneDigits) ?? []) : [];

  const both = nameCands.find((d) => phoneCands.includes(d));
  if (both) return { driver: both, matchedBy: "name+phone" };

  const pick = (list: DriverLite[]) => list.find((d) => d.effectiveActive) ?? list[0] ?? null;
  if (nameCands.length) return { driver: pick(nameCands), matchedBy: "name" };
  if (phoneCands.length) return { driver: pick(phoneCands), matchedBy: "phone" };
  return { driver: null, matchedBy: null };
}

const MATCHED_BY_TH: Record<Exclude<MatchedBy, null>, string> = {
  "name+phone": "ชื่อ+เบอร์",
  name: "ชื่อ",
  phone: "เบอร์",
};

/* ------------------------------------------------------------------------- ใบ */

/** เอกสารใบสมัครที่จะบันทึก — เหมือน `ApplicationDoc` ใน `applications.ts` ทุกช่อง
 *  บวกช่องเฉพาะของการนำเข้า (`importBatch` / `importKey` / `importedAt` /
 *  `legacyRow` / `driverCode`) — คัดลอกรูปร่างมาไว้ที่นี่เพราะ `ApplicationDoc`
 *  ไม่ได้ export ออกจาก `applications.ts` (ตั้งใจให้เป็น internal ของไฟล์นั้น) */
interface ImportedApplicationDoc {
  ref: string;
  status: ApplicationStatus;
  fullName: string;
  phone: string;
  contactOwner: string;
  interview: InterviewRecord;
  exitReason: ExitReason;
  exitReasonNote: string;
  blacklist: boolean;
  answers: AnswerMap;
  questionSnapshot: QuestionSnapshot[];
  files: ApplicationFile[];
  documents: DocumentData;
  documentMeta: DocumentMeta;
  consent: ConsentRecord;
  timeline: TimelineEntry[];
  createdAt: string;
  updatedAt: string;
  importBatch: string;
  importKey: string;
  importedAt: string;
  legacyRow: Record<string, string>;
  driverCode: string;
}

interface ParsedRow {
  row: number;
  /** คอลัมน์ “สถานะสัมภาษณ์” ที่ฝ่ายบุคคลเขียนไว้ในชีต */
  sheetStatus: string;
  submittedAtISO: string;
  submittedBkkKey: string;
  bkkYy: string;
  fullNameRaw: string;
  lastNameRaw: string;
  matchFullName: string;
  phoneRaw: string;
  phoneOk: boolean;
  answers: AnswerMap;
  documents: DocumentData;
  documentMeta: DocumentMeta;
  consentGranted: boolean;
  legacyRow: Record<string, string>;
  driver: DriverLite | null;
  matchedBy: MatchedBy;
}

interface Counters {
  invalidPhone: number;
  invalidNationalId: number;
  unparsedDate: number;
  weakMatch: number;
  unmatchedHeaders: Set<string>;
  newQuestionHeaders: Set<string>;
}

/** ค่าเซลล์เป็นข้อความอ่านง่าย — ใช้ทั้งเก็บ `legacyRow` และป้อนตัวแปลงคำตอบ */
function cellText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return dateOnlyIsoFromExcelDate(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return normalizeText(value);
  if (typeof value === "object") {
    const v = value as { result?: unknown; richText?: { text?: unknown }[] };
    if (Array.isArray(v.richText)) return normalizeText(v.richText.map((r) => String(r.text ?? "")).join(""));
    if ("result" in v) return normalizeText(String(v.result ?? ""));
  }
  return normalizeText(String(value));
}

/** อ่านสมุดงาน → เลือกชีตที่หัวตารางมี “ประทับเวลา” (เลือกชื่อ “การตอบแบบฟอร์ม 1” ก่อน) */
async function loadWorksheet(buffer: Buffer | ArrayBuffer): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);

  const hasTimestamp = (ws: ExcelJS.Worksheet) => {
    let found = false;
    ws.getRow(1).eachCell({ includeEmpty: false }, (cell) => {
      if (normalizeText(cell.value as string) === "ประทับเวลา") found = true;
    });
    return found;
  };

  const preferred = wb.getWorksheet("การตอบแบบฟอร์ม 1");
  if (preferred && hasTimestamp(preferred)) return preferred;

  const found = wb.worksheets.find(hasTimestamp);
  if (found) return found;

  throw new Error(
    'หาชีตคำตอบไม่เจอ — ไม่มีชีตไหนที่หัวตารางแถวแรกมีคอลัมน์ "ประทับเวลา"',
  );
}

/** ข้อความที่คัดลอกจาก Google Sheets/Excel — คั่นแท็บ · เซลล์ที่มีขึ้นบรรทัด/เครื่องหมายคำพูดถูกครอบด้วย `"…"` */
function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else quoted = false;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows.filter((r) => r.some((c) => c.trim()));
}

/**
 * “ประทับเวลา” ที่คัดลอกมาเป็นข้อความ เช่น `20/10/2026 12:29:30` · `20/10/2569, 12:29` · `2026-10-20 12:29:30`
 * → `Date` แบบเดียวกับที่ exceljs คืน (ฟิลด์ UTC = เวลาตามผนังกรุงเทพฯ ดู `timestampInstant()`)
 * · วัน/เดือน ตามแบบไทย — สลับเป็น เดือน/วัน เฉพาะเมื่อเลขตัวที่สองเกิน 12
 */
function parseTimestampText(raw: string): Date | null {
  const s = normalizeText(raw);
  let y: number;
  let mo: number;
  let d: number;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?/.exec(s);
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else {
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?/.exec(s);
    if (!m) return null;
    const [a, b] = [Number(m[1]), Number(m[2])];
    y = Number(m[3]);
    [d, mo] = b > 12 ? [b, a] : [a, b];
  }
  if (y > 2400) y -= 543;
  let hh = Number(m[4]);
  if (/pm/i.test(s) && hh < 12) hh += 12;
  if (/am/i.test(s) && hh === 12) hh = 0;
  const [mi, ss, ms] = [Number(m[5]), Number(m[6] ?? 0), Number((m[7] ?? "0").padEnd(3, "0"))];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mi > 59 || ss > 59) return null;
  return new Date(Date.UTC(y, mo - 1, d, hh, mi, ss, ms));
}

/**
 * แถวที่วางมา → ชีตในหน่วยความจำ ให้ตัวอ่านแถวเดิมทำงานต่อได้ทั้งหมด · แถวแรกมี “ประทับเวลา” = หัวตาราง
 * ไม่มี = ใช้ลำดับคอลัมน์ของชีตจริง (`FORM_SHEET_HEADERS` — ต้องคัดลอกทั้งแถวเริ่มคอลัมน์ A)
 */
function worksheetFromText(text: string): ExcelJS.Worksheet {
  const lines = parseTsv(text);
  if (!lines.length) throw new RecruitmentError("ไม่พบข้อมูลที่วางมา");

  const hasHeader = lines[0].some((c) => normalizeText(c) === "ประทับเวลา");
  const headers = hasHeader ? lines[0] : [...FORM_SHEET_HEADERS];
  const body = hasHeader ? lines.slice(1) : lines;
  if (body.length > MAX_PASTE_ROWS) throw new RecruitmentError(`วางได้ครั้งละไม่เกิน ${MAX_PASTE_ROWS.toLocaleString("th-TH")} แถว`);

  const tsIdx = headers.findIndex((h) => normalizeText(h) === "ประทับเวลา");
  const stamps = body.map((cells) => parseTimestampText(cells[tsIdx] ?? ""));
  if (!stamps.some(Boolean)) {
    throw new RecruitmentError(
      hasHeader
        ? "อ่านคอลัมน์ “ประทับเวลา” ไม่ได้สักแถว"
        : "อ่านคอลัมน์ “ประทับเวลา” ไม่ได้ — คัดลอกทั้งแถวเริ่มคอลัมน์ A หรือคัดลอกแถวหัวตารางมาด้วย",
    );
  }

  const ws = new ExcelJS.Workbook().addWorksheet("วางจาก Excel");
  ws.addRow(headers);
  body.forEach((cells, i) => {
    const values: unknown[] = cells.map((c) => (c.trim() ? c : null));
    values[tsIdx] = stamps[i] ?? (cells[tsIdx]?.trim() || null);
    ws.addRow(values);
  });
  return ws;
}

function readHeaders(ws: ExcelJS.Worksheet): { headers: ExcelHeader[]; originalText: Map<number, string> } {
  const headers: ExcelHeader[] = [];
  const originalText = new Map<number, string>();
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    const raw = typeof cell.value === "string" ? cell.value : String(cell.value ?? "");
    originalText.set(col, raw.trim());
    headers.push({ col, text: normalizeText(cell.value as string) });
  });
  return { headers, originalText };
}

/* ------------------------------------------------------ อายุจากวันเกิด (สำรอง) */

function ageFromBirthDate(birthISO: string, submittedBkkKey: string): number | null {
  const by = Number(birthISO.slice(0, 4));
  const bmd = birthISO.slice(5, 10);
  const sy = Number(submittedBkkKey.slice(0, 4));
  const smd = submittedBkkKey.slice(5, 10);
  if (!by || !sy) return null;
  let age = sy - by;
  if (smd < bmd) age -= 1;
  return age >= 0 && age < 110 ? age : null;
}

/* --------------------------------------------------------------- อ่านหนึ่งแถว */

interface ColumnMap {
  timestampCol: number;
  fullNameCol: number | null;
  lastNameCol: number | null;
  phoneCol: number | null;
  addressCol: number | null; // ที่อยู่ตามทะเบียนบ้าน
  currentAddressCol: number | null; // ที่อยู่ปัจจุบัน
  birthDateCol: number | null;
  nationalIdCol: number | null;
  licenseTypeCol: number | null;
  licenseNoCol: number | null;
  licenseExpiryCol: number | null;
  emergencyPhoneCol: number | null;
  consentCol: number | null;
  questionCols: {
    col: number;
    question: Question | undefined;
    topic: string | undefined;
    headerText: string;
    isNewQuestion: boolean;
  }[];
  workZoneCol: number | null;
  readyDateCol: number | null;
  hrContactCol: number | null;
  sheetStatusCol: number | null;
}

function buildColumnMap(headers: ExcelHeader[], questions: Question[], counters: Counters): ColumnMap {
  const timestampCol = findColExact(headers, "ประทับเวลา");
  if (timestampCol == null) throw new Error('ไม่พบคอลัมน์ "ประทับเวลา" ในชีตนี้');

  const questionCols: ColumnMap["questionCols"] = [];
  for (const rule of QUESTION_COLUMNS) {
    if (!rule.find.length) continue; // ช่องว่างที่ตั้งใจข้าม (เอกสารล้วน จัดการแยก)
    const col = findCol(headers, rule.find, rule.excludes);
    if (col == null) continue;
    const question = findQuestion(
      questions,
      rule.questionIncludes ?? rule.find,
      rule.excludes,
      rule.keys ?? [],
    );
    const headerText = headers.find((h) => h.col === col)?.text ?? "";
    const isNewQuestion = !question;
    if (!question) {
      if (NEW_QUESTION_HINTS.some((f) => headerText.includes(f))) {
        counters.newQuestionHeaders.add(headerText);
      } else {
        counters.unmatchedHeaders.add(headerText);
      }
    }
    questionCols.push({ col, question, topic: rule.topic, headerText, isNewQuestion });
  }

  // accident_history: กุญแจก่อน แล้วค่อย fragment (กันชนกับคำถามโม่ปูนที่พูดถึงอุบัติเหตุด้วย)
  const accidentCol = findCol(headers, ["อุบัติเหตุ"], []);
  if (accidentCol != null) {
    const q = findQuestion(questions, ["อุบัติเหตุ"], ["โม่ปูน"], ["accident_history"]);
    const headerText = headers.find((h) => h.col === accidentCol)?.text ?? "";
    if (!q) counters.unmatchedHeaders.add(headerText);
    questionCols.push({ col: accidentCol, question: q, topic: undefined, headerText, isNewQuestion: !q });
  }

  return {
    timestampCol,
    fullNameCol: findColExact(headers, "ชื่อ"),
    lastNameCol: findColExact(headers, "นามสกุล"),
    phoneCol: findCol(headers, ["เบอร์โทรศัพท์มือถือ"]),
    addressCol: findColExact(headers, "ที่อยู่ตามทะเบียนบ้าน"),
    currentAddressCol: findCol(headers, ["ที่อยู่ปัจจุบัน"]),
    birthDateCol: findCol(headers, ["เกิดวันที่"]),
    nationalIdCol: findCol(headers, ["เลขที่บัตรประชาชน"]),
    licenseTypeCol: findCol(headers, ["มีใบขับขี่ประเภทอะไร"]),
    licenseNoCol: findCol(headers, ["เลขที่ใบขับขี่"]),
    licenseExpiryCol: findCol(headers, ["หมดอายุวันที่"]),
    emergencyPhoneCol: findCol(headers, ["เบอร์ติดต่อ", "ผู้ติดต่อฉุกเฉิน"]),
    consentCol: findCol(headers, ["โดยการทำเครื่องหมาย"]),
    questionCols,
    workZoneCol: findCol(headers, ["สนใจทำงานเขตไหน"]),
    readyDateCol: findCol(headers, ["เริ่มงานได้วันที่"]),
    hrContactCol: findCol(headers, ["ติดต่อเจ้าหน้าที่ฝ่ายบุคคล"]),
    sheetStatusCol: findColExact(headers, "สถานะสัมภาษณ์"),
  };
}

/** 11 หัวคอลัมน์ของคำถามใหม่ที่ยังไม่มีในคลัง ณ วันที่เขียนโค้ดนี้ — กันไม่ให้ไปปนกับ
 *  "หาคำถามไม่เจอ" ของคอลัมน์อื่นที่ควรมีคำถามรองรับอยู่แล้วจริง ๆ */
const NEW_QUESTION_HINTS = [
  "สารเสพติด",
  "แอลกอฮอล์",
  "Google Maps",
  "ใช้ LINE",
  "เพราะเหตุผลอะไร",
  "ขั้นต่ำที่รับได้",
  "สมัครงานที่อื่นไว้แล้ว",
  "วางแผนอย่างไรบ้าง",
  "รายจ่ายประจำเดือน",
  "ช่วยหารายได้อีก",
  "หนี้สินนอกระบบ",
];

function setDocField(
  documents: DocumentData,
  field: (typeof DOCUMENT_FIELDS)[number],
  value: string,
  counters: Counters,
  warnKind: "nid" | "date" | "other",
): void {
  const message = validateDocumentField(field, value);
  if (message) {
    if (warnKind === "nid") counters.invalidNationalId += 1;
    if (warnKind === "date") counters.unparsedDate += 1;
    return;
  }
  if (value) (documents as unknown as Record<string, string>)[field.key] = value;
}

function parseRow(
  ws: ExcelJS.Worksheet,
  rowNumber: number,
  cols: ColumnMap,
  originalHeaderText: Map<number, string>,
  questions: Question[],
  counters: Counters,
): ParsedRow | "blank" | "invalid" {
  const row = ws.getRow(rowNumber);
  const tsValue = row.getCell(cols.timestampCol).value;
  if (tsValue == null || tsValue === "") return "blank";

  const instant = timestampInstant(tsValue);
  if (!instant) return "invalid";

  const fullNameRaw = cols.fullNameCol ? cellText(row.getCell(cols.fullNameCol).value) : "";
  if (!fullNameRaw) return "invalid";

  const submittedAtISO = instant.toISOString();
  const bkkWallClock = tsValue as Date;
  const bkkYear = bkkWallClock.getUTCFullYear();
  const bkkYy = String((bkkYear + 543) % 100).padStart(2, "0");
  const submittedBkkKey = `${bkkYear}-${String(bkkWallClock.getUTCMonth() + 1).padStart(2, "0")}-${String(bkkWallClock.getUTCDate()).padStart(2, "0")}`;

  const lastNameRaw = cols.lastNameCol ? cellText(row.getCell(cols.lastNameCol).value) : "";
  const matchFullName = composeName(fullNameRaw, lastNameRaw);

  const phoneCellRaw = cols.phoneCol ? cellText(row.getCell(cols.phoneCol).value) : "";
  const phone = parsePhone(phoneCellRaw);
  if (!phone.ok && phoneCellRaw) counters.invalidPhone += 1;

  // ---------- legacyRow: ทุกเซลล์ที่ไม่ว่างของแถวนี้ (ยกเว้นคอลัมน์สูตร ชื่อ-นามสกุล) ----------
  const legacyRow: Record<string, string> = {};
  row.eachCell({ includeEmpty: false }, (cell, col) => {
    const header = originalHeaderText.get(col);
    if (!header) return;
    if (normalizeText(header) === "ชื่อ-นามสกุล") return; // คอลัมน์สูตร ตามที่สั่งให้ข้าม
    const text = cellText(cell.value);
    if (text) legacyRow[header] = text;
  });

  // ---------- คำตอบ ----------
  const answers: AnswerMap = {};

  const fullNameQ = questions.find((q) => q.key === "full_name");
  if (fullNameQ) answers[fullNameQ.key] = fullNameRaw.slice(0, 2000);

  if (lastNameRaw) {
    const lastNameQ = findByRole(questions, "last_name");
    if (lastNameQ) answers[lastNameQ.key] = lastNameRaw.slice(0, 2000);
  }

  const phoneQ = questions.find((q) => q.key === "phone");
  if (phoneQ && phone.value) answers[phoneQ.key] = phone.value;

  if (cols.workZoneCol) {
    const q = findByRole(questions, "work_zone");
    const text = cellText(row.getCell(cols.workZoneCol).value);
    if (q && text) {
      const r = convertAnswer(q, text);
      if (r) answers[q.key] = r.value;
    }
  }
  if (cols.readyDateCol) {
    const q = findByRole(questions, "ready_date");
    const text = cellText(row.getCell(cols.readyDateCol).value);
    if (q && text) {
      const r = convertAnswer(q, text);
      if (r) answers[q.key] = r.value;
    }
  }
  if (cols.hrContactCol) {
    const q = findByRole(questions, "hr_contact");
    const text = cellText(row.getCell(cols.hrContactCol).value);
    if (q && text) {
      const r = convertAnswer(q, text, "hr_contact");
      if (r) answers[q.key] = r.value;
    }
  }

  // ที่อยู่ปัจจุบัน (ถ้ามี) มาก่อนที่อยู่ตามทะเบียนบ้าน สำหรับคำถาม home_province
  const currentAddrText = cols.currentAddressCol ? cellText(row.getCell(cols.currentAddressCol).value) : "";
  const regAddrText = cols.addressCol ? cellText(row.getCell(cols.addressCol).value) : "";
  const homeProvinceQ = findQuestion(questions, ["จังหวัด"], [], ["home_province"]);
  if (homeProvinceQ) {
    const text = currentAddrText || regAddrText;
    if (text) {
      const r = convertAnswer(homeProvinceQ, text);
      if (r) answers[homeProvinceQ.key] = r.value;
    }
  }

  // วันเกิด — เป็นได้ทั้งคำถาม birth_date และเอกสาร documents.birthDate
  let birthDateISO = "";
  if (cols.birthDateCol) {
    const cellValue = row.getCell(cols.birthDateCol).value;
    if (cellValue instanceof Date) birthDateISO = dateOnlyIsoFromExcelDate(cellValue);
    else {
      const text = cellText(cellValue);
      const parsed = text ? parseAnyDateText(text) : null;
      if (text && !parsed) counters.unparsedDate += 1;
      birthDateISO = parsed ?? "";
      const birthDateQ = questions.find((q) => q.key === "birth_date");
      if (birthDateQ && text) answers[birthDateQ.key] = parsed ?? text;
    }
    if (birthDateISO) {
      const birthDateQ = questions.find((q) => q.key === "birth_date");
      if (birthDateQ && !(birthDateQ.key in answers)) answers[birthDateQ.key] = birthDateISO;
    }
  }

  // อายุ — ถ้าคอลัมน์ตัวเลขว่าง/อ่านไม่ออก คำนวณจากวันเกิดแทน
  const ageQ = findQuestion(questions, ["อายุ"], [], []);
  const ageColEntry = cols.questionCols.find((c) => c.headerText.includes("อายุเท่าไหร่"));
  if (ageQ && ageColEntry) {
    const text = cellText(row.getCell(ageColEntry.col).value);
    const num = text ? extractFirstNumber(text) : null;
    if (num != null) {
      answers[ageQ.key] = String(Math.round(num));
    } else if (birthDateISO) {
      const computed = ageFromBirthDate(birthDateISO, submittedBkkKey);
      if (computed != null) answers[ageQ.key] = String(computed);
    }
  }

  // ทั่วไป — คอลัมน์คำถามที่เหลือทั้งหมดตาม QUESTION_COLUMNS
  for (const entry of cols.questionCols) {
    if (entry.headerText.includes("อายุเท่าไหร่")) continue; // จัดการแยกไปแล้วข้างบน
    if (!entry.question) continue;
    const text = cellText(row.getCell(entry.col).value);
    if (!text) continue;
    const r = convertAnswer(entry.question, text, entry.topic);
    if (r) answers[entry.question.key] = r.value;
  }

  // เบอร์ติดต่อผู้ติดต่อฉุกเฉิน — เก็บเป็นข้อความ แต่ normalize เลขเบอร์ให้ก่อน
  if (cols.emergencyPhoneCol) {
    const emergencyQ = findQuestion(questions, ["เบอร์ติดต่อ", "ผู้ติดต่อฉุกเฉิน"]);
    const text = cellText(row.getCell(cols.emergencyPhoneCol).value);
    if (emergencyQ && text) {
      const p = parsePhone(text);
      if (!p.ok) counters.invalidPhone += 1;
      answers[emergencyQ.key] = p.value || text;
    }
  }

  // ---------- documents ----------
  const documents: DocumentData = { ...EMPTY_DOCUMENT_DATA };
  const documentMeta: DocumentMeta = { ...EMPTY_DOCUMENT_META, source: "manual" };

  const nationalIdField = DOCUMENT_FIELDS.find((f) => f.key === "nationalId")!;
  if (cols.nationalIdCol) {
    const digits = digitsOnly(cellText(row.getCell(cols.nationalIdCol).value));
    if (digits) setDocField(documents, nationalIdField, digits, counters, "nid");
  }

  const addressField = DOCUMENT_FIELDS.find((f) => f.key === "address")!;
  if (regAddrText) setDocField(documents, addressField, regAddrText.slice(0, 200), counters, "other");

  const birthDateField = DOCUMENT_FIELDS.find((f) => f.key === "birthDate")!;
  if (birthDateISO) setDocField(documents, birthDateField, birthDateISO, counters, "date");

  const licenseNoField = DOCUMENT_FIELDS.find((f) => f.key === "licenseNo")!;
  if (cols.licenseNoCol) {
    const text = cellText(row.getCell(cols.licenseNoCol).value);
    if (text) setDocField(documents, licenseNoField, text.slice(0, 200), counters, "other");
  }

  const licenseTypeField = DOCUMENT_FIELDS.find((f) => f.key === "licenseType")!;
  if (cols.licenseTypeCol) {
    const text = cellText(row.getCell(cols.licenseTypeCol).value);
    if (text) setDocField(documents, licenseTypeField, text.slice(0, 200), counters, "other");
  }

  const licenseExpiryField = DOCUMENT_FIELDS.find((f) => f.key === "licenseExpiry")!;
  if (cols.licenseExpiryCol) {
    const cellValue = row.getCell(cols.licenseExpiryCol).value;
    let iso = "";
    if (cellValue instanceof Date) iso = dateOnlyIsoFromExcelDate(cellValue);
    else {
      const text = cellText(cellValue);
      if (text) {
        iso = parseAnyDateText(text) ?? "";
        if (!iso) counters.unparsedDate += 1;
      }
    }
    if (iso) setDocField(documents, licenseExpiryField, iso, counters, "date");
  }

  // ---------- ความยินยอม ----------
  const consentText = cols.consentCol ? cellText(row.getCell(cols.consentCol).value) : "";
  const consentGranted = consentText.trim() === "ยินยอม";

  return {
    row: rowNumber,
    sheetStatus: cols.sheetStatusCol ? cellText(row.getCell(cols.sheetStatusCol).value) : "",
    submittedAtISO,
    submittedBkkKey,
    bkkYy,
    fullNameRaw,
    lastNameRaw,
    matchFullName,
    phoneRaw: phone.value,
    phoneOk: phone.ok,
    answers,
    documents,
    documentMeta,
    consentGranted,
    legacyRow,
    driver: null,
    matchedBy: null,
  };
}

/* --------------------------------------------------------------- ประกอบรายงาน */

interface BuildResult {
  report: ImportReport;
  toInsert: {
    parsed: ParsedRow;
    outcome: ImportOutcome;
    driver: DriverLite | null;
    matchedBy: MatchedBy;
    hit?: BlacklistHit & { row?: number };
  }[];
}

/**
 * เส้นแบ่ง “ใบใหม่” — `createdAt` ของใบล่าสุดที่เคยนำเข้าจากฟอร์ม (Sync ครั้งก่อน) · ยังไม่เคยนำเข้าเลย
 * = ย้อนหลัง `recentDays` วัน · แถวที่วางมาเองถือเป็นใบใหม่ทุกแถว (`null`)
 */
async function resolveSince(source: ImportSource, recentDays: number, now: Date): Promise<string | null> {
  if ("text" in source) return null;
  const col = await hrCol("applications");
  const last = await col
    .find({ importKey: { $exists: true, $ne: "" } }, { projection: { createdAt: 1 } })
    .sort({ createdAt: -1 })
    .limit(1)
    .next();
  return typeof last?.createdAt === "string"
    ? last.createdAt
    : new Date(now.getTime() - recentDays * 86_400_000).toISOString();
}

/** สถานะในชีต → หมายเหตุเหตุผลที่ยกเลิก (ตัดอีโมจิ/ช่องว่างหัวท้าย) */
function blacklistNote(sheetStatus: string): string {
  return sheetStatus.replace(/^[^\p{L}\p{N}]+/u, "").trim().slice(0, EXIT_REASON_NOTE_MAX) || "Blacklist";
}

function describeHit(hit: BlacklistHit): string {
  return `${hit.ref} ${hit.fullName} (${hit.by.map((b) => (b === "phone" ? "เบอร์" : "ชื่อ")).join("+")})`;
}

async function buildImport(
  source: ImportSource,
  opts: { recentDays: number; now?: Date },
): Promise<BuildResult> {
  const recentDays = Math.min(60, Math.max(1, Math.round(opts.recentDays)));
  const now = opts.now ?? new Date();
  const nowKey = bangkokDateKey(now);

  const [ws, questions, drivers, since, savedBlacklist] = await Promise.all([
    "text" in source ? worksheetFromText(source.text) : loadWorksheet(source.buffer),
    listActiveQuestions(),
    loadDriverLites(),
    resolveSince(source, recentDays, now),
    listBlacklist(),
  ]);
  const driverIndex = buildDriverIndex(drivers);
  const isNew = (r: ParsedRow) => since === null || r.submittedAtISO > since;

  const { headers, originalText } = readHeaders(ws);
  const counters: Counters = {
    invalidPhone: 0,
    invalidNationalId: 0,
    unparsedDate: 0,
    weakMatch: 0,
    unmatchedHeaders: new Set(),
    newQuestionHeaders: new Set(),
  };
  const cols = buildColumnMap(headers, questions, counters);

  let totalRows = 0;
  let invalidCount = 0;
  const parsedRows: ParsedRow[] = [];

  for (let r = 2; r <= ws.rowCount; r += 1) {
    const result = parseRow(ws, r, cols, originalText, questions, counters);
    if (result === "blank") continue;
    totalRows += 1;
    if (result === "invalid") {
      invalidCount += 1;
      continue;
    }
    const { driver, matchedBy } = matchDriver(driverIndex, result.matchFullName, digitsOnly(result.phoneRaw));
    result.driver = driver;
    result.matchedBy = matchedBy;
    if (matchedBy && matchedBy !== "name+phone") counters.weakMatch += 1;
    parsedRows.push(result);
  }

  // ---------- แถวที่ชีตเขียนว่า Blacklist — แยกกองก่อนตัดซ้ำ ไม่งั้นใบที่ส่งมาใหม่ทีหลังจะกลบเครื่องหมายนี้ทิ้ง ----------
  const duplicateRows = new Set<ParsedRow>();
  const blacklistReps = new Set<ParsedRow>();
  {
    const byPerson = new Map<string, ParsedRow[]>();
    for (const r of parsedRows) {
      if (!BLACKLIST_RE.test(r.sheetStatus)) continue;
      const key = digitsOnly(r.phoneRaw) || nameKey(r.matchFullName);
      byPerson.set(key, [...(byPerson.get(key) ?? []), r]);
    }
    for (const rows of byPerson.values()) {
      rows.sort((a, b) => b.submittedAtISO.localeCompare(a.submittedAtISO));
      blacklistReps.add(rows[0]);
      for (const extra of rows.slice(1)) duplicateRows.add(extra);
    }
  }
  const blacklisted = (r: ParsedRow) => BLACKLIST_RE.test(r.sheetStatus);

  // ---------- ตัดซ้ำ: จับคู่ พจส. คนเดียวกัน เก็บใบล่าสุด ----------
  const byDriver = new Map<string, ParsedRow[]>();
  const unmatched: ParsedRow[] = [];
  for (const r of parsedRows) {
    if (blacklisted(r)) continue;
    if (r.driver) {
      const arr = byDriver.get(r.driver.code) ?? [];
      arr.push(r);
      byDriver.set(r.driver.code, arr);
    } else {
      unmatched.push(r);
    }
  }

  const driverRepresentative = new Map<string, ParsedRow>();
  for (const [code, rows] of byDriver) {
    rows.sort((a, b) => b.submittedAtISO.localeCompare(a.submittedAtISO));
    driverRepresentative.set(code, rows[0]);
    for (const extra of rows.slice(1)) duplicateRows.add(extra);
  }

  const byPhone = new Map<string, ParsedRow[]>();
  for (const r of unmatched) {
    const digits = digitsOnly(r.phoneRaw);
    const key = digits || `__row_${r.row}`;
    const arr = byPhone.get(key) ?? [];
    arr.push(r);
    byPhone.set(key, arr);
  }
  const phoneRepresentative = new Set<ParsedRow>();
  for (const rows of byPhone.values()) {
    rows.sort((a, b) => b.submittedAtISO.localeCompare(a.submittedAtISO));
    phoneRepresentative.add(rows[0]);
    for (const extra of rows.slice(1)) duplicateRows.add(extra);
  }

  // ---------- จัดสถานะของตัวแทนแต่ละคน ----------
  type Classified = {
    parsed: ParsedRow;
    outcome: ImportOutcome | null;
    skip: ImportSkipReason | null;
    /** ใบใหม่ที่ชนกับ Blacklist — `row` = ชนกับแถว Blacklist ในรอบเดียวกันนี้ (ยังไม่มีเลขใบ) */
    hit?: BlacklistHit & { row?: number };
  };
  const classified: Classified[] = [];

  for (const r of parsedRows) {
    if (duplicateRows.has(r)) {
      classified.push({ parsed: r, outcome: null, skip: "duplicate" });
      continue;
    }
    if (blacklistReps.has(r)) {
      classified.push({ parsed: r, outcome: "blacklist", skip: null });
      continue;
    }
    if (r.driver) {
      const d = r.driver;
      if (d.latestStatus === "ฝ" && d.latestWorkDateISO) {
        const age = Math.abs(daysBetweenKeys(d.latestWorkDateISO, nowKey));
        if (age <= TRAINING_WINDOW_DAYS) {
          classified.push({ parsed: r, outcome: "training", skip: null });
          continue;
        }
      }
      if (d.effectiveActive && !EXIT_STATUS_CODES.includes(d.latestStatus)) {
        classified.push({ parsed: r, outcome: "working", skip: null });
        continue;
      }
      // พ้นสภาพแล้วแต่ส่งใบมาหลัง Sync ครั้งก่อน = สมัครกลับมาใหม่ → รอการติดต่อ (หมายเหตุว่าเคยเป็น พจส.)
      classified.push(
        isNew(r)
          ? { parsed: r, outcome: "pending_contact", skip: null }
          : { parsed: r, outcome: null, skip: "resigned" },
      );
      continue;
    }
    if (!phoneRepresentative.has(r)) {
      // ไม่ได้ตัวแทนของกลุ่มเบอร์ (ไม่ควรเกิด เพราะกลุ่มที่ไม่ซ้ำก็มีตัวแทนเป็นตัวเอง)
      classified.push({ parsed: r, outcome: null, skip: "duplicate" });
      continue;
    }
    classified.push(
      isNew(r)
        ? { parsed: r, outcome: "pending_contact", skip: null }
        : { parsed: r, outcome: null, skip: "not_found_old" },
    );
  }

  // ---------- กันซ้ำกับใบที่มีอยู่แล้วในฐาน ----------
  const existingImportKeys = new Set<string>();
  /** เบอร์ → `createdAt` ทุกใบในฐาน — ใบที่สร้างหลังเวลาส่งแถวนี้แล้ว = คนนี้มีใบในระบบแล้ว
   *  (กันแถวที่วางมาซึ่งเวลาไม่มีมิลลิวินาที และใบที่ฝ่ายบุคคลสร้างเองด้วยมือ) */
  const existingByPhone = new Map<string, string[]>();
  let existingPhoneHits = new Set<string>();

  const candidates = classified.filter((c) => c.outcome);
  if (candidates.length) {
    const col = await hrCol("applications");

    const keys = await col.distinct("importKey", { importKey: { $exists: true, $ne: "" } });
    for (const k of keys) if (typeof k === "string") existingImportKeys.add(k);

    const phones = [...new Set(candidates.map((c) => digitsOnly(c.parsed.phoneRaw)).filter(Boolean))];
    const windowStart = new Date(now.getTime() - DUPLICATE_WINDOW_DAYS * 24 * 3600 * 1000).toISOString();
    const existing = await col
      .find({ phone: { $in: phones } }, { projection: { phone: 1, status: 1, createdAt: 1 } })
      .toArray();
    for (const d of existing) {
      const list = existingByPhone.get(String(d.phone)) ?? [];
      list.push(String(d.createdAt ?? ""));
      existingByPhone.set(String(d.phone), list);
    }
    // เอาเฉพาะสถานะที่ยัง "กำลังพิจารณาอยู่" ตามกติกาเดียวกับ guardDuplicate()
    existingPhoneHits = new Set(
      existing
        .filter((d) => String(d.createdAt ?? "") >= windowStart && !DUPLICATE_BLOCKING_STATUSES.has(String(d.status)))
        .map((d) => String(d.phone)),
    );
  }

  for (const c of classified) {
    if (c.outcome === null) continue;
    const phone = digitsOnly(c.parsed.phoneRaw);
    const submittedSecond = c.parsed.submittedAtISO.slice(0, 19);
    if (
      existingImportKeys.has(computeImportKey(c.parsed)) ||
      (existingByPhone.get(phone) ?? []).some((at) => at.slice(0, 19) >= submittedSecond)
    ) {
      c.outcome = null;
      c.skip = "already_imported";
      continue;
    }
    if (c.outcome === "pending_contact" && existingPhoneHits.has(phone)) {
      c.outcome = null;
      c.skip = "duplicate";
    }
  }

  // ---------- ใบใหม่ที่ชื่อ/เบอร์ตรงกับ Blacklist (ในระบบ + แถว Blacklist ของรอบนี้) ----------
  const blacklistPool: (BlacklistEntry & { row?: number })[] = [
    ...savedBlacklist,
    ...classified
      .filter((c) => c.outcome === "blacklist")
      .map((c) => ({ ref: `แถว ${c.parsed.row}`, fullName: c.parsed.matchFullName, phone: c.parsed.phoneRaw, row: c.parsed.row })),
  ];
  for (const c of classified) {
    if (c.outcome !== "pending_contact") continue;
    const hit = findBlacklistHit({ ref: "", fullName: c.parsed.matchFullName, phone: c.parsed.phoneRaw }, blacklistPool);
    if (hit) c.hit = { ...hit, row: blacklistPool.find((e) => e.ref === hit.ref)?.row };
  }

  // ---------- นับผล ----------
  const counts: Record<ImportOutcome, number> = { training: 0, working: 0, pending_contact: 0, blacklist: 0 };
  const skipped: Record<ImportSkipReason, number> = {
    already_imported: 0,
    resigned: 0,
    not_found_old: 0,
    duplicate: 0,
    invalid: invalidCount,
  };

  const rows: ImportRow[] = [];
  const answerStatsMap = new Map<string, { label: string; matched: number; mapped: number; raw: number }>();
  const toInsert: BuildResult["toInsert"] = [];

  for (const c of classified) {
    const { parsed } = c;
    if (c.outcome) counts[c.outcome] += 1;
    if (c.skip) skipped[c.skip] += 1;

    const includeInRows = c.outcome !== null || c.skip === "resigned" || c.skip === "duplicate" || c.skip === "already_imported";
    if (includeInRows) {
      rows.push({
        row: parsed.row,
        submittedAt: parsed.submittedAtISO,
        fullName: composeName(parsed.fullNameRaw, parsed.lastNameRaw),
        phone: parsed.phoneRaw,
        outcome: c.outcome,
        skip: c.skip,
        matchedBy: parsed.driver ? parsed.matchedBy : null,
        driverCode: parsed.driver?.code ?? "",
        driverName: parsed.driver?.name ?? "",
        workStatus: parsed.driver?.latestStatus ?? "",
        ...(c.hit ? { blacklistHit: describeHit(c.hit) } : {}),
        ...(parsed.sheetStatus ? { sheetStatus: parsed.sheetStatus } : {}),
      });
    }

    if (c.outcome) {
      toInsert.push({ parsed, outcome: c.outcome, driver: parsed.driver, matchedBy: parsed.matchedBy, hit: c.hit });
    }
  }

  // สถิติคำตอบ — คำนวณใหม่ตรง ๆ จากคำตอบที่ประกอบแล้วของทุกแถวที่ "จะนำเข้า" เท่านั้น
  // (แถวที่ถูกข้ามไม่ควรมาปนสถิติของคำตอบที่ใช้จริง)
  for (const c of classified) {
    if (!c.outcome) continue;
    for (const entry of cols.questionCols) {
      if (!entry.question) continue;
      const text = cellText((ws.getRow(c.parsed.row).getCell(entry.col) as ExcelJS.Cell).value);
      if (!text) continue;
      const conv = convertAnswer(entry.question, text, entry.topic);
      if (!conv) continue;
      const stat = answerStatsMap.get(entry.question.key) ?? {
        label: entry.question.label,
        matched: 0,
        mapped: 0,
        raw: 0,
      };
      stat[conv.stat] += 1;
      answerStatsMap.set(entry.question.key, stat);
    }
  }

  const warnings: string[] = [];
  if (counters.invalidPhone) warnings.push(`เบอร์โทรที่อ่านไม่เข้ารูป 06/07/08/09 ตามด้วย 8 หลัก: ${counters.invalidPhone} จุด`);
  if (counters.invalidNationalId) warnings.push(`เลขบัตรประชาชนที่ตรวจเลขหลักสุดท้ายไม่ผ่าน: ${counters.invalidNationalId} แถว`);
  if (counters.unparsedDate) warnings.push(`วันที่แบบข้อความแปลงเป็น YYYY-MM-DD ไม่ได้ (เก็บข้อความเดิมไว้แทน): ${counters.unparsedDate} จุด`);
  if (counters.weakMatch) warnings.push(`จับคู่ พจส. ได้จากชื่อหรือเบอร์เพียงอย่างเดียว ควรตรวจด้วยตา: ${counters.weakMatch} แถว`);
  if (counters.newQuestionHeaders.size) {
    warnings.push(
      `คอลัมน์คำถามใหม่ ${counters.newQuestionHeaders.size} ข้อยังไม่มีในคลังคำถามปัจจุบัน (จะจับคู่ได้เองหลังเพิ่มคำถามแล้ว โดยไม่ต้องแก้โค้ดนี้): ${[...counters.newQuestionHeaders].join(" · ")}`,
    );
  }
  if (counters.unmatchedHeaders.size) {
    warnings.push(
      `คอลัมน์ที่ควรจับคู่กับคำถามในคลังได้แต่หาไม่เจอ — ตรวจคลังคำถามหรือปรับ fragment ในโค้ด: ${[...counters.unmatchedHeaders].join(" · ")}`,
    );
  }

  const report: ImportReport = {
    committed: false,
    batch: "",
    sheet: ws.name,
    recentDays,
    since,
    totalRows,
    counts,
    skipped,
    rows,
    answers: [...answerStatsMap.values()] as ImportAnswerStat[],
    warnings,
  };

  return { report, toInsert };
}

function computeImportKey(parsed: ParsedRow): string {
  const digits = digitsOnly(parsed.phoneRaw);
  const raw = `${parsed.submittedAtISO}|${digits}|${parsed.fullNameRaw}${parsed.lastNameRaw}`;
  return createHash("sha1").update(raw).digest("hex");
}

/* --------------------------------------------------------------- ล็อกเลข ref */

/** จองเลข ref เป็นก้อนเดียวต่อปี พ.ศ. — `$inc` หนึ่งครั้งได้เลขท้ายบล็อกกลับมา
 *  เลขต้นบล็อก = เลขท้าย − จำนวนที่จอง + 1 (รูปแบบเดียวกับ `nextRef()` ใน
 *  `applications.ts` แต่จองเป็นก้อนแทนทีละ 1 เพราะนำเข้าครั้งเดียวหลายพันแถว) */
function reserveRefBlock(yy: string, count: number): Promise<number> {
  return nextSeq("recruitmentCounters", `recruitment:${yy}`, count);
}

/* ------------------------------------------------------------------ ทางเข้า */

/** ตรวจไฟล์อย่างเดียว ไม่เขียนอะไรลงฐานข้อมูลทั้งสิ้น */
export async function previewImport(
  source: ImportSource,
  opts: { recentDays: number; now?: Date },
): Promise<ImportReport> {
  const { report } = await buildImport(source, opts);
  return report;
}

/**
 * นำเข้าจริง — ตรวจซ้ำเหมือน `previewImport()` ทุกขั้น แล้วค่อยเขียนเป็นก้อนสุดท้าย
 * `by` คือชื่อผู้กดนำเข้า (จาก `editor()`) ใช้ลงไทม์ไลน์ของใบที่ได้ผลลัพธ์ training/working
 */
export async function commitImport(
  source: ImportSource,
  opts: { recentDays: number; now?: Date },
  by: string,
): Promise<ImportReport> {
  const { report, toInsert } = await buildImport(source, opts);
  const now = opts.now ?? new Date();
  const importedAt = now.toISOString();

  const bkkNow = new Date(now.getTime() + 7 * 3600 * 1000);
  const batchStamp = `${bkkNow.getUTCFullYear()}${String(bkkNow.getUTCMonth() + 1).padStart(2, "0")}${String(bkkNow.getUTCDate()).padStart(2, "0")}-${String(bkkNow.getUTCHours()).padStart(2, "0")}${String(bkkNow.getUTCMinutes()).padStart(2, "0")}${String(bkkNow.getUTCSeconds()).padStart(2, "0")}`;
  const importBatch = `gform-${batchStamp}`;

  /* ดัชนี `importKey_sparse` ประกาศที่ `lib/db/registry.mjs` แล้ว (เดิมสร้างตรงนี้ทุกครั้งที่นำเข้า) */
  const applications = await hrCol<ImportedApplicationDoc>("applications");

  const questions = await listActiveQuestions();
  const snapshot = snapshotOf(questions);

  // จองเลข ref เป็นก้อนต่อปี พ.ศ. เรียงจากวันที่ส่งจริงในปีนั้น
  const byYy = new Map<string, typeof toInsert>();
  for (const item of toInsert) {
    const arr = byYy.get(item.parsed.bkkYy) ?? [];
    arr.push(item);
    byYy.set(item.parsed.bkkYy, arr);
  }

  const refByRow = new Map<number, string>();
  for (const [yy, items] of byYy) {
    items.sort((a, b) => a.parsed.submittedAtISO.localeCompare(b.parsed.submittedAtISO));
    const seqEnd = await reserveRefBlock(yy, items.length);
    const seqStart = seqEnd - items.length + 1;
    items.forEach((item, i) => {
      refByRow.set(item.parsed.row, `DRV-${yy}-${String(seqStart + i).padStart(4, "0")}`);
    });
  }

  const docs: ImportedApplicationDoc[] = toInsert.map(({ parsed, outcome, driver, matchedBy, hit }) => {
    const ref = refByRow.get(parsed.row)!;
    const isBlacklist = outcome === "blacklist";
    /* ใบใหม่ที่ควรรู้ก่อนโทร — เคยเป็น พจส. (พ้นสภาพแล้ว) · ชื่อ/เบอร์ตรงกับคนติด Blacklist */
    const flags = [
      outcome === "pending_contact" && driver
        ? `เคยเป็น พจส. ${driver.code} ${driver.name} · ${workStatusFullLabel(driver.latestStatus)}`
        : "",
      hit
        ? `⚠ ตรงกับ Blacklist ${describeHit({ ...hit, ref: (hit.row && refByRow.get(hit.row)) || hit.ref })}`
        : "",
    ].filter(Boolean);
    const timeline: TimelineEntry[] = [
      {
        at: parsed.submittedAtISO,
        from: null,
        to: "pending_contact",
        by: "ผู้สมัคร",
        note: ["ส่งใบสมัครผ่าน Google Form", ...flags].join(" · "),
      },
    ];
    if ((outcome === "training" || outcome === "working") && driver) {
      const matchedByText = matchedBy ? MATCHED_BY_TH[matchedBy] : "-";
      timeline.push({
        at: importedAt,
        from: "pending_contact",
        to: outcome,
        by,
        note: `นำเข้าจาก Google Form — ตรงกับ พจส. ${driver.code} ${driver.name} (จับคู่ด้วย ${matchedByText}) · สถานะล่าสุด ${workStatusFullLabel(driver.latestStatus)}`,
      });
    }
    if (isBlacklist) {
      timeline.push({
        at: importedAt,
        from: "pending_contact",
        to: "cancelled",
        by,
        note: `นำเข้าจาก Google Form — ชีตระบุ “${parsed.sheetStatus}” · ติด Blacklist`,
      });
    }

    const consent: ConsentRecord = {
      version: "google-form",
      acceptedAt: parsed.submittedAtISO,
      ip: "Google Forms",
      userAgent: "นำเข้าจากไฟล์ Excel",
      items: [
        { id: "core", granted: parsed.consentGranted },
        { id: "sensitive", granted: parsed.consentGranted },
        { id: "talent_pool", granted: false },
      ],
    };

    const doc: ImportedApplicationDoc = {
      ref,
      status: isBlacklist ? "cancelled" : outcome,
      fullName: parsed.fullNameRaw,
      phone: parsed.phoneRaw,
      contactOwner: "",
      interview: { ...EMPTY_INTERVIEW },
      exitReason: isBlacklist ? OTHER_EXIT_REASON : "",
      exitReasonNote: isBlacklist ? blacklistNote(parsed.sheetStatus) : "",
      blacklist: isBlacklist,
      answers: parsed.answers,
      questionSnapshot: snapshot,
      files: [],
      documents: parsed.documents,
      documentMeta: parsed.documentMeta,
      consent,
      timeline,
      createdAt: parsed.submittedAtISO,
      updatedAt: importedAt,
      importBatch,
      importKey: computeImportKey(parsed),
      importedAt,
      legacyRow: parsed.legacyRow,
      /* ผูกรหัสเฉพาะคนที่ยังอยู่ในทะเบียน — ใบสมัครใหม่ของคนที่พ้นสภาพแล้วยังไม่ใช่ พจส. คนเดิม */
      driverCode: outcome === "training" || outcome === "working" ? (driver?.code ?? "") : "",
    };
    return doc;
  });

  const CHUNK = 500;
  for (let i = 0; i < docs.length; i += CHUNK) {
    const chunk = docs.slice(i, i + CHUNK);
    if (chunk.length) {
      await applications.insertMany(chunk, { ordered: false });
    }
  }

  return { ...report, committed: true, batch: importBatch };
}
