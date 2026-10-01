"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  Loader2,
  RotateCcw,
  ScanText,
  TriangleAlert,
  X,
  ZoomIn,
} from "lucide-react";

import { DateField, TextField, useOverlayCount } from "@/components/ui/field";

import {
  ACCEPTED_LABEL,
  ACCEPT_ATTR,
  isAcceptedImage,
  prepareImageForUpload,
} from "@/lib/image-resize";
import { digitsOnly, formatNationalId, type DocSlot } from "@/app/recruitment/_lib/form";
import { readThaiDocument, type ScanStep } from "@/app/recruitment/_lib/id-card-ocr";
import { SCAN_STEP_LABEL, ScanOverlay } from "@/app/recruitment/_components/scan-overlay";

/**
 * ช่องแนบเอกสารของผู้สมัคร — หนึ่งแถวต่อหนึ่งเอกสาร
 *
 * **รับเฉพาะไฟล์รูป** เพราะ presign API ที่ `lib/uploads.ts` ยิงไปรับเฉพาะ
 * นามสกุลรูป (ดูเหตุผลเต็มในไฟล์นั้น) — ผู้สมัครที่มีใบรับรองแพทย์เป็น PDF
 * จึงต้องถ่ายรูปเอกสารแทน ซึ่งเป็นท่าที่คนขับทำอยู่แล้วบนมือถือ
 *
 * `capture="environment"` ทำให้มือถือเปิดกล้องหลังให้เลย ไม่ต้องผ่านหน้าเลือกไฟล์
 * ส่วนบนเดสก์ท็อปแอตทริบิวต์นี้ถูกมองข้ามและกลายเป็นหน้าต่างเลือกไฟล์ตามปกติ
 *
 * อัปทันทีที่เลือก ไม่รอกดส่ง — ปุ่มส่งใบสมัครจึงไม่ต้องค้างรออัปโหลดห้าไฟล์
 * ผลข้างเคียงคือคนที่ปิดหน้าไปกลางคันจะทิ้งไฟล์ค้างบน bucket (แบบเดียวกับ
 * ไฟล์แนบของเคสใน `image-upload-field.tsx`)
 */

const MAX_MB = 10;

type SlotState = "idle" | "resizing" | "uploading";

/** ช่องแนบที่อ่านข้อมูลจากรูปให้เอง */
const ID_CARD_SLOT = "id_card";

/**
 * ข้อมูลที่อ่านจากรูปบัตรประชาชน — ลงไปที่ `Application.documents` ตอนส่ง
 * `source` บอกว่าค่ามาจากไหน: `""` ยังไม่มีค่า · `ocr` ระบบอ่านให้ · `manual` ผู้สมัครแก้เอง
 */
export interface IdCardDraft {
  nationalId: string;
  idCardExpiry: string;
  source: "" | "ocr" | "manual";
}

export const EMPTY_ID_CARD: IdCardDraft = { nationalId: "", idCardExpiry: "", source: "" };

type ReadState = "idle" | "reading" | "done" | "failed";

export function DocUpload({
  draftId,
  slots,
  files,
  onChange,
  missing,
  idCard = EMPTY_ID_CARD,
  onIdCard,
  idCardError,
  typedNationalId = "",
}: {
  /** โฟลเดอร์ไฟล์ร่างบน S3 ของฟอร์มนี้ — ดู `Draft.draftId` ใน `apply-flow.tsx` · พรีวิวส่ง `""` */
  draftId: string;
  /** ช่องที่ผู้สมัครเห็น — กรองช่องที่ซ่อนออกมาแล้ว (`formDocSlots`) */
  slots: DocSlot[];
  /** `slot.id` → URL ที่อัปแล้ว หรือ `null` ถ้ายังไม่มี */
  files: Record<string, string | null>;
  onChange: (slotId: string, url: string | null) => void;
  /** ช่องที่บังคับแต่ยังว่าง — ส่งมาหลังผู้ใช้กดถัดไปแล้วเท่านั้น */
  missing: string[];
  /** ไม่ส่ง `onIdCard` = ไม่อ่านข้อมูลจากรูปบัตร (จอพรีวิวในหน้าแอดมิน) */
  idCard?: IdCardDraft;
  onIdCard?: (next: IdCardDraft) => void;
  /** ข้อความผิดของเลขบัตร — ส่งมาหลังกดถัดไปแล้วเท่านั้น */
  idCardError?: string | null;
  /** เลขบัตรที่ผู้สมัครพิมพ์ไว้ในขั้นก่อน — เอาไว้เตือนเมื่อไม่ตรงกับที่อ่านจากบัตร */
  typedNationalId?: string;
}) {
  const [readState, setReadState] = useState<ReadState>("idle");
  const [step, setStep] = useState<ScanStep | null>(null);

  /* อ่านขนานไปกับการอัปโหลด ไม่รอกัน — อ่านพังก็ไม่กระทบไฟล์แนบ ช่องยังกรอกเองได้ */
  async function readIdCard(file: File) {
    if (!onIdCard) return;
    setReadState("reading");
    setStep(null);
    try {
      const r = await readThaiDocument(file, "id-card", setStep);
      onIdCard({ nationalId: r.nationalId, idCardExpiry: r.expiry, source: "ocr" });
      setReadState("done");
    } catch {
      setReadState("failed");
    }
  }

  const required = slots.filter((s) => s.required);
  const doneRequired = required.filter((s) => files[s.id]).length;
  const allDone = doneRequired === required.length;

  /* ฝ่ายบุคคลซ่อนทุกช่องไว้ใน Section 4 — ขั้นนี้ยังอยู่ (ลำดับขั้นคงที่) แต่บอกตรง ๆ
     ว่าไม่ต้องทำอะไร ดีกว่าหน้าเปล่าที่ผู้สมัครไม่แน่ใจว่าโหลดไม่ขึ้นหรือเปล่า */
  if (!slots.length) {
    return (
      <p className="rounded-box border border-dashed border-line px-3.5 py-6 text-center text-13 leading-relaxed text-mut">
        รอบนี้ยังไม่ต้องแนบเอกสาร กดถัดไปได้เลย
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-13 leading-relaxed text-mut">
        แตะแล้วเปิดกล้องได้เลย ไม่ต้องสแกน ระบบย่อไฟล์ให้เองก่อนส่ง
      </p>

      {/* ตัวนับเฉพาะเอกสารที่ **บังคับ** — ใบรับรองแพทย์ที่ส่งทีหลังได้ไม่ควรทำให้
          ตัวเลขค้างที่ 4/5 แล้วผู้สมัครนึกว่ายังไปต่อไม่ได้ */}
      <div
        className={`flex items-center gap-2.5 rounded-box border px-3.5 py-2.5 transition-colors ${
          allDone ? "border-primary/40 bg-soft" : "border-line bg-base-100"
        }`}
      >
        <span
          aria-hidden
          className={`flex size-7 flex-none items-center justify-center rounded-full transition-colors ${
            allDone ? "bg-primary text-primary-content" : "bg-base-200 text-mut"
          }`}
        >
          {allDone ? (
            <Check size={14} strokeWidth={2.6} />
          ) : (
            <Camera size={14} strokeWidth={1.9} />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span
            className={`text-12-5 font-medium ${allDone ? "text-primary" : "text-ink"}`}
          >
            {!required.length
              ? "ไม่มีเอกสารที่บังคับ แนบเท่าที่มีได้เลย"
              : allDone
              ? "แนบเอกสารที่จำเป็นครบแล้ว"
              : `แนบแล้ว ${doneRequired} จาก ${required.length} รายการที่จำเป็น`}
          </span>
          <span className="h-1 overflow-hidden rounded-full bg-line">
            <span
              className="block h-full rounded-full bg-primary transition-[width] duration-400"
              style={{
                width: `${required.length ? (doneRequired / required.length) * 100 : 100}%`,
              }}
            />
          </span>
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        {slots.map((slot) => (
          <DocRow
            key={slot.id}
            draftId={draftId}
            slot={slot}
            url={files[slot.id] ?? null}
            onChange={(url) => onChange(slot.id, url)}
            onFile={slot.id === ID_CARD_SLOT ? readIdCard : undefined}
            scanning={slot.id === ID_CARD_SLOT && readState === "reading"}
            flagged={missing.includes(slot.id)}
          >
            {onIdCard && slot.id === ID_CARD_SLOT && (files[slot.id] || readState === "reading") ? (
              <IdCardFields
                value={idCard}
                onChange={onIdCard}
                readState={readState}
                step={step}
                error={idCardError ?? null}
                typedNationalId={typedNationalId}
              />
            ) : null}
          </DocRow>
        ))}
      </div>
    </div>
  );
}

function DocRow({
  draftId,
  slot,
  url,
  onChange,
  onFile,
  scanning = false,
  flagged,
  children,
}: {
  draftId: string;
  slot: DocSlot;
  url: string | null;
  onChange: (url: string | null) => void;
  /** ได้ไฟล์ต้นฉบับทันทีที่เลือก (ก่อนย่อ) — ใช้อ่านข้อมูลจากรูปบัตร */
  onFile?: (file: File) => void;
  /** กำลังอ่านข้อมูลจากรูปนี้ — รูปย่อขึ้นเลเซอร์สแกน */
  scanning?: boolean;
  flagged: boolean;
  children?: React.ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<SlotState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);

  async function upload(file: File) {
    if (!isAcceptedImage(file)) {
      setError(`ถ่ายรูปหรือเลือกไฟล์ ${ACCEPTED_LABEL} เท่านั้น`);
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`ไฟล์ใหญ่เกิน ${MAX_MB} MB — ถ่ายใหม่ด้วยความละเอียดต่ำลง`);
      return;
    }

    setError(null);
    onFile?.(file);
    setState("resizing");
    try {
      const ready = await prepareImageForUpload(file);
      setState("uploading");

      const body = new FormData();
      body.append("file", ready);
      body.append("draftId", draftId);
      body.append("slot", slot.id);
      const res = await fetch("/api/recruitment/public/uploads", { method: "POST", body });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.url) throw new Error(json?.error ?? "อัปโหลดไม่สำเร็จ");
      onChange(json.url as string);
    } catch (err) {
      // ล้มเหลวต้องไม่ทิ้งสถานะ “แนบแล้ว” ไว้หลอกตา ของจริงยังไม่มีบนเซิร์ฟเวอร์
      setError(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง");
      onChange(null);
    } finally {
      setState("idle");
    }
  }

  const busy = state !== "idle";
  const done = Boolean(url);
  const pick = () => input.current?.click();

  return (
    <div className="flex flex-col gap-1.5">
      {/* แถวเดียวแต่เป็นสองปุ่มพี่น้องกัน (ปุ่มซ้อนปุ่มผิด HTML) — รูปย่อ = ดูภาพ,
          ที่เหลือทั้งแถว = ถ่ายใหม่ · ยังไม่แนบ รูปย่อก็เปิดกล้องเหมือนทั้งแถว */}
      <div
        className={`flex items-center gap-3 rounded-box border p-3 transition-colors ${
          busy ? "opacity-70" : ""
        } ${
          done
            ? "border-primary/45 bg-soft"
            : flagged
              ? "border-alert bg-base-100"
              : "border-line border-dashed bg-base-100 hover:border-primary/40"
        }`}
      >
        {/* รูปที่ถ่ายไปแล้วขึ้นเป็นภาพย่อจริง ไม่ใช่ไอคอนติ๊กถูก — ผู้สมัครถ่ายบัตร
            ห้าใบรวดแล้วจำไม่ได้ว่าใบไหนเบลอ การเห็นภาพจริงคือทางเดียวที่ตรวจเองได้
            ก่อนส่ง · ใช้ `<img>` ตรง ๆ ไม่ใช่ `next/image` เพราะ `/api/media/…`
            เด้งต่อไปลิงก์ presigned ของ S3 */}
        <button
          type="button"
          onClick={() => (done ? setViewing(true) : pick())}
          disabled={busy}
          aria-label={done ? `ดูรูป${slot.label}` : `ถ่ายรูป${slot.label}`}
          className={`group relative flex size-14 flex-none items-center justify-center overflow-hidden rounded-field ${
            done ? "bg-primary/10" : "bg-ph-thumb text-mut"
          }`}
        >
          {done && url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-cover"
            />
          ) : null}

          {busy ? (
            <span className="absolute inset-0 flex items-center justify-center bg-base-100/75 text-primary">
              <Loader2 size={18} strokeWidth={2} className="animate-spin" />
            </span>
          ) : scanning ? (
            <ScanOverlay phase="scanning" compact />
          ) : done ? (
            <>
              <span
                aria-hidden
                className="absolute inset-0 flex items-center justify-center bg-ink/35 text-primary-content opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
              >
                <ZoomIn size={16} strokeWidth={1.9} />
              </span>
              <span
                aria-hidden
                className="absolute right-0.5 bottom-0.5 flex size-4.5 items-center justify-center rounded-full bg-primary text-primary-content ring-2 ring-base-100"
              >
                <Check size={10} strokeWidth={3} />
              </span>
            </>
          ) : (
            <Camera size={18} strokeWidth={1.7} aria-hidden />
          )}
        </button>

        <button
          type="button"
          onClick={pick}
          disabled={busy}
          className="flex min-w-0 flex-1 items-center gap-3 self-stretch text-left"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-1.5 text-13-5 font-medium text-ink">
              {slot.label}
              {slot.required ? null : (
                <span className="rounded-selector bg-base-200 px-1.5 py-px font-mono text-10 text-mut">
                  ส่งทีหลังได้
                </span>
              )}
            </span>
            <span className="text-11-5 leading-relaxed text-mut">
              {state === "resizing"
                ? "กำลังย่อรูป…"
                : state === "uploading"
                  ? "กำลังอัปโหลด…"
                  : done
                    ? "แนบแล้ว — แตะรูปเพื่อดู · แตะตรงนี้เพื่อถ่ายใหม่"
                    : slot.hint}
            </span>
          </span>

          {done && !busy ? (
            <RotateCcw size={15} strokeWidth={1.8} aria-hidden className="flex-none text-mut" />
          ) : null}
        </button>
      </div>

      {viewing && url ? (
        <DocViewer
          url={url}
          label={slot.label}
          onClose={() => setViewing(false)}
          onRetake={() => {
            setViewing(false);
            pick();
          }}
        />
      ) : null}

      <input
        ref={input}
        type="file"
        accept={ACCEPT_ATTR}
        capture="environment"
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />

      {error ? (
        <p role="alert" className="flex items-center gap-1.5 text-11-5 text-alert">
          <TriangleAlert size={12} strokeWidth={1.9} aria-hidden className="flex-none" />
          {error}
        </p>
      ) : flagged ? (
        <p role="alert" className="text-11-5 text-alert">
          ยังไม่ได้แนบเอกสารนี้
        </p>
      ) : null}

      {children}
    </div>
  );
}

/**
 * ดูรูปที่แนบไว้เต็มจอ — ผู้สมัครตรวจเองได้ว่าชัดพอก่อนส่ง
 * หน้าตาเดียวกับภาพเต็มจอใน `attachment-gallery.tsx` แต่รูปเดียว + มีปุ่มถ่ายใหม่
 */
function DocViewer({
  url,
  label,
  onClose,
  onRetake,
}: {
  url: string;
  label: string;
  onClose: () => void;
  onRetake: () => void;
}) {
  useOverlayCount(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`รูป${label}`}
      className="fixed inset-0 z-70 flex items-center justify-center p-4 sm:p-8"
    >
      <button
        type="button"
        aria-label="ปิดภาพ"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/80 backdrop-blur-[3px]"
      />

      <div className="animate-pop-in relative flex max-h-full w-full max-w-[min(1080px,100%)] flex-col items-center gap-3">
        <div className="flex w-full flex-none items-center gap-2">
          <span className="truncate rounded-full bg-base-100/90 px-3 py-1.5 text-12 font-medium text-ink shadow-sm">
            {label}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="ml-auto flex size-9 flex-none items-center justify-center rounded-full bg-base-100/90 text-ink shadow-sm transition-colors hover:bg-base-100 hover:text-primary"
          >
            <X size={18} strokeWidth={1.9} aria-hidden />
          </button>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={`รูป${label}ที่แนบไว้`}
          className="animate-fade-in max-h-[72dvh] max-w-full rounded-[14px] border border-line bg-base-100 object-contain shadow-[0_30px_70px_-25px_rgba(21,32,29,0.7)]"
        />

        <button
          type="button"
          onClick={onRetake}
          className="flex flex-none items-center gap-1.5 rounded-full bg-base-100/90 px-4 py-2 text-12-5 font-medium text-ink shadow-sm transition-colors hover:bg-base-100 hover:text-primary"
        >
          <RotateCcw size={14} strokeWidth={1.9} aria-hidden />
          ถ่ายใหม่
        </button>
      </div>
    </div>
  );
}

/**
 * เลขบัตร + วันหมดอายุที่อ่านจากรูป — **แก้ได้ทุกช่อง** เพราะ OCR จากรูปมือถือ
 * อ่านเพี้ยนได้เสมอ · ทั้งสองช่องไม่บังคับ อ่านไม่ออกก็ไปต่อได้ ฝ่ายบุคคลกรอกทีหลัง
 * จากรูปที่แนบไว้ (ช่องเดียวกันใน `candidate-documents.tsx`)
 */
function IdCardFields({
  value,
  onChange,
  readState,
  step,
  error,
  typedNationalId,
}: {
  value: IdCardDraft;
  onChange: (next: IdCardDraft) => void;
  readState: ReadState;
  step: ScanStep | null;
  error: string | null;
  typedNationalId: string;
}) {
  if (readState === "reading") {
    return (
      <div
        role="status"
        className="relative flex items-center gap-2.5 overflow-hidden rounded-box border border-primary/25 bg-soft px-3 py-2.5 text-12 text-ink"
      >
        <ScanText size={14} strokeWidth={1.9} aria-hidden className="flex-none text-primary" />
        <span key={step ?? "load"} className="animate-fade-in">
          {SCAN_STEP_LABEL[step ?? "load"]}
        </span>
        {/* แถบแสงวิ่งที่ขอบล่าง — ท่าเดียวกับแถบ progress หน้า login (`animate-sweep`) */}
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-primary/10">
          <span className="motion-keep block h-full w-1/3 animate-sweep bg-gradient-to-r from-transparent via-primary to-transparent" />
        </span>
      </div>
    );
  }

  const edit = (patch: Partial<IdCardDraft>) => onChange({ ...value, ...patch, source: "manual" });
  const nid = digitsOnly(value.nationalId);
  const typed = digitsOnly(typedNationalId);
  const mismatch = nid.length === 13 && typed.length === 13 && nid !== typed;
  const found = Boolean(value.nationalId || value.idCardExpiry);

  return (
    <div className="flex flex-col gap-3 rounded-box border border-line bg-base-100 p-3.5">
      <p className="flex items-start gap-1.5 text-11-5 leading-relaxed text-mut">
        <ScanText size={13} strokeWidth={1.9} aria-hidden className="mt-0.5 flex-none text-primary" />
        {readState === "failed"
          ? "อ่านจากรูปไม่สำเร็จ — กรอกเองได้ หรือเว้นว่างไว้ให้เจ้าหน้าที่กรอก"
          : value.source === "ocr" && found
            ? "ระบบอ่านจากรูปให้แล้ว ตรวจให้ตรงกับบัตรจริงอีกครั้ง แก้ได้ทุกช่อง"
            : value.source === "ocr"
              ? "อ่านจากรูปไม่ออก — ถ่ายใหม่ให้ชัดขึ้น หรือกรอกเองก็ได้"
              : "ตรวจให้ตรงกับบัตรจริง"}
      </p>

      <div className="flex flex-col gap-1">
        <NationalIdField
          value={value.nationalId}
          onChange={(nationalId) => edit({ nationalId })}
        />
        {error ? (
          <p role="alert" className="text-11-5 text-alert">{error}</p>
        ) : mismatch ? (
          <p className="text-11-5 text-sla">
            ไม่ตรงกับเลขที่กรอกไว้ในขั้นข้อมูลส่วนตัว ({formatNationalId(typed)}) — ตรวจอีกครั้งว่าอันไหนถูก
          </p>
        ) : null}
      </div>

      <DateField
        id="doc-id-card-expiry"
        label="บัตรหมดอายุ"
        value={value.idCardExpiry}
        onChange={(v) => edit({ idCardExpiry: v })}
        optional
      />
    </div>
  );
}

/** ตำแหน่งในข้อความที่จัดรูปแล้ว ที่อยู่ถัดจากตัวเลขตัวที่ `digits` พอดี */
function caretAfterDigits(formatted: string, digits: number): number {
  if (digits <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i += 1) {
    if (/\d/.test(formatted[i]) && (seen += 1) === digits) return i + 1;
  }
  return formatted.length;
}

/**
 * ช่องเลขบัตรที่เติมขีด `x-xxxx-xxxxx-xx-x` ให้เอง — **เคอร์เซอร์อยู่ที่เดิมหลังพิมพ์**
 *
 * ค่าในช่องถูกจัดรูปใหม่ทุกครั้งที่พิมพ์ ถ้าปล่อยตามปกติ React จะเขียนค่าใหม่ทับ
 * แล้วเคอร์เซอร์เด้งไปท้ายช่อง แก้หลักกลาง ๆ ไม่ได้ · จำไว้ว่าหน้าเคอร์เซอร์มีตัวเลข
 * กี่ตัว (ขีดไม่นับ) แล้ววางกลับหลังตัวเลขตัวนั้นหลังจัดรูปเสร็จ
 *
 * ลบข้ามขีด: Backspace หลังขีด / Delete หน้าขีด ขยับข้ามขีดก่อนแล้วลบตัวเลขถัดไป
 * แทน — ไม่งั้นกดแล้วขีดถูกเติมกลับทันที ดูเหมือนปุ่มลบเสีย
 */
function NationalIdField({
  value,
  onChange,
}: {
  value: string;
  onChange: (digits: string) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const caretDigits = useRef<number | null>(null);
  const formatted = formatNationalId(value);

  useLayoutEffect(() => {
    const input = wrap.current?.querySelector("input");
    if (!input || caretDigits.current === null || document.activeElement !== input) return;
    const pos = caretAfterDigits(formatted, caretDigits.current);
    input.setSelectionRange(pos, pos);
    caretDigits.current = null;
  });

  return (
    <div
      ref={wrap}
      onChangeCapture={(e) => {
        const input = e.target as HTMLInputElement;
        const caret = input.selectionStart ?? input.value.length;
        caretDigits.current = digitsOnly(input.value.slice(0, caret)).length;
      }}
      onKeyDownCapture={(e) => {
        const input = e.target as HTMLInputElement;
        const at = input.selectionStart;
        if (at === null || at !== input.selectionEnd) return;
        if (e.key === "Backspace" && input.value[at - 1] === "-") input.setSelectionRange(at - 1, at - 1);
        if (e.key === "Delete" && input.value[at] === "-") input.setSelectionRange(at + 1, at + 1);
      }}
    >
      <TextField
        id="doc-national-id"
        label="เลขบัตรประชาชน (ตามบัตร)"
        value={formatted}
        onChange={(v) => onChange(digitsOnly(v).slice(0, 13))}
        placeholder="x-xxxx-xxxxx-xx-x"
        optional
      />
    </div>
  );
}
