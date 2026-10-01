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
| `soft` | `color-mix(primary 13%, #fff)` | Round icon backgrounds, "แจกจ่ายแล้ว" chip, toast, hover |
| `ink` | `#15201d` | Body text, secondary buttons, selected filter chip |
| `mut` | `#5a6b65` | Secondary text, labels, meta |
| `line` | `#d4ded9` | Every border (= `base-300`) |
| `line-strong` | `#b6c4be` | Dividers that must **separate** — under a table head, between groups |
| `canvas` | `#e9eeeb` | Page background (not card background) |
| `head` | `#115e59` (dark `#134e4a`) | Table headers / panel heads — deep teal, **opaque**; tokens flip light inside `.bg-head` (see `globals.css`) |
| `alert` | `#b3261e` | Reject, unread badge, sign out |
| `rose` | `#e11d48` (dark `#fb7185`, on `bg-head` `#fda4af`) | Sunday label/date in the trainee matrix — text only, never a fill |
| `sla` | `#c2410c` | SLA breach, high priority |
| `st-{new,wait,live,done}` + `-ink` + `-line` | — | The 4 case-status chips from the design swatches |
| `ink-content` | `#fff` | Text on `bg-ink` / `bg-alert` / `bg-sla` — **never use raw `text-white`** |
| `ph-avatar` / `ph-thumb` | `#dfe6e3` / `#eaeeec` | Avatar / thumbnail placeholders |
| `series-a` / `series-b` | `#a35a08` / `#0d9488` | The two chart series in `case-volume-chart` |
| `--elev-{card,raise,pop}` | — | The 3 elevation levels — used via the utilities below, never as raw rgba |

### Surface hierarchy (light)

Four levels, and they must stay in this order or a table stops reading top-to-bottom:

```
base-100 #ffffff   ← card / table row
head     #115e59   ← table header band (deep teal, sticky, must be opaque)
canvas   #e9eeeb   ← the page behind the cards
```

`head` is **not** `base-200`. They used to be the same value, which made a hovered row
(`bg-base-200/50`) look like a second header dropped into the middle of the table.
`base-200` stays the generic muted-panel fill; table headers use `bg-head` + `border-line-strong`.

### The `st-*` chip pairs are used in **both** directions

Chips in a row are `bg-st-x text-st-x-ink`; the year calendar and heat map invert them to
`bg-st-x-ink text-st-x` (`driver-work-year.tsx`). So the constraint on these values is the
**contrast of the pair** (≥ 5:1, measured: new 6.3 · wait 5.6 · live 5.9 · done 5.1) — moving
one half without moving the other breaks one direction. Every pair also has a `-line` value
one step darker than the fill, applied by the `chip-*` utilities.

### Utilities that carry the theme (defined at the bottom of `globals.css`)

| Utility | What it is |
|---|---|
| `page-canvas` | The page background for all three shells — dot texture + one faint corner glow. Use instead of `bg-canvas` on a shell wrapper. |
| `elev-card` / `elev-raise` / `elev-pop` | The 3 elevation levels. **Use these instead of writing `shadow-[0_18px_44px_…rgba(21,32,29,…)]`** — raw rgba does not flip for dark mode. |
| `card-lift` | Hover treatment for a clickable card (2px lift + `elev-raise` + primary-tinted border). |
| `chip` + `chip-{new,wait,live,done,alert,on}` | The status-badge template. `chip` is the shape; the tone classes only set `--chip-bg` / `--chip-ink` / `--chip-line`, so class order never matters. `chip-on` is the one solid-fill tone, for the status that must be found first. |

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

**Every new token must also get a dark value in that block** — including the `--elev-*`
shadows, which are pure black on dark (the light theme's ink is a light color there, so
reusing it would paint a glow instead of a shadow). Never hardcode colors
(`text-white`, `bg-[#…]`) in a component — they won't follow the theme.

The `@media print` block at the very bottom pins a light palette for paper, so **a new
color token that appears on the candidate report needs a third value there too.**

Theme switching lives in `components/ui/theme-toggle.tsx` — writes `data-theme` on `<html>`,
persists to `localStorage["hrs-theme"]`. `app/layout.tsx` has an inline script that reads it
before first paint. **The button's icon and label are driven by CSS reading `[data-theme]`**,
not React state, so there's no hydration mismatch — if you add anything theme-dependent to this
button, do it the same way. Do not switch it to `useState`.

## UI rules

- **Server Components by default.** Add `"use client"` only for components with state / events /
  `usePathname`, and keep them as small as possible. `page.tsx` always stays a server component
  so it can export `metadata`, then renders a client child.
- **Font sizes come from the project's own scale, never a raw `text-[13.5px]`.** The token
  name *is* the design's px value — `text-13-5` = 13.5px, `text-12-5` = 12.5px — so the
  half-pixel steps the source design uses are preserved exactly. Do not "round" them to
  Tailwind's `text-sm` / `text-base` scale.
- Every one of those tokens is `calc(<design px> * var(--ui-text-scale))`, and the multiplier
  steps up on wide screens (1 → 1.04 at 80rem → 1.08 at 100rem → 1.12 at 120rem), so text
  grows on a large monitor while staying exactly on-design on a laptop. **To add a size, add
  a `--text-<px>` token to that block** rather than writing an arbitrary value in a component.
  `--spacing` is deliberately *not* scaled — see the comment on the block for why.
- The two font sizes in `survey-charts.tsx` are SVG user units inside a `viewBox`, not screen
  pixels, and must stay arbitrary values.
- **Spacing/colors use tokens, not hex** — except the two design colors `#dfe6e3`
  (avatar placeholder) and `#eaeeec` (thumbnail placeholder).
- **Every interactive element must be genuinely tappable** — ≥ 36px, with hover/active states.
  Focus rings come from `:focus-visible` in `@layer base`; don't re-declare them.
- **Decorative icons get `aria-hidden`**; icon-only buttons need `aria-label`.
- Long Thai text gets `text-pretty`.
- `animate-rise` is for screen/main mount only — don't put it on every element.
- `prefers-reduced-motion` is already handled centrally in `globals.css`.
- **Summary + toolbar card above a table** is `components/ui/summary-panel.tsx`
  (`SummaryPanel` → `SummaryStats`/`SummaryStat` → `SummaryToolbar` → `SummaryStrip`, plus
  `SegmentedControl` for single-choice filters). Used by resign reasons, the พจส. registry and
  the candidates table — build new summary strips from it, don't write another stat-card set.

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
