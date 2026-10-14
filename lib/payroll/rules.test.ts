import { test } from "node:test";
import assert from "node:assert/strict";

import { classify, MONEY_COLUMNS, postedColumns, type MoneyEffect } from "@/lib/payroll/classify";
import type { FileProfile } from "@/lib/payroll/profile";
import type { ParsedFile } from "@/lib/payroll/parse";
import { make, runChecks, summarize, WAITING_OWNER } from "@/lib/payroll/rules";
import { DAY_CODES, templateOf } from "@/lib/payroll/template-spec";

/**
 * ไฟล์สมมติที่หัวคอลัมน์ตรงสเปกของรายการนั้น แล้วค่อยทำให้ผิดทีละข้อในแต่ละเทสต์
 *
 * **ชื่อคอลัมน์เงินอ่านจาก `postedColumns()` ไม่เขียนทับด้วยมือ** — ชื่อจริงต่างกัน
 * ทุกรายการ (#13 คือ `ยอดหักเงิน(บาท)` · #11 คือ `รางวัล TA(บาท)` · #17 คือ `จำนวนเงิน`)
 * เขียนทับด้วยมือเมื่อไหร่ เทสต์จะกรอกค่าลงคอลัมน์ที่ไม่มีอยู่ แล้วผ่านเพราะไม่มีอะไร
 * ให้ตรวจ ไม่ใช่เพราะกฎทำงาน
 */
const payeeCol = (itemId: string) => classify(itemId)!.payeeColumn;
const moneyCol = (itemId: string, effect: MoneyEffect) =>
  postedColumns(itemId).find((p) => p.effect === effect)!.column;

function parsed(itemId: string, rows: Record<string, string>[]): ParsedFile {
  const columns = templateOf(itemId)!.columns;
  const letters = columns.map((_, i) => String.fromCharCode(65 + i));
  const profile: FileProfile = {
    fileName: `${itemId}.xlsx`,
    sheetName: "s",
    sheetCount: 1,
    headerRow: 1,
    totalRows: rows.length,
    columns: columns.map((header, i) => ({
      letter: letters[i],
      header,
      type: "text",
      state: "ok",
      valid: rows.length,
      mismatch: 0,
      empty: 0,
      distinct: rows.length,
      samples: [],
    })),
  };
  const byLetter = rows.map((row) => {
    const out: Record<string, string> = {};
    for (const [header, value] of Object.entries(row)) {
      const at = columns.indexOf(header);
      if (at >= 0) out[letters[at]] = value;
    }
    return out;
  });
  /* แถวต่อเนื่องใต้หัวตาราง — เทสต์ที่ต้องการแถวไม่ต่อเนื่องให้เขียนทับ `rowNumbers` เอง */
  const rowNumbers = rows.map((_, i) => profile.headerRow + 1 + i);
  return { profile, rows: byLetter, rowNumbers };
}

const ids = (results: ReturnType<typeof runChecks>) => results.map((r) => r.id).sort();

test("ไฟล์ที่ถูกต้องไม่มีข้อผิดพลาดที่บล็อก", () => {
  const file = parsed("13", [
    { [payeeCol("13")]: "123456", [moneyCol("13", "หัก")]: "500" },
  ]);
  const tally = summarize(runChecks("13", file));
  assert.equal(tally.blocking, 0);
});

test("ขาดคอลัมน์ตามสเปก = ข้อผิดพลาดที่บล็อก", () => {
  const money = moneyCol("13", "หัก");
  const file = parsed("13", [{ [payeeCol("13")]: "123456", [money]: "500" }]);
  file.profile.columns = file.profile.columns.filter((c) => c.header !== money);
  const results = runChecks("13", file);
  assert.ok(ids(results).includes("columns.missing"));
  assert.equal(results.find((r) => r.id === "columns.missing")?.blocking, true);
});

test("หัวคอลัมน์ที่มีช่องว่างเกินยังนับว่าตรงสเปก", () => {
  const money = moneyCol("13", "หัก");
  const file = parsed("13", [{ [payeeCol("13")]: "1", [money]: "5" }]);
  const col = file.profile.columns.find((c) => c.header === money)!;
  /* แทรกช่องว่างกลางชื่อและหัวท้าย — ไฟล์จริงมาแบบนี้เสมอ */
  col.header = ` ${money.slice(0, 3)} ${money.slice(3)} `;
  assert.ok(!ids(runChecks("13", file)).includes("columns.missing"));
});

test("คอลัมน์เงินเข้าใครว่างแม้แถวเดียวก็บล็อก และบอกเลขแถว", () => {
  const money = moneyCol("13", "หัก");
  const file = parsed("13", [
    { [payeeCol("13")]: "123456", [money]: "500" },
    { [payeeCol("13")]: "", [money]: "300" },
  ]);
  const found = runChecks("13", file).find((r) => r.id === "payee.blank");
  assert.equal(found?.blocking, true);
  assert.deepEqual(found?.rows, ["3"]);
});

test("ค่าครูฝึกตรวจช่อง รหัสครูฝึก ไม่ใช่ รหัสพนักงาน", () => {
  assert.equal(payeeCol("10"), "รหัสครูฝึก");
  const file = parsed("10", [{ "รหัสพนักงาน": "123456", "รหัสครูฝึก": "" }]);
  const found = runChecks("10", file).find((r) => r.id === "payee.blank");
  assert.ok(found?.detail.includes("รหัสครูฝึก"));
});

test("ช่องเงินที่เก็บเป็นข้อความ = ข้อผิดพลาด", () => {
  const file = parsed("13", [
    { [payeeCol("13")]: "1", [moneyCol("13", "หัก")]: "ห้าร้อย" },
  ]);
  const found = runChecks("13", file).find((r) => r.id === "money.not-number");
  assert.equal(found?.blocking, true);
});

test("ช่องเงินเพิ่มติดลบ = ข้อผิดพลาด เพราะกรอกผิดช่อง", () => {
  const file = parsed("11", [
    { [payeeCol("11")]: "1", [moneyCol("11", "เพิ่ม")]: "-200" },
  ]);
  const found = runChecks("11", file).find((r) => r.id === "money.negative");
  assert.equal(found?.blocking, true);
});

test("ช่องเงินว่างทั้งคอลัมน์ = เตือน ไม่บล็อก (อาจเป็นเดือนที่ไม่มีรายการจริง)", () => {
  const file = parsed("13", [{ [payeeCol("13")]: "1", [moneyCol("13", "หัก")]: "" }]);
  const found = runChecks("13", file).find((r) => r.id === "money.all-blank");
  assert.equal(found?.severity, "warn");
  assert.equal(found?.blocking, false);
});

test("ไฟล์ไม่มีแถวข้อมูลเลย = ข้อผิดพลาด", () => {
  const found = runChecks("13", parsed("13", [])).find((r) => r.id === "file.empty");
  assert.equal(found?.blocking, true);
});

test("รหัสเดียวซ้ำหลายแถว = เตือน พร้อมบอกว่าซ้ำกี่รหัส", () => {
  const money = moneyCol("13", "หัก");
  const file = parsed("13", [
    { [payeeCol("13")]: "1", [money]: "5" },
    { [payeeCol("13")]: "1", [money]: "7" },
  ]);
  const found = runChecks("13", file).find((r) => r.id === "payee.duplicate");
  assert.equal(found?.severity, "warn");
});

test("ช่องเงินหายจากไฟล์ที่สเปกยืนยันแล้ว = บล็อก ไม่ข้ามเงียบ", () => {
  const money = moneyCol("13", "หัก");
  const file = parsed("13", [{ [payeeCol("13")]: "1", [money]: "5" }]);
  file.profile.columns = file.profile.columns.filter((c) => c.header !== money);
  const found = runChecks("13", file).find((r) => r.id === "money.column-missing");
  assert.equal(found?.blocking, true);
  assert.ok(found?.detail.includes(money));
});

test("ช่องเงินหายจากแบบฟอร์มร่าง = ขึ้นให้เห็นแต่ไม่บล็อก", () => {
  assert.equal(templateOf("03")!.confirmed, false);
  const money = moneyCol("03", "เพิ่ม");
  const file = parsed("03", [{ [payeeCol("03")]: "1", [money]: "5" }]);
  file.profile.columns = file.profile.columns.filter((c) => c.header !== money);
  const found = runChecks("03", file).find((r) => r.id === "money.column-missing");
  assert.equal(found?.status, "pending");
  assert.equal(found?.blocking, false);
});

test("รหัสเป็นค่าผิดพลาดของ Excel = บล็อก บอกเลขแถว และไม่นับเป็นรหัสซ้ำ", () => {
  const money = moneyCol("13", "หัก");
  const file = parsed("13", [
    { [payeeCol("13")]: "123456", [money]: "5" },
    { [payeeCol("13")]: "#N/A", [money]: "5" },
    { [payeeCol("13")]: "#N/A", [money]: "5" },
  ]);
  const results = runChecks("13", file);
  const found = results.find((r) => r.id === "payee.error-value");
  assert.equal(found?.blocking, true);
  assert.deepEqual(found?.rows, ["3", "4"]);
  assert.ok(!ids(results).includes("payee.duplicate"));
});

test("เลขแถวใช้เลขจริงในชีต ไม่ใช่ลำดับในอาร์เรย์ เมื่อมีแถวว่างคั่น", () => {
  const money = moneyCol("13", "หัก");
  const file = parsed("13", [
    { [payeeCol("13")]: "1", [money]: "5" },
    { [payeeCol("13")]: "", [money]: "5" },
  ]);
  file.rowNumbers = [2, 7];
  const found = runChecks("13", file).find((r) => r.id === "payee.blank");
  assert.deepEqual(found?.rows, ["7"]);
});

test("ช่องเงินที่เป็นเลขฐานอื่นหรือเลขยกกำลังไม่ใช่ตัวเลข แต่ 1,200.50 ใช่", () => {
  const money = moneyCol("13", "หัก");
  for (const bad of ["0x10", "1e3", "0b11", "0o7"]) {
    const file = parsed("13", [{ [payeeCol("13")]: "1", [money]: bad }]);
    assert.ok(ids(runChecks("13", file)).includes("money.not-number"), bad);
  }
  const ok = parsed("13", [{ [payeeCol("13")]: "1", [money]: "1,200.50" }]);
  assert.ok(!ids(runChecks("13", ok)).includes("money.not-number"));
});

test("ช่องเงินที่ยังรอยืนยันทิศทาง ไม่ตรวจเครื่องหมาย แม้เป็นค่าติดลบ", () => {
  const col = moneyCol("17", "รอยืนยัน");
  const file = parsed("17", [{ [payeeCol("17")]: "1", [col]: "-200" }]);
  assert.ok(!ids(runChecks("17", file)).includes("money.negative"));
});

test("summarize นับแยก error / warn / pending / blocking", () => {
  const tally = summarize([
    { id: "a", severity: "error", status: "active", title: "", detail: "", blocking: true },
    { id: "b", severity: "error", status: "pending", title: "", detail: "", blocking: false },
    { id: "c", severity: "warn", status: "active", title: "", detail: "", blocking: false },
  ]);
  assert.deepEqual(tally, { errors: 2, warnings: 1, pending: 1, blocking: 1 });
});

test("รหัสวันที่ไม่อยู่ในชุด 24 ตัว = ข้อผิดพลาดที่บล็อก", () => {
  const file = parsed("01", [{ [payeeCol("01")]: "1", "1": "ZZ" }]);
  const found = runChecks("01", file).find((r) => r.id === "daycode.unknown");
  assert.equal(found?.blocking, true);
});

test("รหัสวันที่อยู่ในชุดแต่ยังไม่รู้ความหมาย = รอยืนยัน ไม่บล็อก", () => {
  const file = parsed("01", [{ [payeeCol("01")]: "1", "1": "Aส" }]);
  const found = runChecks("01", file).find((r) => r.id === "daycode.meaning-pending");
  assert.equal(found?.status, "pending");
  assert.equal(found?.blocking, false);
  assert.ok(found?.detail.includes("ฝ่ายจัดส่ง"));
});

test("รายการที่ยังไม่ยืนยันทิศทางเงิน ได้ผลตรวจรอยืนยัน และไม่มีกฎเครื่องหมายมาบล็อก", () => {
  const file = parsed("17", [
    { [payeeCol("17")]: "1", [moneyCol("17", "รอยืนยัน")]: "-100" },
  ]);
  const results = runChecks("17", file);
  const pending = results.find((r) => r.id === "money.effect-pending");
  assert.equal(pending?.status, "pending");
  assert.equal(pending?.blocking, false);
  assert.equal(results.some((r) => r.id === "money.negative"), false);
  assert.ok(pending?.detail.includes("ยานยนต์"));
});

test("รายการที่รอ Tiger Soft เคาะช่องรวม/ช่องย่อย ได้ผลตรวจรอยืนยัน", () => {
  const file = parsed("08", [{ [payeeCol("08")]: "1" }]);
  const found = runChecks("08", file).find((r) => r.id === "tigersoft.shape-pending");
  assert.equal(found?.status, "pending");
  assert.ok(found?.detail.includes("HR"));
});

test("กฎรอยืนยันไม่เคยทำให้ blocking เพิ่มขึ้น ไม่ว่ารายการไหน", () => {
  for (const id of ["14", "15", "17", "18", "08", "23"]) {
    const spec = templateOf(id)!;
    const row: Record<string, string> = {};
    for (const c of spec.columns) row[c] = c.includes("รหัส") ? "1" : "";
    const results = runChecks(id, parsed(id, [row]));
    const pendings = results.filter((x) => x.status === "pending");
    assert.ok(pendings.length > 0, `${id} ต้องมีผลตรวจรอยืนยันอย่างน้อยหนึ่งข้อ`);
    for (const r of pendings) {
      assert.equal(r.blocking, false, `${id}/${r.id} ต้องไม่บล็อก`);
    }
  }
});

test("ผลตรวจที่ severity เป็น error แต่ status เป็น pending ผ่าน make() แล้วต้องไม่บล็อก", () => {
  const r = make({ id: "x", severity: "error", status: "pending", title: "", detail: "" });
  assert.equal(r.blocking, false);
  assert.equal(make({ id: "x", severity: "error", status: "active", title: "", detail: "" }).blocking, true);
});

test("รหัสวันที่เป็นตัวเลข 0.50 / .5 / 0.5 เทียบเชิงตัวเลข ไม่ถูกนับเป็นรหัสไม่รู้จัก", () => {
  for (const v of ["0.50", ".5", "0.5", "0.750"]) {
    const file = parsed("01", [{ [payeeCol("01")]: "1", "1": v }]);
    assert.ok(!ids(runChecks("01", file)).includes("daycode.unknown"), v);
  }
  const bad = parsed("01", [{ [payeeCol("01")]: "1", "1": "0.6" }]);
  assert.ok(ids(runChecks("01", bad)).includes("daycode.unknown"));
});

test("ทุกรายการที่มีช่องรอยืนยันต้องมีชื่อฝ่ายเจ้าของคำตอบ", () => {
  for (const [id, cols] of Object.entries(MONEY_COLUMNS)) {
    if (Object.values(cols).includes("รอยืนยัน")) {
      assert.ok(WAITING_OWNER[id], `รายการ ${id} ไม่มีชื่อฝ่ายที่ต้องตอบ`);
    }
  }
});

test("ข้อความรหัสไม่รู้จักนับจำนวนรหัสจาก DAY_CODES จริง", () => {
  DAY_CODES.push({ code: "ZZTEST", meaning: "" });
  try {
    const file = parsed("01", [{ [payeeCol("01")]: "1", "1": "QQ" }]);
    const found = runChecks("01", file).find((r) => r.id === "daycode.unknown");
    assert.ok(found?.detail.includes(`${DAY_CODES.length} ตัว`));
  } finally {
    DAY_CODES.pop();
  }
});
