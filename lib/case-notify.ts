import { departmentLabel, formatBaht, formatDateTime, statusMeta } from "./case-flow";
import { isSelectableUser, positionLevel, positionLevelLabel } from "./ncac/adapt";
import { listUsers } from "./ncac/client";
import type { UserDto } from "./ncac/types";
import type { HrCase } from "./types";

/**
 * อีเมลแจ้ง “เคสนี้เป็นของหน่วยงานคุณแล้ว” — ตัวเลือกผู้รับ + ร่างเนื้อเมล
 *
 * **ระบบไม่ได้ส่งเมลเอง** — หน้าจอเปิดหน้าเขียนเมลของ Gmail ให้ผู้ใช้พร้อมกรอก
 * ผู้รับ/หัวเรื่อง/เนื้อความไว้ครบแล้ว ผู้ใช้เป็นคนกดส่งจากบัญชีของตัวเอง
 * (เลือกทางนี้ตามที่เจ้าของงานสั่ง 8 ก.ย. 2026: ไม่ต้องมีบัญชี Gmail กลาง ไม่ต้อง
 * เก็บรหัสผ่าน/โทเคนของใครไว้ในระบบ และเมลที่ออกไปมีชื่อคนส่งจริงเสมอ)
 *
 * ผลพลอยได้ที่ต้องรู้: หน้าเขียนเมลของ Gmail รับเนื้อความเป็น **ข้อความล้วน**
 * เท่านั้น — เทมเพลตที่นี่จึงจัดหน้าด้วยการเว้นบรรทัด ไม่ใช่ HTML
 *
 * **ฝั่งเซิร์ฟเวอร์เท่านั้น** (`listUsers()` อ่าน env ฝั่งเซิร์ฟเวอร์) — หน้าจอเรียก
 * ผ่าน `GET /api/cases/{trackingNo}/notify` แทน
 *
 * กฎผู้รับมีข้อเดียวและอยู่ที่นี่ที่เดียว:
 * - **TO = หัวหน้า** — Supervisor / Assistant Manager ของหน่วยงานที่ถือเคส
 * - **CC = ผู้จัดการ** — Manager ขึ้นไปของหน่วยงานเดียวกัน
 *
 * หน่วยงานไหนไม่มีหัวหน้าที่ยัง active เลย จะเลื่อนผู้จัดการขึ้นมาเป็น TO แทน
 * (ไม่ใช่ส่งไม่ออก) — เคสต้องถึงมือคนใดคนหนึ่งเสมอ
 */

/* ---------------------------------------------------------------- ผู้รับ */

/**
 * `UserDto.department_id` ของ NCAC **ตรงกับ `DepartmentId` ของฝั่งคำร้องทั้ง 8 ค่า**
 * (ยืนยันกับ payload จริงของ `GET /users` เมื่อ 8 ก.ย. 2026: 3 ยานยนต์ · 11 Operation
 * Support · 15 จัดส่งลาดกระบัง · 19 จัดส่งสระบุรี · 20 จัดส่งบางปะกง · 8 Safety
 * Standards · 17 Safety Standards [Compliance] · 24 HR [พัฒนาบุคลากรและองค์กร])
 *
 * จับคู่ด้วยรหัสไม่ใช่ชื่อหน่วยงาน เพราะชื่อฝั่ง `/users` เป็นคนละชุดกับป้ายใน
 * `DEPARTMENTS` และเปลี่ยนได้ตลอดโดยไม่บอกใคร
 */
const inDepartment = (u: UserDto, departmentId: string): boolean =>
  u.department_id !== null &&
  u.department_id !== undefined &&
  String(u.department_id) === departmentId;

/** ระดับต่ำสุดที่ถือว่าเป็น “ผู้จัดการ” — ตรงกับ `POSITION_LEVEL` ใน `ncac/adapt.ts` */
const MANAGER_MIN_LEVEL = 5;
/** ระดับต่ำสุดที่ถือว่าเป็น “หัวหน้า” (Supervisor) */
const HEAD_MIN_LEVEL = 3;

/**
 * อีเมลในสมุดรายชื่อมีทั้งที่มีเว้นวรรคเกิน (`"a.b @menatransport.co.th"`) และที่
 * พิมพ์โดเมนผิด (`.coo.th`) — ตัดช่องว่างให้ก่อน แล้วคัดตัวที่ยังผิดรูปทิ้ง
 * ไม่ใช่ปล่อยให้ไปโผล่ในช่องผู้รับของ Gmail แล้วผู้ใช้กดส่งไม่ออกโดยไม่รู้สาเหตุ
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (raw: string | null | undefined): string | null => {
  const value = (raw ?? "").replace(/\s+/g, "").toLowerCase();
  return EMAIL_RE.test(value) ? value : null;
};

export interface Recipient {
  employeeId: string;
  name: string;
  position: string;
  levelLabel: string;
  email: string;
}

export interface RecipientPlan {
  departmentId: string;
  departmentLabel: string;
  /** หัวหน้าของหน่วยงาน — ช่อง TO */
  to: Recipient[];
  /** ผู้จัดการของหน่วยงาน — ช่อง CC */
  cc: Recipient[];
  /**
   * คนที่เข้าเกณฑ์แต่ **อีเมลในระบบใช้ไม่ได้** — ส่งกลับไปให้หน้าจอเตือน
   * ไม่ใช่หายไปเงียบ ๆ จนไม่มีใครรู้ว่าหัวหน้าคนนั้นไม่ได้รับเมล
   */
  skipped: { name: string; position: string; email: string }[];
}

const toRecipient = (u: UserDto, email: string): Recipient => ({
  employeeId: String(u.employee_id),
  name: `${u.firstname} ${u.lastname}`.trim() || String(u.employee_id),
  position: u.position?.trim() || "—",
  levelLabel: positionLevelLabel(u.position_level),
  email,
});

const byRank = (a: UserDto, b: UserDto) =>
  positionLevel(b.position_level) - positionLevel(a.position_level) ||
  `${a.firstname}`.localeCompare(`${b.firstname}`, "th");

/**
 * รายชื่อผู้รับของหน่วยงานหนึ่ง — อ่านสมุดรายชื่อจาก NCAC สด ๆ ทุกครั้ง
 * (คนย้ายแผนก/ลาออกแล้วต้องไม่โผล่ในช่องผู้รับรอบถัดไป)
 */
export async function resolveRecipients(
  departmentId: string,
  /** ส่งสมุดรายชื่อที่ดึงมาแล้วเข้ามาได้ — route ใช้ชุดเดียวกันหาอีเมลผู้ส่งด้วย */
  directory?: UserDto[],
): Promise<RecipientPlan> {
  const users = directory ?? (await listUsers());
  const members = users
    .filter(isSelectableUser)
    .filter((u) => inDepartment(u, departmentId))
    .sort(byRank);

  const skipped: RecipientPlan["skipped"] = [];
  const pick = (min: number, max: number): Recipient[] => {
    const out: Recipient[] = [];
    for (const u of members) {
      const level = positionLevel(u.position_level);
      if (level < min || level > max) continue;

      const email = normalizeEmail(u.email);
      if (!email) {
        skipped.push({
          name: `${u.firstname} ${u.lastname}`.trim(),
          position: u.position?.trim() || "—",
          email: u.email?.trim() || "(ไม่มีอีเมลในระบบ)",
        });
        continue;
      }
      out.push(toRecipient(u, email));
    }
    return out;
  };

  const heads = pick(HEAD_MIN_LEVEL, MANAGER_MIN_LEVEL - 1);
  const managers = pick(MANAGER_MIN_LEVEL, Number.MAX_SAFE_INTEGER);

  /* ไม่มีหัวหน้าที่ยังทำงานอยู่ → ผู้จัดการรับเรื่องแทน (ไม่ใช่ส่งไม่ออก) */
  const to = heads.length ? heads : managers;
  const cc = heads.length ? managers : [];

  return {
    departmentId,
    departmentLabel: departmentLabel(departmentId),
    to,
    cc,
    skipped,
  };
}

/* ---------------------------------------------------------------- ร่างเนื้อเมล */

/**
 * ลิงก์กลับมาที่เคส — `origin` มาจาก **คำขอที่ยิงเข้ามา** ไม่ใช่ env
 *
 * ตั้งใจไม่ใช้ `APP_URL` เพราะค่านั้นเป็นตัวกำหนด redirect URI ของ Google OAuth อยู่แล้ว
 * (ดู `callbackUrl()` ใน `lib/auth/google.ts`) — ตั้งผิดทีเดียวคนทั้งบริษัทล็อกอินไม่ได้
 * ลิงก์ในเมลไม่คุ้มที่จะไปแขวนกับค่าที่มีน้ำหนักขนาดนั้น
 */
function caseUrl(origin: string | null, trackingNo: string): string | null {
  if (!origin) return null;
  return `${origin.replace(/\/+$/, "")}/desk/cases/${encodeURIComponent(trackingNo)}`;
}

const dash = (value: string | null | undefined): string =>
  value?.trim() ? value.trim() : "—";

/**
 * ตัดรายละเอียดที่ยาวมากลง — เนื้อความทั้งฉบับต้องไปอยู่ใน **query string ของ URL**
 * หน้าเขียนเมล Gmail และภาษาไทยกินที่ 9 ตัวอักษรต่อ 1 ตัวเมื่อ encode
 * (`ก` → `%E0%B8%81`) ปล่อยยาวกว่านี้ URL จะทะลุเพดานของเบราว์เซอร์/เซิร์ฟเวอร์
 *
 * ไม่ใช่การตัดข้อมูลทิ้ง — ผู้อ่านกดลิงก์ท้ายเมลไปอ่านฉบับเต็มในระบบได้ และปุ่ม
 * “คัดลอกเนื้อหา” บนหน้าจอก็ให้ข้อความชุดเดียวกันแบบไม่ผ่าน URL
 */
const DETAIL_LIMIT = 300;

const clamp = (value: string): string =>
  value.length > DETAIL_LIMIT
    ? `${value.slice(0, DETAIL_LIMIT).trimEnd()}…\n(รายละเอียดเต็มดูได้ในระบบ)`
    : value;

export function subjectOf(hrCase: HrCase): string {
  return `[HR Service] มอบหมายคำร้อง ${hrCase.trackingNo} — ${hrCase.subject}`;
}

/**
 * เนื้อเมลข้อความล้วน แยกเป็นสองท่อน — **ไม่มีลายเซ็นผู้ส่งต่อท้าย** เพราะเมลออกจาก
 * บัญชีของผู้ใช้เอง Gmail จะเติมลายเซ็นของเจ้าตัวให้ตอนเปิดหน้าเขียน
 *
 * ที่ต้องแยกท่อน เพราะ “ข้อความเพิ่มเติม” ที่ผู้ส่งพิมพ์ต้องไปแทรกอยู่ **ตรงกลาง**
 * (คนอ่านต้องเจอสิ่งที่ผู้ส่งอยากบอก ก่อนตารางรายละเอียดที่ระบบสร้างให้) แต่ข้อความ
 * นั้นพิมพ์อยู่บนหน้าจอและเปลี่ยนทุกตัวอักษร — ให้เซิร์ฟเวอร์ประกอบไม่ได้
 * หน้าจอจึงต่อ `intro` + ข้อความ + `details` เอง (ดู `composeBody` ใน `notify-modal.tsx`)
 */
export interface BodyDraft {
  intro: string;
  details: string;
}

export function bodyOf(hrCase: HrCase, origin: string | null = null): BodyDraft {
  const url = caseUrl(origin, hrCase.trackingNo);
  const dept = departmentLabel(hrCase.departmentId);

  const intro = [
    `เรียน หัวหน้า/ผู้จัดการ ${dept}`,
    "",
    "คำร้องต่อไปนี้ถูกมอบหมายให้หน่วยงานของท่านเป็นผู้รับผิดชอบ",
    "กรุณาเข้าระบบเพื่อระบุสาเหตุ แนวทางแก้ไข และผลการดำเนินการ",
  ].join("\n");

  const lines = [
    "-----------------------------------------",
    `เลขติดตาม           : ${hrCase.trackingNo}`,
    `เรื่อง                : ${hrCase.subject}`,
    `ผู้แจ้ง (พจส.)        : ${hrCase.driverName}${hrCase.driverMeta ? ` · ${hrCase.driverMeta}` : ""}`,
    `หน่วยงานที่รับผิดชอบ : ${dept}`,
    `ประเภทเรื่อง          : ${dash(hrCase.complaintType)}`,
    `สถานะปัจจุบัน        : ${statusMeta[hrCase.status].label}`,
    `ความเสียหาย          : ${hrCase.damageCost === null ? "—" : formatBaht(hrCase.damageCost)}`,
    `แจ้งเมื่อ              : ${formatDateTime(hrCase.createdAt)}`,
    "-----------------------------------------",
    "",
    "รายละเอียดที่ผู้แจ้งระบุ",
    clamp(dash(hrCase.detail)),
  ];

  if (url) lines.push("", `เปิดคำร้องในระบบ: ${url}`);

  return { intro, details: lines.join("\n") };
}
