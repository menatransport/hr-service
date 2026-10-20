/**
 * รูปข้อมูลของระบบรับสมัครพนักงานขับรถ — **ใช้ได้ทั้งฝั่งเซิร์ฟเวอร์และ client**
 *
 * แยกจาก `questions.ts` / `applications.ts` เพราะสองไฟล์นั้น import `lib/mongo.ts`
 * ซึ่งเป็นของฝั่งเซิร์ฟเวอร์ล้วน — client component ที่แตะไฟล์นั้นจะลาก driver ของ
 * MongoDB เข้า bundle แล้ว build พังตั้งแต่ `child_process`
 * (ท่าเดียวกับ `survey-forms.ts` ↔ `newyear-survey.ts`)
 */

/* ------------------------------------------------------------------ คำถาม */

/**
 * ชนิดของช่องกรอก — ตัวเรนเดอร์ `components/recruitment/question-field.tsx`
 * แปลงค่าเหล่านี้เป็นคอนโทรลจาก `components/ui/field.tsx` ตัวต่อตัว
 *
 * `nid` แยกจาก `text` เพราะต้องเปิดแป้นตัวเลขและตรวจเลขตรวจสอบหลักที่ 13
 * `single` เป็น `<select>` ของเบราว์เซอร์เสมอ — สูงเท่ากันทุกข้อ ฟอร์มจึงกระชับ
 * และรายการที่กางออกเป็นของระบบปฏิบัติการ ซึ่งคนกรอกบนมือถือคุ้นอยู่แล้ว
 * ส่วน `multi` เป็นรายการติ๊ก เพราะต้องเห็นว่าเลือกไปแล้วกี่ข้อพร้อมกัน
 */
export type QuestionKind =
  | "text"
  | "tel"
  | "nid"
  | "number"
  | "date"
  | "single"
  | "multi"
  | "textarea";

export interface QuestionOption {
  value: string;
  label: string;
}

/** แสดงข้อนี้ก็ต่อเมื่อคำตอบของ `key` มีค่าใดค่าหนึ่งใน `equals` */
export interface QuestionCondition {
  key: string;
  equals: string[];
}

export interface Question {
  /** `_id` ของ MongoDB ในรูป hex — client ใช้อ้างตอนแก้/ลบ */
  id: string;
  /** กุญแจที่ `answers` อ้างถึง ตั้งแล้วห้ามเปลี่ยน (ดู `applications.ts`) */
  key: string;
  section: SectionId;
  /** ลำดับในหมวด เว้นเป็นสิบเพื่อให้แทรกกลางได้โดยไม่ต้องเขียนใหม่ทั้งชุด */
  order: number;
  label: string;
  hint: string;
  placeholder: string;
  kind: QuestionKind;
  options: QuestionOption[];
  required: boolean;
  /** ข้อมูลอ่อนไหวตาม ม.26 — ปิดบางส่วนในตารางแอดมิน (ดู `maskSensitive`) */
  sensitive: boolean;
  condition: QuestionCondition | null;
  /** ปิดใช้โดยไม่ลบ — ทางที่แนะนำแทนการลบ เพราะคำตอบเก่ายังอ้างกุญแจนี้อยู่ */
  active: boolean;
  updatedAt: string;
  updatedBy: string;
}

/** ค่าที่ผู้สมัครตอบ — `multi` เป็น array ที่เหลือเป็นสตริง */
export type AnswerValue = string | string[];
export type AnswerMap = Record<string, AnswerValue>;

/* ------------------------------------------------------------------ ใบสมัคร */

/**
 * สถานะการสมัคร — **หกขั้นตามที่ฝ่ายบุคคลใช้จริง** (ดู `requirment.md`)
 *
 * เรียงตามลำดับที่ใบสมัครหนึ่งใบเดินจริง ไม่ใช่เรียงตามตัวอักษร: ตารางผู้สมัคร
 * ชิปกรอง และแถบความคืบหน้าบนหน้าภาพรวมอ่านลำดับจากอาเรย์ตัวนี้ตัวเดียว
 *
 * **ไม่มีสถานะ “ถอนความยินยอม” แยกต่างหาก** (ถอดออก 17 ก.ย. 2026 ตามคำสั่ง
 * เจ้าของงาน) — ผู้สมัครที่กดยกเลิกเองบนหน้าติดตามลงเอยที่ `cancelled`
 * เหมือนกับที่ฝ่ายบุคคลกดยกเลิก ต่างกันแค่เหตุผล (`self_cancelled`) และ
 * ร่องรอยว่าข้อมูลถูกลบไปแล้ว (`erased`) · อย่าเพิ่ม `withdrawn` กลับมา
 *
 * **`working` (ปฏิบัติงาน) เพิ่ม 29 ก.ย. 2026 ตามคำสั่งเจ้าของงาน** — ขั้นหลัง
 * `training` สำหรับคนที่ฝึกจบแล้วและออกงานจริง · เกิดครั้งแรกตอนนำเข้าใบสมัครจาก
 * Google Form ซึ่งเทียบกับทะเบียน พจส. แล้วพบว่าหลายคนทำงานอยู่แล้ว
 * (ดู `form-import.ts`) · สถานะรายวันจริงยังดูที่ทะเบียนประวัติ พจส. เหมือนเดิม
 */
export const APPLICATION_STATUSES = [
  "pending_contact",
  "interview_scheduled",
  "interview_waiting",
  "interview_passed",
  "cancelled",
  "training",
  "working",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/**
 * สถานะชุดเก่าก่อนปรับตาม `requirment.md` — ใบที่ลงฐานไปแล้วยังถือค่าพวกนี้อยู่
 *
 * แปลงตอน**อ่าน** ไม่ใช่ตอนเขียน เพื่อให้ใบเก่าขึ้นตารางได้ทันทีโดยไม่ต้องรอ
 * migration วิ่งจบ และไม่มีจังหวะที่หน้าจอพังเพราะเจอค่าที่ไม่รู้จัก
 */
const LEGACY_STATUS: Record<string, ApplicationStatus> = {
  submitted: "pending_contact",
  screening: "pending_contact",
  interview: "interview_scheduled",
  road_test: "interview_waiting",
  offer: "interview_passed",
  hired: "training",
  rejected: "cancelled",
  /* ชื่อเดิมตอนที่เหตุผลออกยังเป็นส่วนหนึ่งของสถานะ — ตอนนี้สถานะเหลือคำเดียวว่า
     “ยกเลิก” ส่วนเหตุผลย้ายไปเป็นคอลัมน์ของตัวเอง (ดู `EXIT_REASONS`) */
  interview_failed: "cancelled",
  /* ใบที่ผู้สมัครกดถอนความยินยอมไว้ก่อนจะถอดสถานะนั้นออก — ขึ้นเป็น “ยกเลิก”
     ตามชุดปัจจุบัน ส่วนร่องรอยการลบข้อมูลอ่านจาก `erasedAt` ในฐานแทน */
  withdrawn: "cancelled",
};

export function isApplicationStatus(v: unknown): v is ApplicationStatus {
  return (
    typeof v === "string" &&
    (APPLICATION_STATUSES as readonly string[]).includes(v)
  );
}

/** ค่าจากฐานข้อมูล → สถานะชุดปัจจุบัน · ค่าที่ไม่รู้จักถือว่ายังรอติดต่อ */
export function normalizeStatus(v: unknown): ApplicationStatus {
  if (isApplicationStatus(v)) return v;
  return (typeof v === "string" && LEGACY_STATUS[v]) || "pending_contact";
}

/** ป้ายภาษาไทยของแต่ละสถานะ — ใช้ร่วมกันทั้งตารางแอดมินและหน้าติดตาม */
export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  pending_contact: "รอการติดต่อ",
  interview_scheduled: "นัดสัมภาษณ์",
  interview_waiting: "รอผลการสัมภาษณ์",
  interview_passed: "ผ่านการสัมภาษณ์",
  cancelled: "ยกเลิก",
  training: "ฝึกงาน",
  working: "ปฏิบัติงาน",
};

/** สิ่งที่ฝ่ายบุคคลต้องทำต่อเมื่อใบอยู่สถานะนี้ — ขึ้นในกล่องจัดการผู้สมัคร */
export const STATUS_NEXT_STEP: Record<ApplicationStatus, string> = {
  pending_contact: "โทรกลับหาผู้สมัคร แล้วนัดวันสัมภาษณ์",
  interview_scheduled: "นัดแล้ว รอถึงวันสัมภาษณ์",
  interview_waiting: "สัมภาษณ์แล้ว รอสรุปผล",
  interview_passed: "ผ่านแล้ว นัดวันเริ่มฝึกงาน",
  cancelled: "ยกเลิกแล้ว — ระบุเหตุผลในคอลัมน์เหตุผลที่ยกเลิก",
  training: "เริ่มฝึกงานแล้ว",
  working: "ปฏิบัติงานแล้ว — ดูสถานะรายวันที่ทะเบียนประวัติ พจส.",
};

/**
 * ใบที่ได้คนแล้ว — ฝึกงานอยู่หรือออกงานแล้ว · คำขอสรรหาที่ผูกกับใบพวกนี้ถือว่าปิดอัตรา
 * (`filled`) และปฏิทินนัดสัมภาษณ์ย้อมเป็น “จบแล้ว” · ถามผ่านฟังก์ชันนี้ที่เดียว
 * อย่าเขียน `status === "training"` ซ้ำตามจุดต่าง ๆ ไม่งั้น `working` จะหลุด
 */
export function isHiredStatus(status: ApplicationStatus): boolean {
  return status === "training" || status === "working";
}

/**
 * ใบที่ยังเดินอยู่ในสาย — ไม่รวมปลายทางที่จบแล้ว
 * ใช้ทั้งคิวงานบนหน้าภาพรวมและตัวนับ “กำลังดำเนินการ” ของตารางผู้สมัคร
 */
export const OPEN_STATUSES: ApplicationStatus[] = [
  "pending_contact",
  "interview_scheduled",
  "interview_waiting",
  "interview_passed",
];

/**
 * ลำดับความคืบหน้าที่ผู้สมัครเห็นบนหน้าติดตาม — **ไม่ใช่รายการสถานะทั้งหมด**
 * `cancelled` เป็นทางจบที่ไม่อยู่บนเส้นนี้ จึงแสดงแยกต่างหาก
 */
export const PROGRESS_FLOW: ApplicationStatus[] = [
  "pending_contact",
  "interview_scheduled",
  "interview_waiting",
  "interview_passed",
  "training",
  "working",
];

/* -------------------------------------------------------------- การสัมภาษณ์ */

/**
 * ผลการสัมภาษณ์ — `""` คือยังไม่ได้บันทึกผล (ยังไม่ถึงวันสัมภาษณ์ก็อยู่ในนี้)
 * ค่าสามตัวที่เหลือตรงกับสถานะใบสมัครหนึ่งต่อหนึ่ง ดู `statusFromResult()`
 */
export const INTERVIEW_RESULTS = ["waiting", "passed", "failed"] as const;
export type InterviewResult = (typeof INTERVIEW_RESULTS)[number] | "";

export const INTERVIEW_RESULT_LABEL: Record<
  (typeof INTERVIEW_RESULTS)[number],
  string
> = {
  waiting: "รอผลการสัมภาษณ์",
  passed: "ผ่านการสัมภาษณ์",
  failed: "ไม่ผ่านการสัมภาษณ์",
};

export function isInterviewResult(v: unknown): v is InterviewResult {
  return (
    v === "" ||
    (typeof v === "string" &&
      (INTERVIEW_RESULTS as readonly string[]).includes(v))
  );
}

/**
 * บันทึกผลสัมภาษณ์แล้ว สถานะใบต้องเป็นอะไร
 *
 * ผูกสองอย่างนี้เข้าด้วยกันโดยตั้งใจ — ถ้าปล่อยให้เลือกแยกกัน จะมีใบที่ผลเขียนว่า
 * “ผ่าน” แต่สถานะค้างอยู่ที่ “รอผล” ซึ่งเป็นความขัดแย้งที่ไม่มีใครไล่ตามแก้
 */
export function statusFromResult(
  result: InterviewResult,
): ApplicationStatus | null {
  if (result === "waiting") return "interview_waiting";
  if (result === "passed") return "interview_passed";
  if (result === "failed") return "cancelled";
  return null;
}

/** แผนและผลการสัมภาษณ์ของใบหนึ่ง — ว่างทั้งก้อนได้ ถ้ายังไม่ถึงขั้นนัด */
export interface InterviewRecord {
  /** แผนสัมภาษณ์ — รอบไหน ที่ไหน ใครสัมภาษณ์ ให้เตรียมอะไรมา */
  plan: string;
  /** `YYYY-MM-DD` · `""` = ยังไม่ได้นัด */
  date: string;
  /** `HH:MM` · `""` = ยังไม่ระบุเวลา */
  time: string;
  result: InterviewResult;
  /** สรุปสั้น ๆ จากผู้สัมภาษณ์ ขึ้นในหน้ารายละเอียด */
  note: string;
}

export const EMPTY_INTERVIEW: InterviewRecord = {
  plan: "",
  date: "",
  time: "",
  result: "",
  note: "",
};

/* -------------------------------------------------------------- เหตุผลออก */

/**
 * ทำไมผู้สมัครถึงหลุดจากกระบวนการ — **คอลัมน์ของตัวเอง** ที่กรอกต่อหลังตั้งสถานะ
 * เป็น “ยกเลิก”
 *
 * แยกจากสถานะเพราะสถานะตอบว่า “ตอนนี้ใบอยู่ตรงไหน” ส่วนอันนี้ตอบว่า “ทำไมถึงจบ”
 * — และคำตอบที่ฝ่ายบุคคลอยากรวมยอดดูตอนสิ้นเดือนคืออันหลัง (ติดต่อไม่ได้กี่ราย
 * คุณสมบัติไม่ตรงกี่ราย) ซึ่งถ้ายัดรวมเป็นสถานะเดียวกันจะนับแยกไม่ได้เลย
 */
export const EXIT_REASONS = [
  { value: "unreachable", label: "ติดต่อไม่ได้" },
  { value: "interview_failed", label: "ไม่ผ่านการสัมภาษณ์" },
  { value: "not_interested", label: "ไม่สนใจงาน" },
  { value: "unqualified", label: "ไม่ตรงตามคุณสมบัติ" },
  /* ระบบเป็นคนตั้งให้เองตอนผู้สมัครกดยกเลิกบนหน้าติดตาม — ยังเลือกด้วยมือได้
     เผื่อผู้สมัครโทรมาบอกแทนที่จะกดเอง */
  { value: "self_cancelled", label: "ผู้สมัครขอยกเลิกเอง" },
  /* ไม่มีข้อไหนตรง = พิมพ์เอง (29 ก.ย. 2026) — ข้อความเก็บที่ `exitReasonNote`
     ส่วนยอดสิ้นเดือนยังนับรวมเป็นกอง “อื่นๆ” กองเดียว ไม่แตกตามคำที่พิมพ์ */
  { value: "other", label: "อื่นๆ" },
] as const;

/** ค่าของข้อ “อื่นๆ” — เลือกแล้วต้องพิมพ์เหตุผลเองใน `exitReasonNote` */
export const OTHER_EXIT_REASON = "other";

/** ความยาวสูงสุดของเหตุผลที่พิมพ์เอง — ตรวจซ้ำฝั่งเซิร์ฟเวอร์ใน `updateApplication()` */
export const EXIT_REASON_NOTE_MAX = 200;

export type ExitReason = (typeof EXIT_REASONS)[number]["value"] | "";

export function isExitReason(v: unknown): v is ExitReason {
  return v === "" || EXIT_REASONS.some((r) => r.value === v);
}

export function exitReasonLabel(value: ExitReason): string {
  return EXIT_REASONS.find((r) => r.value === value)?.label ?? "—";
}

/**
 * เหตุผลที่อ่านออกสำหรับขึ้นจอ — ข้อ “อื่นๆ” ขึ้นข้อความที่พิมพ์ไว้แทนคำว่า “อื่นๆ”
 * · ใช้ `exitReasonLabel()` ตรง ๆ เฉพาะที่ต้องการชื่อกอง (ตัวกรอง · ยอดรวม)
 */
export function exitReasonText(a: { exitReason: ExitReason; exitReasonNote: string }): string {
  if (a.exitReason === OTHER_EXIT_REASON) return a.exitReasonNote.trim() || "อื่นๆ";
  return exitReasonLabel(a.exitReason);
}

/* ---------------------------------------------------------------- Blacklist */

/**
 * ใบที่ติด Blacklist หนึ่งใบ — ชุดเท่าที่ต้องใช้จับคู่กับใบที่เข้ามาใหม่
 * (`listBlacklist()` ส่งมาทั้งหมด ไม่จำกัดแค่ 500 ใบล่าสุดของตาราง)
 */
export interface BlacklistEntry {
  ref: string;
  fullName: string;
  phone: string;
}

/** ใบที่รอการติดต่อชนกับ Blacklist — ชนด้วยอะไร และชนกับใบไหน */
export interface BlacklistHit {
  ref: string;
  fullName: string;
  by: ("phone" | "name")[];
}

/* คำนำหน้าชื่อที่ผู้สมัครพิมพ์บ้างไม่พิมพ์บ้าง — ตัดทิ้งก่อนเทียบ ไม่งั้น “นายสมชาย”
   กับ “สมชาย” จะหลุดกันทั้งที่เป็นคนเดียวกัน · เรียง “นางสาว” ก่อน “นาง” เสมอ */
const NAME_TITLES = /^(นางสาว|นาง|นาย|น\.ส\.|ด\.ช\.|ด\.ญ\.|mrs\.?|mr\.?|ms\.?|miss)\s*/i;

/** กุญแจเทียบชื่อ — ตัดคำนำหน้า ช่องว่าง และตัวพิมพ์เล็กใหญ่ทิ้ง */
export function nameKey(name: string): string {
  return name.trim().replace(NAME_TITLES, "").replace(/\s+/g, "").toLowerCase();
}

/**
 * ใบนี้ชนกับ Blacklist ไหม — เทียบ **เบอร์โทร หรือ ชื่อ–นามสกุล** อย่างใดอย่างหนึ่ง
 * (ตามคำสั่งเจ้าของงาน 29 ก.ย. 2026) · ข้ามใบตัวเอง · ชื่อสั้นกว่า 2 ตัวอักษรไม่นับ
 * กันใบที่กรอกชื่อมาไม่ครบไปชนกันเองมั่ว ๆ
 *
 * เป็นแค่ **สัญญาณเตือน** ไม่ได้ปิดกั้นอะไร — ชื่อซ้ำกันได้จริงในคนละคน คนโทรต้อง
 * ดูเลขใบที่ชนแล้วตัดสินเอง
 */
export function findBlacklistHit(
  row: { ref: string; fullName: string; phone: string },
  list: BlacklistEntry[],
): BlacklistHit | null {
  const phone = row.phone.replace(/\D/g, "");
  const name = nameKey(row.fullName);

  for (const entry of list) {
    if (entry.ref === row.ref) continue;
    const by: BlacklistHit["by"] = [];
    if (phone.length >= 9 && entry.phone.replace(/\D/g, "") === phone) by.push("phone");
    if (name.length >= 2 && nameKey(entry.fullName) === name) by.push("name");
    if (by.length) return { ref: entry.ref, fullName: entry.fullName, by };
  }
  return null;
}

/* ------------------------------------------------------------ ใบสมัครเต็มใบ */

export interface ApplicationFile {
  /** ตรงกับ `id` ของช่องใน `recruitment_doc_slot` (ดู `doc-slots.ts`) */
  slot: string;
  /**
   * ชื่อช่อง ณ วันที่แนบ — ช่องถูกลบออกจากคลังทีหลังได้ ไฟล์จึงต้องพกชื่อตัวเองไว้
   * (แบบเดียวกับ `questionSnapshot`) · ใบเก่าก่อนมีช่องนี้ไม่มีค่า
   */
  label?: string;
  url: string;
  uploadedAt: string;
}

export interface ConsentRecord {
  version: string;
  acceptedAt: string;
  ip: string;
  userAgent: string;
  items: { id: string; granted: boolean }[];
}

export interface TimelineEntry {
  at: string;
  from: ApplicationStatus | null;
  to: ApplicationStatus;
  by: string;
  note: string;
}

/**
 * สำเนาคำถามที่ผู้สมัครเห็นตอนกรอก — เก็บติดไปกับใบสมัครทุกใบ
 *
 * นี่คือเหตุผลที่แอดมินลบหรือแก้คำถามได้อย่างอิสระ: ใบเก่าไม่ได้อ่านจากคลังคำถาม
 * ปัจจุบัน แต่อ่านจากสำเนานี้ จึงยังแสดงข้อความคำถามและป้ายตัวเลือกตรงตามที่
 * ผู้สมัครเห็นจริงในวันนั้น
 */
export interface QuestionSnapshot {
  key: string;
  section: SectionId;
  label: string;
  kind: QuestionKind;
  options: QuestionOption[];
  sensitive: boolean;
}

/* ------------------------------------------------- ข้อมูลที่อ่านจากเอกสาร */

/**
 * ข้อมูลที่ถอดออกมาจากเอกสารแนบของผู้สมัคร
 *
 * **แยกจาก `answers` โดยตั้งใจ** — `answers` คือสิ่งที่*ผู้สมัครพิมพ์มา* ส่วนนี่คือ
 * สิ่งที่*เอกสารราชการเขียนไว้* · สองอย่างนี้ไม่ตรงกันได้บ่อยกว่าที่คิด (พิมพ์เลข
 * บัตรสลับหลัก ใช้ชื่อเล่น จำวันหมดอายุใบขับขี่ผิด) และเวลาไม่ตรงกัน ฝ่ายบุคคล
 * ต้องเห็นทั้งสองค่าเทียบกัน ไม่ใช่ให้ค่าหนึ่งทับอีกค่าหนึ่งเงียบ ๆ
 *
 * ทุกช่องเป็นสตริงเสมอ ว่างได้หมด — เอกสารที่ถ่ายเบลอครึ่งใบยังต้องเก็บส่วนที่
 * อ่านออกได้ ไม่ใช่ทิ้งทั้งก้อนเพราะมีช่องหนึ่งอ่านไม่ออก
 */
export interface DocumentData {
  /** เลขบัตรประชาชน 13 หลัก (ตัวเลขล้วน) */
  nationalId: string;
  /** ชื่อ–นามสกุลตามบัตร */
  legalName: string;
  /** วันเกิดตามบัตร `YYYY-MM-DD` */
  birthDate: string;
  /** วันหมดอายุบัตรประชาชน `YYYY-MM-DD` */
  idCardExpiry: string;
  /** เลขประจำบ้าน 11 หลัก */
  houseRegNo: string;
  /** ที่อยู่ตามทะเบียนบ้าน */
  address: string;
  /** เลขที่ใบขับขี่ */
  licenseNo: string;
  /** ชนิดใบขับขี่ เช่น ท.2 · บ.3 */
  licenseType: string;
  /** วันหมดอายุใบขับขี่ `YYYY-MM-DD` */
  licenseExpiry: string;
  /** ชื่อธนาคาร */
  bankName: string;
  /** เลขที่บัญชี (ตัวเลขล้วน) */
  bankAccountNo: string;
  /** ชื่อบัญชี — ต้องตรงกับชื่อตามบัตร ไม่งั้นโอนเงินเดือนไม่ผ่าน */
  bankAccountName: string;
}

export const EMPTY_DOCUMENT_DATA: DocumentData = {
  nationalId: "",
  legalName: "",
  birthDate: "",
  idCardExpiry: "",
  houseRegNo: "",
  address: "",
  licenseNo: "",
  licenseType: "",
  licenseExpiry: "",
  bankName: "",
  bankAccountNo: "",
  bankAccountName: "",
};

export type DocumentFieldKind = "text" | "nid" | "digits" | "date";

export interface DocumentField {
  key: keyof DocumentData;
  label: string;
  /** ช่องแนบที่ข้อมูลนี้อ่านมาจาก — ใช้จัดกลุ่มทั้งในกล่องกรอกและในรายงาน */
  slot: string;
  kind: DocumentFieldKind;
  /** จำนวนหลักที่ต้องได้พอดีสำหรับช่องตัวเลขล้วน */
  digits?: number;
  hint?: string;
}

/**
 * ช่องข้อมูลทั้งหมดที่อ่านได้จากเอกสาร — **นิยามที่เดียว**
 *
 * ทั้งกล่องกรอกของฝ่ายบุคคล ตัวตรวจฝั่งเซิร์ฟเวอร์ และส่วนที่พิมพ์ลงรายงาน
 * เดินจากรายการนี้รายการเดียว · เพิ่มช่องใหม่ทีหลังจึงแก้ที่นี่ที่เดียวแล้วทั้ง
 * สามที่ขึ้นตามเอง ไม่มีที่ไหนตกหล่น
 */
export const DOCUMENT_FIELDS: DocumentField[] = [
  {
    key: "nationalId",
    label: "เลขบัตรประชาชน",
    slot: "id_card",
    kind: "nid",
    hint: "13 หลัก ระบบตรวจหลักสุดท้ายให้เอง",
  },
  { key: "legalName", label: "ชื่อ–นามสกุลตามบัตร", slot: "id_card", kind: "text" },
  { key: "birthDate", label: "วันเกิด", slot: "id_card", kind: "date" },
  { key: "idCardExpiry", label: "บัตรหมดอายุ", slot: "id_card", kind: "date" },

  {
    key: "houseRegNo",
    label: "เลขประจำบ้าน",
    slot: "house_reg",
    kind: "digits",
    digits: 11,
  },
  { key: "address", label: "ที่อยู่ตามทะเบียนบ้าน", slot: "house_reg", kind: "text" },

  { key: "licenseNo", label: "เลขที่ใบขับขี่", slot: "license_front", kind: "text" },
  {
    key: "licenseType",
    label: "ชนิดใบขับขี่",
    slot: "license_front",
    kind: "text",
    hint: "เช่น ท.2 · บ.3",
  },
  {
    key: "licenseExpiry",
    label: "ใบขับขี่หมดอายุ",
    slot: "license_front",
    kind: "date",
  },

  { key: "bankName", label: "ธนาคาร", slot: "bank_book", kind: "text" },
  {
    key: "bankAccountNo",
    label: "เลขที่บัญชี",
    slot: "bank_book",
    kind: "digits",
    hint: "10–15 หลัก ตัวเลขล้วน ไม่ต้องใส่ขีด",
  },
  {
    key: "bankAccountName",
    label: "ชื่อบัญชี",
    slot: "bank_book",
    kind: "text",
    hint: "ต้องตรงกับชื่อตามบัตร ไม่งั้นโอนเงินเดือนไม่ผ่าน",
  },
];

/** หลักฐานว่าใครเป็นคนยืนยันข้อมูลชุดนี้ และยืนยันจากอะไร */
export interface DocumentMeta {
  /** `""` = ยังไม่มีใครตรวจ */
  verifiedBy: string;
  verifiedAt: string;
  /** `manual` = ฝ่ายบุคคลพิมพ์เอง · `ocr` = ระบบอ่านจากรูปแล้วมีคนรับรอง */
  source: "manual" | "ocr";
}

export const EMPTY_DOCUMENT_META: DocumentMeta = {
  verifiedBy: "",
  verifiedAt: "",
  source: "manual",
};

/**
 * คะแนน Driver Rating ที่ฝ่ายบุคคลให้เอง (ดู `driver-rating.ts`) — `id` ข้อ → คำตอบที่เลือก
 *
 * เก็บ**ข้อความคำตอบ**จาก master ไม่ใช่ตัวเลข — เซิร์ฟเวอร์คิดคะแนนจาก master เอง
 * คนยิง API จึงส่งคะแนนปลอมมาไม่ได้ และ master เปลี่ยนคะแนนทีหลังก็ตามได้ทันที ·
 * ข้อที่ไม่มีในนี้ใช้คำตอบจากฟอร์มสมัคร (ถ้าฟอร์มมีข้อนั้น)
 */
export interface RatingRecord {
  answers: Record<string, string>;
  /** ใครประเมินล่าสุด · `""` = ยังไม่เคยมีใครให้คะแนนเอง */
  by: string;
  at: string;
}

export const EMPTY_RATING: RatingRecord = { answers: {}, by: "", at: "" };

/** สรุป Driver Rating สำหรับตาราง — คำนวณตอนอ่าน (ดู `summarizeRating()`) */
export interface RatingSummary {
  /** คะแนนเฉลี่ย (เฉลี่ยของค่าเฉลี่ยแต่ละหมวด) · `null` = ยังไม่มีข้อไหนได้คะแนน */
  average: number | null;
  /** ระดับตามเกณฑ์แปลผล เช่น `ดี` · `""` เมื่อยังไม่มีคะแนน */
  level: string;
  /** ข้อที่มีคะแนนแล้ว / ทั้งหมด */
  scored: number;
  count: number;
  /** ผลรวมคะแนนของข้อที่มีคะแนน · เต็ม `count × 5` */
  total: number;
}

export interface Application {
  id: string;
  ref: string;
  status: ApplicationStatus;
  /** ชื่อ–นามสกุลที่ประกอบแล้ว (ดู `composeName()` ใน `form.ts`) */
  fullName: string;
  phone: string;
  /** ชื่อเจ้าหน้าที่ที่รับผิดชอบโทรกลับ · `""` = ยังไม่มีใครรับเรื่อง */
  contactOwner: string;
  interview: InterviewRecord;
  exitReason: ExitReason;
  /** เหตุผลที่พิมพ์เอง — มีค่าเฉพาะเมื่อ `exitReason === "other"` (อ่านผ่าน `exitReasonText()`) */
  exitReasonNote: string;
  /**
   * ขึ้น Blacklist — ถามพร้อมเหตุผลตอนฝ่ายบุคคลกดยกเลิก (29 ก.ย. 2026) · มีความหมาย
   * เฉพาะใบที่ `cancelled` ใบที่กลับเข้าสายถูกล้างเป็น `false` เหมือน `exitReason`
   * · ตอนนี้ใช้แสดงผลอย่างเดียว ยังไม่ได้กันคนที่ติด Blacklist สมัครใหม่
   */
  blacklist: boolean;
  answers: AnswerMap;
  questionSnapshot: QuestionSnapshot[];
  /** คะแนน Driver Rating ที่ฝ่ายบุคคลให้จากการสัมภาษณ์ (ดู `RatingRecord`) */
  rating: RatingRecord;
  files: ApplicationFile[];
  /** ข้อมูลที่อ่าน/กรอกจากเอกสารแนบ (ดู `DocumentData`) */
  documents: DocumentData;
  documentMeta: DocumentMeta;
  consent: ConsentRecord;
  timeline: TimelineEntry[];
  /**
   * ผู้สมัครกดยกเลิกเองแล้วข้อมูลถูกลบทิ้งตามคำขอ — **ใบนี้แก้อะไรไม่ได้อีก**
   * คนละเรื่องกับ `status === "cancelled"` เฉย ๆ ซึ่งเป็นการยกเลิกโดยฝ่ายบุคคล
   * และคำตอบทั้งใบยังอยู่ครบ
   */
  erased: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * รูปย่อที่ตารางแอดมินใช้ — ไม่ลากคำตอบทั้งใบมาทั้งที่ตารางแสดงไม่กี่คอลัมน์
 *
 * คอลัมน์กลางตาราง (`workZone` / `readyToStart`) ถูก**คลี่ออกมาเป็นฟิลด์ชื่อจริง**
 * แทนที่จะเป็นแผนที่ตามคีย์คำถาม เพราะคีย์ในคลังคำถามถูกสร้างใหม่ทุกครั้งที่
 * ฝ่ายบุคคลลบแล้วเพิ่มข้อนั้นกลับเข้ามา — ตารางที่ผูกกับคีย์ตรง ๆ จะกลายเป็น “—”
 * ทั้งคอลัมน์เงียบ ๆ โดยไม่มีใครรู้ (ดูวิธีหาข้อที่ `ROLE_MATCHERS` ใน `form.ts`)
 */
export interface ApplicationSummary {
  id: string;
  ref: string;
  status: ApplicationStatus;
  fullName: string;
  phone: string;
  /** เขตงานที่ผู้สมัครสนใจ — จากคำถาม “คุณสนใจทำงานเขตไหน” */
  workZone: string;
  /** ความพร้อมเริ่มงาน — `YYYY-MM-DD` ถ้าตอบเป็นวันที่ ไม่งั้นเป็นข้อความตามที่ตอบ */
  readyToStart: string;
  contactOwner: string;
  interview: InterviewRecord;
  exitReason: ExitReason;
  /** เหตุผลที่พิมพ์เอง (ดู `Application.exitReasonNote`) */
  exitReasonNote: string;
  /** ขึ้น Blacklist หรือไม่ (ดู `Application.blacklist`) */
  blacklist: boolean;
  /** สรุป Driver Rating — ปุ่มดาวในคอลัมน์จัดการอ่านจากนี่ */
  rating: RatingSummary;
  fileCount: number;
  /** ผู้สมัครกดยกเลิกเองและข้อมูลถูกลบแล้ว — แถวนี้ล็อกทั้งแถว (ดู `Application`) */
  erased: boolean;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ หมวดคำถาม */

/**
 * สามหมวดของคำถาม — **คงที่ ไม่ให้แอดมินเพิ่มเอง**
 *
 * เพราะแต่ละหมวดคือหนึ่งหน้าจอบนมือถือ และลำดับหน้าจอถูกออกแบบมาให้ถามของง่าย
 * ก่อนของยาก (ดู `APPLY_STAGES` ใน `form.ts`) การเปิดให้เพิ่มหมวดได้เท่ากับเปิดให้
 * ฟอร์มยาวขึ้นเรื่อย ๆ ซึ่งเป็นสิ่งเดียวที่ทำให้คนขับกรอกไม่จบ
 */
export const QUESTION_SECTIONS = [
  {
    id: "identity",
    title: "ประวัติส่วนตัว (ผู้สมัคร)",
    lead: "คุณชื่ออะไร ติดต่อทางไหน",
  },
  {
    id: "license",
    title: "ประสบการณ์การทำงานและทักษะของคุณ",
    lead: "คุณขับอะไรได้บ้าง",
  },
  {
    id: "ready",
    title: "ข้อมูลเพิ่มเติม",
    lead: "พร้อมเริ่มงานเมื่อไหร่ ที่ไหน",
  },
] as const;

export type SectionId = (typeof QUESTION_SECTIONS)[number]["id"];

export function isSectionId(v: unknown): v is SectionId {
  return QUESTION_SECTIONS.some((s) => s.id === v);
}

export function sectionTitle(id: SectionId): string {
  return QUESTION_SECTIONS.find((s) => s.id === id)?.title ?? id;
}

/* ------------------------------------------------------ นำเข้าจาก Google Form */

/**
 * ผลการนำเข้าไฟล์ใบสมัครจาก Google Form (ชีต “การตอบแบบฟอร์ม 1”) — **สัญญาระหว่าง
 * `form-import.ts` กับปุ่มนำเข้าบนหน้าผู้สมัคร** · ตรวจไฟล์ (`committed: false`)
 * กับนำเข้าจริงคืนรูปเดียวกัน หน้าจอจึงแสดงผลตรวจแล้วค่อยให้กดยืนยันได้โดยไม่ต้อง
 * เดาว่าตอนเขียนจริงจะได้ตัวเลขเท่าไหร่
 *
 * กติกาที่เจ้าของงานกำหนด (29 ก.ย. 2026):
 * เจอในทะเบียน พจส. (ชื่อ-นามสกุล **หรือ** เบอร์ตรง) → ฝึกงาน = `training` ·
 * ทำงานอยู่ = `working` · พ้นสภาพแล้ว = ไม่นำเข้า · ไม่เจอ → ส่งมาภายใน
 * `recentDays` วัน = `pending_contact` ไม่งั้นไม่นำเข้า
 *
 * Sync รอบถัดไป (20 ต.ค. 2026 · Bew): ใบที่ส่งหลังใบล่าสุดที่เคยนำเข้า (`since`) หรือแถวที่วางมาเอง
 * = ใบใหม่ → `pending_contact` แม้เจอในทะเบียนว่าพ้นสภาพแล้ว (สมัครกลับมาใหม่) · แถวที่ชีตเขียนว่า
 * แบล็คลิส/Black List = `blacklist` → ใบ “ยกเลิก” ติด Blacklist ไม่ว่าส่งมาเมื่อไหร่
 */
export type ImportOutcome = "training" | "working" | "pending_contact" | "blacklist";

export type ImportSkipReason =
  /** แถวที่นำเข้าไปแล้วรอบก่อน (เวลาส่ง + เบอร์เดิม) */
  | "already_imported"
  /** เจอในทะเบียน พจส. แต่พ้นสภาพแล้ว */
  | "resigned"
  /** ไม่เจอในทะเบียน และเก่ากว่า `recentDays` */
  | "not_found_old"
  /** คนเดียวกันส่งหลายใบ — เก็บใบล่าสุดใบเดียว */
  | "duplicate"
  /** อ่านชื่อหรือเวลาที่ส่งไม่ได้ */
  | "invalid";

export interface ImportRow {
  /** เลขแถวในชีต (แถวหัวตาราง = 1) — ใช้บอกฝ่ายบุคคลว่าไปดูแถวไหน */
  row: number;
  submittedAt: string;
  fullName: string;
  phone: string;
  outcome: ImportOutcome | null;
  skip: ImportSkipReason | null;
  /** จับคู่กับทะเบียน พจส. ด้วยอะไร — `name` / `phone` ตัวเดียวควรให้คนตรวจด้วยตา */
  matchedBy: "name+phone" | "name" | "phone" | null;
  driverCode: string;
  driverName: string;
  /** รหัสสถานะล่าสุดจาก ATMS เช่น `A` `ฝ` `ลอ` */
  workStatus: string;
  /** ใบใหม่ที่ชื่อ/เบอร์ตรงกับคนติด Blacklist — เช่น `DRV-69-0012 สมชาย ใจดี (เบอร์)` */
  blacklistHit?: string;
  /** สถานะที่ฝ่ายบุคคลเขียนไว้ในชีต (คอลัมน์ “สถานะสัมภาษณ์”) */
  sheetStatus?: string;
}

export interface ImportAnswerStat {
  label: string;
  /** ตรงกับตัวเลือกพอดี (ไม่นับขีด/ช่องว่าง) */
  matched: number;
  /** คำจากฟอร์มรุ่นเก่าที่แปลงเป็นตัวเลือกปัจจุบัน */
  mapped: number;
  /** ไม่ตรงตัวเลือกใด — เก็บข้อความตามที่ผู้สมัครพิมพ์ */
  raw: number;
}

export interface ImportReport {
  committed: boolean;
  /** `importBatch` ของรอบนี้ — ลบย้อนหลังทั้งรอบได้ด้วยค่านี้ (ว่างตอนตรวจไฟล์) */
  batch: string;
  sheet: string;
  recentDays: number;
  /** ใบที่ส่งหลังเวลานี้ = ใบใหม่ (ใบล่าสุดที่เคยนำเข้า) · `null` = ทุกแถวที่วางมาเป็นใบใหม่ */
  since: string | null;
  totalRows: number;
  counts: Record<ImportOutcome, number>;
  skipped: Record<ImportSkipReason, number>;
  /** ทุกแถวที่จะนำเข้า + แถวที่ข้ามเพราะ `resigned` / `duplicate` (ไม่รวมแถวเก่าที่ไม่เจอ) */
  rows: ImportRow[];
  answers: ImportAnswerStat[];
  warnings: string[];
}
