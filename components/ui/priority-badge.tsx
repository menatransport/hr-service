import { priorityMeta } from "@/lib/data";
import type { Priority } from "@/lib/types";

export function PriorityBadge({ priority }: { priority: Priority }) {
  const meta = priorityMeta[priority];

  return (
    <span
      className={`inline-flex flex-none items-center rounded-full border px-2 py-[2px] text-[11px] whitespace-nowrap ${meta.chip}`}
    >
      {meta.label}
    </span>
  );
}
