"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, Tags, Trash2, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  Select,
  SelectField,
  TextField,
  isDropdownOpen,
  type SelectOption,
} from "@/components/ui/field";
import { COMPLAINT_ICON_NAMES, complaintIcon } from "@/lib/complaint-icons";
import { departments } from "@/lib/data";
import { requestJson } from "@/lib/http";
import { escapeHtml, runAction } from "@/lib/swal";
import type { ComplaintType } from "@/lib/types";

/**
 * ปุ่ม “ประเภทเรื่อง” + หน้าจอจัดการตาราง `complaint_master` ของ NCAC
 *
 * เดิมรายการนี้ hard-code อยู่ใน `lib/data.ts` แก้ทีต้อง deploy ใหม่ —
 * ตอนนี้ HR แก้เองได้จากหน้าคิวคำร้อง (เพิ่ม / แก้ไข / ปิดใช้งาน / ลบ)
 *
 * **ข้อมูลกับคำสั่งเขียนอยู่ที่ปุ่ม ส่วนโมดัลถือแค่สถานะหน้าจอ** — โหลดครั้งแรก
 * เกิดตอนกดปุ่ม ไม่ใช่ตอน mount ของโมดัล จึงไม่ต้อง fetch ใน effect
 * (ผลพลอยได้: ปิดแล้วเปิดใหม่เห็นรายการเดิมทันที แล้วค่อยอัปเดตทับ)
 *
 * ⚠️ overlay ต้อง `createPortal` ไป `document.body` เสมอ ด้วยเหตุผลเดียวกับ
 * `new-case-modal.tsx` — `animate-rise` ของหน้าแม่มี transform ซึ่งกลายเป็น
 * containing block ของ `position: fixed` แล้วโมดัลจะไปจัดกลางเทียบ `<main>`
 */

/** แถวพร้อมไอคอนที่แปลงเป็นคอมโพเนนต์แล้ว — แปลงตอนเตรียมข้อมูล ไม่ใช่ตอน render */
type TypeRow = ComplaintType & { Icon: LucideIcon };

interface Draft {
  departmentId: string;
  name: string;
  icon: string;
  sortOrder: string;
}

const emptyDraft: Draft = {
  departmentId: "",
  name: "",
  icon: "",
  sortOrder: "",
};

const departmentOptions: SelectOption[] = departments.map((d) => ({
  value: d.id,
  label: d.label,
  icon: d.icon,
}));

const iconOptions: SelectOption[] = COMPLAINT_ICON_NAMES.map((name) => ({
  value: name,
  label: name,
  icon: complaintIcon(name),
}));

/** ป้ายหน่วยงาน — รหัสที่ระบบยังไม่รู้จักต้องยังอ่านออก ไม่ใช่หายไปเฉย ๆ */
const departmentLabelOf = (id: string) =>
  departments.find((d) => d.id === id)?.label ?? `หน่วยงาน ${id}`;

export function ComplaintTypeButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<TypeRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * อ่านรายการใหม่ทั้งชุด — เรียกทั้งตอนเปิดโมดัลและหลังทุกคำสั่งที่เขียน
   * **ไม่เดาผลลัพธ์เอง** ค่าที่เห็นบนจอจึงเป็นค่าที่เซิร์ฟเวอร์เก็บไว้จริง
   *
   * `includeInactive=1` เพราะหน้านี้ต้องเห็นของที่ปิดใช้งานไว้ด้วย ไม่งั้น
   * กดปิดแล้วแถวหายไปเลย แล้วเปิดกลับมาไม่ได้อีก
   */
  const reload = useCallback(async () => {
    try {
      const data = await requestJson<ComplaintType[]>(
        "/api/complaint-types?includeInactive=1",
        { method: "GET" },
        "ดึงรายการประเภทเรื่องไม่สำเร็จ",
      );
      setRows(data.map((t) => ({ ...t, Icon: complaintIcon(t.icon) })));
      setLoadError(null);
    } catch (err) {
      setRows([]);
      setLoadError(
        err instanceof Error ? err.message : "ดึงรายการประเภทเรื่องไม่สำเร็จ",
      );
    }
  }, []);

  /** ตัวกลางของทุกคำสั่งที่เขียนจริง — ยิง → อ่านรายการใหม่ → รีเฟรชหน้าเบื้องหลัง */
  const write = useCallback(
    async (opts: Parameters<typeof runAction>[0], after?: () => void) => {
      const out = await runAction({
        ...opts,
        run: async () => {
          setBusy(true);
          try {
            return await opts.run();
          } finally {
            setBusy(false);
          }
        },
      });

      if (out.status !== "done") return;
      after?.();
      await reload();
      // ดรอปดาวน์ประเภทเรื่องในหน้าคำร้องมาจาก server component — สั่งอ่านใหม่ด้วย
      router.refresh();
    },
    [reload, router],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          void reload();
        }}
        className="flex items-center gap-1.5 rounded-field border border-line bg-base-100 px-3.5 py-2 text-[13px] font-medium text-mut transition-colors hover:border-ink/30 hover:text-ink"
      >
        <Tags size={16} strokeWidth={1.8} aria-hidden />
        ประเภทเรื่อง
      </button>

      {open ? (
        <ComplaintTypePanel
          rows={rows}
          loadError={loadError}
          busy={busy}
          write={write}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function ComplaintTypePanel({
  rows,
  loadError,
  busy,
  write,
  onClose,
}: {
  rows: TypeRow[] | null;
  loadError: string | null;
  busy: boolean;
  write: (opts: Parameters<typeof runAction>[0], after?: () => void) => void;
  onClose: () => void;
}) {
  /** id ของแถวที่กำลังแก้ · `"new"` = กำลังเพิ่มของใหม่ · `null` = ไม่ได้แก้อะไร */
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [filter, setFilter] = useState("all");

  const busyRef = useRef(busy);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  const close = useCallback(() => {
    // ปิดกลางคันระหว่างยิงจริงไม่ได้ — ผลลัพธ์จะไม่มีที่ไปแสดง
    if (busyRef.current) return;
    onClose();
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (isDropdownOpen()) return;
      close();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [close]);

  const shown = useMemo(() => {
    if (!rows) return [];
    return filter === "all" ? rows : rows.filter((r) => r.departmentId === filter);
  }, [rows, filter]);

  const filterOptions: SelectOption[] = [
    { value: "all", label: "ทุกหน่วยงาน" },
    ...departmentOptions,
  ];

  const draftValid = Boolean(draft.departmentId && draft.name.trim());

  function startAdd() {
    setEditing("new");
    // กรองอยู่ที่หน่วยงานไหน ก็เดาว่ากำลังจะเพิ่มให้หน่วยงานนั้น
    setDraft({ ...emptyDraft, departmentId: filter === "all" ? "" : filter });
  }

  function startEdit(row: TypeRow) {
    setEditing(row.id);
    setDraft({
      departmentId: row.departmentId,
      name: row.name,
      icon: row.icon ?? "",
      sortOrder: String(row.sortOrder),
    });
  }

  const cancelEdit = () => {
    setEditing(null);
    setDraft(emptyDraft);
  };

  function save() {
    if (!draftValid || busy) return;

    const name = draft.name.trim();
    const isNew = editing === "new";
    const body = {
      departmentId: draft.departmentId,
      name,
      icon: draft.icon || null,
      sortOrder: draft.sortOrder ? Number(draft.sortOrder) : 0,
    };

    write(
      {
        confirm: {
          title: isNew ? "เพิ่มประเภทเรื่องนี้?" : "บันทึกการแก้ไข?",
          html: `${escapeHtml(departmentLabelOf(draft.departmentId))}<span class="hrs-swal-quote">${escapeHtml(name)}</span>`,
          confirmText: isNew ? "เพิ่ม" : "บันทึก",
        },
        pending: isNew ? "กำลังเพิ่ม…" : "กำลังบันทึก…",
        success: isNew ? `เพิ่ม “${name}” แล้ว` : `บันทึก “${name}” แล้ว`,
        failureTitle: isNew ? "เพิ่มไม่สำเร็จ" : "บันทึกไม่สำเร็จ",
        run: () =>
          isNew
            ? requestJson("/api/complaint-types", { method: "POST", body })
            : requestJson(`/api/complaint-types/${editing}`, {
                method: "PUT",
                body,
              }),
      },
      cancelEdit,
    );
  }

  function toggleActive(row: TypeRow) {
    const next = !row.isActive;

    write({
      confirm: {
        title: next ? `เปิดใช้งาน “${row.name}”?` : `ปิดใช้งาน “${row.name}”?`,
        text: next
          ? "จะกลับมาให้เลือกได้ในฟอร์มคำร้องของหน่วยงานนี้"
          : "จะไม่ขึ้นให้เลือกในคำร้องใหม่ — คำร้องเก่าที่ใช้ประเภทนี้อยู่ยังแสดงชื่อเดิมตามปกติ",
        confirmText: next ? "เปิดใช้งาน" : "ปิดใช้งาน",
        tone: next ? "primary" : "warn",
      },
      pending: "กำลังบันทึก…",
      success: next ? "เปิดใช้งานแล้ว" : "ปิดใช้งานแล้ว",
      failureTitle: "เปลี่ยนสถานะไม่สำเร็จ",
      run: () =>
        requestJson(`/api/complaint-types/${row.id}`, {
          method: "PUT",
          body: { isActive: next },
        }),
    });
  }

  /**
   * ลบถาวร — **NCAC ตอบ 409 ถ้ามีคำร้องอ้างถึงอยู่** พร้อมบอกจำนวนและให้ใช้
   * การปิดใช้งานแทน · ข้อความนั้นถูกส่งต่อไปขึ้นกล่องแดงตรง ๆ ไม่ได้ถูกกลบ
   */
  function remove(row: TypeRow) {
    write({
      confirm: {
        title: `ลบ “${row.name}” ถาวร?`,
        html: `ลบได้เฉพาะประเภทที่ยังไม่มีคำร้องไหนใช้ — ถ้ามีคำร้องใช้อยู่ระบบจะไม่ลบให้ ใช้ “ปิดใช้งาน” แทน<span class="hrs-swal-quote">${escapeHtml(departmentLabelOf(row.departmentId))}</span>`,
        confirmText: "ลบถาวร",
        tone: "danger",
      },
      pending: "กำลังลบ…",
      success: `ลบ “${row.name}” แล้ว`,
      failureTitle: "ลบไม่สำเร็จ",
      run: () =>
        requestJson(`/api/complaint-types/${row.id}`, {
          method: "DELETE",
          body: {},
        }),
    });
  }

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center p-3 sm:p-6">
      <button
        type="button"
        aria-label="ปิดหน้าต่างจัดการประเภทเรื่อง"
        onClick={close}
        className="absolute inset-0 cursor-default bg-ink/45 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="complaint-type-title"
        className="relative flex max-h-[92dvh] w-full max-w-[720px] flex-col overflow-hidden rounded-[18px] border border-line bg-canvas shadow-[0_32px_80px_-24px_rgba(21,32,29,0.45)] outline-none animate-rise"
      >
        <header className="flex flex-none items-center justify-between gap-3 border-b border-line bg-base-100 px-5 py-4">
          <div className="min-w-0">
            <h2 id="complaint-type-title" className="text-[15px] font-semibold">
              ประเภทเรื่อง
            </h2>
            <p className="mt-0.5 text-[11.5px] text-mut text-pretty">
              รายการที่ผู้รับผิดชอบเลือกได้ในคำร้อง — แยกตามหน่วยงาน
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="ปิด"
            disabled={busy}
            className="flex size-8 flex-none items-center justify-center rounded-selector text-mut transition-colors hover:bg-base-200 hover:text-ink disabled:opacity-40"
          >
            <X size={17} strokeWidth={1.9} aria-hidden />
          </button>
        </header>

        <div className="flex flex-none items-center gap-2 border-b border-line bg-base-100 px-5 py-3">
          <div className="flex items-center gap-2 rounded-field border border-line px-3 py-1.5">
            <span className="flex-none text-[12px] text-mut">หน่วยงาน</span>
            <Select
              value={filter}
              onChange={setFilter}
              label="กรองตามหน่วยงาน"
              variant="bare"
              options={filterOptions}
            />
          </div>

          <button
            type="button"
            onClick={startAdd}
            disabled={busy || editing === "new"}
            className="ml-auto flex items-center gap-1.5 rounded-field bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-content transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Plus size={15} strokeWidth={2.2} aria-hidden />
            เพิ่มประเภท
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-5">
          {editing === "new" ? (
            <DraftCard
              title="เพิ่มประเภทเรื่องใหม่"
              draft={draft}
              setDraft={setDraft}
              onSave={save}
              onCancel={cancelEdit}
              valid={draftValid}
              busy={busy}
            />
          ) : null}

          {loadError ? (
            <p className="rounded-field border border-alert/40 bg-alert/5 px-3.5 py-3 text-[12.5px] text-alert text-pretty">
              {loadError}
            </p>
          ) : null}

          {rows === null ? (
            <p className="px-1 py-8 text-center text-[13px] text-mut">กำลังโหลด…</p>
          ) : null}

          {rows !== null && !shown.length && !loadError ? (
            <p className="px-1 py-8 text-center text-[13px] text-mut text-pretty">
              {filter === "all"
                ? "ยังไม่มีประเภทเรื่องในระบบ — กด “เพิ่มประเภท” เพื่อเริ่ม"
                : `ยังไม่มีประเภทเรื่องของ ${departmentLabelOf(filter)}`}
            </p>
          ) : null}

          {shown.map((row) =>
            editing === row.id ? (
              <DraftCard
                key={row.id}
                title={`แก้ไข “${row.name}”`}
                draft={draft}
                setDraft={setDraft}
                onSave={save}
                onCancel={cancelEdit}
                valid={draftValid}
                busy={busy}
              />
            ) : (
              <Row
                key={row.id}
                row={row}
                /* กำลังแก้แถวอื่นอยู่ = กดอะไรกับแถวที่เหลือไม่ได้ กันแก้ทับซ้อนกัน */
                disabled={busy || editing !== null}
                onEdit={() => startEdit(row)}
                onToggle={() => toggleActive(row)}
                onDelete={() => remove(row)}
              />
            ),
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Row({
  row,
  disabled,
  onEdit,
  onToggle,
  onDelete,
}: {
  row: TypeRow;
  disabled: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-box border border-line bg-base-100 px-3.5 py-2.5 ${
        row.isActive ? "" : "opacity-60"
      }`}
    >
      <span className="flex size-8 flex-none items-center justify-center rounded-selector bg-soft text-primary">
        <row.Icon size={15} strokeWidth={1.7} aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium">
          {row.name}
          {row.isActive ? null : (
            <span className="ml-2 rounded-full bg-base-200 px-1.5 py-0.5 text-[10.5px] font-normal text-mut">
              ปิดใช้งาน
            </span>
          )}
        </p>
        <p className="mt-0.5 truncate text-[11.5px] text-mut">
          {departmentLabelOf(row.departmentId)} · ลำดับ {row.sortOrder}
        </p>
      </div>

      <ToolButton
        label={row.isActive ? `ปิดใช้งาน ${row.name}` : `เปิดใช้งาน ${row.name}`}
        onClick={onToggle}
        disabled={disabled}
        tone={row.isActive ? "mut" : "primary"}
      >
        <Check size={15} strokeWidth={1.9} aria-hidden />
      </ToolButton>

      <ToolButton
        label={`แก้ไข ${row.name}`}
        onClick={onEdit}
        disabled={disabled}
        tone="mut"
      >
        <Pencil size={14} strokeWidth={1.8} aria-hidden />
      </ToolButton>

      <ToolButton
        label={`ลบ ${row.name}`}
        onClick={onDelete}
        disabled={disabled}
        tone="alert"
      >
        <Trash2 size={15} strokeWidth={1.8} aria-hidden />
      </ToolButton>
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  disabled,
  tone,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  tone: "mut" | "primary" | "alert";
  children: React.ReactNode;
}) {
  const hover =
    tone === "alert"
      ? "hover:bg-alert/10 hover:text-alert"
      : tone === "primary"
        ? "text-primary hover:bg-soft"
        : "hover:bg-base-200 hover:text-ink";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex size-8 flex-none cursor-pointer items-center justify-center rounded-selector text-mut/80 transition-colors disabled:pointer-events-none disabled:opacity-40 ${hover}`}
    >
      {children}
    </button>
  );
}

function DraftCard({
  title,
  draft,
  setDraft,
  onSave,
  onCancel,
  valid,
  busy,
}: {
  title: string;
  draft: Draft;
  setDraft: (fn: (d: Draft) => Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  valid: boolean;
  busy: boolean;
}) {
  return (
    <div className="flex flex-col gap-3.5 rounded-box border border-primary/35 bg-base-100 p-3.5">
      <p className="text-[13px] font-medium">{title}</p>

      <div className="grid gap-3.5 sm:grid-cols-2">
        <SelectField
          id="ct-department"
          label="หน่วยงานผู้รับผิดชอบ"
          value={draft.departmentId}
          onChange={(v) => setDraft((d) => ({ ...d, departmentId: v }))}
          placeholder="เลือก…"
          options={departmentOptions}
          readOnly={busy}
        />
        <TextField
          id="ct-name"
          label="ชื่อประเภทเรื่อง"
          value={draft.name}
          onChange={(v) => setDraft((d) => ({ ...d, name: v }))}
          placeholder="เช่น การซ่อมบำรุง / อุปกรณ์"
          readOnly={busy}
        />
        <SelectField
          id="ct-icon"
          label="ไอคอน"
          value={draft.icon}
          onChange={(v) => setDraft((d) => ({ ...d, icon: v }))}
          placeholder="ไม่ระบุ (ใช้ไอคอนกลาง)"
          options={iconOptions}
          readOnly={busy}
          optional
          clearable
        />
        {/* <TextField
          id="ct-sort"
          label="ลำดับการแสดง"
          value={draft.sortOrder}
          onChange={(v) =>
            // เก็บเป็นข้อความแต่รับเฉพาะตัวเลข — `NumberField` ใช้ไม่ได้เพราะช่องนี้
            // ว่างไว้ได้ (ว่าง = 0) แล้วค่า `null` ของมันจะปนกับ “ยังไม่กรอก”
            setDraft((d) => ({ ...d, sortOrder: v.replace(/\D/g, "") }))
          }
          placeholder="0"
          readOnly={busy}
          optional
        /> */}
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-field border border-line px-3.5 py-2 text-[13px] text-mut hover:text-ink disabled:opacity-40"
        >
          ยกเลิก
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!valid || busy}
          className="rounded-field bg-primary px-4 py-2 text-[13px] font-medium text-primary-content transition-opacity disabled:opacity-40"
        >
          {busy ? "กำลังบันทึก…" : "บันทึก"}
        </button>
      </div>
    </div>
  );
}
