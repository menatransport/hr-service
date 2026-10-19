import { partnerColOf, type PartnerDb } from "@/lib/db/partner"

/**
 * ข้อมูลบริษัท + ผู้ลงนาม ที่ใช้พิมพ์บนสัญญาทุกชนิด — แก้ผ่านหน้า master (/admin/company)
 * เดิมฝังตายในโค้ด 2 ที่ (หน้าพรีวิว/พิมพ์ กับตัวสร้าง PDF) เปลี่ยนคนเซ็นทีต้องแก้โค้ด+deploy
 *
 * **เก็บเป็นเวอร์ชัน**: ทุกครั้งที่บันทึกจะออกเวอร์ชันใหม่ (1, 2, 3…) และสัญญาจะจำเวอร์ชันที่ใช้ตอนสร้าง
 * (contract.companyVersion) เอกสารที่พิมพ์ซ้ำภายหลังจึงได้ชื่อผู้ลงนามชุดเดิม ไม่ใช่ชุดปัจจุบัน
 * — สัญญาเซ็นไปแล้วต้องพิมพ์ได้เหมือนวันที่เซ็นเสมอ
 */

export interface CompanyConfig {
  name: string
  regNo: string
  address: string
  sellerSignatories: string[]   // ผู้ลงนามฝ่ายผู้ขาย (2 คน)
  witnesses: string[]           // พยาน (2 คน)
  version?: number
  updatedAt?: string
  updatedBy?: string
}

export const COMPANY_DEFAULT: CompanyConfig = {
  name: "บริษัท มีนาทรานสปอร์ต จำกัด (มหาชน)",
  regNo: "0195536000089",
  address: "เลขที่ 280/8 หมู่ที่ 9 ตำบลทับกวาง อำเภอแก่งคอย จังหวัดสระบุรี",
  sellerSignatories: ["นางสุวรรณา ขจรวุฒิเดช", "นางสาวพัชรีรัตน์ ขจรวุฒิเดชภัทร์"],
  witnesses: ["นางสาวนัชภัค ขจรวุฒิเดช", "นางสาวธัญรดี ตะกิ่นนอก"],
  version: 1,
}
const ID = "default"

const str = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v.trim() : fallback)
/** ผู้ลงนาม/พยาน: เก็บ 2 ช่องเสมอ (ช่องว่าง = ไม่พิมพ์ชื่อในวงเล็บ แต่ยังมีเส้นให้เซ็น) */
const pair = (v: unknown, fallback: string[]) => {
  const arr = Array.isArray(v) ? v.map((x) => String(x ?? "").trim()) : []
  return [arr[0] ?? fallback[0] ?? "", arr[1] ?? fallback[1] ?? ""]
}

export function normalizeCompany(raw: Partial<CompanyConfig> | null | undefined): CompanyConfig {
  return {
    name: str(raw?.name, COMPANY_DEFAULT.name),
    regNo: str(raw?.regNo, COMPANY_DEFAULT.regNo),
    address: str(raw?.address, COMPANY_DEFAULT.address),
    sellerSignatories: pair(raw?.sellerSignatories, COMPANY_DEFAULT.sellerSignatories),
    witnesses: pair(raw?.witnesses, COMPANY_DEFAULT.witnesses),
    version: Number(raw?.version ?? 0) || 1,
    updatedAt: raw?.updatedAt,
    updatedBy: raw?.updatedBy,
  }
}

/** ชุดที่ใช้อยู่ตอนนี้ (สัญญาที่สร้างใหม่จะผูกเวอร์ชันนี้) */
export async function getCompanyConfig(db: PartnerDb): Promise<CompanyConfig> {
  const doc = await partnerColOf(db, "companyConfig").findOne({ _id: ID as unknown as never })
  return normalizeCompany(doc as Partial<CompanyConfig> | null)
}

/** ชุดตามเวอร์ชันที่สัญญาจำไว้ — ไม่ระบุ/หาไม่เจอ = ใช้ชุดปัจจุบัน */
export async function getCompanyVersion(db: PartnerDb, version?: number | null): Promise<CompanyConfig> {
  if (!version) return getCompanyConfig(db)
  const doc = await partnerColOf(db, "companyConfigVersions").findOne({ version })
  return doc ? normalizeCompany(doc as Partial<CompanyConfig>) : getCompanyConfig(db)
}

export async function listCompanyVersions(db: PartnerDb, limit = 50): Promise<CompanyConfig[]> {
  const docs = await partnerColOf(db, "companyConfigVersions").find({}).sort({ version: -1 }).limit(limit).toArray()
  return docs.map((d) => normalizeCompany(d as Partial<CompanyConfig>))
}

/** บันทึก = ออกเวอร์ชันใหม่เสมอ (ของเดิมเก็บไว้ให้สัญญาเก่าใช้ต่อ) */
export async function saveCompanyConfig(db: PartnerDb, raw: Partial<CompanyConfig>, by: string): Promise<CompanyConfig> {
  const latest = await partnerColOf(db, "companyConfigVersions").find({}).sort({ version: -1 }).limit(1).toArray()
  const nextVersion = (Number(latest[0]?.version ?? 0) || 0) + 1
  const next: CompanyConfig = {
    ...normalizeCompany(raw),
    version: nextVersion,
    updatedAt: new Date().toISOString(),
    updatedBy: by,
  }
  await partnerColOf(db, "companyConfigVersions").insertOne({ ...next })
  await partnerColOf(db, "companyConfig").updateOne({ _id: ID as unknown as never }, { $set: next }, { upsert: true })
  return next
}

/** ครั้งแรกสุด: ทำให้มีเวอร์ชัน 1 ในประวัติ เพื่อให้สัญญาเก่าอ้างอิงได้ */
export async function ensureFirstVersion(db: PartnerDb, by = "system"): Promise<CompanyConfig> {
  const any = await partnerColOf(db, "companyConfigVersions").findOne({})
  if (any) return getCompanyConfig(db)
  const current = await getCompanyConfig(db)
  const first: CompanyConfig = { ...current, version: 1, updatedAt: new Date().toISOString(), updatedBy: by }
  await partnerColOf(db, "companyConfigVersions").insertOne({ ...first })
  await partnerColOf(db, "companyConfig").updateOne({ _id: ID as unknown as never }, { $set: first }, { upsert: true })
  return first
}
