import { headers } from "next/headers";

import { DataError } from "@/components/ui/data-error";
import { readSessionUser } from "@/lib/auth/session";
import { canAccessMenuStrict } from "@/lib/menu-permissions";
import { listVehicles } from "@/lib/parking/store";
import { PARKING_ADMIN, siteFromText } from "@/lib/parking/types";
import { guessDesktop } from "@/lib/viewport";

import { ParkingView } from "./_components/parking-view";

export const metadata = { title: "บริการจอดรถบริษัท" };

/** สถานะคำขอเปลี่ยนจากคนอื่นได้ตลอด (HR อนุมัติ/ส่งกลับ) — อ่านสดทุกครั้ง */
export const dynamic = "force-dynamic";

/**
 * บริการจอดรถบริษัท (`/desk/parking`) — เฟส 1 ลงทะเบียนรถ + ออกบัตรจอด · เปิดใช้บน prod แล้ว (25 พ.ย. 2569)
 *
 * ข้อมูลจริงจาก `hr_service.parking_vehicles` (`lib/parking/store.ts`) · เขียนผ่าน server actions (`./actions.ts`)
 *
 * สองมุมมอง: สิทธิ์ย่อย `parking-admin` (HOD + Process Excellence) = ตารางทะเบียนทุกคัน และสลับไปดูหน้าผู้ใช้
 * ได้จากปุ่มบนแถบบน · คนอื่น = “บัตรจอดของฉัน” เท่านั้น · ดู `lib/parking/types.ts`
 */
export default async function ParkingPage() {
  const [user, admin, initialDesktop, h] = await Promise.all([
    readSessionUser(),
    canAccessMenuStrict(PARKING_ADMIN),
    guessDesktop(),
    headers(),
  ]);
  // origin ของลิงก์ใน QR — เว็บที่เปิดอยู่ตอนนี้ (prod = โดเมนจริง · dev = localhost)
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const qrOrigin = host ? `${proto}://${host}` : "";
  let vehicles;
  try {
    // กรองตามสิทธิ์ที่เซิร์ฟเวอร์ — ผู้ใช้ทั่วไปไม่ได้รับข้อมูลรถของคนอื่นมาถึงเบราว์เซอร์เลย
    vehicles = await listVehicles({ employeeId: user?.employeeId ?? "", admin });
  } catch (err) {
    return (
      <DataError
        title="โหลดทะเบียนรถไม่สำเร็จ"
        message={err instanceof Error ? err.message : "เชื่อมต่อฐานข้อมูลไม่สำเร็จ"}
        envKey="MONGO_URI"
      />
    );
  }
  return (
    <ParkingView
      vehicles={vehicles}
      qrOrigin={qrOrigin}
      admin={admin}
      initialDesktop={initialDesktop}
      me={{
        employeeId: user?.employeeId ?? "",
        name: user?.name ?? "",
        department: user?.department ?? "",
        site: siteFromText(user?.site),
      }}
    />
  );
}
