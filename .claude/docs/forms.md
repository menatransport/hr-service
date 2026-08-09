# Forms — everything lives in `components/ui/field.tsx`

> Read when: adding/changing any input, touching a dropdown, touching the in-dropdown search box.

Every input in the system comes from this one file. **Never write raw `<input>` / `<select>` /
`<textarea>` anywhere else** (the only exception is the `sr-only` radio/file inputs in the wizard).

| Export | Use for |
|---|---|
| `TextField` | Single-line text · omit `value/onChange` for uncontrolled |
| `TextareaField` | Multi-line text (`rows`, `resize`) |
| `NumberField` | Numbers |
| `SelectField` | Dropdown with label/hint — use inside forms |
| `Select` | Bare dropdown, no label — use in tables / filter bars |
| `SearchField` | Search input (icon + clear button) · `tone="filled"` for grey backgrounds |
| `ReadOnlyValue` | Read-only value |

`ImageUploadField` (own file) uploads on pick via `POST /api/uploads`. **JPG / PNG only — no WebP**,
enforced in three places that must stay in sync: `accept`, `isAcceptedImage`, and `ALLOWED_TYPES` in
the route. `lib/image-resize.ts` shrinks anything over 600 KB to a max 1600 px edge / JPEG q0.82
before it leaves the browser, and silently returns the original if the browser can't decode it.

Shared props on every field: `id` `label` `hint` `optional` `readOnly` `srLabel` `labelRight`
`className`, plus **`size`** — `md` (desk side, default) / `lg` (taller mobile form fields).

**Required is the default.** A label with no `optional` renders a red `*` (`text-alert`) and the
control gets `aria-required`; `optional` removes both and prints nothing in its place — required is
the only state that gets marked. So mark every genuinely-optional field `optional`, because leaving
it off is what claims the field is required. `srLabel` fields never show the `*` (no visible label
to hang it on) but still get `aria-required`.
Bare `Select` (no `Frame`) takes `required` on its own for the same `aria-required`.

`Select` has 4 `variant`s: `field` (in forms) · `ghost` (in tables, borderless until hover) ·
`dashed` (the "+ มอบหมาย" chip when empty) · `bare` (already inside another container).

## Dropdown gotchas

- **Empty value means "not selected"** — Radix forbids an option with `value=""`. If you need a
  "none / unassigned" option, use a sentinel like `UNASSIGNED = "none"` in `case-table.tsx`.
- **`clearable` adds a "ล้างค่าที่เลือก" row at the bottom of the list** (plus `Backspace`/`Delete`
  on the focused trigger, since Radix gives `Tab` to closing and the row can't be reached by keyboard).
  It sets the value back to `""`. Deliberately **not** an × on the trigger — that crowds the text and
  gets hit by accident when the intent was to open the list. The row is a plain `<button>`, never a
  `Select.Item` (Radix forbids `value=""`, and arrow keys shouldn't stop on it).
  Only put `clearable` on fields the upstream can actually erase: `complaintType` / `rootCause`
  qualify (`PATCH` sends `null`, NCAC accepts it); **approvers do not** — NCAC only has
  `define-reviewer`, so a cleared approver would be dropped silently on save.
- **`Select.Root` gets `value={value}`, never `value || undefined`.** `undefined` puts Radix in
  uncontrolled mode, where it falls back to the value it remembers internally — the trigger keeps
  showing the old label after a clear even though our state is already `""`. Radix treats `""` as
  "nothing selected" and renders the placeholder (with `data-placeholder`) correctly.
- **Options that depend on another field must drop stale values themselves.** The complaint types
  come from the case's department, so `case-modal.tsx` runs `typeFitsDepartment()` inside `draftOf`:
  reassigning the department blanks the field (with a hint saying why) instead of leaving a value the
  dropdown can't label.
- **Never remove the `z-60` class on `Select.Content`** — Radix copies the content's z-index onto
  its outer wrapper as an inline style. Without it, the list renders **underneath** the /desk modal.
- On screens <sm the list becomes a **bottom sheet** via the `[data-hrs-dropdown]` rule in
  `globals.css`, which targets Radix's outer wrapper using `:has()` + `!important` (the only way
  to control that element, since Radix writes its position as an inline style).

## In-dropdown search box

Dropdowns with **10+ options** (`SEARCH_THRESHOLD` in `field.tsx`) automatically grow a search box
at the top of the list — so the 34 root causes and ~39 approvers get one for free, while the
9-option department filter does not. Force it on/off with the `searchable` prop; change its copy
with `searchPlaceholder`.

Radix Select was never designed to hold a text input. These four details must not be touched:

- **Radix typeahead** consumes every keystroke → `SearchBox` calls `stopPropagation` on all keys
  except `ArrowDown/ArrowUp/Escape/Tab`, which Radix still needs for list navigation and closing.
  (`Enter` selects the first matching result itself.)
- **The trigger label** is passed as children of `Select.Value` rather than letting Radix pull it
  from the selected `Item` — otherwise the value vanishes the moment the query filters that `Item` out.
- **Focus:** on open, Radix focuses the currently selected item first, so we steal focus back to the
  search box inside a `requestAnimationFrame` — and **only on devices with a mouse**
  (`(hover: hover)`), or the mobile keyboard would pop over the bottom sheet every time it opens.
- **One Esc must close only the dropdown** — `case-modal.tsx` asks `isDropdownOpen()` from
  `field.tsx` before closing itself. That counter deliberately stays set for one extra tick after
  close, because React 19 unmounts the dropdown before the modal's listener runs (too late to ask the DOM).
