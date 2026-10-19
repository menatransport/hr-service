import type { Collection, Document } from "mongodb";

import { driverExists, readDrivers } from "@/app/recruitment/_lib/drivers/master";
import { etlCol, hrCol, type ReadOnlyCollection } from "@/lib/db";
import { PARTNER } from "@/lib/db/registry.mjs";
import { partnerCol } from "@/lib/partner/mongo";

import { ETL_NATIONAL_ID_FIELD } from "./match";
import type { DriverLinkSources } from "./overview";
import type { RawContract, RawEtlDriver, RawPartnerDriver, RawVehicle } from "./rows";
import type { LinkDoc } from "./types";

/**
 * ชั้นข้อมูลของสายเชื่อมคนขับ — **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 *
 * | ที่ | ทำอะไร |
 * |---|---|
 * | `mena_partner.drivers` / `contracts` | อ่านอย่างเดียว ฉายเฉพาะฟิลด์ที่ใช้ |
 * | ทะเบียน พจส. | อ่านผ่าน `readDrivers()` ของ `master.ts` (ตัวอ่านตัวเดียวของระบบ) |
 * | `Boom_ETL.vehicles` | อ่านเลขรถ↔ทะเบียน เฉพาะคันที่มีคนอ้าง |
 * | `hr_service.partner_driver_links` | **ที่เดียวที่เขียน** — ยืนยัน = insert · ปลด = delete |
 *
 * ทุกคำสั่งมี projection + limit + `maxTimeMS` — คลัสเตอร์ใช้ร่วมกับอีกหลายแอป
 * ต่อ dependency ได้ผ่าน `createRepo(deps)` ให้เทสต์ส่งคอลเลกชันปลอมเข้ามาได้ (ไม่ต่อฐานจริง)
 */

/** เพดานกันพลาด ไม่ใช่การแบ่งหน้า — รถร่วมมีราวไม่กี่ร้อยสัญญา */
export const PARTNER_LIMIT = 3_000;
export const LINK_LIMIT = 5_000;
export const MAX_TIME_MS = 10_000;

const DRIVER_PROJECTION = {
  _id: 1,
  contractCode: 1,
  prefix: 1,
  firstName: 1,
  lastName: 1,
  nationalId: 1,
  status: 1,
  isTruckOwner: 1,
  isDriver: 1,
  licensePlate: 1,
} as const;
const CONTRACT_PROJECTION = { _id: 0, contractCode: 1, licensePlate: 1, status: 1 } as const;
const LINK_PROJECTION = { _id: 0 } as const;

/** unique `contractCode` ชน — สัญญานี้มีคู่อยู่แล้ว */
export class DuplicateLinkError extends Error {
  constructor(
    readonly contractCode: string,
    readonly existing: LinkDoc | null,
  ) {
    super(`สัญญา ${contractCode} จับคู่ไว้แล้ว`);
    this.name = "DuplicateLinkError";
  }
}

type Readable<T extends Document> = Pick<ReadOnlyCollection<T>, "find" | "countDocuments">;
type LinksCollection = Pick<Collection<LinkDoc>, "find" | "findOne" | "insertOne" | "findOneAndDelete">;

export interface RepoDeps {
  partnerDrivers: () => Promise<Readable<RawPartnerDriver & Document>>;
  partnerContracts: () => Promise<Readable<RawContract & Document>>;
  vehicles: () => Promise<Readable<RawVehicle & Document>>;
  /** เลขบัตรจาก ETL — เรียกเฉพาะเมื่อ `ETL_NATIONAL_ID_FIELD` ไม่ใช่ null */
  etlMainDriver: () => Promise<Readable<Document>>;
  links: () => Promise<LinksCollection>;
  readEtlDrivers: () => Promise<RawEtlDriver[]>;
  driverExists: (drivercode: string) => Promise<boolean>;
  nationalIdField: string | null;
}

export const defaultDeps: RepoDeps = {
  partnerDrivers: () => partnerCol<RawPartnerDriver & Document>(PARTNER.drivers),
  partnerContracts: () => partnerCol<RawContract & Document>(PARTNER.contracts),
  vehicles: () => etlCol<RawVehicle & Document>("vehicles"),
  /*
   * ข้อยกเว้นของกติกา "main_driver อ่านผ่าน master.ts เท่านั้น" — master.ts ยังไม่มีฟิลด์เลขบัตร
   * ใช้เฉพาะเมื่อเจ้าของตั้ง `ETL_NATIONAL_ID_FIELD` แล้ว · ระยะยาวควรเพิ่มฟิลด์นั้นใน `ETL_FIELDS` ของ master.ts
   */
  etlMainDriver: () => etlCol("mainDriver"),
  links: () => hrCol<LinkDoc>("partnerDriverLinks"),
  readEtlDrivers: () =>
    readDrivers<RawEtlDriver>(["drivercode", "driverName", "ownerType", "vehicleCode", "active", "statusOverride"]),
  driverExists,
  nationalIdField: ETL_NATIONAL_ID_FIELD,
};

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function createRepo(deps: RepoDeps = defaultDeps) {
  async function readNationalIds(): Promise<Map<string, unknown>> {
    const field = deps.nationalIdField;
    if (!field) return new Map();
    const col = await deps.etlMainDriver();
    const docs = await col
      .find({ [field]: { $exists: true } }, { projection: { _id: 0, drivercode: 1, [field]: 1 } })
      .limit(LINK_LIMIT)
      .maxTimeMS(MAX_TIME_MS)
      .toArray();
    return new Map(docs.map((d) => [str(d.drivercode), d[field]]));
  }

  async function listLinks(): Promise<LinkDoc[]> {
    const col = await deps.links();
    return col.find({}, { projection: LINK_PROJECTION }).limit(LINK_LIMIT).maxTimeMS(MAX_TIME_MS).toArray() as Promise<
      LinkDoc[]
    >;
  }

  return {
    listLinks,

    /** อ่านทุกอย่างที่ภาพรวมต้องใช้ — ยิงพร้อมกัน (คนละ db กัน `$lookup` ข้ามไม่ได้อยู่แล้ว) */
    async loadSources(): Promise<DriverLinkSources> {
      const [driversCol, contractsCol] = await Promise.all([deps.partnerDrivers(), deps.partnerContracts()]);
      const [partnerDrivers, contracts, etlDrivers, ids] = await Promise.all([
        driversCol
          .find({}, { projection: DRIVER_PROJECTION })
          .limit(PARTNER_LIMIT)
          .maxTimeMS(MAX_TIME_MS)
          .toArray(),
        contractsCol
          .find({}, { projection: CONTRACT_PROJECTION })
          .limit(PARTNER_LIMIT)
          .maxTimeMS(MAX_TIME_MS)
          .toArray(),
        deps.readEtlDrivers(),
        readNationalIds(),
      ]);

      if (ids.size) for (const d of etlDrivers) d.nationalId = ids.get(str(d.drivercode));

      const refs = [...new Set(etlDrivers.map((d) => str(d.vehicleCode)).filter(Boolean))];
      const vehicles = refs.length
        ? await (await deps.vehicles())
            .find(
              { $or: [{ code: { $in: refs } }, { plate_no: { $in: refs } }] },
              { projection: { _id: 0, code: 1, plate_no: 1 } },
            )
            .limit(refs.length * 2)
            .maxTimeMS(MAX_TIME_MS)
            .toArray()
        : [];

      return { partnerDrivers, contracts, etlDrivers, vehicles };
    },

    /** มีสัญญานี้ในรถร่วมไหม (ดูจาก `drivers.contractCode` — คีย์ที่ link ใช้) */
    async contractExists(contractCode: string): Promise<boolean> {
      const col = await deps.partnerDrivers();
      return (await col.countDocuments({ contractCode }, { limit: 1, maxTimeMS: MAX_TIME_MS })) > 0;
    },

    driverExists: (drivercode: string) => deps.driverExists(drivercode),

    async findLink(contractCode: string): Promise<LinkDoc | null> {
      const col = await deps.links();
      return col.findOne({ contractCode }, { projection: LINK_PROJECTION, maxTimeMS: MAX_TIME_MS });
    },

    /** บันทึกคู่ — unique `contractCode` ชน = `DuplicateLinkError` (สองคนกดพร้อมกันก็จับได้ที่ฐาน) */
    async insertLink(doc: LinkDoc): Promise<void> {
      const col = await deps.links();
      try {
        await col.insertOne({ ...doc });
      } catch (err) {
        if ((err as { code?: number })?.code === 11000) {
          const existing = await col.findOne(
            { contractCode: doc.contractCode },
            { projection: LINK_PROJECTION, maxTimeMS: MAX_TIME_MS },
          );
          throw new DuplicateLinkError(doc.contractCode, existing);
        }
        throw err;
      }
    },

    /** ปลดคู่ = ลบแถว · คืนแถวที่ลบไป (null = ไม่มีคู่อยู่แล้ว) */
    async deleteLink(contractCode: string): Promise<LinkDoc | null> {
      const col = await deps.links();
      return col.findOneAndDelete({ contractCode }, { projection: LINK_PROJECTION, maxTimeMS: MAX_TIME_MS });
    },
  };
}

export type DriverLinksRepo = ReturnType<typeof createRepo>;
