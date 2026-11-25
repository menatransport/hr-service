"use client";

import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";

import { DateField, NumberField, SelectField, TextField, TextareaField } from "@/components/ui/field";
import { SegmentedControl } from "@/components/ui/summary-panel";
import {
  JOB_MATCH,
  WAVE1_CLOSING,
  WAVE1_OPENING,
  WAVE1_QUESTIONS,
  WAVE2_OPENING,
  WAVE2_QUESTIONS,
  YES_NO_UNSURE,
  type JobMatch,
  type Wave1Answers,
  type Wave2Answers,
  type YesNoUnsure,
} from "@/app/recruitment/_lib/exit-interview/types";

/**
 * คำถาม Wave 1 / Wave 2 ของลิ้นชัก Exit Interview — แยกจาก `exit-interview-drawer.tsx` ตามกติกาความยาวไฟล์
 * ทุกข้อโชว์คำถามที่ต้องพูดตาม (ตัวเอียง) + ปุ่ม ⓘ เป้าหมายของคำถาม (ชีต Wave1/Wave2)
 */

type Q = { no: string; ask: string; why: string };

/** หัวคำถาม — คำพูดตามสคริปต์ + เป้าหมาย (กดดู) */
export function Question({ q, children }: { q: Q; children: React.ReactNode }) {
  const [why, setWhy] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-field border border-line bg-base-100 p-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex-none rounded-md bg-soft px-1.5 py-0.5 font-mono text-11-5 font-semibold text-primary">
          {q.no}
        </span>
        <p className="min-w-0 flex-1 text-13 text-ink text-pretty">“{q.ask}”</p>
        <button
          type="button"
          onClick={() => setWhy((v) => !v)}
          aria-label={`เป้าหมายของคำถาม ${q.no}`}
          aria-expanded={why}
          className="grid size-7 flex-none cursor-pointer place-items-center rounded-full text-mut transition-colors hover:bg-base-200 hover:text-primary"
        >
          <Info size={14} aria-hidden />
        </button>
      </div>
      {why ? <p className="rounded-field bg-base-200 px-2.5 py-1.5 text-12 text-mut text-pretty">เพื่อ: {q.why}</p> : null}
      {children}
    </div>
  );
}

/** สคริปต์เปิด/ปิด — พับไว้ กดอ่านก่อนโทร */
export function Script({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-field border border-dashed border-line">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-12-5 font-medium text-mut hover:text-ink"
      >
        {title}
        <ChevronDown size={14} aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <p className="px-3 pb-3 text-12-5 text-ink text-pretty">“{text}”</p> : null}
    </div>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | "";
  options: { value: T; label: string }[];
  onChange: (v: T | "") => void;
}) {
  return (
    <SegmentedControl<T | "">
      label={label}
      value={value}
      options={[{ value: "" as const, label: "ยังไม่ตอบ" }, ...options]}
      onChange={onChange}
      className="self-start"
    />
  );
}

type Patch<T> = (p: Partial<T>) => void;

/* ------------------------------------------------------------------ Wave 1 */

export function Wave1Fields({ id, v, set }: { id: string; v: Wave1Answers; set: Patch<Wave1Answers> }) {
  const Q = WAVE1_QUESTIONS;
  return (
    <div className="flex flex-col gap-3">
      <Script title="สคริปต์เปิดบทสนทนา (อ่านคำต่อคำ)" text={WAVE1_OPENING} />
      <DateField id={`${id}-w1d`} label="วันที่สัมภาษณ์ Wave 1" value={v.dateISO} onChange={(x) => set({ dateISO: x })} />
      <Question q={Q.q1}>
        <NumberField id={`${id}-q1`} label="กี่เดือนก่อนยื่นใบลาออก" optional value={v.q1Months} onChange={(x) => set({ q1Months: x })} placeholder="เดือน" />
      </Question>
      <Question q={Q.q2}>
        <TextareaField id={`${id}-q2`} label="คำตอบ (คำต่อคำ)" optional rows={2} value={v.q2} onChange={(x) => set({ q2: x })} />
      </Question>
      <Question q={Q.q3}>
        <TextareaField id={`${id}-q3`} label="ฟางเส้นสุดท้าย" optional rows={2} value={v.q3} onChange={(x) => set({ q3: x })} hint="ใช้ข้อนี้เลือกรหัสสาเหตุหลักด้านล่าง" />
      </Question>
      <Question q={Q.q4}>
        <Choice<Exclude<YesNoUnsure, "">> label="จะอยู่ต่อไหม" value={v.q4} options={YES_NO_UNSURE} onChange={(x) => set({ q4: x })} />
        <TextField id={`${id}-q41`} label="Q4.1 เรื่องที่อยากให้แก้" optional value={v.q41Topic} onChange={(x) => set({ q41Topic: x })} placeholder="เช่น เชื้อเพลิง · คุณภาพรถ · รายได้ · ครูฝึก" />
        <TextareaField id={`${id}-q42`} label="Q4.2 รายละเอียด" optional rows={2} value={v.q42} onChange={(x) => set({ q42: x })} />
      </Question>
      <Question q={Q.q5}>
        <TextareaField id={`${id}-q5`} label="คำตอบ" optional rows={2} value={v.q5} onChange={(x) => set({ q5: x })} />
      </Question>
      <Question q={Q.q6}>
        <Choice<Exclude<JobMatch, "">> label="ตรงกับที่บอกไว้แค่ไหน" value={v.q6Match} options={JOB_MATCH} onChange={(x) => set({ q6Match: x })} />
        <TextareaField id={`${id}-q6`} label="อะไรที่ไม่ตรง" optional rows={2} value={v.q6} onChange={(x) => set({ q6: x })} />
      </Question>
      <Question q={Q.q7}>
        <TextField id={`${id}-q7`} label="ชื่อหัวหน้างาน" optional value={v.q7} onChange={(x) => set({ q7: x })} />
      </Question>
      <Question q={Q.q8}>
        <SelectField
          id={`${id}-q8`}
          label="คะแนน (1–5)"
          optional
          value={v.q8Score == null ? "" : String(v.q8Score)}
          onChange={(x) => set({ q8Score: x ? Number(x) : null })}
          placeholder="ยังไม่ให้คะแนน"
          options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} คะแนน` }))}
          clearable
        />
        <TextareaField id={`${id}-q81`} label="Q8.1 เพราะอะไร" optional rows={2} value={v.q81} onChange={(x) => set({ q81: x })} />
      </Question>
      <Question q={Q.q9}>
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField id={`${id}-q9`} label="เดือนที่แล้วรับจริง (บาท)" optional value={v.q9Income} onChange={(x) => set({ q9Income: x })} />
          <NumberField id={`${id}-q91`} label="Q9.1 ที่ใหม่ให้ (บาท)" optional value={v.q91NewIncome} onChange={(x) => set({ q91NewIncome: x })} />
        </div>
      </Question>
      <Question q={Q.q10}>
        <TextareaField id={`${id}-q10`} label="คำตอบ" optional rows={2} value={v.q10} onChange={(x) => set({ q10: x })} />
      </Question>
      <Question q={Q.q11}>
        <TextareaField id={`${id}-q11`} label="คำตอบ" optional rows={2} value={v.q11} onChange={(x) => set({ q11: x })} />
      </Question>
      <Script title="สคริปต์ปิด — ขออนุญาตโทรกลับ (ไม่ขอ = Wave 2 ไม่เกิด)" text={WAVE1_CLOSING} />
    </div>
  );
}

/* ------------------------------------------------------------------ Wave 2 */

export function Wave2Fields({
  id,
  v,
  set,
  codeGroups,
}: {
  id: string;
  v: Wave2Answers;
  set: Patch<Wave2Answers>;
  codeGroups: { label: string; options: { value: string; label: string }[] }[];
}) {
  const Q = WAVE2_QUESTIONS;
  return (
    <div className="flex flex-col gap-3">
      <Script title="สคริปต์เปิดบทสนทนา Wave 2" text={WAVE2_OPENING} />
      <DateField id={`${id}-w2d`} label="วันที่โทร Wave 2" value={v.dateISO} onChange={(x) => set({ dateISO: x })} />
      <Question q={Q.qw1}>
        <TextareaField id={`${id}-qw1`} label="ที่ทำงานใหม่ / ขับรถอะไร" optional rows={2} value={v.qw1} onChange={(x) => set({ qw1: x })} />
      </Question>
      <Question q={Q.qw2}>
        <NumberField id={`${id}-qw2`} label="รายได้ที่ใหม่ / เดือน (บาท)" optional value={v.qw2Income} onChange={(x) => set({ qw2Income: x })} />
        <TextareaField id={`${id}-qw21`} label="QW2.1 ตารางงาน · ได้กลับบ้าน · พักผ่อน" optional rows={2} value={v.qw21} onChange={(x) => set({ qw21: x })} />
      </Question>
      <Question q={Q.qw3}>
        <TextareaField id={`${id}-qw3`} label="เหตุผลจริง (คำต่อคำ)" optional rows={2} value={v.qw3} onChange={(x) => set({ qw3: x })} />
        <SelectField
          id={`${id}-qw31`}
          label="QW3.1 รหัสสาเหตุ"
          optional
          value={v.qw31Code}
          onChange={(x) => set({ qw31Code: x })}
          groups={codeGroups}
          searchable
          clearable
          placeholder="เลือกรหัส…"
          hint="ไม่ตรงกับรหัสหลัก → ระบบจะถามว่าใช้เป็นรหัสหลักไหม (ตามกติกา: ยึด Wave 2)"
        />
      </Question>
      <Question q={Q.qw4}>
        <Choice<Exclude<YesNoUnsure, "">> label="จะกลับมาไหม" value={v.qw4} options={YES_NO_UNSURE} onChange={(x) => set({ qw4: x })} />
      </Question>
      <Question q={Q.qw5}>
        <TextareaField id={`${id}-qw5`} label="คำตอบ (คำต่อคำ)" optional rows={2} value={v.qw5} onChange={(x) => set({ qw5: x })} />
      </Question>
    </div>
  );
}
