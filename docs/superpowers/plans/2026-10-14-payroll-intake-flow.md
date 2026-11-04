# แผนพัฒนา Payroll Intake — แจ้งฝ่าย → ด่านตรวจอัตโนมัติ → HR ยืนยัน

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำให้รอบจ่ายหนึ่งรอบเดินได้ครบวงจรในระบบ — HR แจ้งทุกฝ่ายพร้อมลิงก์ → ฝ่ายล็อกอินเข้ามาอัปโหลดเฉพาะของตัวเอง → ระบบตรวจไฟล์จริงให้ก่อน (ด่าน 1) → HR ตรวจแล้วกดรับเข้ารอบ (ด่าน 2) → เห็นสรุปรอบว่าของครบหรือยัง

**Architecture:** ต่อยอดของที่มีอยู่แล้วบน branch `feat/payroll-intake-monthly` ไม่รื้อใหม่ — ทะเบียน 25 รายการ (`registry.ts`), สเปกคอลัมน์ (`template-spec.ts`), ทิศทางเงินรายช่อง (`classify.ts`) และสถานะ 4 ขั้น (`intake-status.ts` + คอลเลกชัน `payroll_intake`) ยังเป็นแกนเดิมทั้งหมด ของใหม่มี 4 ชิ้น: **(1)** ตัวอ่านไฟล์จริงด้วย `exceljs` ที่คืน `FileProfile` หน้าตาเดิมเป๊ะกับ `SAMPLE_PROFILE` **(2)** ชุดกฎตรวจ (`rules.ts`) ที่แยก "กฎที่ยืนยันแล้ว" ออกจาก "กฎที่รอฝ่ายยืนยัน" ชัดเจน — กฎที่ยังไม่ยืนยันขึ้นบนจอได้แต่บล็อกใครไม่ได้ **(3)** ขอบเขตการมองเห็นตามหน่วยงานของผู้ล็อกอิน **(4)** ร่างอีเมลแจ้งฝ่าย + ลิงก์เข้าหน้าของฝ่ายนั้น

**Tech Stack:** Next.js 16.3 (App Router, `proxy.ts` ไม่ใช่ middleware) · React 19 · TypeScript · MongoDB 7 driver + GridFS · exceljs · Tailwind 4 + daisyUI 5 · node:test รันผ่าน tsx (ไม่เพิ่ม dependency ใหม่เลย)

**Spec:** ไม่มีเอกสารสเปกแยก — ที่มาของแผนนี้คือ flow ที่เจ้าของงาน (บัว) สั่งเมื่อ 13 ต.ค. 2569 ตามนี้คำต่อคำ:

> ระบบส่งอีเมลแจ้งทุกแผนก โดยระบบจะสร้างลิงก์เพื่อให้ทุกแผนกเข้ามาส่งข้อมูล · ด่านแรกระบบจะช่วยคำนวณความถูกต้อง · ด่านที่สอง HR มาตรวจสอบเพื่อยืนยัน · ผ่านแล้วจึงมาสรุปเพื่ออัปโหลดขึ้น Tigersoft เพื่อทำไฟล์เงินเดือน

บวกคำตอบ 4 ข้อที่เคาะเมื่อ 14 ต.ค. 2569:

1. **อีเมล — ระบบไม่ส่งเอง** เปิดหน้าเขียนเมล Gmail ให้ HR กดส่งจากบัญชีตัวเอง (คงมติเดิม 8 ก.ย. 2569 ที่ `lib/case-notify.ts` บันทึกไว้)
2. **ลิงก์ — ต้องล็อกอิน และเห็นแค่ของฝ่ายตัวเอง** ไม่ใช่ลิงก์โทเคนเปิดได้ลอย ๆ
3. **ด่าน 1 — ตรวจรูปแบบ + กฎธุรกิจเต็ม** (ไม่ใช่แค่เช็กหัวคอลัมน์)
4. **เฟสแรกยังไม่ทำไฟล์นำเข้า Tigersoft** — จบที่ HR ยืนยัน + หน้าสรุปรอบ + ดาวน์โหลด Excel สรุป · สเปกไฟล์ Tigersoft ยังไม่มี ต้องขอจาก HR C&B ก่อน แล้วค่อยทำเป็นแผนแยก

## Global Constraints

- **ห้ามเดา 3 เรื่องที่ยังไม่มีคำตอบ** — ความหมายรหัสวัน 17 จาก 24 ตัวใน `DAY_CODES` (รอฝ่ายจัดส่ง) · ทิศทางเงินของ #14 #15 (รอบัญชีกรุงเทพ) #17 #18 (รอยานยนต์) · Tiger Soft รับช่องรวมหรือช่องย่อยของ #08 #23 (รอ HR C&B) ทุกกฎที่อ้างสามเรื่องนี้ต้องมี `status: "pending"` ซึ่งแสดงผลได้แต่ **บล็อกการรับเข้ารอบไม่ได้**
- **เลขรายการ `01`–`24` และ `30` ห้ามเรียงใหม่** — เป็นคีย์ `payroll_intake._id = "<periodCode>:<itemId>"`
- **ทุก `GET /api/**` ต้องเรียก `readSessionUser()` เอง** — `proxy.ts` กันเฉพาะ method ที่เขียนข้อมูล `GET` ปล่อยผ่านทั้งหมดโดยตั้งใจ
- **ระบบไม่ส่งอีเมลเอง ไม่ว่ากรณีใด** — ไม่มี SMTP ไม่มี service account ไม่เก็บโทเคนของใคร มีแต่ร่างเมลที่เปิดหน้าเขียนเมลให้ผู้ใช้กดส่ง · ร่างเมลเป็น **ข้อความล้วน** เพราะหน้าเขียนเมลของ Gmail รับแค่ข้อความล้วน
- **คนส่ง ≠ คนผ่าน** — `stage: "passed"` ต้องเป็นหน่วยงานใน `APPROVER_DEPARTMENT_IDS` และกันที่เซิร์ฟเวอร์ ไม่ใช่แค่ปิดปุ่ม
- **ไฟล์ `.xlsx` เก็บ GridFS ไม่ใช่ Spaces** — presign API ของบริษัทมี allow-list เป็นนามสกุลรูปเท่านั้น (ยืนยันแล้ว 19 ส.ค. 2569 ที่ `lib/record-files.ts`)
- `npm run verify:payroll` ต้องผ่านก่อน commit ทุกครั้งที่แตะ `registry.ts` `template-spec.ts` `classify.ts` หรือ `rules.ts`
- ข้อความบนจอและในเมลต้องฟังเหมือนคนเขียน ไม่ใช่ AI — ประโยคบอกเล่า ไม่ขึ้นต้นด้วย "กรุณา" ทุกบรรทัด ไม่มี emoji ในเนื้อเมล
- คำสั่งทดสอบคือ `npm test` (เพิ่มในงานที่ 1) = `tsx --tsconfig tsconfig.json --test "lib/**/*.test.ts"` · ยืนยันแล้วว่า `node:test` + path alias `@/` ทำงานบน Node 25.2.1 ที่เครื่องนี้

## Review Focus

กรณีที่ flow ข้างบนไม่ได้พูดถึง แต่คนใช้งานจริงจะเจอแน่ และถ้าพังจะพังแบบเงียบ ๆ:

1. **ไฟล์มีหลายชีต หรือชีตแรกว่าง** — ของจริงมีถึง 3 ชีต (`SAMPLE_PROFILE.sheetCount = 3`) ตัวอ่านต้องเลือกชีตแรกที่มีข้อมูลจริงและบอกบนจอว่าอ่านชีตไหน ไม่ใช่รายงานว่าไฟล์ว่าง → พินไว้ที่งานที่ 3
2. **หัวคอลัมน์มีช่องว่างเกินหรือมีวรรคตอนต่าง** — ไฟล์จริงเคยมี `"a.b @menatransport.co.th"` แบบมีช่องว่างเกินมาแล้ว หัวคอลัมน์ก็เหมือนกัน ถ้าเทียบแบบตรงตัวอักษรจะรายงานว่า "ขาดคอลัมน์" ทั้งที่มี → พินไว้ที่งานที่ 4
3. **รหัสพนักงานที่ Excel เก็บเป็นตัวเลข** — `123456` ต้องอ่านได้เป็น `"123456"` ไม่ใช่ `"123456.0"` หรือ `"1.23456e+5"` ไม่งั้นจับคู่พนักงานไม่ติดทั้งไฟล์ → พินไว้ที่งานที่ 3
4. **ผู้ใช้ที่หน่วยงานไม่อยู่ในทะเบียนผู้รับผิดชอบ** — ต้องเห็นหน้าที่อธิบายว่าทำไมไม่มีรายการให้ส่ง พร้อมบอกว่าให้ติดต่อใคร ไม่ใช่หน้าว่างเปล่าหรือ 403 เงียบ ๆ → พินไว้ที่งานที่ 2
5. **ไฟล์ใหญ่เกินหรือไม่ใช่ `.xlsx` จริง** (เปลี่ยนนามสกุลมา) — ต้องตอบเป็นข้อความที่อ่านรู้เรื่องก่อนจะไปถึง exceljs ไม่ใช่ 500 → พินไว้ที่งานที่ 6

---

## File Structure

**สร้างใหม่**

| ไฟล์ | หน้าที่ |
|---|---|
| `lib/payroll/owner-directory.ts` | จับคู่ผู้รับผิดชอบในทะเบียน ↔ `department_id` ของ NCAC + หาผู้รับอีเมลของฝ่าย |
| `lib/payroll/scope.ts` | ใครเห็นของฝ่ายไหน / อัปโหลดแทนกันได้ไหม (ใช้ได้ทั้ง client และ server) |
| `lib/payroll/parse.ts` | อ่าน `.xlsx` จริงด้วย exceljs → `FileProfile` + แถวดิบ (server เท่านั้น) |
| `lib/payroll/rules.ts` | ด่าน 1 — ชุดกฎตรวจ แยก active / pending |
| `lib/payroll/intake-files.ts` | เก็บ/เปิดไฟล์ที่ฝ่ายส่งมา ใน GridFS bucket `payroll_intake_files` |
| `lib/payroll/notify.ts` | ร่างอีเมลแจ้งฝ่าย + ลิงก์เข้าหน้าของฝ่ายนั้น |
| `lib/payroll/summary-export.ts` | Excel สรุปรอบ (ไม่ใช่ไฟล์ Tigersoft) |
| `app/api/payroll/parse/route.ts` | `POST` รับไฟล์ → เก็บ + อ่าน + ตรวจ → คืน profile + ผลตรวจ |
| `app/api/payroll/files/[fileId]/route.ts` | `GET` เปิดไฟล์ที่ส่งมาแล้ว (ต้องล็อกอิน + อยู่ในขอบเขต) |
| `app/api/payroll/notify/route.ts` | `GET` ร่างเมลของฝ่ายหนึ่งในรอบหนึ่ง — อ่านอย่างเดียว ไม่มีเส้นส่ง |
| `app/payroll/summary/page.tsx` | หน้าสรุปรอบ |
| `components/payroll/checks-panel.tsx` | แผงผลตรวจด่าน 1 |
| `components/payroll/notify-panel.tsx` | แผงแจ้งฝ่ายทางอีเมล |
| `components/payroll/summary-view.tsx` | ตัวหน้าสรุปรอบ |

**แก้ของเดิม**

| ไฟล์ | แก้อะไร |
|---|---|
| `lib/payroll/intake-status.ts` | เติมฟิลด์ผลตรวจใน `IntakeRecord` |
| `lib/payroll/intake.ts` | รับฟิลด์ผลตรวจ + กันการผ่านเมื่อยังมีข้อผิดพลาด (เว้นแต่มีเหตุผลกำกับ) |
| `app/api/payroll/intake/route.ts` | กรองตามขอบเขตหน่วยงาน + ส่งต่อฟิลด์ใหม่ |
| `components/payroll/intake-view.tsx` | เลิกใช้ `SAMPLE_PROFILE` ต่อของจริง + แผงผลตรวจ + แผงแจ้งฝ่าย |
| `lib/payroll/nav.ts` | เพิ่มเมนูหน้าสรุปรอบ |
| `scripts/verify-payroll-templates.ts` | ตรวจเพิ่มว่าทุกรายการมีกฎครอบ และกฎไม่อ้างคอลัมน์ที่ไม่มีในสเปก |
| `package.json` | เพิ่มสคริปต์ `test` |

**อยู่นอกขอบเขตเฟสนี้โดยตั้งใจ** — ไฟล์นำเข้า Tigersoft (ยังไม่มีสเปก) · คอลเลกชัน `payroll_periods` สำหรับเปิด/ปิดรอบจริง (ยังใช้ `CURRENT_PERIOD` + `LOCKED_PERIODS` ตามเดิม) · การแก้ไขค่าในไฟล์จากบนหน้าจอ (ตอนนี้ตีกลับให้ฝ่ายแก้แล้วส่งใหม่)

---

### Task 1: ทะเบียนหน่วยงาน + ขอบเขตการมองเห็น

**Files:**
- Create: `lib/payroll/owner-directory.ts`
- Create: `lib/payroll/scope.ts`
- Create: `lib/payroll/scope.test.ts`
- Modify: `package.json` (เพิ่มสคริปต์ `test`)

**Interfaces:**
- Consumes: `IntakeOwner`, `INTAKE_ITEMS`, `itemsByOwner`, `OWNER_ORDER` จาก `registry.ts` · `DeskIdentity` จาก `lib/auth/identity.ts` · `APPROVER_DEPARTMENT_IDS` จาก `approver.ts`
- Produces:
  - `OWNER_DEPARTMENT_ID: Record<IntakeOwner, string | null>`
  - `departmentIdOf(owner: IntakeOwner): string | null`
  - `ownersOfDepartment(departmentId: string): IntakeOwner[]`
  - `unmappedOwners(): IntakeOwner[]`
  - `type OwnerScope = { all: true } | { all: false; owners: IntakeOwner[] }`
  - `ownerScope(identity: DeskIdentity): OwnerScope`
  - `canSeeOwner(identity: DeskIdentity, owner: IntakeOwner): boolean`
  - `canUploadItem(identity: DeskIdentity, itemId: string): boolean`

- [ ] **Step 1: เพิ่มสคริปต์ทดสอบ**

ใน `package.json` ใต้ `"scripts"`:

```json
"test": "tsx --tsconfig tsconfig.json --test \"lib/**/*.test.ts\""
```

- [ ] **Step 2: เขียนเทสต์ที่ยังไม่ผ่าน**

`lib/payroll/scope.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

import type { DeskIdentity } from "@/lib/auth/identity";
import {
  departmentIdOf,
  ownersOfDepartment,
  unmappedOwners,
} from "@/lib/payroll/owner-directory";
import { canSeeOwner, canUploadItem, ownerScope } from "@/lib/payroll/scope";

const identity = (over: Partial<DeskIdentity> = {}): DeskIdentity => ({
  employeeId: "00001",
  name: "ทดสอบ ระบบ",
  firstName: "ทดสอบ",
  role: "จัดส่งลาดกระบัง · Supervisor",
  position: "Supervisor",
  department: "จัดส่งลาดกระบัง",
  departmentId: "15",
  level: 3,
  levelLabel: "Supervisor",
  imageUrl: null,
  authenticated: true,
  ...over,
});

test("หน่วยงานที่ยืนยันรหัสแล้วจับคู่กับผู้รับผิดชอบในทะเบียนได้", () => {
  assert.equal(departmentIdOf("จัดส่ง ลาดกระบัง"), "15");
  assert.equal(departmentIdOf("ยานยนต์"), "3");
  assert.deepEqual(ownersOfDepartment("15"), ["จัดส่ง ลาดกระบัง"]);
});

test("ฝ่ายบัญชีสองฝ่ายยังไม่มีรหัสหน่วยงาน — ต้องเป็น null ไม่ใช่เดาเลข", () => {
  assert.equal(departmentIdOf("บัญชี กรุงเทพ"), null);
  assert.equal(departmentIdOf("บัญชี ลาดกระบัง"), null);
  assert.deepEqual(unmappedOwners().sort(), ["บัญชี กรุงเทพ", "บัญชี ลาดกระบัง"]);
});

test("HR เห็นทุกฝ่าย", () => {
  const hr = identity({ departmentId: "24", department: "ทรัพยากรบุคคล" });
  assert.deepEqual(ownerScope(hr), { all: true });
  assert.equal(canSeeOwner(hr, "ยานยนต์"), true);
});

test("ฝ่ายอื่นเห็นแค่ของตัวเอง", () => {
  const delivery = identity();
  assert.deepEqual(ownerScope(delivery), {
    all: false,
    owners: ["จัดส่ง ลาดกระบัง"],
  });
  assert.equal(canSeeOwner(delivery, "จัดส่ง ลาดกระบัง"), true);
  assert.equal(canSeeOwner(delivery, "ยานยนต์"), false);
});

test("ยังไม่ล็อกอิน = ไม่เห็นอะไรเลย แม้ค่าสำรองจะสังกัด HR", () => {
  const guest = identity({ departmentId: "24", authenticated: false });
  assert.deepEqual(ownerScope(guest), { all: false, owners: [] });
  assert.equal(canSeeOwner(guest, "จัดส่ง ลาดกระบัง"), false);
});

test("อัปโหลดได้เฉพาะรายการที่ฝ่ายตัวเองรับผิดชอบ · HR อัปโหลดแทนได้", () => {
  const delivery = identity();
  assert.equal(canUploadItem(delivery, "01"), true);
  assert.equal(canUploadItem(delivery, "17"), false);
  const hr = identity({ departmentId: "24" });
  assert.equal(canUploadItem(hr, "17"), true);
});

test("รายการที่ไม่มีในทะเบียน อัปโหลดไม่ได้ ไม่ว่าใคร", () => {
  assert.equal(canUploadItem(identity({ departmentId: "24" }), "99"), false);
});
```

- [ ] **Step 3: รันให้เห็นว่าเทสต์ล้ม**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/lib/payroll/owner-directory'`

- [ ] **Step 4: เขียน `owner-directory.ts`**

```ts
import { OWNER_ORDER, type IntakeOwner } from "./registry";

/**
 * ผู้รับผิดชอบในทะเบียน ↔ `department_id` ของ NCAC
 *
 * **สี่ฝ่ายยืนยันรหัสแล้ว** จาก payload จริงของ `GET /users` (8 ก.ย. 2569 — ชุดเดียวกับที่
 * `lib/case-notify.ts` อ้างไว้): 3 ยานยนต์ · 11 Operation Support · 15 จัดส่งลาดกระบัง ·
 * 24 HR [พัฒนาบุคลากรและองค์กร]
 *
 * **บัญชีกรุงเทพ กับ บัญชีลาดกระบัง ไม่มีรหัสในชุดนั้น** — ค่าเป็น `null` ไม่ใช่เลขที่เดาเอา
 * เพราะรหัสนี้ตัดสินว่าใครเห็นและอัปโหลดของใครได้ เดาผิดคือเปิดให้ฝ่ายหนึ่งส่งไฟล์
 * แทนอีกฝ่ายโดยไม่มีใครรู้
 *
 * เติมได้ด้วย `NEXT_PUBLIC_PAYROLL_OWNER_DEPARTMENTS="บัญชี กรุงเทพ=31,บัญชี ลาดกระบัง=32"`
 * (ค่าตั้งของผู้ดูแลระบบตอน build ไม่ใช่ค่าที่ผู้ใช้ส่งมาได้ — ท่าเดียวกับ `approver.ts`)
 * วันที่ได้รหัสจริงจาก NCAC แล้วให้ย้ายมาใส่ในตารางนี้ตรง ๆ แล้วลบ env ออก
 */
const CONFIRMED: Record<IntakeOwner, string | null> = {
  "จัดส่ง ลาดกระบัง": "15",
  "บัญชี ลาดกระบัง": null,
  "บัญชี กรุงเทพ": null,
  "ยานยนต์": "3",
  "Operation Support": "11",
  "HR C&B": "24",
};

const fromEnv = (): Partial<Record<IntakeOwner, string>> => {
  const out: Partial<Record<IntakeOwner, string>> = {};
  for (const pair of (process.env.NEXT_PUBLIC_PAYROLL_OWNER_DEPARTMENTS ?? "").split(",")) {
    const [owner, id] = pair.split("=").map((v) => v.trim());
    if (owner && id && OWNER_ORDER.includes(owner as IntakeOwner)) {
      out[owner as IntakeOwner] = id;
    }
  }
  return out;
};

export const OWNER_DEPARTMENT_ID: Record<IntakeOwner, string | null> = {
  ...CONFIRMED,
  ...fromEnv(),
};

export const departmentIdOf = (owner: IntakeOwner): string | null =>
  OWNER_DEPARTMENT_ID[owner] ?? null;

/** หลายฝ่ายในทะเบียนอาจสังกัดหน่วยงานเดียวกันได้ — คืนเป็นรายการเสมอ */
export const ownersOfDepartment = (departmentId: string): IntakeOwner[] =>
  OWNER_ORDER.filter((owner) => OWNER_DEPARTMENT_ID[owner] === departmentId);

/** ฝ่ายที่ยังไม่มีรหัส — หน้าจอต้องบอกเรื่องนี้ ไม่ใช่ทำเป็นไม่มีฝ่ายนั้น */
export const unmappedOwners = (): IntakeOwner[] =>
  OWNER_ORDER.filter((owner) => OWNER_DEPARTMENT_ID[owner] === null);
```

- [ ] **Step 5: เขียน `scope.ts`**

```ts
import type { DeskIdentity } from "../auth/identity";
import { APPROVER_DEPARTMENT_IDS } from "./approver";
import { ownersOfDepartment } from "./owner-directory";
import { findItem, type IntakeOwner } from "./registry";

/**
 * ใครเห็นของฝ่ายไหน — **ใช้ได้ทั้ง client และ server** (หน้าจอซ่อน · API กันจริง)
 *
 * HR เห็นทุกฝ่ายเพราะเป็นคนไล่ของทั้งรอบ · ฝ่ายอื่นเห็นแค่ของหน่วยงานตัวเอง ตาม
 * ที่เจ้าของงานสั่งไว้ว่าลิงก์ที่ส่งให้แต่ละแผนก "เข้ามาแล้วเห็นแค่ของฝ่ายตัวเอง"
 *
 * **ขอบเขตมาจาก session ไม่ใช่จาก query string** — ลิงก์ในเมลมี `?owner=` ติดมาก็จริง
 * แต่ค่านั้นใช้แค่เลื่อนหน้าจอไปที่กลุ่มนั้น ไม่ได้ให้สิทธิ์อะไร ใครแก้ URL เองก็ไม่ได้
 * ของฝ่ายอื่นเพิ่มขึ้นมา
 */
export type OwnerScope = { all: true } | { all: false; owners: IntakeOwner[] };

export function ownerScope(identity: DeskIdentity): OwnerScope {
  if (!identity.authenticated) return { all: false, owners: [] };
  if (APPROVER_DEPARTMENT_IDS.includes(identity.departmentId)) return { all: true };
  return { all: false, owners: ownersOfDepartment(identity.departmentId) };
}

export function canSeeOwner(identity: DeskIdentity, owner: IntakeOwner): boolean {
  const scope = ownerScope(identity);
  return scope.all || scope.owners.includes(owner);
}

export function canUploadItem(identity: DeskIdentity, itemId: string): boolean {
  const item = findItem(itemId);
  return item ? canSeeOwner(identity, item.owner) : false;
}
```

- [ ] **Step 6: รันเทสต์ให้ผ่าน**

Run: `npm test`
Expected: PASS ทั้ง 7 เทสต์

- [ ] **Step 7: commit**

```bash
cd ~/Documents/github/hr-service
git add package.json lib/payroll/owner-directory.ts lib/payroll/scope.ts lib/payroll/scope.test.ts
git commit -m "payroll: ขอบเขตการมองเห็นตามหน่วยงาน — แต่ละฝ่ายเห็นแค่ของตัวเอง"
```

---

### Task 2: บังคับขอบเขตที่ API และหน้าจอ

**Files:**
- Modify: `app/api/payroll/intake/route.ts`
- Modify: `components/payroll/intake-view.tsx`
- Modify: `components/payroll/owner-group.tsx` (ถ้าต้องซ่อนกลุ่มที่ไม่เห็น)
- Create: `lib/payroll/scope-filter.ts`
- Create: `lib/payroll/scope-filter.test.ts`

**Interfaces:**
- Consumes: `ownerScope`, `canSeeOwner`, `canUploadItem` จากงานที่ 1 · `IntakeRecord` จาก `intake-status.ts`
- Produces:
  - `visibleItems(identity: DeskIdentity): IntakeItem[]`
  - `filterRecords(identity: DeskIdentity, records: IntakeRecord[]): IntakeRecord[]`

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน**

`lib/payroll/scope-filter.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

import type { DeskIdentity } from "@/lib/auth/identity";
import type { IntakeRecord } from "@/lib/payroll/intake-status";
import { filterRecords, visibleItems } from "@/lib/payroll/scope-filter";

const identity = (departmentId: string, authenticated = true): DeskIdentity => ({
  employeeId: "00001",
  name: "ทดสอบ ระบบ",
  firstName: "ทดสอบ",
  role: "-",
  position: "Supervisor",
  department: "-",
  departmentId,
  level: 3,
  levelLabel: "Supervisor",
  imageUrl: null,
  authenticated,
});

const record = (itemId: string): IntakeRecord => ({
  itemId,
  stage: "submitted",
  updatedAt: "2026-10-14T03:00:00.000Z",
  updatedBy: "ทดสอบ ระบบ",
});

test("ฝ่ายจัดส่งเห็น 12 รายการของตัวเอง ไม่เห็นของฝ่ายอื่น", () => {
  const items = visibleItems(identity("15"));
  assert.equal(items.length, 12);
  assert.ok(items.every((i) => i.owner === "จัดส่ง ลาดกระบัง"));
});

test("HR เห็นทั้ง 25 รายการ", () => {
  assert.equal(visibleItems(identity("24")).length, 25);
});

test("หน่วยงานที่ไม่อยู่ในทะเบียนผู้รับผิดชอบ เห็นศูนย์รายการ — ไม่ใช่เห็นทั้งหมด", () => {
  assert.deepEqual(visibleItems(identity("19")), []);
});

test("สถานะของฝ่ายอื่นไม่หลุดออกจาก API", () => {
  const all = [record("01"), record("17"), record("24")];
  const seen = filterRecords(identity("15"), all).map((r) => r.itemId);
  assert.deepEqual(seen, ["01"]);
});

test("HR ได้สถานะทุกแถวตามเดิม", () => {
  const all = [record("01"), record("17")];
  assert.equal(filterRecords(identity("24"), all).length, 2);
});
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/lib/payroll/scope-filter'`

- [ ] **Step 3: เขียน `scope-filter.ts`**

```ts
import type { DeskIdentity } from "../auth/identity";
import type { IntakeRecord } from "./intake-status";
import { INTAKE_ITEMS, findItem, type IntakeItem } from "./registry";
import { canSeeOwner } from "./scope";

/**
 * รายการที่ผู้ใช้คนนี้มีสิทธิ์เห็นในรอบหนึ่ง — **เรียงตามทะเบียนเดิมเสมอ**
 * (ไม่เรียงใหม่ เพราะคนที่ใช้ทะเบียนเดิมอยู่แล้วไล่ของตามลำดับนั้น)
 */
export const visibleItems = (identity: DeskIdentity): IntakeItem[] =>
  INTAKE_ITEMS.filter((item) => canSeeOwner(identity, item.owner));

/**
 * กรองสถานะก่อนส่งออกจาก API
 *
 * ต้องกรองที่ฝั่งเซิร์ฟเวอร์ ไม่ใช่ซ่อนบนหน้าจอ — แถวพวกนี้มีชื่อคนส่ง ชื่อไฟล์
 * และเหตุผลที่ตีกลับ ซึ่งเป็นเรื่องภายในของแต่ละฝ่าย · แถวของรายการที่ถูกถอดออกจาก
 * ทะเบียนแล้ว (เช่นรอบเก่าที่เคยมีเลข 25–29) จะไม่ผ่านตัวกรองนี้ ซึ่งถูกต้อง
 */
export const filterRecords = (
  identity: DeskIdentity,
  records: IntakeRecord[],
): IntakeRecord[] =>
  records.filter((record) => {
    const item = findItem(record.itemId);
    return item ? canSeeOwner(identity, item.owner) : false;
  });
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: ต่อที่ API**

ใน `app/api/payroll/intake/route.ts` — ใน `GET` เปลี่ยนบรรทัดสุดท้ายจาก `return ok(await listIntake(period))` เป็น:

```ts
    const identity = await getDeskIdentity();
    return ok(filterRecords(identity, await listIntake(period)));
```

และใน `PATCH` เพิ่มด่านก่อนเรียก `saveIntake` (ใต้บล็อก `canPassIntake` เดิม):

```ts
    /* **อัปโหลดแทนฝ่ายอื่นไม่ได้** — ของเดิมขั้นที่ไม่ใช่ `passed` ใครก็ทำได้ ซึ่งแปลว่า
       คนจากฝ่ายหนึ่งยิง API ตรงแล้วเปลี่ยนสถานะของอีกฝ่ายได้ · HR ยังทำแทนได้ตามเดิม
       เพราะบางเดือนฝ่ายส่งไฟล์มาทางไลน์แล้ว HR เป็นคนเอาขึ้นระบบ */
    if (!canUploadItem(identity, body.itemId.trim())) {
      return forbidden(
        `รายการนี้ไม่ใช่ของ${identity.department || "หน่วยงานของบัญชีนี้"} — ส่งได้เฉพาะรายการที่ฝ่ายตัวเองรับผิดชอบ`,
      );
    }
```

- [ ] **Step 6: หน้าจอ — ซ่อนกลุ่มที่ไม่เห็น และอธิบายเมื่อไม่มีอะไรให้ส่ง**

ใน `components/payroll/intake-view.tsx` เปลี่ยนที่มาของรายการจาก `INTAKE_ITEMS` ทั้งชุด เป็น `visibleItems(identity)` และเพิ่มสถานะว่าง:

```tsx
{items.length === 0 && (
  <div className="rounded-xl border border-base-300 bg-base-100 p-6 text-sm text-mut">
    <p className="font-medium text-base-content">
      หน่วยงานของคุณยังไม่มีรายการในทะเบียนรับข้อมูลเงินเดือน
    </p>
    <p className="mt-2">
      ทะเบียนรอบนี้มีผู้รับผิดชอบ 6 ฝ่าย ({OWNER_ORDER.join(" · ")}) — ถ้าฝ่ายของคุณ
      ต้องส่งข้อมูลด้วย แจ้ง{HR_DEPARTMENT_LABEL} เพื่อเพิ่มหน่วยงานให้ตรงกับทะเบียน
    </p>
    {unmapped.length > 0 && (
      <p className="mt-2">
        ตอนนี้ยังไม่ได้ผูกรหัสหน่วยงานของ {unmapped.join(" และ ")} ไว้ — สองฝ่ายนี้ต้องให้
        {HR_DEPARTMENT_LABEL} ตั้งค่าก่อนจึงจะเข้ามาส่งเองได้
      </p>
    )}
  </div>
)}
```

- [ ] **Step 7: ตรวจด้วยตาจริง**

```bash
cd ~/Documents/github/hr-service && npm run dev
```

ยืนยัน 3 อย่าง: ล็อกอินด้วยบัญชี HR เห็นครบ 6 กลุ่ม · บัญชีฝ่ายจัดส่งเห็นกลุ่มเดียว 12 รายการ · เปิด `/api/payroll/intake?period=2026-09` ด้วยบัญชีฝ่ายจัดส่ง ต้องไม่มี `itemId` ของฝ่ายอื่นติดมา

- [ ] **Step 8: commit**

```bash
git add app/api/payroll/intake/route.ts components/payroll/intake-view.tsx components/payroll/owner-group.tsx lib/payroll/scope-filter.ts lib/payroll/scope-filter.test.ts
git commit -m "payroll: กันขอบเขตฝ่ายที่เซิร์ฟเวอร์ ไม่ใช่แค่ซ่อนบนหน้าจอ"
```

---

### Task 3: ตัวอ่านไฟล์จริง

**Files:**
- Create: `lib/payroll/parse.ts`
- Create: `lib/payroll/parse.test.ts`

**Interfaces:**
- Consumes: `exceljs` · `FileProfile`, `ColumnProfile`, `CellType`, `ColumnState`, `BadCell` จาก `profile.ts`
- Produces:
  - `interface ParsedFile { profile: FileProfile; rows: Record<string, string>[] }` — คีย์ของ `rows` คือ **ตัวอักษรคอลัมน์** (`"A"`, `"B"`) ตรงกับ `ColumnProfile.letter`
  - `profileWorkbook(data: ArrayBuffer, fileName: string): Promise<ParsedFile>`
  - `headerLetter(profile: FileProfile, header: string): string | undefined`
  - `normalizeHeader(value: string): string`

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน**

`lib/payroll/parse.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

import { headerLetter, profileWorkbook } from "@/lib/payroll/parse";

/** สร้างไฟล์ .xlsx จริงในหน่วยความจำ — ไม่พึ่งไฟล์ตัวอย่างในเครื่องใคร */
async function book(
  sheets: { name: string; rows: (string | number | null)[][] }[],
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name);
    for (const row of sheet.rows) ws.addRow(row);
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

test("อ่านหัวคอลัมน์ ชนิดข้อมูล และจำนวนแถวได้จากไฟล์จริง", async () => {
  const data = await book([
    {
      name: "Mixer",
      rows: [
        ["รหัสพนักงาน", "ชื่อ-นามสกุล", "จำนวนเงิน"],
        ["123456", "ก ข", 1200],
        ["123457", "ค ง", 800],
      ],
    },
  ]);

  const { profile, rows } = await profileWorkbook(data, "ค่าเที่ยว.xlsx");

  assert.equal(profile.sheetName, "Mixer");
  assert.equal(profile.headerRow, 1);
  assert.equal(profile.totalRows, 2);
  assert.deepEqual(
    profile.columns.map((c) => c.header),
    ["รหัสพนักงาน", "ชื่อ-นามสกุล", "จำนวนเงิน"],
  );
  assert.equal(profile.columns[2].type, "number");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].A, "123456");
});

test("รหัสพนักงานที่เก็บเป็นตัวเลขต้องออกมาเป็น 123456 ไม่ใช่ 123456.0", async () => {
  const data = await book([
    { name: "s", rows: [["รหัสพนักงาน"], [123456], [123457]] },
  ]);
  const { rows } = await profileWorkbook(data, "a.xlsx");
  assert.deepEqual(rows.map((r) => r.A), ["123456", "123457"]);
});

test("ข้ามชีตว่างไปหาชีตแรกที่มีข้อมูลจริง และบอกจำนวนชีตทั้งไฟล์", async () => {
  const data = await book([
    { name: "ปก", rows: [] },
    { name: "ข้อมูล", rows: [["รหัสพนักงาน", "ยอดหัก"], ["1", 50]] },
    { name: "หมายเหตุ", rows: [["x"]] },
  ]);
  const { profile } = await profileWorkbook(data, "a.xlsx");
  assert.equal(profile.sheetName, "ข้อมูล");
  assert.equal(profile.sheetCount, 3);
});

test("หาหัวตารางที่ไม่ได้อยู่แถวแรกได้ — ไฟล์จริงมีหัวเรื่องคร่อมอยู่ข้างบน", async () => {
  const data = await book([
    {
      name: "s",
      rows: [
        ["สรุปค่าเที่ยว เดือน ก.ย. 69"],
        [],
        ["รหัสพนักงาน", "ชื่อ-นามสกุล", "จำนวนเงิน"],
        ["1", "ก ข", 10],
      ],
    },
  ]);
  const { profile } = await profileWorkbook(data, "a.xlsx");
  assert.equal(profile.headerRow, 3);
  assert.equal(profile.totalRows, 1);
});

test("เซลล์ที่มีแต่เว้นวรรคนับเป็นช่องว่าง ไม่ใช่ข้อความ", async () => {
  const data = await book([
    { name: "s", rows: [["รหัสพนักงาน"], ["1"], ["   "], ["3"]] },
  ]);
  const { profile } = await profileWorkbook(data, "a.xlsx");
  assert.equal(profile.columns[0].empty, 1);
  assert.equal(profile.columns[0].valid, 2);
});

test("ชนิดข้อมูลตัดสินจากเสียงข้างมาก แล้วตัวที่ผิดชนิดถูกชี้เป็นแถว", async () => {
  const data = await book([
    { name: "s", rows: [["จำนวนเงิน"], [100], [200], ["ไม่มี"], [300]] },
  ]);
  const { profile } = await profileWorkbook(data, "a.xlsx");
  const col = profile.columns[0];
  assert.equal(col.type, "number");
  assert.equal(col.mismatch, 1);
  assert.equal(col.badCells?.[0].row, "4");
  assert.equal(col.badCells?.[0].value, "ไม่มี");
});

test("คอลัมน์ที่ไม่มีหัว ได้สถานะ skip ไม่ใช่ error", async () => {
  const data = await book([
    { name: "s", rows: [["รหัสพนักงาน", ""], ["1", "x"]] },
  ]);
  const { profile } = await profileWorkbook(data, "a.xlsx");
  assert.equal(profile.columns[1].state, "skip");
});

test("หาตัวอักษรคอลัมน์จากชื่อหัวได้ แม้หัวมีช่องว่างเกิน", async () => {
  const data = await book([
    { name: "s", rows: [["รหัสพนักงาน", " จำนวน เงิน "], ["1", 5]] },
  ]);
  const { profile } = await profileWorkbook(data, "a.xlsx");
  assert.equal(headerLetter(profile, "จำนวนเงิน"), "B");
  assert.equal(headerLetter(profile, "ไม่มีคอลัมน์นี้"), undefined);
});

test("ไฟล์ที่ไม่ใช่ .xlsx จริงต้องได้ข้อความที่อ่านรู้เรื่อง", async () => {
  const notXlsx = new TextEncoder().encode("นี่คือ csv,จริง ๆ").buffer;
  await assert.rejects(
    () => profileWorkbook(notXlsx, "a.xlsx"),
    /อ่านไฟล์ไม่ได้/,
  );
});
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/lib/payroll/parse'`

- [ ] **Step 3: เขียน `parse.ts`**

```ts
import ExcelJS from "exceljs";

import type { BadCell, CellType, ColumnProfile, FileProfile } from "./profile";

/**
 * อ่าน `.xlsx` จริงแล้วคืนผลหน้าตาเดียวกับ `SAMPLE_PROFILE` เป๊ะ — **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 *
 * ทำตามกติกาสามข้อที่ `profile.ts` ประกาศไว้ ไม่เปลี่ยน:
 * 1. อ่านครบทุกแถว ไม่สุ่ม
 * 2. ชนิดข้อมูลตัดสินจากเสียงข้างมาก ที่เหลือคือ `mismatch`
 * 3. เซลล์ที่มีแต่เว้นวรรคนับเป็นช่องว่าง
 *
 * คืน `rows` ติดมาด้วยเพราะด่านตรวจ (`rules.ts`) ต้องดูค่าในเซลล์จริง ไม่ใช่แค่ยอดรวม
 * รายคอลัมน์ — เช่น "เงินเพิ่มติดลบ" หรือ "รหัสวันที่ไม่รู้จัก" ดูจากตัวเลขสรุปไม่ได้
 */
export interface ParsedFile {
  profile: FileProfile;
  /** คีย์เป็นตัวอักษรคอลัมน์ ตรงกับ `ColumnProfile.letter` · ค่าเป็นข้อความที่ trim แล้ว */
  rows: Record<string, string>[];
}

/** หัวคอลัมน์ในไฟล์จริงมีช่องว่างเกินและ non-breaking space ปนมาเสมอ */
export const normalizeHeader = (value: string): string =>
  value.replace(/ /g, " ").replace(/\s+/g, "").trim();

export const headerLetter = (
  profile: FileProfile,
  header: string,
): string | undefined =>
  profile.columns.find((c) => normalizeHeader(c.header) === normalizeHeader(header))
    ?.letter;

/** จำนวนเซลล์ที่ไม่ว่างขั้นต่ำที่ถือว่าแถวนั้นเป็นหัวตาราง */
const HEADER_MIN_CELLS = 2;
/** มองหาหัวตารางในสิบแถวแรกเท่านั้น — ลึกกว่านั้นคือไฟล์คนละเรื่อง */
const HEADER_SEARCH_ROWS = 10;

const text = (value: ExcelJS.CellValue): string => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  /* **ห้ามปล่อยให้เป็น 123456.0 หรือ 1.23456e+5** — รหัสพนักงานที่ Excel เก็บเป็น
     ตัวเลขต้องกลายเป็นข้อความที่จับคู่ได้ ไม่งั้นเสียทั้งไฟล์ · `String(123456)` ได้
     `"123456"` อยู่แล้ว ส่วนทศนิยมจริงปล่อยให้เป็นทศนิยมตามเดิม */
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    const rich = value as { text?: unknown; result?: unknown; richText?: { text: string }[] };
    if (Array.isArray(rich.richText)) return rich.richText.map((t) => t.text).join("");
    if (typeof rich.text === "string") return rich.text;
    if (rich.result !== undefined) return text(rich.result as ExcelJS.CellValue);
    return "";
  }
  return String(value);
};

const typeOf = (raw: ExcelJS.CellValue, value: string): CellType => {
  if (!value.trim()) return "empty";
  if (raw instanceof Date) return "date";
  if (typeof raw === "number") return "number";
  /* ตัวเลขที่เก็บเป็นข้อความยังนับเป็นข้อความ — ความต่างนี้คือสิ่งที่ด่านตรวจต้องจับ */
  return "text";
};

export async function profileWorkbook(
  data: ArrayBuffer,
  fileName: string,
): Promise<ParsedFile> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data);
  } catch {
    throw new Error(
      "อ่านไฟล์ไม่ได้ — ต้องเป็นไฟล์ Excel (.xlsx) ที่บันทึกจาก Excel จริง ไม่ใช่ไฟล์ที่เปลี่ยนนามสกุลมา",
    );
  }

  const sheets = wb.worksheets;
  if (!sheets.length) throw new Error("อ่านไฟล์ไม่ได้ — ไฟล์นี้ไม่มีชีตข้อมูลเลย");

  /* ชีตแรกที่มีหัวตารางจริง ไม่ใช่ชีตแรกเฉย ๆ — ไฟล์จริงมักมีชีตปกหรือชีตหมายเหตุ */
  let sheet = sheets[0];
  let headerRow = 0;
  for (const ws of sheets) {
    const found = findHeaderRow(ws);
    if (found) {
      sheet = ws;
      headerRow = found;
      break;
    }
  }
  if (!headerRow) {
    throw new Error(
      `อ่านไฟล์ไม่ได้ — หาหัวตารางในสิบแถวแรกของทุกชีตไม่เจอ (ไฟล์ "${fileName}")`,
    );
  }

  const headers = new Map<string, string>();
  sheet.getRow(headerRow).eachCell({ includeEmpty: false }, (cell) => {
    const letter = String(cell.address).replace(/\d+/g, "");
    headers.set(letter, text(cell.value).trim());
  });

  /* เก็บทุกคอลัมน์ที่ "มีหัว หรือมีข้อมูล" — คอลัมน์ที่ไม่มีหัวแต่มีข้อมูลต้องโผล่
     ให้เห็นในสถานะ skip ไม่ใช่หายไปเงียบ ๆ */
  const letters = new Set(headers.keys());
  const rows: Record<string, string>[] = [];
  const raws: Record<string, ExcelJS.CellValue>[] = [];

  for (let r = headerRow + 1; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const asText: Record<string, string> = {};
    const asRaw: Record<string, ExcelJS.CellValue> = {};
    let any = false;
    row.eachCell({ includeEmpty: false }, (cell) => {
      const letter = String(cell.address).replace(/\d+/g, "");
      const value = text(cell.value);
      letters.add(letter);
      asRaw[letter] = cell.value;
      asText[letter] = value.trim();
      if (value.trim()) any = true;
    });
    /* แถวว่างทั้งแถวไม่นับเป็นข้อมูล — ไฟล์ที่ส่งกันมีแถวว่างคั่นกลางเป็นปกติ */
    if (any) {
      rows.push(asText);
      raws.push(asRaw);
    }
  }

  const ordered = [...letters].sort(byColumnLetter);
  const columns = ordered.map((letter) =>
    profileColumn(letter, headers.get(letter) ?? "", rows, raws, headerRow),
  );

  return {
    profile: {
      fileName,
      sheetName: sheet.name,
      sheetCount: sheets.length,
      headerRow,
      totalRows: rows.length,
      columns,
    },
    rows,
  };
}

function findHeaderRow(ws: ExcelJS.Worksheet): number {
  const limit = Math.min(ws.rowCount, HEADER_SEARCH_ROWS);
  for (let r = 1; r <= limit; r += 1) {
    let filled = 0;
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
      if (text(cell.value).trim()) filled += 1;
    });
    if (filled >= HEADER_MIN_CELLS) return r;
  }
  return 0;
}

/** `AA` มาหลัง `Z` — เรียงด้วยความยาวก่อนแล้วค่อยตัวอักษร */
const byColumnLetter = (a: string, b: string): number =>
  a.length === b.length ? a.localeCompare(b) : a.length - b.length;

/** ชี้แถวที่ผิดไม่เกินห้าตัวอย่าง แล้วปิดท้ายด้วย `…` ตามรูปแบบของ `BadCell` */
const BAD_CELL_LIMIT = 5;

function profileColumn(
  letter: string,
  header: string,
  rows: Record<string, string>[],
  raws: Record<string, ExcelJS.CellValue>[],
  headerRow: number,
): ColumnProfile {
  const counts: Record<CellType, number> = { number: 0, text: 0, date: 0, empty: 0 };
  const seen = new Set<string>();

  rows.forEach((row, i) => {
    const value = row[letter] ?? "";
    counts[typeOf(raws[i][letter], value)] += 1;
    if (value) seen.add(value);
  });

  const nonEmpty = counts.number + counts.text + counts.date;
  const type: CellType =
    nonEmpty === 0
      ? "empty"
      : (["number", "date", "text"] as CellType[]).reduce((best, t) =>
          counts[t] > counts[best] ? t : best,
        "text");

  const valid = type === "empty" ? 0 : counts[type];
  const mismatch = nonEmpty - valid;

  const badCells: BadCell[] = [];
  if (mismatch > 0) {
    rows.forEach((row, i) => {
      if (badCells.length >= BAD_CELL_LIMIT) return;
      const value = row[letter] ?? "";
      const actual = typeOf(raws[i][letter], value);
      if (value && actual !== type) {
        badCells.push({
          row: String(headerRow + 1 + i),
          value,
          reason: `คอลัมน์นี้เป็น${type === "number" ? "ตัวเลข" : type === "date" ? "วันที่" : "ข้อความ"} แต่ค่านี้ไม่ใช่`,
        });
      }
    });
    if (mismatch > badCells.length) {
      badCells.push({ row: "…", value: `และอีก ${mismatch - badCells.length} แถว`, reason: "" });
    }
  }

  const samples = [...seen].slice(0, 3);

  return {
    letter,
    header,
    type,
    state: stateOf(header, nonEmpty, mismatch, rows.length),
    valid,
    mismatch,
    empty: rows.length - nonEmpty,
    distinct: seen.size,
    samples,
    ...(mismatch > 0 ? { issue: `มีค่าผิดชนิด ${mismatch} แถว`, badCells } : {}),
  };
}

/** ว่างเกินครึ่ง = ควรดู · ไม่มีหัวหรือว่างทั้งคอลัมน์ = ข้าม · ผิดชนิด = ต้องดู */
function stateOf(
  header: string,
  nonEmpty: number,
  mismatch: number,
  total: number,
): ColumnProfile["state"] {
  if (!header.trim() || nonEmpty === 0) return "skip";
  if (mismatch > 0) return "error";
  if (total > 0 && nonEmpty / total < 0.5) return "warn";
  return "ok";
}
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npm test`
Expected: PASS ทั้ง 9 เทสต์ของ `parse.test.ts`

- [ ] **Step 5: commit**

```bash
git add lib/payroll/parse.ts lib/payroll/parse.test.ts
git commit -m "payroll: อ่านไฟล์ .xlsx จริงด้วย exceljs คืนผลหน้าตาเดิมกับของตัวอย่าง"
```

---

### Task 4: ด่าน 1 — กฎที่ยืนยันแล้ว

**Files:**
- Create: `lib/payroll/rules.ts`
- Create: `lib/payroll/rules.test.ts`

**Interfaces:**
- Consumes: `ParsedFile`, `headerLetter`, `normalizeHeader` จาก `parse.ts` · `templateOf` จาก `template-spec.ts` · `classify`, `postedColumns`, `PAYEE_COLUMN`, `DEFAULT_PAYEE_COLUMN` จาก `classify.ts`
- Produces:
  - `type CheckSeverity = "error" | "warn" | "info"`
  - `type CheckStatus = "active" | "pending"`
  - `interface CheckResult { id: string; severity: CheckSeverity; status: CheckStatus; title: string; detail: string; rows?: string[]; blocking: boolean }`
  - `runChecks(itemId: string, parsed: ParsedFile): CheckResult[]`
  - `interface CheckTally { errors: number; warnings: number; pending: number; blocking: number }`
  - `summarize(results: CheckResult[]): CheckTally`

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน**

`lib/payroll/rules.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { classify, postedColumns, type MoneyEffect } from "@/lib/payroll/classify";
import type { FileProfile } from "@/lib/payroll/profile";
import type { ParsedFile } from "@/lib/payroll/parse";
import { runChecks, summarize } from "@/lib/payroll/rules";
import { templateOf } from "@/lib/payroll/template-spec";

/**
 * ไฟล์สมมติที่หัวคอลัมน์ตรงสเปกของรายการนั้น แล้วค่อยทำให้ผิดทีละข้อในแต่ละเทสต์
 *
 * **ชื่อคอลัมน์เงินอ่านจาก `postedColumns()` ไม่เขียนทับด้วยมือ** — ชื่อจริงต่างกัน
 * ทุกรายการ (#13 คือ `ยอดหักเงิน(บาท)` · #11 คือ `รางวัล TA(บาท)` · #17 คือ `จำนวนเงิน`)
 * เขียนทับด้วยมือเมื่อไหร่ เทสต์จะกรอกค่าลงคอลัมน์ที่ไม่มีอยู่ แล้วผ่านเพราะไม่มีอะไร
 * ให้ตรวจ ไม่ใช่เพราะกฎทำงาน
 */
const payeeCol = (itemId: string) => classify(itemId)!.payeeColumn;
const moneyCol = (itemId: string, effect: MoneyEffect) =>
  postedColumns(itemId).find((p) => p.effect === effect)!.column;

function parsed(itemId: string, rows: Record<string, string>[]): ParsedFile {
  const columns = templateOf(itemId)!.columns;
  const letters = columns.map((_, i) => String.fromCharCode(65 + i));
  const profile: FileProfile = {
    fileName: `${itemId}.xlsx`,
    sheetName: "s",
    sheetCount: 1,
    headerRow: 1,
    totalRows: rows.length,
    columns: columns.map((header, i) => ({
      letter: letters[i],
      header,
      type: "text",
      state: "ok",
      valid: rows.length,
      mismatch: 0,
      empty: 0,
      distinct: rows.length,
      samples: [],
    })),
  };
  const byLetter = rows.map((row) => {
    const out: Record<string, string> = {};
    for (const [header, value] of Object.entries(row)) {
      const at = columns.indexOf(header);
      if (at >= 0) out[letters[at]] = value;
    }
    return out;
  });
  return { profile, rows: byLetter };
}

const ids = (results: ReturnType<typeof runChecks>) => results.map((r) => r.id).sort();

test("ไฟล์ที่ถูกต้องไม่มีข้อผิดพลาดที่บล็อก", () => {
  const file = parsed("13", [
    { [payeeCol("13")]: "123456", [moneyCol("13", "หัก")]: "500" },
  ]);
  const tally = summarize(runChecks("13", file));
  assert.equal(tally.blocking, 0);
});

test("ขาดคอลัมน์ตามสเปก = ข้อผิดพลาดที่บล็อก", () => {
  const money = moneyCol("13", "หัก");
  const file = parsed("13", [{ [payeeCol("13")]: "123456", [money]: "500" }]);
  file.profile.columns = file.profile.columns.filter((c) => c.header !== money);
  const results = runChecks("13", file);
  assert.ok(ids(results).includes("columns.missing"));
  assert.equal(results.find((r) => r.id === "columns.missing")?.blocking, true);
});

test("หัวคอลัมน์ที่มีช่องว่างเกินยังนับว่าตรงสเปก", () => {
  const money = moneyCol("13", "หัก");
  const file = parsed("13", [{ [payeeCol("13")]: "1", [money]: "5" }]);
  const col = file.profile.columns.find((c) => c.header === money)!;
  /* แทรกช่องว่างกลางชื่อและหัวท้าย — ไฟล์จริงมาแบบนี้เสมอ */
  col.header = ` ${money.slice(0, 3)} ${money.slice(3)} `;
  assert.ok(!ids(runChecks("13", file)).includes("columns.missing"));
});

test("คอลัมน์เงินเข้าใครว่างแม้แถวเดียวก็บล็อก และบอกเลขแถว", () => {
  const money = moneyCol("13", "หัก");
  const file = parsed("13", [
    { [payeeCol("13")]: "123456", [money]: "500" },
    { [payeeCol("13")]: "", [money]: "300" },
  ]);
  const found = runChecks("13", file).find((r) => r.id === "payee.blank");
  assert.equal(found?.blocking, true);
  assert.deepEqual(found?.rows, ["3"]);
});

test("ค่าครูฝึกตรวจช่อง รหัสครูฝึก ไม่ใช่ รหัสพนักงาน", () => {
  assert.equal(payeeCol("10"), "รหัสครูฝึก");
  const file = parsed("10", [{ "รหัสพนักงาน": "123456", "รหัสครูฝึก": "" }]);
  const found = runChecks("10", file).find((r) => r.id === "payee.blank");
  assert.ok(found?.detail.includes("รหัสครูฝึก"));
});

test("ช่องเงินที่เก็บเป็นข้อความ = ข้อผิดพลาด", () => {
  const file = parsed("13", [
    { [payeeCol("13")]: "1", [moneyCol("13", "หัก")]: "ห้าร้อย" },
  ]);
  const found = runChecks("13", file).find((r) => r.id === "money.not-number");
  assert.equal(found?.blocking, true);
});

test("ช่องเงินเพิ่มติดลบ = ข้อผิดพลาด เพราะกรอกผิดช่อง", () => {
  const file = parsed("11", [
    { [payeeCol("11")]: "1", [moneyCol("11", "เพิ่ม")]: "-200" },
  ]);
  const found = runChecks("11", file).find((r) => r.id === "money.negative");
  assert.equal(found?.blocking, true);
});

test("ช่องเงินว่างทั้งคอลัมน์ = เตือน ไม่บล็อก (อาจเป็นเดือนที่ไม่มีรายการจริง)", () => {
  const file = parsed("13", [{ [payeeCol("13")]: "1", [moneyCol("13", "หัก")]: "" }]);
  const found = runChecks("13", file).find((r) => r.id === "money.all-blank");
  assert.equal(found?.severity, "warn");
  assert.equal(found?.blocking, false);
});

test("ไฟล์ไม่มีแถวข้อมูลเลย = ข้อผิดพลาด", () => {
  const found = runChecks("13", parsed("13", [])).find((r) => r.id === "file.empty");
  assert.equal(found?.blocking, true);
});

test("รหัสเดียวซ้ำหลายแถว = เตือน พร้อมบอกว่าซ้ำกี่รหัส", () => {
  const money = moneyCol("13", "หัก");
  const file = parsed("13", [
    { [payeeCol("13")]: "1", [money]: "5" },
    { [payeeCol("13")]: "1", [money]: "7" },
  ]);
  const found = runChecks("13", file).find((r) => r.id === "payee.duplicate");
  assert.equal(found?.severity, "warn");
});

test("summarize นับแยก error / warn / pending / blocking", () => {
  const tally = summarize([
    { id: "a", severity: "error", status: "active", title: "", detail: "", blocking: true },
    { id: "b", severity: "error", status: "pending", title: "", detail: "", blocking: false },
    { id: "c", severity: "warn", status: "active", title: "", detail: "", blocking: false },
  ]);
  assert.deepEqual(tally, { errors: 2, warnings: 1, pending: 1, blocking: 1 });
});
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/lib/payroll/rules'`

- [ ] **Step 3: เขียน `rules.ts` ส่วนกฎที่ยืนยันแล้ว**

```ts
import { classify, postedColumns } from "./classify";
import { headerLetter, normalizeHeader, type ParsedFile } from "./parse";
import { templateOf } from "./template-spec";

/**
 * ด่าน 1 — ระบบตรวจไฟล์ให้ก่อนที่ HR จะมาตรวจ
 *
 * **`status` สำคัญเท่า `severity`** — `"pending"` คือกฎที่เรารู้ว่าต้องตรวจ แต่ยังไม่มี
 * คำตอบจากฝ่ายที่เป็นเจ้าของกติกา (ความหมายรหัสวัน 17 จาก 24 ตัว · ทิศทางเงิน 4 รายการ ·
 * Tiger Soft รับช่องรวมหรือช่องย่อย) กฎพวกนี้ **ขึ้นบนจอได้แต่บล็อกใครไม่ได้**
 * เพราะเดาแล้วบล็อกคือหยุดเงินเดือนด้วยกติกาที่เราแต่งขึ้นเอง และเดาแล้วปล่อยคือ
 * จ่ายผิดโดยไม่มีใครรู้ · `blocking` จึงเป็น `severity === "error" && status === "active"`
 * เท่านั้น และคำนวณที่นี่ที่เดียว อย่าคำนวณซ้ำในคอมโพเนนต์
 */
export type CheckSeverity = "error" | "warn" | "info";
export type CheckStatus = "active" | "pending";

export interface CheckResult {
  /** คีย์คงที่สำหรับอ้างอิงในเทสต์และในบันทึก — ไม่ใช่ข้อความบนจอ */
  id: string;
  severity: CheckSeverity;
  status: CheckStatus;
  title: string;
  detail: string;
  /** เลขแถวในไฟล์ที่เป็นต้นเหตุ — ว่างคือเป็นเรื่องของทั้งไฟล์ */
  rows?: string[];
  blocking: boolean;
}

export interface CheckTally {
  errors: number;
  warnings: number;
  pending: number;
  blocking: number;
}

const ROW_LIMIT = 20;

const make = (
  r: Omit<CheckResult, "blocking">,
): CheckResult => ({ ...r, blocking: r.severity === "error" && r.status === "active" });

export function summarize(results: CheckResult[]): CheckTally {
  return {
    errors: results.filter((r) => r.severity === "error").length,
    warnings: results.filter((r) => r.severity === "warn").length,
    pending: results.filter((r) => r.status === "pending").length,
    blocking: results.filter((r) => r.blocking).length,
  };
}

const numberOf = (value: string): number | null => {
  const cleaned = value.replace(/,/g, "").replace(/\s/g, "").replace(/฿/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

export function runChecks(itemId: string, parsed: ParsedFile): CheckResult[] {
  const spec = templateOf(itemId);
  const cls = classify(itemId);
  if (!spec || !cls) {
    return [
      make({
        id: "item.unknown",
        severity: "error",
        status: "active",
        title: "ไม่รู้จักรายการนี้",
        detail: `รายการ #${itemId} ไม่มีในทะเบียนรับข้อมูล — ตรวจว่าเลือกรายการถูกช่องหรือไม่`,
      }),
    ];
  }

  const out: CheckResult[] = [];
  const { profile, rows } = parsed;
  const rowNo = (i: number) => String(profile.headerRow + 1 + i);

  /* ── ไฟล์เปล่า ───────────────────────────────────────────────── */
  if (rows.length === 0) {
    out.push(
      make({
        id: "file.empty",
        severity: "error",
        status: "active",
        title: "ไฟล์ไม่มีแถวข้อมูล",
        detail: `อ่านชีต "${profile.sheetName}" แล้วไม่พบแถวใต้หัวตารางเลย — ส่งไฟล์ที่กรอกข้อมูลแล้ว`,
      }),
    );
    return out;
  }

  /* ── หัวคอลัมน์ตรงสเปกไหม ─────────────────────────────────────── */
  const have = new Set(profile.columns.map((c) => normalizeHeader(c.header)));
  const missing = spec.columns.filter((c) => !have.has(normalizeHeader(c)));
  if (missing.length) {
    out.push(
      make({
        id: "columns.missing",
        severity: "error",
        status: spec.confirmed ? "active" : "pending",
        title: `ขาดคอลัมน์ ${missing.length} ช่อง`,
        detail: spec.confirmed
          ? `ไฟล์นี้ต้องมีช่อง ${missing.join(" · ")} — ดาวน์โหลดแบบฟอร์มจากระบบแล้วกรอกบนฟอร์มนั้น`
          : `แบบฟอร์มของรายการนี้ยังเป็นร่าง (${spec.source}) จึงยังเทียบคอลัมน์แบบบังคับไม่ได้ — ช่องที่ยังไม่พบคือ ${missing.join(" · ")}`,
      }),
    );
  }

  const extra = profile.columns
    .filter((c) => c.header.trim() && !spec.columns.some((s) => normalizeHeader(s) === normalizeHeader(c.header)))
    .map((c) => c.header.trim());
  if (extra.length) {
    out.push(
      make({
        id: "columns.extra",
        severity: "warn",
        status: "active",
        title: `มีคอลัมน์เกินจากแบบฟอร์ม ${extra.length} ช่อง`,
        detail: `ช่องที่ไม่อยู่ในแบบฟอร์ม: ${extra.slice(0, 8).join(" · ")}${extra.length > 8 ? " …" : ""} — ระบบไม่อ่านช่องพวกนี้ ถ้าเป็นข้อมูลที่ต้องใช้ต้องแจ้งก่อน`,
      }),
    );
  }

  /* ── เงินเข้าใคร ──────────────────────────────────────────────── */
  const payeeLetter = headerLetter(profile, cls.payeeColumn);
  if (!payeeLetter) {
    out.push(
      make({
        id: "payee.column-missing",
        severity: "error",
        status: "active",
        title: `ไม่พบช่อง ${cls.payeeColumn}`,
        detail: `รายการนี้จับคู่คนที่ได้เงินด้วยช่อง "${cls.payeeColumn}" — ไม่มีช่องนี้ก็ไม่รู้ว่าเงินเข้าใคร`,
      }),
    );
  } else {
    const blank = rows.map((r, i) => (r[payeeLetter]?.trim() ? null : rowNo(i))).filter(Boolean) as string[];
    if (blank.length) {
      out.push(
        make({
          id: "payee.blank",
          severity: "error",
          status: "active",
          title: `ช่อง ${cls.payeeColumn} ว่าง ${blank.length} แถว`,
          detail: `ช่องอื่นว่างได้ (แปลว่าคนนั้นไม่มีรายการนั้น) แต่ "${cls.payeeColumn}" ว่างแปลว่าเงินก้อนนั้นไม่รู้จะเข้าใคร`,
          rows: blank.slice(0, ROW_LIMIT),
        }),
      );
    }

    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = row[payeeLetter]?.trim();
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const dup = [...counts.entries()].filter(([, n]) => n > 1);
    if (dup.length) {
      out.push(
        make({
          id: "payee.duplicate",
          severity: "warn",
          status: "active",
          title: `มีรหัสซ้ำ ${dup.length} รหัส`,
          detail: `${dup.slice(0, 5).map(([k, n]) => `${k} (${n} แถว)`).join(" · ")}${dup.length > 5 ? " …" : ""} — ซ้ำได้ถ้าคนเดียวมีหลายรายการจริง แต่ถ้าเป็นการกรอกซ้ำ เงินจะเข้าสองครั้ง`,
        }),
      );
    }
  }

  /* ── ช่องเงิน ─────────────────────────────────────────────────── */
  for (const { column, effect } of postedColumns(itemId)) {
    const letter = headerLetter(profile, column);
    if (!letter) continue;

    const values = rows.map((r, i) => ({ raw: r[letter]?.trim() ?? "", at: rowNo(i) }));
    const filled = values.filter((v) => v.raw);

    if (filled.length === 0) {
      out.push(
        make({
          id: "money.all-blank",
          severity: "warn",
          status: "active",
          title: `ช่อง ${column} ว่างทั้งคอลัมน์`,
          detail: "ถ้าเดือนนี้ไม่มีรายการจริงก็ถูกแล้ว — ยืนยันกับผู้ส่งสักครั้งก่อนรับเข้ารอบ",
        }),
      );
      continue;
    }

    const notNumber = filled.filter((v) => numberOf(v.raw) === null);
    if (notNumber.length) {
      out.push(
        make({
          id: "money.not-number",
          severity: "error",
          status: "active",
          title: `ช่อง ${column} มีค่าที่ไม่ใช่ตัวเลข ${notNumber.length} แถว`,
          detail: `ค่าตัวอย่าง: ${notNumber.slice(0, 3).map((v) => `"${v.raw}"`).join(" · ")} — ช่องเงินต้องเป็นตัวเลขล้วน ไม่ใส่หน่วยหรือหมายเหตุ`,
          rows: notNumber.slice(0, ROW_LIMIT).map((v) => v.at),
        }),
      );
    }

    /* **เครื่องหมายตรวจได้เฉพาะช่องที่ยืนยันทิศทางเงินแล้ว** — ช่องที่ยัง "รอยืนยัน"
       ไปโผล่ในกฎ pending ของงานที่ 5 ไม่ใช่ที่นี่ */
    if (effect === "เพิ่ม" || effect === "หัก") {
      const wrongSign = filled
        .map((v) => ({ ...v, n: numberOf(v.raw) }))
        .filter((v) => v.n !== null && v.n < 0);
      if (wrongSign.length) {
        out.push(
          make({
            id: "money.negative",
            severity: "error",
            status: "active",
            title: `ช่อง ${column} มีค่าติดลบ ${wrongSign.length} แถว`,
            detail:
              effect === "เพิ่ม"
                ? `"${column}" เป็นเงินเพิ่ม ค่าติดลบแปลว่ากรอกผิดช่อง — ถ้าต้องการหักเงินให้ใช้ช่องหักของรายการนั้น`
                : `"${column}" เป็นเงินหักอยู่แล้ว กรอกเป็นจำนวนบวก ไม่ต้องใส่เครื่องหมายลบ ไม่งั้นจะกลายเป็นจ่ายเพิ่ม`,
            rows: wrongSign.slice(0, ROW_LIMIT).map((v) => v.at),
          }),
        );
      }
    }
  }

  return out;
}
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npm test`
Expected: PASS ทุกเทสต์ใน `rules.test.ts`

- [ ] **Step 5: commit**

```bash
git add lib/payroll/rules.ts lib/payroll/rules.test.ts
git commit -m "payroll: ด่าน 1 กฎที่ยืนยันแล้ว — คอลัมน์ เงินเข้าใคร และช่องเงิน"
```

---

### Task 5: ด่าน 1 — กฎที่ยังรอฝ่ายยืนยัน

**Files:**
- Modify: `lib/payroll/rules.ts`
- Modify: `lib/payroll/rules.test.ts`

**Interfaces:**
- Consumes: `DAY_CODES`, `hasDayGrid` จาก `template-spec.ts` · `MONEY_COLUMNS`, `DATA_MONTH_OFFSET` จาก `classify.ts`
- Produces: เพิ่ม `CheckResult` ที่ `status: "pending"` จาก `runChecks` เดิม — ไม่เพิ่มฟังก์ชันใหม่ที่คนอื่นต้องเรียก

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน (ต่อท้าย `rules.test.ts`)**

```ts
test("รหัสวันที่ไม่อยู่ในชุด 24 ตัว = ข้อผิดพลาดที่บล็อก", () => {
  const file = parsed("01", [{ [payeeCol("01")]: "1", "1": "ZZ" }]);
  const found = runChecks("01", file).find((r) => r.id === "daycode.unknown");
  assert.equal(found?.blocking, true);
});

test("รหัสวันที่อยู่ในชุดแต่ยังไม่รู้ความหมาย = รอยืนยัน ไม่บล็อก", () => {
  const file = parsed("01", [{ [payeeCol("01")]: "1", "1": "Aส" }]);
  const found = runChecks("01", file).find((r) => r.id === "daycode.meaning-pending");
  assert.equal(found?.status, "pending");
  assert.equal(found?.blocking, false);
  assert.ok(found?.detail.includes("ฝ่ายจัดส่ง"));
});

test("รายการที่ยังไม่ยืนยันทิศทางเงิน ได้ผลตรวจรอยืนยัน และไม่มีกฎเครื่องหมายมาบล็อก", () => {
  const file = parsed("17", [
    { [payeeCol("17")]: "1", [moneyCol("17", "รอยืนยัน")]: "-100" },
  ]);
  const results = runChecks("17", file);
  const pending = results.find((r) => r.id === "money.effect-pending");
  assert.equal(pending?.status, "pending");
  assert.equal(pending?.blocking, false);
  assert.equal(results.some((r) => r.id === "money.negative"), false);
  assert.ok(pending?.detail.includes("ยานยนต์"));
});

test("รายการที่รอ Tiger Soft เคาะช่องรวม/ช่องย่อย ได้ผลตรวจรอยืนยัน", () => {
  const file = parsed("08", [{ [payeeCol("08")]: "1" }]);
  const found = runChecks("08", file).find((r) => r.id === "tigersoft.shape-pending");
  assert.equal(found?.status, "pending");
  assert.ok(found?.detail.includes("HR"));
});

test("กฎรอยืนยันไม่เคยทำให้ blocking เพิ่มขึ้น ไม่ว่ารายการไหน", () => {
  for (const id of ["14", "15", "17", "18", "08", "23"]) {
    const spec = templateOf(id)!;
    const row: Record<string, string> = {};
    for (const c of spec.columns) row[c] = c.includes("รหัส") ? "1" : "";
    const results = runChecks(id, parsed(id, [row]));
    for (const r of results.filter((x) => x.status === "pending")) {
      assert.equal(r.blocking, false, `${id}/${r.id} ต้องไม่บล็อก`);
    }
  }
});
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `npm test`
Expected: FAIL — ไม่พบ `daycode.unknown`

- [ ] **Step 3: เติมกฎรอยืนยันใน `rules.ts`**

เพิ่ม import และบล็อกนี้ก่อน `return out` ใน `runChecks`:

```ts
import { DAY_CODES, hasDayGrid } from "./template-spec";
import { MONEY_COLUMNS } from "./classify";

/* ── ตารางสถานะรายวัน ────────────────────────────────────────────
   รหัสที่ไม่อยู่ในชุด 24 ตัวเลย = ผิดแน่ บล็อกได้ · รหัสที่อยู่ในชุดแต่ `meaning`
   ยังว่าง = **เรายังไม่รู้ว่าวันนั้นได้เงินหรือไม่** ห้ามบล็อกและห้ามปล่อยเงียบ
   ต้องขึ้นบนจอว่ารออะไรจากใคร */
if (hasDayGrid(spec.columns)) {
  const known = new Map(DAY_CODES.map((d) => [d.code.toUpperCase(), d.meaning]));
  const dayLetters = spec.columns
    .filter((c) => /^\d+$/.test(c))
    .map((c) => headerLetter(profile, c))
    .filter(Boolean) as string[];

  const unknown = new Map<string, string[]>();
  const pending = new Set<string>();

  rows.forEach((row, i) => {
    for (const letter of dayLetters) {
      const code = row[letter]?.trim();
      if (!code) continue;
      const meaning = known.get(code.toUpperCase());
      if (meaning === undefined) {
        const at = unknown.get(code) ?? [];
        if (at.length < 3) at.push(rowNo(i));
        unknown.set(code, at);
      } else if (!meaning) {
        pending.add(code);
      }
    }
  });

  if (unknown.size) {
    out.push(
      make({
        id: "daycode.unknown",
        severity: "error",
        status: "active",
        title: `มีรหัสวันที่ไม่รู้จัก ${unknown.size} รหัส`,
        detail: `${[...unknown.keys()].slice(0, 8).join(" · ")} — ไม่อยู่ในชุดรหัส 24 ตัวที่ระบบรู้จัก · ระวังอย่าใช้รหัสของเครื่องลงเวลา TA100 ปนมา เพราะ "A" ของสองชุดแปลไม่เหมือนกัน`,
        rows: [...unknown.values()].flat().slice(0, ROW_LIMIT),
      }),
    );
  }

  if (pending.size) {
    out.push(
      make({
        id: "daycode.meaning-pending",
        severity: "warn",
        status: "pending",
        title: `มีรหัสวันที่ยังไม่ยืนยันความหมาย ${pending.size} รหัส`,
        detail: `${[...pending].join(" · ")} — ยังรอฝ่ายจัดส่งยืนยันว่าวันนั้นนับเป็นวันทำงานหรือไม่ · ระบบจึงยังคิดวันทำงานจากไฟล์นี้ให้ไม่ได้ และไม่บล็อกการรับเข้ารอบ`,
      }),
    );
  }
}

/* ── ทิศทางเงินที่ยังไม่ยืนยัน ──────────────────────────────────── */
const WAITING_OWNER: Record<string, string> = {
  "14": "บัญชีกรุงเทพ",
  "15": "บัญชีกรุงเทพ",
  "17": "ยานยนต์",
  "18": "ยานยนต์",
};
const unconfirmed = Object.entries(MONEY_COLUMNS[itemId] ?? {})
  .filter(([, effect]) => effect === "รอยืนยัน")
  .map(([column]) => column);
if (unconfirmed.length) {
  out.push(
    make({
      id: "money.effect-pending",
      severity: "warn",
      status: "pending",
      title: "ยังไม่ยืนยันว่าเงินก้อนนี้เพิ่มหรือหัก",
      detail: `ช่อง ${unconfirmed.join(" · ")} ยังรอ${WAITING_OWNER[itemId] ?? "ฝ่ายเจ้าของข้อมูล"}ยืนยันว่าเป็นเงินเพิ่มหรือเงินหัก — ระบบจึงตรวจเครื่องหมายให้ไม่ได้ ต้องให้คนดูยอดเองก่อนรับเข้ารอบ`,
    }),
  );
}

/* ── รูปแบบที่ Tiger Soft รับ ────────────────────────────────────── */
const TIGERSOFT_PENDING: Record<string, string> = {
  "08": "เงินรางวัลมี 4 ช่องย่อย",
  "23": "ค่าน้ำกับค่าไฟแยกกันสองช่อง",
};
if (TIGERSOFT_PENDING[itemId]) {
  out.push(
    make({
      id: "tigersoft.shape-pending",
      severity: "info",
      status: "pending",
      title: "ยังไม่เคาะว่าจะส่งเข้า Tiger Soft เป็นช่องรวมหรือช่องย่อย",
      detail: `${TIGERSOFT_PENDING[itemId]} — รอ HR ค่าจ้างและสวัสดิการเคาะว่า Tiger Soft รับยอดรวมหรือรับแยกช่อง · ไม่กระทบการรับเข้ารอบ แต่กระทบตอนทำไฟล์นำเข้า`,
    }),
  );
}
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npm test`
Expected: PASS ทั้งหมด

- [ ] **Step 5: ตรวจว่าทะเบียนยังสอดคล้องกัน**

Run: `npm run verify:payroll`
Expected: `ตรวจผ่านทุกข้อ ✓`

- [ ] **Step 6: commit**

```bash
git add lib/payroll/rules.ts lib/payroll/rules.test.ts
git commit -m "payroll: ด่าน 1 กฎที่รอฝ่ายยืนยัน — แสดงผลได้แต่บล็อกใครไม่ได้"
```

---

### Task 6: เก็บไฟล์ + เส้น `POST /api/payroll/parse`

**Files:**
- Create: `lib/payroll/intake-files.ts`
- Create: `app/api/payroll/parse/route.ts`
- Create: `app/api/payroll/files/[fileId]/route.ts`

**Interfaces:**
- Consumes: `GridFSBucket` จาก `mongodb` · `getDb` จาก `lib/mongo.ts` · `profileWorkbook` (งานที่ 3) · `runChecks`, `summarize` (งานที่ 4–5) · `canUploadItem` (งานที่ 1)
- Produces:
  - `MAX_INTAKE_FILE_BYTES = 10 * 1024 * 1024`
  - `interface StoredIntakeFile { fileId: string; name: string; size: number }`
  - `saveIntakeFile(file: File, meta: { period: string; itemId: string; uploadedBy: string }): Promise<StoredIntakeFile>`
  - `openIntakeFile(fileId: string): Promise<{ name: string; type: string; stream: NodeJS.ReadableStream } | null>`
  - `POST /api/payroll/parse` → `{ profile: FileProfile; checks: CheckResult[]; tally: CheckTally; file: StoredIntakeFile }`
  - `GET /api/payroll/files/{fileId}` → ตัวไฟล์

- [ ] **Step 1: เขียน `lib/payroll/intake-files.ts`**

```ts
import { GridFSBucket, ObjectId } from "mongodb";

import { getDb } from "../mongo";

/**
 * ไฟล์ที่ฝ่ายส่งเข้ามาในแต่ละรอบ — เก็บใน **GridFS** ไม่ได้ขึ้น Spaces
 *
 * presign API ของบริษัทมี allow-list เป็นนามสกุลรูปเท่านั้น (`lib/record-files.ts`
 * บันทึกการทดลองไว้ 19 ส.ค. 2569) ยิง `.xlsx` ไปจะได้ 400 · และไฟล์พวกนี้
 * **ต้องไม่เป็นสาธารณะ** เพราะในไฟล์มีรหัสพนักงานกับยอดเงินรายคน ลิงก์ Spaces
 * ที่ใครมีลิงก์ก็เปิดได้จึงไม่เหมาะตั้งแต่ต้น
 *
 * **เก็บไฟล์ไว้เพราะ HR ต้องย้อนดูได้ว่าอะไรผ่านไปแล้ว** — ของเดิมบันทึกแค่ชื่อไฟล์
 * ซึ่งแปลว่าหลังปิดรอบไม่มีใครตรวจซ้ำได้ว่าเงินที่จ่ายมาจากไฟล์หน้าตาแบบไหน
 */
const BUCKET = "payroll_intake_files";

export const MAX_INTAKE_FILE_BYTES = 10 * 1024 * 1024;

export const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface StoredIntakeFile {
  fileId: string;
  name: string;
  size: number;
}

async function bucket(): Promise<GridFSBucket> {
  return new GridFSBucket(await getDb(), { bucketName: BUCKET });
}

export async function saveIntakeFile(
  file: File,
  meta: { period: string; itemId: string; uploadedBy: string },
): Promise<StoredIntakeFile> {
  const data = Buffer.from(await file.arrayBuffer());
  const gfs = await bucket();
  const upload = gfs.openUploadStream(file.name, {
    metadata: { ...meta, contentType: XLSX_TYPE, uploadedAt: new Date().toISOString() },
  });
  await new Promise<void>((resolve, reject) => {
    upload.on("finish", () => resolve());
    upload.on("error", reject);
    upload.end(data);
  });
  return { fileId: String(upload.id), name: file.name, size: data.byteLength };
}

export async function openIntakeFile(fileId: string) {
  if (!ObjectId.isValid(fileId)) return null;
  const gfs = await bucket();
  const [meta] = await gfs.find({ _id: new ObjectId(fileId) }).limit(1).toArray();
  if (!meta) return null;
  return {
    name: meta.filename,
    type: XLSX_TYPE,
    itemId: (meta.metadata as { itemId?: string } | undefined)?.itemId ?? "",
    stream: gfs.openDownloadStream(new ObjectId(fileId)),
  };
}
```

- [ ] **Step 2: เขียน `app/api/payroll/parse/route.ts`**

```ts
import type { NextRequest } from "next/server";

import { badRequest, fail, forbidden, ok, unauthorized } from "@/app/api/_lib/respond";
import { getDeskIdentity, readSessionUser } from "@/lib/auth/session";
import { MAX_INTAKE_FILE_BYTES, saveIntakeFile, XLSX_TYPE } from "@/lib/payroll/intake-files";
import { profileWorkbook } from "@/lib/payroll/parse";
import { runChecks, summarize } from "@/lib/payroll/rules";
import { canUploadItem } from "@/lib/payroll/scope";

/**
 * `POST /api/payroll/parse` — รับไฟล์ที่ฝ่ายส่งมา แล้วคืนผลวิเคราะห์ + ผลตรวจด่าน 1
 *
 * **เก็บไฟล์ก่อนตรวจ** โดยตั้งใจ — ไฟล์ที่ตรวจไม่ผ่านก็ยังต้องเก็บไว้ ไม่งั้นเวลา
 * ฝ่ายถามว่า "ที่ส่งไปมีอะไรผิด" จะไม่มีของให้ดูย้อน
 *
 * ด่านก่อนถึง exceljs มีสามชั้น: ต้องล็อกอิน · ต้องเป็นรายการของฝ่ายตัวเอง ·
 * ต้องเป็นไฟล์ `.xlsx` ขนาดไม่เกิน 10 MB — สามข้อนี้ตอบเป็นข้อความที่อ่านรู้เรื่อง
 * ไม่ปล่อยให้ไปพังข้างในแล้วได้ 500
 */
const isPeriodCode = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

export async function POST(request: NextRequest) {
  try {
    if (!(await readSessionUser())) {
      return unauthorized("หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    const period = form?.get("period");
    const itemId = form?.get("itemId");

    if (!isPeriodCode(period)) return badRequest("ระบุ period เป็นรูปแบบ YYYY-MM เช่น 2026-09");
    if (typeof itemId !== "string" || !itemId.trim()) return badRequest("ระบุ itemId ของรายการ");
    if (!(file instanceof File) || !file.size) return badRequest("ไม่พบไฟล์ที่แนบมา");

    const identity = await getDeskIdentity();
    if (!canUploadItem(identity, itemId.trim())) {
      return forbidden(
        `รายการนี้ไม่ใช่ของ${identity.department || "หน่วยงานของบัญชีนี้"} — ส่งได้เฉพาะรายการที่ฝ่ายตัวเองรับผิดชอบ`,
      );
    }

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return badRequest("รับเฉพาะไฟล์ .xlsx — ถ้าไฟล์เป็น .xls หรือ .csv ให้บันทึกใหม่เป็น .xlsx ก่อน");
    }
    if (file.type && file.type !== XLSX_TYPE) {
      return badRequest("ไฟล์นี้ไม่ใช่ Excel จริง — เปลี่ยนนามสกุลเฉย ๆ ใช้ไม่ได้ ต้องบันทึกจาก Excel");
    }
    if (file.size > MAX_INTAKE_FILE_BYTES) {
      return badRequest(
        `ไฟล์ใหญ่เกิน ${MAX_INTAKE_FILE_BYTES / 1024 / 1024} MB — แยกเป็นหลายไฟล์หรือลบชีตที่ไม่เกี่ยวออกก่อน`,
      );
    }

    const stored = await saveIntakeFile(file, {
      period,
      itemId: itemId.trim(),
      uploadedBy: identity.name,
    });

    const parsed = await profileWorkbook(await file.arrayBuffer(), file.name);
    const checks = runChecks(itemId.trim(), parsed);

    return ok({ profile: parsed.profile, checks, tally: summarize(checks), file: stored });
  } catch (err) {
    return fail(err);
  }
}
```

- [ ] **Step 3: เขียน `app/api/payroll/files/[fileId]/route.ts`**

```ts
import { NextResponse } from "next/server";

import { fail, forbidden, unauthorized } from "@/app/api/_lib/respond";
import { getDeskIdentity, readSessionUser } from "@/lib/auth/session";
import { openIntakeFile } from "@/lib/payroll/intake-files";
import { canUploadItem } from "@/lib/payroll/scope";

/**
 * `GET /api/payroll/files/{fileId}` — เปิดไฟล์ที่ส่งเข้ามาแล้ว
 *
 * **ต้องล็อกอิน และต้องอยู่ในขอบเขตฝ่ายของตัวเอง** — `proxy.ts` ปล่อย `GET` ผ่านหมด
 * และไฟล์พวกนี้มีรหัสพนักงานกับยอดเงินรายคน ลำพังการเดา `fileId` ไม่ควรพอที่จะเปิดได้
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/payroll/files/[fileId]">,
) {
  try {
    if (!(await readSessionUser())) {
      return unauthorized("หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
    }
    const { fileId } = await ctx.params;
    const found = await openIntakeFile(fileId);
    if (!found) return NextResponse.json({ error: "ไม่พบไฟล์นี้" }, { status: 404 });

    const identity = await getDeskIdentity();
    if (!canUploadItem(identity, found.itemId)) {
      return forbidden("ไฟล์นี้เป็นของฝ่ายอื่น");
    }

    return new NextResponse(found.stream as unknown as ReadableStream, {
      headers: {
        "content-type": found.type,
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(found.name)}`,
      },
    });
  } catch (err) {
    return fail(err);
  }
}
```

- [ ] **Step 4: ทดสอบด้วยไฟล์จริง**

```bash
cd ~/Documents/github/hr-service && npm run dev
# สร้างไฟล์ทดสอบจากแบบฟอร์มของระบบเอง
npm run verify:payroll   # ได้ .verify/แบบฟอร์มรับข้อมูลเงินเดือน_ทั้งชุด_*.xlsx
```

ล็อกอินแล้วอัปโหลดไฟล์นั้นที่รายการ #13 — ต้องเห็นผลตรวจขึ้น ไม่ใช่ข้อความ "แสดงผลวิเคราะห์ตัวอย่าง" · ลองอัปโหลดไฟล์ `.txt` ที่เปลี่ยนนามสกุลเป็น `.xlsx` ต้องได้ข้อความบอกว่าไม่ใช่ Excel จริง ไม่ใช่ 500

- [ ] **Step 5: commit**

```bash
git add lib/payroll/intake-files.ts app/api/payroll/parse/route.ts "app/api/payroll/files/[fileId]/route.ts"
git commit -m "payroll: เส้นอ่านไฟล์จริง + เก็บไฟล์ใน GridFS ให้ย้อนดูได้"
```

---

### Task 7: ต่อหน้าจอเข้ากับของจริง + กันการผ่านเมื่อยังมีข้อผิดพลาด

**Files:**
- Modify: `lib/payroll/intake-status.ts`
- Modify: `lib/payroll/intake.ts`
- Create: `lib/payroll/intake-gate.ts`
- Create: `lib/payroll/intake-gate.test.ts`
- Modify: `app/api/payroll/intake/route.ts`
- Create: `components/payroll/checks-panel.tsx`
- Modify: `components/payroll/intake-view.tsx`

**Interfaces:**
- Consumes: `CheckResult`, `CheckTally` (งานที่ 4) · `StoredIntakeFile` (งานที่ 6)
- Produces:
  - `IntakeRecord` เพิ่ม: `fileId?: string` · `errors?: number` · `warnings?: number` · `pendingChecks?: number` · `checkedAt?: string` · `overrideReason?: string`
  - `SaveIntakeInput` เพิ่มฟิลด์ชุดเดียวกัน
  - `assertPassAllowed(record: IntakeRecord, overrideReason?: string): void` — โยน `Error` พร้อมข้อความไทยเมื่อผ่านไม่ได้

- [ ] **Step 1: เขียนเทสต์ด่านผ่าน**

`lib/payroll/intake-gate.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { assertPassAllowed } from "@/lib/payroll/intake-gate";
import type { IntakeRecord } from "@/lib/payroll/intake-status";

const record = (over: Partial<IntakeRecord> = {}): IntakeRecord => ({
  itemId: "13",
  stage: "submitted",
  updatedAt: "2026-10-14T03:00:00.000Z",
  updatedBy: "ทดสอบ",
  errors: 0,
  warnings: 0,
  ...over,
});

test("ไฟล์ที่ตรวจผ่านด่าน 1 ผ่านได้", () => {
  assert.doesNotThrow(() => assertPassAllowed(record()));
});

test("ยังมีข้อผิดพลาดค้าง ผ่านไม่ได้ถ้าไม่มีเหตุผลกำกับ", () => {
  assert.throws(() => assertPassAllowed(record({ errors: 2 })), /ยังมีข้อผิดพลาด 2 ข้อ/);
});

test("HR ข้ามด่านได้ แต่ต้องเขียนเหตุผล และเหตุผลต้องไม่ใช่ช่องว่าง", () => {
  assert.doesNotThrow(() =>
    assertPassAllowed(record({ errors: 1 }), "ยอดถูกแล้ว ยืนยันกับบัญชีทางโทรศัพท์"),
  );
  assert.throws(() => assertPassAllowed(record({ errors: 1 }), "   "), /เหตุผล/);
});

test("ของที่รอยืนยันกติกา (pending) ไม่ขวางการผ่าน", () => {
  assert.doesNotThrow(() => assertPassAllowed(record({ pendingChecks: 3 })));
});

test("ไฟล์ที่ยังไม่เคยผ่านด่าน 1 เลย ผ่านไม่ได้", () => {
  assert.throws(
    () => assertPassAllowed(record({ errors: undefined, checkedAt: undefined })),
    /ยังไม่ได้ตรวจ/,
  );
});
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/lib/payroll/intake-gate'`

- [ ] **Step 3: เขียน `intake-gate.ts`**

```ts
import type { IntakeRecord } from "./intake-status";

/**
 * ด่านที่สอง — **HR กดผ่านได้เมื่อด่าน 1 ไม่เหลือข้อผิดพลาด**
 *
 * ข้ามได้ แต่ต้องเขียนเหตุผล และเหตุผลนั้นถูกเก็บไว้กับแถวนั้นตลอดไป (`overrideReason`)
 * — เพราะบางเดือนยอดถูกจริงแต่ไฟล์หน้าตาไม่ตรงกฎ และคนที่ตัดสินใจอย่างนั้นควรมีชื่อ
 * ติดอยู่กับการตัดสินใจนั้น ไม่ใช่กดผ่านเงียบ ๆ
 *
 * **ของที่ `status: "pending"` ไม่นับเป็นข้อผิดพลาด** — เป็นกติกาที่เรายังไม่รู้
 * ไม่ใช่ความผิดของไฟล์ ถ้าเอามาบล็อกก็เท่ากับหยุดเงินเดือนด้วยกฎที่เราแต่งเอง
 */
export function assertPassAllowed(record: IntakeRecord, overrideReason?: string): void {
  if (!record.checkedAt && record.errors === undefined) {
    throw new Error("รับเข้ารอบไม่ได้ — ไฟล์นี้ยังไม่ได้ตรวจด่านแรก ลองอัปโหลดใหม่อีกครั้ง");
  }

  const errors = record.errors ?? 0;
  if (errors === 0) return;

  if (!overrideReason?.trim()) {
    throw new Error(
      `รับเข้ารอบไม่ได้ — ยังมีข้อผิดพลาด ${errors} ข้อจากการตรวจด่านแรก · ถ้ายืนยันว่ายอดถูกแล้วจริง ให้ระบุเหตุผลกำกับการข้ามด่าน`,
    );
  }
}
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: ต่อฟิลด์ใหม่ที่ `intake-status.ts` และ `intake.ts`**

ใน `IntakeRecord` เพิ่ม:

```ts
  /** ไฟล์ที่เก็บไว้ใน GridFS — ไว้ย้อนดูว่าของที่ผ่านมาจากไฟล์หน้าตาแบบไหน */
  fileId?: string;
  /** ผลตรวจด่าน 1 ของไฟล์ล่าสุด — `undefined` = ยังไม่เคยตรวจ ไม่ใช่ตรวจแล้วไม่พบอะไร */
  errors?: number;
  warnings?: number;
  /** ข้อที่ยังรอฝ่ายยืนยันกติกา — ไม่ใช่ความผิดของไฟล์ จึงไม่บล็อก */
  pendingChecks?: number;
  checkedAt?: string;
  /** เหตุผลที่ HR ข้ามด่าน 1 — มีเมื่อไหร่แปลว่าผ่านไปโดยยังมีข้อผิดพลาดค้าง */
  overrideReason?: string;
```

ใน `saveIntake` — เพิ่มฟิลด์เหล่านี้ใน `SaveIntakeInput`, เรียก `assertPassAllowed` แทนบล็อก `if (input.stage === "passed")` เดิม (ยังเช็ก `current?.stage !== "submitted"` ตามเดิมก่อน) และเติมใน `set`/`unset` ให้ครบตามกติกาเดิมของไฟล์ (ของที่อัปโหลดใหม่ต้องล้าง `overrideReason` ทิ้ง)

- [ ] **Step 6: แผงผลตรวจ**

`components/payroll/checks-panel.tsx` — แสดงผลสามกลุ่มตามลำดับ: ต้องแก้ (`blocking`) · ควรดู (`warn` ที่ active) · รอยืนยัน (`pending`) โดยกลุ่มที่สามใช้สีจาง ๆ และมีคำว่า "รอ<ฝ่าย>ยืนยัน" ติดอยู่ ไม่ใช่สีแดงเหมือนข้อผิดพลาด

- [ ] **Step 7: เลิกใช้ `SAMPLE_PROFILE`**

ใน `components/payroll/intake-view.tsx` แทนที่ฟังก์ชัน `read()` เดิม:

```tsx
    const body = new FormData();
    body.append("file", next);
    body.append("period", code);
    body.append("itemId", active.id);

    const res = await fetch("/api/payroll/parse", { method: "POST", body });
    const json = (await res.json()) as
      | { profile: FileProfile; checks: CheckResult[]; tally: CheckTally; file: { fileId: string } }
      | { error: string };

    if (!res.ok || !("profile" in json)) {
      void toastError("อ่านไฟล์ไม่สำเร็จ", "error" in json ? json.error : undefined);
      clearFile();
      return;
    }

    setProfile(json.profile);
    setChecks(json.checks);
    setSelected(defaultSelection(json.profile));

    await save("submitted", {
      fileName: next.name,
      rows: json.profile.totalRows,
      columns: json.profile.columns.length,
      fileId: json.file.fileId,
      errors: json.tally.errors,
      warnings: json.tally.warnings,
      pendingChecks: json.tally.pending,
    });
```

และลบ `toastInfo("แสดงผลวิเคราะห์ตัวอย่าง", …)` ออก — คำเตือนนั้นไม่จริงอีกแล้ว

- [ ] **Step 8: ตรวจด้วยตาจริง**

อัปโหลดแบบฟอร์มเปล่า (ต้องขึ้น "ไฟล์ไม่มีแถวข้อมูล" และกดรับเข้ารอบไม่ได้) · อัปโหลดไฟล์ที่กรอกถูก (ต้องผ่านได้) · อัปโหลดไฟล์ที่เว้นรหัสพนักงานหนึ่งแถว (ต้องชี้เลขแถวได้ตรง) · กดรับเข้ารอบทั้งที่มีข้อผิดพลาด (ต้องถูกบังคับให้เขียนเหตุผล)

- [ ] **Step 9: commit**

```bash
git add lib/payroll/intake-status.ts lib/payroll/intake.ts lib/payroll/intake-gate.ts lib/payroll/intake-gate.test.ts app/api/payroll/intake/route.ts components/payroll/checks-panel.tsx components/payroll/intake-view.tsx
git commit -m "payroll: ต่อด่าน 1 เข้ากับหน้าจอจริง และกันการผ่านเมื่อยังมีข้อผิดพลาด"
```

---

### Task 8: อีเมลแจ้งฝ่าย + ลิงก์เข้าหน้าของฝ่ายนั้น

**Files:**
- Create: `lib/payroll/notify.ts`
- Create: `lib/payroll/notify.test.ts`
- Create: `app/api/payroll/notify/route.ts`
- Create: `components/payroll/notify-panel.tsx`
- Modify: `components/payroll/intake-view.tsx`

**Interfaces:**
- Consumes: `listUsers` จาก `lib/ncac/client.ts` · `isSelectableUser`, `positionLevel` จาก `lib/ncac/adapt.ts` · `departmentIdOf` (งานที่ 1) · `itemsByOwner`, `dueDaysOf` จาก `registry.ts` · `dueDate`, `lateDays` จาก `intake-status.ts`
- Produces:
  - `intakeLink(origin: string, period: PeriodRef, owner: IntakeOwner): string`
  - `subjectOf(owner: IntakeOwner, period: PeriodRef): string`
  - `bodyOf(args: { owner; period; items; records; link; now }): string`
  - `interface NotifyDraft { owner: IntakeOwner; to: string[]; cc: string[]; subject: string; body: string; link: string; directoryMissing: boolean }`
  - `notifyDraft(args: { owner; period; origin; records; now; users }): NotifyDraft`

- [ ] **Step 1: เขียนเทสต์ (เนื้อเมล + ลิงก์ ไม่พึ่ง NCAC)**

`lib/payroll/notify.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { emptyRecord, type IntakeRecord } from "@/lib/payroll/intake-status";
import { bodyOf, intakeLink, subjectOf } from "@/lib/payroll/notify";
import { itemsByOwner } from "@/lib/payroll/registry";

const period = { year: 2569, month: 8 };
const now = new Date(2026, 8, 12);

test("ลิงก์ชี้หน้าทะเบียนของรอบนั้น พร้อมฝ่ายที่ encode แล้ว", () => {
  const link = intakeLink("https://hr.example.com", period, "จัดส่ง ลาดกระบัง");
  assert.equal(
    link,
    "https://hr.example.com/payroll/intake?period=2026-09&owner=" +
      encodeURIComponent("จัดส่ง ลาดกระบัง"),
  );
});

test("หัวเรื่องบอกรอบเป็น พ.ศ. และบอกว่าเป็นเรื่องอะไร", () => {
  const subject = subjectOf("ยานยนต์", period);
  assert.ok(subject.includes("ก.ย. 2569"));
  assert.ok(subject.includes("ยานยนต์"));
});

test("เนื้อเมลเป็นข้อความล้วน มีลิงก์ รายการที่ต้องส่ง และวันครบกำหนด", () => {
  const items = itemsByOwner("ยานยนต์");
  const records = new Map<string, IntakeRecord>();
  const body = bodyOf({
    owner: "ยานยนต์",
    period,
    items,
    records,
    link: "https://hr.example.com/x",
    now,
  });
  assert.ok(!body.includes("<"), "ต้องไม่มี HTML");
  assert.ok(body.includes("https://hr.example.com/x"));
  for (const item of items) assert.ok(body.includes(item.title), `ต้องมี ${item.title}`);
  assert.ok(/ภายในวันที่ \d+/.test(body));
});

test("ของที่ส่งแล้วไม่ถูกทวงซ้ำในเมล และของที่ตีกลับขึ้นก่อน", () => {
  const items = itemsByOwner("ยานยนต์");
  const records = new Map<string, IntakeRecord>([
    [items[0].id, { ...emptyRecord(items[0].id), stage: "passed" }],
    [
      items[1].id,
      { ...emptyRecord(items[1].id), stage: "returned", returnedReason: "ยอดไม่ตรง" },
    ],
  ]);
  const body = bodyOf({ owner: "ยานยนต์", period, items, records, link: "x", now });
  assert.ok(!body.includes(`${items[0].title} `) || body.includes("รับเข้ารอบแล้ว"));
  assert.ok(body.indexOf("ยอดไม่ตรง") > 0, "ต้องบอกเหตุผลที่ตีกลับไว้ในเมล");
});

test("ไม่มีคำว่า กรุณา ขึ้นต้นทุกบรรทัด และไม่มี emoji", () => {
  const body = bodyOf({
    owner: "HR C&B",
    period,
    items: itemsByOwner("HR C&B"),
    records: new Map(),
    link: "x",
    now,
  });
  assert.equal(/[\u{1F300}-\u{1FAFF}]/u.test(body), false);
});
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/lib/payroll/notify'`

- [ ] **Step 3: เขียน `notify.ts`**

หัวไฟล์ต้องบันทึกเหตุผลไว้ให้คนอ่านทีหลังเข้าใจว่าทำไมไม่ส่งเมลเอง:

```ts
/**
 * ร่างอีเมลแจ้งฝ่ายว่าเปิดรอบแล้ว — **ระบบไม่ส่งเมลเอง**
 *
 * หน้าจอเปิดหน้าเขียนเมลของ Gmail ให้พร้อมกรอกผู้รับ/หัวเรื่อง/เนื้อความ แล้วผู้ใช้
 * เป็นคนกดส่งจากบัญชีของตัวเอง — ท่าเดียวกับอีเมลแจ้งหน่วยงานของฝั่งคำร้อง
 * (`lib/case-notify.ts` มติ 8 ก.ย. 2569) และยืนยันอีกครั้งเมื่อ 14 ต.ค. 2569:
 * ไม่ต้องมีบัญชีเมลกลาง ไม่เก็บโทเคนของใครไว้ในระบบ และเมลที่ออกไปมีชื่อคนส่งจริงเสมอ
 *
 * **เนื้อความเป็นข้อความล้วน** เพราะหน้าเขียนเมลของ Gmail รับแค่ข้อความล้วน
 * จัดหน้าด้วยการเว้นบรรทัด ไม่ใช่ HTML
 *
 * กฎผู้รับเหมือนฝั่งคำร้อง: **TO = หัวหน้า · CC = ผู้จัดการ** ของหน่วยงานนั้น
 * หน่วยงานที่ไม่มีหัวหน้าที่ยัง active เลื่อนผู้จัดการขึ้นเป็น TO ไม่ใช่ส่งไม่ออก
 */
```

จากนั้น `intakeLink` / `subjectOf` / `bodyOf` / `notifyDraft` ตามสัญญาใน Interfaces — `bodyOf` เรียงเนื้อหาแบบนี้ (ลำดับนี้คือสิ่งที่คนอ่านเมลต้องรู้ตามลำดับ):

```
ทะเบียนรับข้อมูลเงินเดือน รอบ ก.ย. 2569 — <ฝ่าย>

เปิดรอบแล้ว ส่งข้อมูลเข้าระบบได้ที่ลิงก์นี้
<link>

ลิงก์นี้ต้องเข้าสู่ระบบด้วยบัญชีบริษัทก่อน แล้วจะเห็นเฉพาะรายการของ<ฝ่าย>

ของที่ต้องส่งในรอบนี้
1. <ชื่อรายการ> — ภายในวันที่ <dueDay> ก.ย.
2. ...

ของที่ตีกลับให้แก้ (ส่งใหม่ได้เลย)
- <ชื่อรายการ>: <เหตุผล>

ของที่รับเข้ารอบแล้ว ไม่ต้องส่งซ้ำ
- <ชื่อรายการ>

ดาวน์โหลดแบบฟอร์มได้จากหน้าเดียวกัน กรอกบนแบบฟอร์มของระบบจะผ่านการตรวจเร็วกว่า
เพราะระบบตรวจชื่อคอลัมน์กับช่องเงินให้อัตโนมัติตอนอัปโหลด
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: เขียน `app/api/payroll/notify/route.ts`**

`GET /api/payroll/notify?period=2026-09&owner=<ฝ่าย>` — ต้องล็อกอิน · ต้องเป็น HR (คนที่แจ้งคือ HR ตาม flow) · คืน `NotifyDraft` + อีเมลของผู้ใช้ที่ล็อกอินอยู่ (ไว้ชี้ว่าให้ Gmail เปิดด้วยบัญชีไหน) · **ไม่มี `POST` ไม่มีเส้นส่ง** เขียนไว้ในหัวไฟล์ให้ชัด · ฝ่ายที่ `departmentIdOf()` คืน `null` ต้องคืน `directoryMissing: true` พร้อมร่างที่ยังใช้ได้ (ผู้รับว่าง ให้ HR กรอกเอง) ไม่ใช่ 500

- [ ] **Step 6: แผงแจ้งฝ่าย**

`components/payroll/notify-panel.tsx` — ปุ่ม "แจ้งฝ่ายนี้ทางอีเมล" ที่หัวแต่ละกลุ่มฝ่าย (เห็นเฉพาะ HR) + ปุ่ม "แจ้งทุกฝ่ายที่ยังไม่ส่ง" ที่หัวหน้า เปิด Gmail compose ทีละฝ่าย พร้อมคำเตือนบนปุ่มว่าจะเปิดหลายแท็บ · ฝ่ายที่ `directoryMissing` ขึ้นป้าย "ยังไม่ได้ผูกรหัสหน่วยงาน — ต้องกรอกผู้รับเอง"

- [ ] **Step 7: ตรวจด้วยตาจริง**

กดปุ่มแจ้งฝ่ายจัดส่ง — Gmail ต้องเปิดมาพร้อมผู้รับเป็นหัวหน้าฝ่ายจัดส่ง หัวเรื่องมีรอบ และเนื้อความมีลิงก์ที่กดได้ · เอาลิงก์ไปเปิดในหน้าต่างที่ยังไม่ล็อกอิน ต้องเด้งหน้าล็อกอินแล้วกลับมาที่หน้าเดิมหลังล็อกอิน

- [ ] **Step 8: commit**

```bash
git add lib/payroll/notify.ts lib/payroll/notify.test.ts app/api/payroll/notify/route.ts components/payroll/notify-panel.tsx components/payroll/intake-view.tsx
git commit -m "payroll: ร่างอีเมลแจ้งฝ่ายพร้อมลิงก์เข้าหน้าของฝ่ายนั้น (HR กดส่งจากบัญชีตัวเอง)"
```

---

### Task 9: หน้าสรุปรอบ + Excel สรุป

**Files:**
- Create: `lib/payroll/summary-export.ts`
- Create: `lib/payroll/summary.ts`
- Create: `lib/payroll/summary.test.ts`
- Create: `app/payroll/summary/page.tsx`
- Create: `components/payroll/summary-view.tsx`
- Create: `app/api/payroll/summary/route.ts`
- Modify: `lib/payroll/nav.ts`

**Interfaces:**
- Consumes: `tallyOwner`, `IntakeRecord` จาก `intake-status.ts` · `classify`, `postedColumns` จาก `classify.ts` · `OWNER_ORDER`, `itemsByOwner` จาก `registry.ts`
- Produces:
  - `interface PeriodSummary { period: PeriodRef; owners: { owner: IntakeOwner; tally: OwnerTally }[]; ready: boolean; blockers: string[] }`
  - `summarizePeriod(period: PeriodRef, records: Map<string, IntakeRecord>, now: Date): PeriodSummary`
  - `buildPeriodSummary(summary: PeriodSummary, records: Map<string, IntakeRecord>): Promise<{ file: ArrayBuffer; name: string }>`

- [ ] **Step 1: เขียนเทสต์**

`lib/payroll/summary.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { emptyRecord, type IntakeRecord } from "@/lib/payroll/intake-status";
import { INTAKE_ITEMS } from "@/lib/payroll/registry";
import { summarizePeriod } from "@/lib/payroll/summary";

const period = { year: 2569, month: 8 };
const now = new Date(2026, 8, 30);

const allPassed = (): Map<string, IntakeRecord> =>
  new Map(
    INTAKE_ITEMS.map((i) => [
      i.id,
      { ...emptyRecord(i.id), stage: "passed" as const, errors: 0 },
    ]),
  );

test("รอบที่ของผ่านครบทุกรายการ พร้อมสรุป", () => {
  const summary = summarizePeriod(period, allPassed(), now);
  assert.equal(summary.ready, true);
  assert.deepEqual(summary.blockers, []);
  assert.equal(summary.owners.length, 6);
});

test("ขาดแม้รายการเดียว ยังไม่พร้อม และบอกว่าขาดอะไรของใคร", () => {
  const records = allPassed();
  records.delete("01");
  const summary = summarizePeriod(period, records, now);
  assert.equal(summary.ready, false);
  assert.equal(summary.blockers.length, 1);
  assert.ok(summary.blockers[0].includes("จัดส่ง ลาดกระบัง"));
});

test("ของที่ผ่านโดยข้ามด่าน 1 ถูกชี้ไว้ในสรุป ไม่กลืนหายไปกับของที่ผ่านปกติ", () => {
  const records = allPassed();
  records.set("13", {
    ...emptyRecord("13"),
    stage: "passed",
    errors: 2,
    overrideReason: "ยืนยันยอดกับบัญชีแล้ว",
  });
  const summary = summarizePeriod(period, records, now);
  assert.equal(summary.ready, true);
  assert.ok(summary.blockers.length === 0);
  assert.ok(
    summary.owners.some((o) => o.tally.passed > 0),
    "ยังนับเป็นผ่าน",
  );
});
```

- [ ] **Step 2: รันให้ล้ม แล้วเขียน `summary.ts` ให้ผ่าน**

Run: `npm test` → FAIL → เขียน `summarizePeriod` → `npm test` → PASS

- [ ] **Step 3: `summary-export.ts`**

Excel 2 ชีต — **"สรุปรายฝ่าย"** (ฝ่าย · ทั้งหมด · ผ่าน · รอตรวจ · ตีกลับ · รอส่ง · ช้าสุดกี่วัน) และ **"รายรายการ"** (เลขรายการ · ชื่อ · ฝ่าย · สถานะ · ชื่อไฟล์ · ใครส่ง · เมื่อไหร่ · ใครผ่าน · เมื่อไหร่ · ข้อผิดพลาดที่ค้าง · เหตุผลที่ข้ามด่าน) ใช้ท่าเดียวกับ `template-export.ts` ที่มีอยู่

ชื่อไฟล์: `สรุปรับข้อมูลเงินเดือน_<รอบ พ.ศ.>.xlsx`

**หัวชีตต้องมีบรรทัดกำกับว่า "ไฟล์นี้ไม่ใช่ไฟล์นำเข้า Tiger Soft"** — ไม่งั้นเดือนหน้ามีคนเอาไปอัปขึ้น Tiger Soft แน่

- [ ] **Step 4: หน้า `/payroll/summary` + เมนู**

หน้าแสดง: แถบความพร้อมของรอบ (ครบ/ขาดกี่รายการ) · ตารางรายฝ่าย · รายการที่ยังขาดพร้อมปุ่มแจ้งฝ่ายนั้น · ปุ่มดาวน์โหลด Excel · กล่องข้อความคงที่ว่า "ขั้นถัดไปคือทำไฟล์นำเข้า Tiger Soft ซึ่งยังรอสเปกไฟล์จาก HR ค่าจ้างและสวัสดิการ" เพื่อให้คนเปิดหน้านี้รู้ว่าทำไมยังไม่มีปุ่มนั้น

เพิ่มใน `lib/payroll/nav.ts` ใต้กลุ่มเดียวกับหน้าทะเบียน

- [ ] **Step 5: ตรวจด้วยตาจริง + commit**

```bash
npm test && npm run verify:payroll
git add lib/payroll/summary.ts lib/payroll/summary.test.ts lib/payroll/summary-export.ts app/payroll/summary/page.tsx app/api/payroll/summary/route.ts components/payroll/summary-view.tsx lib/payroll/nav.ts
git commit -m "payroll: หน้าสรุปรอบ + Excel สรุป (ยังไม่ใช่ไฟล์นำเข้า Tiger Soft)"
```

---

### Task 10: ขยายสคริปต์ตรวจ + บันทึกสิ่งที่ยังค้าง

**Files:**
- Modify: `scripts/verify-payroll-templates.ts`
- Create: `docs/payroll-intake-open-questions.md`

- [ ] **Step 1: ตรวจเพิ่มใน `verify:payroll`**

เติมสองข้อใน `problems`:

```ts
  /* ทุกรายการต้องมีกฎครอบอย่างน้อยหนึ่งข้อ — รายการที่ไม่มีกฎเลยคือรายการที่
     ด่าน 1 ปล่อยผ่านทุกอย่าง ซึ่งอ่านจากหน้าจอไม่ออกว่าเป็นเพราะไฟล์ดีหรือเพราะไม่มีกฎ */
  for (const item of INTAKE_ITEMS) {
    const probe = runChecks(item.id, { profile: emptyProfileOf(item.id), rows: [] });
    if (probe.length === 0) problems.push(`#${item.id} ไม่มีกฎตรวจเลย`);
  }

  /* กฎที่อ้างคอลัมน์ต้องอ้างคอลัมน์ที่มีจริงในสเปก — สะกดเพี้ยนตัวเดียว กฎจะเงียบไปเฉย ๆ
     โดยไม่มีใครรู้ ซึ่งอันตรายกว่ากฎที่ดังผิด */
  problems.push(...validateRuleColumns());
```

พร้อมพิมพ์สรุปจำนวนกฎ active / pending ต่อรายการ เพื่อให้คนรันเห็นว่ารายการไหนยังตรวจไม่ได้เพราะรอใคร

- [ ] **Step 2: เขียน `docs/payroll-intake-open-questions.md`**

ตารางสิ่งที่ยังค้าง: เรื่อง · รอใคร · กระทบอะไรถ้าไม่ได้คำตอบ · ที่อยู่ในโค้ดที่ต้องแก้เมื่อได้คำตอบ

| เรื่อง | รอใคร | ถ้าไม่ได้คำตอบ | แก้ที่ |
|---|---|---|---|
| ความหมายรหัสวัน 17 จาก 24 ตัว | ฝ่ายจัดส่ง | คิดวันทำงานจากไฟล์ #01 ไม่ได้ | `DAY_CODES` ใน `template-spec.ts` |
| ทิศทางเงิน #14 #15 | บัญชีกรุงเทพ | ตรวจเครื่องหมายเงินไม่ได้ 2 รายการ | `MONEY_COLUMNS` ใน `classify.ts` |
| ทิศทางเงิน #17 #18 | ยานยนต์ | ตรวจเครื่องหมายเงินไม่ได้ 2 รายการ | `MONEY_COLUMNS` ใน `classify.ts` |
| Tiger Soft ช่องรวม/ช่องย่อย #08 #23 | HR C&B | ทำไฟล์นำเข้าไม่ได้ | แผนเฟสถัดไป |
| สเปกไฟล์นำเข้า Tiger Soft | HR C&B | จบที่หน้าสรุป ยังต้องคัดลอกมือ | แผนเฟสถัดไป |
| รหัสหน่วยงานของบัญชีกรุงเทพ/ลาดกระบัง | HR (NCAC) | 2 ฝ่ายเข้ามาส่งเองไม่ได้ ต้องให้ HR อัปแทน | `OWNER_DEPARTMENT_ID` ใน `owner-directory.ts` |
| แบบฟอร์มร่าง #03 #05 #06 #14 #24 | ฝ่ายเจ้าของข้อมูล | ตรวจคอลัมน์แบบบังคับไม่ได้ (เป็น pending) | `TEMPLATE_SPECS` ใน `template-spec.ts` |

- [ ] **Step 3: รันทั้งชุดแล้ว commit**

```bash
npm test && npm run verify:payroll && npm run lint
git add scripts/verify-payroll-templates.ts docs/payroll-intake-open-questions.md
git commit -m "payroll: ตรวจความครอบคลุมของกฎ + บันทึกสิ่งที่ยังรอคำตอบจากฝ่าย"
```

---

## หลังจบทั้ง 10 งาน

1. `npm test` · `npm run verify:payroll` · `npm run lint` ผ่านทั้งสาม
2. `git pull` ก่อน แล้วค่อยขอให้เจ้าของงานตรวจ — **ยังไม่ push จนกว่าจะได้ไฟเขียว** (branch นี้ยังไม่เคย push เลย 5 commit แรกก็ยังอยู่แค่ในเครื่อง)
3. ของที่จะเอาเข้าประชุมรอบถัดไป: นำร่องเดือนไหน · ใครเป็นคนกดแจ้งฝ่าย · 7 เรื่องใน `docs/payroll-intake-open-questions.md`
