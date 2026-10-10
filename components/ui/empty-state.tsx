import { Mascot } from "@/components/ui/mascot";

/**
 * ทางตันของรายการ (ไม่มีข้อมูล / ไม่ตรงตัวกรอง) — น้องมีนาทำหน้าเหวอ + บอกทางกลับ
 *
 * ใช้ร่วมกันในคิวคำร้อง บันทึกเคส และทะเบียนพนักงาน · ถ้ามีตัวกรองค้างอยู่ต้องส่ง
 * `onClear` มาด้วยเสมอ ทางตันต้องกลับได้ด้วยคลิกเดียว
 */
export function EmptyState({
  title,
  hint,
  bubble,
  onClear,
  clearLabel = "ล้างตัวกรอง",
  className = "",
}: {
  title: string;
  hint?: React.ReactNode;
  /** คำพูดของมาสคอต · ไม่ใส่ = ไม่มีลูกโป่ง */
  bubble?: string;
  onClear?: () => void;
  clearLabel?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex animate-fade-in flex-col items-center gap-2.5 px-5 py-12 text-center ${className}`}
    >
      <Mascot size={84} mood="oops" bubble={bubble} className="mb-1" />
      <p className="text-15 font-semibold">{title}</p>
      {hint ? (
        <p className="max-w-[46ch] text-12-5 leading-[1.7] text-mut text-pretty">{hint}</p>
      ) : null}
      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="btn-sec mt-1.5 px-4 py-2 text-12-5 text-ink"
        >
          {clearLabel}
        </button>
      ) : null}
    </div>
  );
}
