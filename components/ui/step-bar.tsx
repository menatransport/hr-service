/**
 * The 4-segment progress rail used on every case card in the design doc.
 * Purely decorative — the readable status always sits next to it.
 */
export function StepBar({
  filled,
  total = 4,
  className = "",
}: {
  filled: number;
  total?: number;
  className?: string;
}) {
  return (
    <div className={`flex gap-[5px] ${className}`} aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded-full transition-colors ${
            i < filled ? "bg-primary" : "bg-line"
          }`}
        />
      ))}
    </div>
  );
}
