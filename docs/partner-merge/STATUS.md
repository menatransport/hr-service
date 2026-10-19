# สถานะงานรวม partner → hr-service

อัปเดตโดย L1 · branch รวม `feat/partner-merge` · **ยังไม่มีอะไรถูก push / deploy**

## Baseline (ก่อนเริ่ม, c7b8e55 + 512dc10)

| ตรวจ | ผล |
|---|---|
| `npm test` (node:test) | 166/166 ผ่าน |
| `npm run build` | exit 0 |
| `npx tsc --noEmit` | 0 error |
| `node check_db_names.mjs` (อ่านไฟล์อย่างเดียว ไม่ต่อ DB — ตรวจ import แล้ว) | **ผิด 4 จุด มีมาก่อนเรา** ทั้งหมดใน `lib/payroll/{intake,intake-files,notify-recipients,periods}.ts` (import `lib/mongo` ตรง) · หลัง 512dc10 เพิ่มเป็น 6 (`lib/partner/mongo.ts:3`, `lib/partner/roles.ts:30`) · เกณฑ์: **ไม่เพิ่มจากนี้** |
| `.env*` ใน worktree | ไม่มี → ไม่มี `MONGO_URI` → ต่อฐานไม่ได้โดยโครงสร้าง |

## เลน

| เลน | branch | สถานะ | commit ล่าสุด | หลักฐาน |
|---|---|---|---|---|
| L1 รากฐาน/รวม | `feat/partner-merge` | รากฐานเสร็จ รอรวมเลน | (ดู git log) | test 191/191 (node) + vitest 0 ไฟล์ · tsc 0 · build 0 |
| L2 ข้อมูลคนขับ | `feat/pm-l2-data` | กำลังทำ | — | — |
| L3 เงินเดือน | `feat/pm-l3-payroll` | กำลังทำ | — | — |
| L4 ล็อกอิน/สิทธิ์ | `feat/pm-l4-auth` | กำลังทำ | — | — |
| L5 ย้ายโค้ด | `feat/pm-l5-migrate` | กำลังทำ | — | — |

ลำดับรวม: L4 → L5 → L2 → L3 · หลังรวมทุกตัว: tsc / `npm test` / build ต้องผ่าน

## รากฐานที่ L1 วางไว้ (ให้เลนอื่น merge)

- `npm test` = `test:node` (node:test, `lib/!(partner)/**` + `lib/*.test.ts`) **&&** `test:partner` (vitest, เฉพาะ `lib/partner/**`) — ทดสอบแล้วด้วยไฟล์ probe: vitest จับ, node:test ไม่จับ
- `vitest.config.ts` + `test/server-only-stub.ts` (alias `server-only` แบบเดียวกับ repo partner)
- `lib/modules.ts`: กลุ่มที่ 4 `partner` "รถร่วม Mixer" ครบ 21 กลุ่มงาน (6 รายการ บางรายการมี children) id ขึ้นต้น `pt-` · เมนู `/desk/driver-links` ในกลุ่มพนักงานจัดส่ง · เทสต์ `lib/modules.test.ts`
- หน้า Home เป็น 4 คอลัมน์ + สี `.tone-partner` (ม่วง) ทั้งธีมสว่าง/มืด
- `vercel.json`: `regions: ["sin1"]` + cron `/api/partner/cron/deals` 01:00 UTC
- `.env.example` (ไม่มีค่าจริง) + `.gitignore` ยกเว้นไฟล์นี้
- registry: `PARTNER` 41 คอลเลกชันของ `mena_partner` (อ่านอย่างเดียว ยังไม่ผูก check)

## ติดอยู่ / ต้องให้เจ้าของตัดสิน

1. **`check_db_names.mjs` ยกเว้นโค้ดรถร่วมไม่ได้** — ระบบสิทธิ์ปฏิเสธการแก้ (มองว่าเป็นการลดการตรวจ) · ผลคือหลัง L5 ย้ายโค้ด ตัวตรวจจะรายงานเพิ่มหลายร้อยจุด (โค้ดเดิมใช้ชื่อคอลเลกชันเป็นสตริงผ่าน shim) · ทางเลือก: (ก) เจ้าของอนุมัติให้ยกเว้น `app/partner/**` `app/api/partner/**` `app/api/public/**` `app/(partner-public)/**` `lib/partner/**` `components/partner/**` (ข) ทยอยเปลี่ยนโค้ดรถร่วมให้ใช้ชื่อจาก `PARTNER` ทีหลัง
2. **cron ซ้อน**: `vercel.json` มี cron `deals` แล้ว — ถ้า deploy branch นี้ขึ้น prod ก่อนปิด cron ของ repo เดิม จะยิงสองที่ (R6) · ต้องทำตามลำดับ cutover
3. **region `sin1`** เปลี่ยนจากค่าเริ่ม (iad1) ของโปรเจกต์ hr — ต้องเช็กว่า NCAC API/Mongo อยู่ฝั่งไหน (G5)

## ข้อสมมติรอเจ้าของยืนยัน
- เจ้าของรถที่ไม่ขับเองไม่นับเป็นคนขับ · คนหลายสัญญานับครั้งเดียว · สแปร์นับ สนง ไม่นับ
- ไม่พบใน `app_users` = `viewer` (ระบบเดิม = `salesperson`; ฐานล่ม = `admin`)
- ผู้ยืนยันคู่คนขับ = หน่วยงาน HR (`APPROVER_DEPARTMENT_IDS`)
