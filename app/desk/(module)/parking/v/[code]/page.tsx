import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { readSessionUser } from "@/lib/auth/session";
import { canAccessMenuStrict } from "@/lib/menu-permissions";
import { SOON } from "@/lib/modules";
import { findByCode, logScan, scanResultOf } from "@/lib/parking/store";
import { PARKING_ADMIN, PARKING_VERIFY } from "@/lib/parking/types";

import { ScanView } from "./scan-view";

export const metadata = { title: "ตรวจบัตรจอดรถ" };

/** สถานะบัตรเปลี่ยนได้ตลอด + ทุกครั้งที่เปิดต้องเขียน log — ห้าม cache */
export const dynamic = "force-dynamic";

/**
 * หน้าตรวจบัตรจอด — ปลายทางของ QR บนบัตร (`/desk/parking/v/<รหัสบัตร>`)
 *
 * - อยู่ใต้ `/desk` จึงต้องล็อกอินเสมอ (`proxy.ts` เด้งไปล็อกอินแล้วพากลับมาหน้านี้)
 * - เห็นข้อมูลรถได้เมื่อ: ผู้ดูแลทะเบียน (`parking-admin`) · ผู้ตรวจบัตร (`parking-verify` — รปภ./HR) ·
 *   หรือเป็นเจ้าของ/ผู้ยื่นของรถคันนั้น · คนอื่น = “ไม่มีสิทธิ์” **ไม่บอกด้วยว่าบัตรมีจริงไหม**
 * - **ทุกการเปิดเขียน log** `parking_scans` รวมครั้งที่ไม่มีสิทธิ์/ไม่พบบัตร (ใคร · เมื่อไร · ผล · อุปกรณ์ · IP)
 */
export default async function VerifyPage(props: PageProps<"/desk/parking/v/[code]">) {
  if (SOON) notFound();
  const { code: raw } = await props.params;
  const code = decodeURIComponent(raw).trim().toUpperCase();

  const [user, admin, verifier, vehicle, h] = await Promise.all([
    readSessionUser(),
    canAccessMenuStrict(PARKING_ADMIN),
    canAccessMenuStrict(PARKING_VERIFY),
    findByCode(code),
    headers(),
  ]);
  const me = user?.employeeId ?? "";
  const owner = Boolean(vehicle && me && (vehicle.ownerId === me || vehicle.requestedBy === me));
  const allowed = admin || verifier || owner;
  const result = allowed ? scanResultOf(vehicle) : "denied";

  const logged = await logScan({
    by: me,
    byName: user?.name ?? "",
    code,
    vehicleId: vehicle?.id ?? null,
    result,
    userAgent: (h.get("user-agent") ?? "").slice(0, 300),
    ip: (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0].trim(),
  });

  return (
    <ScanView
      code={code}
      result={result}
      vehicle={allowed ? vehicle : null}
      inspector={user?.name ?? ""}
      checkedAt={new Date().toISOString()}
      logged={logged}
      admin={admin}
    />
  );
}
