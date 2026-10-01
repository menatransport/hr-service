import { PageHead } from "@/components/desk/page-head";

/**
 * หน้าภาพรวมรอบจ่าย — **ยังว่างโดยตั้งใจ**
 *
 * เจ้าของงานสั่งให้เหลือแค่โครงเมนูไว้ก่อน (12 ก.ย. 2569) เนื้อหาในหน้าจะออกแบบทีหลัง
 * อย่าใส่ข้อมูลตัวอย่างหรือการ์ดตัวเลขลงมาเองจนกว่าจะได้โจทย์
 */
export function PayrollOverview() {
  return (
    <div className="animate-rise flex flex-col gap-5">
      <PageHead title="ภาพรวมรอบจ่าย" />
    </div>
  );
}
