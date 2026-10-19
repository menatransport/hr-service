import type { Collection, Db, Document, MongoClient } from "mongodb";

import { client } from "@/lib/mongo";
import { DB } from "@/lib/db/registry.mjs";

/**
 * ทางเข้า MongoDB ของโค้ดรถร่วม (ย้ายมาจาก mena-partner-driver) — **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 *
 * ใช้ MongoClient ตัวเดียวกับทั้งแอป (`lib/mongo.ts`) — สองระบบอยู่คลัสเตอร์เดียวกัน ต่างกันแค่ db
 *
 * - **โค้ดเดิม**: `import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"` แล้ว
 *   `(await clientPromise).db(PARTNER_DB)` — รูปเดียวกับของเดิมทุกอย่าง ต่างแค่ชื่อ db
 * - **โค้ดใหม่**: `partnerDb()` / `partnerCol(name)`
 *
 * ⚠️ ห้ามใช้ `process.env.MONGO_DB` ในโค้ดรถร่วม — ในแอปนี้คือ `hr_service` จะอ่าน/เขียนผิดฐานเงียบ ๆ
 */
export const PARTNER_DB: string = process.env.PARTNER_MONGO_DB?.trim() || DB.partner;

/**
 * thenable ที่ต่อฐานตอนถูก `await` ครั้งแรก ไม่ใช่ตอน import — ของเดิมต่อทันทีที่โหลดโมดูล
 * ซึ่งทำให้ `next build` (ไม่มี MONGO_URI) โยน error ตั้งแต่เก็บหน้า
 */
const clientPromise = {
  then<A = MongoClient, B = never>(
    onFulfilled?: ((value: MongoClient) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    return client().then(onFulfilled, onRejected);
  },
} as unknown as Promise<MongoClient>;

export default clientPromise;

export async function partnerDb(): Promise<Db> {
  return (await client()).db(PARTNER_DB);
}

export async function partnerCol<T extends Document = Document>(name: string): Promise<Collection<T>> {
  return (await partnerDb()).collection<T>(name);
}
