import { classify, MONEY_COLUMNS, postedColumns } from "./classify";
import { headerLetter, normalizeHeader, type ParsedFile } from "./parse";
import { DAY_CODES, hasDayGrid, templateOf } from "./template-spec";

/**
 * ด่าน 1 — ระบบตรวจไฟล์ให้ก่อนที่ HR จะมาตรวจ
 *
 * **`status` สำคัญเท่า `severity`** — `"pending"` คือกฎที่เรารู้ว่าต้องตรวจ แต่ยังไม่มี
 * คำตอบจากฝ่ายที่เป็นเจ้าของกติกา (ความหมายรหัสวัน 14 ตัว · ทิศทางเงิน 4 รายการ ·
 * Tiger Soft รับช่องรวมหรือช่องย่อย) กฎพวกนี้ **ขึ้นบนจอได้แต่บล็อกใครไม่ได้**
 * เพราะเดาแล้วบล็อกคือหยุดเงินเดือนด้วยกติกาที่เราแต่งขึ้นเอง และเดาแล้วปล่อยคือ
 * จ่ายผิดโดยไม่มีใครรู้ · `blocking` จึงเป็น `severity === "error" && status === "active"`
 * เท่านั้น และคำนวณที่นี่ที่เดียว อย่าคำนวณซ้ำในคอมโพเนนต์
 */
export type CheckSeverity = "error" | "warn" | "info";
export type CheckStatus = "active" | "pending";

export interface CheckResult {
  /** คีย์คงที่สำหรับอ้างอิงในเทสต์และในบันทึก — ไม่ใช่ข้อความบนจอ */
  id: string;
  severity: CheckSeverity;
  status: CheckStatus;
  title: string;
  detail: string;
  /** เลขแถวในไฟล์ที่เป็นต้นเหตุ — ว่างคือเป็นเรื่องของทั้งไฟล์ */
  rows?: string[];
  blocking: boolean;
}

export interface CheckTally {
  errors: number;
  warnings: number;
  pending: number;
  blocking: number;
}

const ROW_LIMIT = 20;

/** ค่าผิดพลาดของ Excel — ตัวอ่านไฟล์ส่งมาเป็นข้อความตามชื่อ ไม่ใช่ช่องว่าง */
const EXCEL_ERRORS = new Set(["#N/A", "#REF!", "#VALUE!", "#NAME?", "#DIV/0!", "#NULL!", "#NUM!"]);

const make = (
  r: Omit<CheckResult, "blocking">,
): CheckResult => ({ ...r, blocking: r.severity === "error" && r.status === "active" });

export function summarize(results: CheckResult[]): CheckTally {
  return {
    errors: results.filter((r) => r.severity === "error").length,
    warnings: results.filter((r) => r.severity === "warn").length,
    pending: results.filter((r) => r.status === "pending").length,
    blocking: results.filter((r) => r.blocking).length,
  };
}

const numberOf = (value: string): number | null => {
  const cleaned = value.replace(/,/g, "").replace(/\s/g, "").replace(/฿/g, "");
  /* ตัวเลขล้วนเท่านั้น — Number() ยอม "1e3" "0x10" "0b11" ซึ่งในช่องเงินคือเซลล์ที่ผิด */
  if (!/^[+-]?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
};

export function runChecks(itemId: string, parsed: ParsedFile): CheckResult[] {
  const spec = templateOf(itemId);
  const cls = classify(itemId);
  if (!spec || !cls) {
    return [
      make({
        id: "item.unknown",
        severity: "error",
        status: "active",
        title: "ไม่รู้จักรายการนี้",
        detail: `รายการ #${itemId} ไม่มีในทะเบียนรับข้อมูล — ตรวจว่าเลือกรายการถูกช่องหรือไม่`,
      }),
    ];
  }

  const out: CheckResult[] = [];
  const { profile, rows } = parsed;
  /* เลขแถวจริงที่ตัวอ่านบันทึกไว้ — ไม่มีทางคำนวณเองจาก index ได้ เพราะแถวว่างคั่นกลางถูกตัดทิ้ง */
  const rowNo = (i: number) => String(parsed.rowNumbers[i]);

  /* ── ไฟล์เปล่า ───────────────────────────────────────────────── */
  if (rows.length === 0) {
    out.push(
      make({
        id: "file.empty",
        severity: "error",
        status: "active",
        title: "ไฟล์ไม่มีแถวข้อมูล",
        detail: `อ่านชีต "${profile.sheetName}" แล้วไม่พบแถวใต้หัวตารางเลย — ส่งไฟล์ที่กรอกข้อมูลแล้ว`,
      }),
    );
    return out;
  }

  /* ── หัวคอลัมน์ตรงสเปกไหม ─────────────────────────────────────── */
  const have = new Set(profile.columns.map((c) => normalizeHeader(c.header)));
  const missing = spec.columns.filter((c) => !have.has(normalizeHeader(c)));
  if (missing.length) {
    out.push(
      make({
        id: "columns.missing",
        severity: "error",
        status: spec.confirmed ? "active" : "pending",
        title: `ขาดคอลัมน์ ${missing.length} ช่อง`,
        detail: spec.confirmed
          ? `ไฟล์นี้ต้องมีช่อง ${missing.join(" · ")} — ดาวน์โหลดแบบฟอร์มจากระบบแล้วกรอกบนฟอร์มนั้น`
          : `แบบฟอร์มของรายการนี้ยังเป็นร่าง (${spec.source}) จึงยังเทียบคอลัมน์แบบบังคับไม่ได้ — ช่องที่ยังไม่พบคือ ${missing.join(" · ")}`,
      }),
    );
  }

  const extra = profile.columns
    .filter((c) => c.header.trim() && !spec.columns.some((s) => normalizeHeader(s) === normalizeHeader(c.header)))
    .map((c) => c.header.trim());
  if (extra.length) {
    out.push(
      make({
        id: "columns.extra",
        severity: "warn",
        status: "active",
        title: `มีคอลัมน์เกินจากแบบฟอร์ม ${extra.length} ช่อง`,
        detail: `ช่องที่ไม่อยู่ในแบบฟอร์ม: ${extra.slice(0, 8).join(" · ")}${extra.length > 8 ? " …" : ""} — ระบบไม่อ่านช่องพวกนี้ ถ้าเป็นข้อมูลที่ต้องใช้ต้องแจ้งก่อน`,
      }),
    );
  }

  /* ── เงินเข้าใคร ──────────────────────────────────────────────── */
  const payeeLetter = headerLetter(profile, cls.payeeColumn);
  if (!payeeLetter) {
    out.push(
      make({
        id: "payee.column-missing",
        severity: "error",
        status: "active",
        title: `ไม่พบช่อง ${cls.payeeColumn}`,
        detail: `รายการนี้จับคู่คนที่ได้เงินด้วยช่อง "${cls.payeeColumn}" — ไม่มีช่องนี้ก็ไม่รู้ว่าเงินเข้าใคร`,
      }),
    );
  } else {
    const errored = rows
      .map((r, i) => (EXCEL_ERRORS.has(r[payeeLetter]?.trim() ?? "") ? rowNo(i) : null))
      .filter(Boolean) as string[];
    if (errored.length) {
      out.push(
        make({
          id: "payee.error-value",
          severity: "error",
          status: "active",
          title: `ช่อง ${cls.payeeColumn} เป็นค่าผิดพลาดของ Excel ${errored.length} แถว`,
          detail: `เซลล์เหล่านี้แสดง #N/A หรือค่าผิดพลาดอื่นแทนรหัส จับคู่กับใครไม่ได้ — แก้สูตรหรือกรอกรหัสจริงในไฟล์ก่อนส่งใหม่`,
          rows: errored.slice(0, ROW_LIMIT),
        }),
      );
    }

    const blank = rows.map((r, i) => (r[payeeLetter]?.trim() ? null : rowNo(i))).filter(Boolean) as string[];
    if (blank.length) {
      out.push(
        make({
          id: "payee.blank",
          severity: "error",
          status: "active",
          title: `ช่อง ${cls.payeeColumn} ว่าง ${blank.length} แถว`,
          detail: `ช่องอื่นว่างได้ (แปลว่าคนนั้นไม่มีรายการนั้น) แต่ "${cls.payeeColumn}" ว่างแปลว่าเงินก้อนนั้นไม่รู้จะเข้าใคร`,
          rows: blank.slice(0, ROW_LIMIT),
        }),
      );
    }

    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = row[payeeLetter]?.trim();
      if (key && !EXCEL_ERRORS.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const dup = [...counts.entries()].filter(([, n]) => n > 1);
    if (dup.length) {
      out.push(
        make({
          id: "payee.duplicate",
          severity: "warn",
          status: "active",
          title: `มีรหัสซ้ำ ${dup.length} รหัส`,
          detail: `${dup.slice(0, 5).map(([k, n]) => `${k} (${n} แถว)`).join(" · ")}${dup.length > 5 ? " …" : ""} — ซ้ำได้ถ้าคนเดียวมีหลายรายการจริง แต่ถ้าเป็นการกรอกซ้ำ เงินจะเข้าสองครั้ง`,
        }),
      );
    }
  }

  /* ── ช่องเงิน ─────────────────────────────────────────────────── */
  for (const { column, effect } of postedColumns(itemId)) {
    const letter = headerLetter(profile, column);
    if (!letter) {
      out.push(
        make({
          id: "money.column-missing",
          severity: "error",
          status: spec.confirmed ? "active" : "pending",
          title: `ไม่พบช่องเงิน ${column}`,
          detail: spec.confirmed
            ? `ไม่มีช่อง "${column}" ในไฟล์ ระบบจึงอ่านยอดเงินของรายการนี้ไม่ได้ — ดาวน์โหลดแบบฟอร์มจากระบบแล้วกรอกบนฟอร์มนั้น`
            : `แบบฟอร์มของรายการนี้ยังเป็นร่าง (${spec.source}) จึงยังบังคับไม่ได้ — แต่ถ้าไม่มีช่อง "${column}" ระบบจะอ่านยอดเงินของรายการนี้ไม่ได้`,
        }),
      );
      continue;
    }

    const values = rows.map((r, i) => ({ raw: r[letter]?.trim() ?? "", at: rowNo(i) }));
    const filled = values.filter((v) => v.raw);

    if (filled.length === 0) {
      out.push(
        make({
          id: "money.all-blank",
          severity: "warn",
          status: "active",
          title: `ช่อง ${column} ว่างทั้งคอลัมน์`,
          detail: "ถ้าเดือนนี้ไม่มีรายการจริงก็ถูกแล้ว — ยืนยันกับผู้ส่งสักครั้งก่อนรับเข้ารอบ",
        }),
      );
      continue;
    }

    const notNumber = filled.filter((v) => numberOf(v.raw) === null);
    if (notNumber.length) {
      out.push(
        make({
          id: "money.not-number",
          severity: "error",
          status: "active",
          title: `ช่อง ${column} มีค่าที่ไม่ใช่ตัวเลข ${notNumber.length} แถว`,
          detail: `ค่าตัวอย่าง: ${notNumber.slice(0, 3).map((v) => `"${v.raw}"`).join(" · ")} — ช่องเงินต้องเป็นตัวเลขล้วน ไม่ใส่หน่วยหรือหมายเหตุ`,
          rows: notNumber.slice(0, ROW_LIMIT).map((v) => v.at),
        }),
      );
    }

    /* **เครื่องหมายตรวจได้เฉพาะช่องที่ยืนยันทิศทางเงินแล้ว** — ช่องที่ยัง "รอยืนยัน"
       ไปโผล่ในกฎ pending ของงานที่ 5 ไม่ใช่ที่นี่ */
    if (effect === "เพิ่ม" || effect === "หัก") {
      const wrongSign = filled
        .map((v) => ({ ...v, n: numberOf(v.raw) }))
        .filter((v) => v.n !== null && v.n < 0);
      if (wrongSign.length) {
        out.push(
          make({
            id: "money.negative",
            severity: "error",
            status: "active",
            title: `ช่อง ${column} มีค่าติดลบ ${wrongSign.length} แถว`,
            detail:
              effect === "เพิ่ม"
                ? `"${column}" เป็นเงินเพิ่ม ค่าติดลบแปลว่ากรอกผิดช่อง — ถ้าต้องการหักเงินให้ใช้ช่องหักของรายการนั้น`
                : `"${column}" เป็นเงินหักอยู่แล้ว กรอกเป็นจำนวนบวก ไม่ต้องใส่เครื่องหมายลบ ไม่งั้นจะกลายเป็นจ่ายเพิ่ม`,
            rows: wrongSign.slice(0, ROW_LIMIT).map((v) => v.at),
          }),
        );
      }
    }
  }

  /* ── ตารางสถานะรายวัน ────────────────────────────────────────────
     รหัสที่ไม่อยู่ในชุด 24 ตัวเลย = ผิดแน่ บล็อกได้ · รหัสที่อยู่ในชุดแต่ `meaning`
     ยังว่าง = **เรายังไม่รู้ว่าวันนั้นได้เงินหรือไม่** ห้ามบล็อกและห้ามปล่อยเงียบ
     ต้องขึ้นบนจอว่ารออะไรจากใคร */
  if (hasDayGrid(spec.columns)) {
    const known = new Map(DAY_CODES.map((d) => [d.code.toUpperCase(), d.meaning]));
    const dayLetters = spec.columns
      .filter((c) => /^\d+$/.test(c))
      .map((c) => headerLetter(profile, c))
      .filter(Boolean) as string[];

    const unknown = new Map<string, string[]>();
    const pending = new Set<string>();

    rows.forEach((row, i) => {
      for (const letter of dayLetters) {
        const code = row[letter]?.trim();
        if (!code) continue;
        const meaning = known.get(code.toUpperCase());
        if (meaning === undefined) {
          const at = unknown.get(code) ?? [];
          if (at.length < 3) at.push(rowNo(i));
          unknown.set(code, at);
        } else if (!meaning) {
          pending.add(code);
        }
      }
    });

    if (unknown.size) {
      out.push(
        make({
          id: "daycode.unknown",
          severity: "error",
          status: "active",
          title: `มีรหัสวันที่ไม่รู้จัก ${unknown.size} รหัส`,
          detail: `${[...unknown.keys()].slice(0, 8).join(" · ")} — ไม่อยู่ในชุดรหัส 24 ตัวที่ระบบรู้จัก · ระวังอย่าใช้รหัสของเครื่องลงเวลา TA100 ปนมา เพราะ "A" ของสองชุดแปลไม่เหมือนกัน`,
          rows: [...unknown.values()].flat().slice(0, ROW_LIMIT),
        }),
      );
    }

    if (pending.size) {
      out.push(
        make({
          id: "daycode.meaning-pending",
          severity: "warn",
          status: "pending",
          title: `มีรหัสวันที่ยังไม่ยืนยันความหมาย ${pending.size} รหัส`,
          detail: `${[...pending].join(" · ")} — ยังรอฝ่ายจัดส่งยืนยันว่าวันนั้นนับเป็นวันทำงานหรือไม่ · ระบบจึงยังคิดวันทำงานจากไฟล์นี้ให้ไม่ได้ และไม่บล็อกการรับเข้ารอบ`,
        }),
      );
    }
  }

  /* ── ทิศทางเงินที่ยังไม่ยืนยัน ──────────────────────────────────── */
  const WAITING_OWNER: Record<string, string> = {
    "14": "บัญชีกรุงเทพ",
    "15": "บัญชีกรุงเทพ",
    "17": "ยานยนต์",
    "18": "ยานยนต์",
  };
  const unconfirmed = Object.entries(MONEY_COLUMNS[itemId] ?? {})
    .filter(([, effect]) => effect === "รอยืนยัน")
    .map(([column]) => column);
  if (unconfirmed.length) {
    out.push(
      make({
        id: "money.effect-pending",
        severity: "warn",
        status: "pending",
        title: "ยังไม่ยืนยันว่าเงินก้อนนี้เพิ่มหรือหัก",
        detail: `ช่อง ${unconfirmed.join(" · ")} ยังรอ${WAITING_OWNER[itemId] ?? "ฝ่ายเจ้าของข้อมูล"}ยืนยันว่าเป็นเงินเพิ่มหรือเงินหัก — ระบบจึงตรวจเครื่องหมายให้ไม่ได้ ต้องให้คนดูยอดเองก่อนรับเข้ารอบ`,
      }),
    );
  }

  /* ── รูปแบบที่ Tiger Soft รับ ────────────────────────────────────── */
  const TIGERSOFT_PENDING: Record<string, string> = {
    "08": "เงินรางวัลมี 4 ช่องย่อย",
    "23": "ค่าน้ำกับค่าไฟแยกกันสองช่อง",
  };
  if (TIGERSOFT_PENDING[itemId]) {
    out.push(
      make({
        id: "tigersoft.shape-pending",
        severity: "info",
        status: "pending",
        title: "ยังไม่เคาะว่าจะส่งเข้า Tiger Soft เป็นช่องรวมหรือช่องย่อย",
        detail: `${TIGERSOFT_PENDING[itemId]} — รอ HR ค่าจ้างและสวัสดิการเคาะว่า Tiger Soft รับยอดรวมหรือรับแยกช่อง · ไม่กระทบการรับเข้ารอบ แต่กระทบตอนทำไฟล์นำเข้า`,
      }),
    );
  }

  return out;
}
