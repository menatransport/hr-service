import type { NextRequest } from "next/server";

import { badRequest, fail, ok } from "@/app/api/_lib/respond";
import { unauthorized } from "@/app/api/recruitment/_lib";
import { readSessionUser } from "@/lib/auth/session";
import { todayInBangkok } from "@/lib/record-case-flow";
import { getOnboardingRecords } from "@/app/recruitment/_lib/requisitions/onboarding-store";
import { getRepairStatuses } from "@/app/recruitment/_lib/requisitions/repair-status";
import {
  PIPELINE,
  PIPELINE_LABEL,
  handoverCheck,
  pipelineOf,
  trainingStart,
  val,
  vehicleReadiness,
  type Pipeline,
} from "@/app/recruitment/_lib/requisitions/onboarding";
import { customerLabel, personName, positionLabel } from "@/app/recruitment/_lib/requisitions/types";

/**
 * `GET /api/recruitment/pipeline?status=open,waitTraining,training,waitHandover`
 * — คนตามช่วงก่อนรับรถ: รอสรรหา · รอฝึกงาน · ฝึกงาน · รอรับรถ (ไม่ส่ง `status` = ทั้ง 4 ช่วง)
 *
 * ช่วงคิดด้วย `pipelineOf()` ชุดเดียวกับหน้าติดตามพนักงานใหม่/หน้าผู้สมัคร/แดชบอร์ด · รอรับรถ = RC ลงสถานะ `ร`
 * (รับรถ) ในตารางสถานะฝึกงาน (`handoverMarkedOn` · 9 พ.ย. 2569) · `handoverReady` เหลือเป็นความคืบหน้าอย่างเดียว
 * · รอสรรหายังไม่มีคน = `name` / `drivercode` ว่าง
 * · สถานะรถ = `vehicleReadiness()` จาก ATMS หยุดวิ่ง + ขั้นงานบอร์ดซ่อม (อ่านไม่ได้ทั้งคู่ = ทุกคันพร้อมใช้งาน) · ยังไม่มีรถ = `null` / ว่าง
 */
export async function GET(request: NextRequest) {
  try {
    if (!(await readSessionUser())) return unauthorized();

    const raw = request.nextUrl.searchParams.get("status")?.trim();
    const wanted = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [...PIPELINE];
    const bad = wanted.find((s) => !(PIPELINE as readonly string[]).includes(s));
    if (bad) return badRequest(`status ไม่ถูกต้อง: ${bad} (ใช้ได้ ${PIPELINE.join(", ")})`);

    const counts = Object.fromEntries(PIPELINE.map((p) => [p, 0])) as Record<Pipeline, number>;
    const rows = [];
    const [records, repairs] = await Promise.all([getOnboardingRecords(), getRepairStatuses()]);
    for (const r of records) {
      const status = pipelineOf(r);
      if (!status) continue;
      counts[status]++;
      if (!wanted.includes(status)) continue;
      const check = handoverCheck(r);
      const person = status !== "open";
      const car = vehicleReadiness(r, r.vehicle?.plateNo ? repairs[r.vehicle.plateNo] : null);
      rows.push({
        status,
        statusLabel: PIPELINE_LABEL[status],
        requisitionId: r.id,
        jr: r.code,
        requestedOn: r.requestedOn,
        branch: r.branch,
        position: positionLabel(r),
        customer: customerLabel(r),
        plant: r.plant,
        vehicle: r.vehicle ? { code: r.vehicle.code, plateNo: r.vehicle.plateNo } : null,
        vehicleStatus: car?.status ?? null,
        vehicleStatusLabel: car?.label ?? "",
        vehicleStatusReason: car?.reason ?? "",
        vehicleStatusDue: car?.due ?? "",
        trainer: r.trainer,
        drivercode: person ? r.drivercode : "",
        name: person ? personName(r) : "",
        applicationRef: r.match?.ref ?? "",
        trainingStartOn: person ? trainingStart(r) : "",
        trainedDays: check.trainedDays,
        orientationOn: val(r.onboarding, "hrd", "orientationOn"),
        stResult: val(r.onboarding, "er", "day8") || val(r.onboarding, "er", "day4") || val(r.onboarding, "er", "day1"),
        handoverReady: { days: check.days, orientation: check.orientation, st: check.st },
        handoverMarkedOn: r.handoverMarkedOn ?? "",
      });
    }

    rows.sort(
      (a, b) =>
        PIPELINE.indexOf(a.status) - PIPELINE.indexOf(b.status) || a.jr.localeCompare(b.jr, "th", { numeric: true }),
    );
    const total = PIPELINE.reduce((sum, p) => sum + counts[p], 0);
    return ok({ asOf: todayInBangkok(), counts: { ...counts, total }, rows });
  } catch (err) {
    return fail(err);
  }
}
