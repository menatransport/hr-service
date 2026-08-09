/**
 * รูปบนบัตรพนักงานตอนที่ยังไม่มีเจ้าของ
 *
 * วาดเป็น SVG inline ไม่ใช่ไฟล์รูป — ทุกสีมาจาก `currentColor` จึงรับโทนจาก
 * `text-*` ของพ่อ และพลิกตามธีมมืดได้เองโดยไม่ต้องมีไฟล์ชุดที่สอง (ไฟล์ .png/.svg
 * จะฝังสีตายตัว แล้วเงาบนพื้นมืดจะกลายเป็นคราบเทา)
 *
 * เป็นภาพประกอบล้วน — `aria-hidden` เพราะข้อความข้าง ๆ บอกอยู่แล้วว่าต้องเข้าสู่
 * ระบบก่อนถึงจะมีข้อมูลพนักงาน
 */
export function AvatarPlaceholder({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 68 68" className={className} aria-hidden focusable="false">
      <defs>
        <clipPath id="hrs-avatar-clip">
          <circle cx="34" cy="34" r="34" />
        </clipPath>
        <linearGradient id="hrs-avatar-bg" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.18" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.06" />
        </linearGradient>
        <linearGradient id="hrs-avatar-figure" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.62" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.4" />
        </linearGradient>
      </defs>

      <g clipPath="url(#hrs-avatar-clip)">
        <circle cx="34" cy="34" r="34" fill="url(#hrs-avatar-bg)" />
        {/* แถบแสงเฉียงมุมบนขวา ให้พื้นวงกลมไม่แบนสนิท */}
        <path d="M-6 40 76 4V-8H-6Z" fill="currentColor" opacity="0.05" />
        <circle cx="34" cy="27" r="11.6" fill="url(#hrs-avatar-figure)" />
        <path
          d="M34 41.4c11.9 0 21.6 8.9 21.6 19.8V72H12.4V61.2C12.4 50.3 22.1 41.4 34 41.4Z"
          fill="url(#hrs-avatar-figure)"
        />
      </g>
    </svg>
  );
}
