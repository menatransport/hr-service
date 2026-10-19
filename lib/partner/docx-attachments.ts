import "server-only"
import PizZip from "pizzip"
import type { Contract } from "@/lib/partner/types"
import { resolveContractAttachments } from "@/lib/partner/pdf-attachments"
import { type PartnerDb } from "@/lib/db/partner-col"

/**
 * ต่อเอกสารแนบ (รูปบัตร ปชช./ใบขับขี่/ทะเบียนบ้าน ฯลฯ) ท้ายไฟล์ .docx
 * ชุดเดียวกับ PDF (resolveContractAttachments) — หน้าละรูป มีหัวเรื่อง ขึ้นหน้าใหม่ทุกรายการ
 * ฝังตรงระดับ OOXML: media + relationship + [Content_Types] + <w:drawing> ก่อน sectPr ท้าย body
 */

const IMG_TYPES = new Set(["image/jpeg", "image/jpg", "image/png"])
const EMU_PER_CM = 360000
const MAX_W_CM = 15.5   // กว้างสุดในหน้า A4 หลังหักขอบ template
const MAX_H_CM = 22.0

/** อ่านขนาดรูปจาก header (PNG IHDR / JPEG SOF) — คืน null ถ้าอ่านไม่ได้ */
function probeSize(buf: Buffer): { w: number; h: number } | null {
  // PNG: 8-byte signature แล้ว IHDR — width/height big-endian ที่ offset 16/20
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
  }
  // JPEG: ไล่ marker หา SOF0-15 (ยกเว้น DHT/DAC/RST)
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue }
      const marker = buf[i + 1]
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) { i += 2; continue }
      const len = buf.readUInt16BE(i + 2)
      if ((marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) }
      }
      i += 2 + len
    }
  }
  return null
}

const escXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const NS = 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'

function imageParagraphs(heading: string, relId: string, drawId: number, cx: number, cy: number): string {
  return (
    // ขึ้นหน้าใหม่
    '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' +
    // หัวเรื่อง (หนา 16pt = w:sz 32)
    '<w:p><w:pPr><w:spacing w:after="240"/><w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:pPr>' +
    `<w:r><w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr><w:t xml:space="preserve">${escXml(heading)}</w:t></w:r></w:p>` +
    // รูป (inline, จัดกลาง)
    '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing>' +
    `<wp:inline distT="0" distB="0" distL="0" distR="0" ${NS}>` +
    `<wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:docPr id="${drawId}" name="attachment${drawId}"/>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic>` +
    `<pic:nvPicPr><pic:cNvPr id="${drawId}" name="attachment${drawId}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
  )
}

/** ต่อรูปแนบท้าย .docx ที่ render แล้ว — คืน buffer ใหม่ (ไม่มีรูป/ดึงไม่ได้ = คืนของเดิม) */
export async function appendDocxAttachments(
  db: PartnerDb, contract: Contract, docxBuffer: Buffer, type: string,
): Promise<Buffer> {
  const entries = await resolveContractAttachments(db, contract, type)
  if (entries.length === 0) return docxBuffer

  const zip = new PizZip(docxBuffer)
  let doc = zip.file("word/document.xml")?.asText()
  let rels = zip.file("word/_rels/document.xml.rels")?.asText()
  let types = zip.file("[Content_Types].xml")?.asText()
  if (!doc || !rels || !types) return docxBuffer

  let block = ""
  let n = 0
  for (const e of entries) {
    try {
      const res = await fetch(e.url)
      if (!res.ok) continue
      const ct = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase()
      if (!IMG_TYPES.has(ct)) continue // pdf/heic ฯลฯ — ข้ามเหมือนฝั่ง PDF
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length === 0) continue

      const ext = ct === "image/png" ? "png" : "jpeg"
      n++
      const name = `attach_${n}.${ext}`
      zip.file(`word/media/${name}`, buf)

      // ขนาดแสดงผล: ย่อให้พอดีกรอบ รักษาสัดส่วน (อ่านขนาดไม่ได้ → เต็มกรอบแนวตั้ง)
      const dim = probeSize(buf)
      let wCm = MAX_W_CM, hCm = MAX_H_CM
      if (dim && dim.w > 0 && dim.h > 0) {
        const scale = Math.min(MAX_W_CM / dim.w, MAX_H_CM / dim.h)
        wCm = dim.w * scale
        hCm = dim.h * scale
      }
      const relId = `rIdAttach${n}`
      rels = rels.replace("</Relationships>",
        `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/></Relationships>`)
      block += imageParagraphs(e.heading, relId, 9000 + n, Math.round(wCm * EMU_PER_CM), Math.round(hCm * EMU_PER_CM))
    } catch {
      // ดึงรูปไม่ได้ → ข้าม ไม่ให้ไฟล์ทั้งฉบับพัง
    }
  }
  if (n === 0) return docxBuffer

  // content types: เติม Default ของ png/jpeg ถ้ายังไม่มี
  for (const [ext, ctv] of [["png", "image/png"], ["jpeg", "image/jpeg"]] as const) {
    if (!types.includes(`Extension="${ext}"`)) {
      types = types.replace("</Types>", `<Default Extension="${ext}" ContentType="${ctv}"/></Types>`)
    }
  }

  // แทรกก่อน sectPr ตัวสุดท้ายของ body (ถ้าไม่เจอ — ต่อก่อนปิด body)
  const at = doc.lastIndexOf("<w:sectPr")
  doc = at !== -1 ? doc.slice(0, at) + block + doc.slice(at) : doc.replace("</w:body>", block + "</w:body>")

  zip.file("word/document.xml", doc)
  zip.file("word/_rels/document.xml.rels", rels)
  zip.file("[Content_Types].xml", types)
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" })
}
