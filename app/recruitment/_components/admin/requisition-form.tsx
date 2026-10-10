"use client";

import { useState } from "react";
import { Check } from "lucide-react";

import { useDeskIdentity } from "@/components/auth/identity-provider";
import {
  DateField,
  NumberField,
  SelectField,
  TextField,
  TextareaField,
  type SelectOption,
} from "@/components/ui/field";
import { ModalShell } from "@/components/ui/modal-shell";
import { requestJson } from "@/lib/http";
import { escapeHtml, runAction } from "@/lib/swal";
import { todayInBangkok } from "@/lib/record-case-flow";
import type { RequisitionOptions } from "@/app/recruitment/_lib/requisitions/options";
import {
  CUSTOMERS,
  HIRE_TYPES,
  OTHER,
  POSITIONS,
  type HireType,
  type Requisition,
} from "@/app/recruitment/_lib/requisitions/types";

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
  const [headcount, setHeadcount] = useState<number | null>(1);

  const [hireType, setHireType] = useState<HireType>("replace");
  const [replaceDrivercode, setReplaceDrivercode] = useState("");
  const [replaceReasonNote, setReplaceReasonNote] = useState("");

  const [vehicleCode, setVehicleCode] = useState("");
  const [trainerDrivercode, setTrainerDrivercode] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  /**
   * สลับประเภทการรับ = **ล้างค่ากลุ่ม `replace_*` ทิ้งจริง** ไม่ใช่แค่ซ่อน
   *
   * ถ้าซ่อนเฉย ๆ คนที่กรอกชื่อคนที่จะแทนไว้แล้วเปลี่ยนใจเป็น “อัตราใหม่” จะได้
   * เอกสารที่เป็นอัตราใหม่แต่มีชื่อคนที่ถูกแทนติดไปด้วย — เซิร์ฟเวอร์กันไว้อีกชั้น
   * แต่หน้าจอไม่ควรถือค่าที่ผู้ใช้มองไม่เห็นอยู่แต่แรก
   */
  function switchHireType(next: HireType) {
    setHireType(next);
    if (next === "new_rate") {
      setReplaceDrivercode("");
      setReplaceReasonNote("");
    }
  }

  const plantValue = plant === OTHER ? plantOther.trim() : plant;

  const ready = Boolean(
    requestedOn &&
      position &&
      (position !== OTHER || positionOther.trim()) &&
      customer &&
      (customer !== OTHER || customerOther.trim()) &&
      plantValue &&
      headcount &&
      headcount >= 1 &&
      (hireType === "new_rate" || replaceDrivercode),
  );

  const count = headcount ?? 1;

  /** สรุปสิ่งที่กำลังจะบันทึกในกล่องยืนยัน — ทุกค่าที่มาจากผู้ใช้ต้อง `escapeHtml()` */
  function summary(): string {
    const lines = [
      [customer === OTHER ? customerOther : customer, plantValue, labelOf(POSITIONS, position) || positionOther]
        .filter(Boolean)
        .join(" · "),
      hireType === "replace"
        ? `แทน ${nameOf(options.drivers, replaceDrivercode)}`
        : "อัตราใหม่",
      trainerDrivercode ? `ครูฝึก ${nameOf(options.drivers, trainerDrivercode)}` : "",
      count > 1 ? `${count} อัตรา — จะสร้างคำขอแยกใบให้ ${count} ใบ` : "",
    ].filter(Boolean);

    return `<div class="hrs-swal-list">${lines.map((l) => escapeHtml(l)).join("<br>")}</div>`;
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
                replaceReasonNote: replaceReasonNote.trim(),
                vehicleCode,
                trainerDrivercode,
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
      title="ขอสรรหาอัตราใหม่"
      subtitle={`แจ้งในนาม ${me.name}${me.department ? ` · ${me.department}` : ""}`}
      onClose={onClose}
      width="680px"
      tone="form"
      footer={
        <>
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
            {busy ? "กำลังบันทึก…" : "บันทึกคำขอ"}
          </button>
        </>
      }
    >
      <Section title="รายละเอียดอัตรา">
        <div className="grid gap-4 sm:grid-cols-2">
          <DateField
            id="rq-date"
            label="วันที่แจ้งสรรหา"
            value={requestedOn}
            onChange={setRequestedOn}
          />
          <SelectField
            id="rq-position"
            label="ตำแหน่ง"
            placeholder="เลือกตำแหน่ง…"
            value={position}
            onChange={setPosition}
            options={POSITIONS.map((p) => ({ value: p.value, label: p.label }))}
          />
          {position === OTHER ? (
            <TextField
              id="rq-position-other"
              label="ระบุตำแหน่ง"
              value={positionOther}
              onChange={setPositionOther}
              className="sm:col-span-2"
            />
          ) : null}

          <SelectField
            id="rq-customer"
            label="ลูกค้า"
            placeholder="เลือกลูกค้า…"
            value={customer}
            onChange={setCustomer}
            options={customerOptions}
          />
          {/* แพล้นท์มาจากที่ที่มีจริงในทะเบียนรถ แต่**พิมพ์เองได้** เพราะแพล้นท์
              เปิดใหม่จะยังไม่มีรถประจำจนกว่า ETL จะ sync — ถ้าบังคับให้เลือก
              จากรายการ คำขอของแพล้นท์ใหม่จะแจ้งไม่ได้เลย */}
          <SelectField
            id="rq-plant"
            label="แพล้นท์"
            placeholder="เลือกแพล้นท์…"
            value={plant}
            onChange={setPlant}
            options={plantOptions(options)}
            searchable
            searchPlaceholder="ค้นชื่อแพล้นท์…"
          />
          {customer === OTHER ? (
            <TextField
              id="rq-customer-other"
              label="ระบุชื่อลูกค้า"
              value={customerOther}
              onChange={setCustomerOther}
            />
          ) : null}
          {plant === OTHER ? (
            <TextField
              id="rq-plant-other"
              label="ระบุชื่อแพล้นท์"
              value={plantOther}
              onChange={setPlantOther}
            />
          ) : null}

          <NumberField
            id="rq-headcount"
            label="จำนวนอัตรา"
            hint="มากกว่า 1 จะสร้างคำขอแยกใบให้อัตโนมัติ ใบละหนึ่งอัตรา"
            value={headcount}
            onChange={setHeadcount}
            className="sm:col-span-2"
          />
        </div>
      </Section>

      <Section title="เหตุผลของอัตรานี้">
        {/* สองตัวเลือกไม่ควรเป็นดรอปดาวน์ — มันซ่อนตัวเลือกที่เหลือทั้งที่มีแค่ตัวเดียว
            และตัวนี้เป็นสวิตช์ที่คุมว่าอีกสองช่องจะโผล่ไหม ต้องเห็นสถานะตลอดเวลา */}
        <div className="flex flex-col gap-1.5">
          <span className="text-12-5 font-medium text-mut">
            ประเภทการรับ
            <span aria-hidden className="font-normal text-alert"> *</span>
          </span>
          <div
            role="group"
            aria-label="ประเภทการรับ"
            className="flex w-fit gap-1 rounded-full border border-line bg-base-100 p-1"
          >
            {HIRE_TYPES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => switchHireType(option.value)}
                aria-pressed={hireType === option.value}
                className={`cursor-pointer rounded-full px-3.5 py-1.5 text-12-5 transition-colors ${
                  hireType === option.value
                    ? "bg-ink font-medium text-ink-content"
                    : "text-mut hover:text-ink"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {hireType === "replace" ? (
          <>
            <SelectField
              id="rq-replace-who"
              label="พจส. ที่จะแทน"
              placeholder="ค้นชื่อหรือรหัส พจส…"
              value={replaceDrivercode}
              onChange={setReplaceDrivercode}
              options={options.drivers}
              searchable
              searchPlaceholder="ค้นชื่อ รหัส หรือสาขา…"
            />
            <TextareaField
              id="rq-replace-note"
              label="รายละเอียดเพิ่มเติม"
              optional
              rows={2}
              value={replaceReasonNote}
              onChange={setReplaceReasonNote}
              placeholder="บริบทที่คนรับเรื่องต่อควรรู้ (ถ้ามี)"
            />
          </>
        ) : null}
      </Section>

      <Section title="รถและครูฝึก">
        {/* เลือกรถทีเดียวได้ครบทั้งเลขรถ ทะเบียน และยี่ห้อ — ฟอร์มเดิมของระบบเก่า
            ให้กรอกสามช่องแยกกัน ซึ่งพิมพ์ผิดแล้วไม่มีอะไรจับได้ */}
        <SelectField
          id="rq-vehicle"
          label="รถที่จะให้ขับ"
          optional
          placeholder="ค้นเลขรถหรือทะเบียน…"
          value={vehicleCode}
          onChange={setVehicleCode}
          options={options.vehicles}
          searchable
          clearable
          searchPlaceholder="ค้นเลขรถ ทะเบียน หรือแพล้นท์…"
        />
        <SelectField
          id="rq-trainer"
          label="ครูฝึก"
          optional
          hint="ระบุไว้ตั้งแต่ตอนแจ้ง แล้วจะไปขึ้นบนหน้าติดตามฝึกงานให้เองเมื่อผู้สมัครเริ่มฝึก — แก้ทีหลังได้ทั้งสองหน้า"
          placeholder="ค้นชื่อหรือรหัส พจส…"
          value={trainerDrivercode}
          onChange={setTrainerDrivercode}
          options={options.drivers}
          searchable
          clearable
          searchPlaceholder="ค้นชื่อ รหัส หรือสาขา…"
        />
      </Section>

      <Section title="หมายเหตุ" last>
        <TextareaField
          id="rq-note"
          label="หมายเหตุ"
          srLabel
          optional
          placeholder="ข้อมูลประกอบเพิ่มเติมของคำขอนี้"
          rows={2}
          value={note}
          onChange={setNote}
        />
      </Section>
    </ModalShell>
  );
}

/** ส่วนหนึ่งของฟอร์ม — ทรงเดียวกับ `Section` ของฟอร์มบันทึกเคส */
function Section({
  title,
  last = false,
  children,
}: {
  title: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={last ? "" : "border-b border-line"}>
      <h3 className="border-b border-line bg-base-200 px-5 py-1.5 text-11 font-semibold tracking-[0.06em] text-mut">
        {title}
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
