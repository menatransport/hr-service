"use client";

import { memo, useCallback, useDeferredValue, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Plus,
  SearchX,
  X,
} from "lucide-react";

import { Nickname } from "@/app/recruitment/_components/admin/nickname";
import { TraineeCell } from "@/app/recruitment/_components/admin/trainee-cell";
import { TraineeVehicleModal } from "@/app/recruitment/_components/admin/trainee-vehicle-modal";
import { Avatar } from "@/components/ui/avatar";
import { SearchField, type SelectOption } from "@/components/ui/field";
import { XlsxExportButton } from "@/components/ui/xlsx-export-button";
import { xlsxDate, type XlsxColumn, type XlsxExport, type XlsxTone } from "@/lib/xlsx-table";
import {
  SegmentedControl,
  SummaryBody,
  SummaryFooter,
  SummaryPanel,
  SummaryStrip,
  SummaryToolbar,
} from "@/components/ui/summary-panel";
import {
  DRIVER_SITES,
  THAI_MONTHS_FULL,
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
  cellTone,
  dailyKeyOf,
  isoOf,
  TOTAL_PRIOR_MONTHS,
  totalOf,
  type CellTone,
  type ManualEdits,
  type TraineeRow,
} from "@/app/recruitment/_lib/drivers/trainees";

/**
 * คอลัมน์ยอดรวมต่อคน — ปักต่อจากทะเบียน/เบอร์รถ ไม่ใช่ท้ายตาราง (Bew 9 พ.ย. 2569:
 * เดิมต้องเลื่อนผ่าน 31 วันถึงเห็นยอด) · ไม่มี “พ้นสภาพ” — แถวนั้นย้อมแดงทั้งแถว
 * พร้อมวันที่ออกอยู่แล้ว ยอดวันพ้นสภาพจึงซ้ำและเป็นแค่ 0/1 · คำอธิบายสีใต้ตาราง
 * ยังใช้ `TONES` ครบสี่ เพราะช่องวัน `ลอ`/`ปอ` ยังเป็นสีแดง
 */
const SUM_TONES = ["work", "handover", "leave"] as const satisfies readonly CellTone[];

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
 * **แสดงทุกแถวในหน้าเดียว ไม่มีกล่องเลื่อนแนวตั้ง ไม่แบ่งหน้า** (Bew 5 พ.ย. 2569) —
 * RC แคปรูปตารางส่งไลน์ทุกวัน ภาพเดียวต้องได้ครบทุกคน · เดิมแบ่งหน้าละ 25 แถว
 * ตอนตารางนี้ยังรวม พจส. ทั้งทะเบียน (~155 แถว) แต่ตอนนี้เหลือเฉพาะคนในขั้นฝึกงาน
 * (ไม่กี่สิบคน) จำนวนช่องจึงไม่หนักแล้ว · หัวแถบบนตาราง (เดือน · สาขา · จำนวนคน ·
 * ข้อมูล ณ วันที่) อยู่ในกรอบที่แคปด้วย ภาพที่ส่งออกไปจึงอ่านรู้เรื่องโดยไม่ต้องมีหน้าจอประกอบ
 * · แนวนอนยังเลื่อนได้บนจอแคบ โดยคอลัมน์ชื่อ + ทะเบียนรถปักซ้าย
 */

export function TraineeMatrix({
  board,
  vehicles,
  onMonth,
  actions,
  toolbarSlot,
  onDaySaved,
}: {
  board: TraineeBoard;
  /** บันทึกช่องสำเร็จ — `requisitionId` ของแถว (ไม่ผูกคำขอ = id ใบสมัคร/ว่าง) · `prev` = รหัสที่กรอกเองก่อนหน้า */
  onDaySaved?: (requisitionId: string, iso: string, code: string, prev: string) => void;
  /**
   * ที่วางแถบเครื่องมือนอกตาราง — ส่งมา = เครื่องมือย้ายไปอยู่ในกล่องนั้น (portal) ·
   * `null` = กล่องยังไม่เมานต์ (ยังไม่วาด) · ไม่ส่ง = แถบเครื่องมือของตารางเองเหมือนเดิม
   */
  toolbarSlot?: HTMLElement | null;
  /** ปุ่มเพิ่มท้ายแถบเครื่องมือ (ชิดขวา) — เช่น RC Alert ของหน้าผู้สมัคร */
  actions?: React.ReactNode;
  /** ฝังในหน้าอื่น = โหลดเดือนใหม่เอง แทนการเปลี่ยน `?m=` ของ URL */
  onMonth?: (month: string) => Promise<void>;
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

  const [year, monthNo] = board.month.split("-").map(Number);
  /** ช่วงเดือนของยอดรวม เช่น “ก.ย.–พ.ย.” — เดือนแรกมาจากเซิร์ฟเวอร์ (`totalsFrom`) */
  const fromNo = Number((board.totalsFrom || board.month).slice(5, 7));
  const totalsRange =
    fromNo === monthNo
      ? THAI_MONTHS_SHORT[monthNo - 1]
      : `${THAI_MONTHS_SHORT[fromNo - 1]}–${THAI_MONTHS_SHORT[monthNo - 1]}`;

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
   * **คนที่พ้นสภาพในเดือนนี้แยกเป็นกลุ่มท้ายตาราง พับไว้ก่อน** (ตามคำสั่งเจ้าของงาน
   * 29 ก.ย. 2026) — คนที่ยังฝึกอยู่คือคนที่ต้องดูทุกเช้า ส่วนคนที่ออกไปแล้วดูเฉพาะตอน
   * ต้องการ · พิมพ์ค้นหาอยู่ = กางกลุ่มให้เอง ไม่งั้นคนที่ค้นเจอจะซ่อนอยู่ในกลุ่มที่พับไว้
   */
  const [showExited, setShowExited] = useState(false);
  const activeRows = rows.filter((row) => !row.driver.exitedOn);
  const exitedRows = rows.filter((row) => row.driver.exitedOn);
  const exitedOpen = showExited || Boolean(deferred.trim());

  function clearFilters() {
    setQuery("");
    setSite("all");
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
  /* คีย์บันทึกรายวัน → คำขอของแถว — ส่งต่อให้หน้าแม่ (`onDaySaved`) รู้ว่าเป็นของใคร */
  const requisitionOf = useMemo(
    () => new Map(board.drivers.map((d) => [dailyKeyOf(d), d.requisitionId])),
    [board.drivers],
  );

  const applySaved = useCallback(
    (drivercode: string, iso: string, entry: TraineeDailyEntry | null, before: string) => {
      setEdits((prev) => {
        const next = new Map(prev);
        next.set(drivercode, { ...(next.get(drivercode) ?? {}), [iso]: entry });
        return next;
      });
      onDaySaved?.(requisitionOf.get(drivercode) ?? "", iso, entry?.code ?? "", before);
    },
    [onDaySaved, requisitionOf],
  );

  function goToMonth(month: string) {
    if (onMonth) startTransition(() => onMonth(month));
    else startTransition(() => router.push(`?m=${month}`, { scroll: false }));
  }

  const index = board.months.indexOf(board.month);
  const filtering = Boolean(deferred.trim()) || site !== "all";

  /*
   * เครื่องมือของตาราง — เดือน · ค้นหา · สาขา · RC Alert · Excel
   * ฝังในหน้าผู้สมัคร (`toolbarSlot`) = ส่งข้ามไปอยู่แถวเดียวกับปุ่มสลับ “ตาราง | สถานะฝึกงาน”
   * (Bew 5 พ.ย. 2569) ไม่เปลืองอีกแถวเหนือตาราง · state ยังอยู่ที่นี่ที่เดียว ผ่าน portal
   */
  const slotted = toolbarSlot !== undefined;
  const tools = (
    <>
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
        onChange={setQuery}
        label="ค้นหาในตารางติดตามฝึกงาน"
        placeholder="ค้นหาชื่อ รหัส ลูกค้า หรือแพล้นท์…"
        tone="filled"
        className={`w-full lg:flex-1 ${slotted ? "lg:max-w-64" : "lg:max-w-80"}`}
      />

      <SegmentedControl
        label="เลือกสาขา"
        value={site}
        onChange={setSite}
        options={[
          "all" as const,
          ...DRIVER_SITES.map((s) => s.key),
          ...(hasOtherSite ? (["other"] as const) : []),
        ].map((value) => ({ value, label: siteFilterLabel(value) }))}
        className="w-full sm:w-auto sm:self-start lg:self-auto"
      />

      {/* RC Alert + Excel ชิดขวา · ในแถบของหน้าผู้สมัครจะอยู่ก่อนปุ่มสลับมุมมองที่ท้ายแถว */}
      <div className="flex items-center gap-2 lg:ml-auto">
        {actions}
        <XlsxExportButton
          name={`สถานะฝึกงาน-${THAI_MONTHS_SHORT[monthNo - 1]}${year + 543}`}
          count={rows.length}
          build={() =>
            traineeXlsx(rows, days, { year, monthNo, site, query: deferred.trim(), total: board.drivers.length, totalsRange })
          }
          className="h-9 px-3.5 text-12-5"
        />
      </div>
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      {toolbarSlot ? createPortal(tools, toolbarSlot) : null}
      {/* ── เครื่องมือ + ตาราง — ไม่มีการ์ดตัวเลขแล้ว (Bew: เข้ามาเห็นตารางเลย) · สีอธิบายที่ `Legend` */}
      <SummaryPanel label="สรุปติดตามฝึกงาน">
        {slotted ? null : <SummaryToolbar className="lg:flex-wrap">{tools}</SummaryToolbar>}

        {/* หัวของภาพที่แคป — บอกว่าเป็นตารางอะไร เดือนไหน สาขาไหน กี่คน ข้อมูล ณ วันไหน */}
        <SummaryStrip className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-1.5 py-2">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h3 className="text-14 font-semibold text-ink">
              สถานะฝึกงานรายวัน · {THAI_MONTHS_FULL[monthNo - 1]} {year + 543}
            </h3>
            <p role="status" aria-live="polite" className="text-12-5 text-mut tabular-nums">
              {siteFilterLabel(site)} ·{" "}
              {filtering ? (
                <>
                  พบ <span className="font-semibold text-primary">{rows.length}</span> จาก{" "}
                  {board.drivers.length} คน
                </>
              ) : (
                <>
                  ฝึกงาน <span className="font-semibold text-ink">{activeRows.length}</span> คน
                  {exitedRows.length ? ` · พ้นสภาพ ${exitedRows.length} คน` : ""}
                </>
              )}
            </p>
          </div>
          <span className="text-12 text-mut">ข้อมูล ณ {formatThaiDate(board.todayISO)}</span>
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
            ไม่มีกล่องเลื่อนแนวตั้ง — ตารางยาวเท่าจำนวนคน แคปทีเดียวได้ครบ (ดูหัวไฟล์)
            · แนวนอนเลื่อนได้เฉพาะจอแคบ คอลัมน์ชื่อ + ทะเบียนรถปักซ้าย
            เลื่อนไปวันที่ 28 แล้วยังต้องรู้ว่ากำลังดูของใคร รถคันไหน
          */}
          <div
            className={`relative overflow-x-auto border-t border-line bg-base-100 transition-opacity ${
              pending ? "opacity-50" : ""
            }`}
          >
            <table className="w-full border-collapse text-13">
              <thead>
                <tr className="bg-head">
                  <th rowSpan={2} className="border-r border-line sticky left-0 z-30 w-56 min-w-56 bg-head px-3 py-2 text-left align-bottom text-11-5 font-medium text-mut">
                    พนักงาน ({activeRows.length.toLocaleString("th-TH")})
                  </th>
                  <th rowSpan={2} className="border-r border-line sticky left-56 z-30 w-28 min-w-28 bg-head px-2 py-2 text-left align-bottom text-11-5 font-medium whitespace-nowrap text-mut">
                    ทะเบียน / เบอร์รถ
                  </th>
                  {/* ลูกค้า / แพล้นท์ — ปักซ้ายต่อจากทะเบียน (Bew 10 พ.ย. 2569) · เส้นแบ่งกลุ่มปักซ้ายอยู่ท้ายคอลัมน์นี้ */}
                  <th rowSpan={2} className="sticky left-84 z-30 w-32 min-w-32 bg-head px-2 py-2 text-left align-bottom text-11-5 font-medium text-mut after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-line">
                    ลูกค้า / แพล้นท์
                  </th>

                  {/* หัวกลุ่มยอดรวม — บอกช่วงเดือนที่นับครั้งเดียว ไม่ต้องซ้ำทุกคอลัมน์ */}
                  <th
                    colSpan={SUM_TONES.length}
                    scope="colgroup"
                    title={`ยอดวันรวม ${totalsRange} (เดือนที่เปิด + ย้อนหลัง ${TOTAL_PRIOR_MONTHS} เดือน)`}
                    className="border-r border-line bg-head px-1 pt-1.5 pb-0.5 text-center text-10-5 font-medium whitespace-nowrap text-mut"
                  >
                    รวม {totalsRange}
                  </th>

                  {days.map(({ day, weekday }) => {
                    const today = isoOf(year, monthNo, day) === board.todayISO;
                    return (
                      <th
                        key={day}
                        rowSpan={2}
                        scope="col"
                        /* ไม่ย้อมพื้นเสาร์–อาทิตย์แล้ว (23 ก.ย. 2026) — วันอาทิตย์บอกด้วย
                           ตัวหนังสือสี rose อย่างเดียว · วันนี้ = เลขวันในเม็ดขาว */
                        className="min-w-9 bg-head px-0.5 py-1.5 text-center font-medium"
                      >
                        <span
                          className={`block text-10 leading-tight ${
                            weekday === 0 ? "text-rose" : "text-mut"
                          }`}
                        >
                          {THAI_WEEKDAYS_SHORT[weekday]}
                        </span>
                        <span
                          className={`mx-auto mt-0.5 block w-fit rounded-full px-1.5 font-mono text-12 leading-[1.4] tabular-nums ${
                            today
                              ? "bg-white font-bold text-head"
                              : weekday === 0
                                ? "text-rose"
                                : ""
                          }`}
                        >
                          {day}
                        </span>
                      </th>
                    );
                  })}
                </tr>

                <tr className="bg-head">
                  {SUM_TONES.map((tone, i) => (
                    <th
                      key={tone}
                      scope="col"
                      title={`รวมวัน${TONE_LABEL[tone]} ${totalsRange}`}
                      className={`w-12 min-w-12 bg-head px-1 pt-0.5 pb-1.5 text-center align-bottom text-10-5 font-medium text-mut ${
                        i === SUM_TONES.length - 1 ? "border-r border-line" : ""
                      }`}
                    >
                      <span className="inline-flex items-center gap-1 leading-tight whitespace-nowrap">
                        <span aria-hidden className={`size-1.5 flex-none rounded-full ${TONE_DOT[tone]}`} />
                        {TONE_LABEL[tone]}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {activeRows.map((row) => (
                  <MatrixRow
                    key={row.driver.drivercode || `req-${row.driver.requisitionId}`}
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
                      colSpan={3}
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
                    <td colSpan={SUM_TONES.length + days.length} className="bg-alert-soft" />
                  </tr>
                  {exitedOpen
                    ? exitedRows.map((row) => (
                        <MatrixRow
                          key={row.driver.drivercode || `req-${row.driver.requisitionId}`}
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

          <SummaryFooter>
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
  onSaved: (drivercode: string, iso: string, entry: TraineeDailyEntry | null, prev: string) => void;
  onEditVehicle: (driver: TraineeBoardDriver) => void;
}) {
  const { driver } = row;
  const dailyKey = dailyKeyOf(driver);
  /* ยังไม่มีรหัส พจส. = ยังไม่มีสถานะรายวันให้ดู/กรอก — ลิงก์ไปหน้าเส้นทางของคำขอแทน */
  const href = driver.drivercode
    ? `/recruitment/admin/drivers/${encodeURIComponent(driver.drivercode)}`
    : `/recruitment/admin/onboarding/${driver.requisitionId}`;

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
        className={`border-r border-line/70 sticky left-0 z-20 w-56 max-w-56 min-w-56 px-3 py-1.5 text-left font-normal ${
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
            <span className="flex min-w-0 items-baseline gap-1">
              <Link
                href={href}
                className={`truncate text-13 font-medium transition-colors ${
                  driver.exitedOn ? "text-alert hover:underline" : "hover:text-primary"
                }`}
              >
                {driver.name || driver.drivercode}
              </Link>
              <Nickname value={driver.nickname} className="shrink-0 text-12" />
              {/* ผู้ติดต่อกลับ — ป้ายม่วงเล็กท้ายชื่อ (Bew 9 พ.ย. 2569) · เป็นป้ายไม่ใช่วงเล็บ
                  จะได้ไม่ปนกับ “(ชื่อเล่น)” ที่อยู่ติดกัน */}
              {driver.contactOwner ? (
                <span
                  title={`ผู้ติดต่อกลับ: ${driver.contactOwner}`}
                  className="max-w-24 shrink-0 self-center truncate rounded-full border border-st-violet-line bg-st-violet px-1.5 text-10-5 leading-4 font-medium text-st-violet-ink"
                >
                  {driver.contactOwner}
                </span>
              ) : null}
            </span>
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
                {driver.drivercode ? (
                  <span className="font-mono">{driver.drivercode}</span>
                ) : (
                  /* ยังไม่ผูก ATMS — กรอกได้ด้วยคีย์คำขอ (`rq:<id>`) ย้ายไปรหัสจริงเมื่อ RC ผูกรหัส (Bew 3 พ.ย. 2569) */
                  <span className="text-st-wait-ink" title="ลงตารางรายวันได้ · ผูกรหัส พจส. ในข้อมูล RC แล้วบันทึกจะย้ายไปรหัสนั้นให้">
                    ยังไม่มีรหัส พจส.
                  </span>
                )}
              </span>
            )}
          </span>

        </span>
      </th>

      {/* ทะเบียนรถ — คอลัมน์ของตัวเอง ปักซ้ายต่อจากชื่อ (Bew 5 พ.ย. 2569: เดิมเป็นไอคอนรถ
          ท้ายชื่อ ต้องชี้ถึงเห็นเลข แคปรูปส่งแล้วไม่มีทะเบียนติดไป) · แก้ได้เฉพาะคนที่มี
          คำขอสรรหาผูกอยู่ — ไม่งั้นไม่มีปลายทางให้ `PATCH` ไปแก้ (ครูฝึกแก้ที่หน้าขอสรรหา —
          ดู `.claude/docs/requisitions.md` หัวข้อ “ครูฝึกไหลไปหน้าฝึกงานยังไง”) */}
      <td
        className={`border-r border-line/70 sticky left-56 z-20 w-28 min-w-28 px-2 py-1.5 ${
          driver.exitedOn ? "bg-alert-soft" : "bg-base-100 group-hover:bg-base-200"
        }`}
      >
        <PlateCell
          vehicle={driver.vehicle}
          editable={Boolean(driver.requisitionId && driver.drivercode)}
          onEdit={() => onEditVehicle(driver)}
        />
      </td>

      {/* ลูกค้า / แพล้นท์ — สองบรรทัดแบบเดียวกับทะเบียนรถ (Bew 10 พ.ย. 2569) · อ่านอย่างเดียว
          แก้ที่การ์ดคำขอสรรหาในหน้าผู้สมัคร · ไม่มีคำขอ = ขีด */}
      <td
        className={`sticky left-84 z-20 w-32 min-w-32 px-2 py-1.5 after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-line ${
          driver.exitedOn ? "bg-alert-soft" : "bg-base-100 group-hover:bg-base-200"
        }`}
      >
        <CustomerPlantCell customer={driver.customer} plant={driver.plant} />
      </td>

      {/* ยอดรวมต่อคน — ต่อจากทะเบียน ก่อนช่องวัน · 0 = ขีดจาง ให้ตาจับเฉพาะตัวเลขที่มีจริง */}
      {SUM_TONES.map((tone, i) => {
        const value = totalOf(row, tone);
        return (
          <td
            key={tone}
            className={`px-1 py-1.5 text-center group-hover:bg-base-200 ${
              i === SUM_TONES.length - 1 ? "border-r border-line" : ""
            }`}
          >
            <span className={`font-mono text-13 tabular-nums ${value ? "font-semibold text-ink" : "text-mut/40"}`}>
              {value || "–"}
            </span>
          </td>
        );
      })}

      {days.map(({ day }) => {
        const iso = isoOf(year, month, day);

        const cell = row.byDay.get(day);

        return (
          <TraineeCell
            key={day}
            drivercode={dailyKey}
            driverName={driver.name || driver.drivercode}
            iso={iso}
            /* ส่งเป็นสตริง ไม่ใช่อ็อบเจกต์ `DayCell` — `memo` ของช่องถึงจะทำงาน
               (`buildTraineeRows()` สร้าง `DayCell` ใบใหม่ทุกครั้งที่กรอกหนึ่งช่อง) */
            atms={cell?.atms ?? ""}
            manual={cell?.manual ?? ""}
            note={cell?.note ?? ""}
            trial={cell?.trial ?? false}
            beforeStart={Boolean(driver.startDateISO) && iso < driver.startDateISO}
            isStart={iso === driver.startDateISO}
            editable={Boolean(maxEntryISO && dailyKey) && iso <= maxEntryISO}
            onSaved={onSaved}
          />
        );
      })}
    </tr>
  );
});

/* ------------------------------------------------------------ ชิ้นย่อย */

/** ลูกค้า (บน) / แพล้นท์ (ล่าง, จาง) — สองบรรทัดแบบเดียวกับทะเบียนรถ (Bew 10 พ.ย. 2569) · มีอย่างเดียวก็บรรทัดเดียว · ไม่มีเลย = ขีด */
function CustomerPlantCell({ customer, plant }: { customer: string; plant: string }) {
  if (!customer && !plant) return <span className="text-12-5 text-mut/50">–</span>;
  const title = [customer && `ลูกค้า ${customer}`, plant && `แพล้นท์ ${plant}`].filter(Boolean).join(" · ");
  return (
    <span title={title} className="flex min-w-0 flex-col items-start py-1 leading-tight">
      <span className="max-w-full truncate text-12-5 font-medium whitespace-nowrap text-ink">{customer || plant}</span>
      {customer && plant ? (
        <span className="mt-0.5 max-w-full truncate text-11 whitespace-nowrap text-mut">{plant}</span>
      ) : null}
    </span>
  );
}

/**
 * ทะเบียนรถ / เบอร์รถในแถว — สองบรรทัดเรียบ ๆ ไม่มีกรอบ (Bew 9 พ.ย. 2569: เดิมเป็นป้ายกรอบ
 * แบบแผ่นทะเบียน + โชว์แค่อย่างใดอย่างหนึ่ง) · บรรทัดบน = ทะเบียน · บรรทัดล่าง = เบอร์รถ (mono สีจาง)
 * · มีอย่างเดียวก็โชว์บรรทัดเดียว · กดได้ = เปิดหน้าผูก/แก้ · ยังไม่มีแต่แก้ได้ = “+ ผูกรถ” · ไม่มีและแก้ไม่ได้ = ขีด
 */
function PlateCell({
  vehicle,
  editable,
  onEdit,
}: {
  vehicle: TraineeBoardDriver["vehicle"];
  editable: boolean;
  onEdit: () => void;
}) {
  const plateNo = vehicle?.plateNo ?? "";
  const code = vehicle?.code ?? "";

  if (!plateNo && !code) {
    return editable ? (
      <button
        type="button"
        onClick={onEdit}
        title="ยังไม่ระบุรถ — กดเพื่อผูก"
        className="-mx-1.5 inline-flex cursor-pointer items-center gap-1 rounded-selector px-1.5 py-1 text-11-5 whitespace-nowrap text-mut transition-colors hover:bg-primary/8 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
      >
        <Plus size={12} strokeWidth={2} aria-hidden />
        ผูกรถ
      </button>
    ) : (
      <span className="text-12-5 text-mut/50">–</span>
    );
  }

  const body = (
    <span className="flex min-w-0 flex-col items-start leading-tight">
      <span className="truncate text-12-5 font-medium whitespace-nowrap text-ink tabular-nums">
        {plateNo || code}
      </span>
      {plateNo && code ? (
        <span className="mt-0.5 truncate font-mono text-11 whitespace-nowrap text-mut">{code}</span>
      ) : null}
    </span>
  );

  const label = [plateNo && `ทะเบียน ${plateNo}`, code && `เบอร์รถ ${code}`, vehicle?.brand]
    .filter(Boolean)
    .join(" · ");

  return editable ? (
    <button
      type="button"
      onClick={onEdit}
      title={`${label} — กดเพื่อแก้`}
      className="-mx-1.5 flex max-w-[calc(100%+0.75rem)] cursor-pointer rounded-selector px-1.5 py-1 text-left transition-colors hover:bg-primary/8 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
    >
      {body}
    </button>
  ) : (
    <span title={label} className="flex py-1">
      {body}
    </span>
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

/* ------------------------------------------------------------ Excel */

const XLSX_TONE: Record<CellTone, XlsxTone> = { work: "ok", handover: "mut", leave: "warn", exit: "alert" };

/**
 * ไฟล์ Excel ของตารางสถานะฝึกงาน — **หนึ่งแถวต่อคน หนึ่งคอลัมน์ต่อวัน** หน้าตาเดียวกับจอ
 *
 * ช่องวัน = รหัสของวันนั้น · ATMS กับที่กรอกเองไม่ตรงกัน = `ATMS / กรอกเอง` (เช่น `ฝ / ก`)
 * ไม่ทิ้งค่าใดค่าหนึ่ง เหตุผลเดียวกับช่องผ่าทแยงบนจอ · สีตัวหนังสือตามรหัสที่ใช้นับ
 * (ATMS ก่อน — `effectiveCode`) · เหตุผลที่ RC กรอกรวมในคอลัมน์ “หมายเหตุ” ท้ายแถว
 * · ส่งออกตามตัวกรองที่ใช้อยู่ รวมคนที่พ้นสภาพในเดือนนี้ (แม้กลุ่มนั้นพับไว้บนจอ)
 */
function traineeXlsx(
  rows: TraineeRow[],
  days: { day: number; weekday: number }[],
  ctx: { year: number; monthNo: number; site: SiteFilter; query: string; total: number; totalsRange: string },
): XlsxExport<TraineeRow> {
  const monthLabel = `${THAI_MONTHS_FULL[ctx.monthNo - 1]} ${ctx.year + 543}`;
  const codeOf = (row: TraineeRow, day: number) => {
    const cell = row.byDay.get(day);
    if (!cell) return "";
    const { atms, manual } = cell;
    return atms && manual && atms !== manual ? `${atms} / ${manual}` : atms || manual;
  };

  const columns: XlsxColumn<TraineeRow>[] = [
    { header: "ชื่อ-สกุล", width: 24, value: (r) => r.driver.name || r.driver.drivercode },
    { header: "รหัส พจส.", width: 11, kind: "code", value: (r) => r.driver.drivercode },
    { header: "ทะเบียนรถ", width: 13, kind: "code", value: (r) => r.driver.vehicle?.plateNo ?? "" },
    { header: "เบอร์รถ", width: 10, kind: "code", value: (r) => r.driver.vehicle?.code ?? "" },
    { header: "ลูกค้า", width: 12, value: (r) => r.driver.customer },
    { header: "แพล้นท์", width: 14, value: (r) => r.driver.plant },
    { header: "วันเริ่มงาน", width: 12, kind: "date", value: (r) => xlsxDate(r.driver.startDateISO) },
    ...days.map<XlsxColumn<TraineeRow>>(({ day, weekday }) => ({
      header: `${THAI_WEEKDAYS_SHORT[weekday]}\n${day}`,
      width: 6,
      kind: "status",
      value: (r) => codeOf(r, day),
      tone: (r) => {
        const cell = r.byDay.get(day);
        const code = cell ? cell.atms || cell.manual : "";
        return code ? XLSX_TONE[cellTone(code)] : null;
      },
    })),
    ...SUM_TONES.map<XlsxColumn<TraineeRow>>((tone) => ({
      header: `รวม${TONE_LABEL[tone]}\n${ctx.totalsRange}`,
      width: 10,
      kind: "int",
      value: (r) => totalOf(r, tone),
    })),
    {
      header: "สถานะ",
      width: 18,
      kind: "status",
      value: (r) => (r.driver.exitedOn ? `พ้นสภาพ ${formatThaiDate(r.driver.exitedOn)}` : "ฝึกงาน"),
      tone: (r) => (r.driver.exitedOn ? "alert" : "ok"),
    },
    {
      header: "หมายเหตุ",
      width: 40,
      value: (r) =>
        days
          .flatMap(({ day }) => {
            const note = r.byDay.get(day)?.note?.trim();
            return note ? [`${day}: ${note}`] : [];
          })
          .join(" · "),
    },
  ];

  const filter = [ctx.site === "all" ? "" : siteFilterLabel(ctx.site), ctx.query ? `ค้นหา “${ctx.query}”` : ""]
    .filter(Boolean)
    .join(" · ");

  return {
    title: `สถานะฝึกงานรายวัน · ${monthLabel}`,
    sheet: `สถานะฝึกงาน ${THAI_MONTHS_SHORT[ctx.monthNo - 1]} ${ctx.year + 543}`,
    filter,
    total: ctx.total,
    columns,
    rows: [...rows.filter((r) => !r.driver.exitedOn), ...rows.filter((r) => r.driver.exitedOn)],
  };
}

type SiteFilter = DriverSiteKey | "all" | "other";

function siteFilterLabel(site: SiteFilter): string {
  if (site === "all") return "ทุกสาขา";
  if (site === "other") return "อื่น ๆ";
  return DRIVER_SITES.find((s) => s.key === site)?.label ?? site;
}
