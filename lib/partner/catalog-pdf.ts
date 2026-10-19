import "server-only"
import fs from "fs"
import path from "path"
import sharp from "sharp"
import { COMPANY } from "@/lib/partner/contract-pdfmake-helpers"
import { seg } from "@/lib/partner/pdfmake-printer"
import type { CatalogConfig } from "@/lib/partner/catalog-config"
import { promoCopy, type PromoSeg } from "@/lib/partner/promo-copy"
import { partnerColOf, type PartnerDb } from "@/lib/db/partner"

/**
 * Catalog รายคัน — 1 หน้า A4/คัน (pdfmake, Sarabun, โทนทองเดียวกับใบเสนอราคา)
 * ข้อมูลรวมจาก vehicle_master + master_price_list + promotion_master (join ด้วย normPlate)
 * รูปดึงจาก DO Spaces ฝั่ง server → base64 (timeout ต่อรูป, ล้มเหลว = placeholder)
 */

const GOLD = "#C9A227"
const GOLD_DK = "#8C6B1F"
const INK = "#3F3000"
const RULE = "#E7C86E"
const CREAM = "#FAF7EF"
const MUTED = "#71717a"
const CONTENT_W = 499
const fm = (n: number) => (n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })

export const normPlate = (p?: string | null) => (p ?? "").replace(/^[^0-9]*/, "").trim()

let LOGO = ""
try { LOGO = fs.readFileSync(path.join(process.cwd(), "partner-assets", "fonts", "mena-logo.jpg")).toString("base64") } catch { /* ไม่มีโลโก้ก็ได้ */ }

export interface CatalogVehicle {
  licensePlate: string
  truckNumber?: string
  brand?: string
  model?: string
  vehicleType?: string
  characteristic?: string
  color?: string
  registrationDate?: string
  engineSize?: string
  photoUrl?: string
  photos?: Record<string, string | undefined>
  // ราคา (master_price_list)
  totalSalePrice?: number
  downPayment?: number
  cashDown?: number
  downInstallmentCount?: number
  downInstallmentAmt?: number
  financeAmount?: number
  financeInstallments?: number
  monthlyPayment?: number
  saleStatus?: string | null
  hasPrice: boolean
  // โปรโมชั่น (promotion_master)
  promo?: { pro1Condition: string; pro1FreeCount: number; pro1TotalValue: number; pro2RepairBudget: number; pro3AnnualPm: number }
}

/** โหลดข้อมูลรถสำหรับ catalog — plates ว่าง = ทุกคันที่พร้อมขาย (saleStatus ready + ไม่มีสัญญา active) */
export async function loadCatalogVehicles(db: PartnerDb, plates?: string[]): Promise<CatalogVehicle[]> {
  const [vehicles, prices, promos, contracts] = await Promise.all([
    partnerColOf(db, "vehicleMaster").find({}).toArray(),
    partnerColOf(db, "masterPriceList").find({}).toArray(),
    partnerColOf(db, "promotionMaster").find({}).toArray(),
    partnerColOf(db, "contracts").find({ status: "active" }, { projection: { licensePlate: 1 } }).toArray(),
  ])
  const priceBy = new Map(prices.map((p) => [normPlate(p.licensePlate as string), p]))
  const promoBy = new Map(promos.map((p) => [normPlate(p.licensePlate as string), p]))
  const underContract = new Set(contracts.map((c) => normPlate(c.licensePlate as string)))

  let picked = vehicles
  if (plates && plates.length) {
    const want = new Set(plates.map(normPlate))
    picked = vehicles.filter((v) => want.has(normPlate(v.licensePlate as string)))
  } else {
    picked = vehicles.filter((v) => {
      const k = normPlate(v.licensePlate as string)
      return v.status !== "inactive" && !underContract.has(k) && priceBy.get(k)?.saleStatus === "ready"
    })
  }
  picked.sort((a, b) => String(a.licensePlate ?? "").localeCompare(String(b.licensePlate ?? ""), "th"))

  const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0)
  return picked.map((v) => {
    const k = normPlate(v.licensePlate as string)
    const p = priceBy.get(k)
    const m = promoBy.get(k)
    return {
      licensePlate: String(v.licensePlate ?? ""),
      truckNumber: v.truckNumber as string, brand: v.brand as string, model: v.model as string,
      vehicleType: v.vehicleType as string, characteristic: v.characteristic as string, color: v.color as string,
      registrationDate: v.registrationDate as string, engineSize: v.engineSize as string,
      photoUrl: (v.photoUrl as string) || undefined, photos: (v.photos as Record<string, string>) ?? {},
      totalSalePrice: n(p?.totalSalePrice), downPayment: n(p?.downPayment), cashDown: n(p?.cashDown),
      downInstallmentCount: n(p?.downInstallmentCount), downInstallmentAmt: n(p?.downInstallmentAmt),
      financeAmount: n(p?.financeAmount), financeInstallments: n(p?.financeInstallments), monthlyPayment: n(p?.monthlyPayment),
      saleStatus: (p?.saleStatus as string | null) ?? null, hasPrice: !!p,
      promo: m ? { pro1Condition: String(m.pro1Condition ?? ""), pro1FreeCount: n(m.pro1FreeCount), pro1TotalValue: n(m.pro1TotalValue), pro2RepairBudget: n(m.pro2RepairBudget), pro3AnnualPm: n(m.pro3AnnualPm) } : undefined,
    }
  })
}

/** ดึงรูปเป็น data URL — ย่อด้วย sharp (ยาวสุด 1200px, jpeg q75, หมุนตาม EXIF) กัน PDF บวม
 *  (รูปมือถือ 3-5MB/รูป ×5 = PDF 15MB) · timeout ต่อรูป · ล้มเหลว = null (ใช้ placeholder) */
export async function fetchImageDataUrl(url: string, timeoutMs = 6000, maxPx = 1200): Promise<string | null> {
  if (!/^https?:\/\//.test(url)) return null
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const r = await fetch(url, { signal: ac.signal })
    if (!r.ok) return null
    const buf = Buffer.from(await r.arrayBuffer())
    try {
      const out = await sharp(buf).rotate().resize({ width: maxPx, height: maxPx, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer()
      return `data:image/jpeg;base64,${out.toString("base64")}`
    } catch {
      // sharp อ่านไม่ได้ (เช่น HEIC) → ลองส่งดิบเฉพาะ jpeg/png
      const mime = buf[0] === 0x89 ? "image/png" : buf[0] === 0xff ? "image/jpeg" : null
      return mime ? `data:${mime};base64,${buf.toString("base64")}` : null
    }
  } catch { return null } finally { clearTimeout(t) }
}

/** รูปทั้งหมดของรถ (หลัก + มุมอื่น, ไม่ซ้ำ) */
export function vehicleImageUrls(v: CatalogVehicle): { main?: string; others: string[] } {
  const ph = v.photos ?? {}
  const main = (ph.front || v.photoUrl || ph.left || ph.right || ph.back || ph.cabin || "").trim() || undefined
  const others = ["front", "left", "right", "back", "cabin"].map((k) => (ph[k] ?? "").trim()).filter((u) => u && u !== main)
  return { main, others: [...new Set(others)].slice(0, 4) }
}

export async function loadImages(vs: CatalogVehicle[]): Promise<Map<string, string>> {
  const urls = new Set<string>()
  for (const v of vs) { const { main, others } = vehicleImageUrls(v); if (main) urls.add(main); others.forEach((u) => urls.add(u)) }
  const out = new Map<string, string>()
  await Promise.all([...urls].map(async (u) => { const d = await fetchImageDataUrl(u); if (d) out.set(u, d) }))
  return out
}

const beYear = (iso?: string) => (iso && /^\d{4}/.test(iso) ? String(Number(iso.slice(0, 4)) + 543) : "")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function vehiclePage(v: CatalogVehicle, cfg: CatalogConfig, images: Map<string, string>, isFirst: boolean): any[] {
  const { main, others } = vehicleImageUrls(v)
  const mainData = main ? images.get(main) : undefined
  const promos = promoCopy(v.promo)
  const hasPromo = promos.length > 0

  // ── รูปหลัก / placeholder ──
  const heroImg = mainData
    ? { image: mainData, fit: [CONTENT_W, 128], alignment: "center", margin: [0, 0, 0, 0] }
    : {
        table: { widths: ["*"], heights: [100], body: [[{
          fillColor: CREAM, alignment: "center", margin: [0, 37, 0, 0],
          stack: [
            { text: seg("ยังไม่มีรูปรถ"), color: GOLD_DK, bold: true, fontSize: 14 },
            { text: seg("อัปโหลดรูป 5 มุมได้ที่หน้า รถ → แก้ไข"), color: MUTED, fontSize: 9, margin: [0, 2, 0, 0] },
          ],
        }]] },
        layout: { hLineWidth: () => 0.8, vLineWidth: () => 0.8, hLineColor: () => RULE, vLineColor: () => RULE },
      }
  const thumbs = others.map((u) => images.get(u)).filter(Boolean) as string[]

  // ── สเปกรถ ──
  const specRows: [string, string][] = [
    ["ยี่ห้อ / รุ่น", [v.brand, v.model].filter(Boolean).join(" ") || "-"],
    ["เบอร์รถ", v.truckNumber || "-"],
    ["ทะเบียน", v.licensePlate || "-"],
    ["ประเภท", [v.vehicleType, v.characteristic].filter(Boolean).join(" · ") || "Mixer"],
    ["สี", v.color || "-"],
    ["ปีจดทะเบียน", beYear(v.registrationDate) ? `พ.ศ. ${beYear(v.registrationDate)}` : "-"],
    ["เครื่องยนต์", v.engineSize || "-"],
  ]
  const specBlock = {
    width: "*",
    stack: [
      { text: seg("ข้อมูลรถ"), color: GOLD_DK, bold: true, fontSize: 10, margin: [0, 0, 0, 3] },
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 230, y2: 0, lineWidth: 0.8, lineColor: RULE }], margin: [0, 0, 0, 4] },
      ...specRows.map(([k, val]) => ({ columns: [
        { text: seg(k), color: MUTED, fontSize: 9, width: 72 },
        { text: k === "ทะเบียน" || k === "เบอร์รถ" ? val : seg(val), color: "#27272a", fontSize: 10, bold: true, width: "*" },
      ], margin: [0, 1.5, 0, 1.5] })),
    ],
  }

  // ── ราคา + hero ──
  const priceRow = (label: string, value: string, big = false) => ({
    columns: [
      { text: seg(label), fontSize: big ? 10.5 : 9.5, bold: big, color: big ? INK : "#52525b", width: "*" },
      { text: value, alignment: "right", fontSize: big ? 12 : 10, bold: true, color: big ? GOLD_DK : INK, width: "auto" },
    ], margin: [0, 1.5, 0, 1.5],
  })
  const priceRows = v.hasPrice ? [
    priceRow("ราคาขาย", `${fm(v.totalSalePrice ?? 0)} บาท`, true),
    priceRow("เงินดาวน์", `${fm(v.downPayment ?? 0)} บาท`),
    ...(v.cashDown ? [priceRow("ดาวน์เงินสด (จ่ายวันทำสัญญา)", `${fm(v.cashDown)} บาท`)] : []),
    ...(v.downInstallmentCount ? [priceRow(`ผ่อนดาวน์ ${v.downInstallmentCount} งวด`, `${fm(v.downInstallmentAmt ?? 0)} บาท/งวด`)] : []),
    ...(v.financeAmount ? [priceRow(`ยอดผ่อน ${v.financeInstallments ? `${v.financeInstallments} งวด` : ""}`, `${fm(v.financeAmount)} บาท`)] : []),
  ] : [{ text: seg("ยังไม่กำหนดราคาขาย — สอบถามฝ่ายขาย"), color: MUTED, fontSize: 9.5, italics: true }]
  const priceBlock = {
    width: 225,
    table: { widths: ["*"], body: [[{
      fillColor: CREAM, margin: [10, 8, 10, 8],
      stack: [
        { text: seg("ราคาและแผนผ่อนชำระ"), color: GOLD_DK, bold: true, fontSize: 10, margin: [0, 0, 0, 4] },
        ...priceRows,
        ...(v.hasPrice && v.monthlyPayment ? [{
          margin: [0, 6, 0, 0],
          table: { widths: ["*"], body: [[{
            fillColor: GOLD, alignment: "center", margin: [6, 5, 6, 5],
            stack: [
              { text: seg("ผ่อนสบาย เพียงเดือนละ"), color: INK, fontSize: 9 },
              { text: `${fm(v.monthlyPayment)} บาท`, color: INK, bold: true, fontSize: 20, margin: [0, 1, 0, 0] },
              ...(v.financeInstallments ? [{ text: seg(`${v.financeInstallments} งวด · หักจากค่าเที่ยวรายเดือน`), color: INK, fontSize: 8 }] : []),
            ],
          }]] },
          layout: "noBorders",
        }] : []),
      ],
    }]] },
    layout: { hLineWidth: () => 0.8, vLineWidth: () => 0.8, hLineColor: () => RULE, vLineColor: () => RULE },
  }

  const bullets = (items: string[], color = "#3f3f46") => items.map((t) => ({
    columns: [{ text: "•", width: 10, color: GOLD, bold: true }, { text: seg(t), width: "*", color, fontSize: 9.5 }], margin: [0, 0.5, 0, 0.5],
  }))

  // โปรฯ: ถ้อยคำจาก lib/promo-copy (ชุดเดียวกับโปสเตอร์/หน้า /trucks) — การ์ด 3 คอลัมน์เหมือนโปสเตอร์,
  // 1 บรรทัดใน promo-copy = 1 บรรทัดในการ์ด (ตัดบรรทัดตามวลีที่ฝ่ายขายกำหนด)
  const promoLine = (l: PromoSeg[]) => ({
    text: l.map((x) => typeof x === "string" ? { text: seg(x) }
      : "b" in x ? { text: seg(x.b), bold: true }
      : { text: seg(x.big), bold: true, fontSize: 12, color: GOLD_DK }),
  })
  const promoCards = {
    columnGap: 6,
    columns: promos.slice(0, 3).map((p) => ({
      width: "*",
      table: { widths: ["*"], body: [
        [{ fillColor: CREAM, margin: [6, 3, 6, 3], stack: [
          { text: seg(p.badge), color: GOLD, bold: true, fontSize: 8 },
          { text: seg(p.title), color: GOLD_DK, bold: true, fontSize: 9.5 },
        ] }],
        [{ margin: [6, 3, 6, 4], color: INK, fontSize: 9, lineHeight: 1, stack: p.lines.map(promoLine) }],
      ] },
      layout: { hLineWidth: () => 0.7, vLineWidth: () => 0.7, hLineColor: () => RULE, vLineColor: () => RULE },
    })),
  }
  const promoNotes = [...new Set(promos.map((p) => p.note).filter((t): t is string => !!t))]

  return [
    // header — ขึ้นหน้าใหม่ก่อนหัวคันถัดไป (ไม่ใช้ pageBreak after ท้ายหน้า: หน้าเต็มพอดีจะได้หน้าเปล่า)
    {
      ...(isFirst ? {} : { pageBreak: "before" }),
      columns: [
        { width: "*", stack: [
          ...(LOGO ? [{ image: `data:image/jpeg;base64,${LOGO}`, width: 190 }] : [{ text: seg(COMPANY.name), bold: true, fontSize: 14, color: INK }]),
          { text: seg(cfg.tagline), color: MUTED, fontSize: 9, margin: [0, 4, 0, 0] },
        ] },
        { width: 200, stack: [
          { text: "CATALOG", color: GOLD, fontSize: 9, characterSpacing: 3, alignment: "right" },
          { text: v.licensePlate || "-", bold: true, fontSize: 22, color: GOLD_DK, alignment: "right", margin: [0, 0, 0, 0] },
          { text: seg([v.brand, v.model].filter(Boolean).join(" ") || "รถโม่ปูน"), color: INK, fontSize: 11, bold: true, alignment: "right" },
          ...(v.truckNumber ? [{ text: `เบอร์รถ ${v.truckNumber}`, color: MUTED, fontSize: 9, alignment: "right" }] : []),
        ] },
      ],
    },
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 1.2, lineColor: GOLD }], margin: [0, 6, 0, 8] },
    // hero image + thumbs
    heroImg,
    ...(thumbs.length ? [{ columns: thumbs.map((d) => ({ image: d, fit: [116, 48], alignment: "center" })), columnGap: 6, margin: [0, 5, 0, 0] }] : []),
    // spec + price
    { columns: [specBlock, priceBlock], columnGap: 14, margin: [0, 8, 0, 0] },
    // promo
    ...(hasPromo ? [
      { text: seg("โปรโมชั่นสำหรับรถคันนี้"), color: GOLD_DK, bold: true, fontSize: 10, margin: [0, 5, 0, 2] },
      promoCards,
      ...promoNotes.map((t) => ({ text: seg(t), color: MUTED, fontSize: 8, margin: [0, 2, 0, 0] })),
    ] : []),
    // selling points
    ...(cfg.sellingPoints.length ? [
      { text: seg("ทำไมต้องรถร่วม Mixer กับเรา"), color: GOLD_DK, bold: true, fontSize: 10, margin: [0, 4, 0, 1] },
      ...bullets(cfg.sellingPoints),
    ] : []),
    // contact + terms (ล่างสุด — absolute ไม่ใช้ เพราะเนื้อหาสั้นยาวต่างกัน)
    {
      margin: [0, 5, 0, 0],
      table: { widths: ["*"], body: [[{
        fillColor: CREAM, margin: [10, 4, 10, 4],
        columns: [
          { width: "auto", text: seg("ติดต่อฝ่ายขาย"), color: GOLD_DK, bold: true, fontSize: 10 },
          { width: "*", alignment: "right", text: [
            { text: seg(cfg.contactName || COMPANY.name), color: "#52525b", fontSize: 9 },
            ...(cfg.contactPhone ? [{ text: "  ·  โทร ", color: "#52525b", fontSize: 9 }, { text: cfg.contactPhone, color: INK, bold: true, fontSize: 11 }] : []),
            ...(cfg.contactLine ? [{ text: "  ·  LINE ", color: "#52525b", fontSize: 9 }, { text: cfg.contactLine, color: INK, bold: true, fontSize: 10 }] : []),
          ] },
        ],
      }]] },
      layout: { hLineWidth: () => 0.7, vLineWidth: () => 0.7, hLineColor: () => RULE, vLineColor: () => RULE },
    },
  ]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function catalogDocDef(vs: CatalogVehicle[], cfg: CatalogConfig, images: Map<string, string>): any {
  const title = vs.length === 1 ? `Catalog ${vs[0].licensePlate}` : `Catalog รถพร้อมขาย ${vs.length} คัน`
  return {
    pageSize: "A4",
    pageOrientation: "portrait",
    // ล่างเผื่อ footer = เงื่อนไข (config) + ชื่อบริษัท — อยู่ใน footer เพื่อไม่ล้นหน้า 2
    pageMargins: [48, 36, 48, 30 + 10 * cfg.terms.length],
    info: { title },
    defaultStyle: { font: "Sarabun", fontSize: 10, lineHeight: 1.15 },
    footer: (page: number, total: number) => ({
      margin: [48, 4, 48, 0],
      stack: [
        ...cfg.terms.map((t) => ({ text: seg(`* ${t}`), color: MUTED, fontSize: 7.5 })),
        { columns: [
          { text: seg(`${COMPANY.name} · ${COMPANY.address}`), color: "#a1a1aa", fontSize: 7 },
          { text: `${page} / ${total}`, alignment: "right", color: "#a1a1aa", fontSize: 7, width: 40 },
        ], margin: [0, 3, 0, 0] },
      ],
    }),
    content: vs.flatMap((v, i) => vehiclePage(v, cfg, images, i === 0)),
  }
}
