import type { Collection } from "mongodb";

import { hrCol } from "@/lib/db";
import { isSignatureImage } from "./hr-signatures";
import { RecruitmentError } from "./questions";

/**
 * ลายเซ็นประจำตัวของเจ้าหน้าที่ — **ฝั่งเซิร์ฟเวอร์เท่านั้น** (เรียกจาก
 * `app/api/recruitment/my-signature` เท่านั้น) · หนึ่งคนหนึ่งแถว `_id` = รหัสพนักงาน
 * จาก session เสมอ — ไม่มีเส้นไหนอ่าน/เขียนลายเซ็นของคนอื่นได้
 *
 * เอกสารที่เซ็นไปแล้วเก็บสำเนารูปของตัวเอง (`DocFill.signatures`) เปลี่ยน/ลบที่นี่
 * จึงไม่กระทบกระดาษที่ออกไปแล้ว
 */

interface StaffSignatureDoc {
  _id: string;
  name: string;
  image: string;
  updatedAt: string;
}

function col(): Promise<Collection<StaffSignatureDoc>> {
  return hrCol<StaffSignatureDoc>("staffSignatures");
}

export async function getStaffSignature(
  employeeId: string,
): Promise<{ image: string; updatedAt: string } | null> {
  const doc = await (await col()).findOne({ _id: employeeId });
  return doc ? { image: doc.image, updatedAt: doc.updatedAt } : null;
}

export async function saveStaffSignature(
  employeeId: string,
  name: string,
  input: unknown,
): Promise<{ image: string; updatedAt: string }> {
  const image = (input as { image?: unknown } | null)?.image;
  if (!isSignatureImage(image)) {
    throw new RecruitmentError("รูปลายเซ็นไม่ถูกต้องหรือใหญ่เกินไป");
  }
  const updatedAt = new Date().toISOString();
  await (await col()).updateOne(
    { _id: employeeId },
    { $set: { name, image, updatedAt } },
    { upsert: true },
  );
  return { image, updatedAt };
}

export async function deleteStaffSignature(employeeId: string): Promise<void> {
  await (await col()).deleteOne({ _id: employeeId });
}
