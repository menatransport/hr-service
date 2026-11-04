"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, Eye, FileText, Plus, RotateCcw, SearchX, Trash2 } from "lucide-react";

import { ColumnMenu, type ColumnFilterOption, type SortDir } from "@/components/ui/column-menu";
import { SearchField, Select, THAI_MONTHS_FULL } from "@/components/ui/field";
import {
  SummaryPanel,
  SummaryStat,
  SummaryStats,
  SummaryStrip,
  SummaryToolbar,
} from "@/components/ui/summary-panel";
import { TablePager, usePaged } from "@/components/ui/table-pager";
import { XlsxExportButton } from "@/components/ui/xlsx-export-button";
import { requestJson } from "@/lib/http";
import { xlsxDate, type XlsxColumn } from "@/lib/xlsx-table";
import { alertError } from "@/lib/swal";
import { todayInBangkok } from "@/lib/record-case-flow";
import { thaiDate } from "@/app/recruitment/_lib/form";
import { ADMIN_ROOT } from "@/app/recruitment/_lib/admin-nav";
import { STATUS_LABEL, type ApplicationStatus } from "@/app/recruitment/_lib/types";
import type { RequisitionOptions } from "@/app/recruitment/_lib/requisitions/options";
import type { RepairStatus } from "@/app/recruitment/_lib/requisitions/repair-status";
import {
  STAGES,
  STAGE_DOT,
  STAGE_LABEL,
  daysBetween,
  daysToHandover,
  endLabel,
  stageOf,
  stepStates,
  trainingStart,
  val,
  type OnboardingRecord,
  type Stage,
  type Step,
  type StepState,
} from "@/app/recruitment/_lib/requisitions/onboarding";
import {
  customerLabel,
  hireTypeLabel,
  personName,
  positionLabel,
  waitingDays,
  type Requisition,
} from "@/app/recruitment/_lib/requisitions/types";
import { RepairBadge } from "@/app/recruitment/_components/admin/repair-badge";
import { RequisitionForm } from "@/app/recruitment/_components/admin/requisition-form";
import { RequisitionCancelModal } from "@/app/recruitment/_components/admin/requisition-cancel";
import { OnboardingDialog } from "@/app/recruitment/_components/admin/onboarding-dialog";

/**
 * ติดตามพนักงานใหม่ — **หน้าเดียวแทน** ขออัตราสรรหา + Onboarding + ติดตามฝึกงาน (14 ต.ค. 2026)
 *
 * 1 แถว = 1 คำขอ = 1 คน ตลอดเส้นทาง · การ์ดบนสุดคือแท็บตามขั้น (`stageOf()` คิดจาก
 * คำขอ + ใบสมัคร + ข้อมูลฝ่าย + ATMS) แต่ละแท็บโชว์เฉพาะคอลัมน์ที่ขั้นนั้นใช้ ·
 * ไอคอนตาท้ายแถว → dialog รายคน (ที่เดียวที่แก้ข้อมูลฝ่ายได้ · แทนหน้า `/onboarding/[id]`) · ตารางรายวันย้ายไปหน้าผู้สมัคร
 * (กรองฝึกงาน · 25 ต.ค. 2569) · ผู้สมัครยังเป็นหน้าแยก เพราะหลายใบต่อหนึ่งอัตรา
 */

type Row = OnboardingRecord & {
  name: string;
  stage: Stage;
  states: Record<Step, StepState>;
  start: string;
  repair: RepairStatus | null;
};

const DASH = "—";
const date = (v: string) => (v ? thaiDate(v) : DASH);

type Col = {
  id: string;
  label: string;
  width: string;
  text: (r: Row) => string;
  key?: (r: Row) => string;
  noFilter?: boolean;
};

const C = {
  code: { id: "code", label: "เลขที่", width: "min-w-[120px]", noFilter: true, text: (r) => r.code || r.applicant?.ref || "" },
  name: { id: "name", label: "ชื่อ - นามสกุล", width: "min-w-[180px]", noFilter: true, text: (r) => r.name },
  /** คนที่รับรถแล้ว — ชื่อพาไปทะเบียนประวัติ (ข้อมูลหลักของคน) ไม่ใช่หน้าเส้นทาง */
  driver: { id: "driver", label: "ชื่อ - นามสกุล", width: "min-w-[180px]", noFilter: true, text: (r) => r.name },
  applicant: { id: "applicant", label: "ผู้สมัคร", width: "min-w-[200px]", noFilter: true, text: (r) => r.name },
  trainee: { id: "trainee", label: "ผู้ฝึกงาน", width: "min-w-[200px]", noFilter: true, text: (r) => r.name },
  waiting: {
    id: "waiting",
    label: "รอมาแล้ว",
    width: "min-w-[90px]",
    noFilter: true,
    text: (r) => `${waitingDays(r) ?? 0} วัน`,
    key: (r) => String(waitingDays(r) ?? 0).padStart(5, "0"),
  },
  requested: { id: "requested", label: "วันที่แจ้ง", width: "min-w-[110px]", text: (r) => date(r.requestedOn), key: (r) => r.requestedOn },
  customer: { id: "customer", label: "ลูกค้า", width: "min-w-[100px]", text: (r) => customerLabel(r) || DASH },
  plant: { id: "plant", label: "แพล้นท์", width: "min-w-[120px]", text: (r) => r.plant || DASH },
  position: { id: "position", label: "ตำแหน่ง", width: "min-w-[80px]", text: (r) => positionLabel(r) },
  hireType: { id: "hireType", label: "ประเภท", width: "min-w-[90px]", text: (r) => hireTypeLabel(r.hireType) },
  vehicle: {
    id: "vehicle",
    label: "ทะเบียนรถ",
    width: "min-w-[130px]",
    text: (r) => r.vehicle?.plateNo || r.vehicle?.code || DASH,
  },
  /* สถานะซ่อม ณ ตอนนี้จากบอร์ดซ่อม — แยกจากทะเบียนรถให้กรองได้ · คันปกติ = พร้อม · ไม่มีรถ = — */
  repair: { id: "repair", label: "สถานะรถ", width: "min-w-[130px]", text: (r) => r.repair?.label || (r.vehicle ? "พร้อม" : DASH) },
  trainer: { id: "trainer", label: "ครูฝึก", width: "min-w-[150px]", text: (r) => r.trainer?.name || DASH },
  application: {
    id: "application",
    label: "ใบสมัคร",
    width: "min-w-[130px]",
    text: (r) => (r.match?.status ? STATUS_LABEL[r.match.status] : r.match ? "ผูกแล้ว" : "ไม่มีใบสมัคร"),
  },
  drivercode: { id: "drivercode", label: "รหัส", width: "min-w-[80px]", text: (r) => r.drivercode || DASH },
  start: { id: "start", label: "เริ่มฝึก", width: "min-w-[110px]", text: (r) => date(r.start), key: (r) => r.start },
  trainDays: {
    id: "trainDays",
    label: "ฝึกมา",
    width: "min-w-[70px]",
    noFilter: true,
    text: (r) => {
      const d = daysBetween(r.start, todayInBangkok());
      return d === null ? DASH : `${d + 1} วัน`;
    },
    key: (r) => String(daysBetween(r.start, todayInBangkok()) ?? -1).padStart(5, "0"),
  },
  handover: {
    id: "handover",
    label: "รับรถ",
    width: "min-w-[110px]",
    text: (r) => date(val(r.onboarding, "handover", "handoverOn") || r.atms?.firstWork || ""),
    key: (r) => val(r.onboarding, "handover", "handoverOn") || r.atms?.firstWork || "",
  },
  days: {
    id: "days",
    label: "ฝึก→รับรถ",
    width: "min-w-[80px]",
    noFilter: true,
    text: (r) => {
      const d = daysToHandover(r);
      return d === null ? DASH : `${d} วัน`;
    },
    key: (r) => String(daysToHandover(r) ?? -1).padStart(5, "0"),
  },
  atms: {
    id: "atms",
    label: "ATMS ล่าสุด",
    width: "min-w-[140px]",
    text: (r) => (r.atms ? r.atms.latestLabel || r.atms.latestStatus || DASH : DASH),
  },
  /* สถานะในทะเบียน พจส. (sync จาก Google Sheet / หน้าทะเบียน) — รับรถแล้วแต่ออกไปแล้วก็ยังอยู่แท็บนี้ */
  driverStatus: {
    id: "driverStatus",
    label: "สถานะ",
    width: "min-w-[110px]",
    text: (r) => (r.registry ? (r.registry.active ? "ปฏิบัติงาน" : "พ้นสภาพ") : DASH),
  },
  end: { id: "end", label: "ผล", width: "min-w-[140px]", text: (r) => endLabel(r) || DASH },
  endOn: {
    id: "endOn",
    label: "วันที่สิ้นสุด",
    width: "min-w-[110px]",
    text: (r) => date(endOn(r)),
    key: endOn,
  },
} satisfies Record<string, Col>;

const COLUMNS: Record<Stage, Col[]> = {
  open: [C.code, C.waiting, C.requested, C.customer, C.plant, C.position, C.hireType, C.vehicle, C.repair, C.trainer],
  recruiting: [C.applicant, C.code, C.application, C.start, C.waiting, C.customer, C.plant, C.position, C.trainer, C.vehicle, C.repair],
  training: [
    C.trainee, C.drivercode, C.customer, C.plant, C.start, C.trainDays,
    C.trainer, C.vehicle, C.repair,
  ],
  /* ข้อมูลคนอยู่ทะเบียน พจส. แล้ว — แท็บนี้เก็บแค่ผลของ onboarding */
  working: [C.driver, C.code, C.driverStatus, C.customer, C.plant, C.start, C.handover, C.days],
  ended: [C.name, C.code, C.customer, C.plant, C.start, C.end, C.endOn, C.atms],
};

const DEFAULT_SORT: Record<Stage, { column: string; dir: SortDir }> = {
  open: { column: "waiting", dir: "desc" },
  recruiting: { column: "waiting", dir: "desc" },
  training: { column: "start", dir: "desc" },
  working: { column: "handover", dir: "desc" },
  ended: { column: "start", dir: "desc" },
};

/**
 * คอลัมน์ Excel ของแต่ละคอลัมน์บนจอ — ช่องที่จอรวมหลายค่า (รถ · ST) แตกเป็นหลายคอลัมน์
 * · วันที่/จำนวนวันเป็นชนิดจริง · ลำดับตาม `COLUMNS[stage]` ของแท็บที่เปิดอยู่
 */
const num = (n: number | null | undefined) => (n === null || n === undefined ? null : n);
const XLSX: Record<string, XlsxColumn<Row>[]> = {
  code: [{ header: "เลขที่", width: 14, kind: "code", value: C.code.text }],
  name: [{ header: "ชื่อ - นามสกุล", width: 28, value: (r) => r.name }],
  driver: [{ header: "ชื่อ - นามสกุล", width: 28, value: (r) => r.name }],
  applicant: [{ header: "ผู้สมัคร", width: 28, value: (r) => r.name }],
  trainee: [{ header: "ผู้ฝึกงาน", width: 28, value: (r) => r.name }],
  waiting: [{ header: "รอมาแล้ว (วัน)", width: 11, kind: "int", value: (r) => waitingDays(r) ?? 0 }],
  requested: [{ header: "วันที่แจ้ง", width: 13, kind: "date", value: (r) => xlsxDate(r.requestedOn) }],
  customer: [{ header: "ลูกค้า", width: 14, value: C.customer.text }],
  plant: [{ header: "แพล้นท์", width: 18, value: C.plant.text }],
  position: [{ header: "ตำแหน่ง", width: 12, value: C.position.text }],
  hireType: [{ header: "ประเภท", width: 14, value: C.hireType.text }],
  vehicle: [
    { header: "ทะเบียนรถ", width: 14, kind: "code", value: (r) => r.vehicle?.plateNo },
    { header: "เลขรถ", width: 10, kind: "code", value: (r) => r.vehicle?.code },
  ],
  repair: [{ header: "สถานะรถ", width: 16, kind: "status", value: C.repair.text, tone: (r) => (r.repair ? "warn" : r.vehicle ? "ok" : null) }],
  trainer: [{ header: "ครูฝึก", width: 22, value: C.trainer.text }],
  application: [{ header: "ใบสมัคร", width: 18, kind: "status", value: C.application.text }],
  drivercode: [{ header: "รหัส", width: 10, kind: "code", value: (r) => r.drivercode }],
  start: [{ header: "เริ่มฝึก", width: 13, kind: "date", value: (r) => xlsxDate(r.start) }],
  trainDays: [
    {
      header: "ฝึกมา (วัน)",
      width: 10,
      kind: "int",
      value: (r) => {
        const d = daysBetween(r.start, todayInBangkok());
        return d === null ? null : d + 1;
      },
    },
  ],
  handover: [{ header: "รับรถ", width: 13, kind: "date", value: (r) => xlsxDate(C.handover.key(r)) }],
  days: [{ header: "ฝึก→รับรถ (วัน)", width: 12, kind: "int", value: (r) => num(daysToHandover(r)) }],
  atms: [{ header: "ATMS ล่าสุด", width: 20, value: C.atms.text, tone: (r) => (r.atms?.exited ? "alert" : null) }],
  driverStatus: [
    {
      header: "สถานะ",
      width: 12,
      kind: "status",
      value: C.driverStatus.text,
      tone: (r) => (r.registry ? (r.registry.active ? "ok" : "alert") : null),
    },
    { header: "วันที่พ้นสภาพ", width: 13, kind: "date", value: (r) => xlsxDate(r.registry?.resignedOn ?? "") },
    { header: "เหตุผลพ้นสภาพ", width: 22, value: (r) => r.registry?.reason ?? "" },
  ],
  end: [{ header: "ผล", width: 20, kind: "status", value: C.end.text, tone: () => "alert" }],
  endOn: [{ header: "วันที่สิ้นสุด", width: 13, kind: "date", value: (r) => xlsxDate(endOn(r)) }],
};

/** วันที่สิ้นสุด — วันยกเลิกใบสมัคร → ที่ RC กรอก → วันพ้นสภาพใน ATMS */
function endOn(r: OnboardingRecord): string {
  return r.applicant?.cancelledOn || val(r.onboarding, "rc", "exitOn") || (r.atms?.exited ? r.atms.latestDate : "");
}

/** แท็บรับรถแล้วเก็บแค่ 7 วันล่าสุด (นับวันรับรถเป็นวันที่ 1) — เกินนั้นคนอยู่ทะเบียนประวัติ พจส. แล้ว */
const WORKING_DAYS = 7;

/**
 * รับรถเกิน 7 วันและเข้าทะเบียนแล้ว = ไม่ต้องตามต่อในหน้านี้ · ยังไม่เข้าทะเบียน หรือไม่มีวันรับรถ
 * ยังโชว์ไว้ เพราะยังไม่มีที่อื่นให้ดู
 */
function leftForRegistry(r: Row, today: string): boolean {
  const handover = C.handover.key(r);
  if (!r.registry || !handover) return false;
  const d = daysBetween(handover, today);
  return d !== null && d >= WORKING_DAYS;
}

/**
 * แถวของหน้าติดตามพนักงานใหม่ — ขั้น/ความคืบหน้า/บอร์ดซ่อม + ตัดคนรับรถเกิน 7 วันออก
 * · หน้าผู้สมัคร (การ์ดรอสรรหา/รับรถแล้ว) นับจากตัวนี้ด้วย ตัวเลขสองหน้าจึงตรงกันเสมอ
 */
export function hubRows(records: OnboardingRecord[], repairs: Record<string, RepairStatus>): Row[] {
  const today = todayInBangkok();
  return records
    .map((r) => {
      const repair = r.vehicle?.plateNo ? (repairs[r.vehicle.plateNo] ?? null) : null;
      return {
        ...r,
        name: personName(r) || r.code || r.applicant?.ref || "",
        stage: stageOf(r),
        states: stepStates(r, repair),
        start: trainingStart(r),
        repair,
      };
    })
    .filter((r) => r.stage !== "working" || !leftForRegistry(r, today));
}

const monthLabel = (ym: string) =>
  `${THAI_MONTHS_FULL[Number(ym.slice(5, 7)) - 1] ?? ym} ${Number(ym.slice(0, 4)) + 543}`;

export function OnboardingView({
  records: initial,
  repairs,
  options,
  initialStage = "training",
  initialOpen = "",
  embedded = false,
}: {
  records: OnboardingRecord[];
  repairs: Record<string, RepairStatus>;
  /** ฟอร์มขออัตรา — ไม่ส่ง = ไม่มีปุ่มขออัตรา */
  options?: RequisitionOptions;
  initialStage?: Stage;
  /** `?open=<id>` — เปิด dialog ของคำขอนี้ตอนโหลด (ลิงก์เก่า `/onboarding/[id]` redirect มา) */
  initialOpen?: string;
  /**
   * ฝังในหน้าผู้สมัคร (การ์ดรอสรรหา/รับรถแล้ว) — ขั้นเดียว ไม่มีการ์ดขั้น/เดือน/ปุ่มแก้
   * · `records` ตามพ่อแม่สด ๆ (ผูก RQ บนหน้าผู้สมัครแล้วแถวขยับทันที)
   */
  embedded?: boolean;
}) {
  const [own, setRecords] = useState(initial);
  const records = embedded ? initial : own;
  /* เปิดจากลิงก์ `?open=` — ไปแท็บของคนนั้นเลย */
  const [startStage] = useState<Stage>(() => {
    const hit = initialOpen ? initial.find((r) => r.id === initialOpen) : undefined;
    return hit ? stageOf(hit) : initialStage;
  });
  const [stage, setStage] = useState<Stage>(startStage);
  const [sort, setSort] = useState(DEFAULT_SORT[startStage]);
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState("");
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState<Requisition | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewing, setViewing] = useState(initialOpen);
  const router = useRouter();

  const rows = useMemo(() => hubRows(records, repairs), [records, repairs]);

  const months = useMemo(
    () => [...new Set(rows.map((r) => r.requestedOn.slice(0, 7)).filter(Boolean))].sort().reverse(),
    [rows],
  );
  const inMonth = useMemo(
    () => (month ? rows.filter((r) => r.requestedOn.startsWith(month)) : rows),
    [rows, month],
  );

  const counts = useMemo(() => {
    const c = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>;
    for (const r of inMonth) c[r.stage]++;
    return c;
  }, [inMonth]);

  const inStage = useMemo(() => inMonth.filter((r) => r.stage === stage), [inMonth, stage]);

  const avgDays = useMemo(() => {
    const d = inMonth
      .filter((r) => r.stage === "working")
      .map(daysToHandover)
      .filter((n): n is number => n !== null && n >= 0);
    return d.length ? Math.round(d.reduce((a, b) => a + b, 0) / d.length) : null;
  }, [inMonth]);

  const columns = COLUMNS[stage];

  const choices = useMemo(() => {
    const map: Record<string, ColumnFilterOption[]> = {};
    for (const column of columns) {
      const tally = new Map<string, number>();
      for (const row of inStage) tally.set(column.text(row), (tally.get(column.text(row)) ?? 0) + 1);
      map[column.id] = [...tally.entries()]
        .map(([value, count]) => ({ value, label: value, count }))
        .sort((a, b) => a.label.localeCompare(b.label, "th", { numeric: true }));
    }
    return map;
  }, [columns, inStage]);

  const needle = query.trim().toLowerCase();
  const visible = useMemo(() => {
    const list = inStage.filter((row) => {
      if (
        needle &&
        ![row.name, row.code, row.applicant?.ref ?? "", row.drivercode, row.plant, row.trainer?.name ?? "", row.vehicle?.code ?? "", row.vehicle?.plateNo ?? ""].some((t) =>
          t.toLowerCase().includes(needle),
        )
      )
        return false;
      return columns.every((c) => !filters[c.id]?.length || filters[c.id].includes(c.text(row)));
    });
    const column = columns.find((c) => c.id === sort.column) ?? columns[0];
    const read = (r: Row) => (column.key ? column.key(r) : column.text(r));
    return list.sort((a, b) => {
      const order = read(a).localeCompare(read(b), "th", { numeric: true });
      return sort.dir === "asc" ? order : -order;
    });
  }, [inStage, needle, columns, filters, sort]);

  /** หน้าละ 25 แถว — เปลี่ยนขั้น/เดือน/คำค้น/ตัวกรอง/การเรียงแล้วกลับหน้า 1 */
  const [paged, pagedScroll] = usePaged(visible, JSON.stringify([stage, month, needle, filters, sort]));

  const filtering = Boolean(needle) || Object.values(filters).some((p) => p?.length);

  function switchStage(next: Stage) {
    setStage(next);
    setSort(DEFAULT_SORT[next]);
    setFilters({});
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      window.history.replaceState(null, "", url);
    } catch {}
  }

  function clearAll() {
    setFilters({});
    setQuery("");
  }

  /** แถวคำขอที่โมดัลส่งกลับมา — คงข้อมูลฝ่าย/ATMS เดิมไว้ */
  function merge(updated: Requisition) {
    setRecords((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
  }

  async function reopen(row: Row) {
    setBusyId(row.id);
    try {
      merge(
        await requestJson<Requisition>(
          `/api/recruitment/requisitions/${row.id}`,
          { method: "PATCH", body: { status: "open" } },
          "เปิดรับอีกครั้งไม่สำเร็จ",
        ),
      );
    } catch (err) {
      alertError("เปิดรับอีกครั้งไม่สำเร็จ", err instanceof Error ? err.message : undefined);
    } finally {
      setBusyId(null);
    }
  }

  /** บันทึกใน dialog → แถวในตารางตาม · ฝังในหน้าผู้สมัคร = ให้หน้าแม่โหลดใหม่ */
  function saved(next: OnboardingRecord) {
    if (embedded) router.refresh();
    else setRecords((prev) => prev.map((r) => (r.id === next.id ? { ...r, ...next } : r)));
  }

  function closeDialog() {
    setViewing("");
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("open")) {
        url.searchParams.delete("open");
        window.history.replaceState(null, "", url);
      }
    } catch {}
  }

  return (
    <div className="flex flex-col gap-3">
      {embedded ? null : <h1 className="sr-only">ติดตามพนักงานใหม่</h1>}

      <SummaryPanel label={embedded ? STAGE_LABEL[stage] : "ขั้นของพนักงานใหม่"}>
        {embedded ? null : (
        <SummaryStats className="grid-cols-2 md:grid-cols-5">
          {STAGES.map((s) => (
            <SummaryStat
              key={s}
              label={STAGE_LABEL[s]}
              value={counts[s]}
              unit={s === "open" ? "อัตรา" : "คน"}
              dot={STAGE_DOT[s]}
              tone={s === "ended" ? "ink" : "primary"}
              sub={
                s === "working"
                  ? `${WORKING_DAYS} วันล่าสุด${avgDays !== null ? ` · เฉลี่ยฝึก ${avgDays} วัน` : ""}`
                  : undefined
              }
              active={stage === s}
              onClick={() => switchStage(s)}
              className={s === "open" ? "col-span-2 md:col-span-1" : ""}
            />
          ))}
        </SummaryStats>
        )}

        <SummaryToolbar>
          <SearchField
            value={query}
            onChange={setQuery}
            label="ค้นหา"
            placeholder="ชื่อ เลขที่ รหัส แพล้นท์ ครูฝึก รถ…"
            tone="filled"
            className="lg:max-w-sm lg:flex-1"
          />
          {embedded ? null : (
          <Select
            label="เดือนที่แจ้ง"
            value={month}
            onChange={setMonth}
            options={months.map((m) => ({ value: m, label: monthLabel(m) }))}
            placeholder="ทุกเดือน"
            icon={<CalendarDays size={14} strokeWidth={1.8} aria-hidden className="text-mut" />}
            clearable={Boolean(month)}
            className="lg:w-48"
          />
          )}
          <div className="flex items-center gap-2 lg:ml-auto">
            <XlsxExportButton
              className="px-3.5 py-2 text-13"
              name={`ติดตามพนักงานใหม่-${STAGE_LABEL[stage]}`}
              count={visible.length}
              build={() => ({
                sheet: STAGE_LABEL[stage],
                title: `ติดตามพนักงานใหม่ · ${STAGE_LABEL[stage]}`,
                filter: [
                  month ? `เดือนที่แจ้ง: ${monthLabel(month)}` : "",
                  needle ? `คำค้น: “${query.trim()}”` : "",
                  ...columns
                    .filter((c) => filters[c.id]?.length)
                    .map((c) => `${c.label}: ${filters[c.id].join(", ")}`),
                ]
                  .filter(Boolean)
                  .join(" · "),
                total: inStage.length,
                columns: columns.flatMap((c) => XLSX[c.id] ?? []),
                rows: visible,
              })}
            />
            {stage === "open" && options ? (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="btn-pri flex cursor-pointer items-center gap-1.5 px-3.5 py-2 text-13 font-medium"
              >
                <Plus size={16} strokeWidth={2.2} aria-hidden />
                ขออัตรา
              </button>
            ) : stage === "working" ? (
              <Link
                href={`${ADMIN_ROOT}/drivers`}
                className="btn-sec flex items-center gap-1 px-3 py-2 text-13 hover:text-primary"
              >
                ทะเบียนประวัติ พจส.
                <ArrowUpRight size={14} strokeWidth={2} aria-hidden />
              </Link>
            ) : null}
          </div>
        </SummaryToolbar>

        <SummaryStrip className="flex items-center justify-between gap-2 py-2 text-12 text-mut">
          <p role="status" aria-live="polite" className="tabular-nums">
            {filtering ? (
              <>
                <span className="font-semibold text-primary">{visible.length}</span> จาก {inStage.length}
              </>
            ) : (
              <>
                <span className="font-semibold text-ink">{inStage.length}</span> {stage === "open" ? "อัตรา" : "คน"}
              </>
            )}
          </p>
          {filtering ? (
            <button
              type="button"
              onClick={clearAll}
              className="btn-sec flex cursor-pointer items-center gap-1 px-2 py-0.5 hover:text-ink"
            >
              <RotateCcw size={12} strokeWidth={2} aria-hidden />
              ล้างตัวกรอง
            </button>
          ) : null}
        </SummaryStrip>

        <div ref={pagedScroll} className="relative max-h-[calc(100dvh-21rem)] overflow-auto border-y border-line">
          <table className="sheet-table w-full border-collapse text-13">
            <thead>
              <tr>
                {columns.map((column, i) => (
                  <th
                    key={column.id}
                    aria-sort={sort.column === column.id ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                    className={`${column.width} sticky top-0 border-b border-line-strong bg-head px-3 py-0 text-left whitespace-nowrap ${
                      i === 0 ? "left-0 z-20 after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-line" : "z-10"
                    }`}
                  >
                    <ColumnMenu
                      label={column.label}
                      sort={{
                        dir: sort.column === column.id ? sort.dir : null,
                        ascLabel: "น้อย → มาก",
                        descLabel: "มาก → น้อย",
                        onSort: (dir) => setSort(dir ? { column: column.id, dir } : DEFAULT_SORT[stage]),
                      }}
                      filter={
                        column.noFilter
                          ? undefined
                          : {
                              options: choices[column.id] ?? [],
                              selected: filters[column.id] ?? [],
                              onChange: (next) => setFilters((prev) => ({ ...prev, [column.id]: next })),
                            }
                      }
                    />
                  </th>
                ))}
                <th className="sticky top-0 right-0 z-10 w-16 border-b border-line-strong bg-head" />
              </tr>
            </thead>
            <tbody>
              {paged.pageRows.map((row) => (
                <tr key={row.id} className="group border-b border-line transition-colors last:border-b-0 hover:bg-base-200/50">
                  {columns.map((column, i) => (
                    <td
                      key={column.id}
                      className={
                        i === 0
                          ? "sticky left-0 z-[5] bg-base-100 px-3 py-2 whitespace-nowrap after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-line group-hover:bg-base-200"
                          : "px-3 py-2 whitespace-nowrap"
                      }
                    >
                      <Cell column={column} row={row} />
                    </td>
                  ))}
                  <td className="sticky right-0 z-[5] bg-base-100 px-2 py-1 text-right whitespace-nowrap group-hover:bg-base-200">
                    <span className="inline-flex items-center gap-0.5">
                      {journeyId(row) ? (
                        <IconButton label={`ดูรายละเอียด ${row.name || row.code}`} onClick={() => setViewing(journeyId(row))}>
                          <Eye size={15} strokeWidth={1.8} aria-hidden />
                        </IconButton>
                      ) : null}
                      {embedded ? null : row.status === "cancelled" && stage === "ended" && !row.match && !row.hireName && !row.applicant ? (
                        <IconButton label={`เปิดรับอีกครั้ง ${row.code}`} disabled={busyId === row.id} onClick={() => reopen(row)}>
                          <RotateCcw size={14} strokeWidth={1.8} aria-hidden />
                        </IconButton>
                      ) : stage === "open" ? (
                        <IconButton label={`ยกเลิกคำขอ ${row.code}`} danger onClick={() => setCancelling(row)}>
                          <Trash2 size={14} strokeWidth={1.8} aria-hidden />
                        </IconButton>
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {visible.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
              <SearchX size={20} strokeWidth={1.6} aria-hidden className="text-mut" />
              <p className="text-13 font-medium">{filtering ? "ไม่พบรายการที่ตรงกับตัวกรอง" : "ไม่มีรายการในขั้นนี้"}</p>
              {filtering ? (
                <button type="button" onClick={clearAll} className="btn-sec mt-1 px-3 py-1.5 text-12-5 hover:text-primary">
                  ล้างตัวกรอง
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <TablePager paged={paged} unit={stage === "open" ? "อัตรา" : "คน"} className="-mt-px" />
      </SummaryPanel>

      {/* ตารางฝึกงานรายวันย้ายไปอยู่ใต้ตารางผู้สมัคร (กรองฝึกงาน) ของ RC แล้ว — Bew 25 ต.ค. 2569 */}

      {creating && options ? (
        <RequisitionForm
          options={options}
          onClose={() => setCreating(false)}
          onCreated={(created) =>
            setRecords((prev) => [...created.map((r) => ({ ...r, onboarding: {}, atms: null })), ...prev])
          }
        />
      ) : null}
      {cancelling ? (
        <RequisitionCancelModal row={cancelling} onClose={() => setCancelling(null)} onCancelled={merge} />
      ) : null}
      {viewing ? <OnboardingDialog id={viewing} onClose={closeDialog} onSaved={saved} /> : null}
    </div>
  );
}

/** คำขอที่ dialog เปิดได้ — ใบสมัครยกเลิกใช้คำขอที่เคยผูก · ไม่เคยผูก = ไม่มี dialog */
function journeyId(row: Row): string {
  return row.applicant ? row.applicant.requisitionId : row.id;
}

/** สีวงกลมหน้าชื่อผู้สมัคร = สถานะใบสมัคร (ชุดเดียวกับหน้าผู้สมัคร) */
const APPLICANT_TONE: Record<ApplicationStatus, string> = {
  pending_contact: "bg-st-wait text-st-wait-ink",
  interview_scheduled: "bg-st-wait text-st-wait-ink",
  interview_passed: "bg-st-live text-st-live-ink",
  training: "bg-st-live text-st-live-ink",
  working: "bg-st-live text-st-live-ink",
  cancelled: "bg-alert/12 text-alert",
};

function Cell({ column, row }: { column: Col; row: Row }) {
  const text = column.text(row);

  /* ผู้สมัครที่ยกเลิก — ชื่อพาไปหน้าผู้สมัคร · เลขที่ = อัตราที่เคยอยู่ หรือเลขใบสมัครถ้าไม่เคยผูก */
  if (row.applicant && (column.id === "name" || column.id === "code")) {
    const toCandidate = `${ADMIN_ROOT}/candidates?${new URLSearchParams({ ref: row.applicant.ref })}`;
    return column.id === "name" ? (
      <Link href={toCandidate} title="ดูใบสมัคร" className="font-medium underline decoration-line decoration-dotted underline-offset-4 hover:text-primary">
        {row.name}
      </Link>
    ) : (
      <span className="font-mono text-11 tracking-wider text-primary">{row.code || row.applicant.ref}</span>
    );
  }

  switch (column.id) {
    case "code":
      return <span className="font-mono text-11 tracking-wider text-primary">{row.code}</span>;
    case "name":
      return <span className="font-medium">{row.name}</span>;
    case "driver":
      return row.drivercode ? (
        <Link
          href={`${ADMIN_ROOT}/drivers/${row.drivercode}`}
          title={`ทะเบียนประวัติ · ${row.drivercode}`}
          className="font-medium underline decoration-line decoration-dotted underline-offset-4 hover:text-primary"
        >
          {row.name}
        </Link>
      ) : (
        <span className="font-medium">{row.name}</span>
      );
    case "applicant":
    case "trainee":
      return (
        <span className="inline-flex items-center gap-2.5 font-medium">
          <span
            className={`flex size-7 flex-none items-center justify-center rounded-full ${
              row.match?.status ? APPLICANT_TONE[row.match.status] : "bg-primary/10 text-primary"
            }`}
          >
            <FileText size={14} strokeWidth={2} aria-hidden />
          </span>
          {row.name}
        </span>
      );
    case "drivercode":
      return row.drivercode ? (
        <Link href={`${ADMIN_ROOT}/drivers/${row.drivercode}`} className="font-mono text-12 hover:text-primary">
          {row.drivercode}
        </Link>
      ) : (
        <span className="text-mut">{DASH}</span>
      );
    case "vehicle":
      return row.vehicle ? (
        <span className="flex flex-col leading-tight">
          <span className="whitespace-nowrap">{row.vehicle.plateNo || row.vehicle.code}</span>
          {row.vehicle.plateNo && row.vehicle.code ? (
            <span className="font-mono text-11 text-mut">{row.vehicle.code}</span>
          ) : null}
        </span>
      ) : (
        <span className="text-mut">{DASH}</span>
      );
    case "repair":
      if (row.repair) return <RepairBadge repair={row.repair} compact className="" />;
      return row.vehicle ? (
        <span className="rounded-full bg-st-live px-2 py-0.5 text-12 font-medium text-st-live-ink">{text}</span>
      ) : (
        <span className="text-mut">{DASH}</span>
      );
    case "driverStatus":
      if (!row.registry) return <span className="text-mut">{DASH}</span>;
      return row.registry.active ? (
        <span className="rounded-full bg-st-live px-2 py-0.5 text-12 font-medium text-st-live-ink">{text}</span>
      ) : (
        <span className="flex flex-col items-start leading-tight" title={row.registry.reason || undefined}>
          <span className="rounded-full bg-alert/12 px-2 py-0.5 text-12 font-medium text-alert">{text}</span>
          {row.registry.resignedOn ? <span className="mt-0.5 text-11 text-mut">{date(row.registry.resignedOn)}</span> : null}
        </span>
      );
    case "end":
      return text === DASH ? <span className="text-mut">{DASH}</span> : <span className="font-medium text-alert">{text}</span>;
    case "atms":
      return <span className={row.atms?.exited ? "text-alert" : text === DASH ? "text-mut" : ""}>{text}</span>;
    default:
      return <span className={text === DASH ? "text-mut" : ""}>{text}</span>;
  }
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex size-7 items-center justify-center rounded-selector text-mut transition-colors disabled:opacity-40 ${
        danger ? "hover:bg-alert/10 hover:text-alert" : "hover:bg-base-200 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
