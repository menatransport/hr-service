import {
  BookUser,
  ChartColumn,
  ClipboardList,
  FileCode2,
  FolderOpen,
  GraduationCap,
  LayoutGrid,
  ListChecks,
  Settings,
  ShieldCheck,
  UserMinus,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * เมนูของศูนย์กลางสรรหา — **ใช้ได้ทั้ง server และ client**
 *
 * แยกไฟล์ออกมาเหมือน `deskNav` ใน `lib/data.ts` เพราะถูกอ่านสองที่:
 * แถบข้างซ้าย (client) และการ์ดโมดูลบนหน้าภาพรวม (server) — รายการเดียวกัน
 * จึงไม่มีทางหลุด sync เวลามีโมดูลใหม่
 *
 * `ready: false` = ยังไม่มี `page.tsx` จริง เมนูจะจางและกดไม่ได้ **อย่าลบทิ้ง** —
 * การเห็นว่าระบบกำลังจะมีอะไรบ้างคือส่วนหนึ่งของการใช้งาน และเป็นเหตุผลเดียวกับที่
 * `RegistryView` เลือกบอกว่า “ยังไม่มีข้อมูล” แทนการขึ้นตารางเปล่า
 * เปลี่ยนเป็น `true` พร้อมกับตอนสร้างหน้านั้นจริง
 */

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  ready: boolean;
  /** ประโยคเดียวที่อธิบายว่าโมดูลนี้ทำอะไร — ขึ้นบนการ์ดหน้าภาพรวม */
  blurb: string;
  /** เมนูย่อยพับได้ใต้รายการนี้ในแถบข้าง — ตอนนี้มีแค่ “ตั้งค่าระบบ” */
  children?: AdminNavGroup[];
}

export interface AdminNavGroup {
  section: string;
  items: AdminNavItem[];
}

export const ADMIN_ROOT = "/recruitment/admin";

export const SETTINGS_ROOT = `${ADMIN_ROOT}/settings`;

/**
 * รายการตั้งค่า — กลุ่มย่อยใต้ “ตั้งค่าระบบ” ในแถบข้าง (กติกา `ready` เดียวกับ `adminNav`)
 *
 * รายการที่ยังไม่เปิดคือของที่ **ตอนนี้ยังฝังอยู่ในโค้ด** และควรย้ายมาเป็น master
 * ให้ฝ่ายบุคคลแก้เองได้ในรอบถัด ๆ ไป — ย้ายเสร็จเมื่อไหร่ให้เปลี่ยน `ready` เป็น `true`
 */
export const settingsNav: AdminNavGroup[] = [
  {
    /* กลุ่มเดียว ไม่มีหัวกลุ่ม — `section` ว่าง = แถบข้างไม่พิมพ์หัวกลุ่มย่อย */
    section: "",
    items: [
      {
        href: `${SETTINGS_ROOT}/resign-reasons`,
        label: "เหตุผลการลาออก",
        icon: UserMinus,
        ready: true,
        blurb: "Reason Code Master — หมวด รหัส และประเภทการออก ใช้ทั้งทะเบียน พจส. และขอสรรหา",
      },
      {
        href: `${SETTINGS_ROOT}/access`,
        label: "ผู้ใช้และสิทธิ์",
        icon: ShieldCheck,
        ready: false,
        blurb: "ใครเข้าหลังบ้านสรรหาได้ และแก้อะไรได้บ้าง",
      },
      {
        href: `${SETTINGS_ROOT}/api-docs`,
        label: "API Docs",
        icon: FileCode2,
        ready: true,
        blurb: "เอกสารอ้างอิง API ทุกเส้นของระบบ — สิทธิ์ พารามิเตอร์ ผลลัพธ์ และประวัติการเปลี่ยนแปลง",
      },
    ],
  },
];

export const adminNav: AdminNavGroup[] = [
  {
    section: "ภาพรวม",
    items: [
      {
        href: ADMIN_ROOT,
        label: "หน้าหลัก",
        icon: LayoutGrid,
        ready: true,
        blurb: "คิวงานที่ต้องทำวันนี้ และสถานะรวมของรอบรับสมัคร",
      },
    ],
  },
  {
    section: "การสรรหา",
    items: [
      /* คำขอกับผู้สมัครเป็น **เมนูเดียว สองแท็บ** (22 ก.ย. 2026) — เดิมแยกกัน
         แล้วคนใช้ต้องเด้งไปมาทั้งวัน เพราะคำถามจริงของฝ่ายสรรหาคือ “อัตรานี้
         ได้คนหรือยัง” ซึ่งอ่านจากตารางเดียวไม่จบ · แท็บอยู่ที่
         `/requisitions?tab=` ดู `recruitment-tabs.tsx` */
      {
        href: `${ADMIN_ROOT}/requisitions`,
        label: "ขอสรรหาและผู้สมัคร",
        icon: ClipboardList,
        ready: true,
        blurb: "อัตราที่จัดส่งขอ และใบสมัครที่เข้ามารับอัตรานั้น — สองแท็บในหน้าเดียว",
      },
      {
        href: `${ADMIN_ROOT}/trainees`,
        label: "ติดตามฝึกงาน",
        icon: GraduationCap,
        ready: true,
        blurb: "ตารางเช็กรายวันของพนักงานใหม่และคนที่ยังฝึกงานอยู่",
      },
      {
        href: `${ADMIN_ROOT}/questions`,
        label: "คลังคำถาม",
        icon: ListChecks,
        ready: true,
        blurb: "แก้ชุดคำถามที่ผู้สมัครต้องตอบ พร้อมพรีวิวบนมือถือ",
      },
    ],
  },
  {
    section: "พนักงานจัดส่ง",
    items: [
      {
        href: `${ADMIN_ROOT}/drivers`,
        label: "ทะเบียนประวัติ พจส.",
        icon: BookUser,
        ready: true,
        blurb: "ประวัติคนขับ สาขา รถประจำ และสถานะการปฏิบัติงาน",
      },
      {
        href: `${ADMIN_ROOT}/documents`,
        label: "ศูนย์เอกสาร",
        icon: FolderOpen,
        ready: true,
        blurb: "ปฏิทินวันหมดอายุใบขับขี่และบัตรประชาชน พร้อมรายชื่อที่ต้องตามในเดือนนั้น",
      },
      // {
      //   href: `${ADMIN_ROOT}/finance`,
      //   label: "รายได้–รายจ่าย",
      //   icon: Wallet,
      //   ready: false,
      //   blurb: "สรุปรายได้และรายการหักของคนขับแต่ละคนในแต่ละรอบ",
      // },
    ],
  },
  // {
  //   section: "รายงาน",
  //   items: [
  //     {
  //       href: `${ADMIN_ROOT}/insights`,
  //       label: "ตัวชี้วัดการสรรหา",
  //       icon: ChartColumn,
  //       ready: false,
  //       blurb: "อัตราการตอบรับข้อเสนอแยกสาขา และเวลาที่ใช้ต่ออัตรา",
  //     },
  //   ],
  // },
  {
    section: "ตั้งค่า",
    items: [
      /* รายการตั้งค่าย่อย (`settingsNav`) พับอยู่ใต้เมนูนี้ — กางเองเมื่ออยู่ในหน้าตั้งค่า
         แถบข้างจึงไม่ยาวขึ้นทุกครั้งที่มีของให้ตั้งค่าเพิ่ม */
      {
        href: SETTINGS_ROOT,
        label: "ตั้งค่าระบบ",
        icon: Settings,
        ready: true,
        blurb: "ข้อมูลหลักที่ทุกหน้าใช้ร่วมกัน เช่น รหัสเหตุผลการลาออก — เพิ่ม ลบ แก้ไขได้เอง",
        children: settingsNav,
      },
    ],
  },
];

/** โมดูลทั้งหมดเรียงเป็นแถวเดียว — การ์ดบนหน้าภาพรวมใช้ตัวนี้ (ตัดหน้าหลักออก) */
export const adminModules: AdminNavItem[] = adminNav
  .flatMap((group) => group.items)
  .filter((item) => item.href !== ADMIN_ROOT);
