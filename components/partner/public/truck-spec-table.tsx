import type { PublicTruck } from "@/lib/partner/public-trucks"

/** ตารางข้อมูลรถ — แถวที่ไม่มีข้อมูลจะไม่แสดง (ผู้ใช้สั่ง 2026-09-23: ห้ามโชว์ขีดว่าง) */
export function TruckSpecTable({ truck }: { truck: PublicTruck }) {
  const y = truck.registrationYear
  const rows: [string, string][] = [
    ["ยี่ห้อ", truck.brand],
    ["รุ่น", truck.model],
    ["ปีจดทะเบียน", y ? `${y + 543} (ค.ศ. ${y})` : ""],
    ["ประเภทรถ", truck.vehicleType],
    ["ลักษณะ", truck.characteristic],
    ["สี", truck.color],
    ["ขนาดเครื่องยนต์", truck.engineSize],
    ["เบอร์รถ", truck.truckNumber],
    ["ทะเบียน", truck.licensePlate],
  ]
  const shown = rows.filter(([, v]) => v.trim())
  if (shown.length === 0) return null

  return (
    <dl className="divide-y divide-[var(--mena-line)]">
      {shown.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-6 py-2.5">
          <dt className="text-sm text-[var(--mena-ink)]/55">{k}</dt>
          <dd className="font-medium text-right">{v}</dd>
        </div>
      ))}
    </dl>
  )
}
