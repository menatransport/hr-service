import { ObjectId, type Collection, type WithId } from "mongodb";

import { DEPARTMENTS } from "./case-flow";
import { hrCol } from "./db";
import { nextSeq } from "./db/counters";
import { isKnownRecordCategory } from "./record-categories";
import { recordFileExists } from "./record-files";
import {
  MAX_INVOLVED,
  MAX_INVOLVED_NAME,
  MAX_REMARK,
  WARNING_NONE,
  isRecordStatus,
  isWarningLevel,
  sortWarnings,
  todayInBangkok,
  type RecordActor,
  type RecordAttachment,
  type RecordCase,
  type RecordHistoryEntry,
  type RecordStatus,
} from "./record-case-flow";

/**
 * ชั้นข้อมูลของ “บันทึกเคสส่วนกลาง” — **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 * (เรียกจาก `page.tsx` กับ `app/api/record-cases/**` · client ยิงผ่าน API แทน
 * เหมือน `lib/uploads.ts` — ห้าม import จาก client component)
 *
 * เก็บทุกอย่างไว้ใน **เอกสารเดียวต่อหนึ่งเคส** รวมไฟล์แนบและประวัติสถานะ —
 * เพราะทั้งสองอย่างไม่มีใครอ่านแยกจากตัวเคส และหนึ่งเคสมีประวัติไม่กี่แถว
 * จึงไม่ต้อง join และอ่านหน้าเดียวจบด้วยคำสั่งเดียว
 *
 * | คอลเลกชัน | เก็บอะไร |
 * |---|---|
 * | `record_cases` | ตัวเคส + ไฟล์แนบ + ประวัติการเปลี่ยนสถานะ |
 * | `record_counters` | ตัวนับเลขที่เคสรายเดือน (แถวเดียวต่อเดือน — เปลี่ยนจากรายปี 26 ส.ค. 2026) |
 */

/** จำนวนที่ดึงมาแสดงบนหน้าจอ — ค้นหา/กรองทำฝั่ง client บนชุดนี้ */
const LIST_LIMIT = 500;

/* ------------------------------------------------------------------ รูปในฐานข้อมูล */

interface RecordDoc {
  code: string;
  title: string;
  detail: string;
  occurredOn: string;
  status: RecordStatus;
  departmentId: string;
  /** เอกสารที่บันทึกก่อน 21 ส.ค. 2026 ไม่มีสี่ฟิลด์นี้ — อ่านออกมาเป็น `""` / `[]` */
  category?: string;
  involved?: string[];
  remark?: string;
  warnings?: string[];
  attachments: RecordAttachment[];
  recorder: RecordActor & { department: string };
  history: RecordHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

/** ดัชนี (`createdAt_desc` `status_createdAt` `code_unique`) ประกาศที่ `lib/db/registry.mjs` */
function cases(): Promise<Collection<RecordDoc>> {
  return hrCol<RecordDoc>("recordCases");
}

function toRecordCase(doc: WithId<RecordDoc>): RecordCase {
  return {
    id: doc._id.toHexString(),
    code: doc.code,
    title: doc.title,
    detail: doc.detail,
    occurredOn: doc.occurredOn,
    status: doc.status,
    departmentId: doc.departmentId,
    category: doc.category ?? "",
    involved: doc.involved ?? [],
    remark: doc.remark ?? "",
    warnings: doc.warnings ?? [],
    attachments: doc.attachments ?? [],
    recorder: doc.recorder,
    history: doc.history ?? [],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/* ---------------------------------------------------------------- เลขที่เคส */

/**
 * `yymm` ของเดือนนี้ตามเวลาไทย — สองหลักท้ายของปี **ค.ศ.** + เดือนสองหลัก (เช่น `2608`
 * ของเดือนสิงหาคม 2026 — ตั้งใจใช้ ค.ศ. ไม่ใช่ พ.ศ. แม้ที่อื่นในระบบแสดงผลเป็น พ.ศ.
 * ก็ตาม เพราะเลขที่เคสเป็นรหัสอ้างอิง ไม่ใช่วันที่ที่อ่านออกแบบภาษาไทย)
 * อ่านผ่าน `todayInBangkok()` ตัวเดียวกับที่ฟอร์มใช้ตั้งวันที่เริ่มต้น
 * จะได้ไม่ต้องคำนวณโซนเวลาซ้ำที่นี่อีกจุด
 */
function currentYymm(): string {
  const [gregorianYear, month] = todayInBangkok().split("-");
  return `${gregorianYear.slice(-2)}${month}`;
}

/**
 * `ER-2608-001` — `ER` + ปี ค.ศ. สองหลักท้าย + เดือนสองหลัก + ลำดับในเดือนนั้น
 * (เปลี่ยนจาก `RC-2569-0007` แบบรายปี 26 ส.ค. 2026 — เจ้าของงานสั่ง)
 *
 * ตัวนับจึงต้อง**รีเซ็ตทุกเดือน** ไม่ใช่ทุกปีเหมือนเดิม — คีย์ตัวนับผูกกับ `yymm`
 * แทนปีเฉย ๆ · ใช้ `findOneAndUpdate` + `$inc` ซึ่งเป็น atomic ระดับเอกสาร สองคน
 * กดบันทึกพร้อมกันจึงไม่มีทางได้เลขเดียวกัน (นับเองด้วย `countDocuments` จะชนกันแน่นอน) ·
 * มีดัชนี unique บน `code` เป็นตาข่ายชั้นสุดท้ายอีกที
 *
 * เคสเก่าก่อนเปลี่ยนยังเป็นรหัส `RC-` เดิมค้างอยู่ตามปกติ — **ไม่ backfill ย้อนหลัง**
 * เหมือนของอื่น ๆ ในระบบนี้ เพราะเลขที่เป็นเลขอ้างอิงที่คนใช้พูดถึงกันแล้ว เปลี่ยนย้อนหลัง
 * จะทำให้อ้างอิงเดิมหาไม่เจอ
 */
async function nextCode(): Promise<string> {
  const yymm = currentYymm();
  const seq = await nextSeq("recordCounters", `record_cases:${yymm}`);
  return `ER-${yymm}-${String(seq).padStart(3, "0")}`;
}

/* --------------------------------------------------------------- ตรวจข้อมูลเข้า */

export class RecordCaseError extends Error {}

const MAX_TITLE = 160;
const MAX_DETAIL = 4000;
const MAX_NOTE = 500;
const MAX_ATTACHMENTS = 10;

function text(value: unknown, field: string, max: number, required = true): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v && required) throw new RecordCaseError(`กรุณากรอก${field}`);
  if (v.length > max) throw new RecordCaseError(`${field}ยาวเกิน ${max} ตัวอักษร`);
  return v;
}

/** รับเฉพาะรหัสฝ่ายที่มีจริงใน `DEPARTMENTS` — กันค่าปลอมที่ยิงตรงเข้ามาทาง API */
function departmentId(value: unknown): string {
  const id = typeof value === "string" ? value.trim() : "";
  if (!id) throw new RecordCaseError("กรุณาเลือกฝ่ายที่เกี่ยวข้อง");
  if (!(id in DEPARTMENTS)) throw new RecordCaseError(`ไม่รู้จักฝ่ายรหัส ${id}`);
  return id;
}

/** ประเภทเคสต้องเป็นรหัสที่มีอยู่จริงใน `record_categories` — ข้อความอิสระไม่รับ */
async function category(value: unknown): Promise<string> {
  const id = typeof value === "string" ? value.trim() : "";
  if (!id) throw new RecordCaseError("กรุณาเลือกประเภทเคส");
  if (!(await isKnownRecordCategory(id))) throw new RecordCaseError(`ไม่รู้จักประเภทเคส ${id}`);
  return id;
}

/**
 * ชื่อผู้เกี่ยวข้อง — ตัดช่องว่าง ทิ้งค่าว่าง และ **ตัดชื่อซ้ำออก** (เทียบแบบไม่สนตัวพิมพ์)
 * ไม่ได้เช็คกับสมุดรายชื่อพนักงานโดยตั้งใจ: คนนอกบริษัท/คู่กรณีก็ถูกบันทึกได้
 */
function involved(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const name = typeof raw === "string" ? raw.trim() : "";
    if (!name) continue;
    if (name.length > MAX_INVOLVED_NAME)
      throw new RecordCaseError(`ชื่อผู้เกี่ยวข้องยาวเกิน ${MAX_INVOLVED_NAME} ตัวอักษร`);
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }

  if (out.length > MAX_INVOLVED)
    throw new RecordCaseError(`ใส่ผู้เกี่ยวข้องได้ไม่เกิน ${MAX_INVOLVED} คน`);
  return out;
}

/**
 * โทษทางวินัย — รับเฉพาะรหัสที่รู้จัก และ **บังคับกฎ “ไม่ได้รับ” ห้ามอยู่กับข้ออื่น**
 * ซ้ำอีกชั้นจากฟอร์ม (`toggleWarning()`) เพราะใครยิง API ตรงก็ส่งชุดที่ขัดกันเองมาได้
 */
function warnings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const ids = [...new Set(value)];
  for (const id of ids)
    if (!isWarningLevel(id)) throw new RecordCaseError(`ไม่รู้จักโทษทางวินัยรหัส ${id}`);

  if (ids.includes(WARNING_NONE) && ids.length > 1)
    throw new RecordCaseError("“ไม่ได้รับ” เลือกพร้อมกับโทษข้ออื่นไม่ได้");

  return sortWarnings(ids as string[]);
}

function occurredOn(value: unknown): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new RecordCaseError("กรุณาเลือกวันที่ของเคส");
  if (Number.isNaN(Date.parse(`${v}T00:00:00+07:00`)))
    throw new RecordCaseError("วันที่ของเคสไม่ถูกต้อง");
  return v;
}

/**
 * ไฟล์แนบต้องเป็นไฟล์ที่ **ระบบเราเก็บไว้ใน GridFS เองแล้ว** เท่านั้น
 * (มาจาก `POST /api/record-cases/attachments`)
 *
 * ตรวจถึงขั้น**อ่านดูว่ามีไฟล์นั้นอยู่จริง** ไม่ใช่แค่ดูรูปแบบ id — ไม่งั้นใครยิง API
 * ตรงก็ใส่ id มั่ว ๆ ได้ แล้วเคสจะมีไฟล์แนบที่กดแล้ว 404 ตลอดกาล
 */
async function attachments(value: unknown): Promise<RecordAttachment[]> {
  if (!Array.isArray(value)) return [];
  if (value.length > MAX_ATTACHMENTS)
    throw new RecordCaseError(`แนบไฟล์ได้ไม่เกิน ${MAX_ATTACHMENTS} ไฟล์`);

  const files = value.map((raw) => {
    const f = raw as Partial<RecordAttachment>;
    if (typeof f?.fileId !== "string" || !ObjectId.isValid(f.fileId))
      throw new RecordCaseError("ไฟล์แนบไม่ถูกต้อง — กรุณาแนบใหม่อีกครั้ง");
    return {
      fileId: f.fileId,
      name: typeof f.name === "string" && f.name ? f.name.slice(0, 200) : "ไฟล์แนบ",
      type: typeof f.type === "string" ? f.type : "",
      size: typeof f.size === "number" && f.size > 0 ? Math.round(f.size) : 0,
    };
  });

  const missing = await Promise.all(files.map((f) => recordFileExists(f.fileId)));
  if (missing.some((ok) => !ok))
    throw new RecordCaseError("ไฟล์แนบบางไฟล์หายไป — กรุณาแนบใหม่อีกครั้ง");

  return files;
}

/* --------------------------------------------------------------------- อ่าน */

export async function listRecordCases(): Promise<RecordCase[]> {
  const col = await cases();
  const docs = await col
    .find({}, { sort: { createdAt: -1 }, limit: LIST_LIMIT })
    .toArray();
  return docs.map(toRecordCase);
}

async function byId(col: Collection<RecordDoc>, id: string) {
  if (!ObjectId.isValid(id)) throw new RecordCaseError("ไม่พบเคสที่ระบุ");
  const doc = await col.findOne({ _id: new ObjectId(id) });
  if (!doc) throw new RecordCaseError("ไม่พบเคสที่ระบุ");
  return doc;
}

export async function getRecordCase(id: string): Promise<RecordCase> {
  return toRecordCase(await byId(await cases(), id));
}

/* -------------------------------------------------------------------- เขียน */

export interface RecordCaseInput {
  title: unknown;
  detail: unknown;
  occurredOn: unknown;
  departmentId: unknown;
  category: unknown;
  involved: unknown;
  remark: unknown;
  warnings: unknown;
  attachments: unknown;
}

/**
 * สร้างเคสใหม่ — สถานะเริ่มที่ `pending` เสมอ และลงประวัติแถวแรกไปพร้อมกัน
 * ให้ทุกเคสมีจุดเริ่มต้นที่อ่านได้ ไม่ใช่โผล่มาเฉย ๆ โดยไม่รู้ว่าใครเปิด
 *
 * `recorder` มาจาก session เท่านั้น — ห้ามรับจาก body (กฎเดียวกับฝั่งคำร้อง)
 */
export async function createRecordCase(
  input: RecordCaseInput,
  recorder: RecordActor & { department: string },
): Promise<RecordCase> {
  const now = new Date().toISOString();
  const doc: RecordDoc = {
    code: await nextCode(),
    title: text(input.title, "หัวเรื่อง", MAX_TITLE),
    detail: text(input.detail, "รายละเอียด", MAX_DETAIL),
    occurredOn: occurredOn(input.occurredOn),
    status: "pending",
    departmentId: departmentId(input.departmentId),
    category: await category(input.category),
    involved: involved(input.involved),
    remark: text(input.remark, "หมายเหตุ", MAX_REMARK, false),
    warnings: warnings(input.warnings),
    attachments: await attachments(input.attachments),
    recorder,
    history: [
      { at: now, from: null, to: "pending", by: recorder, note: "บันทึกเคสเข้าระบบ" },
    ],
    createdAt: now,
    updatedAt: now,
  };

  const col = await cases();
  const { insertedId } = await col.insertOne(doc);
  return toRecordCase({ ...doc, _id: insertedId });
}

/**
 * ชื่อไทยของฟิลด์ที่แก้ได้ — ใช้เขียนลงประวัติว่า “แก้อะไรไปบ้าง”
 * เรียงตามลำดับที่อยู่ในฟอร์ม เพื่อให้บรรทัดในประวัติอ่านไล่ตามหน้าจอที่ผู้ใช้เห็น
 */
const EDITABLE_FIELDS = [
  ["title", "หัวเรื่อง"],
  ["category", "ประเภทเคส"],
  ["occurredOn", "วันที่ของเคส"],
  ["departmentId", "ฝ่ายที่เกี่ยวข้อง"],
  ["detail", "รายละเอียด"],
  ["involved", "ผู้เกี่ยวข้อง"],
  ["warnings", "หนังสือเตือน"],
  ["remark", "หมายเหตุ"],
  ["attachments", "ไฟล์แนบ"],
] as const;

/** เทียบค่าเก่า/ใหม่แบบหยาบ ๆ ด้วย JSON — ทุกฟิลด์เป็นสตริงหรืออาเรย์ของค่าเรียบง่าย */
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * แก้ไขเนื้อเคสหลังบันทึกแล้ว (เจ้าของงานสั่งเปิดให้ทำได้ 21 ส.ค. 2026)
 *
 * **สถานะแก้ทางนี้ไม่ได้** — ต้องผ่าน `changeRecordStatus()` เท่านั้น เส้นทางเปลี่ยน
 * สถานะจึงยังมีทางเดียวเหมือนเดิม · และ **ทุกการแก้ต้องลงประวัติเสมอ** (`kind: "edit"`
 * พร้อมรายชื่อฟิลด์ที่เปลี่ยน) ทำใน `$set` + `$push` คำสั่งเดียวเหมือนการเปลี่ยนสถานะ
 * — สมุดบันทึกของฝ่ายบุคคลต้องย้อนได้ว่าใครแก้อะไรเมื่อไร
 *
 * ไม่มีอะไรเปลี่ยนเลย = 400 ไม่ใช่ 200 เงียบ ๆ เพราะแถวประวัติที่บอกว่า “แก้ไข”
 * โดยไม่มีอะไรต่างกันคือขยะที่ทำให้ประวัติอ่านยากขึ้นเปล่า ๆ
 */
export async function updateRecordCase(
  id: string,
  input: RecordCaseInput,
  by: RecordActor,
): Promise<RecordCase> {
  const col = await cases();
  const current = await byId(col, id);

  const next = {
    title: text(input.title, "หัวเรื่อง", MAX_TITLE),
    detail: text(input.detail, "รายละเอียด", MAX_DETAIL),
    occurredOn: occurredOn(input.occurredOn),
    departmentId: departmentId(input.departmentId),
    category: await category(input.category),
    involved: involved(input.involved),
    remark: text(input.remark, "หมายเหตุ", MAX_REMARK, false),
    warnings: warnings(input.warnings),
    attachments: await attachments(input.attachments),
  };

  const changed = EDITABLE_FIELDS.filter(
    ([key]) => !same(current[key] ?? (Array.isArray(next[key]) ? [] : ""), next[key]),
  ).map(([, label]) => label);

  if (!changed.length) throw new RecordCaseError("ไม่มีข้อมูลที่เปลี่ยนแปลง");

  const at = new Date().toISOString();
  const entry: RecordHistoryEntry = {
    at,
    /* การแก้ไขไม่ได้ขยับสถานะ — `from` = `to` = สถานะปัจจุบัน แล้วแยกด้วย `kind` */
    from: current.status,
    to: current.status,
    by,
    note: null,
    kind: "edit",
    fields: changed,
  };

  const updated = await col.findOneAndUpdate(
    { _id: current._id },
    { $set: { ...next, updatedAt: at }, $push: { history: entry } },
    { returnDocument: "after" },
  );

  if (!updated) throw new RecordCaseError("ไม่พบเคสที่ระบุ");
  return toRecordCase(updated);
}

/**
 * เปลี่ยนสถานะ + ต่อแถวประวัติในคำสั่งเดียว
 *
 * ใช้ `$push` ต่อท้าย `history` แทนการอ่านมาแก้แล้วเขียนกลับ — สองคนกดพร้อมกัน
 * จะได้ครบทั้งสองแถว ไม่มีใครถูกทับหาย · เงื่อนไข `status` เดิมใน filter ทำให้การกด
 * จากหน้าจอที่ค้างค่าเก่าอยู่ **ไม่ผ่าน** แทนที่จะเขียนทับสถานะที่คนอื่นเพิ่งเปลี่ยน
 */
export async function changeRecordStatus(
  id: string,
  to: unknown,
  note: unknown,
  by: RecordActor,
): Promise<RecordCase> {
  if (!isRecordStatus(to)) throw new RecordCaseError("สถานะที่ส่งมาไม่ถูกต้อง");

  const col = await cases();
  const current = await byId(col, id);
  if (current.status === to) throw new RecordCaseError("เคสนี้อยู่ในสถานะนี้อยู่แล้ว");

  const entry: RecordHistoryEntry = {
    at: new Date().toISOString(),
    from: current.status,
    to,
    by,
    note: text(note, "หมายเหตุ", MAX_NOTE, false) || null,
  };

  const updated = await col.findOneAndUpdate(
    { _id: current._id, status: current.status },
    { $set: { status: to, updatedAt: entry.at }, $push: { history: entry } },
    { returnDocument: "after" },
  );

  if (!updated)
    throw new RecordCaseError(
      "สถานะของเคสนี้เพิ่งถูกเปลี่ยนโดยคนอื่น — กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง",
    );

  return toRecordCase(updated);
}
