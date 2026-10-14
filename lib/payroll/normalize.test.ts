import { test } from "node:test";
import assert from "node:assert/strict";
import { Workbook, type CellValue } from "exceljs";

import { profileWorkbook } from "@/lib/payroll/parse";
import {
  columnRole,
  sumByPayee,
  toFacts,
  toNumber,
  unitOf,
  validateNormalization,
} from "@/lib/payroll/normalize";
import { templateOf } from "@/lib/payroll/template-spec";

async function book(rows: CellValue[][]): Promise<ArrayBuffer> {
  const wb = new Workbook();
  const ws = wb.addWorksheet("ข้อมูล");
  for (const row of rows) ws.addRow(row);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

/** ไฟล์ตามสเปกของรายการนั้นเป๊ะ ๆ — คอลัมน์ไหนไม่ได้ส่งค่ามาปล่อยว่าง */
async function sheetFor(itemId: string, values: Record<string, CellValue>[]) {
  const columns = templateOf(itemId)!.columns;
  const data = await book([
    columns,
    ...values.map((row) => columns.map((c) => row[c] ?? "")),
  ]);
  return profileWorkbook(data, `${itemId}.xlsx`);
}

test("ทุกคอลัมน์ของทั้ง 25 ฟอร์มแปลงเป็นรูปมาตรฐานได้", () => {
  assert.deepEqual(validateNormalization(), []);
});

test("ชื่อคนที่เรียกต่างกันในแต่ละฟอร์ม ยุบเป็นชื่อมาตรฐานเดียว", () => {
  for (const [itemId, header] of [
    ["01", "ชื่อ-นามสกุล"],
    ["10", "ชื่อ พจส.ใหม่"],
    ["13", "ชื่อ พจส."],
    ["22", "ชื่อ"],
    ["23", "ชื่อผู้เข้าพัก"],
  ] as const) {
    const role = columnRole(itemId, header);
    assert.deepEqual(role, { role: "มิติ", key: "personName" }, `${itemId}/${header}`);
  }
});

test("หน่วยอ่านจากวงเล็บท้ายชื่อช่อง", () => {
  assert.equal(unitOf("Incentive(บาท)"), "บาท");
  assert.equal(unitOf("จำนวน OT (ชม.)"), "ชั่วโมง");
  assert.equal(unitOf("รวมวันทำงาน(วัน)"), "วัน");
  assert.equal(unitOf("รวม(คัน)"), "คัน");
  assert.equal(unitOf("จำนวนเงิน"), "บาท", "ช่องเงินที่ไม่ได้เขียนหน่วยไว้");
  assert.equal(unitOf("กลุ่ม TA"), "หน่วย");
});

test("ตัวเลขที่มีจุลภาคและวงเล็บติดลบ อ่านเป็นตัวเลขได้", () => {
  assert.equal(toNumber("1,250"), 1250);
  assert.equal(toNumber("(500)"), -500);
  assert.equal(toNumber(" 1 200.50 "), 1200.5);
  assert.equal(toNumber(""), null);
  assert.equal(toNumber("#N/A"), null);
});

test("ไฟล์ค่าล่วงเวลาแปลงเป็นแถวมาตรฐาน หนึ่งแถวต่อหนึ่งค่า", async () => {
  const parsed = await sheetFor("02", [
    {
      ลำดับ: 1,
      เบอร์รถ: "M-01",
      ทะเบียนรถ: "70-1234",
      รหัสพนักงาน: "670108",
      "ชื่อ-นามสกุล": "ณรงค์กรณ์ อัจฉริยญาติ",
      "จำนวน OT (ชม.)": 12,
      จำนวนเงิน: "1,500",
    },
  ]);

  const facts = toFacts({ itemId: "02", period: "2026-09", parsed });
  assert.equal(facts.length, 2, "OT หนึ่งแถว เงินหนึ่งแถว");

  const money = facts.find((f) => f.kind === "ค่าที่วัด" && f.unit === "บาท");
  assert.ok(money && money.kind === "ค่าที่วัด");
  assert.equal(money.value, 1500);
  assert.equal(money.effect, "เพิ่ม");
  assert.equal(money.personId, "670108");
  assert.equal(money.payeeId, "670108");
  assert.equal(money.owner, "จัดส่ง ลาดกระบัง");
  assert.equal(money.dims.plate, "70-1234");
  assert.equal(money.dims.personName, "ณรงค์กรณ์ อัจฉริยญาติ");
  assert.equal(money.sourceRow, 2, "ชี้กลับไปที่แถวจริงในไฟล์ได้");

  const hours = facts.find((f) => f.kind === "ค่าที่วัด" && f.unit === "ชั่วโมง");
  assert.ok(hours && hours.kind === "ค่าที่วัด");
  assert.equal(hours.effect, "อ้างอิง", "ชั่วโมง OT ไม่ลงสลิป");
});

test("ค่าครูฝึก เงินเข้ารหัสครูฝึก ไม่ใช่คนในแถว", async () => {
  const parsed = await sheetFor("10", [
    {
      รหัสพนักงาน: "670200",
      "ชื่อ พจส.ใหม่": "คนใหม่",
      รหัสครูฝึก: "660001",
      ชื่อครูฝึก: "ครูฝึก",
      จำนวนเงิน: 900,
    },
  ]);

  const facts = toFacts({ itemId: "10", period: "2026-09", parsed });
  const money = facts.find((f) => f.kind === "ค่าที่วัด");
  assert.ok(money);
  assert.equal(money.personId, "670200");
  assert.equal(money.payeeId, "660001", "เงินเข้าครูฝึก");
  assert.deepEqual(sumByPayee(facts), [{ payeeId: "660001", add: 900, cut: 0 }]);
});

test("ช่องรายวันกลายเป็นแถวละวัน และเก็บเป็นรหัส ไม่ใช่ตัวเลข", async () => {
  const parsed = await sheetFor("01", [
    { รหัสพนักงาน: "670108", "1": "ท", "2": "ล", "3": "", "ทำงานจริง(วัน)": 2 },
  ]);

  const facts = toFacts({ itemId: "01", period: "2026-09", parsed });
  const days = facts.filter((f) => f.kind === "รายวัน");
  assert.equal(days.length, 2, "ช่องว่างไม่กลายเป็นแถว");
  assert.deepEqual(
    days.map((d) => d.kind === "รายวัน" && [d.day, d.code]),
    [
      [1, "ท"],
      [2, "ล"],
    ],
  );
});

test("ยอดรวมต่อคนนับเฉพาะช่องที่ลงสลิป ไม่นับช่องอ้างอิง", async () => {
  const parsed = await sheetFor("19", [
    {
      รหัสพนักงาน: "670108",
      "เงินรางวัล(บาท)": 1000,
      "หักรถสกปรก(บาท)": 300,
    },
  ]);

  const facts = toFacts({ itemId: "19", period: "2026-09", parsed });
  assert.deepEqual(sumByPayee(facts), [{ payeeId: "670108", add: 1000, cut: 300 }]);
});

test("ไฟล์ของคนละฝ่ายต่อกันเป็นตารางเดียวได้", async () => {
  const ot = await sheetFor("02", [{ รหัสพนักงาน: "670108", จำนวนเงิน: 1500 }]);
  const fuel = await sheetFor("13", [{ รหัสพนักงาน: "670108", "ยอดหักเงิน(บาท)": 400 }]);

  const all = [
    ...toFacts({ itemId: "02", period: "2026-09", parsed: ot }),
    ...toFacts({ itemId: "13", period: "2026-09", parsed: fuel }),
  ];

  assert.deepEqual(sumByPayee(all), [{ payeeId: "670108", add: 1500, cut: 400 }]);
  assert.deepEqual([...new Set(all.map((f) => f.owner))], [
    "จัดส่ง ลาดกระบัง",
    "บัญชี ลาดกระบัง",
  ]);
});
