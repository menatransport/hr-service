"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IdCard, Loader2, Pencil, ScanText, X } from "lucide-react";

import { DateField } from "@/components/ui/field";
import { requestJson } from "@/lib/http";
import { escapeHtml, runAction } from "@/lib/swal";
import { readThaiIdCard } from "@/app/recruitment/_lib/id-card-ocr";
import {
  expiryState,
  formatExpiryGap,
  formatThaiDate,
  type DriverRecord,
} from "@/app/recruitment/_lib/drivers/types";

/**
 * ช่อง “บัตรประชาชนหมดอายุ” บนหน้าประวัติ — แก้ในที่ได้ (ช่องอื่นแก้ผ่านปุ่ม “แก้ไขข้อมูล”)
 *
 * แยกตัวแก้ไว้เพราะมีปุ่มอ่านจากรูปบัตร และเก็บผู้กรอกไว้ที่ `idCardExpiryUpdatedBy`
 * (ตัวนำเข้า Excel ไม่ทับค่าที่กรอกที่นี่) — ดู `setDriverIdCardExpiry()` ใน `lib/drivers/registry.ts`
 *
 * กดดินสอแล้ว **ช่องอ่านสลับเป็นช่องกรอกในที่เดิม** ไม่ใช่เปิดกล่องลอย — ของที่
 * แก้คือวันที่เดียว การเปิดโมดัลทั้งใบเพื่อกรอกช่องเดียวคือสองคลิกที่ไม่ได้ให้อะไร
 *
 * บันทึกเสร็จเรียก `router.refresh()` ให้ server component อ่านค่าจริงกลับมา
 * **ไม่เดาค่าเองในหน้าจอ** · ยิงไม่สำเร็จ = ช่องกรอกยังเปิดค้างพร้อมค่าที่พิมพ์ไว้
 * ผู้ใช้จึงกดซ้ำได้ทันทีโดยไม่ต้องพิมพ์ใหม่ และหน้าจอไม่โกหกว่าบันทึกแล้ว
 *
 * ปุ่ม “อ่านจากรูปบัตร” ถ่าย/เลือกรูปบัตรแล้วอ่านวันหมดอายุด้วย `id-card-ocr.ts`
 * (อ่านในเบราว์เซอร์ รูปไม่ถูกเก็บที่ไหน) — ผลแค่เติมลงช่องกรอก **ยังต้องกดบันทึกเอง**
 */
export function DriverIdCardExpiry({
  driver,
  label = "บัตรประชาชนหมดอายุ",
  bare = false,
}: {
  driver: DriverRecord;
  label?: string;
  /** ไม่วาดไอคอนหน้าช่อง — ใช้ในกลุ่มเอกสารที่หัวกลุ่มมีไอคอนแล้ว */
  bare?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(driver.idCardExpiryISO);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const state = expiryState(driver.idCardDaysLeft);
  const tone =
    state === "expired" ? "text-alert font-medium" : state === "soon" ? "text-sla font-medium" : "text-mut";

  function open() {
    setDraft(driver.idCardExpiryISO);
    setScanNote(null);
    setEditing(true);
  }

  async function scan(file: File) {
    setScanning(true);
    setScanNote(null);
    try {
      const r = await readThaiIdCard(file);
      if (r.expiry) {
        setDraft(r.expiry);
        setScanNote("อ่านจากรูปบัตรแล้ว — ตรวจให้ตรงกับบัตรก่อนกดบันทึก");
      } else {
        if (!editing) setDraft(driver.idCardExpiryISO);
        setScanNote(
          r.lifelong
            ? "บัตรใบนี้เป็นบัตรตลอดชีพ ไม่มีวันหมดอายุ"
            : "อ่านวันหมดอายุจากรูปไม่ออก — ถ่ายใหม่ให้ชัดขึ้น หรือกรอกเอง",
        );
      }
      setEditing(true);
    } catch {
      setScanNote("โหลดตัวอ่านบัตรไม่สำเร็จ — ตรวจอินเทอร์เน็ตแล้วลองใหม่ หรือกรอกเอง");
      setEditing(true);
    } finally {
      setScanning(false);
    }
  }

  async function save() {
    /* ค่าเดิมเป๊ะ = ไม่ต้องยิง · แค่ปิดช่องกรอก ไม่ต้องขึ้นขนมปังปิ้งว่าบันทึกแล้ว
       เพราะไม่มีอะไรถูกบันทึก */
    if (draft === driver.idCardExpiryISO) {
      setEditing(false);
      return;
    }

    const clearing = !draft;

    const out = await runAction({
      confirm: clearing
        ? {
            title: "ลบวันหมดอายุบัตรประชาชน?",
            html: `วันที่ที่บันทึกไว้ (<b>${escapeHtml(
              formatThaiDate(driver.idCardExpiryISO, "full"),
            )}</b>) จะถูกลบทิ้ง และคนคนนี้จะหายจากปฏิทินในศูนย์เอกสาร`,
            confirmText: "ลบวันที่",
            tone: "warn",
          }
        : false,
      pending: "กำลังบันทึก…",
      success: clearing ? "ลบวันหมดอายุแล้ว" : "บันทึกวันหมดอายุแล้ว",
      failureTitle: "บันทึกวันหมดอายุไม่สำเร็จ",
      run: async () => {
        setBusy(true);
        try {
          return await requestJson(
            `/api/drivers/${encodeURIComponent(driver.drivercode)}/id-card-expiry`,
            { method: "PUT", body: { dateISO: draft } },
            "บันทึกวันหมดอายุไม่สำเร็จ",
          );
        } finally {
          setBusy(false);
        }
      },
    });

    // `failed` = ยิงไปแล้วแต่ไม่ผ่าน → ช่องกรอกต้องค้างไว้ให้กดซ้ำ
    if (out.status === "done") {
      setEditing(false);
      router.refresh();
    }
  }

  return (
    <div className="flex min-w-0 gap-2.5">
      {bare ? null : (
        <IdCard size={15} strokeWidth={1.7} aria-hidden className="mt-0.5 flex-none text-mut" />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <dt className="flex items-center gap-1.5 text-11-5 text-mut">
          {label}
          <button
            type="button"
            onClick={() => picker.current?.click()}
            disabled={scanning || busy}
            aria-label="อ่านวันหมดอายุจากรูปบัตร"
            title="อ่านวันหมดอายุจากรูปบัตร"
            className="flex size-6 cursor-pointer items-center justify-center rounded-selector text-mut transition-colors hover:bg-base-200 hover:text-primary disabled:pointer-events-none"
          >
            {scanning ? (
              <Loader2 size={12} strokeWidth={2} aria-hidden className="animate-spin" />
            ) : (
              <ScanText size={12} strokeWidth={1.9} aria-hidden />
            )}
          </button>
          <input
            ref={picker}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void scan(file);
            }}
          />
          {editing ? null : (
            <button
              type="button"
              onClick={open}
              aria-label="แก้ไขวันหมดอายุบัตรประชาชน"
              title="แก้ไขวันหมดอายุบัตรประชาชน"
              className="flex size-6 cursor-pointer items-center justify-center rounded-selector text-mut transition-colors hover:bg-base-200 hover:text-primary"
            >
              <Pencil size={12} strokeWidth={1.9} aria-hidden />
            </button>
          )}
        </dt>

        <dd className="m-0 flex flex-col gap-1">
          {editing ? (
            <>
              <DateField
                id={`id-card-expiry-${driver.drivercode}`}
                label="วันหมดอายุบัตรประชาชน"
                value={draft}
                onChange={setDraft}
                srLabel
                optional
              />
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={save}
                  disabled={busy}
                  className="btn-pri cursor-pointer px-3 py-1.5 text-12 font-medium disabled:pointer-events-none disabled:opacity-50"
                >
                  {busy ? "กำลังบันทึก…" : "บันทึก"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={busy}
                  className="btn-sec flex cursor-pointer items-center gap-1 px-2.5 py-1.5 text-12 text-mut transition-colors hover:text-ink disabled:pointer-events-none disabled:opacity-50"
                >
                  <X size={13} strokeWidth={1.9} aria-hidden />
                  ยกเลิก
                </button>
              </div>
              {scanNote ? (
                <span className="text-11 text-primary text-pretty">{scanNote}</span>
              ) : null}
              <span className="text-11 text-mut text-pretty">
                ปล่อยว่างแล้วกดบันทึก = ลบวันที่ที่กรอกไว้
              </span>
            </>
          ) : driver.idCardExpiryISO ? (
            <>
              <span className="text-13-5">{formatThaiDate(driver.idCardExpiryISO, "full")}</span>
              <span className={`text-11-5 ${tone}`}>
                {formatExpiryGap(driver.idCardDaysLeft)}
              </span>
            </>
          ) : (
            <>
              <span className="text-13 text-mut">ยังไม่ระบุ</span>
              <span className="text-11-5 text-mut text-pretty">
                ไม่มีในระบบต้นทาง — กรอกเองได้จากปุ่มดินสอ
              </span>
            </>
          )}
        </dd>
      </div>
    </div>
  );
}
