"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink, ListChecks, Maximize2, TriangleAlert } from "lucide-react";

import { ModalShell } from "@/components/ui/modal-shell";
import { MascotLoader } from "@/components/ui/mascot";
import { requestJson } from "@/lib/http";
import { QuestionsView } from "@/app/recruitment/_components/admin/questions-view";
import { ADMIN_ROOT } from "@/app/recruitment/_lib/admin-nav";
import type { DocSlot } from "@/app/recruitment/_lib/form";
import type { Question } from "@/app/recruitment/_lib/types";

/** หน้าที่ขึ้นปุ่มสองปุ่มนี้บนแถบบน — RC แก้คำถามจากหน้าผู้สมัครได้โดยไม่ต้องย้ายหน้า */
const SHOW_ON = [`${ADMIN_ROOT}/candidates`];

/**
 * ปุ่ม “ดูหน้าสมัครงาน” + “จัดการคำถามฟอร์มสมัคร” บนแถบบน + กล่องแก้คำถาม — ขึ้นเฉพาะหน้าผู้สมัคร
 * (20 ต.ค. 2569 · Bew) · “ดูหน้าสมัครงาน” พาไปหน้าที่ผู้สมัครเห็นจริง ไว้เช็คหลังแก้คำถาม
 *
 * เนื้อในคือ `QuestionsView` ตัวเดียวกับหน้าคลังคำถาม — แก้ที่ไหนก็บันทึกทันทีทีละรายการ
 * กล่องจึงไม่มีปุ่มบันทึก · โหลดคำถาม/ช่องเอกสารตอนเปิดเท่านั้น (หน้าผู้สมัครไม่ต้องรอ)
 */
export function FormQuestionsAction() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (!SHOW_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  return (
    <>
      <Link
        href="/recruitment"
        className="glass-btn hidden h-10 flex-none items-center gap-1.5 rounded-xl px-3.5 text-12-5 font-medium md:flex"
      >
        <ExternalLink size={15} strokeWidth={1.8} aria-hidden />
        ดูหน้าสมัครงาน
      </Link>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="glass-btn hidden h-10 flex-none items-center gap-1.5 rounded-xl px-3.5 text-12-5 font-medium md:flex"
      >
        <ListChecks size={15} strokeWidth={1.8} aria-hidden />
        จัดการคำถามฟอร์มสมัคร
      </button>
      {open ? <FormQuestionsDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function FormQuestionsDialog({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<{ questions: Question[]; docSlots: DocSlot[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([
      requestJson<Question[]>("/api/recruitment/questions", {}, "โหลดคำถามไม่สำเร็จ"),
      requestJson<DocSlot[]>("/api/recruitment/doc-slots", {}, "โหลดช่องเอกสารไม่สำเร็จ"),
    ])
      .then(([questions, docSlots]) => {
        if (alive) setData({ questions, docSlots });
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "โหลดคำถามไม่สำเร็จ");
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <ModalShell
      title="จัดการคำถามฟอร์มสมัคร"
      subtitle="แก้แล้วมีผลกับผู้สมัครคนถัดไปทันที · ใบที่ส่งแล้วไม่กระทบ"
      onClose={onClose}
      width="1280px"
      tone="plain"
      footer={
        <>
          <Link
            href={`${ADMIN_ROOT}/questions`}
            onClick={onClose}
            className="btn-ghost mr-auto flex items-center gap-1.5 px-3 py-2 text-13"
          >
            <Maximize2 size={14} strokeWidth={1.8} aria-hidden />
            เปิดเต็มหน้า
          </Link>
          <Link
            href="/recruitment/apply"
            target="_blank"
            rel="noreferrer"
            className="btn-sec flex items-center gap-1.5 px-3.5 py-2 text-13"
          >
            <ExternalLink size={14} strokeWidth={1.8} aria-hidden />
            เปิดฟอร์มจริง
          </Link>
          <button type="button" onClick={onClose} className="btn-pri px-4 py-2 text-13">
            เสร็จ
          </button>
        </>
      }
    >
      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-field bg-alert/10 px-3 py-2 text-12-5 text-alert"
        >
          <TriangleAlert size={14} strokeWidth={1.9} aria-hidden className="mt-0.5 flex-none" />
          {error}
        </p>
      ) : data ? (
        <QuestionsView initialQuestions={data.questions} initialDocSlots={data.docSlots} />
      ) : (
        <MascotLoader text="กำลังโหลดคำถาม" className="py-20" />
      )}
    </ModalShell>
  );
}
