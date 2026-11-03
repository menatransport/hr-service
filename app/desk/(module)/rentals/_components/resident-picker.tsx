"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, LoaderCircle, Search, X } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { requestJson } from "@/lib/http";
import type { DriverPick } from "@/app/recruitment/_lib/drivers/types";

/**
 * เลือก พจส. หนึ่งคนจาก **ทะเบียนประวัติเท่านั้น** (`GET /api/drivers/picker`) — ไม่มีช่องพิมพ์ชื่อคนนอก
 * · เฉพาะคนที่ยังปฏิบัติงาน · ค้นด้วยรหัส/ชื่อ/แพล้นท์ · รายชื่อโหลดครั้งเดียวต่อแท็บ
 */

let picksCache: Promise<DriverPick[]> | null = null;
function loadPicks(): Promise<DriverPick[]> {
  picksCache ??= requestJson<DriverPick[]>("/api/drivers/picker", {}, "โหลดรายชื่อ พจส. ไม่สำเร็จ").catch((err) => {
    picksCache = null;
    throw err;
  });
  return picksCache;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
const LIMIT = 30;

export function ResidentPicker({
  value,
  onChange,
  exclude = [],
}: {
  value: DriverPick | null;
  onChange: (p: DriverPick | null) => void;
  /** รหัสที่เลือกไม่ได้ (พักอยู่ห้องนี้แล้ว) */
  exclude?: string[];
}) {
  const [picks, setPicks] = useState<DriverPick[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    loadPicks()
      .then((rows) => alive && setPicks(rows.filter((p) => p.active)))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, []);

  const results = useMemo(() => {
    if (!picks) return [];
    const needle = norm(q);
    const pool = picks.filter((p) => !exclude.includes(p.code));
    if (!needle) return pool.slice(0, LIMIT);
    return pool
      .filter((p) => norm(`${p.code} ${p.name} ${p.plant} ${p.customer}`).includes(needle))
      .slice(0, LIMIT);
  }, [picks, q, exclude]);

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-field border border-primary/40 bg-soft/50 px-3 py-2.5">
        <Avatar name={value.name} src={value.photoUrl || null} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-13-5 font-medium">{value.name}</p>
          <p className="truncate text-11-5 text-mut">
            {[value.code, value.position, value.customer, value.plant].filter(Boolean).join(" · ")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setQ("");
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          aria-label="เปลี่ยนคน"
          className="grid size-8 place-items-center rounded-full text-mut hover:bg-base-200 hover:text-ink"
        >
          <X size={15} aria-hidden />
        </button>
      </div>
    );
  }

  const pick = (p: DriverPick) => {
    onChange(p);
    setOpen(false);
  };

  return (
    <div className="relative">
      <label className="field-ring flex items-center gap-2.5 rounded-field border border-line bg-base-100 px-3.5 py-2.5 focus-within:border-primary/60">
        {picks === null && !error ? (
          <LoaderCircle size={16} className="flex-none animate-spin text-mut" aria-hidden />
        ) : (
          <Search size={16} strokeWidth={1.6} className="flex-none text-mut" aria-hidden />
        )}
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setCursor(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            } else if (e.key === "Enter" && results[cursor]) {
              e.preventDefault();
              pick(results[cursor]);
            }
          }}
          role="combobox"
          aria-expanded={open}
          aria-controls="resident-picker-list"
          aria-label="ค้นหา พจส. จากทะเบียนประวัติ"
          placeholder="ค้นหารหัส ชื่อ หรือแพล้นท์ของ พจส.…"
          className="min-w-0 flex-1 bg-transparent text-13-5 outline-none placeholder:text-mut"
        />
      </label>
      {error ? <p className="mt-1 text-12 text-alert">{error}</p> : null}
      {open && picks ? (
        <ul
          id="resident-picker-list"
          role="listbox"
          className="elev-pop absolute inset-x-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-box border border-line bg-base-100 py-1"
        >
          {results.length ? (
            results.map((p, i) => (
              <li key={p.code} role="option" aria-selected={i === cursor}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(p)}
                  onMouseEnter={() => setCursor(i)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left ${i === cursor ? "bg-soft" : ""}`}
                >
                  <Avatar name={p.name} src={p.photoUrl || null} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-13">{p.name}</span>
                    <span className="block truncate text-11-5 text-mut">
                      {[p.code, p.position, p.customer, p.plant].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {i === cursor ? <Check size={14} aria-hidden className="flex-none text-primary" /> : null}
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-3 text-12-5 text-mut">ไม่พบ พจส. ที่ยังปฏิบัติงานตามคำค้น</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
