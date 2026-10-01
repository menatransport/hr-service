"use client";

import { useEffect } from "react";

/**
 * บังคับให้หน้ารับสมัครฝั่งคนนอกเป็น **ธีมสว่างอย่างเดียว**
 *
 * ธีมของทั้งระบบอยู่ที่ `data-theme` บน `<html>` ซึ่งจำค่าไว้ใน localStorage —
 * การถอดปุ่มสลับธีมออกจากหน้าอย่างเดียวจึง **ไม่พอ** เพราะคนที่เคยตั้งโหมดมืด
 * ไว้ตอนอยู่ `/desk` จะยังเห็นหน้าสมัครงานเป็นสีมืดอยู่ดี
 *
 * ตัวนี้แก้เฉพาะกรณี **ย้ายหน้าแบบ client-side** (เช่นกดลิงก์ “ดูหน้าสมัครงาน”
 * จากแถบบนของหลังบ้าน) ซึ่งสคริปต์ใน `app/layout.tsx` ไม่ได้ทำงานซ้ำ ·
 * ส่วนการเปิดหน้าตรง ๆ ถูกจัดการด้วยสคริปต์นั้นตั้งแต่ก่อน paint แรกแล้ว
 * จึงไม่มีจังหวะกระพริบเป็นสีมืด
 *
 * คืนค่าเดิมตอนออกจากหน้า — คนที่กดกลับไปหลังบ้านต้องได้โหมดมืดของตัวเองคืน
 */
export function LightTheme() {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.theme;
    root.dataset.theme = "hrs";

    return () => {
      if (previous) root.dataset.theme = previous;
    };
  }, []);

  return null;
}
