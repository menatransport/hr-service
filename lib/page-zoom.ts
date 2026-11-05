/**
 * ค่า `zoom` ของหน้า (`--page-zoom` ใน globals.css: เดสก์ท็อป 0.8 · มือถือ 1)
 *
 * `getBoundingClientRect()` `clientX/Y` และ `innerWidth/Height` คืนค่าเป็นพิกเซลบนจอ (หลังย่อ)
 * แต่ `left/top` `scrollLeft` และ `transform` ที่ตั้งให้ element ใต้ `body` ถูกย่ออีกรอบ
 * — หารค่าที่วัดได้ด้วยตัวนี้ก่อนใส่กลับเป็นสไตล์ ไม่งั้นป๊อปโอเวอร์จะวางเยื้องเข้าหามุมซ้ายบน
 * (กล่องลอยของ Radix ไม่ต้อง — กล่องนอกของมันไม่ถูกย่อ)
 */
export function pageZoom(): number {
  if (typeof window === "undefined") return 1;
  const z = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--page-zoom"));
  return z > 0 ? z : 1;
}
