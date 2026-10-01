/**
 * กติกาของฟอร์มสมัคร — **ใช้ได้ทั้งเซิร์ฟเวอร์และ client**
 *
 * ทุกอย่างที่ทั้งสองฝั่งต้องเห็นตรงกันอยู่ในไฟล์นี้: ลำดับหน้าจอ ช่องเอกสาร
 * และการตรวจคำตอบ · ฝั่ง client ใช้เพื่อบอกผู้ใช้ทันทีว่าต้องแก้อะไร
 * ฝั่งเซิร์ฟเวอร์ใช้ตัวเดียวกันซ้ำอีกครั้ง เพราะคนยิง API ตรงข้ามหน้าจอไปได้
 */

import {
  DOCUMENT_FIELDS,
  type AnswerMap,
  type AnswerValue,
  type DocumentField,
  type Question,
  type SectionId,
} from "./types";

/* --------------------------------------------------------------- ลำดับหน้าจอ */

export type Stage =
  | { kind: "questions"; section: SectionId }
  | { kind: "documents" }
  | { kind: "review" };

/**
 * ห้าขั้นหลังด่านยินยอม
 *
 * เอกสารอยู่ขั้นที่ 4 ไม่ใช่ขั้นแรก **โดยตั้งใจ** — การถ่ายรูปบัตรเป็นงานที่หนักที่สุด
 * ในฟอร์มนี้ คนที่กรอกมาแล้วสามหน้าจะยอมลงแรงต่อ ส่วนคนที่เจอตั้งแต่หน้าแรก
 * จะปิดทิ้ง (จุดที่ใบสมัครหายมากที่สุดของฟอร์มแนวนี้)
 */
export const APPLY_STAGES: Stage[] = [
  { kind: "questions", section: "identity" },
  { kind: "questions", section: "license" },
  { kind: "questions", section: "ready" },
  { kind: "documents" },
  { kind: "review" },
];

export const TOTAL_STAGES = APPLY_STAGES.length;

/* ----------------------------------------------------------------- เอกสาร */

export interface DocSlot {
  id: string;
  label: string;
  hint: string;
  required: boolean;
  /** แสดงในฟอร์มผู้สมัครไหม — ซ่อนแล้วถือว่าไม่บังคับเสมอ (เซิร์ฟเวอร์บังคับที่ `doc-slots.ts`) */
  visible: boolean;
}

/**
 * ชุดเอกสารตั้งต้น — **ลงฐานครั้งเดียวตอนคลังเอกสารยังว่าง** (ดู `doc-slots.ts`)
 *
 * ของจริงที่ทุกหน้าใช้อ่านจากคอลเลกชัน `recruitment_doc_slot` ซึ่งฝ่ายบุคคลเพิ่ม
 * แก้ ลบ และจัดลำดับได้จาก Section 4 ของหน้าคลังคำถาม · รับเฉพาะไฟล์รูป
 * (ดูเหตุผลที่ `doc-upload.tsx`)
 */
export const DEFAULT_DOC_SLOTS: DocSlot[] = [
  {
    id: "id_card",
    label: "บัตรประชาชน",
    hint: "ถ่ายให้เห็นเลขบัตร 13 หลักชัดเจน ไม่มีแสงสะท้อนทับ",
    required: true,
    visible: true,
  },
  {
    id: "license_front",
    label: "ใบขับขี่ ด้านหน้า",
    hint: "ให้เห็นชนิดใบขับขี่และวันหมดอายุ",
    required: true,
    visible: true,
  },
  {
    id: "house_reg",
    label: "ทะเบียนบ้าน",
    hint: "หน้าที่มีชื่อคุณ",
    required: true,
    visible: true,
  },
  {
    id: "portrait",
    label: "รูปถ่ายหน้าตรง",
    hint: "ถ่ายเซลฟี่ได้เลย ขอให้เห็นหน้าชัดและไม่สวมแว่นดำ",
    required: true,
    visible: true,
  },
  {
    id: "bank_book",
    label: "หน้าสมุดบัญชีธนาคาร",
    hint: "ให้เห็นชื่อบัญชีและเลขที่บัญชี — ใช้โอนเงินเดือน",
    required: false,
    visible: true,
  },
  {
    id: "medical",
    label: "ใบรับรองแพทย์",
    hint: "ยังไม่มีก็ข้ามไปก่อนได้ นำมาวันสัมภาษณ์",
    required: false,
    visible: true,
  },
];

/**
 * ช่องที่**ลบไม่ได้** — ข้อมูลจากเอกสาร (`DOCUMENT_FIELDS`) ผูกกับ `id` ของช่องพวกนี้
 * ตรง ๆ ลบทิ้งแล้วกล่องกรอกเลขบัตร/เลขบัญชีของฝ่ายบุคคลจะไม่มีที่อยู่ · ซ่อนได้ตามปกติ
 */
export function isLockedDocSlot(id: string): boolean {
  return DOCUMENT_FIELDS.some((f) => f.slot === id);
}

/** ช่องที่ผู้สมัครเห็นในขั้นเอกสาร */
export function formDocSlots(slots: DocSlot[]): DocSlot[] {
  return slots.filter((s) => s.visible);
}

/**
 * ช่องที่หน้าแอดมินต้องแสดงของใบหนึ่ง — ช่องที่เปิดอยู่ **บวกช่องที่ซ่อนหรือถูกลบไปแล้ว
 * แต่ใบนี้แนบมาก่อนหน้า** · ไม่งั้นการแก้ Section 4 วันนี้จะทำให้ไฟล์ที่แนบไว้เมื่อวาน
 * หายจากรายงาน · ช่องที่ถูกลบใช้ชื่อที่ติดมากับไฟล์ (`ApplicationFile.label`)
 */
export function slotsForApplication(
  slots: DocSlot[],
  files: { slot: string; label?: string }[],
): DocSlot[] {
  const attached = new Set(files.map((f) => f.slot));
  const known = new Set(slots.map((s) => s.id));
  const orphans: DocSlot[] = files
    .filter((f) => !known.has(f.slot))
    .map((f) => ({
      id: f.slot,
      label: f.label || "เอกสารที่ลบออกจากคลังแล้ว",
      hint: "",
      required: false,
      visible: false,
    }));
  return [...slots.filter((s) => s.visible || attached.has(s.id)), ...orphans];
}

/* ------------------------------------------------------------ กุญแจสงวนไว้ */

/**
 * สองกุญแจนี้ลบไม่ได้และเปลี่ยนชนิดไม่ได้
 *
 * ใบสมัครถอดค่าสองข้อนี้ออกมาเก็บเป็นฟิลด์ระดับบนสุด (`fullName` / `phone`)
 * เพื่อให้ค้นหา เรียง และกันสมัครซ้ำได้โดยไม่ต้องขุดเข้าไปใน `answers` —
 * ถ้าแอดมินลบคำถามสองข้อนี้ทิ้ง ตารางผู้สมัครจะไม่เหลือชื่อกับเบอร์ให้แสดง
 */
export const KEY_FULL_NAME = "full_name";
export const KEY_PHONE = "phone";
export const LOCKED_KEYS: string[] = [KEY_FULL_NAME, KEY_PHONE];

/* ------------------------------------------------ คำถามที่หน้าแอดมินต้องใช้ */

/**
 * “ข้อไหนคือข้อที่ตารางผู้สมัครต้องการ” — หาโดย**หน้าที่ ไม่ใช่โดยคีย์**
 *
 * เหตุผล: คีย์ของคำถามที่ฝ่ายบุคคลเพิ่มเองเป็นเลขสุ่ม (`q_844264d995`) และเปลี่ยน
 * ทุกครั้งที่ลบข้อนั้นแล้วเพิ่มกลับเข้ามา — ตารางที่ผูกกับคีย์ตรง ๆ จึงกลายเป็น “—”
 * ทั้งคอลัมน์เงียบ ๆ ทันทีที่มีคนแก้คลังคำถาม โดยไม่มีอะไรฟ้อง
 *
 * ลำดับการหา: **คีย์ที่รู้จักก่อน** (ชุดตั้งต้นของระบบ) แล้วค่อยไล่หาจากข้อความ
 * คำถาม · ค้นจาก `questionSnapshot` ของใบนั้นเอง ใบเก่าจึงยังอ่านออกแม้คลัง
 * คำถามปัจจุบันจะเปลี่ยนไปแล้ว
 */
export type QuestionRole =
  | "last_name"
  | "work_zone"
  | "ready_date"
  | "hr_contact";

interface RoleMatcher {
  /** คีย์ที่ระบบเคยตั้งไว้เอง — ตรงตัวไหนใช้ตัวนั้นก่อนเสมอ */
  keys: string[];
  /** ต้องมีคำเหล่านี้ครบทุกคำในข้อความคำถาม */
  includes: string[];
  /** เจอคำเหล่านี้ = ไม่ใช่ข้อที่ต้องการ (กันข้อของผู้ติดต่อฉุกเฉินมาสวม) */
  excludes?: string[];
}

const ROLE_MATCHERS: Record<QuestionRole, RoleMatcher> = {
  last_name: {
    keys: ["last_name"],
    includes: ["นามสกุล"],
    excludes: ["ฉุกเฉิน", "ชื่อ -", "ชื่อ–"],
  },
  work_zone: { keys: ["branch", "work_zone"], includes: ["เขต"] },
  ready_date: { keys: ["start_availability"], includes: ["เริ่มงาน"] },
  hr_contact: { keys: ["hr_contact"], includes: ["ฝ่ายบุคคล"] },
};

/** ข้อที่ทำหน้าที่นี้ในใบสมัครใบหนึ่ง — ไม่มีก็คืน `undefined` ตารางจะขึ้น “—” */
export function findByRole<T extends { key: string; label: string }>(
  snapshot: T[],
  role: QuestionRole,
): T | undefined {
  const rule = ROLE_MATCHERS[role];
  const byKey = snapshot.find((q) => rule.keys.includes(q.key));
  if (byKey) return byKey;

  return snapshot.find(
    (q) =>
      rule.includes.every((word) => q.label.includes(word)) &&
      !rule.excludes?.some((word) => q.label.includes(word)),
  );
}

/**
 * ชื่อ–นามสกุลที่เอาไปขึ้นตาราง
 *
 * คลังคำถามจริงแยก “ชื่อ” กับ “นามสกุล” เป็นคนละข้อ แต่ใบสมัครเก็บ `fullName`
 * จากข้อแรกข้อเดียว (ดู `KEY_FULL_NAME`) — ต่อให้ตรงนี้ ไม่ใช่ตอนบันทึก เพราะ
 * ใบที่ลงฐานไปแล้วก็ต้องแสดงชื่อเต็มเหมือนกัน · กันต่อซ้ำเมื่อข้อแรกมีทั้งชื่อและ
 * นามสกุลอยู่แล้ว (ฟอร์มรุ่นเก่าถามรวมข้อเดียว)
 */
export function composeName(first: string, last: string): string {
  const head = first.trim();
  const tail = last.trim();
  if (!tail || head.includes(tail)) return head;
  return `${head} ${tail}`;
}

/* ---------------------------------------------------------------- ตรวจคำตอบ */

export function isMultiKind(kind: Question["kind"]): boolean {
  return kind === "multi";
}

/** ค่าว่างของคำถามแต่ละชนิด — ใช้ตอนตั้งต้นฟอร์มและตอนล้างค่าที่ถูกซ่อน */
export function emptyAnswer(kind: Question["kind"]): AnswerValue {
  return isMultiKind(kind) ? [] : "";
}

export function isBlank(value: AnswerValue | undefined): boolean {
  if (value === undefined) return true;
  return Array.isArray(value) ? value.length === 0 : value.trim() === "";
}

/** ข้อความคำตอบสำหรับแสดงผล — `multi` แปลงค่าเป็นป้ายแล้วต่อด้วยจุลภาค */
export function displayAnswer(
  value: AnswerValue | undefined,
  options: { value: string; label: string }[],
): string {
  if (isBlank(value)) return "—";
  const label = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  return Array.isArray(value) ? value.map(label).join(", ") : label(value as string);
}

/**
 * ข้อนี้ควรแสดงไหมเมื่อคำตอบปัจจุบันเป็นแบบนี้
 *
 * เงื่อนไขชี้ไปยังคำถามที่ถูกลบหรือปิดใช้ไปแล้ว = **ไม่แสดง** — เลือกทางนี้เพราะ
 * ข้อที่ขึ้นกับคำถามซึ่งหายไปแล้วจะไม่มีบริบทให้ผู้สมัครตอบ และการซ่อนทำให้
 * ฟอร์มสั้นลงซึ่งเป็นทางที่เสียหายน้อยกว่าการโผล่ขึ้นมาลอย ๆ
 */
export function isVisible(question: Question, answers: AnswerMap): boolean {
  const cond = question.condition;
  if (!cond) return true;
  const current = answers[cond.key];
  if (isBlank(current)) return false;
  return Array.isArray(current)
    ? current.some((v) => cond.equals.includes(v))
    : cond.equals.includes(current as string);
}

/** คำถามที่ต้องเรนเดอร์จริงในหมวดหนึ่ง — เปิดใช้อยู่ ผ่านเงื่อนไข และเรียงแล้ว */
export function visibleQuestions(
  questions: Question[],
  section: SectionId,
  answers: AnswerMap,
): Question[] {
  return questions
    .filter((q) => q.active && q.section === section && isVisible(q, answers))
    .sort((a, b) => a.order - b.order);
}

/* ------------------------------------------------------------ ตรวจทีละช่อง */

const THAI_MOBILE = /^0[6-9]\d{8}$/;

/** ตัดทุกอย่างที่ไม่ใช่ตัวเลขออก — ผู้ใช้พิมพ์ขีดหรือเว้นวรรคมาได้ตามสบาย */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * เลขบัตรประชาชนไทย 13 หลัก — ตรวจเลขหลักสุดท้ายด้วยสูตรของกรมการปกครอง
 *
 * ตรวจถึงขั้นนี้เพราะเลขบัตรที่พิมพ์สลับหลักจะผ่านการนับ 13 ตัวไปได้สบาย
 * แล้วไปโผล่เป็นปัญหาตอนฝ่ายบุคคลเอาไปตรวจประวัติ ซึ่งแก้ย้อนหลังยากกว่ามาก
 */
export function isValidThaiNationalId(raw: string): boolean {
  const id = digitsOnly(raw);
  if (id.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(id[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(id[12]);
}

/* ------------------------------------------- ตรวจข้อมูลที่อ่านจากเอกสาร */

/**
 * เลขที่บัญชีธนาคารไทย — **ตรวจได้แค่ความยาว ไม่มีเลขตรวจสอบกลาง**
 *
 * แต่ละธนาคารใช้ความยาวไม่เท่ากัน (ออมสิน/ธ.ก.ส. 12 · พาณิชย์ส่วนใหญ่ 10 ·
 * บางบัญชีขึ้นไปถึง 15) และไม่มีสูตรตรวจข้ามธนาคารแบบเลขบัตรประชาชน · ที่ทำได้
 * คือกันเลขที่สั้นหรือยาวจนผิดรูปชัด ๆ แล้วปล่อยให้คนอ่านทวนกับหน้าสมุดอีกที
 */
export function isValidThaiBankAccount(raw: string): boolean {
  const digits = digitsOnly(raw);
  return digits.length >= 10 && digits.length <= 15;
}

/** เลขประจำบ้าน 11 หลัก — ตัวเลขล้วน ไม่มีเลขตรวจสอบ */
export function isValidHouseRegNo(raw: string): boolean {
  return digitsOnly(raw).length === 11;
}

/**
 * ตรวจค่าหนึ่งช่องของข้อมูลจากเอกสาร — คืน `null` เมื่อผ่าน
 *
 * **ช่องว่างผ่านเสมอ** ต่างจากคำตอบในใบสมัคร — เอกสารที่ถ่ายเบลอครึ่งใบยังต้อง
 * บันทึกส่วนที่อ่านออกได้ ไม่ใช่ถูกปัดตกทั้งชุดเพราะมีช่องหนึ่งอ่านไม่ออก
 */
export function validateDocumentField(
  field: DocumentField,
  value: string,
): string | null {
  const text = value.trim();
  if (!text) return null;

  switch (field.kind) {
    case "nid":
      if (digitsOnly(text).length !== 13) return "เลขบัตรต้องมี 13 หลัก";
      if (!isValidThaiNationalId(text))
        return "เลขบัตรนี้ไม่ถูกต้อง ลองทานเลขกับตัวบัตรอีกรอบ";
      return null;

    case "digits": {
      const digits = digitsOnly(text);
      if (field.digits) {
        return digits.length === field.digits
          ? null
          : `ต้องมี ${field.digits} หลัก ตอนนี้กรอกมา ${digits.length} หลัก`;
      }
      /* ช่องตัวเลขที่ไม่ได้ตรึงจำนวนหลักมีช่องเดียวคือเลขที่บัญชี */
      return isValidThaiBankAccount(digits)
        ? null
        : "เลขที่บัญชีต้องมี 10–15 หลัก ทานกับหน้าสมุดอีกรอบ";
    }

    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(text) ? null : "เลือกวันที่จากปฏิทิน";

    default:
      return text.length > 200 ? "ยาวเกินไป ตัดให้สั้นลงหน่อย" : null;
  }
}

/**
 * ตรวจคำตอบหนึ่งข้อ — คืน `null` เมื่อผ่าน หรือข้อความที่บอกว่า**ต้องทำอะไรต่อ**
 *
 * ข้อความทุกอันเขียนเป็นคำสั่งที่ทำตามได้ ไม่ใช่คำตัดสิน (“ยังไม่ครบ 13 หลัก”
 * ไม่ใช่ “รูปแบบไม่ถูกต้อง”) เพราะผู้ใช้กรอกบนมือถือและต้องรู้ทันทีว่าพิมพ์ขาดไปไหน
 */
export function validateAnswer(
  /* รับแค่สองช่องที่ใช้จริง — ฝั่งแอดมินตรวจคำตอบที่แก้ด้วย **สำเนาคำถามในใบ**
     (`QuestionSnapshot`) ซึ่งไม่มีช่องอื่นของ `Question` ติดมาด้วย */
  question: Pick<Question, "kind" | "required">,
  value: AnswerValue | undefined,
): string | null {
  if (value === undefined || isBlank(value)) {
    return question.required ? "ยังไม่ได้กรอกข้อนี้" : null;
  }

  if (Array.isArray(value)) return null;
  const text = value.trim();

  switch (question.kind) {
    case "tel": {
      const digits = digitsOnly(text);
      if (digits.length !== 10) return "เบอร์มือถือต้องมี 10 หลัก";
      if (!THAI_MOBILE.test(digits))
        return "เบอร์มือถือต้องขึ้นต้นด้วย 06 07 08 หรือ 09";
      return null;
    }
    case "nid": {
      const digits = digitsOnly(text);
      if (digits.length !== 13)
        return `ยังไม่ครบ 13 หลัก ตอนนี้กรอกมา ${digits.length} หลัก`;
      if (!isValidThaiNationalId(digits))
        return "เลขบัตรนี้ไม่ถูกต้อง ลองตรวจดูว่าพิมพ์สลับหลักหรือเปล่า";
      return null;
    }
    case "number":
      if (!/^\d+$/.test(text)) return "กรอกเป็นตัวเลขเท่านั้น";
      return null;
    case "date":
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "เลือกวันที่จากปฏิทิน";
      return null;
    case "text":
      if (text.length < 2) return "สั้นเกินไป กรอกให้ครบ";
      if (text.length > 200) return "ยาวเกินไป ตัดให้สั้นลงหน่อย";
      return null;
    case "textarea":
      if (text.length > 2000) return "ยาวเกิน 2,000 ตัวอักษร";
      return null;
    default:
      return null;
  }
}

/** ตรวจทั้งหมวด — คืนแผนที่ `key` → ข้อความผิดพลาด เฉพาะข้อที่ยังไม่ผ่าน */
export function validateSection(
  questions: Question[],
  section: SectionId,
  answers: AnswerMap,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const q of visibleQuestions(questions, section, answers)) {
    const message = validateAnswer(q, answers[q.key]);
    if (message) errors[q.key] = message;
  }
  return errors;
}

/** ช่องเอกสารที่บังคับแต่ยังไม่ได้แนบ */
export function missingDocs(
  files: Record<string, string | null>,
  slots: DocSlot[],
): DocSlot[] {
  return slots.filter((slot) => slot.visible && slot.required && !files[slot.id]);
}

/* ------------------------------------------------------------------- เบ็ดเตล็ด */

/**
 * จัดเบอร์เป็น `081-3181278` ตอนแสดงผล — ในฐานข้อมูลเก็บเป็นตัวเลขล้วนเสมอ
 *
 * ขีดเดียวหลังรหัสสามหลักแรก ไม่ใช่เว้นวรรคเป็นสามก้อน เพราะรูปนี้คัดลอกไปวาง
 * ในโปรแกรมอื่นแล้วยังเป็นเบอร์เดียวติดกัน ไม่ถูกตัดกลางตอนตัดคำหรือตอนแปะลง
 * ช่องที่ไม่รับช่องว่าง
 */
export function formatPhone(raw: string): string {
  const d = digitsOnly(raw);
  if (d.length !== 10) return raw;
  return `${d.slice(0, 3)}-${d.slice(3)}`;
}

/**
 * `YYYY-MM-DD` → `15 ก.ย. 2569` (พ.ศ.) — ค่าที่ไม่ใช่วันที่คืนกลับไปตามเดิม
 *
 * รับค่าที่ไม่ใช่วันที่ได้โดยตั้งใจ เพราะช่อง “เริ่มงานได้เมื่อไหร่” ของฟอร์มรุ่นเก่า
 * เป็นตัวเลือก (“ทันที” / “ภายใน 15 วัน”) ไม่ใช่ปฏิทิน — ตารางเดียวกันจึงต้อง
 * แสดงได้ทั้งสองแบบโดยไม่ต้องรู้ว่าใบไหนมาจากฟอร์มรุ่นไหน
 */
export function thaiDate(value: string): string {
  const raw = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw || "—";
  const date = new Date(`${raw.slice(0, 10)}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

/** จำนวนวันเต็มนับจากวันนี้ — ติดลบ = ผ่านมาแล้ว · ใช้เตือนวันสัมภาษณ์ที่ใกล้ถึง */
export function daysUntil(isoDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(isoDate)) return null;
  const target = Date.parse(`${isoDate.slice(0, 10)}T00:00:00+07:00`);
  if (Number.isNaN(target)) return null;
  const today = new Date();
  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
  }).format(today);
  const start = Date.parse(`${todayKey}T00:00:00+07:00`);
  return Math.round((target - start) / 86_400_000);
}

/**
 * ใส่ขีดตามรูปบนบัตร `x-xxxx-xxxxx-xx-x` — ใส่ทีละช่วงตามที่พิมพ์ถึง ช่องกรอก
 * จึงเติมขีดให้เองระหว่างพิมพ์ · ใช้แสดงผลเท่านั้น ค่าที่เก็บยังเป็นตัวเลขล้วน
 */
export function formatNationalId(raw: string): string {
  const d = digitsOnly(raw).slice(0, 13);
  return [d.slice(0, 1), d.slice(1, 5), d.slice(5, 10), d.slice(10, 12), d.slice(12)]
    .filter(Boolean)
    .join("-");
}

/** ปิดเลขบัตรเหลือ 4 หลักท้าย — ตารางแอดมินไม่มีเหตุผลต้องโชว์เต็ม */
export function maskNationalId(raw: string): string {
  const d = digitsOnly(raw);
  if (d.length !== 13) return raw;
  return `x-xxxx-xxxxx-xx-${d.slice(11)}`;
}
