"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Maximize2,
  Minimize2,
  PenLine,
  ShieldCheck,
} from "lucide-react";

import { LightTheme } from "@/app/recruitment/_components/light-theme";
import { MenaLogo } from "@/app/recruitment/_components/admin/hr-document-paper";
import { ApplicantProfile } from "@/app/recruitment/_components/admin/hr-document-profile";
import {
  DepositConsent,
  EmploymentContract,
  RefundConsent,
} from "@/app/recruitment/_components/admin/hr-document-contracts";
import { SignaturePadModal } from "@/app/recruitment/_components/admin/hr-document-signature";
import { SignatureLoaderOverlay } from "@/app/recruitment/_components/signature-loader";
import { requestJson } from "@/lib/http";
import { alertError, toastSuccess } from "@/lib/swal";
import { CONTROLLER } from "@/app/recruitment/_lib/consent";
import {
  HR_DOCUMENTS,
  thaiShortDateTime,
  type HrDocId,
} from "@/app/recruitment/_lib/hr-documents";
import { signKey, type DocSignature, type DocSignatures } from "@/app/recruitment/_lib/hr-signatures";
import type { SignPortalData } from "@/app/recruitment/_lib/sign-link-store";

/**
 * หน้าลงนามของผู้สมัคร (`/recruitment/sign/{token}`) — **อ่านอย่างเดียว + เซ็นช่องของตัวเอง**
 *
 * ผู้สมัครเกือบทั้งหมดเปิดจาก LINE บนมือถือ จึงออกแบบสองจังหวะ:
 * 1. **รายการเอกสาร** — ทักทายด้วยชื่อ บอกว่ามีกี่ฉบับ เซ็นไปแล้วเท่าไร ขั้นตอนสามข้อ
 * 2. **อ่านทีละฉบับ** — กระดาษ A4 ตัวจริงย่อพอดีจอ (กดดูขนาดจริงได้ หรือถ่างนิ้วซูม)
 *    แถบล่างติดขอบ: ติ๊ก “อ่านและเข้าใจแล้ว” ก่อน ปุ่มลงลายมือชื่อถึงกดได้
 *
 * เซ็นแล้วล็อก (เซิร์ฟเวอร์บังคับ) — เซ็นผิดต้องให้ฝ่ายบุคคลล้างแล้วเปิดลิงก์เดิมเซ็นใหม่
 */

/** ความกว้างแผ่น A4 บนจอ (210mm ที่ 96dpi) — ฐานของการย่อพอดีจอ */
const SHEET_PX = 794;

const docMeta = (id: HrDocId) => HR_DOCUMENTS.find((d) => d.id === id)!;

export function SignPortal({ data }: { data: SignPortalData }) {
  const { application, docs } = data;
  const [signatures, setSignatures] = useState<DocSignatures>(data.fill.signatures ?? {});
  const [view, setView] = useState<HrDocId | null>(null);
  const [agreed, setAgreed] = useState<Partial<Record<HrDocId, boolean>>>({});
  const [padOpen, setPadOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const signedOf = (doc: HrDocId) => signatures[signKey(doc, "applicant")];
  const signedCount = docs.filter((d) => signedOf(d)).length;
  const allSigned = signedCount === docs.length;

  function open(doc: HrDocId | null) {
    setView(doc);
    window.scrollTo({ top: 0 });
  }

  async function sign(image: string) {
    if (!view || sending) return;
    setSending(true);
    try {
      const signature = await requestJson<DocSignature>(
        `/api/recruitment/public/sign/${data.token}`,
        { method: "POST", body: { docId: view, image } },
        "ลงนามไม่สำเร็จ",
      );
      setSignatures((prev) => ({ ...prev, [signKey(view, "applicant")]: signature }));
      setPadOpen(false);
      toastSuccess("ลงนามเรียบร้อย", docMeta(view).label);
      /* ให้เห็นลายเซ็นบนกระดาษทันที — เลื่อนไปที่ช่องลงนามของฉบับนี้ */
      requestAnimationFrame(() =>
        document.querySelector(".hrdoc-sig-img")?.scrollIntoView({ behavior: "smooth", block: "center" }),
      );
    } catch (err) {
      alertError("ลงนามไม่สำเร็จ", err instanceof Error ? err.message : undefined);
    } finally {
      setSending(false);
    }
  }

  const index = view ? docs.indexOf(view) : -1;
  const next = docs.slice(index + 1).find((d) => !signedOf(d)) ?? docs.find((d) => !signedOf(d));

  return (
    <div className="flex min-h-dvh flex-col bg-base-200">
      <LightTheme />

      <header className="sticky top-0 z-20 border-b border-line bg-base-100/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-3 px-4">
          <MenaLogo className="h-8" />
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-13 font-semibold text-ink">{CONTROLLER.company}</span>
            <span className="truncate text-11 text-mut">ลงนามเอกสารอิเล็กทรอนิกส์ · ฝ่ายทรัพยากรบุคคล</span>
          </div>
          <span className="hidden font-mono text-11-5 tracking-wider text-mut sm:block">{application.ref}</span>
        </div>
      </header>

      {view ? (
        <DocView
          data={data}
          doc={view}
          position={`ฉบับที่ ${index + 1} จาก ${docs.length}`}
          signatures={signatures}
          signature={signedOf(view)}
          agreed={Boolean(agreed[view])}
          onAgree={(on) => setAgreed((prev) => ({ ...prev, [view]: on }))}
          onSign={() => setPadOpen(true)}
          onBack={() => open(null)}
          onNext={next && next !== view ? () => open(next) : null}
        />
      ) : (
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-5">
          <section className="flex flex-col gap-3 rounded-box border border-line bg-base-100 p-5">
            <span className="text-11-5 font-medium tracking-wide text-primary">เอกสารรอลงนาม</span>
            <h1 className="text-20 font-semibold leading-snug text-ink">เรียน คุณ{application.fullName}</h1>
            <p className="text-13-5 leading-relaxed text-ink/80">
              ฝ่ายทรัพยากรบุคคลส่งเอกสาร {docs.length} ฉบับให้ท่านอ่านและลงลายมือชื่อ
              กรุณาอ่านข้อความให้ครบถ้วนก่อนลงนามทุกครั้ง
            </p>
            <dl className="flex flex-wrap gap-x-5 gap-y-1 text-12 text-mut">
              <div className="flex gap-1.5">
                <dt>เลขที่ใบสมัคร</dt>
                <dd className="m-0 font-mono text-ink">{application.ref}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt>ลิงก์ใช้ได้ถึง</dt>
                <dd className="m-0 text-ink">{thaiShortDateTime(data.expiresAt)}</dd>
              </div>
            </dl>
            <div className="flex flex-col gap-1.5 pt-1">
              <div className="flex items-baseline justify-between text-12-5">
                <span className="font-medium">ความคืบหน้า</span>
                <span className="text-mut">
                  ลงนามแล้ว <span className="font-semibold text-ink">{signedCount}</span> / {docs.length} ฉบับ
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-base-200">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${(signedCount / docs.length) * 100}%` }}
                />
              </div>
            </div>
          </section>

          {allSigned ? (
            <section className="flex items-start gap-3 rounded-box border border-success/30 bg-success/10 p-4">
              <CheckCircle2 size={22} strokeWidth={2} aria-hidden className="mt-0.5 flex-none text-success" />
              <div className="flex flex-col gap-1">
                <p className="text-14 font-semibold text-ink">ลงนามครบทุกฉบับแล้ว ขอบคุณค่ะ</p>
                <p className="text-12-5 text-ink/75">
                  เอกสารถูกส่งถึงฝ่ายทรัพยากรบุคคลเรียบร้อยแล้ว ท่านปิดหน้านี้ได้เลย
                  หากต้องการแก้ไขลายเซ็น กรุณาติดต่อเจ้าหน้าที่
                </p>
              </div>
            </section>
          ) : (
            <section className="rounded-box border border-line bg-base-100 p-4">
              <h2 className="mb-3 text-13 font-semibold">ขั้นตอนการลงนาม</h2>
              <ol className="flex flex-col gap-2.5">
                {[
                  "เปิดเอกสารแต่ละฉบับ แล้วอ่านข้อความให้ครบทุกส่วน",
                  "ติ๊กยืนยันว่าได้อ่านและเข้าใจข้อความแล้ว",
                  "กด “ลงลายมือชื่อ” แล้วเซ็นบนจอ หรือแนบรูปลายเซ็น",
                ].map((step, i) => (
                  <li key={step} className="flex items-start gap-3 text-13">
                    <span className="flex size-6 flex-none items-center justify-center rounded-full bg-soft text-11-5 font-semibold text-primary">
                      {i + 1}
                    </span>
                    <span className="pt-0.5 text-ink/85">{step}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h2 className="px-1 text-13 font-semibold">เอกสาร</h2>
            <ul className="flex flex-col gap-2">
              {docs.map((doc, i) => {
                const meta = docMeta(doc);
                const sig = signedOf(doc);
                return (
                  <li key={doc}>
                    <button
                      type="button"
                      onClick={() => open(doc)}
                      className="flex w-full items-center gap-3 rounded-box border border-line bg-base-100 p-4 text-left transition-colors hover:border-primary/40"
                    >
                      <span className="flex size-10 flex-none items-center justify-center rounded-field bg-base-200 text-mut">
                        <FileText size={18} strokeWidth={1.8} aria-hidden />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-11 text-mut">
                          ฉบับที่ {i + 1}
                          {meta.code ? ` · ${meta.code}` : ""}
                        </span>
                        <span className="text-14 font-medium text-ink">{meta.label}</span>
                        <StatusChip signature={sig} />
                      </span>
                      <span className="flex flex-none items-center gap-1 text-12-5 font-medium text-primary">
                        {sig ? "ดูเอกสาร" : "อ่านและลงนาม"}
                        <ChevronRight size={16} strokeWidth={2} aria-hidden />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <p className="flex items-start gap-2 px-1 text-11-5 leading-relaxed text-mut">
            <ShieldCheck size={14} strokeWidth={2} aria-hidden className="mt-0.5 flex-none" />
            ลิงก์นี้ส่งถึงท่านคนเดียว กรุณาอย่าส่งต่อ · ข้อมูลของท่านถูกเก็บตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล
            พ.ศ. 2562
          </p>
        </main>
      )}

      {padOpen && view ? (
        <SignaturePadModal
          title={`ลงลายมือชื่อ · ${docMeta(view).label}`}
          subtitle={`เซ็นในนาม ${application.fullName} — เซ็นบนจอ หรือแนบรูปลายเซ็นที่เซ็นบนกระดาษขาว`}
          remember="hidden"
          onDone={(image) => void sign(image)}
          onClose={() => setPadOpen(false)}
        />
      ) : null}
      {sending ? <SignatureLoaderOverlay label="กำลังส่งลายเซ็น…" /> : null}
    </div>
  );
}

function StatusChip({ signature }: { signature?: DocSignature }) {
  return signature ? (
    <span className="flex w-fit items-center gap-1 text-11-5 font-medium text-success">
      <CheckCircle2 size={12} strokeWidth={2.2} aria-hidden />
      ลงนามแล้ว · {thaiShortDateTime(signature.signedAt)}
    </span>
  ) : (
    <span className="flex w-fit items-center gap-1 text-11-5 font-medium text-warning">
      <Clock3 size={12} strokeWidth={2.2} aria-hidden />
      รอลงนาม
    </span>
  );
}

function DocView({
  data,
  doc,
  position,
  signatures,
  signature,
  agreed,
  onAgree,
  onSign,
  onBack,
  onNext,
}: {
  data: SignPortalData;
  doc: HrDocId;
  position: string;
  signatures: DocSignatures;
  signature?: DocSignature;
  agreed: boolean;
  onAgree: (on: boolean) => void;
  onSign: () => void;
  onBack: () => void;
  onNext: (() => void) | null;
}) {
  const meta = docMeta(doc);
  const [actual, setActual] = useState(false);
  const fill = { ...data.fill, signatures };

  return (
    <>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 px-4 pt-4 pb-40">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-field px-2 py-1.5 text-13 text-mut transition-colors hover:bg-base-100 hover:text-ink"
          >
            <ArrowLeft size={16} strokeWidth={2} aria-hidden />
            รายการเอกสาร
          </button>
          <button
            type="button"
            onClick={() => setActual((v) => !v)}
            className="flex items-center gap-1.5 rounded-field border border-line bg-base-100 px-2.5 py-1.5 text-12 text-mut transition-colors hover:text-ink"
          >
            {actual ? <Minimize2 size={13} strokeWidth={2} aria-hidden /> : <Maximize2 size={13} strokeWidth={2} aria-hidden />}
            {actual ? "พอดีจอ" : "ขนาดจริง"}
          </button>
        </div>

        <div className="flex flex-col gap-1 px-1">
          <span className="text-11-5 text-mut">
            {position}
            {meta.code ? ` · ${meta.code}` : ""}
          </span>
          <h1 className="text-17 font-semibold text-ink">{meta.label}</h1>
          <StatusChip signature={signature} />
        </div>

        <FitPaper actual={actual}>
          {doc === "profile" ? (
            <ApplicantProfile
              application={data.application}
              docSlots={data.docSlots}
              requisition={data.requisition}
              signatures={signatures}
              interviewerName={fill.interviewer}
              forApplicant
            />
          ) : null}
          {doc === "contract" ? <EmploymentContract fill={fill} /> : null}
          {doc === "deposit" ? <DepositConsent fill={fill} /> : null}
          {doc === "refund" ? <RefundConsent fill={fill} /> : null}
        </FitPaper>
        <p className="px-1 text-center text-11-5 text-mut">ถ่างนิ้วเพื่อซูมดูรายละเอียดได้</p>
      </main>

      {/* แถบลงนามติดขอบล่าง — ยืนยันว่าอ่านแล้วก่อนเสมอ */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-base-100/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2.5 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {signature ? (
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-13 text-ink">
                <CheckCircle2 size={18} strokeWidth={2} aria-hidden className="text-success" />
                ลงนามแล้วเมื่อ {thaiShortDateTime(signature.signedAt)}
              </span>
              <button
                type="button"
                onClick={onNext ?? onBack}
                className="btn-pri flex items-center gap-1.5 px-4 py-2.5 text-13 font-medium"
              >
                {onNext ? "ฉบับถัดไป" : "กลับรายการ"}
                <ChevronRight size={15} strokeWidth={2} aria-hidden />
              </button>
            </div>
          ) : (
            <>
              <label className="flex cursor-pointer items-start gap-2.5 text-12-5 leading-snug text-ink">
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm checkbox-primary mt-0.5"
                  checked={agreed}
                  onChange={(e) => onAgree(e.target.checked)}
                />
                ข้าพเจ้าได้อ่านและเข้าใจข้อความในเอกสารฉบับนี้ทั้งหมดแล้ว และยินยอมลงลายมือชื่อด้วยความสมัครใจ
              </label>
              <button
                type="button"
                onClick={onSign}
                disabled={!agreed}
                className="btn-pri flex w-full items-center justify-center gap-2 py-3 text-14 font-semibold disabled:bg-none disabled:opacity-50"
              >
                <PenLine size={16} strokeWidth={2} aria-hidden />
                ลงลายมือชื่อ
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * กระดาษ A4 ย่อพอดีความกว้างจอ — ใช้ `zoom` (ไม่ใช่ `transform`) ความสูงของกล่อง
 * จึงหดตามจริง ไม่เหลือที่ว่างใต้กระดาษ · `actual` = ขนาดจริง เลื่อนซ้ายขวาเอง
 */
function FitPaper({ actual, children }: { actual: boolean; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setZoom(Math.min(1, el.clientWidth / SHEET_PX));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={box} className={`w-full ${actual ? "overflow-x-auto" : "overflow-hidden"}`}>
      <div className="flex w-fit flex-col" style={{ zoom: actual ? 1 : zoom }}>
        {children}
      </div>
    </div>
  );
}
