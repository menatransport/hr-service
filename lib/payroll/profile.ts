/**
 * ผลวิเคราะห์คุณภาพข้อมูลรายคอลัมน์ — โครงเดียวกับ Column quality ของ Power Query
 *
 * **ตอนนี้เป็น FE ล้วน** ข้อมูลข้างล่างเป็นของตัวอย่าง เลียนไฟล์ “ค่าเที่ยว Mixer”
 * ของ Operation Support ไว้ให้หน้าจอมีของจริงให้กด · ตัวอ่านไฟล์จริงจะมาทีหลัง
 * (`POST /api/payroll/parse` ด้วย `exceljs` ฝั่งเซิร์ฟเวอร์) แล้วคืน `FileProfile`
 * หน้าตาเดียวกันเป๊ะ — วันนั้นเปลี่ยนแค่ที่มาของข้อมูล ไม่ต้องแก้คอมโพเนนต์
 *
 * กติกาสามข้อที่ตัวอ่านจริงต้องทำตาม อย่าเปลี่ยนโดยไม่ได้คุยกัน:
 *
 * 1. **อ่านครบทุกแถว ไม่สุ่ม** — Power Query ดูแค่ 1,000 แถวแรกเป็นค่าเริ่มต้น แล้ว
 *    รายงานว่าสะอาดทั้งที่ไม่ใช่ · ไฟล์ของเราใหญ่สุดหลักร้อยแถว ไม่มีเหตุผลให้สุ่ม
 * 2. **ชนิดข้อมูลตัดสินจากเสียงข้างมาก** ไม่ใช่ให้คนมาประกาศ — นับว่าค่าที่ไม่ว่าง
 *    ส่วนใหญ่เป็นอะไร ที่เหลือคือ `mismatch` · วิธีนี้จับ “ตัวเลขที่เก็บเป็นข้อความ”
 *    ซึ่งเป็นปัญหาที่เจอบ่อยที่สุดในไฟล์ที่ส่งกันในบริษัทได้ตรง ๆ
 * 3. **เซลล์ที่มีแต่เว้นวรรคนับเป็นช่องว่าง** — Excel ถือว่ามีค่า แต่จับคู่พนักงานไม่ได้
 *    ถ้าไม่แยกออกมา คอลัมน์รหัสจะขึ้นว่าครบทั้งที่ใช้งานไม่ได้จริง
 */

export type CellType = "number" | "text" | "date" | "empty";

export const TYPE_LABEL: Record<CellType, string> = {
  number: "ตัวเลข",
  text: "ข้อความ",
  date: "วันที่",
  empty: "ไม่มีข้อมูล",
};

/** สีจุดนำหน้าชนิดข้อมูล — แยกจากสีสถานะ ไม่ให้อ่านสลับกัน */
export const TYPE_DOT: Record<CellType, string> = {
  number: "bg-primary",
  text: "bg-mut",
  date: "bg-warning",
  empty: "bg-base-300",
};

/**
 * สถานะของคอลัมน์
 * - `ok` นำเข้าได้เลย
 * - `warn` ว่างเยอะผิดปกติ แต่ไม่ถึงกับผิด — ยืนยันกับเจ้าของไฟล์สักครั้ง
 * - `error` มีค่าที่ผิดชนิดหรือคีย์ว่าง ต้องจัดการก่อน
 * - `skip` ไม่มีหัวคอลัมน์หรือว่างทั้งคอลัมน์ ระบบไม่เลือกให้ตั้งแต่แรก
 */
export type ColumnState = "ok" | "warn" | "error" | "skip";

export const STATE_LABEL: Record<ColumnState, string> = {
  ok: "พร้อม",
  warn: "ควรดู",
  error: "ต้องดู",
  skip: "ข้าม",
};

export const STATE_TONE: Record<ColumnState, string> = {
  ok: "bg-soft text-primary",
  warn: "bg-warning/15 text-warning",
  error: "bg-sla/12 text-sla",
  skip: "bg-base-200 text-mut",
};

/** เรียง “ปัญหามากขึ้นก่อน” ใช้ลำดับนี้ */
export const STATE_RISK: Record<ColumnState, number> = {
  error: 0,
  warn: 1,
  ok: 2,
  skip: 3,
};

/** แถวที่มีค่าผิด — ชี้ตำแหน่งจริงในไฟล์ ไม่ใช่แค่บอกว่ามีกี่แถว */
export interface BadCell {
  /** เลขแถวในไฟล์ Excel · `"…"` = ย่อรายการที่เหลือ */
  row: string;
  value: string;
  reason: string;
}

export interface ColumnProfile {
  /** ตัวอักษรคอลัมน์ใน Excel — เป็นคีย์ของคอลัมน์ตลอดทั้งหน้า */
  letter: string;
  /** หัวคอลัมน์ตามที่เขียนในไฟล์ · ว่าง = ไม่มีหัวคอลัมน์ */
  header: string;
  type: CellType;
  state: ColumnState;
  /** ค่าที่ตรงชนิดและไม่ว่าง */
  valid: number;
  /** ค่าที่ไม่ตรงกับชนิดของคอลัมน์ */
  mismatch: number;
  /** ค่าว่าง รวมเซลล์ที่มีแต่เว้นวรรค */
  empty: number;
  distinct: number;
  samples: string[];
  /** คอลัมน์ที่ใช้จับคู่พนักงาน — ว่างแม้แถวเดียวก็ไปต่อไม่ได้ */
  isKey?: boolean;
  /** สรุปปัญหาหนึ่งบรรทัด ขึ้นใต้ชื่อคอลัมน์ */
  issue?: string;
  /** อธิบายว่าทำไมถึงเป็นปัญหา ขึ้นในรายละเอียดที่กางออก */
  note?: string;
  badCells?: BadCell[];
  /** ขั้นตอนแปลงข้อมูลที่ระบบเสนอ — ว่าง = ไม่มีอะไรให้แก้อัตโนมัติ */
  fix?: string;
}

export interface FileProfile {
  fileName: string;
  sheetName: string;
  sheetCount: number;
  headerRow: number;
  totalRows: number;
  columns: ColumnProfile[];
}

/* ────────────────────────────────────────────── ข้อมูลตัวอย่าง (FE ล้วน) */

const TOTAL = 405;

export const SAMPLE_PROFILE: FileProfile = {
  fileName: "ค่าเที่ยว Mixer ก.ย.69.xlsx",
  sheetName: "Mixer",
  sheetCount: 3,
  headerRow: 3,
  totalRows: TOTAL,
  columns: [
    {
      letter: "A",
      header: "ลำดับ",
      type: "number",
      state: "ok",
      valid: 405,
      mismatch: 0,
      empty: 0,
      distinct: 405,
      samples: ["1", "2", "3", "4"],
    },
    {
      letter: "B",
      header: "รหัสพนักงาน",
      type: "text",
      state: "error",
      valid: 403,
      mismatch: 0,
      empty: 2,
      distinct: 403,
      samples: ["D-10421", "D-10455", "D-10498", "D-10502"],
      isKey: true,
      issue: "คอลัมน์คีย์มีช่องว่าง 2 แถว",
      note: "แถว 214 ว่างจริง ส่วนแถว 388 มีแต่เว้นวรรค ซึ่ง Excel ถือว่ามีค่า แต่จับคู่พนักงานไม่ได้",
      badCells: [
        { row: "214", value: "(ว่าง)", reason: "ไม่มีค่า" },
        { row: "388", value: '" "', reason: "มีแต่เว้นวรรค" },
      ],
      fix: "ตัดช่องว่างหัวท้าย แล้วถือเป็นค่าว่าง",
    },
    {
      letter: "C",
      header: "ชื่อ - สกุล",
      type: "text",
      state: "ok",
      valid: 405,
      mismatch: 0,
      empty: 0,
      distinct: 405,
      samples: ["สมชาย ทองพูน", "ณรงค์ ปานแก้ว", "วิทยา ศรีบุญเรือง"],
    },
    {
      letter: "D",
      header: "แพล้น",
      type: "text",
      state: "ok",
      valid: 405,
      mismatch: 0,
      empty: 0,
      distinct: 3,
      samples: ["ลาดกระบัง", "สระบุรี", "อมตะนคร"],
    },
    {
      letter: "E",
      header: "ประเภทรถ",
      type: "text",
      state: "ok",
      valid: 405,
      mismatch: 0,
      empty: 0,
      distinct: 2,
      samples: ["โม่ใหญ่", "โม่เล็ก"],
    },
    {
      letter: "F",
      header: "ค่าเที่ยว",
      type: "number",
      state: "error",
      valid: 393,
      mismatch: 12,
      empty: 0,
      distinct: 288,
      samples: ["12450", "9800", "15300", "1,250"],
      issue: "ตัวเลข 12 ค่าถูกเก็บเป็นข้อความ",
      note: "ค่าที่มีจุลภาคหรือเว้นวรรคติดมา Excel เก็บเป็นข้อความ ถ้านำเข้าทั้งอย่างนี้ ยอดรวมค่าเที่ยวจะขาดไป 12 คน",
      badCells: [
        { row: "47", value: '"1,250"', reason: "ข้อความ ไม่ใช่ตัวเลข" },
        { row: "88", value: '" 9800"', reason: "มีเว้นวรรคนำหน้า" },
        { row: "131", value: '"11,900"', reason: "ข้อความ ไม่ใช่ตัวเลข" },
        { row: "…", value: "อีก 9 แถว", reason: "" },
      ],
      fix: "แปลงเป็นตัวเลข (ตัดจุลภาคและเว้นวรรค)",
    },
    {
      letter: "G",
      header: "จำนวนเที่ยว",
      type: "number",
      state: "ok",
      valid: 405,
      mismatch: 0,
      empty: 0,
      distinct: 41,
      samples: ["18", "22", "9", "31"],
    },
    {
      letter: "H",
      header: "วันที่เริ่มงาน",
      type: "date",
      state: "error",
      valid: 361,
      mismatch: 44,
      empty: 0,
      distinct: 298,
      samples: ["01/03/2562", "16/07/2563", "2021-11-02"],
      issue: "ปนกันระหว่าง พ.ศ. กับวันที่ของ Excel",
      note: "361 แถวเป็นข้อความรูปแบบ วว/ดด/ปปปป เป็น พ.ศ. ส่วนอีก 44 แถวเป็นวันที่จริงของ Excel ซึ่งเป็น ค.ศ. — ถ้าไม่แปลงให้ตรงกันก่อน อายุงานจะเพี้ยนไป 543 ปี",
      badCells: [
        { row: "12", value: "2021-11-02", reason: "วันที่ Excel (ค.ศ.)" },
        { row: "65", value: "2019-03-01", reason: "วันที่ Excel (ค.ศ.)" },
        { row: "…", value: "อีก 42 แถว", reason: "" },
      ],
      fix: "แปลงให้เป็น พ.ศ. ทั้งคอลัมน์",
    },
    {
      letter: "I",
      header: "เชื้อเพลิงต่ำกว่าเรต",
      type: "number",
      state: "warn",
      valid: 224,
      mismatch: 0,
      empty: 181,
      distinct: 167,
      samples: ["320", "0", "1180"],
      issue: "ว่าง 181 แถว (45%)",
      note: "ว่างมากแบบนี้มักเป็นเรื่องปกติ — คนที่ไม่มีรายการนี้ก็เว้นไว้ แต่ควรยืนยันกับ Operation Support สักครั้งว่าไม่ใช่กรอกตกหล่น",
      fix: "ถือค่าว่างเป็น 0",
    },
    {
      letter: "J",
      header: "เชื้อเพลิงเกินเรต",
      type: "number",
      state: "error",
      valid: 398,
      mismatch: 7,
      empty: 0,
      distinct: 204,
      samples: ["0", "1450", "#N/A"],
      issue: "มีค่าผิดพลาดจากสูตร 7 แถว",
      note: "#N/A มาจาก VLOOKUP ในไฟล์ต้นฉบับที่หาค่าไม่เจอ — ไม่ใช่ศูนย์ และไม่ใช่ค่าว่าง ต้องกลับไปถามเจ้าของไฟล์ว่าค่าจริงคืออะไร",
      badCells: [
        { row: "73", value: "#N/A", reason: "สูตรหาค่าไม่เจอ" },
        { row: "156", value: "#N/A", reason: "สูตรหาค่าไม่เจอ" },
        { row: "…", value: "อีก 5 แถว", reason: "" },
      ],
      /* ไม่มี `fix` โดยตั้งใจ — เดาค่าแทนเจ้าของไฟล์คือทางที่พังเงียบที่สุด */
    },
    {
      letter: "K",
      header: "หมายเหตุ",
      type: "text",
      state: "warn",
      valid: 25,
      mismatch: 0,
      empty: 380,
      distinct: 19,
      samples: ["ลาออกกลางเดือน", "รถเสีย 3 วัน"],
      issue: "ว่าง 380 แถว (94%)",
      note: "คอลัมน์ที่แทบไม่มีข้อมูล จะเลือกเข้ามาก็ได้ แต่ยังไม่มีคอลัมน์ใน template.1 ที่รองรับ ถ้าอยากเก็บต้องเปิดช่องก่อน",
    },
    {
      letter: "L",
      header: "",
      type: "empty",
      state: "skip",
      valid: 0,
      mismatch: 0,
      empty: 405,
      distinct: 0,
      samples: [],
      issue: "ไม่มีหัวคอลัมน์ และว่างทั้งคอลัมน์",
      note: "เกิดจากการจัดรูปแบบค้างไว้ในไฟล์ต้นฉบับ ระบบไม่เลือกให้ตั้งแต่แรก",
    },
    {
      letter: "M",
      header: "ผู้บันทึก",
      type: "text",
      state: "ok",
      valid: 405,
      mismatch: 0,
      empty: 0,
      distinct: 2,
      samples: ["กิตติ", "วราภรณ์"],
    },
  ],
};

/** คอลัมน์ที่ระบบเลือกให้ตั้งแต่แรก — ทุกคอลัมน์ยกเว้นที่ข้ามอัตโนมัติ */
export function defaultSelection(profile: FileProfile): Set<string> {
  return new Set(
    profile.columns.filter((c) => c.state !== "skip").map((c) => c.letter),
  );
}

export function tally(profile: FileProfile) {
  const by = (state: ColumnState) =>
    profile.columns.filter((c) => c.state === state).length;
  return {
    ok: by("ok"),
    warn: by("warn"),
    error: by("error"),
    skip: by("skip"),
    total: profile.columns.length,
  };
}

/** เปอร์เซ็นต์สำหรับแถบคุณภาพ — ปัดทศนิยมหนึ่งตำแหน่งพอ */
export function share(count: number, total: number): number {
  if (!total) return 0;
  return Math.round((count / total) * 1000) / 10;
}
