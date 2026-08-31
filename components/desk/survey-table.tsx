"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Inbox, ListFilter, RotateCw, Sparkles, X } from "lucide-react";

import { SurveyExportButton } from "@/components/desk/survey-export-button";
import { SearchField } from "@/components/ui/field";
import {
  COLUMN_BY_KEY,
  IDENTITY_COLUMN,
  SURVEY_COLUMNS,
  bangkokDateLabel,
  bangkokTimeLabel,
  type SurveyFilters,
} from "@/lib/survey-filter";
import { SURVEY_QUESTIONS, type SurveyResponse } from "@/lib/survey-forms";

/**
 * ตารางผลแบบสอบถามทรงสเปรดชีต — หัวตารางค้างไว้ทั้งแนวตั้งและแนวนอน
 * (`sticky top-0` สำหรับหัว, คอลัมน์แรก `sticky left-0` เพราะ 22 คอลัมน์
 * เลื่อนแล้วจะไม่รู้ว่ากำลังอ่านแถวของใคร)
 *
 * ตัวกรองต่อคอลัมน์เป็น checkbox ที่ **เริ่มต้นไม่ติ๊กอะไรเลย = ไม่กรอง** ตามที่
 * ตกลงไว้ (ต่างจาก Excel ที่ติ๊กหมดตั้งแต่แรก) — ผู้ใช้ติ๊กเฉพาะค่าที่อยากเห็น
 *
 * **นิยามคอลัมน์กับกฎการกรองอยู่ที่ `lib/survey-filter.ts`** ไม่ใช่ที่นี่ เพราะเส้น
 * ส่งออก Excel ต้องกรองด้วยกฎชุดเดียวกัน ที่เหลือในไฟล์นี้คือวิธีวาดเซลล์ (JSX)
 * ซึ่ง import จากฝั่งเซิร์ฟเวอร์ไม่ได้
 *
 * กล่องตัวกรองวางด้วย `position: fixed` จากพิกัดของปุ่ม ไม่ใช่ absolute ในตาราง
 * เพราะกล่อง scroll ของตารางจะตัดมันหายไปครึ่งใบ
 */

type SortDir = "asc" | "desc";

const TEXT_SORT_LABELS = { asc: "เรียง ก → ฮ", desc: "เรียง ฮ → ก" };

const POPOVER_WIDTH = 268;

/**
 * วิธีวาดเซลล์เฉพาะคอลัมน์ที่ต้องมีอะไรมากกว่าข้อความ — คอลัมน์ที่ไม่อยู่ในนี้
 * ใช้ `values()` ต่อด้วย “ · ” ตามปกติ
 */
const CELL: Record<string, (r: SurveyResponse) => React.ReactNode> = {
  submittedAt: (r) =>
    r.submittedAt ? (
      <span className="flex flex-col leading-tight">
        <span>{bangkokDateLabel(r.submittedAt)}</span>
        <span className="text-[11px] text-mut">{bangkokTimeLabel(r.submittedAt)} น.</span>
      </span>
    ) : (
      <span className="text-mut">—</span>
    ),
  attending: (r) =>
    r.attending === null ? (
      <span className="text-mut">—</span>
    ) : (
      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-[11.5px] font-medium ${
          r.attending ? "bg-soft text-primary" : "bg-sla/10 text-sla"
        }`}
      >
        {r.attending ? "มา" : "ไม่สะดวก"}
      </span>
    ),
};

function cellOf(key: string, r: SurveyResponse): React.ReactNode {
  const custom = CELL[key];
  if (custom) return custom(r);

  const column = COLUMN_BY_KEY.get(key);
  const list = column?.values(r) ?? [];
  if (!list.length || list[0] === "—") return <span className="text-mut">—</span>;

  if (column?.kind === "rank") {
    const full = r.answers[key] ?? [];
    return (
      <span className="flex flex-col leading-tight">
        <span>{full[0]}</span>
        <span className="text-[11px] text-mut">อันดับ 1 จาก {full.length}</span>
      </span>
    );
  }

  return <span className="line-clamp-2 text-pretty">{list.join(" · ")}</span>;
}

const COLUMNS = SURVEY_COLUMNS;
const SORTABLE = COLUMN_BY_KEY;

/* ------------------------------------------------------------------ ของที่เพิ่งเข้ามา */

const FRESH_MS = 60 * 60 * 1000; // 1 ชั่วโมง
const TICK_MS = 60 * 1000;

/**
 * เวลาปัจจุบัน ปัดลงเป็นนาที — `null` เสมอตอน render ฝั่งเซิร์ฟเวอร์
 *
 * ค่าที่ขยับทุกวินาทีทำให้ HTML ฝั่งเซิร์ฟเวอร์กับตอน hydrate ไม่ตรงกัน (เหตุผล
 * เดียวกับที่ `isNewCase()` ใน `lib/case-flow.ts` เลือกนับเป็นวันแทนชั่วโมง) —
 * ที่นี่ต้องละเอียดระดับชั่วโมงจริง ๆ จึงใช้ `useSyncExternalStore` แล้วให้ snapshot
 * ฝั่งเซิร์ฟเวอร์เป็น `null` ป้าย “ใหม่” จึงโผล่หลัง hydrate เท่านั้น ไม่มีวันไม่ตรงกัน
 *
 * ปัดลงเป็นนาทีเพื่อให้ `getSnapshot()` คืนค่าเดิมภายในนาทีเดียวกัน — ถ้าคืน
 * `Date.now()` ดิบ React จะมองว่าค่าเปลี่ยนทุกครั้งที่อ่านแล้ว re-render ไม่จบ
 */
function useMinuteNow(): number | null {
  return useSyncExternalStore(
    (onChange) => {
      const t = setInterval(onChange, TICK_MS);
      return () => clearInterval(t);
    },
    () => Math.floor(Date.now() / TICK_MS) * TICK_MS,
    () => null,
  );
}

export function SurveyTable({
  responses,
  surveyId,
}: {
  responses: SurveyResponse[];
  surveyId: string;
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState("submittedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  /** คอลัมน์ → ค่าที่ติ๊กไว้ · ไม่มี key = ไม่กรองคอลัมน์นั้น */
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  /** กล่องกรองที่กางอยู่ + พิกัดของปุ่มที่กด (วัดตอนคลิก) */
  const [openFilter, setOpenFilter] = useState<
    { key: string; top: number; left: number } | null
  >(null);
  const [detail, setDetail] = useState<SurveyResponse | null>(null);

  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const now = useMinuteNow();

  /** เพิ่งตอบเข้ามาไม่เกิน 1 ชั่วโมง — `now === null` ตอน SSR จึงยังไม่มีป้ายใคร */
  const isFresh = (r: SurveyResponse) =>
    now !== null && r.submittedAt !== null && now - new Date(r.submittedAt).getTime() < FRESH_MS;

  const freshCount = responses.filter(isFresh).length;

  /** ตัวเลือกในกล่องกรอง — นับจากชุดเต็ม ไม่ใช่ชุดที่กรองแล้ว ตัวเลขจะได้ไม่กระโดด */
  const optionsOf = useMemo(() => {
    const map = new Map<string, { value: string; count: number }[]>();
    for (const col of COLUMNS) {
      if (col.noFilter) continue;
      const counts = new Map<string, number>();
      for (const r of responses) {
        for (const v of col.values(r)) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      map.set(
        col.key,
        [...counts.entries()]
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "th")),
      );
    }
    return map;
  }, [responses]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();

    const filtered = responses.filter((r) => {
      if (q) {
        const hay = [r.drivercode, r.driverName, r.plant, r.truckplate]
          .concat(Object.values(r.answers).flat())
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      for (const [key, picked] of Object.entries(filters)) {
        if (!picked.length) continue;
        const col = SORTABLE.get(key);
        if (!col) continue;
        if (!col.values(r).some((v) => picked.includes(v))) return false;
      }
      return true;
    });

    const col = SORTABLE.get(sortKey);
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = col?.sortValue?.(a) ?? col?.values(a).join(" ") ?? "";
      const vb = col?.sortValue?.(b) ?? col?.values(b).join(" ") ?? "";
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), "th") * dir;
    });
  }, [responses, query, filters, sortKey, sortDir]);

  const activeFilters = Object.values(filters).filter((v) => v.length).length;
  const dirty = activeFilters > 0 || query.trim().length > 0;

  /** รูปที่ปุ่มส่งออกใช้ — ชุดเดียวกับที่เซิร์ฟเวอร์อ่านกลับด้วย `surveyFiltersFromParams()` */
  const exportFilters: SurveyFilters = { query, picked: filters };

  function applySort(key: string, dir: SortDir) {
    setSortKey(key);
    setSortDir(dir);
  }

  /**
   * เปิดเมนูของคอลัมน์ — ปุ่มเดียวคุมทั้งเรียงและกรอง (ท่าเดียวกับ Google Sheets)
   *
   * เกาะ **ขอบซ้ายของช่องหัวคอลัมน์** ไม่ใช่ของปุ่มไอคอน — Excel/Sheets กางเมนู
   * ลงมาใต้คอลัมน์ตรง ๆ ถ้าเกาะไอคอน (ซึ่งอยู่ชิดขวาของช่อง) เมนูจะไปโผล่เยื้อง
   * ออกไปจากคอลัมน์ที่กด
   */
  function openMenu(key: string, rect: DOMRect) {
    setOpenFilter({
      key,
      top: rect.bottom + 4,
      left: Math.min(Math.max(8, rect.left), window.innerWidth - POPOVER_WIDTH - 8),
    });
  }

  function toggleValue(key: string, value: string) {
    setFilters((prev) => {
      const picked = prev[key] ?? [];
      const next = picked.includes(value)
        ? picked.filter((v) => v !== value)
        : [...picked, value];
      const out = { ...prev };
      if (next.length) out[key] = next;
      else delete out[key];
      return out;
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <SearchField
          label="ค้นหาในผลแบบสอบถาม"
          placeholder="ค้นหารหัส พจส. ชื่อ แพล้นท์ หรือคำตอบ"
          value={query}
          onChange={setQuery}
          className="w-full max-w-[340px]"
        />
        <div className="flex items-center gap-2.5 text-[12.5px] text-mut">
          <span>
            แสดง <span className="font-semibold text-ink">{rows.length}</span> จาก{" "}
            {responses.length} คน
          </span>

          <button
            type="button"
            onClick={() => startRefresh(() => router.refresh())}
            disabled={refreshing}
            title="โหลดคำตอบล่าสุดจากฐานข้อมูลใหม่"
            className="inline-flex flex-none items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11.5px] transition-colors hover:border-ink/30 hover:text-ink disabled:opacity-50"
          >
            <RotateCw
              size={13}
              strokeWidth={2}
              className={refreshing ? "animate-spin" : ""}
              aria-hidden
            />
            {refreshing ? "กำลังโหลด…" : "รีเฟรช"}
          </button>
          {dirty ? (
            <button
              type="button"
              onClick={() => {
                setFilters({});
                setQuery("");
              }}
              className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[11.5px] transition-colors hover:border-ink/30 hover:text-ink"
            >
              <X size={13} strokeWidth={2} aria-hidden />
              ล้างตัวกรอง{activeFilters ? ` (${activeFilters})` : ""}
            </button>
          ) : null}

          {/* ส่งออกเฉพาะแถวที่ตัวกรองปัจจุบันเลือกไว้ — เซิร์ฟเวอร์กรองซ้ำด้วยกฎเดียวกัน */}
          <SurveyExportButton surveyId={surveyId} filters={exportFilters} count={rows.length} />
        </div>
      </div>

      <div className="overflow-auto rounded-box border border-line bg-base-100 [max-height:min(68vh,640px)]">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead className="sticky top-0 z-20">
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-30 w-[168px] min-w-[168px] border-r border-b border-line bg-base-200 px-3 py-2"
              >
                <HeadCell
                  label={IDENTITY_COLUMN.label}
                  sorted={sortKey === IDENTITY_COLUMN.key ? sortDir : null}
                  onOpen={(rect) => openMenu(IDENTITY_COLUMN.key, rect)}
                />
              </th>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  style={{ width: col.width, minWidth: col.width }}
                  className="border-b border-line bg-base-200 px-3 py-2 align-bottom"
                >
                  <HeadCell
                    label={col.label}
                    sorted={sortKey === col.key ? sortDir : null}
                    filterCount={filters[col.key]?.length ?? 0}
                    onOpen={(rect) => openMenu(col.key, rect)}
                  />
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => {
              const fresh = isFresh(r);
              return (
              <tr
                key={r.drivercode}
                onClick={() => setDetail(r)}
                /* สีตอน hover ต้องทึบ ไม่ใช่ /50 — คอลัมน์ที่ตรึงซ้ายจะมองทะลุเห็น
                   เซลล์ที่เลื่อนผ่านอยู่ข้างหลัง ตัวหนังสือทับกันอ่านไม่ออก */
                className="group cursor-pointer border-b border-line/70 last:border-0 hover:bg-soft"
              >
                <th
                  scope="row"
                  /* ขีดซ้ายทำด้วย inset shadow ไม่ใช่ border — border จะดันความกว้าง
                     ของคอลัมน์ที่ตรึงไว้ แล้วแถวใหม่กับแถวเก่าจะเยื้องกัน */
                  className={`sticky left-0 z-10 border-r border-line px-3 py-2 text-left font-normal group-hover:bg-soft bg-base-100 
                  `}
                >
                  <span className="flex flex-col leading-tight">
                    <span className="flex items-center gap-1.5">
                      {fresh ? <NewBadge submittedAt={r.submittedAt} /> : null}
                      <span className="font-mono text-[12.5px] font-medium">
                        {r.drivercode}
                      </span>
                    </span>
                    <span className="truncate text-[12px] text-mut">
                      {r.driverName || "—"}
                    </span>
                  </span>
                </th>
                {COLUMNS.map((col) => (
                  <td key={col.key} className="px-3 py-2 align-top">
                    {cellOf(col.key, r)}
                  </td>
                ))}
              </tr>
              );
            })}
          </tbody>
        </table>

        {!rows.length ? (
          <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
            <Inbox size={22} strokeWidth={1.6} className="text-mut" aria-hidden />
            <p className="text-[13px] text-mut">
              {responses.length
                ? "ไม่มีคำตอบที่ตรงกับเงื่อนไข"
                : "ยังไม่มีใครตอบแบบสอบถามนี้"}
            </p>
          </div>
        ) : null}
      </div>

      {openFilter ? (
        <FilterPopover
          anchor={openFilter}
          label={SORTABLE.get(openFilter.key)?.label ?? ""}
          options={optionsOf.get(openFilter.key) ?? []}
          picked={filters[openFilter.key] ?? []}
          sorted={sortKey === openFilter.key ? sortDir : null}
          sortLabels={SORTABLE.get(openFilter.key)?.sortLabels ?? TEXT_SORT_LABELS}
          onSort={(dir) => applySort(openFilter.key, dir)}
          onToggle={(v) => toggleValue(openFilter.key, v)}
          onClear={() =>
            setFilters((prev) => {
              const out = { ...prev };
              delete out[openFilter.key];
              return out;
            })
          }
          onClose={() => setOpenFilter(null)}
        />
      ) : null}

      {detail ? <DetailPanel response={detail} onClose={() => setDetail(null)} /> : null}
    </section>
  );
}

/* ------------------------------------------------------------------ ป้าย “ใหม่” */

/**
 * ป้ายของที่เพิ่งตอบเข้ามาไม่เกิน 1 ชั่วโมง
 *
 * สามชั้น: เม็ดสี `primary` (ไม่ hardcode สี ธีมมืดตามไปเอง) · แสงกวาดผ่านซ้ำ ๆ
 * ด้วย keyframe `shine` ที่มีอยู่แล้วใน `globals.css` · เข้าฉากด้วย `animate-pop-in`
 *
 * แสงกวาดตั้งไว้ 3.2 วินาทีต่อรอบ — ช้าพอที่หลายแถวพร้อมกันแล้วยังไม่กวนสายตา
 * (`prefers-reduced-motion` ถูกตัดให้เหลือ 0.01ms โดยกฎรวมใน `globals.css` อยู่แล้ว)
 */
function NewBadge({ submittedAt }: { submittedAt: string | null }) {
  return (
    <span
      title={`เพิ่งตอบเข้ามา · ${bangkokDateLabel(submittedAt)} ${bangkokTimeLabel(submittedAt)} น.`}
      className="animate-pop-in relative inline-flex flex-none items-center gap-0.5 overflow-hidden rounded-full bg-primary px-1.5 py-0.5 text-[10px] leading-none font-semibold tracking-[0.02em] text-ink-content shadow-sm"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 -left-full w-full animate-[shine_3.2s_ease-in-out_infinite] bg-linear-to-r from-transparent via-white/55 to-transparent"
      />
      <Sparkles size={9} strokeWidth={2.6} className="relative" aria-hidden />
      <span className="relative">ใหม่</span>
    </span>
  );
}

/* ------------------------------------------------------------------ หัวคอลัมน์ */

/**
 * หัวคอลัมน์ = ปุ่มเดียว เปิดเมนูที่มีทั้งการเรียงและตัวกรอง
 * (แยกสองไอคอนแล้วหัวตารางแน่นเกินไปเมื่อมี 22 คอลัมน์ และเดาไม่ออกว่าอันไหนทำอะไร)
 * สถานะที่ใช้อยู่บอกด้วยลูกศรทิศทางการเรียง + ตัวเลขจำนวนค่าที่ติ๊กกรองไว้
 */
function HeadCell({
  label,
  sorted,
  filterCount = 0,
  onOpen,
}: {
  label: string;
  sorted: SortDir | null;
  filterCount?: number;
  onOpen: (rect: DOMRect) => void;
}) {
  const active = Boolean(sorted) || filterCount > 0;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        // เกาะช่องหัวคอลัมน์ ไม่ใช่ตัวปุ่ม — ดูเหตุผลที่ `openMenu()`
        onOpen((e.currentTarget.closest("th") ?? e.currentTarget).getBoundingClientRect());
      }}
      aria-label={`เรียงและกรอง ${label}`}
      className={`flex w-full items-center justify-between gap-1 rounded-selector px-1 py-0.5 text-[11.5px] font-medium transition-colors hover:bg-base-300 ${
        active ? "text-primary" : "text-mut hover:text-ink"
      }`}
    >
      <span className="truncate">{label}</span>

      <span className="flex flex-none items-center gap-0.5">
        {sorted === "asc" ? (
          <ArrowUp size={12} strokeWidth={2.2} aria-hidden />
        ) : sorted === "desc" ? (
          <ArrowDown size={12} strokeWidth={2.2} aria-hidden />
        ) : null}
        {filterCount ? <span className="text-[10px] font-semibold">{filterCount}</span> : null}
        <ListFilter size={13} strokeWidth={1.9} aria-hidden />
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ กล่องตัวกรอง */

function FilterPopover({
  anchor,
  label,
  options,
  picked,
  sorted,
  sortLabels,
  onSort,
  onToggle,
  onClear,
  onClose,
}: {
  /** พิกัดปุ่มที่กด — เก็บตอนคลิก ไม่ต้องไปวัดใหม่ใน effect */
  anchor: { top: number; left: number };
  label: string;
  options: { value: string; count: number }[];
  picked: string[];
  sorted: SortDir | null;
  sortLabels: { asc: string; desc: string };
  onSort: (dir: SortDir) => void;
  onToggle: (v: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    /**
     * เลื่อนจอ/เลื่อนตาราง = ปิดเมนู (Excel/Sheets ทำแบบเดียวกัน)
     * พิกัดถูกจับไว้ตอนกด ถ้าไม่ปิด เมนูจะค้างลอยอยู่ที่เดิมขณะที่หัวคอลัมน์เลื่อนหนีไปแล้ว
     * ฟังแบบ capture เพราะการเลื่อนเกิดที่กล่อง scroll ของตาราง ไม่ใช่ที่ document
     */
    const onScroll = () => onClose();
    // รอให้คลิกที่เปิดกล่องจบก่อน ไม่งั้นกล่องจะปิดทันทีที่เปิด
    const t = setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    document.addEventListener("keydown", onKey);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [onClose]);

  const shown = query.trim()
    ? options.filter((o) => o.value.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  /**
   * ต้องแขวนไว้ที่ `document.body` — คอนเทนเนอร์ของหน้ามีคลาส `animate-rise` ซึ่ง
   * จบแอนิเมชันแล้วเหลือ `transform: matrix(1,0,0,1,0,0)` (ไม่ใช่ `none`) กลายเป็น
   * containing block ของลูกที่เป็น `position: fixed` เมนูจึงเลื่อนหนีไปจากหัวคอลัมน์
   * เท่ากับระยะของกล่องนั้นพอดี
   */
  return createPortal(
    <div
      ref={box}
      role="dialog"
      aria-label={`ตัวกรอง ${label}`}
      style={{ top: anchor.top, left: anchor.left, width: POPOVER_WIDTH }}
      className="fixed z-50 flex flex-col gap-2 rounded-box border border-line bg-base-100 p-2.5 shadow-lg"
    >
      <div className="flex items-center justify-between gap-2 px-0.5">
        <span className="truncate text-[12.5px] font-semibold">{label}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิดตัวกรอง"
          className="text-mut hover:text-ink"
        >
          <X size={14} strokeWidth={2} aria-hidden />
        </button>
      </div>

      {/* เรียง — อยู่บนสุดเหมือนเมนูของ Google Sheets */}
      <div className="flex flex-col gap-0.5 border-b border-line pb-2">
        {(["asc", "desc"] as const).map((dir) => {
          const on = sorted === dir;
          const Icon = dir === "asc" ? ArrowUp : ArrowDown;
          return (
            <button
              key={dir}
              type="button"
              onClick={() => onSort(dir)}
              className={`flex items-center gap-2 rounded-selector px-1.5 py-1.5 text-left text-[12.5px] transition-colors ${
                on ? "bg-soft font-medium text-primary" : "hover:bg-base-200"
              }`}
            >
              <Icon size={13} strokeWidth={2} className="flex-none" aria-hidden />
              {sortLabels[dir]}
            </button>
          );
        })}
      </div>

      {options.length > 8 ? (
        <SearchField
          label={`ค้นหาตัวเลือกของ ${label}`}
          placeholder="ค้นหาตัวเลือก"
          value={query}
          onChange={setQuery}
          tone="filled"
          className="!px-2.5 !py-1.5"
        />
      ) : null}

      {/* คอลัมน์ที่ค่าไม่ซ้ำกันเลย (รหัส พจส. / ข้อเสนอแนะ) ไม่มีรายการให้ติ๊ก — เหลือแค่เรียง */}
      {options.length ? (
        <ul className="flex max-h-[240px] flex-col gap-0.5 overflow-y-auto">
          {shown.map((o) => (
            <li key={o.value}>
              <label className="flex cursor-pointer items-center gap-2 rounded-selector px-1.5 py-1.5 transition-colors hover:bg-base-200">
                <input
                  type="checkbox"
                  checked={picked.includes(o.value)}
                  onChange={() => onToggle(o.value)}
                  className="size-3.5 flex-none accent-primary"
                />
                <span className="min-w-0 flex-1 truncate text-[12.5px]">{o.value}</span>
                <span className="flex-none text-[11px] text-mut">{o.count}</span>
              </label>
            </li>
          ))}
          {!shown.length ? (
            <li className="px-1.5 py-3 text-center text-[12px] text-mut">ไม่พบตัวเลือก</li>
          ) : null}
        </ul>
      ) : null}

      {options.length ? (
        <div className="flex items-center justify-between border-t border-line pt-2 text-[11.5px]">
          <span className="text-mut">
            {picked.length ? `เลือกไว้ ${picked.length}` : "ไม่ติ๊ก = แสดงทั้งหมด"}
          </span>
          <button
            type="button"
            onClick={onClear}
            disabled={!picked.length}
            className="rounded-full border border-line px-2.5 py-0.5 transition-colors hover:border-ink/30 hover:text-ink disabled:opacity-40"
          >
            ล้าง
          </button>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ รายละเอียดรายคน */

function DetailPanel({
  response,
  onClose,
}: {
  response: SurveyResponse;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  /** แขวนที่ `document.body` ด้วยเหตุผลเดียวกับกล่องตัวกรอง — ไม่งั้น `inset-0` จะกินแค่กล่องเนื้อหา ไม่เต็มจอ */
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex justify-end bg-ink/25"
      onClick={onClose}
      role="presentation"
    >
      <aside
        role="dialog"
        aria-label={`คำตอบของ ${response.driverName || response.drivercode}`}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-[440px] flex-col bg-base-100 shadow-xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm font-semibold">
              {response.driverName || "ไม่ระบุชื่อ"}
            </span>
            <span className="text-[12px] text-mut">
              {response.drivercode}
              {response.plant ? ` · ${response.plant}` : ""}
              {response.truckplate ? ` · ${response.truckplate}` : ""}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="flex-none text-mut hover:text-ink"
          >
            <X size={18} strokeWidth={1.9} aria-hidden />
          </button>
        </header>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-canvas px-5 py-4">
          {SURVEY_QUESTIONS.map((q) => {
            const list = response.answers[q.id] ?? [];
            return (
              <div key={q.id} className="rounded-box border border-line bg-base-100 p-3.5">
                <p className="text-[12px] text-mut text-pretty">
                  {q.no}. {q.question}
                </p>
                {!list.length ? (
                  <p className="mt-1 text-[13px] text-mut italic">ไม่ได้ตอบ</p>
                ) : q.kind === "rank" ? (
                  <ol className="mt-1.5 flex flex-col gap-1">
                    {list.map((v, i) => (
                      <li key={v} className="flex items-center gap-2 text-[13px]">
                        <span className="flex size-5 flex-none items-center justify-center rounded-full bg-soft text-[11px] font-semibold text-primary">
                          {i + 1}
                        </span>
                        {v}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-1 text-[13.5px] text-pretty">{list.join(" · ")}</p>
                )}
              </div>
            );
          })}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
