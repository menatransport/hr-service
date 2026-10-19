"use client"

import { useEffect } from "react"

/**
 * สคริปต์ก่อนวาดหน้า (เหมือน root layout เดิมของ mena-partner-driver) — มืดเป็นค่าเริ่มต้น
 * เว้นแต่ผู้ใช้เลือกสว่างไว้ (localStorage "theme") · class `dark` มีผลเฉพาะใน styles/partner-theme.css
 */
export const PARTNER_DARK_SCRIPT = `try{if(localStorage.getItem("theme")!=="light")document.documentElement.classList.add("dark")}catch(e){document.documentElement.classList.add("dark")}`

/**
 * ติด `.partner-theme` + ตัวแปรฟอนต์ที่ `<body>` ระหว่างอยู่หน้ารถร่วม — dialog/popover/toast ที่ portal
 * ไปที่ body จะได้สี/ฟอนต์ของรถร่วม · ถอดออก (รวมทั้ง `dark`) ตอนออกจากโซน ไม่ให้ค้างไปหน้า hr
 * (สคริปต์ inline ไม่ทำงานซ้ำตอนย้ายหน้าแบบ client — effect นี้จึงตั้ง `dark` ให้ด้วย)
 */
export function PartnerThemeRoot({ fontVars, forceLight = false }: { fontVars: string; forceLight?: boolean }) {
  useEffect(() => {
    const body = document.body
    const html = document.documentElement
    const classes = ["partner-theme", ...fontVars.split(/\s+/).filter(Boolean)]
    body.classList.add(...classes)
    let dark = !forceLight
    if (!forceLight) {
      try { dark = localStorage.getItem("theme") !== "light" } catch { dark = true }
    }
    html.classList.toggle("dark", dark)
    return () => {
      body.classList.remove(...classes)
      html.classList.remove("dark")
    }
  }, [fontVars, forceLight])
  return null
}
