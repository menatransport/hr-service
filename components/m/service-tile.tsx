import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/** Large 2-up tile used on the services grid screen. */
export function ServiceTile({
  href,
  label,
  hint,
  hintTone = "mut",
  icon: Icon,
}: {
  href: string;
  label: string;
  hint: string;
  hintTone?: "mut" | "alert";
  icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-[120px] flex-col gap-3 rounded-box border border-line bg-base-100 px-3.5 py-4 transition-[border-color,background-color,transform] hover:border-primary/40 hover:bg-soft/40 active:scale-[0.98]"
    >
      <span className="flex size-10 items-center justify-center rounded-[11px] bg-soft text-primary">
        <Icon size={20} strokeWidth={1.6} aria-hidden />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[14.5px] font-semibold text-pretty">{label}</span>
        <span
          className={`text-xs ${hintTone === "alert" ? "text-alert" : "text-mut"}`}
        >
          {hint}
        </span>
      </span>
    </Link>
  );
}
