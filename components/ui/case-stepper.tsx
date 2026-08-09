import { Check } from "lucide-react";

import { CaseTimeline } from "@/components/ui/case-timeline";
import type { TimelineStep } from "@/lib/types";

/**
 * ความคืบหน้าของเคส — แนวนอนเต็มความกว้างบนจอ ≥md เพื่อให้เห็นทั้งเส้นในตาเดียว
 * จอเล็กกว่านั้นตกไปใช้ `CaseTimeline` แนวตั้งซึ่งอ่านง่ายกว่าในคอลัมน์แคบ
 *
 * ทั้งสองแบบถูก render ไว้ แต่ CSS ซ่อนอันที่ไม่ใช้ด้วย `display:none`
 * จึงไม่เกิดข้อความซ้ำใน accessibility tree
 *
 * `compact` = แถบบางสำหรับใน modal (ไม่แสดง meta ใต้แต่ละขั้น)
 * `note` = ข้อความมุมขวาของหัวแถบ ใช้บอกว่าตอนนี้ต้องทำอะไร
 */
export function CaseStepper({
  steps,
  compact = false,
  note,
}: {
  steps: TimelineStep[];
  compact?: boolean;
  note?: React.ReactNode;
}) {
  const at = steps.findIndex((s) => s.state === "current");
  const idx = at === -1 ? steps.length - 1 : at;
  const current = steps[idx];

  return (
    <section
      className={`flex flex-col rounded-box border border-line bg-base-100 ${
        compact ? "gap-3 px-5 py-3.5" : "gap-4 p-5"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[12.5px] text-mut">
          {compact ? null : (
            <span className="pr-2 text-sm font-semibold text-ink">
              ความคืบหน้าของเคส
            </span>
          )}
          ขั้นที่ {idx + 1} จาก {steps.length} ·{" "}
          <span className="font-medium text-ink">{current.title}</span>
          {compact && current.meta ? (
            <span className="text-mut"> · {current.meta}</span>
          ) : null}
        </p>
        {note}
      </div>

      {/* แนวนอน — จอ ≥ md */}
      <ol
        className="hidden md:grid"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0,1fr))` }}
      >
        {steps.map((step, i) => {
          const railBefore = i > 0 && step.state !== "todo";
          const railAfter =
            i < steps.length - 1 && steps[i + 1].state !== "todo";

          return (
            <li
              key={step.title}
              className={`flex flex-col items-center ${compact ? "gap-1.5" : "gap-2.5"}`}
            >
              <div
                className={`relative flex w-full items-center justify-center ${
                  compact ? "h-6" : "h-7"
                }`}
              >
                {i > 0 ? (
                  <span
                    aria-hidden
                    className={`absolute top-1/2 left-0 h-[2px] w-1/2 -translate-y-1/2 ${
                      railBefore ? "bg-primary" : "bg-line"
                    }`}
                  />
                ) : null}
                {i < steps.length - 1 ? (
                  <span
                    aria-hidden
                    className={`absolute top-1/2 right-0 h-[2px] w-1/2 -translate-y-1/2 ${
                      railAfter ? "bg-primary" : "bg-line"
                    }`}
                  />
                ) : null}
                <Marker state={step.state} compact={compact} />
              </div>

              <div className="flex flex-col items-center gap-0.5 px-1.5 text-center">
                <span
                  className={`${compact ? "text-[12px]" : "text-[13px]"} ${
                    step.state === "current"
                      ? "font-semibold text-primary"
                      : step.state === "todo"
                        ? "text-mut"
                        : "font-medium"
                  }`}
                >
                  {step.title}
                </span>
                {!compact && step.meta ? (
                  <span className="text-[11.5px] leading-snug text-mut text-pretty">
                    {step.meta}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {/* แนวตั้ง — จอเล็ก */}
      <div className="md:hidden">
        <CaseTimeline steps={steps} />
      </div>
    </section>
  );
}

function Marker({
  state,
  compact,
}: {
  state: TimelineStep["state"];
  compact: boolean;
}) {
  const size = compact ? "size-6" : "size-7";

  if (state === "done") {
    return (
      <span
        className={`relative z-10 flex ${size} items-center justify-center rounded-full bg-primary text-primary-content ring-4 ring-base-100`}
      >
        <Check size={compact ? 12 : 14} strokeWidth={3} aria-hidden />
        <span className="sr-only">เสร็จแล้ว</span>
      </span>
    );
  }

  if (state === "current") {
    return (
      <span
        className={`relative z-10 flex ${size} items-center justify-center rounded-full border-[2.5px] border-primary bg-base-100 ring-4 ring-base-100`}
      >
        <span className="size-1.5 rounded-full bg-primary" aria-hidden />
        <span className="sr-only">ขั้นตอนปัจจุบัน</span>
      </span>
    );
  }

  return (
    <span
      className={`relative z-10 ${size} rounded-full border-2 border-line bg-base-100 ring-4 ring-base-100`}
    >
      <span className="sr-only">ยังไม่ถึงขั้นตอนนี้</span>
    </span>
  );
}
