/**
 * เติมฟิลด์วิเคราะห์ให้ Reason Code Master จากไฟล์ `Reason Code_Final (version 1).xlsx` (24 พ.ย. 2569)
 * — ควบคุมได้? · เจ้าของการแก้ไข · หลักฐาน · ประเภทหลักฐาน + เพิ่มรหัสที่ยังไม่มี (P8, N3)
 *
 *   node migrate_resign_reasons_2026-11-24.mjs                  → dry-run พิมพ์ว่าจะเปลี่ยนอะไร (ไม่เขียน)
 *   node migrate_resign_reasons_2026-11-24.mjs --apply           → เขียนจริง (backup ลง backups/ ก่อน)
 *   เพิ่ม --db hr_service_dev เพื่อลองบนฐานทดลอง
 *
 * + เติมสำเนา `controllable`/`owner` ให้ `master_driver.resignation` ที่บันทึกไว้ก่อนมีฟิลด์นี้ (คอลัมน์ “สาเหตุการออก”)
 *
 * ไม่แตะ label/คำอธิบาย/ประเภทการออกของรหัสที่มีอยู่ (ฝ่ายบุคคลอาจแก้ไว้แล้วในหน้าตั้งค่า)
 * · ช่องที่ตั้งค่าไว้แล้วไม่ทับ ยกเว้นใส่ `--overwrite` · รหัสใหม่ได้ประเภทการออกตามหมวด (N3 = Vol)
 */
import fs from "node:fs";
import { MongoClient } from "mongodb";

import { hrDbName, loadEnv } from "./db_env.mjs";
import { HR } from "./lib/db/registry.mjs";

const env = loadEnv();
const APPLY = process.argv.includes("--apply");
const OVERWRITE = process.argv.includes("--overwrite");
const dbIdx = process.argv.indexOf("--db");
const dbName = dbIdx > 0 ? process.argv[dbIdx + 1] : hrDbName(env);

/** [รหัส, หมวดย่อย, ตัวอย่างเคส, ควบคุมได้, เจ้าของ, หลักฐาน, ประเภทหลักฐาน] */
const ROWS = [
  ["P1", "รายได้สุทธิไม่พอกับค่าครองชีพ", "บริษัทอื่นเสนอฐานเงินเดือนมากกว่า เลยตัดสินใจย้าย", "yes", "จัดส่ง", "สลิปเงินเดือน + รายได้รวมย้อนหลัง 3 เดือน + รายงานจำนวนเที่ยววิ่งย้อนหลัง 3 เดือน", "System + Payroll"],
  ["P2", "รายได้ไม่แน่นอน / เที่ยววิ่งไม่พอ", "โดนหักค่าความเสียหายทุกรายการหัก ยกเว้นเชื้อเพลิง", "yes", "จัดส่ง", "รายงานเที่ยววิ่งย้อนหลัง 3 เดือน + รายได้รายเดือนย้อนหลัง 3 เดือน", "System + Payroll"],
  ["P3", "จ่ายเงินล่าช้า", "ค่าเที่ยวเดือนที่แล้วเข้าช้า 2 สัปดาห์ ต้องไปกู้เงินมาใช้ก่อน", "yes", "HR + Finance", "Payroll Payment Report + วันที่โอนเงินจริงจากธนาคาร เทียบกำหนดวันจ่าย", "Payroll + Bank"],
  ["P4", "ที่อื่นให้ค่าตอบแทนสูงกว่า", "เคสได้งานใหม่", "yes", "HR + จัดส่ง", "Offer Letter / สัญญาจ้างจากนายจ้างใหม่ (กรณีพนักงานสมัครใจให้ข้อมูล)", "External Document"],
  ["P5", "ไม่พอใจเรื่องรายการหักเงิน", "ทุกรายการหักยกเว้นเชื้อเพลิง", "yes", "ฝ่ายที่หักเงิน", "สลิปเงินเดือน + รายละเอียดรายการหัก + เอกสารยินยอม/รับทราบรายการหัก", "Payroll + Document"],
  ["P6", "โบนัสไม่เป็นไปตามคาดหวัง", "คิดว่าปลายปีจะได้โบนัสเยอะกว่านี้ ได้แค่นี้ไม่คุ้มกับที่ทำมา", "partial", "HR + จัดส่ง", "ประกาศ/หลักเกณฑ์โบนัส + Bonus Payment Record", "Policy + Payroll"],
  ["P7", "ได้งานใหม่ ที่สวัสดิการที่ดีกว่า", "ได้งานใหม่ที่มีประกันสุขภาพ กองทุนสำรองเลี้ยงชีพ และเงินช่วยเหลือบุตร (เคสได้งานใหม่)", "partial", "HR", "Offer Letter / สัญญาจ้างใหม่ที่ระบุสิทธิประโยชน์ (ถ้ามีและพนักงานสมัครใจให้ข้อมูล)", "External Document"],
  ["P8", "ไม่พอใจเรื่องรายการหักเงินเชื้อเพลิง", "โดนหักค่าน้ำมันส่วนเกินเรต ทั้งที่รถติดและต้องวนหาที่ส่งของ", "partial", "OPS", "Fuel Consumption Report + Fuel Standard + รายการเกิน Rate + รายการแจ้ง/หักเงิน", "System + Payroll"],
  ["J1", "ชั่วโมงทำงานยาว / พักผ่อนไม่พอ", "วิ่ง 14 ชั่วโมงต่อวัน กลับถึงที่พักก็เที่ยงคืน นอนไม่ถึง 5 ชั่วโมง", "yes", "จัดส่ง", "GPS/Trip Timestamp + เวลา Scan เข้า–ออก + รายงานชั่วโมงปฏิบัติงานย้อนหลัง", "System"],
  ["J2", "งานโอนเยอะเกินไปไม่ได้พักผ่อน", "ถูกโอนงานจากคันอื่นมาให้ทุกวัน ไม่มีวันไหนได้พักจริง", "yes", "จัดส่ง", "Dispatch/Transfer Job History + ตารางปฏิบัติงานย้อนหลัง", "System"],
  ["J3", "รอโหลด / รอหน้างานนาน", "รอโหลดที่คลังเกิน 4 ชั่วโมง เสียเวลาแต่ไม่ได้ค่าตอบแทนเพิ่ม", "yes", "จัดส่ง", "GPS Geofence + เวลาเข้า–ออก Plant/หน้างาน + Trip Timestamp", "System"],
  ["J4", "ทำงานกลางคืน / ตารางคาดเดาไม่ได้", "ตารางเปลี่ยนทุกสัปดาห์ บางวันออกตี 2 วางแผนชีวิตไม่ได้", "yes", "จัดส่ง", "Dispatch Schedule + Trip Start/End Time ย้อนหลัง", "System"],
  ["J5", "ขอหยุด / ลางานได้ยาก", "ขอลาไปงานแต่ไม่อนุมัติ ต้องขอซ้ำหลายรอบ", "yes", "จัดส่ง", "Leave Request History + วันที่ยื่นคำขอ + ผลอนุมัติ/ไม่อนุมัติ", "System + HR Record"],
  ["J6", "อยากมีวันหยุดประจำ", "ทำงานต่อเนื่องทุกวัน อยากมีวันหยุดประจำสัปดาห์ให้ได้อยู่กับลูก", "yes", "จัดส่ง", "ตารางปฏิบัติงานย้อนหลัง 1–3 เดือน + Attendance Record", "System"],
  ["J7", "งานหนักกว่าที่แจ้งตอนสมัคร", "ตอนสมัครบอกว่าสบาย จริงๆ ต้องวิ่งหลายจุดและต้องขนของเองทุกจุด", "yes", "RC", "ประกาศรับสมัคร/Job Preview + JD + Job Assignment จริง", "Document + System"],
  ["J8", "ลักษณะงานซับซ้อน ยากเกินไป", "ต้องจัดเส้นทางหลายจุด ใช้แอปหลายตัว ตามไม่ทัน", "yes", "จัดส่ง + ST", "ผล OJT + Skill Assessment + Training Record", "Training Record"],
  ["J9", "งานนอกเหนือหน้าที่ (เช่น ยกของ)", "เช่น ยกของ ช่วยงานที่แพล้น ฯลฯ", "yes", "จัดส่ง", "JD + Job Assignment/ใบงาน/คำสั่งงานที่แสดงงานนอกเหนือหน้าที่", "Document"],
  ["J10", "ไม่สะดวกโยกย้ายสถานที่ทำงาน", "บริษัทย้ายไปประจำอีกศูนย์ ไกลบ้านเกิน 80 กม. ไม่สะดวกไปอยู่", "yes", "จัดส่ง", "คำสั่งโยกย้าย/Assignment Record + สถานที่ปฏิบัติงานเดิมและใหม่", "Document + System"],
  ["J11", "กังวลเรื่องความปลอดภัยของหน้างาน", "จุดส่งของเปลี่ยวและมืด เคยโดนขู่ กลัวไปส่งคนเดียวตอนกลางคืน", "yes", "Safety", "Safety Inspection + Hazard/Near Miss Report + Incident Report", "Safety Record"],
  ["L1", "วิธีสื่อสาร / ไม่ให้เกียรติ", "หัวหน้าตะคอกใส่ต่อหน้าคนอื่น พูดจาไม่สุภาพ", "yes", "จัดส่ง", "ข้อความ/Chat/Email ที่เกี่ยวข้อง + Complaint Record + ผลสอบข้อเท็จจริง", "Document + Investigation"],
  ["L2", "การสั่งงานไม่ชัดเจน ไม่เป็นระบบ", "สั่งงานแล้วเปลี่ยนแผนกะทันหัน ไม่รู้ว่าต้องทำอะไรก่อนหลัง", "yes", "จัดส่ง", "ข้อความ/ใบงาน/Dispatch Assignment ที่แสดงคำสั่งงาน + Incident/Complaint Record", "System + Document"],
  ["L3", "ได้รับการปฏิบัติที่ไม่เป็นธรรม", "คนสนิทหัวหน้าได้งานดีๆ ส่วนตัวเองได้แต่เส้นทางไกลและยาก", "yes", "จัดส่ง", "ตารางงาน/เที่ยววิ่ง/การจัดสรรงานเปรียบเทียบ + ผลสอบข้อเท็จจริง", "System + Investigation"],
  ["L4", "ไม่ได้รับการช่วยเหลือเมื่อมีปัญหาการทำงาน", "พนักงานแจ้งมาหลายรอบแต่ปัญหาไม่เคยได้รับการแก้ไขจนท้อใจลาออก", "yes", "จัดส่ง", "Ticket/Chat/Complaint Log ที่มีวันที่แจ้ง + วันที่ตอบกลับ/ปิดเรื่อง", "System + Document"],
  ["L5", "ความขัดแย้ง กับพจส.เพื่อนร่วมงาน", "มีปัญหากับเพื่อนร่วมทีมเรื่องแย่งเที่ยววิ่ง ทำงานด้วยกันไม่ได้", "yes", "จัดส่ง + ST", "Complaint/Incident Report + บันทึกสอบข้อเท็จจริง", "Investigation"],
  ["L6", "ความขัดแย้ง กับเจ้าหน้าที่จัดส่ง", "เจ้าหน้าที่จัดส่งให้งานไม่เท่าเทียม และมีปากเสียงกันบ่อย", "yes", "จัดส่ง", "Complaint Record + บันทึกสอบข้อเท็จจริง", "Investigation"],
  ["L7", "ความขัดแย้ง กับเจ้าหน้าที่ฝ่ายอื่นๆ", "ฝ่ายบัญชีไม่ชี้แจงเรื่องยอดหัก ทะเลาะกันเรื่องเอกสาร", "yes", "ST+ฝ่ายที่เกี่ยวข้อง", "Complaint Record + บันทึกสอบข้อเท็จจริง", "Investigation"],
  ["L8", "บรรยากาศการทำงานตึงเครียด", "ทีมกดดันกันตลอด เข้างานแล้วเครียดทุกวัน", "yes", "จัดส่ง", "ผล Employee Survey ของหน่วยงาน + Complaint/Incident Trend", "Survey + System"],
  ["L9", "หัวหน้าไม่รับฟังความคิดเห็นของพนักงาน", "เสนอเส้นทางที่ประหยัดเวลากว่า แต่หัวหน้าไม่ฟังเลย", "yes", "จัดส่ง", "Complaint/Feedback Record + หลักฐานการแจ้งเรื่องและการตอบกลับ", "Document"],
  ["L10", "มีความกังวลเรื่องการใช้เชื้อเพลิง อึดอัด กลัวเกินเรต", "กลัวใช้น้ำมันเกินเรตแล้วโดนหัก จนไม่กล้าแวะจอดพัก ขับด้วยความเครียด", "yes", "OPS", "Fuel Consumption Report + Fuel Standard + รายการเกิน Rate + รายการแจ้ง/หักเงิน", "System + Payroll"],
  ["E1", "รถเสียบ่อย / ซ่อมช้า", "รถเสียเดือนละ 3-4 ครั้ง เสียเที่ยววิ่งแต่ไม่มีใครชดเชย", "yes", "ซ่อมบำรุง", "Repair History + จำนวนครั้งเสีย + Downtime + วันที่แจ้งซ่อม/รับเรื่อง/ปิดงาน", "Maintenance System"],
  ["E2", "กังวลเรื่องความปลอดภัยของรถ", "เบรกไม่ค่อยอยู่ ยางสึก กลัวเกิดอุบัติเหตุ", "yes", "ซ่อมบำรุง", "Vehicle Inspection + Repair History + Safety Defect Report", "Maintenance + Safety"],
  ["E3", "สภาพรถ / ความสะอาด / สิ่งอำนวยความสะดวก", "แอร์ไม่เย็น เบาะขาด รถสกปรก นั่งขับทั้งวันแล้วปวดหลัง", "yes", "ซ่อมบำรุง", "Vehicle Inspection Checklist + ภาพถ่ายพร้อมวันที่ตรวจ", "Inspection"],
  ["E4", "ได้รับการประสานงานซ่อมล่าช้า", "แจ้งแล้วลืม ไม่ได้ซ่อมสักที", "yes", "ซ่อมบำรุง", "Repair Request Timestamp ตั้งแต่แจ้ง → รับเรื่อง → เปิดงาน → ปิดงาน", "Maintenance System"],
  ["O1", "ไม่มีพี่เลี้ยง / ไม่มีคนสอนงาน", "ถูกปล่อยให้วิ่งเองตั้งแต่วันแรก ไม่มีใครสอนระบบหรือเส้นทาง", "yes", "จัดส่ง + ST", "Mentor Assignment + OJT Checklist/Training Record", "Training Record"],
  ["O2", "ข้อมูลตอนสมัครไม่ตรงกับงานจริง", "ตอนสมัครบอกว่าวิ่งในเมือง แต่จริงๆ ต้องวิ่งต่างจังหวัด", "yes", "RC", "ประกาศรับสมัคร/Job Preview/JD เทียบกับ Job Assignment จริง", "Recruitment + Document"],
  ["O3", "ช่วงทดลองงานกดดัน / ถูกตำหนิบ่อย", "ช่วงทดลองงานโดนว่าทุกวัน รู้สึกว่าทำอะไรก็ผิด", "yes", "จัดส่ง + ST", "OJT/Probation Feedback + Coaching/Warning Record + ผลสอบข้อเท็จจริง (ถ้ามีข้อร้องเรียน)", "HR Record + Investigation"],
  ["O4", "เอกสาร/สวัสดิการ/ที่พักไม่พร้อมตอนเริ่มงาน", "เข้างานแล้วแต่ที่พักยังไม่พร้อม ต้องนอนในรถ เอกสารประกันก็ยังไม่เสร็จ", "yes", "RC", "Onboarding Checklist + วันที่เริ่มงานเทียบวันที่ได้รับเอกสาร/สิทธิ/ที่พัก", "HR Record"],
  ["O5", "ประเมินตนเองว่าทักษะความสามารถไม่สามารถทำงานนี้ได้", "ลองทำแล้วรู้สึกว่าขับรถใหญ่และใช้แอปไม่ไหว คิดว่าไม่เหมาะกับงานนี้", "partial", "RC", "Skill Assessment + OJT Evaluation + Training Result", "Training Record"],
  ["O6", "รอรับรถนาน รอไม่ไหว", "ผ่านสัมภาษณ์แล้วแต่รอรถเกิน 3 สัปดาห์ ไม่มีรายได้ เลยไปทำที่อื่น", "yes", "ซ่อมบำรุง", "วันที่เริ่มงาน + วันที่ Assign รถ + วันที่เริ่มเที่ยวแรก", "System"],
  ["C1", "รู้สึกว่าไม่มีเส้นทางความก้าวหน้า", "ทำมา 2 ปีก็ยังเป็นพนักงานขับรถเหมือนเดิม ไม่เห็นโอกาสขึ้นเป็นหัวหน้าทีม", "yes", "HROD", "Career Path/Promotion Criteria ของตำแหน่ง + Promotion History", "HR Policy + HR Record"],
  ["C2", "รู้สึกว่าไม่ได้รับการพัฒนาทักษะเพียงพอ", "ไม่เคยมีอบรมเพิ่มเติม อยากเรียนรู้เรื่องอื่นนอกจากการขับรถ", "yes", "ST", "Training Plan + Individual Training History + OJT Record", "Training Record"],
  ["F1", "ต้องกลับไปดูแลครอบครัว", "แม่ป่วยติดเตียง ต้องกลับไปดูแลที่บ้าน", "no", "-", "ใบลาออก/ข้อความยืนยันจากพนักงานที่ระบุเหตุผล", "Employee Document"],
  ["F2", "ปัญหาสุขภาพ", "หมอให้พักรักษาโรคกระดูกทับเส้น ขับรถนานไม่ได้", "no", "-", "ใบลาออก/คำยืนยันพนักงาน + ใบรับรองแพทย์เฉพาะกรณีที่มีและจำเป็น", "Employee/Medical Document"],
  ["F3", "ประสบอุบัติเหตุส่วนตัว", "ประสบอุบัติเหตุขณะขับมอเตอร์ไซค์นอกเวลางาน ต้องพักฟื้นหลายเดือน", "no", "-", "เอกสารโรงพยาบาล/ใบรับรองแพทย์/เอกสารอุบัติเหตุ (ถ้ามี)", "External Document"],
  ["F4", "ย้ายภูมิลำเนา", "ครอบครัวย้ายไปอยู่ต่างจังหวัด ต้องย้ายตามไปด้วย", "no", "-", "ใบลาออก/ข้อความยืนยันจากพนักงาน", "Employee Document"],
  ["F5", "กลับไปทำเกษตร / ธุรกิจครอบครัว / ธุรกิจส่วนตัว", "กลับไปช่วยพ่อทำสวนยาง / เปิดร้านขายของของตัวเอง", "no", "-", "ใบลาออก/ข้อความยืนยันจากพนักงาน", "Employee Document"],
  ["F6", "ปัญหาการเงินส่วนตัว", "มีหนี้นอกระบบถูกทวงถามบ่อย ต้องหยุดงานไปจัดการ", "no", "-", "คำยืนยันเหตุผลจากพนักงาน/ใบลาออก (ไม่บังคับขอข้อมูลทางการเงินส่วนตัว)", "Employee Document"],
  ["F7", "เปลี่ยนสายอาชีพ ออกจากงานขับรถ", "อยากเปลี่ยนไปทำงานออฟฟิศ ไม่ขับรถแล้ว", "no", "-", "ใบลาออก/ข้อความยืนยัน + Offer Letter ถ้ามี", "Employee/External Document"],
  ["F8", "ไม่สะดวกในการเดินทางมาทำงาน", "ที่พักใหม่ไกลศูนย์ ต้องเดินทาง 2 ชั่วโมง ไม่มีรถรับส่ง", "partial", "RC", "สถานที่ปฏิบัติงาน/Assignment Location + ใบลาออกหรือข้อความยืนยัน", "System + Employee Document"],
  ["X1", "ไม่ผ่านการฝึกงาน", "ฝึกงานครบแต่ประเมินขับรถและใช้ระบบไม่ผ่านเกณฑ์", "yes", "RC", "Training Assessment + OJT Evaluation + เอกสารแจ้งผล", "Training + HR Record"],
  ["X2", "ไม่ผ่านการทดลองงาน 119 วัน", "ครบ 119 วันแล้วผลประเมินไม่ผ่าน ตัวชี้วัดต่ำกว่าเกณฑ์", "yes", "จัดส่ง + ST", "Probation Evaluation + หนังสือแจ้งผล/สิ้นสุดการจ้าง", "HR Record"],
  ["X3", "ลูกค้าส่งคืน", "ลูกค้าร้องเรียนซ้ำและขอเปลี่ยนคนขับ จึงส่งคืนบริษัท", "yes", "จัดส่ง + ST", "หนังสือ/Email จากลูกค้า + รายงานตรวจสอบข้อเท็จจริงภายใน", "Customer + Investigation"],
  ["X4", "ปลดเนื่องจากเรื่องเชื้อเพลิง", "ใช้น้ำมันเกินเรตผิดปกติต่อเนื่องหลายเดือน ตรวจพบการเติมที่ไม่ตรงกับเที่ยววิ่ง", "yes", "OPS", "GPS/Trip Data + Fuel Transaction + Fuel Consumption Report + Investigation Report", "System + Investigation"],
  ["X5", "ปลดเนื่องจากทำผิดวินัย", "(ทะเลาะวิวาท, ก่อความเสียหาย, นำรถออกนอกพื้นที่, ขาดงาน ละทิ้งหน้าที่)", "yes", "Safety + จัดส่ง + OPS + HR", "Incident Report + พยานหลักฐาน + Investigation Report + หนังสือดำเนินการทางวินัย/เลิกจ้าง", "Investigation + HR Record"],
  ["X6", "ปลดเนื่องจากสารเสพติด / แอลกอฮอล์", "ตรวจพบแอลกอฮอล์ และปัสสาวะตรวจพบสารเสพติด", "partial", "Safety", "ผลตรวจตามกระบวนการบริษัท + Chain/Record การตรวจ + Investigation + เอกสารทางวินัย", "Safety + Investigation"],
  ["X7", "ปลดเนื่องจากไม่ปฏิบัติตามระเบียบความปลอดภัย", "ทำให้เกิดอุบัติเหตุ,ไม่คาดเข็มขัด ใช้มือถือขณะขับ ทำให้เกิดอุบัติเหตุ", "yes", "Safety", "CCTV/GPS/Telematics (ถ้ามี) + Accident/Safety Report + Investigation Report", "Safety + System"],
  ["X8", "ทุจริตนายจ้าง / ลูกค้า", "เก็บเงินปลายทางแล้วไม่นำส่ง หรือแอบขายสินค้า", "yes", "Safety + จัดส่ง + OPS", "CCTV/GPS/Transaction/เอกสารลูกค้า/พยานหลักฐาน + Investigation Report", "Investigation"],
  ["X9", "ทำผิดกฎหมายและถูกดำเนินคดีในเรื่องอื่นๆ", "ถูกจับกุมคดีนอกเวลางาน และมีหมายศาลเรียก", "no", "-", "เอกสารจากตำรวจ/ศาล/หน่วยงานรัฐที่บริษัทได้รับโดยชอบ + เอกสาร HR ที่เกี่ยวข้อง", "Official Document"],
  ["X10", "หมดสัญญาจ้าง / เลิกจ้างตามโครงสร้าง / เกษียณอายุ", "หมดสัญญาจ้างและไม่ต่อ / ปิดเส้นทางเดินรถจึงลดตำแหน่ง / เกษียณอายุ 60 ปี", "yes", "HR", "Employment Contract / Org Announcement / Retirement Record + หนังสือสิ้นสุดการจ้าง", "HR Official Record"],
  ["X11", "ตรวจเจอประวัติอาชญากรรม / บัญชีม้า", "ตรวจประวัติย้อนหลังหลังเข้างานพบประวัติอาชญากรรมที่ไม่ได้แจ้งไว้", "yes", "RC", "ผลตรวจสอบอย่างเป็นทางการจากแหล่งที่บริษัทใช้โดยชอบ + HR Review Record", "Official/HR Record"],
  ["X12", "เสียชีวิต", "เสียชีวิตจากอุบัติเหตุ/โรคประจำตัว ญาติแจ้งบริษัท", "no", "-", "มรณบัตร/เอกสารทางราชการหรือเอกสารแจ้งการเสียชีวิตที่บริษัทได้รับ", "Official Document"],
  ["N1", "ติดต่อไม่ได้ (โทรครบ 3 ครั้งแล้ว)", "โทร 3 ครั้งต่างวัน ต่างเวลา ไม่รับสาย และไม่ตอบข้อความ", "na", "-", "Call Log อย่างน้อย 3 ครั้ง ระบุวันที่/เวลา + ประวัติข้อความที่ส่งติดต่อ", "Contact Log"],
  ["N2", "ปฏิเสธการให้ข้อมูล", "รับสายแต่บอกว่าไม่สะดวกคุย ไม่ขอให้เหตุผลการลาออก", "na", "-", "Contact Record + แบบ Exit Interview/บันทึกระบุว่าพนักงานปฏิเสธให้ข้อมูล พร้อมวันที่", "Contact Record"],
  ["N3", "ย้ายเป็นรถร่วม", "", "na", "-", "", ""],
];

/** ประเภทการออกของรหัสใหม่ — N3 ย้ายเป็นรถร่วม ติดต่อได้และออกเอง */
const NEW_EXIT_TYPE = { N3: "vol" };

console.log(`ปลายทาง: database "${dbName}" · ${APPLY ? "เขียนจริง" : "dry-run"}${OVERWRITE ? " · overwrite" : ""}`);
const client = await new MongoClient(env.MONGO_URI).connect();
try {
  const db = client.db(dbName);
  const categories = db.collection(HR.resignCategories.name);
  const reasons = db.collection(HR.resignReasons.name);
  const existing = await reasons.find().toArray();
  const byCode = new Map(existing.map((r) => [r.code, r]));
  const cats = new Map((await categories.find().toArray()).map((c) => [c.prefix, c]));
  const stamp = { updatedAt: new Date().toISOString(), updatedBy: "migrate (Reason Code_Final 2026-11-24)" };

  const updates = [];
  const inserts = [];
  for (const [code, label, example, controllable, owner, evidence, evidenceType] of ROWS) {
    const fields = { controllable, owner, evidence, evidenceType };
    const cur = byCode.get(code);
    if (cur) {
      const set = {};
      for (const [k, v] of Object.entries(fields)) {
        if (!v) continue;
        if (cur[k] === v) continue;
        if (cur[k] && !OVERWRITE) continue;
        set[k] = v;
      }
      if (Object.keys(set).length) updates.push({ code, set });
    } else {
      const prefix = code.replace(/\d+$/, "");
      const cat = cats.get(prefix);
      if (!cat) {
        console.warn(`ข้าม ${code} — ไม่มีหมวด ${prefix}`);
        continue;
      }
      const order = Math.max(0, ...existing.filter((r) => r.categoryId === cat._id.toHexString()).map((r) => r.order ?? 0)) + 1;
      inserts.push({
        code,
        categoryId: cat._id.toHexString(),
        label,
        description: example,
        exitType: NEW_EXIT_TYPE[code] ?? cat.exitType,
        active: true,
        order,
        ...fields,
        ...stamp,
      });
    }
  }
  const inFile = new Set(ROWS.map((r) => r[0]));
  const onlyDb = existing.filter((r) => !inFile.has(r.code)).map((r) => r.code);

  console.log(`อัปเดต ${updates.length} รหัส · เพิ่มใหม่ ${inserts.length} รหัส (${inserts.map((r) => r.code).join(", ") || "-"})`);
  for (const u of updates) console.log(`  ${u.code}`, JSON.stringify(u.set));
  if (onlyDb.length) console.log(`มีใน DB แต่ไม่มีในไฟล์ (ไม่แตะ): ${onlyDb.join(", ")}`);

  /* ระเบียนพ้นสภาพที่ยังไม่มีสำเนา controllable — ใช้ค่าจากไฟล์ (รหัสที่ไม่มีในไฟล์ข้าม) */
  const fileBy = new Map(ROWS.map((r) => [r[0], { controllable: r[3], owner: r[4] }]));
  const drivers = db.collection(HR.drivers.name);
  const stale = await drivers
    .find({ statusOverride: "resigned", "resignation.reasonCode": { $in: [...fileBy.keys()] }, "resignation.controllable": { $exists: false } }, { projection: { drivercode: 1, "resignation.reasonCode": 1 } })
    .toArray();
  console.log(`ระเบียนพ้นสภาพที่จะเติม ควบคุมได้/เจ้าของ: ${stale.length} คน`);

  if (!APPLY) {
    console.log("dry-run — ใส่ --apply เพื่อเขียนจริง");
  } else {
    fs.mkdirSync(new URL("./backups/", import.meta.url), { recursive: true });
    const file = new URL(`./backups/resign-reasons-before-${stamp.updatedAt.replace(/[:.]/g, "-")}.json`, import.meta.url);
    fs.writeFileSync(file, JSON.stringify(existing, null, 2));
    console.log(`backup → ${file.pathname}`);
    for (const u of updates) await reasons.updateOne({ code: u.code }, { $set: { ...u.set, ...stamp } });
    if (inserts.length) await reasons.insertMany(inserts);
    for (const d of stale) {
      const f = fileBy.get(d.resignation.reasonCode);
      await drivers.updateOne(
        { _id: d._id, "resignation.controllable": { $exists: false } },
        { $set: { "resignation.controllable": f.controllable, "resignation.owner": f.owner } },
      );
    }
    console.log("เสร็จ");
  }
} finally {
  await client.close();
}
