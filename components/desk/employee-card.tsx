import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import type { Employee } from "@/lib/types";

/**
 * บัตรพนักงาน — ยกรูปทรงมาจากบัตรบนหน้า login (`components/login/sign-in-card.tsx`)
 * แล้วเติมข้อมูลจริงลงในช่องที่บัตรใบนั้นเว้นว่างไว้
 *
 * ชิ้นส่วนที่ยกมาตรง ๆ: แถบหัวสี primary + ป้าย `HR SERVICE` ตัว mono ·
 * ช่องร้อยสาย · แถวป้ายอังกฤษบนเส้นประ · ท้ายบัตรเส้นประกับแถบบาร์โค้ด
 *
 * **รูปไม่คร่อมแถบหัวบัตรแบบต้นแบบ** — เจ้าของงานสั่งเมื่อ 7 ส.ค. 2026 ว่าอย่าให้
 * ทับซ้อนกัน รูปจึงลงมาอยู่ในเนื้อบัตรเต็มใบ เรียงแถวเดียวกับชื่อ (อย่าย้ายกลับ
 * ไปใช้ `-mt-*` ให้คร่อมอีก) · บัตรใบใหญ่ในหน้ารายคนก็วางตามกติกาเดียวกัน
 *
 * ทั้งใบเป็นลิงก์ไป `/desk/employee/{รหัสพนักงาน}` จึงมี hover ยกขึ้นและแสงกวาด
 * ผ่านแถบหัว บอกว่ากดได้โดยไม่ต้องมีปุ่มเพิ่ม
 */

/** แถบบาร์โค้ดท้ายบัตร — ความกว้างสุ่มไว้ตายตัวเพื่อไม่ให้ SSR/CSR ต่างกัน */
const BARCODE = [
  "w-0.5",
  "w-px",
  "w-[3px]",
  "w-px",
  "w-0.5",
  "w-px",
  "w-[3px]",
  "w-0.5",
  "w-px",
  "w-0.5",
] as const;

export function Barcode({ className = "h-4" }: { className?: string }) {
  return (
    <span aria-hidden className={`flex items-end gap-0.5 ${className}`}>
      {BARCODE.map((width, index) => (
        <i key={index} className={`block h-full bg-ink ${width}`} />
      ))}
    </span>
  );
}

/**
 * แถบหัวบัตร
 *
 * **ไม่มีแสงกวาด/ไล่เงา** — เจ้าของงานสั่งเอา effect เงาวาว ๆ ออกทั้งหมด
 * (7 ส.ค. 2026) เดิมมี gradient sweep วิ่งผ่านตอน hover · อย่าใส่กลับเข้ามา
 */
export function BadgeHeader({ tall }: { tall?: boolean }) {
  return (
    <div
      className={`flex items-start justify-between bg-primary ${
        tall ? "h-16 px-5.5 pt-5" : "h-12 px-4 pt-3.5"
      }`}
    >
      <span
        lang="en"
        className={`font-mono tracking-[0.14em] text-primary-content/85 ${
          tall ? "text-[11px]" : "text-[10px]"
        }`}
      >
        Employee ID Card
      </span>
      {/* ช่องร้อยสายคล้อง */}
      <span
        aria-hidden
        className={`rounded-full bg-primary-content/35 ${
          tall ? "h-2 w-8.5" : "h-1.5 w-7"
        }`}
      />
    </div>
  );
}

/** แถวข้อมูลบนบัตร — ป้ายอังกฤษตัวเล็ก แล้วค่าจริงวางบนเส้นประเดียวกับบัตรต้นแบบ */
export function BadgeRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <dt
        lang="en"
        className="w-18.5 flex-none font-mono text-[9.5px] tracking-[0.08em] text-mut/80"
      >
        {label}
      </dt>
      <dd
        className={`min-w-0 flex-1 truncate border-b border-dashed border-line pb-1 text-right text-[12.5px] ${
          mono ? "font-mono tracking-[0.02em]" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export function EmployeeCard({
  employee,
  /** ลำดับในตาราง — ใช้ไล่จังหวะ entrance ให้การ์ดทยอยขึ้น ไม่ใช่โผล่พร้อมกันหมด */
  index = 0,
}: {
  employee: Employee;
  index?: number;
}) {
  return (
    <Link
      href={`/desk/employee/${encodeURIComponent(employee.employeeId)}`}
      /* หน่วงตันที่ใบที่ 12 — รายชื่อยาวเป็นร้อยคน ถ้าคูณไปเรื่อย ๆ ใบท้ายจะรอหลายวินาที */
      style={{ animationDelay: `${Math.min(index, 11) * 35}ms` }}
      /* hover บอกว่ากดได้ด้วย “ขอบเข้ม + ยกขึ้นเล็กน้อย” เท่านั้น — ไม่มีเงาฟุ้ง */
      className="stagger-in group flex animate-lift-in flex-col overflow-hidden rounded-box border border-line bg-base-100 text-ink transition-[transform,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-primary/40 active:translate-y-0 active:duration-90"
    >
      <BadgeHeader />

      <div className="flex flex-1 flex-col px-4 pt-4 pb-4">
        <div className="flex items-center gap-3">
          <Avatar
            name={employee.name}
            src={employee.imageUrl}
            size="lg"
            className="ring-line/70"
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="truncate text-[14.5px] font-semibold transition-colors group-hover:text-primary">
              {employee.name}
            </p>
            <p className="truncate text-[12px] text-mut">{employee.position}</p>
          </div>
        </div>

        <dl className="mt-4 flex flex-col gap-2">
          <BadgeRow label="EMPLOYEE ID" value={employee.employeeId} mono />
          <BadgeRow label="ACCESS" value={employee.levelLabel} />
        </dl>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-dashed border-line bg-base-200 px-4 py-2.5">
        <span className="min-w-0 truncate text-[11px] text-mut">{employee.site}</span>
        <Barcode className="h-3.5 flex-none opacity-70" />
      </div>
    </Link>
  );
}
