"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePartnerSession } from "@/lib/partner/auth/client"
import { toast } from "sonner"
import { BookImage, ExternalLink, Download, Settings2, Search, AlertTriangle, Truck, Check, RotateCcw } from "lucide-react"
import { Button } from "@/components/partner/ui/button"
import { Input } from "@/components/partner/ui/input"
import { TableSkeleton } from "@/components/partner/ui/skeleton"
import { displaySalePrice } from "@/lib/partner/sale-display"
import { hasPerm } from "@/lib/partner/rbac"
import type { CatalogConfig } from "@/lib/partner/catalog-config"

/**
 * Catalog รถ — ลิสต์รถพร้อมขาย (saleStatus ready + ไม่มีสัญญา) → PDF รายคัน / รวมเล่ม
 * + แผงตั้งค่า template ข้อความ (admin/fleet) เก็บใน catalog_config
 */

interface Row {
  licensePlate: string
  status: "contract" | "active" | "inactive"
  saleStatus: string | null
  vehicleBrand?: string
  vehicleModel?: string
  truckNumber?: string
  photoUrl?: string
  photos?: Record<string, string>
  totalSalePrice: number
  monthlyPayment: number
  financeInstallments: number
  downPayment: number
}

const fmtRound = (v: number) => Math.round(v).toLocaleString("en-US")
const posterHref = (plate: string) => `/partner/catalog/poster?plate=${encodeURIComponent(plate)}`
const pdfHref = (plate: string, dl = false) => `/api/partner/catalog/${encodeURIComponent(plate)}/pdf${dl ? "?download=1" : ""}`

function ConfigPanel({ onClose }: { onClose: () => void }) {
  const [cfg, setCfg]       = useState<CatalogConfig | null>(null)
  const [defaults, setDef]  = useState<CatalogConfig | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    fetch("/api/partner/catalog/config").then((r) => r.json()).then((j) => { setCfg(j.config); setDef(j.defaults) }).catch(() => toast.error("โหลด template ไม่สำเร็จ"))
  }, [])
  async function save() {
    if (!cfg) return
    setSaving(true)
    try {
      const r = await fetch("/api/partner/catalog/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(j.error ?? "บันทึกไม่สำเร็จ"); return }
      setCfg(j.config); toast.success("บันทึก template แล้ว — PDF ที่เปิดใหม่จะใช้ข้อความชุดนี้")
      onClose()
    } finally { setSaving(false) }
  }
  const lines = (v: string[]) => v.join("\n")
  const setLines = (k: "sellingPoints" | "terms") => (e: React.ChangeEvent<HTMLTextAreaElement>) =>
    setCfg((p) => p ? { ...p, [k]: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) } : p)
  const field = "w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-4 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-zinc-900 shadow-xl border border-zinc-200 dark:border-zinc-800 my-6" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-zinc-400">Template</p>
            <p className="text-base font-bold">ข้อความใน Catalog (ใช้กับทุกคัน)</p>
          </div>
          {defaults && cfg && (
            <button type="button" className="text-xs text-zinc-500 hover:text-zinc-800 inline-flex items-center gap-1" onClick={() => setCfg({ ...cfg, ...defaults })}>
              <RotateCcw className="w-3 h-3" />คืนค่าเริ่มต้น
            </button>
          )}
        </div>
        {!cfg ? <div className="p-5 text-sm text-zinc-400">กำลังโหลด…</div> : (
          <div className="px-5 py-4 space-y-4">
            <div>
              <label className="text-xs text-zinc-500">สโลแกนใต้โลโก้</label>
              <input className={field} value={cfg.tagline} onChange={(e) => setCfg({ ...cfg, tagline: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-zinc-500">จุดขาย (บรรทัดละ 1 ข้อ, สูงสุด 10)</label>
              <textarea className={field} rows={5} defaultValue={lines(cfg.sellingPoints)} onBlur={setLines("sellingPoints")} />
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div><label className="text-xs text-zinc-500">ชื่อผู้ติดต่อ / ทีม</label><input className={field} value={cfg.contactName} onChange={(e) => setCfg({ ...cfg, contactName: e.target.value })} /></div>
              <div><label className="text-xs text-zinc-500">โทรศัพท์</label><input className={field} value={cfg.contactPhone} onChange={(e) => setCfg({ ...cfg, contactPhone: e.target.value })} placeholder="08x-xxx-xxxx" /></div>
              <div><label className="text-xs text-zinc-500">LINE ID</label><input className={field} value={cfg.contactLine} onChange={(e) => setCfg({ ...cfg, contactLine: e.target.value })} /></div>
            </div>
            <div>
              <label className="text-xs text-zinc-500">เงื่อนไข/หมายเหตุท้ายหน้า (บรรทัดละ 1 ข้อ, สูงสุด 6)</label>
              <textarea className={field} rows={3} defaultValue={lines(cfg.terms)} onBlur={setLines("terms")} />
            </div>
            {cfg.updatedAt && <p className="text-[11px] text-zinc-400">แก้ล่าสุด {new Date(cfg.updatedAt).toLocaleString("th-TH")} โดย {cfg.updatedBy}</p>}
          </div>
        )}
        <div className="px-5 py-4 border-t border-zinc-100 dark:border-zinc-800 flex gap-2">
          <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white h-9 text-sm" onClick={save} disabled={saving || !cfg}>
            {saving ? "กำลังบันทึก..." : <><Check className="w-3.5 h-3.5 mr-1.5" />บันทึก template</>}
          </Button>
          <Button variant="outline" className="h-9 text-sm" onClick={onClose}>ปิด</Button>
        </div>
      </div>
    </div>
  )
}

export default function CatalogPage() {
  const { data: session } = usePartnerSession()
  const canEdit = hasPerm(session?.user?.role, "masterdata")
  const [rows, setRows]       = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ]             = useState("")
  const [showAll, setShowAll] = useState(false)   // false = เฉพาะพร้อมขาย
  const [showCfg, setShowCfg] = useState(false)

  useEffect(() => {
    fetch("/api/partner/price-list").then((r) => (r.ok ? r.json() : [])).then(setRows).finally(() => setLoading(false))
  }, [])

  const ready = useMemo(() => rows.filter((r) => r.status === "active" && r.saleStatus === "ready"), [rows])
  const list = useMemo(() => {
    const base = showAll ? rows.filter((r) => r.status !== "inactive") : ready
    const lq = q.trim().toLowerCase()
    return lq ? base.filter((r) => [r.licensePlate, r.vehicleBrand, r.vehicleModel, r.truckNumber].some((f) => (f ?? "").toLowerCase().includes(lq))) : base
  }, [rows, ready, showAll, q])
  const noPhoto = ready.filter((r) => !r.photoUrl).length

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zinc-400">ระบบขาย</p>
          <h1 className="text-2xl font-bold flex items-center gap-2"><BookImage className="w-6 h-6 text-[#C9A227]" />Catalog รถ</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            แคตตาล็อก PDF 1 หน้า/คัน สร้างอัตโนมัติจากข้อมูลรถ + ราคาขาย + โปรโมชั่น · รถพร้อมขาย {ready.length} คัน
            {noPhoto > 0 && <span className="text-amber-600"> · ยังไม่มีรูป {noPhoto} คัน</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canEdit && (
            <Button variant="outline" className="h-9 text-sm gap-1.5" onClick={() => setShowCfg(true)}>
              <Settings2 className="w-3.5 h-3.5" />ตั้งค่า template
            </Button>
          )}
          <a href="/api/partner/catalog/pdf" target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700">
            <Download className="w-3.5 h-3.5" />รวม Catalog รถพร้อมขาย ({ready.length})
          </a>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {[{ k: false, l: `รถพร้อมขาย (${ready.length})` }, { k: true, l: "ทุกคันในราคาขาย" }].map((t) => (
          <button key={String(t.k)} onClick={() => setShowAll(t.k)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${showAll === t.k
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"}`}>{t.l}</button>
        ))}
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
          <Input placeholder="ค้นหาทะเบียน / ยี่ห้อ / เบอร์รถ" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-64 text-xs pl-8" />
        </div>
      </div>

      {loading ? <TableSkeleton rows={6} /> : (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-x-auto bg-white dark:bg-zinc-900">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-[11px] uppercase tracking-wider text-zinc-400">
              <tr>
                <th className="px-3 py-2 text-left w-20">รูป</th>
                <th className="px-3 py-2 text-left">ทะเบียน / รถ</th>
                <th className="px-3 py-2 text-right">ราคาขาย</th>
                <th className="px-3 py-2 text-right">ผ่อน/เดือน</th>
                <th className="px-3 py-2 text-left">สถานะ</th>
                <th className="px-3 py-2 text-right">Catalog</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {list.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-zinc-400 text-sm">ไม่มีรถในกลุ่มนี้</td></tr>
              )}
              {list.map((r) => (
                <tr key={r.licensePlate} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40">
                  <td className="px-3 py-2">
                    {r.photoUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={r.photoUrl} alt="" className="w-16 h-11 object-cover rounded-md border border-zinc-200 dark:border-zinc-700" />
                      : <div className="w-16 h-11 rounded-md border border-dashed border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 flex items-center justify-center" title="ยังไม่มีรูป — อัปโหลดที่หน้า รถ"><Truck className="w-4 h-4 text-amber-400" /></div>}
                  </td>
                  <td className="px-3 py-2">
                    <p className="font-semibold">{r.licensePlate}{r.truckNumber ? <span className="text-zinc-400 font-normal text-xs"> · เบอร์ {r.truckNumber}</span> : null}</p>
                    <p className="text-xs text-zinc-500">{[r.vehicleBrand, r.vehicleModel].filter(Boolean).join(" ") || "—"}</p>
                    {!r.photoUrl && <p className="text-[11px] text-amber-600 inline-flex items-center gap-1 mt-0.5"><AlertTriangle className="w-3 h-3" />ยังไม่มีรูป — <Link href="/partner/vehicles" className="underline">อัปโหลดที่หน้า รถ</Link></p>}
                  </td>
                  {/* ราคาปัดเลขกลม ชุดเดียวกับโปสเตอร์ (lib/sale-display) — ตัวเลขจริงดูที่หน้าราคาขาย/PDF */}
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.totalSalePrice ? <p className="font-semibold">{fmtRound(displaySalePrice(r).price)}</p> : "—"}
                    {r.totalSalePrice > 0 && r.downPayment > 0 && <p className="text-zinc-400 text-xs">ดาวน์ {fmtRound(displaySalePrice(r).downPayment)}</p>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.monthlyPayment ? <>{fmtRound(displaySalePrice(r).monthlyPayment)}<span className="text-zinc-400 text-xs"> × {r.financeInstallments || "-"}</span></> : "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold text-[10px] ${
                      r.status === "contract" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                      : r.saleStatus === "ready" ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                      : "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"}`}>
                      {r.status === "contract" ? "ติดสัญญา" : r.saleStatus === "ready" ? "พร้อมขาย" : "ระหว่างดำเนินการ"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <a href={posterHref(r.licensePlate)} target="_blank" rel="noreferrer" title="เปิดโปสเตอร์ (ดาวน์โหลด PNG / PDF ได้ในหน้า)"
                      className="inline-flex items-center gap-1 rounded-md border border-[#E7C86E] px-2 py-1 text-xs font-semibold text-[#8C6B1F] hover:bg-[#FAF7EF] dark:hover:bg-zinc-800">
                      <ExternalLink className="w-3 h-3" />เปิด
                    </a>
                    <a href={pdfHref(r.licensePlate, true)} title="ดาวน์โหลด PDF"
                      className="ml-1 inline-flex items-center gap-1 rounded-md border border-zinc-200 dark:border-zinc-700 px-2 py-1 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800">
                      <Download className="w-3 h-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCfg && <ConfigPanel onClose={() => setShowCfg(false)} />}
    </div>
  )
}
