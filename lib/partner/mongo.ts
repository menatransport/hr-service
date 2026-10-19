/**
 * ทางเข้าเดิมของโค้ดรถร่วม (สัญญากลางระหว่างเลน) — ตัวจริงย้ายไป `lib/db/partner.ts` แล้ว (ให้ `check_db_names.mjs` ตรวจได้)
 *
 * - `partnerCol(name)` ที่นี่ = **รับชื่อจริงจากทะเบียน** เหมือนสัญญาเดิม (`partnerCol(PARTNER.drivers)`) — ใช้โดย L2/L3
 *   ชนิดรับเฉพาะค่าใน `PARTNER` (ไม่ใช่สตริงอิสระแล้ว) และตรวจซ้ำตอนรัน
 * - โค้ดใหม่ใช้ `@/lib/db/partner` ตรง ๆ: `partnerCol("คีย์")` / `partnerColOf(db, "คีย์")`
 * - ไม่มี `clientPromise` แล้ว — ใช้ `partnerDb()`
 */
export {
  PARTNER_DB,
  partnerColByName as partnerCol,
  partnerDb,
  type PartnerDb,
  type PartnerName,
} from "@/lib/db/partner";
