"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, Loader2, TriangleAlert } from "lucide-react";

import { ModalShell } from "@/components/ui/modal-shell";
import { requestJson } from "@/lib/http";
import { ADMIN_ROOT } from "@/app/recruitment/_lib/admin-nav";
import { formatThaiDateTime } from "@/app/recruitment/_lib/drivers/types";
import type { RequisitionVehicle } from "@/app/recruitment/_lib/requisitions/types";
import type { VehicleDetail } from "@/app/recruitment/_lib/requisitions/vehicle-detail";
import { RepairBadge } from "@/app/recruitment/_components/admin/repair-badge";

/**
 * รายละเอียดรถของขั้นยานยนต์ — โหลดตอนเปิดเท่านั้น (`GET /api/recruitment/vehicles/[code]`)
 * หน้าเส้นทางขึ้นแค่สรุปบรรทัดเดียว ของละเอียดอยู่ที่นี่ · อ่านอย่างเดียว
 */
export function VehicleDetailDialog({ vehicle, onClose }: { vehicle: RequisitionVehicle; onClose: () => void }) {
  const [data, setData] = useState<VehicleDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    requestJson<VehicleDetail>(
      `/api/recruitment/vehicles/${encodeURIComponent(vehicle.code || vehicle.plateNo)}`,
      {},
      "โหลดรายละเอียดรถไม่สำเร็จ",
    )
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "โหลดรายละเอียดรถไม่สำเร็จ");
      });
    return () => {
      alive = false;
    };
  }, [vehicle.code, vehicle.plateNo]);

  return (
    <ModalShell
      title="รายละเอียดรถ"
      subtitle={
        <span className="font-mono text-12 tracking-wider text-primary">
          {[vehicle.code, vehicle.plateNo].filter(Boolean).join(" · ")}
        </span>
      }
      onClose={onClose}
      width="560px"
      tone="plain"
      footer={
        <button type="button" onClick={onClose} className="btn-sec px-4 py-2 text-13">
          ปิด
        </button>
      }
    >
      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-field bg-alert/10 px-3 py-2 text-12-5 text-alert">
          <TriangleAlert size={14} strokeWidth={1.9} aria-hidden className="mt-0.5 flex-none" />
          {error}
        </p>
      ) : !data ? (
        <p className="flex items-center gap-2 py-6 text-13 text-mut">
          <Loader2 size={15} className="animate-spin" aria-hidden />
          กำลังโหลด…
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {/* ETL ดึงจาก ATMS เป็นรอบ — บอกเวลาของแต่ละชุดให้ชัด ค่าอาจยังไม่ตรงกับ ATMS/WMS ณ ตอนนี้ */}
          <div className="flex items-start gap-2 rounded-field bg-base-200 px-3 py-2 text-12">
            <Clock size={14} strokeWidth={2} aria-hidden className="mt-0.5 flex-none text-mut" />
            <p className="flex flex-col gap-0.5">
              <span className="font-medium">ข้อมูลจาก ATMS ณ เวลาที่ระบบดึงมาล่าสุด</span>
              <span className="text-mut">
                รถ {stamp(data.synced.vehicle)} · พจส. {stamp(data.synced.drivers)} · งานซ่อม {stamp(data.synced.repair)}
              </span>
            </p>
          </div>

          <dl className="flex flex-col gap-2">
            <Row label="ประเภท">{data.type}</Row>
            <Row label="ยี่ห้อ · รุ่น">{[data.brand, data.model].filter(Boolean).join(" ")}</Row>
            <Row label="ปี">{data.year}</Row>
            <Row label="โปรเจกต์">{data.project}</Row>
            <Row label="สาขา · จุดจอด">{[data.branch, data.plant].filter(Boolean).join(" · ")}</Row>
            <Row label="พจส. ประจำรถ">
              {data.drivers.length ? (
                <span className="flex flex-wrap gap-x-3">
                  {data.drivers.map((d) => (
                    <Link key={d.drivercode} href={`${ADMIN_ROOT}/drivers/${d.drivercode}`} className="hover:text-primary">
                      {d.name || d.drivercode} <span className="font-mono text-12 text-mut">{d.drivercode}</span>
                    </Link>
                  ))}
                </span>
              ) : (
                <span className="text-primary">ว่าง</span>
              )}
            </Row>
          </dl>

          <section className="flex flex-col gap-2 border-t border-line pt-3.5">
            <h3 className="text-12 font-semibold text-mut">งานซ่อม</h3>
            {data.repair ? (
              <>
                <RepairBadge repair={data.repair} />
                <dl className="flex flex-col gap-2">
                  {data.repair.garage ? <Row label="อู่">{data.repair.garage}</Row> : null}
                  {data.repair.problems.length ? (
                    <Row label="อาการ">
                      <ul className="flex flex-col gap-0.5">
                        {data.repair.problems.map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    </Row>
                  ) : null}
                  {data.repair.mrCode ? (
                    <Row label="ใบแจ้งซ่อม">
                      <span className="font-mono text-12">{data.repair.mrCode}</span>
                    </Row>
                  ) : null}
                </dl>
              </>
            ) : (
              <p className="text-13 text-primary">ไม่มีงานซ่อมค้าง</p>
            )}
          </section>
        </div>
      )}
    </ModalShell>
  );
}

const stamp = (at: string | null) => (at ? formatThaiDateTime(at) : "อ่านเวลาไม่ได้");

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[104px_minmax(0,1fr)] gap-2 text-13">
      <dt className="text-12 text-mut">{label}</dt>
      <dd className="min-w-0">{children || <span className="text-mut">—</span>}</dd>
    </div>
  );
}
