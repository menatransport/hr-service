import type { SessionUser } from "@/lib/auth/token";
import { listUsers } from "@/lib/ncac/client";

/**
 * สิทธิ์ลบ (= ยกเลิก) คำขออัตรา — **ผู้ขออยู่ฝ่ายเดียวกับคนที่ล็อกอิน** (Bew 17 พ.ย. 2569)
 *
 * ฝ่าย/แผนกของผู้ขออ่านจาก NCAC `/users/` ตามรหัสพนักงานตอนนี้ ไม่ได้เก็บลงคำขอ — ย้ายฝ่ายแล้วสิทธิ์ตามฝ่ายใหม่
 * · ไม่มีฝ่าย = เทียบแผนก · คำขอที่นำเข้าจาก Excel (ไม่มีรหัสผู้ขอ) ไม่มีใครลบได้
 * · ตรวจซ้ำที่ `PATCH /api/recruitment/requisitions/[id]` — ปุ่มบนจอเป็นแค่ทางลัด
 */

interface Unit {
  departmentId: number | null;
  divisionId: number | null;
  /** username ของ NCAC (เช่น kittaboon.l) — คอลัมน์ผู้ขอ */
  username?: string;
}

const TTL_MS = 5 * 60_000;
let cached: { at: number; map: Map<string, Unit> } | undefined;

async function units(): Promise<Map<string, Unit>> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.map;
  try {
    const users = await listUsers();
    const map = new Map<string, Unit>();
    for (const u of users) {
      if (!u.employee_id) continue;
      map.set(String(u.employee_id), {
        departmentId: u.department_id ?? null,
        divisionId: u.division?.division_id ?? null,
        username: u.username?.trim() || undefined,
      });
    }
    cached = { at: Date.now(), map };
    return map;
  } catch (err) {
    if (cached) return cached.map; // NCAC สะดุด — ใช้ของเดิมไปก่อน
    throw err;
  }
}

function sameUnit(a: Unit | undefined, b: Unit | undefined): boolean {
  if (!a || !b) return false;
  if (a.divisionId !== null && b.divisionId !== null) return a.divisionId === b.divisionId;
  return a.departmentId !== null && a.departmentId === b.departmentId;
}

function checker(map: Map<string, Unit>, user: SessionUser) {
  const mine = map.get(user.employeeId) ?? { departmentId: user.departmentId, divisionId: null };
  return (requesterId: string) =>
    Boolean(requesterId) && (requesterId === user.employeeId || sameUnit(map.get(requesterId), mine));
}

export interface CancelRights {
  can: (requesterId: string) => boolean;
  username: (requesterId: string) => string | undefined;
}

/**
 * ตัวตรวจของผู้ใช้คนนี้ + username ของผู้ขอ — โหลดคู่กับ `getHub()` ได้
 * · NCAC อ่านไม่ได้ = ลบไม่ได้ทั้งหมด และคอลัมน์ผู้ขอใช้ชื่อแทน (หน้ายังเปิดได้)
 */
export async function cancelRights(user: SessionUser | null): Promise<CancelRights> {
  try {
    const map = await units();
    return { can: user ? checker(map, user) : () => false, username: (id) => map.get(id)?.username };
  } catch (err) {
    console.warn("[requisitions] อ่านฝ่ายจาก NCAC ไม่สำเร็จ — ปิดปุ่มลบคำขอไว้ก่อน", err);
    return { can: () => false, username: () => undefined };
  }
}

/** ใส่ `canCancel` + `requester.username` ให้ทุกแถว */
export function withCancelRights<T extends { requester?: { employeeId: string; name: string; username?: string } }>(
  rows: T[],
  rights: CancelRights,
): (T & { canCancel: boolean })[] {
  return rows.map((r) => {
    const id = r.requester?.employeeId ?? "";
    const username = id ? rights.username(id) : undefined;
    return {
      ...r,
      ...(r.requester && username ? { requester: { ...r.requester, username } } : {}),
      canCancel: rights.can(id),
    };
  });
}

export async function canCancelRequisition(requesterId: string, user: SessionUser): Promise<boolean> {
  return checker(await units(), user)(requesterId);
}
