/**
 * “น้องมีนา” ฉบับ HR — มาสคอตของระบบฝั่งพนักงาน (`/desk` · `/payroll` · กล่องแจ้งเตือน)
 *
 * ทรงเดียวกับน้องมีนาของ menaIT V.2 แต่ตัวเป็นโทน teal ของระบบ HR ไฟเสาอากาศสีทอง
 * และห้อยบัตรพนักงานแทนเครื่องหมายถูก · คนละตัวกับ “น้องมิกซ์” (รถมิกเซอร์) ของหน้ารับสมัคร
 * ซึ่งเป็นหน้าของคนนอก — อย่าเอามาปนกัน
 *
 * สร้างเป็น **สตริง SVG ที่เดียว** เพราะมีผู้ใช้สองทาง: `<Mascot>` (React) กับ
 * `alertSuccess` ของ SweetAlert2 ที่รับได้แค่ HTML · ถ้าวาดสองชุดจะเพี้ยนจากกันทันทีที่มีคนแก้ฝั่งเดียว
 *
 * สีตัวมาสคอต **ตายตัวทั้งสองธีมโดยตั้งใจ** — เป็นตัวละคร ไม่ใช่พื้นผิวของ UI
 * แอนิเมชัน (กะพริบตา · โบกมือ · ไฟกะพริบ) อยู่ในคลาส `mascot-*` ท้าย `app/globals.css`
 */

export type MascotMood = "idle" | "happy" | "oops";

export function mascotSvg({
  uid,
  size,
  mood = "idle",
  label = "น้องมีนา",
}: {
  /** ไอดีกันชนของ gradient — SVG หลายตัวบนหน้าเดียวกันห้ามใช้ id ซ้ำ */
  uid: string;
  size: number;
  mood?: MascotMood;
  label?: string;
}): string {
  const b = `mb-${uid}`;
  const a = `ma-${uid}`;
  const g = `mg-${uid}`;

  const eyes =
    mood === "happy"
      ? `<path d="M41 58 Q47 51 53 58" stroke="#0b3a36" stroke-width="3.5" stroke-linecap="round" fill="none"/>
         <path d="M67 58 Q73 51 79 58" stroke="#0b3a36" stroke-width="3.5" stroke-linecap="round" fill="none"/>`
      : `<ellipse class="mascot-eye" cx="47" cy="57" rx="6" ry="7" fill="#0b3a36"/>
         <ellipse class="mascot-eye" cx="73" cy="57" rx="6" ry="7" fill="#0b3a36"/>
         <circle cx="49" cy="54" r="2" fill="#fff"/>
         <circle cx="75" cy="54" r="2" fill="#fff"/>`;

  const mouth =
    mood === "happy"
      ? `<path d="M52 65 Q60 76 68 65 Z" fill="#0b3a36"/>`
      : mood === "oops"
        ? `<ellipse cx="60" cy="70" rx="4" ry="3" fill="#0b3a36"/>`
        : `<path d="M53 67 Q60 74 67 67" stroke="#0b3a36" stroke-width="3" stroke-linecap="round" fill="none"/>`;

  // ดีใจ = ยกแขนซ้ายขึ้นด้วย · ปกติ = แขนซ้ายห้อย แขนขวาโบก
  const leftArm =
    mood === "happy"
      ? `<rect x="9" y="40" width="14" height="28" rx="7" fill="url(#${a})" transform="rotate(20 16 66)"/>`
      : `<rect x="9" y="58" width="14" height="26" rx="7" fill="url(#${a})"/>`;

  return `<svg width="${size}" height="${size}" viewBox="0 0 120 120" role="img" aria-label="${label}" focusable="false">
<defs>
<linearGradient id="${b}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7ae8d3"/><stop offset="1" stop-color="#0f8274"/></linearGradient>
<linearGradient id="${a}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2dd4bf"/><stop offset="1" stop-color="#0c625c"/></linearGradient>
<radialGradient id="${g}" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fff4c7"/><stop offset="1" stop-color="#f8b545"/></radialGradient>
</defs>
<ellipse cx="60" cy="112" rx="30" ry="4" fill="#0b3a36" opacity=".15"/>
<line x1="60" y1="24" x2="60" y2="11" stroke="#0c625c" stroke-width="3.5" stroke-linecap="round"/>
<circle class="mascot-glow" cx="60" cy="9" r="6" fill="url(#${g})"/>
${leftArm}
<rect class="mascot-arm" x="98" y="40" width="13" height="28" rx="6.5" fill="url(#${a})"/>
<rect x="18" y="22" width="84" height="80" rx="36" fill="url(#${b})"/>
<path d="M30 40 Q40 27 58 27" stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none" opacity=".5"/>
<rect x="28" y="38" width="64" height="42" rx="21" fill="#fff"/>
${eyes}
<ellipse cx="37" cy="68" rx="5" ry="3" fill="#ff9fb8" opacity=".8"/>
<ellipse cx="83" cy="68" rx="5" ry="3" fill="#ff9fb8" opacity=".8"/>
${mouth}
<path d="M45 80 L60 86 L75 80" stroke="#f8b545" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
<rect x="50" y="84" width="20" height="14" rx="3" fill="#fff" stroke="#f8b545" stroke-width="1.6"/>
<circle cx="55.5" cy="90.5" r="2.4" fill="#129a85"/>
<rect x="59.5" y="88.6" width="7" height="1.7" rx=".85" fill="#0b3a36" opacity=".55"/>
<rect x="59.5" y="91.8" width="5" height="1.7" rx=".85" fill="#0b3a36" opacity=".35"/>
<ellipse cx="44" cy="103" rx="9" ry="5" fill="#0c625c"/>
<ellipse cx="76" cy="103" rx="9" ry="5" fill="#0c625c"/>
</svg>`;
}
