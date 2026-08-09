import type { Metadata } from "next";
import Image from "next/image";
import { LangToggle } from "@/components/login/lang-toggle";
import { SignInCard, type SignInState } from "@/components/login/sign-in-card";

export const metadata: Metadata = {
  title: "เข้าสู่ระบบ",
  description: "เข้าสู่ระบบ HR Service ด้วยบัญชีอีเมลบริษัท @menatransport.co.th",
};

/**
 * รับสถานะเริ่มต้นจาก query string — ปกติมาจาก `/api/auth/callback/google`
 * ตอนล็อกอินไม่ผ่าน และยังเปิดดูหน้าจอ error ตอนรีวิวดีไซน์ได้เหมือนเดิม
 * (`/?state=error-domain`, `/?state=error-network`)
 */
function readState(value: string | string[] | undefined): SignInState {
  return value === "error-domain" || value === "error-network" ? value : "idle";
}

const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export default async function LoginPage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const initialState = readState(params.state);

  return (
    <main className="relative isolate grid flex-1 grid-rows-[auto_1fr_auto] overflow-hidden bg-linear-to-b from-soft via-canvas to-canvas px-5 sm:px-8 lg:px-10">
      {/* กริดจางไล่ลงมาจากขอบบน ทับบนพื้นที่อาบเขียวอ่อนของ `from-soft` */}
      <div aria-hidden className="login-grid pointer-events-none absolute inset-0 -z-10" />

      <header className="login-in flex h-16 animate-fade-in items-center justify-between">
        {/* โลโก้อยู่บนแผ่นขาวเสมอ — สีเขียว/แดงของแบรนด์จมหายถ้าวางบนพื้นธีมมืด */}
        <span className="flex items-center rounded-selector border border-line bg-g-chip px-2.5 py-1.5">
          <Image
            src="/mena-logo.png"
            alt="มีนาทรานสปอร์ต"
            width={168}
            height={112}
            priority
            className="h-7 w-auto"
          />
        </span>
        <LangToggle />
      </header>

      <div className="flex items-start justify-center py-6 sm:items-center sm:py-8">
        <SignInCard
          initialState={initialState}
          reason={one(params.reason)}
          next={one(params.next)}
        />
      </div>

      <footer className="login-in animate-fade-in pb-6 [animation-delay:350ms]">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-mut">
          <span className="-my-2 py-2">นโยบายความเป็นส่วนตัว</span>

          <span className="-my-2 w-full py-2 text-center sm:w-auto">© 2026 Mena Transport</span>
        </div>
      </footer>
    </main>
  );
}
