/**
 * ชนิดข้อมูลผลตรวจประวัติอาชญากรรม — import ได้ทั้งสองฝั่ง (ตัวดึงจริงอยู่ `criminal-record.ts` ฝั่งเซิร์ฟเวอร์)
 */

/** ค่าคอลัมน์ C (Department) ของชีต “สรุปรายชื่อตรวจประวัติ” */
export const CRIMINAL_DEPARTMENTS = ["จัดส่ง ศลบ", "จัดส่ง สสบ", "TDM"] as const;

export interface CriminalRecordEntry {
  /** ฝ่ายในชีต (คอลัมน์ C) */
  department: string;
  /** ผลตรวจประวัติ (คอลัมน์ F) */
  result: string;
  /** รายละเอียดคดี (คอลัมน์ G) — ว่าง = ไม่มีคดี */
  detail: string;
}

export interface CriminalRecordResult {
  /** `false` = ไม่มีชื่อนี้ในชีต (ยังไม่ส่งตรวจ หรือสะกดต่างกัน) */
  found: boolean;
  /** ชื่อที่ใช้ค้น (ตัดคำนำหน้า/ช่องว่างแล้ว) */
  name: string;
  records: CriminalRecordEntry[];
}

/** มีคดี = ช่องรายละเอียดคดีมีข้อความ หรือผลตรวจบอกว่า “พบ” (แต่ไม่ใช่ “ไม่พบ”) */
export function hasCriminalCase(entry: CriminalRecordEntry): boolean {
  const detail = entry.detail.replace(/^[-–—\s]+$/, "");
  if (detail && !/^(ไม่มี|ไม่พบ)/.test(detail)) return true;
  return /พบ/.test(entry.result) && !/ไม่พบ/.test(entry.result);
}
