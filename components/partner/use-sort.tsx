"use client"

import { useState, useMemo, useCallback } from "react"

export type SortDir = "asc" | "desc"
export type SortState = { sortKey: string; sortDir: SortDir; toggle: (k: string) => void }

/** จัดเรียงตาราง client-side — useSort(rows, (row,key)=>value). คลิกหัวคอลัมน์สลับ asc/desc */
export function useSort<T>(rows: T[], get: (row: T, key: string) => unknown, initialKey = ""): SortState & { sorted: T[] } {
  const [sortKey, setKey] = useState(initialKey)
  const [sortDir, setDir] = useState<SortDir>("asc")

  const sorted = useMemo(() => {
    if (!sortKey) return rows
    const arr = [...rows]
    arr.sort((a, b) => {
      const va = get(a, sortKey), vb = get(b, sortKey)
      const c = typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va ?? "").localeCompare(String(vb ?? ""), "th")
      return sortDir === "asc" ? c : -c
    })
    return arr
  }, [rows, sortKey, sortDir, get])

  const toggle = useCallback((k: string) => {
    if (k === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setKey(k); setDir("asc") }
  }, [sortKey])

  return { sorted, sortKey, sortDir, toggle }
}

/** หัวคอลัมน์คลิกเรียงได้ */
export function SortableTh({ label, sortKey, sort, align = "left", className = "" }:
  { label: string; sortKey: string; sort: SortState; align?: "left" | "right" | "center"; className?: string }) {
  const active = sort.sortKey === sortKey
  const alignCls = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
  return (
    <th className={`px-2.5 py-2 font-semibold cursor-pointer select-none ${alignCls} ${className}`}
      onClick={() => sort.toggle(sortKey)} aria-sort={active ? (sort.sortDir === "asc" ? "ascending" : "descending") : "none"}>
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
        {label}
        <span className={`text-[9px] ${active ? "text-[#C9A227]" : "text-zinc-300 dark:text-zinc-600"}`}>{active ? (sort.sortDir === "asc" ? "▲" : "▼") : "↕"}</span>
      </span>
    </th>
  )
}
