import type { Metadata } from "next";
import { Link2Off } from "lucide-react";

import { PublicShell } from "@/app/recruitment/_components/public-shell";
import { SignPortal } from "@/app/recruitment/_components/sign-portal";
import { loadSignPortal, type SignPortalData } from "@/app/recruitment/_lib/sign-link-store";

/**
 * หน้าลงนามเอกสารของผู้สมัคร — เปิดจากลิงก์ที่ฝ่ายบุคคลส่งให้ **ไม่ต้องเข้าสู่ระบบ**
 * (`proxy.ts` กันเฉพาะ `/recruitment/admin` อยู่แล้ว) · กติกาของลิงก์อยู่ที่ `sign-links.ts`
 *
 * อ่านทุกอย่างฝั่งเซิร์ฟเวอร์แล้วส่งลงไปทีเดียว — ลิงก์ไม่ถูกต้อง/หมดอายุ/ถูกยกเลิก
 * ขึ้นหน้าข้อความเดียวกันหมด ไม่บอกว่าเป็นกรณีไหน (ไม่ให้ใช้เดา token)
 */

export const metadata: Metadata = {
  title: "ลงนามเอกสาร",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let data: SignPortalData | null = null;
  let failed = false;
  try {
    data = await loadSignPortal(token);
  } catch (err) {
    console.error("[sign] โหลดหน้าลงนามไม่สำเร็จ —", err);
    failed = true;
  }

  if (!data) {
    return (
      <PublicShell>
        <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 px-5 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-base-200 text-mut">
            <Link2Off size={22} strokeWidth={1.8} aria-hidden />
          </span>
          <h1 className="text-18 font-semibold">
            {failed ? "เปิดเอกสารไม่สำเร็จ" : "ลิงก์นี้ใช้ไม่ได้แล้ว"}
          </h1>
          <p className="text-13-5 text-mut">
            {failed
              ? "ระบบขัดข้องชั่วคราว กรุณาลองเปิดลิงก์อีกครั้งในอีกสักครู่"
              : "ลิงก์หมดอายุ ถูกยกเลิก หรือไม่ถูกต้อง — กรุณาติดต่อเจ้าหน้าที่ฝ่ายบุคคลเพื่อขอลิงก์ใหม่"}
          </p>
        </div>
      </PublicShell>
    );
  }

  return <SignPortal data={data} />;
}
