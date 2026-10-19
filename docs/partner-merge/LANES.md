# รวม mena-partner-driver → hr-service: สัญญาระหว่างเลน (19 ต.ค. 2569)

ทุกเลนแตกจาก commit นี้ (`feat/partner-merge`) · L1 รวมกลับที่ `feat/partner-merge` · **ห้าม push / deploy / ต่อฐานจริง**

## คำตัดสินที่ล็อกแล้ว
ย้ายทั้งแอปรวม `/trucks` · คง db `mena_partner` แยก (คลัสเตอร์เดียวกัน, client ตัวเดียว) · ใช้ session hr ทิ้ง next-auth ·
ทำข้อมูลก่อนย้ายโค้ด · รวมถึงระดับ "เลขคนขับทั้งบริษัทตัวเดียว" + "ยอดรถร่วมเข้า /payroll/summary"

ค่าเริ่มแทนเจ้าของ (แก้ได้): URL `/partner/**` + `/api/partner/**` (ยกเว้น `/trucks`, `/sitemap.xml`, `/robots.txt`, `/og/*`, `/api/public/*` ที่ราก) ·
ไม่ re-skin (scope CSS ใต้ `.partner-theme`) · บทบาทจาก `app_users` ตามอีเมล ไม่พบ = `viewer` ·
เจ้าของรถที่ไม่ขับเอง (`isTruckOwner && !isDriver`) ไม่นับเป็นคนขับ

## เจ้าของไฟล์ (แก้ได้เฉพาะของเลนตัวเอง — ต้องการเพิ่มในไฟล์คนอื่น ให้เขียนในรายงาน)
| เลน | งาน | เป็นเจ้าของ |
|---|---|---|
| L1 PM/รวมงาน | รากฐาน + รวมเลน + รายงาน | `package.json`, lockfile, `vitest.config.*`, `lib/db/**`, `check_db_names.mjs`, `lib/modules.ts`, `vercel.json`, `styles/partner-theme.css`, `.env.example`, `docs/**` |
| L2 ข้อมูลคนขับ | สายเชื่อม + เลขคนขับทั้งบริษัท + รายการขัดแย้ง | `lib/driver-links/**`, `app/desk/driver-links/**`, `app/api/driver-links/**`, `scripts/driver-links-*.mjs` |
| L3 เงินเดือน | ยอดรถร่วมเข้า intake + summary | `lib/payroll/partner/**` (+ จุดเสียบใน `lib/payroll/*` ที่จำเป็น — ห้ามแก้ตรรกะเดิม) |
| L4 ล็อกอิน/สิทธิ์ | session เดียว + proxy เดียว + RBAC | `proxy.ts`, `lib/auth/**`, `lib/partner/auth/**`, `lib/partner/rbac.ts`, `lib/partner/roles.ts`, `lib/partner/public-routes.ts`, `app/api/partner/session/**` |
| L5 ย้ายโค้ด | หน้า/API/lib/components/เว็บสาธารณะ | `app/partner/**`, `app/api/partner/**` (ยกเว้น session), `app/(partner-public)/**`, `app/sitemap.ts`, `app/robots.ts`, `app/og/**`, `app/api/public/**`, `lib/partner/**` (ยกเว้นของ L4 + `mongo.ts`), `components/partner/**`, `public/partner/**`, `partner-assets/**`, `scripts/partner-codemod/**` |

## สัญญากลาง (ห้ามเปลี่ยนชื่อ/รูป)
- `lib/partner/mongo.ts` — `default clientPromise` (thenable, ต่อเมื่อ await), `PARTNER_DB`, `partnerDb()`, `partnerCol(name)` · **โค้ดรถร่วมห้ามอ่าน `process.env.MONGO_DB`**
- `lib/partner/auth/types.ts` — `PartnerSession { user: { email, name, image, role, employeeId } }`
- `lib/partner/auth/server.ts` — `getPartnerSession(): Promise<PartnerSession | null>` (แทน `getServerSession(authOptions)`)
- `lib/partner/auth/client.tsx` — `usePartnerSession(): { data, status }`, `<PartnerSessionProvider>` (แทน next-auth/react)
- `lib/partner/rbac.ts` — export เดิมทุกตัว · L4 แก้ `domainOfApiPath` / `salespersonPageAllowed` ให้รู้ prefix `/api/partner` และ `/partner`
- registry: `DB.partner`, `HR.partnerDriverLinks` (`partner_driver_links`, unique `contractCode`)

## กฎ
- TDD · `npm test` และ `npm run build` ต้องผ่านก่อนรายงานจบเลน (แนบตัวเลขจริง)
- เทสต์ห้ามต่อ Mongo จริง (pure function / mock) · งานที่ต้องใช้ข้อมูลจริง = เขียนสคริปต์อ่านอย่างเดียวมี limit แล้วรายงานให้เจ้าของรัน
- ไฟล์จาก repo partner คัดลอกเฉพาะที่อยู่ใน `git ls-files` (มีไฟล์ข้อมูลจริง untracked อยู่ — ห้ามติดมา)
- commit ทีละ task ลงท้าย `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## ปรับหลังรวม (L1, 19 ต.ค. 2569)
- หน้า driver-links ของ L2 อยู่ที่ `app/desk/(module)/driver-links/` (ไม่ใช่ `app/desk/driver-links/`) — เมนู `/desk/driver-links`
- ไฟล์นอกเลนที่รับรองแล้ว: `app/api/auth/callback/google/route.ts` (L4) · `app/api/payroll/summary/partner/route.ts`, `app/payroll/summary/partner-panel.tsx` และบรรทัดเสียบใน `components/payroll/summary-view.tsx` (L3)
- รอยต่อที่ L1 แก้: `lib/partner/public-routes.ts` (+`/partner/brand/`) · `lib/driver-links/audit.ts` + จุดเรียกใน `api.ts`/`_deps.ts` (ประวัติลง `partner_driver_link_events`)
- `check_db_names.mjs`, `lib/partner/mongo.ts`, `lib/db/partner.ts` เป็นของ L5 รอบสอง (แปลงโค้ดรถร่วมให้ผ่านกฎ ไม่ยกเว้น — เจ้าของงานสั่ง)
