"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/**
 * ตัวบอกสถานะรอของงานลายเซ็น — ปากกาเขียนลายเซ็นแล้วขีดเส้นใต้ วนซ้ำ
 *
 * - `SignatureLoader` วางในที่ (กล่องโหลด / ช่องอัปโหลด)
 * - `SignatureLoaderOverlay` คลุมจอระหว่างส่งข้อมูล — `contained` = คลุมแค่กล่องแม่ที่เป็น `relative`
 *
 * ใช้ SMIL ทั้งเส้นและปลายปากกา ให้สองอย่างเดินด้วยนาฬิกาเดียวกัน · ผู้ใช้ที่ปิดการเคลื่อนไหว
 * (prefers-reduced-motion) เห็นลายเซ็นนิ่งเต็มเส้นแทน
 */

const SIGNATURE =
  "M8 34 C10 20 16 8 22 10 C28 12 20 30 14 38 C12 41 16 40 20 34 C24 28 28 22 30 26 C32 30 30 34 34 32 " +
  "C38 30 40 22 44 22 C48 22 44 32 48 32 C52 32 54 20 58 14 C60 11 62 12 60 18 C58 26 56 32 60 32 " +
  "C64 32 66 24 70 24 C74 24 70 32 76 31 C80 30 82 26 86 26 C90 26 88 32 92 31 C98 30 104 22 112 20";
const UNDERLINE = "M12 41 Q62 35 112 39";

/** หนึ่งรอบ: เขียน 0–60% · ขีดเส้นใต้ 60–75% · ค้าง · จางหาย 85–97% */
const DUR = "2.6s";

const REDUCED = "(prefers-reduced-motion: reduce)";
const subscribe = (onChange: () => void) => {
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};
const useReducedMotion = () =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );

export function SignatureLoader({
  label,
  size = "md",
  className = "",
}: {
  label?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const still = useReducedMotion();
  const svgSize = size === "sm" ? "h-7 w-[4.5rem]" : "h-12 w-32";

  return (
    <span
      role="status"
      aria-live="polite"
      className={`flex items-center ${size === "sm" ? "gap-2.5" : "flex-col gap-2"} ${className}`}
    >
      <svg viewBox="0 0 120 48" aria-hidden className={`${svgSize} flex-none text-primary`} fill="none">
        <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          {still ? null : (
            <animate attributeName="opacity" values="1;1;0;0" keyTimes="0;0.85;0.97;1" dur={DUR} repeatCount="indefinite" />
          )}
          <path d={SIGNATURE} pathLength={1} strokeWidth={2.6} strokeDasharray="1" strokeDashoffset={still ? 0 : 1}>
            {still ? null : (
              <animate attributeName="stroke-dashoffset" values="1;0;0" keyTimes="0;0.6;1" dur={DUR} repeatCount="indefinite" />
            )}
          </path>
          <path
            d={UNDERLINE}
            pathLength={1}
            strokeWidth={1.6}
            strokeDasharray="1"
            strokeDashoffset={still ? 0 : 1}
            className="opacity-60"
          >
            {still ? null : (
              <animate attributeName="stroke-dashoffset" values="1;1;0;0" keyTimes="0;0.6;0.75;1" dur={DUR} repeatCount="indefinite" />
            )}
          </path>
          {still ? null : (
            /* ปลายปากกา — วิ่งตามเส้นลายเซ็นพร้อมหมึก แล้วรอที่ปลายเส้น */
            <circle r={2.4} fill="currentColor" stroke="none">
              <animateMotion
                path={SIGNATURE}
                keyPoints="0;1;1"
                keyTimes="0;0.6;1"
                calcMode="linear"
                dur={DUR}
                repeatCount="indefinite"
              />
            </circle>
          )}
        </g>
      </svg>
      {label ? <span className={size === "sm" ? "text-12 text-mut" : "text-13 text-mut"}>{label}</span> : null}
    </span>
  );
}

/**
 * คลุมระหว่างรอ — กันกดซ้ำ/แก้ค่าระหว่างส่งหรือโหลด
 * · ปกติ portal ไป `document.body` (เหนือ ModalShell z-50 · ใต้ SweetAlert)
 * · `contained` = `absolute inset-0` ในกล่องแม่ ปุ่มปิดของกล่องยังกดได้
 */
export function SignatureLoaderOverlay({ label, contained = false }: { label: string; contained?: boolean }) {
  const body = (
    <div
      className={`${contained ? "absolute z-10" : "fixed z-[70]"} inset-0 flex items-center justify-center bg-base-100/70 backdrop-blur-[2px]`}
    >
      <div className="rounded-box border border-line bg-base-100 px-8 py-6 shadow-lg">
        <SignatureLoader label={label} />
      </div>
    </div>
  );
  return contained ? body : createPortal(body, document.body);
}
