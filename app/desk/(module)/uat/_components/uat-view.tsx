"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, CircleAlert, Dices, Eraser, Loader2, Plus, Power, Search, UserPlus, X } from "lucide-react";

import { PageHead } from "@/components/desk/page-head";
import { Avatar } from "@/components/ui/avatar";
import { SummaryPanel, SummaryStat, SummaryStats } from "@/components/ui/summary-panel";
import { requestJson } from "@/lib/http";
import { confirm, toastError, toastSuccess } from "@/lib/swal";
import type { UatClearPlan } from "@/lib/uat-store";
import {
  UAT_SCOPE,
  UAT_TEAMS,
  caseState,
  teamProgress,
  type UatBoard,
  type UatResult,
  type UatTeam,
  type UatTester,
} from "@/lib/uat";

export interface UatPerson extends UatTester {
  department: string;
  divisionId: number | null;
}

/**
 * หน้า “จัดการ UAT” — แถบขั้นตามเส้นทางพนักงานใหม่ · แต่ละฝ่ายมีผู้ทดสอบ + รายการทดสอบพร้อมผลรายคน
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
        `ผู้สมัคร ${done.applications} · คำขอ ${done.requisitionsDeleted + done.requisitionsReset} · ผล ${done.results}`,
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

      {/* เส้นทาง — ลำดับฝ่ายตามขั้นจริง กดแล้วเลื่อนไปที่ฝ่ายนั้น */}
      <ol className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {UAT_TEAMS.map((team, i) => {
          const p = progress[i];
          const done = p.pass === p.total;
          return (
            <li key={team.id} className="flex flex-none items-center gap-1.5">
              <a
                href={`#uat-${team.id}`}
                className={`flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-12 transition-colors ${
                  p.fail
                    ? "border-alert/40 text-alert"
                    : done
                      ? "border-primary/40 bg-primary/8 text-primary"
                      : "border-line text-mut hover:text-ink"
                }`}
              >
                <span
                  className={`grid size-5.5 place-items-center rounded-full text-11 font-semibold ${
                    p.fail ? "bg-alert text-base-100" : done ? "bg-primary text-base-100" : "bg-base-200"
                  }`}
                >
                  {done ? <Check size={12} strokeWidth={3} aria-hidden /> : i + 1}
                </span>
                <span className="font-semibold">{team.short}</span>
                <span className="tabular-nums">
                  {p.pass}/{p.total}
                </span>
              </a>
              {i < UAT_TEAMS.length - 1 ? <span aria-hidden className="h-px w-3 bg-line" /> : null}
            </li>
          );
        })}
      </ol>

      <div className="sheet-bleed divide-y divide-line border-y border-line">
        {UAT_TEAMS.map((team, i) => (
          <TeamSection
            key={team.id}
            no={i + 1}
            team={team}
            testers={board.testers[team.id] ?? []}
            results={board.results}
            people={people}
            busy={busy}
            onTesters={(list) => save({ team: team.id, testers: list })}
          />
        ))}
      </div>
    </div>
  );
}

function TeamSection({
  no,
  team,
  testers,
  results,
  people,
  busy,
  onTesters,
}: {
  no: number;
  team: UatTeam;
  testers: UatTester[];
  results: UatResult[];
  people: UatPerson[];
  busy: boolean;
  onTesters: (list: UatTester[]) => void;
}) {
  const p = teamProgress(team, results);
  const pct = p.total ? Math.round((p.pass / p.total) * 100) : 0;
  const ids = new Set(testers.map((t) => t.employeeId));

  return (
    <section
      id={`uat-${team.id}`}
      className="grid scroll-mt-20 gap-4 px-(--sheet-px) py-4 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:gap-8"
    >
      {/* ซ้าย — ฝ่าย + ผู้ทดสอบ */}
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex items-start gap-3">
          <span className="brand-tile grid size-9 flex-none place-items-center rounded-[11px] text-13 font-semibold">
            {no}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-15 font-semibold">{team.short}</p>
            <p className="truncate text-12 text-mut">{team.label}</p>
          </div>
          <span
            className={`text-13 font-semibold tabular-nums ${p.fail ? "text-alert" : pct === 100 ? "text-primary" : "text-mut"}`}
          >
            {pct}%
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-base-200">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${p.fail ? "bg-alert" : "bg-primary"}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {testers.map((t) => (
            <span
              key={t.employeeId}
              className="group flex items-center gap-1.5 rounded-full border border-line py-0.5 pr-1 pl-0.5 text-12"
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

      {/* ขวา — รายการทดสอบ + ผลรายคน */}
      <ul className="flex min-w-0 flex-col divide-y divide-line/70">
        {team.cases.map((c) => {
          const state = caseState(results, c.id);
          const rows = results.filter((r) => r.caseId === c.id);
          const notes = rows.filter((r) => r.status === "fail" && r.note);
          return (
            <li key={c.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
              <StateIcon state={state} />
              <div className="min-w-0 flex-1">
                <p className="text-13">{c.title}</p>
                {notes.map((r) => (
                  <p key={r.employeeId} className="mt-0.5 text-12 text-alert">
                    {nameOf(testers, r.employeeId)}: {r.note}
                  </p>
                ))}
              </div>
              <div className="flex flex-none gap-1">
                {testers.map((t) => {
                  const r = rows.find((x) => x.employeeId === t.employeeId);
                  return (
                    <span
                      key={t.employeeId}
                      title={`${t.name} — ${r ? (r.status === "pass" ? "ผ่าน" : "พบปัญหา") : "ยังไม่ทดสอบ"}`}
                      className={`rounded-full ring-2 ${
                        r?.status === "pass"
                          ? "ring-primary"
                          : r?.status === "fail"
                            ? "ring-alert"
                            : "ring-transparent opacity-35 grayscale"
                      }`}
                    >
                      <Avatar name={t.name} src={t.imageUrl} size="sm" className="size-6! text-10!" />
                    </span>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
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

/** ปุ่ม “เพิ่มผู้ทดสอบ” — ค้นจากพนักงาน Active ใน NCAC · คนของฝ่ายนั้นขึ้นก่อน */
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
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return people
      .filter(
        (p) => !needle || `${p.name} ${p.employeeId} ${p.position} ${p.department}`.toLowerCase().includes(needle),
      )
      .sort((a, b) => Number(b.divisionId === team.divisionId) - Number(a.divisionId === team.divisionId))
      .slice(0, 40);
  }, [people, q, team.divisionId]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-12 ${
          empty ? "border-primary/50 text-primary" : "border-line text-mut hover:text-ink"
        }`}
      >
        {empty ? <UserPlus size={13} aria-hidden /> : <Plus size={13} aria-hidden />}
        {empty ? "เพิ่มผู้ทดสอบ" : "เพิ่ม"}
      </button>

      {open ? (
        <div className="absolute top-full left-0 z-30 mt-1.5 w-72 animate-pop-in overflow-hidden rounded-box border border-line bg-base-100 shadow-lg">
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
          <ul className="max-h-72 overflow-y-auto py-1">
            {list.map((p) => (
              <li key={p.employeeId}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(p);
                    setOpen(false);
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
        </div>
      ) : null}
    </div>
  );
}
