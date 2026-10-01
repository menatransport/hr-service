"use client";

import { useId, useState } from "react";

import { SelectField, TextField, TextareaField } from "@/components/ui/field";
import { ModalShell } from "@/components/ui/modal-shell";
import { requestJson } from "@/lib/http";
import { runAction } from "@/lib/swal";
import { ExitTypePicker } from "@/app/recruitment/_components/admin/exit-type-picker";
import type {
  ExitType,
  ResignCategory,
  ResignReason,
} from "@/app/recruitment/_lib/resign-reasons/types";

/**
 * โมดัลเพิ่ม/แก้รหัสและหมวดของหน้าตั้งค่าเหตุผลการลาออก
 *
 * แยกจาก `resign-reasons-view.tsx` เพราะไฟล์นั้นจะยาวเกิน ~400 บรรทัด
 * (กติกาการแตกไฟล์ใน `AGENTS.md`) — สองโมดัลนี้มีผู้เรียกที่เดียวคือหน้านั้น
 *
 * บันทึกไม่ผ่าน = โมดัลคาอยู่พร้อมข้อความ ไม่ปิดทิ้งสิ่งที่ผู้ใช้กรอกไว้
 */

const API = "/api/recruitment/resign-reasons";

/* ------------------------------------------------------------------ รหัส */

export function ReasonEditor({
  categories,
  reason,
  categoryId: initialCategory,
  onClose,
  onSaved,
}: {
  categories: ResignCategory[];
  /** `null` = เพิ่มใหม่ */
  reason: ResignReason | null;
  categoryId: string;
  onClose: () => void;
  onSaved: (r: ResignReason) => void;
}) {
  const id = useId();
  const isNew = !reason;

  const [categoryId, setCategoryId] = useState(reason?.categoryId ?? initialCategory);
  const [code, setCode] = useState(reason?.code ?? "");
  const [label, setLabel] = useState(reason?.label ?? "");
  const [description, setDescription] = useState(reason?.description ?? "");
  const [exitType, setExitType] = useState<ExitType>(
    reason?.exitType ?? categories.find((c) => c.id === initialCategory)?.exitType ?? "vol",
  );
  const [busy, setBusy] = useState(false);

  const cat = categories.find((c) => c.id === categoryId);

  /* รหัสใหม่ตามประเภทการออกของหมวด — เปลี่ยนหมวดตอนสร้างใหม่ก็ตามหมวดใหม่ */
  function chooseCategory(next: string) {
    setCategoryId(next);
    if (isNew) {
      const c = categories.find((x) => x.id === next);
      if (c) setExitType(c.exitType);
      setCode("");
    }
  }

  async function save() {
    const out = await runAction({
      run: async () => {
        setBusy(true);
        try {
          return await requestJson<ResignReason>(
            isNew ? API : `${API}/${reason.id}`,
            {
              method: isNew ? "POST" : "PATCH",
              body: {
                categoryId,
                ...(isNew ? { code: code.trim() } : {}),
                label: label.trim(),
                description: description.trim(),
                exitType,
              },
            },
            "บันทึกรหัสไม่สำเร็จ",
          );
        } finally {
          setBusy(false);
        }
      },
      success: (r) => (isNew ? `เพิ่มรหัส ${r.code} แล้ว` : `บันทึก ${r.code} แล้ว`),
      failureTitle: "บันทึกรหัสไม่สำเร็จ",
    });
    if (out.status !== "done") return;
    onSaved(out.data);
    onClose();
  }

  return (
    <ModalShell
      title={isNew ? "เพิ่มรหัสเหตุผล" : `แก้ไขรหัส ${reason.code}`}
      subtitle={cat ? `หมวด ${cat.prefix} · ${cat.label}` : undefined}
      onClose={() => !busy && onClose()}
      width="560px"
      tone="plain"
      footer={
        <Footer
          busy={busy}
          ready={Boolean(categoryId && label.trim())}
          onClose={onClose}
          onSave={save}
          saveText={isNew ? "เพิ่มรหัส" : "บันทึก"}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
          <SelectField
            id={`${id}-cat`}
            label="หมวดใหญ่"
            value={categoryId}
            onChange={chooseCategory}
            options={categories.map((c) => ({ value: c.id, label: `${c.prefix} · ${c.label}` }))}
            hint={isNew ? undefined : "ย้ายได้เฉพาะหมวดที่อักษรนำตรงกับรหัส"}
          />
          <TextField
            id={`${id}-code`}
            label="รหัส"
            optional={isNew}
            readOnly={!isNew}
            value={code}
            onChange={(v) => setCode(v.toUpperCase())}
            placeholder={cat ? `อัตโนมัติ (${cat.prefix}…)` : ""}
            hint={isNew ? "เว้นว่าง = เลขถัดไปของหมวด" : "แก้ไม่ได้หลังสร้าง"}
          />
        </div>

        <TextField
          id={`${id}-label`}
          label="หมวดย่อย (เหตุผล)"
          value={label}
          onChange={setLabel}
          placeholder="เช่น รายได้สุทธิไม่พอกับค่าครองชีพ"
          hint="ข้อความที่คนเลือกเห็นในดรอปดาวน์ — ต้องชี้ได้ว่าใครเป็นคนแก้ปัญหานี้"
        />

        <TextareaField
          id={`${id}-desc`}
          label="ขยายความ"
          optional
          rows={2}
          value={description}
          onChange={setDescription}
          placeholder="ตัวอย่างเคสหรือขอบเขต เช่น ทะเลาะวิวาท, ขาดงาน ละทิ้งหน้าที่"
        />

        <ExitTypePicker value={exitType} onChange={setExitType} />
      </div>
    </ModalShell>
  );
}

/* ------------------------------------------------------------------ หมวด */

export function CategoryEditor({
  category,
  onClose,
  onSaved,
}: {
  category: ResignCategory | null;
  onClose: () => void;
  onSaved: (c: ResignCategory) => void;
}) {
  const id = useId();
  const isNew = !category;

  const [prefix, setPrefix] = useState(category?.prefix ?? "");
  const [label, setLabel] = useState(category?.label ?? "");
  const [exitType, setExitType] = useState<ExitType>(category?.exitType ?? "vol");
  const [busy, setBusy] = useState(false);

  async function save() {
    const out = await runAction({
      run: async () => {
        setBusy(true);
        try {
          return await requestJson<ResignCategory>(
            isNew ? `${API}/categories` : `${API}/categories/${category.id}`,
            {
              method: isNew ? "POST" : "PATCH",
              body: { ...(isNew ? { prefix: prefix.trim() } : {}), label: label.trim(), exitType },
            },
            "บันทึกหมวดไม่สำเร็จ",
          );
        } finally {
          setBusy(false);
        }
      },
      success: (c) => (isNew ? `เพิ่มหมวด ${c.prefix} แล้ว` : `บันทึกหมวด ${c.prefix} แล้ว`),
      failureTitle: "บันทึกหมวดไม่สำเร็จ",
    });
    if (out.status !== "done") return;
    onSaved(out.data);
    onClose();
  }

  return (
    <ModalShell
      title={isNew ? "เพิ่มหมวดใหญ่" : `แก้ไขหมวด ${category.prefix}`}
      onClose={() => !busy && onClose()}
      width="520px"
      tone="plain"
      footer={
        <Footer
          busy={busy}
          ready={Boolean(label.trim() && (!isNew || prefix.trim()))}
          onClose={onClose}
          onSave={save}
          saveText={isNew ? "เพิ่มหมวด" : "บันทึก"}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <TextField
            id={`${id}-prefix`}
            label="อักษรนำรหัส"
            readOnly={!isNew}
            value={prefix}
            onChange={(v) => setPrefix(v.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3))}
            placeholder="เช่น P"
          />
          <TextField
            id={`${id}-label`}
            label="ชื่อหมวด"
            value={label}
            onChange={setLabel}
            placeholder="เช่น รายได้และค่าตอบแทน"
          />
        </div>

        <ExitTypePicker
          value={exitType}
          onChange={setExitType}
          label="ประเภทการออกตั้งต้น"
          hint="รหัสใหม่ในหมวดนี้จะได้ค่านี้ไปก่อน — รหัสแต่ละตัวตั้งทับเองได้ และแก้ตรงนี้ไม่เปลี่ยนรหัสที่มีอยู่แล้ว"
        />
      </div>
    </ModalShell>
  );
}

/* ------------------------------------------------------------------ ปุ่มท้าย */

function Footer({
  busy,
  ready,
  onClose,
  onSave,
  saveText,
}: {
  busy: boolean;
  ready: boolean;
  onClose: () => void;
  onSave: () => void;
  saveText: string;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={onClose}
        disabled={busy}
        className="cursor-pointer rounded-field border border-line px-4 py-2 text-13 transition-colors hover:border-ink/30 disabled:opacity-50"
      >
        ยกเลิก
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={busy || !ready}
        className="cursor-pointer rounded-field bg-primary px-4 py-2 text-13 font-medium text-primary-content transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {saveText}
      </button>
    </div>
  );
}
