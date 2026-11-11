"use client";

import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  ExternalLink,
  Loader2,
  RotateCw,
  Trash2,
  TriangleAlert,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { DateField, TextField } from "@/components/ui/field";
import { ModalShell } from "@/components/ui/modal-shell";
import {
  ImageTextButton,
  ImageTextPanel,
  useImageText,
} from "@/app/recruitment/_components/admin/doc-text-reader";
import {
  ACCEPTED_LABEL,
  ACCEPT_ATTR,
  isAcceptedImage,
  prepareImageForUpload,
} from "@/lib/image-resize";
import {
  digitsOnly,
  slotsForApplication,
  validateDocumentField,
  type DocSlot,
} from "@/app/recruitment/_lib/form";
import {
  DOCUMENT_FIELDS,
  type Application,
  type DocumentData,
  type DocumentField,
} from "@/app/recruitment/_lib/types";

/**
 * กล่องเอกสารของผู้สมัคร — **ซ้อนอยู่บนรายงาน** แนบเอกสารและเก็บข้อมูลในเอกสาร
 *
 * ทำไมฝ่ายบุคคลต้องแนบเองได้ ทั้งที่ผู้สมัครแนบมาแล้วตอนสมัคร: เพราะวันสัมภาษณ์
 * ผู้สมัครถือตัวจริงมาด้วยเสมอ และรูปที่ถ่ายส่งมาตอนสมัครมักเบลอหรือถ่ายไม่ครบ
 * หน้า · หน้าสมุดบัญชีก็มักยังไม่มีตอนสมัคร เพราะยังไม่รู้ว่าจะได้งานหรือเปล่า
 *
 * **ข้อมูลในเอกสารแยกจากคำตอบในใบสมัครโดยตั้งใจ** (ดู `DocumentData`) — คำตอบคือ
 * สิ่งที่ผู้สมัครพิมพ์มา ส่วนนี่คือสิ่งที่เอกสารราชการเขียนไว้ · ไม่ตรงกันได้บ่อย
 * และเวลาไม่ตรง ฝ่ายบุคคลต้องเห็นทั้งสองค่า ไม่ใช่ให้ค่าหนึ่งทับอีกค่าเงียบ ๆ
 *
 * ทรง (Bew 2 พ.ย. 2569): ซ้ายเป็นรายการเอกสาร · ขวาเป็นรูปใหญ่ของเอกสารที่เลือก
 * ข้างช่องกรอกของมัน ให้อ่านจากรูปแล้วพิมพ์ได้โดยไม่ต้องเลื่อนหา · รูปซูม/หมุนได้
 * เพราะรูปจากมือถือมักตะแคงและตัวเลขบนบัตรเล็ก · ช่องที่ซ้ำกับคำตอบในใบสมัคร
 * (`legacy`) ไม่ขึ้นให้กรอกแล้ว
 */

const MAX_MB = 10;
const ZOOM = 2.5;

const ALL_FORM_FIELDS = DOCUMENT_FIELDS.filter((f) => !f.legacy);

export function CandidateDocumentsModal({
  application,
  docSlots,
  initialSlot,
  onlyFields,
  onUpload,
  onPatch,
  onClose,
}: {
  /** ใบสมัคร — หรือเจ้าของเอกสารที่ไม่มีใบสมัคร (พจส. เก่าในทะเบียน · `driver-document-data.tsx`) */
  application: Pick<Application, "id" | "ref" | "fullName" | "files" | "documents">;
  /** ช่องกรอกที่ให้เห็น — ไม่ส่ง = ทุกช่อง · ทะเบียนที่ไม่มีใบสมัครรับแค่ช่องที่ทะเบียนมีที่เก็บ */
  onlyFields?: readonly (keyof DocumentData)[];
  /** อัปรูปของช่อง `slot` แล้วคืน url — ไม่ส่ง = ขึ้นโฟลเดอร์ใบสมัคร (`/api/recruitment/applications/{id}/files`) */
  onUpload?: (slot: string, file: File) => Promise<string>;
  /**
   * ทุกช่องรวมที่ซ่อนจากผู้สมัคร — ฝ่ายบุคคลยังแนบเองได้ทุกช่อง (เช่นใบรับรองแพทย์
   * ที่ไม่ได้ขอตอนสมัครแต่ถือมาวันสัมภาษณ์) ช่องที่ซ่อนมีป้ายบอกไว้
   */
  docSlots: DocSlot[];
  /** เปิดมาที่เอกสารนี้ — เช่น กดรูปของบัตรประชาชนในหน้าประวัติ พจส. */
  initialSlot?: string;
  onPatch: (patch: {
    files: Record<string, string | null>;
    documents: DocumentData;
  }) => Promise<void>;
  onClose: () => void;
}) {
  const FORM_FIELDS = onlyFields ? ALL_FORM_FIELDS.filter((f) => onlyFields.includes(f.key)) : ALL_FORM_FIELDS;
  /* ทุกช่องในคลัง + ช่องที่ถูกลบไปแล้วแต่ใบนี้ยังมีไฟล์ — ต้องเห็นเพื่อลบทิ้งหรือเก็บไว้ได้ */
  const [slots] = useState(() => [
    ...docSlots,
    ...slotsForApplication(docSlots, application.files).filter(
      (s) => !docSlots.some((d) => d.id === s.id),
    ),
  ]);
  const [files, setFiles] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(
      slots.map((slot) => [
        slot.id,
        application.files.find((f) => f.slot === slot.id)?.url ?? null,
      ]),
    ),
  );
  const [documents, setDocuments] = useState<DocumentData>(() => ({
    ...application.documents,
  }));
  /* เริ่มที่เอกสารแรกที่มีรูปและมีช่องให้กรอก — คืองานที่ต้องทำก่อน */
  const [active, setActive] = useState(
    () =>
      slots.find((s) => s.id === initialSlot)?.id ??
      slots.find((s) => files[s.id] && FORM_FIELDS.some((f) => f.slot === s.id))?.id ??
      slots[0]?.id ??
      "",
  );
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");

  function setField(field: DocumentField, value: string) {
    setDocuments((prev) => ({ ...prev, [field.key]: value }));
    setErrors((prev) => {
      if (!prev[field.key]) return prev;
      const next = { ...prev };
      delete next[field.key];
      return next;
    });
  }

  async function save() {
    const found: Record<string, string> = {};
    for (const field of FORM_FIELDS) {
      const message = validateDocumentField(field, documents[field.key]);
      if (message) found[field.key] = message;
    }
    if (Object.keys(found).length) {
      setErrors(found);
      const first = FORM_FIELDS.find((f) => found[f.key]);
      if (first) setActive(first.slot);
      setFailure("ยังมีช่องที่กรอกไม่ถูกต้อง");
      return;
    }

    setSaving(true);
    setFailure("");
    try {
      await onPatch({ files, documents });
      onClose();
    } catch (err) {
      setFailure(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
      setSaving(false);
    }
  }

  const attached = slots.filter((s) => files[s.id]).length;
  /* ตัวหารนับเฉพาะช่องที่ใบนี้ต้องใช้ — ไม่งั้นช่องที่ซ่อนอยู่จะทำให้ไม่มีวัน “ครบ” */
  const expected = slotsForApplication(
    docSlots,
    slots.filter((s) => files[s.id]).map((s) => ({ slot: s.id, label: s.label })),
  ).length;

  const current = slots.find((s) => s.id === active);

  return (
    <ModalShell
      title="เอกสารและข้อมูลจากเอกสาร"
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <span>{application.fullName}</span>
          <span className="font-mono text-11-5 tracking-wider text-primary">
            {application.ref}
          </span>
          <span className="tabular-nums">
            แนบแล้ว {attached} จาก {expected} รายการ
          </span>
        </span>
      }
      onClose={onClose}
      width="1080px"
      tone="plain"
      footer={
        <>
          <span className="mr-auto text-12 text-mut">
            การแก้ไขจะถูกบันทึกลงประวัติพร้อมชื่อผู้แก้และเวลา
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="btn-sec px-3.5 py-2.5 text-13 transition-colors hover:border-primary/40 disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="btn-pri flex items-center gap-2 px-4 py-2.5 text-13 font-medium disabled:opacity-60"
          >
            {saving ? (
              <Loader2 size={14} strokeWidth={2} aria-hidden className="animate-spin" />
            ) : null}
            บันทึก
          </button>
        </>
      }
    >
      {failure ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-field bg-alert/10 px-3 py-2.5 text-12-5 text-alert"
        >
          <TriangleAlert size={14} strokeWidth={2} aria-hidden className="mt-0.5 flex-none" />
          {failure}
        </p>
      ) : null}

      <fieldset
        disabled={saving}
        className="grid min-w-0 gap-4 md:grid-cols-[208px_minmax(0,1fr)]"
      >
        {/* รายการเอกสาร — มือถือเป็นแถบเลื่อนข้าง จอใหญ่เป็นคอลัมน์ซ้าย */}
        <nav
          aria-label="เอกสาร"
          className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-col md:overflow-visible md:px-0 md:pb-0"
        >
          {slots.map((slot) => {
            const fields = FORM_FIELDS.filter((f) => f.slot === slot.id);
            const filled = fields.filter((f) => documents[f.key]).length;
            const hasError = fields.some((f) => errors[f.key]);
            const url = files[slot.id];
            const on = slot.id === active;
            return (
              <button
                key={slot.id}
                type="button"
                onClick={() => setActive(slot.id)}
                aria-current={on ? "true" : undefined}
                className={`flex min-w-[176px] flex-none items-center gap-2.5 rounded-field border px-2 py-1.5 text-left transition-colors md:min-w-0 ${
                  on
                    ? "border-primary/50 bg-primary/8"
                    : "border-transparent hover:bg-base-200"
                }`}
              >
                <span className="flex h-9 w-12 flex-none items-center justify-center overflow-hidden rounded-selector border border-line bg-base-200">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="" loading="lazy" className="size-full object-cover" />
                  ) : (
                    <Camera size={13} strokeWidth={1.8} aria-hidden className="text-mut" />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-12-5 font-medium">{slot.label}</span>
                  <span
                    className={`truncate text-11 ${hasError ? "text-alert" : "text-mut"}`}
                  >
                    {!url
                      ? slot.required && slot.visible
                        ? "ยังไม่แนบ · จำเป็น"
                        : "ยังไม่แนบ"
                      : fields.length
                        ? `กรอก ${filled}/${fields.length}`
                        : "แนบแล้ว"}
                  </span>
                </span>
                {url && (!fields.length || filled === fields.length) && !hasError ? (
                  <Check size={13} strokeWidth={2.4} aria-hidden className="flex-none text-st-ok-ink" />
                ) : null}
              </button>
            );
          })}
        </nav>

        {current ? (
          <SlotPanel
            key={current.id}
            upload={
              onUpload
                ? (file) => onUpload(current.id, file)
                : (file) => uploadToApplication(application.id, current.id, file)
            }
            slot={current}
            url={files[current.id] ?? null}
            onUrl={(url) => setFiles((prev) => ({ ...prev, [current.id]: url }))}
            fields={FORM_FIELDS.filter((f) => f.slot === current.id)}
            documents={documents}
            errors={errors}
            onField={setField}
          />
        ) : null}
      </fieldset>
    </ModalShell>
  );
}

/* ─────────────────────────────────────────── เอกสารที่เลือก: รูป + ช่องกรอก */

/** อัปรูปขึ้นโฟลเดอร์ของใบสมัครบน S3 (`mass-image/applications/{ref}/{slot}/`) — คืน url */
async function uploadToApplication(applicationId: string, slot: string, file: File): Promise<string> {
  const body = new FormData();
  body.append("file", file);
  body.append("slot", slot);
  const res = await fetch(`/api/recruitment/applications/${encodeURIComponent(applicationId)}/files`, {
    method: "POST",
    body,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.url) throw new Error(json?.error ?? "อัปโหลดไม่สำเร็จ");
  return json.url as string;
}

function SlotPanel({
  upload: send,
  slot,
  url,
  onUrl,
  fields,
  documents,
  errors,
  onField,
}: {
  /** ส่งรูป (ย่อแล้ว) ขึ้นที่เก็บของเจ้าของเอกสาร — คืน url */
  upload: (file: File) => Promise<string>;
  slot: DocSlot;
  url: string | null;
  onUrl: (url: string | null) => void;
  fields: DocumentField[];
  documents: DocumentData;
  errors: Partial<Record<string, string>>;
  onField: (field: DocumentField, value: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File) {
    if (!isAcceptedImage(file)) {
      setError(`แนบได้เฉพาะไฟล์ ${ACCEPTED_LABEL}`);
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`ไฟล์ใหญ่เกิน ${MAX_MB} MB — ย่อรูปก่อนแล้วลองใหม่`);
      return;
    }

    setError("");
    setBusy(true);
    try {
      onUrl(await send(await prepareImageForUpload(file)));
    } catch (err) {
      /* ล้มเหลวต้องไม่ทิ้งสถานะ “แนบแล้ว” ไว้หลอกตา ของจริงยังไม่ขึ้นเซิร์ฟเวอร์ */
      setError(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  const hasData = fields.length > 0;
  const ocr = useImageText(url);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-14 font-semibold">{slot.label}</span>
        {!slot.visible ? (
          <span className="rounded-full bg-base-200 px-1.5 py-0.5 text-10-5 text-mut">
            ไม่อยู่ในฟอร์มผู้สมัคร
          </span>
        ) : slot.required ? null : (
          <span className="rounded-full bg-base-200 px-1.5 py-0.5 text-10-5 text-mut">
            ไม่บังคับ
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          {url && !busy ? <ImageTextButton state={ocr.state} onClick={() => void ocr.read()} /> : null}
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="btn-sec flex items-center gap-1.5 px-2.5 py-1.5 text-12 disabled:opacity-50"
          >
            <Upload size={12} strokeWidth={2} aria-hidden />
            {url ? "เปลี่ยนรูป" : "แนบรูป"}
          </button>
          {url ? (
            <>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                title="เปิดรูปเต็มในแท็บใหม่"
                className="flex items-center rounded-selector p-1.5 text-mut transition-colors hover:text-primary"
              >
                <ExternalLink size={14} strokeWidth={2} aria-hidden />
                <span className="sr-only">เปิดรูปเต็มในแท็บใหม่</span>
              </a>
              <button
                type="button"
                onClick={() => onUrl(null)}
                title="เอารูปออก"
                className="flex items-center rounded-selector p-1.5 text-mut transition-colors hover:text-alert"
              >
                <Trash2 size={14} strokeWidth={2} aria-hidden />
                <span className="sr-only">เอารูปออก</span>
              </button>
            </>
          ) : null}
        </span>
        <input
          ref={input}
          type="file"
          accept={ACCEPT_ATTR}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file);
          }}
        />
      </div>

      {error ? (
        <p role="alert" className="text-12 text-alert">
          {error}
        </p>
      ) : null}

      <div className={`grid min-w-0 gap-4 ${hasData ? "lg:grid-cols-[minmax(0,1fr)_260px]" : ""}`}>
        {/* `key` = รูปใหม่เริ่มมุมตรง ไม่ซูม */}
        <Preview
          key={url ?? ""}
          url={url}
          label={slot.label}
          busy={busy}
          onPick={() => input.current?.click()}
          onDrop={(file) => void upload(file)}
        />

        {hasData ? (
          <div className="flex flex-col gap-3">
            {fields.map((field) => (
              <DocField
                key={field.key}
                field={field}
                value={documents[field.key]}
                error={errors[field.key]}
                onChange={(v) => onField(field, v)}
              />
            ))}
          </div>
        ) : null}
      </div>

      {ocr.state?.status === "done" ? (
        <ImageTextPanel label={slot.label} text={ocr.state.text} onChange={ocr.setText} onClose={ocr.clear} />
      ) : null}
    </div>
  );
}

/**
 * รูปเอกสารขนาดใหญ่ — คลิกซูมตรงจุดที่ชี้ (ขยับเมาส์เพื่อเลื่อนดู) · หมุนทีละ 90°
 * · ยังไม่มีรูป = กดหรือลากไฟล์มาวางเพื่อแนบ
 *
 * ซูมที่กล่องนอก หมุนที่รูปข้างใน — จุดซูมจึงคิดจากพิกัดบนจอตรง ๆ ไม่ต้องแปลงตามมุมหมุน
 * · `<img>` ตรง ๆ เพราะ `/api/media/…` เด้งต่อไปลิงก์ presigned ของ S3 ซึ่ง
 * `next/image` ตามไม่ได้
 */
function Preview({
  url,
  label,
  busy,
  onPick,
  onDrop,
}: {
  url: string | null;
  label: string;
  busy: boolean;
  onPick: () => void;
  onDrop: (file: File) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(false);
  const [origin, setOrigin] = useState("50% 50%");
  const [turn, setTurn] = useState(0);
  const [over, setOver] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function aim(e: React.MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setOrigin(
      `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}% ${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`,
    );
  }

  const sideways = turn % 2 === 1;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div
        ref={box}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) onDrop(file);
        }}
        className={`relative h-[min(56vh,460px)] min-h-[260px] overflow-hidden rounded-box border ${
          over
            ? "border-primary bg-primary/8"
            : url
              ? "border-line bg-base-200"
              : "border-dashed border-line bg-base-200"
        }`}
      >
        {url ? (
          <div
            role="button"
            tabIndex={0}
            aria-label={zoom ? "ย่อรูป" : "ซูมรูป"}
            onClick={(e) => {
              aim(e);
              setZoom((z) => !z);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setZoom((z) => !z);
              }
            }}
            onMouseMove={zoom ? aim : undefined}
            className={`flex size-full items-center justify-center transition-transform duration-150 ${
              zoom ? "cursor-zoom-out" : "cursor-zoom-in"
            }`}
            style={{ transform: `scale(${zoom ? ZOOM : 1})`, transformOrigin: origin }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={label}
              decoding="async"
              draggable={false}
              className="flex-none object-contain"
              style={{
                width: sideways ? size.h : size.w,
                height: sideways ? size.w : size.h,
                transform: `rotate(${turn * 90}deg)`,
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={onPick}
            className="flex size-full flex-col items-center justify-center gap-2 text-mut transition-colors hover:text-primary"
          >
            <Camera size={22} strokeWidth={1.6} aria-hidden />
            <span className="text-12-5">กดเพื่อแนบรูป หรือลากไฟล์มาวาง</span>
          </button>
        )}

        {busy ? (
          <span className="absolute inset-0 flex items-center justify-center bg-base-100/75 text-primary">
            <Loader2 size={20} strokeWidth={2} aria-hidden className="animate-spin" />
          </span>
        ) : null}
      </div>

      {url ? (
        <div className="flex items-center gap-1 text-11-5 text-mut">
          <span className="mr-auto">คลิกที่รูปเพื่อซูม</span>
          <button
            type="button"
            onClick={() => setZoom((z) => !z)}
            className="flex items-center gap-1 rounded-selector px-1.5 py-1 transition-colors hover:text-primary"
          >
            {zoom ? (
              <ZoomOut size={13} strokeWidth={2} aria-hidden />
            ) : (
              <ZoomIn size={13} strokeWidth={2} aria-hidden />
            )}
            {zoom ? "ย่อ" : "ซูม"}
          </button>
          <button
            type="button"
            onClick={() => setTurn((t) => (t + 1) % 4)}
            className="flex items-center gap-1 rounded-selector px-1.5 py-1 transition-colors hover:text-primary"
          >
            <RotateCw size={13} strokeWidth={2} aria-hidden />
            หมุน
          </button>
        </div>
      ) : null}
    </div>
  );
}

function DocField({
  field,
  value,
  error,
  onChange,
}: {
  field: DocumentField;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  const common = {
    id: `doc-${field.key}`,
    label: field.label,
    hint: error ? undefined : field.hint,
    optional: true,
  };

  return (
    <div className="flex flex-col gap-1">
      {field.kind === "date" ? (
        <DateField {...common} value={value} onChange={onChange} />
      ) : field.kind === "nid" || field.kind === "digits" ? (
        <TextField
          {...common}
          type="tel"
          value={value}
          onChange={(v) =>
            onChange(digitsOnly(v).slice(0, field.kind === "nid" ? 13 : (field.digits ?? 15)))
          }
        />
      ) : (
        <TextField {...common} value={value} onChange={onChange} />
      )}
      {error ? (
        <p role="alert" className="text-11-5 text-alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
