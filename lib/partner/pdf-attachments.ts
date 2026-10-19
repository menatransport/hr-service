import "server-only"
import { ObjectId } from "mongodb"
import type { Db } from "mongodb"
import type { Contract } from "@/lib/partner/types"
import { pageFooter } from "@/lib/partner/contract-pdfmake-helpers"

/* eslint-disable @typescript-eslint/no-explicit-any */

// pdfmake ฝังได้เฉพาะ JPEG / PNG — ชนิดอื่น (เช่น PDF/HEIC) ข้าม (ยังเปิดดูได้จากลิงก์เอกสารแนบ)
const IMG_TYPES = new Set(["image/jpeg", "image/jpg", "image/png"])

type Entry = { url?: string; heading: string }

/**
 * รายการเอกสารแนบท้าย PDF ต่อชนิดสัญญา (ตามที่ตกลง 2026-07-20):
 *   sale      → ผู้ซื้อ: บัตร ปชช · ใบขับขี่ · ทะเบียนบ้าน
 *   hire      → ผู้ซื้อ: บัตร ปชช · ใบขับขี่ · ทะเบียนบ้าน · หน้าบุ๊คแบงค์
 *   guarantee → ผู้ซื้อ (บัตร/ใบขับขี่/ทะเบียนบ้าน) + ผู้ค้ำ (บัตร/ทะเบียนบ้าน/สลิป/หนังสือรับรอง)
 *   creditor / promotion → ไม่แนบ
 */
function buildEntries(type: string, driver: any, contract: Contract): Entry[] {
  const dn = `${driver?.firstName ?? ""} ${driver?.lastName ?? ""}`.trim() || (contract.buyerName ?? "")
  const gn = contract.guarantorName ?? "ผู้ค้ำประกัน"
  const buyer = (label: string, url?: string): Entry => ({ url, heading: `เอกสารผู้ซื้อ: ${label}${dn ? ` — ${dn}` : ""}` })
  const guar  = (label: string, url?: string): Entry => ({ url, heading: `เอกสารผู้ค้ำ: ${label}${gn ? ` — ${gn}` : ""}` })

  const buyerBase: Entry[] = [
    buyer("สำเนาบัตรประชาชน", driver?.idCardUrl),
    buyer("สำเนาใบขับขี่",    driver?.licenseUrl),
    buyer("สำเนาทะเบียนบ้าน",  driver?.houseRegUrl),
  ]

  if (type === "sale") return buyerBase
  if (type === "hire") return [...buyerBase, buyer("หน้าบุ๊คแบงค์", driver?.bankBookUrl)]
  if (type === "guarantee") {
    return [
      ...buyerBase,
      guar("สำเนาบัตรประชาชน",       contract.guarantorIdCardUrl),
      guar("สำเนาทะเบียนบ้าน",        contract.guarantorHouseRegUrl),
      guar("สลิปเงินเดือน",           contract.guarantorSalaryUrl),
      guar("หนังสือรับรองการทำงาน",   contract.guarantorWorkCertUrl),
    ]
  }
  return [] // creditor / promotion → ไม่แนบ
}

/**
 * ต่อเอกสารแนบเป็นหน้าใหม่ท้าย PDF สัญญา (แก้ docDef.content โดยตรง)
 * type = ชนิดสัญญา (sale / hire / guarantee / creditor / promotion)
 */
/** รายการเอกสารแนบจริง (มี url) ของสัญญา — ใช้ร่วมทั้ง PDF และ DOCX */
export async function resolveContractAttachments(
  db: Db, contract: Contract, type: string,
): Promise<{ url: string; heading: string }[]> {
  const entries = buildEntries(type, null, contract) // placeholder — เติม driver แล้ว rebuild
  if (entries.length === 0) return [] // creditor/promotion — ไม่ต้องหา driver

  // หา driver: driverId ก่อน → contractCode
  let driver: any = null
  const driverId = (contract as any).driverId as string | undefined
  if (driverId && ObjectId.isValid(driverId)) {
    driver = await db.collection("drivers").findOne({ _id: new ObjectId(driverId) })
  }
  if (!driver && contract.contractCode) {
    driver = await db.collection("drivers").findOne({ contractCode: contract.contractCode })
  }
  return buildEntries(type, driver, contract).filter((e) => e.url) as { url: string; heading: string }[]
}

export async function appendContractAttachments(
  db: Db, contract: Contract, docDef: any, type: string,
): Promise<void> {
  const real = await resolveContractAttachments(db, contract, type)
  if (real.length === 0) return

  let appended = 0
  for (const e of real) {
    try {
      const res = await fetch(e.url!)
      if (!res.ok) continue
      const ct = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase()
      if (!IMG_TYPES.has(ct)) continue
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length === 0) continue
      const dataUri = `data:${ct === "image/jpg" ? "image/jpeg" : ct};base64,${buf.toString("base64")}`
      docDef.content.push(
        { text: e.heading, bold: true, fontSize: 16, pageBreak: "before", margin: [0, 0, 0, 12] },
        { image: dataUri, fit: [490, 680], alignment: "center" },
      )
      appended++
    } catch {
      // ดึงรูปไม่ได้ → ข้าม ไม่ให้ PDF ทั้งฉบับพัง
    }
  }

  if (appended > 0 && !docDef.footer) {
    docDef.footer = pageFooter(contract.contractCode ?? "")
  }
}
