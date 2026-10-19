import { effectOf, DEFAULT_PAYEE_COLUMN, PAYEE_COLUMN, type MoneyEffect } from "./classify";
import { headerLetter, type ParsedFile } from "./parse";
import { findItem, INTAKE_ITEMS, type IntakeOwner, type SystemOwner } from "./registry";
import { templateOf } from "./template-spec";

/**
 * แปลงไฟล์ของแต่ละฝ่ายให้เป็น **ตารางเดียวกันทุกรายการ**
 *
 * ## ปัญหาที่แก้
 *
 * ฟอร์มทั้ง 25 ใบเป็นตาราง "กว้าง" คนละผัง — #12 มีช่องรายวัน 31 ช่อง · #09 มีช่อง
 * รายอาทิตย์ 5 ช่อง · #23 มีค่าน้ำค่าไฟอย่างละ 4 ช่อง · ชื่อคนเรียกกัน 5 แบบ
 * (`ชื่อ-นามสกุล` `ชื่อ พจส.` `ชื่อ พจส.ใหม่` `ชื่อ` `ชื่อผู้เข้าพัก`) ตราบใดที่ยังเป็น
 * แบบนี้ จะเทียบข้ามรายการไม่ได้เลย ต้องเขียนโค้ดเฉพาะกิจต่อหนึ่งฟอร์ม และเลขรวม
 * ของรอบก็ต้องไล่บวกด้วยมือ
 *
 * ## รูปที่ปลายทาง
 *
 * หนึ่งแถว = **ค่าหนึ่งค่าของคนหนึ่งคนในรายการหนึ่ง** (long format) ด้านซ้ายเป็นมิติ
 * ที่แปลชื่อให้ตรงกันแล้ว ด้านขวาเป็นค่าที่วัดได้พร้อมหน่วยและทิศทางเงิน — รูปนี้
 * รวมทุกฝ่ายต่อกันได้ตรง ๆ จัดกลุ่มได้ด้วย SQL ธรรมดา และเติมรายการใหม่ในทะเบียน
 * ได้โดยไม่ต้องแก้อะไรที่ปลายทาง
 *
 * ## สิ่งที่ไฟล์นี้ **ไม่** ทำ
 *
 * **ไม่แตะชื่อคอลัมน์ในแบบฟอร์มที่ฝ่ายกรอก** — ชื่อพวกนั้นเป็นสัญญากับฝ่ายที่ส่ง
 * (ดูหัว `template-spec.ts`) การแปลงชื่อเกิดที่นี่ ตอนอ่านไฟล์เข้าระบบเท่านั้น
 * ฝ่ายที่ส่งจึงไม่ต้องเปลี่ยนวิธีทำงาน และของที่กรอกค้างไว้ยังใช้ได้
 */

/* ------------------------------------------------------------ พจนานุกรมมิติ */

/**
 * ชื่อมิติมาตรฐาน — **ชื่อเดียวต่อหนึ่งความหมาย** ไม่ว่าฟอร์มต้นทางจะเรียกว่าอะไร
 *
 * `person*` คือคนที่แถวนั้นพูดถึง · `payee*` คือคนที่เงินเข้า — สองอย่างนี้เป็นคนละคน
 * ใน #10 #16 (ครูฝึก) และ #30 (ผู้แนะนำ) ซึ่งเป็นจุดที่เงินเข้าผิดคนได้ง่ายที่สุด
 */
export type DimensionKey =
  | "personId"
  | "personName"
  | "personPhone"
  | "personPosition"
  | "personStatus"
  | "personType"
  | "startDate"
  | "payeeId"
  | "payeeName"
  | "payeePhone"
  | "payeeDepartment"
  | "customer"
  | "plant"
  | "site"
  | "department"
  | "truckNo"
  | "plate"
  | "truckBrand"
  | "truckType"
  | "docNo"
  | "docDate"
  | "roomNo"
  | "note";

export const DIMENSION_LABEL: Record<DimensionKey, string> = {
  personId: "รหัสพนักงาน",
  personName: "ชื่อพนักงาน",
  personPhone: "เบอร์โทร",
  personPosition: "ตำแหน่ง",
  personStatus: "สถานะพนักงาน",
  personType: "ประเภทพนักงาน",
  startDate: "วันเริ่มงาน",
  payeeId: "รหัสผู้รับเงิน",
  payeeName: "ชื่อผู้รับเงิน",
  payeePhone: "เบอร์ผู้รับเงิน",
  payeeDepartment: "ฝ่ายผู้รับเงิน",
  customer: "ผู้ว่าจ้าง",
  plant: "แพล้นท์",
  site: "สถานที่ทำงาน",
  department: "แผนก",
  truckNo: "เบอร์รถ",
  plate: "ทะเบียนรถ",
  truckBrand: "ยี่ห้อรถ",
  truckType: "ประเภทรถ",
  docNo: "เลขที่เอกสาร",
  docDate: "วันที่เอกสาร",
  roomNo: "เลขที่ห้องพัก",
  note: "หมายเหตุ",
};

/**
 * หัวคอลัมน์ในฟอร์ม → ชื่อมิติมาตรฐาน
 *
 * **ต้องครอบคลุมทุกหัวคอลัมน์ที่ไม่ใช่ช่องวัด/ช่องรายวันของทุกฟอร์ม** —
 * `validateNormalization()` จะฟ้องถ้ามีหัวคอลัมน์ไหนตกหล่น เพราะคอลัมน์ที่แปลงไม่ได้
 * คือข้อมูลที่หายไปเงียบ ๆ ตอนรวมตาราง ไม่ใช่แค่เรื่องความสวยงาม
 */
export const DIMENSION_OF: Record<string, DimensionKey> = {
  /* ตัวตนของคนในแถว */
  รหัสพนักงาน: "personId",
  "ชื่อ-นามสกุล": "personName",
  "ชื่อ พจส.": "personName",
  "ชื่อ พจส.ใหม่": "personName",
  ชื่อ: "personName",
  ชื่อผู้เข้าพัก: "personName",
  เบอร์โทร: "personPhone",
  ตำแหน่ง: "personPosition",
  สถานะ: "personStatus",
  สถานะผู้ถูกแนะนำ: "personStatus",
  "ประเภท พจส.": "personType",
  วันเริ่มงาน: "startDate",

  /* คนที่เงินเข้า */
  รหัสครูฝึก: "payeeId",
  ชื่อครูฝึก: "payeeName",
  เบอร์ครูฝึก: "payeePhone",
  รหัสผู้แนะนำ: "payeeId",
  ชื่อผู้แนะนำ: "payeeName",
  ฝ่ายผู้แนะนำ: "payeeDepartment",
  สถานะผู้แนะนำ: "payeeDepartment",

  /* หน่วยงาน/สถานที่ */
  ผู้ว่าจ้าง: "customer",
  แพล้นท์: "plant",
  สาขา: "site",
  ศูนย์: "site",
  สถานที่ทำงาน: "site",
  แผนก: "department",
  แผนกที่บันทึกข้อมูล: "department",
  แผนกผู้รับสภาพหนี้: "payeeDepartment",
  "ช่าง / สำนักงาน รับสภาพหนี้": "personPosition",
  เลขที่ห้องพัก: "roomNo",
  ปั๊ม: "site",

  /* รถ */
  เบอร์รถ: "truckNo",
  ทะเบียนรถ: "plate",
  ยี่ห้อ: "truckBrand",
  ประเภทรถ: "truckType",
  ตำแหน่งยาง: "truckType",
  ชนิดยาง: "truckType",

  /* เอกสารและวันที่ */
  เลขที่: "docNo",
  "เลขที่ มท.": "docNo",
  เลขที่ใบรับสภาพหนี้: "docNo",
  "เลขที่ใบแจ้งซ่อม/รับสภาพหนี้": "docNo",
  เลขที่บัญชี: "docNo",
  วันที่: "docDate",
  วันที่บันทึก: "docDate",
  วันที่บันทึกข้อมูล: "docDate",
  วันที่รับรถ: "docDate",
  วันที่รับรถจริง: "docDate",
  วันที่เปลี่ยน: "docDate",
  วันที่เริ่มชำระ: "docDate",
  วันที่เริ่มชำระเงิน: "docDate",
  วันที่เริ่มพัก: "docDate",
  วันที่สิ้นสุด: "docDate",
  เบิกสำรองวันที่: "docDate",
  ครบกำหนดจ่าย: "docDate",

  /* ข้อความอิสระ — เก็บไว้เป็นหมายเหตุ ไม่ใช่ทิ้ง */
  หมายเหตุ: "note",
  หมายเหตุการชำระเงิน: "note",
  รายการจ่ายเงิน: "note",
  ผลการประเมิน: "note",
  "ผลตรวจครั้งที่ 1 (วันที่ 1-14)": "note",
  "ผลตรวจครั้งที่ 2 (วันที่ 15-31)": "note",
  "กลุ่ม TA": "note",
  "Flow Status": "note",
  "งวดที่จ่าย (1 เดือน / 4 เดือน)": "note",
  "ฝึกครบ 10 วัน": "note",
};

/** `ลำดับ` เป็นเลขแถวในกระดาษ ไม่ใช่ข้อมูล — ตั้งใจทิ้ง ไม่ใช่ลืม */
const DROPPED = new Set(["ลำดับ"]);

/* ------------------------------------------------------------ หน่วยของค่าที่วัด */

export type Unit = "บาท" | "ชั่วโมง" | "วัน" | "ครั้ง" | "คัน" | "ลิตร" | "คิว" | "หน่วย";

/**
 * หน่วยอ่านจากวงเล็บท้ายชื่อช่อง — ชื่อช่องในสเปกเขียนหน่วยไว้แล้วเกือบทุกช่อง
 * ช่องที่ไม่มีวงเล็บเป็นช่องเงินตามบริบท (`จำนวนเงิน`) จึงตกเป็น "บาท"
 */
export function unitOf(header: string): Unit {
  const inside = /\(([^)]+)\)/.exec(header)?.[1] ?? "";
  if (/บาท/.test(inside)) return "บาท";
  if (/ชม\.|ชั่วโมง/.test(inside)) return "ชั่วโมง";
  if (/วัน/.test(inside)) return "วัน";
  if (/ครั้ง/.test(inside)) return "ครั้ง";
  if (/คัน/.test(inside)) return "คัน";
  if (/ลิตร/.test(inside)) return "ลิตร";
  if (/คิว/.test(inside)) return "คิว";
  if (/จำนวนเงิน|ยอดเงิน/.test(header)) return "บาท";
  return "หน่วย";
}

/* ------------------------------------------------------------ บทบาทของคอลัมน์ */

export type ColumnRole =
  | { role: "มิติ"; key: DimensionKey }
  | { role: "ค่าที่วัด"; effect: MoneyEffect; unit: Unit }
  | { role: "รายวัน"; day: number }
  | { role: "ทิ้ง" };

const DAY_HEADER = /^([1-9]|[12]\d|3[01])$/;

export function columnRole(itemId: string, header: string): ColumnRole | null {
  const effect = effectOf(itemId, header);
  if (effect) return { role: "ค่าที่วัด", effect, unit: unitOf(header) };
  if (DAY_HEADER.test(header)) return { role: "รายวัน", day: Number(header) };
  if (DROPPED.has(header)) return { role: "ทิ้ง" };

  const key = DIMENSION_OF[header];
  return key ? { role: "มิติ", key } : null;
}

/**
 * ตรวจว่าทุกคอลัมน์ของทุกฟอร์มแปลงเป็นรูปมาตรฐานได้ — คืนรายการปัญหา ว่างคือผ่าน
 *
 * รันใน `npm run verify:payroll` · **คอลัมน์ที่แปลงไม่ได้คือข้อมูลที่จะหายเงียบ ๆ**
 * ตอนรวมตาราง เพิ่มช่องใหม่ในฟอร์มแล้วลืมมาขึ้นทะเบียนที่นี่ จะไม่ผ่านตั้งแต่ตอนตรวจ
 */
export function validateNormalization(): string[] {
  const problems: string[] = [];
  /* หัวคอลัมน์ทั้งหมดที่มีอยู่จริงในฟอร์มสักใบ — ใช้จับชื่อในพจนานุกรมที่ไม่มีเจ้าของแล้ว */
  const inUse = new Set<string>();

  for (const item of INTAKE_ITEMS) {
    const spec = templateOf(item.id);
    if (!spec) continue;

    for (const header of spec.columns) {
      const role = columnRole(item.id, header);
      if (!role) {
        problems.push(
          `#${item.id} คอลัมน์ “${header}” ยังไม่มีชื่อมาตรฐาน — เพิ่มใน DIMENSION_OF (lib/payroll/normalize.ts)`,
        );
        continue;
      }
      inUse.add(header);
    }

    /* ช่องที่บอกว่าเงินเข้าใคร ต้องแปลงเป็น payeeId ได้ ไม่งั้นรูปมาตรฐานจะไม่รู้ว่าใครได้เงิน */
    const payee = PAYEE_COLUMN[item.id] ?? DEFAULT_PAYEE_COLUMN;
    const payeeKey = DIMENSION_OF[payee];
    if (payeeKey !== "payeeId" && payeeKey !== "personId") {
      problems.push(`#${item.id} ช่องเงินเข้าใคร “${payee}” ไม่ได้ถูกแปลงเป็นรหัสคน`);
    }
  }

  for (const header of Object.keys(DIMENSION_OF)) {
    if (!inUse.has(header)) {
      problems.push(`ชื่อมาตรฐานของ “${header}” ไม่ได้ใช้กับฟอร์มไหนแล้ว — ลบทิ้งได้`);
    }
  }

  return problems;
}

/* ------------------------------------------------------------ แปลงไฟล์เป็นแถวมาตรฐาน */

interface FactBase {
  period: string;
  itemId: string;
  /** ฝ่ายที่ส่งไฟล์ · หรือระบบที่ส่งยอดเอง (`SYSTEM_ITEMS`) — เพิ่มชนิดเท่านั้น ตรรกะเดิมไม่เปลี่ยน */
  owner: IntakeOwner | SystemOwner;
  /** เลขแถวจริงในชีต — ไว้ชี้กลับไปที่ไฟล์ต้นทางเวลาใครถามว่าเลขนี้มาจากไหน */
  sourceRow: number;
  /** คนที่แถวนี้พูดถึง */
  personId: string;
  /** คนที่เงินเข้า — เท่ากับ `personId` ยกเว้นค่าครูฝึกและเพื่อนแนะนำเพื่อน */
  payeeId: string;
  dims: Partial<Record<DimensionKey, string>>;
}

export type Fact =
  | (FactBase & {
      kind: "ค่าที่วัด";
      /** ชื่อช่องตามฟอร์มต้นทาง — เก็บไว้เพื่อให้ตามกลับไปหาต้นทางได้ */
      measure: string;
      effect: MoneyEffect;
      unit: Unit;
      value: number;
    })
  | (FactBase & { kind: "รายวัน"; day: number; code: string });

/** ตัวเลขในไฟล์จริงมีจุลภาคคั่นหลัก วงเล็บแทนค่าติดลบ และเว้นวรรคปน */
export function toNumber(raw: string): number | null {
  const text = raw.replace(/[\s,]/g, "");
  if (!text) return null;
  const negated = /^\((.+)\)$/.exec(text);
  const value = Number(negated ? `-${negated[1]}` : text);
  return Number.isFinite(value) ? value : null;
}

/**
 * ไฟล์ที่อ่านแล้ว → แถวมาตรฐาน
 *
 * **ข้ามค่าที่ว่างและค่าที่ไม่ใช่ตัวเลข** สำหรับช่องที่วัด เพราะแถวมาตรฐานเป็นข้อมูล
 * ที่เอาไปบวกกันต่อ ไม่ใช่ภาพสำเนาของไฟล์ — ส่วนการบอกว่าไฟล์มีช่องพังตรงไหนเป็น
 * หน้าที่ของด่าน 1 (`rules.ts`) ซึ่งทำงานกับไฟล์ดิบไปแล้วก่อนถึงตรงนี้
 *
 * ช่องรายวันเก็บเป็น **รหัส ไม่ใช่ตัวเลข** เพราะค่าที่อยู่ในนั้นคือรหัสสถานะของวัน
 * (ยังรอฝ่ายจัดส่งยืนยันความหมาย 17 จาก 24 รหัส) การแปลงเป็นตัวเลขตรงนี้คือการเดา
 */
export function toFacts(args: {
  itemId: string;
  period: string;
  parsed: ParsedFile;
}): Fact[] {
  const { itemId, period, parsed } = args;
  const item = findItem(itemId);
  const spec = templateOf(itemId);
  if (!item || !spec) return [];

  const payeeHeader = PAYEE_COLUMN[itemId] ?? DEFAULT_PAYEE_COLUMN;
  /* จับคู่หัวคอลัมน์ในสเปกกับตัวอักษรคอลัมน์ในไฟล์จริงครั้งเดียว แล้วใช้ซ้ำทุกแถว */
  const letters = new Map<string, string>();
  for (const header of spec.columns) {
    const letter = headerLetter(parsed.profile, header);
    if (letter) letters.set(header, letter);
  }

  const facts: Fact[] = [];

  parsed.rows.forEach((row, index) => {
    const cell = (header: string): string => {
      const letter = letters.get(header);
      return letter ? (row[letter] ?? "").trim() : "";
    };

    const dims: Partial<Record<DimensionKey, string>> = {};
    for (const header of spec.columns) {
      const role = columnRole(itemId, header);
      if (role?.role !== "มิติ") continue;
      const value = cell(header);
      /* ช่องแรกที่มีค่าชนะ — #22 มีทั้ง `แผนก…` สองช่องที่แปลงเป็นชื่อเดียวกัน */
      if (value && !dims[role.key]) dims[role.key] = value;
    }

    const personId = cell(DEFAULT_PAYEE_COLUMN);
    const payeeId = cell(payeeHeader) || personId;
    const base: FactBase = {
      period,
      itemId,
      owner: item.owner,
      sourceRow: parsed.rowNumbers[index] ?? 0,
      personId,
      payeeId,
      dims,
    };

    for (const header of spec.columns) {
      const role = columnRole(itemId, header);
      if (!role) continue;

      if (role.role === "ค่าที่วัด") {
        const value = toNumber(cell(header));
        if (value === null) continue;
        facts.push({
          ...base,
          kind: "ค่าที่วัด",
          measure: header,
          effect: role.effect,
          unit: role.unit,
          value,
        });
      } else if (role.role === "รายวัน") {
        const code = cell(header);
        if (!code) continue;
        facts.push({ ...base, kind: "รายวัน", day: role.day, code });
      }
    }
  });

  return facts;
}

/**
 * ยอดรวมต่อคนต่อทิศทางเงิน — รูปที่เอาไปทำไฟล์นำเข้า Tiger Soft ได้ตรง ๆ
 *
 * **นับเฉพาะช่องที่ลงสลิป** (`เพิ่ม`/`หัก`) ช่อง `อ้างอิง` ไม่เข้ายอด เพราะมันคือ
 * ตัวตั้งที่ใช้ตรวจความสมเหตุสมผล ไม่ใช่เงิน — และช่องรวมกับช่องย่อยในฟอร์มเดียวกัน
 * ถูกแยกไว้แล้วที่ `classify.ts` ตรงนี้จึงบวกซ้ำไม่ได้
 */
export function sumByPayee(facts: Fact[]): {
  payeeId: string;
  add: number;
  cut: number;
}[] {
  const totals = new Map<string, { add: number; cut: number }>();

  for (const fact of facts) {
    if (fact.kind !== "ค่าที่วัด" || fact.unit !== "บาท") continue;
    if (fact.effect !== "เพิ่ม" && fact.effect !== "หัก") continue;

    const bucket = totals.get(fact.payeeId) ?? { add: 0, cut: 0 };
    if (fact.effect === "เพิ่ม") bucket.add += fact.value;
    else bucket.cut += fact.value;
    totals.set(fact.payeeId, bucket);
  }

  return [...totals].map(([payeeId, t]) => ({ payeeId, ...t }));
}
