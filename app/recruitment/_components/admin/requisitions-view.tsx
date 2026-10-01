"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  ArrowUpRight,
  Building2,
  ClipboardList,
  Plus,
  RotateCcw,
  SearchX,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import { ColumnMenu, type ColumnFilterOption, type SortDir } from "@/components/ui/column-menu";
import { SearchField, Select } from "@/components/ui/field";
import {
  SummaryPanel,
  SummaryStat,
  SummaryStats,
  SummaryStrip,
  SummaryToolbar,
} from "@/components/ui/summary-panel";
import { requestJson } from "@/lib/http";
import { alertError } from "@/lib/swal";
import { thaiDate } from "@/app/recruitment/_lib/form";
import type { RequisitionOptions } from "@/app/recruitment/_lib/requisitions/options";
import {
  HIRE_TYPE_TONE,
  REQUISITION_STATUS_LABEL,
  REQUISITION_STATUS_TONE,
  STALE_DAYS,
  cancelReasonLabel,
  customerLabel,
  hireTypeLabel,
  isClosed,
  isStale,
  positionLabel,
  replaceSummary,
  waitingDays,
  type Requisition,
  type RequisitionPatch,
  type RequisitionStatus,
} from "@/app/recruitment/_lib/requisitions/types";
import { RequisitionForm } from "@/app/recruitment/_components/admin/requisition-form";
import { RequisitionCancelModal } from "@/app/recruitment/_components/admin/requisition-cancel";

/**
 * แท็บ “คำขอสรรหา” — **ตารางเดียวจบ** ไม่มีหน้ารายละเอียดแยก
 *
 * อยู่ใต้หัวเดียวกับตารางผู้สมัครแล้ว (ดู `recruitment-tabs.tsx`) — หัวเรื่อง
 * ปุ่ม “ขอสรรหา” และแถบแท็บอยู่บนสุดของไฟล์นี้ ส่วน `rows` ถือโดยตัวแท็บ
 * เพราะตัวเลขงานค้างบนหัวแท็บต้องขยับตามทันทีที่ยกเลิก/เปิดรับคำขอ
 *
 * ฝ่ายสรรหาเปิดตอนเช้าแล้วต้องตอบได้ในแวบเดียวว่า *ตอนนี้มีอัตราไหนค้างอยู่
 * ค้างมานานแค่ไหน และอัตราไหนเริ่มฝึกงานแล้ว* — แถบตัวเลขบนการ์ดสรุป
 * (`components/ui/summary-panel.tsx` ตัวเดียวกับทะเบียน พจส.) ตอบคำถามนั้นตรง ๆ
 * และกดแล้วกรองตารางข้างล่างให้เลย · ช่องค้นหาบนการ์ดค้นทุกคอลัมน์พร้อมกัน · การ์ดชุดนี้เป็นของแท็บนี้ตัวเดียว
 * (แท็บผู้สมัครมี `CandidateInsights` ของตัวเอง) จึงไม่มีทางอ่านสลับกัน
 *
 * ยึดท่าเดียวกับตารางผู้สมัครทั้งหมด: **ตัวกรองอยู่ที่หัวคอลัมน์ที่มันกรอง**
 * ไม่มีแถบตัวกรองลอยอยู่เหนือตาราง · ไม่ติ๊กอะไร = ไม่กรอง · กดปุ่มเรียงที่
 * ทำงานอยู่ซ้ำ = ถอยกลับลำดับตั้งต้น ไม่ใช่ “ไม่เรียงอะไรเลย”
 *
 * ทั้งสองตารางใช้ `ColumnMenu` ตัวเดียวกันแล้ว (22 ก.ย. 2026 — ตารางผู้สมัคร
 * ย้ายจาก `SheetHeader` มาใช้ตัวนี้ตอนรวมหน้า) หัวคอลัมน์จึงหน้าตาและกดเหมือนกัน
 * เป๊ะทั้งคู่ และได้ `useOverlayCount()` ติดมาด้วย — Esc ครั้งแรกปิดแค่เมนูคอลัมน์
 * ไม่ทะลุไปปิดโมดัลที่เปิดค้างอยู่
 *
 * **กดชื่อในคอลัมน์ “ผู้สมัครที่รับอัตรา” แล้วข้ามไปแท็บผู้สมัครพร้อมกรองไว้ให้**
 * (`onOpenCandidate`) — สะพานเส้นเดียวระหว่างสองตาราง และเป็นเหตุผลหลักที่รวม
 * สองหน้าเข้าด้วยกัน · ทางกลับไม่มีโดยตั้งใจ เพราะใบสมัครหนึ่งใบผูกได้กับคำขอ
 * เดียวและเลขที่คำขอไม่ได้อยู่ในแถวผู้สมัคร การทำย้อนกลับต้องแก้ชั้นข้อมูลด้วย
 *
 * **ตารางอ่านอย่างเดียวเกือบทั้งตัว ยกเว้น "ครูฝึก"** (ถอดปุ่มดินสอ/`RequisitionEditModal`
 * ออกตามคำขอ 22 ก.ย. 2026 แล้วขอครูฝึกกลับมาแก้ที่นี่อีกทีในวันเดียวกัน) — ผู้สมัคร
 * ที่ผูก · รหัส พจส. ไม่มีทางแก้จากหน้านี้ · **ทะเบียนรถแก้ที่หน้าติดตามฝึกงานแทน**
 * (`/recruitment/admin/trainees`) ตอนที่ผู้สมัครเริ่มฝึกงานแล้ว (ไม่บังคับ แก้เมื่อไหร่
 * ก็ได้) — ที่นี่ยังโชว์ทะเบียนรถเป็นข้อมูลอ้างอิงต่อไป แค่แก้ไม่ได้แล้ว
 *
 * **ครูฝึกแก้ในช่องได้ตรง ๆ (`TrainerCell`)** — ต่างจากช่องอื่นที่ถูกล็อกเป็นอ่าน
 * อย่างเดียวหมด เพราะเจ้าของงานขอกลับมาโดยเฉพาะ (22 ก.ย. 2026 — เอาออกจากหน้า
 * ติดตามฝึกงานที่เคยทำไว้ให้แทน) แก้ได้ทุกสถานะรวมถึงคำขอที่ปิดแล้ว เพราะครูฝึก
 * เปลี่ยนตัวได้ระหว่างที่คนใหม่ยังฝึกอยู่ ซึ่งเกิดหลังคำขอ `filled` เสมอ
 *
 * ไอคอน Action ท้ายแถวเหลือแค่ **ยกเลิก/เปิดรับอีกครั้ง**: ถังขยะเปิดโมดัลยกเลิก
 * (`RequisitionCancelModal` — เลือกเหตุผลแล้วค่อยยืนยัน) คำขอที่ยกเลิกแล้วสลับ
 * ถังขยะเป็นปุ่ม “เปิดรับอีกครั้ง” แทน — **ไม่ใช่ปุ่มลบจริง** (ดู
 * `.claude/docs/requisitions.md` หัวข้อ “ตัดทิ้งโดยตั้งใจ”) สถานะ `matched`/`filled`
 * ยังคงเป็นสิ่งที่ระบบตั้งให้เองตามความคืบหน้าของใบสมัคร ไม่มีทางกดเปลี่ยนเองได้
 * ไม่ว่าจะผ่านช่องไหน
 */

/* ------------------------------------------------------------ นิยามคอลัมน์ */

/**
 * นิยามที่เดียวของทั้งตาราง — `text` คือค่าที่ขึ้นจอ ใช้เรียง **และ** ใช้เป็นรายการ
 * ติ๊กกรอง เว้นแต่มี `key` แยกไว้ต่างหากสำหรับเรียง (ค่าที่ขึ้นจอเรียงตามตัวอักษร
 * ไม่ได้ตรงกับลำดับจริง เช่นป้ายวันที่ภาษาไทย)
 *
 * **ทุกช่องในแถวเป็นบรรทัดเดียว** — ข้อมูลที่เคยอัดสองบรรทัดในช่องเดียว (วันที่แจ้ง
 * ใต้เลขที่คำขอ · แพล้นท์ใต้ลูกค้า · เบอร์รถใต้ทะเบียน) ถูกแยกเป็นคอลัมน์ของตัวเอง
 * แทน ส่วนรายละเอียดที่ไม่ใช่ข้อมูลหลักของคอลัมน์ (เหตุผลที่ต้องแทนคนเดิม ·
 * เหตุผลที่ยกเลิก) ใช้ `title` ให้เมาส์ hover ขึ้น tooltip แทนการขึ้นบรรทัดสอง
 *
 * **คอลัมน์แรกคือเลขที่คำขอ ไม่ใช่ “รอมาแล้ว”** (สลับ 22 ก.ย. 2026 ตอนรวมหน้า) —
 * คอลัมน์แรกคือคอลัมน์ที่ปักซ้ายไว้ตอนเลื่อนแนวนอน มันจึงต้องเป็นตัวที่**บอกว่า
 * แถวนี้คือใบไหน** เหมือนที่ตารางผู้สมัครปักชื่อคนไว้ · “12 วัน” ที่ค้างอยู่ตรงนั้น
 * ไม่ได้บอกว่ากำลังดูคำขอใบไหน ทำให้เลื่อนไปแก้ครูฝึกผิดใบได้ · ตัวเลขวันยังอยู่
 * ติดกันเป็นคอลัมน์ถัดไป และยังเป็นสีเตือนเมื่อค้างนานเหมือนเดิม
 */
const COLUMNS = [
  {
    id: "code",
    label: "เลขที่คำขอ",
    width: "min-w-[130px]",
    asc: "เก่า → ใหม่",
    desc: "ใหม่ → เก่า",
    /* เลขที่ไม่ซ้ำกันเลยสักแถว รายการติ๊กที่ยาวเท่าจำนวนคำขอกรองอะไรไม่ได้จริง
       (เหตุผลเดียวกับคอลัมน์ประทับเวลาในตารางผู้สมัคร) — วันที่แจ้งแยกเป็น
       คอลัมน์ของตัวเองแล้ว ใช้กรองตามวันแทน */
    noFilter: true,
    text: (r: Requisition) => r.code,
  },
  {
    id: "waiting",
    label: "รอมาแล้ว",
    width: "min-w-[100px]",
    asc: "น้อย → มาก",
    desc: "มาก → น้อย",
    /* ตัวเลขต่อเนื่อง ติ๊กเลือกไม่ได้จริง — กรอง “ค้างนาน” ผ่านการ์ดสรุปแทน */
    noFilter: true,
    text: (r: Requisition) => waitingText(r),
    key: (r: Requisition) => String(waitingDays(r) ?? -1).padStart(6, "0"),
  },
  {
    id: "requestedOn",
    label: "วันที่แจ้งคำขอ",
    width: "min-w-[130px]",
    asc: "เก่า → ใหม่",
    desc: "ใหม่ → เก่า",
    text: (r: Requisition) => thaiDate(r.requestedOn),
    /* เรียงด้วยวันที่จริง (`YYYY-MM-DD` เรียงตามตัวอักษรได้ถูกอยู่แล้ว) ไม่ใช่
       ป้ายไทยที่โชว์บนจอ */
    key: (r: Requisition) => r.requestedOn,
  },
  {
    id: "customer",
    label: "ลูกค้า",
    width: "min-w-[120px]",
    asc: "ก → ฮ",
    desc: "ฮ → ก",
    text: (r: Requisition) => customerLabel(r),
  },
  {
    id: "plant",
    label: "แพล้นท์",
    width: "min-w-[130px]",
    asc: "ก → ฮ",
    desc: "ฮ → ก",
    text: (r: Requisition) => r.plant || DASH,
  },
  {
    id: "position",
    label: "ตำแหน่งที่ขอ",
    width: "min-w-[120px]",
    asc: "ก → ฮ",
    desc: "ฮ → ก",
    text: (r: Requisition) => positionLabel(r),
  },
  {
    id: "hireType",
    label: "ประเภทอัตรา",
    width: "min-w-[130px]",
    asc: "ก → ฮ",
    desc: "ฮ → ก",
    text: (r: Requisition) => hireTypeLabel(r.hireType),
  },
  {
    id: "vehiclePlate",
    label: "ทะเบียนรถ",
    width: "min-w-[150px]",
    asc: "ก → ฮ",
    desc: "ฮ → ก",
    text: (r: Requisition) => vehiclePlateText(r),
  },
  {
    id: "vehicleCode",
    label: "เบอร์รถ",
    width: "min-w-[100px]",
    asc: "ก → ฮ",
    desc: "ฮ → ก",
    text: (r: Requisition) => r.vehicle?.code || NO_VEHICLE,
  },
  {
    id: "trainer",
    label: "ครูฝึกที่ดูแล",
    width: "min-w-[150px]",
    asc: "ก → ฮ",
    desc: "ฮ → ก",
    text: (r: Requisition) => r.trainer?.name || NO_TRAINER,
  },
  {
    id: "candidate",
    label: "ผู้สมัครที่รับอัตรา",
    width: "min-w-[190px]",
    asc: "ก → ฮ",
    desc: "ฮ → ก",
    text: (r: Requisition) => r.match?.fullName || NO_MATCH,
  },
  {
    id: "status",
    label: "สถานะคำขอ",
    width: "min-w-[130px]",
    asc: "ก → ฮ",
    desc: "ฮ → ก",
    text: (r: Requisition) => REQUISITION_STATUS_LABEL[r.status],
  },
] as const;

const NO_VEHICLE = "ยังไม่ระบุรถ";
const NO_TRAINER = "ยังไม่ระบุครูฝึก";
const NO_MATCH = "ยังไม่ผูกผู้สมัคร";
/** ขีดกลางเฉย ๆ — ใช้กับช่องที่ไม่มีค่า แต่ไม่ต้องมีข้อความอธิบายยาว ๆ (แพล้นท์ · เบอร์รถ) */
const DASH = "—";

/** ทะเบียน + ยี่ห้อ รวมบรรทัดเดียว — ใช้ทั้งเป็นค่าที่ขึ้นจอและค่าที่กรอง/เรียง */
function vehiclePlateText(r: Requisition): string {
  if (!r.vehicle) return NO_VEHICLE;
  return [r.vehicle.plateNo, r.vehicle.brand].filter(Boolean).join(" · ") || NO_VEHICLE;
}

type ColumnId = (typeof COLUMNS)[number]["id"];
type Filters = Partial<Record<ColumnId, string[]>>;

/** ลำดับตั้งต้น — คำขอใหม่สุดอยู่บนสุด · เลขที่เรียงตามเดือนอยู่แล้วจึงใช้แทนวันที่ได้ */
const DEFAULT_SORT: { column: ColumnId; dir: SortDir } = { column: "code", dir: "desc" };

function facetOf(column: (typeof COLUMNS)[number], row: Requisition): string {
  return column.text(row);
}

/** คำขอที่ปิดแล้วไม่ต้องขึ้นตัวเลข — “รออีกกี่วัน” ของงานที่จบแล้วไม่มีความหมาย */
function waitingText(r: Requisition): string {
  if (isClosed(r)) return "ปิดแล้ว";
  const days = waitingDays(r);
  return days === null ? "—" : `${days} วัน`;
}

/* ------------------------------------------------------------------- หน้าจอ */

export function RequisitionsView({
  title,
  tabs,
  rows,
  setRows,
  options,
  onOpenCandidate,
}: {
  /** หัวเรื่องของทั้งหน้า — ตัวเดียวกับที่แท็บผู้สมัครใช้ ไม่ใช่ชื่อแท็บ */
  title: string;
  /** แถบแท็บของทั้งหน้า วาดโดย `recruitment-tabs.tsx` แล้วส่งมาวางใต้หัวเรื่อง */
  tabs: React.ReactNode;
  rows: Requisition[];
  setRows: Dispatch<SetStateAction<Requisition[]>>;
  options: RequisitionOptions;
  /** ข้ามไปแท็บผู้สมัครพร้อมกรองไว้ที่เลขที่ใบสมัครนั้น */
  onOpenCandidate: (ref: string) => void;
}) {
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [filters, setFilters] = useState<Filters>({});
  /** การ์ด “ค้างเกิน N วัน” — ไม่ใช่ค่าในคอลัมน์ไหน จึงเป็นตัวกรองของตัวเอง */
  const [staleOnly, setStaleOnly] = useState(false);
  /** ค้นทุกคอลัมน์ในแถวพร้อมกัน — เลขที่ ลูกค้า ตำแหน่ง ชื่อผู้สมัคร ครูฝึก ฯลฯ */
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** แถวที่กำลังเลือกเหตุผลยกเลิก (ไอคอนถังขยะ) */
  const [cancelling, setCancelling] = useState<Requisition | null>(null);

  const counts = useMemo(
    () => ({
      open: rows.filter((r) => r.status === "open").length,
      matched: rows.filter((r) => r.status === "matched").length,
      filled: rows.filter((r) => r.status === "filled").length,
      cancelled: rows.filter((r) => r.status === "cancelled").length,
      stale: rows.filter(isStale).length,
    }),
    [rows],
  );

  /** ค่าที่มีจริงในแต่ละคอลัมน์ + จำนวนแถวของแต่ละค่า */
  const choices = useMemo(() => {
    const map = {} as Record<ColumnId, ColumnFilterOption[]>;
    for (const column of COLUMNS) {
      const tally = new Map<string, number>();
      for (const row of rows) {
        const value = facetOf(column, row);
        tally.set(value, (tally.get(value) ?? 0) + 1);
      }
      map[column.id] = [...tally.entries()]
        .map(([value, count]) => ({ value, label: value, count }))
        .sort((a, b) => a.label.localeCompare(b.label, "th", { numeric: true }));
    }
    return map;
  }, [rows]);

  const needle = query.trim().toLowerCase();

  const visible = useMemo(() => {
    const matched = rows.filter((row) => {
      if (staleOnly && !isStale(row)) return false;
      if (needle && !COLUMNS.some((c) => c.text(row).toLowerCase().includes(needle))) return false;
      return COLUMNS.every((column) => {
        const picked = filters[column.id];
        return !picked?.length || picked.includes(facetOf(column, row));
      });
    });

    const column = COLUMNS.find((c) => c.id === sort.column) ?? COLUMNS[0];
    const read = (r: Requisition) => ("key" in column ? column.key(r) : column.text(r));

    return [...matched].sort((a, b) => {
      const order = read(a).localeCompare(read(b), "th", { numeric: true });
      return sort.dir === "asc" ? order : -order;
    });
  }, [rows, filters, staleOnly, needle, sort]);

  const customerPicked = filters.customer ?? [];

  const filtering =
    Boolean(needle) || staleOnly || Object.values(filters).some((p) => p?.length);
  /** คำขอที่ยังไม่ปิด — ฐานของสัดส่วน “ค้างเกิน N วัน” */
  const active = counts.open + counts.matched;

  function clearAll() {
    setFilters({});
    setStaleOnly(false);
    setQuery("");
  }

  /** กดการ์ดสถานะ = กรองเฉพาะสถานะนั้น · กดซ้ำ = เลิกกรอง */
  function toggleStatus(status: RequisitionStatus) {
    const label = REQUISITION_STATUS_LABEL[status];
    setStaleOnly(false);
    setFilters((prev) => ({
      ...prev,
      status: prev.status?.length === 1 && prev.status[0] === label ? [] : [label],
    }));
  }

  /** แทนแถวเดิมด้วยแถวที่โมดัลแก้ไข/ยกเลิกส่งกลับมา — ทั้งสองโมดัลยิง PATCH เองแล้ว */
  function applyUpdated(updated: Requisition) {
    setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  /**
   * เปิดรับอีกครั้ง — ทรานซิชันเดียวที่ยังยิงตรงจากไอคอน Action โดยไม่ต้องเปิดโมดัล
   * เพราะไม่มีอะไรให้เลือก (ตรงข้ามกับยกเลิกที่ต้องมีเหตุผลเสมอ) ย้อนกลับได้ด้วยการ
   * ยกเลิกใหม่ถ้ากดผิด จึงไม่ต้องถามก่อนเหมือนกัน
   */
  async function reopen(row: Requisition) {
    const body: RequisitionPatch = { status: "open" };
    setBusyId(row.id);
    try {
      const next = await requestJson<Requisition>(
        `/api/recruitment/requisitions/${row.id}`,
        { method: "PATCH", body: body as Record<string, unknown> },
        "เปิดรับอีกครั้งไม่สำเร็จ",
      );
      applyUpdated(next);
    } catch (err) {
      alertError("เปิดรับอีกครั้งไม่สำเร็จ", err instanceof Error ? err.message : undefined);
    } finally {
      setBusyId(null);
    }
  }

  /** ตั้ง/ถอดครูฝึก — ช่องเดียวที่ยังแก้ในตารางได้ตรง ๆ */
  async function patchTrainer(row: Requisition, trainerDrivercode: string) {
    const body: RequisitionPatch = { trainerDrivercode: trainerDrivercode || null };
    setBusyId(row.id);
    try {
      const next = await requestJson<Requisition>(
        `/api/recruitment/requisitions/${row.id}`,
        { method: "PATCH", body: body as Record<string, unknown> },
        "บันทึกครูฝึกไม่สำเร็จ",
      );
      applyUpdated(next);
    } catch (err) {
      alertError("บันทึกครูฝึกไม่สำเร็จ", err instanceof Error ? err.message : undefined);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* หัวเรื่องซ่อนไว้ให้โปรแกรมอ่านจอเท่านั้น — ถอดหัวที่มองเห็นออกตามคำขอ 23 ก.ย. 2026 */}
      <h1 className="sr-only">{title}</h1>

      {options.failed.length ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-box border border-sla/30 bg-sla/10 px-3.5 py-2.5 text-12-5 text-sla"
        >
          <TriangleAlert size={15} strokeWidth={1.8} aria-hidden className="mt-0.5 flex-none" />
          <p className="text-pretty">
            อ่าน{options.failed.join(" และ ")}ไม่สำเร็จ — ตัวเลือกในฟอร์มจึงยังว่าง
            คำขอที่บันทึกไว้แล้วยังใช้งานได้ตามปกติ
          </p>
        </div>
      ) : null}

      {/* ─────────────────── การ์ดสรุป + เครื่องมือ — ตัวเลขทุกช่องกดแล้วกรองตารางข้างล่าง */}
      <SummaryPanel label="สรุปคำขอสรรหา">
        <SummaryStats className="grid-cols-2 md:grid-cols-5">
          <SummaryStat
            lead
            label="คำขอทั้งหมด"
            value={rows.length}
            unit="อัตรา"
            sub={counts.cancelled ? `ยกเลิก ${counts.cancelled}` : undefined}
            active={!filtering}
            onClick={clearAll}
            title="ดูทั้งหมด"
            className="col-span-2 md:col-span-1"
          />
          <SummaryStat
            label={REQUISITION_STATUS_LABEL.open}
            value={counts.open}
            unit="อัตรา"
            share={counts.open / (rows.length || 1)}
            dot="bg-st-new-ink"
            tone="primary"
            active={onlyStatus(filters, "open") && !staleOnly}
            onClick={() => toggleStatus("open")}
          />
          <SummaryStat
            label={REQUISITION_STATUS_LABEL.matched}
            value={counts.matched}
            unit="อัตรา"
            share={counts.matched / (rows.length || 1)}
            dot="bg-st-wait-ink"
            tone="primary"
            active={onlyStatus(filters, "matched") && !staleOnly}
            onClick={() => toggleStatus("matched")}
          />
          <SummaryStat
            label={REQUISITION_STATUS_LABEL.filled}
            value={counts.filled}
            unit="อัตรา"
            share={counts.filled / (rows.length || 1)}
            dot="bg-st-live-ink"
            tone="primary"
            active={onlyStatus(filters, "filled") && !staleOnly}
            onClick={() => toggleStatus("filled")}
          />
          <SummaryStat
            label={`ค้างเกิน ${STALE_DAYS} วัน`}
            value={counts.stale}
            unit="อัตรา"
            dot="bg-sla"
            tone="sla"
            share={counts.stale / (active || 1)}
            title="สัดส่วนจากคำขอที่ยังไม่ปิด"
            active={staleOnly}
            onClick={() => {
              setFilters((prev) => ({ ...prev, status: [] }));
              setStaleOnly((on) => !on);
            }}
            className="col-span-2 md:col-span-1"
          />
        </SummaryStats>

        <SummaryToolbar>
          <SearchField
            value={query}
            onChange={setQuery}
            label="ค้นหาคำขอสรรหา"
            placeholder="ค้นเลขที่ ลูกค้า ตำแหน่ง ผู้สมัคร ครูฝึก…"
            tone="filled"
            className="lg:max-w-md lg:flex-1"
          />

          {/* ตัวกรองลูกค้า — เขียนลงตัวกรองของคอลัมน์ “ลูกค้า” ตัวเดียวกับเมนูหัวคอลัมน์
              สองทางจึงเห็นค่าเดียวกันเสมอ (ติ๊กหลายรายที่หัวคอลัมน์ = ช่องนี้ขึ้น “หลายราย”) */}
          <Select
            label="กรองลูกค้า"
            value={customerPicked.length === 1 ? customerPicked[0] : ""}
            onChange={(v) => setFilters((prev) => ({ ...prev, customer: v ? [v] : [] }))}
            options={choices.customer.map((o) => ({ value: o.value, label: `${o.label} (${o.count})` }))}
            placeholder={customerPicked.length > 1 ? `ลูกค้า ${customerPicked.length} ราย` : "ทุกลูกค้า"}
            icon={<Building2 size={14} strokeWidth={1.8} aria-hidden className="text-mut" />}
            searchable
            searchPlaceholder="ค้นชื่อลูกค้า…"
            clearable={customerPicked.length > 0}
            className="lg:w-60"
          />

          {/* ปุ่มสร้างอยู่เฉพาะแท็บนี้ **โดยตั้งใจ** — มันสร้างคำขอ ไม่ได้สร้างใบสมัคร
              (ใบสมัครเข้ามาจากฟอร์มหน้าบ้านเท่านั้น) */}
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex cursor-pointer items-center justify-center gap-1.5 rounded-field bg-primary px-3.5 py-2 text-13 font-medium text-primary-content transition-opacity hover:opacity-90 lg:ml-auto"
          >
            <Plus size={16} strokeWidth={2.2} aria-hidden />
            ขอสรรหา
          </button>
        </SummaryToolbar>

        <SummaryStrip className="flex flex-wrap items-end justify-between gap-x-3">
          {tabs}
          <div className="flex flex-wrap items-center gap-2 py-2 text-12 text-mut">
            <p role="status" aria-live="polite" className="tabular-nums">
              {filtering ? (
                <>
                  พบ <span className="font-semibold text-primary">{visible.length}</span> จาก{" "}
                  {rows.length} คำขอ
                </>
              ) : (
                <>
                  ทั้งหมด <span className="font-semibold text-ink">{rows.length}</span> คำขอ
                </>
              )}
            </p>
            {filtering ? (
              <button
                type="button"
                onClick={clearAll}
                className="flex cursor-pointer items-center gap-1 rounded-field border border-line bg-base-100 px-2 py-0.5 transition-colors hover:border-primary/40 hover:text-ink"
              >
                <RotateCcw size={12} strokeWidth={2} aria-hidden />
                ล้างตัวกรองทั้งหมด
              </button>
            ) : null}
          </div>
        </SummaryStrip>
      </SummaryPanel>

      <div className="elev-card relative max-h-[calc(100dvh-20rem)] overflow-auto rounded-box border border-line bg-base-100">
        <table className="w-full border-collapse text-13">
          <thead>
            <tr>
              {COLUMNS.map((column, i) => (
                <th
                  key={column.id}
                  aria-sort={
                    sort.column === column.id
                      ? sort.dir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                  /* `py-0` — ปุ่มข้างในกินพื้นที่เต็มช่องเอง กดตรงไหนก็เปิดเมนูได้
                     · คอลัมน์แรกปักทั้งบนและซ้าย จึงต้องซ้อนสูงกว่าหัวที่เลื่อนผ่านใต้มัน */
                  className={`${column.width} sticky top-0 border-b border-line-strong bg-head px-3 py-0 text-left whitespace-nowrap ${
                    i === 0
                      ? "left-0 z-20 after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-line"
                      : "z-10"
                  }`}
                >
                  <ColumnMenu
                    label={column.label}
                    sort={{
                      dir: sort.column === column.id ? sort.dir : null,
                      ascLabel: column.asc,
                      descLabel: column.desc,
                      /* เลิกเรียงด้วยคอลัมน์นี้ = ถอยกลับลำดับตั้งต้น ไม่ใช่ปล่อยให้
                         ลำดับขึ้นอยู่กับว่าฐานข้อมูลส่งอะไรมาก่อน */
                      onSort: (dir) =>
                        setSort(dir ? { column: column.id, dir } : DEFAULT_SORT),
                    }}
                    filter={
                      "noFilter" in column
                        ? undefined
                        : {
                            options: choices[column.id],
                            selected: filters[column.id] ?? [],
                            onChange: (next) =>
                              setFilters((prev) => ({ ...prev, [column.id]: next })),
                          }
                    }
                  />
                </th>
              ))}

              {/* คอลัมน์ Action — ไม่เรียง ไม่กรอง จึงไม่อยู่ใน `COLUMNS` และไม่ผ่าน `ColumnMenu`
                  · ตัวอักษรชุดเดียวกับหัวคอลัมน์อื่นเป๊ะ ๆ (`font-mono` 10.5px) และใช้
                  ป้าย “จัดการ” เหมือนกันทั้งสองตาราง ไม่งั้นมันจะเป็นหัวคอลัมน์หน้าตา
                  แปลกปลอมอยู่ใบเดียวในตาราง */}
              <th className="sticky top-0 z-10 w-[92px] border-b border-line-strong bg-head px-3 py-2.5 text-right font-mono text-10-5 font-semibold tracking-[0.07em] text-mut whitespace-nowrap uppercase">
                จัดการ
              </th>
            </tr>
          </thead>

          <tbody>
            {visible.map((row) => {
              const busy = busyId === row.id;
              const stale = isStale(row);

              return (
                <tr
                  key={row.id}
                  className="group border-b border-line transition-colors last:border-b-0 hover:bg-base-200/50"
                >
                  {/* เลขที่คำขอยึดขอบซ้ายไว้ตอนเลื่อนแนวนอน — ต้องรู้ตลอดว่ากำลังดู
                      ใบไหนอยู่ ท่าเดียวกับชื่อผู้สมัครในอีกแท็บ · พื้นต้องทึบ
                      ไม่ใช่ `/50` ของแถว ไม่งั้นตัวหนังสือที่เลื่อนผ่านจะทะลุขึ้นมา */}
                  <td className="sticky left-0 z-[5] bg-base-100 px-3 py-2 font-mono text-11 tracking-wider whitespace-nowrap text-primary after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-line group-hover:bg-base-200">
                    {row.code}
                  </td>

                  <td
                    className={`px-3 py-2 whitespace-nowrap tabular-nums ${
                      stale ? "font-medium text-sla" : isClosed(row) ? "text-mut" : ""
                    }`}
                  >
                    {waitingText(row)}
                  </td>

                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                    {thaiDate(row.requestedOn)}
                  </td>

                  <td className="px-3 py-2 whitespace-nowrap">{customerLabel(row)}</td>

                  <td className="px-3 py-2 whitespace-nowrap">
                    {row.plant || <span className="text-mut">{DASH}</span>}
                  </td>

                  <td className="px-3 py-2 whitespace-nowrap">{positionLabel(row)}</td>

                  <td className="px-3 py-2">
                    {/* เหตุผลที่ต้องแทนคนเดิมอยู่ใน tooltip ไม่ใช่บรรทัดสอง —
                        hover ที่ชิปเพื่อดู ไม่ใช่ข้อมูลที่ต้องเห็นตลอดเวลา */}
                    <span
                      title={row.replace ? `แทน ${replaceSummary(row)}` : undefined}
                      className={`w-fit rounded-selector px-1.5 py-0.5 text-11-5 font-medium whitespace-nowrap ${HIRE_TYPE_TONE[row.hireType]} ${
                        row.replace ? "cursor-help" : ""
                      }`}
                    >
                      {hireTypeLabel(row.hireType)}
                    </span>
                  </td>

                  <td className="px-3 py-2 whitespace-nowrap">{vehiclePlateText(row)}</td>

                  <td className="px-3 py-2 font-mono text-12 whitespace-nowrap">
                    {row.vehicle?.code || <span className="font-sans text-mut">{DASH}</span>}
                  </td>

                  <td className="px-2 py-1.5">
                    <TrainerCell
                      row={row}
                      busy={busy}
                      drivers={options.drivers}
                      onChange={(v) => patchTrainer(row, v)}
                    />
                  </td>

                  <td className="px-3 py-2 whitespace-nowrap">
                    {row.match ? (
                      /* ประโยชน์ที่ได้จากการเอาสองตารางมาไว้หน้าเดียว — จากคำขอ
                         ไปถึงใบสมัครของคนที่รับอัตรานี้ในคลิกเดียว ไม่ต้องจำชื่อ
                         ไปพิมพ์ค้นในอีกตาราง · เป็นปุ่มไม่ใช่ลิงก์ เพราะไม่ได้
                         เปลี่ยนหน้า แค่สลับแท็บที่อยู่ในหน้าเดียวกัน */
                      <button
                        type="button"
                        onClick={() => onOpenCandidate(row.match!.ref)}
                        title={`ดูใบสมัคร ${row.match.ref} ของ ${row.match.fullName} ในแท็บผู้สมัคร`}
                        className="group/link flex items-center gap-1 rounded-selector px-1 py-0.5 text-left transition-colors hover:bg-soft hover:text-primary"
                      >
                        <span className="truncate underline decoration-line decoration-dotted underline-offset-4 group-hover/link:decoration-primary/60">
                          {row.match.fullName}
                        </span>
                        <ArrowUpRight
                          size={12}
                          strokeWidth={2}
                          aria-hidden
                          className="flex-none text-mut opacity-0 transition-opacity group-hover/link:text-primary group-hover/link:opacity-100"
                        />
                      </button>
                    ) : (
                      <span className="text-mut">{NO_MATCH}</span>
                    )}
                  </td>

                  <td className="px-3 py-2">
                    {/* เหตุผลที่ยกเลิกอยู่ใน tooltip เหมือนกัน — ท่าเดียวกับชิปประเภทอัตรา */}
                    <span
                      title={
                        row.status === "cancelled" && row.cancelReason
                          ? cancelReasonLabel(row.cancelReason)
                          : undefined
                      }
                      className={`w-fit rounded-selector px-1.5 py-0.5 text-11-5 font-medium whitespace-nowrap ${REQUISITION_STATUS_TONE[row.status]} ${
                        row.status === "cancelled" && row.cancelReason ? "cursor-help" : ""
                      }`}
                    >
                      {REQUISITION_STATUS_LABEL[row.status]}
                    </span>
                  </td>

                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-0.5">
                      {row.status === "cancelled" ? (
                        <IconButton
                          label={`เปิดรับอีกครั้ง ${row.code}`}
                          disabled={busy}
                          onClick={() => reopen(row)}
                        >
                          <RotateCcw size={14} strokeWidth={1.8} aria-hidden />
                        </IconButton>
                      ) : (
                        <IconButton
                          label={`ยกเลิกคำขอ ${row.code}`}
                          danger
                          disabled={busy}
                          onClick={() => setCancelling(row)}
                        >
                          <Trash2 size={14} strokeWidth={1.8} aria-hidden />
                        </IconButton>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
            {rows.length ? (
              <SearchX size={20} strokeWidth={1.6} aria-hidden className="text-mut" />
            ) : (
              <ClipboardList size={20} strokeWidth={1.6} aria-hidden className="text-mut" />
            )}
            <p className="text-13 font-medium">
              {rows.length ? "ไม่มีคำขอที่ตรงกับตัวกรอง" : "ยังไม่มีคำขอสรรหาในระบบ"}
            </p>
            <p className="max-w-[48ch] text-12 leading-relaxed text-mut text-pretty">
              {rows.length
                ? "ปรับตัวกรองที่หัวคอลัมน์ หรือเริ่มใหม่ทั้งหมดด้วยปุ่มข้างล่าง"
                : "กด “ขอสรรหา” เพื่อแจ้งอัตราแรก — ระบุลูกค้า แพล้นท์ และครูฝึกไว้ตั้งแต่ตอนแจ้ง แล้วข้อมูลจะไหลต่อไปถึงหน้าติดตามฝึกงานให้เอง"}
            </p>
            {rows.length && filtering ? (
              <button
                type="button"
                onClick={clearAll}
                className="mt-1 rounded-field border border-line px-3 py-1.5 text-12-5 transition-colors hover:border-primary/40 hover:text-primary"
              >
                ล้างตัวกรองทั้งหมด
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {creating ? (
        <RequisitionForm
          options={options}
          onClose={() => setCreating(false)}
          /* ต่อหัวรายการเองแทนการโหลดหน้าใหม่ — คำขอที่เพิ่งสร้างคือสิ่งที่ผู้ใช้
             กำลังมองหา ต้องเห็นทันทีโดยไม่ต้องรอหน้าโหลดรอบสอง */
          onCreated={(created) => setRows((prev) => [...created, ...prev])}
        />
      ) : null}

      {cancelling ? (
        <RequisitionCancelModal
          row={cancelling}
          onClose={() => setCancelling(null)}
          onCancelled={applyUpdated}
        />
      ) : null}
    </div>
  );
}

/**
 * ครูฝึก — **ช่องเดียวในตารางนี้ที่แก้ได้ตรง ๆ** ที่เหลือทั้งหมดอ่านอย่างเดียว
 *
 * ยังว่าง = ปุ่มเส้นประจาง ๆ “+ เลือกครูฝึก” · มีค่าแล้ว = ชื่อบนพื้นทึบ — สื่อว่ากดได้โดยไม่ต้อง
 * เอาเมาส์ไปกวาดหา (ทรงเดียวกับ `Editable` ของ `requisition-cells.tsx` เดิมก่อน
 * จะถูกลบไปตอนเปลี่ยนทั้งตารางเป็นอ่านอย่างเดียว — เอากลับมาเฉพาะช่องนี้ช่องเดียว)
 */
function TrainerCell({
  row,
  busy,
  drivers,
  onChange,
}: {
  row: Requisition;
  busy: boolean;
  drivers: RequisitionOptions["drivers"];
  onChange: (drivercode: string) => void;
}) {
  const current = row.trainer;

  return (
    <Select
      label={`ครูฝึกของ ${row.code}`}
      value={current?.drivercode ?? ""}
      onChange={onChange}
      options={drivers}
      searchable
      clearable={Boolean(current)}
      disabled={busy}
      searchPlaceholder="ค้นชื่อ รหัส หรือสาขา…"
      trigger={
        <button
          type="button"
          disabled={busy}
          title={current ? `ครูฝึก ${current.name} — กดเพื่อเปลี่ยน` : "กดเพื่อระบุครูฝึก"}
          /* ไม่มีวงแหวนโฟกัส (คำขอเจ้าของงาน) — Radix คืนโฟกัสมาที่ปุ่มหลังปิดรายการ วงแหวน
             กลางจึงค้างอยู่ทุกครั้งที่เลือกเสร็จ · คนใช้คีย์บอร์ดยังเห็นตำแหน่งจากพื้น/เส้นที่เปลี่ยนสีแทน */
          className={`flex cursor-pointer items-center gap-1.5 rounded-field text-left whitespace-nowrap transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
            current
              ? "w-full bg-base-100 px-2 py-1.5 text-13 hover:bg-base-200 focus-visible:bg-base-200 data-[state=open]:bg-base-100"
              : /* ช่องว่าง = ปุ่มจาง ๆ เส้นประ — บอกว่ากดเลือกได้ แต่ไม่แย่งสายตาจากช่องที่มีค่า */
                "border border-dashed border-line-strong/70 px-2.5 py-1 text-12 text-mut/70 hover:border-primary/50 hover:bg-soft/60 hover:text-primary focus-visible:border-primary/50 focus-visible:text-primary data-[state=open]:border-primary/50 data-[state=open]:text-primary"
          }`}
        >
          {current ? (
            <span className="truncate">{current.name}</span>
          ) : (
            <>
              <Plus size={12} strokeWidth={2} aria-hidden className="flex-none" />
              เลือกครูฝึก
            </>
          )}
        </button>
      }
    />
  );
}

/** ปุ่มไอคอนเดียวในคอลัมน์ Action — ทรงเดียวกับที่ใช้ในตัวจัดการคำถาม */
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
      className={`flex size-7 flex-none items-center justify-center rounded-selector text-mut transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        danger ? "hover:bg-alert/10 hover:text-alert" : "hover:bg-base-200 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/** กรองสถานะนี้อยู่ตัวเดียวไหม — ใช้ไฮไลต์การ์ดที่กำลังทำงานอยู่ */
function onlyStatus(filters: Filters, status: RequisitionStatus): boolean {
  const picked = filters.status ?? [];
  return picked.length === 1 && picked[0] === REQUISITION_STATUS_LABEL[status];
}
