import { Workbook, type DataValidation, type Worksheet } from "exceljs";

import {
  classify,
  DEFAULT_PAYEE_COLUMN,
  effectOf,
  KIND_LABEL,
  type MoneyEffect,
} from "./classify";
import { periodLabel, type PeriodRef } from "./period";
import { INTAKE_ITEMS, findItem, type IntakeItem } from "./registry";
import {
  DAY_CODES,
  hasDayGrid,
  REF_LISTS,
  templateOf,
  type TemplateSpec,
} from "./template-spec";

/**
 * แบบฟอร์มรับข้อมูลเงินเดือน — สร้างตอนกดดาวน์โหลด **ไม่เก็บไฟล์นิ่งไว้**
 *
 * เหตุผลที่สร้างสดทุกครั้งแทนที่จะวางไฟล์ไว้ใน `public/`: ทะเบียนรายการกับโครง
 * คอลัมน์อยู่ในโค้ด (`registry.ts` / `template-spec.ts`) ถ้าเก็บไฟล์นิ่งไว้ด้วย
 * วันที่มีคนแก้ทะเบียน ไฟล์ที่คนโหลดไปจะเป็นของเก่าโดยไม่มีใครรู้ — แบบนี้
 * **ฟอร์มตรงกับทะเบียนเสมอโดยไม่ต้องมีใครคอยซิงก์**
 *
 * โครงเดียวกันทุกฟอร์ม: หัวตารางแถว 1 · ข้อมูลเริ่มแถว 2 · ไม่มี merge ·
 * ไม่มีแถวเปล่า · ชื่อคอลัมน์หลักสะกดเหมือนกันหมด (ดูเหตุผลใน `template-spec.ts`)
 *
 * จานสีเดียวกับ `lib/survey-export.ts` เพื่อให้ไฟล์ที่ออกจากระบบนี้หน้าตาชุดเดียวกัน
 */

/* ------------------------------------------------------------------ จานสี */

const GREEN = "FF0F766E";
const GREEN_MIST = "FFF4F9F8";
const DRAFT = "FF7F6000";
const DRAFT_MIST = "FFFFF2CC";

/* สีหัวคอลัมน์ตามผลต่อสลิป — คนกรอกต้องเห็นตั้งแต่ตอนกรอกว่าช่องไหนคือเงินหัก
   เพราะไฟล์ 3 ตัวมีทั้งเพิ่มและหักในแถวเดียวกัน (#12 #19 #20) ถ้าหัวสีเดียวกันหมด
   คนกรอกจะใส่ค่าวินัยกับเบี้ยขยันสลับช่องกันได้โดยไม่มีอะไรเตือน */
const EFFECT_FILL: Record<MoneyEffect, string> = {
  เพิ่ม: "FF1B5E20",
  หัก: "FFB3261E",
  อ้างอิง: "FF4A6572",
  รอยืนยัน: "FF7F6000",
};
const EFFECT_LABEL: Record<MoneyEffect, string> = {
  เพิ่ม: "เงินเพิ่ม — ลงสลิปเป็นรายได้",
  หัก: "เงินหัก — ลงสลิปเป็นรายหัก",
  อ้างอิง: "อ้างอิง — ใช้ตรวจ ไม่ลงสลิป",
  รอยืนยัน: "รอยืนยัน — ยังไม่รู้ว่าเพิ่มหรือหัก ห้ามใช้จ่ายจริง",
};

const WHITE = "FFFFFFFF";
const INK = "FF15201D";
const MUT = "FF65756F";
const LINE = "FFD9E4E1";
const ALERT = "FFB3261E";

const FONT = "Tahoma";

const solid = (argb: string) =>
  ({ type: "pattern", pattern: "solid", fgColor: { argb } }) as const;

const hair = { style: "thin", color: { argb: LINE } } as const;
const box = { top: hair, left: hair, bottom: hair, right: hair } as const;

const REF_SHEET = "99_รหัสอ้างอิง";

/**
 * ตั้งกฎกรอกข้อมูลเป็น "ช่วง" แทนที่จะตั้งทีละเซลล์
 *
 * `worksheet.dataValidations.add()` มีอยู่จริงตอนรัน แต่ typings ของ exceljs 4.4
 * ยังไม่ประกาศไว้ (บรรทัดนั้นถูกคอมเมนต์ค้างใน `index.d.ts`) จึงต้องประกาศเอง
 *
 * ทางที่ typings รองรับคือ `cell.dataValidation` ทีละเซลล์ — ใช้ไม่ได้ที่นี่ เพราะ
 * ตารางลงเวลามี 31 คอลัมน์ × 2000 แถว = 62,000 เซลล์ ไฟล์จะบวมและสร้างช้า
 * โดยได้ผลเหมือนกันเป๊ะ
 */
interface RangeValidations {
  add(range: string, rule: DataValidation): void;
}

const validations = (sheet: Worksheet): RangeValidations =>
  (sheet as unknown as { dataValidations: RangeValidations }).dataValidations;

/* ------------------------------------------------------------- ชีตแต่ละชนิด */

/** ชื่อชีตของ Excel ห้ามยาวเกิน 31 ตัว และห้ามมี `: \ / ? * [ ]` */
function sheetName(item: IntakeItem): string {
  const clean = item.title.replace(/[:\\/?*[\]]/g, " ").trim();
  return `${item.id}_${clean}`.slice(0, 31);
}

function writeFormSheet(sheet: Worksheet, item: IntakeItem, spec: TemplateSpec) {
  sheet.addRow(spec.columns);

  const head = sheet.getRow(1);
  head.height = 34;
  head.eachCell((cell, index) => {
    const effect = effectOf(item.id, spec.columns[index - 1]);
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: WHITE } };
    /* ช่องเงินใช้สีตามทิศทาง ช่องอื่นใช้สีสถานะฟอร์ม (ยืนยัน/ร่าง) เหมือนเดิม */
    cell.fill = solid(
      effect ? EFFECT_FILL[effect] : spec.confirmed ? GREEN : DRAFT,
    );
    cell.border = box;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    if (effect) cell.note = EFFECT_LABEL[effect];
  });

  spec.columns.forEach((column, index) => {
    /* คอลัมน์วันที่ 1–31 แคบได้ เพราะใส่แค่รหัสตัวเดียว ส่วนคอลัมน์อื่นกว้างตามชื่อ
       — กว้างพอดีสำคัญกว่าสวย เพราะคนกรอกต้องอ่านหัวออกโดยไม่ต้องลากขยาย */
    const isDay = /^\d{1,2}$/.test(column);
    sheet.getColumn(index + 1).width = isDay
      ? 5
      : Math.min(Math.max(column.length + 4, 10), 32);
  });

  sheet.views = [{ state: "frozen", xSplit: Math.min(3, spec.columns.length), ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: spec.columns.length },
  };

  addValidations(sheet, spec);
}

/**
 * กฎกันกรอกผิดตั้งแต่ต้นทาง
 *
 * **ตั้งไว้ถึงแถว 2000** ทั้งที่ฟอร์มจริงมีหลักร้อยแถว เพราะกฎที่ตั้งสั้นกว่าข้อมูล
 * จะเงียบหายไปตรงแถวที่เกิน แล้วคนกรอกไม่มีทางรู้ว่าช่วงท้ายไม่ได้ถูกตรวจ
 */
function addValidations(sheet: Worksheet, spec: TemplateSpec) {
  const at = (header: string) => {
    const index = spec.columns.indexOf(header);
    return index < 0 ? null : sheet.getColumn(index + 1).letter;
  };

  const list = (header: string, range: string, title: string, message: string) => {
    const letter = at(header);
    if (!letter) return;
    validations(sheet).add(`${letter}2:${letter}2000`, {
      type: "list",
      allowBlank: true,
      formulae: [range],
      showErrorMessage: true,
      errorTitle: title,
      error: message,
    });
  };

  list(
    "ผู้ว่าจ้าง",
    `'${REF_SHEET}'!$A$2:$A$50`,
    "ชื่อผู้ว่าจ้างไม่ถูกต้อง",
    "เลือกจากรายการที่กำหนด — พิมพ์เองจะจับคู่กับทะเบียนไม่ได้",
  );
  list(
    "แพล้นท์",
    `'${REF_SHEET}'!$B$2:$B$200`,
    "ชื่อแพล้นท์ไม่ถูกต้อง",
    "เลือกจากรายการที่กำหนด — ชื่อแพล้นท์ที่สะกดต่างกันคือต้นเหตุที่จ่ายผิดบ่อยที่สุด",
  );
  list("ยี่ห้อ", `'${REF_SHEET}'!$C$2:$C$30`, "ยี่ห้อไม่ถูกต้อง", "เลือกจากรายการที่กำหนด");
  list("สถานะ", `'${REF_SHEET}'!$D$2:$D$10`, "สถานะไม่ถูกต้อง", "เลือกจากรายการที่กำหนด");

  const emp = at("รหัสพนักงาน");
  if (emp) {
    validations(sheet).add(`${emp}2:${emp}2000`, {
      type: "textLength",
      operator: "equal",
      allowBlank: true,
      formulae: [6],
      showErrorMessage: true,
      errorTitle: "รหัสพนักงานไม่ถูกต้อง",
      error: "รหัสพนักงานมี 6 หลัก เช่น 680522 — ระบบจับคู่คนด้วยรหัส ไม่ใช่ชื่อ",
    });
  }

  if (hasDayGrid(spec.columns)) {
    const from = at("1");
    const to = at("31");
    if (from && to) {
      validations(sheet).add(`${from}2:${to}2000`, {
        type: "list",
        allowBlank: true,
        formulae: [`'${REF_SHEET}'!$F$2:$F$40`],
        showErrorMessage: true,
        errorTitle: "รหัสวันทำงานไม่ถูกต้อง",
        error: `ใช้รหัสตามชีต ${REF_SHEET} คอลัมน์ "รหัสวันทำงาน"`,
      });
    }
  }
}

function writeReadMe(sheet: Worksheet, period: PeriodRef, items: IntakeItem[]) {
  const lines: [string, boolean][] = [
    [`แบบฟอร์มรับข้อมูลเงินเดือน — รอบ ${periodLabel(period)}`, true],
    ["", false],
    ["กติกา 6 ข้อ ที่ทำให้ระบบอ่านไฟล์นี้ได้", true],
    ["1. หัวตารางอยู่แถวที่ 1 เสมอ ข้อมูลเริ่มแถวที่ 2 — อย่าแทรกแถวว่างหรือหัวเรื่องไว้ข้างบน", false],
    ["2. ห้ามผสานเซลล์ (merge) ในตาราง — ถ้าต้องการหัวข้อย่อย ให้เพิ่มเป็นคอลัมน์แทน", false],
    ["3. ห้ามเปลี่ยนชื่อคอลัมน์ ห้ามสลับลำดับ ห้ามลบคอลัมน์ที่ไม่ใช้ — เว้นว่างไว้ได้", false],
    ["4. รหัสพนักงานต้องกรอกทุกแถว เพราะระบบจับคู่คนด้วยรหัส ไม่ใช่ชื่อ", false],
    ["5. ช่องจำนวนเงินกรอกเป็นตัวเลขล้วน ห้ามใส่ลูกน้ำ หน่วย หรือเครื่องหมายอื่น", false],
    ["6. กรอกชีต “ข้อมูลรอบ” ให้ครบก่อนส่งทุกครั้ง", false],
    ["", false],
    ["สิ่งที่เปลี่ยนจากฟอร์มเดิม", true],
    ["• เดิมหัวตารางอยู่คนละแถวในแต่ละไฟล์ (ตั้งแต่แถว 1 ถึงแถว 12) ตอนนี้อยู่แถว 1 เหมือนกันหมด", false],
    ["• เดิมมีเซลล์ผสาน 309 ช่วงใน 28 ชีต ตอนนี้ไม่มีเลย", false],
    ["• เดิม “รหัสพนักงาน” สะกด 10 แบบ (รหัส พจส. / รหัส จบส. / DRNO / Truck Driver ฯลฯ) ตอนนี้ใช้คำเดียว", false],
    ["• เดิมลากสูตรเปล่าถึงแถว 1000+ ใน 35 ชีต ทำให้ไฟล์โตเกินจำเป็น ตอนนี้ตัดออก", false],
    ["", false],
    ["ชีตที่หัวตารางเป็นสีเหลือง = ยังไม่ได้เห็นไฟล์ต้นฉบับ", true],
    ["ขอให้เจ้าของข้อมูลตรวจคอลัมน์แล้วยืนยันก่อนใช้จริง", false],
    ["", false],
    ["สีหัวคอลัมน์บอกว่าตัวเลขช่องนั้นไปไหน", true],
    [`• เขียวเข้ม  ${EFFECT_LABEL["เพิ่ม"]}`, false],
    [`• แดง  ${EFFECT_LABEL["หัก"]}`, false],
    [`• เทาน้ำเงิน  ${EFFECT_LABEL["อ้างอิง"]}`, false],
    [`• เหลืองเข้ม  ${EFFECT_LABEL["รอยืนยัน"]}`, false],
    ["ถ้ามีช่องรวม ระบบใช้ช่องรวม ช่องย่อยเป็นอ้างอิง — ถ้า Tiger Soft ต้องแยกรหัส แจ้ง HR C&B", false],
    ["", false],
    ["รายการในไฟล์นี้", true],
  ];

  for (const [text, bold] of lines) {
    const row = sheet.addRow([text]);
    row.getCell(1).font = {
      name: FONT,
      size: 10,
      bold,
      color: { argb: bold ? GREEN : INK },
    };
  }

  for (const item of items) {
    const spec = templateOf(item.id);
    const cls = classify(item.id);
    /* บอกตั้งแต่หน้าแรกว่าเงินเข้าใคร ถ้าไม่ใช่คนในช่องรหัสพนักงาน — 3 รายการ
       (ค่าครูฝึก ×2 · เพื่อนแนะนำเพื่อน) เงินเข้าอีกคนที่อยู่คนละช่อง */
    const payee =
      cls && cls.payeeColumn !== DEFAULT_PAYEE_COLUMN
        ? ` · เงินเข้าช่อง “${cls.payeeColumn}”`
        : "";
    const row = sheet.addRow([
      `${item.id}  ${item.title}  —  ${item.owner} · ส่งวันที่ ${item.dueDay} · ${
        item.category
      } · ${cls ? KIND_LABEL[cls.kind] : ""}${payee} · ${
        spec?.confirmed ? "ยืนยันแล้ว" : "ร่าง รอยืนยัน"
      }`,
    ]);
    row.getCell(1).font = {
      name: FONT,
      size: 10,
      color: { argb: spec?.confirmed ? MUT : DRAFT },
    };
  }

  sheet.getColumn(1).width = 112;
}

function writePeriodSheet(sheet: Worksheet, period: PeriodRef) {
  sheet.addRow(["หัวข้อ", "กรอกที่นี่", "ตัวอย่าง"]);
  const head = sheet.getRow(1);
  head.eachCell((cell) => {
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: WHITE } };
    cell.fill = solid(GREEN);
    cell.border = box;
  });

  const fields: [string, string][] = [
    ["งวดเงินเดือน", periodLabel(period)],
    ["รายการที่ส่ง (เลขชีต)", "เช่น 01"],
    ["ชื่อผู้ส่งข้อมูล", ""],
    ["ฝ่าย/แผนก", ""],
    ["อีเมลผู้ส่ง", ""],
    ["ชื่อผู้อนุมัติ", ""],
    ["วันที่ส่ง", ""],
    ["จำนวนแถวข้อมูลที่ส่ง", ""],
    ["เลขที่ มท./memo อ้างอิง (ถ้ามี)", ""],
    ["หมายเหตุ", ""],
  ];

  for (const [label, example] of fields) {
    const row = sheet.addRow([label, "", example]);
    row.getCell(1).font = { name: FONT, size: 10, bold: true, color: { argb: GREEN } };
    row.getCell(2).border = box;
    row.getCell(2).fill = solid(GREEN_MIST);
    row.getCell(3).font = { name: FONT, size: 9, color: { argb: MUT } };
  }

  sheet.getColumn(1).width = 34;
  sheet.getColumn(2).width = 30;
  sheet.getColumn(3).width = 24;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function writeRefSheet(sheet: Worksheet) {
  const headers = [
    "ผู้ว่าจ้าง",
    "แพล้นท์",
    "ยี่ห้อ",
    "สถานะ",
    "",
    "รหัสวันทำงาน",
    "ความหมาย",
  ];
  sheet.addRow(headers);
  sheet.getRow(1).eachCell((cell, index) => {
    if (index === 5) return;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: WHITE } };
    cell.fill = solid(GREEN);
    cell.border = box;
  });

  const columns: string[][] = [
    REF_LISTS.customer,
    REF_LISTS.plant,
    REF_LISTS.brand,
    REF_LISTS.status,
    [],
    DAY_CODES.map((entry) => entry.code),
    /* รหัสที่ยังไม่รู้ความหมายต้องเห็นชัดว่า "ยังไม่รู้" ไม่ใช่เว้นว่างเฉย ๆ
       ไม่งั้นคนอ่านจะนึกว่าตกหล่นแล้วเดาความหมายกันเอง */
    DAY_CODES.map((entry) => entry.meaning || "— รอฝ่ายจัดส่งยืนยัน"),
  ];

  columns.forEach((values, index) => {
    values.forEach((value, row) => {
      const cell = sheet.getCell(row + 2, index + 1);
      cell.value = value;
      cell.font = { name: FONT, size: 10, color: { argb: INK } };
    });
    sheet.getColumn(index + 1).width = index === 1 ? 24 : 18;
  });

  const note = sheet.getCell(1, 9);
  note.value = "หมายเหตุสำคัญ";
  note.font = { name: FONT, size: 10, bold: true, color: { argb: GREEN } };
  const warn = sheet.getCell(2, 9);
  warn.value =
    "รหัสวันทำงานชุดนี้ใช้กับตารางสถานะรายวันเท่านั้น · ระบบ Punch ของ TA100 ใช้รหัสคนละชุด (A = รถเสียระบบน้ำ) ห้ามปนกัน";
  warn.font = { name: FONT, size: 10, color: { argb: ALERT } };
  sheet.getColumn(9).width = 72;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

/* ------------------------------------------------------------------ ทางออก */

function build(items: IntakeItem[], period: PeriodRef): Promise<ArrayBuffer> {
  const book = new Workbook();
  book.creator = "HR Service";
  book.created = new Date();

  writeReadMe(book.addWorksheet("00_อ่านก่อน"), period, items);
  writePeriodSheet(book.addWorksheet("01_ข้อมูลรอบ"), period);

  for (const item of items) {
    const spec = templateOf(item.id);
    if (!spec) continue;
    const sheet = book.addWorksheet(sheetName(item), {
      properties: { tabColor: { argb: spec.confirmed ? GREEN : DRAFT_MIST } },
    });
    writeFormSheet(sheet, item, spec);
  }

  writeRefSheet(book.addWorksheet(REF_SHEET));

  return book.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

/** ฟอร์มของรายการเดียว — ไฟล์ที่ส่งให้เจ้าของข้อมูลคนหนึ่งกรอก */
export async function buildItemTemplate(
  itemId: string,
  period: PeriodRef,
): Promise<{ file: ArrayBuffer; name: string }> {
  const item = findItem(itemId);
  if (!item) throw new Error(`ไม่รู้จักรายการ "${itemId}" ในทะเบียนรับข้อมูล`);
  if (!templateOf(itemId)) throw new Error(`ยังไม่มีโครงคอลัมน์ของรายการ "${itemId}"`);

  return {
    file: await build([item], period),
    name: `${item.id}_${item.title}_${periodLabel(period)}.xlsx`.replace(/[/\\]/g, "-"),
  };
}

/** ทั้งชุด 30 รายการในไฟล์เดียว — ไว้ให้ HR เก็บเป็นต้นฉบับ */
export async function buildAllTemplates(
  period: PeriodRef,
): Promise<{ file: ArrayBuffer; name: string }> {
  return {
    file: await build(INTAKE_ITEMS, period),
    name: `แบบฟอร์มรับข้อมูลเงินเดือน_ทั้งชุด_${periodLabel(period)}.xlsx`,
  };
}
