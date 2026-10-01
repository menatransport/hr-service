import { addDays, todayIso } from "./hr-documents";
import type { DriverRecord } from "./drivers/types";

/**
 * เอกสารตอนพ้นสภาพ — ใบลาออกพนักงานจัดส่ง (HR0501-07) + แบบสอบถามพนักงานลาออก
 * (HR0233-00) · กล่องกรอกอยู่ที่ `resign-document-maker.tsx` กระดาษอยู่ที่
 * `resign-document-papers.tsx` (client-safe: มีแต่ชนิด ค่าคงที่ และตัวเติมค่าตั้งต้น)
 *
 * ท่าเดียวกับ “ทำเอกสาร” ของผู้สมัคร (`hr-documents.ts`) — ซ้ายกรอก ขวากระดาษ พิมพ์ทีละฉบับ
 * ต่างกันตรงที่ **ยังไม่บันทึกลงฐาน** (1 ต.ค. 2026): ค่าอยู่ในกล่องจนกว่าจะปิด
 * ฉบับที่เซ็นแล้วคือกระดาษ แนบกลับเข้าแฟ้มได้ที่ช่อง “ใบลาออก / หนังสือแจ้งพ้นสภาพ”
 * ในหน้าประวัติ · ชื่อผู้ลงนามฝั่งบริษัทจำไว้ในเครื่อง (`rememberResignSigners()`)
 */

export const RESIGN_DOCUMENTS = [
  {
    id: "letter",
    label: "ใบลาออกพนักงานจัดส่ง",
    code: "HR0501-07",
    hint: "Driver Resignation Form",
  },
  {
    id: "interview",
    label: "แบบสอบถามพนักงานลาออก",
    code: "HR0233-00",
    hint: "Exit Interview Form",
  },
] as const;

export type ResignDocId = (typeof RESIGN_DOCUMENTS)[number]["id"];

/* ------------------------------------------------- ตัวเลือกบนแบบสอบถาม */

/**
 * เหตุผลหลักห้าหมวดบนแบบสอบถาม — **ลอกจากกระดาษต้นฉบับทุกคำ เรียงตามช่องในตาราง**
 *
 * เป็นคนละชุดกับ Reason Code Master (`resign-reasons/`) โดยตั้งใจ: master คือรหัสที่
 * ฝ่ายบุคคลเลือกตอนบันทึกพ้นสภาพ ส่วนนี่คือช่องที่พิมพ์อยู่บนแบบฟอร์มของฝ่ายบุคคล
 * จับคู่กันไม่ได้หนึ่งต่อหนึ่ง จึง **ไม่ติ๊กให้เองจากรหัสที่บันทึกไว้** · หมวดละช่อง
 * “อื่นๆ” อยู่ท้ายเสมอ (ช่องพิมพ์ใน `otherReasons`)
 */
export const EXIT_REASON_GROUPS: { id: string; label: string; options: string[] }[] = [
  {
    id: "personal",
    label: "1.ปัจจัยส่วนบุคคล",
    options: ["สุขภาพ", "ครอบครัว", "ที่อยู่อาศัย / การเดินทาง", "การเงินส่วนตัว", "เป้าหมายชีวิต"],
  },
  {
    id: "work",
    label: "2.งานและการบริหาร",
    options: [
      "ปริมาณและลักษณะงาน",
      "เวลาทำงาน",
      "ค่าตอบแทนและสวัสดิการ",
      "ความก้าวหน้า",
      "หัวหน้างาน",
      "ระบบและกระบวนการ",
      "วัฒนธรรมองค์กร",
    ],
  },
  {
    id: "discipline",
    label: "3.วินัยและระเบียบ",
    options: [
      "วินัยการทำงาน",
      "การปฏิบัติงาน",
      "ผลการทำงาน",
      "ไม่ผ่านการฝึกงานก่อนรับรถ",
      "พฤติกรรมการทำงาน",
      "จริยธรรม",
      "ลาออกก่อนถูกลงโทษ",
    ],
  },
  {
    id: "external",
    label: "4.ปัจจัยภายนอก",
    options: ["โอกาสงาน", "ค่าตอบแทนตลาด", "เศรษฐกิจ", "อุตสาหกรรม / เทคโนโลยี"],
  },
  {
    id: "status",
    label: "5.เปลี่ยนแปลงสถานะ",
    options: ["เกษียณ", "โยกย้ายเป็นรถร่วม", "คืนรถร่วม", "ขับแทน พจร.ชั่วคราว"],
  },
];

/** คีย์ของช่องติ๊กหนึ่งช่อง — `personal:สุขภาพ` (ป้ายบนกระดาษไม่ซ้ำกันในหมวด) */
export function exitReasonKey(groupId: string, option: string): string {
  return `${groupId}:${option}`;
}

/** คำถามความคิดเห็นเพิ่มเติม 6 ข้อ — ลอกจากกระดาษต้นฉบับ */
export const EXIT_QUESTIONS = [
  "สิ่งที่ท่านประทับใจที่สุดในการทำงานกับบริษัท?",
  "สิ่งที่บริษัทควรปรับปรุงมากที่สุดคือเรื่องใด?",
  "ผู้บังคับบัญชาของคุณ ควรปรับปรุงตรงไหนบ้าง?",
  "หากบริษัทปรับปรุงได้ 1 เรื่อง อะไรที่จะทำให้ท่านตัดสินใจอยู่ทำงานต่อ?",
  "ท่านมีความสนใจกลับมาร่วมงานกับบริษัทในอนาคตหรือไม่?",
  "ความคิดเห็นเพิ่มเติม",
] as const;

/** ความเห็นของผู้มีอำนาจอนุมัติประจำฝ่าย — ท้ายใบลาออก */
export const REPLACEMENT_CHOICES = [
  { value: "replace", label: "ขอรับพนักงานทดแทน" },
  { value: "no-replace", label: "ไม่ขอรับพนักงานทดแทน" },
  { value: "hold", label: "ระงับตำแหน่งไว้ก่อน" },
] as const;

export type ReplacementChoice = (typeof REPLACEMENT_CHOICES)[number]["value"] | "";

/* ---------------------------------------------------------- ค่าที่เติมลงเอกสาร */

/** ทุกช่องที่เติมลงสองฉบับ — วันที่เป็น `YYYY-MM-DD` (ค.ศ.) แปลงเป็น พ.ศ. ตอนวาด */
export interface ResignFill {
  /** `ที่ มท.10-{refNo}/{refYear}` */
  refNo: string;
  refYear: string;
  docDate: string;

  /** ว่าง = กระดาษพิมพ์ “นาย/นาง/นางสาว” ไว้ให้วงเอง */
  title: string;
  name: string;
  position: string;
  customer: string;
  plant: string;
  office: string;

  lastWorkDate: string;
  effectiveDate: string;
  reason: string;

  replacement: ReplacementChoice;
  /** `2. ผู้จัดการฝ่าย……` — ชื่อฝ่าย */
  managerDept: string;
  supervisor: string;
  manager: string;
  executive: string;
  hrManager: string;

  /** แบบสอบถาม — คีย์จาก `exitReasonKey()` */
  reasons: string[];
  /** ช่อง “อื่นๆ” ของแต่ละหมวด — คีย์เป็น `id` ของหมวด · มีข้อความ = ติ๊กช่องนั้น */
  otherReasons: Record<string, string>;
  detail: string;
  /** คำตอบ 6 ข้อ เรียงตาม `EXIT_QUESTIONS` */
  answers: string[];
}

/** ชื่อผู้ลงนามฝั่งบริษัทที่เครื่องนี้จำไว้ — คนเซ็นชุดเดิมแทบทุกใบ */
const SIGNER_KEYS = ["managerDept", "manager", "executive", "hrManager"] as const;
type SignerFill = Pick<ResignFill, (typeof SIGNER_KEYS)[number]>;

const STORAGE_KEY = "hrs.recruitment.resign-docs.signers";

function recalledSigners(): SignerFill {
  const empty: SignerFill = { managerDept: "", manager: "", executive: "", hrManager: "" };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const saved = JSON.parse(raw) as Partial<SignerFill>;
    for (const key of SIGNER_KEYS) {
      if (typeof saved[key] === "string") empty[key] = saved[key];
    }
    return empty;
  } catch {
    return empty;
  }
}

/** จำชื่อผู้ลงนามไว้ในเครื่องนี้ — เรียกตอนสั่งพิมพ์ ไม่ใช่ทุกครั้งที่พิมพ์ตัวอักษร */
export function rememberResignSigners(fill: ResignFill) {
  try {
    const picked = Object.fromEntries(SIGNER_KEYS.map((k) => [k, fill[k]]));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(picked));
  } catch {
    /* โหมดส่วนตัว/บล็อกที่เก็บข้อมูล — ครั้งหน้าก็แค่ต้องพิมพ์ชื่อใหม่ */
  }
}

/**
 * ค่าตั้งต้นจากทะเบียน — ชื่อ · ลูกค้า · แพล้นท์ · สาขา และข้อมูลพ้นสภาพที่บันทึกไว้
 *
 * - **วันทำงานวันสุดท้าย = วันที่พ้นสภาพที่บันทึกไว้** (ช่องนั้นนิยามว่า “วันสุดท้ายที่ถือว่า
 *   ยังเป็นพนักงาน” — ดู `driver-status-control.tsx`) · **ลาออกมีผล = วันถัดไป**
 * - ลูกค้า/แพล้นท์มาจากรถที่ ETL ยังผูกไว้ คนที่ออกไปนานแล้วอาจว่างหรือเป็นค่าเก่า —
 *   แก้ในกล่องได้
 * - ชื่อใน ETL ไม่มีคำนำหน้า ช่องคำนำหน้าจึงว่างไว้ ไม่เดาเพศให้
 */
export function initialResignFill(driver: DriverRecord): ResignFill {
  const r = driver.resignation;
  const last = r?.dateISO ?? "";

  return {
    refNo: "",
    refYear: "",
    docDate: todayIso(),
    title: "",
    name: driver.name,
    position: "พนักงานจัดส่ง",
    customer: driver.vehicle?.fleet ?? "",
    plant: driver.vehicle?.plant ?? "",
    office: driver.siteLabel,
    lastWorkDate: last,
    effectiveDate: last ? addDays(last, 1) : "",
    reason: r ? [r.reasonLabel, r.note].map((s) => s.trim()).filter(Boolean).join(" — ") : "",
    replacement: "",
    supervisor: "",
    ...recalledSigners(),
    reasons: [],
    otherReasons: {},
    detail: "",
    answers: EXIT_QUESTIONS.map(() => ""),
  };
}

/** `นาย สมชาย ใจดี` — ไม่มีคำนำหน้าก็ชื่ออย่างเดียว */
export function resignPersonName(fill: Pick<ResignFill, "title" | "name">): string {
  return [fill.title, fill.name]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
}
