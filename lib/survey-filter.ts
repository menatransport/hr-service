import {
  SURVEY_QUESTIONS,
  type QuestionKind,
  type SurveyResponse,
} from "./survey-forms";

/**
 * นิยามคอลัมน์ + ตัวกรองของตารางแบบสอบถาม — **ใช้ร่วมกันทั้งหน้าจอและเส้นส่งออก**
 *
 * ท่าเดียวกับ `lib/case-filter.ts`: ตารางกรองฝั่ง client ด้วยกฎชุดนี้ แล้วเส้น
 * `/api/survey/export` อ่านข้อมูลสดมากรองใหม่ด้วยกฎชุดเดียวกัน ไฟล์ที่ได้จึงตรงกับ
 * สิ่งที่เห็นบนจอเสมอ โดยไม่ต้องให้หน้าจอส่งแถวข้อมูลกลับขึ้นไป
 *
 * `render` (JSX ในเซลล์) ไม่ได้อยู่ที่นี่ — อยู่ใน `survey-table.tsx` เพราะไฟล์นี้
 * ต้อง import ได้จากฝั่งเซิร์ฟเวอร์ด้วย
 */

export interface SurveyColumn {
  key: string;
  label: string;
  /** ค่าที่ใช้แสดง/กรอง/เรียง — คืน array เพื่อให้ข้อที่ตอบหลายค่ากรองได้ทุกค่า */
  values: (r: SurveyResponse) => string[];
  /** เรียงด้วยค่าอื่น เช่นวันที่เรียงด้วย timestamp ไม่ใช่ข้อความไทย */
  sortValue?: (r: SurveyResponse) => string | number;
  width?: string;
  /** ไม่มีตัวกรอง (ค่าไม่ซ้ำกันเลย กรองไปก็ไม่ช่วย) — เมนูจะเหลือแค่การเรียง */
  noFilter?: boolean;
  /** ป้ายบนปุ่มเรียง — วันที่ใช้ “ใหม่→เก่า” อ่านง่ายกว่า “ก→ฮ” */
  sortLabels?: { asc: string; desc: string };
  /** คำถามต้นทาง (ถ้ามี) — ใช้เลือกวิธีวาดเซลล์ */
  questionId?: string;
  kind?: QuestionKind;
}

/* ------------------------------------------------------------------ วันที่ */

const TH_MONTHS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

/**
 * `28 ส.ค. 69` ตามเวลาไทย
 *
 * เขียนเองแทน `Intl.DateTimeFormat("th-TH")` เพราะค่านี้ถูกใช้เป็น **ค่าตัวกรอง** —
 * ถ้า Node กับเบราว์เซอร์จัดรูปแบบต่างกันแม้ตัวเดียว ตัวกรองที่ติ๊กบนจอจะไม่ตรงกับ
 * ที่เซิร์ฟเวอร์กรองตอนส่งออก แล้วไฟล์จะว่างโดยไม่มีใครรู้สาเหตุ
 */
export function bangkokDateLabel(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getUTCDate()} ${TH_MONTHS[d.getUTCMonth()]} ${String((d.getUTCFullYear() + 543) % 100).padStart(2, "0")}`;
}

/** `15:41` ตามเวลาไทย */
export function bangkokTimeLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export const attendingLabel = (r: SurveyResponse): string =>
  r.attending === null ? "—" : r.attending ? "มา" : "ไม่สะดวก";

/* ------------------------------------------------------------------ คอลัมน์ */

/** คำถามที่ยกไปดูในหน้าวิเคราะห์แทน — ตัวเลือกหลายค่า อ่านในตารางไม่รู้เรื่อง */
export const CHART_ONLY = new Set(["q13", "q14", "q15"]);

/**
 * คอลัมน์แรกที่ตรึงซ้าย — รหัส พจส. + ชื่อในเซลล์เดียว
 * แยกจาก `SURVEY_COLUMNS` เพราะวาดเป็น `<th scope="row">` ไม่ใช่ `<td>` แต่ต้องอยู่ใน
 * ทะเบียนเดียวกันเพื่อให้เรียงได้เหมือนคอลัมน์อื่น
 */
export const IDENTITY_COLUMN: SurveyColumn = {
  key: "drivercode",
  label: "พจส.",
  values: (r) => [r.drivercode],
  sortValue: (r) => r.drivercode,
  noFilter: true,
};

export const SURVEY_COLUMNS: SurveyColumn[] = [
  {
    key: "submittedAt",
    label: "ส่งเมื่อ",
    width: "132px",
    values: (r) => [bangkokDateLabel(r.submittedAt)],
    sortValue: (r) => (r.submittedAt ? new Date(r.submittedAt).getTime() : 0),
    sortLabels: { asc: "เรียง เก่า → ใหม่", desc: "เรียง ใหม่ → เก่า" },
  },
  { key: "plant", label: "แพล้นท์", width: "120px", values: (r) => [r.plant || "—"] },
  {
    key: "attending",
    label: "มาร่วมงาน",
    width: "112px",
    values: (r) => [attendingLabel(r)],
  },
  ...SURVEY_QUESTIONS.filter((q) => !CHART_ONLY.has(q.id)).map<SurveyColumn>((q) => ({
    key: q.id,
    label: q.short,
    questionId: q.id,
    kind: q.kind,
    width: q.kind === "text" ? "260px" : q.kind === "rank" ? "190px" : "170px",
    noFilter: q.kind === "text",
    values: (r) => {
      const list = r.answers[q.id] ?? [];
      if (!list.length) return ["—"];
      // อันดับความสำคัญ: กรอง/เรียงด้วย “อันดับ 1” พอ ไม่ต้องเอาทั้ง 5 ตัว
      return q.kind === "rank" ? [list[0]] : list;
    },
  })),
];

export const COLUMN_BY_KEY = new Map(
  [IDENTITY_COLUMN, ...SURVEY_COLUMNS].map((c) => [c.key, c]),
);

/* ------------------------------------------------------------------ ตัวกรอง */

export interface SurveyFilters {
  query: string;
  /** คอลัมน์ → ค่าที่ติ๊กไว้ · ไม่มี key = ไม่กรองคอลัมน์นั้น */
  picked: Record<string, string[]>;
}

export const EMPTY_SURVEY_FILTERS: SurveyFilters = { query: "", picked: {} };

export function hasSurveyFilters(f: SurveyFilters): boolean {
  return f.query.trim().length > 0 || Object.values(f.picked).some((v) => v.length > 0);
}

export function matchesSurveyFilters(r: SurveyResponse, f: SurveyFilters): boolean {
  const q = f.query.trim().toLowerCase();
  if (q) {
    const hay = [r.drivercode, r.driverName, r.plant, r.truckplate]
      .concat(Object.values(r.answers).flat())
      .join(" ")
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }

  for (const [key, picked] of Object.entries(f.picked)) {
    if (!picked.length) continue;
    const col = COLUMN_BY_KEY.get(key);
    if (!col) continue;
    if (!col.values(r).some((v) => picked.includes(v))) return false;
  }

  return true;
}

export function filterSurveyResponses(
  rows: SurveyResponse[],
  f: SurveyFilters,
): SurveyResponse[] {
  return rows.filter((r) => matchesSurveyFilters(r, f));
}

/* ------------------------------------------------------------------ query string */

const FILTER_PREFIX = "f.";

export function surveyFiltersToParams(f: SurveyFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (f.query.trim()) params.set("q", f.query.trim());
  for (const [key, picked] of Object.entries(f.picked)) {
    for (const value of picked) params.append(`${FILTER_PREFIX}${key}`, value);
  }
  return params;
}

export function surveyFiltersFromParams(params: URLSearchParams): SurveyFilters {
  const picked: Record<string, string[]> = {};
  for (const [rawKey, value] of params.entries()) {
    if (!rawKey.startsWith(FILTER_PREFIX)) continue;
    const key = rawKey.slice(FILTER_PREFIX.length);
    if (!COLUMN_BY_KEY.has(key)) continue; // คีย์มั่ว = ไม่กรอง ดีกว่าคืนไฟล์ว่าง
    (picked[key] ??= []).push(value);
  }
  return { query: params.get("q") ?? "", picked };
}

/** ข้อความบอกเงื่อนไขที่กรอง — ใช้ในชีตสรุปของไฟล์ Excel */
export function describeSurveyFilters(f: SurveyFilters): string {
  if (!hasSurveyFilters(f)) return "ทั้งหมด (ไม่ได้กรอง)";

  const parts: string[] = [];
  if (f.query.trim()) parts.push(`คำค้น: “${f.query.trim()}”`);
  for (const [key, picked] of Object.entries(f.picked)) {
    if (!picked.length) continue;
    const label = COLUMN_BY_KEY.get(key)?.label ?? key;
    parts.push(`${label}: ${picked.join(", ")}`);
  }
  return parts.join(" · ");
}
