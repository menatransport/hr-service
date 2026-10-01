import { notFound } from "next/navigation";

import { PageHead } from "@/components/desk/page-head";
import { DriverProfile } from "@/app/recruitment/_components/admin/driver-profile";
import { DataError } from "@/components/ui/data-error";
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

  let driver;
  try {
    driver = await getDriverProfile(decodeURIComponent(code));
  } catch (err) {
    return (
      <div className="flex flex-col gap-5 animate-rise">
        <PageHead title="ประวัติคนขับ" />
        <div className="mx-auto max-w-xl py-6">
          <DataError
            title="โหลดประวัติคนขับไม่สำเร็จ"
            envKey="MONGO_URI"
            message={err instanceof Error ? err.message : "เชื่อมต่อฐานข้อมูลไม่สำเร็จ"}
          />
        </div>
      </div>
    );
  }

  // อ่านฐานข้อมูลผ่านแล้วแต่ไม่มีรหัสนี้ = 404 จริง ไม่ใช่ความผิดพลาดของระบบ
  if (!driver) notFound();

  return <DriverProfile driver={driver} />;
}
