"use client";

import type { ReactNode } from "react";

import type { PartnerSession, PartnerSessionStatus } from "./types";

/**
 * แทน `useSession()` / `<SessionProvider>` ของ next-auth — อ่านจาก `GET /api/partner/session`
 * **สัญญากลาง (lane 4 เป็นเจ้าของตัวจริง)** — ห้ามเปลี่ยนชื่อ/รูปคืนค่า
 */
export function usePartnerSession(): { data: PartnerSession | null; status: PartnerSessionStatus } {
  return { data: null, status: "loading" };
}

export function PartnerSessionProvider({ children }: { children: ReactNode }) {
  return children;
}
