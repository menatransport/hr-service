# Data layer — NCAC API + MongoDB

> Read when: touching `lib/ncac/**`, `lib/cases.ts`, `lib/record-cases.ts`, `app/api/**`,
> save/write paths, or a 405/404 on a case page.
>
> **สองแหล่งข้อมูล แยกขาดจากกัน** — คำร้องของ พจส. อยู่บน **NCAC** (อ่านต่อข้างล่าง) ·
> บันทึกเคสส่วนกลางอยู่บน **MongoDB ของเราเอง** (ท้ายไฟล์นี้) อย่าเอามาปนกัน

```
NCAC API  ──►  lib/ncac/client.ts  ──►  lib/ncac/adapt.ts  ──►  HrCase
(snake_case)   (fetch + errors)        (map + derive)          (what components see)
                      │                        ▲
                      ├──► lib/cases.ts ───────┘   server components (cached per request)
                      └──► app/api/cases/** ─────► client components (go through the route)
```

| File | Responsibility | Never |
|---|---|---|
| `lib/ncac/types.ts` | Raw API shapes | Use these types outside `lib/ncac/` |
| `lib/ncac/client.ts` | Calls the API + `NcacError` | Import from a client component (env would leak) |
| `lib/ncac/adapt.ts` | Maps to `HrCase` / `Approver` | Put UI logic here |
| `lib/cases.ts` | `getCases` / `getCase` / `getCasesByDriver` / `getEligibleApprovers` | Import from a client component |
| `app/api/cases/**` | The only way clients reach data | Put business logic here — it belongs in `case-flow.ts` |

**One env var only:** `API_NCAC_URL` (deliberately not `NEXT_PUBLIC_`). Every endpoint matches the
legacy system in `mena-next-lb/.../driver-complaint/api/*`, so no backend changes are needed.

All filtering (status, department, SLA, free-text search) and **paging (10 per page)** happen in
`case-table.tsx` over the full list `getCases()` returns — the status chips carry counts for the
whole queue, so narrowing the fetch would make those counts wrong.

> `GET /complaints/` does accept `start_date`/`end_date`, but nothing sends them today. Two bugs are
> waiting there if you ever wire them up: it filters only when it gets **both** bounds, and it reads a
> bare `end_date` as midnight — so `end_date=2026-08-07` drops everything filed that day.

## 4 things NCAC doesn't provide — `adapt.ts` derives them

| Needed | Currently derived from |
|---|---|
| `reasonGroup` | `root_cause` → `complaint_type` → department → `OTH` |
| `priority` | Reason group (SAF/PAY = high) + damage ≥ 10,000 THB = high |
| `driverName` / `driverMeta` · approver names | Matching employee IDs against `/users` |
| `notes` (message thread) | No endpoint → always `[]`, so the on-screen block stays hidden |

**When the backend adds real columns, delete the derivation and read the value directly — in
`adapt.ts` only.** Never re-derive it in a component.

## ⚠️ NCAC has no `GET /complaints/{tracking_no}`

`/openapi.json` only exposes `GET /complaints/` (the full list), `PUT /complaints/{tracking_no}`
and the action endpoints — a `GET` for a single case returns **405**, which once made every case
page 404.

So `getComplaint()` in `lib/ncac/client.ts` fetches the whole list and finds the case itself (the
`/complaints/` payload contains every field, including `reviews`), and `getCase()` in
`lib/cases.ts` reads from the already-`cache()`d `getCases()`. That means one upstream call per
request even though `/desk/cases/[id]` renders both the table and the modal. **The day the backend
ships a real endpoint, change `getComplaint()` only** — every caller benefits immediately.

One more thing: the list path must end with `/` as FastAPI declares it, otherwise you get a 307 redirect.

## Any page touching cases must be dynamic

Every page that reads cases declares `export const dynamic = "force-dynamic"` and has **no
`generateStaticParams`** — prerendering at build time would serve stale data.

If the API is down or the env var is unset, the screen renders `<DataError>`
(`components/ui/data-error.tsx`). **Never let it fall back to an empty page** — that reads as
"there are no cases."

## Writes are live

| Action | Route |
|---|---|
| Create a case from desk ("แจ้งเรื่องเอง") | `POST /api/cases` `{ driverId, subject, detail, imageUrl? }` |
| Assign a department from the table | `PATCH /api/cases/{no}` `{ departmentId }` |
| The "บันทึก" button in the modal | `PATCH /api/cases/{no}` (all fields + both approver levels in one request) |
| Approve / reject | `POST /api/cases/{no}/review` (`remark` enforced in both the UI and the route) |
| Close a case | `POST /api/cases/{no}/close` |
| Delete a case (soft) | `DELETE /api/cases/{no}` `{ deletedByEmployeeId }` — **รอ deploy ดูหัวข้อล่าง** |

อ่านอย่างเดียว: **ประวัติการทำงาน** `GET /complaints/logs` → `lib/activity.ts` → `/desk/activity`

### ประวัติการทำงาน (`/desk/activity`)

อ่านจาก `complaint_logs` ผ่าน `GET /complaints/logs?limit=&action=&tracking_no=`
(เพิ่มใน NCAC 8 ส.ค. 2026 · upstream บีบ `limit` ที่ 500 · เรียงใหม่สุดก่อน)

**รวมคำร้องที่ถูกลบไปแล้วด้วย** ต่างจาก `GET /complaints/` — ถ้ากรองออก รายการ
`DELETE` จะหายไปพร้อมคำร้อง กลายเป็นล็อกที่ปิดบังเรื่องสำคัญที่สุด · หน้าจอเช็ก
`caseDeleted` ก่อนทำลิงก์เสมอ เพราะคำร้องที่ลบแล้วเปิดหน้ารายละเอียดไม่ได้

**แยกจากกระดิ่งแจ้งเตือนโดยตั้งใจ** — กระดิ่งคือ “ต้องทำอะไรต่อ” (เกิน SLA /
รอฉันอนุมัติ / ยังไม่มอบหมาย ดู `buildNotifications()`) ส่วนหน้านี้คือ “เกิดอะไรขึ้น
ไปแล้วบ้าง” ซึ่งไม่มีอะไรให้ลงมือทำ · เอาไปปนกันเมื่อไหร่ เลขบนกระดิ่งจะไม่ได้แปลว่า
งานค้างอีกต่อไป

⚠️ **`action_by_employee_id` เป็น `null` ได้เสมอ ห้ามเดาว่าเป็นใคร** — NCAC เพิ่งเริ่ม
บันทึกผู้ทำเมื่อ 8 ส.ค. 2026 (`CLOSE` `DELETE` `APPROVE` `REJECT`) ส่วน `CREATE`
มาจากคนขับซึ่งไม่ใช่ผู้ใช้ในระบบ และ `ASSIGNED`/`RESUBMIT` เกิดจาก `PUT` ที่ไม่ได้
รับรหัสผู้ทำเข้ามา · `activityActor()` ใน `case-flow.ts` เป็นตัวตัดสินข้อความที่แสดง

หมายเหตุที่ backend เขียนเอง (`Complaint created`, `Department changed …`) ถูกตัดทิ้ง
ใน `toActivity()` เพราะซ้ำกับป้ายชื่อเหตุการณ์และเป็นภาษาอังกฤษ — ช่องหมายเหตุจึง
เหลือแต่ข้อความที่คนพิมพ์เอง

### ลบคำร้อง — soft delete ผ่าน `is_deleted`

ซอร์สของ NCAC อยู่ที่ **`C:\Users\Lenovo\Desktop\FastAPI\ncacdb`** (คนละ repo กับที่นี่)
`routes/complaint.py` มี `DELETE /complaints/{tracking_no}` แล้ว — เพิ่มเมื่อ 8 ส.ค. 2026
พร้อมกับงานนี้ · **ตัวที่รันบน Render ยังเป็นโค้ดเก่าจนกว่าจะ deploy** (ตอบ 405)

```
DELETE /complaints/{tracking_no}?deleted_by_employee_id=…&remark=…
   200  {"message": "Complaint deleted", "tracking_no": …, "is_deleted": true}
   400  สถานะเลย ASSIGNED ไปแล้ว / มี reviewer แล้ว / employee_id ไม่มีอยู่จริง
   404  ไม่พบ หรือถูกลบไปแล้ว
```

เลือก `is_deleted` แทนการเพิ่มสถานะ `DELETED` เพราะ **คอลัมน์มีอยู่แล้ว** (`GET /` และ
`PUT` กรอง `is_deleted == False` อยู่ก่อนแล้ว) และเข้ากับ DELETE อีก 20 เส้นในระบบเดียวกัน ·
เพิ่มสถานะใหม่จะลามไปทั้ง state machine (`STATUS_FLOW` · `statusMeta` · `buildTimeline` ·
ชิปกรอง · การนับ SLA) ทั้งที่ความหมายคือ “ไม่ควรอยู่ในรายงานตั้งแต่แรก” ไม่ใช่ขั้นหนึ่ง
ของวงจรชีวิตเคส · ไม่ลบแถวจริงเพราะ `complaint_reviews` / `complaint_logs` ผูก FK
แบบ CASCADE ประวัติจะหายตามไปทั้งชุด (กู้คืน: `UPDATE ... SET is_deleted = false`)

**`DELETE /api/cases/{no}` อ่านกลับมายืนยันเสมอก่อนตอบ 200 — ห้ามตัดขั้นตอนนี้ทิ้ง**
(แพตเทิร์นเดียวกับ `PUT /api/employees/[id]/photo`) เพราะ API ตัวนี้เคยตอบ 200 ทั้งที่
ไม่ได้ทำอะไร — `PUT` ด้วย `{"is_deleted": true}` ตอบ 200 แต่ค่าไม่เปลี่ยน เพราะ
`ComplaintUpdate` ไม่มีฟิลด์นี้แล้ว Pydantic ทิ้งทิ้งเงียบ ๆ (ยิงทดสอบแล้ว 8 ส.ค. 2026)

กฎว่าคำร้องไหนลบได้อยู่ใน `canDeleteCase()` ที่ `lib/case-flow.ts` ที่เดียว —
`open`/`assigned` และต้องยังไม่มี `reviews` เลย (เซ็นแล้วต้องปิด ไม่ใช่ลบ)
**NCAC ตรวจกฎเดียวกันซ้ำอีกชั้น** เพราะ UI ไม่ใช่ด่านความปลอดภัย

### ⚠️ `deskUser.employeeId` ต้องเป็นรหัสที่มีอยู่จริงใน `/users`

`complaint_logs.action_by_employee_id` มี FK `fk_log_user` ไป `users.employee_id` —
ส่งรหัสที่ไม่มีอยู่จริงไป แถว log จะ insert ไม่ผ่านแล้ว **rollback ทั้ง transaction**

เดิม `deskUser.employeeId` เป็น `EMP-1180` ซึ่งไม่มีอยู่จริง (ทั้ง NCAC ไม่มีรหัสขึ้นต้น
`EMP-` เลยสักคน) ทำให้ทั้ง **ลบคำร้อง** และ **ปิดคำร้อง** พังเหมือนกัน — อันหลังเป็นบั๊ก
ที่มีมาก่อนแล้ว เพิ่งมาเจอตอนทำปุ่มลบ

แก้แล้วสองชั้น (8 ส.ค. 2026):

1. **บัญชีระบบ `HRSVC-DESK`** ในตาราง `users` — `employee_status = "System"`,
   ไม่มีแผนก/ตำแหน่ง/สาขา, รหัสผ่านสุ่มทิ้งจึงล็อกอินไม่ได้ · มีไว้ให้ audit log
   มีปลายทาง FK ที่ถูกต้องเท่านั้น **ไม่ใช่พนักงานจริง จึงไม่ไปสวมชื่อใครใน audit**
   `getEmployees()` กรอง `employee_status = "System"` ออกจากสมุดรายชื่อ ส่วน
   `getUserDirectory()` **ไม่กรอง** เพราะยังต้องแปลงรหัสในประวัติเคสเป็นชื่อ
2. **`ensure_employee_exists()` ฝั่ง NCAC** — เช็กก่อนแตะข้อมูลแล้วตอบ **400 พร้อมเหตุผล**
   แทน 500 เปล่า ๆ ทั้งใน `/close` และ `DELETE` (เช็ก **ก่อน** เปลี่ยนสถานะเสมอ ไม่งั้น
   log insert พังท้ายสุดแล้ว rollback ทั้งชุด ผู้ใช้เห็นแค่ 500 ที่ไม่บอกอะไร)

ต่อ auth เมื่อไหร่ให้ `deskUser` มาจากบัญชีที่ล็อกอินจริงแทนบัญชีระบบตัวนี้

## Attachments — a second upstream, not NCAC

NCAC stores attachments as **URLs** (`complaint_url` / `solution_url`), never the bytes. The files
live on DigitalOcean Spaces (`mn-bucket`), reached through the same presign service the mena-go
mobile app uses (`src/hooks/usePresignedUpload.js` over there).

> **Mass Recruitment ไม่ใช้ทางนี้แล้ว (1 ต.ค. 2026)** — เอกสารผู้สมัคร รูป/แฟ้ม พจส. อยู่บน S3
> แบบ private ผ่าน `lib/s3.ts` + `lib/media.ts` (`mass-image/…`, ลิงก์ `/api/media/{key}`) ·
> `/api/uploads` เหลือไว้แนบรูปคำร้องฝั่ง desk และ **ต้องล็อกอินแล้ว**

`POST /api/uploads` (multipart, field `file`) → `{ url }`, done entirely server-side in
`lib/uploads.ts`: presign → `PUT` to Spaces → `set-public-acl-batch` (skip the ACL step and the
file returns 403 in `<img>`). Base URL is `API_PRESIGN_URL`, defaulting to the same Cloud Run host
mena-go hardcodes. The browser never talks to Spaces directly — the bucket's CORS isn't ours to change.

The browser shrinks the image first (`lib/image-resize.ts`, client-only: `createImageBitmap` +
`OffscreenCanvas`), so the two-hop transfer stays small. **JPG/PNG only**, enforced in the field,
the route, and `ACCEPTED_IMAGE_TYPES`. Uploads happen on file pick, not on submit — abandoning the
form leaves an orphan object on the bucket, same as mena-go.

On success, call `router.refresh()` so server components refetch. `CaseModal` resets
`draft`/`saved` when `hrCase.updatedAt` changes, by **adjusting state during render, not in a
`useEffect`** (the `react-hooks/set-state-in-effect` rule errors if you move it into an effect).

## บันทึกเคสส่วนกลาง — MongoDB (คนละแหล่งกับ NCAC)

`/desk/record-cases` **ไม่ได้แตะ NCAC เลย** — เก็บบน MongoDB ของบริษัทโดยตรง
(`MONGO_URI` / `MONGO_DB` ใน `.env.local` · ไม่ได้ตั้ง = หน้าขึ้น `DataError` ไม่ใช่หน้าว่าง)

```
MongoDB  ──►  lib/mongo.ts  ──►  lib/record-cases.ts  ──►  RecordCase
(record_cases)  (client เดียว     (อ่าน/เขียน + ตรวจข้อมูล)    (ชนิดใน lib/record-case-flow.ts
                 cache บน global)          │                     ซึ่ง client import ได้)
                                           ├──► app/desk/record-cases/page.tsx  (server component)
                                           └──► app/api/record-cases/**         (client ยิงผ่านเส้นนี้)
```

| คอลเลกชัน | เก็บอะไร |
|---|---|
| `record_cases` | ตัวเคส + **ไฟล์แนบ** + **ประวัติการเปลี่ยนสถานะ** อยู่ในเอกสารเดียวกัน |
| `record_counters` | ตัวนับเลขที่เคสรายเดือน (`ER-2608-001` — ปีเดือนเป็น ค.ศ. เปลี่ยนจากรายปี พ.ศ. 26 ส.ค. 2026) — `$inc` แบบ atomic ห้ามเปลี่ยนไปนับด้วย `countDocuments` |
| `record_categories` | master data ของ**ประเภทเคส** (25 ส.ค. 2026) — คนละคอลเลกชันกับ `record_cases` เพราะวงจรชีวิตต่างกัน (แก้ไม่บ่อย เทียบกับเคสที่ไหลเข้าตลอด) |

- **สถานะมีแค่ 3 ตัว** `pending` / `completed` / `rejected` — กฎอยู่ที่ `lib/record-case-flow.ts`
  ที่เดียว (`nextStatuses()` `recordStatusMeta`) ห้ามเขียนกฎซ้ำในคอมโพเนนต์
- **หนึ่งเคสมีฝ่ายที่เกี่ยวข้องได้ฝ่ายเดียว** (`departmentId` ไม่ใช่อาเรย์) เลือกจาก dropdown
  ตามคำสั่งเจ้าของงาน 19 ส.ค. 2026 — เดิมเป็นชิปเลือกหลายฝ่าย **อย่าเปลี่ยนกลับเอง**
- **สี่ฟิลด์ที่เพิ่มทีหลัง (21 ส.ค. 2026) ต้องทนกับเอกสารเก่าเสมอ** — `category` (รหัสประเภท
  จาก `record_categories`) · `involved` (ชื่อผู้เกี่ยวข้อง) · `warnings` (โทษทางวินัย) ·
  `remark` (หมายเหตุของตัวเคส) เป็น optional ใน `RecordDoc` แต่ `toRecordCase()` เติม
  `""` / `[]` ให้ **หน้าจอจึงไม่ต้องเช็ค `undefined` เอง** ·
  ตอนเขียนเข้าไปใหม่บังคับ `category` เสมอ (ตรวจกับ `isKnownRecordCategory()` แบบ async
  เพราะต้องอ่าน Mongo — รหัสไม่มีอยู่จริงในคอลเลกชัน `record_categories` = 400) ·
  `involved` ตัดช่องว่าง ทิ้งค่าว่าง ตัดชื่อซ้ำ (ไม่สนตัวพิมพ์) จำกัด `MAX_INVOLVED` คน ·
  `warnings` รับเฉพาะรหัสใน `WARNING_LEVELS` และ **ตีกลับ 400 ถ้าส่ง “ไม่ได้รับ” มาพร้อมข้ออื่น**
  (กฎเดียวกับที่ฟอร์มบังคับ) ·
  **ไม่ได้ backfill เอกสารเก่าโดยตั้งใจ** — เดาประเภท/โทษย้อนหลังให้เท่ากับแต่งข้อมูล
- **ประเภทเคส (`record_categories`) เป็น master data ที่จัดการได้จาก UI** (25 ส.ค. 2026) —
  ย้ายออกจากชุดปิดที่เคยฮาร์ดโค้ดเป็น `RECORD_CATEGORIES` ใน `record-case-flow.ts` แล้ว ·
  `_id` เป็นสตริง = รหัสที่ `RecordCase.category` อ้างถึงตรง ๆ (ไม่ใช่ ObjectId) — ของเดิม 7 ตัว
  ถูก seed ไว้ครั้งเดียวตอนคอลเลกชันว่างด้วยรหัสเดิมเป๊ะ (`complaint`, `discipline`, …) ไม่ให้
  เคสเก่าเสียการอ้างอิง ส่วนตัวที่เพิ่มทีหลังได้รหัสสุ่ม (`crypto.randomUUID()`) เพราะผู้ใช้
  ไม่เคยเห็น/พิมพ์รหัสนี้เอง (กรอกแค่ป้ายภาษาไทย) · จัดการผ่านปุ่ม “จัดการประเภทเคส” →
  `RecordCategoryManager` → `app/api/record-categories/**` ·
  **ลบประเภทที่เคสเก่ายังอ้างถึงอยู่ได้โดยตั้งใจ** — ไม่ backfill เคสเก่าตาม เคสนั้นจะแสดง
  ประเภทเป็น “—” แทน (`recordCategoryLabel()` หารหัสในรายการปัจจุบันไม่เจอ) เหมือนพฤติกรรม
  เดิมตอน `category` เป็นค่าว่าง
- **เปลี่ยนสถานะ = ลงประวัติเสมอ** ทำในคำสั่งเดียวด้วย `$set` + `$push` และ filter ด้วยสถานะเดิม
  → หน้าจอที่ค้างค่าเก่าจะได้ 400 แทนที่จะทับสถานะที่คนอื่นเพิ่งเปลี่ยน
- **แก้ไขเนื้อเคส = ลงประวัติเสมอเช่นกัน** (`updateRecordCase()` → `PUT /api/record-cases/{id}`
  เพิ่ม 21 ส.ค. 2026) — แถวประวัติเป็น `kind: "edit"` เก็บ `fields` (ชื่อไทยของฟิลด์ที่เปลี่ยน)
  และ `from` = `to` = สถานะเดิม เพราะการแก้ไม่ได้ขยับสถานะ · เทียบค่าเก่า/ใหม่ก่อนเสมอ
  **ไม่มีอะไรต่าง = `RecordCaseError` → 400** จะได้ไม่มีแถว “แก้ไข” เปล่า ๆ ในประวัติ ·
  `PUT` **ทิ้ง `status` ที่ส่งมาใน body เสมอ** — สถานะเปลี่ยนได้ทาง `PATCH` ทางเดียว
- **ผู้บันทึก / ผู้เปลี่ยนสถานะมาจาก session เท่านั้น** (`actor()` ใน `app/api/record-cases/_lib.ts`)
  ห้ามรับจาก body — กฎเดียวกับฝั่งคำร้อง
- `RecordCaseError` = ข้อมูลที่กรอกมาไม่ผ่าน → ตอบ **400** ผ่าน `failRecord()` ไม่ใช่ 500
- **วันที่ของเคสเก็บเป็น `YYYY-MM-DD` ล้วน ไม่ใช่ ISO** — ผู้ใช้กรอกแค่ “วันไหน” ถ้าเก็บเป็น ISO
  วันจะเลื่อนตามโซนเวลาของเครื่องที่ render · แสดงผลผ่าน `formatOccurredOn()` เท่านั้น
- **ไฟล์แนบอยู่ใน MongoDB (GridFS) ไม่ได้ขึ้น Spaces** — `lib/record-files.ts` ·
  เอกสารเคสเก็บแค่ `{ fileId, name, type, size }` · ลิงก์เปิดไฟล์สร้างจาก `attachmentUrl()`
  ชี้ไป `GET /api/record-cases/files/{id}` ซึ่ง **ตรวจ session เองอีกชั้น** (proxy ปล่อย `GET` ผ่านหมด)

  > ⚠️ **ทำไมไม่ใช้ presign API เหมือนคำร้อง พจส.** — บริการนั้นมี allow-list เป็น
  > **นามสกุลรูปเท่านั้น** (`.jpg .jpeg .png .webp .gif .bmp .tif .tiff .heic .heif .avif`)
  > ยิง `.pdf` ไปได้ 400 `extension not allowed` (ยิงทดสอบยืนยัน 19 ส.ค. 2026) ·
  > **อย่าย้ายกลับไปใช้ Spaces** จนกว่าเจ้าของบริการจะเปิดนามสกุลเอกสารให้
  > ผลพลอยได้ของการอยู่ใน Mongo คือไฟล์ไม่เป็นสาธารณะ ต้องล็อกอินถึงเปิดได้
  > และจำกัดขนาดที่ `MAX_FILE_BYTES` (10 MB) เพราะกินพื้นที่ฐานข้อมูลจริง
- ตอนบันทึกเคส `attachments()` **อ่านดูว่าไฟล์มีอยู่จริงใน GridFS** ก่อนเสมอ —
  ยิง id มั่ว ๆ มาจะได้ 400 ไม่ใช่เคสที่มีไฟล์แนบกดแล้ว 404 ตลอดกาล
- หน้าจอดึงมาทั้งชุด (สูงสุด 500 รายการ ใหม่สุดก่อน) แล้วค้นหา/กรองฝั่ง client —
  ถ้าวันหนึ่งเกินนี้ค่อยย้ายไปกรองที่ query ของ Mongo
- **ส่งออก Excel ได้แล้ว** (26 ส.ค. 2026) — คู่ขนานกับ `GET /api/cases/export` ของฝั่งคำร้อง
  ปุ่ม “Excel” ท้ายแถวชิปสถานะของ `record-case-view.tsx` → `GET /api/record-cases/export`
  → `lib/record-case-export.ts` (`exceljs`) · ตัวกรอง (คำค้น/สถานะ/ฝ่าย/ประเภท) แยกออกมาอยู่
  **`lib/record-case-filter.ts`** ให้ตารางบนจอกับไฟล์ที่ส่งออกกรองด้วยกฎเดียวกัน — ห้ามเขียน
  เงื่อนไขกรองซ้ำใน component อีก (เหตุผลเดียวกับ `lib/case-filter.ts`) ·
  **ห้ามใช้ `toBangkokDate()`/`excelDate()` ของ `lib/case-export.ts` กับไทม์สแตมป์ของบันทึกเคส**
  ตัวนั้นชดเชยเวลาดิบของ NCAC ที่ไม่มีโซนต่อท้าย (+14 ชม.) ส่วน `createdAt`/`updatedAt`/
  `occurredOn` (ต่อ `+07:00` เองก่อนแปลง) ของบันทึกเคสเป็น ISO ที่มีโซนถูกต้องอยู่แล้ว
  จึงบวกแค่ +7 ชม. เหมือน `todayInBangkok()` — `excelDate()` ใน `record-case-export.ts`
  เป็นตัวที่ทำแบบนั้น อย่าเอาของ NCAC มาใช้ผิดที่ · เส้นนี้บังคับล็อกอินเอง (`getDeskIdentity()`)
  เหมือนฝั่งคำร้อง เพราะยกข้อมูลทั้งคิวออกไปในคำขอเดียว

## master data ของคำร้อง — `master_complainte` (8 ก.ย. 2026)

`hr_service.master_complainte` เก็บ **สองชุดในคอลเลกชันเดียว** แยกด้วย `kind`
(`lib/complaint-master.ts`) เพราะโครงเหมือนกันเป๊ะ หน้าจอจัดการจึงเขียนครั้งเดียวใช้ได้ทั้งคู่
(`components/desk/master-modal.tsx` → `<MasterButton kind="type" | "cause" />` บนหน้าคิวคำร้อง)

| `kind` | คือ | `group` | `_id` | เขียนที่ไหน |
|---|---|---|---|---|
| `type` | ประเภทเรื่อง | รหัสหน่วยงาน | id ของ NCAC เป็นสตริง (`"12"`) | **NCAC ก่อน** แล้ว sync ลง Mongo |
| `cause` | สาเหตุหลัก | `ReasonGroupCode` | uuid (ของที่ seed = `PAY-0`) | Mongo อย่างเดียว |

เอกสารหนึ่งแถวมีแค่ `_id` `kind` `group` `name` `order` `active` `updatedAt` — ไม่มี `createdAt`
(master data ไม่มีใครไล่ย้อนหลัง) และ **ไม่มี `icon` แล้ว** ถอดออกตามคำสั่งเจ้าของงาน
พร้อมกับไฟล์ `lib/complaint-icons.ts` · ดัชนีเดียว `{ kind, group, order }` ครอบทุก query ในไฟล์

- **ทำไมประเภทเรื่องยังต้องเขียนผ่าน NCAC** — `driver_complaints.problem` เป็น FK ชี้
  `complaint_master.id` จริงบน Postgres (`ncacdb/models/complaint.py`) ประเภทที่มีแต่ใน Mongo
  จะบันทึกลงคำร้องไม่ได้ (FK violation) · ทุกคำสั่งเขียนจึงยิง `/complaint-masters` ก่อนเพื่อให้ได้
  id ที่ FK ยอมรับ แล้ว `syncTypes()` ดึงทั้งชุดกลับมา **ทับทั้งก้อน** (ไม่ใช่ทีละแถว) จึงไม่มีทาง
  หลุด sync · **ตัด NCAC ออกได้เมื่อ backend เลิกใช้ FK นี้เท่านั้น** — แก้ที่ `createMaster()`
  `updateMaster()` `deleteMaster()` สามจุด
- **migration เกิดเองครั้งแรกที่มีคนเปิดหน้า** — คอลเลกชันยังไม่มี `kind: "type"` เลย =
  ดึงจาก NCAC มาใส่ทั้งชุดโดยคง id เดิม · สาเหตุ seed จาก `reasonGroups.items` ใน `lib/data.ts`
  (34 รายการ) ทั้งสองขั้นกลืน error เองและ **ติดธงเฉพาะตอนสำเร็จ** NCAC ล่มพอดีก็ลองใหม่รอบหน้า
- **เปลี่ยนชื่อสาเหตุไม่ย้อนไปแก้คำร้องเก่า** — `root_cause` ของ NCAC เป็นคอลัมน์ข้อความ คำร้อง
  ที่บันทึกไว้แล้วยังแสดงข้อความเดิม (โมดัลเตือนก่อนกดบันทึก) · ด้วยเหตุผลเดียวกัน **ค่าใน
  ดรอปดาวน์ “สาเหตุหลัก” คือชื่อ ไม่ใช่ `_id`** · สาเหตุที่ถูกปิดใช้งาน/เปลี่ยนชื่อแล้วแต่คำร้องยังถืออยู่
  ถูกใส่กลับเข้าดรอปดาวน์เป็นกลุ่ม “สาเหตุเดิมของคำร้องนี้” พร้อม hint — ไม่งั้น `Select` ขึ้น placeholder
  เหมือนยังไม่เคยเลือกทั้งที่ค่ายังอยู่ (`toRootCauseGroups()` ใน `case-modal.tsx`)
- **สาเหตุที่เพิ่มใหม่ยังไม่เข้าผังกลุ่มของ `deriveReasonGroup()`** — `GROUP_BY_ITEM` ใน
  `lib/ncac/adapt.ts` สร้างจาก `reasonGroups.items` ซึ่งเป็น sync function เรียก Mongo ไม่ได้
  คำร้องที่ใช้สาเหตุใหม่จึงถูกจัดกลุ่มจาก **หน่วยงานของคำร้อง** แทน (พฤติกรรมเดิมของค่าที่ไม่รู้จัก)
  กระทบแค่ `priority` กับกราฟกลุ่มสาเหตุ · จะให้ตรงเป๊ะต้องส่ง map จาก Mongo เข้า `toHrCase()`
  ซึ่งมีผู้เรียกหลายที่ ยังไม่คุ้มจนกว่าจะมีคนเพิ่มสาเหตุนอกผังจริงจัง

## ทำเอกสาร (Mass Recruitment) — `recruitment_hr_documents` / `recruitment_hr_document_prints` (29 ก.ย. 2026)

ชั้นข้อมูลอยู่ที่ `app/recruitment/_lib/hr-document-records-store.ts` เส้น API อยู่ใต้
`app/api/recruitment/applications/[id]/hr-documents/**` — ชนิด/ค่าคงที่ร่วมของทั้งสองฝั่งอยู่ที่
`app/recruitment/_lib/hr-document-records.ts` (client import ชนิดจากไฟล์นี้ได้ ไม่แตะ `lib/mongo.ts`)

| คอลเลกชัน | เก็บอะไร |
|---|---|
| `recruitment_hr_documents` | **หนึ่งใบสมัครหนึ่งเอกสาร** ถือ `fill` (ค่าที่กรอก) ก้อนล่าสุดทั้งหมด — สามฉบับ (สัญญาจ้าง/สัญญาค้ำ/ยินยอมคืนเงินค้ำ) ใช้ช่องร่วมกัน จึงไม่แยกเอกสารตามฉบับ |
| `recruitment_hr_document_prints` | **การพิมพ์ล่าสุด ฉบับละแถว** (upsert ตาม `applicationId` + `docId`) พร้อมสำเนา `fill` ของครั้งล่าสุด — เดิมเก็บต่อท้ายทุกครั้ง เปลี่ยนตามคำสั่งเจ้าของงาน 29 ก.ย. 2026 |

- **`revision` กันบันทึกทับกัน (optimistic concurrency)** — จอต้องส่ง `revision` ที่ตัวเองถือมาด้วย
  ทุกครั้งที่ `PUT …/hr-documents` (`0` = ยังไม่เคยบันทึก) บันทึกครั้งแรกเป็น `insertOne` ได้
  `revision: 1` (สองคนบันทึกครั้งแรกพร้อมกันชนที่ดัชนี unique ของ `applicationId` → 409) ส่วน
  บันทึกทับใช้ `findOneAndUpdate({applicationId, revision: expected})` + `$inc` ในคำสั่งเดียว
  ไม่เจอแถวที่ตรง = คนอื่นบันทึกไปก่อนแล้ว → **409** "มีคนบันทึกเอกสารนี้ไปก่อนแล้ว — โหลดค่าล่าสุดก่อนแก้ต่อ"
- **`HrDocumentError`** (นิยามในไฟล์ store) คือทางออกจาก 400 เดียวของ `RecruitmentError` — ตอบ 404
  (ไม่พบใบสมัคร) กับ 409 (revision ชนกัน) `failRecruitment()` ใน `app/api/recruitment/_lib.ts`
  รู้จัก error คลาสนี้เพิ่มแล้ว · error อื่นของโฟลว์นี้ (ข้อมูลไม่ผ่าน / ใบสมัครถูกลบแล้ว) ยังเป็น
  `RecruitmentError` ธรรมดา → 400 เหมือนเดิม
- **การพิมพ์ = ฉบับละแถว เขียนทับ** — `recordHrDocumentPrint()` ไม่แก้เอกสารหลัก ทำ `findOneAndUpdate`
  upsert ที่ `{applicationId, docId}` เก็บเวลา ผู้พิมพ์ สำเนา `fill` และ `revision` ของเอกสารหลัก ณ ตอนนั้น
  แล้วลบแถวซ้ำของฉบับเดียวกันที่ค้างจากตอนยังเก็บต่อท้าย · ดัชนี `{applicationId, docId}` **จงใจไม่
  unique** (ฐานมีแถวซ้ำเก่าอยู่ สร้าง unique จะล้ม) ตอนอ่านจึงเลือกแถวล่าสุดต่อฉบับเองอีกชั้น
  รายการในประวัติ (`GET …/hr-documents`) **ไม่มี `fill`** ต่อรายการ (`projection: {fill: 0}`) ขอทีละ
  ใบเต็มผ่าน `GET …/hr-documents/prints/{printId}` เท่านั้น กัน payload ของหน้ารายการบวมโดยไม่จำเป็น
- **ใบสมัครต้องมีอยู่จริงและยังไม่ถูกลบตามคำขอ** — `guardApplication()` ตรวจทั้งสองข้อก่อนบันทึก/สั่งพิมพ์
  (ไม่ตรวจ “ลบแล้วหรือยัง” ตอนอ่าน `GET …/hr-documents` เพราะอ่านไม่ทำอันตราย และถ้า hook ลบทำงาน
  ถูกต้อง ใบที่ถูกลบก็จะไม่มีเอกสารเหลือให้อ่านอยู่แล้ว) กติกา "ลบแล้วหรือยัง" คัดลอกมาจาก `erasedOf()`
  ของ `applications.ts` ตรง ๆ (`erasedAt` มีค่า หรือ `status === "withdrawn"`) **ไม่ import ข้ามมา**
  เพราะ `applications.ts` ต้องเรียกกลับมาที่ store นี้เพื่อลบข้อมูล (ดูข้อถัดไป) — import สองทางจะวนเป็น cycle
- **ลบตามคำขอ (PDPA) ลากเข้ามาด้วยเสมอ** — `cancelApplication()` ใน `applications.ts` เรียก
  `eraseHrDocuments(applicationId)` (deleteMany ทั้งสองคอลเลกชัน) ทันทีหลังล้างใบสมัครหลัก เพราะ
  `fill` มีทั้งเลขบัตรประชาชนและที่อยู่ · **ล้มเหลวแล้วไม่โยนต่อ** (แค่ `console.warn`) — การลบใบสมัคร
  หลักต้องสำเร็จเสมอ ต่อให้เอกสาร HR มีปัญหา ท่าเดียวกับ `syncRequisitionForApplication()`
