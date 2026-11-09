import { ObjectId } from "mongodb";

import { nicknameAnswer, readApplicationsWithSnapshot } from "../applications";
import type { AnswerMap } from "../types";
import { requisitionLinks } from "./portrait";

/**
 * ชื่อเล่น พจส. = **คำตอบข้อ “ชื่อเล่น” ในใบสมัครของคนนั้น** (Bew 9 พ.ย. 2569)
 *
 * ทะเบียนไม่มีช่องชื่อเล่นของตัวเอง — `readDrivers()` เติม `nickname` ให้ตอนอ่าน ท่าเดียวกับรูปหน้าตรง
 * (`./portrait.ts`) และหาใบสมัครด้วยลำดับเดียวกัน: คำขอสรรหาที่ผูกรหัสไว้ → ไม่มีค่อยจับเลขบัตรประชาชน
 * (ใบใหม่สุด) · คนเก่าจาก Excel ที่ไม่มีใบสมัคร = ไม่มีชื่อเล่น
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

  const byId = new Map<string, string>();
  const byNationalId = new Map<string, string>();
  for (const a of apps) {
    if (erased(a)) continue;
    const nickname = nicknameAnswer(a);
    if (!nickname) continue;
    byId.set(a._id.toHexString(), nickname);
    const nid = digits(a.documents?.nationalId);
    if (nid.length === 13) byNationalId.set(nid, nickname); // เรียงเก่า→ใหม่ ใบใหม่สุดทับ
  }

  return {
    resolve(drivercode, nationalId) {
      const linked = links.get(drivercode.trim());
      const nid = digits(nationalId);
      return (linked && byId.get(linked)) || (nid.length === 13 && byNationalId.get(nid)) || "";
    },
  };
}
