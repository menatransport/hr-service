import { redirect } from "next/navigation";

import { settingsNav } from "@/app/recruitment/_lib/admin-nav";

/** `/settings` เฉย ๆ ไม่มีเนื้อหาของตัวเอง — พาไปรายการแรกที่เปิดใช้แล้ว */
export default function SettingsIndex() {
  const first = settingsNav.flatMap((g) => g.items).find((i) => i.ready);
  redirect(first?.href ?? "/recruitment/admin");
}
