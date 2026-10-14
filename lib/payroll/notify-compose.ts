/**
 * ประกอบ URL หน้าเขียนเมลของ Gmail จากร่างอีเมล — ฟังก์ชันล้วน ใช้ได้ทั้ง client และ server
 *
 * แยกจาก `notify.ts` เพราะไฟล์นั้นดึง `case-notify.ts` → `ncac/client` (อ่าน env ฝั่ง
 * เซิร์ฟเวอร์) เข้ามาด้วย ถ้าหน้าจอ import ค่าจากมันตรง ๆ โค้ดฝั่งเซิร์ฟเวอร์จะหลุดเข้า
 * bundle ของเบราว์เซอร์ · ที่นี่รับแค่ข้อมูลของร่าง ไม่แตะ NCAC
 */

/**
 * เพดานความยาว URL หน้าเขียนเมล (หลัง encode) — **เป็นค่าประมาณแบบระวังไว้ก่อน
 * ไม่ใช่ตัวเลขที่วัดจาก Gmail** เพราะ Gmail ไม่ได้ประกาศเพดานไว้ (ภาษาไทยหนึ่งตัวกิน
 * 9 ตัวอักษรตอน encode: `ก` → `%E0%B8%81`)
 *
 * - ต่ำกว่าหรือเท่าเพดาน: เปิด Gmail พร้อมเนื้อเมล **ฉบับเต็ม**
 * - เกินเพดาน: เปิด Gmail พร้อมเนื้อ **ฉบับย่อ** (ท่อนต้น + ลิงก์) ส่วนฉบับเต็มต้องใช้
 *   ปุ่ม “คัดลอก” ไปวางเอง · หน้าจอบอกล่วงหน้าที่แถวของฝ่ายนั้นก่อนกดเสมอ
 *
 * **ไม่ใช่ตัวเดียวกับ `DETAIL_LIMIT` ใน `case-notify.ts`** — อันนั้นตัดความยาวของ
 * ช่อง “รายละเอียดคำร้อง” (300 ตัวอักษร) ไม่ได้จำกัดความยาว URL ทั้งเส้น จึงไม่ผูกกัน
 */
export const GMAIL_URL_LIMIT = 7000;

export interface ComposeDraft {
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  shortBody: string;
}

function build(draft: ComposeDraft, body: string, senderEmail: string | null): string {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: draft.to.join(","),
    su: draft.subject,
    body,
  });
  if (draft.cc.length) params.set("cc", draft.cc.join(","));
  /* `authuser` ให้ Gmail เปิดถูกบัญชีบนเครื่องที่ล็อกอินไว้หลายบัญชี */
  if (senderEmail) params.set("authuser", senderEmail);
  /* `+` → `%20` ให้เป็น URL encoding ล้วน ๆ (เหตุผลเดียวกับ `notify-modal.tsx`) */
  return `https://mail.google.com/mail/?${params.toString().replace(/\+/g, "%20")}`;
}

/** URL ที่จะเปิดจริง และบอกว่าใช้ฉบับย่อแทนฉบับเต็มหรือไม่ */
export function gmailCompose(
  draft: ComposeDraft,
  senderEmail: string | null,
): { url: string; shortened: boolean } {
  const full = build(draft, draft.body, senderEmail);
  if (full.length <= GMAIL_URL_LIMIT) return { url: full, shortened: false };
  return { url: build(draft, draft.shortBody, senderEmail), shortened: true };
}
