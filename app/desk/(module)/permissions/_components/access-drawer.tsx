"use client";

import { useEffect, useMemo, useState } from "react";
import { Info, Save, TriangleAlert, X } from "lucide-react";

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
import { runAction } from "@/lib/swal";

import { VisCell, ownOf, parentLabel, type Unit } from "./scope";

/**
 * แผงขวาตั้งสิทธิ์ของหน่วยเดียว (ค่าเริ่มต้น / ฝ่าย / แผนก) — ท่าเดียวกับ `AccessDrawer` ของ mena-wms
 *
 * แต่ละเมนูเลือกได้ “ตาม<ชั้นบน>” · เห็น · ไม่เห็น — เลือกค่าเดียวกับชั้นบนจะถูกนับเป็น “ตาม…”
 * (เก็บเฉพาะข้อยกเว้น เหมือนฝั่งเซิร์ฟเวอร์) · หัวกลุ่มงานมีปุ่มตั้งทั้งกลุ่มในทีเดียว
 */

type Choice = "" | "show" | "hide";

export function AccessDrawer({
  unit,
  menus,
  scopes,
  me,
  onClose,
  onSaved,
}: {
  unit: Unit;
  menus: LeafMenu[];
  scopes: MenuScopes;
  me: OrgUnit;
  onClose: () => void;
  onSaved: (scopes: MenuScopes) => void;
}) {
  const own = ownOf(scopes, unit);
  const [draft, setDraft] = useState<Visibility>(own);
  const [saving, setSaving] = useState(false);
  const parent = parentLabel(unit.kind);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const inherited = (menuId: string) => parentValue(scopes, menuId, unit.kind, unit.divisionId);
  const clean = stripInherited(scopes, unit.kind, unit.divisionId, draft);
  const dirty = JSON.stringify(sortKeys(clean)) !== JSON.stringify(sortKeys(own));

  // สิทธิ์ทั้งระบบหลังบันทึก — ไว้เตือนก่อนว่ากำลังจะล็อกตัวเองออกจากหน้านี้
  const lockout = useMemo(() => {
    const next: MenuScopes = structuredClone(scopes);
    if (unit.kind === "base") next.base = clean;
    else (unit.kind === "division" ? next.divisions : next.departments)[String(unit.id)] = clean;
    return !canSeeMenu(next, "permissions", me);
  }, [scopes, unit, clean, me]);

  const setChoice = (menuId: string, choice: Choice) =>
    setDraft((d) => {
      const next = { ...d };
      const value = choice === "show" ? true : choice === "hide" ? false : undefined;
      if (value === undefined || value === inherited(menuId)) delete next[menuId];
      else next[menuId] = value;
      return next;
    });

  async function save() {
    setSaving(true);
    const out = await runAction({
      success: "บันทึกสิทธิ์แล้ว",
      successDetail: "มีผลเมื่อผู้ใช้เปิดหน้าใหม่",
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
      <div onClick={onClose} aria-hidden className="fixed inset-0 z-[60] bg-ink/30" />
      <aside
        role="dialog"
        aria-label={`ตั้งสิทธิ์ ${unit.name}`}
        className="elev-pop fixed top-0 right-0 bottom-0 z-[61] flex w-[min(520px,100vw)] flex-col bg-base-100 text-ink"
      >
        <header className="flex items-start gap-3 border-b border-line px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="text-11 font-semibold tracking-[0.04em] text-mut">
              {unit.kind === "base" ? "ค่าเริ่มต้น" : unit.kind === "division" ? "ฝ่าย" : "แผนก"}
            </p>
            <h2 className="text-15 font-semibold text-pretty">{unit.name}</h2>
            <p className="text-12 text-mut">
              {unit.sub}
              {unit.headcount !== null ? ` · ${unit.headcount} คน` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="rounded-field p-1 text-mut hover:text-ink">
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-auto px-4 py-3">
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 text-13">
            <div className="pb-1 text-10-5 font-semibold tracking-[0.05em] text-mut">เมนู</div>
            <div className="pb-1 text-10-5 font-semibold tracking-[0.05em] text-mut">
              {unit.kind === "base" ? "ระบบ" : `ตาม${parent}`}
            </div>
            <div className="pb-1 text-10-5 font-semibold tracking-[0.05em] text-mut">ตั้งเป็น</div>

            {groups.map((g) => (
              <div key={g.id} className="contents">
                <div className="col-span-3 mt-2 flex items-center gap-2 border-t border-line-strong/60 pt-2.5 pb-1">
                  <span className="min-w-0 flex-1 truncate text-12 font-semibold">{g.label}</span>
                  <GroupButton onClick={() => g.items.forEach((m) => setChoice(m.id, "show"))}>เห็นทั้งกลุ่ม</GroupButton>
                  <GroupButton onClick={() => g.items.forEach((m) => setChoice(m.id, "hide"))}>ซ่อนทั้งกลุ่ม</GroupButton>
                  {unit.kind !== "base" ? (
                    <GroupButton onClick={() => g.items.forEach((m) => setChoice(m.id, ""))}>ตาม{parent}</GroupButton>
                  ) : null}
                </div>
                {g.items.map((m) => {
                  const value = draft[m.id];
                  const choice: Choice = value === undefined ? "" : value ? "show" : "hide";
                  const effective = value ?? inherited(m.id);
                  const overridden = value !== undefined;
                  return (
                    <div key={m.id} className="contents">
                      <div className="flex min-w-0 items-center gap-2 border-t border-line py-1.5">
                        <VisCell visible={effective} />
                        <span className="min-w-0 truncate" title={m.item.desc}>
                          {m.parentLabel ? <span className="text-mut">{m.parentLabel} · </span> : null}
                          {m.label}
                        </span>
                      </div>
                      <div
                        className={`border-t border-line py-1.5 text-12 whitespace-nowrap ${inherited(m.id) ? "text-primary" : "text-mut"}`}
                      >
                        {inherited(m.id) ? "เห็น" : "ไม่เห็น"}
                      </div>
                      <div className="border-t border-line py-1.5">
                        <select
                          value={choice}
                          disabled={saving}
                          onChange={(e) => setChoice(m.id, e.target.value as Choice)}
                          aria-label={`สิทธิ์เมนู ${m.label}`}
                          className={`rounded-field border px-2 py-1 text-12 outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 ${
                            overridden
                              ? "border-warning bg-warning/10 font-semibold text-ink"
                              : "border-line bg-base-100 text-ink"
                          }`}
                        >
                          <option value="">{unit.kind === "base" ? "ค่าระบบ (เห็น)" : `ตาม${parent}`}</option>
                          <option value="show">เห็น</option>
                          <option value="hide">ไม่เห็น</option>
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <p className="mt-4 flex items-start gap-1.5 text-11-5 leading-relaxed text-mut">
            <Info size={12} className="mt-0.5 flex-none" aria-hidden />
            {unit.kind === "department"
              ? "เลือกค่าเดียวกับฝ่าย = ตามฝ่าย (ระบบเก็บเฉพาะข้อยกเว้น) · ถ้าฝ่ายเปลี่ยนสิทธิ์ เมนูที่ “ตามฝ่าย” จะเปลี่ยนตาม แต่ค่าที่ตั้งทับยังอยู่"
              : unit.kind === "division"
                ? "ตั้งที่ฝ่าย = มีผลกับทุกแผนกในฝ่าย รวมแผนกที่ตั้งขึ้นทีหลัง · แผนกที่ตั้งทับเมนูนั้นไว้เองไม่เปลี่ยนตาม"
                : "ค่าเริ่มต้นใช้กับทุกคน รวมผู้ที่ไม่มีแผนกใน NCAC · ฝ่าย/แผนกที่ตั้งทับไว้ไม่เปลี่ยนตาม"}
          </p>
        </div>

        <footer className="flex flex-col gap-2 border-t border-line px-4 py-3">
          {lockout ? (
            <p className="flex items-start gap-1.5 text-12 text-alert">
              <TriangleAlert size={13} className="mt-0.5 flex-none" aria-hidden />
              แผนกของคุณจะมองไม่เห็นเมนู “กำหนดสิทธิ์” แล้วจะกลับมาแก้ไม่ได้ — บันทึกแบบนี้ไม่ได้
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDraft({})}
              disabled={saving || !Object.keys(draft).length}
              className="rounded-field px-2 py-2 text-12 font-medium text-mut hover:text-alert disabled:opacity-40"
            >
              {unit.kind === "base" ? "คืนค่าระบบทั้งหมด" : `คืนค่าตาม${parent}ทั้งหมด`}
            </button>
            <div className="flex-1" />
            <button type="button" onClick={onClose} disabled={saving} className="btn-ghost px-3.5 py-2 text-12-5">
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

function GroupButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-none rounded-full border border-line px-2 py-0.5 text-10-5 text-mut transition-colors hover:border-primary/40 hover:text-primary"
    >
      {children}
    </button>
  );
}

const sortKeys = (v: Visibility) => Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)));
