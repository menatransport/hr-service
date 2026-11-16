"use client";

import { useSyncExternalStore } from "react";

/** ตรงกับ breakpoint `lg` ของ Tailwind (64rem) — ต้องเท่ากับคลาส `lg:` ที่ซ่อน/แสดงสองชุด */
const QUERY = "(min-width: 64rem)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * จอ ≥lg ไหม — ใช้เลือกว่าจะวาดตารางเต็มหรือรายการมือถือ **ชุดเดียว**
 *
 * `serverGuess` มาจาก `guessDesktop()` ในหน้า (server) · ตอน SSR และตอน hydrate ใช้ค่านี้
 * HTML จึงตรงกันไม่ขึ้น hydration error แล้วค่อยสลับตาม `matchMedia` จริง (หมุนจอ / ย่อหน้าต่าง)
 * · คงคลาส `hidden lg:block` / `lg:hidden` ไว้ด้วย เดาผิดเมื่อไหร่จะเห็นว่างแวบเดียว ไม่เห็นผิดรูป
 */
export function useIsDesktop(serverGuess: boolean): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => serverGuess,
  );
}
