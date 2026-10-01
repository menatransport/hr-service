"use client";

import { CONSENT_ITEMS } from "@/app/recruitment/_lib/consent";
import {
  APPLY_STAGES,
  displayAnswer,
  formatPhone,
  visibleQuestions,
  type DocSlot,
} from "@/app/recruitment/_lib/form";
import {
  QUESTION_SECTIONS,
  type AnswerMap,
  type Question,
  type SectionId,
} from "@/app/recruitment/_lib/types";

/**
 * ขั้น “ตรวจอีกครั้งก่อนส่ง” ของฟอร์มสมัคร
 *
 * **แยกออกมาจาก `apply-flow.tsx` เพื่อให้จอพรีวิวในหน้าแอดมินเรนเดอร์ตัวเดียวกัน**
 * — ก่อนหน้านี้พรีวิวดูได้แค่หมวดคำถาม ขั้นทบทวนซึ่งเป็นขั้นที่ผิดพลาดง่ายที่สุด
 * (คำถามที่ถูกซ่อนด้วยเงื่อนไขจะไม่โผล่ที่นี่ด้วย) กลับเป็นขั้นเดียวที่มองไม่เห็น
 *
 * ถ้าจะก๊อปโครงนี้ไปวาดใหม่ที่อื่น อย่าทำ — ให้ import ตัวนี้ไป ไม่งั้นสองที่จะ
 * เพี้ยนจากกันทันทีที่มีใครแก้ข้างใดข้างหนึ่ง
 */
export function ApplyReview({
  questions,
  answers,
  docSlots,
  files,
  granted,
  onEdit,
}: {
  questions: Question[];
  answers: AnswerMap;
  /** เฉพาะช่องที่ผู้สมัครเห็น (`formDocSlots`) */
  docSlots: DocSlot[];
  files: Record<string, string | null>;
  granted: string[];
  /** ไม่ส่งมา = ไม่มีปุ่ม “แก้ไข” (จอพรีวิวไม่ต้องการปุ่มนั้น) */
  onEdit?: (stage: number) => void;
}) {
  const stageOf = (section: SectionId) =>
    APPLY_STAGES.findIndex((s) => s.kind === "questions" && s.section === section);

  const attached = docSlots.filter((slot) => files[slot.id]);
  const pending = docSlots.filter((slot) => !files[slot.id]);

  return (
    <div className="flex flex-col gap-5">
      {QUESTION_SECTIONS.map((section) => {
        const list = visibleQuestions(questions, section.id, answers);
        if (!list.length) return null;

        return (
          <section key={section.id} className="flex flex-col gap-1">
            <ReviewHead
              title={section.title}
              onEdit={onEdit ? () => onEdit(stageOf(section.id)) : undefined}
            />
            {list.map((q) => (
              <ReviewRow
                key={q.key}
                term={q.label}
                value={
                  q.kind === "tel"
                    ? formatPhone(String(answers[q.key] ?? ""))
                    : displayAnswer(answers[q.key], q.options)
                }
              />
            ))}
          </section>
        );
      })}

      {docSlots.length ? (
        <section className="flex flex-col gap-1">
          <ReviewHead
            title="เอกสาร"
            onEdit={
              onEdit
                ? () => onEdit(APPLY_STAGES.findIndex((s) => s.kind === "documents"))
                : undefined
            }
          />
          <ReviewRow
            term="แนบแล้ว"
            value={`${attached.length} จาก ${docSlots.length} รายการ`}
          />
          {pending.length ? (
            <ReviewRow
              term="ยังไม่ได้แนบ"
              value={pending.map((p) => p.label).join(", ")}
              muted
            />
          ) : null}
        </section>
      ) : null}

      <section className="flex flex-col gap-1">
        <ReviewHead title="ความยินยอม" />
        {CONSENT_ITEMS.map((item) => (
          <ReviewRow
            key={item.id}
            term={item.title}
            value={granted.includes(item.id) ? "ยินยอม" : "ไม่ยินยอม"}
            muted={!granted.includes(item.id)}
          />
        ))}
      </section>
    </div>
  );
}

function ReviewHead({ title, onEdit }: { title: string; onEdit?: () => void }) {
  return (
    <div className="mb-1 flex items-baseline justify-between gap-3 border-b border-line pb-1.5">
      <span className="font-mono text-10-5 font-semibold tracking-[0.1em] text-mut uppercase">
        {title}
      </span>
      {onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          className="text-12 text-primary hover:underline"
        >
          แก้ไข
        </button>
      ) : null}
    </div>
  );
}

function ReviewRow({
  term,
  value,
  muted,
}: {
  term: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 py-0.5 text-12-5">
      <span className="min-w-0 text-mut">{term}</span>
      <span className={`min-w-0 text-right ${muted ? "text-mut" : "text-ink"}`}>
        {value}
      </span>
    </div>
  );
}
