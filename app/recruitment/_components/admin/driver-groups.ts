import type { SelectGroupOption, SelectOption } from "@/components/ui/field";
import type { DriverOption } from "@/app/recruitment/_lib/requisitions/options";

/** กลุ่มรายชื่อ = แท็บสาขาของทะเบียน พจส. (ลาดกระบัง | สระบุรี + บางปะกง) */
const SITE_GROUPS: { label: string; branches: string[] }[] = [
  { label: "ลาดกระบัง", branches: ["ลาดกระบัง"] },
  { label: "สระบุรี + บางปะกง", branches: ["สระบุรี", "บางปะกง"] },
];

const pick = (d: DriverOption): SelectOption => ({
  value: d.value,
  label: `${d.value} · ${d.label.split(" — ")[0]}${d.resigned ? " (พ้นสภาพ)" : ""}`,
});

/**
 * ช่อง “พจส. ที่จะแทน” — รายชื่อจากทะเบียนประวัติ พจส. **เฉพาะแท็บสาขาที่เลือก** รวมคนพ้นสภาพ (Bew 18 พ.ย. 2569)
 * · `drivers` = ยังทำงานอยู่ + พ้นสภาพ (`resigned`) — แต่ละสาขาแยกหัว ปฏิบัติงาน / พ้นสภาพ
 * · `branches` = สาขาของแท็บ/สาขาที่เลือก → ตกกลุ่มเดียว = เฉพาะกลุ่มนั้น · ยังไม่รู้สาขา = ทุกกลุ่ม
 * · `keep` = ค่าที่ถืออยู่แต่ไม่อยู่ในรายการ (เปลี่ยนสาขาทีหลัง · ไม่อยู่ในทะเบียนแล้ว) — ต่อท้ายให้ช่องยังโชว์ชื่อ
 */
export function driverOptionsForSite(
  drivers: DriverOption[],
  branches: readonly string[],
  keep?: SelectOption,
): SelectGroupOption[] {
  const hit = SITE_GROUPS.filter((g) => g.branches.some((b) => branches.includes(b)));
  const sites = hit.length === 1 ? hit : SITE_GROUPS;
  const prefix = (g: (typeof SITE_GROUPS)[number]) => (sites.length > 1 ? `${g.label} · ` : "");

  const groups: SelectGroupOption[] = [];
  for (const site of sites) {
    const mine = drivers.filter((d) => site.branches.includes(d.branch ?? ""));
    for (const [label, list] of [
      ["ปฏิบัติงาน", mine.filter((d) => !d.resigned)],
      ["พ้นสภาพ", mine.filter((d) => d.resigned)],
    ] as const)
      if (list.length) groups.push({ label: `${prefix(site)}${label} · ${list.length} คน`, options: list.map(pick) });
  }

  const rest =
    sites.length > 1
      ? drivers.filter((d) => !SITE_GROUPS.some((g) => g.branches.includes(d.branch ?? ""))).map(pick)
      : [];
  if (keep?.value && !groups.some((g) => g.options.some((o) => o.value === keep.value)) && !rest.some((o) => o.value === keep.value))
    rest.push(keep);
  return rest.length ? [...groups, { label: "ไม่ระบุสาขา", options: rest }] : groups;
}
