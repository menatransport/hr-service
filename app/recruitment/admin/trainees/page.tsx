import type { Metadata } from "next";
import { GraduationCap } from "lucide-react";

import { PageHead } from "@/components/desk/page-head";
import { TraineeMatrix } from "@/app/recruitment/_components/admin/trainee-matrix";
import { DataError } from "@/components/ui/data-error";
import { getTraineeBoard } from "@/app/recruitment/_lib/drivers/trainee-board";
import type { TraineeBoard } from "@/app/recruitment/_lib/drivers/trainee-board";
import { getVehicleOptions } from "@/app/recruitment/_lib/requisitions/options";

/**
 * ติดตามฝึกงาน — ตารางเช็กรายวันที่ **ดูและกรอกอยู่ในช่องเดียวกัน**
 *
 * ทุกช่องถูกผ่าทแยง: ครึ่งบนคือรหัสที่ระบบ ATMS ดึงมาให้ ครึ่งล่างคือรหัสที่
 * ฝ่ายบุคคลกรอกเอง — ดูเหตุผลเต็มที่ `_components/admin/trainee-cell.tsx`
 *
 * **ไม่ได้ใช้ `getDriverRegistry()` ร่วมกับหน้าทะเบียนประวัติแล้ว** — ตัวนั้นส่ง
 * พจส. ทั้ง 2,617 คนพร้อมสถานะรายวันทุกวันที่มี (~6.9 MB) เพื่อวาดตารางของคน
 * ราว 150 คนในเดือนเดียว · `getTraineeBoard()` คัดตั้งแต่ฝั่งฐานข้อมูลแทน
 *
 * **เดือนมาจาก `?m=`** จึงแชร์ลิงก์/กดปุ่ม back ได้ และเซิร์ฟเวอร์อ่านเฉพาะ
 * เดือนนั้นเดือนเดียว · `force-dynamic` เพราะทั้งหน้าคิดจากวันที่ของวันนี้
 */

export const metadata: Metadata = {
  title: "ติดตามฝึกงาน",
};

export const dynamic = "force-dynamic";

export default async function TraineesPage({
  searchParams,
}: PageProps<"/recruitment/admin/trainees">) {
  const params = await searchParams;
  const month = typeof params.m === "string" ? params.m : "";

  let board: TraineeBoard | null = null;
  let error: string | null = null;

  /* รถกับตารางฝึกงานอ่านคนละ db กันและไม่ขึ้นกันเลย — ยิงพร้อมกัน · อ่านรถไม่ได้
     ก็แค่ผูกทะเบียนรถจากหน้านี้ไม่ได้ชั่วคราว ไม่ใช่เหตุผลที่ทั้งหน้าต้องพัง
     (`getVehicleOptions()` คืน `[]` เองเมื่อพัง ไม่โยน error ต่อ จึงไม่ต้อง `allSettled`) */
  const [boardResult, vehicles] = await Promise.allSettled([
    getTraineeBoard(month),
    getVehicleOptions(),
  ]);

  if (boardResult.status === "fulfilled") board = boardResult.value;
  else
    error =
      boardResult.reason instanceof Error
        ? boardResult.reason.message
        : "เชื่อมต่อฐานข้อมูลไม่สำเร็จ";

  const vehicleOptions = vehicles.status === "fulfilled" ? vehicles.value : [];

  return (
    <div className="flex flex-col gap-4 animate-rise">
      {!board ? (
        <div className="mx-auto max-w-xl py-6">
          <DataError
            title="โหลดข้อมูลติดตามฝึกงานไม่สำเร็จ"
            envKey="MONGO_URI"
            message={error ?? "เชื่อมต่อฐานข้อมูลไม่สำเร็จ"}
          />
        </div>
      ) : board.drivers.length === 0 && board.month === board.months[0] ? (
        <EmptyRegistry />
      ) : (
        <TraineeMatrix board={board} vehicles={vehicleOptions} />
      )}
    </div>
  );
}

/**
 * เดือนปัจจุบันไม่มีใครให้ติดตามเลย — **บอกให้ชัดว่าเพราะอะไร** แทนที่จะขึ้น
 * ตารางเปล่าซึ่งอ่านได้ว่า “ไม่มีใครฝึกงานเลย” ทั้งที่อาจแปลว่ายังไม่มีข้อมูลมาให้ดู
 */
function EmptyRegistry() {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-box border border-dashed border-line bg-base-100 px-5 py-14 text-center">
      <GraduationCap size={24} strokeWidth={1.6} className="text-mut" aria-hidden />
      <p className="text-sm font-semibold">เดือนนี้ยังไม่มีใครต้องติดตาม</p>
      <p className="max-w-[56ch] text-12-5 leading-[1.7] text-mut text-pretty">
        ยังไม่มีใครมีสถานะฝึกงาน (<code className="font-mono">ฝ</code>) ในเดือนนี้ ทั้งจาก ATMS
        และที่กรอกเอง · ถ้าคิดว่าน่าจะมี ให้ตรวจว่าสถานะการทำงาน (
        <code className="font-mono">employee_work_status</code>) กับทะเบียน{" "}
        <code className="font-mono">main_driver</code> ใน Boom_ETL อัปเดตแล้วหรือยัง
      </p>
    </div>
  );
}
