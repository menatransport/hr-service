import assert from "node:assert/strict";
import { test } from "node:test";

import { computeHeadcount, type EtlDriverRow, type PartnerDriverRow } from "./headcount";

const e = (drivercode: string, ownerType: string, active = true): EtlDriverRow => ({
  drivercode,
  name: `ชื่อ ${drivercode}`,
  ownerType,
  active,
});

const p = (id: string, contracts: string[], over: Partial<PartnerDriverRow> = {}): PartnerDriverRow => ({
  personKey: id,
  name: `คน ${id}`,
  active: true,
  isTruckOwner: false,
  isDriver: true,
  contractCodes: contracts,
  ...over,
});

test("ETL นับเฉพาะ active ประเภท พจส./พจร./สแปร์ — สนง และ inactive ไม่นับ", () => {
  const h = computeHeadcount(
    [e("A", "1"), e("B", "2"), e("C", "พจส.สแปร์"), e("D", "3"), e("E", "1", false)],
    [],
    [],
  );
  assert.equal(h.etlActive, 3);
  assert.deepEqual(h.byType, { "1": 1, "2": 1, "4": 1 });
  assert.equal(h.total, 3);
});

test("คนสองรหัส (จับคู่แล้ว) นับครั้งเดียว", () => {
  const h = computeHeadcount([e("A", "1"), e("B", "2")], [p("x", ["C1"]), p("y", ["C2"])], [
    { contractCode: "C1", drivercode: "B" },
  ]);
  assert.equal(h.etlActive, 2);
  assert.equal(h.partnerActive, 2);
  assert.equal(h.linkedBoth, 1);
  assert.equal(h.partnerOnly, 1);
  assert.equal(h.total, 3);
});

test("ไม่มีคู่ยังนับ (เป็นคนขับรถร่วมที่ ETL ไม่รู้จัก)", () => {
  const h = computeHeadcount([e("A", "1")], [p("x", ["C1"])], []);
  assert.equal(h.partnerOnly, 1);
  assert.equal(h.total, 2);
});

test("เจ้าของรถที่ไม่ได้ขับเองถูกตัด และรายงานจำนวนที่ตัด · ปิด option แล้วกลับมานับ", () => {
  const partner = [p("own", ["C1"], { isTruckOwner: true, isDriver: false }), p("both", ["C2"], { isTruckOwner: true })];
  const h = computeHeadcount([], partner, []);
  assert.equal(h.excludedOwners, 1);
  assert.equal(h.partnerActive, 1);
  assert.equal(h.total, 1);

  const all = computeHeadcount([], partner, [], { excludeNonDrivingOwners: false });
  assert.equal(all.excludedOwners, 0);
  assert.equal(all.total, 2);
});

test("รถร่วม inactive ไม่นับ", () => {
  const h = computeHeadcount([], [p("x", ["C1"], { active: false })], []);
  assert.equal(h.partnerActive, 0);
  assert.equal(h.total, 0);
});

test("คนเดียวหลายสัญญา (personKey เดียว) นับครั้งเดียว", () => {
  const h = computeHeadcount([e("A", "2")], [p("x", ["C1", "C2"])], [
    { contractCode: "C1", drivercode: "A" },
    { contractCode: "C2", drivercode: "A" },
  ]);
  assert.equal(h.total, 1);
  assert.equal(h.linkedBoth, 1);
});

test("สองคนฝั่งรถร่วมถูกจับเข้า drivercode เดียวกัน — นับเป็นคนเดียว", () => {
  const h = computeHeadcount([e("A", "2")], [p("x", ["C1"]), p("y", ["C2"])], [
    { contractCode: "C1", drivercode: "A" },
    { contractCode: "C2", drivercode: "A" },
  ]);
  assert.equal(h.total, 1);
  assert.equal(h.linkedBoth, 1);
  assert.equal(h.partnerOnly, 0);
});

test("คู่ที่ชี้ไป drivercode ที่ ETL ไม่ active — รถร่วมยังนับ (จ่ายเงินยึดรถร่วม) แต่นับครั้งเดียว", () => {
  const h = computeHeadcount([e("A", "2", false)], [p("x", ["C1"]), p("y", ["C2"])], [
    { contractCode: "C1", drivercode: "A" },
    { contractCode: "C2", drivercode: "A" },
  ]);
  assert.equal(h.etlActive, 0);
  assert.equal(h.partnerOnly, 1);
  assert.equal(h.total, 1);
});

test("ตัวเลขรวมเท่ากับ ETL + ส่วนเพิ่มจากรถร่วมเสมอ", () => {
  const h = computeHeadcount(
    [e("A", "1"), e("B", "2"), e("C", "2")],
    [p("x", ["C1"]), p("y", ["C2"]), p("z", ["C3"])],
    [{ contractCode: "C1", drivercode: "B" }],
  );
  assert.equal(h.total, h.etlActive + h.partnerOnly);
  assert.equal(h.partnerActive, h.partnerOnly + h.linkedBoth);
});
