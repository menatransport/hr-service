import Link from "next/link"
import {
  Users, Truck, FileText, Warehouse, ClipboardList, CalendarCheck,
  Tag, ShieldCheck, Wrench, ArrowRight, BookOpen, AlertTriangle,
  CheckCircle2, Upload, Banknote, BadgeCheck, HandCoins, FileDown,
} from "lucide-react"
import { ModuleStatusBoard } from "@/components/partner/module-status-board"
import { AlertsWidget } from "@/components/partner/alerts-widget"
import { RoleMatrix } from "@/components/partner/role-matrix"

/**
 * หน้าหลัก — สรุป flow การทำงานของทีม + คู่มือประกอบต่อโมดูล
 * เนื้อหาอิง docs/PLATFORM-ROADMAP.md (ปรับปรุงเมื่อกติกาเปลี่ยน)
 */

const FLOW = [
  {
    no: "1",
    icon: <Users className="w-4 h-4" />,
    title: "ข้อมูลหลัก",
    desc: "คนขับ (บัตร ปชช./วันเกิด/ที่อยู่/บัญชี) · รถ (ยี่ห้อ รุ่น เลขตัวถัง เลขเครื่อง) · ราคาขาย (เพิ่ม/แก้ไขได้ในหน้า)",
    links: [
      { href: "/partner/drivers", label: "พนักงานขับรถ" },
      { href: "/partner/vehicles", label: "ทะเบียนรถ" },
      { href: "/partner/price-list", label: "ราคาขาย" },
    ],
  },
  {
    no: "2",
    icon: <FileText className="w-4 h-4" />,
    title: "ทำสัญญา",
    desc: "สร้างสัญญา (auto-fill จากข้อมูลหลัก) → เช็ค checklist เขียว → โหลดเอกสาร PDF/.docx 5 ชนิดให้เซ็น → ตั้งโปรโมชั่น",
    links: [
      { href: "/partner/contracts/new", label: "สร้างสัญญาใหม่" },
      { href: "/partner/contracts", label: "สัญญาทั้งหมด" },
    ],
  },
  {
    no: "3",
    icon: <Warehouse className="w-4 h-4" />,
    title: "งานประจำวัน",
    desc: "เที่ยววิ่ง · ค่าใช้จ่ายรถ (นำเข้าเบิกอะไหล่/รับสภาพหนี้ + จับคู่ MR หักโปรซ่อม/PM) · ภาษี & ประกันภัย (ต่ออายุตามทะเบียน)",
    links: [
      { href: "/partner/trips", label: "เที่ยววิ่ง" },
      { href: "/partner/vehicle-cost?tab=merged", label: "จับคู่หักโปรฯ" },
      { href: "/partner/insurance-tax", label: "ภาษี & ประกันภัย" },
    ],
  },
  {
    no: "4",
    icon: <Banknote className="w-4 h-4" />,
    title: "หนี้สิน & เงินเดือน",
    desc: "ตั้งหนี้ผ่อน/เงินสะสม (แปลงจากประกัน·พรบ·ภาษี·รับสภาพหนี้) → payroll รวมรายได้เที่ยว − หักทุกประเภทอัตโนมัติ → ตรวจสลิป",
    links: [
      { href: "/partner/driver-ledger", label: "หนี้สิน & เงินสะสม" },
      { href: "/partner/payroll", label: "เงินเดือน" },
    ],
  },
  {
    no: "5",
    icon: <CalendarCheck className="w-4 h-4" />,
    title: "ปิดเดือน & รายงาน",
    desc: "อนุมัติ (ตัดยอดหนี้/สะสมของเดือนจริง) → พิมพ์สลิปทั้งชุด → ปิดรอบเดือน → ดูรายงานประจำปี",
    links: [
      { href: "/partner/admin/month", label: "จัดการรอบเดือน" },
      { href: "/partner/reports", label: "รายงาน" },
    ],
  },
]

const GUIDES: {
  icon: React.ReactNode
  title: string
  href: string
  steps: string[]
}[] = [
  {
    icon: <FileDown className="w-3.5 h-3.5" />,
    title: "สัญญา + โหลดเอกสาร (PDF/.docx)",
    href: "/partner/contracts",
    steps: [
      "สร้างสัญญา: เลือกคนขับ + รถ → ราคา/งวด ดึงจาก price-list อัตโนมัติ · รหัสสัญญา gen ต่อ +1 ให้เอง (เช่น MTM191 → MTM192)",
      "แถบเหลืองบอกช่องที่ยังขาด — ทุกข้อมูลในสัญญาจำเป็น (กรอง “ข้อมูลครบ/ไม่ครบ” + “สถานะเอกสาร” ได้ที่หน้าสัญญา)",
      "4 ชนิดสร้างอัตโนมัติ: ซื้อขาย · แนบท้ายโปรโมชั่น · ว่าจ้าง · ค้ำประกัน — “โหลด PDF/.docx” (ฟอนต์ Cordia + แนบรูปบัตร/ทะเบียน/ผู้ค้ำเป็นหน้าท้าย) · เปิดเจ้าหนี้ = โหลดแบบฟอร์มเปล่าให้กรอก",
      "แนบไฟล์ที่เซ็นแล้วกลับเข้าสัญญาได้ครบ (ลบ/เปลี่ยนไฟล์ได้) · ลบสัญญาถาวรไม่ได้ — ใช้ “ยกเลิกสัญญา” เท่านั้น · มีปุ่ม 🕐 ดูประวัติการแก้ไข",
    ],
  },
  {
    icon: <BadgeCheck className="w-3.5 h-3.5" />,
    title: "ภาษี & ประกันภัย (ตามทะเบียน)",
    href: "/partner/insurance-tax",
    steps: [
      "แยก 5 รายการต่อคัน: ประกันภัย · พรบ. · ภาษีทะเบียน · ตรวจสภาพ · ประกันภาคสมัครใจ (บุคคล) — แต่ละรายการมีวันหมดอายุ + งวดหักของตัวเอง",
      "ตารางโชว์สถานะรายรายการต่อคัน (🟢ใช้งาน 🟡ใกล้หมด ≤60วัน 🔴หมดแล้ว) — ใกล้หมดจะขึ้นแจ้งเตือนหน้าแรก",
      "กด “จัดการ” → หน้าเต็มต่อคัน: ต่ออายุรายรายการ/ทั้งชุด · แนบกรมธรรม์ · ดูประวัติทุกปี",
      "ปุ่ม “ตั้งหนี้ผ่อน” แปลงเบี้ยเป็นหนี้ผ่อนใน “หนี้สิน & เงินสะสม” (ยกเลิกงวดหักฝั่งนี้ กันหักซ้ำ)",
    ],
  },
  {
    icon: <HandCoins className="w-3.5 h-3.5" />,
    title: "หนี้สิน & เงินสะสม พขร.",
    href: "/partner/driver-ledger",
    steps: [
      "หนี้: ตั้งยอด → ผ่อนรายเดือนจนหมด → ปิดอัตโนมัติ (ระบุ “ผ่อนมาแล้ว” สำหรับหนี้เก่าได้)",
      "เงินสะสม (เช่น ค่ายาง): หักสะสมทุกเดือนถึงเป้า แล้วถอนใช้เมื่อเกิดค่าใช้จ่ายจริง",
      "หนี้เดินตามยอดคงเหลือ — ข้ามงวด/พัก/หักบางส่วนได้ (บันทึกเหตุผล) แล้วเลื่อนงวดจบเอง",
      "payroll หักผลรวมทุกก้อนของเดือน — ตัดยอดจริงตอนปิดรอบเดือน",
    ],
  },
  {
    icon: <Tag className="w-3.5 h-3.5" />,
    title: "โปรโมชั่น (โปร 1/2/3)",
    href: "/partner/promotions",
    steps: [
      "หน้ารวม: เห็นชื่อ พขร. + งบซ่อม/PM ที่ใช้ไปต่อคัน (เลขเดียวกับหน้าค่าใช้จ่ายรถ) + ปุ่ม “การใช้สิทธิ์” — ค้นด้วยทะเบียนหรือชื่อ พขร. ได้",
      "กติกาสำคัญ: งบจะถูกตัด เฉพาะเมื่อทีมระบุ — ติ๊กจากรายการเบิก หรือกด “ยืนยันตัดงบ”",
      "ประวัติจาก Excel ที่ยังไม่ยืนยัน = ป้ายเหลือง “รอยืนยัน” (ยังไม่หักวงเงิน)",
      "โปร 3 (PM): เพดาน PM/ปี ตั้งตามยี่ห้อรถ (SANY 15,441 · FAW 12,761 · HINO 12,011 · ISUZU 11,826 · NISSAN/FOTON 10,070) — นับรอบปีจากวันเริ่มสัญญาของแต่ละคัน",
    ],
  },
  {
    icon: <Wrench className="w-3.5 h-3.5" />,
    title: "ค่าใช้จ่ายรถ (4 แท็บ + นำเข้า Excel)",
    href: "/partner/vehicle-cost",
    steps: [
      "ค่าซ่อม/บำรุง/ยาง: บันทึกรายจ่ายต่อสัญญา · ใบรับสภาพหนี้: ใบรับผิด พขร. พร้อมงวดผ่อน (กรอง ซ่อม/ยาง/อุบัติเหตุ)",
      "การเคลื่อนไหวของสินค้า: รายการเบิกอะไหล่จากคลัง",
      "นำเข้า Excel (รับสภาพหนี้ / การเคลื่อนไหวของสินค้า) อยู่ในแท็บของแต่ละอย่างแล้ว — กดปุ่ม “นำเข้า Excel” มุมขวา",
      "แท็บ “ใบรับสภาพหนี้ + รายละเอียด”: จับคู่ MR → ติ๊ก [โปรซ่อม][PM1][PM2] → บันทึก = ตัดงบจริง",
    ],
  },
  {
    icon: <ClipboardList className="w-3.5 h-3.5" />,
    title: "เที่ยววิ่ง → เงินเดือน",
    href: "/partner/payroll",
    steps: [
      "นำเข้าเที่ยววิ่งรายเดือน (ผูก contractCode อัตโนมัติ)",
      "หน้าเงินเดือนคำนวณ: รายได้เที่ยว + OT − รายการหักทุกประเภท (รวมหนี้/เงินสะสม/ภาษี-ประกัน)",
      "ตรวจสลิปรายคน → แก้ที่ต้นทางถ้าผิด → รันใหม่",
      "พิมพ์สลิปรายใบ หรือทั้งชุด (print-all)",
    ],
  },
  {
    icon: <Users className="w-3.5 h-3.5" />,
    title: "ข้อมูลหลัก (Master Data)",
    href: "/partner/drivers",
    steps: [
      "คนขับ: กรอก บัตร ปชช. / วันเกิด / ที่อยู่ + แนบรูปโปรไฟล์ / สมุดบัญชี / ทวิ 50 — รหัสพนักงาน gen +1 ให้เอง · รหัสสัญญาลิงก์ไปหน้าสัญญาได้",
      "รถ: กรอกสเปคจากเล่มทะเบียน (ยี่ห้อ รุ่น เลขตัวถัง เลขเครื่อง สี วันจด) · แยก Mixer/Trailer · กันทะเบียนซ้ำอัตโนมัติ",
      "ราคาขาย: ดาวน์/งวด/ไฟแนนซ์ ต่อทะเบียน — เพิ่ม/แก้ในหน้าได้ · สัญญาใหม่ดึงจากตรงนี้",
    ],
  },
  {
    icon: <Upload className="w-3.5 h-3.5" />,
    title: "นำเข้า Excel เงินเดือน",
    href: "/partner/import",
    steps: [
      "หน้า “นำเข้า Excel” เหลือเฉพาะ Payroll เงินเดือนรายเดือน",
      "อัปโหลด → ตรวจ preview (เห็นยอดสุทธิ + คนที่ติดลบ) → ยืนยัน",
      "รับสภาพหนี้ / การเคลื่อนไหวของสินค้า ย้ายไปนำเข้าที่หน้า “ค่าใช้จ่ายรถ” แล้ว",
    ],
  },
]

const RULES = [
  { icon: <BadgeCheck className="w-3.5 h-3.5 text-emerald-400" />, text: "ภาษี/ประกันเป็นของ “ทะเบียนรถ” ไม่ใช่ของสัญญา — ต่ออายุแยกรายรายการ (ประกัน·พรบ·ภาษี·ตรวจสภาพ·ประกันสมัครใจบุคคล) แต่ละรายการมีวันหมดอายุ + งวดหักของตัวเอง" },
  { icon: <HandCoins className="w-3.5 h-3.5 text-emerald-400" />, text: "หนี้/เงินสะสม พขร. เดินตามยอดคงเหลือ ไม่ยึดปฏิทิน — ข้ามงวด/พักได้ แล้วเลื่อนงวดจบเอง; ตัดยอดจริงตอนปิดรอบเดือน" },
  { icon: <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />, text: "งบโปรฯ (ซ่อม/PM) ตัดเฉพาะรายการที่ทีมระบุแล้วเท่านั้น — ประวัติเก่าที่ยังไม่ยืนยันไม่หักวงเงิน" },
  { icon: <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />, text: "เลข MR เดียวกันนับครั้งเดียวเสมอ (ใบเคลม Excel กับรายการเบิกคลังไม่ซ้ำกัน)" },
  { icon: <CalendarCheck className="w-3.5 h-3.5 text-purple-400" />, text: "เพดาน PM นับเป็นรอบปีจากวันเริ่มสัญญาของแต่ละคัน (ครบรอบปีสัญญา = ขึ้นรอบใหม่) / วงเงินซ่อมนับตลอดอายุสัญญา" },
  { icon: <FileDown className="w-3.5 h-3.5 text-rose-400" />, text: "เอกสารสัญญาโหลดเป็น PDF/.docx ได้เลย (5 ชนิด, ฟอนต์ Cordia ตรงต้นฉบับ) — ไม่ต้องพิมพ์ผ่านเบราว์เซอร์แล้ว" },
  { icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />, text: "ทุกข้อมูลที่ปรากฏในสัญญาจำเป็นต้องกรอก — ช่องที่ขาดจะพิมพ์เป็นเส้นประให้เติมมือ" },
  { icon: <Truck className="w-3.5 h-3.5 text-zinc-400" />, text: "ทะเบียนรถเก็บแบบมีคำนำหน้า (สบ.71-1959) — ระบบจับคู่ให้อัตโนมัติทุกหน้า และกันบันทึกทะเบียนซ้ำ" },
  { icon: <FileDown className="w-3.5 h-3.5 text-emerald-400" />, text: "ทุกหน้าข้อมูล (สัญญา · รถ · คนขับ · โปรฯ · เงินเดือน) โหลด Excel ได้ และมีปุ่ม 🕐 “ประวัติการแก้ไข” บันทึกว่าใครแก้อะไรเมื่อไหร่" },
  { icon: <BadgeCheck className="w-3.5 h-3.5 text-emerald-400" />, text: "รหัสสัญญา / รหัสพนักงาน สร้างต่อเลขให้อัตโนมัติ (+1) · สัญญาลบถาวรไม่ได้ — ใช้ “ยกเลิกสัญญา” เท่านั้น กันข้อมูลสูญ" },
]

export default function HomePage() {
  return (
    <div className="max-w-5xl mx-auto py-6 space-y-8">
      {/* header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-1">MENA Partner · รถร่วม Mixer</p>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Flow การทำงาน & คู่มือระบบ</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            ระบบหลักของทีมรถร่วม — สัญญา · ข้อมูลหลัก · เที่ยววิ่ง · โปรโมชั่น · ค่าใช้จ่าย · ภาษี & ประกันภัย · หนี้สิน & เงินสะสม · เงินเดือน
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5">
          <BookOpen className="w-3.5 h-3.5" /> คู่มือฉบับเต็ม: docs/PLATFORM-ROADMAP.md
        </span>
      </div>

      {/* ต้องดูด่วน — แจ้งเตือนรวม (เงินติดลบ/ประกันหมด/ค้างงวด/วงเงินซ่อม) */}
      <AlertsWidget />

      {/* ── flow pipeline ── */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3 uppercase tracking-wide">
          Flow หลัก 5 ขั้น
        </h2>
        <div className="grid md:grid-cols-5 gap-3">
          {FLOW.map((s, i) => (
            <div key={s.no} className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 flex flex-col">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-semibold flex items-center justify-center shrink-0">{s.no}</span>
                <span className="text-emerald-600 dark:text-emerald-400">{s.icon}</span>
              </div>
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{s.title}</p>
              <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400 mt-1 flex-1">{s.desc}</p>
              <div className="flex flex-wrap gap-1 mt-3">
                {s.links.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:underline bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900 rounded px-1.5 py-0.5"
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
              {i < FLOW.length - 1 && (
                <ArrowRight className="hidden md:block absolute -right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-300 dark:text-zinc-600 z-10" />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── สถานะการใช้งานแต่ละระบบ (ติ๊กข้อมูลครบ + วันคาดเสร็จ ได้จริง) ── */}
      <ModuleStatusBoard />

      {/* ── บทบาท & สิทธิ์ (สร้างจาก lib/rbac.ts อัตโนมัติ) ── */}
      <RoleMatrix />

      {/* ── business rules ── */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3 uppercase tracking-wide">
          กติกาสำคัญของระบบ
        </h2>
        <ul className="space-y-2">
          {RULES.map((r, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[13px] text-zinc-600 dark:text-zinc-300">
              <span className="mt-0.5 shrink-0">{r.icon}</span>
              {r.text}
            </li>
          ))}
        </ul>
      </section>

      {/* ── per-module guides ── */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3 uppercase tracking-wide">
          คู่มือประกอบต่อโมดูล
        </h2>
        <div className="grid md:grid-cols-2 gap-3">
          {GUIDES.map((g) => (
            <div key={g.title} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2.5">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                  <span className="text-emerald-600 dark:text-emerald-400">{g.icon}</span>
                  {g.title}
                </span>
                <Link href={g.href} className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline">
                  เปิดหน้า <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <ol className="space-y-1.5">
                {g.steps.map((st, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                    <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 shrink-0 w-3">{i + 1}.</span>
                    {st}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 text-center pb-4">
        MENA Partner Platform · อัปเดตคู่มือนี้ได้ที่ <span className="font-mono">app/page.tsx</span> · แผนพัฒนาระยะยาว: <span className="font-mono">docs/PLATFORM-ROADMAP.md</span>
      </p>
    </div>
  )
}
