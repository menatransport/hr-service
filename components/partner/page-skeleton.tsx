/**
 * Skeleton สำหรับ loading.tsx ของหน้า list — แสดงทันทีระหว่าง client fetch
 * ทำให้หน้ารู้สึกโหลดเร็วขึ้น (ไม่เห็นจอเปล่า) ก่อนข้อมูลจริงจะมา
 */
export function PageSkeleton({ rows = 8, title = true }: { rows?: number; title?: boolean }) {
  return (
    <div className="max-w-[1400px] mx-auto py-6 px-4 space-y-5 animate-pulse">
      {title && (
        <div className="space-y-2">
          <div className="h-3 w-24 rounded bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-7 w-56 rounded bg-zinc-200 dark:bg-zinc-800" />
        </div>
      )}
      {/* filter bar */}
      <div className="flex gap-2">
        <div className="h-8 w-40 rounded-lg bg-zinc-100 dark:bg-zinc-800" />
        <div className="h-8 w-28 rounded-lg bg-zinc-100 dark:bg-zinc-800" />
        <div className="h-8 w-28 rounded-lg bg-zinc-100 dark:bg-zinc-800" />
      </div>
      {/* table */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <div className="h-10 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-800" />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-zinc-50 dark:border-zinc-800/60">
            <div className="h-7 w-7 rounded-full bg-zinc-100 dark:bg-zinc-800 shrink-0" />
            <div className="h-3.5 flex-1 max-w-[180px] rounded bg-zinc-100 dark:bg-zinc-800" />
            <div className="h-3.5 w-20 rounded bg-zinc-100 dark:bg-zinc-800" />
            <div className="h-3.5 w-24 rounded bg-zinc-100 dark:bg-zinc-800" />
            <div className="h-3.5 w-16 rounded bg-zinc-100 dark:bg-zinc-800 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}
