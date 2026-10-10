import { SurveyView } from "@/components/desk/survey-view";
import { DataError } from "@/components/ui/data-error";
import { listSurveyResponses } from "@/lib/newyear-survey";
import { DEFAULT_SURVEY_ID, type SurveyResponse } from "@/lib/survey-forms";

export const metadata = { title: "แบบสอบถาม" };

/** อ่านจาก MongoDB ทุกครั้งที่เปิดหน้า — พจส. ทยอยตอบเข้ามาตลอด */
export const dynamic = "force-dynamic";

export default async function SurveyPage() {
  let responses: SurveyResponse[] = [];
  let error: string | null = null;

  try {
    responses = await listSurveyResponses(DEFAULT_SURVEY_ID);
  } catch (err) {
    // ต่อฐานข้อมูลไม่ได้ต้องบอกให้ชัด — หน้าว่างจะถูกอ่านเป็น “ยังไม่มีใครตอบ”
    error = err instanceof Error ? err.message : "โหลดผลแบบสอบถามไม่สำเร็จ";
  }

  if (error) {
    return <DataError title="โหลดผลแบบสอบถามไม่สำเร็จ" message={error} envKey="MONGO_URI" />;
  }

  return <SurveyView responses={responses} />;
}
