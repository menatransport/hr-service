/**
 * ตรวจว่าชื่อ MongoDB (database / collection / bucket) มาจาก `lib/db/registry.mjs` ที่เดียว
 *
 *   node check_db_names.mjs     → exit 0 = สะอาด · exit 1 = เจอชื่อพิมพ์เอง (พิมพ์ไฟล์:บรรทัดให้)
 *
 * นอก `lib/db/` ห้ามมี:
 * 1. สตริงที่ **ทั้งก้อน** ตรงกับชื่อในทะเบียน (รวม `PARTNER` / `PARTNER_EXT_DB` / `BI` / `ATMS` ของระบบรถร่วม) เช่น `"record_cases"` `"Boom_ETL"` (สคริปต์ที่รากต้อง import
 *    จาก registry) — ข้อความยาวที่แค่เอ่ยถึงชื่อคอลเลกชัน (เอกสาร API / ข้อความ error) ไม่นับ และคีย์ที่ส่ง
 *    เข้า `hrCol()` / `etlCol()` / `hrBucket()` ตรง ๆ ก็ไม่นับ (คีย์ `vehicles` บังเอิญชื่อเดียวกับคอลเลกชัน)
 * 2. `.collection("…")` / `.db("…")` ที่ส่งสตริงตรง ๆ — ต้องผ่าน `hrCol()` / `etlCol()` หรือชื่อจาก registry
 * 3. `import … from "@/lib/mongo"` — client ดิบมีไว้ให้ `lib/db` คนเดียว
 *
 * คอมเมนต์ไม่นับ (อธิบายชื่อคอลเลกชันในคอมเมนต์ได้ตามปกติ) · ข้อยกเว้นอยู่ใน `ALLOW` พร้อมเหตุผล
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ATMS, BI, BUCKETS, DB, ETL, HR, PARTNER, PARTNER_EXT_DB } from "./lib/db/registry.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SELF = path.basename(fileURLToPath(import.meta.url));
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".claude", "out", "build"]);
const EXTS = new Set([".ts", ".tsx", ".mts", ".mjs", ".js", ".cjs"]);

/** ข้อยกเว้นรายไฟล์ — สตริงที่ตรงกับชื่อคอลเลกชันแต่ไม่ได้ใช้เข้าถึงฐาน */
const ALLOW = {
  /* ป้าย “ที่มาของข้อมูล” บนหัวการ์ดในหน้าประวัติ พจส. — ข้อความบนจอ ไม่ได้ใช้คิวรี */
  "app/recruitment/_components/admin/driver-profile.tsx": ["main_driver", "vehicles"],
  /* โฟลเดอร์อัปโหลดรูปรถบน DO Spaces — ไม่ใช่คอลเลกชัน (ชื่อชน Boom_ETL.vehicles) */
  "app/partner/vehicles/page.tsx": ["vehicles"],
};

/**
 * ชื่อของระบบรถร่วมที่เป็นคำสามัญ — **ไม่นับในกฎข้อ 1 (สตริงทั้งก้อน) เท่านั้น** กฎข้อ 2 (`.collection("…")` /
 * `.db("…")` ด้วยสตริง) ยังจับทุกชื่อเหมือนเดิม
 * เหตุผล: คำเหล่านี้ซ้ำกับชื่อโดเมนสิทธิ์ (`lib/partner/rbac.ts`), ชื่อโฟลเดอร์อัปโหลด, ป้ายแหล่งข้อมูลของ hr
 * (`"drivers"` `"atms"` ในหน้ารับสมัคร) ซึ่งไม่ใช่การเข้าถึงฐาน — ถ้านับจะต้องเขียนข้อยกเว้นรายไฟล์หลายสิบจุด
 * ชื่อเฉพาะอื่นของรถร่วม (`payroll_entries`, `driver_ledger`, `vehiclemaster`, `mena-bi` …) นับทั้งหมด
 */
const GENERIC_WORDS = new Set(["contracts", "customers", "drivers", "quotations", "trips", "atms"]);

const NAMES = new Set([
  ...Object.values(DB),
  ...Object.values(HR).map((def) => def.name),
  ...Object.values(BUCKETS).flatMap((b) => [b, `${b}.files`, `${b}.chunks`]),
  ...Object.values(ETL),
  // ระบบรถร่วม (mena_partner) + db อ่านอย่างเดียวที่โค้ดรถร่วมใช้ (mena-bi, atms) — ดู GENERIC_WORDS
  ...[...Object.values(PARTNER), ...Object.values(PARTNER_EXT_DB), ...Object.values(BI), ...Object.values(ATMS)].filter(
    (name) => !GENERIC_WORDS.has(name),
  ),
]);

/**
 * ตัดคอมเมนต์ทิ้งโดยคงสตริง/บรรทัดไว้ + เก็บสตริงทุกก้อนพร้อมตำแหน่ง — lexer ย่อ ๆ ที่รู้จักสตริง
 * template และ regex literal พอให้ `"//"` ในสตริงหรือ `/["']/` ใน regex ไม่ถูกเข้าใจผิด
 * (template ที่มี `${…}` ถูกนับเป็นก้อนเดียว — ไม่มีวันตรงกับชื่อเปล่า ๆ อยู่แล้ว)
 */
function lex(src) {
  let out = "";
  const strings = [];
  let i = 0;
  let lastSig = ""; // อักขระสำคัญตัวล่าสุดนอกคอมเมนต์ ใช้เดาว่า `/` คือ regex หรือหาร
  const blank = (s) => s.replace(/[^\n]/g, " ");
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === "/" && next === "/") {
      const end = src.indexOf("\n", i);
      const stop = end < 0 ? src.length : end;
      out += blank(src.slice(i, stop));
      i = stop;
    } else if (ch === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end < 0 ? src.length : end + 2;
      out += blank(src.slice(i, stop));
      i = stop;
    } else if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== ch) {
        if (src[j] === "\\") j++;
        else if (ch !== "`" && src[j] === "\n") break;
        j++;
      }
      out += src.slice(i, j + 1);
      strings.push({ index: i, value: src.slice(i + 1, j) });
      i = j + 1;
      lastSig = ch;
    } else if (ch === "/" && (lastSig === "" || /[(,=:[!&|?{};+\-*%<>~^]/.test(lastSig))) {
      // regex literal — ข้ามไปจนปิด `/` (นับ class `[...]` ด้วย)
      let j = i + 1;
      let inClass = false;
      while (j < src.length && src[j] !== "\n") {
        if (src[j] === "\\") j++;
        else if (src[j] === "[") inClass = true;
        else if (src[j] === "]") inClass = false;
        else if (src[j] === "/" && !inClass) break;
        j++;
      }
      out += blank(src.slice(i, j + 1));
      i = j + 1;
      lastSig = "/";
    } else {
      out += ch;
      if (!/\s/.test(ch)) lastSig = ch;
      i++;
    }
  }
  return { code: out, strings };
}

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (EXTS.has(path.extname(entry.name))) files.push(full);
  }
  return files;
}

/**
 * คีย์ทะเบียนที่ส่งเข้าตัวเข้าถึงตรง ๆ เช่น `etlCol("vehicles")` / `etlCol<Doc>(\n "vehicles"`
 * รถร่วม: `partnerCol("contracts")` · `partnerColOf(db, "contracts")` · `biCol("driverCost")` · `atmsCol(…)`
 * (ตัวเข้าถึงทุกตัวรับเฉพาะคีย์จากทะเบียน — ชนิดของ TypeScript กันสตริงอิสระอีกชั้น)
 */
const ACCESSOR_BEFORE_RE =
  /\b(?:(?:hrCol|etlCol|hrBucket|partnerCol|biCol|atmsCol)(?:<[^()]*>)?\(|partnerColOf(?:<[^()]*>)?\(\s*[\w$]+\s*,)\s*$/;
const RAW_ACCESS_RE = /\.(collection|db)\(\s*["'`]/g;
const MONGO_IMPORT_RE = /from\s+["'](?:@\/lib\/mongo|(?:\.{1,2}\/)+(?:lib\/)?mongo)(?:\.ts)?["']/g;

const problems = [];
let scanned = 0;
for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  if (rel.startsWith("lib/db/") || rel === SELF) continue;
  scanned++;
  const { code, strings } = lex(fs.readFileSync(file, "utf8"));
  const lineOf = (index) => code.slice(0, index).split("\n").length;
  const allowed = ALLOW[rel] ?? [];

  for (const s of strings) {
    if (!NAMES.has(s.value) || allowed.includes(s.value)) continue;
    if (ACCESSOR_BEFORE_RE.test(code.slice(Math.max(0, s.index - 300), s.index))) continue;
    problems.push(`${rel}:${lineOf(s.index)}  ชื่อพิมพ์เอง "${s.value}"`);
  }
  for (const m of code.matchAll(RAW_ACCESS_RE))
    problems.push(`${rel}:${lineOf(m.index)}  .${m[1]}("…") ด้วยสตริงตรง ๆ`);
  if (rel !== "lib/mongo.ts")
    for (const m of code.matchAll(MONGO_IMPORT_RE))
      problems.push(`${rel}:${lineOf(m.index)}  import lib/mongo นอก lib/db — ใช้ hrCol/etlCol/hrBucket/partnerCol`);
}

if (problems.length) {
  console.log(`เจอชื่อ MongoDB นอกทะเบียน ${problems.length} จุด (ใช้ \`lib/db\` / \`lib/db/registry.mjs\` แทน):`);
  for (const p of problems) console.log("  " + p);
  process.exit(1);
}
console.log(`ชื่อ MongoDB มาจากทะเบียนทั้งหมด — ตรวจ ${scanned} ไฟล์ (${NAMES.size} ชื่อ) ไม่เจอที่พิมพ์เอง`);
