import { partnerColOf } from "@/lib/db/partner-col"
export type FieldChange = { from: unknown; to: unknown }
export type Changes = Record<string, FieldChange>

export interface Editor {
  email: string
  name?: string
}

export interface ActivityEntry {
  entity:   string   // เช่น "price_list" — เผื่อขยายไป entity อื่นในอนาคต
  entityId: string   // เช่น licensePlate
  action:   string   // เช่น "saleStatus"
  changes:  Changes  // เฉพาะ field ที่เปลี่ยน { from, to }
  editedBy: Editor
  editedAt: string   // ISO string
}

// undefined (field ไม่มีในเอกสารเดิม) ถือว่าเท่ากับ null — กันไม่ให้ absent→null ถูกนับเป็นการเปลี่ยน
const norm = (v: unknown) => (v === undefined ? null : v)

/** คืนเฉพาะ field ที่ค่าเปลี่ยนไปจริง ในรูป { field: { from, to } } */
export function diffFields(
  before: Record<string, unknown> | null | undefined,
  after:  Record<string, unknown>,
  keys:   string[],
): Changes {
  const changes: Changes = {}
  for (const k of keys) {
    const from = norm(before?.[k])
    const to   = norm(after[k])
    if (from !== to) changes[k] = { from, to }
  }
  return changes
}

/**
 * บันทึก audit log ลง collection `activity_log`
 * ไม่ throw: ถ้า insert ล้มเหลวจะ log ที่ server แล้วคืน false — audit ต้องไม่ทำให้ operation หลักพัง
 */
export async function logActivity(entry: Omit<ActivityEntry, "editedAt">): Promise<boolean> {
  try {
    // lazy import: กัน lib/mongo (ที่ throw ถ้าไม่มี MONGO_URI) ไม่ให้ถูกโหลดตอน import ฟังก์ชัน pure
    const { partnerDb } = await import("@/lib/db/partner")
    const pdb = await partnerDb()
    await partnerColOf(pdb, "activityLog").insertOne({
      ...entry,
      editedAt: new Date().toISOString(),
    })
    return true
  } catch (e) {
    console.error("[activity-log] insert failed:", e)
    return false
  }
}
