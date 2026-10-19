#!/usr/bin/env node
/**
 * codemod ย้าย mena-partner-driver → hr-service (เลน 5) — รันซ้ำได้
 *
 *   node scripts/partner-codemod/run.mjs [--src <path ของ repo partner>]
 *
 * ทำอะไร
 * 1. อ่านรายชื่อไฟล์จาก `git ls-files` ของต้นทาง **เท่านั้น** (ไฟล์ untracked = ข้อมูลจริงของลูกค้า ห้ามติดมา)
 *    และอ่านเนื้อไฟล์จาก commit HEAD (`git show`) ไม่ใช่ working tree
 * 2. map path ตาม docs/partner-merge/LANES.md (mapPath ด้านล่าง) — ไฟล์ที่ไม่อยู่ในแผน = ข้าม
 * 3. แปลงเนื้อโค้ด (transform) — import alias, MONGO_DB → PARTNER_DB, next-auth → session hr, URL
 * 4. ทับด้วยไฟล์ใน `scripts/partner-codemod/overrides/<path ปลายทาง>` (ไฟล์ที่เขียนมือทั้งไฟล์)
 * 5. apply `scripts/partner-codemod/patches/*.patch` ตามลำดับชื่อ (แก้มือหลัง codemod — ให้รันซ้ำแล้วได้ผลเดิม)
 *
 * ก่อนเขียน จะลบปลายทางที่ codemod เป็นเจ้าของทิ้งทั้งหมด (OWNED_ROOTS) ยกเว้นไฟล์ของเลนอื่น (KEEP)
 */
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, "../..")
const argSrc = process.argv.indexOf("--src")
const SRC = path.resolve(argSrc > 0 ? process.argv[argSrc + 1] : path.join(ROOT, "../../project/mena-partner-driver"))

// ── ปลายทางที่ codemod เป็นเจ้าของ (ล้างก่อนเขียนใหม่) ─────────────────────────────
const OWNED_ROOTS = [
  "app/partner",
  "app/(partner-public)",
  "app/og",
  "app/api/public",
  "components/partner",
  "partner-assets",
  "public/partner",
  "app/sitemap.ts",
  "app/robots.ts",
]
// app/api/partner/** ยกเว้น session (L4) · lib/partner/** ยกเว้นของ L4 + mongo.ts
const PARTIAL_ROOTS = { "app/api/partner": ["session"], "lib/partner": ["auth", "mongo.ts", "rbac.ts", "roles.ts", "public-routes.ts"] }

// ── กลุ่มหน้าของระบบเดิม (ย้ายไปใต้ /partner) ───────────────────────────────────────
export const PAGE_GROUPS = [
  "adjustments", "admin", "alerts", "attendance", "catalog", "contracts", "driver-ledger", "drivers", "import",
  "insurance-tax", "payroll", "payroll-extras", "price-list", "promotions", "quotations", "reports", "trip-fuel",
  "trips", "vehicle-cost", "vehicles",
]

const DROP_LIB = new Set(["lib/auth.ts", "lib/mongo.ts", "lib/rbac.ts", "lib/roles.ts", "lib/public-routes.ts", "lib/public-routes.test.ts"])

/** path ต้นทาง → path ปลายทาง (null = ไม่ย้าย) */
export function mapPath(p) {
  if (p.startsWith("app/(app)/login/")) return null
  if (p.startsWith("app/api/auth/")) return null
  if (p === "app/layout.tsx" || p === "app/globals.css") return null // รวมเข้า app/partner/layout.tsx + styles/partner-theme.css
  if (p.startsWith("app/(app)/")) return "app/partner/" + p.slice("app/(app)/".length)
  if (p.startsWith("app/api/public/")) return p
  if (p.startsWith("app/api/")) return "app/api/partner/" + p.slice("app/api/".length)
  if (p.startsWith("app/(public)/")) return "app/(partner-public)/" + p.slice("app/(public)/".length)
  if (p === "app/sitemap.ts" || p === "app/robots.ts" || p.startsWith("app/og/")) return p
  if (p.startsWith("lib/")) return DROP_LIB.has(p) ? null : "lib/partner/" + p.slice(4)
  if (p.startsWith("components/")) return "components/partner/" + p.slice("components/".length)
  if (p === "types/index.ts") return "lib/partner/types/index.ts"
  if (p.startsWith("__tests__/")) return "lib/partner/__tests__/" + p.slice("__tests__/".length)
  // test/server-only-stub.ts → ใช้ของ L1 ที่ราก (vitest.config.ts)
  if (p.startsWith("fonts/") || p.startsWith("templates/") || p.startsWith("data/")) return "partner-assets/" + p
  if (p.startsWith("public/")) return "public/partner/" + p.slice("public/".length)
  return null
}

// ── แปลงเนื้อโค้ด ─────────────────────────────────────────────────────────────────
const GROUP_RE = PAGE_GROUPS.slice().sort((a, b) => b.length - a.length).join("|")

/** import alias ของ repo เดิม → ตำแหน่งใหม่ */
function rewriteAliases(src) {
  return src
    .replace(/(["'`])@\/lib\/(?!partner\/)/g, "$1@/lib/partner/")
    .replace(/(["'`])@\/components\/(?!partner\/)/g, "$1@/components/partner/")
    .replace(/(["'`])@\/types(["'`/])/g, "$1@/lib/partner/types$2")
    .replace(/(["'`])@\/data\//g, "$1@/partner-assets/data/")
    .replace(/(["'])\.\.\/data\/thai-address\.json\1/g, "$1@/partner-assets/data/thai-address.json$1")
}

/** `process.env.MONGO_DB ?? "mena_partner"` (ทุกรูป) → PARTNER_DB + import จาก shim */
function rewriteMongoDb(src) {
  const before = src
  src = src.replace(/process\.env\.MONGO_DB\s*(?:\?\?|\|\|)\s*["']mena_partner["']/g, "PARTNER_DB")
  if (src === before) return src
  if (/\bPARTNER_DB\b/.test(before)) return src
  // มี import default จาก shim อยู่แล้ว → เติม named import
  const re = /import\s+clientPromise\s+from\s+(["'])@\/lib\/partner\/mongo\1/
  if (re.test(src)) return src.replace(re, 'import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"')
  return addImportLine(src, 'import { PARTNER_DB } from "@/lib/partner/mongo"')
}

function addImportLine(src, line) {
  // แทรกหลัง import บรรทัดสุดท้ายของหัวไฟล์ (คง "use client"/"use server" ไว้บนสุด)
  const lines = src.split("\n")
  let last = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^import\s/.test(lines[i])) {
      last = i
      // import หลายบรรทัด
      while (!/from\s+["'][^"']+["']|^import\s+["'][^"']+["']/.test(lines[last]) && last < lines.length - 1) last++
      i = last
    }
  }
  if (last === -1) {
    const d = lines.findIndex((l) => /^["']use (client|server)["']/.test(l))
    last = d
  }
  lines.splice(last + 1, 0, line)
  return lines.join("\n")
}

/** next-auth → session ของ hr (สัญญากลาง lib/partner/auth/*) */
function rewriteNextAuth(src) {
  // server
  src = src.replace(/^import\s*\{\s*getServerSession\s*\}\s*from\s*["']next-auth["'];?\s*$/m, 'import { getPartnerSession } from "@/lib/partner/auth/server"')
  src = src.replace(/^import\s*\{\s*authOptions\s*\}\s*from\s*["']@\/lib\/partner\/auth["'];?\s*\n/m, "")
  src = src.replace(/getServerSession\(\s*authOptions\s*\)/g, "getPartnerSession()")
  // client
  src = src.replace(/^import\s*\{([^}]*)\}\s*from\s*["']next-auth\/react["'];?\s*$/m, (_m, names) => {
    const list = names.split(",").map((s) => s.trim()).filter(Boolean)
    const out = []
    const auth = []
    for (const n of list) {
      if (n === "useSession") auth.push("usePartnerSession")
      else if (n === "SessionProvider") auth.push("PartnerSessionProvider")
      else if (n === "signOut") out.push('import { partnerSignOut } from "@/components/partner/sign-out"')
      else if (n === "signIn") { /* หน้า login ถูกทิ้ง — ไม่มีที่ใช้ */ }
      else throw new Error("next-auth/react import ที่ไม่รู้จัก: " + n)
    }
    if (auth.length) out.unshift(`import { ${auth.join(", ")} } from "@/lib/partner/auth/client"`)
    return out.join("\n")
  })
  src = src.replace(/\buseSession\(\)/g, "usePartnerSession()")
  src = src.replace(/<SessionProvider>/g, "<PartnerSessionProvider>").replace(/<\/SessionProvider>/g, "</PartnerSessionProvider>")
  src = src.replace(/\bsignOut\(\{[^}]*\}\)/g, "partnerSignOut()")
  return src
}

/** URL: API → /api/partner/** (ยกเว้น /api/public) · หน้า 21 กลุ่ม + "/" → /partner/** */
function rewriteUrls(src) {
  src = src.replace(/(["'`])\/api\/(?!public\/|partner\/|public["'`?]|partner["'`?])/g, "$1/api/partner/")
  // `/api${...}` ไม่มี — ถ้ามีจะเห็นตอน grep ปิดงาน
  src = src.replace(new RegExp("([\"'`])/(" + GROUP_RE + ")(?=[/\"'`?#$])", "g"), "$1/partner/$2")
  // ลิงก์หน้าแรก "/" ของระบบเดิม = แดชบอร์ด /partner
  src = src.replace(/\bhref(=|:\s*)(["'])\/\2/g, "href$1$2/partner$2")
  src = src.replace(/\b(push|replace|redirect)\((["'])\/\2\)/g, "$1($2/partner$2)")
  return src
}

/** path ไฟล์บนดิสก์ (fonts/templates) + URL ไฟล์ใน public/ */
function rewriteAssets(src) {
  src = src.replace(/process\.cwd\(\),\s*(["'])(fonts|templates)\1/g, 'process.cwd(), "partner-assets", "$2"')
  src = src.replace(/(["'`(])\/(brand\/|mena-logo\.jpg|vendor-open-form\.pdf|login-bg\.jpg)/g, "$1/partner/$2")
  return src
}

export function transform(dest, src) {
  if (!/\.(ts|tsx|mts|js|mjs)$/.test(dest)) return src
  src = rewriteAliases(src)
  src = rewriteMongoDb(src)
  src = rewriteNextAuth(src)
  src = rewriteUrls(src)
  src = rewriteAssets(src)
  return src
}

// ── main ─────────────────────────────────────────────────────────────────────────
function rmOwned() {
  for (const r of OWNED_ROOTS) fs.rmSync(path.join(ROOT, r), { recursive: true, force: true })
  for (const [r, keep] of Object.entries(PARTIAL_ROOTS)) {
    const dir = path.join(ROOT, r)
    if (!fs.existsSync(dir)) continue
    for (const e of fs.readdirSync(dir)) if (!keep.includes(e)) fs.rmSync(path.join(dir, e), { recursive: true, force: true })
  }
}

function walk(dir, base = dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name)
    return e.isDirectory() ? walk(full, base) : [path.relative(base, full)]
  })
}

function main() {
  const files = execFileSync("git", ["-C", SRC, "ls-files", "-z"], { encoding: "buffer", maxBuffer: 64 << 20 })
    .toString("utf8").split("\0").filter(Boolean)
  rmOwned()
  const stats = { copied: 0, skipped: [], pages: 0, routes: 0 }
  for (const p of files) {
    const dest = mapPath(p)
    if (!dest) { stats.skipped.push(p); continue }
    const buf = execFileSync("git", ["-C", SRC, "show", `HEAD:${p}`], { encoding: "buffer", maxBuffer: 64 << 20 })
    const out = /\.(ts|tsx|mts|js|mjs|css|json|md)$/.test(dest) ? Buffer.from(transform(dest, buf.toString("utf8")), "utf8") : buf
    const abs = path.join(ROOT, dest)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, out)
    stats.copied++
    if (/\/page\.tsx$/.test(dest)) stats.pages++
    if (/\/route\.tsx?$/.test(dest)) stats.routes++
  }
  // overrides — ไฟล์เขียนมือทั้งไฟล์
  const ovDir = path.join(HERE, "overrides")
  for (const rel of walk(ovDir)) {
    const abs = path.join(ROOT, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.copyFileSync(path.join(ovDir, rel), abs)
  }
  // patches — แก้มือหลัง codemod
  const pDir = path.join(HERE, "patches")
  const patches = fs.existsSync(pDir) ? fs.readdirSync(pDir).filter((f) => f.endsWith(".patch")).sort() : []
  for (const f of patches) execFileSync("git", ["-C", ROOT, "apply", "--whitespace=nowarn", path.join(pDir, f)], { stdio: "inherit" })
  console.log(`copied ${stats.copied} files · pages ${stats.pages} · routes ${stats.routes} · overrides ${walk(ovDir).length} · patches ${patches.length}`)
  console.log(`skipped ${stats.skipped.length}:`)
  for (const s of stats.skipped) console.log("  - " + s)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
