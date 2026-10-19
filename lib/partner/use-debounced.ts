import { useEffect, useRef, useState } from "react"

/**
 * คืนค่าที่ debounce แล้ว — reference คงเดิมจนกว่าจะหยุดเปลี่ยนครบ delay ms
 * ใช้กับ live preview เอกสารสัญญา: พิมพ์รัว ๆ ไม่ re-render เอกสารทุกตัวอักษร
 */
export function useDebounced<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value)
  const first = useRef(true)

  useEffect(() => {
    // ครั้งแรกให้ค่าทันที (ไม่หน่วง initial render)
    if (first.current) { first.current = false; return }
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])

  return debounced
}
