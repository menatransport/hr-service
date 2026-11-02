/**
 * UAT ชั่วคราว — ทดสอบระบบทะเบียนประวัติ พจส. ฝั่งลาดกระบัง ตั้งแต่ผู้สมัครจนรับรถ (2 พ.ย. 2569)
 *
 * ฝ่ายที่เกี่ยวข้องไล่ตามเส้นทางจริงของหน้า “ติดตามพนักงานใหม่” (RC → KA → ST → HRD → รับรถ)
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

export const UAT_SCOPE = "ทะเบียนประวัติ พจส. · ลาดกระบัง";

export const UAT_TEAMS: UatTeam[] = [
  {
    id: "mass",
    short: "MASS",
    label: "ฝ่ายสรรหาพนักงานจัดส่ง",
    divisionId: 30,
    cases: [
      { id: "mass-interview", title: "รับเรื่อง · นัดสัมภาษณ์", href: CANDIDATES },
      { id: "mass-rc", title: "เปลี่ยนเป็นฝึกงาน · ฟอร์ม RC ผูก RQ", href: CANDIDATES },
      { id: "mass-daily", title: "ลงตารางรายวันช่วงฝึกงาน", href: CANDIDATES },
    ],
  },
  {
    id: "ka",
    short: "KA",
    label: "ฝ่ายจัดส่งลาดกระบัง",
    divisionId: 22,
    cases: [
      { id: "ka-rq", title: "ขออัตราสรรหา (RQ)", href: `${ONBOARDING}?tab=open` },
      { id: "ka-trainer", title: "ฟอร์ม KA · ครูฝึก · รถ · Co-Driver", href: `${ONBOARDING}?tab=training` },
      { id: "ka-handover", title: "บันทึกรับรถ", href: `${ONBOARDING}?tab=training` },
    ],
  },
  {
    id: "st",
    short: "ST",
    label: "ฝ่ายจัดการมาตรฐานและอบรมความปลอดภัย",
    divisionId: 18,
    cases: [
      { id: "st-day1", title: "ตรวจวันแรก · Alc./สาร", href: `${ONBOARDING}?tab=training` },
      { id: "st-day4", title: "ติดตามกลางฝึก", href: `${ONBOARDING}?tab=training` },
      { id: "st-day8", title: "ประเมินก่อนรับรถ", href: `${ONBOARDING}?tab=training` },
    ],
  },
  {
    id: "hrd",
    short: "HRD",
    label: "ฝ่ายพัฒนาบุคลากรและองค์กร",
    divisionId: 34,
    cases: [{ id: "hrd-orientation", title: "บันทึกปฐมนิเทศ · คะแนนสอบ", href: `${ONBOARDING}?tab=training` }],
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
