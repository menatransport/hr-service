import type { Collection, Db, Document } from "mongodb";

import { PARTNER } from "./registry.mjs";

/**
 * ส่วน **pure** ของทางเข้าฐานรถร่วม — ไม่ import `lib/mongo` (ไม่มี driver ตอนรัน มีแต่ชนิด)
 *
 * แยกจาก `lib/db/partner.ts` เพราะโมดูลเดิมของรถร่วมบางตัว (เช่น `company-config.ts`) ถูกใช้ทั้งฝั่ง
 * client และ server — ถ้า import ตัวที่แตะ client ของ Mongo บันเดิลฝั่ง browser จะพัง (`dns`, `child_process`)
 * โค้ดทั่วไป import จาก `@/lib/db/partner` (re-export ทุกตัวในไฟล์นี้)
 */

export type PartnerKey = keyof typeof PARTNER;

declare const partnerBrand: unique symbol;
/** `Db` ที่มาจาก `partnerDb()` เท่านั้น — กันส่ง db ของ hr เข้า `partnerColOf` โดยไม่ตั้งใจ */
export type PartnerDb = Db & { readonly [partnerBrand]: true };

/** แบบ sync สำหรับโค้ดที่ถือ `PartnerDb` อยู่แล้ว — คีย์จาก `PARTNER` เท่านั้น */
export function partnerColOf<T extends Document = Document>(db: PartnerDb, key: PartnerKey): Collection<T> {
  return db.collection<T>(PARTNER[key]);
}

/**
 * ชนิดเอกสารแบบหลวมของโค้ดเดิมที่ถือ db เป็น `any` (`.collection()` เดิมคืน `any`) — codemod ใส่ให้เพื่อไม่เปลี่ยนชนิดข้อมูลเดิม
 * โค้ดใหม่ให้ระบุชนิดจริงแทน
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDoc = any;
