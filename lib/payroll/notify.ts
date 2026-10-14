import { resolveRecipients } from "../case-notify";
import type { UserDto } from "../ncac/types";
import { dueDate, emptyRecord, lateDays, type IntakeRecord } from "./intake-status";
import { departmentIdOf } from "./owner-directory";
import { periodCode, periodLabel, TH_MONTHS, type PeriodRef } from "./period";
import { itemsByOwner, type IntakeItem, type IntakeOwner } from "./registry";

/**
 * ร่างอีเมลแจ้งฝ่ายว่าเปิดรอบแล้ว — **ระบบไม่ส่งเมลเอง**
 *
 * หน้าจอเปิดหน้าเขียนเมลของ Gmail ให้พร้อมกรอกผู้รับ/หัวเรื่อง/เนื้อความ แล้วผู้ใช้
 * เป็นคนกดส่งจากบัญชีของตัวเอง — ท่าเดียวกับอีเมลแจ้งหน่วยงานของฝั่งคำร้อง
 * (`lib/case-notify.ts` มติ 8 ก.ย. 2569) และยืนยันอีกครั้งเมื่อ 14 ต.ค. 2569:
 * ไม่ต้องมีบัญชีเมลกลาง ไม่เก็บโทเคนของใครไว้ในระบบ และเมลที่ออกไปมีชื่อคนส่งจริงเสมอ
 *
 * **เนื้อความเป็นข้อความล้วน** เพราะหน้าเขียนเมลของ Gmail รับแค่ข้อความล้วน
 * จัดหน้าด้วยการเว้นบรรทัด ไม่ใช่ HTML
 *
 * กฎผู้รับเหมือนฝั่งคำร้อง (ใช้ `resolveRecipients` ตัวเดียวกัน ไม่เขียนซ้ำ):
 * **TO = หัวหน้า · CC = ผู้จัดการ** ของหน่วยงานนั้น หน่วยงานที่ไม่มีหัวหน้าที่ยัง active
 * เลื่อนผู้จัดการขึ้นเป็น TO ไม่ใช่ส่งไม่ออก
 *
 * **ฝั่งเซิร์ฟเวอร์เท่านั้น** (`notifyDraft` อ่านสมุดรายชื่อ NCAC) — หน้าจอเรียกผ่าน
 * `GET /api/payroll/notify` · ส่วนลิงก์/หัวเรื่อง/เนื้อความเป็นฟังก์ชันล้วน ทดสอบได้ไม่พึ่ง NCAC
 */

/**
 * ลิงก์เข้าหน้าทะเบียนของรอบนั้น — `origin` มาจากคำขอจริง ไม่ใช่ env (เหตุผลเดียวกับ
 * `caseUrl` ใน `case-notify.ts`: ไม่แขวนลิงก์ในเมลไว้กับค่าที่กระทบการล็อกอินทั้งบริษัท)
 *
 * **`owner` ในลิงก์ใช้เลื่อนหน้าไปหากลุ่มเท่านั้น ไม่ให้สิทธิ์อะไร** — คนเปิดต้องล็อกอิน
 * และเห็นเฉพาะรายการของฝ่ายตัวเองตาม session เสมอ
 */
export function intakeLink(origin: string, period: PeriodRef, owner: IntakeOwner): string {
  return (
    `${origin.replace(/\/+$/, "")}/payroll/intake` +
    `?period=${periodCode(period)}&owner=${encodeURIComponent(owner)}`
  );
}

export function subjectOf(owner: IntakeOwner, period: PeriodRef): string {
  return `[HR Service] ทะเบียนรับข้อมูลเงินเดือน รอบ ${periodLabel(period)} — ${owner}`;
}

interface BodyArgs {
  owner: IntakeOwner;
  period: PeriodRef;
  items: IntakeItem[];
  records: Map<string, IntakeRecord>;
  link: string;
  now: Date;
}

const recordOf = (records: Map<string, IntakeRecord>, item: IntakeItem) =>
  records.get(item.id) ?? emptyRecord(item.id);

/** ท่อนต้นเมล — ชื่อเรื่อง ลิงก์ และเรื่องการล็อกอิน (ชุดเดียวกันทั้งฉบับเต็มและฉบับย่อ) */
function openingOf(
  { owner, period, link }: Pick<BodyArgs, "owner" | "period" | "link">,
  nothingToSend = false,
): string[] {
  return [
    `ทะเบียนรับข้อมูลเงินเดือน รอบ ${periodLabel(period)} — ${owner}`,
    "",
    /* ไม่มีอะไรค้างแล้วจะชวน “ส่งข้อมูล” ต่อไม่ได้ — เมลกลายเป็นแจ้งสถานะแทน */
    nothingToSend
      ? "รอบนี้ไม่มีรายการค้างส่งแล้ว ดูสถานะของแต่ละรายการได้ที่ลิงก์นี้"
      : "เปิดรอบแล้ว ส่งข้อมูลเข้าระบบได้ที่ลิงก์นี้",
    link,
    "",
    `ลิงก์นี้ต้องเข้าสู่ระบบด้วยบัญชีบริษัทก่อน แล้วจะเห็นเฉพาะรายการของ${owner}`,
  ];
}

/**
 * เนื้อเมลข้อความล้วน — **ไม่มีลายเซ็นผู้ส่ง** เพราะเมลออกจากบัญชีของผู้ใช้เอง
 * Gmail เติมลายเซ็นของเจ้าตัวให้ตอนเปิดหน้าเขียน
 *
 * รายการเรียงตามทะเบียน (ไม่เรียงตามสถานะ) และนำหน้าด้วยรหัสในทะเบียน (`#01`) ตรงกับที่
 * หน้าจอและแบบฟอร์มแสดง ไม่ใช้เลขลำดับ 1..n ที่คนอ่านปนกับรหัสได้
 * หัวข้อที่ไม่มีรายการจะไม่ถูกพิมพ์ทิ้งไว้เปล่า ๆ
 */
export function bodyOf({ owner, period, items, records, link, now }: BodyArgs): string {
  const month = TH_MONTHS[period.month];
  const toSend: IntakeItem[] = [];
  const returned: { item: IntakeItem; reason: string }[] = [];
  const submitted: IntakeItem[] = [];
  const passed: IntakeItem[] = [];

  for (const item of items) {
    const record = recordOf(records, item);
    if (record.stage === "passed") passed.push(item);
    else if (record.stage === "submitted") submitted.push(item);
    else if (record.stage === "returned") {
      returned.push({ item, reason: record.returnedReason?.trim() || "ไม่ได้ระบุเหตุผล" });
    } else toSend.push(item);
  }

  const lines = openingOf({ owner, period, link }, toSend.length === 0 && returned.length === 0);

  lines.push("", "ของที่ต้องส่งในรอบนี้");
  if (toSend.length === 0) {
    lines.push("ไม่มีรายการค้างส่ง");
  } else {
    toSend.forEach((item) => {
      const late = lateDays(item, period, recordOf(records, item), now);
      const overdue = late > 0 ? ` (เลยกำหนดมาแล้ว ${late} วัน)` : "";
      lines.push(
        `#${item.id} ${item.title} — ภายในวันที่ ${dueDate(item, period).getDate()} ${month}${overdue}`,
      );
    });
  }

  if (returned.length) {
    lines.push("", "ของที่ตีกลับให้แก้ (ส่งใหม่ได้เลย)");
    for (const { item, reason } of returned) lines.push(`- #${item.id} ${item.title}: ${reason}`);
  }

  if (submitted.length) {
    lines.push("", "ของที่ส่งแล้ว รอตรวจ");
    for (const item of submitted) lines.push(`- #${item.id} ${item.title}`);
  }

  if (passed.length) {
    lines.push("", "ของที่รับเข้ารอบแล้ว ไม่ต้องส่งซ้ำ");
    for (const item of passed) lines.push(`- #${item.id} ${item.title}`);
  }

  lines.push(
    "",
    "ดาวน์โหลดแบบฟอร์มได้จากหน้าเดียวกัน กรอกบนแบบฟอร์มของระบบจะผ่านการตรวจเร็วกว่า",
    "เพราะระบบตรวจชื่อคอลัมน์กับช่องเงินให้อัตโนมัติตอนอัปโหลด",
  );

  return lines.join("\n");
}

/**
 * ฉบับย่อ — ใช้เมื่อเนื้อเมลฉบับเต็มยาวจน URL หน้าเขียนเมลของ Gmail เกินเพดาน
 * (ภาษาไทยกิน 9 ตัวอักษรต่อ 1 ตัวเมื่อ encode · ดู `DETAIL_LIMIT` ใน `case-notify.ts`)
 * รายการทั้งหมดอยู่ในหน้าตามลิงก์อยู่แล้ว และปุ่ม “คัดลอกเนื้อหา” ให้ฉบับเต็มแบบไม่ผ่าน URL
 */
export function shortBodyOf(args: Pick<BodyArgs, "owner" | "period" | "link">): string {
  return [
    ...openingOf(args),
    "",
    "รายการที่ต้องส่งพร้อมวันครบกำหนดอยู่ในหน้าตามลิงก์ ดาวน์โหลดแบบฟอร์มได้จากหน้าเดียวกัน",
  ].join("\n");
}

export interface NotifyDraft {
  owner: IntakeOwner;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  /** เนื้อฉบับย่อ สำหรับตอนฉบับเต็มยาวเกินจะส่งผ่าน URL */
  shortBody: string;
  link: string;
  /**
   * ฝ่ายนี้ยังไม่มีรหัสหน่วยงานของ NCAC (`departmentIdOf` เป็น `null`) จึงหาผู้รับไม่ได้ —
   * ร่างยังใช้ได้ ผู้รับว่างให้ HR กรอกเองในหน้าเขียนเมล ไม่ใช่ข้ามฝ่ายนี้ไปเงียบ ๆ
   */
  directoryMissing: boolean;
  /** คนที่เข้าเกณฑ์ผู้รับแต่อีเมลในระบบใช้ไม่ได้ — ให้หน้าจอเตือน ไม่ใช่หายไปเงียบ ๆ */
  skipped: { name: string; position: string; email: string }[];
}

export async function notifyDraft(args: {
  owner: IntakeOwner;
  period: PeriodRef;
  origin: string;
  records: Map<string, IntakeRecord>;
  now: Date;
  users: UserDto[];
}): Promise<NotifyDraft> {
  const { owner, period, origin, records, now, users } = args;
  const link = intakeLink(origin, period, owner);

  const departmentId = departmentIdOf(owner);
  const plan = departmentId ? await resolveRecipients(departmentId, users) : null;

  return {
    owner,
    to: plan?.to.map((r) => r.email) ?? [],
    cc: plan?.cc.map((r) => r.email) ?? [],
    subject: subjectOf(owner, period),
    body: bodyOf({ owner, period, items: itemsByOwner(owner), records, link, now }),
    shortBody: shortBodyOf({ owner, period, link }),
    link,
    directoryMissing: departmentId === null,
    skipped: plan?.skipped ?? [],
  };
}
