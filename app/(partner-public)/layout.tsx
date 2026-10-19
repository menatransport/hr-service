import Image from "next/image"
import Link from "next/link"
import { Prompt } from "next/font/google"
import "@/styles/partner-theme.css"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"
import { PartnerThemeRoot } from "@/components/partner/theme-root"
import { getCatalogConfig } from "@/lib/partner/catalog-config"
import { ContactBar } from "@/components/partner/public/contact-bar"
import { ThaiText, telHref } from "@/components/partner/public/thai-text"
import { deferPrerenderWithoutDb } from "@/lib/partner/build-guard"

/**
 * หน้าเว็บสาธารณะ (ขายรถ /trucks) — ไม่มี sidebar, ไม่ต้อง login, light mode คงที่
 * (root layout เปิด dark ตาม localStorage ของพนักงาน — หน้าขายต้องขาวเสมอ จึง override สีเอง)
 *
 * โทนแบรนด์ถอดจากเว็บทางการ menatransport.co.th: เขียว #046132, ฟอนต์ Prompt, ปุ่มทรงแคปซูล
 * โลโก้/รูปรถเก็บไว้ใน public/brand (ไม่ลิงก์ข้ามเว็บ — ภาพจะได้ไม่หายเวลาเว็บบริษัทเปลี่ยน)
 * ห้ามใช้ utility สี zinc / emerald ในโซนนี้ — globals.css แม็พไว้เป็นชุดสีระบบหลังบ้าน (เข้ม) ให้ใช้ตัวแปร --mena- แทน
 */

const prompt = Prompt({ subsets: ["latin", "thai"], weight: ["300", "400", "500", "600"], display: "swap" })

const BRAND = {
  "--mena-green": "#046132",
  "--mena-green-deep": "#023A1E",
  "--mena-green-soft": "#338B5F",
  "--mena-red": "#EC1C24",
  "--mena-paper": "#F3F4F5",
  "--mena-ink": "#212529",
  "--mena-line": "#DFE3E6",
} as React.CSSProperties

// ช่องทางโซเชียลฝ่ายขาย (ส่งมาจากทีมขาย 2026-10-06) — ตัด query ติดตามของแอปออก
const SOCIALS = [
  {
    label: "Facebook",
    href: "https://www.facebook.com/share/17VJvbKqAj/",
    icon: "M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.32l-.53 3.5h-2.8V24C19.62 23.1 24 18.1 24 12.07",
  },
  {
    label: "TikTok @taokaenoimena",
    href: "https://www.tiktok.com/@taokaenoimena",
    icon: "M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07",
  },
]

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  await deferPrerenderWithoutDb()   // build ที่ไม่มี MONGO_URI — ดู lib/partner/build-guard.ts
  const cfg = await getCatalogConfig((await clientPromise).db(PARTNER_DB))

  return (
    <div
      style={{ ...BRAND, colorScheme: "light" }}
      className={`partner-theme ${prompt.className} min-h-screen flex flex-col bg-[var(--mena-paper)] text-[var(--mena-ink)]`}
    >
      {/* โซนสาธารณะสว่างเสมอ — ถอด `dark` ที่อาจค้างจากหน้าหลังบ้าน (ผ่าน client navigation) */}
      <PartnerThemeRoot fontVars={prompt.className} forceLight />
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-[var(--mena-line)]">
        <div className="max-w-6xl mx-auto px-4 h-[72px] flex items-center gap-6">
          <Link href="/trucks" className="flex items-center gap-3 shrink-0">
            <Image src="/partner/brand/mena-logo.svg" alt="มีนาทรานสปอร์ต" width={104} height={71} className="h-11 w-auto" priority />
            <span className="hidden sm:block leading-tight">
              <span className="block text-[15px] font-medium text-[var(--mena-green)]">รถบรรทุกมือสอง</span>
              <span className="block text-xs text-[var(--mena-ink)]/60">บริษัท มีนาทรานสปอร์ต จำกัด (มหาชน)</span>
            </span>
          </Link>

          <nav className="ml-auto flex items-center gap-1 sm:gap-4 text-sm">
            <Link href="/trucks" className="px-2 py-1 hover:text-[var(--mena-green)]">รถทั้งหมด</Link>
            <a href="https://www.menatransport.co.th" className="hidden sm:block px-2 py-1 hover:text-[var(--mena-green)]">เว็บไซต์บริษัท</a>
            {cfg.contactPhone && (
              <a
                href={telHref(cfg.contactPhone)}
                className="rounded-full bg-[var(--mena-green)] text-white px-4 sm:px-5 py-2.5 font-medium hover:bg-[var(--mena-green-soft)] transition-colors"
              >
                โทร {cfg.contactPhone}
              </a>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <ContactBar phone={cfg.contactPhone} line={cfg.contactLine} />

      <footer className="mt-20 bg-[var(--mena-green-deep)] text-white/80">
        <div className="max-w-6xl mx-auto px-4 py-14 grid gap-10 sm:gap-8 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <span className="inline-flex bg-white rounded-xl px-3 py-2">
              <Image src="/partner/brand/mena-logo.svg" alt="มีนาทรานสปอร์ต" width={104} height={71} className="h-10 w-auto" />
            </span>
            <p className="mt-5 font-medium text-white">บริษัท มีนาทรานสปอร์ต จำกัด (มหาชน)</p>
            <p className="mt-2 max-w-xs text-sm leading-[1.9] text-balance">
              <ThaiText>รถบรรทุกมือสองจากบริษัท เจ้าของเดียว ประวัติซ่อมบำรุงครบทุกระยะ ผ่อนตรงกับบริษัท ไม่ผ่านไฟแนนซ์</ThaiText>
            </p>
          </div>

          <div className="text-sm">
            <p className="font-medium text-white">ติดต่อฝ่ายขาย</p>
            <ul className="mt-3 space-y-2.5">
              {cfg.contactName && <li>{cfg.contactName}</li>}
              {cfg.contactPhone && <li><a href={telHref(cfg.contactPhone)} className="hover:text-white">โทร {cfg.contactPhone}</a></li>}
              {cfg.contactLine && (
                <li>
                  <a href={`https://line.me/R/ti/p/${encodeURIComponent(cfg.contactLine)}`} className="hover:text-white">
                    LINE {cfg.contactLine}
                  </a>
                </li>
              )}
            </ul>
          </div>

          <div className="text-sm">
            <p className="font-medium text-white">เกี่ยวกับบริษัท</p>
            <ul className="mt-3 space-y-2.5">
              <li><a href="https://www.menatransport.co.th" className="hover:text-white">menatransport.co.th</a></li>
              <li><Link href="/trucks" className="hover:text-white">รถทั้งหมด</Link></li>
            </ul>

            <p className="mt-6 font-medium text-white">ติดตามเรา</p>
            <ul className="mt-3 space-y-2.5">
              {SOCIALS.map((s) => (
                <li key={s.label}>
                  <a href={s.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:text-white">
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true"><path d={s.icon} /></svg>
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="border-t border-white/15">
          {/* เว้นที่ท้ายเว็บให้แถบปุ่มบนมือถือ ไม่ให้ทับบรรทัดลิขสิทธิ์ */}
          <p className="max-w-6xl mx-auto px-4 py-5 pb-24 lg:pb-5 text-xs">
            © {new Date().getFullYear()} บริษัท มีนาทรานสปอร์ต จำกัด (มหาชน)
          </p>
        </div>
      </footer>
    </div>
  )
}
