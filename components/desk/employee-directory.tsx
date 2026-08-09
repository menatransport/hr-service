"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Building2, MapPin, SearchX, Users, X } from "lucide-react";

import { EmployeeCard } from "@/components/desk/employee-card";
import { SearchField, Select } from "@/components/ui/field";
import type { Employee } from "@/lib/types";

/**
 * สมุดรายชื่อพนักงาน — แถบเครื่องมือแถวเดียวชิดซ้าย ติดขอบบนตอนเลื่อน
 * แล้วรายชื่อจัดกลุ่มตามแผนกอยู่ใต้ลงมา
 *
 * กรองทั้งหมดในเครื่อง ไม่ยิง API ซ้ำ — `/users` ส่งมาทั้งบริษัทในครั้งเดียวอยู่แล้ว
 * (ราว 140 คนหลังตัดคนที่พ้นสภาพออก) การกรองฝั่งเซิร์ฟเวอร์จะช้ากว่าและทำให้
 * พิมพ์แล้วผลกระตุก · `useDeferredValue` กันเฟรมตกตอนพิมพ์เร็ว ๆ — ช่องกรอก
 * อัปเดตทันที ส่วนตารางการ์ดตามมาทีหลังได้ ไม่มีใครสังเกต
 *
 * กติกาที่ตกลงกันไว้แล้ว **อย่าเปลี่ยนโดยไม่ถาม**:
 * - ตัวกรองเป็น **dropdown ไม่ใช่ชิป** — 18 แผนกเรียงเป็นชิปกินพื้นที่เกือบครึ่งจอ
 * - **ไม่มีชิปสรุปตัวกรองที่ใช้อยู่** — trigger ของ dropdown แสดงค่าที่เลือกอยู่แล้ว
 *   ชิปคือการเขียนข้อมูลเดิมซ้ำรอบสอง (คุ้มเมื่อมีตัวกรอง ≥4 ตัว หรือเป็น multi-select)
 *   ใช้ **ring สี primary บน trigger** บอกว่ากรองอยู่แทน ซึ่งกินพื้นที่ 0px
 * - **ไม่มีตัวกรองสถานะพนักงาน** — คนที่พ้นสภาพถูกตัดออกตั้งแต่ `getEmployees()`
 * - **ไม่มีเงาวาว ๆ** ทั้งแถบ ใช้เส้นขอบกับพื้นแยกชั้นแทน
 */

/** ค่าที่แปลว่า “ไม่กรอง” — Radix Select ห้ามใช้ `""` เป็น value ของตัวเลือก */
const ALL = "all";

/** ตัดช่องว่างและพิมพ์เล็กใหญ่ทิ้ง — รหัสพนักงานบางที่พิมพ์ติดกัน บางที่มีขีด */
const norm = (v: string) => v.toLowerCase().replace(/[\s-]/g, "");

interface DeptGroup {
  department: string;
  employees: Employee[];
}

function groupByDepartment(employees: Employee[]): DeptGroup[] {
  const groups = new Map<string, Employee[]>();
  for (const employee of employees) {
    const bucket = groups.get(employee.department);
    if (bucket) bucket.push(employee);
    else groups.set(employee.department, [employee]);
  }
  // `getEmployees()` เรียงตามแผนกมาแล้ว ลำดับที่แทรกเข้า Map จึงถูกต้องอยู่แล้ว
  return [...groups].map(([department, list]) => ({
    department,
    employees: list,
  }));
}

/** ตัวเลือกพร้อมจำนวนในวงเล็บ เรียงตามชื่อแบบไทย */
function countedOptions(values: string[], allLabel: string) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);

  return [
    { value: ALL, label: `${allLabel} (${values.length})` },
    ...[...counts]
      .sort((a, b) => a[0].localeCompare(b[0], "th"))
      .map(([value, count]) => ({ value, label: `${value} (${count})` })),
  ];
}

export function EmployeeDirectory({ employees }: { employees: Employee[] }) {
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState(ALL);
  const [site, setSite] = useState(ALL);
  const deferred = useDeferredValue(query);

  /**
   * ตัวเลือกของ dropdown แต่ละตัวนับจากรายชื่อที่ผ่าน dropdown **อีกตัว** มาแล้ว
   * แต่ **ไม่นับคำค้น** — ตัวเลขจึงตรงกับสิ่งที่จะเจอจริง โดยไม่กระโดดตอนพิมพ์
   */
  const departmentOptions = useMemo(
    () =>
      countedOptions(
        employees
          .filter((e) => site === ALL || e.site === site)
          .map((e) => e.department),
        "ทุกแผนก",
      ),
    [employees, site],
  );

  const siteOptions = useMemo(
    () =>
      countedOptions(
        employees
          .filter((e) => department === ALL || e.department === department)
          .map((e) => e.site),
        "ทุกสาขา",
      ),
    [employees, department],
  );

  const results = useMemo(() => {
    const q = norm(deferred.trim());
    return employees.filter((e) => {
      if (department !== ALL && e.department !== department) return false;
      if (site !== ALL && e.site !== site) return false;
      if (!q) return true;
      return (
        norm(e.name).includes(q) ||
        norm(e.employeeId).includes(q) ||
        norm(e.position).includes(q)
      );
    });
  }, [employees, deferred, department, site]);

  const groups = useMemo(() => groupByDepartment(results), [results]);

  const searching = Boolean(deferred.trim());
  const filtered = department !== ALL || site !== ALL;
  const filtering = searching || filtered;

  function clearFilters() {
    setQuery("");
    setDepartment(ALL);
    setSite(ALL);
  }

  return (
    <div className="flex flex-col gap-6">
      {/**
       * แผงควบคุม — ติดใต้ topbar ตอนเลื่อน (เฉพาะ ≥lg)
       *
       * รายชื่อยาว 18 กลุ่ม เลื่อนลงไปแล้วอยากเปลี่ยนแผนกต้องไม่ต้องถีบกลับขึ้นบน
       * จอเล็กไม่ติด เพราะแถบพับเป็น 3 บรรทัด + topbar แล้วกินจอเกินครึ่ง
       *
       * `-mx-8 px-8` ดันพื้น `bg-canvas` ให้กินเต็มรางซ้าย-ขวาของ `<main>`
       * ไม่งั้นการ์ดจะโผล่ลอดข้างแถบตอนเลื่อน · `z-20` ต่ำกว่า topbar (`z-30`)
       */}
      <div className="flex flex-col gap-3 lg:sticky lg:top-14 lg:z-20 lg:-mx-8 lg:bg-canvas lg:px-8 lg:pt-1 lg:pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2.5">
          <SearchField
            value={query}
            onChange={setQuery}
            label="ค้นหาพนักงานด้วยชื่อ รหัสพนักงาน หรือตำแหน่ง"
            placeholder="ค้นหาด้วยชื่อ รหัสพนักงาน หรือตำแหน่ง…"
            className="w-full min-w-60 sm:max-w-110 sm:flex-1"
          />

          {/* จอเล็กวาง 2 คอลัมน์เท่ากัน — ประหยัดไปหนึ่งบรรทัด และตัวเลือกกางเป็น
              bottom sheet เต็มจออยู่แล้ว ป้ายบน trigger ที่โดนตัดจึงไม่เป็นปัญหา */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2.5">
            <FilterSelect
              value={department}
              onChange={setDepartment}
              options={departmentOptions}
              label="กรองตามแผนก"
              searchPlaceholder="ค้นหาแผนก…"
              icon={Building2}
              width="sm:w-54"
            />
            <FilterSelect
              value={site}
              onChange={setSite}
              options={siteOptions}
              label="กรองตามสาขา"
              icon={MapPin}
              width="sm:w-46"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line pb-3">
          {/* live region ต้องไม่ถูก remount — `key` จึงอยู่ที่ span ชั้นใน
              ไม่ใช่ที่ <p> ไม่งั้น screen reader บางตัวจะไม่ประกาศผลลัพธ์ */}
          <p role="status" aria-live="polite" className="text-[12.5px] text-mut">
            <span key={results.length} className="inline-block animate-fade-in">
              {filtering
                ? `พบ ${results.length} คน จากทั้งหมด ${employees.length} คน · ${groups.length} แผนก`
                : `พนักงานทั้งหมด ${employees.length} คน · ${groups.length} แผนก`}
            </span>
          </p>

          {filtering ? (
            <button
              type="button"
              onClick={clearFilters}
              className="flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] text-mut underline-offset-4 transition-colors hover:text-ink hover:underline"
            >
              <X size={14} strokeWidth={1.9} aria-hidden />
              ล้างตัวกรอง
            </button>
          ) : null}
        </div>
      </div>

      {results.length === 0 ? (
        <EmptyResult
          query={query.trim()}
          filtered={filtered}
          onClear={clearFilters}
        />
      ) : (
        <div className="flex flex-col gap-7">
          {groups.map((group) => (
            <section key={group.department} className="flex flex-col gap-3.5">
              <div className="flex items-center gap-2.5">
                <Users
                  size={16}
                  strokeWidth={1.7}
                  className="flex-none text-primary"
                  aria-hidden
                />
                <h2 className="text-[14px] font-semibold">{group.department}</h2>
                <span className="rounded-full bg-soft px-2 py-0.5 text-[11.5px] font-medium text-primary">
                  {group.employees.length}
                </span>
                <span aria-hidden className="h-px flex-1 bg-line" />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {group.employees.map((employee, index) => (
                  <EmployeeCard
                    key={employee.employeeId}
                    employee={employee}
                    index={index}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * dropdown ตัวกรองหนึ่งช่อง
 *
 * ไอคอนนำหน้าค่าเป็นตัวบอก “มิติ” ของตัวกรอง — พอเลือกแล้ว trigger จะขึ้น
 * “ยานยนต์ (12)” กับ “Lat Krabang (124)” เรียงติดกัน ถ้าไม่มีไอคอนจะแยกไม่ออก
 * ว่าอันไหนแผนกอันไหนสาขา · เน้นตอนกรองอยู่ด้วย `ring-inset` ไม่ใช่ `border`
 * หรือ `bg` เพราะสองอันหลังชนกับคลาสที่ `Select` ใส่มาให้แล้ว ผลจะไม่แน่นอน
 */
function FilterSelect({
  value,
  onChange,
  options,
  label,
  searchPlaceholder,
  icon: Icon,
  width,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
  searchPlaceholder?: string;
  icon: typeof Building2;
  width: string;
}) {
  const active = value !== ALL;

  return (
    <Select
      value={value}
      onChange={onChange}
      options={options}
      label={label}
      searchPlaceholder={searchPlaceholder}
      icon={
        <Icon
          size={15}
          strokeWidth={1.7}
          aria-hidden
          className={`flex-none ${active ? "text-primary" : "text-mut"}`}
        />
      }
      className={`w-full ${width} ${
        active ? "font-medium text-primary ring-1 ring-primary/40 ring-inset" : ""
      }`}
    />
  );
}

function EmptyResult({
  query,
  filtered,
  onClear,
}: {
  query: string;
  filtered: boolean;
  onClear: () => void;
}) {
  const reason = query
    ? filtered
      ? `ไม่พบ “${query}” ในขอบเขตที่กรองไว้ — ลองล้างตัวกรองแล้วค้นใหม่ทั้งบริษัท`
      : `ไม่มีชื่อ รหัส หรือตำแหน่งที่ตรงกับ “${query}” — ลองพิมพ์แค่บางส่วนของชื่อ`
    : "ไม่มีพนักงานที่ตรงกับตัวกรองที่เลือกไว้";

  return (
    <div className="flex animate-fade-in flex-col items-center gap-2.5 rounded-box border border-dashed border-line bg-base-100 px-5 py-12 text-center">
      <SearchX size={24} strokeWidth={1.6} className="text-mut" aria-hidden />
      <p className="text-sm font-semibold">ไม่พบพนักงานที่ตรงกับที่ค้นหา</p>
      <p className="max-w-[46ch] text-[12.5px] leading-[1.7] text-mut text-pretty">
        {reason}
      </p>

      {/* ทางตันต้องมีทางกลับด้วยคลิกเดียว — ไม่งั้นผู้ใช้ต้องไล่ล้างเองทีละช่อง */}
      <button
        type="button"
        onClick={onClear}
        className="mt-1.5 cursor-pointer rounded-full border border-line bg-base-100 px-4 py-2 text-[12.5px] text-ink transition-colors hover:border-primary/40 hover:text-primary"
      >
        ล้างตัวกรองทั้งหมด
      </button>
    </div>
  );
}
