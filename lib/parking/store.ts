import { ObjectId, MongoServerError } from "mongodb";

import { hrCol } from "@/lib/db";
import { nextSeq } from "@/lib/db/counters";

import {
  KIND_LABEL,
  OWNERSHIP,
  PROVINCES,
  SITES,
  plateKey,
  type Ownership,
  type ParkingVehicle,
  type SiteCode,
  type VehicleInput,
  type VehicleKind,
  type ScanResult,
  type VehicleStatus,
} from "./types";

/**
 * ชั้นข้อมูลของบริการจอดรถบริษัท — **ฝั่งเซิร์ฟเวอร์เท่านั้น** (`hr_service.parking_vehicles`)
 *
 * - ผู้เรียก (server actions) ตรวจสิทธิ์มาแล้ว: ตัวนี้รับ `actor` + `admin` แล้วกรองตามนั้นอีกชั้น
 *   — ผู้ใช้ทั่วไปเห็น/แก้ได้เฉพาะคันที่ตัวเองเป็นเจ้าของ (`ownerId`) หรือเป็นคนยื่น (`requestedBy`)
 * - ไม่ลบเลย — ยกเลิกบัตร = `status: "cancelled"` + ถอด `activePlate` (ทะเบียนเดิมลงใหม่ได้)
 * - กันลงซ้ำด้วยดัชนี unique sparse ของ `activePlate` (ทะเบียน+จังหวัด ของคันที่ยังไม่ยกเลิก)
 * - รหัสบัตรออกตอนอนุมัติจากตัวนับ `parking_counters` (`_id` = `E-LKB`) — atomic ไม่ชนกัน · ยกเลิกไม่คืนเลข
 * - ทุกการเปลี่ยนสถานะต่อท้าย `history` (ใคร · เมื่อไร · ทำอะไร · เหตุผล)
 * - ทุกการเปิดหน้าตรวจบัตร (สแกน QR) เขียน `parking_scans` — รวมครั้งที่ไม่มีสิทธิ์/ไม่พบบัตร
 */

export class ParkingError extends Error {}

interface HistoryEntry {
  at: string;
  by: string;
  action: "create" | "resubmit" | "approve" | "return" | "cancel";
  note?: string;
}

interface VehicleDoc extends Omit<ParkingVehicle, "id"> {
  _id: ObjectId;
  /** ทะเบียน+จังหวัดแบบเทียบได้ — มีเฉพาะคันที่ยังไม่ยกเลิก (ดัชนี unique sparse) */
  activePlate?: string;
  updatedAt: string;
  updatedBy: string;
  history: HistoryEntry[];
}

export interface Actor {
  employeeId: string;
  /** สิทธิ์ย่อย `parking-admin` */
  admin: boolean;
}

const col = () => hrCol<VehicleDoc>("parkingVehicles");
const nowIso = () => new Date().toISOString();
const todayBkk = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });

/** เอกสาร → ข้อมูลที่ส่งถึงหน้า — เลือกช่องเอง ไม่ส่ง `history` / ผู้แก้ล่าสุด / `activePlate` ออกไป */
const toVehicle = (d: VehicleDoc): ParkingVehicle => ({
  id: d._id.toHexString(),
  code: d.code ?? null,
  ownership: d.ownership,
  kind: d.kind,
  plate: d.plate,
  province: d.province,
  brand: d.brand,
  model: d.model,
  color: d.color,
  photo: d.photo ?? null,
  assetNo: d.assetNo,
  ownerId: d.ownerId,
  ownerName: d.ownerName,
  department: d.department,
  site: d.site,
  phone: d.phone,
  validUntil: d.validUntil,
  status: d.status,
  note: d.note,
  createdAt: d.createdAt,
  issuedAt: d.issuedAt ?? null,
  requestedBy: d.requestedBy,
});

/** เงื่อนไข “คันที่คนนี้เห็นได้” — แอดมินเห็นทุกคัน */
const scope = (actor: Actor) =>
  actor.admin ? {} : { $or: [{ ownerId: actor.employeeId }, { requestedBy: actor.employeeId }] };

const oid = (id: string) => {
  if (!ObjectId.isValid(id)) throw new ParkingError("ไม่พบรายการนี้");
  return new ObjectId(id);
};

export async function listVehicles(actor: Actor): Promise<ParkingVehicle[]> {
  const docs = await (await col()).find(scope(actor)).sort({ createdAt: -1, _id: -1 }).limit(2000).toArray();
  return docs.map(toVehicle);
}

/* ------------------------------------------------------------------ ตรวจข้อมูลที่ส่งมา */

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const oneOf = <T extends string>(v: unknown, keys: readonly T[], fallback: T): T =>
  keys.includes(v as T) ? (v as T) : fallback;

/** ทำความสะอาด + ตรวจช่องบังคับ — ฝั่งหน้าเช็กแล้ว แต่ข้อมูลจากเบราว์เซอร์เชื่อไม่ได้ */
function clean(input: VehicleInput): VehicleInput {
  const v: VehicleInput = {
    ownership: oneOf(input.ownership, Object.keys(OWNERSHIP) as Ownership[], "employee"),
    kind: oneOf(input.kind, Object.keys(KIND_LABEL) as VehicleKind[], "car"),
    plate: str(input.plate, 20).replace(/\s+/g, " "),
    province: str(input.province, 40),
    brand: str(input.brand, 60),
    model: str(input.model, 80),
    color: str(input.color, 40),
    photo: /^https:\/\//.test(str(input.photo, 1000)) ? str(input.photo, 1000) : null,
    assetNo: str(input.assetNo, 40),
    ownerId: str(input.ownerId, 20),
    ownerName: str(input.ownerName, 120),
    department: str(input.department, 200),
    site: oneOf(input.site, Object.keys(SITES) as SiteCode[], "LKB"),
    phone: str(input.phone, 30),
    validUntil: /^\d{4}-\d{2}-\d{2}$/.test(str(input.validUntil)) ? str(input.validUntil) : "",
  };
  const missing = [
    !v.plate && "ทะเบียนรถ",
    !PROVINCES.includes(v.province) && "จังหวัด",
    !v.brand && "ยี่ห้อ",
    !v.ownerName && "ชื่อผู้รับผิดชอบ",
    v.ownership !== "visitor" && !/^\d{4,10}$/.test(v.ownerId) && "รหัสพนักงาน",
    !v.phone && "เบอร์ติดต่อ",
    v.ownership === "company" && !v.assetNo && "เลขทรัพย์สิน",
    v.ownership === "visitor" && !v.validUntil && "วันหมดอายุบัตร",
    !v.photo && "รูปถ่ายรถ",
  ].filter(Boolean);
  if (missing.length) throw new ParkingError(`ข้อมูลไม่ครบ: ${missing.join(", ")}`);
  if (v.ownership === "visitor") v.ownerId = "";
  return v;
}

/** ชนดัชนี `activePlate` = ทะเบียนนี้มีคันที่ยังไม่ยกเลิกอยู่แล้ว */
function rethrowDup(err: unknown, plate: string, province: string): never {
  if (err instanceof MongoServerError && err.code === 11000 && JSON.stringify(err.keyPattern ?? {}).includes("activePlate"))
    throw new ParkingError(`ทะเบียน ${plate} ${province} ลงทะเบียนไว้แล้ว — รถหนึ่งคันมีบัตรได้ใบเดียว`);
  throw err;
}

/* ------------------------------------------------------------------ คำสั่ง */

/**
 * ยื่นคำขอใหม่ — ผู้ใช้ทั่วไปยื่นรถในชื่อตัวเองเท่านั้น (รถบริษัท/รถพนักงาน `ownerId` ต้องเป็นตัวเอง)
 * หรือยื่นให้ผู้มาติดต่อ · แอดมินยื่นแทนใครก็ได้
 */
export async function createVehicle(actor: Actor, input: VehicleInput): Promise<ParkingVehicle> {
  const v = clean(input);
  if (!actor.admin && v.ownership !== "visitor" && v.ownerId !== actor.employeeId)
    throw new ParkingError("ลงทะเบียนได้เฉพาะรถของตัวเอง — รหัสพนักงานต้องเป็นของคุณ");
  const at = nowIso();
  const doc: VehicleDoc = {
    _id: new ObjectId(),
    ...v,
    code: null,
    status: "pending",
    note: "",
    createdAt: todayBkk(),
    issuedAt: null,
    requestedBy: actor.employeeId,
    activePlate: plateKey(v.plate, v.province),
    updatedAt: at,
    updatedBy: actor.employeeId,
    history: [{ at, by: actor.employeeId, action: "create" }],
  };
  try {
    await (await col()).insertOne(doc);
  } catch (err) {
    rethrowDup(err, v.plate, v.province);
  }
  return toVehicle(doc);
}

async function findScoped(actor: Actor, id: string) {
  const doc = await (await col()).findOne({ _id: oid(id), ...scope(actor) });
  if (!doc) throw new ParkingError("ไม่พบรายการนี้ หรือคุณไม่มีสิทธิ์");
  return doc;
}

/** แก้แล้วส่งใหม่ — เฉพาะคำขอที่ถูกส่งกลับ · เจ้าของ/ผู้ยื่น หรือแอดมิน · สถานะกลับเป็น “รอตรวจ” */
export async function resubmitVehicle(actor: Actor, id: string, input: VehicleInput): Promise<void> {
  const cur = await findScoped(actor, id);
  if (cur.status !== "returned") throw new ParkingError("แก้ไขได้เฉพาะคำขอที่ถูกส่งกลับ");
  const v = clean(input);
  if (!actor.admin && v.ownership !== "visitor" && v.ownerId !== actor.employeeId)
    throw new ParkingError("รหัสพนักงานต้องเป็นของคุณ");
  const at = nowIso();
  try {
    await (await col()).updateOne(
      { _id: cur._id, status: "returned" },
      {
        $set: { ...v, status: "pending", note: "", activePlate: plateKey(v.plate, v.province), updatedAt: at, updatedBy: actor.employeeId },
        $push: { history: { at, by: actor.employeeId, action: "resubmit" } },
      },
    );
  } catch (err) {
    rethrowDup(err, v.plate, v.province);
  }
}

/** อนุมัติ + ออกรหัสบัตร — แอดมินเท่านั้น · เฉพาะ “รอตรวจ” · คืนรหัสที่ออก */
export async function approveVehicle(actor: Actor, id: string): Promise<string> {
  if (!actor.admin) throw new ParkingError("อนุมัติได้เฉพาะผู้ดูแลทะเบียนรถ");
  const cur = await findScoped(actor, id);
  if (cur.status !== "pending") throw new ParkingError("รายการนี้ไม่ได้อยู่ในสถานะรอตรวจ");
  const head = `${OWNERSHIP[cur.ownership].prefix}-${cur.site}`;
  const code = `${head}-${String(await nextSeq("parkingCounters", head)).padStart(4, "0")}`;
  const at = nowIso();
  const res = await (await col()).updateOne(
    { _id: cur._id, status: "pending" },
    {
      $set: { status: "active", code, issuedAt: todayBkk(), note: "", updatedAt: at, updatedBy: actor.employeeId },
      $push: { history: { at, by: actor.employeeId, action: "approve", note: code } },
    },
  );
  if (!res.modifiedCount) throw new ParkingError("รายการเปลี่ยนสถานะไปแล้ว — รีเฟรชแล้วลองใหม่");
  return code;
}

/** ส่งกลับแก้ไข (จาก “รอตรวจ”) / ยกเลิกบัตร (จาก “ใช้งาน”) — แอดมินเท่านั้น ต้องมีเหตุผล */
export async function setVehicleStatus(
  actor: Actor,
  id: string,
  to: Extract<VehicleStatus, "returned" | "cancelled">,
  reason: string,
): Promise<void> {
  if (!actor.admin) throw new ParkingError("ทำรายการนี้ได้เฉพาะผู้ดูแลทะเบียนรถ");
  const note = str(reason, 500);
  if (!note) throw new ParkingError("กรุณาใส่เหตุผล");
  const from: VehicleStatus = to === "returned" ? "pending" : "active";
  const at = nowIso();
  const res = await (await col()).updateOne(
    { _id: oid(id), status: from },
    {
      $set: { status: to, note, updatedAt: at, updatedBy: actor.employeeId },
      ...(to === "cancelled" ? { $unset: { activePlate: "" } } : {}),
      $push: { history: { at, by: actor.employeeId, action: to === "returned" ? "return" : "cancel", note } },
    },
  );
  if (!res.modifiedCount) throw new ParkingError("รายการเปลี่ยนสถานะไปแล้ว — รีเฟรชแล้วลองใหม่");
}

/* ------------------------------------------------------------------ สแกน QR · log ผู้ดู */

interface ScanDoc {
  _id: ObjectId;
  at: string;
  /** รหัสพนักงานคนสแกน + ชื่อ ณ เวลานั้น (ชื่อเปลี่ยนทีหลัง log ยังอ่านรู้เรื่อง) */
  by: string;
  byName: string;
  code: string;
  vehicleId: string | null;
  result: ScanResult;
  userAgent: string;
  ip: string;
}

export interface ScanEntry {
  at: string;
  by: string;
  byName: string;
  result: ScanResult;
  /** อุปกรณ์แบบย่อ เช่น “iPhone · Safari” */
  device: string;
}

/** ผลของบัตร ณ ตอนนี้ — บัตรผู้มาติดต่อเลยวันหมดอายุ = expired แม้สถานะยังเป็น active */
export function scanResultOf(v: ParkingVehicle | null): ScanResult {
  if (!v) return "not-found";
  if (v.status === "active" && v.ownership === "visitor" && v.validUntil && v.validUntil < todayBkk()) return "expired";
  if (v.status === "active") return "valid";
  return v.status;
}

/** รถตามรหัสบัตร — ไม่กรองตามสิทธิ์ (หน้าตรวจบัตรตัดสินเองว่าแสดงได้ไหม แล้วค่อยเขียน log) */
export async function findByCode(code: string): Promise<ParkingVehicle | null> {
  const clean = str(code, 30).toUpperCase();
  if (!/^[CEV]-[A-Z]{3}-\d{4}$/.test(clean)) return null;
  const doc = await (await col()).findOne({ code: clean });
  return doc ? toVehicle(doc) : null;
}

/**
 * เขียน log หนึ่งครั้งต่อการเปิดหน้า — ล้มก็ไม่ทำให้หน้าตรวจพัง (คืน false)
 * คนเดิม + บัตรเดิม + ผลเดิม ภายใน 10 วินาที = นับเป็นครั้งเดียว (รีเฟรช / เบราว์เซอร์ขอหน้าซ้ำ)
 */
export async function logScan(entry: Omit<ScanDoc, "_id" | "at">): Promise<boolean> {
  try {
    const scans = await hrCol<ScanDoc>("parkingScans");
    const since = new Date(Date.now() - 10_000).toISOString();
    if (await scans.findOne({ by: entry.by, code: entry.code, result: entry.result, at: { $gte: since } }, { projection: { _id: 1 } }))
      return true;
    await scans.insertOne({ _id: new ObjectId(), at: nowIso(), ...entry });
    return true;
  } catch (err) {
    console.error("[parking] logScan", err);
    return false;
  }
}

function deviceOf(ua: string): string {
  const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : "อื่น ๆ";
  const browser = /Line\//.test(ua) ? "LINE" : /EdgA?\//.test(ua) ? "Edge" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "";
  return [os, browser].filter(Boolean).join(" · ");
}

/** ประวัติการสแกนของรถคันนี้ (ใหม่สุดก่อน) — แอดมินเท่านั้น */
export async function listScans(actor: Actor, vehicleId: string, limit = 50): Promise<ScanEntry[]> {
  if (!actor.admin) throw new ParkingError("ดูประวัติการสแกนได้เฉพาะผู้ดูแลทะเบียนรถ");
  const docs = await (await hrCol<ScanDoc>("parkingScans"))
    .find({ vehicleId: oid(vehicleId).toHexString() })
    .sort({ at: -1 })
    .limit(limit)
    .toArray();
  return docs.map((d) => ({ at: d.at, by: d.by, byName: d.byName, result: d.result, device: deviceOf(d.userAgent) }));
}
