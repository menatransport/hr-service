import type { Metadata } from "next";
import { FolderOpen } from "lucide-react";

import { PageHead } from "@/components/desk/page-head";
import { DataError } from "@/components/ui/data-error";
import { DocumentExpiryView } from "@/app/recruitment/_components/admin/document-expiry-view";
import { getDocExpiries, todayInBangkok } from "@/app/recruitment/_lib/drivers/registry";
import type { DocExpiry } from "@/app/recruitment/_lib/drivers/types";

/**
 * ศูนย์เอกสาร — ปฏิทินวันหมดอายุเอกสารของ พจส. ทั้งทะเบียน
 *
 * **หน้านี้ไม่ได้อ่านแฟ้มเอกสารใน GridFS** ถึงจะชื่อศูนย์เอกสาร — มันอ่าน
 * **วันหมดอายุที่อยู่ในทะเบียน** สองใบ (ใบขับขี่จาก ETL · บัตรประชาชนที่ฝ่ายบุคคล
 * กรอกเอง) ซึ่งเป็นข้อมูลที่ตอบคำถามว่า “ต้องตามใครต่ออะไรเดือนนี้” · สำเนาเอกสาร
 * ที่แนบไว้เป็นไฟล์อยู่ในหน้าประวัติรายคน เพราะต้องดูทีละคน ไม่ได้ดูเป็นปฏิทิน
 *
 * `force-dynamic` เพราะทุกตัวเลขในหน้าคิดเทียบกับวันนี้ (`เหลือ 12 วัน`
 * `หมดอายุแล้ว`) ถ้าปล่อยให้ cache ไว้ ตัวเลขจะค้างข้ามสัปดาห์ · เหตุผลเดียวกับ
 * หน้าทะเบียนประวัติ
 *
 * **วันนี้ถูกคิดที่เซิร์ฟเวอร์ครั้งเดียวแล้วส่งลงไป** — ถ้าให้ client เรียก
 * `new Date()` เอง ช่อง “วันนี้” จะไม่ตรงกับที่ server เรนเดอร์แล้ว hydration พัง
 * (กติกาเดียวกับที่ห้ามใช้ `Intl`/`toLocaleDateString` ทั้งโปรเจกต์)
 */

export const metadata: Metadata = {
  title: "ศูนย์เอกสาร",
};

export const dynamic = "force-dynamic";

export default async function DriverDocumentsPage() {
  let rows: DocExpiry[] | null = null;
  let error: string | null = null;

  try {
    rows = await getDocExpiries();
  } catch (err) {
    error = err instanceof Error ? err.message : "เชื่อมต่อฐานข้อมูลไม่สำเร็จ";
  }

  return (
    <div className="flex animate-rise flex-col gap-4 pt-4 sm:pt-5">

      {rows ? (
        rows.length ? (
          <DocumentExpiryView rows={rows} todayISO={todayInBangkok()} />
        ) : (
          <EmptyRegistry />
        )
      ) : (
        <div className="mx-auto max-w-xl py-6">
          <DataError
            title="โหลดข้อมูลเอกสารไม่สำเร็จ"
            envKey="MONGO_URI"
            message={error ?? "เชื่อมต่อฐานข้อมูลไม่สำเร็จ"}
          />
        </div>
      )}
    </div>
  );
}

function EmptyRegistry() {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-box border border-dashed border-line bg-base-100 px-5 py-14 text-center">
      <FolderOpen size={24} strokeWidth={1.6} className="text-mut" aria-hidden />
      <p className="text-sm font-semibold">ยังไม่มีเอกสารที่มีวันหมดอายุ</p>
      <p className="max-w-[54ch] text-12-5 leading-[1.7] text-mut text-pretty">
        ไม่มี พจส. ที่ยังปฏิบัติงานคนไหนมีวันหมดอายุใบขับขี่หรือบัตรประชาชนในทะเบียน —
        ถ้าคิดว่าน่าจะมี ให้ตรวจว่า <code className="font-mono">Boom_ETL.main_driver</code>{" "}
        ของระบบต้นทางมีข้อมูลหรือไม่
      </p>
    </div>
  );
}
