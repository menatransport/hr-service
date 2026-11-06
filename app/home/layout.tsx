import { Suspense } from "react";

import { IdentityProvider } from "@/components/auth/identity-provider";
import { MenuAccessProvider } from "@/components/auth/menu-access-provider";
import { WelcomeToast } from "@/components/auth/welcome-toast";
import { getDeskIdentity } from "@/lib/auth/session";
import { getHiddenMenuIds } from "@/lib/menu-permissions";

/**
 * ชั้นนอกของหน้าหลัก (`/home`) — ตัวตนผู้ใช้กับ toast ต้อนรับเท่านั้น ไม่มีเชลล์
 * (Home มีฮีโร่และแถบบนของตัวเอง) · ท่าเดียวกับ `app/desk/layout.tsx`
 *
 * ล็อกอินเสร็จ callback พามาที่นี่พร้อม `?welcome=1` · `proxy.ts` กั้น `/home` ไว้แล้ว
 * จึงมี session แน่นอน · `/desk` เดิมเด้งมาที่นี่ (`next.config.ts`) บุ๊กมาร์กเก่ายังใช้ได้
 *
 * **ห้ามวาง `loading.tsx` ครอบเชลล์ของหน้าใน** — `loading.tsx` ของ Home อยู่ข้าง `page.tsx`
 * ได้ เพราะเป็นของ `/home` เท่านั้น ไม่กระทบการ “บิน” ของเมนูไปเป็นแถบข้างใต้ `/desk`
 */
export default async function HomeLayout({ children }: LayoutProps<"/home">) {
  const [identity, hidden] = await Promise.all([getDeskIdentity(), getHiddenMenuIds()]);

  return (
    <IdentityProvider identity={identity}>
      {/* เมนูที่หน้า “กำหนดสิทธิ์” ซ่อนจากผู้ใช้คนนี้ — การ์ดกลุ่ม ไอคอนมือถือ และช่องค้นหาเมนูอ่านจากตัวนี้ */}
      <MenuAccessProvider hidden={hidden}>
      {/* `useSearchParams` ต้องอยู่ใต้ Suspense เสมอ — ตัวนี้ไม่วาดอะไรอยู่แล้ว */}
      <Suspense fallback={null}>
        <WelcomeToast name={identity.firstName} />
      </Suspense>
      {children}
      </MenuAccessProvider>
    </IdentityProvider>
  );
}
