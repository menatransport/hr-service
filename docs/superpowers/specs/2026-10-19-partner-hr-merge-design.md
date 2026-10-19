# รวม mena-partner-driver เข้า hr-service — สเปกการออกแบบ

วันที่ 19 ต.ค. 2569 · branch `feat/partner-merge` (แตกจาก `feat/payroll-intake-monthly` ที่ยังมี 43 commit ไม่ได้ push)

## เป้าหมาย

ข้อมูล "คนขับ" กับ "เงินเดือน" ของบริษัทต้องเหลือชุดเดียวที่ทุกฝ่ายอ้าง

1. **ตัวเลขคนขับทั้งบริษัท** ตัวเดียว — นับจากทะเบียน ETL (พจส. พจร. สแปร์) รวมกับคนขับรถร่วมในระบบ partner โดยไม่นับซ้ำคนที่จับคู่กันแล้ว
2. **ยอดเงินรถร่วม** เข้า `/payroll/summary` ท่อเดียวกับรายการ intake — ไม่ยุบเครื่องคำนวณของ partner (`payroll-engine.ts`) แต่อ่านผลของมันขึ้นมาเป็นรายการหนึ่ง
3. ย้ายโค้ดแอป partner ทั้งแอป (รวมเว็บขาย `/trucks`) เข้ามาอยู่ใน hr-service แล้วปิด repo เดิม

## คำตัดสินที่ล็อกแล้ว

| # | เรื่อง | คำตัดสิน |
|---|---|---|
| 1 | ขอบเขต | ย้ายทั้งแอป รวม `/trucks` แล้วปิด repo `nrk16p/mena-partner` |
| 2 | ฐานข้อมูล | คง `mena_partner` แยก (คลัสเตอร์เดียวกับ `hr_service`) ใช้ `MongoClient` ตัวเดียว `client.db("mena_partner")` — ไม่ย้ายคอลเลกชัน |
| 3 | ล็อกอิน | ใช้ session ของ hr-service ทิ้ง next-auth |
| 4 | ลำดับ | **ข้อมูลก่อน โค้ดทีหลัง** — สายเชื่อมคนขับเป็นขั้นแรก |
| 5 | ระดับการรวม | ทั้ง (a) ตัวเลขคนขับตัวเดียว และ (b) ยอดรถร่วมเข้า `/payroll/summary` · ไฟล์ส่ง Tiger Soft ยังไม่แตะ (สเปกค้าง) |

## ค่าเริ่มของจุดตัดสินใจที่เจ้าของยังไม่ตอบ (ใช้ไปก่อน เปลี่ยนได้)

| Gate | ค่าเริ่มที่ใช้ | ถ้าเจ้าของเปลี่ยน |
|---|---|---|
| G1 URL | หน้า `/partner/**` + API `/api/partner/**` · `/trucks` `/sitemap.xml` `/robots.txt` `/og/**` อยู่ที่ราก | ต้องย้ายโฟลเดอร์ + แก้ลิงก์ภายใน |
| G2 UI | ไม่ re-skin · ตัวแปรสีของ partner ถูกขังไว้ใต้ `.partner-theme` | re-skin = งานเพิ่ม 5–8 วัน |
| G4 สิทธิ์ | อ่านบทบาทจาก `mena_partner.app_users` ด้วยอีเมล + `SUPERADMIN_EMAILS` · **ไม่พบ = `viewer`** | ระบบเดิมให้ `salesperson` กับคนในโดเมนที่ไม่มีแถว และให้ `admin` ตอนฐานล่ม — เราเลิกทั้งสองพฤติกรรม (fail-closed) |
| G3 โดเมน · G5 Vercel · G6 วันตัดระบบ | **ไม่ทำเอง** — รอเจ้าของ | — |

## แหล่งความจริง (System of Record)

| ข้อมูล | เจ้าของ |
|---|---|
| ตัวตน ชื่อ สาขา รถที่ขับ วันเริ่มงาน ใบขับขี่ สถานะการจ้าง | ETL `Boom_ETL.main_driver` (+ `statusOverride` ของ hr) |
| บัญชีธนาคาร เจ้าของรถ สัญญา ยอดผ่อน ยอดจ่าย | `mena_partner` |
| คู่ คนขับรถร่วม ↔ `drivercode` | `hr_service.partner_driver_links` (ใหม่ hr เป็นเจ้าของ) |

- สถานะสองฝั่งไม่ตรงกัน = **รายการขัดแย้ง** ให้คนตัดสิน ระบบไม่ทับค่าให้เอง
- **การจ่ายเงินยึดสถานะของ partner เสมอ** · คนที่ไม่มีคู่ไม่ใช่ error และห้ามขวางการจ่าย

## ข้อเท็จจริงที่ห้ามพลาด

- `staffCode` ของ partner คือเลขชุด `MTM###` ที่ partner ออกเอง (`app/api/drivers/next-code`) **ไม่ใช่ `drivercode`** ห้ามใช้ join
- `owner_type` ของ ETL: `1` พจส. · `2` พจร. (รถร่วม) · `3` สนง · `4` พจส.สแปร์ — ค่าดิบปนทั้งตัวเลขและข้อความ ต้องผ่าน `resolveOwnerTypeKey()`
- ยังไม่รู้ว่า ETL มีเลขบัตรประชาชนหรือไม่ → ค่าคงที่ `ETL_NATIONAL_ID_FIELD` (เริ่มต้น `null`) — ตัวจับคู่ต้องทำงานได้ทั้งมีและไม่มี
- session ของ hr **ไม่มีอีเมล** (NCAC `/auth/google` ไม่คืนอีเมล) — แต่ `id_token` ของ Google ที่ callback ได้มาตรง ๆ มี claim `email` ต้องเก็บลง session เพิ่ม ถึงจะหา role จาก `app_users` ได้

## ส่วนที่ 1 — สายเชื่อมคนขับ

### คอลเลกชัน `hr_service.partner_driver_links`

```ts
{
  _id: ObjectId,
  contractCode: string,      // unique — หนึ่งสัญญาผูกได้หนึ่ง drivercode
  partnerDriverId?: string,  // drivers._id ของ partner ณ ตอนยืนยัน (ไว้ตรวจย้อน)
  drivercode: string,        // ต้องมีจริงในทะเบียน (driverExists)
  matchedBy: "nationalId" | "name+plate" | "name" | "manual",
  confidence: "high" | "medium" | "low",
  confirmedBy: string,       // employeeId จาก session — ไม่เชื่อค่าจาก client
  confirmedByName: string,
  confirmedAt: Date,
}
```
ดัชนี: `contractCode_unique` (unique) · `drivercode`

**ไม่มีการเขียนอัตโนมัติ** ทุกแถวเกิดจากคนกดยืนยัน · ปลดคู่ = ลบแถว (บันทึกเหตุการณ์ไว้ใน log ของแถวไม่ได้เพราะลบ — จึงเก็บ `partner_driver_link_events` แบบต่อท้ายอย่างเดียว)

### ตัวจับคู่ (pure)

| สัญญาณ | ผล |
|---|---|
| เลขบัตร 13 หลักตรงกัน (เมื่อ ETL มีฟิลด์) | `nationalId` · `high` |
| ชื่อ-สกุลตรงกันหลังทำให้เป็นมาตรฐาน + ทะเบียนรถตรงกัน | `name+plate` · `medium` |
| ชื่อ-สกุลตรงกันอย่างเดียว | `name` · `low` |
| มีผู้สมัครเกินหนึ่งคนในชั้นเดียวกัน | ลดเป็น `low` + ติดธง `ambiguous` |

ทำให้ชื่อเป็นมาตรฐาน: ตัดคำนำหน้า (นาย นาง นางสาว น.ส. ด.ช. ด.ญ. Mr Mrs Ms) ตัดช่องว่างซ้ำ ตัดจุด · ทะเบียน: ตัดช่องว่าง/ขีด/จุด และชื่อจังหวัดท้ายทะเบียน
ผู้สมัครฝั่ง ETL ให้น้ำหนัก `owner_type = 2` ก่อน แต่ไม่ตัดคนประเภทอื่นทิ้ง (เคยเป็น พจส. แล้วมาเป็นรถร่วมได้)

### ตัวเลขคนขับ (pure)

```
etlActive        = คนใน ETL ที่ active (หลังทับ statusOverride) และประเภท 1, 2, 4
partnerActive    = drivers ของ partner ที่ status=active และไม่ใช่ (isTruckOwner && !isDriver)
linkedDistinct   = จำนวน partnerDriverId ที่ active และมีคู่ซึ่ง drivercode อยู่ใน etlActive
total            = etlActive + partnerActive − linkedDistinct
```
- คนเดียวมีสองสัญญา (สองรหัสในฝั่ง partner) นับครั้งเดียวด้วย `partnerDriverId`
- หน้าจอแสดงสองตัวเลขคู่กัน (ETL / partner) + ส่วนต่าง + ยอดรวมที่ตัดซ้ำแล้ว
- **ข้อสมมติที่ต้องให้เจ้าของยืนยัน**: เจ้าของรถที่ไม่ขับเองไม่นับ · คนที่มีสองรหัสนับครั้งเดียว · สแปร์นับ

### รายการขัดแย้ง

| ชนิด | เงื่อนไข |
|---|---|
| `status` | คู่ที่ยืนยันแล้ว: partner active แต่ ETL ไม่ active หรือกลับกัน |
| `ownerType` | คู่ที่ยืนยันแล้ว: ETL ไม่ใช่ `2` (พจร.) |
| `missingDriver` | คู่ชี้ไป `drivercode` ที่หายจากทะเบียนแล้ว |
| `unlinkedActive` | partner active ไม่มีคู่ (ข้อมูล ไม่ใช่ error) |

## ส่วนที่ 2 — ยอดรถร่วมเข้า `/payroll/summary`

- adapter แบบ pure: `payroll_entries` (เดือน `YYYY-MM`) + links → แถว `{ payeeId: contractCode, personId: drivercode | null, personType: "พจร.", amount fields }`
- ขึ้นเป็นรายการ intake ใหม่ (เลขไม่ชนของเดิม) ที่ **ระบบเป็นคนส่ง** — ไม่ต้องอัปโหลดไฟล์ · สถานะมาจากการปิดงวดของ partner (`month_status`) ไม่ได้มาจาก HR กดผ่าน
- รอบ hr (`PeriodRef`) ↔ เดือน partner: ใช้ค่าคงที่เดียวในโค้ด ให้เจ้าของยืนยัน

## ส่วนที่ 3 — ย้ายโค้ด

ตามแผน PM 7 เฟส (ตัดเฟสสายเชื่อมคนขับออกเพราะทำในส่วนที่ 1 แล้ว): รากฐาน → auth + proxy เดียว → สไลซ์บาง `price-list` → คลื่น W2–W6 · cutover ไม่ทำในงานนี้

### ด่านเดียว (`proxy.ts`)

1. allowlist สาธารณะ: `/trucks`, `/trucks/**`, `/sitemap.xml`, `/robots.txt`, `/og/**`, `/api/public/**`, `/api/partner/cron/**` (route ตรวจ `Bearer CRON_SECRET` เอง)
2. ไม่มี session → หน้า: เด้งไปหน้าล็อกอิน · API: 401 — **รวม GET ใต้ `/api/partner/**`**
3. salesperson เปิดหน้าใต้ `/partner/**` ได้เฉพาะ price-list / quotations / catalog
4. non-GET ใต้ `/api/partner/**` ตรวจตาราง RBAC (DELETE = admin) แบบเดิม
5. ของเดิมของ hr ไม่เปลี่ยน

## นอกขอบเขต
- ไฟล์ Tiger Soft · cutover · DNS/โดเมน · Vercel · push
- การเชื่อมฐานจริงทุกรูปแบบระหว่างพัฒนา — สคริปต์ที่ต้องใช้ข้อมูลจริงเขียนไว้ให้เจ้าของรันเอง

## การแบ่งงาน (19 ต.ค. 2569)

งานถูกแบ่งเป็น 5 เลนขนานกัน แต่ละเลนมี worktree/branch ของตัวเอง แล้วรวมกลับที่ `feat/partner-merge` — ตารางเจ้าของไฟล์และสัญญากลางอยู่ที่ `docs/partner-merge/LANES.md` · สถานะ/หลักฐานอยู่ที่ `docs/partner-merge/STATUS.md`

| เลน | ส่วนของสเปก |
|---|---|
| L1 | รากฐาน (test runner, เมนู, vercel, env) + รวมงาน |
| L2 | ส่วนที่ 1 สายเชื่อมคนขับ (รับ `lib/partner-link/**` ไปเป็น `lib/driver-links/**`) |
| L3 | ส่วนที่ 2 ยอดรถร่วมเข้า `/payroll/summary` |
| L4 | ด่านเดียว + session (รวมการดึง `email` จาก Google `id_token` ลง session) |
| L5 | ส่วนที่ 3 ย้ายโค้ด + `styles/partner-theme.css` |

## พฤติกรรมที่เปลี่ยนจากระบบเดิมโดยตั้งใจ (ต้องแจ้งผู้ใช้)

- คนในโดเมนที่ไม่มีแถวใน `app_users` เดิมได้ `salesperson` → ตอนนี้ได้ `viewer` (เห็นได้ แก้ไม่ได้) — admin ต้องเพิ่มแถวให้ฝ่ายขายก่อนวันตัดระบบ
- ฐานล่มตอนหา role เดิมได้ `admin` (fail-open) → ตอนนี้ได้ `viewer` (fail-closed)
- บทบาทเปลี่ยนแล้วมีผลเมื่อล็อกอินใหม่ (session อายุสูงสุด 8 ชม.) ถ้า L4 เก็บ role ไว้ใน session
