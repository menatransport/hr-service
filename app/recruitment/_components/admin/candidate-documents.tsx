"use client";

import { useRef, useState } from "react";
import {
  Camera,
  Loader2,
  ScanLine,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import { DateField, TextField } from "@/components/ui/field";
import { ModalShell } from "@/components/ui/modal-shell";
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
 * ปุ่ม **“อ่านข้อมูลจากเอกสาร”** ยังกดไม่ได้ — ระบบอ่านเอกสารอัตโนมัติยังไม่ได้
 * ต่อเข้ามา · เหลือปุ่มไว้พร้อมข้อความบอกตรง ๆ ว่ายังไม่ทำงาน ดีกว่าซ่อนทิ้งแล้ว
 * ไม่มีใครรู้ว่าช่องพวกนี้ออกแบบมาให้เครื่องเติมให้ · ตอนนี้กรอกมือได้ทุกช่อง
 * และทุกช่องถูกตรวจรูปแบบตามเอกสารไทยจริง (เลขบัตร 13 หลักตรวจหลักสุดท้าย ·
 * เลขประจำบ้าน 11 หลัก · เลขที่บัญชี 10–15 หลัก)
 */

const MAX_MB = 10;

export function CandidateDocumentsModal({
  application,
  docSlots,
  onPatch,
  onClose,
}: {
  application: Application;
  /**
   * ทุกช่องรวมที่ซ่อนจากผู้สมัคร — ฝ่ายบุคคลยังแนบเองได้ทุกช่อง (เช่นใบรับรองแพทย์
   * ที่ไม่ได้ขอตอนสมัครแต่ถือมาวันสัมภาษณ์) ช่องที่ซ่อนมีป้ายบอกไว้
   */
  docSlots: DocSlot[];
  onPatch: (patch: {
    files: Record<string, string | null>;
    documents: DocumentData;
  }) => Promise<void>;
  onClose: () => void;
}) {
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
    for (const field of DOCUMENT_FIELDS) {
      const message = validateDocumentField(field, documents[field.key]);
      if (message) found[field.key] = message;
    }
    if (Object.keys(found).length) {
      setErrors(found);
      setFailure("ยังมีช่องที่กรอกไม่ถูกต้อง — ดูข้อความใต้ช่องที่ขอบแดง");
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
      width="820px"
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
            className="rounded-field border border-line px-3.5 py-2.5 text-13 transition-colors hover:border-primary/40 disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 rounded-field bg-primary px-4 py-2.5 text-13 font-medium text-primary-content transition-opacity hover:opacity-90 disabled:opacity-60"
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
          <TriangleAlert
            size={14}
            strokeWidth={2}
            aria-hidden
            className="mt-0.5 flex-none"
          />
          {failure}
        </p>
      ) : null}

      {/* ปุ่มอ่านอัตโนมัติยังไม่ทำงาน — บอกตรง ๆ ตรงนี้ดีกว่าให้กดแล้วเงียบ */}
      <div className="flex flex-wrap items-center gap-3 rounded-box border border-dashed border-line px-3.5 py-3">
        <button
          type="button"
          disabled
          title="ยังไม่ได้เชื่อมระบบอ่านเอกสาร"
          className="flex flex-none items-center gap-2 rounded-field border border-line px-3 py-2 text-12-5 text-mut opacity-60"
        >
          <ScanLine size={14} strokeWidth={2} aria-hidden />
          อ่านข้อมูลจากเอกสาร
        </button>
        <p className="min-w-0 flex-1 text-12 leading-relaxed text-mut text-pretty">
          ระบบอ่านเอกสารอัตโนมัติยังไม่ได้เชื่อมต่อ — ตอนนี้กรอกข้อมูลเองได้ทุกช่อง
          ระบบตรวจรูปแบบตามเอกสารไทยให้แล้ว
        </p>
      </div>

      <fieldset disabled={saving} className="flex flex-col gap-5">
        {slots.map((slot) => (
          <SlotBlock
            key={slot.id}
            applicationId={application.id}
            slot={slot}
            url={files[slot.id] ?? null}
            onUrl={(url) => setFiles((prev) => ({ ...prev, [slot.id]: url }))}
            fields={DOCUMENT_FIELDS.filter((f) => f.slot === slot.id)}
            documents={documents}
            errors={errors}
            onField={setField}
          />
        ))}
      </fieldset>
    </ModalShell>
  );
}

/* ─────────────────────────────────────────── หนึ่งเอกสาร = หนึ่งบล็อก */

function SlotBlock({
  applicationId,
  slot,
  url,
  onUrl,
  fields,
  documents,
  errors,
  onField,
}: {
  /** ไฟล์ขึ้นโฟลเดอร์ของใบนี้บน S3 (`mass-image/applications/{ref}/{slot}/`) */
  applicationId: string;
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
      const body = new FormData();
      body.append("file", await prepareImageForUpload(file));
      body.append("slot", slot.id);
      const res = await fetch(
        `/api/recruitment/applications/${encodeURIComponent(applicationId)}/files`,
        { method: "POST", body },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.url) throw new Error(json?.error ?? "อัปโหลดไม่สำเร็จ");
      onUrl(json.url as string);
    } catch (err) {
      /* ล้มเหลวต้องไม่ทิ้งสถานะ “แนบแล้ว” ไว้หลอกตา ของจริงยังไม่ขึ้นเซิร์ฟเวอร์ */
      setError(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  const hasData = fields.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <span className="text-12-5 font-semibold tracking-[0.04em]">
          {slot.label}
        </span>
        {!slot.visible ? (
          <span className="rounded-full bg-base-200 px-1.5 py-0.5 text-10-5 text-mut">
            ไม่อยู่ในฟอร์มผู้สมัคร
          </span>
        ) : slot.required ? null : (
          <span className="rounded-full bg-base-200 px-1.5 py-0.5 text-10-5 text-mut">
            ไม่บังคับ
          </span>
        )}
        <span aria-hidden className="h-px flex-1 bg-line" />
      </div>

      <div className={`grid gap-3 ${hasData ? "sm:grid-cols-[168px_1fr]" : ""}`}>
        {/* รูปจริง ไม่ใช่ไอคอนติ๊กถูก — คนตรวจต้องเห็นว่าใบไหนเบลอก่อนจะเชื่อ
            ตัวเลขที่กรอกอยู่ข้าง ๆ · `<img>` ตรง ๆ เพราะ `/api/media/…` เด้งต่อไป
            ลิงก์ presigned ของ S3 ซึ่ง `next/image` ตามไม่ได้ */}
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className={`relative flex aspect-[3/2] w-full items-center justify-center overflow-hidden rounded-box border transition-colors disabled:opacity-70 ${
              url
                ? "border-line hover:border-primary/45"
                : "border-dashed border-line bg-base-200 hover:border-primary/40"
            }`}
          >
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt={slot.label}
                loading="lazy"
                decoding="async"
                className="size-full object-cover"
              />
            ) : (
              <span className="flex flex-col items-center gap-1 text-mut">
                <Camera size={18} strokeWidth={1.8} aria-hidden />
                <span className="text-11-5">แนบเอกสาร</span>
              </span>
            )}

            {busy ? (
              <span className="absolute inset-0 flex items-center justify-center bg-base-100/75 text-primary">
                <Loader2 size={18} strokeWidth={2} aria-hidden className="animate-spin" />
              </span>
            ) : null}
          </button>

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

          <div className="flex items-center gap-2 text-11-5">
            <span className="min-w-0 flex-1 truncate text-mut">
              {url ? "แนบแล้ว" : "ยังไม่ได้แนบ"}
            </span>
            {url ? (
              <button
                type="button"
                onClick={() => onUrl(null)}
                className="flex items-center gap-1 rounded-selector px-1 py-0.5 text-mut transition-colors hover:text-alert"
              >
                <Trash2 size={11} strokeWidth={2} aria-hidden />
                เอาออก
              </button>
            ) : null}
          </div>

          {error ? (
            <p role="alert" className="text-11-5 text-alert">
              {error}
            </p>
          ) : null}
        </div>

        {hasData ? (
          <div className="grid gap-3 sm:grid-cols-2">
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
