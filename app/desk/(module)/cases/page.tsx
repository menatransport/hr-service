import { CaseListView } from "@/components/desk/case-list-view";

export const metadata = { title: "ข้อร้องเรียน" };

/** คิวเคสมาจาก NCAC API ทุกครั้งที่เปิดหน้า — ห้าม prerender ทิ้งไว้ */
export const dynamic = "force-dynamic";

/**
 * `?manage=type|cause` เปิดกล่องจัดการ master ค้างไว้ตั้งแต่แรก — ทางเข้าจากเมนู
 * “ประเภทเรื่อง & สาเหตุ” ของกลุ่ม HR MASTER บนหน้า Home (`lib/modules.ts`)
 */
export default async function DeskCasesPage(props: PageProps<"/desk/cases">) {
  const { manage } = await props.searchParams;
  return <CaseListView manage={manage === "type" || manage === "cause" ? manage : undefined} />;
}
