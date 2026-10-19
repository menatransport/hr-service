/**
 * ขั้นแปลงการเข้าถึง MongoDB ของโค้ดรถร่วม → `lib/db/partner.ts` (ให้ผ่าน `check_db_names.mjs`)
 *
 * - `clientPromise` / `client.db(PARTNER_DB)` → `partnerDb()` (ตัวแปร `pdb` ชนิด `PartnerDb`)
 * - `X.collection("ชื่อ" | CONST)` → `partnerColOf(X, "คีย์")` · `(await partnerDb()).collection(..)` → `(await partnerCol("คีย์"))`
 * - ค่าคงที่ชื่อคอลเลกชัน (`const COLL = "contracts"`) → ลบถ้าไม่มีที่ใช้แล้ว ไม่งั้น `PARTNER.คีย์`
 * - `mena-bi.driverCost` / `atms.vehiclemaster` → `biCol()` / `atmsCol()` (อ่านอย่างเดียว)
 *
 * ชื่อที่ resolve ไม่ได้ → โยน error (ไม่เดา) ให้แก้ที่ codemod
 */
import { PARTNER } from "../../lib/db/registry.mjs"

/** คำสามัญ — ตรงกับ GENERIC_WORDS ใน check_db_names.mjs */
const GENERIC = new Set(["contracts", "customers", "drivers", "quotations", "trips", "atms"])

export const NAME2KEY = Object.fromEntries(Object.entries(PARTNER).map(([k, v]) => [v, k]))

const STR = String.raw`"([^"\\]*)"|'([^'\\]*)'`
const CONST_DECL_RE = new RegExp(String.raw`^(\s*)(export\s+)?const\s+([A-Z_][A-Z0-9_]*)\s*=\s*(?:${STR})\s*;?([ \t]*\/\/[^\n]*)?[ \t]*$`, "gm")

/** ค่าคงที่ชื่อคอลเลกชันที่ export จากไฟล์ใดก็ได้ (เช่น QUOTE_COLL) — สร้างจากไฟล์ทั้งหมดก่อนแปลง */
export function collectExportedConsts(files) {
  const map = {}
  for (const src of files) {
    for (const m of src.matchAll(CONST_DECL_RE)) {
      const name = m[4] ?? m[5]
      if (m[2] && NAME2KEY[name]) map[m[3]] = NAME2KEY[name]
    }
  }
  return map
}

export function rewriteDbAccess(file, src, exported) {
  const local = {}
  for (const m of src.matchAll(CONST_DECL_RE)) {
    const name = m[4] ?? m[5]
    if (NAME2KEY[name]) local[m[3]] = NAME2KEY[name]
  }
  const keyOf = (arg) => {
    const lit = /^["'](.*)["']$/.exec(arg)
    if (lit) {
      const k = NAME2KEY[lit[1]]
      if (!k) throw new Error(`${file}: ไม่รู้จักคอลเลกชัน "${lit[1]}" (เพิ่มใน PARTNER ก่อน)`)
      return k
    }
    const k = local[arg] ?? exported[arg]
    if (!k) throw new Error(`${file}: resolve ชื่อคอลเลกชันจาก ${arg} ไม่ได้`)
    return k
  }

  // db ของระบบอื่น (อ่านอย่างเดียว)
  src = src.replace(/^const BI_DB = "mena-bi"\n/m, "")
  src = src.replace(/\bclient\.db\(BI_DB\)\.collection\("driverCost"\)/g, 'await biCol("driverCost")')
  src = src.replace(/^const ATMS_DB\s*=\s*"atms"\n/m, "")
  src = src.replace(/^const ATMS_COLL\s*=\s*"vehiclemaster"\n/m, "")
  src = src.replace(/\bclient\.db\(ATMS_DB\)\.collection\(ATMS_COLL\)/g, 'await atmsCol("vehicleMaster")')

  // client → PartnerDb
  // import แบบ lazy ของเดิม (โมดูลที่ฝั่ง client ใช้ด้วย) — คง lazy ไว้ ไม่ดึง driver เข้าบันเดิล browser
  const lazy = /await import\("@\/lib\/partner\/mongo"\)/.test(src)
  src = src.replace(/^(\s*)const \{ default: clientPromise \} = await import\("@\/lib\/partner\/mongo"\)\n/gm, '$1const { partnerDb } = await import("@/lib/db/partner")\n')
  src = src.replace(/^import\s+clientPromise(?:\s*,\s*\{\s*PARTNER_DB\s*\})?\s+from\s+"@\/lib\/partner\/mongo"\n/m, "")
  src = src.replace(/^import\s+\{\s*PARTNER_DB\s*\}\s+from\s+"@\/lib\/partner\/mongo"\n/m, "")
  src = src.replace(/^const DB\s*=\s*PARTNER_DB\s*\n/m, "")
  src = src.replace(/\bconst client(\s*)= await clientPromise\b/g, "const pdb$1= await partnerDb()")
  src = src.replace(/\bclient\.db\((?:DB|PARTNER_DB)\)/g, "pdb")
  src = src.replace(/\(await clientPromise\)\.db\((?:DB|PARTNER_DB)\)/g, "(await partnerDb())")

  // .collection(..)
  src = src.replace(/\(await partnerDb\(\)\)(\s*)\.collection(<[^()]*?>)?\(\s*("[^"]*"|'[^']*'|[A-Z_][A-Z0-9_]*)\s*\)/g,
    (_m, _ws, t, arg) => `(await partnerCol${t ?? ""}("${keyOf(arg)}"))`)
  src = src.replace(/\b([a-z_$][\w$]*)(\s*)\.collection(<[^()]*?>)?\(\s*("[^"]*"|'[^']*'|[A-Z_][A-Z0-9_]*)\s*\)/g,
    (_m, recv, ws, t, arg) => `${ws.includes("\n") ? ws.replace(/^\n?/, "") : ""}partnerColOf${t ?? ""}(${recv}, "${keyOf(arg)}")`)

  let needPartnerReg = false
  // ค่าคงที่ชื่อคอลเลกชันที่เหลือ
  src = src.replace(CONST_DECL_RE, (line, indent, exp, id, a, b, comment) => {
    const name = a ?? b
    const key = NAME2KEY[name]
    if (!key) return line
    const uses = (src.match(new RegExp(String.raw`\b${id}\b`, "g")) ?? []).length
    if (!exp && uses <= 1) return "\u0000DROP"
    needPartnerReg = true
    return `${indent}${exp ?? ""}const ${id} = PARTNER.${key}${comment ?? ""}`
  })
  src = src.replace(/^\u0000DROP\n/gm, "")

  // ค่าข้อมูลที่บังเอิญเท่ากับชื่อคอลเลกชัน (เช่น `entity: "driver_ledger"` ใน activity_log) → อ้างจากทะเบียน
  // ค่าเท่าเดิมทุกตัว · คำสามัญ (GENERIC_WORDS ใน check_db_names.mjs) ไม่แตะ
  src = src.replace(/(\b[\w-]+)="([a-z]+(?:_[a-z0-9]+)+)"/g, (m, attr, name) =>
    NAME2KEY[name] && !GENERIC.has(name) ? ((needPartnerReg = true), `${attr}={PARTNER.${NAME2KEY[name]}}`) : m)
  src = src.replace(/([:(,=\[]\s*)"([a-z]+(?:_[a-z0-9]+)+)"(?=\s*[,)}\]\n])/g, (m, pre, name) =>
    NAME2KEY[name] && !GENERIC.has(name) ? ((needPartnerReg = true), `${pre}PARTNER.${NAME2KEY[name]}`) : m)


  // ชนิด db ที่ส่งเข้าฟังก์ชัน — db ของรถร่วมทุกตัวเป็น PartnerDb (กันส่ง db ของ hr เข้ามา)
  src = src.replace(/\b(db|database)(\??):\s*Db\b/g, "$1$2: PartnerDb")
  // import Db ที่ไม่ได้ใช้แล้ว
  if ((src.match(/\bDb\b/g) ?? []).length === 1) src = src.replace(/^import type \{ Db \} from "mongodb"\n/m, "")
  // receiver ที่เดิมเป็น any (`db: any`) → `.collection()` เดิมคืน any — คงความหลวมเดิมด้วย AnyDoc ไม่เปลี่ยนชนิดข้อมูล
  // ดูการประกาศ receiver ที่ใกล้ที่สุดก่อนหน้า (พารามิเตอร์ `db: any` หรือ `const db = …`) — เป็น any เฉพาะตัวที่ประกาศ any จริง
  const declaredAny = (recv, at) => {
    const re = new RegExp(String.raw`\b(?:(?:const|let|var)\s+${recv}\b|${recv}\??\s*:\s*([^,)=]+))`, "g")
    let last = null
    for (const d of src.slice(0, at).matchAll(re)) last = d
    return !!last && last[1] !== undefined && /\bany\b/.test(last[1])
  }
  src = src.replace(/partnerColOf\(([\w$]+), ("\w+")\)/g, (m, recv, key, at) =>
    declaredAny(recv, at) ? `(partnerColOf(${recv}, ${key}) as AnyDoc)` : m)
  // aggregateFromBI(client, …) — เดิมรับ client ไปเปิด mena-bi เอง ตอนนี้ใช้ biCol() ข้างใน (พารามิเตอร์คงไว้ตามเดิม)
  src = src.replace(/\baggregateFromBI\(client,/g, "aggregateFromBI(pdb,")

  const names = ["partnerDb", "partnerCol", "partnerColOf", "biCol", "atmsCol"].filter((n) => new RegExp(String.raw`\b${n}\(`).test(src) || new RegExp(String.raw`\b${n}[<(]`).test(src))
  if (/\bPartnerDb\b/.test(src)) names.push("type PartnerDb")
  if (/\bAnyDoc\b/.test(src)) names.push("type AnyDoc")
  src = src.replace(/^import \{[^}]*\} from "@\/lib\/db\/partner(?:-col)?"\n/gm, "") // รันซ้ำได้ — สร้างบรรทัด import ใหม่ทุกครั้ง
  const lines = []
  // ส่วน pure (partnerColOf + ชนิด) มาจาก partner-col — ไม่ดึง driver ของ Mongo เข้าบันเดิลฝั่ง client
  const pure = names.filter((n) => /^(partnerColOf|type PartnerDb|type AnyDoc)$/.test(n))
  const io = names.filter((n) => !pure.includes(n) && !(lazy && n === "partnerDb"))
  if (pure.length) lines.push(`import { ${pure.join(", ")} } from "@/lib/db/partner-col"`)
  if (io.length) lines.push(`import { ${io.join(", ")} } from "@/lib/db/partner"`)
  if (needPartnerReg && !/import \{[^}]*\bPARTNER\b[^}]*\} from "@\/lib\/db\/registry\.mjs"/.test(src)) lines.push('import { PARTNER } from "@/lib/db/registry.mjs"')
  for (const l of lines) src = addImport(src, l)
  return src
}

function addImport(src, line) {
  const ls = src.split("\n")
  let last = -1
  for (let i = 0; i < ls.length; i++) {
    if (/^import\s/.test(ls[i])) {
      let j = i
      while (j < ls.length - 1 && !/(from\s+["'][^"']+["']|^import\s+["'][^"']+["'])\s*;?\s*$/.test(ls[j])) j++
      last = j
      i = j
    } else if (last >= 0 && ls[i].trim() && !/^(\/\/|\/\*|\*)/.test(ls[i].trim())) break
  }
  if (last === -1) {
    last = ls.findIndex((l) => /^["']use (client|server)["']/.test(l))
  }
  ls.splice(last + 1, 0, line)
  return ls.join("\n")
}
