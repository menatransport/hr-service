"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ShieldAlert } from "lucide-react";

import { XlsxExportButton, type XlsxExportProps } from "@/components/ui/xlsx-export-button";
import { xlsxDate, type XlsxColumn } from "@/lib/xlsx-table";
import { requestJson } from "@/lib/http";
import { formatThaiDate, type DriverListRecord } from "@/app/recruitment/_lib/drivers/types";
import { CONTROLLABLE_CHIP, controllableLabel } from "@/app/recruitment/_lib/resign-reasons/types";
import {
  JOB_MATCH,
  STAGE_CHIP,
  STAGE_LABEL,
  YES_NO_UNSURE,
  type DataLogRow,
  type InterviewStage,
  type InterviewSummaryRow,
} from "@/app/recruitment/_lib/exit-interview/types";

/**
 * ชิ้นส่วน Exit Interview ที่ฝังในแท็บ “พ้นสภาพแล้ว” ของทะเบียน — แยกจาก `driver-registry-view.tsx` (ไฟล์นั้นยาวมากแล้ว)
 *
 * - `ExitReasonCell` — ทุกคนเห็นรหัส + ควบคุมได้? + เจ้าของ (Bew 24 พ.ย. 2569) · สิทธิ์ `exit-interview` เห็นชิปสถานะ กดเปิดลิ้นชัก
 * - `useInterviewSummary` — สถานะต่อคน (`GET /api/drivers/exit-interviews/summary`) โหลดเฉพาะคนมีสิทธิ์
 * - `DataLogExportButton` — ไฟล์ Excel คอลัมน์ตามชีต DataLog ของ HR ส่วนกลาง
 */

interface Ctx {
  summary: Map<string, InterviewSummaryRow> | null;
  open: (drivercode: string) => void;
}

export const ExitInterviewContext = createContext<Ctx>({ summary: null, open: () => {} });

/** `key` เปลี่ยน (เช่นหลัง `router.refresh()`) = โหลดสถานะใหม่ */
export function useInterviewSummary(enabled: boolean, key: unknown) {
  const [state, setState] = useState<{ of: unknown; map: Map<string, InterviewSummaryRow> } | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    requestJson<InterviewSummaryRow[]>("/api/drivers/exit-interviews/summary", {}, "โหลดสถานะ Exit Interview ไม่สำเร็จ")
      .then((rows) => alive && setState({ of: key, map: new Map(rows.map((r) => [r.drivercode, r])) }))
      .catch(() => alive && setState({ of: key, map: new Map() }));
    return () => {
      alive = false;
    };
  }, [enabled, key, tick]);
  return { summary: enabled ? (state?.map ?? null) : null, reload: () => setTick((t) => t + 1) };
}

/** สถานะของแถว — ไม่ใช่การพ้นสภาพแบบ `resign` (ย้ายรถร่วม/พจส.) = ไม่ต้องสัมภาษณ์ */
export function stageOfRow(d: DriverListRecord, summary: Map<string, InterviewSummaryRow> | null): InterviewStage | null {
  if (d.resignation?.kind !== "resign" || !summary) return null;
  const row = summary.get(d.drivercode);
  return row && row.exitDateISO === d.resignation.dateISO ? row.stage : "pending";
}

const INTERVIEWED: InterviewStage[] = ["wave1", "wave2_due", "wave2_late", "done"];

/** ตัวเลขสรุปของแถวในขอบเขต — Coverage = สัมภาษณ์ได้ (ไม่ใช่ N1/N2) ÷ คนพ้นสภาพแบบลาออกทั้งหมด */
export function interviewCounts(rows: DriverListRecord[], summary: Map<string, InterviewSummaryRow> | null) {
  let total = 0;
  let pending = 0;
  let wave2 = 0;
  let interviewed = 0;
  let flagged = 0;
  for (const d of rows) {
    const s = stageOfRow(d, summary);
    if (!s) continue;
    total++;
    if (s === "pending") pending++;
    if (s === "wave2_due" || s === "wave2_late") wave2++;
    if (INTERVIEWED.includes(s)) interviewed++;
    if (summary?.get(d.drivercode)?.safetyFlag) flagged++;
  }
  return { total, pending, wave2, interviewed, flagged, coverage: total ? interviewed / total : 0 };
}

export function ExitReasonCell({ driver }: { driver: DriverListRecord }) {
  const { summary, open } = useContext(ExitInterviewContext);
  const r = driver.resignation;
  const stage = stageOfRow(driver, summary);
  if (!r) return <span className="text-mut">—</span>;
  return (
    <span className="flex min-w-0 flex-col items-start gap-1">
      <span className="flex max-w-full items-center gap-1.5">
        <span className="font-mono text-12 font-semibold text-ink">{r.reasonCode}</span>
        <span className="truncate text-12 text-mut" title={r.reasonLabel}>
          {r.reasonLabel}
        </span>
      </span>
      {r.controllable || (r.owner && r.owner !== "-") || r.secondaryCodes.length ? (
        <span className="flex flex-wrap items-center gap-1 text-11-5 text-mut">
          {r.controllable ? (
            <span className={`chip px-1.5 py-0 ${CONTROLLABLE_CHIP[r.controllable]}`}>{controllableLabel(r.controllable)}</span>
          ) : null}
          {r.owner && r.owner !== "-" ? <span>{r.owner}</span> : null}
          {r.secondaryCodes.length ? <span className="font-mono">+{r.secondaryCodes.join(", ")}</span> : null}
        </span>
      ) : null}
      {stage ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            open(driver.drivercode);
          }}
          title="เปิด Exit Interview"
          className={`chip cursor-pointer px-1.5 py-0 text-11-5 transition-opacity hover:opacity-80 ${STAGE_CHIP[stage]}`}
        >
          {summary?.get(driver.drivercode)?.safetyFlag ? <ShieldAlert size={11} aria-hidden /> : null}
          {STAGE_LABEL[stage]}
          {stage === "wave2_due" || stage === "wave2_late"
            ? ` · ${formatThaiDate(summary?.get(driver.drivercode)?.wave2DueISO ?? "")}`
            : ""}
        </button>
      ) : null}
    </span>
  );
}

/* ------------------------------------------------------------ ส่งออก DataLog */

const label = <T extends string>(list: { value: T; label: string }[], v: string) =>
  list.find((o) => o.value === v)?.label ?? "";

const DATALOG_COLUMNS: XlsxColumn<DataLogRow>[] = [
  { header: "รหัสพนักงาน", width: 12, value: (r) => r.drivercode },
  { header: "ชื่อ-นามสกุล", width: 24, value: (r) => r.name },
  { header: "เบอร์ติดต่อ", width: 14, value: (r) => r.phone },
  { header: "ฝ่าย", width: 12, value: (r) => r.ownerTypeLabel },
  { header: "ตำแหน่ง", width: 14, value: (r) => r.position },
  { header: "ลูกค้า", width: 14, value: (r) => r.customer },
  { header: "สถานที่ทำงาน", width: 16, value: (r) => r.plant },
  { header: "ST Zone", width: 11, value: (r) => r.stZone },
  { header: "RC Mass", width: 11, value: (r) => r.rcOwner },
  { header: "ช่องทางสรรหา", width: 16, value: (r) => r.channel },
  { header: "วันเริ่มงาน", width: 12, kind: "date", value: (r) => xlsxDate(r.startDateISO) },
  { header: "วันสุดท้าย", width: 12, kind: "date", value: (r) => xlsxDate(r.exitDateISO) },
  { header: "เดือนที่ลาออก", width: 10, value: (r) => r.exitDateISO.slice(0, 7) },
  { header: "อายุงาน (วัน)", width: 10, value: (r) => r.tenureDays },
  { header: "ช่วงอายุงาน", width: 12, value: (r) => r.tenureBand },
  { header: "ประเภทการออก", width: 14, value: (r) => r.exitType },
  { header: "รหัสสาเหตุหลัก", width: 10, value: (r) => r.reasonCode },
  { header: "สาเหตุหลัก", width: 28, value: (r) => r.reasonLabel },
  { header: "รหัสสาเหตุรอง", width: 12, value: (r) => r.secondaryCodes },
  { header: "ควบคุมได้?", width: 14, value: (r) => r.controllable },
  { header: "เจ้าของการแก้ไข", width: 16, value: (r) => r.owner },
  { header: "สถานะ Exit Interview", width: 16, value: (r) => STAGE_LABEL[r.stage] },
  { header: "วันที่สัมภาษณ์ Wave 1", width: 12, kind: "date", value: (r) => xlsxDate(r.interview?.wave1.dateISO ?? "") },
  {
    header: "ทำการ Exit interview by HR Center",
    width: 14,
    value: (r) =>
      r.interview?.outcome === "N1" || r.interview?.outcome === "N2" ? "N1/N2" : r.interview?.wave1.completed ? "Exit interview" : "",
  },
  { header: "Q1 เริ่มคิดจะออกกี่เดือนก่อนยื่นใบลาออก", width: 10, value: (r) => r.interview?.wave1.q1Months ?? null },
  { header: "Q2 เหตุการณ์ที่ทำให้เริ่มคิดลาออก", width: 30, value: (r) => r.interview?.wave1.q2 ?? "" },
  { header: "Q3 ฟางเส้นสุดท้าย", width: 30, value: (r) => r.interview?.wave1.q3 ?? "" },
  { header: "Q4 ถ้าแก้ 1 เรื่องจะอยู่ต่อไหม", width: 10, value: (r) => label(YES_NO_UNSURE, r.interview?.wave1.q4 ?? "") },
  { header: "Q4.1 เรื่องที่อยากให้แก้", width: 18, value: (r) => r.interview?.wave1.q41Topic ?? "" },
  { header: "Q4.2 รายละเอียดเรื่องที่อยากให้แก้", width: 30, value: (r) => r.interview?.wave1.q42 ?? "" },
  { header: "Q5 ครูฝึกสัปดาห์แรก", width: 30, value: (r) => r.interview?.wave1.q5 ?? "" },
  {
    header: "Q6 งานจริงตรงกับที่บอกตอนสัมภาษณ์",
    width: 30,
    value: (r) => [label(JOB_MATCH, r.interview?.wave1.q6Match ?? ""), r.interview?.wave1.q6].filter(Boolean).join(" · "),
  },
  { header: "Q7 หัวหน้างาน", width: 16, value: (r) => r.interview?.wave1.q7 ?? "" },
  { header: "Q8 คะแนนหัวหน้า (1-5)", width: 8, value: (r) => r.interview?.wave1.q8Score ?? null },
  { header: "Q8.1 เพราะอะไร", width: 30, value: (r) => r.interview?.wave1.q81 ?? "" },
  { header: "Q9 เดือนที่แล้วรับจริง", width: 12, value: (r) => r.interview?.wave1.q9Income ?? null },
  { header: "Q9.1 ที่ใหม่ให้เท่าไร", width: 12, value: (r) => r.interview?.wave1.q91NewIncome ?? null },
  { header: "Q10 ที่ใหม่มีอะไรที่ที่นี่ไม่มี", width: 30, value: (r) => r.interview?.wave1.q10 ?? "" },
  { header: "Q11 จะเล่าให้เพื่อนฟังว่าอย่างไร", width: 30, value: (r) => r.interview?.wave1.q11 ?? "" },
  { header: "วันที่โทร Wave2", width: 12, kind: "date", value: (r) => xlsxDate(r.interview?.wave2.dateISO ?? "") },
  { header: "QW1 ทำงานที่ไหน ขับรถอะไร", width: 24, value: (r) => r.interview?.wave2.qw1 ?? "" },
  { header: "QW2 ที่ใหม่รายได้เท่าไร", width: 12, value: (r) => r.interview?.wave2.qw2Income ?? null },
  { header: "QW2.1 ตารางงาน", width: 24, value: (r) => r.interview?.wave2.qw21 ?? "" },
  { header: "QW3 เหตุผลจริงที่ออก", width: 30, value: (r) => r.interview?.wave2.qw3 ?? "" },
  { header: "QW3.1 รหัสสาเหตุ", width: 10, value: (r) => r.interview?.wave2.qw31Code ?? "" },
  { header: "QW4 ถ้าแก้ได้จะกลับมาไหม", width: 10, value: (r) => label(YES_NO_UNSURE, r.interview?.wave2.qw4 ?? "") },
  { header: "QW5 สิ่งที่ที่ใหม่ทำ", width: 30, value: (r) => r.interview?.wave2.qw5 ?? "" },
  { header: "รายได้สุทธิ ย้อนหลัง 3 เดือน", width: 12, value: (r) => r.interview?.income.net ?? null },
  { header: "รายได้เฉลี่ย ย้อนหลัง 3 เดือน", width: 12, value: (r) => r.interview?.income.average ?? null },
  { header: "รายการหักเฉลี่ย ย้อนหลัง 3 เดือน", width: 12, value: (r) => r.interview?.income.deduction ?? null },
  { header: "แจ้ง HR Chief", width: 8, value: (r) => (r.interview?.safetyFlag ? "ใช่" : "") },
];

export function DataLogExportButton({ rows, filter }: { rows: DriverListRecord[]; filter: string }) {
  const codes = useMemo(() => rows.filter((d) => d.resignation?.kind === "resign").map((d) => d.drivercode), [rows]);
  const props: XlsxExportProps<DataLogRow> = {
    name: "Exit-Interview-DataLog",
    count: codes.length,
    build: async () => ({
      sheet: "DataLog",
      title: "Exit Interview · DataLog (1 แถว = 1 คน)",
      filter,
      columns: DATALOG_COLUMNS,
      rows: await requestJson<DataLogRow[]>(
        "/api/drivers/exit-interviews/export",
        { method: "POST", body: { codes } },
        "ดึงข้อมูล DataLog ไม่สำเร็จ",
      ),
    }),
  };
  return <XlsxExportButton {...props} label="DataLog" />;
}
