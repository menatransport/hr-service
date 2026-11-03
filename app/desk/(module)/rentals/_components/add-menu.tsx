"use client";

import { useState } from "react";
import { DropdownMenu } from "radix-ui";
import { BedDouble, Building2, ChevronDown, Plus } from "lucide-react";

import { useOverlayCount } from "@/components/ui/field";

/**
 * ปุ่ม “เพิ่ม” ปุ่มเดียวบนหัวหน้าห้องเช่า — แทนสองปุ่มเดิม “เพิ่มห้อง” / “เพิ่มที่พัก” ที่วางคู่กัน
 * แล้วคนกดไม่รู้ว่าต่างกันยังไง (Bew 3 พ.ย. 2569)
 *
 * เมนูบอกในตัวว่าแต่ละอันคืออะไร: ห้องเช่าใหม่ (ใช้บ่อย อยู่บน) = ห้องในที่พักที่มีแล้ว ·
 * ที่พักใหม่ = หอ/อพาร์ตเมนต์ที่ยังไม่มีในระบบ · ยังไม่มีที่พักเลย → ข้อห้องกดไม่ได้และบอกเหตุผล
 * ท่าเดียวกับเมนู Excel (`xlsx-export-button.tsx`)
 */
export function AddMenu({
  apartmentName,
  canAddRoom,
  onAddRoom,
  onAddApartment,
}: {
  /** ที่พักที่กรองอยู่ — ห้องใหม่จะถูกเลือกที่พักนี้ไว้ให้ */
  apartmentName?: string;
  canAddRoom: boolean;
  onAddRoom: () => void;
  onAddApartment: () => void;
}) {
  const [open, setOpen] = useState(false);
  useOverlayCount(open);

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenu.Trigger asChild>
        <button type="button" className="btn-pri flex items-center gap-1.5 px-3.5 py-2 text-12-5">
          <Plus size={15} aria-hidden /> เพิ่ม
          <span aria-hidden className="ml-0.5 h-4 w-px bg-current opacity-30" />
          <ChevronDown
            size={14}
            strokeWidth={2.2}
            aria-hidden
            className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-60 w-80 overflow-hidden rounded-[6px] border border-line bg-base-100 p-1 text-ink shadow-[0_18px_44px_-18px_rgba(21,32,29,0.38)] data-[state=open]:animate-pop-in"
        >
          <MenuItem
            icon={<BedDouble size={16} strokeWidth={2} aria-hidden />}
            label="ห้องเช่าใหม่"
            hint={
              !canAddRoom
                ? "ยังไม่มีที่พักในระบบ — เพิ่มที่พักใหม่ก่อน"
                : apartmentName
                  ? `เพิ่มห้องใน ${apartmentName}`
                  : "เพิ่มห้องในที่พักที่มีอยู่แล้ว"
            }
            disabled={!canAddRoom}
            onSelect={onAddRoom}
          />
          <DropdownMenu.Separator className="mx-2 my-1 h-px bg-line" />
          <MenuItem
            icon={<Building2 size={16} strokeWidth={2} aria-hidden />}
            label="ที่พักใหม่ (หอ / อพาร์ตเมนต์)"
            hint="ที่พักที่ยังไม่มีในระบบ พร้อมข้อมูลเจ้าของ"
            onSelect={onAddApartment}
          />
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
      className="group flex cursor-pointer items-start gap-3 rounded-[5px] px-2.5 py-2 outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-45 data-[highlighted]:bg-soft"
    >
      <span className="mt-0.5 grid size-7 flex-none place-items-center rounded-[5px] bg-primary/12 text-primary">
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-13 font-semibold">{label}</span>
        <span className="text-11-5 text-mut">{hint}</span>
      </span>
    </DropdownMenu.Item>
  );
}
