"use client";

import { memo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { Select, TextareaField } from "@/components/ui/field";
import { ModalShell } from "@/components/ui/modal-shell";
import { requestJson } from "@/lib/http";
import { toastError, toastSuccess } from "@/lib/swal";
import {
  WORK_STATUS_GROUPS,
  formatThaiDate,
  isExitStatus,
  workStatusFullLabel,
  type TraineeDailyEntry,
} from "@/app/recruitment/_lib/drivers/types";
import { TONE_FILL, TONE_TEXT, cellTone, reasonRuleOf } from "@/app/recruitment/_lib/drivers/trainees";

/**
 * หนึ่งช่องในตารางติดตามฝึกงาน — **ผ่าทแยงเป็นสองสามเหลี่ยม**
 *
 * ```
 *  ┌────────┐   บน-ซ้าย  = รหัสที่ระบบ ATMS ดึงมาให้ (อ่านอย่างเดียว)
 *  │ฝ  ╲    │   ล่าง-ขวา = รหัสที่ฝ่ายบุคคลกรอกเอง (กดที่ช่องเพื่อเลือก)
 *  │    ╲  A│
 *  └────────┘
 * ```
 *
 * **ผ่าทแยงแทนที่จะเลือกโชว์อันใดอันหนึ่ง** เพราะสองค่านี้ตอบคนละคำถาม —
 * ของ ATMS คือชุดที่ผูกกับค่าแรง ของที่กรอกเองคือสิ่งที่หัวหน้าฝึกเห็นหน้างานจริง
 * ในวันที่ข้อมูลยังไม่ไหลมาถึง · วันไหนสองค่าไม่ตรงกันคือเรื่องที่ต้องรู้ ไม่ใช่
 * เรื่องที่ควรถูกกลบด้วยกติกา “อันไหนชนะ” — ช่องเดียวเห็นทั้งคู่จึงเห็นได้ทันที
 *
 * **กดได้เฉพาะครึ่งล่าง** ในความหมายของข้อมูล คือเลือกแล้วเขียนลง
 * `hr_service.trainee_daily` เท่านั้น ไม่มีทางแตะค่าของ ATMS ได้เลย ·
 * ทั้งช่องเป็นพื้นที่กดเพราะสามเหลี่ยมล่างจริง ๆ เล็กเกินกว่าจะเล็งบนจอสัมผัส
 *
 * ## สองเรื่องที่ทำเพื่อไม่ให้เบราว์เซอร์ค้าง
 *
 * ตารางเต็มเดือนคือราว **150 แถว × 31 วัน ≈ 4,800 ช่อง** ตัวเลขนี้เปลี่ยนสิ่งที่
 * ปกติไม่ต้องคิดให้กลายเป็นเรื่องคอขวด:
 *
 * 1. **ดรอปดาวน์ถูกสร้างตอนกด ไม่ใช่ตอนวาดตาราง** — `Select` หนึ่งตัวคือ Radix
 *    Root + context + effect หนึ่งชุด · ถ้าแปะไว้ทุกช่องตั้งแต่แรกคือสี่พันกว่าชุด
 *    ที่เกือบทั้งหมดไม่มีใครแตะ ซึ่งหนักพอจะทำให้หน้าค้างตอนโหลด · ปกติช่องเป็น
 *    `<button>` เปล่า ๆ แล้วค่อยสลับเป็น `Select` ที่ `defaultOpen` เมื่อถูกกด
 *    แล้วถอดออกเมื่อปิด — **มีไม่เกินหนึ่งตัวในหน้าพร้อมกัน**
 * 2. **รับค่าเป็นสตริงแล้วห่อ `memo`** ไม่ใช่รับอ็อบเจกต์ `DayCell` —
 *    `buildTraineeRows()` สร้าง `DayCell` ใบใหม่ทุกครั้งที่กรอกหนึ่งช่อง
 *    อ็อบเจกต์ใหม่ = `memo` ไม่มีผล = ทั้งสี่พันช่องวาดใหม่เพื่อการเปลี่ยนช่องเดียว
 */

const CLIP_TOP = "polygon(0 0, 100% 0, 0 100%)";
const CLIP_BOTTOM = "polygon(100% 0, 100% 100%, 0 100%)";

export interface TraineeCellProps {
  drivercode: string;
  driverName: string;
  iso: string;
  /** รหัสจาก ATMS · ว่าง = ไม่มี (สตริงล้วนเพื่อให้ `memo` เทียบได้ — ดูหัวไฟล์) */
  atms: string;
  /** รหัสที่กรอกเอง · ว่าง = ไม่มี */
  manual: string;
  note: string;
  /** `ลอ`/`ปอ` หลังฝึก 1–2 วัน */
  trial: boolean;
  beforeStart: boolean;
  isStart: boolean;
  /** กรอกวันนี้ได้ไหม — ย้อนหลังได้ไม่จำกัด ห้ามเฉพาะอนาคต (บังคับซ้ำฝั่งเซิร์ฟเวอร์) */
  editable: boolean;
  /** `prev` = รหัสที่กรอกเองก่อนบันทึก — หน้าผู้สมัครใช้รู้ว่ากด/ถอด `ร` (รอรับรถ) */
  onSaved: (drivercode: string, iso: string, entry: TraineeDailyEntry | null, prev: string) => void;
}

export const TraineeCell = memo(function TraineeCell({
  drivercode,
  driverName,
  iso,
  atms,
  manual,
  note,
  trial,
  beforeStart,
  isStart,
  editable,
  onSaved,
}: TraineeCellProps) {
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  /** รหัสที่รอกรอกเหตุผลก่อนบันทึก (หัวข้อของรายงานประจำวัน — `reasonRuleOf`) */
  const [asking, setAsking] = useState<string | null>(null);
  const cellRef = useRef<HTMLButtonElement>(null);

  const canEdit = editable && !saving;

  /* รหัสที่ขึ้นรายงาน RC Alert (ลากิจ/ลาป่วย/ขาดงาน/ปลด/ลาออก) ถามเหตุผลก่อน · ที่เหลือบันทึกทันที */
  function pick(code: string) {
    if (code && reasonRuleOf(code)) setAsking(code);
    else void save(code, "", false);
  }

  async function save(code: string, reason: string, isTrial: boolean) {
    setSaving(true);

    try {
      const res = await requestJson<{ entry: TraineeDailyEntry | null; exited?: boolean; exitError?: string }>(
        `/api/drivers/${encodeURIComponent(drivercode)}/daily`,
        { method: "PUT", body: { dateISO: iso, code, note: reason, trial: isTrial } },
        "บันทึกไม่สำเร็จ",
      );
      onSaved(drivercode, iso, res.entry, manual);
      if (res.exitError) toastError("บันทึกสถานะแล้ว แต่ปิดผลสิ้นสุดไม่สำเร็จ", res.exitError);
      else if (res.exited) toastSuccess("บันทึกแล้ว · ปิดผลสิ้นสุดและย้ายใบสมัครไปยกเลิกแล้ว");
    } catch (err) {
      /* ไม่แก้ค่าในหน้าจอเมื่อบันทึกไม่ติด — ช่องยังเป็นค่าเดิมที่เซิร์ฟเวอร์รู้จัก
         ผู้ใช้จะได้เห็นว่ายังไม่ถูกบันทึก แทนที่จะเห็นค่าใหม่ค้างอยู่ลอย ๆ */
      toastError("บันทึกไม่สำเร็จ", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  const face = (
    <span
      className={`relative block h-9 w-full overflow-hidden rounded-[5px] ${
        beforeStart ? "border border-dashed border-line/70" : "bg-base-300/55"
      } ${isStart ? "ring-2 ring-primary ring-inset" : ""}`}
    >
      {atms ? <Half code={atms} clip={CLIP_TOP} /> : null}
      {manual ? <Half code={manual} clip={CLIP_BOTTOM} /> : null}

      {/* เส้นทแยงบาง ๆ — ขึ้นเฉพาะตอนมีสองค่า ให้เห็นว่านี่คือสองชุดไม่ใช่ค่าเดียว */}
      {atms && manual ? (
        <span
          aria-hidden
          className="absolute inset-0 bg-base-100/60"
          style={{ clipPath: "polygon(100% 0, calc(100% - 1.5px) 0, 0 100%, 1.5px 100%)" }}
        />
      ) : null}

      {atms ? (
        <span
          className={`absolute top-0 left-1 font-mono text-12 leading-[1.35] font-bold ${TONE_TEXT[cellTone(atms)]}`}
        >
          {atms}
        </span>
      ) : null}
      {manual ? (
        <span
          className={`absolute right-1 bottom-0 font-mono text-12 leading-[1.35] font-bold ${TONE_TEXT[cellTone(manual)]}`}
        >
          {manual}
        </span>
      ) : null}

      {saving ? (
        <span className="absolute inset-0 flex items-center justify-center bg-base-100/70">
          <Loader2 size={13} strokeWidth={2.2} aria-hidden className="animate-spin text-mut" />
        </span>
      ) : null}
    </span>
  );

  /**
   * ปุ่มของช่อง — **ตัวเดียวกันทั้งตอนเปล่าและตอนเป็น trigger ของดรอปดาวน์**
   *
   * `title` ถูกประกอบตอนนี้เพราะมันคือสตริงต่อหนึ่งช่อง (สี่พันกว่าเส้นต่อหนึ่งหน้า)
   * — ถูกกว่าการมีคอมโพเนนต์ทูลทิปจริงมาก และเบราว์เซอร์แสดงให้เองตอนชี้ค้าง
   */
  const button = (
    <button
      ref={cellRef}
      type="button"
      title={cellTitle(driverName, iso, atms, manual, note, beforeStart)}
      onClick={canEdit && !editing ? () => setEditing(true) : undefined}
      className={`block w-full rounded-[5px] outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-primary data-[state=open]:ring-2 data-[state=open]:ring-primary ${
        canEdit ? "cursor-pointer hover:ring-1 hover:ring-ink/25" : "cursor-default"
      }`}
    >
      {face}
    </button>
  );

  return (
    <td className="p-0.5 text-center">
      {asking ? (
        <ReasonDialog
          code={asking}
          driverName={driverName}
          iso={iso}
          initialNote={asking === manual ? note : ""}
          initialTrial={asking === manual && trial}
          onCancel={() => setAsking(null)}
          onSave={(reason, isTrial) => {
            setAsking(null);
            void save(asking, reason, isTrial);
          }}
        />
      ) : null}
      {editing ? (
        <Select
          value={manual}
          onChange={pick}
          groups={WORK_STATUS_GROUPS}
          label={`สถานะของ ${driverName} วันที่ ${formatThaiDate(iso)}`}
          searchPlaceholder="ค้นหารหัสหรือความหมาย…"
          clearable
          defaultOpen
          onOpenChange={(open) => {
            if (open) return;
            /* ปุ่มที่เป็น trigger ถูกถอดออกพร้อมกล่อง โฟกัสจึงตกไปที่ `<body>`
               คนที่เดินด้วยคีย์บอร์ดจะหลุดจากตารางทันที — คืนให้ช่องเดิมหลัง
               React วาดปุ่มเปล่ากลับมาแล้ว */
            setEditing(false);
            requestAnimationFrame(() => cellRef.current?.focus());
          }}
          trigger={button}
        />
      ) : (
        button
      )}
    </td>
  );
});

/**
 * กล่องเหตุผลของรหัสที่ขึ้นรายงาน RC Alert — ข้อความนี้ไปอยู่ท้าย “: เนื่องจาก …” ในรายงานประจำวัน
 * · `ลอ`/`ปอ` ติ๊ก “ฝึกงาน 1-2 วัน” ได้ และบอกก่อนว่าบันทึกแล้วจะปิดผลสิ้นสุด + ยกเลิกใบสมัคร
 */
function ReasonDialog({
  code,
  driverName,
  iso,
  initialNote,
  initialTrial,
  onCancel,
  onSave,
}: {
  code: string;
  driverName: string;
  iso: string;
  initialNote: string;
  initialTrial: boolean;
  onCancel: () => void;
  onSave: (reason: string, trial: boolean) => void;
}) {
  const [reason, setReason] = useState(initialNote);
  const [isTrial, setIsTrial] = useState(initialTrial);
  const exit = isExitStatus(code);
  const required = reasonRuleOf(code) === "required";
  const ready = !required || Boolean(reason.trim());

  return (
    <ModalShell
      title={`${code} — ${workStatusFullLabel(code)}`}
      subtitle={
        <span className="text-12 text-mut">
          {driverName} · {formatThaiDate(iso)}
        </span>
      }
      onClose={onCancel}
      width="440px"
      tone="plain"
      footer={
        <>
          <button type="button" onClick={onCancel} className="btn-sec px-4 py-2 text-13">
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={() => onSave(reason.trim(), exit && isTrial)}
            disabled={!ready}
            className={`${exit ? "btn-danger" : "btn-pri"} px-4 py-2 text-13 font-medium disabled:opacity-60`}
          >
            บันทึก
          </button>
        </>
      }
    >
      <TextareaField
        id="trainee-reason"
        label="เหตุผล"
        value={reason}
        onChange={setReason}
        rows={2}
        placeholder={exit ? "เช่น ตรวจพบสารเสพติด · ติดต่อไม่ได้" : "เช่น ทำธุระส่วนตัว · ไม่สบาย"}
        optional={!required}
        hint="ขึ้นในรายงานสถานะฝึกงานประจำวัน (: เนื่องจาก …)"
      />
      {exit ? (
        <>
          <label className="flex cursor-pointer items-center gap-2 text-13">
            <input
              type="checkbox"
              checked={isTrial}
              onChange={(e) => setIsTrial(e.target.checked)}
              className="size-4 accent-primary"
            />
            ฝึกงาน 1-2 วัน
          </label>
          <p className="rounded-field bg-alert/10 px-3 py-2 text-12 leading-relaxed text-alert">
            บันทึกแล้วระบบจะปิดผลสิ้นสุดของคำขอสรรหา และย้ายใบสมัครไปที่ “ยกเลิก” ให้ด้วย
          </p>
        </>
      ) : null}
    </ModalShell>
  );
}

/** สามเหลี่ยมหนึ่งใบ — สีพื้นเป็น inline style เพราะ `clip-path` ต้องคู่กับสีของโทนนั้น */
function Half({ code, clip }: { code: string; clip: string }) {
  return (
    <span
      aria-hidden
      className="absolute inset-0"
      style={{ clipPath: clip, background: TONE_FILL[cellTone(code)] }}
    />
  );
}

/**
 * ข้อความบนทูลทิปของช่อง — ที่เดียวที่บอกความหมายเต็มของทั้งสองครึ่ง
 *
 * ช่องกว้างพอสำหรับตัวย่อเท่านั้น ทุกอย่างที่เหลือ (ความหมายเต็ม ที่มาของแต่ละครึ่ง
 * หมายเหตุ) จึงมารวมที่นี่ — เอาออกเมื่อไหร่ช่องที่มีสองค่าจะอธิบายตัวเองไม่ได้
 */
function cellTitle(
  name: string,
  iso: string,
  atms: string,
  manual: string,
  note: string,
  beforeStart: boolean,
): string {
  const head = `${name} · ${formatThaiDate(iso)}`;
  if (!atms && !manual) return `${head} — ${beforeStart ? "ยังไม่ได้เริ่มงาน" : "ไม่มีบันทึก"}`;

  const parts = [head];
  if (atms) parts.push(`จากระบบ: ${atms} ${workStatusFullLabel(atms)}`);
  if (manual) parts.push(`กรอกเอง: ${manual} ${workStatusFullLabel(manual)}`);
  if (atms && manual && atms.trim() !== manual.trim()) parts.push("⚠ สองค่าไม่ตรงกัน");
  if (note) parts.push(`หมายเหตุ: ${note}`);

  return parts.join("\n");
}
