"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, ChevronDown, Info, Link2, Loader2, Pencil, Phone, TriangleAlert } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { MascotLoader } from "@/components/ui/mascot";
import { ModalShell } from "@/components/ui/modal-shell";
import { requestJson } from "@/lib/http";
import { alertError, toastSuccess } from "@/lib/swal";
import { todayInBangkok } from "@/lib/record-case-flow";
import { formatPhone, thaiDate } from "@/app/recruitment/_lib/form";
import { ADMIN_ROOT } from "@/app/recruitment/_lib/admin-nav";
import { formatThaiDateTime } from "@/app/recruitment/_lib/drivers/types";
import { STATUS_LABEL, type ApplicationStatus } from "@/app/recruitment/_lib/types";
import type { Journey } from "@/app/recruitment/_lib/requisitions/onboarding-store";
import {
  CO_DRIVER,
  END_OUTCOMES,
  SECTION_SPECS,
  ST_CHECKPOINTS,
  STEP_META,
  daysBetween,
  endLabel,
  fieldApplies,
  hasPerson,
  stageOf,
  stepStates,
  trainingDayOn,
  trainingStart,
  val,
  type FieldSpec,
  type OnboardingPatch,
  type OnboardingRecord,
  type OnboardingSection,
  type Step,
  type StepState,
} from "@/app/recruitment/_lib/requisitions/onboarding";
import {
  customerLabel,
  hireTypeLabel,
  isMixerBranch,
  personName,
  positionLabel,
  waitingDays,
} from "@/app/recruitment/_lib/requisitions/types";
import type { RequisitionOptions } from "@/app/recruitment/_lib/requisitions/options";
import { RequestKaEditor } from "@/app/recruitment/_components/admin/request-ka-editor";
import { ResultChip, StageChip, STEP_STATE_LABEL } from "@/app/recruitment/_components/admin/onboarding-bits";
import { RepairBadge } from "@/app/recruitment/_components/admin/repair-badge";
import { VehicleDetailDialog } from "@/app/recruitment/_components/admin/vehicle-detail-dialog";
import { OnboardingSectionForm } from "@/app/recruitment/_components/admin/onboarding-section-form";

/**
 * พจส.ใหม่หนึ่งคน — เปิดจากไอคอนตาในตารางติดตามพนักงานใหม่ (แทนหน้า `/onboarding/[id]` · Bew 4 พ.ย. 2569)
 * · บนสุด = ผู้สมัครที่ผูกใบ DRV (ชื่อ · รหัสพนักงาน · เบอร์) + คำขอ · ถัดมาการ์ดของแต่ละฝ่าย งานของฝ่ายไหนอยู่การ์ดนั้น
 * · ยังไม่มีคนผูก (อัตราว่าง/รอสรรหา) = คำขอ + KA + ยานยนต์ เท่านั้น — KA เตรียมครูฝึก/รถไว้ก่อนได้
 * · คำขอ + KA (ครูฝึก · รถ · Co-Driver) เป็นการ์ดเดียว กดแก้ไขแล้วช่องในการ์ดกลายเป็น input (Bew 4 พ.ย. 2569)
 * · RC ไม่อยู่ใน dialog นี้ (ข้อมูล RC ทำที่หน้าผู้สมัคร) · โหลดตอนเปิดผ่าน `GET …/[id]/journey`
 */

type Editing = {
  section: OnboardingSection;
  only?: readonly string[];
  title?: string;
};

export function OnboardingDialog({
  id,
  onClose,
  onSaved,
}: {
  /** `_id` ของคำขอ (1 คำขอ = 1 คน) */
  id: string;
  onClose: () => void;
  /** แถวที่บันทึกแล้ว — ตารางข้างหลังอัปเดตตาม */
  onSaved?: (next: OnboardingRecord) => void;
}) {
  const [journey, setJourney] = useState<Journey | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    requestJson<Journey>(`/api/recruitment/requisitions/${id}/journey`, {}, "โหลดข้อมูลไม่สำเร็จ")
      .then((j) => {
        if (alive) setJourney(j);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
      });
    return () => {
      alive = false;
    };
  }, [id]);

  const record = journey?.record;
  const stage = record ? stageOf(record) : null;

  return (
    <ModalShell
      title={record ? personName(record) || record.code : "พนักงานใหม่"}
      subtitle={
        record && stage ? (
          <>
            {record.code ? <span className="font-mono text-12 tracking-wider text-primary">{record.code}</span> : null}
            <StageChip stage={stage} label={stage === "ended" ? endLabel(record) : undefined} />
            <span>{[positionLabel(record), customerLabel(record), record.plant].filter(Boolean).join(" · ")}</span>
          </>
        ) : null
      }
      onClose={onClose}
      width="880px"
      footer={
        <button type="button" onClick={onClose} className="btn-sec px-4 py-2 text-13">
          ปิด
        </button>
      }
    >
      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-field bg-alert/10 px-3 py-2 text-12-5 text-alert">
          <TriangleAlert size={14} strokeWidth={1.9} aria-hidden className="mt-0.5 flex-none" />
          {error}
        </p>
      ) : !journey ? (
        <MascotLoader className="py-12" size={56} />
      ) : (
        <Body
          journey={journey}
          onChange={(next) => {
            setJourney((j) => (j ? { ...j, record: next } : j));
            onSaved?.(next);
          }}
          onCodeBound={() => setJourney((j) => (j ? { ...j, codeMatch: null } : j))}
        />
      )}
    </ModalShell>
  );
}

function Body({
  journey,
  onChange,
  onCodeBound,
}: {
  journey: Journey;
  onChange: (next: OnboardingRecord) => void;
  onCodeBound: () => void;
}) {
  const { record } = journey;
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);
  /* ฟอร์มคำขอ · KA — ตัวเลือก (รถ/พจส./แพล้นท์) โหลดตอนกดแก้ไขครั้งแรก */
  const [options, setOptions] = useState<RequisitionOptions | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [editingRequest, setEditingRequest] = useState(false);

  async function editRequest() {
    if (options) return setEditingRequest(true);
    setLoadingOptions(true);
    try {
      setOptions(await requestJson<RequisitionOptions>("/api/recruitment/requisitions/options", {}, "โหลดตัวเลือกไม่สำเร็จ"));
      setEditingRequest(true);
    } catch (err) {
      alertError("เปิดฟอร์มแก้ไขไม่สำเร็จ", err instanceof Error ? err.message : undefined);
    } finally {
      setLoadingOptions(false);
    }
  }

  /* รถปัจจุบันของ record — KA เปลี่ยนรถแล้วขั้นยานยนต์ตามทันที */
  const repair = record.vehicle?.plateNo ? (journey.repairs[record.vehicle.plateNo] ?? null) : null;
  const states = stepStates(record, repair);
  const stage = stageOf(record);
  const start = trainingStart(record);
  const trained = start && stage === "training" ? daysBetween(start, todayInBangkok()) : null;

  /** ผูกรหัสจากทะเบียน — ใช้ PATCH ส่วน rc เดิม (ค่า RC ส่งกลับตามเดิม แก้แค่ drivercode) */
  async function bindCode(drivercode: string) {
    setBusy(true);
    try {
      const next = await requestJson<OnboardingRecord>(
        `/api/recruitment/requisitions/${record.id}/onboarding`,
        {
          method: "PATCH",
          body: {
            section: "rc",
            values: record.onboarding.rc?.values ?? {},
            drivercode,
          } satisfies OnboardingPatch as unknown as Record<string, unknown>,
        },
        "ผูกรหัสไม่สำเร็จ",
      );
      onChange(next);
      onCodeBound();
      toastSuccess(`ผูกรหัส ${drivercode} แล้ว`);
    } catch (err) {
      alertError("ผูกรหัสไม่สำเร็จ", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const person = hasPerson(record);
  const fleet = (
    <FleetCard
      record={record}
      repair={repair}
      syncedAt={journey.repairsSyncedAt}
      state={states.fleet}
      meta={(() => {
        const o = journey.vehicles.find((x) => x.value === record.vehicle?.code);
        return [o?.type, o?.brand || record.vehicle?.brand, o?.plant].filter(Boolean).join(" · ");
      })()}
    />
  );

  return (
    <>
      {person ? <ApplicantCard journey={journey} start={start} trained={trained} busy={busy} onBind={bindCode} /> : null}
      <RequestKaCard
        record={record}
        person={person}
        state={states.ka}
        handoverState={states.handover}
        loading={loadingOptions}
        onEdit={editRequest}
        form={
          editingRequest && options ? (
            <RequestKaEditor
              record={record}
              person={person}
              options={options}
              onCancel={() => setEditingRequest(false)}
              onSaved={onChange}
            />
          ) : null
        }
      />
      {person ? (
        <>
          <StCard record={record} state={states.er} onEdit={setEditing} />
          <FieldsCard section="hrd" record={record} state={states.hrd} onEdit={() => setEditing({ section: "hrd" })} />
          {fleet}
        </>
      ) : (
        <>
          {fleet}
          <p className="flex items-center gap-2 rounded-field bg-soft px-3 py-2 text-12-5 text-mut">
            <Info size={14} strokeWidth={1.9} aria-hidden className="flex-none" />
            ST · HRD · รับรถ — เริ่มเมื่อมีผู้สมัคร
          </p>
        </>
      )}

      <History record={record} past={journey.past} />

      {editing ? (
        <OnboardingSectionForm
          record={record}
          section={editing.section}
          only={editing.only}
          title={editing.title}
          journey={journey}
          onClose={() => setEditing(null)}
          onSaved={onChange}
        />
      ) : null}
    </>
  );
}

/* --------------------------------------------------------------- ผู้สมัคร */

function ApplicantCard({
  journey,
  start,
  trained,
  busy,
  onBind,
}: {
  journey: Journey;
  start: string;
  trained: number | null;
  busy: boolean;
  onBind: (drivercode: string) => void;
}) {
  const { record, application, codeMatch } = journey;
  const name = personName(record) || "—";
  const phone = application?.phone || val(record.onboarding, "rc", "phone");
  const atms = record.atms;

  return (
    <section className="flex flex-none flex-col gap-4 rounded-box border border-line bg-base-100 p-4">
      <div className="flex items-center gap-3">
        <Avatar name={name} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-11-5 font-medium text-mut">ผู้สมัคร</span>
          <span className="truncate text-16 leading-tight font-semibold">{name}</span>
        </div>
        {application ? (
          <span
            className={`rounded-selector px-2 py-0.5 text-11-5 font-medium whitespace-nowrap ${APP_TONE[application.status]}`}
          >
            {STATUS_LABEL[application.status]}
          </span>
        ) : null}
      </div>

      <dl className="grid gap-px overflow-hidden rounded-field border border-line bg-line sm:grid-cols-3">
        <Cell label="รหัสพนักงาน">
          {record.drivercode ? (
            <Link
              href={`${ADMIN_ROOT}/drivers/${record.drivercode}`}
              className="inline-flex items-center gap-1 font-mono text-14 font-semibold hover:text-primary"
            >
              {record.drivercode}
              <ArrowUpRight size={13} strokeWidth={2} aria-hidden className="text-mut" />
            </Link>
          ) : (
            <span className="text-13 text-mut">ยังไม่มีรหัส</span>
          )}
        </Cell>
        <Cell label="เบอร์โทร">
          {phone ? (
            <a
              href={`tel:${phone.replace(/[^\d+]/g, "")}`}
              className="inline-flex items-center gap-1.5 text-14 font-medium tabular-nums hover:text-primary"
            >
              <Phone size={13} strokeWidth={2} aria-hidden className="text-mut" />
              {formatPhone(phone)}
            </a>
          ) : (
            <span className="text-13 text-mut">—</span>
          )}
        </Cell>
        <Cell label="ใบสมัคร">
          {application ? (
            <Link
              href={`${ADMIN_ROOT}/candidates?${new URLSearchParams({ ref: application.ref })}`}
              className="inline-flex items-center gap-1 font-mono text-13 font-medium text-primary hover:underline"
            >
              {application.ref}
              <ArrowUpRight size={13} strokeWidth={2} aria-hidden />
            </Link>
          ) : (
            <span className="text-13 text-mut">ไม่มีใบสมัคร</span>
          )}
        </Cell>
      </dl>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-12-5">
        <Fact label="เริ่มฝึก" value={start ? thaiDate(start) : "—"} />
        {trained !== null ? <Fact label="ฝึกมา" value={`${trained + 1} วัน`} /> : null}
        {atms ? (
          <Fact
            label="ATMS"
            value={`${atms.latestLabel || atms.latestStatus}${atms.latestDate ? ` · ${thaiDate(atms.latestDate)}` : ""}`}
            tone={atms.exited ? "text-alert" : ""}
          />
        ) : null}
      </div>

      {!record.drivercode && codeMatch ? (
        <p className="flex flex-wrap items-center gap-2 rounded-field bg-soft px-3 py-2 text-12-5">
          พบในทะเบียน: {codeMatch.name} <span className="font-mono">{codeMatch.drivercode}</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => onBind(codeMatch.drivercode)}
            className="btn-pri ml-auto flex items-center gap-1 px-2.5 py-1 text-12"
          >
            <Link2 size={13} aria-hidden />
            ผูกรหัส
          </button>
        </p>
      ) : null}
      {atms?.exited && !record.outcome && stageOf(record) !== "working" ? (
        <p className="flex items-center gap-2 rounded-field bg-alert/10 px-3 py-2 text-12-5 text-alert">
          <TriangleAlert size={14} aria-hidden className="flex-none" />
          ATMS: {atms.latestLabel || atms.latestStatus} {atms.latestDate ? thaiDate(atms.latestDate) : ""} · ปลด/ลาออก
          ทำที่หน้าผู้สมัคร
        </p>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------ การ์ดของฝ่าย */

function DeptCard({
  step,
  state,
  owner,
  updated,
  action,
  children,
}: {
  step: Step;
  state: StepState;
  /** ผู้ดูแลของฝ่าย (ระบบลงชื่อตอนบันทึก) */
  owner?: string;
  updated?: { by: string; at: string };
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex-none overflow-hidden rounded-box border border-line bg-base-100">
      <header className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <span className="flex h-7 min-w-11 flex-none items-center justify-center rounded-selector bg-primary/10 px-2 text-12 font-semibold text-primary">
          {STEP_META[step].short}
        </span>
        <h3 className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 text-14 font-semibold">
          {STEP_META[step].title}
          {state !== "skip" ? (
            <span className={`text-11-5 font-medium ${STATE_TEXT[state]}`}>{STEP_STATE_LABEL[state]}</span>
          ) : null}
        </h3>
        {action}
      </header>
      <div className="px-4 py-3.5">{children}</div>
      {owner || updated?.by ? (
        <footer className="flex flex-wrap gap-x-3 border-t border-line bg-base-200/40 px-4 py-2 text-11-5 text-mut">
          {owner ? (
            <span>
              {STEP_META[step].short} ผู้ดูแล <span className="font-medium text-ink">{owner}</span>
            </span>
          ) : null}
          {updated?.by ? (
            <span>
              แก้ล่าสุด {updated.by} · {thaiDate(updated.at)}
            </span>
          ) : null}
        </footer>
      ) : null}
    </section>
  );
}

function EditButton({ empty, label, onClick }: { empty: boolean; label?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-none cursor-pointer items-center gap-1.5 px-3 py-1.5 text-12-5 font-medium ${empty ? "btn-pri" : "btn-soft"}`}
    >
      <Pencil size={13} strokeWidth={2} aria-hidden />
      {label ?? (empty ? "กรอก" : "แก้ไข")}
    </button>
  );
}

/** ช่องของส่วนที่โชว์ — มีค่า + เข้าเงื่อนไข · ช่องบังคับโชว์เสมอให้เห็นว่าขาด · ช่องที่ระบบลงชื่อ (`byUser`) ไปอยู่ท้ายการ์ด */
function shownFields(section: OnboardingSection, values: Record<string, string>): FieldSpec[] {
  return SECTION_SPECS[section].fields.filter(
    (f) =>
      !f.byUser &&
      fieldApplies(f, values) &&
      ((values[f.key] && (f.key !== "outcome" || END_OUTCOMES.some((o) => o.value === values[f.key]))) ||
        (f.required && !f.readOnly)),
  );
}

/**
 * คำขอสรรหา + KA (ครูฝึก · เบอร์รถ · Co-Driver) การ์ดเดียว — Bew 4 พ.ย. 2569
 * · แก้ไข = ช่องในการ์ดกลายเป็น input (`RequestKaEditor`) ไม่เปิดโมดัลซ้อน · Co-Driver แก้ได้เมื่อมีผู้ฝึกงาน
 * · ส่งมอบรถอยู่การ์ดนี้ด้วย (เดิมเป็นการ์ดล่างสุด · Bew 4 พ.ย. 2569) — อัปเดตที่เดียว · ผล Co-Driver ไป ST
 * · คำขอที่ยกเลิกแล้วแก้ไม่ได้ (เปิดรับอีกครั้งก่อน)
 */
function RequestKaCard({
  record,
  person,
  state,
  handoverState,
  loading,
  onEdit,
  form,
}: {
  record: OnboardingRecord;
  person: boolean;
  state: StepState;
  handoverState: StepState;
  loading: boolean;
  onEdit: () => void;
  /** ฟอร์มแก้ไขที่กางอยู่ — มี = แทนที่เนื้อการ์ด */
  form: React.ReactNode;
}) {
  const waiting = record.status === "open" ? waitingDays(record) : null;
  const data = record.onboarding.ka;
  const values = data?.values ?? {};
  const fields = person ? shownFields("ka", values) : [];
  const handover = record.onboarding.handover?.values ?? {};
  const handoverFields = person ? shownFields("handover", handover) : [];
  const editable = record.status !== "cancelled";
  const mixer = isMixerBranch(record.branch);

  return (
    <section className="flex-none overflow-hidden rounded-box border border-line bg-base-100">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-2.5">
        <span className="flex h-7 min-w-11 flex-none items-center justify-center rounded-selector bg-primary/10 px-2 text-12 font-semibold text-primary">
          KA
        </span>
        <h3 className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 text-14 font-semibold">
          คำขอสรรหา · ครูฝึก · รถ
          {state !== "skip" ? (
            <span className={`text-11-5 font-medium ${STATE_TEXT[state]}`}>{STEP_STATE_LABEL[state]}</span>
          ) : null}
        </h3>
        {person ? null : (
          <span className="rounded-selector bg-st-wait px-2 py-0.5 text-11-5 font-medium text-st-wait-ink">ยังไม่มีผู้สมัคร</span>
        )}
        {editable && !form ? (
          <button
            type="button"
            onClick={onEdit}
            disabled={loading}
            className={`flex flex-none cursor-pointer items-center gap-1.5 px-3 py-1.5 text-12-5 font-medium disabled:opacity-60 ${
              record.trainer && record.vehicle ? "btn-soft" : "btn-pri"
            }`}
          >
            {loading ? (
              <Loader2 size={13} className="animate-spin" aria-hidden />
            ) : (
              <Pencil size={13} strokeWidth={2} aria-hidden />
            )}
            แก้ไข
          </button>
        ) : null}
      </header>

      {form ?? (
      <div className="flex flex-col gap-3 px-4 py-3.5">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-4">
          <Item label="วันที่แจ้ง">
            {thaiDate(record.requestedOn)}
            {waiting !== null ? <span className="text-mut"> · รอ {waiting} วัน</span> : null}
          </Item>
          <Item label="ประเภท">
            {hireTypeLabel(record.hireType)}
            {record.replace?.name ? <span className="text-mut"> · แทน {record.replace.name}</span> : null}
          </Item>
          <Item label="สาขา">{record.branch || <Dash />}</Item>
          <Item label="ผู้แจ้ง">{record.requester.name || <Dash />}</Item>
          <Item label="ลูกค้า">{customerLabel(record) || <Dash />}</Item>
          {mixer ? <Item label="แพล้นท์">{record.plant || <Dash />}</Item> : null}
          {mixer ? <Item label="ตำแหน่ง">{positionLabel(record) || <Dash />}</Item> : null}
        </dl>

        <dl className="grid gap-x-6 gap-y-3 border-t border-line pt-3 sm:grid-cols-4">
          <Item label="ครูฝึก" required>
            {record.trainer ? (
              record.trainer.drivercode ? (
                <Link href={`${ADMIN_ROOT}/drivers/${record.trainer.drivercode}`} className="hover:text-primary">
                  {record.trainer.name}
                </Link>
              ) : (
                record.trainer.name
              )
            ) : (
              <Dash />
            )}
          </Item>
          <Item label="เบอร์รถ" required>
            {record.vehicle ? (
              <span className="flex flex-col leading-tight">
                <span className="font-mono font-medium">{record.vehicle.code || record.vehicle.plateNo}</span>
                {record.vehicle.plateNo && record.vehicle.code ? (
                  <span className="text-11-5 text-mut">{record.vehicle.plateNo}</span>
                ) : null}
              </span>
            ) : (
              <Dash />
            )}
          </Item>
          {fields.map((f) => (
            <Item key={f.key} label={f.label} required={f.required}>
              {values[f.key] ? <Value field={f} value={values[f.key]} /> : <Dash />}
            </Item>
          ))}
        </dl>

        {record.note ? (
          <p className="rounded-field bg-soft/60 px-2.5 py-1.5 text-12-5 leading-relaxed whitespace-pre-line text-pretty">
            {record.note}
          </p>
        ) : null}

        {person ? (
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            <h4 className="flex items-baseline gap-2 text-12-5 font-semibold">
              ส่งมอบรถ
              <span className={`text-11-5 font-medium ${STATE_TEXT[handoverState]}`}>{STEP_STATE_LABEL[handoverState]}</span>
            </h4>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
              {handoverFields.map((f) => (
                <Item key={f.key} label={f.label} required={f.required} wide={f.wide || f.kind === "textarea"}>
                  {handover[f.key] ? <Value field={f} value={handover[f.key]} /> : <Dash />}
                </Item>
              ))}
            </dl>
          </div>
        ) : null}
      </div>
      )}

      {values.kaName || data?.updatedBy ? (
        <footer className="flex flex-wrap gap-x-3 border-t border-line bg-base-200/40 px-4 py-2 text-11-5 text-mut">
          {values.kaName ? (
            <span>
              KA ผู้ดูแล <span className="font-medium text-ink">{values.kaName}</span>
            </span>
          ) : null}
          {data?.updatedBy ? (
            <span>
              แก้ล่าสุด {data.updatedBy} · {thaiDate(data.updatedAt)}
            </span>
          ) : null}
        </footer>
      ) : null}
    </section>
  );
}

/** HRD — ช่องตาม `SECTION_SPECS` (ส่งมอบรถย้ายไปการ์ดคำขอ · KA แล้ว) */
function FieldsCard({
  section,
  record,
  state,
  onEdit,
}: {
  section: "hrd";
  record: OnboardingRecord;
  state: StepState;
  onEdit: () => void;
}) {
  const data = record.onboarding[section];
  const values = data?.values ?? {};
  const fields = shownFields(section, values);
  const empty = !fields.some((f) => values[f.key]);

  return (
    <DeptCard
      step={section}
      state={state}
      updated={data?.updatedBy ? { by: data.updatedBy, at: data.updatedAt } : undefined}
      action={<EditButton empty={empty} onClick={onEdit} />}
    >
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
        {fields.map((f) => (
          <Item key={f.key} label={f.label} required={f.required} wide={f.wide || f.kind === "textarea"}>
            {values[f.key] ? <Value field={f} value={values[f.key]} /> : <Dash />}
          </Item>
        ))}
      </dl>
    </DeptCard>
  );
}

/** ST — วันที่ 1 / 4 / 8 (สรุป) · อัปเดตทีละรอบ · รอบถัดไปเปิดหลังลงผลรอบก่อน */
function StCard({ record, state, onEdit }: { record: OnboardingRecord; state: StepState; onEdit: (e: Editing) => void }) {
  const data = record.onboarding.er;
  const values = data?.values ?? {};
  const start = trainingStart(record);
  const label = (key: string) => SECTION_SPECS.er.fields.find((f) => f.key === key)?.label ?? key;
  const coDriverOn = val(record.onboarding, "ka", "coDriverOn");
  const coDriver = val(record.onboarding, "ka", "coDriver") === CO_DRIVER[0].value || Boolean(values.coDriverResult);

  return (
    <DeptCard
      step="er"
      state={state}
      owner={values.erName}
      updated={data?.updatedBy ? { by: data.updatedBy, at: data.updatedAt } : undefined}
    >
      <ol className="grid gap-3 md:grid-cols-3">
        {ST_CHECKPOINTS.map((c, i) => {
          const prev = i ? ST_CHECKPOINTS[i - 1] : null;
          const locked = Boolean(prev && !values[prev.result] && !values[c.result]);
          const done = Boolean(values[c.result]);
          const on = values[c.on] || trainingDayOn(start, c.day);
          const title = `วันที่ ${c.day}${"summary" in c ? " · สรุป" : ""}`;
          const legacy = "summary" in c && !done ? values.readiness : "";
          return (
            <li
              key={c.day}
              className={`flex min-w-0 flex-col gap-2 rounded-field border p-3 ${
                done ? "border-primary/25 bg-primary/4" : "border-line"
              } ${locked ? "opacity-55" : ""}`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`flex size-7 flex-none items-center justify-center rounded-full text-12-5 font-semibold ${
                    done ? "bg-primary text-primary-content" : "bg-soft text-primary"
                  }`}
                >
                  {done ? <Check size={14} strokeWidth={3} aria-hidden /> : c.day}
                </span>
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="text-13 font-semibold">{title}</span>
                  <span className="truncate text-11-5 text-mut">
                    {label(c.result)}
                    {on ? ` · ${thaiDate(on)}` : ""}
                  </span>
                </span>
              </div>

              {done ? (
                <ResultChip value={values[c.result]} />
              ) : legacy ? (
                <span className="flex items-center gap-1.5 text-12 text-mut">
                  <ResultChip value={legacy} />
                  ผลเดิม
                  {values.assessedOn ? ` ${thaiDate(values.assessedOn)}` : ""}
                </span>
              ) : locked ? (
                <span className="text-12 text-mut">รอผลวันที่ {prev?.day}</span>
              ) : null}

              {values[c.note] ? (
                <p className="rounded-field bg-soft/60 px-2.5 py-1.5 text-12-5 leading-relaxed whitespace-pre-line text-pretty">
                  {values[c.note]}
                </p>
              ) : null}

              {locked ? null : (
                <span className="mt-auto pt-0.5">
                  <EditButton
                    empty={!done}
                    label="อัปเดต"
                    onClick={() =>
                      onEdit({
                        section: "er",
                        only: [c.result, c.on, c.note],
                        title: `ST · ${title}`,
                      })
                    }
                  />
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {/* Co-Driver — KA เลือก “อบรม” แล้ว ST ลงผล (ย้ายจากการ์ด KA · Bew 4 พ.ย. 2569) */}
      {coDriver ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-field border border-line p-3">
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="text-13 font-semibold">Co-Driver</span>
            <span className="text-11-5 text-mut">
              อบรม{coDriverOn ? ` · ${thaiDate(coDriverOn)}` : ""}
              {values.coDriverNote ? ` · ${values.coDriverNote}` : ""}
            </span>
          </span>
          {values.coDriverResult ? <ResultChip value={values.coDriverResult} /> : null}
          <EditButton
            empty={!values.coDriverResult}
            label="อัปเดต"
            onClick={() => onEdit({ section: "er", only: ["coDriverResult", "coDriverNote"], title: "ST · ผล Co-Driver" })}
          />
        </div>
      ) : null}
    </DeptCard>
  );
}

/** ยานยนต์ — ไม่มีฟอร์ม · สถานะรถจากบอร์ดซ่อม · รายละเอียดเปิด dialog รถ */
function FleetCard({
  record,
  repair,
  syncedAt,
  state,
  meta,
}: {
  record: OnboardingRecord;
  repair: Journey["repairs"][string] | null;
  syncedAt: string | null;
  state: StepState;
  meta: string;
}) {
  const [open, setOpen] = useState(false);
  const v = record.vehicle;

  return (
    <DeptCard
      step="fleet"
      state={state}
      action={
        v ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="btn-soft flex flex-none cursor-pointer items-center gap-1.5 px-3 py-1.5 text-12-5 font-medium"
          >
            <Info size={13} strokeWidth={2} aria-hidden />
            รายละเอียด
          </button>
        ) : null
      }
    >
      {!v ? (
        <p className="text-13 text-mut">ยังไม่ระบุรถ — KA เลือกรถในการ์ด KA</p>
      ) : (
        <div className="flex flex-col gap-1.5 text-13">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium">{[v.code, v.plateNo].filter(Boolean).join(" · ")}</span>
            {meta ? <span className="text-12-5 text-mut">{meta}</span> : null}
          </p>
          {repair ? <RepairBadge repair={repair} /> : null}
          <p className="text-11-5 text-mut">ข้อมูลงานซ่อม ณ {syncedAt ? formatThaiDateTime(syncedAt) : "— อ่านเวลาไม่ได้"}</p>
        </div>
      )}
      {open && v ? <VehicleDetailDialog vehicle={v} onClose={() => setOpen(false)} /> : null}
    </DeptCard>
  );
}

function History({ record, past }: { record: OnboardingRecord; past: Journey["past"] }) {
  if (!record.history.length && !past.length) return null;
  return (
    <details className="group flex-none rounded-box border border-line bg-base-100">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-13 font-medium [&::-webkit-details-marker]:hidden">
        ประวัติ
        <span className="text-12 font-normal text-mut">({record.history.length})</span>
        <ChevronDown
          size={15}
          strokeWidth={2}
          aria-hidden
          className="ml-auto text-mut transition-transform group-open:rotate-180"
        />
      </summary>
      <ol className="flex flex-col gap-2 border-t border-line px-4 py-3">
        {[...record.history].reverse().map((h, i) => (
          <li key={`${h.at}-${i}`} className="border-l-2 border-line pl-2.5">
            <p className="text-12-5 leading-snug text-pretty">{h.note}</p>
            <p className="text-11 text-mut">
              {h.by} · {thaiDate(h.at)}
            </p>
          </li>
        ))}
        {past.length ? (
          <p className="text-12 text-mut">เคยผูก: {past.map((p) => p.fullName || "ไม่ทราบชื่อ").join(", ")}</p>
        ) : null}
      </ol>
    </details>
  );
}

/* ------------------------------------------------------------------ ชิ้นเล็ก */

/** สีสถานะใบสมัคร — ชุดเดียวกับหน้าผู้สมัคร */
const APP_TONE: Record<ApplicationStatus, string> = {
  pending_contact: "bg-st-wait text-st-wait-ink",
  interview_scheduled: "bg-st-wait text-st-wait-ink",
  interview_passed: "bg-st-live text-st-live-ink",
  training: "bg-st-live text-st-live-ink",
  working: "bg-st-live text-st-live-ink",
  cancelled: "bg-alert/12 text-alert",
};

const STATE_TEXT: Record<StepState, string> = {
  done: "text-primary",
  partial: "text-st-wait-ink",
  todo: "text-sla",
  skip: "text-mut",
};

function Value({ field, value }: { field: FieldSpec; value: string }) {
  if (field.key === "outcome")
    return <span className="font-medium text-alert">{field.options?.find((o) => o.value === value)?.label ?? value}</span>;
  if (field.kind === "date") return <>{thaiDate(value)}</>;
  if (field.kind === "select") return <ResultChip value={value} />;
  return <span className="whitespace-pre-line text-pretty">{value}</span>;
}

function Item({
  label,
  required,
  wide,
  children,
}: {
  label: string;
  required?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${wide ? "sm:col-span-3" : ""}`}>
      <dt className="text-11-5 text-mut">
        {label}
        {required ? (
          <span aria-hidden className="text-alert">
            {" "}
            *
          </span>
        ) : null}
      </dt>
      <dd className="text-13">{children}</dd>
    </div>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-base-100 px-3.5 py-2.5">
      <dt className="text-11-5 text-mut">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Fact({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-mut">{label}</span>
      <span className={`font-medium tabular-nums ${tone}`}>{value}</span>
    </span>
  );
}

function Dash() {
  return <span className="text-mut">—</span>;
}
