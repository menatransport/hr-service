import type { Metadata } from "next";
import { BookUser, Info, RefreshCw } from "lucide-react";

import { PageHead } from "@/components/desk/page-head";
import { DriverRegistryView } from "@/app/recruitment/_components/admin/driver-registry-view";
import { DataError } from "@/components/ui/data-error";
import { getDriverList } from "@/app/recruitment/_lib/drivers/registry";
import { formatThaiDateTime } from "@/app/recruitment/_lib/drivers/types";
import type { DriverRegistry } from "@/app/recruitment/_lib/drivers/types";

/**
 * ทะเบียนประวัติ พจส. — รายชื่อพนักงานขับรถทั้งหมด
 *
 * อ่านสดจาก `Boom_ETL.main_driver` + ฟิลด์ของฝ่ายบุคคลใน `hr_service.master_driver`
 * (`_lib/drivers/master.ts`) · ถ้าต้นทางว่าง หน้านี้จะบอกตรง ๆ
 * **ไม่ใช่ขึ้นตารางเปล่า** ซึ่งอ่านเป็น “บริษัทไม่มีคนขับสักคน”
 *
 * อ่านผ่าน `getDriverList()` — ไม่มีปฏิทินรายวัน/ของที่กรอกเอง/แฟ้มเอกสาร ตั้งแต่ใน query
 * (ตารางใช้แค่ `work.latestStatus`) · ประวัติรายคนอ่านใหม่จาก `getDriverProfile()` เอง
 *
 * `force-dynamic` เพราะทั้งหน้าคิดจากวันที่ของวันนี้ (ใบขับขี่เหลือกี่วัน อายุงานเท่าไร)
 * ถ้าปล่อยให้ cache ไว้ ตัวเลข “เหลือ 3 วัน” จะค้างอยู่อย่างนั้นข้ามสัปดาห์
 */

export const metadata: Metadata = {
  title: "ทะเบียนประวัติ พจส.",
};

export const dynamic = "force-dynamic";

export default async function DriversRegistryPage() {
  let registry: DriverRegistry | null = null;
  let error: string | null = null;

  try {
    registry = await getDriverList();
  } catch (err) {
    error = err instanceof Error ? err.message : "เชื่อมต่อฐานข้อมูลไม่สำเร็จ";
  }

  return (
    <div className="flex flex-col gap-4 animate-rise">
      {registry ? (
        registry.drivers.length ? (
          <>
            <ReadOnlyNotice enrichmentFailed={registry.enrichmentFailed} />
            <DriverRegistryView registry={registry} />
          </>
        ) : (
          <EmptyRegistry />
        )
      ) : (
        <div className="mx-auto max-w-xl py-6">
          <DataError
            title="โหลดทะเบียนประวัติไม่สำเร็จ"
            envKey="MONGO_URI"
            message={error ?? "เชื่อมต่อฐานข้อมูลไม่สำเร็จ"}
          />
        </div>
      )}
    </div>
  );
}

/**
 * แถบ “อ่านอย่างเดียว” — อยู่ถาวร ไม่ใช่ toast ที่หายไป
 *
 * ข้อมูลชุดนี้เป็นกระจกเงาของ ETL ผู้ใช้ต้องรู้ตั้งแต่วินาทีแรกว่าแก้ที่นี่ไม่ได้
 * ไม่ใช่รู้ตอนไล่หาปุ่มแก้ไขจนทั่วหน้าแล้วไม่เจอ
 */
function ReadOnlyNotice({ enrichmentFailed }: { enrichmentFailed: boolean }) {
  /* ไม่มีอะไรจะเตือน = ไม่วาดกล่องเปล่า — กล่องเปล่ายังกิน `gap-4` ของหน้า แถบสรุปเลยไม่ติดขอบบนของแผ่น */
  if (!enrichmentFailed) return null;

  return (
    <div className="flex flex-col gap-2">

      {enrichmentFailed ? (
        <p
          role="status"
          className="flex items-start gap-2.5 rounded-box border border-sla/30 bg-[color-mix(in_oklab,var(--color-sla)_6%,var(--color-base-100))] px-4 py-3 text-12-5 text-sla text-pretty"
        >
          <Info size={15} strokeWidth={1.8} aria-hidden className="mt-0.5 flex-none" />
          อ่านข้อมูลรถและสถานะการทำงานจาก ไม่สำเร็จ — รายชื่อในทะเบียนยังครบ
          แต่คอลัมน์ “รถที่ประจำ” จะว่างทั้งตาราง
        </p>
      ) : null}
    </div>
  );
}

function EmptyRegistry() {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-box border border-dashed border-line bg-base-100 px-5 py-14 text-center">
      <BookUser size={24} strokeWidth={1.6} className="text-mut" aria-hidden />
      <p className="text-sm font-semibold">ยังไม่มีข้อมูลในทะเบียน</p>
      <p className="max-w-[54ch] text-12-5 leading-[1.7] text-mut text-pretty">
        อ่าน <code className="font-mono">Boom_ETL.main_driver</code> ของระบบต้นทางแล้วไม่พบใครเลย —
        ตรวจว่า ETL ยังส่งข้อมูลอยู่ แล้วโหลดหน้านี้ใหม่
      </p>
    </div>
  );
}
