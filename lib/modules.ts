import {
  BadgeCheck,
  Banknote,
  Bell,
  BookImage,
  BookUser,
  CalendarCheck,
  ChartColumn,
  FileText,
  Fuel,
  Gift,
  Globe,
  HandCoins,
  Handshake,
  Link2,
  MapPinned,
  Receipt,
  Settings,
  SlidersHorizontal,
  Tag,
  Upload,
  UserCog,
  Wrench,
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
  UserPlus,
  UserRoundSearch,
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

export type ModuleId = "driver" | "office" | "master" | "partner";

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
   * path ที่นับว่าเป็นเมนูนี้ เมื่อไม่ใช่ path ของ `href` เอง
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
        id: "new-hire",
        label: "พนักงานใหม่",
        desc: "ขออัตราสรรหา · ผู้สมัคร · ติดตามฝึกงาน",
        href: "/recruitment/admin/requisitions",
        icon: UserPlus,
        children: [
          {
            id: "requisitions",
            label: "ขออัตราสรรหาพนักงาน",
            desc: "ใบขออัตรากำลังจากหน่วยงาน · ติดตามการสรรหา",
            href: "/recruitment/admin/requisitions",
            icon: BriefcaseBusiness,
          },
          {
            id: "candidates",
            label: "ผู้สมัคร",
            desc: "ใบสมัคร · ติดต่อ · นัดสัมภาษณ์",
            href: "/recruitment/admin/candidates",
            icon: UserRoundSearch,
          },
          {
            id: "trainees",
            label: "ติดตามฝึกงาน",
            desc: "ตารางฝึก · รถฝึก · ผลการฝึกรายวัน",
            href: "/recruitment/admin/trainees",
            icon: Route,
          },
        ],
      },
      {
        id: "registry",
        label: "ทะเบียนประวัติ พจส.",
        desc: "ประวัติพนักงานขับรถทุกคน",
        href: "/recruitment/admin/drivers",
        icon: BookUser,
      },
      {
        id: "driver-links",
        label: "คนขับรถร่วม ↔ พจส.",
        desc: "จับคู่คนขับรถร่วมกับทะเบียน · ตัวเลขคนขับทั้งบริษัท",
        href: "/desk/driver-links",
        icon: Link2,
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
        label: "ค่าจ้างและสวัสดิการ",
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
  {
    /*
     * ระบบรถร่วม Mixer (ย้ายมาจาก mena-partner-driver) — ครบ 21 กลุ่มงานของระบบเดิม
     * จัดเป็น 5 หมวดตามแถบข้างของระบบเดิม (ระบบสัญญา / ขาย / โปรโมชั่น / เงินเดือน / ผู้ดูแล)
     * ให้หน้า Home ไม่ท่วม · `id` ขึ้นต้น `pt-` ทุกตัว กันชนกับเมนูของ hr (เช่น `payroll`)
     * · `/trucks` เป็นเว็บสาธารณะอยู่ที่ราก ไม่อยู่ใต้ `/partner`
     */
    id: "partner",
    label: "รถร่วม Mixer",
    tagline: "สัญญา · ขายรถ · เงินเดือนคนขับรถร่วม",
    caption: "ระบบรถร่วม ตั้งแต่ขายรถ ทำสัญญา จนถึงปิดงวดเงินเดือนคนขับรถร่วม",
    icon: Handshake,
    items: [
      {
        id: "pt-alerts",
        label: "แจ้งเตือนรถร่วม",
        desc: "เรื่องที่ต้องตามในระบบรถร่วม",
        href: "/partner/alerts",
        icon: Bell,
      },
      {
        id: "pt-contract",
        label: "ระบบสัญญา",
        desc: "คนขับ · รถ · ราคาขาย · สัญญา",
        href: "/partner/contracts",
        icon: FileText,
        children: [
          { id: "pt-drivers", label: "คนขับรถร่วม", desc: "ผ่อนอยู่ / ปิดงวดแล้ว / พ้นสภาพ", href: "/partner/drivers", icon: BookUser },
          { id: "pt-vehicles", label: "รถ", desc: "วิ่งงานอยู่ / พร้อมขาย / ระหว่างดำเนินการ", href: "/partner/vehicles", icon: Truck },
          { id: "pt-price-list", label: "ราคาขาย", desc: "ราคาขายรายคัน", href: "/partner/price-list", icon: Tag },
          { id: "pt-contracts", label: "สัญญา", desc: "สัญญาซื้อขาย ว่าจ้าง ค้ำประกัน", href: "/partner/contracts", icon: FileText },
        ],
      },
      {
        id: "pt-sales",
        label: "ระบบขาย",
        desc: "ดีล · ใบเสนอราคา · แคตตาล็อก · เว็บขายรถ",
        href: "/partner/quotations",
        icon: Receipt,
        children: [
          { id: "pt-quotations", label: "ดีล & ใบเสนอราคา", desc: "ไปป์ไลน์ ค่าคอม ทีมขาย", href: "/partner/quotations", icon: Receipt },
          { id: "pt-catalog", label: "Catalog รถ", desc: "แคตตาล็อกรายคัน PDF", href: "/partner/catalog", icon: BookImage },
          { id: "pt-trucks", label: "เว็บขายรถ", desc: "หน้าเว็บสาธารณะ", href: "/trucks", icon: Globe },
        ],
      },
      {
        id: "pt-promo",
        label: "โปรโมชั่น",
        desc: "งบซ่อม · PM · รายงานสรุปโปรฯ",
        href: "/partner/promotions",
        icon: Gift,
      },
      {
        id: "pt-pay",
        label: "เงินเดือนรถร่วม",
        desc: "ค่าเที่ยว · ค่าใช้จ่ายรถ · วันทำงาน · ปิดงวด",
        href: "/partner/payroll",
        icon: Banknote,
        children: [
          { id: "pt-trips", label: "เที่ยววิ่ง", desc: "เที่ยวรายสัญญา", href: "/partner/trips", icon: MapPinned },
          { id: "pt-trip-fuel", label: "ค่าเที่ยว & เชื้อเพลิง", desc: "สรุปจาก BI ต่อเดือน", href: "/partner/trip-fuel", icon: Fuel },
          { id: "pt-vehicle-cost", label: "ค่าใช้จ่ายรถ", desc: "ซ่อม · ยาง · ล้างรถ", href: "/partner/vehicle-cost", icon: Wrench },
          { id: "pt-insurance-tax", label: "ภาษี & ประกันภัย", desc: "ต่อภาษี ประกัน พรบ.", href: "/partner/insurance-tax", icon: BadgeCheck },
          { id: "pt-attendance", label: "วันทำงาน พจร.", desc: "วันทำงานรายเดือน", href: "/partner/attendance", icon: CalendarCheck },
          { id: "pt-payroll-extras", label: "รับ-หักอื่นๆ", desc: "รายการรับ/หักนอกสูตร", href: "/partner/payroll-extras", icon: SlidersHorizontal },
          { id: "pt-payroll", label: "เงินเดือน", desc: "คำนวณและปิดงวด", href: "/partner/payroll", icon: Banknote },
          { id: "pt-driver-ledger", label: "หนี้สิน & เงินสะสม", desc: "ยอดยกมา ผ่อนหนี้ เงินสำรอง", href: "/partner/driver-ledger", icon: HandCoins },
          { id: "pt-adjustments", label: "รายการปรับปรุง", desc: "ปรับยอดรายเดือน", href: "/partner/adjustments", icon: SlidersHorizontal },
          { id: "pt-reports", label: "รายงาน", desc: "รายงานรถร่วม", href: "/partner/reports", icon: ChartColumn },
        ],
      },
      {
        id: "pt-admin",
        label: "ผู้ดูแลรถร่วม",
        desc: "นำเข้า Excel · ข้อมูลบริษัท · รอบเดือน · ผู้ใช้ & สิทธิ์",
        href: "/partner/admin",
        icon: Settings,
        children: [
          { id: "pt-import", label: "นำเข้า Excel", desc: "นำเข้าข้อมูลจากไฟล์", href: "/partner/import", icon: Upload },
          { id: "pt-admin-company", label: "ข้อมูลบริษัท & ผู้ลงนาม", desc: "ใช้ในเอกสารสัญญา", href: "/partner/admin/company", icon: Building2 },
          { id: "pt-admin-month", label: "จัดการรอบเดือน", desc: "เปิด/ปิดรอบเดือน", href: "/partner/admin/month", icon: Settings },
          { id: "pt-admin-users", label: "ผู้ใช้ & สิทธิ์", desc: "บทบาท 6 ระดับของรถร่วม", href: "/partner/admin/users", icon: UserCog },
        ],
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
