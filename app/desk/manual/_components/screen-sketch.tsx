import type { Sketch } from "../_lib/manual";

/**
 * ภาพจำลองของหนึ่งส่วนบนหน้าจอ — วาดจากข้อมูลในคู่มือ ไม่ใช่รูปภาพ (ข้อความในภาพจึงตรงกับระบบเสมอ
 * และไม่ต้องถ่ายรูปใหม่ทุกครั้งที่หน้าจอเปลี่ยน) · ตั้งใจให้หยาบ บอกแค่ “อะไรอยู่ตรงไหน”
 */
export function ScreenSketch({ sketch }: { sketch: Sketch }) {
  return (
    <div aria-hidden className="rounded-lg border border-line bg-canvas/70 p-2 text-11-5 leading-snug">
      {render(sketch)}
    </div>
  );
}

const BOX = "rounded-md border border-line bg-base-100 px-2 py-1";

function render(sketch: Sketch) {
  switch (sketch.kind) {
    case "cards":
      return (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(78px,1fr))] gap-1.5">
          {sketch.items.map((label, i) => (
            <span
              key={label}
              className={`${BOX} truncate ${i === sketch.active ? "border-primary/60 bg-soft text-primary" : "text-mut"}`}
            >
              {label}
              <span className="mt-0.5 block h-1.5 w-6 rounded-full bg-line" />
            </span>
          ))}
        </div>
      );
    case "bar":
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          {sketch.items.map((raw) => {
            const mark = raw[0];
            const label = "?+x#".includes(mark) ? raw.slice(1) : raw;
            if (mark === "?") return <span key={raw} className={`${BOX} min-w-28 flex-1 text-mut`}>⌕ {label}</span>;
            if (mark === "+") return <span key={raw} className="rounded-full bg-primary px-2.5 py-1 text-primary-content">{label}</span>;
            if (mark === "x") return <span key={raw} className={`${BOX} text-excel`}>{label}</span>;
            if (mark === "#") return <span key={raw} className="chip chip-done">{label}</span>;
            return <span key={raw} className={BOX}>{label}</span>;
          })}
        </div>
      );
    case "tabs":
      return (
        <div className="flex flex-wrap gap-1 border-b border-line-strong">
          {sketch.items.map((label, i) => (
            <span
              key={label}
              className={`-mb-px rounded-t-md px-2.5 py-1 ${
                i === (sketch.active ?? 0) ? "border border-line-strong border-b-base-100 bg-base-100 font-medium text-primary" : "text-mut"
              }`}
            >
              {label}
            </span>
          ))}
        </div>
      );
    case "table":
      return (
        <div className="overflow-hidden rounded-md border border-line bg-base-100">
          <div className="flex gap-3 overflow-hidden bg-head px-2 py-1 whitespace-nowrap text-white">
            {sketch.cols.map((c, i) => (
              <span key={`${c}-${i}`}>{c}</span>
            ))}
          </div>
          {[0, 1].map((r) => (
            <div key={r} className="flex gap-3 border-t border-line px-2 py-1.5">
              {sketch.cols.slice(0, 6).map((c, i) => (
                <span key={`${c}-${i}`} className="h-1.5 flex-1 rounded-full bg-line" />
              ))}
            </div>
          ))}
        </div>
      );
    case "split":
      return (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {sketch.items.map((label) => (
            <span key={label} className={`${BOX} min-h-12 text-mut`}>
              {label}
            </span>
          ))}
        </div>
      );
    case "note":
      return <p className={`${BOX} text-mut`}>{sketch.text}</p>;
  }
}
