import { BookUser } from "lucide-react";

import { PageHead } from "@/components/desk/page-head";

/**
 * ทะเบียนประวัติ พจส. แยกตามสาขา
 *
 * โครงหน้าพร้อมแล้วแต่ **ยังไม่มีข้อมูล** — NCAC มีแค่ `/users` ซึ่งเป็นพนักงาน
 * ออฟฟิศ (ยานยนต์ / จัดส่ง / บัญชี ฯลฯ) ไม่ใช่ พจส. ส่วน พจส. โผล่แค่เป็นชื่อกับ
 * รหัสบนคำร้อง และไม่มีฟิลด์สาขาให้แยกทะเบียน
 *
 * จึงบอกตรง ๆ ว่ารอ endpoint แทนที่จะขึ้นตารางเปล่า ซึ่งจะอ่านเป็น
 * “ทะเบียนนี้ไม่มีใครอยู่” ทั้งที่ความจริงคือยังไม่ได้ต่อข้อมูล
 */
export function RegistryView({ title, branch }: { title: string; branch: string }) {
  return (
    <div className="flex flex-col gap-5 animate-rise">
      <PageHead title={title} subtitle={`ประวัติพนักงานขับรถประจำ${branch}`} />

      <div className="flex flex-col items-center gap-2.5 rounded-box border border-dashed border-line bg-base-100 px-5 py-14 text-center">
        <BookUser size={24} strokeWidth={1.6} className="text-mut" aria-hidden />
        <p className="text-sm font-semibold">ยังไม่มีข้อมูลทะเบียน</p>
        <p className="max-w-[52ch] text-[12.5px] leading-[1.7] text-mut text-pretty">
          NCAC ยังไม่มี endpoint ทะเบียนประวัติ พจส. — หน้านี้เตรียมโครงไว้แล้ว
          ต่อข้อมูลได้ทันทีเมื่อ endpoint พร้อม
        </p>
      </div>
    </div>
  );
}
