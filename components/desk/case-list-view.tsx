import { CaseTable } from "@/components/desk/case-table";
import { ComplaintTypeButton } from "@/components/desk/complaint-type-modal";
import { NewCaseButton } from "@/components/desk/new-case-modal";
import { PageHead } from "@/components/desk/page-head";
import { DataError } from "@/components/ui/data-error";
import { dataErrorMessage, getCases } from "@/lib/cases";

/**
 * คิวเคสทั้งหมด — ใช้ทั้งที่ `/desk` และเป็นฉากหลังของ `/desk/cases/[id]`
 * เพื่อให้เปิดเคสแล้วรู้สึกเหมือน modal ลอยขึ้นมาบนตาราง ทั้งตอนคลิกจากตาราง
 * และตอนเปิด URL ตรง ๆ
 *
 * ดึงข้อมูลเองผ่าน `getCases()` ซึ่ง `cache()` ไว้ — เรียกซ้ำในหน้าเดียวกัน
 * (ตาราง + modal + กระดิ่งแจ้งเตือน) ยิง NCAC จริงแค่ครั้งเดียว
 */
export async function CaseListView() {
  let cases;
  try {
    cases = await getCases();
  } catch (err) {
    return (
      <div className="flex flex-col gap-5 animate-rise">
        <PageHead
          title="แจ้งข้อร้องเรียน"
          subtitle="ทุกเรื่องร้องเรียนที่ พจส. แจ้งเข้ามา"
          actions={
            <>
              <ComplaintTypeButton />
              <NewCaseButton />
            </>
          }
        />
        <DataError message={dataErrorMessage(err)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 animate-rise">
      <PageHead
        title="แจ้งข้อร้องเรียน"
        subtitle="คลิกที่แถวเพื่อเปิดรายละเอียดและดำเนินการ"
        actions={
          <>
            <ComplaintTypeButton />
            <NewCaseButton />
          </>
        }
      />
      <CaseTable cases={cases} />
    </div>
  );
}
