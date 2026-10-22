/**
 * พนักงานใหม่ — ขั้นตอน/ข้อมูลของแต่ละฝ่ายหลังได้คนมารับอัตรา
 * (ชนิด ค่าคงที่ ป้าย และกฎ — **ใช้ได้ทั้ง server และ client** ห้าม import ฐานข้อมูล)
 *
 * ที่มา: ไฟล์ `Onboarding_Mixer_Drivers_2026_Redesigned.xlsx` (ชีต “พนักงานใหม่” + “Work Flow”)
 * — คำศัพท์และตัวเลือก**ลอกจากไฟล์นั้น** ห้ามตั้งคำใหม่เอง
 *
 * **ภาพเดียว** (ตัดสินใจ 14 ต.ค. 2026): คำขอสรรหา 1 ใบ = 1 อัตรา = 1 คน เป็นแถวเดียวตลอดเส้นทาง
 * · **ขั้น (`Stage`) ระบบคิดเอง** จากคำขอ + ใบสมัคร + ข้อมูลฝ่าย + ATMS (`stageOf()`) ไม่มีใครเลือก
 * · คนเลือกเองเฉพาะ “ผลสิ้นสุด” (สละสิทธิ์/ลาออก/ปลด…) · **ยานยนต์ไม่มีฟอร์ม** — ขั้นรถพร้อมอ่าน
 * จากบอร์ดซ่อม (`repair-status.ts`) · เก็บที่ `recruitment_requests.onboarding.<section>`
 */
import { todayInBangkok } from "@/lib/record-case-flow";
import type { RepairStatus } from "./repair-status";
import type { Requisition } from "./types";

/* ------------------------------------------------------------ ผลสิ้นสุด */

export type OutcomeGroup = "active" | "success" | "withdrawn" | "lost";

/**
 * สถานะ พจส. ตามไฟล์ (คอลัมน์ L) — เซิร์ฟเวอร์รับทุกตัว (ข้อมูลนำเข้าใช้ครบ) แต่ฟอร์มให้เลือก
 * เฉพาะ `END_OUTCOMES` · ตัวที่บอกความคืบหน้า (รอฝึก/ฝึกงาน/รอรับรถ) ระบบคิดเองจากขั้น
 */
export const OUTCOMES = [
  { value: "waiting_training", label: "รอฝึกงาน", group: "active" },
  { value: "training", label: "ฝึกงาน", group: "active" },
  { value: "waiting_handover", label: "รอรับรถ", group: "active" },
  { value: "spare_zone", label: "สแปร์โซน", group: "active" },
  { value: "handed_over", label: "รับรถแล้ว", group: "success" },
  { value: "cancelled_training", label: "ยกเลิกฝึกงาน", group: "withdrawn" },
  { value: "waived", label: "สละสิทธิ์", group: "withdrawn" },
  { value: "cancelled_recruit", label: "ยกเลิกสรรหา", group: "withdrawn" },
  { value: "resigned", label: "ลาออก", group: "lost" },
  { value: "trial_exit", label: "ฝึกงาน 1-2 วัน (พ้นสภาพ)", group: "lost" },
  { value: "dismissed", label: "ปลด", group: "lost" },
  { value: "left", label: "ออก", group: "lost" },
] as const satisfies readonly { value: string; label: string; group: OutcomeGroup }[];

export type Outcome = (typeof OUTCOMES)[number]["value"];

export const END_OUTCOMES = OUTCOMES.filter((o) => o.group === "withdrawn" || o.group === "lost");

export function isOutcome(v: unknown): v is Outcome {
  return typeof v === "string" && OUTCOMES.some((o) => o.value === v);
}

export function outcomeLabel(v: string): string {
  return OUTCOMES.find((o) => o.value === v)?.label ?? "";
}

export function outcomeGroup(v: string): OutcomeGroup {
  return OUTCOMES.find((o) => o.value === v)?.group ?? "active";
}

/* ---------------------------------------------------------------- ฟอร์ม */

/** ส่วนที่มีฟอร์ม — ยานยนต์ไม่อยู่ในนี้ (อ่านจากบอร์ดซ่อม) */
export const SECTIONS = ["rc", "ka", "er", "hrd", "handover"] as const;
export type OnboardingSection = (typeof SECTIONS)[number];

export function isSection(v: unknown): v is OnboardingSection {
  return typeof v === "string" && (SECTIONS as readonly string[]).includes(v);
}

export type SuggestKey = "rcName" | "zone" | "kaName" | "trainingSite" | "erName";

export type FieldKind = "text" | "tel" | "date" | "select" | "number" | "textarea" | "combo";

export interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  options?: readonly { value: string; label: string }[];
  /** `combo` — พิมพ์เองได้ + คำแนะนำจากค่าที่เคยกรอก (กันสะกดคนละแบบ) */
  suggest?: SuggestKey;
  wide?: boolean;
  /** โชว์อย่างเดียว — ฟอร์มไม่มีช่อง เซิร์ฟเวอร์คงค่าเดิมไว้ (ปลด/ลาออกทำที่หน้าผู้สมัครของ RC เท่านั้น) */
  readOnly?: boolean;
  /** มีช่องนี้เฉพาะเมื่อช่องอื่นเป็นค่านี้ (เช่น วันอบรม Co-Driver เมื่อเลือก “อบรม”) · ไม่ตรง = ฟอร์มซ่อน เซิร์ฟเวอร์ทิ้ง */
  when?: { key: string; value: string };
  /** โผล่เมื่อช่องนี้มีค่าแล้ว (กรอกทีละครั้ง: ครั้งที่ 2 โผล่หลังลงผลครั้งที่ 1) · ช่องที่มีค่าอยู่แล้วโผล่เสมอ ไม่ถูกทิ้ง */
  after?: string;
  /** วันที่ของการฝึกที่ควรทำ (ST) — ฟอร์มบอกวันที่จริงจากวันเริ่มฝึกเป็นคำใบ้ */
  day?: number;
  /** ช่องที่ทำให้ขั้นนี้ “เสร็จ” (ตรงกับ `stepStates`) — ฟอร์มขึ้น * แดง แต่ยังบันทึกได้แม้ว่าง */
  required?: boolean;
}

/** ช่องนี้ใช้กับค่าชุดนี้ไหม (เงื่อนไข `when` / `after`) */
export function fieldApplies(field: FieldSpec, values: Record<string, string>): boolean {
  if (field.when && values[field.when.key] !== field.when.value) return false;
  if (field.after && !values[field.after] && !values[field.key]) return false;
  return true;
}

/** วันที่ `day` ของการฝึก (วันเริ่ม = วันที่ 1) เป็น ISO · ไม่มีวันเริ่ม = "" */
export function trainingDayOn(start: string, day: number): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(start)) return "";
  const t = Date.parse(`${start.slice(0, 10)}T00:00:00Z`) + (day - 1) * 86_400_000;
  return Number.isNaN(t) ? "" : new Date(t).toISOString().slice(0, 10);
}

const opts = (...labels: string[]) => labels.map((l) => ({ value: l, label: l }));

export const DAY1_RESULTS = opts("ผ่าน", "ไม่ตรวจ", "ไม่มาฝึกงาน", "ไม่ผ่าน สารเสพติด", "ไม่ผ่าน แอลกอฮอล์");
export const DAY4_RESULTS = opts(
  "ผ่าน ฝึกงานต่อ",
  "ผ่าน พร้อมรับรถ",
  "ไม่ผ่าน ฝึกงาน",
  "ไม่มาฝึกงาน",
  "ไม่ผ่าน สารเสพติด",
  "ไม่ผ่าน แอลกอฮอล์",
  "ลาออก",
);
export const DAY8_RESULTS = opts(
  "ผ่านฝึกงาน พร้อมรับรถ",
  "ฝึกงานต่อ",
  "ไม่ผ่าน ฝึกงาน",
  "พฤติกรรมไม่ผ่าน",
  "ไม่มาฝึกงาน",
  "ไม่ผ่าน สารเสพติด",
  "ไม่ผ่าน แอลกอฮอล์",
  "ลาออก",
);
export const READINESS = opts("พร้อมรับรถ", "ฝึกงานต่อ", "พฤติกรรมไม่ผ่าน", "ไม่ผ่าน");
export const CO_DRIVER = opts("อบรม", "ไม่ต้องอบรม");
const CO_DRIVER_TRAIN = { key: "coDriver", value: "อบรม" };
export const PASS_FAIL = opts("ผ่าน", "ไม่ผ่าน");
export const HANDOVER_RESULTS = opts("ผ่าน", "ไม่ผ่าน กลับไปฝึกใหม่", "ไม่ผ่าน ปลด");
export const HANDOVER_PASS = "ผ่าน";

export interface SectionSpec {
  id: OnboardingSection;
  fields: FieldSpec[];
}

/** นิยามเดียวของฟอร์ม หน้าอ่าน และตัวตรวจฝั่งเซิร์ฟเวอร์ (คีย์นอกรายการถูกทิ้ง) */
export const SECTION_SPECS: Record<OnboardingSection, SectionSpec> = {
  rc: {
    id: "rc",
    fields: [
      { key: "fullName", label: "ชื่อ - นามสกุล", kind: "text" },
      { key: "phone", label: "เบอร์ติดต่อ", kind: "tel" },
      { key: "notifiedOn", label: "วันที่แจ้ง", kind: "date" },
      { key: "rcName", label: "RC ผู้แจ้ง", kind: "combo", suggest: "rcName" },
      { key: "trainingStartOn", label: "วันเริ่มฝึก", kind: "date", required: true },
      { key: "outcome", label: "ผลสิ้นสุด", kind: "select", options: OUTCOMES, readOnly: true },
      { key: "exitOn", label: "วันที่สิ้นสุด", kind: "date", readOnly: true },
    ],
  },
  ka: {
    id: "ka",
    fields: [
      { key: "zone", label: "Zone", kind: "combo", suggest: "zone" },
      { key: "kaName", label: "KA ที่ดูแล", kind: "combo", suggest: "kaName" },
      { key: "trainerPhone", label: "เบอร์ครูฝึก", kind: "tel" },
      { key: "trainingSite", label: "สถานที่ฝึก", kind: "combo", suggest: "trainingSite" },
      { key: "coDriver", label: "อบรม Co-Driver", kind: "select", options: CO_DRIVER },
      { key: "coDriverOn", label: "วันอบรม Co-Driver", kind: "date", when: CO_DRIVER_TRAIN },
      { key: "coDriverResult", label: "ผล Co-Driver", kind: "select", options: PASS_FAIL, when: CO_DRIVER_TRAIN },
      { key: "coDriverNote", label: "วิทยากร / หมายเหตุ Co-Driver", kind: "text", when: CO_DRIVER_TRAIN },
    ],
  },
  er: {
    id: "er",
    fields: [
      /* 3 ครั้งตามรอบติดตามเดิม (Day 1/4/8 ในไฟล์ — คีย์คงชื่อเดิม) ตั้งชื่อตามสิ่งที่ทำ วันเป็นคำใบ้ในฟอร์ม
         · ครั้งถัดไปโผล่หลังลงผลครั้งก่อน · ผลครั้งสุดท้ายคือสรุปความพร้อม */
      { key: "erName", label: "ST ที่ดูแล", kind: "combo", suggest: "erName" },
      { key: "day1", label: "ตรวจวันแรก · Alc./สาร", kind: "select", options: DAY1_RESULTS, wide: true, day: 1, required: true },
      { key: "day1Note", label: "ข้อเสนอแนะ วันแรก", kind: "textarea" },
      { key: "day4", label: "ติดตามกลางฝึก", kind: "select", options: DAY4_RESULTS, wide: true, day: 4, after: "day1", required: true },
      { key: "day4Note", label: "ข้อเสนอแนะ กลางฝึก", kind: "textarea", after: "day1" },
      { key: "day8", label: "ประเมินก่อนรับรถ", kind: "select", options: DAY8_RESULTS, wide: true, day: 8, after: "day4", required: true },
      { key: "day8Note", label: "ข้อเสนอแนะ ก่อนรับรถ", kind: "textarea", after: "day4" },
      /* ช่องเดิมจากไฟล์ — ซ้ำกับผลครั้งสุดท้าย (36/45 แถว) · โชว์ค่าเดิมอย่างเดียว ไม่มีในฟอร์ม */
      { key: "readiness", label: "สรุปความพร้อม (เดิม)", kind: "select", options: READINESS, readOnly: true },
      { key: "assessedOn", label: "วันที่สรุป (เดิม)", kind: "date", readOnly: true },
    ],
  },
  hrd: {
    id: "hrd",
    fields: [
      { key: "orientationOn", label: "วันปฐมนิเทศ", kind: "date", required: true },
      { key: "examScore", label: "คะแนนสอบ", kind: "number" },
    ],
  },
  handover: {
    id: "handover",
    fields: [
      { key: "dueOn", label: "ครบกำหนดฝึก", kind: "date" },
      { key: "handoverOn", label: "วันรับรถจริง", kind: "date", required: true },
      { key: "result", label: "ผลรับรถ", kind: "select", options: HANDOVER_RESULTS },
      { key: "note", label: "หมายเหตุ", kind: "textarea", wide: true },
    ],
  },
};

/** ST 3 รอบ — หน้า journey แสดงเป็นแถว วันที่ 1 / 4 / 8 (สรุป) กดอัปเดตทีละรอบ · รอบถัดไปเปิดหลังลงผลรอบก่อน */
export const ST_CHECKPOINTS = [
  { day: 1, result: "day1", note: "day1Note" },
  { day: 4, result: "day4", note: "day4Note" },
  { day: 8, result: "day8", note: "day8Note", summary: true },
] as const;

/* ------------------------------------------------------------ 6 ขั้น */

/** ขั้นบนแถบความคืบหน้า — `fleet` (รถพร้อม) ไม่มีฟอร์ม คิดจากรถ + บอร์ดซ่อม */
export type Step = OnboardingSection | "fleet";
export const STEP_ORDER: Step[] = ["rc", "ka", "er", "hrd", "fleet", "handover"];

export const STEP_META: Record<Step, { no: string; short: string; title: string }> = {
  rc: { no: "1", short: "RC", title: "แจ้งเริ่มฝึก" },
  ka: { no: "2", short: "KA", title: "ครูฝึก · รถ" },
  er: { no: "3", short: "ST", title: "Safety Trainer · 10 วัน" },
  hrd: { no: "4", short: "HRD", title: "ปฐมนิเทศ" },
  fleet: { no: "5", short: "ยานยนต์", title: "Auto · รถพร้อม" },
  handover: { no: "6", short: "รับรถ", title: "ส่งมอบรถ" },
};

/* ------------------------------------------------------------------ รูปข้อมูล */

export interface SectionData {
  values: Record<string, string>;
  updatedAt: string;
  updatedBy: string;
}

export type Onboarding = Partial<Record<OnboardingSection, SectionData>>;

/** สรุปสถานะรายวันจาก ATMS ของรหัส พจส. นี้ (อ่านอย่างเดียว) */
export interface AtmsBrief {
  trainingDays: number;
  firstTraining: string;
  lastTraining: string;
  /** วันแรกที่ออกงาน (`A…`) หลังเริ่มฝึก */
  firstWork: string;
  latestStatus: string;
  latestLabel: string;
  latestDate: string;
  /** สถานะล่าสุดเป็นรหัสพ้นสภาพ (`ลอ` `ปอ` …) */
  exited: boolean;
}

/**
 * ใบสมัครที่ “ยกเลิก” บนหน้าผู้สมัคร — โผล่ในแท็บจบ/ยกเลิกเป็นแถวอ่านอย่างเดียว
 * · `requisitionId` = อัตราที่เคยผูกอยู่ (ยกเลิกแล้วอัตราเปิดรับใหม่ ข้อมูลฝ่ายของเขาอยู่ใน `pastOnboarding`)
 */
export interface CancelledApplicant {
  applicationId: string;
  ref: string;
  reason: string;
  cancelledOn: string;
  requisitionId: string;
}

/** หนึ่งแถว = คำขอ + ข้อมูลฝ่าย + ATMS (ถ้ามีรหัส) · หรือผู้สมัครที่ยกเลิก (`applicant`) */
export type OnboardingRecord = Requisition & {
  onboarding: Onboarding;
  atms: AtmsBrief | null;
  applicant?: CancelledApplicant;
};

export type Suggestions = Partial<Record<SuggestKey, string[]>>;

export function val(onboarding: Onboarding | null | undefined, section: OnboardingSection, key: string): string {
  return onboarding?.[section]?.values[key] ?? "";
}

/** สิ่งที่ `PATCH …/onboarding` รับ — ทีละฝ่าย */
export interface OnboardingPatch {
  section: OnboardingSection;
  values: Record<string, string>;
  /** RC — รหัส พจส. · ว่าง = ถอดออก */
  drivercode?: string;
  /** KA — ครูฝึก/รถ บนตัวคำขอ · ว่าง = ถอดออก · ไม่ส่ง = ไม่แตะ */
  trainerDrivercode?: string;
  vehicleCode?: string;
  /** RC — ผลสิ้นสุด (ปลด/ลาออก …) ส่งได้จากหน้าผู้สมัครเท่านั้น · ว่าง = ล้าง · ไม่ส่ง = คงเดิม */
  exit?: { outcome: string; exitOn: string };
}

/* ---------------------------------------------------------------- ขั้น (Stage) */

export const STAGES = ["open", "recruiting", "training", "working", "ended"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  open: "อัตราว่าง",
  recruiting: "ผู้สมัคร",
  training: "ฝึกงาน",
  working: "รับรถแล้ว",
  ended: "จบ / ยกเลิก",
};

export const STAGE_DOT: Record<Stage, string> = {
  open: "bg-st-new-ink",
  recruiting: "bg-st-wait-ink",
  training: "bg-primary",
  working: "bg-st-live-ink",
  ended: "bg-mut",
};

export const STAGE_TONE: Record<Stage, string> = {
  open: "bg-st-new text-st-new-ink",
  recruiting: "bg-st-wait text-st-wait-ink",
  training: "bg-primary/12 text-primary",
  working: "bg-st-live text-st-live-ink",
  ended: "bg-base-200 text-mut",
};

/** วันเริ่มฝึก — RC กรอก → วันที่ระบบปิดอัตรา → วันแรกที่ ATMS ลง `ฝ` */
export function trainingStart(r: Pick<OnboardingRecord, "onboarding" | "filledOn" | "atms">): string {
  return val(r.onboarding, "rc", "trainingStartOn") || r.filledOn || r.atms?.firstTraining || "";
}

export function hasPerson(r: OnboardingRecord): boolean {
  return Boolean(r.match || r.hireName);
}

/**
 * ขั้นของแถว — คิดจากทุกแหล่ง ข้อเท็จจริงที่ชัดที่สุดชนะ:
 * ผลสิ้นสุด/ยกเลิก → รับรถ (วันรับรถ · ใบสมัคร “ปฏิบัติงาน” · ATMS ออกงาน) → เริ่มฝึก → ผู้สมัคร → ว่าง
 * · ATMS พ้นสภาพ**ก่อน**รับรถ = จบ · พ้นสภาพหลังรับรถแล้วยังนับเป็นรับรถแล้ว (onboarding สำเร็จ)
 */
export function stageOf(r: OnboardingRecord): Stage {
  /* ยกเลิกบนหน้าผู้สมัคร = จบ เสมอ (หน้าผู้สมัครเป็นเจ้าของสถานะนี้) */
  if (r.applicant || r.match?.status === "cancelled") return "ended";
  const group = outcomeGroup(r.outcome);
  if (group === "withdrawn" || group === "lost") return "ended";
  if (!hasPerson(r)) return r.status === "cancelled" ? "ended" : "open";
  if (r.status === "cancelled") return "ended";

  const worked =
    Boolean(val(r.onboarding, "handover", "handoverOn")) ||
    r.outcome === "handed_over" ||
    r.match?.status === "working" ||
    Boolean(r.atms?.firstWork);
  if (worked) return "working";
  if (r.atms?.exited) return "ended";
  /* วันเริ่มฝึกที่ยังไม่ถึง = ยังรอเริ่ม (อยู่ขั้นสรรหา) — ใบสมัคร “ฝึกงาน” ที่วันยังไม่ถึงก็ยังรอ
     (หน้าผู้สมัครขึ้น “รอฝึกงาน” · Bew 22 ต.ค. 2569) · ไม่มีวันเลยถึงเชื่อสถานะใบสมัคร */
  const start = trainingStart(r);
  if (start) return start <= todayInBangkok() ? "training" : "recruiting";
  return r.match?.status === "training" ? "training" : "recruiting";
}

/** ป้ายผลของคนที่จบ — ยกเลิกใบสมัคร → ผลที่กรอก → ATMS → ยกเลิกคำขอ */
export function endLabel(r: OnboardingRecord): string {
  if (r.applicant) return r.applicant.reason || "ยกเลิกใบสมัคร";
  if (r.match?.status === "cancelled") return "ยกเลิกใบสมัคร";
  return (
    outcomeLabel(r.outcome) ||
    (r.atms?.exited ? `${r.atms.latestLabel || r.atms.latestStatus} (ATMS)` : "") ||
    (r.status === "cancelled" ? "ยกเลิกคำขอ" : "")
  );
}

/* ---------------------------------------------------------- ความคืบหน้า 6 ขั้น */

export type StepState = "done" | "partial" | "todo" | "skip";

const anyValue = (o: Onboarding, s: OnboardingSection) =>
  Object.values(o[s]?.values ?? {}).some((v) => v.trim());

/**
 * `done` = ส่งต่อได้แล้ว · `partial` = เริ่มกรอก · คนที่จบ/รับรถแล้ว ขั้นที่ไม่ได้ทำเป็น `skip`
 * · ขั้นรถ: ไม่มีรถ = todo · อยู่บนบอร์ดซ่อม = partial · ไม่มีงานซ่อม = done
 */
export function stepStates(r: OnboardingRecord, repair: RepairStatus | null | undefined): Record<Step, StepState> {
  const o = r.onboarding;
  const v = (s: OnboardingSection, k: string) => val(o, s, k);
  const stage = stageOf(r);

  const states: Record<Step, StepState> = {
    rc: trainingStart(r) ? "done" : anyValue(o, "rc") ? "partial" : "todo",
    ka: r.trainer && r.vehicle ? "done" : r.trainer || r.vehicle || anyValue(o, "ka") ? "partial" : "todo",
    er: v("er", "day8") || v("er", "readiness") ? "done" : anyValue(o, "er") ? "partial" : "todo",
    hrd: v("hrd", "orientationOn") ? "done" : anyValue(o, "hrd") ? "partial" : "todo",
    fleet: !r.vehicle ? "todo" : repair ? "partial" : "done",
    handover: stage === "working" ? "done" : anyValue(o, "handover") ? "partial" : "todo",
  };

  if (stage === "ended" || stage === "working")
    for (const s of STEP_ORDER) if (states[s] === "todo" || states[s] === "partial") states[s] = "skip";
  return states;
}

/** ขั้นแรกที่ยังไม่จบ = ค้างอยู่ที่ฝ่ายไหน */
export function nextStep(states: Record<Step, StepState>): Step | null {
  return STEP_ORDER.find((s) => states[s] === "todo" || states[s] === "partial") ?? null;
}

/* ------------------------------------------------------------------- วันที่ */

export function daysBetween(from: string, to: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(from) || !/^\d{4}-\d{2}-\d{2}/.test(to)) return null;
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/** ฝึก → รับรถ (วัน) — วันรับรถที่กรอก หรือวันออกงานวันแรกจาก ATMS */
export function daysToHandover(r: OnboardingRecord): number | null {
  const end = val(r.onboarding, "handover", "handoverOn") || r.atms?.firstWork || "";
  return daysBetween(trainingStart(r), end);
}
