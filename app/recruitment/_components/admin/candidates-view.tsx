"use client";

import { PhotoPreview } from "@/components/ui/photo-preview";
import { mediaThumbUrl } from "@/lib/media";
import { Fragment, useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import {
  ClipboardList,
  FilePenLine,
  Loader2,
  Search,
  Star,
  UserRound,
} from "lucide-react";

import { ColumnMenu, type ColumnFilterOption } from "@/components/ui/column-menu";
import {
  BlacklistCell,
  BlacklistHitBadge,
  CheckMark,
  InterviewCell,
  OwnerCell,
  PhoneCell,
  ReasonCell,
  StatusCell,
  type CellPatch,
} from "@/app/recruitment/_components/admin/candidate-cells";
import {
  CandidateInsights,
  DEFAULT_FILTERS,
  TRAINING_VIEW_LABELS,
  isFiltering,
  stampDay,
  type InsightFilters,
  type TableSort,
} from "@/app/recruitment/_components/admin/candidate-insights";
import { HrDocumentMaker } from "@/app/recruitment/_components/admin/hr-document-maker";
import { CandidateRcForm, type RcTarget } from "@/app/recruitment/_components/admin/candidate-rc-form";
import { SearchField } from "@/components/ui/field";
import { SegmentedControl } from "@/components/ui/summary-panel";
import { TraineeDailySection, type TraineePerson } from "@/app/recruitment/_components/admin/trainee-daily-section";
import { Nickname } from "@/app/recruitment/_components/admin/nickname";
import { CriminalRecordButton, CriminalRecordHeadTip } from "@/app/recruitment/_components/admin/criminal-record";
import {
  TAB_NOTE,
  TRAINING_PLAN_DAYS,
  WAIT_HANDOVER_LABEL,
  ST_CHECKPOINTS,
  isHandoverMark,
  withDayEdit,
  outcomeGroup,
  val,
  vehicleReadiness,
  type Tab,
  outcomeLabel,
  type OnboardingRecord,
} from "@/app/recruitment/_lib/requisitions/onboarding";
import type { Hub } from "@/app/recruitment/_lib/requisitions/onboarding-store";
import { OnboardingView, hubRows } from "@/app/recruitment/_components/admin/onboarding-view";
import { OnboardingDialog } from "@/app/recruitment/_components/admin/onboarding-dialog";
import { JrCell } from "@/app/recruitment/_components/admin/jr-cell";
import { VehicleStatusCell } from "@/app/recruitment/_components/admin/repair-badge";
import type { RepairStatus } from "@/app/recruitment/_lib/requisitions/repair-status";
import { RATING_TONE } from "@/app/recruitment/_components/admin/hr-document-rating";
import { formatScore, levelOf, summarizeRating } from "@/app/recruitment/_lib/driver-rating";
import type { HrDocId } from "@/app/recruitment/_lib/hr-documents";
import { TablePager, usePaged } from "@/components/ui/table-pager";
import { XlsxMenuButton } from "@/components/ui/xlsx-export-button";
import { FormSyncDialog, type FormSyncMode } from "@/app/recruitment/_components/admin/form-import-dialog";
import { requestJson } from "@/lib/http";
import { alertError } from "@/lib/swal";
import { xlsxDate, type XlsxColumn, type XlsxSheet } from "@/lib/xlsx-table";
import type { ApplicationFormExport } from "@/app/recruitment/_lib/applications";
import {
  daysUntil,
  displayAnswer,
  findByRole,
  formatPhone,
  thaiDate,
  type DocSlot,
} from "@/app/recruitment/_lib/form";
import {
  STATUS_LABEL,
  exitReasonLabel,
  exitReasonText,
  type AnswerMap,
  type Application,
  type DocumentData,
  type ApplicationStatus,
  type ApplicationSummary,
  type BlacklistEntry,
  type BlacklistHit,
  type QuestionKind,
  findBlacklistHit,
} from "@/app/recruitment/_lib/types";
import {
  customerLabel,
  positionLabel,
  type Requisition,
  type RequisitionVehicle,
} from "@/app/recruitment/_lib/requisitions/types";
import { ADMIN_ROOT } from "@/app/recruitment/_lib/admin-nav";
import { thaiNumericCompare } from "@/lib/thai-order";

/**
 * หน้า “ผู้สมัคร” — ตารางแบบสเปรดชีตที่ฝ่ายบุคคลทำงานได้จบในตารางเดียว
 *
 * `rows` ถือโดย `recruitment-screens.tsx` ที่ห่อหน้านี้อยู่
 *
 * ยึดท่าของ Excel / Google Sheets ทั้งหมดโดยตั้งใจ เพราะฝ่ายบุคคลอยู่กับสองตัวนั้น
 * ทุกวัน และไม่มีอะไรที่ระบบนี้จะสอนเขาได้ดีกว่าเครื่องมือที่เขาใช้คล่องอยู่แล้ว:
 *
 * - **หัวคอลัมน์ทุกช่องกดได้** — เรียง ค้นหา และติ๊กเลือกค่าที่อยากเห็น
 *   (`ColumnMenu` ตัวเดียวกับตารางคำขอ — ย้ายมาจาก `SheetHeader` ที่เขียนไว้เอง
 *   ตอนรวมสองหน้าเข้าด้วยกัน 22 ก.ย. 2026 · นอกจากหัวตารางสองใบจะเหมือนกันเป๊ะแล้ว
 *   ยังได้ `useOverlayCount()` ติดมาด้วย Esc ครั้งแรกจึงปิดแค่เมนูคอลัมน์
 *   ไม่ทะลุไปปิดรายงานผู้สมัครที่เปิดค้างอยู่ ซึ่งเป็นบั๊กของตัวเดิม)
 *   · ไม่มีแถบตัวกรองลอยอยู่เหนือตาราง เพราะตัวกรองที่อยู่คนละที่กับคอลัมน์ที่
 *   มันกรอง คือตัวกรองที่ต้องเดาว่ามันทำอะไร
 * - **ช่องสถานะ ผู้ติดต่อกลับ และวันนัด แก้ได้ในช่องเลย** (ดู `candidate-cells.tsx`)
 *   บันทึกทันทีที่เลือก ไม่มีปุ่มยืนยันและไม่มีกล่องฟอร์มคั่น
 * - ปุ่มหลักในแถวมีตัวเดียวคือ **ทำเอกสาร** — รายงานผู้สมัครเป็นฉบับแรกในกล่อง
 *   ตามด้วยสัญญาจ้าง · สัญญาค้ำ · ยินยอมคืนเงินค้ำ (ดู `hr-document-maker.tsx`) ·
 *   ปุ่มรายงานแยกเดิมถูกรวมเข้าไปตามคำสั่งเจ้าของงาน 29 ก.ย. 2026
 *
 * กรองและเรียงทำฝั่ง client บนชุดที่โหลดมาแล้ว (ทุกใบ ดู `listApplications()`)
 */

/* วันที่ล้วนของคอลัมน์ประทับเวลา (`stampDay`) อยู่ที่ `candidate-insights.tsx`
   เพราะแท่งกราฟรายวันบนแถบสรุปต้องสร้างป้ายด้วยตัวเดียวกันเป๊ะ ๆ ถึงจะกรองติด */

/**
 * วันที่พร้อมเวลาแบบกระชับ — `15 ก.ย. 69 09:41`
 *
 * ปี พ.ศ. สองหลักและไม่มีคำว่า “น.” ต่อท้าย เพราะคอลัมน์นี้ถูกกวาดสายตาผ่าน
 * ไม่ได้อ่านทีละตัว · ปีเต็มกับหน่วยเวลากินความกว้างไปสองสามตัวอักษรต่อแถว
 * โดยไม่ได้บอกอะไรที่บริบทของตารางไม่ได้บอกอยู่แล้ว
 */
/** วันที่ล้วนแบบกระชับ — `23 ต.ค. 69` (มุมมองฝึกงาน) */
const shortDay = new Intl.DateTimeFormat("th-TH", {
  day: "numeric",
  month: "short",
  year: "2-digit",
  timeZone: "Asia/Bangkok",
});

const stamp = new Intl.DateTimeFormat("th-TH", {
  day: "numeric",
  month: "short",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Bangkok",
});

/**
 * แถวของตาราง = ใบสมัคร + ผลจับ Blacklist ที่คิดสดฝั่งจอ (ดู `enriched` ในคอมโพเนนต์)
 * · คิดบนจอไม่ใช่ที่เซิร์ฟเวอร์ เพื่อให้กดติด Blacklist ในมุมมองยกเลิกแล้วใบที่รอ
 *   การติดต่อของคนเดียวกันขึ้นเตือนทันทีโดยไม่ต้องโหลดหน้าใหม่
 */
type Row = ApplicationSummary & {
  blacklistHit: BlacklistHit | null;
  /** วันเริ่มฝึกจาก RQ ที่ผูก (`Requisition.trainingStartOn`) — ว่าง = ไม่ผูก/ยังไม่กรอก */
  trainingStartOn: string;
  /** เลขที่ JR ของคำขอที่ผูก — ว่าง = ยังไม่ผูก */
  jrCode: string;
  /** ข้อมูลผู้ฝึกงานของมุมมองฝึกงาน (`traineeOf`) — ไม่ผูก RQ = `null` */
  trainee: Trainee | null;
  /** ใบฝึกงานที่ RC ลง `ร` แล้ว (`awaitingHandover`) — คอลัมน์สถานะเป็น “รอรับรถ” สีม่วง */
  waitHandover: boolean;
};

/** สถานะที่ตารางโชว์ — ฝึกงานที่ RC ลง `ร` แล้วเป็น “รอรับรถ” (ตารางเดียวกับฝึกงาน · Bew 9 พ.ย. 2569) */
const statusText = (a: Row) => (a.status === "training" && a.waitHandover ? WAIT_HANDOVER_LABEL : STATUS_LABEL[a.status]);

/**
 * คอลัมน์ผู้ฝึกงาน (Bew 5 พ.ย. 2569) — RQ ที่ผูก (รหัส ตำแหน่ง ลูกค้า แพล้นท์ ครูฝึก รถ)
 * + แถวหน้าติดตาม (`hubRows` · วันฝึก ปฐมนิเทศ ST) + บอร์ดซ่อม (สถานะรถ)
 */
interface Trainee {
  drivercode: string;
  position: string;
  customer: string;
  plant: string;
  trainer: string;
  /** วันฝึกงานจริง (นับเฉพาะ `ฝ` · `handoverCheck`) — ไม่มีแถวหน้าติดตาม = `null` */
  trainedDays: number | null;
  orientationOn: string;
  /** ST ประเมินผ่าน = เงื่อนไขรอรับรถ · `stResult` = ผลรอบล่าสุดที่ลงไว้ */
  stPassed: boolean;
  stResult: string;
  vehicle: RequisitionVehicle | null;
  repair: RepairStatus | null;
}

type HubRow = ReturnType<typeof hubRows>[number];

function traineeOf(
  rq: Requisition | undefined,
  row: HubRow | undefined,
  repairs: Record<string, RepairStatus> | undefined,
): Trainee | null {
  if (!rq) return null;
  return {
    drivercode: rq.drivercode,
    position: positionLabel(rq),
    customer: customerLabel(rq),
    plant: rq.plant,
    trainer: rq.trainer?.name ?? "",
    trainedDays: row ? row.ready.trainedDays : null,
    orientationOn: row ? val(row.onboarding, "hrd", "orientationOn") : "",
    stPassed: row?.ready.st ?? false,
    stResult: row ? (ST_CHECKPOINTS.map((c) => val(row.onboarding, "er", c.result)).filter(Boolean).at(-1) ?? "") : "",
    vehicle: rq.vehicle,
    repair: rq.vehicle?.plateNo ? (repairs?.[rq.vehicle.plateNo] ?? null) : null,
  };
}

/**
 * นิยามคอลัมน์ที่เดียวของทั้งตาราง
 *
 * `text` คือค่าที่ขึ้นบนจอและใช้เรียง · `facet` คือค่าที่ไปอยู่ในรายการติ๊กของ
 * เมนูหัวคอลัมน์ (ไม่ใส่ = ใช้ `text`) — สองอย่างนี้แยกกันเพราะคอลัมน์
 * **ประทับเวลา** มีค่าไม่ซ้ำกันเลยสักแถว รายการติ๊กที่ยาวเท่าจำนวนใบสมัคร
 * กรองอะไรไม่ได้จริง จึงให้ติ๊กเป็น “รายวัน” แทน
 *
 * คอลัมน์ที่เรียงตามเวลามี `key` แยกอีกชั้น เพราะ “15 ก.ย.” เรียงตามตัวอักษร
 * แล้วไปอยู่ก่อน “1 ต.ค.”
 *
 * `asc`/`desc` คือป้ายบนปุ่มเรียงในเมนูหัวคอลัมน์ · `width` คือความกว้างขั้นต่ำ
 * ที่ `<th>` ใช้ — ทั้งสองอย่างเป็นรูปแบบเดียวกับ `COLUMNS` ของตารางคำขอสรรหา
 * เป๊ะ ๆ เพื่อให้แก้ตารางไหนก็คิดด้วยหัวเดียวกัน
 */
const COLUMNS = [
  {
    id: "fullName",
    label: "ชื่อ–นามสกุล",
    width: "min-w-[190px]",
    asc: "ก → ฮ",
    desc: "ฮ → ก",
    text: (a: Row) => a.fullName,
  },
  {
    /* มุมมองฝึกงาน — เรียงตั้งต้นตามคอลัมน์นี้ น้อย → มาก (`TRAINEE_SORT`) · ไม่มีรหัสไปท้าย */
    id: "drivercode",
    label: "รหัสพนักงาน",
    width: "min-w-[100px]",
    asc: "น้อย → มาก",
    desc: "มาก → น้อย",
    text: (a: Row) => a.trainee?.drivercode || "—",
    key: (a: Row) => a.trainee?.drivercode || "zzzz",
  },
  {
    /* แยกจากใต้ชื่อมาเป็นคอลัมน์ในมุมมองรอฝึกงาน/ฝึกงาน — คัดลอกหรือกดเปิดฟอร์ม JR (Bew 4 พ.ย. 2569) */
    id: "jr",
    label: "เลขที่ JR",
    width: "min-w-[130px]",
    asc: "น้อย → มาก",
    desc: "มาก → น้อย",
    text: (a: Row) => a.jrCode || "—",
  },
  { id: "position", label: "ตำแหน่ง", width: "min-w-[80px]", asc: "ก → ฮ", desc: "ฮ → ก", text: (a: Row) => a.trainee?.position || "—" },
  { id: "customer", label: "ลูกค้า", width: "min-w-[80px]", asc: "ก → ฮ", desc: "ฮ → ก", text: (a: Row) => a.trainee?.customer || "—" },
  { id: "plant", label: "แพล้นท์", width: "min-w-[100px]", asc: "ก → ฮ", desc: "ฮ → ก", text: (a: Row) => a.trainee?.plant || "—" },
  { id: "trainer", label: "ครูฝึก", width: "min-w-[140px]", asc: "ก → ฮ", desc: "ฮ → ก", text: (a: Row) => a.trainee?.trainer || "—" },
  {
    /* โผล่เฉพาะตอนกรอง “รอฝึกงาน” หรือ “ฝึกงาน” อย่างเดียว · รอฝึกงานเป็นสถานะจริงแล้ว
       (25 ต.ค. 2569) ป้ายฝึกงาน/รอฝึกงานตามวันที่เดิมจึงถอดออก */
    id: "trainingStart",
    label: "วันที่ฝึกงาน",
    width: "min-w-[120px]",
    asc: "เก่า → ใหม่",
    desc: "ใหม่ → เก่า",
    text: (a: Row) => (a.trainingStartOn ? thaiDate(a.trainingStartOn) : "ยังไม่กำหนด"),
    key: (a: Row) => a.trainingStartOn || "9999-12-31",
  },
  {
    /* นับเฉพาะวันฝึกงานจริง (`ฝ`) ชุดเดียวกับเงื่อนไขรอรับรถ */
    id: "trainDays",
    label: "จำนวนวันฝึก",
    width: "min-w-[96px]",
    asc: "น้อย → มาก",
    desc: "มาก → น้อย",
    text: (a: Row) => (a.trainee?.trainedDays == null ? "—" : `${a.trainee.trainedDays} วัน`),
    key: (a: Row) => String(a.trainee?.trainedDays ?? -1).padStart(5, "0"),
  },
  {
    id: "orientation",
    label: "ปฐมนิเทศ",
    width: "min-w-[84px]",
    asc: "ก → ฮ",
    desc: "ฮ → ก",
    text: (a: Row) => (a.trainee?.orientationOn ? "ปฐมนิเทศแล้ว" : "ยังไม่ปฐมนิเทศ"),
  },
  {
    id: "st",
    label: "ST ประเมิน",
    width: "min-w-[90px]",
    asc: "ก → ฮ",
    desc: "ฮ → ก",
    text: (a: Row) => (a.trainee?.stPassed ? "ประเมินผ่าน" : a.trainee?.stResult || "ยังไม่ประเมิน"),
  },
  {
    /* ทะเบียน · เบอร์รถ · สถานะจากบอร์ดซ่อม ในช่องเดียว — กรอง/เรียงตามสถานะ */
    id: "vehicle",
    label: "สถานะรถ",
    width: "min-w-[150px]",
    asc: "ก → ฮ",
    desc: "ฮ → ก",
    text: (a: Row) => (a.trainee ? vehicleReadiness(a.trainee, a.trainee.repair)?.label : undefined) ?? "ยังไม่มีรถ",
  },
  {
    /* ผลตรวจประวัติอาชญากรรมจากชีตตรวจประวัติ (Bew 9 พ.ย. 2569) — โหลดทีละแถวตอนแถวขึ้นจอ
       จึงกรอง/เรียงไม่ได้ (`noFilter`) · รายละเอียดคดีอยู่ในปุ่ม (`CriminalRecordButton`) */
    id: "criminal",
    label: "ผลประวัติอาชญากรรม",
    width: "min-w-[150px]",
    asc: "ก → ฮ",
    desc: "ฮ → ก",
    noFilter: true,
    text: () => "",
  },
  {
    id: "contactOwner",
    label: "ผู้ติดต่อกลับ",
    width: "min-w-[160px]",
    asc: "ก → ฮ",
    desc: "ฮ → ก",
    text: (a: Row) => a.contactOwner || "ยังไม่มีผู้รับผิดชอบ",
  },
  {
    id: "createdAt",
    label: "ประทับเวลา",
    width: "min-w-[130px]",
    asc: "เก่า → ใหม่",
    desc: "ใหม่ → เก่า",
    text: (a: Row) => stamp.format(new Date(a.createdAt)),
    facet: (a: Row) => stampDay.format(new Date(a.createdAt)),
    key: (a: Row) => a.createdAt,
  },
  {
    id: "phone",
    label: "เบอร์โทรศัพท์",
    width: "min-w-[130px]",
    asc: "น้อย → มาก",
    desc: "มาก → น้อย",
    text: (a: Row) => formatPhone(a.phone),
  },
  {
    id: "workZone",
    label: "สนใจงานเขต",
    width: "min-w-[130px]",
    asc: "ก → ฮ",
    desc: "ฮ → ก",
    text: (a: Row) => a.workZone || "—",
  },
  {
    id: "readyToStart",
    label: "ความพร้อมเริ่มงาน",
    width: "min-w-[150px]",
    asc: "เก่า → ใหม่",
    desc: "ใหม่ → เก่า",
    text: (a: Row) => (a.readyToStart ? thaiDate(a.readyToStart) : "—"),
    key: (a: Row) => a.readyToStart || "9999-12-31",
  },
  {
    id: "interview",
    label: "นัดสัมภาษณ์",
    width: "min-w-[150px]",
    asc: "เก่า → ใหม่",
    desc: "ใหม่ → เก่า",
    text: (a: Row) =>
      a.interview.date ? thaiDate(a.interview.date) : "ยังไม่ได้นัด",
    key: (a: Row) => a.interview.date || "9999-12-31",
  },
  {
    id: "status",
    label: "สถานะการสมัคร",
    width: "min-w-[170px]",
    asc: "ก → ฮ",
    desc: "ฮ → ก",
    text: statusText,
  },
  {
    id: "exitReason",
    label: "เหตุผลที่ยกเลิก",
    width: "min-w-[170px]",
    asc: "ก → ฮ",
    desc: "ฮ → ก",
    text: (a: Row) =>
      a.status === "cancelled"
        ? a.exitReason
          ? exitReasonText(a)
          : "ยังไม่ระบุเหตุผล"
        : "—",
    /* ติ๊กกรองเป็นชื่อกอง ไม่ใช่ข้อความที่พิมพ์เอง — ข้อ “อื่นๆ” ทุกใบรวมเป็นติ๊กเดียว
       และตรงกับแถบ “เหตุผลที่ยกเลิก” บนแถบสรุปที่กรองด้วยชื่อกองเหมือนกัน */
    facet: (a: Row) =>
      a.status === "cancelled"
        ? a.exitReason
          ? exitReasonLabel(a.exitReason)
          : "ยังไม่ระบุเหตุผล"
        : "—",
  },
  {
    /* โผล่เฉพาะตอนกรอง “ยกเลิก” หรือ “รอการติดต่อ” อย่างเดียว (ดู `BLACKLIST_VIEWS`)
       · ยกเลิก = ค่าที่ฝ่ายบุคคลตั้งเอง แก้ได้ · รอการติดต่อ = ระบบจับจากชื่อ/เบอร์ */
    id: "blacklist",
    label: "Blacklist",
    width: "min-w-[150px]",
    asc: "ก → ฮ",
    desc: "ฮ → ก",
    text: (a: Row) =>
      a.status === "cancelled"
        ? a.blacklist
          ? "Blacklist"
          : "ไม่"
        : a.blacklistHit
          ? "ตรงกับ Blacklist"
          : "ไม่พบ",
  },
] as const;

/**
 * คอลัมน์ “เหตุผลที่ยกเลิก” **ไม่ได้อยู่ในตารางตลอดเวลา** — โผล่เมื่อกรองดูเฉพาะ
 * ใบที่ยกเลิกเท่านั้น
 *
 * เพราะในมุมมองปกติมันเป็นช่องที่ว่างเกือบทุกแถว (ใบส่วนใหญ่ยังเดินอยู่ในสาย)
 * คอลัมน์ที่มีแต่ขีดกลางกินความกว้างไปเปล่า ๆ และดันคอลัมน์ที่ใช้จริงให้ต้องเลื่อน
 */
const REASON_COLUMN: ColumnId = "exitReason";

/**
 * คอลัมน์ Blacklist โผล่เฉพาะสองมุมมองนี้ (29 ก.ย. 2026) — ใบที่ยังเดินอยู่ในสาย
 * ไม่มีอะไรให้ตอบ ขึ้นมาก็มีแต่ขีดเต็มคอลัมน์
 */
const BLACKLIST_COLUMN: ColumnId = "blacklist";
const BLACKLIST_VIEWS = [STATUS_LABEL.cancelled, STATUS_LABEL.pending_contact];

/** คอลัมน์ JR + วันที่ฝึกงาน — โผล่เฉพาะตอนกรอง “รอฝึกงาน” หรือ “ฝึกงาน” อย่างเดียว */
const TRAINING_COLUMNS: ColumnId[] = ["jr", "trainingStart"];

/** คอลัมน์ผู้ฝึกงาน — โผล่เฉพาะตอนกรอง “ฝึกงาน” อย่างเดียว (Bew 5 พ.ย. 2569) */
const TRAINEE_COLUMNS: ColumnId[] = ["drivercode", "position", "customer", "plant", "trainer", "trainDays", "orientation", "st", "vehicle", "criminal"];

/**
 * มุมมองฝึกงานมีลำดับคอลัมน์ของตัวเอง (Bew 5 พ.ย. 2569) — รหัสพนักงานย้ายไปอยู่ใต้ชื่อ · JR ตำแหน่ง ลูกค้า แพล้นท์ ต่อจากชื่อ
 * · ถอดช่วงสมัคร (สนใจงานเขต · ความพร้อมเริ่มงาน · นัดสัมภาษณ์) และประทับเวลาออก ให้ตารางแคบลง (Excel ยังมีประทับเวลา)
 */
const TRAINEE_ORDER: ColumnId[] = [
  "fullName",
  "jr",
  "position",
  "customer",
  "plant",
  "contactOwner",
  "phone",
  "trainer",
  "trainingStart",
  "trainDays",
  "orientation",
  "st",
  "vehicle",
  "criminal",
  "status",
];

/** มุมมองรอฝึกงาน = ชุดเดียวกับฝึกงาน ไม่มี ฝึกมา/ปฐมนิเทศ/ST — ตรงกับแท็บรอฝึกงานของหน้าติดตาม (Bew 5 พ.ย. 2569) */
const WAITING_HIDDEN: ColumnId[] = ["trainDays", "orientation", "st"];
const WAITING_ORDER: ColumnId[] = TRAINEE_ORDER.filter((id) => !WAITING_HIDDEN.includes(id));

/** ป้าย/ความกว้างที่แคบลงในมุมมองฝึกงาน — ไม่ใส่ = ใช้ของ `COLUMNS` */
const TRAINEE_HEAD: Partial<Record<ColumnId, { label?: string; width?: string }>> = {
  fullName: { width: "min-w-[170px]" },
  drivercode: { width: "min-w-[96px]" },
  contactOwner: { width: "min-w-[104px]" },
  phone: { label: "เบอร์โทร", width: "min-w-[112px]" },
  jr: { width: "min-w-[118px]" },
  trainer: { width: "min-w-[120px]" },
  trainingStart: { label: "วันที่ฝึก", width: "min-w-[96px]" },
  trainDays: { label: "ฝึกมา", width: "min-w-[72px]" },
  orientation: { width: "min-w-[80px]" },
  st: { label: "ST", width: "min-w-[56px]" },
  vehicle: { width: "min-w-[140px]" },
  status: { label: "สถานะ", width: "min-w-[108px]" },
};

/**
 * ลำดับตั้งต้นของตาราง — **ใบล่าสุดอยู่บนสุดเสมอ** เรียงตามประทับเวลา
 *
 * เป็นทั้งค่าเริ่มต้นตอนเปิดหน้าและค่าที่ตารางถอยกลับมาใช้เมื่อผู้ใช้ปิดการเรียง
 * ของคอลัมน์อื่น — ตารางนี้จึงไม่มีสภาพ “ไม่ได้เรียงอะไรเลย” ที่ลำดับแถวขึ้นอยู่
 * กับว่าฐานข้อมูลส่งอะไรมาก่อน
 */
const DEFAULT_SORT: TableSort = { column: "createdAt", dir: "desc" };

/** ลำดับตั้งต้นของมุมมองฝึกงาน — รหัสพนักงาน น้อย → มาก (Bew 5 พ.ย. 2569) */
const TRAINEE_SORT: TableSort = { column: "drivercode", dir: "asc" };

/**
 * คอลัมน์ Excel — ตามคอลัมน์บนจอ (เหตุผล/Blacklist โผล่ตามมุมมองเดียวกัน) + ของที่จอซ่อนไว้ใน
 * tooltip/ปุ่ม: เลขที่ใบสมัคร · เวลานัด · ผลสัมภาษณ์ · Driver Rating
 */
function candidateXlsxColumns(
  showReason: boolean,
  showBlacklist: boolean,
  showTraining: boolean,
  showTrainee: boolean,
  /** มุมมองรอฝึกงาน — ไม่มีจำนวนวันฝึก/ปฐมนิเทศ/ST */
  waiting = false,
): XlsxColumn<Row>[] {
  const text = (id: ColumnId) => COLUMNS.find((c) => c.id === id)!.text;
  const progress: XlsxColumn<Row>[] = [
    { header: "จำนวนวันฝึก", width: 11, kind: "int", value: (a) => a.trainee?.trainedDays ?? null },
    { header: "ปฐมนิเทศ", width: 13, kind: "date", value: (a) => xlsxDate(a.trainee?.orientationOn ?? "") },
    { header: "ST ประเมิน", width: 22, kind: "status", value: text("st"), tone: (a) => (a.trainee?.stPassed ? "ok" : "mut") },
  ];
  const trainee: XlsxColumn<Row>[] = [
    ...(waiting ? [] : progress),
    { header: "ทะเบียนรถ", width: 14, value: (a) => a.trainee?.vehicle?.plateNo },
    { header: "เบอร์รถ", width: 10, kind: "code", value: (a) => a.trainee?.vehicle?.code },
    {
      header: "สถานะรถ",
      width: 18,
      kind: "status",
      value: (a) => (a.trainee?.vehicle ? text("vehicle")(a) : ""),
      tone: (a) => (a.trainee?.repair ? "alert" : a.trainee?.vehicle ? "ok" : null),
    },
    { header: "เหตุผล (รถ)", width: 22, value: (a) => a.trainee?.repair?.label },
  ];
  return [
    { header: "เลขที่ใบสมัคร", width: 14, kind: "code", value: (a) => a.ref },
    { header: "ชื่อ–นามสกุล", width: 28, value: (a) => a.fullName },
    ...(showTrainee
      ? [{ header: "รหัสพนักงาน", width: 12, kind: "code", value: (a) => a.trainee?.drivercode } satisfies XlsxColumn<Row>]
      : []),
    ...(showTraining
      ? [{ header: "เลขที่ JR", width: 13, kind: "code", value: (a) => a.jrCode } satisfies XlsxColumn<Row>]
      : []),
    ...(showTrainee
      ? ([
          { header: "ตำแหน่ง", width: 10, value: (a) => a.trainee?.position },
          { header: "ลูกค้า", width: 12, value: (a) => a.trainee?.customer },
          { header: "แพล้นท์", width: 16, value: (a) => a.trainee?.plant },
          { header: "ผู้ติดต่อกลับ", width: 20, value: (a) => a.contactOwner },
          { header: "เบอร์โทรศัพท์", width: 15, kind: "code", value: (a) => formatPhone(a.phone) },
          { header: "ครูฝึก", width: 22, value: (a) => a.trainee?.trainer },
        ] satisfies XlsxColumn<Row>[])
      : []),
    ...(showTraining
      ? [
          { header: "วันที่ฝึกงาน", width: 13, kind: "date", value: (a) => xlsxDate(a.trainingStartOn) } satisfies XlsxColumn<Row>,
        ]
      : []),
    ...(showTrainee ? trainee : []),
    ...(showTrainee
      ? []
      : ([{ header: "ผู้ติดต่อกลับ", width: 20, value: (a) => a.contactOwner }] satisfies XlsxColumn<Row>[])),
    { header: "ประทับเวลา", width: 17, kind: "datetime", value: (a) => xlsxDate(a.createdAt) },
    ...(showTrainee
      ? []
      : ([
          { header: "เบอร์โทรศัพท์", width: 15, kind: "code", value: (a) => formatPhone(a.phone) },
        ] satisfies XlsxColumn<Row>[])),
    ...(showTrainee
      ? []
      : ([
          { header: "สนใจงานเขต", width: 18, value: (a) => a.workZone },
          {
            header: "ความพร้อมเริ่มงาน",
            width: 16,
            kind: "date",
            /* ตอบเป็นวันที่ = วันที่จริง · ตอบเป็นข้อความ (“พร้อมทันที”) = ข้อความตามที่ตอบ */
            value: (a) => xlsxDate(/^\d{4}-\d{2}-\d{2}$/.test(a.readyToStart) ? a.readyToStart : "") ?? a.readyToStart,
          },
          { header: "นัดสัมภาษณ์", width: 13, kind: "date", value: (a) => xlsxDate(a.interview.date) },
          { header: "เวลานัด", width: 9, kind: "code", value: (a) => a.interview.time },
        ] satisfies XlsxColumn<Row>[])),
    {
      header: "สถานะการสมัคร",
      width: 20,
      kind: "status",
      value: statusText,
      tone: (a) => (a.status === "cancelled" ? "alert" : a.waitHandover ? "mut" : a.status === "working" || a.status === "training" ? "ok" : null),
    },
    ...(showReason
      ? [{ header: "เหตุผลที่ยกเลิก", width: 26, value: text("exitReason") } satisfies XlsxColumn<Row>]
      : []),
    ...(showBlacklist
      ? [
          {
            header: "Blacklist",
            width: 16,
            kind: "status",
            value: text("blacklist"),
            tone: (a) => (a.blacklist || a.blacklistHit ? "alert" : "mut"),
          } satisfies XlsxColumn<Row>,
        ]
      : []),
    {
      header: "Driver Rating",
      width: 12,
      kind: "decimal",
      value: (a) => (a.rating.average === null ? null : Math.round(a.rating.average * 100) / 100),
    },
    { header: "ระดับ Rating", width: 12, kind: "status", value: (a) => levelOf(a.rating.average)?.label },
  ];
}

/** ความกว้างคอลัมน์คำตอบตามชนิดคำถาม — ข้อความยาวกว้าง วันที่/ตัวเลขแคบ */
const FORM_WIDTH: Record<QuestionKind, number> = {
  text: 22,
  textarea: 40,
  single: 20,
  multi: 28,
  date: 13,
  tel: 15,
  nid: 17,
  number: 11,
};

type FormRow = Row & { form: Record<string, string> };

/**
 * ชีตเดียวของไฟล์ — คอลัมน์ตาราง (`candidateXlsxColumns`) ต่อด้วยคำตอบในฟอร์มทั้งใบ
 * (รวมเป็นชีตเดียว 20 ต.ค. 2026 · Bew: จัดการง่ายกว่าสองชีต) · แถว = ที่เห็นอยู่ ลำดับเดียวกับตาราง
 * · ตารางถือแค่รูปย่อ จึงดึงคำตอบเต็มตอนกดส่งออก (`POST /api/recruitment/applications/export`)
 */
async function candidateSheet(
  visible: Row[],
  showReason: boolean,
  showBlacklist: boolean,
  showTraining: boolean,
  showTrainee: boolean,
  waiting = false,
): Promise<Pick<XlsxSheet<FormRow>, "columns" | "rows">> {
  const form = await requestJson<ApplicationFormExport>(
    "/api/recruitment/applications/export",
    { method: "POST", body: { ids: visible.map((a) => a.id) } },
    "ดึงข้อมูลใบสมัครไม่สำเร็จ",
  );
  const byId = new Map(form.rows.map((r) => [r.id, r.values]));

  return {
    rows: visible.map((a) => ({ ...a, form: byId.get(a.id) ?? {} })),
    columns: [
      ...candidateXlsxColumns(showReason, showBlacklist, showTraining, showTrainee, waiting),
      ...form.columns.map(
        (q): XlsxColumn<FormRow> => ({
          header: q.label,
          width: FORM_WIDTH[q.kind] ?? 22,
          kind: q.kind === "date" ? "date" : q.kind === "number" ? "decimal" : q.kind === "tel" || q.kind === "nid" ? "code" : "text",
          value: (a) => {
            const v = a.form[q.id];
            if (!v) return null;
            if (q.kind === "date") return xlsxDate(v) ?? v;
            if (q.kind === "number") return Number.isFinite(Number(v)) ? Number(v) : v;
            return v;
          },
        }),
      ),
    ],
  };
}

/** ค่าที่คอลัมน์นี้ใช้ในรายการติ๊ก — ไม่ได้กำหนด `facet` ไว้ก็ใช้ค่าที่ขึ้นบนจอ */
function facetOf(
  column: (typeof COLUMNS)[number],
  row: Row,
): string {
  return "facet" in column ? column.facet(row) : column.text(row);
}

type ColumnId = (typeof COLUMNS)[number]["id"];
type Filters = Partial<Record<ColumnId, string[]>>;

/** การ์ดที่ไม่ใช่สถานะใบสมัคร — แถวมาจากหน้าติดตามพนักงานใหม่ (อัตราว่าง · รับรถแล้ว)
 *  · รอรับรถย้ายไปอยู่ตารางเดียวกับฝึกงานแล้ว (การ์ดแบ่งครึ่ง · Bew 9 พ.ย. 2569) */
export type HubView = "open" | "working";

/** การ์ด → แท็บของหน้าติดตาม */
const HUB_STAGE: Record<HubView, Tab> = { open: "open", working: "working" };

export function CandidatesView({
  title,
  rows,
  setRows,
  initialTerm = "",
  initialRc = false,
  contactOptions = [],
  docSlots,
  requisitions = [],
  blacklist = [],
  setRequisitions,
  hub,
  initialView = null,
  initialTraining = false,
}: {
  title: string;
  rows: ApplicationSummary[];
  setRows: Dispatch<SetStateAction<ApplicationSummary[]>>;
  /**
   * เลขอ้างอิงตั้งต้น — มาได้สองทาง: `?ref=` ที่คิวงานบนหน้าภาพรวมส่งมา และ
   * การกดชื่อในคอลัมน์ “ผู้สมัครที่รับอัตรา” ของแท็บคำขอสรรหา
   *
   * ถูกแปลงเป็น **ตัวกรองของคอลัมน์ชื่อ** ตั้งแต่เปิดหน้า ผู้ใช้จึงเห็นได้ว่า
   * กำลังกรองอะไรอยู่และล้างทิ้งได้ด้วยปุ่มเดียว ต่างจากคำค้นที่ซ่อนอยู่ในช่องพิมพ์
   */
  initialTerm?: string;
  /** `?rc=1` จากหน้าติดตามพนักงานใหม่ — เปิดกล่องข้อมูล RC ของใบ `initialTerm` ทันที */
  initialRc?: boolean;
  /** รายชื่อเจ้าหน้าที่ฝ่ายบุคคลจากคลังคำถาม */
  contactOptions?: string[];
  docSlots: DocSlot[];
  /**
   * คำขอสรรหาทั้งหมด + ตัวแก้ของแท็บ — ดรอปดาวน์ “ตำแหน่งที่สมัคร” ในกล่องทำเอกสาร
   * อ่านจากนี่ และผูก/ปลดคำขอได้ แท็บคำขอสรรหาจึงเห็นผลทันทีโดยไม่ต้องโหลดหน้าใหม่
   */
  requisitions?: Requisition[];
  setRequisitions?: Dispatch<SetStateAction<Requisition[]>>;
  /** ทุกใบที่ติด Blacklist จากฐาน — ดู `listBlacklist()` */
  blacklist?: BlacklistEntry[];
  /** ข้อมูลหน้าติดตามพนักงานใหม่ (`getHub()`) — การ์ดรอสรรหา/รับรถแล้ว */
  hub?: Hub;
  initialView?: HubView | null;
  /** `?view=handover` (ลิงก์เก่าของการ์ดรอรับรถ) — เปิดมุมมองฝึกงาน + รอรับรถ */
  initialTraining?: boolean;
}) {
  /** ลำดับที่ผู้ใช้เลือกจากหัวคอลัมน์ · `null` = ลำดับตั้งต้นของมุมมอง (ดู `sort` ข้างล่าง) */
  const [pickedSort, setSort] = useState<TableSort | null>(null);
  const [filters, setFilters] = useState<Filters>(() => {
    const ref = initialTerm.trim().toUpperCase();
    const match = ref ? rows.find((a) => a.ref.toUpperCase() === ref) : undefined;
    /* มาจากลิงก์ `?ref=` = ตั้งใจดูคนนี้คนเดียว ไม่ว่าเขาอยู่สถานะไหน — ถ้ายังกรอง
       “รอการติดต่อ” ซ้อนอยู่ คนที่ผ่านสัมภาษณ์ไปแล้วจะได้ตารางว่าง */
    if (match) return { fullName: [match.fullName] };
    return initialTraining ? { status: TRAINING_VIEW_LABELS } : DEFAULT_FILTERS;
  });

  /**
   * รายชื่อ Blacklist ที่ใช้จับ = ของจากฐาน **ทับด้วยสถานะสดของแถวที่โหลดอยู่**
   * — กดติด/ถอด Blacklist ในตารางแล้วผลต้องขึ้นทันที ไม่ใช่รอโหลดหน้าใหม่
   */
  const blacklistIndex = useMemo(() => {
    const loaded = new Set(rows.map((a) => a.ref));
    return [
      ...blacklist.filter((e) => !loaded.has(e.ref)),
      ...rows
        .filter((a) => a.status === "cancelled" && a.blacklist)
        .map((a) => ({ ref: a.ref, fullName: a.fullName, phone: a.phone })),
    ];
  }, [rows, blacklist]);

  /**
   * แถวของหน้าติดตามพนักงานใหม่ ทับด้วยคำขอ + สถานะใบสมัครสดบนจอนี้ — ผูก RQ / เลื่อนสถานะแล้ว
   * การ์ดรอสรรหา/รับรถแล้วขยับทันที ไม่ต้องโหลดใหม่ · ขั้นคิดด้วย `hubRows()` ตัวเดียวกับหน้านั้น
   */
  const [view, setView] = useState<HubView | null>(hub ? initialView : null);
  /**
   * ช่อง `ร` / `ฝ` ที่เพิ่งกรอกในแท็บสถานะฝึกงาน (`คำขอ → วันที่ → รหัส` · ว่าง = ลบ) — ทับลงแถวด้วย
   * `withDayEdit()` ป้าย/การ์ดรอรับรถขยับทันที และตรงกับที่เซิร์ฟเวอร์คิดหลังโหลดใหม่ (ทับซ้ำได้ ผลเท่าเดิม)
   */
  const [dayEdits, setDayEdits] = useState<Map<string, Record<string, string>>>(() => new Map());

  const hubRecords = useMemo<OnboardingRecord[]>(() => {
    if (!hub) return [];
    const live = new Map(requisitions.map((r) => [r.id, r]));
    const appStatus = new Map(rows.map((a) => [a.id, a.status]));
    const known = new Set(hub.records.map((r) => r.id));
    /* คำขอที่เพิ่งกดเพิ่มอัตราบนการ์ดรอสรรหา — ยังไม่อยู่ใน `hub` ต่อหัวรายการให้ก่อน */
    const added = requisitions
      .filter((r) => !known.has(r.id))
      .map((r): OnboardingRecord => ({ ...r, onboarding: {}, atms: null }));
    return [
      ...added,
      ...hub.records.map((r) => {
        /* `requisitions` ถือแถวชุดแรกที่โหลดมา — ค่าที่เซิร์ฟเวอร์คิดเอง (วันฝึก · `ร`/`ฝ`) ต้องเป็นของ `hub` เสมอ
           ไม่งั้นค่าเก่าในชุดแรกทับของใหม่ */
        let next: OnboardingRecord = {
          ...r,
          ...live.get(r.id),
          trainedDays: r.trainedDays,
          handoverMarkedOn: r.handoverMarkedOn,
          handoverMarks: r.handoverMarks,
        };
        if (next.match)
          next = { ...next, match: { ...next.match, status: appStatus.get(next.match.applicationId) ?? next.match.status } };
        for (const [iso, code] of Object.entries(dayEdits.get(r.id) ?? {})) next = withDayEdit(next, iso, code);
        return next;
      }),
    ];
  }, [hub, requisitions, rows, dayEdits]);
  const hubList = useMemo(() => (hub ? hubRows(hubRecords, hub.repairs) : []), [hub, hubRecords]);
  const hubById = useMemo(() => new Map(hubList.map((r) => [r.id, r])), [hubList]);
  const hubCounts = useMemo(() => {
    if (!hub) return null;
    const list = hubList;
    return {
      open: list.filter((r) => r.stage === "open").length,
      working: list.filter((r) => r.stage === "working").length,
    };
  }, [hub, hubList]);

  function pickView(next: HubView | null) {
    setView(next);
    try {
      const url = new URL(window.location.href);
      if (next) url.searchParams.set("view", next);
      else url.searchParams.delete("view");
      window.history.replaceState(null, "", url);
    } catch {}
  }

  /** ใบสมัคร → คำขอที่ผูกไว้ — ลิงก์ไปเส้นทางพนักงานใหม่ของคนนั้น */
  const rqByApplication = useMemo(
    () => new Map(requisitions.filter((r) => r.match).map((r) => [r.match!.applicationId, r])),
    [requisitions],
  );

  /** บันทึกช่องในแท็บสถานะฝึกงาน — แตะ `ร`/`ฝ` (ใส่ หรือเปลี่ยนจาก) = ทับลงแถวคำขอนั้น */
  const onDaySaved = useCallback((requisitionId: string, iso: string, code: string, prev: string) => {
    if (!isHandoverMark(code) && !isHandoverMark(prev)) return;
    setDayEdits((cur) => {
      const next = new Map(cur);
      next.set(requisitionId, { ...(next.get(requisitionId) ?? {}), [iso]: code });
      return next;
    });
  }, []);

  /* จับเฉพาะใบที่รอการติดต่อ — จังหวะเดียวที่การเตือนมีประโยชน์คือก่อนยกหูโทร */
  const enriched = useMemo<Row[]>(
    () =>
      rows.map((a) => {
        const rq = rqByApplication.get(a.id);
        const row = hubById.get(rq?.id ?? "");
        return {
          ...a,
          blacklistHit:
            a.status === "pending_contact" ? findBlacklistHit(a, blacklistIndex) : null,
          trainingStartOn: rq?.trainingStartOn ?? "",
          jrCode: rq?.code ?? "",
          trainee: traineeOf(rq, row, hub?.repairs),
          waitHandover: a.status === "training" && Boolean(row?.waitHandover),
        };
      }),
    [rows, blacklistIndex, rqByApplication, hubById, hub],
  );

  /** ครึ่งขวาของการ์ดฝึกงาน — นับจากแถวชุดเดียวกับตาราง */
  const handoverCount = useMemo(() => enriched.filter((a) => a.waitHandover).length, [enriched]);

  /**
   * กล่องข้อมูล RC — ปุ่ม RC (ใบที่ผูกแล้ว) · คอลัมน์วันที่ฝึกงาน · เลือกสถานะ “รอฝึกงาน”/“ฝึกงาน”
   * (`target` — ต้องกรอกฟอร์มนี้ + เลือก RQ + วันเริ่มฝึกก่อน บันทึกแล้วค่อยเลื่อนสถานะ · Bew 22/25 ต.ค. 2569)
   */
  /** ฟอร์มข้อมูล JR (`_id` ของคำขอ) — กดเลข JR ในคอลัมน์รอฝึกงาน/ฝึกงาน */
  const [jrFor, setJrFor] = useState<string | null>(null);

  const [rcFor, setRcFor] = useState<{ application: ApplicationSummary; target: RcTarget | null } | null>(() => {
    if (!initialRc || !initialTerm) return null;
    const application = rows.find((a) => a.ref.toUpperCase() === initialTerm.trim().toUpperCase());
    const requisition = application && requisitions.find((r) => r.match?.applicationId === application.id);
    return application && requisition ? { application, target: null } : null;
  });

  /**
   * เลือก “รอฝึกงาน” / “ฝึกงาน” จากช่องสถานะ — รอฝึกงานแล้ว (มี RQ + วันเริ่มฝึก) เลื่อนเป็นฝึกงานได้ทันที
   * ไม่ต้องกรอกกล่องซ้ำ · นอกนั้นเปิดกล่องข้อมูล RC ก่อนเสมอ
   */
  function toStage(a: Row, to: RcTarget) {
    const rq = rqByApplication.get(a.id);
    /* ยังไม่มีรหัส พจส. = เปิดกล่องให้กรอกก่อน — ฝึกงานต้องเข้าทะเบียนประวัติได้ทันที (Bew 3 พ.ย. 2569) */
    if (to === "training" && a.status === "interview_passed" && rq?.trainingStartOn && rq.drivercode) {
      void patchCandidate(a.id, { status: "training" });
      return;
    }
    setRcFor({ application: a, target: to });
  }

  const [opening, setOpening] = useState<string | null>(null);
  /* Sync ใบสมัครจาก Google Form — วางแถว (ทุกโหมด) / ชี้ path ไฟล์ (เฉพาะ dev) */
  const [syncMode, setSyncMode] = useState<FormSyncMode | null>(null);
  const [drafting, setDrafting] = useState<Application | null>(null);
  /** ฉบับที่กล่องทำเอกสารเปิดขึ้นมาก่อน — ปุ่มดาวเปิดตรงที่ Driver Rating */
  const [draftDoc, setDraftDoc] = useState<HrDocId | undefined>(undefined);

  /**
   * ค่าที่มีจริงในแต่ละคอลัมน์ **พร้อมจำนวนแถวของแต่ละค่า** — รายการติ๊กในเมนู
   * หัวคอลัมน์อ่านจากตรงนี้ · ตัวเลขท้ายรายการมาพร้อมกับการย้ายมาใช้ `ColumnMenu`
   * และมีประโยชน์จริงที่นี่: เห็นว่าติ๊ก “รอติดต่อ” แล้วจะเหลือกี่ใบก่อนกด
   */
  const choices = useMemo(() => {
    const map = {} as Record<ColumnId, ColumnFilterOption[]>;
    for (const column of COLUMNS) {
      const tally = new Map<string, number>();
      for (const row of enriched) {
        const value = facetOf(column, row);
        tally.set(value, (tally.get(value) ?? 0) + 1);
      }
      map[column.id] = [...tally.entries()]
        .map(([value, count]) => ({ value, label: value, count }))
        .sort((a, b) => thaiNumericCompare(a.label, b.label));
    }
    return map;
  }, [enriched]);

  const pickedStatus = filters.status ?? [];
  const onlyStatus = (label: string) =>
    pickedStatus.length === 1 && pickedStatus[0] === label;

  /** กรองดูเฉพาะใบที่ยกเลิกอยู่ = ถึงเวลาที่คอลัมน์เหตุผลมีประโยชน์ */
  const showReason = onlyStatus(STATUS_LABEL.cancelled);

  const showBlacklist = BLACKLIST_VIEWS.some(onlyStatus);

  /** มุมมองฝึกงาน = กรองเฉพาะ ฝึกงาน และ/หรือ รอรับรถ (การ์ดแบ่งครึ่งกรองสองค่าพร้อมกัน · ติ๊กเหลือค่าเดียวที่หัวคอลัมน์ได้) */
  const trainingView = pickedStatus.length > 0 && pickedStatus.every((l) => TRAINING_VIEW_LABELS.includes(l));

  const showTraining = trainingView || onlyStatus(STATUS_LABEL.interview_passed);

  /** กรองรอฝึกงาน = คอลัมน์ผู้ฝึกงานแบบเดียวกัน แต่ไม่มี ฝึกมา/ปฐมนิเทศ/ST (Bew 5 พ.ย. 2569) */
  const showWaiting = onlyStatus(STATUS_LABEL.interview_passed);

  /** กรองฝึกงาน/รอฝึกงานอย่างเดียว = คอลัมน์ผู้ฝึกงาน แทนคอลัมน์ช่วงสมัคร (Bew 5 พ.ย. 2569) */
  const showTrainee = trainingView || showWaiting;

  /** กรองฝึกงานอย่างเดียว = ตารางฝึกงานรายวัน + ปุ่มคัดลอกสรุปใต้ตาราง (ย้ายมาจากหน้าติดตามพนักงานใหม่ 25 ต.ค. 2569) */
  const showDaily = !view && trainingView;

  /**
   * แท็บเหนือตารางของมุมมองฝึกงาน: ตาราง | สถานะฝึกงาน (Bew 5 พ.ย. 2569 — เดิมตารางรายวันต่อท้าย)
   * · `dailyAlerts` = Issue วันนี้ ขึ้นจุดแดงบนแท็บแม้อยู่แท็บตาราง
   */
  const [traineeTab, setTraineeTab] = useState<"table" | "daily">("table");
  /** กล่องในแถบมุมมองที่เครื่องมือของตารางสถานะฝึกงานถูกส่งมาวาง (portal — ดู `TraineeMatrix`) */
  const [dailyToolbar, setDailyToolbar] = useState<HTMLDivElement | null>(null);
  const [dailyAlerts, setDailyAlerts] = useState(0);
  const onDailyAlerts = useCallback((n: number) => setDailyAlerts(n), []);
  const dailyTab = showDaily && traineeTab === "daily";

  /** ช่องค้นหา — มีเฉพาะแท็บตารางของมุมมองฝึกงาน (Bew 5 พ.ย. 2569) · ช่องซ่อน = ไม่กรองต่อเบื้องหลัง
   *  (แท็บสถานะฝึกงานมีช่องค้นหาของตัวเอง) */
  const [query, setQuery] = useState("");
  const needle = showDaily && !dailyTab ? query.trim().toLowerCase() : "";

  const columns = useMemo(
    () =>
      showTrainee
        ? (showWaiting ? WAITING_ORDER : TRAINEE_ORDER).map((id) => COLUMNS.find((c) => c.id === id)!)
        : COLUMNS.filter(
            (c) =>
              (c.id !== REASON_COLUMN || showReason) &&
              (c.id !== BLACKLIST_COLUMN || showBlacklist) &&
              (!TRAINING_COLUMNS.includes(c.id) || showTraining) &&
              !TRAINEE_COLUMNS.includes(c.id),
          ),
    [showReason, showBlacklist, showTraining, showTrainee, showWaiting],
  );
  const head = (c: (typeof COLUMNS)[number]) => ({
    label: (showTrainee && TRAINEE_HEAD[c.id]?.label) || c.label,
    width: (showTrainee && TRAINEE_HEAD[c.id]?.width) || c.width,
  });

  /* ลำดับที่เลือกไว้ใช้ต่อเมื่อคอลัมน์นั้นยังอยู่ในมุมมอง — นอกนั้นถอยไปลำดับตั้งต้นของมุมมอง */
  const sort =
    pickedSort && columns.some((c) => c.id === pickedSort.column)
      ? pickedSort
      : showTrainee
        ? TRAINEE_SORT
        : DEFAULT_SORT;

  const visible = useMemo(() => {
    /* กรองด้วยคอลัมน์ที่เห็นอยู่จริงเท่านั้น — ตัวกรองของคอลัมน์เหตุผลที่ถูกซ่อนไป
       แล้วต้องไม่แอบกรองต่ออยู่เบื้องหลัง */
    const matched = enriched.filter((a) => {
      if (needle) {
        const rq = rqByApplication.get(a.id);
        const hay = [a.fullName, a.nickname, a.ref, a.phone, a.jrCode, rq?.drivercode, rq?.plant, rq?.trainer?.name, rq?.vehicle?.code, rq?.vehicle?.plateNo];
        if (!hay.some((t) => t?.toLowerCase().includes(needle))) return false;
      }
      return columns.every((column) => {
        const picked = filters[column.id];
        return !picked?.length || picked.includes(facetOf(column, a));
      });
    });

    const column = COLUMNS.find((c) => c.id === sort.column) ?? COLUMNS[0];

    const read = (a: Row) =>
      "key" in column ? column.key(a) : column.text(a);

    return [...matched].sort((a, b) => {
      const order = thaiNumericCompare(read(a), read(b));
      return sort.dir === "asc" ? order : -order;
    });
  }, [enriched, columns, filters, sort, needle, rqByApplication]);

  /**
   * หน้าละ 25 แถว (2 พ.ย. 2569) — ตัดหลังกรอง/เรียงแล้ว · แถบสรุป ตัวเลขในหัวคอลัมน์
   * ปุ่ม Excel และตารางฝึกงานรายวันยังใช้ `visible` ทั้งชุดเหมือนเดิม
   */
  const [paged, pagedScroll] = usePaged(visible, JSON.stringify([filters, sort, needle]));

  /** แถวของตารางรายวัน — `pool` = ทุกใบที่ฝึกงาน (ตัวโหลด) · `people` = ที่ตารางแสดงอยู่หลังกรอง */
  const toPerson = (a: ApplicationSummary): TraineePerson => {
    const rq = rqByApplication.get(a.id);
    return { id: rq?.id ?? a.id, code: rq?.code ?? "", name: a.fullName, drivercode: rq?.drivercode ?? "", vehicle: rq?.vehicle ?? null, contactOwner: a.contactOwner, nickname: a.nickname };
  };
  const dailyPool = showDaily ? rows.filter((a) => a.status === "training").map(toPerson) : [];
  const dailyPeople = showDaily ? visible.map(toPerson) : [];

  /**
   * บันทึกการแก้จากช่องในตาราง — เปลี่ยนหน้าจอก่อน แล้วค่อยรอเซิร์ฟเวอร์
   *
   * คนใช้หน้านี้เลื่อนสถานะติดกันหลายแถวรวดเดียว การให้แถวค้างรออีก 300 ม.ว.
   * ทุกครั้งทำให้รู้สึกว่าระบบหน่วง · ถ้าเซิร์ฟเวอร์ปฏิเสธ (เช่นใบที่ผู้สมัคร
   * ยกเลิกเองไปแล้ว) แถวถูกดึงกลับเป็นค่าเดิมพร้อมข้อความบอกเหตุผล ไม่ปล่อยให้จอโกหก
   */
  async function patchCandidate(
    id: string,
    /* สามช่องท้ายมาจากกล่องที่ซ้อนอยู่บนรายงานเท่านั้น ช่องในตารางไม่เคยส่งมา */
    patch: CellPatch & {
      answers?: AnswerMap;
      files?: Record<string, string | null>;
      documents?: DocumentData;
      /** Driver Rating จากกล่องทำเอกสาร — `id` ข้อ → คำตอบใน master · `null` = ลบ */
      rating?: Record<string, string | null>;
    },
    /**
     * โยนข้อผิดพลาดต่อแทนที่จะเด้ง SweetAlert — กล่องแก้ไขในรายงานต้องการ
     * ข้อความไปขึ้นเป็นแถบในกล่องตัวเอง ถ้าเด้ง SweetAlert ทับกล่องซ้อนอีกชั้น
     * จะไม่เหลือทางกลับไปแก้ค่าที่กรอกค้างไว้
     */
    rethrow = false,
  ) {
    const before = rows.find((a) => a.id === id);
    if (!before) return;

    setRows((prev) =>
      prev.map((a) =>
        a.id === id
          ? {
              ...a,
              ...("status" in patch ? { status: patch.status! } : {}),
              ...("exitReason" in patch ? { exitReason: patch.exitReason! } : {}),
              ...("exitReasonNote" in patch ? { exitReasonNote: patch.exitReasonNote! } : {}),
              ...("blacklist" in patch ? { blacklist: patch.blacklist! } : {}),
              ...("contactOwner" in patch
                ? { contactOwner: patch.contactOwner! }
                : {}),
              ...(patch.interview
                ? { interview: { ...a.interview, ...patch.interview } }
                : {}),
            }
          : a,
      ),
    );

    try {
      const next = await requestJson<Application>(
        `/api/recruitment/applications/${id}`,
        { method: "PATCH", body: patch as Record<string, unknown> },
        "บันทึกไม่สำเร็จ",
      );
      setRows((prev) =>
        prev.map((a) =>
          a.id === id
            ? {
                ...a,
                status: next.status,
                contactOwner: next.contactOwner,
                interview: next.interview,
                exitReason: next.exitReason,
                exitReasonNote: next.exitReasonNote,
                blacklist: next.blacklist,
                updatedAt: next.updatedAt,
                /* แก้คำตอบในใบแล้วชื่อ เบอร์ เขต และวันพร้อมเริ่มงานในแถวเปลี่ยนตาม
                   — สี่ค่านี้เป็นคำตอบในฟอร์มที่ตารางหยิบมาโชว์ ไม่ใช่ค่าของตัวเอง
                   ถ้าไม่คำนวณใหม่ แถวจะยังโชว์เบอร์เดิมที่เพิ่งรู้ว่าพิมพ์ผิด */
                ...(patch.answers
                  ? {
                      fullName: next.fullName,
                      phone: next.phone,
                      workZone: roleAnswer(next, "work_zone"),
                      readyToStart: roleAnswer(next, "ready_date"),
                    }
                  : {}),
                ...(patch.files
                  ? {
                      fileCount: next.files.length,
                      photoUrl: next.files.find((f) => f.slot === "portrait")?.url ?? null,
                    }
                  : {}),
                /* ดาวในคอลัมน์จัดการต้องขยับตามคะแนนที่เพิ่งบันทึก — คำตอบในฟอร์ม
                   ก็มีผลต่อคะแนนด้วย จึงคิดใหม่ทั้งตอนแก้คะแนนและตอนแก้คำตอบ */
                ...(patch.rating || patch.answers ? { rating: summarizeRating(next) } : {}),
              }
            : a,
        ),
      );
      setDrafting((open) => (open && open.id === id ? next : open));
    } catch (err) {
      setRows((prev) => prev.map((a) => (a.id === id ? before : a)));
      if (rethrow) throw err;
      alertError("บันทึกไม่สำเร็จ", err instanceof Error ? err.message : undefined);
    }
  }

  /**
   * โหลดใบเต็มก่อนเปิดกล่องทำเอกสาร — ตารางถือแค่รูปย่อ (`ApplicationSummary`)
   * ส่วนรายงานผู้สมัครกับสัญญาต้องใช้คำตอบทั้งใบ
   */
  async function openDocs(id: string, doc?: HrDocId) {
    const failed = "เปิดหน้าทำเอกสารไม่สำเร็จ";
    setOpening(doc ? `${doc}:${id}` : id);
    try {
      const full = await requestJson<Application>(
        `/api/recruitment/applications/${id}`,
        {},
        failed,
      );
      setDraftDoc(doc);
      setDrafting(full);
    } catch (err) {
      alertError(failed, err instanceof Error ? err.message : undefined);
    } finally {
      setOpening(null);
    }
  }

  const filtering = isFiltering(filters as InsightFilters);

  return (
    /* มุมมองฝึกงานมีตารางรายวันต่อท้าย — หน้าเลื่อนยาวตามปกติแทนการล็อกสูงเท่าจอ */
    <div className={dailyTab ? "flex flex-col gap-4" : view ? "flex flex-col" : "flex flex-col lg:h-[calc(100dvh-4rem)]"}>
      {/* หัวเรื่องซ่อนไว้ให้โปรแกรมอ่านจอเท่านั้น — ถอดหัวที่มองเห็นออกตามคำขอ 23 ก.ย. 2026
          (`sr-only` เป็น absolute จึงไม่กิน `gap` ของกล่องนอก) */}
      <h1 className="sr-only">{title}</h1>

      {/* ─────────────────────── แถบสรุป — ทุกชิ้นกดแล้วกรองตารางข้างล่าง */}
      <CandidateInsights
        rows={rows}
        filters={filters as InsightFilters}
        onFilter={(patch) => {
          pickView(null);
          setFilters((prev) => ({ ...prev, ...patch }));
        }}
        /* ล้างทุกคอลัมน์ ไม่ใช่เฉพาะที่แถบสรุปเป็นเจ้าของ — ปุ่มอยู่บนการ์ด “ทั้งหมด”
           ไม่ได้เพิ่มแถวใหม่เหนือตาราง (14 ต.ค. 2026 · Bew) */
        onClearAll={() => {
          pickView(null);
          setFilters(DEFAULT_FILTERS);
        }}
        hubCounts={hubCounts}
        handoverCount={handoverCount}
        view={view}
        onView={pickView}
      />

      {view && hub ? (
        /* รอสรรหา / รับรถแล้ว = ตารางของหน้าติดตามพนักงานใหม่ตัวเดียวกัน (ฝัง · อ่านอย่างเดียว) */
        <OnboardingView
          key={view}
          embedded
          records={hubRecords}
          repairs={hub.repairs}
          initialStage={HUB_STAGE[view]}
          note={TAB_NOTE[HUB_STAGE[view]]}
          onCreated={(created) => setRequisitions?.((prev) => [...created, ...prev])}
          onUpdated={(updated) =>
            setRequisitions?.((prev) =>
              prev.some((r) => r.id === updated.id)
                ? prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r))
                : [updated, ...prev],
            )
          }
        />
      ) : (
      <>

      {/* `relative` ทำให้กล่องนี้เป็น containing block ของลูกที่ `position: absolute`
          (เช่น `.sr-only` ในปุ่มแต่ละแถว) — ไม่งั้นสแปนที่มองไม่เห็นพวกนั้นจะไปอิง
          ตำแหน่งกับเอกสารทั้งหน้าแทนกล่องนี้ ดันความสูงจริงของหน้าให้ยาวเกินของจริง
          (เห็นผลเป็นแถบข้างที่ดูเหมือนเลื่อนตามเพราะ container คำนวณความสูงผิด) */}
      {showDaily ? (
        <div className="flex flex-none flex-col gap-2 py-3 lg:flex-row lg:flex-wrap lg:items-center lg:gap-3">
          <SegmentedControl
            label="มุมมองฝึกงาน"
            value={traineeTab}
            onChange={setTraineeTab}
            options={[
              { value: "table", label: "ตาราง", count: visible.length },
              { value: "daily", label: "สถานะฝึกงาน", dot: dailyAlerts ? "bg-alert" : undefined },
            ]}
            /* ชิดขวาของแถบ (Bew 5 พ.ย. 2569) — `order-last` ให้อยู่ท้ายแม้ประกาศก่อนช่องค้นหา
               · แท็บสถานะฝึกงาน: RC Alert + Excel ใน `dailyToolbar` เป็นตัวดันชิดขวาแทน */
            className={`w-full sm:w-auto sm:self-end lg:order-last lg:self-auto ${dailyTab ? "" : "lg:ml-auto"}`}
          />
          {/* เดือน · ค้นหา · สาขา · RC Alert · Excel ของตารางรายวัน — `contents` ให้ลูกเป็นช่องของแถวนี้ตรง ๆ */}
          <div ref={setDailyToolbar} className={dailyTab ? "contents" : "hidden"} />
          {dailyTab ? null : (
            <>
              <SearchField
                value={query}
                onChange={setQuery}
                label="ค้นหา"
                placeholder="ชื่อ เลขที่ รหัส แพล้นท์ ครูฝึก รถ…"
                tone="filled"
                className="lg:max-w-sm lg:flex-1"
              />
            </>
          )}
        </div>
      ) : null}

      {/* แท็บสถานะฝึกงาน — เมานต์ค้างไว้ (ซ่อนด้วย `hidden`) สลับแท็บไม่ต้องโหลดตารางรายวันใหม่ */}
      {showDaily ? (
        <div hidden={!dailyTab}>
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
      <div
        ref={pagedScroll}
        className={`sheet-bleed relative overflow-auto border-y border-line ${
          "max-h-[calc(100dvh-13.5rem)] lg:max-h-none lg:min-h-0 lg:flex-1"
        }`}
      >
        {/* มุมมองฝึกงานคอลัมน์เยอะ — ระยะข้างช่องแคบลงทั้งตาราง ลดการเลื่อนแนวนอน */}
        <table
          className={`sheet-table w-full border-collapse text-13 ${showTrainee ? "[&_td]:px-2 [&_th]:px-2" : ""}`}
        >
          <thead>
            <tr>
              {columns.map((column, i) => (
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
                  className={`${head(column).width} sticky top-0 border-b border-line-strong bg-head px-3 py-0 text-left whitespace-nowrap ${
                    i === 0
                      ? "left-0 z-20 after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-line"
                      : "z-10"
                  }`}
                >
                  {/* ผลประวัติอาชญากรรม — ⓘ บอกเงื่อนไขการดึงข้อมูลข้างหัวคอลัมน์ */}
                  <div className="flex items-center gap-1">
                    <div className="min-w-0 flex-1">
                      <ColumnMenu
                        label={head(column).label}
                        sort={{
                          dir: sort.column === column.id ? sort.dir : null,
                          ascLabel: column.asc,
                          descLabel: column.desc,
                          /* กดปุ่มเรียงที่กำลังทำงานอยู่ซ้ำ = ถอยกลับไปลำดับตั้งต้น
                             ไม่ใช่ “ไม่เรียงอะไรเลย” — หัวคอลัมน์จึงบอกลำดับจริงเสมอ */
                          onSort: (dir) =>
                            setSort(dir ? { column: column.id, dir } : null),
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
                    </div>
                    {column.id === "criminal" ? <CriminalRecordHeadTip /> : null}
                  </div>
                </th>
              ))}

              {/* คอลัมน์ Action — ไม่เรียง ไม่กรอง จึงไม่อยู่ใน `COLUMNS` · ป้าย
                  “จัดการ” ตัวเดียวกับตารางคำขอ · ปุ่ม “เปิด Job บน ATMs” (แถวที่กำลัง
                  ฝึกงาน) ถูกถอดออกชั่วคราวตามคำสั่งเจ้าของงาน 29 ก.ย. 2026 — ยังไม่ได้ต่อสาย
                  จริงอยู่แล้ว (รอ URL/API จากฝ่ายบุคคล) กลับมาใส่เมื่อได้ปลายทางจริง */}
              {/* หัวคอลัมน์จัดการถือปุ่ม Excel ของทั้งตาราง (20 ต.ค. 2026) — หน้านี้ไม่มีแถบเครื่องมือ
                  และไม่เพิ่มแถวเหนือตาราง (กติกา 14 ต.ค.) · ส่งออกแถวที่กรอง/เรียงอยู่ */}
              <th className="sticky top-0 z-10 w-[132px] border-b border-line-strong bg-head px-2 py-1 text-right whitespace-nowrap">
                <span className="sr-only">จัดการ</span>
                <XlsxMenuButton
                  onImport={() => setSyncMode("paste")}
                  importLabel="นำเข้า · วางแถวใบสมัคร"
                  importHint="คัดลอกแถวจากชีต “การตอบแบบฟอร์ม 1”"
                  onSync={process.env.NODE_ENV === "development" ? () => setSyncMode("path") : undefined}
                  syncHint="ดึงแท็บ “ผู้สมัคร” · เฉพาะรอการติดต่อ"
                  name="ผู้สมัคร"
                  count={visible.length}
                  className="ml-auto py-1 pr-1.5 pl-2.5 text-12"
                  build={async () => ({
                    sheet: "ผู้สมัคร",
                    title: "ผู้สมัคร",
                    filter: columns
                      .filter((c) => filters[c.id]?.length)
                      .map((c) => `${head(c).label}: ${filters[c.id]!.join(", ")}`)
                      .join(" · "),
                    total: rows.length,
                    ...(await candidateSheet(visible, showReason, showBlacklist, showTraining, showTrainee, showWaiting)),
                  })}
                />
                {syncMode ? (
                  <FormSyncDialog mode={syncMode} onClose={() => setSyncMode(null)} onImported={setRows} />
                ) : null}
              </th>
            </tr>
          </thead>

          <tbody>
            {paged.pageRows.map((a) => {
              const locked = a.erased;
              const cell = {
                candidate: a,
                locked,
                onPatch: (patch: CellPatch) => patchCandidate(a.id, patch),
              };

              const t = a.trainee;
              const rq = rqByApplication.get(a.id);
              const openJr = rq ? () => setJrFor(rq.id) : undefined;
              const dash = <span className="text-mut">—</span>;

              /* ช่องตามคอลัมน์ที่เห็นอยู่ (`columns`) — หัวตารางกับแถวเดินลำดับเดียวกันเสมอ */
              const td = (id: ColumnId) => {
                switch (id) {
                  /* ชื่อยึดขอบซ้ายไว้ตอนตารางเลื่อนแนวนอน — แก้สถานะผิดคนคือ
                     ความเสียหายจริง ไม่ใช่แค่ความรำคาญ · พื้นต้องทึบ (ไม่ใช่
                     `/50` ของแถว) ไม่งั้นตัวหนังสือคอลัมน์ที่เลื่อนผ่านจะทะลุขึ้นมา */
                  case "fullName":
                    return (
                      <td className="sticky left-0 z-[5] bg-base-100 px-3 py-2 after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-line group-hover:bg-base-200">
                        <div className="flex items-center gap-2.5">
                          <PersonMark status={a.status} photoUrl={a.photoUrl} name={a.fullName} />
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium whitespace-nowrap text-ink">
                              {a.fullName} <Nickname value={a.nickname} />
                            </span>
                            <span className="flex items-center gap-1.5 font-mono text-10-5 tracking-wider text-primary">
                              {/* มุมมองฝึกงาน — รหัสพนักงานอยู่ใต้ชื่อแทนคอลัมน์แยก (Bew 5 พ.ย. 2569) */}
                              {showTrainee ? (
                                <>
                                  <span className="text-11 font-semibold tabular-nums text-ink" title="รหัสพนักงาน">
                                    {t?.drivercode || "ยังไม่มีรหัส"}
                                  </span>
                                  <span aria-hidden className="text-mut">·</span>
                                </>
                              ) : null}
                              {a.ref}
                              {!showTraining && rqByApplication.get(a.id) ? (
                                <Link
                                  href={`${ADMIN_ROOT}/onboarding/${rqByApplication.get(a.id)!.id}`}
                                  title="ดูเส้นทางพนักงานใหม่"
                                  className="rounded-selector bg-soft px-1 hover:bg-primary/15"
                                >
                                  {rqByApplication.get(a.id)!.code} ↗
                                </Link>
                              ) : null}
                            </span>
                          </div>
                        </div>
                      </td>
                    );
                  case "drivercode":
                    return (
                      <td className="px-3 py-2 font-mono text-12 whitespace-nowrap tabular-nums">
                        {t?.drivercode || dash}
                      </td>
                    );
                  case "jr":
                    return (
                      <td className="px-2 py-1.5">
                        {rqByApplication.get(a.id) ? (
                          <JrCell code={a.jrCode} onOpen={() => setJrFor(rqByApplication.get(a.id)!.id)} />
                        ) : (
                          <span className="px-1 text-mut">—</span>
                        )}
                      </td>
                    );
                  case "position":
                  case "customer":
                  case "plant":
                  case "trainer":
                    return <td className="px-3 py-2 whitespace-nowrap">{t?.[id] || dash}</td>;
                  case "trainingStart":
                    return (
                      <td className="px-2 py-1.5">
                        <TrainingDateCell
                          start={a.trainingStartOn}
                          due={a.status === "interview_passed"}
                          short={showTrainee}
                          locked={locked}
                          onEdit={() => setRcFor({ application: a, target: null })}
                        />
                      </td>
                    );
                  case "trainDays":
                    return (
                      <td
                        className="px-3 py-2 whitespace-nowrap tabular-nums"
                        title={t?.trainedDays == null ? undefined : `ฝึกงาน ${t.trainedDays}/${TRAINING_PLAN_DAYS} วัน (นับเฉพาะวันฝึกงาน)`}
                      >
                        {t?.trainedDays == null ? (
                          dash
                        ) : (
                          <span className={t.trainedDays >= TRAINING_PLAN_DAYS ? "font-medium text-st-live-ink" : ""}>
                            {t.trainedDays} <span className="text-mut">วัน</span>
                          </span>
                        )}
                      </td>
                    );
                  case "orientation":
                    return (
                      <td className="px-3 py-2">
                        <CheckMark
                          on={Boolean(t?.orientationOn)}
                          title={t?.orientationOn ? `ปฐมนิเทศแล้ว ${thaiDate(t.orientationOn)}` : "ยังไม่ปฐมนิเทศ"}
                          onOpen={openJr}
                        />
                      </td>
                    );
                  case "st":
                    return (
                      <td className="px-3 py-2">
                        <CheckMark
                          on={Boolean(t?.stPassed)}
                          title={`ST ประเมิน: ${t?.stResult || "ยังไม่ประเมิน"}`}
                          onOpen={openJr}
                        />
                      </td>
                    );
                  case "vehicle":
                    return (
                      <td className="px-3 py-1.5">
                        {t?.vehicle ? (
                          <div className="flex flex-col items-start gap-1">
                            <span className="leading-tight whitespace-nowrap">
                              {t.vehicle.plateNo || t.vehicle.code}
                              {t.vehicle.plateNo && t.vehicle.code ? (
                                <span className="ml-1.5 font-mono text-11 text-mut">{t.vehicle.code}</span>
                              ) : null}
                            </span>
                            <VehicleStatusCell repair={t.repair} />
                          </div>
                        ) : (
                          <span className="text-mut">ยังไม่มีรถ</span>
                        )}
                      </td>
                    );
                  case "criminal":
                    return (
                      <td className="px-2 py-1.5">
                        <CriminalRecordButton name={locked ? "" : a.fullName} site={rq?.branch ?? ""} />
                      </td>
                    );
                  case "contactOwner":
                    return (
                      <td className="px-2 py-1.5">
                        <OwnerCell {...cell} options={contactOptions} />
                      </td>
                    );
                  case "createdAt":
                    return (
                      <td className="px-3 py-2 font-mono text-11 whitespace-nowrap text-mut tabular-nums">
                        {stamp.format(new Date(a.createdAt))}
                      </td>
                    );
                  case "phone":
                    return (
                      <td className="px-3 py-2">
                        <PhoneCell phone={a.phone} />
                      </td>
                    );
                  case "workZone":
                    return <td className="px-3 py-2 whitespace-nowrap">{a.workZone || "—"}</td>;
                  case "readyToStart":
                    return (
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                        {a.readyToStart ? thaiDate(a.readyToStart) : "—"}
                      </td>
                    );
                  case "interview":
                    return (
                      <td className="px-2 py-1.5">
                        <InterviewCell {...cell} />
                      </td>
                    );
                  case "status":
                    return (
                      <td className="px-2 py-1.5">
                        <StatusCell
                          {...cell}
                          /* เป็นรอฝึกงาน/ฝึกงานต้องผ่านฟอร์มข้อมูล RC (+ เลือก RQ) ก่อนเสมอ */
                          onStage={(to) => toStage(a, to)}
                          handover={a.waitHandover}
                        />
                      </td>
                    );
                  case "exitReason":
                    return (
                      <td className="px-2 py-1.5">
                        <ReasonCell {...cell} />
                      </td>
                    );
                  case "blacklist":
                    return (
                      <td className="px-2 py-1.5">
                        {a.status === "cancelled" ? (
                          <BlacklistCell {...cell} />
                        ) : (
                          <BlacklistHitBadge hit={a.blacklistHit} />
                        )}
                      </td>
                    );
                }
              };

              return (
                <tr
                  key={a.id}
                  className="group border-b border-line transition-colors last:border-b-0 hover:bg-base-200/50"
                >
                  {columns.map((column) => (
                    <Fragment key={column.id}>{td(column.id)}</Fragment>
                  ))}

                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      {/* ข้อมูล RC → หน้าติดตามพนักงานใหม่ · ปลด/ลาออกทำที่นี่ที่เดียว */}
                      {!locked && rqByApplication.get(a.id) ? (
                        <RcButton
                          requisition={rqByApplication.get(a.id)!}
                          name={a.fullName}
                          onOpen={() => setRcFor({ application: a, target: null })}
                        />
                      ) : null}

                      {/* Driver Rating — สรุปคะแนนบนตัวปุ่มเลย (ดาว + เฉลี่ย) สีตามระดับ
                          กดแล้วเปิดกล่องทำเอกสารตรงที่ฉบับ Driver Rating เพื่อให้คะแนนต่อ */}
                      {!locked ? (
                        <RatingButton
                          rating={a.rating}
                          name={a.fullName}
                          busy={opening === `rating:${a.id}`}
                          onOpen={() => openDocs(a.id, "rating")}
                        />
                      ) : null}

                      {/* ปุ่มเดียวทั้งรายงานและสัญญา — รายงานผู้สมัครเป็นฉบับแรกในกล่อง
                          ใบที่ผู้สมัครขอลบข้อมูลแล้วยังเปิดได้ แต่เหลือแค่รายงาน */}
                      <button
                        type="button"
                        onClick={() => openDocs(a.id)}
                        disabled={opening === a.id}
                        title={
                          locked
                            ? "รายงานผู้สมัคร (ข้อมูลถูกลบตามคำขอแล้ว — ทำสัญญาไม่ได้)"
                            : "ทำเอกสาร: รายงานผู้สมัคร · Driver Rating · สัญญาจ้าง · สัญญาค้ำ · ยินยอมคืนเงินค้ำ"
                        }
                        className="inline-flex size-8 items-center justify-center rounded-selector border border-line text-mut transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50"
                      >
                        {opening === a.id ? (
                          <Loader2 size={14} strokeWidth={2} aria-hidden className="animate-spin" />
                        ) : (
                          <FilePenLine size={14} strokeWidth={1.9} aria-hidden />
                        )}
                        <span className="sr-only">ทำเอกสารและดูรายงานของ {a.fullName}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
            <Search size={20} strokeWidth={1.6} aria-hidden className="text-mut" />
            <p className="text-13 font-medium">
              {!rows.length
                ? "ยังไม่มีใบสมัครเข้ามา"
                : filtering
                  ? "ไม่มีผู้สมัครที่ตรงกับตัวกรอง"
                  : `ไม่มีใบที่${STATUS_LABEL.pending_contact}`}
            </p>
            <p className="max-w-[44ch] text-12 leading-relaxed text-mut text-pretty">
              {!rows.length
                ? "แชร์ลิงก์ /recruitment ให้ผู้สนใจ ใบที่ส่งเข้ามาจะขึ้นที่นี่ทันที"
                : filtering
                  ? "ปรับตัวกรองที่หัวคอลัมน์ หรือเริ่มใหม่ทั้งหมดด้วยปุ่มข้างล่าง"
                  : "โทรกลับครบทุกใบแล้ว — กดสถานะอื่นบนแถบสรุปข้างบนเพื่อดูใบที่เดินต่อไปแล้ว"}
            </p>
            {rows.length && filtering ? (
              <button
                type="button"
                onClick={() => setFilters(DEFAULT_FILTERS)}
                className="btn-sec mt-1 px-3 py-1.5 text-12-5 transition-colors hover:border-primary/40 hover:text-primary"
              >
                ล้างตัวกรองทั้งหมด
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <TablePager paged={paged} unit="ใบ" className="sheet-bleed -mt-px flex-none" />
      </>
      )}
      </>
      )}

      {rcFor ? (
        <CandidateRcForm
          applicationId={rcFor.application.id}
          linked={rqByApplication.get(rcFor.application.id) ?? null}
          requisitions={requisitions}
          name={rcFor.application.fullName}
          status={rcFor.application.status}
          contactOwner={rcFor.application.contactOwner}
          target={rcFor.target}
          onClose={() => setRcFor(null)}
          onLinked={(rows) => setRequisitions?.((prev) => prev.map((r) => rows.find((w) => w.id === r.id) ?? r))}
          onSaved={(next) => {
            setRequisitions?.((prev) =>
              prev.map((r) =>
                r.id === next.id
                  ? { ...r, drivercode: next.drivercode, outcome: next.outcome, trainingStartOn: next.trainingStartOn }
                  : r,
              ),
            );
            if (rcFor.target && rcFor.application.status !== rcFor.target)
              void patchCandidate(rcFor.application.id, { status: rcFor.target });
          }}
        />
      ) : null}

      {jrFor ? (
        <OnboardingDialog
          id={jrFor}
          onClose={() => setJrFor(null)}
          onSaved={(next) => setRequisitions?.((prev) => prev.map((r) => (r.id === next.id ? { ...r, ...next } : r)))}
        />
      ) : null}

      {drafting ? (
        <HrDocumentMaker
          application={drafting}
          requisitions={requisitions}
          onRequisitionsChange={(updated) =>
            setRequisitions?.((prev) =>
              prev.map((r) => updated.find((u) => u.id === r.id) ?? r),
            )
          }
          docSlots={docSlots}
          onPatch={(patch) => patchCandidate(drafting.id, patch, true)}
          initialDoc={draftDoc}
          onClose={() => setDrafting(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * ปุ่มดาว Driver Rating — **สรุปอยู่บนตัวปุ่ม** (ดาว + คะแนนเฉลี่ย) สีตามระดับ
 * ดีเยี่ยม/ดี = เขียว · ปานกลาง = เหลือง · ต่ำ/เสี่ยง = แดง · ยังไม่มีคะแนน = เทา
 * `title` บอกระดับ ผลรวม และจำนวนข้อที่ประเมินแล้ว — ไม่ต้องเปิดกล่องก็รู้ว่าครบหรือยัง
 */
/** ปุ่มข้อมูล RC — ใบที่มีผลสิ้นสุดแล้ว (ปลด/ลาออก …) ขึ้นเป็นสีแดงพร้อมป้าย */
function RcButton({ requisition, name, onOpen }: { requisition: Requisition; name: string; onOpen: () => void }) {
  const ended = ["withdrawn", "lost"].includes(outcomeGroup(requisition.outcome));
  return (
    <button
      type="button"
      onClick={onOpen}
      title={ended ? `ข้อมูล RC · ${outcomeLabel(requisition.outcome)}` : "ข้อมูล RC"}
      className={`inline-flex h-8 items-center justify-center gap-1 rounded-selector border px-2 transition-colors ${
        ended ? "border-alert/30 text-alert hover:bg-alert/10" : "border-line text-mut hover:border-primary/40 hover:text-primary"
      }`}
    >
      <ClipboardList size={14} strokeWidth={1.9} aria-hidden />
      {ended ? <span className="text-11-5 font-medium">{outcomeLabel(requisition.outcome)}</span> : null}
      <span className="sr-only">ข้อมูล RC ของ {name}</span>
    </button>
  );
}

function RatingButton({
  rating,
  name,
  busy,
  onOpen,
}: {
  rating: ApplicationSummary["rating"];
  name: string;
  busy: boolean;
  onOpen: () => void;
}) {
  const level = levelOf(rating.average);
  const tone = RATING_TONE[level?.tone ?? "none"];
  const summary = level
    ? `Driver Rating ${formatScore(rating.average)} · ${level.label} (${level.meaning}) · รวม ${rating.total}/${rating.count * 5} · ประเมินแล้ว ${rating.scored}/${rating.count} ข้อ`
    : "Driver Rating — ยังไม่มีคะแนน";

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={busy}
      title={summary}
      className={`inline-flex h-8 min-w-12 items-center justify-center gap-1 rounded-selector px-1.5 text-11-5 font-semibold tabular-nums transition-opacity hover:opacity-80 disabled:opacity-50 ${tone}`}
    >
      {busy ? (
        <Loader2 size={13} strokeWidth={2} aria-hidden className="animate-spin" />
      ) : (
        <Star size={13} strokeWidth={2.2} aria-hidden className={level ? "fill-current" : ""} />
      )}
      <span>{level ? rating.average!.toFixed(1) : "—"}</span>
      <span className="sr-only">
        {summary} — เปิด Driver Rating ของ {name}
      </span>
    </button>
  );
}

/**
 * คำตอบของข้อที่ทำหน้าที่ `role` ในใบนี้ — คู่ฝาแฝดฝั่งจอของ `roleAnswer()` ใน
 * `lib/recruitment/applications.ts` ที่ประกอบแถวตารางตอนโหลดหน้า
 *
 * มีไว้เพื่อคำนวณช่องที่เป็น *คำตอบในฟอร์ม* ใหม่หลังฝ่ายบุคคลแก้ใบ โดยไม่ต้อง
 * โหลดทั้งตารางใหม่เพียงเพราะแก้เบอร์ไปหนึ่งหลัก
 */
function roleAnswer(
  application: Application,
  role: Parameters<typeof findByRole>[1],
): string {
  const question = findByRole(application.questionSnapshot, role);
  if (!question) return "";
  const value = displayAnswer(application.answers[question.key], question.options);
  return value === "—" ? "" : value;
}

/* ──────────────────────────────────────────────────── วันที่ฝึกงาน */

/**
 * วันเริ่มฝึก · กดแก้วันได้ — ใบ “รอฝึกงาน” (`due`) ที่ถึงวันแล้วมีป้ายเตือนให้เลื่อนเป็นฝึกงาน
 * (RC กดเปลี่ยนสถานะเอง ระบบไม่เลื่อนให้ · Bew 25 ต.ค. 2569)
 */
function TrainingDateCell({
  start,
  due,
  locked,
  short = false,
  onEdit,
}: {
  start: string;
  due: boolean;
  locked: boolean;
  /** ปี พ.ศ. 2 หลัก — มุมมองฝึกงานที่ต้องประหยัดความกว้าง */
  short?: boolean;
  onEdit: () => void;
}) {
  const days = daysUntil(start);
  const body = (
    <>
      <span className="whitespace-nowrap tabular-nums">
        {start ? (short ? shortDay.format(new Date(`${start.slice(0, 10)}T00:00:00+07:00`)) : thaiDate(start)) : "ยังไม่กำหนด"}
      </span>
      {due && days !== null ? (
        <span
          className={`rounded-full px-2 py-0.5 text-11 font-medium whitespace-nowrap ${
            days <= 0 ? "bg-st-live text-st-live-ink" : "bg-st-wait text-st-wait-ink"
          }`}
        >
          {days <= 0 ? "ถึงวันเริ่มฝึก" : `อีก ${days} วัน`}
        </span>
      ) : null}
    </>
  );
  if (locked) return <span className="flex items-center gap-2 px-1.5 text-12-5 opacity-60">{body}</span>;
  return (
    <button
      type="button"
      onClick={onEdit}
      title="แก้วันเริ่มฝึก"
      className={`flex w-full items-center gap-2 rounded-selector px-1.5 py-1 text-left text-12-5 transition-colors hover:bg-base-200 ${
        start ? "" : "text-alert"
      }`}
    >
      {body}
    </button>
  );
}

/* ──────────────────────────────────────────────────── ไอคอนคนหน้าชื่อ */

/**
 * สัญญาณสีหน้าชื่อผู้สมัคร — อ่านทั้งคอลัมน์ได้ด้วยหางตาโดยไม่ต้องอ่านป้ายสถานะ
 *
 * แบ่งเป็นสามกลุ่มเท่านั้น ไม่ใช่สีละสถานะ เพราะคำถามที่คนกวาดสายตาลงมาทั้ง
 * คอลัมน์ถามอยู่คำถามเดียวคือ “รายนี้จบหรือยัง และจบแบบไหน”:
 * **เขียว = ผ่านแล้ว · เหลือง = ยังอยู่ระหว่างดำเนินการ · แดง = ออกจากกระบวนการ**
 *
 * เจ็ดสีในคอลัมน์เดียวไม่ได้ให้ข้อมูลเพิ่ม มีแต่ทำให้ต้องหยุดแปลความหมายทีละแถว
 * — รายละเอียดว่าอยู่ขั้นไหนอ่านได้จากป้ายสถานะซึ่งอยู่ในแถวเดียวกันอยู่แล้ว
 */
const PERSON_TONE: Record<ApplicationStatus, string> = {
  pending_contact: "bg-st-wait text-st-wait-ink",
  interview_scheduled: "bg-st-wait text-st-wait-ink",
  interview_passed: "bg-st-live text-st-live-ink",
  training: "bg-st-live text-st-live-ink",
  working: "bg-st-live text-st-live-ink",
  cancelled: "bg-alert/12 text-alert",
};

/** วงรอบรูปหน้าตรง — สีชุดเดียวกับไอคอนคน สถานะจึงยังอ่านออกตอนมีรูป */
const PERSON_RING: Record<ApplicationStatus, string> = {
  pending_contact: "ring-st-wait-ink/45",
  interview_scheduled: "ring-st-wait-ink/45",
  interview_passed: "ring-st-live-ink/45",
  training: "ring-st-live-ink/45",
  working: "ring-st-live-ink/45",
  cancelled: "ring-alert/50",
};

/**
 * หน้าชื่อ = รูปถ่ายหน้าตรงของใบ (รูปโปรไฟล์ · Bew 8 พ.ย. 2569) · ยังไม่มีรูป = ไอคอนคนตามสถานะเหมือนเดิม
 * ไม่ใช้รูปอื่นแทน จนกว่าจะมีคนอัปรูปหน้าตรง (กล่องเอกสารในใบ หรือวงรูปบนทะเบียนประวัติ)
 */
function PersonMark({
  status,
  photoUrl,
  name,
}: {
  status: ApplicationStatus;
  photoUrl?: string | null;
  name?: string;
}) {
  if (photoUrl) {
    /* ในตาราง = รูปย่อ 160 px · ชี้เมาส์ = รูปขยาย (`PhotoPreview`) */
    return (
      <PhotoPreview src={photoUrl} name={name}>
        <span className="flex size-7 flex-none">
          {/* eslint-disable-next-line @next/next/no-img-element -- ลิงก์ /api/media (private) */}
          <img
            src={mediaThumbUrl(photoUrl, 160)}
            alt=""
            loading="lazy"
            decoding="async"
            className={`size-full rounded-full object-cover ring-2 ${PERSON_RING[status]}`}
          />
          <span className="sr-only">{STATUS_LABEL[status]}</span>
        </span>
      </PhotoPreview>
    );
  }
  return (
    <span
      title={STATUS_LABEL[status]}
      className={`flex size-7 flex-none items-center justify-center rounded-full ${PERSON_TONE[status]}`}
    >
      <UserRound size={14} strokeWidth={2} aria-hidden />
      <span className="sr-only">{STATUS_LABEL[status]}</span>
    </span>
  );
}

/* ──────────────────────────────────────────────── ปุ่มกรองสถานะด้านบน */

/**
 * จุดสีหน้าปุ่มใช้ชุดเดียวกับไอคอนคนหน้าชื่อ — เขียวผ่าน · เหลืองกำลังดำเนิน ·
 * แดงออกจากกระบวนการ · ปุ่ม “ทั้งหมด” ไม่มีจุดเพราะไม่ได้แทนสถานะใดสถานะหนึ่ง
 */

/* ─────────────────────────────────────────────────────── เบอร์โทรศัพท์ */

/**
 * เบอร์โทร — **คัดลอกอย่างเดียว ไม่ใช่ลิงก์โทรออก**
 *
 * เดิมเป็น `tel:` ซึ่งบนเดสก์ท็อปไม่ได้โทรอะไร มีแต่เด้งถามว่าจะเปิดด้วยแอปไหน
 * ทั้งที่สิ่งที่คนทำจริงคือคัดลอกเบอร์ไปวางในโทรศัพท์หรือแชท · กดครั้งเดียว
 * คัดลอกทั้งเบอร์ และตัวเลขยังเป็น `select-all` ให้ลากเลือกเองได้ตามปกติ
 */
