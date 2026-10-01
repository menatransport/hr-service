"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";

import { TextField } from "@/components/ui/field";
import { ModalShell } from "@/components/ui/modal-shell";
import { requestJson } from "@/lib/http";
import { runAction } from "@/lib/swal";
import { RECORD_CATEGORY_ICON, type RecordCategory } from "@/lib/record-case-flow";

/**
 * โมดัลจัดการ “ประเภทเคส” (master data) — เพิ่ม/แก้ไข/ลบตัวเลือกที่ใช้ในฟอร์มบันทึกเคส
 * และตัวกรองของคิว เก็บอยู่บน MongoDB คอลเลกชัน `record_categories`
 * (`lib/record-categories.ts`) — คนละคอลเลกชันกับตัวเคส
 *
 * แก้ไข/ลบที่นี่แล้ว `router.refresh()` ให้หน้าคิวอ่านชุดใหม่ทันที — เหมือนแพตเทิร์นที่
 * `RecordCaseForm` ใช้ตอนแก้ไขเคส · ปรับ `items` ในสเตตท้องถิ่นไปพร้อมกันด้วยเพื่อให้
 * รายการในโมดัลอัปเดตทันทีโดยไม่ต้องรอปิด-เปิดใหม่
 *
 * **ลบประเภทที่เคสเก่ายังอ้างถึงอยู่ได้** — ไม่ได้ไปแก้เคสเก่าตาม (ดูเหตุผลที่
 * `lib/record-categories.ts`) เคสนั้นจะแสดงประเภทเป็น “—” แทน เหมือนพฤติกรรมเดิม
 * ตอน `category` เป็นค่าว่าง
 */
export function RecordCategoryManager({
  categories,
  onClose,
}: {
  categories: RecordCategory[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState(categories);
  const [adding, setAdding] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    const value = adding.trim();
    if (!value) return;

    const out = await runAction({
      run: async () => {
        setBusy(true);
        try {
          return await requestJson<RecordCategory>(
            "/api/record-categories",
            { method: "POST", body: { label: value } },
            "เพิ่มประเภทเคสไม่สำเร็จ",
          );
        } finally {
          setBusy(false);
        }
      },
      success: (saved) => `เพิ่มประเภท “${saved.label}” แล้ว`,
      failureTitle: "เพิ่มประเภทเคสไม่สำเร็จ",
    });
    if (out.status !== "done") return;

    setItems((cur) => [...cur, out.data]);
    setAdding("");
    router.refresh();
  }

  function startEdit(c: RecordCategory) {
    setEditingId(c.id);
    setEditingLabel(c.label);
  }

  async function saveEdit(id: string) {
    const value = editingLabel.trim();
    if (!value) return;

    const out = await runAction({
      run: async () => {
        setBusy(true);
        try {
          return await requestJson<RecordCategory>(
            `/api/record-categories/${id}`,
            { method: "PUT", body: { label: value } },
            "แก้ไขประเภทเคสไม่สำเร็จ",
          );
        } finally {
          setBusy(false);
        }
      },
      success: "แก้ไขประเภทเคสแล้ว",
      failureTitle: "แก้ไขประเภทเคสไม่สำเร็จ",
    });
    if (out.status !== "done") return;

    setItems((cur) => cur.map((c) => (c.id === id ? out.data : c)));
    setEditingId(null);
    router.refresh();
  }

  async function remove(c: RecordCategory) {
    const out = await runAction({
      confirm: {
        title: `ลบประเภท “${c.label}”?`,
        text: "เคสที่เคยเลือกประเภทนี้ไว้จะแสดงเป็น “—” แทน ไม่ได้ถูกลบไปด้วย",
        tone: "danger",
        confirmText: "ลบ",
      },
      run: async () => {
        setBusy(true);
        try {
          await requestJson(
            `/api/record-categories/${c.id}`,
            { method: "DELETE" },
            "ลบประเภทเคสไม่สำเร็จ",
          );
        } finally {
          setBusy(false);
        }
      },
      success: `ลบประเภท “${c.label}” แล้ว`,
      failureTitle: "ลบประเภทเคสไม่สำเร็จ",
    });
    if (out.status !== "done") return;

    setItems((cur) => cur.filter((x) => x.id !== c.id));
    router.refresh();
  }

  const Icon = RECORD_CATEGORY_ICON;

  return (
    <ModalShell
      title="จัดการประเภทเคส"
      subtitle="เพิ่ม แก้ไข หรือลบตัวเลือกประเภทเคสที่ใช้ในฟอร์มบันทึกเคส"
      onClose={onClose}
      width="480px"
      tone="plain"
    >
      <ul className="flex flex-col divide-y divide-line rounded-box border border-line">
        {items.map((c) => (
          <li key={c.id} className="flex items-center gap-2 px-3 py-2">
            <Icon size={14} strokeWidth={1.7} className="flex-none text-mut" aria-hidden />

            {editingId === c.id ? (
              <>
                <div className="min-w-0 flex-1">
                  <TextField
                    id={`rc-cat-edit-${c.id}`}
                    label="แก้ไขชื่อประเภทเคส"
                    srLabel
                    readOnly={busy}
                    value={editingLabel}
                    onChange={setEditingLabel}
                  />
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => saveEdit(c.id)}
                  aria-label="บันทึก"
                  className="flex size-7 flex-none items-center justify-center rounded-selector text-primary transition-colors hover:bg-primary/10 disabled:opacity-45"
                >
                  <Check size={15} strokeWidth={2} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  aria-label="ยกเลิก"
                  className="flex size-7 flex-none items-center justify-center rounded-selector text-mut transition-colors hover:bg-base-200 hover:text-ink"
                >
                  <X size={15} strokeWidth={2} aria-hidden />
                </button>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate text-13">{c.label}</span>
                <button
                  type="button"
                  onClick={() => startEdit(c)}
                  aria-label={`แก้ไข ${c.label}`}
                  className="flex size-7 flex-none items-center justify-center rounded-selector text-mut transition-colors hover:bg-base-200 hover:text-ink"
                >
                  <Pencil size={13} strokeWidth={1.8} aria-hidden />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(c)}
                  aria-label={`ลบ ${c.label}`}
                  className="flex size-7 flex-none items-center justify-center rounded-selector text-mut transition-colors hover:bg-alert/10 hover:text-alert disabled:opacity-45"
                >
                  <Trash2 size={13} strokeWidth={1.8} aria-hidden />
                </button>
              </>
            )}
          </li>
        ))}

        {items.length ? null : (
          <li className="px-3 py-4 text-center text-12-5 text-mut">ยังไม่มีประเภทเคส</li>
        )}
      </ul>

      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <TextField
            id="rc-cat-add"
            label="เพิ่มประเภทเคสใหม่"
            srLabel
            readOnly={busy}
            placeholder="เพิ่มประเภทเคสใหม่…"
            value={adding}
            onChange={setAdding}
          />
        </div>
        <button
          type="button"
          disabled={busy || !adding.trim()}
          onClick={add}
          className="flex flex-none items-center gap-1.5 rounded-field bg-primary px-3.5 py-2.5 text-12-5 font-medium text-primary-content transition-opacity hover:opacity-90 disabled:opacity-45"
        >
          <Plus size={14} strokeWidth={2} aria-hidden />
          เพิ่ม
        </button>
      </div>
    </ModalShell>
  );
}
