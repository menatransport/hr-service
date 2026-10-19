/**
 * Server-side pdfmake printer (pure JS — รันบน Vercel ได้ ไม่ต้อง chromium/LibreOffice)
 * โหลดฟอนต์ CordiaUPC จาก /fonts เข้า virtualfs ของ pdfmake
 */
import "server-only"
import path from "path"
import fs from "fs"

// pdfmake 0.3 server API อยู่ใน subpaths เหล่านี้ (ไม่มี type — ใช้ require)
/* eslint-disable @typescript-eslint/no-explicit-any */
import pdfmake from "pdfmake"
// @ts-expect-error no types for subpath
import PrinterMod from "pdfmake/js/Printer"
// @ts-expect-error no types for subpath
import URLResolverMod from "pdfmake/js/URLResolver"

const Printer = (PrinterMod as any).default || PrinterMod
const URLResolver = (URLResolverMod as any).default || URLResolverMod

const FONT_FILES = {
  normal: "CordiaUPC.ttf",
  bold: "CordiaUPC-Bold.ttf",
  italics: "CordiaUPC-Italic.ttf",
  bolditalics: "CordiaUPC-BoldItalic.ttf",
}

const SARABUN_FILES = {
  normal: "Sarabun-Regular.ttf",
  bold: "Sarabun-Bold.ttf",
  italics: "Sarabun-Italic.ttf",
  bolditalics: "Sarabun-BoldItalic.ttf",
}

let printer: any = null

function getPrinter() {
  if (printer) return printer
  const vfs = (pdfmake as any).virtualfs
  const dir = path.join(process.cwd(), "partner-assets", "fonts")
  for (const f of [...Object.values(FONT_FILES), ...Object.values(SARABUN_FILES)]) {
    vfs.writeFileSync(f, fs.readFileSync(path.join(dir, f)))
  }
  const fonts = { Cordia: { ...FONT_FILES }, Sarabun: { ...SARABUN_FILES } }
  printer = new Printer(fonts, vfs, new URLResolver(vfs), () => true)
  return printer
}

/** สร้าง PDF buffer จาก docDefinition ของ pdfmake */
export async function renderPdfmake(docDefinition: any): Promise<Buffer> {
  const p = getPrinter()
  const pdfDoc = await p.createPdfKitDocument(docDefinition)
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    pdfDoc.on("data", (c: Buffer) => chunks.push(c))
    pdfDoc.on("end", () => resolve(Buffer.concat(chunks)))
    pdfDoc.on("error", reject)
    pdfDoc.end()
  })
}

// ── แก้ลำดับ สระอำ + วรรณยุกต์ ให้เรนเดอร์ถูก (fontkit ไม่ reorder ให้) ──
// "ค้ำ" เก็บเป็น ค+้+ำ → ต้อง decompose เป็น ค+ํ+้+า (นิคหิตชิดพยัญชนะ วรรณยุกต์อยู่บนสุด)
// ยืนยันด้วย GPOS mkmk ของ CordiaUPC แล้ว — ลำดับนี้ stack ถูกต้อง
export function fixThaiMarks(s: string): string {
  return s.replace(/([\u0E48-\u0E4B])ำ/g, "ํ$1า")
}

// ── ตัดคำไทยด้วย Intl.Segmenter → แทรก ZWSP ให้ pdfmake ขึ้นบรรทัดถูก ──
// คำประสมที่ Intl.Segmenter แยกเป็นคำย่อยแล้วการตัดบรรทัดกลางคำทำให้อ่านเพี้ยน
// เช่น "บอกกล่าวล่วง|หน้า", "สัญญาซื้อ|ขาย", "ผู้รับ|จ้าง" — ห้ามมีจุดตัดภายในคำเหล่านี้
const COMPOUNDS = [
  "ล่วงหน้า", "บอกกล่าว", "ซื้อขาย", "รับจ้าง", "ว่าจ้าง", "ค้ำประกัน",
  "เช่าซื้อ", "ขับขี่", "นิติบุคคล", "ชดใช้",
]
// regex จับคำประสมที่อาจมี ZWSP คั่นระหว่างอักขระ (ZWSP ถูกแทรกเฉพาะรอยต่อ segment)
const COMPOUND_RE = new RegExp(
  COMPOUNDS.map((w) => w.split("").join("\u200B?")).join("|"),
  "g"
)

const SEG = new Intl.Segmenter("th", { granularity: "word" })
/** segment ข้อความไทยแทรก U+200B (เฉพาะข้อความไทย — ห้ามใช้กับเลข/ทะเบียนที่มี "-") */
export function seg(s: string | null | undefined): string {
  if (!s) return ""
  return (
    Array.from(SEG.segment(s), (x) => x.segment)
      .join("​")
      // ห้ามตัดบรรทัดก่อนเครื่องหมายปิด/ตามหลัง และหลังเครื่องหมายเปิด
      // (กัน ")" หรือ "ๆ" หลุดไปขึ้นต้นบรรทัด และ "(" ค้างท้ายบรรทัด)
      .replace(/​([)\]”’ๆฯ,.:;!?%])/g, "$1")
      .replace(/([([“‘])​/g, "$1")
      // วรรคจริงก่อนไม้ยมก/ฯ → NBSP: "ต่าง ๆ" ไม่ให้ "ๆ" หลุดไปขึ้นต้นบรรทัด (ผิดหลักพิมพ์ไทย)
      // ต้องกลืน ZWSP ที่ join() แทรกรอบวรรคด้วย ไม่งั้นจุดตัดบรรทัดยังอยู่ (วรรคเป็น required — คำติดกันไม่โดนแทรก)
      .replace(/\u200B? \u200B?([ๆฯ])/g, "\u00A0$1")
      // "ผู้" เป็นคำนำหน้านาม (bound prefix) — ห้ามแยกจากคำถัดไป: ผู้ซื้อ/ผู้ขาย/ผู้ว่าจ้าง/ผู้รับจ้าง/ผู้ค้ำประกัน เกาะเป็นคำเดียว
      .replace(/ผู้\u200B/g, "ผู้")
      // คำประสมในสัญญาที่ตัวตัดคำแยกแล้วความหมายเพี้ยน — ลบจุดตัดภายในคำ (ดู COMPOUND_RE ด้านล่าง)
      .replace(COMPOUND_RE, (m) => m.replace(/\u200B/g, ""))
      // วรรคในเครื่องหมายคำพูด “ ผู้ขาย ” → เกาะเป็นก้อนเดียวกับคำข้างใน ไม่มีเครื่องหมายโดดคนละบรรทัด
      .replace(/“\u200B? \u200B?/g, "“\u00A0")
      .replace(/\u200B? \u200B?”/g, "\u00A0”")
      .replace(/([\u0E48-\u0E4B])ำ/g, "ํ$1า")
  )
}
