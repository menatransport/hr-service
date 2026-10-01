"use client";

import { Check, ScanText } from "lucide-react";

import type { ScanStep } from "@/app/recruitment/_lib/id-card-ocr";

/**
 * เอฟเฟกต์สแกนทับรูปเอกสารระหว่างที่ `readThaiDocument` ทำงาน
 *
 * ใช้สองที่: กล่องตรวจผลสแกนในแฟ้มคนขับ (ขนาดเต็ม มีมุมกรอบกับป้ายขั้นตอน) และ
 * รูปย่อบัตรประชาชนในฟอร์มสมัคร (`compact` — เหลือแค่เลเซอร์กับตาราง)
 *
 * **ป้ายบอกขั้นตอนตามจริง** จาก `onStep` ของตัวอ่าน ไม่ใช่ข้อความหมุนวนตามเวลา —
 * รูปที่ต้องหมุนหรืออ่านภาษาไทยซ้ำใช้เวลานานกว่า คนดูจะเห็นว่ามันยังทำอะไรอยู่
 *
 * วางใน **กล่องที่ครอบรูปพอดี** (`relative overflow-hidden`) เพราะเลเซอร์ต้องกวาด
 * เฉพาะตัวบัตร ไม่ใช่พื้นดำรอบ ๆ · `pointer-events-none` ทั้งก้อน คลิกทะลุไปถึงรูปได้
 *
 * เลเซอร์ใส่ `motion-keep` — เป็น feedback ว่ายังทำงานอยู่ คนที่ปิดแอนิเมชันไว้
 * ยังเห็นมันขยับช้า ๆ ไม่ใช่ค้างนิ่ง (กติกาเดียวกับ spinner หน้า login ใน `globals.css`)
 */

export const SCAN_STEP_LABEL: Record<ScanStep, string> = {
  load: "กำลังเตรียมตัวอ่าน…",
  text: "กำลังอ่านข้อความบนเอกสาร…",
  expiry: "กำลังอ่านวันหมดอายุ…",
  thai: "กำลังอ่านภาษาไทย…",
  rotate: "ลองหมุนรูปแล้วอ่านใหม่…",
};

const GLOW = "#5eead4";

export function ScanOverlay({
  phase,
  step,
  found = true,
  compact = false,
  onDone,
}: {
  /** `scanning` ระหว่างอ่าน · `done` วาบจบหนึ่งครั้งแล้วจาง (เรียก `onDone` ตอนจางสุด) */
  phase: "scanning" | "done";
  step?: ScanStep | null;
  /** ตอนจบ: อ่านเจอวันที่หรือไม่ — เปลี่ยนสีวงกับข้อความ */
  found?: boolean;
  compact?: boolean;
  onDone?: () => void;
}) {
  if (phase === "done") {
    return (
      <div
        aria-hidden
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget) onDone?.();
        }}
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 animate-scan-done"
        style={{ background: found ? "rgba(20,184,166,0.22)" : "rgba(217,119,6,0.2)" }}
      >
        <span
          className={`flex items-center justify-center rounded-full text-white shadow-[0_0_0_6px_rgba(255,255,255,0.18),0_12px_30px_-8px_rgba(0,0,0,0.6)] animate-scan-ring ${
            compact ? "size-7" : "size-14"
          } ${found ? "bg-[#14b8a6]" : "bg-[#d97706]"}`}
        >
          {found ? (
            <Check size={compact ? 15 : 28} strokeWidth={3} />
          ) : (
            <ScanText size={compact ? 14 : 24} strokeWidth={2.2} />
          )}
        </span>
        {compact ? null : (
          <span className="rounded-full bg-black/55 px-3 py-1 text-12 font-medium text-white backdrop-blur">
            {found ? "อ่านเสร็จแล้ว" : "อ่านวันหมดอายุไม่ออก — กรอกเองได้"}
          </span>
        )}
      </div>
    );
  }

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* ฟิล์มเข้มบาง ๆ ให้เลเซอร์เด่นขึ้นบนบัตรสีอ่อน */}
      <div className="absolute inset-0 bg-[#041714]/30" />

      {/* ตารางเส้นบาง — จางตรงขอบด้วย mask ให้ดูเป็นลำแสงสแกนมากกว่ากระดาษกราฟ */}
      <div
        className="absolute inset-0 animate-scan-grid"
        style={{
          backgroundImage: `linear-gradient(${GLOW}33 1px, transparent 1px), linear-gradient(90deg, ${GLOW}33 1px, transparent 1px)`,
          backgroundSize: compact ? "8px 8px" : "22px 22px",
          maskImage: "radial-gradient(ellipse 75% 70% at 50% 50%, #000 40%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 75% 70% at 50% 50%, #000 40%, transparent 100%)",
        }}
      />

      {/* เลเซอร์ + หางแสงที่ลากตามมาข้างบน */}
      <div className="motion-keep absolute inset-x-0 top-0 h-full animate-scan-laser">
        <div
          className="absolute inset-x-0 bottom-0 h-[42%]"
          style={{ background: `linear-gradient(to bottom, transparent, ${GLOW}40)` }}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-[2px]"
          style={{
            background: `linear-gradient(90deg, transparent, ${GLOW} 12%, #ffffff 50%, ${GLOW} 88%, transparent)`,
            boxShadow: `0 0 10px 2px ${GLOW}cc, 0 0 36px 8px ${GLOW}55`,
          }}
        />
      </div>

      {compact ? null : (
        <>
          {/* มุมกรอบสี่มุม — “เล็งเป้า” ที่ตัวบัตร หดเข้าออกเบา ๆ */}
          <div className="absolute inset-3 animate-scan-corner">
            {(["top-0 left-0 border-t-2 border-l-2 rounded-tl-lg",
              "top-0 right-0 border-t-2 border-r-2 rounded-tr-lg",
              "bottom-0 left-0 border-b-2 border-l-2 rounded-bl-lg",
              "bottom-0 right-0 border-b-2 border-r-2 rounded-br-lg"] as const).map((pos) => (
              <span
                key={pos}
                className={`absolute size-7 ${pos}`}
                style={{ borderColor: GLOW, filter: `drop-shadow(0 0 4px ${GLOW})` }}
              />
            ))}
          </div>

          {/* ป้ายขั้นตอน — `key` ตามขั้น ให้ข้อความใหม่เฟดเข้าทุกครั้งที่เปลี่ยน */}
          <div className="absolute inset-x-0 bottom-4 flex justify-center px-4">
            <span className="flex items-center gap-2 rounded-full border border-white/15 bg-black/60 px-3.5 py-1.5 text-12 font-medium text-white shadow-lg backdrop-blur-md">
              <span className="relative flex size-2">
                <span className="motion-keep absolute inline-flex size-full animate-ping rounded-full bg-[#5eead4] opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-[#5eead4]" />
              </span>
              <span key={step ?? "load"} className="animate-fade-in">
                {SCAN_STEP_LABEL[step ?? "load"]}
              </span>
            </span>
          </div>
        </>
      )}
    </div>
  );
}
