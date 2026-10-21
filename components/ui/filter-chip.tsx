/**
 * ชิปกรองแบบเปิด/ปิด — แบบเดียวทั้งระบบ (คิวคำร้อง · บันทึกเคส) (13 ต.ค. 2026)
 *
 * สีของชิปคือ **สีของสถานะที่มันกรอง** ชุดเดียวกับป้ายสถานะในตาราง (`chip-*` ใน globals.css):
 * - พัก: พื้นขาว ขอบเทา + จุดสีของสถานะหน้าป้าย — กวาดตาแล้วจับคู่กับป้ายในแถวได้ทันที
 * - เลือกอยู่: พื้น/หมึก/ขอบเป็นสีของสถานะนั้นเต็มตัว · “ทั้งหมด” (`ink`) เป็นพื้นหมึกทึบ
 * สีไม่ใช่ตัวบอกเดียว — ชิปที่เลือกอยู่ตัวหนาขึ้นและมี `aria-pressed`
 */

export type FilterChipTone = "ink" | "new" | "wait" | "live" | "on" | "done" | "ok" | "alert" | "sla";

const DOT: Record<FilterChipTone, string | null> = {
  ink: null,
  new: "bg-st-new-ink",
  wait: "bg-st-wait-ink",
  live: "bg-st-live-ink",
  on: "bg-primary",
  done: "bg-st-done-ink",
  ok: "bg-st-ok-ink",
  alert: "bg-alert",
  sla: "bg-sla",
};

/** คลาสของ `chip-*` ที่ประกาศ `--chip-bg` / `--chip-ink` / `--chip-line` ให้ชิปที่เลือกอยู่ */
const ON: Record<FilterChipTone, string> = {
  ink: "chip-ink",
  new: "chip-new",
  wait: "chip-wait",
  live: "chip-live",
  on: "chip-on",
  done: "chip-done",
  ok: "chip-ok",
  alert: "chip-alert",
  sla: "chip-sla",
};

export function FilterChip({
  label,
  count,
  tone = "ink",
  on,
  onClick,
}: {
  label: React.ReactNode;
  /** ยอดของตัวกรองนี้ — ตัวเลขจริงของทั้งชุด ไม่ใช่แค่หน้าที่เห็น */
  count?: number;
  tone?: FilterChipTone;
  on: boolean;
  onClick: () => void;
}) {
  const dot = DOT[tone];

  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex flex-none cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-12-5 transition-colors ${
        on
          ? `${ON[tone]} border-(--chip-line) bg-(--chip-bg) font-semibold text-(--chip-ink)`
          : "border-line bg-base-100 text-mut hover:border-line-strong hover:bg-base-200/60 hover:text-ink"
      }`}
    >
      {dot && !on ? <span aria-hidden className={`size-2 flex-none rounded-full ${dot}`} /> : null}
      {label}
      {count !== undefined ? (
        <span className={`font-mono text-11-5 tabular-nums ${on ? "opacity-85" : "text-ink"}`}>
          {count.toLocaleString("th-TH")}
        </span>
      ) : null}
    </button>
  );
}
