import {
  driverDocTypeLabel,
  workStatusFullLabel,
  type DriverRecord,
} from "./types";
import type { DriverProfileRecord } from "./registry";

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

export interface DriverDto {
  drivercode: string;
  name: string;
  photoUrl: string | null;
  status: "active" | "resigned";
  /** `true` = พ้นสภาพแล้ว — `contact`, `license`, `idCard` เป็น `null` โดยเจตนา */
  personalHidden: boolean;
  employment: {
    ownerType: { key: string | null; label: string | null };
    branch: string | null;
    site: { key: string | null; label: string | null };
    startDate: string | null;
    tenureMonths: number | null;
  };
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

export function toDriverDto(d: DriverProfileRecord): DriverDto {
  const code = encodeURIComponent(d.drivercode);
  const hidden = d.personalHidden;

  return {
    drivercode: d.drivercode,
    name: d.name,
    photoUrl: orNull(d.photoUrl),
    status: d.active ? "active" : "resigned",
    personalHidden: hidden,
    employment: {
      ownerType: { key: d.ownerTypeKey, label: orNull(d.ownerTypeLabel) },
      branch: orNull(d.branch),
      site: { key: d.siteKey, label: orNull(d.siteLabel) },
      startDate: orNull(d.startDateISO),
      tenureMonths: d.tenureMonths,
    },
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
    vehicle: d.vehicle
      ? {
          code: orNull(d.vehicle.code),
          plateNo: orNull(d.vehicle.plateNo),
          type: orNull(d.vehicle.vehicleType),
          brand: orNull(d.vehicle.brand),
          model: orNull(d.vehicle.model),
          customer: orNull(d.customer),
          plant: orNull(d.plant),
        }
      : null,
    resignation: d.resignation
      ? {
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
