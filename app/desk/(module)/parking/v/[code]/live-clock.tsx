"use client";

import { useSyncExternalStore } from "react";

/**
 * นาฬิกาเดินทุกวินาทีบนหน้าตรวจบัตร — กันคนแคปหน้าจอผลตรวจเก่ามาโชว์ รปภ. (ภาพนิ่ง = เวลาไม่เดิน)
 * ก่อน hydrate แสดงเวลาที่เซิร์ฟเวอร์ตรวจ (`initial`) จึงไม่มี hydration mismatch
 */
export function LiveClock({ initial }: { initial: string }) {
  const now = useSyncExternalStore(subscribe, () => Math.floor(Date.now() / 1000), () => null);
  const t = now === null ? new Date(initial) : new Date(now * 1000);
  return (
    <time dateTime={t.toISOString()} className="tabular-nums">
      {t.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Bangkok" })}
    </time>
  );
}

function subscribe(onChange: () => void) {
  const id = window.setInterval(onChange, 1000);
  return () => window.clearInterval(id);
}
