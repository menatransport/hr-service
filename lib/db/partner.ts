import type { Collection, Document } from "mongodb";

import { client } from "@/lib/mongo";
import type { ReadOnlyCollection } from "./index";
import { type PartnerDb, type PartnerKey } from "./partner-col";
import { ATMS, BI, DB, PARTNER, PARTNER_EXT_DB } from "./registry.mjs";

/**
 * ทางเข้า MongoDB ของโค้ดรถร่วม (ย้ายมาจาก mena-partner-driver) — **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 *
 * | ใช้ | เมื่อ |
 * |---|---|
 * | `partnerCol<T>("contracts")` | คอลเลกชันใน `mena_partner` (คีย์จาก `PARTNER` ใน `registry.mjs` — ไม่รับสตริงอิสระ) |
 * | `partnerDb()` + `partnerColOf(db, "contracts")` | โค้ดเดิมที่ถือ db ไว้ตัวเดียวแล้วเรียกหลายคอลเลกชัน (ฟังก์ชันที่รับ `db` เป็นพารามิเตอร์) |
 * | `biCol("driverCost")` / `atmsCol("vehicleMaster")` | db ของระบบอื่น — **อ่านอย่างเดียว** (ชนิดไม่มีเมธอดเขียน) |
 *
 * ใช้ MongoClient ตัวเดียวกับทั้งแอป (`lib/mongo.ts`) — คลัสเตอร์เดียวกัน ต่างแค่ db · ต่อฐานตอนเรียกครั้งแรก ไม่ใช่ตอน import
 * ⚠️ ห้ามใช้ `process.env.MONGO_DB` กับโค้ดรถร่วม — ในแอปนี้คือ `hr_service`
 * ไม่สร้าง/ไม่แตะดัชนีของ `mena_partner` (ระบบรถร่วมเป็นเจ้าของ — ดูคอมเมนต์ `PARTNER` ใน registry)
 */

export { partnerColOf, type AnyDoc, type PartnerDb, type PartnerKey } from "./partner-col";
export type BiKey = keyof typeof BI;
export type AtmsKey = keyof typeof ATMS;

/** ชื่อ db ของรถร่วม — `PARTNER_MONGO_DB` ทับได้ (เช่น db ทดสอบ) */
export const PARTNER_DB: string = process.env.PARTNER_MONGO_DB?.trim() || DB.partner;

export async function partnerDb(): Promise<PartnerDb> {
  return (await client()).db(PARTNER_DB) as PartnerDb;
}

export async function partnerCol<T extends Document = Document>(key: PartnerKey): Promise<Collection<T>> {
  return (await partnerDb()).collection<T>(PARTNER[key]);
}

/** `mena-bi` — อ่านอย่างเดียว */
export async function biCol<T extends Document = Document>(key: BiKey): Promise<ReadOnlyCollection<T>> {
  return (await client()).db(PARTNER_EXT_DB.bi).collection<T>(BI[key]);
}

/** `atms` — อ่านอย่างเดียว */
export async function atmsCol<T extends Document = Document>(key: AtmsKey): Promise<ReadOnlyCollection<T>> {
  return (await client()).db(PARTNER_EXT_DB.atms).collection<T>(ATMS[key]);
}

/** ชื่อจริงของคอลเลกชันรถร่วม (ค่าใน `PARTNER`) */
export type PartnerName = (typeof PARTNER)[PartnerKey];
const NAME_TO_KEY = new Map(Object.entries(PARTNER).map(([k, v]) => [v as string, k as PartnerKey]));

/**
 * แบบรับ **ชื่อจริง** จากทะเบียน (`partnerColByName(PARTNER.drivers)`) — สำหรับโค้ดที่ส่งค่า `PARTNER.x` ต่อกันเป็นทอด
 * ชนิดรับเฉพาะชื่อในทะเบียน + ตรวจซ้ำตอนรัน (ชื่อนอกทะเบียน = โยน error ไม่เปิดคอลเลกชันมั่ว)
 */
export async function partnerColByName<T extends Document = Document>(name: PartnerName): Promise<Collection<T>> {
  const key = NAME_TO_KEY.get(name);
  if (!key) throw new Error(`partnerColByName: "${name}" ไม่อยู่ในทะเบียน PARTNER`);
  return partnerCol<T>(key);
}
