import type { Collection } from "mongodb";

import { getDb } from "../mongo";
import type { IntakeRecord, IntakeStage } from "./intake-status";
import { findItem } from "./registry";

/**
 * สถานะการรับข้อมูลรายรอบ — คอลเลกชัน `payroll_intake` **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 * (client ยิง `/api/payroll/intake` แทน)
 *
 * **หนึ่งแถว = ของหนึ่งชิ้นในหนึ่งรอบ** `_id` เป็น `"<periodCode>:<itemId>"` เช่น
 * `"2026-09:01"` — คีย์ประกอบแบบนี้ทำให้ upsert ซ้ำกี่ครั้งก็ไม่เกิดแถวซ้ำ และไม่ต้อง
 * มี unique index แยก (บทเรียนจาก drivingdistance ที่รันซ้ำแล้วได้ข้อมูลซ้ำ)
 *
 * คอลเลกชันนี้โตช้ามาก — 30 แถวต่อเดือน คือ 360 แถวต่อปี การ `find({ period })`
 * จึงไม่ต้องมี index และไม่มีทางหนักฐานข้อมูล **อย่าเผลอ query ข้ามรอบทั้งหมด**
 * ถ้าวันหนึ่งต้องทำรายงานย้อนหลังหลายปี ค่อยเติม index ที่ `period` ตอนนั้น
 *
 * ทะเบียนว่า “ต้องได้อะไรบ้าง” อยู่ที่ `registry.ts` ไม่ใช่ที่นี่ — ของที่ยังไม่เคย
 * ส่งจะ **ไม่มีแถวในคอลเลกชันนี้เลย** แล้วฝั่งอ่านเติมเป็น `waiting` ให้เอง
 * วิธีนี้ทำให้เพิ่มรายการใหม่ในทะเบียนแล้วรอบเก่าไม่เพี้ยน
 */

const COLLECTION = "payroll_intake";

interface IntakeDoc extends Omit<IntakeRecord, "itemId"> {
  _id: string;
  period: string;
  itemId: string;
}

async function intakes(): Promise<Collection<IntakeDoc>> {
  return (await getDb()).collection<IntakeDoc>(COLLECTION);
}

const keyOf = (period: string, itemId: string) => `${period}:${itemId}`;

const toRecord = (doc: IntakeDoc): IntakeRecord => ({
  itemId: doc.itemId,
  stage: doc.stage,
  fileName: doc.fileName,
  receivedAt: doc.receivedAt,
  receivedBy: doc.receivedBy,
  passedAt: doc.passedAt,
  passedBy: doc.passedBy,
  returnedReason: doc.returnedReason,
  rows: doc.rows,
  columns: doc.columns,
  updatedAt: doc.updatedAt,
  updatedBy: doc.updatedBy,
});

/** ทุกแถวของรอบหนึ่ง — ของที่ยังไม่เคยส่งจะไม่อยู่ในผลลัพธ์ */
export async function listIntake(period: string): Promise<IntakeRecord[]> {
  const docs = await (await intakes()).find({ period }).toArray();
  return docs.map(toRecord);
}

export interface SaveIntakeInput {
  period: string;
  itemId: string;
  stage: IntakeStage;
  fileName?: string;
  returnedReason?: string;
  rows?: number;
  columns?: number;
  updatedBy: string;
}

/**
 * บันทึกสถานะของชิ้นหนึ่ง
 *
 * **`receivedAt` ตั้งเฉพาะตอนที่ไฟล์เข้ามาจริง** (`submitted`) และไม่แตะอีกเลยเมื่อ
 * สถานะเปลี่ยนเป็น `passed` — เพราะความช้าวัดจากวันที่ของมาถึง ไม่ใช่วันที่ตรวจเสร็จ
 * ส่วน `returned` ล้าง `receivedAt` ทิ้ง เพราะของถูกตีกลับไปแล้ว ยังไม่นับว่าได้รับ
 *
 * **ผ่านได้เฉพาะของที่อัปโหลดแล้ว** — กันการกดผ่านของที่ยังไม่มีไฟล์เข้ามาเลย
 * (ยิง API ตรงก็ทำไม่ได้ ไม่ใช่แค่ปุ่มบนหน้าจอถูกปิด) · ของที่ถูกตีกลับต้องส่งใหม่
 * ให้กลายเป็น `submitted` ก่อน จึงจะผ่านได้ ไม่ใช่กดผ่านทับเหตุผลที่ตีกลับไว้
 */
export async function saveIntake(input: SaveIntakeInput): Promise<IntakeRecord> {
  if (!findItem(input.itemId)) {
    throw new Error(`ไม่รู้จักรายการ "${input.itemId}" ในทะเบียนรับข้อมูล`);
  }
  if (input.stage === "returned" && !input.returnedReason?.trim()) {
    throw new Error("ตีกลับต้องระบุเหตุผล ไม่งั้นผู้ส่งไม่รู้ว่าต้องแก้อะไร");
  }

  const collection = await intakes();

  if (input.stage === "passed") {
    const current = await collection.findOne({
      _id: keyOf(input.period, input.itemId),
    });
    if (current?.stage !== "submitted") {
      throw new Error(
        current?.stage === "passed"
          ? "รายการนี้รับเข้ารอบไปแล้ว"
          : "รับเข้ารอบไม่ได้ — ยังไม่มีไฟล์อัปโหลดเข้ามาในรอบนี้",
      );
    }
  }

  const now = new Date().toISOString();
  const set: Partial<IntakeDoc> = {
    period: input.period,
    itemId: input.itemId,
    stage: input.stage,
    updatedAt: now,
    updatedBy: input.updatedBy,
  };
  const unset: Record<string, ""> = {};

  if (input.fileName?.trim()) set.fileName = input.fileName.trim();
  if (typeof input.rows === "number") set.rows = input.rows;
  if (typeof input.columns === "number") set.columns = input.columns;

  /* ทุกสถานะที่ไม่ใช่ `passed` ต้องล้างลายเซ็นการผ่านทิ้ง — ของที่ผ่านแล้วถูกตีกลับ
     หรือส่งไฟล์ใหม่ทับ แปลว่าการผ่านครั้งก่อนไม่ใช้แล้ว ถ้าค้างไว้จะอ่านได้ว่า
     ของที่กำลังรอตรวจมีคนผ่านไปแล้ว */
  if (input.stage === "submitted") {
    set.receivedAt = now;
    set.receivedBy = input.updatedBy;
  }
  if (input.stage === "passed") {
    set.passedAt = now;
    set.passedBy = input.updatedBy;
  } else {
    unset.passedAt = "";
    unset.passedBy = "";
  }
  if (input.stage === "returned") {
    set.returnedReason = input.returnedReason!.trim();
    unset.receivedAt = "";
    unset.receivedBy = "";
  } else {
    unset.returnedReason = "";
  }
  if (input.stage === "waiting") {
    unset.receivedAt = "";
    unset.receivedBy = "";
    unset.fileName = "";
    unset.rows = "";
    unset.columns = "";
  }

  const doc = await collection.findOneAndUpdate(
    { _id: keyOf(input.period, input.itemId) },
    Object.keys(unset).length ? { $set: set, $unset: unset } : { $set: set },
    { upsert: true, returnDocument: "after" },
  );

  if (!doc) throw new Error("บันทึกสถานะไม่สำเร็จ");
  return toRecord(doc);
}
