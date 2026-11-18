"use client";

import { createContext, useContext, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { EmptyState } from "@/components/ui/empty-state";
import { filterModules } from "@/lib/menu-access";
import { VISIBLE_MODULES, findModule, type ModuleGroup } from "@/lib/modules";

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

/**
 * กั้นหน้าของเมนูที่ผู้ใช้ไม่มีสิทธิ์ — พิมพ์ URL ตรง ๆ / บุ๊กมาร์กไว้ก็ไม่เห็นเนื้อหา (Bew 18 พ.ย. 2569)
 * หาเมนูของหน้าด้วย `findModule` (ชุดเดียวกับแถบข้าง) · หน้าที่ไม่อยู่ในเมนูใด = ผ่าน
 *
 * กั้นที่หน้าจอเท่านั้น — API ของหน้ายังต้องกันเองด้วย `canAccessMenu()` ถ้าข้อมูลห้ามรั่ว
 */
export function MenuGuard({ children }: { children: React.ReactNode }) {
  const hidden = useContext(HiddenMenusContext);
  const match = findModule(usePathname());
  const blocked = match ? hidden.has(match.child?.id ?? match.item.id) : false;

  if (!blocked) return children;
  return (
    <EmptyState
      title="ไม่มีสิทธิ์เข้าเมนูนี้"
      hint={
        <>
          ฝ่าย/แผนกของคุณยังไม่ได้รับสิทธิ์ “{match?.child?.label ?? match?.item.label}” · ติดต่อผู้ดูแลระบบ HR
          {" · "}
          <Link href="/home" className="font-semibold text-primary underline-offset-2 hover:underline">
            กลับหน้าหลัก
          </Link>
        </>
      }
      className="py-24"
    />
  );
}
