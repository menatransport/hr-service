import {
  driverDocTypeLabel,
  workStatusFullLabel,
  type DriverRecord,
} from "./types";
import type { DriverExportRow, DriverProfileRecord } from "./registry";
import {
  stageOf,
  trainingStart,
  val,
  type OnboardingRecord,
} from "@/app/recruitment/_lib/requisitions/onboarding";

/**
 * รูปข้อมูล **สาธารณะ** ของ API ทะเบียน พจส. — แปลงจาก `DriverRecord` (รูปภายในที่หน้าจอใช้)
 * เป็นสัญญาที่ระบบอื่นเอาไปใช้ต่อได้ **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 *
 * แยกไฟล์เพราะมีผู้ใช้สองเส้น (`GET /api/drivers/{code}` และ `…/work`) และเพื่อกัน
 * ไม่ให้การแก้รูปภายในของหน้าจอไปเปลี่ยนสัญญาของ API โดยไม่ตั้งใจ
 *
 * กติกา: camelCase · วันที่ `YYYY-MM-DD` · เวลา ISO 8601 · **ไม่มีค่าใช้ `null` เสมอ**
 * (ไม่ใช้ `""`) · ไม่ส่งค่าดิบของ ETL ที่ผู้ใช้ภายนอกไม่ต้องรู้ (`statusOverride`, `vehicleRef` ฯลฯ)
 * — เปลี่ยนรูปเมื่อไหร่ต้องแก้ `api-docs.ts` และขยับเวอร์ชันด้วย
 */

const orNull = (v: string | null | undefined) => (v && v.trim() ? v : null);

/** สถานะหลัก 5 ค่า — `status` เดิม (active/resigned) ยังส่งอยู่เพื่อไม่ให้ผู้ใช้เดิมพัง */
export type DriverMainStatus = "working" | "training" | "resigned" | "transferred" | "to_pjs";

export const DRIVER_MAIN_STATUS_LABEL: Record<DriverMainStatus, string> = {
  working: "ปฏิบัติงาน",
  training: "ฝึกงาน",
  resigned: "พ้นสภาพ",
  transferred: "ย้ายไปรถร่วม",
  to_pjs: "ย้ายไปพจส.",
};

const EXIT_KIND_STATUS = { resign: "resigned", transfer: "transferred", pjs: "to_pjs" } as const;

export interface DriverDto {
  drivercode: string;
  name: string;
  photoUrl: string | null;
  status: "active" | "resigned";
  mainStatus: DriverMainStatus;
  mainStatusLabel: string;
  /** วันเกิด `YYYY-MM-DD` · อายุ ณ วันนี้ (ไม่มีวันเกิด = อายุที่ตอบในใบสมัคร) */
  birthDate: string | null;
  age: number | null;
  /** `true` = พ้นสภาพแล้ว — `contact`, `license`, `idCard` เป็น `null` โดยเจตนา */
  personalHidden: boolean;
  employment: {
    ownerType: { key: string | null; label: string | null };
    branch: string | null;
    site: { key: string | null; label: string | null };
    startDate: string | null;
    tenureMonths: number | null;
    /** เศษวันหลังหักเดือนเต็ม — คู่กับ `tenureMonths` เป็น “x เดือน y วัน” แบบไฟล์ Excel */
    tenureDays: number | null;
  };
  /** จากคำขอสรรหาที่ผูกรหัสนี้ (หน้าติดตามพนักงานใหม่) · `null` = ไม่ได้มาจากคำขอสรรหา */
  recruitment: {
    jr: string;
    requisitionId: string;
    /** วันที่แจ้งสรรหา */
    requestedOn: string | null;
    /** วันเริ่มฝึกงาน — RC กรอก → วันปิดอัตรา → วันแรกที่ ATMS ลง `ฝ` */
    trainingStartOn: string | null;
    /** วันที่ RC ลง `ร` (รอรับรถ) รอบล่าสุด */
    handoverMarkedOn: string | null;
    /** วันที่รับรถแล้ว (KA บันทึก) */
    handoverOn: string | null;
  } | null;
  contact: {
    phone: string | null;
    phoneAlt: string | null;
    emergency: { name: string | null; relation: string | null; phone: string | null };
  } | null;
  license: {
    number: string | null;
    type: string | null;
    expiryDate: string | null;
    daysLeft: number | null;
  } | null;
  idCard: { number: string | null; expiryDate: string | null; daysLeft: number | null } | null;
  vehicle: {
    code: string | null;
    plateNo: string | null;
    type: string | null;
    brand: string | null;
    model: string | null;
    customer: string | null;
    plant: string | null;
  } | null;
  resignation: {
    /** `transfer` = ย้ายไปรถร่วม · `pjs` = ย้ายไปพจส. */
    kind: "resign" | "transfer" | "pjs";
    date: string;
    reasonCode: string;
    reasonLabel: string;
    category: string | null;
    exitType: "vol" | "inv" | "disap" | null;
    note: string | null;
    recordedAt: string | null;
    recordedBy: string | null;
  } | null;
  /** สรุปสถานะล่าสุด — รายวัน/รายเดือนอยู่ที่ `GET /api/drivers/{drivercode}/work` */
  work: { latestStatus: string; latestStatusLabel: string; latestDate: string | null } | null;
  documents: {
    fileId: string;
    docType: string;
    docTypeLabel: string;
    name: string;
    contentType: string;
    size: number;
    uploadedAt: string | null;
    url: string;
  }[];
}

/**
 * สถานะหลัก — พ้นสภาพตาม `resignation.kind` · ยังอยู่: คำขอสรรหายังไม่รับรถ (ขั้นฝึกงาน/รอรับรถ) = ฝึกงาน
 * · ไม่ได้มาจากคำขอสรรหา (นำเข้า Excel) ดูสถานะ ATMS ล่าสุด `ฝ` · นอกนั้นปฏิบัติงาน
 */
function mainStatusOf(d: DriverProfileRecord, onboarding: OnboardingRecord | null): DriverMainStatus {
  if (!d.active) return EXIT_KIND_STATUS[d.resignation?.kind ?? "resign"];
  if (onboarding) {
    const stage = stageOf(onboarding);
    return stage === "training" || stage === "recruiting" ? "training" : "working";
  }
  return d.work?.latestStatus === "ฝ" ? "training" : "working";
}

/** เลขรถ/ทะเบียนเมื่อไม่พบรถใน ATMS — ค่าที่กรอกในทะเบียน (ลาดกระบัง = เลขรถ · สาขาอื่น = ทะเบียน) ชุดเดียวกับไฟล์ Excel */
function vehicleOf(d: DriverProfileRecord): DriverDto["vehicle"] {
  const ref = d.vehicle ? "" : d.vehicleRef;
  if (!d.vehicle && !ref && !orNull(d.customer) && !orNull(d.plant)) return null;
  return {
    code: orNull(d.vehicle?.code ?? (d.siteKey === "latkrabang" ? ref : "")),
    plateNo: orNull(d.vehicle?.plateNo ?? (d.siteKey === "latkrabang" ? "" : ref)),
    type: orNull(d.vehicle?.vehicleType),
    brand: orNull(d.vehicle?.brand),
    model: orNull(d.vehicle?.model),
    customer: orNull(d.customer),
    plant: orNull(d.plant),
  };
}

export function toDriverDto(d: DriverProfileRecord, onboarding: OnboardingRecord | null = null): DriverDto {
  const code = encodeURIComponent(d.drivercode);
  const hidden = d.personalHidden;
  const mainStatus = mainStatusOf(d, onboarding);

  return {
    drivercode: d.drivercode,
    name: d.name,
    photoUrl: orNull(d.photoUrl),
    status: d.active ? "active" : "resigned",
    mainStatus,
    mainStatusLabel: DRIVER_MAIN_STATUS_LABEL[mainStatus],
    birthDate: orNull(d.birthDateISO),
    age: d.age,
    personalHidden: hidden,
    employment: {
      ownerType: { key: d.ownerTypeKey, label: orNull(d.ownerTypeLabel) },
      branch: orNull(d.branch),
      site: { key: d.siteKey, label: orNull(d.siteLabel) },
      startDate: orNull(d.startDateISO),
      tenureMonths: d.tenureMonths,
      tenureDays: d.tenureDays,
    },
    recruitment: onboarding
      ? {
          jr: onboarding.code,
          requisitionId: onboarding.id,
          requestedOn: orNull(onboarding.requestedOn),
          trainingStartOn: orNull(trainingStart(onboarding)),
          handoverMarkedOn: orNull(onboarding.handoverMarkedOn),
          handoverOn: orNull(val(onboarding.onboarding, "handover", "handoverOn")),
        }
      : null,
    contact: hidden
      ? null
      : {
          phone: orNull(d.phone),
          phoneAlt: orNull(d.phoneAlt),
          emergency: {
            name: orNull(d.emergencyContactName),
            relation: orNull(d.emergencyContactRelation),
            phone: orNull(d.emergencyContactPhone),
          },
        },
    license: hidden
      ? null
      : {
          number: orNull(d.licenseNo),
          type: orNull(d.licenseType),
          expiryDate: orNull(d.licenseExpiryISO),
          daysLeft: d.licenseDaysLeft,
        },
    idCard: hidden
      ? null
      : { number: orNull(d.nationalId), expiryDate: orNull(d.idCardExpiryISO), daysLeft: d.idCardDaysLeft },
    vehicle: vehicleOf(d),
    resignation: d.resignation
      ? {
          kind: d.resignation.kind,
          date: d.resignation.dateISO,
          reasonCode: d.resignation.reasonCode,
          reasonLabel: d.resignation.reasonLabel,
          category: orNull(d.resignation.categoryLabel),
          exitType: d.resignation.exitType || null,
          note: orNull(d.resignation.note),
          recordedAt: orNull(d.resignation.recordedAt),
          recordedBy: orNull(d.resignation.recordedBy),
        }
      : null,
    work: d.work?.latestStatus
      ? {
          latestStatus: d.work.latestStatus,
          latestStatusLabel: workStatusFullLabel(d.work.latestStatus),
          latestDate: orNull(d.work.latestWorkDateISO),
        }
      : null,
    documents: d.documents.map((doc) => ({
      fileId: doc.fileId,
      docType: doc.docType,
      docTypeLabel: driverDocTypeLabel(doc.docType),
      name: doc.name,
      contentType: doc.type,
      size: doc.size,
      uploadedAt: orNull(doc.uploadedAt),
      url: `/api/drivers/${code}/documents/${encodeURIComponent(doc.fileId)}`,
    })),
  };
}

/**
 * แถวของ `GET /api/drivers` — ชุดเดียวกับไฟล์ Excel หน้าทะเบียน: `DriverDto` ไม่มี `documents`
 * + ตำแหน่ง · บัญชีรับเงิน (อยู่ในไฟล์ Excel จึงออกทางนี้ด้วย — พ้นสภาพแล้วเป็น `null` เหมือนข้อมูลส่วนบุคคลอื่น)
 * · การแก้ประวัติล่าสุด · ที่มาในทะเบียน
 */
export type DriverListItemDto = Omit<DriverDto, "documents"> & {
  position: string | null;
  bank: { accountNo: string | null; branch: string | null } | null;
  lastEdit: { at: string | null; by: string | null };
  registry: { source: string | null; at: string | null };
};

export function toDriverListItemDto(d: DriverExportRow, onboarding: OnboardingRecord | null = null): DriverListItemDto {
  const { documents, ...item } = toDriverDto(d, onboarding);
  void documents;
  return {
    ...item,
    position: orNull(d.position),
    bank: d.personalHidden ? null : { accountNo: orNull(d.bankAccountNo), branch: orNull(d.bankBranch) },
    lastEdit: { at: orNull(d.profileEditedAt), by: orNull(d.profileEditedBy) },
    registry: { source: orNull(d.source), at: orNull(d.sourceAt) },
  };
}

/* ------------------------------------------------------------ สถานะรายวัน */

export interface DriverWorkDto {
  drivercode: string;
  range: { from: string; to: string };
  latest: { status: string; label: string; date: string | null } | null;
  /** เรียงตามวันที่ · หนึ่งวันหนึ่งแถว — ATMS มาก่อน ฝ่ายบุคคลกรอกเองใช้เมื่อ ATMS ไม่มีวันนั้น */
  days: {
    date: string;
    status: string;
    label: string;
    source: "atms" | "hr";
    note: string | null;
  }[];
  /** จำนวนวันที่ออกงานจริง (รหัสขึ้นต้นด้วย `A`) รายเดือน */
  months: { month: string; workDays: number }[];
}

export function toWorkDto(d: DriverRecord, from: string, to: string): DriverWorkDto {
  const inRange = (iso: string) => iso >= from && iso <= to;
  const atms = d.work?.days ?? {};
  const dates = new Set(
    [...Object.keys(atms), ...Object.keys(d.manualDays)].filter(inRange),
  );

  const days = [...dates].sort().map((date) => {
    const fromAtms = atms[date];
    const hr = d.manualDays[date];
    const status = fromAtms || hr?.code || "";
    return {
      date,
      status,
      label: workStatusFullLabel(status),
      source: fromAtms ? ("atms" as const) : ("hr" as const),
      note: fromAtms ? null : orNull(hr?.note),
    };
  });

  const fromMonth = from.slice(0, 7);
  const toMonth = to.slice(0, 7);

  return {
    drivercode: d.drivercode,
    range: { from, to },
    latest: d.work?.latestStatus
      ? {
          status: d.work.latestStatus,
          label: workStatusFullLabel(d.work.latestStatus),
          date: orNull(d.work.latestWorkDateISO),
        }
      : null,
    days,
    months: (d.work?.months ?? [])
      .filter((m) => m.key >= fromMonth && m.key <= toMonth)
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((m) => ({ month: m.key, workDays: m.days })),
  };
}
