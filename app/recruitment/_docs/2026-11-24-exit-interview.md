# Exit Interview พจส. พ้นสภาพ  ·  สถานะ: เสร็จ (เฟส 1)  ·  24 พ.ย. 2569

ต้นฉบับ: `Downloads/Reason Code_Final (version 1).xlsx` (ชีต DataLog 507 แถว · ReasonCode · Wave1 · Wave2 · คำแนะนำ · ก่อนโทร)

## Intent
- ปัญหา: วันนี้ตอนกดพ้นสภาพเก็บแค่ วันที่ + รหัสหลัก + ประเภทการออก + หมายเหตุ ส่วน Exit Interview (Wave 1 วันออก, Wave 2 โทรกลับวันที่ 30–45) ทำใน Excel แยก → ข้อมูลไม่ผูกกับทะเบียน, วิเคราะห์ "ควบคุมได้ / เจ้าของการแก้ไข" ต้องทำมือ
- ผู้ใช้: **HRD (HR ส่วนกลาง) + แผนก Process Excellence** เท่านั้น — ผู้ใช้อื่นยังกดพ้นสภาพได้ตามเดิม แต่ไม่เห็นคำตอบสัมภาษณ์
- ผลที่วัดได้: ทุกคนที่พ้นสภาพ (kind=resign) มีสถานะสัมภาษณ์ · Coverage Rate (% ที่ได้ข้อมูล ไม่ใช่ N1/N2) เห็นบนแท็บพ้นสภาพ · ส่งออก Excel คอลัมน์เดียวกับ DataLog ได้
- ไม่รวม: Dashboard วิเคราะห์เต็ม (ส่วน B–F ของชีต Dashboard) → เฟส 2 · ดึงรายได้ 3 เดือนจาก payroll อัตโนมัติ → เฟส 2 · ย้ายไปรถร่วม/ย้ายไปพจส. (ไม่ต้องสัมภาษณ์)

## Spec
### หน้าจอ
```
แท็บ "พ้นสภาพแล้ว"  [tile: รอสัมภาษณ์ 12 · รอ Wave 2 5 · Coverage 88%]
 คอลัมน์ใหม่ "Exit Interview": ⚪ยังไม่สัมภาษณ์ · 🟢W1 แล้ว · 🟡ถึงรอบ W2 (ครบ 15 ธ.ค.) · ✔ครบ · ⚫N1/N2
 คลิก chip → ลิ้นชักขวา Exit Interview (หรือแท็บ "Exit Interview" ในหน้าประวัติรายคน)

ลิ้นชัก Exit Interview
 ① ข้อมูลอ้างอิง (อ่านอย่างเดียว ดึงจากทะเบียน) ฝ่าย·ตำแหน่ง·ลูกค้า·แพล้นท์·ST Zone·RC owner·ช่องทางสรรหา
    วันเริ่ม·วันสุดท้าย·อายุงาน(วัน)·ช่วงอายุงาน·เดือนที่ออก  ← แทนชีต "ก่อนโทร"
 ② การติดต่อ  ครั้งที่ 1 07–08 น. / 2 12–13 น. / 3 19–20 น. (คนละวัน) ☐รับ ☐ไม่รับ
    ครบ 3 ครั้งไม่รับ → ปุ่ม "บันทึกเป็น N1" · ปฏิเสธ → N2
 ③ Wave 1  Q1 (เดือน) · Q2 · Q3 · Q4 ใช่/ไม่/ไม่แน่ใจ + Q4.1 เรื่อง + Q4.2 · Q5 · Q6 ตรง/ไม่ตรงบางส่วน/ไม่ตรง + ข้อความ
           Q7 ชื่อหัวหน้า · Q8 ★1–5 + Q8.1 · Q9 / Q9.1 (บาท) · Q10 · Q11 · ปุ่ม ⓘ แสดงสคริปต์/เป้าหมายคำถาม
 ④ สรุปสาเหตุ  รหัสหลัก (เริ่มจากที่กดพ้นสภาพ) + รหัสรอง ≤2 (ห้ามซ้ำ) → ควบคุมได้? / เจ้าของการแก้ไข โชว์อัตโนมัติ
 ⑤ Wave 2 (เปิดเมื่อวันออก+30, ครบกำหนด +45) QW1 · QW2/QW2.1 · QW3 + QW3.1 รหัส · QW4 · QW5
    QW3.1 ต่างจากรหัสหลัก → ถาม "ใช้เป็นรหัสหลัก?" (ตามกติกาไฟล์: ยึด Wave 2)
 ⑥ รายได้ย้อนหลัง 3 เดือน (สุทธิ · เฉลี่ย · รายการหัก) กรอกมือ
 ปุ่ม: บันทึกร่าง · บันทึก Wave 1 เสร็จ · บันทึก Wave 2 เสร็จ
```
- ฟอร์มพ้นสภาพเดิมไม่เปลี่ยน (สั้นเหมือนเดิม) — ถ้าผู้ใช้มีสิทธิ์ ขึ้นปุ่ม "บันทึก Exit Interview ต่อ" หลังบันทึก
- แจ้งเตือนความปลอดภัย: ติ๊ก "มีเรื่องความไม่ปลอดภัย/คุกคาม/ผิดกฎหมาย" → แถวขึ้นธงแดง (เฟส 1 ยังไม่ส่งข้อความหา HR Chief)

### API (ผ่าน mena-backend-services — ต้อง hr-sync + push backend)
- `GET  /api/drivers/[code]/exit-interview` → interview + ข้อมูลอ้างอิง · สิทธิ์ `exit-interview` (fail-closed)
- `PUT  /api/drivers/[code]/exit-interview` body `{ contacts, wave1, wave2, codes:{primary,secondary[]}, income, stage }` → บันทึก + อัปเดต `resignation.reasonCode` ถ้ารหัสหลักเปลี่ยน (ลง timeline)
- `GET  /api/drivers/exit-interviews/summary` → สถานะต่อคน (ไม่มีคำตอบ) สำหรับคอลัมน์/tile · สิทธิ์ `exit-interview`
- `POST /api/drivers/exit-interviews/export` → xlsx รูปแบบ DataLog 47 คอลัมน์
- `PATCH /api/recruitment/resign-reasons/[id]` เพิ่มฟิลด์ใหม่ของ master

### ข้อมูล (additive เท่านั้น)
- `master_resign_reason` + `controllable` (`yes`/`partial`/`no`/`na`) · `owner` · `evidence` · `evidenceType` · migration จากไฟล์ใหม่: เติม 4 ฟิลด์ทุกรหัส + เพิ่ม **P8** (หักเชื้อเพลิง) และ **N3** (ย้ายเป็นรถร่วม) ที่ DB ยังไม่มี · หน้าตั้งค่ารหัสแก้ฟิลด์เหล่านี้ได้
- `master_driver.resignation` + `secondaryCodes[]` · `reasonSource` (`status`/`wave1`/`wave2`) · snapshot `controllable`/`owner` ณ เวลาบันทึก
- คอลเลกชันใหม่ `driver_exit_interview` — 1 แถวต่อการพ้นสภาพ 1 ครั้ง (`drivercode` + `exitDateISO` unique) · `stage` · `contacts[]` · `wave1{}` · `wave2{}` · `income{}` · `safetyFlag` · `updatedAt/By` · index `{drivercode,exitDateISO}` unique, `{stage, wave2DueISO}`
- ตัวเลขคำนวณ (อายุงาน ช่วงอายุงาน เดือนที่ออก) คิดตอนอ่าน ไม่เก็บ

### สิทธิ์
- เพิ่ม action `exit-interview` ใต้เมนูทะเบียน ใน `lib/modules.ts` — **ค่าเริ่มต้น = ไม่เห็น** (ต่างจากเมนูอื่นที่ fail-open) → เปิดให้แผนก HRD + Process Excellence ใน `/desk/permissions`
- API ตรวจ server-side ทุกเส้น · DB/NCAC ล่ม = ปฏิเสธ (fail-closed) เพราะมีข้อมูลรายได้/ความเห็นต่อหัวหน้า

### ⚠️ Bew ตัดสินแล้ว (24 พ.ย. 2569) — ใช้ตัวเลือกที่แนะนำทั้งข้อ 1–5
1. **ที่วาง UI** — แยกลิ้นชัก Exit Interview (แนะนำ: สัมภาษณ์เกิดทีหลังโดยคนละทีม, Wave 2 ห่าง 30 วัน) vs ยัดเพิ่มในฟอร์มพ้นสภาพ
2. **นำเข้าประวัติ 507 แถวจาก DataLog** — แนะนำนำเข้า (จับคู่ด้วยรหัสพนักงาน, แถวที่ไม่เจอในทะเบียนรายงานแยก) ทำหลังเฟส 1 ใช้งานได้
3. **รหัสหลักแหล่งเดียว** — แนะนำให้ interview เขียนทับ `resignation.reasonCode` (ประวัติเดิมอยู่ใน timeline) เพื่อให้ dashboard/ส่งออกเดิมใช้รหัสจริงทันที
4. **สิทธิ์ fail-closed เฉพาะ action นี้** — แนะนำ (ระบบสิทธิ์ปัจจุบัน fail-open ทั้งหมด)
5. ฝ่ายอื่น (เช่น RC/จัดส่ง) ควรเห็นแค่ "รหัส + ควบคุมได้ + เจ้าของ" (ไม่เห็นคำตอบ) ไหม — แนะนำ: เห็นเฉพาะรหัสในแท็บพ้นสภาพเหมือนวันนี้

## Plan
| # | ไฟล์ | ทำอะไร |
|---|------|--------|
| 1 | `_lib/resign-reasons/types.ts` · `store.ts` · `resign-reason-editors.tsx` · `resign-reasons-view.tsx` | 4 ฟิลด์ใหม่ใน master + แก้ได้ในหน้าตั้งค่า |
| 2 | `migrate_resign_reasons_2026-11-24.mjs` (รากโปรเจกต์ ตามสคริปต์ seed อื่น) | เติมฟิลด์จาก xlsx + เพิ่ม N3 (P8 มีใน DB แล้ว) + เติม controllable/owner ให้ resignation เดิม 29 คน (dry-run ก่อน, backup) |
| 3 | `lib/modules.ts` · `lib/menu-access.ts` · `lib/menu-permissions.ts` | action `exit-interview` + `defaultHidden` + `requireMenu()` แบบ fail-closed |
| 4 | `_lib/exit-interview/types.ts` · `store.ts` | ชนิดข้อมูล คำถาม Q1–QW5 (ข้อความ+สคริปต์ในโค้ด) · stage · อ่าน/เขียน `driver_exit_interview` + sync `resignation` |
| 5 | `app/api/drivers/[code]/exit-interview/route.ts` · `app/api/drivers/exit-interviews/{summary,export}/route.ts` | API 4 เส้น |
| 6 | `_components/admin/exit-interview-drawer.tsx` (+ `exit-interview-sections.tsx`) | ลิ้นชัก ①–⑥ ตาม UI Kit `/design` |
| 7 | `driver-registry-view.tsx` · `exit-interview-panel.tsx` · `exit-interview-button.tsx` · `driver-profile.tsx` · `driver-status-control.tsx` | คอลัมน์ "สาเหตุการออก" + tile กรองสถานะ + ปุ่ม DataLog ในแท็บพ้นสภาพ · ปุ่ม Exit Interview ในหน้าประวัติ (แทนแท็บ) · ถามต่อหลังบันทึกพ้นสภาพ |
| 8 | `/desk/manual` + CHANGELOG | คู่มือหัวข้อ Exit Interview |
| 9 | (เฟส 1.5) `scripts/import_exit_datalog.mjs` | นำเข้า 507 แถว ถ้า Bew อนุมัติข้อ 2 |

- ลำดับ deploy: migration master (prod, หลัง backup) → hr-service commit → `node services/hr/scripts/sync.mjs ../hr-service` ใน mena-backend-services (stage เฉพาะไฟล์ที่แตะ) → push backend → push hr-service → ตั้งสิทธิ์ HRD + PE ใน `/desk/permissions`
- Verify: `npx tsc --noEmit` · `npm run lint` · unit test ของ stage/tenure band/validation รหัสรอง · เบราว์เซอร์: ผู้ใช้ไม่มีสิทธิ์ไม่เห็นคอลัมน์ + API 403 · บันทึก W1 → chip เปลี่ยน · N1 หลัง 3 ครั้ง · W2 เปลี่ยนรหัสหลัก → timeline มีรายการ · ส่งออก xlsx หัวคอลัมน์ตรง DataLog
- ความเสี่ยง: ข้อมูลอ่อนไหว (รายได้, คะแนนหัวหน้า) → fail-closed + ไม่ส่งคำตอบใน list API · rollback: ฟีเจอร์เป็น additive ทั้งหมด revert commit ได้, master migration เก็บ backup JSON

## Log
- 24 พ.ย. 2569 ร่างแรก
- 24 พ.ย. 2569 Bew เลือก: ลิ้นชักแยก · นำเข้า 507 แถวหลังเฟส 1 · interview เขียนทับรหัสหลักในทะเบียน · ผู้ใช้อื่นเห็นแค่รหัส+ควบคุมได้+เจ้าของ (fail-closed ตามข้อ 4)
- 24 พ.ย. 2569 เปลี่ยนแผน: ไม่มี timeline ในทะเบียน → เก็บรหัสเก่าใน `driver_exit_interview.reasonHistory` · หน้าประวัติใช้ปุ่มเปิดลิ้นชักแทนแท็บใหม่ · ST Zone / RC Mass / ช่องทางสรรหา ทะเบียนไม่มี → กรอกในลิ้นชัก (`reference`) · `getHiddenMenuIds` นับ `defaultOff` เป็นซ่อนแล้ว (ก่อนหน้านี้ถ้าไม่มีใครตั้ง false เลยจะเปิดทุกอย่าง — prod มี false อยู่แล้ว ผลไม่เปลี่ยน) · `useResignMaster` แยกไฟล์กัน import วน
- 24 พ.ย. 2569 ผลตรวจ: tsc ✓ · eslint ไฟล์ที่แตะ ✓ · unit `lib/exit-interview-stage.test.ts` 6/6 ✓ (`npm test` ทั้งชุดตก 2 ข้อใน `lib/payroll/notify.test.ts` — ไม่ได้แตะ, มีมาก่อน) · smoke store บน `hr_service_dev` (validation 6 แบบ, เปลี่ยนรหัส X1→E1 + history, รหัสรอง, summary, DataLog, N2) ✓ แล้วลบข้อมูลทดสอบ · migration rehearsal บน dev ✓ · prod dry-run: อัปเดต 63 รหัส + N3 + resignation 29 คน · ยังไม่ได้ทดสอบในเบราว์เซอร์ (ต้อง sync backend ก่อน เพราะ /api ถูก rewrite ไป DO)
- 24 พ.ย. 2569 ทำแล้วบน prod: migration `--apply` (63 รหัส + N3 + resignation 30 คน · backup `backups/resign-reasons-before-2026-11-24T09-04-21-017Z.json`) · สิทธิ์ `exit-interview` = true ที่ `division:34` (HOD) + `department:29` (Process Excellence) พร้อม log
- 24 พ.ย. 2569 **พักงาน (Bew สั่ง)** — staged แล้วแต่ยังไม่ commit (เฉพาะไฟล์ Exit Interview · `lib/modules.ts` stage แค่ hunk exit-interview — parking/shell-header เป็น WIP ของคนอื่น ห้ามรวม) · ค้างก่อน push: ① `exit-interview-drawer.tsx` ใช้ `toLocaleString()` ผิด Hard rule → เปลี่ยนเป็นตัว format ของ repo ② `api-docs.ts` ยังไม่มี 3 route ใหม่ (`node check_api_docs.mjs`) + `API_CHANGELOG`/`API_DOCS_UPDATED` ③ commit → hr-sync backend (stage เฉพาะไฟล์ที่แตะ) → push ทั้งสอง repo → ทดสอบในเบราว์เซอร์ (qa-tester)
- 25 พ.ย. 2569 ทำต่อ: เอา `toLocaleString` ออก · checkbox ในลิ้นชักเปลี่ยนเป็น `CheckboxGroupField` (Hard rule: input จาก field.tsx) · `api-docs.ts` 4.12.0 เพิ่ม 4 เส้น + changelog · release-check: ไม่มี env ใหม่ ไม่พบ secret (console.log เฉพาะในสคริปต์ migration)
- 25 พ.ย. 2569 ส่งขึ้น prod: hr-service 25d91ec · backend 90a681b (DO ตอบ route ใหม่แล้ว) · QA เบราว์เซอร์ด้วยบัญชี Bew (แผนก 29 Process Excellence = มีสิทธิ์): คอลัมน์สาเหตุการออก ✓ การ์ด/ชิป/DataLog/ปุ่มโปรไฟล์ขึ้น ✓ API 200 ✓ หน้าตั้งค่ารหัส + N3 ✓ ไม่มี console error · ไม่ล็อกอิน = 401 ✓ · ยังไม่ได้ลองในเบราว์เซอร์กับผู้ใช้ที่ไม่มีสิทธิ์ (ต้องใช้บัญชีแผนกอื่น)
- 25 พ.ย. 2569 (Bew) ปรับ UI: ตารางพ้นสภาพรวม “ปี-เดือน + วันที่พ้นสภาพ” เป็นช่อง “พ้นสภาพ” (กรองรายเดือนที่หัวช่อง) · แยกคอลัมน์ “Exit Interview” (ชิปสถานะ + กำหนดโทร W2) · คอลัมน์ “จัดการ” ยึดขวา รวมปุ่ม Exit Interview / ทำเอกสาร / ดูรายละเอียด · ลิ้นชักแบ่งแท็บ Wave 1 · Wave 2 · สรุป (เปิดแท็บตาม stage) · tsc + eslint ✓ · เปิดดูบน localhost ✓ (ยังไม่ commit)
- 25 พ.ย. 2569 (Bew) แยก “สาเหตุการออก” เป็น 4 ช่อง ช่องละตัวกรอง+เรียง: รหัสสาเหตุ (รหัสรองบรรทัดล่าง) · หมวดสาเหตุ · ควบคุมได้? · เจ้าของการแก้ไข · tsc + eslint ✓ · localhost ✓ (ยังไม่ commit)
- 25 พ.ย. 2569 (Bew) ออกแบบหน้าทะเบียนใหม่ตาม canvas “ทะเบียน พจส. Redesign”: แท็บ ทำงาน | พ้นสภาพ พร้อมยอดขึ้นบนสุด + สาขาขวา · แถบตัวเลขใหม่ (ประเภทแบบแถบแบ่งส่วน · พ้นสภาพ: ออกเดือนนี้ / ออกใน 4 เดือนแรก / Coverage มีเส้นเป้า) · แท็บพ้นสภาพมีกราฟรายเดือน ควบคุมได้/ไม่ได้ + สาเหตุหลัก 5 อันดับ (กดเพื่อกรอง) · หัวตารางพื้นอ่อน · ตัวกรอง/เรียงที่หัวคอลัมน์และคอลัมน์สถานะคงแบบเดิม
- 25 พ.ย. 2569 **เฟส 1.5 + 2 (Bew สั่ง)** · นำเข้า DataLog จาก `Reason Code_Final (1).xlsx` ลง prod แล้ว (`import_exit_datalog_2026-11-25.mjs --apply`): จับคู่ 499 คน → `resignation` ได้รหัสจริงแทน `XLS` (reasonSource wave1, รหัสเดิมอยู่ใน `reasonHistory`) + `driver_exit_interview` 499 แถว (`importBatch: exit-datalog-2026-11-25`, สัมภาษณ์ได้ 434 · N1/N2 65) · ข้าม 690276 (ยังทำงาน) + 7 แถวไม่มีรหัส · backup `backups/exit-datalog-before-2026-11-25T03-17-01-283Z.json`
- 25 พ.ย. 2569 ฟอร์มตาม Excel: Q1 = ช่วงเดือน (`Q1_BANDS`) แทนตัวเลข · Q9/Q9.1/QW2 = ข้อความตามที่ตอบ (`monthlyAmount()` ดึงตัวเลขรายเดือนตอนวิเคราะห์) — **ต้อง sync backend** ก่อน API บันทึกจะรับรูปใหม่
- 25 พ.ย. 2569 แดชบอร์ด TurnOver (`/recruitment/admin/dashboard` แท็บ TurnOver) แทนชีต Dashboard: `_lib/dashboard/turnover{,-shared}.ts` + `turnover-{section,charts}.tsx` · อ่านในหน้า server (ไม่ผ่าน /api) · คำตอบสัมภาษณ์เฉพาะสิทธิ์ `exit-interview`
- 25 พ.ย. 2569 ทะเบียน: แท็บที่ 3 “ย้ายไปรถร่วม / พจส.” แยกจากพ้นสภาพ (`employmentOf` ดู `resignation.kind`) · tsc + eslint ✓ · localhost ✓ · ยังไม่ commit
- 25 พ.ย. 2569 แก้: นำเข้ารอบแรกใส่ `categoryLabel` ว่าง (master เก็บ `categoryId`) → แก้สคริปต์ + รันซ้ำ 499 คน (backup `backups/exit-datalog-before-2026-11-25T03-36-11-967Z.json`) · กราฟ “พ้นสภาพรายเดือน” ในแท็บพ้นสภาพของทะเบียนเปลี่ยนเป็น 4 ชั้นแบบ TurnOver (ควบคุมได้/บางส่วน/ไม่ได้/ไม่ได้ข้อมูล + เฉลี่ยต่อเดือน) · TurnOver นับเฉพาะ `kind: resign` (ไม่รวมย้ายไปรถร่วม/พจส.)
