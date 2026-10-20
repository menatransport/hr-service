import type { Metadata } from "next";

import { DataError } from "@/components/ui/data-error";
import { TruckStatusView } from "@/app/recruitment/_components/admin/truck-status-view";
import { getTruckBoard, type TruckBoard } from "@/app/recruitment/_lib/drivers/truck-status";

/**
 * สถานะรถ — รถทุกคันของบริษัท + คนขับประจำวันนี้ + งานซ่อม ในหน้าเดียว
 *
 * อ่านสดจาก `Boom_ETL` อย่างเดียว (`_lib/drivers/truck-status.ts`) · `force-dynamic`
 * เพราะสถานะคนขับคิดจาก “วันนี้” ถ้า cache ไว้จะค้างเป็นของเมื่อวาน
 */

export const metadata: Metadata = {
  title: "สถานะรถ",
};

export const dynamic = "force-dynamic";

export default async function TruckStatusPage() {
  let board: TruckBoard | null = null;
  let error: string | null = null;

  try {
    board = await getTruckBoard();
  } catch (err) {
    error = err instanceof Error ? err.message : "เชื่อมต่อฐานข้อมูลไม่สำเร็จ";
  }

  if (!board)
    return (
      <div className="mx-auto max-w-xl py-6">
        <DataError title="โหลดสถานะรถไม่สำเร็จ" envKey="MONGO_URI" message={error ?? ""} />
      </div>
    );

  return <TruckStatusView board={board} />;
}
