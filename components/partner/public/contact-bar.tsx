/**
 * ปุ่มติดต่อฝ่ายขายที่ติดหน้าจอตลอด — มือถือเป็นแถบล่างจอ, จอใหญ่เป็นปุ่มลอยมุมขวาล่าง
 * ยังไม่ได้ตั้งเบอร์/LINE ใน /catalog → ปุ่มพาไปช่องฝากเบอร์ (#ติดต่อ) แทน จะได้ไม่มีปุ่มกดแล้วไม่เกิดอะไร
 */
import { telHref } from "./thai-text"

export function ContactBar({ phone, line }: { phone?: string; line?: string }) {
  const lineHref = line ? `https://line.me/R/ti/p/${encodeURIComponent(line)}` : ""
  const solid = "rounded-full bg-[var(--mena-green)] text-white font-medium px-5 py-3 text-center hover:bg-[var(--mena-green-soft)] transition-colors"
  const ghost = "rounded-full border border-[var(--mena-green)] text-[var(--mena-green)] font-medium px-5 py-3 text-center bg-white hover:bg-[var(--mena-paper)] transition-colors"

  const buttons = phone || line ? (
    <>
      {phone && <a href={telHref(phone)} className={`${solid} flex-1 sm:flex-none`}>โทรหาฝ่ายขาย</a>}
      {line && <a href={lineHref} className={`${ghost} flex-1 sm:flex-none`}>ทักทาง LINE</a>}
    </>
  ) : (
    <a href="#ติดต่อ" className={`${solid} flex-1 sm:flex-none`}>ให้ฝ่ายขายติดต่อกลับ</a>
  )

  return (
    <>
      {/* มือถือ: แถบล่างจอ */}
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-[var(--mena-line)] bg-white/95 backdrop-blur px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex gap-2">{buttons}</div>
      </div>
      {/* จอใหญ่: ปุ่มลอยมุมขวาล่าง */}
      <div className="hidden lg:flex fixed right-6 bottom-6 z-40 gap-2 shadow-[0_18px_40px_-20px_rgba(2,58,30,0.6)] rounded-full">
        {buttons}
      </div>
    </>
  )
}
