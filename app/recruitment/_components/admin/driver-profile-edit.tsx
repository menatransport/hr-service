"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, TriangleAlert } from "lucide-react";

import { DateField, SelectField, TextField } from "@/components/ui/field";
import { ModalShell } from "@/components/ui/modal-shell";
import { requestJson } from "@/lib/http";
import {
  DRIVER_BRANCH_OPTIONS,
  DRIVER_EDIT_FIELDS,
  DRIVER_EDIT_GROUPS,
  normalizeDriverEdit,
  OWNER_TYPE_KEYS,
  OWNER_TYPE_LABELS,
  siteLabel,
  type DriverEditField,
  type DriverRecord,
} from "@/app/recruitment/_lib/drivers/types";

/**
 * ปุ่ม “แก้ไข” + กล่องแก้ประวัติ **ของแท็บนั้น** — `scope` เลือกหัวข้อจาก `DRIVER_EDIT_GROUPS`
 * (ข้อมูลทั่วไป = การจ้าง + ติดต่อ · เอกสาร = บัตร + ใบขับขี่ + บัญชี) ช่องเดินจาก `DRIVER_EDIT_FIELDS`
 *
 * ส่งเฉพาะช่องที่เปลี่ยนเป็น `PATCH /api/drivers/{code}` ครั้งเดียว · ตรวจค่าด้วย
 * `normalizeDriverEdit()` ตัวเดียวกับเซิร์ฟเวอร์ก่อนยิง ข้อความจึงขึ้นใต้ช่องทันที
 * · ช่องที่แก้แล้วตัวนำเข้า Excel จะไม่ทับอีก (ดู `updateDriverProfile()`)
 *
 * คนพ้นสภาพแล้ว **ไม่มีช่องข้อมูลส่วนบุคคลในกล่อง** — หน้าประวัติก็ไม่ได้แสดงอยู่แล้ว
 * · ข้อความผิดพลาดขึ้นในกล่อง ไม่เด้ง SweetAlert ทับ (ท่าเดียวกับ `candidate-edit.tsx`)
 */
export function DriverProfileEdit({
  driver,
  scope,
}: {
  driver: DriverRecord;
  scope: EditScope;
}) {
  const [open, setOpen] = useState(false);

  /* คนพ้นสภาพแล้วแท็บเอกสารไม่เหลือช่องให้แก้ — ไม่มีปุ่มดีกว่ามีปุ่มที่เปิดกล่องเปล่า */
  if (!fieldsFor(driver, scope).length) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-sec flex items-center gap-1.5 px-2.5 py-1.5 text-12 transition-colors hover:border-primary/40 hover:text-primary"
      >
        <Pencil size={12} strokeWidth={1.9} aria-hidden />
        แก้ไข
      </button>
      {open ? <EditModal driver={driver} scope={scope} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

type EditScope = (typeof DRIVER_EDIT_GROUPS)[number]["tab"];

const SCOPE_TITLE: Record<EditScope, string> = {
  info: "แก้ไขข้อมูลทั่วไป",
  docs: "แก้ไขเอกสาร",
};

function groupsFor(scope: EditScope) {
  return DRIVER_EDIT_GROUPS.filter((g) => g.tab === scope);
}

function fieldsFor(driver: DriverRecord, scope: EditScope): DriverEditField[] {
  const ids = new Set(groupsFor(scope).map((g) => g.id));
  return DRIVER_EDIT_FIELDS.filter((f) => ids.has(f.group) && (driver.active || !f.personal));
}

/** ค่าตั้งต้นของช่อง — ประเภทพนักงานใช้รหัสที่แปลแล้ว (ค่าดิบบางแถวเป็นข้อความไทย/`1.0`) */
function initialOf(driver: DriverRecord, field: DriverEditField): string {
  if (field.kind === "ownerType") return driver.ownerTypeKey ?? driver.ownerType;
  return String(driver[field.from] ?? "");
}

function EditModal({
  driver,
  scope,
  onClose,
}: {
  driver: DriverRecord;
  scope: EditScope;
  onClose: () => void;
}) {
  const router = useRouter();
  const [fields] = useState(() => fieldsFor(driver, scope));
  const [initial] = useState(() =>
    Object.fromEntries(fields.map((f) => [f.key, initialOf(driver, f)])),
  );
  const [draft, setDraft] = useState<Record<string, string>>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");

  const dirty = fields.some((f) => draft[f.key] !== initial[f.key]);

  function set(key: string, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function save() {
    const patch: Record<string, string> = {};
    const found: Record<string, string> = {};

    for (const field of fields) {
      const value = draft[field.key];
      if (value === initial[field.key]) continue;
      const out = normalizeDriverEdit(field, value);
      if ("error" in out) found[field.key] = out.error;
      else patch[field.key] = out.value;
    }

    if (Object.keys(found).length) {
      setErrors(found);
      setFailure("ยังมีช่องที่กรอกไม่ถูกต้อง — ดูข้อความใต้ช่อง");
      return;
    }
    if (!Object.keys(patch).length) {
      onClose();
      return;
    }

    setSaving(true);
    setFailure("");
    try {
      await requestJson(
        `/api/drivers/${encodeURIComponent(driver.drivercode)}`,
        { method: "PATCH", body: patch },
        "บันทึกประวัติไม่สำเร็จ",
      );
      router.refresh();
      onClose();
    } catch (err) {
      setFailure(err instanceof Error ? err.message : "บันทึกประวัติไม่สำเร็จ");
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title={SCOPE_TITLE[scope]}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <span>{driver.name}</span>
          <span className="font-mono text-11-5 tracking-wider text-primary">{driver.drivercode}</span>
        </span>
      }
      onClose={onClose}
      width="760px"
      tone="plain"
      footer={
        <>
          <span className="mr-auto text-12 text-mut">
            บันทึกผู้แก้และเวลาไว้ · ช่องที่แก้แล้วการนำเข้า Excel รอบหน้าจะไม่ทับ
          </span>
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
            disabled={saving || !dirty}
            className="btn-pri flex items-center gap-2 px-4 py-2.5 text-13 font-medium disabled:opacity-45"
          >
            {saving ? <Loader2 size={14} strokeWidth={2} aria-hidden className="animate-spin" /> : null}
            บันทึกการแก้ไข
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

      {!driver.active && scope === "info" ? (
        <p className="text-12 text-mut">
          พ้นสภาพแล้ว — ช่องข้อมูลส่วนบุคคล (เบอร์ · ผู้ติดต่อฉุกเฉิน) ไม่แสดงและแก้ไม่ได้
        </p>
      ) : null}

      <fieldset disabled={saving} className="flex flex-col gap-6">
        {groupsFor(scope).map((group) => {
          const list = fields.filter((f) => f.group === group.id);
          if (!list.length) return null;
          return (
            <div key={group.id} className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <span className="text-12-5 font-semibold tracking-[0.04em]">{group.title}</span>
                <span aria-hidden className="h-px flex-1 bg-line" />
              </div>
              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                {list.map((field) => (
                  <div key={field.key} className="flex flex-col gap-1">
                    <EditInput
                      field={field}
                      value={draft[field.key] ?? ""}
                      initial={initial[field.key] ?? ""}
                      onChange={(v) => set(field.key, v)}
                    />
                    {errors[field.key] ? (
                      <p className="text-11-5 text-alert">{errors[field.key]}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </fieldset>
    </ModalShell>
  );
}

function EditInput({
  field,
  value,
  initial,
  onChange,
}: {
  field: DriverEditField;
  value: string;
  initial: string;
  onChange: (v: string) => void;
}) {
  const common = {
    id: `driver-edit-${field.key}`,
    label: field.label,
    hint: field.hint,
    optional: !field.required,
  };

  if (field.kind === "date") return <DateField {...common} value={value} onChange={onChange} />;

  if (field.kind === "ownerType") {
    const options: { value: string; label: string }[] = OWNER_TYPE_KEYS.map((k) => ({
      value: k,
      label: OWNER_TYPE_LABELS[k],
    }));
    /* ค่าดิบที่แปลไม่ออกยังต้องเห็นอยู่ ไม่งั้นช่องว่างเหมือนไม่เคยมีค่า */
    if (initial && !options.some((o) => o.value === initial)) options.push({ value: initial, label: initial });
    return <SelectField {...common} value={value} onChange={onChange} options={options} />;
  }

  if (field.kind === "branch") {
    const options = [...DRIVER_BRANCH_OPTIONS];
    if (initial && !options.some((o) => o.value === initial))
      options.push({ value: initial, label: `${siteLabel(initial)} (รหัส ${initial})` });
    return <SelectField {...common} value={value} onChange={onChange} options={options} />;
  }

  return (
    <TextField
      {...common}
      type={field.kind === "phone" ? "tel" : "text"}
      value={value}
      onChange={onChange}
    />
  );
}
