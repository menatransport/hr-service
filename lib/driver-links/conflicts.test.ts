import assert from "node:assert/strict";
import { test } from "node:test";

import { findConflicts } from "./conflicts";
import type { EtlDriverRow, PartnerDriverRow } from "./headcount";

const e = (drivercode: string, name: string, active = true): EtlDriverRow => ({
  drivercode,
  name,
  ownerType: "2",
  active,
});
const p = (contract: string, name: string, active = true): PartnerDriverRow => ({
  personKey: contract,
  name,
  active,
  isTruckOwner: false,
  isDriver: true,
  contractCodes: [contract],
});

test("สถานะสลับกันทั้งสองทิศ", () => {
  const out = findConflicts(
    [e("A", "สมชาย ใจดี", false), e("B", "สมศรี ใจงาม", true)],
    [p("C1", "นายสมชาย ใจดี", true), p("C2", "นางสมศรี ใจงาม", false)],
    [
      { contractCode: "C1", drivercode: "A" },
      { contractCode: "C2", drivercode: "B" },
    ],
  );
  assert.deepEqual(
    out.map((c) => [c.contractCode, c.kind]),
    [
      ["C1", "status"],
      ["C2", "status"],
    ],
  );
  assert.match(out[0].detail, /รถร่วมยังทำงานอยู่/);
  assert.match(out[1].detail, /รถร่วมพ้นสภาพแล้ว/);
});

test("ชื่อต่างหลังลดรูป = ขัดแย้ง · ต่างแค่คำนำหน้า = ไม่ขัดแย้ง", () => {
  const out = findConflicts(
    [e("A", "สมชาย ใจดี"), e("B", "สมศักดิ์ ใจดี")],
    [p("C1", "นาย สมชาย  ใจดี"), p("C2", "นายสมชาย ใจดี")],
    [
      { contractCode: "C1", drivercode: "A" },
      { contractCode: "C2", drivercode: "B" },
    ],
  );
  assert.deepEqual(
    out.map((c) => [c.contractCode, c.kind]),
    [["C2", "name"]],
  );
});

test("คู่ที่รหัสหายไปจากฝั่งใดฝั่งหนึ่ง", () => {
  const out = findConflicts([], [], [{ contractCode: "C9", drivercode: "Z" }]);
  assert.deepEqual(out.map((c) => c.kind).sort(), ["missingContract", "missingDriver"]);
});

test("คนที่ยังไม่มีคู่ไม่ใช่ขัดแย้ง", () => {
  assert.deepEqual(findConflicts([e("A", "ก ข")], [p("C1", "ค ง")], []), []);
});
