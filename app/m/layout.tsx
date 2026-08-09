import { BottomTabs } from "@/components/m/bottom-tabs";
import { PhoneChrome } from "@/components/m/phone-chrome";

/**
 * App shell for the employee-facing mobile app.
 *
 * On ≥md the whole thing sits inside a 420px device frame so the hand-off
 * screens from `HR System.dc.html` stay recognisable on a laptop. On a real
 * phone the frame melts away and the shell fills the viewport.
 *
 * Pages render their own `<Screen>` (the scroll area) and may append a sticky
 * footer as a sibling — both become flex children of this column.
 */
export default function MobileLayout({ children }: LayoutProps<"/m">) {
  return (
    <div className="flex min-h-dvh justify-center md:py-8">
      <div className="flex h-dvh w-full max-w-[420px] flex-col overflow-hidden bg-base-100 md:h-[820px] md:rounded-[28px] md:border md:border-line md:shadow-[0_20px_50px_-30px_rgba(21,32,29,0.35)]">
        <PhoneChrome />
        {children}
        <BottomTabs />
      </div>
    </div>
  );
}
