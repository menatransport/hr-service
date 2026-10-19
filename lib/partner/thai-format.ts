/**
 * Thai formatting helpers for legal documents (contracts).
 * - bahtText: convert number to Thai baht text e.g. 2222.22 → สองพันสองร้อยยี่สิบสองบาทยี่สิบสองสตางค์
 * - thaiDate / thaiDateParts: Buddhist-era date strings e.g. 2026-06-01 → 1 มิถุนายน 2569
 */

const TH_NUM = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"]
const TH_POS = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"]

export const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
]

/** Read a group of up to 6 digits (0 – 999,999) as Thai text. */
function readGroup(n: number): string {
  if (n === 0) return ""
  let out = ""
  const digits = String(n).split("").map(Number)
  const len = digits.length
  digits.forEach((d, i) => {
    const pos = len - i - 1 // position index into TH_POS
    if (d === 0) return
    if (pos === 0) {
      // units digit: เอ็ด when preceded by tens (or higher) within this group
      if (d === 1 && len > 1) out += "เอ็ด"
      else out += TH_NUM[d]
    } else if (pos === 1) {
      // tens digit: ยี่สิบ / สิบ special cases
      if (d === 1) out += "สิบ"
      else if (d === 2) out += "ยี่สิบ"
      else out += TH_NUM[d] + "สิบ"
    } else {
      out += TH_NUM[d] + TH_POS[pos]
    }
  })
  return out
}

/** Integer to Thai text, handling ล้าน groups recursively (supports very large values). */
function readInt(n: number): string {
  if (n === 0) return TH_NUM[0]
  if (n < 1_000_000) return readGroup(n)
  const millions = Math.floor(n / 1_000_000)
  const rest = n % 1_000_000
  return readInt(millions) + "ล้าน" + (rest > 0 ? readGroup(rest) : "")
}

/**
 * Convert an amount to Thai baht text.
 * 1295514   → หนึ่งล้านสองแสนเก้าหมื่นห้าพันห้าร้อยสิบสี่บาทถ้วน
 * 2222.22   → สองพันสองร้อยยี่สิบสองบาทยี่สิบสองสตางค์
 */
export function bahtText(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) return "-"
  const negative = amount < 0
  // round to satang to avoid floating point artifacts
  const total = Math.round(Math.abs(amount) * 100)
  const baht = Math.floor(total / 100)
  const satang = total % 100
  let out = readInt(baht) + "บาท"
  out += satang === 0 ? "ถ้วน" : readGroup(satang) + "สตางค์"
  return negative ? "ลบ" + out : out
}

/** Format number with commas; keeps decimals only when present (max 2). */
export function money(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return "-"
  const hasDecimals = Math.round(n * 100) % 100 !== 0
  return n.toLocaleString("en-US", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })
}

/** Parse an ISO-ish date string safely (YYYY-MM-DD or full ISO). */
function parseDate(iso?: string | null): Date | null {
  if (!iso) return null
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso)
  return isNaN(d.getTime()) ? null : d
}

/** 2026-06-01 → { day: 1, monthName: มิถุนายน, yearBE: 2569 } */
export function thaiDateParts(iso?: string | null): { day: number; monthName: string; yearBE: number } | null {
  const d = parseDate(iso)
  if (!d) return null
  return { day: d.getDate(), monthName: THAI_MONTHS[d.getMonth()], yearBE: d.getFullYear() + 543 }
}

/** 2026-06-01 → "1 มิถุนายน 2569" (or fallback when missing) */
export function thaiDate(iso?: string | null, fallback = "................"): string {
  const p = thaiDateParts(iso)
  return p ? `${p.day} ${p.monthName} ${p.yearBE}` : fallback
}

/** Full age in years as of `asOf` (default today). */
export function ageFromBirthDate(birthIso?: string | null, asOf?: string | null): number | null {
  const b = parseDate(birthIso)
  if (!b) return null
  const now = parseDate(asOf ?? undefined) ?? new Date()
  let age = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
  return age >= 0 && age < 130 ? age : null
}

/** Last day of the month following the given date, as ISO (first installment convention). */
export function firstInstallmentDate(contractIso?: string | null): string | null {
  const d = parseDate(contractIso)
  if (!d) return null
  // day 0 of month+2 = last day of month+1
  const last = new Date(d.getFullYear(), d.getMonth() + 2, 0)
  const mm = String(last.getMonth() + 1).padStart(2, "0")
  const dd = String(last.getDate()).padStart(2, "0")
  return `${last.getFullYear()}-${mm}-${dd}`
}

/** Format national ID 13 digits as X XXXX XXXXX XX X (Thai ID card grouping). */
export function formatNationalId(id?: string | null): string {
  const digits = (id ?? "").replace(/\D/g, "")
  if (digits.length !== 13) return id?.trim() || "-"
  return `${digits[0]} ${digits.slice(1, 5)} ${digits.slice(5, 10)} ${digits.slice(10, 12)} ${digits[12]}`
}
