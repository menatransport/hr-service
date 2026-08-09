import { notFound } from "next/navigation";

import { CaseListView } from "@/components/desk/case-list-view";
import { CaseModal } from "@/components/desk/case-modal";
import { getCase, getEligibleApprovers } from "@/lib/cases";

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
  const [hrCase, approvers] = await Promise.all([
    getCase(id),
    getEligibleApprovers().catch(() => []),
  ]);
  if (!hrCase) notFound();

  return (
    <>
      {/* ตารางเคสยังอยู่ข้างหลัง — modal ลอยขึ้นมาทับ */}
      <CaseListView />
      <CaseModal hrCase={hrCase} approvers={approvers} />
    </>
  );
}
