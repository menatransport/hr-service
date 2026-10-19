import "server-only"
import type { Db } from "mongodb"
import { prevMonth } from "@/lib/partner/utils"
import { seg } from "@/lib/partner/pdfmake-printer"

/**
 * ชุดอนุมัติเงินเดือนรถร่วม (Approval Packet) — pdfmake docDefinition
 *   หน้า 1: ปะหน้าผู้บริหาร (ยอดรวม + MoM + แยกแพล้นท์ + ผิดปกติ + หนี้ยกยอด)
 *   หน้า 2+: ตาราง NetPay รายคนทั้งงวด (landscape)
 *   หน้าสุดท้าย: ช่องลงนาม จัดทำ/ตรวจ/เสนอ/อนุมัติ + ประวัติสถานะจากระบบ
 */

const r2 = (n: number) => Math.round(n * 100) / 100
const num = (v: unknown) => (typeof v === "number" ? v : 0)
const fm = (n: number) =>
  n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const THM = ["", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"]
const thMonth = (m: string) => {
  const [y, mm] = m.split("-").map(Number)
  return `${THM[mm]} ${y}/${y + 543}`
}

const GRAY = "#f4f4f5"
const LINE = "#d4d4d8"
const tableLayout = {
  hLineWidth: () => 0.5, vLineWidth: () => 0.5,
  hLineColor: () => LINE, vLineColor: () => LINE,
  paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 2, paddingBottom: () => 2,
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildPayrollPacket(db: Db | any, month: string): Promise<any> {
  const [entries, prevEntries, drivers, status] = await Promise.all([
    db.collection("payroll_entries").find({ month }).toArray(),
    db.collection("payroll_entries").find({ month: prevMonth(month) })
      .project({ totalIncome: 1, netPay: 1 }).toArray(),
    db.collection("drivers").find({}).project({ contractCode: 1, driverName: 1, plant: 1, licensePlate: 1 }).toArray(),
    db.collection("month_status").findOne({ month }),
  ])
  if (entries.length === 0) throw new Error(`งวด ${month} ยังไม่มีข้อมูลเงินเดือน`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dMap = Object.fromEntries(drivers.map((d: any) => [d.contractCode as string, d]))

  const T = {
    income: r2(entries.reduce((s: number, e: never) => s + num((e as Record<string, unknown>).totalIncome), 0)),
    deduct: r2(entries.reduce((s: number, e: never) => s + num((e as Record<string, unknown>).totalDeductions), 0)),
    net: r2(entries.reduce((s: number, e: never) => s + num((e as Record<string, unknown>).netPay), 0)),
    wht: r2(entries.reduce((s: number, e: never) => s + num((e as Record<string, unknown>).whtAmount), 0)),
    paid: r2(entries.reduce((s: number, e: never) => s + num((e as Record<string, unknown>).paidNet), 0)),
    carryIn: r2(entries.reduce((s: number, e: never) => s + num((e as Record<string, unknown>).carryIn), 0)),
    carryOut: r2(entries.reduce((s: number, e: never) => s + num((e as Record<string, unknown>).carryOut), 0)),
    trips: entries.reduce((s: number, e: never) => s + num((e as Record<string, unknown>).tripCount), 0),
  }
  const P = {
    income: r2(prevEntries.reduce((s: number, e: never) => s + num((e as Record<string, unknown>).totalIncome), 0)),
    net: r2(prevEntries.reduce((s: number, e: never) => s + num((e as Record<string, unknown>).netPay), 0)),
  }
  const mom = (cur: number, prev: number) =>
    prev ? `${cur >= prev ? "+" : ""}${(((cur - prev) / prev) * 100).toFixed(1)}% จากงวดก่อน` : "—"

  // แยกแพล้นท์ (top 12 + อื่นๆ)
  const plantAgg: Record<string, { n: number; net: number }> = {}
  for (const e of entries) {
    const p = (dMap[(e as Record<string, unknown>).contractCode as string]?.plant as string) || "ไม่ระบุ"
    plantAgg[p] ??= { n: 0, net: 0 }
    plantAgg[p].n++
    plantAgg[p].net = r2(plantAgg[p].net + num((e as Record<string, unknown>).netPay))
  }
  const plants = Object.entries(plantAgg).sort((a, b) => b[1].net - a[1].net)

  // ผิดปกติ
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anomalies: string[] = entries.flatMap((e: any) => {
    const out: string[] = []
    const nameOf = `${e.contractCode} ${dMap[e.contractCode]?.driverName ?? ""}`
    if (num(e.netPay) < 0) out.push(`${nameOf} — สุทธิติดลบ ${fm(num(e.netPay))}`)
    if (num(e.workingDays) > 0 && num(e.tripCount) === 0) out.push(`${nameOf} — มีวันทำงานแต่ไม่มีเที่ยว`)
    return out
  })

  const carryCnt = entries.filter((e: Record<string, unknown>) => num(e.carryOut) > 0).length

  // ── ตาราง NetPay รายคน ──
  const headRow = ["ลำดับ", "รหัสสัญญา", "ชื่อ พขร.", "แพล้นท์", "วัน", "เที่ยว", "รายรับ", "รายหัก", "สุทธิ", "ยกมา", "ยกไป", "WHT 3%", "ยอดโอน"]
    .map((t) => ({ text: t, bold: true, fillColor: GRAY, alignment: "center" as const }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = [...entries]
    .sort((a: any, b: any) => String(a.contractCode).localeCompare(String(b.contractCode)))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((e: any, i: number) => [
      { text: String(i + 1), alignment: "center" },
      { text: e.contractCode, alignment: "center" },
      { text: seg(dMap[e.contractCode]?.driverName ?? ""), noWrap: false },
      { text: seg((dMap[e.contractCode]?.plant as string) ?? "-"), alignment: "center" },
      { text: String(num(e.workingDays)), alignment: "center" },
      { text: String(num(e.tripCount)), alignment: "center" },
      { text: fm(num(e.totalIncome)), alignment: "right" },
      { text: fm(num(e.totalDeductions)), alignment: "right" },
      { text: fm(num(e.netPay)), alignment: "right", ...(num(e.netPay) < 0 ? { color: "#dc2626" } : {}) },
      { text: num(e.carryIn) ? fm(num(e.carryIn)) : "-", alignment: "right" },
      { text: num(e.carryOut) ? fm(num(e.carryOut)) : "-", alignment: "right", ...(num(e.carryOut) > 0 ? { color: "#dc2626" } : {}) },
      { text: num(e.whtAmount) ? fm(num(e.whtAmount)) : "-", alignment: "right" },
      { text: fm(num(e.paidNet)), alignment: "right", bold: true },
    ])
  const totalRow = [
    { text: "รวม", colSpan: 6, bold: true, fillColor: GRAY, alignment: "center" }, {}, {}, {}, {}, {},
    { text: fm(T.income), bold: true, fillColor: GRAY, alignment: "right" },
    { text: fm(T.deduct), bold: true, fillColor: GRAY, alignment: "right" },
    { text: fm(T.net), bold: true, fillColor: GRAY, alignment: "right" },
    { text: fm(T.carryIn), bold: true, fillColor: GRAY, alignment: "right" },
    { text: fm(T.carryOut), bold: true, fillColor: GRAY, alignment: "right" },
    { text: fm(T.wht), bold: true, fillColor: GRAY, alignment: "right" },
    { text: fm(T.paid), bold: true, fillColor: GRAY, alignment: "right" },
  ]

  // ── ประวัติสถานะ ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const history: any[] = ((status?.history as any[]) ?? []).map((h) => [
    { text: new Date(h.at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }), alignment: "center" },
    { text: h.action === "reject" ? "ตีกลับ" : ({ draft: "จัดทำ", checked: "ตรวจแล้ว", submitted: "ส่งอนุมัติ", approved: "อนุมัติ", locked: "ปิดงวด" } as Record<string, string>)[h.phase] ?? h.phase, alignment: "center" },
    { text: h.by ?? "" },
    { text: seg(h.note ?? "") },
  ])

  const kv = (label: string, value: string, extra = "") => [
    { text: label, color: "#52525b" },
    { text: value, bold: true, alignment: "right" as const },
    { text: extra, color: "#a1a1aa", alignment: "right" as const },
  ]

  const sigBox = (title: string, role: string) => ({
    width: "*",
    stack: [
      { text: "ลงชื่อ ....................................................", margin: [0, 28, 0, 2] },
      { text: "( .................................................... )", margin: [0, 2, 0, 2] },
      { text: title, bold: true },
      { text: role, color: "#71717a", fontSize: 13 },
      { text: "วันที่ ............ / ............ / ............", margin: [0, 4, 0, 0] },
    ],
    alignment: "center" as const,
  })

  return {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [36, 40, 36, 40],
    defaultStyle: { font: "Cordia", fontSize: 14, lineHeight: 1.05 },
    footer: (page: number, total: number) => ({
      columns: [
        { text: `ชุดอนุมัติเงินเดือนรถร่วม Mixer · งวดงาน ${thMonth(month)}`, color: "#a1a1aa", fontSize: 11 },
        { text: `หน้า ${page} / ${total}`, alignment: "right", color: "#a1a1aa", fontSize: 11 },
      ],
      margin: [36, 10, 36, 0],
    }),
    content: [
      // ═══ หน้า 1: ปะหน้า ═══
      { text: "บริษัท มีนา ทรานสปอร์ต จำกัด", fontSize: 20, bold: true },
      { text: `ชุดอนุมัติเงินเดือนรถร่วม Mixer — งวดงาน ${thMonth(month)}`, fontSize: 17, bold: true, margin: [0, 2, 0, 0] },
      { text: `จ่ายจริงต้นเดือน ${thMonth(nextM(month))} · จัดทำโดยระบบ MENA Partner`, color: "#71717a", fontSize: 13, margin: [0, 2, 0, 12] },
      {
        columns: [
          {
            width: "48%",
            table: {
              widths: ["*", "auto", "auto"],
              body: [
                kv("จำนวน พขร. ในงวด", `${entries.length} คน`, `${T.trips.toLocaleString()} เที่ยว`),
                kv("รายรับรวม", fm(T.income), mom(T.income, P.income)),
                kv("รายหักรวม", fm(T.deduct), ""),
                kv("เงินได้สุทธิงวดนี้", fm(T.net), mom(T.net, P.net)),
                kv("หนี้ยกมาจากงวดก่อน", fm(T.carryIn), ""),
                kv("หนี้ยกไปงวดหน้า", fm(T.carryOut), `${carryCnt} คน`),
                kv("ภาษีหัก ณ ที่จ่าย 3%", fm(T.wht), "นำส่งสรรพากร"),
                [
                  { text: "ยอดโอนสุทธิที่ขออนุมัติ", bold: true, fontSize: 16 },
                  { text: fm(T.paid), bold: true, fontSize: 16, alignment: "right" },
                  { text: "บาท", alignment: "right", color: "#71717a" },
                ],
              ],
            },
            layout: "noBorders",
          },
          { width: "4%", text: "" },
          {
            width: "44%",
            stack: [
              { text: "แยกตามแพล้นท์ (เรียงตามยอดสุทธิ)", bold: true, margin: [0, 0, 0, 4] },
              {
                table: {
                  widths: ["*", "auto", "auto"],
                  body: [
                    [
                      { text: "แพล้นท์", bold: true, fillColor: GRAY },
                      { text: "พขร.", bold: true, fillColor: GRAY, alignment: "center" },
                      { text: "สุทธิ", bold: true, fillColor: GRAY, alignment: "right" },
                    ],
                    ...plants.slice(0, 10).map(([p, v]) => [
                      { text: seg(p) }, { text: String(v.n), alignment: "center" }, { text: fm(v.net), alignment: "right" },
                    ]),
                    ...(plants.length > 10
                      ? [[
                          { text: `อื่นๆ อีก ${plants.length - 10} แพล้นท์` },
                          { text: String(plants.slice(10).reduce((s, [, v]) => s + v.n, 0)), alignment: "center" },
                          { text: fm(r2(plants.slice(10).reduce((s, [, v]) => s + v.net, 0))), alignment: "right" },
                        ]]
                      : []),
                  ],
                },
                layout: tableLayout,
                fontSize: 12,
              },
            ],
          },
        ],
      },
      ...(anomalies.length
        ? [
            { text: `รายการที่ควรทราบก่อนอนุมัติ (${anomalies.length})`, bold: true, margin: [0, 10, 0, 2] },
            { ul: anomalies.slice(0, 8).map((a) => ({ text: seg(a), fontSize: 12, color: "#b45309" })) },
            ...(anomalies.length > 8 ? [{ text: `… และอีก ${anomalies.length - 8} รายการ (ดูในระบบ)`, fontSize: 11, color: "#a1a1aa" }] : []),
          ]
        : [{ text: "ไม่พบรายการผิดปกติในงวดนี้", color: "#15803d", margin: [0, 10, 0, 0] }]),

      // ═══ ตาราง NetPay ═══
      {
        pageBreak: "before",
        text: `รายละเอียดรายคน (${entries.length} คน)`, fontSize: 16, bold: true, margin: [0, 0, 0, 6],
      },
      {
        table: {
          headerRows: 1,
          widths: [24, 52, "*", 60, 24, 30, 62, 62, 62, 55, 55, 50, 64],
          body: [headRow, ...rows, totalRow],
        },
        layout: tableLayout,
        fontSize: 11,
      },

      // ═══ หน้าลงนาม ═══
      { pageBreak: "before", text: "การพิจารณาอนุมัติ", fontSize: 16, bold: true, margin: [0, 0, 0, 4] },
      {
        text: `ยอดโอนสุทธิที่ขออนุมัติ ${fm(T.paid)} บาท (${entries.length} คน) · ภาษีหัก ณ ที่จ่ายนำส่ง ${fm(T.wht)} บาท · หนี้ยกไปงวดถัดไป ${fm(T.carryOut)} บาท`,
        margin: [0, 0, 0, 8],
      },
      {
        columns: [
          sigBox("ผู้จัดทำ", "ธุรการแผนกรถร่วม"),
          sigBox("ผู้ตรวจสอบ", "หัวหน้าแผนกรถร่วม"),
          sigBox("ผู้เสนออนุมัติ", "การเงิน"),
          sigBox("ผู้อนุมัติ", "ผู้บริหาร"),
        ],
        columnGap: 18,
      },
      ...(history.length
        ? [
            { text: "ประวัติการดำเนินการในระบบ", bold: true, margin: [0, 18, 0, 4] },
            {
              table: {
                headerRows: 1,
                widths: [90, 70, "*", "*"],
                body: [
                  ["วันเวลา", "การกระทำ", "โดย", "หมายเหตุ"].map((t) => ({ text: t, bold: true, fillColor: GRAY, alignment: "center" as const })),
                  ...history,
                ],
              },
              layout: tableLayout,
              fontSize: 11,
            },
          ]
        : []),
    ],
  }
}

function nextM(month: string): string {
  const [y, m] = month.split("-").map(Number)
  return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}`
}
