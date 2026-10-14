"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, Tags, Trash2, X } from "lucide-react";

import {
  Select,
  SelectField,
  TextField,
  isDropdownOpen,
  type SelectOption,
} from "@/components/ui/field";
import { departments, reasonGroups } from "@/lib/data";
import { requestJson } from "@/lib/http";
import { escapeHtml, runAction } from "@/lib/swal";
import type { MasterItem, MasterKind } from "@/lib/types";

/**
 * ปุ่ม “ประเภทเรื่อง” / “สาเหตุ” + หน้าจอจัดการ `master_complainte` ของ MongoDB
 *
 * **คอมโพเนนต์เดียวใช้ได้ทั้งสองชุด** — ต่างกันแค่ป้าย ไอคอน และผังกลุ่ม
 * (ประเภทเรื่องแบ่งตามหน่วยงาน · สาเหตุแบ่งตามกลุ่มสาเหตุ 6 กลุ่ม) ที่เหลือคือ
 * ตารางเพิ่ม/แก้/ปิดใช้งาน/ลบชุดเดียวกันหมด ดู `KIND` ข้างล่างเป็นจุดเดียวที่ต่างกัน
 *
 * **ข้อมูลกับคำสั่งเขียนอยู่ที่ปุ่ม ส่วนโมดัลถือแค่สถานะหน้าจอ** — โหลดครั้งแรก
 * เกิดตอนกดปุ่ม ไม่ใช่ตอน mount ของโมดัล จึงไม่ต้อง fetch ใน effect
 * (ผลพลอยได้: ปิดแล้วเปิดใหม่เห็นรายการเดิมทันที แล้วค่อยอัปเดตทับ)
 *
 * ⚠️ overlay ต้อง `createPortal` ไป `document.body` เสมอ ด้วยเหตุผลเดียวกับ
 * `new-case-modal.tsx` — `animate-rise` ของหน้าแม่มี transform ซึ่งกลายเป็น
 * containing block ของ `position: fixed` แล้วโมดัลจะไปจัดกลางเทียบ `<main>`
 */

interface KindMeta {
  /** ป้ายบนปุ่มและหัวโมดัล */
  label: string;
  subtitle: string;
  /** ป้ายของช่อง “กลุ่ม” — คนละความหมายกันในสองชุด */
  groupLabel: string;
  groupPlaceholder: string;
  namePlaceholder: string;
  emptyHint: string;
  options: SelectOption[];
  /** ข้อความเตือนตอนแก้ชื่อ — `null` = ไม่ต้องเตือน */
  renameWarning: string | null;
}

const KIND: Record<MasterKind, KindMeta> = {
  type: {
    label: "ประเภทเรื่อง",
    subtitle: "รายการที่ผู้รับผิดชอบเลือกได้ในคำร้อง — แยกตามหน่วยงาน",
    groupLabel: "หน่วยงาน",
    groupPlaceholder: "ทุกหน่วยงาน",
    namePlaceholder: "เช่น การซ่อมบำรุง / อุปกรณ์",
    emptyHint: "ยังไม่มีประเภทเรื่องในระบบ — กด “เพิ่มรายการ” เพื่อเริ่ม",
    options: departments.map((d) => ({ value: d.id, label: d.label })),
    renameWarning: null,
  },
  cause: {
    label: "สาเหตุ",
    subtitle: "สาเหตุหลักที่ผู้รับผิดชอบเลือกตอนจัดการเคส — แยกตามกลุ่มสาเหตุ",
    groupLabel: "กลุ่มสาเหตุ",
    groupPlaceholder: "ทุกกลุ่ม",
    namePlaceholder: "เช่น อุปกรณ์ชำรุดหรือเสื่อมสภาพ",
    emptyHint: "ยังไม่มีสาเหตุในระบบ — กด “เพิ่มรายการ” เพื่อเริ่ม",
    options: reasonGroups.map((g) => ({ value: g.code, label: g.label })),
    /* คำร้องเก่าเก็บ `root_cause` เป็นข้อความ ไม่ได้อ้างถึงแถวนี้ — เปลี่ยนชื่อแล้ว
       ของเก่าจึงยังแสดงข้อความเดิม ต้องบอกก่อนกด ไม่ใช่ให้ไปเจอเอาทีหลัง */
    renameWarning: "คำร้องที่บันทึกสาเหตุเดิมไว้แล้วยังแสดงข้อความเดิม ไม่เปลี่ยนตาม",
  },
};

/** ป้ายกลุ่ม — รหัสที่ระบบยังไม่รู้จักต้องยังอ่านออก ไม่ใช่หายไปเฉย ๆ */
const groupLabelOf = (kind: MasterKind, id: string) =>
  KIND[kind].options.find((o) => o.value === id)?.label ?? `กลุ่ม ${id}`;

interface Draft {
  group: string;
  name: string;
}

const emptyDraft: Draft = { group: "", name: "" };

export function MasterButton({
  kind,
  autoOpen = false,
}: {
  kind: MasterKind;
  /** เปิดกล่องค้างไว้ตั้งแต่แรก — ทางเข้าจากเมนู HR MASTER บนหน้า Home */
  autoOpen?: boolean;
}) {
  const router = useRouter();
  const meta = KIND[kind];
  const [open, setOpen] = useState(autoOpen);
  const [rows, setRows] = useState<MasterItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const failMessage = `ดึงรายการ${meta.label}ไม่สำเร็จ`;

  /**
   * อ่านรายการใหม่ทั้งชุด — เรียกทั้งตอนเปิดโมดัลและหลังทุกคำสั่งที่เขียน
   * **ไม่เดาผลลัพธ์เอง** ค่าที่เห็นบนจอจึงเป็นค่าที่เซิร์ฟเวอร์เก็บไว้จริง
   *
   * `includeInactive=1` เพราะหน้านี้ต้องเห็นของที่ปิดใช้งานไว้ด้วย ไม่งั้น
   * กดปิดแล้วแถวหายไปเลย แล้วเปิดกลับมาไม่ได้อีก
   */
  const reload = useCallback(async () => {
    try {
      const data = await requestJson<MasterItem[]>(
        `/api/complaint-master?kind=${kind}&includeInactive=1`,
        { method: "GET" },
        failMessage,
      );
      setRows(data);
      setLoadError(null);
    } catch (err) {
      setRows([]);
      setLoadError(err instanceof Error ? err.message : failMessage);
    }
  }, [kind, failMessage]);

  /* เปิดค้างมาจาก `autoOpen` — โหลดรายการให้ครั้งเดียว (ปกติโหลดตอนกดปุ่ม) */
  const autoLoaded = useRef(false);
  useEffect(() => {
    if (!autoOpen || autoLoaded.current) return;
    autoLoaded.current = true;
    void reload();
  }, [autoOpen, reload]);

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
      // ดรอปดาวน์ในหน้าคำร้องมาจาก server component — สั่งอ่านใหม่ด้วย
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
        className="btn-sec flex items-center gap-1.5 px-3.5 py-2 text-13 font-medium text-mut transition-colors hover:border-ink/30 hover:text-ink"
      >
        <Tags size={16} strokeWidth={1.8} aria-hidden />
        {meta.label}
      </button>

      {open ? (
        <MasterPanel
          kind={kind}
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

function MasterPanel({
  kind,
  rows,
  loadError,
  busy,
  write,
  onClose,
}: {
  kind: MasterKind;
  rows: MasterItem[] | null;
  loadError: string | null;
  busy: boolean;
  write: (opts: Parameters<typeof runAction>[0], after?: () => void) => void;
  onClose: () => void;
}) {
  const meta = KIND[kind];

  /** id ของแถวที่กำลังแก้ · `"new"` = กำลังเพิ่มของใหม่ · `null` = ไม่ได้แก้อะไร */
  const [editing, setEditing] = useState<string | null>(null);
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
    return filter === "all" ? rows : rows.filter((r) => r.group === filter);
  }, [rows, filter]);

  const filterOptions: SelectOption[] = [
    { value: "all", label: meta.groupPlaceholder },
    ...meta.options,
  ];

  const draftValid = Boolean(draft.group && draft.name.trim());

  function startAdd() {
    setEditing("new");
    // กรองอยู่ที่กลุ่มไหน ก็เดาว่ากำลังจะเพิ่มให้กลุ่มนั้น
    setDraft({ ...emptyDraft, group: filter === "all" ? "" : filter });
  }

  function startEdit(row: MasterItem) {
    setEditing(row.id);
    setDraft({ group: row.group, name: row.name });
  }

  const cancelEdit = () => {
    setEditing(null);
    setDraft(emptyDraft);
  };

  function save() {
    if (!draftValid || busy) return;

    const name = draft.name.trim();
    const isNew = editing === "new";
    const renamed = !isNew && rows?.find((r) => r.id === editing)?.name !== name;
    const warning = renamed ? meta.renameWarning : null;

    write(
      {
        confirm: {
          title: isNew ? `เพิ่ม${meta.label}นี้?` : "บันทึกการแก้ไข?",
          html: `${escapeHtml(groupLabelOf(kind, draft.group))}<span class="hrs-swal-quote">${escapeHtml(name)}</span>${
            warning ? escapeHtml(warning) : ""
          }`,
          confirmText: isNew ? "เพิ่ม" : "บันทึก",
        },
        pending: isNew ? "กำลังเพิ่ม…" : "กำลังบันทึก…",
        success: isNew ? `เพิ่ม “${name}” แล้ว` : `บันทึก “${name}” แล้ว`,
        failureTitle: isNew ? "เพิ่มไม่สำเร็จ" : "บันทึกไม่สำเร็จ",
        run: () =>
          isNew
            ? requestJson("/api/complaint-master", {
                method: "POST",
                body: { kind, group: draft.group, name },
              })
            : requestJson(`/api/complaint-master/${editing}`, {
                method: "PUT",
                body: { group: draft.group, name },
              }),
      },
      cancelEdit,
    );
  }

  function toggleActive(row: MasterItem) {
    const next = !row.active;

    write({
      confirm: {
        title: next ? `เปิดใช้งาน “${row.name}”?` : `ปิดใช้งาน “${row.name}”?`,
        text: next
          ? "จะกลับมาให้เลือกได้ในฟอร์มคำร้อง"
          : "จะไม่ขึ้นให้เลือกในคำร้องใหม่ — คำร้องเก่าที่ใช้รายการนี้อยู่ยังแสดงค่าเดิมตามปกติ",
        confirmText: next ? "เปิดใช้งาน" : "ปิดใช้งาน",
        tone: next ? "primary" : "warn",
      },
      pending: "กำลังบันทึก…",
      success: next ? "เปิดใช้งานแล้ว" : "ปิดใช้งานแล้ว",
      failureTitle: "เปลี่ยนสถานะไม่สำเร็จ",
      run: () =>
        requestJson(`/api/complaint-master/${row.id}`, {
          method: "PUT",
          body: { active: next },
        }),
    });
  }

  /**
   * ลบถาวร — **ประเภทเรื่องที่มีคำร้องอ้างถึงอยู่ NCAC ตอบ 409** พร้อมบอกจำนวน
   * และให้ใช้การปิดใช้งานแทน · ข้อความนั้นถูกส่งต่อไปขึ้นกล่องแดงตรง ๆ ไม่ได้ถูกกลบ
   * ส่วนสาเหตุลบได้เสมอ เพราะคำร้องเก็บเป็นข้อความไว้แล้ว
   */
  function remove(row: MasterItem) {
    const note =
      kind === "type"
        ? "ลบได้เฉพาะประเภทที่ยังไม่มีคำร้องไหนใช้ — ถ้ามีคำร้องใช้อยู่ระบบจะไม่ลบให้ ใช้ “ปิดใช้งาน” แทน"
        : "คำร้องที่บันทึกสาเหตุนี้ไว้แล้วยังแสดงข้อความเดิม แต่จะไม่มีให้เลือกอีก";

    write({
      confirm: {
        title: `ลบ “${row.name}” ถาวร?`,
        html: `${escapeHtml(note)}<span class="hrs-swal-quote">${escapeHtml(groupLabelOf(kind, row.group))}</span>`,
        confirmText: "ลบถาวร",
        tone: "danger",
      },
      pending: "กำลังลบ…",
      success: `ลบ “${row.name}” แล้ว`,
      failureTitle: "ลบไม่สำเร็จ",
      run: () =>
        requestJson(`/api/complaint-master/${row.id}`, {
          method: "DELETE",
          body: {},
        }),
    });
  }

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center p-3 sm:p-6">
      <button
        type="button"
        aria-label={`ปิดหน้าต่างจัดการ${meta.label}`}
        onClick={close}
        className="absolute inset-0 cursor-default bg-ink/45 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="master-title"
        className="relative flex max-h-[92dvh] w-full max-w-[720px] flex-col overflow-hidden rounded-[18px] border border-line bg-canvas shadow-[0_32px_80px_-24px_rgba(21,32,29,0.45)] outline-none animate-rise"
      >
        <header className="flex flex-none items-center justify-between gap-3 border-b border-line bg-base-100 px-5 py-4">
          <div className="min-w-0">
            <h2 id="master-title" className="text-15 font-semibold">
              {meta.label}
            </h2>
            <p className="mt-0.5 text-11-5 text-mut text-pretty">{meta.subtitle}</p>
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
            <span className="flex-none text-12 text-mut">{meta.groupLabel}</span>
            <Select
              value={filter}
              onChange={setFilter}
              label={`กรองตาม${meta.groupLabel}`}
              variant="bare"
              options={filterOptions}
            />
          </div>

          <button
            type="button"
            onClick={startAdd}
            disabled={busy || editing === "new"}
            className="btn-pri ml-auto flex items-center gap-1.5 px-3.5 py-2 text-13 font-medium disabled:opacity-40"
          >
            <Plus size={15} strokeWidth={2.2} aria-hidden />
            เพิ่มรายการ
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-5">
          {editing === "new" ? (
            <DraftCard
              title={`เพิ่ม${meta.label}ใหม่`}
              meta={meta}
              draft={draft}
              setDraft={setDraft}
              onSave={save}
              onCancel={cancelEdit}
              valid={draftValid}
              busy={busy}
            />
          ) : null}

          {loadError ? (
            <p className="rounded-field border border-alert/40 bg-alert/5 px-3.5 py-3 text-12-5 text-alert text-pretty">
              {loadError}
            </p>
          ) : null}

          {rows === null ? (
            <p className="px-1 py-8 text-center text-13 text-mut">กำลังโหลด…</p>
          ) : null}

          {rows !== null && !shown.length && !loadError ? (
            <p className="px-1 py-8 text-center text-13 text-mut text-pretty">
              {filter === "all"
                ? meta.emptyHint
                : `ยังไม่มี${meta.label}ของ ${groupLabelOf(kind, filter)}`}
            </p>
          ) : null}

          {shown.map((row) =>
            editing === row.id ? (
              <DraftCard
                key={row.id}
                title={`แก้ไข “${row.name}”`}
                meta={meta}
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
                groupLabel={groupLabelOf(kind, row.group)}
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
  groupLabel,
  disabled,
  onEdit,
  onToggle,
  onDelete,
}: {
  row: MasterItem;
  groupLabel: string;
  disabled: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-box border border-line bg-base-100 px-3.5 py-2.5 ${
        row.active ? "" : "opacity-60"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-13-5 font-medium">
          {row.name}
          {row.active ? null : (
            <span className="ml-2 rounded-full bg-base-200 px-1.5 py-0.5 text-10-5 font-normal text-mut">
              ปิดใช้งาน
            </span>
          )}
        </p>
        <p className="mt-0.5 truncate text-11-5 text-mut">{groupLabel}</p>
      </div>

      <ToolButton
        label={row.active ? `ปิดใช้งาน ${row.name}` : `เปิดใช้งาน ${row.name}`}
        onClick={onToggle}
        disabled={disabled}
        tone={row.active ? "mut" : "primary"}
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
  meta,
  draft,
  setDraft,
  onSave,
  onCancel,
  valid,
  busy,
}: {
  title: string;
  meta: KindMeta;
  draft: Draft;
  setDraft: (fn: (d: Draft) => Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  valid: boolean;
  busy: boolean;
}) {
  return (
    <div className="flex flex-col gap-3.5 rounded-box border border-primary/35 bg-base-100 p-3.5">
      <p className="text-13 font-medium">{title}</p>

      <div className="grid gap-3.5 sm:grid-cols-2">
        <SelectField
          id="master-group"
          label={meta.groupLabel}
          value={draft.group}
          onChange={(v) => setDraft((d) => ({ ...d, group: v }))}
          placeholder="เลือก…"
          options={meta.options}
          readOnly={busy}
        />
        <TextField
          id="master-name"
          label={`ชื่อ${meta.label}`}
          value={draft.name}
          onChange={(v) => setDraft((d) => ({ ...d, name: v }))}
          placeholder={meta.namePlaceholder}
          readOnly={busy}
        />
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="btn-sec px-3.5 py-2 text-13 text-mut hover:text-ink disabled:opacity-40"
        >
          ยกเลิก
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!valid || busy}
          className="rounded-field bg-primary px-4 py-2 text-13 font-medium text-primary-content transition-opacity disabled:opacity-40"
        >
          {busy ? "กำลังบันทึก…" : "บันทึก"}
        </button>
      </div>
    </div>
  );
}
