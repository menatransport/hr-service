import type { Collection } from "mongodb";

import { getDb } from "./mongo";
import type { RecordCategory } from "./record-case-flow";

/**
 * ชั้นข้อมูลของ “ประเภทเคส” (master data) — **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 * คู่ขนานกับ `lib/record-cases.ts` แยกคอลเลกชันกันเพราะวงจรชีวิตต่างกัน
 * (ประเภทแก้ไม่บ่อย เทียบกับเคสที่ไหลเข้าตลอด)
 *
 * `_id` เป็นสตริง = รหัสที่ `RecordCase.category` อ้างถึงตรง ๆ (ไม่ใช่ ObjectId) —
 * ประเภทที่ seed ไว้ตั้งแต่แรกใช้รหัสเดิมที่เคยฮาร์ดโค้ดไว้ (`complaint`, `discipline`, …)
 * เพื่อไม่ให้เคสเก่าเสียการอ้างอิง ส่วนประเภทที่เพิ่มทีหลังได้รหัสสุ่ม เพราะผู้ใช้ไม่เคย
 * เห็น/พิมพ์รหัสนี้เอง (กรอกแค่ป้ายภาษาไทย)
 *
 * **ลบประเภทที่เคสเก่ายังอ้างถึงอยู่ได้โดยตั้งใจ** — ไม่ backfill เคสเก่าให้ เหมือนพฤติกรรม
 * เดิมตอน `category` เป็น `""`: `recordCategoryLabel()` คืน “—” เมื่อหารหัสนั้นไม่เจอ
 */

const CATEGORIES = "record_categories";

interface CategoryDoc {
  _id: string;
  label: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

/** ชุดเริ่มต้น — ของเดิมที่เคยเป็น `RECORD_CATEGORIES` แบบฮาร์ดโค้ดใน `record-case-flow.ts`
 * ย้ายมาที่นี่เป็นข้อมูลตั้งต้นครั้งเดียว (seed) ไม่ใช่กฎที่ตายตัวอีกต่อไป */
const SEED: { id: string; label: string }[] = [
  { id: "complaint", label: "ร้องเรียน / ร้องทุกข์" },
  { id: "discipline", label: "วินัย / ตักเตือน" },
  { id: "accident", label: "อุบัติเหตุ / ความปลอดภัย" },
  { id: "attendance", label: "เวลาทำงาน / ขาด-ลา-มาสาย" },
  { id: "welfare", label: "สวัสดิการ / ค่าตอบแทน" },
  { id: "asset", label: "ทรัพย์สิน / ความเสียหาย" },
  { id: "other", label: "อื่น ๆ" },
];

async function collection(): Promise<Collection<CategoryDoc>> {
  const db = await getDb();
  const col = db.collection<CategoryDoc>(CATEGORIES);
  await ensureSeed(col);
  return col;
}

/**
 * seed ครั้งเดียวต่อโปรเซสเมื่อคอลเลกชันยังว่าง — ล้มเหลวแล้วไม่โยนต่อโดยตั้งใจ
 * (เช่นผู้ใช้ฐานข้อมูลไม่มีสิทธิ์เขียน) เพราะเป็นแค่ข้อมูลตั้งต้น ไม่ใช่ความถูกต้องของระบบ
 */
let seeded = false;
async function ensureSeed(col: Collection<CategoryDoc>) {
  if (seeded) return;
  seeded = true;
  try {
    const count = await col.estimatedDocumentCount();
    if (count > 0) return;
    const now = new Date().toISOString();
    await col.insertMany(
      SEED.map((c, i) => ({
        _id: c.id,
        label: c.label,
        order: i,
        createdAt: now,
        updatedAt: now,
      })),
    );
  } catch (err) {
    console.warn("[record-categories] seed ค่าเริ่มต้นไม่สำเร็จ —", err);
  }
}

function toCategory(doc: CategoryDoc): RecordCategory {
  return { id: doc._id, label: doc.label };
}

/* --------------------------------------------------------------- ตรวจข้อมูลเข้า */

export class RecordCategoryError extends Error {}

const MAX_LABEL = 60;

function label(value: unknown): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) throw new RecordCategoryError("กรุณากรอกชื่อประเภทเคส");
  if (v.length > MAX_LABEL)
    throw new RecordCategoryError(`ชื่อประเภทเคสยาวเกิน ${MAX_LABEL} ตัวอักษร`);
  return v;
}

/* --------------------------------------------------------------------- อ่าน */

export async function listRecordCategories(): Promise<RecordCategory[]> {
  const col = await collection();
  const docs = await col.find({}, { sort: { order: 1 } }).toArray();
  return docs.map(toCategory);
}

/** ใช้ตรวจรหัสที่ยิงมากับการสร้าง/แก้ไขเคส — ต้องมีอยู่จริงในคอลเลกชันนี้เท่านั้น */
export async function isKnownRecordCategory(id: unknown): Promise<boolean> {
  if (typeof id !== "string" || !id) return false;
  const col = await collection();
  const doc = await col.findOne({ _id: id }, { projection: { _id: 1 } });
  return Boolean(doc);
}

/* -------------------------------------------------------------------- เขียน */

export async function createRecordCategory(input: unknown): Promise<RecordCategory> {
  const value = label(input);
  const col = await collection();

  const existing = await col.find({}, { projection: { label: 1, order: 1 } }).toArray();
  if (existing.some((c) => c.label.toLowerCase() === value.toLowerCase()))
    throw new RecordCategoryError(`มีประเภทเคส “${value}” อยู่แล้ว`);

  const now = new Date().toISOString();
  const order = existing.reduce((max, c) => Math.max(max, c.order), -1) + 1;
  const doc: CategoryDoc = {
    _id: crypto.randomUUID(),
    label: value,
    order,
    createdAt: now,
    updatedAt: now,
  };

  await col.insertOne(doc);
  return toCategory(doc);
}

export async function updateRecordCategory(
  id: string,
  input: unknown,
): Promise<RecordCategory> {
  const value = label(input);
  const col = await collection();

  const others = await col.find({ _id: { $ne: id } }, { projection: { label: 1 } }).toArray();
  if (others.some((c) => c.label.toLowerCase() === value.toLowerCase()))
    throw new RecordCategoryError(`มีประเภทเคส “${value}” อยู่แล้ว`);

  const updated = await col.findOneAndUpdate(
    { _id: id },
    { $set: { label: value, updatedAt: new Date().toISOString() } },
    { returnDocument: "after" },
  );
  if (!updated) throw new RecordCategoryError("ไม่พบประเภทเคสที่ระบุ");
  return toCategory(updated);
}

export async function deleteRecordCategory(id: string): Promise<void> {
  const col = await collection();
  const { deletedCount } = await col.deleteOne({ _id: id });
  if (!deletedCount) throw new RecordCategoryError("ไม่พบประเภทเคสที่ระบุ");
}
