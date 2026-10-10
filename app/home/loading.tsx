import { MascotLoader } from "@/components/ui/mascot";

/**
 * ระหว่างรอหน้าหลัก — พื้นหลังชุดเดียวกับ Home ให้ไม่วาบเป็นสีอื่นก่อนเนื้อหาขึ้น
 * (หน้าในใช้ `(module)/loading.tsx` ซึ่งอยู่ใต้เชลล์ที่มีแถบข้างแล้ว)
 */
export default function HomeLoading() {
  return (
    <div className="home-canvas grid min-h-dvh place-items-center">
      <MascotLoader text="กำลังเปิดหน้าหลัก" />
    </div>
  );
}
