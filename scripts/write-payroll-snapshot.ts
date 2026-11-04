import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { contractText } from "@/lib/payroll/contract";

/**
 * เขียน `lib/payroll/contract.snapshot.txt` ใหม่ — รันเมื่อ **ตั้งใจ** เปลี่ยนเงื่อนไข
 * แล้ว commit ไฟล์ snapshot ไปพร้อมกับการแก้ เพื่อให้ diff ของ PR แสดงผลกระทบจริง
 */
const out = join(process.cwd(), "lib/payroll/contract.snapshot.txt");
writeFileSync(out, contractText(), "utf8");
console.log(`เขียน snapshot ของสัญญารับข้อมูลแล้ว → ${out}`);
