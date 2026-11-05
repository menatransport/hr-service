/**
 * ชดเชยค่าที่ไม่ควรถูกย่อตาม `zoom` ของหน้า (globals.css: เดสก์ท็อปย่อเหลือ `--page-zoom` = 0.8)
 *
 * 1. หน่วยจอ (`vh` `dvh` `svh` `lvh` `vw` …) — CSS zoom ย่อหน่วยจอด้วย `h-dvh` จะเหลือ 80% ของจอ
 * 2. ขนาดที่ Radix วัดจากจอ (`--radix-*-width/height` เช่นความกว้างของ trigger, ที่ว่างเหลือในจอ)
 *    — วัดเป็นพิกเซลบนจอ แต่ถูกใช้ในกล่องที่ย่อแล้ว dropdown จะแคบกว่า trigger 20%
 *
 * ทั้งสองแบบถูกหารกลับด้วย `--page-zoom` ตอน build จึงไม่ต้องไล่แก้ทีละคลาส
 * (ไม่มีการย่อ → ตัวแปรเป็น 1 ค่าเท่าเดิม)
 *
 * วางหลัง `@tailwindcss/postcss` — แก้ทั้งคลาส Tailwind (`h-dvh`, `max-h-[92dvh]`, `clamp(…6vh…)`)
 * และ CSS ที่เขียนเอง · ไม่แตะเงื่อนไข `@media` (เป็น params ไม่ใช่ declaration)
 */
const UNIT = /(-?\d*\.?\d+)((?:d|s|l)?v(?:h|w|min|max|i|b))\b/g;
const RADIX_SIZE = /var\(--radix-[a-z-]+-(?:width|height)\)/g;

module.exports = () => ({
  postcssPlugin: "zoom-viewport",
  Declaration(decl) {
    const { value } = decl;
    if (value.includes("--page-zoom")) return;
    const next = value
      .replace(UNIT, "calc($1$2 / var(--page-zoom, 1))")
      .replace(RADIX_SIZE, "calc($& / var(--page-zoom, 1))");
    if (next !== value) decl.value = next;
  },
});
module.exports.postcss = true;
