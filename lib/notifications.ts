import { formatDateTime, isPendingFor, isSlaBreached, slaTarget } from "./case-flow";
import type { HrCase } from "./types";

/**
 * แจ้งเตือนของ HR desk — **คำนวณจากเคสจริงที่ดึงมาจาก NCAC** ไม่ได้เก็บเป็นรายการแยก
 * เพิ่ม/แก้เงื่อนไขที่ `buildNotifications()` ที่เดียว
 *
 * เรียงตามความเร่งด่วน: เกิน SLA → รอฉันอนุมัติ → ยังไม่มอบหมาย
 */
export type NotificationTone = "sla" | "approve" | "assign" | "info";

export interface DeskNotification {
  /** คงที่ต่อ (เงื่อนไข + เคส) — ใช้เป็นคีย์จำว่า “อ่านแล้ว” */
  id: string;
  tone: NotificationTone;
  /** หัวข้อสั้น บอกว่าต้องทำอะไร */
  title: string;
  /** บรรทัดรอง — เลขติดตาม + เวลา */
  meta: string;
  href: string | null;
  /**
   * เวลาที่ทำให้แจ้งเตือนนี้เกิด — ถ้าเคสขยับใหม่ค่านี้เปลี่ยน
   * กระดิ่งจึงพลิกกลับเป็น “ยังไม่อ่าน” ได้ ทั้งที่ `id` เดิม
   */
  stamp: string;
}

const MAX_ITEMS = 8;

/** สีจุดนำหน้าแต่ละแบบ — ใช้เฉพาะ token ที่มีอยู่แล้วใน design system */
export const toneDot: Record<NotificationTone, string> = {
  sla: "bg-sla",
  approve: "bg-st-wait-ink",
  assign: "bg-primary",
  info: "bg-mut",
};

/**
 * `viewerEmployeeId` = คนที่ล็อกอินอยู่ (จาก session) — เงื่อนไข “รอคุณอนุมัติ”
 * ผูกกับคนคนนี้เท่านั้น ผู้เรียกจึงต้องส่งมาเสมอ ห้ามให้ที่นี่ไปเดาเอง
 */
export function buildNotifications(
  cases: HrCase[],
  viewerEmployeeId: string,
): DeskNotification[] {
  const byNewest = (a: { at: string }, b: { at: string }) =>
    b.at.localeCompare(a.at);

  const breached = cases
    .filter(isSlaBreached)
    .map((c) => ({ at: c.updatedAt, c }))
    .sort(byNewest)
    .map(
      ({ c }): DeskNotification => ({
        id: `sla-${c.trackingNo}`,
        tone: "sla",
        title: `เกิน SLA — ${c.subject}`,
        meta: `${c.trackingNo} · เกณฑ์ ${slaTarget(c.priority)} วัน · อัปเดต ${formatDateTime(c.updatedAt)}`,
        href: `/desk/cases/${c.trackingNo}`,
        stamp: c.updatedAt,
      }),
    );

  const toApprove = cases
    .filter((c) => isPendingFor(c, viewerEmployeeId))
    .map((c) => ({ at: c.updatedAt, c }))
    .sort(byNewest)
    .map(
      ({ c }): DeskNotification => ({
        id: `approve-${c.trackingNo}`,
        tone: "approve",
        title: `รอคุณอนุมัติแผนแก้ไข — ${c.subject}`,
        meta: `${c.trackingNo} · ส่งเมื่อ ${formatDateTime(c.updatedAt)}`,
        href: `/desk/cases/${c.trackingNo}`,
        stamp: c.updatedAt,
      }),
    );

  const unassigned = cases
    .filter((c) => c.status === "open" && !c.departmentId)
    .map((c) => ({ at: c.createdAt, c }))
    .sort(byNewest)
    .map(
      ({ c }): DeskNotification => ({
        id: `assign-${c.trackingNo}`,
        tone: "assign",
        title: `เคสใหม่ รอมอบหมายหน่วยงาน — ${c.subject}`,
        meta: `${c.trackingNo} · แจ้งเมื่อ ${formatDateTime(c.createdAt)}`,
        href: `/desk/cases/${c.trackingNo}`,
        stamp: c.createdAt,
      }),
    );

  const seen = new Set<string>();
  return [...breached, ...toApprove, ...unassigned]
    .filter((n) => {
      // เคสเดียวอาจเข้าหลายเงื่อนไข — เก็บอันที่เร่งด่วนที่สุดพอ
      // (id เป็น `<tone>-<trackingNo>` จึงตัด tone ทิ้งได้ตรง ๆ)
      const key = n.id.slice(n.id.indexOf("-") + 1);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_ITEMS);
}
