// ชุดข้อมูลที่อยู่ไทย (จังหวัด → อำเภอ → ตำบล + รหัสไปรษณีย์)
// data/thai-address.json มีรูปแบบ: [{ p, a:[{ n, t:[{ n, z }] }] }]

export interface TambonEntry { n: string; z: string }
interface AmphoeNode  { n: string; t: TambonEntry[] }
export interface ProvinceNode { p: string; a: AmphoeNode[] }

let cache: ProvinceNode[] | null = null

/** โหลดชุดข้อมูลแบบ dynamic — code-split ให้โหลดเฉพาะหน้าที่เรียกใช้ (ราว 350KB) */
export async function loadThaiAddress(): Promise<ProvinceNode[]> {
  if (cache) return cache
  const mod = await import("@/partner-assets/data/thai-address.json")
  cache = (mod.default ?? mod) as unknown as ProvinceNode[]
  return cache
}

export function listProvinces(data: ProvinceNode[]): string[] {
  return data.map((p) => p.p)
}

export function listDistricts(data: ProvinceNode[], province?: string): string[] {
  if (!province) return []
  return data.find((p) => p.p === province)?.a.map((a) => a.n) ?? []
}

export function listSubdistricts(data: ProvinceNode[], province?: string, district?: string): TambonEntry[] {
  if (!province || !district) return []
  const prov = data.find((p) => p.p === province)
  return prov?.a.find((a) => a.n === district)?.t ?? []
}

export interface ThaiAddressParts {
  addressDetail?: string
  subdistrict?:   string
  district?:      string
  province?:      string
  postalCode?:    string
}

/** ประกอบที่อยู่เต็มจาก field ย่อย — กทม. ใช้ แขวง/เขต, จังหวัดอื่นใช้ ต./อ./จ. */
export function composeThaiAddress(a: ThaiAddressParts): string {
  const isBkk = a.province === "กรุงเทพมหานคร"
  const tPre  = isBkk ? "แขวง" : "ต."
  const dPre  = isBkk ? "เขต" : "อ."
  return [
    a.addressDetail?.trim(),
    a.subdistrict ? `${tPre}${a.subdistrict}` : "",
    a.district    ? `${dPre}${a.district}`    : "",
    a.province    ? (isBkk ? a.province : `จ.${a.province}`) : "",
    a.postalCode?.trim(),
  ].filter(Boolean).join(" ")
}
