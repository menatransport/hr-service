"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, X } from "lucide-react";

import { CheckboxGroupField, DateField, NumberField, SelectField, TextField, isDropdownOpen } from "@/components/ui/field";
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
  RECRUIT_CHANNELS,
  STAGE_CHIP,
  STAGE_LABEL,
  WAVE2_DUE_DAYS,
  WAVE2_OPEN_DAYS,
  type ContactAttempt,
  type ContactResult,
  type ExitInterview,
  type ExitInterviewBundle,
  type InterviewOutcome,
} from "@/app/recruitment/_lib/exit-interview/types";
import { useResignMaster } from "@/app/recruitment/_components/admin/use-resign-master";
import { Script, Wave1Fields, Wave2Fields } from "@/app/recruitment/_components/admin/exit-interview-waves";

/**
 * ลิ้นชัก Exit Interview — เปิดจากแท็บ “พ้นสภาพแล้ว” (คอลัมน์ Exit Interview) · เฉพาะสิทธิ์ `exit-interview`
 *
 * ① ข้อมูลอ้างอิง (แทนชีต “ก่อนโทร”) → ② การติดต่อ 3 ครั้ง / N1 / N2 → ③ Wave 1 → ④ รหัสสาเหตุ
 * → ⑤ Wave 2 (วันออก +30 ถึง +45) → ⑥ รายได้ย้อนหลัง 3 เดือน · บันทึกทั้งชุดครั้งเดียว
 * (`PUT /api/drivers/{code}/exit-interview`) แล้ว `router.refresh()` ให้รหัสในตารางเปลี่ยนตาม
 */

type CodeState = { primary: string; secondary: [string, string] };

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

  function load(b: ExitInterviewBundle) {
    setBundle(b);
    setForm(b.interview);
    setCodes({
      primary: b.driver.reasonCode,
      secondary: [b.driver.secondaryCodes[0] ?? "", b.driver.secondaryCodes[1] ?? ""],
    });
    setDirty(false);
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

  return (
    <>
      <div onClick={() => void close()} aria-hidden className="fixed inset-0 z-50 animate-fade-in bg-ink/30" />
      <aside
        role="dialog"
        aria-label="Exit Interview"
        className="elev-pop fixed top-0 right-0 bottom-0 z-50 flex w-[min(720px,100vw)] animate-fade-in flex-col bg-base-100 text-ink"
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-11-5 font-medium text-mut">Exit Interview · {drivercode}</p>
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
              <p className="mt-0.5 text-12 text-mut">
                พ้นสภาพ {formatThaiDate(d.exitDateISO, "full")} · {d.reasonCode} {d.reasonLabel}
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

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loadError ? (
            <p role="alert" className="rounded-field border border-alert/30 bg-alert/6 px-3 py-2 text-12-5 text-alert">
              {loadError}
            </p>
          ) : !bundle || !form || !d ? (
            <div className="py-10">
              <MascotLoader text="กำลังโหลด Exit Interview" />
            </div>
          ) : (
            <>
              <Section no="①" title="ข้อมูลอ้างอิงก่อนโทร">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-12-5 sm:grid-cols-3">
                  <Ref k="เบอร์ติดต่อ" v={d.phone} />
                  <Ref k="ฝ่าย / ประเภท" v={d.ownerTypeLabel} />
                  <Ref k="ตำแหน่ง" v={d.position} />
                  <Ref k="ลูกค้า" v={d.customer} />
                  <Ref k="สถานที่ทำงาน" v={[d.plant, d.siteLabel].filter(Boolean).join(" · ")} />
                  <Ref k="วันเริ่มงาน" v={d.startDateISO ? formatThaiDate(d.startDateISO) : ""} />
                  <Ref k="วันสุดท้าย" v={formatThaiDate(d.exitDateISO)} />
                  <Ref k="อายุงาน" v={d.tenureDays == null ? "" : `${d.tenureDays} วัน · ${d.tenureBand}`} />
                  <Ref k="หมายเหตุตอนพ้นสภาพ" v={d.note} />
                </dl>
                <div className="grid gap-3 sm:grid-cols-3">
                  <TextField id={`${id}-st`} label="ST Zone" optional value={form.reference.stZone} onChange={(v) => patch("reference", { stZone: v })} placeholder="เช่น ST Zone 3" />
                  <TextField id={`${id}-rc`} label="RC Mass" optional value={form.reference.rcOwner} onChange={(v) => patch("reference", { rcOwner: v })} />
                  <TextField id={`${id}-ch`} label="ช่องทางสรรหา" optional list={`${id}-channels`} value={form.reference.channel} onChange={(v) => patch("reference", { channel: v })} />
                  <datalist id={`${id}-channels`}>
                    {RECRUIT_CHANNELS.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <ul className="list-disc rounded-field bg-base-200 py-2 pr-3 pl-7 text-12 text-mut">
                  {INTERVIEW_RULES.map((r) => (
                    <li key={r} className="text-pretty">{r}</li>
                  ))}
                </ul>
              </Section>

              <Section no="②" title="การติดต่อ">
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
              </Section>

              {noData ? null : (
                <Section no="③" title="Wave 1 — วันที่ออก">
                  <Wave1Fields id={id} v={form.wave1} set={(p) => patch("wave1", p)} />
                  <Done
                    id={`${id}-w1done`}
                    checked={form.wave1.completed}
                    onChange={(v) => patch("wave1", { completed: v })}
                    label="สัมภาษณ์ Wave 1 เสร็จแล้ว"
                  />
                </Section>
              )}

              <Section no="④" title="สรุปรหัสสาเหตุ">
                <ReasonCodes id={id} master={master} codes={codes} locked={noData ? form.outcome : ""} onChange={(c) => {
                  setCodes(c);
                  setDirty(true);
                }} />
                <CheckboxGroupField
                  id={`${id}-safety`}
                  label="เรื่องความปลอดภัย"
                  optional
                  hint="ถ้ามีการกล่าวถึง ต้องแจ้ง HR Chief ทันที ไม่ต้องรอสรุปรายเดือน"
                  value={form.safetyFlag ? ["on"] : []}
                  onToggle={() => patch("safetyFlag", !form.safetyFlag)}
                  options={[{ value: "on", label: "มีการกล่าวถึงความไม่ปลอดภัย การคุกคาม หรือการกระทำผิดกฎหมาย" }]}
                />
                {form.reasonHistory.length ? (
                  <ul className="flex flex-col gap-1 text-12 text-mut">
                    {form.reasonHistory.map((h) => (
                      <li key={h.at}>
                        {formatThaiDateTime(h.at)} · {h.from} → <b className="text-ink">{h.to}</b> ({h.source === "wave2" ? "Wave 2" : "Wave 1"}) โดย {h.by}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Section>

              {noData ? null : (
                <Section no="⑤" title="Wave 2 — โทรกลับ">
                  {!form.wave1.completed ? (
                    <p className="text-12-5 text-mut">บันทึก Wave 1 ให้เสร็จก่อน แล้วโทรกลับวันที่ {WAVE2_OPEN_DAYS}–{WAVE2_DUE_DAYS} หลังออก</p>
                  ) : (
                    <>
                      <p className="text-12-5 text-mut">
                        ช่วงโทร {formatThaiDate(addDaysISO(d.exitDateISO, WAVE2_OPEN_DAYS))} – {formatThaiDate(addDaysISO(d.exitDateISO, WAVE2_DUE_DAYS))}
                      </p>
                      <Wave2Fields
                        id={id}
                        v={form.wave2}
                        set={(p) => patch("wave2", p)}
                        codeGroups={master ? reasonGroups(master, form.wave2.qw31Code) : []}
                      />
                      <Done id={`${id}-w2done`} checked={form.wave2.completed} onChange={(v) => patch("wave2", { completed: v })} label="โทร Wave 2 เสร็จแล้ว" />
                    </>
                  )}
                </Section>
              )}

              <Section no="⑥" title="รายได้ย้อนหลัง 3 เดือน (บาท)">
                <div className="grid gap-3 sm:grid-cols-3">
                  <NumberField id={`${id}-net`} label="รายได้สุทธิ" optional value={form.income.net} onChange={(v) => patch("income", { net: v })} />
                  <NumberField id={`${id}-avg`} label="รายได้เฉลี่ย" optional value={form.income.average} onChange={(v) => patch("income", { average: v })} />
                  <NumberField id={`${id}-ded`} label="รายการหักเฉลี่ย" optional value={form.income.deduction} onChange={(v) => patch("income", { deduction: v })} />
                </div>
              </Section>

              {form.updatedAt ? (
                <p className="pt-2 text-11-5 text-mut">บันทึกล่าสุด {formatThaiDateTime(form.updatedAt)} โดย {form.updatedBy}</p>
              ) : null}
            </>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">
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
    </>
  );
}

/* ------------------------------------------------------------------ ชิ้นย่อย */

function Section({ no, title, children }: { no: string; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-line py-4 first:border-t-0 first:pt-0">
      <h3 className="flex items-center gap-2 text-13-5 font-semibold">
        <span className="text-primary">{no}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Ref({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-11-5 text-mut">{k}</dt>
      <dd className="truncate text-ink" title={v}>{v || "—"}</dd>
    </div>
  );
}

function Done({
  id,
  checked,
  onChange,
  label,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <CheckboxGroupField
      id={id}
      label="สถานะรอบนี้"
      optional
      value={checked ? ["done"] : []}
      onToggle={() => onChange(!checked)}
      options={[{ value: "done", label }]}
    />
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
          {pick.owner && pick.owner !== "-" ? <span>เจ้าของการแก้ไข · <b className="text-ink">{pick.owner}</b></span> : null}
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
