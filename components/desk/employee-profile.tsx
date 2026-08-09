import Link from "next/link";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  ChevronRight,
  Hash,
  Mail,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { BadgeHeader, BadgeRow, Barcode } from "@/components/desk/employee-card";
import { EmployeePhoto } from "@/components/desk/employee-photo";
import { Avatar } from "@/components/ui/avatar";
import type { Employee } from "@/lib/types";

/**
 * ข้อมูลพนักงานรายคน (`/desk/employee/[id]`)
 *
 * ซ้ายคือบัตรใบเดียวกับในหน้าค้นหา แต่ขยายเต็มใบและ **ห้อยกับสายคล้อง** เหมือน
 * บัตรบนหน้า login (คลาส `badge-hang` — หล่นลงมาแกว่งเข้าที่แล้วนิ่งสนิท)
 * ขวาคือข้อมูลที่บัตรใส่ไม่หมด กับรายชื่อเพื่อนร่วมแผนก
 *
 * ทั้งหน้าเป็น server component — ไม่มีอะไรให้กดนอกจากลิงก์
 */
export function EmployeeProfile({
  employee,
  teammates,
}: {
  employee: Employee;
  teammates: Employee[];
}) {
  return (
    <div className="flex flex-col gap-5 animate-rise">
      <Link
        href="/desk/employee"
        className="group flex w-fit items-center gap-1.5 text-[13px] text-mut transition-colors hover:text-primary"
      >
        <ArrowLeft
          size={15}
          strokeWidth={1.8}
          aria-hidden
          className="transition-transform duration-200 group-hover:-translate-x-0.5"
        />
        กลับไปค้นหาพนักงาน
      </Link>

      <div className="grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <IdBadge employee={employee} />

        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-4 rounded-box border border-line bg-base-100 p-5">
            <h2 className="text-[14px] font-semibold">ข้อมูลพนักงาน</h2>

            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <InfoRow icon={Hash} label="รหัสพนักงาน" value={employee.employeeId} mono />
              <InfoRow
                icon={Mail}
                label="อีเมล"
                value={employee.email || "—"}
                href={employee.email ? `mailto:${employee.email}` : undefined}
              />
              <InfoRow icon={Building2} label="แผนก" value={employee.department} />
              <InfoRow icon={Briefcase} label="ตำแหน่ง" value={employee.position} />
              <InfoRow icon={ShieldCheck} label="ระดับตำแหน่ง" value={employee.levelLabel} />
              <InfoRow icon={MapPin} label="สถานที่ปฏิบัติงาน" value={employee.site} />
            </dl>
          </section>

          <section className="flex flex-col gap-3.5 rounded-box border border-line bg-base-100 p-5">
            <div className="flex items-baseline gap-2.5">
              <h2 className="text-[14px] font-semibold">เพื่อนร่วมแผนก</h2>
              <span className="text-[12px] text-mut">{employee.department}</span>
            </div>

            {teammates.length === 0 ? (
              <p className="text-[12.5px] text-mut text-pretty">
                ยังไม่มีพนักงานคนอื่นในแผนกนี้ในสมุดรายชื่อ
              </p>
            ) : (
              <ul className="flex flex-col">
                {teammates.map((mate) => (
                  <li key={mate.employeeId}>
                    <Link
                      href={`/desk/employee/${encodeURIComponent(mate.employeeId)}`}
                      className="group -mx-2 flex items-center gap-3 rounded-field px-2 py-2.5 transition-colors hover:bg-base-200"
                    >
                      <Avatar name={mate.name} src={mate.imageUrl} size="sm" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[13.5px] font-medium transition-colors group-hover:text-primary">
                          {mate.name}
                        </span>
                        <span className="truncate text-[11.5px] text-mut">
                          {mate.position}
                        </span>
                      </span>
                      <span className="flex-none font-mono text-[11.5px] text-mut max-sm:hidden">
                        {mate.employeeId}
                      </span>
                      <ChevronRight
                        size={15}
                        strokeWidth={1.8}
                        aria-hidden
                        className="flex-none text-mut transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/**
 * บัตรประจำตัวเต็มใบ — โครงเดียวกับบัตรบนหน้า login รวมถึงสายคล้องและบาร์โค้ด
 *
 * ต่างจากต้นแบบตรงที่ **รูปไม่คร่อมแถบหัวบัตร** — อยู่กลางใบเต็มวงเหมือนบัตร
 * พนักงานจริง (เจ้าของงานสั่งเมื่อ 7 ส.ค. 2026 ว่าอย่าให้ทับซ้อนกัน)
 */
function IdBadge({ employee }: { employee: Employee }) {
  return (
    <div className="badge-hang w-full max-w-80 justify-self-center lg:justify-self-start">
      {/* สายคล้องบัตร — ตัวหนีบกับสายสั้น ๆ พอให้บัตรอ่านว่า “ห้อยอยู่” */}
      <div aria-hidden className="flex flex-col items-center">
        <span className="h-3.5 w-18.5 rounded-full bg-ink/55" />
        <span className="h-4 w-1 rounded-b-sm bg-ink/55" />
      </div>

      {/* เงาบาง ๆ ชั้นเดียวพอให้บัตรอ่านว่า “ห้อยอยู่หน้าพื้น” — ไม่มีแสงกวาด/เงาฟุ้ง */}
      <div className="overflow-hidden rounded-[14px] border border-line bg-base-100 text-ink shadow-[0_2px_10px_-6px_rgba(21,32,29,0.22)]">
        <BadgeHeader tall />

        <div className="flex flex-col items-center px-5.5 pt-5 pb-6 text-center">
          <div className="animate-pop-in [animation-delay:120ms]">
            <EmployeePhoto
              employeeId={employee.employeeId}
              name={employee.name}
              imageUrl={employee.imageUrl}
            />
          </div>

          <span
            lang="en"
            className="mt-4 block animate-fade-in font-mono text-[10px] tracking-[0.16em] text-primary [animation-delay:150ms]"
          >
            EMPLOYEE
          </span>

          <h1 className="mt-1 animate-lift-in text-[21px] leading-[1.35] font-bold text-pretty [animation-delay:170ms]">
            {employee.name}
          </h1>

          <p className="mt-1.5 animate-lift-in text-[13px] leading-[1.7] text-mut text-pretty [animation-delay:210ms]">
            {employee.position}
          </p>

          <dl className="mt-5 flex w-full animate-fade-in flex-col gap-2.5 text-left [animation-delay:250ms]">
            <BadgeRow label="EMPLOYEE ID" value={employee.employeeId} mono />
            <BadgeRow label="DEPARTMENT" value={employee.department} />
            <BadgeRow label="ACCESS" value={employee.levelLabel} />
          </dl>
        </div>

        <div className="flex animate-fade-in items-center justify-between gap-3 border-t border-dashed border-line bg-base-200 px-5.5 py-3.5 [animation-delay:330ms]">
          <span className="min-w-0 truncate text-[11px] text-mut">
            {employee.site}
          </span>
          <Barcode className="h-4.5 flex-none" />
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  href,
  mono,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  href?: string;
  mono?: boolean;
}) {
  const text = `min-w-0 truncate text-[13.5px] ${mono ? "font-mono" : ""}`;

  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid size-8 flex-none place-items-center rounded-full bg-soft text-primary">
        <Icon size={15} strokeWidth={1.7} aria-hidden />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <dt className="text-[11.5px] text-mut">{label}</dt>
        <dd className="min-w-0">
          {href ? (
            <a href={href} className={`${text} block hover:text-primary hover:underline`}>
              {value}
            </a>
          ) : (
            <span className={`${text} block`}>{value}</span>
          )}
        </dd>
      </div>
    </div>
  );
}
