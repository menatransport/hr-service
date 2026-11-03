"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Bell, ChevronRight } from "lucide-react";

import { exitText, occupantName, thaiDate, type BoardOccupant, type BoardRoom } from "@/lib/rentals/types";

/**
 * กระดิ่ง “ผู้พักพ้นสภาพแล้ว ยังไม่บันทึกย้ายออก” บนหัวหน้าห้องเช่า — แทนกล่องแจ้งเตือนเต็มแถบ
 *
 * - มีรายการที่ยังไม่เคยเปิดดู = กระดิ่งสั่น + จุดแดงกระเพื่อม + ป้าย “ใหม่” ในรายการ
 * - เปิดแผงแล้ว = ถือว่าเห็นแล้ว (เก็บในเครื่อง · localStorage) ตัวเลขยังอยู่จนกว่าจะบันทึกย้ายออก
 * - กุญแจรายการ = `stayId:วันออก` — คนเดิมที่วันออกเปลี่ยน (ทะเบียนแก้วัน) นับเป็นรายการใหม่
 *
 * ใช้ท่าอ่าน localStorage แบบเดียวกับ `components/desk/notification-bell.tsx`
 */

const STORAGE_KEY = "hrs.rentals.exits.seen";

export interface ExitAlert {
  r: BoardRoom;
  o: BoardOccupant;
}

const keyOf = ({ o }: ExitAlert) => `${o.stay.id}:${o.person?.exit?.on ?? ""}`;

const listeners = new Set<() => void>();
function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}
function snapshot(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
/** เรนเดอร์ฝั่งเซิร์ฟเวอร์ = ยังไม่เห็นอะไรเลย — กระดิ่งเริ่มสั่น แล้วค่อยสงบตอน hydrate ถ้าเห็นครบแล้ว */
const serverSnapshot = () => null;

function parseSeen(raw: string | null): Set<string> {
  try {
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

/** เก็บเฉพาะกุญแจที่ยังอยู่ในรายการ — ไม่ให้ค่าเก่าสะสม */
function saveSeen(keys: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch {
    // เขียนไม่ได้ก็แค่สั่นต่อ — หน้าจอต้องไม่พัง
  }
  for (const l of listeners) l();
}

export function ExitAlertBell({ items, onOpenRoom }: { items: ExitAlert[]; onOpenRoom: (roomId: string) => void }) {
  const [open, setOpen] = useState(false);
  /** รายการที่ “ใหม่” ตอนเปิดแผง — ค้างป้ายไว้ให้เห็นจนปิดแผง แม้จะบันทึกว่าเห็นแล้ว */
  const [freshOnOpen, setFreshOnOpen] = useState<Set<string>>(new Set());
  const wrap = useRef<HTMLDivElement>(null);

  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const seen = useMemo(() => parseSeen(raw), [raw]);
  const fresh = items.filter((i) => !seen.has(keyOf(i)));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onPointer = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const toggle = () => {
    if (!open) {
      setFreshOnOpen(new Set(fresh.map(keyOf)));
      if (fresh.length) saveSeen(items.map(keyOf));
    }
    setOpen((v) => !v);
  };

  const ringing = fresh.length > 0;
  const label = items.length
    ? `ผู้พักพ้นสภาพ ยังไม่บันทึกย้ายออก ${items.length} คน${ringing ? ` · ใหม่ ${fresh.length}` : ""}`
    : "ไม่มีผู้พักที่พ้นสภาพค้างอยู่";

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        title={label}
        className={`group relative grid size-10 cursor-pointer place-items-center rounded-full border transition-colors ${
          items.length
            ? "border-alert/35 bg-alert/[0.06] text-alert hover:bg-alert/10"
            : "border-line text-mut hover:border-primary/40 hover:text-primary"
        } ${open ? "ring-2 ring-alert/25" : ""}`}
      >
        <Bell
          size={18}
          strokeWidth={1.8}
          aria-hidden
          className={`origin-top ${ringing && !open ? "animate-bell-ring" : "transition-transform duration-300 group-hover:-rotate-12"}`}
        />
        {items.length ? (
          <span aria-hidden className="absolute -top-1 -right-1 flex">
            {ringing ? <span className="absolute inset-0 animate-ping rounded-full bg-alert opacity-50" /> : null}
            <span className="relative grid h-4.5 min-w-4.5 place-items-center rounded-full bg-alert px-1 text-10-5 leading-none font-semibold text-white tabular-nums ring-2 ring-base-100">
              {items.length}
            </span>
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="ผู้พักพ้นสภาพแล้ว ยังไม่บันทึกย้ายออก"
          className="animate-rise absolute top-full right-0 z-50 mt-2 w-[min(92vw,400px)] overflow-hidden rounded-box border border-line bg-base-100 shadow-xl"
        >
          <div className="border-b border-line px-4 pt-3 pb-2.5">
            <p className="text-13-5 font-semibold">ผู้พักพ้นสภาพแล้ว ยังไม่บันทึกย้ายออก</p>
            <p className="text-11-5 text-mut">ซิงก์จากทะเบียนประวัติ + สถานะงานรายวัน (ลอ ลาออก · ปอ ปลดออก)</p>
          </div>
          {items.length ? (
            <ul className="max-h-[min(60vh,420px)] divide-y divide-line/70 overflow-y-auto">
              {items.map((i) => {
                const isNew = freshOnOpen.has(keyOf(i));
                return (
                  <li key={i.o.stay.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        onOpenRoom(i.r.room.id);
                      }}
                      className="group/item flex w-full cursor-pointer items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-soft"
                    >
                      <span
                        aria-hidden
                        className={`mt-1.5 size-2 flex-none rounded-full ${isNew ? "bg-alert" : "bg-line-strong"}`}
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-13">
                          <span className="font-medium">{occupantName(i.o)}</span>
                          <span className="font-mono text-11-5 text-mut">{i.o.stay.drivercode}</span>
                          {isNew ? <span className="chip chip-alert px-1.5 py-0 text-10-5">ใหม่</span> : null}
                        </span>
                        <span className="text-12 font-semibold text-alert">{exitText(i.o.person?.exit ?? null)}</span>
                        <span className="truncate text-11-5 text-mut">
                          {i.r.apartment.name} · ห้อง {i.r.room.roomNo}
                          {i.o.stay.checkIn ? ` · เข้าพัก ${thaiDate(i.o.stay.checkIn)}` : ""}
                        </span>
                        {i.o.person?.exit?.source === "work" ? (
                          <span className="text-11 text-mut">ยังไม่ได้บันทึกพ้นสภาพในทะเบียน</span>
                        ) : null}
                      </span>
                      <ChevronRight
                        size={14}
                        aria-hidden
                        className="mt-1 flex-none text-mut transition-transform group-hover/item:translate-x-0.5"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-13 text-mut">ไม่มีผู้พักที่พ้นสภาพค้างอยู่ในเดือนนี้</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
