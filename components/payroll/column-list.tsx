"use client";

import { useState } from "react";
import { Check, ChevronDown, WandSparkles } from "lucide-react";

import {
  share,
  STATE_LABEL,
  STATE_RISK,
  STATE_TONE,
  TYPE_DOT,
  TYPE_LABEL,
  type ColumnProfile,
  type FileProfile,
} from "@/lib/payroll/profile";

/**
 * รายการคอลัมน์ — **หนึ่งคอลัมน์ต่อหนึ่งแถว ไม่ใช่ตารางข้อมูลจริง**
 *
 * นี่คือการตัดสินใจหลักของทั้งหน้า: ไฟล์ที่ฝ่ายส่งมามี 13–30 คอลัมน์ ถ้าพรีวิวเป็น
 * ตารางปกติ คอลัมน์จะเรียงข้าง ๆ กันจนต้องเลื่อนซ้ายขวา และยังบอกไม่ได้อยู่ดีว่า
 * ข้อมูลสะอาดพอจะนำเข้าหรือยัง · พอกลับด้านให้คอลัมน์เรียงลงมาแทน จะไล่สายตาลง
 * ทีเดียวครบ และมีที่ว่างพอจะใส่ผลวิเคราะห์ต่อท้ายทุกบรรทัด
 *
 * แถบคุณภาพสามช่วง (ถูกต้อง / ผิดชนิด / ว่าง) ยืมจาก Column quality ของ Power Query
 * เพราะอ่านออกในพริบตาโดยไม่ต้องอ่านตัวเลข — แต่ใช้โทเคนสีของระบบ ไม่ใช่เขียว-เหลือง-แดง
 *
 * ติ๊กเลือกเป็น `role="checkbox"` ซ้อนอยู่ในแถวที่กดกางได้ จึงต้อง `stopPropagation`
 * ทั้งคลิกและคีย์บอร์ด ไม่งั้นกดติ๊กแล้วแถวจะกางตามไปด้วยทุกครั้ง
 */

const GRID =
  "grid items-center gap-3 px-3.5 " +
  "grid-cols-[1.75rem_2.5rem_minmax(0,1fr)_6rem_2.25rem] " +
  "lg:grid-cols-[1.75rem_2.5rem_minmax(0,1fr)_6.5rem_11rem_5rem_6rem_2.25rem]";

export function ColumnList({
  profile,
  selected,
  onToggle,
  sortMode,
  filterMode,
}: {
  profile: FileProfile;
  selected: Set<string>;
  onToggle: (letter: string) => void;
  sortMode: "file" | "risk";
  filterMode: "all" | "issue";
}) {
  const [open, setOpen] = useState<string | null>(null);

  let rows = profile.columns.slice();
  if (filterMode === "issue") {
    rows = rows.filter((c) => c.state === "error" || c.state === "warn");
  }
  if (sortMode === "risk") {
    rows.sort(
      (a, b) =>
        STATE_RISK[a.state] - STATE_RISK[b.state] ||
        a.letter.localeCompare(b.letter),
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-box border border-dashed border-line px-5 py-10 text-center">
        <p className="text-13 font-medium">ไม่มีคอลัมน์ที่มีปัญหา</p>
        <p className="mt-1 text-12 text-mut">ทุกคอลัมน์ในไฟล์นี้นำเข้าได้เลย</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-box border border-line bg-base-100">
      {/* หัวตาราง — ซ่อนคอลัมน์ที่ไม่จำเป็นเมื่อจอแคบกว่า lg */}
      <div
        className={`${GRID} h-9 border-b border-line text-11 tracking-[0.05em] text-mut`}
      >
        <span />
        <span>ช่อง</span>
        <span>หัวคอลัมน์</span>
        <span className="hidden lg:block">ชนิดข้อมูล</span>
        <span className="hidden lg:block">คุณภาพข้อมูล</span>
        <span className="hidden text-right lg:block">ใช้ได้</span>
        <span className="text-right">สถานะ</span>
        <span />
      </div>

      {rows.map((column) => {
        const expanded = open === column.letter;
        const checked = selected.has(column.letter);

        return (
          <div key={column.letter} className="border-b border-line last:border-b-0">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : column.letter)}
              className={`${GRID} w-full min-h-[3.4rem] py-2 text-left transition-colors hover:bg-soft/50 ${
                expanded ? "bg-soft/60" : ""
              } ${column.state === "skip" ? "opacity-55" : ""}`}
            >
              <span
                role="checkbox"
                tabIndex={0}
                aria-checked={checked}
                aria-label={`เลือกคอลัมน์ ${column.header || column.letter}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggle(column.letter);
                }}
                onKeyDown={(event) => {
                  if (event.key !== " " && event.key !== "Enter") return;
                  event.preventDefault();
                  event.stopPropagation();
                  onToggle(column.letter);
                }}
                className={`flex size-[18px] items-center justify-center rounded-selector border transition-colors ${
                  checked
                    ? "border-primary bg-primary text-primary-content"
                    : "border-dashed border-line text-transparent hover:border-primary/50"
                }`}
              >
                <Check size={12} strokeWidth={2.4} aria-hidden />
              </span>

              <span className="rounded-selector border border-line py-0.5 text-center font-mono text-12 text-mut">
                {column.letter}
              </span>

              <span className="flex min-w-0 flex-col gap-0.5">
                <span
                  className={`truncate text-13-5 ${
                    column.header ? "font-medium" : "text-mut italic"
                  }`}
                >
                  {column.header || "(ไม่มีหัวคอลัมน์)"}
                </span>
                <span className="truncate text-11-5 text-mut">
                  {column.issue ??
                    `${column.distinct.toLocaleString("th-TH")} ค่าที่ต่างกัน`}
                </span>
              </span>

              <span className="hidden items-center gap-1.5 text-12-5 lg:flex">
                <span
                  aria-hidden
                  className={`size-1.5 flex-none rounded-full ${TYPE_DOT[column.type]}`}
                />
                {TYPE_LABEL[column.type]}
              </span>

              <span className="hidden flex-col gap-1 lg:flex">
                <QualityBar column={column} total={profile.totalRows} />
                <span className="flex gap-2 font-mono text-10-5 tabular-nums">
                  <span className="text-mut">
                    ถูกต้อง {share(column.valid, profile.totalRows)}%
                  </span>
                  {column.mismatch ? (
                    <span className="text-sla">ผิดชนิด {column.mismatch}</span>
                  ) : null}
                  {column.empty ? (
                    <span className="text-mut">ว่าง {column.empty}</span>
                  ) : null}
                </span>
              </span>

              <span className="hidden text-right font-mono text-12-5 text-mut tabular-nums lg:block">
                {column.valid.toLocaleString("th-TH")}/
                {profile.totalRows.toLocaleString("th-TH")}
              </span>

              <span className="text-right">
                <span
                  className={`rounded-selector px-2 py-0.5 text-11 font-medium ${STATE_TONE[column.state]}`}
                >
                  {STATE_LABEL[column.state]}
                </span>
              </span>

              <ChevronDown
                size={15}
                strokeWidth={1.8}
                aria-hidden
                className={`justify-self-end text-mut transition-transform duration-200 ${
                  expanded ? "rotate-180" : ""
                }`}
              />
            </button>

            {expanded ? (
              <ColumnDetail column={column} total={profile.totalRows} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/* ───────────────────────────────────────────── แถบคุณภาพสามช่วง */

function QualityBar({ column, total }: { column: ColumnProfile; total: number }) {
  return (
    <span className="flex h-[7px] overflow-hidden rounded-full bg-base-200">
      <span className="block h-full bg-primary" style={{ width: `${share(column.valid, total)}%` }} />
      <span className="block h-full bg-sla" style={{ width: `${share(column.mismatch, total)}%` }} />
      <span className="block h-full bg-base-300" style={{ width: `${share(column.empty, total)}%` }} />
    </span>
  );
}

/* ─────────────────────────────────────── รายละเอียดคอลัมน์ที่กางออก */

function ColumnDetail({ column, total }: { column: ColumnProfile; total: number }) {
  return (
    <div className="flex flex-col gap-3 border-t border-line bg-soft/35 px-3.5 py-4 lg:pl-[5.5rem]">
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="ค่าที่ต่างกัน" value={column.distinct.toLocaleString("th-TH")} />
        <Stat
          label="ช่องว่าง"
          value={column.empty.toLocaleString("th-TH")}
          hint={column.empty ? `${share(column.empty, total)}% ของทั้งคอลัมน์` : undefined}
          bad={column.empty > 0}
        />
        <Stat
          label="ไม่ตรงชนิด"
          value={column.mismatch.toLocaleString("th-TH")}
          bad={column.mismatch > 0}
        />

        <div className="flex flex-col gap-1 rounded-field border border-line bg-base-100 p-3">
          <span className="text-11 tracking-[0.05em] text-mut">ค่าตัวอย่าง</span>
          {column.samples.length ? (
            <ul className="flex flex-col gap-0.5">
              {column.samples.map((sample) => (
                <li key={sample} className="truncate font-mono text-12">
                  {sample}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-12 text-mut">ไม่มีค่าให้แสดง</span>
          )}
        </div>
      </div>

      {column.note ? (
        <p className="max-w-[76ch] text-12-5 leading-relaxed text-mut text-pretty">
          {column.note}
        </p>
      ) : null}

      {column.badCells?.length ? (
        <div className="overflow-x-auto rounded-field border border-line bg-base-100">
          <table className="w-full text-12-5 whitespace-nowrap">
            <thead>
              <tr className="border-b border-line text-11 tracking-[0.05em] text-mut">
                <th className="w-20 px-3 py-2 text-left font-medium">แถว</th>
                <th className="w-48 px-3 py-2 text-left font-medium">ค่าในไฟล์</th>
                <th className="px-3 py-2 text-left font-medium">ทำไมถึงผิด</th>
              </tr>
            </thead>
            <tbody>
              {column.badCells.map((cell) => (
                <tr key={cell.row} className="border-b border-line last:border-b-0">
                  <td className="px-3 py-1.5 font-mono text-mut tabular-nums">
                    {cell.row}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-sla">{cell.value}</td>
                  <td className="px-3 py-1.5 text-mut">{cell.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {column.fix ? (
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-field border border-line bg-base-100 px-3 py-1.5 text-12-5 font-medium transition-colors hover:border-primary/40 hover:text-primary"
          >
            <WandSparkles size={13} strokeWidth={1.8} aria-hidden />
            {column.fix}
          </button>
          <span className="min-w-[16rem] flex-1 text-11-5 text-mut text-pretty">
            บันทึกเป็นขั้นตอนแปลงข้อมูลของไฟล์นี้ ใช้ซ้ำอัตโนมัติในรอบถัดไป ไฟล์ต้นฉบับไม่ถูกแก้
          </span>
        </div>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  bad,
}: {
  label: string;
  value: string;
  hint?: string;
  bad?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-field border border-line bg-base-100 p-3">
      <span className="text-11 tracking-[0.05em] text-mut">{label}</span>
      <span
        className={`font-mono text-18 leading-tight font-semibold tabular-nums ${
          bad ? "text-sla" : ""
        }`}
      >
        {value}
      </span>
      {hint ? <span className="text-11 text-mut">{hint}</span> : null}
    </div>
  );
}
