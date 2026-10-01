import { ObjectId, type Collection, type WithId } from "mongodb";

import { getDb } from "@/lib/mongo";
import { RecruitmentError } from "@/app/recruitment/_lib/questions";
import {
  compareCode,
  isExitType,
  type ExitType,
  type ResignCategory,
  type ResignMaster,
  type ResignReason,
  type ResignReasonPick,
} from "./types";

/**
 * Reason Code Master — **ฝั่งเซิร์ฟเวอร์เท่านั้น** (client ยิงผ่าน `/api/recruitment/resign-reasons`)
 *
 * สองคอลเลกชันใน `hr_service`:
 * - `master_resign_category` — หมวดใหญ่ (P รายได้ · J เวลาทำงาน · … · N ไม่ได้ข้อมูล)
 * - `master_resign_reason`   — รหัสรายตัว (P1 … N2) ผูกหมวดด้วย `categoryId`
 *
 * **รหัส (`code`) กับอักษรนำหมวด (`prefix`) แก้ไม่ได้หลังสร้าง** — ระเบียนที่บันทึก
 * ไปแล้วอ้างรหัสนี้อยู่ แก้ได้เฉพาะข้อความ ลำดับ และประเภทการออก
 *
 * ลบรหัสได้เสมอ เพราะของที่บันทึกไปแล้วเก็บสำเนาป้ายไว้กับตัว · ส่วนหมวดลบได้
 * เฉพาะตอนไม่มีรหัสเหลือในหมวดแล้ว (กันรหัสกำพร้าที่ไม่มีหมวดให้แสดง)
 */

const CATEGORIES = "master_resign_category";
const REASONS = "master_resign_reason";

const MAX_LABEL = 120;
const MAX_DESC = 300;

interface CategoryDoc {
  prefix: string;
  label: string;
  exitType: ExitType;
  order: number;
  updatedAt: string;
  updatedBy: string;
}

interface ReasonDoc {
  code: string;
  categoryId: string;
  label: string;
  description: string;
  exitType: ExitType;
  active: boolean;
  order: number;
  updatedAt: string;
  updatedBy: string;
}

let indexed = false;

async function cols(): Promise<{
  categories: Collection<CategoryDoc>;
  reasons: Collection<ReasonDoc>;
}> {
  const db = await getDb();
  const categories = db.collection<CategoryDoc>(CATEGORIES);
  const reasons = db.collection<ReasonDoc>(REASONS);

  /* ดัชนี unique คือด่านสุดท้ายกันรหัสซ้ำ — สร้างไม่ได้ก็ยังมีการตรวจซ้ำในโค้ด
     จึงไม่ล้มทั้งหน้า (ท่าเดียวกับ `requisitions/store.ts`) */
  if (!indexed) {
    indexed = true;
    try {
      await Promise.all([
        categories.createIndex({ prefix: 1 }, { name: "prefix_unique", unique: true }),
        reasons.createIndex({ code: 1 }, { name: "code_unique", unique: true }),
      ]);
    } catch (err) {
      console.warn("[resign-reasons] สร้างดัชนีไม่สำเร็จ —", err);
    }
  }

  return { categories, reasons };
}

function toCategory(doc: WithId<CategoryDoc>): ResignCategory {
  return {
    id: doc._id.toHexString(),
    prefix: doc.prefix,
    label: doc.label,
    exitType: isExitType(doc.exitType) ? doc.exitType : "vol",
    order: doc.order ?? 0,
    updatedAt: doc.updatedAt ?? "",
    updatedBy: doc.updatedBy ?? "",
  };
}

function toReason(doc: WithId<ReasonDoc>): ResignReason {
  return {
    id: doc._id.toHexString(),
    code: doc.code,
    categoryId: doc.categoryId,
    label: doc.label,
    description: doc.description ?? "",
    exitType: isExitType(doc.exitType) ? doc.exitType : "vol",
    active: doc.active !== false,
    order: doc.order ?? 0,
    updatedAt: doc.updatedAt ?? "",
    updatedBy: doc.updatedBy ?? "",
  };
}

/* ------------------------------------------------------------------ อ่าน */

export async function getResignMaster(): Promise<ResignMaster> {
  const { categories, reasons } = await cols();
  const [cats, rows] = await Promise.all([
    categories.find().sort({ order: 1 }).toArray(),
    reasons.find().toArray(),
  ]);
  return {
    categories: cats.map(toCategory),
    reasons: rows
      .map(toReason)
      .sort((a, b) => a.order - b.order || compareCode(a.code, b.code)),
  };
}

/**
 * ตรวจรหัสที่ผู้ใช้เลือกมา แล้วคืนสำเนาป้ายไว้แนบกับระเบียน — ใช้ตอนบันทึกเท่านั้น
 *
 * `allowInactive` = รหัสที่ถูกปิดใช้แล้วแต่ระเบียนนี้ถืออยู่เดิม (กำลังแก้ข้อมูลเก่า)
 */
export async function pickResignReason(
  code: unknown,
  allowInactive = "",
): Promise<ResignReasonPick | null> {
  const value = typeof code === "string" ? code.trim() : "";
  if (!value) return null;

  const { categories, reasons } = await cols();
  const doc = await reasons.findOne({ code: value });
  if (!doc) return null;
  if (doc.active === false && doc.code !== allowInactive) return null;

  const cat = ObjectId.isValid(doc.categoryId)
    ? await categories.findOne({ _id: new ObjectId(doc.categoryId) })
    : null;

  return {
    code: doc.code,
    label: doc.label,
    categoryLabel: cat?.label ?? "",
    exitType: isExitType(doc.exitType) ? doc.exitType : "vol",
  };
}

/* ------------------------------------------------------------ ตรวจค่าที่ส่งมา */

function text(v: unknown, field: string, max: number, required = true): string {
  const value = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  if (required && !value) throw new RecruitmentError(`กรุณากรอก${field}`);
  if (value.length > max) throw new RecruitmentError(`${field}ยาวเกิน ${max} ตัวอักษร`);
  return value;
}

function exitType(v: unknown): ExitType {
  if (!isExitType(v)) throw new RecruitmentError("กรุณาเลือกประเภทการออก");
  return v;
}

function oid(id: string, what: string): ObjectId {
  if (!ObjectId.isValid(id)) throw new RecruitmentError(`ไม่พบ${what}ที่ระบุ`);
  return new ObjectId(id);
}

const stamp = (who: string) => ({ updatedAt: new Date().toISOString(), updatedBy: who });

/* ------------------------------------------------------------------ หมวด */

export async function createCategory(
  input: Record<string, unknown>,
  who: string,
): Promise<ResignCategory> {
  const prefix = text(input.prefix, "อักษรนำหน้ารหัส", 3).toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(prefix))
    throw new RecruitmentError("อักษรนำหน้ารหัสต้องเป็นภาษาอังกฤษ 1–3 ตัว เช่น P หรือ J");

  const { categories } = await cols();
  if (await categories.findOne({ prefix }))
    throw new RecruitmentError(`มีหมวดที่ใช้อักษร ${prefix} อยู่แล้ว`);

  const last = await categories.find().sort({ order: -1 }).limit(1).next();
  const doc: CategoryDoc = {
    prefix,
    label: text(input.label, "ชื่อหมวด", MAX_LABEL),
    exitType: exitType(input.exitType),
    order: (last?.order ?? 0) + 1,
    ...stamp(who),
  };
  const { insertedId } = await categories.insertOne(doc);
  return toCategory({ _id: insertedId, ...doc });
}

export async function updateCategory(
  id: string,
  input: Record<string, unknown>,
  who: string,
): Promise<ResignCategory> {
  const { categories } = await cols();
  const set: Partial<CategoryDoc> = { ...stamp(who) };
  if ("label" in input) set.label = text(input.label, "ชื่อหมวด", MAX_LABEL);
  if ("exitType" in input) set.exitType = exitType(input.exitType);

  const doc = await categories.findOneAndUpdate(
    { _id: oid(id, "หมวด") },
    { $set: set },
    { returnDocument: "after" },
  );
  if (!doc) throw new RecruitmentError("ไม่พบหมวดที่ระบุ");
  return toCategory(doc);
}

export async function deleteCategory(id: string): Promise<void> {
  const { categories, reasons } = await cols();
  const left = await reasons.countDocuments({ categoryId: id });
  if (left)
    throw new RecruitmentError(
      `หมวดนี้ยังมีรหัสอยู่ ${left} รายการ — ย้ายหรือลบรหัสในหมวดออกให้หมดก่อน`,
    );
  const { deletedCount } = await categories.deleteOne({ _id: oid(id, "หมวด") });
  if (!deletedCount) throw new RecruitmentError("ไม่พบหมวดที่ระบุ");
}

/* ------------------------------------------------------------------ รหัส */

async function categoryOf(id: unknown): Promise<WithId<CategoryDoc>> {
  const { categories } = await cols();
  const value = typeof id === "string" ? id : "";
  const cat = ObjectId.isValid(value)
    ? await categories.findOne({ _id: new ObjectId(value) })
    : null;
  if (!cat) throw new RecruitmentError("กรุณาเลือกหมวดใหญ่");
  return cat;
}

/** รหัสถัดไปของหมวด — `P7` มีแล้วก็ได้ `P8` · ใช้เป็นค่าตั้งต้นเมื่อไม่ได้ระบุเอง */
async function nextCode(prefix: string): Promise<string> {
  const { reasons } = await cols();
  const rows = await reasons
    .find({ code: { $regex: `^${prefix}\\d+$` } }, { projection: { code: 1 } })
    .toArray();
  const max = rows.reduce((m, r) => Math.max(m, Number(r.code.slice(prefix.length)) || 0), 0);
  return `${prefix}${max + 1}`;
}

export async function createReason(
  input: Record<string, unknown>,
  who: string,
): Promise<ResignReason> {
  const cat = await categoryOf(input.categoryId);
  const { reasons } = await cols();

  const typed = typeof input.code === "string" ? input.code.trim().toUpperCase() : "";
  const code = typed || (await nextCode(cat.prefix));
  if (!new RegExp(`^${cat.prefix}\\d{1,3}$`).test(code))
    throw new RecruitmentError(`รหัสในหมวดนี้ต้องขึ้นต้นด้วย ${cat.prefix} ตามด้วยตัวเลข เช่น ${cat.prefix}1`);
  if (await reasons.findOne({ code }))
    throw new RecruitmentError(`มีรหัส ${code} อยู่แล้ว`);

  const last = await reasons
    .find({ categoryId: cat._id.toHexString() })
    .sort({ order: -1 })
    .limit(1)
    .next();

  const doc: ReasonDoc = {
    code,
    categoryId: cat._id.toHexString(),
    label: text(input.label, "หมวดย่อย (เหตุผล)", MAX_LABEL),
    description: text(input.description, "ขยายความ", MAX_DESC, false),
    exitType: isExitType(input.exitType) ? input.exitType : cat.exitType,
    active: input.active !== false,
    order: (last?.order ?? 0) + 1,
    ...stamp(who),
  };
  const { insertedId } = await reasons.insertOne(doc);
  return toReason({ _id: insertedId, ...doc });
}

export async function updateReason(
  id: string,
  input: Record<string, unknown>,
  who: string,
): Promise<ResignReason> {
  const { reasons } = await cols();
  const _id = oid(id, "รหัส");
  const current = await reasons.findOne({ _id });
  if (!current) throw new RecruitmentError("ไม่พบรหัสที่ระบุ");

  const set: Partial<ReasonDoc> = { ...stamp(who) };
  if ("label" in input) set.label = text(input.label, "หมวดย่อย (เหตุผล)", MAX_LABEL);
  if ("description" in input)
    set.description = text(input.description, "ขยายความ", MAX_DESC, false);
  if ("exitType" in input) set.exitType = exitType(input.exitType);
  if ("active" in input) set.active = input.active !== false;

  /* ย้ายหมวดได้เฉพาะหมวดที่อักษรนำตรงกับรหัส — ไม่งั้นได้ `P3` ไปอยู่ในหมวด J */
  if ("categoryId" in input && input.categoryId !== current.categoryId) {
    const cat = await categoryOf(input.categoryId);
    if (!new RegExp(`^${cat.prefix}\\d+$`).test(current.code))
      throw new RecruitmentError(
        `รหัส ${current.code} ย้ายไปหมวด ${cat.prefix} ไม่ได้ — ให้สร้างรหัสใหม่ในหมวดนั้นแทน`,
      );
    set.categoryId = cat._id.toHexString();
  }

  const doc = await reasons.findOneAndUpdate({ _id }, { $set: set }, { returnDocument: "after" });
  if (!doc) throw new RecruitmentError("ไม่พบรหัสที่ระบุ");
  return toReason(doc);
}

export async function deleteReason(id: string): Promise<void> {
  const { reasons } = await cols();
  const { deletedCount } = await reasons.deleteOne({ _id: oid(id, "รหัส") });
  if (!deletedCount) throw new RecruitmentError("ไม่พบรหัสที่ระบุ");
}
