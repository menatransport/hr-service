import assert from "node:assert/strict";
import { test } from "node:test";

import { safeNextPath, signSession, verifySession, type SessionUser } from "./token";

process.env.AUTH_SECRET = "test-secret";

const base: SessionUser = {
  employeeId: "E001",
  username: "e001",
  name: "สมชาย ใจดี",
  firstName: "สมชาย",
  position: "—",
  department: "—",
  departmentId: null,
  positionLevel: null,
  site: "—",
  imageUrl: null,
};

test("คุกกี้เก่าที่ไม่มีอีเมลยังอ่านได้ (email = undefined)", async () => {
  const raw = await signSession({ user: base, token: "t", exp: Date.now() + 60_000 });
  const payload = await verifySession(raw);
  assert.equal(payload?.user.employeeId, "E001");
  assert.equal(payload?.user.email, undefined);
});

test("คุกกี้ใหม่พกอีเมลมาได้", async () => {
  const raw = await signSession({
    user: { ...base, email: "somchai@menatransport.co.th" },
    token: "t",
    exp: Date.now() + 60_000,
  });
  assert.equal((await verifySession(raw))?.user.email, "somchai@menatransport.co.th");
});

test("แก้อีเมลในคุกกี้หลังเซ็น → ลายเซ็นไม่ตรง = null", async () => {
  const raw = await signSession({ user: { ...base, email: "a@menatransport.co.th" }, token: "t", exp: Date.now() + 60_000 });
  const [, sig] = raw.split(".");
  const forged = Buffer.from(JSON.stringify({ user: { ...base, email: "boss@menatransport.co.th" }, token: "t", exp: Date.now() + 60_000 }))
    .toString("base64url");
  assert.equal(await verifySession(`${forged}.${sig}`), null);
});

test("safeNextPath รับ /partner/** แต่ไม่รับชื่อคล้าย/ลิงก์ออกนอกเว็บ", () => {
  assert.equal(safeNextPath("/partner"), "/partner");
  assert.equal(safeNextPath("/partner/contracts?x=1"), "/partner/contracts?x=1");
  assert.equal(safeNextPath("/partnerx"), null);
  assert.equal(safeNextPath("//evil.com"), null);
  assert.equal(safeNextPath("/desk/cases"), "/desk/cases");
  assert.equal(safeNextPath("/trucks"), null);
});
