import { DOCUMENT_FIELDS, type DocumentData } from "@/app/recruitment/_lib/types";
import type { DocSlot } from "@/app/recruitment/_lib/form";
import { DRIVER_EDIT_FIELDS, type DriverEditField } from "@/app/recruitment/_lib/drivers/types";

/**
 * ข้อมูลจากเอกสารมี **เจ้าของที่เดียว** (Bew 8 พ.ย. 2569)
 *
 * - ยังไม่ได้รหัส พจส. → อยู่ในใบสมัคร (`applications.documents`) ตามเดิม
 * - ได้รหัสแล้ว → ช่องที่ทะเบียนมี (`REGISTRY_OWNED`) **ย้ายไปอยู่ทะเบียน (`master_driver`) ที่เดียว**
 *   ใบสมัครอ่านค่าจากทะเบียนตอนอ่าน และแก้จากใบสมัครก็เขียนลงทะเบียน (`application-registry.ts`)
 *   ช่องที่ทะเบียนไม่มี (ทะเบียนบ้าน · ชื่อธนาคาร · ชื่อบัญชี) ยังอยู่ในใบสมัคร
 *
 * เลขบัตรประชาชนเป็นข้อยกเว้นเดียว — เป็น**กุญแจจับคู่**ใบสมัครกับทะเบียน (`portrait.ts`) จึงอยู่ทั้งสองที่
 * แต่เขียนพร้อมกันเสมอ ไม่มีทางต่างกัน
 *
 * ไฟล์นี้ไม่แตะฐานข้อมูล ใช้ได้ทั้งฝั่ง browser และเซิร์ฟเวอร์
 */

/** ช่องในเอกสาร → ช่องของทะเบียน (`DRIVER_EDIT_FIELDS.key` = ชื่อฟิลด์ใน `master_driver`) */
const PAIRS: { doc: keyof DocumentData; edit: string }[] = [
  { doc: "nationalId", edit: "nationalId" },
  { doc: "idCardExpiry", edit: "idCardExpiryDate" },
  { doc: "licenseNo", edit: "licenseNo" },
  { doc: "licenseType", edit: "licenseType" },
  { doc: "licenseExpiry", edit: "licenseExpiryDate" },
  { doc: "bankAccountNo", edit: "bankAccountNo" },
  { doc: "bankBranch", edit: "bankBranch" },
];

export const REGISTRY_OWNED: { doc: keyof DocumentData; field: DriverEditField }[] = PAIRS.map((p) => {
  const field = DRIVER_EDIT_FIELDS.find((f) => f.key === p.edit);
  if (!field) throw new Error(`document-sync: ไม่มีช่อง ${p.edit} ใน DRIVER_EDIT_FIELDS`);
  return { doc: p.doc, field };
});

/** ช่องที่ใบสมัครยังเก็บค่าไว้เองหลังได้รหัสแล้ว — กุญแจจับคู่ */
export const SHARED_KEY: keyof DocumentData = "nationalId";

/** ช่องในกล่องเอกสาร (ไม่รวมช่องเก่าที่ซ้ำกับคำตอบในใบสมัคร) — ตัวเดียวกับ `candidate-documents.tsx` */
export const DOC_FORM_FIELDS = DOCUMENT_FIELDS.filter((f) => !f.legacy);

/** ช่องเอกสารที่มีข้อมูลให้กรอก ตามลำดับคลัง — หัวข้อของแท็บเอกสาร */
export function dataSlots(docSlots: DocSlot[]): DocSlot[] {
  return docSlots.filter((s) => DOC_FORM_FIELDS.some((f) => f.slot === s.id));
}

/**
 * พจส. ที่ไม่มีใบสมัคร — ช่องในกล่องเอกสาร → กองในแฟ้มเอกสารของทะเบียน (`DRIVER_DOC_TYPES`)
 * รูปของช่อง = ไฟล์ล่าสุดในกองนั้น · แนบใหม่ = เพิ่มเข้ากอง (ฉบับเก่ายังอยู่ในแฟ้ม)
 */
export const REGISTRY_SLOT_DOC_TYPES: Record<string, string> = {
  id_card: "id-card",
  house_reg: "house-registration",
  license_front: "driver-license",
  bank_book: "bank-book",
};

/** ช่องกรอกที่ทะเบียนมีที่เก็บ — กล่องเอกสารของคนที่ไม่มีใบสมัครเปิดให้กรอกแค่ชุดนี้ */
export const REGISTRY_DOC_KEYS: (keyof DocumentData)[] = PAIRS.map((p) => p.doc);

/** ใบสมัครที่ผูกกับทะเบียนแล้ว — ช่องไหนอ่าน/เขียนที่ทะเบียน */
export function isRegistryOwned(key: keyof DocumentData): boolean {
  return REGISTRY_OWNED.some((p) => p.doc === key);
}

/**
 * ข้อมูลเอกสารที่หน้าประวัติ พจส. ส่งลง browser — ไม่ใช่ใบสมัครเต็มใบ (เต็มใบโหลดตอนกดแก้ไข)
 * · `documents` ผ่าน `withRegistryDocuments()` มาแล้ว = ค่าเดียวกับที่กล่องแสดง
 */
export interface DriverDocSource {
  /** `null` = คนนี้ไม่มีใบสมัคร — ข้อมูล/รูปอ่านเขียนที่ทะเบียนตรง (`REGISTRY_SLOT_DOC_TYPES`) */
  applicationId: string | null;
  drivercode: string;
  /** เลขที่ใบสมัคร · ไม่มีใบสมัคร = `""` */
  ref: string;
  documents: DocumentData;
  /** รูปของแต่ละช่อง — `slot` → url */
  files: Record<string, string>;
  docSlots: DocSlot[];
}
