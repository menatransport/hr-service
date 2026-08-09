import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/** Sticky title bar with a back affordance, used on pushed mobile screens. */
export function ScreenHeader({
  title,
  backHref,
  trailing,
}: {
  title: string;
  backHref: string;
  trailing?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-base-100/95 px-5 py-3 backdrop-blur">
      <Link
        href={backHref}
        aria-label="ย้อนกลับ"
        className="-ml-1.5 flex size-9 flex-none items-center justify-center rounded-selector text-ink transition-colors hover:bg-base-200"
      >
        <ChevronLeft size={22} strokeWidth={1.7} aria-hidden />
      </Link>
      <h1 className="min-w-0 flex-1 truncate text-[19px] font-semibold">
        {title}
      </h1>
      {trailing}
    </header>
  );
}
