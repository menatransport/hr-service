import { ObjectId } from "mongodb";

import { todayInBangkok } from "@/lib/record-case-flow";

import { nicknameAnswer, readApplicationsWithSnapshot } from "../applications";
import { applicantAge, applicantBirthDate } from "../form";
import type { AnswerMap } from "../types";
import { requisitionLinks } from "./portrait";

/**
 * ชื่อเล่น พจส. = **คำตอบข้อ “ชื่อเล่น” ในใบสมัครของคนนั้น** (Bew 9 พ.ย. 2569)
 *
 * ทะเบียนไม่มีช่องชื่อเล่นของตัวเอง — `readDrivers()` เติม `nickname` ให้ตอนอ่าน ท่าเดียวกับรูปหน้าตรง
 * (`./portrait.ts`) และหาใบสมัครด้วยลำดับเดียวกัน: คำขอสรรหาที่ผูกรหัสไว้ → ไม่มีค่อยจับเลขบัตรประชาชน
 * (ใบใหม่สุด) · คนเก่าจาก Excel ที่ไม่มีใบสมัคร = ไม่มีชื่อเล่น
 *
 * อายุ (`age`) มาจากใบเดียวกัน — วันเกิด/อายุที่ตอบในใบสมัคร (`applicantAge()`) · ทะเบียนไม่มีวันเกิด
 * (คอลัมน์อายุในตารางทะเบียน · Bew 11 พ.ย. 2569)
 */

type AppLite = {
  answers?: AnswerMap;
  documents?: { nationalId?: string };
  createdAt?: string;
  erasedAt?: unknown;
  status?: string;
};

const digits = (v: unknown) => (typeof v === "string" ? v.replace(/[^0-9]/g, "") : "");
/** ใบที่ผู้สมัครยกเลิกเองแล้วข้อมูลถูกลบ — กติกาเดียวกับ `erasedOf()` ใน applications.ts */
const erased = (a: AppLite) => Boolean(a.erasedAt) || a.status === "withdrawn";

export type NicknameIndex = {
  /** `""` = ไม่มีใบสมัคร หรือใบนั้นไม่ได้ตอบชื่อเล่น */
  resolve: (drivercode: string, nationalId: unknown) => string;
  /** อายุ ณ วันนี้จากใบสมัคร — `null` = ไม่มีใบสมัคร หรือไม่ได้ตอบวันเกิด/อายุ */
  age: (drivercode: string, nationalId: unknown) => number | null;
  /** วันเกิดที่ตอบในใบสมัคร `YYYY-MM-DD` — `""` = ไม่มี (ทะเบียนมีวันเกิดของตัวเองแล้วชนะ · `toRecord()`) */
  birthDate: (drivercode: string, nationalId: unknown) => string;
};

export async function loadNicknameIndex(codes?: readonly string[]): Promise<NicknameIndex> {
  const links = await requisitionLinks(codes);
  const linkedIds = [...new Set(links.values())].map((id) => new ObjectId(id));

  const apps = await readApplicationsWithSnapshot<AppLite>(
    [
      { $match: { $or: [{ _id: { $in: linkedIds } }, { "documents.nationalId": { $nin: ["", null] } }] } },
      { $sort: { createdAt: 1 } },
    ],
    { answers: 1, "documents.nationalId": 1, createdAt: 1, erasedAt: 1, status: 1 },
  );

  const today = todayInBangkok();
  const byId = new Map<string, string>();
  const byNationalId = new Map<string, string>();
  const ageById = new Map<string, number>();
  const ageByNationalId = new Map<string, number>();
  const birthById = new Map<string, string>();
  const birthByNationalId = new Map<string, string>();
  for (const a of apps) {
    if (erased(a)) continue;
    const id = a._id.toHexString();
    const nid = digits(a.documents?.nationalId);
    const age = applicantAge(a, today);
    const birth = applicantBirthDate(a);
    if (birth) {
      birthById.set(id, birth);
      if (nid.length === 13) birthByNationalId.set(nid, birth);
    }
    if (age != null) {
      ageById.set(id, age);
      if (nid.length === 13) ageByNationalId.set(nid, age);
    }
    const nickname = nicknameAnswer(a);
    if (!nickname) continue;
    byId.set(id, nickname);
    if (nid.length === 13) byNationalId.set(nid, nickname); // เรียงเก่า→ใหม่ ใบใหม่สุดทับ
  }

  return {
    resolve(drivercode, nationalId) {
      const linked = links.get(drivercode.trim());
      const nid = digits(nationalId);
      return (linked && byId.get(linked)) || (nid.length === 13 && byNationalId.get(nid)) || "";
    },
    age(drivercode, nationalId) {
      const linked = links.get(drivercode.trim());
      const nid = digits(nationalId);
      return (linked ? ageById.get(linked) : undefined) ?? (nid.length === 13 ? ageByNationalId.get(nid) : undefined) ?? null;
    },
    birthDate(drivercode, nationalId) {
      const linked = links.get(drivercode.trim());
      const nid = digits(nationalId);
      return (linked && birthById.get(linked)) || (nid.length === 13 && birthByNationalId.get(nid)) || "";
    },
  };
}
