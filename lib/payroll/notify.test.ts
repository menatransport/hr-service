import { test } from "node:test";
import assert from "node:assert/strict";

import { emptyRecord, type IntakeRecord } from "@/lib/payroll/intake-status";
import type { UserDto } from "@/lib/ncac/types";
import { bodyOf, intakeLink, notifyDraft, shortBodyOf, subjectOf } from "@/lib/payroll/notify";
import { itemsByOwner, OWNER_ORDER } from "@/lib/payroll/registry";

const period = { year: 2569, month: 8 };
const now = new Date(2026, 8, 12);

test("ลิงก์ชี้หน้าทะเบียนของรอบนั้น พร้อมฝ่ายที่ encode แล้ว", () => {
  const link = intakeLink("https://hr.example.com", period, "จัดส่ง ลาดกระบัง");
  assert.equal(
    link,
    "https://hr.example.com/payroll/intake?period=2026-09&owner=" +
      encodeURIComponent("จัดส่ง ลาดกระบัง"),
  );
});

test("ลิงก์ตัดเครื่องหมาย / ท้าย origin ออกก่อนต่อ path", () => {
  assert.ok(
    intakeLink("https://hr.example.com/", period, "HR C&B").startsWith(
      "https://hr.example.com/payroll/intake?",
    ),
  );
});

test("หัวเรื่องบอกรอบเป็น พ.ศ. และบอกว่าเป็นเรื่องอะไร", () => {
  const subject = subjectOf("ยานยนต์", period);
  assert.ok(subject.includes("ก.ย. 2569"));
  assert.ok(subject.includes("ยานยนต์"));
});

test("หัวเรื่องมีวันครบกำหนดเมื่อยังมีของค้าง", () => {
  const subject = subjectOf("ยานยนต์", period, { count: 3, overdue: 0, firstDueText: "3 ก.ย." });
  assert.ok(subject.includes("3 ก.ย."), subject);
});

test("มีของเลยกำหนด หัวเรื่องบอกจำนวนแทนวันครบกำหนด", () => {
  const subject = subjectOf("ยานยนต์", period, { count: 3, overdue: 2, firstDueText: "3 ก.ย." });
  assert.ok(subject.includes("เลยกำหนดแล้ว 2 รายการ"), subject);
});

test("ส่งครบแล้ว หัวเรื่องบอกว่าครบ ไม่ใช่ขอข้อมูล", () => {
  const subject = subjectOf("ยานยนต์", period, { count: 0, overdue: 0, firstDueText: "" });
  assert.ok(subject.includes("ครบแล้ว"), subject);
  assert.ok(!subject.includes("ขอข้อมูล"), subject);
});

test("ย่อหน้าเปิดบอกจำนวนที่ค้างกับวันครบกำหนดของชิ้นที่ใกล้ที่สุด", () => {
  const items = itemsByOwner("ยานยนต์");
  const body = bodyOf({ owner: "ยานยนต์", period, items, records: new Map(), link: "x", now });
  const opening = body.slice(0, body.indexOf("ของที่ต้องส่งในรอบนี้"));
  const soonest = Math.min(...items.map((i) => i.dueDay));
  assert.ok(opening.includes(`${items.length} รายการที่ต้องส่ง`), opening);
  assert.ok(opening.includes(`วันที่ ${soonest} ก.ย.`), opening);
});

test("ย่อหน้าเปิดเตือนของที่เลยกำหนด ไม่ปล่อยให้ไปเจอในรายการเอง", () => {
  const items = itemsByOwner("ยานยนต์");
  const late = new Date(2026, 8, 28); // ปลายเดือน ของทุกชิ้นเลยกำหนดแล้ว
  const body = bodyOf({ owner: "ยานยนต์", period, items, records: new Map(), link: "x", now: late });
  const opening = body.slice(0, body.indexOf("ของที่ต้องส่งในรอบนี้"));
  assert.ok(opening.includes(`เลยกำหนดมาแล้ว`), opening);
});

test("เมลบอกว่าส่งแล้วเกิดอะไรขึ้นต่อ และบอกช่องทางถาม", () => {
  const body = bodyOf({
    owner: "ยานยนต์",
    period,
    items: itemsByOwner("ยานยนต์"),
    records: new Map(),
    link: "x",
    now,
  });
  assert.ok(body.includes("ส่งแล้วเกิดอะไรขึ้นต่อ"));
  assert.ok(body.includes("HR จะตรวจอีกชั้นก่อนรับเข้ารอบ"));
  assert.ok(body.includes("ตอบเมลนี้มาได้เลย"));
});

test("เมลขึ้นต้นด้วยคำเรียนถึงฝ่ายนั้น และไม่เดาคำลงท้าย ครับ/ค่ะ ของคนส่ง", () => {
  for (const owner of OWNER_ORDER) {
    const body = bodyOf({
      owner,
      period,
      items: itemsByOwner(owner),
      records: new Map(),
      link: "x",
      now,
    });
    assert.ok(body.startsWith(`เรียน ผู้รับผิดชอบข้อมูลเงินเดือน — ${owner}`), owner);
    assert.equal(/ครับ|ค่ะ|คะ/.test(body), false, owner);
  }
});

test("เนื้อเมลเป็นข้อความล้วน มีลิงก์ รายการที่ต้องส่ง และวันครบกำหนด", () => {
  const items = itemsByOwner("ยานยนต์");
  const records = new Map<string, IntakeRecord>();
  const body = bodyOf({
    owner: "ยานยนต์",
    period,
    items,
    records,
    link: "https://hr.example.com/x",
    now,
  });
  assert.ok(!body.includes("<"), "ต้องไม่มี HTML");
  assert.ok(body.includes("https://hr.example.com/x"));
  for (const item of items) assert.ok(body.includes(item.title), `ต้องมี ${item.title}`);
  assert.ok(/ภายในวันที่ \d+/.test(body));
});

test("ของที่ส่งแล้วไม่ถูกทวงซ้ำในเมล และของที่ตีกลับขึ้นก่อน", () => {
  const items = itemsByOwner("ยานยนต์");
  const records = new Map<string, IntakeRecord>([
    [items[0].id, { ...emptyRecord(items[0].id), stage: "passed" }],
    [
      items[1].id,
      { ...emptyRecord(items[1].id), stage: "returned", returnedReason: "ยอดไม่ตรง" },
    ],
  ]);
  const body = bodyOf({ owner: "ยานยนต์", period, items, records, link: "x", now });

  const sendSection = body.slice(
    body.indexOf("ของที่ต้องส่งในรอบนี้"),
    body.indexOf("ของที่ตีกลับให้แก้"),
  );
  assert.ok(!sendSection.includes(items[0].title), "ของที่ผ่านแล้วต้องไม่อยู่ในรายการที่ต้องส่ง");
  assert.ok(!sendSection.includes(items[1].title), "ของที่ตีกลับไปอยู่หมวดของมันเอง");
  assert.ok(body.includes("ของที่รับเข้ารอบแล้ว ไม่ต้องส่งซ้ำ"));
  assert.ok(body.includes(`- #${items[1].id} ${items[1].title}: ยอดไม่ตรง`), "ต้องบอกเหตุผลที่ตีกลับไว้ในเมล");
  assert.ok(
    body.indexOf("ของที่ตีกลับให้แก้") > 0 &&
      body.indexOf("ของที่ตีกลับให้แก้") < body.indexOf("ของที่รับเข้ารอบแล้ว"),
  );
});

test("ของที่ส่งแล้วรอ HR ตรวจ ไม่ถูกนับเป็นของที่ต้องส่ง", () => {
  const items = itemsByOwner("ยานยนต์");
  const records = new Map<string, IntakeRecord>([
    [items[0].id, { ...emptyRecord(items[0].id), stage: "submitted" }],
  ]);
  const body = bodyOf({ owner: "ยานยนต์", period, items, records, link: "x", now });
  const sendSection = body.slice(
    body.indexOf("ของที่ต้องส่งในรอบนี้"),
    body.indexOf("ของที่ส่งแล้ว รอตรวจ"),
  );
  assert.ok(!sendSection.includes(items[0].title));
  assert.ok(body.includes("ของที่ส่งแล้ว รอตรวจ"));
});

test("ไม่มีอะไรค้างเลย เนื้อเมลบอกตรง ๆ ไม่ใช่ปล่อยหัวข้อว่าง", () => {
  const items = itemsByOwner("ยานยนต์");
  const records = new Map<string, IntakeRecord>(
    items.map((i) => [i.id, { ...emptyRecord(i.id), stage: "passed" as const }]),
  );
  const body = bodyOf({ owner: "ยานยนต์", period, items, records, link: "x", now });
  assert.ok(body.includes("ไม่มีรายการค้างส่ง"));
  assert.ok(!body.includes("ส่งข้อมูลได้ที่ลิงก์นี้"), "ต้องไม่ชวนส่งในเมลที่ไม่มีอะไรค้าง");
  assert.ok(body.includes("ส่งเข้าระบบครบแล้ว"), body);
  assert.ok(!body.includes("ส่งแล้วเกิดอะไรขึ้นต่อ"), "ไม่มีอะไรค้างก็ไม่ต้องอธิบายขั้นตอนการส่ง");
});

test("รายการนำหน้าด้วยรหัสในทะเบียน ไม่ใช่เลขลำดับ", () => {
  const items = itemsByOwner("ยานยนต์");
  const body = bodyOf({ owner: "ยานยนต์", period, items, records: new Map(), link: "x", now });
  for (const item of items) assert.ok(body.includes(`#${item.id} ${item.title}`));
  assert.ok(!/^1\. /m.test(body));
});

test("ไม่มี emoji ในเนื้อเมลของทุกฝ่าย และไม่ขึ้นต้นทุกบรรทัดด้วย กรุณา", () => {
  for (const owner of OWNER_ORDER) {
    const body = bodyOf({
      owner,
      period,
      items: itemsByOwner(owner),
      records: new Map(),
      link: "x",
      now,
    });
    assert.equal(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(body), false, owner);
    const lines = body.split("\n").filter(Boolean);
    assert.ok(lines.filter((l) => l.startsWith("กรุณา")).length < lines.length / 4, owner);
  }
});

test("เนื้อย่อสำหรับ URL ที่ยาวเกิน ยังมีลิงก์และไม่มีรายการยาว", () => {
  const items = itemsByOwner("จัดส่ง ลาดกระบัง");
  const short = shortBodyOf({
    owner: "จัดส่ง ลาดกระบัง",
    period,
    items,
    records: new Map(),
    link: "https://x/y",
    now,
  });
  const full = bodyOf({
    owner: "จัดส่ง ลาดกระบัง",
    period,
    items,
    records: new Map(),
    link: "https://x/y",
    now,
  });
  assert.ok(short.includes("https://x/y"));
  assert.ok(short.length < full.length);
  /* ย่อแล้วยังต้องตัดสินใจได้: ค้างกี่ชิ้น ชิ้นแรกครบกำหนดเมื่อไหร่ */
  assert.ok(short.includes(`${items.length} รายการที่ต้องส่ง`), short);
  assert.ok(short.includes(`วันที่ ${Math.min(...items.map((i) => i.dueDay))} ก.ย.`), short);
  for (const item of items) assert.ok(!short.includes(item.title), "ฉบับย่อไม่ลงรายชิ้น");
});

/* ---- ผู้รับ: ส่งสมุดรายชื่อปลอมเข้าไปตรง ๆ ไม่แตะ NCAC ---- */

const user = (id: string, level: string, dept: number, email: string): UserDto =>
  ({
    id: Number(id),
    employee_id: id,
    firstname: `คน${id}`,
    lastname: "ทดสอบ",
    email,
    department: "x",
    position: level,
    position_level: level,
    site: "x",
    employee_status: "Active",
    department_id: dept,
  }) as UserDto;

const draftFor = (owner: Parameters<typeof notifyDraft>[0]["owner"], users: UserDto[]) =>
  notifyDraft({
    owner,
    period,
    origin: "https://hr.example.com",
    records: new Map(),
    now,
    users,
  });

test("TO = หัวหน้า CC = ผู้จัดการ ของฝ่ายนั้น ไม่ปนฝ่ายอื่น", async () => {
  const d = await draftFor("ยานยนต์", [
    user("1", "Supervisor", 3, "sup@x.co"),
    user("2", "Manager", 3, "mgr@x.co"),
    user("3", "Supervisor", 15, "other@x.co"),
  ]);
  assert.deepEqual(d.to, ["sup@x.co"]);
  assert.deepEqual(d.cc, ["mgr@x.co"]);
  assert.equal(d.directoryMissing, false);
});

test("ฝ่ายที่ไม่มีหัวหน้า ผู้จัดการขึ้นเป็น TO", async () => {
  const d = await draftFor("ยานยนต์", [user("2", "Manager", 3, "mgr@x.co")]);
  assert.deepEqual(d.to, ["mgr@x.co"]);
  assert.deepEqual(d.cc, []);
});

test("ฝ่ายที่ยังไม่มีรหัสหน่วยงาน ได้ร่างที่ใช้ได้ ผู้รับว่าง และติดธง directoryMissing", async () => {
  const d = await draftFor("บัญชี กรุงเทพ", [user("1", "Supervisor", 3, "sup@x.co")]);
  assert.equal(d.directoryMissing, true);
  assert.deepEqual(d.to, []);
  assert.deepEqual(d.cc, []);
  assert.ok(d.subject.includes("บัญชี กรุงเทพ"));
  assert.ok(d.body.includes(d.link));
});
