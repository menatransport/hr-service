"use client";

import { createContext, useContext } from "react";

import { FALLBACK_DESK_IDENTITY, type DeskIdentity } from "@/lib/auth/identity";

/**
 * ตัวตนของผู้ใช้ที่ล็อกอินอยู่ ส่งจาก server layout ลงไปให้ client component
 *
 * client component **ห้ามอ่าน `deskUser` จาก `lib/data.ts` อีกต่อไป** — ค่านั้น
 * เป็นแค่ค่าสำรองตอนยังไม่ล็อกอิน ใครที่ต้องรู้ว่า “ฉันเป็นใคร” (ปุ่มอนุมัติ,
 * ช่องเซ็นชื่อ, กฎล็อกฟอร์ม) ให้ใช้ `useDeskIdentity()` ตัวนี้เท่านั้น
 *
 * ตัวจริงอ่านมาจากคุกกี้ session ที่ `getDeskIdentity()` ใน `lib/auth/session.ts`
 */
const IdentityContext = createContext<DeskIdentity>(FALLBACK_DESK_IDENTITY);

export function IdentityProvider({
  identity,
  children,
}: {
  identity: DeskIdentity;
  children: React.ReactNode;
}) {
  return (
    <IdentityContext.Provider value={identity}>{children}</IdentityContext.Provider>
  );
}

export const useDeskIdentity = (): DeskIdentity => useContext(IdentityContext);
