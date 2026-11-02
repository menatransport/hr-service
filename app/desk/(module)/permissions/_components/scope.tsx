import { Eye, Minus } from "lucide-react";

import { canSeeMenu, type MenuScopes, type ScopeKind, type Visibility } from "@/lib/menu-access";
import type { OrgDepartment, OrgDivision } from "@/lib/menu-permissions";

/**
 * “หน่วย” หนึ่งแถวในตารางกำหนดสิทธิ์ — ค่าเริ่มต้น / ฝ่าย / แผนก — กับช่องแสดงสิทธิ์ `VisCell`
 * ใช้ร่วมกันระหว่างตาราง (`permissions-view.tsx`) กับ drawer (`access-drawer.tsx`)
 */
export interface Unit {
  kind: ScopeKind;
  /** `null` = ค่าเริ่มต้น · ฝ่ายกลุ่ม “ไม่ระบุฝ่าย” มี id 0 (ตั้งค่าที่ตัวมันเองไม่ได้) */
  id: number | null;
  name: string;
  /** บรรทัดรอง: ฝ่ายของแผนก / รหัสฝ่าย */
  sub: string;
  headcount: number | null;
  /** ฝ่ายที่แผนกนี้สังกัด — ใช้หาค่า “ตามฝ่าย” */
  divisionId: number | null;
}

export const BASE_UNIT: Unit = {
  kind: "base",
  id: null,
  name: "ค่าเริ่มต้น (ทุกคน)",
  sub: "ใช้กับทุกฝ่าย/แผนกที่ไม่ได้ตั้งทับ",
  headcount: null,
  divisionId: null,
};

export const divisionUnit = (div: OrgDivision): Unit => ({
  kind: "division",
  id: div.id,
  name: div.name,
  sub: [div.code, `${div.departments.length} แผนก`].filter(Boolean).join(" · "),
  headcount: div.departments.every((d) => d.headcount === null)
    ? null
    : div.departments.reduce((n, d) => n + (d.headcount ?? 0), 0),
  divisionId: div.id || null,
});

export const departmentUnit = (div: OrgDivision, dep: OrgDepartment): Unit => ({
  kind: "department",
  id: dep.id,
  name: dep.name,
  sub: div.name,
  headcount: dep.headcount,
  divisionId: div.id || null,
});

/** ค่าที่หน่วยนี้ตั้งทับไว้เอง (ไม่รวมที่ได้จากชั้นบน) */
export function ownOf(scopes: MenuScopes, unit: Unit): Visibility {
  if (unit.kind === "base") return scopes.base;
  const table = unit.kind === "division" ? scopes.divisions : scopes.departments;
  return table[String(unit.id)] ?? {};
}

/** หน่วยนี้เห็นเมนูนี้จริงไหม (รวมการสืบทอดแล้ว) */
export function effectiveOf(scopes: MenuScopes, unit: Unit, menuId: string): boolean {
  if (unit.kind === "base") return scopes.base[menuId] ?? true;
  if (unit.kind === "division") return scopes.divisions[String(unit.id)]?.[menuId] ?? scopes.base[menuId] ?? true;
  return canSeeMenu(scopes, menuId, { departmentId: unit.id, divisionId: unit.divisionId });
}

/** ชื่อชั้นบนของหน่วยนี้ — ใช้ในคำว่า “ตาม…” */
export const parentLabel = (kind: ScopeKind) =>
  kind === "department" ? "ฝ่าย" : kind === "division" ? "ค่าเริ่มต้น" : "ระบบ";

export const sameUnit = (a: Unit | null, b: Unit) => a !== null && a.kind === b.kind && a.id === b.id;

/** ช่องสิทธิ์หนึ่งเมนู — ตาเขียว = เห็น · ขีดจาง = ไม่เห็น (ท่าเดียวกับ `LevelCell` ของ mena-wms) */
export function VisCell({ visible, title }: { visible: boolean; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex size-6 flex-none items-center justify-center rounded-[6px] ${
        visible ? "bg-primary/12 text-primary" : "text-mut/60"
      }`}
    >
      {visible ? <Eye size={13} strokeWidth={2} aria-hidden /> : <Minus size={13} strokeWidth={2} aria-hidden />}
    </span>
  );
}
