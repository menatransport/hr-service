/**
 * ถ้อยคำโปรฯ 3 ต่อ — **ที่เดียวทั้งระบบ**: โปสเตอร์ (/catalog/poster), หน้าเว็บสาธารณะ (/trucks), Catalog PDF
 * ถ้อยคำตามที่ฝ่ายขายเคาะ (2026-09-21) — ตัวเลขดึงจาก promotion_master
 * ต่อที่ 1: งวดที่ฟรี = k×(N+M) จากเงื่อนไข "N ฟรี M" ตามจำนวนครั้งที่ฟรี (9 ฟรี 1 × 7 ครั้ง → 10,20,…,70)
 * **1 รายการใน lines = 1 บรรทัดจริง** — ตัดบรรทัดตามวลีที่ฝ่ายขายกำหนด (2026-09-22 "จบบรรทัดให้ลงตัว") ไม่ปล่อยให้ตัดเอง
 * pure ไม่มี server-only — เทสต์ได้ และเป็น JSON ล้วนส่งข้าม server/client ได้
 */

/** ท่อนข้อความ: string = ธรรมดา, { b } = ตัวเลข/คำเน้น (ตัวหนา), { big } = คำเด่นตัวใหญ่ (เช่น "รับฟรี") */
export type PromoSeg = string | { b: string } | { big: string }
export interface PromoCopy {
  badge: string
  title: string
  titleParts?: string[]   // วลีที่ห้ามตัดกลาง (title = join) — การ์ดแคบให้ขึ้นบรรทัดตรงรอยต่อวลีเท่านั้น
  lines: PromoSeg[][]
  note?: string
}
export interface PromoFigures {
  [k: string]: unknown   // รับ doc ดิบจาก promotion_master ได้ตรง ๆ
  pro1Condition?: unknown; pro1FreeCount?: unknown; pro1TotalValue?: unknown
  pro2RepairBudget?: unknown; pro3AnnualPm?: unknown
}

const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0)
const fm = (v: number) => v.toLocaleString("en-US")

export function promoCopy(m: PromoFigures | null | undefined): PromoCopy[] {
  if (!m) return []
  const out: Omit<PromoCopy, "badge">[] = []

  const freeCount = n(m.pro1FreeCount)
  const freeValue = n(m.pro1TotalValue)
  if (freeValue > 0 || freeCount > 0) {
    const [, payN = "9", freeM = "1"] = String(m.pro1Condition ?? "").match(/(\d+)\s*ฟรี\s*(\d+)/) ?? []
    const cycle = Number(payN) + Number(freeM)
    const freeAt = Array.from({ length: freeCount }, (_, k) => (k + 1) * cycle)
    const lines: PromoSeg[][] = [["ผ่อนค่างวดครบทุก ๆ ", { b: `${payN} งวด` }]]
    if (freeAt.length) lines.push([{ big: "รับฟรี" }], ["งวดที่ ", { b: freeAt.join(",") }])
    if (freeCount) lines.push(["รวมรับฟรี ", { b: `${freeCount} งวด` }])
    if (freeValue) lines.push(["มูลค่ารวม ", { b: `${fm(freeValue)} บาท` }])
    out.push({ title: "ฟรีค่างวด", lines })
  }

  const repair = n(m.pro2RepairBudget)
  if (repair > 0) {
    out.push({ title: "ฟรีค่าซ่อมบำรุง", lines: [["ฟรีค่าซ่อมบำรุง วงเงิน ", { b: `${fm(repair)} บาท` }]] })
  }

  const pm = n(m.pro3AnnualPm)
  if (pm > 0) {
    out.push({
      title: "ฟรีเปลี่ยนถ่ายน้ำมันเครื่อง (PM)",
      titleParts: ["ฟรีเปลี่ยนถ่าย", "น้ำมันเครื่อง (PM)"],
      lines: [
        ["ฟรีเปลี่ยนถ่ายน้ำมันเครื่อง ไส้กรอง"],
        ["และของเหลวสำคัญตามระยะ"],
        ["ทุก ๆ ", { b: "6 เดือน" }, " *"],
        ["PM (บำรุงรักษาเชิงป้องกัน)"],
        ["มูลค่ารวม ", { b: `${fm(pm)} บาท/ปี` }],
      ],
      note: "*เงื่อนไขอาจมีการเปลี่ยนแปลง เป็นไปตามที่บริษัทกำหนด",
    })
  }

  return out.map((p, i) => ({ badge: `ต่อที่ ${i + 1}`, ...p }))
}

/** บรรทัดเป็นข้อความล้วน (ไม่มีตัวหนา) */
export const segText = (s: PromoSeg) => (typeof s === "string" ? s : "b" in s ? s.b : s.big)
export const promoLineText = (line: PromoSeg[]) => line.map(segText).join("")
