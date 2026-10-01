"use client";

import { Fragment, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  ChevronRight,
  ChevronsUpDown,
  Paperclip,
  Plus,
  Settings2,
  Users,
} from "lucide-react";

import { PageHead } from "@/components/desk/page-head";
import { RecordCaseDetail } from "@/components/desk/record-case-detail";
import { RecordCaseForm } from "@/components/desk/record-case-form";
import { RecordCategoryManager } from "@/components/desk/record-category-manager";
import { RecordExportExcelButton } from "@/components/desk/record-export-button";
import {
  QuickStatusActions,
  useRecordStatusChange,
} from "@/components/desk/record-status-actions";
import { SearchField, Select, type SelectOption } from "@/components/ui/field";
import { Pager } from "@/components/ui/pager";
import { RecordStatusBadge } from "@/components/ui/record-status-badge";
import { departmentLabel } from "@/lib/case-flow";
import { departmentIcon, departments } from "@/lib/data";
import {
  hasRecordFilters,
  matchesRecordFilters,
  type RecordCaseFilters,
} from "@/lib/record-case-filter";
import {
  RECORD_CATEGORY_ICON,
  RECORD_STATUSES,
  formatOccurredOn,
  recordCategoryLabel,
  recordStatusMeta,
  type RecordCase,
  type RecordCategory,
  type RecordStatus,
} from "@/lib/record-case-flow";

/**
 * หน้าบันทึกเคสส่วนกลาง — ทั้งหน้าคุมจากที่นี่ที่เดียว
 *
 * ตั้งใจให้ **หน้าเดียวจบ**: คิวอยู่ตรงกลาง รายละเอียด **กางออกในแถวของมันเอง**
 * (21 ส.ค. 2026 — เดิมเป็นโมดัลลอย) ผู้ใช้จึงไล่ตรวจเคสทีละหลายใบได้โดยไม่ต้อง
 * ปิด-เปิดกล่องทีละใบ และไม่หลุดบริบทว่ากำลังอยู่แถวไหนของคิว
 * ส่วน **ฟอร์มบันทึกเคสใหม่ยังเป็นโมดัล** เพราะเป็นงานที่ต้องโฟกัสจนจบ ไม่ใช่การอ่านเทียบ
 *
 * คิวเป็น **ตารางแบบสเปรดชีต** (20 ส.ค. 2026) — หัวตารางตรึงไว้ เรียงได้ทุกคอลัมน์
 * แบ่งหน้า และมีปุ่มเปลี่ยนสถานะประจำแถว
 *
 * การค้นหา/กรองทำกับชุดที่ดึงมาแล้วทั้งหมด ตัวเลขบนชิปสถานะจึงเป็นยอดจริงของทั้งคิว
 * ไม่ใช่แค่ที่เห็นบนจอ
 */

type StatusFilter = RecordStatus | "all";

/** คอลัมน์ที่เรียงได้ — คีย์เดียวกับหัวตาราง ไม่ได้แยกชุดกัน */
type SortKey =
  | "code"
  | "title"
  | "occurredOn"
  | "category"
  | "department"
  | "recorder"
  | "status";
type SortDir = "asc" | "desc";

const PAGE_SIZES = [10, 20, 50] as const;
const DEFAULT_PAGE_SIZE = 20;

/**
 * ค่าเริ่มต้นของคิว: **เลขที่เคส มาก → น้อย** (เคสใหม่สุดอยู่บนสุด)
 * เลขที่เรียงตามเวลาที่บันทึกอยู่แล้ว (`ER-ปีเดือน-ลำดับ`) จึงเท่ากับ “ใหม่ก่อน” โดยไม่ต้องพึ่ง `createdAt`
 */
const DEFAULT_SORT: SortKey = "code";
const DEFAULT_DIR: SortDir = "desc";

/**
 * ทิศทางตอน**คลิกคอลัมน์นั้นครั้งแรก**
 *
 * คอลัมน์ที่เป็นลำดับเวลา (เลขที่ · วันที่ของเคส) เริ่มที่ มาก→น้อย เพราะคนกดคอลัมน์พวกนี้
 * เพื่อหา “ล่าสุด” ไม่ใช่ “เก่าสุด” · คอลัมน์ที่เหลือเป็นข้อความ เริ่มที่ ก→ฮ ตามปกติ
 */
const FIRST_DIR: Partial<Record<SortKey, SortDir>> = {
  code: "desc",
  occurredOn: "desc",
};

/** จำนวนคอลัมน์ของตาราง — แถวที่กางออกใช้ `colSpan` นี้ให้เต็มความกว้าง */
const COLUMNS = 10;

const deptOptions: SelectOption[] = [
  { value: "all", label: "ทุกฝ่าย" },
  ...departments.map((d) => ({ value: d.id, label: d.label })),
];

const pageSizeOptions: SelectOption[] = PAGE_SIZES.map((n) => ({
  value: String(n),
  label: `${n} แถว`,
}));

/**
 * เซลล์ข้อมูลหนึ่งช่อง — เส้นคั่นทุกคอลัมน์เหมือนสเปรดชีต ตากวาดข้ามคอลัมน์ไม่หลุดแถว
 * (เขียนเป็นค่าคงที่แทน `[&>td]:…` บน `<tr>` เพราะตัวหลังชนะคลาสของ `td` เอง
 * ด้วย specificity — เซลล์ที่อยากได้ padding ต่างจากเพื่อนจะแก้ไม่ได้เลย)
 */
const cell = "border-r border-line/50 px-3 py-2 align-middle";

/**
 * ค่าที่ใช้เรียงของแต่ละคอลัมน์
 *
 * **ห้ามใช้ `localeCompare`** — ผลลัพธ์ขึ้นกับ ICU ของเครื่อง เซิร์ฟเวอร์กับเบราว์เซอร์
 * อาจเรียงไม่เหมือนกันแล้ว hydration พัง (เหตุผลเดียวกับที่โปรเจกต์ห้าม `Intl`)
 * เทียบด้วย `<` / `>` ตรง ๆ พอ เพราะทุกคอลัมน์เป็นสตริงรูปแบบคงที่หรือเป็นลำดับที่กำหนดไว้
 */
function sortValue(r: RecordCase, key: SortKey, categories: RecordCategory[]): string | number {
  switch (key) {
    case "code":
      return r.code;
    case "title":
      return r.title;
    case "occurredOn":
      return r.occurredOn;
    case "category":
      /* เรียงตามลำดับของประเภทที่จัดการไว้ (เรียงจากเรื่องคนถึงเรื่องของ) ไม่ใช่ตามตัวอักษร ·
         เคสเก่าที่ยังไม่มีประเภท/ประเภทที่ถูกลบไปแล้วไปกองท้ายสุดเสมอ */
      return categories.findIndex((c) => c.id === r.category) + 1 || 99;
    case "department":
      return departmentLabel(r.departmentId);
    case "recorder":
      return r.recorder.name;
    case "status":
      /* เรียงตามลำดับใน `RECORD_STATUSES` (รอ → เสร็จ → ยกเลิก) ไม่ใช่ตามตัวอักษร */
      return RECORD_STATUSES.indexOf(r.status);
  }
}

export function RecordCaseView({
  records,
  categories,
}: {
  records: RecordCase[];
  categories: RecordCategory[];
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [department, setDepartment] = useState("all");
  const [category, setCategory] = useState("all");
  const [creating, setCreating] = useState(false);
  const [managingCategories, setManagingCategories] = useState(false);
  /** เคสที่กำลังแก้ไข — เก็บเป็น id แล้วหาใหม่จาก props เหมือนแผงที่กางอยู่ */
  const [editingId, setEditingId] = useState<string | null>(null);
  /** เคสที่กางรายละเอียดอยู่ — ทีละใบเดียว หน้าจอจะได้ไม่ยาวจนหาคิวไม่เจอ */
  const [openId, setOpenId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>(DEFAULT_SORT);
  const [sortDir, setSortDir] = useState<SortDir>(DEFAULT_DIR);
  const [perPage, setPerPage] = useState<number>(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);

  const { change, busyId } = useRecordStatusChange();

  const categoryOptions: SelectOption[] = useMemo(
    () => [
      { value: "all", label: "ทุกประเภท" },
      ...categories.map((c) => ({ value: c.id, label: c.label, icon: RECORD_CATEGORY_ICON })),
    ],
    [categories],
  );

  const counts = useMemo(() => {
    const base: Record<StatusFilter, number> = {
      all: records.length,
      pending: 0,
      completed: 0,
      rejected: 0,
    };
    for (const r of records) base[r.status] += 1;
    return base;
  }, [records]);

  /* กฎเดียวกับที่ปุ่มส่งออก Excel ใช้กรองซ้ำฝั่งเซิร์ฟเวอร์ (`lib/record-case-filter.ts`) —
     ไฟล์ที่ได้จะได้ตรงกับที่ตารางแสดงเป๊ะ ไม่มีทางเขียนเงื่อนไขสองที่แล้วหลุด sync กัน */
  const filters: RecordCaseFilters = useMemo(
    () => ({ query, status, department, category }),
    [query, status, department, category],
  );

  const shown = useMemo(() => {
    const rows = records.filter((r) => matchesRecordFilters(r, filters, categories));

    const dir = sortDir === "asc" ? 1 : -1;
    return rows.sort((a, b) => {
      const x = sortValue(a, sortKey, categories);
      const y = sortValue(b, sortKey, categories);
      if (x === y) return a.code < b.code ? -1 : 1; // เท่ากันให้เรียงตามเลขที่ ลำดับจะได้นิ่ง
      return (x < y ? -1 : 1) * dir;
    });
  }, [records, filters, sortKey, sortDir, categories]);

  /* ------------------------------------------------------------ แบ่งหน้า */

  const pageCount = Math.max(1, Math.ceil(shown.length / perPage));
  /** คำนวณจาก state แทนการบังคับ state ให้ถูก — แถวหดจนหน้าเดิมหายไปจะได้ไม่ค้างหน้าว่าง */
  const current = Math.min(page, pageCount);
  const sliceFrom = (current - 1) * perPage;
  const pageRows = shown.slice(sliceFrom, sliceFrom + perPage);

  /* เปลี่ยนตัวกรอง/การเรียงแล้วกลับไปหน้า 1 — ปรับ state ตอน render ตามแนวเดียวกับ `CaseTable` */
  const viewKey = `${query}|${status}|${department}|${category}|${sortKey}|${sortDir}|${perPage}`;
  const [lastKey, setLastKey] = useState(viewKey);
  if (lastKey !== viewKey) {
    setLastKey(viewKey);
    setPage(1);
  }

  const filtered = hasRecordFilters(filters);

  function clearFilters() {
    setQuery("");
    setStatus("all");
    setDepartment("all");
    setCategory("all");
  }

  /** คลิกหัวคอลัมน์: คอลัมน์เดิมสลับทิศ · คอลัมน์ใหม่เริ่มตาม `FIRST_DIR` */
  function sortBy(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(FIRST_DIR[key] ?? "asc");
  }

  /**
   * กด/ปิดแผงรายละเอียด — เคสที่กางอยู่ถูกวาดจากแถวใน `pageRows` ตรง ๆ
   * ไม่ได้ก๊อปข้อมูลลง state พอ `router.refresh()` ส่งข้อมูลใหม่ลงมาหลังเปลี่ยนสถานะ
   * แผงที่กางอยู่จึงอัปเดตตามทันที ไม่ค้างค่าเก่าให้ผู้ใช้เข้าใจผิด
   */
  const toggle = (id: string) => setOpenId((cur) => (cur === id ? null : id));

  const editing = editingId ? (records.find((r) => r.id === editingId) ?? null) : null;

  return (
    <>
      <div className="flex flex-col gap-5 animate-rise">
        <PageHead
          title="บันทึกเคส"
          subtitle="สมุดบันทึกเคสส่วนกลางของฝ่ายบุคคล — บันทึกเรื่องที่เกิดขึ้น ผู้เกี่ยวข้อง หลักฐาน และติดตามสถานะจนจบเรื่อง"
          actions={
            <>
              <button
                type="button"
                onClick={() => setManagingCategories(true)}
                className="flex items-center gap-2 rounded-field border border-line bg-base-100 px-3.5 py-2 text-13 text-mut transition-colors hover:border-ink/30 hover:text-ink"
              >
                <Settings2 size={15} strokeWidth={1.8} aria-hidden />
                จัดการประเภทเคส
              </button>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex items-center gap-2 rounded-field bg-primary px-4 py-2 text-13 font-medium text-primary-content transition-opacity hover:opacity-90"
              >
                <Plus size={16} strokeWidth={2} aria-hidden />
                บันทึกเคสใหม่
              </button>
            </>
          }
        />

        {/* แถบเครื่องมือ */}
        <div className="flex flex-col gap-3 rounded-box border border-line bg-base-100 p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <Chip
              active={status === "all"}
              onClick={() => setStatus("all")}
              label="ทั้งหมด"
              count={counts.all}
            />
            {RECORD_STATUSES.map((s) => (
              <Chip
                key={s}
                active={status === s}
                onClick={() => setStatus(s)}
                label={recordStatusMeta[s].label}
                count={counts[s]}
              />
            ))}

            {/*
             * ส่งออก + ล้างตัวกรองอยู่ปลายแถวเดียวกัน — ทั้งคู่ทำกับ “ชุดที่กรองไว้
             * ตอนนี้” เหมือนกัน (เหตุผลเดียวกับ `case-table.tsx`)
             */}
            <div className="ml-auto flex flex-none items-center gap-2">
              {filtered ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="flex-none rounded-full px-3 py-1.5 text-12-5 text-mut underline-offset-4 transition-colors hover:text-ink hover:underline"
                >
                  ล้างตัวกรอง
                </button>
              ) : null}
              <RecordExportExcelButton filters={filters} count={shown.length} />
            </div>
          </div>

          {/* grid ไม่ใช่ flex-wrap — ช่องค้นหาที่ `flex-1` จะดันตัวกรองตกบรรทัดเสมอ */}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_200px_200px]">
            <SearchField
              value={query}
              onChange={setQuery}
              label="ค้นหาบันทึกเคส"
              placeholder="ค้นหาเลขที่ หัวเรื่อง รายละเอียด ผู้บันทึก หรือผู้เกี่ยวข้อง"
            />
            <Select
              id="rc-category-filter"
              value={category}
              onChange={setCategory}
              options={categoryOptions}
              label="กรองตามประเภทเคส"
              variant="field"
            />
            <Select
              id="rc-dept-filter"
              value={department}
              onChange={setDepartment}
              options={deptOptions}
              label="กรองตามฝ่ายที่เกี่ยวข้อง"
              variant="field"
            />
          </div>
        </div>

        {/* ── จอ ≥md: ตารางแบบสเปรดชีต หัวตารางตรึง เส้นตารางครบทุกช่อง ── */}
        <div className="hidden md:block">
          <div className="elev-card max-h-[78dvh] overflow-auto rounded-box border border-line bg-base-100">
            <table className="w-full min-w-[1120px] border-collapse text-left text-12-5">
              <thead>
                <tr className="bg-head [&>th]:sticky [&>th]:top-0 [&>th]:z-20 [&>th]:border-b [&>th]:border-line-strong [&>th]:bg-head">
                  {/* ช่องเลขแถวแบบสเปรดชีต — ไม่ใช่ข้อมูลของเคส จึงไม่ให้เรียง */}
                  <th
                    scope="col"
                    className="w-10 border-r border-line px-2 py-2 text-center text-11 font-medium text-mut"
                  >
                    <span className="sr-only">ลำดับ</span>#
                  </th>
                  <Th
                    className="w-[152px]"
                    sortKey="code"
                    active={sortKey}
                    dir={sortDir}
                    onSort={sortBy}
                  >
                    เลขที่
                  </Th>
                  <Th sortKey="title" active={sortKey} dir={sortDir} onSort={sortBy}>
                    หัวเรื่อง
                  </Th>
                  <Th
                    className="w-[168px]"
                    sortKey="category"
                    active={sortKey}
                    dir={sortDir}
                    onSort={sortBy}
                  >
                    ประเภทเคส
                  </Th>
                  <Th
                    className="w-[128px]"
                    sortKey="occurredOn"
                    active={sortKey}
                    dir={sortDir}
                    onSort={sortBy}
                  >
                    วันที่ของเคส
                  </Th>
                  <Th
                    className="w-[164px]"
                    sortKey="department"
                    active={sortKey}
                    dir={sortDir}
                    onSort={sortBy}
                  >
                    ฝ่ายที่เกี่ยวข้อง
                  </Th>
                  <Th
                    className="w-[150px]"
                    sortKey="recorder"
                    active={sortKey}
                    dir={sortDir}
                    onSort={sortBy}
                  >
                    ผู้บันทึก
                  </Th>
                  <th
                    scope="col"
                    className="w-14 border-r border-line px-3 py-2 text-center font-medium text-mut"
                  >
                    ไฟล์
                  </th>
                  <Th
                    className="w-[132px]"
                    sortKey="status"
                    active={sortKey}
                    dir={sortDir}
                    onSort={sortBy}
                  >
                    สถานะ
                  </Th>
                  {/*
                   * คอลัมน์ปุ่มด่วน — กว้างคงที่และจองที่ไว้ทุกแถว ปุ่มจึงอยู่ตรงกันเป็นแนวเดียว
                   * หัวคอลัมน์เป็น sr-only เพราะช่องนี้มีแต่ไอคอน ใส่ป้ายจริงแล้วรก
                   */}
                  <th scope="col" className="w-[76px] px-2 py-2 font-medium">
                    <span className="sr-only">เปลี่ยนสถานะ</span>
                  </th>
                </tr>
              </thead>

              <tbody>
                {pageRows.map((r, i) => {
                  const Dept = departmentIcon(r.departmentId);
                  const Cat = RECORD_CATEGORY_ICON;
                  const expanded = openId === r.id;
                  /* แถวสุดท้ายไม่ต้องมีเส้นล่าง — กรอบของกล่องทำหน้าที่นั้นอยู่แล้ว
                     (ใช้ `last:` ไม่ได้ เพราะตัวสุดท้ายอาจเป็นแถวรายละเอียดที่แทรกเข้ามา) */
                  const lastRow = i === pageRows.length - 1;

                  return (
                    <Fragment key={r.id}>
                      <tr
                        onClick={() => toggle(r.id)}
                        /*
                         * hover เป็น**เทากลาง ไม่ใช่สีแบรนด์** — คิวงานเอกสารต้องนิ่ง
                         * สีเขียวอ่อนวิ่งตามเมาส์อ่านเหมือนแถวถูกเลือกไว้แล้ว ทั้งที่แค่ชี้ผ่าน
                         *
                         * แถวที่กางอยู่ต่างจาก hover ชัดเจน: พื้นเข้มขึ้นหนึ่งขั้น + แถบสีด้านซ้าย
                         * ที่ลากยาวต่อลงไปในแผงข้างล่าง จึงรู้ทันทีว่ารายละเอียดนี้เป็นของแถวไหน
                         */
                        className={`cursor-pointer transition-colors ${
                          lastRow && !expanded ? "" : "border-b border-line/60"
                        } ${
                          expanded
                            ? "bg-base-300/45 font-medium"
                            : /* ลายสลับคิดจากลำดับแถวเอง ไม่ใช่ `even:` — แถวรายละเอียดที่แทรกเข้ามาจะทำให้ลายเพี้ยน */
                              `hover:bg-base-200/70 ${i % 2 ? "bg-base-200/35" : ""}`
                        }`}
                      >
                        <td
                          className={`relative border-r border-line px-2 py-2 text-center align-middle text-11 tabular-nums ${
                            expanded
                              ? "bg-base-300/70 font-semibold text-ink"
                              : "bg-base-200/70 text-mut"
                          }`}
                        >
                          {/* แถบชี้แถวที่เปิดอยู่ — เส้นเดียวกับที่อยู่ซ้ายของแผงข้างล่าง */}
                          {expanded ? (
                            <span
                              aria-hidden
                              className="absolute inset-y-0 left-0 w-[3px] bg-primary"
                            />
                          ) : null}
                          {sliceFrom + i + 1}
                        </td>
                        <td className={`${cell} whitespace-nowrap`}>
                          <span className="flex items-center gap-1.5">
                            {/* ปุ่มจริงหนึ่งปุ่มไว้ให้คีย์บอร์ด/screen reader — ทั้งแถวก็ยังคลิกได้เหมือนเดิม */}
                            <button
                              type="button"
                              aria-expanded={expanded}
                              aria-controls={`rc-panel-${r.id}`}
                              aria-label={`${expanded ? "ซ่อน" : "ดู"}รายละเอียด ${r.code}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggle(r.id);
                              }}
                              className={`flex size-5 flex-none items-center justify-center rounded-selector transition-colors ${
                                expanded
                                  ? "bg-primary/12 text-primary"
                                  : "text-mut hover:bg-base-300/60 hover:text-ink"
                              }`}
                            >
                              <ChevronRight
                                size={13}
                                strokeWidth={2.2}
                                aria-hidden
                                className={`transition-transform ${expanded ? "rotate-90" : ""}`}
                              />
                            </button>
                            <span className="font-mono text-11-5 text-primary">
                              {r.code}
                            </span>
                          </span>
                        </td>
                        <td className={cell}>
                          <span className="block font-medium text-pretty">{r.title}</span>
                          {/* กางแผงแล้วซ่อนบรรทัดย่อทิ้ง — ข้างล่างมีข้อความเต็มอยู่แล้ว */}
                          {expanded ? null : (
                            <span className="mt-0.5 flex items-center gap-2 text-11-5 text-mut">
                              <span className="truncate">{r.detail}</span>
                              {r.involved.length ? (
                                <span
                                  className="flex flex-none items-center gap-1"
                                  title={r.involved.join(" · ")}
                                >
                                  <Users size={12} strokeWidth={1.8} aria-hidden />
                                  {r.involved.length}
                                </span>
                              ) : null}
                            </span>
                          )}
                        </td>
                        <td className={cell}>
                          <span className="flex items-center gap-1.5">
                            <Cat
                              size={13}
                              strokeWidth={1.7}
                              className="flex-none text-mut"
                            />
                            <span className="truncate">
                              {recordCategoryLabel(categories, r.category)}
                            </span>
                          </span>
                        </td>
                        <td className={`${cell} whitespace-nowrap text-mut`}>
                          {formatOccurredOn(r.occurredOn)}
                        </td>
                        <td className={cell}>
                          <span className="flex items-center gap-1.5">
                            <Dept
                              size={13}
                              strokeWidth={1.7}
                              className="flex-none text-mut"
                            />
                            <span className="truncate">
                              {departmentLabel(r.departmentId)}
                            </span>
                          </span>
                        </td>
                        <td className={`${cell} truncate`}>{r.recorder.name}</td>
                        <td className={`${cell} text-center text-mut tabular-nums`}>
                          {r.attachments.length ? (
                            <span className="inline-flex items-center gap-1">
                              <Paperclip size={12} strokeWidth={1.8} aria-hidden />
                              {r.attachments.length}
                            </span>
                          ) : (
                            <span aria-hidden>—</span>
                          )}
                        </td>
                        <td className={cell}>
                          <RecordStatusBadge status={r.status} />
                        </td>
                        <td className="px-2 py-2 align-middle">
                          <QuickStatusActions
                            record={r}
                            busy={busyId === r.id}
                            onChange={(to) => change(r, to)}
                          />
                        </td>
                      </tr>

                      {/* แถวรายละเอียด — กินความกว้างทั้งตาราง ไม่มีเส้นแบ่งคอลัมน์ให้ตาสะดุด */}
                      {expanded ? (
                        <tr className={lastRow ? "" : "border-b border-line"}>
                          <td
                            id={`rc-panel-${r.id}`}
                            colSpan={COLUMNS}
                            className="p-0 align-top"
                          >
                            {/* เส้นซ้ายสีเดียวกับแถบบนแถว = แถวกับแผงเป็นก้อนเดียวกัน */}
                            <div className="animate-fade-in border-l-[3px] border-primary">
                              <RecordCaseDetail
                                record={r}
                                onEdit={() => setEditingId(r.id)}
                              />
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>

            {shown.length ? null : (
              <Empty
                total={records.length}
                onClear={filtered ? clearFilters : undefined}
              />
            )}
          </div>
        </div>

        {/* ── จอ <md: การ์ดแนวตั้ง ไม่ต้องเลื่อนแนวนอน ── */}
        <div className="flex flex-col gap-2.5 md:hidden">
          {pageRows.map((r) => {
            const Dept = departmentIcon(r.departmentId);
            const Cat = RECORD_CATEGORY_ICON;
            const expanded = openId === r.id;

            return (
              <div
                key={r.id}
                className={`flex flex-col overflow-hidden rounded-box border bg-base-100 transition-colors ${
                  expanded ? "border-ink/25" : "border-line"
                }`}
              >
                <div
                  onClick={() => toggle(r.id)}
                  className={`flex cursor-pointer flex-col gap-2.5 p-4 transition-colors ${
                    expanded ? "bg-base-200/60" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={`rc-card-${r.id}`}
                      aria-label={`${expanded ? "ซ่อน" : "ดู"}รายละเอียด ${r.code}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(r.id);
                      }}
                      className={`flex size-5 flex-none items-center justify-center rounded-selector transition-colors ${
                        expanded ? "bg-primary/12 text-primary" : "text-mut"
                      }`}
                    >
                      <ChevronRight
                        size={13}
                        strokeWidth={2.2}
                        aria-hidden
                        className={`transition-transform ${expanded ? "rotate-90" : ""}`}
                      />
                    </button>
                    <span className="font-mono text-11-5 text-mut">{r.code}</span>
                    <RecordStatusBadge status={r.status} />
                    <span className="min-w-0 flex-1 text-14 font-medium text-pretty">
                      {r.title}
                    </span>
                  </div>

                  {expanded ? null : (
                    <p className="line-clamp-2 text-12-5 leading-[1.7] text-mut text-pretty">
                      {r.detail}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-11-5 text-mut">
                    <span className="flex items-center gap-1.5">
                      <Cat size={13} strokeWidth={1.7} className="flex-none" />
                      {recordCategoryLabel(categories, r.category)}
                    </span>
                    <span>{formatOccurredOn(r.occurredOn)}</span>
                    <span className="flex items-center gap-1.5">
                      <Dept size={13} strokeWidth={1.7} className="flex-none" />
                      {departmentLabel(r.departmentId)}
                    </span>
                    {r.involved.length ? (
                      <span className="flex items-center gap-1.5">
                        <Users size={13} strokeWidth={1.7} className="flex-none" />
                        {r.involved.length} คน
                      </span>
                    ) : null}
                    {r.attachments.length ? (
                      <span className="flex items-center gap-1.5">
                        <Paperclip size={13} strokeWidth={1.7} className="flex-none" />
                        {r.attachments.length} ไฟล์
                      </span>
                    ) : null}
                  </div>

                  {/* จอเล็กไม่มี hover — ปุ่มด่วนอยู่ถาวรท้ายส่วนหัวการ์ด ·
                      กางแผงแล้วซ่อนไป เพราะปุ่มชุดเต็มพร้อมหมายเหตุอยู่ในแผงแทน */}
                  {expanded ? null : (
                    <div
                      className="flex items-center justify-end border-t border-line pt-2.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <QuickStatusActions
                        record={r}
                        busy={busyId === r.id}
                        onChange={(to) => change(r, to)}
                      />
                    </div>
                  )}
                </div>

                {expanded ? (
                  <div id={`rc-card-${r.id}`} className="animate-fade-in">
                    <RecordCaseDetail record={r} onEdit={() => setEditingId(r.id)} />
                  </div>
                ) : null}
              </div>
            );
          })}

          {shown.length ? null : (
            <div className="rounded-box border border-dashed border-line bg-base-100">
              <Empty
                total={records.length}
                onClear={filtered ? clearFilters : undefined}
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
          <p className="text-12 text-mut">
            {shown.length ? (
              <>
                แสดง{" "}
                <span className="font-medium text-ink">
                  {sliceFrom + 1}–{sliceFrom + pageRows.length}
                </span>{" "}
                จาก {shown.length} เคส
              </>
            ) : (
              "ไม่มีเคสที่ตรงกับเงื่อนไข"
            )}
            {shown.length !== records.length ? ` (ทั้งคิว ${records.length})` : ""}
          </p>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 sm:flex">
              <span className="flex-none text-12 text-mut">ต่อหน้า</span>
              <Select
                value={String(perPage)}
                onChange={(v) => setPerPage(Number(v))}
                label="จำนวนแถวต่อหน้า"
                variant="ghost"
                options={pageSizeOptions}
              />
            </div>

            <Pager current={current} count={pageCount} onGo={setPage} />
          </div>
        </div>
      </div>

      {/*
       * ฟอร์มต้องอยู่ **นอก** กล่อง `animate-rise`
       *
       * `animate-rise` มี `transform` ในคีย์เฟรม ซึ่งทำให้อีลิเมนต์นั้นกลายเป็น containing
       * block ของลูกที่เป็น `position: fixed` — โมดัลจะไปยึดขอบกล่องนี้แทนขอบจอ
       * หัวโมดัลหลุดออกนอกจอและฉากหลังคลุมแค่บางส่วน (กฎเดียวกับที่ CLAUDE.md ห้าม
       * ใส่ `transform`/`animation` บน `<main>` ของ desk layout)
       */}
      {creating ? (
        <RecordCaseForm categories={categories} onClose={() => setCreating(false)} />
      ) : null}
      {editing ? (
        /* `key` = รหัสเคส เปิดแก้เคสอื่นต่อจะได้เริ่มฟอร์มใหม่ ไม่ค้างค่าของเคสก่อนหน้า */
        <RecordCaseForm
          key={editing.id}
          record={editing}
          categories={categories}
          onClose={() => setEditingId(null)}
        />
      ) : null}
      {managingCategories ? (
        <RecordCategoryManager
          categories={categories}
          onClose={() => setManagingCategories(false)}
        />
      ) : null}
    </>
  );
}

/**
 * หัวคอลัมน์ที่กดเรียงได้ — ทั้งช่องเป็นปุ่ม ไม่ใช่แค่ตัวอักษร
 * ลูกศรขึ้น/ลงบอกทิศที่เรียงอยู่ · คอลัมน์ที่ยังไม่ได้เรียงขึ้นลูกศรจาง ๆ ให้รู้ว่ากดได้
 */
function Th({
  children,
  sortKey,
  active,
  dir,
  onSort,
  className = "",
}: {
  children: React.ReactNode;
  sortKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const on = active === sortKey;
  const Icon = on ? (dir === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;

  return (
    <th
      scope="col"
      aria-sort={on ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={`border-r border-line p-0 font-medium ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`group flex w-full items-center gap-1.5 px-3 py-2 text-left text-11-5 tracking-[0.04em] transition-colors hover:text-ink ${
          on ? "text-ink" : "text-mut"
        }`}
      >
        {children}
        <Icon
          size={12}
          strokeWidth={2}
          aria-hidden
          className={`flex-none transition-opacity ${
            on ? "opacity-100" : "opacity-0 group-hover:opacity-60"
          }`}
        />
      </button>
    </th>
  );
}

function Empty({ total, onClear }: { total: number; onClear?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2.5 px-5 py-14 text-center">
      <Bookmark size={24} strokeWidth={1.6} className="text-mut" aria-hidden />
      <p className="text-sm font-semibold">
        {total ? "ไม่มีเคสที่ตรงกับเงื่อนไข" : "ยังไม่มีบันทึกเคส"}
      </p>
      <p className="max-w-[46ch] text-12-5 leading-[1.7] text-mut text-pretty">
        {total
          ? "ลองล้างตัวกรองหรือเปลี่ยนคำค้นหา"
          : "กด “บันทึกเคสใหม่” เพื่อบันทึกเรื่องแรกเข้าระบบ"}
      </p>
      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="rounded-full border border-line px-3.5 py-1.5 text-12-5 transition-colors hover:border-ink/30 hover:text-ink"
        >
          ล้างตัวกรอง
        </button>
      ) : null}
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-12-5 transition-colors ${
        active
          ? "border-ink bg-ink font-medium text-ink-content"
          : "border-line bg-base-100 text-mut hover:border-primary/40 hover:text-ink"
      }`}
    >
      {label}
      <span className={active ? "opacity-70" : "text-mut"}>{count}</span>
    </button>
  );
}
