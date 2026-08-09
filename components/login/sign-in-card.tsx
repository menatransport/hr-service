"use client";

import { useState } from "react";
import { CircleAlert } from "lucide-react";
import { AvatarPlaceholder } from "./avatar-placeholder";
import { GoogleMark } from "./google-mark";

/**
 * สถานะของหน้า login
 *
 * ปุ่มพาไป `GET /api/auth/google` ซึ่งเป็น OAuth ของจริง (ดู `lib/auth/google.ts`)
 * — ทั้งหน้าจะถูกแทนที่ด้วยหน้าเลือกบัญชีของ Google สถานะ `loading` จึงค้างไว้
 * จนกว่าเบราว์เซอร์จะย้ายหน้า ไม่ต้องมีตัวจับเวลาอะไรทั้งนั้น
 *
 * สองสถานะ error มาจากขากลับจริง (`/api/auth/callback/google` เป็นคนเติม
 * `?state=…&reason=…` ให้) และยังเปิดดูตอนรีวิวดีไซน์ได้เหมือนเดิมที่
 * `/?state=error-domain` กับ `/?state=error-network`
 */
export type SignInState = "idle" | "loading" | "error-domain" | "error-network";

const ERROR_COPY = {
  "error-domain": {
    title: "บัญชีนี้เข้าใช้งานไม่ได้",
    detail:
      "ต้องเป็นอีเมลในโดเมน @menatransport.co.th ที่มีบัญชีพนักงานอยู่ในระบบแล้ว — หากใช้อีเมลบริษัทอยู่แล้วแต่ยังเข้าไม่ได้ กรุณาติดต่อฝ่าย IT",
    retry: "ลองใหม่ด้วยบัญชีอื่น",
  },
  "error-network": {
    title: "เชื่อมต่อไม่สำเร็จ",
    detail: "ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง หากยังไม่ได้ กรุณาติดต่อฝ่าย IT",
    retry: "ลองอีกครั้ง",
  },
} as const;

/**
 * ช่องบนบัตรที่ยังว่าง — คือแก่นของดีไซน์นี้ (บัตรประจำตัวที่รอถูกเติมข้อมูล)
 *
 * เป็นภาพประกอบล้วน ไม่ใช่ฟอร์ม จึง `aria-hidden` ทั้งบล็อก — ย่อหน้าเหนือมัน
 * บอกอยู่แล้วว่าเข้าสู่ระบบเพื่อดึงข้อมูลพนักงาน screen reader จึงไม่ต้องฟัง
 * หัวข้อภาษาอังกฤษสามบรรทัดที่ไม่มีค่าอะไรตามหลัง
 */
const BADGE_FIELDS = [
  { label: "EMPLOYEE ID", delay: "[animation-delay:0ms]" },
  { label: "DEPARTMENT", delay: "[animation-delay:160ms]" },
  { label: "ACCESS", delay: "[animation-delay:320ms]" },
] as const;

/** แถบบาร์โค้ดท้ายบัตร — ความกว้างสุ่มไว้ตายตัวเพื่อไม่ให้ SSR/CSR ต่างกัน */
const BARCODE = [
  "w-0.5",
  "w-px",
  "w-[3px]",
  "w-px",
  "w-0.5",
  "w-px",
  "w-[3px]",
  "w-0.5",
  "w-px",
  "w-0.5",
] as const;

/** กล่องที่คลี่ลงมาด้วย grid-rows 0fr → 1fr (ทำงานกับเนื้อหาความสูงไม่แน่นอนได้) */
function Reveal({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`grid transition-[grid-template-rows,margin-top] duration-[220ms] ease-out ${
        open ? "mt-3 grid-rows-[1fr]" : "mt-0 grid-rows-[0fr]"
      }`}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

export function SignInCard({
  initialState = "idle",
  reason,
  next,
}: {
  initialState?: SignInState;
  /** เหตุผลจริงจากขากลับ (`?reason=`) — ใช้แทนข้อความมาตรฐานเมื่อมี */
  reason?: string;
  /** หน้าที่ผู้ใช้ตั้งใจจะเปิดก่อนโดน `middleware.ts` เด้งมา (`?next=`) */
  next?: string;
}) {
  const [state, setState] = useState<SignInState>(initialState);

  const busy = state === "loading";
  const copy =
    state === "error-domain" || state === "error-network" ? ERROR_COPY[state] : null;
  const error = copy && { ...copy, detail: reason?.trim() || copy.detail };

  /**
   * ปุ่มเป็น **ลิงก์จริง** ไปที่ `GET /api/auth/google` ซึ่งตอบ 302 ต่อไปยังหน้า
   * เลือกบัญชีของ Google — ต้องเป็นการย้ายหน้าเต็มใบของเบราว์เซอร์ ไม่ใช่
   * `router.push()` (ปลายทางคนละ origin) และไม่ใช่ `<Link>` (จะโดน prefetch)
   *
   * onClick แค่สลับเป็นสถานะ “กำลังเชื่อมต่อ” ให้บัตรมีชีวิตระหว่างรอเบราว์เซอร์
   * ย้ายหน้า — ไม่ต้อง `preventDefault` อะไรทั้งนั้น
   *
   * ขนมปังปิ้ง “เข้าสู่ระบบสำเร็จ” จึงไปเด้งที่ปลายทางแทน (`WelcomeToast`
   * ใน `/desk`) — กล่องที่ยิงจากหน้านี้จะตายไปพร้อมหน้าที่ถูกแทนที่
   *
   * ส่วนสถานะ error ยังใช้กล่องในบัตรตามเดิม **โดยตั้งใจ** ไม่ย้ายไป SweetAlert
   * เพราะข้อความบอกวิธีแก้ (ใช้อีเมลบริษัท) ต้องอยู่ติดกับปุ่มที่จะกดลองใหม่
   */
  const signInHref = `/api/auth/google${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  const label = busy ? "กำลังเชื่อมต่อ Google…" : (error?.retry ?? "Sign in with Google");

  return (
    <div className="badge-hang w-full max-w-90">
      {/* สายคล้องบัตร — ตัวหนีบกับสายสั้น ๆ พอให้บัตรอ่านว่า “ห้อยอยู่” */}
      <div aria-hidden className="flex flex-col items-center">
        <span className="h-3.5 w-[74px] rounded-full bg-ink/55" />
        <span className="h-4 w-1 rounded-b-sm bg-ink/55" />
      </div>

      {/* ชั้นนอกถือการแกว่ง ชั้นในถือการสะกิดตอน error — คนละ transform กัน */}
      <div
        className={`overflow-hidden rounded-[14px] border border-line bg-base-100 text-ink shadow-[0_1px_2px_rgba(21,32,29,0.04),0_20px_44px_-22px_rgba(21,32,29,0.28)] ${
          initialState === "idle" ? "" : "animate-nudge"
        }`}
      >
        {/**
         * แถบหัวบัตร + รูปพนักงานที่ยังว่าง คร่อมลงมาในเนื้อบัตร
         *
         * ชื่อระบบกับช่องร้อยสายเกาะขอบบน (`items-start`) ไม่ใช่กึ่งกลางแถบ —
         * รูปพนักงานคร่อมอยู่มุมซ้ายล่าง ถ้าจัดกึ่งกลางทั้งคู่ วงรูปจะทับตัวอักษร
         */}
        <div className="relative flex h-21 items-start justify-between overflow-hidden bg-primary px-5.5 pt-5">
          {/* แสงกวาด — อยู่ใต้ตัวอักษรและถูก overflow ของแถบ clip ไว้ */}
          <span
            aria-hidden
            className="badge-shine pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-primary-content/15"
          />
          <span
            lang="en"
            className="relative font-mono text-[11px] tracking-[0.14em] text-primary-content/85"
          >
            HR SERVICE
          </span>
          <span aria-hidden className="relative h-2 w-8.5 rounded-full bg-primary-content/35" />
        </div>

        {/**
         * รูปพนักงานคร่อมรอยต่อแถบหัวบัตร — วางไว้นอก `overflow-hidden` ของแถบ
         * ไม่งั้นครึ่งล่างจะถูกตัดหายไปพร้อมกับแสงกวาด
         */}
        <div
          aria-hidden
          className="login-in relative -mt-9.5 ml-5.5 grid size-18.5 animate-pop-in place-items-center overflow-hidden rounded-full border-[3px] border-base-100 bg-base-200 text-primary [animation-delay:120ms]"
        >
          <AvatarPlaceholder className="size-full" />
        </div>

        <div className="px-5.5 pt-3 pb-6">
          <span
            lang="en"
            className="login-in block animate-fade-in font-mono text-[10px] tracking-[0.16em] text-primary [animation-delay:150ms]"
          >
            WELCOME
          </span>

          <h1 className="login-in mt-1 animate-lift-in text-[21px] leading-[1.35] font-bold [animation-delay:170ms]">
            ยินดีต้อนรับ
          </h1>

          <p className="login-in mt-1.5 animate-lift-in text-[13px] leading-[1.7] text-mut text-pretty [animation-delay:210ms]">
            เข้าสู่ระบบด้วยบัญชีอีเมลบริษัท
          </p>

          <div
            aria-hidden
            className="login-in mt-4.5 flex animate-fade-in flex-col gap-2.5 [animation-delay:250ms]"
          >
            {BADGE_FIELDS.map((field) => (
              <div key={field.label} className="flex items-center gap-3">
                <span
                  lang="en"
                  className="w-24 flex-none font-mono text-[10px] tracking-[0.08em] text-mut/75"
                >
                  {field.label}
                </span>
                {/* ตอนกำลังเชื่อมต่อ เส้นประจะมีเส้นทึบวิ่งเติม — ภาพของ “กำลังกรอกบัตร” */}
                <span className="relative h-3 flex-1 overflow-hidden border-b border-dashed border-line">
                  {busy ? (
                    <span
                      className={`absolute bottom-0 left-0 h-px w-[45%] animate-sweep bg-primary ${field.delay}`}
                    />
                  ) : null}
                </span>
              </div>
            ))}
          </div>

          <div className="login-in mt-5.5 animate-lift-in [animation-delay:290ms]">
            <a
              href={signInHref}
              onClick={() => setState("loading")}
              aria-busy={busy}
              /* ใช้ aria-disabled ไม่ใช่ disabled — โฟกัสจะได้ไม่หลุดจากปุ่มระหว่างรอ */
              aria-disabled={busy}
              className={`group relative cursor-pointer flex h-[50px] w-full items-center justify-center gap-2.5 rounded-selector bg-primary text-[14.5px] font-semibold text-primary-content shadow-[0_1px_2px_rgba(21,32,29,0.10)] transition-[transform,box-shadow] duration-[140ms] ease-out ${
                busy
                  ? "pointer-events-none opacity-95"
                  : "hover:-translate-y-px hover:shadow-[0_6px_16px_-6px_rgba(21,32,29,0.40)] active:translate-y-0 active:scale-[0.985] active:duration-[90ms]"
              }`}
            >
              {/* ทำให้เข้มขึ้นด้วย overlay ไม่ใช่ filter — filter จะทำให้สีโลโก้ Google เพี้ยน */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-selector bg-ink/8 opacity-0 transition-opacity duration-[140ms] group-hover:opacity-100"
              />
              <span className="relative grid size-6 flex-none place-items-center rounded-full bg-g-chip">
                {busy ? (
                  <span className="motion-keep size-3.5 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
                ) : (
                  <GoogleMark className="size-3.5 transition-transform duration-200 group-hover:scale-105" />
                )}
              </span>
              {/* key ทำให้ข้อความเฟดเข้าใหม่ทุกครั้งที่สถานะเปลี่ยน */}
              <span
                key={label}
                className="relative animate-fade-in"
                lang={busy || error ? "th" : "en"}
              >
                {label}
              </span>
            </a>
          </div>

          {/**
           * live region เดียวครอบทั้งคำบรรยาย loading และเนื้อ error — polite เพราะ
           * ทั้งคู่เกิดหลังการกระทำที่ผู้ใช้ตั้งใจ ไม่ได้ขัดจังหวะอะไร
           */}
          <div role="status" aria-live="polite" aria-atomic="true">
            <Reveal open={busy}>
              <div className="h-[3px] overflow-hidden rounded-full bg-line" aria-hidden>
                <div className="progress-sweep h-full w-[40%] animate-sweep rounded-full bg-primary" />
              </div>
              <p className="mt-2.5 text-[12px] text-mut">กำลังดึงข้อมูลพนักงานของคุณ</p>
            </Reveal>

            <Reveal open={Boolean(error)}>
              {error ? (
                <div className="flex items-start gap-2.5 rounded-[10px] border border-alert/25 bg-alert/8 px-3.5 py-3 text-left">
                  <CircleAlert
                    size={16}
                    strokeWidth={1.8}
                    className="mt-0.5 flex-none text-alert"
                    aria-hidden
                  />
                  <div>
                    <p className="text-[13px] font-semibold text-alert">{error.title}</p>
                    <p className="mt-1 text-[12.5px] leading-[1.6] text-mut text-pretty">
                      {error.detail}
                    </p>
                  </div>
                </div>
              ) : null}
            </Reveal>
          </div>
        </div>

        <div className="login-in flex animate-fade-in items-center justify-between gap-3 border-t border-dashed border-line bg-base-200 px-5.5 py-3.5 [animation-delay:330ms]">
          <span className="text-[11px] text-mut">
            เฉพาะ <span className="font-semibold text-primary">@menatransport.co.th</span>
          </span>
          <span aria-hidden className="flex h-4.5 items-end gap-0.5">
            {BARCODE.map((width, index) => (
              <i key={index} className={`block h-full bg-ink ${width}`} />
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}
