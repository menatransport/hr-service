"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { CandidatesView } from "@/app/recruitment/_components/admin/candidates-view";
import { RequisitionsView } from "@/app/recruitment/_components/admin/requisitions-view";
import { ADMIN_ROOT } from "@/app/recruitment/_lib/admin-nav";
import type { RequisitionOptions } from "@/app/recruitment/_lib/requisitions/options";
import type { Requisition } from "@/app/recruitment/_lib/requisitions/types";
import type { DocSlot } from "@/app/recruitment/_lib/form";
import type { ApplicationSummary, BlacklistEntry } from "@/app/recruitment/_lib/types";

/**
 * ขอสรรหา กับ ผู้สมัคร — **สองหน้าแยกกัน** (14 ต.ค. 2026) เป็นเมนูย่อยใต้ “พนักงานใหม่”
 *
 * เดิมเป็นหน้าเดียวสองแท็บ (`?tab=`) ตั้งแต่ 22 ก.ย. 2026 — ตอนนี้แต่ละหน้าถือ state
 * ของตัวเอง · สะพานระหว่างสองหน้าคงไว้: กดชื่อผู้สมัครในตารางคำขอแล้วไปหน้าผู้สมัคร
 * พร้อม `?ref=` · ฝั่งผู้สมัครยังผูก/ปลด RQ ได้เอง จึงต้องได้รายการคำขอไปด้วย
 */

export function RequisitionsScreen({
  initialRequisitions,
  options,
}: {
  initialRequisitions: Requisition[];
  options: RequisitionOptions;
}) {
  const router = useRouter();
  const [requisitions, setRequisitions] = useState(initialRequisitions);

  return (
    <RequisitionsView
      title="ขออัตราสรรหาพนักงาน"
      tabs={null}
      rows={requisitions}
      setRows={setRequisitions}
      options={options}
      onOpenCandidate={(ref) =>
        router.push(`${ADMIN_ROOT}/candidates?${new URLSearchParams({ ref })}`)
      }
    />
  );
}

export function CandidatesScreen({
  initialRequisitions,
  initialApplications,
  contactOptions,
  docSlots,
  blacklist,
  initialRef = "",
}: {
  initialRequisitions: Requisition[];
  initialApplications: ApplicationSummary[];
  contactOptions: string[];
  /** ช่องเอกสารพร้อมค่าแสดง/บังคับจาก Section 4 ของคลังคำถาม */
  docSlots: DocSlot[];
  /** ทุกใบที่ติด Blacklist — ตารางผู้สมัครใช้จับชื่อ/เบอร์ของใบที่รอการติดต่อ */
  blacklist: BlacklistEntry[];
  /** เลขที่ใบสมัครจาก `?ref=` — คิวงานหรือตารางคำขอส่งมาเพื่อเปิดตรงที่แถวนั้นเลย */
  initialRef?: string;
}) {
  const [requisitions, setRequisitions] = useState(initialRequisitions);
  const [applications, setApplications] = useState(initialApplications);

  return (
    <CandidatesView
      title="ผู้สมัคร"
      rows={applications}
      setRows={setApplications}
      initialTerm={initialRef}
      contactOptions={contactOptions}
      docSlots={docSlots}
      blacklist={blacklist}
      requisitions={requisitions}
      setRequisitions={setRequisitions}
    />
  );
}
