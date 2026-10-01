import type { Metadata } from "next";

import { PageHead } from "@/components/desk/page-head";
import { DataError } from "@/components/ui/data-error";
import { ResignReasonsView } from "@/app/recruitment/_components/admin/resign-reasons-view";
import { getResignMaster } from "@/app/recruitment/_lib/resign-reasons/store";
import type { ResignMaster } from "@/app/recruitment/_lib/resign-reasons/types";

/**
 * ตั้งค่า › เหตุผลการลาออก — Reason Code Master ของทีม OPS
 *
 * รหัสชุดนี้ใช้ที่ฟอร์มพ้นสภาพของทะเบียน พจส. (ใบขอสรรหาเคยใช้ในช่อง “เหตุผลที่ต้องแทน”
 * ซึ่งถูกถอดออกแล้ว 29 ก.ย. 2026) · ระเบียนเก็บสำเนาป้ายไว้ แก้/ลบที่นี่จึงไม่ทำให้ของเก่าเพี้ยน
 */

export const metadata: Metadata = {
  title: "เหตุผลการลาออก · ตั้งค่า",
};

export const dynamic = "force-dynamic";

export default async function ResignReasonsPage() {
  let master: ResignMaster | null = null;
  let error: string | null = null;

  try {
    master = await getResignMaster();
  } catch (err) {
    error = err instanceof Error ? err.message : "เชื่อมต่อฐานข้อมูลไม่สำเร็จ";
  }

  return (
    <div className="flex flex-col gap-5 animate-rise">
      {master ? (
        <ResignReasonsView initial={master} />
      ) : (
        <div className="mx-auto max-w-xl py-6">
          <DataError
            title="โหลดรหัสเหตุผลการลาออกไม่สำเร็จ"
            envKey="MONGO_URI"
            message={error ?? "เชื่อมต่อฐานข้อมูลไม่สำเร็จ"}
          />
        </div>
      )}
    </div>
  );
}
