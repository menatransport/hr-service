"use client";

import { useMemo, useState } from "react";

import { DocSlotManager } from "@/app/recruitment/_components/admin/doc-slot-manager";
import { FormPreview } from "@/app/recruitment/_components/admin/form-preview";
import { QuestionManager } from "@/app/recruitment/_components/question-manager";
import { CircleAlert, ShieldCheck, TriangleAlert } from "lucide-react";

import type { DocSlot } from "@/app/recruitment/_lib/form";
import { checkForm, type FormIssue } from "@/app/recruitment/_lib/form-health";
import type { Question } from "@/app/recruitment/_lib/types";

/**
 * หน้าคลังคำถาม — รายการทางซ้าย พรีวิวทางขวา ผลตรวจอยู่บนสุด
 *
 * ทั้งสามฝั่งอ่าน `questions` ก้อนเดียวกัน แก้ที่ไหนก็เห็นผลอีกสองที่ทันทีโดยไม่ต้อง
 * โหลดหน้าใหม่ — ซึ่งเป็นเหตุผลที่ state อยู่ที่นี่ไม่ใช่ในลูกแต่ละตัว
 *
 * พรีวิวเป็น `sticky` และอยู่ได้ทุกสถานะ ไม่ต้องกดหมวดไหนก่อนถึงจะดูได้
 * (ของเดิมพรีวิวเปลี่ยนตามหมวดที่กดเท่านั้น และดูขั้นเอกสารกับขั้นทบทวนไม่ได้เลย)
 *
 * จอแคบกว่า `xl` พรีวิวย้ายลงไปอยู่ใต้รายการแทนการหายไป — คนที่แก้คำถามจากมือถือ
 * ยังต้องเห็นผลของสิ่งที่เพิ่งแก้เหมือนกัน
 */
/**
 * แผงตรวจฟอร์ม — รายการปัญหาที่หน้าจอบันทึกบอกไม่ได้
 *
 * ทุกข้อในนี้คือปัญหาที่ **บันทึกผ่านฉลุยแต่พังตอนผู้สมัครกรอกจริง** เช่นคำถาม
 * ที่ตั้งเงื่อนไขชี้ไปข้อที่อยู่หลังตัวเอง ซึ่งไม่มีวันโผล่ให้ใครเห็นสักครั้ง
 * (ดูรายการตรวจทั้งหมดที่ `lib/recruitment/form-health.ts`)
 *
 * ขึ้นเป็นแถบเขียวเมื่อไม่มีปัญหา **ไม่ใช่หายไปเฉย ๆ** — “ไม่เห็นแผง” กับ
 * “ตรวจแล้วผ่าน” ต้องแยกออกจากกันได้ ไม่งั้นคนจะไม่รู้ว่าระบบตรวจให้อยู่หรือเปล่า
 */
function FormHealthPanel({
  issues,
  onFocus,
}: {
  issues: FormIssue[];
  /** กดที่ปัญหาแล้วเลื่อนไปหาแถวคำถามนั้น */
  onFocus: (questionId: string) => void;
}) {
  const errors = issues.filter((i) => i.level === "error");
  const warns = issues.filter((i) => i.level === "warn");

  if (!issues.length) {
    return (
      <div className="flex items-center gap-2.5 rounded-box border border-primary/30 bg-soft px-3.5 py-2.5">
        <ShieldCheck size={15} strokeWidth={1.8} aria-hidden className="flex-none text-primary" />
        <span className="text-12-5 text-primary">
          ตรวจฟอร์มแล้ว ไม่พบปัญหา — ทุกข้อมีทางแสดงให้ผู้สมัครเห็นได้จริง
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-box border border-line bg-base-100 p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-13 font-semibold">ผลตรวจฟอร์ม</span>
        <span className="flex items-center gap-1.5">
          {errors.length ? (
            <span className="rounded-selector bg-alert/10 px-1.5 py-0.5 font-mono text-10-5 font-semibold text-alert">
              ต้องแก้ {errors.length}
            </span>
          ) : null}
          {warns.length ? (
            <span className="rounded-selector bg-st-wait px-1.5 py-0.5 font-mono text-10-5 font-semibold text-st-wait-ink">
              ควรดู {warns.length}
            </span>
          ) : null}
        </span>
      </div>

      <ul className="flex flex-col gap-1.5">
        {issues.map((issue, i) => {
          const Icon = issue.level === "error" ? CircleAlert : TriangleAlert;
          const tone =
            issue.level === "error" ? "text-alert" : "text-st-wait-ink";

          const body = (
            <>
              <Icon
                size={13}
                strokeWidth={1.9}
                aria-hidden
                className={`mt-0.5 flex-none ${tone}`}
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-12-5 font-medium">{issue.title}</span>
                <span className="text-11-5 leading-relaxed text-mut text-pretty">
                  {issue.detail}
                </span>
              </span>
            </>
          );

          return (
            <li key={`${issue.title}-${i}`}>
              {issue.questionId ? (
                <button
                  type="button"
                  onClick={() => onFocus(issue.questionId as string)}
                  className="flex w-full items-start gap-2 rounded-field px-2 py-1.5 text-left transition-colors hover:bg-base-200"
                >
                  {body}
                </button>
              ) : (
                <span className="flex items-start gap-2 px-2 py-1.5">{body}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function QuestionsView({
  initialQuestions,
  initialDocSlots,
}: {
  initialQuestions: Question[];
  initialDocSlots: DocSlot[];
}) {
  const [questions, setQuestions] = useState(initialQuestions);
  const [docSlots, setDocSlots] = useState(initialDocSlots);

  const issues = useMemo(() => checkForm(questions), [questions]);

  /** เลื่อนไปหาแถวคำถามที่มีปัญหา เมื่อกดจากแผงผลตรวจ */
  function focusQuestion(id: string) {
    const row = document.getElementById(`q-${id}`);
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="flex flex-col gap-4">
      <FormHealthPanel issues={issues} onFocus={focusQuestion} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex flex-col gap-6">
          <QuestionManager
            questions={questions}
            onChange={setQuestions}
            issues={issues}
          />
          <DocSlotManager slots={docSlots} onChange={setDocSlots} />
        </div>

        <aside>
          <div className="xl:sticky xl:top-4">
            <FormPreview questions={questions} docSlots={docSlots} />
          </div>
        </aside>
      </div>
    </div>
  );
}
