import {
  BookUser,
  CalendarRange,
  Car,
  ClipboardList,
  Fuel,
  HardHat,
  Inbox,
  Package,
  Scale,
  ShieldCheck,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { DEPARTMENTS, ROOT_CAUSE_OTHER } from "./case-flow";
import type {
  Announcement,
  Department,
  DepartmentId,
  Priority,
  ReasonGroup,
  ReasonGroupCode,
} from "./types";

/**
 * ข้อมูลอ้างอิงและเนื้อหาที่ยังไม่มี backend
 *
 * **คำร้องไม่ได้อยู่ที่นี่แล้ว** — ข้อมูลคำร้อง ผู้อนุมัติ และรายชื่อพนักงาน
 * มาจาก NCAC API ผ่าน `lib/cases.ts` (server) และ `/api/cases/**` (client)
 * ที่เหลือในไฟล์นี้คือผังอ้างอิงที่ backend ไม่ได้ส่งมา (หน่วยงาน ประเภทเรื่อง
 * กลุ่มสาเหตุ) กับประกาศที่ยังเป็นเนื้อหาตัวอย่าง
 */

/* ---------------------------------------------------------------- ผู้ใช้ */

/**
 * ผู้ใช้ฝั่งเดสก์ท็อป — ERZONE / HR ดูแลคิวคำร้องทั้งหมด
 * `employeeId` ถูกส่งไปกับทุกคำสั่งอนุมัติ / ปฏิเสธ / ปิดคำร้อง จึงต้องมีอยู่จริงใน NCAC
 */
/**
 * ผู้ใช้ฝั่ง desk — **ค่าสำรองเท่านั้น** ตัวจริงมาจากคุกกี้ session
 * (`getDeskIdentity()` ใน `lib/auth/session.ts` · client ใช้ `useDeskIdentity()`)
 *
 * `/desk` ถูก `middleware.ts` กั้นไว้แล้ว ค่านี้จึงได้ใช้เฉพาะจังหวะที่คุกกี้
 * หมดอายุพอดีระหว่าง render — และเป็นรหัสที่ยิงเข้า NCAC ได้จริงเมื่อไม่มีคนล็อกอิน
 *
 * `employeeId` ต้องเป็นรหัสที่ **มีอยู่จริงใน `/users` ของ NCAC** เสมอ ห้ามใส่รหัส
 * สมมติ — `complaint_logs.action_by_employee_id` มี FK `fk_log_user` ไป
 * `users.employee_id` รหัสที่ไม่มีจริงจะทำให้ทั้ง “ปิดคำร้อง” และ “ลบคำร้อง”
 * ล้มทั้ง transaction (เคยเป็น `EMP-1180` ซึ่งไม่มีอยู่จริง ทั้งสองปุ่มจึงพังเงียบ ๆ)
 *
 * `HRSVC-DESK` เป็น **บัญชีระบบ** ที่สร้างไว้ให้ audit log มีปลายทางที่ถูกต้อง —
 * ไม่ใช่พนักงานจริง จึงไม่มีแผนก/ตำแหน่ง และถูกกรองออกจากสมุดรายชื่อด้วย
 * `employee_status = "System"` (ดู `getEmployees()` ใน `lib/employees.ts`)
 * ต่อ auth เมื่อไหร่ให้ค่านี้มาจากบัญชีที่ล็อกอินจริงแทน
 *
 * `imageUrl` = `image_url` ของ NCAC ตัวเดียวกับที่หน้าสมุดรายชื่อใช้ —
 * ผู้ใช้ส่วนใหญ่มีค่านี้อยู่แล้วจากรูป Google ตอนล็อกอิน OAuth
 */
export const deskUser = {
  employeeId: "HRSVC-DESK",
  name: "นภา ว.",
  role: "ERZONE · HR Service Desk",
  departmentId: "24" as DepartmentId,
  position: "Assistant Manager",
  level: 4,
  imageUrl: null as string | null,
};

/* ---------------------------------------------------------------- หน่วยงาน (PIC) */

const DEPARTMENT_ICONS: Record<DepartmentId, LucideIcon> = {
  "3": Truck,
  "11": Fuel,
  "19": Package,
  "15": Package,
  "20": Package,
  "8": ShieldCheck,
  "24": Users,
  "17": ClipboardList,
};

export const departments: Department[] = (
  Object.keys(DEPARTMENTS) as DepartmentId[]
).map((id) => ({
  id,
  label: DEPARTMENTS[id].th,
  labelEn: DEPARTMENTS[id].en,
  icon: DEPARTMENT_ICONS[id],
}));

export const departmentIcon = (id: string | null): LucideIcon =>
  (id && DEPARTMENT_ICONS[id as DepartmentId]) || Inbox;

/* ----------------------------------------------------------------------------
 * ประเภทข้อร้องเรียนตาม PIC — **ย้ายออกจากไฟล์นี้แล้ว 13 ส.ค. 2026**
 *
 * เดิมเป็น `complaintTypesByDepartment` ที่ hard-code ไว้ตรงนี้ แก้ทีต้อง deploy
 * ใหม่ทุกครั้ง · ตอนนี้อยู่ในตาราง `complaint_master` ของ NCAC แก้ผ่านปุ่ม
 * “ประเภทเรื่อง” บนหน้าคิวคำร้องได้เลย
 *
 * | ต้องการอะไร | ไปที่ไหน |
 * |---|---|
 * | อ่านฝั่ง server | `getComplaintTypes()` ใน `lib/complaint-types.ts` |
 * | อ่าน/แก้ฝั่ง client | `/api/complaint-types` (ผ่าน `requestJson`) |
 * | แปลงชื่อไอคอนเป็นคอมโพเนนต์ | `complaintIcon()` ใน `lib/complaint-icons.ts` |
 *
 * **อย่าสร้างรายการ hard-code กลับมาอีก** — ค่าที่อยู่สองที่จะหลุด sync ทันที
 * ที่มีคนเพิ่มประเภทใหม่ผ่านหน้าจอ
 * ------------------------------------------------------------------------- */

/* ---------------------------------------------------------------- สาเหตุหลัก (Root cause) */

/**
 * ผังสาเหตุหลัก 6 กลุ่ม ยกมาจาก `REASON_CODE_MAIN` ของระบบเดิม
 * ใช้สามที่: คนขับเลือก **กลุ่ม** ตอนแจ้ง · PIC เลือก **รายการย่อย** เป็น root cause ·
 * `lib/ncac/adapt.ts` ใช้ย้อนรอยจาก root cause ที่ NCAC ส่งมากลับเป็นกลุ่ม
 */
export const reasonGroups: ReasonGroup[] = [
  {
    code: "PAY",
    label: "ค่าตอบแทนและสวัสดิการ",
    hint: "ค่าจ้าง ค่าเที่ยว โอที เบี้ยเลี้ยง",
    icon: Wallet,
    items: [
      "ค่าจ้าง / โบนัสไม่ถูกต้องหรือล่าช้า",
      "ค่าเบี้ยเลี้ยงคำนวณผิดพลาด",
      "สวัสดิการไม่ครอบคลุมหรือถูกลด",
      "ไม่ได้รับค่าชดเชยตามสิทธิ์",
      "เงื่อนไขค่าตอบแทนหรือสวัสดิการไม่ชัดเจน",
      "การเบิกค่าใช้จ่าย / ค่าเดินทางล่าช้า",
      "การสื่อสารเรื่องค่าตอบแทนไม่ครบถ้วน",
    ],
  },
  {
    code: "OPS",
    label: "การจัดการงานและตารางงาน",
    hint: "ตารางวิ่ง เส้นทาง ชั่วโมงทำงาน",
    icon: CalendarRange,
    items: [
      "ตารางงานไม่สม่ำเสมอ / แจ้งกระชั้นชิด",
      "ชั่วโมงการทำงานเกินมาตรฐาน",
      "การจัดงานไม่เป็นธรรม",
      "ภาระงานไม่สมดุลระหว่างพนักงาน",
      "คำสั่งงาน / ขั้นตอนการทำงานไม่ชัดเจน",
      "การประสานงานระหว่างหน่วยงานล่าช้า",
      "เอกสารหรือข้อมูลที่ใช้ปฏิบัติงานไม่ครบถ้วน",
    ],
  },
  {
    code: "VEH",
    label: "ยานพาหนะและอุปกรณ์",
    hint: "รถเสีย ซ่อมบำรุง เครื่องสแกน",
    icon: Car,
    items: [
      "รถไม่ได้รับการบำรุงรักษาตามกำหนด",
      "รถมีสภาพไม่พร้อมใช้งาน",
      "รถไม่เหมาะสมกับลักษณะงาน",
      "อุปกรณ์ความปลอดภัยไม่ครบ",
      "อุปกรณ์ชำรุดหรือเสื่อมสภาพ",
      "กระบวนการแจ้งซ่อมหรือซ่อมบำรุงล่าช้า",
    ],
  },
  {
    code: "SAF",
    label: "ความปลอดภัยและสุขภาพ",
    hint: "อุบัติเหตุ PPE จุดเสี่ยง",
    icon: HardHat,
    items: [
      "สภาพแวดล้อมการทำงานไม่ปลอดภัย",
      "ขาดการอบรมหรือความรู้ด้านความปลอดภัย",
      "การจัดการความเสี่ยงในงานไม่เหมาะสม",
      "ไม่มีแนวทางรองรับเหตุฉุกเฉิน",
      "การจัดการเหตุอุบัติเหตุไม่เหมาะสม",
      "ถูกกดดันให้ทำงานทั้งที่ไม่พร้อมด้านสุขภาพ",
    ],
  },
  {
    code: "MGT",
    label: "การบริหารและความสัมพันธ์",
    hint: "หัวหน้า กฎระเบียบ ความเป็นธรรม",
    icon: Scale,
    items: [
      "การปฏิบัติของหัวหน้าไม่เป็นธรรม",
      "นโยบาย / กฎไม่ชัดเจนหรือสื่อสารไม่ทั่วถึง",
      "การบังคับใช้กฎไม่เท่าเทียมกัน",
      "ระบบประเมินผล / เลื่อนตำแหน่งไม่โปร่งใส",
      "การคุกคาม / เลือกปฏิบัติในที่ทำงาน",
    ],
  },
  {
    code: "OTH",
    label: "เรื่องอื่น",
    hint: "ลูกค้าปลายทาง เหตุสุดวิสัย",
    icon: Inbox,
    items: [
      "ปัจจัยจากลูกค้า / คู่ค้าภายนอก",
      "เหตุสุดวิสัย",
      // ข้อความมาจาก `case-flow.ts` เพราะเป็นค่าที่ต้องตรงกับข้อมูลเก่าใน NCAC
      ROOT_CAUSE_OTHER,
    ],
  },
];

export const reasonGroup = (code: ReasonGroupCode) =>
  reasonGroups.find((g) => g.code === code) ?? reasonGroups[reasonGroups.length - 1];

/* ---------------------------------------------------------------- ความสำคัญ */

export const priorityMeta: Record<Priority, { label: string; chip: string }> = {
  high: { label: "สูง", chip: "border-sla/40 bg-sla/6 text-sla" },
  medium: { label: "กลาง", chip: "border-line bg-base-200 text-mut" },
  low: { label: "ต่ำ", chip: "border-line bg-base-100 text-mut" },
};

/* ---------------------------------------------------------------- เมนู HR desk */

export interface DeskNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * เมนูย่อย — ตัวแม่ที่มี `children` เป็นแค่หัวข้อกลุ่ม **ไม่ใช่ลิงก์**
   * `href` ของมันใช้เป็น prefix ตัดสินว่ากลุ่มนี้กำลังถูกเปิดอยู่หรือเปล่า
   */
  children?: { href: string; label: string }[];
}

export const deskNav: { section: string; items: DeskNavItem[] }[] = [
  {
    section: "งานของฉัน",
    items: [
      { href: "/desk", label: "แจ้งข้อร้องเรียน", icon: ClipboardList },
      { href: "/desk/employee", label: "ค้นหาข้อมูลพนักงาน", icon: Users },
      {
        href: "/desk/registry",
        label: "ทะเบียนประวัติ พจส.",
        icon: BookUser,
        children: [
          { href: "/desk/registry/ladkrabang", label: "ทะเบียนลาดกระบัง" },
          { href: "/desk/registry/saraburi", label: "ทะเบียนสระบุรี" },
        ],
      },
      // `/desk/activity` (Log) ย้ายไปเป็นไอคอนบน topbar แล้ว — ไม่ต้องเพิ่มกลับที่นี่
    ],
  },
];

/* ---------------------------------------------------------------- ประกาศ */

export const announcements: Announcement[] = [
  {
    id: "a1",
    title: "วันหยุดยาว 12–14 ส.ค. และตารางเวรจัดส่ง",
    body: "บริษัทหยุด 12–14 ส.ค. เขต 1–3 มีเวรจัดส่งวันที่ 13 ส.ค. ตรวจตารางเวรของตนเองในแอปและยืนยันกับหัวหน้าเขตภายใน 8 ส.ค.",
    postedAt: "4 ส.ค. 09:00",
    author: "ฝ่ายบุคคล",
    pinned: true,
    unread: true,
  },
  {
    id: "a2",
    title: "ปรับอัตราค่าเที่ยวเขตปริมณฑล เริ่ม 1 ก.ย.",
    body: "ค่าเที่ยวเขตปริมณฑลปรับขึ้น 8 บาท/เที่ยว มีผลกับรอบจ่ายวันที่ 15 ก.ย. เป็นต้นไป",
    postedAt: "2 ส.ค. 16:30",
    author: "ฝ่ายบุคคล",
    pinned: false,
    unread: true,
  },
  {
    id: "a3",
    title: "อบรมความปลอดภัยบนถนน รอบเดือน ส.ค.",
    body: "อบรมภาคบังคับปีละ 1 ครั้ง เลือกรอบได้ที่ห้องอบรมคลัง B วันที่ 8, 15 หรือ 22 ส.ค. เวลา 13:00–16:00",
    postedAt: "29 ก.ค. 10:15",
    author: "ฝ่ายความปลอดภัย",
    pinned: false,
    unread: false,
  },
];

/* ---------------------------------------------------------------- รายงาน */

/**
 * แนวโน้มย้อนหลัง — NCAC ยังไม่มี endpoint สรุปรายเดือน
 * กราฟใน `/desk/reports` จึงยังใช้ชุดนี้ ส่วนตัวเลขการ์ดด้านบนคำนวณจากคำร้องจริง
 */
export const monthlyVolume = [
  { month: "มี.ค.", opened: 48, closed: 44 },
  { month: "เม.ย.", opened: 52, closed: 50 },
  { month: "พ.ค.", opened: 61, closed: 57 },
  { month: "มิ.ย.", opened: 55, closed: 58 },
  { month: "ก.ค.", opened: 72, closed: 65 },
  { month: "ส.ค.", opened: 31, closed: 24 },
];
