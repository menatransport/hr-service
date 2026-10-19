# แผนขั้นที่ 1 (ข้อมูล) — สายเชื่อมคนขับรถร่วม ↔ ทะเบียน พจส. + ตัวเลขคนขับตัวเดียว

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ hr-service รู้ว่าคนขับรถร่วมแต่ละสัญญาใน `mena_partner` คือ `drivercode` ไหนในทะเบียน พจส. (โดยคนยืนยันทุกคู่) แล้วใช้คู่นั้นนับ "คนขับทั้งบริษัท" เป็นตัวเลขเดียว พร้อมรายการที่สองฝั่งพูดไม่ตรงกัน

**Architecture:** เพิ่ม db ที่สาม `mena_partner` ใน `lib/db/registry.mjs` (ทุกคอลเลกชัน `external` อ่านอย่างเดียว) + คอลเลกชันใหม่ของ hr `partner_driver_links` / `partner_driver_link_events` · ตรรกะทั้งหมดเป็น pure function (`lib/partner-link/match.ts`, `headcount.ts`) ทดสอบได้โดยไม่ต่อฐาน · ชั้นอ่าน/เขียนฐาน (`store.ts`) บาง ๆ · หน้า `/desk/partner-links` (จับคู่) และ `/desk/headcount` (ตัวเลข+ขัดแย้ง) · สคริปต์ dry-run อ่านอย่างเดียวให้เจ้าของรันเอง

**Tech Stack:** Next.js 16.3 · TypeScript · mongodb 7 · node:test ผ่าน tsx · Tailwind 4 + daisyUI 5 (ธีม hrs)

**Spec:** `docs/superpowers/specs/2026-10-19-partner-hr-merge-design.md`

## Global Constraints

- **ห้ามต่อฐานข้อมูลจริงระหว่างพัฒนา** — worktree นี้ไม่มี `.env*` จึงไม่มี `MONGO_URI` (เป็นเกราะอยู่แล้ว ห้ามสร้าง) · เทสต์เป็น pure เท่านั้น · สคริปต์ dry-run เขียนไว้ให้เจ้าของรัน
- **ห้ามเขียนลง `mena_partner` และ `Boom_ETL`** — `partnerCol()` / `etlCol()` คืนชนิดอ่านอย่างเดียว การเขียนจึงเป็น compile error
- **ไม่มีการจับคู่อัตโนมัติ** — `partner_driver_links` เกิดจากคนกดยืนยันเท่านั้น · ระดับความมั่นใจมีไว้เรียงคิว
- **`staffCode` (MTM###) ไม่ใช่ `drivercode`** ห้ามใช้เป็นสัญญาณ
- **ผู้ยืนยัน = `employeeId` จาก session** ไม่รับจาก body · `GET` ทุกเส้นเรียก `readSessionUser()` เอง (proxy ปล่อย GET)
- ชื่อคอลเลกชันมาจาก registry ที่เดียว · `node check_db_names.mjs` ต้องไม่เพิ่มจุดผิด (ฐานตั้งต้นมี 4 จุดจาก payroll ที่มีอยู่ก่อน)
- `npm test` + `npm run build` ต้องผ่านก่อน commit ปิดงาน

## Review Focus

1. **ชื่อซ้ำ** — คนชื่อ-สกุลเดียวกันสองคนต้องขึ้น `ambiguous` ห้ามเลือกให้ → งานที่ 2
2. **คนเดียวหลายสัญญา** — ต้องนับคนครั้งเดียว ไม่ใช่นับสัญญา → งานที่ 3
3. **สองคนกดยืนยันสัญญาเดียวกันพร้อมกัน** — unique index `contractCode` + ตอบ 409 → งานที่ 4
4. **รหัส drivercode ที่พิมพ์มั่ว** — ตรวจ `driverExists()` ก่อนเขียน → งานที่ 4
5. **ETL ไม่มีเลขบัตร** — ตัวจับคู่ต้องยังทำงาน (ใช้ชื่อ+ทะเบียน) → งานที่ 2

## File Structure

| ไฟล์ | หน้าที่ |
|---|---|
| `lib/db/registry.mjs` | + `DB.partner`, `PARTNER` (external ทั้งหมด), `HR.partnerDriverLinks`, `HR.partnerDriverLinkEvents`, ดัชนี |
| `lib/db/index.ts` | + `partnerCol()` อ่านอย่างเดียว |
| `check_db_names.mjs` | + รู้จักชื่อใน `PARTNER` และ `partnerCol(` |
| `lib/partner-link/match.ts` (+test) | เสนอคู่ (pure) |
| `lib/partner-link/headcount.ts` (+test) | ตัวเลขคนขับ + ขัดแย้ง (pure) |
| `lib/partner-link/rows.ts` (+test) | แปลงเอกสารดิบสองฝั่ง → แถวของ matcher/headcount (pure) |
| `lib/partner-link/access.ts` (+test) | ใครยืนยัน/ปลดคู่ได้ (pure) |
| `lib/partner-link/store.ts` | อ่านสองฝั่ง (bounded) + ยืนยัน/ปลด (server) |
| `app/api/partner-links/route.ts` | `GET` ข้อเสนอ+คู่ · `POST` ยืนยัน |
| `app/api/partner-links/[contractCode]/route.ts` | `DELETE` ปลดคู่ |
| `app/desk/(module)/partner-links/page.tsx` | หน้าจับคู่ |
| `app/desk/(module)/headcount/page.tsx` | หน้าตัวเลข + ขัดแย้ง |
| `lib/modules.ts` | + เมนู 2 รายการในกลุ่ม "พนักงานจัดส่ง" |
| `scripts/partner-link-dry-run.ts` | dry-run อ่านอย่างเดียว ให้เจ้าของรัน |

---

### งานที่ 1: registry + `partnerCol()`

- [ ] เทสต์: `lib/db/registry.test.ts` — ทุกคีย์ใน `PARTNER` ไม่ซ้ำชื่อกับ `HR`/`ETL`, `managedCollections()` มี `partner_driver_links` และไม่มีชื่อใดของ `mena_partner`
- [ ] เพิ่มใน `registry.mjs`
```js
export const DB = { hr: "hr_service", etl: "Boom_ETL", partner: "mena_partner" };
export const PARTNER = { drivers: "drivers", contracts: "contracts", payrollEntries: "payroll_entries", monthStatus: "month_status", appUsers: "app_users", vehicles: "vehicle_master" /* … ทั้ง 28 คอลเลกชัน */ };
// HR:
partnerDriverLinks: { name: "partner_driver_links" },
partnerDriverLinkEvents: { name: "partner_driver_link_events" },
// INDEXES:
partnerDriverLinks: [
  { key: { contractCode: 1 }, name: "contractCode_unique", unique: true },
  { key: { drivercode: 1 }, name: "drivercode" },
],
partnerDriverLinkEvents: [{ key: { contractCode: 1, at: -1 }, name: "contract_recent" }],
```
- [ ] `lib/db/index.ts`: `partnerCol<T>(key: PartnerKey): Promise<ReadOnlyCollection<T>>` = `(await client()).db(process.env.MONGO_DB_PARTNER || DB.partner).collection(PARTNER[key])`
- [ ] `check_db_names.mjs` นับชื่อใน `PARTNER` และยกเว้นคีย์ที่ส่งเข้า `partnerCol(`
- [ ] รัน `npm test` · `node check_db_names.mjs` (ต้องเหลือ 4 จุดเดิม) · commit

### งานที่ 2: ตัวเสนอคู่ (pure)
(โค้ดจริงอยู่ในไฟล์ — สรุปพฤติกรรมที่เทสต์พินไว้)

| เคส | คาด |
|---|---|
| เลขบัตร 13 หลักตรง | `nationalId` / `high` |
| ชื่อ+ทะเบียนตรง | `name+plate` / `medium` |
| ชื่อตรงอย่างเดียว | `name` / `low` |
| ชั้นดีสุดมีหลายคน | `ambiguous=true` และทุกคน `low` |
| สัญญาที่ยืนยันแล้ว | ไม่เสนอซ้ำ |
| owner_type 2 | ขึ้นก่อน แต่ไม่ตัดคนอื่น |
| `staffCode` | ไม่มีผลใด ๆ |
| คำนำหน้าอังกฤษ | ตัดเฉพาะเมื่อจบคำ |

- [ ] เขียน `match.test.ts` (12 เคส) → รัน fail → เขียน `match.ts` → ผ่าน → commit

### งานที่ 3: ตัวเลขคนขับ + ขัดแย้ง (pure)
- [ ] `headcount.test.ts` 9 เคส (ดูตารางใน spec) → `headcount.ts` → ผ่าน → commit

### งานที่ 4: ชั้นข้อมูล + API
- [ ] `rows.ts` (pure, มีเทสต์): `toPartnerCandidates(contracts, drivers)` ใช้ `contract.driverId` ต่อกับ `drivers._id` ชื่อเอาจาก driver ก่อน (`prefix firstName lastName`) ไม่มีค่อยใช้ `contract.driverName` · `toPartnerDriverRows()` รวมสัญญาต่อคน (สัญญาที่ไม่มี `driverId` = คนละคน คีย์ `contract:<code>`) · `toEtlCandidates(drivers, vehicles)` active = `statusOverride` ทับ ETL
- [ ] `access.ts` (pure, มีเทสต์): `canManageLinks(identity)` = ล็อกอินแล้ว และหน่วยงานอยู่ใน `APPROVER_DEPARTMENT_IDS` (HR) · ค่าตั้ง `PARTNER_LINK_DEPARTMENTS` เพิ่มได้
- [ ] `store.ts`: อ่านแบบมี projection + limit (`contracts` ≤ 2,000 แถว, `drivers` ≤ 2,000) · `confirmLink()` ตรวจ `driverExists` + สัญญามีจริง → `insertOne` (ชน unique = 409) + เขียน event · `unlink()` ลบ + event
- [ ] API: `GET` ต้องมี session (401) · `POST`/`DELETE` ต้อง `canManageLinks` (403) · body ตรวจรูปแบบ (400)
- [ ] `npm test` + build → commit

### งานที่ 5: หน้าจอ
- [ ] `/desk/partner-links`: แท็บ "รอจับคู่" (เรียง high→low, ambiguous ขึ้นป้าย) / "ยืนยันแล้ว" (ปุ่มปลดคู่) · ปุ่มยืนยันส่ง `contractCode + drivercode + matchedBy + confidence` · ผู้ไม่มีสิทธิ์เห็นแบบอ่านอย่างเดียว
- [ ] `/desk/headcount`: การ์ด 3 ใบ (ETL / รถร่วม / รวมตัดซ้ำ) + ส่วนต่าง + ข้อสมมติ + ตารางขัดแย้ง
- [ ] เมนูใน `lib/modules.ts` · build → commit

### งานที่ 6: สคริปต์ dry-run (เจ้าของรัน)
- [ ] `scripts/partner-link-dry-run.ts` — อ่านอย่างเดียว · projection + limit · `readPreference=secondaryPreferred` · พิมพ์: จำนวนสัญญา/คน, ข้อเสนอแยกชั้น, ambiguous, ไม่มีคู่, ฟิลด์ใน `main_driver` ที่น่าจะเป็นเลขบัตร (สุ่ม 50 แถว ดูค่าที่เป็น 13 หลัก) → เขียน CSV ลง `.verify/` (gitignored)
- [ ] ห้ามรันเอง · commit
