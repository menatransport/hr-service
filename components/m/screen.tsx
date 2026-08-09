/** The single scroll area inside the phone shell. */
export function Screen({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main
      className={`flex-1 overflow-y-auto overscroll-contain animate-rise ${className}`}
    >
      {children}
    </main>
  );
}
