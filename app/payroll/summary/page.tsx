import type { Metadata } from "next";

import { SummaryView } from "@/components/payroll/summary-view";
import { getDeskIdentity } from "@/lib/auth/session";
import { canPassIntake } from "@/lib/payroll/approver";
import { initialPeriod } from "@/lib/payroll/period";

export const metadata: Metadata = {
  title: "สรุปรอบ",
};

/** สิทธิ์แจ้งฝ่ายตัดสินที่เซิร์ฟเวอร์แล้วส่งลงไปเป็น `boolean` — เหมือนหน้ารับข้อมูล */
export default async function PayrollSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const identity = await getDeskIdentity();
  const { period } = await searchParams;
  return (
    <SummaryView
      canPass={canPassIntake(identity)}
      identity={identity}
      initialPeriod={initialPeriod(Array.isArray(period) ? period[0] : period)}
    />
  );
}
