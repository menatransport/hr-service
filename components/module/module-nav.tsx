"use client";

import { Suspense, ViewTransition, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { MODULES, findModule, type ModuleGroup, type ModuleItem } from "@/lib/modules";

/**
 * แถบข้างของโมดูล — menulist ของกลุ่มงานที่หน้าปัจจุบันสังกัด (ดู `lib/modules.ts`)
 *
 * ใช้ในทั้งสามเชลล์ (`/desk` · `/recruitment/admin` · `/payroll`) เพราะเมนูของกลุ่มหนึ่ง
 * ชี้ข้ามระบบได้ (กลุ่มพนักงานจัดส่งมีทั้งคิวคำร้องและผู้สมัคร) — ผู้ใช้จึงเห็นแถบข้าง
 * ชุดเดิมไม่ว่าจะอยู่ระบบไหน · หน้าที่ไม่อยู่ในกลุ่มใด (เช่นภาพรวมของศูนย์สรรหา)
 * ถอยไปใช้ `fallback` = เมนูเดิมของระบบนั้นทั้งชุด
 *
 * หน้าตาแบบ A “Quiet list” จาก Claude Design (`MenaHR Sidebar — Minimal`, Bew เลือก 10 ต.ค. 2569):
 * หัวเป็นจุดสีกลุ่ม + ชื่อกลุ่มตัวเล็ก + ปุ่มย่อ (`headAction`) · แถวสูง 34px ไม่มีพื้น ไอคอนเทา ·
 * กลุ่มอื่นเป็นลิงก์ตัวเล็กใต้เส้นคั่น · `rail` = โหมดย่อเหลือแต่ไอคอน (ชื่ออยู่ใน `title`)
 * เมนูที่มี subgroup แตกลูกออกมาเป็นไอคอนเรียงกันเลย
 *
 * ไม่มีหัวข้อพับ “เมนูทั้งหมดของ…” แล้ว (ถอดตามที่สั่ง 10 ต.ค. 2569)
 *
 * `morph` เปิดชื่อ view transition (`menu-<id>`, `module-<id>`) ให้ตรงกับแผงเมนูบน Home
 * — **เปิดได้แค่อินสแตนซ์เดียวต่อหน้า** (แถบข้างเดสก์ท็อป) ชื่อซ้ำกันในหน้าเดียว
 * เบราว์เซอร์จะยกเลิก transition ทั้งชุด · ลิ้นชักบนมือถือจึงไม่ส่ง `morph`
 */
interface NavProps {
  fallback: React.ReactNode;
  morph?: boolean;
  /** โหมดไอคอนล้วน (แถบข้างที่ถูกย่อ) */
  rail?: boolean;
  /** ปุ่มท้ายหัวแถบ (ย่อ/ขยายแถบข้าง) — ตอน `rail` เป็นของชิ้นเดียวบนหัว */
  headAction?: React.ReactNode;
}

export function ModuleNav({ morph = false, rail = false, fallback, headAction }: NavProps) {
  const pathname = usePathname();
  const props = { fallback, morph, rail, headAction };
  /* `useSearchParams` ต้องอยู่ใต้ Suspense — ระหว่างรอใช้ผลจาก path อย่างเดียวไปก่อน
     (ต่างกันแค่หน้า HR MASTER ที่ชี้ด้วย query) แถบข้างจึงไม่ว่างแม้แวบเดียว */
  return (
    <Suspense fallback={<Resolved match={findModule(pathname)} {...props} />}>
      <WithSearch {...props} />
    </Suspense>
  );
}

type ResolvedProps = Required<Pick<NavProps, "morph" | "rail">> & Pick<NavProps, "fallback" | "headAction">;

function WithSearch(props: ResolvedProps) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  return <Resolved match={findModule(pathname, search)} {...props} />;
}

function Resolved({
  match,
  fallback,
  morph,
  rail,
  headAction,
}: ResolvedProps & { match: ReturnType<typeof findModule> }) {
  if (!match) return <>{fallback}</>;
  const { group, item: current, child: currentChild } = match;

  return (
    <nav
      aria-label={`เมนู${group.label}`}
      className={`tone-${group.id} flex shrink-0 grow flex-col gap-0.5 ${rail ? "items-center px-2 py-2.5" : "px-2.5 pt-3.5 pb-2.5"}`}
    >
      <Morph on={morph} name={`module-${group.id}`}>
        <div className={`flex items-center gap-2 ${rail ? "justify-center pb-1.5" : "pb-2.5 pl-2"}`}>
          {rail ? null : (
            <>
              <span aria-hidden className="module-dot size-2 flex-none rounded-full" />
              <span className="min-w-0 flex-1 truncate text-12 font-semibold tracking-[0.04em] text-mut">
                {group.label}
              </span>
            </>
          )}
          {headAction}
        </div>
      </Morph>

      <ul className={`flex flex-col gap-0.5 ${rail ? "w-full items-center" : ""}`}>
        {group.items.map((item) => (
          <li key={item.id} className={rail ? "contents" : undefined}>
            {item.children ? (
              rail ? (
                // ย่ออยู่: ไม่มีที่ให้พับ/กาง — ลูกขึ้นเป็นไอคอนเรียงต่อกันเลย
                item.children.map((child) => (
                  <Morph key={child.id} on={morph} name={`menu-${child.id}`}>
                    <Row
                      item={child}
                      title={`${item.label} · ${child.label}`}
                      active={child.id === currentChild?.id}
                      rail
                    />
                  </Morph>
                ))
              ) : (
                <SubGroup
                  item={item}
                  morph={morph}
                  active={item.id === current.id}
                  activeChildId={item.id === current.id ? currentChild?.id : undefined}
                />
              )
            ) : (
              <Morph on={morph} name={`menu-${item.id}`}>
                <Row item={item} active={item.id === current.id} rail={rail} />
              </Morph>
            )}
          </li>
        ))}
      </ul>

      <OtherGroups current={group} rail={rail} />
    </nav>
  );
}

/** ห่อด้วย `<ViewTransition>` เฉพาะอินสแตนซ์ที่เปิด `morph` — ดูเหตุผลที่หัวไฟล์ */
function Morph({ on, name, children }: { on: boolean; name: string; children: React.ReactNode }) {
  if (!on) return <>{children}</>;
  return (
    <ViewTransition name={name} share="menu-morph" default="none">
      {children}
    </ViewTransition>
  );
}

const ROW = "module-row flex items-center rounded-[8px] text-13";
const ROW_FULL = `${ROW} min-h-[34px] w-full gap-2.5 px-2.5`;
const ROW_RAIL = `${ROW} size-10 justify-center`;

function RowIcon({ item, size = 16 }: { item: ModuleItem; size?: number }) {
  return (
    <span className="module-row-tile flex-none">
      <item.icon size={size} strokeWidth={1.8} aria-hidden className="block" />
    </span>
  );
}

function Row({
  item,
  active,
  rail = false,
  title,
}: {
  item: ModuleItem;
  active: boolean;
  rail?: boolean;
  title?: string;
}) {
  const label = title ?? item.label;

  if (item.soon) {
    return (
      <span
        title={`${label} · ยังไม่เปิดใช้งาน`}
        className={`${rail ? ROW_RAIL : ROW_FULL} cursor-not-allowed text-mut opacity-60`}
      >
        <RowIcon item={item} />
        {rail ? null : (
          <>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            <span className="flex-none rounded-full bg-base-200 px-1.5 text-10 font-medium">เร็ว ๆ นี้</span>
          </>
        )}
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      title={rail ? label : undefined}
      aria-label={rail ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={`${rail ? ROW_RAIL : ROW_FULL} text-ink/80`}
    >
      <RowIcon item={item} />
      {rail ? null : <span className="min-w-0 flex-1 truncate">{item.label}</span>}
    </Link>
  );
}

/**
 * เมนูที่มีเมนูย่อย — หัวข้อเป็นปุ่มพับ/กาง (ไม่ใช่ลิงก์) ลูกเรียงใต้เส้นประสีกลุ่มที่ลากลง
 * จากกึ่งกลางไอคอนหัวข้อ · กางเองเมื่อหน้าที่เปิดอยู่เป็นของ subgroup นี้
 *
 * ตอนพับ ลูกยังอยู่ใน DOM (ยุบด้วย grid-rows 0fr) แต่ `inert` — กด/โฟกัสไม่ได้
 */
function SubGroup({
  item,
  morph,
  active,
  activeChildId,
}: {
  item: ModuleItem;
  morph: boolean;
  active: boolean;
  activeChildId?: string;
}) {
  const [open, setOpen] = useState(active);
  const children = item.children ?? [];
  const listId = `sub-${item.id}`;

  return (
    <>
      <Morph on={morph} name={`menu-${item.id}`}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((v) => !v)}
          data-active={active || undefined}
          className={`${ROW_FULL} cursor-pointer text-left text-ink/80`}
        >
          <RowIcon item={item} />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          <ChevronDown
            size={14}
            strokeWidth={1.8}
            aria-hidden
            className={`flex-none text-mut transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          />
        </button>
      </Morph>

      <div
        id={listId}
        inert={!open}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <ul className="module-sub ml-[17px] flex flex-col gap-0.5 border-l border-dashed py-0.5 pl-2">
            {children.map((child) => (
              <li key={child.id}>
                <Morph on={morph} name={`menu-${child.id}`}>
                  <Link
                    href={child.href}
                    aria-current={child.id === activeChildId ? "page" : undefined}
                    className="module-row module-sub-row flex min-h-8 items-center gap-2 rounded-[8px] px-2 text-12-5 text-ink/80"
                  >
                    <RowIcon item={child} size={14} />
                    <span className="min-w-0 flex-1 truncate">{child.label}</span>
                  </Link>
                </Morph>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

/**
 * สลับไปกลุ่มอื่นได้จากแถบข้างเลย — พากลับ Home โดยเปิดแผงของกลุ่มนั้นไว้ให้
 *
 * `mt-auto` = ชิดท้ายแถบข้างที่สูงเต็มจอ (14 ต.ค. 2026) เมนูของกลุ่มอยู่บน ทางออกไปกลุ่มอื่นอยู่ล่าง
 * แยกกันชัด · ในลิ้นชักมือถือที่สูงตามเนื้อหา `mt-auto` ไม่มีผลอะไร
 */
function OtherGroups({ current, rail }: { current: ModuleGroup; rail: boolean }) {
  const others = MODULES.filter((m) => m.id !== current.id);

  return (
    <div className={`mt-auto flex flex-col gap-0.5 pt-4 ${rail ? "w-full items-center" : ""}`}>
      <div aria-hidden className={`mb-2 h-px bg-line ${rail ? "w-7" : "mx-2"}`} />
      {rail ? null : (
        <p className="px-2.5 pb-1 text-10-5 font-semibold tracking-[0.06em] text-mut/80">กลุ่มงานอื่น</p>
      )}
      {others.map((m) => (
        <Link
          key={m.id}
          href={`/home?m=${m.id}`}
          transitionTypes={["nav-back"]}
          title={rail ? `กลุ่มงาน${m.label}` : undefined}
          aria-label={rail ? `กลุ่มงาน${m.label}` : undefined}
          className={`tone-${m.id} module-row flex items-center rounded-[8px] text-12 text-mut ${
            rail ? "size-10 justify-center" : "min-h-[30px] gap-2.5 px-2.5"
          }`}
        >
          <m.icon size={14} strokeWidth={1.8} aria-hidden className="flex-none" />
          {rail ? null : <span className="min-w-0 flex-1 truncate">{m.label}</span>}
        </Link>
      ))}
    </div>
  );
}
