/**
 * โครงเปล่าระหว่างรอข้อมูล — ใช้ร่วมทุกหน้าใต้ศูนย์กลางสรรหาที่ไม่มี `loading.tsx` ของตัวเอง
 *
 * ทุกหน้าในนี้เป็น `force-dynamic` และอ่าน Mongo ทุกครั้งที่เปิด — **ถ้าไม่มีไฟล์นี้**
 * Next จะ prefetch หน้าเหล่านี้ไม่ได้เลย กดเมนูแล้วจอค้างหน้าเดิมจนเซิร์ฟเวอร์เรนเดอร์
 * เสร็จทั้งหน้า (ดูเหมือนกดไม่ติด) · มีไฟล์นี้แล้ว Next prefetch โครงนี้ไว้ล่วงหน้า
 * กดแล้วสลับทันที แถบบน/แถบข้างยังกดต่อได้ระหว่างรอ
 *
 * รูปร่างกลาง ๆ (แถบเครื่องมือ → ตาราง) พอให้ไม่กระโดดมากในหน้าส่วนใหญ่ ·
 * หน้าที่รูปร่างต่างชัด ๆ ให้มี `loading.tsx` ของตัวเอง (เช่น `requisitions/`)
 */

export default function LoadingAdmin() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="กำลังโหลด">
      <div className="flex flex-wrap items-center gap-2 pt-4 sm:pt-5">
        <Bar className="h-9 w-64 rounded-field" />
        <Bar className="h-9 w-28 rounded-field" />
        <Bar className="h-9 w-28 rounded-field" />
      </div>

      {/* ตารางแบนชนขอบแผ่นเนื้อหา — รูปเดียวกับ `SummaryBody` ของหน้าจริง */}
      <div className="sheet-bleed border-t border-line">
        <div className="border-b border-line bg-base-200 px-(--sheet-px) py-2.5">
          <Bar className="h-2.5 w-full max-w-[620px]" />
        </div>
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="border-b border-line px-(--sheet-px) py-3">
            <Bar className="h-4 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Bar({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`block animate-pulse rounded-selector bg-base-200 ${className}`}
    />
  );
}
