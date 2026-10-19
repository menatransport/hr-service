import { useEffect, useRef } from "react"

/**
 * เปิดหน้าต่างพิมพ์อัตโนมัติเมื่อเอกสารโหลดเสร็จ ถ้ามี ?print=1 ใน URL
 * ใช้กับ shortcut โหลด PDF จากหน้าสัญญา (กด 1–5 → เปิดหน้าพิมพ์แล้วเด้ง print ให้เลย)
 * ต้องเรียกก่อน early-return ของ component เสมอ (Rules of Hooks)
 */
export function useAutoPrint(ready: boolean) {
  const done = useRef(false)
  useEffect(() => {
    if (!ready || done.current) return
    if (typeof window === "undefined") return
    if (new URLSearchParams(window.location.search).get("print") !== "1") return
    done.current = true
    // หน่วงเล็กน้อยให้ฟอนต์/เลย์เอาต์ A4 นิ่งก่อนเปิด print
    const t = setTimeout(() => window.print(), 400)
    return () => clearTimeout(t)
  }, [ready])
}
