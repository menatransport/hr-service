"use client";

import { useEffect, useState } from "react";
import { Popover as RPopover } from "radix-ui";
import { Loader2, RotateCcw, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";

import { InfoTip } from "@/components/ui/info-tip";
import { requestJson } from "@/lib/http";
import {
  hasCriminalCase,
  type CriminalRecordEntry,
  type CriminalRecordResult,
} from "@/app/recruitment/_lib/criminal-record-types";

/**
 * ผลตรวจประวัติอาชญากรรม (Bew 9 พ.ย. 2569) — ปุ่มในตารางผู้สมัคร (รอฝึกงาน → รับรถแล้ว) กดแล้วเห็นรายละเอียดคดี
 * · กล่องในแท็บข้อมูลทั่วไปของหน้าประวัติ · ข้อมูลจาก `GET /api/recruitment/criminal-record`
 *
 * แคชฝั่งจอต่อ ชื่อ+สาขา — เปลี่ยนหน้า/กรองแล้วกลับมาไม่ยิงซ้ำ (เซิร์ฟเวอร์แคชอีกชั้น)
 */

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; value: CriminalRecordResult };

const memo = new Map<string, Promise<CriminalRecordResult>>();

function load(name: string, site: string, fresh = false): Promise<CriminalRecordResult> {
  const key = `${site}|${name}`;
  if (fresh) memo.delete(key);
  let job = memo.get(key);
  if (!job) {
    const qs = new URLSearchParams({ name, ...(site ? { site } : {}) });
    job = requestJson<CriminalRecordResult>(
      `/api/recruitment/criminal-record?${qs}`,
      {},
      "ดึงผลตรวจประวัติไม่สำเร็จ",
    );
    /* พังแล้วไม่จำ — กดลองใหม่ได้ */
    job.catch(() => memo.delete(key));
    memo.set(key, job);
  }
  return job;
}

function useCriminalRecord(name: string, site: string) {
  const [round, setRound] = useState(0);
  /* ผลผูกกับคีย์ที่ขอ — คีย์ไม่ตรง (เปลี่ยนคน/กดลองใหม่) = กำลังโหลด โดยไม่ต้อง setState ใน effect */
  const key = `${site}|${name}|${round}`;
  const [done, setDone] = useState<{ key: string; state: State } | null>(null);

  useEffect(() => {
    if (!name.trim()) return;
    let alive = true;
    load(name, site, round > 0)
      .then((value) => alive && setDone({ key, state: { kind: "ready", value } }))
      .catch((err: unknown) =>
        alive &&
        setDone({
          key,
          state: { kind: "error", message: err instanceof Error ? err.message : "ดึงผลตรวจประวัติไม่สำเร็จ" },
        }),
      );
    return () => {
      alive = false;
    };
  }, [name, site, round, key]);

  const state: State = done?.key === key ? done.state : { kind: "loading" };
  return { state, retry: () => setRound((n) => n + 1) };
}

type Verdict = { tone: "alert" | "ok" | "mut"; label: string };

function verdictOf(value: CriminalRecordResult): Verdict {
  if (!value.found) return { tone: "mut", label: "ยังไม่มีผลตรวจ" };
  if (value.records.some(hasCriminalCase)) return { tone: "alert", label: value.records.find(hasCriminalCase)!.result || "พบประวัติ" };
  return { tone: "ok", label: value.records[0]?.result || "ไม่พบประวัติ" };
}

const TONE: Record<Verdict["tone"], string> = {
  alert: "bg-alert/12 text-alert",
  ok: "bg-st-live text-st-live-ink",
  mut: "bg-base-200 text-mut",
};

const ICON = { alert: ShieldAlert, ok: ShieldCheck, mut: ShieldQuestion } as const;

function Entries({ records }: { records: CriminalRecordEntry[] }) {
  return (
    <ul className="flex flex-col divide-y divide-line">
      {records.map((r, i) => {
        const bad = hasCriminalCase(r);
        return (
          <li key={i} className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-selector px-1.5 py-0.5 text-11-5 font-medium ${bad ? TONE.alert : TONE.ok}`}>
                {r.result || "ไม่ระบุผล"}
              </span>
              <span className="text-11 text-mut">{r.department}</span>
            </div>
            <p className={`text-12-5 whitespace-pre-wrap text-pretty ${r.detail ? "text-ink" : "text-mut"}`}>
              {r.detail || "ไม่มีรายละเอียดคดี"}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function NotFound({ name }: { name: string }) {
  return (
    <p className="text-12-5 text-mut text-pretty">
      ไม่พบชื่อ “{name}” ในชีตสรุปรายชื่อตรวจประวัติ — ยังไม่ได้ส่งตรวจ หรือสะกดชื่อในชีตต่างจากในระบบ
    </p>
  );
}

/** ปุ่มในตาราง — ป้ายบอกผล · กดแล้วเห็นรายละเอียดคดี */
export function CriminalRecordButton({ name, site = "" }: { name: string; site?: string }) {
  const { state, retry } = useCriminalRecord(name, site);

  if (!name.trim()) return <span className="px-1.5 text-mut">—</span>;
  if (state.kind === "loading") {
    return (
      <span className="flex items-center gap-1.5 px-1.5 text-12 text-mut">
        <Loader2 size={13} strokeWidth={1.8} aria-hidden className="animate-spin" />
        กำลังตรวจ…
      </span>
    );
  }
  if (state.kind === "error") {
    return (
      <button
        type="button"
        onClick={retry}
        title={state.message}
        className="flex items-center gap-1.5 rounded-selector px-1.5 py-1 text-12 text-alert transition-colors hover:bg-base-200"
      >
        <RotateCcw size={13} strokeWidth={1.8} aria-hidden />
        โหลดไม่สำเร็จ · ลองใหม่
      </button>
    );
  }

  const verdict = verdictOf(state.value);
  const Icon = ICON[verdict.tone];
  return (
    <RPopover.Root>
      <RPopover.Trigger asChild>
        <button
          type="button"
          title="ดูรายละเอียดผลตรวจประวัติ"
          className={`flex max-w-[180px] items-center gap-1 rounded-selector px-1.5 py-0.5 text-11-5 font-medium transition-[filter] hover:brightness-95 ${TONE[verdict.tone]}`}
        >
          <Icon size={12} strokeWidth={2} aria-hidden className="flex-none" />
          <span className="truncate">{verdict.label}</span>
        </button>
      </RPopover.Trigger>
      <RPopover.Portal>
        <RPopover.Content
          align="start"
          sideOffset={4}
          className="z-50 flex w-80 flex-col gap-2 rounded-box border border-line bg-base-100 p-3 shadow-[0_18px_44px_-16px_rgba(21,32,29,0.4)]"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-12-5 font-semibold text-ink">ผลตรวจประวัติอาชญากรรม</span>
            <span className="truncate text-11 text-mut">{state.value.name}</span>
          </div>
          {state.value.found ? <Entries records={state.value.records} /> : <NotFound name={state.value.name} />}
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  );
}

/** ⓘ ข้างหัวคอลัมน์ — เงื่อนไขการดึงข้อมูลแบบสั้น (Bew 9 พ.ย. 2569) · ตัวเลขต้องตรงกับ TTL ใน `criminal-record.ts` */
export function CriminalRecordHeadTip() {
  return (
    <InfoTip label="ผลประวัติอาชญากรรมดึงมาจากไหน">
      <ul className="flex list-disc flex-col gap-1.5 pl-4 normal-case tracking-normal">
        <li>
          ดึงจากชีต <span className="text-ink">“สรุปรายชื่อตรวจประวัติ”</span> ค้นด้วยชื่อ–นามสกุลที่ต้องตรงทุกตัวอักษร
          (ไม่รวมคำนำหน้า)
        </li>
        <li>
          ค้นฝ่ายตามสาขาก่อน: ลาดกระบัง = <span className="text-ink">จัดส่ง ศลบ</span> · สระบุรี ={" "}
          <span className="text-ink">จัดส่ง สสบ</span> ถ้าไม่เจอจะลองฝ่ายอื่นต่อ (รวม TDM)
        </li>
        <li>
          แก้ข้อมูลในชีตแล้ว รีเฟรชหน้าจึงจะเห็น — นานสุด 30 นาทีถ้าเคยมีผลอยู่แล้ว · 5 นาทีถ้ายังไม่มีผล
        </li>
        <li>
          ป้าย<span className="text-alert">แดง</span> = มีคดี · <span className="text-st-live-ink">เขียว</span> = ผ่าน · เทา =
          ยังไม่มีผลตรวจ — กดที่ป้ายเพื่อดูรายละเอียดคดี
        </li>
      </ul>
    </InfoTip>
  );
}

/** กล่องในหน้าประวัติ — โชว์รายละเอียดเต็มในที่เลย ไม่ต้องกด */
export function CriminalRecordPanel({ name, site = "" }: { name: string; site?: string }) {
  const { state, retry } = useCriminalRecord(name, site);

  if (!name.trim()) return <p className="text-12-5 text-mut">ไม่มีชื่อในทะเบียน — ค้นผลตรวจไม่ได้</p>;
  if (state.kind === "loading") {
    return (
      <p className="flex items-center gap-2 text-12-5 text-mut">
        <Loader2 size={14} strokeWidth={1.8} aria-hidden className="animate-spin" />
        กำลังดึงผลตรวจจากชีต…
      </p>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-12-5 text-alert">
        <span>{state.message}</span>
        <button type="button" onClick={retry} className="btn-sec px-2.5 py-1 text-12 hover:text-primary">
          ลองใหม่
        </button>
      </div>
    );
  }
  return state.value.found ? <Entries records={state.value.records} /> : <NotFound name={state.value.name} />;
}
