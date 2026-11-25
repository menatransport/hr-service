"use server";

import { revalidatePath } from "next/cache";

import { readSessionUser } from "@/lib/auth/session";
import { canAccessMenuStrict } from "@/lib/menu-permissions";
import { NcacError, getUser } from "@/lib/ncac/client";
import {
  ParkingError,
  approveVehicle,
  createVehicle,
  listScans,
  resubmitVehicle,
  setVehicleStatus,
  type Actor,
} from "@/lib/parking/store";
import { PARKING_ADMIN, siteFromText, type SiteCode, type VehicleInput } from "@/lib/parking/types";

export type EmployeeLookup =
  | {
      ok: true;
      employeeId: string;
      name: string;
      position: string;
      department: string;
      division: string;
      site: SiteCode;
      siteText: string;
      imageUrl: string | null;
      /** `employee_status` ไม่ใช่ Active — ยังแสดงข้อมูลให้ แต่ฟอร์มไม่ให้ส่ง */
      inactive: boolean;
    }
  | { ok: false; reason: "not-found" | "error"; message: string };

/**
 * ค้นพนักงานจากรหัส (NCAC `GET /users/{id}`) — ฟอร์มลงทะเบียนรถเติมชื่อ/สังกัด/ศูนย์ให้เอง
 *
 * เป็น server action ไม่ใช่ `/api/**` เพราะ `/api/**` ถูก rewrite ไป mena-backend-services
 * (ต้อง sync + deploy ก่อนถึงจะใช้ได้แม้บน localhost) · ต้องล็อกอิน
 * · NCAC ไม่มีเบอร์โทร ช่องเบอร์ยังกรอกเอง
 */
export async function lookupEmployee(raw: string): Promise<EmployeeLookup> {
  try {
    await actor();
  } catch (err) {
    return { ok: false, reason: "error", message: err instanceof Error ? err.message : "ไม่มีสิทธิ์" };
  }
  const id = raw.trim();
  if (!/^\d{4,10}$/.test(id)) return { ok: false, reason: "not-found", message: "รหัสพนักงานเป็นตัวเลขเท่านั้น" };

  try {
    const u = await getUser(id, { cache: "no-store" });
    if (!u?.employee_id) return { ok: false, reason: "not-found", message: "ไม่พบรหัสพนักงานนี้ในระบบ" };
    return {
      ok: true,
      employeeId: String(u.employee_id),
      name: `${u.firstname ?? ""} ${u.lastname ?? ""}`.trim() || String(u.employee_id),
      position: u.position?.trim() ?? "",
      department: u.department?.trim() ?? "",
      division: u.division?.division_th?.trim() ?? "",
      site: siteFromText(u.site),
      siteText: u.site?.trim() ?? "",
      imageUrl: u.image_url?.trim() || null,
      inactive: Boolean(u.employee_status) && u.employee_status!.toLowerCase() !== "active",
    };
  } catch (err) {
    if (err instanceof NcacError && err.status === 404)
      return { ok: false, reason: "not-found", message: "ไม่พบรหัสพนักงานนี้ในระบบ" };
    console.warn("[parking] lookupEmployee", err);
    return { ok: false, reason: "error", message: "ค้นข้อมูลพนักงานไม่สำเร็จ — กรอกชื่อและสังกัดเองได้" };
  }
}

/* ------------------------------------------------------------------ ทะเบียนรถ */

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; message: string };

/**
 * ผู้ทำรายการจาก session — **สิทธิ์ตรวจที่นี่ทุกครั้ง** ไม่เชื่อค่าที่หน้าส่งมา
 * · `parking-admin` ใช้ `canAccessMenuStrict` (อ่านสิทธิ์ไม่ได้ = ไม่ใช่แอดมิน)
 * · เมนู `parking` เองก็ต้องมีสิทธิ์ ไม่งั้นยิง action ตรง ๆ ข้ามหน้าที่ซ่อนไว้ได้
 */
async function actor(): Promise<Actor> {
  const user = await readSessionUser();
  if (!user) throw new ParkingError("หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่");
  const [menu, admin] = await Promise.all([canAccessMenuStrict("parking"), canAccessMenuStrict(PARKING_ADMIN)]);
  if (!menu) throw new ParkingError("ไม่มีสิทธิ์ใช้บริการจอดรถ");
  return { employeeId: user.employeeId, admin };
}

async function run<T>(fn: (a: Actor) => Promise<T>, write = true): Promise<ActionResult<T>> {
  try {
    const data = await fn(await actor());
    if (write) revalidatePath("/desk/parking");
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ParkingError) return { ok: false, message: err.message };
    console.error("[parking]", err);
    return { ok: false, message: "บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง" };
  }
}

export async function registerVehicle(input: VehicleInput) {
  return run(async (a) => (await createVehicle(a, input)).id);
}

export async function resubmitVehicleAction(id: string, input: VehicleInput) {
  return run((a) => resubmitVehicle(a, id, input));
}

export async function approveVehicleAction(id: string) {
  return run((a) => approveVehicle(a, id));
}

export async function returnVehicleAction(id: string, reason: string) {
  return run((a) => setVehicleStatus(a, id, "returned", reason));
}

export async function cancelVehicleAction(id: string, reason: string) {
  return run((a) => setVehicleStatus(a, id, "cancelled", reason));
}

/** ประวัติการสแกน QR ของรถคันนี้ — แผงขวาของตารางแอดมิน */
export async function listScansAction(vehicleId: string) {
  return run((a) => listScans(a, vehicleId), false);
}
