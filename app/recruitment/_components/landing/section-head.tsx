/**
 * หัวข้อของแต่ละส่วนบนหน้า landing — ป้ายกำกับ · หัวเรื่อง · คำอธิบายหนึ่งย่อหน้า
 *
 * มีอยู่เพื่อ **บังคับให้ทุกส่วนขึ้นต้นเหมือนกัน** ไม่ใช่เพื่อประหยัดการพิมพ์
 * หน้ายาวที่แต่ละส่วนจัดหัวเรื่องกันเอง จะมีขนาดตัวอักษรกับระยะห่างเพี้ยนกัน
 * ทีละนิดจนอ่านแล้วรู้สึกว่า “เว็บทำไม่เสร็จ” ทั้งที่ชี้ไม่ถูกว่าตรงไหนผิด
 *
 * ป้ายกำกับใช้ `font-mono` ตัวพิมพ์ใหญ่ตามที่ระบบออกแบบไว้สำหรับป้ายสั้น ๆ
 * (ชุดเดียวกับ `HR SERVICE` / `EMPLOYEE ID` — ดูเหตุผลใน `app/layout.tsx`)
 */
export function SectionHead({
  label,
  title,
  lead,
  tone = "light",
  align = "left",
}: {
  label: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  /** `dark` = วางบนพื้นเข้ม (แถบสถิติ · แถบปิดท้าย) */
  tone?: "light" | "dark";
  align?: "left" | "center";
}) {
  const dark = tone === "dark";

  return (
    <div
      className={`flex flex-col gap-3 ${
        align === "center" ? "items-center text-center" : "items-start"
      }`}
    >
      <span
        className={`font-mono text-11 font-medium tracking-[0.18em] uppercase ${
          dark ? "text-white/60" : "text-primary"
        }`}
      >
        {label}
      </span>

      <h2
        className={`max-w-[22ch] text-26 leading-[1.22] font-semibold text-balance sm:text-34 ${
          dark ? "text-white" : "text-ink"
        }`}
      >
        {title}
      </h2>

      {lead ? (
        <p
          className={`max-w-[56ch] text-14-5 leading-[1.75] text-pretty ${
            dark ? "text-white/70" : "text-mut"
          }`}
        >
          {lead}
        </p>
      ) : null}
    </div>
  );
}

/**
 * กรอบความกว้างมาตรฐานของทุกส่วน — `max-w-6xl` เท่ากันหมด
 *
 * ส่วนที่ต้องการพื้นหลังเต็มความกว้างจอ (ฮีโร่ · แถบสถิติ) ให้พื้นหลังอยู่ที่
 * `<section>` ชั้นนอก แล้วห่อเนื้อหาด้วยตัวนี้ข้างใน — พื้นหลังจะเต็มจอ
 * แต่ตัวหนังสือยังเรียงตรงกับส่วนอื่นทุกส่วน
 */
export function Container({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-6xl px-5 sm:px-8 ${className}`}>
      {children}
    </div>
  );
}
