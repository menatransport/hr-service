import Link from "next/link";
import { Plus } from "lucide-react";

import { CaseFilter } from "@/components/m/case-filter";
import { Screen } from "@/components/m/screen";
import { DataError } from "@/components/ui/data-error";
import { getMobileIdentity } from "@/lib/auth/session";
import { dataErrorMessage, getCasesByDriver } from "@/lib/cases";
import type { HrCase } from "@/lib/types";

export const metadata = { title: "เคสของฉัน" };

export const dynamic = "force-dynamic";

export default async function MyCasesPage() {
  let myCases: HrCase[] = [];
  let error: string | null = null;
  try {
    myCases = await getCasesByDriver((await getMobileIdentity()).employeeId);
  } catch (err) {
    error = dataErrorMessage(err);
  }

  return (
    <Screen className="flex flex-col gap-4 px-5 pt-3 pb-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[21px] font-semibold tracking-[-0.01em]">
          เคสของฉัน
        </h1>
        <Link
          href="/m/cases/new"
          className="flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-[12.5px] font-medium text-primary-content transition-transform active:scale-[0.98]"
        >
          <Plus size={15} strokeWidth={2.2} aria-hidden />
          แจ้งเรื่อง
        </Link>
      </div>
      {error ? <DataError message={error} /> : <CaseFilter cases={myCases} />}
    </Screen>
  );
}
