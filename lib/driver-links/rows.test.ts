import assert from "node:assert/strict";
import { test } from "node:test";

import { baseContractCode, etlActive, toEtlSide, toPartnerSide } from "./rows";

test("ทะเบียนของคนขับที่ไม่ใช่เจ้าของ (MTM145-01) มาจากสัญญาแม่ MTM145", () => {
  assert.equal(baseContractCode("MTM145-01"), "MTM145");
  assert.equal(baseContractCode("MTM145"), "MTM145");
  const { candidates } = toPartnerSide(
    [
      { _id: "a", contractCode: "MTM145", prefix: "นาย", firstName: "เจ้าของ", lastName: "รถ", status: "active" },
      { _id: "b", contractCode: "MTM145-01", prefix: "นาย", firstName: "คน", lastName: "ขับ", status: "active" },
    ],
    [{ contractCode: "MTM145", licensePlate: "71-1515", status: "active" }],
  );
  assert.deepEqual(
    candidates.map((c) => [c.contractCode, c.licensePlate, c.name]),
    [
      ["MTM145", "71-1515", "นายเจ้าของ รถ"],
      ["MTM145-01", "71-1515", "นายคน ขับ"],
    ],
  );
});

test("คนเดียวหลายสัญญา = เลขบัตรเดียวกัน → personKey เดียว รวมสัญญา", () => {
  const { people } = toPartnerSide(
    [
      { _id: "a", contractCode: "MTM001", firstName: "ก", nationalId: "1-2345-67890-12-3", status: "inactive" },
      { _id: "b", contractCode: "MTM002", firstName: "ก", nationalId: "1234567890123", status: "active" },
      { _id: "c", contractCode: "MTM003", firstName: "ก", status: "active" },
    ],
    [],
  );
  assert.equal(people.length, 2);
  const merged = people.find((p) => p.personKey === "nid:1234567890123")!;
  assert.deepEqual(merged.contractCodes, ["MTM001", "MTM002"]);
  assert.equal(merged.active, true);
});

test("ไม่มีธง isDriver = ถือว่าขับ · isTruckOwner ต้องเป็น true จริงเท่านั้น", () => {
  const { people } = toPartnerSide([{ _id: "a", contractCode: "X", status: "active" }], []);
  assert.equal(people[0].isDriver, true);
  assert.equal(people[0].isTruckOwner, false);
});

test("ETL: statusOverride ทับ active ของ ETL", () => {
  assert.equal(etlActive({ active: true, statusOverride: "resigned" }), false);
  assert.equal(etlActive({ active: false, statusOverride: "active" }), true);
  assert.equal(etlActive({ active: true }), true);
  assert.equal(etlActive({ active: "yes" }), false);
});

test("ETL: vehicleCode เป็นเลขรถหรือทะเบียนก็ได้ — เด้งเป็นทะเบียนผ่าน vehicles", () => {
  const { candidates } = toEtlSide(
    [
      { drivercode: "D1", driverName: "ก ข", vehicleCode: "L-101", active: true, ownerType: "2" },
      { drivercode: "D2", driverName: "ค ง", vehicleCode: "70-1234", active: true, ownerType: "2" },
      { drivercode: "D3", driverName: "จ ฉ", vehicleCode: "ไม่รู้", active: true, ownerType: "2" },
      { drivercode: " ", driverName: "ทิ้ง" },
    ],
    [
      { code: "L-101", plate_no: "71-1515" },
      { code: "L-102", plate_no: "70-1234" },
    ],
  );
  assert.deepEqual(
    candidates.map((c) => [c.drivercode, c.plateNo]),
    [
      ["D1", "71-1515"],
      ["D2", "70-1234"],
      ["D3", null],
    ],
  );
});
