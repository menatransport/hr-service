import { statusMeta } from "@/lib/case-flow";
import type { CaseStatus } from "@/lib/types";

const sizes = {
  sm: "text-[11.5px] gap-1.5 pl-2 pr-2.5 py-[3px]",
  md: "text-xs gap-2 pl-2.5 pr-3 py-1",
};

export function StatusBadge({
  status,
  size = "sm",
  short = false,
}: {
  status: CaseStatus;
  size?: keyof typeof sizes;
  /** ใช้ป้ายสั้นเมื่อพื้นที่แคบ เช่นในตาราง */
  short?: boolean;
}) {
  const meta = statusMeta[status];

  return (
    <span
      className={`inline-flex flex-none items-center rounded-full font-medium ring-1 ring-inset whitespace-nowrap ${meta.chip} ${sizes[size]}`}
    >
      {/* จุดนำหน้า — ตัวช่วยแยกสถานะที่ไม่ได้พึ่งสีอย่างเดียว */}
      <span aria-hidden className={`size-1.5 flex-none rounded-full ${meta.dot}`} />
      {short ? meta.short : meta.label}
    </span>
  );
}
