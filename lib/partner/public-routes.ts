/**
 * เส้นทางที่เปิดสาธารณะ (ไม่ต้อง login) ของระบบรถร่วม — ใช้ใน `lib/auth/gate.ts`
 * แคบที่สุดเท่าที่พอใช้: หน้าเว็บขายรถ + API สาธารณะ + ไฟล์ SEO (อยู่ที่รากของเว็บ ไม่อยู่ใต้ /partner)
 *
 * เปิดทุก method — `/api/public/*` มีฟอร์มลูกค้าทิ้งเบอร์ (POST) ที่คนนอกต้องส่งได้
 */
const PUBLIC_EXACT = new Set(["/trucks", "/sitemap.xml", "/robots.txt"])
/*
 * `/api/partner/cron/*` ไม่ได้เปิดโล่ง — route ตรวจ `Bearer CRON_SECRET` เอง ที่ต้องปล่อยผ่านตรงนี้
 * เพราะด่านกลางเคยกิน `Authorization: Bearer <CRON_SECRET>` จนตก 401 ก่อนถึง route (cron ไม่วิ่ง ต.ค. 2569)
 * `/api/cron/*` ของ hr ไม่อยู่ในรายการนี้ — ใช้กฎของ hr ตามเดิม (GET ผ่าน)
 */
/*
 * `/partner/brand/` = รูปแบรนด์ใน `public/partner/brand` ที่หน้า /trucks ใช้ (โลโก้ ภาพปก) — อยู่ใต้ matcher
 * `/partner/:path*` ของ proxy คนนอกจึงโหลดไม่ได้ถ้าไม่เปิดตรงนี้ · เปิดเฉพาะโฟลเดอร์ brand ไม่ใช่ทั้ง /partner
 */
const PUBLIC_PREFIXES = ["/trucks/", "/api/public/", "/og/", "/api/partner/cron/", "/partner/brand/"]

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
}
