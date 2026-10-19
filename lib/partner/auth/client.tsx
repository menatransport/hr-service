"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import type { PartnerSession, PartnerSessionStatus } from "./types";

/**
 * แทน `useSession()` / `<SessionProvider>` ของ next-auth — อ่านจาก `GET /api/partner/session`
 * **สัญญากลาง** — ห้ามเปลี่ยนชื่อ/รูปคืนค่า
 *
 * provider ยิงครั้งเดียวตอน mount แล้วแจกให้ทุก component ข้างใต้ · ใช้นอก provider
 * จะได้ `{ data: null, status: "unauthenticated" }` (ไม่ยิงเอง — กันยิงซ้ำทุก component)
 */

interface SessionState {
  data: PartnerSession | null;
  status: PartnerSessionStatus;
}

const OUTSIDE: SessionState = { data: null, status: "unauthenticated" };
const Ctx = createContext<SessionState>(OUTSIDE);

export function usePartnerSession(): { data: PartnerSession | null; status: PartnerSessionStatus } {
  return useContext(Ctx);
}

export function PartnerSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ data: null, status: "loading" });

  useEffect(() => {
    let alive = true;
    fetch("/api/partner/session", { cache: "no-store", credentials: "same-origin" })
      .then(async (res) => (res.ok ? ((await res.json()) as PartnerSession | null) : null))
      .catch(() => null)
      .then((data) => {
        if (!alive) return;
        setState(data?.user ? { data, status: "authenticated" } : { data: null, status: "unauthenticated" });
      });
    return () => {
      alive = false;
    };
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}
