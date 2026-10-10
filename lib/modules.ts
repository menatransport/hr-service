import {
  BookUser,
  Bookmark,
  BriefcaseBusiness,
  Building2,
  ClipboardList,
  Code2,
  Database,
  Inbox,
  LayoutGrid,
  Route,
  ShieldCheck,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * โมดูลของหน้า Home (`/home`) — สามกลุ่มงาน แต่ละกลุ่มมี “menulist” ของตัวเอง
 *
 * menulist ชุดเดียวกันนี้ถูกวาดสองที่: แผงเมนูบนหน้า Home และ **แถบข้างของหน้าใน**
 * (`components/module/module-nav.tsx`) — ทั้งสองที่ห่อแต่ละรายการด้วย
 * `<ViewTransition name="menu-<id>">` ชื่อเดียวกัน กดเมนูบน Home แล้วรายการนั้น
 * จึงเคลื่อนไปเป็นแถวในแถบข้างให้เห็นต่อเนื่อง · **`id` ต้องไม่ซ้ำกันทั้งไฟล์**
 *
 * กลุ่มของหน้าที่เปิดอยู่หาจาก URL (`findModule`) ไม่ได้เก็บ state ไว้ที่ไหน —
 * เปิดลิงก์ตรง ๆ หรือกดรีเฟรชก็ได้แถบข้างของกลุ่มที่ถูกเสมอ
 *
 * เพิ่มเมนูใหม่ = เพิ่มรายการที่นี่ที่เดียว ทั้ง Home และแถบข้างตามเอง
 */

export type ModuleId = "driver" | "office" | "master";

export interface ModuleItem {
  /** ใช้เป็นชื่อ view transition ด้วย — ห้ามซ้ำข้ามกลุ่ม */
  id: string;
  label: string;
  desc: string;
  href: string;
  icon: LucideIcon;
  /** ยังไม่มีหน้าจริง — แสดงเป็น “เร็ว ๆ นี้” และกดไม่ได้ */
  soon?: boolean;
  /**
   * path ที่นับว่าเป็นเมนูนี้ เมื่อไม่ใช่ path ของ `href` เอง — เช่นทะเบียน พจส. ลิงก์ไปสาขา
   * ลาดกระบังแต่ต้องนับ `/desk/registry/saraburi` เป็นเมนูเดียวกันด้วย
   */
  match?: string;
  /**
   * เมนูย่อย (subgroup) — เมนูแม่กลายเป็นหัวข้อพับ/กาง ไม่ได้เป็นลิงก์เอง · ลูกใช้ `id`
   * เป็นชื่อ view transition เหมือนเมนูปกติ จึงห้ามซ้ำกับใครเช่นกัน · ซ้อนได้ชั้นเดียว
   */
  children?: ModuleItem[];
}

export interface ModuleMatch {
  group: ModuleGroup;
  item: ModuleItem;
  /** เมนูย่อยที่ตรง เมื่อ `item` เป็นหัวข้อของ subgroup */
  child?: ModuleItem;
}

export interface ModuleGroup {
  id: ModuleId;
  label: string;
  /** คำอธิบายบนการ์ดกลุ่มในหน้า Home */
  tagline: string;
  /** คำอธิบายบนหัวแผงเมนู / หัวแถบข้าง */
  caption: string;
  icon: LucideIcon;
  items: ModuleItem[];
}

export const MODULES: ModuleGroup[] = [
  {
    id: "driver",
    label: "พนักงานจัดส่ง",
    tagline: "พจส. · คำร้องเรียน · สรรหาและฝึกงานคนขับ",
    caption: "งานบุคคลของพนักงานจัดส่ง ตั้งแต่สรรหาจนถึงคำร้องเรียน",
    icon: Truck,
    items: [
      {
        id: "cases",
        label: "แจ้งข้อร้องเรียน",
        desc: "คิวคำร้องจาก พจส. · มอบหมาย · อนุมัติ · ปิดเรื่อง",
        href: "/desk/cases",
        icon: ClipboardList,
      },
      {
        id: "requisitions",
        label: "ขออัตราสรรหาพนักงาน",
        desc: "ใบขออัตรากำลังจากหน่วยงาน · ติดตามการสรรหา",
        href: "/recruitment/admin/requisitions",
        icon: BriefcaseBusiness,
      },
      {
        id: "trainees",
        label: "ติดตามฝึกงาน",
        desc: "ตารางฝึก · รถฝึก · ผลการฝึกรายวัน",
        href: "/recruitment/admin/trainees",
        icon: Route,
      },
      {
        id: "registry",
        label: "ทะเบียนประวัติ พจส.",
        desc: "ลาดกระบัง · สระบุรี",
        href: "/desk/registry/ladkrabang",
        match: "/desk/registry",
        icon: BookUser,
      },
    ],
  },
  {
    id: "office",
    label: "พนักงานองค์กร",
    tagline: "ข้อมูลพนักงาน",
    caption: "งานบุคคลของพนักงานสำนักงานและฝ่ายสนับสนุน",
    icon: Building2,
    items: [
      {
        id: "employee",
        label: "ข้อมูลพนักงาน",
        desc: "ค้นด้วยชื่อ รหัส หรือตำแหน่ง ทั้งบริษัท",
        href: "/desk/employee",
        icon: Users,
      },
    ],
  },
  {
    id: "master",
    label: "HR MASTER",
    tagline: "สิทธิ์การใช้งาน · การเชื่อมต่อระบบ",
    caption: "ค่าตั้งต้นที่ทุกโมดูลใช้ร่วมกัน",
    icon: Database,
    items: [
      {
        id: "payroll",
        label: "Pay Roll",
        desc: "รอบเงินเดือน · นำเข้าข้อมูลค่าจ้าง",
        href: "/payroll",
        icon: Wallet,
        // เมนูของระบบค่าจ้างเอง — ตรงกับ `lib/payroll/nav.ts` (เพิ่มที่นั่นเมื่อไหร่ ต้องเพิ่มที่นี่ด้วย)
        children: [
          {
            id: "payroll-overview",
            label: "ภาพรวมรอบจ่าย",
            desc: "รอบที่เปิดอยู่ และงานที่ต้องทำต่อ",
            href: "/payroll",
            icon: LayoutGrid,
          },
          {
            id: "payroll-intake",
            label: "รับข้อมูล",
            desc: "ไฟล์ที่แต่ละฝ่ายส่งเข้ามาในรอบนี้",
            href: "/payroll/intake",
            icon: Inbox,
          },
        ],
      },
      {
        id: "record-cases",
        label: "บันทึกเคส",
        desc: "เรื่องที่ HR รับแจ้งเอง แยกตามประเภท",
        href: "/desk/record-cases",
        icon: Bookmark,
      },
      {
        id: "permissions",
        label: "กำหนดสิทธิ์",
        desc: "ใครเข้าเมนูไหนได้บ้าง",
        href: "/desk/permissions",
        icon: ShieldCheck,
        soon: true,
      },
      {
        id: "api-docs",
        label: "Docs API",
        desc: "เอกสาร API และคอนโซลทดสอบ",
        href: "/recruitment/admin/settings/api-docs",
        icon: Code2,
      },
    ],
  },
];

export const moduleById = (id: string | null | undefined): ModuleGroup | undefined =>
  MODULES.find((m) => m.id === id);

const pathOf = (href: string) => href.split("?")[0];

/**
 * หน้าที่เปิดอยู่เป็นของกลุ่มไหน + เมนูไหน
 *
 * ลำดับการจับคู่: (1) path+query ตรงกันเป๊ะ (เมนูที่ชี้ด้วย query เช่น `?manage=`) ·
 * (2) path ขึ้นต้นด้วย `match` / href ที่ยาวที่สุด — เมนูที่ path ซ้อนกันได้ตัวที่เจาะจงกว่า
 * · ไม่ตรงอะไรเลยคืน `undefined` แล้วแถบข้างถอยไปใช้เมนูเดิมของระบบนั้น
 * · เมนูที่มี `children` เทียบที่ลูกแต่ละตัว (เช่น `/payroll/intake` ได้ “รับข้อมูล” ไม่ใช่ “ภาพรวมรอบจ่าย”)
 */
export function findModule(pathname: string, search = ""): ModuleMatch | undefined {
  const full = search ? `${pathname}?${search}` : pathname;
  const scoreOf = (item: ModuleItem) => {
    if (item.soon) return -1;
    const base = item.match ?? pathOf(item.href);
    if (item.href === full) return 10_000;
    if (!item.href.includes("?") && (pathname === base || pathname.startsWith(`${base}/`)))
      return base.length;
    return -1;
  };
  let best: (ModuleMatch & { score: number }) | undefined;

  for (const group of MODULES) {
    for (const item of group.items) {
      for (const child of item.children ?? [undefined]) {
        const score = scoreOf(child ?? item);
        if (score > (best?.score ?? -1)) best = { group, item, child, score };
      }
    }
  }
  return best ? { group: best.group, item: best.item, child: best.child } : undefined;
}
