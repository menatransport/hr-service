// สถานะความพร้อมใช้งานของแต่ละโมดูล — ใช้ร่วมกันทั้งหน้าแรก (app/page.tsx) และ sidebar
// แก้ที่เดียวสะท้อนทุกที่. โมดูลที่ไม่อยู่ใน map = "dev" (อยู่ระหว่างการพัฒนา) อัตโนมัติ

export type ModuleStatus = "ready" | "testing" | "dev"

/** สถานะต่อ path — ระบุเฉพาะที่พร้อม/กำลังทดสอบ ที่เหลือ default = dev */
export const MODULE_STATUS: Record<string, ModuleStatus> = {
  "/partner":            "ready", // หน้าหลัก/คู่มือ
  // ข้อมูลหลัก — พร้อมใช้งานแล้ว
  "/partner/drivers":            "ready",
  "/partner/drivers?status=exit": "ready",
  "/partner/vehicles":           "ready",
  "/partner/price-list":         "ready",
  // สัญญา — พร้อมใช้งานแล้ว
  "/partner/contracts":          "ready",
  // ระบบขาย — ใบเสนอราคา/CRM (เฟส 1) กำลังทดสอบ
  "/partner/quotations":         "testing",
  // Catalog รายคัน (PDF อัตโนมัติ) — กำลังทดสอบ
  "/partner/catalog":            "testing",
  // เว็บขายรถสาธารณะ (ลูกค้าเห็น) — ใช้งานจริงแล้ว
  "/trucks":             "ready",
  // งานประจำวัน — พร้อมใช้งานแล้ว
  "/partner/vehicle-cost":       "ready",
  "/partner/insurance-tax":      "ready",
  "/partner/promotions":         "ready",
  // รายงานสรุปยอดโปรโมชั่น — พร้อมใช้งาน
  "/partner/reports/promotions": "ready",
  // หนี้สิน & เงินสะสม พขร. — กำลังทดสอบ
  "/partner/driver-ledger":      "testing",
  // ค่าเที่ยว & เชื้อเพลิง (payroll เฟส 1) — กำลังทดสอบ
  "/partner/trip-fuel":          "testing",
  // วันทำงาน พจร. (payroll เฟส 2) — กำลังทดสอบ
  "/partner/attendance":         "testing",
  // รับ-หักอื่นๆ (payroll เฟส 4) — กำลังทดสอบ
  "/partner/payroll-extras":     "testing",
  // เงินเดือน (เฟส 5 parallel run ผ่าน 112/112) — กำลังทดสอบ
  "/partner/payroll":            "testing",
  // SOP/WI ปิดงวด — พร้อมใช้
  "/partner/payroll/sop":        "ready",
  // ที่เหลือ (เที่ยววิ่ง · เงินเดือน · รายการปรับปรุง · รายงาน · นำเข้า Excel · จัดการรอบเดือน) = dev
}

export const statusOf = (href: string): ModuleStatus => MODULE_STATUS[href] ?? "dev"

export const STATUS_META: Record<ModuleStatus, {
  label: string
  short: string
  dot: string            // สีจุด (sidebar)
  pill: string           // คลาส badge เต็ม (หน้าแรก)
}> = {
  ready: {
    label: "พร้อมใช้งานแล้ว",
    short: "พร้อมใช้",
    dot: "bg-emerald-500",
    pill: "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800",
  },
  testing: {
    label: "กำลังทดสอบ",
    short: "ทดสอบ",
    dot: "bg-amber-500",
    pill: "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800",
  },
  dev: {
    label: "อยู่ระหว่างการพัฒนา",
    short: "กำลังพัฒนา",
    dot: "bg-zinc-400 dark:bg-zinc-600",
    pill: "text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700",
  },
}
