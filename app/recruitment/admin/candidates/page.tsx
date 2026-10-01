import { redirect } from "next/navigation";

import { ADMIN_ROOT } from "@/app/recruitment/_lib/admin-nav";

/**
 * ผู้สมัครย้ายไปเป็น **แท็บหนึ่งของหน้าขอสรรหา** แล้ว (22 ก.ย. 2026) —
 * เส้นทางเดิมจึงเหลือหน้าที่เดียวคือส่งต่อ
 *
 * **อย่าลบทิ้ง** ลิงก์เก่าที่คนบุ๊กมาร์กไว้ ประวัติเบราว์เซอร์ และลิงก์ที่เคยส่ง
 * กันในแชท ยังชี้มาที่นี่อยู่ · `?ref=` ต้องส่งต่อไปด้วยเพราะมันคือสิ่งเดียวที่
 * ทำให้กดจากคิวงานแล้วไปถึงแถวที่ต้องการเลย
 */

export const dynamic = "force-dynamic";

export default async function CandidatesRedirect({
  searchParams,
}: PageProps<"/recruitment/admin/candidates">) {
  const params = await searchParams;
  const ref = typeof params.ref === "string" ? params.ref : "";

  const query = new URLSearchParams({ tab: "candidates" });
  if (ref) query.set("ref", ref);

  redirect(`${ADMIN_ROOT}/requisitions?${query}`);
}
