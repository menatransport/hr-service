import { HomeView } from "@/app/home/_components/home-view";
import { getDeskIdentity } from "@/lib/auth/session";
import { moduleById, type ModuleId } from "@/lib/modules";

export const metadata = { title: "หน้าหลัก" };

/**
 * หน้าหลัก (`/home`) — โครงเดียวกับ Home ของ menaIT V.2 (โทน teal ของ HR)
 * สามคอลัมน์กลุ่มงานจาก `lib/modules.ts` · `?m=<กลุ่ม>` เลือกแท็บกลุ่มนั้นไว้บนมือถือ
 * (ลิงก์ “หน้าหลัก” บนแถบบนของหน้าในพากลับมาพร้อมกลุ่มเดิม)
 *
 * เดิมอยู่ที่ `/desk` — ตอนนี้ `/desk` เด้งมาที่นี่ (`next.config.ts`) · คิวคำร้องอยู่ที่ `/desk/cases`
 */
export default async function HomePage(props: PageProps<"/home">) {
  const { m } = await props.searchParams;
  const identity = await getDeskIdentity();

  return (
    <HomeView
      user={{
        name: identity.name,
        role: identity.role,
        department: identity.department,
        employeeId: identity.employeeId,
        imageUrl: identity.imageUrl,
      }}
      firstName={identity.firstName}
      initialGroup={(moduleById(typeof m === "string" ? m : null)?.id ?? "driver") as ModuleId}
    />
  );
}
