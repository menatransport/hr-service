"use client";

import { useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";

import { DateField, NumberField, SelectField, TextField, TextareaField } from "@/components/ui/field";
import { ModalShell } from "@/components/ui/modal-shell";
import { requestJson } from "@/lib/http";
import { toastSuccess } from "@/lib/swal";
import { thaiDate } from "@/app/recruitment/_lib/form";
import type { Journey } from "@/app/recruitment/_lib/requisitions/onboarding-store";
import { RepairBadge } from "@/app/recruitment/_components/admin/repair-badge";
import {
  SECTION_SPECS,
  STEP_META,
  fieldApplies,
  trainingDayOn,
  trainingStart,
  type FieldSpec,
  type OnboardingPatch,
  type OnboardingRecord,
  type OnboardingSection,
} from "@/app/recruitment/_lib/requisitions/onboarding";

/**
 * ฟอร์มของ**ฝ่ายเดียว** — * แดง = ช่องที่ทำให้ขั้นนี้เสร็จ (`required` · KA = ครูฝึก + รถ) แต่ไม่บล็อกการบันทึก
 * (แต่ละฝ่ายรู้ข้อมูลไม่พร้อมกัน บันทึกเท่าที่รู้)
 * · ช่องที่มี `when` โผล่เมื่อเงื่อนไขตรง (Co-Driver “อบรม” → วัน/ผล/วิทยากร)
 * · KA เลือกครูฝึก/รถได้ที่นี่ (จุดแก้เดียวของทั้งระบบ) — เลือกครูฝึกแล้วเติมรถประจำของครูฝึกให้ถ้ายังว่าง
 * · ผลสิ้นสุด (ปลด/ลาออก) แก้ไม่ได้ที่นี่ — ทำที่หน้าผู้สมัครของ RC เท่านั้น · ขั้นอื่นระบบคิดเอง
 */
export function OnboardingSectionForm({
  record,
  section,
  journey,
  only,
  title,
  onClose,
  onSaved,
}: {
  record: OnboardingRecord;
  section: OnboardingSection;
  journey: Journey;
  /** แสดงเฉพาะช่องเหล่านี้ (ST ทีละรอบ) — ค่าอื่นของส่วนส่งกลับตามเดิม */
  only?: readonly string[];
  title?: string;
  onClose: () => void;
  onSaved: (next: OnboardingRecord) => void;
}) {
  const meta = STEP_META[section];
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...(record.onboarding[section]?.values ?? {}) }));
  const [drivercode, setDrivercode] = useState(record.drivercode);
  const [trainer, setTrainer] = useState(record.trainer?.drivercode ?? "");
  const [vehicle, setVehicle] = useState(record.vehicle?.code ?? "");
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");

  /* สถานะซ่อมของรถที่เลือกอยู่ — อ่านอย่างเดียวจากบอร์ดซ่อม · ไม่มีป้าย = รถปกติ */
  const plate = journey.vehicles.find((v) => v.value === vehicle)?.plate ?? "";
  const repair = plate ? journey.repairs[plate] : undefined;

  const set = (key: string) => (v: string) => setValues((prev) => ({ ...prev, [key]: v }));
  const start = trainingStart(record);
  /* ST — บอกว่าครั้งนี้ตรงกับวันไหนของการฝึก (คำนวณจากวันเริ่มฝึก) */
  const dayHint = (day: number) => {
    const on = trainingDayOn(start, day);
    return on ? `วันที่ ${day} ของการฝึก · ${thaiDate(on)}` : `วันที่ ${day} ของการฝึก`;
  };

  async function submit() {
    setSaving(true);
    setFailure("");
    const body: OnboardingPatch = { section, values };
    if (section === "rc") body.drivercode = drivercode;
    if (section === "ka") {
      /* ครูฝึกที่นำเข้าโดยไม่มีรหัส (ไม่เจอในทะเบียน) — ไม่ส่ง ไม่งั้นชื่อเดิมจะถูกล้าง */
      if (trainer || record.trainer?.drivercode) body.trainerDrivercode = trainer;
      body.vehicleCode = vehicle;
    }
    try {
      const next = await requestJson<OnboardingRecord>(
        `/api/recruitment/requisitions/${record.id}/onboarding`,
        { method: "PATCH", body: body as unknown as Record<string, unknown> },
        "บันทึกไม่สำเร็จ",
      );
      onSaved(next);
      toastSuccess(`บันทึก ${meta.short} แล้ว`);
      onClose();
    } catch (err) {
      setFailure(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
      setSaving(false);
    }
  }

  function pickTrainer(code: string) {
    setTrainer(code);
    const own = journey.drivers.find((d) => d.value === code)?.vehicle;
    if (own && !vehicle && journey.vehicles.some((v) => v.value === own)) setVehicle(own);
  }

  return (
    <ModalShell
      title={title ?? `${meta.short} · ${meta.title}`}
      subtitle={<span className="font-mono text-12 tracking-wider text-primary">{record.code}</span>}
      onClose={onClose}
      width="640px"
      tone="plain"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-sec px-4 py-2 text-13">
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="btn-pri flex items-center gap-1.5 px-4 py-2 text-13 font-medium disabled:opacity-60"
          >
            {saving ? <Loader2 size={15} className="animate-spin" aria-hidden /> : null}
            บันทึก
          </button>
        </>
      }
    >
      <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
        {section === "rc" ? (
          <TextField id="ob-drivercode" label="รหัส พจส." value={drivercode} onChange={setDrivercode} optional />
        ) : null}

        {section === "ka" ? (
          <>
            <SelectField
              id="ob-trainer"
              label="ครูฝึก"
              value={trainer}
              onChange={pickTrainer}
              options={journey.drivers}
              placeholder={record.trainer && !record.trainer.drivercode ? record.trainer.name : "— เลือก —"}
              searchable
              clearable
              searchPlaceholder="ชื่อ หรือรหัส…"
            />
            <div className="flex flex-col gap-1.5">
              <SelectField
                id="ob-vehicle"
                label="รถ"
                value={vehicle}
                onChange={setVehicle}
                options={journey.vehicles}
                placeholder="— เลือก —"
                searchable
                clearable
                searchPlaceholder="เลขรถ ทะเบียน แพล้นท์…"
              />
              {repair ? (
                <RepairBadge repair={repair} />
              ) : plate ? (
                <p className="text-12 text-primary">ไม่มีงานซ่อมค้าง</p>
              ) : null}
            </div>
          </>
        ) : null}

        {SECTION_SPECS[section].fields
          .filter((field) => !field.readOnly && (only ? only.includes(field.key) : fieldApplies(field, values)))
          .map((field) => (
            <Field
              key={field.key}
              field={field}
              value={values[field.key] ?? ""}
              onChange={set(field.key)}
              suggestions={field.suggest ? (journey.suggestions[field.suggest] ?? []) : []}
              hint={field.day ? dayHint(field.day) : undefined}
            />
          ))}
      </div>

      {failure ? (
        <p role="alert" className="flex items-start gap-2 rounded-field bg-alert/10 px-3 py-2 text-12-5 text-alert">
          <TriangleAlert size={14} strokeWidth={1.9} aria-hidden className="mt-0.5 flex-none" />
          {failure}
        </p>
      ) : null}
    </ModalShell>
  );
}

function Field({
  field,
  value,
  onChange,
  suggestions,
  hint,
}: {
  field: FieldSpec;
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  hint?: string;
}) {
  const id = `ob-${field.key}`;
  const common = { id, label: field.label, hint, optional: !field.required };
  const wide = field.wide || field.kind === "textarea" ? "sm:col-span-2" : "";

  switch (field.kind) {
    case "date":
      return <DateField {...common} value={value} onChange={onChange} className={wide} />;
    case "number":
      return (
        <NumberField
          {...common}
          value={value ? Number(value) : null}
          onChange={(n) => onChange(n === null ? "" : String(n))}
          className={wide}
        />
      );
    case "select":
      return (
        <SelectField
          {...common}
          value={value}
          onChange={onChange}
          options={(field.options ?? []).map((o) => ({ value: o.value, label: o.label }))}
          placeholder="—"
          clearable
          className={wide}
        />
      );
    case "textarea":
      return <TextareaField {...common} value={value} onChange={onChange} rows={6} className={wide} />;
    case "combo":
      return (
        <div className={wide}>
          <TextField {...common} value={value} onChange={onChange} list={`${id}-list`} />
          <datalist id={`${id}-list`}>
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
      );
    default:
      return <TextField {...common} type={field.kind === "tel" ? "tel" : "text"} value={value} onChange={onChange} className={wide} />;
  }
}
