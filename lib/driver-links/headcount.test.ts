import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeHeadcount,
  findConflicts,
  type EtlDriverRow,
  type PartnerDriverRow,
} from "./headcount";

const e = (drivercode: string, ownerType: string, active = true): EtlDriverRow => ({
  drivercode,
  ownerType,
  active,
});

const p = (id: string, contracts: string[], over: Partial<PartnerDriverRow> = {}): PartnerDriverRow => ({
  partnerDriverId: id,
  name: `คน ${id}`,
  active: true,
  isTruckOwner: false,
  isDriver: true,
  contractCodes: contracts,
  ...over,
});

test("นับ ETL เฉพาะ active ประเภท พจส./พจร./สแปร์ — สนง ไม่นับ", () => {
  const h = computeHeadcount(
    [e("A", "1"), e("B", "2"), e("C", "พจส.สแปร์"), e("D", "3"), e("E", "1", false)],
    [],
    [],
  );
  assert.equal(h.etlActive, 3);
  assert.deepEqual(h.etlByType, { "1": 1, "2": 1, "4": 1 });
  assert.equal(h.total, 3);
});

test("คนที่จับคู่แล้วหักซ้ำหนึ่งครั้ง", () => {
  const h = computeHeadcount([e("A", "1"), e("B", "2")], [p("x", ["C1"]), p("y", ["C2"])], [
    { contractCode: "C1", drivercode: "B" },
  ]);
  assert.equal(h.etlActive, 2);
  assert.equal(h.partnerActive, 2);
  assert.equal(h.linkedDistinct, 1);
  assert.equal(h.total, 3);
  assert.equal(h.partnerUnlinked, 1);
});

test("คนเดียวสองสัญญา นับครั้งเดียวทั้ง partnerActive และ linkedDistinct", () => {
  const h = computeHeadcount([e("B", "2")], [p("x", ["C1", "C2"])], [
    { contractCode: "C1", drivercode: "B" },
    { contractCode: "C2", drivercode: "B" },
  ]);
  assert.equal(h.partnerActive, 1);
  assert.equal(h.linkedDistinct, 1);
  assert.equal(h.total, 1);
});

test("เจ้าของรถที่ไม่ขับเองไม่นับ · เจ้าของที่ขับเองนับ", () => {
  const h = computeHeadcount(
    [],
    [p("x", ["C1"], { isTruckOwner: true, isDriver: false }), p("y", ["C2"], { isTruckOwner: true, isDriver: true })],
    [],
  );
  assert.equal(h.partnerActive, 1);
});

test("คู่ที่ชี้ไปคนที่พ้นสภาพใน ETL ไม่ถูกหัก (ไม่ได้ถูกนับในฝั่ง ETL อยู่แล้ว)", () => {
  const h = computeHeadcount([e("B", "2", false)], [p("x", ["C1"])], [{ contractCode: "C1", drivercode: "B" }]);
  assert.equal(h.linkedDistinct, 0);
  assert.equal(h.total, 1);
});

test("partnerTypeGap = พจร. ใน ETL − คนขับรถร่วม", () => {
  const h = computeHeadcount([e("A", "2"), e("B", "2"), e("C", "2")], [p("x", ["C1"])], []);
  assert.equal(h.partnerTypeGap, 2);
});

test("ขัดแย้ง: สถานะไม่ตรง ทั้งสองทิศ", () => {
  const c = findConflicts(
    [e("A", "2", false), e("B", "2", true)],
    [p("x", ["C1"]), p("y", ["C2"], { active: false })],
    [
      { contractCode: "C1", drivercode: "A" },
      { contractCode: "C2", drivercode: "B" },
    ],
  );
  assert.deepEqual(
    c.map((x) => [x.kind, x.drivercode]),
    [
      ["status", "A"],
      ["status", "B"],
    ],
  );
});

test("ขัดแย้ง: ประเภทไม่ใช่ พจร. และรหัสหายจากทะเบียน", () => {
  const c = findConflicts([e("A", "1")], [p("x", ["C1", "C2"])], [
    { contractCode: "C1", drivercode: "A" },
    { contractCode: "C2", drivercode: "GONE" },
  ]);
  assert.deepEqual(
    c.map((x) => x.kind),
    ["ownerType", "missingDriver"],
  );
});

test("ไม่มีคู่: ขึ้น unlinkedActive เฉพาะคนที่นับเป็นคนขับ", () => {
  const c = findConflicts(
    [],
    [p("x", ["C1"]), p("y", ["C2"], { active: false }), p("z", ["C3"], { isTruckOwner: true, isDriver: false })],
    [],
  );
  assert.deepEqual(
    c.map((x) => [x.kind, x.partnerDriverId]),
    [["unlinkedActive", "x"]],
  );
});
