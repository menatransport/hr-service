"use client";

import { usePathname } from "next/navigation";

import { findModule } from "@/lib/modules";

/**
 * หัวของหน้าใน — ชื่อ · คำอธิบาย · ปุ่มชิดขวา
 *
 * หน้าที่อยู่ในกลุ่มงานมี **ไอคอนเมนูบนไทล์สีพื้นหลังระบบ** (`.brand-tile` — teal ไล่เข้ม + ประกายทอง)
 * หน้าชื่อ (13 ต.ค. 2026) — ไอคอนตัวเดียวกับแถวในแถบข้างและการ์ดบน Home จึงรู้ทันทีว่าอยู่หน้าไหน
 * · หน้าที่ไม่อยู่ในกลุ่มใดไม่มีไทล์
 *
 * `pt-4 sm:pt-5` — แผ่นเนื้อหาไม่มี padding บนแล้ว (ให้แถบสรุปติดขอบบน) หัวหน้าจึงเว้นระยะจากขอบเอง
 */
export function PageHead({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  const match = findModule(usePathname());
  const Icon = match ? (match.child ?? match.item).icon : null;

  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pt-4 sm:pt-5">
      <div className="flex min-w-0 items-center gap-3.5">
        {Icon ? (
          <span
            aria-hidden
            className="brand-tile grid size-11 flex-none place-items-center rounded-[14px]"
          >
            <Icon size={21} strokeWidth={1.8} />
          </span>
        ) : null}
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-22 font-semibold tracking-[-0.01em] text-balance">{title}</h1>
          {subtitle ? (
            <p className="max-w-[62ch] text-13 text-mut text-pretty">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
