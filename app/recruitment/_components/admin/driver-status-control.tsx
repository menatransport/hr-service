"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Popover as RPopover } from "radix-ui";
import { Check, ChevronDown, Settings2, UserMinus, UserRound } from "lucide-react";
import Link from "next/link";

import { DateField, SelectField, TextareaField, useOverlayCount } from "@/components/ui/field";
import { ModalShell } from "@/components/ui/modal-shell";
import { requestJson } from "@/lib/http";
import { escapeHtml, runAction } from "@/lib/swal";
import { formatThaiDate, type DriverRecord } from "@/app/recruitment/_lib/drivers/types";
import {
  reasonGroups,
  reasonOptionLabel,
  exitTypeLabel,
  type ExitType,
  type ResignMaster,
} from "@/app/recruitment/_lib/resign-reasons/types";
import { ExitTypePicker } from "@/app/recruitment/_components/admin/exit-type-picker";

/**
 * ปุ่มปรับสถานะการจ้างของ พจส. — ใช้ทั้งในตารางและบนหน้ารายบุคคล
 *
 * กดแล้วได้เมนูสองทาง · เลือก “พ้นสภาพ” จะเปิดฟอร์มที่ **บังคับ** วันที่กับเหตุผล
 * ก่อนบันทึก เพราะระเบียนที่พ้นสภาพโดยไม่มีสองอย่างนี้เอาไปใช้ต่อไม่ได้เลย
 * (ทั้งงานเงินเดือน งานประกันสังคม และการตอบคำถามย้อนหลัง)
 *
 * **บันทึกลง `hr_service.master_driver` ฟิลด์ของเราเอง ไม่แตะ `active` ของ ETL**
 * — ดูเหตุผลเต็มที่ `setDriverStatus()` ใน `lib/drivers/registry.ts`
 *
 * บันทึกเสร็จเรียก `router.refresh()` ให้ server component อ่านค่าจริงกลับมา
 * **ไม่เดาสถานะเองในหน้าจอ** ถ้าบันทึกไม่ติดผู้ใช้ต้องเห็นว่าไม่เปลี่ยน
 *
 * อยู่ในแถวตารางที่ทั้งแถวกดแล้วเปิดประวัติ จึง `stopPropagation()` ทุก event
 */
export function DriverStatusControl({
  driver,
  variant = "cell",
}: {
  driver: DriverRecord;
  /** `cell` = ข้อความเล็กในตาราง · `panel` = ปุ่มเต็มใบบนหน้ารายบุคคล */
  variant?: "cell" | "panel";
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  useOverlayCount(menuOpen);

  /** ไม่มีข้อมูลการทำงาน — ไม่ใช่ทั้งปฏิบัติงานและพ้นสภาพ จนกว่าฝ่ายบุคคลจะยืนยัน */
  const noWork = driver.noWorkRecord;
  const resigned = !driver.active && !noWork;
  const label = noWork ? "ไม่มีข้อมูลงาน" : resigned ? "พ้นสภาพ" : "ปฏิบัติงาน";

  /** ยืนยันว่ายังทำงานอยู่ — เก็บ `statusOverride: "active"` ไว้ ไม่งั้นจะกลับมาอยู่แท็บนี้อีก */
  async function confirmWorking() {
    const out = await runAction({
      confirm: {
        title: `ยืนยันว่า ${driver.name || driver.drivercode} ยังปฏิบัติงานอยู่?`,
        text: "ระบบไม่พบข้อมูลการทำงานของคนนี้เลย ยืนยันแล้วจะย้ายกลับไปแท็บพนักงานปัจจุบัน",
        confirmText: "ยืนยันว่ายังทำงาน",
      },
      pending: "กำลังบันทึก…",
      success: "ยืนยันว่ายังปฏิบัติงานแล้ว",
      failureTitle: "เปลี่ยนสถานะไม่สำเร็จ",
      run: () =>
        requestJson(
          `/api/drivers/${encodeURIComponent(driver.drivercode)}/status`,
          { method: "PUT", body: { status: "active", confirm: true } },
          "เปลี่ยนสถานะไม่สำเร็จ",
        ),
    });

    if (out.status === "done") router.refresh();
  }

  /** กดกลับเป็นปฏิบัติงาน = ยกเลิกการบันทึกที่ผิด จึงถามให้ชัดว่าข้อมูลจะหาย */
  async function revertToActive() {
    const out = await runAction({
      confirm: {
        title: `เปลี่ยน ${driver.name || driver.drivercode} กลับเป็นปฏิบัติงาน?`,
        text: "วันที่พ้นสภาพ เหตุผล และหมายเหตุที่บันทึกไว้จะถูกลบทิ้ง ใช้เมื่อกดพ้นสภาพผิดคนหรือผิดรายการ",
        confirmText: "กลับเป็นปฏิบัติงาน",
        tone: "warn",
      },
      pending: "กำลังบันทึก…",
      success: "เปลี่ยนเป็นปฏิบัติงานแล้ว",
      failureTitle: "เปลี่ยนสถานะไม่สำเร็จ",
      run: () =>
        requestJson(
          `/api/drivers/${encodeURIComponent(driver.drivercode)}/status`,
          { method: "PUT", body: { status: "active" } },
          "เปลี่ยนสถานะไม่สำเร็จ",
        ),
    });

    // อ่านค่าจริงกลับมาจากเซิร์ฟเวอร์ ไม่เดาสถานะเองในหน้าจอ
    if (out.status === "done") router.refresh();
  }

  const trigger =
    variant === "cell" ? (
      <button
        type="button"
        title="เปลี่ยนสถานะการจ้าง"
        /* คนที่พ้นสภาพแล้วเป็นแดงตามโทนของทั้งแถว — ส่วนคนที่ยังทำงานอยู่คงเป็นข้อความจาง */
        className={`flex cursor-pointer items-center gap-0.5 rounded-selector px-1 py-0.5 text-11-5 transition-colors ${
          resigned
            ? "font-medium text-alert hover:bg-alert/10"
            : noWork
              ? "font-medium text-sla hover:bg-sla/10"
              : "text-mut hover:bg-base-300/60 hover:text-ink"
        }`}
      >
        <span className="truncate">{label}</span>
        <ChevronDown size={11} strokeWidth={2.2} aria-hidden className="flex-none opacity-60" />
      </button>
    ) : (
      <button
        type="button"
        className="btn-sec flex cursor-pointer items-center gap-2 px-3 py-2 text-13 transition-colors hover:border-primary/40 hover:text-primary"
      >
        {resigned ? (
          <UserMinus size={15} strokeWidth={1.8} aria-hidden />
        ) : (
          <UserRound size={15} strokeWidth={1.8} aria-hidden />
        )}
        {label}
        <ChevronDown size={14} strokeWidth={2} aria-hidden className="text-mut" />
      </button>
    );

  return (
    <>
      <span onClick={(e) => e.stopPropagation()} className="inline-flex">
        <RPopover.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <RPopover.Trigger asChild>{trigger}</RPopover.Trigger>

          <RPopover.Portal>
            <RPopover.Content
              data-hrs-dropdown=""
              align="start"
              sideOffset={6}
              collisionPadding={12}
              className="z-60 flex w-56 flex-col gap-0.5 rounded-box border border-line bg-base-100 p-1.5 text-ink shadow-[0_18px_44px_-18px_rgba(21,32,29,0.38)] max-sm:w-full max-sm:rounded-b-none max-sm:rounded-t-[18px]"
            >
              <MenuItem
                icon={UserRound}
                active={!resigned && !noWork}
                onClick={() => {
                  setMenuOpen(false);
                  if (noWork) void confirmWorking();
                  else if (resigned) void revertToActive();
                }}
              >
                {noWork ? "ยืนยันว่ายังปฏิบัติงาน" : "ปฏิบัติงาน"}
              </MenuItem>

              <MenuItem
                icon={UserMinus}
                active={resigned}
                onClick={() => {
                  setMenuOpen(false);
                  setFormOpen(true);
                }}
              >
                {resigned ? "แก้ไขข้อมูลพ้นสภาพ…" : "พ้นสภาพ…"}
              </MenuItem>
            </RPopover.Content>
          </RPopover.Portal>
        </RPopover.Root>
      </span>

      {formOpen ? (
        <ResignForm driver={driver} onClose={() => setFormOpen(false)} />
      ) : null}
    </>
  );
}

/* ----------------------------------------------------------- ฟอร์ม */

/** วันนี้ตามเวลาไทย — ค่าตั้งต้นของช่องวันที่ (ฝั่ง client เท่านั้น ไม่กระทบ hydration) */
function todayInBangkok(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * อ่าน Reason Code Master ตอนเปิดฟอร์ม — **ไม่ส่งลงมาเป็น props** เพราะปุ่มนี้อยู่ใน
 * ทุกแถวของตาราง ถ้าส่งมาจากหน้าจะต้องลากรายการ 62 รหัสผ่านทุกชั้นของตาราง
 * ทั้งที่คนเปิดฟอร์มนี้วันละไม่กี่ครั้ง
 */
function useResignMaster() {
  const [master, setMaster] = useState<ResignMaster | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    requestJson<ResignMaster>("/api/recruitment/resign-reasons", {}, "โหลดรหัสเหตุผลไม่สำเร็จ")
      .then((m) => alive && setMaster(m))
      .catch((err: unknown) =>
        alive && setError(err instanceof Error ? err.message : "โหลดรหัสเหตุผลไม่สำเร็จ"),
      );
    return () => {
      alive = false;
    };
  }, []);

  return { master, error };
}

function ResignForm({ driver, onClose }: { driver: DriverRecord; onClose: () => void }) {
  const router = useRouter();
  const fieldId = useId();
  const { master, error: loadError } = useResignMaster();

  const existing = driver.resignation;
  const [date, setDate] = useState(existing?.dateISO || todayInBangkok());
  const [reason, setReason] = useState(existing?.reasonCode ?? "");
  const [exitType, setExitType] = useState<ExitType | "">(existing?.exitType ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const groups = useMemo(
    () => (master ? reasonGroups(master, existing?.reasonCode) : []),
    [master, existing?.reasonCode],
  );
  const picked = master?.reasons.find((r) => r.code === reason) ?? null;

  /* เลือกรหัสแล้วประเภทการออกตามค่าตั้งต้นของรหัสนั้นทันที — เปลี่ยนเองทีหลังได้
     (เช่น N1 “ติดต่อไม่ได้” แต่รู้ภายหลังว่าไปทำงานที่อื่น) */
  function chooseReason(code: string) {
    setReason(code);
    const next = master?.reasons.find((r) => r.code === code);
    if (next) setExitType(next.exitType);
  }

  /** บริษัทให้ออก = ต้องมีหมายเหตุ — ป้ายอย่างเดียวไม่พอให้คนอ่านทีหลังรู้ว่าเกิดอะไรขึ้น */
  const noteRequired = exitType === "inv";

  function validate(): string | null {
    if (!date) return "เลือกวันที่พ้นสภาพก่อน";
    if (date > todayInBangkok()) return "วันที่พ้นสภาพเป็นวันในอนาคตไม่ได้";
    if (!reason) return "เลือกรหัสเหตุผลการพ้นสภาพก่อน";
    if (!exitType) return "เลือกประเภทการออกก่อน";
    if (noteRequired && !note.trim())
      return "กรณีบริษัทให้ออกต้องเขียนหมายเหตุประกอบ เพื่อให้คนอ่านทีหลังเข้าใจว่าเกิดอะไรขึ้น";
    return null;
  }

  async function save() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);

    const out = await runAction({
      confirm: {
        title: `บันทึกการพ้นสภาพของ ${driver.name || driver.drivercode}?`,
        html: `<ul class="hrs-swal-list"><li>วันที่พ้นสภาพ · ${formatThaiDate(date, "full")}</li><li>เหตุผล · ${escapeHtml(picked ? reasonOptionLabel(picked) : reason)}</li><li>ประเภทการออก · ${escapeHtml(exitTypeLabel(exitType))}</li></ul>`,
        confirmText: "บันทึก",
        tone: "warn",
      },
      pending: "กำลังบันทึก…",
      success: "บันทึกการพ้นสภาพแล้ว",
      failureTitle: "บันทึกไม่สำเร็จ",
      run: async () => {
        setBusy(true);
        try {
          return await requestJson(
            `/api/drivers/${encodeURIComponent(driver.drivercode)}/status`,
            {
              method: "PUT",
              body: { status: "resigned", resignDate: date, reasonCode: reason, exitType, note },
            },
            "บันทึกไม่สำเร็จ",
          );
        } finally {
          setBusy(false);
        }
      },
    });

    if (out.status === "failed") {
      setError(out.error.message);
      return;
    }
    if (out.status === "cancelled") return;

    onClose();
    router.refresh();
  }

  return (
    <ModalShell
      title={existing ? "แก้ไขข้อมูลการพ้นสภาพ" : "บันทึกการพ้นสภาพ"}
      subtitle={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-medium text-ink">{driver.name || "—"}</span>
          <span className="font-mono text-12 text-mut">{driver.drivercode}</span>
        </span>
      }
      onClose={() => {
        if (!busy) onClose();
      }}
      width="520px"
      tone="plain"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="btn-sec cursor-pointer px-4 py-2 text-13 transition-colors hover:border-ink/30 disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="btn-pri cursor-pointer px-4 py-2 text-13 font-medium disabled:opacity-50"
          >
            {existing ? "บันทึกการแก้ไข" : "บันทึกการพ้นสภาพ"}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <DateField
          id={`${fieldId}-date`}
          label="วันที่พ้นสภาพ"
          hint="วันสุดท้ายที่ถือว่ายังเป็นพนักงาน — ไม่ใช่วันที่กดบันทึก"
          value={date}
          onChange={setDate}
        />

        <SelectField
          id={`${fieldId}-reason`}
          label="รหัสเหตุผลการพ้นสภาพ"
          hint={
            picked?.description ||
            "เลือกข้อที่ตรงที่สุดข้อเดียว — พิมพ์รหัส (เช่น P4) หรือคำค้นในช่องค้นหาได้"
          }
          placeholder={master ? "เลือกรหัสเหตุผล…" : loadError ? "โหลดรหัสไม่สำเร็จ" : "กำลังโหลดรหัส…"}
          value={reason}
          onChange={chooseReason}
          groups={groups}
          searchable
          searchPlaceholder="ค้นรหัสหรือเหตุผล…"
          readOnly={!master}
          labelRight={
            <Link
              href="/recruitment/admin/settings/resign-reasons"
              target="_blank"
              className="flex items-center gap-1 text-11-5 text-mut transition-colors hover:text-primary"
            >
              <Settings2 size={12} strokeWidth={1.9} aria-hidden />
              จัดการรหัส
            </Link>
          }
        />

        {loadError ? (
          <p role="alert" className="-mt-2 text-11-5 text-alert">
            {loadError}
          </p>
        ) : null}

        <ExitTypePicker value={exitType} onChange={setExitType} />

        <TextareaField
          id={`${fieldId}-note`}
          label="หมายเหตุ"
          optional={!noteRequired}
          hint={
            noteRequired
              ? "กรณีบริษัทให้ออกต้องมีหมายเหตุประกอบ"
              : "บริบทเพิ่มเติมที่คนอ่านทีหลังควรรู้ (ถ้ามี)"
          }
          value={note}
          onChange={setNote}
          rows={3}
          placeholder="เช่น แจ้งล่วงหน้า 30 วัน · ส่งคืนอุปกรณ์ครบแล้ว"
        />

        {error ? (
          <p
            role="alert"
            className="rounded-field border border-alert/30 bg-alert/6 px-3 py-2 text-12-5 text-alert text-pretty"
          >
            {error}
          </p>
        ) : null}

        <p className="rounded-field bg-base-200 px-3 py-2 text-11-5 text-mut text-pretty">
          บันทึกลงทะเบียนของ hr-service เท่านั้น ไม่ได้เขียนกลับไปที่ระบบต้นทาง ·
          เมื่อบันทึกแล้วแถวนี้จะย้ายไปแท็บ “พ้นสภาพแล้ว” และหน้าประวัติจะซ่อน
          ข้อมูลส่วนบุคคลที่ไม่จำเป็นต้องใช้ต่อ
        </p>
      </div>
    </ModalShell>
  );
}

function MenuItem({
  icon: Icon,
  active,
  onClick,
  children,
}: {
  icon: typeof UserRound;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex w-full cursor-pointer items-center gap-2.5 rounded-field px-2 py-1.5 text-left text-12-5 transition-colors ${
        active ? "bg-soft font-medium text-primary" : "hover:bg-base-200"
      }`}
    >
      <Icon
        size={14}
        strokeWidth={1.9}
        aria-hidden
        className={`flex-none ${active ? "text-primary" : "text-mut"}`}
      />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {active ? <Check size={12} strokeWidth={2.6} aria-hidden className="flex-none" /> : null}
    </button>
  );
}
