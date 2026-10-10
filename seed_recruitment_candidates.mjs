/**
 * ใส่ใบสมัครตัวอย่าง 5 ใบ ลง hr_service."recruitment_regist_answer"
 *
 *   node seed_recruitment_candidates.mjs          → ล้างตัวอย่างเดิมแล้วใส่ใหม่
 *   node seed_recruitment_candidates.mjs --clean  → ลบเฉพาะตัวอย่าง (ฟิลด์ `sample: true`) *
 * ⚠️ เขียนได้เฉพาะ `hr_service_dev` — ใส่ `--db hr_service_dev` (หรือ `MONGO_DB=hr_service_dev`)
 *    จะลงฐานจริงต้องใส่ `--force` เอง (ดู `seedTargetDb()` ใน `db_env.mjs`)
 *
 * **คำถามอ่านจากคลังคำถามจริงในฐานข้อมูล** (`recruitment_regist_question`)
 * ไม่ได้ก๊อปมาแปะไว้ที่นี่ — ใบตัวอย่างจึงมี `questionSnapshot` เหมือนใบที่ผู้สมัคร
 * ส่งเข้ามาจริงทุกประการ และถ้าฝ่ายบุคคลแก้คำถาม รันใหม่ก็ได้ข้อมูลที่ตรงกับ
 * ฟอร์มปัจจุบันทันที ไม่มีทางเหลือคำตอบเวอร์ชันเก่าค้างอยู่
 *
 * คำตอบถูกระบุด้วย **ข้อความของคำถาม** ไม่ใช่คีย์ (`q_844264d995`) เพราะคีย์
 * ถูกสร้างใหม่ทุกครั้งที่ลบข้อนั้นแล้วเพิ่มกลับเข้ามา — เหตุผลเดียวกับที่ตาราง
 * แอดมินหาคอลัมน์ด้วย `ROLE_MATCHERS` (ดู `lib/recruitment/form.ts`)
 *
 * ทุกใบมีฟิลด์ `sample: true` ติดไว้ ลบทีหลังได้โดยไม่แตะใบจริงแม้แต่ใบเดียว
 */
import { MongoClient } from "mongodb";

import { loadEnv, seedTargetDb } from "./db_env.mjs";
import { HR } from "./lib/db/registry.mjs";

/* ---------------------------------------------------------------- env */

const env = loadEnv();

const ANSWERS = HR.applications.name;
const QUESTIONS = HR.questions.name;
const COUNTERS = HR.recruitmentCounters.name;

/* ------------------------------------------------------------ ผู้สมัคร */

/**
 * ห้าใบนี้ไล่ครอบคลุมทั้งสายการคัดเลือก ตั้งแต่ใบที่เพิ่งเข้ามาจนถึงใบที่ปิดไปแล้ว
 * — หน้าจอจะได้มีของให้ดูครบทุกสถานะตั้งแต่เปิดครั้งแรก ไม่ใช่มีแต่แถวสีเดียวกันหมด
 *
 * `picks` จับคู่ **ข้อความคำถาม → ข้อความตัวเลือก** ข้อที่ไม่ได้ระบุไว้จะถูกสุ่ม
 * ด้วย seed คงที่ (รันซ้ำได้ผลเดิม) เพื่อไม่ต้องไล่เขียนคำตอบครบทั้งสี่สิบข้อ
 * ต่อคนทั้งที่ตารางแอดมินใช้จริงไม่กี่ข้อ
 */
const CANDIDATES = [
  {
    prefix: "นาย",
    first: "สมชาย",
    last: "ใจเพชร",
    nickname: "ชาย",
    phone: "0812345678",
    age: 38,
    birth: "1988-04-12",
    height: 172,
    weight: "70",
    homeAddress: "88/12 หมู่ 4 ต.ทับกวาง อ.แก่งคอย จ.สระบุรี 18260",
    currentAddress: "88/12 หมู่ 4 ต.ทับกวาง อ.แก่งคอย จ.สระบุรี 18260",
    emergencyName: "สมหญิง ใจเพชร",
    emergencyPhone: "0819876543",
    zone: "สระบุรี – แก่งคอย",
    startDate: "2026-10-01",
    shoeSize: "42",
    daysAgo: 1,
    status: "pending_contact",
    contactOwner: "",
    interview: { plan: "", date: "", time: "", result: "", note: "" },
    exitReason: "",
    picks: {
      คำนำหน้า: "นาย",
      ศาสนา: "พุทธ",
      สถานภาพ: "สมรส",
      การศึกษา: "ม.6",
      ความสัมพันธ์: "ภรรยา",
      ขับรถประเภทไหน: ["ขับรถ 10 ล้อ", "ขับรถโม่ปูน 10 ล้อ"],
      รุ่นอะไร: ["ฮีโน่ 500 (HINO 500)", "อีซูซุ (ISUZU)"],
      อุบัติเหตุ: "ไม่เคย",
      ประสบการณ์ขับรถบรรทุก: "5-10 ปี",
      โม่ปูน: "มีประสบการณ์โม่ปูนมากกว่า 3 ปี",
      ฝ่ายบุคคล: "ยังไม่มีใครติดต่อ",
      ทราบข่าว: "Facebook",
      ที่พัก: "ไม่ต้องการ รับค่าเช่าบ้าน",
      เสื้อฟอร์ม: "L",
    },
    interviewPlanned: null,
  },
  {
    prefix: "นาย",
    first: "ประเสริฐ",
    last: "แก้วมณี",
    nickname: "เสริฐ",
    phone: "0863457812",
    age: 44,
    birth: "1982-11-02",
    height: 168,
    weight: "75",
    homeAddress: "45 หมู่ 2 ต.บ้านฉาง อ.บ้านฉาง จ.ระยอง 21130",
    currentAddress: "112/5 ซ.สุขุมวิท 62 แขวงบางจาก เขตพระโขนง กรุงเทพฯ 10260",
    emergencyName: "วิภา แก้วมณี",
    emergencyPhone: "0865551234",
    zone: "กรุงเทพฯ – บางนา",
    startDate: "2026-09-25",
    shoeSize: "43",
    daysAgo: 4,
    status: "interview_scheduled",
    contactOwner: "กระแต",
    interview: {
      plan: "สัมภาษณ์ที่สำนักงานบางนา พบคุณกระแตกับหัวหน้าสายงาน เตรียมใบขับขี่ตัวจริงและใบรับรองแพทย์มาด้วย",
      date: "2026-09-18",
      time: "09:30",
      result: "",
      note: "",
    },
    exitReason: "",
    picks: {
      คำนำหน้า: "นาย",
      ศาสนา: "พุทธ",
      สถานภาพ: "สมรส",
      การศึกษา: "ม.3",
      ความสัมพันธ์: "ภรรยา",
      ขับรถประเภทไหน: ["ขับรถ 10 ล้อ", "ขับรถเทรลเลอร์", "ขับรถ 18 ล้อ (พ่วง)"],
      รุ่นอะไร: ["อีซูซุ (ISUZU)", "นิสสัน Nisson UD"],
      อุบัติเหตุ: "เคย แต่เสียหายเล็กน้อย",
      ประสบการณ์ขับรถบรรทุก: "มากกว่า 10 ปี",
      โม่ปูน: "เคยขับรถบรรทุกประเภทอื่น แต่ไม่ใช่รถโม่ปูน",
      ฝ่ายบุคคล: "กระแต",
      ทราบข่าว: "เพื่อนแนะนำมา",
      ที่พัก: "ต้องการห้องพัก",
      เสื้อฟอร์ม: "XL",
    },
  },
  {
    prefix: "นาย",
    first: "อนุชา",
    last: "พรมสาร",
    nickname: "ชา",
    phone: "0925648103",
    age: 31,
    birth: "1995-06-20",
    height: 175,
    weight: "68",
    homeAddress: "9/3 หมู่ 7 ต.หนองปลาไหล อ.บางละมุง จ.ชลบุรี 20150",
    currentAddress: "9/3 หมู่ 7 ต.หนองปลาไหล อ.บางละมุง จ.ชลบุรี 20150",
    emergencyName: "บุญมา พรมสาร",
    emergencyPhone: "0928887766",
    zone: "ชลบุรี – ศรีราชา",
    startDate: "2026-10-16",
    shoeSize: "41",
    daysAgo: 10,
    status: "interview_waiting",
    contactOwner: "โชค",
    interview: {
      plan: "สัมภาษณ์ที่ลานจอดศรีราชา ทดลองขับโม่ปูน 10 ล้อ กับหัวหน้าช่าง",
      date: "2026-09-12",
      time: "13:00",
      result: "waiting",
      note: "ขับทดสอบผ่าน รอหัวหน้าสายงานเคาะรอบสุดท้าย",
    },
    exitReason: "",
    picks: {
      คำนำหน้า: "นาย",
      ศาสนา: "พุทธ",
      สถานภาพ: "โสด",
      การศึกษา: "ม.6",
      ความสัมพันธ์: "บิดา",
      ขับรถประเภทไหน: ["ขับรถ 6 ล้อใหญ่", "ขับรถ 10 ล้อ", "ขับรถโม่ปูน 6 ล้อ"],
      รุ่นอะไร: ["ฮีโน่ 500 วิคเตอร์ (HINO 500 VICTOR)"],
      อุบัติเหตุ: "ไม่เคย",
      ประสบการณ์ขับรถบรรทุก: "2-5 ปี",
      โม่ปูน: "มีประสบการณ์ตรง 1–3 ปี เคยเกิดอุบัติเหตุ 1-2 ครั้ง",
      ฝ่ายบุคคล: "โชค",
      ทราบข่าว: "Tiktok",
      ที่พัก: "ต้องการห้องพัก",
      เสื้อฟอร์ม: "M",
    },
  },
  {
    prefix: "นาย",
    first: "วีระพงษ์",
    last: "ทองสุข",
    nickname: "โอ๋",
    phone: "0874412039",
    age: 41,
    birth: "1985-01-08",
    height: 170,
    weight: "80",
    homeAddress: "204 หมู่ 1 ต.บางเสาธง อ.บางเสาธง จ.สมุทรปราการ 10570",
    currentAddress: "204 หมู่ 1 ต.บางเสาธง อ.บางเสาธง จ.สมุทรปราการ 10570",
    emergencyName: "จันทร์เพ็ญ ทองสุข",
    emergencyPhone: "0876543210",
    zone: "สมุทรปราการ – บางเสาธง",
    startDate: "2026-09-22",
    shoeSize: "44",
    daysAgo: 18,
    status: "interview_passed",
    contactOwner: "เจมส์",
    interview: {
      plan: "สัมภาษณ์ที่สำนักงานใหญ่สระบุรี รอบเช้า พบคุณเจมส์และผู้จัดการฝ่ายเดินรถ",
      date: "2026-09-03",
      time: "10:00",
      result: "passed",
      note: "ประสบการณ์โม่ปูนตรงสาย ขับมือนิ่ง ผ่านทั้งสัมภาษณ์และทดสอบขับ นัดเริ่มฝึกงาน 22 ก.ย.",
    },
    exitReason: "",
    picks: {
      คำนำหน้า: "นาย",
      ศาสนา: "พุทธ",
      สถานภาพ: "สมรส",
      การศึกษา: "ม.6",
      ความสัมพันธ์: "ภรรยา",
      ขับรถประเภทไหน: ["ขับรถ 10 ล้อ", "ขับรถโม่ปูน 10 ล้อ", "ขับรถ 12 ล้อ"],
      รุ่นอะไร: ["ฮีโน่ 500 (HINO 500)", "รถจีน FAW Sany Foton"],
      อุบัติเหตุ: "ไม่เคย",
      ประสบการณ์ขับรถบรรทุก: "มากกว่า 10 ปี",
      โม่ปูน: "มีประสบการณ์โม่ปูนมากกว่า 3 ปี",
      ฝ่ายบุคคล: "เจมส์",
      ทราบข่าว: "เป็นพนักงานเก่าของมีนา",
      ที่พัก: "ไม่ต้องการ รับค่าเช่าบ้าน",
      เสื้อฟอร์ม: "XL",
    },
  },
  {
    prefix: "นาย",
    first: "ธนากร",
    last: "ศรีสมบัติ",
    nickname: "กร",
    phone: "0983320145",
    age: 27,
    birth: "1999-09-30",
    height: 178,
    weight: "72",
    homeAddress: "63 หมู่ 11 ต.หนองบัว อ.เมือง จ.อุดรธานี 41000",
    currentAddress: "77/9 ซ.อ่อนนุช 17 แขวงสวนหลวง เขตสวนหลวง กรุงเทพฯ 10250",
    emergencyName: "สมพร ศรีสมบัติ",
    emergencyPhone: "0987771122",
    zone: "กรุงเทพฯ – พระราม 2",
    startDate: "2026-11-01",
    shoeSize: "43",
    daysAgo: 26,
    status: "cancelled",
    contactOwner: "แป้ง",
    interview: {
      plan: "นัดสัมภาษณ์รอบบ่ายที่ออฟฟิศพระรามหก",
      date: "2026-09-04",
      time: "14:00",
      result: "failed",
      note: "ไม่มาตามนัด โทรตามอีก 3 ครั้งใน 5 วัน ไม่รับสายทุกครั้ง",
    },
    exitReason: "unreachable",
    picks: {
      คำนำหน้า: "นาย",
      ศาสนา: "พุทธ",
      สถานภาพ: "โสด",
      การศึกษา: "ม.3",
      ความสัมพันธ์: "มารดา",
      ขับรถประเภทไหน: ["ขับรถ 6 ล้อเล็ก", "ขับรถ 6 ล้อใหญ่"],
      รุ่นอะไร: ["อีซูซุ (ISUZU)"],
      อุบัติเหตุ: "เคย แต่เสียหายเล็กน้อย",
      ประสบการณ์ขับรถบรรทุก: "1–2 ปี",
      โม่ปูน: "ไม่มีประสบการณ์ขับรถบรรทุกมาก่อน แต่มีใบขับขี่ถูกต้อง",
      ฝ่ายบุคคล: "แป้ง",
      ทราบข่าว: "Line",
      ที่พัก: "ต้องการห้องพัก",
      เสื้อฟอร์ม: "L",
    },
  },
  {
    prefix: "นาย",
    first: "สมพงษ์",
    last: "รักไทย",
    nickname: "พงษ์",
    phone: "0891234567",
    age: 35,
    birth: "1991-02-14",
    height: 171,
    weight: "69",
    homeAddress: "12 หมู่ 3 ต.หนองแก อ.หัวหิน จ.ประจวบคีรีขันธ์ 77110",
    currentAddress: "12 หมู่ 3 ต.หนองแก อ.หัวหิน จ.ประจวบคีรีขันธ์ 77110",
    emergencyName: "สมศรี รักไทย",
    emergencyPhone: "0895554321",
    zone: "ประจวบคีรีขันธ์ – หัวหิน",
    startDate: "2026-10-20",
    shoeSize: "42",
    daysAgo: 2,
    status: "pending_contact",
    contactOwner: "",
    interview: { plan: "", date: "", time: "", result: "", note: "" },
    exitReason: "",
    picks: {
      คำนำหน้า: "นาย",
      ศาสนา: "พุทธ",
      สถานภาพ: "โสด",
      การศึกษา: "ม.6",
      ความสัมพันธ์: "มารดา",
      ขับรถประเภทไหน: ["ขับรถ 6 ล้อใหญ่", "ขับรถ 10 ล้อ"],
      รุ่นอะไร: ["อีซูซุ (ISUZU)"],
      อุบัติเหตุ: "ไม่เคย",
      ประสบการณ์ขับรถบรรทุก: "2-5 ปี",
      โม่ปูน: "เคยขับรถบรรทุกประเภทอื่น แต่ไม่ใช่รถโม่ปูน",
      ฝ่ายบุคคล: "ยังไม่มีใครติดต่อ",
      ทราบข่าว: "Facebook",
      ที่พัก: "ต้องการห้องพัก",
      เสื้อฟอร์ม: "L",
    },
  },
  {
    prefix: "นาย",
    first: "กิตติ",
    last: "บุญมาก",
    nickname: "ติ๊ก",
    phone: "0812223344",
    age: 29,
    birth: "1997-07-19",
    height: 165,
    weight: "60",
    homeAddress: "5/1 หมู่ 6 ต.ท่าตูม อ.ศรีมหาโพธิ จ.ปราจีนบุรี 25140",
    currentAddress: "5/1 หมู่ 6 ต.ท่าตูม อ.ศรีมหาโพธิ จ.ปราจีนบุรี 25140",
    emergencyName: "สมหมาย บุญมาก",
    emergencyPhone: "0813334455",
    zone: "ปราจีนบุรี – ศรีมหาโพธิ",
    startDate: "2026-11-05",
    shoeSize: "40",
    daysAgo: 3,
    status: "pending_contact",
    contactOwner: "",
    interview: { plan: "", date: "", time: "", result: "", note: "" },
    exitReason: "",
    picks: {
      คำนำหน้า: "นาย",
      ศาสนา: "พุทธ",
      สถานภาพ: "โสด",
      การศึกษา: "ม.3",
      ความสัมพันธ์: "บิดา",
      ขับรถประเภทไหน: ["ขับรถ 6 ล้อเล็ก"],
      รุ่นอะไร: ["อีซูซุ (ISUZU)"],
      อุบัติเหตุ: "ไม่เคย",
      ประสบการณ์ขับรถบรรทุก: "1–2 ปี",
      โม่ปูน: "ไม่มีประสบการณ์ขับรถบรรทุกมาก่อน แต่มีใบขับขี่ถูกต้อง",
      ฝ่ายบุคคล: "ยังไม่มีใครติดต่อ",
      ทราบข่าว: "Line",
      ที่พัก: "ต้องการห้องพัก",
      เสื้อฟอร์ม: "M",
    },
  },
  {
    prefix: "นาย",
    first: "ไพโรจน์",
    last: "สายทอง",
    nickname: "โรจน์",
    phone: "0898765432",
    age: 39,
    birth: "1987-03-05",
    height: 174,
    weight: "78",
    homeAddress: "22 หมู่ 5 ต.เขาไม้แก้ว อ.บางละมุง จ.ชลบุรี 20150",
    currentAddress: "22 หมู่ 5 ต.เขาไม้แก้ว อ.บางละมุง จ.ชลบุรี 20150",
    emergencyName: "มาลี สายทอง",
    emergencyPhone: "0899988776",
    zone: "ชลบุรี – บางละมุง",
    startDate: "2026-10-10",
    shoeSize: "43",
    daysAgo: 5,
    status: "interview_scheduled",
    contactOwner: "โชค",
    interview: {
      plan: "สัมภาษณ์ที่ลานจอดศรีราชา รอบบ่าย เตรียมใบขับขี่และประวัติการทำงานย้อนหลัง",
      date: "2026-09-20",
      time: "14:00",
      result: "",
      note: "",
    },
    exitReason: "",
    picks: {
      คำนำหน้า: "นาย",
      ศาสนา: "พุทธ",
      สถานภาพ: "สมรส",
      การศึกษา: "ม.6",
      ความสัมพันธ์: "ภรรยา",
      ขับรถประเภทไหน: ["ขับรถ 10 ล้อ", "ขับรถโม่ปูน 10 ล้อ"],
      รุ่นอะไร: ["ฮีโน่ 500 (HINO 500)"],
      อุบัติเหตุ: "ไม่เคย",
      ประสบการณ์ขับรถบรรทุก: "5-10 ปี",
      โม่ปูน: "มีประสบการณ์โม่ปูนมากกว่า 3 ปี",
      ฝ่ายบุคคล: "โชค",
      ทราบข่าว: "Tiktok",
      ที่พัก: "ไม่ต้องการ รับค่าเช่าบ้าน",
      เสื้อฟอร์ม: "XL",
    },
  },
  {
    prefix: "นาย",
    first: "วัชระ",
    last: "ศิริวัฒน์",
    nickname: "วัช",
    phone: "0865512378",
    age: 33,
    birth: "1993-12-01",
    height: 169,
    weight: "65",
    homeAddress: "9 หมู่ 2 ต.ท่าช้าง อ.เฉลิมพระเกียรติ จ.นครราชสีมา 30000",
    currentAddress: "9 หมู่ 2 ต.ท่าช้าง อ.เฉลิมพระเกียรติ จ.นครราชสีมา 30000",
    emergencyName: "อรุณี ศิริวัฒน์",
    emergencyPhone: "0866623489",
    zone: "นครราชสีมา – เมือง",
    startDate: "2026-10-25",
    shoeSize: "41",
    daysAgo: 9,
    status: "interview_waiting",
    contactOwner: "เจมส์",
    interview: {
      plan: "สัมภาษณ์และทดลองขับที่ลานจอดโคราช พบหัวหน้าช่างประจำสาย",
      date: "2026-09-13",
      time: "10:30",
      result: "waiting",
      note: "ขับทดสอบเรียบร้อย รอผลจากหัวหน้าสายงาน",
    },
    exitReason: "",
    picks: {
      คำนำหน้า: "นาย",
      ศาสนา: "พุทธ",
      สถานภาพ: "สมรส",
      การศึกษา: "ม.6",
      ความสัมพันธ์: "ภรรยา",
      ขับรถประเภทไหน: ["ขับรถ 10 ล้อ", "ขับรถ 12 ล้อ"],
      รุ่นอะไร: ["นิสสัน Nisson UD"],
      อุบัติเหตุ: "เคย แต่เสียหายเล็กน้อย",
      ประสบการณ์ขับรถบรรทุก: "5-10 ปี",
      โม่ปูน: "เคยขับรถบรรทุกประเภทอื่น แต่ไม่ใช่รถโม่ปูน",
      ฝ่ายบุคคล: "เจมส์",
      ทราบข่าว: "เพื่อนแนะนำมา",
      ที่พัก: "ต้องการห้องพัก",
      เสื้อฟอร์ม: "L",
    },
  },
  {
    prefix: "นาย",
    first: "สุรชัย",
    last: "เพชรดี",
    nickname: "ชัย",
    phone: "0900011223",
    age: 42,
    birth: "1984-05-17",
    height: 173,
    weight: "77",
    homeAddress: "31 หมู่ 8 ต.บางปะกง อ.บางปะกง จ.ฉะเชิงเทรา 24130",
    currentAddress: "31 หมู่ 8 ต.บางปะกง อ.บางปะกง จ.ฉะเชิงเทรา 24130",
    emergencyName: "นงลักษณ์ เพชรดี",
    emergencyPhone: "0901122334",
    zone: "ฉะเชิงเทรา – บางปะกง",
    startDate: "2026-09-29",
    shoeSize: "44",
    daysAgo: 14,
    status: "interview_passed",
    contactOwner: "แป้ง",
    interview: {
      plan: "สัมภาษณ์ที่สำนักงานฉะเชิงเทรา พบคุณแป้งและผู้จัดการฝ่ายเดินรถ",
      date: "2026-09-08",
      time: "09:00",
      result: "passed",
      note: "ประสบการณ์ตรงสาย ขับมือนิ่ง ผ่านทั้งสัมภาษณ์และทดสอบขับ นัดเริ่มฝึกงาน 29 ก.ย.",
    },
    exitReason: "",
    picks: {
      คำนำหน้า: "นาย",
      ศาสนา: "พุทธ",
      สถานภาพ: "สมรส",
      การศึกษา: "ม.6",
      ความสัมพันธ์: "ภรรยา",
      ขับรถประเภทไหน: ["ขับรถ 10 ล้อ", "ขับรถเทรลเลอร์"],
      รุ่นอะไร: ["ฮีโน่ 500 วิคเตอร์ (HINO 500 VICTOR)"],
      อุบัติเหตุ: "ไม่เคย",
      ประสบการณ์ขับรถบรรทุก: "มากกว่า 10 ปี",
      โม่ปูน: "มีประสบการณ์โม่ปูนมากกว่า 3 ปี",
      ฝ่ายบุคคล: "แป้ง",
      ทราบข่าว: "เป็นพนักงานเก่าของมีนา",
      ที่พัก: "ไม่ต้องการ รับค่าเช่าบ้าน",
      เสื้อฟอร์ม: "XL",
    },
  },
  {
    prefix: "นาย",
    first: "อำนาจ",
    last: "คงเจริญ",
    nickname: "นาจ",
    phone: "0811119988",
    age: 37,
    birth: "1989-08-08",
    height: 170,
    weight: "71",
    homeAddress: "14 หมู่ 9 ต.หนองปรือ อ.บางละมุง จ.ชลบุรี 20150",
    currentAddress: "88 ซ.สุขาภิบาล 3 แขวงหนองบอน เขตประเวศ กรุงเทพฯ 10250",
    emergencyName: "สายทิพย์ คงเจริญ",
    emergencyPhone: "0812229988",
    zone: "ชลบุรี – ศรีราชา",
    startDate: "2026-08-20",
    shoeSize: "42",
    daysAgo: 33,
    status: "training",
    contactOwner: "กระแต",
    interview: {
      plan: "สัมภาษณ์ที่สำนักงานศรีราชา รอบเช้า",
      date: "2026-08-15",
      time: "09:00",
      result: "passed",
      note: "ผ่านสัมภาษณ์และทดสอบขับ เริ่มฝึกงานกับพี่เลี้ยงสายศรีราชาแล้ว",
    },
    exitReason: "",
    picks: {
      คำนำหน้า: "นาย",
      ศาสนา: "พุทธ",
      สถานภาพ: "สมรส",
      การศึกษา: "ม.6",
      ความสัมพันธ์: "ภรรยา",
      ขับรถประเภทไหน: ["ขับรถ 10 ล้อ", "ขับรถโม่ปูน 10 ล้อ"],
      รุ่นอะไร: ["ฮีโน่ 500 (HINO 500)", "อีซูซุ (ISUZU)"],
      อุบัติเหตุ: "ไม่เคย",
      ประสบการณ์ขับรถบรรทุก: "มากกว่า 10 ปี",
      โม่ปูน: "มีประสบการณ์โม่ปูนมากกว่า 3 ปี",
      ฝ่ายบุคคล: "กระแต",
      ทราบข่าว: "Facebook",
      ที่พัก: "ไม่ต้องการ รับค่าเช่าบ้าน",
      เสื้อฟอร์ม: "L",
    },
  },
  {
    prefix: "นาย",
    first: "บุญเลิศ",
    last: "แสงทอง",
    nickname: "เลิศ",
    phone: "0822223311",
    age: 45,
    birth: "1981-01-25",
    height: 167,
    weight: "74",
    homeAddress: "3 หมู่ 1 ต.ท่าตูม อ.ศรีมหาโพธิ จ.ปราจีนบุรี 25140",
    currentAddress: "3 หมู่ 1 ต.ท่าตูม อ.ศรีมหาโพธิ จ.ปราจีนบุรี 25140",
    emergencyName: "สมใจ แสงทอง",
    emergencyPhone: "0823334422",
    zone: "ปราจีนบุรี – ศรีมหาโพธิ",
    startDate: "2026-08-15",
    shoeSize: "43",
    daysAgo: 40,
    status: "training",
    contactOwner: "เจมส์",
    interview: {
      plan: "สัมภาษณ์ที่สำนักงานใหญ่สระบุรี รอบบ่าย",
      date: "2026-08-05",
      time: "13:30",
      result: "passed",
      note: "ประสบการณ์โม่ปูนตรงสาย เริ่มฝึกงานกับหัวหน้าสายปราจีนบุรีแล้ว",
    },
    exitReason: "",
    picks: {
      คำนำหน้า: "นาย",
      ศาสนา: "พุทธ",
      สถานภาพ: "สมรส",
      การศึกษา: "ม.3",
      ความสัมพันธ์: "ภรรยา",
      ขับรถประเภทไหน: ["ขับรถโม่ปูน 6 ล้อ", "ขับรถ 6 ล้อใหญ่"],
      รุ่นอะไร: ["รถจีน FAW Sany Foton"],
      อุบัติเหตุ: "เคย แต่เสียหายเล็กน้อย",
      ประสบการณ์ขับรถบรรทุก: "มากกว่า 10 ปี",
      โม่ปูน: "มีประสบการณ์ตรง 1–3 ปี เคยเกิดอุบัติเหตุ 1-2 ครั้ง",
      ฝ่ายบุคคล: "เจมส์",
      ทราบข่าว: "เพื่อนแนะนำมา",
      ที่พัก: "ต้องการห้องพัก",
      เสื้อฟอร์ม: "XL",
    },
  },
  {
    prefix: "นาย",
    first: "ประยุทธ",
    last: "มั่นคง",
    nickname: "ยุทธ",
    phone: "0833332211",
    age: 30,
    birth: "1996-10-10",
    height: 176,
    weight: "70",
    homeAddress: "77 หมู่ 4 ต.มาบตาพุด อ.เมือง จ.ระยอง 21150",
    currentAddress: "77 หมู่ 4 ต.มาบตาพุด อ.เมือง จ.ระยอง 21150",
    emergencyName: "ละออง มั่นคง",
    emergencyPhone: "0834441122",
    zone: "ระยอง – มาบตาพุด",
    startDate: "2026-08-25",
    shoeSize: "42",
    daysAgo: 28,
    status: "training",
    contactOwner: "โชค",
    interview: {
      plan: "สัมภาษณ์และทดลองขับที่ลานจอดระยอง",
      date: "2026-08-18",
      time: "10:00",
      result: "passed",
      note: "ผ่านทั้งสัมภาษณ์และทดสอบขับ เริ่มฝึกงานกับพี่เลี้ยงสายระยองแล้ว",
    },
    exitReason: "",
    picks: {
      คำนำหน้า: "นาย",
      ศาสนา: "พุทธ",
      สถานภาพ: "โสด",
      การศึกษา: "ม.6",
      ความสัมพันธ์: "มารดา",
      ขับรถประเภทไหน: ["ขับรถ 10 ล้อ", "ขับรถ 18 ล้อ (พ่วง)"],
      รุ่นอะไร: ["อีซูซุ (ISUZU)", "นิสสัน Nisson UD"],
      อุบัติเหตุ: "ไม่เคย",
      ประสบการณ์ขับรถบรรทุก: "2-5 ปี",
      โม่ปูน: "เคยขับรถบรรทุกประเภทอื่น แต่ไม่ใช่รถโม่ปูน",
      ฝ่ายบุคคล: "โชค",
      ทราบข่าว: "Tiktok",
      ที่พัก: "ต้องการห้องพัก",
      เสื้อฟอร์ม: "M",
    },
  },
  {
    prefix: "นาย",
    first: "ทวี",
    last: "ทองอยู่",
    nickname: "ทวี",
    phone: "0844445566",
    age: 52,
    birth: "1974-06-30",
    height: 160,
    weight: "82",
    homeAddress: "8 หมู่ 7 ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000",
    currentAddress: "8 หมู่ 7 ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000",
    emergencyName: "สมร ทองอยู่",
    emergencyPhone: "0845556677",
    zone: "ขอนแก่น – เมือง",
    startDate: "2026-11-15",
    shoeSize: "41",
    daysAgo: 20,
    status: "cancelled",
    contactOwner: "แป้ง",
    interview: {
      plan: "นัดสัมภาษณ์รอบเช้าที่ตัวแทนขอนแก่น",
      date: "2026-09-06",
      time: "09:00",
      result: "failed",
      note: "อายุและประสบการณ์ไม่ตรงตามเกณฑ์ที่สายงานต้องการ",
    },
    exitReason: "unqualified",
    picks: {
      คำนำหน้า: "นาย",
      ศาสนา: "พุทธ",
      สถานภาพ: "สมรส",
      การศึกษา: "ม.3",
      ความสัมพันธ์: "บิดา",
      ขับรถประเภทไหน: ["ขับรถ 6 ล้อเล็ก"],
      รุ่นอะไร: ["อีซูซุ (ISUZU)"],
      อุบัติเหตุ: "เคย แต่เสียหายเล็กน้อย",
      ประสบการณ์ขับรถบรรทุก: "1–2 ปี",
      โม่ปูน: "ไม่มีประสบการณ์ขับรถบรรทุกมาก่อน แต่มีใบขับขี่ถูกต้อง",
      ฝ่ายบุคคล: "แป้ง",
      ทราบข่าว: "Line",
      ที่พัก: "ต้องการห้องพัก",
      เสื้อฟอร์ม: "L",
    },
  },
  {
    prefix: "นาย",
    first: "เอกชัย",
    last: "พูลสวัสดิ์",
    nickname: "เอก",
    phone: "0855556677",
    age: 34,
    birth: "1992-02-02",
    height: 172,
    weight: "66",
    homeAddress: "19 หมู่ 3 ต.บ้านสวน อ.เมือง จ.ชลบุรี 20000",
    currentAddress: "19 หมู่ 3 ต.บ้านสวน อ.เมือง จ.ชลบุรี 20000",
    emergencyName: "วิไล พูลสวัสดิ์",
    emergencyPhone: "0856667788",
    zone: "ชลบุรี – เมือง",
    startDate: "2026-10-05",
    shoeSize: "42",
    daysAgo: 8,
    status: "cancelled",
    /* ผู้สมัครกดยกเลิกเองบนหน้าติดตาม แล้วข้อมูลถูกลบตามคำขอ — ไม่ใช่ฝ่ายบุคคล
       เป็นคนยกเลิกให้ (ดู `cancelApplication()`) */
    selfCancelled: true,
    contactOwner: "กระแต",
    interview: {
      plan: "นัดสัมภาษณ์รอบบ่ายที่สำนักงานชลบุรี",
      date: "2026-09-15",
      time: "14:00",
      result: "",
      note: "",
    },
    exitReason: "",
    picks: {
      คำนำหน้า: "นาย",
      ศาสนา: "พุทธ",
      สถานภาพ: "โสด",
      การศึกษา: "ม.6",
      ความสัมพันธ์: "มารดา",
      ขับรถประเภทไหน: ["ขับรถ 10 ล้อ"],
      รุ่นอะไร: ["ฮีโน่ 500 (HINO 500)"],
      อุบัติเหตุ: "ไม่เคย",
      ประสบการณ์ขับรถบรรทุก: "2-5 ปี",
      โม่ปูน: "เคยขับรถบรรทุกประเภทอื่น แต่ไม่ใช่รถโม่ปูน",
      ฝ่ายบุคคล: "กระแต",
      ทราบข่าว: "Facebook",
      ที่พัก: "ไม่ต้องการ รับค่าเช่าบ้าน",
      เสื้อฟอร์ม: "M",
    },
  },
];

/* -------------------------------------------------------- สุ่มแบบ seed คงที่ */

function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/* ------------------------------------------------- ประกอบคำตอบจากคลังคำถาม */

/** ข้อความคำถามมีคำนี้ไหม — ตัวเทียบเดียวที่ใช้ทั้งไฟล์ */
const has = (label, ...words) => words.some((w) => label.includes(w));

/** หาตัวเลือกจากข้อความ — ระบุมาไม่ตรงข้อไหนเลยให้เป็น `null` ไปสุ่มแทน */
function optionByLabel(options, text) {
  return options.find((o) => o.label.includes(text) || text.includes(o.label)) ?? null;
}

/** ค่าที่ระบุไว้ใน `picks` ของคนนี้สำหรับคำถามข้อนี้ */
function pickedFor(question, picks) {
  for (const [needle, value] of Object.entries(picks)) {
    if (question.label.includes(needle)) return value;
  }
  return null;
}

function answerFor(question, person, rng) {
  const { label, kind, options } = question;

  /* ── ข้อที่ตารางแอดมินและใบสัมภาษณ์ใช้จริง — ตอบตรง ๆ ทุกข้อ ── */
  if (has(label, "นามสกุล") && !has(label, "ฉุกเฉิน")) return person.last;
  if (has(label, "ฉุกเฉิน")) {
    if (kind === "tel" || has(label, "เบอร์")) return person.emergencyPhone;
    if (has(label, "ชื่อ")) return person.emergencyName;
  }
  if (has(label, "ชื่อเล่น")) return person.nickname;
  if (has(label, "เขต")) return person.zone;
  if (has(label, "เริ่มงาน")) return person.startDate;
  if (has(label, "ทะเบียนบ้าน")) return person.homeAddress;
  if (has(label, "ที่อยู่ปัจจุบัน")) return person.currentAddress;
  if (has(label, "อายุ")) return String(person.age);
  if (has(label, "เกิดวันที่")) return person.birth;
  if (has(label, "ส่วนสูง")) return String(person.height);
  if (has(label, "น้ำหนัก")) return person.weight;
  if (has(label, "รองเท้า")) return person.shoeSize;
  if (has(label, "เพื่อน") && kind === "text") {
    return person.picks["ทราบข่าว"] === "เพื่อนแนะนำมา" ? "อภิชาติ สุขสวัสดิ์" : "";
  }
  if (has(label, "ประสบการณ์ขับรถมาจากบริษัท")) {
    return `ขับให้บริษัทขนส่งในพื้นที่${person.zone.split(" – ")[0]} ล่าสุดวิ่งงานปูนและวัสดุก่อสร้างเป็นหลัก`;
  }

  /* ── ข้อที่เหลือ: ใช้ค่าที่ระบุใน `picks` ก่อน ไม่มีค่อยสุ่ม ── */
  const picked = pickedFor(question, person.picks);

  if (kind === "multi") {
    const wanted = Array.isArray(picked) ? picked : [];
    const values = wanted
      .map((text) => optionByLabel(options, text)?.value)
      .filter(Boolean);
    if (values.length) return values;
    return options.length ? [options[Math.floor(rng() * options.length)].value] : [];
  }

  if (kind === "single") {
    if (typeof picked === "string") {
      const option = optionByLabel(options, picked);
      if (option) return option.value;
    }
    return options.length ? options[Math.floor(rng() * options.length)].value : "";
  }

  if (kind === "tel") return person.phone;
  if (kind === "number") return String(20 + Math.floor(rng() * 30));
  if (kind === "date") return person.startDate;
  if (kind === "nid") return "";
  if (kind === "textarea") return "—";
  return person.first;
}

/* ------------------------------------------------------------------ main */

const clean = process.argv.includes("--clean");
const dbName = seedTargetDb(env);
const client = new MongoClient(env.MONGO_URI, { serverSelectionTimeoutMS: 15_000 });
await client.connect();
const db = client.db(dbName);
const answers = db.collection(ANSWERS);

const removed = await answers.deleteMany({ sample: true });
console.log(`ลบใบตัวอย่างเดิม ${removed.deletedCount} ใบ`);

if (clean) {
  await client.close();
  console.log("เสร็จ — ลบอย่างเดียว ไม่ได้ใส่ใหม่");
  process.exit(0);
}

const questions = await db
  .collection(QUESTIONS)
  .find({ active: true })
  .sort({ section: 1, order: 1 })
  .toArray();

if (!questions.length) {
  await client.close();
  throw new Error(
    `คลังคำถาม ${QUESTIONS} ยังว่าง — เปิดหน้า /recruitment/admin/questions ให้ระบบลงชุดตั้งต้นก่อน`,
  );
}

const snapshot = questions.map((q) => ({
  key: q.key,
  section: q.section,
  label: q.label,
  kind: q.kind,
  options: q.options ?? [],
  sensitive: Boolean(q.sensitive),
}));

/* หาคีย์ของสองข้อที่ใบสมัครถอดออกมาเก็บเป็นฟิลด์ระดับบนสุด */
const nameKey =
  questions.find((q) => q.key === "full_name")?.key ??
  questions.find((q) => q.label.includes("ชื่อ") && !q.label.includes("นามสกุล"))?.key;
const phoneKey =
  questions.find((q) => q.key === "phone")?.key ??
  questions.find((q) => q.kind === "tel")?.key;

const yy = String((new Date().getFullYear() + 543) % 100).padStart(2, "0");
const docs = [];

for (const [index, person] of CANDIDATES.entries()) {
  const rng = makeRng(1000 + index * 97);

  const answerMap = {};
  for (const question of questions) {
    answerMap[question.key] = answerFor(question, person, rng);
  }
  answerMap[nameKey] = person.first;
  answerMap[phoneKey] = person.phone;

  const createdAt = new Date(
    Date.now() - person.daysAgo * 24 * 60 * 60 * 1000,
  ).toISOString();

  /* ไทม์ไลน์เดินตามสถานะจริงของใบ ไม่ใช่แถวเดียวโดด ๆ — หน้ารายละเอียดจะได้มี
     ประวัติให้อ่านเหมือนใบที่ผ่านมือคนจริง */
  const timeline = [
    { at: createdAt, from: null, to: "pending_contact", by: "ผู้สมัคร", note: "ส่งใบสมัคร" },
  ];
  const step = (to, offsetDays, note, by) => {
    const at = new Date(
      Date.parse(createdAt) + offsetDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    timeline.push({
      at,
      from: timeline[timeline.length - 1].to,
      to,
      by: by || person.contactOwner || "ฝ่ายบุคคล",
      note,
    });
  };

  if (person.status === "interview_scheduled") {
    step("interview_scheduled", 1, "โทรกลับแล้ว ผู้สมัครสะดวกมาสัมภาษณ์วันที่นัดไว้");
  }
  if (person.status === "interview_waiting") {
    step("interview_scheduled", 1, "โทรกลับแล้ว นัดสัมภาษณ์พร้อมทดลองขับ");
    step("interview_waiting", 7, "สัมภาษณ์และทดลองขับเรียบร้อย รอสรุปผล");
  }
  if (person.status === "interview_passed" || person.status === "training") {
    step("interview_scheduled", 2, "โทรกลับแล้ว นัดสัมภาษณ์รอบเช้า");
    step("interview_waiting", 6, "สัมภาษณ์เรียบร้อย รอผลจากผู้จัดการฝ่ายเดินรถ");
    step("interview_passed", 9, "ผ่านการสัมภาษณ์ นัดวันเริ่มฝึกงาน");
  }
  if (person.status === "training") {
    step("training", 14, "เริ่มฝึกงานกับพี่เลี้ยงประจำสายแล้ว");
  }
  if (person.status === "cancelled" && !person.selfCancelled) {
    step("interview_scheduled", 2, "นัดสัมภาษณ์รอบบ่าย");
    step("cancelled", 12, "ไม่มาตามนัดและติดต่อกลับไม่ได้ ยกเลิกใบสมัคร");
  }
  if (person.selfCancelled) {
    step("interview_scheduled", 2, "โทรกลับแล้ว นัดสัมภาษณ์รอบบ่าย");
    step("cancelled", 5, "ผู้สมัครยกเลิกใบสมัครเองและขอให้ลบข้อมูล", "ผู้สมัคร");
  }

  const last = timeline[timeline.length - 1];

  docs.push({
    ref: `DRV-${yy}-${String(9000 + index + 1)}`,
    status: person.status,
    fullName: person.selfCancelled ? "— ลบตามคำขอของเจ้าของข้อมูล —" : person.first,
    phone: person.phone,
    contactOwner: person.contactOwner,
    interview: person.interview,
    exitReason: person.selfCancelled ? "self_cancelled" : person.exitReason,
    /* ใบที่ยกเลิกเองถูกล้างเนื้อหาทิ้งจริงเหมือนของจริง — เหลือแต่เลขอ้างอิง เบอร์
       และร่องรอยว่าลบเมื่อไหร่ */
    answers: person.selfCancelled ? {} : answerMap,
    questionSnapshot: person.selfCancelled ? [] : snapshot,
    files: [],
    consent: {
      version: "2569-09-v2",
      acceptedAt: createdAt,
      ip: "203.0.113.24",
      userAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128 Mobile",
      items: [
        { id: "core", granted: true },
        { id: "sensitive", granted: true },
        { id: "talent_pool", granted: index % 2 === 0 },
      ],
    },
    timeline,
    ...(person.selfCancelled ? { erasedAt: last.at } : {}),
    createdAt,
    updatedAt: last.at,
    /** ตราประทับของข้อมูลตัวอย่าง — ใช้ลบทีหลังโดยไม่แตะใบจริง */
    sample: true,
  });
}

await answers.insertMany(docs);

console.log(`ใส่ใบสมัครตัวอย่าง ${docs.length} ใบเรียบร้อย`);
for (const d of docs) {
  console.log(`  ${d.ref}  ${d.fullName}  ${d.status}`);
}

await client.close();
