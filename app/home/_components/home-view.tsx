"use client";

import { Suspense, ViewTransition, createContext, use, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown, Search, Sparkles, X } from "lucide-react";

import { Mascot } from "@/components/ui/mascot";
import { UserMenu, type ShellUser } from "@/components/shell/user-menu";
import { MODULES, type ModuleGroup, type ModuleId, type ModuleItem } from "@/lib/modules";

export interface HomeBadge {
  label: string;
  tone: "new" | "wait" | "live" | "alert";
}

const BADGE_CHIP: Record<HomeBadge["tone"], string> = {
  new: "chip-new",
  wait: "chip-wait",
  live: "chip-live",
  alert: "chip-alert",
};

type Badges = Record<string, HomeBadge>;

/**
 * ป้ายตัวเลขบนเมนูมาจากคำร้องของ NCAC (~250–350ms) — **ไม่ให้หน้าหลักรอมัน**
 * หน้าเซิร์ฟเวอร์ส่ง promise มา (ไม่ `await`) แล้วป้ายแต่ละอันรอเองใน `<Suspense>` ของตัวเอง
 * หน้าจึงขึ้นทันที ป้ายค่อยโผล่ตามมา · ไม่ได้สลับทั้งหน้าแบบ fallback → ของจริง
 * สถานะที่ผู้ใช้เริ่มทำไปแล้ว (พิมพ์ค้นหา · กางเมนูย่อย) จึงไม่หาย
 */
const BadgeContext = createContext<Promise<Badges>>(Promise.resolve({}));

function Badge({ id, children }: { id: string; children: (badge: HomeBadge) => React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <BadgeValue id={id}>{children}</BadgeValue>
    </Suspense>
  );
}

function BadgeValue({ id, children }: { id: string; children: (badge: HomeBadge) => React.ReactNode }) {
  const badge = use(use(BadgeContext))[id];
  return badge ? children(badge) : null;
}

/** จอแคบเหลือแค่ตัวเลข — ไม่มีตัวเลขในป้ายก็เป็นจุด */
function badgeCount(badge: HomeBadge): string {
  return badge.label.replace(/\D+/g, "") || "•";
}

/** ทางลัดใต้ช่องค้นหา (ชิปกระจก) — เมนูที่ใช้บ่อยที่สุด อ้างด้วย id ใน `lib/modules.ts` */
const QUICK_IDS = ["cases", "requisitions", "trainees", "registry", "employee"];

/** ทุกเมนูที่เปิดได้จริง — เมนูที่มี subgroup แตกเป็นลูกแต่ละตัว (`parent` = หัวข้อ) */
type Entry = { group: ModuleGroup; item: ModuleItem; parent?: ModuleItem };
const ALL: Entry[] = MODULES.flatMap((group) =>
  group.items.flatMap((item): Entry[] =>
    item.children ? item.children.map((child) => ({ group, item: child, parent: item })) : [{ group, item }],
  ),
);

/**
 * หน้าหลัก — โครงเดียวกับหน้า Home ของ menaIT V.2 ในโทน teal ของ HR
 *
 * - **เดสก์ท็อป “Assistant-first”**: ฮีโร่ไล่สี + น้องมีนากลางจอ + คำทักทาย + ช่องค้นหาใหญ่ + ชิปทางลัด
 *   แล้วการ์ดกลุ่มงานสามคอลัมน์เต็มความกว้าง (ขอบข้าง `clamp(24px,5vw,72px)` เท่า menaIT) · หน้าเดียวจบ ไม่มี scroll ของหน้า
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
  badges,
}: {
  user: ShellUser;
  firstName: string;
  initialGroup: ModuleId;
  /** ป้ายตัวเลขบนเมนู — เป็น promise โดยตั้งใจ (ดู `BadgeContext`) */
  badges: Promise<Badges>;
}) {
  const desktopSearch = useRef<HTMLInputElement>(null);
  const mobileSearch = useRef<HTMLInputElement>(null);

  // Ctrl/⌘ + K โฟกัสช่องค้นหาของรูปแบบที่กำลังแสดงอยู่
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const wide = window.matchMedia("(width >= 64rem)").matches;
        (wide ? desktopSearch : mobileSearch).current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <BadgeContext value={badges}>
      <div className="h-dvh overflow-hidden">
        <DesktopHome user={user} firstName={firstName} searchRef={desktopSearch} />
        <MobileHome user={user} firstName={firstName} initialGroup={initialGroup} searchRef={mobileSearch} />
      </div>
    </BadgeContext>
  );
}

interface LayoutProps {
  user: ShellUser;
  firstName: string;
  searchRef: React.RefObject<HTMLInputElement | null>;
}

/* ───────────────────────────────────────── เดสก์ท็อป · Assistant-first */

/**
 * หน้าเดียวจบ ไม่มี scroll ของหน้า — ฮีโร่กับการ์ดสามคอลัมน์ย่อ/ขยายตามความสูงจอ
 * (`clamp(…vh…)`) · ถ้าจอเตี้ยจนเมนูของกลุ่มไหนล้น การ์ดนั้นเลื่อนในตัวเอง ไม่ดันทั้งหน้า
 * · จอเตี้ยมาก (`max-height`) ซ่อนบรรทัดรองทีละชั้น: คำอธิบายใต้หัว → คำอธิบายเมนู
 */
function DesktopHome({ user, firstName, searchRef }: LayoutProps) {
  const quick = QUICK_IDS.map((id) => ALL.find((e) => e.item.id === id)).filter((e): e is Entry =>
    Boolean(e),
  );

  return (
    <div className="home-canvas hidden h-dvh flex-col overflow-hidden lg:flex">
      {/* ฮีโร่ — ไม่ใส่ overflow-hidden และไม่ตั้ง z-index ที่ตัวนี้: การ์ดด้านล่าง (z-10) ต้องทับขอบล่าง
          ของฮีโร่ได้ ส่วนเมนูผู้ใช้กับผลค้นหา (z-30/40) ยังกางทับการ์ดได้ */}
      <section className="app-shell relative shrink-0 rounded-b-[48px] pb-[clamp(36px,6vh,96px)] text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-b-[48px]">
          <span className="shell-orb shell-orb-float absolute -bottom-[260px] -left-[170px] size-[420px] opacity-90" />
          <span className="absolute -top-20 -right-16 size-[260px] rounded-full bg-white/10" />
        </div>

        <HomeHeader user={user} />

        {/* กลางจอ: น้องมีนา → คำทักทาย → ค้นหา → ทางลัด (ท่าเดียวกับ Home ของ menaIT) */}
        <div className="relative flex animate-lift-in flex-col items-center gap-[clamp(4px,1vh,10px)] px-[clamp(24px,5vw,72px)] text-center">
          <Mascot size={150} label="น้องมีนา" className="home-mascot -mt-[clamp(8px,3vh,28px)]" />
          <h1 className="text-[clamp(24px,4vh,42px)] leading-tight font-bold text-pretty">
            สวัสดีค่ะ{" "}
            <span className="bg-linear-to-r from-[#fff4c7] to-[#f8b545] bg-clip-text text-transparent drop-shadow-[0_2px_8px_rgba(4,30,27,0.25)]">
              คุณ{firstName}
            </span>{" "}
            ให้น้องมีนาช่วยอะไรดี?
          </h1>
          <p className="text-[clamp(13px,1.9vh,17px)] text-white/90 [@media(max-height:700px)]:hidden">
            พิมพ์สิ่งที่ต้องการ หรือเลือกจากเมนูด้านล่าง
          </p>
        </div>

        <MenuSearch
          inputRef={searchRef}
          className="mx-auto mt-[clamp(10px,2.2vh,24px)] w-[820px] max-w-[calc(100%-3rem)]"
          inputClassName="h-[clamp(44px,6.4vh,62px)] bg-white/95 shadow-[0_24px_48px_-20px_rgba(4,30,27,0.6)]"
          placeholder="พิมพ์สิ่งที่ต้องการ เช่น “ข้อร้องเรียน” “ฝึกงาน” “ข้อมูลพนักงาน”"
        />

        <div className="relative mt-[clamp(8px,1.8vh,18px)] flex flex-wrap justify-center gap-2.5 px-6">
          {quick.map(({ group, item }) => (
            <Link
              key={item.id}
              href={item.href}
              transitionTypes={["nav-forward"]}
              className={`tone-${group.id} group flex items-center gap-2.5 rounded-full border border-white/35 bg-white/15 py-[clamp(3px,0.6vh,6px)] pr-5 pl-1.5 text-14 font-medium text-white transition-all hover:-translate-y-0.5 hover:bg-white/25`}
            >
              <span className="tone-tile grid size-[clamp(24px,3.6vh,32px)] place-items-center rounded-full transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6">
                <item.icon size={15} strokeWidth={2} aria-hidden />
              </span>
              {item.label}
            </Link>
          ))}
        </div>
      </section>

      <main className="relative z-10 mx-auto -mt-[clamp(28px,5vh,64px)] grid min-h-0 w-full flex-1 grid-cols-3 items-start gap-[clamp(14px,1.8vw,28px)] px-[clamp(24px,5vw,72px)] pt-5 pb-[clamp(12px,2.4vh,28px)] [@media(max-height:740px)]:pt-2">
        {MODULES.map((group, i) => (
          <GroupColumn key={group.id} group={group} index={i} />
        ))}
      </main>
    </div>
  );
}

function GroupColumn({ group, index }: { group: ModuleGroup; index: number }) {
  return (
    <section
      aria-labelledby={`col-${group.id}`}
      className={`tone-${group.id} home-col flex max-h-full min-h-0 flex-col gap-[clamp(8px,1.4vh,20px)] rounded-[28px] border border-line bg-base-100 p-[clamp(12px,2.2vh,26px)] text-ink elev-raise`}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="flex shrink-0 items-center gap-3.5">
        <span className="tone-tile grid size-[clamp(42px,6vh,52px)] shrink-0 place-items-center rounded-[16px]">
          <group.icon size={22} strokeWidth={1.8} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`col-${group.id}`} className="text-[clamp(17px,2.6vh,22px)] leading-tight font-bold">
            {group.label}
          </h2>
          <p className="mt-0.5 truncate text-13 text-mut [@media(max-height:700px)]:hidden">
            {group.tagline}
          </p>
        </div>
        <span className="tone-soft hidden shrink-0 rounded-full px-3 py-1 text-12 font-semibold 2xl:inline-block">
          {group.items.length} เมนู
        </span>
      </div>

      {/* หน้าไม่เลื่อน — กลุ่มที่ยาวเกินจอเลื่อนในการ์ดของตัวเอง */}
      <ul className="-mx-1 flex min-h-0 flex-col gap-[clamp(6px,1vh,14px)] overflow-y-auto overscroll-contain px-1 pb-1">
        {group.items.map((item) => (
          <li key={item.id}>
            {item.children ? (
              <SubGroupTile item={item} />
            ) : (
              <ViewTransition name={`menu-${item.id}`} share="menu-morph" default="none">
                <MenuTile item={item} />
              </ViewTransition>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function MenuTile({ item }: { item: ModuleItem }) {
  const body = (
    <>
      <span className="tone-soft grid size-[clamp(34px,4.6vh,48px)] shrink-0 place-items-center rounded-[14px]">
        <item.icon size={20} strokeWidth={1.8} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[clamp(14px,2vh,16px)] font-semibold">{item.label}</span>
        <span className="block truncate text-13 text-mut [@media(max-height:820px)]:hidden">{item.desc}</span>
      </span>
    </>
  );

  if (item.soon) {
    return (
      <span className="home-row flex cursor-not-allowed items-center gap-3.5 rounded-[18px] p-[clamp(6px,1vh,16px)] opacity-75">
        {body}
        <span className="tone-soft shrink-0 rounded-full px-2.5 py-0.5 text-11-5 font-semibold">
          เร็ว ๆ นี้
        </span>
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      transitionTypes={["nav-forward"]}
      className="home-row group flex items-center gap-3.5 rounded-[18px] p-[clamp(6px,1vh,16px)]"
    >
      {body}
      <Badge id={item.id}>
        {(badge) => (
          <>
            {/* จอแคบเหลือแค่ตัวเลขในวงกลม — ป้ายเต็มบีบชื่อเมนูจนถูกตัด */}
            <span className={`chip ${BADGE_CHIP[badge.tone]} hidden shrink-0 xl:inline-flex`}>
              {badge.label}
            </span>
            <span
              title={badge.label}
              className={`chip ${BADGE_CHIP[badge.tone]} shrink-0 px-2 tabular-nums xl:hidden`}
            >
              {badgeCount(badge)}
            </span>
          </>
        )}
      </Badge>
      <ArrowRight size={19} strokeWidth={1.8} aria-hidden className="home-row-arrow shrink-0 text-mut/60" />
    </Link>
  );
}

/**
 * เมนูที่มี subgroup (เช่น ค่าจ้างและสวัสดิการ) — หัวข้อเป็นปุ่มพับ/กาง ลูกเรียงใต้เส้นประสีกลุ่มที่ลากลง
 * จากกึ่งกลางไอคอนหัวข้อ · กางไว้ตั้งแต่แรก (การ์ดยังมีที่พอ) · ลูกแต่ละตัวห่อ
 * `<ViewTransition name="menu-<child.id>">` ให้บินไปเป็นแถวลูกในแถบข้างได้เหมือนเมนูปกติ
 *
 * ลูกถูกถอดออกจาก DOM ตอนพับ — ถ้าซ่อนไว้เฉย ๆ ตอนกดย้อนกลับจากหน้าใน แถวในแถบข้าง
 * จะหดหายเข้าไปในก้อนที่สูงศูนย์แทนที่จะครอสเฟด
 */
function SubGroupTile({ item }: { item: ModuleItem }) {
  const [open, setOpen] = useState(true);
  const children = item.children ?? [];
  const listId = `home-sub-${item.id}`;

  return (
    <>
      <ViewTransition name={`menu-${item.id}`} share="menu-morph" default="none">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((v) => !v)}
          className="home-row group flex w-full cursor-pointer items-center gap-3.5 rounded-[18px] p-[clamp(6px,1vh,16px)] text-left"
        >
          <span className="tone-soft grid size-[clamp(34px,4.6vh,48px)] shrink-0 place-items-center rounded-[14px]">
            <item.icon size={20} strokeWidth={1.8} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[clamp(14px,2vh,16px)] font-semibold">{item.label}</span>
            <span className="block truncate text-13 text-mut [@media(max-height:820px)]:hidden">
              {item.desc}
            </span>
          </span>
          <span className="tone-soft shrink-0 rounded-full px-2.5 py-0.5 text-11-5 font-semibold tabular-nums">
            {children.length} เมนู
          </span>
          <ChevronDown
            size={18}
            strokeWidth={1.8}
            aria-hidden
            className={`shrink-0 text-mut/70 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          />
        </button>
      </ViewTransition>

      {open ? (
        <ul
          id={listId}
          className="home-sub mt-1 ml-[calc(clamp(6px,1vh,16px)_+_clamp(34px,4.6vh,48px)_/_2)] flex animate-lift-in flex-col gap-1 border-l-2 border-dashed pl-3"
        >
          {children.map((child) => {
            return (
              <li key={child.id}>
                <ViewTransition name={`menu-${child.id}`} share="menu-morph" default="none">
                  <Link
                    href={child.href}
                    transitionTypes={["nav-forward"]}
                    className="home-row group flex items-center gap-3 rounded-[14px] px-2.5 py-[clamp(4px,0.8vh,10px)]"
                  >
                    <span className="tone-soft grid size-[clamp(28px,3.6vh,36px)] shrink-0 place-items-center rounded-[11px]">
                      <child.icon size={16} strokeWidth={1.8} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[clamp(13px,1.8vh,15px)] font-semibold">
                        {child.label}
                      </span>
                      <span className="block truncate text-12 text-mut [@media(max-height:820px)]:hidden">
                        {child.desc}
                      </span>
                    </span>
                    <Badge id={child.id}>
                      {(badge) => (
                        <span
                          title={badge.label}
                          className={`chip ${BADGE_CHIP[badge.tone]} shrink-0 px-2 tabular-nums`}
                        >
                          {badgeCount(badge)}
                        </span>
                      )}
                    </Badge>
                    <ArrowRight
                      size={17}
                      strokeWidth={1.8}
                      aria-hidden
                      className="home-row-arrow shrink-0 text-mut/60"
                    />
                  </Link>
                </ViewTransition>
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
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
  const current = MODULES.find((g) => g.id === activeId) ?? MODULES[0];

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
          className="grid shrink-0 grid-cols-3 gap-1 rounded-full border border-line bg-base-100 p-1 elev-card"
        >
          {MODULES.map((g) => {
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
      ) : (
        <Badge id={item.id}>
          {(badge) => (
            <span className="absolute -top-1.5 -right-1.5 min-w-5 rounded-full bg-alert px-1.5 py-px text-center text-10 font-bold text-ink-content ring-2 ring-base-100">
              {badgeCount(badge)}
            </span>
          )}
        </Badge>
      )}
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
 * เมนูที่มี subgroup บนมือถือ — ไอคอนแอปแบบโฟลเดอร์ (มุมขวาบอกจำนวนเมนูย่อย)
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
          <span className="tone-soft absolute -top-1.5 -right-1.5 min-w-5 rounded-full px-1.5 py-px text-center text-10 font-bold ring-2 ring-base-100">
            {children.length}
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
                          <Badge id={child.id}>
                            {(badge) => <span className={`chip ${BADGE_CHIP[badge.tone]} shrink-0`}>{badge.label}</span>}
                          </Badge>
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
    <header className="relative z-40 flex w-full animate-fade-in items-center justify-between gap-3 px-4 pt-[clamp(8px,1.6vh,24px)] sm:px-8 lg:px-[clamp(24px,5vw,72px)]">
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
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL.filter((e) => !e.item.soon).slice(0, 6);
    return ALL.filter(({ group, item, parent }) =>
      `${item.label} ${item.desc} ${parent?.label ?? ""} ${group.label}`.toLowerCase().includes(q),
    );
  }, [query]);

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
