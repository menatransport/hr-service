import type { Metadata } from "next";

import { PayrollOverview } from "@/components/payroll/overview-view";

export const metadata: Metadata = {
  title: "ภาพรวมรอบจ่าย",
};

export default function PayrollHomePage() {
  return <PayrollOverview />;
}
