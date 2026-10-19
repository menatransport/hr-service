/**
 * เส้นทางที่เปิดสาธารณะ (ไม่ต้อง login) — ใช้ใน middleware
 * แคบที่สุดเท่าที่พอใช้: หน้าเว็บขายรถ + API สาธารณะ + ไฟล์ SEO
 */
const PUBLIC_EXACT = new Set(["/trucks", "/sitemap.xml", "/robots.txt"])
// /api/cron/* ไม่ได้เปิดโล่ง — route ตรวจ Bearer CRON_SECRET เอง ที่ต้องปล่อยผ่านตรงนี้
// เพราะ getToken() จะเอา Authorization: Bearer <CRON_SECRET> ไปถอดเป็นโทเคน next-auth แล้วตก 401 ก่อนถึง route
const PUBLIC_PREFIXES = ["/trucks/", "/api/public/", "/og/", "/api/cron/"]

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
}
