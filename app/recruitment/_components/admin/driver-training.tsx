"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  CalendarDays,
  Loader2,
  PencilLine,
  ClipboardList,
  GraduationCap,
  Hash,
  MapPin,
  Phone,
  Truck,
  User,
  UserCheck,
} from "lucide-react";

import { CandidateRcForm } from "@/app/recruitment/_components/admin/candidate-rc-form";
import { Field, Section } from "@/app/recruitment/_components/admin/driver-profile-parts";
import { OnboardingSectionForm } from "@/app/recruitment/_components/admin/onboarding-section-form";
import { TraineeCell } from "@/app/recruitment/_components/admin/trainee-cell";
import {
  THAI_WEEKDAYS_SHORT,
  formatThaiDate,
  isExitStatus,
  type DriverRecord,
  type TraineeDailyEntry,
} from "@/app/recruitment/_lib/drivers/types";
import { TONES, TONE_DOT, TONE_LABEL, cellTone } from "@/app/recruitment/_lib/drivers/trainees";
import type { Journey } from "@/app/recruitment/_lib/requisitions/onboarding-store";
import {
  PIPELINE_LABEL,
  STAGE_LABEL,
  ST_CHECKPOINTS,
  outcomeGroup,
  outcomeLabel,
  pipelineOf,
  stageOf,
  trainingDayOn,
  trainingStart,
  val,
  type OnboardingRecord,
  type OnboardingSection,
} from "@/app/recruitment/_lib/requisitions/onboarding";
import { customerLabel, positionLabel } from "@/app/recruitment/_lib/requisitions/types";
import { EmptyState } from "@/components/ui/empty-state";
import { requestJson } from "@/lib/http";
import { todayInBangkok } from "@/lib/record-case-flow";
import { toastError } from "@/lib/swal";

/**
 * แท็บ “ข้อมูลฝึกงาน” ของหน้าประวัติ พจส. (Bew 8 พ.ย. 2569) — RC · ตารางสถานะช่วงฝึก · KA · ST · HRD
 *
 * ข้อมูลฝ่ายมาจากคำขอสรรหาที่ผูกรหัสนี้ (`recruitment_requests.onboarding`) · ตารางรายวันใช้ `work.days` (ATMS)
 * + `manualDays` (RC กรอก) ชุดเดียวกับปฏิทินการทำงาน แต่ตัดเหลือ **เฉพาะช่วงที่ฝึกงาน**
 *
 * **แก้ได้ในแท็บนี้** (Bew 8 พ.ย. 2569 · เฉพาะสิทธิ์ “↳ ประวัติ”) — ใช้ฟอร์มตัวเดิมของระบบ ไม่มีชุดที่สอง:
 * RC = `CandidateRcForm` (ล็อก JR · ไม่มีใบสมัคร = ฟอร์ม RC ของหน้าติดตาม) · KA / ST ทีละรอบ / HRD =
 * `OnboardingSectionForm` (โหลด journey ตอนกดแก้ครั้งแรก) · ตารางรายวัน = `TraineeCell` ช่องเดียวกับตาราง RC
 */
export function DriverTraining({
  record: initialRecord,
  driver,
  canEdit,
}: {
  record: OnboardingRecord | null;
  driver: DriverRecord;
  canEdit: boolean;
}) {
  const router = useRouter();
  const today = todayInBangkok();
  const [record, setRecord] = useState(initialRecord);
  const [manual, setManual] = useState(driver.manualDays ?? {});
  const [journey, setJourney] = useState<Journey | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);

  const view = { ...driver, manualDays: manual };
  const range = trainingRange(record, view, today);

  function saved(next: OnboardingRecord) {
    setRecord(next);
    router.refresh();
  }

  /** เปิดฟอร์ม — KA/ST/HRD ต้องมี journey (รายชื่อครูฝึก/รถ/บอร์ดซ่อม) โหลดครั้งแรกที่กด */
  async function open(next: Editing) {
    if (!record) return;
    if (next.kind === "rc" || journey) return setEditing(next);
    const key = next.only?.join() ?? next.section;
    setLoading(key);
    try {
      setJourney(await requestJson<Journey>(`/api/recruitment/requisitions/${record.id}/journey`, {}, "โหลดข้อมูลไม่สำเร็จ"));
      setEditing(next);
    } catch (err) {
      toastError("เปิดฟอร์มไม่สำเร็จ", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(null);
    }
  }

  const edit = canEdit && record ? { open, loading } : null;

  if (!record && !range) {
    return (
      <EmptyState
        title="ไม่มีข้อมูลฝึกงาน"
        hint="รหัสนี้ไม่ได้ผูกกับคำขอสรรหา และไม่มีวันฝึกงาน (ฝ) ในสถานะรายวัน — เช่น พจส. เก่าที่เข้าทะเบียนก่อนมีระบบติดตาม"
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {record ? <RcSection record={record} edit={edit} /> : null}
      <DailySection
        driver={view}
        record={record}
        range={range}
        today={today}
        canEdit={canEdit}
        onDaySaved={(iso, entry) =>
          setManual((prev) => {
            const next = { ...prev };
            if (entry) next[iso] = entry;
            else delete next[iso];
            return next;
          })
        }
      />
      {record ? (
        <div className="grid gap-6 border-t border-line pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,0.8fr)] lg:gap-0">
          <div className="lg:pr-6">
            <KaSection record={record} edit={edit} />
          </div>
          <div className="border-t border-line pt-6 lg:border-t-0 lg:border-l lg:px-6 lg:pt-0">
            <StSection record={record} edit={edit} />
          </div>
          <div className="border-t border-line pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
            <HrdSection record={record} edit={edit} />
          </div>
        </div>
      ) : null}

      {editing?.kind === "rc" && record ? (
        record.match ? (
          <CandidateRcForm
            applicationId={record.match.applicationId}
            linked={record}
            requisitions={[record]}
            name={record.match.fullName || record.hireName}
            contactOwner=""
            fixed
            onClose={() => setEditing(null)}
            onLinked={() => router.refresh()}
            onSaved={saved}
          />
        ) : null
      ) : null}
      {editing && editing.kind !== "rc" && record && journey ? (
        <OnboardingSectionForm
          record={record}
          section={editing.section}
          only={editing.only}
          title={editing.title}
          journey={journey}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ การแก้ไข */

type Editing =
  | { kind: "rc" }
  | { kind: "section"; section: OnboardingSection; only?: readonly string[]; title?: string };

/** `null` = อ่านอย่างเดียว (ไม่มีสิทธิ์ หรือไม่มีคำขอ) */
type Edit = { open: (e: Editing) => void; loading: string | null } | null;

function EditButton({ edit, target, label = "แก้ไข" }: { edit: Edit; target: Editing; label?: string }) {
  if (!edit) return null;
  const key = target.kind === "rc" ? "rc" : (target.only?.join() ?? target.section);
  const busy = edit.loading === key;
  return (
    <button
      type="button"
      onClick={() => edit.open(target)}
      disabled={Boolean(edit.loading)}
      className="flex items-center gap-1 rounded-field border border-line px-2.5 py-1.5 text-11-5 font-medium text-mut transition-colors hover:border-primary/40 hover:text-primary disabled:pointer-events-none disabled:opacity-60"
    >
      {busy ? (
        <Loader2 size={13} strokeWidth={2} aria-hidden className="animate-spin" />
      ) : (
        <PencilLine size={13} strokeWidth={2} aria-hidden />
      )}
      {label}
    </button>
  );
}

/* ------------------------------------------------------------ RC */

function RcSection({ record, edit }: { record: OnboardingRecord; edit: Edit }) {
  const ob = record.onboarding;
  const rc = ob.rc;
  const stage = stageOf(record);
  const pipeline = pipelineOf(record);
  const ended = ["withdrawn", "lost"].includes(outcomeGroup(record.outcome));
  const handoverOn = val(ob, "handover", "handoverOn");

  return (
    <Section
      title="RC · แจ้งเริ่มฝึก"
      note={rc?.updatedAt ? `อัปเดต ${formatThaiDate(rc.updatedAt.slice(0, 10))}${rc.updatedBy ? ` · ${rc.updatedBy}` : ""}` : undefined}
      action={
        <>
        {/* ใบที่ไม่มีใบสมัครผูก (นำเข้าจาก Excel) — RC อยู่ในฟอร์มของหน้าติดตาม */}
        <EditButton
          edit={edit}
          target={record.match ? { kind: "rc" } : { kind: "section", section: "rc", title: "RC · แจ้งเริ่มฝึก" }}
        />
        <Link
          href={`/recruitment/admin/onboarding/${record.id}`}
          title="เปิดที่หน้าติดตามพนักงานใหม่"
          className="flex items-center gap-1 rounded-field border border-line px-2.5 py-1.5 text-11-5 font-medium text-mut transition-colors hover:border-primary/40 hover:text-primary"
        >
          <span className="font-mono">{record.code}</span>
          <ArrowUpRight size={13} strokeWidth={2} aria-hidden />
        </Link>
        </>
      }
    >
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          icon={ClipboardList}
          label="ขั้นตอนตอนนี้"
          value={pipeline ? PIPELINE_LABEL[pipeline] : STAGE_LABEL[stage]}
          note={ended ? outcomeLabel(record.outcome) : undefined}
          noteTone={ended ? "alert" : "mut"}
        />
        <Field
          icon={User}
          label="ชื่อ - นามสกุล"
          value={val(ob, "rc", "fullName") || record.match?.fullName || record.hireName}
          note={record.match?.ref || undefined}
        />
        <Field icon={Phone} label="เบอร์ติดต่อ" value={val(ob, "rc", "phone")} mono />
        <Field
          icon={MapPin}
          label="ตำแหน่ง · ลูกค้า"
          value={[positionLabel(record), customerLabel(record)].filter(Boolean).join(" · ")}
          note={record.plant || undefined}
        />
        <Field icon={CalendarDays} label="วันที่แจ้ง" value={formatThaiDate(val(ob, "rc", "notifiedOn"), "full")} />
        <Field icon={UserCheck} label="RC ผู้แจ้ง" value={val(ob, "rc", "rcName")} />
        <Field
          icon={CalendarDays}
          label="วันเริ่มฝึก"
          value={formatThaiDate(trainingStart(record), "full")}
          note={record.trainedDays !== undefined ? `ฝึกมาแล้ว ${record.trainedDays} วัน` : undefined}
          noteTone="primary"
        />
        {ended ? (
          <Field
            icon={CalendarDays}
            label="วันที่สิ้นสุด"
            value={formatThaiDate(val(ob, "rc", "exitOn"), "full")}
            note={outcomeLabel(record.outcome)}
            noteTone="alert"
          />
        ) : (
          <Field
            icon={Truck}
            label="วันรับรถจริง"
            value={formatThaiDate(handoverOn, "full")}
            note={val(ob, "handover", "result") || undefined}
          />
        )}
      </dl>
    </Section>
  );
}

/* ------------------------------------------------------------ ตารางรายวัน */

const DAY_MS = 86_400_000;
/** กันข้อมูลเพี้ยน (เช่น วันเริ่มฝึกผิดปี) ไม่ให้ตารางยาวเป็นปี */
const MAX_DAYS = 62;
const TRAINING_CODE = "ฝ";

const addDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

interface Range {
  from: string;
  to: string;
}

/**
 * ช่วงฝึกงาน — เริ่ม = วันเริ่มฝึก (RC) หรือวัน `ฝ` แรก แล้วแต่อันไหนก่อน · จบ = วัน `ฝ` สุดท้าย / วันรับรถ /
 * วันนี้ (ถ้ายังอยู่ขั้นฝึกงาน) อันที่หลังสุด · มีวันพ้นสภาพ (`ลอ` `ปอ` …) ภายใน 7 วันหลังวันฝึกสุดท้ายก็รวมด้วย
 * · ยังไม่ถึงวันเริ่มฝึก = `null`
 */
function trainingRange(record: OnboardingRecord | null, driver: DriverRecord, today: string): Range | null {
  const atms = driver.work?.days ?? {};
  const manual = driver.manualDays ?? {};
  const codeOn = (iso: string) => (atms[iso] || manual[iso]?.code || "").trim();
  const allDays = [...new Set([...Object.keys(atms), ...Object.keys(manual)])].sort();
  const trainDays = allDays.filter(
    (iso) => atms[iso]?.trim() === TRAINING_CODE || manual[iso]?.code.trim() === TRAINING_CODE,
  );

  const start = record ? trainingStart(record).slice(0, 10) : "";
  const from = [start, trainDays[0]].filter(Boolean).sort()[0];
  if (!from || from > today) return null;

  const lastTrain = trainDays.at(-1) ?? "";
  const stillTraining = record ? ["training", "waitHandover"].includes(pipelineOf(record) ?? "") : false;
  const exitDay = lastTrain
    ? allDays.find((iso) => iso > lastTrain && iso <= addDays(lastTrain, 7) && isExitStatus(codeOn(iso)))
    : undefined;
  const ends = [
    lastTrain,
    record ? val(record.onboarding, "handover", "handoverOn") : "",
    stillTraining ? today : "",
    exitDay ?? "",
  ].filter((d) => d && d >= from);

  let to = ends.sort().at(-1) ?? from;
  if (to > today) to = today;
  const cap = addDays(from, MAX_DAYS - 1);
  if (to > cap) to = cap;
  return { from, to };
}

interface Day {
  iso: string;
  atms: string;
  manual: string;
  note: string;
  trial: boolean;
}

function DailySection({
  driver,
  record,
  range,
  today,
  canEdit,
  onDaySaved,
}: {
  driver: DriverRecord;
  record: OnboardingRecord | null;
  range: Range | null;
  today: string;
  canEdit: boolean;
  onDaySaved: (iso: string, entry: TraineeDailyEntry | null) => void;
}) {
  if (!range) {
    const start = record ? trainingStart(record) : "";
    return (
      <Section title="สถานะฝึกงานรายวัน">
        <p className="text-12-5 text-mut">
          {start ? `เริ่มฝึก ${formatThaiDate(start.slice(0, 10), "full")} — ยังไม่มีวันฝึกงาน` : "ยังไม่มีวันเริ่มฝึก"}
        </p>
      </Section>
    );
  }

  const atms = driver.work?.days ?? {};
  const manual = driver.manualDays ?? {};
  const days: Day[] = [];
  for (let iso = range.from; iso <= range.to; iso = addDays(iso, 1)) {
    days.push({
      iso,
      atms: (atms[iso] ?? "").trim(),
      manual: (manual[iso]?.code ?? "").trim(),
      note: manual[iso]?.note ?? "",
      trial: manual[iso]?.trial === true,
    });
  }

  /* นับตามโทนของรหัสที่ใช้ (ATMS ก่อน — กติกาเดียวกับตารางรายวัน `effectiveCode`) */
  const counts = { work: 0, leave: 0, exit: 0 };
  for (const d of days) {
    const code = d.atms || d.manual;
    if (code) counts[cellTone(code)] += 1;
  }

  const months = new Map<string, Day[]>();
  for (const d of days) {
    const key = d.iso.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), d]);
  }

  return (
    <Section
      title="สถานะฝึกงานรายวัน"
      note={`${formatThaiDate(range.from)} – ${formatThaiDate(range.to)} · ${days.length} วัน · มุมบนซ้าย = ATMS · ล่างขวา = RC กรอก${
        canEdit ? " (กดช่องเพื่อเลือกสถานะ)" : ""
      }`}
    >
      <div className="flex flex-col gap-3">
        {[...months].map(([key, list]) => (
          <div key={key} className="flex flex-col gap-1.5 sm:flex-row sm:gap-3">
            <span className="w-16 flex-none pt-1 text-11-5 font-medium text-mut">
              {formatThaiDate(`${key}-01`).replace(/^1 /, "")}
            </span>
            <div className="overflow-x-auto">
              <table className="border-separate border-spacing-0">
                <thead>
                  <tr>
                    {list.map((d) => {
                      const weekday = new Date(`${d.iso}T00:00:00Z`).getUTCDay();
                      return (
                        <th key={d.iso} scope="col" className="w-10 min-w-10 px-0.5 pb-1 text-center font-normal">
                          <span className={`block text-10 ${weekday === 0 ? "text-alert" : "text-mut"}`}>
                            {THAI_WEEKDAYS_SHORT[weekday]}
                          </span>
                          <span
                            className={`mx-auto block w-fit rounded-full px-1.5 font-mono text-10-5 ${
                              d.iso === today ? "bg-ink text-ink-content" : "text-mut"
                            }`}
                          >
                            {Number(d.iso.slice(8))}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {list.map((d) => (
                      <TraineeCell
                        key={d.iso}
                        drivercode={driver.drivercode}
                        driverName={driver.name || driver.drivercode}
                        iso={d.iso}
                        atms={d.atms}
                        manual={d.manual}
                        note={d.note}
                        trial={d.trial}
                        beforeStart={false}
                        isStart={d.iso === range.from}
                        editable={canEdit && d.iso <= today}
                        onSaved={(_, iso, entry) => onDaySaved(iso, entry)}
                      />
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-12">
        {TONES.map((tone) => (
          <span key={tone} className="flex items-center gap-1.5">
            <span aria-hidden className={`size-2.5 rounded-full ${TONE_DOT[tone]}`} />
            {TONE_LABEL[tone]} <span className="font-mono text-mut">{counts[tone]}</span>
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-mut">
          <span aria-hidden className="size-2.5 rounded-full bg-base-300" />
          ไม่มีบันทึก
        </span>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------ KA · ST · HRD */

function KaSection({ record, edit }: { record: OnboardingRecord; edit: Edit }) {
  const ob = record.onboarding;
  const coDriver = val(ob, "ka", "coDriver");
  return (
    <Section
      title="KA · ครูฝึก / รถ"
      action={<EditButton edit={edit} target={{ kind: "section", section: "ka" }} />}
    >
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <Field icon={UserCheck} label="KA ที่ดูแล" value={val(ob, "ka", "kaName")} />
        <Field
          icon={GraduationCap}
          label="ครูฝึก"
          value={record.trainer?.name ?? ""}
          note={record.trainer?.drivercode || undefined}
        />
        <Field
          icon={Truck}
          label="รถฝึก"
          value={record.vehicle ? record.vehicle.plateNo || record.vehicle.code : ""}
          note={record.vehicle ? [record.vehicle.code, record.vehicle.brand].filter(Boolean).join(" · ") : undefined}
        />
        <Field
          icon={Hash}
          label="อบรม Co-Driver"
          value={coDriver}
          note={coDriver === "อบรม" ? formatThaiDate(val(ob, "ka", "coDriverOn"), "full") || undefined : undefined}
        />
      </dl>
    </Section>
  );
}

/** ผลที่ผ่าน = เขียว · ไม่ผ่าน/ไม่มา/ลาออก = แดง · ที่เหลือ (ฝึกงานต่อ · ไม่ตรวจ) = เหลือง */
function resultTone(result: string): string {
  if (/^ผ่าน/.test(result)) return "bg-st-live text-st-live-ink";
  if (/ไม่ผ่าน|ไม่มา|ลาออก/.test(result)) return "bg-alert-soft text-alert";
  return "bg-st-wait text-st-wait-ink";
}

function StSection({ record, edit }: { record: OnboardingRecord; edit: Edit }) {
  const ob = record.onboarding;
  const start = trainingStart(record);
  const coDriver = val(ob, "ka", "coDriver") === "อบรม";
  const titles: Record<number, string> = { 1: "ตรวจวันแรก · Alc./สาร", 4: "ติดตามกลางฝึก", 8: "ประเมินก่อนรับรถ" };

  return (
    <Section title="ผล ST · Safety Trainer" note={val(ob, "er", "erName") ? `ST ที่ดูแล ${val(ob, "er", "erName")}` : undefined}>
      <ol className="flex flex-col divide-y divide-line">
        {ST_CHECKPOINTS.map((c, i) => {
          const prev = i ? ST_CHECKPOINTS[i - 1] : null;
          const result = val(ob, "er", c.result);
          /* รอบถัดไปเปิดหลังลงผลรอบก่อน — กติกาเดียวกับการ์ด ST หน้าติดตาม */
          const locked = Boolean(prev && !val(ob, "er", prev.result) && !result);
          const on = val(ob, "er", c.on) || trainingDayOn(start, c.day);
          const note = val(ob, "er", c.note);
          return (
            <li key={c.day} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="flex size-8 flex-none flex-col items-center justify-center rounded-field bg-primary/10 text-primary">
                <span className="text-9-5 leading-none">วันที่</span>
                <span className="font-mono text-12 leading-tight font-bold">{c.day}</span>
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-12-5 font-medium">{titles[c.day]}</span>
                  <span className="flex items-center gap-2 text-11-5 text-mut">
                    {formatThaiDate(on.slice(0, 10))}
                    {locked ? null : (
                      <EditButton
                        edit={edit}
                        label={result ? "แก้ไข" : "ลงผล"}
                        target={{
                          kind: "section",
                          section: "er",
                          only: [c.result, c.on, c.note],
                          title: `ST · วันที่ ${c.day} ${titles[c.day]}`,
                        }}
                      />
                    )}
                  </span>
                </div>
                {result ? (
                  <span className={`w-fit rounded-selector px-2 py-0.5 text-11-5 font-medium ${resultTone(result)}`}>
                    {result}
                  </span>
                ) : (
                  <span className="text-12 text-mut">{locked ? `รอผลวันที่ ${prev?.day}` : "ยังไม่ลงผล"}</span>
                )}
                {note ? <p className="text-12 text-mut text-pretty">{note}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>
      {coDriver ? (
        <div className="flex items-start gap-3 border-t border-line pt-3">
          <dl className="grid flex-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <Field label="ผล Co-Driver" value={val(ob, "er", "coDriverResult")} />
            <Field label="วิทยากร / หมายเหตุ" value={val(ob, "er", "coDriverNote")} />
          </dl>
          <EditButton
            edit={edit}
            target={{
              kind: "section",
              section: "er",
              only: ["coDriverResult", "coDriverNote"],
              title: "ST · ผล Co-Driver",
            }}
          />
        </div>
      ) : null}
    </Section>
  );
}

function HrdSection({ record, edit }: { record: OnboardingRecord; edit: Edit }) {
  const ob = record.onboarding;
  const score = val(ob, "hrd", "examScore");
  return (
    <Section
      title="ผล HRD · ปฐมนิเทศ"
      action={<EditButton edit={edit} target={{ kind: "section", section: "hrd" }} />}
    >
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-1">
        <Field icon={CalendarDays} label="วันปฐมนิเทศ" value={formatThaiDate(val(ob, "hrd", "orientationOn"), "full")} />
        <Field icon={ClipboardList} label="คะแนนสอบ" value={score} mono />
      </dl>
    </Section>
  );
}
