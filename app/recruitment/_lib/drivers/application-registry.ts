import { ObjectId } from "mongodb";

import { hrCol } from "@/lib/db";
import {
  getApplication,
  updateApplication,
  type ApplicationPatch,
} from "@/app/recruitment/_lib/applications";
import { RecruitmentError } from "@/app/recruitment/_lib/questions";
import { EMPTY_DOCUMENT_DATA, type Application, type DocumentData } from "@/app/recruitment/_lib/types";
import { listDocSlots } from "@/app/recruitment/_lib/doc-slots";
import { linkedApplicationId } from "./portrait";
import { DriverRegistryError, getDriver, updateDriverProfile } from "./registry";
import { REGISTRY_OWNED, REGISTRY_SLOT_DOC_TYPES, SHARED_KEY, type DriverDocSource } from "./document-sync";
import { driverDocumentUrl, type DriverRecord } from "./types";

/**
 * ใบสมัคร ↔ ทะเบียน พจส. — **ข้อมูลจากเอกสารมีเจ้าของที่เดียว** (กติกาอยู่ที่ `document-sync.ts`)
 *
 * ทุกที่ที่อ่าน/แก้ข้อมูลเอกสารของใบสมัคร (กล่องเอกสาร · ทำเอกสาร HR · ลิงก์เซ็นเอกสาร) ผ่านไฟล์นี้:
 * ใบที่ผูกรหัส พจส. แล้วได้ค่าของทะเบียน และแก้แล้วเขียนลงทะเบียน · ใบสมัครเก็บเหลือแค่เลขบัตร (กุญแจ)
 *
 * ใบเก่าที่ยังไม่ได้ย้าย (ทะเบียนว่างแต่ใบสมัครมีค่า) ยังเห็นค่าจากใบสมัครไปก่อน — บันทึกครั้งแรก
 * หรือ `moveDocumentsToRegistry()` ย้ายให้แล้วล้างฝั่งใบสมัคร
 */

const digits = (v: unknown) => (typeof v === "string" ? v.replace(/[^0-9]/g, "") : "");
const same = (a: string, b: string) => a.replace(/[\s-]/g, "").toLowerCase() === b.replace(/[\s-]/g, "").toLowerCase();
const registryValue = (driver: DriverRecord, from: keyof DriverRecord) => String(driver[from] ?? "").trim();

/**
 * รหัส พจส. ของใบสมัครนี้ — ต้องเป็นใบที่ทะเบียนชี้กลับมาหาด้วย (`linkedApplicationId`) ไม่งั้นใบเก่า
 * ของคนเดียวกัน (สมัครซ้ำ) จะได้ข้อมูลทะเบียนไปด้วย
 */
export async function drivercodeOfApplication(application: Pick<Application, "id" | "documents">): Promise<string | null> {
  if (!ObjectId.isValid(application.id)) return null;

  const fromRequisition = await (await hrCol("requisitions"))
    .find(
      { "match.applicationId": application.id, drivercode: { $nin: ["", null] } },
      { projection: { _id: 0, drivercode: 1 } },
    )
    .sort({ updatedAt: -1 })
    .toArray();
  const codes = fromRequisition.map((r) => String(r.drivercode ?? "").trim()).filter(Boolean);

  const nid = digits(application.documents.nationalId);
  if (!codes.length && nid.length === 13) {
    const byNid = await (await hrCol("drivers")).findOne(
      { nationalId: nid },
      { projection: { _id: 0, drivercode: 1 } },
    );
    if (byNid?.drivercode) codes.push(String(byNid.drivercode).trim());
  }

  for (const code of codes) {
    if ((await linkedApplicationId(code, nid)) === application.id) return code;
  }
  return null;
}

async function linkedDriver(application: Application): Promise<DriverRecord | null> {
  if (application.erased) return null;
  const code = await drivercodeOfApplication(application);
  return code ? getDriver(code) : null;
}

/**
 * ร่องรอยในไทม์ไลน์ใบสมัครตอนล้างสำเนา — **เก็บค่าเดิมไว้ให้เปิดดูย้อนหลังได้** (Bew 8 พ.ย. 2569)
 * เป็นบันทึกเหตุการณ์ ไม่มีที่ไหนอ่านไปใช้เป็นค่าจริง · `null` = ไม่มีค่าเดิมให้เก็บ
 */
function movedNote(drivercode: string, documents: DocumentData, keys: (keyof DocumentData)[]): string | null {
  const parts = REGISTRY_OWNED.filter((p) => keys.includes(p.doc) && documents[p.doc].trim()).map(
    (p) => `${p.field.label} ${documents[p.doc].trim()}`,
  );
  return parts.length ? `ย้ายข้อมูลเอกสารไปทะเบียน ${drivercode} · ค่าเดิมในใบสมัคร: ${parts.join(" · ")}` : null;
}

/** ช่องที่ทะเบียนเป็นเจ้าของ = ค่าของทะเบียน (ทะเบียนว่าง = ค่าที่ใบสมัครยังถือไว้ก่อนย้าย) */
function overlay(documents: DocumentData, driver: DriverRecord): DocumentData {
  const out = { ...documents };
  for (const { doc, field } of REGISTRY_OWNED) {
    const reg = registryValue(driver, field.from);
    if (reg) out[doc] = reg;
  }
  return out;
}

/** ใบสมัครพร้อมข้อมูลเอกสารจากทะเบียน (ถ้าผูกรหัสแล้ว) — ใช้แทน `getApplication()` ทุกที่ที่โชว์ข้อมูลเอกสาร */
export async function withRegistryDocuments(application: Application): Promise<Application> {
  const driver = await linkedDriver(application).catch((err) => {
    console.warn("[application-registry] อ่านทะเบียนไม่สำเร็จ — ใช้ข้อมูลในใบสมัคร", err);
    return null;
  });
  if (!driver) return application;
  return {
    ...application,
    documents: overlay(application.documents, driver),
    registryDrivercode: driver.drivercode,
  };
}

export async function getApplicationWithRegistry(id: string): Promise<Application | null> {
  const application = await getApplication(id);
  return application ? withRegistryDocuments(application) : null;
}

/**
 * แก้ใบสมัคร — ช่องที่ทะเบียนเป็นเจ้าของ**เขียนลงทะเบียน** แล้วล้างสำเนาฝั่งใบสมัคร
 * (เลขบัตรเขียนทั้งสองที่ค่าเดียวกัน) · ทะเบียนตรวจก่อนเพราะกติกาเข้มกว่า (เช่น บัญชีกสิกรไทย 10 หลัก)
 */
export async function updateApplicationWithRegistry(
  id: string,
  patch: ApplicationPatch,
  by: string,
): Promise<Application> {
  const incoming = patch.documents;
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
    return withRegistryDocuments(await updateApplication(id, patch, by));
  }

  const current = await getApplication(id);
  const driver = current ? await linkedDriver(current) : null;
  if (!driver) return withRegistryDocuments(await updateApplication(id, patch, by));

  const raw = incoming as Record<string, unknown>;
  const toRegistry: Record<string, string> = {};
  const documents: Record<string, unknown> = { ...raw };
  const cleared: (keyof DocumentData)[] = [];
  for (const { doc, field } of REGISTRY_OWNED) {
    if (!(doc in raw)) continue;
    const value = String(raw[doc] ?? "").trim();
    if (!same(value, registryValue(driver, field.from))) toRegistry[field.key] = value;
    if (doc !== SHARED_KEY) {
      documents[doc] = "";
      cleared.push(doc);
    }
  }
  const note = current ? movedNote(driver.drivercode, current.documents, cleared) : null;

  if (Object.keys(toRegistry).length) {
    try {
      await updateDriverProfile(driver.drivercode, toRegistry, by);
    } catch (err) {
      if (err instanceof DriverRegistryError) throw new RecruitmentError(`ทะเบียน ${driver.drivercode} — ${err.message}`);
      throw err;
    }
  }
  return withRegistryDocuments(
    await updateApplication(id, { ...patch, documents, ...(note && !patch.note ? { note } : {}) }, by),
  );
}

/**
 * ย้ายข้อมูลเอกสารของใบที่ผูกรหัสแล้วไปทะเบียน — ทะเบียนว่างจึงเติม (ทะเบียนมีค่าแล้วชนะเสมอ)
 * แล้วล้างฝั่งใบสมัคร · ช่องที่ทะเบียนรับไม่ได้ (ผิดรูปแบบ · คนพ้นสภาพแล้ว) คงไว้ในใบสมัคร
 * · ใช้ตอนรับเข้าทะเบียน (`registry-sync.ts`) และสคริปต์ย้ายของเก่า · คืนชื่อช่องที่ย้าย/ล้าง
 */
export async function moveDocumentsToRegistry(
  applicationId: string,
  by: string,
): Promise<{ drivercode: string; moved: string[]; kept: string[] } | null> {
  const application = await getApplication(applicationId);
  const driver = application ? await linkedDriver(application) : null;
  if (!application || !driver) return null;

  const moved: string[] = [];
  const kept: string[] = [];
  const clear: Partial<Record<keyof DocumentData, string>> = {};

  for (const { doc, field } of REGISTRY_OWNED) {
    if (doc === SHARED_KEY) continue;
    const own = application.documents[doc].trim();
    if (!own) continue;
    if (!registryValue(driver, field.from)) {
      try {
        await updateDriverProfile(driver.drivercode, { [field.key]: own }, by);
      } catch (err) {
        if (!(err instanceof DriverRegistryError)) throw err;
        kept.push(`${field.label} — ${err.message}`);
        continue;
      }
    }
    clear[doc] = "";
    moved.push(field.label);
  }

  if (Object.keys(clear).length) {
    const note = movedNote(driver.drivercode, application.documents, Object.keys(clear) as (keyof DocumentData)[]);
    await updateApplication(application.id, { documents: clear, ...(note ? { note } : {}) }, by);
  }
  return { drivercode: driver.drivercode, moved, kept };
}

/** แท็บเอกสารของหน้าประวัติ — ข้อมูลเอกสาร + รูปของใบที่ผูกไว้ (ไม่ส่งใบสมัครเต็มใบลง browser) */
export async function getDriverDocSource(applicationId: string, drivercode: string): Promise<DriverDocSource | null> {
  const [application, docSlots] = await Promise.all([getApplicationWithRegistry(applicationId), listDocSlots()]);
  if (!application || application.erased) return null;
  return {
    applicationId: application.id,
    drivercode,
    ref: application.ref,
    documents: application.documents,
    files: Object.fromEntries(application.files.map((f) => [f.slot, f.url])),
    docSlots,
  };
}

/**
 * แท็บเอกสารของคนที่ **ไม่มีใบสมัคร** — กล่องเอกสารชุดเดียวกัน แต่อ่านจากทะเบียนตรง (Bew 11 พ.ย. 2569)
 * ข้อมูล = ช่องที่ทะเบียนเก็บ (`REGISTRY_OWNED`) · รูป = ไฟล์ล่าสุดของกองที่คู่กับช่อง (`REGISTRY_SLOT_DOC_TYPES`)
 */
export async function getRegistryDocSource(driver: DriverRecord): Promise<DriverDocSource> {
  const docSlots = (await listDocSlots()).filter((s) => REGISTRY_SLOT_DOC_TYPES[s.id]);
  const documents: DocumentData = { ...EMPTY_DOCUMENT_DATA };
  for (const { doc, field } of REGISTRY_OWNED) documents[doc] = registryValue(driver, field.from);

  const files: Record<string, string> = {};
  for (const slot of docSlots) {
    const latest = driver.documents
      .filter((d) => d.docType === REGISTRY_SLOT_DOC_TYPES[slot.id] && d.key)
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))[0];
    if (latest) files[slot.id] = driverDocumentUrl(driver.drivercode, latest.fileId);
  }
  return { applicationId: null, drivercode: driver.drivercode, ref: "", documents, files, docSlots };
}
