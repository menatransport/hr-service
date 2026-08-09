import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans_Thai } from "next/font/google";
import "./globals.css";

const plexThai = IBM_Plex_Sans_Thai({
  variable: "--font-plex-thai",
  subsets: ["latin", "thai"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

/**
 * คู่ของ Plex Sans Thai ที่ดีไซน์ต้นฉบับใช้กับป้ายตัวพิมพ์ใหญ่และตัวเลข
 * (`HR SERVICE`, `EMPLOYEE ID`, รหัสเคส) — ก่อนหน้านี้ `font-mono` ตกไปใช้
 * Consolas/Menlo ของเครื่อง ซึ่งความกว้างและรูปตัวเลขคนละแบบกับที่ออกแบบไว้
 */
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "HR Service Desk",
    template: "%s · HR Service Desk",
  },
  description:
    "ระบบรับข้อร้องเรียนและบริการพนักงาน — แจ้งเรื่อง ติดตามสถานะ จองห้องประชุม จองรถ และดูประกาศบริษัท",
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
  width: "device-width",
  initialScale: 1,
};

/**
 * Applies the saved theme before the first paint. Light (`hrs`) stays the
 * default — the design doc has no dark mode, so only an explicit choice from
 * the topbar toggle switches it. Keep the key in sync with `theme-toggle.tsx`.
 */
const themeScript = `try{var t=localStorage.getItem("hrs-theme");if(t==="hrs-dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="th"
      data-theme="hrs"
      suppressHydrationWarning
      className={`${plexThai.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}
