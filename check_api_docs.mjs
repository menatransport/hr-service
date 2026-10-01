/**
 * ตรวจว่าเอกสาร API (`app/recruitment/_lib/api-docs.ts`) ครบตรงกับ route จริงใต้ `app/api/**`
 * **เฉพาะพาธในขอบเขต `API_DOCS_SCOPE`** (ยืนยันตัวตน + Mass Recruitment) — อ่านรายการจากไฟล์เอกสารเอง
 *
 *   node check_api_docs.mjs     → exit 0 = ตรงกัน · exit 1 = มีเส้นที่ขาด/เกิน (พิมพ์รายการให้)
 *
 * เทียบระดับ "METHOD path" — `[param]` ในชื่อโฟลเดอร์ถูกแปลงเป็น `{param}` ให้ตรงกับเอกสาร
 * (ชื่อ param ไม่ต้องตรงกัน เพราะเอกสารใช้ชื่อที่อ่านเข้าใจกว่าได้ เช่น `{drivercode}`)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const API_DIR = path.join(ROOT, "app", "api");
const DOCS = path.join(ROOT, "app", "recruitment", "_lib", "api-docs.ts");

const norm = (p) => p.replace(/\{[^}]+\}/g, "{}");

function routes(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...routes(full));
    else if (entry.name === "route.ts") {
      const rel = path.relative(path.join(ROOT, "app"), dir).split(path.sep).join("/");
      const url = "/" + rel.replace(/\[([^\]]+)\]/g, "{$1}");
      const src = fs.readFileSync(full, "utf8");
      for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g))
        out.push(`${m[1]} ${norm(url)}`);
    }
  }
  return out;
}

const docs = fs.readFileSync(DOCS, "utf8");
const scopeSrc = /API_DOCS_SCOPE\s*=\s*\[([^\]]*)\]/.exec(docs)?.[1] ?? "";
const scope = [...scopeSrc.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
if (!scope.length) throw new Error("อ่าน API_DOCS_SCOPE ใน api-docs.ts ไม่ได้");
const inScope = (key) => scope.some((prefix) => key.split(" ")[1].startsWith(prefix));

const actual = new Set(routes(API_DIR).filter(inScope));
const documented = new Set(
  [...docs.matchAll(/method:\s*"(GET|POST|PUT|PATCH|DELETE)",\s*path:\s*"([^"]+)"/g)].map(
    (m) => `${m[1]} ${norm(m[2])}`,
  ),
);

const missing = [...actual].filter((x) => !documented.has(x)).sort();
const stale = [...documented].filter((x) => !actual.has(x)).sort();

if (missing.length) console.log("ยังไม่มีในเอกสาร:\n  " + missing.join("\n  "));
if (stale.length) console.log("มีในเอกสารแต่ไม่มี route จริง:\n  " + stale.join("\n  "));
if (!missing.length && !stale.length)
  console.log(`เอกสาร API ครบ — ${actual.size} เส้นในขอบเขต (${scope.join(" ")}) ตรงกับ route จริง`);
process.exit(missing.length || stale.length ? 1 : 0);
