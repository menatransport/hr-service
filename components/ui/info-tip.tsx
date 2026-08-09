"use client";

import { useState } from "react";

import { Popover } from "radix-ui";
import { Info } from "lucide-react";

import { useOverlayCount } from "@/components/ui/field";

/**
 * ไอคอน ⓘ ที่กางคำอธิบายสั้น ๆ ข้างหัวข้อ
 *
 * ใช้ **Popover** ไม่ใช่ Tooltip ของ Radix เพราะ Tooltip เปิดด้วยการชี้เมาส์อย่างเดียว
 * จอสัมผัสจะแตะแล้วไม่มีอะไรขึ้น — ตัวนี้จึงเปิดได้ทั้งกดและชี้ (ชี้เฉพาะเครื่องที่มีเมาส์)
 *
 * `z-60` ห้ามลบด้วยเหตุผลเดียวกับ `Select.Content` — Radix ยกค่านี้ไปใส่กล่องนอก
 * ถ้าไม่มี กล่องจะไปโผล่ใต้ modal ของ /desk · และนับรวมกับ dropdown ผ่าน
 * `useOverlayCount` เพื่อให้ Esc ครั้งแรกปิดแค่กล่องนี้ ไม่ลามไปปิด modal
 */
export function InfoTip({
  label,
  children,
}: {
  /** อ่านให้ screen reader — บอกว่าเป็นคำอธิบายของอะไร */
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  useOverlayCount(open);

  const onHover = (next: boolean) => (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") setOpen(next);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={label}
        onPointerEnter={onHover(true)}
        onPointerLeave={onHover(false)}
        className="-m-2 flex size-9 flex-none items-center justify-center rounded-full text-primary/75 transition-colors hover:text-primary data-[state=open]:text-primary"
      >
        <Info size={15} strokeWidth={1.8} aria-hidden />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          // กล่องนี้เป็นแค่คำอธิบาย ไม่มีอะไรให้ทำต่อ — อย่าดึงโฟกัสออกจากฟอร์ม
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="z-60 max-w-[292px] rounded-box border border-line bg-base-100 p-3 text-[12px] leading-relaxed text-mut text-pretty shadow-[0_14px_36px_-14px_rgba(21,32,29,0.4)]"
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
