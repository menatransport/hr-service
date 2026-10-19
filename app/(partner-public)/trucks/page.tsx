import type { Metadata } from "next"
import Image from "next/image"
import { getCatalogConfig } from "@/lib/partner/catalog-config"
import { loadPublicTrucks } from "@/lib/partner/public-trucks"
import { siteUrl, fmtBaht } from "@/lib/partner/public-seo"
import { TruckBrowser } from "@/components/partner/public/truck-browser"
import { LeadForm } from "@/components/partner/public/lead-form"
import { ThaiText, telHref } from "@/components/partner/public/thai-text"
import { PrepStars, ReadyStars } from "@/components/partner/public/ready-stars"
import { deferPrerenderWithoutDb } from "@/lib/partner/build-guard"
import { partnerDb } from "@/lib/db/partner"

// ตัวกันพลาด — ปกติ lib/revalidate-public.ts สั่งล้างแคชทันทีที่ชุดรถว่างเปลี่ยน
export const revalidate = 60

export const metadata: Metadata = {
  title: "รถบรรทุกมือสอง (มิกเซอร์) พร้อมงานวิ่ง ผ่อนตรงกับบริษัท | มีนาทรานสปอร์ต",
  description: "รถบรรทุกมือสองที่บริษัทใช้งานเอง เจ้าของเดียว ประวัติซ่อมบำรุงครบทุกระยะ ผ่อนตรงกับบริษัท ไม่ผ่านไฟแนนซ์ พร้อมงานวิ่งรองรับตั้งแต่วันแรก",
  alternates: { canonical: siteUrl("/trucks") },
}

export default async function TrucksPage() {
  await deferPrerenderWithoutDb()   // build ที่ไม่มี MONGO_URI — ดู lib/partner/build-guard.ts
  const db = (await partnerDb())
  const [trucks, cfg] = await Promise.all([loadPublicTrucks(), getCatalogConfig(db)])
  const readyCount = trucks.filter((t) => t.isReady).length
  const cheapest = trucks.reduce((m, t) => (t.display.monthlyPayment > 0 && (m === 0 || t.display.monthlyPayment < m) ? t.display.monthlyPayment : m), 0)

  return (
    <>
      {/* รูปขบวนรถจากเว็บบริษัท — ภาพที่ลูกค้ากลุ่มนี้รู้จักดีที่สุดคือรถของเราบนถนนจริง */}
      <section className="relative">
        <div className="absolute inset-0">
          <Image src="/partner/brand/fleet-hero.webp" alt="" fill priority sizes="100vw" className="object-cover" />
          <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(2,58,30,0.94)_0%,rgba(2,58,30,0.82)_45%,rgba(2,58,30,0.35)_100%)]" />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 pt-14 pb-12 sm:pt-20 sm:pb-16 text-white">
          <h1 className="text-3xl sm:text-5xl font-medium leading-tight max-w-2xl">
            รถบรรทุกมือสอง
          </h1>
          <p className="mt-4 max-w-xl text-white/85 leading-relaxed">
            <ThaiText>{cfg.tagline || "เจ้าของเดียวตั้งแต่ออกจากศูนย์ ประวัติซ่อมบำรุงครบทุกระยะ ผ่อนตรงกับบริษัท ไม่ผ่านไฟแนนซ์ และมีงานวิ่งรองรับตั้งแต่วันแรก"}</ThaiText>
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#รถพร้อมขาย" className="rounded-full bg-white text-[var(--mena-green-deep)] px-6 py-3 font-medium hover:bg-white/90 transition-colors">
              ดูรถทั้งหมด {trucks.length} คัน
            </a>
            {readyCount > 0 && (
              // #พร้อมขาย → TruckBrowser กดชิป ★★★★★ ให้อัตโนมัติ
              <a href="#พร้อมขาย" className="inline-flex items-center gap-2 rounded-full border border-white/60 px-6 py-3 font-medium hover:bg-white/10 transition-colors">
                <ReadyStars /> รถพร้อมขาย {readyCount} คัน
              </a>
            )}
            {cfg.contactPhone && (
              <a href={telHref(cfg.contactPhone)} className="rounded-full border border-white/60 px-6 py-3 font-medium hover:bg-white/10 transition-colors">
                โทรหาฝ่ายขาย {cfg.contactPhone}
              </a>
            )}
          </div>

          <dl className="mt-10 grid grid-cols-3 gap-px bg-white/20 rounded-2xl overflow-hidden max-w-lg">
            {([
              ["รถว่างตอนนี้", `${trucks.length} คัน`],
              // จอแคบ: ดาวขึ้นบรรทัดเอง + คำไม่แตก (ช่องละ ~110px)
              [<><ReadyStars className="block sm:inline text-[10px]" /> <span className="whitespace-nowrap">พร้อมขาย</span></>, `${readyCount} คัน`],
              ["ผ่อนเริ่มต้น", cheapest ? <>฿{fmtBaht(cheapest)}<wbr /><span className="whitespace-nowrap">/เดือน</span></> : "สอบถามฝ่ายขาย"],
            ] as const).map(([k, v], i) => (
              <div key={i} className="bg-[var(--mena-green-deep)]/85 px-4 sm:px-5 py-4">
                <dt className="text-xs text-white/70">{k}</dt>
                <dd className="mt-1 font-medium tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section id="รถพร้อมขาย" className="max-w-6xl mx-auto px-4 py-12 sm:py-16 scroll-mt-20">
        {/* จุดเลื่อนของลิงก์กรองดาว (/trucks#พร้อมขาย, #เตรียมรถ) — ตัวกรองอ่าน hash ใน TruckBrowser */}
        <span id="พร้อมขาย" className="block scroll-mt-20" aria-hidden="true" />
        <span id="เตรียมรถ" className="block scroll-mt-20" aria-hidden="true" />
        <h2 className="text-2xl font-medium">รถทั้งหมด</h2>
        <p className="text-[var(--mena-ink)]/60 mt-1">ทุกคันมีโปรโมชั่นติดรถ ดูราคาและแผนผ่อนได้ทุกคัน</p>
        <p className="text-sm text-[var(--mena-ink)]/60 mt-2 flex flex-wrap gap-x-5 gap-y-1">
          <span className="inline-flex items-center gap-1.5"><ReadyStars /> = พร้อมขาย ส่งมอบได้ทันที</span>
          <span className="inline-flex items-center gap-1.5"><PrepStars /> = อยู่ระหว่างเตรียมรถ</span>
        </p>
        <div className="mt-8">
          <TruckBrowser trucks={trucks} />
        </div>
      </section>

      {/* ความน่าเชื่อถือของผู้ขาย — ข้อความจากเว็บบริษัท (ฝ่ายขายให้มา 2026-09-23) */}
      <section className="bg-white">
        <div className="max-w-6xl mx-auto px-4 py-14 grid gap-10 lg:grid-cols-2 items-center">
          <div>
            <h2 className="text-2xl sm:text-3xl font-medium text-[var(--mena-green)]">ขนส่งคอนกรีตผสมเสร็จ</h2>
            <p className="mt-5 leading-[1.9] text-balance">
              <ThaiText>
                เราเชี่ยวชาญในการขนส่งคอนกรีตผสมเสร็จ โดยได้รับความไว้วางใจจากบริษัทปูนซีเมนต์และบริษัทคอนกรีตชั้นนำของประเทศ ให้บริหารจัดการรถมิกเซอร์กว่า 472 คัน ด้วยประสบการณ์กว่า 10 ปี
              </ThaiText>
            </p>
            <dl className="mt-8 flex flex-wrap gap-10">
              <div>
                <dt className="text-sm text-[var(--mena-ink)]/55">รถมิกเซอร์ที่ดูแล</dt>
                <dd className="text-3xl font-semibold text-[var(--mena-green)] tabular-nums">472 คัน</dd>
              </div>
              <div>
                <dt className="text-sm text-[var(--mena-ink)]/55">ประสบการณ์</dt>
                <dd className="text-3xl font-semibold text-[var(--mena-green)] tabular-nums">กว่า 10 ปี</dd>
              </div>
            </dl>
          </div>
          <div className="relative aspect-[7/5] rounded-2xl overflow-hidden">
            <Image src="/partner/brand/mixer-service.jpg" alt="รถมิกเซอร์ของมีนาทรานสปอร์ต" fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
          </div>
        </div>
      </section>

      {cfg.sellingPoints.length > 0 && (
        <section>
          <div className="max-w-6xl mx-auto px-4 py-14">
            <h2 className="text-2xl font-medium text-[var(--mena-green)]">ซื้อรถกับมีนา ได้มากกว่ารถหนึ่งคัน</h2>
            {/* text-balance = เฉลี่ยความยาวแต่ละบรรทัด ไม่ให้เหลือคำโดดท้ายย่อหน้า (ข้อความมาจาก catalog_config แก้ได้ที่ /catalog) */}
            <ul className="mt-8 grid gap-6 sm:grid-cols-3">
              {cfg.sellingPoints.slice(0, 3).map((p) => (
                <li key={p} className="bg-white rounded-2xl px-7 py-6 border border-[var(--mena-line)]">
                  <p className="leading-[1.9] text-balance"><ThaiText>{p}</ThaiText></p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
      <section id="ติดต่อ" className="max-w-6xl mx-auto px-4 py-14 scroll-mt-24 grid gap-10 lg:grid-cols-[1fr_1.1fr] items-start">
        <div>
          <h2 className="text-2xl font-medium">สนใจคันไหน ให้เราโทรกลับ</h2>
          <p className="mt-3 leading-[1.9] text-balance text-[var(--mena-ink)]/70">
            <ThaiText>ฝากชื่อกับเบอร์ไว้ ฝ่ายขายจะโทรกลับพร้อมราคา เงื่อนไขการผ่อน และนัดเวลาเข้ามาดูรถ</ThaiText>
          </p>
        </div>
        <LeadForm slug="" phone={cfg.contactPhone} />
      </section>
    </>
  )
}
