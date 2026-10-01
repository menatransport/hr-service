import Link from "next/link";

import { LightTheme } from "@/app/recruitment/_components/light-theme";
import { CONTROLLER } from "@/app/recruitment/_lib/consent";

/**
 * กรอบของหน้าที่คนนอกเห็น — หน้าแรก นโยบาย และหน้าติดตามสถานะ
 * (ฟอร์มสมัครคุมเต็มจอเอง ดู `app/recruitment/apply/page.tsx`)
 *
 * **ไม่มีแถบบนเลย** — เดิมมีโลโก้กับคำว่า “รับสมัครคนขับ” พาดหัวไว้ แต่มันทำ
 * หน้าที่เดียวคือบอกว่ากำลังอยู่หน้าอะไร ซึ่งหน้าแรกบอกด้วยหัวเรื่องตัวใหญ่อยู่แล้ว
 * · ถอดออกแล้วแสงของพื้นหลังต่อเนื่องจากขอบจอลงมาถึงเนื้อหาโดยไม่มีแถบมาคั่น
 * และเนื้อหาได้ความสูงคืนมาเกือบ 60px ซึ่งบนมือถือคือความต่างระหว่าง
 * “ปุ่มสมัครอยู่เหนือเส้นพับ” กับ “ต้องเลื่อนหา”
 *
 * ไม่มีปุ่มสลับธีมเช่นกัน — กลุ่มหน้านี้เป็น **ธีมสว่างอย่างเดียว** เพราะพื้นหลัง
 * ออกแบบเป็นชุดสีเดียว (`.recruit-canvas` ใน `globals.css`) · การบังคับธีมมี
 * สองชั้น ดูเหตุผลที่ `light-theme.tsx` และสคริปต์ใน `app/layout.tsx`
 *
 * ทางกลับหน้าแรกเหลือทางเดียวคือลิงก์ชื่อบริษัทท้ายหน้า — พอสำหรับหน้านโยบาย
 * กับหน้าติดตามสถานะ ซึ่งทั้งคู่เป็นปลายทางที่คนเปิดจากลิงก์ตรงอยู่แล้ว
 */

export function PublicShell({
  children,
  footerNote,
}: {
  children: React.ReactNode;
  footerNote?: string;
}) {
  return (
    <div className="recruit-canvas flex min-h-dvh flex-1 flex-col">
      <LightTheme />

      <main className="flex-1">{children}</main>

      <footer className="border-t border-line/70">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-1.5 px-5 py-5 text-11-5 text-mut">
          {/* ชื่อบริษัทเป็นลิงก์กลับหน้าแรก — ทางกลับทางเดียวที่เหลือหลังถอดแถบบน */}
          <Link href="/recruitment" className="w-fit hover:text-ink">
            {CONTROLLER.company}
          </Link>
          <span>
            {footerNote ??
              "ข้อมูลของคุณถูกเก็บตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562"}
          </span>
          <Link href="/recruitment/privacy" className="w-fit text-primary hover:underline">
            นโยบายความเป็นส่วนตัว
          </Link>
        </div>
      </footer>
    </div>
  );
}
