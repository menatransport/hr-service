# Routes · mobile shell · desk shell · case page & modal

> Read when: adding/changing a page, touching a layout, `case-modal.tsx`, bottom tabs, sidebar, notifications.

```
/                        Login — Google sign-in (company domain)  ← `HR Service Login Wireframe` 1b
/m/…                     Driver app (mobile)        ← wireframe 1a + 1b
/desk/…                  HR Service Desk (desktop)  ← wireframe 1c
```

## `/m` — mobile app shell

`app/m/layout.tsx` is a full-height flex column (`h-dvh`, `md:h-[820px]` inside a 420px-wide
device frame on large screens). Each page **must** render its own `<Screen>` (the shell's single
scroll area) and **may** append a `<footer>` as a sibling.

```tsx
// pushed-screen pattern
<>
  <ScreenHeader title="…" backHref="/m/services" />
  <Screen className="flex flex-col gap-4 px-5 pt-4 pb-6">…</Screen>
  <footer className="flex-none border-t border-line px-5 pt-3.5 pb-safe md:pb-5">…</footer>
</>
```

`BottomTabs` hides itself on `/m/cases/<anything>` (see `hideOn` in
`components/m/bottom-tabs.tsx`) — **if you add a page that shouldn't have tabs, edit that regex**
rather than building a nested layout.

Case pages use `trackingNo` as the route param, e.g. `/m/cases/DC-2026-0142`.

## `/desk` — sidebar shell

A full-width `h-14` topbar, with `[sidebar | main]` below it, per wireframe 1c. The sidebar is
hidden below `lg` and moves into a topbar dropdown (same list via `DeskNavList`). Menu items live
in `deskNav` in `lib/data.ts`.

Topbar right side, in order: mobile view · **theme toggle** · **notification bell** · user.

Notifications come from `lib/notifications.ts`, which **derives them from real cases** rather than
storing them separately — sorted by urgency: SLA breached → awaiting my approval → unassigned
(one case can match several conditions; only the most urgent is kept). Change the conditions in
`buildNotifications()` only. The "read" state lives in local state and hits no API, unlike every
other button in the system.

## Case page — the intended order (do not reshuffle)

Both case pages follow the questions in the user's head:

1. **What is this?** — tracking number, status, priority, SLA, subject, reporter
2. **Where is it now?** — `<CaseStepper>` full width, **always before the form**
3. **What do I do?** — the "สิ่งที่ต้องทำตอนนี้" bar, then the form

`components/ui/case-stepper.tsx` renders two ways: horizontal 5 steps on ≥md, falling back to the
vertical `CaseTimeline` on small screens, hidden via `display:none` — so there's no duplicated text
in the accessibility tree. Change progress UI here and nowhere else.

## The desk case page is a modal

`/desk/cases/[trackingNo]` renders **the same case table behind it** (`CaseListView`, the one
`/desk` uses) and opens `components/desk/case-modal.tsx` on top — so opening from the table or
hitting the URL directly behave identically, without intercepting routes.

`CaseModal` is the single client component that owns everything; a 3-layer flex column:

| Layer | Content |
|---|---|
| header (`flex-none`) | Tracking number, status, priority, SLA, subject + close button |
| body (`flex-1 overflow-y-auto`) | `CaseStepper compact` (with `note` showing the next task, top right) → **exactly 2 blocks** |
| footer (`flex-none`) | Current status + **all save and decision buttons** |

It handles Esc to close, locks `body` scroll, focuses the container with `preventScroll` and resets
the body's `scrollTop`, closes on backdrop click, and does `router.push("/desk")` on close.

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
