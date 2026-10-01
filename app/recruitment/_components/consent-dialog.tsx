"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowRight, Check, Loader2, ShieldCheck, X } from "lucide-react";

import { PrivacyPolicy } from "@/app/recruitment/_components/privacy-policy";
import {
  CONSENT_ITEMS,
  CONSENT_VERSION,
  CONTROLLER,
  hasRequiredConsent,
} from "@/app/recruitment/_lib/consent";

/**
 * ปุ่ม “เริ่มกรอกใบสมัคร” + กล่องขอความยินยอม PDPA แบบ **ต้องอ่านจนจบก่อน**
 *
 * กล่องนี้แสดง **นโยบายฉบับเต็ม** (ตัวเดียวกับหน้า `/recruitment/privacy`
 * ไม่ใช่สรุปที่เขียนขึ้นใหม่) แล้วกล่องติ๊กยินยอมจะโผล่ก็ต่อเมื่อเลื่อนอ่านถึงท้าย
 * เอกสารแล้วเท่านั้น — เพื่อให้การกดยินยอมเกิดหลังจากที่ผู้สมัคร **ได้เห็นเนื้อหา
 * ทั้งหมดจริง** ไม่ใช่กดผ่านตั้งแต่วินาทีแรก
 *
 * **วัดว่าอ่านจบด้วย `IntersectionObserver` ที่จุดสังเกตท้ายเอกสาร ไม่ใช่คำนวณ
 * `scrollTop` เอง** — เพราะถ้าวันหนึ่งเนื้อหาสั้นลงจนไม่มีแถบเลื่อน การคำนวณ
 * ตำแหน่งจะไม่มีวันถึงเกณฑ์ แล้วผู้สมัครจะติดค้างกดอะไรไม่ได้เลย ส่วนจุดสังเกต
 * จะ “เห็น” ตั้งแต่แรกในกรณีนั้นและปลดล็อกให้เอง
 *
 * ข้อความบนกล่องติ๊ก **กระชับ** เหลือแค่หัวข้อกับป้ายจำเป็น/ไม่บังคับ เพราะราย
 * ละเอียดเต็มอยู่ในเอกสารที่เพิ่งเลื่อนผ่านไปแล้ว การเขียนซ้ำอีกรอบทำให้กล่องยาว
 * โดยไม่ได้เพิ่มข้อมูล
 *
 * **ไม่ติ๊กมาให้ล่วงหน้าสักข้อ** ตามที่ ม.19 บังคับ · ข้อมูลอ่อนไหว ม.26 แยกข้อ
 * ของตัวเอง · ตัวตัดสินว่าครบหรือยังใช้ `hasRequiredConsent()` ตัวเดียวกับที่
 * เซิร์ฟเวอร์ใช้ตอนรับใบสมัคร คนที่ยิง API ตรงข้ามหน้านี้ไปจึงไม่ผ่านอยู่ดี
 *
 * ความยินยอมถูกเขียนลง `localStorage` ก้อนเดียวกับร่างของฟอร์ม แล้วค่อยพาไป
 * `/apply` ซึ่งอ่านเจอว่ายินยอมแล้วจึงข้ามด่านของตัวเองไปเริ่มขั้นแรกเลย
 * (ด่านในนั้นยังอยู่ ไม่ได้ถอดทิ้ง — คนที่เปิด `/apply` ตรงจากบุ๊กมาร์กต้องเจอ
 * ด่านยินยอมอยู่ดี กติกา PDPA ไม่ขึ้นกับว่าเข้ามาทางไหน)
 */

const DRAFT_KEY = "hrs-recruit-draft";

/** เขียนความยินยอมลงร่าง โดย**ไม่ทับคำตอบเดิม**ที่กรอกค้างไว้ */
function saveConsent(granted: string[]): void {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    const draft = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ answers: {}, files: {}, stage: 0, ...draft, granted }),
    );
  } catch {
    /* โหมดส่วนตัวหรือโควตาเต็ม — ยังไปต่อได้ แค่ `/apply` จะถามยินยอมอีกรอบ
       ซึ่งเสียหายน้อยกว่าการค้างอยู่ที่หน้าแรกโดยกดอะไรไม่ได้ */
  }
}

/**
 * หน้า landing เรียกปุ่มนี้ซ้ำสามจุด (ฮีโร่ · ท้ายขั้นตอน · แถบปิดท้าย) ซึ่งอยู่บน
 * พื้นคนละสี — `className` จึงเปิดให้ผู้เรียกกำหนด *ผิว* ของปุ่มได้ ส่วน *พฤติกรรม*
 * (เปิดกล่องยินยอม · เก็บผลลง draft · พาไป `/apply`) ยังรวมศูนย์อยู่ที่นี่ที่เดียว
 * เสมอ — ห้ามก๊อปปุ่มไปวางเองแล้วลิงก์ตรงไป `/apply` เพราะจะข้ามด่าน PDPA
 */
export function ConsentDialog({
  label = "เริ่มกรอกใบสมัคร",
  className = "w-full bg-primary py-4 text-primary-content hover:opacity-90",
}: {
  label?: string;
  className?: string;
} = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [granted, setGranted] = useState<string[]>([]);
  const [going, setGoing] = useState(false);

  function accept() {
    if (!hasRequiredConsent(granted)) return;
    setGoing(true);
    saveConsent(granted);
    router.push("/recruitment/apply");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`group inline-flex items-center justify-center gap-2 rounded-box text-15-5 font-semibold transition-all active:scale-[0.985] ${className}`}
      >
        {label}
        <ArrowRight
          size={17}
          strokeWidth={2}
          aria-hidden
          className="transition-transform duration-200 group-hover:translate-x-0.5"
        />
      </button>

      {open ? (
        <Sheet
          granted={granted}
          going={going}
          onToggle={(id) =>
            setGranted((prev) =>
              prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
            )
          }
          onAccept={accept}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ แผ่นเลื่อน */

function Sheet({
  granted,
  going,
  onToggle,
  onAccept,
  onClose,
}: {
  granted: string[];
  going: boolean;
  onToggle: (id: string) => void;
  onAccept: () => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const consentBlock = useRef<HTMLDivElement>(null);

  /** อ่านถึงท้ายเอกสารแล้วหรือยัง — ปลดล็อกกล่องติ๊ก */
  const [read, setRead] = useState(false);
  /** สัดส่วนที่เลื่อนไปแล้ว 0–1 สำหรับแถบบอกความคืบหน้าการอ่าน */
  const [progress, setProgress] = useState(0);

  const ready = read && hasRequiredConsent(granted);

  /* Esc ปิด · ล็อกไม่ให้หน้าหลังเลื่อน · โฟกัสเข้ากล่อง */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  /* จุดสังเกตท้ายเอกสารโผล่เข้ามาในกรอบเมื่อไหร่ = อ่านจบ · `once` โดยตั้งใจ
     เลื่อนกลับขึ้นไปอ่านซ้ำแล้วไม่ถูกล็อกใหม่ */
  useEffect(() => {
    const target = sentinel.current;
    const root = scroller.current;
    if (!target || !root) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setRead(true);
      },
      { root, rootMargin: "0px 0px -8px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  /**
   * พอปลดล็อก ให้เลื่อนกล่องติ๊กเข้ามาในจอเอง
   *
   * กล่องติ๊กถูกต่อท้ายเอกสาร **ใต้ตำแหน่งที่ผู้ใช้มองอยู่พอดี** — ถ้าไม่เลื่อนให้
   * เขาจะเห็นแค่ท้ายนโยบายกับปุ่มล่างที่เปลี่ยนข้อความเป็น “ติ๊กข้อที่จำเป็นให้ครบ”
   * โดยไม่เห็นว่าต้องไปติ๊กที่ไหน (เจอตอนทดสอบบนจอ 390×844 จริง)
   */
  useEffect(() => {
    if (!read) return;
    consentBlock.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [read]);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    setProgress(max <= 0 ? 1 : Math.min(1, el.scrollTop / max));
  }, []);

  function jumpToEnd() {
    scroller.current?.scrollTo({
      top: scroller.current.scrollHeight,
      behavior: "smooth",
    });
  }

  /* `createPortal` ไป `document.body` เสมอ — หน้าแม่มีกล่องที่ใช้ `animate-lift-in`
     ซึ่งจบแอนิเมชันแล้วยังเหลือ transform ค้าง กล่องนั้นจะกลายเป็น containing block
     ของลูกที่เป็น `position: fixed` แล้วแผ่นนี้จะไปยึดขอบกล่องแทนขอบจอ
     (บทเรียนเดียวกับ `components/ui/modal-shell.tsx`) */
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="ปิด"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/50 backdrop-blur-[2px] animate-fade-in"
      />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="นโยบายความเป็นส่วนตัวและการขอความยินยอม"
        tabIndex={-1}
        /* `overflow-clip` ไม่ใช่ `overflow-hidden` — กล่องที่ `clip` **ไม่เป็น
           scroll container** จึงไม่มีทางถูกเลื่อนด้วยสคริปต์หรือด้วยการโฟกัส
           ลูกที่อยู่นอกกรอบได้เลย · `hidden` ยังเลื่อนได้และเคยทำให้แผ่นทั้งใบ
           กลายเป็นจอขาว (เหตุผลเต็มอยู่ที่ `relative` ของ `<label>` ข้างล่าง)
           การตัดมุมโค้งยังทำงานเหมือนเดิมทุกประการ */
        className="relative flex max-h-[92dvh] w-full flex-col overflow-clip rounded-t-[22px] border border-line bg-base-100 outline-none animate-sheet-up sm:max-w-lg sm:rounded-[20px] sm:animate-pop-in"
      >
        <span
          aria-hidden
          className="mx-auto mt-2.5 h-1 w-10 flex-none rounded-full bg-line sm:hidden"
        />

        {/* ───────────────────────────────────────────────────── หัวกล่อง */}
        <header className="flex flex-none flex-col gap-3 px-5 pt-4 pb-3">
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="flex size-9 flex-none items-center justify-center rounded-field bg-soft text-primary"
            >
              <ShieldCheck size={18} strokeWidth={1.9} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <h2 className="text-16-5 leading-snug font-semibold">
                นโยบายความเป็นส่วนตัว
              </h2>
              <p className="text-12 leading-relaxed text-mut">
                ฉบับ {CONSENT_VERSION} · เลื่อนอ่านจนจบเพื่อให้ความยินยอม
              </p>
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิด"
              className="flex size-8 flex-none items-center justify-center rounded-full text-mut transition-colors hover:bg-base-200 hover:text-ink"
            >
              <X size={17} strokeWidth={1.9} aria-hidden />
            </button>
          </div>

          {/* แถบบอกว่าอ่านไปถึงไหนแล้ว — ตอบคำถาม “อีกไกลไหม” ที่ทำให้คนเลิกอ่าน */}
          <div className="h-1 overflow-hidden rounded-full bg-line">
            <span
              className="block h-full rounded-full bg-primary transition-[width] duration-150"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </header>

        {/* ─────────────────────────────────── เอกสารฉบับเต็ม + กล่องติ๊ก */}
        <div
          ref={scroller}
          onScroll={onScroll}
          className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto border-t border-line px-5 py-4"
        >
          <p className="text-13 leading-relaxed text-mut">
            เอกสารนี้อธิบายว่าเราเก็บข้อมูลอะไรจากใบสมัครของคุณ เอาไปใช้ทำอะไร
            เก็บไว้นานแค่ไหน และคุณมีสิทธิทำอะไรกับข้อมูลของตัวเองได้บ้าง
            ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562
          </p>

          <PrivacyPolicy />

          {/* จุดสังเกต — โผล่เข้ากรอบเมื่อไหร่ถือว่าอ่านจบ */}
          <div ref={sentinel} aria-hidden className="h-px flex-none" />

          {/* กล่องติ๊กอยู่ **ท้ายเอกสาร** ไม่ใช่ในแถบล่างที่ลอยอยู่ตลอด —
              ผู้สมัครจะเจอมันเป็นสิ่งถัดไปที่เห็นพอดีตอนอ่านจบ */}
          {read ? (
            <div
              ref={consentBlock}
              className="flex flex-col gap-2.5 border-t border-line pt-4 animate-lift-in"
            >
              <span className="text-13 font-semibold text-ink">
                ยืนยันความยินยอม
              </span>

              {CONSENT_ITEMS.map((item) => {
                const on = granted.includes(item.id);
                return (
                  <label
                    key={item.id}
                    /**
                     * `relative` ไม่ใช่ของประดับ — **ถอดออกแล้วกล่องจะกลายเป็นจอขาว**
                     *
                     * `<input>` ข้างในใช้ `sr-only` ซึ่งคือ `position: absolute` ·
                     * ถ้า `<label>` ไม่ถูกทำให้เป็น containing block ตัว input จะไป
                     * ยึดกับ **แผ่นทั้งใบ** (`[role="dialog"]`) แทน แล้ววางตัวที่
                     * ตำแหน่ง static ของมันซึ่งอยู่ลึกลงไปในเอกสารที่เลื่อนแล้ว
                     * ~1,970px · พื้นที่ overflow ของแผ่นจึงพองเป็น 2,068px ทั้งที่
                     * แผ่นสูงแค่ 774px — และ `overflow-hidden` **ยังเลื่อนด้วย
                     * สคริปต์ได้** พอผู้ใช้กดติ๊ก เบราว์เซอร์เลื่อนแผ่นลงไปหา
                     * อีลิเมนต์ที่เพิ่งโฟกัส 1,294px หัวกล่อง เนื้อหา และปุ่มจึงหลุด
                     * ออกนอกกรอบพร้อมกัน เหลือกล่องขาวเปล่าที่กดอะไรไม่ได้
                     *
                     * พอ label เป็น containing block เอง input ก็อยู่ในกรอบที่มอง
                     * เห็นอยู่แล้ว ไม่มีอะไรให้เลื่อน (แผ่นยังกันไว้อีกชั้นด้วย
                     * `overflow-clip` ซึ่งไม่เป็น scroll container ตั้งแต่ต้น)
                     */
                    className={`relative flex cursor-pointer items-center gap-3 rounded-box border p-3 transition-colors ${
                      on
                        ? "border-primary/50 bg-soft"
                        : "border-line hover:border-primary/30"
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
                      className={`flex size-5 flex-none items-center justify-center rounded-selector border transition-colors ${
                        on
                          ? "border-primary bg-primary text-primary-content"
                          : "border-line bg-base-100"
                      }`}
                    >
                      {on ? <Check size={12} strokeWidth={3} /> : null}
                    </span>

                    {/* กระชับ — เหลือหัวข้อกับป้าย รายละเอียดเต็มอยู่ในเอกสารด้านบน */}
                    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-13 leading-snug">
                      {item.title}
                      <span
                        className={`rounded-selector px-1.5 py-px text-10 font-semibold ${
                          item.required
                            ? "bg-alert/10 text-alert"
                            : "bg-base-200 text-mut"
                        }`}
                      >
                        {item.required ? "จำเป็น" : "ไม่บังคับ"}
                      </span>
                      {item.sensitive ? (
                        <span className="rounded-selector bg-st-wait px-1.5 py-px text-10 font-semibold text-st-wait-ink">
                          อ่อนไหว
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          ) : null}
        </div>

        {/* ─────────────────────────────────────────────────── แถบปุ่มล่าง */}
        <footer className="flex flex-none flex-col gap-2 border-t border-line px-5 pt-3 pb-safe">
          {read ? (
            <button
              type="button"
              onClick={onAccept}
              disabled={!ready || going}
              className="flex h-13 items-center justify-center gap-2 rounded-box bg-primary text-15 font-semibold text-primary-content transition-all hover:opacity-90 active:scale-[0.985] disabled:bg-base-300 disabled:text-mut"
            >
              {going ? (
                <Loader2
                  size={16}
                  strokeWidth={2.2}
                  aria-hidden
                  className="animate-spin"
                />
              ) : null}
              {ready ? "ยินยอมและเริ่มกรอก" : "ติ๊กข้อที่จำเป็นให้ครบ"}
            </button>
          ) : (
            /* ยังอ่านไม่จบ — ปุ่มพาลงล่างสุดแทนปุ่มยินยอมที่กดไม่ได้
               (ทั้งยังเป็นทางลัดให้คนที่ใช้คีย์บอร์ดหรือ screen reader ไปถึงท้าย
               เอกสารได้โดยไม่ต้องไล่เลื่อนเอง) */
            <button
              type="button"
              onClick={jumpToEnd}
              className="flex h-13 items-center justify-center gap-2 rounded-box border border-line text-14 font-medium text-ink transition-colors hover:border-primary/40 active:bg-base-200"
            >
              <ArrowDown size={16} strokeWidth={1.9} aria-hidden />
              เลื่อนอ่านให้จบก่อน
            </button>
          )}

          <p className="text-center text-11 leading-relaxed text-mut text-pretty">
            ยกเลิกใบสมัครและขอให้ลบข้อมูลได้ทุกเมื่อที่หน้าติดตามสถานะ ·{" "}
            {CONTROLLER.company}
          </p>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
