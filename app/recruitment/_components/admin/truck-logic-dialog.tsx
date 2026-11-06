"use client";

import { useState } from "react";
import { ChevronDown, Workflow } from "lucide-react";

import { ModalShell } from "@/components/ui/modal-shell";
import type { TruckBoard } from "@/app/recruitment/_lib/drivers/truck-status";

/**
 * “Logic” ของหน้าสถานะรถ — บอกแค่ว่าแต่ละสถานะดึงจากไหน + ส่วน dev (ซ่อนไว้) (Bew 6 พ.ย. 2569)
 * เนื้อหาต้องตรงกับ `truck-status.ts` / `fleet-current.ts` / `repair-status.ts` — แก้ logic ที่ไหน แก้ข้อความนี้ด้วย
 */

const SOURCES: { name: string; from: string[] }[] = [
  { name: "สถานะรถ", from: ["ATMS วิ่งรถรายวัน"] },
  { name: "สถานะซ่อม", from: ["MenaNext บอร์ดรถซ่อม"] },
  { name: "สถานะคน", from: ["ATMS วิ่งรถรายวัน", "ข้อมูลสรรหา จากระบบนี้"] },
];

/** dbflow สำหรับ dev — แหล่ง → ใช้ทำอะไร (อ่านอย่างเดียวทั้งหมด) */
const DEV_FLOW: { src: string; use: string }[] = [
  {
    src: "Boom_ETL.vehicles",
    use: "รายชื่อรถ: active · branch=ลาดกระบัง · co_owner_type ∈ รถมีนา/รถบริหารฟลีท/รถร่วมมีนา · ตัดหาง/รถขาย ฯลฯ",
  },
  {
    src: "atms.vehicle_daily_asia",
    use: "คนขับของคัน + รหัสวันนี้ (field คนขับ) · แถวล่าสุดต่อทะเบียน · ไม่มีแถวเกิน 30 วัน = ไม่แสดง",
  },
  { src: "Boom_ETL.employee_work_status", use: "รหัสวันนี้สำรอง (months.YYYY-MM.DD) เมื่อ vehicle_daily ยังไม่ลงวันนี้" },
  {
    src: "ATMS fleet/current (fastapinextjs)",
    use: "status_id 2/4/5 = B · อ · PM สด → ตัดสินรถซ่อม",
  },
  {
    src: "Boom_ETL.repair_board → maintenance_request",
    use: "ขั้นซ่อม + กำหนดเสร็จ · fallback ตัดสินซ่อมเมื่ออ่าน ATMS ไม่ได้",
  },
  {
    src: "hr_service.recruitment_requests + onboarding",
    use: "JR ที่ผูกรถ → pipelineOf() · รอสรรหา/รอฝึกงาน = รถรอสรรหา",
  },
  { src: "hr_service.master_driver", use: "เบอร์โทรคนขับ (ทะเบียน พจส.)" },
];

const DEV_ORDER = "รถรอสรรหา → รถซ่อม → ไม่มีคนขับ (รวม ลอ/ปอ) → คนขับไม่มา (ลา/หยุด/ตกคิว) → พร้อมวิ่ง";

export function TruckLogicButton({ board }: { board: TruckBoard }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-ghost flex items-center gap-1.5 px-2 py-1 text-12-5"
      >
        <Workflow size={14} strokeWidth={1.8} aria-hidden />
        Logic
      </button>
      {open ? <TruckLogicDialog board={board} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function TruckLogicDialog({ board, onClose }: { board: TruckBoard; onClose: () => void }) {
  const [dev, setDev] = useState(false);
  return (
    <ModalShell title="Logic สถานะรถ" subtitle="แต่ละสถานะดึงข้อมูลจากไหน" onClose={onClose} width="640px">
      <section className="rounded-box border border-line bg-base-100 p-4">
        <table className="w-full text-12-5">
          <tbody>
            {SOURCES.map((s) => (
              <tr key={s.name} className="border-b border-line align-top last:border-0">
                <td className="w-28 py-2 pr-3 font-semibold whitespace-nowrap text-ink">{s.name}</td>
                <td className="py-2">
                  {s.from.map((f, i) => (
                    <span key={f}>
                      {i ? <span className="text-mut"> และ </span> : null}
                      {f}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <button
        type="button"
        onClick={() => setDev((v) => !v)}
        aria-expanded={dev}
        className="btn-ghost flex items-center gap-1.5 self-start px-2 py-1 text-12 text-mut"
      >
        <ChevronDown size={14} strokeWidth={1.8} aria-hidden className={dev ? "rotate-180" : ""} />
        {dev ? "ซ่อน" : "ดู"} Technical (dev)
      </button>

      {dev ? (
        <section className="rounded-box border border-line bg-base-200/40 p-4 text-12">
          <h3 className="mb-2 text-12-5 font-semibold text-ink">DB flow · อ่านอย่างเดียว · getTruckBoard()</h3>
          <ul className="space-y-1.5">
            {DEV_FLOW.map((d) => (
              <li key={d.src} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                <code className="flex-none font-mono text-11 text-primary sm:w-64">{d.src}</code>
                <span>{d.use}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3">
            <b className="text-ink">ลำดับตัดสิน</b> (ข้อแรกที่เข้า): {DEV_ORDER}
          </p>
          <p className="mt-1 text-mut">
            join คีย์ ทะเบียน หรือ เบอร์รถ · คอลัมน์สถานะรถ = car (ไม่ดู JR) · ATMS ยังไม่มีคนขับแต่มีคนฝึกงาน = พร้อมวิ่ง ·
            ตัดขั้นซ่อม “รถรอขาย”
            {board.repairSource === "atms" ? "" : " · ตอนนี้อ่าน ATMS ไม่ได้ ใช้บอร์ดซ่อมแทนชั่วคราว"}
          </p>
          <p className="mt-1 font-mono text-11 text-mut">
            truck-status.ts · fleet-current.ts · repair-status.ts · onboarding-store.ts
          </p>
        </section>
      ) : null}
    </ModalShell>
  );
}
