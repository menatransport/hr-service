import type { Metadata } from "next";

import { IntakeView } from "@/components/payroll/intake-view";

export const metadata: Metadata = {
  title: "กระดานรับไฟล์",
};

export default function PayrollIntakePage() {
  return <IntakeView />;
}
