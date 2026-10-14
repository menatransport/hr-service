import { cookies } from "next/headers";

import { ShellHeader } from "@/components/shell/shell-header";
import { SIDEBAR_COOKIE, ShellSidebar } from "@/components/shell/shell-sidebar";
import type { ShellUser } from "@/components/shell/user-menu";

/**
 * เชลล์ของหน้าในทั้งระบบ (`/desk/*` · `/recruitment/admin/*` · `/payroll/*`) — สไตล์ menaIT V.2
 * ในโทน teal: พื้นไล่สีเต็มจอ (นิ่ง ไม่มีเส้นทาง/ดวงไฟเคลื่อนไหว) + แถบบน (ย้อนกลับ · ชื่อหน้า ·
 * เมนูผู้ใช้) + แถบข้างกระชับ (ย่อเป็นไอคอนได้) + เนื้อหาบนแผ่นโค้งมน **เต็มความกว้างจอ**
 *
 * ระยะขอบเล็กโดยตั้งใจ — หน้าในเป็นตาราง/ฟอร์มที่ต้องการพื้นที่ ไม่ใช่หน้าโชว์
 *
 * แถบข้างคือ menulist ของกลุ่มงาน (`ModuleNav` แบบ `morph`) — เมนูบนหน้า Home บินมาเป็นแถวตรงนี้
 * · `fallback` = เมนูเดิมของระบบนั้น ใช้ตอนหน้านี้ไม่อยู่ในกลุ่มใด
 *
 * แผ่นเนื้อหาเป็น **component เดียว** พื้นทึบ ไม่มีเงา — ข้างในแบน ไม่มีการ์ดซ้อน (`.app-shell-sheet`
 * ใน globals.css) · เลื่อนทั้งหน้า (ไม่ได้เลื่อนในกล่อง) เพื่อให้ `sticky` และ modal ของหน้าเดิมทำงานเหมือนเดิม
 * — ระยะของแถบบนที่ติดหัวจออยู่ที่ `--shell-header-h` ใช้แทน `top-14` เดิม
 */
export async function AppShell({
  user,
  actions,
  fallback,
  systemLabel,
  children,
}: {
  user: ShellUser;
  /** ปุ่มเสริมบนแถบบน ก่อนเมนูผู้ใช้ (ใช้ `glass-btn`) */
  actions?: React.ReactNode;
  fallback: React.ReactNode;
  /** ชื่อบนแถบบนของหน้าที่ไม่อยู่ในกลุ่มงานใด */
  systemLabel?: string;
  children: React.ReactNode;
}) {
  const rail = (await cookies()).get(SIDEBAR_COOKIE)?.value === "rail";

  return (
    <div className="app-shell relative flex min-h-dvh flex-col">
      <ShellHeader
        user={user}
        actions={actions}
        fallback={fallback}
        systemLabel={systemLabel}
      />

      {/* `pt-0.5` = ช่อง 2px ใต้แถบบน — ขอบสว่าง 1px รอบแผ่น (`--sheet-rim`) จึงไม่ถูกแถบบนที่ติดหัวจอ
          บังด้านบน (เดิมเห็นขอบแค่ซ้าย-ขวา-ล่าง) · แถบข้างที่ติดหัวจอก็ห่างลงมา 2px เท่ากัน */}
      <div className="relative flex w-full flex-1 items-start gap-2.5 px-2 pt-0.5 pb-2 sm:px-3 sm:pb-3">
        <ShellSidebar fallback={fallback} initialRail={rail} />
        {/*
          ห้ามใส่ transform/animation ที่ <main> — จะกลายเป็น containing block ของ `position: fixed`
          ทำให้ modal ในหน้าเคสหลุดตำแหน่ง ถ้าอยากมี entrance animation ให้ใส่ที่เนื้อหาของแต่ละหน้า

          **ไม่มี padding บน-ล่าง** (13 ต.ค. 2026 · Bew) — แถบสรุปที่ชนขอบแผ่นจึงติดขอบบนพอดี
          หน้าที่ขึ้นต้นด้วยตัวหนังสือเว้นบนเอง (`PageHead` มี `pt-4 sm:pt-5` ในตัว)
          · `overflow-clip` = ของที่ชนขอบแผ่นโค้งตามมุมแผ่น — clip ไม่ใช่ hidden เพราะ clip
          ไม่สร้าง scroll container ของที่ `sticky` จึงยังติดหัวจอได้
        */}
        <main className="app-shell-sheet min-h-[calc(100dvh-var(--shell-header-h)-0.875rem)] min-w-0 flex-1 overflow-clip rounded-[16px] px-(--sheet-px)">
          {children}
        </main>
      </div>
    </div>
  );
}
