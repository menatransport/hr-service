"use client"

/**
 * Master ข้อมูลบริษัท + ผู้ลงนามบนสัญญา
 * แก้ที่นี่ที่เดียว มีผลกับพรีวิว/หน้าพิมพ์ และไฟล์ PDF ทุกชนิดสัญญา
 * (ไฟล์ Word ใช้ชุดเดียวกันผ่าน placeholder ในไฟล์ต้นแบบ)
 */

import { useEffect, useState } from "react"
import { usePartnerSession } from "@/lib/partner/auth/client"
import { Save, Building2 } from "lucide-react"
import { Input } from "@/components/partner/ui/input"
import { Button } from "@/components/partner/ui/button"
import { COMPANY_DEFAULT, type CompanyConfig } from "@/lib/partner/company-config"
import { formatDate } from "@/lib/partner/utils"

export default function CompanyMasterPage() {
  const { data: session } = usePartnerSession()
  const isAdmin = ["admin", "superadmin"].includes(session?.user?.role ?? "")
  const [cfg, setCfg] = useState<CompanyConfig>(COMPANY_DEFAULT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")
  const [versions, setVersions] = useState<CompanyConfig[]>([])
  const [viewing, setViewing] = useState<number | null>(null)

  const loadVersions = () =>
    fetch("/api/partner/company-config?versions=1").then((r) => (r.ok ? r.json() : [])).then(setVersions)

  useEffect(() => {
    fetch("/api/partner/company-config")
      .then((r) => (r.ok ? r.json() : COMPANY_DEFAULT))
      .then(setCfg)
      .finally(() => setLoading(false))
    loadVersions()
  }, [])

  const set = (k: keyof CompanyConfig, v: string) => setCfg((p) => ({ ...p, [k]: v }))
  const setAt = (k: "sellerSignatories" | "witnesses", i: number, v: string) =>
    setCfg((p) => ({ ...p, [k]: p[k].map((x, j) => (j === i ? v : x)) }))

  async function save() {
    setSaving(true); setError("")
    try {
      const res = await fetch("/api/partner/company-config", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg),
      })
      if (!res.ok) { setError((await res.json()).error ?? "บันทึกไม่สำเร็จ"); return }
      setCfg(await res.json())
      setViewing(null)
      await loadVersions()
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } finally { setSaving(false) }
  }

  if (loading) return <div className="p-6 text-sm text-zinc-400">กำลังโหลด…</div>

  const field = "h-9 text-sm"
  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div className="flex items-center gap-2">
        <Building2 className="w-5 h-5 text-emerald-600" />
        <h1 className="text-lg font-bold">ข้อมูลบริษัท & ผู้ลงนามบนสัญญา</h1>
      </div>
      <p className="text-sm text-zinc-500">
        ใช้กับสัญญาทุกชนิด (ซื้อขาย · ว่าจ้าง · ค้ำประกัน · เปิดเจ้าหนี้) ทั้งหน้าพิมพ์ ไฟล์ PDF และไฟล์ Word
        เปลี่ยนคนเซ็นที่นี่ที่เดียว ไม่ต้องแก้โค้ด
      </p>

      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">ชื่อบริษัท</label>
          <Input value={cfg.name} disabled={!isAdmin} onChange={(e) => set("name", e.target.value)} className={field} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">ทะเบียนนิติบุคคลเลขที่</label>
            <Input value={cfg.regNo} disabled={!isAdmin} onChange={(e) => set("regNo", e.target.value)} className={field} />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">ที่อยู่สำนักงานใหญ่</label>
            <Input value={cfg.address} disabled={!isAdmin} onChange={(e) => set("address", e.target.value)} className={field} />
          </div>
        </div>

        {([["sellerSignatories", "ผู้ลงนามฝ่ายผู้ขาย"], ["witnesses", "พยาน"]] as const).map(([key, label]) => (
          <div key={key}>
            <label className="block text-xs font-medium text-zinc-500 mb-1">{label}</label>
            <div className="grid grid-cols-2 gap-4">
              {[0, 1].map((i) => (
                <Input
                  key={i}
                  value={cfg[key][i] ?? ""}
                  disabled={!isAdmin}
                  placeholder={`${label}คนที่ ${i + 1}`}
                  onChange={(e) => setAt(key, i, e.target.value)}
                  className={field}
                />
              ))}
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">เว้นว่าง = พิมพ์เส้นให้เซ็นโดยไม่มีชื่อในวงเล็บ</p>
          </div>
        ))}
      </div>

      {versions.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
          <h2 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 mb-1">ประวัติเวอร์ชัน</h2>
          <p className="text-xs text-zinc-500 mb-3">
            สัญญาจำเวอร์ชันที่ใช้ตอนสร้างไว้ พิมพ์เอกสารซ้ำภายหลังจะได้ชื่อผู้ลงนามชุดเดิมเสมอ
          </p>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 text-sm">
            {versions.map((v) => (
              <li key={v.version} className="py-2 flex items-center gap-3">
                <span className="font-semibold tabular-nums w-16">v{v.version}</span>
                <span className="flex-1 min-w-0 truncate text-zinc-600 dark:text-zinc-300">
                  {v.sellerSignatories.filter(Boolean).join(" · ")}
                </span>
                <span className="text-xs text-zinc-400 whitespace-nowrap">
                  {v.updatedAt ? formatDate(v.updatedAt) : "—"} · {v.updatedBy ?? "—"}
                </span>
                <button
                  type="button"
                  onClick={() => { setCfg({ ...v }); setViewing(v.version ?? null) }}
                  className="text-xs text-emerald-600 underline underline-offset-2"
                >
                  ดูค่าชุดนี้
                </button>
              </li>
            ))}
          </ul>
          {viewing !== null && (
            <p className="text-xs text-amber-600 mt-3">
              กำลังดูค่าเวอร์ชัน {viewing} ในฟอร์มด้านบน — กดบันทึกจะกลายเป็นเวอร์ชันใหม่ล่าสุด (ของเดิมไม่หาย)
            </p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={!isAdmin || saving} className="gap-2">
          <Save className="w-4 h-4" />{saving ? "กำลังบันทึก…" : "บันทึก"}
        </Button>
        {saved && <span className="text-sm text-emerald-600">บันทึกแล้ว</span>}
        {!isAdmin && <span className="text-sm text-zinc-400">ดูอย่างเดียว — ต้องเป็นผู้ดูแลระบบจึงจะแก้ได้</span>}
        {cfg.updatedAt && (
          <span className="ml-auto text-xs text-zinc-400">
            เวอร์ชันปัจจุบัน v{cfg.version} · แก้ล่าสุด {formatDate(cfg.updatedAt)} โดย {cfg.updatedBy}
          </span>
        )}
      </div>
    </div>
  )
}
