/**
 * Fake status strip from the design doc. Only shown on ≥md, where the app is
 * rendered inside a device frame — on a real phone the OS draws the real one.
 */
export function PhoneChrome() {
  return (
    <div
      className="hidden flex-none items-center justify-between px-[22px] pt-3.5 pb-1.5 text-[12.5px] font-medium md:flex"
      aria-hidden
    >
      <span>9:41</span>
      <span className="text-mut tracking-widest">▪▪▪ ▮</span>
    </div>
  );
}
