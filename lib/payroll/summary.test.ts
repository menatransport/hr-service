import { test } from "node:test";
import assert from "node:assert/strict";
import { Workbook } from "exceljs";

import { emptyRecord, type IntakeRecord } from "@/lib/payroll/intake-status";
import { INTAKE_ITEMS } from "@/lib/payroll/registry";
import { buildPeriodSummary } from "@/lib/payroll/summary-export";
import { isUnreadable, readinessLine, SCOPED_NOTE, summarizePeriod } from "@/lib/payroll/summary";

const period = { year: 2569, month: 8 };
const now = new Date(2026, 8, 30);

const allPassed = (): Map<string, IntakeRecord> =>
  new Map(
    INTAKE_ITEMS.map((i) => [
      i.id,
      { ...emptyRecord(i.id), stage: "passed" as const, errors: 0 },
    ]),
  );

test("รอบที่ของผ่านครบทุกรายการ พร้อมสรุป", () => {
  const summary = summarizePeriod(period, allPassed(), now);
  assert.equal(summary.ready, true);
  assert.deepEqual(summary.blockers, []);
  assert.equal(summary.owners.length, 6);
});

test("ขาดแม้รายการเดียว ยังไม่พร้อม และบอกว่าขาดอะไรของใคร", () => {
  const records = allPassed();
  records.delete("01");
  const summary = summarizePeriod(period, records, now);
  assert.equal(summary.ready, false);
  assert.equal(summary.blockers.length, 1);
  assert.ok(summary.blockers[0].includes("จัดส่ง ลาดกระบัง"));
});

test("ของที่ผ่านโดยข้ามด่าน 1 ถูกชี้ไว้ในสรุป ไม่กลืนหายไปกับของที่ผ่านปกติ", () => {
  const records = allPassed();
  records.set("13", {
    ...emptyRecord("13"),
    stage: "passed",
    errors: 2,
    overrideReason: "ยืนยันยอดกับบัญชีแล้ว",
  });
  const summary = summarizePeriod(period, records, now);
  assert.equal(summary.ready, true);
  assert.ok(summary.blockers.length === 0);
  assert.ok(
    summary.owners.some((o) => o.tally.passed > 0),
    "ยังนับเป็นผ่าน",
  );
  assert.equal(
    summary.owners.reduce((n, o) => n + o.overridden, 0),
    1,
    "นับของที่ข้ามด่านแยกไว้",
  );
});

test("ไฟล์ที่อ่านไม่ออกไม่ถูกนับรวมเป็น “ข้อผิดพลาด 1 ข้อ” ของไฟล์ที่อ่านได้", () => {
  /* แถวแบบที่ POST /api/payroll/parse เขียนเมื่ออ่านไฟล์ไม่ออก — ธงบนแถวบอกตรง ๆ
     ไม่ใช่เดาจากการที่ไม่มี rows/columns */
  const unreadable: IntakeRecord = {
    ...emptyRecord("02"),
    stage: "submitted",
    errors: 1,
    unreadable: true,
    checkedAt: "2026-09-12T03:00:00.000Z",
  };
  /* ไฟล์ที่อ่านได้และมีข้อผิดพลาดจริง 1 ข้อ */
  const readable: IntakeRecord = {
    ...unreadable,
    itemId: "03",
    unreadable: false,
    rows: 40,
    columns: 5,
  };
  assert.equal(isUnreadable(unreadable), true);
  assert.equal(isUnreadable(readable), false);
  assert.equal(isUnreadable({ ...emptyRecord("04") }), false, "ยังไม่ส่ง ไม่ใช่อ่านไม่ออก");
  assert.equal(
    isUnreadable({ ...unreadable, unreadable: undefined, rows: undefined, columns: undefined }),
    false,
    "แถวเก่าที่ยังไม่มีธงนี้ ไม่เดาว่าอ่านไม่ออก",
  );

  const records = allPassed();
  records.set("02", unreadable);
  records.set("03", readable);
  const summary = summarizePeriod(period, records, now);
  assert.equal(summary.ready, false);
  assert.equal(summary.blockers.length, 2);
  const b02 = summary.blockers.find((b) => b.includes("02"));
  const b03 = summary.blockers.find((b) => b.includes("03"));
  assert.ok(b02?.includes("อ่านไฟล์ไม่ได้"));
  assert.ok(!b03?.includes("อ่านไฟล์ไม่ได้"));
  assert.equal(summary.owners.reduce((n, o) => n + o.unreadable, 0), 1);
});

test("ขอบเขตรายการแคบลง (ฝ่ายเดียว) สรุปเฉพาะของฝ่ายนั้น", () => {
  const mine = INTAKE_ITEMS.filter((i) => i.owner === "ยานยนต์");
  const summary = summarizePeriod(period, new Map(), now, mine);
  assert.equal(summary.owners.length, 1);
  assert.equal(summary.owners[0].owner, "ยานยนต์");
  assert.equal(summary.blockers.length, mine.length);
});

test("รายการที่ pending ไม่ทำให้รอบไม่ครบ", () => {
  const records = allPassed();
  records.set("14", {
    ...emptyRecord("14"),
    stage: "passed",
    errors: 0,
    pendingChecks: 3,
  });
  assert.equal(summarizePeriod(period, records, now).ready, true);
});

/* ------------------------------------------------------------------ Excel */

async function open(file: ArrayBuffer) {
  const book = new Workbook();
  await book.xlsx.load(file);
  return book;
}

const textOf = (sheet: { eachRow: (cb: (row: { eachCell: (cb: (c: { text: string }) => void) => void }) => void) => void }) => {
  const out: string[] = [];
  sheet.eachRow((row) => row.eachCell((c) => out.push(c.text)));
  return out;
};

test("Excel สรุปมีสองชีตและบอกชัดว่าไม่ใช่ไฟล์นำเข้า Tiger Soft", async () => {
  const records = allPassed();
  records.set("13", {
    ...emptyRecord("13"),
    stage: "passed",
    errors: 2,
    rows: 10,
    columns: 4,
    receivedBy: "สมชาย",
    passedBy: "สมหญิง",
    overrideReason: "ยืนยันยอดกับบัญชีแล้ว",
  });
  records.set("02", {
    ...emptyRecord("02"),
    stage: "submitted",
    errors: 1,
    unreadable: true,
    checkedAt: "2026-09-12T03:00:00.000Z",
    fileName: "เสีย.xlsx",
  });
  records.delete("01");

  const summary = summarizePeriod(period, records, now);
  const { file, name } = await buildPeriodSummary(summary, records);
  assert.equal(name, "สรุปรับข้อมูลเงินเดือน_ก.ย. 2569.xlsx");

  const book = await open(file);
  assert.deepEqual(
    book.worksheets.map((s) => s.name),
    ["สรุปรายฝ่าย", "รายรายการ"],
  );

  for (const sheet of book.worksheets) {
    assert.ok(
      textOf(sheet).some((t) => t.includes("ไม่ใช่ไฟล์นำเข้า Tiger Soft")),
      `${sheet.name} ต้องมีบรรทัดกำกับ`,
    );
  }

  /* ชีตรายฝ่าย: หัวตาราง + 6 ฝ่าย */
  const byOwner = book.getWorksheet("สรุปรายฝ่าย")!;
  const head = byOwner.getRow(5).values as string[];
  assert.deepEqual(head.slice(1), ["ฝ่าย", "ทั้งหมด", "ผ่าน", "รอตรวจ", "ตีกลับ", "รอส่ง", "ช้าสุด (วัน)", "ไฟล์อ่านไม่ได้", "ผ่านโดยข้ามด่าน"]);
  assert.equal(byOwner.getRow(6).getCell(1).text, "จัดส่ง ลาดกระบัง");
  assert.equal(byOwner.rowCount, 5 + 6);
  const ownerRow = (name: string) => {
    for (let r = 6; r <= byOwner.rowCount; r++) {
      if (byOwner.getRow(r).getCell(1).text === name) return byOwner.getRow(r);
    }
    throw new Error(`ไม่พบฝ่าย ${name}`);
  };
  const unreadableOwner = INTAKE_ITEMS.find((i) => i.id === "02")!.owner;
  const overriddenOwner = INTAKE_ITEMS.find((i) => i.id === "13")!.owner;
  assert.equal(ownerRow(unreadableOwner).getCell(8).text, "1");
  assert.equal(ownerRow(overriddenOwner).getCell(9).text, "1");

  /* ชีตรายรายการ: ทุกรายการในทะเบียน */
  const items = book.getWorksheet("รายรายการ")!;
  const ih = items.getRow(5).values as string[];
  assert.deepEqual(ih.slice(1), [
    "เลขรายการ", "ชื่อรายการ", "ฝ่าย", "สถานะ", "ชื่อไฟล์", "ใครส่ง", "ส่งเมื่อ",
    "ใครผ่าน", "ผ่านเมื่อ", "ข้อผิดพลาดที่ค้าง", "เหตุผลที่ข้ามด่าน",
  ]);
  assert.equal(items.rowCount, 5 + INTAKE_ITEMS.length);

  const rowOf = (id: string) => {
    for (let r = 6; r <= items.rowCount; r++) {
      if (items.getRow(r).getCell(1).text === id) return items.getRow(r);
    }
    throw new Error(`ไม่พบแถว ${id}`);
  };
  assert.equal(rowOf("13").getCell(10).text, "2");
  assert.equal(rowOf("13").getCell(11).text, "ยืนยันยอดกับบัญชีแล้ว");
  assert.equal(rowOf("13").getCell(4).text, "ตรวจผ่าน");
  assert.equal(rowOf("02").getCell(10).text, "อ่านไฟล์ไม่ได้");
  assert.equal(rowOf("01").getCell(4).text, "รอส่ง");
  assert.equal(rowOf("03").getCell(10).text, "0");
});

test("สรุปของฝ่ายเดียวไม่พูดว่ารอบครบ และบอกว่าตัวเลขนี้ไม่ใช่ทั้งรอบ", async () => {
  const mine = INTAKE_ITEMS.filter((i) => i.owner === "ยานยนต์");
  const records = new Map(
    mine.map((i) => [i.id, { ...emptyRecord(i.id), stage: "passed" as const, errors: 0 }]),
  );
  const summary = summarizePeriod(period, records, now, mine);
  assert.equal(summary.scoped, true);
  assert.equal(summary.ready, true);
  const line = readinessLine(summary);
  assert.ok(line.includes("ยานยนต์"));
  assert.ok(!line.includes("ทุกรายการ"), line);
  assert.equal(summarizePeriod(period, allPassed(), now).scoped, false);

  const { file } = await buildPeriodSummary(summary, records);
  const book = await open(file);
  for (const sheet of book.worksheets) {
    const text = textOf(sheet);
    assert.ok(text.includes(SCOPED_NOTE), `${sheet.name} ต้องมีหมายเหตุขอบเขต`);
    assert.ok(!text.some((t) => t.includes("ทุกรายการตรวจผ่านครบแล้ว")));
  }
});

test("ผ่านโดยข้ามด่านแต่ไม่มีเหตุผลบันทึก ช่อง Excel ต้องบอกตรง ๆ ไม่ปล่อยว่าง", async () => {
  const records = allPassed();
  records.set("13", { ...emptyRecord("13"), stage: "passed", errors: 2, rows: 3, columns: 3 });
  const { file } = await buildPeriodSummary(summarizePeriod(period, records, now), records);
  const items = (await open(file)).getWorksheet("รายรายการ")!;
  let cell = "";
  for (let r = 6; r <= items.rowCount; r++) {
    if (items.getRow(r).getCell(1).text === "13") cell = items.getRow(r).getCell(11).text;
  }
  assert.equal(cell, "ไม่มีเหตุผลบันทึกไว้");
});

test("สรุปของฝ่ายเดียวที่ยังไม่ครบ พูดว่า “ยังไม่ครบ” และนับที่เหลือ ไม่พูดว่าผ่านครบ", () => {
  const mine = INTAKE_ITEMS.filter((i) => i.owner === "ยานยนต์");
  assert.ok(mine.length >= 2, "เทสต์นี้ต้องมีอย่างน้อย 2 รายการ");
  const records = new Map(
    mine.map((i) => [i.id, { ...emptyRecord(i.id), stage: "passed" as const, errors: 0 }]),
  );
  records.delete(mine[0].id);
  const summary = summarizePeriod(period, records, now, mine);
  assert.equal(summary.scoped, true);
  assert.equal(summary.ready, false);
  const line = readinessLine(summary);
  assert.ok(line.startsWith("รายการของยานยนต์ ยังไม่ครบ"), line);
  assert.ok(line.includes("เหลือ 1 รายการ"), line);
  assert.ok(!line.includes("ผ่านครบแล้ว"), line);
});

test("ผู้ใช้ที่ไม่เห็นรายการเลย ไม่ได้ข้อความ “รายการของ ผ่านครบแล้ว” ที่ชื่อฝ่ายว่าง", () => {
  const summary = summarizePeriod(period, new Map(), now, []);
  assert.equal(summary.ready, false, "ไม่มีอะไรให้ตรวจ ไม่ใช่พร้อม");
  assert.equal(summary.scoped, true);
  const line = readinessLine(summary);
  assert.ok(!line.includes("รายการของ "), line);
  assert.ok(!line.includes("ผ่านครบแล้ว"), line);
  assert.ok(line.includes("ไม่มีรายการ"), line);
});

test("เหตุผลข้ามด่านที่เป็นข้อความว่าง Excel ต้องขึ้นข้อความเดียวกับหน้าจอ", async () => {
  const records = allPassed();
  records.set("13", {
    ...emptyRecord("13"),
    stage: "passed",
    errors: 2,
    rows: 3,
    columns: 3,
    overrideReason: "",
  });
  const { file } = await buildPeriodSummary(summarizePeriod(period, records, now), records);
  const items = (await open(file)).getWorksheet("รายรายการ")!;
  let cell = "";
  for (let r = 6; r <= items.rowCount; r++) {
    if (items.getRow(r).getCell(1).text === "13") cell = items.getRow(r).getCell(11).text;
  }
  assert.equal(cell, "ไม่มีเหตุผลบันทึกไว้");
});
