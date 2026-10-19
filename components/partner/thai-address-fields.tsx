"use client"

import { useEffect, useMemo, useState } from "react"
import { Input } from "@/components/partner/ui/input"
import { SearchCombobox } from "@/components/partner/search-combobox"
import {
  loadThaiAddress, listProvinces, listDistricts, listSubdistricts,
  type ProvinceNode, type ThaiAddressParts,
} from "@/lib/partner/thai-address"

type Opt = { _id: string; name: string; zip?: string }

const labelCls = "block text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-0.5"

/**
 * ฟิลด์ที่อยู่แบบมาตรฐาน + autocomplete จังหวัด → อำเภอ → ตำบล (เติมรหัสไปรษณีย์อัตโนมัติ)
 * onChange ส่ง patch ของ field ที่เปลี่ยน (พร้อมล้าง field ที่อยู่ใต้ลงมาเมื่อเปลี่ยนระดับบน)
 */
export function ThaiAddressFields({ value, onChange }: {
  value: ThaiAddressParts
  onChange: (patch: Partial<ThaiAddressParts>) => void
}) {
  const [data, setData] = useState<ProvinceNode[] | null>(null)
  useEffect(() => { loadThaiAddress().then(setData).catch(() => setData([])) }, [])

  const provinces = useMemo<Opt[]>(
    () => (data ? listProvinces(data).map((n) => ({ _id: n, name: n })) : []),
    [data],
  )
  const districts = useMemo<Opt[]>(
    () => (data ? listDistricts(data, value.province).map((n) => ({ _id: n, name: n })) : []),
    [data, value.province],
  )
  const subdistricts = useMemo<Opt[]>(
    () => (data ? listSubdistricts(data, value.province, value.district).map((t) => ({ _id: t.n, name: t.n, zip: t.z })) : []),
    [data, value.province, value.district],
  )

  const optOf = (name?: string): Opt | null => (name ? { _id: name, name } : null)

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <label className={labelCls}>บ้านเลขที่ / หมู่ / ซอย / ถนน</label>
        <Input
          value={value.addressDetail ?? ""}
          onChange={(e) => onChange({ addressDetail: e.target.value })}
          placeholder="เช่น 99/1 หมู่ 2 ซ.สุขใจ ถ.มิตรภาพ"
        />
      </div>

      <div>
        <label className={labelCls}>จังหวัด</label>
        <SearchCombobox<Opt>
          items={provinces}
          selected={optOf(value.province)}
          onSelect={(o) => onChange({ province: o?.name ?? "", district: "", subdistrict: "", postalCode: "" })}
          getLabel={(o) => o.name}
          placeholder={data ? "เลือกจังหวัด..." : "กำลังโหลด..."}
          searchKeys={(o) => [o.name]}
        />
      </div>

      <div>
        <label className={labelCls}>อำเภอ / เขต</label>
        <SearchCombobox<Opt>
          items={districts}
          selected={optOf(value.district)}
          onSelect={(o) => onChange({ district: o?.name ?? "", subdistrict: "", postalCode: "" })}
          getLabel={(o) => o.name}
          placeholder={value.province ? "เลือกอำเภอ..." : "เลือกจังหวัดก่อน"}
          searchKeys={(o) => [o.name]}
        />
      </div>

      <div>
        <label className={labelCls}>ตำบล / แขวง</label>
        <SearchCombobox<Opt>
          items={subdistricts}
          selected={optOf(value.subdistrict)}
          onSelect={(o) => onChange({ subdistrict: o?.name ?? "", postalCode: o?.zip ?? value.postalCode ?? "" })}
          getLabel={(o) => o.name}
          getSub={(o) => o.zip ?? ""}
          placeholder={value.district ? "เลือกตำบล..." : "เลือกอำเภอก่อน"}
          searchKeys={(o) => [o.name, o.zip ?? ""]}
        />
      </div>

      <div>
        <label className={labelCls}>รหัสไปรษณีย์</label>
        <Input
          value={value.postalCode ?? ""}
          onChange={(e) => onChange({ postalCode: e.target.value })}
          placeholder="เช่น 10110"
          inputMode="numeric"
          maxLength={5}
        />
      </div>
    </div>
  )
}
