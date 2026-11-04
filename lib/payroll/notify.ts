import { resolveRecipients } from "../case-notify";
import type { SavedRecipients } from "./notify-recipients";
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

/**
 * `ฝ่ายจัดส่ง ลาดกระบัง` · `ฝ่าย HR C&B` — คำนำหน้าชื่อฝ่ายสำหรับเอาไปแทรกในประโยค
 *
 * ชื่อฝ่ายที่เป็นอักษรโรมันต้องมีเว้นวรรคคั่น (`ฝ่ายHR C&B` อ่านสะดุด) ส่วนชื่อไทย
 * เขียนติดกันตามปกติของภาษา · ไม่เติม `ฝ่าย` ให้ชื่อที่ขึ้นต้นด้วยคำนั้นอยู่แล้ว
 */
export function ownerPhrase(owner: IntakeOwner): string {
  if (owner.startsWith("ฝ่าย")) return owner;
  return /^[\u0E00-\u0E7F]/.test(owner) ? `ฝ่าย${owner}` : `ฝ่าย ${owner}`;
}

/**
 * หัวเรื่อง — **มีวันครบกำหนดอยู่ในหัวเรื่อง** เพราะคนส่วนใหญ่ตัดสินว่าจะเปิดเมลไหน
 * ก่อนจากหัวเรื่องในรายการ ไม่ได้เปิดอ่านทุกฉบับ · รอบที่ส่งครบแล้วไม่มีกำหนดจะทวง
 * จึงบอกไปตรง ๆ ว่าครบแล้ว ไม่ต้องให้คนเปิดเข้าไปดูเองว่ามีอะไรค้างหรือไม่
 *
 * ขึ้นต้นด้วย `[เงินเดือน <รอบ>]` ให้ค้นและตั้งตัวกรองใน Gmail ได้ด้วยรอบ
 */
export function subjectOf(owner: IntakeOwner, period: PeriodRef, due?: Deadline): string {
  const head = `[เงินเดือน ${periodLabel(period)}] `;
  if (!due || due.count === 0) return `${head}${ownerPhrase(owner)} ส่งข้อมูลครบแล้ว`;
  if (due.overdue > 0) {
    return `${head}ขอข้อมูลจาก${ownerPhrase(owner)} — เลยกำหนดแล้ว ${due.overdue} รายการ`;
  }
  return `${head}ขอข้อมูลจาก${ownerPhrase(owner)} — ภายใน ${due.firstDueText}`;
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

/**
 * สิ่งที่คนอ่านอยากรู้ก่อนอย่างอื่น: ค้างกี่รายการ ชิ้นแรกครบกำหนดเมื่อไหร่ เลยกำหนดไปแล้วกี่ชิ้น
 * — ใช้ทั้งในหัวเรื่อง ย่อหน้าเปิด และฉบับย่อ จึงคิดที่เดียวแล้วส่งต่อ ไม่คิดซ้ำสามที่
 */
export interface Deadline {
  count: number;
  overdue: number;
  /** `3 ก.ย.` — วันครบกำหนดของชิ้นที่ใกล้ที่สุด · ไม่มีของค้างจะเป็นค่าว่าง */
  firstDueText: string;
}

function deadlineOf(args: Omit<BodyArgs, "link">): Deadline {
  const { period, items, records, now } = args;
  const month = TH_MONTHS[period.month];
  const pending = items.filter((item) => {
    const stage = recordOf(records, item).stage;
    return stage !== "passed" && stage !== "submitted";
  });

  const overdue = pending.filter(
    (item) => lateDays(item, period, recordOf(records, item), now) > 0,
  ).length;
  const firstDue = pending.reduce<number | null>(
    (soonest, item) => (soonest === null || item.dueDay < soonest ? item.dueDay : soonest),
    null,
  );

  return {
    count: pending.length,
    overdue,
    firstDueText: firstDue === null ? "" : `${firstDue} ${month}`,
  };
}

/**
 * ย่อหน้าเปิด — **ใช้ชุดเดียวกันทั้งฉบับเต็มและฉบับย่อ** เพื่อให้คนที่ได้ฉบับย่อ
 * (เพราะ URL ยาวเกิน) ยังได้ข้อมูลที่ตัดสินใจได้ครบ: ค้างกี่ชิ้น ครบกำหนดเมื่อไหร่ ลิงก์อยู่ไหน
 *
 * **ไม่ลงท้าย ครับ/ค่ะ** เพราะเมลออกจากบัญชีของคนส่งซึ่งเป็นใครก็ได้ ระบบไม่รู้ว่า
 * จะต้องใช้คำลงท้ายไหน — เดาผิดอ่านแล้วสะดุดกว่าไม่มีเลย · คนส่งเติมเองได้ในหน้าเขียนเมล
 */
function openingOf(
  { owner, period, link }: Pick<BodyArgs, "owner" | "period" | "link">,
  due: Deadline,
): string[] {
  const lines = [`เรียน ผู้รับผิดชอบข้อมูลเงินเดือน — ${owner}`, ""];

  if (due.count === 0) {
    lines.push(
      `รอบ ${periodLabel(period)} ของ${ownerPhrase(owner)} ส่งเข้าระบบครบแล้ว ไม่มีรายการค้าง ขอบคุณที่ส่งให้ทันรอบ`,
      "",
      "ดูสถานะของแต่ละรายการได้ที่ลิงก์นี้",
      link,
    );
    return lines;
  }

  const overdueNote =
    due.overdue > 0 ? ` และมี ${due.overdue} รายการที่เลยกำหนดมาแล้ว` : "";
  lines.push(
    `เปิดรอบเงินเดือน ${periodLabel(period)} แล้ว รอบนี้${ownerPhrase(owner)} มี ${due.count} รายการที่ต้องส่ง` +
      ` ชิ้นที่ใกล้ที่สุดครบกำหนดวันที่ ${due.firstDueText}${overdueNote}`,
    "",
    "ส่งข้อมูลได้ที่ลิงก์นี้ — ต้องเข้าสู่ระบบด้วยอีเมลบริษัทก่อน เข้าไปแล้วจะเห็นเฉพาะรายการของฝ่ายตัวเอง",
    link,
  );
  return lines;
}

/**
 * ท่อน "ส่งแล้วเกิดอะไรขึ้นต่อ" — คำถามแรกที่ฝ่ายถามกลับมาเสมอคือส่งแล้วจบหรือยัง
 * บอกไว้ในเมลตั้งแต่ต้นจะได้ไม่ต้องตอบรายคน · ฉบับย่อใช้บรรทัดเดียวจากชุดนี้
 */
const NEXT_STEPS = [
  "ส่งแล้วเกิดอะไรขึ้นต่อ",
  "ระบบตรวจชื่อคอลัมน์กับช่องเงินให้ทันทีที่อัปโหลด ไม่ตรงตรงไหนจะขึ้นให้เห็นบนหน้าจอเลย",
  "แก้แล้วอัปโหลดใหม่ได้ ไม่ต้องแจ้งใคร เมื่อผ่านด่านนี้ HR จะตรวจอีกชั้นก่อนรับเข้ารอบ",
  "ถ้ายังต้องแก้ จะตีกลับมาพร้อมเหตุผลให้เห็นในหน้าเดียวกัน",
];

const CLOSING = [
  "แบบฟอร์มดาวน์โหลดได้จากหน้าเดียวกัน กรอกบนแบบฟอร์มของระบบจะผ่านการตรวจเร็วกว่า เพราะเป็นผังคอลัมน์ที่ระบบตรวจตรง ๆ",
  "ถ้าช่องไหนไม่ชัดเจน หรือรอบนี้มีเคสพิเศษที่ฟอร์มไม่รองรับ ตอบเมลนี้มาได้เลย",
];

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

  const due = deadlineOf({ owner, period, items, records, now });
  const lines = openingOf({ owner, period, link }, due);

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

  /* ส่งครบแล้วไม่ต้องอธิบายขั้นตอนการส่ง — ย่อหน้าเปิดบอกไปแล้วว่าไม่มีอะไรค้าง */
  if (due.count > 0) lines.push("", ...NEXT_STEPS);
  lines.push("", ...CLOSING);

  return lines.join("\n");
}

/**
 * ฉบับย่อ — ใช้เมื่อเนื้อเมลฉบับเต็มยาวจน URL หน้าเขียนเมลของ Gmail เกินเพดาน
 * (ภาษาไทยกิน 9 ตัวอักษรต่อ 1 ตัวเมื่อ encode · ดู `DETAIL_LIMIT` ใน `case-notify.ts`)
 *
 * **ย่อแต่ยังตัดสินใจได้** — ค้างกี่ชิ้น ชิ้นแรกครบกำหนดเมื่อไหร่ เลยกำหนดกี่ชิ้น อยู่ในย่อหน้า
 * เปิดเหมือนฉบับเต็ม ที่หายไปคือรายการรายชิ้นซึ่งอยู่ในหน้าตามลิงก์อยู่แล้ว · ปุ่ม
 * "คัดลอกเนื้อหา" ให้ฉบับเต็มแบบไม่ผ่าน URL
 */
export function shortBodyOf(args: Omit<BodyArgs, "link"> & { link: string }): string {
  const due = deadlineOf(args);
  const lines = openingOf(args, due);

  if (due.count > 0) {
    lines.push(
      "",
      "รายการที่ต้องส่งพร้อมวันครบกำหนดของแต่ละชิ้น อยู่ในหน้าตามลิงก์ ดาวน์โหลดแบบฟอร์มได้จากหน้าเดียวกัน",
      "",
      "ระบบตรวจชื่อคอลัมน์กับช่องเงินให้ทันทีที่อัปโหลด แก้แล้วอัปโหลดใหม่ได้ ผ่านแล้ว HR จะตรวจอีกชั้นก่อนรับเข้ารอบ",
    );
  }
  lines.push("", CLOSING[1]);
  return lines.join("\n");
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
  /**
   * ผู้รับชุดนี้มาจากที่ HR บันทึกไว้ ไม่ใช่จากสมุดรายชื่อ — หน้าจอต้องบอกให้เห็น
   * ว่ากำลังใช้ของที่ใครบันทึกไว้เมื่อไหร่ ไม่งั้นเมลที่ส่งผิดคนจะหาสาเหตุไม่เจอ
   */
  savedBy?: string;
  savedAt?: string;
}

export async function notifyDraft(args: {
  owner: IntakeOwner;
  period: PeriodRef;
  origin: string;
  records: Map<string, IntakeRecord>;
  now: Date;
  users: UserDto[];
  /** ผู้รับที่ HR บันทึกไว้ของฝ่ายนี้ — มีแล้วใช้ทับสมุดรายชื่อ */
  saved?: SavedRecipients;
}): Promise<NotifyDraft> {
  const { owner, period, origin, records, now, users, saved } = args;
  const link = intakeLink(origin, period, owner);

  const departmentId = departmentIdOf(owner);
  const plan = departmentId ? await resolveRecipients(departmentId, users) : null;
  const items = itemsByOwner(owner);

  /* ค่าที่บันทึกไว้ทับสมุดรายชื่อ — เหตุผลอยู่ที่หัว `notify-recipients.ts` */
  return {
    owner,
    to: saved ? saved.to : (plan?.to.map((r) => r.email) ?? []),
    cc: saved ? saved.cc : (plan?.cc.map((r) => r.email) ?? []),
    subject: subjectOf(owner, period, deadlineOf({ owner, period, items, records, now })),
    body: bodyOf({ owner, period, items, records, link, now }),
    shortBody: shortBodyOf({ owner, period, items, records, link, now }),
    link,
    directoryMissing: departmentId === null,
    /* ใช้ผู้รับที่บันทึกไว้แล้ว การเตือนว่าสมุดรายชื่อมีอีเมลเสียก็ไม่ใช่เรื่องของร่างนี้อีก */
    skipped: saved ? [] : (plan?.skipped ?? []),
    savedBy: saved?.updatedBy,
    savedAt: saved?.updatedAt,
  };
}
