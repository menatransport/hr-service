import assert from "node:assert/strict";
import { test } from "node:test";

import { DuplicateLinkError, MAX_TIME_MS, createRepo, type RepoDeps } from "./repo";
import type { LinkDoc } from "./types";

/** คอลเลกชันปลอม — จดทุกคำสั่งไว้ตรวจ projection / limit / maxTimeMS */
function fakeCol(docs: Record<string, unknown>[], log: unknown[]) {
  return {
    find(filter: unknown, opts: { projection?: unknown } = {}) {
      const call: Record<string, unknown> = { op: "find", filter, projection: opts.projection };
      log.push(call);
      const cursor = {
        limit(n: number) {
          call.limit = n;
          return cursor;
        },
        maxTimeMS(n: number) {
          call.maxTimeMS = n;
          return cursor;
        },
        toArray: async () => docs,
      };
      return cursor;
    },
    async countDocuments(filter: Record<string, unknown>) {
      log.push({ op: "count", filter });
      return docs.some((d) => d.contractCode === filter.contractCode) ? 1 : 0;
    },
  };
}

function makeDeps(over: Partial<RepoDeps> = {}, log: unknown[] = []) {
  const links: LinkDoc[] = [];
  const linksCol = {
    find: fakeCol(links as never, log).find,
    async findOne(filter: { contractCode: string }) {
      return links.find((l) => l.contractCode === filter.contractCode) ?? null;
    },
    async insertOne(doc: LinkDoc) {
      if (links.some((l) => l.contractCode === doc.contractCode)) {
        throw Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
      }
      links.push(doc);
      return { acknowledged: true, insertedId: "x" };
    },
    async findOneAndDelete(filter: { contractCode: string }) {
      const i = links.findIndex((l) => l.contractCode === filter.contractCode);
      return i < 0 ? null : links.splice(i, 1)[0];
    },
  };
  const deps = {
    partnerDrivers: async () => fakeCol([{ contractCode: "MTM001", firstName: "ก", status: "active" }], log),
    partnerContracts: async () => fakeCol([{ contractCode: "MTM001", licensePlate: "71-1515" }], log),
    vehicles: async () => fakeCol([{ code: "V1", plate_no: "71-1515" }], log),
    etlMainDriver: async () => fakeCol([{ drivercode: "D1", idcard: "1234567890123" }], log),
    links: async () => linksCol,
    readEtlDrivers: async () => [{ drivercode: "D1", driverName: "ก", vehicleCode: "V1", active: true }],
    driverExists: async (c: string) => c === "D1",
    nationalIdField: null,
    ...over,
  } as unknown as RepoDeps;
  return { deps, links, log };
}

const link = (over: Partial<LinkDoc> = {}): LinkDoc => ({
  contractCode: "MTM001",
  drivercode: "D1",
  matchedBy: "name",
  confidence: "low",
  confirmedBy: "E1",
  confirmedByName: "ผู้ตรวจ",
  confirmedAt: new Date(0),
  ...over,
});

test("loadSources: ทุกคำสั่ง find มี projection + limit + maxTimeMS · ไม่อ่านเลขบัตร ETL เมื่อค่าตั้งเป็น null", async () => {
  const { deps, log } = makeDeps();
  const src = await createRepo(deps).loadSources();
  assert.equal(src.partnerDrivers.length, 1);
  assert.equal(src.vehicles.length, 1);
  const finds = log.filter((c) => (c as { op: string }).op === "find") as Record<string, unknown>[];
  assert.equal(finds.length, 3);
  for (const f of finds) {
    assert.ok(f.projection, "ต้องมี projection");
    assert.equal(typeof f.limit, "number");
    assert.equal(f.maxTimeMS, MAX_TIME_MS);
  }
  // vehicles ขอเฉพาะคันที่มีคนอ้าง
  assert.deepEqual(finds[2].filter, { $or: [{ code: { $in: ["V1"] } }, { plate_no: { $in: ["V1"] } }] });
});

test("loadSources: ตั้งชื่อฟิลด์เลขบัตรแล้ว — เติมเลขบัตรให้แถว ETL", async () => {
  const { deps } = makeDeps({ nationalIdField: "idcard" });
  const src = await createRepo(deps).loadSources();
  assert.equal(src.etlDrivers[0].nationalId, "1234567890123");
});

test("insertLink: ชน unique → DuplicateLinkError พร้อมคู่เดิม", async () => {
  const { deps } = makeDeps();
  const repo = createRepo(deps);
  await repo.insertLink(link());
  await assert.rejects(repo.insertLink(link({ drivercode: "D2" })), (e: unknown) => {
    assert.ok(e instanceof DuplicateLinkError);
    assert.equal(e.existing?.drivercode, "D1");
    return true;
  });
});

test("deleteLink: คืนแถวที่ลบ · ลบซ้ำได้ null", async () => {
  const { deps } = makeDeps();
  const repo = createRepo(deps);
  await repo.insertLink(link());
  assert.equal((await repo.deleteLink("MTM001"))?.drivercode, "D1");
  assert.equal(await repo.deleteLink("MTM001"), null);
});

test("contractExists อ่านจาก drivers.contractCode", async () => {
  const { deps } = makeDeps();
  const repo = createRepo(deps);
  assert.equal(await repo.contractExists("MTM001"), true);
  assert.equal(await repo.contractExists("MTM999"), false);
});
