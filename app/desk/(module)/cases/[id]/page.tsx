import { notFound } from "next/navigation";

import { CaseListView } from "@/components/desk/case-list-view";
import { CaseModal } from "@/components/desk/case-modal";
import { getCase, getEligibleApprovers } from "@/lib/cases";
import {
  activeComplaintTypesFor,
  getComplaintTypes,
  getRootCauses,
} from "@/lib/complaint-master";

/**
 * เคสมาจาก NCAC API จึงเป็นหน้า dynamic — ไม่มี `generateStaticParams` อีกแล้ว
 * (prerender ไว้ล่วงหน้าจะได้ข้อมูลค้างตั้งแต่ตอน build)
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/desk/cases/[id]">) {
  const { id } = await props.params;
  const hrCase = await getCase(id);
  return {
    title: hrCase ? `${hrCase.trackingNo} · ${hrCase.subject}` : "ไม่พบเคส",
  };
}

export default async function DeskCaseDetailPage(
  props: PageProps<"/desk/cases/[id]">,
) {
  const { id } = await props.params;
  /* master data ล้มแล้วเหลือดรอปดาวน์ว่าง ซึ่งดีกว่าเปิดคำร้องไม่ได้เลยทั้งหน้า —
     ข้อมูลคำร้องเป็นของสำคัญกว่า · หน้าจัดการ master ต่างหากที่ต้องเห็น error จริง */
  const [hrCase, approvers, complaintTypes, rootCauses] = await Promise.all([
    getCase(id),
    getEligibleApprovers().catch(() => []),
    getComplaintTypes().catch(() => []),
    getRootCauses().catch(() => []),
  ]);
  if (!hrCase) notFound();

  return (
    <>
      {/* ตารางเคสยังอยู่ข้างหลัง — modal ลอยขึ้นมาทับ */}
      <CaseListView />
      <CaseModal
        hrCase={hrCase}
        approvers={approvers}
        /* กรองให้เหลือเฉพาะหน่วยงานที่ถือคำร้องนี้ตั้งแต่ฝั่ง server —
           ไม่ต้องส่งรายการทั้งบริษัทข้ามไปให้ client กรองเอง */
        complaintTypes={activeComplaintTypesFor(complaintTypes, hrCase.departmentId)}
        rootCauses={rootCauses}
      />
    </>
  );
}
