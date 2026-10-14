import type { Metadata } from "next";
import Link from "next/link";

import { PageHead } from "@/components/desk/page-head";
import { QuestionsView } from "@/app/recruitment/_components/admin/questions-view";
import { DataError } from "@/components/ui/data-error";
import { listDocSlots } from "@/app/recruitment/_lib/doc-slots";
import type { DocSlot } from "@/app/recruitment/_lib/form";
import { listQuestions } from "@/app/recruitment/_lib/questions";
import type { Question } from "@/app/recruitment/_lib/types";

/**
 * หน้าคลังคำถาม — แก้ชุดคำถามที่ผู้สมัครต้องตอบโดยไม่ต้องแก้โค้ด
 *
 * ใบสมัครเก่าไม่ได้อ่านจากคลังนี้ แต่อ่านจาก `questionSnapshot` ที่ติดไปกับใบ
 * ตั้งแต่วันที่ส่ง — แก้หรือปิดคำถามที่นี่จึงไม่ทำให้ใบเก่าเพี้ยน (ดู `types.ts`)
 */

export const metadata: Metadata = {
  title: "คลังคำถาม",
};

export const dynamic = "force-dynamic";

export default async function QuestionsPage() {
  let questions: Question[] | null = null;
  let docSlots: DocSlot[] = [];
  let error: string | null = null;

  try {
    [questions, docSlots] = await Promise.all([listQuestions(), listDocSlots()]);
  } catch (err) {
    error = err instanceof Error ? err.message : "เชื่อมต่อฐานข้อมูลไม่สำเร็จ";
  }

  return (
    <div className="flex flex-col gap-5 animate-rise">
      <PageHead
        title="คลังคำถาม"
        subtitle="แก้คำถามที่ผู้สมัครต้องตอบได้ทันที ใบสมัครที่ส่งไปแล้วเก็บสำเนาคำถามของตัวเองไว้ จึงไม่ได้รับผลกระทบ"
        actions={
          <Link
            href="/recruitment/apply"
            target="_blank"
            rel="noreferrer"
            className="btn-sec px-3.5 py-2 text-13 text-mut transition-colors hover:border-primary/40 hover:text-ink"
          >
            เปิดฟอร์มจริง
          </Link>
        }
      />

      {questions ? (
        <QuestionsView initialQuestions={questions} initialDocSlots={docSlots} />
      ) : (
        <div className="mx-auto max-w-xl py-6">
          <DataError
            title="โหลดคลังคำถามไม่สำเร็จ"
            envKey="MONGO_URI"
            message={error ?? "เชื่อมต่อฐานข้อมูลไม่สำเร็จ"}
          />
        </div>
      )}
    </div>
  );
}
