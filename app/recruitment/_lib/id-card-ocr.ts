import { isValidThaiNationalId } from "@/app/recruitment/_lib/form";

/**
 * อ่านเลขบัตรประชาชนกับวันบัตรหมดอายุจากรูปถ่ายบัตรประชาชนไทย — **ฝั่งเบราว์เซอร์**
 *
 * ใช้ tesseract.js อ่านข้อความทั้งใบ แล้วค่อยใช้ regex แกะเอาสองค่าออกมา
 * (`parseThaiIdCardText`) · เรียกจากสองที่: ช่องแนบบัตรในฟอร์มสมัคร และช่อง
 * “บัตรประชาชนหมดอายุ” บนหน้าประวัติ พจส.
 *
 * **อ่านภาษาอังกฤษก่อน ภาษาไทยเมื่อจำเป็น** — ลองกับบัตรจริงแล้ว โมเดล `eng`
 * อ่านเลขบัตร 13 หลักแม่นกว่า `tha+eng` ชัดเจน แต่บัตรบางรุ่น**ไม่พิมพ์วันหมดอายุ
 * ภาษาอังกฤษ** และรูปมือถือมักทำบรรทัด `21 Mar. 2025` หายทั้งบรรทัด ขณะที่บรรทัดไทย
 * `21 มี.ค. 2568` ยังอ่านออก · รอบภาษาไทย (โมเดลราว 1 MB) จึงรันเฉพาะตอนรอบแรก
 * หาวันหมดอายุไม่เจอ
 *
 * **รูปไม่ออกจากเครื่อง** — ตัวที่โหลดจาก CDN มีแค่ตัวโปรแกรมกับโมเดลภาษา ส่วนรูป
 * บัตรถูกอ่านใน Web Worker บนเครื่องผู้ใช้เอง · ผลที่ได้เป็นแค่ค่าตั้งต้นให้คนตรวจ
 * ทุกที่ที่เรียกต้องแสดงให้แก้ได้ ห้ามบันทึกทับเงียบ ๆ
 */

export interface IdCardReading {
  /** ตัวเลขล้วน 13 หลัก · `""` = หาไม่เจอ */
  nationalId: string;
  /** เลขหลักสุดท้ายตรงสูตร — `false` แปลว่าอ่านได้ครบหลักแต่น่าจะมีหลักที่อ่านเพี้ยน */
  nationalIdValid: boolean;
  /** `YYYY-MM-DD` (ค.ศ.) · `""` = หาไม่เจอหรือบัตรตลอดชีพ */
  expiry: string;
  /** บัตรพิมพ์ว่า LIFELONG / ตลอดชีพ */
  lifelong: boolean;
}

/* ---------------------------------------------------------------- แกะข้อความ */

/** ตัวอักษรที่ OCR ชอบอ่านสลับกับตัวเลข — ใช้เฉพาะกับก้อนที่หน้าตาเป็นเลขบัตรอยู่แล้ว */
const DIGIT_LOOKALIKE: Record<string, string> = {
  O: "0", o: "0", D: "0", Q: "0",
  I: "1", l: "1", "|": "1", i: "1", "!": "1",
  Z: "2", z: "2",
  S: "5", s: "5",
  G: "6", b: "6",
  B: "8",
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function findNationalId(text: string): { id: string; valid: boolean } {
  /* ก้อนที่ขึ้นต้นด้วยตัวเลข (หรือตัวที่หน้าตาเหมือน) แล้วคั่นด้วยช่องว่าง/ขีดได้
     — บัตรพิมพ์เป็น `1 2345 67890 12 3` · ตัดคำภาษาอังกฤษทิ้งก่อน ไม่งั้นตัว `D`
     ของ `Date` ที่ตามหลังเลขบัตรจะถูกนับเป็นเลข 0 ต่อท้ายไปอีกหลัก */
  const words = text.replace(/\b[A-Za-z]{2,}\b/g, "  ");
  const chunks = words.match(/[0-9ODQIl|i!ZzSsGbB](?:[ \-.]{0,2}[0-9ODQIl|i!ZzSsGbB]){12,20}/g) ?? [];

  let fallback = "";
  for (const chunk of chunks) {
    /* นับเลขจริงก่อนแปลง — ก้อนที่ส่วนใหญ่เป็นตัวอักษรคือคำภาษาอังกฤษ ไม่ใช่เลขบัตร */
    if ((chunk.match(/\d/g)?.length ?? 0) < 9) continue;

    const digits = [...chunk].map((c) => DIGIT_LOOKALIKE[c] ?? c).join("").replace(/\D/g, "");
    for (let start = 0; start + 13 <= digits.length; start += 1) {
      const candidate = digits.slice(start, start + 13);
      if (isValidThaiNationalId(candidate)) return { id: candidate, valid: true };
    }
    if (!fallback && digits.length >= 13) fallback = digits.slice(0, 13);
  }

  return { id: fallback, valid: false };
}

/**
 * เดือนภาษาไทยจากสองตัวแรก (ตัดจุดทิ้งแล้ว) — OCR อ่านตัวท้ายเพี้ยนบ่อย
 * (`ส.ค.` → `สต.` · `ธ.ค.` → `ธุค.`) แต่ตัวแรกกับตัวที่สองแยกเดือนได้ครบทั้งสิบสอง
 * · รับชื่อเต็มด้วย (`มกราคม`) เพราะใบขับขี่พิมพ์เดือนเต็ม ต่างจากบัตรประชาชน
 */
function thaiMonth(raw: string): number | null {
  const m = raw.replace(/[.\s]/g, "");
  const second = m[1] ?? "";
  switch (m[0]) {
    case "ม":
      return second === "ี" ? 3 : second === "ิ" ? 6 : 1; // มี.ค. · มิ.ย. · ม.ค./มกราคม
    case "ก":
      // ก.พ./กุมภาพันธ์ · ก.ย./กันยายน · ก.ค./กรกฎาคม
      return second === "พ" || second === "ุ" ? 2 : second === "ย" || second === "ั" ? 9 : 7;
    case "เ":
      return 4; // เม.ย.
    case "พ":
      // พ.ย./พฤศจิกายน · พ.ค./พฤษภาคม — ชื่อเต็มขึ้นต้น `พฤ` ทั้งคู่ ต้องดูตัวที่สาม
      if (second === "ฤ") return m[2] === "ศ" ? 11 : 5;
      return second === "ย" ? 11 : 5;
    case "ส":
      return 8;
    case "ต":
      return 10;
    case "ธ":
      return 12;
    default:
      return null;
  }
}

interface FoundDate {
  iso: string;
  at: number;
  thai: boolean;
}

function toIso(day: number, month: number, year: number): string | null {
  if (year > 2400) year -= 543; // ปี พ.ศ.
  if (year < 1900 || year > 2200) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

function findDates(text: string): FoundDate[] {
  const found: FoundDate[] = [];

  /* `21 Mar. 2025` (บัตรประชาชน) · `21 March 2025` (ใบขับขี่พิมพ์เดือนเต็ม) */
  for (const m of text.matchAll(/(\d{1,2})\s*[,.]?\s*([A-Za-z0]{3,9})\.?\s*,?\s*(\d{4})/g)) {
    const month = MONTHS[m[2].slice(0, 3).toLowerCase().replace(/0/g, "o")];
    const iso = month ? toIso(Number(m[1]), month, Number(m[3])) : null;
    if (iso) found.push({ iso, at: m.index ?? 0, thai: false });
  }

  /* `21 มี.ค. 2568` — ปีต้องเป็น พ.ศ. 25xx เท่านั้น กันเลขอื่นบนบัตรที่บังเอิญมี 4 หลัก */
  for (const m of text.matchAll(/(\d{1,2})\s*([ก-์][ก-์.\s]{0,11}?)\s*(25\d\d)/g)) {
    const month = thaiMonth(m[2]);
    const iso = month ? toIso(Number(m[1]), month, Number(m[3])) : null;
    if (iso) found.push({ iso, at: m.index ?? 0, thai: true });
  }

  return found;
}

/** วันที่ตัวแรกที่ตามหลังป้ายวันเกิด (`Date of Birth` / `เกิดวันที่`) ไม่เกิน 40 ตัวอักษร */
function birthDates(text: string, dates: FoundDate[]): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/birth|bint|เกิด/gi)) {
    const at = m.index ?? 0;
    const next = dates.filter((d) => d.at > at).sort((a, b) => a.at - b.at)[0];
    if (next && next.at - at < 40) out.add(next.iso);
  }
  return out;
}

/**
 * แกะเลขบัตรกับวันหมดอายุจากข้อความที่ OCR อ่านได้ — แยกออกมาเป็นฟังก์ชันบริสุทธิ์
 * เพื่อทดสอบกับข้อความตัวอย่างได้โดยไม่ต้องมีรูป
 *
 * วันหมดอายุ = **วันที่ที่ไกลที่สุดบนบัตรหลังตัดวันเกิดออก** — ที่เหลือบนหน้าบัตรคือ
 * วันออกบัตรกับวันหมดอายุ และวันหมดอายุมาทีหลังเสมอ · ไม่อิงตำแหน่งป้าย
 * `Date of Expiry` เพราะบัตรจริงพิมพ์ป้ายไว้*ใต้*วันที่ และลำดับบรรทัดที่ OCR คืนมา
 * สลับไปมาตามความเอียงของรูป
 *
 * วันที่ภาษาอังกฤษมาก่อนภาษาไทย — แถวไทยบางรุ่นมี “วันเวลาที่อ่านบัตร” แทรก ซึ่ง
 * อาจเลยวันหมดอายุไปแล้ว · ใช้แถวไทยเฉพาะเมื่อแถวอังกฤษไม่เหลือวันที่ และต้องเจอ
 * อย่างน้อยสองวัน (ออกบัตร + หมดอายุ) ไม่งั้นวันเดียวที่เจออาจเป็นวันออกบัตร
 */
export function parseThaiIdCardText(text: string): IdCardReading {
  const { id, valid } = findNationalId(text);
  const dates = findDates(text);
  const births = birthDates(text, dates);

  const latest = (thai: boolean, min: number) => {
    const pool = dates.filter((d) => d.thai === thai && !births.has(d.iso));
    return pool.length < min ? "" : (pool.map((d) => d.iso).sort().at(-1) ?? "");
  };

  const lifelong = /life\s*-?\s*long|ตลอดชีพ/i.test(text);

  return {
    nationalId: id,
    nationalIdValid: valid,
    expiry: lifelong ? "" : latest(false, 1) || latest(true, 2),
    lifelong,
  };
}

/* ------------------------------------------------- หากรอบวันหมดอายุบนบัตร */

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrWord {
  text: string;
  bbox: Box;
}

/**
 * กรอบของเลขบัตร 13 หลักในรูป — ใช้เป็น **หมุดอ้างอิงตำแหน่งบนบัตร**
 *
 * เลขบัตรคือข้อความที่ OCR อ่านเจอบ่อยที่สุดบนบัตร (ตัวใหญ่ ตัวหนา ตัวเลขล้วน)
 * และความกว้างของมันเป็นสัดส่วนคงที่กับขนาดบัตร จึงบอกได้ทั้งตำแหน่งและขนาดของ
 * บัตรในรูป โดยไม่ต้องหาขอบบัตรด้วยการประมวลผลภาพ (ซึ่งพังง่ายบนพื้นลายไม้/พื้นสี)
 */
export function findIdNumberBox(lines: OcrWord[][]): Box | null {
  const isDigitish = (w: OcrWord) => /^[0-9ODQIl|SBZ]{1,5}$/.test(w.text);

  for (const words of lines) {
    if (words.filter(isDigitish).length < 3) continue;
    if (!findNationalId(words.filter(isDigitish).map((w) => w.text).join(" ")).id) continue;

    /* เอาเฉพาะ **ก้อนเลขที่ติดกัน** รอบก้อนที่ยาวสุด — บรรทัดเดียวกันมักมีเศษที่ OCR
       อ่านเป็นเลขปนมา (ขอบตราครุฑ · เงาสะท้อน) ถ้ารวมเข้ามากรอบจะกว้างเกินจริง
       แล้วกรอบวันหมดอายุที่คิดจากความกว้างนี้จะเลื่อนหลุดไปทั้งก้อน (เจอกับบัตรจริง) */
    const seedIndex = words.reduce(
      (best, w, i) =>
        isDigitish(w) && w.text.length > (best < 0 ? 0 : words[best].text.length) ? i : best,
      -1,
    );
    const seed = words[seedIndex].bbox;
    const height = seed.y1 - seed.y0;
    const near = (a: Box, b: Box) =>
      Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1) < height * 1.6 &&
      Math.abs((a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2) < height * 0.8;

    const run = [words[seedIndex]];
    for (let i = seedIndex - 1; i >= 0 && isDigitish(words[i]) && near(words[i].bbox, run[0].bbox); i -= 1)
      run.unshift(words[i]);
    for (
      let i = seedIndex + 1;
      i < words.length && isDigitish(words[i]) && near(run[run.length - 1].bbox, words[i].bbox);
      i += 1
    )
      run.push(words[i]);

    return {
      x0: Math.min(...run.map((w) => w.bbox.x0)),
      y0: Math.min(...run.map((w) => w.bbox.y0)),
      x1: Math.max(...run.map((w) => w.bbox.x1)),
      y1: Math.max(...run.map((w) => w.bbox.y1)),
    };
  }
  return null;
}

/**
 * กรอบที่วันหมดอายุอยู่ — คิดจากกรอบเลขบัตร (หน่วย = ความกว้างเลขบัตร `W`)
 *
 * วัดจากบัตรจริงสามรุ่น วันหมดอายุ (ทั้งแถวไทยและอังกฤษ) อยู่ที่ x 0.28–0.76W
 * นับจากขอบซ้ายเลขบัตร และ y 1.13–1.77W ใต้ขอบบนเลขบัตร · กรอบเผื่อไว้เป็น
 * x 0.1–0.85W · y 1.05–1.9W ซึ่ง**ตัดของที่ชอบหลอกออกหมด**: วันเกิด (~0.8W)
 * ที่อยู่ (~0.93W) วันออกบัตร (−1W) และ “วันเวลาที่อ่านบัตร” บนบัตรบางรุ่น (≤0.04W)
 * · ขวาหยุดที่ 0.85W เพราะเลยไปคือรูปถ่ายเจ้าของบัตร
 */
/**
 * สัดส่วนกรอบวันหมดอายุเทียบกับกรอบเลขบัตร (หน่วย = ความกว้างเลขบัตร `W`) แยกตามชนิด
 *
 * **ใบขับขี่** (แบบสมาร์ตการ์ด) พิมพ์เลขบัตรประชาชนไว้*ล่างสุด* (`ID No.`) ส่วนวันหมดอายุ
 * อยู่ในแถบสีม่วง*ด้านบน* บรรทัดเดียวกับวันออกใบ — วัดจากใบจริง วันสิ้นอายุอยู่ที่
 * x 0.04–1.4W · y −1.35 ถึง −1.15W (ติดลบ = เหนือเลขบัตร) · กรอบกว้างไปทางซ้ายจน
 * กินวันออกใบด้วยก็ไม่เป็นไร เพราะในกรอบเลือกวันที่ไกลสุดเสมอ และวันเกิดอยู่ใต้แถบ
 * นั้นลงมา ไม่ติดกรอบ · แถบม่วงเป็นส่วนที่อ่านทั้งใบไม่ออกเลย (สีพื้นเข้ม + โฮโลแกรม)
 * กรอบนี้จึงเป็นทางเดียวที่ได้วันที่จากรูปมือถือ
 */
const REGION_RATIO: Record<ScanDocKind, { x0: number; x1: number; y0: number; y1: number }> = {
  "id-card": { x0: 0.1, x1: 0.85, y0: 1.05, y1: 1.9 },
  "driver-license": { x0: -0.6, x1: 1.55, y0: -1.5, y1: -1.0 },
};

export function expiryRegion(
  id: Box,
  imageW: number,
  imageH: number,
  kind: ScanDocKind = "id-card",
): Box | null {
  const w = id.x1 - id.x0;
  if (w < 40) return null; // เลขบัตรเล็กจนตัวหนังสือวันที่อ่านไม่ออกแน่ ๆ
  const r = REGION_RATIO[kind];
  const box = {
    x0: Math.max(0, Math.round(id.x0 + r.x0 * w)),
    y0: Math.max(0, Math.round(id.y0 + r.y0 * w)),
    x1: Math.min(imageW, Math.round(id.x0 + r.x1 * w)),
    y1: Math.min(imageH, Math.round(id.y0 + r.y1 * w)),
  };
  return box.x1 - box.x0 > 20 && box.y1 - box.y0 > 20 ? box : null;
}

/**
 * แกะวันหมดอายุจากข้อความในกรอบวันหมดอายุ — ในกรอบนี้มีแต่วันหมดอายุ (ไทยกับอังกฤษ
 * วันเดียวกัน) จึงไม่ต้องเดาว่าวันไหนคืออะไร · อังกฤษมาก่อนเพราะเดือนอ่านชัดกว่า
 */
export function parseExpiryRegionText(text: string): { iso: string; lifelong: boolean } {
  if (/life\s*-?\s*long|ตลอดชีพ/i.test(text)) return { iso: "", lifelong: true };
  const dates = findDates(text);
  const pick = (thai: boolean) =>
    dates.filter((d) => d.thai === thai).map((d) => d.iso).sort().at(-1) ?? "";
  return { iso: pick(false) || pick(true), lifelong: false };
}

/**
 * เตรียมภาพกรอบวันหมดอายุก่อนอ่าน: **ยืดคอนทราสต์อัตโนมัติ + เพิ่มความคม**
 * รับ/คืนค่าความสว่าง 0–255 ทีละพิกเซล (ขาวดำแล้ว) — แยกเป็นฟังก์ชันล้วนไม่แตะ canvas
 * เพื่อทดสอบกับรูปจริงนอกเบราว์เซอร์ได้ด้วยโค้ดชุดเดียวกัน
 *
 * ได้มาจากใบขับขี่จริงที่ถ่ายเบลอ + โฮโลแกรมทับ — ผลบนรูปแบบนั้น**ไม่นิ่ง** เปลี่ยน
 * ตามการย่อ/แต่งภาพเล็กน้อย จึงใช้คู่กับภาพดิบ (ดู `readThaiDocument`) ไม่ได้ใช้แทน ·
 * รูปที่ถ่ายชัดพอ ทั้งสองแบบได้ผลเดียวกัน
 */
export function enhanceForOcr(gray: ArrayLike<number>, w: number, h: number): Uint8ClampedArray {
  const n = w * h;

  /* ยืดช่วงความสว่าง — ตัดหัวท้ายอย่างละ 2% กันจุดสะท้อนแสง/เงาเข้มดึงช่วงไว้ */
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i += 1) hist[Math.max(0, Math.min(255, gray[i] | 0))] += 1;
  const cut = n * 0.02;
  let lo = 0;
  for (let acc = 0; lo < 255 && acc + hist[lo] <= cut; lo += 1) acc += hist[lo];
  let hi = 255;
  for (let acc = 0; hi > 0 && acc + hist[hi] <= cut; hi -= 1) acc += hist[hi];
  const span = Math.max(1, hi - lo);
  const g = new Float32Array(n);
  for (let i = 0; i < n; i += 1) g[i] = Math.max(0, Math.min(255, ((gray[i] - lo) * 255) / span));

  /* box blur รัศมี 3 แบบแยกแกน (ผลรวมสะสม) — ใช้เป็นฐานของ unsharp mask */
  const r = 3;
  const tmp = new Float32Array(n);
  const blur = new Float32Array(n);
  for (let y = 0; y < h; y += 1) {
    const row = y * w;
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      let count = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k += 1) {
        sum += g[row + k];
        count += 1;
      }
      tmp[row + x] = sum / count;
    }
  }
  for (let x = 0; x < w; x += 1) {
    for (let y = 0; y < h; y += 1) {
      let sum = 0;
      let count = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k += 1) {
        sum += tmp[k * w + x];
        count += 1;
      }
      blur[y * w + x] = sum / count;
    }
  }

  const out = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i += 1) {
    const diff = g[i] - blur[i];
    out[i] = Math.abs(diff) < 2 ? g[i] : g[i] + 2 * diff; // threshold 2 — ไม่ขยายเม็ด noise บนพื้นเรียบ
  }
  return out;
}

/* ------------------------------------------------------------------- อ่านรูป */

type OcrWorker = Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>>;

type OcrLang = "eng" | "tha";

const workers: Partial<Record<OcrLang, Promise<OcrWorker>>> = {};

/**
 * เปิด worker ภาษาละตัวครั้งเดียวแล้วใช้ต่อ — ฝ่ายบุคคลที่ไล่อัปบัตรหลายคนติดกัน
 * จะได้ไม่ต้องรอโหลดโมเดลใหม่ทุกใบ · `import()` แบบ lazy เพื่อไม่ให้หน้าไหนต้องแบก
 * tesseract ไปด้วยตั้งแต่เปิดหน้า จนกว่าจะมีคนถ่ายบัตรจริง
 */
function getWorker(lang: OcrLang): Promise<OcrWorker> {
  const pending =
    workers[lang] ??
    import("tesseract.js")
      .then((t) => t.createWorker(lang))
      .catch((err) => {
        delete workers[lang]; // เน็ตหลุดตอนโหลดโมเดล — รอบหน้าต้องลองใหม่ได้
        throw err;
      });
  workers[lang] = pending;
  return pending;
}

/** ขยายให้ด้านยาวราว 2000px + ขาวดำ — tesseract อ่านตัวเล็กบนรูปมือถือที่ย่อแล้วได้แม่นขึ้นชัด */
async function toCanvas(bitmap: ImageBitmap, quarterTurns: number): Promise<HTMLCanvasElement> {
  const scale = 2000 / Math.max(bitmap.width, bitmap.height);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const sideways = quarterTurns % 2 === 1;

  const canvas = document.createElement("canvas");
  canvas.width = sideways ? h : w;
  canvas.height = sideways ? w : h;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("เบราว์เซอร์นี้อ่านรูปไม่ได้");

  ctx.filter = "grayscale(1) contrast(1.35)";
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((quarterTurns * Math.PI) / 2);
  ctx.drawImage(bitmap, -w / 2, -h / 2, w, h);
  return canvas;
}

/**
 * ตัดเฉพาะกรอบวันหมดอายุแล้ว**ขยายให้กว้างราว 1200px** — ตัวหนังสือวันที่บนบัตร
 * เล็กกว่าเลขบัตรหลายเท่า พออ่านทั้งใบ tesseract มักทำบรรทัดนี้หล่นหายทั้งบรรทัด
 * ขยายเฉพาะส่วนนี้ได้ผลต่างกันชัดกว่าการขยายทั้งรูป · แล้วผ่าน `enhanceForOcr` อีกชั้น
 */
function cropCanvas(source: HTMLCanvasElement, box: Box, enhance: boolean): HTMLCanvasElement {
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  const scale = Math.min(4, Math.max(1, 1200 / w));
  const out = document.createElement("canvas");
  out.width = Math.round(w * scale);
  out.height = Math.round(h * scale);
  const ctx = out.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("เบราว์เซอร์นี้อ่านรูปไม่ได้");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, box.x0, box.y0, w, h, 0, 0, out.width, out.height);
  if (!enhance) return out;

  /* ภาพต้นทางเป็นขาวดำแล้ว (`toCanvas`) — ช่องแดงช่องเดียวก็คือความสว่าง */
  const image = ctx.getImageData(0, 0, out.width, out.height);
  const px = image.data;
  const gray = new Uint8ClampedArray(out.width * out.height);
  for (let i = 0; i < gray.length; i += 1) gray[i] = px[i * 4];
  const sharp = enhanceForOcr(gray, out.width, out.height);
  for (let i = 0; i < sharp.length; i += 1) {
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = sharp[i];
  }
  ctx.putImageData(image, 0, 0);
  return out;
}

function linesOf(data: { blocks?: { paragraphs: { lines: { words: OcrWord[] }[] }[] }[] | null }) {
  return (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.map((l) => l.words)));
}

const score = (r: IdCardReading) =>
  (r.nationalIdValid ? 4 : r.nationalId ? 1 : 0) + (r.expiry || r.lifelong ? 2 : 0);

/** เอกสารที่อ่านวันหมดอายุจากรูปได้ — รหัสตรงกับ `DRIVER_DOC_TYPES` */
export type ScanDocKind = "id-card" | "driver-license";

/**
 * อ่านรูปเอกสารหนึ่งใบ — ถ้าท่าตรงหาไม่เจอ ลองหมุน 90° / 270° ต่อ
 * (คนถ่ายบัตรด้วยมือถือแนวตั้งบ่อยมาก)
 *
 * วันหมดอายุหาสามชั้น เรียงจากแม่นไปหยาบ:
 * 1. **ตัดกรอบวันหมดอายุ** จากตำแหน่งเลขบัตร (`expiryRegion`) แล้วอ่านเฉพาะกรอบนั้น
 *    — อังกฤษก่อน ไม่เจอค่อยอ่านไทย · สัดส่วนกรอบแยกตามชนิดเอกสาร (`REGION_RATIO`)
 *    เพราะใบขับขี่วางเลขบัตรไว้ล่างสุด ส่วนบัตรประชาชนวางไว้บนสุด
 * 2. แกะจากข้อความทั้งใบรอบอังกฤษ (`parseThaiIdCardText` — ตัดวันเกิดทิ้งแล้วเอา
 *    วันที่ไกลสุด ซึ่งใช้ได้กับใบขับขี่ด้วย: บนหน้าใบมีวันเกิด · วันออก · วันสิ้นอายุ)
 * 3. อ่านทั้งใบซ้ำด้วยโมเดลไทย แล้วแกะจากข้อความสองรอบรวมกัน
 *
 * หาไม่เจอก็คืนค่าว่าง ไม่ throw เพราะช่องกรอกด้วยมือยังใช้ได้ตามปกติ — throw
 * เฉพาะตอนโหลดตัวอ่านไม่สำเร็จ
 */
/**
 * ขั้นที่ตัวอ่านกำลังทำ — ส่งออกไปให้หน้าจอบอกผู้ใช้ตามจริง (ไม่ใช่ข้อความหมุนวนหลอก ๆ)
 * `load` เตรียมตัวอ่าน · `text` อ่านข้อความทั้งใบ · `expiry` อ่านเฉพาะกรอบวันหมดอายุ
 * · `thai` อ่านซ้ำด้วยภาษาไทย · `rotate` ลองหมุนรูปเพราะท่าเดิมหาไม่เจอ
 */
export type ScanStep = "load" | "text" | "expiry" | "thai" | "rotate";

export async function readThaiDocument(
  image: Blob,
  kind: ScanDocKind,
  onStep?: (step: ScanStep) => void,
): Promise<IdCardReading> {
  onStep?.("load");
  const eng = await getWorker("eng");
  const bitmap = await createImageBitmap(image, { imageOrientation: "from-image" });
  const done = (r: IdCardReading) =>
    (r.expiry || r.lifelong) && (kind === "driver-license" || r.nationalIdValid);

  let best: IdCardReading = { nationalId: "", nationalIdValid: false, expiry: "", lifelong: false };
  try {
    for (const turns of [0, 1, 3]) {
      onStep?.(turns ? "rotate" : "text");
      const canvas = await toCanvas(bitmap, turns);
      const { data } = await eng.recognize(canvas, {}, { text: true, blocks: true });
      const english = data.text;
      let reading = parseThaiIdCardText(english);

      const idBox = findIdNumberBox(linesOf(data));
      const region = idBox ? expiryRegion(idBox, canvas.width, canvas.height, kind) : null;
      if (region) {
        onStep?.("expiry");
        /* สองภาพ: แต่งคมแล้วก่อน (ชนะกับรูปเบลอ) แล้วค่อยภาพดิบ — บนรูปที่คมอยู่แล้ว
           การแต่งบางทีทำให้ตัวเลขแตก · ในแต่ละภาพอ่านอังกฤษก่อนแล้วค่อยไทย */
        for (const enhance of [true, false]) {
          const crop = cropCanvas(canvas, region, enhance);
          let found = parseExpiryRegionText((await eng.recognize(crop)).data.text);
          if (!found.iso && !found.lifelong) {
            found = parseExpiryRegionText((await (await getWorker("tha")).recognize(crop)).data.text);
          }
          if (found.iso || found.lifelong) {
            reading = { ...reading, expiry: found.iso, lifelong: found.lifelong };
            break;
          }
        }
      }

      /* บัตรประชาชน: ท่านี้ต้องเจอเลขบัตรก่อน (ไม่งั้นแปลว่าหมุนผิดท่า อ่านไทยซ้ำก็เปล่า)
         · ใบขับขี่: ภาษาอังกฤษบนใบอ่านยากกว่าบัตร จึงลองไทยทุกท่าที่ยังไม่ได้วันที่ */
      const worthThai = kind === "driver-license" || reading.nationalId;
      if (worthThai && !reading.expiry && !reading.lifelong) {
        onStep?.("thai");
        const thai = (await (await getWorker("tha")).recognize(canvas)).data.text;
        const merged = parseThaiIdCardText(`${english}\n${thai}`);
        reading = reading.nationalId
          ? { ...merged, nationalId: reading.nationalId, nationalIdValid: reading.nationalIdValid }
          : merged;
      }

      if (score(reading) > score(best)) best = reading;
      if (done(best)) break;
    }
  } finally {
    bitmap.close();
  }
  return best;
}

export function readThaiIdCard(image: Blob): Promise<IdCardReading> {
  return readThaiDocument(image, "id-card");
}
