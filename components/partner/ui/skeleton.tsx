import { cn } from "@/lib/partner/utils"

/** บล็อกโหลดจำลอง — ใช้แทนข้อความ "กำลังโหลด..." เพื่อลดจอกระพริบ/เลย์เอาต์กระโดด */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-zinc-200/70 dark:bg-zinc-800", className)} />
}

/** โครงตารางจำลอง (หัว + n แถว) */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full">
      <div className="flex gap-3 mb-3">
        {Array.from({ length: cols }).map((_, i) => <Skeleton key={i} className="h-4 flex-1" />)}
      </div>
      <div className="space-y-2.5">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-3">
            {Array.from({ length: cols }).map((_, c) => <Skeleton key={c} className="h-8 flex-1" />)}
          </div>
        ))}
      </div>
    </div>
  )
}

/** โครงการ์ดสรุปจำลอง (n ใบ) */
export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-28 mt-2.5" />
        </div>
      ))}
    </div>
  )
}
