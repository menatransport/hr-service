// @ts-check
/**
 * ทะเบียนชื่อ MongoDB ของทั้งระบบ — **ชื่อ database / collection / GridFS bucket / ดัชนี อยู่ที่นี่ที่เดียว**
 *
 * เป็น `.mjs` + JSDoc ไม่ใช่ `.ts` เพราะต้อง import ได้ทั้งจากโค้ดแอป (TS, `allowJs`) และจาก
 * สคริปต์ `node *.mjs` ที่รากโปรเจกต์ซึ่งไม่ผ่าน bundler — ชื่อเดียวกันจะได้ไม่แตกเป็นสองชุด
 *
 * - แอปเข้าถึงผ่าน `lib/db/index.ts` เท่านั้น (`hrCol` / `etlCol` / `hrBucket`) — ห้ามพิมพ์ชื่อคอลเลกชันเอง
 *   (`node check_db_names.mjs` จับให้)
 * - **ชื่อคอลเลกชัน ชื่อดัชนี และคีย์ดัชนี ต้องตรงกับของจริงบนฐานเป๊ะ** — `createIndexes` ด้วยคีย์ที่มีอยู่แล้ว
 *   แต่ชื่อต่างกันจะ error บน production · เปลี่ยนชื่อ = งาน migration แยก ไม่ใช่แก้ที่นี่เฉย ๆ
 *   (`master_complainte` สะกดผิดมาตั้งแต่แรก — คงไว้จนกว่าจะมีรอบ rename จริง)
 * - เช็กของจริงเทียบกับที่ประกาศไว้: `node ensure_db.mjs` (อ่านอย่างเดียว)
 */

/**
 * `hr` คือค่าตั้งต้น — ของจริงอ่านจาก `MONGO_DB` ก่อนเสมอ (`process.env.MONGO_DB || DB.hr`)
 * `etl` = กระจกเงาของ ETL ภายนอก **อ่านอย่างเดียวเด็ดขาด** ETL sync ทับเองเป็นรอบ ของที่เขียนเพิ่มจะหาย
 */
export const DB = /** @type {const} */ ({
  hr: "hr_service",
  etl: "Boom_ETL",
});

/**
 * คอลเลกชันใน `hr_service` — key คือชื่อที่โค้ดใช้ · `name` คือชื่อจริงบนฐาน
 * `external: true` = ระบบอื่นเป็นเจ้าของ เราอ่านอย่างเดียว ไม่สร้าง/ไม่แตะดัชนีหรือ validator ของมัน
 */
export const HR = /** @type {const} */ ({
  /** master data ของคำร้อง (ประเภทเรื่อง + สาเหตุ) — สะกดผิดมาแต่แรก ห้ามแก้ชื่อที่นี่ */
  complaintMaster: { name: "master_complainte" },
  /** คำตอบแบบสอบถามปีใหม่ — ncacdb (FastAPI) เป็นคนเขียน เราอ่านอย่างเดียว */
  newyearSurvey: { name: "newyear-survey", external: true },
  recordCases: { name: "record_cases" },
  recordCounters: { name: "record_counters" },
  recordCategories: { name: "record_categories" },
  applications: { name: "recruitment_regist_answer" },
  questions: { name: "recruitment_regist_question" },
  docSlots: { name: "recruitment_doc_slot" },
  recruitmentCounters: { name: "recruitment_counters" },
  requisitions: { name: "recruitment_requests" },
  hrDocuments: { name: "recruitment_hr_documents" },
  hrDocumentPrints: { name: "recruitment_hr_document_prints" },
  resignCategories: { name: "master_resign_category" },
  resignReasons: { name: "master_resign_reason" },
  /** ทะเบียนประวัติ พจส. — sync จาก `Boom_ETL.main_driver` + ฟิลด์ที่ hr-service เขียนเอง */
  drivers: { name: "master_driver" },
  traineeDaily: { name: "trainee_daily" },
});

/** GridFS bucket ใน `hr_service` — driver สร้าง `<name>.files` / `<name>.chunks` + ดัชนีของมันเอง */
export const BUCKETS = /** @type {const} */ ({
  recordAttachments: "record_attachments",
});

/** คอลเลกชันใน `Boom_ETL` (อ่านอย่างเดียว) — `mainDriver` อ่านผ่าน `app/recruitment/_lib/drivers/master.ts` เท่านั้น */
export const ETL = /** @type {const} */ ({
  vehicles: "vehicles",
  workStatus: "employee_work_status",
  mainDriver: "main_driver",
});

/**
 * ดัชนีที่ประกาศไว้ — **คัดลอกคีย์ + ชื่อ + ออปชันมาจากของจริงบนฐาน (ตรวจ 10 ต.ค. 2026)**
 * ไม่มี `_id_` เพราะ Mongo สร้างให้เองทุกคอลเลกชัน · คอลเลกชันที่ไม่มีในนี้ = ไม่มีดัชนีของเราเลย
 *
 * `ensureIndexesOnce()` (ตอนรัน) กับ `node ensure_db.mjs --apply` สร้างจากรายการนี้อย่างเดียว
 * และไม่เคยลบดัชนีที่ไม่ได้ประกาศ — จะเลิกใช้ดัชนีตัวไหนต้องลบเองแยกต่างหาก
 *
 * @type {{ readonly [K in keyof typeof HR]?: readonly import("mongodb").IndexDescription[] }}
 */
export const INDEXES = {
  complaintMaster: [
    /* ชื่ออัตโนมัติของ `createIndex()` แบบไม่ตั้งชื่อ — ของจริงบนฐานชื่อนี้ ห้ามเปลี่ยน */
    { key: { kind: 1, group: 1, order: 1 }, name: "kind_1_group_1_order_1" },
  ],
  recordCases: [
    { key: { createdAt: -1 }, name: "createdAt_desc" },
    { key: { status: 1, createdAt: -1 }, name: "status_createdAt" },
    { key: { code: 1 }, name: "code_unique", unique: true },
  ],
  applications: [
    { key: { ref: 1 }, name: "ref_unique", unique: true },
    { key: { phone: 1, createdAt: -1 }, name: "phone_recent" },
    { key: { status: 1, createdAt: -1 }, name: "status_recent" },
    /* ตารางแอดมินเรียงใหม่→เก่าโดยไม่มีเงื่อนไขอื่น (`listApplications()`) — สองตัวบนช่วยไม่ได้
       เพราะขึ้นต้นด้วยฟิลด์ที่ query นั้นไม่ได้ระบุ */
    { key: { createdAt: -1 }, name: "recent" },
    /* กันนำเข้าซ้ำจาก Google Form (`form-import.ts`) — sparse เพราะใบที่สมัครผ่านเว็บไม่มีฟิลด์นี้ */
    { key: { importKey: 1 }, name: "importKey_sparse", sparse: true },
  ],
  questions: [
    { key: { key: 1 }, name: "key_unique", unique: true },
    { key: { section: 1, order: 1 }, name: "section_order" },
  ],
  docSlots: [{ key: { slot: 1 }, name: "slot_unique", unique: true }],
  requisitions: [
    { key: { code: 1 }, name: "code_unique", unique: true },
    { key: { status: 1, requestedOn: -1 }, name: "status_requested" },
    {
      key: { drivercode: 1 },
      name: "drivercode",
      partialFilterExpression: { drivercode: { $type: "string", $gt: "" } },
    },
    /* ความถูกต้องจริง — ใบสมัครใบเดียวห้ามผูกสองอัตรา (`linkApplication()` ตรวจซ้ำอีกชั้น) */
    {
      key: { "match.applicationId": 1 },
      name: "match_unique",
      unique: true,
      partialFilterExpression: { "match.applicationId": { $type: "string" } },
    },
  ],
  /* unique ตัวนี้ **คือ** กลไกกันบันทึกครั้งแรกชนกัน (`saveHrDocument()` → 409) */
  hrDocuments: [{ key: { applicationId: 1 }, name: "application_unique", unique: true }],
  hrDocumentPrints: [
    /* ไม่ unique โดยตั้งใจ — ฐานยังมีแถวซ้ำจากตอนเก็บต่อท้าย (ก่อน 29 ก.ย. 2026) */
    { key: { applicationId: 1, docId: 1 }, name: "application_doc" },
    /* มีอยู่บนฐานแต่เดิมไม่ได้ประกาศในโค้ด — ครอบ `find({applicationId}).sort({printedAt: -1})` */
    { key: { applicationId: 1, printedAt: -1 }, name: "application_printed" },
  ],
  resignCategories: [{ key: { prefix: 1 }, name: "prefix_unique", unique: true }],
  resignReasons: [{ key: { code: 1 }, name: "code_unique", unique: true }],
  /* ชื่ออัตโนมัติจากตอนที่ sync เดิมสร้างไว้ · unique กันแถวซ้ำตอน upsert ฟิลด์ของฝ่ายบุคคล */
  drivers: [{ key: { drivercode: 1 }, name: "drivercode_1", unique: true }],
  /* `_id` = `<drivercode>_<YYYY-MM-DD>` กันซ้ำให้แล้ว ตัวนี้มีไว้ให้อ่านแบบ `$in` รหัสได้เร็ว */
  traineeDaily: [{ key: { drivercode: 1, dateISO: 1 }, name: "driver_date" }],
};

/**
 * รุ่นโครงเอกสารต่อคอลเลกชัน — **จองไว้ก่อน ยังไม่มีใครอ่าน** (ทุกตัว = 1)
 * ไว้ใช้กับ schema-versioning pattern ตอนเริ่มทำ migration แบบค่อยเป็นค่อยไป
 *
 * @type {{ readonly [K in keyof typeof HR]: number }}
 */
export const SCHEMA_VERSION = {
  complaintMaster: 1,
  newyearSurvey: 1,
  recordCases: 1,
  recordCounters: 1,
  recordCategories: 1,
  applications: 1,
  questions: 1,
  docSlots: 1,
  recruitmentCounters: 1,
  requisitions: 1,
  hrDocuments: 1,
  hrDocumentPrints: 1,
  resignCategories: 1,
  resignReasons: 1,
  drivers: 1,
  traineeDaily: 1,
};
