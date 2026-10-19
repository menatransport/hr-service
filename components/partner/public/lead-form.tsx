"use client"

import { useState } from "react"
import { telHref } from "./thai-text"

/**
 * ฟอร์มฝากเบอร์ — สั้นที่สุดเท่าที่ฝ่ายขายต้องใช้โทรกลับ (ชื่อ + เบอร์)
 * ส่งเข้า /api/public/leads → ไปโผล่เป็นดีลสถานะ "lead" ในระบบขาย /quotations
 */
export function LeadForm({ slug, phone }: { slug: string; phone?: string }) {
  const [state, setState] = useState<"idle" | "sending" | "done">("idle")
  const [error, setError] = useState("")

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setState("sending"); setError("")
    const fd = new FormData(e.currentTarget)
    const res = await fetch("/api/public/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        name: fd.get("name"), phone: fd.get("phone"),
        budgetDown: 0, message: "",
        website: fd.get("website") || "",
      }),
    }).catch(() => null)
    if (res?.ok) { setState("done"); return }
    const j = await res?.json().catch(() => ({})) ?? {}
    setError(j.error ?? "ส่งไม่สำเร็จ กรุณาโทรหาเราโดยตรง")
    setState("idle")
  }

  const callLine = phone && (
    <p className="text-sm text-[var(--mena-ink)]/60">
      หรือโทร <a href={telHref(phone)} className="font-medium text-[var(--mena-green)] whitespace-nowrap">{phone}</a> จันทร์–เสาร์ 8:00–17:00
    </p>
  )

  if (state === "done") {
    return (
      <div className="rounded-2xl border border-[var(--mena-green-soft)] bg-white p-6">
        <p className="font-medium text-[var(--mena-green)]">รับเรื่องแล้ว</p>
        <p className="mt-1 text-sm text-[var(--mena-ink)]/70">ฝ่ายขายจะโทรกลับภายในวันทำการ</p>
        {callLine && <div className="mt-3">{callLine}</div>}
      </div>
    )
  }

  const field = "w-full rounded-xl border border-[var(--mena-line)] px-4 py-3 bg-white placeholder:text-[var(--mena-ink)]/40 focus-visible:outline-2 focus-visible:outline-[var(--mena-green)]"
  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-[var(--mena-line)] bg-white p-6">
      <p className="text-xl font-medium">ให้เราโทรกลับไหม</p>
      <p className="mt-1 text-sm text-[var(--mena-ink)]/60">ฝากชื่อกับเบอร์ไว้ ฝ่ายขายโทรกลับภายในวันทำการ</p>

      <div className="mt-5 space-y-3">
        <input name="name" required placeholder="ชื่อ" className={field} />
        <input name="phone" required inputMode="tel" placeholder="เบอร์โทร" className={field} />
        {/* honeypot — ซ่อนจากคน บอทมักกรอก */}
        <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
        {error && <p className="text-sm text-[var(--mena-red)]">{error}</p>}
        <button disabled={state === "sending"} className="w-full rounded-full bg-[var(--mena-green)] text-white font-medium py-3 hover:bg-[var(--mena-green-soft)] transition-colors disabled:opacity-50">
          {state === "sending" ? "กำลังส่ง…" : "ส่งให้ฝ่ายขาย"}
        </button>
      </div>

      {callLine && <div className="mt-4">{callLine}</div>}
    </form>
  )
}
