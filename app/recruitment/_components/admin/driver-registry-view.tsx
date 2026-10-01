"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  ListFilter,
  SearchX,
  X,
} from "lucide-react";

import { DriverAvatar } from "@/app/recruitment/_components/admin/driver-avatar";
import { DriverStatusControl } from "@/app/recruitment/_components/admin/driver-status-control";
import { ResignDocumentsButton } from "@/app/recruitment/_components/admin/resign-document-maker";
import { ColumnMenu, type ColumnFilterOption } from "@/components/ui/column-menu";
import { Pager } from "@/components/ui/pager";
import { SearchField } from "@/components/ui/field";
import {
  SegmentedControl,
  SummaryPanel,
  SummaryStat,
  SummaryStats,
  SummaryStrip,
  SummaryToolbar,
} from "@/components/ui/summary-panel";
import {
  DRIVER_SITES,
  LICENSE_WARN_DAYS,
  OWNER_TYPE_KEYS,
  OWNER_TYPE_LABELS,
  PROBATION_MONTHS,
  formatLicenseGap,
  formatTenure,
  formatThaiDate,
  isProbation,
  licenseState,
  primaryPhone,
  workStatusFullLabel,
  workStatusTone,
  type DriverRecord,
  type DriverRegistry,
  type DriverSiteKey,
  type LicenseState,
} from "@/app/recruitment/_lib/drivers/types";

/**
 * ทะเบียนประวัติ พจส. — ตารางข้อมูลแบบมาตรฐาน (เรียง + กรองที่หัวคอลัมน์)
 *
 * **คอลัมน์เรียงตามหน้า `/registry-history` ของ `mena-next-lb`** ซึ่งฝ่ายบุคคล
 * ใช้อยู่ทุกวัน — คนที่สลับมาหน้านี้ต้องไม่ต้องเรียนรู้ใหม่ว่าอะไรอยู่ตรงไหน
 * ชื่อคอลัมน์ก็ลอกมาทั้งดุ้น (“แพล้นท์” คือ `plant`, “ประเภท” คือ `owner_type`)
 *
 * **ตารางใช้รูปแบบเดียวกับหน้าผู้สมัคร** (`candidates-view.tsx` + `sheet-column.tsx`) —
 * หัวคอลัมน์เป็นป้ายตัวเล็กทั้งแท่งที่กดได้ทั้งช่อง ปักหมุดด้านบนขณะเลื่อน · คอลัมน์ชื่อปักหมุดขอบซ้าย
 * ตอนเลื่อนแนวนอน · กล่องตารางเลื่อนของมันเอง · **อย่าแก้ให้หลุดจากหน้าผู้สมัคร** เพราะฝ่ายบุคคล
 * สลับสองหน้านี้ไปมาทั้งวัน
 *
 * ตัวกรองเป็นรายการติ๊กถูก **เริ่มที่ไม่ติ๊กอะไรเลย = ไม่กรอง**
 * ติ๊กหลายค่าในคอลัมน์เดียวกันคือ “หรือ” · ติ๊กข้ามคอลัมน์คือ “และ”
 * เลิกใช้ dropdown เลือกค่าเดียวของเดิมทั้งหมด เพราะเลือกทีละค่าแล้วต้องกรองซ้ำ
 * หลายรอบเวลาอยากดูสองแพล้นท์พร้อมกัน
 *
 * ที่ **ตั้งใจทำต่างจากของเดิม**:
 * - **ไม่มีคอลัมน์ “ประเภทรถ” (MS/ML)** — ตัดออกตามที่ตกลงกันไว้
 *   **อย่าเอากลับเข้าตารางโดยไม่ถาม**
 * - **มีรูปประจำตัวหน้าชื่อ และกดอัปรูปได้จากในตารางเลย** (`DriverAvatar`)
 * - **ไทล์ตัวเลขกดได้** สี่ใบบนสุด กดแล้วไปติ๊กตัวกรองของคอลัมน์ที่เกี่ยวข้องให้
 * - **วันที่เป็น พ.ศ. พร้อมชื่อเดือนไทย** ไม่ใช่ `12/03/2019` ซึ่งอ่านสลับปีได้
 * - **ไม่มีสวิตช์เปิด/ปิดสถานะ ไม่มีแก้ข้อมูลทะเบียน** — ฟิลด์จาก ETL ถูก sync
 *   ทับเป็นรอบ เขียนกลับเท่ากับเขียนทิ้ง · รูปเป็นข้อยกเว้นเพราะเป็นฟิลด์ของ
 *   hr-service เอง ซึ่ง sync ไม่แตะ (ดู `lib/drivers/registry.ts`)
 *
 * ทั้งชุดถูกส่งมาจากเซิร์ฟเวอร์ครั้งเดียวแล้วกรองในเครื่อง ท่าเดียวกับ
 * `EmployeeDirectory` — ยิงกรองฝั่งเซิร์ฟเวอร์ทุกครั้งที่พิมพ์จะช้ากว่าและกระตุก
 */

type SiteFilter = DriverSiteKey | "all" | "other";
type EmploymentTab = "current" | "resigned";

type FilterKey = "vehicle" | "plant" | "owner" | "tenure" | "license" | "status" | "fleet";
type Filters = Record<FilterKey, string[]>;

type SortKey = "name" | "vehicle" | "fleet" | "plant" | "owner" | "tenure" | "license" | "status";
type SortDir = "asc" | "desc";

/**
 * แถวต่อหน้า — ตรึงไว้ที่ 50 ตามที่ตกลงกับเจ้าของงาน (16 ก.ย. 2026)
 *
 * ทะเบียนมีหลักพันแถว การวาดทั้งชุดทีเดียวทำให้ตอนกรอง/เรียงกระตุกเห็นได้ชัด
 * **ไม่มีตัวเลือก “ต่อหน้า”** ต่างจากคิวคำร้อง — ที่นี่ค้นกับกรองเป็นทางหลัก
 * เลขหน้าเป็นแค่ทางสำรองตอนไล่อ่าน จึงไม่ต้องมีปุ่มให้ตั้งค่าเพิ่ม
 */
const PAGE_SIZE = 50;

const NO_FILTERS: Filters = {
  vehicle: [],
  plant: [],
  owner: [],
  tenure: [],
  license: [],
  status: [],
  fleet: [],
};

/** ป้ายของกลุ่มตัวกรอง — ใช้ทั้งบนหัวคอลัมน์ ปุ่มบนแถบ และชิปสรุป */
const FILTER_LABELS: Record<FilterKey, string> = {
  vehicle: "รถที่ขับ",
  plant: "แพล้นท์",
  owner: "ประเภท",
  tenure: "อายุงาน",
  license: "ใบขับขี่",
  status: "สถานะ",
  fleet: "ลูกค้า",
};

/** ค่าที่ไม่มีข้อมูล — ต้องแยกจาก “ยังไม่ติ๊ก” ให้ชัด จึงใช้คีย์เฉพาะแทนสตริงว่าง */
const NONE = "__none__";

const norm = (v: string) => v.toLowerCase().replace(/[\s-]/g, "");

/** ตัวคั่นท้ายสุดตอนเรียง — ค่าว่างต้องไปอยู่ท้ายรายการเสมอ ไม่ใช่ขึ้นหัวตาราง */
const LAST = "￿";

/**
 * นิยามคอลัมน์ทั้งตาราง — ป้าย ความกว้าง ตัวกรองที่ผูกอยู่ และคำอธิบายทิศการเรียง
 *
 * รวมไว้ที่เดียวเพื่อให้หัวตาราง (จอกว้าง) กับแถบชิป (จอแคบ) อ่านจากแหล่งเดียวกัน
 * เพิ่ม/ย้ายคอลัมน์จึงแก้ที่นี่ที่เดียว ไม่ต้องไล่แก้สองที่ให้หลุดกัน
 *
 * `asc`/`desc` ถูกนำหน้าด้วยคำว่า “เรียง ” ในเมนู จึงเขียนให้อ่านต่อกันได้เลย
 */
const COLUMNS: {
  sort: SortKey;
  label: string;
  width: string;
  filter?: FilterKey;
  asc: string;
  desc: string;
  align?: "start" | "end";
}[] = [
  { sort: "name", label: "คนขับ", width: "w-[264px]", asc: "ชื่อ ก → ฮ", desc: "ชื่อ ฮ → ก" },
  {
    sort: "vehicle",
    label: "รถที่ขับ",
    width: "w-[144px]",
    filter: "vehicle",
    asc: "น้อย → มาก",
    desc: "มาก → น้อย",
  },
  {
    sort: "fleet",
    label: "ลูกค้า",
    width: "w-[148px]",
    filter: "fleet",
    asc: "ก → ฮ",
    desc: "ฮ → ก",
  },
  {
    sort: "plant",
    label: "แพล้นท์",
    width: "w-[136px]",
    filter: "plant",
    asc: "ก → ฮ",
    desc: "ฮ → ก",
  },
  {
    sort: "owner",
    label: "ประเภท",
    width: "w-[116px]",
    filter: "owner",
    asc: "พจส. → พจส.สแปร์",
    desc: "พจส.สแปร์ → พจส.",
  },
  {
    sort: "tenure",
    label: "อายุงาน",
    width: "w-[150px]",
    filter: "tenure",
    asc: "น้อย → มาก",
    desc: "มาก → น้อย",
  },
  {
    sort: "license",
    label: "ใบขับขี่หมดอายุ",
    width: "w-[168px]",
    filter: "license",
    asc: "ใกล้หมดอายุก่อน",
    desc: "หมดอายุช้าสุดก่อน",
  },
  {
    sort: "status",
    label: "สถานะ",
    width: "w-[146px]",
    filter: "status",
    asc: "ก → ฮ",
    desc: "ฮ → ก",
    align: "end",
  },
];

/**
 * คอลัมน์ที่ **ไม่ขึ้นในแท็บ “พ้นสภาพแล้ว”** (16 ก.ย. 2026 ตามคำสั่งเจ้าของงาน)
 *
 * รถที่ประจำ ลูกค้า และแพล้นท์ เป็นของ “คนที่ยังวิ่งงานอยู่” — คนที่ออกไปแล้ว
 * ค่าพวกนี้เป็นเศษที่ ETL ยังไม่ล้าง อ่านแล้วเข้าใจผิดว่ายังประจำรถคันนั้นอยู่
 *
 * ซ่อนตาม **แท็บ ไม่ใช่ตาม `driver.active` รายคน** — หัวตารางมีชุดเดียวทั้งตาราง
 * ถ้าซ่อนทีละแถว ช่องจะเลื่อนไม่ตรงหัวทันทีที่มีคนพ้นสภาพปนมาในแท็บปัจจุบัน
 */
const RESIGNED_HIDDEN = new Set<string>(["vehicle", "fleet", "plant"]);

/** ข้อความในคอลัมน์รถ — ลาดกระบังนำด้วยเลขรถ สาขาอื่นนำด้วยทะเบียน */
function vehicleLead(driver: DriverRecord): string {
  const code = driver.vehicle?.code || "";
  const plate = driver.vehicle?.plateNo || driver.vehicleRef;
  return driver.siteKey === "latkrabang" ? code || plate : plate || code;
}

export function DriverRegistryView({ registry }: { registry: DriverRegistry }) {
  const { drivers } = registry;

  const [site, setSite] = useState<SiteFilter>("all");
  const [employment, setEmployment] = useState<EmploymentTab>("current");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const deferred = useDeferredValue(query);

  /** กล่องตารางเลื่อนของมันเอง เปลี่ยนหน้าแล้วต้องดึงกลับขึ้นหัวตาราง ไม่ใช่ค้างกลางหน้าใหม่ */
  const tableBox = useRef<HTMLDivElement>(null);

  const resignedTab = employment === "resigned";
  /** ชุดคอลัมน์ของแท็บที่เปิดอยู่ — หัวตาราง เมนูบนแถบ (จอแคบ) และช่องในแถวอ่านจากตัวนี้ตัวเดียว */
  const columns = useMemo(
    () => (resignedTab ? COLUMNS.filter((c) => !RESIGNED_HIDDEN.has(c.sort)) : COLUMNS),
    [resignedTab],
  );

  /** ทุกแท็บนับจำนวนของตัวเองเสมอ ไม่ว่าตัวกรองอื่นจะเลือกอะไรอยู่ */
  const siteCounts = useMemo(() => {
    const counts = new Map<SiteFilter, number>();
    for (const d of drivers) {
      const key: SiteFilter = d.siteKey ?? "other";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    counts.set("all", drivers.length);
    return counts;
  }, [drivers]);

  /** รายชื่อในขอบเขตสาขา + สถานะการจ้างที่เลือกอยู่ — ฐานของทั้งไทล์และตัวเลือกตัวกรอง */
  const scope = useMemo(
    () =>
      drivers.filter((d) => {
        if (site !== "all" && (d.siteKey ?? "other") !== site) return false;
        return employment === "current" ? d.active : !d.active;
      }),
    [drivers, site, employment],
  );

  const counts = useMemo(() => {
    let probation = 0;
    let expired = 0;
    let withoutVehicle = 0;

    for (const d of scope) {
      if (isProbation(d.tenureMonths)) probation++;
      if (licenseState(d.licenseDaysLeft) === "expired") expired++;
      if (!d.vehicleRef) withoutVehicle++;
    }

    return { total: scope.length, probation, expired, withoutVehicle };
  }, [scope]);

  /**
   * ตัวเลือกของทุกคอลัมน์ นับจาก `scope` — **ไม่นับจากผลลัพธ์ที่กรองแล้ว**
   * ไม่งั้นค่าที่ยังไม่ได้ติ๊กจะหายไปจากรายการทันทีที่ติ๊กค่าแรก แล้วจะเลือก
   * ค่าที่สองไม่ได้เลย ทั้งที่ตัวกรองในคอลัมน์เดียวกันเป็น “หรือ”
   */
  const options = useMemo(() => {
    const plant = new Map<string, number>();
    const fleet = new Map<string, number>();
    const owner = new Map<string, number>();
    const status = new Map<string, number>();
    const license = new Map<LicenseState, number>();
    let hasVehicle = 0;
    let noVehicle = 0;
    let probation = 0;
    let normalTenure = 0;

    for (const d of scope) {
      const bump = (map: Map<string, number>, key: string) =>
        map.set(key, (map.get(key) ?? 0) + 1);

      bump(plant, d.vehicle?.plant || NONE);
      bump(fleet, d.vehicle?.fleet || NONE);
      bump(owner, d.ownerTypeKey ?? NONE);
      bump(status, d.work?.latestStatus || NONE);

      const state = licenseState(d.licenseDaysLeft);
      license.set(state, (license.get(state) ?? 0) + 1);

      if (d.vehicleRef) hasVehicle++;
      else noVehicle++;
      if (isProbation(d.tenureMonths)) probation++;
      else if (d.tenureMonths !== null) normalTenure++;
    }

    /** ค่าที่ไม่มีข้อมูลไปท้ายสุดเสมอ ไม่ปนกลางรายการที่เรียงตามตัวอักษร */
    const byLabel = (map: Map<string, number>, noneLabel: string): ColumnFilterOption[] =>
      [...map]
        .sort((a, b) => {
          if (a[0] === NONE) return 1;
          if (b[0] === NONE) return -1;
          return a[0].localeCompare(b[0], "th");
        })
        .map(([value, count]) => ({
          value,
          label: value === NONE ? noneLabel : value,
          count,
        }));

    const licenseOrder: [LicenseState, string][] = [
      ["expired", "หมดอายุแล้ว"],
      ["soon", `ใกล้หมดอายุ (ภายใน ${LICENSE_WARN_DAYS} วัน)`],
      ["ok", "ปกติ"],
      ["unknown", "ไม่มีวันหมดอายุ"],
    ];

    return {
      vehicle: (
        [
          { value: "has", label: "ประจำรถแล้ว", count: hasVehicle },
          { value: "none", label: "ยังไม่มีรถ", count: noVehicle },
        ] as ColumnFilterOption[]
      ).filter((o) => o.count),
      plant: byLabel(plant, "ไม่ระบุแพล้นท์"),
      fleet: byLabel(fleet, "ไม่ระบุลูกค้า"),
      owner: [
        ...OWNER_TYPE_KEYS.filter((key) => owner.get(key)).map((key) => ({
          value: key,
          label: OWNER_TYPE_LABELS[key],
          count: owner.get(key),
        })),
        ...(owner.get(NONE)
          ? [{ value: NONE, label: "ไม่ระบุประเภท", count: owner.get(NONE) }]
          : []),
      ] as ColumnFilterOption[],
      tenure: (
        [
          { value: "under4", label: `น้อยกว่า ${PROBATION_MONTHS} เดือน`, count: probation },
          { value: "normal", label: "พนักงานปกติ", count: normalTenure },
        ] as ColumnFilterOption[]
      ).filter((o) => o.count),
      license: licenseOrder
        .filter(([key]) => license.get(key))
        .map(([key, label]) => ({ value: key, label, count: license.get(key) })),
      status: [...status]
        .sort((a, b) => {
          if (a[0] === NONE) return 1;
          if (b[0] === NONE) return -1;
          return b[1] - a[1];
        })
        .map(([code, count]) => ({
          value: code,
          label: code === NONE ? "ไม่มีบันทึกสถานะ" : `${code} — ${workStatusFullLabel(code)}`,
          count,
        })),
    };
  }, [scope]);

  const results = useMemo(() => {
    const q = norm(deferred.trim());
    /** ไม่ติ๊กอะไรเลย = ผ่านหมด · ติ๊กแล้วต้องตรงกับค่าใดค่าหนึ่งที่ติ๊กไว้ */
    const on = (key: FilterKey, value: string) =>
      filters[key].length === 0 || filters[key].includes(value);

    const rows = scope.filter((d) => {
      if (!on("vehicle", d.vehicleRef ? "has" : "none")) return false;
      if (!on("plant", d.vehicle?.plant || NONE)) return false;
      if (!on("fleet", d.vehicle?.fleet || NONE)) return false;
      if (!on("owner", d.ownerTypeKey ?? NONE)) return false;
      if (!on("status", d.work?.latestStatus || NONE)) return false;
      if (!on("license", licenseState(d.licenseDaysLeft))) return false;
      if (!on("tenure", isProbation(d.tenureMonths) ? "under4" : "normal")) return false;

      if (!q) return true;
      return (
        norm(d.name).includes(q) ||
        norm(d.drivercode).includes(q) ||
        norm(d.phone).includes(q) ||
        norm(d.vehicleRef).includes(q) ||
        norm(d.vehicle?.code ?? "").includes(q) ||
        norm(d.vehicle?.plateNo ?? "").includes(q) ||
        norm(d.vehicle?.fleet ?? "").includes(q) ||
        norm(d.vehicle?.plant ?? "").includes(q)
      );
    });

    if (!sortKey) return rows;

    const mul = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => compare(a, b, sortKey) * mul);
  }, [scope, deferred, filters, sortKey, sortDir]);

  const activeFilters = useMemo(
    () =>
      (Object.keys(NO_FILTERS) as FilterKey[])
        .filter((key) => filters[key].length > 0)
        .map((key) => ({ key, values: filters[key] })),
    [filters],
  );

  const filtering = Boolean(deferred.trim()) || activeFilters.length > 0;

  /* ------------------------------------------------------------ แบ่งหน้า */

  const pageCount = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  /**
   * หน้าปัจจุบันคิดจาก state แทนที่จะบังคับให้ state ถูกเสมอ — ถ้าจำนวนแถวหดลง
   * จนหน้าเดิมหายไป จะได้ไม่ค้างอยู่ที่หน้าว่าง (ท่าเดียวกับ `case-table.tsx`)
   */
  const current = Math.min(page, pageCount);
  const sliceFrom = (current - 1) * PAGE_SIZE;
  const pageRows = results.slice(sliceFrom, sliceFrom + PAGE_SIZE);

  /**
   * ค้น/กรอง/เรียง/สลับแท็บแล้วต้องกลับหน้า 1 — ปรับ state ตอน render ตามแนวเดียวกับ
   * `case-table.tsx` (กฎ `react-hooks/set-state-in-effect` ห้ามย้ายไปไว้ใน effect)
   */
  const resetKey = `${site}|${employment}|${deferred}|${JSON.stringify(filters)}|${sortKey}|${sortDir}`;
  const [lastKey, setLastKey] = useState(resetKey);
  if (lastKey !== resetKey) {
    setLastKey(resetKey);
    setPage(1);
  }

  function goToPage(next: number) {
    setPage(next);
    tableBox.current?.scrollTo({ top: 0 });
    /* จอแคบเป็นการ์ดยาวทั้งหน้า ไม่มีกล่องเลื่อนของตัวเอง จึงต้องเลื่อนทั้งหน้าต่างแทน */
    if (!tableBox.current?.clientHeight) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setFilter(key: FilterKey, next: string[]) {
    setFilters((prev) => ({ ...prev, [key]: next }));
  }

  function clearFilters() {
    setQuery("");
    setFilters(NO_FILTERS);
  }

  /** เลือกทิศจากในเมนูตรง ๆ — `null` = เลิกเรียงด้วยคอลัมน์นั้น กลับไปลำดับตามรหัส */
  function setSort(key: SortKey, dir: SortDir | null) {
    if (!dir) {
      setSortKey(null);
      return;
    }
    setSortKey(key);
    setSortDir(dir);
  }

  /**
   * สลับแท็บแล้วต้องทิ้งตัวกรอง/การเรียงของคอลัมน์ที่กำลังจะถูกซ่อนไปด้วย
   * ไม่งั้นแท็บ “พ้นสภาพ” จะกรองหรือเรียงด้วยเงื่อนไขที่มองไม่เห็นบนหน้าจอ
   */
  function changeEmployment(next: EmploymentTab) {
    setEmployment(next);
    if (next !== "resigned") return;

    setFilters((prev) => ({ ...prev, vehicle: [], fleet: [], plant: [] }));
    if (sortKey && RESIGNED_HIDDEN.has(sortKey)) setSortKey(null);
  }

  /** ไทล์ตัวเลขเป็นทางลัดไปติ๊กตัวกรองของคอลัมน์ — กดซ้ำเพื่อเลิกกรอง */
  function toggleTile(key: FilterKey, value: string) {
    setFilter(key, filters[key].includes(value) ? [] : [value]);
  }

  /** เมนูของคอลัมน์หนึ่ง — ไอคอนเดียวคุมทั้งเรียงและกรอง ใช้ซ้ำทั้งหัวตารางและแถบชิป */
  const columnMenu = (column: (typeof COLUMNS)[number], variant: "head" | "chip") => (
    <ColumnMenu
      label={column.label}
      variant={variant}
      align={column.align ?? "start"}
      sort={{
        dir: sortKey === column.sort ? sortDir : null,
        ascLabel: column.asc,
        descLabel: column.desc,
        onSort: (dir) => setSort(column.sort, dir),
      }}
      filter={
        column.filter
          ? {
              options: options[column.filter],
              selected: filters[column.filter],
              onChange: (next) => setFilter(column.filter!, next),
            }
          : undefined
      }
    />
  );

  return (
    <div className="flex flex-col gap-4">
      

      <SummaryPanel label="สรุปทะเบียน">
        <SummaryStats>
          <SummaryStat
            lead
            label={resignedTab ? "พ้นสภาพแล้ว" : "ปฏิบัติงานอยู่"}
            value={counts.total}
            unit="คน"
            sub={site === "all" ? "ทุกสาขา" : `สาขา${siteFilterLabel(site)}`}
            tone={resignedTab ? "alert" : "ink"}
          />
          <SummaryStat
            label={`อายุงานน้อยกว่า ${PROBATION_MONTHS} เดือน`}
            value={counts.probation}
            unit="คน"
            share={counts.probation / (counts.total || 1)}
            title="กลุ่มที่ต้องตามดูใกล้ ๆ"
            dot="bg-primary"
            tone="primary"
            filterHint
            active={filters.tenure.includes("under4")}
            onClick={() => toggleTile("tenure", "under4")}
          />
          <SummaryStat
            label="ใบขับขี่หมดอายุ"
            value={counts.expired}
            unit="คน"
            share={counts.expired / (counts.total || 1)}
            title="ต้องระงับการจ่ายงาน"
            dot="bg-alert"
            tone="alert"
            filterHint
            active={filters.license.includes("expired")}
            onClick={() => toggleTile("license", "expired")}
          />
          <SummaryStat
            label="ยังไม่มีทะเบียนรถ"
            value={counts.withoutVehicle}
            unit="คน"
            share={counts.withoutVehicle / (counts.total || 1)}
            title="ยังไม่ได้ประจำคันไหน"
            dot="bg-sla"
            tone="sla"
            filterHint
            active={filters.vehicle.includes("none")}
            onClick={() => toggleTile("vehicle", "none")}
          />
        </SummaryStats>

        <SummaryToolbar className="lg:flex-wrap">
          <SearchField
            value={query}
            onChange={setQuery}
            label="ค้นหาในทะเบียนประวัติ"
            placeholder="ค้นหาชื่อ รหัส ทะเบียน เลขรถ ลูกค้า แพล้นท์…"
            tone="filled"
            className="w-full lg:max-w-88 lg:flex-1"
          />

          <SiteTabs value={site} counts={siteCounts} onChange={(v) => setSite(v)} />

          {/* จอแคบไม่มีหัวตารางให้กด — ยกเมนูของทุกคอลัมน์มาไว้บนแถบแทน
              ใช้คอมโพเนนต์และ state ตัวเดียวกัน ไม่ได้เขียนตรรกะซ้ำ */}
          <div className="flex flex-wrap items-center gap-2 lg:hidden">
            {columns.map((column) => (
              <span key={column.sort}>{columnMenu(column, "chip")}</span>
            ))}
          </div>
        </SummaryToolbar>

        {activeFilters.length > 0 ? (
          <ActiveFilterBar
            active={activeFilters}
            options={options}
            onClear={(key) => setFilter(key, [])}
            onClearAll={clearFilters}
          />
        ) : null}

        {/* แท็บสถานะการจ้าง + ยอดที่เหลือหลังกรอง — ขีดใต้แท็บวางทับขอบล่างของการ์ดพอดี */}
        <SummaryStrip className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <div className="-mx-3 flex gap-1">
            <EmploymentTabButton
              active={employment === "current"}
              onClick={() => changeEmployment("current")}
            >
              พนักงานปัจจุบัน
            </EmploymentTabButton>
            <EmploymentTabButton
              active={resignedTab}
              tone="alert"
              onClick={() => changeEmployment("resigned")}
            >
              พ้นสภาพแล้ว
            </EmploymentTabButton>
          </div>

          <p role="status" aria-live="polite" className="pb-2.5 text-12-5 text-mut">
            <span key={results.length} className="inline-block animate-fade-in">
              {filtering ? (
                <>
                  พบ{" "}
                  <span className="font-semibold text-primary tabular-nums">
                    {results.length.toLocaleString("th-TH")}
                  </span>{" "}
                  คน จาก {counts.total.toLocaleString("th-TH")} คน
                </>
              ) : (
                <>
                  ทั้งหมด{" "}
                  <span className="font-semibold text-ink tabular-nums">
                    {results.length.toLocaleString("th-TH")}
                  </span>{" "}
                  คน
                </>
              )}
            </span>
          </p>
        </SummaryStrip>
      </SummaryPanel>

      {results.length === 0 ? (
        <EmptyResult query={query.trim()} onClear={clearFilters} />
      ) : (
        <>
          {/*
            ── จอ ≥lg: ตารางข้อมูลเต็ม ──

            **รูปแบบเดียวกับตารางหน้าผู้สมัคร** (`candidates-view.tsx`) — หัวคอลัมน์
            ปักหมุดด้านบน · คอลัมน์ชื่อปักหมุดขอบซ้าย · กล่องตารางเลื่อนของมันเอง
            ทั้งสองแกน · ฝ่ายบุคคลสลับสองหน้านี้ไปมาทั้งวัน จึงไม่ควรต้องเรียนท่ากดใหม่

            `relative` ทำให้กล่องนี้เป็น containing block ของ `.sr-only` ในแต่ละแถว
            — เหตุผลเต็มอยู่ที่กล่องเดียวกันของตารางผู้สมัคร

            **แบ่งหน้าละ `PAGE_SIZE` แถว** (16 ก.ย. 2026) — กล่องยังเลื่อนของมันเองอยู่
            ภายในหน้าเดียว แต่ไม่ต้องวาดทั้งพันแถวอีกต่อไป · แถบเลขหน้าอยู่ใต้กล่อง
            ชิดขวา ใช้ `Pager` ตัวเดียวกับคิวคำร้อง **อย่าเขียนแถบเลขหน้าขึ้นใหม่**
          */}
          <div
            ref={tableBox}
            className="elev-card relative hidden max-h-[calc(100dvh-13rem)] overflow-auto rounded-box border border-line bg-base-100 lg:block"
          >
            <table
              /* แท็บพ้นสภาพเหลือ 5 คอลัมน์ ถ้าคงความกว้างขั้นต่ำเดิมไว้จะเหลือที่ว่างยาวท้ายตาราง */
              className={`w-full border-collapse text-13 ${
                resignedTab ? "min-w-[760px]" : "min-w-[1120px]"
              }`}
            >
              <thead>
                <tr>
                  {columns.map((column, i) => (
                    <Head
                      key={column.sort}
                      column={column}
                      sorted={sortKey === column.sort ? sortDir : null}
                      menu={columnMenu(column, "head")}
                      /* คอลัมน์แรกยึดทั้งบนทั้งซ้าย ต้องซ้อนสูงกว่าหัวอื่นที่เลื่อนผ่าน */
                      stickyLeft={i === 0}
                    />
                  ))}
                  {resignedTab ? (
                    <th className="sticky top-0 z-10 w-14 border-b border-line-strong bg-head px-3 py-2.5 text-center font-mono text-10-5 font-semibold tracking-[0.07em] text-mut uppercase">
                      เอกสาร
                    </th>
                  ) : null}
                  <th className="sticky top-0 z-10 w-9 border-b border-line-strong bg-head px-3 py-2.5 text-right font-mono text-10-5 font-semibold tracking-[0.07em] text-mut uppercase">
                    ประวัติ
                  </th>
                </tr>
              </thead>
              {/*
                `key` เปลี่ยนทุกครั้งที่ชุดแถวเปลี่ยน → แถวถูกสร้างใหม่ แอนิเมชันขาเข้า
                จึงเล่นซ้ำ · เป็นตัวบอกว่า “ตารางตอบสิ่งที่เพิ่งกดไปแล้ว” ซึ่งสำคัญมาก
                ตอนกรองแล้วจำนวนแถวใกล้เคียงของเดิมจนดูเหมือนไม่มีอะไรเกิดขึ้น
              */}
              <tbody key={`${current}-${results.length}-${sortKey ?? ""}-${sortDir}`}>
                {pageRows.map((d, i) => (
                  <Row key={d.drivercode} driver={d} index={i} hideVehicle={resignedTab} />
                ))}
              </tbody>
            </table>
          </div>

          {/* ── จอ <lg: การ์ดแถวละคน ตารางแนวนอนใช้บนจอแคบไม่ได้ ── */}
          <ul
            key={`${current}-${results.length}`}
            className="flex flex-col gap-2.5 lg:hidden"
          >
            {pageRows.map((d, i) => (
              <li key={d.drivercode}>
                <DriverCard driver={d} index={i} hideVehicle={resignedTab} />
              </li>
            ))}
          </ul>

          <PageBar
            from={sliceFrom + 1}
            to={sliceFrom + pageRows.length}
            total={results.length}
            current={current}
            count={pageCount}
            onGo={goToPage}
          />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- การเรียง */

/** แถวที่ไม่มีค่าไปท้ายเสมอ — ไม่ว่าจะเรียงขึ้นหรือลง แถวว่างขึ้นหัวตารางไม่มีประโยชน์ */
function byNumber(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

const byText = (a: string, b: string) => (a || LAST).localeCompare(b || LAST, "th");

function compare(a: DriverRecord, b: DriverRecord, key: SortKey): number {
  switch (key) {
    case "name":
      return byText(a.name, b.name);
    case "vehicle":
      return byText(vehicleLead(a), vehicleLead(b));
    case "fleet":
      return byText(a.vehicle?.fleet ?? "", b.vehicle?.fleet ?? "");
    case "plant":
      return byText(a.vehicle?.plant ?? "", b.vehicle?.plant ?? "");
    case "owner":
      return byText(a.ownerTypeKey ?? "", b.ownerTypeKey ?? "");
    case "tenure":
      return byNumber(a.tenureMonths, b.tenureMonths);
    case "license":
      return byNumber(a.licenseDaysLeft, b.licenseDaysLeft);
    case "status":
      return byText(a.work?.latestStatus ?? "", b.work?.latestStatus ?? "");
  }
}

/* ------------------------------------------------------------------ แถว */

function Row({
  driver,
  index,
  hideVehicle,
}: {
  driver: DriverRecord;
  index: number;
  /**
   * แท็บ “พ้นสภาพแล้ว” — ตัดช่องรถ/ลูกค้า/แพล้นท์ออก (ดู `RESIGNED_HIDDEN`)
   * และเพิ่มช่องปุ่มทำเอกสารพ้นสภาพ
   */
  hideVehicle: boolean;
}) {
  const router = useRouter();
  const href = `/recruitment/admin/drivers/${encodeURIComponent(driver.drivercode)}`;

  /**
   * แถวของคนที่พ้นสภาพแล้วเป็น **โทนแดงทั้งแถว** — รูป รหัส พื้นตอนชี้ ลูกศรท้ายแถว
   *
   * ดูจาก `driver.active` ไม่ใช่จากแท็บที่เปิดอยู่ — สีจึงติดไปกับภาพที่แคปส่งต่อ
   * และกับกระดาษที่พิมพ์ออกมา ซึ่งไม่มีแท็บติดไปด้วย · ถ้าวันหนึ่งแท็บ “ปัจจุบัน”
   * มีคนที่เพิ่งกดพ้นสภาพปนอยู่ แถวนั้นก็แดงทันทีโดยไม่ต้องรอสลับแท็บ
   */
  const resigned = !driver.active;

  return (
    /*
      แถวใช้ **เฟดอย่างเดียว ไม่มี transform** โดยตั้งใจ — ในแถวมี `DriverAvatar`
      ที่เปิดกล่องครอปรูปแบบ `position: fixed` ได้ · transform บนแถวจะกลายเป็น
      containing block ของกล่องนั้น (กติกาเดียวกับ `<main>` ของ desk layout)
      หน่วงไล่กันแค่ 12 แถวแรก แถวที่เหลือขึ้นพร้อมกัน ไม่งั้นหน้าละ 500 แถว
      จะค่อย ๆ ไล่ขึ้นเป็นนาที
    */
    <tr
      onClick={() => router.push(href)}
      style={{ animationDelay: `${Math.min(index, 12) * 22}ms` }}
      className={`group animate-fade-in cursor-pointer border-b transition-colors last:border-b-0 ${
        resigned ? "border-alert/15 hover:bg-alert-soft" : "border-line hover:bg-base-200/50"
      }`}
    >
      {/* ชื่อยึดขอบซ้ายไว้ตอนตารางเลื่อนแนวนอน — กติกาเดียวกับตารางผู้สมัคร
          พื้นต้องทึบ (ไม่ใช่ `/50` ของแถว) ไม่งั้นตัวหนังสือคอลัมน์ที่เลื่อนผ่านจะทะลุขึ้นมา */}
      <td
        className={`sticky left-0 z-[5] bg-base-100 px-3 py-2 after:absolute after:inset-y-0 after:right-0 after:w-px ${
          resigned ? "after:bg-alert/20 group-hover:bg-alert-soft" : "after:bg-line group-hover:bg-base-200"
        }`}
      >
        <span className="flex items-center gap-2.5">
          <span className="flex-none transition-transform duration-300 group-hover:scale-108">
            <DriverAvatar driver={driver} />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-medium text-ink">{driver.name || "—"}</span>
            <span className="flex items-center gap-2 font-mono text-10-5 tracking-wider">
              {/* ลิงก์จริงหนึ่งจุดต่อแถว — แถวที่คลิกได้ด้วย onClick อย่างเดียว
                  แท็บไปไม่ถึงและโปรแกรมอ่านหน้าจอไม่เห็นว่ามีอะไรให้กด */}
              <Link
                href={href}
                onClick={(e) => e.stopPropagation()}
                className={`transition-colors hover:text-ink ${resigned ? "text-alert" : "text-primary"}`}
              >
                {driver.drivercode}
              </Link>
              {driver.phone ? <span className="text-mut">{primaryPhone(driver.phone)}</span> : null}
            </span>
          </span>
        </span>
      </td>

      {hideVehicle ? null : (
        <>
          <td className="px-3 py-2 whitespace-nowrap">
            <VehicleCell driver={driver} />
          </td>

          <td className="max-w-[148px] truncate px-3 py-2" title={driver.vehicle?.fleet}>
            {driver.vehicle?.fleet || <Dash />}
          </td>

          <td className="max-w-[136px] truncate px-3 py-2" title={driver.vehicle?.plant}>
            {driver.vehicle?.plant || <Dash />}
          </td>
        </>
      )}

      <td className="px-3 py-2 whitespace-nowrap">
        <OwnerTypeBadge driver={driver} />
      </td>

      <td className="px-3 py-2 whitespace-nowrap">
        <TenureCell driver={driver} />
      </td>

      <td className="px-3 py-2 whitespace-nowrap">
        <LicenseCell driver={driver} />
      </td>

      {/* ช่องที่มีปุ่มกดได้ใช้ระยะแคบกว่า กติกาเดียวกับช่องแก้ได้ของตารางผู้สมัคร */}
      <td className="px-2 py-1.5 whitespace-nowrap">
        <StatusCell driver={driver} />
      </td>

      {/* ใบลาออก + แบบสอบถามลาออก — เฉพาะแท็บพ้นสภาพ (ชุดคอลัมน์ตามแท็บ ไม่ใช่ตามคน) */}
      {hideVehicle ? (
        <td className="px-2 py-1.5 text-center">
          <ResignDocumentsButton driver={driver} />
        </td>
      ) : null}

      <td className="px-3 py-2 text-right">
        <ChevronRight
          size={15}
          strokeWidth={1.8}
          aria-hidden
          className={`inline-block text-mut/60 transition-transform duration-200 group-hover:translate-x-0.5 ${
            resigned ? "group-hover:text-alert" : "group-hover:text-primary"
          }`}
        />
      </td>
    </tr>
  );
}

function DriverCard({
  driver,
  index,
  hideVehicle,
}: {
  driver: DriverRecord;
  index: number;
  /** ซ่อนชุดเดียวกับตาราง — การ์ดจอแคบคือตารางเดียวกันในอีกรูปแบบ */
  hideVehicle: boolean;
}) {
  /* กติกาเดียวกับ `Row` — คนที่พ้นสภาพแล้วอ่านออกจากสีได้ก่อนอ่านตัวหนังสือ */
  const resigned = !driver.active;

  return (
    <Link
      href={`/recruitment/admin/drivers/${encodeURIComponent(driver.drivercode)}`}
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
      className={`group flex animate-lift-in flex-col gap-2.5 rounded-box border bg-base-100 p-3.5 transition-[transform,border-color,background-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_28px_-22px_var(--color-ink)] active:translate-y-0 ${
        resigned
          ? "border-alert/25 hover:border-alert/50 hover:bg-alert-soft"
          : "border-line hover:border-primary/40 hover:bg-soft/35"
      }`}
    >
      <div className="flex items-start gap-3">
        <DriverAvatar driver={driver} size="md" />
        <div className="min-w-0 flex-1">
          <span className="block text-13-5 font-medium text-pretty">{driver.name || "—"}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-11-5 text-mut">
            <span className={resigned ? "text-alert" : "text-primary"}>{driver.drivercode}</span>
            {driver.phone ? <span>{primaryPhone(driver.phone)}</span> : null}
          </span>
        </div>
        <StatusCell driver={driver} />
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line pt-2.5 text-12">
        {hideVehicle ? null : (
          <>
            <CardField label="รถที่ขับ">
              <VehicleCell driver={driver} />
            </CardField>
            <CardField label="ลูกค้า">
              <span className="truncate text-ink">{driver.vehicle?.fleet || "—"}</span>
            </CardField>
            <CardField label="แพล้นท์">
              <span className="truncate text-ink">{driver.vehicle?.plant || "—"}</span>
            </CardField>
          </>
        )}
        <CardField label="อายุงาน">
          <TenureCell driver={driver} />
        </CardField>
        <CardField label="ใบขับขี่หมดอายุ">
          <LicenseCell driver={driver} />
        </CardField>
      </div>
    </Link>
  );
}

function CardField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="text-11 text-mut">{label}</span>
      {children}
    </span>
  );
}

/* ----------------------------------------------------------- ช่องย่อย */

/**
 * เลขรถกับทะเบียน — **ลาดกระบังเรียกกันด้วยเลขรถ** สาขาอื่นใช้ทะเบียน
 * ตัวที่สาขานั้นใช้เป็นหลักจึงอยู่บรรทัดบนตัวหนา อีกตัวเป็นบรรทัดรอง
 * (กติกาเดียวกับ `VehicleDrivenCell` ของระบบเดิม)
 */
function VehicleCell({ driver }: { driver: DriverRecord }) {
  const lead = vehicleLead(driver);
  if (!lead) return <span className="text-12-5 text-mut">ยังไม่มีรถ</span>;

  const code = driver.vehicle?.code || "";
  const plate = driver.vehicle?.plateNo || driver.vehicleRef;
  const sub = driver.siteKey === "latkrabang" ? plate : code;

  return (
    <>
      <span className="block font-mono text-12-5 font-medium">{lead}</span>
      {sub && sub !== lead ? (
        <span className="mt-0.5 block font-mono text-11 text-mut">{sub}</span>
      ) : null}
    </>
  );
}

function TenureCell({ driver }: { driver: DriverRecord }) {
  const probation = isProbation(driver.tenureMonths);

  return (
    <span className="flex flex-col gap-0.5">
      <span className={`text-13 font-medium ${probation ? "text-primary" : "text-ink"}`}>
        {formatTenure(driver.tenureMonths, driver.tenureDays)}
      </span>
      <span className="text-11 text-mut">
        เริ่ม {formatThaiDate(driver.startDateISO) || "—"}
      </span>
    </span>
  );
}

const LICENSE_NOTE_TONE: Record<LicenseState, string> = {
  expired: "text-alert font-medium",
  soon: "text-sla font-medium",
  ok: "text-mut",
  unknown: "text-mut",
};

function LicenseCell({ driver }: { driver: DriverRecord }) {
  const state = licenseState(driver.licenseDaysLeft);

  if (state === "unknown") return <Dash>ไม่มีวันหมดอายุ</Dash>;

  return (
    <span className="flex flex-col gap-0.5">
      <span
        className={`font-mono text-12-5 tabular-nums ${
          state === "expired" ? "font-semibold text-alert" : "text-ink"
        }`}
      >
        {formatThaiDate(driver.licenseExpiryISO)}
      </span>
      <span className={`text-11 ${LICENSE_NOTE_TONE[state]}`}>
        {formatLicenseGap(driver.licenseDaysLeft)}
      </span>
    </span>
  );
}

const WORK_TONE = {
  work: "bg-st-live text-st-live-ink",
  leave: "bg-st-wait text-st-wait-ink",
  /* พ้นสภาพ (`ลอ` `ปอ`) — แดงชุดเดียวกับป้ายสถานะการจ้างที่อยู่ถัดไปในบรรทัดเดียวกัน */
  exit: "bg-alert-soft text-alert",
  other: "bg-st-new text-st-new-ink",
};

/**
 * สถานะ — **บรรทัดเดียว**: ป้ายรหัสสถานะงานล่าสุด ตามด้วยสถานะการจ้าง
 *
 * เดิมเป็นสองบรรทัดที่ต่างก็เต็มเสียง (ชิปสี + จุดสี+ข้อความ) เลยอ่านหนัก
 * ทั้งที่ทั้งคู่เป็นข้อมูลเล็ก ๆ · คราวนี้แบ่งน้ำหนักให้ชัดว่าอะไรนำอะไรตาม
 * โดยดูจาก **ตัวไหนเปลี่ยนค่าไปตามแถว**:
 *
 * - **รหัสสถานะงานได้สี** เพราะมันคือค่าที่ต่างกันทุกแถว จึงเป็นสิ่งเดียวในช่องนี้
 *   ที่คุ้มกับการกวาดตาหา — เขียว = ได้ออกงาน · เหลือง = ลา · ฟ้า = ไม่ได้งาน/อื่น ๆ
 *   คำเต็มอยู่ใน `title` เพราะบางอันยาว 30 ตัวอักษร ใส่ในคอลัมน์ไม่ได้
 * - **สถานะการจ้างเป็นปุ่มข้อความสีจาง** ไม่ใช่ชิป เพราะในแท็บหนึ่ง ๆ ทุกแถวมีค่า
 *   เท่ากันหมด (แท็บกรองด้วยค่านี้อยู่แล้ว) การให้สีมันคือการตะโกนคำเดิม 50 รอบ
 *   แต่ยังต้องมีอยู่ ไว้ยืนยันตอนพิมพ์ออกมาหรือแคปหน้าจอส่งต่อ ซึ่งไม่มีแท็บติดไปด้วย
 *   · กดแล้วเปลี่ยนเป็นพ้นสภาพได้ตรงนั้นเลย (`DriverStatusControl`)
 *
 * ป้ายรหัสกว้างขั้นต่ำเท่ากันทุกแถว (`min-w-7`) ตัวอักษร 1–3 ตัวจึงเรียงเป็นแนวเดียว
 * และข้อความข้างหลังไม่ขยับเข้าออกตามความยาวรหัส
 */
function StatusCell({ driver }: { driver: DriverRecord }) {
  const code = driver.work?.latestStatus ?? "";

  return (
    <span className="flex items-center gap-2">
      {code ? (
        <span
          title={workStatusFullLabel(code)}
          className={`inline-flex min-w-7 flex-none items-center justify-center rounded-selector px-1.5 py-0.5 font-mono text-11-5 font-semibold ${
            WORK_TONE[workStatusTone(code)]
          }`}
        >
          {code}
        </span>
      ) : (
        <span
          title="ยังไม่มีบันทึกสถานะการทำงาน"
          className="inline-flex min-w-7 flex-none items-center justify-center rounded-selector border border-dashed border-line px-1.5 py-0.5 font-mono text-11-5 text-mut"
        >
          —
        </span>
      )}

      <DriverStatusControl driver={driver} />
    </span>
  );
}

function OwnerTypeBadge({ driver }: { driver: DriverRecord }) {
  if (!driver.ownerTypeLabel) return <Dash />;

  return (
    <span
      title={driver.ownerTypeKey ? `รหัส ${driver.ownerType}` : "รหัสที่ยังไม่รู้ความหมาย"}
      className={`inline-flex items-center rounded-selector px-1.5 py-0.5 text-11 font-semibold ${
        driver.ownerTypeKey
          ? "bg-base-200 text-ink"
          : "border border-dashed border-line text-mut"
      }`}
    >
      {driver.ownerTypeLabel}
    </span>
  );
}

function Dash({ children }: { children?: React.ReactNode }) {
  return <span className="text-12 text-mut">{children ?? "—"}</span>;
}

/* --------------------------------------------------------- หัวคอลัมน์ */

/**
 * หัวคอลัมน์— ช่องเปล่าที่มีแต่กรอบ ป้ายกับเมนูทั้งหมดอยู่ใน `ColumnMenu`
 *
 * ทั้งป้ายคือปุ่มเดียวที่เปิดเมนูเรียง+กรอง ตามรูปแบบของตารางผู้สมัคร
 * (`sheet-column.tsx`) — `<th>` จึงไม่มี padding แนวตั้ง (`py-0`) ปล่อยให้ปุ่ม
 * ข้างในกินพื้นที่เต็มช่อง กดตรงไหนของหัวคอลัมน์ก็ได้เมนู
 *
 * เส้นใต้เป็น `border-b` ธรรมดาได้ เพราะหัวตารางชุดนี้ปักหมุดด้วย `sticky`
 * กับ `border-collapse` ที่มีพื้นทึบ (`bg-head`) อยู่แล้ว — ท่าเดียวกับ
 * ตารางผู้สมัคร ที่พิสูจน์มาแล้วว่าเส้นไม่หายเวลาเลื่อน
 *
 * `aria-sort` อยู่ที่ `<th>` ไม่ใช่ที่ปุ่ม — role ของปุ่มไม่รองรับ และโปรแกรม
 * อ่านหน้าจออ่านสถานะการเรียงจากหัวคอลัมน์
 */
function Head({
  column,
  sorted,
  menu,
  stickyLeft,
}: {
  column: (typeof COLUMNS)[number];
  sorted: SortDir | null;
  menu: React.ReactNode;
  /** คอลัมน์แรกปักหมุดทั้งบนและซ้าย จึงต้องซ้อนสูงกว่าหัวอื่นที่เลื่อนผ่านใต้มัน */
  stickyLeft?: boolean;
}) {
  return (
    /*
      เส้นใต้เป็น `border-b` ธรรมดาได้ เพราะหัวตารางมีพื้นทึบ (`bg-head`)
      ไม่ใช่พื้นโปร่งแสง+เบลอ — ท่าเดียวกับตารางผู้สมัคร ที่พิสูจน์มาแล้วว่า
      เส้นไม่หายเวลาเลื่อน · เบลอกันการไหลทะลุแนวตั้งได้ แต่กันแนวนอนไม่ได้

      `py-0` ที่ `<th>` โดยตั้งใจ — ปุ่มข้างในเป็นคนกินพื้นที่ทั้งหมดเอง
      กดตรงไหนของหัวคอลัมน์ก็เปิดเมนูเรียง+กรอง (กติกาเดียวกับ `sheet-column.tsx`)
    */
    <th
      aria-sort={sorted ? (sorted === "asc" ? "ascending" : "descending") : "none"}
      className={`${column.width} sticky top-0 border-b border-line-strong bg-head px-3 py-0 text-left whitespace-nowrap ${
        stickyLeft
          ? "left-0 z-20 after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-line"
          : "z-10"
      }`}
    >
      {menu}
    </th>
  );
}

/* --------------------------------------------------------- แถบเครื่องมือ */

/**
 * สรุปตัวกรองที่ติ๊กอยู่
 *
 * ตารางนี้ **ต้องมีชิปสรุป** ต่างจากหน้าค้นหาพนักงานที่ตั้งใจไม่มี — ที่นั่น
 * trigger ของ dropdown แสดงค่าที่เลือกอยู่บนหน้าจอตลอด ชิปจึงเป็นการเขียนซ้ำ
 * ส่วนที่นี่ค่าที่ติ๊กไว้ซ่อนอยู่ใน popover ที่ปิดแล้ว ถ้าไม่มีชิปจะไม่มีทางรู้เลย
 * ว่ากรองอะไรค้างไว้ แล้วจะงงว่าทำไมหาคนที่มีอยู่จริงไม่เจอ
 */
function ActiveFilterBar({
  active,
  options,
  onClear,
  onClearAll,
}: {
  active: { key: FilterKey; values: string[] }[];
  options: Record<FilterKey, ColumnFilterOption[]>;
  onClear: (key: FilterKey) => void;
  onClearAll: () => void;
}) {
  return (
    <div className="flex animate-fade-in flex-wrap items-center gap-2 border-t border-primary/20 bg-soft/45 px-4 py-2">
      <span className="flex items-center gap-1.5 text-11-5 font-medium text-primary">
        <ListFilter size={13} strokeWidth={1.9} aria-hidden />
        กรองอยู่
      </span>

      {active.map(({ key, values }, i) => {
        const labels = values.map((v) => options[key].find((o) => o.value === v)?.label ?? v);
        const shown = labels.length > 2 ? `${labels.length} รายการ` : labels.join(" · ");

        return (
          <span
            key={key}
            style={{ animationDelay: `${i * 40}ms` }}
            className="flex animate-pop-in items-center gap-1.5 rounded-full border border-primary/40 bg-base-100 py-1 pr-1 pl-2.5 text-12 text-primary"
          >
            <span className="text-mut">{FILTER_LABELS[key]}:</span>
            <span className="max-w-52 truncate font-medium" title={labels.join(", ")}>
              {shown}
            </span>
            <button
              type="button"
              onClick={() => onClear(key)}
              aria-label={`เลิกกรอง${FILTER_LABELS[key]}`}
              className="grid size-4.5 cursor-pointer place-items-center rounded-full text-primary/70 transition-colors hover:bg-primary hover:text-primary-content"
            >
              <X size={11} strokeWidth={2.4} aria-hidden />
            </button>
          </span>
        );
      })}

      <button
        type="button"
        onClick={onClearAll}
        className="ml-auto flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-12 text-mut underline-offset-4 transition-colors hover:text-ink hover:underline"
      >
        ล้างทั้งหมด
      </button>
    </div>
  );
}

function siteFilterLabel(site: SiteFilter): string {
  if (site === "all") return "ทุกสาขา";
  if (site === "other") return "อื่น ๆ";
  return DRIVER_SITES.find((s) => s.key === site)?.label ?? site;
}

/**
 * แท็บสาขา — ของเดิมเป็นแท็บบนสุดของหน้า เพราะฝ่ายบุคคลแต่ละคนดูสาขาเดียวทั้งวัน
 * ไม่ใช่ดรอปดาวน์ที่ต้องกดสองครั้งเพื่อสลับ · แท็บ “อื่น ๆ” มีเฉพาะตอนที่มีคนอยู่จริง
 */
function SiteTabs({
  value,
  counts,
  onChange,
}: {
  value: SiteFilter;
  counts: Map<SiteFilter, number>;
  onChange: (v: SiteFilter) => void;
}) {
  const tabs: SiteFilter[] = [
    "all",
    ...DRIVER_SITES.map((s) => s.key),
    ...(counts.get("other") ? (["other"] as SiteFilter[]) : []),
  ];

  return (
    <SegmentedControl
      label="เลือกสาขา"
      value={value}
      onChange={onChange}
      options={tabs.map((tab) => ({ value: tab, label: siteFilterLabel(tab) }))}
      className="w-full sm:w-auto sm:self-start lg:self-auto"
    />
  );
}

function EmploymentTabButton({
  active,
  onClick,
  tone = "primary",
  children,
}: {
  active: boolean;
  onClick: () => void;
  /** แท็บ“พ้นสภาพแล้ว”เป็นแดง ตรงกับสีของแถวในตารางที่มันเปิด */
  tone?: "primary" | "alert";
  children: React.ReactNode;
}) {
  const on = tone === "alert" ? "text-alert" : "text-primary";
  const bar = tone === "alert" ? "bg-alert" : "bg-primary";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group relative cursor-pointer px-3 pt-2 pb-2.5 text-13 transition-colors ${
        active ? `font-medium ${on}` : "text-mut hover:text-ink"
      }`}
    >
      {children}
      {/* ขีดใต้แท็บกางออกจากซ้ายไปขวา แทนที่จะสลับสีขอบทันที — บอกทิศว่าย้ายมาจากไหน */}
      <span
        aria-hidden
        className={`absolute inset-x-0 -bottom-px h-0.5 origin-left rounded-full transition-transform duration-300 ease-out ${
          active ? `scale-x-100 ${bar}` : "scale-x-0 bg-line group-hover:scale-x-100"
        }`}
      />
    </button>
  );
}

/**
 * แถบใต้ตาราง — ช่วงที่แสดงอยู่ (ซ้าย) + เลขหน้า (ขวา)
 *
 * เลขหน้าชิดขวาด้วย `ms-auto` ไม่ใช่แค่ `justify-between` เพราะตอนข้อความซ้ายยาว
 * จนขึ้นบรรทัดใหม่ `justify-between` จะเหวี่ยงปุ่มไปกองซ้ายแทน
 *
 * `Pager` คืน `null` เองเมื่อมีหน้าเดียว — หน้าที่ยังมีแถวไม่ถึง 50 จึงเหลือแต่
 * บรรทัด “แสดง 1–37 จาก 37 คน” ไม่มีปุ่มค้างไว้ให้กดไม่ได้
 */
function PageBar({
  from,
  to,
  total,
  current,
  count,
  onGo,
}: {
  from: number;
  to: number;
  total: number;
  current: number;
  count: number;
  onGo: (page: number) => void;
}) {
  const th = (n: number) => n.toLocaleString("th-TH");

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
      <p role="status" aria-live="polite" className="text-12 text-mut">
        แสดง{" "}
        <span className="font-medium text-ink tabular-nums">
          {th(from)}–{th(to)}
        </span>{" "}
        จาก {th(total)} คน
      </p>

      <div className="ms-auto flex items-center gap-2.5">
        {count > 1 ? (
          <span className="hidden text-12 text-mut tabular-nums sm:inline">
            หน้า {th(current)} จาก {th(count)}
          </span>
        ) : null}
        <Pager current={current} count={count} onGo={onGo} />
      </div>
    </div>
  );
}

function EmptyResult({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="flex animate-lift-in flex-col items-center gap-2.5 rounded-box border border-dashed border-line bg-base-100 px-5 py-12 text-center">
      <span className="grid size-12 animate-pop-in place-items-center rounded-full bg-base-200 text-mut [animation-delay:80ms]">
        <SearchX size={22} strokeWidth={1.6} aria-hidden />
      </span>
      <p className="text-sm font-semibold">ไม่พบคนขับที่ตรงกับที่ค้นหา</p>
      <p className="max-w-[46ch] text-12-5 leading-[1.7] text-mut text-pretty">
        {query
          ? `ไม่มีชื่อ รหัส ทะเบียน เลขรถ ลูกค้า หรือแพล้นท์ที่ตรงกับ “${query}” ในขอบเขตที่กรองไว้`
          : "ไม่มีคนขับที่ตรงกับตัวกรองที่ติ๊กไว้"}
      </p>
      <button
        type="button"
        onClick={onClear}
        className="mt-1.5 cursor-pointer rounded-full border border-line bg-base-100 px-4 py-2 text-12-5 text-ink transition-[color,border-color,background-color,transform] duration-200 hover:-translate-y-px hover:border-primary/40 hover:bg-soft/40 hover:text-primary active:translate-y-0"
      >
        ล้างตัวกรองทั้งหมด
      </button>
    </div>
  );
}
