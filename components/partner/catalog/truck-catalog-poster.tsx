import { Fragment, type ReactNode, type CSSProperties } from "react"
import {
  Crown, Check, Phone, MessageCircle, Truck, Tag, Calendar, Gauge,
  Wrench, ShieldCheck, Gift, Sparkles, Star,
} from "lucide-react"

/**
 * TruckCatalogPoster — โปสเตอร์แคตตาล็อกรถมิกเซอร์มือสอง MENA TRANSPORT (แนวตั้ง 2:3)
 * ธีมเขียวเข้ม-ทอง สไตล์ artwork: กรอบทองรอบแผ่น, ฟอยล์ทอง, กระดาษครีมมีแสง, รูป hero เป็นภาพใส่กรอบ
 * Tailwind utility ล้วน · โทเคนสีเป็น CSS variable (เปลี่ยนแบรนด์ได้ผ่าน prop `theme`)
 * ทุกลูกเล่นเป็น gradient / clip-path / text-stroke เท่านั้น (ไม่ใช้ filter/backdrop) เพื่อให้ export PNG ตรงกับจอ
 *
 * โหมดแสดงผล
 *   fluid (default) — กว้างตามจอ สูงสุด 1024px, กว้าง <768px กริดยุบเป็น 1-2 คอลัมน์
 *   breakpoint เป็น container query (@3xl = 768px ของตัวโปสเตอร์เอง ไม่ใช่ viewport) → export 1024px ได้ layout เต็มเสมอแม้กดจากมือถือ
 *   fixed           — กว้างคงที่ 1024px (สูง ≥1536) สำหรับพิมพ์/export เป็นภาพ ย่อขยายด้วย `scale`
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TruckSpec { label: string; value: string }
export interface GalleryItem { src: string; caption: string }
export interface Promotion { badge: string; title: string; titleParts?: string[]; body: ReactNode; icon?: ReactNode; note?: string }

export interface TruckCatalog {
  brand: string
  modelCode: string
  plate: string
  specs: TruckSpec[]
  status: string
  price: number
  downPayment?: number        // ดาวน์ — แสดงใต้ราคา คู่กับค่างวด × งวด
  monthlyPayment: number
  installments?: number       // จำนวนงวดผ่อน (แสดง × N งวด)
  heroImage: string
  gallery: GalleryItem[]
  quote: string
  highlights: string[]
  promotions: Promotion[]
  contactPhone?: string
  lineId?: string
  logoUrl?: string            // โลโก้บริษัทท้ายโปสเตอร์ (default /mena-logo.jpg)
}

/** โทเคนสีแบรนด์ — override ได้บางตัว */
export interface PosterTheme {
  greenDark: string
  green: string
  greenLight: string
  gold: string
  goldLight: string
  cream: string
  white: string
}

export interface TruckCatalogPosterProps extends Partial<TruckCatalog> {
  mode?: "fluid" | "fixed"
  scale?: number
  theme?: Partial<PosterTheme>
}

// ─── Design tokens ────────────────────────────────────────────────────────────

export const DEFAULT_THEME: PosterTheme = {
  greenDark:  "#0B3B2E",
  green:      "#14532D",
  greenLight: "#2F6B4F",
  gold:       "#C9A227",
  goldLight:  "#E6CE86",
  cream:      "#F6F1E4",
  white:      "#FFFFFF",
}

/** ค่าเริ่มต้นบน :root (ใส่ครั้งเดียว) — instance ใด ๆ override ผ่าน style บน wrapper ได้ */
const ROOT_VARS = `:root{--mt-green-dark:${DEFAULT_THEME.greenDark};--mt-green:${DEFAULT_THEME.green};--mt-green-light:${DEFAULT_THEME.greenLight};--mt-gold:${DEFAULT_THEME.gold};--mt-gold-light:${DEFAULT_THEME.goldLight};--mt-cream:${DEFAULT_THEME.cream};--mt-white:${DEFAULT_THEME.white};--mt-gold-grad:linear-gradient(120deg,#7A5A00 0%,#C9A227 28%,#F7E7A8 46%,#FFF7D6 50%,#F0D98A 56%,#C9A227 74%,#8A6A00 100%);--mt-green-grad:linear-gradient(160deg,#062A20 0%,#0B3B2E 40%,#14532D 75%,#2F6B4F 100%);--mt-paper:radial-gradient(ellipse 80% 50% at 50% -10%,rgba(255,255,255,0.9),transparent 60%),radial-gradient(ellipse 60% 40% at 100% 100%,rgba(201,162,39,0.14),transparent 60%),radial-gradient(ellipse 50% 35% at 0% 60%,rgba(20,83,45,0.08),transparent 60%)}`

// class ย่อที่ใช้ซ้ำ — Tailwind arbitrary values อ้าง CSS variable
const T = {
  font:       "font-[var(--font-noto-thai),Prompt,Kanit,'Noto_Sans_Thai',sans-serif]",
  goldText:   "bg-[image:var(--mt-gold-grad)] bg-clip-text text-transparent",
  goldBg:     "bg-[image:var(--mt-gold-grad)]",
  greenGrad:  "bg-[image:var(--mt-green-grad)]",
  // เงาสองชั้นโทนเขียว: ชั้นใกล้คม + ชั้นไกลนุ่ม → ดูลอยจริง
  shadow:     "shadow-[0_2px_4px_rgba(11,59,46,0.18),0_24px_48px_-20px_rgba(11,59,46,0.55)]",
  shadowSoft: "shadow-[0_1px_2px_rgba(11,59,46,0.12),0_14px_28px_-14px_rgba(11,59,46,0.4)]",
  // เส้นทองบาง ๆ ซ้อนในขอบ (ใช้กับกรอบรูป/การ์ด)
  goldRing:   "ring-1 ring-[var(--mt-gold)]/60 ring-inset",
  // ตัวเลขใหญ่: บีบ letter-spacing + ตัวเลขเรียงเท่ากัน
  numeral:    "tabular-nums tracking-[-0.03em]",
}

const baht = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 0 })

// ─── Mock data (NISSAN ME135) ─────────────────────────────────────────────────

const PLACEHOLDER = (w: number, h: number, text: string) =>
  `https://placehold.co/${w}x${h}/0B3B2E/E6CE86?text=${encodeURIComponent(text)}`

export const MOCK_TRUCK: TruckCatalog = {
  brand: "NISSAN",
  modelCode: "ME135",
  plate: "สบ.70-6298",
  specs: [
    { label: "รุ่น",          value: "CWM454HMRA" },
    { label: "ประเภทรถ",      value: "รถผสมปูน 10 ล้อ" },
    { label: "ปีจดทะเบียน",   value: "2558" },
  ],
  status: "พร้อมขาย",
  price: 1_338_400,
  downPayment: 100_000,
  monthlyPayment: 17_200,
  installments: 72,
  heroImage: PLACEHOLDER(1024, 620, "NISSAN ME135"),
  gallery: [
    { src: PLACEHOLDER(400, 300, "Front"), caption: "ด้านหน้า" },
    { src: PLACEHOLDER(400, 300, "Back"),  caption: "ด้านหลัง" },
    { src: PLACEHOLDER(400, 300, "Right"), caption: "ด้านขวา" },
    { src: PLACEHOLDER(400, 300, "Left"),  caption: "ด้านซ้าย" },
  ],
  quote: "ซื้อรถกับเรา ไม่ใช่แค่ได้รถ แต่ได้งานวิ่งตั้งแต่วันแรก",
  highlights: [
    "เจ้าของเดียว ประวัติซ่อมบำรุงครบทุกครั้ง",
    "มีงานวิ่งรองรับกับแพล้นท์ปูนในเครือทันที",
    "ผ่อนกับบริษัทโดยตรง ไม่ต้องกู้ไฟแนนซ์",
  ],
  promotions: [
    {
      badge: "ต่อที่ 1", title: "ฟรีค่างวด 9 ฟรี 1",
      body: <>ผ่อนครบ <b>9 งวด</b> รับ<span className="font-bold text-[var(--mt-gold)]">ฟรี 1 งวด</span> ตลอดอายุสัญญา</>,
      icon: <Gift className="w-10 h-10" />,
      note: "เงื่อนไข: ชำระค่างวดตรงเวลาต่อเนื่องตามรอบสัญญา",
    },
    {
      badge: "ต่อที่ 2", title: "ฟรีค่าซ่อมบำรุง",
      body: <>วงเงินซ่อม <b className="text-[var(--mt-green)]">120,000 บาท</b> อะไหล่ + ค่าแรง ที่ศูนย์ซ่อมของบริษัท</>,
      icon: <Wrench className="w-10 h-10" />,
    },
    {
      badge: "ต่อที่ 3", title: "ฟรี PM ทุกปี",
      body: <>บำรุงรักษาเชิงป้องกันมูลค่า <b className="text-[var(--mt-green)]">10,070 บาท/ปี</b> ตลอดสัญญา</>,
      icon: <ShieldCheck className="w-10 h-10" />,
    },
  ],
  contactPhone: "",
  lineId: "",
  logoUrl: "/partner/mena-logo.jpg",
}

const PROMO_ICONS = [<Gift key="g" className="w-10 h-10" />, <Wrench key="w" className="w-10 h-10" />, <ShieldCheck key="s" className="w-10 h-10" />]

// ─── Ornaments ────────────────────────────────────────────────────────────────

/** กรอบทองรอบทั้งแผ่น + ขีดมุม 4 มุม (เหมือนใบประกาศ) */
function PosterFrame() {
  const tick = "absolute w-7 h-7 border-[var(--mt-gold)]"
  return (
    <div aria-hidden className="pointer-events-none absolute inset-3 @3xl:inset-4 z-20">
      <div className="absolute inset-0 rounded-[18px] border border-[var(--mt-gold)]/70" />
      <div className="absolute inset-[5px] rounded-[14px] border border-[var(--mt-gold-light)]/50" />
      <span className={`${tick} -top-px -left-px border-t-2 border-l-2 rounded-tl-[18px]`} />
      <span className={`${tick} -top-px -right-px border-t-2 border-r-2 rounded-tr-[18px]`} />
      <span className={`${tick} -bottom-px -left-px border-b-2 border-l-2 rounded-bl-[18px]`} />
      <span className={`${tick} -bottom-px -right-px border-b-2 border-r-2 rounded-br-[18px]`} />
    </div>
  )
}

/** เส้นคั่นทองมีเพชรตรงกลาง */
function GoldRule() {
  return (
    <div aria-hidden className="flex items-center gap-3 px-8">
      <span className="h-px flex-1 bg-[linear-gradient(90deg,transparent,var(--mt-gold))]" />
      <span className="w-2 h-2 rotate-45 bg-[var(--mt-gold)]" />
      <span className="h-px flex-1 bg-[linear-gradient(90deg,var(--mt-gold),transparent)]" />
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** 1. Header — แถบทแยงเงิน/ทอง + ตราหัวเรื่อง (มงกุฎในวงแหวนทอง, ป้ายเบเวล, ริบบิ้นปลายบาก) + quote + จุดเด่น */
function Header({ quote, highlights }: { quote: string; highlights: string[] }) {
  return (
    <header className="relative overflow-hidden px-8 pt-12 pb-6">
      {/* แถบทแยงเงิน + เส้นทอง มุมซ้ายบน */}
      <div aria-hidden className="absolute -top-20 -left-28 w-[460px] h-[150px] rotate-[-18deg] bg-[linear-gradient(90deg,#ffffff_0%,#e6e9ec_45%,#c9ced3_70%,transparent_100%)] opacity-95" />
      <div aria-hidden className="absolute -top-6 -left-32 w-[460px] h-[22px] rotate-[-18deg] bg-[image:var(--mt-gold-grad)] opacity-90" />
      <div aria-hidden className="absolute -top-1 -left-32 w-[460px] h-[3px] rotate-[-18deg] bg-[var(--mt-green-dark)] opacity-70" />
      {/* วงแสงจาง ๆ มุมขวาบน */}
      <div aria-hidden className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-[radial-gradient(circle,rgba(201,162,39,0.22),transparent_65%)]" />

      {/* ตราหัวเรื่อง */}
      <div className="relative mx-auto w-fit text-center">
        {/* มงกุฎในวงแหวนทอง */}
        <div className="mx-auto mb-[-14px] relative z-10 w-12 h-12 rounded-full bg-[var(--mt-cream)] grid place-items-center ring-2 ring-[var(--mt-gold)] shadow-[0_4px_10px_-4px_rgba(11,59,46,0.4)]">
          <Crown className="w-6 h-6 text-[var(--mt-gold)]" strokeWidth={2} />
        </div>
        {/* ป้าย: ขอบทองนอก + เส้นทองอ่อนใน + แสงสะท้อนบน */}
        <div className={`relative rounded-[22px] border-2 border-[var(--mt-gold)] bg-[image:var(--mt-green-grad)] px-12 pt-8 pb-5 ${T.shadow}`}>
          <div aria-hidden className="absolute inset-[5px] rounded-[16px] border border-[var(--mt-gold-light)]/45" />
          <div aria-hidden className="absolute inset-x-[5px] top-[5px] h-1/2 rounded-t-[16px] bg-[linear-gradient(180deg,rgba(255,255,255,0.10),transparent)]" />
          <h1 className={`relative text-4xl @3xl:text-[64px] font-black italic leading-[1.05] pr-2 ${T.goldText} [text-shadow:0_2px_0_rgba(0,0,0,0.0)]`}>เถ้าแก่น้อยมีนา</h1>
        </div>
        {/* ริบบิ้นปลายบาก */}
        <div className={`relative mx-auto -mt-3.5 w-fit px-9 py-1.5 text-[11px] @3xl:text-xs font-bold tracking-[0.22em] text-[#3F3000] ${T.goldBg} [clip-path:polygon(0_0,100%_0,calc(100%-10px)_50%,100%_100%,0_100%,10px_50%)]`}>
          MENA TRANSPORT MIXER TRUCK CATALOG
        </div>
      </div>

      {/* quote ซ้าย · จุดเด่นขวา */}
      <div className="relative mt-9 grid gap-6 @3xl:grid-cols-[1.1fr_1fr] items-start">
        <blockquote className="relative pl-5 text-lg @3xl:text-[21px] italic text-[var(--mt-green-dark)] leading-relaxed">
          <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[3px] rounded bg-[image:var(--mt-gold-grad)]" />
          <span className={`text-4xl leading-none align-top mr-1 ${T.goldText}`}>“</span>
          {quote}
          <span className={`text-4xl leading-none align-top ml-1 ${T.goldText}`}>”</span>
        </blockquote>
        <div>
          <p className="text-xl @3xl:text-2xl font-black text-[var(--mt-green-dark)]">รถดี พร้อมลุยงาน</p>
          <ul className="mt-2.5 space-y-2">
            {highlights.slice(0, 3).map((h) => (
              <li key={h} className="flex items-start gap-2.5 text-sm @3xl:text-base text-[var(--mt-green-dark)]">
                <span className="mt-0.5 shrink-0 w-6 h-6 rounded-full bg-[image:var(--mt-green-grad)] text-[var(--mt-gold-light)] grid place-items-center ring-1 ring-[var(--mt-gold)]/70">
                  <Check className="w-3.5 h-3.5" strokeWidth={3} />
                </span>
                {h}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </header>
  )
}

/** ไอคอนประจำ label ของ spec (ไม่ตรงชื่อ → Tag) */
function specIcon(label: string) {
  const cls = "w-4 h-4"
  if (label.includes("รุ่น"))   return <Truck className={cls} />
  if (label.includes("ประเภท")) return <Gauge className={cls} />
  if (label.includes("ปี"))     return <Calendar className={cls} />
  return <Tag className={cls} />
}

/** 2a. SpecCard — การ์ดขาวลอยทับมุมขวาของรูป hero (แถบทองด้านซ้าย, ตัวเลขทะเบียนเป็นป้าย) */
function SpecCard({ brand, modelCode, plate, specs, status }: Pick<TruckCatalog, "brand" | "modelCode" | "plate" | "specs" | "status">) {
  return (
    <div className={`relative overflow-hidden rounded-3xl bg-white p-5 pl-6 @3xl:p-6 @3xl:pl-7 w-full @3xl:w-[368px] ${T.shadow} ${T.goldRing}`}>
      <div aria-hidden className="absolute left-0 top-0 bottom-0 w-1.5 bg-[image:var(--mt-gold-grad)]" />
      <p className="text-3xl @3xl:text-[40px] font-black tracking-wide leading-none text-[var(--mt-green-dark)]">{brand}</p>
      <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-[var(--mt-green-light)]">
        <span className="rounded-md bg-[var(--mt-green-dark)] text-[var(--mt-gold-light)] px-2 py-0.5 text-xs tracking-wider">{modelCode}</span>
        <span className="rounded-md border border-[var(--mt-gold)]/60 bg-[var(--mt-cream)] px-2 py-0.5 text-xs text-[var(--mt-green-dark)]">{plate}</span>
      </p>
      <dl className="mt-4 divide-y divide-[var(--mt-gold)]/20">
        {specs.map((s) => (
          <div key={s.label} className="flex items-center justify-between gap-3 py-2 text-sm">
            <dt className="flex items-center gap-2 text-[var(--mt-green-light)]"><span className="text-[var(--mt-gold)]">{specIcon(s.label)}</span>{s.label}</dt>
            <dd className="font-bold text-[var(--mt-green-dark)] text-right">{s.value}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 py-2 text-sm">
          <dt className="flex items-center gap-2 text-[var(--mt-green-light)]"><Star className="w-4 h-4 text-[var(--mt-gold)]" />สถานะ</dt>
          <dd>
            <span className="inline-flex items-center gap-1 rounded-full bg-[image:var(--mt-green-grad)] text-white text-xs font-bold px-3 py-1 ring-1 ring-[var(--mt-gold)]/70">
              <Check className="w-3 h-3 text-[var(--mt-gold-light)]" strokeWidth={3} />{status}
            </span>
          </dd>
        </div>
      </dl>
    </div>
  )
}

/** 2b. PriceBlock — ราคารถ + ผ่อนต่อเดือน พื้นเขียวไล่เฉด มีแสงกวาดทแยง + ลายน้ำ ฿ */
function PriceBlock({ price, downPayment, monthlyPayment, installments }: Pick<TruckCatalog, "price" | "downPayment" | "monthlyPayment" | "installments">) {
  return (
    <div className={`relative overflow-hidden rounded-3xl ${T.greenGrad} text-white px-6 py-5 @3xl:px-8 @3xl:py-6 ${T.shadow} ring-1 ring-[var(--mt-gold)]/50 grid gap-4 @3xl:grid-cols-2 items-end`}>
      <div aria-hidden className="absolute -inset-y-10 -left-1/4 w-1/2 rotate-[20deg] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.10),transparent)]" />
      <div aria-hidden className="absolute -right-3 -bottom-8 text-[150px] font-black leading-none text-[var(--mt-gold)] opacity-[0.10] select-none">฿</div>
      <div aria-hidden className="absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(230,206,134,0.7),transparent)]" />
      <div className="relative">
        <p className="text-sm text-[var(--mt-gold-light)]">ราคารถ</p>
        <p className="leading-none mt-1">
          <span className={`text-5xl @3xl:text-[68px] font-black ${T.numeral} [text-shadow:0_3px_12px_rgba(0,0,0,0.35)]`}>{baht(price)}</span>
          <span className="ml-2 text-base text-[var(--mt-gold-light)]">บาท</span>
        </p>
        {!!downPayment && (
          <p className="mt-2 text-sm @3xl:text-base text-[var(--mt-gold-light)]">
            ดาวน์ <span className="font-black text-white text-lg @3xl:text-xl">{baht(downPayment)}</span> บาท
          </p>
        )}
      </div>
      <div className="relative @3xl:text-right">
        <p className="text-sm text-[var(--mt-gold-light)]">ผ่อนเพียงเดือนละ</p>
        <p className="leading-none mt-1">
          <span className={`text-4xl @3xl:text-[56px] font-black ${T.numeral} ${T.goldText}`}>{baht(monthlyPayment)}</span>
          <span className="ml-2 text-base text-[var(--mt-gold-light)]">บาท{!!downPayment && <span className="align-super text-sm">*</span>}</span>
        </p>
        {!!installments && (
          <p className="mt-2 text-sm @3xl:text-base text-[var(--mt-gold-light)]">
            ผ่อน <span className="font-black text-white text-lg @3xl:text-xl">{installments}</span> งวด
          </p>
        )}
        {/* ค่างวดคิดจากยอดหลังหักดาวน์ — ไม่งั้นลูกค้าจะคูณค่างวด × งวด แล้วงงว่าไม่เท่าราคารถ */}
        {!!downPayment && (
          <p className="mt-1 text-xs @3xl:text-sm text-[var(--mt-gold-light)]/80">* เป็นยอดผ่อนหลังหักเงินดาวน์แล้ว</p>
        )}
      </div>
    </div>
  )
}

/** 2. Hero (ภาพใส่กรอบทอง + vignette + ลายน้ำชื่อแบรนด์) + Spec card ซ้อน แล้วต่อด้วยบล็อกราคา */
function HeroSection({ truck }: { truck: TruckCatalog }) {
  return (
    <section className="px-8">
      <div className="relative">
        <div className={`relative rounded-3xl overflow-hidden aspect-[16/10] bg-[var(--mt-green-dark)] ${T.shadow}`}>
          {/* รูปรถหลัก — ใช้ <img> ธรรมดาเพื่อให้ export เป็นภาพได้ตรง ๆ */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={truck.heroImage} alt={`${truck.brand} ${truck.modelCode}`} className="w-full h-full object-cover" />
          {/* vignette ล่าง + ขอบทองสองชั้นซ้อนในรูป */}
          <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,42,32,0.18)_0%,transparent_30%,transparent_60%,rgba(6,42,32,0.55)_100%)]" />
          <div aria-hidden className="absolute inset-3 rounded-2xl border border-[var(--mt-gold)]/80" />
          <div aria-hidden className="absolute inset-[15px] rounded-[13px] border border-[var(--mt-gold-light)]/35" />
          {/* ลายน้ำชื่อแบรนด์ (ตัวอักษรเส้นทอง) — วางมุมบนซ้าย เพราะรูปจากแอปตรวจรถมีลายน้ำเวลา/สถานที่ที่มุมล่างซ้าย */}
          <div aria-hidden className="absolute left-7 top-6 text-6xl @3xl:text-[88px] font-black italic leading-none tracking-tight text-transparent [-webkit-text-stroke:1.5px_rgba(230,206,134,0.55)] select-none">
            {truck.brand}
          </div>
        </div>
        {/* การ์ด spec: จอกว้างลอยทับมุมขวา · จอเล็กวางใต้รูป */}
        <div className="mt-4 @3xl:mt-0 @3xl:absolute @3xl:right-6 @3xl:-bottom-10">
          <SpecCard brand={truck.brand} modelCode={truck.modelCode} plate={truck.plate} specs={truck.specs} status={truck.status} />
        </div>
      </div>
      <div className="mt-6 @3xl:mt-16">
        <PriceBlock price={truck.price} downPayment={truck.downPayment} monthlyPayment={truck.monthlyPayment} installments={truck.installments} />
      </div>
    </section>
  )
}

/** 3. Gallery — 4 มุม กรอบทองบาง แถบ caption เขียวมีเส้นทอง */
function Gallery({ items }: { items: GalleryItem[] }) {
  return (
    <section className="px-8 mt-8 grid grid-cols-2 @3xl:grid-cols-4 gap-3.5">
      {items.slice(0, 4).map((g) => (
        <figure key={g.caption} className={`relative rounded-xl overflow-hidden bg-white ${T.shadowSoft} ${T.goldRing}`}>
          <div className="aspect-[4/3] bg-[var(--mt-cream)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={g.src} alt={g.caption} className="w-full h-full object-cover" />
          </div>
          <figcaption className="relative bg-[image:var(--mt-green-grad)] text-white text-xs font-semibold text-center py-1.5 tracking-wide">
            <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-[var(--mt-gold)]/80" />
            {g.caption}
          </figcaption>
        </figure>
      ))}
    </section>
  )
}

/** 4. PromoBanner — แถบเขียวขอบบาก เลขจำนวนต่อเป็นเหรียญทอง */
function PromoBanner({ count }: { count: number }) {
  return (
    <section className={`relative mt-10 ${T.greenGrad} text-white px-8 pt-7 pb-8 flex flex-wrap items-center justify-between gap-4 overflow-hidden [clip-path:polygon(0_0,100%_0,100%_calc(100%-10px),50%_100%,0_calc(100%-10px))]`}>
      {/* ลายเส้นทองทแยงจาง ๆ ด้านขวา */}
      <div aria-hidden className="absolute inset-y-0 right-0 w-1/3 bg-[repeating-linear-gradient(-45deg,transparent_0,transparent_10px,rgba(201,162,39,0.10)_10px,rgba(201,162,39,0.10)_12px)]" />
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-[image:var(--mt-gold-grad)]" />
      <div className="relative flex flex-wrap items-center gap-x-4 gap-y-1">
        <p className="text-3xl @3xl:text-[40px] font-black flex items-center gap-3 leading-none">
          <Sparkles className="w-7 h-7 text-[var(--mt-gold)]" />
          รับโปรโมชั่นพิเศษ
          <span className={`inline-grid place-items-center w-16 h-16 @3xl:w-20 @3xl:h-20 rounded-full ${T.goldBg} text-[#3F3000] text-5xl @3xl:text-6xl font-black leading-none ring-2 ring-[var(--mt-green-dark)] shadow-[0_0_0_2px_var(--mt-gold-light),0_8px_16px_-6px_rgba(0,0,0,0.5)]`}>{count}</span>
          ต่อ!
        </p>
        <p className={`text-2xl @3xl:text-[32px] font-black leading-none ${T.goldText}`}>ตลอดอายุสัญญา</p>
      </div>
      <p className="relative italic text-sm @3xl:text-base text-[var(--mt-gold-light)] pb-2">เป็นเจ้าของรถ…ง่ายกว่าที่คิด</p>
    </section>
  )
}

/** ข้อความไทยขึ้นบรรทัดเฉพาะรอยต่อวลี — กันตัดกลางคำประสม (น้ำมัน|เครื่อง) หรือกลางวลี (เป็นไป|ตามที่) */
function Phrases({ parts, sep = "" }: { parts: string[]; sep?: string }) {
  return <>{parts.map((t, i) => <Fragment key={i}>{i > 0 && (sep || <wbr />)}<span className="whitespace-nowrap">{t}</span></Fragment>)}</>
}

/** 5. PromoCard — การ์ดโปรฯ 1 ใบ: หัวเขียวมีป้ายทองบาก, ตัวการ์ดครีมมีเส้นทองใน, ไอคอนลายน้ำใหญ่ */
function PromoCard({ promo, index }: { promo: Promotion; index: number }) {
  const icon = promo.icon ?? PROMO_ICONS[index % PROMO_ICONS.length]
  return (
    <article className={`relative rounded-2xl bg-white overflow-hidden ${T.shadowSoft} ${T.goldRing} flex flex-col`}>
      <header className="relative bg-[image:var(--mt-green-grad)] text-white px-5 py-4 rounded-b-2xl flex items-center gap-3">
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-[var(--mt-gold)]/80" />
        <span className={`shrink-0 px-3.5 py-1 text-sm font-black text-[#3F3000] ${T.goldBg} [clip-path:polygon(0_0,100%_0,calc(100%-7px)_50%,100%_100%,0_100%,7px_50%)]`}>{promo.badge}</span>
        <h3 className="text-xl @3xl:text-2xl font-black leading-tight">{promo.titleParts ? <Phrases parts={promo.titleParts} /> : promo.title}</h3>
      </header>
      <div className="relative px-5 pt-5 pb-24 text-base @3xl:text-lg leading-relaxed text-[var(--mt-green-dark)] flex-1 min-h-[220px]">
        {promo.body}
        {promo.note && (
          <div className="mt-4 rounded-xl border border-[var(--mt-gold)] bg-[linear-gradient(180deg,#FBF7EA,var(--mt-cream))] px-4 py-2.5 text-sm font-semibold text-[var(--mt-green-dark)] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
            <Phrases parts={promo.note.split(" ")} sep=" " />
          </div>
        )}
      </div>
      {/* ไอคอนลายน้ำใหญ่จาง ๆ + ไอคอนจริง มุมล่างขวา */}
      <div aria-hidden className="absolute -right-6 -bottom-8 text-[var(--mt-green)] opacity-[0.07] [&>svg]:w-40 [&>svg]:h-40">{icon}</div>
      <div className="absolute right-4 bottom-4 text-[var(--mt-gold)] [&>svg]:w-14 [&>svg]:h-14">{icon}</div>
    </article>
  )
}

/** ช่องกรอกแบบเส้นใต้ (ว่าง = เว้นที่ให้เขียนมือ) */
function Field({ value, placeholder }: { value?: string; placeholder: string }) {
  return (
    <p className="mt-1 min-w-[150px] border-b-2 border-[var(--mt-gold)] pb-0.5 text-base font-bold text-[var(--mt-green-dark)]">
      {value || <span className="text-transparent select-none">{placeholder}</span>}
    </p>
  )
}

/** 6. Footer — ช่องติดต่อ + โลโก้ + แถบทองลายเพชรปิดท้าย */
function Footer({ contactPhone, lineId, logoUrl }: { contactPhone?: string; lineId?: string; logoUrl?: string }) {
  return (
    <footer className="mt-8">
      <GoldRule />
      <div className="px-8 py-6 grid gap-6 @3xl:grid-cols-3 items-center">
        <div className="flex items-center gap-3">
          <span className="shrink-0 w-11 h-11 rounded-full bg-[image:var(--mt-green-grad)] text-[var(--mt-gold-light)] grid place-items-center ring-1 ring-[var(--mt-gold)]/70"><Phone className="w-5 h-5" /></span>
          <div>
            <p className="text-xs text-[var(--mt-green-light)]">สอบถาม / นัดดูรถ</p>
            <Field value={contactPhone} placeholder="0XX-XXX-XXXX" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="shrink-0 w-11 h-11 rounded-full bg-[#06C755] text-white grid place-items-center ring-1 ring-[var(--mt-gold)]/50"><MessageCircle className="w-5 h-5" /></span>
          <div>
            <p className="text-xs text-[var(--mt-green-light)]">ติดต่อ LINE</p>
            <Field value={lineId} placeholder="@menatransport" />
          </div>
        </div>
        <div className="@3xl:justify-self-end">
          {/* โลโก้บริษัท (jpg พื้นขาว → วางบนชิปขาวขอบทอง) */}
          <div className={`inline-block rounded-xl bg-white px-4 py-2.5 ${T.shadowSoft} ${T.goldRing}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl || "/partner/mena-logo.jpg"} alt="MENA TRANSPORT" className="h-9 @3xl:h-10 w-auto" />
          </div>
        </div>
      </div>
      <div className={`relative ${T.goldBg} text-center text-[11px] font-bold tracking-[0.28em] text-[#3F3000] py-2.5 pb-4`}>
        <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-[var(--mt-green-dark)]/40" />
        MENA TRANSPORT | USED MIXER TRUCK CATALOG
      </div>
    </footer>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TruckCatalogPoster({
  mode = "fluid",
  scale = 1,
  theme,
  ...data
}: TruckCatalogPosterProps) {
  const truck: TruckCatalog = { ...MOCK_TRUCK, ...data }
  const t = { ...DEFAULT_THEME, ...theme }

  // override โทเคนต่อ instance (ค่าเริ่มต้นอยู่บน :root)
  const vars = {
    "--mt-green-dark": t.greenDark, "--mt-green": t.green, "--mt-green-light": t.greenLight,
    "--mt-gold": t.gold, "--mt-gold-light": t.goldLight, "--mt-cream": t.cream, "--mt-white": t.white,
  } as CSSProperties

  const frame = mode === "fixed"
    ? { width: 1024, minHeight: 1536, transform: `scale(${scale})`, transformOrigin: "top left" }
    : { width: "100%", maxWidth: 1024 }

  return (
    <>
      <style>{ROOT_VARS}</style>
      <div
        data-truck-poster
        style={{ ...vars, ...frame }}
        className={`${T.font} @container relative overflow-hidden bg-[var(--mt-cream)] bg-[image:var(--mt-paper)] text-[var(--mt-green-dark)] print:w-[1024px] print:shadow-none ${mode === "fluid" ? "mx-auto" : ""}`}
      >
        <PosterFrame />
        <Header quote={truck.quote} highlights={truck.highlights} />
        <HeroSection truck={truck} />
        <Gallery items={truck.gallery} />
        {truck.promotions.length > 0 && (
          <>
            <PromoBanner count={Math.min(truck.promotions.length, 3)} />
            <section className="px-8 mt-6 grid gap-4 @3xl:grid-cols-3">
              {truck.promotions.slice(0, 3).map((p, i) => <PromoCard key={p.badge} promo={p} index={i} />)}
            </section>
          </>
        )}
        <Footer contactPhone={truck.contactPhone} lineId={truck.lineId} logoUrl={truck.logoUrl} />
      </div>
    </>
  )
}
