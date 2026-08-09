import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { CaseCard } from "@/components/m/case-card";
import { Screen } from "@/components/m/screen";
import { Avatar } from "@/components/ui/avatar";
import { DataError } from "@/components/ui/data-error";
import { SectionTitle } from "@/components/ui/section-title";
import { getMobileIdentity } from "@/lib/auth/session";
import { isOpenCase } from "@/lib/case-flow";
import { dataErrorMessage, getCasesByDriver } from "@/lib/cases";

export const metadata = { title: "หน้าแรก" };

export const dynamic = "force-dynamic";

export default async function MobileHomePage() {
  // ล็อกอินด้วยบัญชีบริษัทแล้วจะเห็นตัวเอง · คนขับที่ยังไม่มีอีเมลบริษัทได้ค่าตัวอย่าง
  const me = await getMobileIdentity();

  let openCases: Awaited<ReturnType<typeof getCasesByDriver>> = [];
  let casesError: string | null = null;
  try {
    openCases = (await getCasesByDriver(me.employeeId)).filter(isOpenCase);
  } catch (err) {
    casesError = dataErrorMessage(err);
  }

  return (
    <Screen className="flex flex-col gap-5 px-5 pt-3 pb-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-[21px] font-semibold tracking-[-0.01em]">
            สวัสดี, {me.firstName}
          </h1>
          <p className="text-[13px] text-mut">
            {[me.role, me.team].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Link
          href="/m/me"
          aria-label="โปรไฟล์ของฉัน"
          className="flex-none rounded-full transition-shadow hover:ring-2 hover:ring-primary/30"
        >
          <Avatar name={me.name} src={me.imageUrl} size="md" />
        </Link>
      </div>

      {/* one-tap entry to the thing 80% of people open this app for */}
      <Link
        href="/m/cases/new"
        className="flex min-h-[76px] items-center gap-3.5 rounded-[14px] bg-primary p-4.5 text-primary-content transition-transform active:scale-[0.99]"
      >
        <span className="flex size-[42px] flex-none items-center justify-center rounded-[11px] bg-white/18">
          <TriangleAlert size={21} strokeWidth={1.7} aria-hidden />
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="text-base font-semibold">แจ้งเรื่องร้องเรียน</span>
          <span className="text-[12.5px] opacity-85">
            เลือกกลุ่มเรื่อง ถ่ายรูป แล้วส่ง
          </span>
        </span>
      </Link>

      <section className="flex flex-col gap-3">
        <SectionTitle action="ดูทั้งหมด" actionHref="/m/cases">
          เคสของฉัน
        </SectionTitle>
        {casesError ? (
          <DataError message={casesError} />
        ) : openCases.length ? (
          <div className="flex flex-col gap-2.5">
            {openCases.map((c) => (
              <CaseCard key={c.trackingNo} hrCase={c} />
            ))}
          </div>
        ) : (
          <p className="rounded-box border border-dashed border-line px-4 py-6 text-center text-[13px] text-mut">
            ยังไม่มีเคสที่เปิดอยู่
          </p>
        )}
      </section>
    </Screen>
  );
}
