import type { Collection } from "mongodb";

import { getDb } from "../mongo";
import { parseRecipients } from "./notify-compose";
import { OWNER_ORDER, type IntakeOwner } from "./registry";

/**
 * ผู้รับเมลแจ้งฝ่ายที่ HR บันทึกไว้เอง — คอลเลกชัน `payroll_intake_recipients`
 * **ฝั่งเซิร์ฟเวอร์เท่านั้น** (client ยิง `/api/payroll/notify/recipients`)
 *
 * **หนึ่งแถว = หนึ่งฝ่าย ไม่ผูกรอบ** `_id` เป็นชื่อฝ่ายตรง ๆ เพราะผู้รับของฝ่ายหนึ่ง
 * ไม่ได้เปลี่ยนไปตามรอบจ่าย — ถ้าผูกรอบ HR จะต้องพิมพ์ใหม่ทุกเดือนซึ่งคือปัญหา
 * ที่ของชิ้นนี้มีไว้แก้ · 6 แถวเป็นเพดานตามจำนวนฝ่ายในทะเบียน ไม่ต้องมี index
 *
 * **ค่าที่บันทึกไว้ทับสมุดรายชื่อของ NCAC** เพราะคนที่บันทึกคือคนที่ส่งเมลจริงและรู้ว่า
 * รอบนี้ต้องส่งถึงใคร ส่วนสมุดรายชื่อบอกได้แค่ใครเป็นหัวหน้า/ผู้จัดการตามโครงสร้าง
 * — สองฝ่ายที่ยังไม่ได้ผูกรหัสหน่วยงาน (บัญชี กรุงเทพ/ลาดกระบัง) ไม่มีค่าจากสมุดเลย
 * ที่นี่จึงเป็นทางเดียวที่จะไม่ต้องพิมพ์ผู้รับใหม่ทุกเดือน
 *
 * **ไม่เขียนกลับ NCAC** — สมุดรายชื่อเป็นข้อมูลของระบบอื่น การแก้ผู้รับเมลของเรา
 * ต้องไม่ไปเปลี่ยนตำแหน่งหรืออีเมลของใครที่นั่น
 */

const COLLECTION = "payroll_intake_recipients";

/** กันคนวางรายชื่อทั้งบริษัทลงช่อง — เมลแจ้งฝ่ายส่งถึงคนที่รับผิดชอบ ไม่ใช่ประกาศทั่วบริษัท */
export const MAX_RECIPIENTS = 20;

export interface SavedRecipients {
  owner: IntakeOwner;
  to: string[];
  cc: string[];
  updatedAt: string;
  updatedBy: string;
}

interface RecipientDoc extends Omit<SavedRecipients, "owner"> {
  _id: string;
}

async function recipients(): Promise<Collection<RecipientDoc>> {
  return (await getDb()).collection<RecipientDoc>(COLLECTION);
}

const isOwner = (value: string): value is IntakeOwner =>
  (OWNER_ORDER as string[]).includes(value);

/** ผู้รับที่บันทึกไว้ของทุกฝ่าย — คีย์เป็นชื่อฝ่าย ฝ่ายที่ไม่เคยบันทึกจะไม่มีคีย์ */
export async function listSavedRecipients(): Promise<Map<IntakeOwner, SavedRecipients>> {
  const docs = await (await recipients()).find({}).toArray();
  const saved = new Map<IntakeOwner, SavedRecipients>();

  for (const doc of docs) {
    /* ชื่อฝ่ายในทะเบียนเปลี่ยนได้ (เคยเปลี่ยนมาแล้วตอนแยกลาดกระบัง/กรุงเทพ) แถวที่
       ชี้ไปฝ่ายที่ไม่มีอยู่แล้วต้องถูกข้าม ไม่ใช่หลุดออกไปเป็นผู้รับของฝ่ายอื่น */
    if (!isOwner(doc._id)) continue;
    saved.set(doc._id, {
      owner: doc._id,
      to: doc.to,
      cc: doc.cc,
      updatedAt: doc.updatedAt,
      updatedBy: doc.updatedBy,
    });
  }
  return saved;
}

/**
 * ค่าที่คนกรอกมาไม่ผ่าน — **คนละชนิดกับข้อผิดพลาดของฐานข้อมูล** เพื่อให้ route ตอบ 400
 * (คนแก้เองได้) ไม่ใช่ 500 โดยการเดาจากชนิด `Error` ธรรมดา
 */
export class RecipientInputError extends Error {}

export interface SaveRecipientsInput {
  owner: IntakeOwner;
  /** ข้อความที่คนพิมพ์มาทั้งช่อง — แยกและตรวจที่นี่ ไม่เชื่อรายการที่ client แยกมาแล้ว */
  to: string;
  cc: string;
  by: string;
}

/**
 * ตรวจและแปลงผู้รับที่คนพิมพ์มาเป็นรายการที่เก็บได้ — **ฟังก์ชันล้วน แยกจากการเขียน
 * ฐานข้อมูลเพื่อให้ทดสอบกฎได้โดยไม่ต้องมี Mongo** (กฎพวกนี้คือจุดที่พลาดแล้วเจ็บ:
 * บันทึกอีเมลผิดรูปไว้แล้วเมลรอบหน้าส่งไม่ออกโดยไม่มีใครรู้)
 *
 * ต้องมีผู้รับใน `to` อย่างน้อยหนึ่งคน — ร่างที่ไม่มีผู้รับไม่มีอะไรให้บันทึก
 * ถ้าอยากเลิกใช้ค่าที่บันทึกไว้ให้ลบทิ้ง (`clearSavedRecipients`) ไม่ใช่บันทึกช่องว่าง
 */
export function validateRecipients(
  toText: string,
  ccText: string,
): { to: string[]; cc: string[] } {
  const to = parseRecipients(toText);
  const cc = parseRecipients(ccText);
  const invalid = [...to.invalid, ...cc.invalid];

  if (invalid.length) {
    throw new RecipientInputError(`อีเมลไม่ถูกรูปแบบ: ${invalid.join(", ")}`);
  }
  if (to.emails.length === 0) {
    throw new RecipientInputError("ต้องมีผู้รับในช่อง “ถึง” อย่างน้อยหนึ่งคน");
  }
  if (to.emails.length + cc.emails.length > MAX_RECIPIENTS) {
    throw new RecipientInputError(
      `ผู้รับและสำเนารวมกันได้ไม่เกิน ${MAX_RECIPIENTS} คน — ที่ส่งมา ${to.emails.length + cc.emails.length} คน`,
    );
  }

  /* คนที่อยู่ในช่อง "ถึง" แล้วไม่ต้องได้สำเนาซ้ำ — Gmail ส่งสองฉบับให้คนเดียว */
  return { to: to.emails, cc: cc.emails.filter((email) => !to.emails.includes(email)) };
}

/** บันทึกผู้รับของฝ่ายหนึ่ง ทับของเดิมถ้ามี */
export async function saveRecipients(input: SaveRecipientsInput): Promise<SavedRecipients> {
  const { to, cc } = validateRecipients(input.to, input.cc);

  const saved: SavedRecipients = {
    owner: input.owner,
    to,
    cc,
    updatedAt: new Date().toISOString(),
    updatedBy: input.by,
  };

  await (await recipients()).updateOne(
    { _id: input.owner },
    { $set: { to: saved.to, cc: saved.cc, updatedAt: saved.updatedAt, updatedBy: saved.updatedBy } },
    { upsert: true },
  );
  return saved;
}

/** ลบค่าที่บันทึกไว้ของฝ่ายหนึ่ง — ร่างกลับไปใช้ผู้รับจากสมุดรายชื่อตามเดิม */
export async function clearSavedRecipients(owner: IntakeOwner): Promise<void> {
  await (await recipients()).deleteOne({ _id: owner });
}
