"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, History, Info, RefreshCw, Search, Users } from "lucide-react";

import { PageHead } from "@/components/desk/page-head";
import { requestJson } from "@/lib/http";
import { leafMenus, type MenuScopes, type OrgUnit, type Visibility } from "@/lib/menu-access";
import type { MenuPermissionLogEntry, OrgDivision } from "@/lib/menu-permissions";

import { AccessDrawer } from "./access-drawer";
import {
  BASE_UNIT,
  VisCell,
  departmentUnit,
  divisionUnit,
  effectiveOf,
  ownOf,
  parentLabel,
  type Unit,
} from "./scope";

/**
 * หน้า “กำหนดสิทธิ์” — หน้าตาตาม mena-wms `/admin/users` (ผู้ใช้และสิทธิ์) แต่แถวเป็นฝ่าย/แผนกแทนคน
 *
 * - ตารางภาพรวม **อ่านอย่างเดียว**: แถว = ค่าเริ่มต้น · ฝ่าย · แผนกใต้ฝ่าย · คอลัมน์ = เมนู (ป้ายย่อ ชื่อเต็มใน tooltip)
 *   ช่องแสดงสิทธิ์ที่ได้จริง (รวมที่สืบทอดจากชั้นบนแล้ว)
 * - คลิกแถว → แผงขวา (`AccessDrawer`) ตั้ง “ตามชั้นบน / เห็น / ไม่เห็น” รายเมนู แล้วบันทึกทีละหน่วย
 * - แท็บ “ประวัติการเปลี่ยนสิทธิ์” โหลดเมื่อเปิดครั้งแรก
 */

/** ป้ายย่อหัวคอลัมน์ (ชื่อเต็มอยู่ใน tooltip) — เมนูใหม่ที่ไม่มีในนี้ใช้ชื่อเต็ม */
const SHORT: Record<string, string> = {
  cases: "ร้องเรียน",
  onboarding: "พนง.ใหม่",
  candidates: "ผู้สมัคร",
  registry: "ทะเบียน",
  trucks: "สถานะรถ",
  dashboard: "แดชบอร์ด",
  employee: "ข้อมูลพนง.",
  "payroll-overview": "รอบจ่าย",
  "payroll-intake": "รับข้อมูล",
  "record-cases": "บันทึกเคส",
  survey: "แบบสอบถาม",
  rentals: "ห้องเช่า",
  permissions: "สิทธิ์",
  uat: "UAT",
  "api-docs": "API",
};

export function PermissionsView({
  org,
  scopes: initial,
  me,
}: {
  org: OrgDivision[];
  scopes: MenuScopes;
  me: OrgUnit;
}) {
  const router = useRouter();
  const menus = useMemo(() => leafMenus(), []);
  const [scopes, setScopes] = useState(initial);
  const [tab, setTab] = useState<"units" | "log">("units");
  const [q, setQ] = useState("");
  const [divFilter, setDivFilter] = useState("");
  const [selected, setSelected] = useState<Unit | null>(null);
  const [log, setLog] = useState<MenuPermissionLogEntry[] | null>(null);
  const [logError, setLogError] = useState("");

  const loadLog = useCallback(() => {
    requestJson<MenuPermissionLogEntry[]>("/api/menu-permissions/log?limit=200")
      .then((rows) => {
        setLog(rows);
        setLogError("");
      })
      .catch((e: unknown) => setLogError(e instanceof Error ? e.message : String(e)));
  }, []);

  const openLog = () => {
    setTab("log");
    if (log === null) loadLog();
  };

  /* ค้นหา — ชื่อฝ่ายตรง = ทั้งฝ่าย · ชื่อแผนกตรง = ฝ่ายนั้นพร้อมแผนกที่ตรงเท่านั้น */
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hit = (s: string) => s.toLowerCase().includes(needle);
    return org
      .filter((div) => !divFilter || String(div.id) === divFilter)
      .flatMap((div) => {
        if (!needle || hit(`${div.name} ${div.nameEn} ${div.code}`)) return [{ div, deps: div.departments }];
        const deps = div.departments.filter((d) => hit(`${d.name} ${d.nameEn}`));
        return deps.length ? [{ div, deps }] : [];
      });
  }, [org, q, divFilter]);

  const nameOf = useMemo(() => {
    const divs = new Map(org.map((d) => [d.id, d.name]));
    const deps = new Map(org.flatMap((d) => d.departments.map((x) => [x.id, x.name] as const)));
    return (e: Pick<MenuPermissionLogEntry, "kind" | "refId">) =>
      e.kind === "base"
        ? BASE_UNIT.name
        : ((e.kind === "division" ? divs : deps).get(e.refId ?? -1) ??
          `${e.kind === "division" ? "ฝ่าย" : "แผนก"} #${e.refId}`);
  }, [org]);

  return (
    <div className="flex animate-rise flex-col gap-4 pb-6">
      <PageHead
        title="กำหนดสิทธิ์"
        subtitle="สิทธิ์มองเห็นเมนูไล่จาก ค่าเริ่มต้น → ฝ่าย → แผนก · ตั้งทับได้ทุกชั้น · มีผลเมื่อผู้ใช้เปิดหน้าใหม่"
        actions={
          <button
            type="button"
            onClick={() => {
              router.refresh();
              if (log !== null) loadLog();
            }}
            className="btn-sec flex items-center gap-1.5 px-3 py-2 text-12-5"
          >
            <RefreshCw size={14} aria-hidden /> รีเฟรช
          </button>
        }
      />

      <div role="tablist" className="flex gap-1 border-b border-line">
        {(
          [
            ["units", "ฝ่าย / แผนก", Users, `${org.reduce((n, d) => n + d.departments.length, 0)}`],
            ["log", "ประวัติการเปลี่ยนสิทธิ์", History, ""],
          ] as const
        ).map(([key, label, Icon, badge]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => (key === "log" ? openLog() : setTab("units"))}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-13 font-semibold transition-colors ${
              tab === key ? "border-primary text-primary" : "border-transparent text-mut hover:text-ink"
            }`}
          >
            <Icon size={15} aria-hidden /> {label}
            {badge ? <span className="rounded-full bg-base-200 px-1.5 text-11 text-mut">{badge}</span> : null}
          </button>
        ))}
      </div>

      {tab === "units" ? (
        <>
          <Legend />

          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="field-ring flex h-9 flex-1 items-center gap-2 rounded-field border border-line bg-base-100 px-3">
              <Search size={15} aria-hidden className="flex-none text-mut" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหาฝ่าย / แผนก…"
                className="min-w-0 flex-1 bg-transparent text-13 outline-none placeholder:text-mut"
              />
            </label>
            <select
              value={divFilter}
              onChange={(e) => setDivFilter(e.target.value)}
              aria-label="กรองตามฝ่าย"
              className="field-ring h-9 rounded-field border border-line bg-base-100 px-3 text-13 sm:w-[280px]"
            >
              <option value="">ทุกฝ่าย</option>
              {org.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* เลื่อนในกล่อง (ไม่ใช่ทั้งหน้า) — แถบเลื่อนแนวนอนอยู่ในจอเสมอ · หัวตาราง + คอลัมน์ชื่อหน่วยติดขอบ */}
          <div className="relative max-h-[max(20rem,calc(100dvh-16rem))] overflow-auto rounded-box border border-line bg-base-100">
            <table className="w-full border-separate border-spacing-0 text-13">
              <thead>
                <tr>
                  <Th className="left-0 z-30 min-w-56 pl-4 after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-line">
                    ฝ่าย / แผนก
                  </Th>
                  <Th className="text-right">คน</Th>
                  {menus.map((m) => (
                    <Th
                      key={m.id}
                      className="px-0.5 text-center"
                      title={`${m.group.label} · ${m.parentLabel ? `${m.parentLabel} · ` : ""}${m.label}`}
                    >
                      {SHORT[m.id] ?? m.label}
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!q && !divFilter ? (
                  <UnitRow unit={BASE_UNIT} scopes={scopes} menus={menus} onPick={setSelected} tone="base" />
                ) : null}
                {rows.map(({ div, deps }) => (
                  <Fragment key={div.id}>
                    <UnitRow
                      unit={divisionUnit(div)}
                      scopes={scopes}
                      menus={menus}
                      onPick={div.id ? setSelected : undefined}
                      tone="division"
                      mine={me.divisionId === div.id}
                    />
                    {deps.map((dep) => (
                      <UnitRow
                        key={dep.id}
                        unit={departmentUnit(div, dep)}
                        scopes={scopes}
                        menus={menus}
                        onPick={setSelected}
                        tone="department"
                        mine={me.departmentId === dep.id}
                      />
                    ))}
                  </Fragment>
                ))}
                {!rows.length ? (
                  <tr>
                    <td colSpan={2 + menus.length} className="px-4 py-12 text-center text-13 text-mut">
                      ไม่พบฝ่าย/แผนกตามเงื่อนไข
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <LogList log={log} error={logError} nameOf={nameOf} menus={menus} />
      )}

      {selected ? (
        <AccessDrawer
          key={`${selected.kind}:${selected.id}`}
          unit={selected}
          menus={menus}
          scopes={scopes}
          me={me}
          onClose={() => setSelected(null)}
          onSaved={(next) => {
            setScopes(next);
            setSelected(null);
            if (log !== null) loadLog();
            // แถบเมนูของคนแก้เองเปลี่ยนตามทันที
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function Th({ className = "", title, children }: { className?: string; title?: string; children: React.ReactNode }) {
  return (
    <th
      scope="col"
      title={title}
      className={`sticky top-0 z-20 bg-base-200 px-2.5 py-2.5 text-left text-10-5 font-semibold tracking-[0.04em] whitespace-nowrap text-mut shadow-[inset_0_-1px_0_var(--color-line)] ${className}`}
    >
      {children}
    </th>
  );
}

function UnitRow({
  unit,
  scopes,
  menus,
  onPick,
  tone,
  mine = false,
}: {
  unit: Unit;
  scopes: MenuScopes;
  menus: ReturnType<typeof leafMenus>;
  onPick?: (unit: Unit) => void;
  tone: "base" | "division" | "department";
  mine?: boolean;
}) {
  const own = ownOf(scopes, unit);
  const parent = parentLabel(unit.kind);
  return (
    <tr
      onClick={onPick ? () => onPick(unit) : undefined}
      className={`group [&>td]:border-b [&>td]:border-line/70 ${onPick ? "cursor-pointer hover:bg-soft" : ""} ${
        tone === "department" ? "" : "bg-base-200/35"
      }`}
    >
      {/* คอลัมน์ติดซ้ายต้องทึบ — สีเดียวกับแถว (base-200/35 ทับ base-100) ไม่งั้นเห็นช่องที่เลื่อนลอดใต้ */}
      <td
        className={`sticky left-0 z-10 py-2 pr-2.5 after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-line ${
          tone === "department"
            ? "bg-base-100 pl-9"
            : "bg-[color-mix(in_oklab,var(--color-base-200)_35%,var(--color-base-100))] pl-4"
        } ${onPick ? "group-hover:bg-soft" : ""}`}
      >
        <div className="flex min-w-0 items-center gap-2">
          {tone === "base" ? <Globe size={15} aria-hidden className="flex-none text-primary" /> : null}
          <span
            className={`max-w-[280px] truncate ${tone === "department" ? "" : "font-semibold"}`}
            title={unit.name}
          >
            {unit.name}
          </span>
          {mine ? <span className="chip chip-on flex-none px-1.5 py-0 text-10-5">คุณ</span> : null}
          {tone !== "department" && unit.sub ? (
            <span className="flex-none text-11 text-mut">{unit.sub}</span>
          ) : null}
        </div>
      </td>
      <td className="px-2.5 py-2 text-right text-12 text-mut tabular-nums">{unit.headcount ?? "—"}</td>
      {menus.map((m) => {
        const visible = effectiveOf(scopes, unit, m.id);
        return (
          <td key={m.id} className="px-0.5 py-1.5 text-center">
            <VisCell
              visible={visible}
              title={`${m.label}: ${visible ? "เห็น" : "ไม่เห็น"}${m.id in own && unit.kind !== "base" ? ` · ตั้งเอง (ไม่ได้ตาม${parent})` : ""}`}
            />
          </td>
        );
      })}
    </tr>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-line py-2.5 text-12 text-mut">
      <span className="inline-flex items-center gap-1.5">
        <VisCell visible />
        <b className="font-semibold text-ink">เห็น</b> เมนูขึ้นบนหน้าหลักและแถบเมนู
      </span>
      <span className="inline-flex items-center gap-1.5">
        <VisCell visible={false} />
        <b className="font-semibold text-ink">ไม่เห็น</b> ซ่อนเมนู
      </span>
      <span className="inline-flex basis-full items-center gap-1.5">
        <Info size={13} aria-hidden className="flex-none" />
        คลิกแถวเพื่อตั้งสิทธิ์ · ตั้งที่ฝ่าย = ทุกแผนกในฝ่ายรวมแผนกที่ตั้งทีหลัง · ตอนนี้คุมแค่การมองเห็นเมนู
        (พิมพ์ URL ตรงยังเปิดได้)
      </span>
    </div>
  );
}

const fmtAt = (at: string) =>
  new Date(at).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

function LogList({
  log,
  error,
  nameOf,
  menus,
}: {
  log: MenuPermissionLogEntry[] | null;
  error: string;
  nameOf: (e: MenuPermissionLogEntry) => string;
  menus: ReturnType<typeof leafMenus>;
}) {
  if (error) return <p className="py-10 text-center text-13 text-alert">{error}</p>;
  if (log === null) return <p className="py-10 text-center text-13 text-mut">กำลังโหลด…</p>;
  if (!log.length) return <p className="py-10 text-center text-13 text-mut">ยังไม่มีการเปลี่ยนสิทธิ์</p>;

  const label = new Map(menus.map((m) => [m.id, m.label]));
  const word = (v: boolean | undefined, parent: string) => (v === undefined ? `ตาม${parent}` : v ? "เห็น" : "ไม่เห็น");

  return (
    <div className="flex flex-col">
      {log.map((e, i) => {
        const parent = parentLabel(e.kind);
        const ids = [...new Set([...Object.keys(e.before), ...Object.keys(e.after)])].filter(
          (id) => (e.before as Visibility)[id] !== (e.after as Visibility)[id],
        );
        return (
          <div key={i} className="flex gap-3 border-b border-line py-3 last:border-b-0">
            <span aria-hidden className="mt-1.5 size-2 flex-none rounded-full bg-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-13">
                <b className="font-semibold">{e.byName || e.byEmployeeId}</b>
                <span className="text-mut"> เปลี่ยนสิทธิ์ของ </span>
                <b className="font-semibold">{nameOf(e)}</b>
              </p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {ids.length ? (
                  ids.map((id) => (
                    <li key={id} className="text-12 text-mut">
                      • {label.get(id) ?? id}: {word(e.before[id], parent)} → {word(e.after[id], parent)}
                    </li>
                  ))
                ) : (
                  <li className="text-12 text-mut">ไม่มีการเปลี่ยนแปลง</li>
                )}
              </ul>
              <p className="mt-1 text-11 text-mut">{fmtAt(e.at)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
