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

| เลน | branch | สถานะ | merge commit | หลังรวม (typegen → tsc → test → build) |
|---|---|---|---|---|
| L1 รากฐาน/รวม | `feat/partner-merge` | รวม 4 เลนแล้ว รอ L5 รอบสอง | 363b247 (รอยต่อ) | tsc 0 · node 452/452 · vitest 386/386 (23 ไฟล์) · build 0 |
| L4 ล็อกอิน/สิทธิ์ | `feat/pm-l4-auth` @83892f9 | รวมแล้ว | 98d2620 | tsc 0 · node 383 · vitest 155 · build 0 |
| L5 ย้ายโค้ด | `feat/pm-l5-migrate` @346191a | รวมรอบแรกแล้ว · รอบสอง = แปลงโค้ดให้ผ่าน check_db_names | e3935ae | tsc 0 · node 383 · vitest 386 · build 0 |
| L2 ข้อมูลคนขับ | `feat/pm-l2-data` @2267735 | รวมแล้ว | bdb68b2 | tsc 0 · node 410 · vitest 386 · build 0 |
| L3 เงินเดือน | `feat/pm-l3-payroll` @604d438 | รวมแล้ว | 8e8fe33 | tsc 0 · node 444 · vitest 386 · build 0 |

### ตรวจหลังรวม L4+L5 (postmerge.sh)
- `MONGO_DB` ในโค้ดรถร่วม: 0 จุดที่ใช้จริง (เจอ 1 บรรทัดเป็นคอมเมนต์เตือนใน `lib/partner/mongo.ts`)
- `next-auth`: 0 import / ไม่อยู่ใน package.json (เจอ 5 ไฟล์เป็นคอมเมนต์ว่า "แทน ... ของ next-auth")
- route ชนกับ hr: 0
- `check_db_names`: 193 จุด → L5 รอบสองแปลงโค้ดให้ผ่าน (เจ้าของสั่ง: ไม่ยกเว้น)
- gate: ไม่ล็อกอิน GET `/api/partner/**` = 401 มีเทสต์ใน `lib/auth/gate.test.ts`

### CSS ของ hr ก่อน/หลังรวม (build จริงเทียบกัน)
- ฐาน = build ที่ 87863ec (ก่อนรวม) · หลัง = build ที่ 363b247
- ไฟล์ CSS เล็ก 2 ไฟล์ของ hr: เหมือนกันทุกไบต์
- ไฟล์ CSS หลักของ hr: **คลาสหาย 0** · คลาสที่เพิ่ม 36 ตัว ทั้งหมดมาจากหน้าใหม่ของ hr `app/desk/(module)/driver-links/driver-links-view.tsx` (daisyUI badge/btn/table/alert ฯลฯ) ไม่มีตัวไหนมาจากโค้ดรถร่วม · ตัวแปร theme เพิ่ม `--text-4xl` จากหน้าเดียวกัน
- CSS ของรถร่วมแยกเป็น chunk ของตัวเอง (`styles/partner-theme.css` ใช้ `@theme reference` ไม่ทับตัวแปร `:root` ของ hr)

## รากฐานที่ L1 วางไว้ (ให้เลนอื่น merge)

- `npm test` = `test:node` (node:test, `lib/!(partner)/**` + `lib/*.test.ts`) **&&** `test:partner` (vitest, เฉพาะ `lib/partner/**`) — ทดสอบแล้วด้วยไฟล์ probe: vitest จับ, node:test ไม่จับ
- `vitest.config.ts` + `test/server-only-stub.ts` (alias `server-only` แบบเดียวกับ repo partner)
- `lib/modules.ts`: กลุ่มที่ 4 `partner` "รถร่วม Mixer" ครบ 21 กลุ่มงาน (6 รายการ บางรายการมี children) id ขึ้นต้น `pt-` · เมนู `/desk/driver-links` ในกลุ่มพนักงานจัดส่ง · เทสต์ `lib/modules.test.ts`
- หน้า Home เป็น 4 คอลัมน์ + สี `.tone-partner` (ม่วง) ทั้งธีมสว่าง/มืด
- `vercel.json`: `regions: ["sin1"]` + cron `/api/partner/cron/deals` 01:00 UTC
- `.env.example` (ไม่มีค่าจริง) + `.gitignore` ยกเว้นไฟล์นี้
- registry: `PARTNER` 41 คอลเลกชันของ `mena_partner` (อ่านอย่างเดียว ยังไม่ผูก check)

## ติดอยู่ / ต้องให้เจ้าของตัดสิน

1. ~~ยกเว้นใน check_db_names~~ → เจ้าของตัดสินแล้ว: แปลงโค้ดรถร่วมให้ผ่านกฎ (L5 รอบสอง) · เดิม: — ระบบสิทธิ์ปฏิเสธการแก้ (มองว่าเป็นการลดการตรวจ) · ผลคือหลัง L5 ย้ายโค้ด ตัวตรวจจะรายงานเพิ่มหลายร้อยจุด (โค้ดเดิมใช้ชื่อคอลเลกชันเป็นสตริงผ่าน shim) · ทางเลือก: (ก) เจ้าของอนุมัติให้ยกเว้น `app/partner/**` `app/api/partner/**` `app/api/public/**` `app/(partner-public)/**` `lib/partner/**` `components/partner/**` (ข) ทยอยเปลี่ยนโค้ดรถร่วมให้ใช้ชื่อจาก `PARTNER` ทีหลัง
2. **cron ซ้อน**: `vercel.json` มี cron `deals` แล้ว — ถ้า deploy branch นี้ขึ้น prod ก่อนปิด cron ของ repo เดิม จะยิงสองที่ (R6) · ต้องทำตามลำดับ cutover
3. **region `sin1`** เปลี่ยนจากค่าเริ่ม (iad1) ของโปรเจกต์ hr — ต้องเช็กว่า NCAC API/Mongo อยู่ฝั่งไหน (G5)

## ข้อสมมติรอเจ้าของยืนยัน
- เจ้าของรถที่ไม่ขับเองไม่นับเป็นคนขับ · คนหลายสัญญานับครั้งเดียว · สแปร์นับ สนง ไม่นับ
- ไม่พบใน `app_users` = `viewer` (ระบบเดิม = `salesperson`; ฐานล่ม = `admin`)
- ผู้ยืนยันคู่คนขับ = หน่วยงาน HR (`APPROVER_DEPARTMENT_IDS`)
