import type { LucideIcon } from "lucide-react";

/* ---------------------------------------------------------------- case lifecycle */

/**
 * วงจรชีวิตเคส 5 สถานะ (ยกมาจากระบบ driver-complaint เดิม)
 * open → assigned → pending_review → ready_to_close → closed
 */
export type CaseStatus =
  | "open"
  | "assigned"
  | "pending_review"
  | "ready_to_close"
  | "closed";

export type Priority = "low" | "medium" | "high";

/** รหัสหน่วยงานผู้รับผิดชอบ (PIC) — ตรงกับ department_id ของระบบเดิม */
export type DepartmentId = "3" | "11" | "15" | "19" | "20" | "8" | "24";

/** กลุ่มสาเหตุหลัก (Reason code) ที่คนขับเลือกตอนแจ้งเรื่อง */
export type ReasonGroupCode = "PAY" | "OPS" | "VEH" | "SAF" | "MGT" | "OTH";

export type ReviewStatus = "pending" | "approved" | "rejected";

export interface CaseReview {
  level: 1 | 2;
  reviewerId: string;
  reviewerName: string;
  reviewerPosition: string;
  status: ReviewStatus;
  remark: string | null;
  /** ISO string; null = ยังไม่ตรวจสอบ */
  reviewedAt: string | null;
}

export interface CaseNote {
  author: string;
  role: "driver" | "erzone" | "pic" | "manager";
  at: string;
  body: string;
}

export interface HrCase {
  /** เลขติดตามเคส เช่น DC-2026-0142 — ใช้เป็น route param ด้วย */
  trackingNo: string;
  subject: string;
  detail: string;

  driverId: string;
  driverName: string;
  driverMeta: string;

  /** กลุ่มสาเหตุที่คนขับเลือกตอนแจ้ง */
  reasonGroup: ReasonGroupCode;

  /** PIC ที่ ERZONE จัดให้ — null = ยังไม่คัดกรอง */
  departmentId: DepartmentId | null;
  /** ประเภทข้อร้องเรียนย่อย ขึ้นกับ PIC ที่เลือก */
  complaintType: string | null;

  status: CaseStatus;
  priority: Priority;

  /* --- ส่วนที่ PIC กรอกในขั้น “จัดการเคส” --- */
  problem: string | null;
  rootCause: string | null;
  solution: string | null;
  result: string | null;
  damageCost: number | null;

  /* --- ส่วนอนุมัติ --- */
  reviews: CaseReview[];

  closedBy: string | null;
  closedAt: string | null;

  createdAt: string;
  updatedAt: string;

  /** URL ไฟล์แนบ — รูปที่ผู้แจ้งส่งมา และหลักฐานผลการดำเนินงานของผู้รับผิดชอบ */
  attachments: string[];
  /** ข้อความโต้ตอบ — NCAC ยังไม่มี endpoint นี้ จึงเป็น `[]` เสมอในตอนนี้ */
  notes: CaseNote[];
}

/* ---------------------------------------------------------------- activity log */

/**
 * เหตุการณ์ที่ NCAC บันทึกไว้ใน `complaint_logs` — ใช้ในหน้า “ประวัติการทำงาน”
 * ค่าที่ไม่รู้จักจะกลายเป็น `other` ไม่ใช่ตกหล่นไป (ล็อกต้องไม่ปิดบังอะไร)
 */
export type ActivityAction =
  | "create"
  | "assign"
  | "approve"
  | "reject"
  | "resubmit"
  | "close"
  | "delete"
  | "other";

export interface ActivityEntry {
  id: string;
  action: ActivityAction;
  /** ค่าดิบจาก API — แสดงต่อท้ายเมื่อ `action` เป็น `other` จะได้ไม่ต้องเดา */
  rawAction: string;
  trackingNo: string;
  subject: string;
  /** คำร้องถูกลบไปแล้ว → ห้ามลิงก์ไปหน้าคำร้อง เพราะเปิดไม่ได้ */
  caseDeleted: boolean;
  /** ชื่อผู้ทำ — `null` เมื่อ NCAC ไม่ได้บันทึกไว้ (ห้ามเดาแทน) */
  actorName: string | null;
  actorId: string | null;
  remark: string | null;
  at: string;
}

/* ---------------------------------------------------------------- timeline */

export type TimelineState = "done" | "current" | "todo";

export interface TimelineStep {
  title: string;
  meta?: string;
  state: TimelineState;
}

/* ---------------------------------------------------------------- reference data */

export interface Department {
  id: DepartmentId;
  label: string;
  labelEn: string;
  icon: LucideIcon;
}

export interface ComplaintTypeOption {
  value: string;
  icon: LucideIcon;
}

export interface ReasonGroup {
  code: ReasonGroupCode;
  label: string;
  icon: LucideIcon;
  /** คำอธิบายสั้นให้คนขับเลือกได้เร็ว */
  hint: string;
  items: string[];
}

export interface Approver {
  employeeId: string;
  name: string;
  position: string;
  /** ป้ายระดับตำแหน่งภาษาอังกฤษแบบสั้น (`Manager` / `CEO`) — ที่แสดงในดรอปดาวน์ */
  levelLabel: string;
  /** ระดับตำแหน่ง — ต้อง ≥ 4 (Assistant Manager) จึงอนุมัติได้ */
  level: number;
  department: string;
}

/**
 * พนักงานออฟฟิศหนึ่งคนจากสมุดรายชื่อ NCAC (`GET /users`)
 *
 * เป็นชุดเดียวกับที่ `Approver` ใช้ แต่เก็บครบทุกฟิลด์ที่หน้าค้นหาพนักงานต้องโชว์
 * (`Approver` ตัดเหลือเฉพาะที่ดรอปดาวน์ผู้อนุมัติต้องใช้) — **ไม่ใช่ พจส.**
 * ซึ่งยังไม่มี endpoint ของตัวเอง ดู `RegistryView`
 */
export interface Employee {
  /** รหัสพนักงาน — ใช้เป็น route param ของ `/desk/employee/[id]` ด้วย */
  employeeId: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  position: string;
  /** ป้ายระดับตำแหน่งภาษาอังกฤษแบบสั้น (`Manager` / `CEO`) */
  levelLabel: string;
  level: number;
  /** สถานที่ปฏิบัติงาน */
  site: string;
  /** URL รูปพนักงาน (ส่วนใหญ่เป็นรูปบัญชี Google) — `null` = ยังไม่มีรูป */
  imageUrl: string | null;
}

/* ---------------------------------------------------------------- corporate services */

export interface Announcement {
  id: string;
  title: string;
  body: string;
  postedAt: string;
  author: string;
  pinned: boolean;
  unread: boolean;
}
