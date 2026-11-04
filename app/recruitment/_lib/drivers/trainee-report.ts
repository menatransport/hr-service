import { ObjectId } from "mongodb";

import { hrCol } from "@/lib/db";
import { displayAnswer } from "@/app/recruitment/_lib/form";
import { listActiveQuestions } from "@/app/recruitment/_lib/questions";
import type { AnswerMap } from "@/app/recruitment/_lib/types";
import { getOnboardingRecords } from "@/app/recruitment/_lib/requisitions/onboarding-store";
import { awaitingHandover, type OnboardingRecord } from "@/app/recruitment/_lib/requisitions/onboarding";
import { customerLabel, positionLabel } from "@/app/recruitment/_lib/requisitions/types";
import { IN_REGISTRY } from "./master";
import { loadManualDay } from "./registry";
import { requisitionDailyKey } from "./types";
import { getTraineeBoard } from "./trainee-board";
import { REPORT_ISSUES, issueOf, type ReportIssue } from "./trainees";

/**
 * รายงานสถานะฝึกงานประจำวัน (“🚨RC Alert”) ที่ RC คัดลอกไปส่งกลุ่มไลน์ — **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 * template มาจากฝ่ายบุคคล (Bew 25 ต.ค. 2569) สามส่วน:
 *
 * 1. **Issue** — สถานะรายวันของวันนั้นที่ตรงหัวข้อ `REPORT_ISSUES` (ที่ RC กรอกเองชนะ ATMS ·
 *    เหตุผลมาจากช่องเหตุผลตอนกรอก) · คนในรายงาน = ใบสมัครที่ “ฝึกงาน” อยู่ + ทุกคนที่มีบันทึกเองวันนั้น
 *    (คนที่เพิ่งลาออก/ถูกปลด ใบสมัครย้ายไปยกเลิกแล้วแต่ยังต้องขึ้นรายงานวันนั้น)
 * 2. **พนักงานใหม่มาเริ่มงาน** — วันเริ่มฝึก (`onboarding.rc.trainingStartOn`) ตรงกับวันที่รายงาน
 * 3. **รอรับรถ** — `awaitingHandover()`: ฝึกครบ 10 วัน (เฉพาะวันฝึกงาน) + ปฐมนิเทศแล้ว + ST ประเมินผ่าน (กติกาเดียวกับแดชบอร์ด)
 *
 * ข้อมูลคน: ทะเบียน พจส. ก่อน (คำนำหน้า · ตำแหน่ง · ลูกค้า · แพล้นท์ ตามที่ฝ่ายบุคคลเขียน) ไม่มีค่อยใช้คำขอสรรหา
 * + คำตอบ “คำนำหน้า” ในใบสมัคร
 */

/** ตำแหน่งในคำขอสรรหาเป็นรหัสสั้น — รายงานเขียนแบบทะเบียน พจส. */
const POSITION_TEXT: Partial<Record<string, string>> = { ML: "Mixer L", MS: "Mixer S" };
const LINE = "-----------------------------";

interface Person {
  code: string;
  prefix: string;
  name: string;
  position: string;
  customer: string;
  plant: string;
}

interface RegistryLite {
  drivercode?: unknown;
  prefix?: unknown;
  driverName?: unknown;
  position?: unknown;
  customer?: unknown;
  plant?: unknown;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

/** `22.10.69` — วัน.เดือน.ปี พ.ศ. 2 หลัก ตาม template */
function reportDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${String((y + 543) % 100).padStart(2, "0")}`;
}

/** หนึ่งบรรทัดของคน — เว้นวรรคตามตัวอย่างของฝ่ายบุคคล (ชื่อ ↔ ตำแหน่งเว้นกว้างกว่า) */
function personLine(p: Person): string {
  return [p.code, p.prefix, `${p.name}        ${p.position}`, p.customer, p.plant].filter(Boolean).join("    ");
}

/** ชื่อในทะเบียนบางแถวพิมพ์คำนำหน้าติดมา — ตัดออกไม่ให้ซ้ำกับช่องคำนำหน้า */
function stripPrefix(name: string, prefix: string): string {
  return prefix && name.startsWith(prefix) ? name.slice(prefix.length).trim() : name;
}

export async function buildTraineeReport(dateISO: string): Promise<string> {
  const [records, dayEntries, questions] = await Promise.all([
    getOnboardingRecords(),
    loadManualDay(dateISO),
    listActiveQuestions(),
  ]);

  const active = records.filter((r) => r.match && !r.applicant);
  const training = active.filter((r) => r.match?.status === "training" && r.drivercode);
  const codes = [...new Set([...training.map((r) => r.drivercode), ...dayEntries.map((e) => e.drivercode)])];

  /* ATMS ของวันนั้น (เดือนที่วันนั้นอยู่) — พังได้ ยังออกรายงานจากที่กรอกเองได้ */
  const atms = new Map<string, string>();
  if (codes.length) {
    try {
      const board = await getTraineeBoard(dateISO.slice(0, 7), codes);
      for (const d of board.drivers) if (d.days[dateISO]) atms.set(d.drivercode, d.days[dateISO]);
    } catch (err) {
      console.warn("[trainee-report] อ่านสถานะ ATMS ไม่สำเร็จ —", err);
    }
  }
  const manual = new Map(dayEntries.map((e) => [e.drivercode, e]));

  /* คนที่ต้องหาข้อมูล = ทุกรหัสในรายงาน + คนเริ่มงาน + รอรับรถ */
  const starters = active.filter(
    (r) => (r.match?.status === "training" || r.match?.status === "interview_passed") && r.trainingStartOn === dateISO,
  );
  const waiting = active.filter(awaitingHandover);
  const allCodes = [...new Set([...codes, ...starters.map((r) => r.drivercode), ...waiting.map((r) => r.drivercode)])].filter(Boolean);
  const people = await peopleOf(allCodes, [...training, ...starters, ...waiting], questions);
  const personOf = (r: OnboardingRecord): Person =>
    (r.drivercode && people.byCode.get(r.drivercode)) || people.fromRecord(r);

  /* ---------- 1. Issue */
  const issues = new Map<ReportIssue, { person: Person; reason: string }[]>();
  for (const code of codes) {
    const own = manual.get(code);
    const status = own?.code || atms.get(code) || "";
    const key = issueOf(status, own?.trial === true);
    if (!key) continue;
    /* `rq:<id>` = กรอกไว้ก่อนมีรหัส พจส. — หาคนจากคำขอ */
    const record =
      training.find((r) => r.drivercode === code) ?? active.find((r) => requisitionDailyKey(r.id) === code);
    const person = people.byCode.get(code) ?? (record ? people.fromRecord(record) : { code, prefix: "", name: "", position: "", customer: "", plant: "" });
    const list = issues.get(key) ?? [];
    list.push({ person, reason: own?.note ?? "" });
    issues.set(key, list);
  }

  const out: string[] = ["เรียน : @all", "", `🚨RC Alert : สถานะฝึกงานวันที่ ${reportDate(dateISO)}`, ""];

  if (!issues.size) {
    out.push("🔔 สถานะ: วันนี้พจส. มาฝึกงานครบทุกคน", "");
  } else {
    for (const issue of REPORT_ISSUES) {
      const list = issues.get(issue.key);
      if (!list?.length) continue;
      out.push(`🔔 Issue = ${issue.label}`);
      for (const { person, reason } of list) {
        out.push(`🔹${personLine(person)}`);
        if (reason) out.push(`: เนื่องจาก ${reason}`);
      }
      out.push("");
    }
  }

  /* ---------- 2. พนักงานใหม่ */
  out.push(LINE, "");
  if (starters.length) {
    out.push(`🚨 วันนี้มีพนักงานใหม่มาเริ่มงาน ${starters.length} คนค่ะ`);
    for (const r of starters) out.push(`🔹${personLine(personOf(r))}`);
  } else {
    out.push("🚨 วันนี้ไม่มีพนักงานใหม่มาเริ่มงานค่ะ");
  }

  /* ---------- 3. รอรับรถ */
  out.push("", LINE, "", `สถานะรอรับรถปัจจุบันจำนวน ${waiting.length} คน`);
  waiting.forEach((r, i) => out.push(`${i + 1}. ${personLine(personOf(r))}`));

  return out.join("\n").trimEnd();
}

/** ข้อมูลคนจากทะเบียน (ตามรหัส) + ตัวสร้างจากคำขอสรรหาสำหรับคนที่ยังไม่มีในทะเบียน */
async function peopleOf(
  codes: string[],
  records: OnboardingRecord[],
  questions: Awaited<ReturnType<typeof listActiveQuestions>>,
) {
  const docs = codes.length
    ? await (await hrCol<RegistryLite>("drivers"))
        .find(
          { ...IN_REGISTRY, drivercode: { $in: codes } },
          { projection: { _id: 0, drivercode: 1, prefix: 1, driverName: 1, position: 1, customer: 1, plant: 1 } },
        )
        .toArray()
    : [];

  /* คำนำหน้าจากใบสมัคร — คำถามที่ป้ายมีคำว่า “คำนำหน้า” */
  const titleQ = questions.find((q) => q.label.includes("คำนำหน้า"));
  const appIds = [...new Set(records.map((r) => r.match?.applicationId).filter((id): id is string => Boolean(id && ObjectId.isValid(id))))];
  const titles = new Map<string, string>();
  if (titleQ && appIds.length) {
    const apps = await (await hrCol<{ answers?: AnswerMap }>("applications"))
      .find({ _id: { $in: appIds.map((id) => new ObjectId(id)) } }, { projection: { answers: 1 } })
      .toArray();
    for (const app of apps) {
      const title = displayAnswer(app.answers?.[titleQ.key], titleQ.options);
      if (title && title !== "—") titles.set(app._id.toHexString(), title);
    }
  }

  const recordByCode = new Map(records.filter((r) => r.drivercode).map((r) => [r.drivercode, r]));
  const fromRecord = (r: OnboardingRecord): Person => ({
    code: r.drivercode,
    prefix: titles.get(r.match?.applicationId ?? "") ?? "",
    name: r.match?.fullName || r.hireName,
    position: POSITION_TEXT[r.position] ?? positionLabel(r),
    customer: customerLabel(r),
    plant: r.plant,
  });

  const byCode = new Map<string, Person>();
  for (const doc of docs) {
    const code = str(doc.drivercode);
    const record = recordByCode.get(code);
    const fallback = record ? fromRecord(record) : null;
    const prefix = str(doc.prefix) || fallback?.prefix || "";
    byCode.set(code, {
      code,
      prefix,
      name: stripPrefix(str(doc.driverName), prefix) || fallback?.name || "",
      position: str(doc.position) || fallback?.position || "",
      customer: str(doc.customer) || fallback?.customer || "",
      plant: str(doc.plant) || fallback?.plant || "",
    });
  }
  return { byCode, fromRecord };
}
