"use client"

import { usePartnerSession } from "@/lib/partner/auth/client"
import { ShieldCheck, Check, Minus } from "lucide-react"
import { ROLES, ROLE_LABELS, hasPerm, canUpload, type PermDomain, type Role } from "@/lib/partner/rbac"

/**
 * ตารางสิทธิ์ (RBAC matrix) — สร้างจาก lib/rbac.ts ตรงๆ ผ่าน hasPerm/canUpload
 * แก้สิทธิ์ที่ MATRIX ที่เดียว ตารางนี้เปลี่ยนตามอัตโนมัติ ไม่มีทาง desync
 */

const DOMAIN_ROWS: { domain: PermDomain; label: string; detail: string }[] = [
  { domain: "masterdata",      label: "ข้อมูลหลัก",            detail: "พนักงานขับรถ · ทะเบียนรถ · ราคาขาย" },
  { domain: "contracts",       label: "สัญญา",                 detail: "สร้าง/แก้สัญญา + เอกสารแนบ + PDF" },
  { domain: "promotions",      label: "โปรโมชั่น",              detail: "งบซ่อมฟรี · PM · ยืนยันตัดงบ" },
  { domain: "vehiclecost",     label: "ค่าใช้จ่ายรถ",           detail: "สรุปค่าซ่อมเข้างวด · ใบรับสภาพหนี้ · เบิกคลัง" },
  { domain: "finance",         label: "การเงิน & เงินเดือน",    detail: "ค่าเที่ยว · วันทำงาน · รับ-หักอื่น · หนี้/เงินสะสม · ภาษีประกัน · งวดเงินเดือน · นำเข้าไฟล์" },
  { domain: "cancel_contract", label: "ยกเลิกสัญญา",           detail: "" },
  { domain: "lock",            label: "ล็อค/ปลดล็อค",          detail: "เอกสารสัญญา · งวดเงินเดือน" },
  { domain: "delete",          label: "ลบข้อมูล",              detail: "ทุกเมนู — จำกัดขั้นสูงสุด" },
  { domain: "manage_users",    label: "จัดการผู้ใช้ & สิทธิ์",   detail: "/partner/admin/users" },
]

// เรียงคอลัมน์: superadmin ท้ายสุด (เป็นบทบาท dev — คนทั่วไปสนใจ 4 ตัวแรก)
const COL_ORDER: Role[] = ["admin", "fleet", "finance", "salesperson", "viewer", "superadmin"]
const ROLE_SHORT: Record<Role, string> = {
  superadmin: "Superadmin", admin: "แอดมิน", fleet: "แผนกรถร่วม", finance: "การเงิน", salesperson: "ฝ่ายขาย", viewer: "ดูอย่างเดียว",
}

export function RoleMatrix({ compact = false }: { compact?: boolean }) {
  const { data: session } = usePartnerSession()
  const myRole = ((session?.user as { role?: string } | undefined)?.role ?? "") as Role | ""

  const cols = COL_ORDER.filter((r) => ROLES.includes(r))

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1 uppercase tracking-wide flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-emerald-500" /> บทบาท & สิทธิ์การใช้งาน
      </h2>
      <p className="text-[11px] text-zinc-400 mb-3">
        ตารางคุมสิทธิ์ เพิ่ม/แก้/นำเข้า · <b>ฝ่ายขาย</b> (ค่าเริ่มต้นของ user ใหม่) เห็นเฉพาะ ราคาขาย (ดู) + ใบเสนอราคา · บทบาทอื่นดูข้อมูลได้ทั้งหมด
        {!compact && <> · Superadmin ตั้งผ่าน env <span className="font-mono">SUPERADMIN_EMAILS</span></>}
        {myRole && <> · บทบาทของคุณตอนนี้: <b className="text-emerald-600">{ROLE_LABELS[myRole as Role] ?? myRole}</b></>}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs whitespace-nowrap">
          <thead>
            <tr className="text-zinc-400 border-b border-zinc-200 dark:border-zinc-700">
              <th className="text-left py-2 pr-3 font-medium">สิ่งที่ทำได้</th>
              {cols.map((r) => (
                <th key={r} className={`text-center px-2 py-2 font-semibold ${r === myRole ? "text-emerald-600" : ""}`}>
                  {ROLE_SHORT[r]}{r === myRole ? " ★" : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800">
            {DOMAIN_ROWS.map((row) => (
              <tr key={row.domain}>
                <td className="py-1.5 pr-3">
                  <span className="text-zinc-700 dark:text-zinc-300 font-medium">{row.label}</span>
                  {!compact && row.detail && <span className="text-zinc-400 dark:text-zinc-500 ml-1.5 text-[10px]">{row.detail}</span>}
                </td>
                {cols.map((r) => (
                  <td key={r} className={`text-center px-2 py-1.5 ${r === myRole ? "bg-emerald-50/60 dark:bg-emerald-950/20" : ""}`}>
                    {hasPerm(r, row.domain)
                      ? <Check className="w-3.5 h-3.5 text-emerald-500 inline" />
                      : <Minus className="w-3 h-3 text-zinc-200 dark:text-zinc-700 inline" />}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="py-1.5 pr-3">
                <span className="text-zinc-700 dark:text-zinc-300 font-medium">อัปโหลดไฟล์แนบ</span>
                {!compact && <span className="text-zinc-400 dark:text-zinc-500 ml-1.5 text-[10px]">หลักฐานโอน · เอกสารแนบสัญญา</span>}
              </td>
              {cols.map((r) => (
                <td key={r} className={`text-center px-2 py-1.5 ${r === myRole ? "bg-emerald-50/60 dark:bg-emerald-950/20" : ""}`}>
                  {canUpload(r)
                    ? <Check className="w-3.5 h-3.5 text-emerald-500 inline" />
                    : <Minus className="w-3 h-3 text-zinc-200 dark:text-zinc-700 inline" />}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}
