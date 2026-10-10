"use client";

import { useState } from "react";
import { Eye, Loader2, Plus, X } from "lucide-react";

import { QuestionField } from "@/app/recruitment/_components/question-field";
import {
  CheckboxGroupField,
  SelectField,
  TextField,
} from "@/components/ui/field";
import { ModalShell } from "@/components/ui/modal-shell";
import { requestJson } from "@/lib/http";
import { alertError, toastSuccess } from "@/lib/swal";
import { LOCKED_KEYS } from "@/app/recruitment/_lib/form";
import {
  QUESTION_SECTIONS,
  type AnswerValue,
  type Question,
  type QuestionKind,
  type QuestionOption,
  type SectionId,
} from "@/app/recruitment/_lib/types";

/**
 * กล่องเพิ่ม/แก้คำถามหนึ่งข้อ
 *
 * **ค่าของตัวเลือก (`value`) ถูกล็อกหลังบันทึกครั้งแรก** — คำตอบที่บันทึกไปแล้ว
 * เก็บค่านี้ไว้ตรง ๆ การแก้ค่าเท่ากับทำให้คำตอบเก่าชี้ไปยังตัวเลือกที่ไม่มีอยู่
 * ส่วน**ป้าย (`label`) แก้ได้เสมอ** เพราะคำตอบเก่าอ่านป้ายจากสำเนาของตัวเอง
 * เหตุผลเดียวกันนี้ทำให้ `key` ของคำถามแก้ไม่ได้หลังสร้าง — ตอนสร้างใหม่ตั้งเองได้
 * (ช่อง “กุญแจคำถาม”) แต่เว้นว่างไว้ก็ได้ เซิร์ฟเวอร์จะสุ่มให้เหมือนเดิม
 *
 * พรีวิวเรนเดอร์ด้วย `QuestionField` ตัวเดียวกับฟอร์มจริง ไม่ใช่ภาพจำลอง —
 * เห็นตรง ๆ ว่าผู้สมัครจะเจอหน้าตาแบบไหน · **อยู่หลังปุ่ม “ดูพรีวิว” ไม่ใช่ต่อท้าย
 * ฟอร์ม** เพราะกล่องนี้มีช่องกรอกยาวอยู่แล้ว พรีวิวที่แปะไว้ท้ายสุดต้องเลื่อนลงไป
 * หาทุกครั้งและกินพื้นที่ของคนที่กำลังพิมพ์อยู่ · กดแล้วเปิดเป็นกล่องซ้อนขึ้นมา
 * ให้ลองกดเล่นได้จริง (คำตอบในพรีวิวไม่ถูกบันทึกที่ไหน)
 */

/** ป้ายไทยของทุกชนิด รวมชนิดที่ไม่ได้เปิดให้เลือกแล้ว — ใช้ตอนต้องแสดงของเดิม */
const KIND_LABEL: Record<QuestionKind, string> = {
  text: "ข้อความสั้น",
  textarea: "ข้อความยาว",
  tel: "เบอร์โทร",
  nid: "เลขบัตรประชาชน",
  number: "ตัวเลข",
  date: "วันที่",
  single: "เลือกตอบข้อเดียว",
  multi: "เลือกตอบหลายข้อ",
};

/**
 * ชนิดที่เปิดให้ตั้งได้ — **ไม่มี `tel` กับ `nid`**
 *
 * สองตัวนั้นไม่ใช่ “ชนิดของคำตอบ” จริง ๆ แต่เป็นข้อความที่มีกติกาตรวจเฉพาะทาง
 * ของมันเอง (เบอร์สิบหลัก · เลขบัตรที่ตรวจหลักสุดท้าย) ซึ่งใช้กับคำถามหลักของ
 * ระบบสองข้อเท่านั้นและไม่มีข้อใหม่ข้อไหนควรเป็น — วางปนในรายการมีแต่ทำให้คน
 * เลือกลังเลว่าต่างจาก “ข้อความสั้น” กับ “ตัวเลข” ตรงไหน
 *
 * ตัวเรนเดอร์ยังรองรับทั้งสองชนิดเต็มที่ · ข้อเดิมที่เป็น `tel`/`nid` ยังทำงาน
 * เหมือนเดิมทุกอย่าง และตอนเปิดแก้จะเห็นชนิดของตัวเองอยู่ในรายการ (ดู `kindOptions`)
 */
const KIND_CHOICES: QuestionKind[] = [
  "text",
  "textarea",
  "number",
  "date",
  "single",
  "multi",
];

const NEEDS_OPTIONS: QuestionKind[] = ["single", "multi"];

/** ตรงกับ `KEY_PATTERN` ใน `lib/recruitment/questions.ts` — เตือนไว้ก่อนกดบันทึกจะได้ไม่ต้องยิง API แล้วเด้ง error กลับมา */
const KEY_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;

/** ค่าใหม่ที่ยังไม่เคยมีใครตอบ — ตั้งเป็นเลขเรียงในคำถามนั้นก็พอ ไม่ต้องสื่อความหมาย */
function nextOptionValue(existing: QuestionOption[]): string {
  let n = existing.length + 1;
  while (existing.some((o) => o.value === `o${n}`)) n += 1;
  return `o${n}`;
}

/**
 * ลำดับของคำถามในฟอร์มจริง — หมวดตาม `QUESTION_SECTIONS` แล้วค่อย `order` ในหมวด
 * (ตัวเดียวกับที่ `lib/recruitment/form-health.ts` ใช้ตรวจ)
 */
function formRank(section: SectionId, order: number): number {
  const index = QUESTION_SECTIONS.findIndex((s) => s.id === section);
  return (index < 0 ? 99 : index) * 100_000 + order;
}

/** ข้อใหม่ยังไม่มีลำดับจริง — เซิร์ฟเวอร์ต่อท้ายหมวดให้ จึงถือว่าอยู่ท้ายสุด */
const NEW_QUESTION_ORDER = 99_999;

export function QuestionEditor({
  question,
  initialSection,
  questions,
  onClose,
  onSaved,
}: {
  /** `null` = สร้างใหม่ */
  question: Question | null;
  initialSection: SectionId;
  questions: Question[];
  onClose: () => void;
  onSaved: (saved: Question) => void;
}) {
  const [section, setSection] = useState<SectionId>(initialSection);
  const [key, setKey] = useState(question?.key ?? "");
  const [label, setLabel] = useState(question?.label ?? "");
  const [kind, setKind] = useState<QuestionKind>(question?.kind ?? "text");
  const [hint, setHint] = useState(question?.hint ?? "");
  const [placeholder, setPlaceholder] = useState(question?.placeholder ?? "");
  const [required, setRequired] = useState(question?.required ?? true);
  const [options, setOptions] = useState<QuestionOption[]>(question?.options ?? []);
  const [condKey, setCondKey] = useState(question?.condition?.key ?? "");
  const [condValues, setCondValues] = useState<string[]>(
    question?.condition?.equals ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  /**
   * ธง “ข้อมูลอ่อนไหว (ม.26)” — **ถอดปุ่มออกจากหน้าจอชั่วคราว แต่ยังส่งค่าเดิมกลับไป**
   *
   * ถ้าไม่ส่งขึ้นไปด้วย `PATCH` จะตีเป็น `false` (ดู `lib/recruitment/questions.ts`)
   * คำถามที่เคยถูกทำเครื่องหมายไว้จะหลุดการปิดบังในตารางแอดมินทันทีที่มีคน
   * กดบันทึกข้อนั้นด้วยเรื่องอื่น — อ่านค่าจากของเดิมไว้จึงยังปลอดภัย
   */
  const sensitive = question?.sensitive ?? false;

  const locked = question ? LOCKED_KEYS.includes(question.key) : false;

  /** ตั้งกุญแจเองได้เฉพาะตอนสร้างใหม่ — ข้อเดิมแก้ไม่ได้เพราะคำตอบเก่าอ้างกุญแจนี้อยู่ */
  const keyTrimmed = key.trim().toLowerCase();
  const keyError =
    !question && keyTrimmed && !KEY_PATTERN.test(keyTrimmed)
      ? "ใช้ได้เฉพาะ a–z ตัวเลข และขีดล่าง ขึ้นต้นด้วยตัวอักษร ยาว 2–40 ตัว"
      : null;

  /* ชนิดเดิมของข้อที่กำลังแก้ต้องอยู่ในรายการเสมอ ถึงจะไม่ใช่ชนิดที่เปิดให้ตั้งใหม่
     แล้วก็ตาม — ไม่งั้นช่องจะขึ้นว่างเปล่าเหมือนยังไม่ได้เลือก แล้วกดบันทึกทีเดียว
     ชนิดของข้อนั้นเปลี่ยนไปเงียบ ๆ */
  const kindOptions = (
    KIND_CHOICES.includes(kind) ? KIND_CHOICES : [...KIND_CHOICES, kind]
  ).map((k) => ({ value: k, label: KIND_LABEL[k] }));
  const savedValues = new Set((question?.options ?? []).map((o) => o.value));

  /**
   * คำถามที่ตั้งเงื่อนไขอ้างได้ — ต้องมีตัวเลือก ไม่ใช่ตัวเอง และ
   * **ต้องมาก่อนข้อนี้ในลำดับฟอร์ม**
   *
   * ข้อสุดท้ายคือบั๊กที่แก้ตรงนี้: เดิมเลือกข้อไหนก็ได้ รวมข้อที่อยู่หมวดถัดไป
   * ซึ่งบันทึกผ่านปกติแต่คำถามจะไม่มีวันโผล่ เพราะ `buildAnswers()` เดินทีละหมวด
   * ตามลำดับ — ตอนประเมินเงื่อนไขยังไม่มีคำตอบของข้อที่อยู่ข้างหลังให้อ่าน
   *
   * ของใหม่ยังไม่มี `order` จริง (เซิร์ฟเวอร์ต่อท้ายหมวดให้) จึงถือว่าอยู่ท้ายสุด
   * ของหมวดที่เลือกไว้ ซึ่งตรงกับตำแหน่งที่มันจะไปอยู่จริง
   */
  const selfRank = formRank(section, question?.order ?? NEW_QUESTION_ORDER);

  const conditionSources = questions.filter(
    (q) =>
      q.id !== question?.id &&
      NEEDS_OPTIONS.includes(q.kind) &&
      formRank(q.section, q.order) < selfRank,
  );
  const condSource = conditionSources.find((q) => q.key === condKey);

  async function save() {
    setSaving(true);
    try {
      const body = {
        /* ข้อใหม่ส่งกุญแจที่พิมพ์เอง ถ้าเว้นว่างเซิร์ฟเวอร์สุ่มให้ (ดู `lib/recruitment/questions.ts`)
           ข้อเดิมส่งของเดิมกลับไป ถึงฝั่งนั้นจะบังคับใช้ค่าในฐานอยู่แล้วก็ตาม */
        key: question ? question.key : keyTrimmed || undefined,
        section,
        label,
        hint,
        placeholder,
        kind,
        options: NEEDS_OPTIONS.includes(kind) ? options : [],
        required,
        sensitive,
        condition:
          condSource && condValues.length
            ? { key: condSource.key, equals: condValues }
            : null,
        active: question?.active ?? true,
      };

      const saved = question
        ? await requestJson<Question>(
            `/api/recruitment/questions/${question.id}`,
            { method: "PATCH", body },
            "บันทึกคำถามไม่สำเร็จ",
          )
        : await requestJson<Question>(
            "/api/recruitment/questions",
            { method: "POST", body },
            "เพิ่มคำถามไม่สำเร็จ",
          );

      toastSuccess(question ? "บันทึกคำถามแล้ว" : "เพิ่มคำถามแล้ว");
      onSaved(saved);
    } catch (err) {
      alertError(
        question ? "บันทึกคำถามไม่สำเร็จ" : "เพิ่มคำถามไม่สำเร็จ",
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setSaving(false);
    }
  }

  /** คำถามสมมติสำหรับพรีวิว — ไม่ได้แตะฐานข้อมูล */
  const preview: Question = {
    id: question?.id ?? "preview",
    key: question?.key ?? "preview",
    section,
    order: question?.order ?? 0,
    label: label || "ข้อความคำถามจะขึ้นตรงนี้",
    hint,
    placeholder,
    kind,
    options,
    required,
    sensitive,
    condition: null,
    active: true,
    updatedAt: "",
    updatedBy: "",
  };

  return (
    <ModalShell
      title={question ? "แก้ไขคำถาม" : "เพิ่มคำถามใหม่"}
      /* รหัสอ้างอิงมีไว้ให้จับคู่กับข้อความจากตัวตรวจฟอร์มที่เรียกข้อด้วยรหัสนี้
         ไม่ใช่ของที่ต้องจำหรือแก้ — ระบบตั้งให้เองตั้งแต่ตอนสร้าง */
      subtitle={question ? `รหัสอ้างอิง ${question.key}` : undefined}
      onClose={onClose}
      width="620px"
      tone="plain"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          {/* ชิดซ้ายสุด แยกขั้วจาก “ยกเลิก/บันทึก” — เป็นปุ่มดู ไม่ใช่ปุ่มตัดสินใจ
              จึงไม่ควรไปยืนปนกันจนกดพลาด */}
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="btn-sec me-auto flex items-center gap-1.5 px-3.5 py-2 text-13 text-mut transition-colors hover:border-primary/40 hover:text-ink"
          >
            <Eye size={14} strokeWidth={1.8} aria-hidden />
            ดูพรีวิว
          </button>

          <button
            type="button"
            onClick={onClose}
            className="btn-sec px-3.5 py-2 text-13 text-mut transition-colors hover:text-ink"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !label.trim() || !!keyError}
            className="btn-pri flex items-center gap-2 px-4 py-2 text-13 font-medium disabled:opacity-50"
          >
            {saving ? (
              <Loader2 size={13} strokeWidth={2} aria-hidden className="animate-spin" />
            ) : null}
            บันทึก
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          id="q-label"
          label="ข้อความคำถาม"
          hint="เขียนเป็นคำถามที่คนขับอ่านแล้วรู้ทันทีว่าต้องตอบอะไร"
          value={label}
          onChange={setLabel}
          placeholder="เช่น ขับรถบรรทุกมากี่ปีแล้ว"
        />

        {/* ตั้งได้เฉพาะตอนสร้างใหม่ — ข้อเดิมแก้กุญแจไม่ได้เพราะคำตอบเก่าอ้างกุญแจนี้
            อยู่ตรง ๆ (ดูหมายเหตุหัวไฟล์) เว้นว่างไว้ได้ ระบบจะสุ่มให้เหมือนเดิม */}
        {!question ? (
          <div className="flex flex-col gap-1">
            <TextField
              id="q-key"
              label="กุญแจคำถาม (key)"
              optional
              hint="a–z ตัวเลข และขีดล่าง ขึ้นต้นด้วยตัวอักษร · เว้นว่างให้ระบบสุ่มให้"
              value={key}
              onChange={setKey}
              placeholder="เช่น years_driving"
            />
            {keyError ? (
              <span role="alert" className="text-11-5 leading-relaxed text-alert">
                {keyError}
              </span>
            ) : null}
          </div>
        ) : null}

        {/* เฉพาะตอนแก้ไขข้อเดิม — ย้ายข้าม Section ได้ เผื่อคำถามที่วางผิดที่ตั้งแต่
            แรก ไม่งั้นต้องลบแล้วสร้างใหม่ ซึ่งเปลี่ยนกุญแจและทำให้คำตอบเก่าขาดจากกัน
            ส่วนตอนสร้างใหม่ Section ผูกกับปุ่ม "เพิ่มคำถาม" ที่กดมาอยู่แล้ว
            (`initialSection`) ไม่ต้องมีช่องให้เลือกซ้ำ */}
        {question ? (
          <SelectField
            id="q-section"
            label="อยู่ใน Section ไหน"
            hint={
              locked
                ? "คำถามหลักของระบบ ควรอยู่ Section แรกเสมอ"
                : "ย้ายข้าม Section ได้ · ข้อที่ตั้งเงื่อนไขไว้ต้องอยู่หลังข้อที่มันอ้างถึงเสมอ"
            }
            value={section}
            onChange={(v) => setSection(v as SectionId)}
            options={QUESTION_SECTIONS.map((s, i) => ({
              value: s.id,
              label: `Section ${i + 1} · ${s.title}`,
            }))}
          />
        ) : null}

        <SelectField
          id="q-kind"
          label="ชนิดคำตอบ"
          hint={
            locked
              ? "คำถามหลักของระบบ เปลี่ยนชนิดคำตอบไม่ได้"
              : "เลือกตอบข้อเดียวแสดงเป็น dropdown · เลือกตอบหลายข้อแสดงเป็นรายการติ๊ก"
          }
          value={kind}
          onChange={(v) => setKind(v as QuestionKind)}
          options={kindOptions}
          readOnly={locked}
        />

        <TextField
          id="q-hint"
          label="คำอธิบายใต้ช่อง"
          optional
          value={hint}
          onChange={setHint}
          placeholder="บอกสิ่งที่ช่วยให้ตอบถูก เช่น ดูจากมุมขวาล่างของใบขับขี่"
        />

        {NEEDS_OPTIONS.includes(kind) ? null : (
          <TextField
            id="q-placeholder"
            label="ข้อความตัวอย่างในช่อง"
            optional
            value={placeholder}
            onChange={setPlaceholder}
          />
        )}

        {NEEDS_OPTIONS.includes(kind) ? (
          <OptionEditor
            options={options}
            savedValues={savedValues}
            onChange={setOptions}
          />
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Toggle
            on={required}
            onClick={() => setRequired((v) => !v)}
            disabled={locked}
            label="บังคับกรอก"
          />
        </div>

        {conditionSources.length || condKey ? (
          <div className="flex flex-col gap-3 rounded-box border border-line p-3.5">
            <span className="text-12-5 font-medium text-mut">
              แสดงข้อนี้เฉพาะเมื่อ
            </span>

            {conditionSources.length ? (
              <SelectField
                id="q-cond-key"
                label="คำตอบของข้อ"
                srLabel
                optional
                value={condSource ? condKey : ""}
                onChange={(v) => {
                  setCondKey(v);
                  setCondValues([]);
                }}
                options={conditionSources.map((q) => ({
                  value: q.key,
                  label: q.label,
                }))}
                placeholder="แสดงเสมอ ไม่มีเงื่อนไข"
                clearable
              />
            ) : null}

            {condSource ? (
              <CheckboxGroupField
                id="q-cond-values"
                label="มีค่าเป็น"
                value={condValues}
                onToggle={(v) =>
                  setCondValues((prev) =>
                    prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
                  )
                }
                options={condSource.options}
              />
            ) : null}

            {/* เงื่อนไขเดิมชี้ไปข้อที่ตอนนี้อ้างไม่ได้แล้ว — เกิดได้สองทาง: ข้อต้นทาง
                ถูกลบ/เปลี่ยนชนิด หรือผู้ใช้เพิ่งย้ายข้อนี้ขึ้นไปอยู่ก่อนข้อต้นทาง
                ต้องบอกตรง ๆ ว่ากดบันทึกแล้วเงื่อนไขจะหาย ไม่ใช่ปล่อยให้หายเงียบ */}
            {condKey && !condSource ? (
              <span role="alert" className="text-11-5 leading-relaxed text-alert">
                เงื่อนไขเดิมอ้างข้อ “{condKey}” ซึ่งอยู่หลังข้อนี้ในฟอร์มหรือไม่มีแล้ว —
                ผู้สมัครจะไม่มีทางตอบข้อนั้นก่อน กดบันทึกแล้วเงื่อนไขนี้จะถูกลบออก
              </span>
            ) : null}

            {!conditionSources.length ? (
              <span className="text-11-5 leading-relaxed text-mut">
                ยังไม่มีคำถามแบบเลือกตอบอยู่ก่อนหน้าข้อนี้ให้ตั้งเงื่อนไขด้วย
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {previewOpen ? (
        <PreviewModal question={preview} onClose={() => setPreviewOpen(false)} />
      ) : null}
    </ModalShell>
  );
}

/* ------------------------------------------------------------------ พรีวิว */

/**
 * พรีวิวคำถามหนึ่งข้อในกล่องของตัวเอง — กดเล่นได้จริง
 *
 * เก็บคำตอบไว้ใน state ของตัวเองและตายไปพร้อมกล่อง · พรีวิวที่กดชิปแล้วไม่มีอะไร
 * ขยับดูเหมือนของเสียมากกว่าพรีวิว ทั้งที่สิ่งที่คนอยากรู้ก่อนกดบันทึกคือ
 * “ตัวเลือกเยอะขนาดนี้กดง่ายไหม” ซึ่งต้องกดถึงจะรู้
 *
 * กว้าง 460px เท่าคอลัมน์ฟอร์มจริงบนมือถือ ไม่ใช่เต็มกล่องแม่ — พรีวิวที่กว้าง
 * กว่าของจริงทำให้ข้อความคำถามขึ้นบรรทัดเดียวทั้งที่ในฟอร์มจริงตกสองบรรทัด
 */
function PreviewModal({
  question,
  onClose,
}: {
  question: Question;
  onClose: () => void;
}) {
  const [value, setValue] = useState<AnswerValue>(question.kind === "multi" ? [] : "");

  return (
    <ModalShell
      title="พรีวิวที่ผู้สมัครจะเห็น"
      subtitle="หน้าตาเดียวกับฟอร์มจริง · ลองกดได้ คำตอบตรงนี้ไม่ถูกบันทึก"
      onClose={onClose}
      width="460px"
      tone="plain"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="btn-sec px-3.5 py-2 text-13 text-mut transition-colors hover:text-ink"
        >
          ปิดพรีวิว
        </button>
      }
    >
      {/* พื้น `canvas` + การ์ดขาว = ทรงเดียวกับที่การ์ดคำถามวางอยู่ในฟอร์มจริง */}
      <div className="rounded-box bg-canvas p-4">
        <div className="rounded-field bg-base-100 p-3.5">
          <QuestionField question={question} value={value} onChange={setValue} />
        </div>
      </div>
    </ModalShell>
  );
}

/* ------------------------------------------------------------- ตัวเลือกคำตอบ */

function OptionEditor({
  options,
  savedValues,
  onChange,
}: {
  options: QuestionOption[];
  /** ค่าที่บันทึกลงฐานไปแล้ว — ลบได้แต่แก้ค่าไม่ได้ */
  savedValues: Set<string>;
  onChange: (next: QuestionOption[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-12-5 font-medium text-mut">
        ตัวเลือกคำตอบ
        <span aria-hidden className="font-normal text-alert">
          {" "}
          *
        </span>
      </span>
      <p className="text-11-5 text-mut">
        อย่างน้อย 2 ข้อ · เขียนให้สั้นพออ่านจบในบรรทัดเดียวบนมือถือ
      </p>

      {options.map((opt, i) => (
        <div key={opt.value} className="flex items-center gap-2">
          <input
            value={opt.label}
            onChange={(e) => {
              const next = [...options];
              next[i] = { ...opt, label: e.target.value };
              onChange(next);
            }}
            placeholder="ข้อความตัวเลือก"
            className="min-w-0 flex-1 rounded-field border border-line bg-base-100 px-3 py-2 text-13 outline-none transition-colors hover:border-primary/40 focus:border-primary/60 placeholder:text-mut"
          />
          <span
            title={
              savedValues.has(opt.value)
                ? "ค่านี้ถูกบันทึกไปแล้ว เปลี่ยนไม่ได้"
                : "ค่าที่จะบันทึก"
            }
            className="flex-none font-mono text-10-5 text-mut"
          >
            {opt.value}
          </span>
          <button
            type="button"
            aria-label={`ลบตัวเลือก ${opt.label || opt.value}`}
            onClick={() => onChange(options.filter((_, x) => x !== i))}
            className="flex size-7 flex-none items-center justify-center rounded-selector text-mut transition-colors hover:bg-alert/10 hover:text-alert"
          >
            <X size={14} strokeWidth={1.9} aria-hidden />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() =>
          onChange([...options, { value: nextOptionValue(options), label: "" }])
        }
        className="flex w-fit items-center gap-1.5 rounded-field border border-dashed border-line px-3 py-1.5 text-12-5 text-mut transition-colors hover:border-primary/50 hover:text-primary"
      >
        <Plus size={13} strokeWidth={2} aria-hidden />
        เพิ่มตัวเลือก
      </button>
    </div>
  );
}

function Toggle({
  on,
  onClick,
  label,
  disabled,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-field border px-3 py-2 text-12-5 transition-colors disabled:opacity-40 ${
        on ? "border-primary/50 bg-soft text-primary" : "border-line text-mut"
      }`}
    >
      {label}
    </button>
  );
}
