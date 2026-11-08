import { ObjectId } from "mongodb";

import { hrCol } from "@/lib/db";
import { readDriver } from "./master";
import { linkedApplicationId } from "./portrait";
import { getDriverOnboarding } from "@/app/recruitment/_lib/requisitions/onboarding-store";
import type { OnboardingRecord } from "@/app/recruitment/_lib/requisitions/onboarding";

/**
 * ข้อมูลจากฝั่งสรรหาของ พจส. หนึ่งคน — หน้าประวัติรายคนใช้สองที่ (Bew 8 พ.ย. 2569):
 * - แท็บเอกสาร กลุ่ม “เอกสาร HR” — เปิดรายงานผู้สมัคร/สัญญาจ้าง/สัญญาค้ำ/ยินยอมคืนเงินค้ำ ที่ทำจากใบสมัคร
 * - แท็บ “ข้อมูลฝึกงาน” — RC · KA · ST · HRD ของคำขอสรรหาที่ผูกรหัสนี้
 *
 * ใบสมัคร = ใบที่คำขอผูกไว้ ไม่มี → ใบที่เลขบัตรตรงกับทะเบียน (กติกาเดียวกับรูปโปรไฟล์ `portrait.ts`)
 * · อ่านพลาดฝั่งใดฝั่งหนึ่ง = ฝั่งนั้นว่าง หน้าประวัติยังขึ้นได้
 */
export interface DriverHrLink {
  application: { id: string; ref: string; erased: boolean } | null;
  onboarding: OnboardingRecord | null;
}

export async function getDriverHrLink(drivercode: string): Promise<DriverHrLink> {
  const soft = <T>(p: Promise<T>): Promise<T | null> =>
    p.catch((err) => {
      console.warn("[driver-hr] อ่านข้อมูลฝั่งสรรหาไม่สำเร็จ —", err);
      return null;
    });

  const onboarding = await soft(getDriverOnboarding(drivercode));
  const fromRequisition = onboarding?.match?.applicationId ?? "";
  const applicationId =
    fromRequisition ||
    (await soft(
      readDriver<{ nationalId?: unknown }>(drivercode, ["nationalId"]).then((d) =>
        linkedApplicationId(drivercode, d?.nationalId),
      ),
    ));

  const application = applicationId ? await soft(readApplicationLite(applicationId)) : null;

  return { application, onboarding };
}

async function readApplicationLite(id: string): Promise<DriverHrLink["application"]> {
  if (!ObjectId.isValid(id)) return null;
  const col = await hrCol<{ _id: ObjectId; ref?: string; erasedAt?: unknown; status?: string }>("applications");
  const doc = await col.findOne({ _id: new ObjectId(id) }, { projection: { ref: 1, erasedAt: 1, status: 1 } });
  if (!doc) return null;
  /* กติกาเดียวกับ `erasedOf()` ใน applications.ts — ใบที่ข้อมูลถูกลบตามคำขอทำเอกสารไม่ได้ */
  return { id: doc._id.toHexString(), ref: doc.ref ?? "", erased: Boolean(doc.erasedAt) || doc.status === "withdrawn" };
}
