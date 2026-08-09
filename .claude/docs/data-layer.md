# Data layer — NCAC API

> Read when: touching `lib/ncac/**`, `lib/cases.ts`, `app/api/**`, save/write paths, or a 405/404 on a case page.

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
