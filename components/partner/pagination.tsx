"use client"

/**
 * Client-side pagination ใช้ร่วมกันทุกหน้า list — สูงสุด 50 รายการ/หน้า
 * ใช้คู่กัน: const pg = usePagination(filtered, 50, [q, filter]) → render pg.paged + <PaginationBar {...pg} />
 */

import { useEffect, useMemo, useState } from "react"

export function usePagination<T>(items: T[], pageSize = 50, resetKeys: unknown[] = []) {
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const paged = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, safePage, pageSize]
  )
  // เปลี่ยนคำค้น/ฟิลเตอร์ → กลับหน้าแรก
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1) }, resetKeys)
  return { page: safePage, setPage, totalPages, paged, pageSize, total: items.length }
}

export function PaginationBar({ page, setPage, totalPages, total, pageSize, unit = "รายการ", note }: {
  page: number
  setPage: (n: number) => void
  totalPages: number
  total: number
  pageSize: number
  unit?: string
  note?: string
}) {
  if (total === 0) return null
  const from = (page - 1) * pageSize + 1
  const to   = Math.min(page * pageSize, total)

  const numbers = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter((n) => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
    .reduce<(number | "…")[]>((acc, n) => {
      const prev = acc[acc.length - 1]
      if (typeof prev === "number" && n - prev > 1) acc.push("…")
      acc.push(n)
      return acc
    }, [])

  return (
    <div className="px-4 py-2.5 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between flex-wrap gap-2">
      <p className="text-[11px] text-zinc-400">
        แสดง {from}–{to} จาก {total} {unit}
        {note && <span> {note}</span>}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(page - 1)}
            disabled={page <= 1}
            className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← ก่อนหน้า
          </button>
          {numbers.map((n, i) =>
            n === "…" ? (
              <span key={`gap-${i}`} className="px-1 text-[11px] text-zinc-300">…</span>
            ) : (
              <button
                key={n}
                onClick={() => setPage(n)}
                className={`min-w-[26px] px-1.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  n === page
                    ? "bg-emerald-600 text-white"
                    : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                {n}
              </button>
            )
          )}
          <button
            onClick={() => setPage(page + 1)}
            disabled={page >= totalPages}
            className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ถัดไป →
          </button>
        </div>
      )}
    </div>
  )
}
