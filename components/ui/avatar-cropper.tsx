"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Minus, Plus, TriangleAlert } from "lucide-react";

import { RangeField } from "@/components/ui/field";

/**
 * กล่องครอปรูปโปรไฟล์เป็น **วงกลม** แบบเดียวกับตอนเปลี่ยนรูปบัญชี Google
 *
 * ทำไมต้องครอป: `Avatar` ทั้งระบบเป็นวงกลม ถ้าปล่อยให้ `object-cover` ตัดเอง
 * รูปแนวนอนจะโดนตัดกลางภาพเสมอ — หัวคนหลุดกรอบเป็นเรื่องปกติ · ให้ผู้ใช้เลือก
 * เองว่าจะเอาส่วนไหนเข้าวงกลม แล้วส่งออกเป็นรูป **สี่เหลี่ยมจัตุรัส** ซึ่งพอเอาไป
 * ใส่ในวงกลมที่ไหนก็ได้ผลเดียวกันทุกที่ (ตัวไฟล์ไม่ได้เป็นวงกลมจริง — เก็บเป็น
 * จัตุรัสไว้ดีกว่า เพราะ JPEG ไม่มีช่องโปร่งใส และมุมโปร่งจะกลายเป็นดำ)
 *
 * เลื่อนรูปด้วยการลาก · ซูมด้วยแถบเลื่อน ปุ่ม +/− หรือหมุนล้อเมาส์
 * รูปถูกบังคับให้คลุมวงกลมเสมอ (clamp ทั้งสองแกน) จึงไม่มีทางเห็นขอบว่าง
 */

/** ด้านของรูปที่ส่งออก — 512 พอสำหรับ avatar ทุกขนาดในระบบ แม้จอ retina */
const OUT_SIZE = 512;

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

/** ด้านของช่องมองในกล่อง (px) — ต้องตรงกับคลาส `size-72` ด้านล่าง */
const VIEWPORT = 288;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface Placement {
  /** ขนาดจริงของรูปที่วาดอยู่ (px) */
  width: number;
  height: number;
  /** มุมซ้ายบนของรูป เทียบกับมุมซ้ายบนของช่องมอง (px, ค่าติดลบ) */
  x: number;
  y: number;
}

export function AvatarCropper({
  file,
  busy,
  error,
  onCancel,
  onSave,
}: {
  /** ไฟล์ที่ผู้ใช้เพิ่งเลือก — กล่องนี้ mount ใหม่ทุกครั้งที่เลือกไฟล์ใหม่ */
  file: File;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  /** ได้รูปจัตุรัสที่ครอปแล้ว พร้อมอัปโหลด */
  onSave: (cropped: File) => void;
}) {
  /** รูปที่ถอดรหัสแล้ว คู่กับ object URL ของมัน — เก็บคู่กันเพื่อคืน URL ให้ถูกใบ */
  const [source, setSource] = useState<{
    img: HTMLImageElement;
    url: string;
  } | null>(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [decodeFailed, setDecodeFailed] = useState(false);

  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);

  const image = source?.img ?? null;

  /** อัตราส่วนที่ทำให้รูปคลุมช่องมองพอดีตอน zoom = 1 */
  const baseScale = image
    ? Math.max(VIEWPORT / image.naturalWidth, VIEWPORT / image.naturalHeight)
    : 1;

  const place = useCallback(
    (nextZoom: number, nextOffset: { x: number; y: number }): Placement => {
      if (!image) return { width: VIEWPORT, height: VIEWPORT, x: 0, y: 0 };
      const scale = baseScale * nextZoom;
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      return {
        width,
        height,
        // รูปต้องคลุมช่องมองเสมอ — มุมซ้ายบนจึงอยู่ระหว่าง (V - ขนาดรูป) ถึง 0
        x: clamp(nextOffset.x, VIEWPORT - width, 0),
        y: clamp(nextOffset.y, VIEWPORT - height, 0),
      };
    },
    [image, baseScale],
  );

  /**
   * โหลดรูปเข้าหน่วยความจำครั้งเดียว แล้ววางให้อยู่กึ่งกลางเป็นค่าเริ่มต้น
   *
   * **effect นี้ไม่ `revokeObjectURL` ของรูปที่ใช้อยู่** — React Strict Mode ตอน
   * dev รัน effect สองรอบ (mount → cleanup → mount) ถ้า cleanup คืน URL ทิ้งเลย
   * รูปที่เพิ่ง render ไปแล้วจะพังกลางคัน (`ERR_FILE_NOT_FOUND` ใน console
   * และรูปแวบหาย) หรือไม่ก็ `onerror` ยิงจนขึ้น “เปิดไฟล์รูปนี้ไม่ได้”
   * ทั้งที่ไฟล์ปกติ — เจอทั้งสองอาการจริงตอนทดสอบด้วยเบราว์เซอร์ (7 ส.ค. 2026)
   *
   * คืน URL สองทางแทน: รอบที่ถูกยกเลิกก่อนโหลดเสร็จคืนทันทีตรงนั้น ส่วนรอบที่
   * ถูกใช้จริงคืนใน effect ข้างล่าง ซึ่งทำงาน **หลัง** จอ render รูปใหม่แล้ว
   */
  useEffect(() => {
    let cancelled = false;
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      if (cancelled) {
        URL.revokeObjectURL(url);
        return;
      }
      const scale = Math.max(
        VIEWPORT / img.naturalWidth,
        VIEWPORT / img.naturalHeight,
      );
      setSource({ img, url });
      setDecodeFailed(false);
      setZoom(MIN_ZOOM);
      setOffset({
        x: (VIEWPORT - img.naturalWidth * scale) / 2,
        y: (VIEWPORT - img.naturalHeight * scale) / 2,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      if (!cancelled) setDecodeFailed(true);
    };
    img.src = url;

    return () => {
      cancelled = true;
    };
  }, [file]);

  /* คืน object URL ของรูปก่อนหน้าเมื่อถูกแทนที่ หรือตอนปิดกล่อง — ไม่ก่อนนั้น */
  useEffect(() => {
    if (!source) return;
    return () => URL.revokeObjectURL(source.url);
  }, [source]);

  /* Esc ปิดกล่อง + ล็อกการเลื่อนหน้าไว้ระหว่างเปิด (เหมือน modal อื่นในระบบ) */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [busy, onCancel]);

  useEffect(() => {
    box.current?.focus({ preventScroll: true });
  }, []);

  /** ซูมโดยตรึงจุดกึ่งกลางวงกลมไว้ที่เดิม ไม่งั้นรูปจะไหลออกนอกกรอบตอนซูม */
  function zoomTo(next: number) {
    const value = clamp(next, MIN_ZOOM, MAX_ZOOM);
    if (!image) {
      setZoom(value);
      return;
    }
    const current = place(zoom, offset);
    const ratio = value / zoom;
    setOffset({
      x: VIEWPORT / 2 - (VIEWPORT / 2 - current.x) * ratio,
      y: VIEWPORT / 2 - (VIEWPORT / 2 - current.y) * ratio,
    });
    setZoom(value);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (busy || !image) return;
    const current = place(zoom, offset);
    drag.current = { id: e.pointerId, x: e.clientX - current.x, y: e.clientY - current.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start || start.id !== e.pointerId) return;
    setOffset({ x: e.clientX - start.x, y: e.clientY - start.y });
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    // เก็บค่าที่ clamp แล้วกลับเข้า state — ไม่งั้นการลากครั้งถัดไปเริ่มจากค่าเกินขอบ
    setOffset(place(zoom, offset));
  }

  async function save() {
    if (!image || busy) return;
    const current = place(zoom, offset);
    const scale = current.width / image.naturalWidth;

    const canvas = document.createElement("canvas");
    canvas.width = OUT_SIZE;
    canvas.height = OUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // ถมขาวก่อน — JPEG ไม่มีช่องอัลฟา ส่วนโปร่งของ PNG จะกลายเป็นดำ
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, OUT_SIZE, OUT_SIZE);
    ctx.drawImage(
      image,
      -current.x / scale,
      -current.y / scale,
      VIEWPORT / scale,
      VIEWPORT / scale,
      0,
      0,
      OUT_SIZE,
      OUT_SIZE,
    );

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9),
    );
    if (!blob) return;
    onSave(new File([blob], "avatar.jpg", { type: "image/jpeg" }));
  }

  const current = place(zoom, offset);

  /**
   * ⚠️ ต้อง portal ไปที่ `document.body` เสมอ — **ห้าม render อยู่กับที่**
   *
   * บัตรพนักงานที่เรียกกล่องนี้อยู่ใต้ `.badge-hang` และ `.animate-pop-in`
   * ซึ่งมี animation บน `transform` (fill mode `both`) เบราว์เซอร์จึงถือว่า
   * สองชั้นนั้นเป็น **containing block ของ `position: fixed`** และเป็น
   * stacking context ด้วย · ผลคือกล่องที่ควรเต็มจอถูกบีบให้เท่าบัตรกว้าง 320px
   * และท้ายบัตรลอยทับปุ่ม “บันทึกรูป” จนกดไม่ได้ (เจอจริงตอนทดสอบด้วยเบราว์เซอร์
   * 7 ส.ค. 2026) — เป็นอาการเดียวกับที่ CLAUDE.md เตือนไว้เรื่อง `<main>` ของ /desk
   *
   * portal ตัดปัญหาทั้งสองทางในครั้งเดียว และทำให้กล่องนี้เอาไปวางที่ไหนก็ได้
   */
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label="ปรับรูปโปรไฟล์"
        tabIndex={-1}
        className="flex w-full max-w-88 animate-lift-in flex-col gap-4 rounded-box border border-line bg-base-100 p-5 outline-none"
      >
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold">ปรับรูปโปรไฟล์</h2>
          <p className="text-[12.5px] text-mut text-pretty">
            ลากเพื่อเลื่อนรูป และซูมให้ใบหน้าอยู่ในวงกลม
          </p>
        </div>

        {decodeFailed ? (
          <p role="alert" className="flex items-start gap-2 text-[12.5px] text-alert">
            <TriangleAlert size={14} strokeWidth={1.9} aria-hidden className="mt-0.5 flex-none" />
            เปิดไฟล์รูปนี้ไม่ได้ — ลองเลือกไฟล์ JPG หรือ PNG ไฟล์อื่น
          </p>
        ) : (
          <>
            <div
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onWheel={(e) => zoomTo(zoom - Math.sign(e.deltaY) * ZOOM_STEP)}
              className={`relative size-72 touch-none self-center overflow-hidden rounded-box bg-base-200 select-none ${
                busy ? "cursor-wait" : "cursor-grab active:cursor-grabbing"
              }`}
            >
              {image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={image.src}
                  alt=""
                  draggable={false}
                  style={{
                    width: current.width,
                    height: current.height,
                    transform: `translate(${current.x}px, ${current.y}px)`,
                  }}
                  className="max-w-none origin-top-left"
                />
              ) : (
                <span className="grid size-full place-items-center text-mut">
                  <Loader2 size={20} strokeWidth={2} aria-hidden className="animate-spin" />
                </span>
              )}

              {/**
               * หน้ากากวงกลม — สี่เหลี่ยมทึบเจาะรูวงกลมด้วย `evenodd` แล้วตีเส้นขอบ
               * ใช้ SVG แทน `box-shadow` วงใหญ่ เพราะสีต้องมาจาก token (`currentColor`)
               * จึงพลิกตามธีมมืดได้เอง
               */}
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden
                className="pointer-events-none absolute inset-0 size-full text-ink/45"
              >
                <path
                  fill="currentColor"
                  fillRule="evenodd"
                  d="M0 0h100v100H0Z M50 0a50 50 0 1 0 0 100a50 50 0 1 0 0-100Z"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="49.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                  className="text-base-100"
                />
              </svg>
            </div>

            <div className="flex items-center gap-3">
              <ZoomButton
                label="ซูมออก"
                disabled={busy || zoom <= MIN_ZOOM}
                onClick={() => zoomTo(zoom - ZOOM_STEP)}
              >
                <Minus size={15} strokeWidth={1.9} aria-hidden />
              </ZoomButton>

              <RangeField
                label="ระดับการซูมรูป"
                value={zoom}
                onChange={zoomTo}
                min={MIN_ZOOM}
                max={MAX_ZOOM}
              />

              <ZoomButton
                label="ซูมเข้า"
                disabled={busy || zoom >= MAX_ZOOM}
                onClick={() => zoomTo(zoom + ZOOM_STEP)}
              >
                <Plus size={15} strokeWidth={1.9} aria-hidden />
              </ZoomButton>
            </div>
          </>
        )}

        {error ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-[10px] border border-alert/25 bg-alert/8 px-3 py-2.5 text-[12px] leading-[1.6] text-alert text-pretty"
          >
            <TriangleAlert size={14} strokeWidth={1.9} aria-hidden className="mt-0.5 flex-none" />
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="cursor-pointer rounded-selector border border-line px-4 py-2 text-[13px] transition-colors hover:bg-base-200 disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || !image}
            className="flex cursor-pointer items-center gap-2 rounded-selector bg-primary px-4 py-2 text-[13px] font-medium text-primary-content transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 size={14} strokeWidth={2} aria-hidden className="animate-spin" />
            ) : null}
            {busy ? "กำลังบันทึก…" : "บันทึกรูป"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ZoomButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid size-9 flex-none cursor-pointer place-items-center rounded-full border border-line text-mut transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-40"
    >
      {children}
    </button>
  );
}
