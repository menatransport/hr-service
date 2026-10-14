/**
 * โครงเปล่าระหว่างรอข้อมูลของหน้าขอสรรหาและผู้สมัคร
 *
 * หน้านี้เป็น `force-dynamic` และอ่าน Mongo ใหม่ทุกครั้งที่เปิด (คำขอ · ตัวเลือก
 * ในฟอร์ม · ใบสมัคร · รายชื่อผู้ติดต่อกลับ ยิงพร้อมกันสี่ชุด) — ระหว่างรอ เดิมคือ
 * พื้นที่ว่างเปล่าซึ่งอ่านไม่ออกว่ากำลังโหลดอยู่หรือระบบค้าง
 *
 * รูปร่างของโครงตรงกับของจริง (แถบแท็บ → การ์ดสรุปสี่ใบ → หัวตาราง → แปดแถว)
 * หน้าจึงไม่กระโดดตอนข้อมูลมาถึง · โครงวาดตาม**แท็บคำขอสรรหา**ซึ่งเป็นแท็บตั้งต้น
 *
 * **ทุกชั้นแบนบนแผ่นเนื้อหา** (13 ต.ค. 2026) ตามของจริงที่เป็น `SummaryPanel` เดียว —
 * ไม่มีกรอบ/เงา คั่นกันด้วยเส้นบางที่ยาวชนขอบแผ่น
 */

export default function LoadingRequisitions() {
  return (
    <div className="sheet-bleed">
      {/* การ์ดสรุปติดขอบบนของแผ่นเหมือนของจริง (แผ่นไม่มี padding บนแล้ว) แท็บอยู่ใต้การ์ด */}
      <div className="grid gap-px border-y border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-2 bg-base-100 px-(--sheet-px) py-4">
            <Bar className="h-2.5 w-24" />
            <Bar className="h-7 w-20" />
          </div>
        ))}
      </div>

      <div className="flex w-fit gap-1 px-(--sheet-px) py-3.5">
        <Bar className="h-7 w-28 rounded-full" />
        <Bar className="h-7 w-24 rounded-full" />
      </div>

      <div>
        <div className="border-b border-line bg-base-200 px-(--sheet-px) py-2.5">
          <Bar className="h-2.5 w-full max-w-[620px]" />
        </div>
        {Array.from({ length: 8 }, (_, i) => (
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
