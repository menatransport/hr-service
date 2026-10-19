import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"
import { getCatalogConfig } from "@/lib/partner/catalog-config"
import { loadPublicTruckBySlug, loadPublicTrucks } from "@/lib/partner/public-trucks"
import { siteUrl, truckTitle, truckDescription, truckJsonLd, fmtBaht } from "@/lib/partner/public-seo"
import { TruckGallery } from "@/components/partner/public/truck-gallery"
import { TruckSpecTable } from "@/components/partner/public/truck-spec-table"
import { TruckCard } from "@/components/partner/public/truck-card"
import { LeadForm } from "@/components/partner/public/lead-form"
import { telHref } from "@/components/partner/public/thai-text"
import { PrepStars, ReadyStars } from "@/components/partner/public/ready-stars"

// ตัวกันพลาด — ปกติ lib/revalidate-public.ts สั่งล้างแคชทันทีที่ชุดรถว่างเปลี่ยน
export const revalidate = 60

type Params = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const truck = await loadPublicTruckBySlug(slug)
  if (!truck) return { title: "ไม่พบรถคันนี้" }
  const url = siteUrl(`/trucks/${truck.slug}`)
  return {
    title: truckTitle(truck),
    description: truckDescription(truck),
    alternates: { canonical: url },
    // รถที่ขายแล้ว: เก็บหน้าไว้ (สะสมลิงก์) แต่ไม่ให้ Google เก็บ index
    robots: truck.isSold ? { index: false, follow: true } : undefined,
    openGraph: {
      type: "website", url, title: truckTitle(truck), description: truckDescription(truck),
      images: [{ url: siteUrl(`/og/truck/${truck.slug}`), width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", title: truckTitle(truck), description: truckDescription(truck) },
  }
}

export default async function TruckDetailPage({ params }: Params) {
  const { slug } = await params
  const truck = await loadPublicTruckBySlug(slug)
  if (!truck) notFound()

  const db = (await clientPromise).db(PARTNER_DB)
  const [cfg, all] = await Promise.all([getCatalogConfig(db), loadPublicTrucks()])
  const related = all.filter((t) => t.slug !== truck.slug).slice(0, 3)
  const title = [truck.brand, truck.model].filter(Boolean).join(" ") || "รถผสมปูนมือสอง"
  const y = truck.registrationYear
  const heading = `${title}${y ? ` ปี ${y + 543}` : ""}`

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(truckJsonLd(truck)) }} />

      <nav className="text-sm text-[var(--mena-ink)]/55 mb-6">
        <Link href="/trucks" className="hover:text-[var(--mena-green)]">รถทั้งหมด</Link>
        <span className="mx-2">/</span>
        <span className="text-[var(--mena-ink)]">{heading}</span>
      </nav>

      <div className="grid lg:grid-cols-[1.45fr_1fr] gap-10">
        <div className="min-w-0">
          <TruckGallery
            photos={[truck.photos.front, truck.photos.left, truck.photos.right, truck.photos.back, truck.photos.cabin]}
            alt={`${heading} มือสอง`}
          />

          <section className="mt-10">
            <h2 className="text-lg font-medium text-[var(--mena-green)]">ข้อมูลรถ</h2>
            <div className="mt-3 rounded-2xl border border-[var(--mena-line)] bg-white px-5 py-2">
              <TruckSpecTable truck={truck} />
            </div>
          </section>

          {truck.promos.length > 0 && (
            <section className="mt-10">
              <h2 className="text-lg font-medium text-[var(--mena-green)]">โปรโมชั่นที่ติดมากับรถคันนี้</h2>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                {truck.promos.map((p) => (
                  <article key={p.badge} className="rounded-2xl border border-[var(--mena-line)] overflow-hidden bg-white">
                    <header className="bg-[var(--mena-green)] text-white px-5 py-3 flex items-baseline gap-2">
                      <span className="text-xs bg-white/20 rounded-full px-2 py-0.5">{p.badge}</span>
                      <h3 className="font-medium">{p.title}</h3>
                    </header>
                    <div className="px-5 py-4 text-sm leading-relaxed">
                      {p.lines.map((l, i) => (
                        <p key={i}>
                          {l.map((s, j) => typeof s === "string" ? s
                            : "b" in s ? <b key={j} className="font-semibold text-[var(--mena-green)]">{s.b}</b>
                            : <span key={j} className="block text-xl font-semibold text-[var(--mena-green)] leading-tight">{s.big}</span>)}
                        </p>
                      ))}
                      {p.note && <p className="mt-2 text-xs text-[var(--mena-ink)]/50">{p.note}</p>}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {cfg.terms.length > 0 && (
            <section className="mt-10 text-xs text-[var(--mena-ink)]/50 space-y-1">
              {cfg.terms.map((t) => <p key={t}>{t}</p>)}
            </section>
          )}
        </div>

        {/* กล่องราคา+ฟอร์ม — เกาะจอตลอดเหมือนตะกร้าสินค้า ลูกค้าเห็นราคาและช่องฝากเบอร์ตลอดที่เลื่อนดูรูป/สเปก
            จอเตี้ยกว่ากล่อง → ให้เลื่อนในกล่องเองแทนที่จะหลุดหายไปกับหน้า */}
        <aside className="min-w-0">
          <div className="lg:sticky lg:top-[88px] lg:max-h-[calc(100vh-104px)] lg:overflow-y-auto lg:pr-1 [scrollbar-width:thin]">
          <div className="rounded-2xl border border-[var(--mena-line)] bg-white p-6 shadow-[0_16px_40px_-28px_rgba(2,58,30,0.45)]">
            {truck.isSold && (
              <p className="mb-3 inline-block rounded-full bg-[var(--mena-ink)] text-white text-xs px-3 py-1">ขายแล้ว</p>
            )}
            {truck.isReady && (
              <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--mena-paper)] text-[var(--mena-green-deep)] text-xs font-medium px-3 py-1">
                <ReadyStars /> พร้อมขาย ส่งมอบได้ทันที
              </p>
            )}
            <h1 className="text-2xl font-medium leading-snug">{heading}</h1>
            {(truck.characteristic || truck.vehicleType) && (
              <p className="text-sm text-[var(--mena-ink)]/55 mt-1">{truck.characteristic || truck.vehicleType}</p>
            )}
            {!truck.isSold && !truck.isReady && (
              <p className="mt-3 rounded-lg bg-[var(--mena-paper)] px-3 py-2 text-sm text-[var(--mena-ink)]/70">
                <PrepStars className="mr-1.5" />อยู่ระหว่างเตรียมรถ สอบถามวันส่งมอบกับฝ่ายขาย
              </p>
            )}

            <p className="mt-5 text-4xl font-semibold text-[var(--mena-green)] tabular-nums">฿{fmtBaht(truck.display.price)}</p>

            {truck.display.monthlyPayment > 0 && (
              <dl className="mt-4 divide-y divide-[var(--mena-line)] border-y border-[var(--mena-line)]">
                {truck.display.downPayment > 0 && (
                  <div className="flex justify-between py-2.5 text-sm">
                    <dt className="text-[var(--mena-ink)]/55">เงินดาวน์</dt>
                    <dd className="font-medium tabular-nums">฿{fmtBaht(truck.display.downPayment)}</dd>
                  </div>
                )}
                <div className="flex justify-between py-2.5 text-sm">
                  <dt className="text-[var(--mena-ink)]/55">ผ่อนต่อเดือน{truck.display.downPayment > 0 ? " (หลังหักดาวน์)" : ""}</dt>
                  <dd className="font-medium tabular-nums">฿{fmtBaht(truck.display.monthlyPayment)}</dd>
                </div>
                {truck.financeInstallments > 0 && (
                  <div className="flex justify-between py-2.5 text-sm">
                    <dt className="text-[var(--mena-ink)]/55">จำนวนงวด</dt>
                    <dd className="font-medium tabular-nums">{truck.financeInstallments} งวด</dd>
                  </div>
                )}
              </dl>
            )}

            <div className="mt-5 flex flex-col gap-2">
              {cfg.contactPhone && (
                <a href={telHref(cfg.contactPhone)} className="text-center rounded-full bg-[var(--mena-green)] text-white font-medium py-3 hover:bg-[var(--mena-green-soft)] transition-colors">
                  โทรหาฝ่ายขาย {cfg.contactPhone}
                </a>
              )}
              {cfg.contactLine && (
                <a href={`https://line.me/R/ti/p/${encodeURIComponent(cfg.contactLine)}`} className="text-center rounded-full border border-[var(--mena-green)] text-[var(--mena-green)] font-medium py-3 hover:bg-[var(--mena-paper)] transition-colors">
                  ทักทาง LINE
                </a>
              )}
            </div>
          </div>

          {!truck.isSold && (
            <div id="ติดต่อ" className="mt-4 scroll-mt-24">
              <LeadForm slug={truck.slug} phone={cfg.contactPhone} />
            </div>
          )}
          </div>
        </aside>
      </div>

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="text-2xl font-medium">รถคันอื่นที่น่าสนใจ</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            {related.map((t) => <TruckCard key={t.slug} truck={t} />)}
          </div>
        </section>
      )}
    </div>
  )
}
