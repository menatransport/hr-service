"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, FileText, Loader2, Plus, RefreshCw, ScanText, Trash2, Upload } from "lucide-react";

import { requestJson } from "@/lib/http";
import { escapeHtml, runAction, toastError } from "@/lib/swal";
import { attachmentKind, formatFileSize } from "@/lib/record-case-flow";
import type { ScanDocKind } from "@/app/recruitment/_lib/id-card-ocr";
import {
  REQUIRED_DOC_COUNT,
  driverDocumentUrl,
  expiryState,
  formatExpiryGap,
  formatThaiDate,
  formatThaiDateTime,
  groupDriverDocuments,
  missingRequiredDocs,
  type DriverDocGroup,
  type DriverDocType,
  type DriverDocument,
  type DriverRecord,
} from "@/app/recruitment/_lib/drivers/types";
import {
  DriverDocumentViewer,
  type ViewerItem,
} from "@/app/recruitment/_components/admin/driver-document-viewer";
import { DriverDocumentScan } from "@/app/recruitment/_components/admin/driver-document-scan";
import { HrDocumentMaker } from "@/app/recruitment/_components/admin/hr-document-maker";
import { SignatureLoaderOverlay } from "@/app/recruitment/_components/signature-loader";
import type { DriverHrLink } from "@/app/recruitment/_lib/drivers/driver-hr";
import type { DocSlot } from "@/app/recruitment/_lib/form";
import type { HrDocId } from "@/app/recruitment/_lib/hr-documents";
import type { Requisition } from "@/app/recruitment/_lib/requisitions/types";
import type { Application } from "@/app/recruitment/_lib/types";

/**
 * ช่องแนบเอกสารของแฟ้มประวัติ พจส. — **ต่อที่เก็บจริงแล้ว** (GridFS ของ `hr_service`
 * ผ่าน `POST/DELETE /api/drivers/{code}/documents` ตัวเดียวกับ `driver-documents.tsx`)
 *
 * หนึ่งแถวต่อหนึ่งประเภท แสดง**รูปย่อของฉบับล่าสุด** — คลิกรูปย่อเปิดตัวดูเต็มจอ
 * (`driver-document-viewer.tsx`) ที่ซูม/หมุน/เลื่อนดูฉบับเก่าได้ · ลากไฟล์มาวางที่
 * แถวหรือกดปุ่มขวาเพื่อแนบ แนบซ้ำประเภทเดิมได้ (ฉบับใหม่ขึ้นเป็นล่าสุด ฉบับเก่ายังอยู่)
 *
 * **บัตรประชาชนกับใบขับขี่ต้องผ่านตัวสแกน** — สองใบนี้มีวันหมดอายุและต้องต่ออายุ
 * เป็นรอบ แนบรูปแล้วเปิดกล่องตรวจผลสแกน (`driver-document-scan.tsx`) ก่อนบันทึกเสมอ
 * ปุ่มของสองแถวนี้จึงเขียนว่า “ต่ออายุ” เมื่อมีฉบับเดิมอยู่แล้ว
 *
 * **แนบได้เฉพาะรูปภาพ** (1 ต.ค. 2026) — ยกเว้นเอกสาร HR ที่รับ PDF ด้วย (10 พ.ย. 2569) ·
 * รูปย่อ PDF เป็นลิงก์เปิดแท็บใหม่ (ตัวดู PDF ของเบราว์เซอร์) ไม่ผ่านตัวดูเต็มจอ
 *
 * **เอกสาร HR (ประเภทที่มี `hr`) แยกเป็นกลุ่มบนสุด** (Bew 8 พ.ย. 2569) — รายงานผู้สมัคร · สัญญาจ้าง ·
 * สัญญาค้ำ · ยินยอมคืนเงินค้ำ · ค่าตั้งต้นคือ **ฉบับที่ระบบทำจากใบสมัคร** (ปุ่ม “เปิดดู” = กล่องทำเอกสาร
 * ตัวเดียวกับหน้าผู้สมัคร โหลดใบสมัครตอนกด) · แนบฉบับเซ็นแล้วเข้าแฟ้มได้เหมือนประเภทอื่น
 *
 * ชื่อประเภทกับลำดับมาจาก `DRIVER_DOC_TYPES` ที่เดียว — อย่าก๊อปรายชื่อมาไว้ในไฟล์นี้
 */

/** ต้องตรงกับ `ALLOWED_DOC_MIME` / `HR_DOC_MIME` ใน `_lib/drivers/documents.ts` — ฝั่งเซิร์ฟเวอร์ตรวจซ้ำอีกที */
const ACCEPT = "image/jpeg,image/png,image/webp";
/** เอกสาร HR รับ PDF เพิ่ม (Bew 10 พ.ย. 2569) — ฉบับเซ็นแล้วมักสแกนมาเป็น PDF */
const HR_ACCEPT = `${ACCEPT},application/pdf`;
const MAX_MB = 10;

/** ประเภทที่อ่านวันหมดอายุจากรูปได้ — รหัสใน `DRIVER_DOC_TYPES` ตรงกับ `ScanDocKind` */
const SCAN_KINDS: Record<string, ScanDocKind> = {
  "id-card": "id-card",
  "driver-license": "driver-license",
};

const isImage = (type: string) => /^image\/(jpeg|png|webp)$/.test(type);
const isPdf = (file: { type: string; name: string }) =>
  file.type === "application/pdf" || /\.pdf$/i.test(file.name);

export function DriverDocumentSlots({
  driver,
  hidePersonal,
  application,
  requisition,
  showFiles = true,
}: {
  driver: DriverRecord;
  /** พ้นสภาพแล้ว — ยังแนบได้ (แฟ้มคือประวัติการจ้าง) แต่ไม่โชว์/ไม่แก้วันหมดอายุ */
  hidePersonal: boolean;
  /** ใบสมัครของคนนี้ — ไม่มี/ถูกลบข้อมูลแล้ว = เอกสาร HR ต้องแนบไฟล์อย่างเดียว */
  application: DriverHrLink["application"];
  /** คำขอสรรหาที่ผูกรหัสนี้ — ตำแหน่งที่สมัครในเอกสารยึดตามนี้ */
  requisition: Requisition | null;
  /**
   * กลุ่ม “เอกสารแนบ” — ซ่อนเมื่อหน้าประวัติแสดงข้อมูลจากเอกสารของใบสมัครแล้ว (Bew 8 พ.ย. 2569:
   * ส่วนบนมีรูปกับข้อมูลครบ ไม่ต้องมีอีกชุด) · ไฟล์ที่แนบไว้เดิมยังอยู่ในฐาน ไม่ได้ลบ
   */
  showFiles?: boolean;
}) {
  const router = useRouter();
  /** ค่าที่เซิร์ฟเวอร์คืนมาหลังบันทึกเสมอ ไม่เดาเอง (กติกาเดียวกับ `driver-documents.tsx`) */
  const [documents, setDocuments] = useState<DriverDocument[]>(driver.documents);
  const [viewing, setViewing] = useState<{ code: string; index: number } | null>(null);
  const [scanning, setScanning] = useState<{
    type: DriverDocType;
    file: File;
    preview: string;
  } | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  const groups = groupDriverDocuments(documents);
  const hrGroups = groups.filter((g) => g.type.hr);
  const fileGroups = groups.filter((g) => !g.type.hr);
  const fromApplication = Boolean(application && !application.erased);
  const missing = missingRequiredDocs(documents, fromApplication);
  const have = REQUIRED_DOC_COUNT - missing.length;
  const viewingGroup = viewing ? groups.find((g) => g.type.code === viewing.code) : undefined;

  /* ใบสมัครเต็มใบ + คลังช่องเอกสาร โหลดตอนกด “เปิดดู” ครั้งแรกเท่านั้น (หน้าประวัติไม่ต้องแบกทุกครั้งที่เปิด) */
  const [source, setSource] = useState<{ application: Application; docSlots: DocSlot[] } | null>(null);
  const [making, setMaking] = useState<HrDocId | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  async function openSystem(type: DriverDocType) {
    if (!application || !type.hr) return;
    if (source) {
      setMaking(type.hr);
      return;
    }
    setOpening(type.code);
    try {
      const [app, docSlots] = await Promise.all([
        requestJson<Application | null>(`/api/recruitment/applications/${application.id}`, {}, "โหลดใบสมัครไม่สำเร็จ"),
        requestJson<DocSlot[]>("/api/recruitment/doc-slots", {}, "โหลดช่องเอกสารไม่สำเร็จ"),
      ]);
      if (!app) throw new Error("ไม่พบใบสมัครนี้แล้ว");
      setSource({ application: app, docSlots });
      setMaking(type.hr);
    } catch (err) {
      toastError("เปิดเอกสารไม่สำเร็จ", err instanceof Error ? err.message : undefined);
    } finally {
      setOpening(null);
    }
  }

  /** แก้ใบสมัคร/คะแนน Driver Rating จากในกล่อง — ยิงตัวเดียวกับหน้าผู้สมัคร โยน error ให้กล่องโชว์เอง */
  async function patchApplication(patch: Record<string, unknown>) {
    if (!source) return;
    const next = await requestJson<Application>(
      `/api/recruitment/applications/${source.application.id}`,
      { method: "PATCH", body: patch },
      "บันทึกไม่สำเร็จ",
    );
    setSource((s) => (s ? { ...s, application: next } : s));
  }

  function saved(next: DriverDocument[]) {
    setDocuments(next);
    router.refresh();
  }

  function closeScan() {
    if (scanning) URL.revokeObjectURL(scanning.preview);
    setScanning(null);
  }

  async function pick(type: DriverDocType, file: File | undefined) {
    if (!file) return;
    /* ลากไฟล์มาวางข้าม `accept` ได้ — บอกตั้งแต่ตรงนี้ ไม่ต้องรอเซิร์ฟเวอร์ตอบ 400 */
    if (type.hr ? !isImage(file.type) && file.type !== "application/pdf" : !isImage(file.type)) {
      toastError(
        type.hr ? "แนบได้เฉพาะรูปภาพหรือ PDF" : "แนบได้เฉพาะรูปภาพ",
        `“${file.name}” ไม่ใช่ไฟล์ JPG · PNG · WebP${type.hr ? " · PDF" : ""}`,
      );
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      toastError("ไฟล์ใหญ่เกินไป", `“${file.name}” ใหญ่เกิน ${MAX_MB} MB`);
      return;
    }

    if (SCAN_KINDS[type.code] && isImage(file.type)) {
      setScanning({ type, file, preview: URL.createObjectURL(file) });
      return;
    }

    const body = new FormData();
    body.append("file", file);
    body.append("docType", type.code);
    body.append("note", "");

    setUploading(type.code);
    const out = await runAction({
      confirm: false,
      pending: "กำลังอัปโหลด…",
      success: `แนบ${type.label}แล้ว`,
      failureTitle: "แนบเอกสารไม่สำเร็จ",
      run: () =>
        requestJson<{ documents: DriverDocument[] }>(
          `/api/drivers/${encodeURIComponent(driver.drivercode)}/documents`,
          { method: "POST", body },
          "แนบเอกสารไม่สำเร็จ",
        ),
    });
    setUploading(null);
    if (out.status === "done") saved(out.data.documents);
  }

  async function remove(file: DriverDocument) {
    const out = await runAction({
      confirm: {
        title: "ลบเอกสารนี้ออกจากแฟ้ม?",
        html: `<b>${escapeHtml(file.name)}</b> จะถูกลบออกจากที่เก็บด้วย กู้กลับมาไม่ได้ — ใช้เมื่อแนบผิดคนหรือผิดใบ`,
        confirmText: "ลบเอกสาร",
        tone: "danger",
      },
      pending: "กำลังลบ…",
      success: "ลบเอกสารแล้ว",
      failureTitle: "ลบเอกสารไม่สำเร็จ",
      run: () =>
        requestJson<{ documents: DriverDocument[] }>(
          driverDocumentUrl(driver.drivercode, file.fileId),
          { method: "DELETE" },
          "ลบเอกสารไม่สำเร็จ",
        ),
    });
    if (out.status !== "done") return;
    saved(out.data.documents);

    /* ลบฉบับสุดท้ายของประเภทนั้น = ไม่มีอะไรให้ดูแล้ว ปิดตัวดู · ไม่งั้นถอยไปฉบับก่อนหน้า */
    const left = out.data.documents.filter((d) => d.docType === file.docType).length;
    setViewing((v) => (v && left ? { ...v, index: Math.min(v.index, left - 1) } : null));
  }

  return (
    /* อยู่ในแท็บ “เอกสาร” ของหน้าประวัติ (19 ต.ค. 2569) — ไหลตามเนื้อหาปกติ ไม่เลื่อนในกล่อง
       รายการเป็นสองคอลัมน์บนจอกว้าง ให้เห็นครบทุกประเภทในหน้าเดียว */
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-14 font-semibold">เอกสาร HR</h2>
          <p className="text-11-5 text-mut text-pretty">
            {fromApplication
              ? `เปิดดูได้จากใบสมัคร ${application!.ref} (ข้อมูลตามหน้าผู้สมัคร) · แนบฉบับที่เซ็นแล้วเพิ่มได้`
              : application?.erased
                ? "ใบสมัครของคนนี้ถูกลบข้อมูลตามคำขอแล้ว — แนบไฟล์เอกสารแทน"
                : "ไม่มีใบสมัครในระบบ — แนบไฟล์เอกสารแทน"}
          </p>
        </div>
        <ul className="grid gap-2 md:grid-cols-2">
          {hrGroups.map((group) => (
            <Slot
              key={group.type.code}
              group={group}
              drivercode={driver.drivercode}
              expiry={null}
              busy={uploading === group.type.code}
              onPick={(file) => void pick(group.type, file)}
              onView={(index) => setViewing({ code: group.type.code, index })}
              onRemove={(file) => void remove(file)}
              system={
                fromApplication
                  ? { busy: opening === group.type.code, onOpen: () => void openSystem(group.type) }
                  : undefined
              }
            />
          ))}
        </ul>
      </section>

      {showFiles ? (
      <section className="flex flex-col gap-3">
        <div className="flex flex-none flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-14 font-semibold">เอกสารแนบ</h2>
            <span
              className={`flex-none font-mono text-11-5 ${missing.length ? "text-alert" : "text-mut"}`}
              title={missing.length ? `ยังไม่มี · ${missing.map((t) => t.label).join(" · ")}` : undefined}
            >
              ต้องมี {have}/{REQUIRED_DOC_COUNT}
            </span>
          </div>
          <div role="presentation" className="h-1 overflow-hidden rounded-full bg-base-300">
            <div
              className={`h-full rounded-full transition-[width] ${missing.length ? "bg-alert" : "bg-st-done-ink"}`}
              style={{ width: `${(have / REQUIRED_DOC_COUNT) * 100}%` }}
            />
          </div>
        </div>

        <ul className="grid gap-2 md:grid-cols-2">
          {fileGroups.map((group) => (
            <Slot
              key={group.type.code}
              group={group}
              drivercode={driver.drivercode}
              expiry={hidePersonal ? null : expiryOf(driver, group.type.code)}
              busy={uploading === group.type.code}
              onPick={(file) => void pick(group.type, file)}
              onView={(index) => setViewing({ code: group.type.code, index })}
              onRemove={(file) => void remove(file)}
            />
          ))}
        </ul>

        <p className="flex-none text-11 text-mut text-pretty">
          เก็บในฐานข้อมูลของระบบนี้ เปิดได้เฉพาะคนที่เข้าสู่ระบบ · บัตรประชาชนกับใบขับขี่
          สแกนอ่านวันหมดอายุให้ตอนแนบ
        </p>
      </section>
      ) : null}

      {viewing && viewingGroup?.files.length ? (
        <DriverDocumentViewer
          key={`${viewing.code}-${viewingGroup.files.length}`}
          title={viewingGroup.type.label}
          startIndex={viewing.index}
          items={viewingGroup.files.map((f) => toViewerItem(driver.drivercode, f))}
          onClose={() => setViewing(null)}
          onRemove={(item) => {
            const file = viewingGroup.files.find((f) => f.fileId === item.key);
            if (file) void remove(file);
          }}
        />
      ) : null}

      {making && source ? (
        <HrDocumentMaker
          application={source.application}
          requisitions={requisition ? [requisition] : []}
          onRequisitionsChange={() => router.refresh()}
          docSlots={source.docSlots}
          onPatch={patchApplication}
          initialDoc={making}
          onClose={() => setMaking(null)}
        />
      ) : null}
      {/* เปิดเอกสาร HR = โหลดใบสมัคร + ช่องเอกสาร (รวมลายเซ็น) ก่อนเปิดกล่อง */}
      {opening ? <SignatureLoaderOverlay label="กำลังเปิดเอกสาร…" /> : null}

      {scanning ? (
        <DriverDocumentScan
          driver={driver}
          type={scanning.type}
          kind={SCAN_KINDS[scanning.type.code]}
          file={scanning.file}
          preview={scanning.preview}
          canUpdateRegistry={!hidePersonal}
          onClose={closeScan}
          onSaved={(next) => {
            closeScan();
            saved(next);
          }}
        />
      ) : null}
    </div>
  );
}

function toViewerItem(drivercode: string, file: DriverDocument): ViewerItem {
  return {
    key: file.fileId,
    url: driverDocumentUrl(drivercode, file.fileId),
    name: file.name,
    type: file.type,
    caption: [
      formatFileSize(file.size),
      file.uploadedAt ? formatThaiDateTime(file.uploadedAt) : "",
      file.uploadedBy ? `แนบโดย ${file.uploadedBy}` : "",
      file.note,
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

interface SlotExpiry {
  iso: string;
  daysLeft: number | null;
}

function expiryOf(driver: DriverRecord, code: string): SlotExpiry | null {
  if (code === "id-card") return { iso: driver.idCardExpiryISO, daysLeft: driver.idCardDaysLeft };
  if (code === "driver-license")
    return { iso: driver.licenseExpiryISO, daysLeft: driver.licenseDaysLeft };
  return null;
}

/**
 * หนึ่งแถว = หนึ่งประเภทเอกสาร
 *
 * ว่าง = กรอบประ + รูปย่อเป็นช่องบวก · มีไฟล์ = กรอบทึบ + รูปย่อฉบับล่าสุดจริง
 * (เห็นทันทีว่าแนบถูกใบหรือเปล่าโดยไม่ต้องเปิด) · ลากผ่าน = ขอบเขียว
 */
function Slot({
  group,
  drivercode,
  expiry,
  busy,
  onPick,
  onView,
  onRemove,
  system,
}: {
  group: DriverDocGroup;
  drivercode: string;
  /** `null` = ประเภทนี้ไม่มีวันหมดอายุ หรือซ่อนเพราะพ้นสภาพแล้ว */
  expiry: SlotExpiry | null;
  busy: boolean;
  onPick: (file: File | undefined) => void;
  onView: (index: number) => void;
  /** ลบฉบับล่าสุด — `remove()` ถามยืนยันก่อนเสมอ (PDF ไม่ผ่านตัวดูเต็มจอ จึงต้องมีปุ่มที่แถว) */
  onRemove: (file: DriverDocument) => void;
  /** เอกสาร HR ที่เปิดฉบับจากใบสมัครได้ — ไม่ต้องแนบก็มีฉบับให้ดู (ค่าตั้งต้น) */
  system?: { busy: boolean; onOpen: () => void };
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const { type, files } = group;
  const latest = files[0];
  const scan = Boolean(SCAN_KINDS[type.code]);
  const state = expiry?.iso ? expiryState(expiry.daysLeft) : null;
  const tone =
    state === "expired"
      ? "border-alert/35 bg-alert/8 text-alert"
      : state === "soon"
        ? "border-sla/35 bg-sla/8 text-sla"
        : "border-line bg-base-200 text-mut";

  const browse = () => input.current?.click();
  const ActionIcon = busy ? Loader2 : latest ? (scan ? RefreshCw : Plus) : Upload;

  return (
    <li
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onPick(e.dataTransfer.files[0]);
      }}
      className={`flex items-center gap-3 rounded-field border p-2 transition-colors ${
        over
          ? "border-primary bg-soft"
          : latest
            ? "border-line bg-base-100"
            : "border-dashed border-line bg-base-100"
      }`}
    >
      {!latest && system ? (
        <button
          type="button"
          onClick={system.onOpen}
          aria-label={`เปิด${type.label}จากใบสมัคร`}
          className="flex size-13 flex-none cursor-pointer items-center justify-center rounded-field border border-line bg-soft text-primary transition-colors hover:border-primary/40"
        >
          <FileText size={20} strokeWidth={1.6} aria-hidden />
        </button>
      ) : (
        <Thumb drivercode={drivercode} file={latest} count={files.length} onOpen={() => onView(0)} onEmpty={browse} />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-12-5 font-medium">{type.label}</span>
          {scan ? (
            <span
              title="แนบรูปแล้วระบบอ่านวันหมดอายุให้"
              className="flex flex-none items-center gap-0.5 rounded-selector bg-soft px-1.5 py-px text-10 font-medium text-primary"
            >
              <ScanText size={10} strokeWidth={2.2} aria-hidden />
              สแกน
            </span>
          ) : null}
          {type.required && !latest && !system ? (
            <span className="flex-none text-10-5 text-alert">ต้องมี</span>
          ) : null}
        </span>

        <span className="truncate text-11 text-mut">
          {over
            ? "วางไฟล์ที่นี่"
            : latest
              ? [
                  latest.uploadedAt ? `แนบ ${formatThaiDateTime(latest.uploadedAt)}` : latest.name,
                  files.length > 1 ? `${files.length} ฉบับ` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")
              : system
                ? "ฉบับจากใบสมัคร · แนบฉบับเซ็นแล้วได้ (รูป/PDF)"
                : "ลากไฟล์มาวาง หรือกดปุ่มขวา"}
        </span>

        {expiry ? (
          <span
            className={`mt-0.5 w-fit max-w-full truncate rounded-selector border px-1.5 py-px text-10-5 ${tone}`}
          >
            {expiry.iso
              ? `หมดอายุ ${formatThaiDate(expiry.iso)} · ${formatExpiryGap(expiry.daysLeft)}`
              : "ยังไม่ระบุวันหมดอายุ"}
          </span>
        ) : null}
      </div>

      {system ? (
        <button
          type="button"
          onClick={system.onOpen}
          disabled={system.busy}
          title={`เปิด${type.label}ที่ระบบทำจากใบสมัคร — พิมพ์ / ส่งออก PDF ได้`}
          className="flex flex-none cursor-pointer items-center gap-1 rounded-field border border-primary/40 bg-soft px-2.5 py-1.5 text-11-5 font-medium text-primary transition-colors hover:bg-primary hover:text-primary-content disabled:pointer-events-none disabled:opacity-60"
        >
          {system.busy ? (
            <Loader2 size={13} strokeWidth={2} aria-hidden className="animate-spin" />
          ) : (
            <Eye size={13} strokeWidth={2} aria-hidden />
          )}
          เปิดดู
        </button>
      ) : null}

      <button
        type="button"
        onClick={browse}
        disabled={busy}
        title={latest ? (scan ? `ต่ออายุ — แนบ${type.label}ฉบับใหม่` : `แนบ${type.label}เพิ่ม`) : `แนบ${type.label}`}
        className={`flex flex-none cursor-pointer items-center gap-1 rounded-field border px-2.5 py-1.5 text-11-5 font-medium transition-colors disabled:pointer-events-none disabled:opacity-60 ${
          latest || system
            ? "border-line text-mut hover:border-primary/40 hover:text-primary"
            : "border-primary/40 bg-soft text-primary hover:bg-primary hover:text-primary-content"
        }`}
      >
        <ActionIcon size={13} strokeWidth={2} aria-hidden className={busy ? "animate-spin" : ""} />
        {latest ? (scan ? "ต่ออายุ" : "เพิ่ม") : "แนบ"}
      </button>

      {latest ? (
        <button
          type="button"
          onClick={() => onRemove(latest)}
          disabled={busy}
          aria-label={`ลบ${type.label}`}
          title={files.length > 1 ? `ลบ${type.label}ฉบับล่าสุด (${latest.name})` : `ลบ${type.label} (${latest.name})`}
          className="flex size-8 flex-none cursor-pointer items-center justify-center rounded-field border border-line text-mut transition-colors hover:border-alert/40 hover:bg-alert/8 hover:text-alert disabled:pointer-events-none disabled:opacity-60"
        >
          <Trash2 size={13} strokeWidth={2} aria-hidden />
        </button>
      ) : null}

      {/* `<input type="file">` ดิบเป็นข้อยกเว้นที่ CLAUDE.md อนุญาต — ซ่อนด้วย `sr-only` */}
      <input
        ref={input}
        type="file"
        accept={type.hr ? HR_ACCEPT : ACCEPT}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const picked = e.target.files?.[0];
          e.target.value = "";
          onPick(picked);
        }}
      />
    </li>
  );
}

/** รูปย่อ 52px — รูปจริงของฉบับล่าสุด · PDF/Word เป็นไอคอน · ว่างเป็นช่องบวกให้กดแนบ */
function Thumb({
  drivercode,
  file,
  count,
  onOpen,
  onEmpty,
}: {
  drivercode: string;
  file: DriverDocument | undefined;
  count: number;
  onOpen: () => void;
  onEmpty: () => void;
}) {
  const [broken, setBroken] = useState(false);

  if (!file) {
    return (
      <button
        type="button"
        onClick={onEmpty}
        aria-label="เลือกไฟล์"
        className="flex size-13 flex-none cursor-pointer items-center justify-center rounded-field border border-dashed border-line bg-base-200/60 text-mut transition-colors hover:border-primary/40 hover:text-primary"
      >
        <Plus size={16} strokeWidth={1.8} aria-hidden />
      </button>
    );
  }

  const kind = attachmentKind(file);
  const Glyph = kind.icon ?? FileText;
  const badge =
    count > 1 ? (
      <span className="absolute top-0.5 right-0.5 rounded-full bg-ink/75 px-1.5 font-mono text-9-5 leading-4 text-white">
        {count}
      </span>
    ) : null;

  /* PDF = ลิงก์ธรรมดาเปิดแท็บใหม่ ให้เบราว์เซอร์แสดงเอง (คลิก · คลิกกลาง · Ctrl+คลิก ได้ตามปกติ) */
  if (isPdf(file)) {
    return (
      <a
        href={driverDocumentUrl(drivercode, file.fileId)}
        target="_blank"
        rel="noreferrer"
        aria-label={`เปิด ${file.name} ในแท็บใหม่`}
        title="คลิกเพื่อเปิดในแท็บใหม่"
        className="relative flex size-13 flex-none cursor-pointer flex-col items-center justify-center gap-0.5 rounded-field border border-line bg-base-200 transition-colors hover:border-primary/40"
      >
        <Glyph size={18} strokeWidth={1.6} aria-hidden className={kind.tone} />
        <span className="font-mono text-9-5 font-semibold leading-none text-mut">PDF</span>
        {badge}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`ดู ${file.name}`}
      title="คลิกเพื่อดูขนาดใหญ่"
      className="group relative flex size-13 flex-none cursor-zoom-in items-center justify-center overflow-hidden rounded-field border border-line bg-base-200"
    >
      {isImage(file.type) && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={driverDocumentUrl(drivercode, file.fileId)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          className="size-full object-cover transition-transform duration-300 group-hover:scale-110"
        />
      ) : (
        <Glyph size={20} strokeWidth={1.6} aria-hidden className={kind.tone} />
      )}
      {badge}
    </button>
  );
}
