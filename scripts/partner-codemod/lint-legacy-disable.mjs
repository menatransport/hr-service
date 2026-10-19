#!/usr/bin/env node
/**
 * โค้ดรถร่วมที่ย้ายมามี lint error ติดมาจาก repo เดิม 76 จุด (repo เดิมก็ 76 — ไม่ได้เพิ่มจากการย้าย)
 * ส่วนใหญ่เป็นกฎยุค React Compiler (`react-hooks/set-state-in-effect` ฯลฯ) ซึ่งแก้จริงต้องรื้อโครง hook
 * = เสี่ยงเปลี่ยนพฤติกรรม · สคริปต์นี้ใส่ `eslint-disable` ระดับไฟล์ **เฉพาะกฎที่ไฟล์นั้นผิดจริง**
 * พร้อมเหตุผล — ให้ `npm run lint` ของ hr กลับมา 0 error โดยไม่แตะตรรกะ แล้วค่อย refactor ทีหลัง
 *
 *   node scripts/partner-codemod/lint-legacy-disable.mjs   (อ่านผล eslint แล้วเขียนหัวไฟล์)
 */
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const TARGETS = ["app/partner", "app/api/partner", "app/(partner-public)", "app/og", "app/api/public", "app/sitemap.ts", "app/robots.ts", "components/partner", "lib/partner"]
const MARK = "-- โค้ดเดิมจาก mena-partner-driver ย้ายมาโดยไม่แก้ตรรกะ (scripts/partner-codemod/lint-legacy-disable.mjs)"

let out
try {
  out = execFileSync("npx", ["eslint", ...TARGETS, "--format", "json"], { cwd: ROOT, encoding: "utf8", maxBuffer: 256 << 20 })
} catch (e) {
  out = e.stdout
}
const results = JSON.parse(out)
let n = 0
for (const r of results) {
  const rules = [...new Set(r.messages.filter((m) => m.severity === 2 && m.ruleId).map((m) => m.ruleId))].sort()
  if (!rules.length) continue
  let src = fs.readFileSync(r.filePath, "utf8")
  if (src.includes(MARK)) continue
  src = `/* eslint-disable ${rules.join(", ")} ${MARK} */\n` + src
  fs.writeFileSync(r.filePath, src)
  n++
  console.log(path.relative(ROOT, r.filePath), rules.join(", "))
}
console.log(`${n} files`)
