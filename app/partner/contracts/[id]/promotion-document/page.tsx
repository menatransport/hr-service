"use client"

/**
 * หน้าพิมพ์เอกสารแนบท้ายสัญญา หมายเลข 1 (รายละเอียดโปรโมชั่น) — Print → "Save as PDF"
 * แยกออกมาจากสัญญาซื้อขาย (เนื้อหาอยู่ใน components/contract-document.tsx → PromotionAttachment)
 */

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { ArrowLeft, AlertTriangle, FileText } from "lucide-react"
import type { Contract } from "@/lib/partner/types"
import { PromotionAttachment, normPlate, type PromoMaster } from "@/components/partner/contract-document"

export default function PromotionDocumentPage() {
  const { id } = useParams<{ id: string }>()
  const [contract, setContract] = useState<Contract | null>(null)
  const [promo, setPromo] = useState<PromoMaster | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    async function load() {
      try {
        const cRes = await fetch(`/api/partner/contracts/${id}`)
        if (!cRes.ok) throw new Error("ไม่พบข้อมูลสัญญา")
        const c: Contract = await cRes.json()
        setContract(c)
        // browser Save-as-PDF uses the tab title as the default filename
        document.title = `เอกสารแนบท้าย1-โปรโมชั่น-${c.contractCode}-${normPlate(c.licensePlate) || "รถ"}`
        const pRes = await fetch("/api/partner/promotions/master")
        if (pRes.ok) {
          const all: PromoMaster[] = await pRes.json()
          setPromo(all.find((p) => normPlate(p.licensePlate) === normPlate(c.licensePlate)) ?? null)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])


  if (loading)
    return <div className="p-10 text-sm text-zinc-500">กำลังโหลดเอกสารแนบท้าย…</div>
  if (error || !contract)
    return <div className="p-10 text-sm text-red-600">{error || "ไม่พบข้อมูลสัญญา"}</div>

  // ── เช็คความครบถ้วนของข้อมูลโปรโมชั่น ──
  const missing: string[] = []
  if (!promo) missing.push("ข้อมูลโปรโมชั่น (promotion_master)")
  else {
    if (promo.pro1TotalValue == null) missing.push("โปรโมชั่น 1 (ค่าตอบแทนพิเศษ)")
    if (promo.pro2RepairBudget == null) missing.push("โปรโมชั่น 2 (ค่าซ่อมบำรุง)")
    if (promo.pro3AnnualPm == null) missing.push("โปรโมชั่น 3 (ค่า PM)")
  }


  return (
    <div className="contract-doc">
      {/* toolbar (screen only) */}
      <div className="print-hide w-[210mm] mx-auto mb-3 flex items-center gap-2">
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-1.5 text-xs bg-white border border-zinc-300 rounded-lg px-3 py-2 hover:bg-zinc-100"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> กลับ
        </button>
        <a
          href={`/api/partner/contracts/${id}/pdf?type=promotion`}
          target="_blank"
          className="flex items-center gap-1.5 text-xs font-semibold bg-rose-600 text-white rounded-lg px-4 py-2 hover:bg-rose-700"
          title="โหลดเอกสารแนบท้ายโปรโมชั่นเป็น PDF"
        >
          <FileText className="w-3.5 h-3.5" /> โหลด PDF
        </a>
        <a
          href={`/partner/contracts/${id}/document`}
          className="flex items-center gap-1.5 text-xs bg-white border border-zinc-300 rounded-lg px-3 py-2 hover:bg-zinc-100"
        >
          ← สัญญาซื้อขาย
        </a>
      </div>

      {missing.length > 0 ? (
        <div className="print-hide w-[210mm] mx-auto mb-3 text-[11px] bg-amber-50 border border-amber-300 text-amber-800 rounded-lg px-3 py-2">
          <div className="flex items-center gap-1.5 font-semibold mb-1">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            ข้อมูลโปรโมชั่นยังไม่ครบ {missing.length} รายการ — ช่องที่ขาดจะพิมพ์เป็นเส้นประให้เติมด้วยมือ
          </div>
          <div className="flex flex-wrap gap-1 mb-1.5">
            {missing.map((m) => (
              <span key={m} className="bg-white border border-amber-200 rounded px-1.5 py-0.5">{m}</span>
            ))}
          </div>
          <span className="text-amber-700">
            เพิ่ม/แก้ไขข้อมูลทะเบียน {contract.licensePlate} ใน promotion_master
          </span>
        </div>
      ) : (
        <div className="print-hide w-[210mm] mx-auto mb-3 text-[11px] bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-lg px-3 py-2 font-semibold">
          ✓ ข้อมูลโปรโมชั่นครบถ้วน พร้อมออกเอกสารจริง
        </div>
      )}

      <PromotionAttachment contract={contract} promo={promo} />
    </div>
  )
}
