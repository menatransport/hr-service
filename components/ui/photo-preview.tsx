"use client";

import { HoverCard } from "radix-ui";

import { mediaThumbUrl } from "@/lib/media";

/**
 * ชี้เมาส์ที่วงรูปเล็ก → รูปขยายลอยข้าง ๆ (รูปถ่ายหน้าตรง · Bew 8 พ.ย. 2569)
 *
 * ใช้ **HoverCard** ของ Radix — เปิดด้วยเมาส์อย่างเดียว จอสัมผัสแตะวงรูปแล้วทำงานเดิมของมัน
 * (เช่น เปลี่ยนรูปบนทะเบียน) ไม่มีกล่องเด้งมาขวาง · กล่องลอยของ Radix ไม่โดน zoom 0.8 ของหน้า
 * จึงวางตรงตำแหน่งเอง (`lib/page-zoom.ts`) · รูปขยายเป็นรูปย่อ 640 px โหลดตอนชี้ครั้งแรกเท่านั้น
 * ไม่มีรูป = คืน `children` เฉย ๆ
 */
export function PhotoPreview({
  src,
  name,
  children,
}: {
  src: string | null | undefined;
  /** ชื่อใต้รูป */
  name?: string;
  children: React.ReactNode;
}) {
  if (!src) return <>{children}</>;

  return (
    <HoverCard.Root openDelay={180} closeDelay={60}>
      <HoverCard.Trigger asChild>
        <span className="inline-flex flex-none">{children}</span>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side="right"
          align="center"
          sideOffset={10}
          collisionPadding={12}
          // `z-60` เหตุผลเดียวกับ `InfoTip` — ต้องอยู่เหนือ modal ของ /desk
          className="pointer-events-none z-60 overflow-hidden rounded-box border border-line bg-base-100 p-1.5 shadow-[0_18px_44px_-16px_rgba(21,32,29,0.45)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- ลิงก์ /api/media (private) */}
          <img
            src={mediaThumbUrl(src, 640)}
            alt={name ? `รูปของ ${name}` : ""}
            className="block h-[300px] w-[240px] rounded-field bg-base-200 object-cover"
          />
          {name ? (
            <p className="max-w-[240px] truncate px-1 pt-1.5 pb-0.5 text-center text-12 font-medium text-ink">
              {name}
            </p>
          ) : null}
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}
