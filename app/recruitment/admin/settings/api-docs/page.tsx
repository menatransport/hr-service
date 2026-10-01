import type { Metadata } from "next";

import { PageHead } from "@/components/desk/page-head";
import { ApiDocsView } from "@/app/recruitment/_components/admin/api-docs-view";
import { formatThaiDate } from "@/app/recruitment/_lib/drivers/types";
import {
  API_DOCS_UPDATED,
  API_DOCS_VERSION,
  API_GROUPS,
} from "@/app/recruitment/_lib/api-docs";

/**
 * ตั้งค่า › API Docs — เอกสารอ้างอิง API ของ Mass Recruitment (ขอบเขตดู `API_DOCS_SCOPE`)
 *
 * เนื้อหาทั้งหมดมาจาก `_lib/api-docs.ts` ไฟล์เดียว · แก้ route เมื่อไหร่ต้องแก้ไฟล์นั้น
 * ด้วย แล้วรัน `node check_api_docs.mjs` ยืนยันว่าเอกสารครบตรงกับ route จริง
 */

export const metadata: Metadata = {
  title: "API Docs · ตั้งค่า",
};

export default function ApiDocsPage() {
  const total = API_GROUPS.reduce((n, g) => n + g.endpoints.length, 0);

  return (
    <div className="flex flex-col gap-5 animate-rise">
      <PageHead
        title="API Docs"
        subtitle="เอกสารอ้างอิงสำหรับนักพัฒนา — การยืนยันตัวตนและทุกเส้นที่ Mass Recruitment ใช้ พร้อมสิทธิ์การเข้าถึง พารามิเตอร์ ผลลัพธ์ และประวัติการเปลี่ยนแปลง"
        actions={
          <div className="flex flex-wrap items-center gap-2 text-12 text-mut">
            <span className="rounded-selector border border-line bg-base-100 px-2 py-1 font-mono">
              v{API_DOCS_VERSION}
            </span>
            <span className="rounded-selector border border-line bg-base-100 px-2 py-1">
              {total} endpoints · ปรับปรุง {formatThaiDate(API_DOCS_UPDATED, "full")}
            </span>
          </div>
        }
      />
      <ApiDocsView />
    </div>
  );
}
