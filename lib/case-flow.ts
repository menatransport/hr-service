import type {
  ActivityAction,
  ActivityEntry,
  CaseStatus,
  DepartmentId,
  HrCase,
  Priority,
  ReviewStatus,
  TimelineStep,
} from "./types";

/* ---------------------------------------------------------------- date helpers */

const THAI_MONTHS = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

/** แปลง ISO เป็นเวลาไทย (UTC+7) แบบไม่พึ่ง Intl — ผลลัพธ์เท่ากันทั้ง server และ client */
function toBangkok(iso: string) {
  const d = new Date(iso);
  const t = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return {
    day: t.getUTCDate(),
    month: THAI_MONTHS[t.getUTCMonth()],
    year: t.getUTCFullYear() + 543,
    hh: String(t.getUTCHours()).padStart(2, "0"),
    mm: String(t.getUTCMinutes()).padStart(2, "0"),
  };
}

/** "3 ส.ค." */
export function formatShort(iso: string | null): string {
  if (!iso) return "—";
  const { day, month } = toBangkok(iso);
  return `${day} ${month}`;
}

/** "3 ส.ค. 2569" */
export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const { day, month, year } = toBangkok(iso);
  return `${day} ${month} ${year}`;
}

/** "3 ส.ค. 08:12" */
export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const { day, month, year, hh, mm } = toBangkok(iso);
  return `${day} ${month} ${year} ${hh}:${mm}`;
}

/** "1,440 บาท" — คั่นหลักพันเองเพื่อให้ผลลัพธ์เท่ากันทั้ง server และ client */
export function formatBaht(n: number | null): string {
  if (n === null) return "—";
  return `${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")} บาท`;
}

/** เลขลำดับวันตามปฏิทินไทย — ใช้เทียบว่าห่างกันกี่ “วัน” ไม่ใช่กี่ชั่วโมง */
const bangkokDay = (d: Date) =>
  Math.floor((d.getTime() + 7 * 60 * 60 * 1000) / 86_400_000);

/**
 * จำนวนวันที่คำร้องเปิดอยู่ นับถึงวันนี้ (หรือวันที่ปิดถ้าปิดแล้ว)
 *
 * นับเป็น **วันตามปฏิทินไทย** ไม่ใช่ชั่วโมงหาร 24 — ค่าจึงคงที่ตลอดทั้งวัน
 * ทำให้ HTML ที่ server render กับตอน client hydrate ตรงกันเสมอ
 * (ถ้าหารเวลาดิบ ค่าจะขยับทุกวินาที → hydration mismatch)
 */
export function caseAgeDays(hrCase: HrCase): number {
  const end = hrCase.closedAt ? new Date(hrCase.closedAt) : new Date();
  return Math.max(0, bangkokDay(end) - bangkokDay(new Date(hrCase.createdAt)));
}

/* ---------------------------------------------------------------- status */

export const STATUS_FLOW: CaseStatus[] = [
  "open",
  "assigned",
  "pending_review",
  "ready_to_close",
  "closed",
];

/**
 * chip ของแต่ละสถานะใช้เฉพาะสีจาก design system (`HR System.dc.html`) —
 * 4 แบบจาก swatch สถานะคำร้อง + primary ทึบ 1 แบบสำหรับ “รอปิดคำร้อง”
 *
 * ไล่สีตามความหมาย ไม่ใช่ตามลำดับขั้น: ฟ้า = เพิ่งเข้ามายังไม่มีคนรับ ·
 * เขียว = มีคนถืออยู่ · ส้ม = ค้างรอคนอื่นตัดสินใจ · เขียวทึบ = พร้อมปิด ·
 * เทา = จบแล้ว ไม่ต้องสนใจ (สองสถานะปลายทางจึงไม่จมกันเป็นเทาทั้งคู่)
 *
 * `dot` คือจุดนำหน้าใน `StatusBadge` — ทำให้ 5 สถานะแยกออกจากกันด้วยตำแหน่ง
 * และน้ำหนักสี ไม่ได้พึ่ง hue อย่างเดียว (คนตาบอดสีก็ยังไล่ลำดับได้)
 */
export const statusMeta: Record<
  CaseStatus,
  { label: string; short: string; chip: string; dot: string; step: number }
> = {
  open: {
    label: "เปิดคำร้อง",
    short: "เปิดคำร้อง",
    chip: "bg-st-new text-st-new-ink ring-st-new-ink/20",
    dot: "bg-st-new-ink",
    step: 1,
  },
  assigned: {
    label: "มอบผู้รับผิดชอบแล้ว",
    short: "มอบหมายแล้ว",
    chip: "bg-st-live text-st-live-ink ring-st-live-ink/25",
    dot: "bg-st-live-ink",
    step: 2,
  },
  pending_review: {
    label: "รออนุมัติ",
    short: "รออนุมัติ",
    chip: "bg-st-wait text-st-wait-ink ring-st-wait-ink/25",
    dot: "bg-st-wait-ink",
    step: 3,
  },
  ready_to_close: {
    label: "รอปิดคำร้อง",
    short: "รอปิดคำร้อง",
    chip: "bg-primary text-primary-content ring-primary",
    dot: "bg-primary-content",
    step: 4,
  },
  closed: {
    label: "ปิดคำร้องแล้ว",
    short: "ปิดแล้ว",
    chip: "bg-st-done text-st-done-ink ring-st-done-ink/20",
    dot: "bg-st-done-ink",
    step: 5,
  },
};

export const TOTAL_STEPS = STATUS_FLOW.length;

export const isOpenCase = (hrCase: HrCase) => hrCase.status !== "closed";

/** SLA: คำร้องที่ยังไม่ปิดและเปิดมานานกว่าเกณฑ์ตามความสำคัญ */
const SLA_DAYS: Record<Priority, number> = { high: 2, medium: 5, low: 10 };

export function isSlaBreached(hrCase: HrCase): boolean {
  if (hrCase.status === "closed") return false;
  return caseAgeDays(hrCase) > SLA_DAYS[hrCase.priority];
}

export const slaTarget = (priority: Priority) => SLA_DAYS[priority];

/* ---------------------------------------------------------------- ลบคำร้อง */

/**
 * ลบคำร้องได้เฉพาะเรื่องที่ **ยังไม่เข้าสายอนุมัติ**
 *
 * ที่ต้องมีปุ่มลบเลยคือเรื่องแจ้งผิด/แจ้งซ้ำ/เคสทดสอบ ซึ่งเกิดตอนต้นทางทั้งนั้น
 * พอมีคนเซ็นอนุมัติแล้วเอกสารกลายเป็นหลักฐาน — เส้นทางที่ถูกคือ “ปิดคำร้อง”
 * ไม่ใช่ลบให้หายไปจากประวัติ จึงล็อกไว้ที่ `open` / `assigned` และต้องยังไม่มี
 * `reviews` แม้แต่รายการเดียว (กำหนดผู้อนุมัติแล้ว = เริ่มสายอนุมัติแล้ว)
 *
 * **เป็นการลบแบบ soft** — backend ตั้ง `is_deleted = true` ข้อมูลไม่ได้หายจากฐาน
 * (`getCases()` กรองออกให้อยู่แล้ว) กู้คืนได้ที่ฝั่งฐานข้อมูลถ้าลบพลาด
 */
export function canDeleteCase(hrCase: HrCase): boolean {
  if (hrCase.status !== "open" && hrCase.status !== "assigned") return false;
  return hrCase.reviews.length === 0;
}

/** เหตุผลที่ลบไม่ได้ — ใช้เป็น tooltip/ข้อความอธิบาย ไม่ใช่แค่ซ่อนปุ่มเงียบ ๆ */
export function deleteBlockedReason(hrCase: HrCase): string | null {
  if (canDeleteCase(hrCase)) return null;
  if (hrCase.reviews.length) return "กำหนดผู้อนุมัติแล้ว — ใช้การปิดคำร้องแทน";
  return `คำร้องอยู่ในสถานะ “${statusMeta[hrCase.status].label}” — ใช้การปิดคำร้องแทน`;
}

/* ---------------------------------------------------------------- ประวัติการทำงาน */

/**
 * ป้าย/สีของแต่ละเหตุการณ์ในหน้าประวัติ — ใช้ token ที่มีอยู่แล้วเท่านั้น
 *
 * สีสื่อ “ผลของการกระทำ” ไม่ใช่ลำดับขั้น: เขียว = เดินหน้า · แดง = ย้อนกลับ/ทำลาย ·
 * ส้ม = ต้องกลับไปแก้ · เทา = ธุรการทั่วไป — ไล่สายตาหาเรื่องที่ผิดปกติได้เร็ว
 */
export const activityMeta: Record<
  ActivityAction,
  { label: string; chip: string; dot: string }
> = {
  create: {
    label: "แจ้งเรื่องใหม่",
    chip: "bg-st-new text-st-new-ink",
    dot: "bg-st-new-ink",
  },
  assign: {
    label: "มอบหมายหน่วยงาน",
    chip: "bg-st-live text-st-live-ink",
    dot: "bg-st-live-ink",
  },
  approve: {
    label: "อนุมัติแผนแก้ไข",
    chip: "bg-st-live text-st-live-ink",
    dot: "bg-primary",
  },
  reject: {
    label: "ปฏิเสธแผนแก้ไข",
    chip: "bg-alert/10 text-alert",
    dot: "bg-alert",
  },
  resubmit: {
    label: "แก้แผนแล้วส่งใหม่",
    chip: "bg-st-wait text-st-wait-ink",
    dot: "bg-st-wait-ink",
  },
  close: {
    label: "ปิดคำร้อง",
    chip: "bg-st-done text-st-done-ink",
    dot: "bg-st-done-ink",
  },
  delete: {
    label: "ลบคำร้อง",
    chip: "bg-alert/10 text-alert",
    dot: "bg-alert",
  },
  other: {
    label: "อื่น ๆ",
    chip: "bg-base-200 text-mut",
    dot: "bg-mut",
  },
};

/**
 * ข้อความอธิบายตัวเองของแต่ละเหตุการณ์ (`ใครทำอะไร`)
 *
 * NCAC ไม่ได้บันทึกผู้ทำไว้ทุกเหตุการณ์ — `CREATE` มาจากคนขับ ส่วน `ASSIGNED`/
 * `RESUBMIT` เกิดจาก `PUT` ที่ไม่ได้รับรหัสผู้ทำเข้ามา · กรณีนั้น **บอกตรง ๆ ว่า
 * ไม่ได้บันทึกไว้ ห้ามเดาเป็นใคร** (ล็อกที่เดาคือล็อกที่เชื่อไม่ได้)
 */
export function activityActor(entry: ActivityEntry): string {
  if (entry.actorName) return entry.actorName;
  if (entry.actorId) return entry.actorId;
  return entry.action === "create" ? "ผู้แจ้ง (พจส.)" : "ไม่ได้บันทึกผู้ทำ";
}

/* ---------------------------------------------------------------- reviews */

export const reviewMeta: Record<
  ReviewStatus,
  { label: string; chip: string }
> = {
  pending: { label: "รอตรวจสอบ", chip: "bg-st-wait text-st-wait-ink" },
  approved: { label: "อนุมัติแล้ว", chip: "bg-st-live text-st-live-ink" },
  rejected: { label: "ปฏิเสธ", chip: "bg-alert/10 text-alert" },
};

export const reviewOf = (hrCase: HrCase, level: 1 | 2) =>
  hrCase.reviews.find((r) => r.level === level) ?? null;

/** คำร้องนี้รอ “ฉัน” อนุมัติอยู่หรือไม่ */
export function isPendingFor(hrCase: HrCase, employeeId: string): boolean {
  return (
    hrCase.status === "pending_review" &&
    hrCase.reviews.some(
      (r) => r.reviewerId === employeeId && r.status === "pending",
    )
  );
}

/* ---------------------------------------------------------------- timeline */

/**
 * ไทม์ไลน์ถูก **คำนวณจากสถานะ + reviews** ไม่ได้เก็บไว้ในข้อมูล
 * เพิ่มสถานะใหม่ที่เดียวคือ STATUS_FLOW แล้วที่นี่ต่อให้เอง
 */
export function buildTimeline(hrCase: HrCase): TimelineStep[] {
  const at = statusMeta[hrCase.status].step;
  const finished = hrCase.status === "closed";
  const state = (step: number): TimelineStep["state"] =>
    finished || step < at ? "done" : step === at ? "current" : "todo";

  const l1 = reviewOf(hrCase, 1);
  const l2 = reviewOf(hrCase, 2);

  const approvalMeta = () => {
    const rejected = [l1, l2].find((r) => r?.status === "rejected");
    if (rejected)
      return `${rejected.reviewerName} ปฏิเสธ ${formatDateTime(rejected.reviewedAt)}`;
    const waiting = [l1, l2].find((r) => r?.status === "pending");
    if (waiting) return `รอ ${waiting.reviewerName} (ระดับ ${waiting.level})`;
    if (l2?.reviewedAt)
      return `อนุมัติครบ 2 ระดับ ${formatDateTime(l2.reviewedAt)}`;
    if (l1?.reviewedAt) return `อนุมัติระดับ 1 ${formatDateTime(l1.reviewedAt)}`;
    return "ยังไม่ได้กำหนดผู้อนุมัติ";
  };

  return [
    {
      title: "คนขับแจ้งเรื่อง",
      meta: formatDateTime(hrCase.createdAt),
      state: state(1),
    },
    {
      title: "มอบผู้รับผิดชอบ",
      meta: hrCase.departmentId
        ? departmentLabel(hrCase.departmentId)
        : "รอ ERZONE คัดกรอง",
      state: state(2),
    },
    {
      title: "รออนุมัติแผนแก้ไข",
      meta: approvalMeta(),
      state: state(3),
    },
    {
      title: "รอปิดคำร้อง",
      meta: hrCase.result ? "บันทึกผลการดำเนินงานแล้ว" : "รอบันทึกผลการดำเนินงาน",
      state: state(4),
    },
    {
      title: "ปิดคำร้องแล้ว",
      meta: hrCase.closedAt
        ? `${hrCase.closedBy} · ${formatDateTime(hrCase.closedAt)}`
        : undefined,
      state: state(5),
    },
  ];
}

/* ---------------------------------------------------------------- section gating */

export type EditableSection = "classification" | "actionPlan" | "approval";

/** สถานะที่อนุญาตให้แก้แต่ละส่วน (ยกกฎมาจากระบบเดิม) */
export const SECTION_REQUIRED_STATUS: Record<EditableSection, CaseStatus> = {
  classification: "open",
  actionPlan: "assigned",
  approval: "assigned",
};

export const SECTION_LABEL: Record<EditableSection, string> = {
  classification: "มอบผู้รับผิดชอบ",
  actionPlan: "กรอกรายละเอียดและแผนแก้ไข",
  approval: "กำหนดผู้อนุมัติ",
};

/**
 * ส่วนที่กรอกไม่ได้จนกว่าเคสจะมีหน่วยงานผู้รับผิดชอบ
 *
 * แผนแก้ไขกับผู้อนุมัติเป็นงานของ PIC — ยังไม่มอบหมายก็ยังไม่มีเจ้าของงาน
 * และ “ประเภทเรื่อง” ทั้งชุดก็ derive มาจากหน่วยงาน (`complaintTypesFor`)
 * จึงยังไม่มีตัวเลือกให้เลือกด้วยซ้ำ
 */
const SECTION_NEEDS_DEPARTMENT: Record<EditableSection, boolean> = {
  classification: false,
  actionPlan: true,
  approval: true,
};

/**
 * ส่วนที่ “ต้องทำตอนนี้” ตามสถานะคำร้อง — ใช้เปิด accordion ให้ถูกช่องอัตโนมัติ
 * เพื่อให้ผู้ใช้เห็นแค่ฟอร์มเดียวที่เกี่ยวข้อง
 */
export function activeSectionFor(status: CaseStatus): EditableSection | null {
  if (status === "open") return "classification";
  if (status === "assigned") return "actionPlan";
  return null;
}

/** HR / ER (dept 24) แก้ได้ทุกสถานะยกเว้นปิดคำร้องแล้ว — เหมือนระบบเดิม */
export const HR_DEPARTMENT_ID = "24";

export function canEditSection(
  section: EditableSection,
  caseStatus: CaseStatus,
  userDepartmentId: string,
  caseDepartmentId: DepartmentId | null,
): boolean {
  // ด่านนี้อยู่หน้าข้อยกเว้นของ HR/ER โดยตั้งใจ — ต่อให้เป็น HR ก็กรอกแผนของเคส
  // ที่ยังไม่มีผู้รับผิดชอบไม่ได้ ต้องมอบหมายหน่วยงานก่อนเสมอ
  if (SECTION_NEEDS_DEPARTMENT[section] && !caseDepartmentId) return false;
  if (userDepartmentId === HR_DEPARTMENT_ID) return caseStatus !== "closed";
  return caseStatus === SECTION_REQUIRED_STATUS[section];
}

export function lockReason(
  section: EditableSection,
  caseStatus: CaseStatus,
  caseDepartmentId: DepartmentId | null,
): string {
  if (SECTION_NEEDS_DEPARTMENT[section] && !caseDepartmentId) {
    return "ยังไม่ได้มอบหมายหน่วยงานผู้รับผิดชอบ";
  }
  const required = statusMeta[SECTION_REQUIRED_STATUS[section]].label;
  const current = statusMeta[caseStatus].label;
  return `แก้ไขได้เมื่อสถานะเป็น “${required}” · ปัจจุบัน “${current}”`;
}

/* ---------------------------------------------------------------- departments */

/**
 * หน่วยงานผู้รับผิดชอบ (PIC) — id ตรงกับ department_id ของระบบเดิม
 * ไอคอนของแต่ละหน่วยงานอยู่ใน `lib/data.ts` (ที่นี่เก็บแค่ข้อความ ไม่ผูกกับ UI)
 */
export const DEPARTMENTS: Record<DepartmentId, { th: string; en: string }> = {
  "3": { th: "ยานยนต์", en: "Vehicle" },
  "11": { th: "เชื้อเพลิง", en: "Fuel" },
  "19": { th: "จัดส่ง สสบ.", en: "Delivery / Operation" },
  "15": { th: "จัดส่ง ศลบ.", en: "Delivery / Operation" },
  "20": { th: "จัดส่ง ศบก.", en: "Delivery / Operation" },
  "8": { th: "ความปลอดภัย", en: "Safety" },
  "24": { th: "ทรัพยากรบุคคล", en: "HR / ER" },
};

export function departmentLabel(id: string | null): string {
  if (!id) return "ยังไม่มอบหมาย";
  return DEPARTMENTS[id as DepartmentId]?.th ?? id;
}
