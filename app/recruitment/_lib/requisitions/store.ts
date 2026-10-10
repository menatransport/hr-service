import { ObjectId, type Collection, type WithId } from "mongodb";

import { etlCol, hrCol } from "@/lib/db";
import { nextSeq } from "@/lib/db/counters";
import { todayInBangkok } from "@/lib/record-case-flow";
import {
  isHiredStatus,
  normalizeStatus,
  type ApplicationStatus,
} from "@/app/recruitment/_lib/types";
import { fullNameOf } from "@/app/recruitment/_lib/applications";
import {
  CANCEL_REASONS,
  CUSTOMERS,
  LINKABLE_STATUSES,
  OTHER,
  POSITIONS,
  isRequisitionStatus,
  type CancelReason,
  type HireType,
  type ReplaceReason,
  type Requisition,
  type RequisitionPatch,
  type RequisitionPosition,
  type RequisitionStatus,
} from "./types";

/**
 * ชั้นข้อมูลของ “ขอสรรหา” — **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 * (เรียกจาก `page.tsx` กับ `app/api/recruitment/requisitions/**` เท่านั้น
 * client ยิงผ่าน API — ห้าม import จาก client component)
 *
 * | คอลเลกชัน | เก็บอะไร |
 * |---|---|
 * | `hr_service.recruitment_requests` | ตัวคำขอ + ผู้สมัครที่ผูกไว้ + ประวัติ |
 * | `hr_service.recruitment_counters` | ตัวนับเลขที่รายเดือน (**ใช้ร่วมกับใบสมัคร** คนละคีย์ `_id`) |
 *
 * อ่านอีกสองที่แบบ **ยืมมาอ่านเฉย ๆ**: `hr_service.master_driver` (ชื่อ พจส.
 * ของครูฝึก/คนที่ถูกแทน) และ `Boom_ETL.vehicles` (รถ) — เก็บ**สำเนา**ชื่อกับ
 * ทะเบียนลงในคำขอ ไม่ใช่เก็บแค่รหัสแล้ว join ตอนอ่าน เพราะทะเบียนเปลี่ยนชื่อ/
 * ปลดรถได้ แต่คำขอต้องอ่านได้เหมือนวันที่แจ้ง · **ห้ามเขียนลง `Boom_ETL`**
 */

/** จำนวนที่ดึงมาแสดงบนหน้าจอ — ค้นหา/กรองทำฝั่ง client บนชุดนี้ */
const LIST_LIMIT = 500;

/** ขอได้สูงสุดกี่อัตราต่อการกดหนึ่งครั้ง — กันการกดพลาดที่จะสร้างคำขอเป็นร้อยใบ */
export const MAX_HEADCOUNT = 10;

const MAX_TEXT = 120;
const MAX_NOTE = 500;

export class RequisitionError extends Error {}

/* ------------------------------------------------------------ รูปในฐานข้อมูล */

interface PersonDoc {
  drivercode: string;
  name: string;
}

interface RequisitionDoc {
  code: string;
  requestedOn: string;

  position: RequisitionPosition;
  positionOther: string;
  customer: string;
  customerOther: string;
  plant: string;

  hireType: HireType;
  replace: (PersonDoc & { reason: ReplaceReason; reasonLabel?: string; reasonNote: string }) | null;

  vehicle: { code: string; plateNo: string; brand: string } | null;
  trainer: PersonDoc | null;

  status: RequisitionStatus;
  cancelReason: CancelReason | "";
  filledOn: string;

  match: {
    applicationId: string;
    ref: string;
    fullName: string;
    linkedAt: string;
    linkedBy: string;
  } | null;

  drivercode: string;

  note: string;
  requester: { employeeId: string; name: string };
  history: { at: string; by: string; from: RequisitionStatus | null; to: RequisitionStatus; note: string }[];
  createdAt: string;
  updatedAt: string;
}

/**
 * ดัชนี (`code_unique` `status_requested` `drivercode` `match_unique`) ประกาศที่
 * `lib/db/registry.mjs` และมีบนฐานจริงแล้ว — `match_unique` เป็นเรื่องความถูกต้องจริง
 * (กันใบสมัครใบเดียวถูกผูกกับสองอัตรา) แต่ `linkApplication()` ก็ยังตรวจซ้ำอีกชั้นอยู่ดี
 */
function requisitions(): Promise<Collection<RequisitionDoc>> {
  return hrCol<RequisitionDoc>("requisitions");
}

function toRequisition(doc: WithId<RequisitionDoc>): Requisition {
  return {
    id: doc._id.toHexString(),
    code: doc.code,
    requestedOn: doc.requestedOn,
    position: doc.position,
    positionOther: doc.positionOther ?? "",
    customer: doc.customer,
    customerOther: doc.customerOther ?? "",
    plant: doc.plant ?? "",
    hireType: doc.hireType,
    replace: doc.replace ? { ...doc.replace, reasonLabel: doc.replace.reasonLabel ?? "" } : null,
    vehicle: doc.vehicle,
    trainer: doc.trainer,
    status: doc.status,
    cancelReason: doc.cancelReason ?? "",
    filledOn: doc.filledOn ?? "",
    /* สถานะใบสมัครไม่ได้เก็บไว้ในคำขอ — `attachMatchStatus()` เติมให้สดทุกครั้ง
       ที่ลิสต์ เพราะใบสมัครเดินหน้าต่อได้เองโดยไม่ผ่านหน้านี้ */
    match: doc.match ? { ...doc.match, status: null } : null,
    drivercode: doc.drivercode ?? "",
    note: doc.note ?? "",
    requester: doc.requester,
    history: doc.history ?? [],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/* ---------------------------------------------------------------- เลขที่คำขอ */

/** `yymm` ของเดือนนี้ตามเวลาไทย — ปี **ค.ศ.** สองหลักท้าย เหมือนเลขที่บันทึกเคส */
function currentYymm(): string {
  const [year, month] = todayInBangkok().split("-");
  return `${year.slice(-2)}${month}`;
}

/**
 * จอง `count` เลขรวดเดียว แล้วคืนเป็นชุด — `$inc` ครั้งเดียวจึง atomic
 * ทั้งก้อน สองคนกดขอ 3 อัตราพร้อมกันไม่มีทางได้เลขทับกัน
 *
 * (นับเองด้วย `countDocuments` จะชนกันแน่นอน — เหตุผลเดียวกับ `nextCode()`
 * ใน `lib/record-cases.ts`)
 */
async function reserveCodes(count: number): Promise<string[]> {
  const yymm = currentYymm();
  const last = await nextSeq("recruitmentCounters", `requisitions:${yymm}`, count);
  const first = last - count + 1;
  return Array.from(
    { length: count },
    (_, i) => `RQ${yymm}-${String(first + i).padStart(3, "0")}`,
  );
}

/* --------------------------------------------------------------- ตรวจข้อมูล */

function text(value: unknown, field: string, max = MAX_TEXT, required = true): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v && required) throw new RequisitionError(`กรุณากรอก${field}`);
  if (v.length > max) throw new RequisitionError(`${field}ยาวเกิน ${max} ตัวอักษร`);
  return v;
}

function ymd(value: unknown, field: string): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new RequisitionError(`กรุณาเลือก${field}`);
  if (Number.isNaN(Date.parse(`${v}T00:00:00+07:00`)))
    throw new RequisitionError(`${field}ไม่ถูกต้อง`);
  return v;
}

const oneOf = <T extends string>(
  list: readonly { value: string }[],
  value: unknown,
  field: string,
): T => {
  const v = typeof value === "string" ? value.trim() : "";
  if (!list.some((o) => o.value === v)) throw new RequisitionError(`กรุณาเลือก${field}`);
  return v as T;
};

/**
 * ลูกค้า — รับได้สองแบบ: ชื่อที่อยู่ในรายการ หรือค่า `other` ที่ต้องมาคู่กับ
 * ข้อความที่พิมพ์เอง · ไม่ปล่อยให้พิมพ์ชื่ออิสระโดยไม่เลือก `other` เพราะ
 * คอลัมน์นี้ถูกกรองและรวมยอด ชื่อที่สะกดต่างกันนิดเดียวจะกลายเป็นสองลูกค้า
 */
function customer(value: unknown, other: unknown): { customer: string; customerOther: string } {
  const v = typeof value === "string" ? value.trim() : "";
  if (v === OTHER) return { customer: OTHER, customerOther: text(other, "ชื่อลูกค้า") };
  if (!(CUSTOMERS as readonly string[]).includes(v))
    throw new RequisitionError("กรุณาเลือกลูกค้า");
  return { customer: v, customerOther: "" };
}

/* ------------------------------------------------- อ่านทะเบียน พจส. และรถ */

/** ชื่อ พจส. จากรหัส — **ต้องมีอยู่จริงในทะเบียน** ไม่งั้นคำขอจะอ้างถึงคนที่ไม่มีตัวตน */
async function person(drivercode: unknown, field: string): Promise<PersonDoc> {
  const code = text(drivercode, field);
  const drivers = await hrCol<{ drivercode?: string; driverName?: string }>("drivers");
  const doc = await drivers
    .findOne({ drivercode: code }, { projection: { drivercode: 1, driverName: 1 } });

  if (!doc) throw new RequisitionError(`ไม่พบ พจส. รหัส ${code} ในทะเบียนประวัติ`);
  return { drivercode: code, name: (doc.driverName ?? "").trim() || code };
}

/**
 * รถจากเลขรถ — อ่านจาก `Boom_ETL` (อ่านอย่างเดียว) แล้ว **เก็บสำเนา**
 * เลขรถ/ทะเบียน/ยี่ห้อ ลงในคำขอ ผู้ใช้จึงเลือกครั้งเดียวได้ครบสามค่า
 * ไม่ต้องกรอกทีละช่องเหมือนฟอร์มเดิมของ `mena-next-lb`
 */
async function vehicle(code: unknown): Promise<RequisitionDoc["vehicle"]> {
  const v = typeof code === "string" ? code.trim() : "";
  if (!v) return null;

  const vehicles = await etlCol<{ code?: string; plate_no?: string; brand?: string }>("vehicles");
  const doc = await vehicles
    .findOne(
      { $or: [{ code: v }, { plate_no: v }] },
      { projection: { code: 1, plate_no: 1, brand: 1 } },
    );

  if (!doc) throw new RequisitionError(`ไม่พบรถเลข ${v} ในทะเบียนรถ`);
  return {
    code: (doc.code ?? "").trim() || v,
    plateNo: (doc.plate_no ?? "").trim(),
    brand: (doc.brand ?? "").trim(),
  };
}

/* ------------------------------------------------------ สถานะใบสมัครที่ผูกไว้ */

/**
 * เติมสถานะใบสมัครล่าสุดลงในแถวที่มีการผูกไว้ — คิวรีเดียวสำหรับทั้งตาราง
 *
 * **อ่านสดทุกครั้ง ไม่เก็บสำเนา** เพราะใบสมัครเดินหน้าต่อได้เองจากหน้าผู้สมัคร
 * สำเนาที่เก็บไว้จะกลายเป็นค่าเก่าที่ขัดกับอีกหน้าโดยไม่มีใครรู้
 *
 * **ชื่อ–นามสกุลก็อ่านสดด้วย** (29 ก.ย. 2026) — ช่อง `fullName` ของใบสมัครเก็บแค่ข้อ
 * “ชื่อ” ส่วนนามสกุลอยู่ในคำตอบอีกข้อ (ดู `composeName()`) สำเนาใน `match.fullName`
 * ของใบที่ผูกไว้ก่อนหน้านี้จึงมีแต่ชื่อ · อ่านสดยังตามทันเวลามีคนแก้ชื่อในใบสมัครด้วย
 *
 * อ่านไม่สำเร็จ = ปล่อยเป็น `null` แล้วจอขึ้นแค่ชื่อกับเลขที่ใบ — ไม่ทำให้
 * ทั้งตารางพังเพราะคอลัมน์เดียว
 */
async function attachMatchStatus(rows: Requisition[]): Promise<void> {
  const ids = rows
    .map((r) => r.match?.applicationId)
    .filter((id): id is string => typeof id === "string" && ObjectId.isValid(id));
  if (!ids.length) return;

  try {
    const applications = await hrCol<ApplicationRow>("applications");
    const docs = await applications
      .find(
        { _id: { $in: ids.map((id) => new ObjectId(id)) } },
        { projection: { status: 1, fullName: 1, questionSnapshot: 1, answers: 1 } },
      )
      .toArray();

    const byId = new Map(docs.map((d) => [d._id.toHexString(), d]));
    for (const row of rows) {
      if (!row.match) continue;
      const doc = byId.get(row.match.applicationId);
      row.match.status = doc ? normalizeStatus(doc.status) : null;
      if (doc) row.match.fullName = fullNameOf(doc) || row.match.fullName;
    }
  } catch (err) {
    console.warn("[requisitions] อ่านสถานะใบสมัครที่ผูกไว้ไม่สำเร็จ —", err);
  }
}

/* --------------------------------------------------------------------- อ่าน */

export async function listRequisitions(): Promise<Requisition[]> {
  const col = await requisitions();
  const docs = await col
    .find({}, { sort: { requestedOn: -1, code: -1 }, limit: LIST_LIMIT })
    .toArray();

  const rows = docs.map(toRequisition);
  await attachMatchStatus(rows);
  return rows;
}

async function byId(col: Collection<RequisitionDoc>, id: string) {
  if (!ObjectId.isValid(id)) throw new RequisitionError("ไม่พบคำขอที่ระบุ");
  const doc = await col.findOne({ _id: new ObjectId(id) });
  if (!doc) throw new RequisitionError("ไม่พบคำขอที่ระบุ");
  return doc;
}

/* -------------------------------------------------------------------- สร้าง */

export interface RequisitionInput {
  requestedOn: unknown;
  position: unknown;
  positionOther: unknown;
  customer: unknown;
  customerOther: unknown;
  plant: unknown;
  hireType: unknown;
  replaceDrivercode: unknown;
  replaceReasonNote: unknown;
  vehicleCode: unknown;
  trainerDrivercode: unknown;
  note: unknown;
  headcount: unknown;
}

/**
 * สร้างคำขอ — **`headcount` มากกว่า 1 คือสร้างหลายใบ ใบละหนึ่งอัตรา**
 * (เจ้าของงานเลือกทางนี้ 21 ก.ย. 2026 ดู `.claude/docs/requisitions.md`)
 * ทุกใบมีเนื้อหาเหมือนกันแต่เดินอิสระต่อกันตั้งแต่วินาทีแรก
 *
 * `requester` มาจาก session เท่านั้น — ห้ามรับจาก body (กฎเดียวกับทั้งระบบ)
 */
export async function createRequisitions(
  input: RequisitionInput,
  requester: { employeeId: string; name: string },
): Promise<Requisition[]> {
  const headcount = Math.trunc(Number(input.headcount ?? 1));
  if (!Number.isFinite(headcount) || headcount < 1 || headcount > MAX_HEADCOUNT)
    throw new RequisitionError(`จำนวนอัตราต้องอยู่ระหว่าง 1 ถึง ${MAX_HEADCOUNT}`);

  const position = oneOf<RequisitionPosition>(POSITIONS, input.position, "ตำแหน่ง");
  const hireType =
    input.hireType === "replace" || input.hireType === "new_rate"
      ? (input.hireType as HireType)
      : null;
  if (!hireType) throw new RequisitionError("กรุณาเลือกประเภทการรับ");

  /* ช่อง `replace_*` ถูกอ่าน **เฉพาะตอนเป็นอัตราแทนคนเดิม** — อัตราใหม่จะได้
     `null` จริง ๆ ไม่ใช่ค่าเก่าที่ค้างมาจากฟอร์มตอนผู้ใช้สลับตัวเลือกไปมา */
  const replace =
    hireType === "replace"
      ? await (async () => {
          const who = await person(input.replaceDrivercode, "พจส. ที่จะแทน");
          /* ช่อง “เหตุผลที่ต้องแทน” ถูกถอดออกจากฟอร์มตามคำสั่งเจ้าของงาน (29 ก.ย. 2026)
             — ใบใหม่เก็บ `reason` ว่าง · ใบเก่าที่มีรหัส master อยู่แล้วยังอ่านได้ตามเดิม */
          return {
            ...who,
            reason: "",
            reasonLabel: "",
            reasonNote: text(input.replaceReasonNote, "รายละเอียดเหตุผล", MAX_NOTE, false),
          };
        })()
      : null;

  const now = new Date().toISOString();
  const shared = {
    requestedOn: ymd(input.requestedOn, "วันที่แจ้งสรรหา"),
    position,
    positionOther:
      position === OTHER ? text(input.positionOther, "ชื่อตำแหน่ง") : "",
    ...customer(input.customer, input.customerOther),
    plant: text(input.plant, "แพล้นท์"),
    hireType,
    replace,
    vehicle: await vehicle(input.vehicleCode),
    trainer: input.trainerDrivercode
      ? await person(input.trainerDrivercode, "ครูฝึก")
      : null,
    status: "open" as const,
    cancelReason: "" as const,
    filledOn: "",
    match: null,
    drivercode: "",
    note: text(input.note, "หมายเหตุ", MAX_NOTE, false),
    requester,
    createdAt: now,
    updatedAt: now,
  };

  const codes = await reserveCodes(headcount);
  const docs: RequisitionDoc[] = codes.map((code) => ({
    ...shared,
    code,
    history: [
      { at: now, by: requester.name, from: null, to: "open" as const, note: "แจ้งขอสรรหา" },
    ],
  }));

  const col = await requisitions();
  const { insertedIds } = await col.insertMany(docs);
  return docs.map((doc, i) => toRequisition({ ...doc, _id: insertedIds[i] }));
}

/* -------------------------------------------------------------------- แก้ไข */

/** ต่อแถวประวัติ + `updatedAt` ในคำสั่งเดียว เพื่อไม่ให้มีจังหวะที่สองค่าไม่ตรงกัน */
async function apply(
  col: Collection<RequisitionDoc>,
  current: WithId<RequisitionDoc>,
  set: Partial<RequisitionDoc>,
  by: string,
  note: string,
): Promise<Requisition> {
  const at = new Date().toISOString();
  const to = (set.status ?? current.status) as RequisitionStatus;

  const updated = await col.findOneAndUpdate(
    /* เงื่อนไข `status` เดิมใน filter ทำให้การกดจากหน้าจอที่ค้างค่าเก่าอยู่
       **ไม่ผ่าน** แทนที่จะเขียนทับสิ่งที่คนอื่นเพิ่งเปลี่ยน */
    { _id: current._id, status: current.status },
    {
      $set: { ...set, updatedAt: at },
      $push: { history: { at, by, from: current.status, to, note } },
    },
    { returnDocument: "after" },
  );

  if (!updated)
    throw new RequisitionError(
      "คำขอนี้เพิ่งถูกเปลี่ยนโดยคนอื่น — กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง",
    );

  const row = toRequisition(updated);
  await attachMatchStatus([row]);
  return row;
}

export async function updateRequisition(
  id: string,
  patch: RequisitionPatch,
  by: string,
): Promise<Requisition> {
  const col = await requisitions();
  const current = await byId(col, id);

  /* ── ครูฝึก — แก้ได้ทุกสถานะรวมถึงคำขอที่ปิดแล้ว เพราะครูฝึกเปลี่ยนตัวได้
        ระหว่างที่คนใหม่ยังฝึกอยู่ ซึ่งเกิดหลังคำขอเป็น `filled` ไปแล้วเสมอ */
  if (patch.trainerDrivercode !== undefined) {
    const trainer = patch.trainerDrivercode
      ? await person(patch.trainerDrivercode, "ครูฝึก")
      : null;
    return apply(
      col,
      current,
      { trainer },
      by,
      trainer ? `ตั้งครูฝึกเป็น ${trainer.name}` : "ถอดครูฝึกออก",
    );
  }

  if (patch.vehicleCode !== undefined) {
    const next = await vehicle(patch.vehicleCode);
    return apply(
      col,
      current,
      { vehicle: next },
      by,
      next ? `เปลี่ยนรถเป็น ${next.code}` : "ถอดรถออก",
    );
  }

  if (patch.drivercode !== undefined) {
    const code = text(patch.drivercode, "รหัส พจส.", MAX_TEXT, false);
    if (code) await person(code, "รหัส พจส.");
    return apply(
      col,
      current,
      { drivercode: code },
      by,
      code ? `ผูกรหัส พจส. ${code}` : "ถอดรหัส พจส. ออก",
    );
  }

  if (patch.note !== undefined) {
    return apply(
      col,
      current,
      { note: text(patch.note, "หมายเหตุ", MAX_NOTE, false) },
      by,
      "แก้หมายเหตุ",
    );
  }

  if (patch.applicationId !== undefined) {
    return patch.applicationId
      ? linkApplication(col, current, patch.applicationId, by)
      : unlinkApplication(col, current, by);
  }

  if (patch.status !== undefined) return changeStatus(col, current, patch, by);

  throw new RequisitionError("ไม่มีข้อมูลที่จะแก้ไข");
}

/* --------------------------------------------------------- ผูก/ปลด ผู้สมัคร */

/** ใบสมัครเท่าที่หน้านี้อ่าน — คำตอบกับสแนปช็อตคำถามมาด้วยเพื่อต่อนามสกุล (`fullNameOf()`) */
type ApplicationRow = Parameters<typeof fullNameOf>[0] & {
  _id: ObjectId;
  ref?: string;
  status?: unknown;
};

async function linkApplication(
  col: Collection<RequisitionDoc>,
  current: WithId<RequisitionDoc>,
  applicationId: string,
  by: string,
): Promise<Requisition> {
  if (current.status === "cancelled")
    throw new RequisitionError("คำขอนี้ถูกยกเลิกไปแล้ว — เปิดรับอีกครั้งก่อนจึงจะผูกผู้สมัครได้");
  if (!ObjectId.isValid(applicationId))
    throw new RequisitionError("ไม่พบใบสมัครที่ระบุ");

  const applications = await hrCol<ApplicationRow>("applications");
  const doc = await applications
    .findOne(
      { _id: new ObjectId(applicationId) },
      { projection: { ref: 1, fullName: 1, status: 1, questionSnapshot: 1, answers: 1 } },
    );
  if (!doc) throw new RequisitionError("ไม่พบใบสมัครที่ระบุ");

  const status = normalizeStatus(doc.status);
  if (!LINKABLE_STATUSES.includes(status))
    throw new RequisitionError("ใบสมัครนี้ถูกยกเลิกแล้ว — ผูกกับคำขอไม่ได้");

  /* ตรวจซ้ำนอกเหนือจากดัชนี unique — ดัชนีอาจสร้างไม่สำเร็จ (ดู `ensureIndexesOnce()` ใน `lib/db`)
     และข้อความจากดัชนีก็อ่านไม่รู้เรื่องสำหรับผู้ใช้ */
  const taken = await col.findOne(
    {
      _id: { $ne: current._id },
      "match.applicationId": applicationId,
      status: { $ne: "cancelled" },
    },
    { projection: { code: 1 } },
  );
  if (taken)
    throw new RequisitionError(`ใบสมัครนี้ถูกผูกกับคำขอ ${taken.code} อยู่แล้ว`);

  const fullName = fullNameOf(doc) || (doc.ref ?? "");
  const at = new Date().toISOString();

  return apply(
    col,
    current,
    {
      match: { applicationId, ref: doc.ref ?? "", fullName, linkedAt: at, linkedBy: by },
      /* ใบที่กำลังฝึกงานอยู่แล้ว = อัตรานี้ได้คนตั้งแต่วินาทีที่ผูก ไม่ต้องรอให้
         ใครมากดเปลี่ยนสถานะอีกที (เกิดจริงตอนตามเก็บคำขอย้อนหลัง) */
      status: isHiredStatus(status) ? "filled" : "matched",
      filledOn: isHiredStatus(status) ? todayInBangkok() : "",
    },
    by,
    `ผูกผู้สมัคร ${fullName}`,
  );
}

async function unlinkApplication(
  col: Collection<RequisitionDoc>,
  current: WithId<RequisitionDoc>,
  by: string,
): Promise<Requisition> {
  if (!current.match) throw new RequisitionError("คำขอนี้ยังไม่ได้ผูกผู้สมัครไว้");

  return apply(
    col,
    current,
    {
      match: null,
      /* ปลดแล้วกลับไปเปิดรับ ยกเว้นคำขอที่ถูกยกเลิกไปแล้วซึ่งต้องคาสถานะเดิมไว้ */
      status: current.status === "cancelled" ? "cancelled" : "open",
      filledOn: "",
    },
    by,
    `ปลดการผูก ${current.match.fullName}`,
  );
}

/* -------------------------------------------------------------- เปลี่ยนสถานะ */

/**
 * สถานะที่ **คนกดเองได้** มีแค่สองตัว — ยกเลิก และเปิดรับอีกครั้ง
 *
 * `matched` กับ `filled` เป็นผลจากการผูกใบสมัครและความคืบหน้าของใบนั้น ระบบ
 * ตั้งให้เองเสมอ · ถ้าเปิดให้กดเองได้ จะเกิดคำขอที่ปิดแล้วโดยไม่มีใบสมัครผูกอยู่
 * ซึ่งตอบไม่ได้ว่าใครมารับอัตราไป
 */
async function changeStatus(
  col: Collection<RequisitionDoc>,
  current: WithId<RequisitionDoc>,
  patch: RequisitionPatch,
  by: string,
): Promise<Requisition> {
  const to = patch.status;
  if (!isRequisitionStatus(to)) throw new RequisitionError("สถานะที่ส่งมาไม่ถูกต้อง");
  if (to !== "cancelled" && to !== "open")
    throw new RequisitionError(
      "สถานะนี้ระบบตั้งให้เองตามความคืบหน้าของใบสมัคร — เปลี่ยนเองไม่ได้",
    );
  if (current.status === to) throw new RequisitionError("คำขอนี้อยู่ในสถานะนี้อยู่แล้ว");

  if (to === "cancelled") {
    const reason = oneOf<CancelReason>(
      CANCEL_REASONS,
      patch.cancelReason,
      "เหตุผลที่ยกเลิก",
    );
    return apply(
      col,
      current,
      { status: "cancelled", cancelReason: reason, filledOn: "" },
      by,
      `ยกเลิกคำขอ — ${CANCEL_REASONS.find((r) => r.value === reason)!.label}`,
    );
  }

  /* เปิดรับอีกครั้งได้เฉพาะจากคำขอที่ถูกยกเลิก — ดึงใบที่ `matched`/`filled`
     กลับมาเป็น `open` เฉย ๆ จะทิ้งผู้สมัครที่ผูกอยู่ค้างเติ่ง ต้องปลดการผูกก่อน */
  if (current.status !== "cancelled")
    throw new RequisitionError(
      "คำขอนี้มีผู้สมัครผูกอยู่ — ปลดการผูกก่อนจึงจะกลับไปเปิดรับได้",
    );

  return apply(
    col,
    current,
    { status: "open", cancelReason: "", match: null, filledOn: "" },
    by,
    "เปิดรับอีกครั้ง",
  );
}

/* ------------------------------------------------ ขาเชื่อมจากฝั่งใบสมัคร */

/**
 * ใบสมัครเปลี่ยนสถานะ → คำขอที่ผูกไว้ต้องตามไปด้วย
 *
 * เรียกจาก `PATCH /api/recruitment/applications/[id]` **จุดเดียว** — ไม่ได้
 * คำนวณตอนอ่าน เพราะสถานะที่คำนวณสด ๆ ตอนเรนเดอร์จะไม่ถูกบันทึกลงประวัติ
 * และหน้าอื่นที่อ่านคำขอจะเห็นไม่ตรงกัน
 *
 * ⚠️ **ล้มเหลวแล้วไม่โยนต่อ** — การเปลี่ยนสถานะใบสมัครต้องสำเร็จเสมอ ต่อให้
 * ฝั่งคำขอมีปัญหา ไม่งั้นฝ่ายบุคคลจะกดเปลี่ยนสถานะผู้สมัครไม่ได้เพราะเรื่อง
 * ที่ไม่เกี่ยวกับเขา
 */
export async function syncRequisitionForApplication(
  applicationId: string,
  status: ApplicationStatus,
  by: string,
): Promise<void> {
  try {
    const col = await requisitions();
    const current = await col.findOne({
      "match.applicationId": applicationId,
      status: { $ne: "cancelled" },
    });
    if (!current) return;

    /* ผู้สมัครถอนตัว → ปลดการผูกและ**เปิดอัตรารับใหม่**
       ไม่มีขั้นนี้ อัตราที่หลุดจะค้างเป็น `matched` ตลอดกาลโดยไม่มีใครเห็น */
    if (status === "cancelled") {
      await apply(
        col,
        current,
        { match: null, status: "open", filledOn: "" },
        by,
        `${current.match?.fullName ?? "ผู้สมัคร"} ยกเลิก — เปิดรับอีกครั้ง`,
      );
      return;
    }

    if (isHiredStatus(status) && current.status !== "filled") {
      await apply(
        col,
        current,
        { status: "filled", filledOn: todayInBangkok() },
        by,
        `${current.match?.fullName ?? "ผู้สมัคร"} เริ่มฝึกงาน — อัตรานี้ปิดรับแล้ว`,
      );
      return;
    }

    /* ถอยจาก “กำลังฝึกงาน” กลับไปขั้นก่อนหน้า (แก้สถานะผิด) — อัตรายังไม่ปิด */
    if (!isHiredStatus(status) && current.status === "filled") {
      await apply(
        col,
        current,
        { status: "matched", filledOn: "" },
        by,
        "ใบสมัครถอยกลับก่อนเริ่มฝึกงาน",
      );
    }
  } catch (err) {
    console.warn("[requisitions] sync กับใบสมัครไม่สำเร็จ —", err);
  }
}
