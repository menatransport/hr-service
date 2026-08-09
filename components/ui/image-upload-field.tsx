"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, TriangleAlert, Trash2 } from "lucide-react";

import { AttachmentGallery } from "@/components/ui/attachment-gallery";
import {
  ACCEPTED_LABEL,
  ACCEPT_ATTR,
  isAcceptedImage,
  prepareImageForUpload,
} from "@/lib/image-resize";

/**
 * ช่องแนบรูป — เลือกไฟล์/ลากมาวาง แล้วอัปขึ้น Spaces ทันทีผ่าน `POST /api/uploads`
 *
 * `value` ที่ส่งออกคือ **URL ของไฟล์ที่อัปแล้ว** ไม่ใช่ตัวไฟล์ เพราะ NCAC เก็บได้แค่ URL
 * (ดูเหตุผลเต็มใน `lib/uploads.ts`) — ฟอร์มที่เรียกใช้จึงส่งต่อค่านี้ได้ตรง ๆ
 *
 * รับแค่ JPG / PNG และย่อรูปให้เองก่อนส่ง (`lib/image-resize.ts`) จึงแทบไม่มีทางชน
 * เพดาน MAX_MB — ที่ยังเช็คขนาดก่อนย่อเพราะไฟล์ยักษ์ทำให้ขั้นถอดรหัสกินแรมจนแท็บค้าง
 *
 * อัปทันทีที่เลือกไฟล์ ไม่รอกดส่ง เพื่อให้เห็นรูปที่เก็บจริงตั้งแต่ก่อนส่งเรื่อง
 * และปุ่มส่งไม่ต้องค้างรออัปโหลด · ผลข้างเคียงคือถ้าผู้ใช้ยกเลิกฟอร์มไป
 * ไฟล์ที่อัปแล้วจะค้างอยู่บน bucket (แบบเดียวกับ mena-go)
 *
 * `<input type="file">` ดิบเป็นข้อยกเว้นที่ CLAUDE.md อนุญาต — ต้องซ่อนด้วย `sr-only`
 * แล้วให้ปุ่มจริงเป็นตัวกด เหมือน wizard ในหน้ามือถือ
 */

const MAX_MB = 10;

export function ImageUploadField({
  id,
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  hint?: string;
  /** URL ของรูปที่อัปแล้ว หรือ `null` ถ้ายังไม่มี */
  value: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  /** `null` = ว่าง · ย่อรูปกับอัปโหลดแยกกันเพราะผู้ใช้เห็นสองจังหวะนี้ต่างกัน */
  const [stage, setStage] = useState<"resizing" | "uploading" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  /** พรีวิวจากไฟล์ในเครื่องระหว่างรออัป — ผู้ใช้เห็นรูปทันทีโดยไม่ต้องรอเน็ต */
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  // ปล่อย object URL ตอนถอดคอมโพเนนต์ ไม่งั้นรูปค้างในหน่วยความจำ
  useEffect(
    () => () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    },
    [localPreview],
  );

  async function upload(file: File) {
    if (!isAcceptedImage(file)) {
      setError(`แนบได้เฉพาะไฟล์ ${ACCEPTED_LABEL}`);
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`ไฟล์ใหญ่เกิน ${MAX_MB} MB — ย่อรูปก่อนแล้วลองใหม่`);
      return;
    }

    // พรีวิวจากไฟล์ต้นฉบับ ไม่ต้องรอย่อเสร็จ ผู้ใช้จึงเห็นรูปทันทีที่เลือก
    const preview = URL.createObjectURL(file);
    setLocalPreview(preview);
    setStage("resizing");
    setError(null);
    try {
      const ready = await prepareImageForUpload(file);
      setStage("uploading");

      const body = new FormData();
      body.append("file", ready);
      const res = await fetch("/api/uploads", { method: "POST", body });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.url) throw new Error(json?.error ?? "อัปโหลดไม่สำเร็จ");
      onChange(json.url as string);
    } catch (err) {
      // ล้มเหลวต้องไม่ทิ้งพรีวิวไว้หลอกตา — ของจริงยังไม่มีบนเซิร์ฟเวอร์
      setError(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ");
      onChange(null);
    } finally {
      URL.revokeObjectURL(preview);
      setLocalPreview(null);
      setStage(null);
    }
  }

  function remove() {
    onChange(null);
    setError(null);
    if (input.current) input.current.value = "";
  }

  const busy = stage !== null;
  const locked = disabled || busy;

  return (
    <div className="flex flex-col gap-2">
      {/* ไม่มีดอกจัน — แนบรูปไม่บังคับ และระบบทำเครื่องหมายเฉพาะช่องที่บังคับ */}
      <span className="text-[12.5px] font-medium text-mut">{label}</span>

      {value ? (
        <div className="flex items-center gap-3 rounded-box border border-line bg-base-100 p-2.5">
          <AttachmentGallery urls={[value]} thumb={64} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[12px] text-ink">แนบรูปแล้ว</span>
            <span className="text-[11.5px] text-mut">
              ชี้ที่รูปเพื่อดูภาพขยาย · คลิกเพื่อดูเต็มจอ
            </span>
          </div>
          <button
            type="button"
            onClick={remove}
            disabled={disabled}
            className="flex size-9 flex-none items-center justify-center rounded-selector text-mut transition-colors hover:bg-base-200 hover:text-alert disabled:opacity-40"
            aria-label="ลบรูปที่แนบ"
          >
            <Trash2 size={16} strokeWidth={1.8} aria-hidden />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={locked}
          onDragOver={(e) => {
            if (locked) return;
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            if (locked) return;
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void upload(file);
          }}
          className={`flex flex-col items-center gap-1.5 rounded-box border-[1.5px] border-dashed px-4 py-4 transition-colors disabled:opacity-60 ${
            dragging
              ? "border-primary bg-soft text-primary"
              : "border-line text-mut hover:border-primary/50 hover:text-primary"
          }`}
        >
          {busy && localPreview ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={localPreview}
                alt=""
                className="size-14 rounded-[9px] border border-line object-cover"
              />
              <span className="flex items-center gap-1.5 text-[12.5px]">
                <Loader2 size={14} strokeWidth={2} aria-hidden className="animate-spin" />
                {stage === "resizing" ? "กำลังย่อรูป…" : "กำลังอัปโหลด…"}
              </span>
            </>
          ) : (
            <>
              <ImagePlus size={22} strokeWidth={1.6} aria-hidden />
              <span className="text-[12.5px]">เลือกไฟล์รูป หรือ ลากมาวางตรงนี้</span>
              <span className="text-[11px]">
                {hint ?? `${ACCEPTED_LABEL} · ไม่เกิน ${MAX_MB} MB · ระบบย่อรูปให้เอง`}
              </span>
            </>
          )}
        </button>
      )}

      <input
        ref={input}
        id={id}
        type="file"
        accept={ACCEPT_ATTR}
        className="sr-only"
        disabled={locked}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />

      {error ? (
        <p
          role="alert"
          className="flex items-center gap-1.5 text-[11.5px] text-alert"
        >
          <TriangleAlert size={13} strokeWidth={1.9} aria-hidden className="flex-none" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
