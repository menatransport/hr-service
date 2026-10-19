/** pdfmake — ใบขอเปิดเจ้าหนี้รายใหม่ / แบบฟอร์มลงทะเบียนผู้ขาย + PDPA + ใบคัดเลือกผู้ส่งมอบ (FC102-07)
 *  ถอดแบบจาก components/vendor-doc-document.tsx (source of truth) */
import "server-only"
import fs from "fs"
import path from "path"
import type { Contract } from "@/lib/partner/types"
import { creditorDocxData } from "@/lib/partner/contract-docx-creditor"
import type { PromoMasterData } from "@/lib/partner/contract-docx"
import { S, v, vS, pageFooter } from "@/lib/partner/contract-pdfmake-helpers"

/* eslint-disable @typescript-eslint/no-explicit-any */

// โลโก้หัวจดหมาย MENA (แบนเนอร์ โลโก้ + ชื่อบริษัทไทย/อังกฤษ) 1090x114
const LOGO =
  "data:image/jpeg;base64," +
  fs.readFileSync(path.join(process.cwd(), "partner-assets", "fonts", "mena-logo.jpg")).toString("base64")

// ข้อมูลติดต่อบริษัท (ตรงกับ vendor-doc-document.tsx)
const COMPANY_NAME = "บริษัท มีนาทรานสปอร์ต จำกัด (มหาชน)"
const CONTACT = {
  hqAddress: "455/12-14 ถนนพระราม 6 แขวงถนนเพชรบุรี เขตราชเทวี กรุงเทพมหานคร 10400",
  website: "www.menatransport.co.th",
  phone: "02-613-9450",
  privacyEmail: "data.privacy@menatransport.co.th",
}

const DOTS = "................"
const undot = (x: string) => (x === DOTS ? "" : x)
const dl = (n: number) => ".".repeat(n)

// ความกว้างเนื้อหา (A4 595.28 - ขอบ 45+45)
const CW = 505

// ── ค่าที่กรอก แบบ "ว่างได้" — ถ้าไม่มีข้อมูล แสดงเส้นกรอกเปล่าแทนจุดไข่ปลา ──
const bv = (x: string): any => {
  const t = undot(x ?? "")
  return t ? v(t) : { text: " " }
}
const bvS = (x: string): any => {
  const t = undot(x ?? "")
  return t ? vS(t) : { text: " " }
}

// ── checkbox วาดด้วย canvas (รองรับทุกฟอนต์) ──
function box(on = false): any {
  const el: any[] = [{ type: "rect", x: 0, y: 2.5, w: 9, h: 9, lineWidth: 0.8, lineColor: "#000" }]
  if (on) {
    el.push({ type: "line", x1: 1.5, y1: 7, x2: 4, y2: 10.5, lineWidth: 1.3, lineColor: "#000" })
    el.push({ type: "line", x1: 4, y1: 10.5, x2: 8, y2: 3.5, lineWidth: 1.3, lineColor: "#000" })
  }
  return { canvas: el, width: 11 }
}
// checkbox + label เป็นบล็อกเดียว (ใช้เป็น item ใน columns) — width auto
const chk = (label: any, on = false): any => ({
  width: "auto",
  columns: [box(on), { width: "auto", text: label, margin: [3, 0, 0, 0] }],
  columnGap: 0,
})
// บรรทัด checkbox เดี่ยว (full width, label กินพื้นที่ที่เหลือ)
const chkLine = (label: any, on = false): any => ({
  columns: [box(on), { width: "*", text: label, margin: [3, 0, 0, 0] }],
  columnGap: 0,
  margin: [0, 1, 0, 1],
})

// ═══ ระบบกริด label:value + เส้นกรอก (dashed) — ให้ทุกบรรทัดเริ่มตำแหน่งเดียวกัน ═══
const NO_B = [false, false, false, false]

const DASH_LAYOUT: any = {
  defaultBorder: false,
  hLineWidth: () => 0.7,
  hLineColor: () => "#444444",
  hLineStyle: () => ({ dash: { length: 1.5, space: 1.5 } }),
  vLineWidth: () => 0,
  paddingLeft: () => 0,
  paddingRight: () => 0,
  paddingTop: () => 2,
  paddingBottom: () => 1,
}

// เซลล์ label (ไม่มีเส้น)
const L = (t: any): any => ({ text: t, border: NO_B, margin: [0, 0, 4, 0] })
// เซลล์ค่า — วางบนเส้นประเต็มความกว้างคอลัมน์
const F = (val: any): any => ({ text: val ?? " ", border: [false, false, false, true] })
// เซลล์ checkbox (ไม่มีเส้น)
const C = (label: any, on = false): any => ({ ...chk(label, on), border: NO_B })

// ตารางกริดไร้เส้น (เว้นแต่เส้นกรอกใต้ค่า)
const grid = (widths: any[], body: any[][], extra: any = {}): any => ({
  table: { widths, body },
  layout: DASH_LAYOUT,
  ...extra,
})

// เส้นกรอกเปล่า (ยืดเต็มความกว้างที่กำหนด)
const dashLine = (w: any = "*", extra: any = {}): any => ({
  table: { widths: [w], body: [[{ text: " ", border: [false, false, false, true] }]] },
  layout: DASH_LAYOUT,
  ...extra,
})

// label + เส้นกรอกยาวชนขอบขวา (value วางบนเส้น)
const fillLine = (label: any, value: any = " ", extra: any = {}): any => ({
  table: {
    widths: ["auto", "*"],
    body: [
      [
        { text: label, border: NO_B, margin: [0, 0, 3, 0] },
        { text: value, border: [false, false, false, true] },
      ],
    ],
  },
  layout: DASH_LAYOUT,
  ...extra,
})

// checkbox + label + เส้นกรอกชนขอบขวา
const chkFill = (label: any, on = false): any => ({
  columns: [
    box(on),
    { width: "auto", text: label, margin: [3, 0, 0, 0] },
    { width: "*", ...dashLine("*"), margin: [4, -2.5, 0, 0] },
  ],
  columnGap: 0,
  margin: [0, 1.5, 0, 1.5],
})

// เส้นคั่น section บาง ๆ
const secRule = (m: number[] = [0, 5, 0, 4]): any => ({
  canvas: [{ type: "line", x1: 0, y1: 0, x2: CW, y2: 0, lineWidth: 0.7, lineColor: "#bbbbbb" }],
  margin: m,
})

// หัว section (ตัวหนา + เส้นบางใต้) — ใช้เฉพาะข้อความที่มีอยู่เดิมเท่านั้น
const secHead = (t: string): any => ({
  stack: [
    { text: S(t), bold: true },
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: CW, y2: 0, lineWidth: 0.7, lineColor: "#bbbbbb" }], margin: [0, 1.5, 0, 0] },
  ],
  margin: [0, 7, 0, 3],
})

// layout ตารางมาตรฐาน (เส้น 0.7 + ระยะขอบเซลล์)
const TBL_LAYOUT: any = {
  hLineWidth: () => 0.7,
  vLineWidth: () => 0.7,
  hLineColor: () => "#000000",
  vLineColor: () => "#000000",
  paddingLeft: () => 6,
  paddingRight: () => 6,
  paddingTop: () => 3,
  paddingBottom: () => 3,
}

function content(c: Contract, promo: PromoMasterData | null): any[] {
  const d = creditorDocxData(c, promo)

  // ความกว้างคอลัมน์ label หลักของหน้า 1 (ให้ค่าเริ่มตำแหน่งเดียวกันทุกกลุ่ม)
  const LBL_W = 150

  return [
    // ═══════════════ หน้า 1: ใบขอเปิดเจ้าหนี้รายใหม่ ═══════════════
    // แถวหัวกระดาษ: โลโก้ (ซ้าย) + กล่องรหัสเจ้าหนี้ (ขวา)
    {
      columns: [
        { image: LOGO, width: 265, margin: [0, 4, 0, 0] },
        { width: "*", text: "" },
        {
          width: "auto",
          fontSize: 12,
          table: {
            widths: ["auto", 84],
            body: [
              [
                { text: S("รหัสเจ้าหนี้ Winspeed"), border: NO_B, alignment: "right", noWrap: true, margin: [0, 2, 5, 0] },
                { text: bv(d.vendorCodeWinspeed), alignment: "center", margin: [0, 2, 0, 0] },
              ],
              [
                { text: S("รหัสเจ้าหนี้ ATMS"), border: NO_B, alignment: "right", noWrap: true, margin: [0, 2, 5, 0] },
                { text: bv(d.vendorCodeAtms), alignment: "center", margin: [0, 2, 0, 0] },
              ],
            ],
          },
          layout: {
            hLineWidth: () => 0.7,
            vLineWidth: () => 0.7,
            hLineColor: () => "#000",
            vLineColor: () => "#000",
          },
        },
      ],
      columnGap: 10,
      margin: [0, 0, 0, 5],
    },

    { text: S("ใบขอเปิดเจ้าหนี้รายใหม่ / สาขา"), bold: true, fontSize: 17, alignment: "center" },
    { text: S("แบบฟอร์มลงทะเบียนผู้ขาย / ผู้ให้บริการ"), bold: true, fontSize: 15, alignment: "center", margin: [0, 0, 0, 2] },

    { text: [S("วันที่ "), vS(d.docDate)], alignment: "right", margin: [0, 0, 0, 0] },
    secRule([0, 2, 0, 3]),

    // ── กลุ่มข้อมูลเจ้าหนี้: กริด label:value เส้นกรอกตรงแนวเดียวกันทุกบรรทัด ──
    grid(
      [LBL_W, "*"],
      [
        [L(S("ชื่อเจ้าหนี้ (ภาษาไทย) ")), F([bvS(d.buyerName)])],
        [L(S("ชื่อเจ้าหนี้ (ภาษาอังกฤษ) ")), F([bv(d.buyerNameEn)])],
        [
          {
            colSpan: 2,
            border: NO_B,
            ...fillLine(S("เลขประจำตัวผู้เสียภาษี/เลขทะเบียนพาณิชย์/เลขบัตรประชาชน "), [bv(d.nationalId)]),
          },
          {},
        ],
        [L(S("ที่อยู่ (ภาษาไทย) ")), F([bvS(d.driverAddress)])],
      ],
    ),

    // checkbox 2x2 คอลัมน์ตรงแนว
    grid(
      [190, "*"],
      [
        [C(S("สำนักงานใหญ่")), C(S("จดทะเบียนภาษีมูลค่าเพิ่ม"))],
        [C(S("สาขา (สาขาที่ ........)")), C([S("ภาษีหัก ณ ที่จ่าย "), { text: "3", bold: true }, S(" %")], true)],
      ],
      { margin: [0, 2, 0, 1] },
    ),

    // เงื่อนไขการชำระเงิน
    grid(
      [LBL_W, "*"],
      [
        [L(S("เครดิตการชำระเงิน ")), F([{ text: "30", bold: true }, S(" วัน")])],
        [L(S("เงื่อนไขการจ่ายชำระเงิน ")), F([bvS(d.paymentTerms)])],
      ],
    ),

    // ผู้ติดต่อ (2 แถวในตารางเดียว — คอลัมน์ตรงกันทุกแถว)
    grid(
      ["auto", "*", "auto", 78, "auto", "*"],
      [
        [L(S("ชื่อผู้ติดต่อ (1) ")), F([bvS(d.buyerName)]), L(S("เบอร์โทร ")), F([bv(d.phone)]), L(S("Email Address ")), F([bv(d.email)])],
        [L(S("ชื่อผู้ติดต่อ (2) ")), F(" "), L(S("เบอร์โทร ")), F(" "), L(S("Email Address ")), F(" ")],
      ],
    ),

    secRule(),

    // ── เอกสารประกอบ: ตาราง 3 คอลัมน์ หัวตารางพื้นเทา ──
    {
      table: {
        widths: ["*", "*", "*"],
        body: [
          [
            { text: S("บริษัท"), bold: true, alignment: "center", fillColor: "#f2f2f2" },
            { text: S("ร้านค้า"), bold: true, alignment: "center", fillColor: "#f2f2f2" },
            { text: S("บุคคลธรรมดา"), bold: true, alignment: "center", fillColor: "#f2f2f2" },
          ],
          [
            chkLine(S("หนังสือรับรองบริษัท (ไม่เกิน 6 เดือน)")),
            chkLine(S("สำเนาหนังสือจดทะเบียนการค้า")),
            chkLine(S("สำเนาบัตรประชาชน"), true),
          ],
        ],
      },
      layout: TBL_LAYOUT,
      margin: [0, 0, 0, 4],
    },

    grid(
      ["55%", "*"],
      [
        [C(S("สำเนาทะเบียนภาษีมูลค่าเพิ่ม ภ.พ.20 (กรณีจด VAT)")), C([S("อื่นๆ ระบุ "), dl(16)])],
        [C(S("สำเนาหน้าสมุดบัญชี (กรณีโอนเงิน)"), true), L("")],
      ],
    ),

    secRule(),

    // ── ข้อมูลบัญชีธนาคาร: กริด 2 แถว คอลัมน์ตรงกัน ──
    grid(
      ["auto", "*", "auto", 105],
      [
        [L(S("ชื่อเจ้าของบัญชี / หน้าเช็คสั่งจ่าย ")), F([bvS(d.buyerName)]), L(S("ประเภทบัญชี ")), F([bvS(d.bankAccountType)])],
        [L(S("หมายเลขบัญชีธนาคาร ")), F([bv(d.bankAccount)]), L(S("สาขา ")), F([bvS(d.bankBranch)])],
      ],
    ),

    { text: S("*** เอกสารทุกฉบับต้องมีลายเซ็นรับรองของผู้มีอำนาจจากผู้ขาย / ผู้ให้บริการด้วย"), fontSize: 13, margin: [0, 4, 0, 0] },
    { text: S("*** กรณีบริษัท ต้องมีกรรมการเซ็นรับรองพร้อมประทับตราบริษัทฯ"), fontSize: 13 },

    // ── การลงนาม + ส่วนสำหรับ บมจ. ──
    {
      unbreakable: true,
      stack: [
        {
          table: {
            widths: ["*", "auto", 170, "*"],
            body: [
              [
                { text: "", border: NO_B },
                { text: S("ลงชื่อและประทับตราผู้มีอำนาจบริษัทผู้ขาย/ผู้บริการ"), border: NO_B, margin: [0, 0, 4, 0] },
                { text: " ", border: [false, false, false, true] },
                { text: "", border: NO_B },
              ],
              [
                { text: "", border: NO_B },
                { text: "", border: NO_B },
                {
                  text: ["( ", d.buyerName === DOTS ? { text: " ".repeat(30) } : vS(d.buyerName), " )"],
                  alignment: "center",
                  border: NO_B,
                },
                { text: "", border: NO_B },
              ],
              [
                { text: "", border: NO_B },
                { text: S("ตำแหน่ง"), alignment: "right", border: NO_B, margin: [0, 2, 4, 0] },
                { text: " ", border: [false, false, false, true], margin: [0, 2, 0, 0] },
                { text: "", border: NO_B },
              ],
            ],
          },
          layout: DASH_LAYOUT,
          margin: [0, 8, 0, 0],
        },
        {
          table: {
            widths: ["*", "*"],
            body: [
              [
                { text: S("ส่วนนี้สำหรับ บมจ.มีนาทรานสปอร์ต"), bold: true, colSpan: 2, fillColor: "#f2f2f2", fontSize: 13 },
                {},
              ],
              [
                { border: NO_B, fontSize: 13, ...fillLine(S("ผู้ขอเปิด ")) },
                { border: NO_B, fontSize: 13, ...fillLine(S(" ฝ่าย")) },
              ],
              [
                { border: NO_B, fontSize: 13, ...fillLine(S("ผู้อนุมัติ (ผู้จัดการฝ่าย)")) },
                { border: NO_B, fontSize: 13, ...fillLine(S(" วันที่")) },
              ],
              [
                { border: NO_B, fontSize: 13, ...fillLine(S("บัญชีบันทึก")) },
                { border: NO_B, fontSize: 13, ...fillLine(S(" ผู้ตรวจทาน")) },
              ],
            ],
          },
          layout: {
            hLineWidth: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length ? 0.7 : 0),
            vLineWidth: (i: number, node: any) => (i === 0 || i === node.table.widths.length ? 0.7 : 0),
            hLineColor: () => "#000",
            vLineColor: () => "#000",
            paddingLeft: () => 8,
            paddingRight: () => 8,
            paddingTop: () => 2,
            paddingBottom: () => 2,
          },
          margin: [0, 8, 0, 0],
        },
        { text: "Rev.1", alignment: "right", fontSize: 12, margin: [0, 2, 0, 0] },
      ],
    },

    // ═══════════════ หน้า 2-3: หนังสือให้ความยินยอม PDPA ═══════════════
    { text: "Rev.1 (1.11.65)", alignment: "right", fontSize: 13, pageBreak: "before" },
    { text: S("หนังสือให้ความยินยอมเก็บรวบรวม ใช้ เปิดเผยข้อมูลส่วนบุคคลสำหรับ ลูกค้า คู่ค้า"), bold: true, fontSize: 17, alignment: "center", margin: [0, 0, 0, 8] },

    pdpaP("อ้างถึง พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ.2562 (พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล) บริษัท มีนาทรานสปอร์ต จำกัด (มหาชน) (บริษัท) ในฐานะผู้ควบคุมข้อมูลส่วนบุคคล ได้จัดทำนโยบายความเป็นส่วนตัวขึ้น เพื่อแจ้งให้ท่านในฐานะเจ้าของข้อมูลส่วนบุคคล ได้ทราบเกี่ยวกับรายละเอียดและวัตถุประสงค์ รวมถึงรายละเอียดเกี่ยวกับการเปิดเผยข้อมูลส่วนบุคคล ระยะเวลาในการจัดเก็บข้อมูลส่วนบุคคล ตลอดจนสิทธิตามกฎหมายของท่านที่เกี่ยวข้องกับข้อมูลส่วนบุคคล", [0, 0, 0, 3]),
    pdpaP("เพื่อให้สอดคล้องกับ พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล บริษัทมีความจำเป็นต้องขอความยินยอมในการเก็บ รวบรวม ใช้ หรือเปิดเผยข้อมูลส่วนบุคคลของท่านแก่บริษัท และ/หรือบุคคลที่ได้รับมอบหมายให้เป็นผู้ประมวลผลข้อมูลส่วนบุคคลจากบริษัท และ/หรือหน่วยงานของรัฐ และ/หรือเอกชนเพื่อปฏิบัติให้เป็นไปตามกฎหมาย ดังนี้", [0, 0, 0, 3]),
    {
      text: [S("ข้าพเจ้า (ชื่อ-สกุล) "), vS(d.buyerName), S(" เลขบัตรประชาชน "), v(d.nationalId), S(" ในฐานะเจ้าของข้อมูลส่วนบุคคล ได้อ่านและรับทราบนโยบายความเป็นส่วนตัวของบริษัทแล้ว และขอให้ความยินยอมแก่บริษัท ในการเก็บรวบรวม ใช้ หรือเปิดเผยข้อมูลส่วนบุคคลของข้าพเจ้าที่มีอยู่กับบริษัทได้ภายใต้ข้อกำหนด เงื่อนไข และวัตถุประสงค์ ดังนี้")],
      alignment: "left", leadingIndent: 36, margin: [0, 0, 0, 3],
    },

    pdpaH("1. ข้อมูลที่จัดเก็บและใช้โดยบริษัท", " ข้อมูลส่วนบุคคลของเจ้าของข้อมูลส่วนบุคคลที่บริษัทได้รับมา ได้แก่", [0, 5, 0, 2]),
    pdpaB("- ข้อมูลส่วนบุคคล หมายถึง ข้อมูลที่ทำให้สามารถระบุตัวบุคคลนั้นได้ไม่ว่าทางตรงหรือทางอ้อม จากคู่ค้า ลูกค้า เช่น คำนำหน้า ชื่อ นามสกุล วัน เดือน ปีเกิด เพศ อายุ สัญชาติ หมายเลขบัตรประชาชน เลขหนังสือเดินทาง เลขประจำตัวผู้เสียภาษีอากร เบอร์โทรศัพท์ อีเมล์ ที่อยู่ ไลน์ไอดี"),
    pdpaB("- ข้อมูลด้านการทำธุรกิจ หมายถึง ข้อมูลหรือสิ่งใดๆ ที่แสดงออกมาในรูปแบบเอกสาร แฟ้ม รายงาน หนังสือ แผนผัง แผนที่ ภาพวาด ภาพถ่าย ฟิล์ม การบันทึกภาพนิ่ง หรือภาพเคลื่อนไหว หรือเสียงการบันทึกโดยเครื่องมือทางอิเลคโทรนิกส์ที่ทำให้สิ่งที่บันทึกไว้ปรากฏขึ้นในเรื่องเกี่ยวกับการดำเนินธุรกิจของบุคคลที่สามารถระบุตัวบุคคลได้"),
    pdpaB("- ข้อมูลส่วนบุคคลที่มีความอ่อนไหว ได้แก่ ข้อมูลสุขภาพ ชีวภาพ ประวัติอาชญากรรม ศาสนา โดยเป็นข้อมูลส่วนบุคคลที่มีความสมบูรณ์ ถูกต้อง เป็นปัจจุบัน และมีคุณภาพ และถูกนำไปใช้ให้เป็นไปตามวัตถุประสงค์ที่กำหนดไว้ตามหนังสือนี้เท่านั้น และบริษัทจะดำเนินมาตรการที่เข้มงวดในการรักษาความมั่นคงปลอดภัย ตลอดจนการป้องกันมิให้มีการนำข้อมูลส่วนบุคคลไปใช้โดยมิได้รับอนุญาตจากเจ้าของข้อมูลส่วนบุคคลก่อน"),

    pdpaH("2. ความยินยอมในการเก็บรวบรวม ใช้ และเปิดเผยข้อมูลส่วนบุคคล", " ข้าพเจ้าตกลงยินยอมให้บริษัทเก็บรวบรวม ใช้ และเปิดเผยข้อมูลส่วนบุคคลและข้อมูลการใช้บริการของข้าพเจ้าได้ และยินยอมให้บริษัท ส่ง โอน ใช้ และ/หรือ เปิดเผยข้อมูลส่วนบุคคลให้แก่บุคคลใน บริษัท บริษัทอื่นๆ ในเครือเดียวกัน ผู้ประมวลผลข้อมูล นิติบุคคลหรือบุคคลใดๆ ที่เกี่ยวข้องตามสัญญา หรือคู่ค้าหรือพันธมิตรทางการค้าและธุรกิจ หรือให้ผู้บริการที่เป็นบุคคลภายนอก เช่น ผู้สอบบัญชี ผู้ตรวจสอบภายใน และผู้ตรวจสอบภายนอกของบริษัท ที่ปรึกษากฎหมายและทนายความ ผู้ให้บริการเกี่ยวกับเทคโนโลยีสารสนเทศ การวิเคราะห์ข้อมูล สถิติ การวิจัยและพัฒนาผลิตภัณฑ์ เป็นต้น หรือดำเนินการตามกฎหมาย หน่วยงานภาครัฐ หน่วยงานกำกับดูแล สถาบันการเงิน ผู้รับโอนสิทธิเรียกร้อง", [0, 5, 0, 2]),
    pdpaP("โดยมีวัตถุประสงค์ของการเก็บรวบรวม ใช้ หรือเปิดเผยข้อมูลส่วนบุคคล คือ 1. เพื่อวัตถุประสงค์ในการขายสินค้า ให้บริการ วิเคราะห์ข้อมูล ปรับปรุงคุณภาพสินค้าหรือการให้บริการ 2. เพื่อประโยชน์ในการดำเนินงานของบริษัท เช่น การจัดซื้อจัดจ้าง การทำสัญญา การทำธุรกรรมทางการเงิน การดำเนินกิจกรรมบริษัท การติดต่อประสานงาน การโฆษณา ประชาสัมพันธ์ หรือให้ข้อมูลข่าวสารต่างๆ 3. เพื่อปรับปรุงคุณภาพการทำงานให้มีประสิทธิภาพมากยิ่งขึ้น เช่น การจัดทำฐานข้อมูล วิเคราะห์และพัฒนากระบวนการดำเนินงานของบริษัท 4. เพื่อตรวจสอบรายการธุรกรรมที่อาจบ่งชี้ถึงการทุจริต 5. เพื่อประโยชน์ในการยืนยันหรือระบุตัวตนของเจ้าของข้อมูลส่วนบุคคล 6. เพื่อวัตถุประสงค์อื่นใดที่เกี่ยวข้องกับการขายสินค้าหรือให้บริการระหว่างท่านกับบริษัท 7. เพื่อปฏิบัติตามกฎหมายหรือกฎระเบียบของหน่วยงานราชการที่เกี่ยวข้องต่อการดำเนินงานของบริษัท โดยบริษัทจะจัดเก็บและใช้ข้อมูลดังกล่าวตามระยะเวลาเท่าที่จำเป็นตามวัตถุประสงค์ที่ได้แจ้งเจ้าของข้อมูลส่วนบุคคลหรือตามที่กฎหมายกำหนดไว้ หรือตามความจำเป็นทางเทคนิคเท่านั้น", [0, 0, 0, 3]),
    pdpaP("3. ข้าพเจ้ายินยอมให้บริษัทเก็บรวบรวมข้อมูลส่วนบุคคลของข้าพเจ้าจากแหล่งอื่นได้ เป็นต้นว่า ส่วนราชการ หรือหน่วยงานของรัฐ เป็นต้น", [0, 3, 0, 2]),
    { text: S("4. วิธีการเพิกถอนความยินยอม และผลการเพิกถอนความยินยอม"), bold: true, alignment: "left", leadingIndent: 36, margin: [0, 5, 0, 2] },
    pdpaP("ข้าพเจ้าในฐานะเจ้าของข้อมูลส่วนบุคคลอาจเพิกถอนความยินยอมทั้งหมดหรือส่วนใดส่วนหนึ่งตามหนังสือฉบับนี้โดยข้าพเจ้าจะแจ้งให้บริษัททราบเป็นหนังสือ และบริษัทอาจขอทราบถึงเหตุผลแห่งการนั้น"),
    pdpaP("การเพิกถอนความยินยอมของข้าพเจ้า จะไม่ส่งผลกระทบต่อการเก็บ รวบรวม ใช้ หรือเปิดเผยข้อมูลส่วนบุคคล ที่ข้าพเจ้าได้ยินยอมแก่บริษัทไปแล้วก่อนหน้านั้น ในกรณีที่การเพิกถอนความยินยอมเกิดผลกระทบต่อสิทธิหรือหน้าที่ใดๆ ของข้าพเจ้า ข้าพเจ้ายอมรับผลกระทบที่เกิดจากการนั้นได้"),
    pdpaP("ในกรณีที่มีการกำหนดหลักเกณฑ์วิธีการใดๆ ในอนาคตที่มีผลทำให้การให้ความยินยอมตามหนังสือฉบับนี้ จะต้องเปลี่ยนแปลง ปรับปรุง หรือแก้ไข เพื่อให้สอดคล้องกับหลักเกณฑ์และวิธีการดังกล่าว ข้าพเจ้ายินดีที่จะให้บริษัทดำเนินการจัดทำหนังสือขึ้นใหม่"),
    { text: S("5. เจ้าของข้อมูลส่วนบุคคลสามารถติดต่อได้ที่"), bold: true, alignment: "left", leadingIndent: 36, margin: [0, 5, 0, 2] },
    { text: S(COMPANY_NAME), margin: [0, 0, 0, 0] },
    { text: [S("ที่อยู่สำนักงาน: "), S(CONTACT.hqAddress)], margin: [0, 0, 0, 0] },
    { text: [S("เว็บไซต์ของบริษัท: "), CONTACT.website, S(" เบอร์โทรศัพท์: "), CONTACT.phone, S(" อีเมล์: "), CONTACT.privacyEmail], margin: [0, 0, 0, 4] },

    {
      unbreakable: true,
      stack: [
        pdpaP("ข้าพเจ้าได้อ่าน และเข้าใจข้อความซึ่งระบุไว้ข้างต้นของหนังสือยินยอมนี้อย่างชัดแจ้งแล้ว จึงได้ลงลายมือชื่อไว้เป็นหลักฐาน", [0, 6, 0, 4]),
        {
          table: {
            widths: ["35%", "*"],
            body: [
              [
                {
                  stack: [
                    { text: S("ชื่อบริษัท"), bold: true },
                    dashLine("*", { margin: [0, 16, 0, 0] }),
                    fillLine(S("วันที่"), " ", { margin: [0, 36, 0, 2] }),
                  ],
                },
                {
                  stack: [
                    { text: S("ชื่อของบุคคลผู้ให้ความยินยอม"), bold: true },
                    d.buyerName === DOTS
                      ? dashLine("60%", { margin: [0, 16, 0, 0] })
                      : { text: S(d.buyerName), bold: true, margin: [0, 16, 0, 0] },
                    fillLine(S("ลายเซ็น : "), " ", { margin: [0, 12, 0, 0] }),
                    fillLine(S("วันที่ลงนาม: "), " ", { margin: [0, 6, 0, 2] }),
                  ],
                },
              ],
            ],
          },
          layout: {
            hLineWidth: () => 0.7,
            vLineWidth: () => 0.7,
            hLineColor: () => "#000",
            vLineColor: () => "#000",
            paddingLeft: () => 8,
            paddingRight: () => 8,
            paddingTop: () => 6,
            paddingBottom: () => 6,
          },
          margin: [0, 6, 0, 0],
        },
      ],
    },

    // ═══════════════ หน้า 4: ใบคัดเลือกผู้ส่งมอบ FC102-07 ═══════════════
    {
      columns: [
        { width: "*", text: S("ใบคัดเลือกผู้ส่งมอบ"), bold: true, fontSize: 17, alignment: "center" },
        { width: "auto", text: "FC102-07", bold: true, fontSize: 13, margin: [0, 6, 0, 0] },
      ],
      pageBreak: "before",
    },
    { text: [S("วันที่ "), vS(d.docDate)], alignment: "right", margin: [0, 4, 0, 0] },
    secRule([0, 2, 0, 3]),

    // ── ข้อมูลผู้ส่งมอบ: กริด label:value ──
    grid(
      [70, "*"],
      [
        [L(S("ชื่อบริษัท ")), F([bvS(d.buyerName)])],
        [L(S("ที่อยู่ ")), F([bvS(d.driverAddress)])],
        [L(S("ชนิดสินค้า ")), F([bvS(d.productType)])],
      ],
    ),
    grid(
      [70, "*", "auto", 90, "auto", 70],
      [
        [L(S("ชื่อผู้ติดต่อ 1. ")), F([bvS(d.buyerName)]), L(S("โทร ")), F([bv(d.phone)]), L(S("แฟกซ์ ")), F(" ")],
        [{ text: S("2. "), alignment: "right", border: NO_B, margin: [0, 0, 4, 0] }, F(" "), L(S("โทร ")), F(" "), L(S("แฟกซ์ ")), F(" ")],
      ],
    ),

    secHead("ข้อมูลทั่วไป เอกสารอ้างอิง"),
    chkLine([S("การชำระเงิน "), { text: S("เครดิตตามระบบจ่าย 30 วัน"), bold: true }], true),
    chkFill(S("Catalog ใบเสนอราคา ")),
    chkFill(S("การรับรองผลิตภัณฑ์/รับรองระบบคุณภาพ ")),
    chkFill(S("อื่นๆ ")),

    secHead("คุณสมบัติประกอบการพิจารณา"),
    chkLine(S("1. ต้องเป็นผู้ที่จดทะเบียนการค้าเป็นนิติบุคคล เช่น ห้างร้าน บริษัท หรือบุคคลธรรมดาที่มีประสบการณ์ในงานนั้น ๆ"), true),
    chkLine(S("2. ต้องมีสำนักงานที่สามารถติดต่อได้สะดวกและต้องมีหนังสือรับรองการจดทะเบียนหรือเอกสาร ภพ.20")),
    chkLine(S("3. การจัดส่งสินค้า/การบริการ/การรับประกันการส่งมอบ"), true),
    chkLine(S("4. ต้องเสนอราคาที่ยุติธรรมไม่สูงเกินความเป็นจริง โดยใช้วิธีการสอบราคาหรือวิธีการที่เหมาะสมตามลักษณะงาน"), true),
    chkLine(S("5. ด้านคุณภาพจากการทดลองใช้งานหรือทดสอบจากตัวอย่างสินค้า"), true),
    chkLine([S("6. ให้เครดิตในการชำระเงิน ระบุ "), { text: S("30 วัน"), bold: true }], true),

    secHead("เกณฑ์ในการประเมิน"),
    { text: S("- เกณฑ์ในการคัดเลือกผู้ส่งมอบ หรือผู้รับเหมา ต้องผ่านเกณฑ์ในข้อ 1-6 อย่างน้อย 4 ข้อขึ้นไป จึงจะผ่านเกณฑ์"), margin: [0, 0, 0, 1.5] },
    fillLine(S("- กรณีที่ไม่ได้ตามเกณฑ์ แต่ต้องรับพิจารณาเพราะ "), " ", { margin: [0, 0, 0, 1.5] }),
    { text: S("- ติดต่อผู้ส่งมอบ หรือผู้รับเหมาเพื่อปรับปรุงให้ได้ตามเกณฑ์ หรือคัดเลือกผู้ส่งมอบรายใหม่มาทดแทนโดยพิจารณาใหม่ตามรอบการประเมินทุก 6 เดือน"), margin: [0, 0, 0, 2] },

    // ── สรุปผลการประเมิน: ตาราง 3 คอลัมน์ แถวตรงกันทุกคอลัมน์ ──
    {
      unbreakable: true,
      stack: [
        secHead("สรุปผลการประเมิน"),
        {
          table: {
            widths: ["*", "*", "*"],
            body: [
              [evalChk(), evalChk(), evalChk()],
              [evalNote([0, 4, 0, 0]), evalNote([0, 4, 0, 0]), evalNote([0, 4, 0, 0])],
              [evalNote(), evalNote(), evalNote()],
              [evalSign(), evalSign(), evalSign()],
              [evalParen(), evalParen(), evalParen()],
              [evalRole("ผู้จัดทำ / จัดซื้อ"), evalRole("ผู้ช่วยหัวหน้าฝ่ายจัดซื้อ/หัวหน้าจัดซื้อ"), evalRole("ผู้จัดการฝ่ายจัดซื้อ")],
              [evalDate(), evalDate(), evalDate()],
            ],
          },
          layout: {
            hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length ? 0.7 : 0),
            vLineWidth: () => 0.7,
            hLineColor: () => "#000",
            vLineColor: () => "#000",
            paddingLeft: () => 10,
            paddingRight: () => 10,
            paddingTop: () => 2,
            paddingBottom: () => 2,
          },
        },
      ],
    },
  ]
}

// ── เซลล์ประกอบตาราง "สรุปผลการประเมิน" (แถวตรงแนวกันทั้ง 3 คอลัมน์ ในกรอบเดียวกัน) ──
const EV_TOP = [true, true, true, false] // เซลล์แถวบนสุด: เส้นข้าง + เส้นบน
const EV_MID = [true, false, true, false] // เซลล์แถวกลาง: เส้นข้างอย่างเดียว
const EV_BOT = [true, false, true, true] // เซลล์แถวล่างสุด: เส้นข้าง + เส้นล่าง
const evalChk = (): any => ({
  border: EV_TOP,
  columns: [{ width: "*", text: "" }, chk(S("ยอมรับ")), chk(S("ไม่ยอมรับ")), { width: "*", text: "" }],
  columnGap: 12,
  margin: [0, 4, 0, 0],
})
const evalNote = (m: number[] = [0, 2, 0, 0]): any => ({ border: EV_MID, ...dashLine("*", { margin: m }) })
const evalSign = (): any => ({ border: EV_MID, ...fillLine(S("ลงชื่อ "), " ", { margin: [0, 8, 0, 0] }) })
const evalParen = (): any => ({ border: EV_MID, text: "( )", alignment: "center", margin: [0, 2, 0, 0] })
const evalRole = (t: string): any => ({ border: EV_MID, text: S(t), alignment: "center", fontSize: 13 })
const evalDate = (): any => ({ border: EV_BOT, ...fillLine(S("วันที่"), " ", { margin: [0, 2, 0, 4] }) })

// ย่อหน้า PDPA: ชิดซ้าย + ย่อบรรทัดแรก 1 tab
function pdpaP(txt: string, margin: number[] = [0, 0, 0, 2]): any {
  return { text: S(txt), alignment: "left", leadingIndent: 36, margin }
}
// ย่อหน้า PDPA แบบมีหัวข้อนำ (หัวข้อหนา + เนื้อความต่อท้าย ข้อความเดิมทุกตัวอักษร)
function pdpaH(head: string, rest: string, margin: number[] = [0, 5, 0, 2]): any {
  return { text: [{ text: S(head), bold: true }, S(rest)], alignment: "left", leadingIndent: 36, margin }
}
// รายการย่อย PDPA (ขีดหน้า) — ย่อหน้าทั้งบล็อกให้เห็นลำดับชั้น
function pdpaB(txt: string): any {
  return { text: S(txt), alignment: "left", margin: [36, 0, 0, 3] }
}

export function creditorDocDef(c: Contract, promo: PromoMasterData | null): any {
  return {
    pageSize: "A4",
    pageMargins: [45, 32, 45, 42],
    defaultStyle: { font: "Cordia", fontSize: 15, lineHeight: 1.0 },
    info: { title: `เปิดรหัสเจ้าหนี้-${c.contractCode}` },
    footer: pageFooter(c.contractCode, { left: 45, right: 45 }), // ฟอร์มนี้ใช้ขอบ 45/45 — footer ต้องตรงแนวเนื้อหา
    content: content(c, promo),
  }
}
