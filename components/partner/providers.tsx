"use client"

import { PartnerSessionProvider } from "@/lib/partner/auth/client"
export function Providers({ children }: { children: React.ReactNode }) {
  return <PartnerSessionProvider>{children}</PartnerSessionProvider>
}
