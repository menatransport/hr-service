/**
 * เอกสาร HR ที่ออกจากใบสมัคร — รายงานผู้สมัคร · สัญญาจ้าง · สัญญาค้ำ · ยินยอมคืนเงินค้ำ
 * (รายงานผู้สมัครอยู่ที่ `hr-document-profile.tsx` · สัญญาสามฉบับอยู่ที่
 * `hr-document-contracts.tsx`)
 *
 * > **ใบสมัคร (`HR0221-04`) ถูกถอดออกจากรายการตามคำสั่งเจ้าของงาน (29 ก.ย. 2026)**
 * > แม่แบบยังเก็บไว้ที่ `hr-document-application.tsx` แต่ไม่มีใครเรียกแล้ว ·
 * > `ApplicantFacts` กับ `appliedPosition` / `expectedSalary` ใน `DocFill` คงไว้
 * > ให้แม่แบบนั้นยังคอมไพล์ผ่าน · จะเปิดกลับ: เพิ่มรายการใน `HR_DOCUMENTS` แล้วเพิ่ม
 * > ชุดช่องใน `hr-document-maker.tsx` · **อย่าเปิดกลับเองถ้าไม่ได้สั่ง**
 *
 * ไฟล์นี้คือ **ข้อมูลกับกติกาล้วน** ส่วนหน้ากระดาษอยู่ที่ `hr-document-contracts.tsx`
 * และกล่องกรอกอยู่ที่ `hr-document-maker.tsx` · แยกออกมาเพราะทั้งสองฝั่งใช้ร่วมกัน
 *
 * **แม่แบบลอกจากเอกสารจริงของฝ่ายบุคคล** (`HR0221-04` · `HR 0204-04` · `HR0207-04`
 * และหนังสือยินยอมขยายระยะเวลาคืนเงินประกัน) — ถ้อยคำในสัญญาห้ามแต่งเอง
 * แก้ได้เฉพาะช่องที่เอกสารจริงเว้นไว้ให้เติม
 *
 * **ไม่บันทึกลงฐานข้อมูล** — ค่าที่กรอกอยู่แค่ในกล่องจนกว่าจะพิมพ์ ฉบับที่เซ็นแล้ว
 * คือกระดาษ · ค่าฝั่งบริษัท (ผู้ลงนาม · พยาน · เงินประกัน) จำไว้ในเครื่องให้
 * ครั้งหน้าไม่ต้องพิมพ์ซ้ำ (ดู `rememberCompanyFill()`)
 */

import { digitsOnly, displayAnswer, findByRole, formatNationalId, formatPhone } from "./form";
import { customerLabel, positionLabel, type Requisition } from "./requisitions/types";
import type { Application, QuestionSnapshot } from "./types";

/**
 * ตำแหน่งจากคำขอสรรหา — `Cpac MS บางจาก` (ลูกค้า + ตำแหน่ง + แพล้น)
 *
 * **ใช้เฉพาะค่าที่มีในคำขอจริง** — ไม่เติมคำนำหน้าอย่าง “พจส.” เอง เพราะคำขอ
 * ไม่ได้เก็บค่านั้นไว้ (ถอดออกตามคำสั่งเจ้าของงาน 29 ก.ย. 2026)
 */
export function requisitionPosition(r: Requisition): string {
  return [customerLabel(r), positionLabel(r), r.plant]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
}

/* ------------------------------------------------------------------ ชุดเอกสาร */

export const HR_DOCUMENTS = [
  {
    /* รายงานผู้สมัคร — ย้ายมาจากปุ่มรายงานในตาราง (29 ก.ย. 2026) · อ่านจากใบสมัคร
       ตรง ๆ ไม่มีช่องให้เติม แก้ข้อมูลได้ที่ใบสมัครผ่านปุ่มในแผงซ้าย */
    id: "profile",
    label: "รายงานผู้สมัคร",
    code: "",
    hint: "สรุปข้อมูลที่ผู้สมัครกรอกฟอร์มเข้ามา",
  },
  {
    /* แบบประเมินผู้สมัคร 20 ข้อ — master อยู่ที่ `driver-rating.json` · ข้อที่ฟอร์ม
       ถามอยู่แล้วคิดคะแนนให้เอง ที่เหลือให้คะแนนในแผงซ้ายแล้วบันทึกลงใบสมัคร */
    id: "rating",
    label: "Driver Rating",
    code: "",
    hint: "ประเมินผู้สมัคร 20 ข้อ 4 หมวด คะแนน 1–5",
  },
  {
    id: "contract",
    label: "สัญญาจ้าง",
    code: "HR 0204-04",
    hint: "บันทึกข้อตกลงการจ้างงาน (กลุ่ม C)",
  },
  {
    id: "deposit",
    label: "สัญญาค้ำ",
    code: "HR0207-04",
    hint: "หนังสือยินยอมหักเงินประกันความเสียหาย",
  },
  {
    id: "refund",
    label: "ยินยอมคืนเงินค้ำ",
    code: "",
    hint: "หนังสือยินยอมขยายระยะเวลาคืนเงินประกัน",
  },
] as const;

export type HrDocId = (typeof HR_DOCUMENTS)[number]["id"];

/* ------------------------------------------------------------ ค่าที่เติมลงเอกสาร */

/**
 * ทุกช่องที่เติมลงเอกสาร — ฝ่ายบุคคลแก้ได้ทุกช่องในกล่องก่อนพิมพ์
 *
 * วันที่เป็น `YYYY-MM-DD` (ค.ศ.) เหมือนทั้งระบบ แปลงเป็น พ.ศ. ตอนวาดลงกระดาษ ·
 * จำนวนเงินเป็นตัวเลข เพราะต้องเอาไปอ่านเป็นคำ (`bahtText`) ด้วย
 */
export interface DocFill {
  /** วันที่ทำเอกสาร — หัวสัญญาจ้าง · สัญญาค้ำ · หนังสือยินยอม */
  docDate: string;

  title: string;
  firstName: string;
  lastName: string;
  age: string;
  nationalId: string;
  address: string;

  /** ใบสมัคร — “สมัครงานตำแหน่ง” เช่น `Cpac MS บางจาก` (จาก `requisitionPosition()`) */
  appliedPosition: string;
  expectedSalary: string;

  /** สัญญาจ้าง */
  position: string;
  salary: number | null;
  startDate: string;
  probationDays: number | null;
  group: string;
  supervisor: string;
  supervisorTitle: string;
  guarantor: string;

  /** สัญญาค้ำ / ยินยอมคืนเงินค้ำ */
  deposit: number | null;
  installment: number | null;
  deductFrom: string;

  /** ผู้ลงนามฝั่งบริษัท */
  employer: string;
  witness1: string;
  witness2: string;
}

/**
 * ค่าฝั่งบริษัทตั้งต้น — **คัดจากเอกสารตัวอย่างที่ฝ่ายบุคคลใช้จริง** (มิ.ย. 2569)
 * เปลี่ยนคนเซ็นเมื่อไหร่ แก้ในกล่องครั้งเดียว เครื่องนั้นจะจำค่าใหม่ไว้เอง
 */
const COMPANY_DEFAULTS = {
  position: "พนักงานจัดส่ง",
  salary: 2500,
  probationDays: 119,
  group: "C",
  supervisor: "นางสาว ศิริพรรณ พิชนนาค",
  supervisorTitle: "ผู้จัดการฝ่ายจัดส่ง",
  deposit: 30000,
  installment: 500,
  employer: "นาย ศักดิ์ดาเดช แสงดิษฐ",
  witness1: "นางสาว อารยา สงัดกิจ",
  witness2: "นางสาว นพวรรณ เถาเบา",
} satisfies Partial<DocFill>;

type CompanyFill = typeof COMPANY_DEFAULTS;
const COMPANY_KEYS = Object.keys(COMPANY_DEFAULTS) as (keyof CompanyFill)[];

const STORAGE_KEY = "hrs.recruitment.hr-docs.company";

/** ค่าฝั่งบริษัทที่เครื่องนี้เคยใช้ล่าสุด — อ่านไม่ได้ก็ถอยไปค่าตั้งต้นเงียบ ๆ */
function recalledCompanyFill(): CompanyFill {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return COMPANY_DEFAULTS;
    const saved = JSON.parse(raw) as Partial<CompanyFill>;
    const merged = { ...COMPANY_DEFAULTS };
    for (const key of COMPANY_KEYS) {
      const value = saved[key];
      if (typeof value === typeof COMPANY_DEFAULTS[key]) {
        (merged as Record<string, unknown>)[key] = value;
      }
    }
    return merged;
  } catch {
    return COMPANY_DEFAULTS;
  }
}

/** จำค่าฝั่งบริษัทไว้ในเครื่องนี้ — เรียกตอนสั่งพิมพ์ ไม่ใช่ทุกครั้งที่พิมพ์ตัวอักษร */
export function rememberCompanyFill(fill: DocFill) {
  try {
    const picked = Object.fromEntries(COMPANY_KEYS.map((k) => [k, fill[k]]));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(picked));
  } catch {
    /* โหมดส่วนตัว/บล็อกที่เก็บข้อมูล — ครั้งหน้าก็แค่ได้ค่าตั้งต้น */
  }
}

/* --------------------------------------------------------- ข้อมูลจากใบสมัคร */

/**
 * คำตอบของผู้สมัครที่เอกสารต้องใช้ — ถอดจากใบสมัครครั้งเดียวตอนเปิดกล่อง
 *
 * คลังคำถามจริงใช้คีย์สุ่ม (`q_9fa9fa22cc`) ที่เปลี่ยนทุกครั้งที่ลบแล้วเพิ่มข้อ
 * กลับเข้ามา จึงหาข้อด้วย**ข้อความคำถาม** ท่าเดียวกับ `findByRole()` ใน `form.ts`
 * · ข้อไหนหาไม่เจอหรือไม่ได้ตอบ = `""` แล้วเอกสารเว้นเส้นประไว้ให้เขียนมือ
 */
export interface ApplicantFacts {
  ref: string;
  writtenOn: string;
  title: string;
  firstName: string;
  lastName: string;
  nickname: string;
  phone: string;
  regAddress: string;
  curAddress: string;
  birthDate: string;
  age: string;
  religion: string;
  marital: string;
  height: string;
  weight: string;
  nationalId: string;
  idCardExpiry: string;
  licenseType: string;
  education: string;
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelation: string;
  prevCompany: string;
  prevTenure: string;
  prevIncome: string;
  vehicleTypes: string;
  exitReason: string;
  /** ตอบตัวเลือกแรก (= ไม่เคยมีประวัติ) หรือเปล่า · `null` = ไม่ได้ตอบ */
  criminalClean: boolean | null;
  criminal: string;
  healthy: boolean | null;
  health: string;
  vehicle: string;
  source: string;
  friend: string;
  workZone: string;
  readyToStart: string;
  portraitUrl: string;
  /** ช่องเอกสารที่แนบมาแล้ว — ใช้ติ๊ก “เอกสารที่แนบมาด้วย” ท้ายใบสมัคร */
  attached: string[];
  /** คำถาม–คำตอบของหมวดประสบการณ์และความพร้อม — หน้าสรุปผลสัมภาษณ์ */
  summary: { section: QuestionSnapshot["section"]; label: string; answer: string }[];
  interviewNote: string;
}

interface WordRule {
  includes: string[];
  excludes?: string[];
}

const FACT_RULES = {
  title: { includes: ["คำนำหน้า"] },
  nickname: { includes: ["ชื่อเล่น"] },
  regAddress: { includes: ["ที่อยู่", "ทะเบียนบ้าน"] },
  curAddress: { includes: ["ที่อยู่ปัจจุบัน"] },
  age: { includes: ["อายุ"], excludes: ["หมดอายุ"] },
  birthDate: { includes: ["เกิด"], excludes: ["อุบัติเหตุ"] },
  religion: { includes: ["ศาสนา"] },
  marital: { includes: ["สถานภาพ"] },
  height: { includes: ["ส่วนสูง"] },
  weight: { includes: ["น้ำหนัก"] },
  education: { includes: ["การศึกษา"] },
  emergencyName: { includes: ["ฉุกเฉิน", "ชื่อ"] },
  emergencyPhone: { includes: ["ฉุกเฉิน", "เบอร์"] },
  emergencyRelation: { includes: ["ฉุกเฉิน", "ความสัมพันธ์"] },
  prevCompany: { includes: ["ประสบการณ์", "บริษัท"], excludes: ["มีนา"] },
  prevTenure: { includes: ["ระยะเวลาที่ทำงาน"] },
  prevIncome: { includes: ["รายได้"] },
  vehicleTypes: { includes: ["ขับรถประเภท"], excludes: ["เกียร์"] },
  exitReason: { includes: ["ลาออก"] },
  criminal: { includes: ["อาชญากรรม"] },
  health: { includes: ["ป่วย"] },
  vehicle: { includes: ["ยานพาหนะ"] },
  source: { includes: ["ทราบข่าว"] },
  friend: { includes: ["เพื่อน", "ชื่อ"] },
} satisfies Record<string, WordRule>;

function findByWords(snapshot: QuestionSnapshot[], rule: WordRule) {
  return snapshot.find(
    (q) =>
      rule.includes.every((word) => q.label.includes(word)) &&
      !rule.excludes?.some((word) => q.label.includes(word)),
  );
}

export function readApplicantFacts(application: Application): ApplicantFacts {
  const snapshot = application.questionSnapshot;
  const { answers, documents } = application;

  const text = (q: QuestionSnapshot | undefined) => {
    if (!q) return "";
    const value = displayAnswer(answers[q.key], q.options);
    return value === "—" ? "" : value;
  };
  const byWords = (rule: WordRule) => text(findByWords(snapshot, rule));

  /** ตอบตัวเลือกแรกของข้อนี้ไหม — ข้อสุขภาพ/อาชญากรรม ตัวเลือกแรกคือ “ปกติ” */
  const firstOption = (rule: WordRule): boolean | null => {
    const q = findByWords(snapshot, rule);
    const raw = q ? answers[q.key] : undefined;
    if (!q || typeof raw !== "string" || !raw) return null;
    return q.options[0]?.value === raw;
  };

  const nidQuestion = snapshot.find((q) => q.kind === "nid" || q.key === "national_id");
  const nid = digitsOnly(documents.nationalId || text(nidQuestion));
  const birth = documents.birthDate || byWords(FACT_RULES.birthDate);
  const vehicleTypes = findByWords(snapshot, FACT_RULES.vehicleTypes);
  const firstVehicle = vehicleTypes ? answers[vehicleTypes.key] : undefined;

  return {
    ref: application.ref,
    writtenOn: bangkokDay(application.createdAt),
    title: byWords(FACT_RULES.title),
    firstName: text(snapshot.find((q) => q.key === "full_name")) || application.fullName,
    lastName: text(findByRole(snapshot, "last_name")),
    nickname: byWords(FACT_RULES.nickname),
    phone: application.phone ? formatPhone(application.phone) : "",
    regAddress: documents.address || byWords(FACT_RULES.regAddress),
    curAddress: byWords(FACT_RULES.curAddress),
    birthDate: birth,
    age: ageOn(birth, todayIso()) ?? byWords(FACT_RULES.age),
    religion: byWords(FACT_RULES.religion),
    marital: byWords(FACT_RULES.marital),
    height: byWords(FACT_RULES.height),
    weight: byWords(FACT_RULES.weight),
    nationalId: nid.length === 13 ? formatNationalId(nid) : nid,
    idCardExpiry: documents.idCardExpiry,
    licenseType: documents.licenseType,
    education: byWords(FACT_RULES.education),
    emergencyName: byWords(FACT_RULES.emergencyName),
    emergencyPhone: formatPhone(byWords(FACT_RULES.emergencyPhone)),
    emergencyRelation: byWords(FACT_RULES.emergencyRelation),
    prevCompany: byWords(FACT_RULES.prevCompany),
    prevTenure: byWords(FACT_RULES.prevTenure),
    prevIncome: byWords(FACT_RULES.prevIncome),
    /* ตำแหน่งในตารางประสบการณ์ใช้แค่ชนิดรถแรกที่ตอบ — ช่องบนกระดาษแคบ */
    vehicleTypes:
      vehicleTypes && Array.isArray(firstVehicle) && firstVehicle.length
        ? displayAnswer(firstVehicle[0], vehicleTypes.options)
        : text(vehicleTypes),
    exitReason: byWords(FACT_RULES.exitReason),
    criminalClean: firstOption(FACT_RULES.criminal),
    criminal: byWords(FACT_RULES.criminal),
    healthy: firstOption(FACT_RULES.health),
    health: byWords(FACT_RULES.health),
    vehicle: byWords(FACT_RULES.vehicle),
    source: byWords(FACT_RULES.source),
    friend: byWords(FACT_RULES.friend),
    workZone: text(findByRole(snapshot, "work_zone")),
    readyToStart: text(findByRole(snapshot, "ready_date")),
    portraitUrl: application.files.find((f) => f.slot === "portrait")?.url ?? "",
    attached: application.files.map((f) => f.slot),
    summary: snapshot
      .filter((q) => q.section !== "identity" && !q.sensitive)
      .map((q) => ({ section: q.section, label: q.label.trim(), answer: text(q) }))
      .filter((row) => row.answer),
    interviewNote: application.interview.note,
  };
}

/** ค่าเริ่มต้นของกล่องกรอก — ข้อมูลผู้สมัคร + ค่าฝั่งบริษัทที่เครื่องนี้จำไว้ */
export function initialDocFill(facts: ApplicantFacts, appliedPosition: string): DocFill {
  const today = todayIso();
  const company = recalledCompanyFill();
  const ready = /^\d{4}-\d{2}-\d{2}$/.test(facts.readyToStart) ? facts.readyToStart : "";

  return {
    docDate: today,
    title: facts.title,
    firstName: facts.firstName,
    lastName: facts.lastName,
    age: facts.age,
    nationalId: facts.nationalId,
    address: facts.regAddress,
    appliedPosition,
    expectedSalary: "",
    ...company,
    startDate: ready && ready > today ? ready : today,
    guarantor: "",
    deductFrom: "",
  };
}

/** `นาย สุไลมาน พุดารอ` — คำนำหน้าชิดชื่อได้ถ้าเป็นตัวย่อ (`น.ส.สมหญิง`) */
export function personName(fill: Pick<DocFill, "title" | "firstName" | "lastName">): string {
  return [fill.title, fill.firstName, fill.lastName]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
}

/* ---------------------------------------------------------------- วันที่ไทย */

export const THAI_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** วันนี้ตามเวลาไทย `YYYY-MM-DD` — เลื่อนเวลา +7 ชม. เองแทน `Intl` ตามกฎของโปรเจกต์ */
export function todayIso(): string {
  return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** ประทับเวลา ISO → วันตามปฏิทินไทย `YYYY-MM-DD` */
function bangkokDay(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? "" : new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** ส่วนของวันที่แบบเอกสาร — `{ day: "26", month: "มิถุนายน", year: "2569" }` */
export function thaiDateParts(iso: string): { day: string; month: string; year: string } | null {
  const m = ISO_DAY.exec(iso.trim());
  if (!m) return null;
  return {
    day: String(Number(m[3])),
    month: THAI_MONTHS[Number(m[2]) - 1] ?? "",
    year: String(Number(m[1]) + 543),
  };
}

/** `2026-06-26` → `26 มิถุนายน 2569` · ค่าที่ไม่ใช่วันที่คืนตามเดิม (“ทันที”) */
export function thaiLongDate(iso: string): string {
  const parts = thaiDateParts(iso);
  return parts ? `${parts.day} ${parts.month} ${parts.year}` : iso.trim();
}

/** ประทับเวลา ISO → `15 กันยายน 2569 เวลา 09:41 น.` (เวลาไทย) · ค่าเสีย = `""` */
export function thaiDateTime(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const local = new Date(ms + 7 * 3_600_000).toISOString();
  return `${thaiLongDate(local.slice(0, 10))} เวลา ${local.slice(11, 16)} น.`;
}

/**
 * ประทับเวลา ISO → `29/9/2569 14:05` (เวลาไทย) แบบสั้นสำหรับรายการแคบ ๆ · ค่าเสีย = `""`
 *
 * ใช้กับเวลาที่เก็บเป็น ISO มีโซนจริง (`…Z`) เท่านั้น — **ห้ามใช้ `formatDateTime()`
 * ของ `lib/case-flow.ts`** กับค่าพวกนี้ ตัวนั้นเลื่อน 14 ชม. ไว้แก้เวลาไม่มีโซนของ NCAC
 * ใช้กับ ISO จริงแล้วเวลาเกินไป 7 ชม. (เคยพลาดที่ประวัติการพิมพ์ 29 ก.ย. 2026)
 */
export function thaiShortDateTime(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const local = new Date(ms + 7 * 3_600_000).toISOString();
  const [y, m, d] = local.slice(0, 10).split("-").map(Number);
  return `${d}/${m}/${y + 543} ${local.slice(11, 16)}`;
}

/** บวกวันตามปฏิทิน — ทำบน UTC ล้วน ไม่มีเรื่องเวลาออมแสงมาเลื่อนวัน */
export function addDays(iso: string, days: number): string {
  const m = ISO_DAY.exec(iso);
  if (!m) return "";
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** อายุเต็มปี ณ วันที่กำหนด · วันเกิดไม่ถูกรูป = `null` */
export function ageOn(birthIso: string, onIso: string): string | null {
  const b = ISO_DAY.exec(birthIso);
  const o = ISO_DAY.exec(onIso);
  if (!b || !o) return null;
  let age = Number(o[1]) - Number(b[1]);
  if (`${o[2]}${o[3]}` < `${b[2]}${b[3]}`) age -= 1;
  return age > 0 && age < 120 ? String(age) : null;
}

/**
 * วันสิ้นสุดทดลองงาน — **เริ่ม + จำนวนวัน** ตามเอกสารจริง
 * (26 มิ.ย. 2569 + 119 วัน = 23 ต.ค. 2569 ในสัญญาตัวอย่าง)
 */
export function probationEnd(fill: Pick<DocFill, "startDate" | "probationDays">): string {
  return fill.probationDays ? addDays(fill.startDate, fill.probationDays) : "";
}

/* ------------------------------------------------------------ จำนวนเงินเป็นคำ */

const DIGIT_WORDS = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const PLACE_WORDS = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

/** 0–999,999 เป็นคำ — กติกา “สิบ/ยี่สิบ/เอ็ด” ของการอ่านจำนวนเงินไทย */
function underMillion(n: number): string {
  const s = String(n);
  let out = "";
  for (let i = 0; i < s.length; i += 1) {
    const d = Number(s[i]);
    const place = s.length - i - 1;
    if (!d) continue;
    if (place === 1 && d === 1) out += "สิบ";
    else if (place === 1 && d === 2) out += "ยี่สิบ";
    else if (place === 0 && d === 1 && s.length > 1) out += "เอ็ด";
    else out += DIGIT_WORDS[d] + PLACE_WORDS[place];
  }
  return out;
}

function numberWords(n: number): string {
  if (n >= 1_000_000) {
    return `${numberWords(Math.floor(n / 1_000_000))}ล้าน${underMillion(n % 1_000_000)}`;
  }
  return underMillion(n);
}

/** `30000` → `สามหมื่นบาทถ้วน` — รับเฉพาะจำนวนเต็มบาท (เอกสารชุดนี้ไม่มีสตางค์) */
export function bahtText(n: number | null): string {
  if (n === null || !Number.isFinite(n) || n < 0) return "";
  const whole = Math.floor(n);
  return whole === 0 ? "ศูนย์บาทถ้วน" : `${numberWords(whole)}บาทถ้วน`;
}

/** `30000` → `30,000` — คั่นหลักพันเองแทน `Intl` */
export function money(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "";
  return String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
