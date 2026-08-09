"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { requestJson } from "@/lib/http";
import { runAction } from "@/lib/swal";

/**
 * ออกจากระบบ — ถามก่อน แล้วค่อยลบคุกกี้ session ที่เซิร์ฟเวอร์
 *
 * เป็นปุ่มที่ยิง `POST` ไม่ใช่ `<Link href="/">` เพราะการออกจากระบบเปลี่ยนสถานะจริง
 * (ลิงก์ GET จะถูก prefetch แล้วเตะผู้ใช้ออกตั้งแต่ยังไม่ได้กด)
 *
 * ใช้ `location.replace` ไม่ใช่ `router.push` — ต้องให้ทั้งหน้าโหลดใหม่จริง ๆ
 * เพื่อทิ้งแคชของ Router ที่ยังมีข้อมูลของคนเดิมค้างอยู่
 */
function useSignOut() {
  const router = useRouter();

  return async function signOut() {
    const out = await runAction({
      confirm: {
        title: "ออกจากระบบ?",
        text: "จะต้องเข้าสู่ระบบด้วยบัญชี Google ของบริษัทอีกครั้ง",
        confirmText: "ออกจากระบบ",
        tone: "warn",
      },
      pending: "กำลังออกจากระบบ…",
      success: false,
      failureTitle: "ออกจากระบบไม่สำเร็จ",
      run: () => requestJson("/api/auth/logout", { method: "POST" }),
    });

    if (out.status !== "done") return;
    router.refresh();
    window.location.replace("/");
  };
}

export function LogoutButton() {
  const signOut = useSignOut();

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      title="ออกจากระบบ"
      className="group flex size-9 cursor-pointer items-center justify-center rounded-selector text-mut transition-colors hover:bg-base-200 hover:text-alert"
    >
      <span className="sr-only">ออกจากระบบ</span>
      <LogOut
        size={18}
        strokeWidth={1.7}
        aria-hidden
        className="transition-transform duration-300 group-hover:scale-115 group-hover:rotate-8"
      />
    </button>
  );
}

/** แบบแถวเต็มความกว้าง — ใช้ในรายการ “อื่น ๆ” ของหน้าโปรไฟล์บนมือถือ */
export function LogoutRow() {
  const signOut = useSignOut();

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      className="flex w-full cursor-pointer items-center gap-3 rounded-box border border-line bg-base-100 px-3.5 py-3 text-left transition-colors hover:border-alert/40"
    >
      <LogOut size={17} strokeWidth={1.6} className="flex-none text-alert" aria-hidden />
      <span className="flex-1 text-[13.5px] text-alert">ออกจากระบบ</span>
    </button>
  );
}
