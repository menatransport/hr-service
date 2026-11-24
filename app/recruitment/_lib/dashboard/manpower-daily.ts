import { hrCol } from "@/lib/db";
import { todayInBangkok } from "@/lib/record-case-flow";
import { driversSyncedAt, readDrivers } from "@/app/recruitment/_lib/drivers/master";
import { toIsoDate } from "@/app/recruitment/_lib/drivers/registry";
import { siteOfBranch } from "@/app/recruitment/_lib/drivers/types";
import { getOnboardingRecords } from "@/app/recruitment/_lib/requisitions/onboarding-store";
import { hasPerson, outcomeGroup, pipelineOf, stageOf, trainingStart, val, type OnboardingRecord } from "@/app/recruitment/_lib/requisitions/onboarding";
import { customerLabel, positionLabel } from "@/app/recruitment/_lib/requisitions/types";
import { RecruitmentError } from "@/app/recruitment/_lib/questions";
import { listContactOwners } from "@/app/recruitment/_lib/applications";
import { isRecruitSite, recruitSiteOf, type RecruitSite } from "@/app/recruitment/_lib/sites";

import { MANPOWER_HISTORY } from "./manpower-history";
import {
  MP_GROUPS,
  MP_TREND_KEYS,
  emptyCounts,
  groupOfPosition,
  rowKey,
  siteTargetKey,
  targetKey,
  type MpBoard,
  type MpGroup,
  type MpRow,
  type MpSnapshot,
  type MpSnapshotRow,
  type MpTarget,
} from "./manpower-daily-shared";

/**
 * Manpower พจส. รายวัน — **ฝั่งเซิร์ฟเวอร์เท่านั้น** (นิยามตัวเลขอยู่ `manpower-daily-shared.ts`)
 *
 * หนึ่งแถว = กลุ่มงาน × ลูกค้า × แพล้นท์ · สามแหล่ง:
 * - **ทะเบียน พจส.** (`master_driver` ที่มี `registry`) → Active · Newhire/Resign เดือนนี้ · กลุ่มงานจากตำแหน่ง · สาขาจาก `branch`
 * - **คำขอสรรหา** (`pipelineOf()`) → OJT · Vacant HC · เริ่มฝึกวันนี้ · สัมภาษณ์วันนี้ (ใบสมัครที่ผูกอัตรา)
 * - **ใบสมัคร** → นัดสัมภาษณ์วันนี้ที่ยังไม่ผูกอัตรา (นับรวมระดับสาขา)
 *
 * **บันทึกรายวัน:** เปิดหน้าแต่ละครั้ง = บันทึกยอดของวันนี้ทับ (`recruitment_manpower_daily` · `_id` = วันที่)
 * ยอดของวันจึงเป็นของการเปิดครั้งล่าสุดของวันนั้น — OJT/Vacant เป็นสถานะ “ตอนนี้” คิดย้อนหลังไม่ได้ ต้องเก็บไว้
 */

interface RegistryDoc {
  drivercode?: unknown;
  customer?: unknown;
  plant?: unknown;
  position?: unknown;
  branch?: unknown;
  active?: unknown;
  statusOverride?: unknown;
  startDate?: unknown;
  resignation?: { dateISO?: unknown; date?: unknown } | null;
}

interface TargetDoc {
  /** `siteTargetKey` · แถวรุ่นแรก (ก่อน 16 พ.ย. 2569) = `targetKey` ไม่มีสาขา → อ่านเป็นลาดกระบัง */
  _id: string;
  site?: RecruitSite;
  group: MpGroup;
  customer: string;
  rcOwner?: string;
  targetTruck?: number | null;
  updatedAt?: Date;
  updatedBy?: string;
}

interface SnapshotDoc {
  _id: string;
  date: string;
  rows: MpSnapshotRow[];
  savedAt: Date;
}

interface ApplicationLite {
  _id: { toHexString(): string };
  site?: unknown;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const NONE = "ไม่ระบุ";
/** ย้อนหลังที่อ่านมาวาดกราฟ */
const SNAPSHOT_DAYS = 400;

/** สาขาของ พจส. ตามรหัสสาขาในทะเบียน · ไม่รู้จัก = ตามกลุ่มงาน (โม่ = ลาดกระบัง) */
function siteOfDriver(branch: string, group: MpGroup | null): RecruitSite {
  const key = siteOfBranch(branch);
  if (key === "saraburi" || key === "bangpakong") return "saraburi-bangpakong";
  if (key === "latkrabang") return "latkrabang";
  return !group || group === "Mixer L" || group === "Mixer S" ? "latkrabang" : "saraburi-bangpakong";
}

/** กลุ่มงานเมื่อตำแหน่งบอกไม่ได้ — ลูกค้า `… MS` = Mixer S · ลาดกระบัง = Mixer L (Senior/Spare อยู่กลุ่มนี้ในชีต) */
function fallbackGroup(customer: string, site: RecruitSite): MpGroup {
  if (/\sMS$/i.test(customer)) return "Mixer S";
  return site === "latkrabang" ? "Mixer L" : "อื่น ๆ";
}

/** ลูกค้าที่ไม่นับใน Manpower (Bew 19 พ.ย. 2569 — Kpac ไม่มีงาน MS) */
const HIDDEN_CUSTOMERS = /^kpac\s*ms$/i;
/** รหัส MTM = รถร่วม — ย้ายไป/มาจากรถร่วมไม่ใช่การเข้าใหม่/ลาออก (ไม่นับใน Newhire/Resign) */
const isPartnerCode = (code: string) => /^MTM/i.test(code);
/** กลุ่มงานตามลูกค้า ชนะกลุ่มจากตำแหน่ง — MDL รถ 12W แต่เป็นงาน Cold Chain */
const GROUP_OF_CUSTOMER: readonly [RegExp, MpGroup][] = [[/^mdl$/i, "Cold Chain"]];
/** กลุ่มงานตามลูกค้า + แพล้นท์ — TDM บางวัว (รถ 7.5) เป็นงาน Trailer (Bew 24 พ.ย. 2569) */
const GROUP_OF_PLANT: readonly [RegExp, RegExp, MpGroup][] = [[/^tdm$/i, /บางวัว/, "Trailer"]];

/** จัดลูกค้า/กลุ่มงานให้ลงแถวเดียวกัน — Mixer S ต้องเป็นลูกค้า `… MS` (`Cpac` → `Cpac MS` · `SCCO` → `Scco MS`) */
function placeOf(group: MpGroup, customer: string, plant: string): { group: MpGroup; customer: string } | null {
  if (HIDDEN_CUSTOMERS.test(customer)) return null;
  const byPlant = GROUP_OF_PLANT.find(([c, p]) => c.test(customer.trim()) && p.test(plant))?.[2];
  if (byPlant) return { group: byPlant, customer };
  const byCustomer = GROUP_OF_CUSTOMER.find(([re]) => re.test(customer))?.[1];
  if (byCustomer) return { group: byCustomer, customer };
  if (group === "Mixer S" && customer && !/\sMS$/i.test(customer)) return { group, customer: `${customer} MS` };
  return { group, customer };
}

/** ลูกค้าของคำขอในรูปเดียวกับทะเบียน — ตำแหน่ง MS ต่อ ` MS` (กติกาเดียวกับ `manpower.ts`) */
function customerOf(r: OnboardingRecord): string {
  const base = customerLabel(r);
  return r.position === "MS" && base && !/\sMS$/i.test(base) ? `${base} MS` : base;
}

export async function getManpowerDaily(): Promise<MpBoard> {
  const today = todayInBangkok();
  const month = today.slice(0, 7);

  const [drivers, records, registrySyncedAt, targetDocs, interviews, rcOwners] = await Promise.all([
    readDrivers<RegistryDoc>(["customer", "plant", "position", "branch", "active", "statusOverride", "startDate", "resignation"]),
    getOnboardingRecords(),
    driversSyncedAt(),
    hrCol<TargetDoc>("manpowerTargets").then((c) => c.find({}).toArray()),
    hrCol<ApplicationLite>("applications").then((c) =>
      c.find({ "interview.date": today, status: { $ne: "cancelled" } }, { projection: { _id: 1, site: 1 } }).toArray(),
    ),
    listContactOwners(),
  ]);

  const rows = new Map<string, MpRow>();
  const names = new Map<string, string>();
  /* ชื่อที่โชว์ใช้ตัวสะกดแรกที่เจอ (ทะเบียนอ่านก่อน) — `SCCO` = `Scco` */
  const nameOf = (raw: string) => {
    const k = raw.replace(/\s+/g, "").toLowerCase();
    if (!names.has(k)) names.set(k, raw);
    return names.get(k)!;
  };
  const rowOf = (rawGroup: MpGroup, site: RecruitSite, rawCustomer: string, plant: string): MpRow | null => {
    const place = placeOf(rawGroup, rawCustomer, plant);
    if (!place) return null;
    const { group, customer } = place;
    const c = nameOf(customer || NONE);
    const p = nameOf(plant || NONE);
    const key = rowKey(group, c, p);
    let row = rows.get(key);
    if (!row) {
      row = { key, site, group, customer: c, plant: p, ...emptyCounts() };
      rows.set(key, row);
    }
    return row;
  };

  for (const d of drivers) {
    const customer = str(d.customer);
    const posGroup = groupOfPosition(str(d.position));
    const site = siteOfDriver(str(d.branch), posGroup);
    const group = posGroup ?? fallbackGroup(customer, site);
    const row = rowOf(group, site, customer, str(d.plant));
    if (!row) continue;
    /* กติกาเดียวกับ `toRecord()` — บันทึกการพ้นสภาพชนะ `active` ของ ETL */
    const override = str(d.statusOverride);
    const active = override ? override === "active" : Boolean(d.active);
    if (active) row.active++;
    if (isPartnerCode(str(d.drivercode))) continue;
    if (toIsoDate(d.startDate).startsWith(month)) row.newhire++;
    if (!active && toIsoDate(d.resignation?.dateISO ?? d.resignation?.date).startsWith(month)) row.resign++;
  }

  const recordByApp = new Map<string, MpRow>();
  for (const r of records) {
    const site = recruitSiteOf(r.branch);
    const customer = customerOf(r);
    const group = groupOfPosition(r.position === "other" ? r.positionOther : r.position) ?? groupOfPosition(positionLabel(r)) ?? fallbackGroup(customer, site);
    const bucket = pipelineOf(r);
    const stage = stageOf(r);
    const startedToday = hasPerson(r) && stage !== "ended" && stage !== "working" && trainingStart(r) === today;
    /* ลาออกช่วงฝึกงาน = จบแบบ lost ในเดือนนี้ · เคยเริ่มฝึก (มีวันเริ่มฝึกไม่เกินวันสิ้นสุด) · ยังไม่รับรถ */
    const exitOn = val(r.onboarding, "rc", "exitOn");
    const start = trainingStart(r);
    const resignTraining =
      stage === "ended" &&
      outcomeGroup(r.outcome) === "lost" &&
      exitOn.startsWith(month) &&
      Boolean(start) &&
      start <= exitOn &&
      !val(r.onboarding, "handover", "handoverOn");
    if (!bucket && !startedToday && !resignTraining && !r.match?.applicationId) continue;
    const row = rowOf(group, site, customer, r.plant);
    if (!row) continue;
    if (bucket === "open") row.open++;
    else if (bucket === "waitTraining") row.waiting++;
    else if (bucket === "training" || bucket === "waitHandover") {
      row.ojt++;
      if (bucket === "training") row.inTraining++;
      else row.waitTruck++;
    }
    if (resignTraining) row.resignTraining++;
    if (startedToday) row.training++;
    if (r.match?.applicationId && stage !== "ended") recordByApp.set(r.match.applicationId, row);
  }

  const interviewUnassigned: Record<RecruitSite, number> = { latkrabang: 0, "saraburi-bangpakong": 0 };
  for (const app of interviews) {
    const row = recordByApp.get(app._id.toHexString());
    if (row) row.interview++;
    else interviewUnassigned[isRecruitSite(app.site) ? app.site : "latkrabang"]++;
  }

  const live = [...rows.values()]
    .map((r) => ({ ...r, vacant: r.open + r.waiting }))
    .filter((r) => r.active || r.ojt || r.vacant || r.newhire || r.resign || r.training || r.interview || r.resignTraining);

  const snapshotRows = snapshotOf(live);
  const snapshots = await saveAndReadSnapshots(today, snapshotRows);

  return {
    today,
    rows: live,
    targets: targetDocs.map(toTarget),
    rcOwners,
    history: MANPOWER_HISTORY,
    snapshots,
    interviewUnassigned,
    registrySyncedAt,
    readAt: new Date().toISOString(),
  };
}

function toTarget(d: TargetDoc): MpTarget {
  const site = isRecruitSite(d.site) ? d.site : "latkrabang";
  return {
    key: siteTargetKey(site, d.group, d.customer),
    site,
    group: d.group,
    customer: d.customer,
    rcOwner: d.rcOwner ?? "",
    targetTruck: typeof d.targetTruck === "number" ? d.targetTruck : null,
    updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : "",
    updatedBy: d.updatedBy ?? "",
  };
}

/** แถวสด → แถวบันทึกรายวัน (สาขา × กลุ่มงาน × ลูกค้า · 3 ตัวของกราฟ + ตัวเทียบลูกศรของข้อความ LINE) */
function snapshotOf(rows: readonly MpRow[]): MpSnapshotRow[] {
  const out = new Map<string, MpSnapshotRow>();
  for (const r of rows) {
    if (!r.active && !r.ojt && !r.vacant && !r.resign && !r.resignTraining) continue;
    const k = `${r.site}|${targetKey(r.group, r.customer)}`;
    const s = out.get(k) ?? { site: r.site, group: r.group, customer: r.customer, active: 0, ojt: 0, vacant: 0 };
    s.active += r.active;
    s.ojt += r.ojt;
    s.vacant += r.vacant;
    for (const key of MP_TREND_KEYS) s[key] = (s[key] ?? 0) + r[key];
    out.set(k, s);
  }
  return [...out.values()];
}

/**
 * บันทึกยอดวันนี้ทับ แล้วอ่านย้อนหลัง — บันทึกพังไม่ทำให้หน้าพัง (กราฟยังมีวันนี้จากข้อมูลสด)
 */
async function saveAndReadSnapshots(today: string, rows: MpSnapshotRow[]): Promise<MpSnapshot[]> {
  const col = await hrCol<SnapshotDoc>("manpowerDaily");
  try {
    await col.updateOne({ _id: today }, { $set: { date: today, rows, savedAt: new Date() } }, { upsert: true });
  } catch (err) {
    console.warn("[manpower-daily] บันทึกยอดรายวันไม่สำเร็จ —", err);
  }
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - SNAPSHOT_DAYS * 86_400_000).toISOString().slice(0, 10);
  let docs: SnapshotDoc[] = [];
  try {
    docs = await col.find({ _id: { $gte: from, $lt: today } }).sort({ _id: 1 }).toArray();
  } catch (err) {
    console.warn("[manpower-daily] อ่านยอดย้อนหลังไม่สำเร็จ —", err);
  }
  return [...docs.map((d) => ({ date: d.date, rows: d.rows ?? [] })), { date: today, rows }];
}

/* ------------------------------------------------------------------ ตั้งเป้า */

export interface MpTargetInput {
  site: RecruitSite;
  group: string;
  customer: string;
  rcOwner: string;
  targetTruck: number | null;
}

const MAX_TARGETS = 500;

/**
 * บันทึกเป้าหลายแถวในครั้งเดียว (ส่งมาเฉพาะแถวที่แก้) — RC Owner ว่าง + Target Truck ว่าง = ลบแถวเป้า
 * · คีย์ = สาขา × กลุ่มงาน × ลูกค้า ตัวเดียวกับที่แดชบอร์ดจับคู่ (`siteTargetKey`)
 * · บันทึกลาดกระบังทับแถวรุ่นแรกที่ไม่มีสาขา (`targetKey`) ด้วย — ไม่ให้เหลือเป้าซ้ำสองแถว
 */
export async function saveManpowerTargets(input: unknown, actor: string): Promise<MpTarget[]> {
  if (!Array.isArray(input) || !input.length) throw new RecruitmentError("ไม่มีรายการเป้าที่จะบันทึก");
  if (input.length > MAX_TARGETS) throw new RecruitmentError(`บันทึกได้ครั้งละไม่เกิน ${MAX_TARGETS} แถว`);

  const clean = input.map((raw, i): MpTargetInput => {
    const v = (raw ?? {}) as Record<string, unknown>;
    if (!isRecruitSite(v.site)) throw new RecruitmentError(`แถวที่ ${i + 1}: สาขาไม่ถูกต้อง`);
    const site = v.site;
    const group = str(v.group);
    const customer = str(v.customer);
    const rcOwner = str(v.rcOwner);
    const t = v.targetTruck;
    if (!(MP_GROUPS as readonly string[]).includes(group)) throw new RecruitmentError(`แถวที่ ${i + 1}: กลุ่มงานไม่ถูกต้อง`);
    if (!customer || customer.length > 120) throw new RecruitmentError(`แถวที่ ${i + 1}: ชื่อลูกค้าไม่ถูกต้อง`);
    if (rcOwner.length > 60) throw new RecruitmentError(`แถวที่ ${i + 1}: ชื่อ RC Owner ยาวเกิน 60 ตัวอักษร`);
    if (t !== null && t !== "" && t !== undefined && !(Number.isInteger(t) && (t as number) >= 0 && (t as number) <= 9999)) {
      throw new RecruitmentError(`แถวที่ ${i + 1}: Target Truck ต้องเป็นจำนวนเต็ม 0–9999`);
    }
    return { site, group, customer, rcOwner, targetTruck: typeof t === "number" ? t : null };
  });

  const col = await hrCol<TargetDoc>("manpowerTargets");
  const now = new Date();
  await col.bulkWrite(
    clean.flatMap((t) => {
      const _id = siteTargetKey(t.site, t.group, t.customer);
      const legacy = t.site === "latkrabang" ? [{ deleteOne: { filter: { _id: targetKey(t.group, t.customer) } } }] : [];
      if (!t.rcOwner && t.targetTruck == null) return [{ deleteOne: { filter: { _id } } }, ...legacy];
      return [
        ...legacy,
        {
        updateOne: {
          filter: { _id },
          update: {
            $set: { site: t.site, group: t.group as MpGroup, customer: t.customer, rcOwner: t.rcOwner, targetTruck: t.targetTruck, updatedAt: now, updatedBy: actor },
          },
          upsert: true,
        },
        },
      ];
    }),
    { ordered: false },
  );
  return (await col.find({}).toArray()).map(toTarget);
}
