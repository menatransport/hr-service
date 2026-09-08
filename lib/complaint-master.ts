import type { AnyBulkWriteOperation, Collection } from "mongodb";
import { cache } from "react";

import { reasonGroups } from "./data";
import { getDb } from "./mongo";
import { toMasterType } from "./ncac/adapt";
import {
  createComplaintMaster,
  deleteComplaintMaster,
  listComplaintMasters,
  updateComplaintMaster,
} from "./ncac/client";
import type { MasterItem, MasterKind } from "./types";

/**
 * master data ของคำร้อง — คอลเลกชันเดียว `master_complainte` ใน MongoDB
 * **ฝั่งเซิร์ฟเวอร์เท่านั้น** (client ยิง `/api/complaint-master` แทน)
 *
 * เก็บสองชุดไว้ด้วยกัน แยกด้วยฟิลด์ `kind` แทนที่จะแตกเป็นสองคอลเลกชัน —
 * โครงเหมือนกันเป๊ะ (กลุ่ม / ชื่อ / ลำดับ / เปิด-ปิด) หน้าจอจัดการจึงใช้โค้ดชุดเดียว
 *
 * | `kind`    | คือ          | `group` คือ                         | `_id` คือ                   |
 * |-----------|--------------|-------------------------------------|-----------------------------|
 * | `"type"`  | ประเภทเรื่อง | รหัสหน่วยงาน (`DepartmentId`)       | id ของ NCAC เป็นสตริง       |
 * | `"cause"` | สาเหตุหลัก   | รหัสกลุ่มสาเหตุ (`ReasonGroupCode`) | uuid (ของที่ seed = `PAY-0`) |
 *
 * ## ทำไม “ประเภทเรื่อง” ยังต้องเขียนผ่าน NCAC
 * `driver_complaints.problem` เป็น **FK ชี้ `complaint_master.id`** จริงบน Postgres
 * (`ncacdb/models/complaint.py`) ประเภทที่มีแต่ใน Mongo จึงบันทึกลงคำร้องไม่ได้ —
 * ทุกคำสั่งเขียนจึงยิง NCAC ก่อนเพื่อให้ได้ id ที่ FK ยอมรับ แล้ว `syncTypes()`
 * ดึงทั้งชุดกลับมาทับใน Mongo (ทับทั้งก้อน ไม่ใช่ทีละแถว จึงไม่มีทางหลุด sync)
 * **ตัด NCAC ออกได้เมื่อ backend เลิกใช้ FK นี้เท่านั้น** — แก้ที่ `createMaster()`
 * `updateMaster()` `deleteMaster()` สามจุด
 *
 * ส่วน “สาเหตุ” อยู่ที่ Mongo เต็มตัวแล้ว เพราะ `root_cause` เป็นคอลัมน์ข้อความ
 * ไม่มี FK — แต่ด้วยเหตุผลเดียวกัน **การเปลี่ยนชื่อสาเหตุไม่ย้อนไปแก้คำร้องเก่า**
 * ที่บันทึกข้อความเดิมไว้แล้ว (หน้าจอเตือนผู้ใช้ตรงจุดที่กดแก้)
 */

const COLLECTION = "master_complainte";

interface MasterDoc {
  _id: string;
  kind: MasterKind;
  group: string;
  name: string;
  order: number;
  active: boolean;
  /** ISO string — ไม่เก็บ `createdAt` เพราะ master data ไม่มีใครไล่ย้อนหลัง */
  updatedAt: string;
}

const toItem = (doc: MasterDoc): MasterItem => ({
  id: doc._id,
  group: doc.group,
  name: doc.name,
  order: doc.order,
  active: doc.active,
});

/** ลำดับกลุ่มสาเหตุ = ลำดับที่ประกาศไว้ใน `reasonGroups` ไม่ใช่ลำดับตัวอักษรของรหัส */
const CAUSE_RANK = new Map(reasonGroups.map((g, i) => [g.code as string, i]));

/**
 * เรียงกลุ่มก่อน แล้วค่อยลำดับในกลุ่ม — เกณฑ์ของกลุ่มต่างกันตามชนิด:
 * ประเภทเรื่องเป็นรหัสหน่วยงานจึงเทียบแบบรู้จักตัวเลข ("3" ต้องมาก่อน "11")
 * ส่วนสาเหตุใช้ลำดับของผังสาเหตุ (PAY → OPS → VEH → …) ที่หน้าจอคุ้นอยู่แล้ว
 */
const compareGroup = (kind: MasterKind, a: string, b: string) =>
  kind === "cause"
    ? (CAUSE_RANK.get(a) ?? Number.MAX_SAFE_INTEGER) -
      (CAUSE_RANK.get(b) ?? Number.MAX_SAFE_INTEGER)
    : a.localeCompare(b, undefined, { numeric: true });

const sorter = (kind: MasterKind) => (a: MasterItem, b: MasterItem) =>
  compareGroup(kind, a.group, b.group) ||
  a.order - b.order ||
  a.name.localeCompare(b.name, "th");

/* ------------------------------------------------------- เตรียมคอลเลกชัน */

async function collection(): Promise<Collection<MasterDoc>> {
  const db = await getDb();
  const col = db.collection<MasterDoc>(COLLECTION);
  await prepare(col);
  return col;
}

/**
 * ดัชนี + ข้อมูลตั้งต้น — ทำครั้งเดียวต่อโปรเซส และ **ติดธงเฉพาะตอนสำเร็จ**
 * ล้มแล้วรอบหน้าลองใหม่ (เช่น NCAC ล่มพอดีตอน migrate ประเภทเรื่องครั้งแรก)
 * ทุกขั้นกลืน error ไว้เอง เพราะเป็นงานเตรียมของ ไม่ใช่คำตอบที่ผู้ใช้ขอ
 */
let indexed = false;
let seededCauses = false;
let migratedTypes = false;

async function prepare(col: Collection<MasterDoc>) {
  if (!indexed) {
    try {
      // ดัชนีตัวเดียวพอ — ทุก query ในไฟล์นี้เริ่มด้วย `kind` แล้วตามด้วยกลุ่ม/ลำดับ
      await col.createIndex({ kind: 1, group: 1, order: 1 });
      indexed = true;
    } catch (err) {
      console.warn("[master] สร้างดัชนีไม่สำเร็จ —", err);
    }
  }

  if (!seededCauses) {
    try {
      if ((await col.countDocuments({ kind: "cause" }, { limit: 1 })) === 0) {
        await col.insertMany(seedCauses(), { ordered: false });
      }
      seededCauses = true;
    } catch (err) {
      console.warn("[master] seed สาเหตุตั้งต้นไม่สำเร็จ —", err);
    }
  }

  if (!migratedTypes) {
    try {
      if ((await col.countDocuments({ kind: "type" }, { limit: 1 })) === 0) {
        await syncTypes(col);
      }
      migratedTypes = true;
    } catch (err) {
      console.warn("[master] ย้ายประเภทเรื่องจาก NCAC ไม่สำเร็จ —", err);
    }
  }
}

/**
 * สาเหตุตั้งต้น = ผัง `reasonGroups` ที่เคยเป็นรายการตายตัวใน `lib/data.ts`
 * `_id` เป็นค่าคงที่ (`PAY-0`) ไม่ใช่ uuid — seed ซ้ำจึงชนกันเองแล้วตกไปเงียบ ๆ
 * แทนที่จะได้รายการซ้ำสองชุด
 */
function seedCauses(): MasterDoc[] {
  const now = new Date().toISOString();
  return reasonGroups.flatMap((g) =>
    g.items.map((name, i) => ({
      _id: `${g.code}-${i}`,
      kind: "cause" as const,
      group: g.code,
      name,
      order: i,
      active: true,
      updatedAt: now,
    })),
  );
}

/**
 * ดึงประเภทเรื่องทั้งชุดจาก NCAC มาทับใน Mongo — ใช้ทั้งตอน migrate ครั้งแรก
 * และหลังทุกคำสั่งเขียน · **ทับทั้งก้อนโดยตั้งใจ** ของที่ถูกลบฝั่ง NCAC จะหายตามไป
 * ด้วย จึงไม่มีสภาพ “เหลือค้างใน Mongo อยู่คนเดียว”
 */
async function syncTypes(col: Collection<MasterDoc>): Promise<void> {
  const rows = (await listComplaintMasters({ includeInactive: true })).map(toMasterType);
  const now = new Date().toISOString();

  const ops: AnyBulkWriteOperation<MasterDoc>[] = [
    { deleteMany: { filter: { kind: "type", _id: { $nin: rows.map((r) => r.id) } } } },
    ...rows.map((r) => ({
      replaceOne: {
        filter: { _id: r.id },
        replacement: {
          kind: "type" as const,
          group: r.group,
          name: r.name,
          order: r.order,
          active: r.active,
          updatedAt: now,
        },
        upsert: true,
      },
    })),
  ];

  await col.bulkWrite(ops, { ordered: false });
}

/* ------------------------------------------------------------------ อ่าน */

export async function listMasters(
  kind: MasterKind,
  includeInactive = false,
): Promise<MasterItem[]> {
  const col = await collection();
  const docs = await col
    .find(includeInactive ? { kind } : { kind, active: true })
    .toArray();
  return docs.map(toItem).sort(sorter(kind));
}

/**
 * ประเภทเรื่องทั้งหมด **รวมของที่ปิดใช้งาน** — หน้าจัดการต้องเห็นครบถึงจะเปิดกลับมาได้
 * `cache()` ทำให้หนึ่ง request ยิง Mongo ครั้งเดียวถึงจะถูกเรียกจากหลายคอมโพเนนต์
 */
export const getComplaintTypes = cache(() => listMasters("type", true));

/** สาเหตุที่ยังเลือกได้ — ฟอร์มจัดการเคสใช้ตัวนี้ (ของที่ปิดแล้วไม่ควรโผล่ให้เลือกใหม่) */
export const getRootCauses = cache(() => listMasters("cause"));

/**
 * ตัวเลือกที่ยัง “เลือกได้” ของหน่วยงานหนึ่ง — คำร้องเก่าที่ถือประเภทซึ่งถูกปิดไปแล้ว
 * ยังอ่านชื่อได้จาก `problem_master` ที่ NCAC ส่งมากับตัวคำร้อง จึงไม่ต้องพึ่งรายการนี้
 */
export const activeComplaintTypesFor = (
  all: MasterItem[],
  departmentId: string | null,
): MasterItem[] =>
  departmentId ? all.filter((t) => t.active && t.group === departmentId) : [];

/* ------------------------------------------------------------ ตรวจข้อมูลเข้า */

export class MasterError extends Error {}

const MAX_NAME = 120;
const CAUSE_GROUPS = new Set<string>(reasonGroups.map((g) => g.code));

const KIND_LABEL: Record<MasterKind, string> = {
  type: "ประเภทเรื่อง",
  cause: "สาเหตุ",
};

export const isMasterKind = (v: unknown): v is MasterKind =>
  v === "type" || v === "cause";

function cleanName(value: unknown, kind: MasterKind): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) throw new MasterError(`ใส่ชื่อ${KIND_LABEL[kind]}ก่อน`);
  if (v.length > MAX_NAME)
    throw new MasterError(`ชื่อ${KIND_LABEL[kind]}ยาวเกิน ${MAX_NAME} ตัวอักษร`);
  return v;
}

/**
 * กลุ่มของสองชนิดคนละผังกัน — ประเภทเรื่องผูกกับหน่วยงาน (`department_id` ของ
 * NCAC เป็นจำนวนเต็ม) ส่วนสาเหตุผูกกับกลุ่มสาเหตุ 6 กลุ่มใน `reasonGroups`
 */
function cleanGroup(value: unknown, kind: MasterKind): string {
  const v = typeof value === "string" ? value.trim() : String(value ?? "");
  if (kind === "cause") {
    if (!CAUSE_GROUPS.has(v)) throw new MasterError("เลือกกลุ่มสาเหตุก่อน");
    return v;
  }
  const id = Number(v);
  if (!Number.isInteger(id) || id <= 0)
    throw new MasterError("เลือกหน่วยงานผู้รับผิดชอบก่อน");
  return String(id);
}

/** ชื่อซ้ำในกลุ่มเดียวกันไม่ได้ — ดรอปดาวน์จะมีสองบรรทัดที่อ่านเหมือนกัน */
async function assertNameFree(
  col: Collection<MasterDoc>,
  kind: MasterKind,
  group: string,
  name: string,
  exceptId?: string,
) {
  const clash = await col.findOne(
    {
      kind,
      group,
      name,
      ...(exceptId ? { _id: { $ne: exceptId } } : {}),
    },
    { projection: { _id: 1 } },
  );
  if (clash) throw new MasterError(`มี${KIND_LABEL[kind]} “${name}” ในกลุ่มนี้แล้ว`);
}

async function nextOrder(
  col: Collection<MasterDoc>,
  kind: MasterKind,
  group: string,
): Promise<number> {
  const last = await col.findOne({ kind, group }, { sort: { order: -1 } });
  return (last?.order ?? -1) + 1;
}

/* ----------------------------------------------------------------- เขียน */

export interface MasterInput {
  kind: MasterKind;
  group?: unknown;
  name?: unknown;
  order?: unknown;
  active?: unknown;
}

export async function createMaster(input: MasterInput): Promise<MasterItem> {
  const { kind } = input;
  const col = await collection();
  const group = cleanGroup(input.group, kind);
  const name = cleanName(input.name, kind);
  await assertNameFree(col, kind, group, name);

  const order =
    typeof input.order === "number" ? input.order : await nextOrder(col, kind, group);
  const active = input.active !== false;

  if (kind === "type") {
    // NCAC เป็นคนออก id เพราะ FK ของคำร้องชี้มาที่ id นั้น (ดูหัวไฟล์)
    const created = await createComplaintMaster({
      department_id: Number(group),
      name,
      sort_order: order,
      is_active: active,
    });
    await syncTypes(col);
    return toMasterType(created);
  }

  const doc: MasterDoc = {
    _id: crypto.randomUUID(),
    kind,
    group,
    name,
    order,
    active,
    updatedAt: new Date().toISOString(),
  };
  await col.insertOne(doc);
  return toItem(doc);
}

export interface MasterPatch {
  group?: unknown;
  name?: unknown;
  order?: unknown;
  active?: unknown;
}

export async function updateMaster(id: string, patch: MasterPatch): Promise<MasterItem> {
  const col = await collection();
  const before = await col.findOne({ _id: id });
  if (!before) throw new MasterError("ไม่พบรายการที่ระบุ");

  const kind = before.kind;
  const next = {
    group: patch.group !== undefined ? cleanGroup(patch.group, kind) : before.group,
    name: patch.name !== undefined ? cleanName(patch.name, kind) : before.name,
    order: typeof patch.order === "number" ? patch.order : before.order,
    active: typeof patch.active === "boolean" ? patch.active : before.active,
  };

  if (next.name !== before.name || next.group !== before.group) {
    await assertNameFree(col, kind, next.group, next.name, id);
  }

  if (kind === "type") {
    const updated = await updateComplaintMaster(Number(id), {
      department_id: Number(next.group),
      name: next.name,
      sort_order: next.order,
      is_active: next.active,
    });
    await syncTypes(col);
    return toMasterType(updated);
  }

  await col.updateOne(
    { _id: id },
    { $set: { ...next, updatedAt: new Date().toISOString() } },
  );
  return toItem({ ...before, ...next });
}

/**
 * ลบถาวร — ประเภทเรื่องที่มีคำร้องอ้างถึงอยู่ **NCAC ตอบ 409 พร้อมบอกจำนวน**
 * ข้อความนั้นถูกส่งต่อขึ้นหน้าจอตรง ๆ ไม่ถูกกลบ · ส่วนสาเหตุลบได้เสมอเพราะคำร้อง
 * เก็บ `root_cause` เป็นข้อความไว้แล้ว ไม่ได้อ้างถึงแถวนี้
 */
export async function deleteMaster(id: string): Promise<void> {
  const col = await collection();
  const doc = await col.findOne({ _id: id }, { projection: { kind: 1 } });
  if (!doc) throw new MasterError("ไม่พบรายการที่ระบุ");

  if (doc.kind === "type") {
    await deleteComplaintMaster(Number(id));
    await syncTypes(col);
    return;
  }
  await col.deleteOne({ _id: id });
}
