import { redirect } from "next/navigation";

/** ทะเบียน พจส. ไม่แยกสาขาแล้ว — ลิงก์เก่า `/desk/registry/**` ไปหน้าทะเบียนรวม */
export default function RegistryRedirect() {
  redirect("/recruitment/admin/drivers");
}
