import type { DeskIdentity } from "../auth/identity";
import type { IntakeRecord } from "./intake-status";
import { INTAKE_ITEMS, findItem, type IntakeItem } from "./registry";
import { canSeeOwner } from "./scope";

/**
 * รายการที่ผู้ใช้คนนี้มีสิทธิ์เห็นในรอบหนึ่ง — **เรียงตามทะเบียนเดิมเสมอ**
 * (ไม่เรียงใหม่ เพราะคนที่ใช้ทะเบียนเดิมอยู่แล้วไล่ของตามลำดับนั้น)
 */
export const visibleItems = (identity: DeskIdentity): IntakeItem[] =>
  INTAKE_ITEMS.filter((item) => canSeeOwner(identity, item.owner));

/**
 * กรองสถานะก่อนส่งออกจาก API
 *
 * ต้องกรองที่ฝั่งเซิร์ฟเวอร์ ไม่ใช่ซ่อนบนหน้าจอ — แถวพวกนี้มีชื่อคนส่ง ชื่อไฟล์
 * และเหตุผลที่ตีกลับ ซึ่งเป็นเรื่องภายในของแต่ละฝ่าย · แถวของรายการที่ถูกถอดออกจาก
 * ทะเบียนแล้ว (เช่นรอบเก่าที่เคยมีเลข 25–29) จะไม่ผ่านตัวกรองนี้ ซึ่งถูกต้อง
 */
export const filterRecords = (
  identity: DeskIdentity,
  records: IntakeRecord[],
): IntakeRecord[] =>
  records.filter((record) => {
    const item = findItem(record.itemId);
    return item ? canSeeOwner(identity, item.owner) : false;
  });
