"use client";

import { useEffect, useId, useState } from "react";
import {
  Expand,
  Loader2,
  ScanText,
  TriangleAlert,
} from "lucide-react";

import { DateField } from "@/components/ui/field";
import { ModalShell } from "@/components/ui/modal-shell";
import { requestJson } from "@/lib/http";
import { runAction } from "@/lib/swal";
import {
  readThaiDocument,
  type IdCardReading,
  type ScanDocKind,
  type ScanStep,
} from "@/app/recruitment/_lib/id-card-ocr";
import { ScanOverlay } from "@/app/recruitment/_components/scan-overlay";
import {
  formatThaiDate,
  type DriverDocType,
  type DriverDocument,
  type DriverRecord,
} from "@/app/recruitment/_lib/drivers/types";
import { DriverDocumentViewer } from "@/app/recruitment/_components/admin/driver-document-viewer";

/**
 * กล่องตรวจผลสแกนก่อนแนบ — ใช้กับ**บัตรประชาชนและใบขับขี่** ซึ่งต้องต่ออายุเป็นรอบ
 *
 * เลือกรูปปุ๊บ อ่านวันหมดอายุด้วย `readThaiDocument` (ในเบราว์เซอร์ รูปไม่ออกไปไหน)
 * แล้วเปิดกล่องนี้: **รูปใหญ่ฝั่งซ้าย ผลที่อ่านได้ฝั่งขวา** ให้คนทานกันได้ในจอเดียว
 * ก่อนกดแนบ · ผลเป็นแค่ค่าตั้งต้น แก้ได้ทุกช่อง และไม่มีอะไรถูกบันทึกจนกว่าจะกดแนบ
 *
 * สองประเภทนี้ปลายทางของ “วันหมดอายุ” ไม่เหมือนกัน:
 * - **บัตรประชาชน** — กดแนบ = **แนบ + อัปเดตวันหมดอายุในทะเบียนทุกครั้ง**
 *   (`PUT …/id-card-expiry`) · ไม่มีตัวเลือกให้ข้าม เพราะฉบับที่
 *   เพิ่งแนบคือฉบับล่าสุด วันหมดอายุในทะเบียนต้องตามฉบับนี้เสมอ
 * - **ใบขับขี่** — วันที่ในทะเบียนมาจาก `Boom_ETL.main_driver` ซึ่ง sync ทับทุกรอบ
 *   **ห้ามเขียนจากที่นี่** (เหตุผลที่ `setDriverIdCardExpiry()`) จึงทำได้แค่เทียบ
 *   แล้วเตือนเมื่อไม่ตรง + เก็บวันที่ที่อ่านได้ไว้ในหมายเหตุของเอกสาร
 */
export function DriverDocumentScan({
  driver,
  type,
  kind,
  file,
  preview,
  canUpdateRegistry,
  onClose,
  onSaved,
}: {
  driver: DriverRecord;
  type: DriverDocType;
  kind: ScanDocKind;
  file: File;
  /**
   * object URL ของ `file` — **คนเรียกเป็นคนสร้างและคืน** (ตอนเลือกไฟล์ / ตอนปิดกล่อง)
   * ไม่สร้างใน effect ที่นี่ เพราะ Strict Mode รัน cleanup หนึ่งรอบตอน dev แล้ว URL
   * ถูกคืนไปก่อนรูปจะโหลด
   */
  preview: string;
  /** `false` = คนที่พ้นสภาพแล้ว — ยังแนบได้ แต่ไม่แตะข้อมูลในทะเบียน */
  canUpdateRegistry: boolean;
  onClose: () => void;
  onSaved: (documents: DriverDocument[]) => void;
}) {
  const fieldId = useId();
  const isIdCard = kind === "id-card";
  const current = isIdCard ? driver.idCardExpiryISO : driver.licenseExpiryISO;

  const [status, setStatus] = useState<"reading" | "done" | "failed">("reading");
  const [reading, setReading] = useState<IdCardReading | null>(null);
  const [expiry, setExpiry] = useState("");
  const [viewing, setViewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<ScanStep | null>(null);
  /** วาบ “อ่านเสร็จ” บนรูปหนึ่งครั้งหลังอ่านจบ — หายเองเมื่อแอนิเมชันจางสุด */
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let alive = true;
    readThaiDocument(file, kind, (next) => alive && setStep(next))
      .then((r) => {
        if (!alive) return;
        setReading(r);
        setExpiry(r.expiry);
        setStatus("done");
        setFlash(true);
      })
      .catch(() => alive && setStatus("failed"));
    return () => {
      alive = false;
    };
  }, [file, kind]);

  /* หมายเหตุของเอกสารสร้างจากวันหมดอายุเอง (ไม่มีช่องให้กรอก) — แฟ้มที่มีบัตรหลายใบ
     จะบอกได้ทันทีว่าใบไหนหมดเมื่อไร โดยไม่ต้องเปิดดูทีละรูป */
  const note = reading?.lifelong
    ? "บัตรตลอดชีพ"
    : expiry
      ? `หมดอายุ ${formatThaiDate(expiry, "full")}`
      : "";

  const differs = Boolean(expiry) && expiry !== current;
  const willUpdate = isIdCard && canUpdateRegistry && Boolean(expiry);

  async function save() {
    const out = await runAction({
      confirm: false,
      pending: "กำลังแนบ…",
      success: willUpdate ? `แนบ${type.label}และอัปเดตวันหมดอายุแล้ว` : `แนบ${type.label}แล้ว`,
      failureTitle: "แนบเอกสารไม่สำเร็จ",
      run: async () => {
        setBusy(true);
        try {
          const body = new FormData();
          body.append("file", file);
          body.append("docType", type.code);
          body.append("note", note);
          const saved = await requestJson<{ documents: DriverDocument[] }>(
            `/api/drivers/${encodeURIComponent(driver.drivercode)}/documents`,
            { method: "POST", body },
            "แนบเอกสารไม่สำเร็จ",
          );
          if (willUpdate) {
            await requestJson(
              `/api/drivers/${encodeURIComponent(driver.drivercode)}/id-card-expiry`,
              { method: "PUT", body: { dateISO: expiry } },
              "แนบแล้ว แต่อัปเดตวันหมดอายุไม่สำเร็จ — กดดินสอที่ช่องบัตรประชาชนเพื่อกรอกเอง",
            );
          }
          return saved;
        } finally {
          setBusy(false);
        }
      },
    });
    if (out.status === "done") onSaved(out.data.documents);
  }

  return (
    <>
      <ModalShell
        title={`แนบ${type.label}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-medium text-ink">{driver.name || "—"}</span>
            <span className="font-mono text-12 text-mut">{driver.drivercode}</span>
          </span>
        }
        onClose={() => {
          if (!busy) onClose();
        }}
        width="1040px"
        tone="plain"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="btn-sec cursor-pointer px-4 py-2 text-13 transition-colors hover:border-ink/30 disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy || status === "reading"}
              className="btn-pri cursor-pointer px-4 py-2 text-13 font-medium disabled:opacity-50"
            >
              {willUpdate ? "แนบ + อัปเดตวันหมดอายุ" : "แนบเอกสาร"}
            </button>
          </div>
        }
      >
        <div className="grid gap-5 md:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
          {/* รูปใหญ่ — พื้นเข้มให้ขอบบัตรสีอ่อนเด่นขึ้น · คลิกเปิดตัวดูเต็มจอ */}
          <button
            type="button"
            onClick={() => setViewing(true)}
            className="group relative flex h-[min(58dvh,540px)] cursor-zoom-in items-center justify-center overflow-hidden rounded-box bg-[#0d1412] p-3"
          >
            {/* กล่องครอบรูปพอดี — เลเซอร์สแกนต้องกวาดเฉพาะตัวบัตร ไม่ใช่พื้นดำรอบ ๆ ·
                ความสูงสูงสุดคิดจากกรอบนอกลบ padding เพราะ `max-h-full` ของรูปในกล่อง
                ที่สูง auto คิดเป็นเปอร์เซ็นต์ไม่ได้ */}
            <span className="relative flex overflow-hidden rounded-[6px] shadow-[0_20px_50px_-18px_rgba(0,0,0,0.8)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt={`${type.label}ที่เลือก`}
                className="max-h-[calc(min(58dvh,540px)-1.5rem)] max-w-full object-contain"
              />
              {status === "reading" ? (
                <ScanOverlay phase="scanning" step={step} />
              ) : flash ? (
                <ScanOverlay
                  phase="done"
                  found={Boolean(reading?.expiry || reading?.lifelong)}
                  onDone={() => setFlash(false)}
                />
              ) : null}
            </span>
            {/* ซ่อนระหว่างสแกน — ป้ายนี้ไปทับมุมกรอบเล็งเป้าของเอฟเฟกต์สแกนพอดี */}
            {status === "reading" ? null : (
              <span className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-11-5 font-medium text-white backdrop-blur transition-colors animate-fade-in group-hover:bg-black/80">
                <Expand size={13} strokeWidth={2} aria-hidden />
                ดูเต็มจอ · ซูมได้
              </span>
            )}
          </button>

          <div className="flex flex-col gap-4">
            <StatusNote status={status} found={Boolean(reading?.expiry || reading?.lifelong)} />

            <DateField
              id={`${fieldId}-expiry`}
              label={isIdCard ? "วันบัตรหมดอายุ (ตามเอกสาร)" : "วันใบขับขี่หมดอายุ (ตามเอกสาร)"}
              value={expiry}
              onChange={setExpiry}
              optional
            />

            {!isIdCard && differs ? (
              <p className="flex items-start gap-2 rounded-field border border-sla/35 bg-sla/8 px-3 py-2.5 text-11-5 leading-relaxed text-ink text-pretty">
                <TriangleAlert size={14} strokeWidth={1.9} aria-hidden className="mt-0.5 flex-none text-sla" />
                <span>
                  ไม่ตรงกับทะเบียน — วันหมดอายุใบขับขี่มาจากระบบต้นทาง (Boom_ETL)
                  แก้จากหน้านี้ไม่ได้ ต้องแจ้งแก้ที่ระบบต้นทาง · วันที่ที่อ่านได้จะเก็บไว้ในหมายเหตุ
                  ของเอกสารนี้ให้
                </span>
              </p>
            ) : null}
          </div>
        </div>
      </ModalShell>

      {viewing ? (
        <DriverDocumentViewer
          title={type.label}
          items={[{ key: preview, url: preview, name: file.name, type: file.type, caption: "ยังไม่ได้แนบ" }]}
          onClose={() => setViewing(false)}
        />
      ) : null}
    </>
  );
}

function StatusNote({
  status,
  found,
}: {
  status: "reading" | "done" | "failed";
  found: boolean;
}) {
  if (status === "reading") {
    return (
      <p className="flex items-start gap-2 rounded-field bg-base-200 px-3 py-2.5 text-12 text-mut text-pretty">
        <Loader2 size={14} strokeWidth={2} aria-hidden className="mt-0.5 flex-none animate-spin text-primary" />
        <span>
          กำลังอ่านวันหมดอายุจากรูป… <span className="text-11-5">ครั้งแรกต้องโหลดตัวอ่านก่อน อาจใช้เวลาสักครู่</span>
        </span>
      </p>
    );
  }
  if (status === "failed") {
    return (
      <p className="flex items-start gap-2 rounded-field border border-alert/30 bg-alert/6 px-3 py-2.5 text-12 text-alert text-pretty">
        <TriangleAlert size={14} strokeWidth={1.9} aria-hidden className="mt-0.5 flex-none" />
        โหลดตัวอ่านไม่สำเร็จ — ตรวจอินเทอร์เน็ต หรือกรอกวันที่เองจากรูปฝั่งซ้าย
      </p>
    );
  }
  return found ? (
    <p className="flex items-start gap-2 rounded-field bg-soft px-3 py-2.5 text-12 text-ink text-pretty">
      <ScanText size={14} strokeWidth={1.9} aria-hidden className="mt-0.5 flex-none text-primary" />
      อ่านจากรูปแล้ว — ทานกับรูปฝั่งซ้ายก่อนกดแนบ แก้ได้ทุกช่อง
    </p>
  ) : (
    <p className="flex items-start gap-2 rounded-field border border-sla/35 bg-sla/8 px-3 py-2.5 text-12 text-ink text-pretty">
      <TriangleAlert size={14} strokeWidth={1.9} aria-hidden className="mt-0.5 flex-none text-sla" />
      อ่านวันหมดอายุจากรูปไม่ออก — กรอกเองจากรูปฝั่งซ้าย หรือถ่ายใหม่ให้ชัดขึ้น
    </p>
  );
}

