"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, FileUp, Loader2, Search, TriangleAlert, X } from "lucide-react";

import { ModalShell } from "@/components/ui/modal-shell";
import { DateField, Frame, SelectField, TextareaField, TextField } from "@/components/ui/field";
import { SegmentedControl } from "@/components/ui/summary-panel";
import { requestJson } from "@/lib/http";
import { toastSuccess, toastWarn } from "@/lib/swal";
import {
  DRIVER_BRANCH_OPTIONS,
  employmentLabel,
  formatThaiDate,
  MIXER_POSITIONS,
  OWNER_TYPE_LABELS,
  siteOfBranch,
  type DriverCopySource,
  type DriverListRecord,
} from "@/app/recruitment/_lib/drivers/types";

/**
 * กล่อง “เพิ่มพนักงาน” บนหน้าทะเบียน — เลือก พจส./พจร. แล้วกรอกเฉพาะที่จำเป็น ไม่ผ่านใบสมัคร (`POST /api/drivers`)
 * · บันทึกแล้วพาไปแท็บเอกสารของหน้าประวัติ อัปโหลดเอกสาร/เติมช่องที่เหลือต่อที่นั่น
 * · “ชื่อที่จะคัดลอก (ถ้ามี)” — คนย้ายประเภท (พจร. ⇄ พจส.) ปิดรหัสเก่าแล้วเปิดรหัสใหม่: เลือกรหัสเดิม → ตรวจสอบ
 *   = เติมฟอร์มให้ + บันทึกแล้วคัดข้อมูลที่เหลือ/เอกสาร/รูปตาม (`copyFrom`) · วันเริ่มงานกับเบอร์รถไม่คัด
 */

/** ลูกค้า/แพล้นท์ที่มีในทะเบียนแล้ว — เลือกจากรายการ สะกดตรงกับตัวกรองบนหน้าทะเบียน */
function choices(values: string[]) {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "th"))
    .map((v) => ({ value: v, label: v }));
}

/** ประเภทที่เพิ่มจากกล่องนี้ได้ — ต้องเลือกเองทุกครั้ง ไม่ตั้งค่าเริ่มให้ */
const OWNER_OPTIONS = (["1", "2"] as const).map((value) => ({ value, label: OWNER_TYPE_LABELS[value] }));

/** ตำแหน่งงานโม่ — ชิปกดครั้งเดียวแบบฟอร์มขออัตรา ไม่ตั้งค่าเริ่มให้ */
const POSITION_OPTIONS = MIXER_POSITIONS.map((value) => ({ value, label: value }));

const today = () => new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** สาขาของรหัสเดิม → ตัวเลือกสาขาในกล่องนี้ (ตัวแทนของแต่ละสาขา) · ไม่ตรงสาขาไหนเลย = คงค่าเดิมของฟอร์ม */
function branchOption(branch: string): string | null {
  const site = siteOfBranch(branch);
  return DRIVER_BRANCH_OPTIONS.find((o) => o.value === branch || (site && siteOfBranch(o.value) === site))?.value ?? null;
}

export function DriverAddDialog({ drivers, onClose }: { drivers: DriverListRecord[]; onClose: () => void }) {
  const router = useRouter();
  /* รายชื่อให้เลือกคัดลอก = คนในแท็บ “พ้นสภาพแล้ว” (คนยังทำงานต้องปิดรหัสเดิมก่อน) — โหลดตอนเปิดกล่อง */
  const [resigned, setResigned] = useState<DriverListRecord[] | null>(null);
  useEffect(() => {
    let live = true;
    requestJson<DriverListRecord[]>("/api/drivers/resigned", {}, "โหลดรายชื่อพ้นสภาพไม่สำเร็จ")
      .then((rows) => live && setResigned(rows))
      .catch(() => live && setResigned([]));
    return () => {
      live = false;
    };
  }, []);
  const people = useMemo(
    () =>
      (resigned ?? [])
        .toSorted((a, b) => a.name.localeCompare(b.name, "th"))
        .map((d) => ({ value: d.drivercode, label: `${d.name} · ${d.drivercode} (${employmentLabel(d)})` })),
    [resigned],
  );

  const [copyCode, setCopyCode] = useState("");
  const [source, setSource] = useState<DriverCopySource | null>(null);
  const [checking, setChecking] = useState(false);
  /**
   * นับรอบที่ “ตรวจสอบ” เติมฟอร์ม — เป็น `key` ของดรอปดาวน์สาขา/ลูกค้า/แพล้นท์ ให้เมานต์ใหม่พร้อมค่าที่เติม
   * · Radix Select ที่ปิดอยู่ (ไม่ได้วาดตัวเลือก) ถูกเปลี่ยนค่าจากข้างนอก จะยิง `onValueChange("")` ล้างค่าทิ้งเอง
   */
  const [filled, setFilled] = useState(0);

  const customers = useMemo(
    () => choices([...drivers.map((d) => d.customer ?? ""), source?.form.customer ?? ""]),
    [drivers, source],
  );
  const plants = useMemo(() => choices([...drivers.map((d) => d.plant ?? ""), source?.form.plant ?? ""]), [drivers, source]);
  const [form, setForm] = useState({
    ownerType: "" as "" | "1" | "2",
    drivercode: "",
    driverName: "",
    branch: DRIVER_BRANCH_OPTIONS[0].value,
    startDate: today(),
    phone: "",
    vehicleCode: "",
    customer: "",
    plant: "",
    position: "",
    note: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));
  /* ลาดกระบัง = งานโม่ ต้องเลือกตำแหน่ง · เปลี่ยนไปสาขาอื่นแล้วตำแหน่งถูกล้าง (สาขาอื่นไม่มีชุดนี้) */
  const mixer = siteOfBranch(form.branch) === "latkrabang";
  const pickBranch = (v: string) =>
    setForm((f) => ({ ...f, branch: v, position: siteOfBranch(v) === "latkrabang" ? f.position : "" }));
  const ready =
    form.ownerType &&
    form.drivercode.trim() &&
    form.driverName.trim() &&
    form.branch &&
    form.startDate &&
    (!mixer || form.position) &&
    !source?.active;

  /** ตรวจสอบ = ดึงข้อมูลรหัสเดิม แล้วเติมฟอร์ม · วันเริ่มงานคงไว้ เบอร์รถล้าง (ของรอบจ้างใหม่) */
  async function check() {
    if (!copyCode || checking) return;
    setChecking(true);
    setError(null);
    try {
      const src = await requestJson<DriverCopySource>(
        `/api/drivers/${encodeURIComponent(copyCode)}/copy-source`,
        {},
        "ตรวจสอบข้อมูลไม่สำเร็จ",
      );
      setSource(src);
      setFilled((n) => n + 1);
      setForm((f) => {
        const branch = branchOption(src.form.branch) ?? f.branch;
        const mixerBranch = siteOfBranch(branch) === "latkrabang";
        return {
          ...f,
          driverName: src.form.driverName || f.driverName,
          branch,
          phone: src.form.phone,
          customer: src.form.customer,
          plant: src.form.plant,
          position: mixerBranch && MIXER_POSITIONS.includes(src.form.position) ? src.form.position : "",
          vehicleCode: "",
        };
      });
    } catch (err) {
      setSource(null);
      setError(err instanceof Error ? err.message : "ตรวจสอบข้อมูลไม่สำเร็จ");
    } finally {
      setChecking(false);
    }
  }

  /** เปลี่ยน/ล้างชื่อที่จะคัดลอก = ทิ้งผลตรวจสอบเดิม (ค่าที่เติมในฟอร์มไว้แล้วคงอยู่ แก้เองได้) */
  const pickCopy = (v: string) => {
    setCopyCode(v);
    if (v !== source?.drivercode) setSource(null);
  };

  async function save() {
    if (!ready || saving) return;
    setSaving(true);
    setError(null);
    try {
      const { drivercode, copied } = await requestJson<{
        drivercode: string;
        copied: { files: number; failed: number } | null;
      }>(
        "/api/drivers",
        { method: "POST", body: { ...form, ...(source ? { copyFrom: source.drivercode } : {}) } },
        "เพิ่มพนักงานไม่สำเร็จ",
      );
      const title = `เพิ่ม ${OWNER_TYPE_LABELS[form.ownerType as "1" | "2"]} ${drivercode} แล้ว`;
      if (copied?.failed) void toastWarn(title, `คัดลอกไฟล์ได้ ${copied.files} ไฟล์ · พลาด ${copied.failed} ไฟล์ — อัปโหลดเพิ่มในหน้าเอกสาร`);
      else if (copied) void toastSuccess(title, `คัดลอกข้อมูลจาก ${source?.drivercode} แล้ว${copied.files ? ` · ไฟล์ ${copied.files} ไฟล์` : ""}`);
      else void toastSuccess(title, "อัปโหลดเอกสารต่อได้เลย");
      router.push(`/recruitment/admin/drivers/${encodeURIComponent(drivercode)}?tab=docs`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เพิ่มพนักงานไม่สำเร็จ");
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="เพิ่มพนักงาน"
      subtitle="กรอกเฉพาะที่จำเป็น — เอกสารอัปโหลดต่อในหน้าประวัติ"
      onClose={onClose}
      width="600px"
      tone="plain"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-sec px-3.5 py-2 text-13">
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!ready || saving}
            className="btn-pri flex items-center gap-1.5 px-3.5 py-2 text-13 font-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 size={15} className="animate-spin" aria-hidden /> : null}
            บันทึก
          </button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="flex flex-col gap-3 rounded-box border border-line bg-base-200 p-3">
          <div className="flex items-end gap-2">
            <SelectField
              id="add-copyFrom"
              label="ชื่อที่จะคัดลอก (ถ้ามี)"
              hint="รายชื่อจากแท็บพ้นสภาพแล้ว — คนที่ย้ายประเภท เลือกเพื่อคัดลอกข้อมูลเดิมมาด้วย"
              options={people}
              value={copyCode}
              onChange={pickCopy}
              placeholder={resigned ? "ค้นหาชื่อหรือรหัส" : "กำลังโหลดรายชื่อ…"}
              searchable
              searchPlaceholder="ค้นหาชื่อหรือรหัส…"
              clearable
              optional
              readOnly={saving}
              className="min-w-0 flex-1"
            />
            <button
              type="button"
              onClick={check}
              disabled={!copyCode || checking || saving}
              className="btn-sec flex h-[38px] flex-none items-center gap-1.5 px-3 text-13 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {checking ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Search size={14} aria-hidden />}
              ตรวจสอบ
            </button>
          </div>
          {source ? <CopyPreview source={source} onClear={() => pickCopy("")} /> : null}
        </div>

        <Frame id="add-ownerType" label="ประเภทพนักงาน">
          <SegmentedControl
            label="ประเภทพนักงาน"
            value={form.ownerType}
            options={OWNER_OPTIONS}
            onChange={(v) => !saving && set("ownerType")(v)}
            className="self-start"
          />
        </Frame>

        {mixer ? (
          <Frame id="add-position" label="ตำแหน่ง">
            <SegmentedControl
              label="ตำแหน่ง"
              value={form.position}
              options={POSITION_OPTIONS}
              onChange={(v) => !saving && set("position")(v)}
              className="self-start"
            />
          </Frame>
        ) : null}

        <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
          <TextField id="add-drivercode" label="รหัสพนักงาน" value={form.drivercode} onChange={set("drivercode")} readOnly={saving} />
          <TextField id="add-driverName" label="ชื่อ – สกุล" value={form.driverName} onChange={set("driverName")} readOnly={saving} />
          <SelectField
            key={`add-branch-${filled}`}
            id="add-branch"
            label="สาขา"
            options={DRIVER_BRANCH_OPTIONS}
            value={form.branch}
            onChange={pickBranch}
            readOnly={saving}
          />
          <DateField id="add-startDate" label="วันเริ่มงาน" value={form.startDate} onChange={set("startDate")} readOnly={saving} />
          <TextField id="add-phone" label="เบอร์โทรศัพท์" type="tel" value={form.phone} onChange={set("phone")} optional readOnly={saving} />
          <TextField
            id="add-vehicleCode"
            label="เบอร์รถ"
            placeholder="เช่น ME009"
            value={form.vehicleCode}
            onChange={set("vehicleCode")}
            optional
            readOnly={saving}
          />
          <SelectField
            key={`add-customer-${filled}`}
            id="add-customer"
            label="ลูกค้า"
            options={customers}
            value={form.customer}
            onChange={set("customer")}
            placeholder="เลือกลูกค้า"
            searchable
            searchPlaceholder="ค้นหาลูกค้า…"
            clearable
            optional
            readOnly={saving}
          />
          <SelectField
            key={`add-plant-${filled}`}
            id="add-plant"
            label="แพล้นท์"
            options={plants}
            value={form.plant}
            onChange={set("plant")}
            placeholder="เลือกแพล้นท์"
            searchable
            searchPlaceholder="ค้นหาแพล้นท์…"
            clearable
            optional
            readOnly={saving}
          />
        </div>

        <TextareaField
          id="add-note"
          label="หมายเหตุ (ถ้ามี)"
          value={form.note}
          onChange={set("note")}
          rows={2}
          optional
          readOnly={saving}
        />

        <p className="flex items-center gap-1.5 text-12 text-mut">
          <FileUp size={13} aria-hidden className="flex-none" />
          {source
            ? "บันทึกแล้วจะไปหน้าเอกสารของคนนี้ — ตรวจเอกสารที่คัดลอกมา และอัปโหลดเพิ่มถ้ามีฉบับใหม่"
            : "บันทึกแล้วจะไปหน้าเอกสารของคนนี้ เพื่ออัปโหลดบัตรประชาชน ใบขับขี่ และเอกสารอื่น"}
        </p>

        {error ? (
          <p role="alert" className="flex items-start gap-2 rounded-box bg-alert-soft px-3 py-2 text-12-5 text-alert">
            <TriangleAlert size={14} aria-hidden className="mt-0.5 flex-none" />
            {error}
          </p>
        ) : null}
        <button type="submit" hidden />
      </form>
    </ModalShell>
  );
}

/** ผลตรวจสอบ — สิ่งที่จะคัดลอกจากรหัสเดิมเมื่อกดบันทึก */
function CopyPreview({ source, onClear }: { source: DriverCopySource; onClear: () => void }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-field border border-line bg-base-100 p-3 text-12-5">
      <div className="flex items-start gap-2">
        <Copy size={14} aria-hidden className="mt-0.5 flex-none text-primary" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink">
            {source.form.driverName} · {source.drivercode}
          </p>
          <p className="text-12 text-mut">
            {[
              source.ownerTypeLabel,
              source.siteLabel,
              source.exitDateISO ? `${source.statusLabel} ${formatThaiDate(source.exitDateISO)}` : source.statusLabel,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          aria-label="ไม่คัดลอก"
          title="ไม่คัดลอก"
          className="flex-none rounded-field p-1 text-mut hover:bg-base-200 hover:text-ink"
        >
          <X size={14} aria-hidden />
        </button>
      </div>

      {source.fields.length ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {source.fields.map((f) => (
            <div key={f.key} className="contents">
              <dt className="text-mut">{f.label}</dt>
              <dd className="min-w-0 break-words text-ink">{f.kind === "date" ? formatThaiDate(f.value) : f.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-mut">ไม่มีข้อมูลบัตร/ใบขับขี่/บัญชี/ผู้ติดต่อฉุกเฉินในรหัสเดิม</p>
      )}
    </div>
  );
}
