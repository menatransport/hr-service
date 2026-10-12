/**
 * ทะเบียนรายการข้อมูลที่ต้องได้รับในหนึ่งรอบจ่าย — **ใช้ได้ทั้ง server และ client**
 *
 * มาจากชีต `ผู้รับผิดชอบ` ของไฟล์ Analysis_Smart Payroll Process Improvement.xlsx
 * ซึ่งเป็นทะเบียนที่ฝ่ายค่าจ้างใช้ไล่ของอยู่แล้ว
 *
 * **เหลือ 25 รายการ** — ถอด เงินกู้ · เงินค้ำ · เงินออม · กองทุนสำรองเลี้ยงชีพ · กยศ
 * (เลข 25–29 เดิม) ออกตามที่เจ้าของงานยืนยัน เพราะไม่มีใครต้องส่งไฟล์: สี่รายการแรก
 * Tiger Soft คำนวณให้เอง ส่วน กยศ ดึงจากเว็บไซต์ของกองทุน
 *
 * **เลขรายการไม่เรียงใหม่** หลังถอดออก — เลขนี้เป็นคีย์ที่ผูกกับสถานะใน
 * `payroll_intake` แล้ว เรียงใหม่เมื่อไหร่ของที่บันทึกไว้ในรอบเก่าจะชี้ผิดรายการทันที
 *
 * **รายการที่นี่คือสิ่งที่ "ต้องได้" ไม่ใช่สิ่งที่ "ได้แล้ว"** — สถานะรายเดือนอยู่ใน
 * คอลเลกชัน `payroll_intake` คนละที่กัน เพื่อให้แก้ทะเบียนได้โดยไม่กระทบรอบที่ปิดแล้ว
 *
 * `dueDay` = วันที่ของเดือนที่ต้องส่งถึง HR · ตัวเลขนี้มาจากทะเบียนเดิม ไม่ใช่ที่ตั้งเอง
 */

export interface IntakeItem {
  /** รหัสสองหลักตามลำดับในทะเบียนเดิม — ใช้เป็นคีย์ร่วมกับ periodCode */
  id: string;
  title: string;
  owner: IntakeOwner;
  /** วันที่ของเดือนที่ครบกำหนดส่ง */
  dueDay: number;
  /** ชื่อเล่นผู้ส่ง — ไว้ให้ HR รู้ว่าต้องตามใคร (ตัดคำนำหน้า "พี่" ออกตามที่เจ้าของงานสั่ง) */
  sender: string;
}

export type IntakeOwner =
  | "จัดส่ง ลาดกระบัง"
  | "บัญชี ลาดกระบัง"
  | "บัญชี กรุงเทพ"
  | "ยานยนต์"
  | "Operation Support"
  | "HR C&B";

/** เรียงตามลำดับที่ของต้องมาถึงจริง ไม่ใช่เรียงตามชื่อ */
export const OWNER_ORDER: IntakeOwner[] = ["จัดส่ง ลาดกระบัง", "บัญชี ลาดกระบัง", "บัญชี กรุงเทพ", "ยานยนต์", "Operation Support", "HR C&B"];

export const INTAKE_ITEMS: IntakeItem[] = [
  { id: "01", title: "สถานะทำเงินเดือนพจส.และสถานะวันทำงานพจร", owner: "จัดส่ง ลาดกระบัง", dueDay: 10, sender: "จ๋า" },
  { id: "02", title: "สรุปค่าล่วงเวลารถวิ่งงานลูกค้า ที.เอ็น.ซีเมนต์บล็อค", owner: "จัดส่ง ลาดกระบัง", dueDay: 15, sender: "จ๋า" },
  { id: "03", title: "ค่าล่วงเวลารถวิ่งงานลูกค้า TPI มหาทรัพย์", owner: "จัดส่ง ลาดกระบัง", dueDay: 15, sender: "จ๋า" },
  { id: "04", title: "สรุปค่าล่วงเวลารถวิ่งงานลูกค้า จิรโชติ", owner: "จัดส่ง ลาดกระบัง", dueDay: 15, sender: "จิ๊บ" },
  { id: "05", title: "ค่าล่วงเวลา นครหลวง เเพลนท์หนองโดน", owner: "จัดส่ง ลาดกระบัง", dueDay: 15, sender: "จิ๊บ" },
  { id: "06", title: "การจ่ายรายได้สนับสนุนรถเข้าปฏิบัติงานที่อมตะนคร", owner: "จัดส่ง ลาดกระบัง", dueDay: 15, sender: "จิ๊บ" },
  { id: "07", title: "Incentive DA100", owner: "จัดส่ง ลาดกระบัง", dueDay: 15, sender: "จิ๊บ" },
  { id: "08", title: "เงินรางวัล จบส.Cpac-โม่ใหญ่", owner: "จัดส่ง ลาดกระบัง", dueDay: 10, sender: "จ๋า" },
  { id: "09", title: "Incentive เงินพิเศษวิ่งงานวันอาทิตย์ รถโม่เล็ก ASIA MS", owner: "จัดส่ง ลาดกระบัง", dueDay: 15, sender: "จิ๊บ" },
  { id: "10", title: "สถานะส่งทำเงินเดือนครูฝึก", owner: "จัดส่ง ลาดกระบัง", dueDay: 10, sender: "จิ๊บ" },
  { id: "11", title: "TA100- 3.69 Cpac-Mena จบส.ได้เงินพิเศษ", owner: "จัดส่ง ลาดกระบัง", dueDay: 10, sender: "กาญ" },
  { id: "12", title: "ค่าวินัย+เบี้ยขยัน", owner: "จัดส่ง ลาดกระบัง", dueDay: 10, sender: "จ๋า" },
  { id: "13", title: "ไฟล์หักเงินบิลน้ำมัน-หักเงินสิ้นเดือน", owner: "บัญชี ลาดกระบัง", dueDay: 10, sender: "แตงโม" },
  { id: "14", title: "สรุปเบิกสำรอง พจส ใหม่ ศลบ", owner: "บัญชี กรุงเทพ", dueDay: 10, sender: "พีช" },
  { id: "15", title: "สรุปเบิกสำรอง พจส.เก่า ศลบ", owner: "บัญชี กรุงเทพ", dueDay: 10, sender: "พีช" },
  { id: "16", title: "สรุปค่าครูฝึก พจส ใหม่ ศลบ", owner: "บัญชี กรุงเทพ", dueDay: 10, sender: "พีช" },
  { id: "17", title: "Form ค่าปะ-เปลี่ยนยาง ศขก.", owner: "ยานยนต์", dueDay: 10, sender: "ติ้ม" },
  { id: "18", title: "Form ค่าปะ-เปลี่ยนยาง ศลบ.", owner: "ยานยนต์", dueDay: 10, sender: "ติ้ม" },
  { id: "19", title: "เงินรางวัลรถสะอาด", owner: "ยานยนต์", dueDay: 10, sender: "หมี นุ่น" },
  { id: "20", title: "ค่าเที่ยว Mixer", owner: "Operation Support", dueDay: 22, sender: "เฟิร์น" },
  { id: "21", title: "ปะหน้ารับสภาพหนี้", owner: "Operation Support", dueDay: 23, sender: "เนส ทราย" },
  { id: "22", title: "ยอดค้างชำระ", owner: "HR C&B", dueDay: 11, sender: "บัว" },
  { id: "23", title: "ค่าน้ำ-ค่าไฟฟ้า", owner: "HR C&B", dueDay: 20, sender: "บัว" },
  { id: "24", title: "สวัสดิการช่วยเหลือช่วงพักรักษาตัว", owner: "HR C&B", dueDay: 20, sender: "บัว" },
  { id: "30", title: "เพื่อนแนะนำเพื่อน", owner: "HR C&B", dueDay: 20, sender: "บัว" },
];

export const itemsByOwner = (owner: IntakeOwner): IntakeItem[] =>
  INTAKE_ITEMS.filter((item) => item.owner === owner);

export const findItem = (id: string): IntakeItem | undefined =>
  INTAKE_ITEMS.find((item) => item.id === id);

/** ช่วงวันครบกำหนดของเจ้าของข้อมูลรายหนึ่ง เช่น "10 และ 15" */
export function dueDaysOf(owner: IntakeOwner): number[] {
  return [...new Set(itemsByOwner(owner).map((item) => item.dueDay))].sort(
    (a, b) => a - b,
  );
}
