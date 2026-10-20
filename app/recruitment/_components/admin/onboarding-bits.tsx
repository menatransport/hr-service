
import {
  STAGE_LABEL,
  STAGE_TONE,
  STEP_META,
  STEP_ORDER,
  type Stage,
  type Step,
  type StepState,
} from "@/app/recruitment/_lib/requisitions/onboarding";

/** ชิ้นเล็กที่หน้า “ติดตามพนักงานใหม่” กับหน้าเส้นทางรายคนใช้ร่วมกัน */

export const STEP_STATE_LABEL: Record<StepState, string> = {
  done: "เสร็จ",
  partial: "กำลังทำ",
  todo: "ยังไม่เริ่ม",
  skip: "—",
};

/** แถบ 6 ช่อง — ขั้นที่เสร็จเติมจากซ้าย ที่ยังไม่เสร็จเป็นสีเทาทางขวา · hover ดูชื่อขั้น */
export function StepDots({ states }: { states: Record<Step, StepState> }) {
  const label = STEP_ORDER.map((s) => `${STEP_META[s].short}: ${STEP_STATE_LABEL[states[s]]}`).join("\n");
  const done = STEP_ORDER.filter((s) => states[s] === "done").length;
  return (
    <span className="flex gap-0.5" title={label} aria-label={label.replace(/\n/g, " · ")}>
      {STEP_ORDER.map((s, i) => (
        <span key={s} className={`h-2 w-3.5 rounded-[3px] ${i < done ? "bg-primary" : "bg-base-300"}`} />
      ))}
    </span>
  );
}

export function StageChip({ stage, label }: { stage: Stage; label?: string }) {
  return (
    <span className={`w-fit rounded-selector px-1.5 py-0.5 text-11-5 font-medium whitespace-nowrap ${STAGE_TONE[stage]}`}>
      {label || STAGE_LABEL[stage]}
    </span>
  );
}

export function resultTone(value: string): string {
  const v = value.trim();
  if (v.startsWith("ไม่ผ่าน") || ["ลาออก", "ไม่มาฝึกงาน", "พฤติกรรมไม่ผ่าน"].includes(v))
    return "bg-alert/12 text-alert";
  if (v.startsWith("ผ่าน") || v === "พร้อมรับรถ") return "bg-st-live text-st-live-ink";
  return "bg-st-wait text-st-wait-ink";
}

const ST_STEPS = ["วันแรก", "กลางฝึก", "ก่อนรับรถ"] as const;

function barTone(value: string): string {
  if (!value) return "bg-base-300";
  const tone = resultTone(value);
  if (tone.includes("alert")) return "bg-alert";
  if (tone.includes("st-live")) return "bg-primary";
  return "bg-st-wait-ink";
}

/**
 * ST ในตาราง — คอลัมน์เดียวแทน ST + 3 รอบ: แถบ 3 ช่องสีตามผล (ผ่าน/ไม่ผ่าน/อื่น ๆ)
 * + ผลล่าสุด · ชื่อ ST บรรทัดล่าง · hover ดูผลครบ 3 รอบ
 */
export function StProgress({ name, results }: { name: string; results: string[] }) {
  const done = results.filter(Boolean).length;
  const latest = [...results].reverse().find(Boolean) ?? "";
  if (!name && !done) return <span className="text-mut">—</span>;
  const label = ST_STEPS.map((s, i) => `${s}: ${results[i] || "—"}`).join("\n");
  return (
    <span className="flex flex-col gap-1" title={label} aria-label={label.replace(/\n/g, " · ")}>
      <span className="flex items-center gap-2">
        <span className="flex flex-none gap-0.5">
          {ST_STEPS.map((s, i) => (
            <span key={s} className={`h-1.5 w-4 rounded-full ${barTone(results[i] ?? "")}`} />
          ))}
        </span>
        <span
          className={`truncate text-12 font-medium ${
            latest ? resultTone(latest).split(" ").find((c) => c.startsWith("text-")) : "text-mut"
          }`}
        >
          {latest || "ยังไม่ประเมิน"}
        </span>
      </span>
      {name ? <span className="truncate text-11 text-mut">{name}</span> : null}
    </span>
  );
}

export function ResultChip({ value }: { value: string }) {
  if (!value) return <span className="text-mut">—</span>;
  return (
    <span className={`w-fit rounded-selector px-1.5 py-0.5 text-11-5 font-medium whitespace-nowrap ${resultTone(value)}`}>
      {value}
    </span>
  );
}
