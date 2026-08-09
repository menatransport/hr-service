"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { History, Trash2 } from "lucide-react";

import { SearchField } from "@/components/ui/field";
import {
  activityActor,
  activityMeta,
  formatDate,
  formatDateTime,
} from "@/lib/case-flow";
import type { ActivityAction, ActivityEntry } from "@/lib/types";

/**
 * รายการประวัติการทำงาน — กรองและค้นในหน่วยความจำทั้งหมด
 * (`getActivity()` ดึงมา 200 รายการล่าสุดครั้งเดียว เหมือนที่ตารางคำร้องทำ)
 *
 * จัดกลุ่มตามวันเพราะคำถามที่คนเปิดหน้านี้ถามคือ “เมื่อวานมีอะไรเกิดขึ้นบ้าง”
 * ไม่ใช่ “รายการที่ 37 คืออะไร” — หัววันจึงเป็นตัวนำสายตาหลัก
 */

/** ชิปกรอง — เรียงตามลำดับที่เหตุการณ์มักเกิดในวงจรชีวิตเคส ปิดท้ายด้วยลบ */
const FILTERS: ActivityAction[] = [
  "create",
  "assign",
  "approve",
  "reject",
  "resubmit",
  "close",
  "delete",
  "other",
];

export function ActivityLog({ entries }: { entries: ActivityEntry[] }) {
  const [action, setAction] = useState<ActivityAction | "all">("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const by: Partial<Record<ActivityAction, number>> = {};
    for (const e of entries) by[e.action] = (by[e.action] ?? 0) + 1;
    return by;
  }, [entries]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (action !== "all" && e.action !== action) return false;
      if (!q) return true;
      return `${e.trackingNo} ${e.subject} ${activityActor(e)} ${e.remark ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [entries, action, query]);

  /** จัดกลุ่มตามวัน — คงลำดับเดิม (ใหม่สุดก่อน) ที่ upstream เรียงมาให้แล้ว */
  const days = useMemo(() => {
    const out: { day: string; items: ActivityEntry[] }[] = [];
    for (const e of rows) {
      const day = formatDate(e.at);
      const last = out.at(-1);
      if (last?.day === day) last.items.push(e);
      else out.push({ day, items: [e] });
    }
    return out;
  }, [rows]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <SearchField
          label="ค้นหาในประวัติ"
          value={query}
          onChange={setQuery}
          placeholder="ค้นเลขติดตาม หัวข้อ ชื่อผู้ทำ หรือหมายเหตุ"
        />

        <div className="flex flex-wrap gap-2">
          <Chip on={action === "all"} onClick={() => setAction("all")}>
            ทั้งหมด
            <Count on={action === "all"} value={entries.length} />
          </Chip>
          {FILTERS.filter((a) => counts[a]).map((a) => (
            <Chip key={a} on={action === a} onClick={() => setAction(a)}>
              {activityMeta[a].label}
              <Count on={action === a} value={counts[a] ?? 0} />
            </Chip>
          ))}
        </div>
      </div>

      {days.length === 0 ? (
        <div className="flex flex-col items-center gap-2.5 rounded-box border border-line bg-base-100 px-4 py-12 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-soft text-primary">
            <History size={20} strokeWidth={1.7} aria-hidden />
          </span>
          <p className="text-[13px] text-mut">
            {entries.length
              ? "ไม่มีรายการที่ตรงกับเงื่อนไข"
              : "ยังไม่มีประวัติการทำงาน"}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {days.map(({ day, items }) => (
            <section key={day} className="flex flex-col gap-2">
              <h2 className="text-[12px] font-medium tracking-[0.02em] text-mut">
                {day}
              </h2>
              <ul className="overflow-hidden rounded-box border border-line bg-base-100">
                {items.map((e) => (
                  <li key={e.id} className="border-b border-line/70 last:border-0">
                    <Row entry={e} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="text-[12px] text-mut">
        แสดง {rows.length} จาก {entries.length} รายการล่าสุด
      </p>
    </div>
  );
}

function Row({ entry }: { entry: ActivityEntry }) {
  const meta = activityMeta[entry.action];

  /* คำร้องที่ถูกลบแล้วเปิดหน้ารายละเอียดไม่ได้ (upstream กรองออกจาก `/complaints/`)
     จึงไม่ทำเป็นลิงก์ — ลิงก์ที่พาไปหน้าว่างแย่กว่าไม่มีลิงก์ */
  const heading = entry.caseDeleted ? (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11.5px] font-medium text-mut">
      {entry.trackingNo}
      <Trash2 size={11} strokeWidth={1.9} aria-hidden />
    </span>
  ) : (
    <Link
      href={`/desk/cases/${entry.trackingNo}`}
      className="font-mono text-[11.5px] font-medium text-primary hover:text-ink"
    >
      {entry.trackingNo}
    </Link>
  );

  return (
    <div className="flex gap-3 px-3.5 py-3">
      <span
        aria-hidden
        className={`mt-1.5 size-1.5 flex-none rounded-full ${meta.dot}`}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={`rounded-full px-2 py-[2px] text-[11px] font-medium ${meta.chip}`}
          >
            {meta.label}
            {/* ค่าที่ระบบยังไม่รู้จัก — โชว์ของดิบไว้ ดีกว่าเงียบไปเฉย ๆ */}
            {entry.action === "other" && entry.rawAction
              ? ` · ${entry.rawAction}`
              : null}
          </span>
          {heading}
          <span className="text-[11.5px] text-mut">
            โดย <span className="text-ink">{activityActor(entry)}</span>
          </span>
        </div>

        <p className="text-[13px] leading-snug text-pretty">
          {entry.subject}
          {entry.caseDeleted ? (
            <span className="ml-1.5 text-[11.5px] text-mut">(ถูกลบแล้ว)</span>
          ) : null}
        </p>

        {entry.remark ? (
          <p className="text-[12px] text-mut text-pretty">“{entry.remark}”</p>
        ) : null}
      </div>

      <span className="flex-none self-start text-[11.5px] text-mut">
        {formatDateTime(entry.at).split(" ").slice(-1)}
      </span>
    </div>
  );
}

function Chip({
  children,
  on,
  onClick,
}: {
  children: React.ReactNode;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex-none rounded-full border px-3 py-1.5 text-[12.5px] transition-colors ${
        on
          ? "border-ink bg-ink text-ink-content"
          : "border-line bg-base-100 text-mut hover:border-ink/30 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Count({ on, value }: { on: boolean; value: number }) {
  return (
    <span className={`ml-1.5 font-medium ${on ? "opacity-80" : "text-ink"}`}>
      {value}
    </span>
  );
}
