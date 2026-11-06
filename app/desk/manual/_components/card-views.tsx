"use client";

import { useState } from "react";

import type { CardView } from "../_lib/manual";

import { ButtonList, PointList } from "./bullets";

/**
 * การ์ดสรุปของหน้าจริงย่อส่วน — กดการ์ดแล้วเห็นว่าหน้าจอเปลี่ยนเป็นอะไร (เงื่อนไข · คอลัมน์ · ปุ่มเฉพาะการ์ดนั้น)
 * ท่าเดียวกับการกดการ์ดบนหน้าติดตามพนักงานใหม่/ผู้สมัคร คนอ่านจึงจำได้ว่าการ์ดไหนพาไปไหน
 */
export function CardViews({ cards }: { cards: CardView[] }) {
  const [active, setActive] = useState(0);
  const card = cards[active];

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="การ์ดสรุป" className="grid grid-cols-[repeat(auto-fit,minmax(104px,1fr))] gap-2">
        {cards.map((c, i) => (
          <button
            key={c.label}
            type="button"
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={`cursor-pointer rounded-xl border px-3 py-2.5 text-left text-13 transition-colors ${
              i === active
                ? "border-primary/55 bg-soft font-semibold text-primary ring-1 ring-primary/30"
                : "border-line bg-base-100 text-ink hover:border-line-strong hover:bg-soft/50"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="flex flex-col gap-3 rounded-xl border border-line bg-base-100 p-4">
        <p className="text-13-5">
          <span className="text-mut">ขึ้นการ์ดนี้เมื่อ · </span>
          {card.rule}
        </p>
        <div className="flex flex-col gap-1.5">
          <p className="text-12 font-medium text-mut">คอลัมน์ในตาราง</p>
          <div className="flex flex-wrap gap-1.5">
            {card.cols.map((col) => (
              <span key={col} className="chip chip-done">
                {col}
              </span>
            ))}
          </div>
        </div>
        {card.points?.length ? <PointList points={card.points} /> : null}
        {card.buttons?.length ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-12 font-medium text-mut">ปุ่มในการ์ดนี้</p>
            <ButtonList buttons={card.buttons} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
