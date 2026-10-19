/**
 * Server-only: โหลด contract + promo จาก DB แล้ว render template .docx เป็น buffer
 * ใช้ร่วมกันระหว่าง route ดาวน์โหลด .docx และ route แปลงเป็น PDF
 */
import "server-only"
import { ObjectId } from "mongodb"
import { readFile } from "fs/promises"
import path from "path"
import PizZip from "pizzip"
import Docxtemplater from "docxtemplater"
import { withVehicleDetails } from "@/lib/partner/contract-vehicle"
import { getCompanyVersion } from "@/lib/partner/company-config"
import type { Contract } from "@/lib/partner/types"
import { DOCX_TEMPLATES, normPlate, type DocxType, type PromoMasterData } from "@/lib/partner/contract-docx"
import { appendDocxAttachments } from "@/lib/partner/docx-attachments"
import { partnerColOf } from "@/lib/db/partner-col"
import { partnerDb } from "@/lib/db/partner"

export async function renderContractDocx(
  id: string,
  type: DocxType,
): Promise<{ buffer: Buffer; filename: string } | null> {
  const tpl = DOCX_TEMPLATES[type]
  if (!tpl) return null

  const pdb = await partnerDb()
  const db = pdb
  const found = (await partnerColOf(db, "contracts").findOne({ _id: new ObjectId(id) })) as Contract | null
  if (!found) return null
  // ช่องข้อมูลรถที่ว่างในสัญญา → เติมจากทะเบียนรถ (ดู lib/contract-vehicle)
  const contract = await withVehicleDetails(db, found as unknown as Record<string, unknown>) as unknown as Contract

  const plate = normPlate(contract.licensePlate)
  const promos = (await partnerColOf(db, "promotionMaster").find({}).toArray()) as unknown as PromoMasterData[]
  const promo = promos.find((p) => normPlate(p.licensePlate) === plate) ?? null

  // ชื่อผู้ลงนาม/พยาน มาจาก master (/admin/company) — ไฟล์ต้นแบบใช้ {sellerSig1} {sellerSig2} {witness1} {witness2}
  const company = await getCompanyVersion(db, (contract as { companyVersion?: number }).companyVersion)
  const data = {
    ...tpl.build(contract, promo),
    sellerSig1: company.sellerSignatories[0] ?? "",
    sellerSig2: company.sellerSignatories[1] ?? "",
    witness1: company.witnesses[0] ?? "",
    witness2: company.witnesses[1] ?? "",
    companyName: company.name,
    companyRegNo: company.regNo,
    companyAddress: company.address,
  }
  const templatePath = path.join(process.cwd(), "partner-assets", "templates", tpl.file)
  const content = await readFile(templatePath)
  const zip = new PizZip(content)
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "................",
  })
  doc.render(data)
  const rendered = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer
  // แนบรูปเอกสารท้ายไฟล์ — ชุดเดียวกับ PDF (sale/hire/guarantee; creditor ไม่แนบ)
  const buffer = await appendDocxAttachments(db, contract, rendered, type)
  return { buffer, filename: tpl.filename(contract) }
}
