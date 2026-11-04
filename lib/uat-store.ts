import type { Document, ObjectId } from "mongodb";
import { unstable_rethrow } from "next/navigation";

import { readSessionUser } from "./auth/session";
import { hrCol } from "./db";
import {
  UAT_CODE_PREFIX,
  UAT_TEAMS,
  uatCase,
  uatTeam,
  waitingFor,
  type MyUat,
  type UatBoard,
  type UatResult,
  type UatStatus,
  type UatTeamId,
  type UatTester,
} from "./uat";

/**
 * ชั้นข้อมูลของ UAT ชั่วคราว — **ฝั่งเซิร์ฟเวอร์เท่านั้น** (รายการทดสอบอยู่ที่ `lib/uat.ts`)
 *
 * - `uat_setup` แถวเดียว `_id: "registry-lkb"` = สวิตช์เปิด/ปิด + ผู้ทดสอบรายฝ่าย
 * - `uat_results` หนึ่งแถวต่อ ข้อ × ผู้ทดสอบ (`_id` = `<caseId>:<employeeId>`) — กดซ้ำ = เปลี่ยนผล · กดยกเลิก = ลบแถว
 *
 * จบ UAT แล้วลบสองคอลเลกชันนี้ทิ้งได้ทั้งก้อน ไม่มีที่อื่นอ้างถึง
 */

const SETUP_ID = "registry-lkb";
const NOTE_MAX = 500;

interface SetupDoc {
  _id: string;
  active: boolean;
  testers: Partial<Record<UatTeamId, UatTester[]>>;
  updatedAt: string;
  updatedBy: string;
}

interface ResultDoc extends UatResult {
  _id: string;
  team: UatTeamId;
  name: string;
}

export class UatError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const emptyTesters = () =>
  Object.fromEntries(UAT_TEAMS.map((t) => [t.id, [] as UatTester[]])) as Record<UatTeamId, UatTester[]>;

async function readSetup(): Promise<SetupDoc | null> {
  return (await hrCol<SetupDoc>("uatSetup")).findOne({ _id: SETUP_ID });
}

export async function getUatBoard(): Promise<UatBoard> {
  const [setup, results] = await Promise.all([
    readSetup(),
    hrCol<ResultDoc>("uatResults").then((c) => c.find({}).sort({ at: -1 }).toArray()),
  ]);
  return {
    active: setup?.active ?? false,
    testers: { ...emptyTesters(), ...(setup?.testers ?? {}) },
    results: results.map(({ caseId, employeeId, status, note, at }) => ({
      caseId,
      employeeId,
      status,
      note,
      at,
    })),
  };
}

async function actorName(): Promise<{ employeeId: string; name: string }> {
  const user = await readSessionUser();
  if (!user) throw new UatError("ต้องเข้าสู่ระบบก่อน", 401);
  return { employeeId: user.employeeId, name: user.name };
}

export async function setUatActive(active: boolean): Promise<UatBoard> {
  const by = await actorName();
  await (
    await hrCol<SetupDoc>("uatSetup")
  ).updateOne(
    { _id: SETUP_ID },
    {
      $set: { active, updatedAt: new Date().toISOString(), updatedBy: by.name },
    },
    { upsert: true },
  );
  return getUatBoard();
}

const text = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function saveTeamTesters(teamId: unknown, raw: unknown): Promise<UatBoard> {
  const team = uatTeam(String(teamId ?? ""));
  if (!team) throw new UatError("ไม่รู้จักฝ่ายนี้");
  if (!Array.isArray(raw)) throw new UatError("รายชื่อผู้ทดสอบไม่ถูกต้อง");

  const seen = new Set<string>();
  const testers: UatTester[] = [];
  for (const row of raw as Record<string, unknown>[]) {
    const employeeId = text(row?.employeeId, 40);
    if (!employeeId || seen.has(employeeId)) continue;
    seen.add(employeeId);
    testers.push({
      employeeId,
      name: text(row.name) || employeeId,
      position: text(row.position),
      imageUrl: text(row.imageUrl, 500) || null,
    });
  }

  const by = await actorName();
  await (
    await hrCol<SetupDoc>("uatSetup")
  ).updateOne(
    { _id: SETUP_ID },
    {
      $set: {
        [`testers.${team.id}`]: testers,
        updatedAt: new Date().toISOString(),
        updatedBy: by.name,
      },
      $setOnInsert: { active: false },
    },
    { upsert: true },
  );
  return getUatBoard();
}

/* --------------------------------------------------------------- แผงมุมขวาล่าง */

/**
 * UAT ของผู้ใช้คนนี้ — `null` = ไม่ต้องแสดงแผง (ปิด UAT อยู่ / ไม่ได้เป็นผู้ทดสอบ / ฐานล่ม)
 * · ล้มแล้วคืน `null` เงียบ ๆ แผงทดสอบหายดีกว่าหน้าทั้งหน้าพัง
 */
export async function getMyUat(): Promise<MyUat | null> {
  try {
    const user = await readSessionUser();
    if (!user) return null;
    const setup = await readSetup();
    if (!setup?.active) return null;
    const teams = UAT_TEAMS.filter((t) => setup.testers?.[t.id]?.some((x) => x.employeeId === user.employeeId)).map(
      (t) => t.id,
    );
    if (!teams.length) return null;
    const col = await hrCol<ResultDoc>("uatResults");
    const [rows, passed] = await Promise.all([
      col.find({ employeeId: user.employeeId }).toArray(),
      col.distinct("caseId", { status: "pass" }),
    ]);
    return {
      passed: passed.map(String),
      teams,
      results: rows.map(({ caseId, employeeId, status, note, at }) => ({
        caseId,
        employeeId,
        status,
        note,
        at,
      })),
    };
  } catch (err) {
    unstable_rethrow(err); // สัญญาณภายในของ Next (dynamic/redirect) ต้องโยนต่อ ห้ามกลืน
    console.error("[uat]", err);
    return null;
  }
}

/** ผู้ใช้คนนี้เป็นผู้ทดสอบของฝ่ายนี้ไหม (และ UAT เปิดอยู่) — กันยิง API ข้ามฝ่าย */
async function assertTester(teamId: UatTeamId): Promise<{ employeeId: string; name: string }> {
  const by = await actorName();
  const setup = await readSetup();
  if (!setup?.active) throw new UatError("UAT ปิดอยู่", 403);
  if (!setup.testers?.[teamId]?.some((x) => x.employeeId === by.employeeId)) {
    throw new UatError("คุณไม่ได้เป็นผู้ทดสอบของฝ่ายนี้", 403);
  }
  return by;
}

/** บันทึกผลหนึ่งข้อของตัวเอง — `status: null` = ยกเลิกผล */
export async function saveMyResult(caseId: unknown, status: unknown, note: unknown): Promise<MyUat | null> {
  const found = uatCase(String(caseId ?? ""));
  if (!found) throw new UatError("ไม่รู้จักข้อทดสอบนี้");
  const by = await assertTester(found.team.id);
  const col = await hrCol<ResultDoc>("uatResults");
  const _id = `${found.item.id}:${by.employeeId}`;

  if (status === null) {
    await col.deleteOne({ _id });
  } else {
    if (status !== "pass" && status !== "fail") throw new UatError("ผลทดสอบไม่ถูกต้อง");
    if (status === "pass") {
      const passed = new Set((await col.distinct("caseId", { status: "pass" })).map(String));
      const waiting = waitingFor(found.item, passed);
      if (waiting.length) {
        throw new UatError(`ต้องรอ ${waiting.map((w) => `${w.team.short} · ${w.item.title}`).join(", ")} ผ่านก่อน`, 409);
      }
    }
    const doc: ResultDoc = {
      _id,
      caseId: found.item.id,
      team: found.team.id,
      employeeId: by.employeeId,
      name: by.name,
      status: status as UatStatus,
      note: text(note, NOTE_MAX),
      at: new Date().toISOString(),
    };
    await col.replaceOne({ _id }, doc, { upsert: true });
  }
  return getMyUat();
}

/** ผู้สมัครทดสอบ — สร้างจากปุ่มบนหน้า `/desk/uat` (คนที่เข้าหน้านี้ได้) ไม่ต้องเป็นผู้ทดสอบ */
export async function assertUatManager(): Promise<{
  employeeId: string;
  name: string;
}> {
  return actorName();
}

/* --------------------------------------------------------------- ล้างข้อมูล UAT */

/**
 * ล้างทุกอย่างที่ UAT สร้างไว้ในฐานจริง — ปุ่ม “ล้างข้อมูล UAT” บน `/desk/uat`
 *
 * - ใบสมัครทดสอบ (มีคีย์ `uat`) → ลบ
 * - คำขอสรรหาที่ **หมายเหตุขึ้นต้น “UAT”** และไม่เคยผูกคนจริง → ลบ (กติกาของผู้ทดสอบ KA ตอนขออัตรา)
 * - คำขอจริงที่ผูกผู้สมัครทดสอบ → ปลดผูก ล้างข้อมูลฝึกงานของคนทดสอบ กลับเป็นเปิดรับ (ยกเลิกแล้วคงยกเลิก)
 * - คนทดสอบในทะเบียนประวัติ (รหัสขึ้นต้น `UAT` ที่ออกตอนรับรถ **หรือชื่อขึ้นต้น `UAT-`** — ผู้ทดสอบ
 *   กรอกรหัสจริง/มั่ว เช่น `0000` `5555` ได้ · 4 พ.ย. 2569) + ตารางรายวันของรหัสนั้น → ลบ
 * - ผลทดสอบทั้งหมด → ลบ · **ผู้ทดสอบกับสวิตช์คงไว้**
 *
 * ก่อนลบเก็บสำเนาทั้งหมดลง `uat_trash` (บน Vercel ไม่มีดิสก์ให้เขียนไฟล์สำรอง)
 */
export interface UatClearPlan {
  applications: number;
  requisitionsDeleted: number;
  requisitionsReset: number;
  /** คนทดสอบในทะเบียนประวัติ (รหัสขึ้นต้น UAT) */
  drivers: number;
  results: number;
}

type Doc = Document & { _id: ObjectId };

const isUatNote = (note: unknown) => typeof note === "string" && /^\s*uat/i.test(note);
/** รหัส พจส. ทดสอบ (`uatDriverCode`) — คนทดสอบที่รับรถแล้วเข้าทะเบียน + ตารางรายวันของเขา */
const UAT_CODE = { drivercode: { $regex: new RegExp(`^${UAT_CODE_PREFIX}`) } };
/** คนทดสอบในทะเบียน — รหัส UAT หรือชื่อ `UAT-` (ชื่อจากใบสมัครที่สุ่ม `createUatApplication`) */
const UAT_DRIVER = { $or: [UAT_CODE, { driverName: { $regex: /^\s*UAT-/ } }] };

async function planClear() {
  const [apps, rqs, results, drivers, daily] = await Promise.all([
    hrCol<Doc>("applications"),
    hrCol<Doc>("requisitions"),
    hrCol<ResultDoc>("uatResults"),
    hrCol<Doc>("drivers"),
    hrCol<Doc>("traineeDaily"),
  ]);
  const appDocs = await apps.find({ uat: { $exists: true } }).toArray();
  const ids = appDocs.map((d) => d._id.toHexString());

  const touched = await rqs
    .find({
      $or: [
        { note: { $regex: /^\s*uat/i } },
        { "match.applicationId": { $in: ids } },
        { "pastOnboarding.applicationId": { $in: ids } },
      ],
    })
    .toArray();

  /* ผูกคนจริงอยู่/เคยผูก = ห้ามลบทั้งใบ แม้หมายเหตุขึ้นต้น UAT */
  const realPerson = (r: Doc) =>
    (r.match?.applicationId && !ids.includes(r.match.applicationId)) ||
    (r.pastOnboarding ?? []).some((p: { applicationId?: string }) => p.applicationId && !ids.includes(p.applicationId));
  const toDelete = touched.filter((r) => isUatNote(r.note) && !realPerson(r));
  const toReset = touched.filter((r) => !toDelete.includes(r));
  const driverDocs = await drivers.find(UAT_DRIVER).toArray();
  /* ตารางรายวันของคนทดสอบ — ตามรหัสที่เจอจริง ไม่ใช่แค่รหัสขึ้นต้น UAT */
  const dailyFilter = { $or: [UAT_CODE, { drivercode: { $in: driverDocs.map((d) => d.drivercode) } }] };

  return {
    apps,
    rqs,
    results,
    drivers,
    daily,
    driverDocs,
    dailyFilter,
    appDocs,
    ids,
    toDelete,
    toReset,
    resultCount: await results.countDocuments(),
  };
}

export async function previewUatClear(): Promise<UatClearPlan> {
  const p = await planClear();
  return {
    applications: p.appDocs.length,
    requisitionsDeleted: p.toDelete.length,
    requisitionsReset: p.toReset.length,
    drivers: p.driverDocs.length,
    results: p.resultCount,
  };
}

export async function clearUatData(): Promise<UatClearPlan> {
  const by = await actorName();
  const p = await planClear();
  const at = new Date().toISOString();

  await (
    await hrCol<Document>("uatTrash")
  ).insertOne({
    at,
    by: by.name,
    applications: p.appDocs,
    requisitionsDeleted: p.toDelete,
    requisitionsBeforeReset: p.toReset,
    drivers: p.driverDocs,
    traineeDaily: await p.daily.find(p.dailyFilter).toArray(),
    results: await p.results.find({}).toArray(),
  });

  for (const r of p.toReset) {
    const mine = r.match?.applicationId && p.ids.includes(r.match.applicationId);
    const set: Document = { updatedAt: at };
    if (mine) {
      Object.assign(set, {
        match: null,
        status: r.status === "cancelled" ? "cancelled" : "open",
        filledOn: "",
        drivercode: "",
        onboarding: {},
      });
    }
    await p.rqs.updateOne(
      { _id: r._id },
      {
        $set: set,
        $pull: {
          pastOnboarding: { applicationId: { $in: p.ids } },
        } as Document,
        $push: {
          history: {
            at,
            by: by.name,
            from: r.status,
            to: (set.status as string | undefined) ?? r.status,
            note: "ล้างข้อมูล UAT",
          },
        } as Document,
      },
    );
  }
  if (p.toDelete.length) await p.rqs.deleteMany({ _id: { $in: p.toDelete.map((r) => r._id) } });
  if (p.appDocs.length) await p.apps.deleteMany({ _id: { $in: p.appDocs.map((d) => d._id) } });
  if (p.driverDocs.length) await p.drivers.deleteMany({ _id: { $in: p.driverDocs.map((d) => d._id) } });
  await p.daily.deleteMany(p.dailyFilter);
  await p.results.deleteMany({});

  return {
    applications: p.appDocs.length,
    requisitionsDeleted: p.toDelete.length,
    requisitionsReset: p.toReset.length,
    drivers: p.driverDocs.length,
    results: p.resultCount,
  };
}
