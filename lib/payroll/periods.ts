import type { Collection } from "mongodb";

import { getDb } from "../mongo";
import { CURRENT_PERIOD, LOCKED_PERIODS, periodCode, type PeriodRef } from "./period";
import {
  decidePeriod,
  type PeriodDecision,
  type PeriodState,
  type PeriodStatus,
} from "./period-state";

/**
 * รอบจ่ายที่เปิด/ปิด — คอลเลกชัน `payroll_periods` **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 *
 * หนึ่งแถว = หนึ่งรอบ · `_id` เป็นรหัสรอบ (`"2026-09"`) เหมือนที่ใช้เป็นคีย์ทุกที่
 * ปีละ 12 แถว จึงไม่ต้องมี index และ `find({})` ทั้งคอลเลกชันก็ยังเบา
 *
 * **คอลเลกชันว่าง = ใช้ค่าคงที่เดิมในโค้ด** (`CURRENT_PERIOD` เปิด · `LOCKED_PERIODS` ปิด)
 * เพื่อให้ระบบที่ยังไม่เคยกดเปิดรอบทำงานเหมือนเดิมเป๊ะ ๆ ไม่ใช่กลายเป็น "ไม่มีรอบไหน
 * เปิดเลย" แล้วทุกฝ่ายอัปโหลดไม่ได้พร้อมกัน · พอ HR กดเปิดรอบครั้งแรก แถวจริงจะทับ
 * ค่าสำรองนี้ไปเอง และค่าคงที่ในโค้ดก็เลิกมีความหมาย
 */

const COLLECTION = "payroll_periods";

interface PeriodDoc {
  _id: string;
  status: Exclude<PeriodStatus, "unopened">;
  openedAt?: string;
  openedBy?: string;
  lockedAt?: string;
  lockedBy?: string;
  note?: string;
}

async function periods(): Promise<Collection<PeriodDoc>> {
  return (await getDb()).collection<PeriodDoc>(COLLECTION);
}

const toState = (doc: PeriodDoc): PeriodState => ({
  code: doc._id,
  status: doc.status,
  openedAt: doc.openedAt,
  openedBy: doc.openedBy,
  lockedAt: doc.lockedAt,
  lockedBy: doc.lockedBy,
  note: doc.note,
});

/** ค่าสำรองจากค่าคงที่ในโค้ด — ใช้เฉพาะตอนยังไม่เคยมีใครกดเปิดรอบ */
export function fallbackStates(): PeriodState[] {
  const states: PeriodState[] = [
    { code: periodCode(CURRENT_PERIOD), status: "open" },
  ];
  for (const [year, months] of Object.entries(LOCKED_PERIODS)) {
    for (const month of months) {
      states.push({ code: periodCode({ year: Number(year), month }), status: "locked" });
    }
  }
  return states;
}

export async function listPeriods(): Promise<PeriodState[]> {
  const docs = await (await periods()).find({}).toArray();
  if (!docs.length) return fallbackStates();
  return docs.map(toState).sort((a, b) => a.code.localeCompare(b.code));
}

export async function periodState(code: string): Promise<PeriodState | null> {
  const doc = await (await periods()).findOne({ _id: code });
  if (doc) return toState(doc);
  /* ยังไม่มีแถวจริงเลยทั้งคอลเลกชัน → ตกไปใช้ค่าคงที่เดิม · มีแถวอื่นแล้วแต่ไม่มีรอบนี้
     แปลว่ารอบนี้ยังไม่เปิดจริง ๆ ไม่ใช่ให้ย้อนไปอ่านค่าคงที่ */
  const total = await (await periods()).countDocuments({}, { limit: 1 });
  if (total > 0) return null;
  return fallbackStates().find((s) => s.code === code) ?? null;
}

/** ด่านเดียวที่ทุกเส้นเขียนข้อมูลต้องผ่าน */
export async function writablePeriodState(
  code: string | null | undefined,
): Promise<PeriodDecision> {
  return decidePeriod(code, code ? await periodState(code) : null);
}

/**
 * เปิดรอบ — เปิดซ้ำได้ (idempotent) และ **เปิดรอบที่ปิดไปแล้วได้ด้วย** เพราะของจริง
 * มีกรณีปิดรอบไปแล้วเจอว่าฝ่ายส่งผิดไฟล์ · การเปิดกลับเก็บชื่อคนเปิดกับเหตุผลไว้
 */
export async function openPeriod(
  code: string,
  by: string,
  note?: string,
): Promise<PeriodState> {
  const now = new Date().toISOString();
  await (await periods()).updateOne(
    { _id: code },
    {
      $set: { status: "open", openedAt: now, openedBy: by, note: note?.trim() || undefined },
      $unset: { lockedAt: "", lockedBy: "" },
    },
    { upsert: true },
  );
  return { code, status: "open", openedAt: now, openedBy: by, note: note?.trim() || undefined };
}

export async function lockPeriod(
  code: string,
  by: string,
  note?: string,
): Promise<PeriodState> {
  const now = new Date().toISOString();
  await (await periods()).updateOne(
    { _id: code },
    { $set: { status: "locked", lockedAt: now, lockedBy: by, note: note?.trim() || undefined } },
    { upsert: true },
  );
  return { code, status: "locked", lockedAt: now, lockedBy: by, note: note?.trim() || undefined };
}

export type { PeriodRef };
