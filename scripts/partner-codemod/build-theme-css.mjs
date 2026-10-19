#!/usr/bin/env node
/**
 * สร้าง styles/partner-theme.css จาก partner-theme.template.css
 * แทนที่ `@@STOCK_THEME_VARS@@` ด้วยตัวแปรมาตรฐานของ Tailwind ทั้งชุด (จาก node_modules/tailwindcss/theme.css)
 * เพราะ template ใช้ `theme(reference)` — ตัวแปรมาตรฐานไม่ถูกปล่อยออก :root อีก ต้องประกาศเองใต้ .partner-theme
 *   node scripts/partner-codemod/build-theme-css.mjs
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, "../..")
const theme = fs.readFileSync(path.join(ROOT, "node_modules/tailwindcss/theme.css"), "utf8")

// เอาเฉพาะบล็อกแรก `@theme default { ... }` แล้วตัด @keyframes และ --default-* (ใช้ --theme() ซึ่งใช้นอก @theme ไม่ได้)
const start = theme.indexOf("@theme default {")
let depth = 0, i = theme.indexOf("{", start), end = -1
for (; i < theme.length; i++) {
  if (theme[i] === "{") depth++
  else if (theme[i] === "}") { depth--; if (depth === 0) { end = i; break } }
}
let body = theme.slice(theme.indexOf("{", start) + 1, end)
body = body.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "")
const decls = []
for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
  if (m[1].startsWith("--default-")) continue
  decls.push(`  ${m[1]}: ${m[2].replace(/\s+/g, " ").trim()};`)
}
const tpl = fs.readFileSync(path.join(HERE, "partner-theme.template.css"), "utf8")
const out = tpl.replace("/* @@STOCK_THEME_VARS@@ */", decls.join("\n"))
fs.mkdirSync(path.join(ROOT, "styles"), { recursive: true })
fs.writeFileSync(path.join(ROOT, "styles/partner-theme.css"), out)
console.log(`styles/partner-theme.css: ${decls.length} stock vars`)
