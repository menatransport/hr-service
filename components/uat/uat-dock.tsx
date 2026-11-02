import { getMyUat } from "@/lib/uat-store";

import { UatDockPanel } from "./uat-dock-panel";

/**
 * ปุ่ม UAT มุมขวาล่าง — ขึ้นเฉพาะผู้ทดสอบ และเฉพาะตอนเปิด UAT อยู่ (`/desk/uat`) · วางใน `AppShell` + Home
 * ระบบชั่วคราว: จบ UAT แล้วลบไฟล์นี้กับจุดที่เรียกออกได้เลย
 */
export async function UatDock() {
  const my = await getMyUat();
  return my ? <UatDockPanel initial={my} /> : null;
}
