import {
  BookUser,
  Bookmark,
  Building2,
  CarFront,
  ChartColumn,
  ClipboardList,
  ClipboardPenLine,
  Code2,
  Container,
  Database,
  House,
  Inbox,
  LayoutGrid,
  ShieldCheck,
  Truck,
  UserPlus,
  UserRoundSearch,
  Users,
  Wallet,
  Workflow,
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

/**
 * ค่าของ `soon` ทุกเมนูที่ปิดไว้ — ปิดเฉพาะ build จริง ตอน `next dev` เปิดให้ใช้ได้ตามปกติ
 * (`NODE_ENV` ถูกฝังตอน build จึงใช้ได้ทั้ง server และ client) · หน้าใต้เมนูที่ปิดควรกันเองด้วย
 * `if (SOON) notFound()` เพราะพิมพ์ URL ตรง ๆ ยังเข้าได้
 */
export const SOON = process.env.NODE_ENV !== "development";

export interface ModuleItem {
  /** ใช้เป็นชื่อ view transition ด้วย — ห้ามซ้ำข้ามกลุ่ม */
  id: string;
  label: string;
  desc: string;
  href: string;
  icon: LucideIcon;
  /** ยังไม่เปิดใช้ — แสดงเป็น “เร็ว ๆ นี้” และกดไม่ได้ · ใส่ `soon: SOON` (เปิดเองใน dev) */
  soon?: boolean;
  /**
   * path ที่นับว่าเป็นเมนูนี้ เมื่อไม่ใช่ path ของ `href` เอง
   */
  match?: string;
  /** path อื่นที่นับเป็นเมนูนี้ด้วย (หน้าเดียวกันคนละมุมมอง / เส้นทางเก่าที่ redirect มา) */
  also?: string[];
  /**
   * เมนูย่อย (subgroup) — เมนูแม่กลายเป็นหัวข้อพับ/กาง ไม่ได้เป็นลิงก์เอง · ลูกใช้ `id`
   * เป็นชื่อ view transition เหมือนเมนูปกติ จึงห้ามซ้ำกับใครเช่นกัน · ซ้อนได้ชั้นเดียว
   */
  children?: ModuleItem[];
  /**
   * สิทธิ์ย่อยในหน้าของเมนูนี้ (ปุ่ม/หน้าลึก) — ตั้งได้ที่ `/desk/permissions` เหมือนเมนู แต่ไม่ขึ้นบน Home
   * หรือแถบข้าง · `id` ห้ามซ้ำกับเมนูใดทั้งไฟล์ · หน้าที่ใช้ต้องเช็กเอง (`canSeeMenu` / `useCanSee`)
   */
  actions?: ModuleAction[];
  /**
   * หมวดย่อยบนหน้า Home (`id` ใน `ModuleGroup.sections`) — ไม่ใส่ = หมวดแรกของกลุ่ม · ไม่มีผลกับแถบข้าง
   * เมนูที่มี `children` แตกลูกออกเป็นไอคอนแอปในหมวดนี้
   */
  section?: string;
}

export interface ModuleAction {
  id: string;
  label: string;
  desc: string;
  /** ค่าเริ่มต้น (ทุกคน) = **ไม่เห็น** — ต้องเปิดให้ฝ่าย/แผนกเองที่ `/desk/permissions` */
  defaultOff?: boolean;
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
  /** หมวดย่อยของไอคอนแอปบนหน้า Home เรียงตามลำดับนี้ (`ModuleItem.section`) · หมวดที่ไม่เหลือเมนูไม่แสดง */
  sections?: { id: string; label: string }[];
  /**
   * ซ่อนจากหน้า Home และ “กลุ่มงานอื่น” ในแถบข้าง — หน้าในยังเปิดตรงด้วย URL ได้ และ
   * `findModule` ยังหาเจอ (แถบข้างของหน้านั้นไม่หาย)
   */
  hidden?: boolean;
}

export const MODULES: ModuleGroup[] = [
  {
    id: "driver",
    label: "พนักงานจัดส่ง",
    tagline: "พจส. · คำร้องเรียน · สรรหาและฝึกงานคนขับ · สถานะรถ",
    caption: "งานบุคคลของพนักงานจัดส่ง ตั้งแต่สรรหาจนถึงคำร้องเรียน",
    icon: Truck,
    sections: [
      // 18 พ.ย. 2569 · Bew — ทะเบียน / สถานะรถ / แดชบอร์ด ย้ายมาอยู่ใต้ “สรรหาและพนักงาน” · ร้องเรียนแยกเป็น “ข้อมูลตอบกลับ”
      { id: "recruit", label: "สรรหาและพนักงาน" },
      { id: "feedback", label: "ข้อมูลตอบกลับ" },
    ],
    items: [
      {
        id: "cases",
        label: "แจ้งข้อร้องเรียน",
        desc: "คิวคำร้องจาก พจส. · มอบหมาย · อนุมัติ · ปิดเรื่อง",
        href: "/desk/cases",
        section: "feedback",
        icon: ClipboardList,
      },
      {
        id: "new-hire",
        label: "พนักงานใหม่",
        desc: "อัตราว่าง · ผู้สมัคร · ฝึกงาน · รับรถ",
        href: "/recruitment/admin/onboarding",
        icon: UserPlus,
        section: "recruit",
        children: [
          {
            /* หน้าเดียวแทน ขออัตราสรรหา + Onboarding + ติดตามฝึกงาน (14 ต.ค. 2026) —
               ตารางรายวันเป็นมุมมองหนึ่งของหน้านี้ (`also`) */
            id: "onboarding",
            label: "ติดตามพนักงานใหม่",
            desc: "อัตราว่างจนรับรถ ในตารางเดียว",
            href: "/recruitment/admin/onboarding",
            icon: Workflow,
            also: ["/recruitment/admin/trainees", "/recruitment/admin/requisitions"],
          },
          {
            id: "candidates",
            label: "ผู้สมัคร",
            desc: "ใบสมัคร · ติดต่อ · นัดสัมภาษณ์",
            href: "/recruitment/admin/candidates",
            icon: UserRoundSearch,
            actions: [
              {
                /* Bew 11 พ.ย. 2569 — ปกติเห็นแค่แท็บสาขาของตัวเอง (site ใน NCAC) · เปิดให้ RC MASS */
                id: "recruit-all-sites",
                label: "ดูทุกสาขา",
                desc: "หน้าผู้สมัคร + ทะเบียน พจส. · ไม่เห็น = เห็นแค่แท็บสาขาของตัวเอง (ลาดกระบัง หรือ สระบุรี+บางปะกง) · คนที่ site ไม่ใช่สองสาขานี้เห็นทุกแท็บเสมอ",
                defaultOff: true,
              },
            ],
          },
        ],
      },
      {
        id: "registry",
        label: "ทะเบียนประวัติ พจส.",
        desc: "ประวัติพนักงานขับรถทุกคน",
        href: "/recruitment/admin/drivers",
        section: "recruit",
        icon: BookUser,
        actions: [
          {
            id: "registry-profile",
            label: "ดูเอกสาร · เพิ่ม/แก้ไขทะเบียน",
            desc: "ไม่เห็น = ดูได้อย่างเดียว · เปิดหน้าประวัติรายคนได้แต่ไม่เห็นแท็บเอกสาร · เพิ่ม/นำเข้า/แก้ข้อมูล/แก้รูป/เปลี่ยนสถานะไม่ได้ (ส่งออก Excel ได้)",
          },
          {
            id: "exit-interview",
            label: "Exit Interview พนักงานพ้นสภาพ",
            desc: "เห็น = เปิด/บันทึกคำตอบสัมภาษณ์ Wave 1–2 รายได้ และส่งออก DataLog · ค่าเริ่มต้นไม่เห็น เปิดให้ HRD + Process Excellence · คนอื่นเห็นแค่รหัสสาเหตุ",
            defaultOff: true,
          },
        ],
      },
      {
        id: "trucks",
        label: "สถานะรถ",
        desc: "รถทุกคัน · คนขับวันนี้ · งานซ่อม ในภาพเดียว",
        href: "/recruitment/admin/trucks",
        section: "recruit",
        icon: Container,
      },
      {
        id: "dashboard",
        label: "แดชบอร์ด",
        desc: "กราฟกำลังคน พจส. รายลูกค้าและแพล้นท์",
        href: "/recruitment/admin/dashboard",
        section: "recruit",
        icon: ChartColumn,
        actions: [
          {
            /* Bew 15 พ.ย. 2569 — RC Owner · Target Truck ของหมวด Manpower ตั้งเอง */
            id: "dashboard-targets",
            label: "แก้เป้า Manpower",
            desc: "ไม่เห็น = ดูแดชบอร์ดได้อย่างเดียว · ตั้ง RC Owner / Target Truck ต่อกลุ่มงาน × ลูกค้าไม่ได้",
          },
        ],
      },
    ],
  },
  {
    id: "office",
    label: "พนักงานองค์กร",
    tagline: "ข้อมูลพนักงาน",
    caption: "งานบุคคลของพนักงานสำนักงานและฝ่ายสนับสนุน",
    icon: Building2,
    // ซ่อนไว้ก่อน (2 พ.ย. 2026) — ยังไม่พร้อมให้ใช้
    hidden: true,
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
    sections: [
      // 25 พ.ย. 2569 · Bew — หมวด “บริการ” แยกจากงาน HR อยู่บนสุด · เริ่มที่จอดรถบริษัท
      { id: "facility", label: "บริการ" },
      { id: "service", label: "จัดการงาน HR" },
      { id: "settings", label: "ตั้งค่าระบบ" },
    ],
    items: [
      {
        /* บริการจอดรถบริษัท (24 พ.ย. 2569) — เฟส 1 ลงทะเบียนรถ + ออกบัตรจอด · ขอค้างคืน/รปภ. ตรวจ เป็นเฟสถัดไป */
        id: "parking",
        label: "จอดรถบริษัท",
        desc: "ลงทะเบียนรถ · ตรวจกรรมสิทธิ์ · ออกบัตรจอด",
        href: "/desk/parking",
        section: "facility",
        icon: CarFront,
        // 25 พ.ย. 2569 · Bew — เปิดใช้บน prod แล้ว (เดิม `soon: SOON`)
        actions: [
          {
            /* Bew 24 พ.ย. 2569 — ตารางทะเบียนเห็นเฉพาะ HOD + Process Excellence · คนอื่นเห็นแค่บัตรของตัวเอง */
            id: "parking-admin",
            label: "จัดการทะเบียนรถ",
            desc: "เห็น = ตารางรถทุกคัน · อนุมัติ/ส่งกลับ/ออกบัตร/ยกเลิก · เปิดให้ HOD + Process Excellence · ไม่เห็น = เห็นแค่บัตรจอดของตัวเองและปุ่มลงทะเบียน",
            defaultOff: true,
          },
          {
            /* Bew 25 พ.ย. 2569 — สแกน QR บนบัตรแล้วเห็นข้อมูลรถ (ต้องล็อกอิน) · ทุกการสแกนเก็บ log */
            id: "parking-verify",
            label: "ตรวจบัตรจอด (สแกน QR)",
            desc: "เห็น = สแกน QR บนบัตรจอดแล้วเห็นสถานะ รูปรถ ทะเบียน และผู้รับผิดชอบ · เปิดให้ รปภ. + HR · ผู้ดูแลทะเบียนรถและเจ้าของรถเห็นได้อยู่แล้ว",
            defaultOff: true,
          },
        ],
      },
      {
        id: "payroll",
        label: "ค่าจ้างและสวัสดิการ",
        desc: "รอบเงินเดือน · นำเข้าข้อมูลค่าจ้าง",
        href: "/payroll",
        icon: Wallet,
        section: "service",
        soon: SOON,
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
        section: "service",
        icon: Bookmark,
      },
      {
        id: "survey",
        label: "แบบสอบถาม",
        desc: "ผลแบบสำรวจความเห็น พจส.",
        href: "/desk/survey",
        section: "service",
        icon: ClipboardPenLine,
      },
      {
        /* ห้องเช่าของบริษัท (3 พ.ย. 2569) — แทนไฟล์คุม Excel + เมนูห้องเช่าของ Mena-Next · คนมาจากทะเบียน พจส. */
        id: "rentals",
        label: "จัดการห้องเช่า",
        desc: "ห้องเช่าบริษัท · ผู้พัก · ค่าเช่ารายเดือน",
        href: "/desk/rentals",
        section: "service",
        icon: House,
      },
      {
        id: "permissions",
        label: "กำหนดสิทธิ์",
        desc: "ใครเข้าเมนูไหนได้บ้าง",
        href: "/desk/permissions",
        section: "settings",
        icon: ShieldCheck,
      },
      {
        id: "api-docs",
        label: "Docs API",
        desc: "เอกสาร API และคอนโซลทดสอบ",
        href: "/recruitment/admin/settings/api-docs",
        section: "settings",
        icon: Code2,
      },
    ],
  },
];

/** หมวดย่อยของกลุ่ม → ไอคอนแอป · เมนูที่มี subgroup แตกลูกเป็นแอปในหมวดเดียวกัน (ยกเว้นตอน `soon` = ไอคอนเดียว) */
export type ModuleSection = { id: string; label?: string; apps: { item: ModuleItem; parent?: ModuleItem }[] };

/**
 * หมวดย่อยตามที่แสดงบนหน้า Home — ใช้ทั้งการ์ดกลุ่มบน Home และเมนูสลับหน้าบนแถบบนของหน้าใน
 * (`ShellHeader`) สองที่จึงเรียงเมนูตรงกันเสมอ · ส่งกลุ่มที่กรองสิทธิ์แล้วเข้ามา
 */
export function moduleSections(group: ModuleGroup): ModuleSection[] {
  const defs = group.sections?.length ? group.sections : [{ id: "", label: undefined }];
  const out: ModuleSection[] = defs.map((d) => ({ id: d.id, label: d.label, apps: [] }));
  for (const item of group.items) {
    const target = out.find((sec) => sec.id === item.section) ?? out[0];
    if (item.children && !item.soon) target.apps.push(...item.children.map((child) => ({ item: child, parent: item })));
    else target.apps.push({ item });
  }
  // เมนูที่ยังไม่เปิดไปอยู่ท้ายหมวด · หมวดที่ไม่เหลือเมนู (ถูกซ่อนสิทธิ์หมด) ไม่แสดง
  for (const sec of out) sec.apps.sort((x, y) => Number(Boolean(x.item.soon)) - Number(Boolean(y.item.soon)));
  return out.filter((sec) => sec.apps.length > 0);
}

/** กลุ่มที่แสดงบนหน้า Home และในลิงก์ “กลุ่มงานอื่น” (ไม่รวม `hidden`) */
export const VISIBLE_MODULES = MODULES.filter((m) => !m.hidden);

export const moduleById = (id: string | null | undefined): ModuleGroup | undefined =>
  VISIBLE_MODULES.find((m) => m.id === id);

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
    const other = item.also?.find((p) => pathname === p || pathname.startsWith(`${p}/`));
    return other ? other.length : -1;
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
