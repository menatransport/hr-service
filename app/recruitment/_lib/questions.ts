import { randomUUID } from "node:crypto";

import { ObjectId, type Collection, type WithId } from "mongodb";

import { getDb } from "@/lib/mongo";
import { DEFAULT_QUESTIONS, type QuestionDraft } from "./default-questions";
import { LOCKED_KEYS } from "./form";
import {
  isSectionId,
  QUESTION_SECTIONS,
  type Question,
  type QuestionCondition,
  type QuestionKind,
  type QuestionOption,
  type SectionId,
} from "./types";

/**
 * คลังคำถามของฟอร์มสมัครงาน — **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 * (เรียกจาก `page.tsx` กับ `app/api/recruitment/**` · client ยิงผ่าน API แทน
 * เหมือน `lib/record-cases.ts` — ห้าม import จาก client component)
 *
 * คอลเลกชัน `recruitment_regist_question` ตามที่ระบุไว้ใน
 * `app/recruitment/regist/requirment.md`
 *
 * **`key` คือสัญญาระหว่างคำถามกับคำตอบ** — คำตอบทุกใบอ้างคำถามด้วย `key`
 * ไม่ใช่ `_id` การเปลี่ยน `key` ของคำถามที่มีคนตอบไปแล้วจึงเท่ากับทำให้คำตอบเก่า
 * กลายเป็นเด็กกำพร้า ระบบจึงห้ามแก้ `key` หลังสร้าง (แก้ข้อความ `label` ได้เสมอ)
 *
 * **แอดมินไม่ได้ตั้ง `key` เอง** — ข้อใหม่ได้กุญแจสุ่มจาก `freshKey()` · มีแต่ชุด
 * คำถามตั้งต้นใน `default-questions.ts` ที่ตั้งชื่อไว้เอง เพราะโค้ดอ้างชื่อพวกนั้น
 * ตรง ๆ (`LOCKED_KEYS` สำหรับชื่อ/เบอร์ · `SUMMARY_KEYS` สำหรับคอลัมน์ในตาราง)
 */

const COLLECTION = "recruitment_regist_question";

export class RecruitmentError extends Error {}

/* ------------------------------------------------------------------ รูปในฐานข้อมูล */

interface QuestionDoc {
  key: string;
  section: SectionId;
  order: number;
  label: string;
  hint: string;
  placeholder: string;
  kind: QuestionKind;
  options: QuestionOption[];
  required: boolean;
  sensitive: boolean;
  condition: QuestionCondition | null;
  active: boolean;
  updatedAt: string;
  updatedBy: string;
}

let indexesReady: Promise<void> | undefined;

async function questions(): Promise<Collection<QuestionDoc>> {
  const db = await getDb();
  const col = db.collection<QuestionDoc>(COLLECTION);
  // สร้างครั้งเดียวต่อกระบวนการ — `createIndexes` ซ้ำ ๆ ทุก request เปลืองรอบเปล่า
  indexesReady ??= col
    .createIndexes([
      { key: { key: 1 }, name: "key_unique", unique: true },
      { key: { section: 1, order: 1 }, name: "section_order" },
    ])
    .then(() => undefined);
  await indexesReady;
  return col;
}

const SECTION_RANK = new Map<string, number>(
  QUESTION_SECTIONS.map((s, i) => [s.id, i]),
);

function toQuestion(doc: WithId<QuestionDoc>): Question {
  return {
    id: doc._id.toHexString(),
    key: doc.key,
    section: doc.section,
    order: doc.order,
    label: doc.label,
    hint: doc.hint ?? "",
    placeholder: doc.placeholder ?? "",
    kind: doc.kind,
    options: doc.options ?? [],
    required: doc.required,
    sensitive: doc.sensitive ?? false,
    condition: doc.condition ?? null,
    active: doc.active,
    updatedAt: doc.updatedAt,
    updatedBy: doc.updatedBy,
  };
}

/** เรียงตามลำดับหมวดที่ออกแบบไว้ แล้วค่อยเรียงตาม `order` ในหมวด */
function sortQuestions(list: Question[]): Question[] {
  return list.sort(
    (a, b) =>
      (SECTION_RANK.get(a.section) ?? 99) - (SECTION_RANK.get(b.section) ?? 99) ||
      a.order - b.order,
  );
}

/* --------------------------------------------------------------- ตรวจข้อมูลเข้า */

const KEY_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;
const KINDS: QuestionKind[] = [
  "text",
  "tel",
  "nid",
  "number",
  "date",
  "single",
  "multi",
  "textarea",
];

const NEEDS_OPTIONS: QuestionKind[] = ["single", "multi"];

function text(value: unknown, field: string, max: number, required = true): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v && required) throw new RecruitmentError(`ยังไม่ได้กรอก${field}`);
  if (v.length > max) throw new RecruitmentError(`${field}ยาวเกิน ${max} ตัวอักษร`);
  return v;
}

function parseOptions(raw: unknown, kind: QuestionKind): QuestionOption[] {
  if (!NEEDS_OPTIONS.includes(kind)) return [];

  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const options: QuestionOption[] = [];

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const { value, label } = item as { value?: unknown; label?: unknown };
    const v = typeof value === "string" ? value.trim() : "";
    const l = typeof label === "string" ? label.trim() : "";
    if (!v || !l || seen.has(v)) continue;
    seen.add(v);
    options.push({ value: v, label: l });
  }

  if (options.length < 2)
    throw new RecruitmentError("คำถามแบบเลือกตอบต้องมีตัวเลือกอย่างน้อย 2 ข้อ");
  if (options.length > 30)
    throw new RecruitmentError("ตัวเลือกมากเกินไป — เกิน 30 ข้อผู้สมัครหาไม่เจอแล้ว");
  return options;
}

function parseCondition(raw: unknown): QuestionCondition | null {
  if (!raw || typeof raw !== "object") return null;
  const { key, equals } = raw as { key?: unknown; equals?: unknown };
  const k = typeof key === "string" ? key.trim() : "";
  const values = Array.isArray(equals)
    ? equals.filter((v): v is string => typeof v === "string" && v.trim() !== "")
    : [];
  if (!k || values.length === 0) return null;
  return { key: k, equals: values };
}

function parseKind(raw: unknown): QuestionKind {
  if (typeof raw === "string" && (KINDS as string[]).includes(raw)) {
    return raw as QuestionKind;
  }
  throw new RecruitmentError("ชนิดคำถามไม่ถูกต้อง");
}

/** แปลง body ที่ client ส่งมาเป็นเอกสารที่พร้อมเขียนลงฐาน */
function parseDraft(body: Record<string, unknown>): QuestionDraft {
  const kind = parseKind(body.kind);
  const section = body.section;
  if (!isSectionId(section)) throw new RecruitmentError("Section ของคำถามไม่ถูกต้อง");

  /**
   * กุญแจคำถาม — **ไม่บังคับส่งมาแล้ว** · ว่างเมื่อไหร่ `createQuestion` สุ่มให้เอง
   *
   * ยังรับค่าที่ส่งมาอยู่เพราะชุดคำถามตั้งต้น (`default-questions.ts`) ตั้งกุญแจ
   * ที่มีความหมายไว้เอง และโค้ดฝั่งแอดมินอ้างชื่อพวกนั้นตรง ๆ (`LOCKED_KEYS`,
   * `SUMMARY_KEYS`) · ส่วนการแก้ไขส่งกุญแจเดิมกลับมาเสมอ (ดู `updateQuestion`)
   */
  const key = text(body.key, "กุญแจคำถาม", 40, false).toLowerCase();
  if (key && !KEY_PATTERN.test(key))
    throw new RecruitmentError(
      "กุญแจคำถามใช้ได้เฉพาะ a–z ตัวเลข และขีดล่าง โดยขึ้นต้นด้วยตัวอักษร",
    );

  return {
    key,
    section,
    order: typeof body.order === "number" ? body.order : 999,
    label: text(body.label, "ข้อความคำถาม", 200),
    hint: text(body.hint, "คำอธิบาย", 200, false),
    placeholder: text(body.placeholder, "ข้อความตัวอย่าง", 100, false),
    kind,
    options: parseOptions(body.options, kind),
    required: body.required !== false,
    sensitive: body.sensitive === true,
    condition: parseCondition(body.condition),
    active: body.active !== false,
  };
}

/* -------------------------------------------------------------------- อ่าน */

/** คำถามทั้งหมดรวมข้อที่ปิดใช้ — สำหรับหน้าแอดมิน */
export async function listQuestions(): Promise<Question[]> {
  await ensureSeeded();
  const docs = await (await questions()).find({}).toArray();
  return sortQuestions(docs.map(toQuestion));
}

/** เฉพาะข้อที่เปิดใช้ — สำหรับฟอร์มสาธารณะ */
export async function listActiveQuestions(): Promise<Question[]> {
  return (await listQuestions()).filter((q) => q.active);
}

/* ------------------------------------------------------------------- เขียน */

/**
 * กุญแจของข้อใหม่ — **ระบบสุ่มให้ ไม่ได้ให้คนตั้ง**
 *
 * กุญแจเป็นแค่ชื่อช่องที่คำตอบถูกเก็บไว้ข้างใต้ คนกรอกไม่เคยเห็น และห้ามเปลี่ยน
 * หลังมีคนตอบแล้ว — การให้แอดมินคิดเองจึงเป็นช่องที่ต้องคิดหนึ่งช่องโดยไม่ได้อะไร
 * กลับมา ซ้ำยังพลาดได้ (ตั้งชนกับข้ออื่น หรือตั้งชื่อที่ความหมายเพี้ยนไปจาก
 * คำถามภายหลัง) · ป้ายคำถามภาษาไทยแปลงเป็น a–z ไม่ได้ จึงสุ่มตรง ๆ แทนการ
 * พยายามทำให้อ่านรู้เรื่อง ซึ่งจะได้กุญแจที่ “ดูเหมือนมีความหมาย” แต่เชื่อไม่ได้
 */
async function freshKey(col: Collection<QuestionDoc>): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const key = `q_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
    if (!(await col.findOne({ key }))) return key;
  }
  throw new RecruitmentError("สร้างกุญแจคำถามไม่สำเร็จ ลองอีกครั้ง");
}

export async function createQuestion(
  body: Record<string, unknown>,
  by: string,
): Promise<Question> {
  const draft = parseDraft(body);
  const col = await questions();

  const key = draft.key || (await freshKey(col));

  if (await col.findOne({ key })) {
    throw new RecruitmentError(`มีคำถามที่ใช้กุญแจ “${key}” อยู่แล้ว`);
  }

  // วางต่อท้ายหมวดเสมอ — เลื่อนขึ้นลงทีหลังได้ ไม่ต้องให้ใครกรอกเลขลำดับเอง
  const last = await col
    .find({ section: draft.section })
    .sort({ order: -1 })
    .limit(1)
    .next();

  const doc: QuestionDoc = {
    ...draft,
    key,
    order: (last?.order ?? 0) + 10,
    updatedAt: new Date().toISOString(),
    updatedBy: by,
  };

  const { insertedId } = await col.insertOne(doc as QuestionDoc);
  return toQuestion({ ...doc, _id: insertedId });
}

export async function updateQuestion(
  id: string,
  body: Record<string, unknown>,
  by: string,
): Promise<Question> {
  if (!ObjectId.isValid(id)) throw new RecruitmentError("ไม่พบคำถามที่ต้องการแก้ไข");
  const col = await questions();
  const current = await col.findOne({ _id: new ObjectId(id) });
  if (!current) throw new RecruitmentError("ไม่พบคำถามที่ต้องการแก้ไข");

  /* `key` มาจากเอกสารเดิมเสมอ ต่อให้ client ส่งค่าใหม่มาก็ถูกทิ้ง —
     คำตอบที่บันทึกไปแล้วอ้างกุญแจนี้อยู่ (ดูหมายเหตุหัวไฟล์) */
  const draft = parseDraft({ ...body, key: current.key });

  if (LOCKED_KEYS.includes(current.key)) {
    if (draft.kind !== current.kind)
      throw new RecruitmentError(
        `“${current.label}” เป็นคำถามหลักของระบบ เปลี่ยนชนิดคำตอบไม่ได้`,
      );
    if (!draft.required || !draft.active)
      throw new RecruitmentError(
        `“${current.label}” เป็นคำถามหลักของระบบ ปิดใช้หรือทำให้ไม่บังคับกรอกไม่ได้`,
      );
  }

  await guardDependants(col, current, draft);

  const next: QuestionDoc = {
    ...draft,
    order: current.order,
    updatedAt: new Date().toISOString(),
    updatedBy: by,
  };

  await col.updateOne({ _id: current._id }, { $set: next });
  return toQuestion({ ...next, _id: current._id });
}

/**
 * กันการแก้ที่ทำให้คำถาม “ลูก” ไม่มีวันแสดงอีก
 *
 * คำถามที่ตั้งเงื่อนไขไว้อ่านสองอย่างจากคำถามต้นทาง: **ชนิด** (ต้องเป็นแบบเลือกตอบ)
 * และ **ค่าของตัวเลือก** · การเปลี่ยนชนิดเป็นข้อความ หรือลบตัวเลือกที่ถูกอ้างอยู่
 * เคยบันทึกผ่านได้ตามปกติ แล้วคำถามลูกก็หายไปจากฟอร์มเงียบ ๆ โดยไม่มีอะไรฟ้อง —
 * เจอได้ทางเดียวคือมีคนสังเกตว่าไม่มีใครตอบข้อนั้นเลย
 *
 * ตรวจฝั่งเซิร์ฟเวอร์ไม่ใช่ฝั่งหน้าจอ เพราะปุ่มเปิด/ปิดใช้ในรายการยิง `PATCH`
 * ตรงโดยไม่เปิดกล่องแก้ไข การตรวจที่กล่องแก้ไขอย่างเดียวจึงข้ามได้
 */
async function guardDependants(
  col: Collection<QuestionDoc>,
  current: WithId<QuestionDoc>,
  draft: QuestionDraft,
): Promise<void> {
  const dependants = await col
    .find({ "condition.key": current.key })
    .project<{ label: string; condition: QuestionCondition | null }>({
      label: 1,
      condition: 1,
    })
    .toArray();

  if (!dependants.length) return;

  const names = dependants.map((d) => `“${d.label}”`).join(" · ");

  if (!NEEDS_OPTIONS.includes(draft.kind)) {
    throw new RecruitmentError(
      `เปลี่ยนชนิดคำตอบไม่ได้ เพราะมีคำถามที่แสดงตามตัวเลือกของข้อนี้อยู่: ${names} — แก้เงื่อนไขของข้อเหล่านั้นก่อน`,
    );
  }

  const values = new Set(draft.options.map((o) => o.value));
  const orphaned = new Map<string, string[]>();

  for (const dependant of dependants) {
    const gone = (dependant.condition?.equals ?? []).filter((v) => !values.has(v));
    if (gone.length) orphaned.set(dependant.label, gone);
  }

  if (orphaned.size) {
    const detail = [...orphaned]
      .map(([label, gone]) => `“${label}” (อ้าง ${gone.join(" · ")})`)
      .join(" · ");
    throw new RecruitmentError(
      `ลบตัวเลือกนี้ไม่ได้ เพราะมีคำถามที่ตั้งเงื่อนไขกับมันอยู่: ${detail} — แก้เงื่อนไขของข้อเหล่านั้นก่อน`,
    );
  }
}

/**
 * ลบคำถามออกจากคลัง — **ไม่แตะคำตอบเก่า**
 *
 * ใบสมัครทุกใบเก็บ `questionSnapshot` ของตัวเองไว้ ใบเก่าจึงยังแสดงข้อความคำถาม
 * และป้ายตัวเลือกได้ตามปกติหลังลบ · ถึงอย่างนั้นหน้าแอดมินก็ยังชี้ให้ “ปิดใช้”
 * เป็นทางหลัก เพราะคำถามที่ลบแล้วสร้างใหม่ด้วยกุญแจเดิมจะไปทับความหมายของ
 * คำตอบเก่าโดยที่ไม่มีใครรู้
 */
export async function deleteQuestion(id: string): Promise<void> {
  if (!ObjectId.isValid(id)) throw new RecruitmentError("ไม่พบคำถามที่ต้องการลบ");
  const col = await questions();
  const current = await col.findOne({ _id: new ObjectId(id) });
  if (!current) throw new RecruitmentError("ไม่พบคำถามที่ต้องการลบ");

  if (LOCKED_KEYS.includes(current.key)) {
    throw new RecruitmentError(
      `“${current.label}” เป็นคำถามหลักของระบบ ลบไม่ได้ — ตารางผู้สมัครใช้ค่านี้เป็นชื่อและเบอร์ติดต่อ`,
    );
  }

  const dependants = await col
    .find({ "condition.key": current.key })
    .project<{ label: string }>({ label: 1 })
    .toArray();

  if (dependants.length) {
    throw new RecruitmentError(
      `ลบไม่ได้ เพราะมีคำถามที่แสดงตามคำตอบของข้อนี้อยู่: ${dependants
        .map((d) => `“${d.label}”`)
        .join(" · ")}`,
    );
  }

  await col.deleteOne({ _id: current._id });
}

/** เขียนลำดับใหม่ทั้งหมวดทีเดียวด้วย `bulkWrite` — ยิงทีละข้อจะพังกลางทางถ้าเน็ตหลุด */
export async function reorderQuestions(
  ids: string[],
  by: string,
): Promise<Question[]> {
  const valid = ids.filter((id) => ObjectId.isValid(id));
  if (!valid.length) throw new RecruitmentError("ไม่มีคำถามให้จัดลำดับ");

  const now = new Date().toISOString();
  await (
    await questions()
  ).bulkWrite(
    valid.map((id, i) => ({
      updateOne: {
        filter: { _id: new ObjectId(id) },
        // เว้นทีละสิบ เพื่อให้แทรกข้อใหม่กลางหมวดได้โดยไม่ต้องเขียนใหม่ทั้งชุด
        update: { $set: { order: (i + 1) * 10, updatedAt: now, updatedBy: by } },
      },
    })),
  );

  return listQuestions();
}

/* -------------------------------------------------------------------- seed */

let seeding: Promise<void> | undefined;

/**
 * ลงชุดคำถามตั้งต้นให้ครั้งเดียวตอนคลังยังว่างสนิท
 *
 * เช็ค `countDocuments` ไม่ใช่ upsert รายข้อ **โดยตั้งใจ** — ถ้าฝ่ายบุคคลลบ
 * คำถามตั้งต้นทิ้งเพราะไม่ต้องการ การ upsert จะพามันกลับมาทุกครั้งที่รีสตาร์ต
 */
async function ensureSeeded(): Promise<void> {
  seeding ??= (async () => {
    const col = await questions();
    if (await col.countDocuments({}, { limit: 1 })) return;

    const now = new Date().toISOString();
    await col.insertMany(
      DEFAULT_QUESTIONS.map((q) => ({ ...q, updatedAt: now, updatedBy: "ระบบ" })),
      { ordered: false },
    );
  })().catch((err: unknown) => {
    // ล้มเหลวแล้วต้องลองใหม่ได้ ไม่งั้น promise ที่ reject แล้วจะ reject ตลอดอายุ process
    seeding = undefined;
    throw err;
  });

  await seeding;
}
