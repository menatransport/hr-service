"use client"

import { useMemo, useRef, useState, useSyncExternalStore } from "react"
import { TruckCard } from "./truck-card"
import type { PublicTruck } from "@/lib/partner/public-trucks"
import { PrepStars, ReadyStars } from "./ready-stars"

type Sort = "recommended" | "price-asc" | "year-desc"
/** ระดับดาว: ready = ★★★★★ พร้อมขาย · prep = ★★★ เตรียมรถ */
type Tier = "" | "ready" | "prep"

/** ระดับดาวผูกกับ #hash — ลิงก์ส่งต่อได้ (/trucks#พร้อมขาย) และ Google นับเป็นหน้าเดียว (fragment ไม่ถูก index)
 *  ปุ่มหัวหน้า: #พร้อมขาย = กรองพร้อมขาย · #รถพร้อมขาย (ดูรถทั้งหมด) = ล้างระดับดาว */
const TIER_HASH: Record<Tier, string> = { "": "", ready: "#พร้อมขาย", prep: "#เตรียมรถ" }
function tierFromHash(raw: string): Tier | null {
  let h = raw
  try { h = decodeURIComponent(raw) } catch { /* hash เพี้ยน → ใช้ค่าดิบ */ }
  if (h === TIER_HASH.ready) return "ready"
  if (h === TIER_HASH.prep) return "prep"
  if (h === "#รถพร้อมขาย") return ""
  return null   // hash อื่น (#ติดต่อ) ไม่แตะตัวกรอง
}
const subscribeHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb)
  return () => window.removeEventListener("hashchange", cb)
}
const readHash = () => window.location.hash
const serverHash = () => ""

/** 12 = ลงตัวทั้ง grid 2 และ 3 คอลัมน์ (ไม่มีแถวสุดท้ายแหว่ง) */
const PAGE_SIZE = 12

/** กรอง+แบ่งหน้าในหน่วยความจำ — สต็อกหลักร้อยคัน ไม่ต้อง server pagination (หน้ารถทุกคันอยู่ใน sitemap แล้ว Google ไม่ต้องไล่หน้า); ตัวกรอง/เลขหน้าไม่เขียนลง query (กันหน้าซ้ำถูก index) ยกเว้นระดับดาวที่อยู่ใน #hash */
export function TruckBrowser({ trucks }: { trucks: PublicTruck[] }) {
  const [brand, setBrand] = useState("")
  const [characteristic, setChar] = useState("")
  const [maxPrice, setMaxPrice] = useState(0)
  const [yearFrom, setYearFrom] = useState(0)
  const [yearTo, setYearTo] = useState(0)
  const [sort, setSort] = useState<Sort>("recommended")
  const [tier, setTier] = useState<Tier>("")

  // hash เปลี่ยน (โหลดหน้า/กดปุ่มหัวหน้า/ย้อนกลับ) → ตั้งระดับดาวตาม — ปรับ state ระหว่าง render แทน effect
  const hash = useSyncExternalStore(subscribeHash, readHash, serverHash)
  const [seenHash, setSeenHash] = useState(hash)
  if (hash !== seenHash) {
    setSeenHash(hash)
    const t = tierFromHash(hash)
    if (t !== null) setTier(t)
  }
  // กดชิป/ล้างตัวกรอง → เขียน hash ตาม (replaceState: ไม่เลื่อนจอ ไม่เพิ่มประวัติ)
  const chooseTier = (next: Tier) => {
    setTier(next)
    const cur = window.location.hash
    if (!next && tierFromHash(cur) === null) return
    history.replaceState(history.state, "", window.location.pathname + window.location.search + TIER_HASH[next])
  }

  const brands = useMemo(() => [...new Set(trucks.map((t) => t.brand).filter(Boolean))].sort(), [trucks])
  const chars  = useMemo(() => [...new Set(trucks.map((t) => t.characteristic).filter(Boolean))].sort(), [trucks])
  // ปีในตัวเลือก = ปีที่มีรถจริง (เก็บเป็น ค.ศ. แสดงเป็น พ.ศ.)
  const years  = useMemo(
    () => [...new Set(trucks.map((t) => t.registrationYear).filter((y): y is number => !!y))].sort((a, b) => a - b),
    [trucks])
  const readyCount = useMemo(() => trucks.filter((t) => t.isReady).length, [trucks])
  const prepCount = trucks.length - readyCount

  const shown = useMemo(() => {
    const out = trucks.filter((t) => {
      // ตั้งช่วงปีแล้ว รถที่ไม่ได้บันทึกปีจะไม่ขึ้น (ยืนยันปีไม่ได้)
      const y = t.registrationYear
      if ((yearFrom || yearTo) && !y) return false
      return (!tier || (tier === "ready") === t.isReady) &&
        (!brand || t.brand === brand) &&
        (!characteristic || t.characteristic === characteristic) &&
        (!maxPrice || t.display.price <= maxPrice) &&
        (!yearFrom || (y ?? 0) >= yearFrom) &&
        (!yearTo || (y ?? 0) <= yearTo)
    })
    if (sort === "price-asc") return [...out].sort((a, b) => a.display.price - b.display.price)
    if (sort === "year-desc") return [...out].sort((a, b) => (b.registrationYear ?? 0) - (a.registrationYear ?? 0))
    return out
  }, [trucks, tier, brand, characteristic, maxPrice, yearFrom, yearTo, sort])

  // เปลี่ยนตัวกรอง/การเรียง → กลับหน้า 1 (ปรับ state ระหว่าง render เหมือน hash ด้านบน)
  const [page, setPage] = useState(1)
  const filterKey = [tier, brand, characteristic, maxPrice, yearFrom, yearTo, sort].join("|")
  const [seenFilterKey, setSeenFilterKey] = useState(filterKey)
  if (filterKey !== seenFilterKey) {
    setSeenFilterKey(filterKey)
    setPage(1)
  }
  const totalPages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE))
  const curPage = Math.min(page, totalPages)
  const paged = shown.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE)

  // เปลี่ยนหน้า → เลื่อนกลับขึ้นแถบตัวกรอง ไม่งั้นลูกค้าค้างอยู่ท้ายรายการหน้าใหม่
  const topRef = useRef<HTMLDivElement>(null)
  const goPage = (n: number) => {
    setPage(n)
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const reset = () => { chooseTier(""); setBrand(""); setChar(""); setMaxPrice(0); setYearFrom(0); setYearTo(0); setSort("recommended") }
  const filtered = !!(tier || brand || characteristic || maxPrice || yearFrom || yearTo)
  const sel = "rounded-full border border-[var(--mena-line)] bg-white px-4 py-2.5 text-sm hover:border-[var(--mena-green-soft)] focus-visible:outline-2 focus-visible:outline-[var(--mena-green)]"

  return (
    <>
      <div ref={topRef} className="flex flex-wrap items-center gap-2 border-b border-[var(--mena-line)] pb-5 mb-8 scroll-mt-24">
        {([
          ["ready", <ReadyStars key="s" />, "พร้อมขาย", readyCount],
          ["prep", <PrepStars key="s" />, "เตรียมรถ", prepCount],
        ] as const).map(([key, stars, label, count]) => count > 0 && (
          // กดซ้ำ = ยกเลิก; เลือกได้ทีละระดับ
          <button
            key={key} type="button" aria-pressed={tier === key} onClick={() => chooseTier(tier === key ? "" : key)}
            className={tier === key
              ? "inline-flex items-center gap-1.5 rounded-full border border-[var(--mena-green)] bg-[var(--mena-green)] text-white px-4 py-2.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mena-green)]"
              : `${sel} inline-flex items-center gap-1.5 font-medium`}
          >
            {stars}
            {label} ({count})
          </button>
        ))}
        <select className={sel} value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="ยี่ห้อ">
          <option value="">ยี่ห้อทั้งหมด</option>
          {brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        {chars.length > 1 && (
          <select className={sel} value={characteristic} onChange={(e) => setChar(e.target.value)} aria-label="ลักษณะรถ">
            <option value="">ลักษณะทั้งหมด</option>
            {chars.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <select className={sel} value={maxPrice} onChange={(e) => setMaxPrice(Number(e.target.value))} aria-label="ราคาไม่เกิน">
          <option value={0}>ราคาทุกช่วง</option>
          <option value={1_500_000}>ไม่เกิน 1.5 ล้าน</option>
          <option value={1_800_000}>ไม่เกิน 1.8 ล้าน</option>
          <option value={2_200_000}>ไม่เกิน 2.2 ล้าน</option>
        </select>
        {years.length > 1 && (
          <span className="inline-flex items-center gap-1.5 text-sm text-[var(--mena-ink)]/55">
            ปีจดทะเบียน
            <select className={sel} value={yearFrom} onChange={(e) => setYearFrom(Number(e.target.value))} aria-label="ปีจดทะเบียนตั้งแต่">
              <option value={0}>ตั้งแต่</option>
              {years.filter((y) => !yearTo || y <= yearTo).map((y) => <option key={y} value={y}>{y + 543}</option>)}
            </select>
            ถึง
            <select className={sel} value={yearTo} onChange={(e) => setYearTo(Number(e.target.value))} aria-label="ปีจดทะเบียนถึง">
              <option value={0}>ล่าสุด</option>
              {years.filter((y) => !yearFrom || y >= yearFrom).map((y) => <option key={y} value={y}>{y + 543}</option>)}
            </select>
          </span>
        )}
        <select className={sel} value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="เรียงลำดับ">
          <option value="recommended">แนะนำ</option>
          <option value="price-asc">ราคาต่ำไปสูง</option>
          <option value="year-desc">ปีใหม่ไปเก่า</option>
        </select>

        {filtered && (
          <button type="button" onClick={reset} className="text-sm text-[var(--mena-green)] underline underline-offset-4 px-2 py-2">
            ล้างตัวกรอง
          </button>
        )}
        <p className="ml-auto text-sm text-[var(--mena-ink)]/55">{shown.length} คัน</p>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-2xl bg-white border border-[var(--mena-line)] py-16 text-center">
          <p className="font-medium">ไม่มีรถตรงเงื่อนไขนี้</p>
          <p className="text-sm text-[var(--mena-ink)]/60 mt-1">ลองกว้างขึ้น หรือโทรถามฝ่ายขายว่ามีคันไหนกำลังจะว่าง</p>
          <button type="button" onClick={reset} className="mt-4 rounded-full bg-[var(--mena-green)] text-white px-5 py-2.5 text-sm font-medium">
            ดูรถทั้งหมด
          </button>
        </div>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {paged.map((t) => <TruckCard key={t.slug} truck={t} />)}
          </div>
          <Pager page={curPage} totalPages={totalPages} total={shown.length} onPage={goPage} />
        </>
      )}
    </>
  )
}

/** แถบเลขหน้าโทนแบรนด์ (ใช้ components/pagination ไม่ได้ — สี zinc ของหลังบ้าน)
 *  จอแคบ: ก่อนหน้า · หน้า x/y · ถัดไป  ·  sm ขึ้นไป: เลขหน้า 1 … 4 5 6 … 15 */
function Pager({ page, totalPages, total, onPage }: {
  page: number
  totalPages: number
  total: number
  onPage: (n: number) => void
}) {
  const from = (page - 1) * PAGE_SIZE + 1
  const to = Math.min(page * PAGE_SIZE, total)
  const numbers = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter((n) => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
    .reduce<(number | "…")[]>((acc, n) => {
      const prev = acc[acc.length - 1]
      if (typeof prev === "number" && n - prev > 1) acc.push("…")
      acc.push(n)
      return acc
    }, [])

  const btn = "inline-flex items-center justify-center rounded-full border border-[var(--mena-line)] bg-white h-10 text-sm hover:border-[var(--mena-green-soft)] disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mena-green)]"

  return (
    <nav aria-label="เลขหน้า" className="mt-10 flex flex-col items-center gap-3">
      {totalPages > 1 && (
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} className={`${btn} px-4`}>
            ‹ ก่อนหน้า
          </button>
          <span className="sm:hidden px-3 text-sm tabular-nums">หน้า {page} / {totalPages}</span>
          <span className="hidden sm:flex items-center gap-1.5">
            {numbers.map((n, i) => n === "…" ? (
              <span key={`gap${i}`} className="w-6 text-center text-[var(--mena-ink)]/40">…</span>
            ) : (
              <button
                key={n} type="button" onClick={() => onPage(n)} aria-current={n === page ? "page" : undefined}
                className={n === page
                  ? "inline-flex items-center justify-center rounded-full h-10 min-w-10 px-3 text-sm font-medium bg-[var(--mena-green)] text-white tabular-nums"
                  : `${btn} min-w-10 px-3 tabular-nums`}
              >
                {n}
              </button>
            ))}
          </span>
          <button type="button" onClick={() => onPage(page + 1)} disabled={page >= totalPages} className={`${btn} px-4`}>
            ถัดไป ›
          </button>
        </div>
      )}
      <p className="text-sm text-[var(--mena-ink)]/55 tabular-nums">แสดง {from}–{to} จาก {total} คัน</p>
    </nav>
  )
}
