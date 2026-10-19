/**
 * ขั้น RBAC ในชั้น route — ใส่ `requirePartnerPerm(…)` บรรทัดแรกของทุก handler ที่เขียนข้อมูล
 * (POST/PUT/PATCH/DELETE) ใน `app/api/partner/**` โดย**คำนวณสิทธิ์จากตารางเดิม** (`domainOfApiPath` ใน
 * `lib/partner/rbac.ts`) ให้ตรงกับด่าน proxy (`lib/auth/gate.ts`) ทุกข้อ ไม่เดาเอง:
 *
 * | กรณี | need |
 * |---|---|
 * | `/api/partner/cron/*` | ไม่ใส่ — route ตรวจ `Bearer CRON_SECRET` เอง |
 * | `/api/partner/session` | ไม่ใส่ (ของ L4) |
 * | `/api/partner/module-status` | `"login"` (ทุกคนที่ล็อกอินติ๊กได้ — พฤติกรรมเดิม) |
 * | `/api/partner/upload` | `"login"` + `canUpload(role)` (เหมือน gate) |
 * | DELETE | `"admin"` (โดเมน `manage_users` → `"manage_users"` เพราะ admin ไม่มีโดเมนนี้) |
 * | อื่น ๆ | `domainOfApiPath(path) ?? "admin"` |
 */
import path from "node:path"
import { pathToFileURL } from "node:url"

export const GUARD_MARK = "// RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)"

export async function loadRbac(root) {
  return import(pathToFileURL(path.join(root, "lib/partner/rbac.ts")).href)
}

/** `app/api/partner/ledger/[id]/route.ts` → `/api/partner/ledger/[id]` */
export const apiPathOf = (file) => "/" + file.replace(/^app\//, "").replace(/\/route\.tsx?$/, "")

export function needFor(apiPath, method, rbac) {
  if (apiPath.startsWith("/api/partner/cron/") || apiPath === "/api/partner/session") return null
  if (apiPath === "/api/partner/module-status" || apiPath.startsWith("/api/partner/module-status/")) return "login"
  if (apiPath === "/api/partner/upload" || apiPath.startsWith("/api/partner/upload/")) return "upload"
  const domain = rbac.domainOfApiPath(apiPath)
  if (method === "DELETE") return domain === "manage_users" ? "manage_users" : "admin"
  return domain ?? "admin"
}

const HANDLER_RE = /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\s*\(/g

export function addRouteGuards(file, src, rbac) {
  if (src.includes(GUARD_MARK)) return { src, count: 0 }
  const apiPath = apiPathOf(file)
  let out = ""
  let last = 0
  let count = 0
  let needUpload = false
  for (const m of src.matchAll(HANDLER_RE)) {
    const need = needFor(apiPath, m[1], rbac)
    if (!need) continue
    // หา ) ที่ปิดพารามิเตอร์ แล้ว { แรกของตัวฟังก์ชัน
    let i = m.index + m[0].length, depth = 1
    while (depth > 0 && i < src.length) { if (src[i] === "(") depth++; else if (src[i] === ")") depth--; i++ }
    let brace = i, angle = 0
    while (brace < src.length) {
      const c = src[brace]
      if (c === "<") angle++
      else if (c === ">") angle--
      else if (c === "{" && angle === 0) break
      brace++
    }
    const guard = need === "upload"
      ? `\n  ${GUARD_MARK} — อัปโหลด: ทุกบทบาทที่เขียนได้อย่างน้อยหนึ่งโดเมน (เหมือน lib/auth/gate.ts)\n  const perm = await requirePartnerPerm("login")\n  if (perm instanceof Response) return perm\n  if (!canUpload(perm.user.role)) return NextResponse.json({ error: "Forbidden — ไม่มีสิทธิ์อัปโหลด" }, { status: 403 })\n`
      : `\n  ${GUARD_MARK}\n  const perm = await requirePartnerPerm("${need}")\n  if (perm instanceof Response) return perm\n`
    if (need === "upload") needUpload = true
    out += src.slice(last, brace + 1) + guard
    last = brace + 1
    count++
  }
  if (!count) return { src, count }
  out += src.slice(last)
  const imports = ['import { requirePartnerPerm } from "@/lib/partner/auth/server"']
  if (needUpload) imports.push('import { canUpload } from "@/lib/partner/rbac"')
  const lines = out.split("\n")
  let lastImport = -1
  for (let k = 0; k < lines.length; k++) {
    if (/^import\s/.test(lines[k])) {
      let j = k
      while (j < lines.length - 1 && !/(from\s+["'][^"']+["']|^import\s+["'][^"']+["'])\s*;?\s*$/.test(lines[j])) j++
      lastImport = j; k = j
    }
  }
  lines.splice(lastImport + 1, 0, ...imports)
  return { src: lines.join("\n"), count }
}
