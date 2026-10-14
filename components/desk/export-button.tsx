"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { filtersToParams, hasFilters, type CaseFilters } from "@/lib/case-filter";
import { downloadFile } from "@/lib/http";
import { runAction } from "@/lib/swal";

/**
 * ปุ่มส่งออก Excel ของคิวคำร้อง
 *
 * **ส่งออก “สิ่งที่เห็นอยู่” ไม่ใช่ทั้งคิวเสมอ** — ตัวกรองปัจจุบันถูกส่งไปกับคำขอ
 * แล้วเซิร์ฟเวอร์กรองซ้ำด้วยกฎชุดเดียวกัน (`lib/case-filter.ts`) ป้ายบนปุ่มจึงบอก
 * จำนวนแถวที่จะได้จริง ไม่ใช่จำนวนคำร้องทั้งหมด
 *
 * ไฟล์ถูกดึงผ่าน `downloadFile()` แทนที่จะเป็น `<a download>` เพราะเส้นนี้ตอบ
 * `{ error }` เป็น JSON เมื่อพัง — ปล่อยให้เบราว์เซอร์เซฟเองจะได้ไฟล์ `.xlsx`
 * ที่เปิดไม่ขึ้นแทนข้อความบอกสาเหตุ
 */
export function ExportExcelButton({
  filters,
  count,
}: {
  filters: CaseFilters;
  /** จำนวนแถวที่ตรงกับตัวกรองตอนนี้ — `0` = ไม่มีอะไรให้ส่งออก */
  count: number;
}) {
  const [busy, setBusy] = useState(false);

  const scope = hasFilters(filters) ? "ตามตัวกรองปัจจุบัน" : "ทั้งคิว";

  async function download() {
    setBusy(true);
    const params = filtersToParams(filters);
    const query = params.toString();

    await runAction({
      confirm: false,
      pending: "กำลังสร้างไฟล์ Excel…",
      // บอกชื่อไฟล์ที่เซฟจริง ไม่ใช่จำนวนแถวที่หน้าจอนับไว้ — เซิร์ฟเวอร์อ่านข้อมูล
      // สดมากรองใหม่ ตัวเลขสองฝั่งจึงต่างกันได้ถ้ามีคำร้องเข้ามาระหว่างนั้น
      success: (name) => `บันทึก ${name} แล้ว`,
      failureTitle: "ส่งออก Excel ไม่สำเร็จ",
      run: async () => {
        try {
          return await downloadFile(
            `/api/cases/export${query ? `?${query}` : ""}`,
            "hr-cases.xlsx",
            "ส่งออก Excel ไม่สำเร็จ",
          );
        } finally {
          setBusy(false);
        }
      },
    });
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={busy || count === 0}
      /*
       * ป้ายบนปุ่มเป็นคำเดียวว่า “Excel” — ที่เหลือ (ส่งออกกี่รายการ ตามตัวกรองไหน)
       * อยู่ใน tooltip เพราะปุ่มนี้ยืนอยู่ท้ายแถวตัวกรองซึ่งบอกอยู่แล้วว่ากรองอะไรไว้
       */
      title={
        count === 0
          ? "ไม่มีคำร้องที่ตรงกับเงื่อนไขให้ส่งออก"
          : `ส่งออกคำร้อง ${scope} ${count} รายการเป็นไฟล์ Excel`
      }
      className="btn-sec flex flex-none items-center gap-1.5 px-3.5 py-1.5 text-13 font-medium text-ink disabled:pointer-events-none disabled:opacity-40"
    >
      {busy ? (
        <Loader2 size={15} strokeWidth={1.9} className="animate-spin" aria-hidden />
      ) : (
        <ExcelIcon />
      )}
      Excel
    </button>
  );
}

/**
 * ไอคอนไฟล์ Excel — **วาดเอง ไม่ได้เอาโลโก้ Microsoft มาใช้** (เป็นเครื่องหมายการค้า
 * และเป็นภาพสี่สีตายตัว ซึ่งจะแตกทันทีเมื่อปุ่มพลิกเป็นธีมมืด)
 *
 * เป็นแผ่นเอกสารมุมพับ + ตัว X แบบเดียวกับที่คนเห็นแล้วรู้ว่าเป็นสเปรดชีต ·
 * ใช้ `currentColor` และเส้นหนา 1.8 เท่าไอคอน lucide ตัวอื่นในระบบ จึงกลืนกันหมด
 */
function ExcelIcon() {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      className="flex-none text-excel"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="m8.5 13 5 5" />
      <path d="m13.5 13-5 5" />
    </svg>
  );
}
