import { Screen } from "@/components/m/screen";
import { ServicesGrid } from "@/components/m/services-grid";
import { getMobileIdentity } from "@/lib/auth/session";
import { isOpenCase } from "@/lib/case-flow";
import { getCasesByDriver } from "@/lib/cases";

export const metadata = { title: "บริการองค์กร" };

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const me = await getMobileIdentity();
  const myCases = await getCasesByDriver(me.employeeId).catch(() => []);

  return (
    <Screen className="flex flex-col gap-4 px-5 pt-3 pb-6">
      <h1 className="text-[21px] font-semibold tracking-[-0.01em]">
        บริการองค์กร
      </h1>
      <ServicesGrid openCaseCount={myCases.filter(isOpenCase).length} />
    </Screen>
  );
}
