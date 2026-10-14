import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contractText } from "@/lib/payroll/contract";

/**
 * ด่านกันการเปลี่ยนเงื่อนไขแบบเงียบ ๆ
 *
 * เงื่อนไขที่ฝ่ายอื่นมองเห็น (ทะเบียน · ผังคอลัมน์ · ทิศทางเงิน · รหัสวัน · ฟอร์มรวม)
 * ถูกเขียนเป็นข้อความแล้ว commit ไว้ที่ `contract.snapshot.txt` — แก้เงื่อนไขเมื่อไหร่
 * เทสต์นี้ล้มทันที พร้อมบอกบรรทัดที่เปลี่ยน ต้องรัน `npm run snapshot:payroll`
 * แล้ว commit ไฟล์ snapshot ไปด้วย ซึ่งทำให้ diff ของ PR แสดง "ผลกระทบกับคนใช้งาน"
 * ไม่ใช่แค่ "แก้โค้ด 1 บรรทัด"
 */
test("เงื่อนไขการรับข้อมูลตรงกับ snapshot ที่ commit ไว้", () => {
  const file = join(process.cwd(), "lib/payroll/contract.snapshot.txt");
  const saved = readFileSync(file, "utf8").split("\n");
  const now = contractText().split("\n");

  const changed = now
    .map((line, i) => (line === saved[i] ? null : `บรรทัด ${i + 1}\n  เดิม: ${saved[i] ?? "(ไม่มี)"}\n  ใหม่: ${line}`))
    .filter(Boolean);

  assert.deepEqual(
    changed,
    [],
    `เงื่อนไขเปลี่ยนจาก snapshot — ถ้าตั้งใจ ให้รัน \`npm run snapshot:payroll\` แล้ว commit ไฟล์ไปด้วย\n${changed.join("\n")}`,
  );
  assert.equal(now.length, saved.length, "จำนวนบรรทัดต้องเท่ากัน");
});
