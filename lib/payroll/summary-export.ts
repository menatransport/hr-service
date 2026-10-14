import { Workbook, type Worksheet } from "exceljs";

import { STAGE_LABEL, type IntakeRecord } from "./intake-status";
import { periodLabel } from "./period";
import { isUnreadable, NO_REASON_TEXT, readinessLine, SCOPED_NOTE, type PeriodSummary } from "./summary";

/**
 * Excel สรุปรอบ — **สรุปให้คนอ่าน ไม่ใช่ไฟล์นำเข้า Tiger Soft**
 *
 * ไฟล์นำเข้าของจริงยังไม่มีสเปก (รอ HR ค่าจ้างและสวัสดิการ) ไฟล์นี้จึงเขียนกำกับไว้ที่หัว
 * ทั้งสองชีต ไม่งั้นเดือนหน้าจะมีคนเอาไปอัปขึ้น Tiger Soft · ต่างจากแบบฟอร์มใน
 * `template-export.ts` ตรงที่หัวตารางอยู่แถว 5 (ใต้บรรทัดกำกับ) เพราะไฟล์นี้ไม่มีใคร
 * กรอกต่อและไม่มีใครอ่านด้วยโปรแกรม
 *
 * จานสีชุดเดียวกับ `template-export.ts`
 */

const GREEN = "FF0F766E";
const WHITE = "FFFFFFFF";
const INK = "FF15201D";
const LINE = "FFD9E4E1";
const ALERT = "FFB3261E";
const FONT = "Tahoma";
const HEAD_ROW = 5;

const NOT_IMPORT_NOTE =
  "ไฟล์นี้ไม่ใช่ไฟล์นำเข้า Tiger Soft — เป็นสรุปสถานะการรับข้อมูลไว้ดูและส่งต่อเท่านั้น อย่านำไปอัปโหลดเข้าระบบเงินเดือน";

const hair = { style: "thin", color: { argb: LINE } } as const;
const box = { top: hair, left: hair, bottom: hair, right: hair } as const;

const when = (iso?: string): string => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
};

function writeHead(sheet: Worksheet, title: string, summary: PeriodSummary) {
  const t = sheet.getCell(1, 1);
  t.value = `${title} — รอบ ${periodLabel(summary.period)}`;
  t.font = { name: FONT, size: 14, bold: true, color: { argb: INK } };

  const note = sheet.getCell(2, 1);
  note.value = NOT_IMPORT_NOTE;
  note.font = { name: FONT, size: 10, bold: true, color: { argb: ALERT } };

  const state = sheet.getCell(3, 1);
  state.value = `สถานะรอบ: ${readinessLine(summary)}`;
  state.font = {
    name: FONT,
    size: 10,
    color: { argb: summary.ready ? GREEN : ALERT },
  };

  if (summary.scoped) {
    const scope = sheet.getCell(4, 1);
    scope.value = SCOPED_NOTE;
    scope.font = { name: FONT, size: 10, bold: true, color: { argb: ALERT } };
  }
}

function writeTable(sheet: Worksheet, headers: string[], widths: number[]) {
  const head = sheet.getRow(HEAD_ROW);
  headers.forEach((text, i) => {
    const cell = head.getCell(i + 1);
    cell.value = text;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
    cell.border = box;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  head.height = 30;
  widths.forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  sheet.views = [{ state: "frozen", ySplit: HEAD_ROW }];
}

function addBodyRow(sheet: Worksheet, values: (string | number)[], alert = false) {
  const row = sheet.addRow(values);
  row.eachCell((cell) => {
    cell.font = { name: FONT, size: 10, color: { argb: alert ? ALERT : INK } };
    cell.border = box;
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  return row;
}

function writeOwners(sheet: Worksheet, summary: PeriodSummary) {
  writeHead(sheet, "สรุปรายฝ่าย", summary);
  writeTable(
    sheet,
    [
      "ฝ่าย",
      "ทั้งหมด",
      "ผ่าน",
      "รอตรวจ",
      "ตีกลับ",
      "รอส่ง",
      "ช้าสุด (วัน)",
      "ไฟล์อ่านไม่ได้",
      "ผ่านโดยข้ามด่าน",
    ],
    [24, 10, 10, 10, 10, 10, 14, 16, 18],
  );
  sheet.autoFilter = {
    from: { row: HEAD_ROW, column: 1 },
    to: { row: HEAD_ROW, column: 9 },
  };

  for (const { owner, tally, unreadable, overridden } of summary.owners) {
    const row = addBodyRow(sheet, [
      owner,
      tally.total,
      tally.passed,
      tally.submitted,
      tally.returned,
      tally.waiting,
      tally.worstLate,
      unreadable,
      overridden,
    ]);
    for (let c = 2; c <= 9; c++) row.getCell(c).alignment = { horizontal: "center" };
    if (tally.worstLate > 0) row.getCell(7).font = { name: FONT, size: 10, bold: true, color: { argb: ALERT } };
    if (unreadable > 0) row.getCell(8).font = { name: FONT, size: 10, bold: true, color: { argb: ALERT } };
  }
}

function writeItems(
  sheet: Worksheet,
  summary: PeriodSummary,
  records: Map<string, IntakeRecord>,
) {
  writeHead(sheet, "รายรายการ", summary);
  writeTable(
    sheet,
    [
      "เลขรายการ",
      "ชื่อรายการ",
      "ฝ่าย",
      "สถานะ",
      "ชื่อไฟล์",
      "ใครส่ง",
      "ส่งเมื่อ",
      "ใครผ่าน",
      "ผ่านเมื่อ",
      "ข้อผิดพลาดที่ค้าง",
      "เหตุผลที่ข้ามด่าน",
    ],
    [11, 44, 20, 16, 30, 18, 18, 18, 18, 18, 40],
  );
  sheet.autoFilter = {
    from: { row: HEAD_ROW, column: 1 },
    to: { row: HEAD_ROW, column: 11 },
  };

  for (const { item } of summary.rows) {
    const record = records.get(item.id);
    /* ไม่มีแถวในคอลเลกชัน = ยังไม่เคยส่ง */
    const stage = record?.stage ?? "waiting";
    const unreadable = !!record && stage !== "passed" && isUnreadable(record);

    /* ไฟล์อ่านไม่ออกเขียนเป็นคำ ไม่ใช่เลข 1 — เลข 1 ตัวนั้นเป็นตัวหมายสมมติของระบบ
       ไม่ใช่ข้อผิดพลาดที่ใครไปแก้ในไฟล์ได้ */
    const pending: string | number = unreadable
      ? "อ่านไฟล์ไม่ได้"
      : record?.errors === undefined
        ? ""
        : record.errors;

    const row = addBodyRow(
      sheet,
      [
        item.id,
        item.title,
        item.owner,
        unreadable ? "อัปโหลดแล้ว (อ่านไฟล์ไม่ได้)" : STAGE_LABEL[stage],
        record?.fileName ?? "",
        record?.receivedBy ?? "",
        when(record?.receivedAt),
        record?.passedBy ?? "",
        when(record?.passedAt),
        pending,
        record?.overrideReason ??
          (stage === "passed" && (record?.errors ?? 0) > 0 ? NO_REASON_TEXT : ""),
      ],
      stage !== "passed",
    );
    row.getCell(10).alignment = { horizontal: "center", vertical: "middle" };
  }
}

/** ชื่อชีตตามที่ระบุ — สร้างสดทุกครั้ง ไม่เก็บไฟล์นิ่ง (เหตุผลเดียวกับ `template-export.ts`) */
export async function buildPeriodSummary(
  summary: PeriodSummary,
  records: Map<string, IntakeRecord>,
): Promise<{ file: ArrayBuffer; name: string }> {
  const book = new Workbook();
  book.creator = "HR Service";
  book.created = new Date();

  writeOwners(book.addWorksheet("สรุปรายฝ่าย"), summary);
  writeItems(book.addWorksheet("รายรายการ"), summary, records);

  return {
    file: (await book.xlsx.writeBuffer()) as ArrayBuffer,
    name: `สรุปรับข้อมูลเงินเดือน_${periodLabel(summary.period)}.xlsx`,
  };
}
