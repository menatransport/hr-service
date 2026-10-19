"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Check, Link2Off, RefreshCw } from "lucide-react";

import { PageHead } from "@/components/desk/page-head";
import { DataError } from "@/components/ui/data-error";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchField } from "@/components/ui/field";
import { StatCard } from "@/components/ui/stat-card";
import { ownerTypeLabel } from "@/app/recruitment/_lib/drivers/types";
import { CONFLICT_LABELS, PAYMENT_SOURCE_NOTE } from "@/lib/driver-links/conflicts";
import type { Confidence, MatchCandidate, MatchProposal, MatchedBy } from "@/lib/driver-links/match";
import type { DriverLinksOverview, LinkView } from "@/lib/driver-links/types";

/**
 * หน้าจับคู่คนขับรถร่วม (สัญญาใน mena_partner) กับทะเบียน พจส. — สามแท็บ
 *
 * - **จับคู่**: ข้อเสนอเรียงมั่นใจมาก→น้อย · กดยืนยันทีละสัญญา · ไม่มีอะไรลงฐานจนกว่าคนจะกด
 * - **ตัวเลขคนขับ**: ตัวเลขของแต่ละฝั่งวางคู่กับตัวรวม พร้อมบอกว่าส่วนต่างมาจากไหน
 * - **ขัดแย้ง**: คู่ที่สองฝั่งพูดไม่ตรงกัน — แสดงอย่างเดียว ไม่แก้ให้เอง
 */

type Tab = "match" | "count" | "conflict";
type MatchView = "pending" | "linked";

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "มั่นใจมาก",
  medium: "น่าจะใช่",
  low: "ต้องตรวจ",
};
const CONFIDENCE_TONE: Record<Confidence, string> = {
  high: "badge-success",
  medium: "badge-info",
  low: "badge-warning",
};
const MATCHED_BY_LABEL: Record<MatchedBy, string> = {
  nationalId: "เลขบัตรประชาชนตรงกัน",
  "name+plate": "ชื่อและทะเบียนรถตรงกัน",
  name: "ชื่อตรงกัน (ทะเบียนไม่ตรงหรือไม่มี)",
  manual: "กรอกรหัสเอง",
};

const PAGE = 40;
const fmt = (n: number) => n.toLocaleString("th-TH");

async function readJson<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error || `ระบบตอบกลับ ${res.status}`);
  return json;
}

export function DriverLinksView() {
  const [data, setData] = useState<DriverLinksOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("match");
  const [flash, setFlash] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  /* setState อยู่ใน callback ของ promise เท่านั้น — effect แค่จุดการโหลดครั้งแรก */
  const fetchOverview = useCallback(
    () =>
      fetch("/api/driver-links", { cache: "no-store" })
        .then((res) => readJson<DriverLinksOverview>(res))
        .then(
          (next) => {
            setData(next);
            setError(null);
          },
          (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
        )
        .finally(() => setLoading(false)),
    [],
  );

  const load = useCallback(() => {
    setLoading(true);
    return fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    void fetchOverview();
  }, [fetchOverview]);

  const say = (tone: "ok" | "err", text: string) => {
    setFlash({ tone, text });
    window.setTimeout(() => setFlash((f) => (f?.text === text ? null : f)), 5000);
  };

  const confirm = async (input: {
    contractCode: string;
    drivercode: string;
    matchedBy: MatchedBy;
    confidence: Confidence;
    note?: string;
  }) => {
    try {
      await readJson(
        await fetch("/api/driver-links", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        }),
      );
      say("ok", `จับคู่ ${input.contractCode} กับ ${input.drivercode} แล้ว`);
      await load();
      return true;
    } catch (e) {
      say("err", e instanceof Error ? e.message : String(e));
      return false;
    }
  };

  const release = async (link: LinkView) => {
    const ok = window.confirm(
      `ปลดคู่ ${link.contractCode} ↔ ${link.drivercode}?\nสัญญานี้จะกลับไปอยู่ในรายการรอจับคู่`,
    );
    if (!ok) return;
    try {
      await readJson(
        await fetch(`/api/driver-links/${encodeURIComponent(link.contractCode)}`, { method: "DELETE" }),
      );
      say("ok", `ปลดคู่ ${link.contractCode} แล้ว`);
      await load();
    } catch (e) {
      say("err", e instanceof Error ? e.message : String(e));
    }
  };

  const subtitle =
    "ผูกสัญญารถร่วมแต่ละใบเข้ากับรหัส พจส. ในทะเบียน เพื่อให้ทั้งบริษัทอ้างคนขับด้วยเลขเดียวกัน · ระบบแค่เสนอ คนเป็นคนกดยืนยัน";

  if (error && !data) {
    return (
      <div className="flex flex-col gap-6 animate-rise">
        <PageHead title="จับคู่คนขับรถร่วม" subtitle={subtitle} />
        <DataError title="โหลดข้อมูลคนขับไม่สำเร็จ" message={error} envKey="MONGO_URI" />
      </div>
    );
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "match", label: "จับคู่", count: data?.proposals.length },
    { id: "count", label: "ตัวเลขคนขับ" },
    { id: "conflict", label: "ขัดแย้ง", count: data?.conflicts.length },
  ];

  return (
    <div className="flex flex-col gap-5 animate-rise">
      <PageHead
        title="จับคู่คนขับรถร่วม"
        subtitle={subtitle}
        actions={
          <button type="button" className="btn-sec flex items-center gap-2 px-3.5 py-2 text-12-5" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} aria-hidden />
            โหลดใหม่
          </button>
        }
      />

      <div role="tablist" aria-label="มุมมอง" className="flex flex-wrap gap-1.5 border-b border-line pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-13 transition-colors ${
              tab === t.id ? "bg-primary text-primary-content" : "text-mut hover:bg-base-200 hover:text-ink"
            }`}
          >
            {t.label}
            {t.count !== undefined ? (
              <span className="font-mono text-11 tabular-nums opacity-80">{fmt(t.count)}</span>
            ) : null}
          </button>
        ))}
      </div>

      {flash ? (
        <div role="status" className={`alert ${flash.tone === "ok" ? "alert-success" : "alert-error"} text-13`}>
          {flash.text}
        </div>
      ) : null}

      {!data ? (
        <div className="flex flex-col gap-3" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-20 w-full" />
          ))}
        </div>
      ) : tab === "match" ? (
        <MatchTab data={data} onConfirm={confirm} onRelease={release} />
      ) : tab === "count" ? (
        <CountTab data={data} />
      ) : (
        <ConflictTab data={data} onRelease={release} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ จับคู่ */

type ConfirmFn = (input: {
  contractCode: string;
  drivercode: string;
  matchedBy: MatchedBy;
  confidence: Confidence;
  note?: string;
}) => Promise<boolean>;

function MatchTab({
  data,
  onConfirm,
  onRelease,
}: {
  data: DriverLinksOverview;
  onConfirm: ConfirmFn;
  onRelease: (l: LinkView) => void;
}) {
  const [view, setView] = useState<MatchView>("pending");
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query.trim().toLowerCase());
  const [limit, setLimit] = useState(PAGE);

  const proposals = useMemo(
    () =>
      data.proposals.filter(
        (p) =>
          !q ||
          p.contractCode.toLowerCase().includes(q) ||
          p.partnerName.toLowerCase().includes(q) ||
          p.candidates.some((c) => c.drivercode.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)),
      ),
    [data.proposals, q],
  );
  const links = useMemo(
    () =>
      data.links.filter(
        (l) =>
          !q ||
          l.contractCode.toLowerCase().includes(q) ||
          l.drivercode.toLowerCase().includes(q) ||
          (l.partnerName ?? "").toLowerCase().includes(q) ||
          (l.etlName ?? "").toLowerCase().includes(q),
      ),
    [data.links, q],
  );

  const tiers = useMemo(() => {
    const t = { high: 0, medium: 0, low: 0, none: 0 };
    for (const p of data.proposals) t[p.candidates[0]?.confidence ?? "none"] += 1;
    return t;
  }, [data.proposals]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="join">
          <button
            type="button"
            className={`btn join-item btn-sm ${view === "pending" ? "btn-primary" : ""}`}
            onClick={() => setView("pending")}
          >
            รอยืนยัน {fmt(data.proposals.length)}
          </button>
          <button
            type="button"
            className={`btn join-item btn-sm ${view === "linked" ? "btn-primary" : ""}`}
            onClick={() => setView("linked")}
          >
            จับคู่แล้ว {fmt(data.links.length)}
          </button>
        </div>
        <SearchField
          value={query}
          onChange={(v) => {
            setQuery(v);
            setLimit(PAGE);
          }}
          label="ค้นหาสัญญา ชื่อ หรือรหัส พจส."
          placeholder="ค้นหาสัญญา ชื่อ หรือรหัส พจส."
          className="w-full sm:max-w-90"
        />
      </div>

      {view === "pending" ? (
        <>
          <p className="text-12-5 text-mut">
            มั่นใจมาก {fmt(tiers.high)} · น่าจะใช่ {fmt(tiers.medium)} · ต้องตรวจ {fmt(tiers.low)} · ยังหาไม่เจอ{" "}
            {fmt(tiers.none)}
            {data.nationalIdField
              ? ""
              : " — ตอนนี้ทะเบียน พจส. ยังไม่มีเลขบัตรประชาชนให้เทียบ ระบบจึงดูจากชื่อกับทะเบียนรถอย่างเดียว"}
          </p>
          {proposals.length === 0 ? (
            <EmptyState
              title={q ? "ไม่เจอสัญญาที่ค้นหา" : "จับคู่ครบทุกสัญญาแล้ว"}
              onClear={q ? () => setQuery("") : undefined}
              clearLabel="ล้างคำค้นหา"
            />
          ) : (
            <ul className="divide-y divide-line rounded-box border border-line">
              {proposals.slice(0, limit).map((p) => (
                <ProposalRow key={p.contractCode} proposal={p} onConfirm={onConfirm} />
              ))}
            </ul>
          )}
          {proposals.length > limit ? (
            <button type="button" className="btn-sec self-center px-4 py-2 text-12-5" onClick={() => setLimit((n) => n + PAGE)}>
              แสดงเพิ่มอีก {fmt(Math.min(PAGE, proposals.length - limit))} จาก {fmt(proposals.length - limit)} สัญญาที่เหลือ
            </button>
          ) : null}
        </>
      ) : links.length === 0 ? (
        <EmptyState
          title={q ? "ไม่เจอคู่ที่ค้นหา" : "ยังไม่มีคู่ที่ยืนยัน"}
          hint={q ? undefined : "เริ่มจากแท็บรอยืนยัน ข้อเสนอที่มั่นใจมากอยู่บนสุด"}
          onClear={q ? () => setQuery("") : undefined}
          clearLabel="ล้างคำค้นหา"
        />
      ) : (
        <div className="overflow-x-auto rounded-box border border-line">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>สัญญา</th>
                <th>ชื่อฝั่งรถร่วม</th>
                <th>รหัส พจส.</th>
                <th>ชื่อในทะเบียน</th>
                <th>จับด้วย</th>
                <th>ยืนยันโดย</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {links.map((l) => (
                <tr key={l.contractCode}>
                  <td className="font-mono text-12">{l.contractCode}</td>
                  <td>{l.partnerName ?? <span className="text-mut">ไม่มีในรถร่วมแล้ว</span>}</td>
                  <td className="font-mono text-12">{l.drivercode}</td>
                  <td>{l.etlName ?? <span className="text-mut">ไม่มีในทะเบียนแล้ว</span>}</td>
                  <td className="text-12">
                    {MATCHED_BY_LABEL[l.matchedBy]}
                    {l.note ? <div className="text-11-5 text-mut">{l.note}</div> : null}
                  </td>
                  <td className="text-12">
                    {l.confirmedByName || l.confirmedBy}
                    <div className="text-11-5 text-mut">
                      {l.confirmedAt ? new Date(l.confirmedAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }) : ""}
                    </div>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs text-error"
                      onClick={() => onRelease(l)}
                      aria-label={`ปลดคู่ ${l.contractCode}`}
                    >
                      <Link2Off size={14} aria-hidden /> ปลดคู่
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CandidateLine({ c }: { c: MatchCandidate }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className="font-mono text-12">{c.drivercode}</span>
      <span className="text-13">{c.name}</span>
      <span className="text-11-5 text-mut">
        {ownerTypeLabel(c.ownerType) || "ไม่ระบุประเภท"}
        {c.plateNo ? ` · ${c.plateNo}` : ""}
        {c.active ? "" : " · พ้นสภาพแล้ว"}
      </span>
    </span>
  );
}

function ProposalRow({ proposal: p, onConfirm }: { proposal: MatchProposal; onConfirm: ConfirmFn }) {
  // ชื่อซ้ำ = ไม่เลือกให้ ต้องให้คนเลือกเอง
  const [picked, setPicked] = useState<string>(p.ambiguous ? "" : (p.candidates[0]?.drivercode ?? ""));
  const [manual, setManual] = useState(p.candidates.length === 0);
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const best = p.candidates[0];
  const chosen = p.candidates.find((c) => c.drivercode === picked);

  const submit = async () => {
    setBusy(true);
    const ok = manual
      ? await onConfirm({ contractCode: p.contractCode, drivercode: code.trim(), matchedBy: "manual", confidence: "low", note: note.trim() })
      : chosen
        ? await onConfirm({
            contractCode: p.contractCode,
            drivercode: chosen.drivercode,
            matchedBy: chosen.matchedBy,
            confidence: chosen.confidence,
          })
        : false;
    if (!ok) setBusy(false);
  };

  const canSubmit = manual ? code.trim() !== "" && note.trim() !== "" : Boolean(chosen);

  return (
    <li className="flex flex-col gap-3 px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-12 text-mut">{p.contractCode}</span>
        <span className="text-13-5 font-medium">{p.partnerName || "ไม่มีชื่อ"}</span>
        {p.licensePlate ? <span className="text-12 text-mut">ทะเบียน {p.licensePlate}</span> : null}
        {!p.partnerActive ? <span className="badge badge-ghost badge-sm">รถร่วมพ้นสภาพแล้ว</span> : null}
        {best ? (
          <span className={`badge badge-sm ${CONFIDENCE_TONE[best.confidence]}`}>{CONFIDENCE_LABEL[best.confidence]}</span>
        ) : (
          <span className="badge badge-ghost badge-sm">ยังหาไม่เจอ</span>
        )}
        {p.ambiguous ? <span className="badge badge-warning badge-outline badge-sm">ชื่อซ้ำกันหลายคน เลือกเอง</span> : null}
      </div>

      {!manual && p.candidates.length > 0 ? (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="sr-only">เลือกรหัส พจส. ของ {p.contractCode}</legend>
          {p.candidates.map((c) => (
            <label key={c.drivercode} className="flex cursor-pointer items-start gap-2.5 rounded-field px-2 py-1.5 hover:bg-base-200/60">
              <input
                type="radio"
                className="radio radio-sm radio-primary mt-0.5"
                name={`pick-${p.contractCode}`}
                checked={picked === c.drivercode}
                onChange={() => setPicked(c.drivercode)}
              />
              <span className="flex flex-col gap-0.5">
                <CandidateLine c={c} />
                <span className="text-11-5 text-mut">{MATCHED_BY_LABEL[c.matchedBy]}</span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}

      {manual ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex flex-col gap-1">
            <span className="text-12 text-mut">รหัส พจส.</span>
            <input className="input input-sm w-40 font-mono" value={code} onChange={(e) => setCode(e.target.value)} placeholder="เช่น 6501234" />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-12 text-mut">รู้ได้อย่างไรว่าเป็นคนนี้</span>
            <input
              className="input input-sm w-full"
              value={note}
              maxLength={300}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น โทรถามหัวหน้าคิวแล้ว / ดูจากสำเนาบัตร"
            />
          </label>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary btn-sm" disabled={!canSubmit || busy} onClick={() => void submit()}>
          <Check size={14} aria-hidden />
          {busy ? "กำลังบันทึก…" : manual ? "ยืนยันรหัสนี้" : chosen ? `ยืนยัน ${chosen.drivercode}` : "เลือกคนก่อน"}
        </button>
        {p.candidates.length > 0 ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setManual((m) => !m)}>
            {manual ? "กลับไปเลือกจากรายชื่อ" : "ไม่ใช่ทั้งหมด กรอกรหัสเอง"}
          </button>
        ) : null}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------ ตัวเลขคนขับ */

function CountTab({ data }: { data: DriverLinksOverview }) {
  const h = data.headcount;
  const pending = data.proposals.filter((p) => p.partnerActive).length;
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-box border border-primary/25 bg-soft px-5 py-4">
        <p className="text-12-5 text-mut">คนขับทั้งบริษัท ณ ตอนนี้</p>
        <p className="text-4xl leading-tight font-semibold text-primary tabular-nums">{fmt(h.total)} คน</p>
        <p className="mt-1 text-13 text-ink">
          ทะเบียน พจส. {fmt(h.etlActive)} + รถร่วมที่ไม่ซ้ำกับทะเบียน {fmt(h.partnerOnly)} = {fmt(h.total)}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="ทะเบียน พจส. ที่ยังทำงาน"
          value={fmt(h.etlActive)}
          hint={`พจส. ${fmt(h.byType["1"] ?? 0)} · พจร. ${fmt(h.byType["2"] ?? 0)} · สแปร์ ${fmt(h.byType["4"] ?? 0)}`}
        />
        <StatCard
          label="คนขับรถร่วมที่ยังทำงาน"
          value={fmt(h.partnerActive)}
          hint={
            h.excludedOwners
              ? `ไม่รวมเจ้าของรถที่ไม่ได้ขับเอง ${fmt(h.excludedOwners)} คน`
              : "นับเป็นคน ไม่ใช่นับสัญญา"
          }
        />
        <StatCard label="อยู่ทั้งสองฝั่ง (หักออกแล้ว)" value={fmt(h.linkedBoth)} hint="จับคู่แล้ว นับครั้งเดียว" tone="primary" />
      </div>

      <section className="flex flex-col gap-2 text-13 leading-[1.75]">
        <h2 className="text-14 font-semibold">ส่วนต่างมาจากไหน</h2>
        <p>
          รถร่วมมีคนขับ {fmt(h.partnerActive)} คน ในจำนวนนี้ {fmt(h.linkedBoth)} คนจับคู่กับทะเบียน พจส. แล้ว
          จึงถูกนับไปแล้วทางฝั่งทะเบียน เหลือ {fmt(h.partnerOnly)} คนที่บวกเพิ่มเข้าไป
        </p>
        <p>
          ทะเบียนมี พจร. {fmt(h.byType["2"] ?? 0)} คน ส่วนรถร่วมมีคนขับ {fmt(h.partnerActive)} คน
          {(h.byType["2"] ?? 0) === h.partnerActive
            ? " เท่ากันพอดี"
            : ` ต่างกัน ${fmt(Math.abs((h.byType["2"] ?? 0) - h.partnerActive))} คน`}{" "}
          — สองตัวเลขนี้ไม่จำเป็นต้องเท่ากัน เพราะคนโยกกลุ่มได้ และบางคนยังไม่ได้ลงทะเบียน พจส.
        </p>
        {pending > 0 ? (
          <p className="text-mut">
            ยังมีสัญญาที่คนขับยังทำงานอยู่รอจับคู่อีก {fmt(pending)} สัญญา ถ้าคนพวกนี้มีรหัส พจส. อยู่แล้ว
            ตัวเลขรวมจะลดลงเมื่อจับคู่ครบ
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-1.5">
        <h2 className="text-14 font-semibold">นับแบบนี้ (รอเจ้าของงานยืนยัน)</h2>
        <ul className="list-disc pl-5 text-13 leading-[1.75] text-ink">
          {data.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ ขัดแย้ง */

function ConflictTab({ data, onRelease }: { data: DriverLinksOverview; onRelease: (l: LinkView) => void }) {
  const linkBy = useMemo(() => new Map(data.links.map((l) => [l.contractCode, l])), [data.links]);
  return (
    <div className="flex flex-col gap-4">
      <div role="note" className="alert alert-info text-13">
        {PAYMENT_SOURCE_NOTE} · ระบบไม่แก้ข้อมูลฝั่งไหนให้เอง ถ้าคู่ผิดให้ปลดคู่ ถ้าสถานะผิดให้ไปแก้ที่ต้นทาง
      </div>
      {data.conflicts.length === 0 ? (
        <EmptyState title="ไม่มีคู่ที่ขัดกัน" hint="คู่ที่ยืนยันแล้วทุกคู่ สถานะและชื่อตรงกันทั้งสองฝั่ง" />
      ) : (
        <div className="overflow-x-auto rounded-box border border-line">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>เรื่อง</th>
                <th>สัญญา</th>
                <th>รหัส พจส.</th>
                <th>รายละเอียด</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.conflicts.map((c) => {
                const link = linkBy.get(c.contractCode);
                return (
                  <tr key={`${c.kind}-${c.contractCode}`}>
                    <td>
                      <span className="badge badge-warning badge-sm whitespace-nowrap">{CONFLICT_LABELS[c.kind]}</span>
                    </td>
                    <td className="font-mono text-12">{c.contractCode}</td>
                    <td className="font-mono text-12">{c.drivercode}</td>
                    <td className="text-12-5">{c.detail}</td>
                    <td>
                      {link ? (
                        <button type="button" className="btn btn-ghost btn-xs" onClick={() => onRelease(link)}>
                          <Link2Off size={14} aria-hidden /> ปลดคู่
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
