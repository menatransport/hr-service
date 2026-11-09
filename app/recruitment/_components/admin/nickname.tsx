/**
 * ชื่อเล่นในวงเล็บต่อท้ายชื่อ — “สมชาย ใจดี (ต้น)” (Bew 9 พ.ย. 2569) · ใช้ทุกหน้าที่โชว์ชื่อ พจส./ผู้สมัคร
 * ให้หน้าตาเดียวกัน · ไม่มีชื่อเล่น = ไม่วาดอะไร (ไม่ขึ้นวงเล็บเปล่า)
 */
export function Nickname({ value, className = "" }: { value?: string; className?: string }) {
  if (!value) return null;
  return <span className={`font-normal text-mut ${className}`}>({value})</span>;
}
