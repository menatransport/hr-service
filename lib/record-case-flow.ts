import {
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  Presentation,
  Tag,
  type LucideIcon,
} from "lucide-react";

import { formatDate, formatDateTime } from "./case-flow";

/**
 * กฎธุรกิจของ “บันทึกเคสส่วนกลาง” ทั้งหมดอยู่ไฟล์นี้ไฟล์เดียว
 * (คู่ขนานกับ `lib/case-flow.ts` ของฝั่งคำร้อง พจส. — คนละระบบกัน อย่าปนกฎกัน)
 *
 * import ได้ทั้งฝั่ง client และ server — **ห้ามใส่อะไรที่ผูกกับ Node หรือ mongodb**
 * ตัวอ่าน/เขียนฐานข้อมูลจริงอยู่ที่ `lib/record-cases.ts`
 */

/* ------------------------------------------------------------------ ชนิดข้อมูล */

/** มีแค่ 3 สถานะตามที่เจ้าของงานกำหนด — อย่าเพิ่มสถานะที่สี่โดยไม่ได้สั่ง */
export type RecordStatus = "pending" | "completed" | "rejected";

export const RECORD_STATUSES: RecordStatus[] = ["pending", "completed", "rejected"];

/**
 * ประเภทของเคส — ย้ายจากชุดปิดที่ฮาร์ดโค้ดในไฟล์นี้ไปเป็น **ข้อมูลที่จัดการได้จาก UI**
 * (ปุ่ม “จัดการประเภทเคส” — เพิ่ม 25 ส.ค. 2026) เก็บอยู่ที่ MongoDB คอลเลกชัน
 * `record_categories` (`lib/record-categories.ts`) ไม่ใช่ค่าคงที่ในไฟล์นี้อีกต่อไป
 *
 * ไฟล์นี้ (ห้ามผูกกับ Mongo) จึงเหลือแค่ **ชนิดข้อมูล + ฟังก์ชันอ่านค่าจากรายการที่ส่งเข้ามา**
 * รายการจริงมาจาก `listRecordCategories()` แล้วไหลลงมาเป็น prop `categories` ตลอดทาง
 * (`page.tsx` → `RecordCaseView` → `RecordCaseForm` / `RecordCategoryManager`)
 *
 * ทุกประเภทใช้ **ไอคอนเดียวกันหมด** (`RECORD_CATEGORY_ICON`) โดยตั้งใจ — ผู้จัดการ
 * ไม่ต้องเลือกไอคอนตอนเพิ่ม/แก้ประเภท
 */
export interface RecordCategory {
  id: string;
  label: string;
}

export const RECORD_CATEGORY_ICON: LucideIcon = Tag;

/**
 * เคสเก่าที่บันทึกไว้ก่อนมีฟิลด์นี้ (และรหัสประเภทที่ถูกลบไปแล้ว) คืน `null` —
 * ผู้เรียกต้องเลือกเองว่าจะแสดงเป็น “—” หรือซ่อนทิ้ง ห้ามเดาเป็น “อื่น ๆ” ให้
 */
export function findRecordCategory(
  categories: RecordCategory[],
  id: string | null | undefined,
): RecordCategory | null {
  return categories.find((c) => c.id === id) ?? null;
}

export const recordCategoryLabel = (
  categories: RecordCategory[],
  id: string | null | undefined,
): string => findRecordCategory(categories, id)?.label ?? "—";

/** ใส่ชื่อผู้เกี่ยวข้องได้กี่คน — ตรวจซ้ำฝั่งเซิร์ฟเวอร์ที่ `lib/record-cases.ts` */
export const MAX_INVOLVED = 12;
export const MAX_INVOLVED_NAME = 80;

/**
 * โทษทางวินัยที่ออกให้กับเคสนี้ — **เลือกได้หลายข้อ** (checkbox ตามใบ requirement)
 * เพราะเรื่องเดียวอาจไล่ระดับหลายขั้นกว่าจะจบ (ตักเตือนวาจา → หนังสือเตือน → พักงาน)
 *
 * เรียงตามความรุนแรงจากเบาไปหนัก — หน้าจอที่ต้องเลือกมาแสดงข้อเดียวจะได้หยิบข้อสุดท้าย
 */
export const WARNING_LEVELS = [
  { id: "verbal", label: "ตักเตือนด้วยวาจา", short: "วาจา", chip: "border-line text-mut" },
  {
    id: "written",
    label: "หนังสือเตือนเป็นลายลักษณ์อักษร",
    short: "ลายลักษณ์อักษร",
    chip: "border-sla/35 text-sla",
  },
  { id: "suspension", label: "พักงาน", short: "พักงาน", chip: "border-alert/35 text-alert" },
  {
    id: "termination",
    label: "ปลดออก",
    short: "ปลดออก",
    chip: "border-alert/60 bg-alert/10 text-alert",
  },
  { id: "none", label: "ไม่ได้รับ", short: "ไม่ได้รับ", chip: "border-line text-mut" },
] as const satisfies readonly {
  id: string;
  label: string;
  short: string;
  /** คลาสของธีมสำหรับป้ายเล็ก — ยิ่งหนักยิ่งเข้ม (ห้ามใส่ค่าสีดิบ ธีมมืดจะพัง) */
  chip: string;
}[];

export type WarningLevelId = (typeof WARNING_LEVELS)[number]["id"];

/**
 * `none` (“ไม่ได้รับ”) **ขัดกับทุกข้อที่เหลือ** — ติ๊กข้อนี้แล้วข้ออื่นต้องหลุดหมด
 * และกลับกัน · กฎอยู่ที่นี่ที่เดียว ทั้งฟอร์มและตัวตรวจฝั่งเซิร์ฟเวอร์เรียกตัวนี้
 */
export const WARNING_NONE: WarningLevelId = "none";

export function toggleWarning(current: string[], id: string): string[] {
  if (current.includes(id)) return current.filter((v) => v !== id);
  if (id === WARNING_NONE) return [WARNING_NONE];
  return [...current.filter((v) => v !== WARNING_NONE), id];
}

export function isWarningLevel(value: unknown): value is WarningLevelId {
  return WARNING_LEVELS.some((w) => w.id === value);
}

/** เรียงตามลำดับใน `WARNING_LEVELS` เสมอ ไม่ใช่ตามลำดับที่ผู้ใช้ติ๊ก */
export function sortWarnings(ids: string[]): string[] {
  return WARNING_LEVELS.filter((w) => ids.includes(w.id)).map((w) => w.id);
}

export const warningLabel = (id: string): string =>
  WARNING_LEVELS.find((w) => w.id === id)?.label ?? id;

export const warningShort = (id: string): string =>
  WARNING_LEVELS.find((w) => w.id === id)?.short ?? id;

export const warningChip = (id: string): string =>
  WARNING_LEVELS.find((w) => w.id === id)?.chip ?? "border-line text-mut";

/** หนักสุดที่เคสนี้ได้รับ — ใช้ตอนมีที่ให้แสดงป้ายเดียว (`null` = ยังไม่ได้ระบุ) */
export function topWarning(ids: string[]): string | null {
  const ordered = sortWarnings(ids).filter((id) => id !== WARNING_NONE);
  return ordered.length ? ordered[ordered.length - 1] : (ids[0] ?? null);
}

export const MAX_REMARK = 1000;

export interface RecordActor {
  employeeId: string;
  name: string;
}

export interface RecordAttachment {
  /** `_id` ของไฟล์ใน GridFS (`record_attachments`) — ไม่ใช่ URL เพราะไฟล์ไม่ได้เป็นสาธารณะ */
  fileId: string;
  /** ชื่อไฟล์ที่ผู้ใช้เห็น */
  name: string;
  /** MIME type ตอนอัปโหลด — ใช้แยกว่าเป็นรูปหรือเอกสาร */
  type: string;
  size: number;
}

export interface RecordHistoryEntry {
  at: string;
  /** `null` = แถวแรก (ตอนสร้างเคส) ยังไม่มีสถานะก่อนหน้า */
  from: RecordStatus | null;
  to: RecordStatus;
  by: RecordActor;
  note: string | null;
  /**
   * `"edit"` = **แก้ไขเนื้อเคส ไม่ได้เปลี่ยนสถานะ** (`from` = `to` = สถานะตอนนั้น)
   * แถวที่บันทึกก่อน 21 ส.ค. 2026 ไม่มีฟิลด์นี้ ให้ถือว่าเป็น `"status"`
   *
   * เก็บรวมเส้นเวลาเดียวกันโดยตั้งใจ — คนอ่านอยากรู้ว่า “เคสนี้ถูกยุ่งอะไรไปบ้าง”
   * ไม่ใช่แยกอ่านสองที่แล้วมานั่งเรียงเวลาเอง
   */
  kind?: "status" | "edit";
  /** ชื่อฟิลด์ภาษาไทยที่ถูกแก้ในครั้งนั้น — มีเฉพาะ `kind === "edit"` */
  fields?: string[];
}

/** แถวประวัติที่เป็นการแก้ไขเนื้อเคส (ไม่ใช่การเปลี่ยนสถานะ) */
export const isEditEntry = (entry: RecordHistoryEntry) => entry.kind === "edit";

export interface RecordCase {
  id: string;
  /** เลขที่อ่านออก เช่น `ER-2608-001` (`ER` + ปีเดือน ค.ศ. + ลำดับในเดือนนั้น) — ใช้อ้างอิงกันในที่ประชุม ไม่ใช่ `_id` ของ Mongo */
  code: string;
  title: string;
  detail: string;
  /** วันที่ของเหตุการณ์ เก็บเป็น `YYYY-MM-DD` ล้วน ไม่ใช่ ISO — ดูเหตุผลที่ `formatOccurredOn` */
  occurredOn: string;
  status: RecordStatus;
  /** รหัสฝ่ายจาก `DEPARTMENTS` ใน `lib/case-flow.ts` — **หนึ่งเคสหนึ่งฝ่าย** */
  departmentId: string;
  /**
   * รหัสประเภทเคสจาก `RECORD_CATEGORIES` · **`""` ได้** เพราะเคสที่บันทึกไว้ก่อน
   * 21 ส.ค. 2026 ไม่มีฟิลด์นี้ — เคสใหม่บังคับเลือกเสมอ
   */
  category: string;
  /** ชื่อผู้เกี่ยวข้องกับเรื่องนี้ (พิมพ์เอง ไม่ได้ผูกกับสมุดรายชื่อ) · ว่างได้ */
  involved: string[];
  /**
   * หมายเหตุของ**ตัวเคส** — คนละอันกับหมายเหตุตอนเปลี่ยนสถานะที่อยู่ใน `history`
   * (อันนั้นผูกกับการกระทำครั้งนั้น อันนี้เป็นข้อมูลประกอบของเรื่องที่แก้ไขทีหลังได้)
   */
  remark: string;
  /** โทษทางวินัยจาก `WARNING_LEVELS` — เลือกได้หลายข้อ · ว่าง = ยังไม่ได้ระบุ */
  warnings: string[];
  attachments: RecordAttachment[];
  recorder: RecordActor & { department: string };
  /** เรียงเก่า → ใหม่ · แถวแรกคือตอนสร้างเคสเสมอ */
  history: RecordHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------- ป้ายสถานะ */

export const recordStatusMeta: Record<
  RecordStatus,
  { label: string; chip: string; dot: string; hint: string; action: string }
> = {
  pending: {
    label: "รอดำเนินการ",
    chip: "bg-st-wait text-st-wait-ink ring-st-wait-ink/25",
    dot: "bg-st-wait-ink",
    hint: "บันทึกไว้แล้ว รอผู้เกี่ยวข้องดำเนินการ",
    /* `action` = คำบนปุ่ม (กริยา) ต่างจาก `label` ที่เป็นชื่อสถานะ (นาม) —
       ปุ่มที่เขียนว่า “รอดำเนินการ” เฉย ๆ อ่านไม่ออกว่ากดแล้วเกิดอะไร */
    action: "ดึงกลับมาดำเนินการ",
  },
  completed: {
    label: "เสร็จสิ้น",
    chip: "bg-st-done text-st-done-ink ring-st-done-ink/20",
    dot: "bg-st-done-ink",
    hint: "ดำเนินการจนจบเรื่องแล้ว",
    action: "อนุมัติเสร็จสิ้น",
  },
  rejected: {
    label: "ยกเลิก",
    chip: "bg-alert/12 text-alert ring-alert/25",
    dot: "bg-alert",
    hint: "ไม่รับเรื่อง หรือยกเลิกไป",
    action: "ยกเลิกเคส",
  },
};

/* --------------------------------------------------------------- กฎการเปลี่ยนสถานะ */

/**
 * เปลี่ยนไปเป็นสถานะอะไรได้บ้าง
 *
 * ปิดเรื่องแล้ว (`completed` / `rejected`) ยังดึงกลับมา `pending` ได้ เพราะบันทึกเคส
 * เป็นสมุดงานภายใน ไม่ใช่เอกสารอนุมัติ — เปิดใหม่ได้ แต่ **ทุกครั้งลง history**
 * จึงย้อนได้โดยไม่มีใครแอบเปลี่ยนเงียบ ๆ
 */
export function nextStatuses(current: RecordStatus): RecordStatus[] {
  return RECORD_STATUSES.filter((s) => s !== current);
}

export function isRecordStatus(value: unknown): value is RecordStatus {
  return typeof value === "string" && RECORD_STATUSES.includes(value as RecordStatus);
}

/* ------------------------------------------------------------------- ตัวจัดรูป */

/**
 * `2026-08-19` → `19 ส.ค. 2569`
 *
 * วันที่ของเหตุการณ์เก็บเป็นวันล้วน ไม่ใช่ ISO ที่มีเวลา เพราะผู้ใช้กรอกแค่ “วันไหน”
 * ถ้าเก็บเป็น ISO แล้ว server กับ browser อยู่คนละโซนเวลา วันจะเลื่อนไปหนึ่งวันเงียบ ๆ
 * — เติมโซน +07:00 ตรงนี้ที่เดียวแล้วส่งต่อให้ `formatDate` ของระบบเดิม
 */
export function formatOccurredOn(date: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? formatDate(`${date}T00:00:00+07:00`)
    : "—";
}

export { formatDateTime };

/** วันนี้ในรูป `YYYY-MM-DD` ตามเวลาไทย — ค่าตั้งต้นของช่องวันที่ */
export function todayInBangkok(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * ลิงก์เปิดไฟล์แนบ — ชี้เข้าเส้นของเราเอง ไม่ใช่ลิงก์สาธารณะบน Spaces
 * (เส้นนั้นตรวจ session ก่อนส่งไฟล์ ดู `app/api/record-cases/files/[id]/route.ts`)
 */
export function attachmentUrl(file: RecordAttachment): string {
  return `/api/record-cases/files/${file.fileId}`;
}

/** ไฟล์ที่เบราว์เซอร์แสดงเป็นรูปได้ — ตัวอื่นขึ้นเป็นการ์ดเอกสารแทน */
export function isImageAttachment(file: RecordAttachment): boolean {
  return file.type.startsWith("image/");
}

/**
 * ไอคอน + สี + ชื่อชนิดของไฟล์แนบ — **ตาต้องรู้ว่าเป็นไฟล์อะไรก่อนอ่านชื่อไฟล์**
 *
 * ดู MIME ก่อน แล้วค่อยถอยไปดูนามสกุล เพราะบางเบราว์เซอร์/ระบบส่ง `type` มาว่าง
 * หรือเป็น `application/octet-stream` · ไม่ได้ลงไลบรารีไอคอนไฟล์เพิ่มโดยตั้งใจ —
 * ชนิดที่ระบบรับมีไม่กี่ชนิด (ดู `ACCEPT` ใน `attachment-field.tsx`) และ lucide
 * มีครบอยู่แล้ว การเพิ่ม dependency แลกกับไอคอนหกอันไม่คุ้ม
 *
 * `tone` เป็นคลาสสีของธีมเท่านั้น (ห้ามใส่ค่าสีดิบ ธีมมืดจะพัง)
 */
export interface AttachmentKind {
  icon: LucideIcon;
  tone: string;
  label: string;
}

const FILE_KINDS: { test: RegExp; kind: AttachmentKind }[] = [
  { test: /^image\/|\.(jpe?g|png|webp|gif|bmp|hei[cf]|avif)$/i, kind: { icon: FileImage, tone: "text-primary", label: "รูปภาพ" } },
  { test: /pdf$/i, kind: { icon: FileText, tone: "text-alert", label: "PDF" } },
  { test: /(word|\.docx?)$/i, kind: { icon: FileType, tone: "text-info", label: "Word" } },
  { test: /(sheet|excel|csv|\.xlsx?)$/i, kind: { icon: FileSpreadsheet, tone: "text-primary", label: "Excel" } },
  { test: /(presentation|powerpoint|\.pptx?)$/i, kind: { icon: Presentation, tone: "text-sla", label: "PowerPoint" } },
  { test: /(^text\/|\.txt$)/i, kind: { icon: FileText, tone: "text-mut", label: "ข้อความ" } },
];

const UNKNOWN_KIND: AttachmentKind = { icon: File, tone: "text-mut", label: "ไฟล์" };

export function attachmentKind(file: RecordAttachment): AttachmentKind {
  const type = file.type || "";
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  return (
    FILE_KINDS.find(({ test }) => test.test(type) || test.test(ext))?.kind ?? UNKNOWN_KIND
  );
}

/** `1.4 MB` — คำนวณเองไม่ผ่าน `Intl` ตามกฎของโปรเจกต์ */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
