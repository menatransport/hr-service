import Link from "next/link";

export function StatCard({
  label,
  value,
  tone = "ink",
  hint,
  href,
}: {
  label: string;
  value: number | string;
  tone?: "ink" | "sla" | "primary";
  hint?: string;
  href?: string;
}) {
  const valueTone =
    tone === "sla" ? "text-sla" : tone === "primary" ? "text-primary" : "text-ink";

  const body = (
    <>
      <span className="text-[11.5px] tracking-[0.06em] text-mut">{label}</span>
      <span className={`text-2xl leading-none font-semibold ${valueTone}`}>
        {value}
      </span>
      {hint ? <span className="text-[11.5px] text-mut">{hint}</span> : null}
    </>
  );

  const shell =
    "flex flex-col gap-1.5 rounded-box border border-line bg-base-100 p-4";

  if (!href) return <div className={shell}>{body}</div>;

  return (
    <Link
      href={href}
      className={`${shell} transition-colors hover:border-primary/40 hover:bg-soft/60`}
    >
      {body}
    </Link>
  );
}
