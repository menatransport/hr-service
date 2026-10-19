import type { Metadata } from "next"
import { Inter, JetBrains_Mono, Noto_Sans_Thai } from "next/font/google"
import { Toaster } from "sonner"

import "@/styles/partner-theme.css"
import { AppShell } from "@/components/partner/app-shell"
import { Providers } from "@/components/partner/providers"
import { PartnerThemeRoot, PARTNER_DARK_SCRIPT } from "@/components/partner/theme-root"
import { ConfirmHost } from "@/components/partner/ui/confirm"

/**
 * layout ของระบบรถร่วม (`/partner/**`) — รวม root layout + `(app)/layout` ของ mena-partner-driver เดิม
 *
 * - `<html>`/`<body>` เป็นของ hr (app/layout.tsx) — ฟอนต์/ธีม/Toaster/Confirm ของรถร่วมจึงอยู่ที่นี่
 * - สีทั้งหมดอยู่ใต้ `.partner-theme` (styles/partner-theme.css) ไม่รั่วไปหน้า hr
 * - โหมดมืดเป็นค่าเริ่มต้นเหมือนเดิม (class `dark` บน `<html>` ตาม localStorage "theme")
 */

// Octo Code design system: Inter (UI) · JetBrains Mono (รหัส/ตัวเลข) · Noto Sans Thai (Inter ไม่มีอักษรไทย)
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter", display: "swap" })
const notoThai = Noto_Sans_Thai({ subsets: ["thai"], weight: ["400", "500", "600", "700"], variable: "--font-noto-thai", display: "swap" })
const jbMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jbmono", display: "swap" })

export const metadata: Metadata = {
  title: { default: "รถร่วม · Mena Partner Driver", template: "%s · รถร่วม" },
  description: "ระบบเงินเดือนรถร่วม Mixer",
}

const FONT_VARS = `${inter.variable} ${notoThai.variable} ${jbMono.variable}`

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: PARTNER_DARK_SCRIPT }} />
      <PartnerThemeRoot fontVars={FONT_VARS} />
      <div className={`partner-theme ${FONT_VARS} flex h-screen overflow-hidden bg-zinc-50 dark:bg-zinc-950`}>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
        <ConfirmHost />
        <Toaster richColors position="top-center" toastOptions={{ style: { fontFamily: "var(--font-noto-thai)" } }} />
      </div>
    </>
  )
}
