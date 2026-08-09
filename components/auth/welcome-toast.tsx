"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { toastSuccess } from "@/lib/swal";

/**
 * ขนมปังปิ้ง “เข้าสู่ระบบสำเร็จ” ตอนกลับมาจาก Google
 *
 * การล็อกอินจบด้วยการ redirect เต็มหน้า ไม่ใช่ `router.push` ฝั่ง client แล้ว —
 * กล่องที่ยิงจากหน้าล็อกอินจึงตายไปพร้อมหน้าเดิม ตัวนี้เลยมายิงที่ปลายทางแทน
 * โดยดูจาก `?welcome=1` ที่ callback ติดมาให้ แล้ว **ลบพารามิเตอร์ทิ้งทันที**
 * เพื่อไม่ให้กดรีเฟรชแล้วเด้งซ้ำ
 */
export function WelcomeToast({ name }: { name: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const fired = useRef(false);

  const welcome = params.get("welcome") === "1";

  useEffect(() => {
    if (!welcome || fired.current) return;
    fired.current = true;

    void toastSuccess("เข้าสู่ระบบสำเร็จ", `ยินดีต้อนรับ ${name}`);

    const rest = new URLSearchParams(params);
    rest.delete("welcome");
    const query = rest.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [welcome, name, params, pathname, router]);

  return null;
}
