import assert from "node:assert/strict";
import { test } from "node:test";

import { buildOverview } from "./overview";

test("ภาพรวม: สัญญาที่จับคู่แล้วไม่อยู่ในข้อเสนอ · คู่แสดงชื่อสองฝั่ง · ตัวเลขหักซ้ำ", () => {
  const o = buildOverview(
    {
      partnerDrivers: [
        { _id: "a", contractCode: "MTM001", prefix: "นาย", firstName: "สมชาย", lastName: "ใจดี", status: "active" },
        { _id: "b", contractCode: "MTM002", prefix: "นาย", firstName: "สมศักดิ์", lastName: "ดีมาก", status: "active" },
      ],
      contracts: [{ contractCode: "MTM002", licensePlate: "สบ.71-1515" }],
      etlDrivers: [
        { drivercode: "D1", driverName: "สมชาย ใจดี", ownerType: "2", active: true },
        { drivercode: "D2", driverName: "สมศักดิ์ ดีมาก", ownerType: "2", active: true, vehicleCode: "V9" },
      ],
      vehicles: [{ code: "V9", plate_no: "71-1515" }],
    },
    [
      {
        contractCode: "MTM001",
        drivercode: "D1",
        matchedBy: "name",
        confidence: "low",
        confirmedBy: "E1",
        confirmedByName: "ผู้ตรวจ",
        confirmedAt: new Date("2026-10-19T00:00:00Z"),
      },
    ],
    { now: new Date("2026-10-19T01:00:00Z") },
  );

  assert.deepEqual(
    o.proposals.map((p) => [p.contractCode, p.candidates[0]?.drivercode, p.candidates[0]?.confidence]),
    [["MTM002", "D2", "medium"]],
  );
  assert.equal(o.links[0].partnerName, "นายสมชาย ใจดี");
  assert.equal(o.links[0].etlName, "สมชาย ใจดี");
  assert.equal(o.headcount.total, 3); // D1 D2 + MTM002 ที่ยังไม่มีคู่
  assert.equal(o.headcount.linkedBoth, 1);
  assert.deepEqual(o.conflicts, []);
  assert.equal(o.nationalIdField, null);
  assert.equal(o.partnerContracts, 2);
  // เลขบัตรประชาชนห้ามหลุดไปถึงหน้าจอ
  assert.doesNotMatch(JSON.stringify(o), /nationalId"\s*:\s*"\d/);
});
