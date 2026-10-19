/**
 * @deprecated ทางเข้าเดิมของโค้ดรถร่วม — ตัวจริงย้ายไป `lib/db/partner.ts` แล้ว (ให้ `check_db_names.mjs` ตรวจได้)
 * โค้ดใหม่ import จาก `@/lib/db/partner` ตรง ๆ · ไฟล์นี้คงไว้ให้โค้ดของเลนอื่นที่ยังอ้างถึง (L2/L3) ไม่พัง
 * ไม่มี `clientPromise` แล้ว — ใช้ `partnerDb()` / `partnerCol("คีย์")` / `partnerColOf(db, "คีย์")`
 */
export { PARTNER_DB, partnerCol, partnerColOf, partnerDb, type PartnerDb, type PartnerKey } from "@/lib/db/partner";
