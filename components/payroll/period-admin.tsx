"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, CalendarX, Loader2 } from "lucide-react";

import { periodCode, periodLabel, type PeriodRef } from "@/lib/payroll/period";
import type { PeriodState, PeriodStatus } from "@/lib/payroll/period-state";
import { toastError, toastSuccess } from "@/lib/swal";

/**
 * เปิด/ปิดรอบจ่าย — **สิ่งที่ทำให้เดือนใหม่ไม่ต้องรอ deploy**
 *
 * ของเดิม "รอบไหนเปิด" เป็นค่าคงที่ในโค้ด ทุกเดือนต้องให้คนเขียนโค้ดแก้แล้ว deploy ก่อน
 * ฝ่ายถึงจะส่งของเข้ารอบใหม่ได้ · ตอนนี้ HR กดเองได้ และระบบบันทึกว่าใครเปิด/ปิดเมื่อไหร่
 *
 * **ปุ่มขึ้นเฉพาะคนที่รับเข้ารอบได้** (`canPass`) ฝ่ายอื่นเห็นแค่ป้ายสถานะ — การเปิดรอบ
 * คือการบอกทั้งบริษัทว่าส่งของได้แล้ว ไม่ใช่สิ่งที่ใครกดก็ได้
 */

export function usePeriodStates() {
  const [states, setStates] = useState<PeriodState[]>([]);

  /* ทุก setState อยู่หลัง await — กฎเดียวกับที่หน้าทะเบียนใช้ กันไม่ให้ effect
     เรียก setState แบบ synchronous แล้วเกิด cascading render */
  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/payroll/periods");
      const json = (await res.json().catch(() => ({}))) as { periods?: PeriodState[] };
      if (res.ok && json.periods) setStates(json.periods);
    } catch {
      /* อ่านสถานะรอบไม่ได้ = หน้าจอถอยไปใช้ค่าคงที่ในโค้ดเหมือนเดิม ไม่ต้องโวยกลางหน้า
         เพราะด่านจริงอยู่ที่เซิร์ฟเวอร์ ไม่ใช่ที่ปุ่มบนจอ */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await fetch("/api/payroll/periods").catch(() => null);
      if (!res || !alive) return;
      const json = (await res.json().catch(() => ({}))) as { periods?: PeriodState[] };
      if (alive && res.ok && json.periods) setStates(json.periods);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const statusOf = useCallback(
    (code: string): PeriodStatus | undefined => states.find((s) => s.code === code)?.status,
    [states],
  );

  return { states, statusOf, reload };
}

export function PeriodAdmin({
  period,
  state,
  canPass,
  onChanged,
}: {
  period: PeriodRef;
  state: PeriodState | undefined;
  canPass: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const status: PeriodStatus = state?.status ?? "unopened";
  const code = periodCode(period);

  async function send(action: "open" | "lock") {
    setBusy(true);
    try {
      const res = await fetch("/api/payroll/periods", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ period: code, action }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        void toastError(action === "open" ? "เปิดรอบไม่สำเร็จ" : "ปิดรอบไม่สำเร็จ", json.error ?? "ลองใหม่อีกครั้ง");
        return;
      }
      void toastSuccess(
        action === "open" ? `เปิดรอบ ${periodLabel(period)} แล้ว` : `ปิดรอบ ${periodLabel(period)} แล้ว`,
        action === "open"
          ? "ฝ่ายต่าง ๆ ส่งข้อมูลเข้ารอบนี้ได้แล้ว"
          : "เปิดดูย้อนหลังได้ แต่ส่งของเข้ารอบนี้ไม่ได้อีก",
      );
      onChanged();
    } catch {
      void toastError("เชื่อมต่อระบบไม่ได้", "ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <StatusChip status={status} />

      {state?.openedBy && status === "open" ? (
        <span className="text-11-5 text-mut">
          เปิดโดย {state.openedBy} {when(state.openedAt)}
        </span>
      ) : null}
      {state?.lockedBy && status === "locked" ? (
        <span className="text-11-5 text-mut">
          ปิดโดย {state.lockedBy} {when(state.lockedAt)}
        </span>
      ) : null}

      {canPass ? (
        <span className="ml-auto flex items-center gap-2">
          {busy ? <Loader2 size={13} className="animate-spin text-mut" aria-hidden /> : null}
          {status === "open" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => send("lock")}
              className="flex items-center gap-1 rounded-field border border-line px-2.5 py-1 text-12 text-mut transition-colors hover:border-sla/40 hover:text-sla disabled:opacity-50"
            >
              <CalendarX size={12} aria-hidden />
              ปิดรอบนี้
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => send("open")}
              className="flex items-center gap-1 rounded-field bg-primary px-2.5 py-1 text-12 font-medium text-primary-content disabled:opacity-50"
            >
              <CalendarCheck size={12} aria-hidden />
              {status === "locked" ? "เปิดรอบนี้อีกครั้ง" : "เปิดรอบนี้"}
            </button>
          )}
        </span>
      ) : null}
    </div>
  );
}

const CHIP: Record<PeriodStatus, { label: string; tone: string }> = {
  open: { label: "เปิดรับข้อมูล", tone: "bg-soft text-primary" },
  locked: { label: "ปิดแล้ว", tone: "bg-base-200 text-mut" },
  unopened: { label: "ยังไม่เปิดรับข้อมูล", tone: "bg-warning/15 text-warning" },
};

function StatusChip({ status }: { status: PeriodStatus }) {
  return (
    <span className={`rounded-field px-2 py-0.5 text-12 font-medium ${CHIP[status].tone}`}>
      {CHIP[status].label}
    </span>
  );
}

function when(iso: string | undefined): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
}
