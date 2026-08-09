import Link from "next/link";

export function SectionTitle({
  children,
  action,
  actionHref,
}: {
  children: React.ReactNode;
  action?: string;
  actionHref?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold">{children}</h2>
      {action && actionHref ? (
        <Link
          href={actionHref}
          className="text-[13px] text-primary hover:text-ink"
        >
          {action}
        </Link>
      ) : null}
    </div>
  );
}
