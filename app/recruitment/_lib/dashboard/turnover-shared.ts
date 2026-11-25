/**
 * TurnOver — แดชบอร์ดวิเคราะห์การลาออก พจส. **ใช้ได้ทั้ง server และ client**
 *
 * แทนชีต “Dashboard” ของ `Reason Code_Final (1).xlsx` (HR ส่วนกลาง) — ตัวเลขทุกตัวคิดจากแหล่งเดียวกับ
 * แท็บพ้นสภาพของทะเบียน: `master_driver.resignation` (รหัส/ประเภท/ควบคุมได้/เจ้าของ) + `driver_exit_interview`
 * · หนึ่งแถว = การพ้นสภาพหนึ่งครั้ง แบบ `resign` (ไม่นับย้ายไปรถร่วม/พจส.) · ไม่มีชื่อ/เบอร์/รหัสพนักงาน
 * · คำตอบสัมภาษณ์ (`answers`) ส่งมาเฉพาะผู้มีสิทธิ์ `exit-interview`
 *
 * นิยาม (ตามชีต): Coverage = สัมภาษณ์ได้ ÷ ลาออกทั้งหมด (เป้า ≥ 70%) · % ควบคุมได้ = (ควบคุมได้ + บางส่วน) ÷ ลาออกทั้งหมด
 * · พนักงานใหม่ = เริ่มงานปีเดียวกับปีที่ออก · ออกเร็ว = อายุงาน ≤ 90 วัน
 */

import type { InterviewStage, JobMatch, YesNoUnsure } from "@/app/recruitment/_lib/exit-interview/types";
import type { Controllable, ExitType } from "@/app/recruitment/_lib/resign-reasons/types";
import type { RecruitSite } from "@/app/recruitment/_lib/sites";

/** กลุ่มงานของชีต (Mixer L · Mixer S · Trailer TDM · Trailer ปูนผง · Feedmill · Coldchain) ในชื่อเดียวกับแท็บ Manpower */
export const TO_GROUPS = ["Mixer L", "Mixer S", "Trailer ตู้", "Trailer ปูนผง", "Feed mill", "Cold Chain", "อื่น ๆ"] as const;
export type ToGroup = (typeof TO_GROUPS)[number];

export const COVERAGE_TARGET = 0.7;
export const EARLY_DAYS = 90;

export const TENURE_BANDS = ["0-10 วัน", "11-30 วัน", "31-90 วัน", "91-180 วัน", "181-365 วัน", "เกิน 1 ปี"] as const;

export interface ToAnswers {
  /** Q4 ถ้าแก้ 1 เรื่องจะอยู่ต่อไหม */
  stay: YesNoUnsure;
  /** Q4.1 เรื่องที่อยากให้แก้ */
  topic: string;
  /** Q8 คะแนนหัวหน้า 1–5 */
  score: number | null;
  /** Q6 งานจริงตรงกับที่บอกตอนสัมภาษณ์ไหม */
  match: JobMatch;
  /** Q9 / Q9.1 รายได้ต่อเดือน (บาท) ที่อ่านออกจากคำตอบ */
  income: number | null;
  newIncome: number | null;
}

export interface ToRow {
  /** `YYYY-MM` ของวันที่พ้นสภาพ */
  month: string;
  site: RecruitSite;
  group: ToGroup;
  customer: string;
  plant: string;
  zone: string;
  rcOwner: string;
  channel: string;
  tenure: number | null;
  band: string;
  /** เริ่มงานปีเดียวกับปีที่ออก */
  newHire: boolean;
  exitType: ExitType | "";
  reason: string;
  /** อักษรหมวดของรหัส (P · J · L · E · O · C · F · X · N) */
  category: string;
  controllable: Controllable | "";
  owner: string;
  stage: InterviewStage;
  answers?: ToAnswers;
}

export interface ToReasonInfo {
  code: string;
  label: string;
  owner: string;
  controllable: Controllable | "";
}

export interface ToBoard {
  rows: ToRow[];
  categories: { prefix: string; label: string }[];
  reasons: ToReasonInfo[];
  /** มีคำตอบสัมภาษณ์มาด้วย (สิทธิ์ `exit-interview`) */
  withAnswers: boolean;
  readAt: string;
}

/* ------------------------------------------------------------------ ป้าย */

export const EXIT_TYPE_SHORT: Record<ExitType, string> = { vol: "สมัครใจ", inv: "บริษัทให้ออก", disap: "หายไปไม่แจ้ง" };

/** ควบคุมได้? 4 ช่อง + ยังไม่ระบุ — ลำดับ = ลำดับสีในกราฟ */
export const CTL_KEYS = ["yes", "partial", "no", "na"] as const;
export type CtlKey = (typeof CTL_KEYS)[number];
export const CTL_LABEL: Record<CtlKey, string> = {
  yes: "ควบคุมได้",
  partial: "ควบคุมได้บางส่วน",
  no: "ควบคุมไม่ได้",
  na: "ไม่ได้ข้อมูล / ไม่ระบุ",
};
export const ctlOf = (r: Pick<ToRow, "controllable">): CtlKey =>
  r.controllable === "yes" || r.controllable === "partial" || r.controllable === "no" ? r.controllable : "na";

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** `2026-01` → `ม.ค. 69` */
export function monthLabel(key: string, withYear = true): string {
  const [y, m] = key.split("-").map(Number);
  const name = TH_MONTHS[(m ?? 1) - 1] ?? key;
  return withYear ? `${name} ${String((y ?? 0) + 543).slice(-2)}` : name;
}

/* ------------------------------------------------------------------ คิดเลข */

export const isInterviewed = (r: Pick<ToRow, "stage">) =>
  r.stage === "wave1" || r.stage === "wave2_due" || r.stage === "wave2_late" || r.stage === "done";
export const isControlled = (r: Pick<ToRow, "controllable">) => r.controllable === "yes" || r.controllable === "partial";

export function ratio(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}
export const pct = (a: number, b: number, digits = 0) => {
  const r = ratio(a, b);
  return r == null ? "–" : `${(r * 100).toFixed(digits)}%`;
};
export const fmt = (n: number) => n.toLocaleString("th-TH");

function avg(values: number[]): number | null {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

/** ค่าฐานนิยม + จำนวนครั้ง (เสมอกัน = ค่าน้อยกว่า) */
function mode(values: number[]): { value: number; times: number } | null {
  const m = new Map<number, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  let best: { value: number; times: number } | null = null;
  for (const [value, times] of m) if (!best || times > best.times || (times === best.times && value < best.value)) best = { value, times };
  return best;
}

export interface ToSummary {
  total: number;
  interviewed: number;
  noData: number;
  pending: number;
  coverage: number | null;
  controlled: number;
  ctl: Record<CtlKey, number>;
  exitType: Record<ExitType, number>;
  newHire: number;
  oldHire: number;
  early: number;
  avgTenure: number | null;
  avgUnderYear: number | null;
  avgOverYear: number | null;
  mode: { value: number; times: number } | null;
}

export function summarize(rows: readonly ToRow[]): ToSummary {
  const ctl: Record<CtlKey, number> = { yes: 0, partial: 0, no: 0, na: 0 };
  const exitType: Record<ExitType, number> = { vol: 0, inv: 0, disap: 0 };
  let interviewed = 0;
  let noData = 0;
  let newHire = 0;
  let early = 0;
  const tenures: number[] = [];
  for (const r of rows) {
    ctl[ctlOf(r)]++;
    if (r.exitType) exitType[r.exitType]++;
    if (isInterviewed(r)) interviewed++;
    else if (r.stage === "no_data") noData++;
    if (r.newHire) newHire++;
    if (r.tenure != null) {
      tenures.push(r.tenure);
      if (r.tenure <= EARLY_DAYS) early++;
    }
  }
  return {
    total: rows.length,
    interviewed,
    noData,
    pending: rows.length - interviewed - noData,
    coverage: ratio(interviewed, rows.length),
    controlled: ctl.yes + ctl.partial,
    ctl,
    exitType,
    newHire,
    oldHire: rows.length - newHire,
    early,
    avgTenure: avg(tenures),
    avgUnderYear: avg(tenures.filter((t) => t <= 365)),
    avgOverYear: avg(tenures.filter((t) => t > 365)),
    mode: mode(tenures),
  };
}

/** อายุงานเป็นคำ — `277` → `9 เดือน` · `1014` → `2 ปี 9 เดือน` · `14` → `14 วัน` */
export function tenureText(days: number | null): string {
  if (days == null) return "–";
  const d = Math.round(days);
  if (d < 60) return `${fmt(d)} วัน`;
  const months = Math.round(d / 30.44);
  if (months < 12) return `${months} เดือน`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m ? `${y} ปี ${m} เดือน` : `${y} ปี`;
}

/* ------------------------------------------------------------- ตารางแยกมิติ */

export const BREAKDOWNS = [
  { value: "group", label: "กลุ่มงาน" },
  { value: "customer", label: "ลูกค้า" },
  { value: "zone", label: "ST Zone" },
  { value: "rcOwner", label: "RC" },
  { value: "channel", label: "ช่องทางสรรหา" },
] as const;
export type Breakdown = (typeof BREAKDOWNS)[number]["value"];

export interface BreakdownRow {
  key: string;
  total: number;
  early: number;
  controlled: number;
  coverage: number | null;
  avgTenure: number | null;
  months: number[];
}

/** แถวต่อมิติ (เรียงมาก → น้อย) · `months` = จำนวนต่อเดือนตาม `monthKeys` · ค่าว่าง = “ไม่ระบุ” */
export function breakdown(rows: readonly ToRow[], by: Breakdown, monthKeys: readonly string[]): BreakdownRow[] {
  const groups = new Map<string, ToRow[]>();
  for (const r of rows) {
    const k = r[by] || "ไม่ระบุ";
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const order = by === "group" ? (k: string) => (TO_GROUPS as readonly string[]).indexOf(k) : null;
  return [...groups.entries()]
    .map(([key, rs]) => {
      const s = summarize(rs);
      return {
        key,
        total: s.total,
        early: s.early,
        controlled: s.controlled,
        coverage: s.coverage,
        avgTenure: s.avgTenure,
        months: monthKeys.map((m) => rs.filter((r) => r.month === m).length),
      };
    })
    .sort((a, b) => (order ? order(a.key) - order(b.key) : b.total - a.total || a.key.localeCompare(b.key, "th")));
}

/* ------------------------------------------------------------ รหัสสาเหตุ */

export interface ReasonStat {
  code: string;
  label: string;
  owner: string;
  controllable: Controllable | "";
  count: number;
  avgTenure: number | null;
  /** จำนวนต่อกลุ่มงาน (ตาม `TO_GROUPS`) */
  byGroup: number[];
}

/** สถิติรายรหัส — รหัสที่ไม่มีใน master ใช้ป้ายว่าง (เช่น `XLS` ของระเบียนเก่าที่ยังไม่ได้ระบุ) */
export function reasonStats(rows: readonly ToRow[], reasons: readonly ToReasonInfo[]): ReasonStat[] {
  const info = new Map(reasons.map((r) => [r.code, r]));
  const by = new Map<string, ToRow[]>();
  for (const r of rows) by.set(r.reason, [...(by.get(r.reason) ?? []), r]);
  return [...by.entries()]
    .map(([code, rs]) => {
      const m = info.get(code);
      return {
        code,
        label: m?.label ?? (code === "XLS" ? "ยังไม่ระบุรหัส (นำเข้าจากทะเบียนเดิม)" : ""),
        owner: m?.owner ?? "",
        controllable: m?.controllable ?? rs[0]?.controllable ?? "",
        count: rs.length,
        avgTenure: summarize(rs).avgTenure,
        byGroup: TO_GROUPS.map((g) => rs.filter((r) => r.group === g).length),
      };
    })
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code, "en", { numeric: true }));
}

/**
 * เจ้าของการแก้ไขของเคสที่ควบคุมได้ — แยก `Safety + จัดส่ง + OPS` เป็นรายฝ่าย (เคสเดียวนับให้ทุกฝ่ายที่ร่วม)
 * · `-` / ว่าง ไม่นับ
 */
export function ownerStats(rows: readonly ToRow[]): { owner: string; count: number; yes: number; partial: number }[] {
  const m = new Map<string, { yes: number; partial: number }>();
  for (const r of rows) {
    if (!isControlled(r)) continue;
    for (const raw of r.owner.split("+")) {
      const o = raw.trim();
      if (!o || o === "-") continue;
      const cur = m.get(o) ?? { yes: 0, partial: 0 };
      if (r.controllable === "yes") cur.yes++;
      else cur.partial++;
      m.set(o, cur);
    }
  }
  return [...m.entries()].map(([owner, v]) => ({ owner, count: v.yes + v.partial, ...v })).sort((a, b) => b.count - a.count);
}

/* ------------------------------------------------------------ เสียงจากสัมภาษณ์ */

export interface VoiceSummary {
  answered: number;
  stay: number;
  stayUnsure: number;
  topics: { topic: string; count: number }[];
  score: number | null;
  scored: number;
  match: number;
  matchAsked: number;
  incomeGap: number | null;
  incomePairs: number;
}

/** สรุปคำตอบ Wave 1 (ส่วน C ของชีต) — เฉพาะแถวที่มี `answers` */
export function voiceOf(rows: readonly ToRow[]): VoiceSummary {
  const a = rows.filter((r) => r.answers && isInterviewed(r)).map((r) => r.answers!);
  const topics = new Map<string, number>();
  for (const x of a) {
    const t = x.stay === "yes" ? x.topic.trim() : "";
    if (t && t !== "-") topics.set(t, (topics.get(t) ?? 0) + 1);
  }
  const scores = a.map((x) => x.score).filter((s): s is number => s != null);
  const asked = a.filter((x) => x.match);
  const pairs = a.filter((x) => x.income != null && x.newIncome != null);
  return {
    answered: a.length,
    stay: a.filter((x) => x.stay === "yes").length,
    stayUnsure: a.filter((x) => x.stay === "unsure").length,
    topics: [...topics.entries()].map(([topic, count]) => ({ topic, count })).sort((x, y) => y.count - x.count),
    score: avg(scores),
    scored: scores.length,
    match: asked.filter((x) => x.match === "match").length,
    matchAsked: asked.length,
    incomeGap: avg(pairs.map((x) => x.newIncome! - x.income!)),
    incomePairs: pairs.length,
  };
}
