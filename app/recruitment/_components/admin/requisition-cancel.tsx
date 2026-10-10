"use client";

import { useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";

import { SelectField } from "@/components/ui/field";
import { ModalShell } from "@/components/ui/modal-shell";
import { requestJson } from "@/lib/http";
import {
  CANCEL_REASONS,
  type CancelReason,
  type Requisition,
} from "@/app/recruitment/_lib/requisitions/types";

/**
 * ยกเลิกคำขอ — โมดัลเปิดจากไอคอนถังขยะในตาราง
 *
 * **ไม่มีปุ่มลบจริงในระบบนี้โดยตั้งใจ** (ดู `.claude/docs/requisitions.md`) — ยกเลิก
 * ต้องมีเหตุผลเสมอเพราะ “เดือนนี้ยกเลิกไปกี่อัตรา เพราะอะไร” เป็นตัวเลขที่ต้องรวมยอดได้
 * โมดัลนี้จึงเป็นทั้งกล่องยืนยันและกล่องเลือกเหตุผลในใบเดียว ไม่ต้องถามซ้ำสองรอบ
 */
export function RequisitionCancelModal({
  row,
  onClose,
  onCancelled,
}: {
  row: Requisition;
  onClose: () => void;
  /** คำขอหลังยกเลิก — เอาไปแทนแถวเดิมในตาราง */
  onCancelled: (updated: Requisition) => void;
}) {
  const [reason, setReason] = useState<CancelReason | "">("");
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");

  async function submit() {
    if (!reason) return;
    setSaving(true);
    setFailure("");
    try {
      const updated = await requestJson<Requisition>(
        `/api/recruitment/requisitions/${row.id}`,
        { method: "PATCH", body: { status: "cancelled", cancelReason: reason } },
        "ยกเลิกคำขอไม่สำเร็จ",
      );
      onCancelled(updated);
      onClose();
    } catch (err) {
      setFailure(err instanceof Error ? err.message : "ยกเลิกคำขอไม่สำเร็จ");
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="ยกเลิกคำขอ"
      subtitle={<span className="font-mono text-12 tracking-wider text-primary">{row.code}</span>}
      onClose={onClose}
      width="440px"
      tone="plain"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="btn-sec px-3.5 py-2.5 text-13 text-mut transition-colors hover:text-ink disabled:opacity-50"
          >
            ไม่ยกเลิก
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || !reason}
            className="btn-danger flex items-center gap-2 px-4 py-2.5 text-13 font-medium disabled:opacity-45"
          >
            {saving ? <Loader2 size={14} strokeWidth={2} aria-hidden className="animate-spin" /> : null}
            ยกเลิกคำขอ
          </button>
        </>
      }
    >
      <p className="flex items-start gap-2 rounded-field bg-sla/10 px-3 py-2.5 text-12-5 text-sla">
        <TriangleAlert size={14} strokeWidth={1.8} aria-hidden className="mt-0.5 flex-none" />
        อัตรานี้จะถูกปิด และผู้สมัครที่ผูกไว้ (ถ้ามี) จะยังคงอยู่กับคำขอเพื่อเป็นประวัติ —
        เปิดรับอีกครั้งได้ภายหลัง
      </p>

      {failure ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-field bg-alert/10 px-3 py-2.5 text-12-5 text-alert"
        >
          <TriangleAlert size={14} strokeWidth={2} aria-hidden className="mt-0.5 flex-none" />
          {failure}
        </p>
      ) : null}

      <SelectField
        id="rqc-reason"
        label="เหตุผลที่ยกเลิก"
        placeholder="เลือกเหตุผล…"
        value={reason}
        onChange={(v) => setReason(v as CancelReason)}
        options={CANCEL_REASONS.map((r) => ({ value: r.value, label: r.label }))}
        readOnly={saving}
      />
    </ModalShell>
  );
}
