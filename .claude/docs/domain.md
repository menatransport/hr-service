# Domain model — case lifecycle

> Read when: touching case status, roles/permissions, form lock rules, SLA, timeline, reference data.

All rule logic lives in **`lib/case-flow.ts`** and nowhere else (`lib/data.ts` holds data only).

```
driver reports ──► open ──► assigned ──► pending_review ──► ready_to_close ──► closed
                     │          │              │
             ERZONE assigns PIC │        manager approves (2 levels)
                            PIC fills     (reject → back to assigned)
                            action plan
```

| Status | Thai label (`label`) | Short (`short`) | Chip |
|---|---|---|---|
| `open` | เปิดเคส | เปิดเคส | `st-new` |
| `assigned` | มอบผู้รับผิดชอบแล้ว | มอบหมายแล้ว | `st-live` |
| `pending_review` | รออนุมัติ | รออนุมัติ | `st-wait` |
| `ready_to_close` | รอปิดเคส | รอปิดเคส | solid `primary` |
| `closed` | ปิดเคสแล้ว | ปิดแล้ว | `st-done` |

`short` is used in tables and cards where space is tight (`<StatusBadge short />`). Edit labels in
`statusMeta` in `lib/case-flow.ts` only.

The design ships 4 chip styles but the system has 5 statuses → the 5th uses solid `primary`
(same as the primary button). **No new colors outside the design system.**

## Roles

| Role | Responsibility |
|---|---|
| **Driver** | Reports issues via the mobile app, tracks status |
| **ERZONE** | Triage, assigns the PIC — if no matching PIC exists, routes to the EZONE team |
| **PIC** | Fills in problem, root cause, action plan, outcome, then submits for approval |
| **Manager** | Approves / rejects the action plan (2 levels, a remark is mandatory every time) |

## Form lock rules (carried over from the legacy system)

`canEditSection(section, caseStatus, userDepartmentId, caseDepartmentId)` in `lib/case-flow.ts`

| Section | Displayed as | Editable when status is | Needs a PIC assigned |
|---|---|---|---|
| `classification` | มอบผู้รับผิดชอบ | `open` | no |
| `actionPlan` | กรอกรายละเอียดและแผนแก้ไข | `assigned` | **yes** |
| `approval` | กำหนดผู้อนุมัติ | `assigned` | **yes** |

**Hard gate (checked first, no exceptions):** a case with `departmentId === null` locks `actionPlan`
and `approval` outright — the plan belongs to the PIC, and `complaintType` options are derived from
the department, so there is nothing to pick yet. In `case-modal.tsx` this makes the whole
"กรอกข้อมูลแผนดำเนินการ" card read-only with a `รอมอบหมายหน่วยงาน` badge.

**Exception (applies only after that gate):** users in HR/ER (`departmentId === "24"`) can edit at
any status except `closed`. The sample `deskUser` belongs to that department — to see the locked
state, open a closed case or one that has not been assigned yet.

## Reference data (carried over in full from the legacy system)

- `departments` — 7 PIC departments, `id` matches the legacy `department_id`
- `complaintTypesByDepartment` — sub-types per PIC
- `reasonGroups` — 6-group root-cause tree (PAY / OPS / VEH / SAF / MGT / OTH), used in three
  places: the driver picks a **group** when reporting · the PIC picks a **leaf** as root cause ·
  `lib/ncac/adapt.ts` maps a root cause back to its group
- Approvers come from NCAC `/users`, filtered to level ≥ 4 in `getEligibleApprovers()` (`lib/cases.ts`)

## Time and SLA

`caseAgeDays` counts **Thai calendar days** (both sides converted to a day number before
subtracting), not hours ÷ 24 — so the value is stable all day and SSR always matches hydration.
**Never revert to dividing raw timestamps**: the value would shift every second → hydration mismatch.

Dates are formatted with `formatShort` / `formatDate` / `formatDateTime`, which add +7 hours
themselves and carry Thai month names as an array — **never use `Intl` / `toLocaleDateString`**,
whose output depends on the rendering machine's timezone.

SLA is derived from `caseAgeDays` against a per-priority threshold (high 2 days / medium 5 / low 10)
in `isSlaBreached`.

## The timeline is computed, not stored

`buildTimeline(hrCase)` builds all 5 steps from `status` + `reviews`. Add or change steps in that
one function — no need to edit individual case records.
