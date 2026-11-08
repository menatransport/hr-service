import { randomBytes } from "node:crypto";
import type { Collection } from "mongodb";

import { hrCol } from "@/lib/db";
import { presignMedia } from "@/lib/s3";
import { getApplicationWithRegistry as getApplication } from "./drivers/application-registry";
import { listDocSlots } from "./doc-slots";
import type { DocSlot } from "./form";
import type { HrActor } from "./hr-document-records";
import { personName, type DocFill, type HrDocId } from "./hr-documents";
import { isSignatureImage, signKey, type DocSignature } from "./hr-signatures";
import { RecruitmentError } from "./questions";
import { findRequisitionForApplication } from "./requisitions/store";
import type { Requisition } from "./requisitions/types";
import {
  SIGN_LINK_DAYS,
  SIGNABLE_DOCS,
  isSignableDoc,
  type SignLinkState,
} from "./sign-links";
import type { Application } from "./types";

/**
 * ลิงก์ให้ผู้สมัครเซ็นเอง — **ฝั่งเซิร์ฟเวอร์เท่านั้น** (กติกาอยู่ที่หัวไฟล์ `sign-links.ts`)
 *
 * `_id` = token ในลิงก์ · ไม่ hash เพราะฝ่ายบุคคลต้องคัดลอกลิงก์เดิมซ้ำได้ — ลิงก์ก็คือ
 * กุญแจอยู่แล้ว และหมดอายุเองใน `SIGN_LINK_DAYS` วัน
 */

interface SignLinkDoc {
  _id: string;
  applicationId: string;
  ref: string;
  docs: HrDocId[];
  createdAt: string;
  createdBy: HrActor;
  expiresAt: string;
}

/** ส่วนที่ต้องใช้ของเอกสารหลัก — อ่านตรงจาก `hrDocuments` (ไฟล์ store ของมันเป็นเจ้าของรูปเต็ม) */
interface RecordDoc {
  applicationId: string;
  fill: DocFill;
  revision: number;
}

function links(): Promise<Collection<SignLinkDoc>> {
  return hrCol<SignLinkDoc>("signLinks");
}

function records(): Promise<Collection<RecordDoc>> {
  return hrCol<RecordDoc>("hrDocuments");
}

const alive = (link: SignLinkDoc) => Date.parse(link.expiresAt) > Date.now();

function signedOf(fill: DocFill | undefined): SignLinkState["signed"] {
  const out: SignLinkState["signed"] = {};
  for (const doc of SIGNABLE_DOCS) {
    const sig = fill?.signatures?.[signKey(doc, "applicant")];
    if (sig) out[doc] = sig.signedAt;
  }
  return out;
}

/* --------------------------------------------------------------- ฝั่งฝ่ายบุคคล */

export async function getSignLinkState(applicationId: string): Promise<SignLinkState> {
  const [link, record] = await Promise.all([
    (await links()).findOne({ applicationId }, { sort: { createdAt: -1 } }),
    (await records()).findOne({ applicationId }, { projection: { "fill.signatures": 1 } }),
  ]);
  return {
    link:
      link && alive(link)
        ? {
            token: link._id,
            docs: link.docs,
            createdAt: link.createdAt,
            createdBy: link.createdBy.name,
            expiresAt: link.expiresAt,
          }
        : null,
    signed: signedOf(record?.fill),
    hasRecord: Boolean(record),
  };
}

/** สร้างลิงก์ใหม่ — ลิงก์เก่าของใบนี้ใช้ไม่ได้ทันที (หนึ่งใบหนึ่งลิงก์) */
export async function createSignLink(
  applicationId: string,
  input: unknown,
  actor: HrActor,
): Promise<SignLinkState> {
  const raw = (input as { docs?: unknown } | null)?.docs;
  const docs = Array.isArray(raw) ? SIGNABLE_DOCS.filter((d) => raw.includes(d)) : [];
  if (!docs.length) throw new RecruitmentError("เลือกเอกสารที่จะให้ผู้สมัครเซ็นอย่างน้อย 1 ฉบับ");

  const application = await getApplication(applicationId);
  if (!application) throw new RecruitmentError("ไม่พบใบสมัครที่ระบุ");
  if (application.erased) throw new RecruitmentError("ข้อมูลผู้สมัครถูกลบตามคำขอแล้ว — ทำเอกสารไม่ได้");
  if (!(await (await records()).countDocuments({ applicationId }, { limit: 1 }))) {
    throw new RecruitmentError("บันทึกข้อมูลเอกสารก่อน — ลิงก์แสดงเอกสารตามค่าที่บันทึกแล้ว");
  }

  const col = await links();
  await col.deleteMany({ applicationId });
  const now = Date.now();
  await col.insertOne({
    _id: randomBytes(32).toString("base64url"),
    applicationId,
    ref: application.ref,
    docs,
    createdAt: new Date(now).toISOString(),
    createdBy: actor,
    expiresAt: new Date(now + SIGN_LINK_DAYS * 86_400_000).toISOString(),
  });
  return getSignLinkState(applicationId);
}

export async function revokeSignLink(applicationId: string): Promise<SignLinkState> {
  await (await links()).deleteMany({ applicationId });
  return getSignLinkState(applicationId);
}

/* ---------------------------------------------------------------- ฝั่งผู้สมัคร */

export interface SignPortalData {
  token: string;
  expiresAt: string;
  docs: HrDocId[];
  application: Application;
  fill: DocFill;
  requisition: Requisition | null;
  docSlots: DocSlot[];
}

async function resolve(token: string) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{30,60}$/.test(token)) return null;
  const link = await (await links()).findOne({ _id: token });
  if (!link || !alive(link)) return null;
  return link;
}

/**
 * ข้อมูลทั้งหน้าเซ็นของผู้สมัคร — `null` = ลิงก์ไม่ถูกต้อง/หมดอายุ/ถูกยกเลิก/ข้อมูลถูกลบ
 *
 * รายงานผู้สมัครบนหน้านี้เป็นข้อมูลของผู้สมัครเอง · รูปหน้าตรงเปลี่ยนเป็นลิงก์ presigned
 * เพราะ `/api/media` ต้องล็อกอิน · ช่องบันทึกภายในของผู้สัมภาษณ์ถูกซ่อนตอนวาด
 */
export async function loadSignPortal(token: string): Promise<SignPortalData | null> {
  const link = await resolve(token);
  if (!link) return null;

  const [application, record, requisition, docSlots] = await Promise.all([
    getApplication(link.applicationId),
    (await records()).findOne({ applicationId: link.applicationId }),
    findRequisitionForApplication(link.applicationId),
    listDocSlots(),
  ]);
  if (!application || application.erased || !record) return null;

  const files = await Promise.all(
    application.files.map(async (f) => {
      if (f.slot !== "portrait") return f;
      const key = f.url.replace(/^\/api\/media\//, "");
      const url = await presignMedia(decodeURIComponent(key), 3600).catch(() => "");
      return { ...f, url };
    }),
  );

  return {
    token,
    expiresAt: link.expiresAt,
    docs: link.docs,
    application: { ...application, files: files.filter((f) => f.url) },
    fill: record.fill,
    requisition,
    docSlots,
  };
}

/** ผู้สมัครเซ็นช่องของตัวเองหนึ่งฉบับ — เซ็นแล้วล็อก ฝ่ายบุคคลต้องล้างให้ถึงเซ็นใหม่ได้ */
export async function signAsApplicant(token: string, input: unknown): Promise<DocSignature> {
  const link = await resolve(token);
  if (!link) throw new RecruitmentError("ลิงก์นี้หมดอายุหรือถูกยกเลิกแล้ว — ติดต่อฝ่ายบุคคลเพื่อขอลิงก์ใหม่");

  const body = (input ?? {}) as { docId?: unknown; image?: unknown };
  if (!isSignableDoc(body.docId) || !link.docs.includes(body.docId)) {
    throw new RecruitmentError("เอกสารนี้ไม่ได้อยู่ในลิงก์");
  }
  if (!isSignatureImage(body.image)) throw new RecruitmentError("รูปลายเซ็นไม่ถูกต้องหรือใหญ่เกินไป");

  const application = await getApplication(link.applicationId);
  if (!application || application.erased) throw new RecruitmentError("ไม่พบเอกสารของลิงก์นี้");

  const col = await records();
  const record = await col.findOne({ applicationId: link.applicationId });
  if (!record) throw new RecruitmentError("ไม่พบเอกสารของลิงก์นี้");

  const key = signKey(body.docId, "applicant");
  const signature: DocSignature = {
    image: body.image,
    name: body.docId === "profile" ? application.fullName : personName(record.fill) || application.fullName,
    by: "applicant",
    employeeId: "",
    signedAt: new Date().toISOString(),
  };

  /* เขียนเฉพาะช่องนี้ + ขยับ revision · เงื่อนไข “ยังไม่มีลายเซ็น” อยู่ในคำสั่งเดียวกัน
     กดซ้ำสองเครื่องพร้อมกันก็ลงได้ครั้งเดียว */
  const path = `fill.signatures.${key}`;
  const res = await col.updateOne(
    { applicationId: link.applicationId, [path]: { $exists: false } },
    { $set: { [path]: signature, updatedAt: signature.signedAt }, $inc: { revision: 1 } },
  );
  if (!res.matchedCount) throw new RecruitmentError("เอกสารฉบับนี้ลงนามไปแล้ว");
  return signature;
}
