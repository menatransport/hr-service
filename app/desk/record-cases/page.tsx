import { RecordCaseView } from "@/components/desk/record-case-view";
import { DataError } from "@/components/ui/data-error";
import { listRecordCases } from "@/lib/record-cases";
import { listRecordCategories } from "@/lib/record-categories";
import type { RecordCase, RecordCategory } from "@/lib/record-case-flow";

export const metadata = { title: "บันทึกเคส" };

/** อ่านจาก MongoDB ทุกครั้งที่เปิดหน้า — เคสถูกบันทึก/เปลี่ยนสถานะตลอดเวลา */
export const dynamic = "force-dynamic";

export default async function RecordCasesPage() {
  let records: RecordCase[] = [];
  let categories: RecordCategory[] = [];
  let error: string | null = null;

  try {
    [records, categories] = await Promise.all([listRecordCases(), listRecordCategories()]);
  } catch (err) {
    // ต่อฐานข้อมูลไม่ได้ต้องบอกให้ชัด — หน้าว่างจะถูกอ่านเป็น “ยังไม่มีเคส”
    error = err instanceof Error ? err.message : "โหลดบันทึกเคสไม่สำเร็จ";
  }

  if (error) {
    return (
      <DataError title="โหลดบันทึกเคสไม่สำเร็จ" message={error} envKey="MONGO_URI" />
    );
  }

  return <RecordCaseView records={records} categories={categories} />;
}
