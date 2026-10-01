/**
 * ทะเบียนรหัสสาเหตุการลาออก (Reason Code Master) — ชนิดข้อมูล **ใช้ได้ทั้ง server และ client**
 *
 * ต้นฉบับคือไฟล์ `Reason Code Master_Final ส่งทีม OPS.xlsx` ของทีม OPS (ก.ย. 2026)
 * ข้อมูลอยู่ใน MongoDB `hr_service` สองคอลเลกชัน แก้ได้จากหน้า
 * `/recruitment/admin/settings/resign-reasons` — **ไม่มีรายการฝังในโค้ดอีกแล้ว**
 * (ชุดตั้งต้นใส่ด้วย `seed_resign_reasons.mjs` ครั้งเดียว)
 *
 * หลักการของทีม OPS: *ทุกรหัสต้องระบุได้ว่า “ใครแก้” ถ้าระบุไม่ได้ แปลว่ารหัสนั้นกว้างเกินไป*
 *
 * ใช้สองที่:
 * - ทะเบียนประวัติ พจส. — ตอนบันทึกการพ้นสภาพ (`master_driver.resignation`)
 * - ขอสรรหา — เหตุผลที่ต้องหาคนแทนคนเดิม (`recruitment_requests.replace`)
 *
 * ทั้งสองที่เก็บ **ทั้งรหัสและป้าย ณ เวลาที่บันทึก** — แก้ป้ายหรือลบรหัสในหน้าตั้งค่า
 * ทีหลัง ของเก่าจึงยังอ่านได้ว่าตอนนั้นเลือกอะไร
 */

/* -------------------------------------------------------------- ประเภทการออก */

/** ตรงกับตาราง “ประเภทการออก” ท้ายไฟล์ Excel — เป็นหมวดสำหรับรายงาน จึงตายตัวในโค้ด */
export type ExitType = "vol" | "inv" | "disap";

export const EXIT_TYPES: { value: ExitType; code: string; label: string; hint: string }[] = [
  {
    value: "vol",
    code: "Vol",
    label: "สมัครใจลาออก",
    hint: "Voluntary — พนักงานลาออกเองไม่ว่าจะด้วยเหตุผลใด ๆ",
  },
  {
    value: "inv",
    code: "Inv",
    label: "บริษัทให้ออก",
    hint: "Involuntary — เคสที่บริษัทปลดออก ไม่ว่าจะด้วยเหตุผลใด ๆ",
  },
  {
    value: "disap",
    code: "Disap",
    label: "หายไปเลยติดต่อไม่ได้",
    hint: "Disappear — หายไปเลยติดต่อไม่ได้",
  },
];

/** สีชิปประเภทการออก — ใช้ชุด `chip-*` ของระบบ ไม่ใช่สีดิบ */
export const EXIT_TYPE_CHIP: Record<ExitType, string> = {
  vol: "chip-live",
  inv: "chip-alert",
  disap: "chip-wait",
};

export function isExitType(v: unknown): v is ExitType {
  return v === "vol" || v === "inv" || v === "disap";
}

export function exitTypeLabel(v: string): string {
  return EXIT_TYPES.find((t) => t.value === v)?.label ?? "";
}

/* ---------------------------------------------------------------- หมวดใหญ่ */

export interface ResignCategory {
  id: string;
  /** อักษรนำของรหัสในหมวด — `P` → P1 P2 … · แก้ไม่ได้หลังสร้าง */
  prefix: string;
  label: string;
  /** ประเภทการออกตั้งต้นของรหัสในหมวดนี้ — รหัสแต่ละตัวยังตั้งทับเองได้ */
  exitType: ExitType;
  order: number;
  updatedAt: string;
  updatedBy: string;
}

/* ------------------------------------------------------------------ รหัส */

export interface ResignReason {
  id: string;
  /** `P1`, `J10`, `X12` — แก้ไม่ได้หลังสร้าง เพราะของที่บันทึกไปแล้วอ้างรหัสนี้ */
  code: string;
  categoryId: string;
  /** หมวดย่อย — ข้อความที่คนเลือกเห็นในดรอปดาวน์ */
  label: string;
  /** ขยายความ (ถ้ามี) */
  description: string;
  exitType: ExitType;
  /** `false` = ซ่อนจากดรอปดาวน์ แต่ของเก่าที่อ้างรหัสนี้ยังอ่านได้ */
  active: boolean;
  order: number;
  updatedAt: string;
  updatedBy: string;
}

export interface ResignMaster {
  categories: ResignCategory[];
  reasons: ResignReason[];
}

/** สิ่งที่แนบไปกับระเบียนที่เลือกรหัส — ป้ายเป็นสำเนา ณ เวลาที่บันทึก */
export interface ResignReasonPick {
  code: string;
  label: string;
  categoryLabel: string;
  exitType: ExitType;
}

/* ------------------------------------------------------------ ตัวช่วยแสดงผล */

/** เรียงรหัสแบบคน — `J2` มาก่อน `J10` */
export function compareCode(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true });
}

/** ป้ายในดรอปดาวน์ — มีรหัสนำหน้า ช่องค้นหาของ `Select` จึงค้นด้วยรหัสได้ */
export function reasonOptionLabel(r: Pick<ResignReason, "code" | "label">): string {
  return `${r.code} · ${r.label}`;
}

/**
 * แปลงเป็นกลุ่มของ `SelectField` — **เฉพาะรหัสที่เปิดใช้** เรียงตามหมวด
 *
 * `keep` = รหัสที่ถูกเลือกอยู่แล้วในระเบียนที่กำลังแก้ ถ้ารหัสนั้นถูกปิดใช้ไปแล้ว
 * ยังต้องโชว์ ไม่งั้นช่องจะว่างทั้งที่มีค่า แล้วคนกดบันทึกซ้ำจะโดนบังคับเปลี่ยนเหตุผล
 */
export function reasonGroups(
  master: ResignMaster,
  keep = "",
): { label: string; options: { value: string; label: string }[] }[] {
  return [...master.categories]
    .sort((a, b) => a.order - b.order)
    .map((c) => ({
      label: `${c.prefix} · ${c.label}`,
      options: master.reasons
        .filter((r) => r.categoryId === c.id && (r.active || r.code === keep))
        .sort((a, b) => a.order - b.order || compareCode(a.code, b.code))
        .map((r) => ({ value: r.code, label: reasonOptionLabel(r) })),
    }))
    .filter((g) => g.options.length > 0);
}

/**
 * เหตุผลแทนคนเดิมชุดก่อนมี master (ก่อน 23 ก.ย. 2026) — ใบขอสรรหาเก่ายังเก็บค่าพวกนี้
 * ไว้ใน `replace.reason` จึงต้องอ่านออก **ห้ามใช้เป็นตัวเลือกใหม่**
 */
export const LEGACY_REPLACE_REASON_LABELS: Record<string, string> = {
  resigned: "ลาออก",
  dismissed: "ปลดออก",
  customer_complaint: "ลูกค้าร้องเรียน",
  customer_return: "ลูกค้าขอคืน",
  training_failed: "ฝึกงานไม่ผ่าน",
  other: "อื่นๆ",
};
