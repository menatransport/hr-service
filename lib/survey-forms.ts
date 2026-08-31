/**
 * ทะเบียนแบบสอบถาม + ชุดคำถาม — **ใช้ได้ทั้งฝั่งเซิร์ฟเวอร์และ client**
 *
 * แยกจาก `lib/newyear-survey.ts` เพราะไฟล์นั้น import `lib/mongo.ts` ซึ่งเป็น
 * ของฝั่งเซิร์ฟเวอร์ล้วน — client component ที่แตะไฟล์นั้นจะลาก driver ของ
 * MongoDB เข้า bundle แล้ว build พังตั้งแต่ `child_process`
 * (ท่าเดียวกับ `record-case-flow.ts` ↔ `record-cases.ts`)
 */

export interface SurveyForm {
  id: string;
  title: string;
  subtitle: string;
  period: string;
}

/**
 * รายการแบบฟอร์มที่หน้า `/desk/survey` เปิดดูได้ — ตอนนี้มีชุดเดียว
 * เพิ่มชุดใหม่: ใส่ที่นี่ + เพิ่มชุดคำถามใน `SURVEY_QUESTIONS`
 */
export const SURVEY_FORMS: SurveyForm[] = [
  {
    id: "newyear-2570-mixer",
    title: "แบบสำรวจเสียงพจส. รถมิกเซอร์ งานปีใหม่ 2570",
    subtitle: "ความเห็นเรื่องวัน สถานที่ อาหาร กิจกรรม และของรางวัลของงานเลี้ยงปีใหม่",
    period: "เก็บข้อมูลปี 2569–2570",
  },
];

export const DEFAULT_SURVEY_ID = SURVEY_FORMS[0].id;

export type QuestionKind = "single" | "multi" | "rank" | "text";

export interface SurveyQuestion {
  id: string;
  no: number;
  /** หัวคอลัมน์/หัวการ์ด — สั้นพอให้ตารางอ่านได้ ไม่ใช่ประโยคเต็ม */
  short: string;
  question: string;
  kind: QuestionKind;
}

export const SURVEY_QUESTIONS: SurveyQuestion[] = [
  { id: "q1", no: 1, short: "อายุงาน", question: "ท่านทำงานกับบริษัทมานานเท่าไหร่แล้ว", kind: "single" },
  { id: "q2", no: 2, short: "ภูมิลำเนา", question: "ช่วงปีใหม่ ท่านกลับภูมิลำเนาที่จังหวัดใด", kind: "single" },
  { id: "q3", no: 3, short: "วันที่สะดวก", question: "งานปีใหม่จะจัดหลังหยุดยาว ท่านสะดวกวันไหนมากกว่ากัน", kind: "single" },
  { id: "q4", no: 4, short: "มากับใคร", question: "ท่านตั้งใจจะมาร่วมงานกับใคร", kind: "single" },
  { id: "q5", no: 5, short: "ถ้ามีรถรับส่ง", question: "ถ้าบริษัทจัดรถรับ-ส่งให้ โอกาสที่จะมาร่วมงานเพิ่มขึ้นแค่ไหน", kind: "single" },
  { id: "q6", no: 6, short: "เหตุผลที่ไม่มา", question: "เหตุผลหลักที่ทำให้ไม่สะดวกมาร่วมงาน", kind: "multi" },
  { id: "q7", no: 7, short: "ลำดับความสำคัญ", question: "จัดอันดับความสำคัญของสิ่งที่อยากได้ในงาน", kind: "rank" },
  { id: "q8", no: 8, short: "จัดงาน vs เงินพิเศษ", question: "ถ้าเลือกได้อย่างเดียว ท่านเลือกแบบไหน", kind: "single" },
  { id: "q9", no: 9, short: "รางวัลใหญ่ vs ทั่วถึง", question: "เรื่องของรางวัล ท่านชอบแบบไหนมากกว่า", kind: "single" },
  { id: "q10", no: 10, short: "รูปแบบงาน", question: "รูปแบบงานที่ท่านอยากได้มากที่สุด", kind: "single" },
  { id: "q11", no: 11, short: "รูปแบบอาหาร", question: "รูปแบบอาหารที่ท่านชอบที่สุด", kind: "single" },
  { id: "q12", no: 12, short: "ข้อจำกัดอาหาร", question: "ท่านมีข้อจำกัดด้านอาหารหรือไม่", kind: "single" },
  { id: "q13", no: 13, short: "กิจกรรมที่อยากให้มี", question: "กิจกรรมที่ท่านอยากให้มีในงาน", kind: "multi" },
  { id: "q14", no: 14, short: "ของรางวัลที่อยากได้", question: "ของรางวัลจับฉลากที่ท่านอยากได้มากที่สุด", kind: "multi" },
  { id: "q15", no: 15, short: "รางวัลเชิดชูเกียรติ", question: "รางวัลเชิดชูเกียรติที่ท่านอยากให้มีในงาน", kind: "multi" },
  { id: "q16", no: 16, short: "ผู้มอบรางวัล", question: "ถ้าท่านได้ขึ้นรับรางวัล ท่านอยากให้ใครเป็นคนมอบ", kind: "single" },
  { id: "q17", no: 17, short: "รู้สึกมีคุณค่าเมื่อ", question: "สิ่งที่ทำให้รู้สึกว่าบริษัทเห็นคุณค่าของท่านจริงๆ", kind: "single" },
  { id: "q18", no: 18, short: "เคยมากี่ครั้ง", question: "3 ปีที่ผ่านมา คุณมาร่วมงานปีใหม่บริษัทกี่ครั้ง", kind: "single" },
  { id: "q19", no: 19, short: "ข้อเสนอแนะ", question: "อยากให้ปรับปรุงอะไร หรืออยากบอกอะไรกับผู้บริหาร", kind: "text" },
  { id: "q20", no: 20, short: "เป็นตัวแทน", question: "สนใจร่วมเป็น “ทีมตัวแทนคนขับ” ช่วยออกแบบงานไหม", kind: "single" },
];

/** หนึ่งคนตอบหนึ่งชุด — รูปที่ส่งจาก server component ไปให้หน้าจอ */
export interface SurveyResponse {
  drivercode: string;
  driverName: string;
  plant: string;
  customer: string;
  truckplate: string;
  attending: boolean | null;
  /** ISO string — ส่ง Date ข้ามไป client component ไม่ได้ */
  submittedAt: string | null;
  durationSeconds: number | null;
  /**
   * คำตอบราย `q1..q20` — **ทุกข้อเป็น array เสมอ** แม้ข้อที่เลือกได้ค่าเดียว
   * เพื่อให้ฝั่งนับ/กรองเขียนทางเดียว ไม่ต้องแยกเคสตามชนิดคำถาม
   */
  answers: Record<string, string[]>;
}
