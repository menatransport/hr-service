import { ObjectId, type Collection, type Document, type WithId } from "mongodb";

import { hrCol } from "@/lib/db";
import { nextSeq } from "@/lib/db/counters";
import { DRAFT_PREFIX, mediaKeyOf, mediaUrl } from "@/lib/media";
import { copyMedia, deleteMedia, deleteMediaFolder, keyPart, mediaKeys } from "@/lib/s3";
import { CONSENT_ITEMS, CONSENT_VERSION, hasRequiredConsent } from "./consent";
import {
  KEY_FULL_NAME,
  KEY_PHONE,
  composeName,
  digitsOnly,
  displayAnswer,
  emptyAnswer,
  findByRole,
  isBlank,
  validateAnswer,
  validateDocumentField,
  visibleQuestions,
  type DocSlot,
} from "./form";
import { listDocSlots } from "./doc-slots";
import { mergeRatingAnswers, summarizeRating } from "./driver-rating";
import { eraseHrDocuments } from "./hr-document-records-store";
import { listActiveQuestions, RecruitmentError } from "./questions";
import {
  DOCUMENT_FIELDS,
  EMPTY_DOCUMENT_DATA,
  EMPTY_DOCUMENT_META,
  EMPTY_INTERVIEW,
  EMPTY_RATING,
  isApplicationStatus,
  isExitReason,
  EXIT_REASON_NOTE_MAX,
  OTHER_EXIT_REASON,
  isInterviewResult,
  normalizeStatus,
  QUESTION_SECTIONS,
  statusFromResult,
  type AnswerMap,
  type BlacklistEntry,
  type AnswerValue,
  type Application,
  type ApplicationFile,
  type ApplicationStatus,
  type ApplicationSummary,
  type ConsentRecord,
  type DocumentData,
  type DocumentMeta,
  type ExitReason,
  type InterviewRecord,
  type Question,
  type QuestionSnapshot,
  type RatingRecord,
  type TimelineEntry,
} from "./types";

/**
 * ใบสมัครของผู้สมัครขับรถ — **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 *
 * คอลเลกชัน `recruitment_regist_answer` ตามที่ระบุไว้ใน
 * `app/recruitment/regist/requirment.md`
 *
 * เก็บทุกอย่างไว้ใน **เอกสารเดียวต่อหนึ่งใบสมัคร** — คำตอบ ไฟล์แนบ หลักฐาน
 * ความยินยอม และไทม์ไลน์สถานะ · ไม่มีใครอ่านสี่อย่างนี้แยกจากตัวใบสมัคร
 * และหนึ่งใบมีไทม์ไลน์ไม่กี่แถว จึงไม่ต้อง join และอ่านหน้าเดียวจบด้วยคำสั่งเดียว
 * (ท่าเดียวกับ `lib/record-cases.ts`)
 */

/** จำนวนที่ดึงมาแสดงบนหน้าแอดมิน — ค้นหา/กรองทำฝั่ง client บนชุดนี้ */
const LIST_LIMIT = 500;

/** ใบสมัครซ้ำจากเบอร์เดิมภายในกี่วันถึงจะถูกปัดกลับ */
const DUPLICATE_WINDOW_DAYS = 30;

/* ------------------------------------------------------------ รูปในฐานข้อมูล */

interface ApplicationDoc {
  ref: string;
  status: ApplicationStatus;
  fullName: string;
  /** ตัวเลขล้วน 10 หลัก — จัดรูปตอนแสดงผลด้วย `formatPhone()` */
  phone: string;
  /**
   * เจ้าหน้าที่ที่รับผิดชอบโทรกลับ — **ของฝ่ายบุคคล ไม่ใช่คำตอบของผู้สมัคร**
   *
   * ผู้สมัครตอบมาแล้วว่าคุยกับใครไว้ (คำถาม “ติดต่อเจ้าหน้าที่ท่านใด”) แต่นั่นคือ
   * ความจำของผู้สมัคร ไม่ใช่การมอบหมายงาน · ช่องนี้คือคนที่ตอนนี้ถือใบนี้อยู่จริง
   * และเปลี่ยนมือได้เมื่อส่งต่องานกัน
   */
  contactOwner: string;
  interview: InterviewRecord;
  exitReason: ExitReason;
  /** ใบเก่ายังไม่มีคีย์นี้ — อ่านผ่าน `exitNoteOf()` เสมอ */
  exitReasonNote?: string;
  /** ใบเก่ายังไม่มีคีย์นี้ — อ่านผ่าน `blacklistOf()` เสมอ */
  blacklist?: boolean;
  answers: AnswerMap;
  questionSnapshot: QuestionSnapshot[];
  /** คะแนน Driver Rating ที่ฝ่ายบุคคลให้เอง — ใบเก่าไม่มีคีย์นี้ อ่านผ่าน `ratingOf()` */
  rating?: RatingRecord;
  files: ApplicationFile[];
  /** ใบเก่าที่ลงฐานก่อนมีช่องนี้ยังไม่มีคีย์ — อ่านผ่าน `documentsOf()` เสมอ */
  documents?: DocumentData;
  documentMeta?: DocumentMeta;
  consent: ConsentRecord;
  timeline: TimelineEntry[];
  /**
   * เวลาที่ผู้สมัครกดยกเลิกเองแล้วข้อมูลถูกลบตามคำขอ — มีค่าเมื่อไหร่แปลว่า
   * **ใบนี้ล็อกถาวร** · เก็บเป็นเวลาไม่ใช่ `true` เพราะต้องตอบให้ได้ว่าลบเมื่อไหร่
   * ถ้าถูกขอให้พิสูจน์ว่าทำตามคำขอจริง (ดู `cancelApplication()`)
   */
  erasedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * ดัชนี (`ref_unique` `phone_recent` `status_recent` `recent` `importKey_sparse`) ประกาศที่
 * `lib/db/registry.mjs` — เดิม cache promise ของ `createIndexes` ไว้โดยไม่มี `.catch` ล้มครั้งเดียว
 * ทั้งโปรเซสพังถาวร ตอนนี้ `ensureIndexesOnce()` ดูแลแทนและลองใหม่เองเมื่อล้ม
 */
function applications(): Promise<Collection<ApplicationDoc>> {
  return hrCol<ApplicationDoc>("applications");
}

/**
 * คำตอบของข้อที่ทำหน้าที่ `role` ในใบนี้ แปลงเป็นข้อความพร้อมแสดง
 * หาไม่เจอ (คำถามถูกลบ / ฟอร์มรุ่นเก่าไม่มีข้อนี้) = `""` ปลายทางขึ้น “—” เอง
 */
function roleAnswer(
  doc: Partial<Pick<ApplicationDoc, "questionSnapshot" | "answers">>,
  role: Parameters<typeof findByRole>[1],
): string {
  const question = findByRole(doc.questionSnapshot ?? [], role);
  if (!question) return "";
  const value = displayAnswer(doc.answers?.[question.key], question.options);
  return value === "—" ? "" : value;
}

/** ชื่อเต็มของใบนี้ — ต่อ “ชื่อ” กับ “นามสกุล” ที่คลังคำถามจริงแยกเป็นคนละข้อ */
export function fullNameOf(
  doc: Partial<Pick<ApplicationDoc, "fullName" | "questionSnapshot" | "answers">>,
): string {
  return composeName(doc.fullName ?? "", roleAnswer(doc, "last_name"));
}

/**
 * เจ้าหน้าที่ที่ผู้สมัครบอกเองว่าเคยคุยไว้ — ใช้เป็นค่าสำรองของ “ผู้ติดต่อกลับ”
 * ตอนที่ยังไม่มีใครกดรับเรื่อง เพราะคนนั้นคือคนที่รู้เรื่องใบนี้ดีที่สุดในตอนนั้น
 *
 * ตัวเลือก “ยังไม่มีใครติดต่อ” ถูกตัดทิ้ง — เป็นคำตอบว่า *ไม่มี* ไม่ใช่ชื่อคน
 * ถ้าปล่อยผ่านไป คอลัมน์ผู้ติดต่อกลับจะอ่านเหมือนมีคนชื่อนี้รับผิดชอบอยู่จริง
 */
function declaredContact(doc: Pick<ApplicationDoc, "questionSnapshot" | "answers">): string {
  const name = roleAnswer(doc, "hr_contact");
  return name.includes("ยังไม่มี") ? "" : name;
}

/** เติมฟิลด์ที่ใบรุ่นเก่ายังไม่มีให้ครบ — หน้าจอจึงไม่ต้องคอยเช็ค `undefined` เอง */
function interviewOf(doc: Pick<ApplicationDoc, "interview">): InterviewRecord {
  return { ...EMPTY_INTERVIEW, ...(doc.interview ?? {}) };
}

/**
 * ใบนี้ถูกล้างข้อมูลตามคำขอของผู้สมัครไปแล้วหรือยัง — **ตัวตัดสินว่าล็อกหรือไม่ล็อก**
 *
 * ใบที่ผู้สมัครกดถอนความยินยอมไว้ก่อนจะถอดสถานะนั้นออก (17 ก.ย. 2026) ไม่มี
 * `erasedAt` ในฐาน มีแต่ `status: "withdrawn"` — ถ้าดูแค่ช่องใหม่ช่องเดียว ใบพวกนั้น
 * จะกลายเป็นใบที่แก้ได้ทั้งที่เนื้อหาถูกลบไปแล้ว จึงนับค่าเดิมเป็นร่องรอยด้วย
 */
function erasedOf(doc: Pick<ApplicationDoc, "erasedAt" | "status">): boolean {
  return Boolean(doc.erasedAt) || (doc.status as string) === "withdrawn";
}

/** ใบเก่ายังไม่มีช่องนี้ — เติมค่าว่างให้ครบทุกช่องตอนอ่าน ไม่ใช่ตอน migrate */
function documentsOf(doc: Pick<ApplicationDoc, "documents">): DocumentData {
  return { ...EMPTY_DOCUMENT_DATA, ...(doc.documents ?? {}) };
}

function documentMetaOf(doc: Pick<ApplicationDoc, "documentMeta">): DocumentMeta {
  return { ...EMPTY_DOCUMENT_META, ...(doc.documentMeta ?? {}) };
}

function ratingOf(doc: Pick<ApplicationDoc, "rating">): RatingRecord {
  return { ...EMPTY_RATING, ...(doc.rating ?? {}), answers: doc.rating?.answers ?? {} };
}

/** ติด Blacklist เฉพาะใบที่ยกเลิกอยู่เท่านั้น — กันค่าค้างในใบที่ถูกเปิดกลับเข้าสาย */
function blacklistOf(doc: Pick<ApplicationDoc, "blacklist" | "status">): boolean {
  return doc.blacklist === true && normalizeStatus(doc.status) === "cancelled";
}

/** เหตุผลที่พิมพ์เอง — มีความหมายเฉพาะข้อ “อื่นๆ” ค่าที่ค้างในข้ออื่นถูกทิ้งตอนอ่าน */
function exitNoteOf(doc: Pick<ApplicationDoc, "exitReason" | "exitReasonNote">): string {
  return doc.exitReason === OTHER_EXIT_REASON ? (doc.exitReasonNote ?? "") : "";
}

function toApplication(doc: WithId<ApplicationDoc>): Application {
  return {
    id: doc._id.toHexString(),
    ref: doc.ref,
    status: normalizeStatus(doc.status),
    fullName: fullNameOf(doc),
    phone: doc.phone,
    contactOwner: doc.contactOwner ?? "",
    interview: interviewOf(doc),
    exitReason: isExitReason(doc.exitReason) ? doc.exitReason : "",
    exitReasonNote: exitNoteOf(doc),
    blacklist: blacklistOf(doc),
    answers: doc.answers ?? {},
    questionSnapshot: doc.questionSnapshot ?? [],
    rating: ratingOf(doc),
    files: doc.files ?? [],
    documents: documentsOf(doc),
    documentMeta: documentMetaOf(doc),
    consent: doc.consent,
    timeline: doc.timeline ?? [],
    erased: erasedOf(doc),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/* ------------------------------------------------------------------- เลขอ้างอิง */

/** ปี พ.ศ. สองหลักตามเวลาไทย — ใบสมัครปี 2569 ได้เลขขึ้นต้น `DRV-69-` */
function currentThaiYy(): string {
  const year = Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
    }).format(new Date()),
  );
  return String((year + 543) % 100).padStart(2, "0");
}

/**
 * เลขอ้างอิงถัดไป — `findOneAndUpdate` + `$inc` เป็น atomic ระดับเอกสาร
 * สองคนกดส่งพร้อมกันจึงไม่มีทางได้เลขเดียวกัน (นับด้วย `countDocuments` ชนแน่นอน)
 * และมีดัชนี unique บน `ref` เป็นตาข่ายชั้นสุดท้ายอีกที
 */
async function nextRef(): Promise<string> {
  const yy = currentThaiYy();
  const seq = await nextSeq("recruitmentCounters", `recruitment:${yy}`);
  return `DRV-${yy}-${String(seq).padStart(4, "0")}`;
}

/* --------------------------------------------------------------- ตรวจข้อมูลเข้า */

export function snapshotOf(questions: Question[]): QuestionSnapshot[] {
  return questions.map((q) => ({
    key: q.key,
    section: q.section,
    label: q.label,
    kind: q.kind,
    options: q.options,
    sensitive: q.sensitive,
  }));
}

/** ค่าที่ client ส่งมาถูกหล่อให้เข้ารูปตามชนิดคำถามก่อนตรวจเสมอ */
function coerce(
  /* รับแค่สองช่องที่ใช้จริง — เวลาฝ่ายบุคคลแก้คำตอบของใบเก่า สิ่งที่มีให้ใช้คือ
     **สำเนาคำถามในใบ** (`QuestionSnapshot`) ไม่ใช่คำถามเต็มใบจากคลัง */
  question: Pick<Question, "kind" | "options">,
  raw: unknown,
): AnswerValue {
  if (question.kind === "multi") {
    const list = Array.isArray(raw) ? raw : [];
    const allowed = new Set(question.options.map((o) => o.value));
    return list.filter((v): v is string => typeof v === "string" && allowed.has(v));
  }

  const value = typeof raw === "string" ? raw.trim() : "";
  if (question.kind === "single") {
    return question.options.some((o) => o.value === value) ? value : "";
  }
  if (question.kind === "tel" || question.kind === "nid" || question.kind === "number") {
    return digitsOnly(value);
  }
  return value.slice(0, 2000);
}

/**
 * ตรวจคำตอบทั้งใบด้วยคลังคำถาม ณ เวลาที่ส่ง
 *
 * ตรวจซ้ำฝั่งเซิร์ฟเวอร์ทั้งที่หน้าจอตรวจไปแล้ว เพราะคนยิง API ตรงข้ามหน้าจอไปได้
 * และเพราะคลังคำถามอาจถูกแก้ระหว่างที่ผู้สมัครกำลังกรอกค้างอยู่
 */
function buildAnswers(
  questions: Question[],
  raw: Record<string, unknown>,
): AnswerMap {
  const answers: AnswerMap = {};

  // เดินทีละหมวดตามลำดับจริง เพราะเงื่อนไขของข้อหลังอ่านคำตอบของข้อหน้า
  for (const section of QUESTION_SECTIONS) {
    for (const q of visibleQuestions(questions, section.id, answers)) {
      const value = coerce(q, raw[q.key]);
      const message = validateAnswer(q, value);
      if (message) throw new RecruitmentError(`${q.label} — ${message}`);
      answers[q.key] = isBlank(value) ? emptyAnswer(q.kind) : value;
    }
  }

  return answers;
}

/**
 * ไฟล์แนบตอนส่งใบสมัคร — รับเฉพาะช่องที่**เปิดแสดงอยู่ตอนนี้** และบังคับตามค่าที่
 * ตั้งใน Section 4 · ช่องที่ถูกซ่อนระหว่างผู้สมัครกรอกค้างอยู่ถูกทิ้งเงียบ ๆ
 * ไม่ปัดตกทั้งใบ เพราะผู้สมัครไม่ได้ทำอะไรผิด
 */
function buildFiles(raw: unknown, docSlots: DocSlot[]): ApplicationFile[] {
  const list = Array.isArray(raw) ? raw : [];
  const slots = new Map(docSlots.filter((s) => s.visible).map((s) => [s.id, s]));
  const now = new Date().toISOString();
  const files: ApplicationFile[] = [];
  const seen = new Set<string>();

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const { slot, url } = item as { slot?: unknown; url?: unknown };
    if (typeof slot !== "string" || !slots.has(slot) || seen.has(slot)) continue;
    if (typeof url !== "string" || !(isDraftUrl(url) || /^https?:\/\//.test(url))) continue;
    seen.add(slot);
    files.push({ slot, label: slots.get(slot)?.label, url, uploadedAt: now });
  }

  const missing = [...slots.values()].filter((s) => s.required && !seen.has(s.id));
  if (missing.length) {
    throw new RecruitmentError(
      `ยังไม่ได้แนบ${missing.map((s) => s.label).join(" · ")}`,
    );
  }

  return files;
}

/** ลิงก์ไฟล์ร่างที่ผู้สมัครอัประหว่างกรอก (`POST /api/recruitment/public/uploads`) */
function isDraftUrl(url: string): boolean {
  return Boolean(mediaKeyOf(url)?.startsWith(DRAFT_PREFIX));
}

/**
 * ย้ายไฟล์ร่างเข้าโฟลเดอร์ของใบสมัคร `mass-image/applications/{ref}/{slot}/` ตอนกดส่ง
 *
 * **คัดลอกให้ครบทุกไฟล์ก่อนบันทึกใบสมัคร** — ไฟล์ร่างหายเองใน 1 วัน (lifecycle ของ
 * bucket) ถ้าบันทึกใบที่ยังชี้ไฟล์ร่างไว้ เอกสารจะหายไปเงียบ ๆ ในวันรุ่งขึ้น · คัดลอก
 * ไม่ผ่าน (ร่างหมดอายุแล้ว) = ปัดตกทั้งใบพร้อมบอกให้แนบใหม่ ผู้สมัครแก้เองได้
 * ลิงก์ที่ไม่ใช่ไฟล์ร่าง (Spaces สาธารณะสมัยก่อน) ผ่านไปตามเดิม
 */
async function promoteDraftFiles(
  files: ApplicationFile[],
  ref: string,
): Promise<{ files: ApplicationFile[]; drafts: string[] }> {
  const drafts: string[] = [];
  const out: ApplicationFile[] = [];
  for (const file of files) {
    const from = isDraftUrl(file.url) ? mediaKeyOf(file.url) : null;
    if (!from) {
      out.push(file);
      continue;
    }
    const leaf = from.slice(from.lastIndexOf("/") + 1);
    const to = `${mediaKeys.applicationFolder(ref)}${keyPart(file.slot)}/${leaf}`;
    try {
      await copyMedia(from, to);
    } catch {
      throw new RecruitmentError(
        `ไฟล์${file.label ? ` “${file.label}”` : "แนบ"}หมดอายุหรือหาไม่พบ — กรุณาแนบใหม่อีกครั้งแล้วกดส่ง`,
      );
    }
    drafts.push(from);
    out.push({ ...file, url: mediaUrl(to) });
  }
  return { files: out, drafts };
}

/** ลบไฟล์บน S3 ที่ไม่มีใครอ้างถึงแล้ว — ล้มเหลวไม่โยนต่อ (ไฟล์ private เปิดไม่ได้อยู่แล้ว) */
async function dropMedia(urls: string[]): Promise<void> {
  for (const key of urls.map(mediaKeyOf)) {
    if (!key) continue;
    await deleteMedia(key).catch((err: unknown) => {
      console.warn("[applications] ลบไฟล์บน S3 ไม่สำเร็จ —", key, err);
    });
  }
}

function buildConsent(
  raw: unknown,
  meta: { ip: string; userAgent: string },
): ConsentRecord {
  const granted = Array.isArray(raw)
    ? raw.filter((v): v is string => typeof v === "string")
    : [];

  if (!hasRequiredConsent(granted)) {
    throw new RecruitmentError(
      "ยังให้ความยินยอมไม่ครบตามที่จำเป็น — กลับไปที่หน้าความยินยอมแล้วติ๊กให้ครบ",
    );
  }

  return {
    version: CONSENT_VERSION,
    acceptedAt: new Date().toISOString(),
    ip: meta.ip,
    userAgent: meta.userAgent.slice(0, 300),
    items: CONSENT_ITEMS.map((item) => ({
      id: item.id,
      granted: granted.includes(item.id),
    })),
  };
}

/* -------------------------------------------------------------------- เขียน */

export interface SubmitResult {
  ref: string;
  createdAt: string;
}

export async function createApplication(
  body: Record<string, unknown>,
  meta: { ip: string; userAgent: string },
): Promise<SubmitResult> {
  const [questions, docSlots] = await Promise.all([
    listActiveQuestions(),
    listDocSlots(),
  ]);
  if (!questions.length) {
    throw new RecruitmentError(
      "ตอนนี้ยังไม่เปิดรับสมัคร — ลองใหม่อีกครั้งภายหลัง",
    );
  }

  const consent = buildConsent(body.consent, meta);
  const answers = buildAnswers(
    questions,
    (body.answers ?? {}) as Record<string, unknown>,
  );
  const files = buildFiles(body.files, docSlots);
  /* ซ่อนช่องบัตรประชาชนไว้ = ไม่มีรูปบัตรให้อ่านเลขจาก — ไม่รับค่าที่ส่งมา */
  const { documents, documentMeta } = buildApplicantDocuments(
    docSlots.some((s) => s.id === "id_card" && s.visible) ? body : {},
  );

  const fullName = String(answers[KEY_FULL_NAME] ?? "").trim();
  const phone = String(answers[KEY_PHONE] ?? "").trim();
  if (!fullName || !phone) {
    throw new RecruitmentError("ใบสมัครต้องมีชื่อและเบอร์ติดต่อ");
  }

  await guardDuplicate(phone);

  const ref = await nextRef();
  const promoted = await promoteDraftFiles(files, ref);

  const now = new Date().toISOString();
  const doc: ApplicationDoc = {
    ref,
    status: "pending_contact",
    fullName,
    phone,
    contactOwner: "",
    interview: { ...EMPTY_INTERVIEW },
    exitReason: "",
    exitReasonNote: "",
    blacklist: false,
    answers,
    questionSnapshot: snapshotOf(questions),
    files: promoted.files,
    documents,
    documentMeta,
    consent,
    timeline: [
      {
        at: now,
        from: null,
        to: "pending_contact",
        by: "ผู้สมัคร",
        note: "ส่งใบสมัคร",
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  try {
    await (await applications()).insertOne(doc as ApplicationDoc);
  } catch (err) {
    /* บันทึกใบไม่ติด — สำเนาที่เพิ่งคัดลอกเข้าโฟลเดอร์ใบสมัครกลายเป็นกำพร้า ลบทิ้ง
       (ไฟล์ร่างยังอยู่ ผู้สมัครกดส่งซ้ำได้ทันที) */
    await deleteMediaFolder(mediaKeys.applicationFolder(ref)).catch(() => 0);
    throw err;
  }
  /* ไฟล์ร่างไม่ต้องใช้แล้ว — ลบเลยไม่ต้องรอ lifecycle */
  await dropMedia(promoted.drafts.map(mediaUrl));
  return { ref: doc.ref, createdAt: doc.createdAt };
}

/**
 * เลขบัตร + วันหมดอายุที่ฟอร์มสมัครอ่านจากรูปบัตร (`id-card-ocr.ts`) แล้วผู้สมัครตรวจแล้ว
 *
 * รับจากคนนอกแค่สองช่องของบัตรประชาชน **ไม่เปิดให้ส่งช่องอื่น** เช่นเลขบัญชี —
 * ช่องพวกนั้นฝ่ายบุคคลเป็นคนกรอกจากรูปเท่านั้น · `verifiedAt` ว่างไว้เสมอ
 * เพราะผู้สมัครรับรองข้อมูลตัวเองไม่ได้ ฝ่ายบุคคลยังต้องกดยืนยันเองที่หน้าเอกสาร
 */
function buildApplicantDocuments(body: Record<string, unknown>): {
  documents: DocumentData;
  documentMeta: DocumentMeta;
} {
  const raw = (body.documents ?? {}) as Record<string, unknown>;
  const picked =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? { nationalId: raw.nationalId ?? "", idCardExpiry: raw.idCardExpiry ?? "" }
      : {};
  const { documents } = editDocuments(EMPTY_DOCUMENT_DATA, picked);
  return {
    documents,
    documentMeta: {
      ...EMPTY_DOCUMENT_META,
      source: body.documentSource === "ocr" ? "ocr" : "manual",
    },
  };
}

/**
 * กันส่งซ้ำจากเบอร์เดิม
 *
 * ระบบนี้ไม่มีการยืนยันเบอร์ด้วย OTP เบอร์จึงเป็นหลักฐานตัวตนเดียวที่มี —
 * ปัดใบซ้ำภายใน 30 วันเพื่อไม่ให้ฝ่ายบุคคลต้องไล่โทรหาคนเดิมหลายรอบ
 * ใบที่ไม่ผ่านหรือยกเลิกไปแล้วไม่นับ เพราะสมัครใหม่ได้ตามปกติ
 */
async function guardDuplicate(phone: string): Promise<void> {
  const since = new Date(
    Date.now() - DUPLICATE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const existing = await (
    await applications()
  ).findOne(
    {
      phone,
      createdAt: { $gte: since },
      /* ชื่อสถานะชุดเก่า (`rejected` / `withdrawn`) ยังอยู่ในเงื่อนไขด้วย เพราะใบ
         ที่ปิดไปก่อนเปลี่ยนชุดสถานะยังถือค่าเดิมในฐาน — ถ้าตัดออกจะกลายเป็นว่า
         คนที่เคยไม่ผ่านเมื่อเดือนก่อนสมัครใหม่ไม่ได้ ทั้งที่ควรได้ */
      status: { $nin: ["cancelled", "interview_failed", "withdrawn", "rejected"] as never[] },
    },
    { projection: { ref: 1 } },
  );

  if (existing) {
    throw new RecruitmentError(
      `เบอร์นี้มีใบสมัครที่กำลังพิจารณาอยู่แล้ว (เลขอ้างอิง ${existing.ref}) — ติดตามสถานะได้ที่หน้า “ติดตามใบสมัคร”`,
    );
  }
}

/** สิ่งที่หน้าจอ “จัดการผู้สมัคร” ส่งมาได้ — ไม่ส่งช่องไหนมา = ไม่แตะช่องนั้น */
export interface ApplicationPatch {
  status?: unknown;
  contactOwner?: unknown;
  exitReason?: unknown;
  /** เหตุผลที่พิมพ์เอง — บังคับเมื่อ `exitReason === "other"` · ข้ออื่นถูกทิ้ง */
  exitReasonNote?: unknown;
  /** ขึ้น Blacklist — ต้องเป็น boolean · มีผลเฉพาะใบที่ยกเลิก */
  blacklist?: unknown;
  interview?: unknown;
  /** บันทึกภายในที่จะขึ้นในไทม์ไลน์ ผู้สมัครมองไม่เห็น */
  note?: unknown;
  /**
   * คำตอบในใบสมัครที่ฝ่ายบุคคลแก้ — ส่งมาเฉพาะข้อที่เปลี่ยน เป็น `key` → ค่าใหม่
   * (ดู `editAnswers()`)
   */
  answers?: unknown;
  /** ไฟล์แนบชุดใหม่ทั้งชุด — `slot` → URL (ดู `editFiles()`) */
  files?: unknown;
  /** ข้อมูลที่อ่านจากเอกสาร — ส่งมาเฉพาะช่องที่เปลี่ยน (ดู `editDocuments()`) */
  documents?: unknown;
  /**
   * Driver Rating ที่ฝ่ายบุคคลเลือก — `id` ข้อ → ข้อความคำตอบจาก master · `null` = ลบ
   * (กลับไปใช้คำตอบจากฟอร์ม) · ส่งมาเฉพาะข้อที่เปลี่ยน (ดู `mergeRatingAnswers()`)
   */
  rating?: unknown;
}

/**
 * ไฟล์แนบที่ฝ่ายบุคคลอัปเพิ่ม/เปลี่ยนให้แทนผู้สมัคร
 *
 * เกิดขึ้นจริงตอนสัมภาษณ์: ผู้สมัครถ่ายทะเบียนบ้านมาเบลอ หรือยังไม่มีหน้าสมุด
 * บัญชีตอนสมัคร แล้วถือตัวจริงมาให้ถ่ายใหม่ที่ออฟฟิศ
 *
 * ต่างจากตอนส่งใบสมัครตรงที่ **ไม่บังคับว่าต้องครบทุกช่องที่จำเป็น** — ใบนี้ผ่าน
 * ด่านนั้นไปตั้งแต่ตอนส่งแล้ว การบังคับซ้ำแปลว่าลบไฟล์เบลอทิ้งก่อนถ่ายใหม่ไม่ได้
 */
function editFiles(
  current: ApplicationFile[],
  raw: unknown,
  docSlots: DocSlot[],
  ref: string,
): ApplicationFile[] {
  /* รับเฉพาะไฟล์ในโฟลเดอร์ของใบนี้เอง (`POST …/applications/{id}/files`) — กันชี้ไปไฟล์ของใบอื่น */
  const own = mediaKeys.applicationFolder(ref);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new RecruitmentError("ไฟล์แนบที่ส่งมาไม่ถูกต้อง");
  }

  /* ทุกช่องในคลังรวมที่ซ่อน + ช่องที่ถูกลบไปแล้วแต่ใบนี้มีไฟล์ค้าง (ลบไฟล์นั้นทิ้งได้) */
  const labels = new Map(docSlots.map((s) => [s.id, s.label]));
  const slots = new Set([...labels.keys(), ...current.map((f) => f.slot)]);
  const bySlot = new Map(current.map((f) => [f.slot, f]));
  const now = new Date().toISOString();

  for (const [slot, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!slots.has(slot)) continue;

    if (value === null || value === "") {
      bySlot.delete(slot);
      continue;
    }
    const unchanged = bySlot.get(slot)?.url === value;
    if (
      typeof value !== "string" ||
      !(unchanged || mediaKeyOf(value)?.startsWith(own) || /^https?:\/\//.test(value))
    ) {
      throw new RecruitmentError("ลิงก์ไฟล์แนบไม่ถูกต้อง");
    }
    /* URL เดิมไม่ถือว่าอัปใหม่ — เวลาแนบต้องไม่ขยับเพราะการกดบันทึกเฉย ๆ */
    if (bySlot.get(slot)?.url === value) continue;
    bySlot.set(slot, {
      slot,
      label: labels.get(slot) ?? bySlot.get(slot)?.label,
      url: value,
      uploadedAt: now,
    });
  }

  /* เรียงตามลำดับในคลัง ไม่ใช่ตามลำดับที่อัป — รายงานกับหน้าจอจึงเรียงเหมือนกัน
     เสมอไม่ว่าใครถ่ายอะไรก่อน · ช่องที่ถูกลบจากคลังแล้วต่อท้าย */
  const rank = new Map(docSlots.map((s, i) => [s.id, i]));
  return [...bySlot.values()].sort(
    (a, b) => (rank.get(a.slot) ?? 999) - (rank.get(b.slot) ?? 999),
  );
}

/**
 * ข้อมูลที่อ่านจากเอกสาร — ตรวจทีละช่องด้วย `DOCUMENT_FIELDS`
 *
 * **ช่องว่างผ่านเสมอ** ต่างจากคำตอบในใบสมัคร: เอกสารที่ถ่ายเบลอครึ่งใบยังต้อง
 * บันทึกส่วนที่อ่านออกได้ · ค่าที่ไม่ผ่านรูปแบบถูกปฏิเสธพร้อมชื่อช่อง เพราะเลข
 * บัญชีผิดหลักเดียวคือเงินเดือนที่โอนไม่เข้า
 */
function editDocuments(
  current: DocumentData,
  raw: unknown,
): { documents: DocumentData; changed: string[] } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new RecruitmentError("ข้อมูลจากเอกสารที่ส่งมาไม่ถูกต้อง");
  }

  const documents = { ...current };
  const changed: string[] = [];
  const incoming = raw as Record<string, unknown>;

  for (const field of DOCUMENT_FIELDS) {
    if (!(field.key in incoming)) continue;

    const value =
      field.kind === "nid" || field.kind === "digits"
        ? digitsOnly(text(incoming[field.key], 60))
        : text(incoming[field.key], 200);

    const message = validateDocumentField(field, value);
    if (message) throw new RecruitmentError(`${field.label} — ${message}`);
    if (value === current[field.key]) continue;

    documents[field.key] = value;
    changed.push(field.label);
  }

  return { documents, changed };
}

/**
 * ฝ่ายบุคคลแก้คำตอบในใบสมัครแทนผู้สมัคร
 *
 * เกิดขึ้นจริงทุกวัน: โทรไปแล้วผู้สมัครบอกว่าพิมพ์เบอร์ผิดหนึ่งหลัก หรือกรอก
 * วันเกิดสลับเดือนกับวัน — เดิมต้องให้กรอกใบใหม่ทั้งใบซึ่งทำให้เลขอ้างอิงเปลี่ยน
 * และไทม์ไลน์ที่โทรตามไว้แล้วขาดตอน
 *
 * **ตรวจด้วยสำเนาคำถามในใบนั้น ไม่ใช่คลังคำถามปัจจุบัน** — ใบเก่าถืออยู่กับชุด
 * คำถามของวันที่กรอก ถ้าเอาคลังปัจจุบันมาตรวจ การเพิ่มคำถามใหม่วันนี้จะทำให้
 * ใบเมื่อสามเดือนก่อนแก้ไม่ได้ทั้งใบ
 *
 * **ข้อที่เคยมีคำตอบอยู่แล้วจะลบให้ว่างไม่ได้** — สำเนาคำถามไม่ได้เก็บว่าข้อไหน
 * บังคับกรอก จึงใช้ค่าที่มีอยู่เป็นตัวตัดสินแทน: สิ่งที่ผู้สมัครกรอกมาแล้วหายไป
 * เฉย ๆ คือข้อมูลหาย ไม่ใช่การแก้ไข · ส่วนข้อที่เดิมว่างอยู่ยังปล่อยว่างต่อได้
 *
 * `key` ที่ไม่มีอยู่ในใบถูกเพิกเฉยเงียบ ๆ ไม่ใช่ error — ใบที่ถูกแก้พร้อมกับที่
 * แอดมินอีกคนถอดคำถามออกจากคลังไม่ควรบันทึกไม่ผ่านทั้งใบเพราะข้อที่ไม่มีใครแตะ
 */
function editAnswers(
  snapshot: QuestionSnapshot[],
  current: AnswerMap,
  raw: unknown,
): { answers: AnswerMap; changed: string[] } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new RecruitmentError("คำตอบที่ส่งมาไม่ถูกต้อง");
  }

  const answers: AnswerMap = { ...current };
  const changed: string[] = [];

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const question = snapshot.find((q) => q.key === key);
    if (!question) continue;

    const next = coerce(question, value);
    const message = validateAnswer(
      { kind: question.kind, required: !isBlank(current[key] ?? "") },
      next,
    );
    if (message) throw new RecruitmentError(`${question.label} — ${message}`);

    const settled = isBlank(next) ? emptyAnswer(question.kind) : next;
    if (JSON.stringify(settled) === JSON.stringify(current[key] ?? "")) continue;

    answers[key] = settled;
    changed.push(question.label);
  }

  return { answers, changed };
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** `YYYY-MM-DD` หรือว่าง — ค่าอื่นถือว่าไม่ได้ส่งมา */
function isoDate(value: unknown): string {
  const raw = text(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

/** `HH:MM` แบบ 24 ชั่วโมง หรือว่าง */
function clockTime(value: unknown): string {
  const raw = text(value, 5);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(raw) ? raw : "";
}

function mergeInterview(
  current: InterviewRecord,
  raw: unknown,
): InterviewRecord {
  if (!raw || typeof raw !== "object") return current;
  const patch = raw as Record<string, unknown>;
  const pick = <K extends keyof InterviewRecord>(
    key: K,
    read: (v: unknown) => InterviewRecord[K],
  ): InterviewRecord[K] => (key in patch ? read(patch[key]) : current[key]);

  return {
    plan: pick("plan", (v) => text(v, 500)),
    date: pick("date", isoDate),
    time: pick("time", clockTime),
    result: pick("result", (v) => (isInterviewResult(v) ? v : "")),
    note: pick("note", (v) => text(v, 1000)),
  };
}

/**
 * แก้ใบสมัครหนึ่งใบจากหน้า “จัดการผู้สมัคร” — สถานะ ผู้ติดต่อกลับ และแผนสัมภาษณ์
 * อยู่ในคำขอเดียวกัน เพราะฝ่ายบุคคลกรอกทั้งสามอย่างพร้อมกันหลังวางสาย
 *
 * **สถานะถูกอนุมานจากสิ่งที่กรอก** ไม่ต้องเลือกซ้ำอีกช่อง: ลงวันสัมภาษณ์ให้ใบที่ยัง
 * รอติดต่อ = นัดสัมภาษณ์แล้ว · บันทึกผลสัมภาษณ์ = สถานะเดินตามผลนั้นทันที
 * (ดู `statusFromResult()`) · ระบุสถานะมาตรง ๆ ก็ยังชนะการอนุมานเสมอ
 */
export async function updateApplication(
  id: string,
  patch: ApplicationPatch,
  by: string,
): Promise<Application> {
  if (!ObjectId.isValid(id)) throw new RecruitmentError("ไม่พบใบสมัครนี้");

  const col = await applications();
  const found = await col.findOne({ _id: new ObjectId(id) });
  if (!found) throw new RecruitmentError("ไม่พบใบสมัครนี้");

  const current = normalizeStatus(found.status);
  if (erasedOf(found)) {
    throw new RecruitmentError(
      "ผู้สมัครยกเลิกใบนี้เองและข้อมูลถูกลบตามคำขอแล้ว แก้ไขต่อไม่ได้",
    );
  }

  const interview = mergeInterview(interviewOf(found), patch.interview);
  const wasScheduled = interviewOf(found).date !== "";

  let status: ApplicationStatus = current;
  if (patch.status !== undefined) {
    if (!isApplicationStatus(patch.status)) {
      throw new RecruitmentError("สถานะไม่ถูกต้อง");
    }
    status = patch.status;
  } else {
    status = statusFromResult(interview.result) ?? status;
    if (!interview.result && interview.date && !wasScheduled) {
      status = "interview_scheduled";
    }
    /* ลบวันนัดทิ้ง = ยกเลิกนัด ใบต้องถอยกลับไปรอติดต่อ ไม่ใช่ค้างเป็น
       “นัดสัมภาษณ์” ทั้งที่ไม่มีวันนัดเหลืออยู่ในช่องแล้ว */
    if (!interview.date && wasScheduled && status === "interview_scheduled") {
      status = "pending_contact";
    }
  }

  /* ผลสัมภาษณ์กับสถานะต้องเล่าเรื่องเดียวกันเสมอ — เลือกสถานะเป็นสัมภาษณ์ผ่าน
     ทั้งที่ช่องผลยังว่าง ให้ถือว่าผลคืออันนั้น ไม่ใช่ปล่อยให้ขัดกันคาหน้าจอ */
  if (interview.result !== "" && statusFromResult(interview.result) !== status) {
    interview.result = "";
  }
  if (!interview.result && status === "interview_waiting") interview.result = "waiting";
  if (!interview.result && status === "interview_passed") interview.result = "passed";
  if (!interview.result && status === "cancelled") interview.result = "failed";

  let exitReason: ExitReason = isExitReason(found.exitReason)
    ? found.exitReason
    : "";
  if (patch.exitReason !== undefined) {
    if (!isExitReason(patch.exitReason)) {
      throw new RecruitmentError("เหตุผลออกไม่ถูกต้อง");
    }
    exitReason = patch.exitReason;
  }

  /* เหตุผลที่ยกเลิกไม่ได้บังคับตั้งแต่ตอนเปลี่ยนสถานะ — ฝ่ายบุคคลกดยกเลิกจาก
     ช่องสถานะก่อน แล้วค่อยเลือกเหตุผลในคอลัมน์ถัดไป (ดู `ReasonCell`) ·
     แต่ใบที่กลับเข้าสายแล้วต้องไม่มีเหตุผลค้างอยู่ ไม่งั้นรายงานสิ้นเดือนจะนับซ้ำ */
  if (status !== "cancelled") exitReason = "";

  /* ข้อ “อื่นๆ” ต้องมีข้อความเสมอ — ไม่งั้นยอดสิ้นเดือนได้กอง “อื่นๆ” ที่ไม่มีใคร
     รู้ว่าข้างในคืออะไร · ข้ออื่นล้างข้อความทิ้ง ไม่เก็บค่าที่จอไม่ได้แสดง */
  const exitReasonNote =
    exitReason === OTHER_EXIT_REASON
      ? patch.exitReasonNote === undefined
        ? exitNoteOf(found)
        : text(patch.exitReasonNote, EXIT_REASON_NOTE_MAX)
      : "";
  if (exitReason === OTHER_EXIT_REASON && !exitReasonNote) {
    throw new RecruitmentError("เลือก “อื่นๆ” แล้วต้องพิมพ์เหตุผลที่ยกเลิกด้วย");
  }

  if (patch.blacklist !== undefined && typeof patch.blacklist !== "boolean") {
    throw new RecruitmentError("ค่า Blacklist ไม่ถูกต้อง");
  }
  const wasBlacklisted = blacklistOf(found);
  /* กติกาเดียวกับเหตุผลที่ยกเลิก — ใบที่กลับเข้าสายต้องไม่มี Blacklist ค้างอยู่ */
  const blacklist =
    status === "cancelled"
      ? ((patch.blacklist as boolean | undefined) ?? wasBlacklisted)
      : false;

  const contactOwner =
    patch.contactOwner === undefined
      ? (found.contactOwner ?? "")
      : text(patch.contactOwner, 80);

  /* คำตอบในใบ — ฝ่ายบุคคลแก้แทนผู้สมัครได้ (ดู `editAnswers()`) · ชื่อกับเบอร์
     ที่แยกเก็บไว้นอก `answers` ต้องถูกคำนวณใหม่ตาม ไม่งั้นตารางกับใบจะไม่ตรงกัน */
  const edit =
    patch.answers === undefined
      ? null
      : editAnswers(
          found.questionSnapshot ?? [],
          found.answers ?? {},
          patch.answers,
        );
  const answers = edit?.answers ?? found.answers ?? {};
  const fullName = String(answers[KEY_FULL_NAME] ?? found.fullName ?? "").trim();
  const phone = String(answers[KEY_PHONE] ?? found.phone ?? "").trim();
  const edited = edit?.changed ?? [];

  const now = new Date().toISOString();

  /* ไฟล์แนบและข้อมูลที่อ่านจากเอกสาร — ฝ่ายบุคคลอัปแทนผู้สมัครได้ตอนสัมภาษณ์ */
  const files =
    patch.files === undefined
      ? (found.files ?? [])
      : editFiles(found.files ?? [], patch.files, await listDocSlots(), found.ref);

  /* เทียบเป็นคู่ช่อง→URL ไม่ใช่เทียบจำนวน — เปลี่ยนรูปทะเบียนบ้านที่เบลอเป็นรูป
     ใหม่ทำให้จำนวนเท่าเดิม แต่เป็นการเปลี่ยนเอกสารที่ต้องมีร่องรอย */
  const fileKey = (list: ApplicationFile[]) =>
    list.map((f) => `${f.slot}:${f.url}`).join("|");
  const filesChanged =
    patch.files !== undefined && fileKey(files) !== fileKey(found.files ?? []);

  const docEdit =
    patch.documents === undefined
      ? null
      : editDocuments(documentsOf(found), patch.documents);

  const documents = docEdit?.documents ?? documentsOf(found);
  const documentMeta: DocumentMeta = docEdit
    ? { verifiedBy: by, verifiedAt: now, source: "manual" }
    : documentMetaOf(found);

  /* Driver Rating — เซิร์ฟเวอร์ตรวจกับ master เอง (คำตอบต้องมีใน master) ·
     คะแนนไม่ได้ส่งมาจากจอ จึงปลอมคะแนนผ่าน API ไม่ได้ */
  let ratingEdit: { answers: Record<string, string>; changed: number } | null = null;
  if (patch.rating !== undefined) {
    try {
      ratingEdit = mergeRatingAnswers(ratingOf(found).answers, patch.rating);
    } catch (err) {
      throw new RecruitmentError(err instanceof Error ? err.message : "บันทึกผลประเมินไม่สำเร็จ");
    }
  }
  const rating: RatingRecord = ratingEdit?.changed
    ? { answers: ratingEdit.answers, by, at: now }
    : ratingOf(found);

  /* แก้อะไรก็ตามต้องเหลือร่องรอยเสมอว่าใครแก้อะไรเมื่อไหร่ — ใบสมัครเป็นเอกสาร
     ที่ใช้ตัดสินใจจ้างคน การแก้ที่ไม่มีใครรู้ว่าเกิดขึ้นคือการแก้ที่ตรวจสอบไม่ได้ */
  const trail = [
    edited.length ? `แก้ไขคำตอบในใบสมัคร · ${edited.join(" · ")}` : "",
    docEdit?.changed.length
      ? `บันทึกข้อมูลจากเอกสาร · ${docEdit.changed.join(" · ")}`
      : "",
    filesChanged ? "ปรับไฟล์เอกสารแนบ" : "",
    ratingEdit?.changed ? `ประเมิน Driver Rating · ${ratingEdit.changed} ข้อ` : "",
    /* ขึ้น/ถอด Blacklist คือการตัดสินเรื่องตัวคน ต้องมีร่องรอยว่าใครทำเมื่อไหร่ */
    blacklist !== wasBlacklisted
      ? blacklist
        ? "เพิ่มเป็น Blacklist"
        : "ถอดออกจาก Blacklist"
      : "",
  ].filter(Boolean);

  const note = text(patch.note, 500) || trail.join(" | ").slice(0, 500);

  const timeline = [...(found.timeline ?? [])];

  /* ลงไทม์ไลน์เฉพาะตอนสถานะขยับหรือมีคนเขียนบันทึกไว้ — การแก้เบอร์คนโทรกลับ
     เฉย ๆ ไม่ใช่เหตุการณ์ที่ต้องเก็บเป็นหลักฐาน มีแต่จะทำให้ไทม์ไลน์รก */
  const entry: TimelineEntry | null =
    status !== current || note
      ? { at: now, from: current, to: status, by, note }
      : null;
  if (entry) timeline.push(entry);

  await col.updateOne(
    { _id: found._id },
    {
      $set: {
        status,
        contactOwner,
        interview,
        exitReason,
        exitReasonNote,
        blacklist,
        updatedAt: now,
        ...(edit ? { answers, fullName, phone } : {}),
        ...(filesChanged ? { files } : {}),
        ...(docEdit ? { documents, documentMeta } : {}),
        ...(ratingEdit?.changed ? { rating } : {}),
        ...(entry ? { timeline } : {}),
      },
    },
  );

  /* ไฟล์ที่ถูกเปลี่ยนรูปหรือถอดออก — บันทึกผ่านแล้วถึงลบตัวไฟล์ตามไป */
  if (filesChanged) {
    const kept = new Set(files.map((f) => f.url));
    await dropMedia((found.files ?? []).map((f) => f.url).filter((url) => !kept.has(url)));
  }

  return toApplication({
    ...found,
    status,
    contactOwner,
    interview,
    exitReason,
    exitReasonNote,
    blacklist,
    answers,
    fullName,
    phone,
    files,
    documents,
    documentMeta,
    rating,
    updatedAt: now,
    timeline,
  });
}

/* -------------------------------------------------------------------- อ่าน */

/**
 * อ่านใบสมัครทีละหลายใบ **พร้อม `questionSnapshot` โดยไม่ส่งสำเนาซ้ำข้ามเน็ต**
 *
 * สำเนาฟอร์มคือ ~31 KB ต่อใบ แต่ใบที่สมัครจากฟอร์มรุ่นเดียวกันถือสำเนา **ก้อนเดียวกันเป๊ะ**
 * (วัด 10 ต.ค. 2026: 264 ใบ = 1 รุ่น) · เดิมดึงมาพร้อมทุกใบ = ก้อนเดิม 264 รอบ ≈ 8 MB
 * ต่อการเปิดตารางหนึ่งครั้ง (~1 วินาที) · ตัวนี้ยิงสองคำสั่งพร้อมกันด้วย `head` ชุดเดียวกัน:
 * ใบสมัคร **ไม่เอาสำเนา** กับ `$group` ด้วยตัวสำเนาเอง → ได้สำเนาทีละรุ่นพร้อมรายการ `_id`
 * แล้วประกบคืนให้ทุกใบ · ผลที่ได้คือสำเนา **เต็มรูปเหมือนเดิมทุกข้อ** ไม่ได้ตัดอะไรทิ้ง
 * (`findByRole()` จับคู่ด้วย label จึงคัดข้อทิ้งตั้งแต่ในฐานไม่ได้ — ดู `ROLE_MATCHERS`)
 *
 * ไม่ใช้ `$facet` รวมเป็นคำสั่งเดียว เพราะผลของ `$facet` เป็นเอกสารเดียวที่ติดเพดาน 16 MB
 * — วันที่ฟอร์มถูกแก้บ่อยจนรุ่นเยอะ หน้าจะพังทั้งหน้า · สองคำสั่งแยกไม่มีเพดานนั้น
 *
 * ⚠️ ใบที่ใช้รุ่นเดียวกันได้สำเนา **อ็อบเจกต์ตัวเดียวกัน** — ขาอ่านเท่านั้น ห้ามแก้ในที่
 */
export async function readApplicationsWithSnapshot<T extends Document>(
  /** `$match` / `$sort` / `$limit` ที่เลือกใบ — ใช้ชุดเดียวกันทั้งสองคำสั่ง */
  head: Document[],
  /** projection ของฟิลด์อื่น **ไม่ต้องใส่ `questionSnapshot`** */
  project: Document,
): Promise<(T & { _id: ObjectId; questionSnapshot: QuestionSnapshot[] })[]> {
  const col = await applications();
  const [docs, versions] = await Promise.all([
    col.aggregate<T & { _id: ObjectId }>([...head, { $project: project }]).toArray(),
    col
      .aggregate<{ _id: QuestionSnapshot[] | null; ids: ObjectId[] }>([
        ...head,
        { $group: { _id: "$questionSnapshot", ids: { $push: "$_id" } } },
      ])
      .toArray(),
  ]);

  const snapshots = new Map<string, QuestionSnapshot[]>();
  for (const version of versions) {
    for (const id of version.ids) snapshots.set(id.toHexString(), version._id ?? []);
  }

  /* ใบที่เข้ามาระหว่างสองคำสั่ง (หรือ `createdAt` เท่ากันตรงขอบ `$limit`) จะไม่อยู่ในชุดรุ่น —
     อ่านสำเนาของใบพวกนั้นตรง ๆ ไม่ใช่ปล่อยเป็นค่าว่าง ไม่งั้นนามสกุล/เขตงานหายเงียบ ๆ */
  const missing = docs.filter((d) => !snapshots.has(d._id.toHexString())).map((d) => d._id);
  if (missing.length) {
    const late = await col
      .find({ _id: { $in: missing } }, { projection: { questionSnapshot: 1 } })
      .toArray();
    for (const doc of late) snapshots.set(doc._id.toHexString(), doc.questionSnapshot ?? []);
  }

  return docs.map((doc) => ({
    ...doc,
    questionSnapshot: snapshots.get(doc._id.toHexString()) ?? [],
  }));
}

/**
 * ฟิลด์ที่ตารางแอดมินใช้จริง — **ที่เหลือไม่ต้องข้ามเน็ตมา**
 *
 * ใบสมัครหนึ่งใบหนักราว 45 KB (10 ต.ค. 2026) ซึ่งเกือบทั้งหมดเป็นของที่ตารางไม่แตะ:
 * `legacyRow` (~12 KB แถวดิบของใบที่นำเข้าจาก Google Form) · `documents` / `documentMeta`
 * (สำเนาเอกสาร) · `consent` · `timeline` (ทุกครั้งที่เปลี่ยนสถานะต่อท้ายไปเรื่อย ๆ)
 * · และ `files` ที่ต้องการแค่จำนวน — projection แบบระบุฟิลด์ที่ต้องการจึงตัดทั้งหมดนี้ให้เอง
 *
 * `questionSnapshot` ไม่อยู่ในนี้ — มาทาง `readApplicationsWithSnapshot()` ทีละรุ่น
 */
const SUMMARY_FIELDS = {
  ref: 1,
  status: 1,
  fullName: 1,
  phone: 1,
  contactOwner: 1,
  interview: 1,
  exitReason: 1,
  exitReasonNote: 1,
  blacklist: 1,
  erasedAt: 1,
  createdAt: 1,
  updatedAt: 1,
  answers: 1,
  /* สรุป Driver Rating ต้องใช้คะแนนที่ให้เองด้วย — คำตอบมาอยู่แล้ว สำเนาคำถามมาทีละรุ่น */
  rating: 1,
} as const;

/**
 * ทุกใบที่ติด Blacklist — **ไม่จำกัดจำนวน** ต่างจาก `listApplications()` เพราะคนที่
 * ติดไว้เมื่อปีก่อนก็ต้องถูกจับได้ตอนสมัครเข้ามาใหม่วันนี้ ถึงใบเดิมจะหลุดจาก
 * 500 ใบล่าสุดของตารางไปแล้ว · ตารางผู้สมัครเอาไปเทียบชื่อ/เบอร์เอง (`findBlacklistHit()`)
 */
export async function listBlacklist(): Promise<BlacklistEntry[]> {
  const docs = await readApplicationsWithSnapshot<
    Pick<ApplicationDoc, "ref" | "status" | "blacklist" | "fullName" | "phone" | "answers">
  >([{ $match: { blacklist: true } }], {
    ref: 1,
    status: 1,
    blacklist: 1,
    fullName: 1,
    phone: 1,
    answers: 1,
  });

  return docs
    .filter((doc) => blacklistOf(doc))
    .map((doc) => ({ ref: doc.ref, fullName: fullNameOf(doc), phone: doc.phone ?? "" }));
}

export async function listApplications(): Promise<ApplicationSummary[]> {
  const docs = await readApplicationsWithSnapshot<
    Omit<
      ApplicationDoc,
      "files" | "documents" | "documentMeta" | "consent" | "timeline" | "questionSnapshot"
    > & { fileCount: number }
  >(
    [{ $sort: { createdAt: -1 } }, { $limit: LIST_LIMIT }],
    // นับไฟล์ในฐานข้อมูล ไม่ต้องส่งรายการไฟล์ทั้งชุดมานับเองที่นี่
    { ...SUMMARY_FIELDS, fileCount: { $size: { $ifNull: ["$files", []] } } },
  );

  return docs.map<ApplicationSummary>((doc) => ({
    id: doc._id.toHexString(),
    ref: doc.ref,
    status: normalizeStatus(doc.status),
    fullName: fullNameOf(doc),
    phone: doc.phone,
    workZone: roleAnswer(doc, "work_zone"),
    readyToStart: roleAnswer(doc, "ready_date"),
    contactOwner: doc.contactOwner || declaredContact(doc),
    interview: interviewOf(doc),
    exitReason: isExitReason(doc.exitReason) ? doc.exitReason : "",
    exitReasonNote: exitNoteOf(doc),
    blacklist: blacklistOf(doc),
    rating: summarizeRating({
      questionSnapshot: doc.questionSnapshot,
      answers: doc.answers ?? {},
      rating: ratingOf(doc),
    }),
    fileCount: doc.fileCount,
    erased: erasedOf(doc),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }));
}

/**
 * รายชื่อเจ้าหน้าที่ที่เลือกเป็น “ผู้ติดต่อกลับ” ได้ในตารางผู้สมัคร
 *
 * อ่านจาก**ตัวเลือกของคำถามในฟอร์มสมัคร** (ข้อ “ติดต่อเจ้าหน้าที่ฝ่ายบุคคลท่านใด”)
 * ไม่ได้ฮาร์ดโค้ดไว้ในระบบ — ฝ่ายบุคคลแก้รายชื่อทีมตัวเองจากหน้าคลังคำถามอยู่แล้ว
 * การมีรายชื่อชุดที่สองให้ต้องคอยไล่แก้ตามคือจุดที่สองชุดจะเริ่มไม่ตรงกัน
 *
 * ตัดตัวเลือกที่ไม่ใช่ชื่อคนออก (“ยังไม่มีใครติดต่อ” / “อื่นๆ”) — สองอันนั้นเป็น
 * คำตอบของผู้สมัคร ไม่ใช่คนที่รับผิดชอบใบสมัครได้
 */
export async function listContactOwners(): Promise<string[]> {
  const question = findByRole(await listActiveQuestions(), "hr_contact");
  if (!question) return [];
  return question.options
    .map((o) => o.label.trim())
    .filter((label) => label && !/ยังไม่มี|อื่น/.test(label));
}

export async function getApplication(id: string): Promise<Application | null> {
  if (!ObjectId.isValid(id)) return null;
  const doc = await (await applications()).findOne({ _id: new ObjectId(id) });
  return doc ? toApplication(doc) : null;
}

/* ------------------------------------------------------- ฝั่งผู้สมัครเปิดดูเอง */

/** รูปที่ผู้สมัครเห็นบนหน้าติดตาม — ไม่มีคำตอบและไม่มีลิงก์ไฟล์ */
export interface PublicStatus {
  ref: string;
  fullName: string;
  status: ApplicationStatus;
  /** ยกเลิกเองและลบข้อมูลไปแล้ว — หน้าติดตามใช้แยกจาก “ฝ่ายบุคคลยกเลิกให้” */
  erased: boolean;
  createdAt: string;
  updatedAt: string;
  /** เฉพาะบันทึกที่ฝ่ายบุคคลตั้งใจให้ผู้สมัครเห็น (`at` + `to` เท่านั้น) */
  steps: { at: string; to: ApplicationStatus }[];
}

/**
 * เปิดดูสถานะด้วยเลขอ้างอิงคู่กับเบอร์ — ต้องถูกทั้งคู่
 *
 * ใช้สองอย่างประกอบกันเพราะเลขอ้างอิงเดาได้ (เรียงกันเป็นลำดับ) การถามเบอร์
 * ที่ผู้สมัครกรอกไว้เองจึงเป็นด่านที่ทำให้เดาเลขไล่ไปทีละใบแล้วเปิดดูชื่อคนอื่นไม่ได้
 */
export async function lookupStatus(
  rawRef: unknown,
  rawPhone: unknown,
): Promise<PublicStatus> {
  const ref = typeof rawRef === "string" ? rawRef.trim().toUpperCase() : "";
  const phone = digitsOnly(typeof rawPhone === "string" ? rawPhone : "");

  if (!ref || phone.length !== 10) {
    throw new RecruitmentError("กรอกเลขอ้างอิงและเบอร์มือถือที่ใช้สมัครให้ครบ");
  }

  const doc = await (await applications()).findOne({ ref, phone });
  if (!doc) {
    throw new RecruitmentError(
      "ไม่พบใบสมัครที่ตรงกับเลขอ้างอิงและเบอร์นี้ — ลองตรวจอีกครั้งว่าพิมพ์ครบถ้วน",
    );
  }

  return {
    ref: doc.ref,
    fullName: fullNameOf(doc),
    status: normalizeStatus(doc.status),
    erased: erasedOf(doc),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    steps: (doc.timeline ?? []).map((t) => ({
      at: t.at,
      to: normalizeStatus(t.to),
    })),
  };
}

/**
 * ผู้สมัครยกเลิกใบสมัครของตัวเองและขอให้ลบข้อมูล (PDPA ม.19 วรรคห้า และ ม.33)
 *
 * **ลบเนื้อหาทิ้งจริง** — คำตอบ ไฟล์แนบ ชื่อ และสำเนาคำถาม ถูกล้างออกหมด
 * เหลือไว้เพียงเลขอ้างอิง เบอร์ที่ใช้ค้น และหลักฐานว่าลบเมื่อไหร่ (`erasedAt`)
 * ซึ่งเป็นสิ่งที่ต้องเก็บไว้พิสูจน์ว่าเราทำตามคำขอจริง
 *
 * ใบลงเอยที่สถานะ **“ยกเลิก” เหมือนที่ฝ่ายบุคคลกดยกเลิกเอง** — ไม่มีสถานะ
 * “ถอนความยินยอม” แยกอีกแล้ว (ดู `APPLICATION_STATUSES`) สิ่งที่แยกสองกรณีนี้
 * ออกจากกันคือเหตุผล `self_cancelled` กับร่องรอย `erasedAt` ที่ล็อกใบไว้
 *
 * **ไฟล์แนบบน S3 ถูกลบทั้งโฟลเดอร์ทันที** (`mass-image/applications/{ref}/` — ตามคำสั่ง
 * เจ้าของงาน 1 ต.ค. 2026) · ลิงก์ Spaces สาธารณะสมัยก่อน (ถ้ามี) ลบจากที่นี่ไม่ได้
 */
export async function cancelApplication(
  rawRef: unknown,
  rawPhone: unknown,
): Promise<PublicStatus> {
  const current = await lookupStatus(rawRef, rawPhone);
  if (current.erased) return current;

  const now = new Date().toISOString();
  const entry: TimelineEntry = {
    at: now,
    from: current.status,
    to: "cancelled",
    by: "ผู้สมัคร",
    note: "ผู้สมัครยกเลิกใบสมัครเองและขอให้ลบข้อมูล",
  };

  const updated = await (
    await applications()
  ).findOneAndUpdate(
    { ref: current.ref },
    {
      $set: {
        status: "cancelled",
        exitReason: "self_cancelled",
        fullName: "— ลบตามคำขอของเจ้าของข้อมูล —",
        answers: {},
        questionSnapshot: [],
        files: [],
        erasedAt: now,
        updatedAt: now,
      },
      $push: { timeline: entry },
    },
    { projection: { _id: 1 } },
  );

  /* เอกสาร HR (สัญญาจ้าง/สัญญาค้ำ/ยินยอมคืนเงินค้ำ) ที่เคยทำไว้กับใบนี้มีเลขบัตร
     ประชาชนและที่อยู่อยู่ด้วย — ต้องลบทิ้งพร้อมกัน ไม่งั้นข้อมูลส่วนบุคคลจะยังค้าง
     อยู่ในอีกคอลเลกชันทั้งที่ใบสมัครบอกว่า “ลบแล้ว” · ล้มเหลวแล้วไม่โยนต่อ (ท่าเดียวกับ
     `syncRequisitionForApplication()`) — การลบใบสมัครหลักต้องสำเร็จเสมอ ต่อให้เอกสาร
     HR มีปัญหา เพราะนั่นเป็นสิ่งที่ผู้สมัครไม่รู้จักและแก้เองไม่ได้ */
  await deleteMediaFolder(mediaKeys.applicationFolder(current.ref)).catch((err: unknown) => {
    console.warn("[applications] ลบไฟล์แนบบน S3 ของใบที่ยกเลิกไม่สำเร็จ —", current.ref, err);
  });

  if (updated?._id) {
    await eraseHrDocuments(updated._id.toHexString()).catch((err: unknown) => {
      console.warn("[applications] ลบเอกสาร HR ที่ผูกกับใบนี้ไม่สำเร็จ —", err);
    });
  }

  /* คืนชื่อที่ปิดทับไปแล้ว ไม่ใช่ชื่อจริงที่อ่านมาก่อนลบ — หน้าจอที่รับค่านี้ไปแสดง
     ต่อทันทีจะได้ไม่โชว์ชื่อที่เพิ่งถูกลบออกจากฐานไปเมื่อครู่ */
  return {
    ...current,
    fullName: "— ลบตามคำขอของเจ้าของข้อมูล —",
    status: "cancelled",
    erased: true,
    updatedAt: now,
  };
}

export { RecruitmentError };
