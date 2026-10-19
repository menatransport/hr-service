/**
 * ทำชื่อ / เลขบัตร / ทะเบียน ให้เป็นรูปเดียวก่อนเทียบ — **pure ใช้ได้ทั้ง server และ client**
 *
 * ทุกตัวในไฟล์นี้ "ลดรูป" อย่างเดียว ไม่เดาแทนคน: ค่าที่ลดแล้วเหลือว่างหรือไม่ครบรูปแบบ = ไม่ใช้เป็นสัญญาณ
 */

/** คำนำหน้าที่ตัดทิ้ง — เรียงยาวก่อนสั้น ("นางสาว" ต้องมาก่อน "นาง") */
const PREFIXES = [
  "ว่าที่ร้อยตรี",
  "ว่าที่ ร.ต.",
  "นางสาว",
  "น.ส.",
  "นส.",
  "นาง",
  "นาย",
  "ด.ช.",
  "ด.ญ.",
  "mrs.",
  "mrs",
  "mr.",
  "mr",
  "ms.",
  "ms",
  "miss",
];

/** อักขระล่องหนที่ติดมากับการก๊อปจาก Excel/LINE */
const INVISIBLE = /[​-‍⁠﻿]/g;
/** สระ/วรรณยุกต์ (combining) ที่ซ้ำติดกัน เช่นพิมพ์ไม้เอกสองที — เก็บตัวเดียว */
const DUP_MARK = /([ัิ-ฺ็-๎])\1+/g;
/** สระลอยที่ไม่มีพยัญชนะนำ (ขึ้นต้นคำ) — พิมพ์พลาดจากแป้น */
const FLOATING_MARK = /(^|\s)[ัิ-ฺ็-๎]+/g;

/** ชื่อ-สกุลเป็นรูปเดียว: ตัดคำนำหน้า จุด สระลอย ช่องว่างซ้ำ ตัวพิมพ์เล็ก */
export function normalizeName(raw: string | null | undefined): string {
  let s = (raw ?? "")
    .normalize("NFC")
    .replace(INVISIBLE, "")
    // นิคหิต + สระอา (ํา) หน้าตาเหมือนสระอำ แต่คนละรหัส
    .replace(/ํา/g, "ำ")
    .trim()
    .toLowerCase();
  for (let changed = true; changed; ) {
    changed = false;
    for (const p of PREFIXES) {
      // คำนำหน้าภาษาอังกฤษต้องจบคำ ("mr john") ไม่งั้น "mrinal" จะโดนตัดเป็น "inal"
      const latin = /^[a-z]/.test(p) && !p.endsWith(".");
      if (s.startsWith(p) && (!latin || s.length === p.length || s[p.length] === " ")) {
        s = s.slice(p.length).trim();
        changed = true;
      }
    }
  }
  return s
    .replace(/\./g, " ")
    .replace(/\s+/g, " ")
    .replace(DUP_MARK, "$1")
    .replace(FLOATING_MARK, "$1")
    .trim();
}

/** เลขบัตร 13 หลักเท่านั้น — ไม่ครบ/มีตัวอักษร = `null` (ไม่ใช้เป็นสัญญาณ) */
export function normalizeNationalId(raw: unknown): string | null {
  const digits = String(raw ?? "").replace(/[\s-]/g, "");
  return /^\d{13}$/.test(digits) ? digits : null;
}

/**
 * ทะเบียนเป็นรูปเดียว
 *
 * - ตัดช่องว่าง ขีด จุด
 * - **ทะเบียนรถบรรทุก `NN-NNNN`** (เลข 6 หลักล้วน) ที่มีแต่อักษรไทยห้อมล้อม = ตัวย่อ/ชื่อจังหวัด
 *   ตัดทิ้งเหลือเลข 6 หลัก: `สบ.71-1515` · `71-1515 สระบุรี` · `711515` → `711515`
 * - แบบอื่น (เช่น `1กข-1234`) ตัดแค่ชื่อจังหวัดยาว ๆ ท้ายสุด ตัวอักษรหมวดเก็บไว้
 */
export function normalizePlate(raw: string | null | undefined): string | null {
  const s = (raw ?? "").normalize("NFC").replace(INVISIBLE, "").trim();
  if (!s) return null;

  const compact = s.replace(/[\s.\-]/g, "");
  const truck = /^[ก-๏]*(\d{6})[ก-๏]*$/.exec(compact);
  if (truck) return truck[1];

  const parts = s.split(/\s+/);
  const last = parts[parts.length - 1];
  if (parts.length > 1 && !/\d/.test(last) && last.length > 3) parts.pop();
  const out = parts.join("").replace(/[-.\s]/g, "");
  return out || null;
}
