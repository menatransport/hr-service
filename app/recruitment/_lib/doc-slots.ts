import { randomUUID } from "node:crypto";

import type { Collection, WithId } from "mongodb";

import { getDb } from "@/lib/mongo";
import { DEFAULT_DOC_SLOTS, isLockedDocSlot, type DocSlot } from "./form";
import { RecruitmentError } from "./questions";

/**
 * คลังเอกสารแนบ (Section 4 ของหน้าคลังคำถาม) — **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 *
 * ทรงเดียวกับคลังคำถาม: เพิ่ม แก้ ลบ ลากจัดลำดับได้ · `slot` คือสัญญาระหว่างช่อง
 * กับไฟล์ที่แนบไปแล้ว **ตั้งแล้วห้ามเปลี่ยน** (ข้อใหม่ได้ค่าสุ่ม) · ช่องที่ผูกกับ
 * `DOCUMENT_FIELDS` ลบไม่ได้ (ดู `isLockedDocSlot`) แต่ซ่อนได้
 *
 * ลบช่องแล้วใบเก่าไม่เสียหาย — ไฟล์แต่ละไฟล์พกชื่อช่องของตัวเองไว้ (`ApplicationFile.label`)
 */

const COLLECTION = "recruitment_doc_slot";

interface DocSlotDoc {
  slot: string;
  order: number;
  label: string;
  hint: string;
  visible: boolean;
  required: boolean;
  updatedAt: string;
  updatedBy: string;
}

let indexesReady: Promise<void> | undefined;

async function slots(): Promise<Collection<DocSlotDoc>> {
  const col = (await getDb()).collection<DocSlotDoc>(COLLECTION);
  indexesReady ??= col
    .createIndexes([{ key: { slot: 1 }, name: "slot_unique", unique: true }])
    .then(() => undefined);
  await indexesReady;
  return col;
}

function toDocSlot(doc: WithId<DocSlotDoc>): DocSlot {
  return {
    id: doc.slot,
    label: doc.label,
    hint: doc.hint ?? "",
    visible: doc.visible,
    required: doc.visible && doc.required,
  };
}

function text(value: unknown, field: string, max: number, required = true): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v && required) throw new RecruitmentError(`ยังไม่ได้กรอก${field}`);
  if (v.length > max) throw new RecruitmentError(`${field}ยาวเกิน ${max} ตัวอักษร`);
  return v;
}

function parseDraft(body: Record<string, unknown>) {
  const visible = body.visible !== false;
  return {
    label: text(body.label, "ชื่อเอกสาร", 80),
    hint: text(body.hint, "คำอธิบาย", 200, false),
    visible,
    /* ซ่อนแล้วบังคับไม่ได้ — ช่องที่ผู้สมัครมองไม่เห็นแต่บังคับแนบ คือใบสมัคร
       ที่ส่งไม่ผ่านโดยไม่มีทางรู้ว่าติดอะไร · เขียนลงฐานเป็น false ด้วย ไม่ใช่
       แค่ตีความตอนอ่าน เปิดกลับมาจะได้เริ่มที่ “ไม่บังคับ” ให้คนตั้งใหม่อย่างรู้ตัว */
    required: visible && body.required === true,
  };
}

/* -------------------------------------------------------------------- อ่าน */

/** ทุกช่องรวมที่ซ่อน เรียงตามลำดับจริง */
export async function listDocSlots(): Promise<DocSlot[]> {
  await ensureSeeded();
  const docs = await (await slots()).find({}).sort({ order: 1 }).toArray();
  return docs.map(toDocSlot);
}

/* ------------------------------------------------------------------- เขียน */

export async function createDocSlot(
  body: Record<string, unknown>,
  by: string,
): Promise<DocSlot[]> {
  const draft = parseDraft(body);
  const col = await slots();
  const last = await col.find({}).sort({ order: -1 }).limit(1).next();

  await col.insertOne({
    ...draft,
    slot: `d_${randomUUID().replace(/-/g, "").slice(0, 10)}`,
    order: (last?.order ?? 0) + 10,
    updatedAt: new Date().toISOString(),
    updatedBy: by,
  } as DocSlotDoc);

  return listDocSlots();
}

export async function updateDocSlot(
  id: string,
  body: Record<string, unknown>,
  by: string,
): Promise<DocSlot[]> {
  const col = await slots();
  const { matchedCount } = await col.updateOne(
    { slot: id },
    {
      $set: {
        ...parseDraft(body),
        updatedAt: new Date().toISOString(),
        updatedBy: by,
      },
    },
  );
  if (!matchedCount) throw new RecruitmentError("ไม่พบเอกสารที่ต้องการแก้ไข");
  return listDocSlots();
}

export async function deleteDocSlot(id: string): Promise<DocSlot[]> {
  const col = await slots();
  const current = await col.findOne({ slot: id });
  if (!current) throw new RecruitmentError("ไม่พบเอกสารที่ต้องการลบ");

  if (isLockedDocSlot(id)) {
    throw new RecruitmentError(
      `“${current.label}” เป็นเอกสารหลักของระบบ ลบไม่ได้ — ฝ่ายบุคคลกรอกข้อมูลจากเอกสารนี้ในหน้าผู้สมัคร ถ้าไม่ต้องการให้ผู้สมัครแนบ ให้ซ่อนแทน`,
    );
  }

  await col.deleteOne({ _id: current._id });
  return listDocSlots();
}

/** เขียนลำดับใหม่ทั้งชุดทีเดียว — เว้นทีละสิบเหมือนคลังคำถาม */
export async function reorderDocSlots(ids: string[], by: string): Promise<DocSlot[]> {
  const valid = ids.filter((id) => typeof id === "string" && id);
  if (!valid.length) throw new RecruitmentError("ไม่มีเอกสารให้จัดลำดับ");

  const now = new Date().toISOString();
  await (await slots()).bulkWrite(
    valid.map((slot, i) => ({
      updateOne: {
        filter: { slot },
        update: { $set: { order: (i + 1) * 10, updatedAt: now, updatedBy: by } },
      },
    })),
  );
  return listDocSlots();
}

/* -------------------------------------------------------------------- seed */

let seeding: Promise<void> | undefined;

/**
 * ลงชุดตั้งต้นครั้งเดียวตอนคลังว่างสนิท — ไม่ upsert รายช่อง เพราะช่องที่ฝ่ายบุคคล
 * ลบทิ้งไปแล้วจะถูกพากลับมาทุกครั้งที่รีสตาร์ต (เหตุผลเดียวกับ `questions.ts`)
 */
async function ensureSeeded(): Promise<void> {
  seeding ??= (async () => {
    const col = await slots();
    if (await col.countDocuments({}, { limit: 1 })) return;

    const now = new Date().toISOString();
    await col.insertMany(
      DEFAULT_DOC_SLOTS.map((s, i) => ({
        slot: s.id,
        order: (i + 1) * 10,
        label: s.label,
        hint: s.hint,
        visible: s.visible,
        required: s.required,
        updatedAt: now,
        updatedBy: "ระบบ",
      })),
      { ordered: false },
    );
  })().catch((err: unknown) => {
    seeding = undefined;
    throw err;
  });

  await seeding;
}
