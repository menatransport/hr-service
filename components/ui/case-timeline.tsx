import { Check } from "lucide-react";

import type { TimelineStep } from "@/lib/types";

export function CaseTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="flex flex-col">
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        const railFilled = step.state === "done";

        return (
          <li key={step.title} className="flex gap-3.5">
            <div className="flex w-[22px] flex-none flex-col items-center">
              <Marker state={step.state} />
              {!last ? (
                <div
                  className={`min-h-[34px] w-0.5 flex-1 ${
                    railFilled ? "bg-primary" : "bg-line"
                  }`}
                />
              ) : null}
            </div>
            <div
              className={`flex flex-col gap-1 ${last ? "" : "pb-5"} ${
                step.state === "todo" ? "text-mut" : ""
              }`}
            >
              <span
                className={
                  step.state === "current"
                    ? "text-sm font-semibold text-primary"
                    : "text-sm font-medium"
                }
              >
                {step.title}
              </span>
              {step.meta ? (
                <span className="text-[12.5px] text-mut">{step.meta}</span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Marker({ state }: { state: TimelineStep["state"] }) {
  if (state === "done") {
    return (
      <span className="flex size-[22px] items-center justify-center rounded-full bg-primary text-primary-content">
        <Check size={12} strokeWidth={3} aria-hidden />
        <span className="sr-only">เสร็จแล้ว</span>
      </span>
    );
  }

  if (state === "current") {
    return (
      <span className="size-[22px] rounded-full border-2 border-primary bg-base-100">
        <span className="sr-only">ขั้นตอนปัจจุบัน</span>
      </span>
    );
  }

  return (
    <span className="size-[22px] rounded-full border-2 border-line bg-base-100">
      <span className="sr-only">ยังไม่ถึงขั้นตอนนี้</span>
    </span>
  );
}
