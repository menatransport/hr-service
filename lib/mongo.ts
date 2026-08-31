import { MongoClient, type Db } from "mongodb";

/**
 * การเชื่อมต่อ MongoDB ตัวเดียวของทั้งระบบ — **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 *
 * ใช้เก็บ “บันทึกเคสส่วนกลาง” (`/desk/record-cases`) ซึ่งเป็นข้อมูลของระบบนี้เอง
 * คนละชุดกับคำร้องของ พจส. ที่อยู่บน NCAC — อย่าเอาสองอย่างมาปนกัน
 *
 * ตัว client ถูก cache ไว้บน `globalThis` เพราะ Turbopack โหลดโมดูลใหม่ทุกครั้งที่
 * แก้ไฟล์ตอน dev ถ้าไม่ cache จะเปิด connection pool ใหม่ทุกรอบจนชน limit ของ Atlas
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

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS,
    connectTimeoutMS: CONNECT_TIMEOUT_MS,
  });

  return client.connect().catch((err: unknown) => {
    globalThis.__hrsMongo = undefined;
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`เชื่อมต่อฐานข้อมูลไม่สำเร็จ — ${reason}`);
  });
}

export async function getDb(): Promise<Db> {
  globalThis.__hrsMongo ??= connect();
  const client = await globalThis.__hrsMongo;
  return client.db(process.env.MONGO_DB?.trim() || "hr_service");
}
