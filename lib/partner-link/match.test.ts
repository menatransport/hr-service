import assert from "node:assert/strict";
import { test } from "node:test";

import {
  normalizeName,
  normalizeNationalId,
  normalizePlate,
  proposeMatches,
  type EtlCandidate,
  type PartnerCandidate,
} from "./match";

const partner = (over: Partial<PartnerCandidate> = {}): PartnerCandidate => ({
  contractCode: "C001",
  partnerDriverId: "d1",
  name: "นายสมชาย ใจดี",
  nationalId: null,
  licensePlate: "70-1234",
  active: true,
  ...over,
});

const etl = (over: Partial<EtlCandidate> = {}): EtlCandidate => ({
  drivercode: "D100",
  name: "สมชาย ใจดี",
  nationalId: null,
  plateNo: null,
  ownerType: "2",
  active: true,
  ...over,
});

test("ชื่อ: ตัดคำนำหน้า จุด และช่องว่างซ้ำ", () => {
  assert.equal(normalizeName("นายสมชาย  ใจดี"), "สมชาย ใจดี");
  assert.equal(normalizeName("น.ส.สมหญิง ใจงาม"), "สมหญิง ใจงาม");
  assert.equal(normalizeName("นางสาว สมหญิง ใจงาม"), "สมหญิง ใจงาม");
  assert.equal(normalizeName("Mr. John  Doe"), "john doe");
  assert.equal(normalizeName(""), "");
  assert.equal(normalizeName(undefined), "");
});

test("เลขบัตร: ต้อง 13 หลักพอดี ไม่งั้นไม่ใช้", () => {
  assert.equal(normalizeNationalId("1-2345-67890-12-3"), "1234567890123");
  assert.equal(normalizeNationalId("123"), null);
  assert.equal(normalizeNationalId(null), null);
  assert.equal(normalizeNationalId("12345678901ab"), null);
});

test("ทะเบียน: ตัดขีด ช่องว่าง และชื่อจังหวัดท้าย", () => {
  assert.equal(normalizePlate("70-1234 กรุงเทพมหานคร"), "701234");
  assert.equal(normalizePlate("สบ 70-1234"), "สบ701234");
  assert.equal(normalizePlate(""), null);
});

test("เลขบัตรตรง = high แม้ชื่อสะกดต่าง", () => {
  const [p] = proposeMatches(
    [partner({ nationalId: "1234567890123", name: "นายสมชาญ ใจดี" })],
    [etl({ nationalId: "1234567890123" })],
  );
  assert.equal(p.candidates.length, 1);
  assert.equal(p.candidates[0].matchedBy, "nationalId");
  assert.equal(p.candidates[0].confidence, "high");
  assert.equal(p.ambiguous, false);
});

test("ชื่อ + ทะเบียนตรง = medium", () => {
  const [p] = proposeMatches([partner()], [etl({ plateNo: "70 1234" })]);
  assert.equal(p.candidates[0].matchedBy, "name+plate");
  assert.equal(p.candidates[0].confidence, "medium");
});

test("ชื่อตรงอย่างเดียว = low", () => {
  const [p] = proposeMatches([partner()], [etl()]);
  assert.equal(p.candidates[0].matchedBy, "name");
  assert.equal(p.candidates[0].confidence, "low");
});

test("ชื่อซ้ำสองคนชั้นเดียวกัน = ambiguous และลดเป็น low ทุกคน", () => {
  const [p] = proposeMatches(
    [partner({ licensePlate: "70-1234" })],
    [etl({ drivercode: "D1", plateNo: "70-1234" }), etl({ drivercode: "D2", plateNo: "70-1234" })],
  );
  assert.equal(p.ambiguous, true);
  assert.deepEqual(
    p.candidates.map((c) => c.confidence),
    ["low", "low"],
  );
});

test("ไม่เจอใครเลย = candidates ว่าง ไม่ใช่ error", () => {
  const [p] = proposeMatches([partner({ name: "นายไม่มี ในระบบ" })], [etl()]);
  assert.deepEqual(p.candidates, []);
  assert.equal(p.ambiguous, false);
});

test("สัญญาที่ยืนยันคู่แล้วไม่ถูกเสนอซ้ำ", () => {
  const out = proposeMatches([partner(), partner({ contractCode: "C002" })], [etl()], new Set(["C001"]));
  assert.deepEqual(
    out.map((p) => p.contractCode),
    ["C002"],
  );
});

test("พจร. (owner_type 2) ขึ้นก่อนประเภทอื่นเมื่อชั้นเท่ากัน — ไม่ตัดคนอื่นทิ้ง", () => {
  const [p] = proposeMatches(
    [partner()],
    [etl({ drivercode: "A1", ownerType: "พจส." }), etl({ drivercode: "B2", ownerType: "2.0" })],
  );
  assert.deepEqual(
    p.candidates.map((c) => c.drivercode),
    ["B2", "A1"],
  );
});

test("staffCode (MTM###) ไม่ใช่สัญญาณจับคู่ — ชนิดข้อมูลไม่มีช่องให้ส่งเข้ามาด้วยซ้ำ", () => {
  const p = partner() as PartnerCandidate & { staffCode?: string };
  p.staffCode = "D100";
  const [out] = proposeMatches([p], [etl({ name: "คนอื่น" })]);
  assert.deepEqual(out.candidates, []);
});

test("คำนำหน้าอังกฤษต้องจบคำ — ไม่กินต้นชื่อ", () => {
  assert.equal(normalizeName("Mrinal Sen"), "mrinal sen");
  assert.equal(normalizeName("Mr Mrinal Sen"), "mrinal sen");
});
