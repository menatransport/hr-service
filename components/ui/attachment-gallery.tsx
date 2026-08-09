"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, FileText, X, ZoomIn } from "lucide-react";

import { useOverlayCount } from "@/components/ui/field";

/**
 * ไฟล์แนบของเคส — รูปย่อ + ดูภาพขยาย
 *
 * มีสองระดับโดยตั้งใจ:
 * 1. **ชี้เมาส์ค้าง** → ป๊อปภาพใหญ่ลอยข้างรูปย่อ ดูผ่าน ๆ ได้โดยไม่ต้องคลิก
 * 2. **คลิก** → เปิดเต็มจอ (มีปุ่มเลื่อนซ้าย/ขวา, ลูกศรคีย์บอร์ด, Esc)
 *
 * ป๊อปเป็น `position: fixed` คำนวณตำแหน่งเอง ไม่ใช่ตัวขยายในสายเอกสาร — รูปย่ออยู่ใน
 * กล่อง `overflow-y-auto` ของ modal อะไรที่ล้นกรอบจะโดนตัด
 */

/** ขนาดกล่องป๊อปที่อยากได้ — ตายตัวเพื่อให้วางตำแหน่งได้ตั้งแต่ก่อนรูปโหลดเสร็จ
    (ถ้าจอเตี้ย/แคบกว่านี้จะถูกย่อลงตามที่ว่างจริงใน `place()`) */
const PEEK_W = 380;
const PEEK_H = 400;
const GAP = 14;
/** ระยะห่างจากปลายเคอร์เซอร์ พอให้ไม่ทับรูปย่อที่กำลังชี้อยู่ */
const CURSOR_GAP = 18;

interface Peek {
  index: number;
  left: number;
  top: number;
  w: number;
  h: number;
}

/**
 * วางกล่องให้เกาะเคอร์เซอร์ — กึ่งกลางตามแนวนอน แล้วเลือกบน/ล่างจากที่ว่างจริง
 *
 * เกณฑ์: ถ้าเมาส์อยู่ครึ่งล่างของจอให้ขึ้นข้างบน ครึ่งบนให้ลงข้างล่าง และถ้าฝั่งที่เลือก
 * ไม่พอก็พลิกไปอีกฝั่ง — ทั้งสองแกนถูกหนีบไว้ในจออีกชั้นจึงไม่มีทางล้นขอบ
 */
function place(x: number, y: number, index: number): Peek {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(PEEK_W, vw - GAP * 2);
  const h = Math.min(PEEK_H, vh - GAP * 2);

  const fitsAbove = y - CURSOR_GAP - h >= GAP;
  const fitsBelow = y + CURSOR_GAP + h <= vh - GAP;
  const above = fitsAbove && (y > vh / 2 || !fitsBelow);

  const rawTop = above ? y - CURSOR_GAP - h : y + CURSOR_GAP;
  return {
    index,
    w,
    h,
    left: Math.min(Math.max(GAP, x - w / 2), vw - GAP - w),
    top: Math.min(Math.max(GAP, rawTop), vh - GAP - h),
  };
}

export function AttachmentGallery({
  urls,
  thumb = 56,
}: {
  urls: string[];
  /** ด้านของรูปย่อเป็น px — desk 56, จอมือถือ 70 */
  thumb?: number;
}) {
  const [peek, setPeek] = useState<Peek | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [broken, setBroken] = useState<string[]>([]);

  const fail = useCallback(
    (url: string) => setBroken((b) => (b.includes(url) ? b : [...b, url])),
    [],
  );

  /* Esc ของภาพเต็มจอต้องไม่ทะลุไปปิด modal ด้วย — นับตัวเองเป็น overlay
     ให้ `isDropdownOpen()` ที่ modal ถามอยู่มองเห็น */
  useOverlayCount(open !== null);

  const close = useCallback(() => setOpen(null), []);
  const step = useCallback(
    (delta: number) =>
      setOpen((i) => (i === null ? i : (i + delta + urls.length) % urls.length)),
    [urls.length],
  );

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
      else return;
      e.stopPropagation();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close, step]);

  /* เลื่อนหน้าจอแล้วรูปย่อขยับ แต่ป๊อปเป็น fixed จะค้างที่เดิม — ปิดทิ้งไปเลย
     (capture เพราะตัวที่เลื่อนคือกล่องเนื้อใน modal ไม่ใช่ window) */
  useEffect(() => {
    if (!peek) return;
    const clear = () => setPeek(null);
    window.addEventListener("scroll", clear, true);
    return () => window.removeEventListener("scroll", clear, true);
  }, [peek]);

  if (!urls.length) return null;

  const current = open === null ? null : urls[open];

  return (
    <>
      <ul className="flex flex-wrap gap-2">
        {urls.map((url, i) => (
          <li key={url}>
            {/* เป็น <a> จริงเพื่อให้คลิกกลาง/Ctrl+คลิก เปิดไฟล์ต้นฉบับได้ตามปกติ
                คลิกซ้ายธรรมดาเท่านั้นที่ถูกดักไปเปิดภาพเต็มจอแทน */}
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              aria-label={`ดูไฟล์แนบที่ ${i + 1} แบบเต็มจอ`}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                setPeek(null);
                setOpen(i);
              }}
              onPointerEnter={(e) => {
                if (e.pointerType !== "mouse") return;
                setPeek(place(e.clientX, e.clientY, i));
              }}
              /* ขยับตามเมาส์ — พลิกบน/ล่างเองเมื่อเข้าใกล้ขอบจอ */
              onPointerMove={(e) => {
                if (e.pointerType !== "mouse") return;
                setPeek(place(e.clientX, e.clientY, i));
              }}
              onPointerLeave={() => setPeek(null)}
              onBlur={() => setPeek(null)}
              className="group relative block overflow-hidden rounded-[10px] border border-line bg-ph-thumb shadow-[0_1px_2px_rgba(21,32,29,0.06)] transition-[border-color,box-shadow] duration-200 hover:border-primary/60 hover:shadow-[0_10px_22px_-12px_rgba(21,32,29,0.5)]"
              style={{ width: thumb, height: thumb }}
            >
              <Thumb url={url} index={i} broken={broken} onError={fail} />

              {/* ฟ้าครอบ + แว่นขยาย บอกว่ากดดูใหญ่ได้ */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 flex items-center justify-center bg-ink/35 text-primary-content opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
              >
                <ZoomIn size={16} strokeWidth={1.9} />
              </span>
            </a>
          </li>
        ))}
      </ul>

      {/* ป๊อปตอนชี้เมาส์ — ไม่รับเมาส์เอง กันกระพริบเวลาเลื่อนผ่าน */}
      {peek ? (
        <div
          aria-hidden
          style={{
            left: peek.left,
            top: peek.top,
            width: peek.w,
            height: peek.h,
          }}
          className="animate-fade-in pointer-events-none fixed z-70 flex flex-col gap-1.5 rounded-[14px] border border-line bg-base-100 p-2 shadow-[0_26px_60px_-20px_rgba(21,32,29,0.55)]"
        >
          <span className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[9px] bg-ph-thumb">
            <Big url={urls[peek.index]} broken={broken} onError={fail} />
          </span>
          <span className="flex-none text-center text-[11px] text-mut">
            คลิกเพื่อดูเต็มจอ
          </span>
        </div>
      ) : null}

      {/* เต็มจอ */}
      {current ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`ไฟล์แนบที่ ${(open ?? 0) + 1} จาก ${urls.length}`}
          className="fixed inset-0 z-70 flex items-center justify-center p-4 sm:p-8"
        >
          <button
            type="button"
            aria-label="ปิดภาพ"
            onClick={close}
            className="absolute inset-0 cursor-default bg-ink/80 backdrop-blur-[3px]"
          />

          <div className="animate-pop-in relative flex max-h-full w-full max-w-[min(1080px,100%)] flex-col items-center gap-3">
            <div className="flex w-full flex-none items-center gap-2">
              <span className="rounded-full bg-base-100/90 px-3 py-1.5 text-[12px] font-medium text-ink shadow-sm">
                ไฟล์แนบที่ {(open ?? 0) + 1} / {urls.length}
              </span>
              <a
                href={current}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-base-100/90 px-3 py-1.5 text-[12px] text-mut shadow-sm transition-colors hover:text-primary"
              >
                เปิดไฟล์ต้นฉบับ
              </a>
              <button
                type="button"
                onClick={close}
                aria-label="ปิด"
                className="ml-auto flex size-9 items-center justify-center rounded-full bg-base-100/90 text-ink shadow-sm transition-colors hover:bg-base-100 hover:text-primary"
              >
                <X size={18} strokeWidth={1.9} aria-hidden />
              </button>
            </div>

            <div className="flex min-h-0 w-full flex-1 items-center justify-center">
              {broken.includes(current) ? (
                <FileFallback url={current} large />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={current}
                  src={current}
                  alt={`ไฟล์แนบที่ ${(open ?? 0) + 1}`}
                  onError={() => fail(current)}
                  className="animate-fade-in max-h-[78dvh] max-w-full rounded-[14px] border border-line bg-base-100 object-contain shadow-[0_30px_70px_-25px_rgba(21,32,29,0.7)]"
                />
              )}
            </div>

            {urls.length > 1 ? (
              <>
                <NavButton side="left" onClick={() => step(-1)} />
                <NavButton side="right" onClick={() => step(1)} />
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------- ชิ้นย่อย */

function Thumb({
  url,
  index,
  broken,
  onError,
}: {
  url: string;
  index: number;
  broken: string[];
  onError: (url: string) => void;
}) {
  if (broken.includes(url))
    return (
      <span className="flex size-full items-center justify-center text-mut">
        <FileText size={18} strokeWidth={1.7} aria-hidden />
      </span>
    );

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={url}
      alt={`ไฟล์แนบที่ ${index + 1}`}
      onError={() => onError(url)}
      className="size-full object-cover transition-transform duration-300 group-hover:scale-108"
    />
  );
}

function Big({
  url,
  broken,
  onError,
}: {
  url: string;
  broken: string[];
  onError: (url: string) => void;
}) {
  if (broken.includes(url)) return <FileFallback url={url} />;

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={url}
      alt=""
      onError={() => onError(url)}
      className="max-h-full max-w-full object-contain"
    />
  );
}

/** ไฟล์ที่เบราว์เซอร์แสดงเป็นรูปไม่ได้ (เช่น PDF) หรือลิงก์เสีย */
function FileFallback({ url, large }: { url: string; large?: boolean }) {
  return (
    <span
      className={`flex flex-col items-center gap-2 text-mut ${
        large
          ? "rounded-[14px] border border-line bg-base-100 px-8 py-10 text-[13px]"
          : "text-[11.5px]"
      }`}
    >
      <FileText size={large ? 30 : 22} strokeWidth={1.6} aria-hidden />
      แสดงตัวอย่างไม่ได้
      {large ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-primary underline underline-offset-2"
        >
          เปิดไฟล์ในแท็บใหม่
        </a>
      ) : null}
    </span>
  );
}

function NavButton({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "ภาพก่อนหน้า" : "ภาพถัดไป"}
      className={`absolute top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-base-100/90 text-ink shadow-lg transition-colors hover:bg-base-100 hover:text-primary ${
        side === "left" ? "left-0 sm:-left-4" : "right-0 sm:-right-4"
      }`}
    >
      <Icon size={20} strokeWidth={1.9} aria-hidden />
    </button>
  );
}
