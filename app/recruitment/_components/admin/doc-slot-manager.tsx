"use client";

import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { GripVertical, Loader2, Lock, Pencil, Plus, Trash2 } from "lucide-react";

import { IconButton, SortableRow } from "@/app/recruitment/_components/question-manager";
import { TextField } from "@/components/ui/field";
import { ModalShell } from "@/components/ui/modal-shell";
import { requestJson } from "@/lib/http";
import { alertError, confirm, toastSuccess } from "@/lib/swal";
import { formDocSlots, isLockedDocSlot, type DocSlot } from "@/app/recruitment/_lib/form";

/**
 * Section 4 ของหน้าคลังคำถาม — เอกสารที่ผู้สมัครต้องถ่ายรูปแนบ
 *
 * **หน้าตาและการใช้งานเหมือน Section 1–3 ทุกอย่าง** — ลากจัดลำดับ · ดินสอ = แก้ ·
 * ถังขยะ = ลบ · ปุ่ม “เพิ่มเอกสาร” บนหัว · คนที่คุ้นกับการแก้คำถามแล้วไม่ต้องเรียนใหม่
 *
 * ค่าแสดง/บังคับอยู่ในกล่องแก้ไข ไม่ได้เป็นสวิตช์บนแถว (ท้ายแถวมีแค่ดินสอกับถังขยะ
 * ตาม Section 1–3) · ซ่อนแล้วสวิตช์บังคับถูกล็อก และเซิร์ฟเวอร์บังคับกฎเดียวกันซ้ำ
 *
 * ช่องหลักที่ข้อมูลจากเอกสารผูกอยู่ (`isLockedDocSlot`) ขึ้นรูปกุญแจและลบไม่ได้ — ซ่อนได้
 * ทุก API คืนรายการทั้งชุดกลับมา หน้าจอใช้ค่านั้นเป็นค่าจริง ไม่เดาผลเอง
 */
export function DocSlotManager({
  slots,
  onChange,
}: {
  slots: DocSlot[];
  onChange: (next: DocSlot[]) => void;
}) {
  const [editing, setEditing] = useState<DocSlot | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const shown = formDocSlots(slots).length;

  async function run(key: string, action: () => Promise<DocSlot[]>, fail: string) {
    setBusy(key);
    try {
      onChange(await action());
      return true;
    } catch (err) {
      alertError(fail, err instanceof Error ? err.message : undefined);
      return false;
    } finally {
      setBusy(null);
    }
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const ids = slots.map((s) => s.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);

    run(
      "order",
      () =>
        requestJson<DocSlot[]>(
          "/api/recruitment/doc-slots/reorder",
          { method: "POST", body: { ids } },
          "จัดลำดับไม่สำเร็จ",
        ),
      "จัดลำดับไม่สำเร็จ",
    );
  }

  async function remove(slot: DocSlot) {
    const agreed = await confirm({
      title: `ลบเอกสาร “${slot.label}”`,
      text: "ไฟล์ที่ผู้สมัครแนบมาแล้วยังเปิดดูได้ในหน้าผู้สมัครตามปกติ แต่ช่องนี้จะหายจากฟอร์มทันทีและเอากลับมาไม่ได้ — ถ้าแค่ไม่อยากให้ผู้สมัครเห็น ให้ซ่อนแทน",
      confirmText: "ลบออกจากคลัง",
      tone: "danger",
    });
    if (!agreed) return;

    const done = await run(
      slot.id,
      () =>
        requestJson<DocSlot[]>(
          `/api/recruitment/doc-slots/${slot.id}`,
          { method: "DELETE" },
          "ลบเอกสารไม่สำเร็จ",
        ),
      "ลบเอกสารไม่สำเร็จ",
    );
    if (done) toastSuccess("ลบเอกสารแล้ว");
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="font-mono text-10-5 font-semibold text-mut">Section 4</span>
          <span className="text-13-5 font-semibold">เอกสารแนบ</span>
          <span className="font-mono text-11 text-mut tabular-nums">
            {shown} รายการ
            {slots.length > shown ? ` · ซ่อน ${slots.length - shown}` : ""}
          </span>
        </span>

        <button
          type="button"
          onClick={() => setEditing("new")}
          className="flex items-center gap-1 rounded-field border border-dashed border-line px-2.5 py-1 text-12 text-mut transition-colors hover:border-primary/50 hover:text-primary"
        >
          <Plus size={12} strokeWidth={2} aria-hidden />
          เพิ่มเอกสาร
        </button>
      </div>

      {shown === 0 ? (
        <p className="rounded-box border border-dashed border-line px-3.5 py-4 text-12-5 text-mut">
          {slots.length
            ? "ซ่อนทุกรายการอยู่ — ขั้นเอกสารจะบอกผู้สมัครว่ายังไม่ต้องแนบอะไร"
            : "ยังไม่มีเอกสาร — ขั้นเอกสารจะบอกผู้สมัครว่ายังไม่ต้องแนบอะไร"}
        </p>
      ) : null}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={slots.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {slots.map((slot) => {
            const locked = isLockedDocSlot(slot.id);
            const working = busy === slot.id || busy === "order";

            return (
              <SortableRow
                key={slot.id}
                id={slot.id}
                className={`flex items-center gap-2.5 rounded-box border border-line bg-base-100 px-2.5 py-2 transition-colors ${
                  slot.visible ? "" : "opacity-60"
                }`}
              >
                {({ dragHandleRef, dragHandleProps }) => (
                  <>
                    <button
                      type="button"
                      aria-label="ลากเพื่อจัดลำดับ"
                      title="ลากเพื่อจัดลำดับ"
                      disabled={working}
                      ref={dragHandleRef}
                      className="flex size-7 flex-none touch-none items-center justify-center rounded-selector text-mut transition-colors hover:bg-base-200 hover:text-ink disabled:opacity-25"
                      {...dragHandleProps}
                    >
                      <GripVertical size={14} strokeWidth={1.8} aria-hidden />
                    </button>

                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-1.5 text-13 font-medium">
                        {slot.label}
                        {locked ? (
                          <Lock size={11} strokeWidth={2} aria-hidden className="text-mut" />
                        ) : null}
                        {slot.visible ? null : (
                          <span className="rounded-selector bg-base-200 px-1.5 py-px font-mono text-9-5 text-mut">
                            ซ่อนจากผู้สมัคร
                          </span>
                        )}
                      </span>
                      <span className="truncate font-mono text-10-5 text-mut">
                        รูปถ่าย · {slot.required ? "บังคับ" : "ไม่บังคับ"}
                        {slot.hint ? ` · ${slot.hint}` : ""}
                      </span>
                    </div>

                    {working ? (
                      <Loader2
                        size={14}
                        strokeWidth={2}
                        aria-hidden
                        className="flex-none animate-spin text-mut"
                      />
                    ) : null}

                    <div className="flex flex-none items-center gap-0.5">
                      <IconButton label="แก้ไข" onClick={() => setEditing(slot)}>
                        <Pencil size={14} strokeWidth={1.8} aria-hidden />
                      </IconButton>
                      <IconButton
                        label={locked ? "เอกสารหลักของระบบ ลบไม่ได้ — ซ่อนแทนได้" : "ลบ"}
                        danger
                        disabled={locked || working}
                        onClick={() => remove(slot)}
                      >
                        <Trash2 size={14} strokeWidth={1.8} aria-hidden />
                      </IconButton>
                    </div>
                  </>
                )}
              </SortableRow>
            );
          })}
        </SortableContext>
      </DndContext>

      {editing ? (
        <DocSlotEditor
          slot={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(next) => {
            onChange(next);
            setEditing(null);
          }}
        />
      ) : null}
    </section>
  );
}

/* ----------------------------------------------------------- กล่องเพิ่ม/แก้ */

function DocSlotEditor({
  slot,
  onClose,
  onSaved,
}: {
  /** `null` = เพิ่มใหม่ */
  slot: DocSlot | null;
  onClose: () => void;
  onSaved: (next: DocSlot[]) => void;
}) {
  const [label, setLabel] = useState(slot?.label ?? "");
  const [hint, setHint] = useState(slot?.hint ?? "");
  const [visible, setVisible] = useState(slot?.visible ?? true);
  const [required, setRequired] = useState(slot?.required ?? false);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const body = { label, hint, visible, required: visible && required };
      const next = slot
        ? await requestJson<DocSlot[]>(
            `/api/recruitment/doc-slots/${slot.id}`,
            { method: "PATCH", body },
            "บันทึกเอกสารไม่สำเร็จ",
          )
        : await requestJson<DocSlot[]>(
            "/api/recruitment/doc-slots",
            { method: "POST", body },
            "เพิ่มเอกสารไม่สำเร็จ",
          );
      toastSuccess(slot ? "บันทึกเอกสารแล้ว" : "เพิ่มเอกสารแล้ว");
      onSaved(next);
    } catch (err) {
      alertError(
        slot ? "บันทึกเอกสารไม่สำเร็จ" : "เพิ่มเอกสารไม่สำเร็จ",
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title={slot ? "แก้ไขเอกสาร" : "เพิ่มเอกสารใหม่"}
      subtitle={slot ? `รหัสอ้างอิง ${slot.id}` : undefined}
      onClose={onClose}
      width="560px"
      tone="plain"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-field border border-line px-3.5 py-2 text-13 text-mut transition-colors hover:text-ink"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !label.trim()}
            className="flex items-center gap-2 rounded-field bg-primary px-4 py-2 text-13 font-medium text-primary-content transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 size={13} strokeWidth={2} aria-hidden className="animate-spin" />
            ) : null}
            บันทึก
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          id="doc-label"
          label="ชื่อเอกสาร"
          value={label}
          onChange={setLabel}
          placeholder="เช่น ใบขับขี่ ด้านหลัง"
        />

        <TextField
          id="doc-hint"
          label="คำอธิบายใต้ช่อง"
          optional
          hint="บอกว่าต้องถ่ายให้เห็นอะไร ผู้สมัครจะถ่ายถูกตั้งแต่รอบแรก"
          value={hint}
          onChange={setHint}
          placeholder="เช่น ให้เห็นวันหมดอายุชัดเจน"
        />

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Toggle
              on={visible}
              onClick={() => setVisible((v) => !v)}
              label="แสดงในฟอร์มผู้สมัคร"
            />
            <Toggle
              on={visible && required}
              onClick={() => setRequired((v) => !v)}
              disabled={!visible}
              label="บังคับแนบ"
            />
          </div>
          <p className="text-11-5 leading-relaxed text-mut text-pretty">
            {visible
              ? required
                ? "ผู้สมัครต้องแนบก่อนจึงกดถัดไปได้"
                : "ผู้สมัครข้ามได้ ฝ่ายบุคคลแนบให้ทีหลังได้ที่หน้าผู้สมัคร"
              : "ผู้สมัครไม่เห็นช่องนี้ — ฝ่ายบุคคลยังแนบเองได้ที่หน้าผู้สมัคร"}
          </p>
        </div>
      </div>
    </ModalShell>
  );
}

/** ทรงเดียวกับสวิตช์ในกล่องแก้คำถาม (`question-editor.tsx`) */
function Toggle({
  on,
  onClick,
  label,
  disabled,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-field border px-3 py-2 text-12-5 transition-colors disabled:opacity-40 ${
        on ? "border-primary/50 bg-soft text-primary" : "border-line text-mut"
      }`}
    >
      {label}
    </button>
  );
}
