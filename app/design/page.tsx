import { KitView } from "@/app/design/_components/kit-view";

export const metadata = { title: "UI Kit" };

/**
 * `/design` — คู่มือ UI Kit ที่มีชีวิต (ต้นแบบ: Claude Design “HR Service UI Kit”)
 *
 * รวมของกลางทุกชิ้นที่หน้าจอใหม่ต้องหยิบใช้: ปุ่ม `btn-*` · ป้าย `chip-*` · ช่องกรอกจาก
 * `field.tsx` · ตาราง `bg-head` · หน้าว่าง · ตัวโหลด · กล่องแจ้งเตือนจาก `lib/swal.ts`
 *
 * **เปิดสาธารณะโดยตั้งใจ** (ไม่อยู่ใน matcher ของ `proxy.ts`) — ข้อมูลทั้งหน้าเป็นตัวอย่าง
 * ล้วน ไม่ดึงอะไรจาก NCAC/Mongo · ห้ามเอาข้อมูลจริงมาวางในหน้านี้
 */
export default function DesignPage() {
  return <KitView />;
}
