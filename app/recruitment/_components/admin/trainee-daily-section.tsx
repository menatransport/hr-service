"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, Loader2 } from "lucide-react";

import { DataError } from "@/components/ui/data-error";
import type { SelectOption } from "@/components/ui/field";
import { requestJson } from "@/lib/http";
import { todayInBangkok } from "@/lib/record-case-flow";
import { TraineeMatrix } from "@/app/recruitment/_components/admin/trainee-matrix";
import { TraineeReportDialog } from "@/app/recruitment/_components/admin/trainee-report-dialog";
import type { TraineeBoard, TraineeBoardDriver } from "@/app/recruitment/_lib/drivers/trainee-board";
import type { RequisitionVehicle } from "@/app/recruitment/_lib/requisitions/types";
import { requisitionDailyKey } from "@/app/recruitment/_lib/drivers/types";
import { issueOf } from "@/app/recruitment/_lib/drivers/trainees";

type Data = { board: TraineeBoard; vehicles: SelectOption[] };

/** คนที่สถานะฝึกงาน (หน้าผู้สมัคร) — ตัวตั้งของตาราง (จำนวนแถว = จำนวนคนในตาราง) */
export type TraineePerson = {
  id: string;
  code: string;
  name: string;
  drivercode: string;
  vehicle: RequisitionVehicle | null;
};

/**
 * คนที่ยังไม่มีรหัส พจส. (ยังไม่ผูก ATMS) — ไม่มีครึ่งของ ATMS แต่ RC กรอกเองได้
 * ด้วยคีย์ `rq:<id>` · `own` = แถวของคีย์นั้นที่เซิร์ฟเวอร์ส่งมา (บันทึกที่กรอกไว้)
 */
const placeholder = (p: TraineePerson, own?: TraineeBoardDriver): TraineeBoardDriver => ({
  drivercode: "",
  name: p.name,
  photoUrl: "",
  siteKey: null,
  plant: "",
  startDateISO: "",
  tenureMonths: null,
  tenureDays: null,
  days: {},
  manualDays: own?.manualDays ?? {},
  exitedOn: own?.exitedOn ?? "",
  exitReason: own?.exitReason ?? "",
  requisitionId: p.id,
  requisitionCode: p.code,
  vehicle: p.vehicle,
});

/**
 * แท็บ “สถานะฝึกงาน” ของหน้าผู้สมัคร (Bew 5 พ.ย. 2569 — เดิมเป็นตารางรายวันต่อท้ายรายการ
 * พร้อมปุ่มซ่อน/แสดง) · หน้าผู้สมัครเมานต์ค้างไว้แม้อยู่แท็บตาราง — สลับแท็บไม่โหลดใหม่
 * และป้าย Issue วันนี้ขึ้นบนแท็บได้ทันที (`onAlerts`) · เปลี่ยนเดือนโหลดใหม่ในที่เดิม
 *
 * `pool` = ทุกคนในขั้นฝึกงาน (ตัวโหลด) · `people` = คนที่แท็บแสดงอยู่ (กรองเดือนที่แจ้งแล้ว)
 * — โหลดครั้งเดียวจาก `pool` เปลี่ยนเดือนที่แจ้งแล้วตารางตามทันทีโดยไม่ต้องยิงใหม่
 */
export function TraineeDailySection({
  pool,
  people,
  onAlerts,
  toolbarSlot,
}: {
  pool: TraineePerson[];
  /** แถบของหน้าผู้สมัครที่ให้เครื่องมือของตาราง (เดือน · ค้นหา · สาขา · RC Alert · Excel) ไปอยู่ —
      ดู `toolbarSlot` ของ `TraineeMatrix` */
  toolbarSlot?: HTMLElement | null;
  people: TraineePerson[];
  /** จำนวนคนที่วันนี้ขึ้นหัวข้อ Issue — ให้แท็บข้างบนขึ้นป้าย */
  onAlerts?: (count: number) => void;
}) {
  const [reporting, setReporting] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* คนที่ไม่มีรหัสส่ง `rq:<id>` ไปแทน — ได้บันทึกที่ RC กรอกไว้กลับมา */
  const codes = useMemo(
    () => [...new Set(pool.map((p) => p.drivercode || (p.code ? requisitionDailyKey(p.id) : "")).filter(Boolean))].sort().join(","),
    [pool],
  );

  /* ตารางของคนในแท็บนี้เท่านั้น — รหัสที่ซ้ำ/ไม่มีรหัสยังนับเป็นหนึ่งแถวต่อคนเหมือนรายการ */
  const board = useMemo(() => {
    if (!data) return null;
    const byCode = new Map(data.board.drivers.map((d) => [d.drivercode, d]));
    const seen = new Set<string>();
    const drivers = people.flatMap((p) => {
      const found = p.drivercode ? byCode.get(p.drivercode) : undefined;
      if (found && !seen.has(p.drivercode)) {
        seen.add(p.drivercode);
        return [{ ...found, name: found.name || p.name, requisitionId: found.requisitionId || p.id }];
      }
      return [placeholder(p, p.drivercode ? undefined : byCode.get(requisitionDailyKey(p.id)))];
    });
    return { ...data.board, drivers };
  }, [data, people]);

  /* ป้ายแจ้งเตือนบนปุ่ม RC Alert — คนที่วันนี้ขึ้นหัวข้อ Issue (กรอกเองชนะ ATMS แบบเดียวกับรายงาน) */
  const alerts = useMemo(() => {
    if (!data) return 0;
    const today = todayInBangkok();
    return data.board.drivers.filter((d) => {
      const own = d.manualDays[today];
      return issueOf(own?.code || d.days[today] || "", own?.trial === true) !== null;
    }).length;
  }, [data]);

  useEffect(() => {
    onAlerts?.(alerts);
  }, [alerts, onAlerts]);

  async function load(month = "") {
    setError(null);
    try {
      const query = new URLSearchParams({ codes });
      if (month) query.set("m", month);
      setData(await requestJson<Data>(`/api/recruitment/trainee-board?${query}`, {}, "โหลดตารางรายวันไม่สำเร็จ"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดตารางรายวันไม่สำเร็จ");
    }
  }

  /* โหลดตอนเปิดหน้า และโหลดใหม่เมื่อรายชื่อคนฝึกงานเปลี่ยน */
  useEffect(() => {
    let alive = true;
    requestJson<Data>(`/api/recruitment/trainee-board?${new URLSearchParams({ codes })}`, {}, "โหลดตารางรายวันไม่สำเร็จ")
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "โหลดตารางรายวันไม่สำเร็จ");
      });
    return () => {
      alive = false;
    };
  }, [codes]);

  /* แจ้ง RC Alert ส่งไลน์ (Bew 25 ต.ค. → ไอคอนแจ้งเตือน 4 พ.ย. 2569) · ป้ายแดง = Issue วันนี้
     อยู่ท้ายแถบเครื่องมือของตารางรายวัน (5 พ.ย. 2569) */
  const alertButton = (
    <button
      type="button"
      onClick={() => setReporting(true)}
      title={alerts ? `RC Alert ส่งไลน์ · วันนี้มี Issue ${alerts} คน` : "RC Alert ส่งไลน์"}
      className="group relative inline-flex h-9 cursor-pointer items-center gap-2 rounded-full bg-chat pr-4 pl-3 text-12-5 font-semibold text-white shadow-[0_4px_12px_-4px] shadow-chat/60 ring-1 ring-chat/30 transition hover:-translate-y-px hover:shadow-[0_6px_16px_-4px] hover:shadow-chat/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chat"
    >
      <BellRing
        size={16}
        strokeWidth={2}
        aria-hidden
        className={`origin-top ${alerts ? "animate-bell-ring" : "group-hover:animate-bell-ring"}`}
      />
      RC Alert
      {alerts ? (
        <span className="absolute -right-1 -top-1 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-alert px-1 text-10-5 font-semibold leading-none text-white ring-2 ring-base-100">
          {alerts > 99 ? "99+" : alerts}
        </span>
      ) : null}
      <span className="sr-only">{alerts ? ` ส่งไลน์ · Issue วันนี้ ${alerts} คน` : " ส่งไลน์"}</span>
    </button>
  );

  return (
    <section aria-label="สถานะฝึกงานรายวัน" className="flex flex-col gap-3">
      {reporting ? <TraineeReportDialog onClose={() => setReporting(false)} /> : null}

      {error ? (
        <div className="mx-auto max-w-xl py-2">
          <DataError title="โหลดตารางรายวันไม่สำเร็จ" envKey="MONGO_URI" message={error} />
        </div>
      ) : data && board ? (
        <TraineeMatrix
          board={board}
          vehicles={data.vehicles}
          onMonth={load}
          actions={alertButton}
          toolbarSlot={toolbarSlot}
        />
      ) : (
        <p role="status" className="flex items-center gap-2 py-6 text-13 text-mut">
          <Loader2 size={16} strokeWidth={2} aria-hidden className="animate-spin" />
          กำลังโหลด…
        </p>
      )}
    </section>
  );
}
