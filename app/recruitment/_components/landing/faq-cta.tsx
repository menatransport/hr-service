import Image from "next/image";
import Link from "next/link";
import { ExternalLink, MapPin, Phone, Plus } from "lucide-react";

import { ConsentDialog } from "@/app/recruitment/_components/consent-dialog";
import { Container, SectionHead } from "@/app/recruitment/_components/landing/section-head";
import { CONTACT } from "@/app/recruitment/_lib/company";

/**
 * ท้ายหน้าแรก — คำถามที่พบบ่อย + แถบปิดท้ายพร้อมช่องทางติดต่อ
 *
 * อยู่ไฟล์เดียวกันเพราะทำหน้าที่เดียวกัน: เก็บคนที่ยังลังเลอยู่ให้จบ —
 * FAQ ตอบข้อค้าง ส่วนแถบปิดท้ายให้ทางออกทั้งกดสมัครและโทรหาคน
 */

/**
 * คำถามที่ผู้สมัครถามบ่อย — เขียนด้วย `<details>` ของเบราว์เซอร์ล้วน
 *
 * **ไม่มี `"use client"` และไม่มี state** — accordion ที่เขียนเองด้วย React
 * ต้องส่ง JS ลงไปที่เครื่องผู้ใช้เพื่อทำสิ่งที่แท็กมาตรฐานทำได้อยู่แล้ว และ
 * หน้านี้เปิดจาก 4G ที่ไม่นิ่งเป็นหลัก · ของแถมคือคำตอบทุกข้ออยู่ใน DOM
 * ตั้งแต่แรก เครื่องมือค้นหาในหน้า (Ctrl+F) และ screen reader จึงเจอครบ
 *
 * ทุกคำตอบพูดถึง **พฤติกรรมจริงของระบบ** ไม่ใช่คำตอบกลาง ๆ — “เก็บร่างไว้ให้”
 * คือ `localStorage` ที่ `consent-dialog.tsx` กับ `apply-flow.tsx` ใช้จริง
 * · “ยกเลิกใบสมัครแล้วขอให้ลบข้อมูลได้” คือสิทธิที่หน้านโยบายรับไว้จริง · ถ้าวันหนึ่งพฤติกรรม
 * เหล่านี้เปลี่ยน ข้อความในนี้ต้องเปลี่ยนตาม
 */

const QUESTIONS: { q: string; a: React.ReactNode }[] = [
  {
    q: "ไม่เคยขับรถมิกเซอร์มาก่อน สมัครได้ไหม",
    a: "สมัครได้ ขอแค่มีใบขับขี่ ท.2 ขึ้นไปและพร้อมเรียนรู้ บริษัทมีการอบรมให้ก่อนออกวิ่งจริง ประสบการณ์ขับรถบรรทุกประเภทอื่นถือเป็นข้อได้เปรียบ แต่ไม่ใช่เงื่อนไขบังคับ",
  },
  {
    q: "ต้องเตรียมเอกสารอะไรบ้าง",
    a: "เตรียมใบขับขี่และบัตรประชาชนตัวจริงไว้ถ่ายรูปตอนกรอกใบสมัคร ถ่ายจากกล้องมือถือได้เลย ไม่ต้องสแกนและไม่ต้องปรินต์",
  },
  {
    q: "กรอกไม่จบตอนนี้ กลับมาทำต่อได้ไหม",
    a: "ได้ ระบบเก็บร่างใบสมัครไว้ในเครื่องที่คุณกรอกโดยอัตโนมัติ เปิดหน้าสมัครจากเครื่องเดิมอีกครั้งแล้วกรอกต่อจากข้อที่ค้างไว้ได้เลย แต่ถ้าเปลี่ยนเครื่องหรือล้างข้อมูลเบราว์เซอร์ ร่างจะหายไปและต้องเริ่มใหม่",
  },
  {
    q: "ข้อมูลที่กรอกไปถูกเก็บอย่างไร",
    a: (
      <>
        เก็บตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 เท่าที่จำเป็นต่อการพิจารณารับเข้าทำงาน
        เห็นได้เฉพาะฝ่ายบุคคลและหัวหน้าสายงานที่เกี่ยวข้อง และคุณขอให้ลบได้เองทุกเมื่อ
        รายละเอียดทั้งหมดอยู่ใน{" "}
        <Link href="/recruitment/privacy" className="text-primary underline underline-offset-2">
          นโยบายความเป็นส่วนตัว
        </Link>{" "}
        ซึ่งจะแสดงให้อ่านอีกครั้งก่อนเริ่มกรอก
      </>
    ),
  },
  {
    q: "ส่งใบสมัครแล้วรู้ผลอย่างไร",
    a: (
      <>
        ฝ่ายบุคคลจะติดต่อกลับตามเบอร์ที่กรอกไว้
      </>
    ),
  },
];

export function Faq() {
  return (
    <section className="border-t border-line/70 bg-base-100/60 py-16 sm:py-24">
      <Container className="flex max-w-3xl! flex-col gap-10">
        <SectionHead label="คำถามที่พบบ่อย" align="center" title="เรื่องที่คนสมัครถามมาบ่อยที่สุด" />

        <div className="flex flex-col gap-3">
          {QUESTIONS.map(({ q, a }) => (
            <details
              key={q}
              name="recruit-faq"
              className="reveal group rounded-[14px] border border-line bg-base-100 px-5 open:border-primary/30"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-15 font-medium text-ink [&::-webkit-details-marker]:hidden">
                {q}
                <Plus
                  size={18}
                  strokeWidth={2}
                  aria-hidden
                  className="flex-none text-mut transition-transform duration-200 group-open:rotate-45 group-open:text-primary"
                />
              </summary>
              <p className="pb-5 text-13-5 leading-[1.8] text-pretty text-mut">{a}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}

/**
 * แถบปิดท้าย — ปุ่มสมัครครั้งสุดท้าย และช่องทางติดต่อสำหรับคนที่ยังไม่พร้อมกด
 *
 * **ปุ่มสมัครโผล่สามครั้งในหน้าเดียวโดยตั้งใจ** (ฮีโร่ · กล่องคุณสมบัติ · ตรงนี้)
 * — คนตัดสินใจคนละจุดกัน บางคนกดตั้งแต่เห็นภาพแรก บางคนกดหลังอ่าน FAQ จบ
 * · การบังคับให้คนกลุ่มหลังเลื่อนกลับขึ้นไปหาปุ่มบนสุด คือการเสียใบสมัครฟรี ๆ
 *
 * ใต้ปุ่มมีเบอร์โทรจริงของสำนักงานใหญ่ — สำหรับคนที่พิมพ์บนมือถือไม่ถนัด
 * หรืออยากถามก่อนตัดสินใจ · ป้ายเขียนว่า “สำนักงานใหญ่” ตามความจริง
 * ไม่ใช่ “ฝ่ายบุคคล” (เหตุผลอยู่ที่ `CONTACT` ใน `lib/recruitment/company.ts`)
 */
export function ClosingCta() {
  return (
    <section className="relative isolate overflow-hidden">
      <Image
        src="/recruitment/fleet-highway.webp"
        alt=""
        fill
        sizes="100vw"
        className="-z-20 object-cover object-center"
      />
      <div aria-hidden className="cta-shade absolute inset-0 -z-10" />

      <Container className="flex flex-col items-center gap-7 py-20 text-center sm:py-28">
        <h2 className="max-w-[26ch] text-28 leading-[1.22] font-semibold text-balance text-white sm:text-40">
          ถ้าพร้อมแล้ว ใช้เวลาอีกแค่ 5 นาที
        </h2>

        <p className="max-w-[46ch] text-14-5 leading-[1.8] text-pretty text-white/75">
          กรอกใบสมัครจากมือถือได้เลย ไม่ต้องสมัครสมาชิก ไม่ต้องเตรียมไฟล์
          และไม่ต้องเดินทางมาส่งเอกสารที่สำนักงาน
        </p>

        <div className="flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
          <ConsentDialog
            label="เริ่มกรอกใบสมัคร"
            className="w-full bg-primary px-8 py-4 text-primary-content shadow-lg shadow-black/25 hover:bg-primary/90 sm:w-auto"
          />
        </div>

        {/* ─────────────────────────────────────────────── ช่องทางติดต่อสำรอง */}
        <dl className="mt-6 grid w-full max-w-3xl gap-5 border-t border-white/15 pt-7 text-left sm:grid-cols-3">
          <div className="flex gap-3">
            <Phone size={16} strokeWidth={1.9} aria-hidden className="mt-0.5 flex-none text-white/50" />
            <div className="flex flex-col gap-0.5">
              <dt className="font-mono text-10-5 tracking-[0.14em] text-white/45 uppercase">
                สำนักงานกรุงเทพฯ
              </dt>
              <dd>
                <a
                  href={`tel:${CONTACT.phoneHref}`}
                  className="text-13-5 text-white/85 hover:text-white"
                >
                  {CONTACT.phone}
                </a>
              </dd>
            </div>
          </div>

          <div className="flex gap-3">
            <MapPin size={16} strokeWidth={1.9} aria-hidden className="mt-0.5 flex-none text-white/50" />
            <div className="flex flex-col gap-0.5">
              <dt className="font-mono text-10-5 tracking-[0.14em] text-white/45 uppercase">
                ที่ตั้ง
              </dt>
              <dd className="text-13-5 leading-relaxed text-white/85">{CONTACT.office}</dd>
            </div>
          </div>

          <div className="flex gap-3">
            <ExternalLink
              size={16}
              strokeWidth={1.9}
              aria-hidden
              className="mt-0.5 flex-none text-white/50"
            />
            <div className="flex flex-col gap-0.5">
              <dt className="font-mono text-10-5 tracking-[0.14em] text-white/45 uppercase">
                เว็บไซต์บริษัท
              </dt>
              <dd>
                <a
                  href={CONTACT.website}
                  target="_blank"
                  rel="noreferrer"
                  className="text-13-5 text-white/85 hover:text-white"
                >
                  menatransport.co.th
                </a>
              </dd>
            </div>
          </div>
        </dl>
      </Container>
    </section>
  );
}
