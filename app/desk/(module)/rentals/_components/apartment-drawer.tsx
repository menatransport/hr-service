"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save } from "lucide-react";

import { SelectField, TextField, TextareaField } from "@/components/ui/field";
import { SegmentedControl } from "@/components/ui/summary-panel";
import { requestJson } from "@/lib/http";
import { runAction, toastError } from "@/lib/swal";
import {
  BANK_OPTIONS,
  BILL_SOURCE_LABEL,
  CONTRACT_OPTIONS,
  ROOM_STATE_LABEL,
  type BillSource,
  type BoardRoom,
  type RentalApartment,
} from "@/lib/rentals/types";

import { Drawer, DrawerSection, STATE_CHIP, baht } from "./shared";

/** แผงขวาของที่พัก — เจ้าของ · เบอร์ · บัญชีรับเงิน · เงื่อนไขสัญญา · ห้องในที่พักนี้ (ไม่ส่ง `apartment` = เพิ่มใหม่) */
export function ApartmentDrawer({
  apartment,
  rooms = [],
  onClose,
  onAddRoom,
}: {
  apartment?: RentalApartment;
  rooms?: BoardRoom[];
  onClose: () => void;
  onAddRoom?: () => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [f, setF] = useState({
    name: apartment?.name ?? "",
    owner: apartment?.owner ?? "",
    phone: apartment?.phone ?? "",
    mapUrl: apartment?.mapUrl ?? "",
    address: apartment?.address ?? "",
    bankName: apartment?.bankName ?? "",
    bankAccountName: apartment?.bankAccountName ?? "",
    bankAccountNo: apartment?.bankAccountNo ?? "",
    minContract: apartment?.minContract ?? "",
    billSource: (apartment?.billSource ?? "owner") as BillSource,
    remark: apartment?.remark ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((cur) => ({ ...cur, [k]: v }));

  async function save() {
    if (!f.name.trim()) return toastError("กรุณาระบุชื่อที่พัก");
    setBusy(true);
    const out = await runAction({
      success: apartment ? "บันทึกที่พักแล้ว" : `เพิ่ม “${f.name}” แล้ว`,
      failureTitle: "บันทึกที่พักไม่สำเร็จ",
      run: () =>
        apartment
          ? requestJson(`/api/rentals/apartments/${apartment.id}`, { method: "PATCH", body: f })
          : requestJson("/api/rentals/apartments", { method: "POST", body: f }),
    });
    setBusy(false);
    if (out.status === "done") {
      startTransition(() => router.refresh());
      if (!apartment) onClose();
    }
  }

  return (
    <Drawer
      eyebrow={apartment ? "ที่พัก" : "เพิ่มที่พัก"}
      title={apartment?.name || "ที่พักใหม่"}
      sub={apartment ? `${rooms.filter((r) => r.state !== "cancelled").length} ห้องในเดือนนี้` : undefined}
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="btn-pri inline-flex items-center gap-1.5 px-4 py-2 text-13 disabled:opacity-45"
        >
          <Save size={14} aria-hidden /> {apartment ? "บันทึก" : "เพิ่มที่พัก"}
        </button>
      }
    >
      <DrawerSection title="ข้อมูลที่พัก">
        <TextField id="apt-name" label="ชื่อที่พัก" value={f.name} onChange={set("name")} placeholder="เช่น ห้องเช่า ป้าจุ๊ป (หัวหมาก)" />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField id="apt-owner" label="เจ้าของ / ผู้ดูแล" optional value={f.owner} onChange={set("owner")} />
          <TextField id="apt-phone" label="เบอร์ติดต่อ" optional type="tel" value={f.phone} onChange={set("phone")} />
        </div>
        <TextField
          id="apt-map"
          label="ลิงก์แผนที่ (Google Maps)"
          optional
          value={f.mapUrl}
          onChange={set("mapUrl")}
          placeholder="https://maps.app.goo.gl/…"
          hint="วางลิงก์แชร์จาก Google Maps หรือพิกัด เช่น 13.74, 100.63 — ระบบปักหมุดบนแผนที่ให้เอง"
        />
        <TextareaField id="apt-address" label="ที่อยู่" optional value={f.address} onChange={set("address")} rows={2} />
      </DrawerSection>

      <DrawerSection title="บัญชีรับเงินค่าเช่า">
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            id="apt-bank"
            label="ธนาคาร"
            optional
            value={f.bankName}
            onChange={set("bankName")}
            options={optionsWith(BANK_OPTIONS, f.bankName)}
            placeholder="เลือกธนาคาร"
            searchable
            searchPlaceholder="ค้นหาธนาคาร…"
            clearable
          />
          <TextField id="apt-acc-no" label="เลขที่บัญชี" optional value={f.bankAccountNo} onChange={set("bankAccountNo")} />
        </div>
        <TextField id="apt-acc-name" label="ชื่อบัญชี" optional value={f.bankAccountName} onChange={set("bankAccountName")} />
      </DrawerSection>

      <DrawerSection title="เงื่อนไข">
        <SelectField
          id="apt-min"
          label="เงื่อนไขสัญญา"
          optional
          value={f.minContract}
          onChange={set("minContract")}
          options={optionsWith(CONTRACT_OPTIONS, f.minContract)}
          placeholder="เลือกสัญญาขั้นต่ำ"
          searchable={false}
          clearable
          className="sm:max-w-[calc(50%-0.375rem)]"
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-12-5 font-medium text-mut">บิลค่าเช่า</span>
          <SegmentedControl
            label="บิลค่าเช่า"
            value={f.billSource}
            onChange={(v) => setF((cur) => ({ ...cur, billSource: v }))}
            options={(["owner", "self"] as const).map((v) => ({ value: v, label: BILL_SOURCE_LABEL[v] }))}
            className="w-fit"
          />
        </div>
        <TextareaField id="apt-remark" label="หมายเหตุ" optional value={f.remark} onChange={set("remark")} rows={2} />
      </DrawerSection>

      {apartment ? (
        <DrawerSection
          title="ห้องในที่พักนี้"
          action={
            onAddRoom ? (
              <button type="button" onClick={onAddRoom} className="btn-soft inline-flex items-center gap-1 px-2.5 py-1 text-12">
                <Plus size={13} aria-hidden /> เพิ่มห้อง
              </button>
            ) : null
          }
        >
          {rooms.length ? (
            <ul className="flex flex-col">
              {rooms.map((r) => (
                <li key={r.room.id} className="flex items-center gap-3 border-b border-line/70 py-2 text-13 last:border-b-0">
                  <span className="w-16 font-semibold">{r.room.roomNo}</span>
                  <span className="min-w-0 flex-1 truncate text-mut">{r.room.plant}</span>
                  <span className="tabular-nums">{baht(r.room.rent)}</span>
                  <span className={`chip px-2 py-0 text-11 ${STATE_CHIP[r.state]}`}>{ROOM_STATE_LABEL[r.state]}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-12-5 text-mut">ยังไม่มีห้องในเดือนนี้</p>
          )}
        </DrawerSection>
      ) : null}
    </Drawer>
  );
}

/** ตัวเลือกคงที่ + ค่าเดิมที่ไม่อยู่ในรายการ (ข้อมูลเก่าที่พิมพ์เอง) ให้ยังเห็นและเลือกค้างไว้ได้ */
function optionsWith(list: readonly string[], current: string) {
  const all = current && !list.includes(current) ? [...list, current] : list;
  return all.map((v) => ({ value: v, label: v }));
}
