import { Workbook, type Worksheet } from "exceljs";

import { departmentLabel } from "./case-flow";
import { hasRecordFilters, type RecordCaseFilters } from "./record-case-filter";
import {
  RECORD_STATUSES,
  recordCategoryLabel,
  recordStatusMeta,
  warningLabel,
  type RecordCase,
  type RecordCategory,
} from "./record-case-flow";

/**
 * ไฟล์ Excel ของบันทึกเคสส่วนกลาง — คู่ขนานกับ `lib/case-export.ts` ของฝั่งคำร้อง พจส.
 * (ปุ่ม “Excel” หน้าตาเดียวกัน) แต่แยกไฟล์กันเพราะคนละโดเมนข้อมูล (Mongo ไม่ใช่ NCAC)
 * และคอลัมน์ไม่เหมือนกันเลย
 *
 * **ห้ามใช้ `toBangkokDate()` ของ `lib/case-export.ts` กับไทม์สแตมป์ของบันทึกเคส** —
 * ตัวนั้นชดเชยเวลาดิบของ NCAC ที่ไม่มีโซนต่อท้าย (+14 ชม.) ส่วน `createdAt`/`updatedAt`
 * ของบันทึกเคสเป็น ISO ที่มีโซนถูกต้องอยู่แล้ว (`new Date().toISOString()`) และ
 * `occurredOn` ต่อ `+07:00` เองตอนแปลง (เหมือน `formatOccurredOn()`) จึงบวกแค่ +7 ชม.
 * เหมือน `todayInBangkok()` ใน `record-case-flow.ts` — `excelDate()` ท้ายไฟล์นี้ทำแบบนั้น
 */

/* ------------------------------------------------------------------ จานสี */

const GREEN = "FF0F766E";
const GREEN_DEEP = "FF0B5A54";
const GREEN_SOFT = "FFE6F1F0";
const GREEN_MIST = "FFF4F9F8";

const WHITE = "FFFFFFFF";
const INK = "FF15201D";
const MUT = "FF65756F";
const LINE = "FFD9E4E1";

const FONT = "Tahoma";

const solid = (argb: string) =>
  ({ type: "pattern", pattern: "solid", fgColor: { argb } }) as const;

const hair = { style: "thin", color: { argb: LINE } } as const;
const gridBorder = { top: hair, left: hair, bottom: hair, right: hair } as const;

/* ------------------------------------------------------------------ วันที่ */

/** ISO ที่มีโซนถูกต้องอยู่แล้ว → `Date` ที่ฟิลด์ UTC ของมันคือเวลาไทย (ดูเหตุผลด้านบน) */
function excelDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `occurredOn` เป็น `YYYY-MM-DD` ล้วน — ต่อเวลา +07:00 เองก่อนแปลง เหมือน `formatOccurredOn()` */
function excelOccurredOn(date: string): Date | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? excelDate(`${date}T00:00:00+07:00`) : null;
}

const DATE_FMT = "dd/mm/yyyy";
const DATETIME_FMT = "dd/mm/yyyy hh:mm";

/* ------------------------------------------------------------------ คอลัมน์ */

type CellValue = string | number | Date | null;

interface Column {
  header: string;
  width: number;
  value: (r: RecordCase) => CellValue;
  numFmt?: string;
  center?: boolean;
}

/**
 * ลำดับคอลัมน์: ระบุตัวเคส → ประเภท/ฝ่าย/วันที่ → หัวเรื่องและรายละเอียด →
 * ข้อมูลประกอบ (ผู้เกี่ยวข้อง/โทษทางวินัย/หมายเหตุ) → ผู้บันทึก → ตัวเลข → เวลา
 * เหตุผลเดียวกับ `case-export.ts` — เนื้อความยาวไม่แทรกกลางคอลัมน์ที่ใช้กรอง
 */
function columnsOf(categories: RecordCategory[]): Column[] {
  return [
    { header: "เลขที่เคส", width: 16, value: (r) => r.code },
    { header: "สถานะ", width: 16, center: true, value: (r) => recordStatusMeta[r.status].label },
    { header: "ประเภทเคส", width: 24, value: (r) => recordCategoryLabel(categories, r.category) },
    { header: "ฝ่ายที่เกี่ยวข้อง", width: 20, value: (r) => departmentLabel(r.departmentId) },
    {
      header: "วันที่ของเคส",
      width: 13,
      numFmt: DATE_FMT,
      center: true,
      value: (r) => excelOccurredOn(r.occurredOn),
    },
    { header: "หัวเรื่อง", width: 34, value: (r) => r.title },
    { header: "รายละเอียด", width: 50, value: (r) => r.detail },
    { header: "ผู้เกี่ยวข้อง", width: 28, value: (r) => r.involved.join(" · ") },
    {
      header: "หนังสือเตือน / โทษทางวินัย",
      width: 30,
      value: (r) => r.warnings.map(warningLabel).join(" · "),
    },
    { header: "หมายเหตุ", width: 34, value: (r) => r.remark },
    { header: "ผู้บันทึก", width: 18, value: (r) => r.recorder.name },
    { header: "ฝ่ายผู้บันทึก", width: 18, value: (r) => r.recorder.department },
    {
      header: "จำนวนไฟล์แนบ",
      width: 13,
      center: true,
      numFmt: "0",
      value: (r) => r.attachments.length,
    },
    {
      header: "บันทึกเมื่อ",
      width: 17,
      numFmt: DATETIME_FMT,
      center: true,
      value: (r) => excelDate(r.createdAt),
    },
    {
      header: "อัปเดตล่าสุด",
      width: 17,
      numFmt: DATETIME_FMT,
      center: true,
      value: (r) => excelDate(r.updatedAt),
    },
  ];
}

/** สีชิปสถานะชุดเดียวกับ `recordStatusMeta[].chip` บนหน้าจอ แปลงเป็น ARGB (ธีมสว่าง) */
const STATUS_FILL: Record<string, { bg: string; ink: string }> = {
  รอดำเนินการ: { bg: "FFFDF3E3", ink: "FFA35A08" },
  เสร็จสิ้น: { bg: "FFEEF1F0", ink: "FF65756F" },
  ยกเลิก: { bg: "FFF6E5E4", ink: "FFB3261E" },
};

/* ------------------------------------------------------------------ ชีตข้อมูล */

function buildRecordSheet(sheet: Worksheet, records: RecordCase[], categories: RecordCategory[]) {
  const columns = columnsOf(categories);
  const colStatus = columns.findIndex((c) => c.header === "สถานะ") + 1;

  sheet.columns = columns.map((c) => ({ width: c.width }));

  const header = sheet.addRow(columns.map((c) => c.header));
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

  for (const [i, r] of records.entries()) {
    const row = sheet.addRow(columns.map((c) => c.value(r)));
    row.height = 19;
    const zebra = i % 2 === 1;

    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const column = columns[col - 1];
      cell.font = { name: FONT, size: 10, color: { argb: INK } };
      cell.alignment = {
        vertical: "middle",
        horizontal: column?.center ? "center" : "left",
        wrapText: false,
      };
      cell.border = gridBorder;
      if (zebra) cell.fill = solid(GREEN_MIST);
      if (column?.numFmt) cell.numFmt = column.numFmt;
    });

    const status = sheet.getCell(row.number, colStatus);
    const chip = STATUS_FILL[String(status.value ?? "")];
    if (chip) {
      status.fill = solid(chip.bg);
      status.font = { name: FONT, size: 10, bold: true, color: { argb: chip.ink } };
      status.alignment = { vertical: "middle", horizontal: "center" };
    }
  }

  sheet.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, records.length + 1), column: columns.length },
  };
}

/* ------------------------------------------------------------------ ชีตสรุป */

function filterSummary(f: RecordCaseFilters, categories: RecordCategory[]): string {
  if (!hasRecordFilters(f)) return "ทั้งคิว (ไม่ได้กรอง)";

  const parts: string[] = [];
  if (f.status !== "all") parts.push(`สถานะ: ${recordStatusMeta[f.status].label}`);
  if (f.department !== "all") parts.push(`ฝ่าย: ${departmentLabel(f.department)}`);
  if (f.category !== "all") parts.push(`ประเภท: ${recordCategoryLabel(categories, f.category)}`);
  if (f.query.trim()) parts.push(`คำค้น: “${f.query.trim()}”`);
  return parts.join(" · ");
}

interface SummaryMeta {
  filters: RecordCaseFilters;
  categories: RecordCategory[];
  /** ชื่อผู้กดส่งออก — มาจาก session ฝั่ง route ไม่ใช่ค่าที่หน้าจอส่งมา */
  exportedBy: string;
  exportedAt: Date;
  /** จำนวนเคสทั้งคิวก่อนกรอง — ให้เห็นว่าไฟล์นี้เป็นข้อมูลส่วนไหนของทั้งหมด */
  totalInQueue: number;
}

function sectionTitle(sheet: Worksheet, text: string) {
  const row = sheet.addRow([text]);
  row.height = 24;
  const cell = row.getCell(1);
  cell.font = { name: FONT, size: 11, bold: true, color: { argb: GREEN } };
  cell.alignment = { vertical: "middle" };
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

/** ชีต “สรุป” — นับจากชุดแถวที่ส่งออกจริง ไม่มีตัวเลข SLA/สาเหตุแบบฝั่งคำร้อง เพราะไม่มีในโดเมนนี้ */
function buildSummarySheet(sheet: Worksheet, records: RecordCase[], meta: SummaryMeta) {
  sheet.columns = [{ width: 30 }, { width: 14 }, { width: 14 }];

  const title = sheet.addRow(["รายงานบันทึกเคส — HR Service"]);
  title.height = 32;
  const titleCell = title.getCell(1);
  titleCell.font = { name: FONT, size: 15, bold: true, color: { argb: GREEN } };
  titleCell.alignment = { vertical: "middle" };

  const facts: [string, CellValue, string?][] = [
    ["ออกรายงานเมื่อ", meta.exportedAt, DATETIME_FMT],
    ["ผู้ออกรายงาน", meta.exportedBy],
    ["เงื่อนไขที่กรอง", filterSummary(meta.filters, meta.categories)],
    ["จำนวนเคสในไฟล์", records.length, "#,##0"],
    ["จำนวนเคสทั้งคิว", meta.totalInQueue, "#,##0"],
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

  const share = (n: number) => (records.length ? n / records.length : 0);

  sheet.addRow([]);
  sectionTitle(sheet, "แยกตามสถานะ");
  tableHead(sheet, ["สถานะ", "จำนวน", "สัดส่วน"]);
  for (const status of RECORD_STATUSES) {
    const n = records.filter((r) => r.status === status).length;
    tableRow(sheet, [recordStatusMeta[status].label, n, share(n)], ["", "#,##0", "0.0%"]);
  }

  sheet.addRow([]);
  sectionTitle(sheet, "แยกตามฝ่ายที่เกี่ยวข้อง");
  tableHead(sheet, ["ฝ่าย", "จำนวน", "สัดส่วน"]);
  const byDept = new Map<string, number>();
  for (const r of records) byDept.set(r.departmentId, (byDept.get(r.departmentId) ?? 0) + 1);
  for (const [deptId, n] of [...byDept.entries()].sort((a, b) => b[1] - a[1])) {
    tableRow(sheet, [departmentLabel(deptId), n, share(n)], ["", "#,##0", "0.0%"]);
  }

  sheet.addRow([]);
  sectionTitle(sheet, "แยกตามประเภทเคส");
  tableHead(sheet, ["ประเภท", "จำนวน", "สัดส่วน"]);
  const byCategory = new Map<string, number>();
  for (const r of records)
    byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + 1);
  for (const [categoryId, n] of [...byCategory.entries()].sort((a, b) => b[1] - a[1])) {
    tableRow(
      sheet,
      [recordCategoryLabel(meta.categories, categoryId), n, share(n)],
      ["", "#,##0", "0.0%"],
    );
  }

  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

/* ------------------------------------------------------------------ ประกอบไฟล์ */

/** ชื่อไฟล์ `hr-record-cases-2026-08-25.xlsx` — วันที่ไทย เรียงในโฟลเดอร์ได้ตามลำดับ */
export function recordExportFileName(at: Date = new Date()): string {
  const d = new Date(at.getTime() + 7 * 60 * 60 * 1000);
  const stamp = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return `hr-record-cases-${stamp}.xlsx`;
}

export async function buildRecordCaseWorkbook(
  records: RecordCase[],
  meta: SummaryMeta,
): Promise<ArrayBuffer> {
  const workbook = new Workbook();
  workbook.creator = "HR Service";
  workbook.created = meta.exportedAt;

  buildRecordSheet(
    workbook.addWorksheet("บันทึกเคส", {
      properties: { defaultRowHeight: 19 },
      pageSetup: { orientation: "landscape", fitToWidth: 1, fitToHeight: 0 },
    }),
    records,
    meta.categories,
  );
  buildSummarySheet(workbook.addWorksheet("สรุป"), records, meta);

  return workbook.xlsx.writeBuffer();
}
