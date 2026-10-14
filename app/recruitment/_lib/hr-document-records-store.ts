import { ObjectId, type Collection, type WithId } from "mongodb";

import { hrCol } from "@/lib/db";
import type { DocFill } from "./hr-documents";
import { RecruitmentError } from "./questions";
import {
  isHrRecordDoc,
  type HrActor,
  type HrDocumentPrint,
  type HrDocumentPrintFull,
  type HrDocumentRecord,
  type HrDocumentState,
  type HrRecordDocId,
} from "./hr-document-records";

/**
 * ชั้นข้อมูลของ “ทำเอกสาร” (สัญญาจ้าง · สัญญาค้ำ · ยินยอมคืนเงินค้ำ) — **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 * (เรียกจาก `app/api/recruitment/applications/[id]/hr-documents/**` เท่านั้น
 * client ยิงผ่าน API เหมือนชั้นข้อมูลอื่นทั้งหมดในโฟลเดอร์นี้)
 *
 * คำอธิบายรูปแบบข้อมูล/กติกาอยู่ที่หัวไฟล์ `hr-document-records.ts` (ไฟล์กลางที่ client
 * import ชนิดได้ด้วย) — ที่นี่มีแต่การอ่าน/เขียนจริงลง MongoDB
 *
 * **จงใจไม่ import จาก `applications.ts`** เพื่อไม่ให้เกิด import cycle (`applications.ts`
 * ต้องเรียก `eraseHrDocuments()` ของไฟล์นี้ตอนผู้สมัครขอลบข้อมูล) — คิวรีใบสมัครตรงจาก
 * `hrCol("applications")` เอาเอง ท่าเดียวกับที่ `requisitions/store.ts` ทำกับคอลเลกชันเดียวกันนี้อยู่แล้ว
 */

/**
 * ความผิดพลาดที่ต้องตอบรหัสอื่นนอกจาก 400 — `RecruitmentError` ทั่วไปในไฟล์นี้และ
 * ไฟล์พี่น้องแปลเป็น 400 เสมอ (`failRecruitment()`) ส่วนสองกรณีนี้ต้องแยก:
 * ไม่พบใบสมัคร (404) และบันทึกชนกัน (409) — เพิ่ม branch รับรู้ใน `failRecruitment()`
 * แทนที่จะฝืนใช้ 400 กับทุกอย่าง
 */
export class HrDocumentError extends Error {
  constructor(
    message: string,
    public readonly status: 404 | 409,
  ) {
    super(message);
  }
}

/* ------------------------------------------------------------------ รูปในฐานข้อมูล */

interface HrDocumentDoc {
  applicationId: string;
  ref: string;
  fill: DocFill;
  revision: number;
  createdAt: string;
  createdBy: HrActor;
  updatedAt: string;
  updatedBy: HrActor;
}

interface HrDocumentPrintDoc {
  applicationId: string;
  ref: string;
  docId: HrRecordDocId;
  revision: number;
  fill: DocFill;
  printedAt: string;
  printedBy: HrActor;
}

/**
 * ดัชนีของสองคอลเลกชันนี้ประกาศที่ `lib/db/registry.mjs` — `application_unique` **คือ** กลไกกัน
 * บันทึกครั้งแรกชนกัน (ดู `saveHrDocument()`) และมีอยู่บนฐานจริงแล้ว · `application_doc` จงใจ
 * **ไม่ unique** เพราะฐานมีแถวซ้ำจากตอนที่ยังเก็บต่อท้ายอยู่ (ก่อน 29 ก.ย. 2026) แถวซ้ำถูกเก็บกวาด
 * ทิ้งเองทุกครั้งที่ฉบับนั้นถูกพิมพ์ใหม่ และตอนอ่านก็เลือกแถวล่าสุดต่อฉบับ
 */
function records(): Promise<Collection<HrDocumentDoc>> {
  return hrCol<HrDocumentDoc>("hrDocuments");
}

function prints(): Promise<Collection<HrDocumentPrintDoc>> {
  return hrCol<HrDocumentPrintDoc>("hrDocumentPrints");
}

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}

function toRecord(doc: WithId<HrDocumentDoc>): HrDocumentRecord {
  return {
    id: doc._id.toHexString(),
    applicationId: doc.applicationId,
    ref: doc.ref,
    fill: doc.fill,
    revision: doc.revision,
    createdAt: doc.createdAt,
    createdBy: doc.createdBy,
    updatedAt: doc.updatedAt,
    updatedBy: doc.updatedBy,
  };
}

function toPrint(doc: WithId<HrDocumentPrintDoc>): HrDocumentPrint {
  return {
    id: doc._id.toHexString(),
    docId: doc.docId,
    revision: doc.revision,
    printedAt: doc.printedAt,
    printedBy: doc.printedBy,
  };
}

function toPrintFull(doc: WithId<HrDocumentPrintDoc>): HrDocumentPrintFull {
  return { ...toPrint(doc), fill: doc.fill };
}

/* --------------------------------------------------------- ตรวจ/ตัดแต่งค่าที่กรอก */

/** จำนวนตัวอักษรสูงสุดของช่องข้อความทั่วไป — ที่อยู่ยาวกว่าช่องอื่นจึงมีเพดานแยก */
const MAX_TEXT = 300;
const MAX_ADDRESS = 500;

/** ช่องข้อความล้วน (ไม่ใช่วันที่/ตัวเลข) พร้อมเพดานความยาวของแต่ละช่อง */
const TEXT_FIELD_CAPS: Record<
  Exclude<keyof DocFill, "docDate" | "startDate" | "salary" | "probationDays" | "deposit" | "installment">,
  number
> = {
  title: MAX_TEXT,
  firstName: MAX_TEXT,
  lastName: MAX_TEXT,
  age: MAX_TEXT,
  nationalId: MAX_TEXT,
  address: MAX_ADDRESS,
  appliedPosition: MAX_TEXT,
  expectedSalary: MAX_TEXT,
  position: MAX_TEXT,
  group: MAX_TEXT,
  supervisor: MAX_TEXT,
  supervisorTitle: MAX_TEXT,
  guarantor: MAX_TEXT,
  deductFrom: MAX_TEXT,
  employer: MAX_TEXT,
  witness1: MAX_TEXT,
  witness2: MAX_TEXT,
};

const DATE_FIELDS = ["docDate", "startDate"] as const satisfies readonly (keyof DocFill)[];
const NUMBER_FIELDS = [
  "salary",
  "probationDays",
  "deposit",
  "installment",
] as const satisfies readonly (keyof DocFill)[];

function sanitizeText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const v = value.trim();
  return v.length > max ? v.slice(0, max) : v;
}

/** `YYYY-MM-DD` เท่านั้น — รูปแบบอื่นถือว่ายังไม่ได้กรอก ไม่ใช่ค่าที่ผิด (เอกสารก็แค่โชว่างช่อง) */
function sanitizeDate(value: unknown): string {
  if (typeof value !== "string") return "";
  const v = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
}

/** ตัวเลขล้วนเท่านั้น (ไม่รับสตริงตัวเลข) จำกัดไม่ให้ติดลบ — ติดลบไม่มีความหมายกับเงินเดือน/เงินประกัน */
function sanitizeAmount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
}

/**
 * ตัดข้อมูลที่ส่งมาให้เหลือเฉพาะช่องที่รู้จักใน `DocFill` — ช่องแปลกปลอมถูกทิ้งเงียบ ๆ
 * ค่าที่ผิดชนิด/รูปแบบกลายเป็นค่าว่าง (`""` หรือ `null`) ไม่ใช่ error เพราะกล่องกรอก
 * ฝั่งหน้าจอกันไว้อยู่แล้ว ช่องที่ไม่ผ่านแปลว่า “ยังไม่ได้กรอก” มากกว่า “กรอกผิด”
 */
export function sanitizeDocFill(input: unknown): DocFill {
  if (!input || typeof input !== "object") {
    throw new RecruitmentError("ข้อมูลที่กรอกไม่ถูกต้อง");
  }
  const body = input as Record<string, unknown>;

  const out = {} as Record<string, unknown>;
  for (const [key, max] of Object.entries(TEXT_FIELD_CAPS)) {
    out[key] = sanitizeText(body[key], max);
  }
  for (const key of DATE_FIELDS) {
    out[key] = sanitizeDate(body[key]);
  }
  for (const key of NUMBER_FIELDS) {
    out[key] = sanitizeAmount(body[key]);
  }
  return out as unknown as DocFill;
}

/* --------------------------------------------------------------- ใบสมัครต้นทาง */

interface ApplicationLookup {
  ref: string;
}

/**
 * ใบสมัครต้องมีอยู่จริง (404) — และถ้า `forWrite` ต้องยังไม่ถูกลบตามคำขอ (400)
 * อ่าน `ref` กลับมาด้วยเพื่อลงในเอกสาร/ใบพิมพ์โดยไม่ต้อง join ตอนอ่านภายหลัง
 *
 * ตรวจ “ลบตามคำขอแล้วหรือยัง” ด้วยกติกาเดียวกับ `erasedOf()` ใน `applications.ts`
 * (`erasedAt` มีค่า หรือสถานะเป็น `withdrawn`) — คัดลอกมาแทนการ import เพื่อกัน
 * import cycle (ดูหมายเหตุหัวไฟล์)
 */
async function guardApplication(
  applicationId: string,
  { forWrite }: { forWrite: boolean },
): Promise<ApplicationLookup> {
  if (!ObjectId.isValid(applicationId)) {
    throw new HrDocumentError("ไม่พบใบสมัครที่ระบุ", 404);
  }

  const applications = await hrCol<{ ref?: string; status?: unknown; erasedAt?: string }>(
    "applications",
  );
  const doc = await applications
    .findOne(
      { _id: new ObjectId(applicationId) },
      { projection: { ref: 1, status: 1, erasedAt: 1 } },
    );

  if (!doc) throw new HrDocumentError("ไม่พบใบสมัครที่ระบุ", 404);

  if (forWrite) {
    const erased = Boolean(doc.erasedAt) || doc.status === "withdrawn";
    if (erased) {
      throw new RecruitmentError("ข้อมูลผู้สมัครถูกลบตามคำขอแล้ว — ทำเอกสารไม่ได้");
    }
  }

  return { ref: doc.ref ?? "" };
}

/* -------------------------------------------------------------------------- อ่าน */

/** `GET …/hr-documents` — เอกสารล่าสุด (ถ้ามี) + การพิมพ์ล่าสุดฉบับละแถว (ไม่มี `fill`) */
export async function getHrDocumentState(applicationId: string): Promise<HrDocumentState> {
  await guardApplication(applicationId, { forWrite: false });

  const [recordDoc, printDocs] = await Promise.all([
    (await records()).findOne({ applicationId }),
    (await prints())
      .find(
        { applicationId },
        {
          sort: { printedAt: -1 },
          /* ไม่ดึง `fill` มาด้วย — รายการประวัติแค่บอกว่าพิมพ์อะไรเมื่อไหร่ ใครพิมพ์
             ขอค่าที่กรอกจริงทีละใบผ่าน `getHrDocumentPrint()` เท่านั้น (ตามสัญญา) */
          projection: { fill: 0 },
        },
      )
      .toArray(),
  ]);

  /* ฉบับละแถว — เรียงใหม่สุดก่อนแล้ว แถวแรกที่เจอของแต่ละฉบับจึงเป็นครั้งล่าสุด
     (กันแถวซ้ำที่ค้างจากตอนยังเก็บต่อท้ายซึ่งยังไม่ถูกพิมพ์ทับ) */
  const seen = new Set<string>();
  const latest = printDocs.filter((p) => !seen.has(p.docId) && Boolean(seen.add(p.docId)));

  return {
    record: recordDoc ? toRecord(recordDoc) : null,
    prints: latest.map(toPrint),
  };
}

/** ใบพิมพ์เดียวแบบเต็ม — ต้องเป็นของใบสมัครนี้จริง ไม่งั้นถือว่าไม่พบ (กัน id เดา) */
export async function getHrDocumentPrint(
  applicationId: string,
  printId: string,
): Promise<HrDocumentPrintFull | null> {
  if (!ObjectId.isValid(applicationId) || !ObjectId.isValid(printId)) return null;

  const doc = await (await prints()).findOne({ _id: new ObjectId(printId), applicationId });
  return doc ? toPrintFull(doc) : null;
}

/* -------------------------------------------------------------------------- เขียน */

function parseSaveInput(input: unknown): { fill: DocFill; revision: number } {
  if (!input || typeof input !== "object") {
    throw new RecruitmentError("ข้อมูลที่ส่งมาไม่ถูกต้อง");
  }
  const body = input as Record<string, unknown>;
  const fill = sanitizeDocFill(body.fill);

  const revision = Number(body.revision);
  if (!Number.isInteger(revision) || revision < 0) {
    throw new RecruitmentError("revision ไม่ถูกต้อง");
  }
  return { fill, revision };
}

/**
 * บันทึกค่าที่กรอกลงฐาน — **หนึ่งใบสมัครหนึ่งเอกสาร** กันบันทึกทับกันด้วย `revision`
 * (optimistic concurrency): จอต้องส่ง `revision` ที่ตัวเองถืออยู่มาด้วยเสมอ
 *
 * - `revision === 0` แปลว่าจอยังไม่เคยเห็นเอกสารนี้มาก่อน → บันทึกครั้งแรกด้วย `insertOne`
 *   ได้ `revision: 1` — สองคนกดบันทึกครั้งแรกพร้อมกันจะชนที่ดัชนี unique (`application_unique`)
 *   กลายเป็น 409 แทนที่จะมีสองเอกสารซ้อนกัน
 * - `revision > 0` คือบันทึกทับของเดิม → `findOneAndUpdate` กรองด้วย `revision` เดิมและ
 *   `$inc` ขึ้นทีละ 1 ในคำสั่งเดียว · ไม่เจอแถวที่ตรง (คนอื่นบันทึกไปก่อนแล้ว) = 409
 */
export async function saveHrDocument(
  applicationId: string,
  input: unknown,
  actor: HrActor,
): Promise<HrDocumentRecord> {
  const { ref } = await guardApplication(applicationId, { forWrite: true });
  const { fill, revision } = parseSaveInput(input);

  const col = await records();
  const now = new Date().toISOString();

  if (revision === 0) {
    const doc: HrDocumentDoc = {
      applicationId,
      ref,
      fill,
      revision: 1,
      createdAt: now,
      createdBy: actor,
      updatedAt: now,
      updatedBy: actor,
    };
    try {
      const { insertedId } = await col.insertOne(doc);
      return toRecord({ ...doc, _id: insertedId });
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        throw new HrDocumentError(
          "มีคนบันทึกเอกสารนี้ไปก่อนแล้ว — โหลดค่าล่าสุดก่อนแก้ต่อ",
          409,
        );
      }
      throw err;
    }
  }

  const updated = await col.findOneAndUpdate(
    { applicationId, revision },
    { $set: { fill, ref, updatedAt: now, updatedBy: actor }, $inc: { revision: 1 } },
    { returnDocument: "after" },
  );

  if (!updated) {
    throw new HrDocumentError("มีคนบันทึกเอกสารนี้ไปก่อนแล้ว — โหลดค่าล่าสุดก่อนแก้ต่อ", 409);
  }
  return toRecord(updated);
}

/**
 * บันทึกการพิมพ์ — **ฉบับละแถว เขียนทับครั้งก่อน** (ตามคำสั่งเจ้าของงาน 29 ก.ย. 2026
 * ไม่เก็บต่อท้ายเรื่อย ๆ แล้ว) แถวจึงบอกเสมอว่าฉบับนี้พิมพ์ล่าสุดเมื่อไหร่ ใครพิมพ์
 * ด้วยค่าอะไร · ไม่แก้เอกสารหลัก · `revision` คือของเอกสารหลัก ณ ตอนพิมพ์
 */
export async function recordHrDocumentPrint(
  applicationId: string,
  input: unknown,
  actor: HrActor,
): Promise<HrDocumentPrint> {
  const { ref } = await guardApplication(applicationId, { forWrite: true });

  if (!input || typeof input !== "object") {
    throw new RecruitmentError("ข้อมูลที่ส่งมาไม่ถูกต้อง");
  }
  const body = input as Record<string, unknown>;
  if (!isHrRecordDoc(body.docId)) {
    throw new RecruitmentError("docId ไม่ถูกต้อง");
  }
  const fill = sanitizeDocFill(body.fill);

  const current = await (
    await records()
  ).findOne({ applicationId }, { projection: { revision: 1 } });

  const docId = body.docId;
  const col = await prints();
  const saved = await col.findOneAndUpdate(
    { applicationId, docId },
    {
      $set: {
        ref,
        revision: current?.revision ?? 0,
        fill,
        printedAt: new Date().toISOString(),
        printedBy: actor,
      },
    },
    { upsert: true, sort: { printedAt: -1 }, returnDocument: "after" },
  );
  if (!saved) throw new Error("บันทึกการพิมพ์ไม่สำเร็จ");

  /* เก็บกวาดแถวซ้ำของฉบับนี้ที่ค้างจากตอนยังเก็บต่อท้าย — ล้มก็ไม่เป็นไร ตอนอ่าน
     เลือกแถวล่าสุดต่อฉบับอยู่แล้ว */
  await col
    .deleteMany({ applicationId, docId, _id: { $ne: saved._id } })
    .catch((err: unknown) => console.warn("[hr-document-records] เก็บกวาดแถวซ้ำไม่สำเร็จ —", err));

  return toPrint(saved);
}

/* ------------------------------------------------------------------------- ลบ */

/**
 * ลบเอกสาร HR ทั้งหมดของใบสมัครหนึ่งใบ — เรียกจาก `cancelApplication()` ใน
 * `applications.ts` ตอนผู้สมัครยกเลิกเองและขอให้ลบข้อมูล (PDPA)
 *
 * ทั้งสองคอลเลกชันมีเลขบัตรประชาชนและที่อยู่อยู่ใน `fill` — ลบทิ้งจริงเหมือนที่
 * `cancelApplication()` ล้างคำตอบของใบสมัครเอง ไม่ใช่ soft delete
 */
export async function eraseHrDocuments(applicationId: string): Promise<void> {
  if (!ObjectId.isValid(applicationId)) return;
  await Promise.all([
    (await records()).deleteMany({ applicationId }),
    (await prints()).deleteMany({ applicationId }),
  ]);
}
