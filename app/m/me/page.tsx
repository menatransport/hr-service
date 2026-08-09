import Link from "next/link";
import { Bus, ChevronRight, IdCard, Mail, MapPin, Monitor, Phone } from "lucide-react";

import { LogoutRow } from "@/components/auth/logout-button";
import { Screen } from "@/components/m/screen";
import { Avatar } from "@/components/ui/avatar";
import { SectionTitle } from "@/components/ui/section-title";
import { ThemeToggleRow } from "@/components/ui/theme-toggle";
import { getMobileIdentity } from "@/lib/auth/session";
import { getCasesByDriver } from "@/lib/cases";
import type { MobileIdentity } from "@/lib/auth/identity";

export const metadata = { title: "โปรไฟล์" };

export const dynamic = "force-dynamic";

/**
 * ข้อมูลติดต่อยังเป็นตัวอย่างอยู่ (`08x-xxx-4471` / อีเมล) — NCAC ไม่ได้ส่ง
 * เบอร์โทรมา และ `POST /auth/login/google` ก็ไม่ได้คืน `email` กลับมาด้วย
 * แถวที่ไม่มีค่าจริงสำหรับคนคนนี้ (รถประจำตัว/เขต ของพนักงานออฟฟิศ) ถูกตัดทิ้งไปเลย
 */
const factsOf = (me: MobileIdentity) =>
  [
    { icon: IdCard, label: "รหัสพนักงาน", value: me.employeeId },
    {
      icon: MapPin,
      label: "สังกัด",
      value: [me.role, me.team].filter(Boolean).join(" · "),
    },
    { icon: Bus, label: "รถประจำตัว", value: me.plate },
    { icon: Phone, label: "เบอร์ติดต่อ", value: me.authenticated ? null : "08x-xxx-4471" },
    {
      icon: Mail,
      label: "อีเมล",
      value: me.authenticated ? null : "somchai.k@example.co.th",
    },
  ].filter((f): f is { icon: typeof IdCard; label: string; value: string } =>
    Boolean(f.value),
  );

export default async function ProfilePage() {
  const me = await getMobileIdentity();
  const facts = factsOf(me);

  // ตัวเลขสองช่องนี้ไม่ควรทำให้ทั้งหน้าล่มถ้า API ล่ม — ล้มแล้วนับเป็น 0
  const myCases = await getCasesByDriver(me.employeeId).catch(() => []);
  const openCount = myCases.filter((c) => c.status !== "closed").length;
  const closedCount = myCases.filter((c) => c.status === "closed").length;

  return (
    <Screen className="flex flex-col gap-5 px-5 pt-3 pb-6">
      <div className="flex items-center gap-3.5">
        <Avatar name={me.name} src={me.imageUrl} size="hero" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="truncate text-lg font-semibold">{me.name}</h1>
          <p className="text-[13px] text-mut">
            {[me.role, me.team].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Link
          href="/m/cases"
          className="flex flex-col gap-1 rounded-box border border-line bg-base-100 p-3.5 transition-colors hover:border-primary/40"
        >
          <span className="text-[11.5px] text-mut">เคสที่ยังไม่ปิด</span>
          <span className="text-xl font-semibold text-primary">{openCount}</span>
        </Link>
        <Link
          href="/m/cases"
          className="flex flex-col gap-1 rounded-box border border-line bg-base-100 p-3.5 transition-colors hover:border-primary/40"
        >
          <span className="text-[11.5px] text-mut">ปิดแล้ว</span>
          <span className="text-xl font-semibold">{closedCount}</span>
        </Link>
      </div>

      <section className="flex flex-col gap-3">
        <SectionTitle>ข้อมูลพนักงาน</SectionTitle>
        <dl className="divide-y divide-line overflow-hidden rounded-box border border-line bg-base-100">
          {facts.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center gap-3 px-3.5 py-3">
              <Icon size={17} strokeWidth={1.6} className="flex-none text-mut" aria-hidden />
              <dt className="flex-none text-[13px] text-mut">{label}</dt>
              <dd className="min-w-0 flex-1 truncate text-right text-[13.5px] font-medium">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-[12px] text-mut">
          ข้อมูลเหล่านี้ถูกเติมให้อัตโนมัติในทุกเคสที่คุณแจ้ง จึงไม่ต้องกรอกซ้ำ
        </p>
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionTitle>อื่น ๆ</SectionTitle>
        <ThemeToggleRow />
        <Link
          href="/desk"
          className="flex items-center gap-3 rounded-box border border-line bg-base-100 px-3.5 py-3 transition-colors hover:border-primary/40"
        >
          <Monitor size={17} strokeWidth={1.6} className="flex-none text-mut" aria-hidden />
          <span className="flex-1 text-[13.5px]">มุมมอง HR (เดสก์ท็อป)</span>
          <ChevronRight size={16} strokeWidth={1.7} className="flex-none text-mut" aria-hidden />
        </Link>
        <LogoutRow />
      </section>
    </Screen>
  );
}
