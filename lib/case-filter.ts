import { STATUS_FLOW, isSlaBreached } from "./case-flow";
import type { CaseStatus, DepartmentId, HrCase } from "./types";

/**
 * ตัวกรองคิวคำร้อง — **กฎเดียวใช้ร่วมกันทั้งตารางบนจอและไฟล์ที่ส่งออก**
 *
 * เดิมเงื่อนไขนี้เขียนอยู่ใน `case-table.tsx` ที่เดียว พอมีปุ่มส่งออก Excel
 * ซึ่งกรองซ้ำฝั่งเซิร์ฟเวอร์ ถ้าปล่อยให้ต่างคนต่างเขียนเมื่อไหร่ไฟล์ที่ได้จะ
 * ไม่ตรงกับที่ผู้ใช้เห็นบนจอ — ซึ่งเป็นการโกหกที่จับได้ยากที่สุดแบบหนึ่ง
 * (ไฟล์ดูสมบูรณ์ทุกอย่าง แต่ตกคำร้องไปเงียบ ๆ)
 */

/** ค่าของ dropdown ต้องไม่ใช่ค่าว่าง (ค่าว่าง = ยังไม่เลือก) จึงใช้ `none` แทน */
export const UNASSIGNED = "none";

export interface CaseFilters {
  /** คำค้น — เทียบกับเลขติดตาม หัวข้อ รหัสและชื่อ พจส. */
  query: string;
  status: CaseStatus | "all";
  /** `all` · `none` (ยังไม่มอบหมาย) · รหัสหน่วยงาน */
  department: string;
  slaOnly: boolean;
}

export const NO_FILTERS: CaseFilters = {
  query: "",
  status: "all",
  department: "all",
  slaOnly: false,
};

export const hasFilters = (f: CaseFilters): boolean =>
  f.query.trim() !== "" ||
  f.status !== "all" ||
  f.department !== "all" ||
  f.slaOnly;

/**
 * มุมมองของแถว ณ ตอนนั้น — ตารางส่งค่าที่ผู้ใช้เพิ่งเลือกไว้ (ยังไม่ทันรีเฟรช)
 * เข้ามาแทนค่าจากเซิร์ฟเวอร์ ฝั่งส่งออกไม่ต้องส่งอะไรเพราะอ่านข้อมูลสดอยู่แล้ว
 */
export interface CaseView {
  status: CaseStatus;
  departmentId: DepartmentId | null;
}

export function matchesFilters(
  hrCase: HrCase,
  f: CaseFilters,
  view: CaseView = hrCase,
): boolean {
  if (f.status !== "all" && view.status !== f.status) return false;
  if (
    f.department !== "all" &&
    (view.departmentId ?? UNASSIGNED) !== f.department
  ) {
    return false;
  }
  if (f.slaOnly && !isSlaBreached(hrCase)) return false;

  const q = f.query.trim().toLowerCase();
  if (!q) return true;
  return `${hrCase.trackingNo} ${hrCase.subject} ${hrCase.driverId} ${hrCase.driverName}`
    .toLowerCase()
    .includes(q);
}

export const filterCases = (cases: HrCase[], f: CaseFilters): HrCase[] =>
  cases.filter((c) => matchesFilters(c, f));

/* ------------------------------------------------------- แปลงเป็น query string */

/** ใส่เฉพาะตัวที่ถูกตั้งค่าจริง — URL ของการส่งออกจึงอ่านออกว่ากรองอะไรไว้บ้าง */
export function filtersToParams(f: CaseFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (f.query.trim()) params.set("q", f.query.trim());
  if (f.status !== "all") params.set("status", f.status);
  if (f.department !== "all") params.set("department", f.department);
  if (f.slaOnly) params.set("sla", "1");
  return params;
}

/**
 * อ่านกลับจาก query string — **ค่าที่ไม่รู้จักถูกโยนทิ้งเป็น `all`** ไม่ใช่กรอง
 * ด้วยค่าดิบที่ไม่มีทางตรงกับใครแล้วได้ไฟล์เปล่า ๆ กลับไปโดยไม่มีใครรู้ว่าทำไม
 */
export function filtersFromParams(params: URLSearchParams): CaseFilters {
  const status = params.get("status") ?? "";
  const department = params.get("department") ?? "";

  return {
    query: params.get("q")?.trim() ?? "",
    status: (STATUS_FLOW as string[]).includes(status)
      ? (status as CaseStatus)
      : "all",
    department: department || "all",
    slaOnly: params.get("sla") === "1",
  };
}
