/**
 * Manpower พจส. รายวัน — ชนิด · นิยามตัวเลข · ตัวรวมยอด · ข้อความ LINE
 * (**ใช้ได้ทั้ง server และ client** ห้าม import ฐานข้อมูล · ฝั่งอ่านฐานอยู่ `manpower-daily.ts`)
 *
 * ที่มา: ชีต “📊 Manpower” + “📈 Daily สรุป %” ใน “[HR] Manpower Daily Report.xlsx” (ต้นแบบ artifact 12 พ.ย. 2569)
 * **นิยาม (Bew 15 พ.ย. 2569 ให้ตัดสินตามข้อเสนอ):**
 * - **Active** = ทะเบียน พจส. ปฏิบัติงาน (รับรถแล้ว) · **OJT** = ฝึกงาน + รอรับรถ (`pipelineOf`)
 * - **Vacant HC** = รอสรรหา + รอฝึกงาน — ไม่นับฝึกงานซ้ำกับ OJT
 * - **Target Recruit** = Active + OJT + Vacant HC · **%** = (Active + OJT) ÷ Target Recruit ทุกระดับ
 * - **Target Truck / RC Owner** = ตั้งเองต่อ สาขา × กลุ่มงาน × ลูกค้า (`recruitment_manpower_targets` · แยกสาขา Bew 16 พ.ย. 2569) · ข้อมูลประกอบ ไม่ใช่ตัวหาร
 * - **Newhire / Resign** = เข้า/ออกทะเบียนในเดือนนี้ · **Waiting** = รอฝึกงาน ณ วันนี้
 * - **Training** = เริ่มฝึกวันนี้ (วันเริ่มฝึก = วันนี้ แบบ RC Alert) · **Interview** = นัดสัมภาษณ์วันนี้
 */

import type { RecruitSite } from "@/app/recruitment/_lib/sites";

/** กลุ่มงานตามชีต — ลำดับ = ลำดับในตาราง/กราฟ · “อื่น ๆ” = ตำแหน่งที่จับกลุ่มไม่ได้ */
export const MP_GROUPS = ["Mixer L", "Mixer S", "Cold Chain", "Feed mill", "Trailer", "อื่น ๆ"] as const;
export type MpGroup = (typeof MP_GROUPS)[number];

/**
 * ตำแหน่ง (ทะเบียน/คำขอ) → กลุ่มงาน · ไม่รู้จัก = `null` (ผู้เรียกตัดสินต่อจากสาขา)
 * 10W = Cold Chain · 12W/18W = Feed mill · Trailer = Trailer (ตามแถวในชีต)
 */
export function groupOfPosition(position: string): MpGroup | null {
  const p = position.trim().toLowerCase().replace(/\s+/g, " ");
  if (!p) return null;
  if (p === "ml" || /^mixer ?l/.test(p) || /โม่ ?(ใหญ่|l)/.test(p)) return "Mixer L";
  if (p === "ms" || /^mixer ?s/.test(p) || /โม่ ?(เล็ก|s)/.test(p)) return "Mixer S";
  if (/10 ?w|10 ?ล้อ/.test(p)) return "Cold Chain";
  if (/1[28] ?w|1[28] ?ล้อ/.test(p)) return "Feed mill";
  if (/trailer|เทรลเลอร์|หัวลาก/.test(p)) return "Trailer";
  return null;
}

/** ยอดของหนึ่งแถว (หรือผลรวม) — ชื่อเดียวกับคอลัมน์ในชีต */
export interface MpCounts {
  active: number;
  ojt: number;
  vacant: number;
  /** รอสรรหา (ส่วนหนึ่งของ Vacant HC) */
  open: number;
  /** รอฝึกงาน (= Waiting · ส่วนหนึ่งของ Vacant HC) */
  waiting: number;
  newhire: number;
  resign: number;
  /** เริ่มฝึกวันนี้ */
  training: number;
  /** นัดสัมภาษณ์วันนี้ (เฉพาะใบที่ผูกอัตราแล้ว — ใบที่ยังไม่ผูกอยู่ใน `MpBoard.interviewUnassigned`) */
  interview: number;
  /** กำลังฝึกงาน (ส่วนหนึ่งของ OJT) */
  inTraining: number;
  /** รอรับรถ (ส่วนหนึ่งของ OJT) */
  waitTruck: number;
  /** ลาออก/พ้นสภาพช่วงฝึกงานในเดือนนี้ — คำขอที่เริ่มฝึกแล้ว ยังไม่รับรถ ผลสิ้นสุดกลุ่ม “lost” · วันสิ้นสุดในเดือน */
  resignTraining: number;
}

export const MP_COUNT_KEYS = ["active", "ojt", "vacant", "open", "waiting", "newhire", "resign", "training", "interview", "inTraining", "waitTruck", "resignTraining"] as const satisfies readonly (keyof MpCounts)[];

export const emptyCounts = (): MpCounts => ({
  active: 0,
  ojt: 0,
  vacant: 0,
  open: 0,
  waiting: 0,
  newhire: 0,
  resign: 0,
  training: 0,
  interview: 0,
  inTraining: 0,
  waitTruck: 0,
  resignTraining: 0,
});

/** หนึ่งแถวสด = กลุ่มงาน × ลูกค้า × แพล้นท์ */
export interface MpRow extends MpCounts {
  key: string;
  site: RecruitSite;
  group: MpGroup;
  customer: string;
  plant: string;
}

/** เป้าที่ตั้งเอง — ต่อ สาขา × กลุ่มงาน × ลูกค้า (ลูกค้าเดียวกันคนละสาขา = คนละเป้า) */
export interface MpTarget {
  /** `siteTargetKey(site, group, customer)` */
  key: string;
  site: RecruitSite;
  group: MpGroup;
  customer: string;
  /** ชื่อจากรายการ “ผู้ติดต่อกลับ” ของหน้าผู้สมัคร (`listContactOwners`) */
  rcOwner: string;
  /** `null` = ยังไม่ตั้ง */
  targetTruck: number | null;
  updatedAt: string;
  updatedBy: string;
}

/** จุดหนึ่งบนกราฟแนวโน้ม (ยอดของวัน) */
export interface MpDayPoint {
  date: string;
  active: number;
  ojt: number;
  vacant: number;
  /** `history` = ชีต Daily ระดับบริษัท (ก่อนเริ่มเก็บในระบบ) · `snapshot` = ระบบบันทึกเอง */
  source: "history" | "snapshot";
}

/** ยอดรายวันที่ระบบบันทึก — หนึ่งแถวต่อ สาขา × กลุ่มงาน × ลูกค้า */
export interface MpSnapshotRow {
  site: RecruitSite;
  group: MpGroup;
  customer: string;
  active: number;
  ojt: number;
  vacant: number;
  /* ตัวเทียบลูกศรในข้อความ LINE (เริ่มเก็บ 16 พ.ย. 2569) — วันที่บันทึกก่อนนั้นไม่มีค่า = ไม่โชว์ลูกศร */
  open?: number;
  waiting?: number;
  inTraining?: number;
  waitTruck?: number;
  resign?: number;
  resignTraining?: number;
}

/** ตัวเลขที่ข้อความ LINE แบบอีโมจิเทียบกับวันก่อน */
export const MP_TREND_KEYS = ["open", "waiting", "inTraining", "waitTruck", "resign", "resignTraining"] as const;
export type MpTrendKey = (typeof MP_TREND_KEYS)[number];

export interface MpSnapshot {
  date: string;
  rows: MpSnapshotRow[];
}

export interface MpBoard {
  today: string;
  rows: MpRow[];
  targets: MpTarget[];
  /** ตัวเลือก RC Owner = รายชื่อ “ผู้ติดต่อกลับ” ในหน้าผู้สมัคร (คลังคำถาม ข้อ hr_contact) */
  rcOwners: string[];
  /** ประวัติจากชีต (ระดับบริษัท) — ใช้เฉพาะขอบเขต “ทั้งหมด” */
  history: MpDayPoint[];
  snapshots: MpSnapshot[];
  /** นัดสัมภาษณ์วันนี้ที่ยังไม่ผูกอัตรา แยกสาขาของใบสมัคร */
  interviewUnassigned: Record<RecruitSite, number>;
  registrySyncedAt: string | null;
  readAt: string;
}

/* ------------------------------------------------------------------ คีย์ */

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
export const targetKey = (group: string, customer: string) => `${norm(group)}|${norm(customer)}`;
export const siteTargetKey = (site: RecruitSite, group: string, customer: string) => `${site}|${targetKey(group, customer)}`;
export const rowKey = (group: string, customer: string, plant: string) => `${targetKey(group, customer)}|${norm(plant)}`;

/* ------------------------------------------------------------------ ขอบเขต */

export type MpScope = "all" | RecruitSite;

export const MP_SCOPES: { value: MpScope; label: string }[] = [
  { value: "all", label: "ทั้งหมด" },
  { value: "latkrabang", label: "ลาดกระบัง" },
  { value: "saraburi-bangpakong", label: "สระบุรี+บางปะกง" },
];

export const scopeLabel = (s: MpScope) => MP_SCOPES.find((o) => o.value === s)!.label;
export const inScope = (scope: MpScope, site: RecruitSite) => scope === "all" || scope === site;

/* ------------------------------------------------------------------ รวมยอด */

export function sumCounts(rows: readonly MpCounts[]): MpCounts {
  const out = emptyCounts();
  for (const r of rows) for (const k of MP_COUNT_KEYS) out[k] += r[k];
  return out;
}

export const recruitOf = (c: Pick<MpCounts, "active" | "ojt" | "vacant">) => c.active + c.ojt + c.vacant;
export const actualOf = (c: Pick<MpCounts, "active" | "ojt">) => c.active + c.ojt;

/** สัดส่วน 0–1 · ตัวหาร 0 = `null` */
export const ratio = (a: number, b: number): number | null => (b ? a / b : null);

export function pctText(a: number, b: number, digits = 1): string {
  const r = ratio(a, b);
  return r == null ? "–" : `${(r * 100).toFixed(digits)}%`;
}

export const fmtNum = (n: number) => n.toLocaleString("th-TH");
export const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${fmtNum(Math.abs(n))}`;

/** ลูกค้าหนึ่งรายในกลุ่มงาน — แถวสรุปที่มีเป้า + แพล้นท์ข้างใน */
export interface MpCustomerGroup {
  key: string;
  group: MpGroup;
  customer: string;
  target: MpTarget | null;
  t: MpCounts;
  plants: MpRow[];
}

export interface MpFleetGroup {
  group: MpGroup;
  t: MpCounts;
  targetTruck: number;
  customers: MpCustomerGroup[];
}

const byName = (a: string, b: string) => a.localeCompare(b, "th", { numeric: true });

/** แถวสด → กลุ่มงาน → ลูกค้า → แพล้นท์ (ลูกค้าเรียงตาม Target Recruit มาก→น้อย) */
export function groupRows(rows: readonly MpRow[], targets: readonly MpTarget[]): MpFleetGroup[] {
  const tmap = new Map(targets.map((t) => [t.key, t]));
  const out: MpFleetGroup[] = [];
  /* ลูกค้าเดียวกันสองสาขา (ขอบเขต “ทั้งหมด”) → รวมเป้าของทุกสาขาที่มีแพล้นท์ · Truck บวก · RC Owner ต่อชื่อ */
  const targetOf = (group: MpGroup, plants: readonly MpRow[]): MpTarget | null => {
    const found = [...new Set(plants.map((p) => p.site))]
      .map((site) => tmap.get(siteTargetKey(site, group, plants[0].customer)))
      .filter((t): t is MpTarget => Boolean(t));
    if (found.length <= 1) return found[0] ?? null;
    const trucks = found.map((t) => t.targetTruck).filter((n): n is number => n != null);
    return {
      ...found[0],
      rcOwner: [...new Set(found.map((t) => t.rcOwner).filter(Boolean))].join(", "),
      targetTruck: trucks.length ? trucks.reduce((a, b) => a + b, 0) : null,
    };
  };
  for (const group of MP_GROUPS) {
    const inGroup = rows.filter((r) => r.group === group);
    if (!inGroup.length) continue;
    const custs = new Map<string, MpRow[]>();
    for (const r of inGroup) {
      const k = targetKey(group, r.customer);
      custs.set(k, [...(custs.get(k) ?? []), r]);
    }
    const customers = [...custs.entries()]
      .map(([key, plants]) => ({
        key,
        group,
        customer: plants[0].customer,
        target: targetOf(group, plants),
        t: sumCounts(plants),
        plants: plants.sort((a, b) => recruitOf(b) - recruitOf(a) || byName(a.plant, b.plant)),
      }))
      .sort((a, b) => recruitOf(b.t) - recruitOf(a.t) || byName(a.customer, b.customer));
    out.push({
      group,
      t: sumCounts(inGroup),
      targetTruck: customers.reduce((n, c) => n + (c.target?.targetTruck ?? 0), 0),
      customers,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ แนวโน้ม */

export type MpPeriod = "day" | "week" | "month";

export interface MpTrendPoint {
  key: string;
  /** ป้ายแกน */
  label: string;
  /** ป้ายเต็มในกล่องลอย/ตาราง */
  long: string;
  /** วันที่มีข้อมูลในช่วง */
  days: number;
  active: number;
  ojt: number;
  vacant: number;
  recruit: number;
  /** % เต็มเป้า 0–100 */
  fullPct: number | null;
}

export const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
export const TH_MONTH_FULL = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

const partsOf = (iso: string) => iso.split("-").map(Number) as [number, number, number];

/** `15 พ.ย. 2569` · `full` = ชื่อเดือนเต็ม */
export function thDate(iso: string, full = false): string {
  const [y, m, d] = partsOf(iso);
  return `${d} ${(full ? TH_MONTH_FULL : TH_MONTH)[m - 1]} ${y + 543}`;
}

/** วันจันทร์ของสัปดาห์ (ISO) */
function mondayOf(iso: string): string {
  const [y, m, d] = partsOf(iso);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
}

/**
 * ยอดรายวันของขอบเขต — snapshot ของระบบชนะประวัติจากชีตในวันเดียวกัน
 * · ประวัติจากชีตเป็นระดับบริษัท จึงใช้เฉพาะขอบเขต “ทั้งหมด”
 */
export function dailyPoints(board: Pick<MpBoard, "history" | "snapshots">, scope: MpScope): MpDayPoint[] {
  const byDate = new Map<string, MpDayPoint>();
  if (scope === "all") for (const h of board.history) byDate.set(h.date, h);
  for (const s of board.snapshots) {
    const rows = s.rows.filter((r) => inScope(scope, r.site));
    if (!rows.length) continue;
    byDate.set(s.date, {
      date: s.date,
      active: rows.reduce((n, r) => n + r.active, 0),
      ojt: rows.reduce((n, r) => n + r.ojt, 0),
      vacant: rows.reduce((n, r) => n + r.vacant, 0),
      source: "snapshot",
    });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** รายวัน = ยอดของวัน · สัปดาห์/เดือน = ค่าเฉลี่ยต่อวันที่มีข้อมูล */
export function trendSeries(points: readonly MpDayPoint[], period: MpPeriod): MpTrendPoint[] {
  const groups = new Map<string, MpDayPoint[]>();
  for (const p of points) {
    const k = period === "day" ? p.date : period === "week" ? mondayOf(p.date) : p.date.slice(0, 7);
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  return [...groups.entries()].map(([key, list]) => {
    const avg = (f: "active" | "ojt" | "vacant") => Math.round((list.reduce((n, x) => n + x[f], 0) / list.length) * 10) / 10;
    const active = avg("active");
    const ojt = avg("ojt");
    const vacant = avg("vacant");
    const recruit = Math.round((active + ojt + vacant) * 10) / 10;
    const first = list[0].date;
    const last = list[list.length - 1].date;
    const [, fm, fd] = partsOf(first);
    const [ly, lm, ld] = partsOf(last);
    let label: string;
    let long: string;
    if (period === "day") {
      label = `${fd} ${TH_MONTH[fm - 1]}`;
      long = thDate(first);
    } else if (period === "week") {
      label = first === last ? `${fd} ${TH_MONTH[fm - 1]}` : fm === lm ? `${fd}–${ld} ${TH_MONTH[lm - 1]}` : `${fd} ${TH_MONTH[fm - 1]}–${ld} ${TH_MONTH[lm - 1]}`;
      long = `สัปดาห์ ${label} ${ly + 543} · เฉลี่ย ${list.length} วัน`;
    } else {
      label = `${TH_MONTH[fm - 1]} ${String(ly + 543).slice(2)}`;
      long = `${TH_MONTH_FULL[fm - 1]} ${ly + 543} · เฉลี่ย ${list.length} วัน`;
    }
    return { key, label, long, days: list.length, active, ojt, vacant, recruit, fullPct: recruit ? Math.round(((active + ojt) / recruit) * 1000) / 10 : null };
  });
}

/* ------------------------------------------------------------------ ข้อความ LINE */

export type LineKind = "day" | "week" | "month";

export interface LineOptions {
  kind: LineKind;
  /** รายวัน: แบบสรุปสถานะอีโมจิ (ต้นแบบที่ RC ส่งกลุ่มอยู่ · Bew 16 พ.ย. 2569) · รายสัปดาห์/เดือน: ใส่ไอคอนนำบรรทัด */
  icons: boolean;
  /** ต่อท้ายรายการลูกค้าที่ยังว่าง */
  vacancies: boolean;
  /**
   * ตัวเลข/ลูกศรของแบบอีโมจิ — `line` = รหัสอีโมจิ LINE `(two)(nine)` `(up)` `(down)` `(=)` ตรงกับข้อความที่ RC คัดลอกจาก LINE
   * · `unicode` = 2️⃣9️⃣ ⬆️ ⬇️ ➖ (ขึ้นเป็นอีโมจิทุกแอป ใช้เมื่อรหัส LINE ไม่กลายเป็นอีโมจิ)
   */
  digits: "line" | "unicode";
}

const RULE = "──────────────";

/**
 * ข้อความสรุปส่งกลุ่มไลน์ — สร้างจากข้อมูลชุดเดียวกับแดชบอร์ด (ขอบเขตตามแถบบนหน้า)
 * · รายวัน = ยอด ณ ตอนนี้ · รายสัปดาห์/เดือน = ค่าเฉลี่ยต่อวันของงวดล่าสุด เทียบงวดก่อน
 */
export function buildLineMessage(board: MpBoard, scope: MpScope, opt: LineOptions, now: Date): string {
  if (opt.kind === "day" && opt.icons) return buildEmojiDaily(board, scope, opt);
  const ic = (emoji: string, text: string) => (opt.icons ? `${emoji} ${text}` : text);
  const rows = board.rows.filter((r) => inScope(scope, r.site));
  const fleets = groupRows(rows, board.targets);
  const t = sumCounts(rows);
  const recruit = recruitOf(t);
  const truck = fleets.reduce((n, f) => n + f.targetTruck, 0);
  const interview = t.interview + (scope === "all" ? board.interviewUnassigned.latkrabang + board.interviewUnassigned["saraburi-bangpakong"] : board.interviewUnassigned[scope]);
  const time = now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
  const L: string[] = [];

  if (opt.kind === "day") {
    L.push(ic("📊", `สรุป Manpower พจส. ประจำวันที่ ${thDate(board.today, true)}`), `ขอบเขต: ${scopeLabel(scope)}`, RULE);
    L.push(`Target Recruit ${fmtNum(recruit)} คน${truck ? ` | Target Truck ${fmtNum(truck)} คัน` : ""}`);
    L.push(ic("✅", `Active ${fmtNum(t.active)} คน (${pctText(t.active, recruit)})`));
    L.push(ic("🎯", `OJT ${fmtNum(t.ojt)} คน (ฝึกงาน + รอรับรถ)`));
    L.push(`รวม Actual ${fmtNum(actualOf(t))} คน = ${pctText(actualOf(t), recruit)} ของเป้า`);
    L.push(ic("🔎", `Vacant HC ${fmtNum(t.vacant)} คน (รอสรรหา ${fmtNum(t.open)} · รอฝึกงาน ${fmtNum(t.waiting)})`), RULE);
    L.push("แยกกลุ่มงาน");
    for (const f of fleets) {
      const r = recruitOf(f.t);
      if (r) L.push(`${opt.icons ? "🚛" : "•"} ${f.group}: Active ${fmtNum(f.t.active)} · OJT ${fmtNum(f.t.ojt)} · ว่าง ${fmtNum(f.t.vacant)} (${pctText(actualOf(f.t), r, 0)})`);
    }
    L.push(RULE, "ความเคลื่อนไหว");
    L.push(`เข้าใหม่เดือนนี้ ${fmtNum(t.newhire)} · ลาออก ${fmtNum(t.resign)} · สุทธิ ${signed(t.newhire - t.resign)}`);
    L.push(`วันนี้: สัมภาษณ์ ${fmtNum(interview)} · รอฝึกงาน ${fmtNum(t.waiting)} · เริ่มฝึก ${fmtNum(t.training)}`);
  } else {
    const pts = trendSeries(dailyPoints(board, scope), opt.kind);
    const a = pts[pts.length - 1];
    const b = pts[pts.length - 2];
    const name = opt.kind === "week" ? "สัปดาห์" : "เดือน";
    L.push(ic("📈", `สรุป Manpower พจส. ราย${name}`), `ขอบเขต: ${scopeLabel(scope)}`, RULE);
    if (!a) {
      L.push("ยังไม่มีข้อมูลย้อนหลังของขอบเขตนี้");
    } else {
      L.push(`${a.long}${b ? ` เทียบ ${b.label}` : ""}`);
      const d = (k: "active" | "ojt" | "vacant") => (b ? ` (${signed(Math.round((a[k] - b[k]) * 10) / 10)})` : "");
      L.push(ic("✅", `Active เฉลี่ย ${fmtNum(a.active)} คน${d("active")}`));
      L.push(ic("🎯", `OJT เฉลี่ย ${fmtNum(a.ojt)} คน${d("ojt")}`));
      L.push(ic("🔎", `Vacant HC เฉลี่ย ${fmtNum(a.vacant)} คน${d("vacant")}`));
      L.push(`เต็มเป้า ${a.fullPct ?? "–"}%${b ? ` (ก่อนหน้า ${b.fullPct ?? "–"}%)` : ""}`);
    }
    L.push(RULE, `ล่าสุด ${thDate(board.today)}: Active ${fmtNum(t.active)} · OJT ${fmtNum(t.ojt)} · ว่าง ${fmtNum(t.vacant)}`);
    L.push(`เข้าใหม่เดือนนี้ ${fmtNum(t.newhire)} · ลาออก ${fmtNum(t.resign)} · สุทธิ ${signed(t.newhire - t.resign)}`);
  }

  if (opt.vacancies) {
    const top = fleets
      .flatMap((f) => f.customers)
      .filter((c) => c.t.vacant > 0)
      .sort((a, b) => b.t.vacant - a.t.vacant)
      .slice(0, 8);
    if (top.length) {
      L.push(RULE, ic("📍", "ลูกค้าที่ยังว่าง"));
      top.forEach((c, i) =>
        L.push(`${i + 1}. ${c.customer} (${c.group}) ว่าง ${fmtNum(c.t.vacant)} · รอฝึก ${fmtNum(c.t.waiting)}${c.target?.rcOwner ? ` — RC ${c.target.rcOwner}` : ""}`),
      );
    }
  }

  L.push(RULE, `ข้อมูล ณ ${thDate(board.today)} ${time} น. · ระบบ hr-service`);
  return L.join("\n");
}

/* ------------------------------------------------------------------ ข้อความ LINE แบบอีโมจิ */

const DIGIT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"] as const;

/** ตัวเลขเป็นอีโมจิ — `line`: 29 → `(two)(nine)` · `unicode`: 29 → 2️⃣9️⃣ */
export function emojiNumber(n: number, style: LineOptions["digits"]): string {
  const ds = [...String(Math.max(0, Math.round(n)))].map(Number);
  return ds.map((d) => (style === "line" ? `(${DIGIT_WORDS[d]})` : `${d}️⃣`)).join("");
}

/** รหัสอีโมจิ LINE ในข้อความ — ตัวอย่างในกล่องแปลงเป็นภาพเลียนแบบ (`manpower-line-dialog.tsx`) */
export const LINE_EMOJI_RE = /\((zero|one|two|three|four|five|six|seven|eight|nine|up|down|=)\)/g;
export const lineDigitOf = (word: string) => DIGIT_WORDS.indexOf(word as (typeof DIGIT_WORDS)[number]);

/** ลูกศรเทียบวันก่อน · ไม่มีวันก่อน/วันก่อนไม่ได้เก็บตัวนี้ = ไม่ใส่ */
function arrow(now: number, prev: number | null, style: LineOptions["digits"]): string {
  if (prev == null) return "";
  const dir = now > prev ? 0 : now < prev ? 1 : 2;
  return " " + (style === "line" ? ["(up)", "(down)", "(=)"] : ["⬆️", "⬇️", "➖"])[dir];
}

/** ยอดวันก่อนหน้าที่มีบันทึก (ล่าสุดก่อนวันนี้) ในขอบเขต · `group` = เฉพาะกลุ่มงานนั้น */
function prevValue(board: MpBoard, scope: MpScope, key: MpTrendKey, group?: MpGroup): number | null {
  const prev = [...board.snapshots].reverse().find((s) => s.date < board.today);
  if (!prev) return null;
  const rows = prev.rows.filter((r) => inScope(scope, r.site) && (!group || r.group === group));
  if (rows.some((r) => r[key] == null)) return null;
  return rows.reduce((n, r) => n + (r[key] ?? 0), 0);
}

/** Mixer L + Mixer S = “Mixer” ในหัวข้อ */
const familyOf = (g: MpGroup) => (g === "Mixer L" || g === "Mixer S" ? "Mixer" : g);

const ymdText = (iso: string) => {
  const [y, m, d] = partsOf(iso);
  return `${d} ${TH_MONTH[m - 1]} ${y}`;
};

const pct0 = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");

/** ป้าย + เปอร์เซ็นต์ชิดคอลัมน์เดียวกันแบบต้นแบบ (เว้นวรรคเติมให้ % ตรงกันโดยประมาณ — ฟอนต์ LINE ไม่ใช่ monospace) */
const padPct = (label: string, value: string, width: number) => `${label}${" ".repeat(Math.max(2, width - label.length))}${value}`;

/**
 * รายวันแบบอีโมจิ — ตามต้นแบบ “📊🚛 สรุปสถานะ พจส. …” ที่ RC ส่งกลุ่มไลน์ (Bew 16 พ.ย. 2569)
 * · ตัวเลข/ลูกศร = รหัสอีโมจิ LINE หรือ keycap (`opt.digits`) · ลูกศร = เทียบวันก่อนที่ระบบบันทึกไว้ · Fleet % ใช้ตัวหาร Target Recruit เดียวกับแดชบอร์ด
 * · Fleet Training = OJT (ฝึกงาน + รอรับรถ)
 */
function buildEmojiDaily(board: MpBoard, scope: MpScope, opt: LineOptions): string {
  const rows = board.rows.filter((r) => inScope(scope, r.site));
  const fleets = groupRows(rows, board.targets).filter((f) => recruitOf(f.t));
  const t = sumCounts(rows);
  const recruit = recruitOf(t);
  const num = (v: number) => emojiNumber(v, opt.digits);
  const trend = (v: number, key: MpTrendKey, group?: MpGroup) => arrow(v, prevValue(board, scope, key, group), opt.digits);
  const n = (v: number, key: MpTrendKey, group?: MpGroup) => `${num(v)} คน${trend(v, key, group)}`;
  const families = [...new Set(fleets.map((f) => familyOf(f.group)))];
  const PCT = 34;

  /* โครงตามข้อความที่ RC ส่งกลุ่มจริง (บรรทัดว่างตรงตำแหน่งเดิม) */
  const L: string[] = [
    `📊🚛 สรุปสถานะ พจส. ${scope === "all" ? "ทุกสาขา" : scopeLabel(scope)}${families.length ? ` (${families.join(" · ")})` : ""}`,
    `📆 ${ymdText(board.today)}`,
    "-----------------------",
    "🔎 สถานะ:รอสรรหา",
    n(t.open, "open"),
    "",
    "- กำลังฝึกงาน",
    n(t.inTraining, "inTraining"),
    `- รอรับรถ ${n(t.waitTruck, "waitTruck")}`,
  ];
  /* กลุ่มงานที่ไม่มีรอสรรหา (วันนี้และวันก่อน) ไม่ต้องมีบรรทัด */
  for (const f of fleets) {
    if (f.t.open || prevValue(board, scope, "open", f.group)) L.push(`🚛 ${f.group}`, `- รอสรรหา ${n(f.t.open, "open", f.group)}`);
  }
  L.push(
    "",
    `🔸️รอฝึกงานทั้งหมด ${n(t.waiting, "waiting")}`,
    "",
    "",
    padPct("✅ Total Fleet Active", pct0(t.active, recruit), PCT),
    padPct("👨‍🏫 Total Fleet Training", pct0(t.ojt, recruit), PCT),
    padPct("📊 Total (Active+Training)", pct0(actualOf(t), recruit), PCT),
    "",
    `⚡️ ลาออกในเดือนทั้งหมด ${n(t.resign, "resign")}`,
    `⚡️ ลาออกช่วงฝึกงานในเดือน ${n(t.resignTraining, "resignTraining")}`,
  );

  if (opt.vacancies) {
    const top = fleets
      .flatMap((f) => f.customers)
      .filter((c) => c.t.vacant > 0)
      .sort((a, b) => b.t.vacant - a.t.vacant)
      .slice(0, 8);
    if (top.length) {
      L.push("", "📍 ลูกค้าที่ยังว่าง");
      top.forEach((c, i) => L.push(`${i + 1}. ${c.customer} (${c.group}) ว่าง ${c.t.vacant}${c.target?.rcOwner ? ` — RC ${c.target.rcOwner}` : ""}`));
    }
  }
  return L.join("\n");
}
