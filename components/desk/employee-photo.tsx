"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { AvatarCropper } from "@/components/ui/avatar-cropper";
import { requestJson } from "@/lib/http";
import { ACCEPT_ATTR, ACCEPTED_LABEL, isAcceptedImage } from "@/lib/image-resize";
import { runAction } from "@/lib/swal";

/**
 * รูปพนักงานบนบัตร + ปุ่มดินสอสำหรับเปลี่ยนรูป
 *
 * ขั้นตอน: กดดินสอ → เลือกไฟล์ → ครอปเป็นวงกลม (`AvatarCropper`) → ส่ง
 * `PUT /api/employees/{id}/photo` ซึ่งอัปขึ้น Spaces แล้วบันทึกกับ NCAC ต่อ
 *
 * บันทึกเสร็จ **ไม่เดารูปเอง** — เรียก `router.refresh()` ให้ server component
 * ไปอ่าน `image_url` ที่บันทึกจริงกลับมา ถ้าบันทึกไม่ติด รูปบนจอจะไม่เปลี่ยน
 * และข้อความผิดพลาดค้างอยู่ในกล่องครอป · **ห้ามเปลี่ยนเป็นปิดกล่องแล้วโชว์
 * พรีวิวจากเครื่องแทน** — รูปจะหายทันทีที่รีเฟรช ซึ่งคือหน้าจอโกหกผู้ใช้
 *
 * ไม่ย่อรูปด้วย `prepareImageForUpload` เพราะตัวครอปส่งออกเป็น JPEG 512×512
 * (ราว 40–80 KB) เล็กกว่าเกณฑ์ย่อของไฟล์นั้นอยู่แล้ว
 */
export function EmployeePhoto({
  employeeId,
  name,
  imageUrl,
}: {
  employeeId: string;
  name: string;
  imageUrl: string | null;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pick(file: File | undefined) {
    if (!file) return;
    if (!isAcceptedImage(file)) {
      setError(`ใช้ได้เฉพาะไฟล์ ${ACCEPTED_LABEL}`);
      return;
    }
    setError(null);
    setPicked(file);
  }

  async function save(cropped: File) {
    setError(null);

    const body = new FormData();
    body.append("file", cropped);

    const out = await runAction({
      confirm: {
        title: imageUrl ? `เปลี่ยนรูปของ ${name}?` : `บันทึกรูปของ ${name}?`,
        text: imageUrl
          ? "รูปเดิมจะถูกแทนที่ และรูปใหม่จะไปแสดงทุกที่ที่มีชื่อพนักงานคนนี้"
          : "รูปนี้จะไปแสดงทุกที่ที่มีชื่อพนักงานคนนี้",
        confirmText: "บันทึกรูป",
      },
      pending: "กำลังอัปโหลดและบันทึก…",
      success: "บันทึกรูปเรียบร้อย",
      failureTitle: "บันทึกรูปไม่สำเร็จ",
      /* `busy` ล็อกกล่องครอปเฉพาะช่วงที่อัปโหลดจริง ไม่ใช่ตั้งแต่ตอนถามยืนยัน */
      run: async () => {
        setBusy(true);
        try {
          return await requestJson(
            `/api/employees/${encodeURIComponent(employeeId)}/photo`,
            { method: "PUT", body },
            "บันทึกรูปไม่สำเร็จ",
          );
        } finally {
          setBusy(false);
        }
      },
    });

    if (out.status === "failed") {
      // ข้อความค้างไว้ในกล่องครอปด้วย เผื่อผู้ใช้ปิดกล่องแจ้งเตือนไปแล้วยังอยากอ่านซ้ำ
      setError(out.error.message);
      return;
    }
    if (out.status === "cancelled") return;

    setPicked(null);
    // อ่านค่าใหม่จากเซิร์ฟเวอร์ ไม่ใช่เดารูปเอง — หน้าจอจึงตรงกับของที่บันทึกจริง
    router.refresh();
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <Avatar
          name={name}
          src={imageUrl}
          size="xl"
          className="ring-4 ring-soft"
        />

        {/* ดินสอเกาะมุมขวาล่างของวง — ขอบสีพื้นบัตรทำให้ปุ่มไม่จมไปกับรูป */}
        <button
          type="button"
          onClick={() => input.current?.click()}
          aria-label={imageUrl ? "เปลี่ยนรูปพนักงาน" : "เพิ่มรูปพนักงาน"}
          className="absolute -right-1 -bottom-1 grid size-9 cursor-pointer place-items-center rounded-full border-[3px] border-base-100 bg-primary text-primary-content transition-transform duration-150 hover:scale-105 active:scale-95"
        >
          <Pencil size={14} strokeWidth={1.9} aria-hidden />
        </button>
      </div>

      {/* `<input type="file">` ดิบเป็นข้อยกเว้นที่ CLAUDE.md อนุญาต — ต้องซ่อนด้วย `sr-only` */}
      <input
        ref={input}
        type="file"
        accept={ACCEPT_ATTR}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          pick(file);
        }}
      />

      {/* ข้อผิดพลาดตอนเลือกไฟล์ — ตอนบันทึกจะไปโผล่ในกล่องครอปแทน */}
      {error && !picked ? (
        <p role="alert" className="text-center text-[11.5px] text-alert text-pretty">
          {error}
        </p>
      ) : null}

      {picked ? (
        <AvatarCropper
          file={picked}
          busy={busy}
          error={error}
          onCancel={() => {
            if (busy) return;
            setPicked(null);
            setError(null);
          }}
          onSave={save}
        />
      ) : null}
    </div>
  );
}
