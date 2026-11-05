"use client";

import { useState } from "react";
import { Workflow } from "lucide-react";

import { ModalShell } from "@/components/ui/modal-shell";
import type { TruckBoard } from "@/app/recruitment/_lib/drivers/truck-status";

/**
 * “Logic” ของหน้าสถานะรถ — ข้อมูลมาจากไหน ตัดสินสถานะอย่างไร (Bew 5 พ.ย. 2569)
 * เนื้อหาต้องตรงกับ `truck-status.ts` / `fleet-current.ts` / `repair-status.ts` — แก้ logic ที่ไหน แก้ข้อความนี้ด้วย
 */

const SOURCES: { name: string; from: string; when: string }[] = [
  { name: "รถ", from: "Boom_ETL.vehicles (ดึงจาก ATMS)", when: "วันละรอบ ~09:00" },
  { name: "คนขับประจำรถ", from: "ทะเบียน พจส. (Boom_ETL.main_driver + ค่าที่ HR แก้เอง)", when: "วันละรอบ ~15:00" },
  { name: "สถานะงานวันนี้", from: "Boom_ETL.employee_work_status (ไฟล์ Excel สถานะงาน)", when: "นำเข้าเป็นรอบ" },
  { name: "รถซ่อม", from: "ATMS fleet/current สด — สถานะ B/BA · อ · PM", when: "ทุกครั้งที่เปิดหน้า (จำไว้ 1 นาที)" },
  { name: "ขั้นซ่อม / กำหนดเสร็จ", from: "บอร์ดซ่อม Boom_ETL.repair_board + ใบแจ้งซ่อม", when: "หลายรอบต่อวัน" },
];

const STEPS: { label: string; rule: string }[] = [
  { label: "รถซ่อม", rule: "ATMS บอกว่าหยุดวิ่ง (B/BA รถซ่อม · อ รถจอดอุบัติเหตุ · PM) — ไม่ดูคนขับ" },
  { label: "ไม่มีคนขับ", rule: "ไม่มี พจส. ที่ยังทำงานประจำคันนี้ (คนที่วันนี้เป็น ลอ/ปอ ไม่นับ)" },
  { label: "คนขับไม่มา", rule: "มีคนขับ แต่วันนี้ทุกคนเป็นรหัสลา/หยุด/ตกคิว" },
  { label: "พร้อมวิ่ง", rule: "มีคนขับที่วันนี้ทำงาน (A…/ฝ) หรือยังไม่มีบันทึกของวันนี้" },
];

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-box border border-line bg-base-100 p-4">
      <h3 className="mb-2.5 text-13 font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

function TruckLogicDialog({ board, onClose }: { board: TruckBoard; onClose: () => void }) {
  return (
    <ModalShell
      title="Logic สถานะรถ"
      subtitle="ข้อมูลมาจากไหน และตัดสินสถานะแต่ละคันอย่างไร"
      onClose={onClose}
      width="720px"
    >
      <Section title="1. แหล่งข้อมูล">
        <div className="overflow-x-auto">
          <table className="w-full text-12-5">
            <thead className="text-left text-mut">
              <tr>
                <th className="py-1.5 pr-3 font-medium">ข้อมูล</th>
                <th className="py-1.5 pr-3 font-medium">มาจาก</th>
                <th className="py-1.5 font-medium">อัปเดต</th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.map((s) => (
                <tr key={s.name} className="border-t border-line align-top">
                  <td className="py-1.5 pr-3 font-medium whitespace-nowrap text-ink">{s.name}</td>
                  <td className="py-1.5 pr-3">{s.from}</td>
                  <td className="py-1.5 whitespace-nowrap text-mut">{s.when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-12 text-mut">
          อ่านอย่างเดียวทั้งหมด แก้ข้อมูลจากหน้านี้ไม่ได้ ·{" "}
          {board.repairSource === "atms"
            ? "ตอนนี้อ่าน ATMS ได้ปกติ"
            : "ตอนนี้อ่าน ATMS ไม่ได้ — รถซ่อมใช้ใบที่ค้างบนบอร์ดซ่อมแทนชั่วคราว"}
        </p>
      </Section>

      <Section title="2. รถที่นับ">
        <ul className="list-disc space-y-1 pl-5 text-12-5">
          <li>รถที่ active และเป็นรถมีนา · รถบริหารฟลีท · รถร่วมมีนา (พจร.)</li>
          <li>ไม่นับ: หาง · กล้วยหอม · รถหลอก · รถสำนักงาน · ตัดยาง · ลูกค้ารถขาย · รถที่ขั้นซ่อม “รถรอขาย” · รถร่วมภายนอก</li>
        </ul>
      </Section>

      <Section title="3. ตัดสินสถานะ (ข้อแรกที่เข้า = สถานะของคัน)">
        <ol className="space-y-1.5 text-12-5">
          {STEPS.map((s, i) => (
            <li key={s.label} className="flex gap-2.5">
              <span className="flex size-5 flex-none items-center justify-center rounded-full bg-primary/10 font-mono text-11 text-primary">
                {i + 1}
              </span>
              <span>
                <b className="text-ink">{s.label}</b> — {s.rule}
              </span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="4. รถซ่อม = บอร์ดซ่อมของ Mena-Next">
        <ul className="list-disc space-y-1 pl-5 text-12-5">
          <li>
            ใช้กติกาเดียวกับบอร์ดรถค้างซ่อมของ Mena-Next (<span className="font-mono">/inspection/bymaintenance</span>):
            รายชื่อรถบนบอร์ดมาจาก ATMS สถานะ B/BA · อ · PM
          </li>
          <li>
            <b className="text-ink">ไม่อยู่บนบอร์ด = พร้อมใช้งาน</b> จนกว่า ATMS จะเปลี่ยนสถานะเป็นซ่อม ถึงจะมีใบแจ้งซ่อมค้างก็ตาม
            (เช่น ME059 ใบ LBMR26100408 ยังไม่ปิด แต่ ATMS = รถว่าง)
          </li>
          <li>ใบแจ้งซ่อมใช้บอกแค่ขั้นซ่อม · กำหนดเสร็จ · หมายเหตุ ของคันที่อยู่บนบอร์ด</li>
          <li>หน้าติดตามพนักงานใหม่ (สถานะรถ พร้อมใช้งาน / ยังไม่พร้อมใช้งาน) ใช้กติกาเดียวกันนี้</li>
        </ul>
      </Section>
    </ModalShell>
  );
}
