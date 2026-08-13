import {
  Ban,
  BookOpen,
  BookUser,
  CalendarRange,
  Car,
  CircleAlert,
  ClipboardList,
  ClipboardX,
  Database,
  Fuel,
  Gift,
  HardHat,
  Inbox,
  Package,
  Receipt,
  Route,
  Scale,
  ShieldCheck,
  Tag,
  Timer,
  TriangleAlert,
  Truck,
  UserX,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * ชื่อไอคอนที่เก็บใน `complaint_master.icon` → คอมโพเนนต์ lucide จริง
 *
 * **ต้องเป็นแผนที่ตายตัว ไม่ใช่ `import * as lucide` แล้วหยิบด้วยชื่อ** — การหยิบ
 * แบบหลังทำให้ bundler รวมไอคอนทั้งไลบรารีเข้ามาในหน้า เพราะมันตัดของที่ไม่ได้ใช้
 * ไม่ได้ (ชื่อรู้ตอนรัน ไม่ใช่ตอน build)
 *
 * ไฟล์นี้ถูก import ได้ทั้ง server และ client — ห้ามใส่อะไรที่ผูกกับ Node
 */
const ICONS: Record<string, LucideIcon> = {
  Ban,
  BookOpen,
  BookUser,
  CalendarRange,
  Car,
  CircleAlert,
  ClipboardList,
  ClipboardX,
  Database,
  Fuel,
  Gift,
  HardHat,
  Inbox,
  Package,
  Receipt,
  Route,
  Scale,
  ShieldCheck,
  Tag,
  Timer,
  TriangleAlert,
  Truck,
  UserX,
  Users,
  Wallet,
  Wrench,
};

/** ไอคอนกลาง ๆ ที่ใช้เมื่อไม่ได้เลือก หรือเลือกชื่อที่ไม่มีในรายการนี้ */
export const FALLBACK_ICON: LucideIcon = Tag;

/**
 * ชื่อที่ไม่รู้จัก **ไม่ทำให้พัง** — ประเภทเรื่องถูกแก้ผ่านหน้าจอจัดการและอาจถูก
 * แก้จากที่อื่น (หรือ seed มาผิด) ค่าที่ไม่มีในแผนที่จึงต้องตกไปใช้ไอคอนกลาง
 * ไม่ใช่ทำให้ทั้งดรอปดาวน์เรนเดอร์ไม่ขึ้น
 */
export const complaintIcon = (name: string | null | undefined): LucideIcon =>
  (name && ICONS[name]) || FALLBACK_ICON;

/** รายชื่อให้ผู้ใช้เลือกในหน้าจอจัดการ — เรียงตามตัวอักษรเพื่อให้หาได้ */
export const COMPLAINT_ICON_NAMES: string[] = Object.keys(ICONS).sort();
