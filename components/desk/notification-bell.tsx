"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Bell, Check, ChevronRight, History } from "lucide-react";

import { toneDot, type DeskNotification } from "@/lib/notifications";

/**
 * คีย์เก็บสถานะการอ่านใน localStorage — NCAC ยังไม่มี endpoint สถานะการอ่าน
 * มี auth เมื่อไหร่ให้ต่อท้ายด้วย employeeId ไม่งั้นคนละคนบนเครื่องเดียวกันจะเห็นค่าปนกัน
 */
const STORAGE_KEY = "hrs.desk.notifications.read";

/** `{ [id]: stamp }` — เทียบ stamp ด้วย ไม่ใช่แค่มี id เพราะเคสเดิมอาจขยับใหม่ */
type ReadMap = Record<string, string>;

const EMPTY: ReadMap = {};

function parseRead(raw: string | null): ReadMap {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return EMPTY;
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (e): e is [string, string] => typeof e[1] === "string",
      ),
    );
  } catch {
    // ค่าเสีย/ของเวอร์ชันเก่า — ถือว่ายังไม่เคยอ่าน ดีกว่าพัง
    return EMPTY;
  }
}

/* ---- localStorage เป็น external store: อ่านผ่าน useSyncExternalStore ----
   คืนค่าเป็น "สตริงดิบ" เพื่อให้ snapshot เท่าเดิมทุกครั้งที่ค่าไม่เปลี่ยน
   (คืน object ใหม่ทุกรอบจะทำให้ React re-render ไม่รู้จบ) */

const listeners = new Set<() => void>();

function subscribeRead(onChange: () => void) {
  listeners.add(onChange);
  // `storage` ยิงเฉพาะแท็บอื่น — แท็บตัวเองต้องปลุกเองผ่าน listeners
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readSnapshot(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // โหมดส่วนตัว / ถูกบล็อก
    return null;
  }
}

/** ฝั่งเซิร์ฟเวอร์ไม่รู้จักเครื่องผู้ใช้ — เรนเดอร์แรกจึงถือว่ายังไม่อ่านทั้งหมด */
function serverSnapshot(): string | null {
  return null;
}

/** เขียนกลับเฉพาะ id ที่ยังอยู่ในรายการ — กันไม่ให้ค่าเก่าค้างสะสมไม่รู้จบ */
function saveRead(next: ReadMap, live: DeskNotification[]) {
  const pruned: ReadMap = {};
  for (const n of live) {
    const stamp = next[n.id];
    if (stamp !== undefined) pruned[n.id] = stamp;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
  } catch {
    // เขียนไม่ได้ (โควตาเต็ม/ถูกบล็อก) ก็ปล่อย — อย่างน้อยหน้าจอต้องไม่พัง
  }
  for (const l of listeners) l();
}

/**
 * กระดิ่งแจ้งเตือน — รายการถูกคำนวณจากเคสจริงใน `lib/notifications.ts`
 * ฝั่งเซิร์ฟเวอร์ (topbar) แล้วส่งเข้ามาเป็น prop
 *
 * “อ่านแล้ว” เก็บที่เครื่องผู้ใช้ (localStorage) จึงอยู่ข้ามการรีเฟรชและซิงก์ข้ามแท็บ
 * เรนเดอร์แรกตรงกับ HTML ฝั่งเซิร์ฟเวอร์ (ยังไม่อ่านทั้งหมด) แล้ว React ค่อยสลับ
 * เป็นค่าจริงตอน hydrate — จึงไม่ต้อง setState ใน effect และไม่เกิด hydration mismatch
 */
export function NotificationBell({ items }: { items: DeskNotification[] }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const raw = useSyncExternalStore(subscribeRead, readSnapshot, serverSnapshot);
  const read = useMemo(() => parseRead(raw), [raw]);

  const unread = items.filter((n) => read[n.id] !== n.stamp);

  /** กดอ่าน = เขียนลง localStorage — ถ้าเขียนไม่ได้ก็จะไม่ขึ้นว่าอ่านแล้ว (ไม่โกหก) */
  const markRead = useCallback(
    (ids: string[]) => {
      const next = { ...read };
      for (const id of ids) {
        const stamp = items.find((n) => n.id === id)?.stamp;
        if (stamp !== undefined) next[id] = stamp;
      }
      saveRead(next, items);
    },
    [items, read],
  );

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={
          unread.length
            ? `การแจ้งเตือน ${unread.length} รายการที่ยังไม่อ่าน`
            : "การแจ้งเตือน"
        }
        className={`group relative flex size-9 items-center justify-center rounded-selector transition-colors ${
          open ? "bg-base-200 text-ink" : "text-mut hover:bg-base-200 hover:text-ink"
        }`}
      >
        <Bell
          size={18}
          strokeWidth={1.6}
          aria-hidden
          className="transition-transform duration-300 group-hover:scale-115 group-hover:-rotate-12"
        />
        {unread.length ? (
          <span className="absolute top-1 right-1 flex size-2" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-alert opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-alert" />
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="การแจ้งเตือน"
          className="animate-rise absolute top-full right-0 z-50 mt-2 w-[min(92vw,360px)] overflow-hidden rounded-box border border-line bg-base-100/95 shadow-xl backdrop-blur-xl"
        >
          {/* เส้นไฮไลต์บางบนขอบ — ให้กล่องดูลอยจากพื้นหลัง */}
          <span
            aria-hidden
            className="block h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
          />

          <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
            <p className="text-[13.5px] font-semibold">การแจ้งเตือน</p>
            {unread.length ? (
              <button
                type="button"
                onClick={() => markRead(items.map((n) => n.id))}
                className="flex items-center gap-1 rounded-full px-2 py-1 text-[11.5px] text-mut transition-colors hover:bg-base-200 hover:text-ink"
              >
                <Check size={13} strokeWidth={1.8} aria-hidden />
                อ่านทั้งหมด
              </button>
            ) : null}
          </div>

          <ul className="max-h-[min(60vh,420px)] overflow-y-auto border-t border-line">
            {items.length === 0 ? (
              <li className="px-4 py-8 text-center text-[13px] text-mut">
                ยังไม่มีการแจ้งเตือน
              </li>
            ) : (
              items.map((n) => {
                const isRead = read[n.id] === n.stamp;
                const body = (
                  <>
                    <span
                      aria-hidden
                      className={`mt-1.5 size-1.5 flex-none rounded-full ${
                        isRead ? "bg-line" : toneDot[n.tone]
                      }`}
                    />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span
                        className={`text-pretty text-[13px] leading-snug ${
                          isRead ? "text-mut" : "font-medium text-ink"
                        }`}
                      >
                        {n.title}
                      </span>
                      <span className="text-[11.5px] text-mut">{n.meta}</span>
                    </span>
                  </>
                );

                return (
                  <li key={n.id} className="border-b border-line/70 last:border-0">
                    {n.href ? (
                      <Link
                        href={n.href}
                        role="menuitem"
                        onClick={() => {
                          markRead([n.id]);
                          setOpen(false);
                        }}
                        className="flex gap-2.5 px-4 py-3 transition-colors hover:bg-base-200"
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className="flex gap-2.5 px-4 py-3">{body}</div>
                    )}
                  </li>
                );
              })
            )}
          </ul>

          {/**
           * ทางเข้าหน้าประวัติการทำงาน — ย้ายมาจากเมนู “งานของฉัน” ในไซด์บาร์
           *
           * อยู่ **นอก `<ul>` ที่เลื่อนได้** จึงเห็นเสมอไม่ว่ารายการจะยาวแค่ไหน
           * และ **ไม่ได้เอาสองอย่างมารวมกัน** — รายการข้างบนคือ “ต้องทำอะไรต่อ”
           * ส่วนลิงก์นี้พาไป “เกิดอะไรขึ้นแล้ว” (รวมคำร้องที่ถูกลบ) ซึ่งเป็นคนละเรื่อง
           * เลขบนกระดิ่งจึงยังไม่นับรายการในหน้านั้น
           */}
          <Link
            href="/desk/activity"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="group flex items-center gap-2.5 border-t border-line px-4 py-2.5 text-[12.5px] text-mut transition-colors hover:bg-base-200 hover:text-ink"
          >
            <History size={15} strokeWidth={1.7} aria-hidden className="flex-none" />
            <span className="flex-1">ประวัติการทำงานทั้งหมด</span>
            <ChevronRight
              size={14}
              strokeWidth={1.8}
              aria-hidden
              className="flex-none transition-transform duration-200 group-hover:translate-x-0.5"
            />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
