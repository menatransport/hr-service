import type { Db } from "mongodb"

/**
 * Template ข้อความของ Catalog รายคัน — เก็บ doc เดียวใน `catalog_config` (_id "default")
 * แก้ได้จากหน้า /catalog (admin) โดยไม่ต้องแก้โค้ด; layout/สี/ฟอนต์อยู่ใน lib/catalog-pdf.ts
 */
export interface CatalogConfig {
  tagline:       string     // สโลแกนใต้โลโก้
  sellingPoints: string[]   // จุดขาย (bullet)
  contactName:   string
  contactPhone:  string
  contactLine:   string
  terms:         string[]   // เงื่อนไข/หมายเหตุท้ายหน้า
  updatedAt?:    string
  updatedBy?:    string
}

export const CATALOG_COLL = "catalog_config"

export const DEFAULT_CATALOG_CONFIG: CatalogConfig = {
  tagline: "รถโม่ปูนพร้อมสัญญางานวิ่ง — ผ่อนสบาย มีงานรองรับตั้งแต่วันแรก",
  sellingPoints: [
    "มีงานวิ่งรองรับทันทีกับแพล้นท์ปูนในเครือ ไม่ต้องหางานเอง",
    "ผ่อนชำระหักจากค่าเที่ยวรายเดือน ไม่ต้องกู้ไฟแนนซ์ภายนอก",
    "ฟรีค่าซ่อมบำรุง + PM ตามโปรโมชั่นของรถแต่ละคัน",
    "รถตรวจสภาพพร้อมใช้งานก่อนส่งมอบทุกคัน",
  ],
  contactName:  "ฝ่ายขาย รถร่วม Mixer",
  contactPhone: "",
  contactLine:  "",
  terms: [
    "ราคาและเงื่อนไขอาจเปลี่ยนแปลงได้โดยไม่ต้องแจ้งล่วงหน้า กรุณาตรวจสอบกับฝ่ายขายก่อนทำสัญญา",
    "รูปภาพใช้เพื่อประกอบการนำเสนอ สภาพจริงตามที่ตรวจรับ ณ วันส่งมอบ",
  ],
}

const clean = (v: unknown, max = 300) => String(v ?? "").trim().slice(0, max)
const cleanList = (v: unknown, max = 10) =>
  (Array.isArray(v) ? v : []).map((x) => clean(x, 200)).filter(Boolean).slice(0, max)

/** normalize body จาก PUT → CatalogConfig (ตัดความยาว, ทิ้งค่าว่าง) */
export function sanitizeCatalogConfig(body: Partial<CatalogConfig>): Omit<CatalogConfig, "updatedAt" | "updatedBy"> {
  return {
    tagline:       clean(body.tagline),
    sellingPoints: cleanList(body.sellingPoints),
    contactName:   clean(body.contactName, 120),
    contactPhone:  clean(body.contactPhone, 60),
    contactLine:   clean(body.contactLine, 60),
    terms:         cleanList(body.terms, 6),
  }
}

export async function getCatalogConfig(db: Db): Promise<CatalogConfig> {
  const doc = await db.collection(CATALOG_COLL).findOne({ _id: "default" as unknown as never })
  if (!doc) return DEFAULT_CATALOG_CONFIG
  const { _id: _omit, ...rest } = doc as unknown as CatalogConfig & { _id: unknown }
  void _omit
  return { ...DEFAULT_CATALOG_CONFIG, ...rest }
}
