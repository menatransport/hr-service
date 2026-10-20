"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Check, CircleDashed, Info, Link2, Minus, Pencil, Phone, TriangleAlert } from "lucide-react";

import { requestJson } from "@/lib/http";
import { alertError, toastSuccess } from "@/lib/swal";
import { todayInBangkok } from "@/lib/record-case-flow";
import { thaiDate } from "@/app/recruitment/_lib/form";
import { ADMIN_ROOT } from "@/app/recruitment/_lib/admin-nav";
import { formatThaiDateTime } from "@/app/recruitment/_lib/drivers/types";
import { STATUS_LABEL } from "@/app/recruitment/_lib/types";
import type { Journey } from "@/app/recruitment/_lib/requisitions/onboarding-store";
import {
  END_OUTCOMES,
  SECTION_SPECS,
  ST_CHECKPOINTS,
  STEP_META,
  STEP_ORDER,
  daysBetween,
  daysToHandover,
  endLabel,
  fieldApplies,
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
import { customerLabel, hireTypeLabel, personName, positionLabel } from "@/app/recruitment/_lib/requisitions/types";
import { ResultChip, StageChip, STEP_STATE_LABEL } from "@/app/recruitment/_components/admin/onboarding-bits";
import { RepairBadge } from "@/app/recruitment/_components/admin/repair-badge";
import type { RepairStatus } from "@/app/recruitment/_lib/requisitions/repair-status";
import type { VehicleOption } from "@/app/recruitment/_lib/requisitions/options";
import { VehicleDetailDialog } from "@/app/recruitment/_components/admin/vehicle-detail-dialog";
import { OnboardingSectionForm } from "@/app/recruitment/_components/admin/onboarding-section-form";

/**
 * เส้นทางของ พจส.ใหม่ หนึ่งคน — **ที่เดียวที่แก้ข้อมูลหลังได้คน** (RC · KA รวมครูฝึก/รถ · ST · HRD · รับรถ)
 * · ขั้นยานยนต์อ่านจากบอร์ดซ่อม · ด้านขวาคือคำขอ/ใบสมัคร/ทะเบียน/ATMS (อ่านอย่างเดียว) + ประวัติ
 */
export function OnboardingJourney({ journey }: { journey: Journey }) {
  const [record, setRecord] = useState<OnboardingRecord>(journey.record);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);
  const [codeMatch, setCodeMatch] = useState(journey.codeMatch);
  const [allHistory, setAllHistory] = useState(false);

  const stage = stageOf(record);
  /* อ่านจากรถปัจจุบันของ record — KA เปลี่ยนรถแล้วขั้นยานยนต์ตามทันทีไม่ต้องรีเฟรช */
  const repair = record.vehicle?.plateNo ? (journey.repairs[record.vehicle.plateNo] ?? null) : null;
  const states = stepStates(record, repair);
  const start = trainingStart(record);
  const days = daysToHandover(record);
  const trained = start && stage === "training" ? daysBetween(start, todayInBangkok()) : null;
  const phone = val(record.onboarding, "rc", "phone") || journey.application?.phone || "";
  const atms = record.atms;
  /* ใบที่ผูกใบสมัคร — RC กรอกที่หน้าผู้สมัคร (`?rc=1` เปิดกล่องข้อมูล RC ให้เลย) */
  const rcHref = journey.application
    ? `${ADMIN_ROOT}/candidates?${new URLSearchParams({ ref: journey.application.ref, rc: "1" })}`
    : null;

  async function save(patch: OnboardingPatch, done: string) {
    setBusy(true);
    try {
      const next = await requestJson<OnboardingRecord>(
        `/api/recruitment/requisitions/${record.id}/onboarding`,
        { method: "PATCH", body: patch as unknown as Record<string, unknown> },
        "บันทึกไม่สำเร็จ",
      );
      setRecord(next);
      toastSuccess(done);
      return true;
    } catch (err) {
      alertError("บันทึกไม่สำเร็จ", err instanceof Error ? err.message : undefined);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const rcValues = record.onboarding.rc?.values ?? {};

  return (
    <div className="flex animate-rise flex-col">
      <header className="flex flex-col gap-2.5 border-b border-line px-(--sheet-px) pt-1 pb-4">
        <Link href={`${ADMIN_ROOT}/onboarding?tab=${stage}`} className="flex w-fit items-center gap-1 text-12-5 text-mut hover:text-primary">
          <ArrowLeft size={14} strokeWidth={2} aria-hidden />
          ติดตามพนักงานใหม่
        </Link>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h1 className="text-22 leading-tight font-semibold">{personName(record) || record.code}</h1>
          <StageChip stage={stage} label={stage === "ended" ? endLabel(record) : undefined} />
        </div>

        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-13 text-mut">
          <span className="font-mono text-12 tracking-wider text-primary">{record.code}</span>
          {record.drivercode ? (
            <>
              <Sep />
              <Link href={`${ADMIN_ROOT}/drivers/${record.drivercode}`} className="flex items-center gap-0.5 hover:text-primary">
                <span className="font-mono text-ink">{record.drivercode}</span>
                <ArrowUpRight size={12} strokeWidth={2} aria-hidden />
              </Link>
            </>
          ) : null}
          {phone ? (
            <>
              <Sep />
              <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-1 hover:text-primary">
                <Phone size={12} strokeWidth={2} aria-hidden />
                {phone}
              </a>
            </>
          ) : null}
          <Sep />
          <span>{[positionLabel(record), customerLabel(record), record.plant].filter(Boolean).join(" · ")}</span>
        </p>

        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-12-5">
          <Fact label="เริ่มฝึก" value={start ? thaiDate(start) : "—"} />
          {trained !== null ? <Fact label="ฝึกมา" value={`${trained + 1} วัน`} /> : null}
          {days !== null ? <Fact label="ฝึก → รับรถ" value={`${days} วัน`} /> : null}
          {atms ? (
            <Fact
              label="ATMS"
              value={`${atms.latestLabel || atms.latestStatus}${atms.latestDate ? ` · ${thaiDate(atms.latestDate)}` : ""}`}
              tone={atms.exited ? "text-alert" : ""}
            />
          ) : null}
        </dl>

        {/* ข้อเท็จจริงจากระบบอื่นที่ยังไม่ได้บันทึก — กดครั้งเดียว */}
        {!record.drivercode && codeMatch ? (
          <Notice>
            พบในทะเบียน: {codeMatch.name} <span className="font-mono">{codeMatch.drivercode}</span>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (await save({ section: "rc", values: rcValues, drivercode: codeMatch.drivercode }, `ผูกรหัส ${codeMatch.drivercode} แล้ว`))
                  setCodeMatch(null);
              }}
              className="btn-pri flex items-center gap-1 px-2.5 py-1 text-12"
            >
              <Link2 size={13} aria-hidden />
              ผูกรหัส
            </button>
          </Notice>
        ) : null}
        {atms?.exited && !record.outcome && stage !== "working" ? (
          <Notice tone="alert">
            ATMS: {atms.latestLabel || atms.latestStatus} {atms.latestDate ? thaiDate(atms.latestDate) : ""}
            {/* ปลด/ลาออกทำที่หน้าผู้สมัคร (RC) เท่านั้น */}
            <Link
              href={rcHref ?? `${ADMIN_ROOT}/candidates`}
              className="btn-sec flex items-center gap-0.5 px-2.5 py-1 text-12"
            >
              หน้าผู้สมัคร
              <ArrowUpRight size={13} aria-hidden />
            </Link>
          </Notice>
        ) : null}
      </header>

      <nav aria-label="ขั้นตอน" className="border-b border-line">
        <ol className="grid grid-cols-3 gap-px bg-line md:grid-cols-6">
          {STEP_ORDER.map((s) => (
            <li key={s} className="bg-base-100">
              <a href={`#sec-${s}`} className="flex h-full items-center gap-2 px-3 py-2.5 hover:bg-soft/60">
                <StepIcon state={states[s]} />
                <span className="flex min-w-0 flex-col">
                  <span className="text-12-5 font-semibold">{STEP_META[s].short}</span>
                  <span className="truncate text-11 text-mut">{STEP_META[s].title}</span>
                </span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col xl:border-r xl:border-line">
          {STEP_ORDER.map((s) =>
            s === "fleet" ? (
              <FleetSection
                key={s}
                record={record}
                option={journey.vehicles.find((x) => x.value === record.vehicle?.code)}
                repair={repair}
                syncedAt={journey.repairsSyncedAt}
                state={states.fleet}
              />
            ) : s === "er" ? (
              <StSection key={s} record={record} state={states.er} onEdit={setEditing} />
            ) : (
              <Section
                key={s}
                section={s}
                record={record}
                state={states[s]}
                onEdit={() => setEditing({ section: s })}
                editHref={s === "rc" ? rcHref : null}
              />
            ),
          )}
        </div>

        <aside className="flex flex-col border-t border-line xl:border-t-0">
          <Side title="คำขอสรรหา">
            <Row label="แจ้งเมื่อ">{thaiDate(record.requestedOn)}</Row>
            <Row label="ประเภท">
              {hireTypeLabel(record.hireType)}
              {record.replace ? <span className="text-mut"> · แทน {record.replace.name}</span> : null}
            </Row>
            <Row label="ผู้แจ้ง">{record.requester.name || "—"}</Row>
          </Side>

          <Side title="ใบสมัคร">
            {journey.application ? (
              <>
                <Row label="เลขที่">
                  <Link
                    href={`${ADMIN_ROOT}/candidates?${new URLSearchParams({ ref: journey.application.ref })}`}
                    className="inline-flex items-center gap-0.5 font-mono text-12 text-primary hover:underline"
                  >
                    {journey.application.ref}
                    <ArrowUpRight size={12} aria-hidden />
                  </Link>
                </Row>
                <Row label="สถานะ">{STATUS_LABEL[journey.application.status]}</Row>
              </>
            ) : (
              <p className="text-12-5 text-mut">ไม่มีใบสมัคร</p>
            )}
          </Side>

          <Side title="ทะเบียน · ATMS">
            {journey.driver ? (
              <Row label="ทะเบียน">
                <Link href={`${ADMIN_ROOT}/drivers/${journey.driver.drivercode}`} className="hover:text-primary">
                  {journey.driver.name || journey.driver.drivercode}
                </Link>
              </Row>
            ) : (
              <p className="text-12-5 text-mut">ยังไม่มีรหัส พจส.</p>
            )}
            {atms ? (
              <>
                <Row label="ฝึก (ฝ)">
                  {atms.trainingDays} วัน
                  {atms.firstTraining ? <span className="text-mut"> · เริ่ม {thaiDate(atms.firstTraining)}</span> : null}
                </Row>
                <Row label="ออกงานวันแรก">{atms.firstWork ? thaiDate(atms.firstWork) : "—"}</Row>
              </>
            ) : null}
          </Side>

          <Side title="ประวัติ">
            <ol className="flex flex-col gap-2">
              {[...record.history]
                .reverse()
                .slice(0, allHistory ? undefined : 6)
                .map((h, i) => (
                  <li key={`${h.at}-${i}`} className="border-l-2 border-line pl-2.5">
                    <p className="text-12-5 leading-snug text-pretty">{h.note}</p>
                    <p className="text-11 text-mut">
                      {h.by} · {thaiDate(h.at)}
                    </p>
                  </li>
                ))}
            </ol>
            {record.history.length > 6 && !allHistory ? (
              <button type="button" onClick={() => setAllHistory(true)} className="w-fit text-12 text-primary hover:underline">
                ดูทั้งหมด ({record.history.length})
              </button>
            ) : null}
            {journey.past.length ? (
              <p className="text-12 text-mut">
                เคยผูก: {journey.past.map((p) => p.fullName || "ไม่ทราบชื่อ").join(", ")}
              </p>
            ) : null}
          </Side>
        </aside>
      </div>

      {editing ? (
        <OnboardingSectionForm
          record={record}
          section={editing.section}
          only={editing.only}
          title={editing.title}
          journey={journey}
          onClose={() => setEditing(null)}
          onSaved={setRecord}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ ส่วนของฝ่าย */

type Editing = { section: OnboardingSection; only?: readonly string[]; title?: string };

const STATE_TEXT: Record<StepState, string> = {
  done: "text-primary",
  partial: "text-st-wait-ink",
  todo: "text-sla",
  skip: "text-mut",
};

function StepIcon({ state }: { state: StepState }) {
  if (state === "done")
    return (
      <span className="flex size-5 flex-none items-center justify-center rounded-full bg-primary text-primary-content">
        <Check size={12} strokeWidth={3} aria-hidden />
      </span>
    );
  if (state === "skip")
    return (
      <span className="flex size-5 flex-none items-center justify-center rounded-full bg-base-200 text-mut">
        <Minus size={12} strokeWidth={3} aria-hidden />
      </span>
    );
  return (
    <CircleDashed size={20} strokeWidth={2} aria-hidden className={`flex-none ${state === "partial" ? "text-st-wait-ink" : "text-line-strong"}`} />
  );
}

function SectionHead({ step, state, children }: { step: Step; state: StepState; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="flex flex-1 items-baseline gap-2 text-15 font-semibold">
        <span className="font-mono text-12 text-mut">{STEP_META[step].no}</span>
        {STEP_META[step].short}
        <span className="text-13 font-normal text-mut">{STEP_META[step].title}</span>
        {state !== "skip" ? <span className={`text-11-5 font-medium ${STATE_TEXT[state]}`}>{STEP_STATE_LABEL[state]}</span> : null}
      </h2>
      {children}
    </div>
  );
}

function Section({
  section,
  record,
  state,
  onEdit,
  editHref,
}: {
  section: OnboardingSection;
  record: OnboardingRecord;
  state: StepState;
  onEdit: () => void;
  /** มีค่า = ส่วนนี้กรอกที่หน้าอื่น (RC → หน้าผู้สมัคร) ปุ่มกลายเป็นลิงก์ */
  editHref?: string | null;
}) {
  const data = record.onboarding[section];
  const values = data?.values ?? {};
  /* “ผลสิ้นสุด” ที่เป็นค่าความคืบหน้าจากไฟล์เก่า (รอฝึก/ฝึกงาน/รับรถแล้ว) ไม่ใช่ผลสิ้นสุด — ขั้นบอกอยู่แล้ว
     · ช่องที่ไม่เข้าเงื่อนไข (`when`) หรือไม่อยู่ในนิยามแล้ว (เช่น รูปแบบ HRD จากไฟล์) ไม่แสดง
     · ช่อง `required` (* แดง = ทำให้ขั้นเสร็จ) โชว์เสมอแม้ยังว่าง ให้เห็นว่าขาดอะไร */
  const filled = SECTION_SPECS[section].fields.filter(
    (f) =>
      values[f.key] &&
      fieldApplies(f, values) &&
      (f.key !== "outcome" || END_OUTCOMES.some((o) => o.value === values[f.key])),
  );
  const shown = SECTION_SPECS[section].fields.filter(
    (f) => filled.includes(f) || (f.required && !f.readOnly && fieldApplies(f, values)),
  );
  const extras = section === "ka" && (record.trainer || record.vehicle);
  const empty = !filled.length && !extras;

  return (
    <section id={`sec-${section}`} className="scroll-mt-24 border-b border-line px-(--sheet-px) py-4">
      <SectionHead step={section} state={state}>
        {editHref ? (
          <Link
            href={editHref}
            className={`flex flex-none items-center gap-1.5 px-3 py-1.5 text-12-5 font-medium ${empty ? "btn-pri" : "btn-soft"}`}
          >
            {empty ? "กรอกที่หน้าผู้สมัคร" : "แก้ที่หน้าผู้สมัคร"}
            <ArrowUpRight size={13} strokeWidth={2} aria-hidden />
          </Link>
        ) : (
          <button
            type="button"
            onClick={onEdit}
            className={`flex flex-none cursor-pointer items-center gap-1.5 px-3 py-1.5 text-12-5 font-medium ${empty ? "btn-pri" : "btn-soft"}`}
          >
            <Pencil size={13} strokeWidth={2} aria-hidden />
            {empty ? "กรอก" : "แก้ไข"}
          </button>
        )}
      </SectionHead>

      {!shown.length && section !== "ka" ? null : (
        <dl className="mt-3 grid gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {section === "ka" ? (
            <>
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
                  <span className="text-mut">—</span>
                )}
              </Item>
              <Item label="รถ" required>
                {record.vehicle ? [record.vehicle.code, record.vehicle.plateNo].filter(Boolean).join(" · ") : <span className="text-mut">—</span>}
              </Item>
            </>
          ) : null}
          {shown.map((field) => (
            <Item
              key={field.key}
              label={field.label}
              required={field.required}
              span={field.wide ? "full" : field.kind === "textarea" ? "two" : undefined}
            >
              {values[field.key] ? <Value field={field} value={values[field.key]} /> : <span className="text-mut">—</span>}
            </Item>
          ))}
        </dl>
      )}

      {data?.updatedBy ? (
        <p className="mt-2.5 text-11 text-mut">
          {data.updatedBy} · {thaiDate(data.updatedAt)}
        </p>
      ) : null}
    </section>
  );
}

/** ST — 3 รอบ วันที่ 1 / 4 / 8 (สรุป) วางเรียงกัน กดอัปเดตทีละรอบ · รอบถัดไปเปิดหลังลงผลรอบก่อน */
function StSection({ record, state, onEdit }: { record: OnboardingRecord; state: StepState; onEdit: (e: Editing) => void }) {
  const data = record.onboarding.er;
  const values = data?.values ?? {};
  const start = trainingStart(record);
  const label = (key: string) => SECTION_SPECS.er.fields.find((f) => f.key === key)?.label ?? key;

  return (
    <section id="sec-er" className="scroll-mt-24 border-b border-line px-(--sheet-px) py-4">
      <SectionHead step="er" state={state}>
        {values.erName ? <span className="flex-none text-12-5 text-mut">ST {values.erName}</span> : null}
      </SectionHead>

      <ol className="mt-3.5 grid gap-x-6 gap-y-5 md:grid-cols-3">
        {ST_CHECKPOINTS.map((c, i) => {
          const prev = i ? ST_CHECKPOINTS[i - 1] : null;
          const locked = Boolean(prev && !values[prev.result] && !values[c.result]);
          const done = Boolean(values[c.result]);
          const on = trainingDayOn(start, c.day);
          const title = `วันที่ ${c.day}${"summary" in c ? " · สรุป" : ""}`;
          /* สรุปเดิมจากไฟล์ (readiness) — โชว์ในวันที่ 8 เมื่อยังไม่ลงผลรอบนี้ */
          const legacy = "summary" in c && !done ? values.readiness : "";
          return (
            <li key={c.day} className={`flex min-w-0 flex-col gap-2 ${locked ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-2.5">
                <span
                  className={`flex size-8 flex-none items-center justify-center rounded-full text-13 font-semibold ${
                    done ? "bg-primary text-primary-content" : "bg-soft text-primary"
                  }`}
                >
                  {done ? <Check size={15} strokeWidth={3} aria-hidden /> : c.day}
                </span>
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="text-13-5 font-semibold">
                    {title}
                    <Star />
                  </span>
                  <span className="truncate text-11-5 text-mut">
                    {label(c.result)}
                    {on ? ` · ${thaiDate(on)}` : ""}
                  </span>
                </span>
              </div>

              {done ? (
                <span>
                  <ResultChip value={values[c.result]} />
                </span>
              ) : legacy ? (
                <span className="flex items-center gap-1.5 text-12 text-mut">
                  <ResultChip value={legacy} />
                  ผลเดิม{values.assessedOn ? ` ${thaiDate(values.assessedOn)}` : ""}
                </span>
              ) : locked ? (
                <span className="text-12-5 text-mut">รอผลวันที่ {prev?.day}</span>
              ) : null}

              {values[c.note] ? (
                <p className="rounded-field bg-soft/60 px-3 py-2 text-13 leading-relaxed whitespace-pre-line text-pretty">{values[c.note]}</p>
              ) : null}

              {locked ? null : (
                <button
                  type="button"
                  onClick={() => onEdit({ section: "er", only: ["erName", c.result, c.note], title: `ST · ${title}` })}
                  className={`flex w-fit cursor-pointer items-center gap-1.5 px-3 py-1.5 text-12-5 font-medium ${done ? "btn-soft" : "btn-pri"}`}
                >
                  <Pencil size={13} strokeWidth={2} aria-hidden />
                  อัปเดต
                </button>
              )}
            </li>
          );
        })}
      </ol>

      {data?.updatedBy ? (
        <p className="mt-3 text-11 text-mut">
          {data.updatedBy} · {thaiDate(data.updatedAt)}
        </p>
      ) : null}
    </section>
  );
}

/** ขั้นรถพร้อม — ไม่มีฟอร์ม สรุปรถบรรทัดเดียว + สถานะบอร์ดซ่อม · ของละเอียดอยู่ใน dialog */
function FleetSection({
  record,
  option,
  repair,
  syncedAt,
  state,
}: {
  record: OnboardingRecord;
  /** รถคันนี้ในรายการตัวเลือก — มีประเภท/จุดจอดให้สรุปโดยไม่ต้องยิงเพิ่ม */
  option: VehicleOption | undefined;
  repair: RepairStatus | null;
  /** เวลาข้อมูลของบอร์ดซ่อม — ETL ดึงเป็นรอบ ไม่ใช่เวลาสด */
  syncedAt: string | null;
  state: StepState;
}) {
  const [open, setOpen] = useState(false);
  const v = record.vehicle;
  const meta = [option?.type, option?.brand || v?.brand, option?.plant].filter(Boolean).join(" · ");

  return (
    <section id="sec-fleet" className="scroll-mt-24 border-b border-line px-(--sheet-px) py-4">
      <SectionHead step="fleet" state={state}>
        {v ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="btn-soft flex flex-none cursor-pointer items-center gap-1.5 px-3 py-1.5 text-12-5 font-medium"
          >
            <Info size={13} strokeWidth={2} aria-hidden />
            รายละเอียด
          </button>
        ) : null}
      </SectionHead>
      <div className="mt-2.5 flex flex-col gap-1.5 text-13">
        {!v ? (
          <span className="text-mut">ยังไม่ระบุรถ — ระบุได้ที่ KA</span>
        ) : (
          <>
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">{[v.code, v.plateNo].filter(Boolean).join(" · ")}</span>
              {meta ? <span className="text-12-5 text-mut">{meta}</span> : null}
            </p>
            {repair ? <RepairBadge repair={repair} /> : <p className="text-12 text-primary">ไม่มีงานซ่อมค้าง</p>}
            <p className="text-11-5 text-mut">
              ข้อมูลงานซ่อม ณ {syncedAt ? formatThaiDateTime(syncedAt) : "— อ่านเวลาไม่ได้"}
            </p>
          </>
        )}
      </div>
      {open && v ? <VehicleDetailDialog vehicle={v} onClose={() => setOpen(false)} /> : null}
    </section>
  );
}

function Value({ field, value }: { field: FieldSpec; value: string }) {
  if (field.key === "outcome") return <span className="font-medium text-alert">{field.options?.find((o) => o.value === value)?.label ?? value}</span>;
  if (field.kind === "date") return <>{thaiDate(value)}</>;
  if (field.kind === "select") return <ResultChip value={value} />;
  return <span className="whitespace-pre-line text-pretty">{value}</span>;
}

/* ------------------------------------------------------------------ ชิ้นเล็ก */

/** * แดง = ช่องที่ทำให้ขั้นนี้เสร็จ (เหมือนป้ายช่องบังคับใน `field.tsx`) */
function Star() {
  return (
    <span aria-hidden className="font-normal text-alert">
      {" "}
      *
    </span>
  );
}

function Item({
  label,
  required,
  span,
  children,
}: {
  label: string;
  required?: boolean;
  span?: "two" | "full";
  children: React.ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${span === "full" ? "sm:col-span-2 lg:col-span-3" : span === "two" ? "sm:col-span-2" : ""}`}>
      <dt className="text-11-5 text-mut">
        {label}
        {required ? <Star /> : null}
      </dt>
      <dd className="text-13">{children}</dd>
    </div>
  );
}

function Side({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-b border-line px-(--sheet-px) py-4 last:border-b-0">
      <h2 className="text-12 font-semibold text-mut">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2 text-13">
      <span className="text-12 text-mut">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function Fact({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-mut">{label}</dt>
      <dd className={`font-medium tabular-nums ${tone}`}>{value}</dd>
    </div>
  );
}

function Notice({ tone = "info", children }: { tone?: "info" | "alert"; children: React.ReactNode }) {
  return (
    <p
      className={`flex flex-wrap items-center gap-2 rounded-field px-3 py-2 text-12-5 ${
        tone === "alert" ? "bg-alert/10 text-alert" : "bg-soft text-ink"
      }`}
    >
      {tone === "alert" ? <TriangleAlert size={14} aria-hidden /> : null}
      {children}
    </p>
  );
}

function Sep() {
  return <span aria-hidden className="text-line-strong">·</span>;
}
