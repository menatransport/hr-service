import { OWNER_ORDER, type IntakeOwner } from "./registry";

/**
 * ผู้รับผิดชอบในทะเบียน ↔ `department_id` ของ NCAC
 *
 * **สี่ฝ่ายยืนยันรหัสแล้ว** จาก payload จริงของ `GET /users` (8 ก.ย. 2569 — ชุดเดียวกับที่
 * `lib/case-notify.ts` อ้างไว้): 3 ยานยนต์ · 11 Operation Support · 15 จัดส่งลาดกระบัง ·
 * 24 HR [พัฒนาบุคลากรและองค์กร]
 *
 * **บัญชีกรุงเทพ กับ บัญชีลาดกระบัง ไม่มีรหัสในชุดนั้น** — ค่าเป็น `null` ไม่ใช่เลขที่เดาเอา
 * เพราะรหัสนี้ตัดสินว่าใครเห็นและอัปโหลดของใครได้ เดาผิดคือเปิดให้ฝ่ายหนึ่งส่งไฟล์
 * แทนอีกฝ่ายโดยไม่มีใครรู้
 *
 * เติมได้ด้วย `NEXT_PUBLIC_PAYROLL_OWNER_DEPARTMENTS="บัญชี กรุงเทพ=31,บัญชี ลาดกระบัง=32"`
 * (ค่าตั้งของผู้ดูแลระบบตอน build ไม่ใช่ค่าที่ผู้ใช้ส่งมาได้ — ท่าเดียวกับ `approver.ts`)
 * วันที่ได้รหัสจริงจาก NCAC แล้วให้ย้ายมาใส่ในตารางนี้ตรง ๆ แล้วลบ env ออก
 *
 * **env เติมได้แค่ช่องที่ยังเป็น `null` ทับรหัสที่ยืนยันแล้วไม่ได้** — ถ้าทับได้
 * การพิมพ์ชื่อฝ่ายผิดใน env หนึ่งตัวจะย้ายแถวของฝ่ายหนึ่งไปให้คนอีกฝ่ายเห็นและ
 * อัปโหลดแทนได้เงียบ ๆ ซึ่งเป็นสิ่งเดียวที่ตารางนี้มีไว้กัน
 */
export const CONFIRMED_OWNER_DEPARTMENT_ID: Record<IntakeOwner, string | null> = {
  "จัดส่ง ลาดกระบัง": "15",
  "บัญชี ลาดกระบัง": null,
  "บัญชี กรุงเทพ": null,
  "ยานยนต์": "3",
  "Operation Support": "11",
  "HR C&B": "24",
};

export type OwnerDepartmentIds = Record<IntakeOwner, string | null>;

/**
 * แปลงข้อความ env เป็นคู่ `ฝ่าย → รหัส` — **รับข้อความเข้ามา ไม่อ่าน `process.env` เอง**
 * เพื่อให้ทดสอบได้โดยไม่ขึ้นกับ shell หรือ CI ที่เผลอตั้งตัวแปรนี้ไว้
 */
export const parseOwnerDepartments = (
  raw: string | null | undefined,
): Partial<Record<IntakeOwner, string>> => {
  const out: Partial<Record<IntakeOwner, string>> = {};
  for (const pair of (raw ?? "").split(",")) {
    const [owner, id] = pair.split("=").map((v) => v.trim());
    if (owner && id && OWNER_ORDER.includes(owner as IntakeOwner)) {
      out[owner as IntakeOwner] = id;
    }
  }
  return out;
};

/** รวมตารางที่ยืนยันแล้วกับค่าจาก env — ค่าที่ยืนยันแล้วชนะเสมอ */
export const resolveOwnerDepartments = (
  confirmed: OwnerDepartmentIds,
  fromEnv: Partial<Record<IntakeOwner, string>>,
): OwnerDepartmentIds =>
  Object.fromEntries(
    OWNER_ORDER.map((owner) => [owner, confirmed[owner] ?? fromEnv[owner] ?? null]),
  ) as OwnerDepartmentIds;

export const OWNER_DEPARTMENT_ID: OwnerDepartmentIds = resolveOwnerDepartments(
  CONFIRMED_OWNER_DEPARTMENT_ID,
  parseOwnerDepartments(process.env.NEXT_PUBLIC_PAYROLL_OWNER_DEPARTMENTS),
);

export const departmentIdOf = (owner: IntakeOwner): string | null =>
  OWNER_DEPARTMENT_ID[owner] ?? null;

/** หลายฝ่ายในทะเบียนอาจสังกัดหน่วยงานเดียวกันได้ — คืนเป็นรายการเสมอ */
export const ownersOfDepartment = (departmentId: string): IntakeOwner[] =>
  OWNER_ORDER.filter((owner) => OWNER_DEPARTMENT_ID[owner] === departmentId);

/** ฝ่ายที่ยังไม่มีรหัสในตารางที่ส่งเข้ามา — แยกไว้เพื่อทดสอบได้โดยไม่พึ่ง env */
export const unmappedIn = (ids: OwnerDepartmentIds): IntakeOwner[] =>
  OWNER_ORDER.filter((owner) => ids[owner] === null);

/** ฝ่ายที่ยังไม่มีรหัส — หน้าจอต้องบอกเรื่องนี้ ไม่ใช่ทำเป็นไม่มีฝ่ายนั้น */
export const unmappedOwners = (): IntakeOwner[] => unmappedIn(OWNER_DEPARTMENT_ID);
