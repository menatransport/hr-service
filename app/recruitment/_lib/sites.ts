/**
 * สาขาของงานสรรหา — แท็บบนสุดของหน้าผู้สมัคร (Bew 11 พ.ย. 2569) · สองชุดเท่ากับแท็บของทะเบียน พจส.
 * ลาดกระบัง | สระบุรี+บางปะกง (ฝ่ายบุคคลสระบุรีกับบางปะกงดูชุดเดียวกัน)
 *
 * ใบสมัครอยู่สาขาไหน: ผูก RQ แล้ว = สาขาของ RQ · ยังไม่ผูก = `site` ที่ฝ่ายบุคคลย้ายไว้ · ไม่เคยย้าย = ลาดกระบัง
 * (ฟอร์มสมัครไม่มีข้อถามสาขา — “สนใจทำงานเขตไหน” เป็นข้อความอิสระ จับสาขาไม่ได้)
 */
export const RECRUIT_SITES = [
  { key: "latkrabang", label: "ลาดกระบัง" },
  { key: "saraburi-bangpakong", label: "สระบุรี+บางปะกง" },
] as const;

export type RecruitSite = (typeof RECRUIT_SITES)[number]["key"];

export const DEFAULT_RECRUIT_SITE: RecruitSite = "latkrabang";

export function isRecruitSite(v: unknown): v is RecruitSite {
  return RECRUIT_SITES.some((s) => s.key === v);
}

export function recruitSiteLabel(site: RecruitSite): string {
  return RECRUIT_SITES.find((s) => s.key === site)!.label;
}

/** ชื่อสาขาของ RQ (`BRANCHES`) / `site` ของผู้ใช้จาก NCAC (“Saraburi”, “Bang Pakong”) → แท็บ · นอกนั้น = ลาดกระบัง */
export function recruitSiteOf(value: string | null | undefined): RecruitSite {
  const v = (value ?? "").toLowerCase().replace(/\s+/g, "");
  return /saraburi|bangpakong|สระบุรี|บางปะกง|บางประกง/.test(v) ? "saraburi-bangpakong" : "latkrabang";
}

/** สาขาของ RQ (`BRANCHES`) ที่อยู่ในแท็บนั้น — ช่องสาขาในฟอร์มขอสรรหาโชว์ตามแท็บที่เปิดอยู่ (Bew 11 พ.ย. 2569) */
export const RECRUIT_SITE_BRANCHES: Record<RecruitSite, readonly string[]> = {
  latkrabang: ["ลาดกระบัง"],
  "saraburi-bangpakong": ["สระบุรี", "บางปะกง"],
};

interface SiteViewer {
  site?: string | null;
}

/** site ของผู้ใช้จาก NCAC → แท็บของตัวเอง · ไม่ใช่สองกลุ่มนี้ (Bangkok HQ · Rayong …) = `null` */
function ownRecruitSite(site: string | null | undefined): RecruitSite | null {
  const v = (site ?? "").toLowerCase().replace(/\s+/g, "");
  if (/saraburi|bangpakong|สระบุรี|บางปะกง|บางประกง/.test(v)) return "saraburi-bangpakong";
  if (/latkrabang|ladkrabang|ลาดกระบัง/.test(v)) return "latkrabang";
  return null;
}

/**
 * แท็บสาขาที่ผู้ใช้เห็น (หน้าผู้สมัคร + ทะเบียน พจส. · Bew 11 พ.ย. 2569)
 * ลาดกระบัง → ลาดกระบังอย่างเดียว · สระบุรี/บางปะกง → สระบุรี+บางปะกงอย่างเดียว
 * · site อื่น (สำนักงานใหญ่ ระยอง …) → ทุกแท็บ · `allSites` = สิทธิ์ย่อย “ดูทุกสาขา” (`recruit-all-sites`
 *   ที่ `/desk/permissions` · เปิดให้ RC MASS) → ทุกแท็บ
 * ⚠️ ซ่อนแท็บเท่านั้น — ข้อมูลของอีกสาขายังมากับหน้า (กรองฝั่ง client)
 */
export function visibleRecruitSites(user: SiteViewer | null | undefined, allSites: boolean): RecruitSite[] {
  const all = RECRUIT_SITES.map((s) => s.key);
  const own = ownRecruitSite(user?.site);
  return allSites || !own ? all : [own];
}

/** แท็บตั้งต้น — ค่าที่ขอมา (`?site=` · คุกกี้) ตัวแรกที่ผู้ใช้เห็นได้ → แท็บของตัวเอง → แท็บแรกที่เห็นได้ */
export function pickRecruitSite(
  user: SiteViewer | null | undefined,
  allSites: boolean,
  ...wanted: (string | null | undefined)[]
): RecruitSite {
  const allowed = visibleRecruitSites(user, allSites);
  for (const w of wanted) if (isRecruitSite(w) && allowed.includes(w)) return w;
  const own = ownRecruitSite(user?.site);
  return own && allowed.includes(own) ? own : allowed[0];
}
