import Image from "next/image";
import Link from "next/link";
import { ArrowRight, MapPin, ShieldCheck, Timer } from "lucide-react";

import { ConsentDialog } from "@/app/recruitment/_components/consent-dialog";
import { HeroBackdrop } from "@/app/recruitment/_components/landing/hero-backdrop";
import { Container } from "@/app/recruitment/_components/landing/section-head";
import { FLEET, FOUNDED_BE, yearsInBusiness } from "@/app/recruitment/_lib/company";

/**
 * บล็อกบนสุดของหน้าแรก — ฮีโร่ + แถบตัวเลขกองรถ
 *
 * สองส่วนนี้อยู่ไฟล์เดียวกันเพราะอ่านต่อเนื่องเป็นความคิดเดียว (“เราคือใคร
 * และใหญ่แค่ไหน”) ใช้ข้อมูลชุดเดียวกันจาก `_lib/company.ts` และไม่มีใคร
 * เรียกแยกชิ้น · ภาพพื้นหลังที่สลับเองต้องเป็น client จึงยังแยกเป็น
 * `hero-backdrop.tsx` ไฟล์เดียว — ที่เหลือในนี้เป็น server component ทั้งหมด
 */

/**
 * ฉากแรกของหน้ารับสมัคร — ภาพจริงเต็มจอ + หัวเรื่อง + ปุ่มสมัคร
 *
 * **ภาพเป็นภาพของบริษัทเอง ไม่ใช่ภาพสต็อกรถบรรทุกทั่วไป** — ดึงมาจาก
 * menatransport.co.th โดยตรง และเลือกเฉพาะใบที่เห็นโลโก้ Mena ชัด ๆ
 * คนขับที่เคยเห็นรถคันนี้วิ่งบนถนนจะรู้ทันทีว่ากำลังสมัครกับใคร ซึ่งเป็นสิ่งที่
 * ตัวหนังสือบรรทัดเดียวทำแทนไม่ได้ · ภาพสลับไปเรื่อย ๆ ใน `hero-backdrop.tsx`
 *
 * **ปุ่มสมัครยังอยู่เหนือเส้นพับของจอมือถือ** — ข้อกำหนดเดิมของหน้านี้ที่ยัง
 * ถือไว้ทั้งที่หน้ายาวขึ้นมาก · `min-h-[88svh]` ใช้ `svh` ไม่ใช่ `vh` เพราะ
 * `vh` บนมือถือวัดรวมแถบ URL ที่ยังไม่หด ฮีโร่จึงสูงเกินจอจริงไปหนึ่งแถบ
 * และดันปุ่มตกขอบล่างพอดี — อาการเดิมที่หน้าเวอร์ชันก่อนพยายามเลี่ยง
 *
 * โลโก้บริษัทวางบน **ชิปพื้นขาว** ไม่ใช่วางลอยบนภาพ — ตัวอักษร “Mena” เป็น
 * เขียวเข้มกับแดงเข้ม ซึ่งจมหายไปกับม่านมืดของฮีโร่ถ้าไม่มีพื้นรอง
 * (กติกาเดียวกับ `--color-g-chip` ใน `globals.css`)
 */
export function Hero() {
  const years = yearsInBusiness();

  return (
    <section className="relative isolate flex min-h-[88svh] flex-col overflow-hidden sm:min-h-[660px]">
      {/* ───────────────────────────────────────────────────────── ภาพพื้นหลัง */}
      <HeroBackdrop />
      <div className="hero-shade absolute inset-0 -z-10" aria-hidden />

      {/* ───────────────────────────────────────────────────────── แถบบนสุด */}
      <Container className="pt-safe">
        <div className="flex items-center justify-between gap-4 py-4">
          <span className="inline-flex items-center rounded-full bg-g-chip px-3.5 py-2 shadow-sm">
            <Image
              src="/recruitment/mena-logo.svg"
              alt="มีนาทรานสปอร์ต"
              width={400}
              height={273}
              priority
              className="h-7 w-auto"
            />
          </span>
        </div>
      </Container>

      {/* ───────────────────────────────────────────────────────── เนื้อหา */}
      <Container className="flex flex-1 flex-col justify-end pt-14 pb-10 sm:pt-20 sm:pb-14">
        <div className="max-w-[46rem] animate-lift-in">

          <h1 className="mt-5 text-32 leading-[1.18] font-semibold tracking-tight text-balance text-white sm:text-52">
           ร่วมขับเคลื่อนอนาคตไปกับผู้นำธุรกิจขนส่งของประเทศ
          </h1>

          <p className="mt-5 max-w-[52ch] text-14-5 leading-[1.8] text-pretty text-white/80 sm:text-16">
            บริษัท มีนาทรานสปอร์ต จำกัด (มหาชน) ดูแลกองรถ {FLEET.total} คันทั่วประเทศ
            ให้บริการขนส่งคอนกรีตผสมเสร็จและสินค้าอุตสาหกรรมมาตั้งแต่ปี {FOUNDED_BE}
            {" "}รวมแล้ว {years} ปีบนถนนสายเดียวกับคุณ
          </p>

          {/* ปุ่มหลักและปุ่มรอง — เรียงซ้อนบนมือถือ เพื่อให้ปุ่มสมัครกว้างเต็มนิ้วโป้ง */}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <ConsentDialog
              label="เริ่มกรอกใบสมัคร"
              className="w-full bg-primary px-8 py-4 text-primary-content shadow-lg shadow-black/20 hover:bg-primary/90 sm:w-auto"
            />

            <Link
              href="#how-to-apply"
              className="inline-flex w-full items-center justify-center gap-2 rounded-box border border-white/30 bg-white/5 px-8 py-4 text-15-5 font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/15 sm:w-auto"
            >
              ดูขั้นตอนการสมัคร
              <ArrowRight size={17} strokeWidth={2} aria-hidden />
            </Link>
          </div>

          <p className="mt-4 text-12-5 text-white/60">
            ไม่ต้องสมัครสมาชิก · กรอกจบใน 5 นาที · ถ่ายเอกสารจากมือถือได้เลย
          </p>
        </div>
      </Container>

      {/* ──────────────────────────────────────────── แถบความมั่นใจปิดท้ายฮีโร่ */}
      <div className="border-t border-white/15 bg-black/25 backdrop-blur-sm">
        <Container>
          <ul className="grid grid-cols-1 gap-x-8 gap-y-3 py-4 sm:grid-cols-3">
            {[
              { icon: ShieldCheck, text: "จดทะเบียนในตลาดหลักทรัพย์ฯ · MENA" },
              { icon: MapPin, text: "งานวิ่ง กทม. ปริมณฑล ภูมิภาค และ EEC" },
              { icon: Timer, text: "ใบสมัครออนไลน์" },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2.5 text-white/85">
                <Icon size={16} strokeWidth={1.9} aria-hidden className="flex-none" />
                <span className="text-12-5 leading-snug">{text}</span>
              </li>
            ))}
          </ul>
        </Container>
      </div>
    </section>
  );
}

/**
 * แถบตัวเลขกองรถ — ด่านแรกหลังฮีโร่ ตอบคำถาม “บริษัทนี้ใหญ่แค่ไหน”
 *
 * **ตัวเลขทั้งแถบมาจาก `lib/recruitment/company.ts` ไม่มีตัวไหนพิมพ์ตรงนี้** —
 * เหตุผลและที่มาของแต่ละค่าอยู่ในไฟล์นั้น
 *
 * พื้นเป็นเขียวแบรนด์เข้ม **ไม่ใช่ teal ของระบบ** — นี่คือจุดเดียวของหน้าที่
 * พูดแทนบริษัท (ไม่ใช่แทนระบบสมัครงาน) สีจึงเป็นของบริษัท · ภาพกองรถอยู่
 * ข้างหลังที่ความทึบต่ำมาก ทำหน้าที่เป็นพื้นผิว ไม่ใช่ภาพที่ต้องมองออกว่าคืออะไร
 *
 * ตัวเลขใช้ `font-mono` เพราะเป็นชุดตัวเลขที่ต้องอ่านเทียบกันเป็นแถว — ความกว้าง
 * ตัวเลขเท่ากันทำให้หลักเรียงตรงกันทั้งสี่ช่อง (เหตุผลเดียวกับที่ระบบใช้ mono
 * กับรหัสเคสและรหัสพนักงาน)
 */

const STATS = [
  { value: FLEET.total, unit: "คัน", label: "รถขนส่งทั้งหมด" },
  { value: FLEET.mixer, unit: "คัน", label: "รถมิกเซอร์ผสมคอนกรีต" },
  { value: FLEET.trailer, unit: "คัน", label: "รถเทรลเลอร์และรถบรรทุก" },
] as const;

export function FleetStats() {
  return (
    <section className="relative isolate overflow-hidden bg-brand-deep">
      <Image
        src="/recruitment/concrete-pour.jpg"
        alt=""
        fill
        sizes="100vw"
        className="-z-10 object-cover opacity-[0.14]"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-linear-to-r from-brand-deep via-brand-deep/85 to-brand-deep/60"
      />

      <Container className="py-12 sm:py-16">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-9 sm:grid-cols-4">
          {STATS.map((stat) => (
            <div key={stat.label} className="reveal flex flex-col gap-1.5">
              <dd className="flex items-baseline gap-1.5">
                <span className="font-mono text-34 leading-none font-semibold text-white sm:text-44">
                  {stat.value.toLocaleString("th-TH")}
                </span>
                <span className="text-13 font-medium text-white/60">{stat.unit}</span>
              </dd>
              <dt className="text-12-5 leading-snug text-white/70">{stat.label}</dt>
            </div>
          ))}

          {/* ช่องที่สี่เป็นปี ไม่ใช่จำนวน — หน่วยจึงต่างจากสามช่องแรกโดยตั้งใจ */}
          <div className="reveal flex flex-col gap-1.5">
            <dd className="flex items-baseline gap-1.5">
              <span className="font-mono text-34 leading-none font-semibold text-white sm:text-44">
                {yearsInBusiness()}
              </span>
              <span className="text-13 font-medium text-white/60">ปี</span>
            </dd>
            <dt className="text-12-5 leading-snug text-white/70">
              ให้บริการต่อเนื่องตั้งแต่ พ.ศ. {FOUNDED_BE}
            </dt>
          </div>
        </dl>
      </Container>
    </section>
  );
}
