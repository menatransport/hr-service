import { Mascot } from "@/components/ui/mascot";

/**
 * ขึ้นแทนเนื้อหาเมื่อดึงข้อมูลจาก NCAC API ไม่สำเร็จ
 *
 * ระบบเคสไม่มีข้อมูลตัวอย่างสำรองแล้ว — ถ้า API ล่มหรือยังไม่ได้ตั้ง `API_NCAC_URL`
 * ต้องบอกให้ชัดว่าเกิดอะไรขึ้น ดีกว่าปล่อยหน้าว่างให้เข้าใจผิดว่า “ไม่มีเคส”
 */
export function DataError({
  title = "โหลดข้อมูลเคสไม่สำเร็จ",
  message,
  /** ค่าที่ต้องไปตรวจ — บันทึกเคสอ่านจาก MongoDB จึงไม่ได้ชี้ไป `API_NCAC_URL` เสมอไป */
  envKey = "API_NCAC_URL",
}: {
  title?: string;
  message: string;
  envKey?: string;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-2.5 rounded-box border border-sla/30 bg-[color-mix(in_oklab,var(--color-sla)_6%,var(--color-base-100))] px-5 py-10 text-center"
    >
      <Mascot size={76} mood="oops" motion="none" className="mb-1" />
      <p className="text-15 font-semibold text-sla">{title}</p>
      <p className="max-w-[46ch] text-12-5 text-mut text-pretty">{message}</p>
      <p className="text-11-5 text-mut">
        ตรวจค่า <code className="font-mono">{envKey}</code> แล้วลองโหลดหน้านี้ใหม่
      </p>
    </div>
  );
}
