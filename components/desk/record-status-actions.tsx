"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCcw, X } from "lucide-react";

import { requestJson } from "@/lib/http";
import { escapeHtml, runAction } from "@/lib/swal";
import {
  nextStatuses,
  recordStatusMeta,
  type RecordCase,
  type RecordStatus,
} from "@/lib/record-case-flow";

/**
 * การเปลี่ยนสถานะบันทึกเคส **ที่เดียวของทั้งระบบ**
 *
 * ตอนนี้มีสองที่ที่กดได้ — ปุ่มด่วนในแถวตาราง กับปุ่มท้ายกล่องรายละเอียด — ถ้าปล่อยให้
 * ต่างคนต่างเรียก `PATCH` เอง กล่องยืนยัน/ข้อความสำเร็จ/การ refresh จะเพี้ยนกันเงียบ ๆ
 * จึงรวมไว้ในฮุกตัวเดียว (กฎเดียวกับที่ `lib/case-filter.ts` รวมเงื่อนไขกรองของคำร้อง)
 */

type IconType = React.ComponentType<{
  size?: number;
  strokeWidth?: number;
  className?: string;
}>;

/** ไอคอนประจำ “การกระทำ” ไม่ใช่ประจำสถานะ — ✓ ปิดงาน · ✕ ยกเลิก · ↺ เปิดใหม่ */
export const statusActionIcon: Record<RecordStatus, IconType> = {
  pending: RotateCcw,
  completed: Check,
  rejected: X,
};

/**
 * โทนปุ่ม — ปุ่มเดียวที่ทึบคือ “อนุมัติเสร็จสิ้น” เพราะเป็นทางที่เคสส่วนใหญ่เดินไป
 * ที่เหลือเป็นเส้นขอบ ตาจะได้วิ่งไปหาปุ่มหลักก่อนโดยไม่ต้องอ่านครบทุกปุ่ม
 */
export const statusActionTone: Record<RecordStatus, string> = {
  completed: "btn-pri border border-transparent",
  rejected: "border border-alert/35 text-alert hover:bg-alert/10",
  pending: "border border-line text-mut hover:border-ink/30 hover:text-ink",
};

export function useRecordStatusChange() {
  const router = useRouter();
  /** รหัสเคสที่กำลังยิงอยู่ — ปุ่มของแถวอื่นไม่ต้องถูกล็อกไปด้วย */
  const [busyId, setBusyId] = useState<string | null>(null);

  /**
   * คืน `true` เมื่อเปลี่ยนสถานะสำเร็จจริงเท่านั้น — ผู้เรียกใช้ค่านี้ตัดสินใจว่าจะ
   * ล้างช่องหมายเหตุ/ปิดกล่องไหม (`false` = ยกเลิกหรือพัง ห้ามทำเหมือนสำเร็จ)
   */
  async function change(
    record: RecordCase,
    to: RecordStatus,
    note?: string,
  ): Promise<boolean> {
    const meta = recordStatusMeta[to];
    const trimmed = (note ?? "").trim();

    const out = await runAction({
      confirm: {
        title: `${meta.action}?`,
        html: `<div class="hrs-swal-list">${escapeHtml(record.code)} · ${escapeHtml(
          record.title,
        )}</div>${trimmed ? `<div class="hrs-swal-quote">${escapeHtml(trimmed)}</div>` : ""}`,
        confirmText: meta.action,
        tone: to === "rejected" ? "danger" : "primary",
      },
      run: async () => {
        setBusyId(record.id);
        try {
          return await requestJson<RecordCase>(
            `/api/record-cases/${record.id}`,
            { method: "PATCH", body: { status: to, note: trimmed || null } },
            "เปลี่ยนสถานะไม่สำเร็จ",
          );
        } finally {
          setBusyId(null);
        }
      },
      pending: "กำลังเปลี่ยนสถานะ…",
      success: `${record.code} → “${meta.label}”`,
      failureTitle: "เปลี่ยนสถานะไม่สำเร็จ",
    });

    if (out.status !== "done") return false;
    /* อ่านค่าที่บันทึกจริงกลับมาจากเซิร์ฟเวอร์ ไม่เดาเอง — หน้าจอจะได้ไม่โกหก */
    router.refresh();
    return true;
  }

  return { change, busyId };
}

/**
 * ปุ่มด่วนประจำแถวตาราง — ไอคอนล้วน กดจบในคลิกเดียว (+ กล่องยืนยัน)
 * ไม่มีช่องหมายเหตุตรงนี้โดยตั้งใจ: อยากเขียนเหตุผลให้เปิดกล่องรายละเอียด
 */
export function QuickStatusActions({
  record,
  busy,
  onChange,
}: {
  record: RecordCase;
  busy: boolean;
  onChange: (to: RecordStatus) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      {nextStatuses(record.status).map((to) => {
        const Icon = statusActionIcon[to];
        const meta = recordStatusMeta[to];
        return (
          <button
            key={to}
            type="button"
            disabled={busy}
            title={`${meta.action} · ${record.code}`}
            aria-label={`${meta.action} ${record.code}`}
            onClick={(e) => {
              // ปุ่มในแถวต้องไม่พาไปเปิดกล่องรายละเอียด
              e.stopPropagation();
              onChange(to);
            }}
            className={`flex size-7 flex-none cursor-pointer items-center justify-center rounded-selector transition-colors disabled:pointer-events-none disabled:opacity-40 ${
              to === "completed"
                ? "text-mut/70 hover:bg-primary/12 hover:text-primary"
                : to === "rejected"
                  ? "text-mut/70 hover:bg-alert/10 hover:text-alert"
                  : "text-mut/70 hover:bg-base-300/60 hover:text-ink"
            }`}
          >
            <Icon size={15} strokeWidth={2} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
