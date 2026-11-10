import type { HrDocId } from "./hr-documents";

/**
 * ลายเซ็นบนเอกสาร HR (8 พ.ย. 2569) — **ไฟล์กลางของทั้งสองฝั่ง** (client-safe ไม่แตะฐาน)
 *
 * ช่องลงนามทุกช่องบนกระดาษรับรูปลายเซ็นได้ — เขียนบนจอหรืออัปโหลดรูป:
 *
 * - **ช่องเจ้าหน้าที่** (ผู้สัมภาษณ์ · นายจ้าง · พยาน) เซ็นด้วยลายเซ็นที่เก็บไว้กับ
 *   session ของคนที่ล็อกอิน (`GET/PUT /api/recruitment/my-signature`) · ตั้งครั้งเดียวใช้ซ้ำได้ทุกใบ
 *   ชื่อใต้ลายเซ็น = **ชื่อในรายชื่อผู้ลงนามของเอกสาร** (`employer`/`witness1`/`witness2`)
 *   ถึงคนกดเซ็นจะเป็นบัญชีอื่น (9 พ.ย. 2569) · ผู้สัมภาษณ์ใช้ช่อง `interviewer` ของรายงาน
 *   (10 พ.ย. 2569) · ช่องที่เว้นว่างถอยไปใช้ชื่อจาก session
 * - **ช่องผู้สมัคร** เซ็นสดที่โต๊ะ HR หรือเซ็นเองผ่านลิงก์ภายนอก (`sign-links.ts`) —
 *   ไม่มีที่เก็บประจำตัว · ชื่อใต้ลายเซ็นดึงจากชื่อผู้สมัครในเอกสารเสมอ
 *
 * รูปลายเซ็นที่ลงช่องแล้วเป็น **สำเนาฝังใน `DocFill.signatures`** ไม่ใช่ลิงก์ไปหา
 * ลายเซ็นของเจ้าหน้าที่ — เปลี่ยนลายเซ็นทีหลัง เอกสารที่เซ็นไปแล้วไม่เปลี่ยนตาม
 * และสำเนาในประวัติการพิมพ์ก็ตรงกับกระดาษจริง
 */

export type SignRole = "applicant" | "interviewer" | "employer" | "witness1" | "witness2";

export interface SignSlot {
  role: SignRole;
  /** ป้ายบนกระดาษหลัง “ลงชื่อ…” */
  label: string;
  /** `true` = เจ้าหน้าที่เซ็น (ใช้ลายเซ็นตาม session) · `false` = ผู้สมัครเซ็น */
  staff: boolean;
}

/** ช่องลงนามของแต่ละฉบับ เรียงตามที่อยู่บนกระดาษ — Driver Rating ไม่มีช่องเซ็น */
export const DOC_SIGN_SLOTS: Record<HrDocId, SignSlot[]> = {
  profile: [
    { role: "applicant", label: "ผู้สมัคร", staff: false },
    { role: "interviewer", label: "ผู้สัมภาษณ์", staff: true },
  ],
  rating: [],
  contract: [
    { role: "employer", label: "นายจ้าง", staff: true },
    { role: "applicant", label: "พนักงาน / ลูกจ้าง", staff: false },
    { role: "witness1", label: "พยาน", staff: true },
    { role: "witness2", label: "พยาน", staff: true },
  ],
  deposit: [
    { role: "applicant", label: "ลูกจ้าง / ผู้ให้ความยินยอม", staff: false },
    { role: "employer", label: "นายจ้าง", staff: true },
    { role: "witness1", label: "พยาน", staff: true },
    { role: "witness2", label: "พยาน", staff: true },
  ],
  refund: [
    { role: "applicant", label: "ลูกจ้าง / ผู้ให้ความยินยอม", staff: false },
    { role: "employer", label: "นายจ้าง", staff: true },
    { role: "witness1", label: "พยาน", staff: true },
    { role: "witness2", label: "พยาน", staff: true },
  ],
};

/** คีย์ช่องลงนาม `contract:employer` — เซ็นแยกทุกฉบับ ไม่ใช้ลายเซ็นข้ามฉบับ · ห้ามใช้ `.` (Mongo อ่านเป็น path) */
export type SignKey = `${HrDocId}:${SignRole}`;

export const signKey = (doc: HrDocId, role: SignRole): SignKey => `${doc}:${role}`;

export const SIGN_KEYS: readonly SignKey[] = (
  Object.entries(DOC_SIGN_SLOTS) as [HrDocId, SignSlot[]][]
).flatMap(([doc, slots]) => slots.map((s) => signKey(doc, s.role)));

/** ลายเซ็นหนึ่งช่องที่ลงไว้แล้ว */
export interface DocSignature {
  /** `data:image/png;base64,…` พื้นโปร่ง ตัดขอบแล้ว */
  image: string;
  /** ชื่อในวงเล็บใต้ลายเซ็น — เจ้าหน้าที่ = ชื่อในรายชื่อผู้ลงนาม (ว่าง = ชื่อจาก session) · ผู้สมัคร = ชื่อในเอกสาร */
  name: string;
  by: "staff" | "applicant";
  /** รหัสพนักงานของเจ้าหน้าที่ที่เซ็น · ผู้สมัคร = `""` */
  employeeId: string;
  /** เวลาที่ลงลายเซ็น ISO — วันที่ใต้ช่องเซ็นอ่านจากนี่ */
  signedAt: string;
}

export type DocSignatures = Partial<Record<SignKey, DocSignature>>;

/** ลายเซ็นเจ้าหน้าที่ตาม session — `GET /api/recruitment/my-signature` */
export interface MySignature {
  employeeId: string;
  name: string;
  position: string;
  /** `null` = ยังไม่เคยบันทึกลายเซ็น */
  image: string | null;
  updatedAt: string | null;
}

/**
 * เพดานขนาดรูปลายเซ็น (ตัวอักษรของ data URL) — รูปที่ตัวเขียน/ตัวอัปโหลดย่อแล้ว
 * อยู่ราว 10–40 KB · เพดานกันคนยิง API ตรงด้วยรูปใหญ่ ๆ จนเอกสารในฐานบวม
 */
export const MAX_SIGNATURE_CHARS = 300_000;

const DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;

export function isSignatureImage(v: unknown): v is string {
  return typeof v === "string" && v.length <= MAX_SIGNATURE_CHARS && DATA_URL.test(v);
}

const text = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** ตัดช่องลายเซ็นที่ส่งมาให้เหลือเฉพาะคีย์ที่รู้จักและรูปที่ถูกรูปแบบ — ที่เหลือทิ้งเงียบ ๆ */
export function sanitizeSignatures(input: unknown): DocSignatures {
  if (!input || typeof input !== "object") return {};
  const body = input as Record<string, unknown>;
  const out: DocSignatures = {};
  for (const key of SIGN_KEYS) {
    const raw = body[key];
    if (!raw || typeof raw !== "object") continue;
    const s = raw as Record<string, unknown>;
    if (!isSignatureImage(s.image)) continue;
    const signedAt = text(s.signedAt, 40);
    out[key] = {
      image: s.image,
      name: text(s.name),
      by: s.by === "staff" ? "staff" : "applicant",
      employeeId: s.by === "staff" ? text(s.employeeId, 40) : "",
      signedAt: Number.isNaN(Date.parse(signedAt)) ? new Date().toISOString() : signedAt,
    };
  }
  return out;
}

/** เทียบลายเซ็นสองชุด — ใช้ตัดสินว่ามีอะไรยังไม่บันทึก */
export function sameSignatures(a: DocSignatures | undefined, b: DocSignatures | undefined): boolean {
  const x = a ?? {};
  const y = b ?? {};
  for (const key of new Set([...Object.keys(x), ...Object.keys(y)]) as Set<SignKey>) {
    const p = x[key];
    const q = y[key];
    if (!p && !q) continue;
    if (!p || !q) return false;
    if (p.image !== q.image || p.name !== q.name || p.signedAt !== q.signedAt) return false;
  }
  return true;
}

/* ------------------------------------------------------- บันทึกแบบ patch */

/**
 * ลายเซ็นที่เปลี่ยนเทียบกับค่าที่บันทึกไว้ — `null` = ล้างช่องนั้น
 *
 * ปุ่มบันทึกส่งลายเซ็นเป็น **patch ไม่ใช่ทั้งก้อน** (8 พ.ย. 2569) เพราะผู้สมัครเซ็นผ่านลิงก์
 * ภายนอกได้ระหว่างที่กล่องของฝ่ายบุคคลเปิดค้างอยู่ — ส่งทั้งก้อนจะลบลายเซ็นนั้นทิ้งเงียบ ๆ
 */
export type SignaturePatch = Partial<Record<SignKey, DocSignature | null>>;

export function diffSignatures(
  base: DocSignatures | undefined,
  next: DocSignatures | undefined,
): SignaturePatch {
  const a = base ?? {};
  const b = next ?? {};
  const out: SignaturePatch = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)]) as Set<SignKey>) {
    if (sameSignatures({ [key]: a[key] }, { [key]: b[key] })) continue;
    out[key] = b[key] ?? null;
  }
  return out;
}

/** ตรวจ patch ที่ส่งมา — คีย์ไม่รู้จักทิ้ง · รูปผิดรูปแบบทิ้ง (ไม่ใช่ล้าง) */
export function sanitizeSignaturePatch(input: unknown): SignaturePatch | null {
  if (!input || typeof input !== "object") return null;
  const body = input as Record<string, unknown>;
  const out: SignaturePatch = {};
  for (const key of SIGN_KEYS) {
    if (!(key in body)) continue;
    if (body[key] === null) {
      out[key] = null;
      continue;
    }
    const clean = sanitizeSignatures({ [key]: body[key] })[key];
    if (clean) out[key] = clean;
  }
  return out;
}

export function applySignaturePatch(
  base: DocSignatures | undefined,
  patch: SignaturePatch,
): DocSignatures {
  const out: DocSignatures = { ...(base ?? {}) };
  for (const [key, sig] of Object.entries(patch) as [SignKey, DocSignature | null][]) {
    if (sig) out[key] = sig;
    else delete out[key];
  }
  return out;
}
