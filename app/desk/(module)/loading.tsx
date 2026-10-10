import { MascotLoader } from "@/components/ui/mascot";

/**
 * ระหว่างรอหน้าใต้ `/desk` — น้องมีนากระโดดกลางพื้นที่เนื้อหา
 *
 * หน้าในนี้เป็น `force-dynamic` ดึง NCAC ทุกครั้งที่เปิด · มีไฟล์นี้แล้ว Next prefetch
 * โครงนี้ไว้ล่วงหน้า กดเมนูแล้วสลับทันที แถบบน/แถบข้างยังกดต่อได้ระหว่างรอ
 * (ถ้าไม่มี จอจะค้างหน้าเดิมจนเซิร์ฟเวอร์เรนเดอร์เสร็จ ดูเหมือนกดไม่ติด)
 */
export default function DeskLoading() {
  return (
    <div className="grid min-h-[60dvh] place-items-center">
      <MascotLoader text="กำลังโหลดข้อมูล" />
    </div>
  );
}
