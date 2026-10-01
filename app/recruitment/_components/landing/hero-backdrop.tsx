"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

/**
 * ภาพพื้นหลังของฮีโร่ — สลับทีละใบพร้อมซูมช้า ๆ (ken burns)
 *
 * **เป็นคอมโพเนนต์แยกเพื่อให้ `hero.tsx` ยังเป็น server component** — มีแค่
 * ตัวนับรอบเท่านั้นที่ต้องอยู่ฝั่ง client ส่วนหัวเรื่อง ปุ่ม และแถบล่าง
 * ยังเรนเดอร์บนเซิร์ฟเวอร์ตามเดิม
 *
 * **ทุกใบเป็นภาพรถของมีนาเอง และเห็นโลโก้ในภาพทั้งสามใบ** — เหตุผลเดียวกับ
 * ที่ `hero.tsx` อธิบายไว้ คนขับที่เคยเห็นรถวิ่งบนถนนต้องรู้ทันทีว่าสมัครกับใคร
 * ถ้าจะเพิ่มภาพใหม่ ให้ยึดกติกานี้ (ภาพรถ CPAC ใน `what-you-drive.tsx`
 * จึงไม่ถูกเอามาใส่ตรงนี้ — โลโก้บนโม่เป็นของลูกค้า ไม่ใช่ของบริษัท)
 *
 * **ใบแรกเรนเดอร์เป็นสถานะ `in` ตั้งแต่ฝั่งเซิร์ฟเวอร์** ไม่ได้รอ `useEffect`
 * ค่อยเปิด — ถ้ารอ เปิดหน้ามาจะเจอฮีโร่ดำหนึ่งอึดใจ และถ้า JS พังจะไม่เหลือ
 * ภาพพื้นหลังเลย
 */

/** อยู่บนจอนานเท่าไรก่อนสลับใบถัดไป (ต้องคู่กับ `.hero-slide` ใน `globals.css`) */
const SLIDE_MS = 7000;
/** ความยาวของช่วงจาง — ใบเก่ายังค้างอยู่จนครบเวลานี้ */
const FADE_MS = 1200;

/**
 * `position` ของแต่ละใบไม่เท่ากันโดยตั้งใจ — จุดสนใจของภาพอยู่คนละที่
 * และฮีโร่บนมือถือครอบเป็นแนวตั้ง ถ้าใช้ `center` เหมือนกันหมด บางใบจะเหลือ
 * แต่ท้องฟ้ากับพื้นถนน
 */
const SLIDES = [
  { src: "/recruitment/hero-mixer.webp", position: "62% center" },
  { src: "/recruitment/fleet-highway.webp", position: "58% center" },
  { src: "/recruitment/truck-trailer.jpg", position: "52% center" },
] as const;

export function HeroBackdrop() {
  const [{ current, previous }, setPos] = useState({ current: 0, previous: -1 });

  useEffect(() => {
    // เคารพ prefers-reduced-motion — ค้างไว้ที่ใบแรกใบเดียว การตัดภาพทันที
    // (ซึ่งเป็นผลของกฎ reduce ใน globals.css ที่ล้ม transition ทิ้ง) รบกวนกว่าไม่สลับเลย
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const id = setInterval(() => {
      setPos((pos) => ({
        current: (pos.current + 1) % SLIDES.length,
        previous: pos.current,
      }));
    }, SLIDE_MS);

    return () => clearInterval(id);
  }, []);

  return (
    <div className="absolute inset-0 -z-20">
      {SLIDES.map(({ src, position }, i) => (
        <Image
          key={src}
          src={src}
          alt=""
          fill
          // ใบแรกต้องมาทันการวาดรอบแรก ที่เหลือโหลดตามได้ แต่ต้องมาก่อนถึงคิว
          // จึงไม่ปล่อยเป็น lazy (ทุกใบอยู่ในวิวพอร์ตอยู่แล้ว lazy ไม่ได้ช่วยอะไร)
          priority={i === 0}
          sizes="100vw"
          style={{ objectPosition: position, transitionDuration: `${FADE_MS}ms` }}
          className="hero-slide object-cover"
          data-state={i === current ? "in" : i === previous ? "out" : "idle"}
        />
      ))}
    </div>
  );
}
