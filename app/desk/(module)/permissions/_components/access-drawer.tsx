"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Save, TriangleAlert, X } from "lucide-react";

import { requestJson } from "@/lib/http";
import {
  canSeeMenu,
  parentValue,
  stripInherited,
  type LeafMenu,
  type MenuScopes,
  type OrgUnit,
  type Visibility,
} from "@/lib/menu-access";
import { confirm, runAction } from "@/lib/swal";

import { VisCell, ownOf, type Unit } from "./scope";

/**
 * แผงขวาตั้งสิทธิ์ของหน่วยเดียว (ค่าเริ่มต้น / ฝ่าย / แผนก) — ท่าเดียวกับ `AccessDrawer` ของ mena-wms
 *
 * แต่ละเมนูกดเลือก เห็น / ไม่เห็น — เลือกค่าเดียวกับชั้นบนถูกนับเป็น “ตามชั้นบน” เอง (เก็บเฉพาะข้อยกเว้น
 * เหมือนฝั่งเซิร์ฟเวอร์) · หัวกลุ่มงานมีปุ่มตั้งทั้งกลุ่มในทีเดียว · `focus` = เมนูที่กดมาจากช่องในตาราง (ไฮไลต์ + เลื่อนไปหา)
 */

export function AccessDrawer({
  unit,
  focus,
  menus,
  scopes,
  me,
  onClose,
  onSaved,
}: {
  unit: Unit;
  focus?: string;
  menus: LeafMenu[];
  scopes: MenuScopes;
  me: OrgUnit;
  onClose: () => void;
  onSaved: (scopes: MenuScopes) => void;
}) {
  const own = ownOf(scopes, unit);
  const [draft, setDraft] = useState<Visibility>(own);
  const [saving, setSaving] = useState(false);
  const isBase = unit.kind === "base";
  const focusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: "center" });
  }, []);

  const inherited = (menuId: string) => parentValue(scopes, menuId, unit.kind, unit.divisionId);
  const clean = stripInherited(scopes, unit.kind, unit.divisionId, draft);
  const changed = menus.filter((m) => clean[m.id] !== own[m.id]).length;
  const dirty = changed > 0;

  // สิทธิ์ทั้งระบบหลังบันทึก — ไว้เตือนก่อนว่ากำลังจะล็อกตัวเองออกจากหน้านี้
  const lockout = useMemo(() => {
    const next: MenuScopes = structuredClone(scopes);
    if (unit.kind === "base") next.base = clean;
    else (unit.kind === "division" ? next.divisions : next.departments)[String(unit.id)] = clean;
    return !canSeeMenu(next, "permissions", me);
  }, [scopes, unit, clean, me]);

  const close = useCallback(async () => {
    if (saving) return;
    if (dirty && !(await confirm({ title: "ทิ้งการแก้ไข?", confirmText: "ทิ้ง", cancelText: "แก้ต่อ", tone: "warn" })))
      return;
    onClose();
  }, [dirty, saving, onClose]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && void close();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [close]);

  const setChoice = (menuId: string, value: boolean) =>
    setDraft((d) => {
      const next = { ...d };
      if (value === inherited(menuId)) delete next[menuId];
      else next[menuId] = value;
      return next;
    });

  async function save() {
    setSaving(true);
    const out = await runAction({
      success: "บันทึกสิทธิ์แล้ว",
      failureTitle: "บันทึกสิทธิ์ไม่สำเร็จ",
      run: () =>
        requestJson<MenuScopes>("/api/menu-permissions", {
          method: "PUT",
          body: { kind: unit.kind, id: unit.id, menus: clean },
        }),
    });
    setSaving(false);
    if (out.status === "done") onSaved(out.data);
  }

  const groups = menus.reduce<{ id: string; label: string; items: LeafMenu[] }[]>((acc, m) => {
    const last = acc.at(-1);
    if (last?.id === m.group.id) last.items.push(m);
    else acc.push({ id: m.group.id, label: m.group.label, items: [m] });
    return acc;
  }, []);

  return (
    <>
      <div onClick={() => void close()} aria-hidden className="fixed inset-0 z-[60] bg-ink/30" />
      <aside
        role="dialog"
        aria-label={`ตั้งสิทธิ์ ${unit.name}`}
        className="elev-pop fixed top-0 right-0 bottom-0 z-[61] flex w-[min(560px,100vw)] flex-col bg-base-100 text-ink"
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-11 font-semibold tracking-[0.04em] text-primary">
              {isBase ? "ค่าเริ่มต้น" : unit.kind === "division" ? "ฝ่าย" : "แผนก"}
            </p>
            <h2 className="text-16 font-semibold text-pretty">{unit.name}</h2>
            <p className="text-12 text-mut">
              {isBase ? "ทุกคน" : unit.sub}
              {unit.headcount !== null ? ` · ${unit.headcount} คน` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void close()}
            aria-label="ปิด"
            className="rounded-field p-1 text-mut hover:text-ink"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-auto px-5 pb-4">
          {groups.map((g) => (
            <section key={g.id}>
              <div className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-line bg-base-100 pt-4 pb-2">
                <h3 className="min-w-0 flex-1 truncate text-13 font-semibold">{g.label}</h3>
                <GroupButton tone onClick={() => g.items.forEach((m) => setChoice(m.id, true))}>
                  เห็นทั้งหมด
                </GroupButton>
                <GroupButton tone={false} onClick={() => g.items.forEach((m) => setChoice(m.id, false))}>
                  ซ่อนทั้งหมด
                </GroupButton>
              </div>
              {g.items.map((m) => {
                const value = draft[m.id];
                const effective = value ?? inherited(m.id);
                const touched = clean[m.id] !== own[m.id];
                const focused = m.id === focus;
                return (
                  <div
                    key={m.id}
                    ref={focused ? focusRef : undefined}
                    className={`flex items-center gap-3 border-b border-line/70 py-2 ${m.action ? "pl-6" : ""} ${
                      focused ? "-mx-5 bg-soft px-5 shadow-[inset_3px_0_0_var(--color-primary)]" : ""
                    } ${focused && m.action ? "pl-11" : ""}`}
                  >
                    <VisCell visible={effective} own={value !== undefined} />
                    <span className="min-w-0 flex-1 text-13" title={m.item.desc}>
                      <span className={`block truncate ${focused ? "font-semibold" : ""}`}>
                        {m.parentLabel && !m.action ? <span className="text-mut">{m.parentLabel} · </span> : null}
                        {m.label}
                      </span>
                      {m.action ? <span className="block text-11 text-mut">สิทธิ์ในหน้า {m.parentLabel}</span> : null}
                    </span>
                    {touched ? <span aria-label="แก้แล้ว" className="size-1.5 flex-none rounded-full bg-primary" /> : null}
                    <Segmented
                      value={effective}
                      disabled={saving}
                      label={m.label}
                      onChange={(v) => setChoice(m.id, v)}
                    />
                  </div>
                );
              })}
            </section>
          ))}
        </div>

        <footer className="flex flex-col gap-2 border-t border-line px-5 py-3">
          {lockout ? (
            <p className="flex items-start gap-1.5 text-12 text-alert">
              <TriangleAlert size={13} className="mt-0.5 flex-none" aria-hidden />
              แผนกของคุณจะมองไม่เห็นเมนู “กำหนดสิทธิ์” — บันทึกแบบนี้ไม่ได้
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <div className="flex-1" />
            {dirty ? <span className="text-12 text-mut tabular-nums">แก้ {changed} เมนู</span> : null}
            <button type="button" onClick={() => void close()} disabled={saving} className="btn-ghost px-3.5 py-2 text-12-5">
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || !dirty || lockout}
              className="btn-pri flex items-center gap-1.5 px-4 py-2 text-12-5 font-medium disabled:opacity-45"
            >
              <Save size={14} aria-hidden />
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </div>
        </footer>
      </aside>
    </>
  );
}

/** ปุ่มเลือก เห็น (เขียว) · ไม่เห็น (แดง) */
function Segmented({
  value,
  label,
  disabled,
  onChange,
}: {
  value: boolean;
  label: string;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={`สิทธิ์เมนู ${label}`}
      className="flex flex-none overflow-hidden rounded-field border border-line text-12"
    >
      {([true, false] as const).map((v) => {
        const on = value === v;
        const tone = on
          ? v
            ? "bg-primary font-semibold text-primary-content"
            : "bg-alert font-semibold text-white"
          : "bg-base-100 text-mut hover:bg-base-200/60 hover:text-ink";
        return (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(v)}
            className={`inline-flex items-center gap-1 border-l border-line px-3 py-1 whitespace-nowrap transition-colors first:border-l-0 disabled:opacity-60 ${tone}`}
          >
            {v ? <Eye size={12} aria-hidden /> : <EyeOff size={12} aria-hidden />}
            {v ? "เห็น" : "ไม่เห็น"}
          </button>
        );
      })}
    </div>
  );
}

function GroupButton({
  tone,
  onClick,
  children,
}: {
  tone: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const color = tone
    ? "hover:border-primary/50 hover:bg-primary/8 hover:text-primary"
    : "hover:border-alert/50 hover:bg-alert-soft hover:text-alert";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-none rounded-full border border-line px-2.5 py-0.5 text-11 text-mut transition-colors ${color}`}
    >
      {children}
    </button>
  );
}
