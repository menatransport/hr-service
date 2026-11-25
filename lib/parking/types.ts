/**
 * บริการจอดรถบริษัท — เฟส 1 “ลงทะเบียนรถ & ออกบัตรจอด” (24 พ.ย. 2569)
 *
 * ที่มา: บอร์ด “MENA Smart Parking — Swimlane Process” (https://claude.ai/artifact/JRAsXBpPqspt4eKxa6QRm3)
 * - พนักงานกรอกข้อมูลรถ + รูป → HR/Admin ตรวจข้อมูลและกรรมสิทธิ์ → ถูกต้อง/ไม่ซ้ำ = ออกรหัสบัตร + QR
 *   → พิมพ์ติด สถานะ “ใช้งาน” · ไม่ผ่าน = ส่งกลับแก้ไข
 * - รหัสบัตร `<ประเภท>-<ศูนย์>-<ลำดับ 4 หลัก>` เช่น `C-LKB-0001` (C รถบริษัท · E รถพนักงาน · V ผู้มาติดต่อ)
 * - ขอจอดค้างคืน (②) และ รปภ. ตรวจกลางคืน (③) เป็นเฟสถัดไป
 *
 * ข้อมูลอยู่ใน `hr_service.parking_vehicles` (25 พ.ย. 2569) — อ่าน/เขียนฝั่งเซิร์ฟเวอร์ที่ `lib/parking/store.ts`
 * ผ่าน server actions ของหน้า (`app/desk/(module)/parking/actions.ts`) ซึ่งตรวจสิทธิ์ทุกคำสั่ง
 */

/** สิทธิ์ย่อยของเมนู `parking` — เห็นตารางทะเบียนทุกคัน + อนุมัติ/ออกบัตร (`lib/modules.ts`) */
export const PARKING_ADMIN = "parking-admin";
/** สิทธิ์ย่อย — สแกน QR บนบัตรแล้วเห็นข้อมูลรถ (รปภ. / HR) */
export const PARKING_VERIFY = "parking-verify";

/** path หน้าตรวจบัตรที่ QR ชี้ไป — อยู่ใต้ `/desk` ให้ `proxy.ts` บังคับล็อกอินแล้วพากลับมาหน้าเดิม */
export const verifyPath = (code: string) => `/desk/parking/v/${encodeURIComponent(code)}`;

/** ผลที่คนสแกนเห็น — เก็บลง log ด้วย */
export type ScanResult = "valid" | "pending" | "returned" | "cancelled" | "expired" | "not-found" | "denied";

export type Ownership = "company" | "employee" | "visitor";
export type VehicleKind = "car" | "motorcycle" | "other";
/** pending รอ HR ตรวจ · active ออกบัตรแล้ว · returned ส่งกลับแก้ไข · cancelled ยกเลิกบัตร */
export type VehicleStatus = "pending" | "active" | "returned" | "cancelled";
export type SiteCode = "LKB" | "SRB" | "BPK";

export interface ParkingVehicle {
  id: string;
  /** รหัสบัตร — ออกตอนอนุมัติ · `null` = ยังไม่ออก */
  code: string | null;
  ownership: Ownership;
  kind: VehicleKind;
  /** ทะเบียน เช่น `1กข 1234` */
  plate: string;
  province: string;
  brand: string;
  model: string;
  color: string;
  /** URL รูปด้านหน้าเห็นทะเบียน (อัปขึ้น Spaces ผ่าน `ImageUploadField`) */
  photo: string | null;
  /** เลขทะเบียนทรัพย์สิน — รถบริษัทเท่านั้น */
  assetNo: string;
  ownerId: string;
  ownerName: string;
  department: string;
  site: SiteCode;
  phone: string;
  /** `YYYY-MM-DD` — บัตรชั่วคราวของผู้มาติดต่อ · ว่าง = ไม่มีวันหมดอายุ */
  validUntil: string;
  status: VehicleStatus;
  /** เหตุผลที่ส่งกลับ / ยกเลิก */
  note: string;
  createdAt: string;
  issuedAt: string | null;
  /** รหัสพนักงานคนที่ยื่น — ผู้ใช้ทั่วไปเห็นคันที่ตัวเองเป็นเจ้าของ **หรือ** เป็นคนยื่น (เช่นยื่นให้ผู้มาติดต่อ) */
  requestedBy: string;
}

export const OWNERSHIP: Record<
  Ownership,
  { label: string; en: string; prefix: string; hint: string }
> = {
  company: { label: "รถบริษัท", en: "COMPANY CAR", prefix: "C", hint: "รถทรัพย์สินบริษัท · อ้างอิงเลขทรัพย์สิน" },
  employee: { label: "รถพนักงาน", en: "EMPLOYEE", prefix: "E", hint: "รถส่วนตัวของพนักงาน" },
  visitor: { label: "ผู้มาติดต่อ", en: "VISITOR", prefix: "V", hint: "บัตรชั่วคราว มีวันหมดอายุ" },
};

export const KIND_LABEL: Record<VehicleKind, string> = {
  car: "รถยนต์",
  motorcycle: "รถจักรยานยนต์",
  other: "อื่น ๆ",
};

export const STATUS_LABEL: Record<VehicleStatus, string> = {
  pending: "รอตรวจ",
  active: "ใช้งาน",
  returned: "ส่งกลับแก้ไข",
  cancelled: "ยกเลิก",
};

export const STATUS_CHIP: Record<VehicleStatus, string> = {
  pending: "chip-wait",
  active: "chip-live",
  returned: "chip-sla",
  cancelled: "chip-alert",
};

export const SITES: Record<SiteCode, string> = {
  LKB: "ศูนย์ลาดกระบัง",
  SRB: "ศูนย์สระบุรี",
  BPK: "ศูนย์บางปะกง",
};

export const PROVINCES = [
  "กรุงเทพมหานคร", "กระบี่", "กาญจนบุรี", "กาฬสินธุ์", "กำแพงเพชร", "ขอนแก่น", "จันทบุรี", "ฉะเชิงเทรา",
  "ชลบุรี", "ชัยนาท", "ชัยภูมิ", "ชุมพร", "เชียงราย", "เชียงใหม่", "ตรัง", "ตราด", "ตาก", "นครนายก",
  "นครปฐม", "นครพนม", "นครราชสีมา", "นครศรีธรรมราช", "นครสวรรค์", "นนทบุรี", "นราธิวาส", "น่าน",
  "บึงกาฬ", "บุรีรัมย์", "ปทุมธานี", "ประจวบคีรีขันธ์", "ปราจีนบุรี", "ปัตตานี", "พระนครศรีอยุธยา",
  "พะเยา", "พังงา", "พัทลุง", "พิจิตร", "พิษณุโลก", "เพชรบุรี", "เพชรบูรณ์", "แพร่", "ภูเก็ต",
  "มหาสารคาม", "มุกดาหาร", "แม่ฮ่องสอน", "ยโสธร", "ยะลา", "ร้อยเอ็ด", "ระนอง", "ระยอง", "ราชบุรี",
  "ลพบุรี", "ลำปาง", "ลำพูน", "เลย", "ศรีสะเกษ", "สกลนคร", "สงขลา", "สตูล", "สมุทรปราการ",
  "สมุทรสงคราม", "สมุทรสาคร", "สระแก้ว", "สระบุรี", "สิงห์บุรี", "สุโขทัย", "สุพรรณบุรี", "สุราษฎร์ธานี",
  "สุรินทร์", "หนองคาย", "หนองบัวลำภู", "อ่างทอง", "อำนาจเจริญ", "อุดรธานี", "อุตรดิตถ์", "อุทัยธานี",
  "อุบลราชธานี",
];

/** ศูนย์ของผู้ใช้จาก `site` ใน NCAC (ข้อความอิสระ) — ไม่รู้จัก = ลาดกระบัง */
export function siteFromText(site: string | null | undefined): SiteCode {
  const s = (site ?? "").toLowerCase();
  if (s.includes("สระบุรี") || s.includes("saraburi") || s.includes("srb")) return "SRB";
  if (s.includes("บางปะกง") || s.includes("bang pakong") || s.includes("bpk")) return "BPK";
  return "LKB";
}

/** ผู้ใช้ที่ล็อกอิน — ใช้กรอง “รถของฉัน” และเติมช่องผู้รับผิดชอบให้ */
export interface ParkingMe {
  employeeId: string;
  name: string;
  department: string;
  site: SiteCode;
}

/** ทะเบียน + จังหวัด เทียบแบบไม่สนช่องว่าง — ใช้กันลงทะเบียนซ้ำ */
export const plateKey = (plate: string, province: string) =>
  `${plate.replace(/[\s-]+/g, "")}|${province}`.toLowerCase();

/** `2026-11-24` → `24 พ.ย. 2569` */
export function thaiDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

export const EMPTY_VEHICLE: Omit<ParkingVehicle, "id" | "createdAt"> = {
  code: null,
  ownership: "employee",
  kind: "car",
  plate: "",
  province: "กรุงเทพมหานคร",
  brand: "",
  model: "",
  color: "",
  photo: null,
  assetNo: "",
  ownerId: "",
  ownerName: "",
  department: "",
  site: "LKB",
  phone: "",
  validUntil: "",
  status: "pending",
  note: "",
  issuedAt: null,
  requestedBy: "",
};

/** ช่องที่ผู้ยื่นกรอกได้ — ที่เหลือ (รหัสบัตร · สถานะ · วันที่ · ผู้ยื่น) เซิร์ฟเวอร์เป็นคนตั้ง */
export type VehicleInput = Pick<
  ParkingVehicle,
  | "ownership" | "kind" | "plate" | "province" | "brand" | "model" | "color" | "photo" | "assetNo"
  | "ownerId" | "ownerName" | "department" | "site" | "phone" | "validUntil"
>;
