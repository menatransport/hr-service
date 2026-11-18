"use client";

import { useEffect, useMemo, useState } from "react";
import { Bookmark, Loader2 } from "lucide-react";

import { SelectField, TextField, type SelectGroupOption } from "@/components/ui/field";
import { ModalShell } from "@/components/ui/modal-shell";
import { requestJson } from "@/lib/http";
import { groupCustomers, groupPlants } from "@/app/recruitment/_components/admin/requisition-form";
import type { RequisitionOptions } from "@/app/recruitment/_lib/requisitions/options";
import { OTHER } from "@/app/recruitment/_lib/requisitions/types";
import { RECRUIT_SITE_BRANCHES, type RecruitSite } from "@/app/recruitment/_lib/sites";
import { RESERVE_TEXT_MAX, type ApplicationSummary } from "@/app/recruitment/_lib/types";

/**
 * กล่องย้ายเป็น “สำรอง” (Bew 18 พ.ย. 2569) — ลาดกระบังระบุลูกค้า + แพล้นท์ · สระบุรี+บางปะกงระบุลูกค้าอย่างเดียว
 * · ไม่ผูก JR · รายการชุดเดียวกับฟอร์มขอสรรหา (`/api/recruitment/requisitions/options`) โหลดครั้งแรกที่เปิดแล้วจำไว้
 * · ไม่อยู่ในรายการ = “อื่นๆ (ระบุเอง)” · อ่านรายการไม่ได้ = พิมพ์เอง
 */

let cached: Promise<RequisitionOptions> | null = null;
function loadOptions(): Promise<RequisitionOptions> {
  cached ??= requestJson<RequisitionOptions>("/api/recruitment/requisitions/options", {}, "โหลดรายชื่อลูกค้าไม่สำเร็จ").catch(
    (err) => {
      cached = null;
      throw err;
    },
  );
  return cached;
}

/** ค่าที่ตั้งไว้แล้ว → ค่าในดรอปดาวน์ · ไม่อยู่ในรายการ = “อื่นๆ” + ช่องพิมพ์ */
function splitPicked(value: string, known: string[]): [string, string] {
  if (!value) return ["", ""];
  return known.includes(value) ? [value, ""] : [OTHER, value];
}

/** ลาดกระบัง = ลูกค้างานโม่ (`CUSTOMERS`) · สระบุรี+บางปะกง = ลูกค้าในทะเบียน พจส. ของสองสาขา แยกกลุ่มตามสาขา · ว่าง = `null` (พิมพ์เอง) */
function customerGroupsOf(options: RequisitionOptions, mixer: boolean) {
  if (mixer) return groupCustomers(options, RECRUIT_SITE_BRANCHES.latkrabang[0]);
  const other = { value: OTHER, label: "อื่นๆ (ระบุเอง)" };
  const groups = RECRUIT_SITE_BRANCHES["saraburi-bangpakong"]
    .map((b) => ({ label: `ลูกค้าสาขา${b}`, options: (options.branchCustomers[b] ?? []).map((c) => ({ value: c, label: c })) }))
    .filter((g) => g.options.length > 0);
  return groups.length ? { groups: [...groups, { label: "อื่น", options: [other] }] } : null;
}

const flat = (g: { options?: { value: string }[]; groups?: SelectGroupOption[] }) =>
  [...(g.options ?? []), ...(g.groups ?? []).flatMap((x) => x.options)].map((o) => o.value).filter((v) => v !== OTHER);

export function ReservePrompt({
  candidate,
  site,
  onConfirm,
  onClose,
}: {
  candidate: ApplicationSummary;
  site: RecruitSite;
  onConfirm: (customer: string, plant: string) => void;
  onClose: () => void;
}) {
  const mixer = site === "latkrabang";
  const branch = RECRUIT_SITE_BRANCHES.latkrabang[0];
  const [options, setOptions] = useState<RequisitionOptions | null>(null);
  const [failed, setFailed] = useState(false);
  const [customer, setCustomer] = useState("");
  const [customerOther, setCustomerOther] = useState("");
  const [plant, setPlant] = useState("");
  const [plantOther, setPlantOther] = useState("");

  useEffect(() => {
    let live = true;
    loadOptions().then(
      (o) => {
        if (!live) return;
        setOptions(o);
        /* เปิดซ้ำบนใบที่สำรองอยู่แล้ว = ขึ้นค่าเดิม (ไม่อยู่ในรายการ = “อื่นๆ” + ช่องพิมพ์) */
        const groups = customerGroupsOf(o, mixer);
        const [c, co] = groups ? splitPicked(candidate.reserveCustomer, flat(groups)) : [candidate.reserveCustomer, ""];
        const [p, po] = splitPicked(candidate.reservePlant, o.plants.map((x) => x.value));
        setCustomer(c);
        setCustomerOther(co);
        setPlant(p);
        setPlantOther(po);
      },
      () => {
        if (!live) return;
        setFailed(true);
        setCustomer(candidate.reserveCustomer);
        setPlant(candidate.reservePlant);
      },
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- โหลดครั้งเดียวตอนเปิดกล่อง
  }, []);

  const customerGroups = useMemo(() => (options ? customerGroupsOf(options, mixer) : null), [options, mixer]);

  const plantGroups = useMemo(
    () => (options && mixer ? groupPlants(options, branch, customer === OTHER ? "" : customer) : null),
    [options, mixer, branch, customer],
  );

  const loading = !options && !failed;
  /* ไม่มีรายการ (โหลดไม่ได้ / ทะเบียนว่าง) = ช่องพิมพ์ตรง ๆ */
  const typedCustomer = !customerGroups;
  const typedPlant = !plantGroups;
  const customerValue = (typedCustomer ? customer : customer === OTHER ? customerOther : customer).trim();
  const plantValue = mixer ? (typedPlant ? plant : plant === OTHER ? plantOther : plant).trim() : "";
  const ready = !loading && Boolean(customerValue) && (!mixer || Boolean(plantValue));

  const cut = (set: (v: string) => void) => (v: string) => set(v.slice(0, RESERVE_TEXT_MAX));

  return (
    <ModalShell
      title="ย้ายเป็นสำรอง"
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <span>{candidate.fullName}</span>
          <span className="font-mono text-11-5 tracking-wider text-primary">{candidate.ref}</span>
        </span>
      }
      onClose={onClose}
      width="440px"
      tone="plain"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-field px-3 py-2 text-12-5 text-mut transition-colors hover:text-ink"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={() => onConfirm(customerValue, plantValue)}
            disabled={!ready}
            className="btn-pri flex items-center gap-1.5 px-4 py-2 text-12-5 font-medium disabled:opacity-45"
          >
            <Bookmark size={14} strokeWidth={2} aria-hidden />
            ยืนยันสำรอง
          </button>
        </div>
      }
    >
      <p className="text-12-5 leading-relaxed text-mut">
        {mixer ? "ระบุลูกค้าและแพล้นท์ที่สำรองไว้" : "ระบุลูกค้าที่สำรองไว้"} · ไม่ต้องผูก JR
        {candidate.status !== "reserve" ? " — ใบที่ผูก JR อยู่จะถูกปลด และ JR กลับไปรอสรรหา" : ""}
      </p>

      {loading ? (
        <span className="flex items-center gap-2 text-12-5 text-mut">
          <Loader2 size={14} className="animate-spin" aria-hidden />
          กำลังโหลดรายชื่อลูกค้า…
        </span>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            {typedCustomer ? (
              <TextField id="reserve-customer" label="ลูกค้า" placeholder="ระบุชื่อลูกค้า…" value={customer} onChange={cut(setCustomer)} />
            ) : (
              <>
                <SelectField
                  id="reserve-customer"
                  label="ลูกค้า"
                  placeholder="เลือก…"
                  value={customer}
                  onChange={setCustomer}
                  {...customerGroups}
                  searchable
                  searchPlaceholder="ค้นชื่อลูกค้า…"
                />
                {customer === OTHER ? (
                  <TextField
                    id="reserve-customer-other"
                    label="ระบุชื่อลูกค้า"
                    srLabel
                    placeholder="ระบุชื่อลูกค้า…"
                    value={customerOther}
                    onChange={cut(setCustomerOther)}
                  />
                ) : null}
              </>
            )}
          </div>

          {mixer ? (
            <div className="flex flex-col gap-2">
              {typedPlant ? (
                <TextField id="reserve-plant" label="แพล้นท์" placeholder="ระบุชื่อแพล้นท์…" value={plant} onChange={cut(setPlant)} />
              ) : (
                <>
                  <SelectField
                    id="reserve-plant"
                    label="แพล้นท์"
                    placeholder="เลือก…"
                    value={plant}
                    onChange={setPlant}
                    {...plantGroups}
                    searchable
                    searchPlaceholder="ค้นชื่อแพล้นท์…"
                  />
                  {plant === OTHER ? (
                    <TextField
                      id="reserve-plant-other"
                      label="ระบุชื่อแพล้นท์"
                      srLabel
                      placeholder="ระบุชื่อแพล้นท์…"
                      value={plantOther}
                      onChange={cut(setPlantOther)}
                    />
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </div>
      )}
    </ModalShell>
  );
}
