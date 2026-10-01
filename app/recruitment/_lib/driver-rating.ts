/**
 * Driver Rating — แบบประเมินผู้สมัครพนักงานขับรถ 20 ข้อ 4 หมวด คะแนน 1–5
 * **ใช้ได้ทั้ง server และ client** (ไม่แตะฐานข้อมูล)
 *
 * **master อยู่ที่ `driver-rating.json`** — คำถาม คำตอบ คะแนน การตีความ และเกณฑ์แปลผล
 * คัดมาจาก `driver_rating.xlsx` ของฝ่ายบุคคล · จะปรับคะแนนหรือเพิ่มคำตอบ แก้ไฟล์นั้น
 * ไฟล์เดียว ไม่ต้องแตะโค้ด · `id` ของข้อ**ห้ามเปลี่ยน**เพราะคะแนนที่บันทึกไว้แล้ว
 * อ้างด้วย `id` (ดู `RatingRecord`)
 *
 * คะแนนแต่ละข้อมาจากสองทาง เรียงตามลำดับความสำคัญ:
 * 1. **ฝ่ายบุคคลเลือกเอง** (`Application.rating.answers`) — ชนะเสมอ เพราะคือสิ่งที่
 *    ได้ยินจากปากผู้สมัครตอนสัมภาษณ์
 * 2. **คำตอบในฟอร์มสมัคร** — ข้อใน master ที่มี `form` จะหาคำถามคู่กันด้วยข้อความ
 *    (ท่าเดียวกับ `findByRole()` เพราะคีย์ในคลังคำถามเป็นเลขสุ่ม) แล้วจับคู่คำตอบกับ
 *    ป้ายคำตอบใน master (หรือ `aliases`) · ตอบหลายข้อ (multi) ใช้**คะแนนต่ำสุด**
 *    เพื่อไม่ให้ความเสี่ยงถูกกลบด้วยคำตอบดี ๆ ข้ออื่น
 *
 * **คะแนนเฉลี่ย = เฉลี่ยของค่าเฉลี่ยแต่ละหมวด** (ไม่ใช่เฉลี่ยทุกข้อรวมกัน) ตามสูตร
 * ในชีต report — หมวดประสบการณ์มี 7 ข้อจะได้ไม่ถ่วงน้ำหนักเกินหมวดอื่น ·
 * หมวดที่ยังไม่มีคะแนนเลยไม่ถูกนับในค่าเฉลี่ย
 */

import master from "./driver-rating.json";
import { displayAnswer } from "./form";
import type {
  AnswerMap,
  QuestionSnapshot,
  RatingRecord,
  RatingSummary,
} from "./types";

/* ------------------------------------------------------------------ รูป master */

export interface RatingAnswer {
  label: string;
  score: number;
  note: string;
  /** ป้ายคำตอบในฟอร์มที่นับเป็นคำตอบนี้ — ใช้เมื่อฟอร์มถามต่างจาก master */
  aliases?: string[];
}

export interface RatingQuestion {
  id: string;
  category: string;
  label: string;
  /** คำถามเต็มสำหรับผู้สัมภาษณ์อ่าน — ไม่มี = ใช้ `label` */
  ask?: string;
  /** วิธีหาข้อคู่กันในฟอร์มสมัคร · `null` = ฟอร์มไม่ได้ถาม ต้องให้คะแนนตอนสัมภาษณ์ */
  form: { keys?: string[]; includes: string[]; excludes?: string[]; note?: string } | null;
  answers: RatingAnswer[];
}

export interface RatingLevel {
  min: number;
  label: string;
  meaning: string;
  tone: "excellent" | "good" | "fair" | "low" | "risk";
}

export const RATING_LEVELS = master.levels as RatingLevel[];
export const RATING_CATEGORIES = master.categories;
export const RATING_QUESTIONS = master.questions as RatingQuestion[];
export const RATING_MAX = master.scale.max;

/* ---------------------------------------------------------------- จับคู่คำตอบ */

/** ป้ายคำตอบแบบเทียบได้ — ขีดทุกแบบเป็น `-` ช่องว่างซ้อนเป็นตัวเดียว ตัดเครื่องหมายคำพูด */
function norm(text: string): string {
  return text
    .replace(/[–—‑]/g, "-")
    .replace(/[“”"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function answerFor(question: RatingQuestion, label: string): RatingAnswer | undefined {
  const target = norm(label);
  return question.answers.find(
    (a) => norm(a.label) === target || a.aliases?.some((alias) => norm(alias) === target),
  );
}

/** ข้อในใบสมัครที่ตรงกับข้อ master นี้ — หาจากสำเนาคำถามของใบนั้นเอง */
function formQuestion(
  question: RatingQuestion,
  snapshot: QuestionSnapshot[],
): QuestionSnapshot | undefined {
  const rule = question.form;
  if (!rule) return undefined;
  const byKey = rule.keys && snapshot.find((q) => rule.keys!.includes(q.key));
  if (byKey) return byKey;
  return snapshot.find(
    (q) =>
      rule.includes.every((word) => q.label.includes(word)) &&
      !rule.excludes?.some((word) => q.label.includes(word)),
  );
}

/* -------------------------------------------------------------------- ผลลัพธ์ */

export interface RatedItem {
  no: number;
  question: RatingQuestion;
  /** `manual` = ฝ่ายบุคคลเลือก · `form` = จากคำตอบในใบสมัคร · `none` = ยังไม่มีคะแนน */
  source: "manual" | "form" | "none";
  /** คำตอบที่ผู้สมัครตอบในฟอร์ม (ข้อความตามจริง แม้จับคู่กับ master ไม่ได้) */
  formAnswer: string;
  answer: RatingAnswer | null;
}

export interface RatedCategory {
  id: string;
  label: string;
  items: RatedItem[];
  average: number | null;
  level: RatingLevel | null;
}

export interface RatingResult {
  categories: RatedCategory[];
  items: RatedItem[];
  average: number | null;
  level: RatingLevel | null;
  scored: number;
  count: number;
  total: number;
  /** เต็มกี่คะแนน — ทุกข้อ × 5 (100 เมื่อครบ 20 ข้อ) */
  max: number;
}

export function levelOf(average: number | null): RatingLevel | null {
  if (average === null) return null;
  return RATING_LEVELS.find((l) => average >= l.min) ?? RATING_LEVELS[RATING_LEVELS.length - 1];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * ให้คะแนนใบสมัครหนึ่งใบ — `manual` คือคำตอบที่ฝ่ายบุคคลเลือก (ร่างในกล่องหรือที่
 * บันทึกแล้ว) ทับคำตอบจากฟอร์มทีละข้อ
 */
export function rateApplication(input: {
  questionSnapshot: QuestionSnapshot[];
  answers: AnswerMap;
  manual: Record<string, string>;
}): RatingResult {
  const items: RatedItem[] = RATING_QUESTIONS.map((question, i) => {
    const fq = formQuestion(question, input.questionSnapshot);
    const raw = fq ? input.answers[fq.key] : undefined;
    const shown = fq ? displayAnswer(raw, fq.options) : "—";
    const formAnswer = shown === "—" ? "" : shown;

    const picked = input.manual[question.id];
    const manual = picked ? answerFor(question, picked) : undefined;
    if (manual) return { no: i + 1, question, source: "manual", formAnswer, answer: manual };

    /* multi → ทุกค่าที่ติ๊ก แปลงเป็นป้ายแล้วหยิบคะแนนต่ำสุด */
    const labels = (Array.isArray(raw) ? raw : raw ? [raw] : []).map((v) =>
      displayAnswer(v, fq?.options ?? []),
    );
    const matched = labels
      .map((label) => answerFor(question, label))
      .filter((a): a is RatingAnswer => Boolean(a))
      .sort((a, b) => a.score - b.score)[0];

    return matched
      ? { no: i + 1, question, source: "form", formAnswer, answer: matched }
      : { no: i + 1, question, source: "none", formAnswer, answer: null };
  });

  const categories: RatedCategory[] = RATING_CATEGORIES.map((c) => {
    const list = items.filter((it) => it.question.category === c.id);
    const average = mean(list.flatMap((it) => (it.answer ? [it.answer.score] : [])));
    return { id: c.id, label: c.label, items: list, average, level: levelOf(average) };
  });

  const average = mean(categories.flatMap((c) => (c.average === null ? [] : [c.average])));
  const scored = items.filter((it) => it.answer);

  return {
    categories,
    items,
    average,
    level: levelOf(average),
    scored: scored.length,
    count: items.length,
    total: scored.reduce((sum, it) => sum + it.answer!.score, 0),
    max: items.length * RATING_MAX,
  };
}

/** สรุปสำหรับตาราง — ตัวเดียวกับที่เซิร์ฟเวอร์ใส่ใน `ApplicationSummary.rating` */
export function summarizeRating(input: {
  questionSnapshot: QuestionSnapshot[];
  answers: AnswerMap;
  rating: RatingRecord;
}): RatingSummary {
  const r = rateApplication({ ...input, manual: input.rating.answers });
  return {
    average: r.average === null ? null : Math.round(r.average * 100) / 100,
    level: r.level?.label ?? "",
    scored: r.scored,
    count: r.count,
    total: r.total,
  };
}

/** `4.275` → `4.28` — ทศนิยมสองตำแหน่งแบบชีตของฝ่ายบุคคล */
export function formatScore(value: number | null): string {
  return value === null ? "—" : (Math.round(value * 100) / 100).toFixed(2);
}

/**
 * ตรวจคำตอบที่ส่งมาบันทึก — ฝั่งเซิร์ฟเวอร์ใช้ · คืนแผนที่ที่ผ่านแล้ว หรือโยนข้อความผิด
 * `null`/`""` = ลบคะแนนที่ให้เองของข้อนั้น (กลับไปใช้คำตอบจากฟอร์ม)
 */
export function mergeRatingAnswers(
  current: Record<string, string>,
  raw: unknown,
): { answers: Record<string, string>; changed: number } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("ผลประเมิน Driver Rating ที่ส่งมาไม่ถูกต้อง");
  }
  const answers = { ...current };
  let changed = 0;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const question = RATING_QUESTIONS.find((q) => q.id === id);
    if (!question) throw new Error(`ไม่พบข้อประเมิน “${id}”`);
    if (value === null || value === "") {
      if (id in answers) {
        delete answers[id];
        changed += 1;
      }
      continue;
    }
    const answer = typeof value === "string" ? answerFor(question, value) : undefined;
    if (!answer) throw new Error(`คำตอบของข้อ “${question.label}” ไม่อยู่ใน master`);
    if (answers[id] !== answer.label) {
      answers[id] = answer.label;
      changed += 1;
    }
  }
  return { answers, changed };
}
