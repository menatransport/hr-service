import { PageHead } from "@/components/desk/page-head";

/**
 * โครงเปล่าระหว่างรอข้อมูลของหน้าขอสรรหาและผู้สมัคร
 *
 * หน้านี้เป็น `force-dynamic` และอ่าน Mongo ใหม่ทุกครั้งที่เปิด (คำขอ · ตัวเลือก
 * ในฟอร์ม · ใบสมัคร · รายชื่อผู้ติดต่อกลับ ยิงพร้อมกันสี่ชุด) — ระหว่างรอ เดิมคือ
 * พื้นที่ว่างเปล่าซึ่งอ่านไม่ออกว่ากำลังโหลดอยู่หรือระบบค้าง
 *
 * รูปร่างของโครงตรงกับของจริง (หัวเรื่อง → แถบแท็บ → การ์ดสรุปสี่ใบ → หัวตาราง →
 * แปดแถว) หน้าจึงไม่กระโดดตอนข้อมูลมาถึง · โครงวาดตาม**แท็บคำขอสรรหา**ซึ่งเป็น
 * แท็บตั้งต้น หัวเรื่องเป็นของจริงตั้งแต่แรกเพราะไม่ต้องรอฐานข้อมูล
 */

export default function LoadingRequisitions() {
  return (
    <div className="flex flex-col gap-3">

      <div className="flex w-fit gap-1 rounded-full border border-line bg-base-100 p-1">
        <Bar className="h-7 w-28 rounded-full" />
        <Bar className="h-7 w-24 rounded-full" />
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-box border border-line bg-base-100 p-4"
          >
            <Bar className="h-2.5 w-24" />
            <Bar className="h-7 w-20" />
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-box border border-line bg-base-100">
        <div className="border-b border-line bg-base-200 px-3 py-2.5">
          <Bar className="h-2.5 w-full max-w-[620px]" />
        </div>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="border-b border-line px-3 py-3 last:border-b-0">
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
