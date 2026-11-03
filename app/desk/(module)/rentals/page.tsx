import { DataError } from "@/components/ui/data-error";
import { getMonthTotals, getRentalBoard } from "@/lib/rentals/store";
import { isMonth } from "@/lib/rentals/types";
import { todayInBangkok } from "@/app/recruitment/_lib/drivers/registry";

import { RentalsView } from "./_components/rentals-view";

export const metadata = { title: "จัดการห้องเช่า" };

/** ทะเบียน พจส. เปลี่ยนได้ตลอด (พ้นสภาพ · ย้ายแพล้นท์) — อ่านสดทุกครั้ง */
export const dynamic = "force-dynamic";

/**
 * ห้องเช่าของบริษัท (`/desk/rentals?m=YYYY-MM`) — ตารางเดียวต่อเดือน แทนไฟล์คุม Excel + เมนูห้องเช่าของ Mena-Next
 * ข้อมูลคนมาจากทะเบียนประวัติ พจส. เท่านั้น · ดู `lib/rentals/store.ts` และ `.claude/docs/rentals.md`
 */
export default async function RentalsPage(props: PageProps<"/desk/rentals">) {
  const { m } = await props.searchParams;
  const month = isMonth(m) ? m : todayInBangkok().slice(0, 7);

  // แถว “สรุปค่าเช่า” ของบันทึกขออนุมัติ — ม.ค. ถึงเดือนที่เปิดของปีเดียวกัน
  const year = month.slice(0, 4);
  const months = Array.from({ length: Number(month.slice(5)) }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);

  let board;
  let monthTotals: Record<string, number | null> = {};
  try {
    [board, monthTotals] = await Promise.all([getRentalBoard(month), getMonthTotals(months)]);
  } catch (err) {
    return (
      <DataError
        title="โหลดข้อมูลห้องเช่าไม่สำเร็จ"
        message={err instanceof Error ? err.message : "เชื่อมต่อฐานข้อมูลไม่สำเร็จ"}
        envKey="MONGO_URI"
      />
    );
  }
  return <RentalsView board={board} monthTotals={monthTotals} />;
}
