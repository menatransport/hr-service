import type {
  ComplaintCreate,
  ComplaintCreateResponse,
  ComplaintDto,
  ComplaintLogDto,
  ComplaintMasterCreate,
  ComplaintMasterDto,
  ComplaintMasterPatch,
  ComplaintPatch,
  GoogleLoginResponse,
  ReviewAction,
  UserDto,
  UserUpdate,
} from "./types";

/**
 * ตัวเรียก NCAC API — **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 * (route handler ใน `app/api/**` และ server component ผ่าน `lib/cases.ts`)
 *
 * base URL อ่านจาก `API_NCAC_URL` ซึ่งเป็น env ฝั่งเซิร์ฟเวอร์ (ไม่มี `NEXT_PUBLIC_`)
 * จึงไม่หลุดไปอยู่ใน bundle ของเบราว์เซอร์ — client ยิงเข้า `/api/cases/**` ของเราแทน
 *
 * ทุก endpoint ที่นี่ตรงกับของระบบเดิมใน
 * `mena-next-lb/src/app/driver-complaint/api/*` เพื่อไม่ต้องแก้ backend
 */

const TIMEOUT_MS = 15_000;

export class NcacError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "NcacError";
  }
}

function baseUrl(): string {
  const raw = process.env.API_NCAC_URL;
  if (!raw) {
    throw new NcacError(
      "ยังไม่ได้ตั้งค่า API_NCAC_URL — ระบบเคสดึงข้อมูลจาก NCAC API เท่านั้น ไม่มีข้อมูลตัวอย่างสำรอง",
      500,
    );
  }
  return raw.replace(/\/+$/, "");
}

/** upstream บางเส้นห่อผลลัพธ์ไว้ใน `{ data }` บางเส้นส่งตรง ๆ — คลี่ให้เหมือนกัน */
function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${baseUrl()}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      // เคสเปลี่ยนสถานะตลอด — ห้าม cache ไม่งั้นกดอนุมัติแล้วหน้ายังเป็นค่าเดิม
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new NcacError(`ติดต่อ NCAC API ไม่ได้ (${reason})`, 502);
  }

  const text = await res.text();
  const payload: unknown = text ? safeJson(text) : null;

  if (!res.ok) {
    throw new NcacError(errorMessage(payload) ?? `NCAC API ตอบ ${res.status}`, res.status);
  }

  return unwrap<T>(payload);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessage(payload: unknown): string | null {
  if (typeof payload === "string") return payload || null;
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["error", "message", "detail"]) {
      const value = record[key];
      if (typeof value === "string" && value) return value;
    }
  }
  return null;
}

/* ---------------------------------------------------------------- เคส */

/**
 * `params` ส่งต่อให้ upstream ตรง ๆ (status / department_id / start_date / end_date)
 *
 * ปิดท้ายด้วย `/` ตามที่ FastAPI ประกาศไว้ — ถ้าไม่ใส่ upstream ตอบ 307 ให้ redirect
 * ซึ่งเปลืองรอบและอันตรายกับ method ที่มี body
 */
export function listComplaints(params?: URLSearchParams): Promise<ComplaintDto[]> {
  const query = params?.toString();
  return call<ComplaintDto[]>(`/complaints/${query ? `?${query}` : ""}`);
}

/**
 * เคสเดียว — **NCAC ไม่มี `GET /complaints/{tracking_no}`**
 *
 * ยืนยันจาก `/openapi.json` (6 ส.ค. 2026): เส้นที่มีคือ `PUT` กับ action endpoints
 * เท่านั้น ยิง `GET` แล้วได้ 405 ทำให้ทุกหน้าเคสกลายเป็น 404 จึงต้องดึงทั้งรายการ
 * มาค้นเอง — payload ของ `/complaints/` มีครบทุกฟิลด์รวม `reviews` อยู่แล้ว
 *
 * วันที่ backend เพิ่ม endpoint จริง ให้เปลี่ยนกลับเป็น `call()` เส้นเดียวที่นี่ที่เดียว
 */
export async function getComplaint(trackingNo: string): Promise<ComplaintDto> {
  const complaints = await listComplaints();
  const found = complaints.find((c) => c.tracking_no === trackingNo);
  if (!found) throw new NcacError(`ไม่พบคำร้องเลขที่ ${trackingNo}`, 404);
  return found;
}

/**
 * ประวัติการทำงานกับคำร้อง — `GET /complaints/logs`
 *
 * **รวมคำร้องที่ถูกลบแล้วด้วย** ต่างจาก `listComplaints()` ที่ upstream กรองทิ้ง
 * เรียงใหม่สุดก่อน · upstream บีบ `limit` ไว้ที่ 500
 */
export function listComplaintLogs(limit = 200): Promise<ComplaintLogDto[]> {
  const query = new URLSearchParams({ limit: String(limit) });
  return call<ComplaintLogDto[]>(`/complaints/logs?${query}`);
}

/** สร้างเคสใหม่ — ตอบกลับมาแค่ฟิลด์ย่อ ต้อง `getComplaint()` ต่อเองถ้าอยากได้เคสเต็ม */
export function createComplaint(
  payload: ComplaintCreate,
): Promise<ComplaintCreateResponse> {
  return call<ComplaintCreateResponse>("/complaints/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateComplaint(
  trackingNo: string,
  patch: ComplaintPatch,
): Promise<ComplaintDto> {
  return call<ComplaintDto>(`/complaints/${encodeURIComponent(trackingNo)}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

/**
 * ลบคำร้องแบบ soft — `DELETE /complaints/{tracking_no}` ตั้ง `is_deleted = true`
 * ไม่ได้ลบแถวจริง (ถ้าลบจริง `complaint_reviews` / `complaint_logs` จะหายตาม CASCADE)
 *
 * NCAC ตรวจกฎเดียวกับ `canDeleteCase()` ฝั่งเราซ้ำอีกชั้น — ต้องเป็น `OPEN`/`ASSIGNED`
 * และยังไม่มี reviewer ไม่งั้นตอบ **400** พร้อมเหตุผล · ลบซ้ำได้ **404**
 * `deletedByEmployeeId` ไปลง `complaint_logs` (`action = "DELETE"`) จึงตามได้ว่าใครลบ
 *
 * ⚠️ **บริการที่รันอยู่บน Render อาจยังเป็นโค้ดเก่าที่ยังไม่มีเส้นนี้** (ตอบ 405)
 * จนกว่าจะ deploy — route ฝั่งเราจึงอ่านกลับมายืนยันเสมอ ไม่เชื่อ 2xx ตรง ๆ
 */
export function deleteComplaint(
  trackingNo: string,
  deletedByEmployeeId: string,
  remark?: string,
): Promise<unknown> {
  const query = new URLSearchParams({
    deleted_by_employee_id: deletedByEmployeeId,
  });
  if (remark) query.set("remark", remark);

  return call(`/complaints/${encodeURIComponent(trackingNo)}?${query}`, {
    method: "DELETE",
  });
}

export function defineReviewer(
  trackingNo: string,
  level: 1 | 2,
  reviewerEmployeeId: string,
): Promise<unknown> {
  return call(`/complaints/${encodeURIComponent(trackingNo)}/define-reviewer`, {
    method: "POST",
    body: JSON.stringify({ level, reviewer_employee_id: reviewerEmployeeId }),
  });
}

export function reviewComplaint(
  trackingNo: string,
  action: ReviewAction,
  reviewerEmployeeId: string,
  remark: string,
): Promise<unknown> {
  const query = new URLSearchParams({
    reviewer_employee_id: reviewerEmployeeId,
    remark,
  });
  return call(
    `/complaints/${encodeURIComponent(trackingNo)}/${action}?${query}`,
    { method: "POST" },
  );
}

export function closeComplaint(
  trackingNo: string,
  closerEmployeeId: string,
): Promise<unknown> {
  const query = new URLSearchParams({ closer_employee_id: closerEmployeeId });
  return call(`/complaints/${encodeURIComponent(trackingNo)}/close?${query}`, {
    method: "POST",
  });
}

/* ---------------------------------------------------------------- ประเภทเรื่อง */

/**
 * รายการ “ประเภทเรื่อง” ทั้งหมด — `GET /complaint-masters/`
 *
 * ค่าเริ่มต้นของ upstream คือ **เฉพาะที่ยังเปิดใช้งาน** · หน้าจอจัดการต้องส่ง
 * `includeInactive` เพื่อให้เห็นของที่ปิดไว้ด้วย ไม่งั้นกดปิดแล้วแถวหายไปเลย
 * ทั้งที่ยังอยู่ในฐาน (เปิดกลับมาไม่ได้อีก)
 */
export function listComplaintMasters(
  opts: { departmentId?: number | string; includeInactive?: boolean } = {},
): Promise<ComplaintMasterDto[]> {
  const query = new URLSearchParams();
  if (opts.departmentId !== undefined && opts.departmentId !== "") {
    query.set("department_id", String(opts.departmentId));
  }
  if (opts.includeInactive) query.set("include_inactive", "true");

  const suffix = query.toString();
  return call<ComplaintMasterDto[]>(
    `/complaint-masters/${suffix ? `?${suffix}` : ""}`,
  );
}

export function createComplaintMaster(
  payload: ComplaintMasterCreate,
): Promise<ComplaintMasterDto> {
  return call<ComplaintMasterDto>("/complaint-masters/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateComplaintMaster(
  id: number,
  patch: ComplaintMasterPatch,
): Promise<ComplaintMasterDto> {
  return call<ComplaintMasterDto>(`/complaint-masters/${id}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

/**
 * ลบประเภทเรื่อง — **upstream ตอบ 409 ถ้ามีคำร้องอ้างถึงอยู่** และบอกให้ใช้
 * `is_active = false` แทน (ลบทิ้งจะทำให้คำร้องเก่าชี้ไปยังแถวที่หายไป
 * แล้วอ่านประวัติย้อนหลังไม่ออก) — ห้ามกลืน 409 นี้ทิ้ง ต้องบอกผู้ใช้ตรง ๆ
 */
export function deleteComplaintMaster(id: number): Promise<unknown> {
  return call<unknown>(`/complaint-masters/${id}`, { method: "DELETE" });
}

/* ---------------------------------------------------------------- เข้าสู่ระบบ */

/**
 * แลก Google ID token เป็น session ของ NCAC — `POST /auth/login/google`
 *
 * backend เป็นฝ่ายตรวจ token กับ Google เอง (`id_token.verify_oauth2_token`)
 * และบังคับโดเมน `@menatransport.co.th` ที่นั่นที่เดียว เราจึงไม่ตรวจซ้ำ
 *
 * รหัสตอบกลับที่ต้องแยกให้ออก — ทั้งสองอย่างนี้ผู้ใช้แก้เองไม่ได้ ต้องบอกให้ตรง:
 * | 401 | token ไม่ผ่านการตรวจของ Google (หมดอายุ / client id ไม่ตรง) |
 * | 403 | โดเมนไม่ใช่ของบริษัท **หรือ** ยังไม่มีบัญชีพนักงานคนนี้ในฐานข้อมูล |
 */
export function loginWithGoogle(idToken: string): Promise<GoogleLoginResponse> {
  return call<GoogleLoginResponse>("/auth/login/google", {
    method: "POST",
    body: JSON.stringify({ id_token: idToken }),
  });
}

/* ---------------------------------------------------------------- ผู้ใช้ */

export function listUsers(): Promise<UserDto[]> {
  return call<UserDto[]>("/users");
}

/** พนักงานคนเดียว — ต่างจาก `/users` ตรงที่ไม่ต้องดึงทั้งบริษัทมาค้นเอง */
export function getUser(employeeId: string): Promise<UserDto> {
  return call<UserDto>(`/users/${encodeURIComponent(employeeId)}`);
}

/**
 * แก้ข้อมูลพนักงาน — **ผู้เรียกต้องส่งค่าปัจจุบันมาให้ครบทุกช่อง** ไม่ใช่เฉพาะช่องที่แก้
 * (เหตุผลอยู่ที่ `UserUpdate` ใน `./types.ts`)
 */
export function updateUser(
  employeeId: string,
  patch: UserUpdate,
): Promise<UserDto> {
  return call<UserDto>(`/users/${encodeURIComponent(employeeId)}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}
