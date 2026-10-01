import type { Metadata } from "next";

import { ApplyFlow } from "@/app/recruitment/_components/apply-flow";
import { PublicShell } from "@/app/recruitment/_components/public-shell";
import { DataError } from "@/components/ui/data-error";
import { listDocSlots } from "@/app/recruitment/_lib/doc-slots";
import type { DocSlot } from "@/app/recruitment/_lib/form";
import { listActiveQuestions } from "@/app/recruitment/_lib/questions";
import type { Question } from "@/app/recruitment/_lib/types";

/**
 * ฟอร์มสมัครงาน — ด่านยินยอม PDPA แล้วตามด้วยห้าขั้น
 *
 * คำถามถูกอ่านฝั่งเซิร์ฟเวอร์แล้วส่งลงไปกับหน้า ไม่ได้ให้ client ยิงเอาเองหลัง
 * โหลด — ผู้สมัครบนเน็ตช้าจะได้ไม่ต้องเห็นหน้าจอเปล่ารอสองจังหวะ
 * (ฟอร์มยังมีเส้น `public/questions` ไว้ให้เครื่องมือภายนอกเรียก)
 *
 * **หน้านี้ไม่ได้อยู่ใน `PublicShell`** ต่างจากหน้าอื่นในกลุ่มเดียวกัน — ฟอร์มคุม
 * เต็มจอเองตั้งแต่แถบบนยันปุ่มติดขอบล่าง เพื่อให้ได้จังหวะแบบแอปบนมือถือ
 * (หัวเว็บกับท้ายเว็บที่เลื่อนแทรกอยู่ทำให้ปุ่ม “ถัดไป” ไม่มีทางติดขอบล่างได้จริง)
 * เหลือ `PublicShell` ไว้เฉพาะตอนเปิดฟอร์มไม่ได้ ซึ่งเป็นหน้าข้อความธรรมดา
 */

export const metadata: Metadata = {
  title: "กรอกใบสมัคร",
  description: "กรอกใบสมัครพนักงานขับรถ ใช้เวลาประมาณ 5 นาที",
};

/** คำถามแก้จากหน้าแอดมินได้ตลอด หน้านี้จึงต้องอ่านใหม่ทุกครั้ง ห้าม cache */
export const dynamic = "force-dynamic";

export default async function ApplyPage() {
  /* อ่านข้อมูลใน try/catch แล้วค่อยประกอบ JSX ข้างนอก — JSX ที่สร้างใน try
     ไม่ได้ถูกเรนเดอร์ตรงนั้น error ตอนเรนเดอร์จึงไม่มีทางตกลงมาที่ catch อยู่ดี */
  let questions: Question[] | null = null;
  let docSlots: DocSlot[] = [];
  let error: string | null = null;

  try {
    [questions, docSlots] = await Promise.all([listActiveQuestions(), listDocSlots()]);
  } catch (err) {
    error = err instanceof Error ? err.message : "เชื่อมต่อฐานข้อมูลไม่สำเร็จ";
  }

  if (!questions) {
    return (
      <PublicShell>
        <div className="mx-auto w-full max-w-lg px-5 py-8">
          <DataError
            title="เปิดฟอร์มสมัครไม่ได้"
            envKey="MONGO_URI"
            message={error ?? "ตอนนี้เปิดฟอร์มสมัครไม่ได้ ลองใหม่อีกครั้งภายหลัง"}
          />
        </div>
      </PublicShell>
    );
  }

  return <ApplyFlow questions={questions} docSlots={docSlots} />;
}
