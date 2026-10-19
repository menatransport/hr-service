import Image from "next/image"
import Link from "next/link"
import { fmtBaht } from "@/lib/partner/public-seo"
import type { PublicTruck } from "@/lib/partner/public-trucks"
import { PrepBadge, ReadyBadge } from "./ready-stars"

export function TruckCard({ truck }: { truck: PublicTruck }) {
  const year = truck.registrationYear
  const title = [truck.brand, truck.model].filter(Boolean).join(" ") || "รถผสมปูนมือสอง"
  const kind = truck.vehicleType || truck.characteristic

  return (
    <Link
      href={`/trucks/${truck.slug}`}
      className="group flex flex-col rounded-2xl border border-[var(--mena-line)] bg-white overflow-hidden transition-shadow hover:shadow-[0_12px_28px_-18px_rgba(2,58,30,0.55)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mena-green)]"
    >
      <div className="relative aspect-[4/3] bg-[var(--mena-paper)]">
        {truck.photoUrl ? (
          <Image
            src={truck.photoUrl}
            alt={`${title}${year ? ` ปี ${year + 543}` : ""} มือสอง`}
            fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-sm text-[var(--mena-ink)]/40">รูปกำลังอัปเดต</div>
        )}
        {truck.isSold ? (
          <span className="absolute top-3 left-3 rounded-full bg-[var(--mena-ink)] text-white text-xs px-3 py-1">ขายแล้ว</span>
        ) : truck.promos.length > 0 && (
          <span className="absolute top-3 left-3 rounded-full bg-[var(--mena-green)] text-white text-xs px-3 py-1">
            โปรฯ {truck.promos.length} ต่อ
          </span>
        )}
        {truck.isReady ? <ReadyBadge className="absolute top-3 right-3" />
          : !truck.isSold && <PrepBadge className="absolute top-3 right-3" />}
      </div>

      <div className="p-5 flex flex-col flex-1">
        <p className="font-medium leading-snug group-hover:text-[var(--mena-green)] transition-colors">
          {title}{year ? <span className="text-[var(--mena-ink)]/50 font-normal"> ปี {year + 543}</span> : null}
        </p>
        {kind && <p className="text-sm text-[var(--mena-ink)]/55 mt-0.5">{kind}</p>}

        {/* เบอร์รถ + ทะเบียน — ให้ทีมขายอ้างอิงคันได้จากหน้ารวมเลย (ผู้ใช้สั่ง 2026-10-09) */}
        {(truck.truckNumber || truck.licensePlate) && (
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-[var(--mena-ink)]/60">
            {truck.truckNumber && (
              <span className="rounded bg-[var(--mena-paper)] px-1.5 py-0.5 tabular-nums">{truck.truckNumber}</span>
            )}
            {truck.licensePlate && (
              <span className="rounded bg-[var(--mena-paper)] px-1.5 py-0.5 tabular-nums">{truck.licensePlate}</span>
            )}
          </p>
        )}

        <p className="mt-4 text-2xl font-semibold text-[var(--mena-green)] tabular-nums">฿{fmtBaht(truck.display.price)}</p>
        {truck.display.monthlyPayment > 0 && (
          <p className="text-sm text-[var(--mena-ink)]/70 tabular-nums">
            ผ่อน ฿{fmtBaht(truck.display.monthlyPayment)}/เดือน
            {truck.financeInstallments > 0 && <span className="text-[var(--mena-ink)]/45"> · {truck.financeInstallments} งวด</span>}
          </p>
        )}
      </div>
    </Link>
  )
}
