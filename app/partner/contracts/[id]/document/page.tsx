"use client"

/**
 * หน้าพิมพ์เอกสารสัญญาซื้อขาย — Print → browser "Save as PDF"
 * ตัวเนื้อเอกสารอยู่ใน components/contract-document.tsx (ใช้ร่วมกับ preview)
 */

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { ArrowLeft, AlertTriangle, FileDown, FileText } from "lucide-react"
import type { Contract } from "@/lib/partner/types"
import { missingDocFields } from "@/lib/partner/contract-doc"
import { ContractDocument, normPlate, type PromoMaster } from "@/components/partner/contract-document"
import { COMPANY_DEFAULT, type CompanyConfig } from "@/lib/partner/company-config"

export default function ContractDocumentPage() {
  const { id } = useParams<{ id: string }>()
  const [contract, setContract] = useState<Contract | null>(null)
  const [promo, setPromo] = useState<PromoMaster | null>(null)
  const [company, setCompany] = useState<CompanyConfig>(COMPANY_DEFAULT)
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
        document.title = `สัญญาซื้อขาย-${c.contractCode}-${normPlate(c.licensePlate) || "รถ"}`
        // ใช้เวอร์ชันที่สัญญาจำไว้ เพื่อให้พิมพ์ซ้ำได้เหมือนวันที่เซ็น
        const coRes = await fetch(`/api/partner/company-config${c.companyVersion ? `?version=${c.companyVersion}` : ""}`)
        if (coRes.ok) setCompany(await coRes.json())
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
    return <div className="p-10 text-sm text-zinc-500">กำลังโหลดเอกสารสัญญา…</div>
  if (error || !contract)
    return <div className="p-10 text-sm text-red-600">{error || "ไม่พบข้อมูลสัญญา"}</div>

  // ── เช็คความครบถ้วน (เกณฑ์เดียวกับหน้าแก้ไขสัญญา) — ทุกข้อมูลในสัญญาจำเป็น ──
  const missing = missingDocFields(contract).map((f) => f.label)
  if (!promo) missing.push("ข้อมูลโปรโมชั่น (promotion_master)")


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
          href={`/api/partner/contracts/${id}/docx?type=sale`}
          className="flex items-center gap-1.5 text-xs font-semibold bg-sky-600 text-white rounded-lg px-4 py-2 hover:bg-sky-700"
          title="ดาวน์โหลดเป็นไฟล์ Word (.docx) รูปแบบตรงต้นฉบับ"
        >
          <FileDown className="w-3.5 h-3.5" /> โหลด .docx
        </a>
        <a
          href={`/api/partner/contracts/${id}/pdf?type=sale`}
          target="_blank"
          className="flex items-center gap-1.5 text-xs font-semibold bg-rose-600 text-white rounded-lg px-4 py-2 hover:bg-rose-700"
          title="โหลดเป็น PDF (แปลงจาก .docx ให้ตรงต้นฉบับ)"
        >
          <FileText className="w-3.5 h-3.5" /> โหลด PDF
        </a>
        <a
          href={`/partner/contracts/${id}/promotion-document`}
          className="flex items-center gap-1.5 text-xs bg-white border border-zinc-300 rounded-lg px-3 py-2 hover:bg-zinc-100"
        >
          เอกสารแนบท้าย (โปรโมชั่น) →
        </a>
        <a
          href={`/partner/contracts/${id}/hire-document`}
          className="flex items-center gap-1.5 text-xs bg-white border border-zinc-300 rounded-lg px-3 py-2 hover:bg-zinc-100"
        >
          สัญญาว่าจ้าง →
        </a>
      </div>

      {missing.length > 0 ? (
        <div className="print-hide w-[210mm] mx-auto mb-3 text-[11px] bg-amber-50 border border-amber-300 text-amber-800 rounded-lg px-3 py-2">
          <div className="flex items-center gap-1.5 font-semibold mb-1">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            ข้อมูลยังไม่ครบ {missing.length} รายการ — ช่องที่ขาดจะพิมพ์เป็นเส้นประให้เติมด้วยมือ
          </div>
          <div className="flex flex-wrap gap-1 mb-1.5">
            {missing.map((m) => (
              <span key={m} className="bg-white border border-amber-200 rounded px-1.5 py-0.5">{m}</span>
            ))}
          </div>
          <a href={`/partner/contracts/${id}`} className="underline font-semibold hover:text-amber-900">
            → ไปกรอกข้อมูลที่หน้าแก้ไขสัญญา
          </a>
          {!promo && <span className="ml-2 text-amber-700">(โปรโมชั่น: เพิ่มข้อมูลทะเบียน {contract.licensePlate} ใน promotion_master)</span>}
        </div>
      ) : (
        <div className="print-hide w-[210mm] mx-auto mb-3 text-[11px] bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-lg px-3 py-2 font-semibold">
          ✓ ข้อมูลครบถ้วน พร้อมออกเอกสารจริง
        </div>
      )}

      <ContractDocument contract={contract} promo={promo} company={company} />
    </div>
  )
}
