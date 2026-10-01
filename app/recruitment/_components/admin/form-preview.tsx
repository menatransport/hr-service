"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  EyeOff,
  Monitor,
  RotateCcw,
  Smartphone,
} from "lucide-react";

import { ApplyReview } from "@/app/recruitment/_components/apply-review";
import { ConsentGate } from "@/app/recruitment/_components/consent-gate";
import { DocUpload } from "@/app/recruitment/_components/doc-upload";
import { QuestionField } from "@/app/recruitment/_components/question-field";
import { StageMascot } from "@/app/recruitment/_components/mascot";
import {
  APPLY_STAGES,
  TOTAL_STAGES,
  emptyAnswer,
  formDocSlots,
  isVisible,
  type DocSlot,
} from "@/app/recruitment/_lib/form";
import {
  QUESTION_SECTIONS,
  type AnswerMap,
  type AnswerValue,
  type Question,
  type SectionId,
} from "@/app/recruitment/_lib/types";

/**
 * พรีวิวฟอร์มสมัครทั้งเส้นทาง — สำหรับหน้าคลังคำถาม
 *
 * **ต่างจากพรีวิวเดิมสามเรื่อง** ซึ่งเป็นสามเรื่องที่ทำให้ของเดิมใช้ตรวจงานจริงไม่ได้:
 *
 * 1. **ดูได้ทุกขั้น ไม่ใช่แค่หมวดคำถาม** — รวมหน้ายินยอม หน้าเอกสาร และหน้าทบทวน
 *    หน้าทบทวนคือขั้นที่ผิดพลาดเงียบที่สุด เพราะข้อที่ถูกซ่อนด้วยเงื่อนไขจะหายไป
 *    จากสรุปด้วย ซึ่งเดิมมองไม่เห็นเลย
 * 2. **ข้ามขั้นได้อิสระ ไม่ติดการตรวจ** — ฟอร์มจริงบังคับกรอกให้ครบก่อนกดถัดไป
 *    คนตรวจงานไม่ได้มากรอกใบสมัคร เขามาดูว่าหน้าตาออกมาเป็นยังไง
 * 3. **เห็นข้อที่ซ่อนอยู่ได้** — ข้อที่ปิดใช้และข้อที่เงื่อนไขยังไม่เข้า จะโผล่มา
 *    พร้อมป้ายบอกเหตุผล ทำให้ตรวจได้ว่าข้อที่ตั้งเงื่อนไขไว้ “มีอยู่จริงไหม”
 *    โดยไม่ต้องไล่กดตอบให้ตรงเงื่อนไขก่อน
 *
 * ทุกขั้นเรนเดอร์ด้วยคอมโพเนนต์ตัวเดียวกับฟอร์มจริง (`QuestionField` · `ConsentGate`
 * · `DocUpload` · `ApplyReview`) — ไม่มีภาพจำลองสักชิ้น ถ้าพรีวิวถูก ของจริงก็ถูก
 *
 * ขั้นเอกสารถูกครอบด้วย `inert` เพราะ `DocUpload` อัปไฟล์ขึ้น S3 ทันทีที่เลือก
 * — คนตรวจงานกดเล่นแล้วจะมีไฟล์ขยะค้างบน bucket · ปุ่ม “จำลองว่าแนบครบ” ให้ผล
 * แบบเดียวกันโดยไม่แตะเครือข่าย
 */

/** ขั้นที่ 0 คือหน้ายินยอม ซึ่งอยู่นอก `APPLY_STAGES` (ฟอร์มจริงกั้นไว้ก่อนเข้าขั้น 1) */
const CONSENT_STAGE = -1;
const FIRST = CONSENT_STAGE;
const LAST = TOTAL_STAGES - 1;

type Device = "phone" 

const DEVICE_WIDTH: Record<Device, number> = { phone: 390 };

function stageLabel(index: number): string {
  if (index === CONSENT_STAGE) return "ความยินยอม";
  const stage = APPLY_STAGES[index];
  if (stage.kind === "documents") return "เอกสาร";
  if (stage.kind === "review") return "ทบทวน";
  return QUESTION_SECTIONS.find((s) => s.id === stage.section)?.title ?? stage.section;
}

/** ป้ายบอกว่าข้อนี้ทำไมถึงไม่โผล่ในฟอร์มจริง — `null` = โผล่ตามปกติ */
function hiddenReason(question: Question, answers: AnswerMap): string | null {
  if (!question.active) return "ปิดใช้อยู่";
  if (!isVisible(question, answers)) {
    return question.condition
      ? `รอคำตอบของ ${question.condition.key}`
      : "ถูกซ่อนไว้";
  }
  return null;
}

export function FormPreview({
  questions,
  docSlots,
}: {
  questions: Question[];
  docSlots: DocSlot[];
}) {
  const [stage, setStage] = useState<number>(CONSENT_STAGE);
  const [device, setDevice] = useState<Device>("phone");
  const [showHidden, setShowHidden] = useState(false);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [granted, setGranted] = useState<string[]>([]);
  const [docsFilled, setDocsFilled] = useState(false);

  /** ช่องที่ผู้สมัครเห็น — สลับสวิตช์ใน Section 4 แล้วพรีวิวเปลี่ยนตามทันที */
  const shownSlots = useMemo(() => formDocSlots(docSlots), [docSlots]);

  /** ไฟล์จำลองของขั้นทบทวน — ไม่เคยถูกส่งไปไหน เป็นแค่ค่าให้หน้าสรุปนับ */
  const files = useMemo<Record<string, string | null>>(
    () =>
      Object.fromEntries(
        shownSlots.map((slot) => [slot.id, docsFilled ? "preview://mock" : null]),
      ),
    [shownSlots, docsFilled],
  );

  function setAnswer(key: string, value: AnswerValue) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  function reset() {
    setAnswers({});
    setGranted([]);
    setDocsFilled(false);
    setStage(CONSENT_STAGE);
  }

  const current = stage === CONSENT_STAGE ? null : APPLY_STAGES[stage];
  const width = DEVICE_WIDTH[device];

  return (
    <div className="flex flex-col gap-3">
      {/* ───────────────────────────────────────────── แถบควบคุมพรีวิว */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-10-5 tracking-[0.1em] text-mut uppercase">
          พรีวิวฟอร์มจริง
        </span>

        <div className="ms-auto flex items-center gap-1">
          <Segment
            on={device === "phone"}
            onClick={() => setDevice("phone")}
            label="ดูแบบมือถือ"
          >
            <Smartphone size={13} strokeWidth={1.8} aria-hidden />
          </Segment>

          <button
            type="button"
            onClick={reset}
            title="ล้างคำตอบในพรีวิว"
            aria-label="ล้างคำตอบในพรีวิว"
            className="ms-1 flex size-7 items-center justify-center rounded-selector text-mut transition-colors hover:bg-base-200 hover:text-ink"
          >
            <RotateCcw size={13} strokeWidth={1.8} aria-hidden />
          </button>
        </div>
      </div>

      {/* ───────────────────────────────────── รางขั้น — กดข้ามได้ทุกขั้น */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar p-2.5">
        {[CONSENT_STAGE, ...APPLY_STAGES.map((_, i) => i)].map((index) => (
          <button
            key={index}
            type="button"
            onClick={() => setStage(index)}
            aria-current={stage === index ? "step" : undefined}
            className={`flex-none rounded-selector px-2.5 py-1 text-11-5 whitespace-nowrap transition-colors ${
              stage === index
                ? "bg-primary font-medium text-primary-content"
                : "bg-base-200 text-mut hover:text-ink"
            }`}
          >
            {stageLabel(index)}
          </button>
        ))}
      </div>

      {/* ────────────────────────────────────────────── ตัวเครื่องพรีวิว */}
      <div className="overflow-x-auto rounded-[22px] border border-line bg-base-100 p-2">
        <div
          style={{ width }}
          className="mx-auto flex max-h-[72vh] flex-col gap-5 overflow-y-auto rounded-[15px] bg-base-100 p-4"
        >
          {stage === CONSENT_STAGE ? (
            <ConsentGate
              granted={granted}
              onToggle={(id) =>
                setGranted((prev) =>
                  prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
                )
              }
              /* ในฟอร์มจริงปุ่มนี้พาเข้าขั้นแรก — พรีวิวก็ทำแบบเดียวกัน */
              onAccept={() => setStage(0)}
            />
          ) : null}

          {current ? (
            <>
              <StageProgress stage={stage} />

              {/* มาสคอตประจำขั้น — ฟอร์มจริงมี พรีวิวจึงต้องมีด้วย ไม่งั้นพรีวิว
                  จะเป็นคนละหน้าตากับของจริงทันที */}
              <div className="flex items-center gap-3">
                <h2 className="min-w-0 flex-1 text-21 leading-snug font-semibold text-balance">
                  {current.kind === "documents"
                    ? "ถ่ายรูปเอกสารประจำตัว"
                    : current.kind === "review"
                      ? "ตรวจอีกครั้งก่อนส่ง"
                      : (QUESTION_SECTIONS.find((s) => s.id === current.section)?.lead ??
                        "")}
                </h2>
                <StageMascot stage={current} />
              </div>

              {current.kind === "questions" ? (
                <QuestionStage
                  questions={questions}
                  section={current.section}
                  answers={answers}
                  onAnswer={setAnswer}
                  showHidden={showHidden}
                />
              ) : null}

              {current.kind === "documents" ? (
                <div className="flex flex-col gap-3">
                  <p className="text-13 leading-relaxed text-mut">
                    แตะแล้วเปิดกล้องได้เลย ไม่ต้องสแกน ระบบย่อไฟล์ให้เองก่อนส่ง
                  </p>
                  {/* `inert` กันการอัปโหลดจริงระหว่างพรีวิว แต่หน้าตายังตรงของจริงทุกจุด */}
                  <div inert>
                    <DocUpload
                      draftId=""
                      slots={shownSlots}
                      files={files}
                      onChange={() => {}}
                      missing={[]}
                    />
                  </div>
                </div>
              ) : null}

              {current.kind === "review" ? (
                <ApplyReview
                  questions={questions}
                  answers={answers}
                  docSlots={shownSlots}
                  files={files}
                  granted={granted}
                />
              ) : null}

              <span className="rounded-box bg-primary py-3 text-center text-13 font-semibold text-primary-content">
                {current.kind === "review" ? "ส่งใบสมัคร" : "ถัดไป"}
              </span>
            </>
          ) : null}
        </div>
      </div>

    </div>
  );
}

/* ------------------------------------------------------------- ขั้นคำถาม */

function QuestionStage({
  questions,
  section,
  answers,
  onAnswer,
  showHidden,
}: {
  questions: Question[];
  section: SectionId;
  answers: AnswerMap;
  onAnswer: (key: string, value: AnswerValue) => void;
  showHidden: boolean;
}) {
  const list = questions
    .filter((q) => q.section === section)
    .sort((a, b) => a.order - b.order)
    .map((q) => ({ question: q, hidden: hiddenReason(q, answers) }))
    .filter((row) => showHidden || !row.hidden);

  if (!list.length) {
    return (
      <p className="rounded-box border border-dashed border-line px-3.5 py-6 text-center text-12-5 text-mut">
        {showHidden
          ? "Section นี้ยังไม่มีคำถามเลย ผู้สมัครจะข้ามหน้าจอนี้ไป"
          : "Section นี้ไม่มีข้อที่แสดงตอนนี้ — เปิด “แสดงข้อที่ซ่อน” เพื่อดูว่ามีอะไรอยู่บ้าง"}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {list.map(({ question, hidden }) => (
        <div key={question.id} className={hidden ? "flex flex-col gap-1.5" : undefined}>
          {hidden ? (
            <span className="flex w-fit items-center gap-1 rounded-selector bg-st-wait px-1.5 py-0.5 font-mono text-10 font-medium text-st-wait-ink">
              <EyeOff size={10} strokeWidth={2} aria-hidden />
              {hidden} — ผู้สมัครไม่เห็นข้อนี้
            </span>
          ) : null}
          <div className={hidden ? "opacity-60" : undefined}>
            <QuestionField
              question={question}
              value={answers[question.key] ?? emptyAnswer(question.kind)}
              onChange={(v) => onAnswer(question.key, v)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ ส่วนประกอบเล็ก */

function StageProgress({ stage }: { stage: number }) {
  const pct = ((stage + 1) / TOTAL_STAGES) * 100;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between font-mono text-11 text-mut">
        <span>
          ขั้นที่ {stage + 1} จาก {TOTAL_STAGES}
        </span>
        <span>
          {TOTAL_STAGES - stage - 1 === 0
            ? "ใกล้เสร็จแล้ว"
            : `เหลืออีก ${TOTAL_STAGES - stage - 1} ขั้น`}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-line">
        <span
          className="block h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Segment({
  on,
  onClick,
  label,
  children,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={on}
      className={`flex size-7 items-center justify-center rounded-selector transition-colors ${
        on ? "bg-primary text-primary-content" : "text-mut hover:bg-base-200 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function TinyToggle({
  on,
  onClick,
  label,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={`rounded-selector border px-2 py-1 text-11 transition-colors ${
        on ? "border-primary/50 bg-soft text-primary" : "border-line text-mut hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}
