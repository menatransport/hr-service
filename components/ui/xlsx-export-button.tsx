"use client";

import { useState } from "react";
import { DropdownMenu } from "radix-ui";
import { ChevronDown, ClipboardPaste, Download, FolderSync, Loader2 } from "lucide-react";

import { ExcelIcon } from "@/components/desk/export-button";
import { useOverlayCount } from "@/components/ui/field";
import { downloadXlsx, type XlsxExport } from "@/lib/xlsx-table";
import { runAction } from "@/lib/swal";

/**
 * ปุ่ม “Excel” ของตารางที่ถือข้อมูลไว้ฝั่ง client — ส่งออกแถวที่เห็นอยู่ (ตามแท็บ/ตัวกรอง/ลำดับ)
 *
 * **หน้าตา (20 ต.ค. 2026 · Bew):** `btn-excel` ใน `globals.css` — มุมเกือบเหลี่ยม พื้นเขียวอ่อนที่ผสมจาก
 * `--color-excel` (ลอง lime สดแล้ว Bew ว่าเขียวเกิน — อย่ากลับไปใช้ lime)
 * · `build` ถูกเรียกตอนกดเท่านั้น จึงไม่ต้องคิดคอลัมน์ทุกครั้งที่ตาราง re-render
 */
export const EXCEL_BTN =
  "btn-excel inline-flex flex-none items-center gap-1.5 font-semibold disabled:pointer-events-none disabled:opacity-45";

type ExportProps<T> = {
  /** ชื่อไฟล์ไม่มีวันที่ เช่น `ผู้สมัคร` */
  name: string;
  /** async ได้ — ชีตเสริมที่ต้องดึงข้อมูลเต็มจากเซิร์ฟเวอร์ (ใบสมัคร · ทะเบียนเต็ม) */
  build: () => XlsxExport<T> | Promise<XlsxExport<T>>;
  /** จำนวนแถวที่จะได้ — `0` = ส่งออกไม่ได้ */
  count: number;
};

/** สร้างไฟล์ + toast · คืน `busy` ไว้ให้ปุ่มหมุน */
function useXlsxDownload<T>({ name, build }: ExportProps<T>) {
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    await runAction({
      confirm: false,
      pending: "กำลังสร้างไฟล์ Excel…",
      success: (file) => `บันทึก ${file} แล้ว`,
      failureTitle: "ส่งออก Excel ไม่สำเร็จ",
      run: async () => {
        try {
          return await downloadXlsx(name, await build());
        } finally {
          setBusy(false);
        }
      },
    });
  }
  return { busy, download };
}

const exportTitle = (count: number) =>
  count === 0 ? "ไม่มีรายการให้ส่งออก" : `ส่งออก ${count.toLocaleString("th-TH")} รายการที่เห็นอยู่เป็นไฟล์ Excel`;

export function XlsxExportButton<T>({
  className = "px-3 py-1.5 text-13",
  ...props
}: ExportProps<T> & { className?: string }) {
  const { busy, download } = useXlsxDownload(props);

  return (
    <button
      type="button"
      onClick={download}
      disabled={busy || props.count === 0}
      title={exportTitle(props.count)}
      className={`${EXCEL_BTN} ${className}`}
    >
      {busy ? (
        <Loader2 size={15} strokeWidth={2} className="animate-spin" aria-hidden />
      ) : (
        <ExcelIcon className="text-excel" />
      )}
      Excel
    </button>
  );
}

/**
 * ปุ่ม Excel ปุ่มเดียวที่มีทั้ง **ส่งออก** และ **นำเข้า** — กดแล้วเลือกในเมนู
 * (หน้าทะเบียน พจส. รวม “Excel” + “วางจาก Excel” เป็นปุ่มนี้ 20 ต.ค. 2026)
 */
export function XlsxMenuButton<T>({
  onImport,
  importLabel = "นำเข้า · วางจาก Excel",
  importHint = "วางแถวที่คัดลอกมา · ตรวจก่อนบันทึก",
  onSync,
  syncHint = "ชี้ path ไฟล์ทะเบียนบนเครื่องนี้",
  className = "py-1.5 pr-2 pl-3 text-13",
  ...props
}: ExportProps<T> & {
  onImport: () => void;
  importLabel?: string;
  importHint?: string;
  /** เมนู “Sync จากไฟล์” — ส่งมาเฉพาะโหมด dev */
  onSync?: () => void;
  syncHint?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { busy, download } = useXlsxDownload(props);
  useOverlayCount(open);

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenu.Trigger asChild>
        <button type="button" disabled={busy} className={`${EXCEL_BTN} ${className}`}>
          {busy ? (
            <Loader2 size={15} strokeWidth={2} className="animate-spin" aria-hidden />
          ) : (
            <ExcelIcon className="text-excel" />
          )}
          Excel
          <span aria-hidden className="ml-0.5 h-4 w-px bg-excel/25" />
          <ChevronDown
            size={14}
            strokeWidth={2.2}
            aria-hidden
            className={`text-excel transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-60 w-72 overflow-hidden rounded-[6px] border border-line bg-base-100 p-1 text-ink shadow-[0_18px_44px_-18px_rgba(21,32,29,0.38)] data-[state=open]:animate-pop-in"
        >
          <MenuItem
            icon={<Download size={16} strokeWidth={2} aria-hidden />}
            label="ส่งออก Excel"
            hint={props.count ? `${props.count.toLocaleString("th-TH")} รายการที่เห็นอยู่ · .xlsx` : "ไม่มีรายการให้ส่งออก"}
            disabled={props.count === 0}
            onSelect={download}
          />
          <MenuItem
            icon={<ClipboardPaste size={16} strokeWidth={2} aria-hidden />}
            label={importLabel}
            hint={importHint}
            onSelect={onImport}
          />
          {onSync ? (
            <MenuItem
              icon={<FolderSync size={16} strokeWidth={2} aria-hidden />}
              label="Sync จากไฟล์ (dev)"
              hint={syncHint}
              onSelect={onSync}
            />
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function MenuItem({
  icon,
  label,
  hint,
  disabled,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className="group flex cursor-pointer items-start gap-3 rounded-[5px] px-2.5 py-2 outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-45 data-[highlighted]:bg-excel/8"
    >
      <span className="mt-0.5 grid size-7 flex-none place-items-center rounded-[5px] bg-excel/12 text-excel">
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-13 font-semibold">{label}</span>
        <span className="text-11-5 text-mut">{hint}</span>
      </span>
    </DropdownMenu.Item>
  );
}
