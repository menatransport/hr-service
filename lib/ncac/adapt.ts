import { DEPARTMENTS } from "../case-flow";
import { complaintTypesByDepartment, reasonGroups } from "../data";
import type {
  ActivityAction,
  ActivityEntry,
  Approver,
  CaseReview,
  CaseStatus,
  DepartmentId,
  Employee,
  HrCase,
  Priority,
  ReasonGroupCode,
  ReviewStatus,
} from "../types";
import type {
  ComplaintDto,
  ComplaintLogDto,
  ComplaintReviewDto,
  UserDto,
} from "./types";

/**
 * แปลงข้อมูลดิบของ NCAC API → โมเดลของหน้าจอ (`HrCase`)
 *
 * **ที่นี่คือที่เดียวที่รู้จัก snake_case ของ backend** — component ทุกตัวเห็นแต่ `HrCase`
 *
 * NCAC ยังไม่มี 4 อย่างที่ UI ต้องใช้ จึง “คำนวณเอา” ไว้ในไฟล์นี้
 * เมื่อ backend เพิ่มคอลัมน์จริงแล้วให้ลบตัวคำนวณทิ้งแล้วอ่านค่าตรง ๆ ที่เดียว:
 *
 * | ต้องใช้ | ตอนนี้ได้มาจาก |
 * |---|---|
 * | `reasonGroup` | `root_cause` → `complaint_type` → หน่วยงาน → `OTH` |
 * | `priority`    | กลุ่มสาเหตุ + มูลค่าความเสียหาย (ดู `derivePriority`) |
 * | `driverMeta` | เทียบ `driver_id` กับสมุดรายชื่อจาก `/users` (พจส. ส่วนใหญ่ไม่มีในนั้น → `""`) |
 * | `notes`       | ไม่มี endpoint ข้อความโต้ตอบ → คืน `[]` เสมอ |
 *
 * ส่วน `Employee.imageUrl` **ไม่ได้คำนวณ** — อ่านจาก `image_url` ตรง ๆ
 * (ส่วนใหญ่เป็นรูปบัญชี Google จากตอนล็อกอิน · ใครไม่มีก็ `null` แล้วตกไปใช้ตัวย่อชื่อ)
 */

/* ---------------------------------------------------------------- สมุดรายชื่อ */

export type UserDirectory = Map<string, UserDto>;

export const buildDirectory = (users: UserDto[]): UserDirectory =>
  new Map(users.map((u) => [String(u.employee_id), u]));

const fullName = (u: UserDto) => `${u.firstname} ${u.lastname}`.trim();

/** ระดับตำแหน่ง — ยกมาจาก `POSITION_LEVEL_MAP` ของระบบเดิม */
const POSITION_LEVEL: Record<string, number> = {
  "Chief Executive Officer": 9,
  "C-Level": 8,
  "Deputy C-level": 7,
  "Senior Manager": 6,
  Manager: 5,
  "Assistant Manager": 4,
  Supervisor: 3,
  "Assistant Supervisor": 2,
  Officer: 1,
};

/**
 * ป้ายระดับตำแหน่งที่เอาไปโชว์ — **ภาษาอังกฤษล้วน ย่อให้สั้น** ตามที่เจ้าของงานสั่ง
 * (ดรอปดาวน์ผู้อนุมัติแสดงแค่ “ชื่อ · ระดับ” ไม่ใช้ชื่อตำแหน่งเต็มซึ่งยาวและซ้ำกัน)
 */
const LEVEL_LABEL: Record<string, string> = {
  "Chief Executive Officer": "CEO",
  "C-Level": "C-Level",
  "Deputy C-level": "Deputy C-Level",
  "Senior Manager": "Senior Manager",
  Manager: "Manager",
  "Assistant Manager": "Asst. Manager",
  Supervisor: "Supervisor",
  "Assistant Supervisor": "Asst. Supervisor",
  Officer: "Officer",
};

export function positionLevelLabel(level: string | null | undefined): string {
  if (!level?.trim()) return "—";
  const lower = level.trim().toLowerCase();
  for (const [key, label] of Object.entries(LEVEL_LABEL)) {
    if (key.toLowerCase() === lower) return label;
  }
  return level.trim();
}

export function positionLevel(level: string | null): number {
  if (!level) return 0;
  const exact = POSITION_LEVEL[level];
  if (exact !== undefined) return exact;

  const lower = level.toLowerCase();
  for (const [key, value] of Object.entries(POSITION_LEVEL)) {
    if (key.toLowerCase() === lower) return value;
  }

  const parsed = Number.parseFloat(level);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export const toApprover = (u: UserDto): Approver => ({
  employeeId: String(u.employee_id),
  name: fullName(u),
  position: u.position ?? "—",
  levelLabel: positionLevelLabel(u.position_level),
  level: positionLevel(u.position_level),
  department: u.department ?? "—",
});

/** ค่าที่ upstream ปล่อยว่างมา → ขีดกลาง เพื่อไม่ให้การ์ดมีช่องโหว่ */
const orDash = (v: string | null | undefined): string => v?.trim() || "—";

/** พนักงานเต็มใบสำหรับหน้า `/desk/employee` — `toApprover` เป็นชุดย่อของอันนี้ */
export const toEmployee = (u: UserDto): Employee => {
  const employeeId = String(u.employee_id ?? "");

  return {
    employeeId,
    name: fullName(u) || employeeId,
    firstName: u.firstname?.trim() ?? "",
    lastName: u.lastname?.trim() ?? "",
    email: u.email?.trim() ?? "",
    department: orDash(u.department),
    position: orDash(u.position),
    levelLabel: positionLevelLabel(u.position_level),
    level: positionLevel(u.position_level),
    site: orDash(u.site),
    imageUrl: u.image_url?.trim() || null,
  };
};

/* ---------------------------------------------------------------- สถานะ */

const STATUS_IN: Record<string, CaseStatus> = {
  OPEN: "open",
  ASSIGNED: "assigned",
  PENDING_REVIEW: "pending_review",
  READY_TO_CLOSE: "ready_to_close",
  CLOSED: "closed",
};

/** ค่าที่ upstream ใช้ — ใช้ตอนส่ง filter กลับไป */
export const statusToApi = (status: CaseStatus): string =>
  status.toUpperCase();

const toStatus = (raw: string): CaseStatus =>
  STATUS_IN[String(raw).toUpperCase()] ?? "open";

const REVIEW_IN: Record<string, ReviewStatus> = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
};

const toReviewStatus = (raw: string): ReviewStatus =>
  REVIEW_IN[String(raw).toUpperCase()] ?? "pending";

/* ---------------------------------------------------------------- ประวัติการทำงาน */

/** ค่า `action` ของ NCAC → ชนิดที่หน้าจอรู้จัก · ไม่รู้จัก = `other` ไม่ใช่ทิ้ง */
const ACTION_IN: Record<string, ActivityAction> = {
  CREATE: "create",
  ASSIGNED: "assign",
  APPROVE: "approve",
  REJECT: "reject",
  RESUBMIT: "resubmit",
  CLOSE: "close",
  DELETE: "delete",
};

/**
 * หมายเหตุที่ NCAC เขียนเองตอนบันทึกล็อก — ไม่ใช่ข้อความที่คนพิมพ์
 *
 * ทิ้งทั้งหมดเพราะ **ซ้ำกับป้ายชื่อเหตุการณ์อยู่แล้ว** (“แจ้งเรื่องใหม่” คู่กับ
 * “Complaint created”) และเป็นภาษาอังกฤษปนอยู่กลางหน้าจอไทย · ที่เหลือในช่อง
 * หมายเหตุจึงเป็นข้อความที่คนพิมพ์เองล้วน ๆ ซึ่งคือส่วนที่มีค่าจริงของล็อก
 */
const SYSTEM_REMARKS = [
  "complaint created",
  "complaint edited after rejection and workflow restarted",
];

const humanRemark = (raw: string | null | undefined): string | null => {
  const value = raw?.trim();
  if (!value) return null;
  const lower = value.toLowerCase();
  if (SYSTEM_REMARKS.includes(lower)) return null;
  // ข้อความตอนเปลี่ยนหน่วยงานมีทั้งขีดสั้นและขีดยาวแล้วแต่รุ่น — จับที่ส่วนหน้า
  if (lower.startsWith("department changed")) return null;
  return value;
};

export const toActivity = (dto: ComplaintLogDto): ActivityEntry => ({
  id: String(dto.id),
  action: ACTION_IN[String(dto.action).toUpperCase()] ?? "other",
  rawAction: String(dto.action ?? ""),
  trackingNo: dto.tracking_no,
  subject: dto.subject?.trim() || "(ไม่มีหัวเรื่อง)",
  caseDeleted: Boolean(dto.complaint_is_deleted),
  /* ชื่อว่างจาก upstream ต้องเป็น `null` ไม่ใช่สตริงว่าง — หน้าจอเช็กค่าเดียวจบ */
  actorName: dto.action_by_name?.trim() || null,
  actorId: dto.action_by_employee_id?.trim() || null,
  remark: humanRemark(dto.remark),
  at: dto.created_at,
});

/* ---------------------------------------------------------------- กลุ่มสาเหตุ */

/** รายการสาเหตุย่อย → รหัสกลุ่ม (สร้างจาก `reasonGroups` จึงไม่มีทางหลุด sync) */
const GROUP_BY_ITEM = new Map<string, ReasonGroupCode>(
  reasonGroups.flatMap((g) => g.items.map((item) => [item, g.code] as const)),
);

/** หน่วยงานผู้รับผิดชอบ → กลุ่มสาเหตุที่พบบ่อยที่สุดของหน่วยงานนั้น */
const GROUP_BY_DEPARTMENT: Record<DepartmentId, ReasonGroupCode> = {
  "3": "VEH",
  "11": "PAY",
  "19": "OPS",
  "15": "OPS",
  "20": "OPS",
  "8": "SAF",
  "24": "PAY",
};

/** ประเภทเรื่องย่อย → หน่วยงานเจ้าของ (สร้างจาก `complaintTypesByDepartment`) */
const DEPARTMENT_BY_TYPE = new Map<string, DepartmentId>(
  (Object.keys(complaintTypesByDepartment) as DepartmentId[]).flatMap((id) =>
    complaintTypesByDepartment[id].map((t) => [t.value, id] as const),
  ),
);

function deriveReasonGroup(dto: ComplaintDto): ReasonGroupCode {
  if (dto.root_cause) {
    const byItem = GROUP_BY_ITEM.get(dto.root_cause);
    if (byItem) return byItem;
  }

  if (dto.complaint_type) {
    const byType = DEPARTMENT_BY_TYPE.get(dto.complaint_type);
    if (byType) return GROUP_BY_DEPARTMENT[byType];
  }

  const dept = toDepartmentId(dto.department_id);
  return dept ? GROUP_BY_DEPARTMENT[dept] : "OTH";
}

/* ---------------------------------------------------------------- ความสำคัญ */

/**
 * NCAC ไม่มีคอลัมน์ priority — ระบบจึงจัดระดับจาก “เรื่องนี้กระทบคนขับแรงแค่ไหน”
 * ความปลอดภัยและเรื่องเงินขึ้นก่อนเสมอ · เสียหายตั้งแต่ 10,000 บาทดันเป็นสูง
 */
const PRIORITY_BY_GROUP: Record<ReasonGroupCode, Priority> = {
  SAF: "high",
  PAY: "high",
  VEH: "medium",
  OPS: "medium",
  MGT: "medium",
  OTH: "low",
};

const HIGH_DAMAGE_BAHT = 10_000;

function derivePriority(dto: ComplaintDto, group: ReasonGroupCode): Priority {
  if ((dto.damage_cost ?? 0) >= HIGH_DAMAGE_BAHT) return "high";
  return PRIORITY_BY_GROUP[group];
}

/* ---------------------------------------------------------------- ชิ้นเล็ก */

function toDepartmentId(raw: number | string | null | undefined): DepartmentId | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const id = String(raw);
  return id in DEPARTMENTS ? (id as DepartmentId) : null;
}

const emptyToNull = (v: string | null | undefined): string | null =>
  v && v.trim() ? v : null;

function toReview(
  dto: ComplaintReviewDto,
  directory: UserDirectory,
): CaseReview {
  const user = directory.get(String(dto.reviewer_employee_id));
  return {
    level: dto.level === 2 ? 2 : 1,
    reviewerId: String(dto.reviewer_employee_id),
    reviewerName: user ? fullName(user) : String(dto.reviewer_employee_id),
    // ป้ายเดียวกับที่ดรอปดาวน์ผู้อนุมัติใช้ — อ่านแล้วเทียบกันได้ทันที
    reviewerPosition: positionLevelLabel(user?.position_level),
    status: toReviewStatus(dto.status),
    remark: emptyToNull(dto.remark),
    reviewedAt: emptyToNull(dto.reviewed_at),
  };
}

/* ---------------------------------------------------------------- ตัวแปลงหลัก */

export function toHrCase(dto: ComplaintDto, directory: UserDirectory): HrCase {
  const status = toStatus(dto.status);
  const reasonGroup = deriveReasonGroup(dto);
  const driver = directory.get(String(dto.driver_id));
  const closing = dto.audit?.[0] ?? null;
  const closer = closing ? directory.get(String(closing.reviewer_employee_id)) : null;

  return {
    trackingNo: dto.tracking_no,
    subject: dto.subject ?? "(ไม่มีหัวเรื่อง)",
    detail: dto.detail ?? dto.complaint_details ?? "",

    driverId: String(dto.driver_id ?? ""),
    // NCAC ส่งชื่อ พจส. มาตรง ๆ แล้ว — สมุดรายชื่อเป็นแค่ทางสำรอง
    driverName:
      dto.driver_name?.trim() ||
      (driver ? fullName(driver) : String(dto.driver_id ?? "—")),
    // พจส. ไม่ได้อยู่ใน `/users` เกือบทุกคน → ปล่อยว่างแล้วให้หน้าจอซ่อนบรรทัดนี้ไป
    driverMeta: driver
      ? [driver.position, driver.department].filter(Boolean).join(" · ")
      : "",

    reasonGroup,
    departmentId: toDepartmentId(dto.department_id),
    complaintType: emptyToNull(dto.complaint_type),

    status,
    priority: derivePriority(dto, reasonGroup),

    problem: emptyToNull(dto.problem),
    rootCause: emptyToNull(dto.root_cause),
    solution: emptyToNull(dto.solution),
    result: emptyToNull(dto.result),
    damageCost: dto.damage_cost ?? null,

    reviews: (dto.reviews ?? [])
      .map((r) => toReview(r, directory))
      .sort((a, b) => a.level - b.level),

    closedBy: closing ? (closer ? fullName(closer) : closing.reviewer_employee_id) : null,
    closedAt: closing
      ? (closing.reviewed_at ?? closing.created_at)
      : status === "closed"
        ? dto.updated_at
        : null,

    createdAt: dto.created_at,
    updatedAt: dto.updated_at,

    // NCAC เก็บได้ไฟล์เดียวต่อฝั่ง — ผู้แจ้งหนึ่ง ผู้รับผิดชอบหนึ่ง
    attachments: [dto.complaint_url, dto.solution_url].filter(
      (url): url is string => Boolean(url),
    ),

    // ยังไม่มี endpoint ข้อความโต้ตอบใน NCAC — บล็อกในหน้าจอจะไม่ขึ้นจนกว่าจะมี
    notes: [],
  };
}
