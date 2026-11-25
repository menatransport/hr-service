"use client";

import { useState } from "react";
import { MessagesSquare } from "lucide-react";

import { useCanSee } from "@/components/auth/menu-access-provider";
import { ExitInterviewDrawer } from "@/app/recruitment/_components/admin/exit-interview-drawer";
import { EXIT_INTERVIEW_MENU } from "@/app/recruitment/_lib/exit-interview/types";
import type { DriverListRecord } from "@/app/recruitment/_lib/drivers/types";

/**
 * ปุ่มเปิดลิ้นชัก Exit Interview บนหน้าประวัติรายคน — ขึ้นเฉพาะคนพ้นสภาพแบบ `resign` + สิทธิ์ `exit-interview`
 * (ในตารางทะเบียนเปิดจากชิปในคอลัมน์ “สาเหตุการออก” แทน)
 */
export function ExitInterviewButton({ driver }: { driver: Pick<DriverListRecord, "drivercode" | "active" | "resignation"> }) {
  const can = useCanSee(EXIT_INTERVIEW_MENU);
  const [open, setOpen] = useState(false);
  if (!can || driver.active || driver.resignation?.kind !== "resign") return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-sec flex cursor-pointer items-center gap-1.5 px-3 py-1.5 text-12-5 transition-colors hover:border-primary/40 hover:text-primary"
      >
        <MessagesSquare size={14} aria-hidden />
        Exit Interview
      </button>
      {open ? <ExitInterviewDrawer drivercode={driver.drivercode} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
