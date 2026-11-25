"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronRight, ClipboardList, Lock, PhoneCall, PhoneForwarded, ShieldAlert, X } from "lucide-react";

import { CheckboxGroupField, DateField, NumberField, SelectField, isDropdownOpen } from "@/components/ui/field";
import { SegmentedControl } from "@/components/ui/summary-panel";
import { MascotLoader } from "@/components/ui/mascot";
import { requestJson } from "@/lib/http";
import { confirm, runAction } from "@/lib/swal";
import { formatThaiDate, formatThaiDateTime } from "@/app/recruitment/_lib/drivers/types";
import {
  CONTROLLABLE_CHIP,
  controllableLabel,
  reasonGroups,
  type ResignMaster,
} from "@/app/recruitment/_lib/resign-reasons/types";
import {
  addDaysISO,
  CONTACT_SLOTS,
  INTERVIEW_RULES,
  STAGE_CHIP,
  STAGE_LABEL,
  WAVE2_DUE_DAYS,
  WAVE2_OPEN_DAYS,
  type ContactAttempt,
  type ContactResult,
  type ExitInterview,
  type ExitInterviewBundle,
  type InterviewOutcome,
  type InterviewStage,
} from "@/app/recruitment/_lib/exit-interview/types";
import { useResignMaster } from "@/app/recruitment/_components/admin/use-resign-master";
import { Script, Wave1Fields, Wave2Fields } from "@/app/recruitment/_components/admin/exit-interview-waves";

/**
 * ลิ้นชัก Exit Interview — เปิดจากแท็บ “พ้นสภาพแล้ว” (คอลัมน์ Exit Interview / ปุ่มในคอลัมน์ จัดการ) · เฉพาะสิทธิ์ `exit-interview`
 *
 * แบ่ง 3 แท็บ (Bew 25 พ.ย. 2569):
 * - **Wave 1** — ข้อมูลอ้างอิง (แทนชีต “ก่อนโทร”) + การติดต่อ 3 ครั้ง / N1 / N2 + คำถามวันที่ออก
 * - **Wave 2** — โทรกลับ (วันออก +30 ถึง +45) · ล็อกจนกว่า Wave 1 เสร็จ
 * - **สรุป** — ภาพรวมสองรอบ + รหัสสาเหตุ + ความปลอดภัย + รายได้ย้อนหลัง 3 เดือน
 *
 * ฟอร์มเป็นก้อนเดียว สลับแท็บแล้วค่าไม่หาย · บันทึกทั้งชุดครั้งเดียว
 * (`PUT /api/drivers/{code}/exit-interview`) แล้ว `router.refresh()` ให้รหัสในตารางเปลี่ยนตาม
 */

type CodeState = { primary: string; secondary: [string, string] };
type Tab = "wave1" | "wave2" | "summary";

/** แท็บแรกที่เปิด — ตามงานที่ต้องทำต่อของคนนั้น */
const TAB_OF_STAGE: Record<InterviewStage, Tab> = {
  pending: "wave1",
  wave1: "wave1",
  wave2_due: "wave2",
  wave2_late: "wave2",
  done: "summary",
  no_data: "summary",
};

export function ExitInterviewDrawer({ drivercode, onClose }: { drivercode: string; onClose: () => void }) {
  const router = useRouter();
  const id = useId();
  const { master } = useResignMaster(true);
  const [bundle, setBundle] = useState<ExitInterviewBundle | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<ExitInterview | null>(null);
  const [codes, setCodes] = useState<CodeState>({ primary: "", secondary: ["", ""] });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab | null>(null);
  const body = useRef<HTMLDivElement>(null);
  /** กดลงบนฉากหลังจริงไหม — คลิกที่เริ่มในแผง/ดรอปดาวน์แล้วไปปล่อยข้างนอกต้องไม่ปิดแผง */
  const downOnBackdrop = useRef(false);

  function load(b: ExitInterviewBundle) {
    setBundle(b);
    setForm(b.interview);
    setCodes({
      primary: b.driver.reasonCode,
      secondary: [b.driver.secondaryCodes[0] ?? "", b.driver.secondaryCodes[1] ?? ""],
    });
    setDirty(false);
    /* โหลดครั้งแรกเท่านั้นที่เลือกแท็บให้ — หลังบันทึกอยู่แท็บเดิม */
    setTab((t) => t ?? TAB_OF_STAGE[b.stage]);
  }

  function go(next: Tab) {
    setTab(next);
    body.current?.scrollTo({ top: 0 });
  }

  useEffect(() => {
    let alive = true;
    requestJson<ExitInterviewBundle>(
      `/api/drivers/${encodeURIComponent(drivercode)}/exit-interview`,
      {},
      "โหลด Exit Interview ไม่สำเร็จ",
    )
      .then((b) => alive && load(b))
      .catch((err: unknown) => alive && setLoadError(err instanceof Error ? err.message : "โหลดไม่สำเร็จ"));
    return () => {
      alive = false;
    };
  }, [drivercode]);

  async function close() {
    if (busy) return;
    if (dirty && !(await confirm({ title: "ปิดโดยไม่บันทึก?", text: "คำตอบที่กรอกไว้จะหายไป", confirmText: "ปิดเลย", tone: "warn" })))
      return;
    onClose();
  }

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isDropdownOpen()) void close();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  });

  function patch<K extends keyof ExitInterview>(key: K, value: Partial<ExitInterview[K]> | ExitInterview[K]) {
    setForm((f) =>
      f
        ? {
            ...f,
            [key]:
              value && typeof value === "object" && !Array.isArray(value)
                ? { ...(f[key] as object), ...(value as object) }
                : value,
          }
        : f,
    );
    setDirty(true);
  }

  async function save() {
    if (!form) return;
    /* Wave 2 ให้รหัสต่างจากรหัสหลัก → ถามก่อนว่าจะยึด Wave 2 ไหม (กติกาของไฟล์) */
    let primary = codes.primary;
    const qw31 = form.wave2.qw31Code;
    if (qw31 && qw31 !== primary && form.outcome !== "N1" && form.outcome !== "N2") {
      const use = await confirm({
        title: `ใช้ ${qw31} (Wave 2) เป็นรหัสหลัก?`,
        text: `รหัสหลักตอนนี้คือ ${primary} · คำตอบ Wave 2 มักแม่นกว่าวันที่ลาออก — กดยกเลิกเพื่อคงรหัสเดิม`,
        confirmText: `ใช้ ${qw31}`,
        cancelText: `คง ${primary}`,
      });
      if (use) primary = qw31;
    }
    const secondary = codes.secondary.filter((c) => c && c !== primary);
    const out = await runAction({
      pending: "กำลังบันทึก…",
      success: "บันทึก Exit Interview แล้ว",
      failureTitle: "บันทึกไม่สำเร็จ",
      run: async () => {
        setBusy(true);
        try {
          return await requestJson<ExitInterviewBundle>(
            `/api/drivers/${encodeURIComponent(drivercode)}/exit-interview`,
            {
              method: "PUT",
              body: {
                reference: form.reference,
                contacts: form.contacts,
                outcome: form.outcome,
                wave1: form.wave1,
                wave2: form.wave2,
                income: form.income,
                safetyFlag: form.safetyFlag,
                codes: { primary, secondary },
              },
            },
            "บันทึกไม่สำเร็จ",
          );
        } finally {
          setBusy(false);
        }
      },
    });
    if (out.status !== "done") return;
    load(out.data);
    router.refresh();
  }

  const d = bundle?.driver;
  const noData = form?.outcome === "N1" || form?.outcome === "N2";
  const wave2Window = d
    ? `${formatThaiDate(addDaysISO(d.exitDateISO, WAVE2_OPEN_DAYS))} – ${formatThaiDate(addDaysISO(d.exitDateISO, WAVE2_DUE_DAYS))}`
    : "";

  /* portal ไป `body` — หน้าแม่ห่อด้วย `animate-rise` (transform ค้าง) ทำให้ `fixed` ไปยึดคอลัมน์เนื้อหา
     แผงจึงสูงเท่าทั้งหน้า ปุ่มบันทึกตกไปท้ายหน้า และฉากหลังไม่คลุมจอ (ดู `modal-shell.tsx`) */
  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        onPointerDown={(e) => (downOnBackdrop.current = e.target === e.currentTarget)}
        onClick={(e) => {
          // ปิดเมื่อกดและปล่อยบนฉากหลังเท่านั้น (คลิกที่ไหลมาจากดรอปดาวน์/ลากเลือกข้อความไม่นับ) · มีที่แก้ค้างอยู่ = ไม่ปิด ต้องกด ปิด/✕ เอง
          if (!dirty && downOnBackdrop.current && e.target === e.currentTarget) void close();
        }}
        aria-hidden
        className="fixed inset-0 z-50 animate-fade-in bg-ink/30"
      />
      <aside
        role="dialog"
        aria-label="Exit Interview"
        className="elev-pop fixed top-0 right-0 bottom-0 z-50 flex w-[min(760px,100vw)] animate-fade-in flex-col bg-base-100 text-ink"
      >
        <header className="flex items-start gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-11-5 font-medium tracking-wider text-mut">EXIT INTERVIEW · {drivercode}</p>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-17 font-semibold text-pretty">{d?.name || "—"}</h2>
              {bundle ? (
                <span className={`chip px-2 py-0.5 text-11-5 ${STAGE_CHIP[bundle.stage]}`}>{STAGE_LABEL[bundle.stage]}</span>
              ) : null}
              {form?.safetyFlag ? (
                <span className="chip chip-alert px-2 py-0.5 text-11-5">
                  <ShieldAlert size={12} aria-hidden /> แจ้ง HR Chief
                </span>
              ) : null}
            </div>
            {d ? (
              <p className="mt-0.5 flex flex-wrap gap-x-3 text-12 text-mut">
                <span>พ้นสภาพ {formatThaiDate(d.exitDateISO, "full")}</span>
                {d.tenureDays == null ? null : <span>อายุงาน {d.tenureDays} วัน</span>}
                <span>
                  <span className="font-mono font-semibold text-ink">{d.reasonCode}</span> {d.reasonLabel}
                </span>
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void close()}
            aria-label="ปิด"
            className="grid size-9 flex-none cursor-pointer place-items-center rounded-full text-mut transition-colors hover:bg-base-200 hover:text-ink"
          >
            <X size={18} aria-hidden />
          </button>
        </header>

        {bundle && form ? (
          <Tabs
            tab={tab ?? "wave1"}
            onTab={go}
            wave1={noData ? "skip" : form.wave1.completed ? "done" : "open"}
            wave2={
              noData
                ? "skip"
                : form.wave2.completed
                  ? "done"
                  : !form.wave1.completed
                    ? "locked"
                    : bundle.stage === "wave2_late"
                      ? "late"
                      : "open"
            }
            wave2Window={wave2Window}
            safety={form.safetyFlag}
          />
        ) : (
          <div className="border-b border-line" />
        )}

        <div ref={body} className="flex-1 overflow-y-auto bg-base-200/40 px-5 py-4">
          {loadError ? (
            <p role="alert" className="rounded-field border border-alert/30 bg-alert/6 px-3 py-2 text-12-5 text-alert">
              {loadError}
            </p>
          ) : !bundle || !form || !d ? (
            <div className="py-10">
              <MascotLoader text="กำลังโหลด Exit Interview" />
            </div>
          ) : tab === "wave2" ? (
            /* ── Wave 2 ── */
            <div className="flex flex-col gap-4">
              {noData ? (
                <Empty icon={<Lock size={18} aria-hidden />} title={`ผลการติดต่อเป็น ${form.outcome} — ไม่ต้องโทร Wave 2`}>
                  เปลี่ยนผลการติดต่อได้ที่แท็บ Wave 1
                </Empty>
              ) : !form.wave1.completed ? (
                <Empty
                  icon={<Lock size={18} aria-hidden />}
                  title="ยังโทร Wave 2 ไม่ได้"
                  action={
                    <button
                      type="button"
                      onClick={() => go("wave1")}
                      className="btn-sec cursor-pointer px-3 py-1.5 text-12-5 transition-colors hover:border-primary/40 hover:text-primary"
                    >
                      ไปบันทึก Wave 1
                    </button>
                  }
                >
                  บันทึก Wave 1 ให้เสร็จก่อน แล้วโทรกลับวันที่ {WAVE2_OPEN_DAYS}–{WAVE2_DUE_DAYS} หลังออก ({wave2Window})
                </Empty>
              ) : (
                <>
                  <Callout tone={bundle.stage === "wave2_late" ? "alert" : "info"} icon={<PhoneForwarded size={16} aria-hidden />}>
                    ช่วงโทร <b>{wave2Window}</b>
                    {bundle.stage === "wave2_late"
                      ? " · เลยกำหนดแล้ว โทรให้เร็วที่สุด"
                      : ` (วันที่ ${WAVE2_OPEN_DAYS}–${WAVE2_DUE_DAYS} หลังออก)`}
                  </Callout>
                  <Card title="คำถามโทรกลับ">
                    <Wave2Fields
                      id={id}
                      v={form.wave2}
                      set={(p) => patch("wave2", p)}
                      codeGroups={master ? reasonGroups(master, form.wave2.qw31Code) : []}
                    />
                  </Card>
                  <DoneBar
                    checked={form.wave2.completed}
                    onChange={(v) => patch("wave2", { completed: v })}
                    label="โทร Wave 2 เสร็จแล้ว"
                    next={() => go("summary")}
                  />
                </>
              )}
            </div>
          ) : tab === "summary" ? (
            /* ── สรุป ── */
            <div className="flex flex-col gap-4">
              <Overview form={form} stage={bundle.stage} exitDateISO={d.exitDateISO} onTab={go} />
              <Card title="รหัสสาเหตุ">
                <ReasonCodes
                  id={id}
                  master={master}
                  codes={codes}
                  locked={noData ? form.outcome : ""}
                  onChange={(c) => {
                    setCodes(c);
                    setDirty(true);
                  }}
                />
                {form.reasonHistory.length ? (
                  <div className="flex flex-col gap-1.5 border-t border-line pt-3">
                    <p className="text-11-5 font-medium text-mut">ประวัติการเปลี่ยนรหัส</p>
                    <ul className="flex flex-col gap-1 text-12 text-mut">
                      {form.reasonHistory.map((h) => (
                        <li key={h.at}>
                          {formatThaiDateTime(h.at)} · <span className="font-mono">{h.from}</span> →{" "}
                          <b className="font-mono text-ink">{h.to}</b> ({h.source === "wave2" ? "Wave 2" : "Wave 1"}) โดย {h.by}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </Card>
              <Card title="เรื่องความปลอดภัย" icon={<ShieldAlert size={15} aria-hidden />} tone={form.safetyFlag ? "alert" : undefined}>
                <CheckboxGroupField
                  id={`${id}-safety`}
                  label="แจ้ง HR Chief"
                  optional
                  hint="ถ้ามีการกล่าวถึง ต้องแจ้ง HR Chief ทันที ไม่ต้องรอสรุปรายเดือน"
                  value={form.safetyFlag ? ["on"] : []}
                  onToggle={() => patch("safetyFlag", !form.safetyFlag)}
                  options={[{ value: "on", label: "มีการกล่าวถึงความไม่ปลอดภัย การคุกคาม หรือการกระทำผิดกฎหมาย" }]}
                />
              </Card>
              <Card title="รายได้ย้อนหลัง 3 เดือน (บาท)">
                <div className="grid gap-3 sm:grid-cols-3">
                  <NumberField id={`${id}-net`} label="รายได้สุทธิ" optional value={form.income.net} onChange={(v) => patch("income", { net: v })} />
                  <NumberField id={`${id}-avg`} label="รายได้เฉลี่ย" optional value={form.income.average} onChange={(v) => patch("income", { average: v })} />
                  <NumberField id={`${id}-ded`} label="รายการหักเฉลี่ย" optional value={form.income.deduction} onChange={(v) => patch("income", { deduction: v })} />
                </div>
              </Card>
            </div>
          ) : (
            /* ── Wave 1 ── */
            <div className="flex flex-col gap-4">
              <Card title="ข้อมูลอ้างอิงก่อนโทร" icon={<ClipboardList size={15} aria-hidden />}>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-12-5 sm:grid-cols-3">
                  <Ref k="เบอร์ติดต่อ" v={d.phone} mono />
                  <Ref k="ฝ่าย / ประเภท" v={d.ownerTypeLabel} />
                  <Ref k="ตำแหน่ง" v={d.position} />
                  <Ref k="ลูกค้า" v={d.customer} />
                  <Ref k="สถานที่ทำงาน" v={[d.plant, d.siteLabel].filter(Boolean).join(" · ")} />
                  <Ref k="วันเริ่มงาน" v={d.startDateISO ? formatThaiDate(d.startDateISO) : ""} />
                  <Ref k="วันสุดท้าย" v={formatThaiDate(d.exitDateISO)} />
                  <Ref k="อายุงาน" v={d.tenureDays == null ? "" : `${d.tenureDays} วัน · ${d.tenureBand}`} />
                  {/* ช่องทางสรรหาระบบเติมจากใบสมัคร (`exit-interview/derive.ts`) · ST Zone / RC Mass เอาออกก่อน — ข้อมูล sync ไม่ได้ (Bew 25 พ.ย. 2569) */}
                  <Ref k="ช่องทางสรรหา" v={form.reference.channel} />
                  <Ref k="หมายเหตุตอนพ้นสภาพ" v={d.note} />
                </dl>
                <details className="group rounded-field bg-base-200 px-3 py-2 text-12 text-mut">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-ink">
                    <ChevronRight size={14} aria-hidden className="transition-transform group-open:rotate-90" />
                    กติกาการสัมภาษณ์
                  </summary>
                  <ul className="mt-1.5 list-disc pl-5">
                    {INTERVIEW_RULES.map((r) => (
                      <li key={r} className="text-pretty">
                        {r}
                      </li>
                    ))}
                  </ul>
                </details>
              </Card>

              <Card title="การติดต่อ" icon={<PhoneCall size={15} aria-hidden />}>
                <Contacts id={id} contacts={form.contacts} onChange={(c) => patch("contacts", c)} />
                <SegmentedControl<InterviewOutcome>
                  label="ผลการติดต่อ"
                  value={form.outcome}
                  onChange={(v) => patch("outcome", v)}
                  options={[
                    { value: "", label: "ยังไม่สรุป" },
                    { value: "interviewed", label: "สัมภาษณ์ได้" },
                    { value: "N1", label: "N1 ติดต่อไม่ได้" },
                    { value: "N2", label: "N2 ปฏิเสธให้ข้อมูล" },
                  ]}
                  className="self-start"
                />
                {form.outcome === "N1" && form.contacts.filter((c) => c.result === "no_answer").length < 3 ? (
                  <p className="text-12 text-alert">N1 ต้องโทรไม่รับครบ 3 ครั้ง คนละวัน คนละช่วงเวลา</p>
                ) : null}
                {noData ? (
                  <p className="text-12 text-mut text-pretty">
                    รหัสหลักจะถูกบันทึกเป็น {form.outcome} อัตโนมัติ · ยังลองส่งแบบสอบถามสั้นทาง LINE หรือถามพี่เลี้ยง/เพื่อนร่วมศูนย์ได้ภายใน 7 วัน
                  </p>
                ) : null}
              </Card>

              {noData ? null : (
                <>
                  <Card title="คำถาม Wave 1 — วันที่ออก">
                    <Wave1Fields id={id} v={form.wave1} set={(p) => patch("wave1", p)} />
                  </Card>
                  <DoneBar
                    checked={form.wave1.completed}
                    onChange={(v) => patch("wave1", { completed: v })}
                    label="สัมภาษณ์ Wave 1 เสร็จแล้ว"
                    next={() => go("wave2")}
                    nextLabel="ไป Wave 2"
                  />
                </>
              )}
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">
          <p className="mr-auto text-11-5 text-mut">
            {dirty ? (
              <span className="font-medium text-warning">● มีการแก้ไขที่ยังไม่บันทึก</span>
            ) : form?.updatedAt ? (
              `บันทึกล่าสุด ${formatThaiDateTime(form.updatedAt)} โดย ${form.updatedBy}`
            ) : form ? (
              "ยังไม่เคยบันทึก"
            ) : null}
          </p>
          <button
            type="button"
            onClick={() => void close()}
            disabled={busy}
            className="btn-sec cursor-pointer px-4 py-2 text-13 transition-colors hover:border-ink/30 disabled:opacity-50"
          >
            ปิด
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || !form}
            className="btn-pri cursor-pointer px-4 py-2 text-13 font-medium disabled:opacity-50"
          >
            บันทึก
          </button>
        </footer>
      </aside>
    </>,
    document.body,
  );
}

/* ------------------------------------------------------------------ แท็บ */

/** open = ยังไม่เสร็จ · done = เสร็จ · locked = ยังไม่ถึงรอบ · late = เลยกำหนด · skip = N1/N2 ไม่ต้องทำ */
type TabState = "open" | "done" | "locked" | "late" | "skip";

function Tabs({
  tab,
  onTab,
  wave1,
  wave2,
  wave2Window,
  safety,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  wave1: TabState;
  wave2: TabState;
  wave2Window: string;
  safety: boolean;
}) {
  const items: { key: Tab; label: string; sub: string; mark: React.ReactNode }[] = [
    {
      key: "wave1",
      label: "Wave 1",
      sub: wave1 === "skip" ? "ติดต่อไม่ได้ / ปฏิเสธ" : "วันที่ออก · ติดต่อ 3 ครั้ง",
      mark: <TabMark state={wave1} />,
    },
    {
      key: "wave2",
      label: "Wave 2",
      sub: wave2 === "skip" ? "ไม่ต้องโทร" : `โทรกลับ ${wave2Window}`,
      mark: <TabMark state={wave2} />,
    },
    {
      key: "summary",
      label: "สรุป",
      sub: "รหัสสาเหตุ · รายได้",
      mark: safety ? <ShieldAlert size={14} aria-label="แจ้ง HR Chief" className="text-alert" /> : null,
    },
  ];
  return (
    <div role="tablist" aria-label="ส่วนของ Exit Interview" className="grid grid-cols-3 border-b border-line px-5">
      {items.map((t) => {
        const on = tab === t.key;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onTab(t.key)}
            className={`-mb-px flex min-w-0 cursor-pointer flex-col items-start gap-0.5 border-b-2 px-2 py-2.5 text-left transition-colors ${
              on ? "border-primary" : "border-transparent hover:border-line-strong"
            }`}
          >
            <span className={`flex items-center gap-1.5 text-13-5 font-semibold ${on ? "text-primary" : "text-ink"}`}>
              {t.label}
              {t.mark}
            </span>
            <span className="w-full truncate text-11-5 text-mut">{t.sub}</span>
          </button>
        );
      })}
    </div>
  );
}

function TabMark({ state }: { state: TabState }) {
  switch (state) {
    case "done":
      return <CheckCircle2 size={14} aria-label="เสร็จแล้ว" className="text-success" />;
    case "locked":
      return <Lock size={12} aria-label="ยังไม่ถึงรอบ" className="text-mut" />;
    case "late":
      return <span aria-label="เลยกำหนด" className="size-2 rounded-full bg-alert" />;
    case "skip":
      return <span className="rounded-full bg-base-200 px-1.5 text-10-5 font-medium text-mut">ข้าม</span>;
    default:
      return <span aria-label="ยังไม่เสร็จ" className="size-2 rounded-full bg-warning" />;
  }
}

/* ------------------------------------------------------------------ ชิ้นย่อย */

function Card({
  title,
  icon,
  tone,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  tone?: "alert";
  children: React.ReactNode;
}) {
  return (
    <section className={`flex flex-col gap-3 rounded-box border bg-base-100 p-4 ${tone === "alert" ? "border-alert/40" : "border-line"}`}>
      <h3 className="flex items-center gap-2 text-13-5 font-semibold">
        {icon ? <span className="text-primary">{icon}</span> : null}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Callout({ tone, icon, children }: { tone: "info" | "alert"; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p
      className={`flex items-center gap-2 rounded-field border px-3 py-2 text-12-5 ${
        tone === "alert" ? "border-alert/30 bg-alert/6 text-alert" : "border-primary/25 bg-soft text-ink"
      }`}
    >
      <span className={tone === "alert" ? "" : "text-primary"}>{icon}</span>
      <span className="text-pretty">{children}</span>
    </p>
  );
}

function Empty({
  icon,
  title,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-box border border-dashed border-line-strong bg-base-100 px-6 py-10 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-base-200 text-mut">{icon}</span>
      <p className="text-13-5 font-semibold">{title}</p>
      <p className="text-12-5 text-mut text-pretty">{children}</p>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

/** ปิดรอบ — ติ๊ก “เสร็จแล้ว” แล้วมีทางลัดไปแท็บถัดไป */
function DoneBar({
  checked,
  onChange,
  label,
  next,
  nextLabel = "ไปสรุป",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  next: () => void;
  nextLabel?: string;
}) {
  const id = useId();
  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-box border px-4 py-1 transition-colors ${
        checked ? "border-success/40 bg-success/8" : "border-line bg-base-100"
      }`}
    >
      <CheckboxGroupField
        id={id}
        label="สถานะรอบนี้"
        optional
        value={checked ? ["done"] : []}
        onToggle={() => onChange(!checked)}
        options={[{ value: "done", label }]}
      />
      {checked ? (
        <button
          type="button"
          onClick={next}
          className="ml-auto flex cursor-pointer items-center gap-1 text-12-5 font-medium text-primary hover:underline"
        >
          {nextLabel} <ChevronRight size={14} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/** แท็บสรุป — สองรอบอยู่ตรงไหนแล้ว กดไปแท็บนั้นได้ */
function Overview({
  form,
  stage,
  exitDateISO,
  onTab,
}: {
  form: ExitInterview;
  stage: InterviewStage;
  exitDateISO: string;
  onTab: (t: Tab) => void;
}) {
  const noData = form.outcome === "N1" || form.outcome === "N2";
  const tries = form.contacts.filter((c) => c.dateISO || c.result).length;
  const cells: { tab: Tab; label: string; value: string; sub: string; ok: boolean }[] = [
    {
      tab: "wave1",
      label: "Wave 1",
      value: noData ? form.outcome : form.wave1.completed ? "เสร็จแล้ว" : "ยังไม่เสร็จ",
      sub: form.wave1.dateISO ? `สัมภาษณ์ ${formatThaiDate(form.wave1.dateISO)}` : `ติดต่อแล้ว ${tries}/3 ครั้ง`,
      ok: form.wave1.completed,
    },
    {
      tab: "wave2",
      label: "Wave 2",
      value: noData ? "ไม่ต้องโทร" : form.wave2.completed ? "เสร็จแล้ว" : "ยังไม่เสร็จ",
      sub: form.wave2.dateISO
        ? `โทร ${formatThaiDate(form.wave2.dateISO)}`
        : `กำหนดภายใน ${formatThaiDate(addDaysISO(exitDateISO, WAVE2_DUE_DAYS))}`,
      ok: form.wave2.completed,
    },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
      {cells.map((c) => (
        <button
          key={c.tab}
          type="button"
          onClick={() => onTab(c.tab)}
          className="flex cursor-pointer flex-col items-start gap-0.5 rounded-box border border-line bg-base-100 px-4 py-3 text-left transition-colors hover:border-primary/40"
        >
          <span className="text-11-5 font-medium text-mut">{c.label}</span>
          <span className={`flex items-center gap-1.5 text-14 font-semibold ${c.ok ? "text-success" : "text-ink"}`}>
            {c.ok ? <CheckCircle2 size={15} aria-hidden /> : null}
            {c.value}
          </span>
          <span className="text-11-5 text-mut">{c.sub}</span>
        </button>
      ))}
      <div className="flex flex-col items-start justify-center gap-1 rounded-box border border-line bg-base-100 px-4 py-3">
        <span className="text-11-5 font-medium text-mut">สถานะรวม</span>
        <span className={`chip px-2 py-0.5 text-11-5 ${STAGE_CHIP[stage]}`}>{STAGE_LABEL[stage]}</span>
      </div>
    </div>
  );
}

function Ref({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-11-5 text-mut">{k}</dt>
      <dd className={`truncate text-ink ${mono ? "font-mono" : ""}`} title={v}>
        {v || "—"}
      </dd>
    </div>
  );
}

function Contacts({
  id,
  contacts,
  onChange,
}: {
  id: string;
  contacts: ContactAttempt[];
  onChange: (c: ContactAttempt[]) => void;
}) {
  function set(slot: 1 | 2 | 3, p: Partial<ContactAttempt>) {
    const cur = contacts.find((c) => c.slot === slot) ?? { slot, dateISO: "", result: "" as ContactResult, note: "" };
    const next = { ...cur, ...p };
    onChange([...contacts.filter((c) => c.slot !== slot), next].sort((a, b) => a.slot - b.slot));
  }
  return (
    <div className="flex flex-col divide-y divide-line rounded-field border border-line">
      {CONTACT_SLOTS.map((s) => {
        const c = contacts.find((x) => x.slot === s.slot);
        return (
          <div key={s.slot} className="grid items-end gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_11rem_auto]">
            <div className="text-12-5">
              <p className="font-medium">{s.label}</p>
              <p className="text-mut">
                {s.window} · {s.hint}
              </p>
            </div>
            <DateField id={`${id}-c${s.slot}`} label="วันที่โทร" value={c?.dateISO ?? ""} onChange={(v) => set(s.slot, { dateISO: v })} />
            <SegmentedControl<ContactResult>
              label={`ผลการโทร${s.label}`}
              value={c?.result ?? ""}
              onChange={(v) => set(s.slot, { result: v })}
              options={[
                { value: "", label: "—" },
                { value: "answered", label: "รับ" },
                { value: "no_answer", label: "ไม่รับ" },
              ]}
            />
          </div>
        );
      })}
    </div>
  );
}

function ReasonCodes({
  id,
  master,
  codes,
  locked,
  onChange,
}: {
  id: string;
  master: ResignMaster | null;
  codes: CodeState;
  /** N1/N2 = รหัสหลักถูกกำหนดจากผลการติดต่อ */
  locked: string;
  onChange: (c: CodeState) => void;
}) {
  const primary = locked || codes.primary;
  const groups = useMemo(() => (master ? reasonGroups(master, primary) : []), [master, primary]);
  const pick = master?.reasons.find((r) => r.code === primary);
  const subGroups = (keep: string) =>
    (master ? reasonGroups(master, keep) : []).map((g) => ({
      ...g,
      options: g.options.filter((o) => o.value !== primary),
    }));
  return (
    <div className="flex flex-col gap-3">
      <SelectField
        id={`${id}-primary`}
        label="รหัสสาเหตุหลัก"
        value={primary}
        onChange={(v) => onChange({ ...codes, primary: v })}
        groups={groups}
        searchable
        readOnly={!master || Boolean(locked)}
        hint="สาเหตุที่ “ทำให้ตัดสินใจจริง” (Q3 / QW3) ไม่ใช่เหตุผลที่เขียนในใบลาออก"
      />
      {pick ? (
        <p className="-mt-1 flex flex-wrap items-center gap-2 text-12 text-mut">
          {pick.controllable ? (
            <span className={`chip ${CONTROLLABLE_CHIP[pick.controllable]}`}>{controllableLabel(pick.controllable)}</span>
          ) : null}
          {pick.owner && pick.owner !== "-" ? (
            <span>
              เจ้าของการแก้ไข · <b className="text-ink">{pick.owner}</b>
            </span>
          ) : null}
          {pick.evidence ? <span className="w-full text-pretty">หลักฐาน · {pick.evidence}</span> : null}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {([0, 1] as const).map((i) => (
          <SelectField
            key={i}
            id={`${id}-sec${i}`}
            label={`รหัสสาเหตุรอง ${i + 1}`}
            optional
            value={codes.secondary[i]}
            onChange={(v) => {
              const next: [string, string] = [...codes.secondary];
              next[i] = v;
              onChange({ ...codes, secondary: next });
            }}
            groups={subGroups(codes.secondary[i]).map((g) => ({
              ...g,
              options: g.options.filter((o) => o.value !== codes.secondary[1 - i]),
            }))}
            searchable
            clearable
            placeholder="ไม่มี"
            readOnly={!master}
          />
        ))}
      </div>
      <Script
        title="เลือกรหัสยังไง"
        text="รหัสหลักบังคับ 1 รหัสเสมอ · รหัสรองใส่ได้สูงสุด 2 รหัส ห้ามซ้ำรหัสหลัก · คนที่ติดต่อไม่ได้ยังต้องบันทึกเป็น N1 เพื่อให้ Coverage ถูกต้อง"
      />
    </div>
  );
}
