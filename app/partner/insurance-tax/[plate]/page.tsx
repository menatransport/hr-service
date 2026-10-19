"use client"

/**
 * หน้าจัดการภาษี & ประกันภัย รายทะเบียน (เต็มหน้า)
 * — 4 การ์ดรายการ (ประกันภัย/พรบ./ภาษีทะเบียน/ตรวจสภาพ) + ประวัติ + ต่ออายุทั้งชุด
 * เนื้อหาหลักอยู่ใน ManageDrawer (โหมด fullPage) จาก ../shared
 */

import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { usePartnerSession } from "@/lib/partner/auth/client"
import { ArrowLeft, ShieldCheck } from "lucide-react"
import { ManageDrawer, normalizeRow, STATUS_LABEL, STATUS_COLOR, type Row } from "../shared"
import { ActivityHistory } from "@/components/partner/activity-history"

export default function InsuranceTaxPlatePage() {
  const { plate } = useParams<{ plate: string }>()
  const router = useRouter()
  const { data: session } = usePartnerSession()
  const isAdmin = ["admin", "superadmin"].includes(session?.user?.role ?? "")

  const plateKey = decodeURIComponent(plate ?? "")
  const [row, setRow] = useState<Row | null | undefined>(undefined) // undefined = กำลังโหลด

  const load = useCallback(() => {
    fetch("/api/partner/insurance-tax")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items?: unknown[] }) => {
        const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
        const rows = (d.items ?? []).map((raw) => normalizeRow(raw, today))
        const found = rows.find(
          (r) => r.platePlain === plateKey || r.licensePlate === plateKey
        )
        setRow(found ?? null)
      })
      .catch(() => setRow(null))
  }, [plateKey])

  useEffect(() => { load() }, [load])

  return (
    <div>
      {/* header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> กลับ
            </button>
            <Link href="/partner/insurance-tax" className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
              ภาษี &amp; ประกันภัย ทั้งหมด →
            </Link>
          </div>
          <h1 className="text-xl font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
            {row?.licensePlate ?? plateKey}
            {row?.worstStatus && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLOR[row.worstStatus]}`}>
                {STATUS_LABEL[row.worstStatus]}
              </span>
            )}
          </h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            {[row?.truckNumber, row?.driverName, row?.contractCode].filter(Boolean).join(" · ") || "จัดการภาษี & ประกันภัยของทะเบียนนี้"}
          </p>
        </div>
        {row && (
          <ActivityHistory
            entity="insurance_tax"
            entityId={row.platePlain}
            fieldLabels={{
              amount: "จำนวนเงิน", effectiveDate: "วันเริ่ม", expiryDate: "วันหมดอายุ", company: "บริษัท",
              monthlyInstallment: "หัก/เดือน", installmentCount: "จำนวนงวด", status: "สถานะ",
            }}
            actionLabels={{ edit: "แก้ไข", add: "เพิ่ม/ต่ออายุ" }}
          />
        )}
      </div>

      {row === undefined ? (
        <div className="px-4 py-16 text-center text-sm text-zinc-400">กำลังโหลด...</div>
      ) : row === null ? (
        <div className="px-4 py-16 text-center text-sm text-zinc-400">
          ไม่พบทะเบียน <span className="font-mono">{plateKey}</span> —{" "}
          <Link href="/partner/insurance-tax" className="text-emerald-600 hover:underline">กลับไปหน้ารวม</Link>
        </div>
      ) : (
        <ManageDrawer
          fullPage
          row={row}
          isAdmin={isAdmin}
          onClose={() => router.push("/partner/insurance-tax")}
          onChanged={load}
        />
      )}
    </div>
  )
}
