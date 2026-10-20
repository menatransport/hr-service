import { redirect } from "next/navigation";

import { ADMIN_ROOT } from "@/app/recruitment/_lib/admin-nav";

/**
 * ขออัตราสรรหา — **รวมเข้าหน้า “ติดตามพนักงานใหม่” แล้ว (แท็บอัตราว่าง)** ตั้งแต่ 14 ต.ค. 2026
 * เส้นทางนี้เหลือไว้ส่งต่อลิงก์เก่า · `?tab=candidates` (สมัยเป็นสองแท็บ) ไปหน้าผู้สมัคร
 */
export default async function RequisitionsPage({ searchParams }: PageProps<"/recruitment/admin/requisitions">) {
  const params = await searchParams;
  if (params.tab === "candidates") {
    const query = new URLSearchParams();
    if (typeof params.ref === "string" && params.ref) query.set("ref", params.ref);
    redirect(`${ADMIN_ROOT}/candidates${query.size ? `?${query}` : ""}`);
  }
  redirect(`${ADMIN_ROOT}/onboarding?tab=open`);
}
