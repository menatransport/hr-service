import assert from "node:assert/strict";
import { test } from "node:test";

import type { SessionUser } from "@/lib/auth/token";

import { confirmLink, getOverview, parseConfirmBody, unlink, type ApiDeps } from "./api";
import { DuplicateLinkError } from "./repo";
import type { LinkDoc } from "./types";

const USER = { employeeId: "E42", name: "สมใจ ตรวจดี" } as SessionUser;

function deps(over: Partial<ApiDeps["repo"]> = {}, user: SessionUser | null = USER) {
  const store: LinkDoc[] = [];
  const audits: Record<string, unknown>[] = [];
  const d: ApiDeps = {
    readUser: async () => user,
    now: () => new Date("2026-10-19T10:00:00Z"),
    audit: (e) => {
      audits.push(e);
    },
    repo: {
      loadSources: async () => ({ partnerDrivers: [], contracts: [], etlDrivers: [], vehicles: [] }),
      listLinks: async () => store,
      contractExists: async (c) => c.startsWith("MTM"),
      driverExists: async (c) => c.startsWith("D"),
      findLink: async (c) => store.find((l) => l.contractCode === c) ?? null,
      insertLink: async (l) => {
        const existing = store.find((x) => x.contractCode === l.contractCode);
        if (existing) throw new DuplicateLinkError(l.contractCode, existing);
        store.push(l);
      },
      deleteLink: async (c) => {
        const i = store.findIndex((l) => l.contractCode === c);
        return i < 0 ? null : store.splice(i, 1)[0];
      },
      ...over,
    },
  };
  return { d, store, audits };
}

const body = { contractCode: "MTM001", drivercode: "D1", matchedBy: "name", confidence: "low" };

test("ไม่มี session = 401 ทุกเส้น รวม GET", async () => {
  const { d } = deps({}, null);
  assert.equal((await getOverview(d)).status, 401);
  assert.equal((await confirmLink(d, body)).status, 401);
  assert.equal((await unlink(d, "MTM001")).status, 401);
});

test("ยืนยันคู่: ผู้ยืนยันมาจาก session ไม่ใช่ body", async () => {
  const { d, store } = deps();
  const res = await confirmLink(d, { ...body, confirmedBy: "แอบอ้าง", confirmedByName: "ปลอม" });
  assert.equal(res.status, 201);
  assert.equal(store[0].confirmedBy, "E42");
  assert.equal(store[0].confirmedByName, "สมใจ ตรวจดี");
  assert.equal(store[0].confirmedAt.toISOString(), "2026-10-19T10:00:00.000Z");
});

test("ยืนยันซ้ำสัญญาเดิม = 409 พร้อมบอกว่าจับกับใครไว้", async () => {
  const { d } = deps();
  await confirmLink(d, body);
  const res = await confirmLink(d, { ...body, drivercode: "D2" });
  assert.equal(res.status, 409);
  assert.match((res.body as { error: string }).error, /D1/);
});

test("สัญญา/รหัส พจส. ที่ไม่มีจริง = 404 · รูปแบบผิด = 400", async () => {
  const { d } = deps();
  assert.equal((await confirmLink(d, { ...body, contractCode: "XX1" })).status, 404);
  assert.equal((await confirmLink(d, { ...body, drivercode: "Z9" })).status, 404);
  assert.equal((await confirmLink(d, { ...body, matchedBy: "staffCode" })).status, 400);
  assert.equal((await confirmLink(d, { ...body, contractCode: "" })).status, 400);
  assert.equal((await confirmLink(d, null)).status, 400);
});

test("กรอกรหัสเอง: ต้องมีหมายเหตุ และความมั่นใจถูกตั้งเป็น low เสมอ", () => {
  assert.equal(typeof parseConfirmBody({ ...body, matchedBy: "manual" }), "string");
  const ok = parseConfirmBody({ ...body, matchedBy: "manual", confidence: "high", note: "หัวหน้าคิวยืนยัน" });
  assert.equal(typeof ok, "object");
  assert.equal((ok as { confidence: string }).confidence, "low");
});

test("ปลดคู่: ลบแถว + จด log ว่าใครปลด · ไม่มีคู่ = 404", async () => {
  const { d, store, audits } = deps();
  await confirmLink(d, body);
  const res = await unlink(d, "MTM001");
  assert.equal(res.status, 200);
  assert.equal(store.length, 0);
  const un = audits.find((a) => a.action === "unlink")!;
  assert.equal(un.by, "E42");
  assert.equal(un.drivercode, "D1");
  assert.equal((await unlink(d, "MTM001")).status, 404);
});

test("ยืนยันคู่จดประวัติ action=confirm พร้อมผู้ยืนยันจาก session", async () => {
  const { d, audits } = deps();
  assert.equal((await confirmLink(d, body)).status, 201);
  assert.deepEqual(
    audits.map((a) => [a.action, a.contractCode, a.by]),
    [["confirm", "MTM001", "E42"]],
  );
});

test("จดประวัติล้ม ไม่ทำให้ยืนยัน/ปลดคู่ล้ม", async () => {
  const { d } = deps();
  d.audit = async () => {
    throw new Error("ฐานล่ม");
  };
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal((await confirmLink(d, body)).status, 201);
    assert.equal((await unlink(d, "MTM001")).status, 200);
  } finally {
    console.warn = warn;
  }
});

test("ยืนยันซ้ำที่ชน 409 ไม่จดประวัติ confirm", async () => {
  const { d, audits } = deps();
  await confirmLink(d, body);
  assert.equal((await confirmLink(d, body)).status, 409);
  assert.equal(audits.filter((a) => a.action === "confirm").length, 1);
});

test("GET ภาพรวมคืนข้อเสนอ/ตัวเลข/ขัดแย้ง", async () => {
  const { d } = deps();
  const res = await getOverview(d);
  assert.equal(res.status, 200);
  const o = res.body as { headcount: { total: number }; proposals: unknown[] };
  assert.equal(o.headcount.total, 0);
  assert.deepEqual(o.proposals, []);
});
