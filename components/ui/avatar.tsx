/**
 * วงกลมตัวอักษรย่อ — ใช้แทนรูปโปรไฟล์ที่ระบบยังไม่มี
 *
 * สีมาจาก token `ph-avatar` / `ph-thumb` ของ design (ช่องว่างรูปโปรไฟล์)
 * ไล่เฉียงบาง ๆ ให้ไม่แบน แต่ **ไม่สุ่มสีตามชื่อ** เพราะสีในระบบนี้มีความหมาย
 * เฉพาะ (สถานะ / ความสำคัญ) — ถ้าคนหนึ่งเป็นสีส้ม ผู้ใช้จะอ่านว่าเป็นสัญญาณ
 *
 * อยู่ในแถวที่มีคลาส `group` (แถวตาราง / การ์ด) จะขยับขึ้นนิดและขอบเรืองเป็น
 * primary ตอน hover — บอกว่าทั้งแถวกดได้ โดยไม่ต้องเพิ่ม affordance ใหม่
 */

const sizes = {
  sm: "size-8 text-[11.5px]",
  /** แถบบนของเดสก์ — เท่าปุ่มไอคอนข้าง ๆ พอดี ไม่ให้แถวขวาสูงต่ำไม่เท่ากัน */
  nav: "size-9 text-[12px]",
  md: "size-10 text-[13px]",
  lg: "size-12 text-[15px]",
  /** หัวหน้าโปรไฟล์มือถือ */
  hero: "size-14 text-[16px]",
  /** ขนาดรูปบนบัตรประจำตัวเต็มใบ — ตรงกับวงรูปบนบัตรหน้า login */
  xl: "size-18.5 text-[19px]",
};

/** ตัวอักษรที่ใช้เป็นตัวย่อได้จริง — ไม่เอาเว้นวรรค วงเล็บ จุด */
const READABLE = /[\p{L}\p{N}]/u;

/**
 * สระ วรรณยุกต์ และเครื่องหมายไทยทั้งช่วง U+0E2F–U+0E4F
 * เหลือไว้แต่พยัญชนะ ก–ฮ (U+0E01–U+0E2E) กับเลขไทย (U+0E50–U+0E59)
 *
 * สระลอยเดี่ยวอ่านไม่ออก — “เอกชัย” ต้องย่อเป็น “อ” ไม่ใช่ “เ”
 */
const THAI_MARK = /[ฯ-๏]/u;

/** พยัญชนะตัวแรกของคำ — ข้ามสระหน้าและเครื่องหมายไปให้หมด */
const head = (word: string): string =>
  Array.from(word)
    .find((c) => READABLE.test(c) && !THAI_MARK.test(c))
    ?.toUpperCase() ?? "";

/**
 * ตัวย่อ **สองตัวพอดี** จากสองคำแรก — พยัญชนะล้วน ไม่มีสระ
 *
 * "สมควร สุดสาคร" → "สส" · "เอกชัย ใจดี" → "อจ" · "แสงเดือน โพธิ์ทอง" → "สพ"
 */
export function initialsOf(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(head).join("") || "?";
}

export function Avatar({
  name,
  size = "sm",
  src,
  className = "",
}: {
  name: string;
  size?: keyof typeof sizes;
  /** รูปจริงของคนนี้ — ไม่ส่งมาหรือเป็น `null` จะตกไปใช้ตัวย่อชื่อแทน */
  src?: string | null;
  className?: string;
}) {
  return (
    <span
      // ชื่อเต็มอยู่ข้าง ๆ เสมอ — รูป/ตัวย่อจึงเป็นแค่ภาพ ไม่ต้องให้ screen reader อ่านซ้ำ
      aria-hidden
      className={`inline-flex flex-none items-center justify-center overflow-hidden rounded-full bg-linear-to-br from-ph-thumb to-ph-avatar font-semibold text-ink/75 ring-1 ring-line transition duration-200 ring-inset select-none group-hover:-translate-y-px group-hover:text-ink group-hover:ring-primary/35 ${sizes[size]} ${className}`}
    >
      {src ? (
        /* `<img>` ธรรมดา ไม่ใช่ `next/image` — โฮสต์ของรูปยังไม่รู้ จึงประกาศ
           `remotePatterns` ล่วงหน้าไม่ได้ และรูปโปรไฟล์เล็กเกินกว่าจะคุ้มการ optimize */
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}
