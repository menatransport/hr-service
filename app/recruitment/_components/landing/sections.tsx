import Image from "next/image";
import Link from "next/link";
import {
  CalendarCheck,
  Check,
  GraduationCap,
  HeartHandshake,
  MapPinned,
  ShieldCheck,
} from "lucide-react";

import { ConsentDialog } from "@/app/recruitment/_components/consent-dialog";
import { Mascot } from "@/app/recruitment/_components/mascot";
import { Container, SectionHead } from "@/app/recruitment/_components/landing/section-head";
import { FLEET } from "@/app/recruitment/_lib/company";

/**
 * ส่วนกลางของหน้าแรก — ทำไมต้องมีนา · ขับรถอะไร · สมัครยังไง
 *
 * สามส่วนนี้คือคำถามที่คนขับถามต่อกันเป็นลำดับก่อนตัดสินใจ จึงถูกยุบมาอยู่
 * ไฟล์เดียว · แต่ละตัวถูกเรียกจาก `app/recruitment/page.tsx` ที่เดียวเท่านั้น
 * การแยกเป็นไฟล์ละส่วนเลยได้แค่ทำให้ต้องเปิดหลายแท็บเวลาแก้ถ้อยคำ
 */

/**
 * “ทำไมต้องมีนา” — เหตุผลที่คนขับหนึ่งคนจะเลือกที่นี่แทนที่อื่น
 *
 * **ทุกข้อในนี้อ้างอิงสิ่งที่บริษัทประกาศไว้เองบนหน้าภาพรวมองค์กร** ไม่ใช่
 * คำโฆษณาที่แต่งขึ้นให้ฟังดูดี — “งานรองรับตลอดทั้งปี” “โซน EEC”
 * “หน่วยงานรับเรื่องร้องทุกข์” “ปฏิญาณตน 10–5–1” เป็นถ้อยคำของบริษัทเอง
 * · ข้อที่บริษัทไม่เคยพูด (เงินเดือน สวัสดิการรายข้อ รถใหม่) **ไม่อยู่ในนี้**
 * เพราะผู้สมัครที่มาถึงวันสัมภาษณ์แล้วพบว่าไม่ตรง คือความเสียหายที่แพงกว่า
 * ใบสมัครที่ไม่ได้มา
 *
 * จัดเป็นสองคอลัมน์บนจอใหญ่ — ภาพซ้าย เหตุผลขวา · บนมือถือภาพขึ้นก่อน
 * เพราะภาพคนจริงยิ้มอยู่ทำงานให้หัวข้อนี้ได้มากกว่าหัวเรื่องหนึ่งบรรทัด
 */

const REASONS = [
  {
    icon: CalendarCheck,
    title: "มีงานวิ่งตลอดทั้งปี",
    detail:
      "บริษัทบริหารรอบรถและปริมาณงานต่อคันต่อเดือนเป็นตัวชี้วัด รถมิกเซอร์และรถเทรลเลอร์จึงมีงานรองรับต่อเนื่อง ไม่ใช่วิ่งบ้างจอดบ้างตามฤดู",
  },
  {
    icon: MapPinned,
    title: "โซนงานที่กำลังโต",
    detail:
      "วางรถในโซนที่ใช้คอนกรีตและปูนซีเมนต์สม่ำเสมอ ทั้งกรุงเทพฯ ปริมณฑล ภูมิภาค และเขตพัฒนาพิเศษภาคตะวันออก (EEC)",
  },
  {
    icon: ShieldCheck,
    title: "ความปลอดภัยเป็นวินัยร่วม",
    detail:
      "พนักงานจัดส่งทุกคนยึดหลักปฏิญาณตน 10–5–1 และแนวทางพนักงานจัดส่งจิตอาสา มุ่งบริการด้วยรอยยิ้มและความปลอดภัย",
  },
  {
    icon: HeartHandshake,
    title: "มีที่ให้พูดเมื่อมีปัญหา",
    detail:
      "บริษัทตั้งหน่วยงานรับเรื่องร้องทุกข์ไว้โดยเฉพาะ และนำปัญหาที่พนักงานเจอมากำหนดแนวทางแก้ไข ไม่ใช่รับเรื่องแล้วจบ",
  },
  {
    icon: GraduationCap,
    title: "ไม่เคยขับมิกเซอร์ก็สมัครได้",
    detail:
      "ขอแค่มีใบขับขี่ ท.2 ขึ้นไปและพร้อมเรียนรู้ ส่วนการขับรถผสมคอนกรีตมีการอบรมให้ก่อนออกวิ่งจริง",
  },
] as const;

export function WhyMena() {
  return (
    <section className="py-16 sm:py-24">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1fr)] lg:gap-16">
          {/* ───────────────────────────────────────────── ภาพ + คำพูดของบริษัท */}
          <div className="reveal flex flex-col gap-5">
            <div className="relative aspect-4/3 overflow-hidden rounded-[18px] ring-1 ring-line">
              <Image
                src="/recruitment/team.webp"
                alt="ทีมงานมีนาทรานสปอร์ตที่หน้างาน"
                fill
                sizes="(min-width: 1024px) 44vw, 100vw"
                className="object-cover"
              />
            </div>

            {/* คำพูดยกมาจากหน้าภาพรวมองค์กรแบบไม่ตัดต่อความหมาย */}
            <figure className="rounded-[18px] border border-line bg-base-100 p-6">
              <blockquote className="text-15 leading-[1.8] text-pretty text-ink">
                “ยกระดับภาพลักษณ์ของผู้ประกอบอาชีพขับรถ เพื่อให้พนักงานได้มีความภาคภูมิใจในตนเอง
                และเป็นตัวอย่างที่ดีให้แก่ลูกหลานและคนในครอบครัว”
              </blockquote>
              <figcaption className="mt-3 font-mono text-11 tracking-[0.14em] text-mut uppercase">
                ค่านิยมองค์กร · มีนาทรานสปอร์ต
              </figcaption>
            </figure>
          </div>

          {/* ─────────────────────────────────────────────────────── เหตุผล */}
          <div className="flex flex-col gap-8">
            <SectionHead
              label="ทำไมต้องมีนา"
              title="ที่นี่ไม่ได้มองคนขับเป็นแค่คนที่พารถไปถึงที่หมาย"
              lead="บริษัทก่อตั้งจากรถพ่วง 12 คันกับรถสิบล้อ 30 คัน จนวันนี้มีกองรถหลายร้อยคัน สิ่งที่ไม่เปลี่ยนคือคนขับยังเป็นคนที่ลูกค้าเห็นเป็นคนแรกและคนสุดท้ายของทุกงาน"
            />

            <ul className="flex flex-col gap-1">
              {REASONS.map(({ icon: Icon, title, detail }) => (
                <li
                  key={title}
                  className="reveal flex gap-4 rounded-[14px] p-4 transition-colors hover:bg-base-100"
                >
                  <span className="mt-0.5 flex size-10 flex-none items-center justify-center rounded-[12px] bg-soft text-primary">
                    <Icon size={19} strokeWidth={1.8} aria-hidden />
                  </span>
                  <div className="flex flex-col gap-1">
                    <h3 className="text-15 font-semibold text-ink">{title}</h3>
                    <p className="text-13-5 leading-[1.7] text-pretty text-mut">{detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </section>
  );
}

/**
 * “งานที่คุณจะได้ขับ” — สามสายงานขนส่งของบริษัท พร้อมภาพรถจริงของแต่ละสาย
 *
 * **ตั้งใจไม่เรียกว่า “ตำแหน่งที่เปิดรับ”** — ระบบรับสมัครนี้มีใบสมัครใบเดียว
 * ไม่ได้แยกประกาศรายตำแหน่งที่มีจำนวนอัตราและวันปิดรับของตัวเอง · ถ้าพาดหัวว่า
 * เปิดรับตำแหน่งไหนบ้าง ผู้สมัครจะมองหาปุ่ม “สมัครตำแหน่งนี้” ที่ไม่มีอยู่จริง
 * แล้วออกจากหน้าไปทั้งที่ปุ่มสมัครใบเดียวอยู่ตรงหน้า · หัวข้อนี้จึงอธิบาย
 * *ลักษณะงาน* ให้ผู้สมัครประเมินตัวเองได้ แล้วส่งทุกคนไปที่ใบสมัครเดียวกัน
 *
 * ภาพทั้งสามใบเป็นรถของบริษัทจากเว็บไซต์บริษัทเอง ไม่ใช่ภาพสต็อก
 */

const LINES = [
  {
    image: "/recruitment/truck-mixer.jpg",
    alt: "รถมิกเซอร์ผสมคอนกรีตของมีนาทรานสปอร์ต",
    title: "รถมิกเซอร์ผสมคอนกรีต",
    meta: `${FLEET.mixer} คันในกองรถ`,
    detail:
      "ส่งคอนกรีตผสมเสร็จให้บริษัทปูนซีเมนต์และคอนกรีตชั้นนำของประเทศ เป็นงานเป็นรอบในโซนที่รับผิดชอบ สายงานที่บริษัทเชี่ยวชาญที่สุดและมีรถมากที่สุด",
  },
  {
    image: "/recruitment/truck-trailer.jpg",
    alt: "รถเทรลเลอร์ของมีนาทรานสปอร์ต",
    title: "รถเทรลเลอร์ 18 ล้อ",
    meta: "วิ่งทั่วประเทศ · ข้ามชายแดน",
    detail:
      "ขนส่งสินค้าอุตสาหกรรมและผลิตภัณฑ์ทั่วประเทศไทย รวมถึงงานข้ามชายแดนประเทศลาวและกัมพูชา เหมาะกับคนที่ชอบงานวิ่งระยะไกล",
  },
  {
    image: "/recruitment/fleet-lineup.jpg",
    alt: "กองรถบรรทุกหลากหลายประเภทของมีนาทรานสปอร์ต",
    title: "รถบรรทุก 4–10 ล้อ และรถควบคุมอุณหภูมิ",
    meta: "สินค้าอุปโภคบริโภคและสินค้าเฉพาะทาง",
    detail:
      "กลุ่มงานที่บริษัทขยายต่อเนื่อง ทั้งรถบรรทุก 4 ล้อจัมโบ้ รถ 10 ล้อ และรถควบคุมอุณหภูมิที่เริ่มให้บริการตั้งแต่ปี 2565",
  },
] as const;

export function WhatYouDrive() {
  return (
    <section className="border-y border-line/70 bg-base-100/60 py-16 sm:py-24">
      <Container className="flex flex-col gap-10 sm:gap-14">
        <SectionHead
          label="ลักษณะงาน"
          align="center"
          title="งานที่คุณจะได้ขับ"
          lead="บริษัทมีสามสายงานขนส่งหลัก ทุกสายใช้ใบสมัครใบเดียวกัน — เลือกความถนัดของคุณไว้ในใบสมัคร แล้วฝ่ายบุคคลจะจัดสายงานที่เหมาะกับประสบการณ์และโซนที่คุณสะดวก"
        />

        <ul className="grid gap-6 md:grid-cols-3">
          {LINES.map((line) => (
            <li
              key={line.title}
              className="reveal group flex flex-col overflow-hidden rounded-[18px] border border-line bg-base-100 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-24px_rgba(21,32,29,0.45)]"
            >
              <div className="relative aspect-16/10 overflow-hidden">
                <Image
                  src={line.image}
                  alt={line.alt}
                  fill
                  sizes="(min-width: 768px) 33vw, 100vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
              </div>

              <div className="flex flex-1 flex-col gap-2.5 p-6">
                <span className="font-mono text-10-5 tracking-[0.14em] text-primary uppercase">
                  {line.meta}
                </span>
                <h3 className="text-17 leading-snug font-semibold text-balance text-ink">
                  {line.title}
                </h3>
                <p className="text-13-5 leading-[1.7] text-pretty text-mut">{line.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

/**
 * ขั้นตอนการสมัครสี่ขั้น + คุณสมบัติที่ต้องมี — ส่วนที่ปุ่มในฮีโร่ลิงก์ลงมาหา
 * (`id="how-to-apply"` · ลิงก์ในฮีโร่ใช้ anchor ธรรมดา ไม่ใช่ JS เพราะ
 * `scroll-behavior: smooth` ถูกตั้งไว้ที่ `html` ใน `globals.css` อยู่แล้ว)
 *
 * **บอกจำนวนขั้นล่วงหน้าเป็นตัวเลข** — คนที่ลังเลว่าจะเริ่มกรอกดีไหม กลัว
 * “กรอกไปเรื่อย ๆ ไม่รู้จบ” มากกว่ากลัวว่าจะยาก · การเห็นว่ามีสี่ขั้นและขั้น
 * สุดท้ายคือรอสาย ทำให้ตัดสินใจกดได้โดยไม่ต้องเดา
 *
 * **มาสคอต “น้องมิกซ์” ย้ายมาอยู่ตรงนี้ ไม่ได้ถูกถอดทิ้ง** — ในหน้าเวอร์ชันเดิม
 * มันคือภาพเดียวของหน้าจึงเหมาะที่จะอยู่บนสุด · พอหน้านี้มีภาพถ่ายรถจริงของ
 * บริษัทเป็นฉากแรกแล้ว การ์ตูนบนฮีโร่จะแย่งน้ำหนักกับภาพจริงและทำให้ทั้งหน้า
 * ดูเป็นเว็บคนละระดับกับบริษัทในตลาดหลักทรัพย์ฯ · แต่ตรงกล่อง “คุณสมบัติ”
 * ซึ่งเป็นจุดที่ผู้สมัครกำลังกลัวว่าตัวเองจะไม่ผ่าน มันทำงานได้ดีที่สุด
 */

const STEPS = [
  {
    title: "อ่านนโยบายแล้วให้ความยินยอม",
    detail:
      "กดปุ่มสมัคร ระบบจะแสดงนโยบายความเป็นส่วนตัวฉบับเต็มให้อ่านก่อน แล้วค่อยติ๊กยินยอมทีละข้อ ไม่มีข้อไหนติ๊กมาให้ล่วงหน้า",
  },
  {
    title: "กรอกใบสมัครจากมือถือ",
    detail:
      "ใช้เวลาประมาณ 5 นาที กรอกไม่จบก็ปิดไปก่อนได้ ระบบเก็บร่างไว้ในเครื่องให้ กลับมาเปิดจากเครื่องเดิมแล้วกรอกต่อจากข้อที่ค้างไว้",
  },
  {
    title: "ถ่ายรูปเอกสารประจำตัว",
    detail:
      "ใบขับขี่และบัตรประชาชน ถ่ายจากกล้องมือถือได้เลย ไม่ต้องหาที่สแกนหรือปรินต์",
  },
  {
    title: "รอฝ่ายบุคคลติดต่อกลับ",
    detail:
      "ระหว่างรอ เปิดหน้าติดตามสถานะดูได้ตลอดว่าใบสมัครถึงขั้นไหนแล้ว ไม่ต้องโทรถาม",
  },
] as const;

const REQUIREMENTS = [
  "มีใบขับขี่ ท.2 ขึ้นไป",
  "มีบัตรประชาชนและใบขับขี่ตัวจริงไว้ถ่ายรูป",
  "พร้อมเข้ารับการอบรมก่อนออกวิ่งจริง",
  "ยินยอมให้บริษัทตรวจสอบข้อมูลเพื่อพิจารณารับเข้าทำงาน",
] as const;

export function HowToApply() {
  return (
    <section id="how-to-apply" className="scroll-mt-4 py-16 sm:py-24">
      <Container className="flex flex-col justify-center items-center gap-10 sm:gap-14">
        <SectionHead
          label="ขั้นตอนการสมัคร"
          title="สี่ขั้น จบได้จากมือถือเครื่องเดียว"
          lead="ไม่ต้องสมัครสมาชิก ไม่ต้องเตรียมไฟล์ ไม่ต้องเดินทางมาส่งใบสมัคร"
        />

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.78fr)] lg:gap-14">
          {/* ──────────────────────────────────────────────────── สี่ขั้นตอน */}
          <ol className="flex flex-col">
            {STEPS.map((step, i) => (
              <li key={step.title} className="reveal relative flex gap-5 pb-8 last:pb-0">
                {/* เส้นต่อระหว่างขั้น — ขั้นสุดท้ายไม่มี เพราะไม่มีอะไรต่อจากมัน */}
                {i < STEPS.length - 1 ? (
                  <span
                    aria-hidden
                    className="absolute top-11 bottom-2 left-[19px] w-px bg-line"
                  />
                ) : null}

                <span className="relative z-10 flex size-10 flex-none items-center justify-center rounded-full border border-line bg-base-100 font-mono text-14 font-semibold text-primary">
                  {i + 1}
                </span>

                <div className="flex flex-col gap-1.5 pt-1.5">
                  <h3 className="text-15-5 font-semibold text-ink">{step.title}</h3>
                  <p className="max-w-[52ch] text-13-5 leading-[1.75] text-pretty text-mut">
                    {step.detail}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}
