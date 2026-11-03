/**
 * UAT ชั่วคราว — ทดสอบระบบทะเบียนประวัติ พจส. ฝั่งลาดกระบัง ตั้งแต่ผู้สมัครจนรับรถ (2 พ.ย. 2569)
 *
 * ฝ่ายที่เกี่ยวข้องไล่ตามเส้นทางจริงของหน้า “ติดตามพนักงานใหม่” — ลำดับจริงอยู่ที่ `phase` + `needs` ของแต่ละข้อ
 * (KA ขอ RQ → MASS ผูก RQ เริ่มฝึก → KA/ST/HRD ระหว่างฝึก → ST ก่อนรับรถ → KA รับรถ)
 * — ยานยนต์กับทะเบียนตัดออกตามที่ Bew สั่ง (2 พ.ย. 2569) · `divisionId` = รหัสฝ่ายใน NCAC `/divisions/` ใช้เรียงคนของฝ่ายนั้นขึ้นก่อนตอนเพิ่มผู้ทดสอบ
 * (ผู้ทดสอบเป็นใครก็ได้ ไม่บังคับว่าต้องอยู่ฝ่ายนั้น)
 *
 * รายการทดสอบนิยามที่นี่ที่เดียว — ทั้งหน้า “จัดการ UAT” และแผงมุมขวาล่างอ่านชุดนี้ · ไฟล์นี้ client ใช้ได้
 * · ฝั่งเซิร์ฟเวอร์อยู่ที่ `lib/uat-store.ts`
 */

export type UatTeamId = "mass" | "ka" | "st" | "hrd";
export type UatStatus = "pass" | "fail";

export interface UatCase {
  id: string;
  title: string;
  /** ขั้นในเส้นทาง (`UAT_PHASES`) — ข้อในขั้นเดียวกันทำพร้อมกันได้ */
  phase: number;
  /** ทำอย่างไร — ขึ้นใต้ชื่อข้อทั้งในหน้า “จัดการ UAT” และแผงมุมขวาล่าง */
  how: string;
  /** ผลที่ต้องเห็นถึงจะติ๊กผ่าน */
  check: string;
  /** ข้อที่ต้องมีคนติ๊กผ่านก่อน (ข้ามฝ่ายได้) — ยังไม่ผ่าน = ข้อนี้ติ๊กผ่านไม่ได้ ขึ้น “รอ …” */
  needs?: string[];
  /** หน้าที่ใช้ทดสอบข้อนี้ — แผงมุมขวาล่างมีลูกศรพาไป */
  href?: string;
}

export interface UatTeam {
  id: UatTeamId;
  /** ป้ายสั้นบนชิป / แถบขั้น */
  short: string;
  label: string;
  divisionId: number;
  cases: UatCase[];
}

const CANDIDATES = "/recruitment/admin/candidates";
const ONBOARDING = "/recruitment/admin/onboarding";
const TRAINING = `${ONBOARDING}?tab=training`;

export const UAT_SCOPE = "ทะเบียนประวัติ พจส. · ลาดกระบัง";

/**
 * รหัส พจส. ทดสอบ — ผู้สมัคร UAT ไม่มีรหัสจาก ATMS จึงไม่เข้าทะเบียนเอง · รับรถ “ผ่าน” แล้วระบบออกรหัส
 * `UAT` + ตัวเลขของเลขใบสมัคร (DRV2611-0018 → UAT26110018) ให้ แล้วรับเข้าทะเบียนเหมือนคนจริง
 * · ATMS ไม่มีรหัสขึ้นต้นตัวอักษร จึงชนของจริงไม่ได้ · ปุ่มล้างข้อมูล UAT ลบตามคำนำหน้านี้
 */
export const UAT_CODE_PREFIX = "UAT";
export const isUatDriverCode = (code: string): boolean => code.trim().toUpperCase().startsWith(UAT_CODE_PREFIX);
export const uatDriverCode = (applicationRef: string): string =>
  `${UAT_CODE_PREFIX}${applicationRef.replace(/\D/g, "")}`;

/** ลำดับขั้นของเส้นทางพนักงานใหม่ — ขั้นถัดไปเริ่มได้เมื่อข้อที่ต้องรอ (`needs`) ผ่านแล้ว */
export const UAT_PHASES: { no: number; title: string }[] = [
  { no: 1, title: "เตรียมข้อมูล" },
  { no: 2, title: "เริ่มฝึกงาน" },
  { no: 3, title: "ระหว่างฝึก" },
  { no: 4, title: "ติดตามกลางฝึก" },
  { no: 5, title: "ประเมินก่อนรับรถ" },
  { no: 6, title: "รับรถ" },
  { no: 7, title: "ทะเบียนประวัติ" },
];

/** กติกาก่อนเริ่ม — ทดสอบบนฐานจริง จึงต้องทำให้ล้างข้อมูลทดสอบออกได้ครบ */
export const UAT_RULES: string[] = [
  "ใช้ผู้สมัครที่ชื่อขึ้นต้น “UAT-” เท่านั้น — ผู้จัดการ UAT กด “สุ่มผู้สมัครทดสอบ” บนหน้านี้ให้",
  "KA ขออัตราโดยพิมพ์หมายเหตุขึ้นต้นว่า “UAT” — ปุ่มล้างข้อมูลใช้คำนี้แยกคำขอทดสอบออกจากของจริง",
  "วันเริ่มฝึกในฟอร์ม RC ใส่วันนี้หรือก่อนหน้า — วันในอนาคตยังไม่ขึ้นแท็บฝึกงาน ฝ่ายถัดไปทดสอบไม่ได้",
  "ทำไม่ได้หรือผลไม่ตรง ให้กด ! แจ้งปัญหาพร้อมหมายเหตุ อย่าติ๊กผ่าน",
];

export const UAT_TEAMS: UatTeam[] = [
  {
    id: "mass",
    short: "MASS",
    label: "ฝ่ายสรรหาพนักงานจัดส่ง",
    divisionId: 30,
    cases: [
      {
        id: "mass-interview",
        title: "รับเรื่อง · นัดสัมภาษณ์",
        phase: 1,
        how: "หน้าผู้สมัคร → เปิดใบที่ชื่อขึ้นต้น UAT- → เปลี่ยนสถานะเป็น “นัดสัมภาษณ์” และใส่วันนัด",
        check: "สถานะกับวันนัดบันทึกถูก · ค้นใบด้วยเลข DRV เจอ",
        href: CANDIDATES,
      },
      {
        id: "mass-rc",
        title: "เปลี่ยนเป็นฝึกงาน · ฟอร์ม RC ผูก RQ",
        phase: 2,
        how: "เลือกสถานะ “ฝึกงาน” → ฟอร์ม RC เลือก RQ ที่ KA ขอไว้ (หมายเหตุ UAT) + วันเริ่มฝึก = วันนี้",
        check: "ใบสมัครมีลิงก์ RQ ↗ · คำขอนั้นขึ้นแท็บฝึกงานพร้อมชื่อผู้สมัคร",
        needs: ["ka-rq", "mass-interview"],
        href: CANDIDATES,
      },
      {
        id: "mass-daily",
        title: "ลงตารางรายวันช่วงฝึกงาน",
        phase: 3,
        how: "หน้าผู้สมัคร → กรองฝึกงาน → “แสดงตารางรายวัน” · ผู้สมัคร UAT ยังไม่มีรหัส พจส.",
        check: "แถวขึ้น “ยังไม่มีรหัส · ลงตารางไม่ได้” และกดไปหน้าเส้นทางได้ · ปุ่มคัดลอก RC Alert ใช้ได้",
        needs: ["mass-rc"],
        href: CANDIDATES,
      },
    ],
  },
  {
    id: "ka",
    short: "KA",
    label: "ฝ่ายจัดส่งลาดกระบัง",
    divisionId: 22,
    cases: [
      {
        id: "ka-rq",
        title: "ขออัตราสรรหา (RQ)",
        phase: 1,
        how: "ติดตามพนักงานใหม่ → แท็บอัตราว่าง → “ขออัตรา” · หมายเหตุพิมพ์ขึ้นต้นว่า UAT",
        check: "ได้เลข RQ ใหม่ในแท็บอัตราว่าง สถานะเปิดรับ — MASS เลือก RQ นี้ในฟอร์ม RC ได้",
        href: `${ONBOARDING}?tab=open`,
      },
      {
        id: "ka-trainer",
        title: "ฟอร์ม KA · ครูฝึก · รถ · Co-Driver",
        phase: 3,
        how: "แท็บฝึกงาน → เปิดรายคน → ส่วน KA เลือกครูฝึก รถ Zone · ถ้า Co-Driver = อบรม ให้กรอกวันและผล",
        check: "ขั้น KA บนแถบเส้นทางเป็น “เสร็จ” เมื่อมีทั้งครูฝึกและรถ",
        needs: ["mass-rc"],
        href: TRAINING,
      },
      {
        id: "ka-handover",
        title: "บันทึกรับรถ",
        phase: 6,
        how: "เปิดรายคน → ส่วนรับรถ ใส่วันรับรถจริง (วันนี้หรือก่อนหน้า) + ผลรับรถ “ผ่าน”",
        check: "แถวย้ายไปแท็บรับรถแล้ว · ใบสมัครเป็น “ปฏิบัติงาน” · ได้รหัสทดสอบ UATxxxx และขึ้นในทะเบียนประวัติ",
        needs: ["ka-trainer", "st-day8", "hrd-orientation"],
        href: TRAINING,
      },
    ],
  },
  {
    id: "st",
    short: "ST",
    label: "ฝ่ายจัดการมาตรฐานและอบรมความปลอดภัย",
    divisionId: 18,
    cases: [
      {
        id: "st-day1",
        title: "ตรวจวันแรก · Alc./สาร",
        phase: 3,
        how: "แท็บฝึกงาน → เปิดรายคน → ส่วน ST เลือก ST ที่ดูแล + ผลตรวจวันแรก",
        check: "บันทึกแล้วช่อง “ติดตามกลางฝึก” โผล่ขึ้นมา",
        needs: ["mass-rc"],
        href: TRAINING,
      },
      {
        id: "st-day4",
        title: "ติดตามกลางฝึก",
        phase: 4,
        how: "ส่วน ST → ผลติดตามกลางฝึก (ปกติราววันที่ 4) + ข้อเสนอแนะ",
        check: "บันทึกแล้วช่อง “ประเมินก่อนรับรถ” โผล่ขึ้นมา",
        needs: ["st-day1"],
        href: TRAINING,
      },
      {
        id: "st-day8",
        title: "ประเมินก่อนรับรถ",
        phase: 5,
        how: "ส่วน ST → ผลประเมินก่อนรับรถ (ปกติราววันที่ 8)",
        check: "ขั้น ST บนแถบเส้นทางเป็น “เสร็จ”",
        needs: ["st-day4"],
        href: TRAINING,
      },
    ],
  },
  {
    id: "hrd",
    short: "HRD",
    label: "ฝ่ายพัฒนาบุคลากรและองค์กร",
    divisionId: 34,
    cases: [
      {
        id: "hrd-orientation",
        title: "บันทึกปฐมนิเทศ · คะแนนสอบ",
        phase: 3,
        how: "แท็บฝึกงาน → เปิดรายคน → ส่วน HRD ใส่วันปฐมนิเทศ + คะแนนสอบ",
        check: "ขั้น HRD บนแถบเส้นทางเป็น “เสร็จ”",
        needs: ["mass-rc"],
        href: TRAINING,
      },
      {
        id: "hrd-resign",
        title: "ปรับเป็นพ้นสภาพในทะเบียน",
        phase: 7,
        how: "ทะเบียนประวัติ → ค้น “UAT-” → ช่องสถานะกด “ปฏิบัติงาน ▾” → พ้นสภาพ… กรอกวันที่ ประเภท เหตุผล แล้วบันทึก",
        check: "กรอกฟอร์มได้โดยไม่เด้งเข้าหน้าประวัติ · แถวเป็นพ้นสภาพ (แดง) · อยู่ในแท็บพ้นสภาพ",
        needs: ["ka-handover"],
        href: "/recruitment/admin/drivers",
      },
    ],
  },
];

export const uatTeam = (id: string): UatTeam | undefined => UAT_TEAMS.find((t) => t.id === id);

export const uatCase = (id: string): { team: UatTeam; item: UatCase } | undefined => {
  for (const team of UAT_TEAMS) {
    const item = team.cases.find((c) => c.id === id);
    if (item) return { team, item };
  }
  return undefined;
};

/** ทุกข้อเรียงตามขั้น (ขั้นเดียวกันเรียงตามลำดับฝ่าย) */
export const UAT_FLOW: { team: UatTeam; item: UatCase }[] = UAT_TEAMS.flatMap((team) =>
  team.cases.map((item) => ({ team, item })),
).sort((a, b) => a.item.phase - b.item.phase);

/** ข้อที่ต้องรอแต่ยังไม่มีใครติ๊กผ่าน — ว่าง = เริ่มข้อนี้ได้ · `passed` = caseId ที่มีคนติ๊กผ่านแล้ว */
export function waitingFor(item: UatCase, passed: ReadonlySet<string>): { team: UatTeam; item: UatCase }[] {
  return (item.needs ?? [])
    .filter((id) => !passed.has(id))
    .map((id) => uatCase(id))
    .filter((x) => x !== undefined);
}

/**
 * ข้อนี้ค้างอยู่ที่ใคร — `done` ผ่านแล้ว · `issue` มีคนแจ้งปัญหา (ค้างที่ฝ่ายนั้นแก้/ทดสอบซ้ำ)
 * · `blocked` รอข้อก่อนหน้า (`waiting`) · `ready` ถึงคิวฝ่ายของข้อนี้ทดสอบ
 */
export type UatTurn =
  | { kind: "done" | "issue" | "ready" }
  | { kind: "blocked"; waiting: { team: UatTeam; item: UatCase }[] };

export function caseTurn(item: UatCase, results: UatResult[], passed: ReadonlySet<string>): UatTurn {
  const state = caseState(results, item.id);
  if (state === "fail") return { kind: "issue" };
  if (state === "pass") return { kind: "done" };
  const waiting = waitingFor(item, passed);
  return waiting.length ? { kind: "blocked", waiting } : { kind: "ready" };
}

export const passedCases = (results: UatResult[]): Set<string> =>
  new Set(results.filter((r) => r.status === "pass").map((r) => r.caseId));

export interface UatTester {
  employeeId: string;
  name: string;
  position: string;
  imageUrl: string | null;
}

export interface UatResult {
  caseId: string;
  employeeId: string;
  status: UatStatus;
  note: string;
  at: string;
}

/** UAT ของผู้ใช้ที่ล็อกอินอยู่ — ฝ่ายที่เป็นผู้ทดสอบ + ผลของตัวเอง (แผงมุมขวาล่าง) */
export interface MyUat {
  teams: UatTeamId[];
  results: UatResult[];
  /** ข้อที่มีคน (ฝ่ายไหนก็ได้) ติ๊กผ่านแล้ว — ใช้ดูว่าข้อของตัวเองเริ่มได้หรือยัง */
  passed: string[];
}

export interface UatBoard {
  active: boolean;
  testers: Record<UatTeamId, UatTester[]>;
  results: UatResult[];
}

/** ผลของข้อหนึ่งจากผู้ทดสอบทุกคนของฝ่าย — ผ่านเมื่อมีคนกดผ่านและไม่มีใครแจ้งปัญหา */
export function caseState(results: UatResult[], caseId: string): UatStatus | null {
  const rows = results.filter((r) => r.caseId === caseId);
  if (rows.some((r) => r.status === "fail")) return "fail";
  return rows.length ? "pass" : null;
}

export function teamProgress(team: UatTeam, results: UatResult[]) {
  const states = team.cases.map((c) => caseState(results, c.id));
  return {
    total: team.cases.length,
    pass: states.filter((s) => s === "pass").length,
    fail: states.filter((s) => s === "fail").length,
  };
}
