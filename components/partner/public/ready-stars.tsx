/** ระดับดาวบนเว็บขายรถ: ★★★★★ = พร้อมขาย (saleStatus ready) · ★★★ = รถว่างที่อยู่ระหว่างเตรียมรถ
 *  ใช้ร่วม การ์ด / ตัวกรอง / หน้ารายละเอียด ให้หน้าตาเดียวกัน */
function Stars({ count, className = "" }: { count: number; className?: string }) {
  return (
    <span className={`tracking-[-0.08em] text-[#E0A800] ${className}`} aria-hidden="true">{"★".repeat(count)}</span>
  )
}

export const ReadyStars = ({ className = "" }: { className?: string }) => <Stars count={5} className={className} />
export const PrepStars = ({ className = "" }: { className?: string }) => <Stars count={3} className={className} />

const pill = "inline-flex items-center gap-1.5 rounded-full bg-white/95 text-[var(--mena-green-deep)] text-xs font-medium px-3 py-1 shadow-sm"

/** ป้าย "★★★★★ พร้อมขาย" แบบเม็ดยา — วางบนรูปการ์ด */
export function ReadyBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`${pill} ${className}`}>
      <ReadyStars />
      พร้อมขาย
    </span>
  )
}

/** ป้าย ★★★ ไม่มีข้อความ (ผู้ใช้เลือก) — ความหมายอยู่ในคำอธิบายใต้หัวข้อ; screen reader อ่านเป็นข้อความ */
export function PrepBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`${pill} ${className}`}>
      <PrepStars />
      <span className="sr-only">อยู่ระหว่างเตรียมรถ</span>
    </span>
  )
}
