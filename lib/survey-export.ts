import { Workbook, type Worksheet } from "exceljs";

import { describeSurveyFilters, type SurveyFilters } from "./survey-filter";
import { SURVEY_QUESTIONS, type SurveyForm, type SurveyResponse } from "./survey-forms";

/**
 * ไฟล์ Excel ของผลแบบสอบถาม — โครงและจานสีเดียวกับ `lib/record-case-export.ts`
 * (ปุ่ม “Excel” หน้าตาเดียวกันทั้งระบบ) แต่คนละโดเมนข้อมูลจึงแยกไฟล์
 *
 * สองชีตตามที่ตกลงไว้:
 *
 * | ชีต | ใช้ทำอะไร |
 * |---|---|
 * | `Raw data` | หนึ่งแถวต่อผู้ตอบหนึ่งคน — เอาไปทำ PivotTable เองต่อได้ทันที |
 * | `Pivot (สรุป)` | นับให้เสร็จแล้ว: ทุกคำถาม ตัวเลือกไหนกี่คน กี่ % พร้อมแถบเทียบสายตา |
 *
 * ชีตดิบ **กางข้อ 7 เป็น 5 คอลัมน์** (อันดับ 1–5) แทนที่จะยัดเป็นข้อความเดียว —
 * PivotTable นับ “ใครให้อะไรเป็นอันดับ 1” ไม่ได้ถ้าอยู่รวมกันในเซลล์เดียว
 * ส่วนข้อที่เลือกได้หลายข้อยังต้องรวมเป็นเซลล์เดียว (ตัดเป็นคอลัมน์ไม่ได้ เพราะ
 * ลำดับที่เลือกไม่มีความหมาย) — ให้ไปอ่านยอดรวมที่ชีตสรุปแทน
 */

/* ------------------------------------------------------------------ จานสี */

const GREEN = "FF0F766E";
const GREEN_DEEP = "FF0B5A54";
const GREEN_MIST = "FFF4F9F8";
const BAR = "FF7FC4BC";

const WHITE = "FFFFFFFF";
const INK = "FF15201D";
const MUT = "FF65756F";
const LINE = "FFD9E4E1";
const ALERT = "FFB3261E";
const ALERT_SOFT = "FFF6E5E4";
const OK_SOFT = "FFE6F1F0";

const FONT = "Tahoma";

const solid = (argb: string) =>
  ({ type: "pattern", pattern: "solid", fgColor: { argb } }) as const;

const hair = { style: "thin", color: { argb: LINE } } as const;
const gridBorder = { top: hair, left: hair, bottom: hair, right: hair } as const;

const DATETIME_FMT = "dd/mm/yyyy hh:mm";
const PCT_FMT = "0.0%";
const INT_FMT = "#,##0";

type CellValue = string | number | Date | null;

/** ISO ที่มีโซนถูกต้องอยู่แล้ว → `Date` ที่ฟิลด์ UTC ของมันคือเวลาไทย */
function excelDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* ------------------------------------------------------------------ ชีต Raw data */

interface RawColumn {
  header: string;
  width: number;
  value: (r: SurveyResponse, i: number) => CellValue;
  numFmt?: string;
  center?: boolean;
}

function rawColumns(): RawColumn[] {
  const columns: RawColumn[] = [
    { header: "ลำดับ", width: 7, center: true, numFmt: INT_FMT, value: (_r, i) => i + 1 },
    { header: "รหัส พจส.", width: 13, value: (r) => r.drivercode },
    { header: "ชื่อ-สกุล", width: 22, value: (r) => r.driverName },
    { header: "แพล้นท์", width: 14, value: (r) => r.plant },
    { header: "ลูกค้า", width: 30, value: (r) => r.customer },
    { header: "ทะเบียนรถ", width: 13, center: true, value: (r) => r.truckplate },
    {
      header: "มาร่วมงาน",
      width: 11,
      center: true,
      value: (r) => (r.attending === null ? "" : r.attending ? "มา" : "ไม่สะดวก"),
    },
    {
      header: "ตอบเมื่อ",
      width: 17,
      center: true,
      numFmt: DATETIME_FMT,
      value: (r) => excelDate(r.submittedAt),
    },
    {
      header: "ใช้เวลาตอบ (นาที)",
      width: 15,
      center: true,
      numFmt: "0.0",
      value: (r) => (r.durationSeconds == null ? null : r.durationSeconds / 60),
    },
  ];

  for (const q of SURVEY_QUESTIONS) {
    if (q.kind === "rank") {
      // กางเป็นคอลัมน์ละอันดับ — PivotTable ถึงจะนับ “อันดับ 1 คือใคร” ได้
      for (let n = 1; n <= 5; n += 1) {
        columns.push({
          header: `${q.no}. ${q.short} #${n}`,
          width: 26,
          value: (r) => (r.answers[q.id] ?? [])[n - 1] ?? "",
        });
      }
      continue;
    }

    columns.push({
      header: `${q.no}. ${q.short}`,
      width: q.kind === "text" ? 46 : q.kind === "multi" ? 40 : 26,
      value: (r) => (r.answers[q.id] ?? []).join(" · "),
    });
  }

  return columns;
}

function buildRawSheet(sheet: Worksheet, rows: SurveyResponse[]) {
  const columns = rawColumns();
  const colAttending = columns.findIndex((c) => c.header === "มาร่วมงาน") + 1;

  sheet.columns = columns.map((c) => ({ width: c.width }));

  const header = sheet.addRow(columns.map((c) => c.header));
  header.height = 32;
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

  for (const [i, r] of rows.entries()) {
    const row = sheet.addRow(columns.map((c) => c.value(r, i)));
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

    // ย้อมช่อง “มาร่วมงาน” ให้กวาดตาเจอคนที่ไม่มาได้ทันที
    const cell = sheet.getCell(row.number, colAttending);
    const attending = String(cell.value ?? "");
    if (attending) {
      const absent = attending === "ไม่สะดวก";
      cell.fill = solid(absent ? ALERT_SOFT : OK_SOFT);
      cell.font = {
        name: FONT,
        size: 10,
        bold: true,
        color: { argb: absent ? ALERT : GREEN },
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    }
  }

  // ตรึงหัวตาราง + 3 คอลัมน์แรก (ลำดับ/รหัส/ชื่อ) เลื่อนขวาแล้วยังรู้ว่าเป็นของใคร
  sheet.views = [{ state: "frozen", xSplit: 3, ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, rows.length + 1), column: columns.length },
  };
}

/* ------------------------------------------------------------------ ชีตสรุป */

export interface SurveyExportMeta {
  form: SurveyForm;
  filters: SurveyFilters;
  /** ชื่อผู้กดส่งออก — มาจาก session ฝั่ง route ไม่ใช่ค่าที่หน้าจอส่งมา */
  exportedBy: string;
  exportedAt: Date;
  /** จำนวนผู้ตอบทั้งหมดก่อนกรอง — ให้เห็นว่าไฟล์นี้เป็นข้อมูลส่วนไหน */
  totalResponses: number;
}

function sectionTitle(sheet: Worksheet, text: string, note?: string) {
  const row = sheet.addRow([text, note ?? ""]);
  row.height = 24;
  const cell = row.getCell(1);
  cell.font = { name: FONT, size: 11, bold: true, color: { argb: GREEN } };
  cell.alignment = { vertical: "middle" };
  const noteCell = row.getCell(2);
  noteCell.font = { name: FONT, size: 9, color: { argb: MUT } };
  noteCell.alignment = { vertical: "middle" };
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

/**
 * แถบเทียบสายตาในเซลล์ — วาดด้วยอักขระ `▇` ไม่ใช่ conditional formatting
 * เพราะ data bar ของ ExcelJS ยังไม่รองรับครบทุกตัวเลือก และไฟล์ที่ได้เปิดใน
 * โปรแกรมอื่น (Numbers / Google Sheets) แล้วแถบหายไปเฉย ๆ · อักขระอยู่รอดทุกที่
 */
function barText(ratio: number): string {
  const n = Math.round(Math.max(0, Math.min(1, ratio)) * 20);
  return "▇".repeat(n);
}

function tableRow(
  sheet: Worksheet,
  values: CellValue[],
  opts: { numFmts?: string[]; bold?: boolean; barColumn?: number } = {},
) {
  const row = sheet.addRow(values);
  row.height = 18;
  for (let i = 1; i <= values.length; i += 1) {
    const cell = row.getCell(i);
    const isBar = opts.barColumn === i;
    cell.font = {
      name: FONT,
      size: 10,
      bold: opts.bold ?? false,
      color: { argb: isBar ? BAR : INK },
    };
    cell.alignment = { vertical: "middle", horizontal: i === 1 || isBar ? "left" : "center" };
    cell.border = gridBorder;
    const fmt = opts.numFmts?.[i - 1];
    if (fmt) cell.numFmt = fmt;
  }
  return row;
}

/** นับคำตอบของคำถามหนึ่งข้อ เรียงมาก→น้อย · `base` = จำนวนคนที่ตอบข้อนั้น */
function tally(rows: SurveyResponse[], id: string) {
  const counts = new Map<string, number>();
  let base = 0;
  for (const r of rows) {
    const list = r.answers[id] ?? [];
    if (!list.length) continue;
    base += 1;
    for (const v of list) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const items = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "th"));
  return { items, base };
}

function buildSummarySheet(sheet: Worksheet, rows: SurveyResponse[], meta: SurveyExportMeta) {
  sheet.columns = [{ width: 46 }, { width: 12 }, { width: 12 }, { width: 24 }];

  const title = sheet.addRow([meta.form.title]);
  title.height = 34;
  const titleCell = title.getCell(1);
  titleCell.font = { name: FONT, size: 15, bold: true, color: { argb: GREEN } };
  titleCell.alignment = { vertical: "middle" };

  const attending = rows.filter((r) => r.attending === true).length;
  const absent = rows.filter((r) => r.attending === false).length;

  const facts: [string, CellValue, string?][] = [
    ["ออกรายงานเมื่อ", meta.exportedAt, DATETIME_FMT],
    ["ผู้ออกรายงาน", meta.exportedBy],
    ["เงื่อนไขที่กรอง", describeSurveyFilters(meta.filters)],
    ["จำนวนผู้ตอบในไฟล์นี้", rows.length, INT_FMT],
    ["จำนวนผู้ตอบทั้งหมด", meta.totalResponses, INT_FMT],
    ["ตั้งใจมาร่วมงาน", attending, INT_FMT],
    ["ไม่สะดวกมาร่วมงาน", absent, INT_FMT],
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

  /** ตารางย่อยหนึ่งชุด: ตัวเลือก | จำนวน | สัดส่วน | แถบ */
  const block = (
    heading: string,
    note: string,
    items: { label: string; count: number }[],
    base: number,
  ) => {
    sheet.addRow([]);
    sectionTitle(sheet, heading, note);
    tableHead(sheet, ["ตัวเลือก", "จำนวน (คน)", "สัดส่วน", ""]);

    if (!items.length) {
      tableRow(sheet, ["— ยังไม่มีใครตอบข้อนี้ —", null, null, ""]);
      return;
    }

    const top = items[0].count || 1;
    for (const item of items) {
      tableRow(
        sheet,
        [item.label, item.count, base ? item.count / base : 0, barText(item.count / top)],
        { numFmts: ["", INT_FMT, PCT_FMT, ""], barColumn: 4 },
      );
    }
    tableRow(sheet, ["รวมผู้ตอบข้อนี้", base, base ? 1 : 0, ""], {
      numFmts: ["", INT_FMT, PCT_FMT, ""],
      bold: true,
    });
  };

  /* ── ข้อมูลผู้ตอบ ── */
  const byPlant = new Map<string, number>();
  for (const r of rows) byPlant.set(r.plant || "ไม่ระบุ", (byPlant.get(r.plant || "ไม่ระบุ") ?? 0) + 1);
  block(
    "แยกตามแพล้นท์",
    "นับจากผู้ตอบในไฟล์นี้",
    [...byPlant.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    rows.length,
  );

  block(
    "การมาร่วมงาน",
    "ผลจากข้อ 3",
    [
      { label: "ตั้งใจมาร่วมงาน", count: attending },
      { label: "ไม่สะดวกมาร่วมงาน", count: absent },
    ].filter((i) => i.count > 0),
    rows.length,
  );

  /* ── ทุกคำถาม ── */
  for (const q of SURVEY_QUESTIONS) {
    if (q.kind === "text") continue; // ข้อความปลายเปิด นับไม่ได้ — อ่านที่ชีต Raw data

    if (q.kind === "rank") {
      const sum = new Map<string, number>();
      const firsts = new Map<string, number>();
      let base = 0;
      for (const r of rows) {
        const list = r.answers[q.id] ?? [];
        if (!list.length) continue;
        base += 1;
        list.forEach((label, i) => {
          sum.set(label, (sum.get(label) ?? 0) + i + 1);
          if (i === 0) firsts.set(label, (firsts.get(label) ?? 0) + 1);
        });
      }

      const items = [...sum.entries()]
        .map(([label, total]) => ({ label, avg: base ? total / base : 0, first: firsts.get(label) ?? 0 }))
        .sort((a, b) => a.avg - b.avg);

      sheet.addRow([]);
      sectionTitle(sheet, `ข้อ ${q.no} · ${q.short}`, "อันดับเฉลี่ย — ยิ่งน้อยยิ่งสำคัญ");
      tableHead(sheet, ["รายการ", "อันดับเฉลี่ย", "ให้ที่ 1 (คน)", ""]);
      const worst = Math.max(...items.map((i) => i.avg), 1);
      for (const item of items) {
        tableRow(
          sheet,
          [item.label, item.avg, item.first, barText((worst - item.avg + 0.25) / worst)],
          { numFmts: ["", "0.00", INT_FMT, ""], barColumn: 4 },
        );
      }
      tableRow(sheet, ["รวมผู้ตอบข้อนี้", base, null, ""], {
        numFmts: ["", INT_FMT, "", ""],
        bold: true,
      });
      continue;
    }

    const { items, base } = tally(rows, q.id);
    block(
      `ข้อ ${q.no} · ${q.short}`,
      q.kind === "multi" ? `${q.question} (เลือกได้หลายข้อ)` : q.question,
      items,
      base,
    );
  }

  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

/* ------------------------------------------------------------------ ประกอบไฟล์ */

/** ชื่อไฟล์ `hr-survey-newyear-2570-mixer-2026-08-28.xlsx` — เรียงในโฟลเดอร์ได้ตามลำดับ */
export function surveyExportFileName(surveyId: string, at: Date = new Date()): string {
  const d = new Date(at.getTime() + 7 * 60 * 60 * 1000);
  const stamp = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return `hr-survey-${surveyId}-${stamp}.xlsx`;
}

export async function buildSurveyWorkbook(
  rows: SurveyResponse[],
  meta: SurveyExportMeta,
): Promise<ArrayBuffer> {
  const workbook = new Workbook();
  workbook.creator = "HR Service";
  workbook.created = meta.exportedAt;

  buildRawSheet(
    workbook.addWorksheet("Raw data", {
      properties: { defaultRowHeight: 19 },
      pageSetup: { orientation: "landscape", fitToWidth: 1, fitToHeight: 0 },
    }),
    rows,
  );
  buildSummarySheet(workbook.addWorksheet("Pivot (สรุป)"), rows, meta);

  return workbook.xlsx.writeBuffer();
}
