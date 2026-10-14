"use client";

import { useState } from "react";
import { Popover as RPopover } from "radix-ui";
import { DayPicker } from "react-day-picker";
import {
  CalendarClock,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleSlash,
  Loader2,
  UserRound,
  UserRoundX,
} from "lucide-react";

import { StatusPill } from "@/app/recruitment/_components/status-pill";
import {
  THAI_MONTHS_FULL,
  THAI_WEEKDAYS,
  dateToIso,
  dayPickerClassNames,
  isoToDate,
  TextField,
} from "@/components/ui/field";
import { ModalShell } from "@/components/ui/modal-shell";
import { daysUntil, thaiDate } from "@/app/recruitment/_lib/form";
import {
  EXIT_REASONS,
  EXIT_REASON_NOTE_MAX,
  OTHER_EXIT_REASON,
  STATUS_LABEL,
  exitReasonText,
  type ApplicationStatus,
  type ApplicationSummary,
  type BlacklistHit,
  type ExitReason,
} from "@/app/recruitment/_lib/types";

/**
 * ช่องที่แก้ได้ในตารางผู้สมัคร — สถานะ · เหตุผลที่ยกเลิก · Blacklist · ผู้ติดต่อกลับ · วันนัดสัมภาษณ์
 *
 * **แก้ในช่องเลย ไม่มีปุ่ม “จัดการ” และไม่มีกล่องฟอร์มคั่น** — งานจริงของหน้านี้คือ
 * วางสายแล้วเลื่อนสถานะทีละคน สิบกว่ารายต่อเช้า การต้องเปิด–ปิดกล่องทุกครั้งคือ
 * สองคลิกส่วนเกินคูณจำนวนสายที่โทร · ท่านี้เหมือนเปลี่ยนค่าในช่องของ Google Sheets
 * คือกดที่ช่อง เลือก แล้วมันบันทึกเอง
 *
 * ทุกช่องบันทึกทันทีที่เลือก (ไม่มีปุ่มยืนยัน) และ **แสดงผลมองในแง่ดีไว้ก่อน** —
 * แถวเปลี่ยนหน้าตาทันทีแล้วค่อยรอเซิร์ฟเวอร์ตอบ ถ้าพลาดจะถูกดึงกลับพร้อมข้อความ
 * (ดู `patchCandidate()` ใน `candidates-view.tsx`)
 */

export type CellPatch = {
  status?: ApplicationStatus;
  exitReason?: ExitReason;
  exitReasonNote?: string;
  blacklist?: boolean;
  contactOwner?: string;
  interview?: Partial<ApplicationSummary["interview"]>;
  /**
   * ข้อความที่ถูกบันทึกลงไทม์ไลน์พร้อมชื่อผู้แก้ไขและเวลา — ช่องในตารางไม่ได้ส่ง
   * มาเลย มีแต่กล่องแก้ไขในรายงาน (`candidate-edit.tsx`) ที่มีที่ให้พิมพ์
   */
  note?: string;
};

export interface CellProps {
  candidate: ApplicationSummary;
  onPatch: (patch: CellPatch) => Promise<void>;
  /** ใบที่ผู้สมัครยกเลิกเองและข้อมูลถูกลบแล้ว — แก้อะไรไม่ได้อีก */
  locked: boolean;
}

/** สถานะที่เลือกได้จากช่องสถานะ — เรียงตามลำดับที่ใบสมัครเดินจริง */
const SELECTABLE: ApplicationStatus[] = [
  "pending_contact",
  "interview_scheduled",
  "interview_waiting",
  "interview_passed",
  "training",
  "working",
  "cancelled",
];

/* ─────────────────────────────────────────────────── โครงของช่องที่กดได้ */

function CellPopover({
  trigger,
  children,
  locked,
  saving,
  width = "w-56",
}: {
  trigger: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  locked: boolean;
  saving: boolean;
  width?: string;
}) {
  const [open, setOpen] = useState(false);

  if (locked) {
    return <span className="flex items-center px-1 opacity-60">{trigger}</span>;
  }

  return (
    <RPopover.Root open={open} onOpenChange={setOpen}>
      <RPopover.Trigger asChild>
        <button
          type="button"
          className="group flex w-full items-center gap-1.5 rounded-selector px-1.5 py-1 text-left transition-colors hover:bg-base-200"
        >
          {trigger}
          {saving ? (
            <Loader2
              size={12}
              strokeWidth={2}
              aria-hidden
              className="ml-auto flex-none animate-spin text-mut"
            />
          ) : (
            <ChevronDown
              size={12}
              strokeWidth={2}
              aria-hidden
              className="ml-auto flex-none text-mut opacity-0 transition-opacity group-hover:opacity-100"
            />
          )}
        </button>
      </RPopover.Trigger>

      <RPopover.Portal>
        <RPopover.Content
          align="start"
          sideOffset={3}
          className={`z-50 flex ${width} flex-col overflow-hidden rounded-box border border-line bg-base-100 p-1.5 shadow-[0_18px_44px_-16px_rgba(21,32,29,0.4)]`}
        >
          {children(() => setOpen(false))}
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  );
}

function Option({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-selector px-2 py-1.5 text-left text-12-5 transition-colors hover:bg-base-200"
    >
      <Check
        size={12}
        strokeWidth={2.5}
        aria-hidden
        className={on ? "flex-none text-primary" : "flex-none opacity-0"}
      />
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-1 border-t border-line px-2 pt-2 pb-1 font-mono text-10 tracking-[0.08em] text-mut uppercase">
      {children}
    </span>
  );
}

/* ─────────────────────────────────────────────────────── สถานะการสมัคร */

export function StatusCell({ candidate, onPatch, locked }: CellProps) {
  const [saving, setSaving] = useState(false);
  const [asking, setAsking] = useState(false);

  async function apply(status: ApplicationStatus, close: () => void) {
    close();

    /* เลือก “ยกเลิก” = ถามเหตุผลกับ Blacklist ต่อทันทีในกล่องเล็ก แทนที่จะบันทึก
       เงียบ ๆ แล้วปล่อยให้ไปตามเก็บทีหลัง — จังหวะที่คนรู้เรื่องชัดที่สุดคือวินาทีที่
       เพิ่งกดยกเลิก ถ้าไม่ถามตอนนี้ สองช่องนี้จะว่างค้างอยู่เป็นเดือน */
    if (status === "cancelled") {
      setAsking(true);
      return;
    }

    if (status === candidate.status) return;
    setSaving(true);
    await onPatch({ status });
    setSaving(false);
  }

  async function cancelWith(exitReason: ExitReason, exitReasonNote: string, blacklist: boolean) {
    setAsking(false);
    setSaving(true);
    await onPatch({ status: "cancelled", exitReason, exitReasonNote, blacklist });
    setSaving(false);
  }

  return (
    <>
      <CellPopover
        locked={locked}
        saving={saving}
        /* ป้ายสถานะอย่างเดียว — เหตุผลที่ยกเลิกกับ Blacklist มีคอลัมน์ของตัวเองแล้ว
           (ถอดเหตุผลที่เคยเกาะท้ายป้ายออกตามคำสั่งเจ้าของงาน 29 ก.ย. 2026) */
        trigger={<StatusPill status={candidate.status} />}
      >
        {(close) => (
          <>
            {SELECTABLE.map((s) => (
              <Option
                key={s}
                on={candidate.status === s}
                onClick={() => apply(s, close)}
              >
                {STATUS_LABEL[s]}
              </Option>
            ))}
          </>
        )}
      </CellPopover>

      {asking ? (
        <CancelPrompt
          candidate={candidate}
          onConfirm={cancelWith}
          onClose={() => setAsking(false)}
        />
      ) : null}
    </>
  );
}

/**
 * กล่องเล็กตอนกดยกเลิก — **เหตุผล + Blacklist** แล้วกดยืนยันทีเดียว
 *
 * เหตุผลเป็นตัวเลือกตายตัวเพราะค่านี้ถูกเอาไปรวมยอดตอนสิ้นเดือน — ถ้าเปิดให้พิมพ์
 * อิสระ จะได้ “ติดต่อไม่ได้” “โทรไม่ติด” “ไม่รับสาย” เป็นสามกองที่นับรวมกันไม่ได้
 * · **ไม่บังคับเลือก** บางทีต้องโทรตามอีกรอบก่อนถึงจะรู้ว่าเพราะอะไร ใบที่ยังไม่มี
 * เหตุผลจะขึ้นสีแดงคาไว้ในคอลัมน์เหตุผล ไม่หายไปเงียบ ๆ · ไม่มีข้อไหนตรงให้เลือก
 * “อื่นๆ” แล้วพิมพ์เอง (29 ก.ย. 2026) — เลือกข้อนี้แล้วต้องพิมพ์ถึงจะกดยืนยันได้
 *
 * Blacklist (29 ก.ย. 2026) ตั้งต้นเป็น “ไม่” — การติด Blacklist ต้องเป็นการตัดสินใจ
 * ที่ตั้งใจกด ไม่ใช่ค่าที่ติดมาเพราะกดผ่าน · เป็นสองปุ่มแบบเดียวกับ “ประเภทการรับ”
 * ในฟอร์มขอสรรหา ไม่ใช่ดรอปดาวน์ เพราะมีแค่สองค่าและต้องเห็นสถานะตลอด
 */
function CancelPrompt({
  candidate,
  onConfirm,
  onClose,
}: {
  candidate: ApplicationSummary;
  onConfirm: (reason: ExitReason, note: string, blacklist: boolean) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<ExitReason>(candidate.exitReason);
  const [note, setNote] = useState(candidate.exitReasonNote);
  const [blacklist, setBlacklist] = useState(candidate.blacklist);

  const other = reason === OTHER_EXIT_REASON;
  const ready = !other || note.trim().length > 0;

  return (
    <ModalShell
      title="ยกเลิกใบสมัครนี้"
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <span>{candidate.fullName}</span>
          <span className="font-mono text-11-5 tracking-wider text-primary">
            {candidate.ref}
          </span>
        </span>
      }
      onClose={onClose}
      width="440px"
      tone="plain"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-field px-3 py-2 text-12-5 text-mut transition-colors hover:text-ink"
          >
            ไม่ยกเลิกแล้ว
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason, other ? note.trim() : "", blacklist)}
            disabled={!ready}
            className="btn-danger flex items-center gap-1.5 px-4 py-2 text-12-5 font-medium disabled:opacity-45"
          >
            <CircleSlash size={14} strokeWidth={2} aria-hidden />
            ยืนยันยกเลิก
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-1.5">
        <span className="text-12-5 font-medium text-mut">
          ยกเลิกเพราะอะไร
          <span className="font-normal"> (ไม่บังคับ — ระบุทีหลังในคอลัมน์เหตุผลได้)</span>
        </span>
        {EXIT_REASONS.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => setReason((prev) => (prev === r.value ? "" : r.value))}
            aria-pressed={reason === r.value}
            className={`flex items-center gap-2.5 rounded-field border px-3.5 py-2.5 text-left text-13 transition-colors ${
              reason === r.value
                ? "border-primary/50 bg-soft font-medium text-primary"
                : "border-line hover:border-primary/45 hover:bg-base-200"
            }`}
          >
            <Check
              size={13}
              strokeWidth={2.5}
              aria-hidden
              className={reason === r.value ? "flex-none text-primary" : "flex-none opacity-0"}
            />
            {r.value === OTHER_EXIT_REASON ? "อื่นๆ (พิมพ์เอง)" : r.label}
          </button>
        ))}
        {other ? (
          <TextField
            id={`cancel-note-${candidate.id}`}
            label="ระบุเหตุผลที่ยกเลิก"
            srLabel
            value={note}
            onChange={(v) => setNote(v.slice(0, EXIT_REASON_NOTE_MAX))}
            placeholder="พิมพ์เหตุผลที่ไม่มีให้เลือกข้างบน…"
          />
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-12-5 font-medium text-mut">เพิ่มเป็น Blacklist หรือไม่</span>
        <div
          role="group"
          aria-label="เพิ่มเป็น Blacklist หรือไม่"
          className="flex w-fit gap-1 rounded-full border border-line bg-base-100 p-1"
        >
          {BLACKLIST_CHOICES.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => setBlacklist(option.value)}
              aria-pressed={blacklist === option.value}
              className={`cursor-pointer rounded-full px-3.5 py-1.5 text-12-5 transition-colors ${
                blacklist === option.value
                  ? option.value
                    ? "bg-alert font-medium text-ink-content"
                    : "bg-ink font-medium text-ink-content"
                  : "text-mut hover:text-ink"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </ModalShell>
  );
}

const BLACKLIST_CHOICES = [
  { value: false, label: "ไม่" },
  { value: true, label: "ใช่ — เพิ่มเป็น Blacklist" },
] as const;

/* ──────────────────────────────────────────────────── เหตุผลที่ยกเลิก */

/**
 * เหตุผลที่ยกเลิก — **คอลัมน์ของตัวเอง ไม่ใช่ส่วนหนึ่งของสถานะ**
 *
 * แยกออกมาเพราะสองอย่างนี้ตอบคนละคำถาม: สถานะบอกว่าใบนี้จบแล้ว ส่วนอันนี้บอกว่า
 * จบเพราะอะไร — และคำถามที่ฝ่ายบุคคลเอาไปรวมยอดตอนสิ้นเดือนคืออันหลัง
 * · กรอกทีหลังได้ ไม่บังคับตอนกดยกเลิก เพราะบางทีต้องโทรตามอีกรอบก่อนถึงจะรู้
 *
 * ช่องนี้จะโผล่ในตารางเฉพาะตอนกรองดูใบที่ยกเลิก (ดู `candidates-view.tsx`)
 */
export function ReasonCell({ candidate, onPatch, locked }: CellProps) {
  const [saving, setSaving] = useState(false);

  async function apply(value: ExitReason, note: string) {
    if (value === candidate.exitReason && note === candidate.exitReasonNote) return;
    setSaving(true);
    await onPatch({ exitReason: value, exitReasonNote: note });
    setSaving(false);
  }

  /* ใบที่ยังไม่ได้ยกเลิกไม่มีเหตุผลให้ตอบ — ขีดเฉย ๆ ไม่ให้กดได้ จะได้ไม่มีใคร
     ตั้งเหตุผลค้างไว้กับใบที่ยังเดินอยู่ในสาย แล้วรายงานสิ้นเดือนนับเกิน */
  if (candidate.status !== "cancelled") {
    return <span className="px-1.5 text-12 text-mut">—</span>;
  }

  return (
    <CellPopover
      locked={locked}
      saving={saving}
      width="w-64"
      trigger={
        candidate.exitReason ? (
          <span
            title={exitReasonText(candidate)}
            className="flex min-w-0 items-center gap-1.5 text-12-5"
          >
            <CircleSlash size={12} strokeWidth={2} aria-hidden className="flex-none text-alert" />
            <span className="truncate">{exitReasonText(candidate)}</span>
          </span>
        ) : (
          <span className="text-12 text-alert">ยังไม่ระบุเหตุผล</span>
        )
      }
    >
      {(close) => <ReasonMenu candidate={candidate} close={close} onPick={apply} />}
    </CellPopover>
  );
}

/**
 * เมนูในช่องเหตุผล — แยกเป็นคอมโพเนนต์เพราะข้อ “อื่นๆ” ต้องถือ state ของช่องพิมพ์
 * (เปิดมาในโหมดพิมพ์เลยถ้าใบนี้เป็น “อื่นๆ” อยู่แล้ว จะได้แก้ข้อความเดิมได้ทันที)
 */
function ReasonMenu({
  candidate,
  close,
  onPick,
}: {
  candidate: ApplicationSummary;
  close: () => void;
  onPick: (value: ExitReason, note: string) => void;
}) {
  const [typing, setTyping] = useState(candidate.exitReason === OTHER_EXIT_REASON);
  const [note, setNote] = useState(candidate.exitReasonNote);

  if (typing) {
    const ready = note.trim().length > 0;
    return (
      <form
        className="flex flex-col gap-2 p-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          close();
          onPick(OTHER_EXIT_REASON, note.trim());
        }}
      >
        <TextField
          id={`exit-note-${candidate.id}`}
          label="ระบุเหตุผลที่ยกเลิก"
          value={note}
          onChange={(v) => setNote(v.slice(0, EXIT_REASON_NOTE_MAX))}
          placeholder="พิมพ์เหตุผล…"
        />
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setTyping(false)}
            className="rounded-field px-2 py-1 text-12 text-mut transition-colors hover:text-ink"
          >
            กลับไปเลือก
          </button>
          <button
            type="submit"
            disabled={!ready}
            className="btn-pri px-3 py-1 text-12 font-medium disabled:opacity-45"
          >
            บันทึก
          </button>
        </div>
      </form>
    );
  }

  return (
    <>
      {EXIT_REASONS.map((r) => (
        <Option
          key={r.value}
          on={candidate.exitReason === r.value}
          onClick={() => {
            if (r.value === OTHER_EXIT_REASON) {
              setTyping(true);
              return;
            }
            close();
            onPick(r.value, "");
          }}
        >
          {r.value === OTHER_EXIT_REASON ? "อื่นๆ (พิมพ์เอง)…" : r.label}
        </Option>
      ))}
      {candidate.exitReason ? (
        <>
          <GroupLabel>ล้างค่า</GroupLabel>
          <Option
            on={false}
            onClick={() => {
              close();
              onPick("", "");
            }}
          >
            ล้างเหตุผล
          </Option>
        </>
      ) : null}
    </>
  );
}

/* ──────────────────────────────────────────────────────────── Blacklist */

/**
 * ขึ้น Blacklist หรือไม่ — ตั้งค่าครั้งแรกในกล่องตอนกดยกเลิก (`CancelPrompt`)
 * ช่องนี้มีไว้แก้ทีหลัง · ใบที่ยังไม่ได้ยกเลิกขีดเฉย ๆ กดไม่ได้ (กติกาเดียวกับ `ReasonCell`)
 */
export function BlacklistCell({ candidate, onPatch, locked }: CellProps) {
  const [saving, setSaving] = useState(false);

  async function apply(value: boolean, close: () => void) {
    close();
    if (value === candidate.blacklist) return;
    setSaving(true);
    await onPatch({ blacklist: value });
    setSaving(false);
  }

  if (candidate.status !== "cancelled") {
    return <span className="px-1.5 text-12 text-mut">—</span>;
  }

  return (
    <CellPopover
      locked={locked}
      saving={saving}
      width="w-44"
      trigger={
        candidate.blacklist ? (
          <span className="flex items-center gap-1.5 rounded-selector bg-alert/12 px-1.5 py-0.5 text-11-5 font-medium text-alert">
            <UserRoundX size={12} strokeWidth={2} aria-hidden className="flex-none" />
            Blacklist
          </span>
        ) : (
          <span className="text-12 text-mut">ไม่</span>
        )
      }
    >
      {(close) => (
        <>
          <Option on={!candidate.blacklist} onClick={() => apply(false, close)}>
            ไม่
          </Option>
          <Option on={candidate.blacklist} onClick={() => apply(true, close)}>
            เพิ่มเป็น Blacklist
          </Option>
        </>
      )}
    </CellPopover>
  );
}

/**
 * ผลจับ Blacklist ของใบที่รอการติดต่อ — **อ่านอย่างเดียว** ระบบคิดจากชื่อ/เบอร์เอง
 * (`findBlacklistHit()`) · บอกด้วยว่าชนเพราะอะไรและชนกับใบไหน เพราะชื่อซ้ำกันได้
 * ในคนละคน คนโทรต้องมีข้อมูลพอจะตัดสินเองว่าใช่คนเดียวกันไหม
 */
export function BlacklistHitBadge({ hit }: { hit: BlacklistHit | null }) {
  if (!hit) return <span className="px-1.5 text-12 text-mut">ไม่พบ</span>;

  const by = hit.by.map((b) => (b === "phone" ? "เบอร์โทร" : "ชื่อ")).join(" + ");
  return (
    <span
      title={`${by}ตรงกับ ${hit.fullName} (${hit.ref}) ที่ติด Blacklist`}
      className="flex min-w-0 cursor-help items-center gap-1.5 px-1"
    >
      <span className="flex flex-none items-center gap-1 rounded-selector bg-alert/12 px-1.5 py-0.5 text-11-5 font-medium text-alert">
        <UserRoundX size={12} strokeWidth={2} aria-hidden className="flex-none" />
        Blacklist
      </span>
      <span className="truncate text-11 text-mut">{by}ตรง</span>
    </span>
  );
}

/* ───────────────────────────────────────────────────────── ผู้ติดต่อกลับ */

export function OwnerCell({
  candidate,
  onPatch,
  locked,
  options,
}: CellProps & {
  /** รายชื่อเจ้าหน้าที่จากคลังคำถาม (ข้อ “ติดต่อเจ้าหน้าที่ท่านใด”) */
  options: string[];
}) {
  const [saving, setSaving] = useState(false);

  /* ชื่อที่ถืออยู่ตอนนี้ต้องอยู่ในรายการด้วยเสมอ แม้จะถูกถอดออกจากคลังคำถามไปแล้ว
     ไม่งั้นใบเก่าจะแสดงชื่อที่เลือกกลับเข้าไปใหม่ไม่ได้หลังเผลอเปลี่ยน */
  const list = Array.from(
    new Set([...options, candidate.contactOwner].filter(Boolean)),
  );

  async function apply(name: string, close: () => void) {
    close();
    if (name === candidate.contactOwner) return;
    setSaving(true);
    await onPatch({ contactOwner: name });
    setSaving(false);
  }

  return (
    <CellPopover
      locked={locked}
      saving={saving}
      trigger={
        candidate.contactOwner ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <UserRound size={12} strokeWidth={2} aria-hidden className="flex-none text-mut" />
            <span className="truncate">{candidate.contactOwner}</span>
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-12 text-mut">
            <UserRoundX size={12} strokeWidth={2} aria-hidden />
            ยังไม่มีผู้รับผิดชอบ
          </span>
        )
      }
    >
      {(close) => (
        <>
          {list.map((name) => (
            <Option
              key={name}
              on={candidate.contactOwner === name}
              onClick={() => apply(name, close)}
            >
              {name}
            </Option>
          ))}

          {candidate.contactOwner ? (
            <>
              <GroupLabel>อื่น ๆ</GroupLabel>
              <Option on={false} onClick={() => apply("", close)}>
                ล้างผู้รับผิดชอบ
              </Option>
            </>
          ) : null}
        </>
      )}
    </CellPopover>
  );
}

/* ──────────────────────────────────────────────────────── นัดสัมภาษณ์ */

export function InterviewCell({ candidate, onPatch, locked }: CellProps) {
  const [saving, setSaving] = useState(false);
  const { interview } = candidate;
  const left = daysUntil(interview.date);
  const overdue =
    left !== null && left < 0 && candidate.status === "interview_scheduled";

  return (
    <CellPopover
      locked={locked}
      saving={saving}
      width="w-[23.5rem]"
      trigger={
        interview.date ? (
          <span
            className={`flex min-w-0 items-center gap-1.5 text-12-5 whitespace-nowrap tabular-nums ${
              overdue ? "text-alert" : ""
            }`}
          >
            <CalendarClock size={12} strokeWidth={2} aria-hidden className="flex-none" />
            {thaiDate(interview.date)}
            {interview.time ? ` ${interview.time}` : ""}
            {overdue ? " · เลยนัด" : left === 0 ? " · วันนี้" : ""}
          </span>
        ) : (
          <span className="text-12 text-mut">ยังไม่ได้นัด</span>
        )
      }
    >
      {(close) => (
        <InterviewForm
          interview={interview}
          onSubmit={async (next) => {
            close();
            setSaving(true);
            await onPatch({ interview: next });
            setSaving(false);
          }}
        />
      )}
    </CellPopover>
  );
}

/**
 * ฟอร์มนัดสัมภาษณ์ — ปฏิทินกับรายการเวลาแบบ 24 ชั่วโมง วางคู่กันในกล่องเดียว
 *
 * เลือกด้วยการกดทั้งคู่ ไม่มีช่องให้พิมพ์ — คนนัดสัมภาษณ์คิดเป็น “อังคารหน้า
 * บ่ายสอง” ไม่ได้คิดเป็น `2026-09-22T14:00` การให้พิมพ์คือการบังคับให้แปลง
 * ความคิดเป็นรูปแบบวันที่เอง ซึ่งเป็นที่มาของวันนัดที่พิมพ์ผิดปีไปทั้งใบ
 *
 * ปฏิทินเป็น **DayPicker ตัวเดียวกับ `DateField`** แต่ฝังลงในกล่องตรง ๆ ไม่ได้
 * กางเป็น popover ซ้อนอีกชั้น — popover ซ้อน popover ปิดยากและกินคีย์ Esc ของกัน
 *
 * ไม่มีช่อง “แผนสัมภาษณ์” ให้กรอก · ฟิลด์ `plan` ยังอยู่ในข้อมูลและขึ้นในรายงาน
 * ถ้าใบเก่ามีค่าไว้ แต่จะถูกล้างพร้อมกันเมื่อกดยกเลิกนัด
 */

/** 00:00–23:30 ทุกครึ่งชั่วโมง — แบบ 24 ชั่วโมงล้วน ไม่มี AM/PM */
const TIME_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const minutes = i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
    minutes % 60,
  ).padStart(2, "0")}`;
});

function InterviewForm({
  interview,
  onSubmit,
}: {
  interview: ApplicationSummary["interview"];
  onSubmit: (next: Partial<ApplicationSummary["interview"]>) => void;
}) {
  const [date, setDate] = useState(interview.date);
  const [time, setTime] = useState(interview.time);

  const selected = isoToDate(date);

  return (
    <div className="flex flex-col gap-2 p-1">
      <div className="flex gap-2">
        <DayPicker
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(picked) => picked && setDate(dateToIso(picked))}
          showOutsideDays
          classNames={dayPickerClassNames}
          formatters={{
            formatCaption: (month) =>
              `${THAI_MONTHS_FULL[month.getMonth()]} ${month.getFullYear() + 543}`,
            formatWeekdayName: (day) => THAI_WEEKDAYS[day.getDay()],
          }}
          labels={{
            labelDayButton: (day) =>
              `${day.getDate()} ${THAI_MONTHS_FULL[day.getMonth()]} ${day.getFullYear() + 543}`,
            labelPrevious: () => "เดือนก่อนหน้า",
            labelNext: () => "เดือนถัดไป",
          }}
          components={{
            Chevron: ({ orientation }) =>
              orientation === "left" ? (
                <ChevronLeft size={15} strokeWidth={1.9} aria-hidden />
              ) : (
                <ChevronRight size={15} strokeWidth={1.9} aria-hidden />
              ),
          }}
        />

        {/* รายการเวลา — เลื่อนมาหยุดที่เวลาที่เลือกไว้แล้วเองตอนเปิด */}
        <div className="flex w-[4.5rem] flex-none flex-col border-l border-line pl-2">
          <span className="pb-1 text-center text-11 text-mut">เวลา</span>
          <div className="flex max-h-[232px] flex-col gap-0.5 overflow-y-auto pr-0.5">
            <TimeSlot on={time === ""} onClick={() => setTime("")} label="ไม่ระบุ" />
            {TIME_SLOTS.map((slot) => (
              <TimeSlot
                key={slot}
                on={time === slot}
                onClick={() => setTime(slot)}
                label={slot}
                autoScroll
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-line pt-2">
        <button
          type="button"
          disabled={!date}
          onClick={() => onSubmit({ date, time })}
          className="btn-pri flex-1 px-3 py-1.5 text-12-5 font-medium disabled:opacity-45"
        >
          บันทึกนัด
        </button>
        {interview.date ? (
          <button
            type="button"
            onClick={() => onSubmit({ date: "", time: "", plan: "" })}
            className="btn-sec px-3 py-1.5 text-12-5 text-mut transition-colors hover:border-alert/50 hover:text-alert"
          >
            ยกเลิกนัด
          </button>
        ) : null}
      </div>
    </div>
  );
}

function TimeSlot({
  on,
  onClick,
  label,
  autoScroll = false,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  /** เวลาที่เลือกไว้อยู่แล้วดึงตัวเองเข้ามาในสายตาตอนกล่องเพิ่งเปิด */
  autoScroll?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      ref={
        autoScroll && on
          ? (el) => el?.scrollIntoView({ block: "center" })
          : undefined
      }
      className={`flex-none rounded-selector py-1 text-center font-mono text-12 tabular-nums transition-colors ${
        on
          ? "bg-primary font-semibold text-primary-content"
          : "text-mut hover:bg-base-200 hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

