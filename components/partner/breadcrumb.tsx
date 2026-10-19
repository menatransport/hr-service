import Link from "next/link"
import { ChevronRight } from "lucide-react"

/** เส้นทางนำทาง (breadcrumb) สำหรับหน้ารายละเอียด — ใช้ได้ทั้ง server/client (ไม่มี hook) */
export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="breadcrumb" className="flex items-center gap-1.5 text-xs text-zinc-400 mb-3 flex-wrap">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="w-3 h-3 shrink-0" aria-hidden="true" />}
          {it.href ? (
            <Link href={it.href} className="hover:text-zinc-600 dark:hover:text-zinc-200">{it.label}</Link>
          ) : (
            <span className="text-zinc-600 dark:text-zinc-300 font-medium" aria-current="page">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
