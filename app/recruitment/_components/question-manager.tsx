"use client";

import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CircleAlert,
  GripVertical,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import { QuestionEditor } from "@/app/recruitment/_components/question-editor";
import { requestJson } from "@/lib/http";
import { alertError, confirm, toastSuccess } from "@/lib/swal";
import { LOCKED_KEYS } from "@/app/recruitment/_lib/form";
import type { FormIssue } from "@/app/recruitment/_lib/form-health";
import {
  QUESTION_SECTIONS,
  type Question,
  type SectionId,
} from "@/app/recruitment/_lib/types";

/**
 * รายการคำถามของหน้า `/recruitment/admin/questions`
 *
 * จัดลำดับด้วยการลากวาง (`@dnd-kit`) แทนปุ่มขึ้น/ลง — ใช้ `TouchSensor` ควบคู่กับ
 * `PointerSensor` และตั้ง `activationConstraint` (delay/tolerance) ไว้ เพื่อให้จอ
 * สัมผัสแยกออกจากกันชัดเจนระหว่าง "ลากจัดลำดับ" กับ "เลื่อนหน้าจอ" ปกติ
 *
 * ทุกการเปลี่ยนแปลงยิง API แล้วรับผลกลับมาใช้เป็นค่าจริง ไม่เดาผลเอง —
 * ลำดับที่เซิร์ฟเวอร์เขียนจริงกับที่หน้าจอแสดงจึงไม่มีทางเพี้ยนจากกัน
 *
 * แถวที่มีปัญหาจากการตรวจฟอร์ม (`issues`) ขึ้นขอบสีและป้ายเหตุผลที่แถวนั้นเลย
 * ไม่ใช่แค่ในแผงด้านบน — คนที่กำลังไล่แก้ทีละข้อจะได้ไม่ต้องเลื่อนขึ้นลงเทียบเอง
 *
 * **ท้ายแถวมีสองปุ่มเท่านั้น: แก้ไข กับ ลบ** · “ทำสำเนา” และ “เปิด/ปิดใช้” ถูกถอด
 * ออกตามที่ขอ — ป้าย “ปิดใช้” ยังแสดงอยู่ เพราะข้อที่ถูกปิดไว้ก่อนหน้านี้ยังมีจริง
 * ในฐานข้อมูล แค่ไม่มีปุ่มให้สลับจากหน้านี้แล้ว
 */

export function QuestionManager({
  questions,
  onChange,
  issues,
}: {
  questions: Question[];
  onChange: (next: Question[]) => void;
  issues: FormIssue[];
}) {
  const [editing, setEditing] = useState<Question | "new" | null>(null);
  const [newSection, setNewSection] = useState<SectionId>("identity");
  const [busy, setBusy] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
  );

  /** ปัญหาที่ผูกกับคำถามข้อหนึ่ง — เอาไปขึ้นป้ายที่แถวนั้น */
  const issueBy = new Map<string, FormIssue>();
  for (const issue of issues) {
    if (issue.questionId && !issueBy.has(issue.questionId)) {
      issueBy.set(issue.questionId, issue);
    }
  }

  async function reorder(section: SectionId, ids: string[]) {
    setBusy(`order-${section}`);
    try {
      onChange(
        await requestJson<Question[]>(
          "/api/recruitment/questions/reorder",
          { method: "POST", body: { ids } },
          "จัดลำดับไม่สำเร็จ",
        ),
      );
    } catch (err) {
      alertError("จัดลำดับไม่สำเร็จ", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  function handleDragEnd(section: SectionId, event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const list = ordered(questions, section);
    const ids = list.map((q) => q.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;

    ids.splice(to, 0, ids.splice(from, 1)[0]);
    reorder(section, ids);
  }

  async function remove(question: Question) {
    const agreed = await confirm({
      title: `ลบคำถาม “${question.label}”`,
      text: "คำตอบเก่ายังอ่านได้ตามปกติเพราะแต่ละใบเก็บสำเนาคำถามของตัวเองไว้ แต่คำถามนี้จะหายจากฟอร์มทันทีและเอากลับมาไม่ได้",
      confirmText: "ลบออกจากคลัง",
      tone: "danger",
    });
    if (!agreed) return;

    setBusy(question.id);
    try {
      await requestJson(
        `/api/recruitment/questions/${question.id}`,
        { method: "DELETE" },
        "ลบคำถามไม่สำเร็จ",
      );
      onChange(questions.filter((q) => q.id !== question.id));
      toastSuccess("ลบคำถามแล้ว");
    } catch (err) {
      alertError("ลบคำถามไม่สำเร็จ", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {QUESTION_SECTIONS.map((section, sectionIndex) => {
        const list = ordered(questions, section.id);
        const live = list.filter((q) => q.active).length;

        return (
          <section key={section.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="font-mono text-10-5 font-semibold text-mut">
                  Section {sectionIndex + 1}
                </span>
                <span className="text-13-5 font-semibold">{section.title}</span>
                <span className="font-mono text-11 text-mut tabular-nums">
                  {live} ข้อ
                  {list.length > live ? ` · ปิดใช้ ${list.length - live}` : ""}
                </span>
              </span>

              <button
                type="button"
                onClick={() => {
                  setNewSection(section.id);
                  setEditing("new");
                }}
                className="flex items-center gap-1 rounded-field border border-dashed border-line px-2.5 py-1 text-12 text-mut transition-colors hover:border-primary/50 hover:text-primary"
              >
                <Plus size={12} strokeWidth={2} aria-hidden />
                เพิ่มคำถาม
              </button>
            </div>

            {list.length === 0 ? (
              <p className="rounded-box border border-dashed border-line px-3.5 py-4 text-12-5 text-mut">
                Section นี้ยังไม่มีคำถาม — ผู้สมัครจะข้ามหน้าจอนี้ไปเลย
              </p>
            ) : null}

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(event) => handleDragEnd(section.id, event)}
            >
              <SortableContext
                items={list.map((q) => q.id)}
                strategy={verticalListSortingStrategy}
              >
                {list.map((question) => {
                  const locked = LOCKED_KEYS.includes(question.key);
                  const working =
                    busy === question.id || busy === `order-${section.id}`;
                  const issue = issueBy.get(question.id);
                  const broken = issue?.level === "error";

                  return (
                    <SortableRow
                      key={question.id}
                      id={question.id}
                      anchorId={`q-${question.id}`}
                      className={`flex scroll-mt-20 flex-col gap-1.5 rounded-box border bg-base-100 px-2.5 py-2 transition-colors ${
                        broken ? "border-alert/45" : "border-line"
                      } ${question.active ? "" : "opacity-60"}`}
                    >
                      {({ dragHandleRef, dragHandleProps }) => (
                        <>
                          <div className="flex items-center gap-2.5">
                            <button
                              type="button"
                              aria-label="ลากเพื่อจัดลำดับ"
                              title="ลากเพื่อจัดลำดับ"
                              disabled={working}
                              ref={dragHandleRef}
                              className="flex size-7 flex-none touch-none items-center justify-center rounded-selector text-mut transition-colors hover:bg-base-200 hover:text-ink disabled:opacity-25"
                              {...dragHandleProps}
                            >
                              <GripVertical size={14} strokeWidth={1.8} aria-hidden />
                            </button>

                            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className="flex flex-wrap items-center gap-1.5 text-13 font-medium">
                                {question.label}
                                {locked ? (
                                  <Lock
                                    size={11}
                                    strokeWidth={2}
                                    aria-hidden
                                    className="text-mut"
                                  />
                                ) : null}
                                {question.sensitive ? (
                                  <span className="rounded-selector bg-st-wait px-1.5 py-px font-mono text-9-5 font-semibold text-st-wait-ink">
                                    อ่อนไหว
                                  </span>
                                ) : null}
                                {question.active ? null : (
                                  <span className="rounded-selector bg-base-200 px-1.5 py-px font-mono text-9-5 text-mut">
                                    ปิดใช้
                                  </span>
                                )}
                              </span>
                              <span className="truncate font-mono text-10-5 text-mut">
                                {question.key} · {KIND_LABEL[question.kind] ?? question.kind}
                                {question.required ? " · บังคับ" : " · ไม่บังคับ"}
                                {question.options.length
                                  ? ` · ${question.options.length} ตัวเลือก`
                                  : ""}
                                {question.condition
                                  ? ` · แสดงเมื่อ ${question.condition.key} = ${question.condition.equals.join("/")}`
                                  : ""}
                              </span>
                            </div>

                            {working ? (
                              <Loader2
                                size={14}
                                strokeWidth={2}
                                aria-hidden
                                className="flex-none animate-spin text-mut"
                              />
                            ) : null}

                            {/* สองปุ่มเท่านั้น — แก้ไขกับลบ · ทำสำเนา/ปิดใช้ถูกถอดออกไปแล้ว */}
                            <div className="flex flex-none items-center gap-0.5">
                              <IconButton label="แก้ไข" onClick={() => setEditing(question)}>
                                <Pencil size={14} strokeWidth={1.8} aria-hidden />
                              </IconButton>
                              <IconButton
                                label="ลบ"
                                danger
                                disabled={locked || working}
                                onClick={() => remove(question)}
                              >
                                <Trash2 size={14} strokeWidth={1.8} aria-hidden />
                              </IconButton>
                            </div>
                          </div>

                          {issue ? (
                            <span
                              className={`flex items-start gap-1.5 rounded-field px-2 py-1 text-11-5 leading-relaxed ${
                                broken
                                  ? "bg-alert/8 text-alert"
                                  : "bg-st-wait text-st-wait-ink"
                              }`}
                            >
                              <CircleAlert
                                size={12}
                                strokeWidth={2}
                                aria-hidden
                                className="mt-0.5 flex-none"
                              />
                              {issue.detail}
                            </span>
                          ) : null}
                        </>
                      )}
                    </SortableRow>
                  );
                })}
              </SortableContext>
            </DndContext>
          </section>
        );
      })}

      {editing ? (
        <QuestionEditor
          question={editing === "new" ? null : editing}
          initialSection={editing === "new" ? newSection : editing.section}
          questions={questions}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            onChange(
              questions.some((q) => q.id === saved.id)
                ? questions.map((q) => (q.id === saved.id ? saved : q))
                : [...questions, saved],
            );
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------- ของใช้ */

const KIND_LABEL: Record<string, string> = {
  text: "ข้อความสั้น",
  textarea: "ข้อความยาว",
  tel: "เบอร์โทร",
  nid: "เลขบัตร",
  number: "ตัวเลข",
  date: "วันที่",
  single: "เลือกข้อเดียว",
  multi: "เลือกหลายข้อ",
};

/**
 * คำถามในหมวดหนึ่ง เรียงตาม `order` จริงเสมอ
 *
 * **เรียงเองที่นี่ ไม่พึ่งลำดับของอาร์เรย์** — ข้อที่เพิ่งสร้างถูกต่อท้ายอาร์เรย์
 * ด้วย `[...questions, saved]` ซึ่งไม่ใช่ตำแหน่งจริงถ้ามันไปอยู่หมวดแรก
 * `handleDragEnd` ที่อ่านลำดับผิดจะคำนวณตำแหน่งวางผิดทันที
 */
function ordered(questions: Question[], section: SectionId): Question[] {
  return questions
    .filter((q) => q.section === section)
    .sort((a, b) => a.order - b.order);
}

export function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`flex size-7 items-center justify-center rounded-selector text-mut transition-colors disabled:opacity-25 ${
        danger ? "hover:bg-alert/10 hover:text-alert" : "hover:bg-base-200 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * กล่องคำถามหนึ่งแถวที่ลากจัดลำดับได้ — ห่อ `useSortable` ไว้ที่นี่ที่เดียว
 * ตัวแถวเองส่ง `dragHandleRef`/`dragHandleProps` ออกไปให้ปุ่มจับลาก ส่วน
 * `id` (ของ dnd-kit) กับ `anchorId` (ของลิงก์เลื่อนไปหาแถวจากแผงตรวจฟอร์ม)
 * แยกกันเพราะคนละจุดประสงค์
 */
export function SortableRow({
  id,
  anchorId,
  className,
  children,
}: {
  id: string;
  anchorId?: string;
  className: string;
  children: (args: {
    dragHandleRef: (node: HTMLElement | null) => void;
    dragHandleProps: React.HTMLAttributes<HTMLElement>;
  }) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      id={anchorId}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`${className} ${isDragging ? "z-10 shadow-lg" : ""}`}
    >
      {children({
        dragHandleRef: setActivatorNodeRef,
        dragHandleProps: {
          ...attributes,
          ...listeners,
        } as React.HTMLAttributes<HTMLElement>,
      })}
    </div>
  );
}
