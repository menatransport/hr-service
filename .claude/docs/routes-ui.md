# Routes · desk shell · case page & modal

> Read when: adding/changing a page, touching a layout, `case-modal.tsx`, sidebar, notifications.

```
/                        Login — Google sign-in (company domain)  ← `HR Service Login Wireframe` 1b
/home                    Home — โครง Home ของ menaIT V.2 (Assistant-first / App Launcher) โทน teal
/desk                    → redirect ไป /home (next.config.ts · บุ๊กมาร์กเก่า)
/desk/…                  หน้าในของ HR (เชลล์ `(module)` — แถบบน + แถบข้างของโมดูล)
/recruitment/…           Public job-application flow
/recruitment/admin/…     Mass Recruitment back office (own shell — `app/recruitment/admin/layout.tsx`)
```

## `/recruitment/admin` — menu ↔ route map

Menu items live in `adminNav` (`app/recruitment/_lib/admin-nav.ts`) and are read by **both**
the sidebar (client) and the module cards on the hub page (server) — edit once, both follow.

| Menu | Route |
|---|---|
| หน้าหลัก | `/recruitment/admin` |
| **ขอสรรหาและผู้สมัคร** | `/recruitment/admin/requisitions` — **two tabs in one page**, see below |
| ติดตามฝึกงาน | `/recruitment/admin/trainees` |
| คลังคำถาม | `/recruitment/admin/questions` |
| ทะเบียนประวัติ พจส. | `/recruitment/admin/drivers` |

### Requisitions + candidates are one page, two tabs (22 Sep 2026)

`ผู้สมัคร` used to be its own menu entry. It is now the second tab of the requisitions
page, because every real question spans both tables (*is this vacancy filled yet?* /
*which vacancy is this person taking?*).

```
/recruitment/admin/requisitions                      → tab คำขอสรรหา (default)
/recruitment/admin/requisitions?tab=candidates       → tab ผู้สมัคร
/recruitment/admin/requisitions?tab=candidates&ref=  → …filtered to that application
/recruitment/admin/candidates[?ref=]                 → redirect() to the line above
```

- **Do not delete `app/recruitment/admin/candidates/page.tsx`** — it is a `redirect()` that
  keeps old bookmarks and the hub's queue links (`?ref=`) working.
- The active tab is written back to the URL with `window.history.replaceState`, **never
  `router.push`** — the page is `force-dynamic`, so a push would re-read Mongo just to
  switch tabs.
- Both tabs' data is fetched together in the server page (`Promise.all` × 4) and held by
  `recruitment-tabs.tsx`; the two table components are controlled on their `rows`.
- Full rationale and the rules that must not be re-litigated: `.claude/docs/requisitions.md`,
  section “สองแท็บใต้หัวเดียว”.

Both admin tables (requisitions and candidates) use **one column-header component**,
`components/ui/column-menu.tsx` — `sheet-column.tsx` is gone. It calls `useOverlayCount()`,
so the first Esc closes only the column menu and never punches through to a modal behind it.

> The driver mobile app (`/m/…`, wireframe 1a + 1b) was removed on the owner's instruction
> (10 Aug 2026) — `app/m/**` and `components/m/**` are gone, along with `buildServices()`,
> `currentUser`, `MobileIdentity` / `getMobileIdentity()` and `getCasesByDriver()`.
> **Don't add them back** without being asked.

Case pages use `trackingNo` as the route param, e.g. `/desk/cases/DC-2026-0142`.

## `/home` — Home แบบโมดูล → แถบข้างของโมดูล

```
app/desk/layout.tsx            ตัวตน + toast ต้อนรับเท่านั้น (ห้ามมี loading.tsx ระดับนี้)
app/home/                     ตัวตน + toast ต้อนรับ (layout) · loading ของ Home เอง
app/home/page.tsx              Home — เดสก์ท็อป: ฮีโร่ + น้องมีนา + ค้นหาเมนู (Ctrl K) + ชิปทางลัด + 3 คอลัมน์กลุ่ม (พอดีหนึ่งจอ)
                               มือถือ: App Launcher (แท็บกลุ่ม + ไอคอนแอป 4 คอลัมน์)
app/desk/(module)/layout.tsx   `AppShell` (components/shell/) — ใช้ตัวเดียวกันใน /recruitment/admin และ /payroll
app/desk/(module)/cases        คิวคำร้อง (เดิมอยู่ที่ `/desk`) · `?manage=type|cause` เปิดกล่อง master
app/desk/(module)/record-cases `?manage=categories` เปิดกล่องประเภทเคส
```

- **กลุ่มงานและ menulist อยู่ที่ `lib/modules.ts` ที่เดียว** — Home กับแถบข้างอ่านจากชุดเดียวกัน
  (`deskNav` ใน `lib/data.ts` เหลือเป็นเมนูสำรองของหน้าที่ไม่อยู่ในกลุ่มใด)
- แถบข้างคือ `components/module/module-nav.tsx` ใช้ในทั้งสามเชลล์ (`/desk` · `/recruitment/admin`
  · `/payroll`) — หาจาก URL ว่าหน้านี้อยู่กลุ่มไหน (`findModule`) แล้ววาด menulist ของกลุ่มนั้น ·
  ไม่ตรงกลุ่มใด → เมนูเดิมของระบบนั้น · **ไม่มีหัวข้อพับ “เมนูทั้งหมดของ…” แล้ว** (ถอดออก 10 ต.ค. 2569)
- **Subgroup** = `children` ของเมนู (ซ้อนชั้นเดียว) เช่น Pay Roll → ภาพรวมรอบจ่าย · รับข้อมูล — หัวข้อเป็นปุ่ม
  พับ/กาง ไม่ใช่ลิงก์ · `findModule` คืน `child` ด้วย (แถบบนโชว์ชื่อลูก) · แถบข้างกางเองเมื่ออยู่ในหน้าลูก ·
  Home เดสก์ท็อปเป็น accordion (กางไว้ก่อน) · มือถือแตะแล้วกางแผ่นล่าง · ค้นหาแตกเป็นลูกแต่ละตัว
  · เมนูลูกของ Pay Roll ต้องตรงกับ `lib/payroll/nav.ts` — เพิ่มเมนูค่าจ้างต้องเพิ่มทั้งสองที่
- **เมนู → แถบข้าง เป็น view transition ของ React** (`<ViewTransition name="menu-<id>" share="menu-morph">`)
  การ์ดบน Home กับแถวในแถบข้างใช้ชื่อเดียวกัน · **ชื่อห้ามซ้ำในหน้า** — แถบข้างเดสก์ท็อปเท่านั้นที่ส่ง
  `morph` (ดรอปดาวน์มือถือไม่ส่ง) และ Home ไม่วาดแผงกลุ่มซ้อนกับผลค้นหา
- ต้องให้แถบข้างขึ้นใน **คอมมิตเดียวกับการเปลี่ยนหน้า** เมนูถึงจะบินได้ — `loading.tsx` จึงอยู่ใต้เชลล์
  (`(module)/loading.tsx`) ไม่ใช่ที่ `app/desk/` · ไม่รองรับ View Transitions (Firefox เก่า) = เปลี่ยนหน้าปกติ
- **`AppShell` = เชลล์ทั้งระบบ สไตล์ menaIT V.2 โทน teal** — พื้นไล่สีนิ่ง (ไม่มีเส้นทาง/ดวงไฟเคลื่อนไหว) ·
  เนื้อหาเต็มความกว้างจอ ขอบ 8–12px · แถบข้างแบบ A “Quiet list” จาก Claude Design `MenaHR Sidebar — Minimal`
  (https://claude.ai/artifact/MMDPpkT9qvMRQuc4dFRNfc) — 200px ย่อเป็นไอคอน 56px ได้ (ปุ่มข้างชื่อกลุ่ม ·
  `ShellSidebar` จำในคุกกี้ `hrs.sidebar` เซิร์ฟเวอร์อ่านตอนวาด ไม่กระพริบ) · แถวไม่มีพื้น ไอคอนเทา ·
  สีกลุ่มขึ้นแค่จุดหน้าชื่อกลุ่ม + พื้นอ่อนของแถวที่เปิดอยู่ · กลุ่มอื่นเป็นลิงก์ตัวเล็กใต้เส้นคั่น ·
  แถบบนติดหัวจอ สูง 56px (← หน้าหลัก · ที่อยู่ `กลุ่ม / เมนู` ชิดซ้ายจาก `findModule` · `UserMenu compact` แบบ app launcher ที่มี
  ทุกเมนูของทุกกลุ่ม + สลับธีม + ออกจากระบบ) · เนื้อหาบนแผ่นโค้งมนพื้น `canvas`
  · จอเล็กแถบข้างย้ายเป็นลิ้นชัก (portal) · ระยะของแถบบนคือ `--shell-header-h` — ของที่ติดหัวจอใน
  หน้าเดิมให้ใช้ `top-(--shell-header-h)` ไม่ใช่ `top-14`
- ลิงก์ “← หน้าหลัก” บนแถบบนพากลับ `/home?m=<กลุ่ม>` (มือถือเปิดแท็บกลุ่มเดิมไว้)
- แถบเลื่อนทั้งระบบบาง สีหมึกจาง (`@layer base` ใน globals.css) · แถบเลื่อนของหน้าในเชลล์กลืนกับพื้น teal

The sidebar is hidden below `lg` and moves into a topbar dropdown (`DeskNavList`).

Topbar right side, in order: **theme toggle** · **notification bell** · user.

Notifications come from `lib/notifications.ts`, which **derives them from real cases** rather than
storing them separately — sorted by urgency: SLA breached → awaiting my approval → unassigned
(one case can match several conditions; only the most urgent is kept). Change the conditions in
`buildNotifications()` only. The "read" state lives in local state and hits no API, unlike every
other button in the system.

## Case page — the intended order (do not reshuffle)

The case page follows the questions in the user's head:

1. **What is this?** — tracking number, status, priority, SLA, subject, reporter
2. **Where is it now?** — `<CaseStepper>` full width, **always before the form**
3. **What do I do?** — the "สิ่งที่ต้องทำตอนนี้" bar, then the form

`components/ui/case-stepper.tsx` renders two ways: horizontal 5 steps on ≥md, falling back to the
vertical `CaseTimeline` on small screens, hidden via `display:none` — so there's no duplicated text
in the accessibility tree. Change progress UI here and nowhere else.

## The desk case page is a modal

`/desk/cases/[trackingNo]` renders **the same case table behind it** (`CaseListView`, the one
`/desk/cases` uses) and opens `components/desk/case-modal.tsx` on top — so opening from the table or
hitting the URL directly behave identically, without intercepting routes.

`CaseModal` is the single client component that owns everything; a 3-layer flex column:

| Layer | Content |
|---|---|
| header (`flex-none`) | Tracking number, status, priority, SLA, subject + close button |
| body (`flex-1 overflow-y-auto`) | `CaseStepper compact` (with `note` showing the next task, top right) → **exactly 2 blocks** |
| footer (`flex-none`) | Current status + **all save and decision buttons** |

It handles Esc to close, locks `body` scroll, focuses the container with `preventScroll` and resets
the body's `scrollTop`, closes on backdrop click, and does `router.push("/desk/cases")` on close.

**The modal body has exactly 2 blocks — do not add a third:**

1. **Case details from พจส.** (left column, 330px) — reporter, department, issue group, reported at,
   responsible department · the message พจส. wrote · attachments · the message thread.
   The whole block is read-only.
2. **Data entry** (right column, flexible) — issue type · root cause · action plan · outcome ·
   damage cost · both approver levels + review results.

   **There is no "ปัญหาที่พบ / ปัญหาที่ตรวจสอบแล้วจริง" field** (NCAC's `problem`) — the owner
   confirmed that question is already answered by **issue type**, so the PIC shouldn't type it twice.
   The `problem` field still exists in `lib/types.ts` / `adapt.ts` / the `PATCH` route in case it's
   re-enabled.

**Previously present, now removed — do not add back:** the duplicate case-info table (reported at /
last updated / case age as separate cards), a separate attachments card, a separate chat card, the
big "สิ่งที่ต้องทำตอนนี้" box, numbered 1–3 step headers, splitting the form into 3 cards, the
**"ตอบกลับ พจส." field + send button**, and the **"ปัญหาที่ตรวจสอบแล้วจริง" field** — all
condensed on the owner's instruction.

**Form rules — do not change without asking:**

- **No per-section expand/collapse or edit buttons.** Every field is visible and editable
  immediately if the status allows it.
- **There is exactly one save button** — "บันทึก" in the footer. It saves every field at once, is
  disabled when nothing changed, and the footer shows "ยังไม่ได้บันทึก N รายการ".
  **Never add save buttons to sub-blocks.**
- Approve / reject / close buttons live in that same footer · pressing one reveals a remark field
  in the footer (mandatory before confirming).
- The stepper's `note` (`TodoNote`) is **a single line** stating what's next — never expand it into a box.
- Keep each field's `hint` as short as possible, or drop it if the label is already clear ·
  `placeholder` should be a realistic example.
- Optional fields get `optional`, which appends "ไม่บังคับ" to the label.

**Department assignment is not in the modal** — it happens in the table's "ผู้รับผิดชอบ" column
(`DeptCell` in `case-table.tsx`): unassigned cases show a dashed `+ มอบหมาย` chip; assigned ones
show a borderless `select` that reveals its border on hover. On selection the row optimistically
moves to `assigned` while the API call is in flight · success is announced via `role="status"` ·
**failure must roll the value back** and raise `role="alert"` — never let the screen lie about
having saved.

State works by diffing `draft` against `saved`, with a real `PATCH` on save
(see `.claude/docs/data-layer.md`, "Writes are live") — every field in the modal writes for real.

> ⚠️ **Never put `transform` / `animation` on the desk layout's `<main>`.**
> It would become the containing block for `position: fixed`, knocking the modal out of place
> (this happened with `animate-rise` — the modal shifted right and overflowed the bottom of the
> screen). Put entrance animations on the page content instead, e.g. on `CaseListView`.
