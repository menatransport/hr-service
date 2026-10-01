import { recordStatusMeta, type RecordStatus } from "@/lib/record-case-flow";

const sizes = {
  sm: "text-11-5 gap-1.5 pl-2 pr-2.5 py-[3px]",
  md: "text-xs gap-2 pl-2.5 pr-3 py-1",
};

/**
 * ป้ายสถานะของบันทึกเคส — ทรงเดียวกับ `StatusBadge` ของฝั่งคำร้องเป๊ะ
 * (แยกคอมโพเนนต์เพราะคนละชุดสถานะ ไม่ใช่คนละดีไซน์)
 */
export function RecordStatusBadge({
  status,
  size = "sm",
}: {
  status: RecordStatus;
  size?: keyof typeof sizes;
}) {
  const meta = recordStatusMeta[status];

  return (
    <span
      className={`inline-flex flex-none items-center rounded-full font-medium ring-1 ring-inset whitespace-nowrap ${meta.chip} ${sizes[size]}`}
    >
      {/* จุดนำหน้า — แยกสถานะได้โดยไม่ต้องพึ่งสีอย่างเดียว */}
      <span aria-hidden className={`size-1.5 flex-none rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}
