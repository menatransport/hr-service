/**
 * เอกสาร API ของ **Mass Recruitment** — แหล่งข้อมูลเดียวของหน้า `/recruitment/admin/settings/api-docs`
 *
 * ขอบเขต = การยืนยันตัวตน + เส้นที่หน้าใต้ `/recruitment` เรียกใช้จริง (`API_DOCS_SCOPE`)
 * เส้นของ `/desk` (คำร้อง NCAC · บันทึกเคส · แบบสอบถาม · พนักงาน) ไม่อยู่ในเอกสารนี้โดยตั้งใจ
 * ใช้ได้ทั้ง server และ client (ข้อมูลล้วน ไม่แตะฐานข้อมูล)
 *
 * ⚠️ **เพิ่ม/แก้/ลบ route ใต้ `app/api/**` เมื่อไหร่ ต้องแก้ไฟล์นี้ในคอมมิตเดียวกัน**
 * แล้วเพิ่มบรรทัดใน `API_CHANGELOG` + ขยับ `API_DOCS_UPDATED` · ตรวจว่าครบด้วย
 * `node check_api_docs.mjs` (เทียบไฟล์ route จริงกับรายการในนี้ ขาด/เกินจะแจ้ง)
 *
 * รูปแบบ path ใช้ `{param}` แทน `[param]` ของ Next — ให้ตรงกับที่ใช้เรียกจริง
 */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * - `public`  เปิดสาธารณะ ไม่ต้องล็อกอิน
 * - `login`   ต้องมี session (คุกกี้ `hrs.session`) — ไม่มีได้ 401
 * - `open-get` เส้นอ่านที่ `proxy.ts` ไม่ได้ตรวจ session (หน้าที่เรียกอยู่หลังด่านล็อกอินแล้ว)
 */
export type ApiAccess = "public" | "login" | "open-get";

export interface ApiParam {
  name: string;
  in: "path" | "query" | "body" | "form";
  type: string;
  required?: boolean;
  desc: string;
}

export interface ApiEndpoint {
  method: HttpMethod;
  path: string;
  summary: string;
  description?: string;
  access: ApiAccess;
  params?: ApiParam[];
  /** รูปผลลัพธ์เมื่อสำเร็จ (200) — เขียนแบบย่อ */
  response?: string;
  /** สถานะผิดพลาดที่เฉพาะกับเส้นนี้ (นอกจาก 401/500 ที่มีทุกเส้น) */
  errors?: { status: number; when: string }[];
}

export interface ApiGroup {
  id: string;
  title: string;
  description: string;
  endpoints: ApiEndpoint[];
}

/** พาธที่อยู่ในขอบเขตเอกสาร — `check_api_docs.mjs` อ่านรายการนี้ไปเทียบกับ route จริง */
export const API_DOCS_SCOPE = ["/api/auth/", "/api/recruitment/", "/api/drivers/", "/api/uploads"];

export const API_DOCS_VERSION = "4.0.0";
export const API_DOCS_UPDATED = "2026-10-01";

/** ใหม่สุดอยู่บน · เวอร์ชัน: ต่อท้ายเส้นใหม่/ฟิลด์ใหม่ = minor · เปลี่ยนรูปแบบที่ของเดิมพัง = major */
export const API_CHANGELOG: { date: string; version: string; changes: string[] }[] = [
  {
    date: "2026-10-01",
    version: "4.0.0",
    changes: [
      "ไฟล์ของ Mass Recruitment ย้ายขึ้น **S3 แบบ private** ใต้ `mass-image/` (เลิกเก็บไฟล์ใน MongoDB) · ลิงก์ที่คืน/เก็บเป็น `/api/media/{key}` ซึ่งตรวจสิทธิ์แล้วเด้ง 302 ไปลิงก์ presigned อายุ 10 นาที",
      "เพิ่ม `POST /api/recruitment/public/uploads` (ผู้สมัครอัปไฟล์ร่าง ต้องส่ง `draftId` + `slot`) และ `POST /api/recruitment/applications/{id}/files` (ฝ่ายบุคคลอัปแทนผู้สมัคร)",
      "`POST /api/uploads` **ต้องล็อกอินแล้ว** (เหลือไว้แนบรูปคำร้องฝั่ง desk) — ฟอร์มสมัครงานย้ายไป `public/uploads`",
      "`PATCH /api/recruitment/applications/{id}` — `files` รับเฉพาะลิงก์ในโฟลเดอร์ของใบนั้น · ไฟล์ที่ถูกแทน/ถอดถูกลบจาก S3",
      "`GET /api/drivers/{drivercode}/documents/{fileId}` ตอบ 302 ไปลิงก์ presigned แทนการส่งไฟล์ · `DriverDocument` มีฟิลด์ `key`",
      "เพิ่มเอกสารของ `/api/recruitment/doc-slots` (มีอยู่แล้วแต่ตกหล่นจากหน้านี้)",
    ],
  },
  {
    date: "2026-10-01",
    version: "3.0.0",
    changes: [
      "`POST /api/drivers/{drivercode}/documents` — **รับเฉพาะรูปภาพ** JPG · PNG · WebP (เลิกรับ PDF / Word → 400) · ไฟล์ที่แนบไว้ก่อนหน้ายังเปิด/ลบได้ตามเดิม",
    ],
  },
  {
    date: "2026-09-29",
    version: "2.5.0",
    changes: [
      "เพิ่ม `POST /api/recruitment/import` — นำเข้าใบสมัครจากไฟล์ Excel ของ Google Form (ตรวจไฟล์ `commit=false` / นำเข้าจริง `commit=true`) คืน `ImportReport`",
      "สถานะใบสมัครเพิ่ม `working` (ปฏิบัติงาน) ต่อจาก `training` · `PATCH /api/recruitment/requisitions/{id}` ผูกใบ `working` แล้วคำขอเป็น `filled` เหมือน `training`",
    ],
  },
  {
    date: "2026-09-29",
    version: "2.4.0",
    changes: [
      "`POST …/hr-documents/prints` — **เขียนทับ ฉบับละแถว** (upsert ตาม `applicationId` + `docId`) ไม่เก็บต่อท้ายทุกครั้งแล้ว · `GET …/hr-documents` คืน `prints` เป็นการพิมพ์ล่าสุดของแต่ละฉบับ (มากสุด 3 แถว)",
    ],
  },
  {
    date: "2026-09-29",
    version: "2.3.0",
    changes: [
      "เพิ่มกลุ่ม “ทำเอกสาร” — บันทึกค่าที่กรอกในสัญญาจ้าง/สัญญาค้ำ/ยินยอมคืนเงินค้ำลงฐาน ต่อใบสมัครหนึ่งเอกสาร กันบันทึกทับกันด้วย `revision` (409) พร้อมเก็บประวัติทุกครั้งที่สั่งพิมพ์แยกต่างหาก",
    ],
  },
  {
    date: "2026-09-29",
    version: "2.2.0",
    changes: [
      "`PATCH /api/recruitment/applications/{id}` — รับ `rating` (Driver Rating: `questionId` → คำตอบใน master · `null` = ลบ) · `Application` มีฟิลด์ `rating: { answers, by, at }`",
      "`GET /api/recruitment/applications` — `ApplicationSummary` มีฟิลด์ `rating: { average, level, scored, count, total }` (คิดจากคำตอบในฟอร์ม + คะแนนที่ให้เอง)",
    ],
  },
  {
    date: "2026-09-29",
    version: "2.1.0",
    changes: [
      "`PATCH /api/recruitment/requisitions/{id}` + `applicationId` — ผูกใบสมัครได้ทุกสถานะยกเว้น `cancelled` (เดิมเฉพาะ `interview_passed` / `training`) · คำขอเป็น `matched` ทันที (`training` = `filled`)",
    ],
  },
  {
    date: "2026-09-29",
    version: "2.0.0",
    changes: [
      "`PATCH /api/recruitment/applications/{id}` — รับ `blacklist` (boolean) · `Application` / `ApplicationSummary` มีฟิลด์ `blacklist` เพิ่ม",
      "`PATCH /api/recruitment/applications/{id}` — `exitReason` รับ `\"other\"` คู่กับ `exitReasonNote` (บังคับ ≤ 200 ตัวอักษร) · ฟิลด์ `exitReasonNote` เพิ่มในผลลัพธ์",
      "`POST /api/recruitment/requisitions` — ถอด `replaceReason` ออก (ส่งมาก็ไม่อ่าน) · `hireType = \"replace\"` บังคับแค่ `replaceDrivercode` · ใบใหม่ได้ `replace.reason` / `replace.reasonLabel` เป็นค่าว่าง",
    ],
  },
  {
    date: "2026-09-23",
    version: "1.1.0",
    changes: [
      "เพิ่ม `GET /api/drivers/{drivercode}` — ประวัติ พจส. หนึ่งคนในรูปมาตรฐาน (ค่าว่างเป็น `null`, จัดกลุ่มตามเรื่อง) · พ้นสภาพแล้วไม่ส่งข้อมูลส่วนบุคคล (`personalHidden`)",
      "เพิ่ม `GET /api/drivers/{drivercode}/work?from=&to=` — สถานะรายวัน (`days`) และวันทำงานรายเดือน (`months`) แยกจากเส้นประวัติ",
    ],
  },
  {
    date: "2026-09-23",
    version: "1.0.0",
    changes: [
      "เผยแพร่เอกสาร API ฉบับแรก — การยืนยันตัวตนและทุกเส้นที่ Mass Recruitment ใช้",
      "เพิ่มกลุ่ม Reason Code Master — `/api/recruitment/resign-reasons` และเส้นหมวด `…/categories`",
      "`PUT /api/drivers/{drivercode}/status` — `reasonCode` เป็นรหัส master (เช่น `P4`) และรับ `exitType` เพิ่ม",
      "`POST /api/recruitment/requisitions` — `replaceReason` เป็นรหัส master · `replaceReasonNote` ไม่บังคับ",
    ],
  },
];

const P = (name: string, desc: string, type = "string"): ApiParam => ({
  name,
  in: "path",
  type,
  required: true,
  desc,
});

export const API_GROUPS: ApiGroup[] = [
  /* ------------------------------------------------------------------ auth */
  {
    id: "auth",
    title: "การยืนยันตัวตน",
    description:
      "ล็อกอินด้วย Google (โดเมน menatransport.co.th) แล้วส่งต่อให้ NCAC ออกสิทธิ์ ระบบเก็บ session เป็นคุกกี้ `hrs.session` ที่ลงลายเซ็น HMAC-SHA256 อายุ 8 ชั่วโมง",
    endpoints: [
      {
        method: "GET",
        path: "/api/auth/google",
        summary: "เริ่มล็อกอินด้วย Google",
        description: "สุ่มค่า `state` เก็บในคุกกี้เพื่อกัน CSRF แล้ว redirect (302) ไปหน้ายินยอมของ Google",
        access: "public",
        params: [{ name: "next", in: "query", type: "string", desc: "พาธภายในที่จะกลับไปหลังล็อกอิน" }],
        response: "302 → accounts.google.com",
      },
      {
        method: "GET",
        path: "/api/auth/callback/google",
        summary: "รับผลล็อกอินจาก Google",
        description:
          "ตรวจ `state` → แลก `code` เป็น `id_token` → ส่งให้ NCAC ตรวจ → ออกคุกกี้ session → เข้า `/desk` · ล้มเหลวทุกกรณีจะกลับหน้าล็อกอินพร้อมเหตุผล · **ห้ามย้ายพาธนี้** เพราะผูกกับ redirect URI ที่ลงทะเบียนไว้",
        access: "public",
        params: [
          { name: "code", in: "query", type: "string", required: true, desc: "รหัสจาก Google" },
          { name: "state", in: "query", type: "string", required: true, desc: "ต้องตรงกับคุกกี้ที่ออกไว้" },
        ],
        response: "302 → /desk?welcome=1",
      },
      {
        method: "POST",
        path: "/api/auth/logout",
        summary: "ออกจากระบบ",
        description: "ลบคุกกี้ session · ใช้ POST เพื่อไม่ให้ prefetch ของลิงก์ทำให้หลุดจากระบบเอง",
        access: "public",
        response: "{ ok: true }",
      },
    ],
  },

  /* ---------------------------------------------------------------- drivers */
  {
    id: "drivers",
    title: "ทะเบียนประวัติ พจส.",
    description:
      "เขียนลง `hr_service.master_driver` / `trainee_daily` เท่านั้น — **ไม่แตะ `Boom_ETL`** ซึ่งเป็นกระจกเงาของ ETL",
    endpoints: [
      {
        method: "GET",
        path: "/api/drivers/{drivercode}",
        summary: "ประวัติ พจส. หนึ่งคน",
        description:
          "ข้อมูลชุดเดียวกับหน้าทะเบียนรายคน ในรูปมาตรฐาน: ค่าที่ไม่มีเป็น `null` · วันที่ `YYYY-MM-DD` · จัดกลุ่มตามเรื่อง · สถานะรายวัน/รายเดือนแยกไปที่ `…/work` · ถ้าพ้นสภาพแล้ว `contact`, `license`, `idCard` เป็น `null` และ `personalHidden: true`",
        access: "login",
        params: [P("drivercode", "รหัส พจส.")],
        response:
          "{ drivercode, name, photoUrl, status: \"active\"|\"resigned\", personalHidden, employment: { ownerType, branch, site, startDate, tenureMonths }, contact: { phone }, license: { expiryDate, daysLeft }, idCard: { expiryDate, daysLeft }, vehicle: { code, plateNo, type, brand, model, customer, plant }, resignation: { date, reasonCode, reasonLabel, category, exitType, note, recordedAt, recordedBy }, work: { latestStatus, latestStatusLabel, latestDate }, documents: [{ fileId, docType, docTypeLabel, name, contentType, size, uploadedAt, url }] }",
        errors: [{ status: 404, when: "ไม่พบรหัส พจส. ในทะเบียน" }],
      },
      {
        method: "GET",
        path: "/api/drivers/{drivercode}/work",
        summary: "สถานะการทำงานรายวันและรายเดือน",
        description:
          "รวม ATMS (หลัก) กับที่ฝ่ายบุคคลกรอกเอง (ใช้เมื่อ ATMS ไม่มีวันนั้น) — ทุกแถวบอก `source` · ไม่ส่งช่วง = ตั้งแต่วันที่ 1 ของเดือนเดียวกันปีก่อนถึงวันนี้ · ยาวสุด 3 ปี · `workDays` นับเฉพาะรหัสขึ้นต้นด้วย A",
        access: "login",
        params: [
          P("drivercode", "รหัส พจส."),
          { name: "from", in: "query", type: "YYYY-MM-DD", desc: "วันเริ่ม" },
          { name: "to", in: "query", type: "YYYY-MM-DD", desc: "วันสิ้นสุด (ไม่ส่ง = วันนี้)" },
        ],
        response:
          "{ drivercode, range: { from, to }, latest: { status, label, date }, days: [{ date, status, label, source: \"atms\"|\"hr\", note }], months: [{ month: \"YYYY-MM\", workDays }] }",
        errors: [
          { status: 400, when: "from/to ผิดรูปแบบ, from อยู่หลัง to หรือช่วงเกิน 3 ปี" },
          { status: 404, when: "ไม่พบรหัส พจส. ในทะเบียน" },
        ],
      },
      {
        method: "PUT",
        path: "/api/drivers/{drivercode}/status",
        summary: "บันทึกสถานะการจ้าง / การพ้นสภาพ",
        description:
          "`resigned` ต้องมีวันที่และรหัสเหตุผลจาก Reason Code Master ที่เปิดใช้อยู่ · `active` = ล้างข้อมูลพ้นสภาพ (ใช้เมื่อบันทึกผิด)",
        access: "login",
        params: [
          P("drivercode", "รหัส พจส."),
          { name: "status", in: "body", type: '"active" | "resigned"', required: true, desc: "สถานะการจ้าง" },
          { name: "resignDate", in: "body", type: "YYYY-MM-DD", desc: "วันที่พ้นสภาพ (บังคับเมื่อ resigned · ห้ามเป็นวันในอนาคต)" },
          { name: "reasonCode", in: "body", type: "string", desc: "รหัสเหตุผล เช่น `P4` (บังคับเมื่อ resigned)" },
          { name: "exitType", in: "body", type: '"vol" | "inv" | "disap"', desc: "ไม่ส่ง = ใช้ค่าตั้งต้นของรหัส" },
          { name: "note", in: "body", type: "string ≤ 500", desc: "หมายเหตุ" },
        ],
        response: "{ active, statusOverride, resignation }",
        errors: [
          { status: 400, when: "ข้อมูลไม่ครบ รหัสเหตุผลไม่มี/ปิดใช้ หรือวันที่ในอนาคต" },
          { status: 404, when: "ไม่พบรหัส พจส." },
        ],
      },
      {
        method: "PUT",
        path: "/api/drivers/{drivercode}/daily",
        summary: "บันทึกสถานะรายวัน (ฝึกงาน)",
        access: "login",
        params: [
          P("drivercode", "รหัส พจส."),
          { name: "dateISO", in: "body", type: "YYYY-MM-DD", required: true, desc: "วันที่" },
          { name: "code", in: "body", type: "string", required: true, desc: "ตัวย่อสถานะ · ค่าว่าง = ลบบันทึกวันนั้น" },
          { name: "note", in: "body", type: "string", desc: "หมายเหตุ" },
        ],
        response: "{ dateISO, entry }",
      },
      {
        method: "PUT",
        path: "/api/drivers/{drivercode}/id-card-expiry",
        summary: "บันทึกวันหมดอายุบัตรประชาชน",
        access: "login",
        params: [
          P("drivercode", "รหัส พจส."),
          { name: "dateISO", in: "body", type: "YYYY-MM-DD | \"\"", required: true, desc: "ค่าว่าง = ลบ" },
        ],
        response: "{ idCardExpiryISO, idCardDaysLeft }",
      },
      {
        method: "PUT",
        path: "/api/drivers/{drivercode}/photo",
        summary: "ตั้งรูปประจำตัว พจส.",
        description: "อัปขึ้น S3 (private) ที่ `mass-image/drivers/{drivercode}/avatar/` บันทึกลิงก์ `/api/media/…` แล้วอ่านกลับมาตรวจ · รูปเดิมถูกลบ · พ้นสภาพครบ 1 เดือนรูปถูกลบอัตโนมัติ",
        access: "login",
        params: [P("drivercode", "รหัส พจส."), { name: "file", in: "form", type: "File (JPG/PNG)", required: true, desc: "รูปที่ครอปแล้ว" }],
        response: "{ photoUrl }",
        errors: [
          { status: 400, when: "ไม่มีไฟล์ ไม่ใช่ JPG/PNG หรือใหญ่เกินกำหนด" },
          { status: 502, when: "อัปรูปสำเร็จแต่บันทึกลงทะเบียนไม่ติด (คืน `url` มาด้วย)" },
        ],
      },
      {
        method: "POST",
        path: "/api/drivers/{drivercode}/documents",
        summary: "แนบเอกสารเข้าแฟ้มประวัติ",
        description: "เก็บบน S3 แบบ private ที่ `mass-image/drivers/{drivercode}/documents/{docType}/` · รับเฉพาะรูปภาพ ไม่เกิน 10 MB · พ้นสภาพครบ 1 เดือนถูกลบอัตโนมัติ",
        access: "login",
        params: [
          P("drivercode", "รหัส พจส."),
          { name: "file", in: "form", type: "File", required: true, desc: "รูปเอกสาร JPG · PNG · WebP (≤10 MB)" },
          { name: "docType", in: "form", type: "string", required: true, desc: "รหัสใน `DRIVER_DOC_TYPES`" },
          { name: "note", in: "form", type: "string", desc: "หมายเหตุ" },
        ],
        response: "{ documents: DriverDocument[] } (ทั้งแฟ้ม)",
      },
      {
        method: "GET",
        path: "/api/drivers/{drivercode}/documents/{fileId}",
        summary: "เปิดเอกสาร",
        description: "ตรวจซ้ำว่าไฟล์อยู่ในแฟ้มของรหัสนั้นจริง แล้วเด้งไปลิงก์ presigned ของ S3 (อายุ 10 นาที)",
        access: "login",
        params: [P("drivercode", "รหัส พจส."), P("fileId", "รหัสไฟล์")],
        response: "302 → ลิงก์ presigned (Cache-Control: private, max-age=300)",
        errors: [{ status: 404, when: "ไฟล์ไม่อยู่ในแฟ้มของรหัสนี้" }],
      },
      {
        method: "DELETE",
        path: "/api/drivers/{drivercode}/documents/{fileId}",
        summary: "ลบเอกสารออกจากแฟ้ม",
        access: "login",
        params: [P("drivercode", "รหัส พจส."), P("fileId", "รหัสไฟล์")],
        response: "{ documents: DriverDocument[] }",
      },
    ],
  },

  /* ---------------------------------------------------------- resign master */
  {
    id: "resign-reasons",
    title: "Reason Code Master (เหตุผลการลาออก)",
    description:
      "หมวดและรหัสสาเหตุการลาออกตามทะเบียนของทีม OPS ใช้ร่วมกันโดยทะเบียน พจส. และใบขอสรรหา · `code` และ `prefix` แก้ไม่ได้หลังสร้าง",
    endpoints: [
      {
        method: "GET",
        path: "/api/recruitment/resign-reasons",
        summary: "อ่าน master ทั้งชุด",
        description: "รวมรหัสที่ปิดใช้ — ฝั่งผู้เรียกกรองเองตาม `active`",
        access: "open-get",
        response: "{ categories: ResignCategory[], reasons: ResignReason[] }",
      },
      {
        method: "POST",
        path: "/api/recruitment/resign-reasons",
        summary: "เพิ่มรหัส",
        access: "login",
        params: [
          { name: "categoryId", in: "body", type: "string", required: true, desc: "หมวดใหญ่" },
          { name: "code", in: "body", type: "string", desc: "เช่น `P8` · ไม่ส่ง = เลขถัดไปของหมวด" },
          { name: "label", in: "body", type: "string ≤ 120", required: true, desc: "หมวดย่อย (เหตุผล)" },
          { name: "description", in: "body", type: "string ≤ 300", desc: "ขยายความ" },
          { name: "exitType", in: "body", type: '"vol" | "inv" | "disap"', desc: "ไม่ส่ง = ค่าตั้งต้นของหมวด" },
        ],
        response: "ResignReason",
        errors: [{ status: 400, when: "รหัสซ้ำ หรืออักษรนำไม่ตรงหมวด" }],
      },
      {
        method: "PATCH",
        path: "/api/recruitment/resign-reasons/{id}",
        summary: "แก้ไขรหัส / เปิด-ปิดใช้",
        access: "login",
        params: [
          P("id", "รหัสเอกสาร"),
          { name: "label / description / exitType", in: "body", type: "—", desc: "ส่งเฉพาะช่องที่ต้องการแก้" },
          { name: "active", in: "body", type: "boolean", desc: "`false` = ซ่อนจากตัวเลือก" },
          { name: "categoryId", in: "body", type: "string", desc: "ย้ายหมวดได้เฉพาะหมวดที่อักษรนำตรงกัน" },
        ],
        response: "ResignReason",
      },
      {
        method: "DELETE",
        path: "/api/recruitment/resign-reasons/{id}",
        summary: "ลบรหัส",
        description: "ระเบียนเดิมที่เลือกรหัสนี้ยังอ่านได้ เพราะเก็บสำเนาป้ายไว้",
        access: "login",
        params: [P("id", "รหัสเอกสาร")],
        response: "{ deleted: true }",
      },
      {
        method: "POST",
        path: "/api/recruitment/resign-reasons/categories",
        summary: "เพิ่มหมวดใหญ่",
        access: "login",
        params: [
          { name: "prefix", in: "body", type: "A–Z 1–3 ตัว", required: true, desc: "อักษรนำรหัส" },
          { name: "label", in: "body", type: "string", required: true, desc: "ชื่อหมวด" },
          { name: "exitType", in: "body", type: '"vol" | "inv" | "disap"', required: true, desc: "ประเภทการออกตั้งต้น" },
        ],
        response: "ResignCategory",
      },
      {
        method: "PATCH",
        path: "/api/recruitment/resign-reasons/categories/{id}",
        summary: "แก้ไขหมวด",
        access: "login",
        params: [P("id", "รหัสหมวด"), { name: "label / exitType", in: "body", type: "—", desc: "ส่งเฉพาะช่องที่แก้" }],
        response: "ResignCategory",
      },
      {
        method: "DELETE",
        path: "/api/recruitment/resign-reasons/categories/{id}",
        summary: "ลบหมวด",
        access: "login",
        params: [P("id", "รหัสหมวด")],
        response: "{ deleted: true }",
        errors: [{ status: 400, when: "หมวดยังมีรหัสอยู่" }],
      },
    ],
  },

  /* ------------------------------------------------------------ recruitment */
  {
    id: "recruitment",
    title: "สรรหา — ใบขอสรรหา ผู้สมัคร และคลังคำถาม",
    description: "ข้อมูลใน `hr_service` (`recruitment_requests`, `recruitment_regist_answer`, `recruitment_regist_question`)",
    endpoints: [
      {
        method: "GET",
        path: "/api/recruitment/requisitions",
        summary: "รายการใบขอสรรหา",
        access: "login",
        response: "Requisition[] (สูงสุด 500 ใบล่าสุด)",
      },
      {
        method: "POST",
        path: "/api/recruitment/requisitions",
        summary: "แจ้งขอสรรหา",
        description: "`headcount > 1` สร้างใบแยกหนึ่งใบต่อหนึ่งอัตรา",
        access: "login",
        params: [
          { name: "requestedOn", in: "body", type: "YYYY-MM-DD", required: true, desc: "วันที่แจ้ง" },
          { name: "position / positionOther", in: "body", type: "string", required: true, desc: "ตำแหน่ง" },
          { name: "customer / customerOther / plant", in: "body", type: "string", required: true, desc: "ลูกค้า / แพล้นท์" },
          { name: "headcount", in: "body", type: "number", required: true, desc: "จำนวนอัตรา" },
          { name: "hireType", in: "body", type: '"replace" | "new_rate"', required: true, desc: "แทนคนเดิม / อัตราใหม่" },
          { name: "replaceDrivercode", in: "body", type: "string", desc: "พจส. ที่จะแทน (บังคับเมื่อ replace)" },
          { name: "replaceReasonNote", in: "body", type: "string", desc: "รายละเอียดเพิ่มเติม" },
          { name: "vehicleCode / trainerDrivercode / note", in: "body", type: "string", desc: "รถ / ครูฝึก / หมายเหตุ" },
        ],
        response: "Requisition[]",
      },
      {
        method: "PATCH",
        path: "/api/recruitment/requisitions/{id}",
        summary: "แก้ไขใบขอสรรหา",
        description: "ไม่มี DELETE โดยเจตนา — ใบที่ไม่ใช้แล้วให้ยกเลิกพร้อมเหตุผล",
        access: "login",
        params: [
          P("id", "รหัสใบ"),
          { name: "trainerDrivercode / vehicleCode / applicationId", in: "body", type: "string | null", desc: "`null` = ถอดออก" },
          { name: "status", in: "body", type: '"cancelled" | "open"', desc: "ยกเลิก / เปิดรับอีกครั้ง" },
          { name: "cancelReason", in: "body", type: "string", desc: "บังคับเมื่อยกเลิก" },
          { name: "drivercode / note", in: "body", type: "string", desc: "รหัส พจส. ที่ได้ / หมายเหตุ" },
        ],
        response: "Requisition",
        errors: [
          {
            status: 400,
            when: "ผูก `applicationId` ที่ใบสมัครถูกยกเลิกแล้ว · ใบสมัครผูกกับคำขออื่นอยู่แล้ว · คำขอถูกยกเลิก",
          },
        ],
      },
      {
        method: "GET",
        path: "/api/recruitment/applications",
        summary: "รายการใบสมัคร (แบบย่อ)",
        access: "login",
        response: "ApplicationSummary[]",
      },
      {
        method: "POST",
        path: "/api/recruitment/import",
        summary: "นำเข้าใบสมัครจาก Google Form",
        description:
          "อัปไฟล์ .xlsx ที่ export จากชีต “การตอบแบบฟอร์ม 1” · เทียบกับทะเบียน พจส. ด้วยชื่อ-นามสกุลหรือเบอร์ — ฝึกงาน = `training` · ทำงานอยู่ = `working` · พ้นสภาพ = ข้าม · ไม่พบ = `pending_contact` เฉพาะใบที่ส่งภายใน `recentDays` วัน · แถวที่นำเข้าแล้ว (`importKey`) ถูกข้ามเสมอ อัปไฟล์ทั้งชีตซ้ำได้ · ทุกใบของรอบเดียวกันมี `importBatch` เดียวกันไว้ลบย้อนหลัง",
        access: "login",
        params: [
          { name: "file", in: "form", type: "File (.xlsx ≤ 10 MB)", required: true, desc: "ไฟล์ Excel จาก Google Sheets" },
          { name: "recentDays", in: "form", type: "number (1–60)", desc: "ใบที่ไม่พบในทะเบียนนับเป็นใบใหม่ย้อนหลังกี่วัน · ค่าเริ่มต้น 5" },
          { name: "commit", in: "form", type: '"true" | "false"', desc: "`true` = เขียนลงฐาน · อย่างอื่น = ตรวจไฟล์อย่างเดียว" },
        ],
        response:
          "ImportReport { committed, batch, sheet, recentDays, totalRows, counts: { training, working, pending_contact }, skipped: { already_imported, resigned, not_found_old, duplicate, invalid }, rows: ImportRow[], answers: ImportAnswerStat[], warnings: string[] }",
        errors: [{ status: 400, when: "ไม่มีไฟล์ ไม่ใช่ .xlsx ใหญ่เกิน หรือไม่พบชีตที่มีคอลัมน์ “ประทับเวลา”" }],
      },
      {
        method: "GET",
        path: "/api/recruitment/applications/{id}",
        summary: "ใบสมัครเต็มพร้อมคำตอบ",
        access: "login",
        params: [P("id", "รหัสใบสมัคร")],
        response: "Application | null",
      },
      {
        method: "POST",
        path: "/api/recruitment/applications/{id}/files",
        summary: "อัปรูปเอกสารแทนผู้สมัคร",
        description:
          "เก็บที่ `mass-image/applications/{ref}/{slot}/` (S3 private) · อัปอย่างเดียว — ส่ง `url` ต่อใน `PATCH …/{id}` ช่อง `files` เพื่อผูกเข้าใบ (ไฟล์เดิมของช่องถูกลบตอนบันทึก)",
        access: "login",
        params: [
          P("id", "รหัสใบสมัคร"),
          { name: "file", in: "form", type: "File (JPG/PNG/WebP)", required: true, desc: "รูปเอกสาร ≤10 MB" },
          { name: "slot", in: "form", type: "string", required: true, desc: "รหัสช่องเอกสาร" },
        ],
        response: "{ url } — `/api/media/mass-image/applications/{ref}/…`",
        errors: [
          { status: 400, when: "ไม่ใช่รูป / ใหญ่เกิน / ช่องไม่ถูกต้อง / ใบถูกลบข้อมูลแล้ว" },
          { status: 404, when: "ไม่พบใบสมัคร" },
        ],
      },
      {
        method: "PATCH",
        path: "/api/recruitment/applications/{id}",
        summary: "จัดการผู้สมัคร",
        description:
          "สถานะ ผู้ติดต่อกลับ แผน/ผลสัมภาษณ์ เหตุผลออก Blacklist และบันทึกภายใน ในคำขอเดียว · `exitReason: \"other\"` ต้องส่ง `exitReasonNote` มาด้วย · `blacklist` (boolean) มีผลเฉพาะใบที่ `cancelled` — สถานะอื่นถูกล้างเป็น `false` · ขึ้น/ถอดลงไทม์ไลน์ · `rating` = คะแนน Driver Rating ที่ฝ่ายบุคคลเลือก (เซิร์ฟเวอร์คิดคะแนนจาก master `driver-rating.json` เอง ไม่รับตัวเลข) ลงไทม์ไลน์ว่าประเมินกี่ข้อ",
        access: "login",
        params: [
          P("id", "รหัสใบสมัคร"),
          {
            name: "rating",
            in: "body",
            type: "Record<questionId, string | null>",
            desc: "ส่งเฉพาะข้อที่เปลี่ยน · ค่า = ข้อความคำตอบใน master · `null` = ลบคะแนนที่ให้เอง (กลับไปใช้คำตอบจากฟอร์ม)",
          },
        ],
        response: "Application",
        errors: [
          { status: 400, when: "`rating` อ้างข้อที่ไม่มีใน master หรือคำตอบไม่อยู่ในตัวเลือกของข้อนั้น" },
        ],
      },
      {
        method: "GET",
        path: "/api/recruitment/applications/{id}/hr-documents",
        summary: "อ่านค่าที่กรอกในหน้าทำเอกสาร",
        description:
          "ค่าล่าสุดของเอกสาร HR (สัญญาจ้าง/สัญญาค้ำ/ยินยอมคืนเงินค้ำ ใช้ช่องกรอกร่วมกัน) ที่เคยบันทึกไว้ (`null` = ยังไม่เคยบันทึก) พร้อมประวัติการสั่งพิมพ์ใหม่สุดก่อน สูงสุด 50 รายการ (ไม่มี `fill` ต่อรายการ — ขอทีละใบผ่านเส้นถัดไป)",
        access: "login",
        params: [P("id", "รหัสใบสมัคร")],
        response:
          "{ record: { id, applicationId, ref, fill, revision, createdAt, createdBy, updatedAt, updatedBy } | null, prints: { id, docId, revision, printedAt, printedBy }[] } — prints = การพิมพ์ล่าสุดฉบับละแถว ใหม่สุดก่อน",
        errors: [{ status: 404, when: "ไม่พบใบสมัครที่ระบุ" }],
      },
      {
        method: "PUT",
        path: "/api/recruitment/applications/{id}/hr-documents",
        summary: "บันทึกค่าที่กรอกในหน้าทำเอกสาร",
        description:
          "กันบันทึกทับกันด้วย `revision` (optimistic concurrency) — ส่งค่าที่จอถืออยู่มาเสมอ (`0` = ยังไม่เคยบันทึก บันทึกครั้งแรกได้ `revision: 1`) ไม่ตรงกับที่ฐานถืออยู่ = 409 ให้โหลดค่าล่าสุดก่อนแก้ต่อ",
        access: "login",
        params: [
          P("id", "รหัสใบสมัคร"),
          { name: "fill", in: "body", type: "DocFill", required: true, desc: "ค่าทุกช่องในกล่องกรอก — ช่องแปลกปลอมถูกทิ้ง ค่าที่ผิดรูปแบบกลายเป็นค่าว่าง" },
          { name: "revision", in: "body", type: "number", required: true, desc: "revision ที่จอถืออยู่ก่อนบันทึก" },
        ],
        response: "HrDocumentRecord",
        errors: [
          { status: 404, when: "ไม่พบใบสมัครที่ระบุ" },
          { status: 400, when: "ใบสมัครถูกลบตามคำขอของเจ้าของข้อมูลแล้ว — ทำเอกสารไม่ได้" },
          { status: 409, when: "มีคนบันทึกเอกสารนี้ไปก่อนแล้ว (revision ไม่ตรง)" },
        ],
      },
      {
        method: "POST",
        path: "/api/recruitment/applications/{id}/hr-documents/prints",
        summary: "บันทึกการพิมพ์ล่าสุดของฉบับนั้น",
        description:
          "ฉบับละแถว **เขียนทับครั้งก่อน** (เวลา ผู้พิมพ์ และสำเนาค่าบนกระดาษเป็นของครั้งล่าสุดเสมอ) ไม่แก้เอกสารหลัก",
        access: "login",
        params: [
          P("id", "รหัสใบสมัคร"),
          { name: "docId", in: "body", type: '"contract" | "deposit" | "refund"', required: true, desc: "ฉบับที่สั่งพิมพ์" },
          { name: "fill", in: "body", type: "DocFill", required: true, desc: "ค่าที่อยู่บนกระดาษตอนสั่งพิมพ์" },
        ],
        response: "{ id, docId, revision, printedAt, printedBy }",
        errors: [
          { status: 404, when: "ไม่พบใบสมัครที่ระบุ" },
          { status: 400, when: "ใบสมัครถูกลบตามคำขอของเจ้าของข้อมูลแล้ว หรือ `docId` ไม่ถูกต้อง" },
        ],
      },
      {
        method: "GET",
        path: "/api/recruitment/applications/{id}/hr-documents/prints/{printId}",
        summary: "การพิมพ์ล่าสุดของฉบับหนึ่งแบบเต็ม",
        description: "รวม `fill` ที่เป็นสำเนา ณ ตอนพิมพ์ครั้งล่าสุด — ต้องเป็นใบพิมพ์ของใบสมัคร `{id}` นี้จริง",
        access: "login",
        params: [P("id", "รหัสใบสมัคร"), P("printId", "รหัสใบพิมพ์")],
        response: "{ id, docId, revision, fill, printedAt, printedBy }",
        errors: [{ status: 404, when: "ไม่พบใบพิมพ์ที่ระบุ หรือไม่ใช่ของใบสมัครนี้" }],
      },
      {
        method: "GET",
        path: "/api/recruitment/questions",
        summary: "คลังคำถามทั้งหมด",
        access: "open-get",
        response: "Question[]",
      },
      {
        method: "POST",
        path: "/api/recruitment/questions",
        summary: "เพิ่มคำถาม",
        access: "login",
        response: "Question",
      },
      {
        method: "PATCH",
        path: "/api/recruitment/questions/{id}",
        summary: "แก้ไขคำถาม",
        description: "`key` แก้ไม่ได้หลังสร้าง (ถูกทิ้งถ้าส่งมา)",
        access: "login",
        params: [P("id", "รหัสคำถาม")],
        response: "Question",
      },
      {
        method: "DELETE",
        path: "/api/recruitment/questions/{id}",
        summary: "ลบคำถาม",
        access: "login",
        params: [P("id", "รหัสคำถาม")],
        response: "{ deleted: true }",
        errors: [{ status: 400, when: "เป็นคำถามหลัก หรือมีคำถามอื่นอ้างเงื่อนไขอยู่" }],
      },
      {
        method: "POST",
        path: "/api/recruitment/questions/reorder",
        summary: "จัดลำดับคำถาม",
        access: "login",
        params: [{ name: "ids", in: "body", type: "string[]", required: true, desc: "ลำดับใหม่ทั้งหมวด" }],
        response: "Question[]",
      },
      {
        method: "GET",
        path: "/api/recruitment/doc-slots",
        summary: "คลังช่องเอกสารแนบ (Section 4)",
        description: "ทุกช่องรวมที่ซ่อน เรียงตามลำดับในฟอร์ม",
        access: "login",
        response: "DocSlot[]",
      },
      {
        method: "POST",
        path: "/api/recruitment/doc-slots",
        summary: "เพิ่มช่องเอกสาร",
        description: "ต่อท้ายเสมอ",
        access: "login",
        params: [
          { name: "label", in: "body", type: "string", required: true, desc: "ชื่อเอกสาร (≤80)" },
          { name: "hint", in: "body", type: "string", desc: "คำอธิบาย (≤200)" },
          { name: "visible", in: "body", type: "boolean", desc: "แสดงในฟอร์มผู้สมัคร (ค่าตั้งต้น true)" },
          { name: "required", in: "body", type: "boolean", desc: "บังคับแนบ — ซ่อนอยู่ = ไม่บังคับเสมอ" },
        ],
        response: "DocSlot[] (ทั้งชุด)",
      },
      {
        method: "PATCH",
        path: "/api/recruitment/doc-slots/{id}",
        summary: "แก้ช่องเอกสาร",
        access: "login",
        params: [
          P("id", "รหัสช่อง"),
          { name: "label", in: "body", type: "string", required: true, desc: "ชื่อเอกสาร (≤80)" },
          { name: "hint", in: "body", type: "string", desc: "คำอธิบาย (≤200)" },
          { name: "visible", in: "body", type: "boolean", desc: "แสดงในฟอร์มผู้สมัคร (ค่าตั้งต้น true)" },
          { name: "required", in: "body", type: "boolean", desc: "บังคับแนบ — ซ่อนอยู่ = ไม่บังคับเสมอ" },
        ],
        response: "DocSlot[] (ทั้งชุด)",
      },
      {
        method: "DELETE",
        path: "/api/recruitment/doc-slots/{id}",
        summary: "ลบช่องเอกสาร",
        description: "ช่องหลักของระบบลบไม่ได้",
        access: "login",
        params: [P("id", "รหัสช่อง")],
        response: "DocSlot[] (ทั้งชุด)",
        errors: [{ status: 400, when: "ไม่พบช่อง / เป็นช่องหลักของระบบ" }],
      },
      {
        method: "POST",
        path: "/api/recruitment/doc-slots/reorder",
        summary: "จัดลำดับช่องเอกสาร",
        access: "login",
        params: [{ name: "ids", in: "body", type: "string[]", required: true, desc: "ลำดับใหม่ทั้งชุด" }],
        response: "DocSlot[]",
      },
    ],
  },

  /* ----------------------------------------------------------------- public */
  {
    id: "public",
    title: "สาธารณะ — ผู้สมัครงาน",
    description: "เส้นที่คนนอกใช้ได้โดยไม่ต้องล็อกอิน (ฟอร์มสมัครงาน) ด่านตรวจทั้งหมดอยู่ในชั้นข้อมูล",
    endpoints: [
      {
        method: "GET",
        path: "/api/recruitment/public/questions",
        summary: "ชุดคำถามที่เปิดใช้",
        access: "public",
        response: "Question[] (เฉพาะ active)",
      },
      {
        method: "POST",
        path: "/api/recruitment/public/applications",
        summary: "ส่งใบสมัคร",
        description: "ต้องยินยอมครบ · ตรวจคำตอบกับคลังคำถามปัจจุบัน · เบอร์เดิมส่งซ้ำใน 30 วันจะถูกปฏิเสธ",
        access: "public",
        response: "{ ref, createdAt }",
        errors: [{ status: 400, when: "คำตอบไม่ผ่าน / ความยินยอมไม่ครบ / ส่งซ้ำ" }],
      },
      {
        method: "POST",
        path: "/api/recruitment/public/status",
        summary: "ตรวจสถานะใบสมัครของตนเอง",
        description: "ใช้ POST เพื่อไม่ให้เบอร์โทรไปอยู่ใน query string",
        access: "public",
        params: [
          { name: "ref", in: "body", type: "string", required: true, desc: "เลขอ้างอิง" },
          { name: "phone", in: "body", type: "string", required: true, desc: "เบอร์ที่ใช้สมัคร" },
        ],
        response: "PublicStatus",
      },
      {
        method: "DELETE",
        path: "/api/recruitment/public/status",
        summary: "ยกเลิกใบสมัครและลบข้อมูลของตนเอง",
        access: "public",
        params: [
          { name: "ref", in: "body", type: "string", required: true, desc: "เลขอ้างอิง" },
          { name: "phone", in: "body", type: "string", required: true, desc: "เบอร์ที่ใช้สมัคร" },
        ],
        response: "PublicStatus",
      },
      {
        method: "POST",
        path: "/api/recruitment/public/uploads",
        summary: "ผู้สมัครอัปรูปเอกสาร (ไฟล์ร่าง)",
        description:
          "เก็บที่ `mass-image/applications/_drafts/{draftId}/{slot}/` (S3 private) · ย้ายเข้าโฟลเดอร์ใบสมัครตอนกดส่ง · ไม่กดส่ง = ลบเองใน 1 วัน · ลิงก์ร่างเปิดดูได้โดยไม่ล็อกอิน",
        access: "public",
        params: [
          { name: "file", in: "form", type: "File (JPG/PNG/WebP)", required: true, desc: "รูปเอกสาร ≤10 MB" },
          { name: "draftId", in: "form", type: "UUID", required: true, desc: "รหัสร่างที่ฟอร์มสุ่มไว้ตอนเริ่มกรอก" },
          { name: "slot", in: "form", type: "string", required: true, desc: "รหัสช่องเอกสารที่เปิดแสดงอยู่" },
        ],
        response: "{ url } — `/api/media/mass-image/applications/_drafts/…`",
        errors: [{ status: 400, when: "ไม่ใช่รูป / ใหญ่เกิน / draftId หรือ slot ไม่ถูกต้อง" }],
      },
      {
        method: "POST",
        path: "/api/uploads",
        summary: "อัปโหลดรูปแนบคำร้อง (desk)",
        description: "JPG/PNG เท่านั้น ได้ URL สาธารณะบน Spaces (presign API ของ mena-go) · **ต้องล็อกอิน** ตั้งแต่ 1 ต.ค. 2026 — ผู้สมัครใช้ `public/uploads` แทน",
        access: "login",
        params: [{ name: "file", in: "form", type: "File (JPG/PNG)", required: true, desc: "รูปภาพ" }],
        response: "{ url }",
      },
    ],
  },

];
