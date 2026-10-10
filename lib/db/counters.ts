import { hrCol } from "./index";

/** คอลเลกชันตัวนับที่มีอยู่ — แถวละหนึ่งตัวนับ `{ _id, seq }` */
export type CounterKey = "recordCounters" | "recruitmentCounters";

/**
 * เลื่อนตัวนับ `id` ไป `by` แล้วคืน **ค่าหลังเลื่อน** (= เลขตัวสุดท้ายของก้อนที่จองได้)
 *
 * `findOneAndUpdate` + `$inc` + `upsert` เป็น atomic ระดับเอกสาร — สองคนกดพร้อมกันไม่มีทางได้เลขเดียวกัน
 * (นับเองด้วย `countDocuments` ชนกันแน่นอน) · แถวยังไม่มี = สร้างใหม่โดยเริ่มที่ `by`
 *
 * จองเป็นก้อน (`by > 1`) แล้วต้องการเลขแรก: `end - by + 1`
 */
export async function nextSeq(counterKey: CounterKey, id: string, by = 1): Promise<number> {
  if (!Number.isInteger(by) || by < 1) throw new RangeError(`nextSeq: by ต้องเป็นจำนวนเต็ม ≥ 1 (ได้ ${by})`);
  const counters = await hrCol<{ _id: string; seq: number }>(counterKey);
  const counter = await counters.findOneAndUpdate(
    { _id: id },
    { $inc: { seq: by } },
    { upsert: true, returnDocument: "after" },
  );
  return counter?.seq ?? by;
}
