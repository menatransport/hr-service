"use client";

import { useRef, useState } from "react";
import { Loader2, Paperclip, Trash2, TriangleAlert } from "lucide-react";

import { requestJson } from "@/lib/http";
import { isAcceptedImage, prepareImageForUpload } from "@/lib/image-resize";
import {
  attachmentKind,
  attachmentUrl,
  formatFileSize,
  type RecordAttachment,
} from "@/lib/record-case-flow";

/**
 * ช่องแนบไฟล์ของบันทึกเคส — รับได้ทั้ง **รูปภาพและเอกสาร** และแนบได้หลายไฟล์
 *
 * ไฟล์ถูกอัปเข้า MongoDB ทันทีที่เลือก (`POST /api/record-cases/attachments`)
 * แล้วถือไว้เป็น `RecordAttachment` (id + ชื่อ + ชนิด + ขนาด) ไม่ใช่ตัวไฟล์ —
 * ตอนกดบันทึกจึงส่งแค่ JSON และปุ่มบันทึกไม่ต้องค้างรออัปโหลด
 *
 * รูปถูกย่อก่อนส่งด้วย `prepareImageForUpload()` เหมือนฝั่งคำร้อง ส่วนเอกสาร
 * ส่งไปตามจริง (ย่อไม่ได้และไม่ควรแตะ)
 *
 * `<input type="file">` ดิบเป็นข้อยกเว้นที่ CLAUDE.md อนุญาต — ซ่อนด้วย `sr-only`
 * แล้วให้ปุ่มจริงเป็นตัวกด
 */

const ACCEPT =
  "image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt";

const MAX_FILES = 10;
/** ต้องตรงกับ `MAX_FILE_BYTES` ใน `lib/record-files.ts` — ไฟล์อยู่ในฐานข้อมูล ไม่ใช่บน bucket */
const MAX_MB = 10;

export function AttachmentField({
  id,
  value,
  onChange,
  disabled,
  hideLabel = false,
}: {
  id: string;
  value: RecordAttachment[];
  /**
   * รับเป็น setter ของ `useState` ตรง ๆ (ไม่ใช่ `(files) => void`) เพราะการอัปโหลด
   * กินเวลาข้าม render — ต้องต่อท้าย**ค่าล่าสุด** ด้วยฟังก์ชันอัปเดต ไม่งั้นไฟล์ที่
   * อัปเสร็จทีหลังจะทับของก่อนหน้าจนเหลือไฟล์เดียว
   */
  onChange: React.Dispatch<React.SetStateAction<RecordAttachment[]>>;
  disabled?: boolean;
  /** ซ่อนคำว่า “ไฟล์แนบ” — ใช้ตอนที่หัวข้อของส่วนบอกอยู่แล้ว (ฟอร์มบันทึกเคส) */
  hideLabel?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  /** ชื่อไฟล์ที่กำลังอัปอยู่ — โชว์เป็นแถวหลอกต่อท้ายรายการ ผู้ใช้จะได้เห็นว่ามีอะไรค้าง */
  const [uploading, setUploading] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const busy = uploading.length > 0;

  async function add(files: FileList | File[]) {
    const picked = [...files];
    if (!picked.length) return;
    setError(null);

    if (value.length + uploading.length + picked.length > MAX_FILES) {
      setError(`แนบได้ไม่เกิน ${MAX_FILES} ไฟล์`);
      return;
    }

    for (const file of picked) {
      if (file.size > MAX_MB * 1024 * 1024) {
        setError(`“${file.name}” ใหญ่เกิน ${MAX_MB} MB`);
        continue;
      }

      setUploading((list) => [...list, file.name]);
      try {
        const body = new FormData();
        body.append("file", isAcceptedImage(file) ? await prepareImageForUpload(file) : file);

        const saved = await requestJson<RecordAttachment>(
          "/api/record-cases/attachments",
          { method: "POST", body },
          "แนบไฟล์ไม่สำเร็จ",
        );
        /* ชื่อที่แสดงใช้ชื่อไฟล์เดิมของผู้ใช้ ไม่ใช่ชื่อบน bucket ที่ถูกเติมเวลา/สุ่มไว้ */
        onChange((prev) => [...prev, { ...saved, name: file.name }]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "แนบไฟล์ไม่สำเร็จ");
      } finally {
        setUploading((list) => list.filter((n) => n !== file.name));
      }
    }
  }

  function remove(fileId: string) {
    /* ลบออกจากรายการอย่างเดียว ตัวไฟล์ยังค้างใน GridFS — ไฟล์ที่ไม่มีเคสไหน
       อ้างถึงเปิดไม่ได้อยู่แล้วถ้าไม่รู้ id และเก็บกวาดทีหลังได้ */
    onChange((prev) => prev.filter((f) => f.fileId !== fileId));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        {hideLabel ? null : (
          <span className="text-[12.5px] font-medium text-mut">ไฟล์แนบ</span>
        )}
        <span className="ml-auto text-[11.5px] text-mut">
          {value.length}/{MAX_FILES} ไฟล์
        </span>
      </div>

      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) void add(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-box border border-dashed px-4 py-6 text-center transition-colors ${
          disabled
            ? "cursor-not-allowed border-line bg-base-200 text-mut"
            : dragging
              ? "border-primary bg-soft"
              : "border-line bg-base-100 hover:border-primary/50"
        }`}
      >
        <Paperclip size={20} strokeWidth={1.7} className="text-mut" aria-hidden />
        <span className="text-[13px] font-medium">ลากไฟล์มาวาง หรือคลิกเพื่อเลือก</span>
        <span className="text-[11.5px] text-mut">
          รูปภาพ JPG · PNG · WebP และเอกสาร PDF · Word · Excel · CSV · TXT (ไม่เกิน {MAX_MB} MB)
        </span>
        <input
          ref={input}
          id={id}
          type="file"
          multiple
          accept={ACCEPT}
          disabled={disabled}
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) void add(e.target.files);
            // ล้างค่าไว้ เลือกไฟล์ชื่อเดิมซ้ำจะได้ยิง change อีกครั้ง
            e.target.value = "";
          }}
        />
      </label>

      {error ? (
        <p className="flex items-start gap-1.5 text-[12px] text-alert">
          <TriangleAlert size={14} strokeWidth={1.8} className="mt-0.5 flex-none" aria-hidden />
          {error}
        </p>
      ) : null}

      {value.length || busy ? (
        <ul className="flex flex-col gap-1.5">
          {value.map((file) => (
            <li
              key={file.fileId}
              className="flex items-center gap-2.5 rounded-field border border-line bg-base-100 px-3 py-2"
            >
              <Icon file={file} />
              <a
                href={attachmentUrl(file)}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-[12.5px] hover:text-primary hover:underline underline-offset-2"
              >
                {file.name}
              </a>
              <span className="flex-none text-[11.5px] text-mut">
                {formatFileSize(file.size)}
              </span>
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => remove(file.fileId)}
                  aria-label={`ลบไฟล์ ${file.name}`}
                  className="flex size-7 flex-none items-center justify-center rounded-selector text-mut transition-colors hover:bg-alert/10 hover:text-alert"
                >
                  <Trash2 size={15} strokeWidth={1.7} aria-hidden />
                </button>
              ) : null}
            </li>
          ))}

          {uploading.map((name) => (
            <li
              key={`up-${name}`}
              className="flex items-center gap-2.5 rounded-field border border-dashed border-line bg-base-200 px-3 py-2 text-mut"
            >
              <Loader2 size={15} strokeWidth={1.8} className="flex-none animate-spin" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[12.5px]">{name}</span>
              <span className="flex-none text-[11.5px]">กำลังอัปโหลด…</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** ไอคอน + สีตามชนิดไฟล์จริง (PDF/Word/Excel/รูป) — กฎอยู่ที่ `attachmentKind()` ที่เดียว */
function Icon({ file }: { file: RecordAttachment }) {
  const kind = attachmentKind(file);
  const Glyph = kind.icon;
  return (
    <span
      title={kind.label}
      className={`flex size-7 flex-none items-center justify-center rounded-selector bg-base-200 ${kind.tone}`}
    >
      <Glyph size={15} strokeWidth={1.7} aria-hidden />
    </span>
  );
}
