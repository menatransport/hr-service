import type { Conflict } from "./conflicts";
import type { Headcount } from "./headcount";
import type { Confidence, MatchProposal, MatchedBy } from "./match";

/**
 * ชนิดข้อมูลที่ใช้ร่วมกันทั้ง server / client / API — **ห้าม import อะไรที่ลาก `mongodb` มา**
 */

/** เอกสารใน `hr_service.partner_driver_links` — หนึ่งสัญญาหนึ่งแถว · เกิดเมื่อคนกดยืนยันเท่านั้น */
export interface LinkDoc {
  contractCode: string;
  drivercode: string;
  matchedBy: MatchedBy;
  confidence: Confidence;
  /** `employeeId` จาก session — ไม่รับจาก client */
  confirmedBy: string;
  confirmedByName: string;
  confirmedAt: Date;
  note?: string;
}

/** แถวคู่ที่ยืนยันแล้ว พร้อมข้อมูลสองฝั่งไว้แสดง */
export interface LinkView {
  contractCode: string;
  drivercode: string;
  matchedBy: MatchedBy;
  confidence: Confidence;
  confirmedBy: string;
  confirmedByName: string;
  /** ISO */
  confirmedAt: string;
  note: string | null;
  partnerName: string | null;
  partnerActive: boolean | null;
  etlName: string | null;
  etlActive: boolean | null;
  etlOwnerType: string | null;
}

export interface DriverLinksOverview {
  /** ISO — เวลาที่ประกอบข้อมูลชุดนี้ */
  generatedAt: string;
  proposals: MatchProposal[];
  links: LinkView[];
  headcount: Headcount;
  conflicts: Conflict[];
  /** ฟิลด์เลขบัตรของ ETL ที่ใช้อยู่ (`null` = ยังไม่มี จับด้วยชื่อ+ทะเบียนอย่างเดียว) */
  nationalIdField: string | null;
  assumptions: readonly string[];
  /** จำนวนสัญญาฝั่งรถร่วมทั้งหมด (มี `contractCode`) */
  partnerContracts: number;
}

export interface ConfirmLinkBody {
  contractCode: string;
  drivercode: string;
  matchedBy: MatchedBy;
  confidence: Confidence;
  note?: string;
}
