import { redirect } from "next/navigation";

import { ADMIN_ROOT } from "@/app/recruitment/_lib/admin-nav";

/**
 * ลิงก์เก่าของหน้าเส้นทางรายคน — ตอนนี้เป็น dialog บนหน้าติดตามพนักงานใหม่ (Bew 4 พ.ย. 2569)
 * · `?open=<id>` เปิด dialog ของคำขอนี้ในแท็บของคนนั้นให้เลย
 */
export default async function OnboardingJourneyPage(props: PageProps<"/recruitment/admin/onboarding/[id]">) {
  const { id } = await props.params;
  redirect(`${ADMIN_ROOT}/onboarding?${new URLSearchParams({ open: id })}`);
}
