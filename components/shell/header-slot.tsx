"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/** `id` ของช่องว่างบนแถบบน (`ShellHeader`) ที่หน้าในวางปุ่มของตัวเองลงไปได้ */
export const HEADER_SLOT_ID = "shell-page-actions";

/**
 * วางปุ่มของหน้าลงบนแถบบน (ก่อนปุ่มคู่มือ) — หน้าไม่ต้องส่ง prop ขึ้นไปถึง layout
 * ตอน SSR/hydrate ยังไม่มีช่อง (คืน `null`) แล้วค่อยหาเจอหลัง mount · ออกจากหน้า = ปุ่มหายตามไปด้วย
 */
export function HeaderSlot({ children }: { children: React.ReactNode }) {
  const el = useSyncExternalStore(noop, findSlot, () => null);
  return el ? createPortal(children, el) : null;
}

const noop = () => () => {};
const findSlot = () => document.getElementById(HEADER_SLOT_ID);
