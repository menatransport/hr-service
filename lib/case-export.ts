import { Workbook, type Worksheet } from "exceljs";

import {
  caseAgeDays,
  departmentLabel,
  isSlaBreached,
  reviewMeta,
  reviewOf,
  slaTarget,
  statusMeta,
  toBangkokDate,
} from "./case-flow";
import { departmentPerformance, reasonBreakdown } from "./case-report";
import { hasFilters, UNASSIGNED, type CaseFilters } from "./case-filter";
import { reasonGroup } from "./data";
import type { HrCase } from "./types";

/**
 * ไฟล์ Excel ของคิวคำร้อง — **สร้างฝั่งเซิร์ฟเวอร์เท่านั้น** (`exceljs` เป็นของ Node)
 * เรียกจาก `app/api/cases/export/route.ts` ที่เดียว
 *
 * ออกแบบให้ **เอาไปทำงานต่อได้ทันที** ไม่ใช่แค่พิมพ์ออกมาดู:
 *
 * - แถวที่ 1 เป็นหัวตารางจริง ไม่มีแบนเนอร์ชื่อรายงานคร่อมอยู่ข้างบน — Pivot Table
 *   และ `Ctrl+T` จึงจับช่วงข้อมูลได้ถูกตั้งแต่ครั้งแรก (ข้อมูลรายงานย้ายไปชีต “สรุป”)
 * - เปิด AutoFilter + ตรึงหัวตารางและคอลัมน์เลขติดตามไว้ให้แล้ว
 * - **วันที่เป็นชนิดวันที่จริง ตัวเลขเป็นชนิดตัวเลขจริง** ไม่ใช่ข้อความที่หน้าตา
 *   เหมือนตัวเลข — เรียงลำดับและ SUM/AVERAGE ได้เลยโดยไม่ต้องแปลงก่อน
 * - คอลัมน์ที่เอาไว้กรอง (สถานะ / หน่วยงาน / ประเภทเรื่อง / เกิน SLA) **ไม่มีช่องว่าง**
 *   ค่าที่ยังไม่มีถูกเขียนเป็นป้ายของมันเอง (“ยังไม่มอบหมาย”) เพราะช่องว่างใน
 *   ดรอปดาวน์ของ AutoFilter คือค่าที่คนกรองมองข้ามได้ง่ายที่สุด
 */

/* ------------------------------------------------------------------ จานสี */

/**
 * เขียวเดียวกับ `--color-primary` ของธีม `hrs` (#0f766e) ไล่เป็น 3 น้ำหนัก
 * หัวตารางเข้ม · แถบสรุปอ่อน · แถวคู่อ่อนมาก — ตารางจึงอ่านตามแนวนอนได้
 * โดยไม่ต้องมีเส้นหนา ๆ มาช่วย
 */
const GREEN = "FF0F766E";
const GREEN_DEEP = "FF0B5A54";
const GREEN_SOFT = "FFE6F1F0";
const GREEN_MIST = "FFF4F9F8";

const WHITE = "FFFFFFFF";
const INK = "FF15201D";
const MUT = "FF65756F";
const LINE = "FFD9E4E1";
const SLA_INK = "FFC2410C";

/** ฟอนต์ที่มีอยู่จริงบนเครื่องที่เปิดไฟล์ — Plex Thai ของหน้าเว็บไม่ได้ติดตั้งให้ใคร */
const FONT = "Tahoma";

const solid = (argb: string) =>
  ({ type: "pattern", pattern: "solid", fgColor: { argb } }) as const;

const hair = { style: "thin", color: { argb: LINE } } as const;
const gridBorder = {
  top: hair,
  left: hair,
  bottom: hair,
  right: hair,
} as const;

/* ------------------------------------------------------------------ วันที่ */

/**
 * ISO → `Date` สำหรับเซลล์วันที่ของ Excel
 *
 * ExcelJS แปลงวันที่เป็นเลขลำดับจาก `getTime()` ตรง ๆ (ไม่สนโซนเวลา) — ค่าที่
 * ส่งเข้าไปจึงต้องเป็นตัวที่ฟิลด์ UTC ของมันคือเวลาไทยอยู่แล้ว ซึ่งก็คือ
 * `toBangkokDate()` ตัวเดียวกับที่ `formatDateTime()` บนหน้าจอใช้
 *
 * **ห้ามบวกชั่วโมงเองที่นี่** — เคยบวก 7 ไว้ตรง ๆ แล้วเวลาในไฟล์เดินช้ากว่า
 * หน้าจอ 7 ชั่วโมง เพราะค่าดิบของ NCAC ไม่มีโซนต่อท้าย (ดู `BANGKOK_SHIFT_MS`)
 */
function excelDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = toBangkokDate(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const DATE_FMT = "dd/mm/yyyy";
const DATETIME_FMT = "dd/mm/yyyy hh:mm";

/** `"08:12"` — เวลาแบบข้อความไว้ดูเฉย ๆ คู่กับคอลัมน์วันที่ที่เอาไปคำนวณได้ */
function clockText(iso: string | null): string {
  const d = excelDate(iso);
  if (!d) return "";
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** `"2026-08"` — เรียงลำดับถูกต้องตามตัวอักษร จึงเอาไปทำ Pivot รายเดือนได้ตรง ๆ */
function monthKey(iso: string | null): string {
  const d = excelDate(iso);
  if (!d) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ คอลัมน์ */

type CellValue = string | number | Date | null;

interface ExportColumn {
  header: string;
  width: number;
  value: (hrCase: HrCase) => CellValue;
  numFmt?: string;
  /** คอลัมน์ที่ควรอยู่กลางช่อง — ตัวเลขสั้น ๆ กับค่าที่มีแค่ไม่กี่แบบ */
  center?: boolean;
}

const reviewName = (hrCase: HrCase, level: 1 | 2) =>
  reviewOf(hrCase, level)?.reviewerName ?? "";

const reviewResult = (hrCase: HrCase, level: 1 | 2) => {
  const review = reviewOf(hrCase, level);
  return review ? reviewMeta[review.status].label : "";
};

/**
 * ลำดับคอลัมน์: ระบุตัวคำร้อง → เวลา → สถานะและการมอบหมาย → ผู้แจ้ง → SLA →
 * สายอนุมัติ → ตัวเลข → เนื้อความยาว ๆ ไว้ท้ายสุด
 *
 * เนื้อความยาวอยู่ท้ายเพราะคนอ่านไฟล์นี้กรองจากคอลัมน์ซ้ายเป็นหลัก ถ้าเอา
 * “รายละเอียดที่แจ้ง” ไปแทรกกลาง ๆ จะต้องเลื่อนจอผ่านมันทุกครั้งที่ไล่ดูสถานะ
 */
const COLUMNS: ExportColumn[] = [
  { header: "เลขติดตาม", width: 16, value: (c) => c.trackingNo },
  {
    header: "วันที่แจ้ง",
    width: 12,
    numFmt: DATE_FMT,
    center: true,
    value: (c) => excelDate(c.createdAt),
  },
  { header: "เวลาที่แจ้ง", width: 10, center: true, value: (c) => clockText(c.createdAt) },
  { header: "เดือนที่แจ้ง", width: 11, center: true, value: (c) => monthKey(c.createdAt) },
  { header: "สถานะ", width: 18, value: (c) => statusMeta[c.status].label },
  {
    header: "ขั้นที่",
    width: 7,
    center: true,
    value: (c) => statusMeta[c.status].step,
  },
  {
    header: "หน่วยงานผู้รับผิดชอบ",
    width: 20,
    value: (c) => departmentLabel(c.departmentId),
  },
  {
    header: "ประเภทเรื่อง",
    width: 26,
    value: (c) => c.complaintType ?? "ยังไม่จัดประเภท",
  },
  {
    header: "กลุ่มสาเหตุ",
    width: 24,
    value: (c) => reasonGroup(c.reasonGroup).label,
  },
  { header: "รหัส พจส.", width: 13, value: (c) => c.driverId },
  { header: "ชื่อ พจส.", width: 22, value: (c) => c.driverName },
  /*
   * **ไม่มี “สังกัด พจส.” และ “ความสำคัญ” โดยตั้งใจ — ถอดออกตามคำสั่งเจ้าของงาน
   * (13 ส.ค. 2026) อย่าใส่กลับเองถ้าไม่ได้สั่ง**
   *
   * `driverMeta` ว่างเกือบทุกแถวอยู่แล้ว (พจส. แทบไม่มีใครอยู่ใน `/users`) ส่วน
   * `priority` เป็นค่าที่ระบบเดาเอง ไม่ใช่ของที่ NCAC ส่งมา — คอลัมน์ที่คนเอาไป
   * กรองแล้วเข้าใจว่าเป็นข้อมูลจริงทั้งที่ระบบเดาให้ อันตรายกว่าไม่มีคอลัมน์นั้นเลย
   * · “เป้าหมาย SLA (วัน)” ยังอยู่ เพราะเป็นตัวอธิบายคอลัมน์ “เกิน SLA” ที่ติดกัน
   */
  {
    header: "อายุคำร้อง (วัน)",
    width: 14,
    center: true,
    numFmt: "0",
    value: (c) => caseAgeDays(c),
  },
  {
    header: "เป้าหมาย SLA (วัน)",
    width: 16,
    center: true,
    numFmt: "0",
    value: (c) => slaTarget(c.priority),
  },
  {
    header: "เกิน SLA",
    width: 10,
    center: true,
    value: (c) => (isSlaBreached(c) ? "ใช่" : "ไม่ใช่"),
  },
  { header: "ผู้อนุมัติระดับ 1", width: 20, value: (c) => reviewName(c, 1) },
  { header: "ผลอนุมัติระดับ 1", width: 14, center: true, value: (c) => reviewResult(c, 1) },
  {
    header: "วันที่อนุมัติระดับ 1",
    width: 17,
    numFmt: DATETIME_FMT,
    center: true,
    value: (c) => excelDate(reviewOf(c, 1)?.reviewedAt ?? null),
  },
  { header: "ผู้อนุมัติระดับ 2", width: 20, value: (c) => reviewName(c, 2) },
  { header: "ผลอนุมัติระดับ 2", width: 14, center: true, value: (c) => reviewResult(c, 2) },
  {
    header: "วันที่อนุมัติระดับ 2",
    width: 17,
    numFmt: DATETIME_FMT,
    center: true,
    value: (c) => excelDate(reviewOf(c, 2)?.reviewedAt ?? null),
  },
  { header: "ผู้ปิดคำร้อง", width: 20, value: (c) => c.closedBy ?? "" },
  {
    header: "วันที่ปิดคำร้อง",
    width: 17,
    numFmt: DATETIME_FMT,
    center: true,
    value: (c) => excelDate(c.closedAt),
  },
  {
    header: "ค่าเสียหาย (บาท)",
    width: 15,
    numFmt: "#,##0.00",
    value: (c) => c.damageCost,
  },
  {
    header: "จำนวนไฟล์แนบ",
    width: 13,
    center: true,
    numFmt: "0",
    value: (c) => c.attachments.length,
  },
  { header: "หัวข้อเรื่อง", width: 42, value: (c) => c.subject },
  { header: "รายละเอียดที่แจ้ง", width: 60, value: (c) => c.detail },
  { header: "สาเหตุหลัก", width: 34, value: (c) => c.rootCause ?? "" },
  {
    header: "รายละเอียดสาเหตุอื่น ๆ",
    width: 34,
    value: (c) => c.complaintDetails ?? "",
  },
  { header: "แนวทางแก้ไข", width: 46, value: (c) => c.solution ?? "" },
  { header: "ผลการดำเนินงาน", width: 46, value: (c) => c.result ?? "" },
  {
    header: "อัปเดตล่าสุด",
    width: 17,
    numFmt: DATETIME_FMT,
    center: true,
    value: (c) => excelDate(c.updatedAt),
  },
];

/** คอลัมน์ที่ต้องระบายสีตามค่า — นับจาก 1 ตามแบบของ ExcelJS */
const COL_STATUS = COLUMNS.findIndex((c) => c.header === "สถานะ") + 1;
const COL_SLA = COLUMNS.findIndex((c) => c.header === "เกิน SLA") + 1;

/** สีชิปสถานะชุดเดียวกับที่ใช้บนหน้าจอ (`statusMeta[].chip`) แปลงเป็น ARGB */
const STATUS_FILL: Record<string, { bg: string; ink: string }> = {
  เปิดคำร้อง: { bg: "FFE8EEFB", ink: "FF2F5AA8" },
  มอบผู้รับผิดชอบแล้ว: { bg: GREEN_SOFT, ink: GREEN },
  รออนุมัติ: { bg: "FFFDF3E3", ink: "FFA35A08" },
  รอปิดคำร้อง: { bg: GREEN, ink: WHITE },
  ปิดคำร้องแล้ว: { bg: "FFEEF1F0", ink: MUT },
};

/* ------------------------------------------------------------------ ชีตข้อมูล */

function buildCaseSheet(sheet: Worksheet, cases: HrCase[]) {
  sheet.columns = COLUMNS.map((c) => ({ width: c.width }));

  const header = sheet.addRow(COLUMNS.map((c) => c.header));
  header.height = 30;
  header.eachCell((cell) => {
    cell.fill = solid(GREEN);
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: WHITE } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: GREEN_DEEP } },
      left: { style: "thin", color: { argb: GREEN_DEEP } },
      bottom: { style: "medium", color: { argb: GREEN_DEEP } },
      right: { style: "thin", color: { argb: GREEN_DEEP } },
    };
  });

  for (const [i, hrCase] of cases.entries()) {
    const row = sheet.addRow(COLUMNS.map((c) => c.value(hrCase)));
    row.height = 19;
    const zebra = i % 2 === 1;

    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const column = COLUMNS[col - 1];
      cell.font = { name: FONT, size: 10, color: { argb: INK } };
      cell.alignment = {
        vertical: "middle",
        horizontal: column?.center ? "center" : "left",
      };
      cell.border = gridBorder;
      if (zebra) cell.fill = solid(GREEN_MIST);
      if (column?.numFmt) cell.numFmt = column.numFmt;
    });

    const status = sheet.getCell(row.number, COL_STATUS);
    const chip = STATUS_FILL[String(status.value ?? "")];
    if (chip) {
      status.fill = solid(chip.bg);
      status.font = { name: FONT, size: 10, bold: true, color: { argb: chip.ink } };
      status.alignment = { vertical: "middle", horizontal: "center" };
    }

    // เกิน SLA คือสิ่งเดียวในไฟล์ที่ “ต้องรีบ” — ให้มันเป็นสีเดียวที่ไม่ใช่เขียว
    if (isSlaBreached(hrCase)) {
      const sla = sheet.getCell(row.number, COL_SLA);
      sla.font = { name: FONT, size: 10, bold: true, color: { argb: SLA_INK } };
    }
  }

  /**
   * ตรึงหัวตาราง + คอลัมน์เลขติดตามไว้ — ไฟล์นี้กว้าง 33 คอลัมน์ ถ้าไม่ตรึง
   * พอเลื่อนไปดู “ผลการดำเนินงาน” จะไม่เหลืออะไรบอกว่ากำลังอ่านคำร้องใบไหนอยู่
   */
  sheet.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, cases.length + 1), column: COLUMNS.length },
  };
}

/* ------------------------------------------------------------------ ชีตสรุป */

/** คำอธิบายตัวกรองแบบอ่านออก — ไฟล์ต้องบอกได้เองว่ามันคือข้อมูลชุดไหน */
function filterSummary(f: CaseFilters): string {
  if (!hasFilters(f)) return "ทั้งคิว (ไม่ได้กรอง)";

  const parts: string[] = [];
  if (f.status !== "all") parts.push(`สถานะ: ${statusMeta[f.status].label}`);
  if (f.department !== "all") {
    parts.push(
      `หน่วยงาน: ${f.department === UNASSIGNED ? "ยังไม่มอบหมาย" : departmentLabel(f.department)}`,
    );
  }
  if (f.slaOnly) parts.push("เฉพาะที่เกิน SLA");
  if (f.query.trim()) parts.push(`คำค้น: “${f.query.trim()}”`);
  return parts.join(" · ");
}

interface SummaryMeta {
  filters: CaseFilters;
  /** ชื่อผู้กดส่งออก — มาจาก session ฝั่ง route ไม่ใช่ค่าที่หน้าจอส่งมา */
  exportedBy: string;
  exportedAt: Date;
  /** จำนวนคำร้องทั้งคิวก่อนกรอง — ให้เห็นว่าไฟล์นี้เป็นข้อมูลส่วนไหนของทั้งหมด */
  totalInQueue: number;
}

function sectionTitle(sheet: Worksheet, text: string) {
  const row = sheet.addRow([text]);
  row.height = 24;
  const cell = row.getCell(1);
  cell.font = { name: FONT, size: 11, bold: true, color: { argb: GREEN } };
  cell.alignment = { vertical: "middle" };
  return row;
}

function tableHead(sheet: Worksheet, headers: string[]) {
  const row = sheet.addRow(headers);
  row.height = 22;
  for (let i = 1; i <= headers.length; i += 1) {
    const cell = row.getCell(i);
    cell.fill = solid(GREEN);
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: WHITE } };
    cell.alignment = { vertical: "middle", horizontal: i === 1 ? "left" : "center" };
    cell.border = gridBorder;
  }
}

function tableRow(sheet: Worksheet, values: CellValue[], numFmts: string[] = []) {
  const row = sheet.addRow(values);
  row.height = 18;
  for (let i = 1; i <= values.length; i += 1) {
    const cell = row.getCell(i);
    cell.font = { name: FONT, size: 10, color: { argb: INK } };
    cell.alignment = { vertical: "middle", horizontal: i === 1 ? "left" : "center" };
    cell.border = gridBorder;
    if (numFmts[i - 1]) cell.numFmt = numFmts[i - 1];
  }
}

/**
 * ชีต “สรุป” — ตัวเลขชุดเดียวกับที่หน้ารายงานใช้ (`lib/case-report.ts`)
 * ไม่ได้นับใหม่เองที่นี่ กฎการนับจึงมีที่มาที่เดียว
 */
function buildSummarySheet(sheet: Worksheet, cases: HrCase[], meta: SummaryMeta) {
  sheet.columns = [
    { width: 30 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
  ];

  const title = sheet.addRow(["รายงานคำร้อง — HR Service"]);
  title.height = 32;
  const titleCell = title.getCell(1);
  titleCell.font = { name: FONT, size: 15, bold: true, color: { argb: GREEN } };
  titleCell.alignment = { vertical: "middle" };

  const facts: [string, CellValue, string?][] = [
    ["ออกรายงานเมื่อ", meta.exportedAt, DATETIME_FMT],
    ["ผู้ออกรายงาน", meta.exportedBy],
    ["เงื่อนไขที่กรอง", filterSummary(meta.filters)],
    ["จำนวนคำร้องในไฟล์", cases.length, "#,##0"],
    ["จำนวนคำร้องทั้งคิว", meta.totalInQueue, "#,##0"],
    ["เกิน SLA", cases.filter(isSlaBreached).length, "#,##0"],
  ];

  for (const [label, value, numFmt] of facts) {
    const row = sheet.addRow([label, value]);
    row.height = 18;
    const key = row.getCell(1);
    key.font = { name: FONT, size: 10, color: { argb: MUT } };
    key.alignment = { vertical: "middle" };
    const val = row.getCell(2);
    val.font = { name: FONT, size: 10, bold: true, color: { argb: INK } };
    val.alignment = { vertical: "middle", horizontal: "left" };
    if (numFmt) val.numFmt = numFmt;
  }

  const share = (n: number) => (cases.length ? n / cases.length : 0);

  sheet.addRow([]);
  sectionTitle(sheet, "แยกตามสถานะ");
  tableHead(sheet, ["สถานะ", "จำนวน", "สัดส่วน"]);
  for (const status of Object.keys(statusMeta) as (keyof typeof statusMeta)[]) {
    const n = cases.filter((c) => c.status === status).length;
    tableRow(sheet, [statusMeta[status].label, n, share(n)], ["", "#,##0", "0.0%"]);
  }

  sheet.addRow([]);
  sectionTitle(sheet, "แยกตามหน่วยงานผู้รับผิดชอบ");
  tableHead(sheet, ["หน่วยงาน", "จำนวน", "สัดส่วน", "ปิดเฉลี่ย (วัน)"]);
  for (const dept of departmentPerformance(cases)) {
    tableRow(
      sheet,
      [departmentLabel(dept.id), dept.cases, share(dept.cases), dept.avgDays],
      ["", "#,##0", "0.0%", "0.0"],
    );
  }
  const unassigned = cases.filter((c) => !c.departmentId).length;
  if (unassigned) {
    tableRow(
      sheet,
      ["ยังไม่มอบหมาย", unassigned, share(unassigned), null],
      ["", "#,##0", "0.0%", ""],
    );
  }

  sheet.addRow([]);
  sectionTitle(sheet, "แยกตามกลุ่มสาเหตุ");
  tableHead(sheet, ["กลุ่มสาเหตุ", "จำนวน", "สัดส่วน"]);
  for (const slice of reasonBreakdown(cases)) {
    tableRow(
      sheet,
      [reasonGroup(slice.code).label, slice.count, share(slice.count)],
      ["", "#,##0", "0.0%"],
    );
  }

  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

/* ------------------------------------------------------------------ ประกอบไฟล์ */

/** ชื่อไฟล์ `hr-cases-2026-08-13.xlsx` — วันที่ไทย เรียงในโฟลเดอร์ได้ตามลำดับ */
export function exportFileName(at: Date = new Date()): string {
  const d = new Date(at.getTime() + 7 * 60 * 60 * 1000);
  const stamp = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return `hr-cases-${stamp}.xlsx`;
}

export async function buildCaseWorkbook(
  cases: HrCase[],
  meta: SummaryMeta,
): Promise<ArrayBuffer> {
  const workbook = new Workbook();
  workbook.creator = "HR Service";
  workbook.created = meta.exportedAt;

  buildCaseSheet(
    workbook.addWorksheet("คำร้อง", {
      properties: { defaultRowHeight: 19 },
      pageSetup: { orientation: "landscape", fitToWidth: 1, fitToHeight: 0 },
    }),
    cases,
  );
  buildSummarySheet(workbook.addWorksheet("สรุป"), cases, meta);

  return workbook.xlsx.writeBuffer();
}
