"use client";

import { useMemo, useRef } from "react";

import { SelectField, TextField, type SelectGroupOption, type SelectOption } from "@/components/ui/field";
import type { RegistryPlant } from "@/app/recruitment/_lib/requisitions/options";
import { OTHER } from "@/app/recruitment/_lib/requisitions/types";

/**
 * แพล้นท์ + ตำแหน่งของสระบุรี/บางปะกง — ดรอปดาวน์จากทะเบียนประวัติ พจส. (Bew 11 พ.ย. 2569)
 * ใช้ทั้งฟอร์มขอสรรหาและฟอร์มแก้คำขอ · คืนสองช่องเป็น fragment ให้วางลง grid ของฟอร์มแม่
 *
 * แพล้นท์จับกลุ่มตามลูกค้าในทะเบียน กลุ่มของลูกค้าที่เลือกขึ้นบน · เลือกแพล้นท์แล้วเติมตำแหน่งที่คน
 * ในแพล้นท์นั้นถือมากสุด (เฉพาะช่องที่ว่างหรือที่ระบบเติมไว้) · ไม่อยู่ในรายการ = “ระบุเอง…”
 */
export function RegistryPlantFields({
  idPrefix,
  rows,
  customer,
  plant,
  plantOther,
  position,
  positionOther,
  onPlant,
  onPlantOther,
  onPosition,
  onPositionOther,
}: {
  idPrefix: string;
  rows: RegistryPlant[];
  /** ชื่อลูกค้าตาม NCAC ที่เลือกไว้ */
  customer: string;
  plant: string;
  plantOther: string;
  position: string;
  positionOther: string;
  onPlant: (v: string) => void;
  onPlantOther: (v: string) => void;
  onPosition: (v: string) => void;
  onPositionOther: (v: string) => void;
}) {
  const auto = useRef("");
  const plantGroups = useMemo(() => groupPlants(rows, customer), [rows, customer]);
  const positionOptions = useMemo(() => groupPositions(rows, customer), [rows, customer]);

  function pickPlant(v: string) {
    onPlant(v);
    const next = v === OTHER ? "" : positionOfPlant(rows, v);
    if (next && (!position || position === auto.current)) onPosition(next);
    auto.current = next;
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <SelectField
          id={`${idPrefix}-plant`}
          label="แพล้นท์"
          placeholder="เลือก…"
          value={plant}
          onChange={pickPlant}
          groups={plantGroups}
          searchable
          searchPlaceholder="ค้นชื่อแพล้นท์…"
        />
        {plant === OTHER ? (
          <TextField
            id={`${idPrefix}-plant-other`}
            label="ระบุชื่อแพล้นท์"
            srLabel
            placeholder="ระบุชื่อแพล้นท์…"
            value={plantOther}
            onChange={onPlantOther}
          />
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <SelectField
          id={`${idPrefix}-position`}
          label="ตำแหน่ง"
          placeholder="เลือก…"
          value={position}
          onChange={onPosition}
          {...positionOptions}
        />
        {position === OTHER ? (
          <TextField
            id={`${idPrefix}-position-other`}
            label="ระบุตำแหน่ง"
            srLabel
            placeholder="ระบุตำแหน่ง…"
            value={positionOther}
            onChange={onPositionOther}
          />
        ) : null}
      </div>
    </>
  );
}

/**
 * ลูกค้าในทะเบียนเป็นชื่อย่อ (TDM · SCCC …) ส่วนช่องลูกค้าเป็นชื่อเต็มของ NCAC — จับคู่ด้วยคำในชื่อ
 * · ชื่อย่อที่ไม่อยู่ในตารางนี้เทียบแบบมีคำนี้อยู่ในชื่อ
 */
const CUSTOMER_HINT: Record<string, RegExp> = {
  TDM: /ทีดี\s*เอ็ม/,
  SCCC: /นครหลวง/,
  BTG: /เบทาโกร/,
  TFG: /ไทย\s*ฟู[๊้]ดส์/,
  "ALL NOW": /ออลล์\s*นาว/,
  DHL: /ดีเอชแอล/,
  "Linfox-BOF": /linfox/i,
};

export function isSameCustomer(ncac: string, registry: string): boolean {
  if (!ncac || !registry) return false;
  const hint = CUSTOMER_HINT[registry];
  return hint ? hint.test(ncac) : ncac.toLowerCase().includes(registry.toLowerCase());
}

/** ตำแหน่งที่คนในแพล้นท์นี้ถือมากสุด (`rows` เรียงจำนวนมาก → น้อยมาแล้ว) */
export function positionOfPlant(rows: RegistryPlant[], plant: string): string {
  return rows.find((r) => r.plant === plant && r.position)?.position ?? "";
}

/** ค่าที่ส่งขึ้นเซิร์ฟเวอร์ — “ระบุเอง” = ข้อความที่พิมพ์ */
export const pickedOrTyped = (picked: string, typed: string): string =>
  picked === OTHER ? typed.trim() : picked;

/** ค่าที่บันทึกไว้ → สถานะดรอปดาวน์ (ไม่อยู่ในรายการ = ระบุเอง + ข้อความเดิม) */
export function splitPicked(saved: string, listed: string[]): [string, string] {
  if (!saved || listed.includes(saved)) return [saved, ""];
  return [OTHER, saved];
}

function groupPlants(rows: RegistryPlant[], customer: string): SelectGroupOption[] {
  const byCustomer = new Map<string, { hit: boolean; count: number; plants: string[] }>();
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.plant)) continue;
    seen.add(r.plant);
    const name = r.customer || "ไม่ระบุลูกค้า";
    const g = byCustomer.get(name) ?? { hit: isSameCustomer(customer, r.customer), count: 0, plants: [] };
    g.count += r.count;
    g.plants.push(r.plant);
    byCustomer.set(name, g);
  }
  const groups = [...byCustomer.entries()]
    .sort(([, a], [, b]) => Number(b.hit) - Number(a.hit) || b.count - a.count)
    .map(([label, g]) => ({ label, options: g.plants.map((p) => ({ value: p, label: p })) }));
  return [...groups, { label: "อื่นๆ", options: [{ value: OTHER, label: "ระบุเอง…" }] }];
}

function groupPositions(
  rows: RegistryPlant[],
  customer: string,
): { options?: SelectOption[]; groups?: SelectGroupOption[] } {
  const count = new Map<string, number>();
  const hit = new Set<string>();
  for (const r of rows) {
    if (!r.position) continue;
    count.set(r.position, (count.get(r.position) ?? 0) + r.count);
    if (isSameCustomer(customer, r.customer)) hit.add(r.position);
  }
  const all = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => ({ value: p, label: p }));
  const other = { value: OTHER, label: "ระบุเอง…" };
  if (!hit.size) return { options: [...all, other] };
  return {
    groups: [
      { label: "ตำแหน่งของลูกค้านี้", options: all.filter((o) => hit.has(o.value)) },
      { label: "ตำแหน่งอื่น", options: [...all.filter((o) => !hit.has(o.value)), other] },
    ],
  };
}
