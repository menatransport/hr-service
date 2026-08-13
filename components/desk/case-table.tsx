"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Inbox,
  Paperclip,
  Plus,
  Trash2,
} from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { SearchField, Select, type SelectOption } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  STATUS_FLOW,
  TOTAL_STEPS,
  canDeleteCase,
  caseAgeDays,
  departmentLabel,
  formatShort,
  formatDate,
  isNewCase,
  isSlaBreached,
  statusMeta,
} from "@/lib/case-flow";
import { departments } from "@/lib/data";
import { requestJson } from "@/lib/http";
import { escapeHtml, runAction } from "@/lib/swal";
import type { CaseStatus, DepartmentId, HrCase } from "@/lib/types";

type StatusFilter = CaseStatus | "all";

/** ค่าของ dropdown ต้องไม่ใช่ค่าว่าง (ค่าว่าง = ยังไม่เลือก) จึงใช้ `none` แทน */
const UNASSIGNED = "none";

/** จำนวนคำร้องต่อหน้า — เริ่มที่ 10 ตามที่ตกลงไว้ */
const PAGE_SIZES = [10, 20, 50] as const;
const DEFAULT_PAGE_SIZE = 10;

const deptOptions: SelectOption[] = departments.map((d) => ({
  value: d.id,
  label: d.label,
}));

const departmentFilterOptions: SelectOption[] = [
  { value: "all", label: "ทั้งหมด" },
  { value: UNASSIGNED, label: "ยังไม่มอบหมาย" },
  ...deptOptions,
];

const pageSizeOptions: SelectOption[] = PAGE_SIZES.map((n) => ({
  value: String(n),
  label: `${n} รายการ`,
}));

/**
 * ตารางคิวคำร้อง — ตัวกรองและการแบ่งหน้าทำกับชุดที่ดึงมาแล้วทั้งหมด
 * ตัวเลขบนชิปแต่ละสถานะจึงเป็นยอดจริงของทั้งคิว ไม่ใช่แค่หน้าที่เปิดอยู่
 */
export function CaseTable({
  cases,
  emptyHint = "ไม่มีคำร้องที่ตรงกับเงื่อนไข",
  showFilters = true,
}: {
  cases: HrCase[];
  emptyHint?: string;
  showFilters?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [department, setDepartment] = useState("all");
  const [slaOnly, setSlaOnly] = useState(false);
  const [perPage, setPerPage] = useState<number>(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);

  /**
   * การมอบหมายจะถามยืนยันก่อน แล้วยิง `PATCH /api/cases/{trackingNo}` +
   * `router.refresh()` — ผลสำเร็จ/ล้มเหลวแจ้งผ่านกล่องของ `lib/swal.ts`
   *
   * `assigned` เก็บค่าที่เพิ่งเลือกไว้ให้แถวเปลี่ยนทันทีระหว่างรอเซิร์ฟเวอร์ตอบ
   */
  const [assigned, setAssigned] = useState<Record<string, DepartmentId>>({});
  const [saving, startSaving] = useTransition();

  /**
   * คำร้องที่เพิ่งลบไป — ซ่อนแถวทิ้งระหว่างรอ `router.refresh()` วิ่งกลับมา
   *
   * ใส่**หลังเซิร์ฟเวอร์ยืนยันว่าลบติดจริงแล้วเท่านั้น** ไม่ใช่ตอนกดยืนยัน —
   * route ฝั่งเราอ่านซ้ำก่อนตอบ 200 อยู่แล้ว แถวที่หายไปจึงหายจริง ไม่ใช่หายลวง
   */
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const deptOf = (c: HrCase) => assigned[c.trackingNo] ?? c.departmentId;
  /** มอบหมายแล้วให้คำร้องที่ยังเปิดอยู่ขยับเป็น “มอบผู้รับผิดชอบแล้ว” ทันที */
  const statusOf = (c: HrCase): CaseStatus =>
    c.status === "open" && assigned[c.trackingNo] ? "assigned" : c.status;

  function assign(c: HrCase, id: DepartmentId) {
    const to = departmentLabel(id);
    const from = c.departmentId ? departmentLabel(c.departmentId) : null;

    startSaving(async () => {
      const out = await runAction({
        confirm: {
          title: `มอบหมาย ${c.trackingNo} ให้ ${to}?`,
          text: from
            ? `ย้ายจาก ${from} — ประเภทเรื่องที่ผู้รับผิดชอบเดิมเลือกไว้จะถูกล้าง`
            : "ผู้รับผิดชอบจะเห็นเคสนี้ในคิวงานทันที และเริ่มกรอกแผนดำเนินการได้",
          confirmText: "มอบหมาย",
        },
        pending: "กำลังมอบหมาย…",
        success: `มอบหมาย ${c.trackingNo} ให้ ${to} แล้ว`,
        failureTitle: "มอบหมายหน่วยงานไม่สำเร็จ",
        run: async () => {
          // เปลี่ยนแถวหลังผู้ใช้ยืนยันแล้วเท่านั้น — กดยกเลิกต้องไม่ทิ้งร่องรอยไว้
          setAssigned((prev) => ({ ...prev, [c.trackingNo]: id }));
          await requestJson(
            `/api/cases/${encodeURIComponent(c.trackingNo)}`,
            { method: "PATCH", body: { departmentId: id } },
            "บันทึกไม่สำเร็จ",
          );
        },
      });

      if (out.status === "done") {
        router.refresh();
        return;
      }
      // คืนค่าเดิมให้แถว เพื่อไม่ให้หน้าจอโกหกว่าบันทึกแล้ว
      setAssigned((prev) => {
        const next = { ...prev };
        delete next[c.trackingNo];
        return next;
      });
    });
  }

  /**
   * ลบคำร้อง — soft delete ฝั่ง NCAC (`is_deleted = true`) ไม่ได้ล้างข้อมูลทิ้ง
   *
   * เปิดให้เฉพาะเรื่องที่ยังไม่เข้าสายอนุมัติ (`canDeleteCase`) และกล่องยืนยันใช้
   * โทนแดง + โฟกัสที่ “ยกเลิก” เพราะกดพลาดแล้วผู้ใช้กู้เองไม่ได้
   */
  function remove(c: HrCase) {
    startSaving(async () => {
      const out = await runAction({
        confirm: {
          title: `ลบคำร้อง ${c.trackingNo}?`,
          html: `คำร้องจะหายออกจากคิวงานและรายงานทั้งหมด — ผู้ใช้กู้คืนเองไม่ได้<span class="hrs-swal-quote">${escapeHtml(c.subject)}</span>`,
          confirmText: "ลบคำร้อง",
          tone: "danger",
        },
        pending: "กำลังลบคำร้อง…",
        success: `ลบคำร้อง ${c.trackingNo} แล้ว`,
        failureTitle: "ลบคำร้องไม่สำเร็จ",
        run: () =>
          requestJson(
            `/api/cases/${encodeURIComponent(c.trackingNo)}`,
            // ผู้ลบถูกลงชื่อใน `complaint_logs` ของ NCAC จากคุกกี้ session ฝั่ง route
            // — ไม่ใช่จากค่าที่หน้าจอส่งไป จึงอ้างเป็นคนอื่นไม่ได้
            { method: "DELETE", body: {} },
            "ลบคำร้องไม่สำเร็จ",
          ),
      });

      if (out.status !== "done") return;
      setRemoved((prev) => new Set(prev).add(c.trackingNo));
      router.refresh();
    });
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();

    return cases.filter((c) => {
      if (removed.has(c.trackingNo)) return false;
      if (status !== "all" && statusOf(c) !== status) return false;
      if (department !== "all" && (deptOf(c) ?? UNASSIGNED) !== department)
        return false;
      if (slaOnly && !isSlaBreached(c)) return false;
      if (!q) return true;
      return `${c.trackingNo} ${c.subject} ${c.driverId} ${c.driverName}`
        .toLowerCase()
        .includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cases, query, status, department, slaOnly, assigned, removed]);

  /**
   * ตัวเลขของแต่ละสถานะอยู่บนชิปกรองเลย — ไม่มีการ์ดสรุปแยกอีกชุด
   * เพื่อไม่ให้ผู้ใช้เห็นเลขเดียวกันสองที่แล้วต้องเทียบเองว่าอันไหนอัปเดต
   */
  const counts = useMemo(() => {
    const by: Partial<Record<CaseStatus, number>> = {};
    let sla = 0;
    for (const c of cases) {
      if (removed.has(c.trackingNo)) continue;
      const s = statusOf(c);
      by[s] = (by[s] ?? 0) + 1;
      if (isSlaBreached(c)) sla += 1;
    }
    return { by, sla };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cases, assigned, removed]);

  /* ------------------------------------------------------------ แบ่งหน้า */

  const pageCount = Math.max(1, Math.ceil(rows.length / perPage));
  /**
   * หน้าปัจจุบันคำนวณจาก state แทนที่จะบังคับให้ state ถูกต้องเสมอ — ถ้าจำนวนแถว
   * หดลงจนหน้าเดิมหายไป (มอบหมายเสร็จแล้วแถวหลุดจากตัวกรอง) จะได้ไม่ค้างที่หน้าว่าง
   */
  const current = Math.min(page, pageCount);
  const sliceFrom = (current - 1) * perPage;
  const pageRows = rows.slice(sliceFrom, sliceFrom + perPage);

  /**
   * เปลี่ยนตัวกรองแล้วต้องกลับไปหน้า 1 — ปรับ state ตอน render ตามแนวเดียวกับ
   * `CaseModal` (กฎ `react-hooks/set-state-in-effect` ห้ามย้ายไปไว้ใน effect)
   */
  const filterKey = `${query}|${status}|${department}|${slaOnly}|${perPage}`;
  const [lastKey, setLastKey] = useState(filterKey);
  if (lastKey !== filterKey) {
    setLastKey(filterKey);
    setPage(1);
  }

  const filtered =
    query.trim() !== "" || status !== "all" || department !== "all" || slaOnly;

  function clearFilters() {
    setQuery("");
    setStatus("all");
    setDepartment("all");
    setSlaOnly(false);
  }

  const open = (c: HrCase) => router.push(`/desk/cases/${c.trackingNo}`);

  return (
    <div className="flex flex-col gap-3">
      {showFilters ? (
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <SearchField
              value={query}
              onChange={setQuery}
              label="ค้นหาคำร้อง"
              placeholder="ค้นหาเลขติดตาม หัวข้อ หรือผู้แจ้ง"
              className="min-w-[220px] flex-1 sm:max-w-[320px]"
            />

            <div className="flex items-center gap-2 rounded-field border border-line bg-base-100 px-3 py-1.5">
              <span className="flex-none text-[12px] text-mut">ผู้รับผิดชอบ</span>
              <Select
                value={department}
                onChange={setDepartment}
                label="กรองตามหน่วยงานผู้รับผิดชอบ"
                variant="bare"
                options={departmentFilterOptions}
              />
            </div>

            <Chip
              on={slaOnly}
              onClick={() => setSlaOnly((v) => !v)}
              tone="sla"
              count={counts.sla}
            >
              เกิน SLA
            </Chip>

            {filtered ? (
              <button
                type="button"
                onClick={clearFilters}
                className="ml-auto flex-none rounded-full px-3 py-1.5 text-[12.5px] text-mut underline-offset-4 transition-colors hover:text-ink hover:underline"
              >
                ล้างตัวกรอง
              </button>
            ) : null}
          </div>

          <div
            role="group"
            aria-label="กรองตามสถานะ"
            className="flex flex-wrap gap-1.5"
          >
            <Chip
              on={status === "all"}
              onClick={() => setStatus("all")}
              count={cases.length}
            >
              ทั้งหมด
            </Chip>
            {STATUS_FLOW.map((s) => (
              <Chip
                key={s}
                on={status === s}
                onClick={() => setStatus(s)}
                count={counts.by[s] ?? 0}
              >
                {statusMeta[s].short}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── จอ ≥md: ตาราง 4 คอลัมน์ (ผู้แจ้งอยู่ในคอลัมน์ “เรื่อง”) ── */}
      <div className="hidden overflow-x-auto rounded-box border border-line bg-base-100 md:block">
        <table className="w-full min-w-[820px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line text-[11.5px] tracking-[0.04em] text-mut">
              <Th className="w-[110px]">อายุคำร้อง</Th>
              <Th>เรื่องแจ้ง</Th>
              <Th className="w-[168px]">ผู้รับผิดชอบ</Th>
              {/* ไม่มีคอลัมน์ “ความสำคัญ” — NCAC ไม่ได้ส่ง priority มา ระบบเดาเอง */}
              <Th className="w-[152px]">สถานะ</Th>
              {/*
               * คอลัมน์เครื่องมือ — กว้างคงที่และ **จองที่ไว้ทุกแถว** แม้แถวนั้นจะลบไม่ได้
               * ถังขยะจึงอยู่ตรงกันเป็นแนวเดียว ไม่ใช่ขยับไปมาตามว่าแถวไหนมีปุ่ม
               * หัวคอลัมน์เป็น sr-only เพราะช่องนี้มีแต่ไอคอน การใส่ป้ายจริงจะรก
               */}
              <Th className="w-14">
                <span className="sr-only">จัดการคำร้อง</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((c) => {
              const breached = isSlaBreached(c);
              return (
                <tr
                  key={c.trackingNo}
                  onClick={() => open(c)}
                  className="group cursor-pointer border-b border-line/70 align-top text-[13px] transition-colors last:border-0 hover:bg-base-200/70"
                >
                  <td className="px-3.5 py-3">
                    <span
                      className={`block text-[17px] leading-none font-semibold ${
                        breached ? "text-sla" : "text-ink"
                      }`}
                    >
                      {caseAgeDays(c)}
                      <span className="ml-1 text-[10.5px] font-normal text-mut">
                        วัน
                      </span>
                    </span>
                    <span className="mt-1 block text-[11px] text-mut">
                      {formatDate(c.createdAt)}
                    </span>
                  </td>

                  <td className="px-3.5 py-3">
                    <div className="flex items-start gap-2.5">
                      <Avatar name={c.driverName} className="mt-0.75" />
                      <div className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <Link
                            href={`/desk/cases/${c.trackingNo}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-mono text-[11.5px] font-medium text-primary hover:text-ink"
                          >
                            {c.trackingNo}
                          </Link>
                          <NewBadge hrCase={c} />
                        </span>
                        <span className="mt-0.5 block leading-snug font-medium text-pretty">
                          {c.subject}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[11.5px] text-mut">
                          <span className="text-ink">{c.driverName}</span>
                          <span>{c.driverId}</span>
                          <span aria-hidden>·</span>
                          <span>{c.complaintType ?? "ยังไม่จัดประเภท"}</span>
                          {c.attachments.length ? (
                            <span className="inline-flex items-center gap-1">
                              <Paperclip size={11} strokeWidth={1.8} aria-hidden />
                              {c.attachments.length}
                            </span>
                          ) : null}
                          {breached ? (
                            <span className="font-medium text-sla">เกิน SLA</span>
                          ) : null}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* dropdown ในเซลล์นี้ต้องไม่พาไปเปิดคำร้อง */}
                  <td className="px-3.5 py-3" onClick={(e) => e.stopPropagation()}>
                    <DeptCell
                      trackingNo={c.trackingNo}
                      current={deptOf(c)}
                      disabled={saving}
                      onAssign={(id) => assign(c, id)}
                    />
                  </td>

                  <td className="px-3.5 py-3">
                    <StatusBadge status={statusOf(c)} short />
                    <StepBar status={statusOf(c)} />
                  </td>

                  {/* ปุ่มลบต้องไม่พาไปเปิดคำร้อง เหมือนเซลล์ผู้รับผิดชอบ */}
                  <td
                    className="px-2 py-3 align-middle"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DeleteButton
                      hrCase={c}
                      disabled={saving}
                      onDelete={() => remove(c)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!rows.length ? (
          <Empty
            hint={filtered ? "ลองปรับคำค้นหรือล้างตัวกรอง" : emptyHint}
            onClear={filtered ? clearFilters : undefined}
          />
        ) : null}
      </div>

      {/* ── จอ <md: การ์ดแนวตั้ง ไม่ต้องเลื่อนแนวนอน ── */}
      <div className="flex flex-col gap-2.5 md:hidden">
        {pageRows.map((c) => {
          const breached = isSlaBreached(c);
          return (
            <div
              key={c.trackingNo}
              onClick={() => open(c)}
              className="group cursor-pointer rounded-box border border-line bg-base-100 p-3.5 transition-colors hover:border-primary/30"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <StatusBadge status={statusOf(c)} short />
                  <NewBadge hrCase={c} />
                </span>
                <span
                  className={`flex-none text-[11.5px] ${breached ? "text-sla" : "text-mut"}`}
                >
                  {caseAgeDays(c)} วัน · {formatShort(c.createdAt)}
                </span>
              </div>

              <div className="mt-2 flex items-start gap-2.5">
                <Avatar name={c.driverName} className="mt-0.75" />
                <div className="min-w-0">
                  <Link
                    href={`/desk/cases/${c.trackingNo}`}
                    onClick={(e) => e.stopPropagation()}
                    className="block font-mono text-[11.5px] font-medium text-primary"
                  >
                    {c.trackingNo}
                  </Link>
                  <p className="mt-0.5 text-[13.5px] leading-snug font-medium text-pretty">
                    {c.subject}
                  </p>
                  <p className="mt-1 text-[11.5px] text-mut">
                    <span className="text-ink">{c.driverName}</span> {c.driverId}
                  </p>
                </div>
              </div>

              <StepBar status={statusOf(c)} />

              <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-mut">
                <span>{c.complaintType ?? "ยังไม่จัดประเภท"}</span>
                {c.attachments.length ? (
                  <span className="inline-flex items-center gap-1">
                    <Paperclip size={11} strokeWidth={1.8} aria-hidden />
                    {c.attachments.length}
                  </span>
                ) : null}
                {breached ? (
                  <span className="font-medium text-sla">เกิน SLA</span>
                ) : null}
              </div>

              <div
                className="mt-2.5 flex items-center border-t border-line pt-2.5"
                onClick={(e) => e.stopPropagation()}
              >
                <DeptCell
                  trackingNo={c.trackingNo}
                  current={deptOf(c)}
                  disabled={saving}
                  onAssign={(id) => assign(c, id)}
                />
                {/* จอเล็กไม่มี hover — ถังขยะอยู่ถาวรท้ายแถวเครื่องมือ */}
                <DeleteButton
                  hrCase={c}
                  disabled={saving}
                  onDelete={() => remove(c)}
                  className="ml-auto"
                />
              </div>
            </div>
          );
        })}

        {!rows.length ? (
          <div className="rounded-box border border-line bg-base-100">
            <Empty
              hint={filtered ? "ลองปรับคำค้นหรือล้างตัวกรอง" : emptyHint}
              onClear={filtered ? clearFilters : undefined}
            />
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
        <p className="text-[12px] text-mut">
          {rows.length ? (
            <>
              แสดง{" "}
              <span className="font-medium text-ink">
                {sliceFrom + 1}–{sliceFrom + pageRows.length}
              </span>{" "}
              จาก {rows.length} คำร้อง
            </>
          ) : (
            "ไม่มีคำร้องที่ตรงกับเงื่อนไข"
          )}
          {rows.length !== cases.length ? ` (ทั้งคิว ${cases.length})` : ""}
        </p>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 sm:flex">
            <span className="flex-none text-[12px] text-mut">ต่อหน้า</span>
            <Select
              value={String(perPage)}
              onChange={(v) => setPerPage(Number(v))}
              label="จำนวนคำร้องต่อหน้า"
              variant="ghost"
              options={pageSizeOptions}
            />
          </div>

          <Pager current={current} count={pageCount} onGo={setPage} />
        </div>
      </div>
    </div>
  );
}

/**
 * แถบเลขหน้า — แสดงหน้าแรก/หน้าสุดท้ายเสมอ และขยับหน้าต่างรอบหน้าปัจจุบัน
 * เพื่อให้ความกว้างคงที่ ไม่ว่าจะมีกี่หน้า
 */
function pageWindow(current: number, count: number): (number | "gap")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);

  const around = [current - 1, current, current + 1].filter(
    (n) => n > 1 && n < count,
  );
  const pages = [1, ...around, count];

  const out: (number | "gap")[] = [];
  for (const [i, n] of pages.entries()) {
    if (i && n - (pages[i - 1] as number) > 1) out.push("gap");
    out.push(n);
  }
  return out;
}

function Pager({
  current,
  count,
  onGo,
}: {
  current: number;
  count: number;
  onGo: (page: number) => void;
}) {
  // หน้าเดียวก็ไม่ต้องมีปุ่มให้กด
  if (count <= 1) return null;

  return (
    <nav aria-label="แบ่งหน้า" className="flex items-center gap-1">
      <Step
        label="หน้าก่อนหน้า"
        disabled={current <= 1}
        onClick={() => onGo(current - 1)}
      >
        <ChevronLeft size={15} strokeWidth={1.9} aria-hidden />
      </Step>

      {pageWindow(current, count).map((n, i) =>
        n === "gap" ? (
          <span
            key={`gap-${i}`}
            aria-hidden
            className="px-1 text-[12.5px] text-mut"
          >
            …
          </span>
        ) : (
          <button
            key={n}
            type="button"
            onClick={() => onGo(n)}
            aria-label={`หน้า ${n}`}
            aria-current={n === current ? "page" : undefined}
            className={`size-8 flex-none rounded-selector text-[12.5px] transition-colors ${
              n === current
                ? "border border-ink bg-ink font-medium text-ink-content"
                : "border border-line bg-base-100 text-mut hover:border-ink/30 hover:text-ink"
            }`}
          >
            {n}
          </button>
        ),
      )}

      <Step
        label="หน้าถัดไป"
        disabled={current >= count}
        onClick={() => onGo(current + 1)}
      >
        <ChevronRight size={15} strokeWidth={1.9} aria-hidden />
      </Step>
    </nav>
  );
}

function Step({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex size-8 flex-none items-center justify-center rounded-selector border border-line bg-base-100 text-mut transition-colors hover:border-ink/30 hover:text-ink disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/**
 * ป้าย “ใหม่” — คำร้องที่เข้ามาวันนี้ (กฎอยู่ที่ `isNewCase` ใน `lib/case-flow.ts`)
 *
 * เป็นพิลล์ทึบสี ink เพราะสีทั้ง 5 ของ chip สถานะถูกจองไว้หมดแล้ว — ถ้าใช้ฟ้า
 * (`st-new`) จะกลายเป็นป้ายสีเดียวกับสถานะ “เปิดคำร้อง” ที่อยู่ห่างไปแค่คอลัมน์เดียว
 * คนอ่านจะแยกไม่ออกว่าเป็นคนละเรื่องกัน
 *
 * `title` บอกวันที่แจ้งจริง — ป้ายบอกแค่ “วันนี้” ซึ่งไม่พอตอนไล่เทียบหลายเคส
 */
function NewBadge({ hrCase }: { hrCase: HrCase }) {
  if (!isNewCase(hrCase)) return null;

  return (
    <span
      title={`แจ้งเข้ามาวันนี้ · ${formatDate(hrCase.createdAt)}`}
      className="flex-none rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] leading-none font-medium tracking-[0.02em] text-ink-content"
    >
      ใหม่
    </span>
  );
}

/** แถบความคืบหน้า 5 ขั้น — เห็นว่าคำร้องเดินไปถึงไหนโดยไม่ต้องเปิด */
function StepBar({ status }: { status: CaseStatus }) {
  const at = statusMeta[status].step;

  return (
    <span
      aria-hidden
      className="mt-1.5 flex gap-0.5"
      title={`ขั้นที่ ${at} จาก ${TOTAL_STEPS}`}
    >
      {STATUS_FLOW.map((s, i) => (
        <span
          key={s}
          className={`h-1 flex-1 rounded-full ${i < at ? "bg-primary" : "bg-line"}`}
        />
      ))}
    </span>
  );
}

function Empty({ hint, onClear }: { hint: string; onClear?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2.5 px-4 py-12 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-soft text-primary">
        <Inbox size={20} strokeWidth={1.7} aria-hidden />
      </span>
      <p className="text-[13px] text-mut">{hint}</p>
      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="rounded-full border border-line px-3.5 py-1.5 text-[12.5px] transition-colors hover:border-ink/30 hover:text-ink"
        >
          ล้างตัวกรอง
        </button>
      ) : null}
    </div>
  );
}

/**
 * มอบหมาย / เปลี่ยนหน่วยงานผู้รับผิดชอบได้จากในตารางเลย
 * ยังไม่มอบหมาย = ชิปเส้นประมีเครื่องหมายบวก · มอบหมายแล้ว = ข้อความที่แก้ได้เมื่อ hover
 */
/**
 * ถังขยะประจำแถว — **แสดงตลอด ไม่ต้องชี้ก่อน** และอยู่ในคอลัมน์ของตัวเองที่จองที่
 * ไว้ตายตัว ปุ่มทุกแถวจึงเรียงตรงกันเป็นแนวเดียว
 *
 * แถวที่ลบไม่ได้ (`canDeleteCase` ไม่ผ่าน) **เว้นว่างไว้เฉย ๆ** ไม่ทำปุ่มจาง ๆ กดไม่ได้
 * เพราะปุ่มลบที่กดไม่ได้ชวนให้คนพยายามกดแล้วงงว่าทำไมไม่ทำงาน — เรื่องที่เลยขั้น
 * อนุมัติไปแล้วเส้นทางที่ถูกคือ “ปิดคำร้อง” ซึ่งอยู่ในหน้ารายละเอียดอยู่แล้ว
 * (ความกว้างคอลัมน์มาจาก `<Th className="w-14">` ช่องว่างจึงไม่ทำให้ตารางขยับ)
 *
 * สีปกติเป็นเทาจาง ๆ แล้วค่อยเป็นแดงตอนชี้ — ปุ่มทำลายที่แดงตลอดทุกแถวจะดึงสายตา
 * ไปจากสถานะคำร้องซึ่งเป็นเรื่องหลักของตาราง
 */
function DeleteButton({
  hrCase,
  disabled,
  onDelete,
  className = "",
}: {
  hrCase: HrCase;
  disabled?: boolean;
  onDelete: () => void;
  className?: string;
}) {
  if (!canDeleteCase(hrCase)) return null;

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={`ลบคำร้อง ${hrCase.trackingNo}`}
      title={`ลบคำร้อง ${hrCase.trackingNo}`}
      onClick={(e) => {
        e.stopPropagation();
        onDelete();
      }}
      className={`flex size-9 flex-none cursor-pointer items-center justify-center rounded-selector text-mut/70 transition-colors hover:bg-alert/10 hover:text-alert disabled:pointer-events-none disabled:opacity-40 ${className}`}
    >
      <Trash2 size={15} strokeWidth={1.8} aria-hidden />
    </button>
  );
}

function DeptCell({
  trackingNo,
  current,
  disabled,
  onAssign,
}: {
  trackingNo: string;
  current: DepartmentId | null;
  disabled?: boolean;
  onAssign: (id: DepartmentId) => void;
}) {
  const id = `assign-${trackingNo}`;

  if (!current) {
    return (
      <Select
        id={id}
        value=""
        onChange={(v) => onAssign(v as DepartmentId)}
        options={deptOptions}
        placeholder="มอบหมาย"
        label={`มอบหมายหน่วยงานผู้รับผิดชอบของ ${trackingNo}`}
        variant="dashed"
        disabled={disabled}
        icon={<Plus size={13} strokeWidth={2.2} aria-hidden />}
      />
    );
  }

  return (
    <Select
      id={id}
      value={current}
      onChange={(v) => onAssign(v as DepartmentId)}
      options={deptOptions}
      label={`เปลี่ยนหน่วยงานผู้รับผิดชอบของ ${trackingNo}`}
      variant="ghost"
      disabled={disabled}
    />
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th scope="col" className={`px-3.5 py-2.5 font-medium ${className}`}>
      {children}
    </th>
  );
}

function Chip({
  children,
  on,
  onClick,
  tone = "ink",
  count,
}: {
  children: React.ReactNode;
  on: boolean;
  onClick: () => void;
  tone?: "ink" | "sla";
  /** ตัวเลขบนชิป — แทนการ์ดสรุปที่เคยแสดงเลขชุดเดียวกันซ้ำอีกที่ */
  count?: number;
}) {
  const onCls =
    tone === "sla"
      ? "border-sla bg-sla text-ink-content"
      : "border-ink bg-ink text-ink-content";

  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex-none rounded-full border px-3 py-1.5 text-[12.5px] transition-colors ${
        on
          ? onCls
          : "border-line bg-base-100 text-mut hover:border-ink/30 hover:text-ink"
      }`}
    >
      {children}
      {count !== undefined ? (
        <span className={`ml-1.5 font-medium ${on ? "opacity-80" : "text-ink"}`}>
          {count}
        </span>
      ) : null}
    </button>
  );
}
