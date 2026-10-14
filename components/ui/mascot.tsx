import { useId } from "react";

import { mascotSvg, type MascotMood } from "@/lib/mascot";

/**
 * น้องมีนา (HR) — ตัวละครของระบบ · ใช้ **เฉพาะจุดที่ผู้ใช้หยุดรอหรือเจอทางตัน**
 * (หน้าโหลด · ไม่มีข้อมูล · ทักทายหลังล็อกอิน · บันทึกสำเร็จแบบกล่องกลางจอ)
 * ห้ามใส่ในทุกการ์ด/ทุก toast — ตัวละครที่โผล่ทุกที่จะกลายเป็นเสียงรบกวน
 *
 * `motion`: `bob` ลอยช้า ๆ (ค่าเริ่มต้น) · `hop` กระโดด (ใช้ตอนโหลด) · `none` นิ่ง
 *
 * SVG มาจาก `mascotSvg()` ที่เดียว (ใช้ร่วมกับ SweetAlert2) — เนื้อในเป็นสตริงคงที่
 * ที่เราสร้างเอง ไม่มีข้อมูลผู้ใช้ปน จึงใส่ผ่าน `dangerouslySetInnerHTML` ได้ปลอดภัย
 */
export function Mascot({
  size = 96,
  motion = "bob",
  mood = "idle",
  bubble,
  label,
  className = "",
}: {
  size?: number;
  motion?: "bob" | "hop" | "none";
  mood?: MascotMood;
  /** คำพูดสั้น ๆ ในลูกโป่งด้านขวา */
  bubble?: React.ReactNode;
  /** ชื่อสำหรับ screen reader · ไม่ใส่ = ภาพตกแต่ง (`aria-hidden`) */
  label?: string;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const motionClass =
    motion === "bob" ? "mascot-bob" : motion === "hop" ? "mascot-hop" : "";

  return (
    <span className={`inline-flex flex-none items-start gap-1 ${className}`}>
      <span
        aria-hidden={label ? undefined : true}
        className={`mascot block drop-shadow-[0_10px_12px_rgba(11,58,54,0.22)] ${motionClass}`}
        style={{ width: size, height: size }}
        dangerouslySetInnerHTML={{ __html: mascotSvg({ uid, size, mood, label }) }}
      />
      {bubble ? (
        <span className="mascot-bubble mt-1 max-w-52 rounded-[16px_16px_16px_4px] border border-line bg-base-100 px-3 py-2 text-12-5 leading-snug font-medium text-ink elev-pop">
          {bubble}
        </span>
      ) : null}
    </span>
  );
}

/**
 * ตัวโหลดทั้งหน้า — น้องมีนากระโดดในวงแหวนหมุน + ข้อความ + จุดเต้น
 * ใช้กับ `loading.tsx` ของเชลล์ · ตารางที่โหลดบางส่วนให้ใช้ skeleton แทน
 */
export function MascotLoader({
  text = "กำลังโหลด",
  size = 72,
  className = "",
}: {
  text?: string;
  size?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center gap-6 text-primary ${className}`}
    >
      <span className="relative grid place-items-center" style={{ width: size + 16, height: size + 16 }}>
        <span aria-hidden className="mascot-ring motion-keep" />
        <Mascot size={size} motion="hop" />
      </span>
      <span className="flex items-center text-14 font-medium">
        {text}
        <span aria-hidden className="mascot-dots ml-1.5">
          <i />
          <i />
          <i />
        </span>
      </span>
    </div>
  );
}
