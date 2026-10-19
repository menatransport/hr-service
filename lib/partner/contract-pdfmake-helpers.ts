/**
 * Helpers ที่ใช้ร่วมกันสำหรับสร้างเนื้อ PDF ด้วย pdfmake (สัญญาทุกชนิด)
 * - S(): ตัดคำไทย (ZWSP) — ใช้กับ "ข้อความไทย" เท่านั้น ห้ามใช้กับเลข/ทะเบียน/โค้ด (มี "-" จะแตกบรรทัด)
 * - body/H/B/sigCell: paragraph helpers
 * - docShell(): โครงเอกสารมาตรฐาน (margins · running header · footer · orphan control)
 *   ปรับ typography ระดับ law-firm — ห้ามแตะถ้อยคำสัญญา (แก้ได้เฉพาะ presentation)
 */
import "server-only"
import { seg, fixThaiMarks } from "@/lib/partner/pdfmake-printer"

/* eslint-disable @typescript-eslint/no-explicit-any */

import { COMPANY_DEFAULT, type CompanyConfig } from "@/lib/partner/company-config"

export const S = seg

/**
 * ข้อมูลบริษัท/ผู้ลงนามที่พิมพ์บนสัญญา — ตัวจริงมาจาก master (/admin/company)
 * ตัวสร้าง PDF อ้างอิงออบเจ็กต์นี้จากหลายไฟล์ระดับโมดูล จึงใช้วิธี "เซ็ตค่าก่อนสร้างเอกสาร"
 * เรียก applyCompany() ให้ติดกับการสร้าง docDef เสมอ (ห้ามมี await คั่น — ค่าจะสลับกันข้ามคำขอ)
 */
export const COMPANY = { ...COMPANY_DEFAULT }

export function applyCompany(cfg?: Partial<CompanyConfig> | null) {
  Object.assign(COMPANY, COMPANY_DEFAULT, cfg ?? {})
}

// ── กติกาหน้ากระดาษ (ทุกสัญญา): A4 · ขอบซ้าย 2.25cm (เผื่อเย็บเล่ม) · ขวา 2cm ──
const A4_W = 595.28
export const PAGE_MARGINS: [number, number, number, number] = [64, 54, 57, 58]
export const CONTENT_W = Math.round((A4_W - PAGE_MARGINS[0] - PAGE_MARGINS[2]) * 100) / 100 // ≈ 474.28

// ── style "Body Legal": line 1.15, first-line indent 1.25cm ──
export const FIRST_LINE_INDENT = 35.4 // 1.25 cm = 35.43 pt
export const LINE_HEIGHT = 1.15

/** ย่อหน้าเนื้อความ (Body Legal). parts = string (ไทยล้วน) หรือ array ของ run
 *  หมายเหตุ: ใช้ชิดซ้าย (ไม่ justify) — justify ของ pdfmake เกลี่ยช่องว่างเข้าทุกรอยต่อคำไทย
 *  ทำให้ตัวอักษรห่างผิดปกติ (ไม่มี thaiDistribute แบบ Word) */
export const body = (parts: any, extra: any = {}) => ({
  text: Array.isArray(parts) ? parts : S(parts),
  alignment: "left",
  leadingIndent: FIRST_LINE_INDENT,
  lineHeight: LINE_HEIGHT,
  margin: [0, 0, 0, 1.5], // หายใจเล็กน้อยระหว่างย่อหน้า
  ...extra,
})

/** หัวข้อข้อ (Heading): หนา ไม่ขีดเส้นใต้ (สไตล์เอกสารกฎหมายสมัยใหม่) + orphan control
 *  headlineLevel ใช้คู่กับ pageBreakBefore ใน docShell — หัวข้อไม่ตกท้ายหน้าโดดจากเนื้อหา */
export const H = (txt: string) => ({
  text: S(txt),
  bold: true,
  lineHeight: LINE_HEIGHT,
  margin: [0, 12, 0, 3],
  headlineLevel: 1,
})

/** run ตัวหนา (ใช้ใน text array) */
export const B = (txt: string) => ({ text: S(txt), bold: true })

/** ค่าที่กรอก (input data) แบบตัวหนา — v() สำหรับเลข/ทะเบียน/โค้ด (raw), vS() สำหรับข้อความไทย (ตัดคำ)
 *  v(): โทเค็นสั้น (ทะเบียน/เลขบัตร/เลขบัญชี/เลขตัวถัง) ห้ามแตกกลางบรรทัด (pdfmake ตัดหลัง "-" ได้)
 *  — noWrap เฉพาะค่าสั้น ≤ 24 ตัวอักษร; ค่ายาว (เช่น รายการงวด "10, 20, 30...") ปล่อยตัดที่ช่องว่างตามปกติ */
export const v = (x: string) => {
  const t = fixThaiMarks(x ?? "")
  return { text: t, bold: true, ...(t.length > 0 && t.length <= 24 ? { noWrap: true } : {}) }
}
export const vS = (x: string) => ({ text: S(x), bold: true })
/** ค่าในวงเล็บ (เช่น จำนวนเงินตัวหนังสือ) — วงเล็บติดกับค่าเสมอ ไม่มี "(" ค้างท้าย / ")" โดดต้นบรรทัด */
export const pv = (x: string) => vS(`(${x})`)

/** ชื่อเรื่องเอกสาร (กึ่งกลาง หนา) */
export const titleLine = (txt: string) => ({
  text: S(txt),
  bold: true,
  fontSize: 19,
  alignment: "center",
  lineHeight: 1.1,
  margin: [0, 0, 0, 10],
})

/** เส้นคั่นโซนหัวเอกสาร (ใต้บรรทัดวันที่ ก่อนเข้าเนื้อสัญญา) */
export const headRule = () => ({
  canvas: [{ type: "line", x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 0.7, lineColor: "#999999" }],
  margin: [0, 8, 0, 10],
})

/** layout ตารางในสัญญา: เส้นบาง เทาเข้ม + หัวตารางพื้นเทาอ่อน + ระยะขอบเซลล์สม่ำเสมอ */
export const lawTableLayout: any = {
  hLineWidth: () => 0.6,
  vLineWidth: () => 0.6,
  hLineColor: () => "#555555",
  vLineColor: () => "#555555",
  fillColor: (rowIndex: number) => (rowIndex === 0 ? "#f2f2f2" : null),
  paddingLeft: () => 7,
  paddingRight: () => 7,
  paddingTop: () => 3.5,
  paddingBottom: () => 3.5,
}

/** running header หน้า 2 เป็นต้นไป: ชื่อเอกสาร (ซ้าย) + เลขที่สัญญา (ขวา) + เส้นบาง */
export const runningHeader = (docTitle: string, contractCode: string) => (currentPage: number) =>
  currentPage === 1
    ? []
    : {
        margin: [PAGE_MARGINS[0], 22, PAGE_MARGINS[2], 0],
        stack: [
          {
            columns: [
              { text: S(docTitle), fontSize: 11, color: "#777777" },
              { text: S(`เลขที่สัญญา ${contractCode || "-"}`), alignment: "right", fontSize: 11, color: "#777777" },
            ],
          },
          { canvas: [{ type: "line", x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 0.5, lineColor: "#cccccc" }], margin: [0, 2, 0, 0] },
        ],
      }

/** footer มืออาชีพ: เลขสัญญา + วันเวลาพิมพ์ (ซ้าย) + หน้า X/Y (ขวา) + เส้นคั่นบาง
 *  "พิมพ์เมื่อ" = document-control stamp (คนละอย่างกับวันที่ทำสัญญาซึ่งเป็นวันที่มีผลทางกฎหมาย)
 *  margins ปรับได้ (ฟอร์มเปิดเจ้าหนี้ใช้ขอบ 45/45) — เส้น/ข้อความจะตรงกับเนื้อหาเสมอ */
export const pageFooter = (contractCode: string, opts?: { left?: number; right?: number }) => {
  const left = opts?.left ?? PAGE_MARGINS[0]
  const right = opts?.right ?? PAGE_MARGINS[2]
  const w = Math.round((A4_W - left - right) * 100) / 100
  const printedAt = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date())
  return (currentPage: number, pageCount: number) => ({
    margin: [left, 8, right, 0],
    stack: [
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: w, y2: 0, lineWidth: 0.5, lineColor: "#cccccc" }] },
      {
        columns: [
          {
            text: S(`เลขที่สัญญา ${contractCode || "-"}  ·  พิมพ์เมื่อ ${printedAt} น.`),
            fontSize: 11,
            color: "#8a8a8a",
          },
          { text: `หน้า ${currentPage} / ${pageCount}`, alignment: "right", fontSize: 11, color: "#8a8a8a" },
        ],
        margin: [0, 3, 0, 0],
      },
    ],
  })
}

/** โครงเอกสารมาตรฐานของสัญญา — margins/defaultStyle/running header/footer/orphan control ที่เดียว */
export function docShell(opts: { fileTitle: string; docTitle: string; contractCode: string; content: any[] }): any {
  return {
    pageSize: "A4",
    pageMargins: PAGE_MARGINS,
    defaultStyle: { font: "Cordia", fontSize: 16, lineHeight: LINE_HEIGHT },
    info: { title: opts.fileTitle },
    header: runningHeader(opts.docTitle, opts.contractCode),
    footer: pageFooter(opts.contractCode),
    // กติกาแบ่งหน้าให้อ่านง่าย:
    //  (1) หัวข้อ (headlineLevel 1) ห้ามตกท้ายหน้าโดยไม่มีเนื้อหาตาม
    //  (2) ข้อสัญญา (clauseKeep) ที่เริ่มท้ายหน้ามาก (เหลือ < ~3 บรรทัด) → ยกทั้งข้อขึ้นหน้าใหม่
    // หมายเหตุ: pageBreakBefore ได้ nodeInfo (เฉพาะ prop มาตรฐาน เช่น headlineLevel/startPosition)
    // custom prop ถูกกรองทิ้ง — จึงใช้ headlineLevel: 2 แทน "ข้อสัญญา" (clause)
    pageBreakBefore: (node: any, followingNodesOnPage: any[]) =>
      (node.headlineLevel === 1 && followingNodesOnPage.length === 0) ||
      ((node.headlineLevel === 1 || node.headlineLevel === 2) &&
        (node.startPosition?.verticalRatio ?? 0) > 0.93),
    content: opts.content,
  }
}

/** ช่องลายเซ็น — รับ line เดิม "ลงชื่อ....ผู้ซื้อ" แล้วทำเส้นเซ็น (เส้นประยืดได้) + ชื่อ center ใต้เส้น
 *  เว้นที่ว่างเหนือเส้นให้พอเซ็นจริง (ink space) */
export const sigCell = (line: string, name?: string) => {
  const m = line.match(/^(.*?)\.{2,}(.*)$/)
  const prefix = (m ? m[1] : "ลงชื่อ").trim()
  const role = (m ? m[2] : "").trim()
  return {
    stack: [
      {
        table: {
          widths: ["auto", "*", "auto"],
          body: [[
            { text: S(prefix + " "), border: [false, false, false, false] },
            { text: " ", border: [false, false, false, true] },
            { text: S(" " + role), border: [false, false, false, false] },
          ]],
        },
        layout: {
          defaultBorder: false,
          hLineWidth: () => 0.8,
          hLineColor: () => "#333333",
          hLineStyle: () => ({ dash: { length: 2, space: 2 } }),
          paddingLeft: () => 0,
          paddingRight: () => 0,
          paddingTop: () => 0,
          paddingBottom: () => 1,
        },
        margin: [0, 26, 0, 0],
      },
      {
        text: name ? S(`( ${name} )`) : S("(.................................)"),
        alignment: "center",
        margin: [0, 3, 0, 0],
      },
    ],
  }
}

/** แถวลายเซ็น 2 คอลัมน์ — ระยะห่างคอลัมน์มาตรฐานเดียวกันทุกสัญญา */
export const sigRow = (leftCell: any, rightCell: any) => ({
  columnGap: 28,
  columns: [leftCell, rightCell],
})
