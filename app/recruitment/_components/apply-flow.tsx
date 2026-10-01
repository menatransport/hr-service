"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Check, Copy, PhoneCall, TriangleAlert, UserCheck } from "lucide-react";

import {
  ActionBar,
  FlowTopBar,
  StepRail,
} from "@/app/recruitment/_components/apply-chrome";
import { ApplyReview } from "@/app/recruitment/_components/apply-review";
import { LightTheme } from "@/app/recruitment/_components/light-theme";
import { ConsentGate } from "@/app/recruitment/_components/consent-gate";
import {
  DocUpload,
  EMPTY_ID_CARD,
  type IdCardDraft,
} from "@/app/recruitment/_components/doc-upload";
import { QuestionField } from "@/app/recruitment/_components/question-field";
import { StageMascot } from "@/app/recruitment/_components/mascot";
import { requestJson } from "@/lib/http";
import {
  APPLY_STAGES,
  TOTAL_STAGES,
  emptyAnswer,
  formDocSlots,
  missingDocs,
  validateDocumentField,
  validateSection,
  visibleQuestions,
  type DocSlot,
} from "@/app/recruitment/_lib/form";
import {
  DOCUMENT_FIELDS,
  QUESTION_SECTIONS,
  type AnswerMap,
  type AnswerValue,
  type Question,
} from "@/app/recruitment/_lib/types";

/**
 * ฟอร์มสมัครงานทั้งเส้นทาง — ด่านยินยอม → ห้าขั้น → หน้าส่งสำเร็จ
 *
 * เป็น client component ก้อนเดียวโดยตั้งใจ เพราะทั้งเส้นทางใช้สถานะชุดเดียวกัน
 * (คำตอบ ไฟล์ ความยินยอม) และการแตกเป็นหลายหน้าจะทำให้คำตอบหายทุกครั้งที่
 * เปลี่ยนหน้า — ซึ่งเป็นสิ่งที่ผู้สมัครบนเน็ต 4G ที่ไม่นิ่งเจอบ่อยที่สุด
 *
 * **ร่างถูกบันทึกลง localStorage ทุกครั้งที่ค่าเปลี่ยน** ปิดจอหรือสายหลุดกลางคัน
 * แล้วเปิดกลับมาจะกรอกต่อจากเดิมได้ · ไม่ได้บันทึกลงฐานข้อมูลเพราะร่างที่ยังไม่
 * ส่งคือข้อมูลที่เจ้าตัวยังไม่ได้ตัดสินใจให้เรา เก็บไว้ในเครื่องเขาเองตรงกับ
 * หลักเก็บเท่าที่จำเป็นมากกว่า
 *
 * ขั้น “ตรวจอีกครั้งก่อนส่ง” อยู่ที่ `apply-review.tsx` เพราะจอพรีวิวในหน้าแอดมิน
 * ต้องเรนเดอร์ขั้นนั้นด้วยตัวเดียวกัน — อย่าก๊อปกลับเข้ามาที่นี่
 */

const DRAFT_KEY = "hrs-recruit-draft";

interface Draft {
  /**
   * รหัสโฟลเดอร์ไฟล์ร่างบน S3 (`mass-image/applications/_drafts/{draftId}/`) — สุ่มครั้งแรกที่
   * เปิดฟอร์มแล้วอยู่กับร่างจนกดส่ง · ไฟล์ร่างหายเองใน 1 วัน ร่างที่ค้างนานกว่านั้นจะแนบใหม่
   * ตอนกดส่ง (เซิร์ฟเวอร์บอกว่าช่องไหนหมดอายุ)
   */
  draftId: string;
  granted: string[];
  answers: AnswerMap;
  files: Record<string, string | null>;
  idCard: IdCardDraft;
  stage: number;
}

const emptyDraft = (): Draft => ({
  draftId: newDraftId(),
  granted: [],
  answers: {},
  files: {},
  idCard: EMPTY_ID_CARD,
  stage: 0,
});

/**
 * UUID v4 — `crypto.randomUUID()` ใช้ได้เฉพาะ https/localhost จึงประกอบเองจาก
 * `getRandomValues()` (ใช้ได้ทุกที่) ฟอร์มที่เปิดผ่าน IP ในวงแลนตอนทดสอบจะได้ไม่พัง
 */
function newDraftId(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function readDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return emptyDraft();
    const draft = JSON.parse(raw) as Partial<Draft>;
    return {
      draftId: draft.draftId || newDraftId(),
      granted: draft.granted ?? [],
      answers: draft.answers ?? {},
      files: draft.files ?? {},
      idCard: { ...EMPTY_ID_CARD, ...draft.idCard },
      stage: Math.min(Math.max(draft.stage ?? 0, 0), TOTAL_STAGES - 1),
    };
  } catch {
    /* ร่างเสียหายหรือเบราว์เซอร์ปิด storage ไว้ — เริ่มใหม่เงียบ ๆ ดีกว่าขึ้น error */
    return emptyDraft();
  }
}

/** ไม่มีอะไรให้ subscribe — ค่าคงที่ตลอดอายุหน้า เปลี่ยนแค่ตอนข้ามจาก server ไป client */
const noSubscribe = () => () => {};

/**
 * ตัวฟอร์มจริงถูก mount หลัง hydrate แล้วเท่านั้น
 *
 * เพราะร่างอยู่ใน `localStorage` ซึ่งฝั่งเซิร์ฟเวอร์ไม่มี — ถ้าอ่านร่างใน effect
 * แล้ว `setState` จะได้ render ซ้ำหนึ่งรอบและผู้ใช้เห็นฟอร์มเปล่าแวบหนึ่งก่อน
 * ค่าเก่าจะเด้งกลับมา · รอให้ hydrate เสร็จแล้วค่อยอ่านร่างมาเป็นค่าตั้งต้นของ
 * `useState` ตั้งแต่ render แรกของฟอร์ม จึงไม่มีทั้งการกระพริบและ render ซ้ำ
 */
export function ApplyFlow({
  questions,
  docSlots,
}: {
  questions: Question[];
  /** ทุกช่องพร้อมค่าแสดง/บังคับจาก Section 4 — ช่องที่ซ่อนถูกกรองออกข้างใน */
  docSlots: DocSlot[];
}) {
  const hydrated = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );

  return (
    <>
      {/* หน้ากลุ่มนี้เป็นธีมสว่างอย่างเดียว — แขวนไว้นอกเงื่อนไข hydrate
          ธีมจึงถูกบังคับตั้งแต่จอโครงร่าง ไม่ใช่รอจนฟอร์มจริงขึ้น */}
      <LightTheme />
      {hydrated ? (
        <Flow questions={questions} docSlots={docSlots} draft={readDraft()} />
      ) : (
        <Skeleton />
      )}
    </>
  );
}

/** โครงหน้าระหว่างรอ hydrate — ทรงเดียวกับของจริงเป๊ะ ไม่งั้นจะเห็นหน้ากระโดด */
function Skeleton() {
  return (
    <div aria-hidden className="recruit-canvas flex min-h-dvh flex-col">
      <div className="h-14 flex-none border-b border-line bg-base-100" />
      <div className="mx-auto w-full max-w-lg flex-1 animate-pulse px-5 py-5">
        <div className="flex gap-1.5">
          {Array.from({ length: TOTAL_STAGES }, (_, i) => (
            <span key={i} className="h-1.5 flex-1 rounded-full bg-line" />
          ))}
        </div>
        <div className="mt-6 flex flex-col gap-3.5">
          <div className="h-7 w-3/4 rounded-field bg-line" />
          <div className="h-24 rounded-box bg-line/60" />
          <div className="h-24 rounded-box bg-line/60" />
          <div className="h-24 rounded-box bg-line/60" />
        </div>
      </div>
    </div>
  );
}

function Flow({
  questions,
  docSlots,
  draft,
}: {
  questions: Question[];
  docSlots: DocSlot[];
  draft: Draft;
}) {
  const [draftId] = useState(draft.draftId);
  const [granted, setGranted] = useState<string[]>(draft.granted);
  const [accepted, setAccepted] = useState(draft.granted.length > 0);
  const [stage, setStage] = useState(draft.stage);
  const [answers, setAnswers] = useState<AnswerMap>(draft.answers);
  const [files, setFiles] = useState<Record<string, string | null>>(draft.files);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [docErrors, setDocErrors] = useState<string[]>([]);
  const [idCard, setIdCard] = useState<IdCardDraft>(draft.idCard);
  const [idCardError, setIdCardError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);

  const top = useRef<HTMLDivElement>(null);

  const shownSlots = formDocSlots(docSlots);
  /* ช่องบัตรประชาชนถูกซ่อน = ไม่มีรูปให้อ่านเลขบัตร ไม่ต้องตรวจและไม่ต้องส่ง */
  const readsIdCard = shownSlots.some((s) => s.id === "id_card");

  /* เขียนร่างลงที่เก็บของเบราว์เซอร์ — เป็นการอัปเดตระบบภายนอกด้วยค่าล่าสุดของ
     React ซึ่งเป็นสิ่งที่ effect มีไว้ทำ (ไม่มี setState อยู่ในนี้โดยตั้งใจ) */
  useEffect(() => {
    if (ref) return;
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ draftId, granted, answers, files, idCard, stage } satisfies Draft),
      );
    } catch {
      /* โควตาเต็มหรือโหมดส่วนตัว — ฟอร์มยังกรอกต่อได้ แค่ไม่มีร่างให้กลับมาต่อ */
    }
  }, [draftId, granted, answers, files, idCard, stage, ref]);

  function setAnswer(key: string, value: AnswerValue) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    // ลบ error ของช่องนี้ทันทีที่แก้ — ไม่ต้องรอกดถัดไปอีกรอบถึงจะหาย
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function goTo(next: number) {
    setStage(next);
    setErrors({});
    setDocErrors([]);
    setIdCardError(null);
    top.current?.scrollIntoView({ block: "start" });
  }

  function next() {
    const current = APPLY_STAGES[stage];

    if (current.kind === "questions") {
      const found = validateSection(questions, current.section, answers);
      if (Object.keys(found).length) {
        setErrors(found);
        top.current?.scrollIntoView({ block: "start" });
        return;
      }
    }

    if (current.kind === "documents") {
      const gaps = missingDocs(files, docSlots);
      const nidField = DOCUMENT_FIELDS.find((f) => f.key === "nationalId");
      const nidError =
        readsIdCard && nidField ? validateDocumentField(nidField, idCard.nationalId) : null;
      if (gaps.length || nidError) {
        setDocErrors(gaps.map((g) => g.id));
        setIdCardError(nidError);
        top.current?.scrollIntoView({ block: "start" });
        return;
      }
    }

    goTo(stage + 1);
  }

  async function submit() {
    setSubmitting(true);
    setFailure(null);
    try {
      const result = await requestJson<{ ref: string }>(
        "/api/recruitment/public/applications",
        {
          method: "POST",
          body: {
            consent: granted,
            answers,
            /* ร่างเก่าอาจมีไฟล์ของช่องที่ถูกซ่อนไปแล้วค้างอยู่ — ส่งเฉพาะช่องที่เห็น */
            files: shownSlots.filter((slot) => files[slot.id]).map((slot) => ({
              slot: slot.id,
              url: files[slot.id],
            })),
            documents: readsIdCard
              ? { nationalId: idCard.nationalId, idCardExpiry: idCard.idCardExpiry }
              : {},
            documentSource: idCard.source,
          },
        },
        "ส่งใบสมัครไม่สำเร็จ",
      );
      setRef(result.ref);
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ลบไม่ได้ก็ไม่เป็นไร — ร่างที่ค้างจะถูกทับเมื่อสมัครรอบหน้า */
      }
    } catch (err) {
      setFailure(err instanceof Error ? err.message : "ส่งใบสมัครไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  if (ref) return <Submitted refCode={ref} />;

  if (!accepted) {
    return (
      <div className="recruit-canvas flex min-h-dvh flex-col">
        <FlowTopBar onBack={null} saved={false} />
        <div className="mx-auto w-full max-w-lg flex-1 px-5 py-6">
          <ConsentGate
            granted={granted}
            onToggle={(id) =>
              setGranted((prev) =>
                prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
              )
            }
            onAccept={() => setAccepted(true)}
          />
        </div>
      </div>
    );
  }

  const current = APPLY_STAGES[stage];
  const heading =
    current.kind === "questions"
      ? QUESTION_SECTIONS.find((s) => s.id === current.section)
      : undefined;

  const stageTitle =
    current.kind === "documents"
      ? "เอกสารประจำตัว"
      : current.kind === "review"
        ? "ตรวจก่อนส่ง"
        : (heading?.title ?? "");

  return (
    <div className="recruit-canvas flex min-h-dvh flex-col">
      <FlowTopBar onBack={stage > 0 ? () => goTo(stage - 1) : null} saved />

      <div ref={top} className="mx-auto w-full max-w-lg flex-1 scroll-mt-4 px-5 py-5">
        <StepRail stage={stage} total={TOTAL_STAGES} title={stageTitle} />

        {/*
          `key={stage}` ทำให้ก้อนนี้ถูกสร้างใหม่ทุกครั้งที่เปลี่ยนขั้น แอนิเมชัน
          เข้าจึงเล่นซ้ำได้ทุกหน้าจอ — ไม่ใช่เล่นครั้งเดียวตอน mount แรก
          (`prefers-reduced-motion` ถูกปิดให้ทั้งระบบแล้วที่ `globals.css`)
        */}
        <div key={stage} className="mt-6 flex flex-col gap-5 animate-lift-in">
          {/* มาสคอตอยู่แถวเดียวกับหัวเรื่อง ไม่ใช่บรรทัดของตัวเอง — บนมือถือทุก
              บรรทัดที่เพิ่มคือช่องกรอกที่ถูกดันตกไปใต้เส้นพับ · `items-center`
              ให้ตัวมาสคอตอยู่กึ่งกลางความสูงของหัวเรื่องไม่ว่าจะตกกี่บรรทัด
              · อยู่ **ฝั่งขวา** หัวเรื่องจึงเริ่มชิดขอบซ้ายตรงแนวเดียวกับการ์ด
              คำถามที่อยู่ถัดลงไป สายตาไล่ลงมาเป็นเส้นตรงเส้นเดียว */}
          <div className="flex items-center gap-3">
            <h1 className="min-w-0 flex-1 text-21 leading-snug font-semibold text-balance">
              {current.kind === "documents"
                ? "ถ่ายรูปเอกสารประจำตัว"
                : current.kind === "review"
                  ? "ตรวจอีกครั้งก่อนส่ง"
                  : (heading?.lead ?? "")}
            </h1>
            <StageMascot stage={current} />
          </div>

          {current.kind === "questions" ? (
            <div className="flex flex-col gap-3.5">
              {visibleQuestions(questions, current.section, answers).map((q) => (
                <QuestionField
                  key={q.key}
                  question={q}
                  value={answers[q.key] ?? emptyAnswer(q.kind)}
                  onChange={(v) => setAnswer(q.key, v)}
                  error={errors[q.key]}
                />
              ))}
            </div>
          ) : null}

          {current.kind === "documents" ? (
            <DocUpload
              draftId={draftId}
              slots={shownSlots}
              files={files}
              onChange={(slotId, url) => {
                setFiles((prev) => ({ ...prev, [slotId]: url }));
                setDocErrors((prev) => prev.filter((id) => id !== slotId));
              }}
              missing={docErrors}
              idCard={idCard}
              onIdCard={(next) => {
                setIdCard(next);
                setIdCardError(null);
              }}
              idCardError={idCardError}
              typedNationalId={String(answers.national_id ?? "")}
            />
          ) : null}

          {current.kind === "review" ? (
            <ApplyReview
              questions={questions}
              answers={answers}
              docSlots={shownSlots}
              files={files}
              granted={granted}
              onEdit={goTo}
            />
          ) : null}

          {failure ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-box border border-alert/40 bg-alert/5 p-3 text-12-5 text-alert animate-nudge"
            >
              <TriangleAlert
                size={14}
                strokeWidth={1.9}
                aria-hidden
                className="mt-0.5 flex-none"
              />
              {failure}
            </p>
          ) : null}
        </div>
      </div>

      <ActionBar
        onBack={stage > 0 ? () => goTo(stage - 1) : null}
        onNext={current.kind === "review" ? submit : next}
        nextLabel={current.kind === "review" ? "ส่งใบสมัคร" : "ถัดไป"}
        busy={submitting}
        note={
          current.kind === "review"
            ? undefined
            : "บันทึกร่างอัตโนมัติ ปิดแล้วกลับมากรอกต่อได้"
        }
      />
    </div>
  );
}

/* ---------------------------------------------------------------- ส่งสำเร็จ */

/**
 * หน้าส่งสำเร็จ
 *
 * สามอย่างที่หน้านี้ต้องทำให้ได้ เรียงตามที่ผู้สมัครต้องการจริง:
 * **เลขอ้างอิงที่ก๊อปได้** (เขาจะส่งต่อให้คนที่บ้านหรือจดไว้) · **จะเกิดอะไรต่อ
 * และเมื่อไหร่** (ความเงียบหลังส่งใบสมัครคือสิ่งที่ทำให้คนโทรมาถาม) ·
 * **ทางกลับมาดูสถานะ**
 */
function Submitted({ refCode }: { refCode: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(refCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* เบราว์เซอร์บล็อกคลิปบอร์ด (http หรือไม่ได้กดจากท่าทางผู้ใช้) —
         เลขยังอยู่บนจอให้จดเองได้ ไม่ต้องขึ้น error ให้ตกใจ */
    }
  }

  return (
    <div className="recruit-canvas flex min-h-dvh flex-col">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-5 py-10">
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-primary text-primary-content animate-pop-in">
            <Check size={30} strokeWidth={2.6} aria-hidden />
          </span>

          <div className="flex flex-col gap-2 animate-lift-in">
            <h1 className="text-24 leading-snug font-semibold text-balance">
              ส่งใบสมัครเรียบร้อยแล้ว
            </h1>
            <p className="text-13-5 leading-relaxed text-mut text-pretty">
              เก็บเลขอ้างอิงนี้ไว้นะ ใช้ติดตามสถานะได้ตลอดโดยไม่ต้องสมัครสมาชิก
            </p>
          </div>
        </div>

        {/* เลขอ้างอิง — ตัวใหญ่ที่สุดในหน้า เพราะเป็นสิ่งเดียวที่ต้องจำออกจากหน้านี้ */}
        <div className="flex flex-col items-center gap-3 rounded-box border border-primary/30 bg-soft p-5">
          <span className="font-mono text-10-5 tracking-[0.16em] text-mut uppercase">
            เลขอ้างอิง
          </span>
          <span className="font-mono text-30 leading-none font-semibold tracking-[0.02em] text-primary">
            {refCode}
          </span>
          <button
            type="button"
            onClick={copy}
            className="flex items-center gap-1.5 rounded-field border border-primary/35 bg-base-100 px-3.5 py-2 text-12-5 font-medium text-primary transition-colors hover:bg-base-200 active:scale-[0.97]"
          >
            {copied ? (
              <Check size={13} strokeWidth={2.4} aria-hidden />
            ) : (
              <Copy size={13} strokeWidth={1.9} aria-hidden />
            )}
            {copied ? "คัดลอกแล้ว" : "คัดลอกเลข"}
          </button>
        </div>

        {/* จะเกิดอะไรต่อ — ตอบคำถามที่ทุกคนถามหลังกดส่ง ก่อนที่เขาจะต้องโทรมาถาม */}
        <div className="flex flex-col gap-3">
          <span className="font-mono text-10-5 tracking-[0.12em] text-mut uppercase">
            ขั้นต่อไป
          </span>
          {[
            {
              icon: Check,
              title: "เราได้รับใบสมัครแล้ว",
              detail: "ตอนนี้อยู่ในคิวรอฝ่ายบุคคลตรวจเอกสาร",
              done: true,
            },
            {
              icon: PhoneCall,
              title: "ฝ่ายบุคคลโทรกลับ",
              detail: "ภายใน 3 วันทำการ ตามเบอร์ที่คุณกรอกไว้",
              done: false,
            },
            {
              icon: UserCheck,
              title: "นัดสัมภาษณ์และทดสอบขับ",
              detail: "นัดวันกับคุณก่อนเสมอ ไม่ต้องเตรียมอะไรมาเพิ่ม",
              done: false,
            },
          ].map((step, i) => (
            <div
              key={step.title}
              style={{ animationDelay: `${i * 70}ms` }}
              className="flex items-start gap-3 rounded-box border border-line bg-base-100 p-3.5 animate-lift-in"
            >
              <span
                aria-hidden
                className={`flex size-9 flex-none items-center justify-center rounded-field ${
                  step.done ? "bg-primary text-primary-content" : "bg-base-200 text-mut"
                }`}
              >
                <step.icon size={16} strokeWidth={1.9} />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-13-5 font-medium">{step.title}</span>
                <span className="text-12 leading-relaxed text-mut">
                  {step.detail}
                </span>
              </span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
