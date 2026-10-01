import type { Metadata } from "next";

import { DataError } from "@/components/ui/data-error";
import {
  RecruitmentTabs,
  type RecruitmentTab,
} from "@/app/recruitment/_components/admin/recruitment-tabs";
import {
  getRequisitionOptions,
  type RequisitionOptions,
} from "@/app/recruitment/_lib/requisitions/options";
import { listRequisitions } from "@/app/recruitment/_lib/requisitions/store";
import type { Requisition } from "@/app/recruitment/_lib/requisitions/types";
import {
  listApplications,
  listBlacklist,
  listContactOwners,
} from "@/app/recruitment/_lib/applications";
import { listDocSlots } from "@/app/recruitment/_lib/doc-slots";
import type { DocSlot } from "@/app/recruitment/_lib/form";
import type { ApplicationSummary, BlacklistEntry } from "@/app/recruitment/_lib/types";

/**
 * ขอสรรหาและผู้สมัคร — สองตารางใต้หัวเดียวกัน สลับด้วยแท็บ (`?tab=`)
 *
 * `force-dynamic` เพราะทั้งหน้าคิดจากวันที่ของวันนี้ (คอลัมน์ “รอมาแล้ว” และ
 * การ์ดค้างนาน) และสถานะใบสมัครที่ผูกไว้เปลี่ยนได้ตลอดเวลา
 *
 * **โหลดข้อมูลของทั้งสองแท็บพร้อมกันตั้งแต่เปิดหน้า** ไม่ได้แยกโหลดตอนกดแท็บ —
 * สี่ชุดนี้อยู่คนละคอลเลกชันและไม่ขึ้นแก่กัน ยิงพร้อมกันแล้วช้าเท่าตัวที่ช้าที่สุด
 * ตัวเดียว ส่วนการโหลดทีหลังจะแลกมาด้วยการรอทุกครั้งที่สลับแท็บ ซึ่งเป็นสิ่งที่
 * คนใช้หน้านี้ทำบ่อยที่สุดหลังจากรวมสองหน้าเข้าด้วยกัน — ผิดทางตั้งแต่ต้น
 *
 * **ตัวเลือกพังไม่ล้มทั้งหน้า** (`getRequisitionOptions()` จับ error เองแล้วคืน
 * `failed` มาให้ขึ้นแถบเตือน) ส่วนคำขอหรือใบสมัครอ่านไม่ได้เมื่อไหร่คือ `DataError`
 * เพราะไม่มีอะไรจะแสดงเลย — **ห้ามขึ้นหน้าเปล่า**
 */

export const metadata: Metadata = {
  title: "ขอสรรหาและผู้สมัคร",
};

export const dynamic = "force-dynamic";

export default async function RequisitionsPage({
  searchParams,
}: PageProps<"/recruitment/admin/requisitions">) {
  const params = await searchParams;
  const tab: RecruitmentTab = params.tab === "candidates" ? "candidates" : "requisitions";
  const ref = typeof params.ref === "string" ? params.ref : "";

  let rows: Requisition[] | null = null;
  let options: RequisitionOptions | null = null;
  let applications: ApplicationSummary[] | null = null;
  let contactOptions: string[] = [];
  let docSlots: DocSlot[] = [];
  let blacklist: BlacklistEntry[] = [];
  let error: string | null = null;

  try {
    [rows, options, applications, contactOptions, docSlots, blacklist] = await Promise.all([
      listRequisitions(),
      getRequisitionOptions(),
      listApplications(),
      listContactOwners(),
      listDocSlots(),
      listBlacklist(),
    ]);
  } catch (err) {
    error = err instanceof Error ? err.message : "เชื่อมต่อฐานข้อมูลไม่สำเร็จ";
  }

  return (
    <div className="animate-rise">
      {rows && options && applications ? (
        <RecruitmentTabs
          initialTab={tab}
          initialRequisitions={rows}
          options={options}
          initialApplications={applications}
          contactOptions={contactOptions}
          docSlots={docSlots}
          blacklist={blacklist}
          initialRef={ref}
        />
      ) : (
        <div className="mx-auto max-w-xl py-6">
          <DataError
            title="โหลดข้อมูลคำขอสรรหาและผู้สมัครไม่สำเร็จ"
            envKey="MONGO_URI"
            message={error ?? "เชื่อมต่อฐานข้อมูลไม่สำเร็จ"}
          />
        </div>
      )}
    </div>
  );
}
