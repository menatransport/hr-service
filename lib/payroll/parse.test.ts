import { test } from "node:test";
import assert from "node:assert/strict";
import { Workbook, type CellValue } from "exceljs";

import { headerLetter, profileWorkbook } from "@/lib/payroll/parse";

/** สร้างไฟล์ .xlsx จริงในหน่วยความจำ — ไม่พึ่งไฟล์ตัวอย่างในเครื่องใคร */
async function book(
  sheets: { name: string; rows: CellValue[][] }[],
): Promise<ArrayBuffer> {
  const wb = new Workbook();
  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name);
    for (const row of sheet.rows) ws.addRow(row);
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

test("อ่านหัวคอลัมน์ ชนิดข้อมูล และจำนวนแถวได้จากไฟล์จริง", async () => {
  const data = await book([
    {
      name: "Mixer",
      rows: [
        ["รหัสพนักงาน", "ชื่อ-นามสกุล", "จำนวนเงิน"],
        ["123456", "ก ข", 1200],
        ["123457", "ค ง", 800],
      ],
    },
  ]);

  const { profile, rows } = await profileWorkbook(data, "ค่าเที่ยว.xlsx");

  assert.equal(profile.sheetName, "Mixer");
  assert.equal(profile.headerRow, 1);
  assert.equal(profile.totalRows, 2);
  assert.deepEqual(
    profile.columns.map((c) => c.header),
    ["รหัสพนักงาน", "ชื่อ-นามสกุล", "จำนวนเงิน"],
  );
  assert.equal(profile.columns[2].type, "number");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].A, "123456");
});

test("รหัสพนักงานที่เก็บเป็นตัวเลขต้องออกมาเป็น 123456 ไม่ใช่ 123456.0", async () => {
  const data = await book([
    { name: "s", rows: [["รหัสพนักงาน"], [123456], [123457]] },
  ]);
  const { rows } = await profileWorkbook(data, "a.xlsx");
  assert.deepEqual(rows.map((r) => r.A), ["123456", "123457"]);
});

test("ข้ามชีตว่างไปหาชีตแรกที่มีข้อมูลจริง และบอกจำนวนชีตทั้งไฟล์", async () => {
  const data = await book([
    { name: "ปก", rows: [] },
    { name: "ข้อมูล", rows: [["รหัสพนักงาน", "ยอดหัก"], ["1", 50]] },
    { name: "หมายเหตุ", rows: [["x"]] },
  ]);
  const { profile } = await profileWorkbook(data, "a.xlsx");
  assert.equal(profile.sheetName, "ข้อมูล");
  assert.equal(profile.sheetCount, 3);
});

test("หาหัวตารางที่ไม่ได้อยู่แถวแรกได้ — ไฟล์จริงมีหัวเรื่องคร่อมอยู่ข้างบน", async () => {
  const data = await book([
    {
      name: "s",
      rows: [
        ["สรุปค่าเที่ยว เดือน ก.ย. 69"],
        [],
        ["รหัสพนักงาน", "ชื่อ-นามสกุล", "จำนวนเงิน"],
        ["1", "ก ข", 10],
      ],
    },
  ]);
  const { profile } = await profileWorkbook(data, "a.xlsx");
  assert.equal(profile.headerRow, 3);
  assert.equal(profile.totalRows, 1);
});

test("เซลล์ที่มีแต่เว้นวรรคนับเป็นช่องว่าง ไม่ใช่ข้อความ", async () => {
  const data = await book([
    { name: "s", rows: [["รหัสพนักงาน"], ["1"], ["   "], ["3"]] },
  ]);
  const { profile } = await profileWorkbook(data, "a.xlsx");
  assert.equal(profile.columns[0].empty, 1);
  assert.equal(profile.columns[0].valid, 2);
});

test("ชนิดข้อมูลตัดสินจากเสียงข้างมาก แล้วตัวที่ผิดชนิดถูกชี้เป็นแถว", async () => {
  const data = await book([
    { name: "s", rows: [["จำนวนเงิน"], [100], [200], ["ไม่มี"], [300]] },
  ]);
  const { profile } = await profileWorkbook(data, "a.xlsx");
  const col = profile.columns[0];
  assert.equal(col.type, "number");
  assert.equal(col.mismatch, 1);
  assert.equal(col.badCells?.[0].row, "4");
  assert.equal(col.badCells?.[0].value, "ไม่มี");
});

test("คอลัมน์ที่ไม่มีหัว ได้สถานะ skip ไม่ใช่ error", async () => {
  const data = await book([
    { name: "s", rows: [["รหัสพนักงาน", ""], ["1", "x"]] },
  ]);
  const { profile } = await profileWorkbook(data, "a.xlsx");
  assert.equal(profile.columns[1].state, "skip");
});

test("หาตัวอักษรคอลัมน์จากชื่อหัวได้ แม้หัวมีช่องว่างเกิน", async () => {
  const data = await book([
    { name: "s", rows: [["รหัสพนักงาน", " จำนวน เงิน "], ["1", 5]] },
  ]);
  const { profile } = await profileWorkbook(data, "a.xlsx");
  assert.equal(headerLetter(profile, "จำนวนเงิน"), "B");
  assert.equal(headerLetter(profile, "ไม่มีคอลัมน์นี้"), undefined);
});

test("ไฟล์ที่ไม่ใช่ .xlsx จริงต้องได้ข้อความที่อ่านรู้เรื่อง", async () => {
  const notXlsx = new TextEncoder().encode("นี่คือ csv,จริง ๆ").buffer;
  await assert.rejects(
    () => profileWorkbook(notXlsx, "a.xlsx"),
    /อ่านไฟล์ไม่ได้/,
  );
});

test("เลขแถวของเซลล์ผิดต้องตรงกับแถวใน Excel แม้มีแถวว่างคั่นอยู่ข้างบน", async () => {
  const data = await book([
    {
      name: "s",
      rows: [["จำนวนเงิน"], [100], [], [200], [], ["ไม่มี"], [300]],
    },
  ]);
  const { profile } = await profileWorkbook(data, "a.xlsx");
  assert.equal(profile.columns[0].badCells?.[0].row, "6");
});

test("เซลล์สูตรที่ได้ผลเป็นตัวเลขนับเป็นตัวเลข ไม่ใช่ข้อความ", async () => {
  const data = await book([
    {
      name: "s",
      rows: [
        ["จำนวนเงิน", "x"],
        [{ formula: "A1+1", result: 100 }, "a"],
        [{ formula: "A1+1", result: 200 }, "b"],
      ],
    },
  ]);
  const { profile, rows } = await profileWorkbook(data, "a.xlsx");
  assert.equal(profile.columns[0].type, "number");
  assert.equal(profile.columns[0].mismatch, 0);
  assert.equal(rows[0].A, "100");
});

test("เซลล์ที่เป็นค่าผิดพลาดจากสูตร (#N/A) ไม่ใช่ช่องว่าง แต่เป็นค่าผิดชนิด", async () => {
  const data = await book([
    {
      name: "s",
      rows: [
        ["จำนวนเงิน"],
        [100],
        [{ error: "#N/A" }],
        [300],
      ],
    },
  ]);
  const { profile } = await profileWorkbook(data, "a.xlsx");
  const col = profile.columns[0];
  assert.equal(col.empty, 0);
  assert.equal(col.mismatch, 1);
  assert.equal(col.state, "error");
  assert.equal(col.badCells?.[0].value, "#N/A");
});
