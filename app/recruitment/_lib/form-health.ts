import { KEY_FULL_NAME, KEY_PHONE } from "./form";
import {
  QUESTION_SECTIONS,
  sectionTitle,
  type Question,
  type SectionId,
} from "./types";

/**
 * ตรวจสุขภาพของฟอร์ม — **ใช้ได้ทั้ง server และ client** (ไม่แตะฐานข้อมูล)
 *
 * ปัญหาที่ตรวจที่นี่คือปัญหาที่ **หน้าจอไม่มีทางบอกได้เอง** เพราะมันไม่ใช่ error
 * ตอนบันทึก แต่เป็นผลที่เกิดตอนผู้สมัครกรอกจริง เช่น คำถามที่ตั้งเงื่อนไขชี้ไปยัง
 * ข้อที่อยู่หลังตัวเอง — บันทึกผ่านฉลุย แต่ไม่มีวันโผล่ให้ใครเห็นสักครั้ง
 *
 * เคยหาเจอได้ทางเดียวคือมีคนสังเกตว่า “ทำไมไม่มีใครตอบข้อนี้เลย” หลังผ่านไป
 * หลายเดือน · ตัวตรวจนี้ทำให้เห็นตั้งแต่วินาทีที่ตั้งค่าผิด
 */

export type IssueLevel = "error" | "warn";

export interface FormIssue {
  level: IssueLevel;
  /** `id` ของคำถามที่เป็นต้นเหตุ — หน้าจอใช้ไฮไลต์แถวนั้น */
  questionId: string | null;
  title: string;
  detail: string;
}

/**
 * ลำดับของคำถามในฟอร์มจริง — หมวดตาม `QUESTION_SECTIONS` แล้วค่อย `order` ในหมวด
 *
 * นี่คือลำดับที่ `buildAnswers()` ฝั่งเซิร์ฟเวอร์เดินจริง เงื่อนไขจึงอ่านคำตอบของ
 * ข้อที่มาก่อนได้เท่านั้น
 */
function formIndex(questions: Question[]): Map<string, number> {
  const rank = new Map<SectionId, number>(
    QUESTION_SECTIONS.map((s, i) => [s.id, i]),
  );

  const ordered = [...questions].sort(
    (a, b) =>
      (rank.get(a.section) ?? 99) - (rank.get(b.section) ?? 99) || a.order - b.order,
  );

  return new Map(ordered.map((q, i) => [q.key, i] as const));
}

export function checkForm(questions: Question[]): FormIssue[] {
  const issues: FormIssue[] = [];
  const byKey = new Map(questions.map((q) => [q.key, q] as const));
  const index = formIndex(questions);
  const active = questions.filter((q) => q.active);

  /* ---------------------------------------------- คำถามหลักของระบบต้องอยู่ครบ */
  for (const [key, what] of [
    [KEY_FULL_NAME, "ชื่อผู้สมัคร"],
    [KEY_PHONE, "เบอร์ติดต่อ"],
  ] as const) {
    const question = byKey.get(key);
    if (!question) {
      issues.push({
        level: "error",
        questionId: null,
        title: `ไม่มีคำถาม ${key}`,
        detail: `ตารางผู้สมัครใช้ค่านี้เป็น${what} — ใบสมัครใหม่จะถูกปฏิเสธทั้งหมดจนกว่าจะมีคำถามนี้`,
      });
    } else if (!question.active) {
      issues.push({
        level: "error",
        questionId: question.id,
        title: `“${question.label}” ถูกปิดใช้`,
        detail: `เป็นคำถามหลักของระบบ ต้องเปิดใช้เสมอ ไม่งั้นใบสมัครจะไม่มี${what}`,
      });
    }
  }

  /* -------------------------------------------------------- เงื่อนไขการแสดงผล */
  for (const question of active) {
    const cond = question.condition;
    if (!cond) continue;

    const source = byKey.get(cond.key);

    if (!source) {
      issues.push({
        level: "error",
        questionId: question.id,
        title: `“${question.label}” ไม่มีวันแสดง`,
        detail: `ตั้งเงื่อนไขไว้กับข้อ ${cond.key} ซึ่งถูกลบไปแล้ว — ลบเงื่อนไขออกหรือชี้ไปข้ออื่น`,
      });
      continue;
    }

    if (!source.active) {
      issues.push({
        level: "error",
        questionId: question.id,
        title: `“${question.label}” ไม่มีวันแสดง`,
        detail: `ขึ้นกับคำตอบของ “${source.label}” ซึ่งถูกปิดใช้อยู่ — ผู้สมัครจึงไม่มีทางตอบข้อนั้นได้`,
      });
      continue;
    }

    /* ต้นทางต้องมาก่อนในลำดับฟอร์ม ไม่งั้นตอนประเมินเงื่อนไขยังไม่มีคำตอบให้อ่าน
       (ดู `buildAnswers()` ใน `applications.ts` ที่เดินทีละหมวดตามลำดับจริง) */
    const here = index.get(question.key) ?? 0;
    const there = index.get(source.key) ?? 0;
    if (there >= here) {
      issues.push({
        level: "error",
        questionId: question.id,
        title: `“${question.label}” ไม่มีวันแสดง`,
        detail:
          source.section === question.section
            ? `ขึ้นกับ “${source.label}” ซึ่งอยู่ถัดลงไปใน Section เดียวกัน — เลื่อน “${source.label}” ขึ้นไปไว้ก่อนข้อนี้`
            : `ขึ้นกับ “${source.label}” ซึ่งอยู่ใน Section “${sectionTitle(source.section)}” ที่มาทีหลัง — เงื่อนไขต้องชี้ไปข้อที่ผู้สมัครตอบไปแล้วเท่านั้น`,
      });
      continue;
    }

    const values = new Set(source.options.map((o) => o.value));
    const gone = cond.equals.filter((v) => !values.has(v));
    if (gone.length) {
      issues.push({
        level: gone.length === cond.equals.length ? "error" : "warn",
        questionId: question.id,
        title:
          gone.length === cond.equals.length
            ? `“${question.label}” ไม่มีวันแสดง`
            : `“${question.label}” มีเงื่อนไขที่ตายแล้วบางส่วน`,
        detail: `เงื่อนไขอ้างตัวเลือก ${gone.join(" · ")} ของ “${source.label}” ซึ่งถูกลบไปแล้ว`,
      });
    }
  }

  /* ------------------------------------------------------- หมวดที่ไม่มีคำถาม */
  for (const section of QUESTION_SECTIONS) {
    if (!active.some((q) => q.section === section.id)) {
      issues.push({
        level: "warn",
        questionId: null,
        title: `Section “${section.title}” ไม่มีคำถามที่เปิดใช้`,
        detail: "ผู้สมัครจะเห็นหน้าจอเปล่าหนึ่งหน้าแล้วกดถัดไป — ควรมีอย่างน้อยหนึ่งข้อ",
      });
    }
  }

  /* ----------------------------------------------- คำถามเลือกตอบที่ไม่มีตัวเลือก */
  for (const question of active) {
    if (question.kind !== "single" && question.kind !== "multi") continue;
    if (question.options.length >= 2) continue;
    issues.push({
      level: "error",
      questionId: question.id,
      title: `“${question.label}” ไม่มีตัวเลือกให้เลือก`,
      detail: `คำถามแบบเลือกตอบต้องมีอย่างน้อย 2 ตัวเลือก ตอนนี้มี ${question.options.length}`,
    });
  }

  /* ------------------------------------------------ ข้อความคำถามซ้ำในหมวดเดียว */
  const seen = new Map<string, Question>();
  for (const question of active) {
    const signature = `${question.section}::${question.label.trim()}`;
    const first = seen.get(signature);
    if (first) {
      issues.push({
        level: "warn",
        questionId: question.id,
        title: `ข้อความคำถามซ้ำกับข้ออื่น`,
        detail: `“${question.label}” มีสองข้อใน Section เดียวกัน (${first.key} และ ${question.key}) ผู้สมัครจะสับสนว่าต้องตอบอะไรต่างกัน`,
      });
    } else {
      seen.set(signature, question);
    }
  }

  // error ขึ้นก่อน warn เสมอ — คนอ่านรายการนี้ต้องการรู้ว่าอะไรพังก่อนอะไรควรปรับ
  return issues.sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
}

/** คำถามที่ “ไม่มีวันแสดง” — หน้าจอเอาไปขึ้นป้ายเตือนที่แถวนั้นโดยตรง */
export function unreachableIds(issues: FormIssue[]): Set<string> {
  return new Set(
    issues
      .filter((i) => i.level === "error" && i.questionId && i.title.includes("ไม่มีวันแสดง"))
      .map((i) => i.questionId as string),
  );
}
