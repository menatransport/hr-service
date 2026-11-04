"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, Lock, TriangleAlert } from "lucide-react";

import { DateField, SelectField, TextField, TextareaField, type SelectOption } from "@/components/ui/field";
import { requestJson } from "@/lib/http";
import { toastSuccess } from "@/lib/swal";
import { thaiDate } from "@/app/recruitment/_lib/form";
import type { RequisitionOptions } from "@/app/recruitment/_lib/requisitions/options";
import {
  SECTION_SPECS,
  fieldApplies,
  type FieldSpec,
  type OnboardingPatch,
  type OnboardingRecord,
  type OnboardingSection,
} from "@/app/recruitment/_lib/requisitions/onboarding";
import {
  BRANCHES,
  CUSTOMERS,
  HIRE_TYPES,
  OTHER,
  POSITIONS,
  isMixerBranch,
  type Requisition,
  type RequisitionDetails,
} from "@/app/recruitment/_lib/requisitions/types";
import { RepairBadge } from "@/app/recruitment/_components/admin/repair-badge";

/**
 * แก้คำขอสรรหา + KA ในการ์ดของ dialog รายคน — ช่องอยู่ตำแหน่งเดียวกับตอนดู กดแก้ไขแล้วกลายเป็น input
 * (Bew 4 พ.ย. 2569: ไม่เปิดโมดัลซ้อน ไม่ใช้โครงฟอร์มเพิ่มอัตรา)
 * · คำขอ + ครูฝึก/รถ → `PATCH …/[id]` `{ details }` · มีผู้ฝึกงานแล้ว: Co-Driver (ka) + ส่งมอบรถ (handover)
 *   → `PATCH …/[id]/onboarding` ทีละส่วนเฉพาะส่วนที่เปลี่ยน (ส่งมอบรถย้ายมารวมการ์ดนี้ · Bew 4 พ.ย. 2569)
 * · วันที่แจ้ง + ผู้แจ้ง แก้ไม่ได้ (ล็อก)
 */

const editable = (section: OnboardingSection) => SECTION_SPECS[section].fields.filter((f) => !f.byUser && !f.readOnly);
const KA_FIELDS = editable("ka");
const HANDOVER_FIELDS = editable("handover");
const changed = (fields: FieldSpec[], next: Record<string, string>, before: Record<string, string>) =>
  fields.some((f) => (next[f.key] ?? "") !== (before[f.key] ?? ""));

export function RequestKaEditor({
  record,
  person,
  options,
  onCancel,
  onSaved,
}: {
  record: OnboardingRecord;
  /** มีผู้ฝึกงานผูกแล้ว — มีช่อง Co-Driver */
  person: boolean;
  options: RequisitionOptions;
  onCancel: () => void;
  onSaved: (next: OnboardingRecord) => void;
}) {
  const plantListed = !record.plant || options.plants.some((o) => o.value === record.plant);

  const [hireType, setHireType] = useState<string>(record.hireType);
  const [replace, setReplace] = useState(record.replace?.drivercode ?? "");
  const [branch, setBranch] = useState(record.branch);
  const [customer, setCustomer] = useState(record.customer);
  const [customerOther, setCustomerOther] = useState(record.customerOther);
  const [plant, setPlant] = useState(plantListed ? record.plant : OTHER);
  const [plantOther, setPlantOther] = useState(plantListed ? "" : record.plant);
  const [position, setPosition] = useState<string>(record.position);
  const [positionOther, setPositionOther] = useState(record.positionOther);
  const [trainer, setTrainer] = useState(record.trainer?.drivercode ?? "");
  const [vehicle, setVehicle] = useState(record.vehicle?.code ?? "");
  const [note, setNote] = useState(record.note);
  const kaBefore = record.onboarding.ka?.values ?? {};
  const [ka, setKa] = useState<Record<string, string>>(kaBefore);
  const hoBefore = record.onboarding.handover?.values ?? {};
  const [ho, setHo] = useState<Record<string, string>>(hoBefore);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");

  const mixer = isMixerBranch(branch);

  /* คนเดิม/รถเดิมที่ไม่อยู่ในรายการแล้ว (พ้นสภาพ · ขายรถ) — ยังต้องโชว์ในช่อง */
  const people = useMemo<SelectOption[]>(() => {
    const list = options.drivers.map((d) => ({ value: d.value, label: `${d.value} · ${d.label.split(" — ")[0]}` }));
    for (const p of [record.replace, record.trainer])
      if (p?.drivercode && !list.some((o) => o.value === p.drivercode))
        list.push({ value: p.drivercode, label: `${p.drivercode} · ${p.name}` });
    return list;
  }, [options.drivers, record.replace, record.trainer]);

  const vehicles = useMemo<SelectOption[]>(() => {
    const list = options.vehicles.map((v) => ({
      value: v.value,
      label: v.plate && v.plate !== v.value ? `${v.value} · ${v.plate}` : v.value,
    }));
    const own = record.vehicle;
    if (own?.code && !list.some((o) => o.value === own.code))
      list.push({ value: own.code, label: own.plateNo ? `${own.code} · ${own.plateNo}` : own.code });
    return list;
  }, [options.vehicles, record.vehicle]);

  const customers = useMemo<SelectOption[]>(() => {
    const list: SelectOption[] = mixer
      ? [...CUSTOMERS.map((c) => ({ value: c, label: c })), { value: OTHER, label: "อื่นๆ (ระบุเอง)" }]
      : (options.branchCustomers[branch] ?? []).map((c) => ({ value: c, label: c }));
    if (record.customer && record.customer !== OTHER && !list.some((o) => o.value === record.customer))
      list.unshift({ value: record.customer, label: record.customer });
    return list;
  }, [mixer, branch, options.branchCustomers, record.customer]);

  const hireTypes = useMemo<SelectOption[]>(
    () => [
      ...HIRE_TYPES.map((h) => ({ value: h.value, label: h.label })),
      ...(record.hireType === "unspecified" ? [{ value: "unspecified", label: "ไม่ระบุ" }] : []),
    ],
    [record.hireType],
  );

  const plantValue = plant === OTHER ? plantOther.trim() : plant;
  const plate = options.vehicles.find((v) => v.value === vehicle)?.plate || record.vehicle?.plateNo || "";
  const repair = plate ? options.repairs[plate] : undefined;

  /** สลับสาขา — สระบุรี/บางปะกงไม่มีตำแหน่ง/แพล้นท์ ล้างทิ้งจริง · ลูกค้าที่ไม่อยู่ในรายชื่อสาขาใหม่ถูกล้าง */
  function pickBranch(next: string) {
    setBranch(next);
    if (isMixerBranch(next)) {
      if (customer && customer !== OTHER && !(CUSTOMERS as readonly string[]).includes(customer)) setCustomer("");
      return;
    }
    setPosition("");
    setPositionOther("");
    setPlant("");
    setPlantOther("");
    setCustomerOther("");
    const list = options.branchCustomers[next] ?? [];
    setCustomer(list.length === 1 ? list[0] : list.includes(customer) ? customer : "");
  }

  async function save() {
    setSaving(true);
    setFailure("");
    try {
      const updated = await requestJson<Requisition>(
        `/api/recruitment/requisitions/${record.id}`,
        {
          method: "PATCH",
          body: {
            details: {
              branch,
              position,
              positionOther: positionOther.trim(),
              customer: customer.trim(),
              customerOther: customerOther.trim(),
              plant: plantValue,
              hireType,
              replaceDrivercode: hireType === "replace" ? replace : "",
              vehicleCode: vehicle,
              trainerDrivercode: trainer,
              note: note.trim(),
            } satisfies RequisitionDetails,
          },
        },
        "บันทึกไม่สำเร็จ",
      );
      let next: OnboardingRecord = { ...record, ...updated };
      /* ส่วนของฝ่ายที่เปลี่ยน — บันทึกต่อทีละส่วน (ไม่ส่งครูฝึก/รถ ลงไปกับคำขอแล้ว) */
      const sections: [OnboardingSection, Record<string, string>, string][] = [];
      if (person && changed(KA_FIELDS, ka, kaBefore)) sections.push(["ka", ka, "บันทึก Co-Driver ไม่สำเร็จ"]);
      if (person && changed(HANDOVER_FIELDS, ho, hoBefore)) sections.push(["handover", ho, "บันทึกส่งมอบรถไม่สำเร็จ"]);
      for (const [section, values, failText] of sections) {
        next = await requestJson<OnboardingRecord>(
          `/api/recruitment/requisitions/${record.id}/onboarding`,
          {
            method: "PATCH",
            body: { section, values } satisfies OnboardingPatch as unknown as Record<string, unknown>,
          },
          failText,
        );
      }
      onSaved(next);
      toastSuccess(`บันทึก ${record.code} แล้ว`);
      onCancel();
    } catch (err) {
      setFailure(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3.5">
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-4">
        <ReadOnly label="วันที่แจ้ง" lock>
          {thaiDate(record.requestedOn)}
        </ReadOnly>
        <SelectField id="rk-hire" label="ประเภท" value={hireType} onChange={setHireType} options={hireTypes} />
        <SelectField
          id="rk-branch"
          label="สาขา"
          value={branch}
          onChange={pickBranch}
          options={BRANCHES.map((b) => ({ value: b, label: b }))}
          placeholder="เลือก…"
        />
        <ReadOnly label="ผู้แจ้ง">{record.requester.name || "—"}</ReadOnly>

        {hireType === "replace" ? (
          <SelectField
            id="rk-replace"
            label="พจส. ที่จะแทน"
            value={replace}
            onChange={setReplace}
            options={people}
            placeholder="ค้นรหัสหรือชื่อ…"
            searchable
            searchPlaceholder="ค้นรหัสหรือชื่อ…"
            className="sm:col-span-2"
          />
        ) : null}

        <div className={`flex flex-col gap-2 ${hireType === "replace" ? "sm:col-span-2" : ""}`}>
          {customers.length || mixer ? (
            <SelectField
              id="rk-customer"
              label="ลูกค้า"
              value={customer}
              onChange={setCustomer}
              options={customers}
              placeholder="เลือก…"
              searchable
              searchPlaceholder="ค้นชื่อลูกค้า…"
            />
          ) : (
            /* อ่านรายชื่อลูกค้าจาก NCAC ไม่ได้ — พิมพ์เอง (เซิร์ฟเวอร์รับชื่อเมื่อ NCAC ล่ม) */
            <TextField id="rk-customer" label="ลูกค้า" value={customer} onChange={setCustomer} />
          )}
          {customer === OTHER ? (
            <TextField id="rk-customer-other" label="ระบุชื่อลูกค้า" srLabel placeholder="ระบุชื่อลูกค้า…" value={customerOther} onChange={setCustomerOther} />
          ) : null}
        </div>
        {mixer ? (
          <div className="flex flex-col gap-2">
            <SelectField
              id="rk-plant"
              label="แพล้นท์"
              value={plant}
              onChange={setPlant}
              options={[...options.plants, { value: OTHER, label: "ระบุเอง…" }]}
              placeholder="เลือก…"
              searchable
              searchPlaceholder="ค้นชื่อแพล้นท์…"
            />
            {plant === OTHER ? (
              <TextField id="rk-plant-other" label="ระบุชื่อแพล้นท์" srLabel placeholder="ระบุชื่อแพล้นท์…" value={plantOther} onChange={setPlantOther} />
            ) : null}
          </div>
        ) : null}
        {mixer ? (
          <div className="flex flex-col gap-2">
            <SelectField
              id="rk-position"
              label="ตำแหน่ง"
              value={position}
              onChange={setPosition}
              options={POSITIONS.map((p) => ({ value: p.value, label: p.label }))}
              placeholder="เลือก…"
            />
            {position === OTHER ? (
              <TextField id="rk-position-other" label="ระบุตำแหน่ง" srLabel placeholder="ระบุตำแหน่ง…" value={positionOther} onChange={setPositionOther} />
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid gap-x-4 gap-y-3 border-t border-line pt-3 sm:grid-cols-4">
        <SelectField
          id="rk-trainer"
          label="ครูฝึก"
          optional
          value={trainer}
          onChange={setTrainer}
          options={people}
          placeholder={record.trainer && !record.trainer.drivercode ? record.trainer.name : "ค้นชื่อหรือรหัส…"}
          searchable
          clearable
          searchPlaceholder="ค้นรหัสหรือชื่อ…"
          className="sm:col-span-2"
        />
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <SelectField
            id="rk-vehicle"
            label="เบอร์รถ"
            optional
            value={vehicle}
            onChange={setVehicle}
            options={vehicles}
            placeholder="ค้นเลขรถหรือทะเบียน…"
            searchable
            clearable
            searchPlaceholder="ค้นเลขรถหรือทะเบียน…"
          />
          {repair ? <RepairBadge repair={repair} /> : null}
        </div>

        {person
          ? KA_FIELDS.filter((f) => fieldApplies(f, ka)).map((f) => (
              <SpecInput key={f.key} field={f} values={ka} onChange={setKa} />
            ))
          : null}
      </div>

      <TextareaField id="rk-note" label="หมายเหตุคำขอ" optional rows={2} value={note} onChange={setNote} />

      {person ? (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <h4 className="text-12-5 font-semibold">ส่งมอบรถ</h4>
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-3">
            {HANDOVER_FIELDS.filter((f) => fieldApplies(f, ho)).map((f) => (
              <SpecInput key={f.key} field={f} values={ho} onChange={setHo} />
            ))}
          </div>
        </div>
      ) : null}

      {failure ? (
        <p role="alert" className="flex items-start gap-2 rounded-field bg-alert/10 px-3 py-2 text-12-5 text-alert">
          <TriangleAlert size={14} strokeWidth={1.9} aria-hidden className="mt-0.5 flex-none" />
          {failure}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={saving} className="btn-sec px-3.5 py-1.5 text-13">
          ยกเลิก
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="btn-pri flex items-center gap-1.5 px-4 py-1.5 text-13 font-medium disabled:opacity-60"
        >
          {saving ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Check size={15} strokeWidth={2} aria-hidden />}
          บันทึก
        </button>
      </div>
    </div>
  );
}

/** ช่องตาม `SECTION_SPECS` (Co-Driver · ส่งมอบรถ) — ทรงเดียวกับช่องอื่นในการ์ด */
function SpecInput({
  field: f,
  values,
  onChange,
}: {
  field: FieldSpec;
  values: Record<string, string>;
  onChange: (update: (prev: Record<string, string>) => Record<string, string>) => void;
}) {
  const set = (v: string) => onChange((prev) => ({ ...prev, [f.key]: v }));
  const common = { id: `rk-${f.key}`, label: f.label, optional: !f.required, value: values[f.key] ?? "", onChange: set };
  if (f.kind === "date") return <DateField {...common} />;
  if (f.kind === "select")
    return (
      <SelectField
        {...common}
        options={(f.options ?? []).map((o) => ({ value: o.value, label: o.label }))}
        placeholder="—"
        clearable
      />
    );
  if (f.kind === "textarea") return <TextareaField {...common} rows={2} className="sm:col-span-3" />;
  return <TextField {...common} />;
}

/** ช่องที่แก้ไม่ได้ — ความสูงเท่าช่อง input ข้าง ๆ */
function ReadOnly({ label, lock, children }: { label: string; lock?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="flex items-center gap-1 text-12-5 font-medium text-mut">
        {label}
        {lock ? <Lock size={11} strokeWidth={2.2} aria-label="แก้ไม่ได้" /> : null}
      </span>
      <span className="py-2 text-13">{children}</span>
    </div>
  );
}
