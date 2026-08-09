@AGENTS.md

# HR Service — driver complaint & employee service system

Cases are live — cases, approvers and employee records come from the **NCAC API** (the same one the
legacy `driver-complaint` system uses). Still sample data: **announcements** only.
**Auth is live too** — Google OAuth → NCAC (see below); `currentUser` / `deskUser` in `lib/data.ts`
are now only the logged-out fallback.

Set `API_NCAC_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `AUTH_SECRET` in `.env.local`
before running — without `API_NCAC_URL`, case pages render `DataError`, not a blank page.

> **The announcements and reports pages were temporarily removed on the owner's instruction (6 Aug 2026).**
> Deleted: routes `/desk/announcements` `/desk/reports` `/m/services/announcements` + their menu items,
> tiles and notifications.
> **Kept on purpose — do not delete:** `announcements` / `monthlyVolume` in `lib/data.ts`,
> `lib/case-report.ts`, `case-volume-chart.tsx`, `reason-bars.tsx`

> **Room / vehicle booking was removed on the owner's instruction (7 Aug 2026) — mocks included.**
> Deleted: routes `/desk/rooms` `/desk/vehicles` `/m/services/rooms` `/m/services/vehicles`,
> `components/m/room-booking.tsx`, `ServiceTileSmall`, the `บริการองค์กร` block on `/m` and in
> `deskNav`, `rooms` / `vehicles` / `timeSlots` in `lib/data.ts`, and the `Room` / `Vehicle` types.
> Also under `งานของฉัน`: **`ประวัติการทำงาน`** (`/desk/activity`) — อ่าน `complaint_logs`
> ของ NCAC ผ่าน `GET /complaints/logs` แสดงว่าใครทำอะไรกับคำร้องไหน รวมคำร้องที่ถูกลบแล้ว
> **แยกจากกระดิ่งแจ้งเตือนโดยตั้งใจ** (กระดิ่ง = “ต้องทำอะไรต่อ” · หน้านี้ = “เกิดอะไรขึ้นแล้ว”)
> — อย่าเอาไปยัดรวมกัน เลขบนกระดิ่งจะไม่ได้แปลว่างานค้างอีกต่อไป
>
> Added in its place: `ทะเบียนประวัติ พจส.` under `งานของฉัน` with two sub-entries
> (`/desk/registry/ladkrabang`, `/desk/registry/saraburi`). **No data source yet** — NCAC `/users`
> is office staff, not พจส., and carries no พจส. branch field, so both pages render an empty state
> that says so. `deskNav` items now support a `children` array (see `DeskNavItem`).

## 📖 Detailed docs — read only the file that matches the task (never read them all)

| File | Read when |
|---|---|
| `.claude/docs/design-system.md` | Color, font, spacing, tokens, dark theme, UI rules, charts |
| `.claude/docs/forms.md` | Any input · Radix dropdowns · the in-dropdown search box |
| `.claude/docs/domain.md` | Case status, roles, form lock rules, SLA, timeline, reference data |
| `.claude/docs/data-layer.md` | `lib/ncac/**` `lib/cases.ts` `app/api/**`, writes, 405/404 issues |
| `.claude/docs/routes-ui.md` | Adding/changing pages, layouts, `/m`, `/desk`, `case-modal.tsx`, notifications |

## Two sources, strictly separated

| Source | Provides |
|---|---|
| **Claude Design** `453d9e27-…` (`HR System.dc.html`, `HR Wireframes.dc.html`) | **All design** — color, font, radius, chips, layout, nav |
| **Legacy project** `mena-next-lb/src/app/driver-complaint` | **All domain model** — status flow, PIC routing, root causes, 2-level approval, form lock rules |

**Never carry the legacy system's styling over** (indigo/gradient/shadcn) — design comes from the
new system only. Claude Design's `support.js` is dc-runtime, unrelated to this project; don't port it.

## Stack

Next.js 16 App Router (Turbopack) + React 19 + TS strict · Tailwind v4 (CSS-first, no
`tailwind.config.js`) · daisyUI 5 with the `hrs` theme in `app/globals.css` · lucide-react
(stroke 1.6–1.8) · IBM Plex Sans Thai + IBM Plex Mono via `next/font/google` (`--font-sans` /
`--font-mono`, so `font-mono` is the real Plex Mono, not the system fallback) · Radix UI (the `radix-ui` package)
as the dropdown base · **no shadcn, and no copying prebuilt components from anywhere**

## Auth — Google OAuth → NCAC (built 9 Aug 2026)

```
/  →  GET /api/auth/google      (302, สุ่ม state ลงคุกกี้, hd=menatransport.co.th)
   →  accounts.google.com
   →  GET /api/auth/callback/google   (ตรวจ state → แลก code เป็น id_token)
   →  POST /auth/login/google ของ NCAC (backend ตรวจ token + โดเมนเอง)
   →  คุกกี้ `hrs.session` (HMAC-SHA256, อายุ 8 ชม.)  →  /desk?welcome=1
```

| ไฟล์ | หน้าที่ |
|---|---|
| `lib/auth/token.ts` | เซ็น/ตรวจคุกกี้ + ชื่อคุกกี้ + `safeNextPath()` — **ต้องรันบน Edge ได้ ห้าม import `next/headers`** |
| `lib/auth/session.ts` | `getDeskIdentity()` `getMobileIdentity()` `getActorEmployeeId()` (server เท่านั้น) |
| `lib/auth/google.ts` | สร้าง authorize URL + แลก code · `callbackUrl()` ทับได้ด้วย `APP_URL` |
| `lib/auth/identity.ts` | ชนิด `DeskIdentity` / `MobileIdentity` + ค่าสำรอง (import ได้ทั้งสองฝั่ง) |
| `proxy.ts` | ด่าน: `/desk/**` ไม่มี session → เด้งไป `/?next=…` · เขียนข้อมูลผ่าน `/api/**` → 401 |

- **ห้าม import `deskUser` / `currentUser` ในหน้าจออีก** — server ใช้ `getDeskIdentity()` /
  `getMobileIdentity()` · client ใช้ `useDeskIdentity()` (`components/auth/identity-provider.tsx`
  ที่ `app/desk/layout.tsx` ครอบไว้ให้แล้ว)
- **รหัสผู้ทำรายการมาจาก session เท่านั้น** — `getActorEmployeeId()` ใน route ที่อนุมัติ/ปิด/ลบ ·
  ห้ามรับ `reviewerEmployeeId` / `closerEmployeeId` / `deletedByEmployeeId` จาก body กลับมาอีก
- **พาธ callback ถูกบังคับด้วยของที่ลงทะเบียนไว้แล้ว** — client id นี้ใช้ร่วมกับ
  `menaIT/my-app` (NextAuth) ซึ่งลงทะเบียน `http://localhost:3000/api/auth/callback/google`
  และ `http://localhost:4000/api/auth/callback/google` ไว้ (ยิงถาม Google ยืนยันแล้ว 9 ส.ค. 2026)
  จึงใช้พาธเดียวกัน · **อย่าย้ายพาธ** ก่อนเพิ่ม URI ใหม่ใน Google Console ไม่งั้นได้
  `redirect_uri_mismatch` · ตอน deploy ต้องเพิ่มโดเมนจริง + ตั้ง `APP_URL` ให้ตรง
- NCAC ตอบ **403 ถ้าไม่มีบัญชีพนักงานคนนั้นในฐานข้อมูล** (ไม่ได้สร้างให้อัตโนมัติ) และเป็นคน
  บันทึกรูป Google ลง `image_url` ให้เองเฉพาะครั้งแรกที่ล็อกอิน
- ยังไม่ได้ทำ: ไม่ได้ส่ง `Authorization` ไปกับคำขออื่นเลย (JWT ของ NCAC อายุ 30 นาที เก็บไว้ใน
  คุกกี้เฉย ๆ รอวันที่ backend บังคับ) · ไม่มี refresh token · `/m` ยังไม่ถูกกั้น

## Hard rules (breaking these breaks something real)

- **Colors come from tokens only** — never raw `text-white` / `bg-[#…]`, or the dark theme breaks ·
  every new token also needs a dark value in the `[data-theme="hrs-dark"]` block
- **Every input comes from `components/ui/field.tsx`** — never raw `<input>`/`<select>`/`<textarea>`
  (the only exception is the `sr-only` radio/file inputs in the wizard)
- **All business rules live in `lib/case-flow.ts`** · `lib/data.ts` holds data only ·
  all API mapping/derivation lives in `lib/ncac/adapt.ts` — never re-derive in a component
- **Never use `Intl` / `toLocaleDateString`** — use `formatShort`/`formatDate`/`formatDateTime` ·
  `caseAgeDays` counts calendar days, never divide raw timestamps (hydration mismatch)
- **Never put `transform`/`animation` on the desk layout's `<main>`** — it knocks the
  `position: fixed` modal out of place
- **Never remove the `z-60` class on `Select.Content`** — dropdowns would render under the modal
- **Server Components by default** — `"use client"` only where there's state/events, kept minimal ·
  `page.tsx` always stays a server component so it can export `metadata`
- **Pages that read cases need `export const dynamic = "force-dynamic"`** and no `generateStaticParams`
- **The UI must never lie** — a failed save rolls back · a failed API renders `<DataError>`,
  never a blank page
- **Every write goes through `runAction()` in `lib/swal.ts`** — ถาม → ยิง → บอกผล ·
  ห้าม `import Swal` ตรง ๆ ในคอมโพเนนต์ และห้ามยิง `fetch` ไป `/api/**` เองโดยไม่ผ่าน
  `requestJson()` ใน `lib/http.ts` · ผู้เรียกต้องแยก `cancelled` ออกจาก `failed` เสมอ
  (แบบหลังยิงไปแล้วจริง จึงเป็นจุดที่ต้องคืนค่าหน้าจอกลับ)

## Commands

```bash
cp .env.example .env.local   # then fill in API_NCAC_URL before the first run
npm run dev          # dev server
npm run build        # production build + typecheck (must pass before committing)
npx eslint .         # lint (must exit 0)
npx tsc --noEmit     # typecheck alone
```

## Not built yet (don't mistake these for bugs)

- **Reporting a new case from mobile doesn't persist** — the `/m/cases/new` wizard ends at the
  "ส่งเรื่องเรียบร้อย" screen because cases are created in **mena-go**, not NCAC. Needs a create endpoint first.
- **The message thread (`notes`) has no endpoint → always `[]`** · the mobile "ส่งข้อความถึงผู้รับผิดชอบ"
  field can't submit · the desk-side "ตอบกลับ พจส." field **was removed — do not add it back**
- **Auth is built — but `/m` is still open on purpose.** Drivers (พจส.) have no company Google
  account, so `/m` renders the sample driver when there is no session and the logged-in person when
  there is. Only `/desk/**` and write requests are gated (see the auth section below).
- The notification bell's "read" state lives in `localStorage` (คีย์ `hrs.desk.notifications.read`)
  — อยู่ข้ามรีเฟรช/ข้ามแท็บ แต่ผูกกับเครื่อง ไม่ใช่กับผู้ใช้ (NCAC ยังไม่มี endpoint สถานะการอ่าน;
  ตอนนี้มี auth แล้ว ต่อ `employeeId` ท้ายคีย์ได้เลยเมื่อต้องการ)
- Announcements/reports pages temporarily removed (see the box at the top) — to restore, recreate
  `app/desk/reports/page.tsx` and add the menu entry back to `deskNav`
- **`/desk/employee` — photos work; `/openapi.json` just doesn't document them.** `image_url` is
  absent from `UserResponse` *and* `UserUpdate` in the spec, but the live API returns **and**
  accepts it (verified 7 Aug 2026 against `test_id`, then restored to `null`). 144/196 users
  already have one — mostly Google account photos from OAuth login.
  **Trust the live payload over the spec on this API.** There is no hire-date field anywhere,
  so "new hires this month" is impossible.
  Photo editing is built: pencil on the avatar → circular crop (`components/ui/avatar-cropper.tsx`)
  → `PUT /api/employees/[id]/photo` → Spaces (`employees/` folder) → NCAC → **re-reads and
  verifies before reporting success**, then `router.refresh()` re-reads the saved value rather
  than guessing. Keep the verify step — a silent schema change would otherwise show a fake save.
  ⚠️ That route sends every current `UserUpdate` field back alongside `image_url` on purpose, so a
  backend that overwrites the whole row cannot wipe the record. Keep it that way.
  **Inactive staff are excluded entirely** — `getEmployees()` drops every user whose
  `employee_status` is `Inactive` (196 → 139), so every count on the page is active staff only.
  **Removed on the owner's instruction (7 Aug 2026) — do not add back:** the stat-card row on
  `/desk/employee`, every "พ้นสภาพ" / employee-status indicator and filter, and the shine sweep +
  hover glow on the employee badge (design is border-based now, no gloss).
- **ลบคำร้อง — โค้ดครบทั้งสองฝั่งแล้ว รอ deploy NCAC** ถังขยะอยู่คอลัมน์ท้ายตารางใน
  `case-table.tsx` (ขึ้นเฉพาะเคสที่ `canDeleteCase()` ผ่าน) → `DELETE /api/cases/{no}` →
  `DELETE /complaints/{tracking_no}` ซึ่ง**เขียนไว้แล้วใน repo แยก**
  `C:\Users\Lenovo\Desktop\FastAPI\ncacdb\routes\complaint.py` แต่ Render ยังรันโค้ดเก่า (405)
  ทดสอบเต็มสายกับ backend ตัวโลคัลผ่านแล้ว · ระหว่างนี้กดแล้วขึ้นกล่องแดงบอกสาเหตุตรง ๆ
  ไม่ได้แกล้งลบสำเร็จ — รายละเอียดอยู่ใน `.claude/docs/data-layer.md`
- **`deskUser.employeeId` ต้องมีอยู่จริงใน `/users` เสมอ — ห้ามใส่รหัสสมมติ**
  `complaint_logs` มี FK ไป `users.employee_id` รหัสที่ไม่มีจริงทำให้ทั้ง **ลบคำร้อง**
  และ **ปิดคำร้อง** ล้มทั้ง transaction (เดิมเป็น `EMP-1180` ปิดคำร้องจึงพังมาตลอด
  เพิ่งเจอตอนทำปุ่มลบ) · ตอนนี้ชี้ไปที่บัญชีระบบ `HRSVC-DESK` (`employee_status = "System"`
  ล็อกอินไม่ได้ และถูกกรองออกจากสมุดรายชื่อใน `getEmployees()`) ต่อ auth เมื่อไหร่
  ให้มาจากบัญชีที่ล็อกอินจริงแทน
- No Excel export (the legacy system had one — to build it, add `xlsx` and read from `getCases()`)
- Wizard attachments are held as `URL.createObjectURL` in memory and are lost on reload
