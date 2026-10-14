"use client";

import { memo, useCallback, useDeferredValue, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Car,
  ChevronLeft,
  ChevronRight,
  SearchX,
  X,
} from "lucide-react";

import { TraineeCell } from "@/app/recruitment/_components/admin/trainee-cell";
import { TraineeVehicleModal } from "@/app/recruitment/_components/admin/trainee-vehicle-modal";
import { Avatar } from "@/components/ui/avatar";
import { Pager } from "@/components/ui/pager";
import { SearchField, type SelectOption } from "@/components/ui/field";
import {
  SegmentedControl,
  SummaryBody,
  SummaryFooter,
  SummaryPanel,
  SummaryStat,
  SummaryStats,
  SummaryStrip,
  SummaryToolbar,
} from "@/components/ui/summary-panel";
import {
  DRIVER_SITES,
  THAI_MONTHS_SHORT,
  THAI_WEEKDAYS_SHORT,
  formatTenure,
  formatThaiDate,
  type DriverSiteKey,
  type TraineeDailyEntry,
} from "@/app/recruitment/_lib/drivers/types";
import type { TraineeBoard, TraineeBoardDriver } from "@/app/recruitment/_lib/drivers/trainee-board";
import {
  TONE_DOT,
  TONE_LABEL,
  TONES,
  buildTraineeRows,
  isoOf,
  type ManualEdits,
  type TraineeRow,
} from "@/app/recruitment/_lib/drivers/trainees";

/**
 * ตารางติดตามฝึกงาน — **คนอยู่แถว วันอยู่คอลัมน์ ช่องตัดกันคือสถานะของวันนั้น**
 *
 * หน้าทะเบียนประวัติตอบคำถาม “คนนี้เป็นยังไง” ทีละคน · หน้านี้ตอบคนละคำถาม
 * คือ **“กลุ่มนี้เป็นยังไงเทียบกัน”** — หัวหน้าฝึกเปิดดูตอนเช้าแล้วต้องเห็นในแวบเดียว
 * ว่าเมื่อวานใครไม่มา ใครยังไม่ได้ออกงานสักวัน และใครฝึกครบแล้วพร้อมขึ้นงานจริง
 *
 * **ทุกช่องถูกผ่าทแยง** ครึ่งบนคือรหัสที่ระบบ ATMS ดึงมาให้ ครึ่งล่างคือรหัสที่
 * ฝ่ายบุคคลกรอกเอง (กดที่ช่องเพื่อเลือก) — ดูเหตุผลและกติกาที่ `trainee-cell.tsx`
 *
 * **เดือนอยู่ใน URL (`?m=`) ไม่ใช่ state ในเบราว์เซอร์** — เซิร์ฟเวอร์ส่งมาทีละเดือน
 * เพราะการส่งทั้งปีคือ payload หลายเมกะไบต์ที่ถูกใช้แค่หนึ่งในสิบสอง (ดูตัวเลขที่
 * `_lib/drivers/trainee-board.ts`) · แลกด้วยการรอสั้น ๆ ตอนกดเปลี่ยนเดือน
 * ซึ่ง `useTransition` ทำให้ตารางเดิมค้างอยู่จาง ๆ แทนที่จะกะพริบเป็นหน้าเปล่า
 *
 * **ของที่กรอกเก็บเป็น `edits` ทับของจากเซิร์ฟเวอร์** ไม่ใช่ `router.refresh()`
 * ทุกครั้งที่เลือก — refresh หนึ่งครั้งคืออ่านทั้งเดือนใหม่และหน้าจอเด้งกลับไปบนสุด
 *
 * **แบ่งหน้าเพราะจำนวนช่อง ไม่ใช่เพราะจำนวนแถว** — หนึ่งแถวคือ 31 ช่องที่แต่ละช่อง
 * มีสามเหลี่ยม `clip-path` ของตัวเอง · 155 แถวจึงเท่ากับเกือบห้าพันช่อง
 * (~25,000 DOM node) ซึ่งหนักพอจะทำให้เบราว์เซอร์หยุดตอบสนองตอนวาด ·
 * หน้าละ {@link DEFAULT_PAGE_SIZE} แถวเหลือราวแปดร้อยช่อง · ตัวเลขสรุปข้างบนกับ
 * ตัวกรองยัง **นับจากทั้งเดือน ไม่ใช่เฉพาะหน้าที่เปิดอยู่** — การแบ่งหน้าเป็นเรื่อง
 * ของการวาด ไม่ใช่การเปลี่ยนคำตอบว่าเดือนนี้มีใครบ้าง
 */

/** ตัวเลือกจำนวนแถวต่อหน้า — 25 คือค่าที่เปิดมาเจอ */
const PAGE_SIZES = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;

export function TraineeMatrix({
  board,
  vehicles,
}: {
  board: TraineeBoard;
  /** รายชื่อรถให้เลือกตอนผูกทะเบียนรถ — ว่าง = อ่านทะเบียนรถไม่สำเร็จตอนโหลดหน้า */
  vehicles: SelectOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [site, setSite] = useState<SiteFilter>("all");
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);

  const [edits, setEdits] = useState<ManualEdits>(() => new Map());
  /** ทะเบียนรถที่เพิ่งผูก/ถอดในหน้าจอนี้ — ทับของจาก `board.drivers` ท่าเดียวกับ `edits` */
  const [vehicleEdits, setVehicleEdits] = useState<Map<string, TraineeBoardDriver["vehicle"]>>(
    () => new Map(),
  );
  const [editingVehicle, setEditingVehicle] = useState<TraineeBoardDriver | null>(null);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);

  const [year, monthNo] = board.month.split("-").map(Number);

  /** คอลัมน์วันของเดือนที่เลือก พร้อมเลขวันในสัปดาห์ไว้ย้อมเสาร์–อาทิตย์ */
  const days = useMemo(() => {
    const total = new Date(year, monthNo, 0).getDate();
    return Array.from({ length: total }, (_, i) => {
      const day = i + 1;
      return { day, weekday: new Date(year, monthNo - 1, day).getDay() };
    });
  }, [year, monthNo]);

  const filter = useMemo(
    () => ({ sites: site === "all" ? [] : [site], query: deferred }),
    [site, deferred],
  );

  const drivers = useMemo(() => {
    if (!vehicleEdits.size) return board.drivers;
    return board.drivers.map((d) =>
      vehicleEdits.has(d.drivercode) ? { ...d, vehicle: vehicleEdits.get(d.drivercode)! } : d,
    );
  }, [board.drivers, vehicleEdits]);

  const rows = useMemo(
    () => buildTraineeRows(drivers, edits, filter),
    [drivers, edits, filter],
  );

  /*
   * ตัดเป็นหน้า ๆ หลังกรองเสร็จแล้ว — `current` ถูกหนีบด้วย `pageCount` แทนที่จะ
   * `setPage` ตอนตัวกรองเปลี่ยน เพราะการ `setState` ระหว่าง render คือการวาดสองรอบ
   * และ effect ที่ตามมาทีหลังจะทำให้เห็นหน้าเปล่าแวบหนึ่งก่อนเด้งกลับหน้า 1
   */
  /*
   * **คนที่พ้นสภาพในเดือนนี้แยกเป็นกลุ่มท้ายตาราง พับไว้ก่อน** (ตามคำสั่งเจ้าของงาน
   * 29 ก.ย. 2026) — คนที่ยังฝึกอยู่คือคนที่ต้องดูทุกเช้า ส่วนคนที่ออกไปแล้วดูเฉพาะตอน
   * ต้องการ · แบ่งหน้าเฉพาะคนที่ยังอยู่ กลุ่มพ้นสภาพต่อท้ายทุกหน้า (มีไม่กี่คนต่อเดือน)
   * · พิมพ์ค้นหาอยู่ = กางกลุ่มให้เอง ไม่งั้นคนที่ค้นเจอจะซ่อนอยู่ในกลุ่มที่พับไว้
   */
  const [showExited, setShowExited] = useState(false);
  const activeRows = rows.filter((row) => !row.driver.exitedOn);
  const exitedRows = rows.filter((row) => row.driver.exitedOn);
  const exitedOpen = showExited || Boolean(deferred.trim());

  const pageCount = Math.max(1, Math.ceil(activeRows.length / pageSize));
  const current = Math.min(page, pageCount);
  const sliceFrom = (current - 1) * pageSize;
  const pageRows = activeRows.slice(sliceFrom, sliceFrom + pageSize);

  const totals = rows.reduce(
    (acc, row) => ({
      work: acc.work + row.work,
      leave: acc.leave + row.leave,
      exit: acc.exit + row.exit,
      manual: acc.manual + row.manualCount,
    }),
    { work: 0, leave: 0, exit: 0, manual: 0 },
  );
  /** ช่องที่มีสถานะทั้งหมด — ฐานของสัดส่วนแต่ละสี */
  const dayTotal = TONES.reduce((sum, t) => sum + totals[t], 0);

  function clearFilters() {
    setQuery("");
    setSite("all");
    setPage(1);
  }

  /** มีคนที่ไม่อยู่สาขาหลักไหม — แท็บ “อื่น ๆ” ขึ้นเฉพาะตอนนั้น (ท่าเดียวกับทะเบียนประวัติ) */
  const hasOtherSite = useMemo(() => board.drivers.some((d) => !d.siteKey), [board.drivers]);

  /**
   * เก็บผลที่เซิร์ฟเวอร์ตอบกลับ — `null` = ลบบันทึกของวันนั้นไปแล้ว
   *
   * `useCallback` ที่ไม่มี dependency เลยโดยตั้งใจ — ตัวนี้ถูกส่งลงไปถึงทุกช่อง
   * ในตาราง (หลักพัน) ถ้า identity เปลี่ยนทุกครั้งที่ผู้ใช้พิมพ์ในช่องค้นหา
   * `memo` ของ `TraineeCell` จะไม่มีผลเลยสักช่อง
   */
  const applySaved = useCallback(
    (drivercode: string, iso: string, entry: TraineeDailyEntry | null) => {
      setEdits((prev) => {
        const next = new Map(prev);
        next.set(drivercode, { ...(next.get(drivercode) ?? {}), [iso]: entry });
        return next;
      });
    },
    [],
  );

  function goToMonth(month: string) {
    setPage(1);
    startTransition(() => router.push(`?m=${month}`, { scroll: false }));
  }

  const index = board.months.indexOf(board.month);
  const filtering = Boolean(deferred.trim()) || site !== "all";

  return (
    <div className="flex flex-col gap-4">
      {/* ── สรุป + เครื่องมือ — การ์ดกลางตัวเดียวกับทะเบียน พจส. และคำขอสรรหา ──
          ตัวเลขสีทั้งห้าช่องเป็น **คำอธิบายสีของสามเหลี่ยมในตาราง** ไปในตัว */}
      <SummaryPanel label="สรุปติดตามฝึกงาน">
        <SummaryStats className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          <SummaryStat
            lead
            label="คนที่ติดตามอยู่"
            value={activeRows.length}
            unit="คน"
            sub={
              [
                exitedRows.length ? `พ้นสภาพ ${exitedRows.length} คน` : "",
                totals.manual ? `กรอกเอง ${totals.manual.toLocaleString("th-TH")} วัน` : "",
              ]
                .filter(Boolean)
                .join(" · ") || undefined
            }
          />
          {TONES.map((tone) => (
            <SummaryStat
              key={tone}
              label={TONE_LABEL[tone]}
              value={totals[tone]}
              unit="วัน"
              dot={TONE_DOT[tone]}
              share={totals[tone] / (dayTotal || 1)}
              tone={tone === "exit" ? "alert" : "ink"}
            />
          ))}
        </SummaryStats>

        <SummaryToolbar className="lg:flex-wrap">
          <div className="flex items-center gap-1">
            <Step
              label="เดือนก่อนหน้า"
              disabled={pending || index >= board.months.length - 1}
              onClick={() => goToMonth(board.months[index + 1])}
            >
              <ChevronLeft size={15} strokeWidth={1.9} aria-hidden />
            </Step>
            <span
              aria-live="polite"
              className={`min-w-28 text-center text-13-5 font-semibold transition-opacity ${
                pending ? "opacity-40" : ""
              }`}
            >
              {THAI_MONTHS_SHORT[monthNo - 1]} {year + 543}
            </span>
            <Step
              label="เดือนถัดไป"
              disabled={pending || index <= 0}
              onClick={() => goToMonth(board.months[index - 1])}
            >
              <ChevronRight size={15} strokeWidth={1.9} aria-hidden />
            </Step>
          </div>

          <SearchField
            value={query}
            onChange={(next) => {
              setQuery(next);
              setPage(1);
            }}
            label="ค้นหาในตารางติดตามฝึกงาน"
            placeholder="ค้นหาชื่อ รหัส หรือแพล้นท์…"
            tone="filled"
            className="w-full lg:max-w-80 lg:flex-1"
          />

          <SegmentedControl
            label="เลือกสาขา"
            value={site}
            onChange={(next) => {
              setSite(next);
              setPage(1);
            }}
            options={[
              "all" as const,
              ...DRIVER_SITES.map((s) => s.key),
              ...(hasOtherSite ? (["other"] as const) : []),
            ].map((value) => ({ value, label: siteFilterLabel(value) }))}
            className="w-full sm:w-auto sm:self-start lg:self-auto"
          />
        </SummaryToolbar>

        <SummaryStrip className="flex min-h-10 flex-wrap items-center justify-between gap-2 py-1.5 text-12 text-mut">
          <p role="status" aria-live="polite" className="tabular-nums">
            {filtering ? (
              <>
                พบ <span className="font-semibold text-primary">{rows.length}</span> จาก{" "}
                {board.drivers.length} คน
              </>
            ) : (
              <>
                กำลังฝึก <span className="font-semibold text-ink">{activeRows.length}</span> คน
                {exitedRows.length ? ` · พ้นสภาพ ${exitedRows.length} คน` : ""}
              </>
            )}
          </p>
          {filtering ? (
            <button
              type="button"
              onClick={clearFilters}
              className="btn-sec flex cursor-pointer items-center gap-1 px-2 py-0.5 transition-colors hover:border-primary/40 hover:text-ink"
            >
              <X size={12} strokeWidth={2} aria-hidden />
              ล้างตัวกรอง
            </button>
          ) : null}
        </SummaryStrip>

      {board.manualFailed || board.enrichmentFailed ? (
        <p className="flex items-start gap-2 border-t border-line bg-sla/10 px-(--sheet-px) py-2 text-12-5 text-sla">
          <AlertTriangle size={14} strokeWidth={1.9} aria-hidden className="mt-0.5 flex-none" />
          {board.manualFailed
            ? "อ่านบันทึกที่เคยกรอกไว้ไม่สำเร็จ — ปิดการกรอกไว้ก่อนเพื่อไม่ให้เขียนทับของเดิม ลองโหลดหน้าใหม่อีกครั้ง"
            : "ต่อระบบ ATMS ไม่ได้ — ครึ่งบนของทุกช่องจึงยังว่าง ส่วนที่กรอกเองยังใช้ได้ตามปกติ"}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <SummaryBody pad>
          <Empty query={query.trim()} />
        </SummaryBody>
      ) : (
        <>
          {/*
            กล่องเลื่อนสองแกนของตัวเอง — หัววันที่ปักหมุดบน คอลัมน์ชื่อปักหมุดซ้าย
            เหมือนตารางทะเบียนประวัติ · เลื่อนไปวันที่ 28 แล้วยังต้องรู้ว่ากำลังดูของใคร
          */}
          <div
            className={`relative max-h-[calc(100dvh-17.5rem)] overflow-auto border-t border-line bg-base-100 transition-opacity ${
              pending ? "opacity-50" : ""
            }`}
          >
            <table className="border-collapse text-13">
              <thead>
                <tr>
                  <th className="sticky top-0 left-0 z-40 min-w-60 bg-head px-3 py-2 text-left align-bottom text-11-5 font-medium text-mut shadow-[inset_0_-1px_0_var(--color-line-strong)] after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-line">
                    พนักงาน ({activeRows.length.toLocaleString("th-TH")})
                  </th>

                  {days.map(({ day, weekday }) => (
                    <th
                      key={day}
                      scope="col"
                      /* ต้องกว้างพอให้รหัสสามตัว (`A75`) อยู่ในสามเหลี่ยมได้โดยไม่ล้ำอีกครึ่ง
                         · ไม่ย้อมพื้นเสาร์–อาทิตย์แล้ว (23 ก.ย. 2026) — วันอาทิตย์บอกด้วย
                         ตัวหนังสือสี rose อย่างเดียว */
                      className="sticky top-0 z-30 min-w-12 bg-head px-0.5 py-1.5 text-center font-medium shadow-[inset_0_-1px_0_var(--color-line)]"
                    >
                      <span
                        className={`block text-10 leading-tight ${
                          weekday === 0 ? "text-rose" : "text-mut"
                        }`}
                      >
                        {THAI_WEEKDAYS_SHORT[weekday]}
                      </span>
                      <span
                        className={`block font-mono text-12 leading-tight tabular-nums ${
                          weekday === 0 ? "text-rose" : ""
                        }`}
                      >
                        {day}
                      </span>
                    </th>
                  ))}

                  {TONES.map((tone) => (
                    <th
                      key={tone}
                      scope="col"
                      title={`รวมวัน${TONE_LABEL[tone]}`}
                      className="sticky top-0 z-30 min-w-11 bg-head px-1 py-1.5 text-center text-10-5 font-medium text-mut shadow-[inset_0_-1px_0_var(--color-line-strong)]"
                    >
                      <span aria-hidden className={`mx-auto block size-2 rounded-full ${TONE_DOT[tone]}`} />
                      <span className="mt-0.5 block leading-tight">{TONE_LABEL[tone].split(" ")[0]}</span>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {pageRows.map((row) => (
                  <MatrixRow
                    key={row.driver.drivercode}
                    row={row}
                    days={days}
                    year={year}
                    month={monthNo}
                    /* กรอกย้อนหลังได้ไม่จำกัด — ตัดเฉพาะอนาคต และตอนอ่านของเดิมไม่สำเร็จ */
                    maxEntryISO={board.manualFailed ? "" : board.todayISO}
                    onSaved={applySaved}
                    onEditVehicle={setEditingVehicle}
                  />
                ))}
              </tbody>

              {exitedRows.length ? (
                <tbody>
                  <tr className="border-y border-line-strong">
                    {/* ป้ายกลุ่มปักซ้ายเหมือนคอลัมน์ชื่อ — เลื่อนไปวันที่ 28 ก็ยังกดได้ */}
                    <th
                      scope="rowgroup"
                      className="sticky left-0 z-20 bg-alert-soft p-0 text-left after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-line"
                    >
                      <button
                        type="button"
                        onClick={() => setShowExited((v) => !v)}
                        aria-expanded={exitedOpen}
                        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-12-5 font-semibold whitespace-nowrap text-alert transition-colors hover:bg-alert/10"
                      >
                        <ChevronRight
                          size={14}
                          strokeWidth={2}
                          aria-hidden
                          className={`transition-transform ${exitedOpen ? "rotate-90" : ""}`}
                        />
                        พ้นสภาพแล้ว ({exitedRows.length.toLocaleString("th-TH")} คน)
                        <span className="ml-auto text-11 font-normal text-alert/80">
                          {exitedOpen ? "ซ่อน" : "กดดู"}
                        </span>
                      </button>
                    </th>
                    <td colSpan={days.length + TONES.length} className="bg-alert-soft" />
                  </tr>
                  {exitedOpen
                    ? exitedRows.map((row) => (
                        <MatrixRow
                          key={row.driver.drivercode}
                          row={row}
                          days={days}
                          year={year}
                          month={monthNo}
                          maxEntryISO={board.manualFailed ? "" : board.todayISO}
                          onSaved={applySaved}
                          onEditVehicle={setEditingVehicle}
                        />
                      ))
                    : null}
                </tbody>
              ) : null}
            </table>
          </div>

          <SummaryFooter className="flex flex-col gap-3">
          <PageBar
            from={activeRows.length ? sliceFrom + 1 : 0}
            to={sliceFrom + pageRows.length}
            total={activeRows.length}
            current={current}
            count={pageCount}
            pageSize={pageSize}
            onGo={setPage}
            onPageSize={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />

          <Legend />
          </SummaryFooter>
        </>
      )}
      </SummaryPanel>

      {editingVehicle ? (
        <TraineeVehicleModal
          driverName={editingVehicle.name || editingVehicle.drivercode}
          drivercode={editingVehicle.drivercode}
          requisitionId={editingVehicle.requisitionId}
          requisitionCode={editingVehicle.requisitionCode}
          vehicleCode={editingVehicle.vehicle?.code ?? ""}
          vehicles={vehicles}
          onClose={() => setEditingVehicle(null)}
          onSaved={(vehicle) => {
            setVehicleEdits((prev) => {
              const next = new Map(prev);
              next.set(editingVehicle.drivercode, vehicle);
              return next;
            });
          }}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ แถว */

const MatrixRow = memo(function MatrixRow({
  row,
  days,
  year,
  month,
  maxEntryISO,
  onSaved,
  onEditVehicle,
}: {
  row: TraineeRow;
  days: { day: number; weekday: number }[];
  year: number;
  month: number;
  /** กรอกได้ถึงวันไหน (= วันนี้) · ว่าง = ปิดการกรอกทั้งตาราง (อ่านของเดิมไม่สำเร็จ) */
  maxEntryISO: string;
  onSaved: (drivercode: string, iso: string, entry: TraineeDailyEntry | null) => void;
  onEditVehicle: (driver: TraineeBoardDriver) => void;
}) {
  const { driver } = row;
  const href = `/recruitment/admin/drivers/${encodeURIComponent(driver.drivercode)}`;

  return (
    <tr className="group border-b border-line/70 last:border-0">
      <th
        scope="row"
        /*
         * **แถวของคนที่พ้นสภาพในเดือนนี้เป็นธีมแดงทั้งคอลัมน์** — ไม่ใช่แค่ป้ายเล็ก ๆ
         * เพราะคนอ่านกวาดตาดูคอลัมน์ซ้ายทีละสิบแถว ป้ายบรรทัดที่สามถูกมองข้ามได้ง่าย
         * แต่พื้นแดงทั้งช่องบอกได้ตั้งแต่ยังไม่ได้อ่าน · สีชุดเดียวกับที่ทั้งระบบ
         * ใช้กับการพ้นสภาพ (`alert`) และกับรหัส `ลอ`/`ปอ` ในช่องวันของแถวเดียวกัน
         *
         * ⚠️ **พื้นของช่องนี้ต้องทึบทุกสถานะ รวมตอน hover** — เดิม hover เป็น
         * `bg-soft/45` / `bg-alert/12` (โปร่ง) ช่องวันที่เลื่อนผ่านใต้คอลัมน์ชื่อจึง
         * ทะลุขึ้นมาทับชื่อในแถวที่เมาส์ชี้อยู่ ซึ่งคือแถวที่กำลังเลื่อนดูพอดี
         * (แก้ 29 ก.ย. 2026) · `z-20` ให้สูงกว่าทุกอย่างในช่องวัน แต่ต่ำกว่าหัวตาราง
         * ที่ปักบน (`z-30`/`z-40`) ตอนเลื่อนแนวตั้ง
         */
        className={`sticky left-0 z-20 min-w-60 px-3 py-1.5 text-left font-normal after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-line ${
          driver.exitedOn ? "bg-alert-soft" : "bg-base-100 group-hover:bg-base-200"
        }`}
      >
        <span className="flex items-center gap-2.5">
          {/* `DriverAvatar` ไม่ได้ใช้ที่นี่ — ตัวนั้นลากโค้ดอัปโหลดรูปทั้งก้อนเข้ามา
              เพื่อโหมดที่หน้านี้ไม่เคยเปิด และต้องการ `DriverRecord` เต็มใบ */}
          <Avatar
            name={driver.name}
            src={driver.photoUrl || null}
            size="sm"
            tone={driver.exitedOn ? "alert" : "default"}
          />
          <span className="flex min-w-0 flex-col">
            <Link
              href={href}
              className={`truncate text-13 font-medium transition-colors ${
                driver.exitedOn ? "text-alert hover:underline" : "hover:text-primary"
              }`}
            >
              {driver.name || driver.drivercode}
            </Link>
            {driver.exitedOn ? (
              /* แทนที่บรรทัดอายุงาน ไม่ใช่เพิ่มบรรทัดที่สาม — อายุงานของคนที่ออกไปแล้ว
                 ไม่ใช่ข้อมูลที่ใช้ต่อได้ ส่วนวันที่ออกคือสิ่งเดียวที่ต้องรู้ตรงนี้ */
              <span
                title={driver.exitReason || undefined}
                className="flex items-center gap-1.5 text-11 text-alert"
              >
                <span className="font-mono">{driver.drivercode}</span>
                <span aria-hidden>·</span>
                <span className="truncate font-medium">
                  พ้นสภาพ {formatThaiDate(driver.exitedOn)}
                </span>
              </span>
            ) : (
              <span className="flex min-w-0 items-center gap-1.5 text-11 text-mut">
                <span className="font-mono">{driver.drivercode}</span>
                <span aria-hidden>·</span>
                <span>{formatTenure(driver.tenureMonths, driver.tenureDays)}</span>
              </span>
            )}
          </span>

          {/* ทะเบียนรถ — ไม่มีบรรทัดที่สาม ไม่มีคอลัมน์ใหม่ ใส่เป็นไอคอนท้ายชื่อแทน
              ขึ้นเฉพาะคนที่มีคำขอสรรหาผูกอยู่ — ไม่งั้นไม่มีปลายทางให้ `PATCH` ไปแก้
              สีบอกว่ามีทะเบียนแล้วหรือยัง (ครูฝึกแก้ที่หน้าขอสรรหาแทน — ดู
              `.claude/docs/requisitions.md` หัวข้อ “ครูฝึกไหลไปหน้าฝึกงานยังไง”) */}
          {driver.requisitionId ? (
            <button
              type="button"
              onClick={() => onEditVehicle(driver)}
              title={
                driver.vehicle
                  ? `ทะเบียนรถ ${driver.vehicle.plateNo || driver.vehicle.code} — กดเพื่อแก้`
                  : "ยังไม่ระบุทะเบียนรถ — กดเพื่อผูก"
              }
              className={`flex size-6 flex-none cursor-pointer items-center justify-center rounded-selector transition-colors ${
                driver.vehicle
                  ? "text-primary hover:bg-primary/10"
                  : "text-mut hover:bg-base-200 hover:text-ink"
              }`}
            >
              <Car size={14} strokeWidth={1.8} aria-hidden />
            </button>
          ) : null}
        </span>
      </th>

      {days.map(({ day }) => {
        const iso = isoOf(year, month, day);

        const cell = row.byDay.get(day);

        return (
          <TraineeCell
            key={day}
            drivercode={driver.drivercode}
            driverName={driver.name || driver.drivercode}
            iso={iso}
            /* ส่งเป็นสตริง ไม่ใช่อ็อบเจกต์ `DayCell` — `memo` ของช่องถึงจะทำงาน
               (`buildTraineeRows()` สร้าง `DayCell` ใบใหม่ทุกครั้งที่กรอกหนึ่งช่อง) */
            atms={cell?.atms ?? ""}
            manual={cell?.manual ?? ""}
            note={cell?.note ?? ""}
            beforeStart={Boolean(driver.startDateISO) && iso < driver.startDateISO}
            isStart={iso === driver.startDateISO}
            editable={Boolean(maxEntryISO) && iso <= maxEntryISO}
            onSaved={onSaved}
          />
        );
      })}

      {TONES.map((tone) => {
        const value = row[tone];
        return (
          <td key={tone} className="px-1 py-1.5 text-center">
            <span
              className={`font-mono text-12-5 tabular-nums ${
                value ? "font-semibold" : "text-mut/50"
              }`}
            >
              {value || "–"}
            </span>
          </td>
        );
      })}
    </tr>
  );
});

/* ------------------------------------------------------------ ชิ้นย่อย */

/**
 * แถบใต้ตาราง — ช่วงที่แสดงอยู่ (ซ้าย) + จำนวนต่อหน้า และเลขหน้า (ขวา)
 *
 * โครงเดียวกับ `PageBar` ของหน้าทะเบียนประวัติ แต่ที่นี่ **เลือกจำนวนต่อหน้าได้**
 * เพราะต้นทุนต่อแถวต่างกันคนละเรื่อง — แถวของทะเบียนคือไม่กี่ช่อง ส่วนแถวของ
 * ตารางนี้คือ 31 ช่องที่มีสามเหลี่ยม `clip-path` ของตัวเอง · เครื่องแรงเปิด 100
 * ได้สบาย เครื่องที่ฝ่ายบุคคลใช้จริงบางเครื่องแค่ 25 ก็พอแล้ว ให้เลือกเองดีกว่า
 * ตั้งค่าตายตัวแล้วผิดกับใครสักกลุ่มแน่ ๆ
 *
 * `Pager` คืน `null` เองเมื่อมีหน้าเดียว — เดือนที่มีคนไม่ถึง 25 จึงเหลือแต่
 * บรรทัด “แสดง 1–18 จาก 18 คน” ไม่มีปุ่มค้างไว้ให้กดไม่ได้
 */
function PageBar({
  from,
  to,
  total,
  current,
  count,
  pageSize,
  onGo,
  onPageSize,
}: {
  from: number;
  to: number;
  total: number;
  current: number;
  count: number;
  pageSize: number;
  onGo: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const th = (n: number) => n.toLocaleString("th-TH");

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
      <p role="status" aria-live="polite" className="text-12 text-mut">
        แสดง{" "}
        <span className="font-medium text-ink tabular-nums">
          {th(from)}–{th(to)}
        </span>{" "}
        จาก {th(total)} คน
      </p>

      <div className="ms-auto flex items-center gap-2.5">
        <div
          role="group"
          aria-label="จำนวนแถวต่อหน้า"
          className="flex items-center gap-1 text-12 text-mut"
        >
          <span className="hidden sm:inline">ต่อหน้า</span>
          <span className="flex gap-1 rounded-full border border-line bg-base-100 p-1">
            {PAGE_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => onPageSize(size)}
                aria-pressed={size === pageSize}
                className={`cursor-pointer rounded-full px-2.5 py-1 text-12 tabular-nums transition-colors ${
                  size === pageSize
                    ? "bg-ink font-medium text-ink-content"
                    : "text-mut hover:text-ink"
                }`}
              >
                {size}
              </button>
            ))}
          </span>
        </div>

        {count > 1 ? (
          <span className="hidden text-12 text-mut tabular-nums sm:inline">
            หน้า {th(current)} จาก {th(count)}
          </span>
        ) : null}
        <Pager current={current} count={count} onGo={onGo} />
      </div>
    </div>
  );
}

/**
 * คำอธิบายใต้ตาราง — **ภาพของช่องมาก่อนรายการสี**
 *
 * สิ่งแรกที่คนเปิดหน้านี้ครั้งแรกต้องเข้าใจคือ “ทำไมช่องถึงเฉียง” ไม่ใช่ว่าสีไหน
 * แปลว่าอะไร · วาดช่องตัวอย่างขนาดเท่าของจริงให้ดูเทียบกับตารางตรง ๆ
 */
function Legend() {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-12-5">
        <span className="flex items-center gap-2">
          <Swatch half="top" />
          ครึ่งบน = จากระบบ ATMS
        </span>

        <span className="flex items-center gap-2">
          <Swatch half="bottom" />
          ครึ่งล่าง = กรอกเอง — กดที่ช่องแล้วค้นหารหัสได้ ย้อนหลังได้ทุกวัน
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-12">
        <span className="text-mut">ความหมายของสี</span>
        {TONES.map((tone) => (
          <span key={tone} className="flex items-center gap-1.5">
            <span aria-hidden className={`size-2.5 rounded-full ${TONE_DOT[tone]}`} />
            {TONE_LABEL[tone]}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-mut">
          <span aria-hidden className="size-2.5 rounded-full bg-base-300" />
          ไม่มีบันทึก
        </span>
        <span className="flex items-center gap-1.5 text-mut">
          <span aria-hidden className="size-2.5 rounded-full border border-dashed border-line" />
          ก่อนเริ่มงาน
        </span>
      </div>
    </div>
  );
}

/** ช่องตัวอย่างขนาดเท่าของจริง — เทียบกับตารางข้างบนได้ตรง ๆ ไม่ต้องตีความ */
function Swatch({ half }: { half: "top" | "bottom" }) {
  const top = half === "top";

  return (
    <span
      aria-hidden
      className="relative size-9 flex-none overflow-hidden rounded-[5px] bg-base-300/55"
    >
      <span
        className="absolute inset-0"
        style={{
          clipPath: top ? "polygon(0 0, 100% 0, 0 100%)" : "polygon(100% 0, 100% 100%, 0 100%)",
          background: "var(--color-mut)",
        }}
      />
      <span
        className={`absolute font-mono text-12 leading-[1.35] font-bold text-base-100 ${
          top ? "top-0 left-1" : "right-1 bottom-0"
        }`}
      >
        ฝ
      </span>
    </span>
  );
}

function Step({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex size-8 cursor-pointer items-center justify-center rounded-selector border border-line bg-base-100 text-mut transition-colors hover:border-ink/30 hover:text-ink disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Empty({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center gap-2.5 px-5 py-12 text-center">
      <SearchX size={24} strokeWidth={1.6} className="text-mut" aria-hidden />
      <p className="text-sm font-semibold">ไม่มีคนที่ต้องติดตามในเดือนนี้</p>
      <p className="max-w-[48ch] text-12-5 leading-[1.7] text-mut text-pretty">
        {query
          ? `ไม่พบ “${query}” ในขอบเขตที่เลือกไว้`
          : "เดือนนี้ไม่มีใครมีสถานะฝึกงาน (ฝ) — ลองเลื่อนไปเดือนอื่น"}
      </p>
    </div>
  );
}

type SiteFilter = DriverSiteKey | "all" | "other";

function siteFilterLabel(site: SiteFilter): string {
  if (site === "all") return "ทุกสาขา";
  if (site === "other") return "อื่น ๆ";
  return DRIVER_SITES.find((s) => s.key === site)?.label ?? site;
}
