import { ObjectId, type WithId } from "mongodb";

import { etlCol, hrCol } from "@/lib/db";
import { findIssuedCodeByName, readDriver } from "@/app/recruitment/_lib/drivers/master";
import { isExitStatus, workStatusFullLabel } from "@/app/recruitment/_lib/drivers/types";
import { listApplications, updateApplication } from "@/app/recruitment/_lib/applications";
import {
  exitReasonText,
  normalizeStatus,
  type ApplicationStatus,
  type ApplicationSummary,
} from "@/app/recruitment/_lib/types";
import type { Requisition } from "./types";
import {
  LIST_LIMIT,
  RequisitionError,
  attachMatchStatus,
  person,
  requisitions,
  syncRequisitionForApplication,
  toRequisition,
  vehicle,
  type RequisitionDoc,
} from "./store";
import {
  END_OUTCOMES,
  HANDOVER_PASS,
  SECTIONS,
  SECTION_SPECS,
  STEP_META,
  fieldApplies,
  isOutcome,
  isSection,
  type AtmsBrief,
  type OnboardingPatch,
  type OnboardingRecord,
  type SuggestKey,
  type Suggestions,
} from "./onboarding";
import { getRepairBoard, getRepairStatuses, type RepairStatus } from "./repair-status";
import { isIssuedDriverCode, syncRegistryFromRequisition } from "./registry-sync";
import { loadDrivers, loadVehicles, type DriverOption, type VehicleOption } from "./options";

/**
 * ชั้นข้อมูลของหน้า “ติดตามพนักงานใหม่” — **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 *
 * ไม่มีคอลเลกชันของตัวเอง: คำขอ (`recruitment_requests` + `onboarding`) เป็นแกน แล้ว**ยืมอ่าน**
 * ใบสมัคร · ทะเบียน พจส. · ATMS (`employee_work_status`) · บอร์ดซ่อม — ทั้งหมดอ่านอย่างเดียว
 * ยกเว้นจุด sync ที่ประกาศไว้ใน `updateOnboardingSection()`
 */

const MAX_SHORT = 120;
const MAX_LONG = 1000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/* --------------------------------------------------------------------- ATMS */

interface WorkStatusDoc {
  employee_code?: unknown;
  latest_status?: string;
  latest_work_date?: string;
  months?: Record<string, Record<string, string>>;
}

/** ก้อนเดือน `{ "01": "ฝ" … }` → สรุปไม่กี่ค่า (ไล่ตามวันที่จริง คีย์ในก้อนไม่ได้เรียง) */
function atmsBrief(doc: WorkStatusDoc): AtmsBrief {
  const days: [string, string][] = [];
  for (const [month, byDay] of Object.entries(doc.months ?? {}))
    for (const [day, value] of Object.entries(byDay ?? {})) {
      const iso = day.length > 2 ? day : `${month}-${day.padStart(2, "0")}`;
      if (typeof value === "string" && value.trim()) days.push([iso, value.trim()]);
    }
  days.sort((a, b) => a[0].localeCompare(b[0]));

  const training = days.filter(([, v]) => v === "ฝ");
  const firstTraining = training[0]?.[0] ?? "";
  /* ออกงาน = `A…` หลังเริ่มฝึก · ไม่เคยฝึกเลย (คนเก่าย้ายมา) ไม่นับ */
  const firstWork = firstTraining
    ? (days.find(([iso, v]) => v.toUpperCase().startsWith("A") && iso > firstTraining)?.[0] ?? "")
    : "";
  const latest = (doc.latest_status ?? days.at(-1)?.[1] ?? "").trim();

  return {
    trainingDays: training.length,
    firstTraining,
    lastTraining: training.at(-1)?.[0] ?? "",
    firstWork,
    latestStatus: latest,
    latestLabel: workStatusFullLabel(latest),
    latestDate: (doc.latest_work_date ?? days.at(-1)?.[0] ?? "").slice(0, 10),
    exited: isExitStatus(latest),
  };
}

/** ATMS ของหลายรหัสในคิวรีเดียว — พังก็แค่ไม่มีข้อมูล ATMS */
async function readAtms(codes: string[]): Promise<Map<string, AtmsBrief>> {
  const out = new Map<string, AtmsBrief>();
  if (!codes.length) return out;
  try {
    const col = await etlCol<WorkStatusDoc>("workStatus");
    const docs = await col
      .find(
        { employee_code: { $in: [...codes, ...codes.map(Number).filter(Number.isFinite)] } },
        { projection: { employee_code: 1, latest_status: 1, latest_work_date: 1, months: 1 } },
      )
      .toArray();
    for (const doc of docs) out.set(String(doc.employee_code), atmsBrief(doc));
  } catch (err) {
    console.warn("[onboarding] อ่าน ATMS ไม่สำเร็จ —", err);
  }
  return out;
}

async function toRecords(docs: WithId<RequisitionDoc>[]): Promise<OnboardingRecord[]> {
  const atms = await readAtms([...new Set(docs.map((d) => d.drivercode).filter(Boolean))]);
  const rows = docs.map((doc) => ({
    ...toRequisition(doc),
    onboarding: doc.onboarding ?? {},
    atms: doc.drivercode ? (atms.get(doc.drivercode) ?? null) : null,
  }));
  await attachMatchStatus(rows);
  return rows;
}

/* --------------------------------------------------------------------- อ่าน */

export interface Hub {
  records: OnboardingRecord[];
  /** ทะเบียน → สถานะซ่อม (เฉพาะคันที่ไม่ปกติ) */
  repairs: Record<string, RepairStatus>;
}

/** วันที่ไทยของเวลา ISO (UTC) */
const bangkokDay = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : new Date(t + 7 * 3_600_000).toISOString().slice(0, 10);
};

/**
 * ใบสมัคร “ยกเลิก” ชุดเดียวกับหน้าผู้สมัคร → แถวของแท็บจบ/ยกเลิก
 * · เคยผูกอัตราไว้ → เติมคำขอ + ข้อมูลฝ่ายที่ถูกย้ายไป `pastOnboarding` · ไม่เคยผูก = แถวผู้สมัครเปล่า ๆ
 * · ใบที่ยังผูกอยู่ข้าม (แถวคำขอเดิมขึ้นเป็นจบเองผ่าน `stageOf()`)
 */
function cancelledRows(apps: ApplicationSummary[], docs: WithId<RequisitionDoc>[]): OnboardingRecord[] {
  const linked = new Set(docs.map((d) => d.match?.applicationId).filter(Boolean));
  const archived = new Map<string, { doc: WithId<RequisitionDoc>; past: NonNullable<RequisitionDoc["pastOnboarding"]>[number] }>();
  for (const doc of docs)
    for (const past of doc.pastOnboarding ?? []) if (past.applicationId) archived.set(past.applicationId, { doc, past });

  return apps
    .filter((a) => a.status === "cancelled" && !linked.has(a.id))
    .map((a) => {
      const hit = archived.get(a.id);
      const onboarding = Object.fromEntries(SECTIONS.flatMap((s) => (hit?.past[s] ? [[s, hit.past[s]]] : [])));
      const base: Requisition = hit
        ? toRequisition(hit.doc)
        : {
            id: a.id,
            code: "",
            requestedOn: bangkokDay(a.createdAt),
            position: "" as Requisition["position"],
            positionOther: "",
            customer: "",
            customerOther: "",
            plant: "",
            hireType: "unspecified",
            replace: null,
            vehicle: null,
            trainer: null,
            status: "cancelled",
            cancelReason: "",
            filledOn: "",
            match: null,
            drivercode: "",
            hireName: "",
            outcome: "",
            note: "",
            requester: { employeeId: "", name: "" },
            history: [],
            createdAt: a.createdAt,
            updatedAt: a.updatedAt,
          };
      return {
        ...base,
        id: a.id,
        match: null,
        hireName: a.fullName,
        drivercode: "",
        vehicle: null,
        trainer: null,
        filledOn: "",
        outcome: "",
        onboarding,
        atms: null,
        applicant: {
          applicationId: a.id,
          ref: a.ref,
          reason: a.exitReason ? exitReasonText(a) : "",
          cancelledOn: bangkokDay(a.updatedAt),
          requisitionId: hit ? hit.doc._id.toHexString() : "",
        },
      };
    });
}

/** ทุกคำขอ (อัตราว่างจนจบ) + ผู้สมัครที่ยกเลิก + ATMS + บอร์ดซ่อม — ขั้นของแต่ละแถวคิดฝั่ง client (`stageOf()`) */
export async function getHub(): Promise<Hub> {
  const col = await requisitions();
  const [docs, repairs, apps] = await Promise.all([
    col.find({}, { sort: { requestedOn: -1, code: -1 }, limit: LIST_LIMIT }).toArray(),
    getRepairStatuses(),
    listApplications(),
  ]);
  return { records: [...(await toRecords(docs)), ...cancelledRows(apps, docs)], repairs };
}

/** คำขอที่ไม่ได้ยกเลิก + ATMS — ตัวเลขกำลังคนของแดชบอร์ด (ไม่ต้องใช้บอร์ดซ่อม/ใบสมัครที่ยกเลิก) */
export async function getOnboardingRecords(): Promise<OnboardingRecord[]> {
  const col = await requisitions();
  return toRecords(await col.find({ status: { $ne: "cancelled" } }, { limit: LIST_LIMIT }).toArray());
}

const SUGGEST_PATHS: Record<SuggestKey, string> = {
  rcName: "onboarding.rc.values.rcName",
  zone: "onboarding.ka.values.zone",
  kaName: "onboarding.ka.values.kaName",
  trainingSite: "onboarding.ka.values.trainingSite",
  erName: "onboarding.er.values.erName",
};

async function getSuggestions(): Promise<Suggestions> {
  try {
    const col = await requisitions();
    const keys = Object.keys(SUGGEST_PATHS) as SuggestKey[];
    const lists = await Promise.all(keys.map((k) => col.distinct(SUGGEST_PATHS[k])));
    return Object.fromEntries(
      keys.map((k, i) => [
        k,
        (lists[i] as unknown[])
          .filter((v): v is string => typeof v === "string" && Boolean(v.trim()))
          .sort((a, b) => a.localeCompare(b, "th", { numeric: true })),
      ]),
    );
  } catch {
    return {};
  }
}

/* ------------------------------------------------------------ เส้นทางรายคน */

export interface JourneyApplication {
  ref: string;
  status: ApplicationStatus;
  createdAt: string;
  phone: string;
}

export interface Journey {
  record: OnboardingRecord;
  application: JourneyApplication | null;
  driver: { drivercode: string; name: string; startDate: string } | null;
  /** ยังไม่มีรหัส แต่ชื่อตรงกับคนในทะเบียน — ให้กดผูกได้ทันที */
  codeMatch: { drivercode: string; name: string } | null;
  /** บอร์ดซ่อมทั้งก้อน (ทะเบียน → สถานะ) — ขั้นยานยนต์ + ป้ายใต้ช่องเลือกรถของ KA · คันปกติไม่อยู่ในนี้ */
  repairs: Record<string, RepairStatus>;
  /** เวลาข้อมูลของบอร์ดซ่อม (`getRepairBoard().syncedAt`) — ขึ้นใต้สถานะในขั้นยานยนต์ */
  repairsSyncedAt: string | null;
  past: { fullName: string; archivedAt: string }[];
  suggestions: Suggestions;
  drivers: DriverOption[];
  vehicles: VehicleOption[];
}

async function readApplication(id: string): Promise<JourneyApplication | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await hrCol<{ _id: ObjectId; ref?: string; phone?: string; status?: unknown; createdAt?: string }>(
    "applications",
  );
  const doc = await col.findOne(
    { _id: new ObjectId(id) },
    { projection: { ref: 1, phone: 1, status: 1, createdAt: 1 } },
  );
  if (!doc) return null;
  return {
    ref: doc.ref ?? "",
    status: normalizeStatus(doc.status),
    createdAt: doc.createdAt ?? "",
    phone: doc.phone ?? "",
  };
}

/** ชื่อตรงตัว (ยุบช่องว่าง) กับรหัสที่ ATMS ออกให้ ซึ่งยังไม่ถูกผูกกับคำขออื่น */
async function findCodeByName(name: string, selfId: ObjectId): Promise<Journey["codeMatch"]> {
  const hit = await findIssuedCodeByName(name);
  if (!hit) return null;
  const taken = await (await requisitions()).findOne(
    { _id: { $ne: selfId }, drivercode: hit.drivercode, status: { $ne: "cancelled" } },
    { projection: { _id: 1 } },
  );
  return taken ? null : hit;
}

export async function getJourney(id: string): Promise<Journey | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await requisitions();
  const doc = await col.findOne({ _id: new ObjectId(id) });
  if (!doc) return null;

  const [record] = await toRecords([doc]);
  const soft = <T>(p: Promise<T>): Promise<T | null> =>
    p.catch((err) => {
      console.warn("[onboarding] อ่านข้อมูลเสริมไม่สำเร็จ —", err);
      return null;
    });

  const name = record.match?.fullName || record.hireName;
  const [application, driverDoc, codeMatch, repairBoard, suggestions, drivers, vehicles] = await Promise.all([
    record.match ? soft(readApplication(record.match.applicationId)) : null,
    record.drivercode
      ? soft(
          readDriver<{ driverName?: string; startDate?: string }>(record.drivercode, ["driverName", "startDate"]),
        )
      : null,
    record.drivercode ? null : soft(findCodeByName(name, doc._id)),
    getRepairBoard(),
    getSuggestions(),
    soft(loadDrivers()),
    soft(loadVehicles()),
  ]);

  return {
    record,
    application,
    driver: driverDoc
      ? {
          drivercode: record.drivercode,
          name: (driverDoc.driverName ?? "").trim(),
          startDate: (driverDoc.startDate ?? "").trim(),
        }
      : null,
    codeMatch,
    repairs: repairBoard.statuses,
    repairsSyncedAt: repairBoard.syncedAt,
    past: (doc.pastOnboarding ?? []).map((p) => ({ fullName: p.fullName, archivedAt: p.archivedAt })),
    suggestions,
    drivers: drivers ?? [],
    vehicles: vehicles?.vehicles ?? [],
  };
}

export interface RcForm {
  record: OnboardingRecord;
  codeMatch: Journey["codeMatch"];
  /** RC ผู้แจ้งที่เคยกรอก — กันสะกดคนละแบบ */
  rcNames: string[];
}

/** ส่วน RC ของคำขอหนึ่งใบ — กล่อง “ข้อมูล RC” บนหน้าผู้สมัครอ่านจากนี่ (เบากว่า `getJourney()`) */
export async function getRcForm(id: string): Promise<RcForm | null> {
  if (!ObjectId.isValid(id)) return null;
  const doc = await (await requisitions()).findOne({ _id: new ObjectId(id) });
  if (!doc) return null;
  const [record] = await toRecords([doc]);
  const [codeMatch, suggestions] = await Promise.all([
    record.drivercode
      ? null
      : findCodeByName(record.match?.fullName || record.hireName, doc._id).catch(() => null),
    getSuggestions(),
  ]);
  return { record, codeMatch, rcNames: suggestions.rcName ?? [] };
}

/* -------------------------------------------------------------------- บันทึก */

function cleanValues(patch: OnboardingPatch, before: Record<string, string>): Record<string, string> {
  const spec = SECTION_SPECS[patch.section];
  const input = patch.values && typeof patch.values === "object" ? patch.values : {};
  const out: Record<string, string> = {};

  for (const field of spec.fields) {
    if (field.readOnly) {
      if (before[field.key]) out[field.key] = before[field.key];
      continue;
    }
    if (!fieldApplies(field, input as Record<string, string>)) continue;
    const raw = (input as Record<string, unknown>)[field.key];
    const v = typeof raw === "string" ? raw.trim() : typeof raw === "number" ? String(raw) : "";
    if (!v) continue;

    const max = field.kind === "textarea" ? MAX_LONG : MAX_SHORT;
    if (v.length > max) throw new RequisitionError(`${field.label}ยาวเกิน ${max} ตัวอักษร`);
    if (field.kind === "date" && !ISO.test(v)) throw new RequisitionError(`${field.label}ไม่ถูกต้อง`);
    if (field.kind === "number" && !(Number(v) >= 0 && Number(v) <= 1000))
      throw new RequisitionError(`${field.label}ต้องเป็นตัวเลข`);
    if (field.key === "outcome" ? !isOutcome(v) : field.kind === "select" && !field.options?.some((o) => o.value === v))
      throw new RequisitionError(`${field.label}: ไม่มีตัวเลือก “${v}”`);

    out[field.key] = v;
  }
  return out;
}

function changeNote(patch: OnboardingPatch, before: Record<string, string>, after: Record<string, string>): string[] {
  const changes: string[] = [];
  for (const field of SECTION_SPECS[patch.section].fields) {
    const a = before[field.key] ?? "";
    const b = after[field.key] ?? "";
    if (a === b) continue;
    if (!b) changes.push(`ล้าง${field.label}`);
    else if (field.kind === "select" || field.kind === "date" || field.kind === "number")
      changes.push(`${field.label} ${field.options?.find((o) => o.value === b)?.label ?? b}`);
    else changes.push(field.label);
  }
  return changes;
}

/**
 * บันทึกข้อมูลของ**ฝ่ายเดียว** (`$set` เฉพาะ `onboarding.<ฝ่าย>` — สองฝ่ายบันทึกพร้อมกันไม่ทับกัน)
 *
 * **จุด sync ที่ระบบทำให้เอง**
 * - RC `drivercode` → สะพานไปตารางฝึกงาน/ทะเบียน/ATMS (ต้องมีในทะเบียนหรือ ATMS ออกรหัสแล้ว)
 *   และ**รับเข้าทะเบียนประวัติ** · ผลสิ้นสุด + วันที่ → บันทึกพ้นสภาพในทะเบียน (`registry-sync.ts`)
 * - KA ครูฝึก/รถ → เขียนลงตัวคำขอ (แหล่งเดียวกับที่ตารางฝึกงานอ่าน)
 * - รับรถ “ผ่าน” + มีวันรับรถ → ใบสมัครที่ผูกไว้เป็น “ปฏิบัติงาน”
 */
export async function updateOnboardingSection(
  id: string,
  patch: OnboardingPatch,
  by: string,
): Promise<OnboardingRecord> {
  if (!isSection(patch.section)) throw new RequisitionError("ไม่รู้จักส่วนที่จะบันทึก");
  if (!ObjectId.isValid(id)) throw new RequisitionError("ไม่พบคำขอที่ระบุ");

  const col = await requisitions();
  const current = await col.findOne({ _id: new ObjectId(id) });
  if (!current) throw new RequisitionError("ไม่พบคำขอที่ระบุ");

  const before = current.onboarding?.[patch.section]?.values ?? {};
  const values = cleanValues(patch, before);
  if (patch.section === "rc" && patch.exit && typeof patch.exit === "object") {
    const outcome = typeof patch.exit.outcome === "string" ? patch.exit.outcome.trim() : "";
    const exitOn = typeof patch.exit.exitOn === "string" ? patch.exit.exitOn.trim() : "";
    /* ค่าเดิมที่นำเข้า (เช่น “รับรถแล้ว”) ส่งกลับมาได้ · ค่าใหม่ต้องเป็นผลสิ้นสุดจริง */
    if (outcome && outcome !== before.outcome && !END_OUTCOMES.some((o) => o.value === outcome))
      throw new RequisitionError(`ผลสิ้นสุด: ไม่มีตัวเลือก “${outcome}”`);
    if (exitOn && !ISO.test(exitOn)) throw new RequisitionError("วันที่สิ้นสุดไม่ถูกต้อง");
    if (outcome && END_OUTCOMES.some((o) => o.value === outcome) && !exitOn)
      throw new RequisitionError("ระบุวันที่สิ้นสุด");
    delete values.outcome;
    delete values.exitOn;
    if (outcome) values.outcome = outcome;
    if (exitOn) values.exitOn = exitOn;
  }
  const at = new Date().toISOString();
  const set: Record<string, unknown> = {
    [`onboarding.${patch.section}`]: { values, updatedAt: at, updatedBy: by },
    updatedAt: at,
  };
  const changes = changeNote(patch, before, values);

  if (patch.section === "rc" && typeof patch.drivercode === "string") {
    const code = patch.drivercode.trim();
    if (code !== (current.drivercode ?? "")) {
      if (code && !(await isIssuedDriverCode(code)))
        throw new RequisitionError(`ไม่พบรหัส พจส. ${code} ในทะเบียนประวัติหรือใน ATMS`);
      set.drivercode = code;
      changes.push(code ? `ผูกรหัส ${code}` : "ถอดรหัส พจส.");
    }
  }

  if (patch.section === "ka") {
    if (typeof patch.trainerDrivercode === "string" && patch.trainerDrivercode !== (current.trainer?.drivercode ?? "")) {
      const trainer = patch.trainerDrivercode ? await person(patch.trainerDrivercode, "ครูฝึก") : null;
      set.trainer = trainer;
      changes.push(trainer ? `ครูฝึก ${trainer.name}` : "ถอดครูฝึก");
    }
    if (typeof patch.vehicleCode === "string" && patch.vehicleCode !== (current.vehicle?.code ?? "")) {
      const next = await vehicle(patch.vehicleCode);
      set.vehicle = next;
      changes.push(next ? `รถ ${next.code}` : "ถอดรถ");
    }
  }

  const note = `${STEP_META[patch.section].short}${changes.length ? ` — ${changes.slice(0, 4).join(" · ")}` : ""}`;
  const updated = await col.findOneAndUpdate(
    { _id: current._id },
    { $set: set, $push: { history: { at, by, from: current.status, to: current.status, note } } },
    { returnDocument: "after" },
  );
  if (!updated) throw new RequisitionError("ไม่พบคำขอที่ระบุ");

  /* รับรถผ่าน → ใบสมัครเป็น “ปฏิบัติงาน” (ล้มเหลวไม่ทำให้การบันทึกของฝ่ายนี้ล้ม) */
  if (patch.section === "handover" && values.handoverOn && values.result === HANDOVER_PASS && current.match) {
    try {
      const app = await readApplication(current.match.applicationId);
      if (app?.status === "training") {
        await updateApplication(current.match.applicationId, { status: "working" }, by);
        await syncRequisitionForApplication(current.match.applicationId, "working", by);
      }
    } catch (err) {
      console.warn("[onboarding] อัปเดตใบสมัครเป็นปฏิบัติงานไม่สำเร็จ —", err);
    }
  }

  const [row] = await toRecords([updated]);

  /* รับเข้าทะเบียน/บันทึกพ้นสภาพ — ทุกครั้งที่ RC หรือขั้นรับรถบันทึก (ซ้ำได้ ไม่ทับคนที่อยู่ในทะเบียนแล้ว) */
  if (patch.section === "rc" || patch.section === "handover") {
    try {
      await syncRegistryFromRequisition(row, by);
    } catch (err) {
      console.warn("[onboarding] ส่งเข้าทะเบียนประวัติไม่สำเร็จ —", err);
    }
  }
  return row;
}
