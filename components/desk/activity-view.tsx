import { ActivityLog } from "@/components/desk/activity-log";
import { PageHead } from "@/components/desk/page-head";
import { DataError } from "@/components/ui/data-error";
import { activityErrorMessage, getActivity } from "@/lib/activity";

const SUBTITLE =
  "บันทึกทุกครั้งที่มีคนทำอะไรกับคำร้อง — แจ้งเรื่อง มอบหมาย อนุมัติ ปฏิเสธ ปิด และลบ · รวมคำร้องที่ถูกลบไปแล้วด้วย";

/**
 * หน้าประวัติการทำงาน — อ่านจาก `complaint_logs` ของ NCAC ตรง ๆ
 *
 * แยกจากกระดิ่งแจ้งเตือนโดยตั้งใจ: กระดิ่งคือ **“ต้องทำอะไรต่อ”** (เกิน SLA /
 * รอฉันอนุมัติ / ยังไม่มอบหมาย) ส่วนหน้านี้คือ **“เกิดอะไรขึ้นไปแล้วบ้าง”**
 * ซึ่งไม่มีอะไรให้ลงมือทำ เอาไปปนกันจะทำให้เลขบนกระดิ่งไม่ได้แปลว่างานค้างอีกต่อไป
 */
export async function ActivityView() {
  let entries;
  try {
    entries = await getActivity();
  } catch (err) {
    return (
      <div className="flex flex-col gap-6 animate-rise">
        <PageHead title="Log" subtitle={SUBTITLE} />
        <DataError
          title="โหลด Log ไม่สำเร็จ"
          message={activityErrorMessage(err)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-rise">
      <PageHead title="Log" subtitle={SUBTITLE} />
      <ActivityLog entries={entries} />
    </div>
  );
}
