import { ReportWizard } from "@/components/m/report-wizard";
import { getMobileIdentity } from "@/lib/auth/session";

export const metadata = { title: "แจ้งเรื่องร้องเรียน" };

export const dynamic = "force-dynamic";

export default async function NewCasePage() {
  // ผู้แจ้งมาจาก session ถ้าล็อกอินอยู่ — หน้าสรุปก่อนส่งจะได้ไม่ขึ้นชื่อคนอื่น
  return <ReportWizard reporter={await getMobileIdentity()} />;
}
