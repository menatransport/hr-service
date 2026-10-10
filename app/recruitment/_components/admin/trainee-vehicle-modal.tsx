"use client";

import { useState } from "react";
import { Check, Loader2, TriangleAlert } from "lucide-react";

import { SelectField, type SelectOption } from "@/components/ui/field";
import { ModalShell } from "@/components/ui/modal-shell";
import { requestJson } from "@/lib/http";
import type { Requisition } from "@/app/recruitment/_lib/requisitions/types";

/**
 * ผูกทะเบียนรถให้ พจส. ที่กำลังฝึกงาน — เปิดจากไอคอนรถบนแถวของหน้าติดตามฝึกงาน
 *
 * แก้ **คำขอสรรหาที่ผูก `drivercode` นี้ไว้** (`recruitment_requests.vehicle`) ไม่ใช่
 * ฟิลด์ใหม่ — ยิง `PATCH /api/recruitment/requisitions/{id}` เส้นเดียวกับที่หน้า
 * ขอสรรหาเคยใช้ตอนยังมีไอคอนดินสอ (ถอดออกไปแล้ว 22 ก.ย. 2026 เพราะย้ายจุดกรอก
 * ทะเบียนรถมาไว้ที่นี่แทน — ไม่บังคับกรอกตอนสร้างคำขอ กรอกเมื่อไหร่ก็ได้ตอนที่คน
 * คนนั้นเริ่มฝึกงานแล้ว) ผลคือตารางขอสรรหาเห็นค่าเดียวกันทันทีที่โหลดใหม่
 */
export function TraineeVehicleModal({
  driverName,
  drivercode,
  requisitionId,
  requisitionCode,
  vehicleCode,
  vehicles,
  onClose,
  onSaved,
}: {
  driverName: string;
  drivercode: string;
  requisitionId: string;
  requisitionCode: string;
  /** รหัสรถปัจจุบัน (ถ้ามี) — ค่าเริ่มต้นของช่องเลือก */
  vehicleCode: string;
  vehicles: SelectOption[];
  onClose: () => void;
  /** รถหลังบันทึก — `null` = ถอดรถออก */
  onSaved: (vehicle: Requisition["vehicle"]) => void;
}) {
  const [value, setValue] = useState(vehicleCode);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");

  async function save() {
    setSaving(true);
    setFailure("");
    try {
      const updated = await requestJson<Requisition>(
        `/api/recruitment/requisitions/${requisitionId}`,
        { method: "PATCH", body: { vehicleCode: value || null } },
        "บันทึกทะเบียนรถไม่สำเร็จ",
      );
      onSaved(updated.vehicle);
      onClose();
    } catch (err) {
      setFailure(err instanceof Error ? err.message : "บันทึกทะเบียนรถไม่สำเร็จ");
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="ทะเบียนรถ"
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <span>{driverName}</span>
          <span className="font-mono text-11-5 tracking-wider text-primary">{drivercode}</span>
          {requisitionCode ? <span>· {requisitionCode}</span> : null}
        </span>
      }
      onClose={onClose}
      width="440px"
      tone="plain"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="btn-sec px-3.5 py-2.5 text-13 transition-colors hover:border-primary/40 disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="btn-pri flex items-center gap-2 px-4 py-2.5 text-13 font-medium disabled:opacity-45"
          >
            {saving ? (
              <Loader2 size={14} strokeWidth={2} aria-hidden className="animate-spin" />
            ) : (
              <Check size={14} strokeWidth={2} aria-hidden />
            )}
            บันทึก
          </button>
        </>
      }
    >
      {failure ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-field bg-alert/10 px-3 py-2.5 text-12-5 text-alert"
        >
          <TriangleAlert size={14} strokeWidth={2} aria-hidden className="mt-0.5 flex-none" />
          {failure}
        </p>
      ) : null}

      {/* ไม่บังคับกรอกโดยตั้งใจ — ปล่อยว่างแล้วมาผูกทีหลังได้เสมอ */}
      <SelectField
        id="tv-vehicle"
        label="รถที่ให้ขับ"
        optional
        clearable
        searchable
        readOnly={saving}
        placeholder="ค้นเลขรถหรือทะเบียน…"
        searchPlaceholder="ค้นเลขรถ ทะเบียน หรือแพล้นท์…"
        value={value}
        onChange={setValue}
        options={vehicles}
      />
    </ModalShell>
  );
}
