/**
 * ทดลองจับคู่คนขับรถร่วม ↔ ทะเบียน พจส. กับข้อมูลจริง — **อ่านอย่างเดียว ไม่เขียนอะไรลงฐานเลย**
 *
 * วิธีรัน (เจ้าของงานรันเอง จากรากโปรเจกต์ที่มี `.env.local` ชี้ฐานจริง):
 *
 *   npx tsx --tsconfig tsconfig.json scripts/driver-links-dryrun.mjs
 *   npx tsx --tsconfig tsconfig.json scripts/driver-links-dryrun.mjs --nid-field=<ชื่อฟิลด์>   ← ลองใช้ฟิลด์เลขบัตรของ main_driver
 *   npx tsx --tsconfig tsconfig.json scripts/driver-links-dryrun.mjs --show=30                 ← พิมพ์ตัวอย่างข้อเสนอ 30 แถว (ค่าเริ่ม 15)
 *
 * ต้องใช้ `tsx` (ไม่ใช่ `node` เปล่า) เพราะเรียกตัวจับคู่ตัวจริงใน `lib/driver-links/*.ts` — ผลจึงตรงกับหน้าจอ
 *
 * ภาระต่อฐาน: ทุกคิวรีมี projection + limit + maxTimeMS · อ่านจาก secondary ถ้ามี ·
 * ราว 5 คำสั่ง อ่านรวมไม่กี่พันแถว (main_driver ~2,600 · drivers/contracts รถร่วมไม่กี่ร้อย)
 *
 * พิมพ์: จำนวน พจร. ใน ETL · จำนวนคนขับรถร่วม · % ที่มีเลขบัตร 13 หลัก · ฟิลด์ใน main_driver ที่หน้าตาเหมือนเลขบัตร
 * (ดู key ของ 20 แถวแรก — พิมพ์แค่ชื่อฟิลด์กับจำนวน **ไม่พิมพ์เลขบัตร**) · ผลจับคู่แยก high/medium/low/ไม่มีคู่ · ตัวเลขคนขับรวม
 */
import { MongoClient } from "mongodb";

import { loadEnv, hrDbName } from "../db_env.mjs";
import { DB, ETL, HR, PARTNER } from "../lib/db/registry.mjs";
import { buildOverview } from "../lib/driver-links/overview.ts";

const MAX_TIME_MS = 15_000;
const LIMIT = 5_000;
const SAMPLE = 20;

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const nidField = arg("nid-field") || null;
const show = Number(arg("show") ?? 15);

const env = loadEnv();
const uri = env.MONGO_URI;
if (!uri) {
  console.error("ไม่มี MONGO_URI ใน .env.local");
  process.exit(1);
}
const partnerDbName = env.PARTNER_MONGO_DB || DB.partner;

const client = new MongoClient(uri, {
  appName: "hr-service-driver-links-dryrun",
  readPreference: "secondaryPreferred",
  maxPoolSize: 2,
  serverSelectionTimeoutMS: 10_000,
});

const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : "-");
const isNid = (v) => /^\d{13}$/.test(String(v ?? "").replace(/[\s-]/g, ""));
const read = (col, filter, projection, limit = LIMIT) =>
  col.find(filter, { projection }).limit(limit).maxTimeMS(MAX_TIME_MS).toArray();

try {
  await client.connect();
  const etl = client.db(DB.etl);
  const hr = client.db(hrDbName(env));
  const partner = client.db(partnerDbName);

  console.log(`ฐาน: ETL=${DB.etl} · hr=${hrDbName(env)} · รถร่วม=${partnerDbName}\n`);

  /* 1) ฟิลด์ใน main_driver ที่หน้าตาเหมือนเลขบัตร — 20 แถวแรก ไม่ฉายฟิลด์ (ต้องเห็น key ทั้งหมด) */
  const sample = await etl.collection(ETL.mainDriver).find({}).limit(SAMPLE).maxTimeMS(MAX_TIME_MS).toArray();
  const keys = new Map();
  for (const doc of sample) {
    for (const [k, v] of Object.entries(doc)) {
      const s = keys.get(k) ?? { seen: 0, nid: 0 };
      s.seen += 1;
      if (isNid(v)) s.nid += 1;
      keys.set(k, s);
    }
  }
  console.log(`[main_driver] key ของ ${sample.length} แถวแรก: ${[...keys.keys()].sort().join(", ")}`);
  const nidLike = [...keys].filter(([, s]) => s.nid > 0);
  console.log(
    nidLike.length
      ? `  ฟิลด์ที่มีค่า 13 หลัก: ${nidLike.map(([k, s]) => `${k} (${s.nid}/${s.seen})`).join(", ")}`
      : "  ไม่เจอฟิลด์ที่มีค่าเป็นตัวเลข 13 หลัก → ETL_NATIONAL_ID_FIELD คงเป็น null",
  );

  /* 2) ทะเบียน พจส. — รูปเดียวกับ readDrivers() ของ master.ts (ETL + statusOverride ของ hr) */
  const etlProjection = { _id: 0, drivercode: 1, driver_name: 1, owner_type: 1, vehicle: 1, active: 1 };
  if (nidField) etlProjection[nidField] = 1;
  const [mainDrivers, overrides] = await Promise.all([
    read(etl.collection(ETL.mainDriver), {}, etlProjection),
    read(hr.collection(HR.drivers.name), { statusOverride: { $exists: true } }, { _id: 0, drivercode: 1, statusOverride: 1 }),
  ]);
  const overrideBy = new Map(overrides.map((o) => [String(o.drivercode ?? "").trim(), o.statusOverride]));
  const etlDrivers = mainDrivers.map((d) => ({
    drivercode: String(d.drivercode ?? "").trim(),
    driverName: d.driver_name,
    ownerType: d.owner_type == null ? "" : String(d.owner_type),
    vehicleCode: d.vehicle == null ? "" : String(d.vehicle),
    active: Boolean(d.active),
    statusOverride: overrideBy.get(String(d.drivercode ?? "").trim()),
    nationalId: nidField ? d[nidField] : undefined,
  }));

  const refs = [...new Set(etlDrivers.map((d) => d.vehicleCode.trim()).filter(Boolean))];
  const vehicles = refs.length
    ? await read(
        etl.collection(ETL.vehicles),
        { $or: [{ code: { $in: refs } }, { plate_no: { $in: refs } }] },
        { _id: 0, code: 1, plate_no: 1 },
        refs.length * 2,
      )
    : [];

  /* 3) รถร่วม + คู่ที่ยืนยันแล้ว */
  const [partnerDrivers, contracts, links] = await Promise.all([
    read(partner.collection(PARTNER.drivers), {}, {
      _id: 1, contractCode: 1, prefix: 1, firstName: 1, lastName: 1, nationalId: 1,
      status: 1, isTruckOwner: 1, isDriver: 1, licensePlate: 1,
    }),
    read(partner.collection(PARTNER.contracts), {}, { _id: 0, contractCode: 1, licensePlate: 1, status: 1 }),
    read(hr.collection(HR.partnerDriverLinks.name), {}, { _id: 0 }),
  ]);

  const withNid = partnerDrivers.filter((d) => isNid(d.nationalId)).length;
  const activePartner = partnerDrivers.filter((d) => d.status === "active").length;
  const nonDrivingOwners = partnerDrivers.filter((d) => d.status === "active" && d.isTruckOwner === true && d.isDriver === false).length;

  const overview = buildOverview({ partnerDrivers, contracts, etlDrivers, vehicles }, links);
  const h = overview.headcount;

  console.log(`\n[ETL] main_driver ${mainDrivers.length} แถว · active (หลัง statusOverride) พจส. ${h.byType["1"]} · พจร. ${h.byType["2"]} · สแปร์ ${h.byType["4"]}`);
  console.log(`      vehicleCode ที่เด้งเป็นทะเบียนได้ ${vehicles.length}/${refs.length} รหัส`);
  console.log(`[รถร่วม] drivers ${partnerDrivers.length} แถว (active ${activePartner}) · contracts ${contracts.length}`);
  console.log(`         มีเลขบัตร 13 หลัก ${withNid}/${partnerDrivers.length} (${pct(withNid, partnerDrivers.length)})`);
  console.log(`         เจ้าของรถที่ไม่ได้ขับเอง (active) ${nonDrivingOwners}`);
  console.log(`[คู่ที่ยืนยันแล้ว] ${links.length}`);

  const tiers = { high: 0, medium: 0, low: 0, none: 0 };
  let ambiguous = 0;
  for (const p of overview.proposals) {
    tiers[p.candidates[0]?.confidence ?? "none"] += 1;
    if (p.ambiguous) ambiguous += 1;
  }
  const n = overview.proposals.length;
  console.log(`\n[ผลจับคู่] ${n} สัญญารอจับคู่ (ฟิลด์เลขบัตร ETL: ${nidField ?? "ไม่มี"})`);
  for (const [k, v] of Object.entries(tiers)) console.log(`  ${k.padEnd(6)} ${String(v).padStart(5)}  ${pct(v, n)}`);
  console.log(`  ชื่อซ้ำหลายคน (ambiguous) ${ambiguous}`);

  console.log(`\n[ตัวเลขคนขับ] รวม ${h.total} = ETL ${h.etlActive} + รถร่วมไม่ซ้ำ ${h.partnerOnly}`);
  console.log(`  รถร่วม active นับเป็นคนขับ ${h.partnerActive} · ซ้ำกับ ETL ${h.linkedBoth} · ตัดเจ้าของไม่ขับ ${h.excludedOwners}`);
  console.log(`  ขัดแย้ง ${overview.conflicts.length}`);

  console.log(`\n[ตัวอย่างข้อเสนอ ${Math.min(show, n)} แถวแรก]`);
  for (const p of overview.proposals.slice(0, show)) {
    const c = p.candidates[0];
    console.log(
      `  ${p.contractCode.padEnd(11)} ${p.partnerName.padEnd(28)} → ${c ? `${c.drivercode} ${c.name} [${c.confidence}/${c.matchedBy}]` : "ไม่เจอ"}${p.ambiguous ? " (ซ้ำ)" : ""}`,
    );
  }
} finally {
  await client.close();
}
