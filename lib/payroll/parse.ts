import { Workbook, type CellValue, type Worksheet } from "exceljs";

import type { BadCell, CellType, ColumnProfile, FileProfile } from "./profile";

/**
 * อ่าน `.xlsx` จริงแล้วคืนผลหน้าตาเดียวกับ `SAMPLE_PROFILE` เป๊ะ — **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 *
 * ทำตามกติกาสามข้อที่ `profile.ts` ประกาศไว้ ไม่เปลี่ยน:
 * 1. อ่านครบทุกแถว ไม่สุ่ม
 * 2. ชนิดข้อมูลตัดสินจากเสียงข้างมาก ที่เหลือคือ `mismatch`
 * 3. เซลล์ที่มีแต่เว้นวรรคนับเป็นช่องว่าง
 *
 * คืน `rows` ติดมาด้วยเพราะด่านตรวจ (`rules.ts`) ต้องดูค่าในเซลล์จริง ไม่ใช่แค่ยอดรวม
 * รายคอลัมน์ — เช่น "เงินเพิ่มติดลบ" หรือ "รหัสวันที่ไม่รู้จัก" ดูจากตัวเลขสรุปไม่ได้
 */
export interface ParsedFile {
  profile: FileProfile;
  /** คีย์เป็นตัวอักษรคอลัมน์ ตรงกับ `ColumnProfile.letter` · ค่าเป็นข้อความที่ trim แล้ว */
  rows: Record<string, string>[];
}

/** หัวคอลัมน์ในไฟล์จริงมีช่องว่างเกินและ non-breaking space ปนมาเสมอ */
export const normalizeHeader = (value: string): string =>
  value.replace(/ /g, " ").replace(/\s+/g, "").trim();

export const headerLetter = (
  profile: FileProfile,
  header: string,
): string | undefined =>
  profile.columns.find((c) => normalizeHeader(c.header) === normalizeHeader(header))
    ?.letter;

/** จำนวนเซลล์ที่ไม่ว่างขั้นต่ำที่ถือว่าแถวนั้นเป็นหัวตาราง */
const HEADER_MIN_CELLS = 2;
/** มองหาหัวตารางในสิบแถวแรกเท่านั้น — ลึกกว่านั้นคือไฟล์คนละเรื่อง */
const HEADER_SEARCH_ROWS = 10;

const text = (value: CellValue): string => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  /* **ห้ามปล่อยให้เป็น 123456.0 หรือ 1.23456e+5** — รหัสพนักงานที่ Excel เก็บเป็น
     ตัวเลขต้องกลายเป็นข้อความที่จับคู่ได้ ไม่งั้นเสียทั้งไฟล์ · `String(123456)` ได้
     `"123456"` อยู่แล้ว ส่วนทศนิยมจริงปล่อยให้เป็นทศนิยมตามเดิม */
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    const rich = value as {
      text?: unknown;
      result?: unknown;
      error?: unknown;
      richText?: { text: string }[];
    };
    /* ค่าผิดพลาดของสูตร (#N/A ฯลฯ) ต้องเห็นเป็นค่า ไม่ใช่ช่องว่าง — มันไม่ใช่ศูนย์และไม่ใช่
       ค่าว่าง ด่านตรวจต้องจับเป็น "ผิดชนิด" ไม่ใช่ "ว่าง รอยืนยัน" */
    if (typeof rich.error === "string") return rich.error;
    if (Array.isArray(rich.richText)) return rich.richText.map((t) => t.text).join("");
    if (typeof rich.text === "string") return rich.text;
    if (rich.result !== undefined) return text(rich.result as CellValue);
    return "";
  }
  return String(value);
};

const typeOf = (raw: CellValue, value: string): CellType => {
  if (!value.trim()) return "empty";
  /* เซลล์สูตรเก็บเป็น {formula, result} — ตัดสินชนิดจากผลลัพธ์ เหมือนที่ text() อ่านผลลัพธ์ */
  if (raw && typeof raw === "object" && !(raw instanceof Date) && "result" in raw) {
    return typeOf((raw as { result?: CellValue }).result ?? null, value);
  }
  if (raw instanceof Date) return "date";
  if (typeof raw === "number") return "number";
  /* ตัวเลขที่เก็บเป็นข้อความยังนับเป็นข้อความ — ความต่างนี้คือสิ่งที่ด่านตรวจต้องจับ */
  return "text";
};

export async function profileWorkbook(
  data: ArrayBuffer,
  fileName: string,
): Promise<ParsedFile> {
  const wb = new Workbook();
  try {
    await wb.xlsx.load(data);
  } catch {
    throw new Error(
      "อ่านไฟล์ไม่ได้ — ต้องเป็นไฟล์ Excel (.xlsx) ที่บันทึกจาก Excel จริง ไม่ใช่ไฟล์ที่เปลี่ยนนามสกุลมา",
    );
  }

  const sheets = wb.worksheets;
  if (!sheets.length) throw new Error("อ่านไฟล์ไม่ได้ — ไฟล์นี้ไม่มีชีตข้อมูลเลย");

  /* ชีตแรกที่มีหัวตารางจริง ไม่ใช่ชีตแรกเฉย ๆ — ไฟล์จริงมักมีชีตปกหรือชีตหมายเหตุ */
  let sheet = sheets[0];
  let headerRow = 0;
  for (const ws of sheets) {
    const found = findHeaderRow(ws);
    if (found) {
      sheet = ws;
      headerRow = found;
      break;
    }
  }
  /* ไฟล์คอลัมน์เดียว (เช่น รายชื่อรหัสพนักงานล้วน ๆ) ไม่มีแถวไหนมีสองเซลล์ — ถอยมาใช้
     แถวแรกที่มีค่า โดยต้องมีแถวข้อมูลตามหลังอย่างน้อยหนึ่งแถว ไม่งั้นเป็นแค่หัวเรื่อง */
  if (!headerRow) {
    for (const ws of sheets) {
      const found = findSingleColumnHeaderRow(ws);
      if (found) {
        sheet = ws;
        headerRow = found;
        break;
      }
    }
  }
  if (!headerRow) {
    throw new Error(
      `อ่านไฟล์ไม่ได้ — หาหัวตารางในสิบแถวแรกของทุกชีตไม่เจอ (ไฟล์ "${fileName}")`,
    );
  }

  const headers = new Map<string, string>();
  sheet.getRow(headerRow).eachCell({ includeEmpty: false }, (cell) => {
    const letter = String(cell.address).replace(/\d+/g, "");
    headers.set(letter, text(cell.value).trim());
  });

  /* เก็บทุกคอลัมน์ที่ "มีหัว หรือมีข้อมูล" — คอลัมน์ที่ไม่มีหัวแต่มีข้อมูลต้องโผล่
     ให้เห็นในสถานะ skip ไม่ใช่หายไปเงียบ ๆ */
  const letters = new Set(headers.keys());
  const rows: Record<string, string>[] = [];
  const raws: Record<string, CellValue>[] = [];
  /* เลขแถวจริงในไฟล์ของแต่ละแถวข้อมูล — แถวว่างคั่นกลางถูกตัดทิ้ง index ใน rows จึงไม่ใช่เลขแถว */
  const rowNumbers: number[] = [];

  for (let r = headerRow + 1; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const asText: Record<string, string> = {};
    const asRaw: Record<string, CellValue> = {};
    let any = false;
    row.eachCell({ includeEmpty: false }, (cell) => {
      const letter = String(cell.address).replace(/\d+/g, "");
      const value = text(cell.value);
      letters.add(letter);
      asRaw[letter] = cell.value;
      asText[letter] = value.trim();
      /* เซลล์ที่มีแต่เว้นวรรคทำให้แถวนับเป็นแถวข้อมูล (แล้วนับเป็นช่องว่างของคอลัมน์)
         ไม่งั้นแถวที่ขาดรหัสพนักงานจะหายเงียบ ๆ แทนที่จะถูกชี้ */
      if (cell.value !== null && cell.value !== undefined && cell.value !== "") any = true;
    });
    /* แถวว่างทั้งแถวไม่นับเป็นข้อมูล — ไฟล์ที่ส่งกันมีแถวว่างคั่นกลางเป็นปกติ */
    if (any) {
      rows.push(asText);
      raws.push(asRaw);
      rowNumbers.push(r);
    }
  }

  const ordered = [...letters].sort(byColumnLetter);
  const columns = ordered.map((letter) =>
    profileColumn(letter, headers.get(letter) ?? "", rows, raws, rowNumbers),
  );

  return {
    profile: {
      fileName,
      sheetName: sheet.name,
      sheetCount: sheets.length,
      headerRow,
      totalRows: rows.length,
      columns,
    },
    rows,
  };
}

function findHeaderRow(ws: Worksheet): number {
  const limit = Math.min(ws.rowCount, HEADER_SEARCH_ROWS);
  for (let r = 1; r <= limit; r += 1) {
    let filled = 0;
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
      if (text(cell.value).trim()) filled += 1;
    });
    if (filled >= HEADER_MIN_CELLS) return r;
  }
  return 0;
}

function findSingleColumnHeaderRow(ws: Worksheet): number {
  const limit = Math.min(ws.rowCount, HEADER_SEARCH_ROWS);
  const filled = (r: number): boolean => {
    let any = false;
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
      if (text(cell.value).trim()) any = true;
    });
    return any;
  };
  for (let r = 1; r <= limit; r += 1) {
    if (!filled(r)) continue;
    for (let next = r + 1; next <= ws.rowCount; next += 1) {
      if (filled(next)) return r;
    }
    return 0;
  }
  return 0;
}

/** `AA` มาหลัง `Z` — เรียงด้วยความยาวก่อนแล้วค่อยตัวอักษร */
const byColumnLetter = (a: string, b: string): number =>
  a.length === b.length ? a.localeCompare(b) : a.length - b.length;

/** ชี้แถวที่ผิดไม่เกินห้าตัวอย่าง แล้วปิดท้ายด้วย `…` ตามรูปแบบของ `BadCell` */
const BAD_CELL_LIMIT = 5;

function profileColumn(
  letter: string,
  header: string,
  rows: Record<string, string>[],
  raws: Record<string, CellValue>[],
  rowNumbers: number[],
): ColumnProfile {
  const counts: Record<CellType, number> = { number: 0, text: 0, date: 0, empty: 0 };
  const seen = new Set<string>();

  rows.forEach((row, i) => {
    const value = row[letter] ?? "";
    counts[typeOf(raws[i][letter], value)] += 1;
    if (value) seen.add(value);
  });

  const nonEmpty = counts.number + counts.text + counts.date;
  const type: CellType =
    nonEmpty === 0
      ? "empty"
      : (["number", "date", "text"] as CellType[]).reduce((best, t) =>
          counts[t] > counts[best] ? t : best,
        "text");

  const valid = type === "empty" ? 0 : counts[type];
  const mismatch = nonEmpty - valid;

  const badCells: BadCell[] = [];
  if (mismatch > 0) {
    rows.forEach((row, i) => {
      if (badCells.length >= BAD_CELL_LIMIT) return;
      const value = row[letter] ?? "";
      const actual = typeOf(raws[i][letter], value);
      if (value && actual !== type) {
        badCells.push({
          row: String(rowNumbers[i]),
          value,
          reason: `คอลัมน์นี้เป็น${type === "number" ? "ตัวเลข" : type === "date" ? "วันที่" : "ข้อความ"} แต่ค่านี้ไม่ใช่`,
        });
      }
    });
    if (mismatch > badCells.length) {
      badCells.push({ row: "…", value: `และอีก ${mismatch - badCells.length} แถว`, reason: "" });
    }
  }

  const samples = [...seen].slice(0, 3);

  return {
    letter,
    header,
    type,
    state: stateOf(header, nonEmpty, mismatch, rows.length),
    valid,
    mismatch,
    empty: rows.length - nonEmpty,
    distinct: seen.size,
    samples,
    ...(mismatch > 0 ? { issue: `มีค่าผิดชนิด ${mismatch} แถว`, badCells } : {}),
  };
}

/** ว่างเกินครึ่ง = ควรดู · ไม่มีหัวหรือว่างทั้งคอลัมน์ = ข้าม · ผิดชนิด = ต้องดู */
function stateOf(
  header: string,
  nonEmpty: number,
  mismatch: number,
  total: number,
): ColumnProfile["state"] {
  if (!header.trim() || nonEmpty === 0) return "skip";
  if (mismatch > 0) return "error";
  if (total > 0 && nonEmpty / total < 0.5) return "warn";
  return "ok";
}
