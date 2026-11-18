"use client";

import { ViewTransition, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Search, Sparkles, X } from "lucide-react";

import { useVisibleModules } from "@/components/auth/menu-access-provider";
import { Mascot } from "@/components/ui/mascot";
import { ManualButton } from "@/components/shell/manual-button";
import { UserMenu, type ShellUser } from "@/components/shell/user-menu";
import { moduleSections, type ModuleGroup, type ModuleId, type ModuleItem } from "@/lib/modules";

/** ทุกเมนูที่เปิดได้จริง — เมนูที่มี subgroup แตกเป็นลูกแต่ละตัว (`parent` = หัวข้อ) */
type Entry = { group: ModuleGroup; item: ModuleItem; parent?: ModuleItem };
const entriesOf = (modules: ModuleGroup[]): Entry[] =>
  modules.flatMap((group) =>
    group.items.flatMap((item): Entry[] =>
      item.children ? item.children.map((child) => ({ group, item: child, parent: item })) : [{ group, item }],
    ),
  );

/** กลุ่มงานกับเมนูที่ผู้ใช้คนนี้เห็น — หักเมนูที่หน้า “กำหนดสิทธิ์” ซ่อนไว้แล้ว */
function useEntries() {
  const modules = useVisibleModules();
  const all = useMemo(() => entriesOf(modules), [modules]);
  return { modules, all };
}

/**
 * หน้าหลัก — โครงเดียวกับหน้า Home ของ menaIT V.2 ในโทน teal ของ HR
 *
 * - **เดสก์ท็อป “ไอคอนแอปจัดหมวด”** (แบบ A · 18 พ.ย. 2569): ฮีโร่เตี้ย + การ์ดกลุ่มงานกว้าง 80% ของจอ
 *   ในการ์ดแบ่งหมวดย่อย (`ModuleGroup.sections`) ไอคอนแอปสี่เหลี่ยม + ชื่อ (ไม่มีช่องค้นหา)
 * - **มือถือ “App Launcher”**: แท็บกลุ่ม + ไอคอนแอปสี่คอลัมน์
 *
 * แถวเมนูบนเดสก์ท็อปห่อด้วย `<ViewTransition name="menu-<id>">` ชื่อเดียวกับแถวในแถบข้าง
 * ของหน้าใน (`components/module/module-nav.tsx`) — กดแล้วแถวบินไปเป็นแถบข้าง ·
 * ชื่อห้ามซ้ำในหน้า จึงห่อเฉพาะเมนูในการ์ดกลุ่ม (ชิปทางลัด ผลค้นหา และไอคอนมือถือไม่ห่อ)
 */
export function HomeView({
  user,
  firstName,
  initialGroup,
}: {
  user: ShellUser;
  firstName: string;
  initialGroup: ModuleId;
}) {
  const mobileSearch = useRef<HTMLInputElement>(null);

  // Ctrl/⌘ + K โฟกัสช่องค้นหา — มีเฉพาะบนมือถือ (เดสก์ท็อปเอาช่องค้นหาออกแล้ว 5 พ.ย. 2026 · Bew)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && mobileSearch.current?.offsetParent) {
        e.preventDefault();
        mobileSearch.current.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="h-dvh overflow-hidden">
      <DesktopHome user={user} firstName={firstName} />
      <MobileHome user={user} firstName={firstName} initialGroup={initialGroup} searchRef={mobileSearch} />
    </div>
  );
}

interface LayoutProps {
  user: ShellUser;
  firstName: string;
  searchRef: React.RefObject<HTMLInputElement | null>;
}

/* ───────────────────────────────────────── เดสก์ท็อป · ไอคอนแอปจัดหมวด */

/**
 * แบบ A ของ canvas “HR Service Home — App Icons” (18 พ.ย. 2569 · Bew) — ฮีโร่เตี้ย (น้องมีนา + คำทักทาย)
 * แล้วการ์ดกลุ่มงานเรียงข้างกัน ในการ์ดแบ่งหมวดย่อย ไอคอนแอปสี่เหลี่ยม + ชื่อใต้ไอคอน
 * · แสดงเฉพาะเมนูที่ผู้ใช้มีสิทธิ์ (`useVisibleModules`) · จอเตี้ยเลื่อนทั้งหน้าได้
 */
function DesktopHome({ user, firstName }: Omit<LayoutProps, "searchRef">) {
  const { modules } = useEntries();

  return (
    <div className="home-canvas hidden h-dvh flex-col overflow-y-auto pb-8 lg:flex">
      {/* ฮีโร่ — ไม่ใส่ overflow-hidden และไม่ตั้ง z-index ที่ตัวนี้: การ์ดด้านล่าง (z-10) ต้องทับขอบล่าง
          ของฮีโร่ได้ ส่วนเมนูผู้ใช้ (z-40) ยังกางทับการ์ดได้ */}
      <section className="app-shell relative shrink-0 rounded-b-[40px] pb-[clamp(72px,11vh,104px)] text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-b-[40px]">
          <span className="shell-orb shell-orb-float absolute -bottom-[260px] -left-[170px] size-[420px] opacity-90" />
          <span className="absolute -top-20 -right-16 size-[260px] rounded-full bg-white/10" />
        </div>

        <HomeHeader user={user} />

        <div className="relative mx-auto mt-[clamp(8px,2vh,24px)] flex w-[80%] animate-lift-in items-center gap-5">
          <Mascot size={96} label="น้องมีนา" />
          <div className="min-w-0">
            <h1 className="font-display text-[clamp(26px,3.6vh,34px)] leading-tight font-semibold text-pretty">
              สวัสดีค่ะ{" "}
              <span className="bg-linear-to-r from-[#fff4c7] to-[#f8b545] bg-clip-text text-transparent">
                คุณ{firstName}
              </span>
            </h1>
            <p className="mt-1 text-16 text-white/90">เลือกแอปที่ต้องการได้เลย · แอปจัดตามงานที่ทำ</p>
          </div>
        </div>
      </section>

      {/* การ์ดกลุ่มกว้าง 80% ของจอ แบ่งคอลัมน์เท่ากันตามจำนวนกลุ่มที่แสดง (กลุ่ม `hidden` ไม่นับ) */}
      <main
        className="relative z-10 mx-auto -mt-[clamp(56px,8vh,72px)] grid w-[80%] items-start gap-6"
        style={{ gridTemplateColumns: `repeat(${modules.length}, minmax(0, 1fr))` }}
      >
        {modules.map((group, i) => (
          <GroupCard key={group.id} group={group} index={i} />
        ))}
      </main>
    </div>
  );
}

function GroupCard({ group, index }: { group: ModuleGroup; index: number }) {
  const sections = moduleSections(group);
  const count = sections.reduce((n, sec) => n + sec.apps.length, 0);

  return (
    <section
      aria-labelledby={`col-${group.id}`}
      className={`tone-${group.id} home-col flex flex-col gap-[18px] rounded-[24px] border border-line bg-base-100 px-7 pt-6 pb-5 text-ink elev-raise`}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="flex items-center gap-3.5">
        <span className="tone-soft grid size-12 shrink-0 place-items-center rounded-[14px]">
          <group.icon size={24} strokeWidth={1.8} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`col-${group.id}`} className="font-display text-20 leading-tight font-semibold">
            {group.label}
          </h2>
          <p className="mt-0.5 truncate text-13 text-mut">{group.tagline}</p>
        </div>
        <span className="shrink-0 rounded-full border border-line px-2.5 py-0.5 text-12-5 text-mut">
          {count} แอป
        </span>
      </div>

      {sections.map((sec) => (
        <div key={sec.id} className="flex flex-col gap-2">
          {sec.label ? (
            <div className="flex items-center gap-2.5 text-12-5 font-semibold text-mut">
              {sec.label}
              <span aria-hidden className="h-px flex-1 bg-line/70" />
            </div>
          ) : null}
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-1">
            {sec.apps.map(({ item, parent }) => (
              <li key={item.id} className="flex">
                <AppIcon item={item} parent={parent} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/**
 * ไอคอนแอปบนเดสก์ท็อป — ห่อ `<ViewTransition name="menu-<id>">` ชื่อเดียวกับแถวในแถบข้าง
 * (`components/module/module-nav.tsx`) กดแล้วไอคอนบินไปเป็นแถวนั้น · ชื่อห้ามซ้ำในหน้า
 */
function AppIcon({ item, parent }: { item: ModuleItem; parent?: ModuleItem }) {
  const title = parent ? `${parent.label} · ${item.desc}` : item.desc;

  if (item.soon) {
    return (
      <span
        aria-disabled="true"
        title="เร็ว ๆ นี้"
        className="flex w-full cursor-not-allowed flex-col items-center gap-2.5 rounded-[16px] px-1 pt-2.5 pb-3 text-mut"
      >
        <span className="relative grid size-[72px] place-items-center rounded-[20px] border border-dashed border-line-strong bg-base-200 text-mut/80">
          <item.icon size={30} strokeWidth={1.8} aria-hidden />
          <span className="absolute -top-2 -right-3.5 rounded-full bg-[#3f4c48] px-1.5 py-px text-10-5 font-semibold whitespace-nowrap text-white">
            เร็ว ๆ นี้
          </span>
        </span>
        <span className="line-clamp-2 text-center text-13-5 leading-snug font-medium">{item.label}</span>
      </span>
    );
  }

  return (
    <ViewTransition name={`menu-${item.id}`} share="menu-morph" default="none">
      <Link
        href={item.href}
        title={title}
        transitionTypes={["nav-forward"]}
        className="home-app group flex w-full flex-col items-center gap-2.5 rounded-[16px] px-1 pt-2.5 pb-3"
      >
        <span className="tone-app grid size-[72px] place-items-center rounded-[20px] transition-transform duration-150 group-hover:-translate-y-0.5">
          <item.icon size={30} strokeWidth={1.8} aria-hidden />
        </span>
        <span className="line-clamp-2 text-center text-13-5 leading-snug font-medium">{item.label}</span>
      </Link>
    </ViewTransition>
  );
}

/* ───────────────────────────────────────── มือถือ · App Launcher */

function MobileHome({
  user,
  firstName,
  initialGroup,
  searchRef,
}: LayoutProps & { initialGroup: ModuleId }) {
  const [activeId, setActiveId] = useState<ModuleId>(initialGroup);
  const { modules } = useEntries();
  const current = modules.find((g) => g.id === activeId) ?? modules[0];

  return (
    <div className="app-shell relative flex h-full flex-col overflow-hidden text-white lg:hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <span className="shell-orb shell-orb-float absolute top-[120px] -left-[120px] size-[260px] opacity-85" />
      </div>

      <HomeHeader user={user} />

      <div className="relative flex shrink-0 items-center gap-2.5 px-5 pb-[clamp(12px,2.6vh,24px)]">
        <Mascot size={88} label="น้องมีนา" />
        <p className="max-w-[230px] rounded-[18px_18px_18px_4px] bg-white px-3.5 py-2.5 text-13-5 leading-snug text-[#0b3a36] shadow-lg">
          สวัสดีค่ะ <strong className="font-semibold text-[#0f766e]">คุณ{firstName}</strong>
          <br />
          เลือกเมนูที่ต้องการได้เลย
        </p>
      </div>

      <main className="home-canvas relative flex min-h-0 flex-1 flex-col gap-3.5 rounded-t-[34px] px-4 pt-5 pb-[max(16px,env(safe-area-inset-bottom))] text-ink">
        <MenuSearch
          inputRef={searchRef}
          inputClassName="h-[50px] border border-line bg-base-100 elev-card"
          placeholder="ค้นหาเมนู…"
        />

        <div
          role="tablist"
          aria-label="กลุ่มงาน"
          className="grid shrink-0 gap-1 rounded-full border border-line bg-base-100 p-1 elev-card"
          style={{ gridTemplateColumns: `repeat(${modules.length}, minmax(0, 1fr))` }}
        >
          {modules.map((g) => {
            const active = g.id === current.id;
            return (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveId(g.id)}
                className={`tone-${g.id} h-10 cursor-pointer truncate rounded-full px-2 text-13-5 transition-all ${
                  active ? "tone-soft font-semibold" : "font-medium text-mut"
                }`}
              >
                {g.label}
              </button>
            );
          })}
        </div>

        {/* ทุกเมนูถูกซ่อนหมด (สิทธิ์ของแผนกนี้ยังไม่ได้ตั้ง) — ไม่มีแผงให้วาด */}
        {current ? (
        <section
          key={current.id}
          role="tabpanel"
          aria-label={current.label}
          className={`tone-${current.id} flex min-h-0 animate-pop-in flex-col gap-4 overflow-y-auto rounded-[28px] border border-line bg-base-100 px-4 pt-4 pb-5 elev-card`}
        >
          <div className="flex items-center gap-2">
            <span aria-hidden className="tone-tile h-[22px] w-2 rounded-full" />
            <h2 className="text-16 font-semibold">{current.label}</h2>
            <span className="min-w-0 flex-1 truncate text-12 text-mut">· {current.tagline}</span>
          </div>
          <div className="grid grid-cols-4 gap-x-2 gap-y-4 sm:grid-cols-5 md:grid-cols-6">
            {current.items.map((item) =>
              item.children ? (
                <SubGroupApp key={item.id} item={item} tone={current.id} />
              ) : (
                <AppTile key={item.id} item={item} />
              ),
            )}
          </div>
        </section>
        ) : null}
      </main>
    </div>
  );
}

function AppTile({ item }: { item: ModuleItem }) {
  const tile = (
    <span className="relative">
      <span
        className={`tone-tile grid size-[62px] place-items-center rounded-[22px] ${
          item.soon ? "opacity-55 grayscale" : ""
        }`}
      >
        <item.icon size={26} strokeWidth={1.8} aria-hidden />
      </span>
      {item.soon ? (
        <span className="absolute -top-1.5 -right-2 rounded-full bg-[#53635e] px-1.5 py-px text-9-5 font-semibold whitespace-nowrap text-white">
          เร็ว ๆ นี้
        </span>
      ) : null}
    </span>
  );

  if (item.soon) {
    return (
      <span className="flex cursor-not-allowed flex-col items-center gap-2 text-center" title="เร็ว ๆ นี้">
        {tile}
        <span className="text-12-5 leading-tight font-medium text-mut">{item.label}</span>
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      className="flex flex-col items-center gap-2 text-center transition-transform active:scale-95"
    >
      {tile}
      <span className="text-12-5 leading-tight font-medium">{item.label}</span>
    </Link>
  );
}

/**
 * เมนูที่มี subgroup บนมือถือ — ไอคอนแอปแบบโฟลเดอร์
 * แตะแล้วกางแผ่นล่าง (bottom sheet) ให้เลือกเมนูย่อย · portal ไป `body` เพราะแผงแท็บเลื่อนได้
 * (ห่อด้วย `tone-*` ของแผงแม่ไม่ถึง จึงรับ `tone` มาตั้งเองบนแผ่นล่าง)
 */
function SubGroupApp({
  item,
  tone,
}: {
  item: ModuleItem;
  tone: ModuleId;
}) {
  const [open, setOpen] = useState(false);
  const children = item.children ?? [];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex cursor-pointer flex-col items-center gap-2 text-center transition-transform active:scale-95"
      >
        <span className="relative">
          <span className="tone-tile grid size-[62px] place-items-center rounded-[22px]">
            <item.icon size={26} strokeWidth={1.8} aria-hidden />
          </span>
        </span>
        <span className="text-12-5 leading-tight font-medium">{item.label}</span>
      </button>

      {open
        ? createPortal(
            <div
              className="fixed inset-0 z-50 lg:hidden"
              role="dialog"
              aria-modal="true"
              aria-label={item.label}
            >
              <button
                type="button"
                aria-label="ปิด"
                onClick={() => setOpen(false)}
                className="absolute inset-0 animate-fade-in bg-ink/45"
              />
              <div
                className={`tone-${tone} absolute inset-x-0 bottom-0 flex animate-sheet-up flex-col gap-3 rounded-t-[28px] bg-base-100 px-4 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] text-ink shadow-2xl`}
              >
                <span aria-hidden className="mx-auto h-1.5 w-10 rounded-full bg-line" />
                <div className="flex items-center gap-3">
                  <span className="tone-tile grid size-11 place-items-center rounded-[14px]">
                    <item.icon size={20} strokeWidth={1.8} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-16 font-semibold">{item.label}</p>
                    <p className="truncate text-12 text-mut">{item.desc}</p>
                  </div>
                  <button
                    type="button"
                    aria-label="ปิด"
                    onClick={() => setOpen(false)}
                    className="grid size-10 place-items-center rounded-full text-mut hover:bg-base-200"
                  >
                    <X size={18} strokeWidth={1.8} aria-hidden />
                  </button>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {children.map((child) => {
                    return (
                      <li key={child.id}>
                        <Link
                          href={child.href}
                          onClick={() => setOpen(false)}
                          className="home-row group flex items-center gap-3 rounded-[18px] border border-line p-3"
                        >
                          <span className="tone-soft grid size-10 shrink-0 place-items-center rounded-[12px]">
                            <child.icon size={18} strokeWidth={1.8} aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-14 font-semibold">{child.label}</span>
                            <span className="block truncate text-12 text-mut">{child.desc}</span>
                          </span>
                          <ArrowRight
                            size={17}
                            strokeWidth={1.8}
                            aria-hidden
                            className="shrink-0 text-mut/60"
                          />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/* ───────────────────────────────────────── ชิ้นที่ใช้ร่วม */

function HomeHeader({ user }: { user: ShellUser }) {
  return (
    <header className="relative z-40 flex w-full animate-fade-in items-center justify-between gap-3 px-4 pt-[clamp(8px,1.6vh,24px)] sm:px-8 lg:mx-auto lg:w-[80%] lg:px-0">
      <Link href="/home" className="my-3 flex items-center gap-3">
        <span className="grid h-12 w-14 place-items-center rounded-2xl bg-white/90 shadow-lg">
          <Image
            src="/mena-logo.png"
            alt="MENA Transport"
            width={54}
            height={36}
            className="h-8 w-auto"
            priority
          />
        </span>
        <span className="hidden items-center gap-2.5 text-17 font-semibold tracking-wide sm:flex">
          <span aria-hidden className="grid grid-cols-2 gap-1">
            <i className="size-2.5 rounded-[4px] bg-white/95" />
            <i className="size-2.5 rounded-[4px] bg-white/95" />
            <i className="size-2.5 rounded-[4px] bg-white/95" />
            <i className="size-2.5 rounded-[4px] bg-[#f8b545]" />
          </span>
          HR Service
        </span>
      </Link>
      <div className="flex items-center gap-2 sm:gap-3">
        <ManualButton />
        <UserMenu user={user} />
      </div>
    </header>
  );
}

/**
 * ค้นหาเมนู — พิมพ์แล้วกางรายการเมนูที่ตรงจากทั้งสามกลุ่ม · Enter เปิดรายการแรก · Esc ปิด
 * (ท่าเดียวกับ `ServiceSearch` ของ menaIT แต่ค้นในเมนูของระบบ ไม่ได้ยิง API)
 */
function MenuSearch({
  inputRef,
  className = "",
  inputClassName = "",
  placeholder,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  className?: string;
  inputClassName?: string;
  placeholder: string;
}) {
  const router = useRouter();
  const { all } = useEntries();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all.filter((e) => !e.item.soon).slice(0, 6);
    return all.filter(({ group, item, parent }) =>
      `${item.label} ${item.desc} ${parent?.label ?? ""} ${group.label}`.toLowerCase().includes(q),
    );
  }, [all, query]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  return (
    <div ref={wrap} className={`relative z-30 ${className}`}>
      <Search
        size={20}
        strokeWidth={1.8}
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-5 z-10 -translate-y-1/2 text-[#7d8c87]"
      />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls="home-search-list"
        aria-label="ค้นหาเมนู"
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter") {
            const first = results.find((r) => !r.item.soon);
            if (first) go(first.item.href);
          }
        }}
        className={`field-ring w-full rounded-full pr-5 pl-13 text-15 text-[#15201d] outline-none placeholder:text-[#7d8c87] ${inputClassName}`}
      />

      {open ? (
        <div
          id="home-search-list"
          role="listbox"
          className="absolute top-full right-0 left-0 mt-2 max-h-80 animate-pop-in overflow-y-auto rounded-3xl border border-line bg-base-100 py-2 text-ink elev-pop"
        >
          <p className="px-5 pt-2 pb-1 text-12 font-semibold text-mut">
            {query.trim() ? "เมนูที่ตรงกับคำค้น" : "เมนูแนะนำ"}
          </p>
          {results.length ? (
            results.map(({ group, item, parent }) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={false}
                disabled={item.soon}
                onClick={() => go(item.href)}
                className={`tone-${group.id} group/sr flex w-full cursor-pointer items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-base-200 disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <span className="tone-tile grid size-10 shrink-0 place-items-center rounded-xl">
                  <item.icon size={18} strokeWidth={1.8} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-14 font-medium">{item.label}</span>
                  <span className="block truncate text-12 text-mut">
                    {group.label}
                    {parent ? ` · ${parent.label}` : ""} · {item.soon ? "เร็ว ๆ นี้" : item.desc}
                  </span>
                </span>
                <ArrowRight
                  size={16}
                  strokeWidth={1.8}
                  aria-hidden
                  className="shrink-0 text-mut/60 transition-all group-hover/sr:translate-x-1 group-hover/sr:text-primary"
                />
              </button>
            ))
          ) : (
            <p className="flex items-center justify-center gap-2 px-5 py-6 text-14 text-mut">
              <Sparkles size={16} strokeWidth={1.8} aria-hidden />
              ไม่พบเมนูที่ค้นหา
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
