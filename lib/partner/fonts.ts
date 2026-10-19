import { Sarabun } from "next/font/google"

/** ฟอนต์เอกสารสัญญา (ใช้ร่วมกันทุก template) — โหลดครั้งเดียว */
export const sarabun = Sarabun({
  weight: ["400", "500", "600", "700"],
  subsets: ["thai", "latin"],
  display: "swap",
})
