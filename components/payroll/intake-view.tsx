"use client";

import { useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CircleCheck,
  FileSpreadsheet,
  TriangleAlert,
  X,
} from "lucide-react";

import { PageHead } from "@/components/desk/page-head";
import { ColumnList } from "@/components/payroll/column-list";
import { PeriodPicker } from "@/components/payroll/period-picker";
import {
  CURRENT_PERIOD,
  isLocked,
  periodCode,
  periodLabel,
  type PeriodRef,
} from "@/lib/payroll/period";
import {
  defaultSelection,
  SAMPLE_PROFILE,
  tally,
  type FileProfile,
} from "@/lib/payroll/profile";
import { toastError, toastInfo } from "@/lib/swal";

/**
 * หน้ารับข้อมูล — เลือกรอบ → อัปโหลด → ตรวจคอลัมน์
 *
 * **สามขั้นอยู่หน้าเดียว ไม่ใช่วิซาร์ดสามหน้า** — ทั้งสามขั้นเป็นการตัดสินใจชุดเดียวกัน
 * และคนที่เห็นผลวิเคราะห์แล้วมักต้องเลื่อนกลับไปดูว่าเลือกรอบถูกไหม ถ้าแยกหน้าจะต้อง
 * กดถอยหลังแล้วเสียของที่อ่านมาแล้วไปทั้งหมด
 *
 * **ตอนนี้เป็น FE ล้วน** — ปุ่มเลือกไฟล์รับไฟล์จริงและอ่านชื่อ/ขนาดจริง แต่ผลวิเคราะห์
 * ยังเป็นชุดตัวอย่างจาก `SAMPLE_PROFILE` และบอกไว้บนหน้าตรง ๆ ไม่ปล่อยให้เข้าใจผิด
 * ว่าระบบอ่านไฟล์ของจริงไปแล้ว · ตัวอ่านจริงจะมาเป็น `POST /api/payroll/parse`
 * (`exceljs` เป็นของ Node) แล้วคืน `FileProfile` หน้าตาเดียวกัน — วันนั้นแก้แค่
 * ฟังก์ชัน `read()` ข้างล่าง ไม่ต้องแตะคอมโพเนนต์ลูกเลย
 *
 * ลำดับบนหน้าคือลำดับการตัดสินใจจริง และ **ปุ่มไปต่ออยู่ล่างสุดเสมอ** — คนที่ยังไม่
 * เลื่อนดูผลวิเคราะห์ไม่ควรกดผ่านไปได้โดยบังเอิญ
 */

/** หนึ่งขั้น — แบนบนแผ่นเนื้อหา เส้นคั่นบนยาวชนขอบแผ่นทั้งสองข้าง (ไม่ใช่การ์ด) */
const STEP = "sheet-bleed flex flex-col gap-3 border-t border-line px-(--sheet-px) pt-5";

export function IntakeView() {
  const [period, setPeriod] = useState<PeriodRef>(CURRENT_PERIOD);
  const [file, setFile] = useState<File | null>(null);
  const [profile, setProfile] = useState<FileProfile | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<"file" | "risk">("file");
  const [filterMode, setFilterMode] = useState<"all" | "issue">("all");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const locked = isLocked(period);
  const counts = useMemo(() => (profile ? tally(profile) : null), [profile]);

  function read(next: File) {
    if (!next.name.toLowerCase().endsWith(".xlsx")) {
      void toastError("รองรับเฉพาะไฟล์ .xlsx");
      return;
    }
    if (locked) {
      void toastError("รอบนี้ปิดแล้ว", "เลือกรอบที่ยังเปิดอยู่ก่อนจึงจะอัปโหลดได้");
      return;
    }

    setFile(next);
    /* ของจริงจะเป็น `await fetch("/api/payroll/parse", …)` ตรงนี้ */
    setProfile(SAMPLE_PROFILE);
    setSelected(defaultSelection(SAMPLE_PROFILE));
    void toastInfo(
      "แสดงผลวิเคราะห์ตัวอย่าง",
      "ยังไม่ได้ต่อกับตัวอ่านไฟล์จริง ตัวเลขที่เห็นจึงไม่ได้มาจากไฟล์ที่เพิ่งเลือก",
    );
  }

  function clear() {
    setFile(null);
    setProfile(null);
    setSelected(new Set());
    if (inputRef.current) inputRef.current.value = "";
  }

  function toggle(letter: string) {
    setSelected((was) => {
      const next = new Set(was);
      if (next.has(letter)) next.delete(letter);
      else next.add(letter);
      return next;
    });
  }

  /* คอลัมน์คีย์ที่ยังมีช่องว่าง = ไปต่อไม่ได้ ไม่ใช่แค่เตือน — คอลัมน์อื่นว่างได้
     (แปลว่าคนนั้นไม่มีรายการนั้น) แต่รหัสพนักงานว่างแปลว่าเงินก้อนนั้นไม่รู้จะเข้าใคร */
  const brokenKey =
    profile?.columns.find(
      (column) => column.isKey && selected.has(column.letter) && column.empty > 0,
    ) ?? null;

  const blocked = Boolean(brokenKey) || selected.size === 0;

  return (
    <div className="animate-rise flex flex-col gap-5">
      <PageHead
        title="รับข้อมูล"
        subtitle="เลือกรอบ อัปโหลดไฟล์ Excel แล้วตรวจทีละคอลัมน์ว่าข้อมูลสะอาดพอจะนำเข้าหรือยัง"
      />

      {/* ─────────────────────────────────────────── 1. เลือกรอบ
          สามขั้นแบนอยู่บนแผ่นเนื้อหา คั่นกันด้วยเส้นเต็มแผ่น ไม่มีการ์ดแยกชิ้น (13 ต.ค. 2569) */}
      <section className={STEP}>
        <StepHead
          no={1}
          done
          title="เลือกรอบที่จะนำข้อมูลเข้า"
          meta={`รอบ ${periodLabel(period)} · ${periodCode(period)}`}
        />
        <PeriodPicker
          value={period}
          onChange={(next) => {
            setPeriod(next);
            clear();
          }}
        />
      </section>

      {/* ────────────────────────────────────────── 2. อัปโหลด */}
      <section className={STEP}>
        <StepHead
          no={2}
          done={Boolean(profile)}
          title="อัปโหลดไฟล์ Excel"
          meta={profile ? "อ่านไฟล์เสร็จแล้ว" : "รองรับ .xlsx"}
        />

        {profile ? (
          <div className="flex flex-wrap items-center gap-3 rounded-field bg-base-200/70 px-3.5 py-3">
            <FileSpreadsheet
              size={18}
              strokeWidth={1.7}
              aria-hidden
              className="flex-none text-primary"
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-13 font-medium">
                {file?.name ?? profile.fileName}
              </span>
              <span className="font-mono text-11-5 text-mut tabular-nums">
                ชีต “{profile.sheetName}”
                {profile.sheetCount > 1 ? ` (จาก ${profile.sheetCount} ชีต)` : ""} ·
                หัวตารางแถวที่ {profile.headerRow} · ข้อมูล{" "}
                {profile.totalRows.toLocaleString("th-TH")} แถว ·{" "}
                {profile.columns.length} คอลัมน์
              </span>
            </span>
            <button
              type="button"
              onClick={clear}
              className="btn-sec ml-auto flex items-center gap-1 px-2.5 py-1.5 text-12-5 text-mut transition-colors hover:border-alert/40 hover:text-alert"
            >
              <X size={13} strokeWidth={1.9} aria-hidden />
              เอาไฟล์ออก
            </button>
          </div>
        ) : (
          <div
            onDragOver={(event) => {
              event.preventDefault();
              if (!locked) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const dropped = event.dataTransfer.files?.[0];
              if (dropped) read(dropped);
            }}
            className={`flex flex-col items-center gap-2 rounded-box border border-dashed px-5 py-8 text-center transition-colors ${
              dragging ? "border-primary bg-soft/60" : "border-line bg-base-200/50"
            } ${locked ? "opacity-60" : ""}`}
          >
            <FileSpreadsheet size={20} strokeWidth={1.6} aria-hidden className="text-mut" />
            <p className="text-13 font-medium">
              {locked ? "รอบนี้ปิดแล้ว อัปโหลดไม่ได้" : "ลากไฟล์ .xlsx มาวางที่นี่"}
            </p>
            <p className="max-w-[48ch] text-12 leading-relaxed text-mut text-pretty">
              ระบบจะอ่านหัวตารางและวิเคราะห์ข้อมูลทุกแถวให้ก่อน ยังไม่บันทึกอะไรลงรอบ
            </p>
            <button
              type="button"
              disabled={locked}
              onClick={() => inputRef.current?.click()}
              className={`mt-1 rounded-field px-3.5 py-2 text-13 font-medium transition-opacity ${
                locked
                  ? "cursor-not-allowed border border-line text-mut"
                  : "btn-pri"
              }`}
            >
              เลือกไฟล์
            </button>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            if (chosen) read(chosen);
          }}
        />
      </section>

      {/* ──────────────────────────────────── 3. ตรวจคอลัมน์ */}
      {profile && counts ? (
        <section className={STEP}>
          <StepHead
            no={3}
            done
            title="ตรวจคอลัมน์ก่อนนำเข้า"
            meta={`วิเคราะห์ครบทั้ง ${profile.totalRows.toLocaleString("th-TH")} แถว ไม่ได้สุ่มตัวอย่าง`}
          />

          {/* คำตอบก่อนรายละเอียด — นำเข้าทั้งไฟล์ได้เลยหรือไม่ */}
          <div
            className={`flex flex-wrap items-center gap-x-5 gap-y-2 rounded-box border p-3.5 ${
              counts.error
                ? "border-sla/30 bg-sla/6"
                : counts.warn
                  ? "border-warning/35 bg-warning/8"
                  : "border-primary/30 bg-soft/60"
            }`}
          >
            {counts.error ? (
              <TriangleAlert size={19} strokeWidth={1.8} aria-hidden className="text-sla" />
            ) : (
              <CircleCheck size={19} strokeWidth={1.8} aria-hidden className="text-primary" />
            )}

            <span className="flex items-baseline gap-2.5">
              <span
                className={`font-mono text-26 leading-none font-semibold tabular-nums ${
                  counts.error ? "text-sla" : "text-primary"
                }`}
              >
                {counts.error}
              </span>
              <span className="text-13 text-pretty">
                {counts.error
                  ? "คอลัมน์ที่ต้องดูก่อน — นำเข้าทั้งไฟล์เลยไม่ได้"
                  : "ไม่มีคอลัมน์ที่ติดขัด นำเข้าได้เลย"}
              </span>
            </span>

            <dl className="ml-auto flex flex-wrap gap-x-4 gap-y-1 text-12-5">
              <Count label="พร้อมนำเข้า" value={counts.ok} tone="text-primary" />
              <Count label="ควรดู" value={counts.warn} tone="text-warning" />
              <Count label="ข้ามอัตโนมัติ" value={counts.skip} />
              <Count label="ทั้งหมด" value={counts.total} />
            </dl>
          </div>

          {/* เรียง / กรอง */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-12 text-mut">เรียงตาม</span>
            <Toggle
              active={sortMode === "file"}
              onClick={() => setSortMode("file")}
              label="ลำดับในไฟล์"
            />
            <Toggle
              active={sortMode === "risk"}
              onClick={() => setSortMode("risk")}
              label="ปัญหามากขึ้นก่อน"
            />

            <span className="ml-2 text-12 text-mut">แสดง</span>
            <Toggle
              active={filterMode === "all"}
              onClick={() => setFilterMode("all")}
              label="ทุกคอลัมน์"
            />
            <Toggle
              active={filterMode === "issue"}
              onClick={() => setFilterMode("issue")}
              label="เฉพาะที่มีปัญหา"
            />

            <span className="ml-auto font-mono text-11-5 text-mut tabular-nums">
              เลือกไว้ {selected.size}/{counts.total} คอลัมน์
            </span>
          </div>

          <ColumnList
            profile={profile}
            selected={selected}
            onToggle={toggle}
            sortMode={sortMode}
            filterMode={filterMode}
          />

          {/* ปุ่มไปต่ออยู่ล่างสุดเสมอ */}
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
            <span className="text-12-5 text-mut">
              จะนำเข้า{" "}
              <span className="font-mono font-medium text-ink tabular-nums">
                {selected.size}
              </span>{" "}
              คอลัมน์ ·{" "}
              <span className="font-mono font-medium text-ink tabular-nums">
                {profile.totalRows.toLocaleString("th-TH")}
              </span>{" "}
              แถว เข้ารอบ{" "}
              <span className="font-medium text-ink">{periodLabel(period)}</span>
            </span>

            <span className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                onClick={clear}
                className="btn-sec px-3.5 py-2 text-13 text-mut transition-colors hover:border-alert/40 hover:text-alert"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={blocked}
                className={`flex items-center gap-1.5 rounded-field px-4 py-2 text-13 font-medium transition-opacity ${
                  blocked
                    ? "cursor-not-allowed border border-line text-mut opacity-60"
                    : "btn-pri"
                }`}
              >
                ไปขั้นจับคู่คอลัมน์
                <ArrowRight size={15} strokeWidth={1.9} aria-hidden />
              </button>
            </span>

            {brokenKey ? (
              <p role="status" className="basis-full text-12 text-sla text-pretty">
                ไปต่อไม่ได้ — คอลัมน์ “{brokenKey.header}” ใช้จับคู่พนักงาน
                แต่ยังมีช่องว่าง {brokenKey.empty} แถว แก้ในไฟล์ต้นทางหรือตัดแถวนั้นออกก่อน
              </p>
            ) : selected.size === 0 ? (
              <p role="status" className="basis-full text-12 text-mut">
                ยังไม่ได้เลือกคอลัมน์ไหนเลย
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/* ──────────────────────────────────────────────────────── ชิ้นเล็ก ๆ */

function StepHead({
  no,
  done,
  title,
  meta,
}: {
  no: number;
  done: boolean;
  title: string;
  meta: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <span
        aria-hidden
        className={`flex size-6.5 flex-none items-center justify-center rounded-field font-mono text-12 font-medium ${
          done ? "bg-primary text-primary-content" : "bg-base-200 text-mut"
        }`}
      >
        {no}
      </span>
      <h2 className="text-13-5 font-semibold">{title}</h2>
      <span className="ml-auto text-12 text-mut">{meta}</span>
    </div>
  );
}

function Toggle({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-field border px-2.5 py-1 text-12-5 transition-colors ${
        active
          ? "border-ink bg-ink font-medium text-ink-content"
          : "border-line bg-base-100 text-mut hover:border-primary/40 hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

function Count({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-mut">{label}</dt>
      <dd className={`font-mono font-medium tabular-nums ${tone ?? ""}`}>{value}</dd>
    </div>
  );
}
