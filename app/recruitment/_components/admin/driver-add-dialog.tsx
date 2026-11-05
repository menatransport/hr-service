"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2, TriangleAlert } from "lucide-react";

import { ModalShell } from "@/components/ui/modal-shell";
import { DateField, SelectField, TextField } from "@/components/ui/field";
import { requestJson } from "@/lib/http";
import { toastSuccess } from "@/lib/swal";
import { DRIVER_BRANCH_OPTIONS, type DriverListRecord } from "@/app/recruitment/_lib/drivers/types";

/**
 * กล่อง “เพิ่ม พจร.” บนหน้าทะเบียน — กรอกเฉพาะที่จำเป็น ไม่ผ่านใบสมัคร (`POST /api/drivers`)
 * · บันทึกแล้วพาไปแท็บเอกสารของหน้าประวัติ อัปโหลดเอกสาร/เติมช่องที่เหลือต่อที่นั่น
 */

/** ลูกค้า/แพล้นท์ที่มีในทะเบียนแล้ว — เลือกจากรายการ สะกดตรงกับตัวกรองบนหน้าทะเบียน */
function choices(values: string[]) {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "th"))
    .map((v) => ({ value: v, label: v }));
}

const today = () => new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);

export function DriverAddDialog({ drivers, onClose }: { drivers: DriverListRecord[]; onClose: () => void }) {
  const router = useRouter();
  const customers = useMemo(() => choices(drivers.map((d) => d.customer ?? "")), [drivers]);
  const plants = useMemo(() => choices(drivers.map((d) => d.plant ?? "")), [drivers]);
  const [form, setForm] = useState({
    drivercode: "",
    driverName: "",
    branch: DRIVER_BRANCH_OPTIONS[0].value,
    startDate: today(),
    phone: "",
    vehicleCode: "",
    customer: "",
    plant: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));
  const ready = form.drivercode.trim() && form.driverName.trim() && form.branch && form.startDate;

  async function save() {
    if (!ready || saving) return;
    setSaving(true);
    setError(null);
    try {
      const { drivercode } = await requestJson<{ drivercode: string }>(
        "/api/drivers",
        { method: "POST", body: form },
        "เพิ่ม พจร. ไม่สำเร็จ",
      );
      void toastSuccess(`เพิ่ม พจร. ${drivercode} แล้ว`, "อัปโหลดเอกสารต่อได้เลย");
      router.push(`/recruitment/admin/drivers/${encodeURIComponent(drivercode)}?tab=docs`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เพิ่ม พจร. ไม่สำเร็จ");
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="เพิ่ม พจร."
      subtitle="กรอกเฉพาะที่จำเป็น — เอกสารอัปโหลดต่อในหน้าประวัติ"
      onClose={onClose}
      width="560px"
      tone="plain"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-sec px-3.5 py-2 text-13">
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!ready || saving}
            className="btn-pri flex items-center gap-1.5 px-3.5 py-2 text-13 font-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 size={15} className="animate-spin" aria-hidden /> : null}
            บันทึก
          </button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
          <TextField id="add-drivercode" label="รหัส พจร." value={form.drivercode} onChange={set("drivercode")} readOnly={saving} />
          <TextField id="add-driverName" label="ชื่อ – สกุล" value={form.driverName} onChange={set("driverName")} readOnly={saving} />
          <SelectField
            id="add-branch"
            label="สาขา"
            options={DRIVER_BRANCH_OPTIONS}
            value={form.branch}
            onChange={set("branch")}
            readOnly={saving}
          />
          <DateField id="add-startDate" label="วันเริ่มงาน" value={form.startDate} onChange={set("startDate")} readOnly={saving} />
          <TextField id="add-phone" label="เบอร์โทรศัพท์" type="tel" value={form.phone} onChange={set("phone")} optional readOnly={saving} />
          <TextField
            id="add-vehicleCode"
            label="เบอร์รถ"
            placeholder="เช่น ME009"
            value={form.vehicleCode}
            onChange={set("vehicleCode")}
            optional
            readOnly={saving}
          />
          <SelectField
            id="add-customer"
            label="ลูกค้า"
            options={customers}
            value={form.customer}
            onChange={set("customer")}
            placeholder="เลือกลูกค้า"
            searchable
            searchPlaceholder="ค้นหาลูกค้า…"
            clearable
            optional
            readOnly={saving}
          />
          <SelectField
            id="add-plant"
            label="แพล้นท์"
            options={plants}
            value={form.plant}
            onChange={set("plant")}
            placeholder="เลือกแพล้นท์"
            searchable
            searchPlaceholder="ค้นหาแพล้นท์…"
            clearable
            optional
            readOnly={saving}
          />
        </div>

        <p className="flex items-center gap-1.5 text-12 text-mut">
          <FileUp size={13} aria-hidden className="flex-none" />
          บันทึกแล้วจะไปหน้าเอกสารของคนนี้ เพื่ออัปโหลดบัตรประชาชน ใบขับขี่ และเอกสารอื่น
        </p>

        {error ? (
          <p role="alert" className="flex items-start gap-2 rounded-box bg-alert-soft px-3 py-2 text-12-5 text-alert">
            <TriangleAlert size={14} aria-hidden className="mt-0.5 flex-none" />
            {error}
          </p>
        ) : null}
        <button type="submit" hidden />
      </form>
    </ModalShell>
  );
}
