/**
 * UAT ชั่วคราว — ทดสอบระบบทะเบียนประวัติ พจส. ฝั่งลาดกระบัง ตั้งแต่ผู้สมัครจนรับรถ (2 พ.ย. 2569)
 *
 * ฝ่ายที่เกี่ยวข้องไล่ตามเส้นทางจริงของหน้า “ติดตามพนักงานใหม่” — ลำดับจริงอยู่ที่ `phase` + `needs` ของแต่ละข้อ
 * (KA ขอ RQ → MASS ผูก RQ เริ่มฝึก → KA/ST/HRD ระหว่างฝึก → KA รับรถ → HRD ทะเบียน)
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

/** ลำดับขั้นของเส้นทางพนักงานใหม่ — ขั้นถัดไปเริ่มได้เมื่อข้อที่ต้องรอ (`needs`) ผ่านแล้ว
 *  · ST ทั้ง 3 รอบ (วันแรก/กลางฝึก/ก่อนรับรถ) รวมเป็นข้อเดียวในขั้นระหว่างฝึก (Bew 3 พ.ย. 2569) */
export const UAT_PHASES: { no: number; title: string }[] = [
  { no: 1, title: "เตรียมข้อมูล" },
  { no: 2, title: "เริ่มฝึกงาน" },
  { no: 3, title: "ระหว่างฝึก" },
  { no: 4, title: "รับรถ" },
  { no: 5, title: "ทะเบียนประวัติ" },
];

/** กติกาก่อนเริ่ม — ทดสอบบนฐานจริง จึงต้องทำให้ล้างข้อมูลทดสอบออกได้ครบ */
export const UAT_RULES: string[] = [
  "ใช้เฉพาะผู้สมัครชื่อขึ้นต้น “UAT-” (ผู้จัดการ UAT กด “สุ่มผู้สมัครทดสอบ” ให้)",
  "KA ขออัตรา: หมายเหตุขึ้นต้นด้วย “UAT” — ใช้แยกข้อมูลทดสอบตอนล้าง",
  "วันเริ่มฝึกใส่วันนี้หรือย้อนหลัง — ถ้าเป็นวันในอนาคต คนจะยังไม่ขึ้นแท็บฝึกงาน",
  "ทำไม่ได้หรือผลไม่ตรง → กด ! แจ้งปัญหา พร้อมหมายเหตุ (อย่าติ๊กผ่าน)",
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
        title: "นัดสัมภาษณ์",
        phase: 1,
        how: "หน้าผู้สมัคร → เปิดใบ UAT- → สถานะ “นัดสัมภาษณ์” + วันนัด",
        check: "สถานะและวันนัดบันทึกถูก · ค้นด้วยเลข DRV เจอ",
        href: CANDIDATES,
      },
      {
        id: "mass-rc",
        title: "เริ่มฝึกงาน · ผูก JR",
        phase: 2,
        how: "สถานะ “ฝึกงาน” → ฟอร์ม RC เลือก JR ของ KA (หมายเหตุ UAT) · วันเริ่มฝึก = วันนี้ · รหัส พจส. = UAT + เลข DRV (เช่น UAT26110022)",
        check: "ใบสมัครมีลิงก์ JR ↗ · ชื่อขึ้นในแท็บฝึกงาน",
        needs: ["ka-rq", "mass-interview"],
        href: CANDIDATES,
      },
      {
        id: "mass-daily",
        title: "ลงตารางรายวัน",
        phase: 3,
        how: "หน้าผู้สมัคร → กรอง “ฝึกงาน” → “แสดงตารางรายวัน” → ลงสถานะของวันนี้",
        check: "โหลดหน้าใหม่แล้วสถานะยังอยู่ · กดชื่อไปหน้าเส้นทางได้ · ปุ่มคัดลอก RC Alert ใช้ได้",
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
        title: "ขออัตรา (JR)",
        phase: 1,
        how: "ติดตามพนักงานใหม่ → แท็บอัตราว่าง → “ขออัตรา” · หมายเหตุขึ้นต้น UAT",
        check: "ได้เลข JR ใหม่ สถานะ “เปิดรับ”",
        href: `${ONBOARDING}?tab=open`,
      },
      {
        id: "ka-trainer",
        title: "ครูฝึก · รถ · Co-Driver",
        phase: 3,
        how: "แท็บฝึกงาน → เปิดรายคน → ส่วน KA เลือกครูฝึก รถ Zone (Co-Driver = อบรม ให้กรอกวันและผล)",
        check: "ขั้น KA ขึ้น “เสร็จ”",
        needs: ["mass-rc"],
        href: TRAINING,
      },
      {
        id: "ka-handover",
        title: "บันทึกรับรถ",
        phase: 4,
        how: "เปิดรายคน → ส่วนรับรถ ใส่วันรับรถ (วันนี้หรือย้อนหลัง) + ผล “ผ่าน”",
        check: "ย้ายไปแท็บรับรถ · ใบสมัครเป็น “ปฏิบัติงาน” · ขึ้นในทะเบียนประวัติ",
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
        /* id เดิมของข้อ “ประเมินก่อนรับรถ” — ผลที่ติ๊กไว้แล้วกับ `needs` ของ ka-handover ยังใช้ได้ */
        id: "st-day8",
        title: "บันทึกผล ST ครบ 3 รอบ",
        phase: 3,
        how: "แท็บฝึกงาน → เปิดรายคน → ส่วน ST เลือก ST ที่ดูแล แล้วบันทึกทีละรอบ: ตรวจวันแรก (Alc./สาร) → ติดตามกลางฝึก → ประเมินก่อนรับรถ",
        check: "บันทึกแต่ละรอบแล้วช่องรอบถัดไปขึ้นมา · ครบ 3 รอบ ขั้น ST ขึ้น “เสร็จ”",
        needs: ["mass-rc"],
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
        title: "ปฐมนิเทศ · คะแนนสอบ",
        phase: 3,
        how: "แท็บฝึกงาน → เปิดรายคน → ส่วน HRD ใส่วันปฐมนิเทศ + คะแนนสอบ",
        check: "ขั้น HRD ขึ้น “เสร็จ”",
        needs: ["mass-rc"],
        href: TRAINING,
      },
      {
        id: "hrd-resign",
        title: "ปรับพ้นสภาพ",
        phase: 5,
        how: "ทะเบียนประวัติ → ค้น “UAT-” → กด “ปฏิบัติงาน ▾” → พ้นสภาพ… กรอกวันที่ ประเภท เหตุผล → บันทึก",
        check: "บันทึกได้ในหน้าเดิม · แถวเป็นสีแดง และอยู่ในแท็บพ้นสภาพ",
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
