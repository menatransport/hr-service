/**
 * Google Sheet ของฝ่ายบุคคล — ใช้กับปุ่ม Sync โหมด dev (ทะเบียน พจส. · ผู้สมัคร)
 * ไฟล์นี้ import จากฝั่ง client ได้ (ค่าตั้งต้น + ตัวแยกลิงก์) · `fetchGoogleSheetXlsx()` เรียกได้เฉพาะฝั่งเซิร์ฟเวอร์
 *
 * ชีตต้องแชร์แบบ “ทุกคนที่มีลิงก์ดูได้” — ดึงผ่านลิงก์ส่งออก `.xlsx` ตรง ๆ ไม่ต้องใช้ Google API/คีย์
 */

/** ชีตตั้งต้น — แท็บ “ทะเบียนประวัติ” + “ผู้สมัคร” อยู่ในไฟล์เดียวกัน */
export const HR_GOOGLE_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/15uYCaPpRfDViaeeXtt2MX3JBcQbZABTXyQUcH29BNDU/edit?usp=sharing";

/** id ของชีตจากลิงก์ `docs.google.com/spreadsheets/d/<id>/…` — ไม่ใช่ลิงก์ชีต = `null` */
export function googleSheetId(input: string): string | null {
  return /docs\.google\.com\/spreadsheets\/d\/([\w-]{20,})/.exec(input)?.[1] ?? null;
}

const XLSX_TYPE = "spreadsheetml";

/** ดาวน์โหลดทั้งไฟล์เป็น `.xlsx` (ทุกแท็บ) */
export async function fetchGoogleSheetXlsx(url: string): Promise<Buffer> {
  const id = googleSheetId(url);
  if (!id) throw new Error("ลิงก์ไม่ใช่ Google Sheet");
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`, {
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
  });
  /* ชีตที่ไม่ได้เปิดแชร์ Google ตอบหน้า login (HTML) กลับมาแทนไฟล์ */
  if (!res.ok || !res.headers.get("content-type")?.includes(XLSX_TYPE))
    throw new Error("ดึง Google Sheet ไม่ได้ — ตรวจว่าแชร์แบบ “ทุกคนที่มีลิงก์” แล้ว");
  return Buffer.from(await res.arrayBuffer());
}
