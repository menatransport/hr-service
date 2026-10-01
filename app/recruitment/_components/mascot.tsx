import type { Stage } from "@/app/recruitment/_lib/form";

/**
 * “น้องมิกซ์” — มาสคอตรถมิกเซอร์ของหน้ารับสมัคร
 *
 * วาดเป็น SVG ในโค้ด **ไม่ใช่ไฟล์ภาพ** ด้วยเหตุผลสามข้อ:
 * 1. เปลี่ยนสีตามธีมได้เอง (สว่าง/มืด) เพราะทุกชิ้นใช้คลาสสีของธีม ไม่ใช่สีตายตัว
 * 2. ไม่มีคำขอเครือข่ายเพิ่ม — หน้าแรกของคนขับส่วนใหญ่เปิดบน 4G ที่ไม่นิ่ง
 * 3. คมทุกความละเอียด และย่อขยายได้ตามที่หน้าต้องการโดยไม่ต้องทำหลายขนาด
 *
 * ล้อหมุนกับตัวรถลอยเป็นแอนิเมชันวนไม่จบ — `globals.css` ปิดแอนิเมชันทั้งระบบให้
 * ผู้ใช้ที่ตั้ง `prefers-reduced-motion` ไว้แล้ว จึงไม่ต้องกันซ้ำที่นี่
 *
 * `aria-hidden` เพราะเป็นภาพประกอบล้วน ไม่ได้ถือข้อมูลที่หายไปแล้วอ่านหน้าไม่รู้เรื่อง
 */
export function Mascot({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 260 190"
      role="presentation"
      aria-hidden
      className={`h-auto w-full ${className}`}
    >
      {/* เงาใต้รถ — อยู่นอกกลุ่มที่ลอย เงาจึงอยู่กับที่เหมือนเงาจริง */}
      <ellipse cx="130" cy="171" rx="86" ry="9" className="fill-ink/8" />

      <g className="animate-float">
        {/* ───────────────────────────────────────────────── โครงล่าง */}
        <rect x="34" y="128" width="186" height="14" rx="5" className="fill-ink/80" />

        {/* ───────────────────────────────────────────────── โม่ปูน */}
        <g>
          {/* ตัวโม่ — สี่เหลี่ยมมนเอียงเล็กน้อยให้ดูเหมือนถังทรงกรวย */}
          <path
            d="M112 62 C112 53 119 47 128 47 L196 55 C206 56 212 64 212 74 L212 106
               C212 116 206 124 196 125 L128 133 C119 134 112 127 112 118 Z"
            className="fill-primary"
          />
          {/* แถบเกลียวบนโม่ — เส้นโค้งสองเส้นที่ทำให้อ่านออกว่าเป็นรถมิกเซอร์ */}
          <path
            d="M138 52 C146 72 146 108 138 128"
            fill="none"
            strokeWidth="7"
            strokeLinecap="round"
            className="stroke-primary-content/35"
          />
          <path
            d="M172 55 C180 74 180 106 172 125"
            fill="none"
            strokeWidth="7"
            strokeLinecap="round"
            className="stroke-primary-content/35"
          />
          {/* รางเทปูนด้านท้าย */}
          <path
            d="M212 92 L238 104 L238 118 L212 108 Z"
            className="fill-ink/70"
          />
        </g>

        {/* ───────────────────────────────────────────────── หัวเก๋ง */}
        <g>
          <path
            d="M30 78 C30 70 36 64 44 64 L92 64 C100 64 106 70 106 78 L106 128
               C106 133 102 137 97 137 L39 137 C34 137 30 133 30 128 Z"
            className="fill-primary"
          />
          {/* กระจกหน้า = หน้าของน้องมิกซ์ */}
          <rect x="38" y="73" width="60" height="42" rx="11" className="fill-base-100" />

          {/* ตา — วงกลมทึบสองวง กับไฮไลต์เล็ก ๆ ให้ดูมีชีวิต */}
          <circle cx="56" cy="92" r="6" className="fill-ink" />
          <circle cx="82" cy="92" r="6" className="fill-ink" />
          <circle cx="58" cy="90" r="2" className="fill-base-100" />
          <circle cx="84" cy="90" r="2" className="fill-base-100" />

          {/* ยิ้ม */}
          <path
            d="M58 102 C64 108 74 108 80 102"
            fill="none"
            strokeWidth="3.5"
            strokeLinecap="round"
            className="stroke-ink"
          />

          {/* แก้มแดงจาง ๆ */}
          <ellipse cx="46" cy="101" rx="4.5" ry="3" className="fill-sla/30" />
          <ellipse cx="92" cy="101" rx="4.5" ry="3" className="fill-sla/30" />

          {/* ไฟหน้า */}
          <rect x="30" y="118" width="9" height="8" rx="3" className="fill-primary-content/70" />
        </g>

        {/* ───────────────────────────────────────────────── ล้อ */}
        {[
          { cx: 68, cy: 145 },
          { cx: 166, cy: 145 },
          { cx: 204, cy: 145 },
        ].map((wheel) => (
          <g key={wheel.cx}>
            <circle cx={wheel.cx} cy={wheel.cy} r="21" className="fill-ink" />
            <circle cx={wheel.cx} cy={wheel.cy} r="8.5" className="fill-base-100" />
          </g>
        ))}
      </g>
    </svg>
  );
}

/**
 * มาสคอตประจำขั้นของฟอร์มสมัคร — หน้ายิ้มของ “น้องมิกซ์” คู่กับของประกอบที่
 * เปลี่ยนไปตามว่าขั้นนั้นขอให้ทำอะไร
 *
 * **ใช้หน้าเดียวกับมาสคอตตัวเต็มบนหน้าแรก** (`mascot.tsx`) — กรอบมน ตากลม
 * แก้มแดง ยิ้มเส้นเดียว · ถ้าวาดหน้าใหม่ให้แต่ละขั้น มันจะกลายเป็นตัวละครคนละตัว
 * ห้าตัวแทนที่จะเป็นตัวเดิมที่เดินทางไปกับผู้สมัครทั้งฟอร์ม
 *
 * **ของประกอบถูกวาดก่อนหน้า แล้วให้หน้าทับ** เพื่อให้สองชิ้นซ้อนกันเป็นก้อนเดียว
 * — ตอนแรกวางแยกห่างกัน ผลคืออ่านเป็นไอคอนสองอันคนละเรื่องวางเรียงกัน
 * ไม่ใช่มาสคอตถือของ (เห็นชัดตอนทดสอบบนจอ 390px จริง)
 *
 * **เล็กและอยู่นิ่ง ไม่ลอยวน** — หน้าที่ของหน้าจอนี้คือให้คนกรอกฟอร์มจนจบ
 * ภาพที่ขยับอยู่ตลอดข้างหัวเรื่องจะแย่งสายตาไปจากช่องกรอกทุกครั้งที่เหลือบมอง
 * จึงเล่นแค่จังหวะเดียวตอนเข้าขั้นใหม่ (`animate-pop-in` — ตัวแม่ใส่ `key={stage}`
 * ไว้แล้วจึง mount ใหม่ทุกครั้งที่เปลี่ยนขั้น) แล้วหยุดสนิท
 *
 * `aria-hidden` เพราะเป็นภาพประกอบล้วน หัวเรื่องข้าง ๆ บอกครบอยู่แล้วว่าขั้นนี้คืออะไร
 */

/** ของประกอบของแต่ละขั้น — ชื่อขั้นมาจาก `APPLY_STAGES` ใน `lib/recruitment/form.ts` */
type Prop = "card" | "wheel" | "road" | "camera" | "check";

function propOf(stage: Stage): Prop {
  if (stage.kind === "documents") return "camera";
  if (stage.kind === "review") return "check";
  if (stage.section === "license") return "wheel";
  if (stage.section === "ready") return "road";
  return "card";
}

export function StageMascot({ stage }: { stage: Stage }) {
  const prop = propOf(stage);

  return (
    <svg
      viewBox="0 0 78 58"
      role="presentation"
      aria-hidden
      className="h-auto w-16 flex-none animate-pop-in"
    >
      {/* ─────────────────── ของประกอบ — วาดก่อน เอียงเล็กน้อย ให้หน้าทับทีหลัง */}
      <g transform="translate(40 6) rotate(7)">
        {prop === "card" ? (
          <>
            <rect
              x="0"
              y="0"
              width="32"
              height="25"
              rx="6"
              className="fill-base-100 stroke-primary"
              strokeWidth="2.4"
            />
            <circle cx="9.5" cy="9.5" r="3.8" className="fill-primary/75" />
            <rect x="16" y="6.5" width="11" height="2.4" rx="1.2" className="fill-primary/45" />
            <rect x="16" y="11.5" width="8" height="2.4" rx="1.2" className="fill-primary/45" />
            <rect x="5.5" y="17.5" width="21" height="2.4" rx="1.2" className="fill-primary/30" />
          </>
        ) : null}

        {prop === "wheel" ? (
          <>
            <circle
              cx="15"
              cy="13"
              r="12.5"
              className="fill-base-100 stroke-primary"
              strokeWidth="2.4"
            />
            <circle cx="15" cy="13" r="4" className="fill-primary/75" />
            <path
              d="M15 1.5 L15 9 M4.8 19 L11.5 15.2 M25.2 19 L18.5 15.2"
              strokeWidth="2.4"
              strokeLinecap="round"
              className="stroke-primary/70"
            />
          </>
        ) : null}

        {prop === "road" ? (
          <>
            {/* ถนนทอดออกไปข้างหน้า — ขั้นนี้ถามว่าเริ่มงานได้เมื่อไหร่ สาขาไหน */}
            <path
              d="M4 25 L10.5 1.5 L20.5 1.5 L27 25 Z"
              className="fill-base-100 stroke-primary"
              strokeWidth="2.4"
              strokeLinejoin="round"
            />
            <path
              d="M15.5 5.5 L15.5 9.5 M15.5 13 L15.5 17 M15.5 20 L15.5 22.5"
              strokeWidth="2.4"
              strokeLinecap="round"
              className="stroke-primary/60"
            />
          </>
        ) : null}

        {prop === "camera" ? (
          <>
            <rect x="9" y="0" width="12" height="5" rx="2" className="fill-primary/75" />
            <rect
              x="0"
              y="4"
              width="31"
              height="21"
              rx="6"
              className="fill-base-100 stroke-primary"
              strokeWidth="2.4"
            />
            <circle
              cx="15.5"
              cy="14.5"
              r="6"
              className="fill-soft stroke-primary"
              strokeWidth="2.2"
            />
            <circle cx="15.5" cy="14.5" r="2.3" className="fill-primary/75" />
          </>
        ) : null}

        {prop === "check" ? (
          <>
            <rect
              x="0"
              y="0"
              width="30"
              height="26"
              rx="6"
              className="fill-base-100 stroke-primary"
              strokeWidth="2.4"
            />
            <path
              d="M6 8 L9 11 L14 5.5"
              fill="none"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="stroke-primary"
            />
            <path
              d="M6 18.5 L9 21.5 L14 16"
              fill="none"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="stroke-primary"
            />
            <rect x="18" y="7" width="8" height="2.4" rx="1.2" className="fill-primary/40" />
            <rect x="18" y="17.5" width="8" height="2.4" rx="1.2" className="fill-primary/40" />
          </>
        ) : null}
      </g>

      {/* ────────────────────────── หน้าของน้องมิกซ์ — วาดทีหลังจึงทับของประกอบ */}
      <g>
        <rect x="1" y="5" width="47" height="47" rx="14" className="fill-primary" />
        <rect x="8" y="13" width="33" height="25" rx="9" className="fill-base-100" />

        <circle cx="18.5" cy="25.5" r="3.4" className="fill-ink" />
        <circle cx="31.5" cy="25.5" r="3.4" className="fill-ink" />
        <circle cx="19.6" cy="24.4" r="1.1" className="fill-base-100" />
        <circle cx="32.6" cy="24.4" r="1.1" className="fill-base-100" />

        <path
          d="M19.5 32 C23 36 27 36 30.5 32"
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          className="stroke-ink"
        />

        <ellipse cx="11.5" cy="32" rx="3" ry="2" className="fill-sla/30" />
        <ellipse cx="38" cy="32" rx="3" ry="2" className="fill-sla/30" />
      </g>
    </svg>
  );
}
