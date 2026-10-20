/**
 * โครงเปล่าระหว่างรอข้อมูลหน้า Onboarding — ลอกรูปจากหน้าขอสรรหา (การ์ดสรุป 6 ช่อง → แถบ → ตาราง)
 * ทุกชั้นแบนบนแผ่นเนื้อหาเหมือนของจริง
 */

export default function LoadingOnboarding() {
  return (
    <div className="sheet-bleed">
      {/* การ์ดสรุปติดขอบบนของแผ่นเหมือนของจริง (แผ่นไม่มี padding บนแล้ว) แท็บอยู่ใต้การ์ด */}
      <div className="grid gap-px border-y border-line bg-line sm:grid-cols-2 xl:grid-cols-6">
        {[0, 1, 2, 3, 4, 5].map((i) => (
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
