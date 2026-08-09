import { Suspense } from "react";

import { IdentityProvider } from "@/components/auth/identity-provider";
import { WelcomeToast } from "@/components/auth/welcome-toast";
import { DeskSidebar } from "@/components/desk/sidebar";
import { DeskTopBar } from "@/components/desk/topbar";
import { getDeskIdentity } from "@/lib/auth/session";

/**
 * HR / office-staff shell — the sidebar layout from wireframe `1c`.
 * The same sidebar serves HR and corporate staff; only the visible menu
 * entries differ, so nothing here is role-specific.
 *
 * ตัวตนของผู้ใช้ถูกอ่านจากคุกกี้ session ที่นี่ที่เดียว แล้วส่งลงไปทั้งฝั่ง server
 * (topbar) และฝั่ง client (`IdentityProvider`) — หน้าไหนก็ตามใต้ `/desk` จะมี
 * session แน่นอน เพราะ `middleware.ts` กันไว้ให้แล้ว
 */
export default async function DeskLayout({ children }: LayoutProps<"/desk">) {
  const identity = await getDeskIdentity();

  return (
    <IdentityProvider identity={identity}>
      <div className="flex min-h-dvh flex-col bg-canvas">
        {/* `useSearchParams` ต้องอยู่ใต้ Suspense เสมอ — ตัวนี้ไม่วาดอะไรอยู่แล้ว */}
        <Suspense fallback={null}>
          <WelcomeToast name={identity.firstName} />
        </Suspense>

        <DeskTopBar identity={identity} />
        <div className="flex min-h-0 flex-1">
          <DeskSidebar />
          {/*
            ห้ามใส่ transform/animation ที่ <main> — จะกลายเป็น containing block
            ของ `position: fixed` ทำให้ modal ในหน้าเคสหลุดตำแหน่ง
            ถ้าอยากมี entrance animation ให้ใส่ที่ตัวเนื้อหาของแต่ละหน้า
          */}
          <main className="min-w-0 flex-1 px-5 py-6 lg:px-8">{children}</main>
        </div>
      </div>
    </IdentityProvider>
  );
}
