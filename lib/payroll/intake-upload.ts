/**
 * ตรวจคำขออัปโหลดไฟล์รับข้อมูลเงินเดือน — **ฟังก์ชันล้วน** ไม่แตะ Mongo ไม่แตะ `Request`
 * แยกออกมาเพื่อเขียนเทสต์ได้ และให้ route เหลือแค่ประกอบชิ้นส่วน
 *
 * ด่านเหล่านี้ต้องผ่านก่อน exceljs จะได้ไบต์ไปอ่าน — ตอบเป็นข้อความที่คนอ่านรู้เรื่อง
 * ไม่ปล่อยให้ไปพังข้างในแล้วได้ 500
 */

export const MAX_INTAKE_FILE_BYTES = 10 * 1024 * 1024;

export const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** `2026-09` เท่านั้น */
export const isPeriodCode = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

/**
 * `.xlsx` คือไฟล์ ZIP — ขึ้นต้นด้วย `PK\x03\x04` เสมอ
 *
 * **เช็กจากเนื้อไฟล์ ไม่ใช่จาก `file.type`** เพราะเบราว์เซอร์เดา MIME จากนามสกุล
 * ไฟล์ `.txt` ที่ถูกเปลี่ยนชื่อเป็น `.xlsx` จึงมากับ MIME ของ xlsx ครบถ้วน
 */
export function looksLikeZip(head: Uint8Array): boolean {
  return (
    head.length >= 4 &&
    head[0] === 0x50 &&
    head[1] === 0x4b &&
    head[2] === 0x03 &&
    head[3] === 0x04
  );
}

export interface IntakeUploadInput {
  period: unknown;
  itemId: unknown;
  fileName: string;
  fileType: string;
  size: number;
  /** ไบต์แรกของไฟล์ (อย่างน้อย 4 ไบต์) */
  head: Uint8Array;
}

export type IntakeUploadCheck =
  | { ok: true; period: string; itemId: string }
  | { ok: false; message: string };

const reject = (message: string): IntakeUploadCheck => ({ ok: false, message });

export function validateIntakeUpload(input: IntakeUploadInput): IntakeUploadCheck {
  const { period, itemId, fileName, fileType, size, head } = input;

  if (!isPeriodCode(period)) return reject("ระบุ period เป็นรูปแบบ YYYY-MM เช่น 2026-09");
  if (typeof itemId !== "string" || !itemId.trim()) return reject("ระบุ itemId ของรายการ");
  if (!size) return reject("ไม่พบไฟล์ที่แนบมา");

  if (!fileName.toLowerCase().endsWith(".xlsx")) {
    return reject("รับเฉพาะไฟล์ .xlsx — ถ้าไฟล์เป็น .xls หรือ .csv ให้บันทึกใหม่เป็น .xlsx ก่อน");
  }
  /* MIME ว่างหรือ octet-stream พบได้กับ xlsx จริงบางเครื่อง จึงปล่อยไปให้เนื้อไฟล์ตัดสิน */
  if (fileType && fileType !== XLSX_TYPE && fileType !== "application/octet-stream") {
    return reject("ไฟล์นี้ไม่ใช่ Excel จริง — เปลี่ยนนามสกุลเฉย ๆ ใช้ไม่ได้ ต้องบันทึกจาก Excel");
  }
  if (size > MAX_INTAKE_FILE_BYTES) {
    return reject(
      `ไฟล์ใหญ่เกิน ${MAX_INTAKE_FILE_BYTES / 1024 / 1024} MB — แยกเป็นหลายไฟล์หรือลบชีตที่ไม่เกี่ยวออกก่อน`,
    );
  }
  if (!looksLikeZip(head)) {
    return reject("ไฟล์นี้ไม่ใช่ Excel จริง — เปลี่ยนนามสกุลเฉย ๆ ใช้ไม่ได้ ต้องบันทึกจาก Excel");
  }

  return { ok: true, period, itemId: itemId.trim() };
}
