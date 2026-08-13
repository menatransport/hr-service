"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { MessageSquarePlus, X } from "lucide-react";

import { TextareaField, TextField, isDropdownOpen } from "@/components/ui/field";
import { ImageUploadField } from "@/components/ui/image-upload-field";
import { requestJson } from "@/lib/http";
import { escapeHtml, runAction } from "@/lib/swal";

/**
 * ปุ่ม “แจ้งเรื่องเอง” + modal สร้างคำร้องแทนคนขับ (เช่น รับเรื่องทางโทรศัพท์)
 *
 * ยิงตรงไปที่ `POST /api/cases` → `POST /complaints/` ของ NCAC จริง
 * (`ComplaintCreate` บังคับแค่ `driver_id` / `subject` / `detail`)
 * สร้างสำเร็จแล้วพาไปหน้าคำร้องนั้นทันทีผ่าน `CaseModal` ที่มีอยู่แล้ว
 * แทนที่จะทำหน้าจอ “สำเร็จ” แยกต่างหาก
 *
 * ⚠️ ตัว overlay ต้อง `createPortal` ไป `document.body` เสมอ — ปุ่มนี้ถูก render
 * อยู่ใน `<div className="animate-rise">` ของ `CaseListView` ซึ่ง transform
 * animation ทำให้ div นั้นกลายเป็น containing block ของ `position: fixed`
 * โมดัลจึงไปจัดกลางเทียบ `<main>` (เยื้องขวา/ล่างตามความกว้าง sidebar)
 * แทนที่จะกลางจอ — อาการเดียวกับที่ CLAUDE.md เตือนเรื่อง `<main>` ของ desk layout
 */

/**
 * `imageUrl` คือ URL ของไฟล์ที่ `ImageUploadField` อัปขึ้น Spaces ให้แล้ว
 * (NCAC เก็บไฟล์แนบเป็นลิงก์ ไม่ได้เก็บตัวไฟล์ — ดู `lib/uploads.ts`)
 */
const emptyForm = { driverId: "", subject: "", detail: "", imageUrl: "" };

export function NewCaseButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  const busyRef = useRef(busy);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  const close = useCallback(() => {
    if (busyRef.current) return;
    setOpen(false);
    setForm(emptyForm);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // ภาพเต็มจอ / dropdown เปิดอยู่ → Esc ครั้งนี้เป็นของตัวนั้น ไม่ใช่ของโมดัล
      if (isDropdownOpen()) return;
      close();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  const valid = Boolean(
    form.driverId.trim() && form.subject.trim() && form.detail.trim(),
  );

  async function submit() {
    if (!valid || busy) return;

    const out = await runAction({
      confirm: {
        title: "ส่งเรื่องนี้เข้าระบบ?",
        html: `คำร้องจะถูกสร้างในชื่อคนขับ <b>${escapeHtml(form.driverId.trim())}</b> และเข้าคิวเป็น “เปิดคำร้อง” ทันที<span class="hrs-swal-quote">${escapeHtml(form.subject.trim())}</span>`,
        confirmText: "ส่งเรื่อง",
      },
      pending: "กำลังสร้างคำร้อง…",
      failureTitle: "สร้างคำร้องไม่สำเร็จ",
      /* กล่องกลางจอ ไม่ใช่ขนมปังปิ้ง — ต้องให้ผู้ใช้เห็นเลขคำร้องที่เพิ่งได้มาก่อนหน้าจะเด้งไปหน้าคำร้อง */
      loud: true,
      success: (data: { trackingNo: string }) => `สร้างคำร้อง ${data.trackingNo} แล้ว`,
      successDetail: "กำลังเปิดหน้าคำร้องให้กรอกแผนดำเนินการต่อ",
      /* `busy` ล็อกฟอร์มเฉพาะช่วงที่ยิงจริง ไม่ใช่ตั้งแต่ตอนถามยืนยัน */
      run: async () => {
        setBusy(true);
        try {
          return await requestJson<{ trackingNo: string }>(
            "/api/cases",
            { method: "POST", body: form },
            "สร้างคำร้องไม่สำเร็จ",
          );
        } finally {
          setBusy(false);
        }
      },
    });

    if (out.status !== "done") return;

    setOpen(false);
    setForm(emptyForm);
    router.push(`/desk`);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-field bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-content transition-opacity hover:opacity-90"
      >
        <MessageSquarePlus size={16} strokeWidth={1.8} aria-hidden />
        แจ้งเรื่องเอง
      </button>

      {/* `open` เป็น false เสมอตอน SSR และ hydration แรก — portal จึงไม่ต้องรอ `mounted` */}
      {open
        ? createPortal(
            <div className="fixed inset-0 z-50 grid place-items-center p-3 sm:p-6">
              <button
                type="button"
                aria-label="ปิดหน้าต่างแจ้งเรื่อง"
                onClick={close}
                className="absolute inset-0 cursor-default bg-ink/45 backdrop-blur-[2px]"
              />

              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="new-case-title"
                className="relative flex max-h-[92dvh] w-full max-w-[480px] flex-col overflow-hidden rounded-[18px] border border-line bg-canvas shadow-[0_32px_80px_-24px_rgba(21,32,29,0.45)] outline-none animate-rise"
              >
                <header className="flex flex-none items-center justify-between gap-3 border-b border-line bg-base-100 px-5 py-4">
                  <h2 id="new-case-title" className="text-[15px] font-semibold">
                    แจ้งเรื่องเอง
                  </h2>
                  <button
                    type="button"
                    onClick={close}
                    aria-label="ปิด"
                    disabled={busy}
                    className="flex size-8 flex-none items-center justify-center rounded-selector text-mut transition-colors hover:bg-base-200 hover:text-ink disabled:opacity-40"
                  >
                    <X size={17} strokeWidth={1.9} aria-hidden />
                  </button>
                </header>

                <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-5">
                  <p className="text-[12.5px] text-mut text-pretty">
                    ใช้เมื่อรับเรื่องแทนคนขับ เช่น แจ้งทางโทรศัพท์ —
                    คำร้องจะเข้าคิวเป็น “เปิดคำร้อง” เหมือนแจ้งจากแอปมือถือ
                  </p>

                  <TextField
                    id="new-case-driver"
                    label="รหัสคนขับ (Driver ID)"
                    value={form.driverId}
                    onChange={(v) => setForm((f) => ({ ...f, driverId: v }))}
                    placeholder="เช่น 100234"
                    readOnly={busy}
                  />
                  <TextField
                    id="new-case-subject"
                    label="หัวเรื่อง"
                    value={form.subject}
                    onChange={(v) => setForm((f) => ({ ...f, subject: v }))}
                    placeholder="สรุปเรื่องสั้น ๆ"
                    readOnly={busy}
                  />
                  <TextareaField
                    id="new-case-detail"
                    label="รายละเอียด"
                    value={form.detail}
                    onChange={(v) => setForm((f) => ({ ...f, detail: v }))}
                    placeholder="รายละเอียดที่คนขับแจ้ง"
                    readOnly={busy}
                    rows={4}
                  />

                  <ImageUploadField
                    id="new-case-image"
                    label="รูปภาพประกอบ"
                    value={form.imageUrl || null}
                    onChange={(url) =>
                      setForm((f) => ({ ...f, imageUrl: url ?? "" }))
                    }
                    disabled={busy}
                  />
                </div>

                <footer className="flex flex-none items-center justify-end gap-2 border-t border-line bg-base-100 px-5 py-3.5">
                  <button
                    type="button"
                    onClick={close}
                    disabled={busy}
                    className="rounded-field border border-line px-3.5 py-2 text-[13px] text-mut hover:text-ink disabled:opacity-40"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!valid || busy}
                    className="rounded-field bg-primary px-4 py-2 text-[13px] font-medium text-primary-content transition-opacity disabled:opacity-40"
                  >
                    {busy ? "กำลังส่ง…" : "ส่งเรื่อง"}
                  </button>
                </footer>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
