/**
 * รูปร่างข้อมูลดิบที่ NCAC API ส่งกลับมา (snake_case) — ยกมาจาก
 * `mena-next-lb/src/app/driver-complaint/types.ts` ของระบบเดิม
 *
 * **ห้ามใช้ type พวกนี้นอกโฟลเดอร์ `lib/ncac/`** — ทุกอย่างที่ออกจากชั้นนี้
 * ต้องถูกแปลงเป็น `HrCase` / `Approver` ใน `adapt.ts` ก่อนเสมอ
 * เพื่อให้ component ไม่ต้องรู้จักรูปร่างของ API
 */

export interface ComplaintReviewDto {
  id: number;
  complaint_id: number;
  level: number;
  reviewer_employee_id: string;
  /** PENDING | APPROVED | REJECTED */
  status: string;
  remark: string | null;
  reviewed_at: string | null;
  created_at: string;
}

/**
 * หนึ่งแถวของ `complaint_master` — “ประเภทเรื่อง” ของหน่วยงานหนึ่ง
 *
 * เดิมรายการนี้ hard-code อยู่ใน `lib/data.ts` แก้ทีต้อง deploy ใหม่
 * ย้ายมาอยู่ที่ NCAC แล้ว (`/complaint-masters`) แก้ผ่านหน้าจอได้เลย
 *
 * `icon` เป็น **ชื่อไอคอนของ lucide** (เช่น `"Wrench"`) ไม่ใช่ SVG —
 * ตัวแปลงชื่อเป็นคอมโพเนนต์อยู่ที่ `lib/complaint-icons.ts`
 */
export interface ComplaintMasterDto {
  id: number;
  department_id: number;
  name: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

/** payload ขาออกของ `POST /complaint-masters/` — ทุกช่องยกเว้น 2 ตัวแรกมีค่าเริ่มต้น */
export interface ComplaintMasterCreate {
  department_id: number;
  name: string;
  icon?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

/** payload ขาออกของ `PUT /complaint-masters/{id}` — ส่งเฉพาะช่องที่แก้ */
export type ComplaintMasterPatch = Partial<ComplaintMasterCreate>;

export interface ComplaintDto {
  id: number;
  tracking_no: string;
  driver_id: string;
  /** ชื่อ พจส. ที่ backend ส่งมาให้แล้ว — ไม่ต้องเทียบกับ `/users` อีก */
  driver_name?: string | null;
  subject: string;
  detail: string;
  complaint_details?: string | null;
  complaint_type: string | null;
  /** URL รูปที่ผู้แจ้งแนบมา (มีได้ไฟล์เดียว) */
  complaint_url: string | null;
  department_id: number | string | null;
  /**
   * **id ของ `complaint_master`** ไม่ใช่ข้อความ — คือ “ประเภทเรื่อง” ของคำร้อง
   * (เดิมคอลัมน์นี้เก็บชื่อประเภทเป็น text · แปลงเป็น id เมื่อ 13 ส.ค. 2026)
   */
  problem: number | null;
  /** ประเภทเรื่องแบบเต็มที่ backend join มาให้ — `null` เมื่อยังไม่จัดประเภท */
  problem_master?: ComplaintMasterDto | null;
  root_cause: string | null;
  damage_cost: number | null;
  solution: string | null;
  /** URL หลักฐานผลการดำเนินงานที่ PIC แนบ */
  solution_url: string | null;
  result: string | null;
  /** OPEN | ASSIGNED | PENDING_REVIEW | READY_TO_CLOSE | CLOSED */
  status: string;
  reviews?: ComplaintReviewDto[] | null;
  /** ประวัติการปิดเคส — รายการแรกคือคนที่กดปิด */
  audit?: ComplaintReviewDto[] | null;
  /**
   * ธงลบแบบ soft — **อ่านได้จริง** (payload ส่ง `is_deleted: false` มาทุกเคส)
   * แต่ `/openapi.json` ไม่ประกาศไว้ใน `ComplaintResponse` เหมือนกรณี `image_url`
   *
   * **เขียนยังไม่ได้** — `PUT` ด้วย `{"is_deleted": true}` ตอบ 200 แต่ค่าไม่เปลี่ยน
   * (ทดสอบกับ `DC2026080002` เมื่อ 8 ส.ค. 2026) ดู `deleteComplaint()` ใน `./client.ts`
   */
  is_deleted?: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * หนึ่งบรรทัดของ `GET /complaints/logs` — ประวัติว่าใครทำอะไรกับคำร้องไหน
 *
 * ต่างจาก `GET /complaints/` ตรงที่ **รวมคำร้องที่ถูกลบไปแล้วด้วย** (ทั้งหมด
 * ของหน้าประวัติคือให้เห็นว่ามีการลบเกิดขึ้น) — เช็ก `complaint_is_deleted`
 * ก่อนทำลิงก์ไปหน้าคำร้องเสมอ ไม่งั้นจะลิงก์ไปหน้าที่เปิดไม่ได้
 */
export interface ComplaintLogDto {
  id: number;
  /** CREATE | ASSIGNED | APPROVE | REJECT | RESUBMIT | CLOSE | DELETE */
  action: string;
  remark: string | null;
  created_at: string;
  tracking_no: string;
  subject: string;
  complaint_is_deleted: boolean;
  /**
   * `null` ได้เสมอ — NCAC เพิ่งเริ่มบันทึกผู้ทำเมื่อ 8 ส.ค. 2026 และบางเหตุการณ์
   * ไม่มีผู้ทำที่เป็นผู้ใช้ในระบบอยู่ดี (`CREATE` มาจากคนขับ · `ASSIGNED`/`RESUBMIT`
   * เกิดจาก `PUT` ที่ไม่ได้รับรหัสผู้ทำเข้ามา) **ห้ามเดาว่าเป็นใคร**
   */
  action_by_employee_id: string | null;
  action_by_name: string | null;
}

export interface UserDto {
  id: number;
  employee_id: string;
  firstname: string;
  lastname: string;
  email: string;
  department: string;
  position: string;
  position_level: string | null;
  site: string;

  /** ชื่อผู้ใช้ (ส่วนหน้าของอีเมล) — ยังไม่มีหน้าไหนใช้ */
  username?: string | null;

  /**
   * `Active` | `Inactive` — **ตัวพิมพ์ไม่คงที่** payload จริงมีทั้ง `Active` และ `active`
   * เทียบด้วย `toLowerCase()` เสมอ (ดู `toEmployee` ใน `adapt.ts`)
   */
  employee_status?: string | null;

  /** รหัสอ้างอิงภายในของ NCAC — ไม่ตรงกับ `DepartmentId` ของฝั่งคำร้อง อย่าเอามาปนกัน */
  department_id?: number | null;
  site_id?: number | null;
  position_id?: number | null;

  /**
   * รูปพนักงาน — มีจริงและใช้งานได้ (ยืนยันกับ API จริง 7 ส.ค. 2026: 144/196 คนมีค่า)
   *
   * ส่วนใหญ่เป็นรูปบัญชี Google (`lh3.googleusercontent.com`) ที่ได้ตอนล็อกอิน
   * ที่เหลือเป็น `null` แล้ว `Avatar` ตกไปใช้ตัวย่อชื่อแทน
   *
   * **`/openapi.json` ไม่ได้ประกาศฟิลด์นี้ไว้ใน `UserResponse`/`UserUpdate`** —
   * spec ตามของจริงไม่ทัน อย่าเชื่อ spec อย่างเดียว ให้ยิงดู payload จริงด้วย
   */
  image_url?: string | null;
}

/**
 * ผู้ใช้ที่ `POST /auth/login/google` ตอบกลับมา — **ไม่ใช่สคีมาเดียวกับ `UserResponse`**
 *
 * มาจาก `build_user_response()` ใน `routes/auth.py` ของ NCAC: มี `username`,
 * `position_level_id`, `last_login` เพิ่มเข้ามา แต่ **ไม่มี `email`** ถึงจะล็อกอิน
 * ด้วยอีเมลก็ตาม · `image_url` คือรูปบัญชี Google ที่ backend บันทึกให้ตอนล็อกอิน
 * ครั้งแรก (ครั้งถัดไปไม่ทับ เพื่อให้เปลี่ยนรูปเองผ่าน `PUT /users/{id}` ได้)
 */
export interface AuthUserDto {
  id?: number | null;
  username?: string | null;
  firstname?: string | null;
  lastname?: string | null;
  employee_id?: string | null;
  site?: string | null;
  site_id?: number | null;
  department?: string | null;
  department_id?: number | null;
  position?: string | null;
  position_level?: string | null;
  position_level_id?: number | null;
  image_url?: string | null;
  last_login?: string | null;
  employee_status?: string | null;
}

/** คำตอบของ `POST /auth/login/google` — `access_token` เป็น JWT HS256 อายุ 30 นาที */
export interface GoogleLoginResponse {
  message?: string;
  access_token: string;
  user: AuthUserDto;
}

/* ---------------------------------------------------------------- payload ขาออก */

export interface ComplaintPatch {
  department_id?: string | number;
  complaint_type?: string | null;
  /** ประเภทเรื่อง = id ของ `complaint_master` · `null` = ล้างประเภททิ้ง */
  problem?: number | null;
  root_cause?: string | null;
  /** รายละเอียดของสาเหตุ “อื่นๆ” — `ComplaintUpdate` ของ NCAC รับฟิลด์นี้อยู่แล้ว */
  complaint_details?: string | null;
  solution?: string | null;
  result?: string | null;
  damage_cost?: number | null;
}

/**
 * payload ของ `PUT /users/{employee_id}`
 *
 * `image_url` **บันทึกได้จริง** — ทดสอบกับบัญชี `test_id` แล้ว 7 ส.ค. 2026:
 * PUT แล้วอ่านกลับมาได้ค่าเดิมทั้งจาก `/users/{id}` และ `/users`
 * (`/openapi.json` ไม่ได้ประกาศฟิลด์นี้ไว้ — spec ตามของจริงไม่ทัน)
 *
 * ทุกฟิลด์ optional ในสคีมา แต่ route ของเราส่ง **ค่าปัจจุบันไปครบทุกช่อง** เสมอ
 * — ถ้า backend เขียนทับทั้งแถวโดยไม่ดูว่าส่งอะไรมาบ้าง ข้อมูลเดิมจะได้ไม่หาย
 */
export interface UserUpdate {
  username?: string | null;
  employee_id?: string | null;
  department_id?: number | null;
  site_id?: number | null;
  position_id?: number | null;
  email?: string | null;
  employee_status?: string | null;
  firstname?: string | null;
  lastname?: string | null;
  image_url?: string | null;
}

/** payload ของ `POST /complaints/` — `driver_id` / `subject` / `detail` บังคับ ที่เหลือ optional */
export interface ComplaintCreate {
  driver_id: string;
  subject: string;
  detail: string;
  complaint_type?: string | null;
  complaint_details?: string | null;
  complaint_url?: string | null;
}

/** สิ่งที่ `POST /complaints/` ตอบกลับ — เคสเต็มต้องดึงใหม่ผ่าน `getComplaint()` */
export interface ComplaintCreateResponse {
  id: number;
  tracking_no: string;
  status: string;
  created_at: string;
  driver_name?: string | null;
}

export type ReviewAction = "approve" | "reject";
