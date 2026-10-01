"use client";

import { useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";

import { QuestionField } from "@/app/recruitment/_components/question-field";
import { ModalShell } from "@/components/ui/modal-shell";
import { isBlank, validateAnswer } from "@/app/recruitment/_lib/form";
import {
  QUESTION_SECTIONS,
  type AnswerMap,
  type AnswerValue,
  type Application,
} from "@/app/recruitment/_lib/types";

/**
 * กล่องแก้คำตอบในใบสมัคร — **ซ้อนอยู่บนรายงาน** เปิดจากปุ่มท้ายใบ
 *
 * แก้แทนผู้สมัครได้เพราะเรื่องนี้เกิดขึ้นจริงทุกวัน: โทรไปแล้วรู้ว่าเบอร์พิมพ์ผิด
 * หนึ่งหลัก หรือวันเกิดสลับวันกับเดือน — เดิมทางเดียวคือให้กรอกใบใหม่ทั้งใบ
 * ซึ่งทำให้เลขอ้างอิงเปลี่ยนและไทม์ไลน์ที่โทรตามไว้แล้วขาดตอน
 *
 * **ช่องกรอกเป็น `QuestionField` ตัวเดียวกับฟอร์มที่ผู้สมัครกรอก** ไม่ได้วาดใหม่ —
 * ฝ่ายบุคคลจึงเห็นหน้าตาเดียวกับที่ผู้สมัครเห็นตอนกรอก และไม่มีทางที่สองที่
 * ช่องจะเพี้ยนจากกัน · คำถามอ่านจาก **สำเนาในใบนั้น** ไม่ใช่คลังคำถามปัจจุบัน
 * ใบเก่าจึงยังแก้ได้แม้คำถามจะถูกเพิ่มหรือถอดไปแล้ว
 *
 * ส่งเฉพาะข้อที่เปลี่ยนจริงเป็น PATCH ครั้งเดียว และเซิร์ฟเวอร์ลงไทม์ไลน์ให้เอง
 * ว่าใครแก้ข้อไหน — ใบสมัครเป็นเอกสารที่ใช้ตัดสินใจจ้างคน การแก้ที่ไม่มีใครรู้ว่า
 * เกิดขึ้นคือการแก้ที่ตรวจสอบไม่ได้
 *
 * ข้อความผิดพลาดขึ้นเป็นแถบในกล่องนี้เอง ไม่ใช่ `alertError` — SweetAlert จะเด้ง
 * ทับกล่องซ้อนอีกชั้นจนไม่เหลือทางกลับไปแก้ค่าที่กรอกค้างไว้
 */

/** ค่าที่หายไปทั้งที่เคยมี = ข้อมูลหาย ไม่ใช่การแก้ไข — กฎเดียวกับฝั่งเซิร์ฟเวอร์ */
const wasFilled = (answers: AnswerMap, key: string) => !isBlank(answers[key] ?? "");

const same = (a: AnswerValue | undefined, b: AnswerValue | undefined) =>
  JSON.stringify(a ?? "") === JSON.stringify(b ?? "");

export function CandidateEditModal({
  application,
  onPatch,
  onClose,
}: {
  application: Application;
  onPatch: (patch: { answers: AnswerMap }) => Promise<void>;
  onClose: () => void;
}) {
  const snapshot = application.questionSnapshot;
  const [draft, setDraft] = useState<AnswerMap>(() => ({ ...application.answers }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");

  function set(key: string, value: AnswerValue) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    /* ข้อที่เพิ่งถูกแก้ทิ้ง error เก่าไปก่อน — ข้อความที่ยังค้างอยู่ทั้งที่คนกำลัง
       พิมพ์แก้อยู่ตรงนั้นคือข้อความที่บอกเรื่องที่ไม่จริงแล้ว */
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function save() {
    const changed: AnswerMap = {};
    const found: Record<string, string> = {};

    for (const question of snapshot) {
      const value = draft[question.key];
      if (same(value, application.answers[question.key])) continue;

      const message = validateAnswer(
        {
          kind: question.kind,
          required: wasFilled(application.answers, question.key),
        },
        value,
      );
      if (message) found[question.key] = message;
      else changed[question.key] = value ?? "";
    }

    if (Object.keys(found).length) {
      setErrors(found);
      setFailure("ยังมีข้อที่กรอกไม่ถูกต้อง — ดูข้อความใต้ช่องที่ขอบแดง");
      return;
    }

    if (!Object.keys(changed).length) {
      onClose();
      return;
    }

    setSaving(true);
    setFailure("");
    try {
      await onPatch({ answers: changed });
      onClose();
    } catch (err) {
      setFailure(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
      setSaving(false);
    }
  }

  const dirty = snapshot.some(
    (q) => !same(draft[q.key], application.answers[q.key]),
  );

  return (
    <ModalShell
      title="แก้ไขข้อมูลในใบสมัคร"
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <span>{application.fullName}</span>
          <span className="font-mono text-11-5 tracking-wider text-primary">
            {application.ref}
          </span>
        </span>
      }
      onClose={onClose}
      width="720px"
      tone="plain"
      footer={
        <>
          <span className="mr-auto text-12 text-mut">
            การแก้ไขจะถูกบันทึกลงประวัติพร้อมชื่อผู้แก้และเวลา
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-field border border-line px-3.5 py-2.5 text-13 transition-colors hover:border-primary/40 disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="flex items-center gap-2 rounded-field bg-primary px-4 py-2.5 text-13 font-medium text-primary-content transition-opacity hover:opacity-90 disabled:opacity-45"
          >
            {saving ? (
              <Loader2 size={14} strokeWidth={2} aria-hidden className="animate-spin" />
            ) : null}
            บันทึกการแก้ไข
          </button>
        </>
      }
    >
      {failure ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-field bg-alert/10 px-3 py-2.5 text-12-5 text-alert"
        >
          <TriangleAlert
            size={14}
            strokeWidth={2}
            aria-hidden
            className="mt-0.5 flex-none"
          />
          {failure}
        </p>
      ) : null}

      <fieldset disabled={saving} className="flex flex-col gap-6">
        {QUESTION_SECTIONS.map((section) => {
          const list = snapshot.filter((q) => q.section === section.id);
          if (!list.length) return null;

          return (
            <div key={section.id} className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2.5">
                <span className="text-12-5 font-semibold tracking-[0.04em]">
                  {section.title}
                </span>
                <span aria-hidden className="h-px flex-1 bg-line" />
              </div>

              <div className="flex flex-col gap-2.5">
                {list.map((question) => (
                  <QuestionField
                    key={question.key}
                    question={{
                      ...question,
                      /* สำเนาในใบไม่ได้เก็บว่าข้อไหนบังคับกรอก — ใช้ค่าที่มีอยู่จริง
                         แทน: ข้อที่ผู้สมัครเคยตอบไว้ต้องไม่ถูกลบจนว่าง */
                      required: wasFilled(application.answers, question.key),
                    }}
                    value={draft[question.key]}
                    onChange={(v) => set(question.key, v)}
                    error={errors[question.key]}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </fieldset>
    </ModalShell>
  );
}
