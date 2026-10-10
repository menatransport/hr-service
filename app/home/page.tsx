import { HomeView, type HomeBadge } from "@/app/home/_components/home-view";
import { getDeskIdentity } from "@/lib/auth/session";
import { isOpenCase, isSlaBreached } from "@/lib/case-flow";
import { getCases } from "@/lib/cases";
import { moduleById, type ModuleId } from "@/lib/modules";

export const metadata = { title: "หน้าหลัก" };

/** ตัวเลขบนเมนูมาจากคำร้องจริงทุกครั้งที่เปิด — ห้าม prerender */
export const dynamic = "force-dynamic";

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
  /* ไม่ `await` — หน้าหลักไม่ต้องรอ NCAC (~250–350ms) แค่เพื่อป้ายตัวเลขสองสามอัน
     ป้ายแต่ละอันรอ promise นี้เองใน `<Suspense>` (ดู `BadgeContext` ใน home-view)
     · API ล่มก็ยังเข้าหน้าหลักได้ — แค่ไม่มีตัวเลขบนเมนู */
  const badges = getCases()
    .then((cases): Record<string, HomeBadge> => {
      const open = cases.filter(isOpenCase);
      const breached = open.filter(isSlaBreached).length;
      return {
        cases: breached
          ? { label: `เกิน SLA ${breached}`, tone: "alert" }
          : { label: `เปิด ${open.length}`, tone: "new" },
      };
    })
    .catch(() => ({}));

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
      badges={badges}
    />
  );
}
