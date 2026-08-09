"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  Paperclip,
  X,
} from "lucide-react";

import { Screen } from "@/components/m/screen";
import { TextField, TextareaField } from "@/components/ui/field";
import type { MobileIdentity } from "@/lib/auth/identity";
import { reasonGroups } from "@/lib/data";
import { confirm, escapeHtml, toastSuccess } from "@/lib/swal";
import type { ReasonGroupCode } from "@/lib/types";

const MAX_FILES = 5;
const STEPS = 3;

interface Attachment {
  id: string;
  name: string;
  url: string;
  isImage: boolean;
}

export function ReportWizard({ reporter }: { reporter: MobileIdentity }) {
  const [step, setStep] = useState(1);
  const [group, setGroup] = useState<ReasonGroupCode | null>(null);
  const [subject, setSubject] = useState("");
  const [detail, setDetail] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // object URLs are per-session; release whatever is still open on unmount
  const liveFiles = useRef<Attachment[]>([]);
  useEffect(() => {
    liveFiles.current = files;
  }, [files]);
  useEffect(
    () => () => liveFiles.current.forEach((f) => URL.revokeObjectURL(f.url)),
    [],
  );

  const chosen = reasonGroups.find((g) => g.code === group);
  const canAdvance =
    step === 1
      ? Boolean(group)
      : step === 2
        ? subject.trim().length > 4 && detail.trim().length > 4
        : true;

  /**
   * ยังไม่ได้ยิงไปหลังบ้านจริง (เคสถูกสร้างที่ mena-go — ดู CLAUDE.md) แต่ถามยืนยัน
   * ก่อนเหมือนกัน เพราะสำหรับ พจส. นี่คือปุ่มที่ “ส่งเรื่องออกไป” จริง ๆ
   * ต่อ endpoint เมื่อไหร่ให้ย้ายมาใช้ `runAction` แบบเดียวกับหน้าจอฝั่ง desk
   */
  async function submit() {
    const ok = await confirm({
      title: "ส่งเรื่องนี้ให้ฝ่ายบุคคล?",
      html: `ส่งแล้วแก้ไขเองไม่ได้ — ถ้าต้องเพิ่มข้อมูล ให้ส่งข้อความถึงผู้รับผิดชอบในหน้าเคสแทน<span class="hrs-swal-quote">${escapeHtml(subject.trim())}</span>`,
      confirmText: "ส่งเรื่อง",
    });
    if (!ok) return;
    setSubmitted(true);
    void toastSuccess("ส่งเรื่องเรียบร้อย", "ติดตามสถานะได้ที่เมนู “เรื่องของฉัน”");
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const room = MAX_FILES - files.length;
    const next = Array.from(list)
      .slice(0, room)
      .map((file) => ({
        id: `${file.name}-${file.lastModified}-${Math.random()}`,
        name: file.name,
        url: URL.createObjectURL(file),
        isImage: file.type.startsWith("image/"),
      }));
    setFiles((prev) => [...prev, ...next]);
  }

  function removeFile(id: string) {
    setFiles((prev) => {
      const hit = prev.find((f) => f.id === id);
      if (hit) URL.revokeObjectURL(hit.url);
      return prev.filter((f) => f.id !== id);
    });
  }

  if (submitted) {
    return (
      <Screen className="flex flex-col items-center justify-center gap-5 px-8 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-soft text-primary">
          <CheckCircle2 size={32} strokeWidth={1.6} aria-hidden />
        </span>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-xl font-semibold">ส่งเรื่องเรียบร้อย</h1>
          <p className="text-[13.5px] text-mut text-pretty">
            ระบบจะออกเลขติดตามให้ในแท็บ “เคสของฉัน” · ERZONE
            จะคัดกรองและจัดผู้รับผิดชอบภายใน 1 วันทำการ
          </p>
        </div>
        <div className="flex w-full flex-col gap-2.5 pt-2">
          <Link
            href="/m/cases"
            className="rounded-field bg-primary px-4 py-3.5 text-center text-[15px] font-medium text-primary-content"
          >
            ดูเคสของฉัน
          </Link>
          <Link
            href="/m"
            className="rounded-field border border-line px-4 py-3.5 text-center text-[15px] text-mut"
          >
            กลับหน้าแรก
          </Link>
        </div>
      </Screen>
    );
  }

  return (
    <>
      <header className="flex flex-none flex-col gap-3.5 border-b border-line px-5 pt-3 pb-3.5">
        <div className="flex items-center gap-3">
          {step === 1 ? (
            <Link
              href="/m"
              aria-label="ย้อนกลับ"
              className="-ml-1.5 flex size-9 flex-none items-center justify-center rounded-selector hover:bg-base-200"
            >
              <ChevronLeft size={22} strokeWidth={1.7} aria-hidden />
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              aria-label="ย้อนกลับหนึ่งขั้นตอน"
              className="-ml-1.5 flex size-9 flex-none items-center justify-center rounded-selector hover:bg-base-200"
            >
              <ChevronLeft size={22} strokeWidth={1.7} aria-hidden />
            </button>
          )}
          <h1 className="flex-1 text-[19px] font-semibold">แจ้งเรื่องร้องเรียน</h1>
          <span className="flex-none text-[12.5px] text-mut">
            {step}/{STEPS}
          </span>
        </div>
        <div className="flex gap-1.5" aria-hidden>
          {Array.from({ length: STEPS }, (_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i < step ? "bg-primary" : "bg-line"
              }`}
            />
          ))}
        </div>
      </header>

      <Screen className="flex flex-col gap-4.5 px-5 pt-4 pb-6">
        {step === 1 ? (
          <fieldset className="flex flex-col gap-2.5">
            <legend className="pb-3 text-sm font-semibold">
              เรื่องนี้อยู่กลุ่มไหน
            </legend>
            {reasonGroups.map((g) => {
              const on = group === g.code;
              const Icon = g.icon;

              return (
                <label
                  key={g.code}
                  className={`flex cursor-pointer items-center gap-3.5 rounded-box p-3.5 transition-colors ${
                    on
                      ? "border-[1.6px] border-primary bg-soft"
                      : "border border-line hover:border-primary/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="reasonGroup"
                    value={g.code}
                    checked={on}
                    onChange={() => setGroup(g.code)}
                    className="sr-only"
                  />
                  <span
                    className={`flex size-9 flex-none items-center justify-center rounded-[10px] ${
                      on ? "bg-primary text-primary-content" : "bg-base-200 text-mut"
                    }`}
                    aria-hidden
                  >
                    <Icon size={18} strokeWidth={1.7} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className={`text-[14.5px] ${on ? "font-medium" : ""}`}>
                      {g.label}
                    </span>
                    <span className="text-[12px] text-mut">{g.hint}</span>
                  </span>
                  {on ? (
                    <Check
                      size={17}
                      strokeWidth={2.6}
                      className="flex-none text-primary"
                      aria-hidden
                    />
                  ) : null}
                </label>
              );
            })}
          </fieldset>
        ) : null}

        {step === 2 ? (
          <div className="flex flex-col gap-4">
            <TextField
              id="subject"
              label="หัวเรื่อง"
              size="lg"
              labelRight={
                <span className="text-[12px] text-mut">{chosen?.label}</span>
              }
              value={subject}
              onChange={setSubject}
              placeholder="ระบุหัวเรื่องของเรื่อง"
            />

            <TextareaField
              id="detail"
              label="รายละเอียด"
              size="lg"
              value={detail}
              onChange={setDetail}
              rows={4}
              resize={false}
              placeholder="เกิดอะไรขึ้น เมื่อไหร่ ที่ไหน และใครเกี่ยวข้องบ้าง"
            />

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={files.length >= MAX_FILES}
                className="flex flex-col items-center gap-2 rounded-box border-[1.5px] border-dashed border-line px-4 py-4.5 text-mut transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-50"
              >
                <Camera size={24} strokeWidth={1.6} aria-hidden />
                <span className="text-[13.5px]">ถ่ายรูป หรือ แนบวิดีโอ</span>
                <span className="text-[11.5px]">
                  แนบได้ถึง {MAX_FILES} ไฟล์ · เหลือ {MAX_FILES - files.length}
                </span>
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
                className="sr-only"
              />

              {files.length ? (
                <ul className="flex flex-wrap gap-2.5">
                  {files.map((f) => (
                    <li key={f.id} className="relative">
                      {f.isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={f.url}
                          alt={f.name}
                          className="size-[70px] rounded-[10px] border border-line object-cover"
                        />
                      ) : (
                        <span className="flex size-[70px] flex-col items-center justify-center gap-1 rounded-[10px] border border-line bg-base-200 text-mut">
                          <Paperclip size={18} strokeWidth={1.6} aria-hidden />
                          <span className="text-[10px]">วิดีโอ</span>
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeFile(f.id)}
                        aria-label={`ลบไฟล์ ${f.name}`}
                        className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-ink text-ink-content"
                      >
                        <X size={12} strokeWidth={2.5} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold">ตรวจสอบก่อนส่ง</h2>
            <dl className="divide-y divide-line overflow-hidden rounded-box border border-line">
              <Row label="กลุ่มเรื่อง" value={chosen?.label ?? "—"} />
              <Row label="หัวเรื่อง" value={subject} />
              <Row
                label="ผู้แจ้ง"
                value={`${reporter.name} · ${reporter.employeeId}`}
              />
              <Row
                label="สังกัด"
                value={[reporter.role, reporter.team].filter(Boolean).join(" · ")}
              />
              {/* พนักงานออฟฟิศไม่มีรถประจำตัว — ไม่มีค่าก็ไม่ต้องมีแถว */}
              {reporter.plate ? <Row label="ทะเบียนรถ" value={reporter.plate} /> : null}
              <Row label="ไฟล์แนบ" value={`${files.length} ไฟล์`} />
            </dl>
            <div className="flex flex-col gap-1.5 rounded-box border border-line bg-base-200 p-3.5">
              <span className="text-[12px] text-mut">รายละเอียด</span>
              <p className="text-[13.5px] whitespace-pre-line text-pretty">
                {detail}
              </p>
            </div>
            <div className="flex flex-col gap-2 rounded-box border border-line p-3.5">
              <span className="text-[12px] font-medium">ขั้นตอนหลังส่ง</span>
              <ol className="flex flex-col gap-1.5 text-[12px] text-mut">
                {[
                  "HR คัดกรองและจัดผู้รับผิดชอบ",
                  "ผู้รับผิดชอบวางแผนแก้ไข",
                  "ผู้จัดการอนุมัติแผนแก้ไข",
                  "ดำเนินการแก้ไข แล้วแจ้งผลกลับผู้แจ้ง",
                ].map((s, i) => (
                  <li key={s} className="flex gap-2">
                    <span className="flex size-4 flex-none items-center justify-center rounded-full bg-soft text-[10px] font-medium text-primary">
                      {i + 1}
                    </span>
                    {s}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        ) : null}
      </Screen>

      <footer className="flex-none border-t border-line px-5 pt-3.5 pb-safe md:pb-5">
        <button
          type="button"
          disabled={!canAdvance}
          onClick={() => (step < STEPS ? setStep((s) => s + 1) : submit())}
          className="w-full rounded-field bg-primary px-4 py-3.5 text-[15px] font-medium text-primary-content transition-[transform,opacity] active:scale-[0.99] disabled:opacity-40"
        >
          {step < STEPS ? "ถัดไป" : "ส่งเรื่อง"}
        </button>
        {step === 2 && !canAdvance ? (
          <p className="pt-2 text-center text-[12px] text-mut">
            กรอกหัวเรื่องและรายละเอียดอย่างน้อย 5 ตัวอักษร
          </p>
        ) : null}
      </footer>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5">
      <dt className="flex-none text-[12.5px] text-mut">{label}</dt>
      <dd className="min-w-0 flex-1 truncate text-right text-[13px] font-medium">
        {value}
      </dd>
    </div>
  );
}
