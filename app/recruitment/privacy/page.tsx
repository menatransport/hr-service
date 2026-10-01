import type { Metadata } from "next";

import { PrivacyPolicy } from "@/app/recruitment/_components/privacy-policy";
import { PublicShell } from "@/app/recruitment/_components/public-shell";
import { CONSENT_VERSION } from "@/app/recruitment/_lib/consent";

/**
 * นโยบายความเป็นส่วนตัวของการรับสมัครงาน
 *
 * **เนื้อหาอยู่ที่ `components/recruitment/privacy-policy.tsx`** เพราะกล่องขอ
 * ความยินยอมก่อนเริ่มกรอกต้องแสดงฉบับเต็มชุดเดียวกันนี้ — ถ้าเขียนแยกกันสองที่
 * วันหนึ่งข้อความบนกล่องติ๊กกับข้อความในนโยบายจะไม่ตรงกัน ซึ่งเท่ากับความยินยอม
 * ที่ผู้สมัครให้ไปนั้นอ้างอิงเอกสารที่เขาไม่เคยเห็น
 *
 * ชื่อนิติบุคคลและช่องทางติดต่อ DPO ยังเป็นค่าตั้งต้น รอข้อความจริงจากฝ่ายบุคคล
 * (ดูหมายเหตุที่ `CONTROLLER`)
 */

export const metadata: Metadata = {
  title: "นโยบายความเป็นส่วนตัว",
  description:
    "การเก็บ ใช้ และเปิดเผยข้อมูลส่วนบุคคลของผู้สมัครงานพนักงานขับรถ",
};

export default function PrivacyPage() {
  return (
    <PublicShell footerNote={`นโยบายฉบับ ${CONSENT_VERSION}`}>
      <article className="mx-auto flex w-full max-w-2xl flex-col gap-7 px-5 py-10">
        <header className="flex flex-col gap-2">
          <span className="font-mono text-11 font-semibold tracking-[0.12em] text-primary uppercase">
            ฉบับ {CONSENT_VERSION}
          </span>
          <h1 className="text-26 leading-snug font-semibold text-balance">
            นโยบายความเป็นส่วนตัวสำหรับผู้สมัครงาน
          </h1>
          <p className="text-13-5 leading-relaxed text-mut">
            เอกสารนี้อธิบายว่าเราเก็บข้อมูลอะไรจากใบสมัครของคุณ เอาไปใช้ทำอะไร
            เก็บไว้นานแค่ไหน และคุณมีสิทธิทำอะไรกับข้อมูลของตัวเองได้บ้าง
            ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562
          </p>
        </header>

        <PrivacyPolicy />
      </article>
    </PublicShell>
  );
}
