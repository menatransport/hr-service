import { periodFromCode, periodLabel, type PeriodRef } from "./period";

/**
 * สถานะของรอบจ่าย — **ตรรกะล้วน ไม่แตะฐานข้อมูล** (ตัวอ่าน/เขียนอยู่ที่ `periods.ts`)
 *
 * ## ทำไมต้องมีไฟล์นี้
 *
 * เดิม "รอบไหนเปิด" เป็นค่าคงที่ในโค้ด (`CURRENT_PERIOD`) แปลว่าทุกเดือนต้องแก้โค้ด
 * แล้ว deploy ก่อน ฝ่ายถึงจะส่งของเข้ารอบใหม่ได้ — ซึ่งเป็นงานของคนทำเงินเดือน
 * ไม่ใช่ของคนเขียนโค้ด และถ้าลืม deploy ฝ่ายจะเจอ 400 โดยไม่รู้สาเหตุ
 *
 * ตอนนี้สถานะรอบเก็บในคอลเลกชัน `payroll_periods` · HR กดเปิด/ปิดเองได้
 *
 * ## สามสถานะ และเหตุผลที่ต้องมีครบสาม
 *
 * - `open` — ส่งของเข้าได้ · HR รับเข้ารอบได้
 * - `locked` — ปิดแล้ว เปิดดูย้อนหลังได้ แต่เขียนอะไรไม่ได้อีก (ของขึ้น Tiger Soft ไปแล้ว)
 * - `unopened` — **ยังไม่เปิด ไม่ใช่เปิดอยู่** รอบอนาคตที่ยังไม่ถึงเวลาต้องเขียนไม่ได้
 *   ไม่งั้นใครกรอก `?period=2030-01` ก็ได้แถวขยะในคอลเลกชันที่ไม่มีใครเห็นบนหน้าจอ
 */

export type PeriodStatus = "open" | "locked" | "unopened";

export interface PeriodState {
  code: string;
  status: PeriodStatus;
  openedAt?: string;
  openedBy?: string;
  lockedAt?: string;
  lockedBy?: string;
  /** เหตุผล/บันทึกของคนเปิดหรือปิด — เก็บไว้ตอบย้อนหลังว่าทำไมรอบนี้ปิดเร็ว/ช้า */
  note?: string;
}

export type PeriodDecision =
  | { ok: true; period: PeriodRef }
  | { ok: false; message: string };

/**
 * รอบนี้เขียนข้อมูลได้ไหม — **ทุกเส้นที่เขียนทะเบียนต้องถามตัวนี้ที่เซิร์ฟเวอร์**
 *
 * หน้าจอกันให้ชั้นหนึ่งแล้วก็จริง แต่กันได้เฉพาะคนที่กดผ่านหน้าจอ · ยิง API ตรง ๆ
 * ด้วยรอบที่ปิดแล้วหรือยังไม่เปิด ต้องถูกปฏิเสธที่นี่
 */
export function decidePeriod(
  code: string | null | undefined,
  state: PeriodState | null,
): PeriodDecision {
  const period = periodFromCode(code);
  if (!period) {
    return { ok: false, message: "ระบุ period เป็นรูปแบบ YYYY-MM เช่น 2026-09" };
  }

  const status = state?.status ?? "unopened";
  if (status === "open") return { ok: true, period };

  if (status === "locked") {
    const who = state?.lockedBy ? ` (ปิดโดย ${state.lockedBy})` : "";
    return {
      ok: false,
      message: `รอบ ${periodLabel(period)} ปิดแล้ว${who} — เปิดดูย้อนหลังได้ แต่ส่งของเข้ารอบนี้ไม่ได้อีก`,
    };
  }

  return {
    ok: false,
    message: `รอบ ${periodLabel(period)} ยังไม่เปิดรับข้อมูล — ให้ฝ่ายค่าจ้างและสวัสดิการกดเปิดรอบก่อน`,
  };
}

/**
 * รอบที่ควรเปิดให้เห็นเป็นค่าเริ่มต้นเมื่อไม่ได้ระบุมาในลิงก์
 *
 * **รอบที่เปิดอยู่ล่าสุด** ไม่ใช่เดือนปัจจุบันตามนาฬิกา — ของจริงมักเปิดรอบ ก.ย. อยู่
 * จนถึงกลางเดือน ต.ค. การเด้งไปเดือนตามนาฬิกาจะพาคนไปรอบที่ยังไม่เปิดทุกต้นเดือน
 * · ไม่มีรอบไหนเปิดเลยให้ถอยไปรอบที่ปิดล่าสุด (ยังเปิดดูได้) แล้วค่อยตกไปที่ `fallback`
 */
export function defaultPeriodCode(states: PeriodState[], fallback: string): string {
  const open = states.filter((s) => s.status === "open").map((s) => s.code).sort();
  if (open.length) return open[open.length - 1];

  const locked = states.filter((s) => s.status === "locked").map((s) => s.code).sort();
  if (locked.length) return locked[locked.length - 1];

  return fallback;
}
