import type { Db } from "mongodb"

/**
 * Single source of truth for promotion budget usage (ค่าซ่อม / PM) per vehicle.
 *
 * Real-world repairs are recorded in TWO collections at different granularity:
 *  - repair_claims:   one row per MR document (เลข MR อยู่ใน field `description`),
 *                     keyed by contractCode (seeded from Excel history)
 *  - stock_movements: one row per part issued, keyed by licensePlate with
 *                     `mr` + `promoType` ("repair" | "pm") (live data going forward)
 *
 * The same MR can appear in both (verified: totals match) — so usage MUST be
 * deduplicated by MR number. Both /api/promotions/* and /api/vehicle-cost
 * read from this module so the two pages always show identical numbers.
 */

/** "สบ.71-1515" → "71-1515" (server-side twin of components/contract-document normPlate) */
export function normPlate(p?: string | null): string {
  return (p ?? "").replace(/^[^0-9]*/, "").trim()
}

export interface RepairRecord {
  mr: string
  date: string
  amount: number
  /** claim = manual/Excel record, stock = item-level warehouse data, both = present in both (deduped) */
  source: "claim" | "stock" | "both"
  contractCode?: string
  licensePlate?: string
  itemCount?: number
  /** PM1 | PM2 (manual pm_records only) */
  pmType?: string
}

export interface PlateUsage {
  plate: string // normalized e.g. "71-1959"
  licensePlate: string // display form e.g. "สบ.71-1959"
  contractCode?: string
  truckNumber?: string
  driverName?: string
  repairBudget: number | null
  repairUsed: number
  repairRemaining: number | null
  annualPmCap: number | null
  pmUsedThisYear: number
  pmRemainingThisYear: number | null
  pm1Used: boolean
  pm2Used: boolean
  /** รอบปี PM ปัจจุบันของคันนี้ — นับจากวันเริ่มสัญญา (ไม่มีสัญญา = ปีปฏิทิน) */
  pmWindowFrom: string
  pmWindowTo: string
  repairRecords: RepairRecord[]
  pmRecords: RepairRecord[]
}

interface PlateIdentity {
  licensePlate: string
  contractCode?: string
  truckNumber?: string
  driverName?: string
  startDate?: string // วันเริ่มสัญญา — ใช้กำหนดรอบปี PM (นับจากวันเริ่มสัญญา ไม่ใช่ปีปฏิทิน)
}

/** Canonical plate ↔ contract mapping. Priority: contracts > repair_monthly > gps_config. */
export async function getPlateContractMap(db: Db): Promise<Map<string, PlateIdentity>> {
  const map = new Map<string, PlateIdentity>()
  const put = (plate: string | undefined, info: Partial<PlateIdentity>, overwrite: boolean) => {
    const key = normPlate(plate)
    if (!key) return
    const cur = map.get(key)
    if (cur && !overwrite) {
      // fill blanks only
      map.set(key, {
        licensePlate: cur.licensePlate || info.licensePlate || "",
        contractCode: cur.contractCode || info.contractCode,
        truckNumber: cur.truckNumber || info.truckNumber,
        driverName: cur.driverName || info.driverName,
        startDate: cur.startDate || info.startDate,
      })
    } else {
      map.set(key, { ...(cur ?? { licensePlate: "" }), ...info } as PlateIdentity)
    }
  }
  const [gps, monthly, contracts] = await Promise.all([
    db.collection("gps_config").find({}).project({ licensePlate: 1, contractCode: 1, truckNumber: 1 }).toArray(),
    db.collection("repair_monthly").find({}).project({ licensePlate: 1, contractCode: 1, truckNumber: 1, driverName: 1 }).toArray(),
    db.collection("contracts").find({}).project({ licensePlate: 1, contractCode: 1, truckNumber: 1, driverName: 1, startDate: 1, contractDate: 1 }).toArray(),
  ])
  for (const g of gps) put(g.licensePlate, { licensePlate: g.licensePlate, contractCode: g.contractCode, truckNumber: g.truckNumber }, false)
  for (const m of monthly) put(m.licensePlate, { licensePlate: m.licensePlate, contractCode: m.contractCode, truckNumber: m.truckNumber, driverName: m.driverName }, true)
  for (const c of contracts) put(c.licensePlate, { licensePlate: c.licensePlate, contractCode: c.contractCode, truckNumber: c.truckNumber, driverName: c.driverName, startDate: (c.startDate as string) || (c.contractDate as string) || undefined }, true)
  return map
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? 0))
  return isNaN(n) ? 0 : n
}


// ── รอบปี PM: นับจากวันเริ่มสัญญา (anniversary year) — ครบรอบปีสัญญา = ขึ้นรอบใหม่ ──
function annISO(monthDay: string, year: number): string {
  // 29 ก.พ. ในปีไม่อธิกสุรทิน → 28 ก.พ.
  if (monthDay === "02-29") {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
    if (!leap) return `${year}-02-28`
  }
  return `${year}-${monthDay}`
}
function dayBefore(iso: string): string {
  const d = new Date(iso + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}
/** ช่วงรอบปีปัจจุบัน [from..to] ของสัญญาที่เริ่ม startISO — ไม่มีวันเริ่ม = ปีปฏิทิน (พฤติกรรมเดิม) */
export function pmWindow(startISO: string | undefined, todayISO: string): { from: string; to: string } {
  const s = (startISO ?? "").slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const y = todayISO.slice(0, 4)
    return { from: `${y}-01-01`, to: `${y}-12-31` }
  }
  if (s > todayISO) return { from: s, to: dayBefore(annISO(s.slice(5), parseInt(s.slice(0, 4), 10) + 1)) }
  const md = s.slice(5)
  const sy = parseInt(s.slice(0, 4), 10)
  let k = parseInt(todayISO.slice(0, 4), 10) - sy
  if (annISO(md, sy + k) > todayISO) k -= 1
  return { from: annISO(md, sy + k), to: dayBefore(annISO(md, sy + k + 1)) }
}

/**
 * Aggregate deduplicated repair + PM usage per plate.
 * @param year Buddhist/AD calendar year for the PM annual cap window (default: current year)
 */
export async function getPromoUsage(db: Db, year?: number): Promise<Map<string, PlateUsage>> {
  // เพดาน PM นับเป็น "รอบปีจากวันเริ่มสัญญา" ของแต่ละคัน — year param เดิมไม่ใช้แล้ว (คงไว้กัน signature พัง)
  void year
  const today = new Date().toISOString().slice(0, 10)

  const [identity, claims, movements, configs, pmManual] = await Promise.all([
    getPlateContractMap(db),
    db.collection("repair_claims").find({}).toArray(),
    db
      .collection("stock_movements")
      .find({ promoType: { $in: ["repair", "pm"] } })
      .project({ mr: 1, date: 1, amount: 1, licensePlate: 1, promoType: 1, pmType: 1 })
      .toArray(),
    db.collection("promo_config").find({}).toArray(),
    db.collection("pm_records").find({}).toArray(),
  ])

  // contractCode -> plate (reverse of identity map)
  const ccToPlate = new Map<string, string>()
  for (const [plate, info] of identity) if (info.contractCode) ccToPlate.set(info.contractCode, plate)

  // รอบปี PM ปัจจุบันของแต่ละ plate (นับจากวันเริ่มสัญญา)
  const winCache = new Map<string, { from: string; to: string }>()
  const winOf = (plate: string) => {
    let w = winCache.get(plate)
    if (!w) { w = pmWindow(identity.get(plate)?.startDate, today); winCache.set(plate, w) }
    return w
  }
  const inWindow = (dateISO: string | undefined, plate: string) => {
    const d = (dateISO ?? "").slice(0, 10)
    if (!d) return false
    const w = winOf(plate)
    return d >= w.from && d <= w.to
  }

  // ── stock_movements: group item lines by MR ──
  interface MrGroup { mr: string; date: string; amount: number; plate: string; itemCount: number; promoType: string; pmTypes: Set<string> }
  const stockByMr = new Map<string, MrGroup>()
  for (const m of movements) {
    const mr = String(m.mr ?? "").trim()
    const plate = normPlate(m.licensePlate)
    if (!plate) continue
    // repair กับ pm แยกกลุ่มกัน — MR เดียวกันอาจมีทั้งชิ้นซ่อมและชิ้น PM
    const key = (mr || `no-mr:${plate}:${m.date}:${m._id}`) + `|${m.promoType}`
    const cur = stockByMr.get(key)
    if (cur) {
      cur.amount += num(m.amount)
      cur.itemCount += 1
      if ((m.date ?? "") < cur.date) cur.date = m.date
      if (m.pmType) cur.pmTypes.add(String(m.pmType))
    } else {
      stockByMr.set(key, {
        mr,
        date: m.date ?? "",
        amount: num(m.amount),
        plate,
        itemCount: 1,
        promoType: m.promoType,
        pmTypes: new Set(m.pmType ? [String(m.pmType)] : []),
      })
    }
  }

  // ── repair_claims keyed by MR (description) ──
  interface ClaimRow { mr: string; date: string; amount: number; contractCode: string; confirmed: boolean }
  const claimByMr = new Map<string, ClaimRow>()
  for (const c of claims) {
    // ใช้ field mr ก่อน (บันทึกใหม่) fallback description (ประวัติเก่าที่เก็บ MR ใน description)
    const mr = String(c.mr ?? c.description ?? "").trim()
    const key = mr || `claim:${c._id}`
    claimByMr.set(key, {
      mr,
      date: c.date ?? "",
      amount: num(c.amount),
      contractCode: c.contractCode,
      confirmed: c.confirmed === true, // field ไม่มี (ประวัติเก่า) = ยังไม่ยืนยัน
    })
  }

  // ── merge, dedupe by MR ──
  const usage = new Map<string, PlateUsage>()
  const ensure = (plate: string): PlateUsage => {
    let u = usage.get(plate)
    if (!u) {
      const info = identity.get(plate)
      u = {
        plate,
        licensePlate: info?.licensePlate || plate,
        contractCode: info?.contractCode,
        truckNumber: info?.truckNumber,
        driverName: info?.driverName,
        repairBudget: null,
        repairUsed: 0,
        repairRemaining: null,
        annualPmCap: null,
        pmUsedThisYear: 0,
        pmRemainingThisYear: null,
        pm1Used: false,
        pm2Used: false,
        pmWindowFrom: "",
        pmWindowTo: "",
        repairRecords: [],
        pmRecords: [],
      }
      usage.set(plate, u)
    }
    return u
  }

  // stock records first (most detailed)
  for (const g of stockByMr.values()) {
    const u = ensure(g.plate)
    // dedupe กับ repair_claims เฉพาะกลุ่มซ่อม — กลุ่ม PM เป็นคนละงบ ไม่ชนกับ claim
    const inClaims = g.promoType !== "pm" && g.mr !== "" && claimByMr.has(g.mr)
    const rec: RepairRecord = {
      mr: g.mr,
      date: g.date,
      amount: g.amount,
      source: inClaims ? "both" : "stock",
      contractCode: u.contractCode,
      licensePlate: u.licensePlate,
      itemCount: g.itemCount,
    }
    if (g.promoType === "pm") {
      // เพดาน PM นับเฉพาะรายการใน "รอบปีสัญญา" ปัจจุบัน แต่รายการโชว์ทุกรอบ
      // (ไม่ให้รายการรอบก่อนหายไปจากตารางจนทีมงง)
      rec.pmType = [...g.pmTypes].sort().join("+") || undefined
      if (inWindow(g.date, g.plate)) {
        u.pmUsedThisYear += g.amount
        if (g.pmTypes.has("PM1")) u.pm1Used = true
        if (g.pmTypes.has("PM2")) u.pm2Used = true
      }
      u.pmRecords.push(rec)
    } else {
      u.repairUsed += g.amount
      u.repairRecords.push(rec)
    }
  }

  // claims not already covered by stock movements.
  // กติกา: ตัดงบเฉพาะรายการที่ทีม "ระบุแล้ว" เท่านั้น —
  //   - รายการเบิกคลังที่ติ๊ก promoType (นับด้านบนแล้ว) หรือ
  //   - claim ที่ confirmed === true (กดยืนยัน / บันทึกใหม่จากหน้าโปรโมชั่น)
  // claim ประวัติจาก Excel ที่ยังไม่ยืนยัน = ไม่ตัดงบ (แสดงเป็น "รอยืนยัน" บน UI)
  const stockMrs = new Set([...stockByMr.values()].map((g) => g.mr).filter(Boolean))
  for (const [key, c] of claimByMr) {
    if (c.mr && stockMrs.has(c.mr)) continue // already counted from stock (deduped)
    if (!c.confirmed) continue // ยังไม่ระบุจากทีม — ไม่ตัดงบ
    const plate = ccToPlate.get(c.contractCode)
    if (!plate) continue // unmapped contract — surfaced via getUnmappedClaims below
    const u = ensure(plate)
    u.repairUsed += c.amount
    u.repairRecords.push({
      mr: c.mr || key,
      date: c.date,
      amount: c.amount,
      source: "claim",
      contractCode: c.contractCode,
      licensePlate: u.licensePlate,
    })
  }

  // ── manual PM records (pm_records: keyed by contractCode + integer year) ──
  // กติกาเดียวกับค่าซ่อม: ตัดเพดานเฉพาะรายการที่ทีมยืนยันแล้ว (confirmed === true)
  for (const p of pmManual) {
    if (p.confirmed !== true) continue // ประวัติ/ยังไม่ยืนยัน — ไม่ตัดเพดาน
    const plate = ccToPlate.get(p.contractCode)
    if (!plate) continue
    const u = ensure(plate)
    // นับเพดานเฉพาะรายการในรอบปีสัญญาปัจจุบัน (ไม่มี date → เทียบปีของวันเริ่มรอบ)
    const counted = p.date ? inWindow(p.date as string, plate) : Number(p.year) === parseInt(winOf(plate).from.slice(0, 4), 10)
    if (!counted) {
      u.pmRecords.push({ mr: "", date: (p.date as string) ?? "", amount: num(p.amount), source: "claim", contractCode: p.contractCode, licensePlate: u.licensePlate, pmType: p.type })
      continue
    }
    u.pmUsedThisYear += num(p.amount)
    if (p.type === "PM1") u.pm1Used = true
    if (p.type === "PM2") u.pm2Used = true
    u.pmRecords.push({
      mr: "",
      date: p.date ?? "",
      amount: num(p.amount),
      source: "claim",
      contractCode: p.contractCode,
      licensePlate: u.licensePlate,
      pmType: p.type,
    })
  }

  // ── budgets from promo_config ──
  for (const cfg of configs) {
    const plate = normPlate(cfg.licensePlate)
    if (!plate) continue
    const u = usage.get(plate) ?? ensure(plate)
    u.repairBudget = num(cfg.repairBudget)
    u.annualPmCap = num(cfg.annualPmCap)
  }
  for (const u of usage.values()) {
    const w = winOf(u.plate)
    u.pmWindowFrom = w.from
    u.pmWindowTo = w.to
    if (u.repairBudget != null) u.repairRemaining = u.repairBudget - u.repairUsed
    if (u.annualPmCap != null) u.pmRemainingThisYear = u.annualPmCap - u.pmUsedThisYear
    u.repairRecords.sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    u.pmRecords.sort((a, b) => (b.date || "").localeCompare(a.date || ""))
  }
  return usage
}

/** Claims whose contractCode has no known plate mapping (data-quality signal). */
export async function getUnmappedClaims(db: Db): Promise<{ contractCode: string; total: number; count: number }[]> {
  const identity = await getPlateContractMap(db)
  const ccKnown = new Set([...identity.values()].map((i) => i.contractCode).filter(Boolean))
  const out = new Map<string, { contractCode: string; total: number; count: number }>()
  for (const c of await db.collection("repair_claims").find({}).toArray()) {
    if (ccKnown.has(c.contractCode)) continue
    const cur = out.get(c.contractCode) ?? { contractCode: c.contractCode, total: 0, count: 0 }
    cur.total += num(c.amount)
    cur.count += 1
    out.set(c.contractCode, cur)
  }
  return [...out.values()].sort((a, b) => b.total - a.total)
}
