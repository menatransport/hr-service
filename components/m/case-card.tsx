import Link from "next/link";

import { StatusBadge } from "@/components/ui/status-badge";
import { StepBar } from "@/components/ui/step-bar";
import {
  TOTAL_STEPS,
  departmentLabel,
  formatShort,
  isSlaBreached,
  statusMeta,
} from "@/lib/case-flow";
import type { HrCase } from "@/lib/types";

export function CaseCard({
  hrCase,
  showDepartment = false,
}: {
  hrCase: HrCase;
  showDepartment?: boolean;
}) {
  const overdue = isSlaBreached(hrCase);

  return (
    <Link
      href={`/m/cases/${hrCase.trackingNo}`}
      className="flex flex-col gap-2.5 rounded-box border border-line bg-base-100 p-3.5 transition-[border-color,transform] hover:border-primary/40 active:scale-[0.995]"
    >
      <div className="flex items-start justify-between gap-2.5">
        <span className="text-sm font-medium text-pretty">{hrCase.subject}</span>
        <StatusBadge status={hrCase.status} short />
      </div>
      <span className="text-[12.5px] text-mut">
        {hrCase.trackingNo} · อัปเดต {formatShort(hrCase.updatedAt)}
        {showDepartment ? ` · ${departmentLabel(hrCase.departmentId)}` : ""}
      </span>
      <StepBar filled={statusMeta[hrCase.status].step} total={TOTAL_STEPS} />
      {overdue ? (
        <span className="text-[11.5px] text-sla">เกินเวลาตอบกลับที่กำหนด</span>
      ) : null}
    </Link>
  );
}
