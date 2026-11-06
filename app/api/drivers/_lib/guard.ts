import { forbidden } from "@/app/api/_lib/respond";
import { canAccessMenu } from "@/lib/menu-permissions";

/**
 * ด่านเขียนทะเบียนประวัติ พจส. — สิทธิ์ย่อย “↳ ประวัติ” (`registry-profile`) ที่ /desk/permissions
 * ตั้ง “ไม่เห็น” = ทะเบียน + หน้าประวัติอ่านอย่างเดียว: เพิ่มพนักงาน · นำเข้า/Sync · รูป · สถานะ · แก้ประวัติ · เอกสาร ไม่ได้
 * (Bew 5 พ.ย. 2569) · หน้าจอซ่อนปุ่มอยู่แล้ว ตัวนี้กันคนยิง API ตรง
 * (เปิดหน้าประวัติได้ แต่ไม่เห็นแท็บเอกสาร · ไฟล์เอกสารกันที่ `GET …/documents/{fileId}` · 6 พ.ย. 2569)
 *
 * คืน `null` = ผ่าน · คืน response 403 = ส่งกลับไปเลย
 * อ่านสิทธิ์ไม่สำเร็จ = ผ่าน (ตาม `getHiddenMenuIds()`) — ล้มเหลวแล้วเปิด ไม่ล็อกทุกคนออกเพราะฐานสะดุด
 */
export async function registryWriteDenied() {
  if (await canAccessMenu("registry-profile")) return null;
  return forbidden("ฝ่าย/แผนกของคุณดูทะเบียนประวัติได้อย่างเดียว — ไม่มีสิทธิ์เพิ่มหรือแก้ไขข้อมูล");
}
