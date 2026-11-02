"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, CircleAlert, FlaskConical, Loader2, X } from "lucide-react";

import { requestJson } from "@/lib/http";
import { toastError } from "@/lib/swal";
import { UAT_SCOPE, uatTeam, type MyUat, type UatResult, type UatStatus } from "@/lib/uat";

/**
 * แผง UAT ของผู้ทดสอบ — ปุ่มกลมมุมขวาล่าง (วงแหวน = ความคืบหน้าของตัวเอง) กดแล้วกางรายการข้อทดสอบของฝ่ายตัวเอง
 * · วงกลมหน้าข้อ = ติ๊กผ่าน (กดซ้ำ = ยกเลิก) · ไอคอน ! = แจ้งปัญหาพร้อมหมายเหตุ · ลูกศร = ไปหน้าที่ใช้ทดสอบ
 * · ปุ่มสุ่มผู้สมัครทดสอบอยู่บนหน้า `/desk/uat`
 */
export function UatDockPanel({ initial }: { initial: MyUat }) {
  const [my, setMy] = useState(initial);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const teams = my.teams.map(uatTeam).filter((t) => t !== undefined);
  const cases = teams.flatMap((t) => t.cases);
  const resultOf = (id: string): UatResult | undefined => my.results.find((r) => r.caseId === id);
  const done = cases.filter((c) => resultOf(c.id)?.status === "pass").length;
  const issues = cases.filter((c) => resultOf(c.id)?.status === "fail").length;
  const pct = cases.length ? Math.round((done / cases.length) * 100) : 0;

  const mark = async (caseId: string, status: UatStatus | null, text = "") => {
    setPending(caseId);
    try {
      const next = await requestJson<MyUat | null>("/api/uat/results", {
        method: "PUT",
        body: { caseId, status, note: text },
      });
      if (next) setMy(next);
      setNoteFor(null);
      setNote("");
    } catch (e) {
      toastError("บันทึกผลไม่สำเร็จ", e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="pointer-events-none fixed right-3 bottom-3 z-[60] flex flex-col items-end gap-2.5 sm:right-5 sm:bottom-5 print:hidden">
      {open ? (
        <section
          aria-label="UAT"
          className="pointer-events-auto flex max-h-[min(36rem,calc(100dvh-6rem))] w-[min(23rem,calc(100vw-1.5rem))] animate-pop-in flex-col overflow-hidden rounded-[18px] border border-line bg-base-100 shadow-2xl"
        >
          <header className="stat-lead relative px-4 pt-3.5 pb-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="ปิดแผง UAT"
              className="absolute top-2.5 right-2.5 grid size-7 place-items-center rounded-full text-mut hover:bg-white/15 hover:text-ink"
            >
              <X size={15} aria-hidden />
            </button>
            <p className="text-11 font-semibold tracking-[0.12em] text-mut">UAT</p>
            <p className="text-15 font-semibold text-ink">{UAT_SCOPE}</p>
            <div className="mt-2.5 flex items-center gap-2.5">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20">
                <div className="h-full rounded-full bg-white transition-[width] duration-500" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-12 font-semibold text-ink tabular-nums">
                {done}/{cases.length}
              </span>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto">
            {teams.map((team) => (
              <div key={team.id} className="border-b border-line last:border-b-0">
                <p className="sticky top-0 z-[1] bg-base-100/95 px-4 pt-3 pb-1.5 text-11-5 font-semibold text-mut backdrop-blur">
                  {team.short} · {team.label}
                </p>
                <ul className="pb-2">
                  {team.cases.map((c) => {
                    const r = resultOf(c.id);
                    const busy = pending === c.id;
                    return (
                      <li key={c.id} className="px-2">
                        <div className="group flex items-center gap-2.5 rounded-[10px] px-2 py-1.5 hover:bg-base-200/60">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => mark(c.id, r?.status === "pass" ? null : "pass")}
                            aria-pressed={r?.status === "pass"}
                            aria-label={r?.status === "pass" ? `ยกเลิกผ่าน: ${c.title}` : `ติ๊กผ่าน: ${c.title}`}
                            className={`grid size-6 flex-none place-items-center rounded-full border-2 transition ${
                              r?.status === "pass"
                                ? "border-primary bg-primary text-base-100"
                                : r?.status === "fail"
                                  ? "border-alert text-alert"
                                  : "border-line-strong text-transparent hover:border-primary hover:text-primary/50"
                            }`}
                          >
                            {busy ? (
                              <Loader2 size={12} className="animate-spin text-mut" aria-hidden />
                            ) : r?.status === "fail" ? (
                              <CircleAlert size={13} aria-hidden />
                            ) : (
                              <Check size={13} strokeWidth={3} aria-hidden />
                            )}
                          </button>

                          <span className={`min-w-0 flex-1 text-13 ${r?.status === "pass" ? "text-mut line-through decoration-line-strong" : ""}`}>
                            {c.title}
                          </span>

                          <button
                            type="button"
                            onClick={() => {
                              setNoteFor(noteFor === c.id ? null : c.id);
                              setNote(r?.status === "fail" ? r.note : "");
                            }}
                            aria-label={`แจ้งปัญหา: ${c.title}`}
                            title="แจ้งปัญหา"
                            className={`grid size-6 flex-none place-items-center rounded-full ${
                              r?.status === "fail" ? "text-alert" : "text-mut opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                            } hover:bg-base-200`}
                          >
                            <CircleAlert size={14} aria-hidden />
                          </button>
                          {c.href ? (
                            <Link
                              href={c.href}
                              aria-label={`ไปหน้าทดสอบ: ${c.title}`}
                              title="ไปหน้าที่ทดสอบ"
                              className="grid size-6 flex-none place-items-center rounded-full text-mut hover:bg-base-200 hover:text-primary"
                            >
                              <ArrowUpRight size={14} aria-hidden />
                            </Link>
                          ) : null}
                        </div>

                        {r?.status === "fail" && r.note && noteFor !== c.id ? (
                          <p className="pr-2 pb-1 pl-[2.6rem] text-12 text-alert">{r.note}</p>
                        ) : null}

                        {noteFor === c.id ? (
                          <form
                            className="mb-2 ml-[2.6rem] mr-2 flex flex-col gap-1.5"
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (note.trim()) mark(c.id, "fail", note);
                            }}
                          >
                            <textarea
                              autoFocus
                              rows={2}
                              value={note}
                              onChange={(e) => setNote(e.target.value)}
                              maxLength={500}
                              placeholder="พบปัญหาอะไร"
                              className="field-ring w-full resize-none rounded-field border border-line bg-base-100 px-2.5 py-1.5 text-12-5 outline-none"
                            />
                            <div className="flex justify-end gap-1.5">
                              <button type="button" onClick={() => setNoteFor(null)} className="btn-ghost px-2.5 py-1 text-12">
                                ยกเลิก
                              </button>
                              <button type="submit" disabled={!note.trim() || busy} className="btn-danger px-2.5 py-1 text-12">
                                แจ้งปัญหา
                              </button>
                            </div>
                          </form>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`UAT — ผ่าน ${done} จาก ${cases.length} ข้อ`}
        className="group pointer-events-auto relative grid size-14 place-items-center rounded-full shadow-xl transition-transform hover:-translate-y-0.5 active:translate-y-0"
        style={{
          background: `conic-gradient(#f8b545 ${pct * 3.6}deg, rgba(255,255,255,0.35) 0deg)`,
        }}
      >
        <span className="brand-tile grid size-[3.1rem] place-items-center rounded-full">
          {open ? (
            <X size={20} aria-hidden />
          ) : (
            <span className="flex flex-col items-center leading-none">
              <FlaskConical size={17} strokeWidth={2} aria-hidden />
              <span className="mt-0.5 text-[9.5px] font-bold tracking-[0.08em]">UAT</span>
            </span>
          )}
        </span>
        {issues ? (
          <span className="absolute -top-0.5 -right-0.5 grid size-5 place-items-center rounded-full bg-alert text-10 font-bold text-base-100 ring-2 ring-base-100">
            {issues}
          </span>
        ) : null}
      </button>
    </div>
  );
}
