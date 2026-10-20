"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";

import { DataError } from "@/components/ui/data-error";
import type { SelectOption } from "@/components/ui/field";
import { requestJson } from "@/lib/http";
import { TraineeMatrix } from "@/app/recruitment/_components/admin/trainee-matrix";
import type { TraineeBoard, TraineeBoardDriver } from "@/app/recruitment/_lib/drivers/trainee-board";
import type { RequisitionVehicle } from "@/app/recruitment/_lib/requisitions/types";

type Data = { board: TraineeBoard; vehicles: SelectOption[] };

/** คนในแท็บ training — ตัวตั้งของตาราง (จำนวนแถว = จำนวนคนในแท็บ) */
export type TraineePerson = {
  id: string;
  code: string;
  name: string;
  drivercode: string;
  vehicle: RequisitionVehicle | null;
};

/** คนที่ยังไม่มีรหัส พจส. — ขึ้นเป็นแถวชื่ออย่างเดียว (ยังไม่มีสถานะรายวัน) */
const placeholder = (p: TraineePerson): TraineeBoardDriver => ({
  drivercode: "",
  name: p.name,
  photoUrl: "",
  siteKey: null,
  plant: "",
  startDateISO: "",
  tenureMonths: null,
  tenureDays: null,
  days: {},
  manualDays: {},
  exitedOn: "",
  exitReason: "",
  requisitionId: p.id,
  requisitionCode: p.code,
  vehicle: p.vehicle,
});

/**
 * ตารางฝึกงานรายวัน ใต้รายการแท็บ training — **ซ่อนไว้ก่อน** และยิงข้อมูลตอนกดเปิดครั้งแรก
 * (ทั้งเดือนหลายร้อยช่อง ไม่ควรโหลดทุกครั้งที่เข้าหน้า) · เปลี่ยนเดือนโหลดใหม่ในที่เดิม
 */
/**
 * `pool` = ทุกคนในขั้นฝึกงาน (ตัวโหลด) · `people` = คนที่แท็บแสดงอยู่ (กรองเดือนที่แจ้งแล้ว)
 * — โหลดครั้งเดียวจาก `pool` เปลี่ยนเดือนที่แจ้งแล้วตารางตามทันทีโดยไม่ต้องยิงใหม่
 */
export function TraineeDailySection({ pool, people }: { pool: TraineePerson[]; people: TraineePerson[] }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  const codes = useMemo(() => [...new Set(pool.map((p) => p.drivercode).filter(Boolean))].sort().join(","), [pool]);

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
      return [placeholder(p)];
    });
    return { ...data.board, drivers };
  }, [data, people]);

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

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !data) void load();
  }

  return (
    <section className="flex flex-col gap-3">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="btn-sec flex w-fit cursor-pointer items-center gap-1.5 px-3.5 py-2 text-13 font-medium hover:text-primary"
      >
        <ChevronDown size={16} strokeWidth={2} aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`} />
        {open ? "ซ่อนตารางรายวัน" : "แสดงตารางรายวัน"}
      </button>

      {open ? (
        error ? (
          <div className="mx-auto max-w-xl py-2">
            <DataError title="โหลดตารางรายวันไม่สำเร็จ" envKey="MONGO_URI" message={error} />
          </div>
        ) : data && board ? (
          <TraineeMatrix board={board} vehicles={data.vehicles} onMonth={load} />
        ) : (
          <p role="status" className="flex items-center gap-2 py-6 text-13 text-mut">
            <Loader2 size={16} strokeWidth={2} aria-hidden className="animate-spin" />
            กำลังโหลด…
          </p>
        )
      ) : null}
    </section>
  );
}
