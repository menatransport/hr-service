"use client"

import { useState } from "react"
import { toast } from "sonner"
import { UserMinus } from "lucide-react"
import { Button } from "@/components/partner/ui/button"
import { ThaiDateInput } from "@/components/partner/thai-date-input"
import type { Driver, ExitType } from "@/lib/partner/types"

/** ฟอร์มพ้นสภาพ — ประเภท 2 แบบ + เหตุผล + วันที่ → POST /api/drivers/[id]/exit (ทำสัญญา/รถให้ครบชุด) */
export function DriverExitDialog({ driver, onClose, onDone }: { driver: Driver; onClose: () => void; onDone: () => void }) {
  const [exitType, setExitType]     = useState<ExitType>("paid_exit")
  const [exitReason, setExitReason] = useState("")
  const [endDate, setEndDate]       = useState(new Date().toISOString().slice(0, 10))
  const [busy, setBusy]             = useState(false)
  const [err, setErr]               = useState("")
  const OPTS: { v: ExitType; title: string; desc: string; effect: string }[] = [
    { v: "paid_exit",  title: "ผ่อนหมดแล้ว — ขอเอารถออกจากระบบ", desc: "อาจจะขายรถไป หรือไปวิ่งงานที่อื่น",
      effect: "สัญญา → สิ้นสุด (ปิดงวด) · รถ → ไม่ใช้งาน" },
    { v: "early_exit", title: "ผ่อนยังไม่หมด — โดนปลด / ขอคืนรถ", desc: "ผ่อนไม่ไหว, รายได้น้อย ฯลฯ",
      effect: "สัญญา → ยกเลิก · รถ → อยู่ระหว่างดำเนินการให้พร้อมขาย" },
  ]
  async function submit() {
    setBusy(true); setErr("")
    try {
      const r = await fetch(`/api/partner/drivers/${driver._id}/exit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exitType, exitReason, endDate }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(j.error ?? "ไม่สำเร็จ"); return }
      toast.success(`พ้นสภาพแล้ว${j.contractStatus ? ` · สัญญา ${j.contractCode} → ${j.contractStatus === "completed" ? "สิ้นสุด" : "ยกเลิก"}` : ""}${j.vehicleAction ? ` · ${j.vehicleAction}` : ""}`)
      onDone()
    } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 shadow-xl border border-zinc-200 dark:border-zinc-800" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <p className="text-[10px] uppercase tracking-wider text-zinc-400">พ้นสภาพ</p>
          <p className="text-base font-bold">{driver.firstName} {driver.lastName} <span className="text-zinc-400 font-normal text-sm">· {driver.contractCode || "ไม่มีรหัสสัญญา"}</span></p>
        </div>
        <div className="px-5 py-4 space-y-3">
          {OPTS.map((o) => (
            <button key={o.v} type="button" onClick={() => setExitType(o.v)}
              className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${exitType === o.v
                ? "border-rose-400 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-700"
                : "border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"}`}>
              <p className="text-sm font-semibold">{o.title}</p>
              <p className="text-xs text-zinc-500">{o.desc}</p>
              <p className="text-[11px] text-rose-600 dark:text-rose-300 mt-1">{o.effect}</p>
            </button>
          ))}
          <div>
            <label className="text-xs text-zinc-500">วันที่พ้นสภาพ</label>
            <ThaiDateInput value={endDate} onChange={setEndDate} className="h-9 text-sm" />
          </div>
          <div>
            <label className="text-xs text-zinc-500">เหตุผล / หมายเหตุ</label>
            <textarea value={exitReason} onChange={(e) => setExitReason(e.target.value)} rows={2}
              placeholder="เช่น ขายรถให้บุคคลอื่น / ย้ายไปวิ่งงานที่แพล้นท์อื่น / ผ่อนไม่ไหว"
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm" />
          </div>
          {err && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg">{err}</p>}
        </div>
        <div className="px-5 py-4 border-t border-zinc-100 dark:border-zinc-800 flex gap-2">
          <Button className="flex-1 bg-rose-600 hover:bg-rose-700 text-white h-9 text-sm" onClick={submit} disabled={busy}>
            {busy ? "กำลังบันทึก..." : <><UserMinus className="w-3.5 h-3.5 mr-1.5" />ยืนยันพ้นสภาพ</>}
          </Button>
          <Button variant="outline" className="h-9 text-sm" onClick={onClose} disabled={busy}>ยกเลิก</Button>
        </div>
      </div>
    </div>
  )
}

