"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import {
  Check,
  ClipboardList,
  Copy,
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
  InterviewCell,
  OwnerCell,
  ReasonCell,
  StatusCell,
  type CellPatch,
} from "@/app/recruitment/_components/admin/candidate-cells";
import {
  CandidateInsights,
  DEFAULT_FILTERS,
  isFiltering,
  stampDay,
  type InsightFilters,
  type TableSort,
} from "@/app/recruitment/_components/admin/candidate-insights";
import { HrDocumentMaker } from "@/app/recruitment/_components/admin/hr-document-maker";
import {
  CandidateRcForm,
  TRAINING_STATE_LABEL,
  trainingState,
} from "@/app/recruitment/_components/admin/candidate-rc-form";
import { outcomeGroup, outcomeLabel } from "@/app/recruitment/_lib/requisitions/onboarding";
import { RATING_TONE } from "@/app/recruitment/_components/admin/hr-document-rating";
import { formatScore, levelOf, summarizeRating } from "@/app/recruitment/_lib/driver-rating";
import type { HrDocId } from "@/app/recruitment/_lib/hr-documents";
import { XlsxMenuButton } from "@/components/ui/xlsx-export-button";
import { FormSyncDialog, type FormSyncMode } from "@/app/recruitment/_components/admin/form-import-dialog";
import { requestJson } from "@/lib/http";
import { alertError } from "@/lib/swal";
import { xlsxDate, type XlsxColumn, type XlsxSheet } from "@/lib/xlsx-table";
import type { ApplicationFormExport } from "@/app/recruitment/_lib/applications";
import {
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
import type { Requisition } from "@/app/recruitment/_lib/requisitions/types";
import { ADMIN_ROOT } from "@/app/recruitment/_lib/admin-nav";

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
 * กรองและเรียงทำฝั่ง client บนชุดที่โหลดมาแล้ว (สูงสุด 500 ใบ ดู `LIST_LIMIT`)
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
};

/** ฝึกงาน / รอฝึกงาน ของแถว — คอลัมน์วันที่ฝึกงาน (แท็บฝึกงาน) */
function trainingLabel(a: Row): string {
  const state = trainingState(a.trainingStartOn);
  return state ? TRAINING_STATE_LABEL[state] : "ยังไม่กำหนด";
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
    text: (a: Row) => STATUS_LABEL[a.status],
  },
  {
    /* โผล่เฉพาะตอนกรอง “ฝึกงาน” อย่างเดียว (Bew 22 ต.ค. 2569) · ติ๊กกรองเป็น ฝึกงาน/รอฝึกงาน */
    id: "trainingStart",
    label: "วันที่ฝึกงาน",
    width: "min-w-[180px]",
    asc: "เก่า → ใหม่",
    desc: "ใหม่ → เก่า",
    text: (a: Row) => (a.trainingStartOn ? `${thaiDate(a.trainingStartOn)} · ${trainingLabel(a)}` : "ยังไม่กำหนด"),
    facet: trainingLabel,
    key: (a: Row) => a.trainingStartOn || "9999-12-31",
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
  {
    id: "contactOwner",
    label: "ผู้ติดต่อกลับ",
    width: "min-w-[160px]",
    asc: "ก → ฮ",
    desc: "ฮ → ก",
    text: (a: Row) => a.contactOwner || "ยังไม่มีผู้รับผิดชอบ",
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

/** คอลัมน์วันที่ฝึกงาน — โผล่เฉพาะตอนกรอง “ฝึกงาน” อย่างเดียว */
const TRAINING_COLUMN: ColumnId = "trainingStart";

/**
 * ลำดับตั้งต้นของตาราง — **ใบล่าสุดอยู่บนสุดเสมอ** เรียงตามประทับเวลา
 *
 * เป็นทั้งค่าเริ่มต้นตอนเปิดหน้าและค่าที่ตารางถอยกลับมาใช้เมื่อผู้ใช้ปิดการเรียง
 * ของคอลัมน์อื่น — ตารางนี้จึงไม่มีสภาพ “ไม่ได้เรียงอะไรเลย” ที่ลำดับแถวขึ้นอยู่
 * กับว่าฐานข้อมูลส่งอะไรมาก่อน
 */
const DEFAULT_SORT: TableSort = { column: "createdAt", dir: "desc" };

/**
 * คอลัมน์ Excel — ตามคอลัมน์บนจอ (เหตุผล/Blacklist โผล่ตามมุมมองเดียวกัน) + ของที่จอซ่อนไว้ใน
 * tooltip/ปุ่ม: เลขที่ใบสมัคร · เวลานัด · ผลสัมภาษณ์ · Driver Rating
 */
function candidateXlsxColumns(showReason: boolean, showBlacklist: boolean, showTraining: boolean): XlsxColumn<Row>[] {
  const text = (id: ColumnId) => COLUMNS.find((c) => c.id === id)!.text;
  return [
    { header: "เลขที่ใบสมัคร", width: 14, kind: "code", value: (a) => a.ref },
    { header: "ชื่อ–นามสกุล", width: 28, value: (a) => a.fullName },
    { header: "ประทับเวลา", width: 17, kind: "datetime", value: (a) => xlsxDate(a.createdAt) },
    { header: "เบอร์โทรศัพท์", width: 15, kind: "code", value: (a) => formatPhone(a.phone) },
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
    {
      header: "สถานะการสมัคร",
      width: 20,
      kind: "status",
      value: (a) => STATUS_LABEL[a.status],
      tone: (a) => (a.status === "cancelled" ? "alert" : a.status === "working" || a.status === "training" ? "ok" : null),
    },
    ...(showTraining
      ? [
          { header: "วันที่ฝึกงาน", width: 13, kind: "date", value: (a) => xlsxDate(a.trainingStartOn) } satisfies XlsxColumn<Row>,
          {
            header: "สถานะฝึกงาน",
            width: 13,
            kind: "status",
            value: trainingLabel,
            tone: (a) => (trainingState(a.trainingStartOn) === "training" ? "ok" : "mut"),
          } satisfies XlsxColumn<Row>,
        ]
      : []),
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
    { header: "ผู้ติดต่อกลับ", width: 20, value: (a) => a.contactOwner },
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
      ...candidateXlsxColumns(showReason, showBlacklist, showTraining),
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
  /** ทุกใบที่ติด Blacklist จากฐาน (ไม่จำกัด 500 ใบ) — ดู `listBlacklist()` */
  blacklist?: BlacklistEntry[];
}) {
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [filters, setFilters] = useState<Filters>(() => {
    const ref = initialTerm.trim().toUpperCase();
    const match = ref ? rows.find((a) => a.ref.toUpperCase() === ref) : undefined;
    /* มาจากลิงก์ `?ref=` = ตั้งใจดูคนนี้คนเดียว ไม่ว่าเขาอยู่สถานะไหน — ถ้ายังกรอง
       “รอการติดต่อ” ซ้อนอยู่ คนที่ผ่านสัมภาษณ์ไปแล้วจะได้ตารางว่าง */
    return match ? { fullName: [match.fullName] } : DEFAULT_FILTERS;
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

  /** ใบสมัคร → คำขอที่ผูกไว้ — ลิงก์ไปเส้นทางพนักงานใหม่ของคนนั้น */
  const rqByApplication = useMemo(
    () => new Map(requisitions.filter((r) => r.match).map((r) => [r.match!.applicationId, r])),
    [requisitions],
  );

  /* จับเฉพาะใบที่รอการติดต่อ — จังหวะเดียวที่การเตือนมีประโยชน์คือก่อนยกหูโทร */
  const enriched = useMemo<Row[]>(
    () =>
      rows.map((a) => ({
        ...a,
        blacklistHit:
          a.status === "pending_contact" ? findBlacklistHit(a, blacklistIndex) : null,
        trainingStartOn: rqByApplication.get(a.id)?.trainingStartOn ?? "",
      })),
    [rows, blacklistIndex, rqByApplication],
  );

  /**
   * กล่องข้อมูล RC — ปุ่ม RC (ใบที่ผูกแล้ว) · คอลัมน์วันที่ฝึกงาน · เลือกสถานะ “ฝึกงาน” (`toTraining`
   * ต้องกรอกฟอร์มนี้ + เลือก RQ ก่อน บันทึกแล้วค่อยเลื่อนสถานะ · Bew 22 ต.ค. 2569)
   */
  const [rcFor, setRcFor] = useState<{ application: ApplicationSummary; toTraining: boolean } | null>(() => {
    if (!initialRc || !initialTerm) return null;
    const application = rows.find((a) => a.ref.toUpperCase() === initialTerm.trim().toUpperCase());
    const requisition = application && requisitions.find((r) => r.match?.applicationId === application.id);
    return application && requisition ? { application, toTraining: false } : null;
  });

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
        .sort((a, b) => a.label.localeCompare(b.label, "th", { numeric: true }));
    }
    return map;
  }, [enriched]);

  const pickedStatus = filters.status ?? [];
  const onlyStatus = (label: string) =>
    pickedStatus.length === 1 && pickedStatus[0] === label;

  /** กรองดูเฉพาะใบที่ยกเลิกอยู่ = ถึงเวลาที่คอลัมน์เหตุผลมีประโยชน์ */
  const showReason = onlyStatus(STATUS_LABEL.cancelled);

  const showBlacklist = BLACKLIST_VIEWS.some(onlyStatus);

  const showTraining = onlyStatus(STATUS_LABEL.training);

  const columns = useMemo(
    () =>
      COLUMNS.filter(
        (c) =>
          (c.id !== REASON_COLUMN || showReason) &&
          (c.id !== BLACKLIST_COLUMN || showBlacklist) &&
          (c.id !== TRAINING_COLUMN || showTraining),
      ),
    [showReason, showBlacklist, showTraining],
  );

  const visible = useMemo(() => {
    /* กรองด้วยคอลัมน์ที่เห็นอยู่จริงเท่านั้น — ตัวกรองของคอลัมน์เหตุผลที่ถูกซ่อนไป
       แล้วต้องไม่แอบกรองต่ออยู่เบื้องหลัง */
    const matched = enriched.filter((a) =>
      columns.every((column) => {
        const picked = filters[column.id];
        return !picked?.length || picked.includes(facetOf(column, a));
      }),
    );

    const column = COLUMNS.find((c) => c.id === sort.column) ?? COLUMNS[0];

    const read = (a: Row) =>
      "key" in column ? column.key(a) : column.text(a);

    return [...matched].sort((a, b) => {
      const order = read(a).localeCompare(read(b), "th", { numeric: true });
      return sort.dir === "asc" ? order : -order;
    });
  }, [enriched, columns, filters, sort]);

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
                ...(patch.files ? { fileCount: next.files.length } : {}),
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
    <div className="flex flex-col lg:h-[calc(100dvh-4rem)]">
      {/* หัวเรื่องซ่อนไว้ให้โปรแกรมอ่านจอเท่านั้น — ถอดหัวที่มองเห็นออกตามคำขอ 23 ก.ย. 2026
          (`sr-only` เป็น absolute จึงไม่กิน `gap` ของกล่องนอก) */}
      <h1 className="sr-only">{title}</h1>

      {/* ─────────────────────── แถบสรุป — ทุกชิ้นกดแล้วกรองตารางข้างล่าง */}
      <CandidateInsights
        rows={rows}
        filters={filters as InsightFilters}
        onFilter={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
        /* ล้างทุกคอลัมน์ ไม่ใช่เฉพาะที่แถบสรุปเป็นเจ้าของ — ปุ่มอยู่บนการ์ด “ทั้งหมด”
           ไม่ได้เพิ่มแถวใหม่เหนือตาราง (14 ต.ค. 2026 · Bew) */
        onClearAll={() => setFilters(DEFAULT_FILTERS)}
      />

      {/* `relative` ทำให้กล่องนี้เป็น containing block ของลูกที่ `position: absolute`
          (เช่น `.sr-only` ในปุ่มแต่ละแถว) — ไม่งั้นสแปนที่มองไม่เห็นพวกนั้นจะไปอิง
          ตำแหน่งกับเอกสารทั้งหน้าแทนกล่องนี้ ดันความสูงจริงของหน้าให้ยาวเกินของจริง
          (เห็นผลเป็นแถบข้างที่ดูเหมือนเลื่อนตามเพราะ container คำนวณความสูงผิด) */}
      <div className="sheet-bleed relative max-h-[calc(100dvh-10.5rem)] overflow-auto border-y border-line lg:max-h-none lg:min-h-0 lg:flex-1">
        <table className="sheet-table w-full border-collapse text-13">
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
                      /* กดปุ่มเรียงที่กำลังทำงานอยู่ซ้ำ = ถอยกลับไปลำดับตั้งต้น
                         ไม่ใช่ “ไม่เรียงอะไรเลย” — หัวคอลัมน์จึงบอกลำดับจริงเสมอ */
                      onSort: (dir) =>
                        setSort(dir ? { column: column.id, dir } : DEFAULT_SORT),
                    }}
                    filter={{
                      options: choices[column.id],
                      selected: filters[column.id] ?? [],
                      onChange: (next) =>
                        setFilters((prev) => ({ ...prev, [column.id]: next })),
                    }}
                  />
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
                  syncHint="ชี้ path ไฟล์ใบสมัคร พจส. บนเครื่องนี้"
                  name="ผู้สมัคร"
                  count={visible.length}
                  className="ml-auto py-1 pr-1.5 pl-2.5 text-12"
                  build={async () => ({
                    sheet: "ผู้สมัคร",
                    title: "ผู้สมัคร",
                    filter: columns
                      .filter((c) => filters[c.id]?.length)
                      .map((c) => `${c.label}: ${filters[c.id]!.join(", ")}`)
                      .join(" · "),
                    total: rows.length,
                    ...(await candidateSheet(visible, showReason, showBlacklist, showTraining)),
                  })}
                />
                {syncMode ? (
                  <FormSyncDialog mode={syncMode} onClose={() => setSyncMode(null)} onImported={setRows} />
                ) : null}
              </th>
            </tr>
          </thead>

          <tbody>
            {visible.map((a) => {
              const locked = a.erased;
              const cell = {
                candidate: a,
                locked,
                onPatch: (patch: CellPatch) => patchCandidate(a.id, patch),
              };

              return (
                <tr
                  key={a.id}
                  className="group border-b border-line transition-colors last:border-b-0 hover:bg-base-200/50"
                >
                  {/* ชื่อยึดขอบซ้ายไว้ตอนตารางเลื่อนแนวนอน — แก้สถานะผิดคนคือ
                      ความเสียหายจริง ไม่ใช่แค่ความรำคาญ · พื้นต้องทึบ (ไม่ใช่
                      `/50` ของแถว) ไม่งั้นตัวหนังสือคอลัมน์ที่เลื่อนผ่านจะทะลุขึ้นมา */}
                  <td className="sticky left-0 z-[5] bg-base-100 px-3 py-2 after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-line group-hover:bg-base-200">
                    <div className="flex items-center gap-2.5">
                      <PersonMark status={a.status} />
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium whitespace-nowrap text-ink">
                          {a.fullName}
                        </span>
                        <span className="flex items-center gap-1.5 font-mono text-10-5 tracking-wider text-primary">
                          {a.ref}
                          {rqByApplication.get(a.id) ? (
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

                  <td className="px-3 py-2 font-mono text-11 whitespace-nowrap text-mut tabular-nums">
                    {stamp.format(new Date(a.createdAt))}
                  </td>

                  <td className="px-3 py-2">
                    <PhoneCell phone={a.phone} />
                  </td>

                  <td className="px-3 py-2 whitespace-nowrap">{a.workZone || "—"}</td>

                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                    {a.readyToStart ? thaiDate(a.readyToStart) : "—"}
                  </td>

                  <td className="px-2 py-1.5">
                    <InterviewCell {...cell} />
                  </td>

                  <td className="px-2 py-1.5">
                    <StatusCell
                      {...cell}
                      /* เป็นฝึกงานต้องผ่านฟอร์มข้อมูล RC (+ เลือก RQ) ก่อนเสมอ */
                      onTraining={() => setRcFor({ application: a, toTraining: true })}
                    />
                  </td>

                  {showTraining ? (
                    <td className="px-2 py-1.5">
                      <TrainingDateCell
                        start={a.trainingStartOn}
                        locked={locked}
                        onEdit={() => setRcFor({ application: a, toTraining: false })}
                      />
                    </td>
                  ) : null}

                  {showReason ? (
                    <td className="px-2 py-1.5">
                      <ReasonCell {...cell} />
                    </td>
                  ) : null}

                  {showBlacklist ? (
                    <td className="px-2 py-1.5">
                      {a.status === "cancelled" ? (
                        <BlacklistCell {...cell} />
                      ) : (
                        <BlacklistHitBadge hit={a.blacklistHit} />
                      )}
                    </td>
                  ) : null}

                  <td className="px-2 py-1.5">
                    <OwnerCell {...cell} options={contactOptions} />
                  </td>

                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      {/* ข้อมูล RC → หน้าติดตามพนักงานใหม่ · ปลด/ลาออกทำที่นี่ที่เดียว */}
                      {!locked && rqByApplication.get(a.id) ? (
                        <RcButton
                          requisition={rqByApplication.get(a.id)!}
                          name={a.fullName}
                          onOpen={() => setRcFor({ application: a, toTraining: false })}
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

      {rcFor ? (
        <CandidateRcForm
          applicationId={rcFor.application.id}
          linked={rqByApplication.get(rcFor.application.id) ?? null}
          requisitions={requisitions}
          name={rcFor.application.fullName}
          status={rcFor.application.status}
          contactOwner={rcFor.application.contactOwner}
          toTraining={rcFor.toTraining}
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
            if (rcFor.toTraining && rcFor.application.status !== "training")
              void patchCandidate(rcFor.application.id, { status: "training" });
          }}
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

/** วันเริ่มฝึก + ป้าย ฝึกงาน/รอฝึกงาน (วันยังไม่ถึง) · กดแก้วันได้ */
function TrainingDateCell({ start, locked, onEdit }: { start: string; locked: boolean; onEdit: () => void }) {
  const state = trainingState(start);
  const body = (
    <>
      <span className="whitespace-nowrap tabular-nums">{start ? thaiDate(start) : "ยังไม่กำหนด"}</span>
      {state ? (
        <span
          className={`rounded-full px-2 py-0.5 text-11 font-medium whitespace-nowrap ${
            state === "training" ? "bg-st-live text-st-live-ink" : "bg-st-wait text-st-wait-ink"
          }`}
        >
          {TRAINING_STATE_LABEL[state]}
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
  interview_waiting: "bg-st-wait text-st-wait-ink",
  interview_passed: "bg-st-live text-st-live-ink",
  training: "bg-st-live text-st-live-ink",
  working: "bg-st-live text-st-live-ink",
  cancelled: "bg-alert/12 text-alert",
};

function PersonMark({ status }: { status: ApplicationStatus }) {
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
function PhoneCell({ phone }: { phone: string }) {
  const [copied, setCopied] = useState(false);
  const text = formatPhone(phone);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* เบราว์เซอร์ไม่ให้สิทธิ์คลิปบอร์ด — ตัวเลขยังลากเลือกเองได้อยู่ดี */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="คลิกเพื่อคัดลอกเบอร์"
      className="group flex items-center gap-1.5 rounded-selector px-1 py-0.5 transition-colors hover:bg-base-200"
    >
      <span className="font-mono whitespace-nowrap tabular-nums select-all">
        {text}
      </span>
      {copied ? (
        <Check size={12} strokeWidth={2.5} aria-hidden className="flex-none text-primary" />
      ) : (
        <Copy
          size={11}
          strokeWidth={2}
          aria-hidden
          className="flex-none text-mut opacity-0 transition-opacity group-hover:opacity-100"
        />
      )}
      <span className="sr-only">{copied ? "คัดลอกแล้ว" : "คัดลอกเบอร์"}</span>
    </button>
  );
}
