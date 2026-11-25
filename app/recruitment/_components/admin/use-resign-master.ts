"use client";

import { useEffect, useState } from "react";

import { requestJson } from "@/lib/http";
import type { ResignMaster } from "@/app/recruitment/_lib/resign-reasons/types";

/** โหลด Reason Code Master ทั้งชุดครั้งเดียวตอนเปิดฟอร์ม — ใช้ทั้งฟอร์มพ้นสภาพและลิ้นชัก Exit Interview */
export function useResignMaster(enabled: boolean) {
  const [master, setMaster] = useState<ResignMaster | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    requestJson<ResignMaster>("/api/recruitment/resign-reasons", {}, "โหลดรหัสเหตุผลไม่สำเร็จ")
      .then((m) => alive && setMaster(m))
      .catch((err: unknown) =>
        alive && setError(err instanceof Error ? err.message : "โหลดรหัสเหตุผลไม่สำเร็จ"),
      );
    return () => {
      alive = false;
    };
  }, [enabled]);

  return { master, error };
}
