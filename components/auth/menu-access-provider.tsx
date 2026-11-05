"use client";

import { createContext, useContext, useMemo } from "react";

import { filterModules } from "@/lib/menu-access";
import { VISIBLE_MODULES, type ModuleGroup } from "@/lib/modules";

/**
 * เมนูที่ผู้ใช้คนนี้มองไม่เห็น (ตามหน้า “กำหนดสิทธิ์”) ส่งจาก server ลงมาให้ Home และแถบข้าง
 *
 * ตัวคำนวณอยู่ที่ `getHiddenMenuIds()` ใน `lib/menu-permissions.ts` — เรียกใน `AppShell`
 * และหน้า Home · นอก provider = เห็นทุกเมนู (ค่าเริ่มต้นของระบบ)
 */
const HiddenMenusContext = createContext<ReadonlySet<string>>(new Set());

export function MenuAccessProvider({
  hidden,
  children,
}: {
  hidden: string[];
  children: React.ReactNode;
}) {
  // เทียบด้วยค่า — อาร์เรย์จาก server เป็นตัวใหม่ทุกครั้งที่ layout render
  const key = hidden.join(",");
  const set = useMemo(() => new Set(key ? key.split(",") : []), [key]);
  return <HiddenMenusContext.Provider value={set}>{children}</HiddenMenusContext.Provider>;
}

/** กลุ่มงานบน Home / “กลุ่มงานอื่น” ที่ผู้ใช้คนนี้เห็น — `VISIBLE_MODULES` หักเมนูที่ถูกซ่อน */
export function useVisibleModules(): ModuleGroup[] {
  const hidden = useContext(HiddenMenusContext);
  return useMemo(() => filterModules(VISIBLE_MODULES, hidden), [hidden]);
}

/** กรองกลุ่มที่หาได้จาก `findModule()` (ซึ่งอ่าน `MODULES` ทั้งชุด) ให้เหลือเฉพาะเมนูที่เห็น */
export function useFilterGroup(): (group: ModuleGroup) => ModuleGroup {
  const hidden = useContext(HiddenMenusContext);
  return (group) => filterModules([group], hidden)[0] ?? { ...group, items: [] };
}

/** ผู้ใช้คนนี้มีสิทธิ์เมนู/สิทธิ์ย่อยนี้ไหม (เช่น `registry-profile` = ปุ่มตาเข้าหน้าประวัติ) */
export function useCanSee(menuId: string): boolean {
  return !useContext(HiddenMenusContext).has(menuId);
}
