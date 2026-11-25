import { hrCol } from "@/lib/db";
import { getDriver, getResignedDriverList, todayInBangkok, toIsoDate } from "@/app/recruitment/_lib/drivers/registry";
import type { DriverRecord } from "@/app/recruitment/_lib/drivers/types";
import { getResignMaster, pickResignReason } from "@/app/recruitment/_lib/resign-reasons/store";
import { controllableLabel, exitTypeLabel } from "@/app/recruitment/_lib/resign-reasons/types";
import {
  addDaysISO,
  emptyInterview,
  Q1_BANDS,
  stageOf,
  tenureBand,
  tenureDays,
  WAVE2_DUE_DAYS,
  type ContactAttempt,
  type DataLogRow,
  type ExitInterview,
  type ExitInterviewBundle,
  type InterviewDriverRef,
  type InterviewOutcome,
  type InterviewSummaryRow,
  type JobMatch,
  type YesNoUnsure,
} from "./types";
import { deriveReference, fillReference } from "./derive";

/**
 * Exit Interview — **ฝั่งเซิร์ฟเวอร์เท่านั้น** · ทุกเส้นต้องผ่าน `canAccessMenuStrict("exit-interview")` ก่อนเรียก
 *
 * `hr_service.driver_exit_interview` หนึ่งแถวต่อการพ้นสภาพหนึ่งครั้ง (`drivercode` + `exitDateISO`)
 * — กลับมาทำงานแล้วออกอีกรอบได้แถวใหม่ ของรอบเก่าไม่หาย
 *
 * รหัสสาเหตุหลัก/รองเขียนลง `master_driver.resignation` (แหล่งเดียวที่ทะเบียน/แดชบอร์ด/ส่งออกอ่าน)
 * ส่วนคำตอบอยู่ที่นี่ที่เดียว
 */

export class ExitInterviewError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

type InterviewDoc = Omit<ExitInterview, "updatedAt"> & { updatedAt: Date };

const MAX_TEXT = 2000;
const MAX_SHORT = 120;

async function col() {
  return hrCol<InterviewDoc>("exitInterviews");
}

/* ------------------------------------------------------------------ อ่าน */

function refOf(d: DriverRecord): InterviewDriverRef {
  const r = d.resignation!;
  const days = tenureDays(d.startDateISO, r.dateISO);
  return {
    drivercode: d.drivercode,
    name: d.name,
    phone: d.phone,
    ownerTypeLabel: d.ownerTypeLabel,
    position: d.position,
    customer: d.customer,
    plant: d.plant,
    siteLabel: d.siteLabel,
    startDateISO: d.startDateISO,
    exitDateISO: r.dateISO,
    tenureDays: days,
    tenureBand: tenureBand(days),
    reasonCode: r.reasonCode,
    reasonLabel: r.reasonLabel,
    exitType: r.exitType,
    secondaryCodes: r.secondaryCodes,
    note: r.note,
  };
}

function fromDoc(doc: InterviewDoc | null, drivercode: string, exitDateISO: string): ExitInterview {
  const base = emptyInterview(drivercode, exitDateISO);
  if (!doc) return base;
  return {
    ...base,
    ...doc,
    reference: { ...base.reference, ...doc.reference },
    wave1: { ...base.wave1, ...doc.wave1 },
    wave2: { ...base.wave2, ...doc.wave2 },
    income: { ...base.income, ...doc.income },
    contacts: doc.contacts ?? [],
    reasonHistory: doc.reasonHistory ?? [],
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : String(doc.updatedAt ?? ""),
  };
}

/** คนที่สัมภาษณ์ได้ = พ้นสภาพแบบ `resign` (ไม่ใช่ย้ายไปรถร่วม/พจส.) และมีวันที่พ้นสภาพ */
async function interviewable(code: string): Promise<DriverRecord> {
  const driver = await getDriver(code.trim());
  if (!driver) throw new ExitInterviewError(`ไม่พบรหัส ${code} ในทะเบียนประวัติ`, 404);
  if (driver.active || !driver.resignation || driver.resignation.kind !== "resign")
    throw new ExitInterviewError("Exit Interview ใช้ได้กับพนักงานที่พ้นสภาพแล้วเท่านั้น (ไม่รวมย้ายไปรถร่วม/พจส.)");
  return driver;
}

export async function getExitInterview(code: string): Promise<ExitInterviewBundle> {
  const driver = await interviewable(code);
  const exitDateISO = driver.resignation!.dateISO;
  const doc = await (await col()).findOne({ drivercode: driver.drivercode, exitDateISO });
  const interview = fromDoc(doc, driver.drivercode, exitDateISO);
  interview.reference = fillReference(interview.reference, await deriveReference(driver));
  return {
    driver: refOf(driver),
    interview,
    stage: stageOf(doc ? interview : null, exitDateISO, todayInBangkok()),
    saved: Boolean(doc),
  };
}

/**
 * สถานะต่อคนของแท็บพ้นสภาพ — คู่ `drivercode` + วันที่พ้นสภาพที่หน้าจอส่งมา (ไม่มีคำตอบติดไปด้วย)
 * คนที่ยังไม่มีแถว = `pending`
 */
export async function getInterviewSummaries(
  exits: { drivercode: string; exitDateISO: string }[],
): Promise<InterviewSummaryRow[]> {
  if (!exits.length) return [];
  const docs = await (await col())
    .find(
      { drivercode: { $in: [...new Set(exits.map((e) => e.drivercode))] } },
      { projection: { drivercode: 1, exitDateISO: 1, outcome: 1, wave1: 1, wave2: 1, safetyFlag: 1 } },
    )
    .toArray();
  const byKey = new Map(docs.map((d) => [`${d.drivercode}|${d.exitDateISO}`, d]));
  const today = todayInBangkok();
  return exits.map(({ drivercode, exitDateISO }) => {
    const d = byKey.get(`${drivercode}|${exitDateISO}`);
    return {
      drivercode,
      exitDateISO,
      stage: stageOf(d ? fromDoc(d, drivercode, exitDateISO) : null, exitDateISO, today),
      wave2DueISO: addDaysISO(exitDateISO, WAVE2_DUE_DAYS),
      safetyFlag: Boolean(d?.safetyFlag),
    };
  });
}

/** ทุกแถวของรายการที่ระบุ (ใช้ตอนส่งออก DataLog) */
export async function getInterviewsFor(
  exits: { drivercode: string; exitDateISO: string }[],
): Promise<Map<string, ExitInterview>> {
  const docs = await (await col())
    .find({ drivercode: { $in: [...new Set(exits.map((e) => e.drivercode))] } })
    .toArray();
  return new Map(docs.map((d) => [`${d.drivercode}|${d.exitDateISO}`, fromDoc(d, d.drivercode, d.exitDateISO)]));
}

/* ------------------------------------------------------------ ตรวจค่าที่ส่งมา */

function text(v: unknown, max = MAX_TEXT): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length > max) throw new ExitInterviewError(`ข้อความยาวเกิน ${max} ตัวอักษร`);
  return s;
}

function num(v: unknown, label: string, min = 0, max = 10_000_000): number | null {
  if (v === "" || v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  if (!Number.isFinite(n) || n < min || n > max) throw new ExitInterviewError(`${label}ไม่ถูกต้อง`);
  return n;
}

function date(v: unknown, label: string): string {
  if (v === "" || v == null) return "";
  const iso = toIsoDate(v);
  if (!iso) throw new ExitInterviewError(`${label}ไม่ถูกต้อง`);
  if (iso > todayInBangkok()) throw new ExitInterviewError(`${label}เป็นวันในอนาคตไม่ได้`);
  return iso;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | "" {
  return allowed.includes(v as T) ? (v as T) : "";
}

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function parseContacts(v: unknown): ContactAttempt[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 3).flatMap((raw): ContactAttempt[] => {
    const c = obj(raw);
    const slot = Number(c.slot);
    if (slot !== 1 && slot !== 2 && slot !== 3) return [];
    const result = oneOf(c.result, ["answered", "no_answer"] as const);
    const dateISO = date(c.dateISO, `วันที่โทรครั้งที่ ${slot} `);
    if (!dateISO && !result) return [];
    return [{ slot, dateISO, result, note: text(c.note, MAX_SHORT * 2) }];
  });
}

/* ------------------------------------------------------------------ บันทึก */

export interface SaveInput {
  reference?: unknown;
  contacts?: unknown;
  outcome?: unknown;
  wave1?: unknown;
  wave2?: unknown;
  income?: unknown;
  safetyFlag?: unknown;
  codes?: unknown;
}

/**
 * บันทึกทั้งชุด (ทับของเดิม) + ซิงก์รหัสสาเหตุลงทะเบียน
 *
 * - `outcome` N1/N2 → รหัสหลัก = N1/N2 เสมอ
 * - รหัสหลักเปลี่ยน → `resignation.reasonCode/Label/categoryLabel/controllable/owner` ตามรหัสใหม่
 *   · `reasonSource` = wave2 ถ้า Wave 2 เสร็จแล้ว ไม่งั้น wave1 · เก็บรหัสเก่าใน `reasonHistory`
 * - รหัสรอง ≤ 2 ตัว ไม่ซ้ำกันและไม่ซ้ำรหัสหลัก ต้องมีอยู่ใน master
 */
export async function saveExitInterview(code: string, input: SaveInput, actor: string): Promise<ExitInterviewBundle> {
  const driver = await interviewable(code);
  const r = driver.resignation!;
  const exitDateISO = r.dateISO;
  const c = await col();
  const before = fromDoc(await c.findOne({ drivercode: driver.drivercode, exitDateISO }), driver.drivercode, exitDateISO);

  const ref = obj(input.reference);
  const w1 = obj(input.wave1);
  const w2 = obj(input.wave2);
  const inc = obj(input.income);
  const outcome = oneOf<Exclude<InterviewOutcome, "">>(input.outcome, ["interviewed", "N1", "N2"]);
  const yn = ["yes", "no", "unsure"] as const;

  const wave1 = {
    dateISO: date(w1.dateISO, "วันที่สัมภาษณ์ Wave 1 "),
    q1Band: oneOf(w1.q1Band, Q1_BANDS),
    q2: text(w1.q2),
    q3: text(w1.q3),
    q4: oneOf<Exclude<YesNoUnsure, "">>(w1.q4, yn),
    q41Topic: text(w1.q41Topic, MAX_SHORT),
    q42: text(w1.q42),
    q5: text(w1.q5),
    q6Match: oneOf<Exclude<JobMatch, "">>(w1.q6Match, ["match", "partial", "mismatch"]),
    q6: text(w1.q6),
    q7: text(w1.q7, MAX_SHORT),
    q8Score: num(w1.q8Score, "คะแนนหัวหน้า (Q8) ", 1, 5),
    q81: text(w1.q81),
    q9Income: text(w1.q9Income, MAX_SHORT * 2),
    q91NewIncome: text(w1.q91NewIncome, MAX_SHORT * 2),
    q10: text(w1.q10),
    q11: text(w1.q11),
    completed: w1.completed === true,
  };
  const wave2 = {
    dateISO: date(w2.dateISO, "วันที่โทร Wave 2 "),
    qw1: text(w2.qw1),
    qw2Income: text(w2.qw2Income, MAX_SHORT * 2),
    qw21: text(w2.qw21),
    qw3: text(w2.qw3),
    qw31Code: text(w2.qw31Code, 8).toUpperCase(),
    qw4: oneOf<Exclude<YesNoUnsure, "">>(w2.qw4, yn),
    qw5: text(w2.qw5),
    completed: w2.completed === true,
  };

  if (wave1.completed && !wave1.dateISO) throw new ExitInterviewError("ระบุวันที่สัมภาษณ์ Wave 1 ก่อนบันทึกว่าเสร็จ");
  if (wave2.completed && !wave1.completed) throw new ExitInterviewError("ต้องบันทึก Wave 1 ให้เสร็จก่อน Wave 2");
  if (wave2.completed && !wave2.dateISO) throw new ExitInterviewError("ระบุวันที่โทร Wave 2 ก่อนบันทึกว่าเสร็จ");

  const contacts = parseContacts(input.contacts);
  if (outcome === "N1" && contacts.filter((x) => x.result === "no_answer").length < 3)
    throw new ExitInterviewError("บันทึก N1 ได้เมื่อโทรไม่รับครบ 3 ครั้ง (คนละวัน คนละช่วงเวลา)");

  /* ---- รหัส */
  const codes = obj(input.codes);
  let primary = outcome === "N1" || outcome === "N2" ? outcome : text(codes.primary, 8).toUpperCase() || r.reasonCode;
  const secondary = [
    ...new Set((Array.isArray(codes.secondary) ? codes.secondary : []).map((x) => text(x, 8).toUpperCase()).filter(Boolean)),
  ];
  if (secondary.length > 2) throw new ExitInterviewError("รหัสสาเหตุรองใส่ได้สูงสุด 2 รหัส");
  if (secondary.includes(primary)) throw new ExitInterviewError("รหัสสาเหตุรองต้องไม่ซ้ำกับรหัสหลัก");
  for (const s of secondary) {
    if (!(await pickResignReason(s, r.secondaryCodes.includes(s) ? s : "")))
      throw new ExitInterviewError(`ไม่พบรหัส ${s} ที่เปิดใช้อยู่`);
  }
  if (wave2.qw31Code && !(await pickResignReason(wave2.qw31Code, wave2.qw31Code === before.wave2.qw31Code ? wave2.qw31Code : "")))
    throw new ExitInterviewError(`ไม่พบรหัส ${wave2.qw31Code} (QW3.1) ที่เปิดใช้อยู่`);

  const now = new Date();
  const history = [...before.reasonHistory];
  const resignationSet: Record<string, unknown> = { "resignation.secondaryCodes": secondary };
  if (primary !== r.reasonCode) {
    const pick = await pickResignReason(primary);
    if (!pick) throw new ExitInterviewError(`ไม่พบรหัส ${primary} ที่เปิดใช้อยู่`);
    primary = pick.code;
    const source = wave2.completed ? "wave2" : "wave1";
    history.push({ from: r.reasonCode, to: pick.code, source, at: now.toISOString(), by: actor });
    Object.assign(resignationSet, {
      "resignation.reasonCode": pick.code,
      "resignation.reasonLabel": pick.label,
      "resignation.categoryLabel": pick.categoryLabel,
      "resignation.controllable": pick.controllable,
      "resignation.owner": pick.owner,
      "resignation.reasonSource": source,
    });
  }

  const doc: InterviewDoc = {
    drivercode: driver.drivercode,
    exitDateISO,
    reference: fillReference(
      {
        stZone: text(ref.stZone, MAX_SHORT),
        rcOwner: text(ref.rcOwner, MAX_SHORT),
        channel: text(ref.channel, MAX_SHORT),
      },
      await deriveReference(driver),
    ),
    contacts,
    outcome: outcome || (wave1.completed ? "interviewed" : ""),
    wave1,
    wave2,
    income: {
      net: num(inc.net, "รายได้สุทธิ "),
      average: num(inc.average, "รายได้เฉลี่ย "),
      deduction: num(inc.deduction, "รายการหักเฉลี่ย "),
    },
    safetyFlag: input.safetyFlag === true,
    reasonHistory: history,
    updatedAt: now,
    updatedBy: actor,
  };

  await c.updateOne({ drivercode: driver.drivercode, exitDateISO }, { $set: doc }, { upsert: true });
  const drivers = await hrCol("drivers");
  /* กรองแค่รหัส — ระเบียนเก่าที่นำเข้าจาก Excel เก็บวันที่ไว้ใน `resignation.date` ไม่ใช่ `dateISO` */
  await drivers.updateOne({ drivercode: driver.drivercode, statusOverride: "resigned" }, { $set: resignationSet });

  return getExitInterview(driver.drivercode);
}

/* ------------------------------------------------------------ ส่งออก DataLog */

/**
 * แถว DataLog ของรหัสที่ขอ (ลำดับตามที่ส่งมา) — คนพ้นสภาพแบบ `resign` เท่านั้น
 * ควบคุมได้/เจ้าของ: ใช้สำเนาใน `resignation` ก่อน ระเบียนเก่าที่ไม่มีค่อยอ่านจาก master ปัจจุบัน
 */
export async function getDataLogRows(codes: string[], keepPhone: boolean): Promise<DataLogRow[]> {
  const wanted = new Set(codes);
  const [resigned, master] = await Promise.all([getResignedDriverList(), getResignMaster()]);
  const byCode = new Map(master.reasons.map((m) => [m.code, m]));
  const rows = resigned.filter((d) => wanted.has(d.drivercode) && d.resignation?.kind === "resign");
  const exits = rows.map((d) => ({ drivercode: d.drivercode, exitDateISO: d.resignation!.dateISO }));
  const interviews = await getInterviewsFor(exits);
  const today = todayInBangkok();
  const order = new Map(codes.map((c, i) => [c, i]));
  return rows
    .sort((a, b) => (order.get(a.drivercode) ?? 0) - (order.get(b.drivercode) ?? 0))
    .map((d) => {
      const r = d.resignation!;
      const iv = interviews.get(`${d.drivercode}|${r.dateISO}`) ?? null;
      const m = byCode.get(r.reasonCode);
      const days = tenureDays(d.startDateISO, r.dateISO);
      return {
        drivercode: d.drivercode,
        name: d.name,
        phone: keepPhone ? d.phone : "",
        ownerTypeLabel: d.ownerTypeLabel,
        position: d.position,
        customer: d.customer,
        plant: d.plant,
        stZone: iv?.reference.stZone ?? "",
        rcOwner: iv?.reference.rcOwner ?? "",
        channel: iv?.reference.channel ?? "",
        startDateISO: d.startDateISO,
        exitDateISO: r.dateISO,
        tenureDays: days,
        tenureBand: tenureBand(days),
        exitType: exitTypeLabel(r.exitType),
        reasonCode: r.reasonCode,
        reasonLabel: r.reasonLabel,
        secondaryCodes: r.secondaryCodes.join(", "),
        controllable: controllableLabel(r.controllable || m?.controllable || ""),
        owner: r.owner || m?.owner || "",
        stage: stageOf(iv, r.dateISO, today),
        interview: iv,
      };
    });
}
