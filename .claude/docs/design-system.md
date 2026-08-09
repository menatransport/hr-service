# Design system — tokens, themes, UI rules, charts

> Read when: touching color/font/spacing, adding a token, dark mode, writing a new component, charts.

## Design tokens

Declared once in `app/globals.css`, two blocks:

1. `@plugin "daisyui/theme" { name: "hrs" }` — daisyUI semantic slots
   (`primary` = `#0f766e`, `base-100/200/300`, `radius-box` = 12px, `--depth: 0`)
2. `@theme { ... }` — raw tokens daisyUI has no slot for

| Token | Value | Use for |
|---|---|---|
| `primary` | `#0f766e` | Primary buttons, icons, active state, completed timeline steps |
| `soft` | `color-mix(primary 11%, #fff)` | Round icon backgrounds, "แจกจ่ายแล้ว" chip, toast, hover |
| `ink` | `#15201d` | Body text, secondary buttons, selected filter chip |
| `mut` | `#65756f` | Secondary text, labels, meta |
| `line` | `#e2e6e3` | Every border (= `base-300`) |
| `canvas` | `#eef0ed` | Page background (not card background) |
| `alert` | `#b3261e` | Reject, unread badge, sign out |
| `sla` | `#c2410c` | SLA breach, high priority |
| `st-{new,wait,live,done}` + `-ink` | — | The 4 case-status chips from the design swatches |
| `ink-content` | `#fff` | Text on `bg-ink` / `bg-alert` / `bg-sla` — **never use raw `text-white`** |
| `ph-avatar` / `ph-thumb` | `#dfe6e3` / `#eaeeec` | Avatar / thumbnail placeholders |
| `series-a` / `series-b` | `#a35a08` / `#0d9488` | The two chart series in `case-volume-chart` |

## Dark theme `hrs-dark`

`hrs` (light) is **always the default** — it matches the source design, which has no dark mode.
`hrs-dark` is opt-in via the topbar button only (deliberately NOT tied to `prefers-color-scheme`,
so users who didn't choose it never see something off-design).

Declared in two places in `app/globals.css`:

1. `@plugin "daisyui/theme" { name: "hrs-dark" }` — semantic slots
   (`primary` = `#14b8a6`, because `#0f766e` is too dark to read on a dark surface)
2. A `[data-theme="hrs-dark"]` block — dark values for every raw token above.
   Placed **outside `@layer`** on purpose: Tailwind leaves `@theme` inside `@layer theme`,
   so unlayered always wins without needing `!`.

**Every new token must also get a dark value in that block.** Never hardcode colors
(`text-white`, `bg-[#…]`) in a component — they won't follow the theme.

Theme switching lives in `components/ui/theme-toggle.tsx` — writes `data-theme` on `<html>`,
persists to `localStorage["hrs-theme"]`. `app/layout.tsx` has an inline script that reads it
before first paint. **The button's icon and label are driven by CSS reading `[data-theme]`**,
not React state, so there's no hydration mismatch — if you add anything theme-dependent to this
button, do it the same way. Do not switch it to `useState`.

## UI rules

- **Server Components by default.** Add `"use client"` only for components with state / events /
  `usePathname`, and keep them as small as possible. `page.tsx` always stays a server component
  so it can export `metadata`, then renders a client child.
- **Font sizes come straight from the design** (`text-[13.5px]`, `text-[12.5px]`) — the source
  design uses half-pixels. Do not "round" them to Tailwind's scale.
- **Spacing/colors use tokens, not hex** — except the two design colors `#dfe6e3`
  (avatar placeholder) and `#eaeeec` (thumbnail placeholder).
- **Every interactive element must be genuinely tappable** — ≥ 36px, with hover/active states.
  Focus rings come from `:focus-visible` in `@layer base`; don't re-declare them.
- **Decorative icons get `aria-hidden`**; icon-only buttons need `aria-label`.
- Long Thai text gets `text-pretty`.
- `animate-rise` is for screen/main mount only — don't put it on every element.
- `prefers-reduced-motion` is already handled centrally in `globals.css`.

## Alerts / confirmations — SweetAlert2

ทุกกล่องที่เด้งขึ้นมา **ต้องเรียกผ่าน `lib/swal.ts` เท่านั้น** — ห้าม `import Swal` ในคอมโพเนนต์
(สีปุ่ม/ธีมมืด/ระยะขอบจะหลุดจากดีไซน์ทันที)

| ฟังก์ชัน | ใช้เมื่อ |
|---|---|
| `toastSuccess` / `toastError` / `toastInfo` | บอกผลที่ผู้ใช้เห็นการเปลี่ยนแปลงบนจอตามอยู่แล้ว — ขนมปังปิ้งมุมขวาบน หายเอง 3.2 วิ (ค้างเมื่อเอาเมาส์ไปวาง) |
| `alertSuccess` / `alertError` / `alertWarning` | เรื่องที่พลาดไม่ได้ — กล่องกลางจอ ต้องกดรับทราบ |
| `confirm({ title, text \| html, tone })` | ถามก่อนยิง คืน `boolean` |
| `runAction({ confirm, pending, success, run })` | **ท่ามาตรฐาน** ถาม → ยิง → บอกผล คืน `ActionOutcome` |

- โทน (`tone`) มี `primary` `danger` `warn` `info` — คุมทั้งไอคอนและสีปุ่มยืนยัน ·
  `danger`/`warn` โฟกัสไปที่ปุ่ม “ยกเลิก” ให้เอง
- ข้อความจากผู้ใช้/จาก API ที่จะไปอยู่ในช่อง `html` **ต้องผ่าน `escapeHtml()` เสมอ**
- คลาสช่วยจัดในช่อง `html`: `hrs-swal-list` (รายการช่องที่จะบันทึก) · `hrs-swal-quote` (ทวนข้อความที่พิมพ์ไว้)
- `busy` ของหน้าจอให้ยกขึ้นเฉพาะ**ช่วงที่ยิงจริง** (ใน `run`) ไม่ใช่ตั้งแต่เปิดกล่องถาม —
  ไม่งั้นฟอร์มจะขึ้น “กำลังบันทึก…” ทั้งที่ผู้ใช้ยังไม่ได้กดยืนยัน

**สีทั้งหมดมาจาก token ผ่าน CSS ไม่ใช่ผ่าน option ของไลบรารี** — บล็อก `.swal2-*` ท้าย
`app/globals.css` (อยู่นอก `@layer` และต้องอยู่หลัง `@import "sweetalert2/…"` เสมอ เพราะ
specificity เท่ากัน ชนะกันด้วยลำดับล้วน ๆ) ธีมมืดจึงตามไปเองโดยไม่ต้องอ่าน `data-theme` ใน JS
ถ้าเพิ่มไอคอนใหม่ อย่าลืมสามชิ้น `swal2-success-circular-line-*` / `-fix` ที่ไลบรารีตั้งเป็น
`#fff` ตายตัว — ไม่ทับแล้วธีมมืดจะเห็นแถบขาวพาดกลางไอคอน

## Charts / data viz

`components/desk/case-volume-chart.tsx` uses a 2-slot categorical palette via the `series-a`
(newly opened) / `series-b` (closed) tokens — **one pair per theme, both passing all 6
validation checks** (lightness band, chroma floor, CVD ΔE, normal-vision ΔE, contrast).

| Theme | Pair | Background | deutan / tritan / normal ΔE |
|---|---|---|---|
| `hrs` | `#a35a08` / `#0d9488` | `#ffffff` | 13.6 / 25.1 / 21.2 |
| `hrs-dark` | `#e0913f` / `#2fc7b4` | `#161c1b` | 14.0 / 27.5 / 22.5 |

**Never change these colors without re-validating against the actual background they sit on.**
Rules that must hold:

- Single y-axis, baseline always starts at 0, never dual-axis
- Legend always present + direct label on the latest month only (never label every bar)
- A table view alternative is required (the "ดูเป็นตาราง" button)
- Light grid/axis (`border-line/60`), 4px rounded bar caps, 2px gap between bars
- Text uses ink/mut colors, never the series colors

`reason-bars.tsx` and the per-department bars on the reports page are single-series → use
`primary` alone, no legend needed, and every bar may be labeled.
(Neither component has a page using it right now — the reports page is temporarily removed.)
