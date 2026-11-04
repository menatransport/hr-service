import type { DeskIdentity } from "../auth/identity";
import { APPROVER_DEPARTMENT_IDS } from "./approver";
import { ownersOfDepartment } from "./owner-directory";
import { findItem, type IntakeOwner } from "./registry";

/**
 * ใครเห็นของฝ่ายไหน — **ใช้ได้ทั้ง client และ server** (หน้าจอซ่อน · API กันจริง)
 *
 * HR เห็นทุกฝ่ายเพราะเป็นคนไล่ของทั้งรอบ · ฝ่ายอื่นเห็นแค่ของหน่วยงานตัวเอง ตาม
 * ที่เจ้าของงานสั่งไว้ว่าลิงก์ที่ส่งให้แต่ละแผนก "เข้ามาแล้วเห็นแค่ของฝ่ายตัวเอง"
 *
 * **ขอบเขตมาจาก session ไม่ใช่จาก query string** — ลิงก์ในเมลมี `?owner=` ติดมาก็จริง
 * แต่ค่านั้นใช้แค่เลื่อนหน้าจอไปที่กลุ่มนั้น ไม่ได้ให้สิทธิ์อะไร ใครแก้ URL เองก็ไม่ได้
 * ของฝ่ายอื่นเพิ่มขึ้นมา
 */
export type OwnerScope = { all: true } | { all: false; owners: IntakeOwner[] };

export function ownerScope(identity: DeskIdentity): OwnerScope {
  if (!identity.authenticated) return { all: false, owners: [] };
  if (APPROVER_DEPARTMENT_IDS.includes(identity.departmentId)) return { all: true };
  return { all: false, owners: ownersOfDepartment(identity.departmentId) };
}

export function canSeeOwner(identity: DeskIdentity, owner: IntakeOwner): boolean {
  const scope = ownerScope(identity);
  return scope.all || scope.owners.includes(owner);
}

export function canUploadItem(identity: DeskIdentity, itemId: string): boolean {
  const item = findItem(itemId);
  return item ? canSeeOwner(identity, item.owner) : false;
}
