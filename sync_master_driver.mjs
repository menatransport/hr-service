/**
 * Sync ทะเบียนประวัติ พจส. จาก Boom_ETL.main_driver (read-only) → hr_service.master_driver
 *
 *   node sync_master_driver.mjs
 *
 * **Boom_ETL คืออ่านอย่างเดียวเด็ดขาด** — สคริปต์นี้ไม่มีการเขียนกลับไปที่ db นั้นเลยแม้บรรทัดเดียว
 * เพราะเป็น mirror ที่ ETL ภายนอก sync ทับเองอยู่แล้ว (ดู `.claude/docs/registry-history.md`)
 *
 * ใช้ client เดียวกันกับที่ต่อ Atlas อยู่แล้ว แค่สลับ `.db(...)` คนละตัว — **ห้ามเปิด
 * MongoClient ที่สอง** เดี๋ยวชน connection pool limit ของ Atlas เหมือนที่ `lib/mongo.ts` เตือนไว้
 *
 * แต่ละรอบ sync ทำ **upsert แบบ merge เฉพาะฟิลด์ที่มาจาก ETL** (`$set` ไม่ใช่ replaceOne) —
 * ฟิลด์ใดที่ hr-service เขียนเพิ่มเองใน document เดียวกันทีหลังจะไม่ถูกทับหาย
 *
 * ฟิลด์ของ hr-service ที่มีอยู่ตอนนี้ — **อย่าเพิ่มลงใน `mapDoc()` เด็ดขาด**:
 *   `photoUrl` `photoUpdatedAt` `photoUpdatedBy`  รูปประจำตัวที่อัปจากหน้าทะเบียนประวัติ
 *                                                 (`app/api/drivers/[code]/photo/route.ts`)
 *   `statusOverride` `resignation`                สถานะการจ้าง/การพ้นสภาพที่ฝ่ายบุคคลกดเอง
 *                                                 (`app/api/drivers/[code]/status/route.ts`)
 *   `documents`                                   เอกสารในแฟ้มประวัติ — ตัวไฟล์อยู่ใน GridFS
 *                                                 (`app/api/drivers/[code]/documents/route.ts`)
 */
import fs from "node:fs";
import { MongoClient } from "mongodb";

/* ---------------------------------------------------------------- env */

const env = Object.fromEntries(
  fs
    .readFileSync(new URL(".env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const SOURCE_DB = "Boom_ETL";
const SOURCE_COLLECTION = "main_driver";
const TARGET_COLLECTION = "master_driver";

/* -------------------------------------------------------- แปลงฟิลด์ ETL → master_driver */

/**
 * เฉพาะฟิลด์ที่ยืนยันแล้วว่ามีจริงใน main_driver ดิบ (ดู `.claude/docs/registry-history.md`)
 * ตั้งชื่อใหม่ให้อ่านง่ายฝั่ง hr-service — ของดิบเก็บต้นฉบับไว้เฉย ๆ ไม่ยุ่ง
 */
function mapDoc(raw) {
  return {
    drivercode: String(raw.drivercode ?? "").trim(),
    driverName: raw.driver_name ?? "",
    ownerType: raw.owner_type ?? "",
    branch: raw.branch ?? "",
    vehicleCode: raw.vehicle ?? "",
    startDate: raw.datestart ?? "",
    licenseExpiryDate: raw.driver_expiry_date ?? "",
    phone: raw.phone ?? "",
    active: Boolean(raw.active),
    etlSyncedAt: raw.synced_at ?? null,
    etlSource: raw._source ?? null,
  };
}

/* ------------------------------------------------------------------ main */

const client = new MongoClient(env.MONGO_URI, { serverSelectionTimeoutMS: 15_000 });
await client.connect();

const source = client.db(SOURCE_DB).collection(SOURCE_COLLECTION);
const target = client.db(env.MONGO_DB || "hr_service").collection(TARGET_COLLECTION);

await target.createIndex({ drivercode: 1 }, { unique: true });

const rawDocs = await source.find({}).toArray();
console.log(`อ่านจาก ${SOURCE_DB}.${SOURCE_COLLECTION} ได้ ${rawDocs.length} รายการ (read-only)`);

const now = new Date();
let upserted = 0;
let modified = 0;
let skipped = 0;

for (const raw of rawDocs) {
  const mapped = mapDoc(raw);
  if (!mapped.drivercode) {
    skipped++;
    continue;
  }

  const result = await target.updateOne(
    { drivercode: mapped.drivercode },
    { $set: { ...mapped, syncedAt: now } },
    { upsert: true },
  );

  if (result.upsertedCount) upserted++;
  else if (result.modifiedCount) modified++;
}

console.log(
  `sync เสร็จ — เพิ่มใหม่ ${upserted} · อัปเดต ${modified} · ข้าม (ไม่มี drivercode) ${skipped}`,
);
console.log(`ทั้งหมดใน hr_service.${TARGET_COLLECTION} ตอนนี้: ${await target.countDocuments()}`);

await client.close();
