"use client";

import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";

import {
  CONSENT_ITEMS,
  CONSENT_SUMMARY,
  CONTROLLER,
  hasRequiredConsent,
} from "@/app/recruitment/_lib/consent";

/**
 * ด่านความยินยอม — **ไม่มีช่องกรอกใดปรากฏก่อนผ่านด่านนี้ แม้แต่ชื่อ**
 *
 * พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 ต้องการความยินยอมที่แยกตาม
 * วัตถุประสงค์และไม่ติ๊กมาให้ล่วงหน้า ที่นี่จึงเป็นกล่องติ๊กแยกสามข้อที่เริ่มต้นว่าง
 * ทั้งหมด และข้อมูลอ่อนไหวตาม ม.26 (ประวัติอาชญากรรม · สุขภาพ) อยู่ในข้อของ
 * ตัวเองต่างหาก
 *
 * ปุ่มไปต่อ **ไม่ซ่อนตัวเอง** เมื่อยังติ๊กไม่ครบ แต่เปลี่ยนข้อความไปบอกว่าเหลืออะไร —
 * ปุ่มที่หายไปทำให้ผู้ใช้ไม่รู้ว่าติดตรงไหน ส่วนปุ่มที่กดไม่ได้แต่บอกเหตุผลได้นั้น
 * พาไปต่อได้เอง
 *
 * กติกาว่าติ๊กครบหรือยังอ่านจาก `hasRequiredConsent()` ซึ่งเซิร์ฟเวอร์ใช้ตัวเดียวกัน
 * ตอนรับใบสมัคร — คนที่ยิง API ข้ามหน้าจอนี้ไปจึงไม่ผ่านอยู่ดี
 */

export function ConsentGate({
  granted,
  onToggle,
  onAccept,
}: {
  granted: string[];
  onToggle: (id: string) => void;
  onAccept: () => void;
}) {
  const ready = hasRequiredConsent(granted);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="flex items-center gap-1.5 font-mono text-11 font-semibold tracking-[0.12em] text-primary uppercase">
          <ShieldCheck size={13} strokeWidth={2} aria-hidden />
          ก่อนเริ่มกรอก
        </span>
        <h1 className="text-22 leading-snug font-semibold text-balance">
          ขอความยินยอมใช้ข้อมูลของคุณ
        </h1>
        <p className="text-13-5 leading-relaxed text-mut">
          เราขอเก็บและใช้ข้อมูลของคุณเท่าที่จำเป็นต่อการพิจารณารับเข้าทำงานเท่านั้น
          อ่านสรุปด้านล่างก่อนตัดสินใจได้เลย
        </p>
      </div>

      {/* สรุปสี่บรรทัด อ่านจบใน 10 วินาที — นโยบายฉบับเต็มอยู่ที่ลิงก์ท้ายหน้า */}
      <dl className="overflow-hidden rounded-box border border-line bg-base-100">
        {CONSENT_SUMMARY.map((row) => (
          <div
            key={row.term}
            className="flex gap-3 border-b border-line px-3.5 py-2.5 text-12-5 last:border-b-0"
          >
            <dt className="w-20 flex-none text-mut">{row.term}</dt>
            <dd className="m-0 min-w-0 text-ink">{row.detail}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-2.5">
        {CONSENT_ITEMS.map((item) => {
          const on = granted.includes(item.id);
          return (
            <label
              key={item.id}
              /* `relative` บังคับให้ `<input class="sr-only">` (ซึ่งเป็น
                 `position: absolute`) ยึดกับ label แทนที่จะไปยึดกับกล่องบรรพบุรุษ
                 ที่ไกลออกไป · ถ้าไม่ล็อกไว้ การโฟกัสตอนติ๊กจะเลื่อนกล่องแม่จนเนื้อหา
                 หลุดจอ — อาการจอขาวที่เคยเกิดกับกล่องยินยอมในหน้าแรก
                 (รายละเอียดเต็มอยู่ใน `consent-dialog.tsx`) */
              className={`relative flex cursor-pointer items-start gap-3 rounded-box border p-3.5 transition-colors ${
                on ? "border-primary/50 bg-soft" : "border-line bg-base-100 hover:border-primary/30"
              }`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={on}
                onChange={() => onToggle(item.id)}
              />
              <span
                aria-hidden
                className={`mt-0.5 flex size-5 flex-none items-center justify-center rounded-selector border transition-colors ${
                  on ? "border-primary bg-primary text-primary-content" : "border-line bg-base-100"
                }`}
              >
                {on ? <Check size={12} strokeWidth={3} /> : null}
              </span>

              <span className="flex min-w-0 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-1.5 text-13-5 leading-snug font-medium text-ink">
                  {item.title}
                  <span
                    className={`rounded-selector px-1.5 py-px font-mono text-10 font-semibold ${
                      item.required
                        ? "bg-alert/10 text-alert"
                        : "bg-base-200 text-mut"
                    }`}
                  >
                    {item.required ? "จำเป็น" : "ไม่บังคับ"}
                  </span>
                  {item.sensitive ? (
                    <span className="rounded-selector bg-st-wait px-1.5 py-px font-mono text-10 font-semibold text-st-wait-ink">
                      ข้อมูลอ่อนไหว
                    </span>
                  ) : null}
                </span>
                <span className="text-12 leading-relaxed text-mut">{item.detail}</span>
              </span>
            </label>
          );
        })}
      </div>

      <Link
        href="/recruitment/privacy"
        className="w-fit text-12-5 text-primary hover:underline"
      >
        อ่านนโยบายความเป็นส่วนตัวฉบับเต็ม
      </Link>

      <button
        type="button"
        onClick={onAccept}
        disabled={!ready}
        className="btn-pri py-3.5 text-14 font-semibold disabled:bg-base-300 disabled:text-mut"
      >
        {ready ? "ยินยอมและเริ่มกรอกใบสมัคร" : "ติ๊กข้อที่จำเป็นให้ครบเพื่อไปต่อ"}
      </button>

      <p className="text-center text-11-5 leading-relaxed text-mut">
        ยกเลิกใบสมัครและขอให้ลบข้อมูลได้ทุกเมื่อที่หน้าติดตามสถานะ
        <br />
        หรือติดต่อ {CONTROLLER.dpoEmail}
      </p>
    </div>
  );
}
