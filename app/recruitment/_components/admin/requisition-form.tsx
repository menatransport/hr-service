"use client";

import { useMemo, useRef, useState } from "react";
import {
  Check,
  CopyCheck,
  GraduationCap,
  Minus,
  Plus,
  Repeat2,
  Sparkles,
  Truck,
  UserRoundPlus,
} from "lucide-react";

import { useDeskIdentity } from "@/components/auth/identity-provider";
import {
  DateField,
  SelectField,
  TextField,
  TextareaField,
  type SelectOption,
} from "@/components/ui/field";
import { ModalShell } from "@/components/ui/modal-shell";
import { requestJson } from "@/lib/http";
import { escapeHtml, runAction } from "@/lib/swal";
import { todayInBangkok } from "@/lib/record-case-flow";
import type {
  RequisitionOptions,
  VehicleOption,
} from "@/app/recruitment/_lib/requisitions/options";
import {
  CUSTOMERS,
  HIRE_TYPES,
  MAX_HEADCOUNT,
  OTHER,
  POSITIONS,
  type HireType,
  type Requisition,
} from "@/app/recruitment/_lib/requisitions/types";
import { RepairBadge } from "@/app/recruitment/_components/admin/repair-badge";

/**
 * ฟอร์มขอสรรหา — **โมดัล ไม่ใช่แถวในตารางและไม่ใช่แผ่นเลื่อน**
 *
 * เลือกโมดัลด้วยเหตุผลสามข้อ:
 * 1. ช่องกลุ่ม “แทนคนเดิม” สองช่องโผล่พร้อมกันตามตัวเลือก — ทำในแถวตารางแล้ว
 *    ความสูงแถวกระตุกทั้งตารางทุกครั้งที่สลับ
 * 2. มีดรอปดาวน์ค้นหาสามตัวที่กางเป็น popover — ซ้อนในแถวที่เลื่อนแนวนอนได้
 *    คือปัญหา z-index/clipping ที่โปรเจกต์นี้เจ็บมาแล้ว (ดูคอมเมนต์ `z-60` ใน `field.tsx`)
 * 3. ระบบมีบรรทัดฐานนี้อยู่แล้วที่ `components/desk/record-case-form.tsx` ซึ่งเขียน
 *    ไว้ตรง ๆ ว่าฟอร์มที่ “ต้องโฟกัสจนจบ” เป็นโมดัล · **ระบบนี้ไม่มีแพตเทิร์น
 *    drawer สำหรับฟอร์มเลย** สร้างใหม่เพื่อหน้าเดียวคือการแตกภาษาของระบบ
 *
 * โครงส่วนต่าง ๆ ลอกจาก `record-case-form.tsx` ทั้งดุ้น (แถบหัวข้อพื้นเทาเต็ม
 * ความกว้าง + `tone="form"`) เพื่อให้ฟอร์มสองใบของระบบอ่านเป็นชุดเดียวกัน
 *
 * **ผู้แจ้งไม่ต้องกรอก** — มาจาก session และขึ้นบนหัวกล่องว่าจะแจ้งในนามใคร
 *
 * **ลำดับช่องตาม “แบบฟอร์มขอสรรหาพจส.ทดแทน” ของ mena-next-lb (ปรับ 14 ต.ค. 2026)**
 * — เริ่มที่ “แทนใคร” แล้วฟอร์มเติมรถประจำของคนนั้น + ลูกค้า/ตำแหน่ง/แพล้นท์ที่อ่าน
 * จาก `fleet` ของรถให้เอง (เติมเฉพาะช่องที่ว่างหรือที่ระบบเติมไว้รอบก่อน — ค่าที่คน
 * เลือกเองไม่ถูกทับ) · ช่องเหตุผลที่ทดแทนของฟอร์มเดิม**ไม่เอากลับมา** (ถอดตามคำสั่ง
 * 29 ก.ย. 2026) · ช่องรายละเอียดกับหมายเหตุรวมเหลือช่องเดียว
 *
 * **อัตราใหม่หลายอัตรา → รถ + ครูฝึกแยกรายอัตรา** (ออกแบบใหม่ 14 ต.ค. 2026) — แถว
 * รถ/ครูฝึกงอกตามจำนวน แต่ละแถวไปลงคำขอใบของตัวเอง (`slots`) · ประเภทการรับกับ
 * ตำแหน่งเป็นการ์ด/ชิปกดได้ ไม่ใช่ดรอปดาวน์
 */
export function RequisitionForm({
  options,
  onClose,
  onCreated,
}: {
  options: RequisitionOptions;
  onClose: () => void;
  /** คำขอที่เพิ่งสร้าง — ตารางเอาไปต่อหัวรายการเองโดยไม่ต้องโหลดหน้าใหม่ */
  onCreated: (created: Requisition[]) => void;
}) {
  const me = useDeskIdentity();

  const [requestedOn, setRequestedOn] = useState(todayInBangkok());
  const [position, setPosition] = useState("");
  const [positionOther, setPositionOther] = useState("");
  const [customer, setCustomer] = useState("");
  const [customerOther, setCustomerOther] = useState("");
  const [plant, setPlant] = useState("");
  const [plantOther, setPlantOther] = useState("");

  const [hireType, setHireType] = useState<HireType>("replace");
  const [replaceDrivercode, setReplaceDrivercode] = useState("");

  /**
   * รถ + ครูฝึก **รายอัตรา** — ความยาวคือจำนวนอัตราเสมอ (แทนคนเดิม = 1)
   * ช่องที่ `i` ไปลงคำขอใบที่ `i` (ดู `slots` ใน `createRequisitions()`)
   */
  const [slots, setSlots] = useState<Slot[]>([EMPTY_SLOT]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const count = slots.length;

  /** เพิ่ม/ลดจำนวน — แถวที่กรอกไว้แล้วอยู่ครบ ตัดเฉพาะแถวท้าย */
  function resize(n: number) {
    const next = Math.min(MAX_HEADCOUNT, Math.max(1, n));
    setSlots((cur) =>
      next <= cur.length
        ? cur.slice(0, next)
        : [...cur, ...Array.from({ length: next - cur.length }, () => EMPTY_SLOT)],
    );
  }

  /**
   * สลับประเภทการรับ = **ล้างค่ากลุ่ม `replace_*` ทิ้งจริง** ไม่ใช่แค่ซ่อน
   *
   * ถ้าซ่อนเฉย ๆ คนที่กรอกชื่อคนที่จะแทนไว้แล้วเปลี่ยนใจเป็น “อัตราใหม่” จะได้
   * เอกสารที่เป็นอัตราใหม่แต่มีชื่อคนที่ถูกแทนติดไปด้วย — เซิร์ฟเวอร์กันไว้อีกชั้น
   * แต่หน้าจอไม่ควรถือค่าที่ผู้ใช้มองไม่เห็นอยู่แต่แรก · แทนคนเดิมเหลือแถวรถแถวเดียว
   */
  function switchHireType(next: HireType) {
    setHireType(next);
    if (next === "new_rate") setReplaceDrivercode("");
    else resize(1);
  }

  function setSlot(i: number, patch: Partial<Slot>) {
    setSlots((cur) => cur.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }

  /**
   * ค่าที่ระบบเติมรอบล่าสุด — เปลี่ยนคนหรือรถแล้วเติมใหม่ได้เฉพาะช่องที่ยังว่าง
   * หรือยังถือค่าที่ระบบเติมไว้ ช่องที่คนเลือกเองไม่ถูกทับ
   */
  const auto = useRef({ customer: "", position: "", plant: "" });
  const autoVehicle = useRef("");
  const [autoFrom, setAutoFrom] = useState("");

  function fillFromVehicle(v: VehicleOption | undefined) {
    const next = {
      customer: v?.customer ?? "",
      position: v?.position ?? "",
      plant: v?.plant ?? "",
    };
    const take = (cur: string, prev: string, val: string, set: (x: string) => void) => {
      if (val && (!cur || cur === prev)) set(val);
    };
    take(customer, auto.current.customer, next.customer, setCustomer);
    take(position, auto.current.position, next.position, setPosition);
    take(plant, auto.current.plant, next.plant, setPlant);
    auto.current = next;
    setAutoFrom(v && (next.customer || next.position || next.plant) ? v.value : "");
  }

  function pickVehicle(i: number, value: string) {
    setSlot(i, { vehicle: value });
    if (value) fillFromVehicle(options.vehicles.find((x) => x.value === value));
  }

  /** เลือกคนที่จะแทน → รถประจำของคนนั้นมาเอง (ถ้าช่องรถยังว่างหรือเป็นรถของคนก่อน) */
  function pickReplace(code: string) {
    setReplaceDrivercode(code);
    const bound = options.drivers.find((d) => d.value === code)?.vehicle ?? "";
    const v = bound
      ? options.vehicles.find((x) => x.value === bound || x.plate === bound)
      : undefined;
    if (v && (!slots[0].vehicle || slots[0].vehicle === autoVehicle.current)) {
      autoVehicle.current = v.value;
      pickVehicle(0, v.value);
    }
  }

  /** ช่องแทนใคร + ครูฝึก: แค่ `รหัส · ชื่อ` — สาขาไม่ช่วยตัดสินใจตรงนี้ ส่วนรถ/ลูกค้าระบบเติมให้อยู่แล้ว */
  const replaceOptions = useMemo(
    () =>
      options.drivers.map((d) => ({
        value: d.value,
        label: `${d.value} · ${d.label.split(" — ")[0]}`,
      })),
    [options.drivers],
  );

  /** ช่องเบอร์รถ: แค่ `เบอร์ · ทะเบียน` — ยี่ห้อ/แพล้นท์รกตา ส่วนแพล้นท์ระบบเติมให้อยู่แล้ว */
  const vehicleOptions = useMemo(
    () =>
      options.vehicles.map((v) => ({
        value: v.value,
        label: v.plate && v.plate !== v.value ? `${v.value} · ${v.plate}` : v.value,
      })),
    [options.vehicles],
  );

  /** ครูฝึกแถวแรก → ทุกแถว (หลายอัตราใช้ครูฝึกคนเดียวกันบ่อย) */
  const firstTrainer = slots[0].trainer;
  const canCopyTrainer =
    count > 1 && Boolean(firstTrainer) && slots.some((s) => s.trainer !== firstTrainer);
  function copyTrainer() {
    setSlots((cur) => cur.map((s) => ({ ...s, trainer: firstTrainer })));
  }

  const plantValue = plant === OTHER ? plantOther.trim() : plant;

  const ready = Boolean(
    requestedOn &&
      position &&
      (position !== OTHER || positionOther.trim()) &&
      customer &&
      (customer !== OTHER || customerOther.trim()) &&
      plantValue &&
      (hireType === "new_rate" || replaceDrivercode),
  );

  const withVehicle = slots.filter((s) => s.vehicle).length;
  const withTrainer = slots.filter((s) => s.trainer).length;

  /** สรุปสิ่งที่กำลังจะบันทึกในกล่องยืนยัน — ทุกค่าที่มาจากผู้ใช้ต้อง `escapeHtml()` */
  function summary(): string {
    const head = [
      [customer === OTHER ? customerOther : customer, plantValue, labelOf(POSITIONS, position) || positionOther]
        .filter(Boolean)
        .join(" · "),
      hireType === "replace"
        ? `แทน ${nameOf(options.drivers, replaceDrivercode)}`
        : `อัตราใหม่ ${count} อัตรา`,
    ];
    const rows = slots.map((s, i) =>
      [
        count > 1 ? `#${i + 1}` : "",
        s.vehicle ? `รถ ${s.vehicle}` : "ยังไม่ระบุรถ",
        s.trainer ? `ครูฝึก ${nameOf(options.drivers, s.trainer)}` : "ยังไม่ระบุครูฝึก",
      ]
        .filter(Boolean)
        .join(" · "),
    );
    return `<div class="hrs-swal-list">${[...head, ...rows].map((l) => escapeHtml(l)).join("<br>")}</div>`;
  }

  async function save() {
    const out = await runAction({
      confirm: {
        title: count > 1 ? `บันทึกคำขอ ${count} อัตรา?` : "บันทึกคำขอสรรหา?",
        html: summary(),
        confirmText: "บันทึก",
      },
      /* ยกธง busy เฉพาะตอนยิงจริง ไม่ใช่ตั้งแต่เปิดกล่องถาม */
      run: async () => {
        setBusy(true);
        try {
          return await requestJson<Requisition[]>(
            "/api/recruitment/requisitions",
            {
              method: "POST",
              body: {
                requestedOn,
                position,
                positionOther: positionOther.trim(),
                customer,
                customerOther: customerOther.trim(),
                plant: plantValue,
                headcount: count,
                hireType,
                replaceDrivercode,
                replaceReasonNote: "",
                slots: slots.map((s) => ({
                  vehicleCode: s.vehicle,
                  trainerDrivercode: s.trainer,
                })),
                note: note.trim(),
              },
            },
            "บันทึกคำขอไม่สำเร็จ",
          );
        } finally {
          setBusy(false);
        }
      },
      pending: "กำลังบันทึก…",
      success: (rows) =>
        rows.length > 1
          ? `บันทึกคำขอ ${rows[0].code} ถึง ${rows[rows.length - 1].code} แล้ว (${rows.length} อัตรา)`
          : `บันทึกคำขอ ${rows[0]?.code ?? ""} แล้ว`,
      failureTitle: "บันทึกคำขอไม่สำเร็จ",
      loud: true,
    });

    /* `cancelled` = ยังไม่ได้ยิงอะไร · `failed` = ยิงแล้วไม่ผ่าน — ทั้งสองแบบ
       ฟอร์มต้องคาอยู่ให้แก้ต่อ ห้ามปิดทิ้งสิ่งที่ผู้ใช้กรอกไว้ */
    if (out.status !== "done") return;
    onCreated(out.data);
    onClose();
  }

  return (
    <ModalShell
      title="ขอสรรหา พจส."
      subtitle={`แจ้งในนาม ${me.name}${me.department ? ` · ${me.department}` : ""}`}
      onClose={onClose}
      width="720px"
      tone="form"
      footer={
        <>
          {count > 1 ? (
            <p className="mr-auto text-12-5 text-mut">
              จะสร้างคำขอ <span className="font-semibold text-ink tabular-nums">{count}</span> ใบ
            </p>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="btn-sec px-3.5 py-2 text-13 text-mut transition-colors hover:text-ink"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!ready || busy}
            className="btn-pri flex items-center gap-2 px-4 py-2 text-13 font-medium disabled:opacity-45"
          >
            <Check size={16} strokeWidth={2} aria-hidden />
            {busy ? "กำลังบันทึก…" : count > 1 ? `บันทึก ${count} คำขอ` : "บันทึกคำขอ"}
          </button>
        </>
      }
    >
      <Section step={1} title="ประเภทการรับ">
        {/* การ์ดกดได้ ไม่ใช่ดรอปดาวน์ — ตัวนี้คุมว่าส่วนอื่นจะหน้าตาแบบไหน ต้องเห็นสถานะตลอด */}
        <div role="radiogroup" aria-label="ประเภทการรับ" className="grid grid-cols-2 gap-2.5">
          {HIRE_TYPES.map((option) => {
            const on = hireType === option.value;
            const Icon = option.value === "replace" ? Repeat2 : UserRoundPlus;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => switchHireType(option.value)}
                className={`flex cursor-pointer items-center gap-3 rounded-box border px-3.5 py-3 text-left transition-colors ${
                  on
                    ? "border-primary/60 bg-primary/8 ring-1 ring-primary/30"
                    : "border-line bg-base-100 hover:border-primary/35"
                }`}
              >
                <span
                  className={`flex size-9 flex-none items-center justify-center rounded-full ${
                    on ? "bg-primary text-primary-content" : "bg-base-200 text-mut"
                  }`}
                >
                  <Icon size={18} strokeWidth={1.9} aria-hidden />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className={`text-13-5 font-semibold ${on ? "text-ink" : "text-mut"}`}>
                    {option.label}
                  </span>
                  <span className="text-11-5 text-mut">
                    {option.value === "replace" ? "1 อัตรา" : `สูงสุด ${MAX_HEADCOUNT} อัตรา`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {hireType === "replace" ? (
          <SelectField
            id="rq-replace-who"
            label="พจส. ที่จะแทน"
            hint="เลือกแล้วระบบเติมรถ ลูกค้า ตำแหน่ง และแพล้นท์ให้"
            placeholder="ค้นรหัสหรือชื่อ พจส…"
            value={replaceDrivercode}
            onChange={pickReplace}
            options={replaceOptions}
            searchable
            searchPlaceholder="ค้นรหัสหรือชื่อ…"
          />
        ) : (
          <Stepper value={count} onChange={resize} />
        )}
      </Section>

      <Section step={2} title="อัตรา">
        {autoFrom ? (
          <p className="-mb-1 flex items-center gap-1.5 text-12 text-primary">
            <Sparkles size={14} aria-hidden />
            เติมจากรถ {autoFrom} ให้แล้ว — แก้ได้
          </p>
        ) : null}

        {/* ตำแหน่งมีสี่ตัว — โชว์ครบเป็นชิป กดครั้งเดียวจบ ไม่ต้องกางดรอปดาวน์ */}
        <div className="flex flex-col gap-1.5">
          <span id="rq-position-label" className="text-12-5 font-medium text-mut">
            ตำแหน่ง
            <span aria-hidden className="font-normal text-alert">
              {" "}
              *
            </span>
          </span>
          <div role="radiogroup" aria-labelledby="rq-position-label" className="flex flex-wrap gap-2">
            {POSITIONS.map((p) => {
              const on = position === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setPosition(p.value)}
                  className={`min-w-16 cursor-pointer rounded-full border px-4 py-1.5 text-13 transition-colors ${
                    on
                      ? "border-primary bg-primary font-medium text-primary-content"
                      : "border-line bg-base-100 text-ink hover:border-primary/40"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          {position === OTHER ? (
            <TextField
              id="rq-position-other"
              label="ระบุตำแหน่ง"
              srLabel
              placeholder="ระบุตำแหน่ง…"
              value={positionOther}
              onChange={setPositionOther}
              className="mt-1 sm:max-w-[16rem]"
            />
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <SelectField
              id="rq-customer"
              label="ลูกค้า"
              placeholder="เลือก…"
              value={customer}
              onChange={setCustomer}
              options={customerOptions}
            />
            {customer === OTHER ? (
              <TextField
                id="rq-customer-other"
                label="ระบุชื่อลูกค้า"
                srLabel
                placeholder="ระบุชื่อลูกค้า…"
                value={customerOther}
                onChange={setCustomerOther}
              />
            ) : null}
          </div>
          {/* แพล้นท์มาจากที่ที่มีจริงในทะเบียนรถ แต่**พิมพ์เองได้** เพราะแพล้นท์
              เปิดใหม่จะยังไม่มีรถประจำจนกว่า ETL จะ sync */}
          <div className="flex flex-col gap-2">
            <SelectField
              id="rq-plant"
              label="แพล้นท์"
              placeholder="เลือก…"
              value={plant}
              onChange={setPlant}
              options={plantOptions(options)}
              searchable
              searchPlaceholder="ค้นชื่อแพล้นท์…"
            />
            {plant === OTHER ? (
              <TextField
                id="rq-plant-other"
                label="ระบุชื่อแพล้นท์"
                srLabel
                placeholder="ระบุชื่อแพล้นท์…"
                value={plantOther}
                onChange={setPlantOther}
              />
            ) : null}
          </div>
          <DateField
            id="rq-date"
            label="วันที่แจ้งสรรหา"
            value={requestedOn}
            onChange={setRequestedOn}
          />
        </div>
      </Section>

      <Section
        step={3}
        title={count > 1 ? `รถและครูฝึก · ${count} อัตรา` : "รถและครูฝึก"}
        right={
          <span className="flex items-center gap-3 tabular-nums">
            <span className="flex items-center gap-1" title="ระบุรถแล้ว">
              <Truck size={13} aria-hidden />
              {withVehicle}/{count}
            </span>
            <span className="flex items-center gap-1" title="ระบุครูฝึกแล้ว">
              <GraduationCap size={14} aria-hidden />
              {withTrainer}/{count}
            </span>
          </span>
        }
      >
        <ol className="flex flex-col gap-2.5">
          {slots.map((slot, i) => (
            <SlotRow
              key={i}
              index={i}
              multi={count > 1}
              slot={slot}
              options={options}
              vehicleOptions={vehicleOptions}
              trainerOptions={replaceOptions}
              taken={slots.filter((_, j) => j !== i).map((s) => s.vehicle)}
              onVehicle={(v) => pickVehicle(i, v)}
              onTrainer={(t) => setSlot(i, { trainer: t })}
            />
          ))}
        </ol>
        {canCopyTrainer ? (
          <button
            type="button"
            onClick={copyTrainer}
            className="btn-ghost -mt-1 flex w-fit items-center gap-1.5 px-2.5 py-1.5 text-12-5 text-primary"
          >
            <CopyCheck size={14} aria-hidden />
            ใช้ครูฝึกอัตรา 1 กับทุกอัตรา
          </button>
        ) : null}
      </Section>

      <Section step={4} title="หมายเหตุ" last>
        <TextareaField
          id="rq-note"
          label="หมายเหตุ"
          srLabel
          optional
          placeholder="บริบทที่คนรับเรื่องต่อควรรู้ (ถ้ามี)"
          rows={2}
          value={note}
          onChange={setNote}
        />
      </Section>
    </ModalShell>
  );
}

interface Slot {
  vehicle: string;
  trainer: string;
}

const EMPTY_SLOT: Slot = { vehicle: "", trainer: "" };

/** จำนวนอัตรา — ปุ่มลบ/บวกในช่วง 1–`MAX_HEADCOUNT` พิมพ์ผิดเป็นศูนย์หรือร้อยไม่ได้ */
function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const btn =
    "flex size-9 cursor-pointer items-center justify-center rounded-full border border-line bg-base-100 text-ink transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-35";
  return (
    <div className="flex items-center justify-between gap-4 rounded-box border border-line bg-base-200/50 px-3.5 py-2.5">
      <span className="flex flex-col">
        <span className="text-12-5 font-medium text-mut">จำนวนอัตรา</span>
        <span className="text-11-5 text-mut">แยกเป็นคำขอละ 1 อัตรา</span>
      </span>
      <div role="group" aria-label="จำนวนอัตรา" className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="ลดจำนวน"
          disabled={value <= 1}
          onClick={() => onChange(value - 1)}
          className={btn}
        >
          <Minus size={16} strokeWidth={2.2} aria-hidden />
        </button>
        <output
          aria-live="polite"
          className="w-10 text-center text-[22px] leading-none font-semibold text-primary tabular-nums"
        >
          {value}
        </output>
        <button
          type="button"
          aria-label="เพิ่มจำนวน"
          disabled={value >= MAX_HEADCOUNT}
          onClick={() => onChange(value + 1)}
          className={btn}
        >
          <Plus size={16} strokeWidth={2.2} aria-hidden />
        </button>
      </div>
    </div>
  );
}

/**
 * รถ + ครูฝึกของอัตราหนึ่งแถว — รถที่แถวอื่นเลือกไปแล้วไม่โผล่ในรายการ
 * (เซิร์ฟเวอร์กันซ้ำอีกชั้นใน `readSlots()`)
 */
function SlotRow({
  index,
  multi,
  slot,
  options,
  vehicleOptions,
  trainerOptions,
  taken,
  onVehicle,
  onTrainer,
}: {
  index: number;
  multi: boolean;
  slot: Slot;
  options: RequisitionOptions;
  vehicleOptions: SelectOption[];
  trainerOptions: SelectOption[];
  taken: string[];
  onVehicle: (v: string) => void;
  onTrainer: (t: string) => void;
}) {
  const vehicles = taken.some(Boolean)
    ? vehicleOptions.filter((v) => !taken.includes(v.value))
    : vehicleOptions;
  const plate = options.vehicles.find((v) => v.value === slot.vehicle)?.plate ?? "";
  /* สถานะซ่อมจากบอร์ดซ่อม — อ่านอย่างเดียว ไม่บันทึกลงคำขอ · ไม่มีป้าย = รถปกติ */
  const repair = plate ? options.repairs[plate] : undefined;
  const done = Boolean(slot.vehicle && slot.trainer);
  const n = index + 1;

  return (
    <li
      className={`flex gap-3 ${
        multi ? "rounded-box border border-line bg-base-100 py-3 pr-3.5 pl-3" : ""
      }`}
    >
      {multi ? (
        <span
          aria-hidden
          className={`mt-6.5 flex size-7 flex-none items-center justify-center rounded-full text-12 font-semibold tabular-nums ${
            done ? "bg-primary text-primary-content" : "bg-base-200 text-mut"
          }`}
        >
          {done ? <Check size={14} strokeWidth={2.4} /> : n}
        </span>
      ) : null}
      <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <SelectField
            id={`rq-vehicle-${index}`}
            label={multi ? `เบอร์รถ · อัตรา ${n}` : "เบอร์รถ"}
            optional
            placeholder="ค้นเลขรถหรือทะเบียน…"
            value={slot.vehicle}
            onChange={onVehicle}
            options={vehicles}
            searchable
            clearable
            searchPlaceholder="ค้นเลขรถหรือทะเบียน…"
          />
          {repair ? <RepairBadge repair={repair} /> : null}
        </div>
        <SelectField
          id={`rq-trainer-${index}`}
          label={multi ? `ครูฝึก · อัตรา ${n}` : "ครูฝึก"}
          optional
          placeholder="ค้นชื่อหรือรหัส พจส…"
          value={slot.trainer}
          onChange={onTrainer}
          options={trainerOptions}
          searchable
          clearable
          searchPlaceholder="ค้นรหัสหรือชื่อ…"
        />
      </div>
    </li>
  );
}

/** ส่วนหนึ่งของฟอร์ม — แถบหัวข้อทรงเดียวกับฟอร์มบันทึกเคส + เลขลำดับขั้น */
function Section({
  step,
  title,
  right,
  last = false,
  children,
}: {
  step: number;
  title: string;
  right?: React.ReactNode;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={last ? "" : "border-b border-line"}>
      <h3 className="flex items-center gap-2 border-b border-line bg-base-200 px-5 py-2 text-12 font-semibold text-ink">
        <span className="flex size-5 flex-none items-center justify-center rounded-full bg-primary/12 text-11 text-primary tabular-nums">
          {step}
        </span>
        {title}
        {right ? <span className="ml-auto text-11-5 font-medium text-mut">{right}</span> : null}
      </h3>
      <div className="flex flex-col gap-4 px-5 py-4">{children}</div>
    </section>
  );
}

const customerOptions: SelectOption[] = [
  ...CUSTOMERS.map((c) => ({ value: c, label: c })),
  { value: OTHER, label: "อื่นๆ (ระบุเอง)" },
];

function plantOptions(options: RequisitionOptions): SelectOption[] {
  return [...options.plants, { value: OTHER, label: "ระบุเอง…" }];
}

const labelOf = (
  list: readonly { value: string; label: string }[],
  value: string,
): string => list.find((o) => o.value === value)?.label ?? "";

/** ชื่อคนจากป้ายในดรอปดาวน์ (`ชื่อ — รหัส · สาขา`) — เอาไปขึ้นในกล่องยืนยัน */
const nameOf = (list: { value: string; label: string }[], value: string): string =>
  list.find((o) => o.value === value)?.label.split(" — ")[0] ?? value;
