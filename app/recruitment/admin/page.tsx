import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { PageHead } from "@/components/desk/page-head";
import { ADMIN_ROOT, adminModules } from "@/app/recruitment/_lib/admin-nav";

export const metadata: Metadata = {
  title: "ศูนย์กลางการสรรหา",
};

/**
 * หน้าหลักของศูนย์กลางสรรหา — **รายการโมดูลของระบบ**
 *
 * เดิมหน้านี้เป็นภาพรวมของ*ใบสมัคร* (การ์ดตัวเลข คิวงาน แถบขั้นตอน) ซึ่งซ้ำกับ
 * สิ่งที่หน้าผู้สมัครทำได้ดีกว่าอยู่แล้ว — ที่นั่นตัวเลขทุกตัวกดแล้วกรองตาราง
 * ได้ทันที ส่วนที่นี่ต้องกดออกไปอีกหน้าถึงจะทำอะไรต่อได้ · ยกออกไปก่อน
 * (ตัวดึงข้อมูลเดิมถูกลบทิ้งแล้ว ถ้าจะเอากลับมาต้องเขียนใหม่)
 *
 * เหลืออย่างเดียวที่หน้าแรกตอบได้ดีกว่าหน้าอื่น: **ระบบมีอะไรให้ใช้แล้วบ้าง**
 */

function HubView() {
  return (
    <div className="flex flex-col gap-5 animate-rise">
      <PageHead
        title="ศูนย์กลางการสรรหา"
        subtitle="โมดูลทั้งหมดของศูนย์กลางการสรรหา — ที่เปิดใช้งานแล้วและที่กำลังจะมี"
        actions={
          <Link
            /* ผู้สมัครเป็นแท็บของหน้าขอสรรหาแล้ว — ชี้ตรงไปที่แท็บนั้น ไม่ผ่าน
               เส้นทางเก่าที่เหลือไว้แค่ redirect (ดู `admin/candidates/page.tsx`) */
            href={`${ADMIN_ROOT}/requisitions?tab=candidates`}
            className="btn-pri px-3.5 py-2 text-13 font-medium"
          >
            ไปที่ผู้สมัคร
          </Link>
        }
      />

      <section className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-14 font-semibold">โมดูลของระบบ</h2>
          <span className="text-12 text-mut">
            {adminModules.filter((m) => m.ready).length} จาก {adminModules.length}{" "}
            โมดูลพร้อมใช้งาน
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {adminModules.map((module) => {
            const Icon = module.icon;

            const body = (
              <span className="flex items-start gap-2.5">
                <span
                  aria-hidden
                  className={`flex size-8 flex-none items-center justify-center rounded-field ${
                    module.ready ? "bg-soft text-primary" : "bg-base-200 text-mut"
                  }`}
                >
                  <Icon size={16} strokeWidth={1.7} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span className="text-13-5 font-semibold">{module.label}</span>
                    {module.ready ? (
                      <ArrowUpRight
                        size={14}
                        strokeWidth={1.9}
                        aria-hidden
                        className="text-mut transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      />
                    ) : (
                      <span className="rounded-selector bg-base-200 px-1.5 py-0.5 text-10 font-medium text-mut">
                        เร็ว ๆ นี้
                      </span>
                    )}
                  </span>
                  <span className="text-12 leading-relaxed text-mut text-pretty">
                    {module.blurb}
                  </span>
                </span>
              </span>
            );

            const shell = "group flex flex-col rounded-box border border-line p-4";

            return module.ready ? (
              <Link
                key={module.href}
                href={module.href}
                className={`${shell} bg-base-100 transition-colors hover:border-primary/40 hover:bg-soft/50`}
              >
                {body}
              </Link>
            ) : (
              <div
                key={module.href}
                className={`${shell} border-dashed bg-base-100/60`}
                aria-disabled
              >
                {body}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default function RecruitmentAdminHome() {
  return <HubView />;
}
