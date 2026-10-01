"use client";

import { useMemo, useState } from "react";
import { FileStack, Loader2, Printer, SquarePen } from "lucide-react";

import { AttachmentGallery } from "@/components/ui/attachment-gallery";
import { DateField, NumberField, SelectField, TextField } from "@/components/ui/field";
import { ModalShell } from "@/components/ui/modal-shell";
import { requestJson } from "@/lib/http";
import { alertError, confirm, escapeHtml, runAction } from "@/lib/swal";
import { CandidateDocumentsModal } from "@/app/recruitment/_components/admin/candidate-documents";
import { CandidateEditModal } from "@/app/recruitment/_components/admin/candidate-edit";
import { ApplicantProfile } from "@/app/recruitment/_components/admin/hr-document-profile";
import {
  PrintHistory,
  sameFill,
  useHrDocumentRecord,
} from "@/app/recruitment/_components/admin/hr-document-record";
import {
  isHrRecordDoc,
  type HrDocumentPrint,
} from "@/app/recruitment/_lib/hr-document-records";
import {
  RatingEditor,
  RatingSheet,
} from "@/app/recruitment/_components/admin/hr-document-rating";
import { rateApplication } from "@/app/recruitment/_lib/driver-rating";
import {
  DepositConsent,
  EmploymentContract,
  RefundConsent,
} from "@/app/recruitment/_components/admin/hr-document-contracts";
import {
  HR_DOCUMENTS,
  bahtText,
  initialDocFill,
  personName,
  probationEnd,
  readApplicantFacts,
  rememberCompanyFill,
  requisitionPosition,
  thaiLongDate,
  type DocFill,
  type HrDocId,
} from "@/app/recruitment/_lib/hr-documents";
import type { DocSlot } from "@/app/recruitment/_lib/form";
import {
  LINKABLE_STATUSES,
  customerLabel,
  type Requisition,
  type RequisitionPatch,
} from "@/app/recruitment/_lib/requisitions/types";
import type { AnswerMap, Application, DocumentData } from "@/app/recruitment/_lib/types";

/**
 * กล่อง “ทำเอกสาร” — รายงานผู้สมัคร + Driver Rating + เอกสาร HR สามฉบับ พิมพ์ / บันทึก
 * เป็น PDF ทีละฉบับ (รายงานผู้สมัคร · Driver Rating · สัญญาจ้าง · สัญญาค้ำ ·
 * ยินยอมคืนเงินค้ำ — ใบสมัครถูกถอดออกแล้ว ดู `hr-documents.ts`)
 *
 * **Driver Rating เป็นฉบับเดียวที่บันทึกลงฐาน** — คะแนนที่เลือกในแผงซ้ายเก็บลง
 * `Application.rating` ผ่าน `onPatch` (ดู `driver-rating.ts`) · ปุ่มดาวในตารางเปิด
 * กล่องนี้ตรงที่ฉบับนั้น (`initialDoc`)
 *
 * **รายงานผู้สมัครอยู่ที่นี่ฉบับแรก** แทนปุ่มรายงานเดิมในตาราง (29 ก.ย. 2026) ·
 * ปุ่ม “แก้ไขใบสมัคร” กับ “เอกสารและข้อมูล” ที่เคยอยู่ท้ายรายงานเดิมย้ายมาอยู่แผงซ้าย
 * ตอนเลือกรายงาน พร้อมรูปย่อไฟล์แนบ (บนกระดาษมีแค่รายการติ๊กว่าแนบแล้วหรือยัง)
 *
 * **ซ้าย = ช่องกรอก · ขวา = กระดาษจริง** พิมพ์ช่องไหนกระดาษขยับตามทันที คนทำเอกสาร
 * จึงตรวจกับหน้ากระดาษได้เลย ไม่ต้องพิมพ์ออกมาดูแล้วกลับมาแก้
 *
 * - ช่องทั้งหมดเติมจากใบสมัคร + ค่าฝั่งบริษัทที่เครื่องนี้ใช้ครั้งก่อนให้ตั้งแต่เปิด
 *   (ดู `initialDocFill()`) · **บันทึกลงฐานแยกจากใบสมัคร** (29 ก.ย. 2026 — ดู
 *   `hr-document-records.ts`) เคยบันทึกไว้ = เปิดมาเจอค่าเดิม · แก้ในกล่องนี้ไม่ทับ
 *   คำตอบของผู้สมัคร · สั่งพิมพ์ฉบับที่เก็บลงฐาน = บันทึกค่าที่ค้างก่อน แล้วลงประวัติ
 *   การพิมพ์พร้อมสำเนาค่าบนกระดาษ
 * - **เลือกได้ทีละฉบับ** (ตามคำสั่งเจ้าของงาน 29 ก.ย. 2026 — ยังไม่เปิดให้พิมพ์หลายฉบับ
 *   พร้อมกัน) · เลือกฉบับไหน กระดาษกับช่องกรอกก็เป็นของฉบับนั้นฉบับเดียว
 * - ค่าที่กรอกอยู่ก้อนเดียวทั้งกล่อง สลับฉบับแล้วค่าไม่หาย — ช่องที่หลายฉบับใช้ร่วมกัน
 *   มีป้ายบอกว่าแก้แล้วฉบับไหนเปลี่ยนตามด้วย
 * - พิมพ์ = `window.print()` ท่าเดียวกับรายงานผู้สมัคร · ชื่อไฟล์ PDF มาจาก
 *   `document.title` จึงตั้งเป็นเลขใบสมัคร + ชื่อ + ชื่อเอกสาร ระหว่างสั่งพิมพ์แล้วคืนค่าเดิม
 *
 * กติกาการพิมพ์: `[data-print-hide]` ซ่อนแผงซ้ายกับแถบบนล่าง · `.hrdoc-sheet`
 * ขึ้นหน้าใหม่ทุกแผ่น (ดูส่วน “เอกสาร HR” ใน `app/globals.css`)
 */

/**
 * ชุดช่องกรอก — **หนึ่งชุดคือช่องที่อยู่ด้วยกันบนกระดาษ** (ชื่อ–นามสกุลมาเป็นก้อน ·
 * ผู้ลงนามสามคนมาเป็นก้อน) · `UNIT_DOCS` คือเอกสารทุกฉบับที่ใช้ชุดนั้น
 */
type Unit =
  | "applied"
  | "name"
  | "age"
  | "address"
  | "docDate"
  | "group"
  | "position"
  | "salary"
  | "start"
  | "probation"
  | "supervisor"
  | "guarantor"
  | "deposit"
  | "installment"
  | "deductFrom"
  | "signers";

/**
 * ช่องกรอกของแต่ละฉบับ — **เรียงตามที่ช่องนั้นโผล่บนกระดาษของฉบับนั้นจากบนลงล่าง**
 * คนกรอกไล่ตาลงทั้งซ้ายและขวาไปพร้อมกันได้
 */
const DOC_UNITS: Record<HrDocId, Unit[]> = {
  profile: ["applied"],
  /* Driver Rating ไม่มีช่องเติม — แผงซ้ายเป็นตัวให้คะแนน (`RatingEditor`) แทน */
  rating: [],
  contract: [
    "docDate",
    "group",
    "name",
    "age",
    "address",
    "position",
    "salary",
    "start",
    "supervisor",
    "probation",
    "guarantor",
    "signers",
  ],
  deposit: ["docDate", "name", "position", "salary", "deposit", "installment", "deductFrom", "signers"],
  refund: ["docDate", "name", "position", "salary", "deposit", "signers"],
};

const DOC_NO = Object.fromEntries(HR_DOCUMENTS.map((d, i) => [d.id, `${i + 1})`])) as Record<
  HrDocId,
  string
>;

export function HrDocumentMaker({
  application,
  requisitions,
  onRequisitionsChange,
  docSlots,
  onPatch,
  initialDoc,
  onClose,
}: {
  application: Application;
  /** ฉบับที่เปิดขึ้นมาก่อน — ปุ่มดาวในตารางเปิดตรงที่ Driver Rating */
  initialDoc?: HrDocId;
  /** คำขอสรรหาทั้งหมด (state ของแท็บ) — ดรอปดาวน์ “ตำแหน่งที่สมัคร” อ่านจากนี่ */
  requisitions: Requisition[];
  /** แถวคำขอที่เซิร์ฟเวอร์ส่งกลับหลังผูก/ปลด — ตัวแท็บเอาไปแทนแถวเดิม */
  onRequisitionsChange: (updated: Requisition[]) => void;
  /** ช่องเอกสารทั้งหมดพร้อมค่าจาก Section 4 — รายงานแสดงเฉพาะที่ใบนี้ต้องใช้ */
  docSlots: DocSlot[];
  /** บันทึกการแก้ใบสมัคร (โยน error ต่อ) — ไม่ส่งมา = ปุ่มแก้ไขไม่ขึ้น */
  onPatch?: (patch: {
    answers?: AnswerMap;
    files?: Record<string, string | null>;
    documents?: DocumentData;
    rating?: Record<string, string | null>;
  }) => Promise<void>;
  onClose: () => void;
}) {
  /**
   * คำขอที่ใบนี้ผูกอยู่จริงในระบบ — อ่านจาก state ของแท็บทุกครั้ง ผูก/ปลดสำเร็จแล้ว
   * แท็บแทนแถวใหม่ลงมา ค่านี้ก็เปลี่ยนตามเอง ไม่ต้องถือสำเนาไว้ในกล่อง
   */
  const linked =
    requisitions.find(
      (r) => r.match?.applicationId === application.id && r.status !== "cancelled",
    ) ?? null;

  const facts = useMemo(() => readApplicantFacts(application), [application]);
  /** ค่าที่ถือว่า “บันทึกแล้ว” — ค่าจากฐานเมื่อเคยบันทึก ไม่งั้นค่าที่เติมจากใบสมัคร */
  const [baseline, setBaseline] = useState<DocFill>(() =>
    initialDocFill(facts, linked ? requisitionPosition(linked) : ""),
  );
  const [fill, setFill] = useState<DocFill>(baseline);

  /* สามฉบับที่เก็บลงฐาน — ใบที่ถูกลบข้อมูลแล้วไม่มีทั้งฉบับและไม่มีอะไรให้โหลด */
  const store = useHrDocumentRecord(application.id, !application.erased, (record) => {
    if (!record) return;
    setBaseline(record.fill);
    /* ใบที่ผูกคำขอสรรหาอยู่ในระบบ ตำแหน่งที่สมัครยึดตามคำขอเสมอ — ถ้าต่างจากที่
       บันทึกไว้ จอจะขึ้นว่ามีค่าที่ยังไม่บันทึก ซึ่งตรงกับความจริง */
    setFill(
      linked ? { ...record.fill, appliedPosition: requisitionPosition(linked) } : record.fill,
    );
  });
  const dirty = !sameFill(fill, baseline);
  const [printing, setPrinting] = useState(false);
  const [openingPrint, setOpeningPrint] = useState<string | null>(null);
  const [current, setCurrent] = useState<HrDocId>(initialDoc ?? HR_DOCUMENTS[0].id);
  const [editing, setEditing] = useState<"answers" | "documents" | null>(null);

  /**
   * ร่างคะแนน Driver Rating — ตั้งต้นจากที่บันทึกไว้ในใบ · กระดาษอ่านจากร่างนี้
   * จึงเห็นผลทันทีที่เลือก ส่วนการบันทึกลงฐานรอกดปุ่ม (ส่งเฉพาะข้อที่ต่างจากที่บันทึก)
   */
  const savedRating = application.rating.answers;
  const [ratingDraft, setRatingDraft] = useState<Record<string, string>>(() => ({
    ...savedRating,
  }));
  const [savingRating, setSavingRating] = useState(false);
  const rating = useMemo(
    () =>
      rateApplication({
        questionSnapshot: application.questionSnapshot,
        answers: application.answers,
        manual: ratingDraft,
      }),
    [application.questionSnapshot, application.answers, ratingDraft],
  );
  const ratingPatch = useMemo(() => {
    const out: Record<string, string | null> = {};
    for (const id of new Set([...Object.keys(savedRating), ...Object.keys(ratingDraft)])) {
      if (savedRating[id] !== ratingDraft[id]) out[id] = ratingDraft[id] ?? null;
    }
    return out;
  }, [savedRating, ratingDraft]);
  const ratingDirty = Object.keys(ratingPatch).length;
  /** คำขอที่เลือกไว้ใช้บนเอกสารอย่างเดียว — ใบที่ผูกในระบบไม่ได้ (ยกเลิกแล้ว) */
  const [draftRq, setDraftRq] = useState("");
  const [linking, setLinking] = useState(false);

  /* ผูกได้ทุกสถานะยกเว้นยกเลิก (`LINKABLE_STATUSES` — เซิร์ฟเวอร์บังคับซ้ำใน `linkApplication()`) */
  const linkable = LINKABLE_STATUSES.includes(application.status) && !application.erased;
  const chosen = linked ?? requisitions.find((r) => r.id === draftRq) ?? null;

  /** คำขอที่เปิดรับอยู่ + คำขอที่ใบนี้ผูกอยู่ (ซึ่งไม่ได้เปิดรับแล้วเพราะได้คนคือใบนี้) */
  const rqOptions = requisitions
    .filter((r) => r.status === "open" || r.id === linked?.id)
    .sort((a, b) => b.code.localeCompare(a.code, "th", { numeric: true }))
    .map((r) => ({ value: r.id, label: requisitionOption(r) }));

  /* ใบที่ผู้สมัครขอลบข้อมูลแล้วเหลือแต่รายงาน (ซึ่งบอกว่าข้อมูลถูกลบ) — ทำสัญญา
     จากใบที่ไม่มีชื่อ ที่อยู่ หรืออายุแล้วไม่มีความหมาย */
  const docs = application.erased
    ? HR_DOCUMENTS.filter((d) => d.id === "profile")
    : HR_DOCUMENTS;
  const doc = docs.find((d) => d.id === current) ?? docs[0];
  const canEdit = Boolean(onPatch) && !application.erased;

  const set =
    <K extends keyof DocFill>(key: K) =>
    (value: DocFill[K]) =>
      setFill((prev) => ({ ...prev, [key]: value }));

  /** โหลดใหม่หลังโหลดไม่สำเร็จ — มีค่าที่แก้ค้างอยู่ต้องถามก่อน เพราะค่าที่บันทึกไว้จะเทลงทับ */
  async function reloadRecord() {
    if (
      dirty &&
      !(await confirm({
        title: "โหลดค่าที่บันทึกไว้?",
        text: "ค่าที่แก้ในช่องกรอกตอนนี้จะถูกแทนที่ด้วยค่าที่บันทึกไว้ (ถ้ามี)",
        confirmText: "โหลด",
        tone: "warn",
      }))
    )
      return;
    await store.reload();
  }

  /** เทค่าบนกระดาษของการพิมพ์ครั้งหนึ่งกลับลงช่องกรอก — ถูกบันทึกเมื่อกดพิมพ์ครั้งถัดไป */
  async function openPrint(p: HrDocumentPrint) {
    if (
      dirty &&
      !(await confirm({
        title: "เปิดค่าจากฉบับที่พิมพ์ไว้?",
        text: "ค่าที่แก้ในช่องกรอกตอนนี้จะถูกแทนที่",
        confirmText: "เปิด",
        tone: "warn",
      }))
    )
      return;
    setOpeningPrint(p.id);
    try {
      const full = await store.openPrint(p.id);
      setFill(full.fill);
      setCurrent(full.docId);
    } catch (err) {
      alertError("เปิดฉบับที่พิมพ์ไว้ไม่สำเร็จ", err instanceof Error ? err.message : undefined);
    } finally {
      setOpeningPrint(null);
    }
  }

  async function print() {
    rememberCompanyFill(fill);

    /* ฉบับที่เก็บลงฐาน: **ปุ่มพิมพ์คือปุ่มบันทึก** (ไม่มีปุ่มบันทึกแยก ตามคำสั่งเจ้าของงาน
       29 ก.ย. 2026) — บันทึกค่าในช่องกรอก แล้วลงประวัติพร้อมสำเนาค่าบนกระดาษ ครบทั้งสอง
       ขั้นถึงจะเปิดหน้าพิมพ์ · ล้มขั้นไหนไม่พิมพ์ กระดาษที่ออกไปทุกแผ่นจึงมีประวัติเสมอ */
    if (isHrRecordDoc(doc.id) && !application.erased) {
      const docId = doc.id;
      const out = await runAction({
        confirm: false,
        success: false,
        failureTitle: "บันทึกก่อนพิมพ์ไม่สำเร็จ — ยังไม่ได้พิมพ์",
        run: async () => {
          setPrinting(true);
          try {
            const saved = await store.save(fill);
            await store.logPrint(docId, saved.fill);
            return saved;
          } finally {
            setPrinting(false);
          }
        },
      });
      if (out.status !== "done") return;
      setBaseline(out.data.fill);
      setFill(out.data.fill);
    }

    printAs(`${application.ref} ${personName(fill)} - ${doc.label}`);
  }

  const end = probationEnd(fill);

  /** เลือกคำตอบ Driver Rating หนึ่งข้อ · `""` = ล้างคะแนนที่ให้เอง กลับไปใช้คำตอบจากฟอร์ม */
  function pickRating(id: string, label: string) {
    setRatingDraft((prev) => {
      const next = { ...prev };
      if (label) next[id] = label;
      else delete next[id];
      return next;
    });
  }

  /** บันทึกคะแนนลงใบสมัคร — ถาม → ยิง → บอกผล · ตารางหลักอัปเดตสรุปดาวเองผ่าน `onPatch` */
  async function saveRating() {
    if (!onPatch || !ratingDirty) return;
    await runAction({
      confirm: false,
      pending: "กำลังบันทึกผลประเมิน…",
      success: `บันทึก Driver Rating แล้ว (${ratingDirty} ข้อ)`,
      failureTitle: "บันทึกผลประเมินไม่สำเร็จ",
      run: async () => {
        setSavingRating(true);
        try {
          await onPatch({ rating: ratingPatch });
        } finally {
          setSavingRating(false);
        }
      },
    });
  }

  /**
   * เลือกคำขอสรรหา — ใบที่ผูกได้ **ผูกจริงในระบบทันที** (ถาม → ยิง → บอกผล)
   * หน้าคำขอสรรหาจึงขึ้นชื่อผู้สมัครในคอลัมน์ผู้รับอัตราและสถานะเปลี่ยนตาม
   *
   * เปลี่ยนจากคำขอหนึ่งไปอีกคำขอ = ปลดของเดิมก่อนแล้วค่อยผูกใหม่ (เซิร์ฟเวอร์ไม่ยอม
   * ให้ใบเดียวผูกสองคำขอ) · ถ้าปลดผ่านแต่ผูกไม่ผ่าน แถวที่เขียนไปแล้วยังถูกส่งขึ้นไป
   * ให้แท็บ — จอต้องตรงกับฐาน ไม่ใช่ค้างอยู่ที่ก่อนกด
   *
   * ใบที่ผูกไม่ได้ (ยกเลิกแล้ว) เลือกได้เพื่อใส่ในเอกสารเท่านั้น ไม่เขียนอะไร
   */
  async function pickRequisition(id: string) {
    const next = requisitions.find((r) => r.id === id) ?? null;

    if (!linkable) {
      setDraftRq(id);
      set("appliedPosition")(next ? requisitionPosition(next) : "");
      return;
    }
    if ((next?.id ?? null) === (linked?.id ?? null)) return;

    const written: Requisition[] = [];
    const patch = async (rq: Requisition, body: RequisitionPatch) => {
      const row = await requestJson<Requisition>(
        `/api/recruitment/requisitions/${rq.id}`,
        { method: "PATCH", body: body as Record<string, unknown> },
        next ? "ผูกผู้สมัครกับคำขอไม่สำเร็จ" : "ปลดการผูกไม่สำเร็จ",
      );
      written.push(row);
    };

    const out = await runAction({
      confirm: next
        ? {
            title: `ผูก ${application.fullName} กับ ${next.code}?`,
            html: `<div class="hrs-swal-list">${[
              requisitionOption(next),
              linked ? `ปลดออกจาก ${linked.code} ก่อน — คำขอนั้นจะกลับไปเปิดรับ` : "",
              "หน้าคำขอสรรหาจะขึ้นชื่อผู้สมัครรายนี้ในอัตรานี้ทันที",
            ]
              .filter(Boolean)
              .map(escapeHtml)
              .join("<br>")}</div>`,
            confirmText: "ผูกและบันทึก",
          }
        : {
            title: `ปลด ${application.fullName} ออกจาก ${linked!.code}?`,
            text: "คำขอนี้จะกลับไปเปิดรับ และเอกสารจะไม่มีตำแหน่งที่สมัคร",
            confirmText: "ปลดการผูก",
            tone: "warn",
          },
      pending: "กำลังบันทึกคำขอสรรหา…",
      success: next ? `ผูกกับ ${next.code} แล้ว` : "ปลดการผูกแล้ว",
      failureTitle: next ? "ผูกผู้สมัครกับคำขอไม่สำเร็จ" : "ปลดการผูกไม่สำเร็จ",
      run: async () => {
        setLinking(true);
        try {
          if (linked) await patch(linked, { applicationId: null });
          if (next) await patch(next, { applicationId: application.id });
        } finally {
          setLinking(false);
        }
      },
    });

    if (written.length) onRequisitionsChange(written);
    if (out.status === "done") set("appliedPosition")(next ? requisitionPosition(next) : "");
  }

  /** ช่องกรอกของแต่ละชุด — ที่เดียวที่รู้ว่าชุดไหนหน้าตาเป็นยังไง */
  function renderUnit(unit: Unit) {
    switch (unit) {
      case "applied":
        return (
          <>
            <SelectField
              id="doc-applied"
              label="ตำแหน่งที่สมัคร (คำขอสรรหา)"
              optional
              placeholder={rqOptions.length ? "เลือก RQ ที่เปิดรับ" : "ไม่มีคำขอที่เปิดรับอยู่"}
              searchable
              searchPlaceholder="ค้นเลข RQ ลูกค้า แพล้น ครูฝึก ทะเบียน"
              clearable={Boolean(chosen)}
              readOnly={linking || application.erased}
              options={rqOptions}
              value={chosen?.id ?? ""}
              onChange={pickRequisition}
            />
            {chosen ? <RequisitionCard rq={chosen} synced={chosen.id === linked?.id} /> : null}
          </>
        );
      case "name":
        return (
          <>
            <div className="grid grid-cols-[5.5rem_1fr] gap-3">
              <TextField id="doc-title" label="คำนำหน้า" optional value={fill.title} onChange={set("title")} />
              <TextField id="doc-first" label="ชื่อ" optional value={fill.firstName} onChange={set("firstName")} />
            </div>
            <TextField id="doc-last" label="นามสกุล" optional value={fill.lastName} onChange={set("lastName")} />
          </>
        );
      case "age":
        return <TextField id="doc-age" label="อายุ (ปี)" optional value={fill.age} onChange={set("age")} />;
      case "address":
        return (
          <TextField id="doc-address" label="ที่อยู่ตามทะเบียนบ้าน" optional value={fill.address} onChange={set("address")} />
        );
      case "docDate":
        return <DateField id="doc-date" label="วันที่ทำเอกสาร" optional value={fill.docDate} onChange={set("docDate")} />;
      case "group":
        return <TextField id="doc-group" label="กลุ่ม" optional value={fill.group} onChange={set("group")} />;
      case "position":
        return <TextField id="doc-position" label="ตำแหน่ง" optional value={fill.position} onChange={set("position")} />;
      case "salary":
        return (
          <NumberField
            id="doc-salary"
            label="รายได้ขั้นต้น / อัตราเงินเดือน (บาท)"
            optional
            hint={bahtText(fill.salary)}
            value={fill.salary}
            onChange={set("salary")}
          />
        );
      case "start":
        return <DateField id="doc-start" label="เริ่มปฏิบัติงาน" optional value={fill.startDate} onChange={set("startDate")} />;
      case "supervisor":
        return (
          <>
            <TextField id="doc-supervisor" label="ผู้บังคับบัญชา" optional value={fill.supervisor} onChange={set("supervisor")} />
            <TextField
              id="doc-supervisor-title"
              label="ตำแหน่งผู้บังคับบัญชา"
              optional
              value={fill.supervisorTitle}
              onChange={set("supervisorTitle")}
            />
          </>
        );
      case "probation":
        return (
          <NumberField
            id="doc-probation"
            label="ทดลองงาน (วัน) — ข้อ 1"
            optional
            hint={end ? `ถึงวันที่ ${thaiLongDate(end)}` : undefined}
            value={fill.probationDays}
            onChange={set("probationDays")}
          />
        );
      case "guarantor":
        return (
          <TextField
            id="doc-guarantor"
            label="ผู้ค้ำประกันการทำงาน — ข้อ 5"
            optional
            hint="เว้นว่างได้ ถ้าจะเขียนมือตอนเซ็น"
            placeholder="นาย / นาง / นางสาว …"
            value={fill.guarantor}
            onChange={set("guarantor")}
          />
        );
      case "deposit":
        return (
          <NumberField
            id="doc-deposit"
            label="จำนวนเงินประกัน (บาท)"
            optional
            hint={bahtText(fill.deposit)}
            value={fill.deposit}
            onChange={set("deposit")}
          />
        );
      case "installment":
        return (
          <NumberField
            id="doc-installment"
            label="หักงวดละ (บาท/เดือน)"
            optional
            hint={bahtText(fill.installment)}
            value={fill.installment}
            onChange={set("installment")}
          />
        );
      case "deductFrom":
        return (
          <DateField
            id="doc-deduct"
            label="เริ่มหักงวดแรก"
            optional
            hint="เว้นว่างได้ ถ้ายังไม่รู้รอบเงินเดือนแรก"
            value={fill.deductFrom}
            onChange={set("deductFrom")}
          />
        );
      case "signers":
        return (
          <div className="flex flex-col gap-3 rounded-field border border-line p-3">
            <p className="flex items-baseline justify-between gap-2 text-12-5 font-medium">
              ผู้ลงนามฝั่งบริษัท
              <span className="text-11 font-normal text-mut">เครื่องนี้จำไว้เมื่อกดพิมพ์</span>
            </p>
            <TextField id="doc-employer" label="นายจ้าง (ผู้รับมอบอำนาจ)" optional value={fill.employer} onChange={set("employer")} />
            <TextField id="doc-witness1" label="พยาน 1" optional value={fill.witness1} onChange={set("witness1")} />
            <TextField id="doc-witness2" label="พยาน 2" optional value={fill.witness2} onChange={set("witness2")} />
          </div>
        );
    }
  }

  return (
    <ModalShell
      title={`ทำเอกสาร · ${application.fullName}`}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-11-5 tracking-wider text-primary">{application.ref}</span>
          <span>เติมจากใบสมัครให้แล้ว แก้ได้ทุกช่อง · กดพิมพ์แล้วค่าจะถูกบันทึกไว้ (ไม่ทับคำตอบของผู้สมัคร)</span>
        </span>
      }
      onClose={onClose}
      width="1320px"
      tone="form"
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-field border border-line px-3.5 py-2.5 text-13 transition-colors hover:border-primary/40"
            >
              ปิด
            </button>
            <button
              type="button"
              onClick={() => void print()}
              disabled={printing}
              className="flex items-center gap-2 rounded-field bg-primary px-4 py-2.5 text-13 font-medium text-primary-content transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {printing ? (
                <Loader2 size={14} strokeWidth={2} aria-hidden className="animate-spin" />
              ) : (
                <Printer size={14} strokeWidth={2} aria-hidden />
              )}
              พิมพ์ / บันทึก PDF · {doc.label}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex min-h-0 flex-col lg:h-[calc(94dvh-9rem)] lg:flex-row print:block print:h-auto">
        {/* ─────────────────────────────── แผงซ้าย: เลือกเอกสาร + ช่องกรอก */}
        <aside
          data-print-hide
          /* `hrdoc-fields` = ค่าที่กรอก/เลือกในแผงนี้เป็นสี indigo คู่กับหมึกบนกระดาษ (globals.css) */
          className="hrdoc-fields flex flex-col gap-5 border-b border-line bg-base-100 p-4 lg:w-[360px] lg:flex-none lg:overflow-y-auto lg:border-r lg:border-b-0"
        >
          <Section title="เลือกเอกสาร">
            {/* เลือกได้ฉบับเดียว — ปุ่มวงกลมแบบ radio ไม่ใช่ช่องติ๊ก จะได้ไม่ชวนให้
                คิดว่ารวมหลายฉบับพิมพ์พร้อมกันได้ */}
            <div role="radiogroup" aria-label="เอกสารที่จะพรีวิวและพิมพ์" className="flex flex-col gap-1.5">
              {docs.map((d) => {
                const on = d.id === doc.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setCurrent(d.id)}
                    className={`flex items-center gap-3 rounded-field border px-3 py-2.5 text-left transition-colors ${
                      on ? "border-primary/50 bg-soft" : "border-line hover:border-primary/40"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`flex size-4.5 flex-none items-center justify-center rounded-full border ${
                        on ? "border-primary" : "border-line"
                      }`}
                    >
                      {on ? <span className="size-2.5 rounded-full bg-primary" /> : null}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-13 font-medium">
                        {DOC_NO[d.id]} {d.label}
                      </span>
                      <span className="truncate text-11-5 text-mut">{d.hint}</span>
                    </span>
                    {d.code ? (
                      <span className="flex-none font-mono text-10-5 text-mut">{d.code}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </Section>

          {isHrRecordDoc(doc.id) && !application.erased ? (
            <PrintHistory
              state={store.state}
              onReload={() => void reloadRecord()}
              onOpenPrint={(p) => void openPrint(p)}
              openingPrint={openingPrint}
            />
          ) : null}

          <Section no={DOC_NO[doc.id]} title={doc.label} code={doc.code}>
            {DOC_UNITS[doc.id].map((unit) => (
              <div key={unit} className="flex flex-col gap-1.5">
                {renderUnit(unit)}
              </div>
            ))}

            {doc.id === "rating" ? (
              <RatingEditor
                result={rating}
                saved={savedRating}
                dirty={ratingDirty}
                saving={savingRating}
                canEdit={canEdit}
                onPick={pickRating}
                onSave={saveRating}
              />
            ) : null}

            {doc.id === "profile" ? (
              <>
                {canEdit ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing("answers")}
                      className="flex items-center justify-center gap-2 rounded-field border border-line px-3 py-2.5 text-13 transition-colors hover:border-primary/40 hover:text-primary"
                    >
                      <SquarePen size={14} strokeWidth={2} aria-hidden />
                      แก้ไขใบสมัคร
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing("documents")}
                      className="flex items-center justify-center gap-2 rounded-field border border-line px-3 py-2.5 text-13 transition-colors hover:border-primary/40 hover:text-primary"
                    >
                      <FileStack size={14} strokeWidth={2} aria-hidden />
                      เอกสารและข้อมูล
                    </button>
                  </div>
                ) : null}
                {application.files.length ? (
                  <div className="flex flex-col gap-2">
                    <span className="text-12-5 font-medium text-mut">
                      ไฟล์แนบ {application.files.length} รายการ · กดรูปเพื่อดูเต็ม
                    </span>
                    <AttachmentGallery urls={application.files.map((f) => f.url)} thumb={56} />
                  </div>
                ) : null}
              </>
            ) : null}
          </Section>
        </aside>

        {/* ──────────────────────────────────────── แผงขวา: กระดาษจริง */}
        <div
          /* สลับฉบับแล้วกระดาษเริ่มที่หัวเอกสารเสมอ ไม่ค้างตำแหน่งเลื่อนของฉบับก่อน */
          key={doc.id}
          data-print-area
          className="flex min-h-0 flex-1 flex-col items-center gap-6 overflow-auto bg-canvas p-6 print:block print:overflow-visible print:bg-transparent print:p-0"
        >
          {doc.id === "profile" ? (
            <ApplicantProfile application={application} docSlots={docSlots} requisition={chosen} />
          ) : null}
          {doc.id === "rating" ? (
            <RatingSheet application={application} result={rating} requisition={chosen} />
          ) : null}
          {doc.id === "contract" ? <EmploymentContract fill={fill} /> : null}
          {doc.id === "deposit" ? <DepositConsent fill={fill} /> : null}
          {doc.id === "refund" ? <RefundConsent fill={fill} /> : null}
        </div>
      </div>

      {editing === "answers" && onPatch ? (
        <CandidateEditModal
          application={application}
          onPatch={onPatch}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {editing === "documents" && onPatch ? (
        <CandidateDocumentsModal
          application={application}
          docSlots={docSlots}
          onPatch={onPatch}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </ModalShell>
  );
}

/** ป้ายตัวเลือกคำขอ — `RQ-2569-012 · Cpac บางจาก · ครูฝึก สมศักดิ์ · 70-1234` */
function requisitionOption(r: Requisition): string {
  return [
    r.code,
    [customerLabel(r), r.plant].filter(Boolean).join(" ") || "ยังไม่ระบุลูกค้า",
    r.trainer ? `ครูฝึก ${r.trainer.name}` : "ยังไม่มีครูฝึก",
    r.vehicle?.plateNo || r.vehicle?.code || "ยังไม่มีรถ",
  ].join(" · ");
}

/** รายละเอียดคำขอที่เลือก — ให้เห็นครบก่อนพิมพ์ ไม่ต้องอ่านจากป้ายยาวในดรอปดาวน์ */
function RequisitionCard({ rq, synced }: { rq: Requisition; synced: boolean }) {
  const rows: [string, string][] = [
    ["ตำแหน่ง", requisitionPosition(rq)],
    ["ลูกค้า / แพล้น", [customerLabel(rq), rq.plant].filter(Boolean).join(" · ") || "—"],
    ["ครูฝึก", rq.trainer ? `${rq.trainer.name} (${rq.trainer.drivercode})` : "—"],
    [
      "รถ",
      rq.vehicle
        ? [rq.vehicle.plateNo, rq.vehicle.code, rq.vehicle.brand].filter(Boolean).join(" · ")
        : "—",
    ],
  ];
  return (
    <div className="flex flex-col gap-1.5 rounded-field border border-line bg-base-200/60 p-3 text-12-5">
      <p className="flex items-center justify-between gap-2">
        <span className="font-mono text-11-5 font-medium tracking-wider text-primary">
          {rq.code}
        </span>
        <span className={`text-11 ${synced ? "text-primary" : "text-mut"}`}>
          {synced ? "ผูกในระบบแล้ว" : "ใช้บนเอกสารเท่านั้น"}
        </span>
      </p>
      <dl className="grid grid-cols-[6rem_1fr] gap-x-2 gap-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-mut">{k}</dt>
            <dd className="m-0 text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * สั่งพิมพ์โดยตั้ง `document.title` เป็นชื่อไฟล์ PDF ที่ต้องการ แล้วคืนค่าเดิมหลังพิมพ์
 * — อยู่นอกคอมโพเนนต์เพราะการแก้ `document` ในฟังก์ชัน async ของคอมโพเนนต์โดน
 * React Compiler ปัดตก (`react-hooks/immutability`)
 */
export function printAs(title: string) {
  const before = document.title;
  document.title = title;
  window.addEventListener("afterprint", () => (document.title = before), { once: true });
  window.print();
}

/**
 * หัว section = หัวเอกสาร — เลขข้อกับรหัสแบบฟอร์มตรงกับการ์ดเลือกเอกสารข้างบน
 * (กล่องทำเอกสารพ้นสภาพ `resign-document-maker.tsx` ใช้ตัวเดียวกัน)
 */
export function Section({
  no,
  title,
  code,
  children,
}: {
  /** เลขเอกสาร `1)` — ไม่ส่ง = section ทั่วไป (การ์ดเลือกเอกสาร) */
  no?: string;
  title: string;
  code?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-baseline gap-2 border-b border-line-strong pb-1.5">
        <h3 className="text-13 font-semibold text-ink">
          {no ? `${no} ` : ""}
          {title}
        </h3>
        {code ? <span className="ml-auto font-mono text-10-5 text-mut">{code}</span> : null}
      </header>
      {children}
    </section>
  );
}
