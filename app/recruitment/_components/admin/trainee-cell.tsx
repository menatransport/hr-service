"use client";

import { memo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { Select } from "@/components/ui/field";
import { requestJson } from "@/lib/http";
import { toastError } from "@/lib/swal";
import {
  WORK_STATUS_GROUPS,
  formatThaiDate,
  workStatusFullLabel,
  type TraineeDailyEntry,
} from "@/app/recruitment/_lib/drivers/types";
import { TONE_FILL, TONE_TEXT, cellTone } from "@/app/recruitment/_lib/drivers/trainees";

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
  beforeStart: boolean;
  isStart: boolean;
  /** กรอกวันนี้ได้ไหม — ย้อนหลังได้ไม่จำกัด ห้ามเฉพาะอนาคต (บังคับซ้ำฝั่งเซิร์ฟเวอร์) */
  editable: boolean;
  onSaved: (drivercode: string, iso: string, entry: TraineeDailyEntry | null) => void;
}

export const TraineeCell = memo(function TraineeCell({
  drivercode,
  driverName,
  iso,
  atms,
  manual,
  note,
  beforeStart,
  isStart,
  editable,
  onSaved,
}: TraineeCellProps) {
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const cellRef = useRef<HTMLButtonElement>(null);

  const canEdit = editable && !saving;

  async function save(code: string) {
    setSaving(true);

    try {
      const res = await requestJson<{ entry: TraineeDailyEntry | null }>(
        `/api/drivers/${encodeURIComponent(drivercode)}/daily`,
        { method: "PUT", body: { dateISO: iso, code, note } },
        "บันทึกไม่สำเร็จ",
      );
      onSaved(drivercode, iso, res.entry);
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
      {editing ? (
        <Select
          value={manual}
          onChange={save}
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
