import { getDb } from "./mongo";
import { DEFAULT_SURVEY_ID, type SurveyResponse } from "./survey-forms";

/**
 * ชั้นข้อมูลของ “แบบสอบถาม” — **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 * (ทะเบียนแบบฟอร์ม/ชุดคำถามอยู่ที่ `lib/survey-forms.ts` ซึ่ง client อ่านได้ —
 * ห้าม import ไฟล์นี้จาก client component เพราะมี driver ของ MongoDB ติดมา)
 *
 * คำตอบถูกเขียนเข้ามาจาก ncacdb (`POST /newyear-survey/`) ซึ่งเป็นตัวรับจากแอป
 * พจส. `mena-go-lb` — ที่นี่อ่านอย่างเดียว ไม่มีการแก้ไข
 *
 * | คอลเลกชัน | เก็บอะไร |
 * |---|---|
 * | `newyear-survey` | หนึ่งเอกสารต่อ พจส. หนึ่งคน (ตอบซ้ำ = ทับของเดิม) |
 *
 * เอกสารมีคำตอบสองชุด: `answers` (คำถามเป็น key อ่านง่าย) กับ `answers_detail`
 * (โครงเดิมพร้อม `id`) — **อ่านจาก `answers_detail` เท่านั้น** เพราะจับคู่ด้วย
 * `q1..q20` ที่คงที่ ไม่พังเวลา HR แก้ข้อความคำถาม
 */

const COLLECTION = "newyear-survey";

/** จำนวนที่ดึงมาแสดง — กรอง/เรียง/สรุปทำฝั่ง client บนชุดนี้ */
const LIST_LIMIT = 2000;

/* ------------------------------------------------------------------ รูปในฐานข้อมูล */

interface AnswerDetailDoc {
  id?: string;
  question?: string;
  type?: string;
  value?: unknown;
  ranked?: string[] | null;
  other?: string | null;
}

interface SurveyDoc {
  survey_id?: string;
  drivercode?: string;
  driver_name?: string | null;
  truckplate?: string | null;
  plant?: string | null;
  customer?: string | null;
  /**
   * ncacdb เติมสองฟิลด์นี้จาก `masterdrivers` ตอนอ่าน — เอกสารที่ส่งมาจากแอป พจส.
   * มักได้ `plant`/`customer` เป็น `null` เพราะโปรไฟล์ในเครื่องคนขับไม่มีค่านั้น
   * จึงต้องอ่านสำรอง ไม่งั้นคอลัมน์แพล้นท์บนแดชบอร์ดจะเป็น “—” ทั้งที่รู้อยู่ว่าใครอยู่ไหน
   */
  plant_name?: string | null;
  client_name?: string | null;
  attending?: boolean | null;
  answers_detail?: AnswerDetailDoc[] | null;
  submitted_at?: Date | string | null;
  duration_seconds?: number | null;
}

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v);
}

function iso(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * ยุบคำตอบหนึ่งข้อให้เป็น array ของข้อความ
 *
 * ช่อง “อื่นๆ (โปรดระบุ)” ถูกต่อท้ายตัวเลือกที่มีคำว่า “อื่น” — ถ้าไม่เจอตัวเลือกนั้น
 * (เช่น HR แก้ข้อความ) จะต่อเป็นรายการแยกแทน ดีกว่าทำข้อความที่ผู้ใช้พิมพ์หาย
 */
function toAnswerList(item: AnswerDetailDoc): string[] {
  const other = text(item.other);

  if (item.type === "rank") {
    if (Array.isArray(item.ranked) && item.ranked.length) return item.ranked.map(text);
    const ranks = (item.value ?? {}) as Record<string, number>;
    return Object.entries(ranks)
      .sort((a, b) => a[1] - b[1])
      .map(([label]) => label);
  }

  if (item.type === "checkbox") {
    const list = Array.isArray(item.value) ? item.value.map(text) : [];
    if (!other) return list;
    const i = list.findIndex((v) => v.includes("อื่น"));
    if (i < 0) return [...list, other];
    return list.map((v, n) => (n === i ? `${v}: ${other}` : v));
  }

  const value = text(item.value);
  if (!value) return other ? [other] : [];
  return [other ? `${value}: ${other}` : value];
}

function toResponse(doc: SurveyDoc): SurveyResponse {
  const answers: Record<string, string[]> = {};
  for (const item of doc.answers_detail ?? []) {
    const id = text(item.id);
    if (!id) continue;
    answers[id] = toAnswerList(item);
  }

  return {
    drivercode: text(doc.drivercode),
    driverName: text(doc.driver_name),
    plant: text(doc.plant) || text(doc.plant_name),
    customer: text(doc.customer) || text(doc.client_name),
    truckplate: text(doc.truckplate),
    attending: typeof doc.attending === "boolean" ? doc.attending : null,
    submittedAt: iso(doc.submitted_at),
    durationSeconds: typeof doc.duration_seconds === "number" ? doc.duration_seconds : null,
    answers,
  };
}

/* ------------------------------------------------------------------ อ่านข้อมูล */

/** คำตอบทั้งหมดของแบบฟอร์มหนึ่งชุด — ใหม่ก่อนเก่า */
export async function listSurveyResponses(
  surveyId: string = DEFAULT_SURVEY_ID,
): Promise<SurveyResponse[]> {
  const db = await getDb();
  const docs = await db
    .collection<SurveyDoc>(COLLECTION)
    .find({ survey_id: surveyId })
    .sort({ submitted_at: -1 })
    .limit(LIST_LIMIT)
    .toArray();

  return docs.map(toResponse).filter((r) => r.drivercode);
}
