"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { AvatarCropper } from "@/components/ui/avatar-cropper";
import { requestJson } from "@/lib/http";
import { ACCEPT_ATTR, ACCEPTED_LABEL, isAcceptedImage } from "@/lib/image-resize";
import { runAction } from "@/lib/swal";
import type { DriverRecord } from "@/app/recruitment/_lib/drivers/types";

/**
 * รูปประจำตัว พจส. — กดที่วงรูปเพื่อเพิ่ม/เปลี่ยนรูป
 *
 * ขั้นตอน: กดวงรูป → เลือกไฟล์ → ครอปเป็นจัตุรัส (`AvatarCropper`) →
 * `PUT /api/drivers/{drivercode}/photo` ซึ่งอัปขึ้น Spaces แล้วเก็บ **URL สาธารณะ**
 * ลง `master_driver` ต่อ · ท่าเดียวกับ `EmployeePhoto` ของหน้าพนักงานออฟฟิศ
 * ต่างกันแค่ปลายทางที่บันทึก (ที่นั่นคือ NCAC ที่นี่คือ Mongo ของเราเอง)
 *
 * บันทึกเสร็จ **ไม่เดารูปเอง** — เรียก `router.refresh()` ให้ server component
 * ไปอ่าน `photoUrl` ที่บันทึกจริงกลับมา ถ้าบันทึกไม่ติด รูปบนจอจะไม่เปลี่ยน
 * **ห้ามเปลี่ยนเป็นโชว์พรีวิวจากเครื่องแทน** — รูปจะหายทันทีที่รีเฟรช
 * ซึ่งคือหน้าจอโกหกผู้ใช้
 *
 * อยู่ในแถวตารางที่ทั้งแถวกดแล้วเปิดประวัติ ทุก event จึง `stopPropagation()` —
 * ไม่งั้นกดจะเพิ่มรูปแล้วเด้งออกไปหน้าอื่นแทน
 */
export function DriverAvatar({
  driver,
  size = "sm",
  editable = true,
}: {
  driver: DriverRecord;
  size?: "sm" | "md" | "xl";
  editable?: boolean;
}) {
  /**
   * คนที่พ้นสภาพได้วงรูปโทนแดง — อ่านออกได้จากตัวข้อมูลเอง ไม่ต้องให้หน้าที่เรียกส่งธงมา
   * · ทำให้แคปหน้าจอส่งต่อก็ยังอ่านออกว่าคนนี้ไม่ได้อยู่แล้ว โดยไม่ต้องมีแท็บติดไปด้วย
   */
  const tone = driver.active || driver.noWorkRecord ? "default" : "alert";
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editable) {
    return <Avatar name={driver.name} src={driver.photoUrl || null} size={size} tone={tone} />;
  }

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
        title: driver.photoUrl
          ? `เปลี่ยนรูปของ ${driver.name || driver.drivercode}?`
          : `บันทึกรูปของ ${driver.name || driver.drivercode}?`,
        text: driver.photoUrl
          ? "รูปเดิมจะถูกแทนที่ และรูปใหม่จะไปแสดงทุกที่ที่มีชื่อคนขับคนนี้"
          : "รูปนี้จะไปแสดงทุกที่ที่มีชื่อคนขับคนนี้",
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
            `/api/drivers/${encodeURIComponent(driver.drivercode)}/photo`,
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
    router.refresh();
  }

  const badge = size === "xl" ? "size-8 -right-1 -bottom-1" : "size-4.5 -right-0.5 -bottom-0.5";

  return (
    <span
      className="relative inline-flex flex-none"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => input.current?.click()}
        aria-label={`${driver.photoUrl ? "เปลี่ยน" : "เพิ่ม"}รูปของ ${driver.name || driver.drivercode}`}
        title={`${driver.photoUrl ? "เปลี่ยน" : "เพิ่ม"}รูป`}
        className="cursor-pointer rounded-full transition-transform duration-150 hover:scale-105 active:scale-95"
      >
        <Avatar name={driver.name} src={driver.photoUrl || null} size={size} tone={tone} />
      </button>

      {/* กล้องเกาะมุมขวาล่าง — ขอบสีพื้นทำให้ไม่จมไปกับรูป และบอกว่าวงนี้กดได้ */}
      <span
        aria-hidden
        className={`pointer-events-none absolute grid place-items-center rounded-full border-2 border-base-100 ${
          tone === "alert" ? "bg-alert text-ink-content" : "bg-primary text-primary-content"
        } ${badge}`}
      >
        <Camera size={size === "xl" ? 14 : 9} strokeWidth={2.2} />
      </span>

      {/* `<input type="file">` ดิบเป็นข้อยกเว้นที่ CLAUDE.md อนุญาต — ซ่อนด้วย `sr-only` */}
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

      {error && !picked ? (
        <span
          role="alert"
          className="absolute top-full left-0 z-10 mt-1 w-max max-w-48 rounded-field border border-alert/30 bg-base-100 px-2 py-1 text-11 text-alert"
        >
          {error}
        </span>
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
    </span>
  );
}
