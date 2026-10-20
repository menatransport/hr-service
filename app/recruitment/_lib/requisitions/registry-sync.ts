import { getApplication } from "@/app/recruitment/_lib/applications";
import { readApplicantFacts } from "@/app/recruitment/_lib/hr-documents";
import { findIssuedDriver } from "@/app/recruitment/_lib/drivers/master";
import {
  enrollDriver,
  resignFromOnboarding,
  toIsoDate,
  todayInBangkok,
} from "@/app/recruitment/_lib/drivers/registry";
import { outcomeGroup, outcomeLabel, val, type Onboarding } from "./onboarding";
import { customerLabel, positionLabel, type Requisition } from "./types";

/**
 * สะพานจากหน้าติดตามพนักงานใหม่ → ทะเบียนประวัติ พจส. (19 ต.ค. 2569)
 *
 * ทะเบียนไม่ได้อ่านจาก `Boom_ETL.main_driver` แล้ว (ดู `drivers/master.ts`) คนใหม่จึงต้องเข้าทะเบียน
 * ผ่านระบบนี้เอง: **ผูกรหัส พจส. ให้คำขอเมื่อไหร่ = รับเข้าทะเบียน** (สถานะปฏิบัติงาน · ฝึกงานนับรวม
 * ตามทะเบียน Excel · ยกเว้น “รอฝึกงาน/รอรับรถ” ที่รอวันรับรถก่อน) · ผลสิ้นสุด (ลาออก/ปลด/ยกเลิกฝึกงาน …)
 * พร้อมวันที่ = บันทึกพ้นสภาพให้ (เฉพาะคนที่อยู่ในทะเบียนแล้ว — ออกก่อนเข้าทะเบียนก็ไม่ต้องเข้า)
 *
 * เรียกหลังบันทึกคำขอสำเร็จแล้วเท่านั้น และ **ล้มแล้วไม่ทำให้การบันทึกคำขอล้ม** — ผู้เรียกครอบ try เอง
 */

/** รหัส พจส. ที่ผูกให้คำขอได้ — มีในทะเบียนแล้ว หรือ ATMS ออกรหัสให้แล้ว */
export async function isIssuedDriverCode(code: string): Promise<boolean> {
  return Boolean(await findIssuedDriver(code));
}

export async function syncRegistryFromRequisition(
  r: Requisition & { onboarding?: Onboarding },
  by: string,
): Promise<void> {
  const drivercode = r.drivercode.trim();
  if (!drivercode) return;

  const outcome = val(r.onboarding, "rc", "outcome") || r.outcome;
  const group = outcomeGroup(outcome);
  if (group === "withdrawn" || group === "lost") {
    const exitOn = val(r.onboarding, "rc", "exitOn");
    if (exitOn)
      await resignFromOnboarding(
        drivercode,
        { dateISO: exitOn, label: outcomeLabel(outcome), note: `ผลสิ้นสุดจากหน้าติดตามพนักงานใหม่ · ${r.code}` },
        by,
      );
    return;
  }

  /* รอฝึกงาน/รอรับรถ ยังไม่เข้าทะเบียนจนกว่าจะบันทึกวันรับรถ — กติกาเดียวกับตัวนำเข้า Excel (Bew 19 ต.ค. 2569) */
  const handedOver = Boolean(val(r.onboarding, "handover", "handoverOn"));
  if (!handedOver && (outcome === "waiting_training" || outcome === "waiting_handover")) return;

  const issued = await findIssuedDriver(drivercode);
  if (!issued || issued.inRegistry) return;

  /* เลขบัตร/ใบขับขี่/บัญชี/ผู้ติดต่อฉุกเฉินไม่มีใน ATMS — เอาจากใบสมัครที่ผูกไว้
     (ช่องเอกสารที่ฝ่ายบุคคลกรอก/ตรวจจากรูป + คำตอบในใบสมัคร) */
  const application = r.match?.applicationId ? await getApplication(r.match.applicationId) : null;
  const doc = application?.documents;
  const facts = application ? readApplicantFacts(application) : null;
  const digits = (v: string | undefined) => (v ?? "").replace(/[^0-9]/g, "");

  await enrollDriver(
    {
      drivercode,
      driverName: r.match?.fullName || r.hireName || issued.driverName,
      phone: issued.phone || digits(application?.phone),
      ownerType: issued.ownerType || "1",
      /* หน้าติดตามพนักงานใหม่เป็นของลาดกระบัง (`DRIVER_SITES`) — ATMS ระบุสาขามาก็ใช้ของ ATMS */
      branch: issued.branch || "2",
      vehicleCode: r.vehicle?.code || issued.vehicleCode,
      startDate:
        toIsoDate(val(r.onboarding, "rc", "trainingStartOn")) ||
        toIsoDate(r.filledOn) ||
        toIsoDate(issued.startDate) ||
        todayInBangkok(),
      licenseExpiryDate: toIsoDate(issued.licenseExpiryDate) || toIsoDate(doc?.licenseExpiry),
      licenseNo: doc?.licenseNo.trim() ?? "",
      licenseType: doc?.licenseType.trim() ?? "",
      nationalId: digits(doc?.nationalId),
      idCardExpiryDate: toIsoDate(doc?.idCardExpiry),
      emergencyContactName: facts?.emergencyName.trim() ?? "",
      emergencyContactRelation: facts?.emergencyRelation.trim() ?? "",
      emergencyContactPhone: digits(facts?.emergencyPhone),
      bankAccountNo: digits(doc?.bankAccountNo),
      customer: customerLabel(r),
      plant: r.plant,
      position: positionLabel(r),
      requisitionId: r.id,
      requisitionCode: r.code,
    },
    by,
  );
}
