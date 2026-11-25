"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  BadgeCheck,
  Bike,
  CarFront,
  Loader2,
  Send,
  TriangleAlert,
  Truck,
} from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { ImageUploadField } from "@/components/ui/image-upload-field";
import { DateField, SelectField, TextField } from "@/components/ui/field";
import { ModalShell } from "@/components/ui/modal-shell";
import type { SelectGroupOption, SelectOption } from "@/components/ui/field";
import {
  EMPTY_VEHICLE,
  KIND_LABEL,
  OWNERSHIP,
  PROVINCES,
  SITES,
  plateKey,
  type Ownership,
  type ParkingVehicle,
  type SiteCode,
  type VehicleInput,
  type VehicleKind,
} from "@/lib/parking/types";
import {
  OTHER,
  brandGroups,
  colorOptions,
  isKnownBrand,
  isKnownColor,
  isKnownModel,
  modelOptions,
} from "@/lib/parking/vehicle-catalog";

import { DrawerSection } from "../../rentals/_components/shared";
import { lookupEmployee, type EmployeeLookup } from "../actions";
import { PermitCard } from "./permit-card";

export type VehicleDraft = Omit<ParkingVehicle, "id" | "createdAt">;

const KIND_ICON: Record<VehicleKind, typeof CarFront> = {
  car: CarFront,
  motorcycle: Bike,
  other: Truck,
};

/**
 * ฟอร์มลงทะเบียนรถ (ช่อง ① ของบอร์ด) — กรอกจากบนลงล่างตามที่พนักงานมีข้อมูลในมือ
 * ประเภทรถ → ทะเบียน → ผู้รับผิดชอบ → รูป · **บัตรตัวอย่างบนสุดเปลี่ยนตามที่พิมพ์ทันที** ให้เห็นผลก่อนส่ง
 *
 * **เป็นกล่อง Dialog กลางจอ ไม่ใช่แผงข้าง** (Bew 24 พ.ย. 2569) — จอกว้าง: ซ้ายบัตรตัวอย่างค้างไว้ · ขวาฟอร์ม
 * จอแคบ: บัตรอยู่บนสุด
 *
 * ส่ง `initial` = แก้ไขคำขอที่ถูกส่งกลับ (สถานะกลับเป็น “รอตรวจ” เมื่อส่งใหม่)
 */
export function RegisterDrawer({
  initial,
  prefill,
  vehicles,
  onClose,
  onSubmit,
}: {
  initial?: ParkingVehicle;
  /** ค่าเริ่มต้นของคำขอใหม่ — หน้าผู้ใช้เติมรหัส/ชื่อ/สังกัด/ศูนย์ของคนที่ล็อกอินให้ */
  prefill?: Partial<VehicleDraft>;
  vehicles: ParkingVehicle[];
  onClose: () => void;
  /** คืน `true` = บันทึกสำเร็จ (ผู้เรียกปิด/เปลี่ยนกล่องเอง) · `false` = เซิร์ฟเวอร์ปฏิเสธ กล่องค้างไว้ให้แก้ */
  onSubmit: (input: VehicleInput) => Promise<boolean>;
}) {
  const [d, setD] = useState<VehicleDraft>(() =>
    initial ? { ...initial } : { ...EMPTY_VEHICLE, ...prefill },
  );
  const [tried, setTried] = useState(false);

  /* รหัสพนักงาน → ดึงชื่อ/สังกัด/ศูนย์จาก NCAC (หน่วง 450ms หลังพิมพ์ · คำตอบเก่าที่มาช้าถูกทิ้งด้วย `seq`) */
  const [who, setWho] = useState<Who>(() =>
    startsLookupable(initial, prefill) ? { state: "loading" } : { state: "idle" },
  );
  const timer = useRef<number | undefined>(undefined);
  const seq = useRef(0);
  const schedule = (id: string) => {
    window.clearTimeout(timer.current);
    const n = ++seq.current;
    timer.current = window.setTimeout(async () => {
      const r = await lookupEmployee(id);
      if (n !== seq.current) return;
      if (r.ok) {
        setWho({ state: "found", data: r });
        setD((cur) => ({
          ...cur,
          ownerId: r.employeeId,
          ownerName: r.name,
          department: [r.department, r.division].filter(Boolean).join(" · "),
          // ศูนย์ที่จอดตามที่ทำงาน เฉพาะคำขอใหม่ — คำขอเก่าอาจตั้งใจเลือกศูนย์อื่นไว้
          site: initial ? cur.site : r.site,
        }));
      } else setWho({ state: r.reason === "not-found" ? "missing" : "error", message: r.message });
    }, 450);
  };
  const changeOwnerId = (id: string) => {
    // เปลี่ยนรหัสหลังเจอคนแล้ว = ชื่อ/สังกัดเดิมเป็นของอีกคน ล้างทิ้งก่อนค้นใหม่
    if (who.state === "found") setD((cur) => ({ ...cur, ownerId: id, ownerName: "", department: "" }));
    else set("ownerId", id);
    if (LOOKUPABLE.test(id.trim())) {
      setWho({ state: "loading" });
      schedule(id.trim());
    } else {
      window.clearTimeout(timer.current);
      seq.current++;
      setWho({ state: "idle" });
    }
  };
  const lookupOnOpen = useEffectEvent(() => {
    if (d.ownership !== "visitor" && LOOKUPABLE.test(d.ownerId.trim())) schedule(d.ownerId.trim());
  });
  useEffect(() => {
    lookupOnOpen();
    return () => window.clearTimeout(timer.current);
  }, []);
  const filled = d.ownership !== "visitor" && who.state === "found";
  const set = <K extends keyof VehicleDraft>(k: K, val: VehicleDraft[K]) =>
    setD((cur) => ({ ...cur, [k]: val }));

  const dup = d.plate.trim()
    ? vehicles.find(
        (v) =>
          v.id !== initial?.id &&
          v.status !== "cancelled" &&
          plateKey(v.plate, v.province) === plateKey(d.plate, d.province),
      )
    : undefined;

  const missing = [
    !d.plate.trim() && "ทะเบียนรถ",
    !d.brand.trim() && "ยี่ห้อ",
    !d.ownerName.trim() &&
      (d.ownership === "visitor" ? "ชื่อผู้มาติดต่อ / บริษัท" : "ชื่อ–นามสกุล"),
    d.ownership !== "visitor" && !d.ownerId.trim() && "รหัสพนักงาน",
    d.ownership !== "visitor" && d.ownerId.trim() && who.state === "missing" && "รหัสพนักงานที่ถูกต้อง",
    d.ownership !== "visitor" && who.state === "loading" && "รอค้นข้อมูลพนักงาน",
    d.ownership !== "visitor" && who.state === "found" && who.data.inactive && "พนักงานที่ยังทำงานอยู่",
    !d.phone.trim() && "เบอร์ติดต่อ",
    d.ownership === "company" && !d.assetNo.trim() && "เลขทรัพย์สิน",
    d.ownership === "visitor" && !d.validUntil && "วันหมดอายุบัตร",
    !d.photo && "รูปถ่ายรถ",
  ].filter(Boolean) as string[];

  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setTried(true);
    if (missing.length || dup || saving) return;
    setSaving(true);
    try {
      await onSubmit({
        ownership: d.ownership,
        kind: d.kind,
        plate: d.plate,
        province: d.province,
        brand: d.brand,
        model: d.model,
        color: d.color,
        photo: d.photo,
        assetNo: d.assetNo,
        ownerId: d.ownerId,
        ownerName: d.ownerName,
        department: d.department,
        site: d.site,
        phone: d.phone,
        validUntil: d.validUntil,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title={initial ? "แก้ไขคำขอลงทะเบียน" : "ลงทะเบียนรถ"}
      subtitle="กรอกครั้งเดียว HR ตรวจกรรมสิทธิ์แล้วออกบัตรจอดให้"
      width="1000px"
      tone="form"
      onClose={onClose}
      footer={
        <>
          {tried && (missing.length > 0 || dup) ? (
            <p
              role="alert"
              className="mr-auto flex items-center gap-1.5 text-12 text-alert"
            >
              <TriangleAlert size={14} aria-hidden />
              {dup ? "ทะเบียนนี้ลงไว้แล้ว" : `ยังขาด ${missing.length} ช่อง`}
            </p>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost px-4 py-2 text-13"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="btn-pri inline-flex items-center gap-1.5 px-4 py-2 text-13 disabled:opacity-60"
          >
            {saving ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Send size={14} aria-hidden />}
            {saving ? "กำลังส่ง…" : "ส่งให้ HR ตรวจ"}
          </button>
        </>
      }
    >
      <div className="grid flex-none lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <aside className="border-b border-line bg-soft/60 px-5 py-5 lg:border-r lg:border-b-0 lg:px-7 lg:py-7">
          <div className="lg:sticky lg:top-7">
            <p className="mb-3 text-12 font-semibold text-primary">ตัวอย่างบัตร</p>
            <div className="mx-auto max-w-[400px]">
              <PermitCard v={d} />
            </div>
            <p className="mt-3 text-11-5 leading-relaxed text-mut">
              บัตรเปลี่ยนตามที่กรอกทันที · รหัสบัตรและ QR ออกจริงเมื่อ HR อนุมัติ
            </p>
          </div>
        </aside>

        <div className="px-5 py-5 lg:px-7 lg:py-6">
          <DrawerSection title="1 · ประเภทรถ">
            <div
              role="radiogroup"
              aria-label="ประเภทและกรรมสิทธิ์รถ"
              className="grid grid-cols-3 gap-2"
            >
              {(Object.keys(OWNERSHIP) as Ownership[]).map((o) => {
                const on = d.ownership === o;
                return (
                  <button
                    key={o}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => set("ownership", o)}
                    className={`flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      on
                        ? "border-primary bg-soft ring-1 ring-primary"
                        : "border-line hover:border-line-strong"
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-13 font-semibold">
                      <span
                        aria-hidden
                        className={`size-2 rounded-full ${DOT[o]}`}
                      />
                      {OWNERSHIP[o].label}
                    </span>
                    <span className="text-11-5 leading-snug text-mut">
                      {OWNERSHIP[o].hint}
                    </span>
                  </button>
                );
              })}
            </div>
            <div
              role="radiogroup"
              aria-label="ประเภทยานพาหนะ"
              className="flex flex-wrap gap-2"
            >
              {(Object.keys(KIND_LABEL) as VehicleKind[]).map((k) => {
                const Icon = KIND_ICON[k];
                const on = d.kind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() =>
                      setD((cur) =>
                        isKnownBrand(k, cur.brand)
                          ? { ...cur, kind: k, model: isKnownModel(k, cur.brand, cur.model) ? cur.model : "" }
                          : { ...cur, kind: k, brand: "", model: "" },
                      )
                    }
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-12-5 transition-colors ${
                      on
                        ? "border-primary bg-primary text-primary-content"
                        : "border-line text-ink hover:border-line-strong"
                    }`}
                  >
                    <Icon size={15} aria-hidden /> {KIND_LABEL[k]}
                  </button>
                );
              })}
            </div>
          </DrawerSection>

          <DrawerSection title="2 · ข้อมูลรถ">
            <div className="grid grid-cols-2 gap-3">
              <TextField
                id="pk-plate"
                label="ทะเบียนรถ"
                placeholder="1กข 1234"
                value={d.plate}
                onChange={(v) => set("plate", v)}
              />
              <SelectField
                id="pk-province"
                label="จังหวัด"
                value={d.province}
                onChange={(v) => set("province", v)}
                options={PROVINCES.map((p) => ({ value: p, label: p }))}
                searchable
                searchPlaceholder="ค้นหาจังหวัด…"
              />
              <PickOrType
                key={`brand-${d.kind}`}
                id="pk-brand"
                label="ยี่ห้อ"
                value={d.brand}
                known={isKnownBrand(d.kind, d.brand)}
                groups={brandGroups(d.kind)}
                placeholder="เลือกยี่ห้อ"
                typePlaceholder="พิมพ์ยี่ห้อ"
                onChange={(v) => setD((cur) => ({ ...cur, brand: v, model: "" }))}
              />
              <PickOrType
                key={`model-${d.kind}-${d.brand}`}
                id="pk-model"
                label="รุ่น"
                optional
                readOnly={!d.brand}
                value={d.model}
                known={isKnownModel(d.kind, d.brand, d.model)}
                options={modelOptions(d.kind, d.brand)}
                placeholder={d.brand ? "เลือกรุ่น" : "เลือกยี่ห้อก่อน"}
                typePlaceholder="พิมพ์รุ่น"
                onChange={(v) => set("model", v)}
              />
              <PickOrType
                id="pk-color"
                label="สี"
                optional
                value={d.color}
                known={isKnownColor(d.color)}
                options={colorOptions()}
                placeholder="เลือกสี"
                typePlaceholder="พิมพ์สีตามเล่มทะเบียน"
                onChange={(v) => set("color", v)}
              />
              {d.ownership === "company" ? (
                <TextField
                  id="pk-asset"
                  label="เลขทรัพย์สิน"
                  placeholder="FA-VH-0000"
                  value={d.assetNo}
                  onChange={(v) => set("assetNo", v)}
                />
              ) : null}
            </div>
            {dup ? (
              <p
                role="alert"
                className="flex items-start gap-1.5 rounded-lg bg-alert-soft px-3 py-2 text-12 text-alert"
              >
                <TriangleAlert
                  size={14}
                  className="mt-0.5 flex-none"
                  aria-hidden
                />
                ทะเบียน {dup.plate} {dup.province} ลงไว้แล้ว (
                {dup.code ?? "รอตรวจ"} · {dup.ownerName}) — รถหนึ่งคันมีบัตรได้ใบเดียว
              </p>
            ) : null}
          </DrawerSection>

          <DrawerSection
            title={d.ownership === "visitor" ? "3 · ผู้มาติดต่อ" : "3 · ผู้รับผิดชอบรถ"}
          >
            <div className="grid grid-cols-2 gap-3">
              {d.ownership !== "visitor" ? (
                <>
                  <TextField
                    id="pk-owner-id"
                    label="รหัสพนักงาน"
                    placeholder="6600123"
                    value={d.ownerId}
                    onChange={changeOwnerId}
                    className="col-span-2 sm:col-span-1"
                  />
                  <WhoStatus who={who} />
                </>
              ) : null}
              <TextField
                id="pk-owner-name"
                label={
                  d.ownership === "visitor" ? "ชื่อผู้มาติดต่อ / บริษัท" : "ชื่อ–นามสกุล"
                }
                value={d.ownerName}
                onChange={(v) => set("ownerName", v)}
                readOnly={filled}
                className="col-span-2"
              />
              <TextField
                id="pk-dept"
                label={
                  d.ownership === "visitor"
                    ? "มาติดต่อ (ฝ่าย / ผู้ประสานงาน)"
                    : "สังกัด"
                }
                optional
                placeholder={
                  d.ownership === "visitor" ? "ฝ่ายจัดซื้อ · คุณ…" : "ฝ่ายทรัพยากรบุคคล"
                }
                value={d.department}
                onChange={(v) => set("department", v)}
                readOnly={filled}
                className="col-span-2"
              />
              <SelectField
                id="pk-site"
                label="ศูนย์ที่จอด"
                value={d.site}
                onChange={(v) => set("site", v as SiteCode)}
                options={(Object.keys(SITES) as SiteCode[]).map((s) => ({
                  value: s,
                  label: SITES[s],
                }))}
              />
              <TextField
                id="pk-phone"
                type="tel"
                label="เบอร์ติดต่อ"
                placeholder="08x-xxx-xxxx"
                value={d.phone}
                onChange={(v) => set("phone", v)}
              />
              {d.ownership === "visitor" ? (
                <DateField
                  id="pk-valid"
                  label="บัตรหมดอายุ"
                  value={d.validUntil}
                  onChange={(v) => set("validUntil", v)}
                />
              ) : null}
            </div>
          </DrawerSection>

          <DrawerSection title="4 · รูปถ่ายรถ">
            <ImageUploadField
                id="pk-photo"
                label="รูปด้านหน้ารถ"
                hint="ให้เห็นป้ายทะเบียนชัดเจน · JPG / PNG"
                value={d.photo}
                onChange={(url) => set("photo", url)}
              />
          </DrawerSection>
        </div>
      </div>
    </ModalShell>
  );
}

export const DOT: Record<Ownership, string> = {
  company: "bg-[#0b5e54]",
  employee: "bg-[#2456a3]",
  visitor: "bg-[#b26a0f]",
};


/**
 * dropdown ที่มีทางออก “ไม่มีในรายการ (พิมพ์เอง)” — เลือก `OTHER` แล้วมีช่องพิมพ์โผล่ใต้ dropdown
 * ค่าที่เคยบันทึกแต่ไม่อยู่ในรายการ (แก้คำขอเก่า) เปิดมาเป็นโหมดพิมพ์เองพร้อมค่าเดิม
 * · ผู้เรียกใส่ `key` ให้ remount เมื่อรายการเปลี่ยนชุด (เปลี่ยนประเภทรถ / ยี่ห้อ)
 */
function PickOrType({
  id,
  label,
  value,
  known,
  options,
  groups,
  placeholder,
  typePlaceholder,
  optional,
  readOnly,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  /** ค่าปัจจุบันอยู่ในรายการไหม */
  known: boolean;
  options?: SelectOption[];
  groups?: SelectGroupOption[];
  placeholder: string;
  typePlaceholder: string;
  optional?: boolean;
  readOnly?: boolean;
  onChange: (v: string) => void;
}) {
  const [custom, setCustom] = useState(() => Boolean(value) && !known);
  return (
    <div className="flex flex-col gap-2">
      <SelectField
        id={id}
        label={label}
        optional={optional}
        readOnly={readOnly}
        value={custom ? OTHER : value}
        onChange={(v) => {
          setCustom(v === OTHER);
          onChange(v === OTHER ? "" : v);
        }}
        options={options}
        groups={groups}
        placeholder={placeholder}
        searchable
        searchPlaceholder={`ค้นหา${label}…`}
      />
      {custom ? (
        <TextField
          id={`${id}-text`}
          label={`ระบุ${label}`}
          srLabel
          optional={optional}
          value={value}
          onChange={onChange}
          placeholder={typePlaceholder}
        />
      ) : null}
    </div>
  );
}

const LOOKUPABLE = /^\d{4,10}$/;

type Who =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "found"; data: Extract<EmployeeLookup, { ok: true }> }
  | { state: "missing"; message: string }
  | { state: "error"; message: string };

/** เปิดฟอร์มมาพร้อมรหัสพนักงาน (หน้าผู้ใช้เติมรหัสตัวเอง / แก้คำขอเก่า) — เริ่มที่ “กำลังค้น” เลย */
function startsLookupable(initial?: ParkingVehicle, prefill?: Partial<VehicleDraft>) {
  const v = initial ?? prefill;
  return v?.ownership !== "visitor" && LOOKUPABLE.test((v?.ownerId ?? "").trim());
}

/** ผลค้นรหัสพนักงาน — กล่องข้างช่องรหัส (จอแคบ: ใต้ช่อง) */
function WhoStatus({ who }: { who: Who }) {
  const box = "col-span-2 flex min-h-[58px] items-center gap-2.5 self-center rounded-xl px-3 py-2 text-12 sm:col-span-1";
  if (who.state === "idle")
    return <p className={`${box} border border-dashed border-line text-mut`}>ข้อมูลพนักงานจะขึ้นที่นี่</p>;
  if (who.state === "loading")
    return (
      <p role="status" className={`${box} bg-base-200 text-mut`}>
        <Loader2 size={15} className="animate-spin" aria-hidden /> กำลังค้นข้อมูลพนักงาน…
      </p>
    );
  if (who.state === "missing" || who.state === "error")
    return (
      <p role="alert" className={`${box} ${who.state === "missing" ? "bg-alert-soft text-alert" : "bg-st-wait text-st-wait-ink"}`}>
        <TriangleAlert size={15} className="flex-none" aria-hidden /> {who.message}
      </p>
    );
  const p = who.data;
  return (
    <div role="status" className={`${box} ${p.inactive ? "bg-alert-soft" : "bg-soft"}`}>
      <Avatar name={p.name} src={p.imageUrl} />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-12-5 font-semibold text-ink">{p.name}</span>
        <span className="block truncate text-11-5 text-mut">
          {p.inactive ? "พ้นสภาพแล้ว — ลงทะเบียนไม่ได้" : [p.position, p.siteText].filter(Boolean).join(" · ")}
        </span>
      </span>
      {p.inactive ? (
        <TriangleAlert size={16} className="flex-none text-alert" aria-hidden />
      ) : (
        <BadgeCheck size={17} className="flex-none text-primary" aria-label="พบในระบบพนักงาน" />
      )}
    </div>
  );
}
