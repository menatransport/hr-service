import type { Worksheet } from "exceljs";

/**
 * ตาราง → ไฟล์ Excel **ฝั่งเบราว์เซอร์** — ส่งออก “สิ่งที่เห็นอยู่” ของตารางที่กรอง/เรียงแล้ว
 *
 * ใช้กับหน้าที่ถือข้อมูลทั้งชุดไว้ฝั่ง client อยู่แล้ว (ติดตามพนักงานใหม่ · ผู้สมัคร · ทะเบียน พจส.)
 * จึงไม่ต้องมีเส้น API ส่งออกแยกต่อหน้า · `exceljs` ถูก `import()` ตอนกดเท่านั้น ไม่เข้า bundle แรก
 *
 * จัดเซลล์ชุดเดียวกับไฟล์คิวคำร้อง (`lib/case-export.ts`): แถว 1 = หัวตารางจริง (Pivot/`Ctrl+T`
 * จับช่วงได้ทันที) · หัวเขียวธีม · แถวคู่อ่อน · เส้นบาง · ตรึงหัว + คอลัมน์แรก · AutoFilter ·
 * **วันที่/ตัวเลขเป็นชนิดจริง** เรียง/SUM ได้เลย · ชีต “ข้อมูลไฟล์” บอกว่าไฟล์นี้คือชุดไหน
 */

export type XlsxValue = string | number | Date | null | undefined;

/** ชนิดของคอลัมน์ — ตัดสิน numFmt + การจัดวางในช่อง */
export type XlsxKind = "text" | "code" | "date" | "datetime" | "int" | "decimal" | "status";

/** สีตัวหนังสือรายช่อง — ชุดเดียวกับสีสถานะบนจอ */
export type XlsxTone = "alert" | "warn" | "ok" | "mut";

export interface XlsxColumn<T> {
  header: string;
  /** ความกว้างเป็นจำนวนตัวอักษร */
  width: number;
  value: (row: T) => XlsxValue;
  kind?: XlsxKind;
  tone?: (row: T) => XlsxTone | null;
}

/** ชีตข้อมูล — ไฟล์มีชีตข้อมูลชีตเดียว + ชีต “ข้อมูลไฟล์” (Bew: ชีตเดียวจัดการง่ายกว่า) */
export interface XlsxSheet<T> {
  /** ชื่อชีต (≤ 31 ตัวอักษร) */
  sheet: string;
  columns: XlsxColumn<T>[];
  rows: T[];
}

export interface XlsxExport<T> extends XlsxSheet<T> {
  /** หัวเรื่องในชีต “ข้อมูลไฟล์” เช่น `ติดตามพนักงานใหม่ · ฝึกงาน` */
  title: string;
  /** คำอธิบายตัวกรองที่ใช้อยู่ — ว่าง = ไม่ได้กรอง */
  filter?: string;
  /** จำนวนทั้งหมดก่อนกรอง — ให้เห็นว่าไฟล์เป็นส่วนไหนของทั้งหมด */
  total?: number;
}

/* ------------------------------------------------------------------ จานสี (ARGB) */

const GREEN = "FF0F766E";
const GREEN_DEEP = "FF0B5A54";
const GREEN_MIST = "FFF4F9F8";
const WHITE = "FFFFFFFF";
const INK = "FF15201D";
const MUT = "FF65756F";
const LINE = "FFD9E4E1";

const TONE_INK: Record<XlsxTone, string> = {
  alert: "FFB91C1C",
  warn: "FFC2410C",
  ok: GREEN,
  mut: MUT,
};

const FONT = "Tahoma";

/**
 * วันที่แบบ **พ.ศ.** (`[$-107041E]` = ภาษาไทย + ปฏิทินพุทธ) — ตรงกับที่จอโชว์ · ค่าในช่องยังเป็น
 * วันที่จริงของ Excel เรียง/กรองตามวันได้ปกติ
 */
const DATE_FMT = "[$-107041E]dd/mm/yyyy";
const DATETIME_FMT = "[$-107041E]dd/mm/yyyy hh:mm";

const NUM_FMT: Partial<Record<XlsxKind, string>> = {
  date: DATE_FMT,
  datetime: DATETIME_FMT,
  int: "#,##0",
  decimal: "#,##0.00",
  code: "@",
};

const CENTER: ReadonlySet<XlsxKind> = new Set(["code", "date", "datetime", "int", "decimal", "status"]);

const solid = (argb: string) => ({ type: "pattern", pattern: "solid", fgColor: { argb } }) as const;
const hair = { style: "thin", color: { argb: LINE } } as const;
const grid = { top: hair, left: hair, bottom: hair, right: hair } as const;

/* ------------------------------------------------------------------ วันที่ */

const BANGKOK_MS = 7 * 60 * 60 * 1000;

/**
 * ค่าวันที่ของระบบ → `Date` ที่ฟิลด์ UTC คือเวลาไทย (ExcelJS แปลงจาก `getTime()` ตรง ๆ ไม่สนโซน)
 *
 * - `YYYY-MM-DD` = วันล้วน ไม่มีโซน → เที่ยงคืนของวันนั้นเป๊ะ
 * - ISO เต็ม (มี `Z`/offset) → เลื่อน +7 ชม.
 * - อ่านไม่ออก/ว่าง → `null` (ช่องว่าง ไม่ใช่ 01/01/1900)
 */
export function xlsxDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (day) return new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3])));
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : new Date(d.getTime() + BANGKOK_MS);
}

/** วันนี้ตามเวลาไทย `2026-10-20` — ต่อท้ายชื่อไฟล์ เรียงในโฟลเดอร์ได้ */
function stamp(now: Date): string {
  return new Date(now.getTime() + BANGKOK_MS).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ ชีต */

function buildDataSheet<T>(sheet: Worksheet, { columns, rows }: XlsxSheet<T>) {
  sheet.columns = columns.map((c) => ({ width: c.width }));

  const header = sheet.addRow(columns.map((c) => c.header));
  /* หัวยาว (คำถามในฟอร์มสมัคร) ตัดบรรทัดในช่อง — สูงพอให้เห็นครบ ~3 บรรทัด ไม่ใช่ถูกตัดหาย */
  const lines = Math.max(1, ...columns.map((c) => Math.ceil(c.header.length / Math.max(6, c.width - 2))));
  header.height = Math.min(60, Math.max(30, lines * 15));
  header.eachCell((cell) => {
    cell.fill = solid(GREEN);
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: WHITE } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: GREEN_DEEP } },
      left: { style: "thin", color: { argb: GREEN_DEEP } },
      bottom: { style: "medium", color: { argb: GREEN_DEEP } },
      right: { style: "thin", color: { argb: GREEN_DEEP } },
    };
  });

  rows.forEach((item, i) => {
    const row = sheet.addRow(
      columns.map((c) => {
        const v = c.value(item);
        /* ขีด “—” ของจอ = ไม่มีค่า → ช่องว่างจริง (AutoFilter รวมเป็น “(ว่าง)” ช่องเดียว) */
        return v === undefined || v === "" || v === "—" ? null : v;
      }),
    );
    row.height = 19;
    const zebra = i % 2 === 1;

    columns.forEach((column, index) => {
      const cell = row.getCell(index + 1);
      const kind = column.kind ?? "text";
      const tone = column.tone?.(item) ?? null;
      cell.font = {
        name: FONT,
        size: 10,
        bold: kind === "status" && tone !== null && tone !== "mut",
        color: { argb: tone ? TONE_INK[tone] : INK },
      };
      cell.alignment = { vertical: "middle", horizontal: CENTER.has(kind) ? "center" : "left" };
      cell.border = grid;
      if (zebra) cell.fill = solid(GREEN_MIST);
      const fmt = NUM_FMT[kind];
      if (fmt) cell.numFmt = fmt;
    });
  });

  sheet.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, rows.length + 1), column: columns.length },
  };
}

function buildInfoSheet<T>(sheet: Worksheet, spec: XlsxExport<T>, by: string, at: Date) {
  sheet.columns = [{ width: 22 }, { width: 60 }];

  const title = sheet.addRow([spec.title]);
  title.height = 30;
  title.getCell(1).font = { name: FONT, size: 15, bold: true, color: { argb: GREEN } };
  title.getCell(1).alignment = { vertical: "middle" };

  const facts: [string, XlsxValue, string?][] = [
    ["ข้อมูล ณ", new Date(at.getTime() + BANGKOK_MS), DATETIME_FMT],
    ["ผู้ส่งออก", by],
    ["ตัวกรอง", spec.filter?.trim() || "ไม่ได้กรอง"],
    ["จำนวนในไฟล์", spec.rows.length, "#,##0"],
    ...(spec.total !== undefined ? ([["จำนวนทั้งหมด", spec.total, "#,##0"]] as [string, XlsxValue, string][]) : []),
  ];
  for (const [label, value, fmt] of facts) {
    if (!value && value !== 0) continue;
    const row = sheet.addRow([label, value]);
    row.height = 19;
    row.getCell(1).font = { name: FONT, size: 10, color: { argb: MUT } };
    const v = row.getCell(2);
    v.font = { name: FONT, size: 10, bold: true, color: { argb: INK } };
    v.alignment = { vertical: "middle", horizontal: "left" };
    if (fmt) v.numFmt = fmt;
  }
}

/* ------------------------------------------------------------------ ประกอบ + ดาวน์โหลด */

/**
 * สร้างไฟล์แล้วสั่งเบราว์เซอร์เซฟ — คืนชื่อไฟล์ที่เซฟ
 * `name` = ชื่อไฟล์ไม่มีวันที่/นามสกุล เช่น `ผู้สมัคร` → `ผู้สมัคร-2026-10-20.xlsx`
 */
export async function downloadXlsx<T>(name: string, spec: XlsxExport<T>, by = ""): Promise<string> {
  /* `exceljs` เป็น CJS — `import()` ได้ `Workbook` ตรง ๆ หรือซ้อนอยู่ใน `default` แล้วแต่ bundler */
  const mod = await import("exceljs");
  const Workbook = mod.Workbook ?? (mod as unknown as { default: typeof mod }).default.Workbook;
  const at = new Date();

  const workbook = new Workbook();
  workbook.creator = "HR Service";
  workbook.created = at;

  const used = new Set<string>();
  const addSheet = (name: string) => {
    /* ชื่อชีตห้ามซ้ำ/ห้ามมี : \ / ? * [ ] และยาวไม่เกิน 31 */
    let safe = name.replace(/[:\\/?*[\]]/g, " ").slice(0, 31) || "Sheet";
    for (let i = 2; used.has(safe); i++) safe = `${safe.slice(0, 28)} ${i}`;
    used.add(safe);
    return workbook.addWorksheet(safe, {
      properties: { defaultRowHeight: 19 },
      pageSetup: {
        orientation: "landscape",
        paperSize: 9,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        printTitlesRow: "1:1",
        margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
      },
      headerFooter: { oddFooter: `&L${spec.title}&Rหน้า &P / &N` },
    });
  };

  buildDataSheet(addSheet(spec.sheet), spec);
  buildInfoSheet(addSheet("ข้อมูลไฟล์"), spec, by, at);

  const buffer = await workbook.xlsx.writeBuffer();
  const file = `${name}-${stamp(at)}.xlsx`;

  const href = URL.createObjectURL(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
  );
  const link = document.createElement("a");
  link.href = href;
  link.download = file;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
  return file;
}
