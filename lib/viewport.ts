import { headers } from "next/headers";

/**
 * เดาจาก request ว่าจอเป็นเดสก์ท็อป (≥ `lg`) ไหม — ใช้เป็นค่าเริ่มของ `useIsDesktop()`
 *
 * หน้าที่มีทั้งตารางเต็ม (จอ ≥lg) และรายการแถวละคน (จอ <lg) เคยวาดทั้งสองชุดแล้วซ่อนด้วย CSS
 * HTML จึงหนักเกือบสองเท่า (ทะเบียน พจส. ~550 KB) · ให้เซิร์ฟเวอร์วาดชุดเดียวตามที่เดาได้
 * แล้วฝั่งเบราว์เซอร์แก้ตาม `matchMedia` จริงหลัง hydrate
 *
 * `Sec-CH-UA-Mobile` (Chromium) แม่นสุด · ไม่มีก็ดู user-agent · iPad แนวนอนจะเดาเป็นมือถือ
 * แล้วสลับเป็นตารางหลัง hydrate — ไม่ผิดรูป แค่ช้ากว่าเดิมนิดเดียว
 */
export async function guessDesktop(): Promise<boolean> {
  const h = await headers();
  const hint = h.get("sec-ch-ua-mobile");
  if (hint === "?1") return false;
  if (hint === "?0") return true;
  return !/Mobi|Android|iPhone|iPad|iPod/i.test(h.get("user-agent") ?? "");
}
