import type { DocFill, HrDocId } from "@/app/recruitment/_lib/hr-documents";

/**
 * สัญญาของ “ค่าที่กรอกในหน้าทำเอกสาร” ที่เก็บลงฐาน — **ไฟล์กลางของทั้งสองฝั่ง**
 * (client-safe: มีแต่ชนิดกับค่าคงที่ ไม่แตะ `lib/mongo.ts`)
 *
 * สองคอลเลกชันใน `hr_service` (29 ก.ย. 2026):
 *
 * - `recruitment_hr_documents` — **หนึ่งใบสมัครหนึ่งเอกสาร** ถือค่าที่กรอกล่าสุด
 *   ทั้งก้อน (`DocFill`) ไม่แยกตามฉบับ เพราะสามฉบับใช้ช่องร่วมกัน (ชื่อ · วันที่ ·
 *   เงินเดือน · ผู้ลงนาม) และกล่องกรอกก็ถือเป็นก้อนเดียวอยู่แล้ว · `revision`
 *   ขยับทุกครั้งที่บันทึก ใช้กันสองคนบันทึกทับกันโดยไม่รู้ตัว (409)
 * - `recruitment_hr_document_prints` — **การพิมพ์ล่าสุด ฉบับละแถว** เขียนทับทุกครั้งที่
 *   สั่งพิมพ์ฉบับนั้น (29 ก.ย. 2026 — เดิมเก็บต่อท้ายทุกครั้ง เจ้าของงานให้เหลือแค่ล่าสุด)
 *   พร้อมสำเนา `fill` ทั้งก้อน = ค่าบนกระดาษแผ่นล่าสุดของฉบับนั้น
 *
 * ⚠️ ทั้งสองมีเลขบัตรประชาชนและที่อยู่ — **ลบทิ้งพร้อมกันเมื่อใบสมัครถูกลบตามคำขอ**
 * ของเจ้าของข้อมูล (`erasedAt` ใน `applications.ts`)
 */

/** ฉบับที่เก็บค่าลงฐาน — รายงานผู้สมัครไม่มีช่องกรอก · Driver Rating เก็บที่ใบสมัครเอง */
export const HR_RECORD_DOCS = ["contract", "deposit", "refund"] as const satisfies readonly HrDocId[];

export type HrRecordDocId = (typeof HR_RECORD_DOCS)[number];

export function isHrRecordDoc(v: unknown): v is HrRecordDocId {
  return typeof v === "string" && (HR_RECORD_DOCS as readonly string[]).includes(v);
}

/** ผู้ทำรายการ — มาจาก session เสมอ ไม่รับจาก body */
export interface HrActor {
  employeeId: string;
  name: string;
}

/** ค่าที่บันทึกไว้ล่าสุดของใบสมัครหนึ่งใบ */
export interface HrDocumentRecord {
  id: string;
  applicationId: string;
  /** เลขใบสมัคร ณ ตอนบันทึก — ไว้อ่านในฐานโดยไม่ต้อง join */
  ref: string;
  fill: DocFill;
  /** เริ่มที่ 1 · ขยับทุกครั้งที่บันทึก */
  revision: number;
  createdAt: string;
  createdBy: HrActor;
  updatedAt: string;
  updatedBy: HrActor;
}

/** หนึ่งครั้งที่สั่งพิมพ์ — รายการในประวัติไม่มี `fill` (ขอทีละใบผ่าน `HrDocumentPrintFull`) */
export interface HrDocumentPrint {
  id: string;
  docId: HrRecordDocId;
  /** `revision` ของเอกสารหลักตอนพิมพ์ · `0` = พิมพ์ก่อนเคยบันทึก */
  revision: number;
  printedAt: string;
  printedBy: HrActor;
}

export interface HrDocumentPrintFull extends HrDocumentPrint {
  /** สำเนาค่าที่อยู่บนกระดาษจริงตอนพิมพ์ */
  fill: DocFill;
}

/** `GET /api/recruitment/applications/{id}/hr-documents` */
export interface HrDocumentState {
  record: HrDocumentRecord | null;
  /** การพิมพ์ล่าสุดฉบับละแถว (มากสุดเท่าจำนวน `HR_RECORD_DOCS`) · ใหม่สุดก่อน */
  prints: HrDocumentPrint[];
}

/** body ของ `PUT …/hr-documents` — `revision` คือค่าที่จอถืออยู่ (`0` = ยังไม่เคยบันทึก) */
export interface HrDocumentSaveInput {
  fill: DocFill;
  revision: number;
}

/** body ของ `POST …/hr-documents/prints` */
export interface HrDocumentPrintInput {
  docId: HrRecordDocId;
  fill: DocFill;
}
