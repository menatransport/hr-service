"use client";

import { useMemo, useState } from "react";
import { FolderPlus, Pencil, Plus, Trash2 } from "lucide-react";

import { SearchField } from "@/components/ui/field";
import {
  SegmentedControl,
  SummaryPanel,
  SummaryStat,
  SummaryStats,
  SummaryStrip,
  SummaryToolbar,
} from "@/components/ui/summary-panel";
import { requestJson } from "@/lib/http";
import { runAction } from "@/lib/swal";
import {
  CategoryEditor,
  ReasonEditor,
} from "@/app/recruitment/_components/admin/resign-reason-editors";
import {
  EXIT_TYPES,
  EXIT_TYPE_CHIP,
  type ExitType,
  type ResignCategory,
  type ResignMaster,
  type ResignReason,
} from "@/app/recruitment/_lib/resign-reasons/types";

/**
 * หน้าตั้งค่า Reason Code Master — หมวดเป็นการ์ด รหัสเป็นแถวในการ์ด
 *
 * ทุกการเขียนยิง API แล้ว **เอาค่าที่เซิร์ฟเวอร์ตอบกลับมาใส่แทน** ไม่เดาผลเอง
 * (หลักเดียวกับคลังคำถาม) — บันทึกไม่ผ่านหน้าจอจึงยังเป็นค่าเดิม
 *
 * รหัส/อักษรนำหมวดแก้ไม่ได้หลังสร้าง เพราะระเบียนที่บันทึกแล้วอ้างอยู่ — ถ้าตั้งผิด
 * ให้ปิดใช้หรือลบแล้วสร้างใหม่ (ของเก่าเก็บสำเนาป้ายไว้แล้ว ไม่เสียหาย)
 */

type Editing =
  | { kind: "reason"; reason: ResignReason | null; categoryId: string }
  | { kind: "category"; category: ResignCategory | null }
  | null;

type ExitFilter = ExitType | "all";

const API = "/api/recruitment/resign-reasons";

/** จุดสีของประเภทการออก — สีเดียวกับตัวหนังสือของชิป `EXIT_TYPE_CHIP` */
const EXIT_TYPE_DOT: Record<ExitType, string> = {
  vol: "bg-st-live-ink",
  inv: "bg-alert",
  disap: "bg-st-wait-ink",
};

export function ResignReasonsView({ initial }: { initial: ResignMaster }) {
  const [master, setMaster] = useState(initial);
  const [q, setQ] = useState("");
  const [exit, setExit] = useState<ExitFilter>("all");
  const [editing, setEditing] = useState<Editing>(null);

  const { categories, reasons } = master;
  const sortedCats = useMemo(
    () => [...categories].sort((a, b) => a.order - b.order),
    [categories],
  );

  const needle = q.trim().toLowerCase();
  const visible = (r: ResignReason) =>
    (exit === "all" || r.exitType === exit) &&
    (!needle ||
      r.code.toLowerCase().includes(needle) ||
      r.label.toLowerCase().includes(needle) ||
      r.description.toLowerCase().includes(needle));
  const filtering = Boolean(needle) || exit !== "all";

  const activeCount = reasons.filter((r) => r.active).length;
  const countBy = (t: ExitType) => reasons.filter((r) => r.exitType === t).length;

  /* ---------------------------------------------------------- เขียน */

  function putReason(next: ResignReason) {
    setMaster((m) => ({
      ...m,
      reasons: m.reasons.some((r) => r.id === next.id)
        ? m.reasons.map((r) => (r.id === next.id ? next : r))
        : [...m.reasons, next],
    }));
  }

  function putCategory(next: ResignCategory) {
    setMaster((m) => ({
      ...m,
      categories: m.categories.some((c) => c.id === next.id)
        ? m.categories.map((c) => (c.id === next.id ? next : c))
        : [...m.categories, next],
    }));
  }

  async function toggleActive(r: ResignReason) {
    const out = await runAction({
      run: () =>
        requestJson<ResignReason>(
          `${API}/${r.id}`,
          { method: "PATCH", body: { active: !r.active } },
          "เปลี่ยนสถานะไม่สำเร็จ",
        ),
      success: r.active ? `ปิดใช้ ${r.code} แล้ว` : `เปิดใช้ ${r.code} แล้ว`,
      failureTitle: "เปลี่ยนสถานะไม่สำเร็จ",
    });
    if (out.status === "done") putReason(out.data);
  }

  async function removeReason(r: ResignReason) {
    const out = await runAction({
      confirm: {
        title: `ลบรหัส ${r.code}?`,
        text: `“${r.label}” จะหายจากตัวเลือกทันที ระเบียนที่เคยเลือกรหัสนี้ยังอ่านได้ตามเดิม เพราะเก็บสำเนาป้ายไว้แล้ว · ถ้าแค่ไม่อยากให้เลือกอีก ใช้ “ปิดใช้” แทนจะย้อนกลับได้`,
        confirmText: "ลบรหัส",
        tone: "danger",
      },
      run: () => requestJson(`${API}/${r.id}`, { method: "DELETE" }, "ลบรหัสไม่สำเร็จ"),
      success: `ลบรหัส ${r.code} แล้ว`,
      failureTitle: "ลบรหัสไม่สำเร็จ",
    });
    if (out.status === "done")
      setMaster((m) => ({ ...m, reasons: m.reasons.filter((x) => x.id !== r.id) }));
  }

  async function removeCategory(c: ResignCategory) {
    const out = await runAction({
      confirm: {
        title: `ลบหมวด ${c.prefix} · ${c.label}?`,
        text: "ลบได้เฉพาะหมวดที่ไม่มีรหัสเหลืออยู่แล้ว",
        confirmText: "ลบหมวด",
        tone: "danger",
      },
      run: () =>
        requestJson(`${API}/categories/${c.id}`, { method: "DELETE" }, "ลบหมวดไม่สำเร็จ"),
      success: `ลบหมวด ${c.prefix} แล้ว`,
      failureTitle: "ลบหมวดไม่สำเร็จ",
    });
    if (out.status === "done")
      setMaster((m) => ({ ...m, categories: m.categories.filter((x) => x.id !== c.id) }));
  }

  /* ---------------------------------------------------------- หน้าจอ */

  return (
    <div className="flex flex-col gap-4">
      {/* สรุป + เครื่องมือ */}
      <SummaryPanel label="สรุปรหัสเหตุผล">
        <SummaryStats>
          <SummaryStat
            lead
            label="รหัสทั้งหมด"
            value={reasons.length}
            sub={`เปิดใช้ ${activeCount} · ${categories.length} หมวด`}
          />
          {EXIT_TYPES.map((t) => (
            <SummaryStat
              key={t.value}
              label={`${t.code} · ${t.label}`}
              value={countBy(t.value)}
              share={countBy(t.value) / (reasons.length || 1)}
              dot={EXIT_TYPE_DOT[t.value]}
            />
          ))}
        </SummaryStats>

        <SummaryToolbar>
          <SearchField
            value={q}
            onChange={setQ}
            label="ค้นหารหัสเหตุผล"
            placeholder="ค้นรหัส (P4) หรือคำในเหตุผล…"
            tone="filled"
            className="lg:max-w-sm lg:flex-1"
          />
          <SegmentedControl
            label="กรองประเภทการออก"
            value={exit}
            onChange={setExit}
            options={[
              { value: "all", label: "ทุกประเภท" },
              ...EXIT_TYPES.map((t) => ({ value: t.value, label: t.code, dot: EXIT_TYPE_DOT[t.value] })),
            ]}
            className="w-full sm:w-auto sm:self-start lg:self-auto"
          />

          <div className="flex gap-2 lg:ml-auto">
            <button
              type="button"
              onClick={() => setEditing({ kind: "category", category: null })}
              className="btn-sec flex flex-1 cursor-pointer items-center justify-center gap-1.5 px-3 py-2 text-13 transition-colors hover:border-primary/40 hover:text-primary sm:flex-none"
            >
              <FolderPlus size={15} strokeWidth={1.8} aria-hidden />
              เพิ่มหมวด
            </button>
            <button
              type="button"
              onClick={() =>
                setEditing({ kind: "reason", reason: null, categoryId: sortedCats[0]?.id ?? "" })
              }
              disabled={!sortedCats.length}
              className="btn-pri flex flex-1 cursor-pointer items-center justify-center gap-1.5 px-3.5 py-2 text-13 font-medium disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
            >
              <Plus size={15} strokeWidth={2} aria-hidden />
              เพิ่มรหัส
            </button>
          </div>
        </SummaryToolbar>

        {/* ทางลัดไปหมวด */}
        {sortedCats.length ? (
          <SummaryStrip className="py-2.5">
            <nav aria-label="ไปที่หมวด" className="flex gap-1.5 overflow-x-auto scrollbar-thin">
              {sortedCats.map((c) => (
                <a
                  key={c.id}
                  href={`#cat-${c.prefix}`}
                  className="group flex flex-none items-center gap-2 rounded-full border border-line bg-base-100 py-0.5 pr-3 pl-0.5 text-12 text-mut transition-colors hover:border-primary/40 hover:text-primary"
                >
                  <span className="flex size-6 items-center justify-center rounded-full bg-soft font-mono text-11-5 font-semibold text-primary transition-colors group-hover:bg-primary group-hover:text-primary-content">
                    {c.prefix}
                  </span>
                  {c.label}
                </a>
              ))}
            </nav>
          </SummaryStrip>
        ) : null}
      </SummaryPanel>

      {/* หมวดละการ์ด */}
      {sortedCats.map((c) => {
        const all = reasons.filter((r) => r.categoryId === c.id);
        const rows = all.filter(visible);
        if (filtering && !rows.length) return null;

        return (
          <section
            key={c.id}
            id={`cat-${c.prefix}`}
            className="scroll-mt-20 overflow-hidden rounded-box border border-line bg-base-100 elev-card"
          >
            <header className="flex flex-wrap items-center gap-3 border-b border-line-strong bg-head px-4 py-3">
              <span className="flex size-9 flex-none items-center justify-center rounded-field bg-base-100 font-mono text-15 font-semibold text-primary">
                {c.prefix}
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <h3 className="text-14 font-semibold text-white">{c.label}</h3>
                <p className="text-11-5 text-mut">
                  {all.length} รหัส · ค่าตั้งต้น{" "}
                  {EXIT_TYPES.find((t) => t.value === c.exitType)?.label}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditing({ kind: "reason", reason: null, categoryId: c.id })}
                  className="flex min-h-9 cursor-pointer items-center gap-1 rounded-field px-2.5 text-12-5 text-primary transition-colors hover:bg-base-100"
                >
                  <Plus size={14} strokeWidth={2} aria-hidden />
                  เพิ่มรหัส{c.prefix}
                </button>
                <IconButton label={`แก้ไขหมวด ${c.prefix}`} onClick={() => setEditing({ kind: "category", category: c })}>
                  <Pencil size={15} strokeWidth={1.8} aria-hidden />
                </IconButton>
                <IconButton
                  label={all.length ? `ลบหมวด ${c.prefix} ไม่ได้ — ยังมีรหัสอยู่` : `ลบหมวด ${c.prefix}`}
                  onClick={() => removeCategory(c)}
                  disabled={all.length > 0}
                  danger
                >
                  <Trash2 size={15} strokeWidth={1.8} aria-hidden />
                </IconButton>
              </div>
            </header>

            {rows.length ? (
              <ul className="divide-y divide-line">
                {rows.map((r) => (
                  <li
                    key={r.id}
                    className={`group grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-2.5 transition-colors hover:bg-base-200/50 sm:grid-cols-[3.25rem_minmax(0,1fr)_7.5rem_auto] ${
                      r.active ? "" : "opacity-55"
                    }`}
                  >
                    <span className="font-mono text-13 font-semibold text-ink">{r.code}</span>
                    <div className="min-w-0">
                      <p className="text-13 text-pretty">{r.label}</p>
                      {r.description ? (
                        <p className="text-11-5 text-mut text-pretty">{r.description}</p>
                      ) : null}
                    </div>
                    <span className="col-start-2 row-start-2 sm:col-start-auto sm:row-start-auto">
                      <span className={`chip ${EXIT_TYPE_CHIP[r.exitType]}`}>
                        {EXIT_TYPES.find((t) => t.value === r.exitType)?.code}
                      </span>
                      {!r.active ? <span className="chip ml-1 text-mut">ปิดใช้</span> : null}
                    </span>
                    <div className="col-start-3 row-span-2 row-start-1 flex items-center gap-0.5 sm:col-start-auto sm:row-span-1 sm:row-start-auto">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={r.active}
                        aria-label={r.active ? `ปิดใช้ ${r.code}` : `เปิดใช้ ${r.code}`}
                        title={r.active ? "เปิดใช้อยู่ — กดเพื่อซ่อนจากตัวเลือก" : "ปิดใช้อยู่ — กดเพื่อเปิดใช้"}
                        onClick={() => toggleActive(r)}
                        className="flex size-9 cursor-pointer items-center justify-center rounded-field hover:bg-base-200"
                      >
                        <span
                          className={`relative h-5 w-9 rounded-full transition-colors ${
                            r.active ? "bg-primary" : "bg-base-300"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 size-4 rounded-full bg-base-100 transition-all ${
                              r.active ? "left-4.5" : "left-0.5"
                            }`}
                          />
                        </span>
                      </button>
                      <IconButton
                        label={`แก้ไข ${r.code}`}
                        onClick={() => setEditing({ kind: "reason", reason: r, categoryId: r.categoryId })}
                      >
                        <Pencil size={15} strokeWidth={1.8} aria-hidden />
                      </IconButton>
                      <IconButton label={`ลบ ${r.code}`} onClick={() => removeReason(r)} danger>
                        <Trash2 size={15} strokeWidth={1.8} aria-hidden />
                      </IconButton>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-center text-12-5 text-mut">
                ยังไม่มีรหัสในหมวดนี้ — กด “เพิ่มรหัส{c.prefix}” เพื่อเริ่ม
              </p>
            )}
          </section>
        );
      })}

      {filtering && !reasons.some(visible) ? (
        <p className="rounded-box border border-dashed border-line bg-base-100 px-4 py-10 text-center text-13 text-mut">
          ไม่พบรหัสที่ตรงกับ “{q || "ตัวกรอง"}”
        </p>
      ) : null}

      {!categories.length ? (
        <p className="rounded-box border border-dashed border-line bg-base-100 px-4 py-10 text-center text-13 text-mut text-pretty">
          ยังไม่มีหมวดเลย — กด “เพิ่มหมวด” หรือรัน <code className="font-mono">node seed_resign_reasons.mjs</code>{" "}
          เพื่อใส่ชุดตั้งต้นจากไฟล์ Reason Code Master ของทีม OPS
        </p>
      ) : null}

      {editing?.kind === "reason" ? (
        <ReasonEditor
          categories={sortedCats}
          reason={editing.reason}
          categoryId={editing.categoryId}
          onClose={() => setEditing(null)}
          onSaved={putReason}
        />
      ) : null}
      {editing?.kind === "category" ? (
        <CategoryEditor
          category={editing.category}
          onClose={() => setEditing(null)}
          onSaved={putCategory}
        />
      ) : null}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`flex size-9 cursor-pointer items-center justify-center rounded-field text-mut transition-colors hover:bg-base-200 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent ${
        danger ? "hover:text-alert" : "hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
