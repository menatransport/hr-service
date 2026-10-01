"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Maximize,
  RotateCw,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { useOverlayCount } from "@/components/ui/field";

/**
 * ตัวดูเอกสารเต็มจอของแฟ้มประวัติ พจส. — **ใหญ่ที่สุดที่จอให้ได้ แล้วซูมต่อได้**
 *
 * ต่างจาก `AttachmentGallery` ที่ดูรูปเคสผ่าน ๆ (กรอบ 1080px) — ตัวนี้มีไว้**อ่าน
 * ตัวหนังสือบนสำเนาเอกสาร** เลขบัตร วันหมดอายุ ประเภทใบขับขี่ ซึ่งตัวเล็กมาก
 * จึงต้องมี:
 * - พอดีจอแบบเต็มพื้นที่ (ขยายรูปเล็กจากมือถือขึ้นได้ถึง 3 เท่า)
 * - ซูม 100–400% · ดับเบิลคลิกสลับพอดีจอ/200% · ลากเลื่อนตอนซูม · Ctrl+ลูกกลิ้ง
 * - หมุนทีละ 90° — สำเนาที่สแกนตะแคงมาเจอบ่อย
 * - PDF เปิดในกรอบเดียวกันเลย ไม่ต้องออกไปแท็บใหม่ · Word ดูในเบราว์เซอร์ไม่ได้
 *   จึงเหลือปุ่มเปิด/ดาวน์โหลด
 *
 * คีย์บอร์ด: Esc ปิด · ←/→ ฉบับก่อน/ถัดไป · + / − ซูม · 0 พอดีจอ · R หมุน
 *
 * ขึ้นเหนือ `ModalShell` (z-80) เพราะเปิดจากในกล่องตรวจผลสแกนได้ด้วย
 */

export interface ViewerItem {
  /** คีย์ไม่ซ้ำ — `fileId` หรือ object URL ของไฟล์ที่ยังไม่อัป */
  key: string;
  url: string;
  name: string;
  /** MIME type */
  type: string;
  /** บรรทัดรองใต้ชื่อไฟล์ เช่น ผู้แนบ · วันที่ · หมายเหตุ */
  caption?: string;
}

const ZOOMS = [1, 1.5, 2, 3, 4];
/** รูปเล็กจากมือถือขยายให้เต็มจอได้ แต่ไม่เกินนี้ — เกินกว่านี้แตกจนอ่านยากกว่าเดิม */
const MAX_FIT = 3;

type Kind = "image" | "pdf" | "other";

function kindOf(item: ViewerItem): Kind {
  if (item.type.startsWith("image/")) return "image";
  if (item.type === "application/pdf" || /\.pdf$/i.test(item.name)) return "pdf";
  return "other";
}

export function DriverDocumentViewer({
  items,
  startIndex = 0,
  title,
  onClose,
  onRemove,
}: {
  items: ViewerItem[];
  startIndex?: number;
  /** ชื่อประเภทเอกสาร เช่น “บัตรประชาชน” */
  title: string;
  onClose: () => void;
  /** ไม่ส่ง = ไม่มีปุ่มลบ (ดูไฟล์ที่ยังไม่ได้อัป) */
  onRemove?: (item: ViewerItem) => void;
}) {
  const [index, setIndex] = useState(Math.min(startIndex, items.length - 1));
  const [zoom, setZoom] = useState(0); // ดัชนีใน ZOOMS
  const [turns, setTurns] = useState(0);

  const item = items[index];
  const kind = item ? kindOf(item) : "other";

  useOverlayCount(true);

  const go = useCallback(
    (step: number) => {
      if (items.length < 2) return;
      setIndex((i) => (i + step + items.length) % items.length);
      setZoom(0);
      setTurns(0);
    },
    [items.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const keys: Record<string, () => void> = {
        Escape: onClose,
        ArrowLeft: () => go(-1),
        ArrowRight: () => go(1),
        "+": () => setZoom((z) => Math.min(z + 1, ZOOMS.length - 1)),
        "=": () => setZoom((z) => Math.min(z + 1, ZOOMS.length - 1)),
        "-": () => setZoom((z) => Math.max(z - 1, 0)),
        "0": () => setZoom(0),
        r: () => setTurns((t) => (t + 1) % 4),
        R: () => setTurns((t) => (t + 1) % 4),
      };
      const run = keys[e.key];
      if (!run) return;
      /* ModalShell ข้างล่างก็ฟัง Esc — กันไม่ให้ปิดสองชั้นพร้อมกัน */
      e.stopImmediatePropagation();
      e.preventDefault();
      run();
    };
    document.addEventListener("keydown", onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prev;
    };
  }, [go, onClose]);

  if (!item || typeof document === "undefined") return null;

  const zoomable = kind === "image";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} — ${item.name}`}
      className="fixed inset-0 z-80 flex flex-col bg-[#0d1412]/95 text-white backdrop-blur-sm animate-fade-in"
    >
      {/* แถบบน */}
      <header className="flex flex-none flex-wrap items-center gap-x-3 gap-y-2 border-b border-white/10 px-3 py-2.5 sm:px-5">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-2 text-13-5 font-semibold">
            <span className="truncate">{title}</span>
            {items.length > 1 ? (
              <span className="flex-none rounded-full bg-white/12 px-2 py-0.5 font-mono text-10-5 font-medium">
                {index + 1}/{items.length}
              </span>
            ) : null}
          </span>
          <span className="truncate text-11-5 text-white/60">
            {item.name}
            {item.caption ? ` · ${item.caption}` : ""}
          </span>
        </div>

        <div className="flex flex-none items-center gap-1">
          {zoomable ? (
            <>
              <ToolButton
                label="ย่อ (−)"
                onClick={() => setZoom((z) => Math.max(z - 1, 0))}
                disabled={zoom === 0}
              >
                <ZoomOut size={17} />
              </ToolButton>
              <button
                type="button"
                onClick={() => setZoom(0)}
                title="พอดีจอ (0)"
                className="min-w-16 cursor-pointer rounded-field px-2 py-1.5 text-center font-mono text-11-5 text-white/80 transition-colors hover:bg-white/10"
              >
                {zoom === 0 ? "พอดีจอ" : `${ZOOMS[zoom] * 100}%`}
              </button>
              <ToolButton
                label="ขยาย (+)"
                onClick={() => setZoom((z) => Math.min(z + 1, ZOOMS.length - 1))}
                disabled={zoom === ZOOMS.length - 1}
              >
                <ZoomIn size={17} />
              </ToolButton>
              <ToolButton label="หมุน 90° (R)" onClick={() => setTurns((t) => (t + 1) % 4)}>
                <RotateCw size={16} />
              </ToolButton>
              <ToolButton label="พอดีจอ (0)" onClick={() => setZoom(0)} disabled={zoom === 0}>
                <Maximize size={15} />
              </ToolButton>
              <Divider />
            </>
          ) : null}

          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            title="เปิดในแท็บใหม่"
            aria-label="เปิดในแท็บใหม่"
            className="flex size-9 items-center justify-center rounded-field text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ExternalLink size={16} strokeWidth={1.8} aria-hidden />
          </a>
          <a
            href={item.url}
            download={item.name}
            title="ดาวน์โหลด"
            aria-label="ดาวน์โหลด"
            className="flex size-9 items-center justify-center rounded-field text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Download size={16} strokeWidth={1.8} aria-hidden />
          </a>
          {onRemove ? (
            <ToolButton label="ลบออกจากแฟ้ม" onClick={() => onRemove(item)} danger>
              <Trash2 size={16} />
            </ToolButton>
          ) : null}
          <Divider />
          <ToolButton label="ปิด (Esc)" onClick={onClose}>
            <X size={19} />
          </ToolButton>
        </div>
      </header>

      {/* พื้นที่แสดงผล */}
      <div className="relative min-h-0 flex-1">
        {kind === "image" ? (
          <ImageStage
            key={item.key}
            url={item.url}
            alt={`${title} — ${item.name}`}
            zoom={ZOOMS[zoom]}
            turns={turns}
            onToggleZoom={() => setZoom((z) => (z === 0 ? 2 : 0))}
            onWheelZoom={(dir) =>
              setZoom((z) => Math.min(Math.max(z + dir, 0), ZOOMS.length - 1))
            }
          />
        ) : kind === "pdf" ? (
          <iframe
            key={item.key}
            src={item.url}
            title={item.name}
            className="absolute inset-0 size-full bg-white"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <FileText size={44} strokeWidth={1.4} aria-hidden className="text-white/50" />
            <p className="text-14 font-medium">{item.name}</p>
            <p className="max-w-sm text-12-5 text-white/60 text-pretty">
              ไฟล์ชนิดนี้ดูในเบราว์เซอร์ไม่ได้ — กดดาวน์โหลดแล้วเปิดด้วยโปรแกรมในเครื่อง
            </p>
            <a
              href={item.url}
              download={item.name}
              className="mt-1 flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-12-5 font-medium text-ink transition-opacity hover:opacity-90"
            >
              <Download size={14} strokeWidth={1.9} aria-hidden />
              ดาวน์โหลด
            </a>
          </div>
        )}

        {items.length > 1 ? (
          <>
            <NavButton side="left" onClick={() => go(-1)} />
            <NavButton side="right" onClick={() => go(1)} />
          </>
        ) : null}
      </div>

      {/* แถบรูปย่อ — มีเฉพาะตอนประเภทเดียวกันมีหลายฉบับ (เช่นบัตรใบเก่ากับใบต่ออายุ) */}
      {items.length > 1 ? (
        <nav
          aria-label="ฉบับอื่นในประเภทนี้"
          className="flex flex-none justify-center gap-2 overflow-x-auto border-t border-white/10 px-3 py-2.5"
        >
          {items.map((it, i) => (
            <button
              key={it.key}
              type="button"
              onClick={() => {
                setIndex(i);
                setZoom(0);
                setTurns(0);
              }}
              aria-label={`ฉบับที่ ${i + 1}: ${it.name}`}
              aria-current={i === index}
              className={`relative flex size-14 flex-none cursor-pointer items-center justify-center overflow-hidden rounded-field border-2 bg-white/8 transition-opacity ${
                i === index ? "border-white" : "border-transparent opacity-55 hover:opacity-90"
              }`}
            >
              {kindOf(it) === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.url} alt="" loading="lazy" className="size-full object-cover" />
              ) : (
                <FileText size={20} strokeWidth={1.5} aria-hidden className="text-white/70" />
              )}
              {i === 0 ? (
                <span className="absolute inset-x-0 bottom-0 bg-black/60 py-px text-center text-[9px] font-medium">
                  ล่าสุด
                </span>
              ) : null}
            </button>
          ))}
        </nav>
      ) : null}
    </div>,
    document.body,
  );
}

/**
 * พื้นที่รูป — คิดขนาดเองจากขนาดจริงของรูปกับขนาดจอ (ไม่พึ่ง `object-contain`)
 * เพราะต้องรองรับทั้งการหมุน (กล่องสลับกว้าง/สูง) และการซูมที่เลื่อนดูได้ทุกมุม
 *
 * กล่องนอกเป็น flex + ลูก `m-auto` — ท่านี้จัดกลางตอนรูปเล็กกว่าจอ และเลื่อนได้ครบ
 * ทุกด้านตอนรูปใหญ่กว่าจอ (`justify-center` ธรรมดาจะตัดขอบซ้าย/บนทิ้ง)
 */
function ImageStage({
  url,
  alt,
  zoom,
  turns,
  onToggleZoom,
  onWheelZoom,
}: {
  url: string;
  alt: string;
  zoom: number;
  turns: number;
  onToggleZoom: () => void;
  onWheelZoom: (dir: 1 | -1) => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [space, setSpace] = useState({ w: 0, h: 0 });
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => setSpace({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /* Ctrl/⌘ + ลูกกลิ้ง = ซูม (ท่าเดียวกับทุกโปรแกรมดูรูป) · ต้องผูกเองแบบ non-passive
     ไม่งั้น `preventDefault` ไม่มีผล แล้วเบราว์เซอร์จะซูมทั้งหน้าแทน */
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      onWheelZoom(e.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheelZoom]);

  const pad = 24;
  const sideways = turns % 2 === 1;
  let size: { w: number; h: number; boxW: number; boxH: number } | null = null;
  if (natural && space.w && space.h) {
    const boxNatW = sideways ? natural.h : natural.w;
    const boxNatH = sideways ? natural.w : natural.h;
    const fit = Math.min(
      (space.w - pad * 2) / boxNatW,
      (space.h - pad * 2) / boxNatH,
      MAX_FIT,
    );
    const s = fit * zoom;
    size = { w: natural.w * s, h: natural.h * s, boxW: boxNatW * s, boxH: boxNatH * s };
  }

  const pannable = zoom > 1;

  return (
    <div
      ref={stage}
      onPointerDown={(e) => {
        if (!pannable || !stage.current) return;
        drag.current = {
          x: e.clientX,
          y: e.clientY,
          left: stage.current.scrollLeft,
          top: stage.current.scrollTop,
        };
        stage.current.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current || !stage.current) return;
        stage.current.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
        stage.current.scrollTop = drag.current.top - (e.clientY - drag.current.y);
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onDoubleClick={onToggleZoom}
      className={`absolute inset-0 flex overflow-auto ${
        pannable ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"
      }`}
    >
      {failed ? (
        <p className="m-auto text-13 text-white/60">เปิดรูปนี้ไม่ได้ — ลองเปิดในแท็บใหม่</p>
      ) : (
        <div
          className="relative m-auto flex-none"
          /* กล่องเผื่อขอบ `pad` รอบรูป — ตอนซูมแล้วเลื่อนสุดขอบ รูปจะไม่ชิดขอบจอพอดี */
          style={{
            width: size ? size.boxW + pad * 2 : 0,
            height: size ? size.boxH + pad * 2 : 0,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={alt}
            draggable={false}
            onLoad={(e) =>
              setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
            }
            onError={() => setFailed(true)}
            className="absolute top-1/2 left-1/2 max-w-none rounded-[6px] bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] transition-[transform,opacity] duration-200 select-none"
            style={{
              width: size?.w,
              height: size?.h,
              opacity: size ? 1 : 0,
              transform: `translate(-50%, -50%) rotate(${turns * 90}deg)`,
            }}
          />
        </div>
      )}
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`flex size-9 cursor-pointer items-center justify-center rounded-field text-white/80 transition-colors disabled:pointer-events-none disabled:opacity-30 ${
        danger ? "hover:bg-alert/25 hover:text-white" : "hover:bg-white/10 hover:text-white"
      } [&_svg]:stroke-[1.8]`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-white/15" />;
}

function NavButton({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "ฉบับก่อนหน้า (←)" : "ฉบับถัดไป (→)"}
      className={`absolute top-1/2 flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition-colors hover:bg-black/70 ${
        side === "left" ? "left-3" : "right-3"
      }`}
    >
      <Icon size={22} strokeWidth={2} aria-hidden />
    </button>
  );
}
