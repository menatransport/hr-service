import { ObjectId } from "mongodb";

import { etlCol, hrCol } from "@/lib/db";
import { driverExists, readDrivers } from "@/app/recruitment/_lib/drivers/master";
import { toIsoDate, todayInBangkok, toWorkDays } from "@/app/recruitment/_lib/drivers/registry";

import {
  BILL_FIELDS,
  DEFAULT_CAP,
  billHasAmount,
  cancelledBy,
  chargeRoom,
  isIsoDate,
  isMonth,
  monthEnd,
  roomInMonth,
  roomState,
  shiftMonth,
  stayInMonth,
  toPayMode,
  type BillSource,
  type BoardRoom,
  type ExitKind,
  type PersonExit,
  type LivingWith,
  type RegistryPerson,
  type RentalApartment,
  type RentalBill,
  type RentalBoard,
  type RentalRoom,
  type RentalStay,
} from "./types";
import { resolveLatLng } from "./geo";

/**
 * ชั้นข้อมูลของห้องเช่าบริษัท (`/desk/rentals`) — **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 *
 * สี่คอลเลกชันใน `hr_service` (ชื่ออยู่ใน `lib/db/registry.mjs`): ที่พัก → ห้อง → การเข้าพัก + บิลรายเดือน
 * · **คนอ้างทะเบียนประวัติ พจส. ด้วย `drivercode` อย่างเดียว** ชื่อ/สถานะ/ตำแหน่ง/ลูกค้า/แพล้นท์อ่านสด
 * จาก `master_driver` ทุกครั้ง (`readPeople()`) — ทะเบียนเปลี่ยน หน้าห้องเช่าเปลี่ยนตามทันที
 * · ไม่มีการลบห้อง/การเข้าพักเลย — ยกเลิกสัญญา = `status: "cancelled"` · ย้ายออก = `checkOut`
 */

export class RentalError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/* ------------------------------------------------------------------ เอกสารในฐาน */

interface Stamp {
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

type ApartmentDoc = Omit<RentalApartment, "id"> & Stamp & { _id: string };
type RoomDoc = Omit<RentalRoom, "id"> & Stamp & { _id: string };
type StayDoc = Omit<RentalStay, "id"> & Stamp & { _id: string };
type BillDoc = RentalBill & { _id: string; updatedAt: string; updatedBy: string };

const apartments = () => hrCol<ApartmentDoc>("rentalApartments");
const rooms = () => hrCol<RoomDoc>("rentalRooms");
const stays = () => hrCol<StayDoc>("rentalStays");
const bills = () => hrCol<BillDoc>("rentalBills");

const newId = () => new ObjectId().toHexString();
const now = () => new Date().toISOString();

const str = (v: unknown, max = 300): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const money = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) throw new RentalError("จำนวนเงินต้องเป็นตัวเลขไม่ติดลบ");
  return Math.round(n * 100) / 100;
};
const date = (v: unknown, label: string, required = false): string => {
  const s = str(v);
  if (!s) {
    if (required) throw new RentalError(`กรุณาระบุ${label}`);
    return "";
  }
  if (!isIsoDate(s)) throw new RentalError(`${label}ไม่ถูกต้อง`);
  return s;
};

const toApartment = ({ _id, ...d }: ApartmentDoc): RentalApartment => ({
  id: _id,
  name: d.name ?? "",
  owner: d.owner ?? "",
  phone: d.phone ?? "",
  mapUrl: d.mapUrl ?? "",
  lat: typeof d.lat === "number" ? d.lat : null,
  lng: typeof d.lng === "number" ? d.lng : null,
  address: d.address ?? "",
  bankName: d.bankName ?? "",
  bankAccountName: d.bankAccountName ?? "",
  bankAccountNo: d.bankAccountNo ?? "",
  minContract: d.minContract ?? "",
  billSource: d.billSource === "self" ? "self" : "owner",
  remark: d.remark ?? "",
  active: d.active !== false,
});

const toRoom = ({ _id, ...d }: RoomDoc): RentalRoom => ({
  id: _id,
  apartmentId: d.apartmentId,
  roomNo: d.roomNo ?? "",
  plant: d.plant ?? "",
  rent: d.rent ?? 0,
  deposit: d.deposit ?? 0,
  advance: d.advance ?? 0,
  contractStart: d.contractStart ?? "",
  capacity: d.capacity === 2 ? 2 : 1,
  payMode: toPayMode(d.payMode),
  cap: d.cap ?? null,
  status: d.status === "cancelled" ? "cancelled" : "active",
  cancelledOn: d.cancelledOn ?? "",
  cancelReason: d.cancelReason ?? "",
  recruitRequested: Boolean(d.recruitRequested),
  remark: d.remark ?? "",
});

const toBill = (b: BillDoc): RentalBill => ({
  month: b.month,
  roomId: b.roomId,
  rent: b.rent ?? null,
  electric: b.electric ?? null,
  water: b.water ?? null,
  common: b.common ?? null,
});

const toStay = ({ _id, ...d }: StayDoc): RentalStay => ({
  id: _id,
  roomId: d.roomId,
  apartmentId: d.apartmentId,
  drivercode: d.drivercode ?? "",
  nameAtEntry: d.nameAtEntry ?? "",
  livingWith: d.livingWith === "family" ? "family" : "alone",
  checkIn: d.checkIn ?? "",
  checkOut: d.checkOut ?? "",
  note: d.note ?? "",
});

/* ------------------------------------------------------------------ ทะเบียน พจส. */

const PERSON_FIELDS = [
  "drivercode",
  "driverName",
  "phone",
  "photoUrl",
  "active",
  "statusOverride",
  "resignation",
  "position",
  "customer",
  "plant",
  "startDate",
] as const;

/** `ลอ` ลาออก · `ปอ` ปลดออก — รหัสพ้นสภาพของสถานะงานรายวัน (`EXIT_STATUS_CODES`) */
const WORK_EXIT_KIND: Record<string, ExitKind> = { ลอ: "resigned", ปอ: "dismissed" };
const REGISTRY_EXIT_KIND: Record<string, ExitKind> = { vol: "resigned", inv: "dismissed", disap: "left" };

/**
 * การพ้นสภาพจากสถานะงานรายวันของ ETL (`Boom_ETL.employee_work_status`) — เฉพาะคนที่สถานะล่าสุดเป็น `ลอ`/`ปอ`
 *
 * วันที่ออก = วันแรกของช่วงรหัสพ้นสภาพช่วงสุดท้าย (ดู 3 เดือนล่าสุด) · หาไม่เจอใช้ `latest_work_date`
 * · อ่านแค่สามเดือนเพราะ `months` ทั้งก้อนใหญ่ (ดู `loadEnrichment()` ในทะเบียน)
 */
async function readWorkExits(codes: string[]): Promise<Map<string, PersonExit>> {
  const today = todayInBangkok().slice(0, 7);
  const months = [0, -1, -2].map((n) => shiftMonth(today, n));
  const docs = await (await etlCol("workStatus"))
    .find(
      { employee_code: { $in: codes }, latest_status: { $in: Object.keys(WORK_EXIT_KIND) } },
      {
        projection: {
          employee_code: 1,
          latest_status: 1,
          latest_work_date: 1,
          ...Object.fromEntries(months.map((m) => [`months.${m}`, 1])),
        },
      },
    )
    .toArray();

  const out = new Map<string, PersonExit>();
  for (const doc of docs) {
    const days = Object.entries(toWorkDays(doc.months)).sort(([a], [b]) => a.localeCompare(b));
    let on = "";
    for (const [iso, code] of days) {
      if (WORK_EXIT_KIND[code.trim()]) on ||= iso;
      else on = "";
    }
    const latest = str(doc.latest_status);
    out.set(str(doc.employee_code), {
      kind: WORK_EXIT_KIND[latest],
      on: on || toIsoDate(doc.latest_work_date),
      source: "work",
    });
  }
  return out;
}

/**
 * คนในทะเบียนตามรหัส — ใช้กติกาสถานะเดียวกับหน้าทะเบียน (`statusOverride` ชนะ `active`)
 *
 * แล้ว sync การพ้นสภาพจากสถานะงานรายวัน: ทะเบียนยังบอกปฏิบัติงานแต่ ETL ขึ้น `ลอ`/`ปอ` = ถือว่าออกแล้ว
 * · ยกเว้นฝ่ายบุคคลกด “ปฏิบัติงาน” เอง (`statusOverride: "active"`) — คนสั่งชนะเสมอ
 */
async function readPeople(codes: string[]): Promise<Map<string, RegistryPerson>> {
  const unique = [...new Set(codes.filter(Boolean))];
  if (!unique.length) return new Map();
  const [docs, workExits] = await Promise.all([
    readDrivers<Record<string, unknown>>(PERSON_FIELDS, { codes: unique }),
    readWorkExits(unique).catch((err) => {
      console.warn("[rentals] อ่านสถานะงานรายวันไม่สำเร็จ —", err);
      return new Map<string, PersonExit>();
    }),
  ]);
  return new Map(
    docs.map((doc) => {
      const code = str(doc.drivercode);
      const override = str(doc.statusOverride);
      const registryActive =
        override === "active" || override === "resigned" ? override === "active" : Boolean(doc.active);
      const resignation = (doc.resignation ?? null) as { dateISO?: unknown; exitType?: unknown } | null;
      const workExit = override === "active" ? undefined : workExits.get(code);
      const exit: PersonExit | null = !registryActive
        ? {
            kind: REGISTRY_EXIT_KIND[str(resignation?.exitType)] ?? workExit?.kind ?? "left",
            on: str(resignation?.dateISO) || workExit?.on || "",
            source: "registry",
          }
        : (workExit ?? null);
      const person: RegistryPerson = {
        drivercode: code,
        name: str(doc.driverName),
        phone: str(doc.phone),
        photoUrl: str(doc.photoUrl, 2000),
        active: !exit,
        exit,
        position: str(doc.position),
        customer: str(doc.customer),
        plant: str(doc.plant),
        startDate: toIsoDate(doc.startDate),
      };
      return [person.drivercode, person] as const;
    }),
  );
}

/* ------------------------------------------------------------------ กระดานรายเดือน */

/**
 * ทุกห้องที่นับอยู่ในเดือน `month` + คนที่พักในเดือนนั้น + บิล + เงินที่คิดแล้ว
 *
 * ห้องที่ยกเลิกสัญญาไปแล้วยังขึ้นในเดือนก่อน ๆ ครบ (ปัญหาข้อ 4 ของไฟล์เดิม) · คนที่ย้ายออกกลางเดือน
 * ยังนับเป็นผู้พักของเดือนนั้น
 */
export async function getRentalBoard(month: string): Promise<RentalBoard> {
  if (!isMonth(month)) throw new RentalError("เดือนไม่ถูกต้อง");
  const today = todayInBangkok();
  const end = monthEnd(month);
  const asOf = today < end ? today : end;

  const [aptDocs, roomDocs, stayDocs, billDocs] = await Promise.all([
    apartments().then((c) => c.find({}).toArray()),
    rooms().then((c) => c.find({}).toArray()),
    stays().then((c) => c.find({ checkIn: { $lte: end } }).toArray()),
    bills().then((c) => c.find({ month }).toArray()),
  ]);

  const apts = aptDocs.map(toApartment).sort((a, b) => a.name.localeCompare(b.name, "th"));
  const aptById = new Map(apts.map((a) => [a.id, a]));
  const monthStays = stayDocs.map(toStay).filter((s) => stayInMonth(s, month));
  const billByRoom = new Map(
    billDocs.map((b): [string, RentalBill] => [
      b.roomId,
      toBill(b),
    ]),
  );

  let people = new Map<string, RegistryPerson>();
  let registryFailed = false;
  try {
    people = await readPeople(monthStays.map((s) => s.drivercode));
  } catch (err) {
    console.warn("[rentals] อ่านทะเบียน พจส. ไม่สำเร็จ —", err);
    registryFailed = true;
  }

  const staysByRoom = new Map<string, RentalStay[]>();
  for (const s of monthStays) {
    const list = staysByRoom.get(s.roomId) ?? [];
    list.push(s);
    staysByRoom.set(s.roomId, list);
  }

  const boardRooms: BoardRoom[] = [];
  for (const room of roomDocs.map(toRoom)) {
    const apartment = aptById.get(room.apartmentId);
    if (!apartment || !roomInMonth(room, month)) continue;
    const roomStays = (staysByRoom.get(room.id) ?? []).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    const bill = billByRoom.get(room.id) ?? null;
    const charge = chargeRoom(room, roomStays, bill, month, asOf);
    const occupants = roomStays.map((stay, i) => ({
      stay,
      person: people.get(stay.drivercode) ?? null,
      charge: charge.occupants[i],
    }));
    boardRooms.push({ room, apartment, occupants, bill, charge, state: roomState(room, occupants, month) });
  }

  boardRooms.sort(
    (a, b) =>
      a.apartment.name.localeCompare(b.apartment.name, "th") ||
      a.room.roomNo.localeCompare(b.room.roomNo, "th", { numeric: true }),
  );

  return { month, asOf, today, apartments: apts, rooms: boardRooms, registryFailed };
}

/** ประวัติการเข้าพักทั้งหมดของห้อง (ใหม่ก่อน) — แผงห้องในหน้าห้องเช่า */
export async function getRoomStays(roomId: string): Promise<{ stay: RentalStay; person: RegistryPerson | null }[]> {
  const list = (await stays().then((c) => c.find({ roomId }).sort({ checkIn: -1 }).toArray())).map(toStay);
  const people = await readPeople(list.map((s) => s.drivercode)).catch(() => new Map<string, RegistryPerson>());
  return list.map((stay) => ({ stay, person: people.get(stay.drivercode) ?? null }));
}

export interface DriverStayRow {
  stay: RentalStay;
  room: RentalRoom;
  apartment: RentalApartment;
}

/** การเข้าพักทั้งหมดของ พจส. หนึ่งคน (ใหม่ก่อน) — ส่วน “ห้องพัก” บนหน้าทะเบียนประวัติ */
export async function getStaysOfDriver(drivercode: string): Promise<DriverStayRow[]> {
  const code = drivercode.trim();
  if (!code) return [];
  const list = (await stays().then((c) => c.find({ drivercode: code }).sort({ checkIn: -1 }).toArray())).map(toStay);
  if (!list.length) return [];
  const [roomDocs, aptDocs] = await Promise.all([
    rooms().then((c) => c.find({ _id: { $in: [...new Set(list.map((s) => s.roomId))] } }).toArray()),
    apartments().then((c) => c.find({ _id: { $in: [...new Set(list.map((s) => s.apartmentId))] } }).toArray()),
  ]);
  const roomById = new Map(roomDocs.map((d) => [d._id, toRoom(d)]));
  const aptById = new Map(aptDocs.map((d) => [d._id, toApartment(d)]));
  return list.flatMap((stay) => {
    const room = roomById.get(stay.roomId);
    const apartment = aptById.get(stay.apartmentId);
    return room && apartment ? [{ stay, room, apartment }] : [];
  });
}

/* ------------------------------------------------------------------ ที่พัก */

function apartmentFields(body: Record<string, unknown>) {
  const name = str(body.name, 160);
  if (!name) throw new RentalError("กรุณาระบุชื่อที่พัก");
  return {
    name,
    owner: str(body.owner, 160),
    phone: str(body.phone, 80),
    mapUrl: str(body.mapUrl, 500),
    address: str(body.address, 500),
    bankName: str(body.bankName, 80),
    bankAccountName: str(body.bankAccountName, 160),
    bankAccountNo: str(body.bankAccountNo, 40),
    minContract: str(body.minContract, 160),
    billSource: (body.billSource === "self" ? "self" : "owner") as BillSource,
    remark: str(body.remark, 1000),
    active: body.active !== false,
  };
}

/** พิกัดจากลิงก์แผนที่ (หรือที่อยู่) — ลิงก์/ที่อยู่ไม่เปลี่ยนก็ใช้พิกัดเดิม ไม่ต้องยิงไปถาม Google ซ้ำทุกครั้งที่บันทึก */
async function withCoords<T extends { mapUrl: string; address: string }>(fields: T, prev?: ApartmentDoc | null) {
  if (prev && prev.mapUrl === fields.mapUrl && prev.address === fields.address && typeof prev.lat === "number") {
    return { ...fields, lat: prev.lat, lng: prev.lng };
  }
  const at = await resolveLatLng(fields.mapUrl, fields.address);
  return { ...fields, lat: at?.lat ?? null, lng: at?.lng ?? null };
}

export async function createApartment(body: Record<string, unknown>, actor: string): Promise<RentalApartment> {
  const fields = await withCoords(apartmentFields(body));
  const col = await apartments();
  if (await col.findOne({ name: fields.name })) throw new RentalError(`มีที่พัก “${fields.name}” อยู่แล้ว`, 409);
  const at = now();
  const doc: ApartmentDoc = { _id: newId(), ...fields, createdAt: at, createdBy: actor, updatedAt: at, updatedBy: actor };
  await col.insertOne(doc);
  return toApartment(doc);
}

export async function updateApartment(id: string, body: Record<string, unknown>, actor: string): Promise<RentalApartment> {
  const col = await apartments();
  const fields = await withCoords(apartmentFields(body), await col.findOne({ _id: id }));
  const clash = await col.findOne({ name: fields.name, _id: { $ne: id } });
  if (clash) throw new RentalError(`มีที่พัก “${fields.name}” อยู่แล้ว`, 409);
  const doc = await col.findOneAndUpdate(
    { _id: id },
    { $set: { ...fields, updatedAt: now(), updatedBy: actor } },
    { returnDocument: "after" },
  );
  if (!doc) throw new RentalError("ไม่พบที่พักนี้", 404);
  return toApartment(doc);
}

/* ------------------------------------------------------------------ ห้อง */

function roomFields(body: Record<string, unknown>) {
  const roomNo = str(body.roomNo, 40);
  if (!roomNo) throw new RentalError("กรุณาระบุเลขห้อง");
  const payMode = toPayMode(body.payMode);
  const cap = payMode === "COMPANY_CAP" ? (money(body.cap) ?? DEFAULT_CAP) : null;
  if (cap !== null && cap <= 0) throw new RentalError("กรุณาระบุเพดานที่บริษัทจ่าย");
  return {
    roomNo,
    plant: str(body.plant, 160),
    rent: money(body.rent) ?? 0,
    deposit: money(body.deposit) ?? 0,
    advance: money(body.advance) ?? 0,
    contractStart: date(body.contractStart, "วันที่ทำสัญญา"),
    capacity: Number(body.capacity) === 2 ? 2 : 1,
    payMode,
    cap,
    recruitRequested: Boolean(body.recruitRequested),
    remark: str(body.remark, 1000),
  };
}

async function assertApartment(apartmentId: string) {
  const apt = await (await apartments()).findOne({ _id: apartmentId });
  if (!apt) throw new RentalError("ไม่พบที่พักนี้", 404);
  return apt;
}

async function assertUniqueRoom(apartmentId: string, roomNo: string, except?: string) {
  const clash = await (await rooms()).findOne({
    apartmentId,
    roomNo,
    status: "active",
    ...(except ? { _id: { $ne: except } } : {}),
  });
  if (clash) throw new RentalError(`ห้อง ${roomNo} มีอยู่แล้วในที่พักนี้`, 409);
}

export async function createRoom(body: Record<string, unknown>, actor: string): Promise<RentalRoom> {
  const apartmentId = str(body.apartmentId, 40);
  await assertApartment(apartmentId);
  const fields = roomFields(body);
  await assertUniqueRoom(apartmentId, fields.roomNo);
  const at = now();
  const doc: RoomDoc = {
    _id: newId(),
    apartmentId,
    ...fields,
    status: "active",
    cancelledOn: "",
    cancelReason: "",
    createdAt: at,
    createdBy: actor,
    updatedAt: at,
    updatedBy: actor,
  };
  await (await rooms()).insertOne(doc);
  return toRoom(doc);
}

/**
 * แก้ห้อง — `action`:
 * - `edit` (ค่าตั้งต้น) แก้รายละเอียดห้อง
 * - `cancel` ยกเลิกสัญญา `{ cancelledOn, cancelReason }` — ต้องไม่มีคนพักค้างหลังวันนั้น
 * - `reopen` กลับมาใช้ห้องเดิม (ล้างการยกเลิก)
 */
export async function updateRoom(id: string, body: Record<string, unknown>, actor: string): Promise<RentalRoom> {
  const col = await rooms();
  const current = await col.findOne({ _id: id });
  if (!current) throw new RentalError("ไม่พบห้องนี้", 404);
  const action = str(body.action) || "edit";
  let set: Partial<RoomDoc>;

  if (action === "cancel") {
    const cancelledOn = date(body.cancelledOn, "วันที่ยกเลิกสัญญา", true);
    const open = await (await stays()).findOne({
      roomId: id,
      $or: [{ checkOut: "" }, { checkOut: { $gt: cancelledOn } }],
    });
    if (open) throw new RentalError("ยังมีผู้พักในห้องนี้หลังวันที่ยกเลิก — บันทึกย้ายออกก่อน", 409);
    set = { status: "cancelled", cancelledOn, cancelReason: str(body.cancelReason, 500) };
  } else if (action === "reopen") {
    await assertUniqueRoom(current.apartmentId, current.roomNo, id);
    set = { status: "active", cancelledOn: "", cancelReason: "" };
  } else {
    const fields = roomFields(body);
    if (fields.roomNo !== current.roomNo && current.status === "active") {
      await assertUniqueRoom(current.apartmentId, fields.roomNo, id);
    }
    const open = await (await stays()).countDocuments({ roomId: id, checkOut: "" });
    if (open > fields.capacity) throw new RentalError(`ห้องนี้มีผู้พักอยู่ ${open} คน — ลดจำนวนที่พักไม่ได้`, 409);
    // แจ้งสรรหาได้เฉพาะห้องที่ยังมีที่ว่าง — คนเดิมยังไม่ย้ายออก ห้องยังไม่ว่าง
    if (fields.recruitRequested && open >= fields.capacity) {
      throw new RentalError("ห้องนี้ยังมีผู้พักเต็ม — บันทึกย้ายออกก่อนจึงแจ้งสรรหาได้", 409);
    }
    set = fields;
  }

  const doc = await col.findOneAndUpdate(
    { _id: id },
    { $set: { ...set, updatedAt: now(), updatedBy: actor } },
    { returnDocument: "after" },
  );
  return toRoom(doc!);
}

/* ------------------------------------------------------------------ การเข้าพัก */

/** เข้าพัก — คนต้องอยู่ในทะเบียนและยังปฏิบัติงาน · ห้องต้องยังไม่เต็ม · คนหนึ่งพักได้ทีละห้อง */
export async function checkIn(body: Record<string, unknown>, actor: string): Promise<RentalStay> {
  const roomId = str(body.roomId, 40);
  const drivercode = str(body.drivercode, 40);
  const checkInOn = date(body.checkIn, "วันเข้าพัก", true);
  const livingWith: LivingWith = body.livingWith === "family" ? "family" : "alone";

  const room = await (await rooms()).findOne({ _id: roomId });
  if (!room) throw new RentalError("ไม่พบห้องนี้", 404);
  if (room.status === "cancelled") throw new RentalError("ห้องนี้ยกเลิกสัญญาแล้ว");

  if (!drivercode) throw new RentalError("กรุณาเลือก พจส. จากทะเบียนประวัติ");
  const person = (await readPeople([drivercode])).get(drivercode);
  if (!person) throw new RentalError(`ไม่พบรหัส ${drivercode} ในทะเบียนประวัติ พจส.`, 404);
  if (!person.active) throw new RentalError(`${person.name} พ้นสภาพแล้ว — เข้าพักไม่ได้`);

  const col = await stays();
  const elsewhere = await col.findOne({ drivercode, checkOut: "" });
  if (elsewhere) {
    const where = await (await rooms()).findOne({ _id: elsewhere.roomId });
    throw new RentalError(`${person.name} ยังพักอยู่ห้อง ${where?.roomNo ?? ""} — บันทึกย้ายออกจากห้องเดิมก่อน`, 409);
  }
  const open = await col.countDocuments({ roomId, $or: [{ checkOut: "" }, { checkOut: { $gt: checkInOn } }] });
  if (open >= (room.capacity === 2 ? 2 : 1)) throw new RentalError("ห้องนี้เต็มแล้ว", 409);

  const at = now();
  const doc: StayDoc = {
    _id: newId(),
    roomId,
    apartmentId: room.apartmentId,
    drivercode,
    nameAtEntry: person.name,
    livingWith,
    checkIn: checkInOn,
    checkOut: "",
    note: str(body.note, 500),
    createdAt: at,
    createdBy: actor,
    updatedAt: at,
    updatedBy: actor,
  };
  await col.insertOne(doc);
  // คนเข้าพักแล้ว ไม่ต้องสรรหาให้ห้องนี้อีก
  await (await rooms()).updateOne({ _id: roomId }, { $set: { recruitRequested: false } });
  return toStay(doc);
}

/**
 * แก้การเข้าพัก — `checkOut` (ย้ายออก) · `checkIn` · `livingWith` · `note`
 * · `drivercode` ใช้ผูกแถวที่นำเข้าจากไฟล์เดิมเข้ากับทะเบียน (แถวที่ผูกแล้วเปลี่ยนคนไม่ได้)
 */
export async function updateStay(id: string, body: Record<string, unknown>, actor: string): Promise<RentalStay> {
  const col = await stays();
  const current = await col.findOne({ _id: id });
  if (!current) throw new RentalError("ไม่พบการเข้าพักนี้", 404);

  const set: Partial<StayDoc> = {};
  if ("checkIn" in body) set.checkIn = date(body.checkIn, "วันเข้าพัก", true);
  if ("checkOut" in body) set.checkOut = date(body.checkOut, "วันย้ายออก");
  if ("livingWith" in body) set.livingWith = body.livingWith === "family" ? "family" : "alone";
  if ("note" in body) set.note = str(body.note, 500);

  const checkInOn = set.checkIn ?? current.checkIn;
  const checkOutOn = set.checkOut ?? current.checkOut;
  if (checkOutOn && checkOutOn < checkInOn) throw new RentalError("วันย้ายออกต้องไม่ก่อนวันเข้าพัก");

  if ("drivercode" in body) {
    const code = str(body.drivercode, 40);
    if (current.drivercode && code !== current.drivercode) {
      throw new RentalError("ผูกทะเบียนแล้วเปลี่ยนคนไม่ได้ — บันทึกย้ายออกแล้วเพิ่มผู้พักใหม่");
    }
    if (code && !current.drivercode) {
      if (!(await driverExists(code))) throw new RentalError(`ไม่พบรหัส ${code} ในทะเบียนประวัติ พจส.`, 404);
      if (!checkOutOn) {
        const elsewhere = await col.findOne({ drivercode: code, checkOut: "", _id: { $ne: id } });
        if (elsewhere) throw new RentalError("คนนี้มีห้องพักที่ยังไม่ย้ายออกอยู่แล้ว", 409);
      }
      set.drivercode = code;
    }
  }

  const doc = await col.findOneAndUpdate(
    { _id: id },
    { $set: { ...set, updatedAt: now(), updatedBy: actor } },
    { returnDocument: "after" },
  );
  return toStay(doc!);
}

/* ------------------------------------------------------------------ บิลรายเดือน */

export async function saveBill(body: Record<string, unknown>, actor: string): Promise<RentalBill> {
  const month = str(body.month, 7);
  if (!isMonth(month)) throw new RentalError("เดือนไม่ถูกต้อง");
  const roomId = str(body.roomId, 40);
  if (!(await (await rooms()).findOne({ _id: roomId }))) throw new RentalError("ไม่พบห้องนี้", 404);

  const set: Partial<BillDoc> = {};
  for (const key of BILL_FIELDS) {
    if (key in body) set[key] = money(body[key]);
  }
  const doc = await (await bills()).findOneAndUpdate(
    { _id: `${month}:${roomId}` },
    {
      $set: { ...set, updatedAt: now(), updatedBy: actor },
      $setOnInsert: { month, roomId, ...Object.fromEntries(BILL_FIELDS.filter((k) => !(k in set)).map((k) => [k, null])) },
    },
    { upsert: true, returnDocument: "after" },
  );
  return toBill(doc!);
}

/* ------------------------------------------------------------------ ยอดรายเดือน (รายงาน) */

/**
 * ยอดจ่ายเจ้าของห้องรวมของแต่ละเดือน — แถว “สรุปค่าเช่า” ในบันทึกขออนุมัติ
 *
 * คิดเหมือนรายงานทุกอย่าง (`reportRooms()`): ห้องที่อยู่ในเดือนนั้น ยกเลิกสัญญาแล้วนับเฉพาะที่ยังมีบิล ·
 * เดือนที่ยังไม่มีบิลสักใบ = `null` (ระบบยังไม่ได้บันทึกเดือนนั้น ไม่ใช่ยอดศูนย์)
 */
export async function getMonthTotals(months: string[]): Promise<Record<string, number | null>> {
  const valid = months.filter(isMonth);
  const [roomDocs, billDocs] = await Promise.all([
    rooms().then((c) => c.find({}).toArray()),
    bills().then((c) => c.find({ month: { $in: valid } }).toArray()),
  ]);
  const roomList = roomDocs.map(toRoom);
  const out: Record<string, number | null> = {};
  for (const month of valid) {
    const monthBills = new Map(billDocs.filter((b) => b.month === month).map((b) => [b.roomId, toBill(b)]));
    if (!monthBills.size) {
      out[month] = null;
      continue;
    }
    let total = 0;
    for (const room of roomList) {
      if (!roomInMonth(room, month)) continue;
      const bill = monthBills.get(room.id) ?? null;
      if (cancelledBy(room, month) && !billHasAmount(bill)) continue;
      total += (bill?.rent ?? room.rent) + (bill?.electric ?? 0) + (bill?.water ?? 0) + (bill?.common ?? 0);
    }
    out[month] = Math.round(total * 100) / 100;
  }
  return out;
}
