import "server-only"
import fs from "fs"
import path from "path"
import { COMPANY } from "@/lib/partner/contract-pdfmake-helpers"
import { COMPANY_BANK } from "@/lib/partner/company-bank"
import { seg } from "@/lib/partner/pdfmake-printer"
import type { Quotation } from "@/lib/partner/quotation"

/** ใบเสนอราคา — pdfmake สไตล์หรู โทนทอง (แถบหัว gradient จำลองด้วยแถบทอง + เส้นคั่น)
 *  ออกแบบเพื่อ Export PDF: A4 portrait, header/footer ต่อเนื่องทุกหน้า,
 *  ตาราง/สรุปราคา/ลายเซ็น ห่อ unbreakable ไม่ให้ถูกตัดข้ามหน้า */

const GOLD = "#C9A227"
const GOLD_DK = "#8C6B1F"
const INK = "#3F3000"
const RULE = "#E7C86E"
const CONTENT_W = 499 // A4 (595.28) − ซ้าย 48 − ขวา 48 ≈ 499
const fm = (n: number) => (n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fm2 = (n: number) => (n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const THM = ["", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"]
function thDate(iso?: string | null): string {
  if (!iso) return "-"
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
  return `${d} ${THM[m]} ${y + 543}`
}

let LOGO = ""
try { LOGO = fs.readFileSync(path.join(process.cwd(), "partner-assets", "fonts", "mena-logo.jpg")).toString("base64") } catch { /* ไม่มีโลโก้ก็ได้ */ }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function quotationDocDef(q: Quotation): any {
  // พาเนลคู่สัญญา (ลูกค้า / ผู้เสนอราคา) — สไตล์ Bill-To/Prepared-By มาตรฐานสากล
  const party = (thLabel: string, enLabel: string, bigName: string, rows: [string, string][]) => ({
    width: "*",
    table: { widths: ["*"], body: [[
      {
        fillColor: "#FAF7EF",
        margin: [12, 8, 12, 8],
        stack: [
          { columns: [
            { text: seg(thLabel), color: GOLD_DK, bold: true, fontSize: 10 },
            { text: enLabel, color: GOLD, fontSize: 8, characterSpacing: 1.5, alignment: "right", margin: [0, 2, 0, 0] },
          ] },
          { text: seg(bigName || "-"), bold: true, fontSize: 12, color: INK, margin: [0, 5, 0, 4] },
          ...rows.map(([k, v]) => ({ columns: [
            { text: seg(k), color: "#a1a1aa", fontSize: 9, width: 40 },
            { text: seg(v || "-"), color: "#3f3f46", fontSize: 10, width: "*" },
          ], margin: [0, 1, 0, 1] })),
        ],
      },
    ]] },
    layout: "noBorders",
  })
  const priceRow = (label: string, value: string, opts: { big?: boolean; gold?: boolean } = {}) => [
    { text: seg(label), fontSize: opts.big ? 11 : 10, bold: opts.big, color: opts.big ? INK : "#52525b", margin: [0, opts.big ? 3 : 1.5, 0, opts.big ? 3 : 1.5] },
    { text: value, alignment: "right", fontSize: opts.big ? 13 : 10, bold: true, color: opts.gold ? GOLD_DK : INK, margin: [0, opts.big ? 3 : 1.5, 0, opts.big ? 3 : 1.5] },
  ]

  // สถานะ: ไม่แสดงป้ายสถานะบนเอกสาร — คงไว้แค่ลายน้ำ ฉบับร่าง/ยกเลิก
  // ยืนราคา: ใช้ค่าที่ตั้งไว้ ถ้าไม่มี default +30 วันจากวันออกเอกสาร
  const addDays = (iso: string, n: number) => { const d = new Date(iso.slice(0, 10) + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString() }
  const effValid = q.validUntil || addDays(q.createdAt || new Date().toISOString(), 30)

  return {
    pageSize: "A4",
    pageOrientation: "portrait",
    pageMargins: [48, 40, 48, 48],
    info: { title: `ใบเสนอราคา ${q.quotationNo}` },
    defaultStyle: { font: "Sarabun", fontSize: 10, lineHeight: 1.15 },
    // ── ลายน้ำสถานะ: ฉบับร่าง (lead) / ยกเลิก (lost) — ฉบับจริง (quoted+) ไม่มีลายน้ำ ──
    ...(q.status === "lead"
      ? { watermark: { text: seg("ฉบับร่าง"), color: GOLD, opacity: 0.06, bold: true } }
      : q.status === "lost"
      ? { watermark: { text: seg("ยกเลิก"), color: "#b91c1c", opacity: 0.08, bold: true } }
      : {}),

    // ── Header ต่อเนื่องทุกหน้า: หน้า 1 ใช้หัวเต็ม (โลโก้) ใน content, หน้า 2+ ใช้แถบสรุปย่อ ──
    header: (page: number) => {
      if (page === 1) return { text: "" }
      return {
        margin: [48, 18, 48, 0],
        stack: [
          {
            columns: [
              { text: seg(COMPANY.name), fontSize: 9, bold: true, color: GOLD_DK },
              { text: seg(`ใบเสนอราคา ${q.quotationNo}`), alignment: "right", fontSize: 9, color: "#a1a1aa" },
            ],
          },
          { canvas: [{ type: "line", x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 0.5, lineColor: RULE }], margin: [0, 3, 0, 0] },
        ],
      }
    },

    // ── Footer ต่อเนื่องทุกหน้า ──
    footer: (page: number, total: number) => ({
      columns: [
        { text: seg(COMPANY.name), color: "#a1a1aa", fontSize: 9 },
        { text: `${page}/${total}`, alignment: "right", color: "#a1a1aa", fontSize: 9 },
      ],
      margin: [48, 12, 48, 0],
    }),

    // ── หัวข้อ (headlineLevel 1) ห้ามตกท้ายหน้าโดยไม่มีเนื้อหาตาม / เริ่มท้ายหน้าเกินไป → ขึ้นหน้าใหม่ ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pageBreakBefore: (node: any, followingNodesOnPage: any[]) =>
      node.headlineLevel === 1 &&
      (followingNodesOnPage.length === 0 || (node.startPosition?.verticalRatio ?? 0) > 0.9),

    content: [
      // ── หน้า 1: หัวเอกสารเต็ม — โลโก้บรรทัดบน · ชื่อบริษัท | บล็อกเลขที่ใบเสนอ (ขวา) ──
      {
        columns: [
          {
            width: "*",
            stack: [
              ...(LOGO
                ? [{ image: `data:image/jpeg;base64,${LOGO}`, width: 300, margin: [0, 10, 0, 0] }]
                : [{ text: seg(COMPANY.name), bold: true, fontSize: 16, color: INK }]),
            ],
          },
          {
            width: 168,
            stack: [
              { text: "ใบเสนอราคา", bold: true, fontSize: 20, color: GOLD_DK, alignment: "right" },
              { text: "QUOTATION", fontSize: 9, color: GOLD, alignment: "right", characterSpacing: 2 },
              { text: seg(`เลขที่ ${q.quotationNo}`), fontSize: 11, bold: true, color: INK, alignment: "right", margin: [0, 4, 0, 0] },
              { text: seg(`วันที่ ${thDate(q.createdAt)}`), fontSize: 10, color: "#52525b", alignment: "right" },
              // ยืนราคา (กล่องเด่น — แสดงเสมอ, default +30 วัน)
              { table: { widths: ["*"], body: [[
                { text: seg(`ยืนราคาถึง ${thDate(effValid)}`), color: "#9a3412", fillColor: "#FEF3C7", bold: true, fontSize: 10, alignment: "center", margin: [4, 3, 4, 3] },
              ]] }, layout: "noBorders", margin: [0, 5, 0, 0] },
            ],
          },
        ],
      },
      // แถบทองคั่น
      { canvas: [{ type: "rect", x: 0, y: 0, w: CONTENT_W, h: 3.2, color: GOLD }], margin: [0, 6, 0, 6] },

      // ── คู่สัญญา: ลูกค้า (Customer) | ผู้เสนอราคา (Sales Rep) — พาเนลสไตล์ใบเสนอมาตรฐานสากล ──
      {
        unbreakable: true,
        columns: [
          party("ลูกค้า", "CUSTOMER", q.customerName, [["โทร", q.customerPhone ?? "-"]]),
          { width: 16, text: "" },
          party("ผู้เสนอราคา", "SALES REP", q.salesName, [["อีเมล", q.salesEmail]]),
        ],
        margin: [0, 0, 0, 8],
      },

      // ── รถที่เสนอ (หัวข้อ + ตาราง + รูป ห่อ unbreakable ไม่ให้ตาราง/รูปถูกตัดข้ามหน้า) ──
      {
        unbreakable: true,
        stack: [
          { text: "รายการรถที่เสนอขาย", headlineLevel: 1, bold: true, fontSize: 11, color: INK, margin: [0, 0, 0, 4] },
          {
            table: {
              widths: ["*", "*", "*", "*"],
              body: [
                [
                  { text: "ทะเบียน", bold: true, color: INK, fillColor: "#FBF3D9", margin: [4, 3, 4, 3] },
                  { text: "ยี่ห้อ", bold: true, color: INK, fillColor: "#FBF3D9", margin: [4, 3, 4, 3] },
                  { text: "รุ่น", bold: true, color: INK, fillColor: "#FBF3D9", margin: [4, 3, 4, 3] },
                  { text: "เบอร์รถ", bold: true, color: INK, fillColor: "#FBF3D9", margin: [4, 3, 4, 3] },
                ],
                [
                  { text: seg(q.licensePlate || "-"), bold: true, margin: [4, 3, 4, 3] },
                  { text: seg(q.vehicleBrand || "-"), margin: [4, 3, 4, 3] },
                  { text: seg(q.vehicleModel || "-"), margin: [4, 3, 4, 3] },
                  { text: seg(q.truckNumber || "-"), margin: [4, 3, 4, 3] },
                ],
              ],
            },
            layout: {
              hLineWidth: () => 0.5, vLineWidth: () => 0.5,
              hLineColor: () => RULE, vLineColor: () => RULE,
            },
            margin: [0, 0, 0, 0],
          },
        ],
        margin: [0, 0, 0, 8],
      },

      // ── สรุปราคา + แผนไฟแนนซ์ (ห่อ unbreakable — Grand Total ไม่ถูกตัดข้ามหน้า) ──
      {
        unbreakable: true,
        stack: [
          {
            columns: [
              {
                width: "*",
                stack: [
                  { text: "สรุปราคา", headlineLevel: 1, bold: true, fontSize: 11, color: GOLD_DK, margin: [0, 0, 0, 4] },
                  { table: { widths: ["*", "auto"], body: [
                    priceRow("ราคาขายรวม", `${fm2(q.totalSalePrice)} บาท`, { big: true, gold: true }),
                    priceRow("เงินดาวน์รวม", `${fm2(q.downPayment)} บาท`),
                    priceRow("ดาวน์ชำระวันทำสัญญา", `${fm2(q.cashDown)} บาท`),
                    priceRow("ดาวน์ผ่อน", q.downInstallmentCount ? `${fm(q.downInstallmentAmt)} × ${q.downInstallmentCount} งวด` : "-"),
                    ...(q.savingsUsed ? [priceRow("ใช้เงินสะสม พจส.", `${fm2(q.savingsUsed)} บาท`)] : []),
                  ] }, layout: "noBorders" },
                ],
              },
              { width: 20, text: "" },
              {
                width: "*",
                stack: [
                  { text: "แผนไฟแนนซ์", bold: true, fontSize: 11, color: GOLD_DK, margin: [0, 0, 0, 4] },
                  { table: { widths: ["*", "auto"], body: [
                    priceRow("ยอดจัดไฟแนนซ์", `${fm2(q.financeAmount)} บาท`),
                    priceRow("จำนวนงวด", q.financeInstallments ? `${q.financeInstallments} งวด` : "-"),
                    priceRow("ค่างวด/เดือน", `${fm2(q.monthlyPayment)} บาท`, { big: true, gold: true }),
                  ] }, layout: "noBorders" },
                ],
              },
            ],
          },
        ],
        margin: [0, 0, 0, 8],
      },

      // ── Hero: ค่างวด/เดือน (จุดที่ลูกค้าสนใจสุด) ──
      {
        unbreakable: true,
        table: { widths: ["*"], body: [[
          {
            fillColor: "#FBF3D9",
            margin: [14, 9, 14, 9],
            stack: [{
              columns: [
                { width: "*", stack: [
                  { text: seg("ผ่อนสบาย เพียงเดือนละ"), color: GOLD_DK, fontSize: 10 },
                  { text: `${fm(q.monthlyPayment)} บาท`, color: GOLD_DK, bold: true, fontSize: 24, margin: [0, 2, 0, 0] },
                ] },
                { width: "auto", stack: [
                  { text: seg(`ดาวน์ ${fm(q.downPayment)} บาท`), alignment: "right", fontSize: 10, bold: true, color: INK, margin: [0, 6, 0, 0] },
                  ...(q.financeInstallments ? [{ text: seg(`จัดไฟแนนซ์ ${q.financeInstallments} งวด`), alignment: "right", fontSize: 10, color: "#52525b" }] : []),
                  { text: seg(`ราคารวม ${fm(q.totalSalePrice)} บาท`), alignment: "right", fontSize: 10, color: "#52525b" },
                ] },
              ],
            }],
          },
        ]] },
        layout: { hLineWidth: () => 1, vLineWidth: () => 1, hLineColor: () => GOLD, vLineColor: () => GOLD },
        margin: [0, 0, 0, 6],
      },

      ...(q.extras ? [
        { text: "ของแถม / โปรโมชั่น", headlineLevel: 1, bold: true, fontSize: 11, color: GOLD_DK, margin: [0, 4, 0, 2] },
        { text: seg(q.extras), fontSize: 10, color: INK, margin: [0, 0, 0, 6] },
      ] : []),
      ...(q.note ? [
        { text: "หมายเหตุ", headlineLevel: 1, bold: true, fontSize: 11, color: GOLD_DK, margin: [0, 2, 0, 2] },
        { text: seg(q.note), fontSize: 10, color: "#52525b", margin: [0, 0, 0, 6] },
      ] : []),

      // ── เงื่อนไข (เป็นข้อ) — อยู่ใน flow, unbreakable ──
      {
        unbreakable: true,
        stack: [
          { canvas: [{ type: "line", x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 0.5, lineColor: RULE }], margin: [0, 4, 0, 4] },
          { text: "เงื่อนไข", bold: true, fontSize: 11, color: GOLD_DK, margin: [0, 0, 0, 4] },
          { ol: [
            seg("ราคานี้เป็นการเสนอเบื้องต้น ยังไม่รวมภาษีมูลค่าเพิ่มและค่าธรรมเนียมโอน (ถ้ามี)"),
            seg("การจองรถถือว่าสมบูรณ์เมื่อวางเงินจองและบริษัทออกหลักฐานรับเงินแล้ว"),
            seg("เงื่อนไขและอัตราการผ่อนขึ้นอยู่กับการอนุมัติของบริษัทไฟแนนซ์"),
            seg(`ใบเสนอราคานี้ยืนราคาถึงวันที่ ${thDate(effValid)}`),
          ], fontSize: 9, color: "#52525b" },
        ],
      },

      // ── ช่องทางการโอนเงิน — แถบบัญชีบริษัท (หลังเงื่อนไข ก่อนลายเซ็น)
      //    จงใจทำเป็นแถบบรรทัดเดียว: หน้า 1 เหลือที่ว่างใต้ลายเซ็นราว 30pt เท่านั้น
      //    กล่องสูงกว่านี้จะดันลายเซ็นตกไปหน้า 2 (ของเดิมจบใน 1 หน้า) ──
      {
        unbreakable: true,
        margin: [0, 5, 0, 0],
        table: { widths: ["*"], body: [[
          {
            fillColor: "#FAF7EF",
            margin: [10, 3, 10, 3],
            columns: [
              { width: "auto", text: seg("ช่องทางการโอนเงิน"), color: GOLD_DK, bold: true, fontSize: 10 },
              { width: "*", alignment: "right", text: [
                { text: seg(`${COMPANY_BANK.bank}  ·  ${COMPANY_BANK.accountName}  ·  `), color: "#52525b", fontSize: 9 },
                // เลขบัญชีไม่ผ่าน seg() — มี "-" ถ้าใส่ ZWSP จะถูกตัดขึ้นบรรทัดใหม่
                { text: COMPANY_BANK.accountNo, color: INK, bold: true, fontSize: 11 },
                { text: seg(`  ·  ${COMPANY_BANK.accountType}`), color: "#52525b", fontSize: 9 },
              ] },
            ],
          },
        ]] },
        layout: { hLineWidth: () => 0.7, vLineWidth: () => 0.7, hLineColor: () => RULE, vLineColor: () => RULE },
      },

      // ── ลายเซ็น (อยู่ใน flow ท้ายเอกสาร, unbreakable — hero box ช่วยดันเนื้อหาเต็มหน้า ลายเซ็นจึงอยู่ล่าง) ──
      {
        unbreakable: true,
        margin: [0, 5, 0, 0],
        columns: [
          { width: "*", stack: [
            { text: "ลงชื่อ .............................................", alignment: "center", fontSize: 10, margin: [0, 0, 0, 2] },
            { text: seg(`( ${q.salesName} )`), alignment: "center", bold: true, fontSize: 10 },
            { text: "พนักงานขาย", alignment: "center", color: "#71717a", fontSize: 10 },
          ] },
          { width: "*", stack: [
            { text: "ลงชื่อ .............................................", alignment: "center", fontSize: 10, margin: [0, 0, 0, 2] },
            { text: seg(`( ${q.customerName} )`), alignment: "center", bold: true, fontSize: 10 },
            { text: "ลูกค้า / ผู้ซื้อ", alignment: "center", color: "#71717a", fontSize: 10 },
          ] },
        ],
      },
    ],
  }
}
