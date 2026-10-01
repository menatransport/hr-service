import { Inbox, LayoutGrid } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * เมนูของโมดูลค่าจ้างและสวัสดิการ — **ใช้ได้ทั้ง server และ client**
 *
 * ท่าเดียวกับ `lib/recruitment/admin-nav.ts` เพราะถูกอ่านสองที่: แถบข้างซ้าย (client)
 * และการ์ดโมดูลบนหน้าภาพรวม (server) รายการเดียวกันจึงไม่มีทางหลุด sync
 *
 * ตอนนี้เปิดไว้แค่สองเมนูตามที่เจ้าของงานสั่ง (12 ก.ย. 2569) — ภาพรวม กับ รับข้อมูล
 * เมนูอื่น (รวมและตรวจ · กระทบยอดและส่งต่อ · ทะเบียนและค่าตั้ง) ถูกถอดออกทั้งชุด
 * **อย่าเพิ่มกลับมาเองถ้าไม่ได้สั่ง**
 *
 * `ready: false` = ยังไม่มี `page.tsx` จริง เมนูจะจางและกดไม่ได้
 */

export interface PayrollNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  ready: boolean;
  /** ประโยคเดียวที่อธิบายว่าหน้านี้ทำอะไร — ขึ้นบนการ์ดหน้าภาพรวม */
  blurb: string;
}

export interface PayrollNavGroup {
  section: string;
  items: PayrollNavItem[];
}

export const PAYROLL_ROOT = "/payroll";

export const payrollNav: PayrollNavGroup[] = [
  {
    section: "ภาพรวม",
    items: [
      {
        href: PAYROLL_ROOT,
        label: "ภาพรวมรอบจ่าย",
        icon: LayoutGrid,
        ready: true,
        blurb: "รอบที่เปิดอยู่ และงานที่ต้องทำต่อ",
      },
    ],
  },
  {
    section: "รับข้อมูล",
    items: [
      {
        href: `${PAYROLL_ROOT}/intake`,
        label: "รับข้อมูล",
        icon: Inbox,
        ready: true,
        blurb: "ไฟล์ที่แต่ละฝ่ายส่งเข้ามาในรอบนี้",
      },
    ],
  },
];

/** โมดูลทั้งหมดเรียงเป็นแถวเดียว — การ์ดบนหน้าภาพรวมใช้ตัวนี้ (ตัดหน้าภาพรวมออก) */
export const payrollModules: PayrollNavItem[] = payrollNav
  .flatMap((group) => group.items)
  .filter((item) => item.href !== PAYROLL_ROOT);
