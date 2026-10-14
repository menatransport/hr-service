import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DataError } from "@/components/ui/data-error";
import { RequisitionsScreen } from "@/app/recruitment/_components/admin/recruitment-screens";
import { ADMIN_ROOT } from "@/app/recruitment/_lib/admin-nav";
import {
  getRequisitionOptions,
  type RequisitionOptions,
} from "@/app/recruitment/_lib/requisitions/options";
import { listRequisitions } from "@/app/recruitment/_lib/requisitions/store";
import type { Requisition } from "@/app/recruitment/_lib/requisitions/types";

/**
 * ขออัตราสรรหาพนักงาน — ตารางคำขอสรรหาอย่างเดียว (ผู้สมัครแยกไปอยู่ `/candidates`
 * ตั้งแต่ 14 ต.ค. 2026 ดู `recruitment-screens.tsx`)
 *
 * `force-dynamic` เพราะทั้งหน้าคิดจากวันที่ของวันนี้ (คอลัมน์ “รอมาแล้ว” และ
 * การ์ดค้างนาน) และสถานะใบสมัครที่ผูกไว้เปลี่ยนได้ตลอดเวลา
 *
 * **ตัวเลือกพังไม่ล้มทั้งหน้า** (`getRequisitionOptions()` จับ error เองแล้วคืน
 * `failed` มาให้ขึ้นแถบเตือน) ส่วนคำขออ่านไม่ได้เมื่อไหร่คือ `DataError`
 * เพราะไม่มีอะไรจะแสดงเลย — **ห้ามขึ้นหน้าเปล่า**
 */

export const metadata: Metadata = {
  title: "ขออัตราสรรหาพนักงาน",
};

export const dynamic = "force-dynamic";

export default async function RequisitionsPage({
  searchParams,
}: PageProps<"/recruitment/admin/requisitions">) {
  const params = await searchParams;

  /* ลิงก์เก่าสมัยยังเป็นแท็บ (`?tab=candidates&ref=`) — ส่งต่อไปหน้าผู้สมัคร */
  if (params.tab === "candidates") {
    const query = new URLSearchParams();
    if (typeof params.ref === "string" && params.ref) query.set("ref", params.ref);
    redirect(`${ADMIN_ROOT}/candidates${query.size ? `?${query}` : ""}`);
  }

  let rows: Requisition[] | null = null;
  let options: RequisitionOptions | null = null;
  let error: string | null = null;

  try {
    [rows, options] = await Promise.all([listRequisitions(), getRequisitionOptions()]);
  } catch (err) {
    error = err instanceof Error ? err.message : "เชื่อมต่อฐานข้อมูลไม่สำเร็จ";
  }

  return (
    <div className="animate-rise">
      {rows && options ? (
        <RequisitionsScreen initialRequisitions={rows} options={options} />
      ) : (
        <div className="mx-auto max-w-xl py-6">
          <DataError
            title="โหลดข้อมูลคำขอสรรหาไม่สำเร็จ"
            envKey="MONGO_URI"
            message={error ?? "เชื่อมต่อฐานข้อมูลไม่สำเร็จ"}
          />
        </div>
      )}
    </div>
  );
}
