import { redirect } from "next/navigation";

import { ADMIN_ROOT } from "@/app/recruitment/_lib/admin-nav";

/**
 * ตารางฝึกงานรายวัน — **ย้ายไปอยู่ใต้แท็บ training ของ “ติดตามพนักงานใหม่” แล้ว**
 * (ซ่อนไว้จนกดเปิด) · เส้นทางนี้เหลือไว้ส่งต่อลิงก์เก่า
 */
export default function TraineesPage() {
  redirect(`${ADMIN_ROOT}/onboarding?tab=training`);
}
