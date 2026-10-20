import { notFound } from "next/navigation";

import { DataError } from "@/components/ui/data-error";
import { OnboardingJourney } from "@/app/recruitment/_components/admin/onboarding-journey";
import { getJourney, type Journey } from "@/app/recruitment/_lib/requisitions/onboarding-store";
import { personName } from "@/app/recruitment/_lib/requisitions/types";

/**
 * เส้นทางของ พจส.ใหม่ หนึ่งคน — `id` คือ `_id` ของคำขอสรรหา (1 คำขอ = 1 คน)
 * · อ่านทุกแหล่งพร้อมกันใน `getJourney()` · ไม่พบคำขอ = 404 · ฐานล่ม = `DataError`
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/recruitment/admin/onboarding/[id]">) {
  const { id } = await props.params;
  try {
    const journey = await getJourney(id);
    return { title: journey ? personName(journey.record) || journey.record.code : "ไม่พบคำขอนี้" };
  } catch {
    return { title: "เส้นทาง พจส.ใหม่" };
  }
}

export default async function OnboardingJourneyPage(props: PageProps<"/recruitment/admin/onboarding/[id]">) {
  const { id } = await props.params;

  let journey: Journey | null;
  try {
    journey = await getJourney(id);
  } catch (err) {
    return (
      <div className="mx-auto max-w-xl animate-rise py-6">
        <DataError
          title="โหลดเส้นทาง พจส.ใหม่ไม่สำเร็จ"
          envKey="MONGO_URI"
          message={err instanceof Error ? err.message : "เชื่อมต่อฐานข้อมูลไม่สำเร็จ"}
        />
      </div>
    );
  }

  if (!journey) notFound();
  return <OnboardingJourney journey={journey} />;
}
