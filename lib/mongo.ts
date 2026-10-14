import { MongoClient, type Db } from "mongodb";

import { DB } from "./db/registry.mjs";

/**
 * การเชื่อมต่อ MongoDB ตัวเดียวของทั้งระบบ — **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 *
 * **โค้ดแอปห้าม import ไฟล์นี้ตรง ๆ** — ใช้ `hrCol()` / `etlCol()` / `hrBucket()` จาก `lib/db`
 * (ชื่อคอลเลกชันอยู่ที่ `lib/db/registry.mjs` ที่เดียว · `node check_db_names.mjs` จับให้)
 *
 * ตัว client ถูก cache ไว้บน `globalThis` เพราะ Turbopack โหลดโมดูลใหม่ทุกครั้งที่
 * แก้ไฟล์ตอน dev ถ้าไม่ cache จะเปิด connection pool ใหม่ทุกรอบจนชน limit ของ Atlas
 * (บน Vercel ก็ได้ประโยชน์เดียวกัน — instance ที่ยังอุ่นอยู่ใช้ client เดิมข้ามคำขอ)
 *
 * **ถ้าเชื่อมไม่ติดให้ทิ้ง cache ทันที** — promise ที่ reject แล้วจะ reject ตลอดไป
 * ผู้ใช้จะกดโหลดใหม่กี่ครั้งก็ได้ error เดิมทั้งที่ฐานข้อมูลกลับมาแล้ว
 */

const CONNECT_TIMEOUT_MS = 8_000;

declare global {
  var __hrsMongo: Promise<MongoClient> | undefined;
}

function connect(): Promise<MongoClient> {
  const uri = process.env.MONGO_URI?.trim();
  if (!uri) {
    return Promise.reject(
      new Error("ยังไม่ได้ตั้งค่า MONGO_URI ใน .env.local — บันทึกเคสจึงยังใช้งานไม่ได้"),
    );
  }

  /*
   * บริบทที่ใช้ตั้งค่า: Vercel serverless (instance ละ client) · คลัสเตอร์ Atlas ใช้ร่วมกับ db อื่นอีก
   * ~23 ตัว · เครื่องมือภายในที่คนใช้พร้อมกันไม่กี่คน — จึงเน้น "ไม่ถือ connection ทิ้งไว้" มากกว่าความเร็ว
   * ต้องจับตา `connections.current` ของคลัสเตอร์ (Atlas → Metrics) ถ้าจะขยับตัวเลขพวกนี้
   */
  const client = new MongoClient(uri, {
    // ให้รู้ว่า connection ไหนเป็นของระบบนี้ในหน้า Atlas / currentOp — คลัสเตอร์มีหลายแอปปนกัน
    appName: "hr-service",
    // หน้าที่หนักสุดยิงขนานราว 3–5 คำสั่ง (Promise.all ของ trainee-board/options) ต่อคำขอ
    // 10 เหลือที่ให้คำขอซ้อนกันได้ แต่ไม่ปล่อยให้ instance เดียวกิน connection ของคลัสเตอร์ที่ใช้ร่วมกัน
    maxPoolSize: 10,
    // ไม่อุ่น connection ไว้ล่วงหน้า — instance ส่วนใหญ่นิ่ง ถือไว้ก็กิน RAM ฝั่ง Atlas (~1 MB/ตัว) เปล่า ๆ
    minPoolSize: 0,
    // คืน connection ที่ว่างเกิน 1 นาที — ช่วงคลิกต่อเนื่องยังได้ใช้ซ้ำ แต่ไม่ค้างตอน instance ถูกแช่
    maxIdleTimeMS: 60_000,
    serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS,
    connectTimeoutMS: CONNECT_TIMEOUT_MS,
    /*
     * จงใจ **ไม่ตั้ง `socketTimeoutMS`** (ค่าเริ่มต้น = ไม่จำกัด) — งานที่ยาวที่สุดคือ `commitImport()`
     * (`insertMany` ทีละ 500 ใบ ใบหนึ่งพกสำเนาคำถามทั้งชุด) กับอัปไฟล์ GridFS ถึง 10 MB ซึ่งยังไม่เคยวัด
     * เวลาจริง · ตั้งต่ำเกินจะตัดการนำเข้ากลางก้อน (`ordered: false` = เขียนไปแล้วครึ่งหนึ่ง) ·
     * คำขอที่ค้างถูกตัดด้วยเพดานเวลาของ function บน Vercel อยู่แล้ว
     */
  });

  return client.connect().catch((err: unknown) => {
    globalThis.__hrsMongo = undefined;
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`เชื่อมต่อฐานข้อมูลไม่สำเร็จ — ${reason}`);
  });
}

/** client ตัวเดียวของโปรเซส — `lib/db` ใช้สลับ `.db()` ไป `Boom_ETL` (ห้ามเปิด `MongoClient` ตัวที่สอง) */
export function client(): Promise<MongoClient> {
  globalThis.__hrsMongo ??= connect();
  return globalThis.__hrsMongo;
}

/** database `hr_service` (หรือ `MONGO_DB`) — เรียกผ่าน `lib/db` เท่านั้น */
export async function getDb(): Promise<Db> {
  return (await client()).db(process.env.MONGO_DB?.trim() || DB.hr);
}
