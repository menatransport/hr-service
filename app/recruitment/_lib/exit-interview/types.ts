/**
 * Exit Interview พจส. พ้นสภาพ — ชนิดข้อมูล + คำถาม **ใช้ได้ทั้ง server และ client**
 *
 * ต้นฉบับ: `Reason Code_Final (version 1).xlsx` (ชีต Wave1 · Wave2 · คำแนะนำ · DataLog) ของ HR ส่วนกลาง
 * แผนงาน: `app/recruitment/_docs/2026-11-24-exit-interview.md`
 *
 * - Wave 1 = วันที่ออก (Q1–Q11) · Wave 2 = โทรกลับวันที่ 30–45 (QW1–QW5)
 * - รหัสสาเหตุหลักมีที่เดียวคือ `master_driver.resignation.reasonCode` — Exit Interview เขียนทับได้
 *   (ของเก่าเก็บใน `reasonHistory`) · คำตอบอยู่ใน `driver_exit_interview` ซึ่งเปิดได้เฉพาะสิทธิ์ `exit-interview`
 */

export const EXIT_INTERVIEW_MENU = "exit-interview";

/** Wave 2 เปิดได้ตั้งแต่วันออก + 30 · ครบกำหนดวันออก + 45 */
export const WAVE2_OPEN_DAYS = 30;
export const WAVE2_DUE_DAYS = 45;

/** ครบ 3 ครั้งคนละวันคนละช่วงเวลา (ไม่รับ) = บันทึกเป็น N1 ได้ */
export const CONTACT_SLOTS = [
  { slot: 1, label: "ครั้งที่ 1", window: "07:00–08:00 น.", hint: "ก่อนออกวิ่ง" },
  { slot: 2, label: "ครั้งที่ 2 (คนละวัน)", window: "12:00–13:00 น.", hint: "ช่วงพัก" },
  { slot: 3, label: "ครั้งที่ 3 (คนละวันอีก)", window: "19:00–20:00 น.", hint: "หลังเลิกงาน" },
] as const;

export type ContactResult = "" | "answered" | "no_answer";

export interface ContactAttempt {
  slot: 1 | 2 | 3;
  dateISO: string;
  result: ContactResult;
  note: string;
}

/** ผลการติดต่อ — `N1` ติดต่อไม่ได้ (ครบ 3 ครั้ง) · `N2` ปฏิเสธให้ข้อมูล */
export type InterviewOutcome = "" | "interviewed" | "N1" | "N2";

export type YesNoUnsure = "" | "yes" | "no" | "unsure";
export const YES_NO_UNSURE: { value: Exclude<YesNoUnsure, "">; label: string }[] = [
  { value: "yes", label: "ใช่" },
  { value: "no", label: "ไม่" },
  { value: "unsure", label: "ไม่แน่ใจ" },
];

export type JobMatch = "" | "match" | "partial" | "mismatch";
export const JOB_MATCH: { value: Exclude<JobMatch, "">; label: string }[] = [
  { value: "match", label: "ตรง" },
  { value: "partial", label: "ไม่ตรงบางส่วน" },
  { value: "mismatch", label: "ไม่ตรง" },
];

/** ช่องทางสรรหาที่พบในไฟล์ DataLog — เลือกได้ หรือพิมพ์เพิ่มเอง */
export const RECRUIT_CHANNELS = [
  "Facebook",
  "Tiktok",
  "เพื่อนชวนเพื่อน",
  "พจส.เก่ากลับมาใหม่",
  "ซื้อรถร่วม",
  "โอนย้ายจากบริษัทอื่น",
  "บุคคลภายนอกแนะนำ",
  "ป้ายไวนิล",
  "Walk-in",
  "Welcome Home",
  "เกษียณอายุทำงานต่อ",
  "ย้ายกลับมาจากรถร่วม",
];

export interface Wave1Answers {
  dateISO: string;
  /** Q1 เริ่มคิดจะออกกี่เดือนก่อนยื่นใบลาออก */
  q1Months: number | null;
  q2: string;
  q3: string;
  q4: YesNoUnsure;
  q41Topic: string;
  q42: string;
  q5: string;
  q6Match: JobMatch;
  q6: string;
  q7: string;
  /** Q8 คะแนนหัวหน้า 1–5 */
  q8Score: number | null;
  q81: string;
  /** Q9 เดือนที่แล้วรับจริง (บาท) */
  q9Income: number | null;
  /** Q9.1 ที่ใหม่ให้เท่าไร (บาท) */
  q91NewIncome: number | null;
  q10: string;
  q11: string;
  completed: boolean;
}

export interface Wave2Answers {
  dateISO: string;
  qw1: string;
  qw2Income: number | null;
  qw21: string;
  qw3: string;
  /** QW3.1 รหัสสาเหตุจากคำตอบ QW3 */
  qw31Code: string;
  qw4: YesNoUnsure;
  qw5: string;
  completed: boolean;
}

/** รายได้ย้อนหลัง 3 เดือน (บาท) — กรอกมือในเฟส 1 */
export interface IncomeBack3 {
  net: number | null;
  average: number | null;
  deduction: number | null;
}

/** ข้อมูลที่ทะเบียนยังไม่มี — กรอกตอนสัมภาษณ์ (คอลัมน์ ST Zone · RC Mass · ช่องทางสรรหา ของ DataLog) */
export interface InterviewReference {
  stZone: string;
  rcOwner: string;
  channel: string;
}

export interface ReasonChange {
  from: string;
  to: string;
  source: "wave1" | "wave2";
  at: string;
  by: string;
}

export interface ExitInterview {
  drivercode: string;
  exitDateISO: string;
  reference: InterviewReference;
  contacts: ContactAttempt[];
  outcome: InterviewOutcome;
  wave1: Wave1Answers;
  wave2: Wave2Answers;
  income: IncomeBack3;
  /** มีการกล่าวถึงความไม่ปลอดภัย การคุกคาม หรือการกระทำผิดกฎหมาย — ต้องแจ้ง HR Chief ทันที */
  safetyFlag: boolean;
  reasonHistory: ReasonChange[];
  updatedAt: string;
  updatedBy: string;
}

/* ------------------------------------------------------------------ สถานะ */

/**
 * `pending` ยังไม่สัมภาษณ์ · `wave1` W1 แล้ว ยังไม่ถึงรอบ W2 · `wave2_due` ถึงรอบโทร W2 ·
 * `wave2_late` เลยวันที่ 45 · `done` ครบสองรอบ · `no_data` N1/N2
 */
export type InterviewStage = "pending" | "wave1" | "wave2_due" | "wave2_late" | "done" | "no_data";

export const STAGE_LABEL: Record<InterviewStage, string> = {
  pending: "ยังไม่สัมภาษณ์",
  wave1: "Wave 1 แล้ว",
  wave2_due: "ถึงรอบ Wave 2",
  wave2_late: "เลยกำหนด Wave 2",
  done: "ครบ 2 รอบ",
  no_data: "ไม่ได้ข้อมูล",
};

export const STAGE_CHIP: Record<InterviewStage, string> = {
  pending: "chip-ink",
  wave1: "chip-live",
  wave2_due: "chip-wait",
  wave2_late: "chip-alert",
  done: "chip-done",
  no_data: "chip-ink",
};

export function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function stageOf(
  iv: Pick<ExitInterview, "outcome" | "wave1" | "wave2"> | null,
  exitDateISO: string,
  todayISO: string,
): InterviewStage {
  if (!iv) return "pending";
  if (iv.outcome === "N1" || iv.outcome === "N2") return "no_data";
  if (iv.wave2.completed) return "done";
  if (!iv.wave1.completed) return "pending";
  if (todayISO < addDaysISO(exitDateISO, WAVE2_OPEN_DAYS)) return "wave1";
  return todayISO > addDaysISO(exitDateISO, WAVE2_DUE_DAYS) ? "wave2_late" : "wave2_due";
}

/** ช่วงอายุงานตามคอลัมน์ “ช่วงอายุงาน” ของ DataLog */
export function tenureBand(days: number | null): string {
  if (days == null || days < 0) return "";
  if (days <= 10) return "0-10 วัน";
  if (days <= 30) return "11-30 วัน";
  if (days <= 90) return "31-90 วัน";
  if (days <= 180) return "91-180 วัน";
  if (days <= 365) return "181-365 วัน";
  return "เกิน 1 ปี";
}

/** อายุงาน (วัน) จากวันเริ่มงานถึงวันสุดท้าย */
export function tenureDays(startISO: string, endISO: string): number | null {
  if (!startISO || !endISO) return null;
  const ms = Date.parse(`${endISO}T00:00:00Z`) - Date.parse(`${startISO}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : null;
}

/* ------------------------------------------------------------------ ค่าว่าง */

export function emptyWave1(): Wave1Answers {
  return {
    dateISO: "",
    q1Months: null,
    q2: "",
    q3: "",
    q4: "",
    q41Topic: "",
    q42: "",
    q5: "",
    q6Match: "",
    q6: "",
    q7: "",
    q8Score: null,
    q81: "",
    q9Income: null,
    q91NewIncome: null,
    q10: "",
    q11: "",
    completed: false,
  };
}

export function emptyWave2(): Wave2Answers {
  return { dateISO: "", qw1: "", qw2Income: null, qw21: "", qw3: "", qw31Code: "", qw4: "", qw5: "", completed: false };
}

export function emptyInterview(drivercode: string, exitDateISO: string): ExitInterview {
  return {
    drivercode,
    exitDateISO,
    reference: { stZone: "", rcOwner: "", channel: "" },
    contacts: [],
    outcome: "",
    wave1: emptyWave1(),
    wave2: emptyWave2(),
    income: { net: null, average: null, deduction: null },
    safetyFlag: false,
    reasonHistory: [],
    updatedAt: "",
    updatedBy: "",
  };
}

/* ------------------------------------------------------------------ คำถาม */

/** คำถาม + เป้าหมาย (ชีต Wave1/Wave2) — โชว์เป็นสคริปต์ให้ผู้สัมภาษณ์อ่านตาม */
export const WAVE1_QUESTIONS = {
  q1: { no: "Q1", ask: "ย้อนกลับไปนะคะ คุณเริ่มคิดจะออกครั้งแรกตอนไหน ประมาณกี่เดือนก่อนยื่นใบลาออกคะ", why: "เราสูญเสียเขาไปตั้งแต่เมื่อไหร่ — มีเวลากี่เดือนในการรั้งไว้" },
  q2: { no: "Q2", ask: "ตอนนั้นเกิดอะไรขึ้นคะ มีเหตุการณ์อะไรที่ทำให้เริ่มคิดที่จะลาออก", why: "หาเหตุการณ์จุดชนวน ซึ่งมักเป็นสาเหตุจริง ไม่ใช่เหตุผลในใบลาออก" },
  q3: { no: "Q3", ask: "แล้วอะไรคือฟางเส้นสุดท้ายที่ทำให้ตัดสินใจจริงๆ คะ", why: "ใช้ข้อนี้กำหนดรหัสสาเหตุหลัก" },
  q4: { no: "Q4", ask: "ถ้าบริษัทแก้ให้ได้แค่ 1 เรื่อง เรื่องเดียวเท่านั้น คุณจะอยู่ต่อไหมคะ แล้วเรื่องนั้นคืออะไร", why: "คำถามที่มีมูลค่าสูงที่สุด — เปลี่ยนคำบ่นเป็นรายการสิ่งที่ต้องแก้" },
  q5: { no: "Q5", ask: "ย้อนไปสัปดาห์แรกที่มาทำงาน ครูฝึกสอนงานเป็นยังไงบ้างคะ รู้สึกอย่างไรบ้าง", why: "คุณภาพการรับเข้างาน — ถ้าเป็นสาเหตุ ใช้รหัสหมวด O" },
  q6: { no: "Q6", ask: "งานจริงกับที่เราบอกไว้ตอนสัมภาษณ์ ตรงกันแค่ไหน มีอะไรที่ไม่ตรงบ้างคะ", why: "ช่องว่างความคาดหวัง — ความรับผิดชอบของทีมสรรหา (O2)" },
  q7: { no: "Q7", ask: "หัวหน้างานของคุณคือใครคะ", why: "การรับรู้สายการบังคับบัญชาตรงกับโครงสร้างจริงไหม" },
  q8: { no: "Q8", ask: "หัวหน้างานของคุณ ถ้าให้คะแนนเต็ม 5 คะแนน เรื่องการดูแลลูกน้อง ให้เท่าไรคะ เพราะอะไร", why: "ถามหลังสร้างความไว้ใจแล้วเท่านั้น — ใช้รหัสหมวด L" },
  q9: { no: "Q9", ask: "ขอถามตรงๆ นะคะ เดือนที่แล้วรับจริงเท่าไร แล้วที่ใหม่ให้เท่าไรคะ", why: "ถามเป็นตัวเลข ไม่ถามความรู้สึก — เอาไปเทียบตลาดได้จริง" },
  q10: { no: "Q10", ask: "ที่ใหม่มีอะไรที่ที่นี่ไม่มีบ้างคะ", why: "ช่องว่างการแข่งขันจริง มักเป็นตารางงานหรือการได้กลับบ้าน" },
  q11: { no: "Q11", ask: "ถ้าเพื่อนถามว่าที่นี่ดีไหม คุณจะเล่าให้เขาฟังว่ายังไงคะ แล้วถ้าเราแก้เรื่องที่คุณบอกได้ จะกลับมาทำงานกับเราไหมคะ", why: "ความรู้สึกสุดท้าย + คัดคนที่จ้างกลับได้" },
} as const;

export const WAVE2_QUESTIONS = {
  qw1: { no: "QW1", ask: "ตอนนี้ทำงานที่ไหนแล้วคะ ขับรถอะไร", why: "ไปคู่แข่ง หรือออกจากวงการ" },
  qw2: { no: "QW2", ask: "ที่ใหม่รายได้เท่าไร ตารางงานเป็นยังไงบ้างคะ ได้กลับบ้านบ่อยไหม ได้พักผ่อนพอไหม", why: "ข้อเท็จจริงเปรียบเทียบ — Market Benchmark" },
  qw3: { no: "QW3", ask: "ตอนนี้ผ่านมาเดือนนึงแล้ว มองย้อนกลับไป เหตุผลจริงๆ ที่ออกจากเราคืออะไรคะ", why: "คำถามทองคำ — แม่นกว่าวันที่ลาออก ให้ยึดเป็นรหัสหลัก" },
  qw4: { no: "QW4", ask: "ถ้าเราแก้เรื่องนั้นได้จริง คุณจะกลับมาไหมคะ", why: "คลังผู้สมัครที่ผ่านการอบรมแล้ว ต้นทุนต่ำที่สุด" },
  qw5: { no: "QW5", ask: "มีอะไรที่ที่ใหม่เขาทำ แล้วคุณคิดว่าเราน่าจะทำบ้างคะ", why: "ไอเดียจากคนที่เห็นทั้งสองที่" },
} as const;

export const WAVE1_OPENING =
  "สวัสดีค่ะ คุณ.......... ดิฉันชื่อ.......... จากฝ่ายบุคคลบริษัทมีนาทรานสปอร์ต จำกัด (มหาชน) ส่วนกลางนะคะ ที่โทรมาจะพูดคุยเรื่องการลาออก เพราะบริษัทอยากรู้จริงๆ ว่าบริษัททำอะไรพลาดไป จะได้แก้ให้เพื่อนๆ ที่ยังทำงานอยู่ ไม่เกี่ยวกับเงิน เอกสาร หรือใบผ่านงานนะคะ";
export const WAVE1_CLOSING =
  "ขอบคุณมากค่ะที่พูดตรงๆ ข้อมูลนี้มีค่ากับเรามาก ขออนุญาตโทรกลับหาคุณอีกครั้งสั้นๆ ประมาณ 5 นาที ในอีกเดือนหน้าได้ไหมคะ อยากรู้ว่างานใหม่เป็นยังไงบ้าง ขอให้โชคดีนะคะ";
export const WAVE2_OPENING =
  "สวัสดีค่ะคุณ.......... ดิฉัน.......... จากฝ่ายบุคคลส่วนกลางของบริษัทมีนา ที่โทรมาเพราะเมื่อเดือนที่แล้วเราได้คุยกันตอนที่คุณลาออก แล้วคุณใจดีอนุญาตให้ดิฉันโทรกลับมาถามไถ่ว่างานใหม่เป็นยังไงบ้างค่ะ";

/** กติกาผู้สัมภาษณ์ (ชีตคำแนะนำ) — โชว์ย่อในลิ้นชัก */
export const INTERVIEW_RULES = [
  "ผู้สัมภาษณ์ต้องเป็น HR ส่วนกลางที่ไม่ได้ดูแลศูนย์นั้น — ห้ามหัวหน้าสายตรงหรือ ผจก.ศูนย์",
  "ห้ามถาม “ทำไมถึงลาออก” เป็นคำถามแรก · ถามแล้วเงียบรอ 5 วินาที",
  "จดคำพูดจริงคำต่อคำ ไม่แปลเป็นภาษา HR · ห้ามแก้ตัวแทนบริษัท ห้ามเถียง",
  "ห้ามผูกการสัมภาษณ์กับการรับเงินหรือคืนอุปกรณ์ · ห้ามเอ่ยชื่อผู้ให้ข้อมูลกลับไปที่ศูนย์",
  "ไม่เกิน 15 นาที · ขออนุญาตโทรกลับอีกครั้งใน 1 เดือนก่อนวางสาย",
];

/* ------------------------------------------------------------------ สรุปต่อคน */

/** สิ่งที่ตาราง/tile ต้องใช้ — **ไม่มีคำตอบ** */
export interface InterviewSummaryRow {
  drivercode: string;
  exitDateISO: string;
  stage: InterviewStage;
  wave2DueISO: string;
  safetyFlag: boolean;
}

/** ข้อมูลอ้างอิงจากทะเบียน (แทนชีต “ก่อนโทร”) */
export interface InterviewDriverRef {
  drivercode: string;
  name: string;
  phone: string;
  ownerTypeLabel: string;
  position: string;
  customer: string;
  plant: string;
  siteLabel: string;
  startDateISO: string;
  exitDateISO: string;
  tenureDays: number | null;
  tenureBand: string;
  reasonCode: string;
  reasonLabel: string;
  exitType: string;
  secondaryCodes: string[];
  note: string;
}

export interface ExitInterviewBundle {
  driver: InterviewDriverRef;
  interview: ExitInterview;
  stage: InterviewStage;
  /** มีระเบียนในฐานแล้วหรือยัง */
  saved: boolean;
}

/* ------------------------------------------------------------ ส่งออก DataLog */

/** หนึ่งแถวของชีต DataLog (47 คอลัมน์ ตามไฟล์ต้นฉบับ) — ฝั่งเซิร์ฟเวอร์ประกอบให้ ฝั่ง browser วาดเป็น xlsx */
export interface DataLogRow {
  drivercode: string;
  name: string;
  phone: string;
  ownerTypeLabel: string;
  position: string;
  customer: string;
  plant: string;
  stZone: string;
  rcOwner: string;
  channel: string;
  startDateISO: string;
  exitDateISO: string;
  tenureDays: number | null;
  tenureBand: string;
  exitType: string;
  reasonCode: string;
  reasonLabel: string;
  secondaryCodes: string;
  controllable: string;
  owner: string;
  stage: InterviewStage;
  interview: ExitInterview | null;
}
