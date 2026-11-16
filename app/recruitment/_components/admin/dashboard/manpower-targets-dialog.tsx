"use client";

import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";

import { ModalShell } from "@/components/ui/modal-shell";
import { requestJson } from "@/lib/http";
import { SiteNav } from "@/app/recruitment/_components/admin/site-nav";
import { RECRUIT_SITES, type RecruitSite } from "@/app/recruitment/_lib/sites";
import {
  MP_GROUPS,
  fmtNum,
  recruitOf,
  siteTargetKey,
  type MpGroup,
  type MpRow,
  type MpTarget,
} from "@/app/recruitment/_lib/dashboard/manpower-daily-shared";

/**
 * ตั้งเป้า Manpower — RC Owner + Target Truck ต่อ สาขา × กลุ่มงาน × ลูกค้า (หน่วยเดียวกับชีต)
 * · แท็บสาขาบนสุด (Bew 16 พ.ย. 2569) — แก้ค้างไว้หลายแท็บแล้วบันทึกทีเดียวได้
 * · RC Owner = dropdown รายชื่อ “ผู้ติดต่อกลับ” ของหน้าผู้สมัคร (`rcOwners`) · ชื่อเดิมที่หลุดจากรายการยังเลือกค้างไว้ได้
 * · รายการ = ลูกค้าที่มีคน/คำขออยู่ตอนนี้ + แถวเป้าที่เคยตั้งไว้ · ส่งเฉพาะแถวที่แก้ (`PUT /api/recruitment/manpower-targets`)
 * · ล้างทั้งสองช่อง = ลบเป้าของแถวนั้น · Target Recruit โชว์ไว้เทียบ (ระบบคิดเอง แก้ไม่ได้)
 */

interface Line {
  key: string;
  site: RecruitSite;
  group: MpGroup;
  customer: string;
  recruit: number;
  rcOwner: string;
  truck: string;
}

export function ManpowerTargetsDialog({
  rows,
  targets,
  rcOwners,
  initialSite,
  onClose,
  onSaved,
}: {
  rows: MpRow[];
  targets: MpTarget[];
  rcOwners: string[];
  /** แท็บที่เปิดก่อน — ขอบเขตที่เลือกอยู่บนแดชบอร์ด */
  initialSite: RecruitSite;
  onClose: () => void;
  onSaved: (targets: MpTarget[]) => void;
}) {
  const base = useMemo<Line[]>(() => {
    const map = new Map<string, Line>();
    const tmap = new Map(targets.map((t) => [t.key, t]));
    const lineOf = (site: RecruitSite, group: MpGroup, customer: string) => {
      const key = siteTargetKey(site, group, customer);
      let line = map.get(key);
      if (!line) {
        const t = tmap.get(key);
        line = { key, site, group, customer, recruit: 0, rcOwner: t?.rcOwner ?? "", truck: t?.targetTruck == null ? "" : String(t.targetTruck) };
        map.set(key, line);
      }
      return line;
    };
    for (const r of rows) lineOf(r.site, r.group, r.customer).recruit += recruitOf(r);
    for (const t of targets) lineOf(t.site, t.group, t.customer);
    return [...map.values()].sort(
      (a, b) => MP_GROUPS.indexOf(a.group) - MP_GROUPS.indexOf(b.group) || b.recruit - a.recruit || a.customer.localeCompare(b.customer, "th"),
    );
  }, [rows, targets]);

  const [draft, setDraft] = useState<Record<string, { rcOwner: string; truck: string }>>({});
  const [site, setSite] = useState<RecruitSite>(initialSite);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const value = (l: Line) => draft[l.key] ?? { rcOwner: l.rcOwner, truck: l.truck };
  const changed = base.filter((l) => {
    const v = draft[l.key];
    return v && (v.rcOwner.trim() !== l.rcOwner || v.truck.trim() !== l.truck);
  });
  const invalid = changed.find((l) => {
    const t = value(l).truck.trim();
    return t !== "" && !/^\d{1,4}$/.test(t);
  });
  const counts = useMemo(
    () => Object.fromEntries(RECRUIT_SITES.map((s) => [s.key, base.filter((l) => l.site === s.key).length])) as Record<RecruitSite, number>,
    [base],
  );
  const shown = base.filter(
    (l) => l.site === site && (!q.trim() || `${l.group} ${l.customer} ${value(l).rcOwner}`.toLowerCase().includes(q.trim().toLowerCase())),
  );
  /* ตัวเลือกของแถว = รายชื่อผู้ติดต่อกลับ + ชื่อที่ตั้งไว้เดิม (กันชื่อที่ถูกถอดจากคลังคำถามหายไปจากช่อง) */
  const ownerOptions = (l: Line) => [...new Set([...rcOwners, l.rcOwner].filter(Boolean))];

  async function save() {
    if (!changed.length || invalid) return;
    setSaving(true);
    setError("");
    try {
      const res = await requestJson<{ targets: MpTarget[] }>(
        "/api/recruitment/manpower-targets",
        {
          method: "PUT",
          body: {
            targets: changed.map((l) => {
              const v = value(l);
              return { site: l.site, group: l.group, customer: l.customer, rcOwner: v.rcOwner.trim(), targetTruck: v.truck.trim() === "" ? null : Number(v.truck) };
            }),
          },
        },
        "บันทึกเป้าไม่สำเร็จ",
      );
      onSaved(res.targets);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกเป้าไม่สำเร็จ");
      setSaving(false);
    }
  }

  const input =
    "field-ring h-8 w-full rounded-field border border-line bg-base-100 px-2.5 text-12-5 outline-none hover:border-primary/40 focus:border-primary/60";

  return (
    <ModalShell
      title="ตั้งค่าเป้า Manpower"
      subtitle={<span className="text-12 text-mut">RC Owner · Target Truck ต่อ สาขา × กลุ่มงาน × ลูกค้า · ล้างทั้งสองช่อง = ลบเป้า</span>}
      onClose={onClose}
      width="820px"
      tone="plain"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-sec mr-auto px-4 py-2 text-13">
            ยกเลิก
          </button>
          {error ? <span className="text-12 text-alert">{error}</span> : null}
          {invalid ? <span className="text-12 text-alert">Target Truck ของ {invalid.customer} ต้องเป็นจำนวนเต็ม 0–9999</span> : null}
          {changed.some((l) => l.site !== site) ? (
            <span className="text-12 text-mut">มีแก้ค้างในอีกสาขา {changed.filter((l) => l.site !== site).length} แถว</span>
          ) : null}
          <button
            type="button"
            onClick={save}
            disabled={saving || !changed.length || Boolean(invalid)}
            className="btn-pri flex items-center gap-1.5 px-4 py-2 text-13 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 size={15} className="animate-spin" aria-hidden /> : null}
            บันทึก{changed.length ? ` ${changed.length} แถว` : ""}
          </button>
        </>
      }
    >
      <div className="-mx-1">
        <SiteNav value={site} sites={RECRUIT_SITES.map((s) => s.key)} counts={counts} noun="รายการ" onChange={setSite} />
      </div>

      <label className="relative block">
        <Search size={15} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-mut" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นกลุ่มงาน ลูกค้า หรือ RC Owner" className={`${input} h-9 pl-9`} />
      </label>

      <div className="max-h-[56vh] overflow-auto rounded-box border border-line">
        <table className="w-full border-collapse text-12-5">
          <thead>
            <tr className="text-mut">
              {["กลุ่มงาน", "ลูกค้า", "Target Recruit", "RC Owner", "Target Truck"].map((h, i) => (
                <th key={h} className={`sticky top-0 z-10 border-b border-line bg-base-200 px-3 py-2 font-medium whitespace-nowrap ${i === 2 ? "text-right" : "text-left"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((l) => {
              const v = value(l);
              const dirty = changed.includes(l);
              return (
                <tr key={l.key} className={`border-b border-line last:border-0 ${dirty ? "bg-primary/5" : ""}`}>
                  <td className="px-3 py-1.5 whitespace-nowrap text-mut">{l.group}</td>
                  <td className="px-3 py-1.5 font-medium">{l.customer}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{l.recruit ? fmtNum(l.recruit) : <span className="text-mut">–</span>}</td>
                  <td className="w-44 px-3 py-1.5">
                    <select
                      aria-label={`RC Owner ของ ${l.customer}`}
                      value={v.rcOwner}
                      onChange={(e) => setDraft((d) => ({ ...d, [l.key]: { ...v, rcOwner: e.target.value } }))}
                      className={`${input} cursor-pointer ${v.rcOwner ? "" : "text-mut"}`}
                    >
                      <option value="">— ไม่ระบุ —</option>
                      {ownerOptions(l).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="w-32 px-3 py-1.5">
                    <input
                      aria-label={`Target Truck ของ ${l.customer}`}
                      inputMode="numeric"
                      value={v.truck}
                      onChange={(e) => setDraft((d) => ({ ...d, [l.key]: { ...v, truck: e.target.value.replace(/[^\d]/g, "") } }))}
                      className={`${input} text-right tabular-nums`}
                      placeholder="คัน"
                    />
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-13 text-mut">
                  ไม่พบรายการ
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </ModalShell>
  );
}
