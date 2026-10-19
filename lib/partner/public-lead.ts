import { z } from "zod"

/** ฟอร์มสาธารณะ = ไม่มี auth → validate เข้ม + ทิ้ง field ที่ไม่รู้จักทั้งหมด */
export interface LeadInput {
  name: string
  phone: string
  slug: string
  budgetDown: number
  message: string
}

const thaiPhone = /^0\d{8,9}$/

export const leadSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(30),
  slug: z.string().trim().max(120),
  budgetDown: z.coerce.number().min(0).max(100_000_000).default(0),
  message: z.string().trim().max(900).default(""),
  website: z.string().optional(),   // honeypot — คนจริงไม่เห็นช่องนี้
})

export function parseLead(body: unknown): { ok: true; data: LeadInput } | { ok: false; error: string } {
  const parsed = leadSchema.safeParse(body)
  if (!parsed.success) return { ok: false, error: "ข้อมูลไม่ครบหรือรูปแบบไม่ถูกต้อง" }
  const v = parsed.data
  if (v.website) return { ok: false, error: "rejected" }          // บอทกรอก honeypot
  const phone = v.phone.replace(/[^0-9]/g, "")
  if (!thaiPhone.test(phone)) return { ok: false, error: "เบอร์โทรไม่ถูกต้อง" }
  return {
    ok: true,
    data: { name: v.name, phone, slug: v.slug, budgetDown: v.budgetDown, message: v.message.slice(0, 500) },
  }
}

// rate limit ในหน่วยความจำ — พอสำหรับ P0 (รีเซ็ตเมื่อ instance รีสตาร์ต ยอมรับได้)
const HITS = new Map<string, number[]>()
const WINDOW_MS = 60 * 60 * 1000
const LIMIT = 5

export function allowRequest(ip: string, now = Date.now()): boolean {
  const hits = (HITS.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  if (hits.length >= LIMIT) { HITS.set(ip, hits); return false }
  hits.push(now)
  HITS.set(ip, hits)
  return true
}
