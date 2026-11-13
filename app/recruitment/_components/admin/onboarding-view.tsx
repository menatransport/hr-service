"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, ChevronLeft, ChevronRight, Eye, FileText, Loader2, Plus, RotateCcw, SearchX, Trash2, UserRound } from "lucide-react";

import { ColumnMenu, type ColumnFilterOption, type SortDir } from "@/components/ui/column-menu";
import { CriminalRecordButton, CriminalRecordHeadTip } from "@/app/recruitment/_components/admin/criminal-record";
import { SearchField } from "@/components/ui/field";
import {
  SummaryPanel,
  SummaryStat,
  SummaryStats,
  SummaryStrip,
  SummaryToolbar,
  SegmentedControl,
} from "@/components/ui/summary-panel";
import { TablePager, usePaged } from "@/components/ui/table-pager";
import { XlsxExportButton } from "@/components/ui/xlsx-export-button";
import { requestJson } from "@/lib/http";
import { xlsxDate, type XlsxColumn } from "@/lib/xlsx-table";
import { alertError } from "@/lib/swal";
import { todayInBangkok } from "@/lib/record-case-flow";
import { formatPhone, thaiDate } from "@/app/recruitment/_lib/form";
import { ADMIN_ROOT } from "@/app/recruitment/_lib/admin-nav";
import { SiteNav } from "@/app/recruitment/_components/admin/site-nav";
import { RECRUIT_SITE_BRANCHES, recruitSiteOf, type RecruitSite } from "@/app/recruitment/_lib/sites";
import { STATUS_LABEL, type ApplicationStatus, type ApplicationSummary } from "@/app/recruitment/_lib/types";
import type { RequisitionOptions } from "@/app/recruitment/_lib/requisitions/options";
import type { RepairStatus } from "@/app/recruitment/_lib/requisitions/repair-status";
import {
  TRAINING_PLAN_DAYS,
  WAIT_HANDOVER_LABEL,
  ST_CHECKPOINTS,
  TAB_NOTE,
  TABS,
  STAGE_DOT,
  STAGE_LABEL,
  awaitingHandover,
  isHandoverMark,
  withDayEdit,
  handoverCheck,
  daysToHandover,
  endLabel,
  stageOf,
  stepStates,
  trainingStart,
  val,
  vehicleReadiness,
  type HandoverCheck,
  type OnboardingRecord,
  type Stage,
  type Step,
  type StepState,
  type Tab,
} from "@/app/recruitment/_lib/requisitions/onboarding";
import {
  customerLabel,
  hireTypeLabel,
  personName,
  positionLabel,
  waitingDays,
  type Requisition,
} from "@/app/recruitment/_lib/requisitions/types";
import { VehicleStatusCell } from "@/app/recruitment/_components/admin/repair-badge";
import { RequisitionForm } from "@/app/recruitment/_components/admin/requisition-form";
import { RequisitionCancelModal } from "@/app/recruitment/_components/admin/requisition-cancel";
import { OnboardingDialog } from "@/app/recruitment/_components/admin/onboarding-dialog";
import { JrCell } from "@/app/recruitment/_components/admin/jr-cell";
import { MixerTabs, PositionTag, isMixer, mixerCounts, type MixerPick } from "@/app/recruitment/_components/admin/position-tag";
import { CheckMark, PhoneCell } from "@/app/recruitment/_components/admin/candidate-cells";
import { TraineeDailySection, type TraineePerson } from "@/app/recruitment/_components/admin/trainee-daily-section";
import { thaiNumericCompare } from "@/lib/thai-order";
import { THAI_MONTHS_SHORT } from "@/app/recruitment/_lib/drivers/types";

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
  /** ใบสมัครที่ผูก — แท็บรอฝึกงานโชว์คอลัมน์ชุดเดียวกับหน้าผู้สมัคร · ไม่ได้ส่งใบมา/ไม่ผูก = null */
  app: ApplicationSummary | null;
  /** ความคืบหน้าการฝึก (วันฝึก · ปฐมนิเทศ · ST) — โชว์อย่างเดียว */
  ready: HandoverCheck;
  /** ขั้นฝึกงานที่ RC ลง `ร` แล้ว = สถานะ “รอรับรถ” ในแท็บฝึกงาน (`awaitingHandover`) */
  waitHandover: boolean;
};

const TRAINING_LABEL = "ฝึกงาน";

const TAB_LABEL: Record<Tab, string> = { ...STAGE_LABEL, handover: WAIT_HANDOVER_LABEL };
const TAB_DOT: Record<Tab, string> = { ...STAGE_DOT, handover: "bg-st-violet-ink" };
const tabStage = (t: Tab): Stage => (t === "handover" ? "training" : t);

const DASH = "—";
const date = (v: string) => (v ? thaiDate(v) : DASH);

/** วันที่ล้วนแบบกระชับ — `23 ต.ค. 69` (แท็บฝึกงาน · ชุดเดียวกับมุมมองฝึกงานของหน้าผู้สมัคร) */
const shortDay = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Bangkok" });

/** ผล ST รอบล่าสุดที่ลงไว้ (เหมือน `traineeOf` ของหน้าผู้สมัคร) */
const stResult = (r: OnboardingRecord) =>
  ST_CHECKPOINTS.map((c) => val(r.onboarding, "er", c.result)).filter(Boolean).at(-1) ?? "";

/** ประทับเวลาแบบหน้าผู้สมัคร — `15 ก.ย. 69 09:41` */
const stamp = new Intl.DateTimeFormat("th-TH", {
  day: "numeric",
  month: "short",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Bangkok",
});

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
  applicant: { id: "applicant", label: "ชื่อ–นามสกุล", width: "min-w-[200px]", noFilter: true, text: (r) => r.name },
  /* แท็บฝึกงาน = คอลัมน์ชุดเดียวกับหน้าผู้สมัครตอนกรอง “ฝึกงาน” (Bew 5 พ.ย. 2569) — รหัสพนักงานใต้ชื่อ เรียงตามรหัส */
  trainee: {
    id: "trainee",
    label: "ชื่อ–นามสกุล",
    width: "min-w-[170px]",
    noFilter: true,
    text: (r) => r.name,
    key: (r) => r.drivercode || "zzzz",
  },
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
  /* สาขาที่ขออัตรา — ใบก่อน 3 พ.ย. 2569 ไม่มีค่า = — */
  branch: { id: "branch", label: "สาขา", width: "min-w-[100px]", text: (r) => r.branch || DASH },
  position: { id: "position", label: "ตำแหน่ง", width: "min-w-[80px]", text: (r) => positionLabel(r) },
  /* ทดแทน = บรรทัดรอง รหัส · ชื่อ คนที่ถูกแทน (Bew 12 พ.ย. 2569) · ตัวกรอง/เรียงยังใช้ป้ายประเภท */
  hireType: { id: "hireType", label: "ประเภท", width: "min-w-[150px]", text: (r) => hireTypeLabel(r.hireType) },
  vehicle: {
    id: "vehicle",
    label: "ทะเบียนรถ",
    width: "min-w-[130px]",
    text: (r) => r.vehicle?.plateNo || r.vehicle?.code || DASH,
  },
  /* สถานะรถ 2 กลุ่มจากบอร์ดซ่อม (`vehicleReadiness`) — กรองได้ · เหตุผล/กำหนดเสร็จซ้อนใต้ป้าย · ไม่มีรถ = — */
  repair: {
    id: "repair",
    label: "สถานะรถ",
    width: "min-w-[140px]",
    text: (r) => vehicleReadiness(r, r.repair)?.label ?? DASH,
  },
  trainer: { id: "trainer", label: "ครูฝึก", width: "min-w-[150px]", text: (r) => r.trainer?.name || DASH },
  application: {
    id: "application",
    label: "ใบสมัคร",
    width: "min-w-[130px]",
    text: (r) => (r.match?.status ? STATUS_LABEL[r.match.status] : r.match ? "ผูกแล้ว" : "ไม่มีใบสมัคร"),
  },
  /* คอลัมน์ชุดหน้าผู้สมัคร (กรองรอฝึกงาน) — อ่านจากใบสมัครที่ผูก · คนที่ไม่มีใบ = — */
  contactOwner: {
    id: "contactOwner",
    label: "ผู้ติดต่อกลับ",
    width: "min-w-[160px]",
    text: (r) => (r.app ? r.app.contactOwner || "ยังไม่มีผู้รับผิดชอบ" : DASH),
  },
  createdAt: {
    id: "createdAt",
    label: "ประทับเวลา",
    width: "min-w-[130px]",
    noFilter: true,
    text: (r) => (r.app ? stamp.format(new Date(r.app.createdAt)) : DASH),
    key: (r) => r.app?.createdAt ?? "",
  },
  phone: { id: "phone", label: "เบอร์โทรศัพท์", width: "min-w-[130px]", noFilter: true, text: (r) => (r.app?.phone ? formatPhone(r.app.phone) : DASH) },
  workZone: { id: "workZone", label: "สนใจงานเขต", width: "min-w-[130px]", text: (r) => r.app?.workZone || DASH },
  readyToStart: {
    id: "readyToStart",
    label: "ความพร้อมเริ่มงาน",
    width: "min-w-[150px]",
    text: (r) => (r.app?.readyToStart ? thaiDate(r.app.readyToStart) : DASH),
    key: (r) => r.app?.readyToStart || "9999-12-31",
  },
  interview: {
    id: "interview",
    label: "นัดสัมภาษณ์",
    width: "min-w-[150px]",
    text: (r) => (r.app ? (r.app.interview.date ? thaiDate(r.app.interview.date) : "ยังไม่ได้นัด") : DASH),
    key: (r) => r.app?.interview.date || "9999-12-31",
  },
  appStatus: {
    id: "appStatus",
    label: "สถานะการสมัคร",
    width: "min-w-[150px]",
    text: (r) => (r.app ? STATUS_LABEL[r.app.status] : r.match ? "ผูกแล้ว" : "ไม่มีใบสมัคร"),
  },
  trainingOn: {
    id: "trainingOn",
    label: "วันที่ฝึกงาน",
    width: "min-w-[130px]",
    text: (r) => (r.start ? thaiDate(r.start) : "ยังไม่กำหนด"),
    key: (r) => r.start || "9999-12-31",
  },
  trainPhone: { id: "trainPhone", label: "เบอร์โทร", width: "min-w-[112px]", noFilter: true, text: (r) => (r.app?.phone ? formatPhone(r.app.phone) : DASH) },
  trainOwner: {
    id: "trainOwner",
    label: "ผู้ติดต่อกลับ",
    width: "min-w-[104px]",
    text: (r) => (r.app ? r.app.contactOwner || "ยังไม่มีผู้รับผิดชอบ" : DASH),
  },
  trainTrainer: { id: "trainTrainer", label: "ครูฝึก", width: "min-w-[120px]", text: (r) => r.trainer?.name || DASH },
  trainOn: {
    id: "trainOn",
    label: "วันที่ฝึก",
    width: "min-w-[96px]",
    text: (r) => (r.start ? shortDay.format(new Date(`${r.start.slice(0, 10)}T00:00:00+07:00`)) : "ยังไม่กำหนด"),
    key: (r) => r.start || "9999-12-31",
  },
  orientation: {
    id: "orientation",
    label: "ปฐมนิเทศ",
    width: "min-w-[80px]",
    text: (r) => (val(r.onboarding, "hrd", "orientationOn") ? "ปฐมนิเทศแล้ว" : "ยังไม่ปฐมนิเทศ"),
  },
  st: {
    id: "st",
    label: "ST",
    width: "min-w-[56px]",
    text: (r) => (r.ready.st ? "ประเมินผ่าน" : stResult(r) || "ยังไม่ประเมิน"),
  },
  /* ทะเบียน · เบอร์รถ · สถานะจากบอร์ดซ่อม ในช่องเดียว (แบบหน้าผู้สมัคร) — กรองตามสถานะ */
  car: {
    id: "car",
    label: "สถานะรถ",
    width: "min-w-[140px]",
    text: (r) => vehicleReadiness(r, r.repair)?.label ?? "ยังไม่มีรถ",
  },
  /* เลขที่ JR — กดเปิดฟอร์ม JR / คัดลอก (ตัวเดียวกับหน้าผู้สมัคร · Bew 4 พ.ย. 2569) */
  jr: { id: "jr", label: "เลขที่ JR", width: "min-w-[130px]", text: (r) => r.code || DASH },
  start: { id: "start", label: "เริ่มฝึก", width: "min-w-[110px]", text: (r) => date(r.start), key: (r) => r.start },
  /* สถานะในแท็บฝึกงาน — RC ลง `ร` ในตารางสถานะฝึกงาน = รอรับรถ (`awaitingHandover` · Bew 9 พ.ย. 2569) */
  trainStatus: {
    id: "trainStatus",
    label: "สถานะ",
    width: "min-w-[108px]",
    text: (r) => (r.waitHandover ? WAIT_HANDOVER_LABEL : TRAINING_LABEL),
  },
  /* นับเฉพาะวันฝึกงานจริง (`ฝ`) ไม่ใช่วันตามปฏิทิน — วันลา/ขาดไม่นับ */
  trainDays: {
    id: "trainDays",
    label: "ฝึกมา",
    width: "min-w-[70px]",
    noFilter: true,
    text: (r) => `${r.ready.trainedDays} วัน`,
    key: (r) => String(r.ready.trainedDays).padStart(5, "0"),
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
  /* ผลตรวจประวัติอาชญากรรม — เฉพาะแท็บรับรถแล้วที่ฝังในหน้าผู้สมัคร (Bew 9 พ.ย. 2569) · โหลดทีละแถว กรองไม่ได้ */
  criminal: { id: "criminal", label: "ผลประวัติอาชญากรรม", width: "min-w-[150px]", noFilter: true, text: () => "" },
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
  /* ตำแหน่งอยู่หน้าลูกค้าทุกแท็บ (Bew 12 พ.ย. 2569) */
  open: [C.code, C.waiting, C.requested, C.position, C.customer, C.plant, C.hireType, C.vehicle, C.repair, C.trainer],
  /* รอฝึกงาน = คอลัมน์ชุดเดียวกับแท็บฝึกงาน ไม่มี ฝึกมา/ปฐมนิเทศ/ST (Bew 5 พ.ย. 2569) · สถานะ = สถานะใบสมัคร */
  recruiting: [
    C.trainee, C.jr, C.position, C.customer, C.plant, C.trainOwner, C.trainPhone, C.trainTrainer,
    C.trainOn, C.car, { ...C.appStatus, label: "สถานะ", width: "min-w-[108px]" },
  ],
  /* ลำดับ/ป้ายตามมุมมองฝึกงานของหน้าผู้สมัคร (`TRAINEE_ORDER`) · สถานะ = ฝึกงาน/รอรับรถ */
  training: [
    C.trainee, C.jr, C.position, C.customer, C.plant, C.trainOwner, C.trainPhone, C.trainTrainer,
    C.trainOn, C.trainDays, C.orientation, C.st, C.car, C.trainStatus,
  ],
  /* ข้อมูลคนอยู่ทะเบียน พจส. แล้ว — แท็บนี้เก็บแค่ผลของ onboarding
     · คน → งาน (สาขา ตำแหน่ง ลูกค้า แพล้นท์ รถ ครูฝึก) → วันที่ → สถานะท้าย แบบแท็บฝึกงาน (Bew 10 พ.ย. 2569) */
  working: [
    C.driver, C.code, C.branch, C.position, C.customer, C.plant,
    { ...C.vehicle, label: "ทะเบียนรถ/เบอร์รถ" }, C.trainer,
    C.start, C.handover, C.days, C.driverStatus,
  ],
  ended: [C.name, C.code, C.customer, C.plant, C.start, C.end, C.endOn, C.atms],
};

const DEFAULT_SORT: Record<Stage, { column: string; dir: SortDir }> = {
  open: { column: "code", dir: "asc" },
  recruiting: { column: "trainee", dir: "asc" },
  training: { column: "trainee", dir: "asc" },
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
  driver: [
    { header: "ชื่อ - นามสกุล", width: 28, value: (r) => r.name },
    { header: "รหัสพนักงาน", width: 12, kind: "code", value: (r) => r.drivercode },
  ],
  applicant: [
    { header: "ชื่อ–นามสกุล", width: 28, value: (r) => r.name },
    { header: "รหัส", width: 10, kind: "code", value: (r) => r.drivercode },
  ],
  jr: [{ header: "เลขที่ JR", width: 14, kind: "code", value: (r) => r.code }],
  contactOwner: [{ header: "ผู้ติดต่อกลับ", width: 20, value: (r) => r.app?.contactOwner ?? "" }],
  createdAt: [{ header: "ประทับเวลา", width: 17, kind: "datetime", value: (r) => xlsxDate(r.app?.createdAt ?? "") }],
  phone: [{ header: "เบอร์โทรศัพท์", width: 15, kind: "code", value: (r) => (r.app?.phone ? formatPhone(r.app.phone) : "") }],
  workZone: [{ header: "สนใจงานเขต", width: 18, value: (r) => r.app?.workZone ?? "" }],
  readyToStart: [
    {
      header: "ความพร้อมเริ่มงาน",
      width: 16,
      kind: "date",
      value: (r) => {
        const v = r.app?.readyToStart ?? "";
        return xlsxDate(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "") ?? v;
      },
    },
  ],
  interview: [{ header: "นัดสัมภาษณ์", width: 13, kind: "date", value: (r) => xlsxDate(r.app?.interview.date ?? "") }],
  appStatus: [{ header: "สถานะการสมัคร", width: 16, kind: "status", value: C.appStatus.text }],
  trainingOn: [{ header: "วันที่ฝึกงาน", width: 13, kind: "date", value: (r) => xlsxDate(r.start) }],
  trainee: [
    { header: "ชื่อ–นามสกุล", width: 28, value: (r) => r.name },
    { header: "รหัสพนักงาน", width: 12, kind: "code", value: (r) => r.drivercode },
  ],
  waiting: [{ header: "รอมาแล้ว (วัน)", width: 11, kind: "int", value: (r) => waitingDays(r) ?? 0 }],
  requested: [{ header: "วันที่แจ้ง", width: 13, kind: "date", value: (r) => xlsxDate(r.requestedOn) }],
  customer: [{ header: "ลูกค้า", width: 14, value: C.customer.text }],
  plant: [{ header: "แพล้นท์", width: 18, value: C.plant.text }],
  branch: [{ header: "สาขา", width: 12, value: C.branch.text }],
  position: [{ header: "ตำแหน่ง", width: 12, value: C.position.text }],
  hireType: [
    { header: "ประเภท", width: 14, value: C.hireType.text },
    { header: "ทดแทน รหัส", width: 12, kind: "code", value: (r) => r.replace?.drivercode },
    { header: "ทดแทน ชื่อ", width: 24, value: (r) => r.replace?.name },
  ],
  vehicle: [
    { header: "ทะเบียนรถ", width: 14, kind: "code", value: (r) => r.vehicle?.plateNo },
    { header: "เบอร์รถ", width: 10, kind: "code", value: (r) => r.vehicle?.code },
  ],
  repair: [
    { header: "สถานะรถ", width: 18, kind: "status", value: C.repair.text, tone: (r) => (r.repair ? "warn" : r.vehicle ? "ok" : null) },
    { header: "เหตุผล", width: 18, value: (r) => r.repair?.label ?? "" },
    { header: "กำหนดเสร็จ", width: 13, kind: "date", value: (r) => xlsxDate(r.repair?.due ?? "") },
  ],
  trainer: [{ header: "ครูฝึก", width: 22, value: C.trainer.text }],
  application: [{ header: "ใบสมัคร", width: 18, kind: "status", value: C.application.text }],
  start: [{ header: "เริ่มฝึก", width: 13, kind: "date", value: (r) => xlsxDate(r.start) }],
  trainStatus: [
    { header: "สถานะ", width: 12, kind: "status", value: C.trainStatus.text, tone: (r) => (r.waitHandover ? "ok" : null) },
  ],
  trainOwner: [{ header: "ผู้ติดต่อกลับ", width: 20, value: (r) => r.app?.contactOwner ?? "" }],
  trainPhone: [{ header: "เบอร์โทรศัพท์", width: 15, kind: "code", value: (r) => (r.app?.phone ? formatPhone(r.app.phone) : "") }],
  trainTrainer: [{ header: "ครูฝึก", width: 22, value: C.trainer.text }],
  trainOn: [{ header: "วันที่ฝึกงาน", width: 13, kind: "date", value: (r) => xlsxDate(r.start) }],
  orientation: [{ header: "ปฐมนิเทศ", width: 13, kind: "date", value: (r) => xlsxDate(val(r.onboarding, "hrd", "orientationOn")) }],
  st: [{ header: "ST ประเมิน", width: 22, kind: "status", value: C.st.text, tone: (r) => (r.ready.st ? "ok" : "mut") }],
  car: [
    { header: "ทะเบียนรถ", width: 14, value: (r) => r.vehicle?.plateNo },
    { header: "เบอร์รถ", width: 10, kind: "code", value: (r) => r.vehicle?.code },
    { header: "สถานะรถ", width: 18, kind: "status", value: (r) => (r.vehicle ? C.car.text(r) : ""), tone: (r) => (r.repair ? "alert" : r.vehicle ? "ok" : null) },
    { header: "เหตุผล (รถ)", width: 22, value: (r) => r.repair?.label ?? "" },
  ],
  trainDays: [{ header: "ฝึกมา (วัน)", width: 10, kind: "int", value: (r) => r.ready.trainedDays }],
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

/**
 * เดือนของแถวรับรถแล้ว (`YYYY-MM`) — วันรับรถ → วันเริ่มฝึก · ไม่มีทั้งคู่ = เดือนนี้ (ยังต้องตามอยู่)
 * · แท็บรับรถแล้วเป็นรายเดือน แทนการตัดเก็บ 7 วันล่าสุด (Bew 10 พ.ย. 2569)
 */
export function workingMonth(r: Row, today = todayInBangkok()): string {
  return (C.handover.key(r) || r.start || today).slice(0, 7);
}

/**
 * แถวของหน้าติดตามพนักงานใหม่ — ขั้น/ความคืบหน้า/บอร์ดซ่อม (รับรถแล้วไม่ตัดแล้ว · กรองรายเดือนที่ตาราง)
 * · หน้าผู้สมัคร (การ์ดรอสรรหา/รับรถแล้ว) นับจากตัวนี้ด้วย ตัวเลขสองหน้าจึงตรงกันเสมอ
 */
export function hubRows(
  records: OnboardingRecord[],
  repairs: Record<string, RepairStatus>,
  applications: ApplicationSummary[] = [],
): Row[] {
  const apps = new Map(applications.map((a) => [a.id, a]));
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
        app: (r.match && apps.get(r.match.applicationId)) || null,
        ready: handoverCheck(r),
        waitHandover: awaitingHandover(r),
      };
    });
}

export function OnboardingView({
  records: initial,
  repairs,
  applications,
  options,
  initialStage = "training",
  initialFilters = {},
  initialOpen = "",
  embedded = false,
  note,
  branches,
  sites,
  initialSite,
  onCreated,
  onUpdated,
}: {
  records: OnboardingRecord[];
  repairs: Record<string, RepairStatus>;
  /** ใบสมัครที่ผูกกับคำขอ — คอลัมน์แท็บรอฝึกงาน · ไม่ส่ง = คอลัมน์พวกนั้นขึ้น — */
  applications?: ApplicationSummary[];
  /** ตัวเลือกฟอร์มขออัตรา — ไม่ส่ง = โหลดตอนกดปุ่มขออัตรา/เพิ่มอัตราครั้งแรก */
  options?: RequisitionOptions;
  initialStage?: Tab;
  /** ตัวกรองคอลัมน์ตั้งต้น — การ์ดรอรับรถของหน้าผู้สมัครเปิดแท็บฝึกงานกรองสถานะรอรับรถ */
  initialFilters?: Record<string, string[]>;
  /** `?open=<id>` — เปิด dialog ของคำขอนี้ตอนโหลด (ลิงก์เก่า `/onboarding/[id]` redirect มา) */
  initialOpen?: string;
  /**
   * ฝังในหน้าผู้สมัคร (การ์ดรอสรรหา/รับรถแล้ว) — ขั้นเดียว ไม่มีการ์ดขั้น/เดือน/ปุ่มแก้
   * · `records` ตามพ่อแม่สด ๆ (ผูก RQ บนหน้าผู้สมัครแล้วแถวขยับทันที)
   */
  embedded?: boolean;
  /** เงื่อนไขข้างช่องค้นหา (ทีละข้อ) — แถวของหน้านี้มาจากอะไร */
  note?: string[];
  /** สาขาที่ฟอร์มขอสรรหาเลือกได้ — หน้าผู้สมัครส่งตามแท็บสาขาที่เปิดอยู่ · ไม่ส่ง = ทุกสาขา */
  branches?: readonly string[];
  /** แท็บสาขาที่ผู้ใช้เห็นได้ (หน้าเต็มเท่านั้น · `visibleRecruitSites`) — ไม่ส่ง = ไม่มีแท็บสาขา ทุกแถว */
  sites?: readonly RecruitSite[];
  /** แท็บสาขาตั้งต้น — `?site=` หรือ site ของผู้ใช้ */
  initialSite?: RecruitSite;
  /** ฝังอยู่ = หน้าแม่ถือแถวเอง — คำขอที่เพิ่งสร้างส่งกลับไปให้หน้าแม่ต่อเข้ารายการ */
  onCreated?: (created: Requisition[]) => void;
  /** ฝังอยู่ = คำขอที่เพิ่งแก้ (ฟอร์มคำขอ · KA / dialog) ส่งกลับให้หน้าแม่ทับแถวเดิม */
  onUpdated?: (updated: Requisition) => void;
}) {
  const [own, setRecords] = useState(initial);
  const allRecords = embedded ? initial : own;
  /* เปิดจากลิงก์ `?open=` — ไปแท็บของคนนั้นเลย */
  const [startTab] = useState<Tab>(() => {
    const hit = initialOpen ? initial.find((r) => r.id === initialOpen) : undefined;
    return hit ? stageOf(hit) : initialStage;
  });

  /**
   * แท็บสาขาบนสุด (Bew 13 พ.ย. 2569) — สาขา = สาขาของคำขอ (ว่าง = ลาดกระบัง) · ซ่อนแท็บเท่านั้น
   * ข้อมูลอีกสาขายังมากับหน้า (กรองฝั่ง client แบบหน้าผู้สมัคร)
   */
  const siteTabs = !embedded && sites?.length ? sites : null;
  const [site, setSite] = useState<RecruitSite | null>(() => {
    if (!siteTabs) return null;
    const hit = initialOpen ? initial.find((r) => r.id === initialOpen) : undefined;
    const hitSite = hit ? recruitSiteOf(hit.branch) : null;
    return hitSite && siteTabs.includes(hitSite) ? hitSite : (initialSite ?? siteTabs[0]);
  });
  const siteCounts = useMemo(() => {
    const n: Record<RecruitSite, number> = { latkrabang: 0, "saraburi-bangpakong": 0 };
    for (const r of allRecords) n[recruitSiteOf(r.branch)] += 1;
    return n;
  }, [allRecords]);
  const records = useMemo(
    () => (site ? allRecords.filter((r) => recruitSiteOf(r.branch) === site) : allRecords),
    [allRecords, site],
  );
  const formBranches = branches ?? (site ? RECRUIT_SITE_BRANCHES[site] : undefined);
  function pickSite(next: RecruitSite) {
    setSite(next);
    setFilters({});
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("site", next);
      window.history.replaceState(null, "", url);
    } catch {}
  }
  const [tab, setTab] = useState<Tab>(startTab);
  const stage = tabStage(tab);
  const [sort, setSort] = useState(DEFAULT_SORT[tabStage(startTab)]);
  const [filters, setFilters] = useState<Record<string, string[]>>(initialFilters);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  /* ตัวเลือกฟอร์ม (~360 KB) ไม่มากับหน้า — โหลดตอนกดปุ่มขออัตรา/เพิ่มอัตราครั้งแรก */
  const [loadedOptions, setLoadedOptions] = useState<RequisitionOptions | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const formOptions = options ?? loadedOptions;
  const [cancelling, setCancelling] = useState<Requisition | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewing, setViewing] = useState(initialOpen);
  const router = useRouter();

  /** แท็บรับรถแล้ว = รายเดือน ตั้งต้นเดือนนี้ (แทนการตัด 7 วัน · Bew 10 พ.ย. 2569) */
  const monthly = stage === "working";
  const thisMonth = todayInBangkok().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);

  const rows = useMemo(() => hubRows(records, repairs, applications), [records, repairs, applications]);
  /** เดือนที่มีคนรับรถ + เดือนนี้ — ใหม่ → เก่า (ลูกศรเดินตามรายการนี้ ไม่ข้ามไปเดือนว่าง) */
  const months = useMemo(() => {
    const set = new Set([thisMonth]);
    for (const r of rows) if (r.stage === "working") set.add(workingMonth(r, thisMonth));
    return [...set].sort().reverse();
  }, [rows, thisMonth]);
  const monthAt = months.indexOf(month);
  const monthLabel = `${THAI_MONTHS_SHORT[Number(month.slice(5, 7)) - 1]} ${Number(month.slice(0, 4)) + 543}`;

  /** การ์ดรับรถแล้ว = เดือนที่เลือก ตรงกับตาราง */
  const counts = useMemo(() => {
    const c = Object.fromEntries(TABS.map((s) => [s, 0])) as Record<Tab, number>;
    for (const r of rows) {
      if (r.stage !== "working" || workingMonth(r, thisMonth) === month) c[r.stage]++;
      if (r.waitHandover) c.handover++;
    }
    return c;
  }, [rows, month, thisMonth]);

  const inStage = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.stage === stage &&
          (tab !== "handover" || r.waitHandover) &&
          (!monthly || workingMonth(r, thisMonth) === month),
      ),
    [rows, stage, tab, monthly, month, thisMonth],
  );

  const avgDays = useMemo(() => {
    const d = rows
      .filter((r) => r.stage === "working" && workingMonth(r, thisMonth) === month)
      .map(daysToHandover)
      .filter((n): n is number => n !== null && n >= 0);
    return d.length ? Math.round(d.reduce((a, b) => a + b, 0) / d.length) : null;
  }, [rows, month, thisMonth]);

  /* หน้าผู้สมัคร (ฝัง) — แท็บรับรถแล้วมีคอลัมน์ผลประวัติอาชญากรรมต่อท้าย ชุดเดียวกับรอฝึกงาน → รอรับรถ */
  const columns = useMemo(
    (): Col[] => (embedded && stage === "working" ? [...COLUMNS.working, C.criminal] : COLUMNS[stage]),
    [embedded, stage],
  );
  const shownNote = note ?? TAB_NOTE[tab];

  const choices = useMemo(() => {
    const map: Record<string, ColumnFilterOption[]> = {};
    for (const column of columns) {
      const tally = new Map<string, number>();
      for (const row of inStage) tally.set(column.text(row), (tally.get(column.text(row)) ?? 0) + 1);
      map[column.id] = [...tally.entries()]
        .map(([value, count]) => ({ value, label: value, count }))
        .sort((a, b) => thaiNumericCompare(a.label, b.label));
    }
    return map;
  }, [columns, inStage]);

  /**
   * แท็บฝึกงาน/รอรับรถ มีแท็บ ตาราง | สถานะฝึกงาน แบบหน้าผู้สมัคร (Bew 5 พ.ย. 2569)
   * · `dailyAlerts` = Issue วันนี้ ขึ้นจุดแดงบนแท็บแม้อยู่แท็บตาราง · ฝังในหน้าผู้สมัคร = ไม่มี
   */
  const showDaily = !embedded && stage === "training";
  const [traineeTab, setTraineeTab] = useState<"table" | "daily">("table");
  /** กล่องในแถบเครื่องมือที่เครื่องมือของตารางสถานะฝึกงานถูกส่งมาวาง (portal — ดู `TraineeMatrix`) */
  const [dailyToolbar, setDailyToolbar] = useState<HTMLDivElement | null>(null);
  const [dailyAlerts, setDailyAlerts] = useState(0);
  const onDailyAlerts = useCallback((n: number) => setDailyAlerts(n), []);
  /* กรอก/ถอด `ร` หรือ `ฝ` ในแท็บสถานะฝึกงาน → ทับลงแถว ตัวเลขแท็บฝึกงาน/รอรับรถขยับทันที (`withDayEdit`) */
  const onDaySaved = useCallback((requisitionId: string, iso: string, code: string, prev: string) => {
    if (!isHandoverMark(code) && !isHandoverMark(prev)) return;
    setRecords((cur) => cur.map((r) => (r.id === requisitionId ? withDayEdit(r, iso, code) : r)));
  }, []);
  const dailyTab = showDaily && traineeTab === "daily";

  /* ช่องค้นหาซ่อนในแท็บสถานะฝึกงาน (มีช่องค้นหาของตัวเอง) = ไม่กรองต่อเบื้องหลัง */
  const needle = dailyTab ? "" : query.trim().toLowerCase();

  /** แท็บ ทั้งหมด | Mixer L | Mixer S (Bew 12 พ.ย. 2569) — แท็บที่มีคอลัมน์ตำแหน่ง + มีคำขอ Mixer · แท็บซ่อน = ไม่กรองต่อเบื้องหลัง */
  const showMixer = columns.some((c) => c.id === "position") && rows.some((r) => isMixer(positionLabel(r)));
  const [mixerPick, setMixerPick] = useState<MixerPick>("all");
  const mixer = showMixer ? mixerPick : "all";

  const [visible, mixerCount] = useMemo(() => {
    const filtered = inStage.filter((row) => {
      if (
        needle &&
        ![row.name, row.code, row.applicant?.ref ?? "", row.app?.phone ?? "", row.drivercode, row.plant, row.trainer?.name ?? "", row.vehicle?.code ?? "", row.vehicle?.plateNo ?? ""].some((t) =>
          t.toLowerCase().includes(needle),
        )
      )
        return false;
      return columns.every((c) => !filters[c.id]?.length || filters[c.id].includes(c.text(row)));
    });
    /* ตัวเลขบนแท็บตำแหน่ง = หลังตัวกรองอื่น ก่อนกรองตำแหน่ง */
    const counts = mixerCounts(filtered, positionLabel);
    const list = mixer === "all" ? filtered : filtered.filter((r) => positionLabel(r) === mixer);
    const column = columns.find((c) => c.id === sort.column) ?? columns[0];
    const read = (r: Row) => (column.key ? column.key(r) : column.text(r));
    const sorted = list.sort((a, b) => {
      const order = thaiNumericCompare(read(a), read(b));
      return sort.dir === "asc" ? order : -order;
    });
    return [sorted, counts] as const;
  }, [inStage, needle, columns, filters, sort, mixer]);

  /** หน้าละ 25 แถว — เปลี่ยนขั้น/คำค้น/ตัวกรอง/การเรียงแล้วกลับหน้า 1 */
  const [paged, pagedScroll] = usePaged(visible, JSON.stringify([tab, needle, filters, sort, month, mixer]));

  const filtering = Boolean(needle) || Object.values(filters).some((p) => p?.length);

  /** แถวของตารางรายวัน — `pool` = ทุกคนในขั้นฝึกงาน (ตัวโหลด) · `people` = ที่ตารางแสดงอยู่หลังกรอง */
  const toPerson = (r: Row): TraineePerson => ({
    id: r.id,
    code: r.code,
    name: r.name,
    drivercode: r.drivercode,
    vehicle: r.vehicle,
    customer: customerLabel(r),
    plant: r.plant,
    contactOwner: r.app?.contactOwner ?? "",
  });
  const dailyPool = useMemo(
    () => (showDaily ? rows.filter((r) => r.stage === "training").map(toPerson) : []),
    [showDaily, rows],
  );
  const dailyPeople = useMemo(() => (showDaily ? visible.map(toPerson) : []), [showDaily, visible]);

  function switchStage(next: Tab) {
    setTab(next);
    setTraineeTab("table");
    setSort(DEFAULT_SORT[tabStage(next)]);
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

  /** บันทึกใน dialog → แถวในตารางตาม · ฝังในหน้าผู้สมัคร = ส่งคำขอให้หน้าแม่ + โหลดข้อมูลฝ่ายใหม่ */
  function saved(next: OnboardingRecord) {
    if (embedded) {
      onUpdated?.(next);
      router.refresh();
    } else setRecords((prev) => prev.map((r) => (r.id === next.id ? { ...r, ...next } : r)));
  }

  /** คำขอตัวเลือกที่กำลังวิ่ง — ชี้เมาส์ที่ปุ่มก็เริ่มโหลด กดตามมาไม่ต้องยิงซ้ำ · พังแล้วล้างให้ลองใหม่ได้ */
  const optionsRequest = useRef<Promise<RequisitionOptions> | null>(null);
  function requestOptions() {
    optionsRequest.current ??= requestJson<RequisitionOptions>(
      "/api/recruitment/requisitions/options",
      {},
      "โหลดตัวเลือกไม่สำเร็จ",
    ).catch((err) => {
      optionsRequest.current = null;
      throw err;
    });
    return optionsRequest.current;
  }
  const preloadOptions = () => {
    if (!formOptions) requestOptions().catch(() => {});
  };

  /** ตัวเลือกฟอร์มขออัตรา — ไม่มากับหน้า โหลดตอนชี้/กดปุ่มครั้งแรก */
  async function withOptions(open: () => void, failTitle: string) {
    if (formOptions) return open();
    setLoadingOptions(true);
    try {
      setLoadedOptions(await requestOptions());
      open();
    } catch (err) {
      alertError(failTitle, err instanceof Error ? err.message : undefined);
    } finally {
      setLoadingOptions(false);
    }
  }

  const startCreate = () => withOptions(() => setCreating(true), "เปิดฟอร์มขออัตราไม่สำเร็จ");

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
    /* หน้าเต็ม = สูงเท่าจอแบบหน้าผู้สมัคร: ตารางยืดเต็มที่เหลือ แถบเลขหน้าชิดล่างเสมอ */
    <div className={embedded || dailyTab ? "flex flex-col gap-3" : "flex flex-col gap-3 lg:h-[calc(100dvh-4rem)]"}>
      {embedded ? null : <h1 className="sr-only">ติดตามพนักงานใหม่</h1>}

      {siteTabs && site ? (
        <SiteNav value={site} sites={siteTabs} counts={siteCounts} noun="รายการ" onChange={pickSite} />
      ) : null}

      <SummaryPanel
        label={embedded ? TAB_LABEL[tab] : "ขั้นของพนักงานใหม่"}
        className={embedded || dailyTab ? "" : "flex flex-col lg:min-h-0 lg:flex-1"}
      >
        {embedded ? null : (
        <SummaryStats className="grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          {TABS.map((s) => (
            <SummaryStat
              key={s}
              label={TAB_LABEL[s]}
              value={counts[s]}
              unit={s === "open" ? "อัตรา" : "คน"}
              dot={TAB_DOT[s]}
              tone={s === "ended" ? "ink" : "primary"}
              sub={
                s === "working"
                  ? `${monthLabel}${avgDays !== null ? ` · เฉลี่ยฝึก ${avgDays} วัน` : ""}`
                  : undefined
              }
              active={tab === s}
              onClick={() => switchStage(s)}
            />
          ))}
        </SummaryStats>
        )}

        <SummaryToolbar>
          {showDaily ? (
            <SegmentedControl
              label="มุมมองฝึกงาน"
              value={traineeTab}
              onChange={setTraineeTab}
              options={[
                { value: "table", label: "ตาราง", count: visible.length },
                { value: "daily", label: "สถานะฝึกงาน", dot: dailyAlerts ? "bg-alert" : undefined },
              ]}
              /* ชิดขวาสุดของแถบ — `order-last` แบบหน้าผู้สมัคร */
              className="w-full sm:w-auto sm:self-end lg:order-last lg:self-auto"
            />
          ) : null}
          {/* เดือน · ค้นหา · สาขา · RC Alert · Excel ของตารางรายวัน — `contents` ให้ลูกเป็นช่องของแถวนี้ตรง ๆ */}
          {showDaily ? <div ref={setDailyToolbar} className={dailyTab ? "contents" : "hidden"} /> : null}
          {dailyTab ? null : (
          <>
          {monthly ? (
            <div className="flex items-center gap-1">
              <MonthStep label="เดือนก่อนหน้า" disabled={monthAt >= months.length - 1} onClick={() => setMonth(months[monthAt + 1])}>
                <ChevronLeft size={15} strokeWidth={1.9} aria-hidden />
              </MonthStep>
              <span aria-live="polite" className="min-w-24 text-center text-13-5 font-semibold tabular-nums">
                {monthLabel}
              </span>
              <MonthStep label="เดือนถัดไป" disabled={monthAt <= 0} onClick={() => setMonth(months[monthAt - 1])}>
                <ChevronRight size={15} strokeWidth={1.9} aria-hidden />
              </MonthStep>
            </div>
          ) : null}
          <SearchField
            value={query}
            onChange={setQuery}
            label="ค้นหา"
            placeholder="ชื่อ เลขที่ รหัส แพล้นท์ ครูฝึก รถ…"
            tone="filled"
            className="lg:max-w-sm lg:flex-1"
          />
          {showMixer ? <MixerTabs value={mixerPick} counts={mixerCount} onChange={setMixerPick} className="w-full sm:w-auto" /> : null}
          {shownNote?.length ? (
            <p className="text-12 leading-relaxed text-ink">
              <span className="font-medium">เงื่อนไข: </span>
              {shownNote.map((n, i) => (
                <span key={n} className="text-alert">
                  {i ? ", " : ""}
                  {n}
                </span>
              ))}
            </p>
          ) : null}
          <div className="flex items-center gap-2 lg:ml-auto">
            <XlsxExportButton
              className="px-3.5 py-2 text-13"
              name={`ติดตามพนักงานใหม่-${TAB_LABEL[tab]}${monthly ? `-${month}` : ""}`}
              count={visible.length}
              build={() => ({
                sheet: TAB_LABEL[tab],
                title: `ติดตามพนักงานใหม่ · ${TAB_LABEL[tab]}${monthly ? ` · ${monthLabel}` : ""}`,
                filter: [
                  monthly ? `เดือน: ${monthLabel}` : "",
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
            {stage === "open" && embedded ? (
              <button
                type="button"
                onClick={startCreate}
                onPointerEnter={preloadOptions}
                onFocus={preloadOptions}
                disabled={loadingOptions}
                title="เพิ่มอัตรา"
                aria-label="เพิ่มอัตรา"
                className="btn-pri flex size-9 cursor-pointer items-center justify-center disabled:opacity-60"
              >
                {loadingOptions ? (
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                ) : (
                  <Plus size={18} strokeWidth={2.2} aria-hidden />
                )}
              </button>
            ) : stage === "open" ? (
              <button
                type="button"
                onClick={startCreate}
                onPointerEnter={preloadOptions}
                onFocus={preloadOptions}
                disabled={loadingOptions}
                className="btn-pri flex cursor-pointer items-center gap-1.5 px-3.5 py-2 text-13 font-medium disabled:opacity-60"
              >
                {loadingOptions ? (
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                ) : (
                  <Plus size={16} strokeWidth={2.2} aria-hidden />
                )}
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
          </>
          )}
        </SummaryToolbar>

        {/* แท็บสถานะฝึกงาน — เมานต์ค้างไว้ (ซ่อนด้วย `hidden`) สลับแท็บไม่ต้องโหลดตารางรายวันใหม่ */}
        {showDaily ? (
          <div hidden={!dailyTab} className="pt-3">
            <TraineeDailySection
              pool={dailyPool}
              people={dailyPeople}
              onAlerts={onDailyAlerts}
              toolbarSlot={dailyToolbar}
              onDaySaved={onDaySaved}
            />
          </div>
        ) : null}

        {dailyTab ? null : (
        <>

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

        <div
          ref={pagedScroll}
          className={`relative max-h-[calc(100dvh-21rem)] overflow-auto border-y border-line ${
            embedded ? "" : "lg:max-h-none lg:min-h-0 lg:flex-1"
          }`}
        >
          {/* แท็บฝึกงานคอลัมน์เยอะ — ระยะข้างช่องแคบลงแบบมุมมองฝึกงานของหน้าผู้สมัคร */}
          <table className={`sheet-table w-full border-collapse text-13 ${stage === "training" || stage === "recruiting" ? "[&_td]:px-2 [&_th]:px-2" : ""}`}>
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
                    <div className="flex items-center gap-1">
                      <div className="min-w-0 flex-1">
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
                      </div>
                      {column.id === "criminal" ? <CriminalRecordHeadTip /> : null}
                    </div>
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
                      <Cell column={column} row={row} onOpen={() => setViewing(journeyId(row))} />
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
        <TablePager paged={paged} unit={stage === "open" ? "อัตรา" : "คน"} className="-mt-px flex-none" />
        </>
        )}
      </SummaryPanel>

      {/* ตารางฝึกงานรายวันย้ายไปอยู่ใต้ตารางผู้สมัคร (กรองฝึกงาน) ของ RC แล้ว — Bew 25 ต.ค. 2569 */}

      {creating && formOptions ? (
        <RequisitionForm
          options={formOptions}
          branches={formBranches}
          onClose={() => setCreating(false)}
          onCreated={(created) =>
            embedded
              ? onCreated?.(created)
              : setRecords((prev) => [...created.map((r) => ({ ...r, onboarding: {}, atms: null })), ...prev])
          }
        />
      ) : null}
      {cancelling ? (
        <RequisitionCancelModal row={cancelling} onClose={() => setCancelling(null)} onCancelled={merge} />
      ) : null}
      {viewing ? (
        <OnboardingDialog id={viewing} onClose={closeDialog} onSaved={saved} />
      ) : null}
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

/** ปุ่มเลื่อนเดือนของแท็บรับรถแล้ว (ฝัง) — หน้าตาเดียวกับ `Step` ของตารางสถานะฝึกงาน */
function MonthStep({
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
      title={label}
      className="flex size-8 cursor-pointer items-center justify-center rounded-selector border border-line bg-base-100 text-mut transition-colors hover:border-ink/30 hover:text-ink disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Cell({ column, row, onOpen }: { column: Col; row: Row; onOpen: () => void }) {
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
    case "criminal":
      return <CriminalRecordButton name={row.name} site={row.branch} />;
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
    case "trainee":
      return (
        <span className="flex items-center gap-2.5">
          <span
            title={row.app ? STATUS_LABEL[row.app.status] : undefined}
            className={`flex size-7 flex-none items-center justify-center rounded-full ${
              row.match?.status ? APPLICANT_TONE[row.match.status] : "bg-primary/10 text-primary"
            }`}
          >
            <UserRound size={14} strokeWidth={2} aria-hidden />
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="font-medium whitespace-nowrap text-ink">{row.name}</span>
            <span className="flex items-center gap-1.5 font-mono text-10-5 tracking-wider text-primary">
              <span className="text-11 font-semibold tabular-nums text-ink" title="รหัสพนักงาน">
                {row.drivercode || "ยังไม่มีรหัส"}
              </span>
              {row.app?.ref ? (
                <>
                  <span aria-hidden className="text-mut">·</span>
                  {row.app.ref}
                </>
              ) : null}
            </span>
          </span>
        </span>
      );
    case "applicant":
      return (
        <span className="inline-flex items-center gap-2.5 font-medium">
          <span
            className={`flex size-7 flex-none items-center justify-center rounded-full ${
              row.match?.status ? APPLICANT_TONE[row.match.status] : "bg-primary/10 text-primary"
            }`}
          >
            <FileText size={14} strokeWidth={2} aria-hidden />
          </span>
          <span className="flex flex-col leading-tight">
            {row.name}
            {row.drivercode ? <span className="font-mono text-11 font-normal text-mut">{row.drivercode}</span> : null}
          </span>
        </span>
      );
    case "jr":
      return row.code && journeyId(row) ? <JrCell code={row.code} onOpen={onOpen} /> : <span className="text-mut">{DASH}</span>;
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
    case "hireType":
      return row.replace && (row.replace.drivercode || row.replace.name) ? (
        <span className="flex flex-col leading-tight">
          <span className="whitespace-nowrap">{text}</span>
          <span className="text-11 whitespace-nowrap text-mut">
            {row.replace.drivercode ? <span className="font-mono">{row.replace.drivercode}</span> : null}
            {row.replace.drivercode && row.replace.name ? " · " : null}
            {row.replace.name}
          </span>
        </span>
      ) : (
        <span>{text}</span>
      );
    case "trainPhone":
      return row.app?.phone ? <PhoneCell phone={row.app.phone} /> : <span className="text-mut">{DASH}</span>;
    case "trainDays":
      return (
        <span className="tabular-nums" title={`ฝึกงาน ${row.ready.trainedDays}/${TRAINING_PLAN_DAYS} วัน (นับเฉพาะวันฝึกงาน)`}>
          <span className={row.ready.days ? "font-medium text-st-live-ink" : ""}>
            {row.ready.trainedDays} <span className="text-mut">วัน</span>
          </span>
        </span>
      );
    case "orientation": {
      const on = val(row.onboarding, "hrd", "orientationOn");
      return (
        <CheckMark
          on={Boolean(on)}
          title={on ? `ปฐมนิเทศแล้ว ${thaiDate(on)}` : "ยังไม่ปฐมนิเทศ"}
          onOpen={journeyId(row) ? onOpen : undefined}
        />
      );
    }
    case "st":
      return (
        <CheckMark
          on={row.ready.st}
          title={`ST ประเมิน: ${stResult(row) || "ยังไม่ประเมิน"}`}
          onOpen={journeyId(row) ? onOpen : undefined}
        />
      );
    case "car":
      return row.vehicle ? (
        <span className="flex flex-col items-start gap-1">
          <span className="leading-tight whitespace-nowrap">
            {row.vehicle.plateNo || row.vehicle.code}
            {row.vehicle.plateNo && row.vehicle.code ? (
              <span className="ml-1.5 font-mono text-11 text-mut">{row.vehicle.code}</span>
            ) : null}
          </span>
          <VehicleStatusCell repair={row.repair} />
        </span>
      ) : (
        <span className="text-mut">ยังไม่มีรถ</span>
      );
    case "repair":
      return row.vehicle ? <VehicleStatusCell repair={row.repair} /> : <span className="text-mut">{DASH}</span>;
    case "appStatus":
      return row.app ? (
        <span className={`rounded-full px-2 py-0.5 text-12 font-medium ${APPLICANT_TONE[row.app.status]}`}>{text}</span>
      ) : (
        <span className="text-mut">{text}</span>
      );
    case "trainStatus":
      return (
        <span
          title={
            row.waitHandover
              ? row.handoverMarkedOn
                ? `RC ลง “ร” รับรถ ตั้งแต่ ${thaiDate(row.handoverMarkedOn)}`
                : "รอรับรถ (จากไฟล์นำเข้า)"
              : "ฝึกงาน — RC ลง “ร” ในตารางสถานะฝึกงานเมื่อพร้อมรับรถ"
          }
          className={row.waitHandover ? "chip chip-violet" : "rounded-full bg-primary/12 px-2 py-0.5 text-12 font-medium text-primary"}
        >
          {text}
        </span>
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
    case "position":
      return <PositionTag value={text} />;
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
