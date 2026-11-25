import { hrCol } from "@/lib/db";
import { getResignedDriverList, todayInBangkok } from "@/app/recruitment/_lib/drivers/registry";
import { getResignMaster } from "@/app/recruitment/_lib/resign-reasons/store";
import { monthlyAmount, stageOf, tenureBand, tenureDays, type ExitInterview } from "@/app/recruitment/_lib/exit-interview/types";
import type { DriverListRecord } from "@/app/recruitment/_lib/drivers/types";
import type { RecruitSite } from "@/app/recruitment/_lib/sites";

import { groupOfPosition } from "./manpower-daily-shared";
import type { ToAnswers, ToBoard, ToGroup, ToRow } from "./turnover-shared";

/**
 * ข้อมูลแท็บ TurnOver — **ฝั่งเซิร์ฟเวอร์เท่านั้น** (นิยามตัวเลข: `turnover-shared.ts`)
 *
 * อ่านคนพ้นสภาพชุดเดียวกับแท็บพ้นสภาพ (`getResignedDriverList`) + Exit Interview ทุกแถว · `withAnswers`
 * = ผู้ใช้มีสิทธิ์ `exit-interview` (หน้าเป็นคนเช็ค) — ไม่มีสิทธิ์ ไม่อ่านคำตอบออกจากฐานเลย
 */

type InterviewDoc = Pick<ExitInterview, "drivercode" | "exitDateISO" | "outcome" | "wave1" | "wave2" | "reference">;

/** กลุ่มงานของชีต — ตำแหน่งก่อน · Trailer แยกตู้/ปูนผง (SCCC) · Spare/ไม่รู้ตำแหน่ง ใช้ลูกค้า `… MS` / Mixer L */
function groupOf(d: DriverListRecord): ToGroup {
  const g = groupOfPosition(d.position);
  if (g === "Trailer") return /ปูน/.test(d.position) || /^sccc/i.test(d.customer.trim()) ? "Trailer ปูนผง" : "Trailer ตู้";
  if (g === "Mixer L" || g === "Mixer S" || g === "Cold Chain" || g === "Feed mill") return g;
  if (/\sMS$/i.test(d.customer)) return "Mixer S";
  return /spare|senior|mixer/i.test(`${d.position} ${d.customer}`) || !d.position ? "Mixer L" : "อื่น ๆ";
}

/** สาขาสองชุดเดียวกับแท็บ Manpower — ไม่รู้สาขา: งานโม่ = ลาดกระบัง · อื่น ๆ = สระบุรี+บางปะกง */
function siteOf(d: DriverListRecord, group: ToGroup): RecruitSite {
  if (d.siteKey === "latkrabang") return "latkrabang";
  if (d.siteKey === "saraburi" || d.siteKey === "bangpakong") return "saraburi-bangpakong";
  return group === "Mixer L" || group === "Mixer S" ? "latkrabang" : "saraburi-bangpakong";
}

export async function getTurnoverBoard(withAnswers: boolean): Promise<ToBoard> {
  const projection = withAnswers
    ? { drivercode: 1, exitDateISO: 1, outcome: 1, wave1: 1, wave2: 1, reference: 1 }
    : { drivercode: 1, exitDateISO: 1, outcome: 1, "wave1.completed": 1, "wave2.completed": 1, reference: 1 };
  const [resigned, master, docs] = await Promise.all([
    getResignedDriverList(),
    getResignMaster(),
    (await hrCol<InterviewDoc>("exitInterviews")).find({}, { projection }).toArray(),
  ]);
  const interviews = new Map(docs.map((d) => [`${d.drivercode}|${d.exitDateISO}`, d]));
  const byCode = new Map(master.reasons.map((r) => [r.code, r]));
  const today = todayInBangkok();

  const rows: ToRow[] = resigned.flatMap((d): ToRow[] => {
    const r = d.resignation;
    if (!r || r.kind !== "resign") return [];
    const iv = interviews.get(`${d.drivercode}|${r.dateISO}`);
    const m = byCode.get(r.reasonCode);
    const group = groupOf(d);
    const tenure = tenureDays(d.startDateISO, r.dateISO);
    const answers: ToAnswers | undefined =
      withAnswers && iv
        ? {
            stay: iv.wave1?.q4 ?? "",
            topic: iv.wave1?.q41Topic ?? "",
            score: iv.wave1?.q8Score ?? null,
            match: iv.wave1?.q6Match ?? "",
            income: monthlyAmount(String(iv.wave1?.q9Income ?? "")),
            newIncome: monthlyAmount(String(iv.wave1?.q91NewIncome ?? "")),
          }
        : undefined;
    return [
      {
        month: r.dateISO.slice(0, 7),
        site: siteOf(d, group),
        group,
        customer: d.customer,
        plant: d.plant,
        zone: iv?.reference?.stZone ?? "",
        rcOwner: iv?.reference?.rcOwner ?? "",
        channel: iv?.reference?.channel ?? "",
        tenure,
        band: tenureBand(tenure),
        newHire: Boolean(d.startDateISO) && d.startDateISO.slice(0, 4) === r.dateISO.slice(0, 4),
        exitType: r.exitType || m?.exitType || "",
        reason: r.reasonCode,
        category: /^[A-Z]+/.exec(r.reasonCode)?.[0] ?? "",
        controllable: r.controllable || m?.controllable || "",
        owner: r.owner || m?.owner || "",
        /* `stageOf` อ่านแค่ outcome + completed — projection แบบไม่มีคำตอบก็พอ */
        stage: stageOf(iv ? { outcome: iv.outcome, wave1: iv.wave1, wave2: iv.wave2 } : null, r.dateISO, today),
        ...(answers ? { answers } : {}),
      },
    ];
  });

  return {
    rows,
    categories: master.categories.map((c) => ({ prefix: c.prefix, label: c.label })),
    reasons: master.reasons.map((r) => ({ code: r.code, label: r.label, owner: r.owner, controllable: r.controllable })),
    withAnswers,
    readAt: new Date().toISOString(),
  };
}
