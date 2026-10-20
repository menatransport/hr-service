import type { Metadata } from "next";

import { DataError } from "@/components/ui/data-error";
import { CandidatesScreen } from "@/app/recruitment/_components/admin/recruitment-screens";
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
 * ผู้สมัคร — แยกออกจากหน้าขอสรรหามาเป็นหน้าของตัวเองอีกครั้ง (14 ต.ค. 2026)
 *
 * `?ref=` คือเลขที่ใบสมัครที่คิวงานหรือตารางคำขอส่งมา เพื่อเปิดตรงแถวนั้นเลย ·
 * คำขอสรรหายังต้องโหลดมาด้วย เพราะกล่องทำเอกสารผูก/ปลด RQ ได้จากหน้านี้
 */

export const metadata: Metadata = {
  title: "ผู้สมัคร",
};

export const dynamic = "force-dynamic";

export default async function CandidatesPage({
  searchParams,
}: PageProps<"/recruitment/admin/candidates">) {
  const params = await searchParams;
  const ref = typeof params.ref === "string" ? params.ref : "";

  let requisitions: Requisition[] | null = null;
  let applications: ApplicationSummary[] | null = null;
  let contactOptions: string[] = [];
  let docSlots: DocSlot[] = [];
  let blacklist: BlacklistEntry[] = [];
  let error: string | null = null;

  try {
    [requisitions, applications, contactOptions, docSlots, blacklist] = await Promise.all([
      listRequisitions(),
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
      {requisitions && applications ? (
        <CandidatesScreen
          initialRequisitions={requisitions}
          initialApplications={applications}
          contactOptions={contactOptions}
          docSlots={docSlots}
          blacklist={blacklist}
          initialRef={ref}
          initialRc={params.rc === "1"}
        />
      ) : (
        <div className="mx-auto max-w-xl py-6">
          <DataError
            title="โหลดข้อมูลผู้สมัครไม่สำเร็จ"
            envKey="MONGO_URI"
            message={error ?? "เชื่อมต่อฐานข้อมูลไม่สำเร็จ"}
          />
        </div>
      )}
    </div>
  );
}
