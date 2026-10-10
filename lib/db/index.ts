import { GridFSBucket, type Collection, type Document } from "mongodb";

import { client, getDb } from "@/lib/mongo";
import { createDeclaredIndexes } from "./ensure.mjs";
import { BUCKETS, DB, ETL, HR } from "./registry.mjs";

/**
 * ทางเข้า MongoDB ของโค้ดแอปทั้งหมด — **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 *
 * | ใช้ | เมื่อ |
 * |---|---|
 * | `hrCol<T>("recordCases")` | คอลเลกชันของเราใน `hr_service` (คีย์จาก `HR` ใน `registry.mjs`) |
 * | `etlCol<T>("vehicles")` | `Boom_ETL` — ได้แค่เมธอดอ่าน การเขียนจึงเป็น compile error |
 * | `hrBucket("recordAttachments")` | GridFS |
 *
 * คอลเลกชัน `external` (เช่น `newyearSurvey` ที่ ncacdb เขียน) ก็ได้ชนิดอ่านอย่างเดียวเหมือน `etlCol`
 *
 * **จงใจไม่ `import "server-only"`** — `form-import.ts` ต้องรันนอก Next ได้ (`npx tsx`) ซึ่งแพ็กเกจนั้น
 * โยน error ทันทีนอก react-server · ถ้ามี client component เผลอ import มา driver `mongodb` ที่พึ่ง
 * `node:*` ก็ทำให้ build ฝั่ง client พังดังอยู่แล้ว
 */

export type HrKey = keyof typeof HR;
export type EtlKey = keyof typeof ETL;
export type BucketKey = keyof typeof BUCKETS;

/** คีย์ที่ระบบอื่นเป็นเจ้าของ — ดึงจาก `external: true` ใน registry ตรง ๆ ไม่ต้องจำเอง */
type ExternalKey = {
  [K in HrKey]: (typeof HR)[K] extends { readonly external: true } ? K : never;
}[HrKey];

/** เมธอดอ่านอย่างเดียวของ `Collection` — ส่วนที่ `Boom_ETL` / คอลเลกชันภายนอกยอมให้ใช้ */
export type ReadOnlyCollection<T extends Document = Document> = Pick<
  Collection<T>,
  "find" | "findOne" | "aggregate" | "countDocuments" | "distinct" | "estimatedDocumentCount"
>;

/* ------------------------------------------------------------- ดัชนี (สร้างเองครั้งแรก) */

/** ล้มแล้วรอเท่านี้ก่อนลองใหม่ — กันฐานล่มแล้วทุกคำขอยิง `createIndexes` ซ้ำเป็นสิบรอบ */
const INDEX_RETRY_MS = 60_000;

let ensuring: Promise<void> | undefined;
let lastFailureAt = 0;

/**
 * สร้างดัชนีที่ประกาศใน `registry.mjs` ครั้งเดียวต่อโปรเซส — `hrCol()` ตัวแรกเป็นคนจุด **โดยไม่รอ**
 *
 * - มีอยู่แล้ว = no-op ฝั่งเซิร์ฟเวอร์ (ดัชนี unique ทั้งหมดมีบนฐานจริงแล้ว ความถูกต้องจึงไม่ขึ้นกับตัวนี้)
 * - **ล้มแล้วล้าง cache** ให้รอบหน้าลองใหม่ (หลังพัก `INDEX_RETRY_MS`) — ต่างจากของเดิมที่ cache
 *   promise ที่ reject ไว้ แล้วทั้งโปรเซสพังถาวรเพราะดัชนีตัวเดียว
 * - ไม่แตะคอลเลกชัน `external` และไม่แตะ `Boom_ETL` · ไม่ลบอะไรเลย
 * - ปิดได้ด้วย `MONGO_AUTO_INDEX=0` (เช่นผู้ใช้ฐานไม่มีสิทธิ์ `createIndex` จะได้ไม่ขึ้น warn ทุกนาที)
 */
export function ensureIndexesOnce(): Promise<void> {
  if (process.env.MONGO_AUTO_INDEX?.trim() === "0") return Promise.resolve();
  if (ensuring) return ensuring;
  if (Date.now() - lastFailureAt < INDEX_RETRY_MS) return Promise.resolve();

  const retryLater = () => {
    lastFailureAt = Date.now();
    ensuring = undefined;
  };

  // ไม่โยนต่อทุกกรณี — เป็นงานเบื้องหลังที่ไม่มีใครรอ โยนไปก็กลายเป็น unhandled rejection
  ensuring = (async () => {
    try {
      const { failed } = await createDeclaredIndexes(await getDb());
      for (const f of failed) console.warn(`[db] สร้างดัชนีของ ${f.name} ไม่สำเร็จ — ${f.error}`);
      if (failed.length) retryLater();
    } catch (err) {
      console.warn("[db] เตรียมดัชนีไม่สำเร็จ —", err);
      retryLater();
    }
  })();
  return ensuring;
}

/* ------------------------------------------------------------------------- ทางเข้า */

/** คอลเลกชันใน `hr_service` — คอลเลกชัน `external` ได้ชนิดอ่านอย่างเดียว */
export async function hrCol<T extends Document = Document>(
  key: ExternalKey,
): Promise<ReadOnlyCollection<T>>;
export async function hrCol<T extends Document = Document>(
  key: Exclude<HrKey, ExternalKey>,
): Promise<Collection<T>>;
export async function hrCol<T extends Document = Document>(key: HrKey): Promise<Collection<T>> {
  const db = await getDb();
  void ensureIndexesOnce();
  return db.collection<T>(HR[key].name);
}

/**
 * คอลเลกชันใน `Boom_ETL` — **อ่านอย่างเดียว** ETL sync ทับเองเป็นรอบ ของที่เขียนเพิ่มจะหาย
 * ฟิลด์ที่ hr-service เป็นเจ้าของต้องอยู่ใน `hr_service` เท่านั้น (ดู `sync_master_driver.mjs`)
 * อยู่คลัสเตอร์เดียวกัน จึงใช้ client ตัวเดิม สลับแค่ `.db()`
 */
export async function etlCol<T extends Document = Document>(
  key: EtlKey,
): Promise<ReadOnlyCollection<T>> {
  return (await client()).db(DB.etl).collection<T>(ETL[key]);
}

/** GridFS bucket ใน `hr_service` */
export async function hrBucket(key: BucketKey): Promise<GridFSBucket> {
  const db = await getDb();
  void ensureIndexesOnce();
  return new GridFSBucket(db, { bucketName: BUCKETS[key] });
}
