import { unstable_rethrow } from "next/navigation";
import { cache } from "react";

import { readSessionUser } from "./auth/session";
import { hrCol } from "./db";
import {
  canSeeMenu,
  hiddenMenuIds,
  leafMenus,
  stripInherited,
  type MenuScopes,
  type OrgUnit,
  type ScopeKind,
  type Visibility,
} from "./menu-access";
import { listDepartments, listDivisions, listUsers } from "./ncac/client";

/**
 * ชั้นข้อมูลของ “กำหนดสิทธิ์เมนู” (`/desk/permissions`) — **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 *
 * กฎอยู่ใน MongoDB `menu_permissions` หนึ่งแถวต่อชั้น — `_id` = `base` · `division:<id>` · `department:<id>`
 * แต่ละแถวเก็บ `menus: { <menuId>: true|false }` เฉพาะเมนูที่ตั้งทับชั้นบน · ทุกครั้งที่บันทึกเขียน
 * ประวัติลง `menu_permission_log` (ก่อน/หลังของชั้นนั้น) ให้แท็บ “ประวัติการเปลี่ยนสิทธิ์”
 * ส่วนฝ่าย/แผนกอ่านจาก NCAC (`/divisions/` + `/departments/`) ซึ่งเป็นเจ้าของโครงสร้างองค์กร —
 * เราเก็บแค่ **รหัส** ฝ่าย/แผนก ชื่อเปลี่ยนที่ NCAC แล้วหน้านี้ตามเอง
 *
 * ความหมายของกฎดู `lib/menu-access.ts`
 */

interface ScopeDoc {
  _id: string;
  kind: ScopeKind;
  refId: number | null;
  menus: Visibility;
  updatedAt: string;
  updatedBy: string;
}

export interface MenuPermissionLogEntry {
  at: string;
  byEmployeeId: string;
  byName: string;
  kind: ScopeKind;
  refId: number | null;
  before: Visibility;
  after: Visibility;
}

export class MenuPermissionError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/* --------------------------------------------------------------- โครงสร้างองค์กร */

export interface OrgDepartment {
  id: number;
  name: string;
  nameEn: string;
  /** จำนวนพนักงานที่ยัง Active ในแผนกนี้ — `null` = นับไม่ได้ (โหลด `/users` ไม่สำเร็จ) */
  headcount: number | null;
}

export interface OrgDivision {
  id: number;
  name: string;
  nameEn: string;
  code: string;
  departments: OrgDepartment[];
}

/** แผนก → ฝ่าย อ่านซ้ำทุกหน้าที่มีเมนู จึงพักไว้ 5 นาที (โครงสร้างองค์กรเปลี่ยนไม่บ่อย) */
const DEPT_TTL_MS = 5 * 60_000;
let deptCache: { at: number; map: Map<number, number | null> } | undefined;

async function divisionOfDepartment(): Promise<Map<number, number | null>> {
  if (deptCache && Date.now() - deptCache.at < DEPT_TTL_MS) return deptCache.map;
  try {
    const rows = await listDepartments();
    const map = new Map(rows.map((d) => [d.department_id, d.division_id ?? null]));
    deptCache = { at: Date.now(), map };
    return map;
  } catch (err) {
    // NCAC ล่มชั่วคราว — ใช้ของเก่าไปก่อนดีกว่าตัดสิทธิ์ตามฝ่ายทิ้งทั้งระบบ
    if (deptCache) return deptCache.map;
    throw err;
  }
}

/** ฝ่าย → แผนก สำหรับตารางกำหนดสิทธิ์ · ฝ่ายเรียงตามรหัส แผนกเรียงตามชื่อ */
export async function getOrgTree(): Promise<OrgDivision[]> {
  const [divisions, departments, users] = await Promise.all([
    listDivisions(),
    listDepartments(),
    listUsers().catch(() => null),
  ]);

  const heads = new Map<number, number>();
  for (const u of users ?? []) {
    if (u.department_id == null) continue;
    if ((u.employee_status ?? "").toLowerCase() !== "active") continue;
    heads.set(u.department_id, (heads.get(u.department_id) ?? 0) + 1);
  }

  const tree = new Map<number, OrgDivision>(
    divisions.map((d) => [
      d.division_id,
      {
        id: d.division_id,
        name: d.division_th || d.division_eng || `ฝ่าย ${d.division_id}`,
        nameEn: d.division_eng ?? "",
        code: d.division_code ?? "",
        departments: [],
      },
    ]),
  );
  /* แผนกที่ไม่มีฝ่าย หรือชี้ไปฝ่ายที่ไม่มีแถว (เช่นแผนก 9 → ฝ่าย 14) รวมไว้ใต้ “ไม่ระบุฝ่าย”
     ให้ยังกำหนดสิทธิ์รายแผนกได้ — หัวกลุ่มนี้ไม่ใช่ฝ่ายจริง จึงตั้งค่าที่ตัวมันเองไม่ได้ */
  const orphan: OrgDivision = { id: 0, name: "ไม่ระบุฝ่าย", nameEn: "", code: "", departments: [] };

  for (const d of departments) {
    const target = (d.division_id != null && tree.get(d.division_id)) || orphan;
    target.departments.push({
      id: d.department_id,
      name: d.department_name_th || d.department_name_en || `แผนก ${d.department_id}`,
      nameEn: d.department_name_en ?? "",
      headcount: users ? (heads.get(d.department_id) ?? 0) : null,
    });
  }

  const list = [...tree.values()].sort((a, b) => a.id - b.id);
  if (orphan.departments.length) list.push(orphan);
  for (const div of list) div.departments.sort((a, b) => a.name.localeCompare(b.name, "th"));
  return list;
}

/* --------------------------------------------------------------------- กฎ */

export async function getMenuScopes(): Promise<MenuScopes> {
  const col = await hrCol<ScopeDoc>("menuPermissions");
  const docs = await col.find({}).toArray();
  const scopes: MenuScopes = { base: {}, divisions: {}, departments: {} };
  for (const d of docs) {
    if (d.kind === "base") scopes.base = d.menus ?? {};
    else if (d.kind === "division" && d.refId != null) scopes.divisions[String(d.refId)] = d.menus ?? {};
    else if (d.kind === "department" && d.refId != null) scopes.departments[String(d.refId)] = d.menus ?? {};
  }
  return scopes;
}

async function orgOf(departmentId: number | null): Promise<OrgUnit> {
  if (departmentId === null) return { departmentId: null, divisionId: null };
  const map = await divisionOfDepartment();
  return { departmentId, divisionId: map.get(departmentId) ?? null };
}

/**
 * เมนูที่ผู้ใช้ที่ล็อกอินอยู่มองไม่เห็น — เรียกจาก `AppShell` และหน้า Home (cache ต่อคำขอ)
 *
 * **ล้มเหลวแล้วเปิดให้เห็นทุกเมนู** — ตัวนี้คุมแค่การมองเห็น ไม่ใช่ด่านความปลอดภัย
 * ฐานข้อมูลหรือ NCAC สะดุดแล้วแถบข้างหายทั้งแถบจะหนักกว่าเห็นเมนูเกินมาชั่วคราวมาก
 */
export const getHiddenMenuIds = cache(async (): Promise<string[]> => {
  try {
    const user = await readSessionUser();
    if (!user) return [];
    const scopes = await getMenuScopes();
    const anyHidden = [scopes.base, ...Object.values(scopes.divisions), ...Object.values(scopes.departments)].some(
      (v) => Object.values(v).includes(false),
    );
    if (!anyHidden) return [];
    return hiddenMenuIds(scopes, await orgOf(user.departmentId));
  } catch (err) {
    unstable_rethrow(err); // สัญญาณภายในของ Next (dynamic/redirect) ต้องโยนต่อ ห้ามกลืน
    console.warn("[menu-permissions] อ่านสิทธิ์เมนูไม่สำเร็จ — แสดงทุกเมนูไปก่อน", err);
    return [];
  }
});

/**
 * ผู้ใช้ที่ล็อกอินอยู่มีสิทธิ์เมนู/สิทธิ์ย่อยนี้ไหม — ใช้กันหน้าลึก เช่นหน้าประวัติรายคน (`registry-profile`)
 * ล้มเหลวแล้วเปิดให้ (ตาม `getHiddenMenuIds`)
 */
export async function canAccessMenu(menuId: string): Promise<boolean> {
  return !(await getHiddenMenuIds()).includes(menuId);
}

/* --------------------------------------------------------------------- บันทึก */

const PERMISSIONS_MENU = "permissions";

function parseMenus(input: unknown): Visibility {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new MenuPermissionError("รูปแบบสิทธิ์ไม่ถูกต้อง");
  }
  const known = new Set(leafMenus().map((m) => m.id));
  const out: Visibility = {};
  for (const [id, v] of Object.entries(input as Record<string, unknown>)) {
    if (!known.has(id)) throw new MenuPermissionError(`ไม่รู้จักเมนู “${id}”`);
    if (typeof v !== "boolean") throw new MenuPermissionError(`ค่าของเมนู “${id}” ต้องเป็นเห็น/ไม่เห็น`);
    out[id] = v;
  }
  return out;
}

/**
 * บันทึกสิทธิ์ของชั้นเดียว (ค่าเริ่มต้น / ฝ่ายหนึ่ง / แผนกหนึ่ง) — ส่งมาทั้งชุดของชั้นนั้น ทับของเดิม
 * ค่าที่เท่ากับชั้นบนถูกตัดทิ้ง (เก็บเฉพาะข้อยกเว้น) · คืนสิทธิ์ทุกชั้นหลังบันทึก
 *
 * กันล็อกตัวเองสองชั้น: ต้องเป็นคนที่ **ตอนนี้** มองเห็นเมนู “กำหนดสิทธิ์” อยู่ และผลหลังบันทึก
 * ต้องยังเห็นเมนูนี้ — ไม่งั้นจะไม่เหลือใครกลับมาแก้ได้จากหน้าจอ
 */
export async function saveMenuScope(input: {
  kind: unknown;
  id?: unknown;
  menus: unknown;
}): Promise<MenuScopes> {
  const user = await readSessionUser();
  if (!user) throw new MenuPermissionError("กรุณาเข้าสู่ระบบก่อน", 401);

  const kind = input.kind;
  if (kind !== "base" && kind !== "division" && kind !== "department") {
    throw new MenuPermissionError("ไม่รู้จักชั้นของสิทธิ์");
  }
  const refId = kind === "base" ? null : Number(input.id);
  if (refId !== null && (!Number.isInteger(refId) || refId <= 0)) {
    throw new MenuPermissionError("รหัสฝ่าย/แผนกไม่ถูกต้อง");
  }

  const [current, org, deptMap] = await Promise.all([
    getMenuScopes(),
    orgOf(user.departmentId),
    divisionOfDepartment(),
  ]);
  if (kind === "department" && !deptMap.has(refId!)) throw new MenuPermissionError("ไม่พบแผนกนี้ใน NCAC");

  if (!canSeeMenu(current, PERMISSIONS_MENU, org)) {
    throw new MenuPermissionError("คุณไม่มีสิทธิ์แก้การตั้งค่านี้", 403);
  }

  const parentDivision = kind === "department" ? (deptMap.get(refId!) ?? null) : null;
  const menus = stripInherited(current, kind, parentDivision, parseMenus(input.menus));
  const next: MenuScopes = structuredClone(current);
  if (kind === "base") next.base = menus;
  else if (kind === "division") next.divisions[String(refId)] = menus;
  else next.departments[String(refId)] = menus;

  if (!canSeeMenu(next, PERMISSIONS_MENU, org)) {
    throw new MenuPermissionError(
      "บันทึกไม่ได้ — แผนกของคุณจะมองไม่เห็นเมนู “กำหนดสิทธิ์” แล้วจะกลับมาแก้ไม่ได้",
    );
  }

  const before =
    kind === "base"
      ? current.base
      : (kind === "division" ? current.divisions : current.departments)[String(refId)] ?? {};
  const now = new Date().toISOString();
  const key = kind === "base" ? "base" : `${kind}:${refId}`;

  const col = await hrCol<ScopeDoc>("menuPermissions");
  await col.replaceOne(
    { _id: key },
    { kind, refId, menus, updatedAt: now, updatedBy: user.employeeId },
    { upsert: true },
  );

  const log = await hrCol<MenuPermissionLogEntry>("menuPermissionLog");
  await log
    .insertOne({ at: now, byEmployeeId: user.employeeId, byName: user.name, kind, refId, before, after: menus })
    .catch((err) => console.warn("[menu-permissions] เขียนประวัติไม่สำเร็จ —", err));

  return next;
}

export async function listMenuPermissionLog(limit = 200): Promise<MenuPermissionLogEntry[]> {
  const col = await hrCol<MenuPermissionLogEntry>("menuPermissionLog");
  const rows = await col
    .find({}, { projection: { _id: 0 } })
    .sort({ at: -1 })
    .limit(Math.min(Math.max(limit, 1), 500))
    .toArray();
  return rows as MenuPermissionLogEntry[];
}

