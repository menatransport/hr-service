/* eslint-disable react-hooks/set-state-in-effect -- โค้ดเดิมจาก mena-partner-driver ย้ายมาโดยไม่แก้ตรรกะ (scripts/partner-codemod/lint-legacy-disable.mjs) */
"use client"

import { useEffect, useState } from "react"
import { X, Clock } from "lucide-react"

type Change = { from: unknown; to: unknown }
interface Entry {
  action:   string
  changes:  Record<string, Change>
  editedBy: { email: string; name?: string }
  editedAt: string
}

const THAI_MONTHS = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."]

const SALE_LABEL: Record<string, string> = {
  ready:    "พร้อมขาย",
  repair15: "รอซ่อม 15 วัน",
  repair30: "รอซ่อม 30 วัน",
  review:   "ยังไม่ได้เริ่มดำเนินการ",
}
const FIELD_LABEL: Record<string, string> = {
  saleStatus:  "สถานะ",
  repairStart: "เริ่มซ่อม",
  repairEnd:   "กำหนดเสร็จ",
}

function thaiDateTime(iso: string) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const time = d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear()}/${d.getFullYear() + 543} ${time} น.`
}

function thaiDate(v: string) {
  const [y, m, dd] = v.slice(0, 10).split("-")
  if (!y || !m || !dd) return v
  return `${parseInt(dd)} ${THAI_MONTHS[parseInt(m) - 1]} ${parseInt(y)}/${parseInt(y) + 543}`
}

/** แปลงค่า from/to เป็นข้อความอ่านง่ายตามชนิดของ field */
function fmtVal(field: string, v: unknown) {
  if (v === null || v === undefined || v === "") return "—"
  if (field === "saleStatus") return SALE_LABEL[String(v)] ?? String(v)
  if (field === "repairStart" || field === "repairEnd") return thaiDate(String(v))
  return String(v)
}

/** drawer แสดงประวัติการแก้ไขของทะเบียนหนึ่ง — เปิดเมื่อ plate ไม่เป็น null */
export function PriceHistoryDrawer({ plate, onClose }: { plate: string | null; onClose: () => void }) {
  const [entries, setEntries] = useState<Entry[] | null>(null)

  useEffect(() => {
    if (!plate) return
    setEntries(null)
    fetch(`/api/partner/price-list/history?plate=${encodeURIComponent(plate)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setEntries)
      .catch(() => setEntries([]))
  }, [plate])

  if (!plate) return null

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full max-w-sm h-full bg-white dark:bg-zinc-900 shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800 px-4 py-3 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-sm font-bold text-zinc-800 dark:text-zinc-100">
              <Clock className="w-4 h-4" /> ประวัติการแก้ไข
            </div>
            <div className="text-xs text-zinc-400">{plate}</div>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4">
          {entries === null ? (
            <div className="text-sm text-zinc-400">กำลังโหลด...</div>
          ) : entries.length === 0 ? (
            <div className="text-sm text-zinc-400">ยังไม่มีประวัติการแก้ไข</div>
          ) : (
            <ol className="space-y-4">
              {entries.map((e, i) => (
                <li key={i} className="relative pl-4 border-l-2 border-zinc-200 dark:border-zinc-700">
                  <div className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-emerald-500" />
                  <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                    {e.editedBy?.name || e.editedBy?.email || "ไม่ทราบผู้แก้ไข"}
                  </div>
                  <div className="text-[11px] text-zinc-400 mb-1">{thaiDateTime(e.editedAt)}</div>
                  <ul className="space-y-0.5">
                    {Object.entries(e.changes ?? {}).map(([field, ch]) => (
                      <li key={field} className="text-[11px] text-zinc-600 dark:text-zinc-300">
                        <span className="text-zinc-400">{FIELD_LABEL[field] ?? field}:</span>{" "}
                        {fmtVal(field, ch.from)} <span className="text-zinc-400">→</span> {fmtVal(field, ch.to)}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  )
}
