import Link from "next/link";
import { notFound } from "next/navigation";

import { DriverProfile } from "@/app/recruitment/_components/admin/driver-profile";
import {
  DRIVER_PROFILE_TABS,
  type DriverProfileTab,
} from "@/app/recruitment/_lib/drivers/types";
import { DataError } from "@/components/ui/data-error";
import { EmptyState } from "@/components/ui/empty-state";
import { canAccessMenu } from "@/lib/menu-permissions";
import { getDriverProfile } from "@/app/recruitment/_lib/drivers/registry";

/**
 * ประวัติคนขับรายคน — `code` คือ `drivercode` ตรง ๆ
 * (`/recruitment/admin/drivers/D-10248`)
 *
 * ทะเบียนมาจากฐานข้อมูลที่ ETL sync เป็นรอบ จึงไม่มี `generateStaticParams`
 * และต้อง dynamic เหมือนหน้ารายชื่อ — ตัวเลข “ใบขับขี่เหลือกี่วัน” คิดจากวันนี้
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(
  props: PageProps<"/recruitment/admin/drivers/[code]">,
) {
  const { code } = await props.params;
  try {
    const driver = await getDriverProfile(decodeURIComponent(code));
    return { title: driver?.name || "ไม่พบคนขับรายนี้" };
  } catch {
    // ฐานข้อมูลล่ม — หน้ายังขึ้น `DataError` ได้ ชื่อแท็บไม่ควรพาลพังไปด้วย
    return { title: "ประวัติคนขับ" };
  }
}

export default async function DriverProfilePage(
  props: PageProps<"/recruitment/admin/drivers/[code]">,
) {
  const { code } = await props.params;

  // สิทธิ์ย่อย “เข้าหน้าประวัติรายคน” ตั้งที่ /desk/permissions — กันลิงก์จากหน้าอื่นและ URL ตรงด้วย
  if (!(await canAccessMenu("registry-profile"))) {
    return (
      <div className="mx-auto max-w-xl py-6">
        <EmptyState
          title="ไม่มีสิทธิ์เข้าหน้าประวัติรายคน"
          hint={
            <>
              ฝ่าย/แผนกของคุณยังไม่ได้รับสิทธิ์นี้ — ติดต่อผู้ดูแลให้เปิดที่หน้ากำหนดสิทธิ์ ·{" "}
              <Link href="/recruitment/admin/drivers" className="text-primary hover:underline">
                กลับทะเบียนประวัติ
              </Link>
            </>
          }
        />
      </div>
    );
  }

  let driver;
  try {
    driver = await getDriverProfile(decodeURIComponent(code));
  } catch (err) {
    return (
      <div className="mx-auto max-w-xl animate-rise py-6">
        <DataError
          title="โหลดประวัติคนขับไม่สำเร็จ"
          envKey="MONGO_URI"
          message={err instanceof Error ? err.message : "เชื่อมต่อฐานข้อมูลไม่สำเร็จ"}
        />
      </div>
    );
  }

  // อ่านฐานข้อมูลผ่านแล้วแต่ไม่มีรหัสนี้ = 404 จริง ไม่ใช่ความผิดพลาดของระบบ
  if (!driver) notFound();

  const { tab } = await props.searchParams;
  const initial = DRIVER_PROFILE_TABS.find((t) => t === tab) as DriverProfileTab | undefined;

  return <DriverProfile driver={driver} tab={initial} />;
}
