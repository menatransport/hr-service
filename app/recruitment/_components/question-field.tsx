"use client";

import {
  CheckboxGroupField,
  DateField,
  NativeSelectField,
  TextareaField,
  TextField,
} from "@/components/ui/field";
import { digitsOnly } from "@/app/recruitment/_lib/form";
import type { AnswerValue, Question } from "@/app/recruitment/_lib/types";

/**
 * คำถามเท่าที่ช่องกรอกต้องรู้
 *
 * กว้างกว่า `Question` เต็มใบเพราะหน้าที่สามที่ใช้ตัวนี้คือ **กล่องแก้คำตอบของ
 * ใบเก่า** ซึ่งมีให้ใช้แค่ `QuestionSnapshot` ที่ติดอยู่กับใบนั้น — สำเนานั้น
 * ไม่ได้เก็บ `hint` / `placeholder` / `required` ไว้ เพราะสามช่องนั้นเป็นเรื่อง
 * ของ*การกรอก* ไม่ใช่เรื่องของ*คำตอบ*ที่ต้องเก็บเป็นหลักฐาน
 */
export type FieldQuestion = Pick<Question, "key" | "label" | "kind" | "options"> &
  Partial<Pick<Question, "hint" | "placeholder" | "required">>;

/**
 * แปลงคำถามหนึ่งข้อในคลัง → ช่องกรอกหนึ่งช่องบนหน้าจอ
 *
 * **ตัวนี้ตัวเดียวถูกใช้ทั้งฟอร์มจริงและจอพรีวิวในหน้าแอดมิน** — พรีวิวจึงไม่ใช่
 * ภาพจำลอง ถ้าพรีวิวถูก ของจริงก็ถูก และไม่มีทางที่สองที่หน้าจะเพี้ยนจากกัน
 *
 * คอนโทรลทุกตัวมาจาก `components/ui/field.tsx` และใช้ `size="lg"` เสมอ
 * (ช่องสูงขึ้น ตัวอักษรใหญ่ขึ้น) เพราะฟอร์มนี้กรอกบนมือถือเป็นหลัก
 */

/* -------------------------------------------------------------- ตัวเรนเดอร์หลัก */

export function QuestionField({
  question,
  value,
  onChange,
  error,
}: {
  question: FieldQuestion;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
  /** ข้อความจาก `validateAnswer()` — ขึ้นใต้ช่องหลังผู้ใช้ออกจากช่องแล้วเท่านั้น */
  error?: string;
}) {
  const id = `q-${question.key}`;
  const text = typeof value === "string" ? value : "";
  const list = Array.isArray(value) ? value : [];

  const common = {
    id,
    label: question.label,
    hint: question.hint || undefined,
    optional: !question.required,
    size: "lg" as const,
  };

  function control() {
    switch (question.kind) {
      case "textarea":
        return (
          <TextareaField
            {...common}
            value={text}
            onChange={onChange}
            placeholder={question.placeholder || undefined}
            rows={3}
            resize={false}
          />
        );

      case "date":
        return <DateField {...common} value={text} onChange={onChange} />;

      /* เบอร์ เลขบัตร และตัวเลข ใช้ `type="tel"` ทั้งหมดเพื่อเรียกแป้นตัวเลขบนมือถือ
         แล้วกรองอักขระที่ไม่ใช่ตัวเลขทิ้งตั้งแต่ตอนพิมพ์ — ผู้ใช้จึงไม่มีทางพิมพ์
         ขีดหรือเว้นวรรคค้างไว้แล้วมาเจอ error ตอนกดถัดไป */
      case "tel":
      case "nid":
      case "number":
        return (
          <TextField
            {...common}
            type="tel"
            value={text}
            onChange={(v) => onChange(digitsOnly(v).slice(0, question.kind === "nid" ? 13 : 15))}
            placeholder={question.placeholder || undefined}
          />
        );

      /*
       * เลือกได้ข้อเดียว = dropdown เสมอ ไม่ว่าจะมีกี่ตัวเลือก
       *
       * เดิมตัวเลือกน้อย ๆ วาดเป็นชิปเรียงกัน ซึ่งกดง่ายกว่าจริงแต่กินความสูง
       * ไม่คงที่ — ข้อที่มีหกตัวเลือกยาวกว่าข้อที่มีสองเกือบสามเท่า ทั้งหน้าจึง
       * สูงจนต้องเลื่อนหลายรอบ · dropdown สูงเท่ากันทุกข้อ ฟอร์มอ่านเป็น
       * คอลัมน์เดียวสม่ำเสมอ
       *
       * และเป็น `NativeSelectField` (`<select>` ของเบราว์เซอร์) ไม่ใช่
       * `SelectField` ที่วาดรายการเอง — คนขับกรอกบนมือถือ ตัวเลือกที่ระบบ
       * ปฏิบัติการกางให้คือหน้าตาที่เขาเจอในทุกแอปอยู่แล้ว
       */
      case "single":
        return (
          <NativeSelectField
            {...common}
            value={text}
            onChange={onChange}
            options={question.options}
            placeholder="เลือกคำตอบ"
          />
        );

      case "multi":
        return (
          <CheckboxGroupField
            {...common}
            value={list}
            onToggle={(v) =>
              onChange(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
            }
            options={question.options}
          />
        );

      default:
        return (
          <TextField
            {...common}
            value={text}
            onChange={onChange}
            placeholder={question.placeholder || undefined}
          />
        );
    }
  }

  /**
   * แต่ละข้ออยู่ในการ์ดของตัวเอง
   *
   * ใส่ไว้ **ที่นี่ ไม่ใช่ที่ `apply-flow.tsx`** เพราะจอพรีวิวในหน้าแอดมินเรนเดอร์
   * `QuestionField` ตรง ๆ ไม่ผ่านฟอร์ม — ถ้าการ์ดอยู่ที่ฟอร์ม พรีวิวจะเป็นคนละ
   * หน้าตากับของจริงทันที ซึ่งเป็นสิ่งเดียวที่พรีวิวนี้มีไว้ป้องกัน
   *
   * ขอบเปลี่ยนสีตอนมี error แทนการพึ่งข้อความสีแดงอย่างเดียว — บนมือถือที่มี
   * สามสี่ข้อเรียงกัน ข้อความเล็ก ๆ ใต้ช่องหาไม่เจอถ้าไม่มีอะไรนำสายตา
   */
  return (
    <div
      className={`flex flex-col gap-1.5 rounded-box border bg-base-100 p-4 transition-colors ${
        error ? "border-alert/55" : "border-line"
      }`}
    >
      {control()}
      {error ? (
        <p role="alert" className="text-12 text-alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
