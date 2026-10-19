// POST /api/drivers/[id]/rotate-photo — หมุนรูปเอกสารของคนขับแล้วเซฟถาวร
// อ่านไฟล์เดิมจาก Spaces → sharp หมุน → อัปโหลดเป็นไฟล์ใหม่ → เขียน URL ใหม่ลง drivers
// (ไฟล์เดิมไม่ถูกลบ เหมือนตอนเปลี่ยนรูป — lib/spaces.ts ยังไม่มีฟังก์ชันลบ)
// สิทธิ์: middleware บังคับ RBAC โดเมน masterdata อยู่แล้ว (เท่ากับสิทธิ์แก้ข้อมูลคนขับ)
import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import sharp from "sharp"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"
import { uploadFile } from "@/lib/partner/spaces"
import { isOwnStorageUrl, isRotatableImageUrl, parseRotateRequest } from "@/lib/partner/driver-photo"

export const runtime = "nodejs"

const DB   = PARTNER_DB
const COLL = "drivers"
const MAX_BYTES = 20 * 1024 * 1024      // เท่ากับเพดานของ /api/upload
const FETCH_TIMEOUT_MS = 15_000

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 })

  const parsed = parseRotateRequest(await req.json().catch(() => null))
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const { field, deg } = parsed

  const col = (await clientPromise).db(DB).collection(COLL)
  const driver = await col.findOne({ _id: new ObjectId(id) }, { projection: { [field]: 1 } })
  if (!driver) return NextResponse.json({ error: "ไม่พบคนขับ" }, { status: 404 })

  const url = String(driver[field] ?? "").trim()
  if (!url) return NextResponse.json({ error: "ยังไม่มีรูปในช่องนี้" }, { status: 400 })
  if (!isRotatableImageUrl(url)) return NextResponse.json({ error: "ไฟล์ PDF หมุนไม่ได้" }, { status: 400 })
  if (!isOwnStorageUrl(url)) return NextResponse.json({ error: "หมุนได้เฉพาะไฟล์ที่เก็บในระบบ" }, { status: 400 })

  let buf: Buffer
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!res.ok) throw new Error(`โหลดรูปเดิมไม่สำเร็จ (${res.status})`)
    const ab = await res.arrayBuffer()
    if (ab.byteLength > MAX_BYTES) throw new Error("ไฟล์ใหญ่เกิน 20 MB")
    buf = Buffer.from(ab)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "โหลดรูปเดิมไม่สำเร็จ" }, { status: 502 })
  }

  let out: Buffer
  try {
    // .rotate() ตัวแรก = ปรับตาม EXIF ก่อน แล้วค่อยหมุนตามที่ผู้ใช้สั่ง (แพตเทิร์นเดียวกับ scripts/bake-photo-rotation.mjs)
    out = await sharp(buf).rotate().rotate(deg).jpeg({ quality: 85 }).toBuffer()
  } catch {
    return NextResponse.json({ error: "หมุนรูปไม่สำเร็จ — ไฟล์นี้อาจไม่ใช่รูปภาพ" }, { status: 400 })
  }

  const newUrl = await uploadFile(out, `${field}.jpg`, "image/jpeg", "drivers")
  await col.updateOne({ _id: new ObjectId(id) }, { $set: { [field]: newUrl, updatedAt: new Date() } })
  return NextResponse.json({ url: newUrl })
}
