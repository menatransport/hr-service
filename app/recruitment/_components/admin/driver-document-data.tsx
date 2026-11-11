"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Loader2, Pencil } from "lucide-react";

import { CandidateDocumentsModal } from "@/app/recruitment/_components/admin/candidate-documents";
import { Hidden, Section } from "@/app/recruitment/_components/admin/driver-profile-parts";
import { requestJson } from "@/lib/http";
import { mediaThumbUrl } from "@/lib/media";
import { toastError } from "@/lib/swal";
import {
  DOC_FORM_FIELDS,
  REGISTRY_DOC_KEYS,
  REGISTRY_OWNED,
  REGISTRY_SLOT_DOC_TYPES,
  dataSlots,
  type DriverDocSource,
} from "@/app/recruitment/_lib/drivers/document-sync";
import {
  driverDocumentUrl,
  formatBankAccount,
  formatLicenseGap,
  formatThaiDate,
  licenseState,
} from "@/app/recruitment/_lib/drivers/types";
import { formatNationalId } from "@/app/recruitment/_lib/form";
import type { Application, DocumentData, DocumentField } from "@/app/recruitment/_lib/types";
import type { DriverDocument } from "@/app/recruitment/_lib/drivers/types";

type Subject = Pick<Application, "id" | "ref" | "fullName" | "files" | "documents">;
type DocPatch = { files: Record<string, string | null>; documents: DocumentData };

/**
 * แท็บเอกสาร → “ข้อมูลจากเอกสาร” — **ชุดเดียวกับกล่อง “เอกสารและข้อมูลจากเอกสาร”** (Bew 8 พ.ย. 2569)
 *
 * หัวข้อ ลำดับ และชื่อช่องเดินตามคลังเอกสาร (`dataSlots` · `DOC_FORM_FIELDS`) แบบเดียวกับกล่อง · ปุ่ม
 * “แก้ไข” และรูปย่อเปิดกล่องนั้น (รูปย่อพาไปที่เอกสารใบนั้นเลย) · ค่าในแต่ละช่องมีเจ้าของที่เดียว:
 * บัตร/ใบขับขี่/บัญชีอยู่ที่ทะเบียนนี้ · ทะเบียนบ้าน ชื่อธนาคาร ชื่อบัญชี อยู่ในใบสมัคร
 * (`drivers/document-sync.ts`) — เซิร์ฟเวอร์แยกเขียนให้ หน้านี้ไม่ต้องรู้
 *
 * ไม่มีใบสมัคร (`applicationId === null` · Bew 11 พ.ย. 2569) = กล่องเดียวกัน แต่รูปเข้า/ออกแฟ้มเอกสารของทะเบียน
 * (`REGISTRY_SLOT_DOC_TYPES`) และกรอกได้เฉพาะช่องที่ทะเบียนมีที่เก็บ (`REGISTRY_DOC_KEYS`)
 */
export function DriverDocumentData({
  source,
  name,
  hidePersonal,
}: {
  source: DriverDocSource;
  /** ชื่อคนขับ — หัวกล่องเอกสารของคนที่ไม่มีใบสมัคร */
  name: string;
  /** พ้นสภาพแล้ว — ซ่อนค่าและรูป ไม่มีปุ่มแก้ (ทะเบียนไม่รับแก้ข้อมูลส่วนบุคคลของคนที่ออกแล้ว) */
  hidePersonal: boolean;
}) {
  const router = useRouter();
  const [application, setApplication] = useState<Subject | null>(null);
  const registry = source.applicationId === null;
  const formFields = registry ? DOC_FORM_FIELDS.filter((f) => REGISTRY_DOC_KEYS.includes(f.key)) : DOC_FORM_FIELDS;
  const [opening, setOpening] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  /** แนบรูปเข้าแฟ้มทะเบียนไปแล้วในรอบนี้ — ปิดกล่องโดยไม่บันทึกก็ต้องรีเฟรชให้แฟ้มเห็นไฟล์ใหม่ */
  const [uploaded, setUploaded] = useState(false);

  const slots = dataSlots(source.docSlots);
  const { documents, files } = source;

  /* ใบสมัครเต็มใบ (กล่องต้องใช้) โหลดตอนกดครั้งแรก — หน้าประวัติไม่ต้องแบกทุกครั้งที่เปิด */
  async function open(slot: string) {
    if (application) {
      setEditing(slot);
      return;
    }
    if (registry) {
      setApplication({
        id: "",
        ref: source.drivercode,
        fullName: name,
        documents: source.documents,
        files: Object.entries(source.files).map(([slot, url]) => ({ slot, url, uploadedAt: "" })),
      });
      setEditing(slot);
      return;
    }
    setOpening(slot);
    try {
      const app = await requestJson<Application | null>(
        `/api/recruitment/applications/${source.applicationId}`,
        {},
        "โหลดใบสมัครไม่สำเร็จ",
      );
      if (!app) throw new Error("ไม่พบใบสมัครนี้แล้ว");
      setApplication(app);
      setEditing(slot);
    } catch (err) {
      toastError("เปิดเอกสารไม่สำเร็จ", err instanceof Error ? err.message : undefined);
    } finally {
      setOpening(null);
    }
  }

  /* ยิงตัวเดียวกับหน้าผู้สมัคร — เซิร์ฟเวอร์เขียนช่องของทะเบียนลงทะเบียนเอง · โยน error ให้กล่องโชว์ */
  async function save(patch: DocPatch) {
    if (registry) return saveRegistry(patch);
    const next = await requestJson<Application>(
      `/api/recruitment/applications/${source.applicationId}`,
      { method: "PATCH", body: patch },
      "บันทึกเอกสารไม่สำเร็จ",
    );
    setApplication(next);
    router.refresh();
  }

  const base = `/api/drivers/${encodeURIComponent(source.drivercode)}`;

  /** ไม่มีใบสมัคร — แนบ = เพิ่มเข้ากองในแฟ้มเอกสารทันที (ฉบับเก่ายังอยู่) แล้วโชว์ฉบับนั้นในกล่อง */
  async function uploadRegistry(slot: string, file: File): Promise<string> {
    const docType = REGISTRY_SLOT_DOC_TYPES[slot];
    if (!docType) throw new Error("ช่องนี้แนบเข้าทะเบียนไม่ได้");
    const body = new FormData();
    body.append("file", file);
    body.append("docType", docType);
    const { documents } = await requestJson<{ documents: DriverDocument[] }>(
      `${base}/documents`,
      { method: "POST", body },
      "อัปโหลดไม่สำเร็จ",
    );
    const latest = documents
      .filter((d) => d.docType === docType)
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))[0];
    if (!latest) throw new Error("อัปโหลดแล้วแต่ไม่พบไฟล์ในแฟ้ม");
    setUploaded(true);
    return driverDocumentUrl(source.drivercode, latest.fileId);
  }

  /** ไม่มีใบสมัคร — ช่องที่เปลี่ยนเขียนลงทะเบียน · กดเอารูปออก = ลบฉบับที่โชว์อยู่ออกจากแฟ้ม */
  async function saveRegistry(patch: DocPatch) {
    const changes: Record<string, string> = {};
    for (const { doc, field } of REGISTRY_OWNED) {
      const value = patch.documents[doc].trim();
      if (value !== source.documents[doc].trim()) changes[field.key] = value;
    }
    if (Object.keys(changes).length)
      await requestJson(`${base}`, { method: "PATCH", body: changes }, "บันทึกข้อมูลเอกสารไม่สำเร็จ");

    for (const [slot, url] of Object.entries(source.files)) {
      if (patch.files[slot] !== null) continue;
      const fileId = url.slice(url.lastIndexOf("/") + 1);
      await requestJson(`${base}/documents/${encodeURIComponent(fileId)}`, { method: "DELETE" }, "ลบรูปไม่สำเร็จ");
    }
    setApplication(null);
    setUploaded(false);
    router.refresh();
  }

  const firstOpen = slots.find((s) => files[s.id] && formFields.some((f) => f.slot === s.id && !documents[f.key]))
    ?.id ?? slots[0]?.id ?? "";

  return (
    <Section
      title="ข้อมูลจากเอกสาร"
      note={
        hidePersonal
          ? undefined
          : registry
            ? "ไม่มีใบสมัครในระบบ · รูปที่แนบเข้าแฟ้มเอกสารด้านล่าง ข้อมูลเก็บที่ทะเบียนนี้"
            : `ชุดเดียวกับเอกสารในใบสมัคร ${source.ref} · บัตร ใบขับขี่ และบัญชีเก็บที่ทะเบียนนี้ที่เดียว`
      }
      action={
        hidePersonal ? undefined : (
          <button
            type="button"
            onClick={() => void open(firstOpen)}
            disabled={opening !== null}
            className="btn-sec flex items-center gap-1.5 px-2.5 py-1.5 text-12 transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-60"
          >
            {opening !== null ? (
              <Loader2 size={12} strokeWidth={2} aria-hidden className="animate-spin" />
            ) : (
              <Pencil size={12} strokeWidth={1.9} aria-hidden />
            )}
            แก้ไข
          </button>
        )
      }
    >
      <div className="flex flex-col divide-y divide-line">
        {slots.map((slot) => {
          const fields = formFields.filter((f) => f.slot === slot.id);
          const filled = fields.filter((f) => documents[f.key]).length;
          const url = files[slot.id];
          const done = Boolean(url) && filled === fields.length;
          return (
            <div
              key={slot.id}
              className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-6"
            >
              <div className="flex items-start gap-3">
                {hidePersonal ? (
                  <span className="flex h-10 w-14 flex-none items-center justify-center rounded-field border border-line bg-base-200 text-mut">
                    <Camera size={14} strokeWidth={1.8} aria-hidden />
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void open(slot.id)}
                    disabled={opening !== null}
                    title={`เปิด${slot.label}ในกล่องเอกสาร`}
                    className="group relative flex h-10 w-14 flex-none cursor-pointer items-center justify-center overflow-hidden rounded-field border border-line bg-base-200 text-mut transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={mediaThumbUrl(url, 160)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="size-full object-cover transition-transform duration-300 group-hover:scale-110"
                      />
                    ) : (
                      <Camera size={14} strokeWidth={1.8} aria-hidden />
                    )}
                    {opening === slot.id ? (
                      <span className="absolute inset-0 flex items-center justify-center bg-base-100/75 text-primary">
                        <Loader2 size={14} strokeWidth={2} aria-hidden className="animate-spin" />
                      </span>
                    ) : null}
                  </button>
                )}
                <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
                  <h3 className="text-13 font-semibold leading-tight">{slot.label}</h3>
                  {hidePersonal ? null : (
                    <span className={`flex items-center gap-1 text-11-5 ${done ? "text-st-ok-ink" : "text-mut"}`}>
                      {done ? <Check size={12} strokeWidth={2.4} aria-hidden /> : null}
                      {url ? `กรอก ${filled}/${fields.length}` : "ยังไม่แนบรูป"}
                    </span>
                  )}
                </div>
              </div>

              <dl className="grid gap-x-10 gap-y-3 sm:grid-cols-2">
                {hidePersonal ? (
                  <Hidden label={fields[0]?.label ?? slot.label} />
                ) : (
                  fields.map((field) => (
                    <Value key={field.key} field={field} value={documents[field.key]} />
                  ))
                )}
              </dl>
            </div>
          );
        })}
      </div>

      {editing !== null && application ? (
        <CandidateDocumentsModal
          application={application}
          docSlots={source.docSlots}
          initialSlot={editing}
          onlyFields={registry ? REGISTRY_DOC_KEYS : undefined}
          onUpload={registry ? uploadRegistry : undefined}
          onPatch={save}
          onClose={() => {
            setEditing(null);
            /* ทะเบียน: เปิดใหม่ต้องอ่านจากหน้าล่าสุด ไม่ใช่สำเนาที่เปิดค้างไว้ */
            if (registry) setApplication(null);
            if (uploaded) {
              setUploaded(false);
              router.refresh();
            }
          }}
        />
      ) : null}
    </Section>
  );
}

/** วันนี้ถึงวันที่ `iso` กี่วัน (ตามวันในปฏิทินเครื่องผู้ใช้) — ติดลบ = เลยมาแล้ว */
function daysUntil(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - today) / 86_400_000);
}

/** หนึ่งช่อง — ชื่อช่องเดียวกับในกล่อง · วันหมดอายุบอกว่าเหลือกี่วัน */
function Value({ field, value }: { field: DocumentField; value: string }) {
  const text = value.trim();
  const mono = field.kind === "nid" || field.kind === "digits" || field.key === "licenseNo";
  const shown =
    field.kind === "nid"
      ? formatNationalId(text)
      : field.key === "bankAccountNo"
        ? formatBankAccount(text)
        : field.kind === "date"
          ? formatThaiDate(text, "full")
          : text;

  const days = field.kind === "date" && /Expiry$/.test(field.key) && text ? daysUntil(text) : null;
  const state = days === null ? null : licenseState(days);
  const tone = state === "expired" ? "text-alert font-medium" : state === "soon" ? "text-sla font-medium" : "text-mut";

  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${field.key === "address" ? "sm:col-span-2" : ""}`}>
      <dt className="text-11-5 text-mut">{field.label}</dt>
      <dd className="m-0 flex flex-col gap-0.5">
        {text ? (
          <span className={mono ? "font-mono text-13" : "text-13-5"}>{shown}</span>
        ) : (
          <span className="text-13 text-mut">ยังไม่ระบุ</span>
        )}
        {days !== null ? <span className={`text-11-5 ${tone}`}>{formatLicenseGap(days)}</span> : null}
      </dd>
    </div>
  );
}
