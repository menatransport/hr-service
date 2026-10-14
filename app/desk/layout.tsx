import { Suspense } from "react";

import { IdentityProvider } from "@/components/auth/identity-provider";
import { WelcomeToast } from "@/components/auth/welcome-toast";
import { getDeskIdentity } from "@/lib/auth/session";

/**
 * ชั้นนอกสุดของ `/desk` — ตัวตนผู้ใช้กับ toast ต้อนรับเท่านั้น **ไม่มีแถบบน/แถบข้าง**
 *
 * เชลล์ (แถบบน + แถบข้างของโมดูล) อยู่ที่ `(module)/layout.tsx` · หน้าหลักย้ายไป `/home`
 * (`app/home`) แล้ว — `/desk` เปล่า ๆ เด้งไป `/home` ด้วย redirect ใน `next.config.ts`
 *
 * ตัวตนของผู้ใช้ถูกอ่านจากคุกกี้ session ที่นี่ที่เดียว แล้วส่งลงไปทั้งฝั่ง server
 * และฝั่ง client (`IdentityProvider`) — หน้าไหนก็ตามใต้ `/desk` จะมี session แน่นอน
 * เพราะ `proxy.ts` กันไว้ให้แล้ว
 *
 * **ห้ามวาง `loading.tsx` ไว้ระดับนี้** — มันจะครอบเชลล์ของโมดูลทั้งก้อน ตอนกดเมนูจาก
 * Home แถบข้างจะยังไม่ขึ้นในจังหวะเดียวกับการเปลี่ยนหน้า แล้วเมนูจะไม่ “บิน” ไปเป็นแถบข้าง
 * (view transition ต้องเห็นชื่อเดียวกันทั้งหน้าเก่าและหน้าใหม่ในคอมมิตเดียว)
 */
export default async function DeskLayout({ children }: LayoutProps<"/desk">) {
  const identity = await getDeskIdentity();

  return (
    <IdentityProvider identity={identity}>
      {/* `useSearchParams` ต้องอยู่ใต้ Suspense เสมอ — ตัวนี้ไม่วาดอะไรอยู่แล้ว */}
      <Suspense fallback={null}>
        <WelcomeToast name={identity.firstName} />
      </Suspense>
      {children}
    </IdentityProvider>
  );
}
