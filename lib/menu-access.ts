import { MODULES, type ModuleGroup, type ModuleItem } from "./modules";

/**
 * กฎ “ใครมองเห็นเมนูไหน” — ส่วนที่ไม่ผูกกับฐานข้อมูล ใช้ได้ทั้ง client และ server
 * (ตัวอ่าน/เขียนจริงอยู่ที่ `lib/menu-permissions.ts`)
 *
 * สิทธิ์ไล่เป็นสามชั้น เหมือน “ตามแผนก / ตั้งทับ” ของ mena-wms `/admin/users`:
 *
 *   ค่าเริ่มต้น (ทุกคน) → ฝ่าย → แผนก
 *
 * ชั้นล่างที่ตั้งค่าไว้ชนะชั้นบนเสมอ · ชั้นที่ไม่ได้ตั้ง = “ตาม” ชั้นบน · ค่าเริ่มต้นที่ไม่ได้ตั้ง = เห็น
 * — เปิดระบบครั้งแรกจึงไม่มีใครเสียเมนู และเมนูใหม่ใน `lib/modules.ts` ทุกคนเห็นจนกว่าจะมีคนมาปิด
 *
 * - สิทธิ์ผูกกับ **เมนูปลายทาง** (`leafMenus()`) — เมนูที่มี `children` เห็นได้เมื่อลูกอย่างน้อยหนึ่งตัวเห็น
 * - เก็บเฉพาะ **ข้อยกเว้น** — ค่าที่เท่ากับชั้นบนถูกตัดทิ้งตอนบันทึก (`stripInherited`)
 * - ตอนนี้คุมแค่ “มองเห็นบน Home และแถบข้าง” — พิมพ์ URL ตรง ๆ ยังเข้าได้
 * - ยกเว้นสิทธิ์ย่อย (`ModuleItem.actions`) ที่หน้าปลายทางเช็กเองและกันจริง เช่น `registry-profile`
 */

/** menuId → เห็น/ไม่เห็น · ไม่มีคีย์ = ตามชั้นบน */
export type Visibility = Record<string, boolean>;

export interface MenuScopes {
  base: Visibility;
  /** คีย์ = `division_id` เป็นสตริง (คีย์ของ JSON) */
  divisions: Record<string, Visibility>;
  /** คีย์ = `department_id` เป็นสตริง */
  departments: Record<string, Visibility>;
}

export type ScopeKind = "base" | "division" | "department";

/** สังกัดของผู้ใช้ — `null` = ไม่มีสังกัดใน NCAC (ได้แค่ค่าเริ่มต้น) */
export interface OrgUnit {
  departmentId: number | null;
  divisionId: number | null;
}

export const EMPTY_SCOPES: MenuScopes = { base: {}, divisions: {}, departments: {} };

export interface LeafMenu {
  id: string;
  label: string;
  /** หัวข้อของ subgroup เมื่อเมนูนี้เป็นลูก */
  parentLabel?: string;
  item: ModuleItem;
  group: ModuleGroup;
  /** สิทธิ์ย่อยในหน้า (ปุ่ม/หน้าลึก) ไม่ใช่เมนู */
  action?: boolean;
}

/** เมนูทุกตัวที่กำหนดสิทธิ์ได้ เรียงตาม `lib/modules.ts` — รวมกลุ่มที่ `hidden` ไว้ด้วย
 *  · สิทธิ์ย่อย (`actions`) ต่อท้ายเมนูเจ้าของ โดยมี `action: true` และ `parentLabel` = ชื่อเมนูนั้น */
export function leafMenus(): LeafMenu[] {
  const withActions = (leaf: LeafMenu): LeafMenu[] => [
    leaf,
    ...(leaf.item.actions ?? []).map((a) => ({
      id: a.id,
      label: a.label,
      parentLabel: leaf.label,
      item: { ...leaf.item, id: a.id, label: a.label, desc: a.desc, actions: undefined },
      group: leaf.group,
      action: true,
    })),
  ];
  return MODULES.flatMap((group) =>
    group.items.flatMap((item): LeafMenu[] =>
      item.children
        ? item.children.flatMap((child) =>
            withActions({ id: child.id, label: child.label, parentLabel: item.label, item: child, group }),
          )
        : withActions({ id: item.id, label: item.label, item, group }),
    ),
  );
}

/** ค่าที่ชั้นนี้ “จะได้ถ้าไม่ตั้งเอง” — ค่าเริ่มต้นได้ `true` · ฝ่ายได้ค่าเริ่มต้น · แผนกได้ค่าของฝ่าย */
export function parentValue(
  scopes: MenuScopes,
  menuId: string,
  kind: ScopeKind,
  divisionId: number | null,
): boolean {
  if (kind === "base") return true;
  const base = scopes.base[menuId] ?? true;
  if (kind === "division" || divisionId === null) return base;
  return scopes.divisions[String(divisionId)]?.[menuId] ?? base;
}

export function canSeeMenu(scopes: MenuScopes, menuId: string, org: OrgUnit): boolean {
  if (org.departmentId !== null) {
    const own = scopes.departments[String(org.departmentId)]?.[menuId];
    if (own !== undefined) return own;
  }
  return parentValue(scopes, menuId, "department", org.divisionId);
}

/** id ของเมนูปลายทางที่ผู้ใช้นี้มองไม่เห็น */
export function hiddenMenuIds(scopes: MenuScopes, org: OrgUnit): string[] {
  return leafMenus()
    .filter((m) => !canSeeMenu(scopes, m.id, org))
    .map((m) => m.id);
}

/** ตัดค่าที่เท่ากับชั้นบนทิ้ง — เก็บแต่ข้อยกเว้นจริง (ทั้งฝั่งหน้าจอและฝั่งบันทึกใช้ตัวเดียวกัน) */
export function stripInherited(
  scopes: MenuScopes,
  kind: ScopeKind,
  divisionId: number | null,
  menus: Visibility,
): Visibility {
  return Object.fromEntries(
    Object.entries(menus).filter(([id, v]) => v !== parentValue(scopes, id, kind, divisionId)),
  );
}

/**
 * ตัดเมนูที่มองไม่เห็นออกจากกลุ่มงาน — subgroup ที่ลูกหายหมดหายตาม และกลุ่มที่ไม่เหลือเมนูก็หายด้วย
 * · subgroup ที่เหลือลูกตัวเดียวไม่ต้องพับ/กาง — กลายเป็นเมนูธรรมดาที่ลิงก์ตรงไปหน้าลูก
 */
export function filterModules(groups: ModuleGroup[], hidden: ReadonlySet<string>): ModuleGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.flatMap((item): ModuleItem[] => {
        if (!item.children) return hidden.has(item.id) ? [] : [item];
        const children = item.children.filter((c) => !hidden.has(c.id));
        if (!children.length) return [];
        if (children.length === 1) {
          const [only] = children;
          return [{ ...item, children: undefined, href: only.href, match: only.match, also: only.also, soon: only.soon }];
        }
        // หัวข้อ subgroup ชี้ไปลูกตัวแรกที่ยังเห็นอยู่ ไม่ใช่ลูกที่ถูกซ่อน
        return [{ ...item, children, href: children[0].href }];
      }),
    }))
    .filter((group) => group.items.length > 0);
}
