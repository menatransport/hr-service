import type { Metadata } from "next";
import { BookUser, Info, RefreshCw } from "lucide-react";

import { PageHead } from "@/components/desk/page-head";
import { DriverRegistryView } from "@/app/recruitment/_components/admin/driver-registry-view";
import { DataError } from "@/components/ui/data-error";
import { getDriverRegistry } from "@/app/recruitment/_lib/drivers/registry";
import { formatThaiDateTime } from "@/app/recruitment/_lib/drivers/types";
import type { DriverRegistry } from "@/app/recruitment/_lib/drivers/types";

/**
 * ทะเบียนประวัติ พจส. — รายชื่อพนักงานขับรถทั้งหมด
 *
 * อ่านจาก `hr_service.master_driver` ซึ่ง `sync_master_driver.mjs` เป็นคนเติม
 * จาก `Boom_ETL.main_driver` · ถ้าคอลเลกชันยังว่าง หน้านี้จะบอกให้ไปรัน sync
 * **ไม่ใช่ขึ้นตารางเปล่า** ซึ่งอ่านเป็น “บริษัทไม่มีคนขับสักคน”
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
    registry = slimForList(await getDriverRegistry());
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
 * ตัดของที่ตารางรายชื่อไม่ได้ใช้ทิ้งก่อนส่งลง client
 *
 * `getDriverRegistry()` คืนสถานะรายวันทุกวันของทุกคน + ของที่กรอกเอง + แฟ้มเอกสาร
 * (~6.9 MB) แต่ `DriverRegistryView` ใช้แค่ `work.latestStatus` — ส่งไปทั้งก้อน
 * คือให้เบราว์เซอร์ดาวน์โหลดและ hydrate ของที่ไม่มีวันถูกวาด ทุกครั้งที่เปิดหน้านี้
 * · ประวัติรายคนอ่านใหม่จาก `getDriverProfile()` อยู่แล้ว ไม่ได้พึ่งก้อนนี้
 */
function slimForList(registry: DriverRegistry): DriverRegistry {
  return {
    ...registry,
    drivers: registry.drivers.map((d) => ({
      ...d,
      work: d.work ? { ...d.work, days: {}, months: [] } : null,
      manualDays: {},
      documents: [],
    })),
  };
}

/**
 * แถบ “อ่านอย่างเดียว” — อยู่ถาวร ไม่ใช่ toast ที่หายไป
 *
 * ข้อมูลชุดนี้เป็นกระจกเงาของ ETL ผู้ใช้ต้องรู้ตั้งแต่วินาทีแรกว่าแก้ที่นี่ไม่ได้
 * ไม่ใช่รู้ตอนไล่หาปุ่มแก้ไขจนทั่วหน้าแล้วไม่เจอ
 */
function ReadOnlyNotice({ enrichmentFailed }: { enrichmentFailed: boolean }) {
  return (
    <div className="flex flex-col gap-2">

      {enrichmentFailed ? (
        <p
          role="status"
          className="flex items-start gap-2.5 rounded-box border border-sla/30 bg-sla/6 px-4 py-3 text-12-5 text-sla text-pretty"
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
        คอลเลกชัน <code className="font-mono">master_driver</code> ยังว่างอยู่ — สั่ง{" "}
        <code className="font-mono text-ink">node sync_master_driver.mjs</code>{" "}
        หนึ่งครั้งเพื่อดึงทะเบียนจากระบบต้นทางเข้ามา แล้วโหลดหน้านี้ใหม่
      </p>
    </div>
  );
}
