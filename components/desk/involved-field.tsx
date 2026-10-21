"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Popover as RPopover } from "radix-ui";
import { Check, LoaderCircle, Search, UserRound, UserRoundPlus, X } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Frame, box, type FieldBase } from "@/components/ui/field";
import { requestJson } from "@/lib/http";
import { involvedKey, type InvolvedPerson } from "@/lib/record-case-flow";
import type { DriverPick } from "@/app/recruitment/_lib/drivers/types";

/**
 * ช่อง “ผู้เกี่ยวข้อง” ของบันทึกเคส — **เลือกได้หลายคน** จากทะเบียนประวัติ พจส.
 *
 * พิมพ์รหัสหรือชื่อ → รายการ พจส. ขึ้นใต้ช่อง (รูป · ชื่อ · รหัส · แพล้นท์/ลูกค้า) → กดเพื่อเลือก
 * /ถอน รายการยังเปิดค้างให้เลือกคนถัดไปต่อได้ · คนที่เลือกแล้วเป็นชิป `รหัส ชื่อ` ในช่อง
 *
 * - **คนนอกทะเบียนยังใส่ได้** (คู่กรณี/บุคคลภายนอก) ผ่านแถวท้ายรายการ “เพิ่ม … เป็นบุคคลภายนอก”
 *   — ชิปขอบประ ไม่มีรหัส แยกออกจากคนในทะเบียนได้ด้วยตา
 * - **คนพ้นสภาพยังเลือกได้** (เคสวินัยมักย้อนหลัง) แต่ขึ้นท้ายและมีป้าย “พ้นสภาพ”
 * - รายชื่อโหลดครั้งแรกที่โฟกัสช่อง (`GET /api/drivers/picker`) แล้วจำไว้ทั้งแท็บ
 *   — เปิดฟอร์มซ้ำไม่ยิงซ้ำ · โหลดพังก็ยังใส่ชื่อคนนอกได้ และมีปุ่มลองใหม่
 *
 * คีย์บอร์ด: ↑/↓ เลื่อน · Enter เลือก · Esc ปิด · Backspace ตอนช่องว่าง = ถอนคนล่าสุด
 */

/** จำรายชื่อไว้ทั้งแท็บ — รายชื่อ พจส. ไม่ได้เปลี่ยนระหว่างกรอกฟอร์ม */
let picksCache: Promise<DriverPick[]> | null = null;

function loadPicks(): Promise<DriverPick[]> {
  picksCache ??= requestJson<DriverPick[]>(
    "/api/drivers/picker",
    {},
    "โหลดรายชื่อ พจส. ไม่สำเร็จ",
  ).catch((err) => {
    picksCache = null; // ให้ลองใหม่ได้
    throw err;
  });
  return picksCache;
}

/** แสดงผลลัพธ์ไม่เกินนี้ — ทะเบียนราวพันคน ถ้าวาดหมดรายการจะยาวจนหาไม่เจออยู่ดี */
const RESULT_LIMIT = 40;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/** คำนำหน้าชื่อที่ไม่ควรนับเป็น “ขึ้นต้นด้วย” เวลาเรียงผลค้นหา */
const TITLE_PREFIX = /^(นาย|นางสาว|นาง|น\.ส\.|mr\.?|mrs\.?|ms\.?)/;

/** อันดับความตรง — น้อย = ตรงกว่า · `null` = ไม่ตรงเลย */
function rank(p: DriverPick, q: string): number | null {
  const code = p.code.toLowerCase();
  const name = norm(p.name);
  if (code === q) return 0;
  if (code.startsWith(q)) return 1;
  if (name.replace(TITLE_PREFIX, "").startsWith(q)) return 2;
  if (name.includes(q)) return 3;
  if (code.includes(q)) return 4;
  return null;
}

export function InvolvedField({
  value,
  onChange,
  max,
  placeholder = "ค้นหารหัสหรือชื่อ พจส.…",
  ...frame
}: FieldBase & {
  value: InvolvedPerson[];
  onChange: (v: InvolvedPerson[]) => void;
  max: number;
  placeholder?: string;
}) {
  const { id, readOnly } = frame;
  const listId = useId();
  const anchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [picks, setPicks] = useState<DriverPick[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const full = value.length >= max;
  const chosen = useMemo(() => new Set(value.map(involvedKey)), [value]);

  function ensureLoaded() {
    if (picks) return;
    setLoadError(null);
    loadPicks()
      .then(setPicks)
      .catch((err: unknown) =>
        setLoadError(err instanceof Error ? err.message : "โหลดรายชื่อ พจส. ไม่สำเร็จ"),
      );
  }

  const q = norm(query);
  const { results, total } = useMemo(() => {
    if (!picks || !q) return { results: [] as DriverPick[], total: 0 };
    const hits: { p: DriverPick; r: number }[] = [];
    for (const p of picks) {
      const r = rank(p, q);
      if (r !== null) hits.push({ p, r });
    }
    /* คนที่ยังปฏิบัติงานก่อนเสมอ แล้วค่อยตามความตรง — `picks` เรียงรหัสมาแล้ว sort นี้ stable */
    hits.sort((a, b) => Number(b.p.active) - Number(a.p.active) || a.r - b.r);
    return { results: hits.slice(0, RESULT_LIMIT).map((h) => h.p), total: hits.length };
  }, [picks, q]);

  /* แถว “เพิ่มเป็นบุคคลภายนอก” — เฉพาะตอนพิมพ์ชื่อที่ยังไม่ได้ใส่ และไม่ใช่รหัสที่ตรงคนในทะเบียนพอดี */
  const outsiderName = query.trim();
  const showOutsider =
    Boolean(outsiderName) &&
    !full &&
    !chosen.has(outsiderName.toLowerCase()) &&
    !results.some((p) => p.code.toLowerCase() === q || norm(p.name) === q);

  const optionCount = results.length + (showOutsider ? 1 : 0);

  /* เลื่อนแถวที่ไฮไลต์ให้อยู่ในจอเวลาไล่ด้วยลูกศร */
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function toggle(p: DriverPick) {
    const key = involvedKey({ code: p.code, name: p.name });
    if (chosen.has(key)) {
      onChange(value.filter((v) => involvedKey(v) !== key));
    } else if (!full) {
      onChange([...value, { code: p.code, name: p.name }]);
      setQuery("");
      setActive(0);
    }
    inputRef.current?.focus();
  }

  function addOutsider() {
    if (!showOutsider) return;
    onChange([...value, { code: "", name: outsiderName }]);
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
  }

  function choose(index: number) {
    if (index < results.length) toggle(results[index]);
    else addOutsider();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      if (!optionCount) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + optionCount) % optionCount);
      return;
    }
    if (e.key === "Enter") {
      // ห้ามปล่อยให้ฟอร์มที่ครอบอยู่ submit
      e.preventDefault();
      if (optionCount) choose(Math.min(active, optionCount - 1));
      return;
    }
    if (e.key === "Escape" && open) {
      // ปิดแค่รายการ — ไม่ให้ Esc ทะลุไปปิดทั้งโมดัล
      e.stopPropagation();
      setOpen(false);
      return;
    }
    if (e.key === "Backspace" && !query && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  const activeId = open && optionCount ? `${listId}-${Math.min(active, optionCount - 1)}` : undefined;

  return (
    <Frame
      {...frame}
      labelRight={
        value.length ? (
          <span className="text-11-5 text-mut tabular-nums">
            {value.length}/{max} คน
          </span>
        ) : null
      }
    >
      <RPopover.Root open={open && !readOnly && !full} onOpenChange={setOpen}>
        <RPopover.Anchor asChild>
          <div
            ref={anchorRef}
            onMouseDown={(e) => {
              // กดตรงที่ว่างในกล่อง = โฟกัสช่องพิมพ์ (ไม่ใช่แค่ตัว input เล็ก ๆ)
              if (e.target === e.currentTarget) {
                e.preventDefault();
                inputRef.current?.focus();
              }
            }}
            className={`${box} rounded-field px-2 py-1.5 text-13-5 ${
              readOnly
                ? "border-line bg-base-200"
                : "field-ring cursor-text border-line hover:border-primary/40 focus-within:border-primary/60"
            } flex min-h-[2.75rem] flex-wrap items-center gap-1.5`}
          >
            {value.map((p) => (
              <Chip
                key={involvedKey(p)}
                person={p}
                onRemove={
                  readOnly ? undefined : () => onChange(value.filter((v) => v !== p))
                }
              />
            ))}

            {readOnly ? null : full ? (
              <span className="px-1.5 text-12 text-mut">ครบ {max} คนแล้ว</span>
            ) : (
              <span className="flex min-w-[14ch] flex-1 items-center gap-2 px-1.5">
                {value.length ? null : (
                  <Search size={15} strokeWidth={1.8} aria-hidden className="flex-none text-mut" />
                )}
                <input
                  ref={inputRef}
                  id={id}
                  type="text"
                  role="combobox"
                  autoComplete="off"
                  aria-expanded={open}
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-activedescendant={activeId}
                  value={query}
                  onFocus={() => {
                    ensureLoaded();
                    setOpen(true);
                  }}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                    setOpen(true);
                  }}
                  onKeyDown={onKeyDown}
                  placeholder={value.length ? "เพิ่มอีก…" : placeholder}
                  className="min-w-0 flex-1 bg-transparent py-1 outline-none placeholder:text-mut"
                />
              </span>
            )}
          </div>
        </RPopover.Anchor>

        <RPopover.Portal>
          <RPopover.Content
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={12}
            /* โฟกัสต้องอยู่ที่ช่องพิมพ์ตลอด — รายการเป็นแค่ข้อเสนอใต้ช่อง */
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onInteractOutside={(e) => {
              if (anchorRef.current?.contains(e.target as Node)) e.preventDefault();
            }}
            style={{
              width: "var(--radix-popper-anchor-width)",
              maxHeight: "min(360px, var(--radix-popper-available-height))",
            }}
            /* z-60 เหมือน dropdown อื่นใน `field.tsx` — ต่ำกว่านี้ไปอยู่ใต้โมดัลของ /desk */
            className="z-60 flex flex-col overflow-hidden rounded-box border border-line bg-base-100 shadow-[0_18px_40px_-16px_rgba(21,32,29,0.4)]"
          >
            <ListHead
              loading={!picks && !loadError}
              error={loadError}
              onRetry={ensureLoaded}
              query={q}
              total={total}
              registrySize={picks?.length ?? 0}
            />

            {optionCount ? (
              <ul
                ref={listRef}
                id={listId}
                role="listbox"
                aria-multiselectable
                aria-label="รายชื่อ พจส."
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1"
              >
                {results.map((p, i) => {
                  const on = chosen.has(involvedKey({ code: p.code, name: p.name }));
                  return (
                    <li
                      key={p.code}
                      id={`${listId}-${i}`}
                      data-index={i}
                      role="option"
                      aria-selected={on}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseMove={() => active !== i && setActive(i)}
                      onClick={() => toggle(p)}
                      className={`mx-1 flex cursor-pointer items-center gap-3 rounded-field px-2.5 py-2 transition-colors ${
                        i === active ? "bg-soft" : ""
                      }`}
                    >
                      <Avatar
                        name={p.name}
                        src={p.photoUrl || null}
                        size="sm"
                        tone={p.active ? "default" : "alert"}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-13 font-medium text-ink">
                            <Mark text={p.name} query={query} />
                          </span>
                          {p.active ? null : (
                            <span className="flex-none rounded-full border border-alert/30 px-1.5 text-10-5 text-alert">
                              พ้นสภาพ
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-11-5 text-mut">
                          <span className="flex-none font-mono text-primary">
                            <Mark text={p.code} query={query} />
                          </span>
                          {[p.plant, p.customer].filter(Boolean).length ? (
                            <span className="truncate">
                              · {[p.plant, p.customer].filter(Boolean).join(" · ")}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <span
                        aria-hidden
                        className={`flex size-5 flex-none items-center justify-center rounded-full border transition-colors ${
                          on
                            ? "border-primary bg-primary text-primary-content"
                            : "border-line text-transparent"
                        }`}
                      >
                        <Check size={12} strokeWidth={3} />
                      </span>
                    </li>
                  );
                })}

                {showOutsider ? (
                  <li
                    id={`${listId}-${results.length}`}
                    data-index={results.length}
                    role="option"
                    aria-selected={false}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseMove={() => active !== results.length && setActive(results.length)}
                    onClick={addOutsider}
                    className={`mx-1 flex cursor-pointer items-center gap-3 rounded-field px-2.5 py-2 transition-colors ${
                      results.length ? "mt-1 border-t border-line/70 pt-2.5" : ""
                    } ${active === results.length ? "bg-soft" : ""}`}
                  >
                    <span className="flex size-8 flex-none items-center justify-center rounded-full border border-dashed border-primary/40 text-primary">
                      <UserRoundPlus size={15} strokeWidth={1.8} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 text-13">
                      เพิ่ม <span className="font-medium text-ink">“{outsiderName}”</span>
                      <span className="block text-11-5 text-mut">เป็นบุคคลภายนอก (ไม่มีในทะเบียน)</span>
                    </span>
                  </li>
                ) : null}
              </ul>
            ) : null}

            {total > RESULT_LIMIT ? (
              <p className="border-t border-line/70 px-3.5 py-2 text-11-5 text-mut">
                แสดง {RESULT_LIMIT} จาก {total.toLocaleString("th-TH")} คน — พิมพ์เพิ่มเพื่อให้แคบลง
              </p>
            ) : null}
          </RPopover.Content>
        </RPopover.Portal>
      </RPopover.Root>
    </Frame>
  );
}

/** แถบบนสุดของรายการ — บอกสถานะ: กำลังโหลด / โหลดพัง / ยังไม่พิมพ์ / ผลค้นหา */
function ListHead({
  loading,
  error,
  onRetry,
  query,
  total,
  registrySize,
}: {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  query: string;
  total: number;
  registrySize: number;
}) {
  const row = "flex items-center gap-2 px-3.5 py-2.5 text-12 text-mut";

  if (error) {
    return (
      <div className={`${row} text-alert`} role="alert">
        <span className="min-w-0 flex-1">{error}</span>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onRetry}
          className="flex-none font-medium text-primary hover:underline"
        >
          ลองใหม่
        </button>
      </div>
    );
  }
  if (loading) {
    return (
      <div className={row}>
        <LoaderCircle size={14} strokeWidth={2} aria-hidden className="animate-spin" />
        กำลังโหลดรายชื่อ พจส.…
      </div>
    );
  }
  if (!query) {
    return (
      <div className={row}>
        <Search size={14} strokeWidth={1.8} aria-hidden className="flex-none" />
        <span>
          พิมพ์รหัสหรือชื่อเพื่อค้นหาจากทะเบียนประวัติ พจส.
          <span className="tabular-nums"> ({registrySize.toLocaleString("th-TH")} คน)</span>
        </span>
      </div>
    );
  }
  return (
    <div className="border-b border-line/70 px-3.5 py-2 text-11-5 text-mut">
      {total ? `พบ ${total.toLocaleString("th-TH")} คนในทะเบียน` : "ไม่พบในทะเบียน พจส."}
    </div>
  );
}

/** ชิปคนที่เลือกแล้ว — คนในทะเบียน: รหัส + ชื่อบนพื้นเขียวอ่อน · คนนอก: ขอบประ */
function Chip({ person, onRemove }: { person: InvolvedPerson; onRemove?: () => void }) {
  const outsider = !person.code;
  return (
    <span
      title={outsider ? `${person.name} (บุคคลภายนอก)` : `${person.code} ${person.name}`}
      className={`flex max-w-full items-center gap-1.5 rounded-full py-1 text-12 ${
        onRemove ? "pr-1" : "pr-2.5"
      } ${
        outsider
          ? "border border-dashed border-line pl-2 text-ink"
          : "bg-soft pl-2.5 text-primary"
      }`}
    >
      {outsider ? (
        <UserRound size={12} strokeWidth={1.9} aria-hidden className="flex-none text-mut" />
      ) : (
        <span className="flex-none font-mono text-11 text-primary/70">{person.code}</span>
      )}
      <span className="truncate">{person.name}</span>
      {onRemove ? (
        <button
          type="button"
          aria-label={`นำ ${person.name} ออก`}
          onClick={onRemove}
          className="flex size-4.5 flex-none items-center justify-center rounded-full opacity-60 transition hover:bg-primary/15 hover:opacity-100"
        >
          <X size={11} strokeWidth={2.2} aria-hidden />
        </button>
      ) : null}
    </span>
  );
}

/** ไฮไลต์คำที่ค้นในข้อความ (เทียบแบบไม่สนตัวพิมพ์) — ไม่เจอก็คืนข้อความเดิม */
function Mark({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  const at = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-[3px] bg-primary/15 font-semibold text-primary">{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}

/**
 * ผู้เกี่ยวข้องในแผงรายละเอียดเคส — ชิปหน้าตาเดียวกับในฟอร์ม
 * คนในทะเบียนกดแล้วไปหน้าประวัติ พจส. ได้เลย
 */
export function InvolvedList({ people }: { people: InvolvedPerson[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {people.map((p) => (
        <li key={involvedKey(p)} className="max-w-full">
          {p.code ? (
            <Link
              href={`/recruitment/admin/drivers/${encodeURIComponent(p.code)}`}
              className="block rounded-full transition-opacity hover:opacity-80"
            >
              <Chip person={p} />
            </Link>
          ) : (
            <Chip person={p} />
          )}
        </li>
      ))}
    </ul>
  );
}
