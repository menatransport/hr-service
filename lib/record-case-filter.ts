import {
  RECORD_STATUSES,
  involvedLabel,
  recordCategoryLabel,
  warningLabel,
  type RecordCase,
  type RecordCategory,
  type RecordStatus,
} from "./record-case-flow";

/**
 * ตัวกรองคิวบันทึกเคส — **กฎเดียวใช้ร่วมกันทั้งตารางบนจอและไฟล์ Excel ที่ส่งออก**
 * คู่ขนานกับ `lib/case-filter.ts` ของฝั่งคำร้อง พจส. (เหตุผลเดียวกัน — ปล่อยให้
 * ต่างคนต่างเขียนเงื่อนไขกรอง ไฟล์ที่ส่งออกจะไม่ตรงกับที่ตารางแสดงเงียบ ๆ)
 */

export interface RecordCaseFilters {
  /** คำค้น — เทียบกับเลขที่ หัวเรื่อง รายละเอียด หมายเหตุ ผู้บันทึก ประเภท โทษทางวินัย และผู้เกี่ยวข้อง */
  query: string;
  status: RecordStatus | "all";
  department: string;
  category: string;
}

export const NO_RECORD_FILTERS: RecordCaseFilters = {
  query: "",
  status: "all",
  department: "all",
  category: "all",
};

export const hasRecordFilters = (f: RecordCaseFilters): boolean =>
  f.query.trim() !== "" ||
  f.status !== "all" ||
  f.department !== "all" ||
  f.category !== "all";

/** `categories` ต้องส่งเข้ามาเพราะป้ายประเภทเป็นข้อมูลที่จัดการได้จาก UI ไม่ใช่ค่าคงที่แล้ว */
export function matchesRecordFilters(
  r: RecordCase,
  f: RecordCaseFilters,
  categories: RecordCategory[],
): boolean {
  if (f.status !== "all" && r.status !== f.status) return false;
  if (f.department !== "all" && r.departmentId !== f.department) return false;
  if (f.category !== "all" && r.category !== f.category) return false;

  const q = f.query.trim().toLowerCase();
  if (!q) return true;
  return [
    r.code,
    r.title,
    r.detail,
    r.remark,
    r.recorder.name,
    recordCategoryLabel(categories, r.category),
    ...r.warnings.map(warningLabel),
    ...r.involved.map(involvedLabel),
  ].some((v) => v.toLowerCase().includes(q));
}

export const filterRecordCases = (
  records: RecordCase[],
  f: RecordCaseFilters,
  categories: RecordCategory[],
): RecordCase[] => records.filter((r) => matchesRecordFilters(r, f, categories));

/* ------------------------------------------------------- แปลงเป็น query string */

/** ใส่เฉพาะตัวที่ถูกตั้งค่าจริง — URL ของการส่งออกจึงอ่านออกว่ากรองอะไรไว้บ้าง */
export function recordFiltersToParams(f: RecordCaseFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (f.query.trim()) params.set("q", f.query.trim());
  if (f.status !== "all") params.set("status", f.status);
  if (f.department !== "all") params.set("department", f.department);
  if (f.category !== "all") params.set("category", f.category);
  return params;
}

/**
 * อ่านกลับจาก query string — **ค่าที่ไม่รู้จักถูกโยนทิ้งเป็น `all`** ไม่ใช่กรองด้วยค่าดิบ
 * ที่ไม่มีทางตรงกับใครแล้วได้ไฟล์เปล่า ๆ กลับไปโดยไม่มีใครรู้ว่าทำไม
 */
export function recordFiltersFromParams(params: URLSearchParams): RecordCaseFilters {
  const status = params.get("status") ?? "";
  return {
    query: params.get("q")?.trim() ?? "",
    status: (RECORD_STATUSES as string[]).includes(status) ? (status as RecordStatus) : "all",
    department: params.get("department") || "all",
    category: params.get("category") || "all",
  };
}
