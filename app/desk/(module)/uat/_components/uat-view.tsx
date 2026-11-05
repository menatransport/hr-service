"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleAlert,
  Dices,
  Eraser,
  Hourglass,
  Loader2,
  Plus,
  Power,
  Search,
  UserPlus,
  X,
} from "lucide-react";

import { PageHead } from "@/components/desk/page-head";
import { Avatar } from "@/components/ui/avatar";
import { SummaryPanel, SummaryStat, SummaryStats } from "@/components/ui/summary-panel";
import { requestJson } from "@/lib/http";
import { pageZoom } from "@/lib/page-zoom";
import { confirm, toastError, toastSuccess } from "@/lib/swal";
import type { UatClearPlan } from "@/lib/uat-store";
import {
  UAT_FLOW,
  UAT_PHASES,
  UAT_RULES,
  UAT_SCOPE,
  UAT_TEAMS,
  caseState,
  caseTurn,
  passedCases,
  teamProgress,
  type UatBoard,
  type UatCase,
  type UatResult,
  type UatTeam,
  type UatTester,
} from "@/lib/uat";

export interface UatPerson extends UatTester {
  department: string;
  divisionId: number | null;
}

/**
 * หน้า “จัดการ UAT” — เส้นทางทดสอบเส้นเดียวตามขั้น (`UAT_PHASES`) ข้ามฝ่าย: แต่ละข้อบอกว่าค้างที่ใคร
 * (กดชื่อข้อดูวิธีทำ) · กติกาก่อนเริ่ม · ผู้ทดสอบรายฝ่าย
 * ผู้ทดสอบติ๊กผลเองจากแผงมุมขวาล่าง (`components/uat/uat-dock.tsx`) — หน้านี้ดูอย่างเดียว ยกเว้นรายชื่อ สวิตช์
 * และปุ่มสุ่มผู้สมัครทดสอบ (ใบสมัครจริงชื่อขึ้นต้น UAT- ให้ MASS ใช้ทดสอบต่อ)
 */
export function UatView({
  board: initial,
  people,
  applicants,
}: {
  board: UatBoard;
  people: UatPerson[];
  applicants: number;
}) {
  const [board, setBoard] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [applicantCount, setApplicantCount] = useState(applicants);
  const [generating, setGenerating] = useState(false);
  const [created, setCreated] = useState<{ ref: string; fullName: string }[]>([]);

  const createApplicant = async () => {
    setGenerating(true);
    try {
      const res = await requestJson<{ ref: string; fullName: string }>("/api/uat/applicant", { method: "POST" });
      setCreated((list) => [res, ...list]);
      setApplicantCount((n) => n + 1);
      toastSuccess("สร้างผู้สมัครทดสอบแล้ว", `${res.fullName} · ${res.ref}`);
    } catch (e) {
      toastError("สร้างผู้สมัครไม่สำเร็จ", e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  /* ล้างข้อมูล UAT — ถามพร้อมจำนวนจริงก่อน · ผู้ทดสอบกับสวิตช์คงไว้ (ดู `clearUatData`) */
  const clearAll = async () => {
    setBusy(true);
    try {
      const plan = await requestJson<UatClearPlan>("/api/uat/clear");
      const lines = [
        `ผู้สมัครทดสอบ (UAT-) <b>${plan.applications}</b> ใบ`,
        `คำขอสรรหาที่หมายเหตุขึ้นต้น “UAT” <b>${plan.requisitionsDeleted}</b> ใบ`,
        plan.requisitionsReset ? `คำขอจริงที่ผูกคนทดสอบ ปลดกลับเป็นเปิดรับ <b>${plan.requisitionsReset}</b> ใบ` : "",
        plan.drivers ? `คนทดสอบในทะเบียนประวัติ (รหัส UAT) <b>${plan.drivers}</b> คน` : "",
        `ผลทดสอบ <b>${plan.results}</b> รายการ`,
      ].filter(Boolean);
      const ok = await confirm({
        title: "ล้างข้อมูล UAT?",
        html: `${lines.join("<br>")}<br><br><span style="opacity:.7">ผู้ทดสอบและสวิตช์ UAT คงไว้ · ระบบเก็บสำเนาไว้ก่อนลบ</span>`,
        confirmText: "ล้างข้อมูล",
        tone: "danger",
      });
      if (!ok) return;
      const done = await requestJson<UatClearPlan>("/api/uat/clear", {
        method: "POST",
      });
      setBoard(await requestJson<UatBoard>("/api/uat"));
      setApplicantCount(0);
      setCreated([]);
      toastSuccess(
        "ล้างข้อมูล UAT แล้ว",
        `ผู้สมัคร ${done.applications} · คำขอ ${done.requisitionsDeleted + done.requisitionsReset} · ทะเบียน ${done.drivers} · ผล ${done.results}`,
      );
    } catch (e) {
      toastError("ล้างข้อมูลไม่สำเร็จ", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const save = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      setBoard(await requestJson<UatBoard>("/api/uat", { method: "PUT", body }));
    } catch (e) {
      toastError("บันทึกไม่สำเร็จ", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const total = UAT_TEAMS.reduce((n, t) => n + t.cases.length, 0);
  const progress = UAT_TEAMS.map((t) => teamProgress(t, board.results));
  const pass = progress.reduce((n, p) => n + p.pass, 0);
  const fail = progress.reduce((n, p) => n + p.fail, 0);
  const passed = passedCases(board.results);
  /* ขั้นปัจจุบัน = ขั้นแรกที่ยังมีข้อไม่ผ่าน */
  const currentPhase = UAT_PHASES.find((ph) =>
    UAT_FLOW.some(({ item }) => item.phase === ph.no && caseState(board.results, item.id) !== "pass"),
  )?.no;
  const testers = new Set(Object.values(board.testers).flatMap((list) => list.map((x) => x.employeeId))).size;

  return (
    <div className="flex animate-rise flex-col gap-5 pb-8">
      <PageHead
        title="จัดการ UAT"
        subtitle={`${UAT_SCOPE} — ผู้ทดสอบเห็นปุ่ม UAT มุมขวาล่าง แล้วติ๊กผ่านทีละข้อ`}
        actions={
          <>
            <button
              type="button"
              disabled={busy}
              onClick={clearAll}
              className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-12-5 hover:text-alert"
            >
              <Eraser size={14} aria-hidden /> ล้างข้อมูล UAT
            </button>
            <button
              type="button"
              disabled={busy || generating}
              onClick={createApplicant}
              className="btn-sec flex items-center gap-1.5 px-3 py-2 text-12-5"
            >
              {generating ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Dices size={14} aria-hidden />}
              สุ่มผู้สมัครทดสอบ
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => save({ active: !board.active })}
              aria-pressed={board.active}
              className={`flex items-center gap-2 px-3.5 py-2 text-12-5 ${board.active ? "btn-pri" : "btn-sec"}`}
            >
              <Power size={14} aria-hidden />
              {board.active ? "UAT เปิดอยู่" : "UAT ปิดอยู่"}
            </button>
          </>
        }
      />

      <SummaryPanel label="สรุปผล UAT">
        <SummaryStats>
          <SummaryStat lead label="ผ่านแล้ว" value={pass} unit={`/ ${total} ข้อ`} share={total ? pass / total : 0} />
          <SummaryStat
            label="พบปัญหา"
            value={fail}
            unit="ข้อ"
            tone={fail ? "alert" : "ink"}
            dot={fail ? "bg-alert" : undefined}
          />
          <SummaryStat label="ผู้ทดสอบ" value={testers} unit="คน" />
          <SummaryStat label="ผู้สมัครทดสอบ" value={applicantCount} unit="ใบ" sub="ชื่อขึ้นต้น UAT-" />
        </SummaryStats>
      </SummaryPanel>

      {created.length ? (
        <div className="flex flex-wrap items-center gap-1.5 text-12">
          <span className="text-mut">เพิ่งสุ่ม</span>
          {created.map((c) => (
            <Link
              key={c.ref}
              href={`/recruitment/admin/candidates?ref=${encodeURIComponent(c.ref)}`}
              className="flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-primary hover:border-primary/40"
            >
              {c.fullName} · {c.ref} <ArrowUpRight size={12} aria-hidden />
            </Link>
          ))}
        </div>
      ) : null}

      {/* เส้นทางทดสอบ — เส้นเดียวตามขั้น แต่ละข้อบอกว่าค้างที่ใคร · กดชื่อข้อดูวิธีทำ */}
      <section aria-labelledby="uat-flow" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <h2 id="uat-flow" className="text-13 font-semibold">
            เส้นทางทดสอบ
          </h2>
          <p className="text-12 text-mut">กดชื่อข้อเพื่อดูวิธีทดสอบ</p>
        </div>
        <ol className="flex flex-col">
          {UAT_PHASES.map((phase) => (
            <PhaseSection
              key={phase.no}
              phase={phase}
              current={phase.no === currentPhase}
              last={phase.no === UAT_PHASES.length}
              items={UAT_FLOW.filter((x) => x.item.phase === phase.no)}
              testers={board.testers}
              results={board.results}
              passed={passed}
            />
          ))}
        </ol>
        <details className="group text-12-5">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-mut hover:text-ink [&::-webkit-details-marker]:hidden">
            กติกาก่อนเริ่มทดสอบ ({UAT_RULES.length} ข้อ)
            <ChevronDown size={14} className="transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <ol className="mt-1.5 flex list-decimal flex-col gap-0.5 pl-5 text-mut">
            {UAT_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ol>
        </details>
      </section>

      {/* ผู้ทดสอบรายฝ่าย */}
      <section aria-labelledby="uat-testers" className="flex flex-col gap-2">
        <h2 id="uat-testers" className="text-13 font-semibold">
          ผู้ทดสอบรายฝ่าย
        </h2>
        <div className="sheet-bleed grid divide-y divide-line border-y border-line sm:grid-cols-2 xl:grid-cols-4 xl:divide-y-0 xl:divide-x">
          {UAT_TEAMS.map((team) => (
            <TeamTesters
              key={team.id}
              team={team}
              testers={board.testers[team.id] ?? []}
              people={people}
              busy={busy}
              onTesters={(list) => save({ team: team.id, testers: list })}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

/** ฝ่ายหนึ่ง — รายชื่อผู้ทดสอบ (เพิ่ม/เอาออก) */
function TeamTesters({
  team,
  testers,
  people,
  busy,
  onTesters,
}: {
  team: UatTeam;
  testers: UatTester[];
  people: UatPerson[];
  busy: boolean;
  onTesters: (list: UatTester[]) => void;
}) {
  const ids = new Set(testers.map((t) => t.employeeId));

  return (
    <div className="flex min-w-0 flex-col gap-2.5 px-(--sheet-px) py-3.5">
      <div className="min-w-0">
        <p className="text-14 font-semibold">{team.short}</p>
        <p className="truncate text-12 text-mut" title={team.label}>
          {team.label}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {testers.map((t) => (
          <span
            key={t.employeeId}
            className="flex items-center gap-1.5 rounded-full border border-line py-0.5 pr-1 pl-0.5 text-12"
          >
            <Avatar name={t.name} src={t.imageUrl} size="sm" className="size-6! text-10!" />
            <span className="max-w-[9rem] truncate" title={`${t.name} · ${t.position}`}>
              {t.name}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => onTesters(testers.filter((x) => x.employeeId !== t.employeeId))}
              aria-label={`เอา ${t.name} ออก`}
              className="grid size-5 place-items-center rounded-full text-mut hover:bg-base-200 hover:text-alert"
            >
              <X size={12} aria-hidden />
            </button>
          </span>
        ))}
        <TesterPicker
          team={team}
          people={people.filter((x) => !ids.has(x.employeeId))}
          disabled={busy}
          empty={!testers.length}
          onPick={(x) =>
            onTesters([
              ...testers,
              {
                employeeId: x.employeeId,
                name: x.name,
                position: x.position,
                imageUrl: x.imageUrl,
              },
            ])
          }
        />
      </div>
    </div>
  );
}

type FlowItem = { team: UatTeam; item: UatCase };

/** หน้าผู้ทดสอบแบบซ้อน — `dim` = คนที่ลงผลข้อนี้แล้ว · ไม่มีคน = บอกให้เพิ่มผู้ทดสอบ */
function Faces({ list, dim }: { list: UatTester[]; dim?: ReadonlySet<string> }) {
  if (!list.length) return <span className="text-12 text-alert">ยังไม่มีผู้ทดสอบ</span>;
  return (
    <span className="flex -space-x-1.5">
      {list.map((t) => (
        <span
          key={t.employeeId}
          title={t.name}
          className={`rounded-full ring-2 ring-base-100 ${dim?.has(t.employeeId) ? "opacity-35 grayscale" : ""}`}
        >
          <Avatar name={t.name} src={t.imageUrl} size="sm" className="size-6! text-10!" />
        </span>
      ))}
    </span>
  );
}

/** ขั้นหนึ่งบนเส้น — วงกลม + เส้นต่อลงขั้นถัดไป · ข้อในขั้นเดียวกันทำพร้อมกันได้ */
function PhaseSection({
  phase,
  current,
  last,
  items,
  testers,
  results,
  passed,
}: {
  phase: (typeof UAT_PHASES)[number];
  current: boolean;
  last: boolean;
  items: FlowItem[];
  testers: UatBoard["testers"];
  results: UatResult[];
  passed: ReadonlySet<string>;
}) {
  const done = items.every(({ item }) => caseState(results, item.id) === "pass");
  return (
    <li className="relative flex gap-3.5 pb-4 last:pb-0">
      {last ? null : (
        <span aria-hidden className={`absolute top-7 bottom-0 left-3.5 w-px ${done ? "bg-primary" : "bg-line"}`} />
      )}
      <span
        className={`relative grid size-7 flex-none place-items-center rounded-full text-12 font-semibold ${
          done
            ? "bg-primary text-base-100"
            : current
              ? "bg-base-100 text-primary ring-2 ring-primary"
              : "bg-base-100 text-mut ring-1 ring-line-strong"
        }`}
      >
        {done ? <Check size={14} strokeWidth={3} aria-label="ครบแล้ว" /> : phase.no}
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <p className={`flex items-center gap-2 text-13 font-semibold ${done || current ? "" : "text-mut"}`}>
          {phase.title}
          {current ? <span className="chip chip-live">ขั้นปัจจุบัน</span> : null}
        </p>
        <ul className="mt-1.5 flex flex-col divide-y divide-line/70 rounded-box border border-line px-3">
          {items.map(({ team, item }) => (
            <CaseRow
              key={item.id}
              team={team}
              item={item}
              testers={testers[team.id] ?? []}
              results={results}
              passed={passed}
            />
          ))}
        </ul>
      </div>
    </li>
  );
}

/** ข้อทดสอบหนึ่งข้อ — ค้างที่ใคร (ขวา) · กดชื่อกางวิธีทำ + ผลที่ต้องเห็น */
function CaseRow({
  team,
  item,
  testers,
  results,
  passed,
}: {
  team: UatTeam;
  item: UatCase;
  testers: UatTester[];
  results: UatResult[];
  passed: ReadonlySet<string>;
}) {
  const turn = caseTurn(item, results, passed);
  const rows = results.filter((r) => r.caseId === item.id);
  const notes = rows.filter((r) => r.status === "fail" && r.note);
  const tested = new Set(rows.map((r) => r.employeeId));
  const state = turn.kind === "done" ? "pass" : turn.kind === "issue" ? "fail" : null;

  return (
    <li className="py-2">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <details className="group min-w-0 flex-1 basis-64">
          <summary className="flex cursor-pointer list-none items-center gap-2.5 py-0.5 [&::-webkit-details-marker]:hidden">
            {turn.kind === "blocked" ? (
              <Hourglass size={16} className="flex-none text-mut" aria-label="รอขั้นก่อนหน้า" />
            ) : (
              <StateIcon state={state} />
            )}
            <span className="chip chip-line flex-none">{team.short}</span>
            <span className={`min-w-0 text-13 ${turn.kind === "blocked" ? "text-mut" : "font-medium"}`}>{item.title}</span>
            <ChevronDown size={14} className="flex-none text-mut transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="mt-1 mb-1 flex flex-col gap-0.5 pl-[1.9rem] text-12-5 text-mut">
            <p>{item.how}</p>
            <p>
              <span className="font-medium text-ink">ตรวจ</span> {item.check}
            </p>
            {item.href ? (
              <Link href={item.href} className="flex w-fit items-center gap-0.5 text-primary hover:underline">
                ไปหน้าที่ทดสอบ <ArrowUpRight size={13} aria-hidden />
              </Link>
            ) : null}
          </div>
        </details>

        {/* ค้างที่ใคร */}
        <div className="flex flex-none items-center gap-2 pb-1 pl-[1.9rem] text-12 sm:pb-0 sm:pl-0">
          {turn.kind === "blocked" ? (
            <span className="text-mut">รอ {turn.waiting.map((w) => `${w.team.short} · ${w.item.title}`).join(" และ ")}</span>
          ) : turn.kind === "done" ? (
            <>
              <span className="text-primary">ผ่านแล้ว</span>
              <Faces list={testers.filter((t) => tested.has(t.employeeId))} />
            </>
          ) : (
            <>
              <span className={`font-semibold ${turn.kind === "issue" ? "text-alert" : "text-warning"}`}>
                {turn.kind === "issue" ? "พบปัญหา" : "ถึงคิว"}
              </span>
              <Faces list={testers} dim={tested} />
            </>
          )}
        </div>
      </div>
      {notes.map((r) => (
        <p key={r.employeeId} className="pl-[1.9rem] text-12 text-alert">
          {nameOf(testers, r.employeeId)}: {r.note}
        </p>
      ))}
    </li>
  );
}

const nameOf = (testers: UatTester[], id: string) => testers.find((t) => t.employeeId === id)?.name ?? id;

function StateIcon({ state }: { state: "pass" | "fail" | null }) {
  if (state === "pass")
    return (
      <span className="mt-px grid size-5 flex-none place-items-center rounded-full bg-primary text-base-100">
        <Check size={12} strokeWidth={3} aria-label="ผ่าน" />
      </span>
    );
  if (state === "fail") return <CircleAlert size={20} className="mt-px flex-none text-alert" aria-label="พบปัญหา" />;
  return (
    <span
      aria-label="ยังไม่ทดสอบ"
      className="mt-px size-5 flex-none rounded-full border-2 border-dashed border-line-strong"
    />
  );
}

const PICKER_W = 288;
const PICKER_H = 340;

/**
 * ปุ่ม “เพิ่มผู้ทดสอบ” — ค้นจากพนักงาน Active ใน NCAC · คนของฝ่ายนั้นขึ้นก่อน
 * · กล่องรายชื่อแขวนที่ `document.body` แบบ fixed (กล่องเนื้อหามี transform จาก `animate-rise` ทำให้ fixed/absolute
 *   ข้างในโดนตัด) · ที่ว่างด้านล่างไม่พอ = เปิดขึ้นด้านบน · ชิดขอบจอไม่ล้นขวา
 */
function TesterPicker({
  team,
  people,
  disabled,
  empty,
  onPick,
}: {
  team: UatTeam;
  people: UatPerson[];
  disabled: boolean;
  empty: boolean;
  onPick: (p: UatPerson) => void;
}) {
  const [pos, setPos] = useState<{
    left: number;
    top?: number;
    bottom?: number;
    maxH: number;
  } | null>(null);
  const [q, setQ] = useState("");
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const open = pos !== null;

  const toggle = () => {
    if (open || !btn.current) return setPos(null);
    // ค่าที่วัดเป็นพิกเซลบนจอ → หน่วย CSS ของหน้าที่ถูกย่อ (ดู `lib/page-zoom.ts`)
    const z = pageZoom();
    const b = btn.current.getBoundingClientRect();
    const r = { top: b.top / z, bottom: b.bottom / z, left: b.left / z };
    const vw = window.innerWidth / z;
    const vh = window.innerHeight / z;
    const gap = 6;
    const below = vh - r.bottom - gap - 8;
    const above = r.top - gap - 8;
    const left = Math.max(8, Math.min(r.left, vw - PICKER_W - 8));
    setPos(
      below >= Math.min(PICKER_H, above)
        ? { left, top: r.bottom + gap, maxH: Math.min(PICKER_H, below) }
        : {
            left,
            bottom: vh - r.top + gap,
            maxH: Math.min(PICKER_H, above),
          },
    );
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) setPos(null);
    };
    /* เลื่อนหน้า/ย่อจอ = ตำแหน่งเดิมไม่ตรงปุ่มแล้ว ปิดไปเลย (เลื่อนในรายชื่อเองไม่นับ) */
    const away = (e: Event) => {
      if (!pop.current?.contains(e.target as Node)) setPos(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setPos(null);
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", away, true);
    window.addEventListener("resize", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", away, true);
      window.removeEventListener("resize", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return people
      .filter((p) => !needle || `${p.name} ${p.employeeId} ${p.position} ${p.department}`.toLowerCase().includes(needle))
      .sort((a, b) => Number(b.divisionId === team.divisionId) - Number(a.divisionId === team.divisionId))
      .slice(0, 40);
  }, [people, q, team.divisionId]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        onClick={toggle}
        className={`flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-12 ${
          empty ? "border-primary/50 text-primary" : "border-line text-mut hover:text-ink"
        }`}
      >
        {empty ? <UserPlus size={13} aria-hidden /> : <Plus size={13} aria-hidden />}
        {empty ? "เพิ่มผู้ทดสอบ" : "เพิ่ม"}
      </button>

      {pos
        ? createPortal(
            <div
              ref={pop}
              style={{
                left: pos.left,
                top: pos.top,
                bottom: pos.bottom,
                width: PICKER_W,
                maxHeight: pos.maxH,
              }}
              className="fixed z-[70] flex animate-pop-in flex-col overflow-hidden rounded-box border border-line bg-base-100 shadow-lg"
            >
              <label className="flex items-center gap-2 border-b border-line px-3 py-2">
                <Search size={14} aria-hidden className="text-mut" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="ชื่อ · รหัส · ตำแหน่ง"
                  className="min-w-0 flex-1 bg-transparent text-13 outline-none placeholder:text-mut"
                />
              </label>
              <ul className="min-h-0 flex-1 overflow-y-auto py-1">
                {list.map((p) => (
                  <li key={p.employeeId}>
                    <button
                      type="button"
                      onClick={() => {
                        onPick(p);
                        setPos(null);
                        setQ("");
                      }}
                      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-base-200/70"
                    >
                      <Avatar name={p.name} src={p.imageUrl} size="sm" className="size-7! text-11!" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-13">{p.name}</span>
                        <span className="block truncate text-11-5 text-mut">{p.position || p.department}</span>
                      </span>
                      {p.divisionId === team.divisionId ? <span className="chip chip-live">{team.short}</span> : null}
                    </button>
                  </li>
                ))}
                {!list.length ? <li className="px-3 py-3 text-12 text-mut">ไม่พบรายชื่อ</li> : null}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
