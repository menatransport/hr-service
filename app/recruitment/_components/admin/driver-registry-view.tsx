"use client";

import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CarFront,
  Eye,
  IdCard,
  ListFilter,
  Plus,
  SearchX,
  X,
} from "lucide-react";

import { DriverAddDialog } from "@/app/recruitment/_components/admin/driver-add-dialog";
import { DriverAvatar } from "@/app/recruitment/_components/admin/driver-avatar";
import { DocRenewalCalendar } from "@/app/recruitment/_components/admin/doc-renewal-calendar";
import { Nickname } from "@/app/recruitment/_components/admin/nickname";
import { DriverStatusControl } from "@/app/recruitment/_components/admin/driver-status-control";
import { ResignDocumentsButton } from "@/app/recruitment/_components/admin/resign-document-maker";
import { ExitInterviewDrawer } from "@/app/recruitment/_components/admin/exit-interview-drawer";
import {
  DataLogExportButton,
  ExitInterviewAction,
  ExitInterviewContext,
  ExitReasonCell,
  ExitStageCell,
  interviewCounts,
  stageOfRow,
  useInterviewSummary,
} from "@/app/recruitment/_components/admin/exit-interview-panel";
import { EXIT_INTERVIEW_MENU, type InterviewStage } from "@/app/recruitment/_lib/exit-interview/types";
import { useCanSee } from "@/components/auth/menu-access-provider";
import { ColumnMenu, type ColumnFilterOption } from "@/components/ui/column-menu";
import { Pager } from "@/components/ui/pager";
import { SearchField } from "@/components/ui/field";
import { XlsxExportButton, type XlsxExportProps } from "@/components/ui/xlsx-export-button";
import { xlsxDate, type XlsxColumn, type XlsxSheet } from "@/lib/xlsx-table";
import { requestJson } from "@/lib/http";
import { useIsDesktop } from "@/lib/use-is-desktop";
import { MascotLoader } from "@/components/ui/mascot";
import type { DriverExportRow } from "@/app/recruitment/_lib/drivers/registry";
import {
  SegmentedControl,
  SummaryBody,
  SummaryFooter,
  SummaryPanel,
  SummaryStrip,
  SummaryToolbar,
} from "@/components/ui/summary-panel";
import {
  DRIVER_SITE_COOKIE,
  DRIVER_SITES,
  LICENSE_WARN_DAYS,
  NEW_DRIVER_HOURS,
  OWNER_TYPE_KEYS,
  OWNER_TYPE_LABELS,
  PROBATION_MONTHS,
  employmentLabel,
  formatLicenseGap,
  formatTenure,
  formatThaiDate,
  isProbation,
  licenseState,
  primaryPhone,
  THAI_MONTHS_SHORT,
  workStatusFullLabel,
  workStatusTone,
  type DriverListRecord,
  type DriverListRegistry,
  type DriverSiteKey,
  type LicenseState,
} from "@/app/recruitment/_lib/drivers/types";
import { thaiCompare } from "@/lib/thai-order";
import { CONTROLLABLE_CHIP, CONTROLLABLE_OPTIONS, controllableLabel } from "@/app/recruitment/_lib/resign-reasons/types";
import { RECRUIT_SITES, type RecruitSite } from "@/app/recruitment/_lib/sites";
import { MixerTabs, mixerCounts, type MixerPick } from "@/app/recruitment/_components/admin/position-tag";
import { groupOfPosition } from "@/app/recruitment/_lib/dashboard/manpower-daily-shared";

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
 * - **ไม่มีช่องแก้ข้อมูลประวัติ** — ประวัติมาจากการนำเข้า Excel / หน้าติดตามพนักงานใหม่
 *   แก้ได้แค่รูปและสถานะการจ้าง (ดู `lib/drivers/registry.ts`)
 *
 * ทั้งชุดถูกส่งมาจากเซิร์ฟเวอร์ครั้งเดียวแล้วกรองในเครื่อง ท่าเดียวกับ
 * `EmployeeDirectory` — ยิงกรองฝั่งเซิร์ฟเวอร์ทุกครั้งที่พิมพ์จะช้ากว่าและกระตุก
 */

/**
 * แท็บสาขา — เหลือสองแท็บ ลาดกระบัง | สระบุรี+บางปะกง ไม่มี “ทุกสาขา” (Bew 11 พ.ย. 2569)
 * · `other` = คนที่สาขาไม่อยู่ในสามสาขาหลัก มีแท็บเฉพาะตอนที่มีคนอยู่จริง
 */
type SiteFilter = "latkrabang" | "saraburi-bangpakong" | "other";

const SITE_TAB_KEYS: Record<Exclude<SiteFilter, "other">, DriverSiteKey[]> = {
  latkrabang: ["latkrabang"],
  "saraburi-bangpakong": ["saraburi", "bangpakong"],
};

/** แท็บของคนขับ — ไม่อยู่ในสามสาขาหลัก = `other` */
function siteTabOf(siteKey: DriverSiteKey | null | undefined): SiteFilter {
  if (siteKey === "saraburi" || siteKey === "bangpakong") return "saraburi-bangpakong";
  return siteKey === "latkrabang" ? "latkrabang" : "other";
}

/**
 * แท็บที่ผู้ใช้เห็น — `sites` จาก `visibleRecruitSites()` (เห็นแค่สาขาตัวเอง · สิทธิ์ “ดูทุกสาขา” / site อื่นเห็นทั้งหมด)
 * · `other` มีเฉพาะคนที่เห็นทุกสาขา และมีคนอยู่จริง
 */
function siteTabsOf(sites: readonly RecruitSite[], totals: Record<string, number>): SiteFilter[] {
  const all = sites.length === RECRUIT_SITES.length;
  return [...sites, ...(all && totals.other ? (["other"] as SiteFilter[]) : [])];
}
/** ทำงาน | พ้นสภาพ | ย้ายไปรถร่วม/พจส. — การย้ายไม่ใช่การลาออก แยกแท็บ (Bew 25 พ.ย. 2569) */
type EmploymentTab = "current" | "resigned" | "moved";

type FilterKey =
  | "vehicle"
  | "plant"
  | "owner"
  | "tenure"
  | "licenseType"
  | "docs"
  | "status"
  | "fleet"
  | "exitMonth"
  | "exitReason"
  | "exitCategory"
  | "exitControl"
  | "exitOwner";
type Filters = Record<FilterKey, string[]>;

type SortKey =
  | "exitMonth"
  | "exitDate"
  | "exitReason"
  | "exitCategory"
  | "exitControl"
  | "exitOwner"
  | "name"
  | "code"
  | "phone"
  | "age"
  | "vehicle"
  | "fleet"
  | "plant"
  | "owner"
  | "tenure"
  | "licenseType"
  | "license"
  | "status";
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
  licenseType: [],
  docs: [],
  status: [],
  fleet: [],
  exitMonth: [],
  exitReason: [],
  exitCategory: [],
  exitControl: [],
  exitOwner: [],
};

/** ป้ายของกลุ่มตัวกรอง — ใช้ทั้งบนหัวคอลัมน์ ปุ่มบนแถบ และชิปสรุป */
const FILTER_LABELS: Record<FilterKey, string> = {
  vehicle: "รถที่ขับ",
  plant: "แพล้นท์",
  owner: "ประเภท",
  tenure: "อายุงาน",
  licenseType: "ชนิดใบขับขี่",
  docs: "เอกสารหมดอายุ",
  status: "สถานะ",
  fleet: "ลูกค้า",
  exitMonth: "ปี-เดือนที่พ้นสภาพ",
  exitReason: "รหัสสาเหตุ",
  exitCategory: "หมวดสาเหตุ",
  exitControl: "ควบคุมได้?",
  exitOwner: "เจ้าของการแก้ไข",
};

/** ค่าที่ไม่มีข้อมูล — ต้องแยกจาก “ยังไม่ติ๊ก” ให้ชัด จึงใช้คีย์เฉพาะแทนสตริงว่าง */
const NONE = "__none__";

const norm = (v: string) => v.toLowerCase().replace(/[\s-]/g, "");

/**
 * แจ้งเตือนเอกสารหมดอายุ — **ใบขับขี่ + บัตรประชาชน** (Bew 21 พ.ย. 2569)
 *
 * ทั้งสองใบใช้เกณฑ์เดียวกัน (`licenseState` · ใกล้หมด = เหลือไม่เกิน `LICENSE_WARN_DAYS` วัน) ·
 * หนึ่งคนมีได้หลายแท็ก (`docTags`) ตัวกรอง “เอกสารหมดอายุ” จึงเป็น “ตรงแท็กใดแท็กหนึ่ง” ไม่ใช่ค่าเดียวต่อแถว
 */
type DocKind = "license" | "idCard";
type DocTag = `${DocKind}:${LicenseState}` | "ok";

const DOC_KINDS: { kind: DocKind; label: string; short: string; Icon: typeof IdCard }[] = [
  { kind: "license", label: "ใบขับขี่", short: "ใบขับขี่", Icon: CarFront },
  { kind: "idCard", label: "บัตรประชาชน", short: "บัตร ปชช.", Icon: IdCard },
];

/** แท็กที่ต้องตาม — การ์ด “เอกสารต้องต่ออายุ” = กรองทั้งสี่แท็กนี้พร้อมกัน */
const ALERT_TAGS: DocTag[] = ["license:expired", "license:soon", "idCard:expired", "idCard:soon"];

const docDays = (d: DriverListRecord, kind: DocKind) => (kind === "license" ? d.licenseDaysLeft : d.idCardDaysLeft);
const docState = (d: DriverListRecord, kind: DocKind) => licenseState(docDays(d, kind));
const needsRenewal = (state: LicenseState) => state === "expired" || state === "soon";

function docTags(d: DriverListRecord): DocTag[] {
  const tags: DocTag[] = DOC_KINDS.map(({ kind }) => `${kind}:${docState(d, kind)}` as DocTag);
  if (!DOC_KINDS.some(({ kind }) => needsRenewal(docState(d, kind)))) tags.push("ok");
  return tags;
}

/** วันที่เหลือน้อยสุดของสองใบ — ใช้เรียงคอลัมน์ (ไม่มีวันหมดอายุทั้งคู่ = `null`) */
function soonestDays(d: DriverListRecord): number | null {
  const days = [d.licenseDaysLeft, d.idCardDaysLeft].filter((v): v is number => v !== null);
  return days.length ? Math.min(...days) : null;
}

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
  { sort: "name", label: "คนขับ", width: "w-[220px]", asc: "ชื่อ ก → ฮ", desc: "ชื่อ ฮ → ก" },
  /* ขึ้นเฉพาะแท็บ “พ้นสภาพแล้ว” (`RESIGNED_ONLY`) ต่อจากคนขับ · 10 พ.ย. 2569
     25 พ.ย. 2569 รวม “ปี-เดือนที่พ้นสภาพ” เข้าช่องนี้ — วันที่บรรทัดบน ปี-เดือนบรรทัดรอง · ตัวกรองรายเดือนย้ายมาที่หัวช่องนี้ */
  {
    sort: "exitDate",
    label: "พ้นสภาพ",
    width: "w-[128px]",
    filter: "exitMonth",
    asc: "เก่า → ใหม่",
    desc: "ใหม่ → เก่า",
  },
  /* สาเหตุการออกแยกเป็น 4 ช่อง ช่องละตัวกรอง (Bew 25 พ.ย. 2569) — ทุกคนเห็น · สถานะ Exit Interview ต่อท้าย (สิทธิ์ `exit-interview`) */
  {
    sort: "exitReason",
    label: "รหัสสาเหตุ",
    width: "w-[220px]",
    filter: "exitReason",
    asc: "รหัส A → Z",
    desc: "รหัส Z → A",
  },
  {
    sort: "exitCategory",
    label: "หมวดสาเหตุ",
    width: "w-[150px]",
    filter: "exitCategory",
    asc: "ก → ฮ",
    desc: "ฮ → ก",
  },
  {
    sort: "exitControl",
    label: "ควบคุมได้?",
    width: "w-[140px]",
    filter: "exitControl",
    asc: "ควบคุมได้ → ไม่ได้",
    desc: "ไม่ได้ → ควบคุมได้",
  },
  {
    sort: "exitOwner",
    label: "เจ้าของการแก้ไข",
    width: "w-[150px]",
    filter: "exitOwner",
    asc: "ก → ฮ",
    desc: "ฮ → ก",
  },
  { sort: "code", label: "รหัสพนักงาน", width: "w-[112px]", asc: "น้อย → มาก", desc: "มาก → น้อย" },
  { sort: "phone", label: "เบอร์โทร", width: "w-[124px]", asc: "น้อย → มาก", desc: "มาก → น้อย" },
  /* อายุจากใบสมัครที่ผูกกับคนนี้ — ทะเบียนไม่มีวันเกิด คนเก่าจาก Excel จึงว่าง (Bew 11 พ.ย. 2569) */
  { sort: "age", label: "อายุ", width: "w-[72px]", asc: "น้อย → มาก", desc: "มาก → น้อย" },
  /* ต่อจากอายุ · กดไปแท็บเอกสารของคนนั้นได้เฉพาะสิทธิ์ “↳ ประวัติ” (Bew 11 พ.ย. 2569) */
  {
    sort: "licenseType",
    label: "ชนิดใบขับขี่",
    width: "w-[112px]",
    filter: "licenseType",
    asc: "ก → ฮ",
    desc: "ฮ → ก",
  },
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
    label: "เอกสารหมดอายุ",
    width: "w-[184px]",
    filter: "docs",
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

/** คอลัมน์ที่ขึ้น **เฉพาะแท็บ “พ้นสภาพแล้ว”** — คนที่ยังทำงานไม่มีวันพ้นสภาพ */
const RESIGNED_ONLY = new Set<string>(["exitMonth", "exitDate", "exitReason", "exitCategory", "exitControl", "exitOwner"]);
/** แท็บย้ายไปรถร่วม/พจส. — ไม่ใช่การลาออก ไม่มีหมวด/ควบคุมได้/เจ้าของ */
const MOVED_HIDDEN = new Set<string>(["exitCategory", "exitControl", "exitOwner"]);

/** ค่าของแต่ละช่องสาเหตุ — ใช้ร่วมกันทั้งตัวกรอง ตัวเลือก และการเรียง · `-` ใน master = ไม่มีเจ้าของ */
const exitOwnerOf = (d: DriverListRecord) => (d.resignation?.owner && d.resignation.owner !== "-" ? d.resignation.owner : "");
const CONTROL_RANK: Record<string, number> = Object.fromEntries(CONTROLLABLE_OPTIONS.map((o, i) => [o.value, i]));

/** `2026-11-10` → `2026-11` (คีย์ตัวกรอง/เรียง · ค.ศ.) */
const exitMonthKey = (d: DriverListRecord) => d.resignation?.dateISO.slice(0, 7) ?? "";

/** `2026-11` → `2569-พ.ย.` — ปี พ.ศ. + เดือนย่อไทย (Bew 10 พ.ย. 2569) */
const formatExitMonth = (key: string) =>
  key ? `${Number(key.slice(0, 4)) + 543}-${THAI_MONTHS_SHORT[Number(key.slice(5, 7)) - 1] ?? key.slice(5, 7)}` : "";

/**
 * ชีตเดียวของไฟล์ Excel — ทะเบียนเต็มรายคน (เลขบัตร · ใบขับขี่ · ผู้ติดต่อฉุกเฉิน · บัญชี · การพ้นสภาพ · ที่มา)
 * ของแถวที่เห็นอยู่ ลำดับเดียวกับตาราง (รวมชีตตาราง + ทะเบียนเต็มเป็นชีตเดียว 20 ต.ค. 2026 · Bew)
 *
 * ตารางไม่ได้ถือข้อมูลส่วนบุคคล จึงดึงตอนกดส่งออก (`POST /api/drivers/export`) · คนที่พ้นสภาพแล้ว
 * ข้อมูลส่วนบุคคลว่างตามกติกาหน้าประวัติ · แท็บพ้นสภาพตัดรถ แต่ยังมีลูกค้า/แพล้นท์ต่อจากสาขา
 */
async function driverSheet(
  rows: DriverListRecord[],
  resigned: boolean,
): Promise<Pick<XlsxSheet<DriverExportRow>, "columns" | "rows">> {
  const full = await requestJson<DriverExportRow[]>(
    "/api/drivers/export",
    { method: "POST", body: { codes: rows.map((d) => d.drivercode) } },
    "ดึงข้อมูลทะเบียนไม่สำเร็จ",
  );
  const date = (iso: string) => xlsxDate(iso);
  const license = (d: DriverExportRow) => licenseState(d.licenseDaysLeft);
  const vehicleColumns: XlsxColumn<DriverExportRow>[] = [
    { header: "เลขรถ", width: 10, kind: "code", value: (d) => d.vehicle?.code || (d.siteKey === "latkrabang" ? d.vehicleRef : "") },
    { header: "ทะเบียนรถ", width: 14, kind: "code", value: (d) => d.vehicle?.plateNo || (d.siteKey === "latkrabang" ? "" : d.vehicleRef) },
    { header: "ประเภทรถ", width: 14, value: (d) => d.vehicle?.vehicleType },
    { header: "ยี่ห้อ / รุ่น", width: 18, value: (d) => [d.vehicle?.brand, d.vehicle?.model].filter(Boolean).join(" ") },
  ];
  /* ลูกค้า/แพล้นท์ล่าสุดในทะเบียน — แท็บพ้นสภาพก็ส่งออกด้วย ต่อจากสาขา (Bew 10 พ.ย. 2569) */
  const placeColumns: XlsxColumn<DriverExportRow>[] = [
    { header: "ลูกค้า", width: 16, value: (d) => d.customer },
    { header: "แพล้นท์", width: 18, value: (d) => d.plant },
  ];
  /* ปี-เดือน + วันที่พ้นสภาพ ต่อจากชื่อ — ชุดเดียวกับตารางแท็บพ้นสภาพ (Bew 10 พ.ย. 2569) */
  const exitColumns: XlsxColumn<DriverExportRow>[] = [
    /* วันที่จริง (วันที่ 1 ของเดือน) แสดง `2569-11` — Excel เรียง/กรองแบบวันที่ได้ */
    {
      header: "ปี-เดือนที่พ้นสภาพ",
      width: 14,
      kind: "month",
      value: (d) => (d.resignation?.dateISO ? date(`${d.resignation.dateISO.slice(0, 7)}-01`) : null),
    },
    { header: "วันที่พ้นสภาพ", width: 13, kind: "date", value: (d) => date(d.resignation?.dateISO ?? "") },
  ];
  const resignColumns: XlsxColumn<DriverExportRow>[] = [
    { header: "หมวดเหตุผล", width: 18, value: (d) => d.resignation?.categoryLabel },
    { header: "เหตุผลที่พ้นสภาพ", width: 28, value: (d) => d.resignation?.reasonLabel },
    { header: "ประเภทการออก", width: 12, kind: "status", value: (d) => d.resignation?.exitType },
    { header: "หมายเหตุการพ้นสภาพ", width: 30, value: (d) => d.resignation?.note },
    /* ชั่วคราว: เขียน “ระบบ” ทุกแถวไปก่อน (Bew 10 พ.ย. 2569) · ค่าจริงอยู่ที่ `d.resignation?.recordedBy` */
    { header: "บันทึกพ้นสภาพโดย", width: 14, value: () => "ระบบ" },
  ];

  const columns: XlsxColumn<DriverExportRow>[] = [
    { header: "รหัสพนักงาน", width: 12, kind: "code", value: (d) => d.drivercode },
    { header: "ชื่อ - นามสกุล", width: 28, value: (d) => d.name },
    ...(resigned ? exitColumns : []),
    { header: "เลขบัตรประชาชน", width: 17, kind: "code", value: (d) => d.nationalId },
    { header: "บัตรประชาชนหมดอายุ", width: 14, kind: "date", value: (d) => date(d.idCardExpiryISO) },
    { header: "เบอร์โทร", width: 14, kind: "code", value: (d) => (d.phone ? primaryPhone(d.phone) : "") },
    { header: "เบอร์อื่น", width: 16, value: (d) => d.phoneAlt },
    { header: "สาขา", width: 14, value: (d) => d.siteLabel || d.branch },
    ...(resigned ? placeColumns : []),
    { header: "ตำแหน่ง", width: 14, value: (d) => d.position },
    { header: "ประเภท", width: 13, kind: "status", value: (d) => d.ownerTypeLabel },
    { header: "รหัสประเภท", width: 10, kind: "code", value: (d) => d.ownerType },
    ...(resigned ? [] : [...vehicleColumns, ...placeColumns]),
    { header: "วันเริ่มงาน", width: 13, kind: "date", value: (d) => date(d.startDateISO) },
    {
      header: "อายุงาน",
      width: 16,
      value: (d) => (d.tenureMonths === null ? "" : formatTenure(d.tenureMonths, d.tenureDays)),
      tone: (d) => (isProbation(d.tenureMonths) ? "ok" : null),
    },
    { header: "อายุงาน (เดือน)", width: 12, kind: "int", value: (d) => d.tenureMonths },
    { header: "วันเกิด", width: 13, kind: "date", value: (d) => date(d.birthDateISO) },
    { header: "อายุ", width: 8, kind: "int", value: (d) => d.age },
    { header: "เลขที่ใบขับขี่", width: 16, kind: "code", value: (d) => d.licenseNo },
    { header: "ชนิดใบขับขี่", width: 10, kind: "code", value: (d) => d.licenseType },
    {
      header: "ใบขับขี่หมดอายุ",
      width: 14,
      kind: "date",
      value: (d) => date(d.licenseExpiryISO),
      tone: (d) => (license(d) === "expired" ? "alert" : null),
    },
    {
      header: "ใบขับขี่เหลือ (วัน)",
      width: 13,
      kind: "int",
      value: (d) => d.licenseDaysLeft,
      tone: (d) => (license(d) === "expired" ? "alert" : license(d) === "soon" ? "warn" : null),
    },
    { header: "ผู้ติดต่อฉุกเฉิน", width: 22, value: (d) => d.emergencyContactName },
    { header: "ความสัมพันธ์", width: 12, value: (d) => d.emergencyContactRelation },
    { header: "เบอร์ผู้ติดต่อฉุกเฉิน", width: 15, kind: "code", value: (d) => d.emergencyContactPhone },
    { header: "เลขบัญชี (กสิกรไทย)", width: 15, kind: "code", value: (d) => d.bankAccountNo },
    { header: "สาขาบัญชี", width: 18, value: (d) => d.bankBranch },
    { header: "สถานะงานล่าสุด", width: 12, kind: "status", value: (d) => d.work?.latestStatus },
    { header: "ความหมายสถานะ", width: 26, value: (d) => workStatusFullLabel(d.work?.latestStatus ?? "") },
    {
      header: "สถานะการจ้าง",
      width: 13,
      kind: "status",
      value: (d) => employmentLabel(d),
      tone: (d) => (d.active ? "ok" : "alert"),
    },
    ...(resigned ? resignColumns : []),
    { header: "แก้ประวัติล่าสุด", width: 17, kind: "datetime", value: (d) => date(d.profileEditedAt) },
    { header: "แก้โดย", width: 18, value: (d) => d.profileEditedBy },
    { header: "ที่มาในทะเบียน", width: 30, value: (d) => d.source },
    { header: "เข้าทะเบียนเมื่อ", width: 17, kind: "datetime", value: (d) => date(d.sourceAt) },
  ];

  return {
    rows: full,
    columns: resigned ? columns.filter((c) => !RESIGNED_XLSX_DROP.has(c.header)) : columns,
  };
}

/**
 * คอลัมน์ที่ตัดออกจาก Excel แท็บพ้นสภาพ — ให้ไฟล์กระชับ (Bew 10 พ.ย. 2569 · “เอาออกไปก่อน”)
 * · ส่วนใหญ่เป็นข้อมูลส่วนบุคคลที่ถูกล้างอยู่แล้วตามกติกาหน้าประวัติ (`withPersonalRule`)
 */
const RESIGNED_XLSX_DROP = new Set([
  "เลขบัตรประชาชน",
  "บัตรประชาชนหมดอายุ",
  "เบอร์อื่น",
  "เลขที่ใบขับขี่",
  "ชนิดใบขับขี่",
  "ใบขับขี่หมดอายุ",
  "ใบขับขี่เหลือ (วัน)",
  "ผู้ติดต่อฉุกเฉิน",
  "ความสัมพันธ์",
  "เบอร์ผู้ติดต่อฉุกเฉิน",
  "เลขบัญชี (กสิกรไทย)",
  "สาขาบัญชี",
  "แก้ประวัติล่าสุด",
  "แก้โดย",
  "ที่มาในทะเบียน",
]);

/** แท็บที่คนนี้อยู่ — ทุกคนอยู่แท็บเดียวเสมอ */
function employmentOf(driver: DriverListRecord): EmploymentTab {
  if (driver.active) return "current";
  const kind = driver.resignation?.kind;
  return kind === "transfer" || kind === "pjs" ? "moved" : "resigned";
}

/** ข้อความในคอลัมน์รถ — ลาดกระบังนำด้วยเลขรถ สาขาอื่นนำด้วยทะเบียน */
function vehicleLead(driver: DriverListRecord): string {
  const code = driver.vehicle?.code || "";
  const plate = driver.vehicle?.plateNo || driver.vehicleRef;
  return driver.siteKey === "latkrabang" ? code || plate : plate || code;
}

/** Mixer L / Mixer S ของคนขับ — ตำแหน่งในทะเบียนก่อน แล้วค่อยประเภทรถ · อื่น ๆ = "" */
function mixerOf(driver: DriverListRecord): string {
  const g = groupOfPosition(driver.position ?? "") ?? groupOfPosition(driver.vehicle?.vehicleType ?? "");
  return g === "Mixer L" || g === "Mixer S" ? g : "";
}

export function DriverRegistryView({
  registry,
  sites,
  initialSite,
  initialDesktop,
}: {
  registry: DriverListRegistry;
  /** แท็บสาขาที่ผู้ใช้เห็นได้ (`visibleRecruitSites`) */
  sites: readonly RecruitSite[];
  /** แท็บตั้งต้น — `?site=` → คุกกี้ `DRIVER_SITE_COOKIE` → สาขาของผู้ใช้ (หน้า server เลือกให้) */
  initialSite: string;
  /** จอ ≥lg ไหม ตามที่หน้า server เดาจาก request (`guessDesktop`) — วาดตารางหรือรายการมือถือชุดเดียว */
  initialDesktop: boolean;
}) {
  const desktop = useIsDesktop(initialDesktop);
  /**
   * สิทธิ์ย่อย “↳ ประวัติ” (/desk/permissions) — ไม่เห็น = ทะเบียน**อ่านอย่างเดียว**: ไม่มี
   * นำเข้า/Sync เปลี่ยนรูป (Bew 5 พ.ย. 2569) · ส่งออก Excel ยังได้ · API กันซ้ำฝั่งเซิร์ฟเวอร์
   * · ปุ่มเพิ่มพนักงาน/เปลี่ยนสถานะกลับมา (Bew 6 พ.ย. 2569) เฉพาะคนที่มีสิทธิ์
   */
  const canEdit = useCanSee("registry-profile");
  const siteTabs = useMemo(() => siteTabsOf(sites, registry.siteTotals), [sites, registry.siteTotals]);
  const [site, setSiteState] = useState<SiteFilter>(() =>
    siteTabs.includes(initialSite as SiteFilter) ? (initialSite as SiteFilter) : siteTabs[0],
  );
  const setSite = useCallback((v: SiteFilter) => {
    setSiteState(v);
    document.cookie = `${DRIVER_SITE_COOKIE}=${v}; path=/recruitment/admin/drivers; samesite=lax`;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("site", v);
      window.history.replaceState(null, "", url);
    } catch {}
  }, []);
  const [employment, setEmployment] = useState<EmploymentTab>("current");
  /** ทั้งหมด | Mixer L | Mixer S — เฉพาะแท็บลาดกระบัง (Bew 25 พ.ย. 2569) · สาขาอื่นไม่กรองต่อเบื้องหลัง */
  const [mixerPick, setMixerPick] = useState<MixerPick>("all");
  const mixer: MixerPick = site === "latkrabang" ? mixerPick : "all";

  /* คนพ้นสภาพไม่มากับหน้า — โหลดตอนเปิดแท็บครั้งแรก · `of` = ชุดของหน้าที่โหลดไว้ (refresh แล้วโหลดใหม่) */
  const [resigned, setResigned] = useState<{ of: DriverListRegistry; rows?: DriverListRecord[]; error?: string } | null>(
    null,
  );
  const resignedLoad = resigned?.of === registry ? resigned : null;
  const resignedRows = resignedLoad?.rows;
  const drivers = useMemo(
    () => (resignedRows ? [...registry.drivers, ...resignedRows] : registry.drivers),
    [registry.drivers, resignedRows],
  );
  const loadingResigned = employment !== "current" && !resignedLoad;

  useEffect(() => {
    if (employment === "current" || resignedLoad) return;
    let alive = true;
    requestJson<DriverListRecord[]>("/api/drivers/resigned", {}, "โหลดรายชื่อพ้นสภาพไม่สำเร็จ")
      .then((rows) => {
        if (alive) setResigned({ of: registry, rows });
      })
      .catch((err) => {
        if (alive)
          setResigned({ of: registry, error: err instanceof Error ? err.message : "โหลดรายชื่อพ้นสภาพไม่สำเร็จ" });
      });
    return () => {
      alive = false;
    };
  }, [employment, resignedLoad, registry]);

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const deferred = useDeferredValue(query);

  /** กล่องตารางเลื่อนของมันเอง เปลี่ยนหน้าแล้วต้องดึงกลับขึ้นหัวตาราง ไม่ใช่ค้างกลางหน้าใหม่ */
  const tableBox = useRef<HTMLDivElement>(null);

  /** แท็บคนที่ออกจากทะเบียน (พ้นสภาพ หรือ ย้าย) — ชุดคอลัมน์/การเรียง/รายชื่อที่โหลดทีหลัง ใช้ร่วมกัน */
  const exitedTab = employment !== "current";
  /** แท็บพ้นสภาพจริง (ลาออก/ปลด) — Exit Interview · ภาพรวมสาเหตุ · DataLog อยู่ที่นี่เท่านั้น */
  const resignedTab = employment === "resigned";

  /* Exit Interview — สิทธิ์ย่อย `exit-interview` (ค่าเริ่มต้นไม่เห็น) · สถานะโหลดเฉพาะตอนเปิดแท็บพ้นสภาพ */
  const canInterview = useCanSee(EXIT_INTERVIEW_MENU);
  const { summary: interviewSummary } = useInterviewSummary(resignedTab && canInterview, registry);
  const [interviewOf, setInterviewOf] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<InterviewStage[]>([]);
  /** คอลัมน์/ปุ่ม Exit Interview — แท็บพ้นสภาพ + มีสิทธิ์ (ชุดคอลัมน์ตามแท็บ ไม่ใช่ตามคน) */
  const interviewCol = resignedTab && canInterview;
  const interviewCtx = useMemo(() => ({ summary: interviewSummary, open: setInterviewOf }), [interviewSummary]);
  /**
   * การเรียงที่ใช้จริง — ยังไม่เลือกคอลัมน์ในแท็บพ้นสภาพ = วันที่พ้นสภาพล่าสุดขึ้นก่อนเสมอ (Bew 10 พ.ย. 2569)
   * · หัวคอลัมน์ “วันที่พ้นสภาพ” จึงขึ้นลูกศรตามด้วย
   */
  const activeSort: SortKey | null = sortKey ?? (exitedTab ? "exitDate" : null);
  const activeDir: SortDir = sortKey ? sortDir : "desc";
  /** ชุดคอลัมน์ของแท็บที่เปิดอยู่ — หัวตาราง เมนูบนแถบ (จอแคบ) และช่องในแถวอ่านจากตัวนี้ตัวเดียว */
  const columns = useMemo(
    () =>
      COLUMNS.filter((c) =>
        exitedTab
          ? !RESIGNED_HIDDEN.has(c.sort) && !(employment === "moved" && MOVED_HIDDEN.has(c.sort))
          : !RESIGNED_ONLY.has(c.sort),
      ),
    [exitedTab, employment],
  );

  /** รายชื่อในขอบเขตสาขา + สถานะการจ้างที่เลือกอยู่ — ฐานของทั้งไทล์และตัวเลือกตัวกรอง */
  const siteScope = useMemo(
    () =>
      drivers.filter((d) => {
        if (siteTabOf(d.siteKey) !== site) return false;
        return employmentOf(d) === employment;
      }),
    [drivers, site, employment],
  );
  const mixerCount = useMemo(() => mixerCounts(siteScope, mixerOf), [siteScope]);
  const scope = useMemo(
    () => (mixer === "all" ? siteScope : siteScope.filter((d) => mixerOf(d) === mixer)),
    [siteScope, mixer],
  );

  const counts = useMemo(() => {
    let probation = 0;
    let withoutVehicle = 0;
    /* แจ้งเตือนเอกสาร — นับเป็นคน (คนเดียวหมดทั้งสองใบนับหนึ่ง) + แยกต่อใบต่อสถานะให้ชิปในแถบเตือน */
    let renewal = 0;
    let renewalExpired = 0;
    const docCount: Partial<Record<DocTag, number>> = {};

    for (const d of scope) {
      if (isProbation(d.tenureMonths)) probation++;
      if (!d.vehicleRef) withoutVehicle++;
      const states = DOC_KINDS.map(({ kind }) => docState(d, kind));
      if (states.some(needsRenewal)) renewal++;
      if (states.includes("expired")) renewalExpired++;
      for (const tag of docTags(d)) docCount[tag] = (docCount[tag] ?? 0) + 1;
    }

    return { total: scope.length, probation, withoutVehicle, renewal, renewalExpired, docCount };
  }, [scope]);

  /** ยอดบนแท็บ ทำงาน | พ้นสภาพ ของสาขาที่เลือก — พ้นสภาพ = ยอดทั้งทะเบียนของสาขา − คนที่ยังทำงาน (ก่อนโหลดรายชื่อ) */
  const employmentTotals = useMemo(() => {
    const current = registry.drivers.filter((d) => siteTabOf(d.siteKey) === site).length;
    const all =
      site === "other"
        ? (registry.siteTotals.other ?? 0)
        : SITE_TAB_KEYS[site].reduce((sum, key) => sum + (registry.siteTotals[key] ?? 0), 0);
    const loaded = resignedRows?.filter((d) => siteTabOf(d.siteKey) === site);
    /* ก่อนโหลดรายชื่อแยกพ้นสภาพ/ย้ายไม่ได้ — พ้นสภาพแสดงยอดรวมไปก่อน แท็บย้ายยังไม่มีตัวเลข */
    if (!loaded) return { current, resigned: Math.max(0, all - current), moved: undefined };
    const moved = loaded.filter((d) => employmentOf(d) === "moved").length;
    return { current, resigned: loaded.length - moved, moved };
  }, [registry, site, resignedRows]);

  /** ออกเดือนนี้ / เดือนก่อน (แท็บพ้นสภาพ) */
  const exitPace = useMemo(() => {
    const now = new Date();
    const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const thisKey = key(now);
    const lastKey = key(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    let thisMonth = 0;
    let lastMonth = 0;
    for (const d of scope) {
      const m = exitMonthKey(d);
      if (m === thisKey) thisMonth++;
      else if (m === lastKey) lastMonth++;
    }
    return { thisKey, thisMonth, lastMonth };
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
    const licenseType = new Map<string, number>();
    const exitMonth = new Map<string, number>();
    const exitReason = new Map<string, { label: string; count: number }>();
    const exitCategory = new Map<string, number>();
    const exitControl = new Map<string, number>();
    const exitOwner = new Map<string, number>();
    let hasVehicle = 0;
    let noVehicle = 0;
    let probation = 0;
    let normalTenure = 0;

    for (const d of scope) {
      const bump = (map: Map<string, number>, key: string) =>
        map.set(key, (map.get(key) ?? 0) + 1);

      bump(plant, d.plant || NONE);
      bump(fleet, d.customer || NONE);
      bump(owner, d.ownerTypeKey ?? NONE);
      bump(licenseType, d.licenseType || NONE);
      bump(status, d.work?.latestStatus || NONE);
      if (!d.active) {
        bump(exitMonth, exitMonthKey(d) || NONE);
        const r = d.resignation;
        const code = r?.reasonCode || NONE;
        exitReason.set(code, { label: r?.reasonLabel ?? "", count: (exitReason.get(code)?.count ?? 0) + 1 });
        bump(exitCategory, r?.categoryLabel || NONE);
        bump(exitControl, r?.controllable || NONE);
        bump(exitOwner, exitOwnerOf(d) || NONE);
      }

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
          return thaiCompare(a[0], b[0]);
        })
        .map(([value, count]) => ({
          value,
          label: value === NONE ? noneLabel : value,
          count,
        }));

    const docCount = new Map<string, number>();
    for (const d of scope) for (const tag of docTags(d)) docCount.set(tag, (docCount.get(tag) ?? 0) + 1);
    const docOrder: [DocTag, string][] = [
      ["license:expired", "ใบขับขี่ หมดอายุแล้ว"],
      ["license:soon", `ใบขับขี่ ใกล้หมด (≤ ${LICENSE_WARN_DAYS} วัน)`],
      ["idCard:expired", "บัตรประชาชน หมดอายุแล้ว"],
      ["idCard:soon", `บัตรประชาชน ใกล้หมด (≤ ${LICENSE_WARN_DAYS} วัน)`],
      ["ok", "ปกติทั้งสองใบ"],
      ["license:unknown", "ไม่มีวันหมดอายุใบขับขี่"],
      ["idCard:unknown", "ไม่มีวันหมดอายุบัตรประชาชน"],
    ];

    return {
      /* รหัสเรียงแบบตัวเลข (A2 ก่อน A10) · ไม่มีรหัสไปท้ายสุด */
      exitReason: [...exitReason]
        .sort((a, b) => {
          if (a[0] === NONE) return 1;
          if (b[0] === NONE) return -1;
          return a[0].localeCompare(b[0], "en", { numeric: true });
        })
        .map(([value, o]) => ({
          value,
          label: value === NONE ? "ไม่ระบุรหัส" : `${value} · ${o.label}`,
          count: o.count,
        })) as ColumnFilterOption[],
      exitCategory: byLabel(exitCategory, "ไม่ระบุหมวด"),
      /* ลำดับตาม master (ควบคุมได้ → บางส่วน → ไม่ได้ → ไม่นับ) ไม่ใช่ตามตัวอักษร */
      exitControl: [
        ...CONTROLLABLE_OPTIONS.filter((o) => exitControl.get(o.value)).map((o) => ({
          value: o.value,
          label: o.label,
          count: exitControl.get(o.value),
        })),
        ...(exitControl.get(NONE) ? [{ value: NONE, label: "ไม่ระบุ", count: exitControl.get(NONE) }] : []),
      ] as ColumnFilterOption[],
      exitOwner: byLabel(exitOwner, "ไม่มีเจ้าของ"),
      /* เดือนล่าสุดขึ้นก่อน · ไม่มีวันที่ไปท้ายสุด */
      exitMonth: [...exitMonth]
        .sort((a, b) => {
          if (a[0] === NONE) return 1;
          if (b[0] === NONE) return -1;
          return b[0].localeCompare(a[0]);
        })
        .map(([value, count]) => ({
          value,
          label: value === NONE ? "ไม่ระบุวันที่" : formatExitMonth(value),
          count,
        })) as ColumnFilterOption[],
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
      licenseType: byLabel(licenseType, "ไม่ระบุชนิด"),
      docs: docOrder
        .filter(([key]) => docCount.get(key))
        .map(([key, label]) => ({ value: key, label, count: docCount.get(key) })),
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
      if (!on("exitMonth", exitMonthKey(d) || NONE)) return false;
      if (!on("exitReason", d.resignation?.reasonCode || NONE)) return false;
      if (!on("exitCategory", d.resignation?.categoryLabel || NONE)) return false;
      if (!on("exitControl", d.resignation?.controllable || NONE)) return false;
      if (!on("exitOwner", exitOwnerOf(d) || NONE)) return false;
      if (resignedTab && stageFilter.length) {
        const st = stageOfRow(d, interviewSummary);
        if (!st || !stageFilter.includes(st)) return false;
      }
      if (!on("vehicle", d.vehicleRef ? "has" : "none")) return false;
      if (!on("plant", d.plant || NONE)) return false;
      if (!on("fleet", d.customer || NONE)) return false;
      if (!on("owner", d.ownerTypeKey ?? NONE)) return false;
      if (!on("status", d.work?.latestStatus || NONE)) return false;
      if (filters.docs.length && !docTags(d).some((t) => filters.docs.includes(t))) return false;
      if (!on("licenseType", d.licenseType || NONE)) return false;
      if (!on("tenure", isProbation(d.tenureMonths) ? "under4" : "normal")) return false;

      if (!q) return true;
      return (
        norm(d.name).includes(q) ||
        norm(d.nickname).includes(q) ||
        norm(d.drivercode).includes(q) ||
        norm(d.phone).includes(q) ||
        norm(d.vehicleRef).includes(q) ||
        norm(d.vehicle?.code ?? "").includes(q) ||
        norm(d.vehicle?.plateNo ?? "").includes(q) ||
        norm(d.customer ?? "").includes(q) ||
        norm(d.plant ?? "").includes(q)
      );
    });

    /* ค่าตั้งต้น = เข้าทะเบียนล่าสุดขึ้นก่อน · คนที่ไม่มีเวลาเข้า (ก่อน 3 พ.ย. 2569) เรียงวันเริ่มงานใหม่ → เก่า */
    if (!activeSort)
      return [...rows].sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) ||
          b.startDateISO.localeCompare(a.startDateISO) ||
          b.drivercode.localeCompare(a.drivercode),
      );

    const mul = activeDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => compare(a, b, activeSort) * mul);
  }, [scope, deferred, filters, activeSort, activeDir, resignedTab, stageFilter, interviewSummary]);

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
  const resetKey = `${site}|${mixer}|${employment}|${deferred}|${JSON.stringify(filters)}|${sortKey}|${sortDir}|${stageFilter.join()}`;
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
    setStageFilter([]);
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
    if (next === "current") {
      setFilters((prev) => ({ ...prev, exitMonth: [], exitReason: [], exitCategory: [], exitControl: [], exitOwner: [] }));
      if (sortKey && RESIGNED_ONLY.has(sortKey)) setSortKey(null);
      return;
    }

    setFilters((prev) => ({
      ...prev,
      vehicle: [],
      fleet: [],
      plant: [],
      ...(next === "moved" ? { exitCategory: [], exitControl: [], exitOwner: [] } : {}),
    }));
    /* เข้าแท็บพ้นสภาพ = กลับไปเรียงวันที่พ้นสภาพล่าสุดก่อนทุกครั้ง */
    setSortKey(null);
  }

  /** ไทล์ตัวเลขเป็นทางลัดไปติ๊กตัวกรองของคอลัมน์ — กดซ้ำเพื่อเลิกกรอง */
  function toggleTile(key: FilterKey, value: string) {
    setFilter(key, filters[key].includes(value) ? [] : [value]);
  }


  /**
   * กรองเฉพาะแท็กต้องต่ออายุ (การ์ด/ชิปแถบเตือน) = เนื้อหน้าเปลี่ยนเป็นปฏิทิน (Bew 21 พ.ย. 2569)
   * · สลับกลับเป็นตารางได้ · ปฏิทินอ่าน `results` ทั้งชุด (ไม่แบ่งหน้า)
   */
  const renewalMode = !exitedTab && filters.docs.length > 0 && filters.docs.every((t) => ALERT_TAGS.includes(t as DocTag));
  const [docView, setDocView] = useState<"calendar" | "table">("calendar");
  const showCalendar = renewalMode && docView === "calendar";
  /** แถบ “กรองอยู่” — โหมดต่ออายุมีตัวกรองเอกสารของตัวเองบนแถบล่างแล้ว ไม่ต้องขึ้นซ้ำเป็น “4 รายการ” */
  const barFilters = renewalMode ? activeFilters.filter((f) => f.key !== "docs") : activeFilters;

  /** เมนูของคอลัมน์หนึ่ง — ไอคอนเดียวคุมทั้งเรียงและกรอง ใช้ซ้ำทั้งหัวตารางและแถบชิป */
  const columnMenu = (column: (typeof COLUMNS)[number], variant: "head" | "chip") => (
    <ColumnMenu
      label={column.label}
      variant={variant}
      align={column.align ?? "start"}
      sort={{
        dir: activeSort === column.sort ? activeDir : null,
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

  /** ส่งออก Excel — เหมือนกันทั้งเมนูเต็ม (แก้ได้) และปุ่มส่งออกอย่างเดียว (อ่านอย่างเดียว) */
  const tabName = employment === "moved" ? "ย้ายไปรถร่วม-พจส" : resignedTab ? "พ้นสภาพ" : "ปัจจุบัน";
  const tabTitle = employment === "moved" ? "ย้ายไปรถร่วม / พจส." : resignedTab ? "พ้นสภาพแล้ว" : "พนักงานปัจจุบัน";
  const exportProps: XlsxExportProps<DriverExportRow> = {
    name: `ทะเบียน-พจส-${tabName}`,
    count: results.length,
    build: async () => ({
      sheet: tabTitle.replace(/\//g, "-"),
      title: `ทะเบียนประวัติ พจส. · ${tabTitle}`,
      filter: [
        `สาขา: ${siteFilterLabel(site)}`,
        mixer !== "all" ? `ตำแหน่ง: ${mixer}` : "",
        deferred.trim() ? `คำค้น: “${deferred.trim()}”` : "",
        ...activeFilters.map(
          ({ key, values }) =>
            `${FILTER_LABELS[key]}: ${values.map((v) => options[key].find((o) => o.value === v)?.label ?? v).join(", ")}`,
        ),
      ]
        .filter(Boolean)
        .join(" · "),
      total: scope.length,
      ...(await driverSheet(results, exitedTab)),
    }),
  };

  const moved = {
    transfer: scope.filter((d) => d.resignation?.kind === "transfer").length,
    pjs: scope.filter((d) => d.resignation?.kind === "pjs").length,
  };
  const interview = resignedTab && canInterview && interviewSummary ? interviewCounts(scope, interviewSummary) : null;
  const toggleStage = (stages: InterviewStage[]) =>
    setStageFilter((cur) => (cur.join() === stages.join() ? [] : stages));

  return (
    <ExitInterviewContext.Provider value={interviewCtx}>
    <div className="flex flex-col gap-4">
      {interviewOf ? <ExitInterviewDrawer drivercode={interviewOf} onClose={() => setInterviewOf(null)} /> : null}
      

      <SummaryPanel label="สรุปทะเบียน">
        <StatStrip>
          {employment === "moved" ? (
            <>
              <RegistryStat label="ย้ายออกจากทะเบียน" value={counts.total} sub={`สาขา${siteFilterLabel(site)} · ไม่นับเป็นการลาออก`} />
              <RegistryStat
                label="ย้ายไปรถร่วม"
                value={moved.transfer}
                share={moved.transfer / (counts.total || 1)}
              />
              <RegistryStat label="ย้ายไปพจส." value={moved.pjs} share={moved.pjs / (counts.total || 1)} />
              <RegistryStat
                label={`ย้ายเดือนนี้ (${THAI_MONTHS_SHORT[new Date().getMonth()]})`}
                value={exitPace.thisMonth}
                sub={`เดือนก่อน ${exitPace.lastMonth.toLocaleString("th-TH")} คน`}
                active={filters.exitMonth.length === 1 && filters.exitMonth[0] === exitPace.thisKey}
                onClick={() => toggleTile("exitMonth", exitPace.thisKey)}
              />
            </>
          ) : resignedTab ? (
            <>
              <RegistryStat label="พ้นสภาพแล้ว" value={counts.total} sub={`สาขา${siteFilterLabel(site)}`} />
              <RegistryStat
                label={`ออกเดือนนี้ (${THAI_MONTHS_SHORT[new Date().getMonth()]})`}
                value={exitPace.thisMonth}
                sub={`เดือนก่อน ${exitPace.lastMonth.toLocaleString("th-TH")} คน`}
                active={filters.exitMonth.length === 1 && filters.exitMonth[0] === exitPace.thisKey}
                onClick={() => toggleTile("exitMonth", exitPace.thisKey)}
              />
              <RegistryStat
                label={`ออกภายใน ${PROBATION_MONTHS} เดือนแรก`}
                value={counts.probation}
                share={counts.probation / (counts.total || 1)}
                title="อายุงานตอนออกน้อยกว่าช่วงทดลองงาน"
                active={filters.tenure.includes("under4")}
                onClick={() => toggleTile("tenure", "under4")}
              />
              {interview ? (
                <>
                  <RegistryStat
                    label="รอ Exit Interview"
                    value={interview.pending}
                    tone="sla"
                    sub={interview.flagged ? `แจ้ง HR Chief ${interview.flagged} คน` : "ยังไม่สัมภาษณ์ Wave 1"}
                    active={stageFilter.join() === "pending"}
                    onClick={() => toggleStage(["pending"])}
                  />
                  <RegistryStat
                    label="ถึงรอบ Wave 2"
                    value={interview.wave2}
                    sub="วันที่ 30–45 หลังออก (รวมเลยกำหนด)"
                    active={stageFilter.join() === "wave2_due,wave2_late"}
                    onClick={() => toggleStage(["wave2_due", "wave2_late"])}
                  />
                  <RegistryStat
                    label="Coverage Rate"
                    value={Math.round(interview.coverage * 100)}
                    unit="%"
                    tone={interview.coverage >= 0.7 ? "primary" : "alert"}
                    share={interview.coverage}
                    target={0.7}
                    sub={`สัมภาษณ์ได้ ${interview.interviewed}/${interview.total} · เป้า ≥ 70%`}
                    title="สัมภาษณ์ได้ (ไม่ใช่ N1/N2) ÷ คนพ้นสภาพแบบลาออก/ปลดทั้งหมดในขอบเขตนี้"
                  />
                </>
              ) : null}
            </>
          ) : (
            <>
              <RegistryStat label="ปฏิบัติงานอยู่" value={counts.total} sub={`สาขา${siteFilterLabel(site)}`} />
              <RegistryStat
                label={`อายุงานน้อยกว่า ${PROBATION_MONTHS} เดือน`}
                value={counts.probation}
                share={counts.probation / (counts.total || 1)}
                title="กลุ่มที่ต้องตามดูใกล้ ๆ"
                active={filters.tenure.includes("under4")}
                onClick={() => toggleTile("tenure", "under4")}
              />
              <RegistryStat
                label="เอกสารต้องต่ออายุ"
                value={counts.renewal}
                tone={counts.renewal ? "alert" : "ink"}
                sub={
                  counts.renewal
                    ? `หมดแล้ว ${counts.renewalExpired} · ใกล้หมด ${counts.renewal - counts.renewalExpired}`
                    : "ใบขับขี่ · บัตรประชาชน"
                }
                title={`ใบขับขี่หรือบัตรประชาชน หมดอายุแล้ว / เหลือไม่เกิน ${LICENSE_WARN_DAYS} วัน`}
                active={renewalMode}
                onClick={() => setFilter("docs", renewalMode ? [] : ALERT_TAGS)}
              />
              <RegistryStat
                label="ยังไม่ประจำรถ"
                value={counts.withoutVehicle}
                share={counts.withoutVehicle / (counts.total || 1)}
                title="ยังไม่ได้ประจำคันไหน"
                active={filters.vehicle.includes("none")}
                onClick={() => toggleTile("vehicle", "none")}
              />
              <OwnerSplitStat options={options.owner} />
            </>
          )}
        </StatStrip>

        {resignedTab && !loadingResigned && scope.length ? (
          <ExitInsights
            rows={scope}
            months={filters.exitMonth}
            reasons={filters.exitReason}
            onMonth={(key) => toggleTile("exitMonth", key)}
            onReason={(code) => toggleTile("exitReason", code)}
          />
        ) : null}

        <SummaryToolbar className="lg:flex-wrap">
          <SearchField
            value={query}
            onChange={setQuery}
            label="ค้นหาในทะเบียนประวัติ"
            placeholder={exitedTab ? "ค้นหาชื่อ รหัส เบอร์โทร…" : "ค้นหาชื่อ รหัส ทะเบียน แพล้นท์…"}
            tone="filled"
            className="w-full lg:max-w-80 lg:flex-1"
          />

          {/* แท็บสถานะการจ้าง + สาขา (+ Mixer ของลาดกระบัง) ต่อจากช่องค้นหา (Bew 25 พ.ย. 2569) */}
          <SegmentedControl
            label="สถานะการจ้าง"
            value={employment}
            onChange={changeEmployment}
            options={[
              { value: "current", label: "ทำงาน", count: employmentTotals.current },
              { value: "resigned", label: "พ้นสภาพ", count: employmentTotals.resigned },
              { value: "moved", label: "ย้ายไปรถร่วม / พจส.", count: employmentTotals.moved },
            ]}
            className="w-full sm:w-auto"
          />
          <SiteTabs value={site} tabs={siteTabs} onChange={(v) => setSite(v)} />
          {site === "latkrabang" ? (
            <MixerTabs value={mixerPick} counts={mixerCount} onChange={setMixerPick} className="w-full sm:w-auto" />
          ) : null}

          <div className="flex items-center gap-2 lg:ml-auto">
            {/* ปุ่ม Excel = ส่งออกอย่างเดียว — เอานำเข้า/Sync จาก Excel ออกไปก่อน (Bew 10 พ.ย. 2569)
                · กล่อง `DriverPasteDialog` / `DriverExcelSyncDialog` ยังเก็บไว้ ใส่กลับได้ */}
            <XlsxExportButton {...exportProps} />
            {resignedTab && canInterview ? <DataLogExportButton rows={results} filter={`สาขา: ${siteFilterLabel(site)}`} /> : null}
            {canEdit ? (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="btn-pri flex cursor-pointer items-center gap-1.5 px-3.5 py-2 text-13 font-medium"
              >
                <Plus size={16} strokeWidth={2.2} aria-hidden />
                เพิ่มพนักงาน
              </button>
            ) : null}
            {adding ? <DriverAddDialog drivers={drivers} onClose={() => setAdding(false)} /> : null}
          </div>

          {/* จอแคบไม่มีหัวตารางให้กด — ยกเมนูของทุกคอลัมน์มาไว้บนแถบแทน
              ใช้คอมโพเนนต์และ state ตัวเดียวกัน ไม่ได้เขียนตรรกะซ้ำ */}
          <div className="flex flex-wrap items-center gap-2 lg:hidden">
            {columns.map((column) => (
              <span key={column.sort}>{columnMenu(column, "chip")}</span>
            ))}
          </div>
        </SummaryToolbar>

        {/* แถบผลลัพธ์ — ตัวกรองที่ใช้อยู่ (ซ้าย) + ยอดที่เหลือ (ขวา)
            · โหมดเอกสารต้องต่ออายุ: ชิปเอกสาร + สลับปฏิทิน/ตาราง (Bew 21 พ.ย. 2569) */}
        <SummaryStrip className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
          {renewalMode ? (
            <RenewalFilter tags={filters.docs as DocTag[]} count={counts.docCount} onChange={(tags) => setFilter("docs", tags)} />
          ) : null}
          {barFilters.length > 0 ? (
            <ActiveFilterBar
              active={barFilters}
              options={options}
              onClear={(key) => setFilter(key, [])}
              onClearAll={clearFilters}
            />
          ) : null}

          <div className="ml-auto flex items-center gap-4">
            {renewalMode ? (
              <>
                <SegmentedControl
                  label="มุมมองเอกสารต้องต่ออายุ"
                  value={docView}
                  onChange={setDocView}
                  options={[
                    { value: "calendar", label: "ปฏิทิน" },
                    { value: "table", label: "ตาราง" },
                  ]}
                  className="[&_button]:min-h-7 [&_button]:px-3"
                />
                <button
                  type="button"
                  onClick={() => setFilter("docs", [])}
                  className="flex cursor-pointer items-center gap-1 text-12-5 text-mut transition-colors hover:text-ink"
                >
                  <X size={14} strokeWidth={2} aria-hidden />
                  ปิดมุมมองนี้
                </button>
              </>
            ) : null}
            <p role="status" aria-live="polite" className="text-12-5 text-mut">
              <span key={results.length} className="inline-block animate-fade-in">
                {filtering ? (
                  <>
                    พบ{" "}
                    <span className="font-semibold text-ink tabular-nums">{results.length.toLocaleString("th-TH")}</span>{" "}
                    จาก {counts.total.toLocaleString("th-TH")} คน
                  </>
                ) : (
                  <>
                    ทั้งหมด{" "}
                    <span className="font-semibold text-ink tabular-nums">{results.length.toLocaleString("th-TH")}</span> คน
                  </>
                )}
              </span>
            </p>
          </div>
        </SummaryStrip>

      {loadingResigned ? (
        <SummaryBody pad>
          <MascotLoader text="กำลังโหลดรายชื่อพ้นสภาพ" className="py-10" />
        </SummaryBody>
      ) : exitedTab && resignedLoad?.error ? (
        <SummaryBody pad>
          <div className="flex flex-col items-center gap-2.5 py-10 text-center">
            <p className="text-sm font-semibold text-sla">โหลดรายชื่อพ้นสภาพไม่สำเร็จ</p>
            <p className="max-w-[46ch] text-12-5 text-mut text-pretty">{resignedLoad.error}</p>
            <button type="button" onClick={() => setResigned(null)} className="btn-sec cursor-pointer px-4 py-2 text-12-5">
              ลองอีกครั้ง
            </button>
          </div>
        </SummaryBody>
      ) : results.length === 0 ? (
        <SummaryBody pad>
          <EmptyResult query={query.trim()} onClear={clearFilters} />
        </SummaryBody>
      ) : showCalendar ? (
        <DocRenewalCalendar drivers={results} tags={filters.docs} />
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
          {desktop ? (
          <div
            ref={tableBox}
            className="relative hidden max-h-[calc(100dvh-10.5rem)] overflow-auto border-t border-line bg-base-100 lg:block"
          >
            <table
              /* แท็บพ้นสภาพเหลือ 5 คอลัมน์ ถ้าคงความกว้างขั้นต่ำเดิมไว้จะเหลือที่ว่างยาวท้ายตาราง */
              className={`sheet-table w-full border-collapse text-13 ${
                exitedTab ? "min-w-[1800px]" : "min-w-[1350px]"
              }`}
            >
              <thead>
                <tr>
                  {columns.map((column, i) => (
                    <Fragment key={column.sort}>
                      <Head
                        column={column}
                        sorted={activeSort === column.sort ? activeDir : null}
                        menu={columnMenu(column, "head")}
                        /* คอลัมน์แรก (คนขับ) ยึดทั้งบนทั้งซ้าย ต้องซ้อนสูงกว่าหัวอื่นที่เลื่อนผ่าน */
                        stickyLeft={i === 0}
                      />
                      {/* สถานะ Exit Interview ต่อจากสาเหตุ — สิทธิ์ `exit-interview` · กรองด้วยการ์ดสถานะด้านบน */}
                      {column.sort === "exitOwner" && interviewCol ? (
                        <th className="sticky top-0 z-10 w-[150px] border-b border-line-strong bg-base-200 px-3 py-2.5 text-left text-12 font-semibold whitespace-nowrap text-mut">
                          Exit Interview
                        </th>
                      ) : null}
                    </Fragment>
                  ))}
                  {/* ปุ่มของแถวรวมที่เดียว ยึดขอบขวาตอนเลื่อนแนวนอน กดได้เสมอไม่ต้องเลื่อนหา (25 พ.ย. 2569) */}
                  <th className="sticky top-0 right-0 z-20 w-px border-b border-line-strong bg-base-200 px-3 py-2.5 text-center text-12 font-semibold whitespace-nowrap text-mut before:absolute before:inset-y-0 before:left-0 before:w-px before:bg-line">
                    จัดการ
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
                  <Row key={d.drivercode} driver={d} index={i} hideVehicle={exitedTab} interview={interviewCol} />
                ))}
              </tbody>
            </table>
          </div>
          ) : (
          /* ── จอ <lg: แถวละคน (แถวแบนคั่นเส้น ไม่ใช่การ์ด) ตารางแนวนอนใช้บนจอแคบไม่ได้ ── */
          <SummaryBody className="lg:hidden">
          <ul key={`${current}-${results.length}`} className="divide-y divide-line">
            {pageRows.map((d, i) => (
              <li key={d.drivercode}>
                <DriverCard driver={d} index={i} hideVehicle={exitedTab} interview={interviewCol} />
              </li>
            ))}
          </ul>
          </SummaryBody>
          )}

          <SummaryFooter>
          <PageBar
            from={sliceFrom + 1}
            to={sliceFrom + pageRows.length}
            total={results.length}
            current={current}
            count={pageCount}
            onGo={goToPage}
          />
          </SummaryFooter>
        </>
      )}
      </SummaryPanel>
    </div>
    </ExitInterviewContext.Provider>
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

const byText = (a: string, b: string) => thaiCompare(a || LAST, b || LAST);

/** ป้าย “ใหม่” — เข้าทะเบียนไม่เกิน `NEW_DRIVER_HOURS` ชั่วโมง (คิดที่เซิร์ฟเวอร์ `isNew`) */
function NewBadge() {
  return (
    <span
      title={`เพิ่มเข้าทะเบียนภายใน ${NEW_DRIVER_HOURS} ชั่วโมง`}
      className="chip chip-new flex-none gap-1 px-1.5 py-0 text-10-5 font-semibold tracking-wide"
    >
      <span className="relative flex size-1.5" aria-hidden>
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
        <span className="relative inline-flex size-1.5 rounded-full bg-current" />
      </span>
      ใหม่
    </span>
  );
}

function compare(a: DriverListRecord, b: DriverListRecord, key: SortKey): number {
  switch (key) {
    case "exitMonth":
    case "exitDate":
      return byText(a.resignation?.dateISO ?? "", b.resignation?.dateISO ?? "");
    case "exitReason":
      return a.resignation?.reasonCode && b.resignation?.reasonCode
        ? a.resignation.reasonCode.localeCompare(b.resignation.reasonCode, "en", { numeric: true })
        : byText(a.resignation?.reasonCode ?? "", b.resignation?.reasonCode ?? "");
    case "exitCategory":
      return byText(a.resignation?.categoryLabel ?? "", b.resignation?.categoryLabel ?? "");
    case "exitControl":
      return byNumber(CONTROL_RANK[a.resignation?.controllable ?? ""] ?? null, CONTROL_RANK[b.resignation?.controllable ?? ""] ?? null);
    case "exitOwner":
      return byText(exitOwnerOf(a), exitOwnerOf(b));
    case "name":
      return byText(a.name, b.name);
    case "code":
      return byText(a.drivercode, b.drivercode);
    case "phone":
      return byText(primaryPhone(a.phone), primaryPhone(b.phone));
    case "age":
      return byNumber(a.age, b.age);
    case "vehicle":
      return byText(vehicleLead(a), vehicleLead(b));
    case "fleet":
      return byText(a.customer ?? "", b.customer ?? "");
    case "plant":
      return byText(a.plant ?? "", b.plant ?? "");
    case "owner":
      return byText(a.ownerTypeKey ?? "", b.ownerTypeKey ?? "");
    case "tenure":
      return byNumber(a.tenureMonths, b.tenureMonths);
    case "licenseType":
      return byText(a.licenseType, b.licenseType);
    case "license":
      return byNumber(soonestDays(a), soonestDays(b));
    case "status":
      return byText(a.work?.latestStatus ?? "", b.work?.latestStatus ?? "");
  }
}

/* ------------------------------------------------------------------ แถว */

function Row({
  driver,
  index,
  hideVehicle,
  interview,
}: {
  driver: DriverListRecord;
  index: number;
  /**
   * แท็บ “พ้นสภาพแล้ว” — ตัดช่องรถ/ลูกค้า/แพล้นท์ออก (ดู `RESIGNED_HIDDEN`)
   * และเพิ่มช่องปุ่มทำเอกสารพ้นสภาพ
   */
  hideVehicle: boolean;
  /** คอลัมน์สถานะ Exit Interview (แท็บพ้นสภาพ + สิทธิ์) */
  interview: boolean;
}) {
  const canEdit = useCanSee("registry-profile");
  const href = driverHref(driver);

  /**
   * แถวของคนที่พ้นสภาพแล้วเป็น **โทนแดงทั้งแถว** — รูป รหัส ปุ่มตาท้ายแถว
   * ตอนชี้ทุกแถวใช้พื้นเทากลาง `base-200` ทึบเท่ากันทั้งแถว (sticky ด้วย) + แถบสีโทนซ้ายชื่อ 3px (Bew 25 พ.ย. 2569)
   * (ย้ายไปรถร่วม = โทนม่วง `EXIT_TONE.transfer` · 4 พ.ย. 2569 · ย้ายไปพจส. = น้ำเงิน `EXIT_TONE.pjs` · 9 พ.ย. 2569)
   *
   * ดูจาก `driver.active` ไม่ใช่จากแท็บที่เปิดอยู่ — สีจึงติดไปกับภาพที่แคปส่งต่อ
   * และกับกระดาษที่พิมพ์ออกมา ซึ่งไม่มีแท็บติดไปด้วย · ถ้าวันหนึ่งแท็บ “ปัจจุบัน”
   * มีคนที่เพิ่งกดพ้นสภาพปนอยู่ แถวนั้นก็แดงทันทีโดยไม่ต้องรอสลับแท็บ
   */
  const exit = exitToneOf(driver);

  return (
    /*
      แถวใช้ **เฟดอย่างเดียว ไม่มี transform** โดยตั้งใจ — ในแถวมี `DriverAvatar`
      ที่เปิดกล่องครอปรูปแบบ `position: fixed` ได้ · transform บนแถวจะกลายเป็น
      containing block ของกล่องนั้น (กติกาเดียวกับ `<main>` ของ desk layout)
      หน่วงไล่กันแค่ 12 แถวแรก แถวที่เหลือขึ้นพร้อมกัน ไม่งั้นหน้าละ 500 แถว
      จะค่อย ๆ ไล่ขึ้นเป็นนาที
    */
    /* เข้าหน้ารายละเอียดได้ทางปุ่มรูปตาท้ายแถวเท่านั้น (4 พ.ย. 2569) — คลิกตรงอื่นในแถวไม่พาออกจากหน้า */
    <tr
      style={{ animationDelay: `${Math.min(index, 12) * 22}ms` }}
      className={`group animate-fade-in border-b transition-colors last:border-b-0 ${
        exit ? exit.row : "border-line hover:bg-base-200"
      }`}
    >
      {/* ชื่อยึดขอบซ้ายไว้ตอนตารางเลื่อนแนวนอน — กติกาเดียวกับตารางผู้สมัคร
          พื้นต้องทึบ (ไม่ใช่ `/50` ของแถว) ไม่งั้นตัวหนังสือคอลัมน์ที่เลื่อนผ่านจะทะลุขึ้นมา */}
      <td
        className={`sticky left-0 z-[5] bg-base-100 px-3 py-2 after:absolute after:inset-y-0 after:right-0 after:w-px ${
          exit ? exit.sticky : "after:bg-line group-hover:bg-base-200 group-hover:shadow-[inset_3px_0_0_var(--color-primary)]"
        }`}
      >
        <span className="flex items-center gap-2.5">
          <span className="flex-none">
            <DriverAvatar driver={driver} editable={canEdit} />
          </span>
          <span className="truncate font-medium text-ink">
            {driver.name || "—"} <Nickname value={driver.nickname} />
          </span>
          {driver.isNew ? <NewBadge /> : null}
        </span>
      </td>

      {/* แท็บพ้นสภาพ — วันที่ + ปี-เดือน ต่อจากชื่อ (Bew 10 พ.ย. 2569 · รวมช่อง 25 พ.ย. 2569) */}
      {hideVehicle ? (
        <>
          <td className="px-3 py-2 whitespace-nowrap">
            <ExitDateCell driver={driver} />
          </td>
          <td className="max-w-[220px] px-3 py-2">
            <ExitReasonCell driver={driver} />
          </td>
          <td className="max-w-[150px] truncate px-3 py-2 text-ink" title={driver.resignation?.categoryLabel}>
            {driver.resignation?.categoryLabel || <Dash />}
          </td>
          <td className="px-3 py-2 whitespace-nowrap">
            <ExitControlChip driver={driver} />
          </td>
          <td className="max-w-[150px] truncate px-3 py-2 text-ink" title={exitOwnerOf(driver)}>
            {exitOwnerOf(driver) || <Dash />}
          </td>
          {interview ? (
            <td className="px-3 py-2 whitespace-nowrap">
              <ExitStageCell driver={driver} />
            </td>
          ) : null}
        </>
      ) : null}

      <td className="px-3 py-2 font-mono text-12 tracking-wider whitespace-nowrap">
        <span className={exit ? exit.text : "text-primary"}>{driver.drivercode}</span>
      </td>

      <td className="px-3 py-2 font-mono text-12 tabular-nums whitespace-nowrap text-ink">
        {driver.phone ? primaryPhone(driver.phone) : <Dash />}
      </td>

      <td className="px-3 py-2 tabular-nums whitespace-nowrap text-ink">
        {driver.age == null ? <Dash /> : <>{driver.age} <span className="text-mut">ปี</span></>}
      </td>

      <td className="px-2 py-1.5 whitespace-nowrap">
        <LicenseTypeCell driver={driver} href={href} canEdit={canEdit} />
      </td>

      {hideVehicle ? null : (
        <>
          <td className="px-3 py-2 whitespace-nowrap">
            <VehicleCell driver={driver} />
          </td>

          <td className="max-w-[148px] truncate px-3 py-2" title={driver.customer}>
            {driver.customer || <Dash />}
          </td>

          <td className="max-w-[136px] truncate px-3 py-2" title={driver.plant}>
            {driver.plant || <Dash />}
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

      <td
        className={`sticky right-0 z-[5] bg-base-100 px-2 py-1.5 before:absolute before:inset-y-0 before:left-0 before:w-px ${
          exit ? exit.stickyEnd : "before:bg-line group-hover:bg-base-200"
        }`}
      >
        <RowActions driver={driver} href={href} exit={exit} documents={hideVehicle} />
      </td>
    </tr>
  );
}

/**
 * ชนิดใบขับขี่ — สิทธิ์ “↳ ประวัติ” (`registry-profile`) กดแล้วไปแท็บเอกสารของคนนั้น (ดูรูป/แก้ใบขับขี่)
 * · ไม่มีสิทธิ์ = ข้อความเฉย ๆ (หน้าประวัติของคนไม่มีสิทธิ์ไม่มีแท็บเอกสารอยู่แล้ว)
 */
function LicenseTypeCell({ driver, href, canEdit }: { driver: DriverListRecord; href: string; canEdit: boolean }) {
  const label = driver.licenseType || "ไม่ระบุ";
  if (!canEdit) return <span className="px-1 text-ink">{driver.licenseType || <Dash />}</span>;
  return (
    <Link
      href={`${href}?tab=docs`}
      title="เปิดเอกสารใบขับขี่ · แก้ไข"
      className={`inline-flex h-8 items-center gap-1.5 rounded-selector border border-line px-2 transition-colors hover:border-primary/40 hover:text-primary ${
        driver.licenseType ? "text-ink" : "text-mut"
      }`}
    >
      <IdCard size={14} strokeWidth={1.9} aria-hidden className="text-mut" />
      {label}
      <span className="sr-only">ของ {driver.name}</span>
    </Link>
  );
}

/** โทนของแถวคนที่ไม่ได้ทำงานแล้ว — พ้นสภาพ = แดง · ย้ายไปรถร่วม = ม่วง · ย้ายไปพจส. = น้ำเงิน · ยังทำงาน = `null` */
const EXIT_TONE = {
  resign: {
    row: "border-alert/15 hover:bg-base-200",
    sticky: "after:bg-alert/20 group-hover:bg-base-200 group-hover:shadow-[inset_3px_0_0_var(--color-alert)]",
    stickyEnd: "before:bg-alert/20 group-hover:bg-base-200",
    text: "text-alert",
    hoverText: "group-hover:text-alert",
    btn: "hover:bg-base-100 hover:text-alert",
    cardHover: "hover:bg-base-200",
  },
  transfer: {
    row: "border-transfer/15 hover:bg-base-200",
    sticky: "after:bg-transfer/20 group-hover:bg-base-200 group-hover:shadow-[inset_3px_0_0_var(--color-transfer)]",
    stickyEnd: "before:bg-transfer/20 group-hover:bg-base-200",
    text: "text-transfer",
    hoverText: "group-hover:text-transfer",
    btn: "hover:bg-base-100 hover:text-transfer",
    cardHover: "hover:bg-base-200",
  },
  pjs: {
    row: "border-pjs/15 hover:bg-base-200",
    sticky: "after:bg-pjs/20 group-hover:bg-base-200 group-hover:shadow-[inset_3px_0_0_var(--color-pjs)]",
    stickyEnd: "before:bg-pjs/20 group-hover:bg-base-200",
    text: "text-pjs",
    hoverText: "group-hover:text-pjs",
    btn: "hover:bg-base-100 hover:text-pjs",
    cardHover: "hover:bg-base-200",
  },
} as const;

function exitToneOf(driver: DriverListRecord) {
  if (driver.active) return null;
  return EXIT_TONE[driver.resignation?.kind ?? "resign"];
}

function driverHref(driver: DriverListRecord) {
  return `/recruitment/admin/drivers/${encodeURIComponent(driver.drivercode)}`;
}

/**
 * คอลัมน์ “จัดการ” — ปุ่มไอคอนของแถวรวมเป็นกลุ่มเดียว ขนาดเท่ากัน กดง่าย (25 พ.ย. 2569)
 *
 * - Exit Interview — แท็บพ้นสภาพ + สิทธิ์ `exit-interview` · จุดเหลือง = ถึงรอบต้องโทร · จุดแดง = เลยกำหนด
 * - ทำเอกสาร (ใบลาออก + แบบสอบถาม) — แท็บพ้นสภาพ
 * - ดูรายละเอียด — ทุกคน ทุกแท็บ (ทางเข้าหน้ารายละเอียดทางเดียวของแถว · Bew 6 พ.ย. 2569)
 *   ไม่มีสิทธิ์ `registry-profile` = หน้าประวัติอ่านอย่างเดียว ไม่เห็นแท็บเอกสาร (กันที่หน้านั้นเอง)
 */
function RowActions({
  driver,
  href,
  exit,
  documents,
}: {
  driver: DriverListRecord;
  href: string;
  exit: ReturnType<typeof exitToneOf>;
  documents: boolean;
}) {
  const btn = `inline-grid size-8 flex-none cursor-pointer place-items-center rounded-selector text-mut transition-colors ${
    exit ? exit.btn : "hover:bg-soft hover:text-primary"
  }`;
  return (
    <span className="flex items-center justify-center gap-0.5">
      {documents ? (
        <>
          <ExitInterviewAction driver={driver} className={btn} />
          <ResignDocumentsButton driver={driver} className={btn} />
        </>
      ) : null}
      <Link href={href} aria-label={`ดูรายละเอียด ${driver.name || ""}`.trim()} title="ดูรายละเอียด" className={btn}>
        <Eye size={16} strokeWidth={1.8} aria-hidden />
      </Link>
    </span>
  );
}

function ExitControlChip({ driver }: { driver: DriverListRecord }) {
  const v = driver.resignation?.controllable;
  if (!v) return <Dash />;
  return <span className={`chip px-2 py-0.5 text-11-5 ${CONTROLLABLE_CHIP[v]}`}>{controllableLabel(v)}</span>;
}

/** วันที่พ้นสภาพ + ปี-เดือน (คีย์ตัวกรองรายเดือน) บรรทัดรอง */
function ExitDateCell({ driver }: { driver: DriverListRecord }) {
  const date = formatThaiDate(driver.resignation?.dateISO ?? "");
  if (!date) return <Dash />;
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-ink">{date}</span>
      <span className="font-mono text-11 tabular-nums text-mut">{formatExitMonth(exitMonthKey(driver))}</span>
    </span>
  );
}

function DriverCard({
  driver,
  index,
  hideVehicle,
  interview,
}: {
  driver: DriverListRecord;
  index: number;
  /** ซ่อนชุดเดียวกับตาราง — การ์ดจอแคบคือตารางเดียวกันในอีกรูปแบบ */
  hideVehicle: boolean;
  interview: boolean;
}) {
  const canEdit = useCanSee("registry-profile");
  /* กติกาเดียวกับ `Row` — คนที่พ้นสภาพแล้วอ่านออกจากสีได้ก่อนอ่านตัวหนังสือ */
  const exit = exitToneOf(driver);

  return (
    <div
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
      className={`group flex animate-fade-in flex-col gap-2.5 px-(--sheet-px) py-3.5 transition-colors ${
        exit ? exit.cardHover : "hover:bg-base-200"
      }`}
    >
      <div className="flex items-start gap-3">
        <DriverAvatar driver={driver} size="md" editable={canEdit} />
        <div className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-13-5 font-medium text-pretty">
            <span>
              {driver.name || "—"} <Nickname value={driver.nickname} />
            </span>
            {driver.isNew ? <NewBadge /> : null}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-11-5 text-mut">
            <span className={exit ? exit.text : "text-primary"}>{driver.drivercode}</span>
            {driver.phone ? <span>{primaryPhone(driver.phone)}</span> : null}
          </span>
        </div>
        <StatusCell driver={driver} />
        <RowActions driver={driver} href={driverHref(driver)} exit={exit} documents={hideVehicle} />
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-12">
        {hideVehicle ? (
          <>
            <CardField label="พ้นสภาพ">
              <ExitDateCell driver={driver} />
            </CardField>
            <CardField label="รหัสสาเหตุ">
              <ExitReasonCell driver={driver} />
            </CardField>
            <CardField label="หมวดสาเหตุ">
              <span className="truncate text-ink">{driver.resignation?.categoryLabel || "—"}</span>
            </CardField>
            <CardField label="ควบคุมได้?">
              <ExitControlChip driver={driver} />
            </CardField>
            <CardField label="เจ้าของการแก้ไข">
              <span className="truncate text-ink">{exitOwnerOf(driver) || "—"}</span>
            </CardField>
            {interview ? (
              <CardField label="Exit Interview">
                <ExitStageCell driver={driver} />
              </CardField>
            ) : null}
          </>
        ) : (
          <>
            <CardField label="รถที่ขับ">
              <VehicleCell driver={driver} />
            </CardField>
            <CardField label="ลูกค้า">
              <span className="truncate text-ink">{driver.customer || "—"}</span>
            </CardField>
            <CardField label="แพล้นท์">
              <span className="truncate text-ink">{driver.plant || "—"}</span>
            </CardField>
          </>
        )}
        <CardField label="อายุงาน">
          <TenureCell driver={driver} />
        </CardField>
        <CardField label="อายุ">{driver.age == null ? <Dash /> : `${driver.age} ปี`}</CardField>
        <CardField label="ชนิดใบขับขี่">
          <LicenseTypeCell driver={driver} href={driverHref(driver)} canEdit={canEdit} />
        </CardField>
        <CardField label="เอกสารหมดอายุ">
          <LicenseCell driver={driver} />
        </CardField>
      </div>
    </div>
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
function VehicleCell({ driver }: { driver: DriverListRecord }) {
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

function TenureCell({ driver }: { driver: DriverListRecord }) {
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

/**
 * เอกสารหมดอายุ — สองบรรทัด ใบขับขี่ (รถ) + บัตรประชาชน (บัตร) · แยกกันด้วยรูปไอคอน ไม่ใช่สีอย่างเดียว
 * ใบที่ปกติขึ้นแค่วันที่สีจาง · ใกล้หมด/หมดแล้ว ขึ้นระยะเวลาสีเหลือง/แดงต่อท้าย (Bew 21 พ.ย. 2569)
 */
function LicenseCell({ driver }: { driver: DriverListRecord }) {
  return (
    <span className="flex flex-col gap-1">
      {DOC_KINDS.map(({ kind, label, Icon }) => {
        const days = docDays(driver, kind);
        const state = licenseState(days);
        const iso = kind === "license" ? driver.licenseExpiryISO : driver.idCardExpiryISO;
        return (
          <span
            key={kind}
            title={`${label}: ${state === "unknown" ? "ไม่มีวันหมดอายุ" : `${formatThaiDate(iso)} · ${formatLicenseGap(days)}`}`}
            className="flex min-w-0 items-center gap-1.5 leading-tight"
          >
            <Icon
              size={13}
              strokeWidth={1.8}
              aria-label={label}
              className={`flex-none ${state === "expired" ? "text-alert" : state === "soon" ? "text-sla" : "text-mut/70"}`}
            />
            {state === "unknown" ? (
              <span className="text-11 text-mut/70">—</span>
            ) : (
              <>
                <span
                  className={`font-mono text-12 tabular-nums ${
                    state === "expired" ? "font-semibold text-alert" : state === "soon" ? "text-ink" : "text-mut"
                  }`}
                >
                  {formatThaiDate(iso)}
                </span>
                {needsRenewal(state) ? (
                  <span className={`truncate text-11 ${LICENSE_NOTE_TONE[state]}`}>
                    {state === "expired" ? `หมด ${formatLicenseGap(days).replace("หมดอายุแล้ว ", "")}` : formatLicenseGap(days)}
                  </span>
                ) : null}
              </>
            )}
          </span>
        );
      })}
    </span>
  );
}

/**
 * ตัวกรองโหมดเอกสารต้องต่ออายุ — แถวช่องเดียว **เลือกได้ทีละช่อง ไม่กรองซ้อน** (Bew 21 พ.ย. 2569)
 * ทั้งหมด = สี่แท็กพร้อมกัน · ช่องอื่น = หนึ่งแท็ก (ชนิด × สถานะ) · ตัวเลข = จำนวนใบในขอบเขตสาขา
 */
function RenewalFilter({
  tags,
  count,
  onChange,
}: {
  tags: DocTag[];
  count: Partial<Record<DocTag, number>>;
  onChange: (tags: DocTag[]) => void;
}) {
  const options: { key: string; tags: DocTag[]; label: string; Icon?: typeof IdCard; tone?: string }[] = [
    { key: "all", tags: ALERT_TAGS, label: "ทั้งหมด" },
    ...DOC_KINDS.flatMap(({ kind, short, Icon }) =>
      (
        [
          ["expired", "หมดแล้ว", "text-alert"],
          ["soon", "ใกล้หมด", "text-sla"],
        ] as const
      ).map(([state, text, tone]) => ({
        key: `${kind}:${state}`,
        tags: [`${kind}:${state}` as DocTag],
        label: `${short} ${text}`,
        Icon,
        tone,
      })),
    ),
  ];
  const current = tags.length === 1 ? tags[0] : "all";

  return (
    <div role="radiogroup" aria-label="กรองเอกสารต้องต่ออายุ" className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="text-13 font-semibold text-ink">เอกสารต้องต่ออายุ</span>
      <div className="flex overflow-x-auto rounded-field border border-line scrollbar-thin">
        {options.map((o, i) => {
          const on = current === o.key;
          const n = o.tags.reduce((sum, t) => sum + (count[t] ?? 0), 0);
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.tags)}
              className={`flex h-9 flex-none cursor-pointer items-center gap-1.5 px-3.5 text-12-5 whitespace-nowrap transition-colors ${
                i ? "border-l border-line" : ""
              } ${on ? "bg-primary font-semibold text-primary-content" : "text-ink hover:bg-base-200/60"}`}
            >
              {o.Icon ? <o.Icon size={14} strokeWidth={1.9} aria-hidden className={on ? "" : "text-mut"} /> : null}
              <span className={on ? "" : o.tone}>{o.label}</span>
              <span className={`font-mono text-11-5 tabular-nums ${on ? "" : "text-mut"}`}>{n}</span>
            </button>
          );
        })}
      </div>
    </div>
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
 *   · กดแล้วเปลี่ยนสถานะได้ตรงนั้นเลย (`DriverStatusControl`, กลับมา Bew 6 พ.ย. 2569) · ไม่มีสิทธิ์ “↳ ประวัติ” = ป้ายอ่านอย่างเดียว
 *
 * ป้ายรหัสกว้างขั้นต่ำเท่ากันทุกแถว (`min-w-7`) ตัวอักษร 1–3 ตัวจึงเรียงเป็นแนวเดียว
 * และข้อความข้างหลังไม่ขยับเข้าออกตามความยาวรหัส
 */
function StatusCell({ driver }: { driver: DriverListRecord }) {
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

function OwnerTypeBadge({ driver }: { driver: DriverListRecord }) {
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
 * กับ `border-collapse` ที่มีพื้นทึบ (`bg-base-200`) อยู่แล้ว — ท่าเดียวกับ
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
      เส้นใต้เป็น `border-b` ธรรมดาได้ เพราะหัวตารางมีพื้นทึบ (`bg-base-200`)
      ไม่ใช่พื้นโปร่งแสง+เบลอ — ท่าเดียวกับตารางผู้สมัคร ที่พิสูจน์มาแล้วว่า
      เส้นไม่หายเวลาเลื่อน · เบลอกันการไหลทะลุแนวตั้งได้ แต่กันแนวนอนไม่ได้

      `py-0` ที่ `<th>` โดยตั้งใจ — ปุ่มข้างในเป็นคนกินพื้นที่ทั้งหมดเอง
      กดตรงไหนของหัวคอลัมน์ก็เปิดเมนูเรียง+กรอง (กติกาเดียวกับ `sheet-column.tsx`)
    */
    <th
      aria-sort={sorted ? (sorted === "asc" ? "ascending" : "descending") : "none"}
      className={`${column.width} sticky top-0 border-b border-line-strong bg-base-200 px-3 py-0 text-left whitespace-nowrap ${
        stickyLeft
          ? "left-0 z-20 after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-line"
          : "z-10"
      }`}
    >
      {menu}
    </th>
  );
}

/* --------------------------------------------------------- แถบตัวเลข (แบบใหม่ 25 พ.ย. 2569) */

type StatTone = "ink" | "primary" | "alert" | "sla";

const STAT_TONE: Record<StatTone, { value: string; bar: string }> = {
  ink: { value: "text-ink", bar: "bg-ink" },
  primary: { value: "text-primary", bar: "bg-primary" },
  alert: { value: "text-alert", bar: "bg-alert" },
  sla: { value: "text-sla", bar: "bg-sla" },
};

/**
 * แถบตัวเลขบนสุดของทะเบียน — ช่องเรียงต่อกันคั่นเส้นบาง ไม่ใช่การ์ด · ช่องยืดเต็มแถวเสมอ (`flex-1`)
 * จอแคบตัดขึ้นแถวใหม่โดยไม่มีช่องว่างค้าง · เส้นคั่นของแถวที่ตัดลงมาคือ `border-b` ของแต่ละช่อง
 * (กล่องใน `-mb-px -mr-px` ซ่อนเส้นของช่องขอบขวา/ล่างสุด)
 */
function StatStrip({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden border-y border-line">
      <div className="-mr-px -mb-px flex flex-wrap">{children}</div>
    </div>
  );
}

/** หนึ่งช่องตัวเลข — ส่ง `onClick` แล้วเป็นปุ่มกรอง · ช่องที่กรองอยู่ = ขีดสีขอบบน + พื้นอ่อน */
function RegistryStat({
  label,
  value,
  unit = "คน",
  sub,
  share,
  target,
  tone = "ink",
  active,
  onClick,
  title,
}: {
  label: string;
  value: number;
  unit?: string;
  sub?: string;
  /** สัดส่วน 0–1 → แถบบางใต้ตัวเลข + ป้าย % ต่อท้ายหน่วย */
  share?: number;
  /** เส้นเป้าบนแถบ (0–1) — Coverage Rate */
  target?: number;
  tone?: StatTone;
  active?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const t = STAT_TONE[tone];
  const pct = share === undefined ? null : Math.min(100, Math.max(0, share * 100));
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-12 text-mut">
        <span className="min-w-0 truncate">{label}</span>
        {active ? <ListFilter size={13} strokeWidth={2.2} aria-hidden className="flex-none text-primary" /> : null}
      </span>
      <span className="flex items-baseline gap-1.5">
        <span key={value} className={`animate-fade-in text-26 leading-tight font-semibold tabular-nums ${t.value}`}>
          {value.toLocaleString("th-TH")}
        </span>
        <span className="text-12-5 text-mut">
          {unit}
          {pct !== null && unit !== "%" ? ` · ${pct > 0 && pct < 0.1 ? "<0.1" : pct.toFixed(1)}%` : ""}
        </span>
      </span>
      {pct !== null ? (
        <span aria-hidden className="relative mt-0.5 block h-1 w-full rounded-full bg-base-200">
          <span
            className={`block h-full rounded-full transition-[width] duration-700 ease-out ${tone === "ink" ? "bg-primary" : t.bar}`}
            style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }}
          />
          {target !== undefined ? (
            <span className="absolute -top-[3px] h-2.5 w-0.5 bg-ink" style={{ left: `${target * 100}%` }} />
          ) : null}
        </span>
      ) : null}
      {sub ? <span className="truncate text-12 text-mut">{sub}</span> : null}
      {active ? <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-primary" /> : null}
    </>
  );
  const shell = `relative flex min-w-0 flex-1 basis-44 flex-col gap-1 border-r border-b border-line px-(--sheet-px) py-3.5 text-left ${
    active ? "bg-soft/40" : ""
  }`;
  if (!onClick)
    return (
      <div className={shell} title={title}>
        {body}
      </div>
    );
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={`${shell} cursor-pointer transition-colors ${active ? "" : "hover:bg-base-200/60"}`}
    >
      {body}
    </button>
  );
}

/** ช่องสัดส่วนประเภท (พจส. / สแปร์ / …) — แถบแบ่งส่วนเดียว + ยอดของแต่ละประเภท · สีเข้ม→อ่อนตามลำดับ */
function OwnerSplitStat({ options }: { options: ColumnFilterOption[] }) {
  const rows = options.filter((o) => (o.count ?? 0) > 0);
  const total = rows.reduce((s, o) => s + (o.count ?? 0), 0);
  const shades = ["bg-primary", "bg-primary/45", "bg-ink/25", "bg-ink/15"];
  if (!total) return null;
  return (
    <div className="flex min-w-0 flex-1 basis-56 flex-col gap-2 border-r border-b border-line px-(--sheet-px) py-3.5">
      <span className="text-12 text-mut">ประเภท</span>
      <span aria-hidden className="mt-1.5 flex h-2 gap-px overflow-hidden rounded-sm">
        {rows.map((o, i) => (
          <span key={o.value} className={shades[i % shades.length]} style={{ width: `${((o.count ?? 0) / total) * 100}%` }} />
        ))}
      </span>
      <span className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-12 text-mut">
        {rows.map((o) => (
          <span key={o.value} className="whitespace-nowrap">
            {o.label} <b className="font-semibold text-ink tabular-nums">{(o.count ?? 0).toLocaleString("th-TH")}</b>
          </span>
        ))}
      </span>
    </div>
  );
}

/* --------------------------------------------------------- ภาพรวมพ้นสภาพ */

/** ควบคุมได้ = ได้ + ได้บางส่วน · ที่เหลือ (ไม่ได้ / ไม่นับ / ไม่ระบุ) นับเป็นควบคุมไม่ได้ในกราฟ */
/**
 * ควบคุมได้? 4 ชั้นของกราฟรายเดือน — สี/ลำดับเดียวกับแท็บ TurnOver ของแดชบอร์ด (`CTL_CONFIG` ใน turnover-charts.tsx)
 * หน้านี้ไม่มีตัวแปรสีของ `.dash` จึงใส่ค่าสีตรง ๆ
 */
const CTL_BARS = [
  { key: "yes", label: "ควบคุมได้", color: "#eb6834" },
  { key: "partial", label: "ควบคุมได้บางส่วน", color: "#eda100" },
  { key: "no", label: "ควบคุมไม่ได้", color: "#2a78d6" },
  { key: "na", label: "ไม่ได้ข้อมูล / ไม่ระบุ", color: "#c4cad3" },
] as const;
const ctlKeyOf = (d: DriverListRecord): (typeof CTL_BARS)[number]["key"] => {
  const c = d.resignation?.controllable;
  return c === "yes" || c === "partial" || c === "no" ? c : "na";
};
const isControllable = (d: DriverListRecord) => d.resignation?.controllable === "yes" || d.resignation?.controllable === "partial";

/**
 * แถบภาพรวมของแท็บพ้นสภาพ — กราฟแท่งรายเดือน 12 เดือนล่าสุด (ควบคุมได้ / บางส่วน / ไม่ได้ / ไม่ได้ข้อมูล ซ้อนกัน
 * แบบเดียวกับแท็บ TurnOver 25 พ.ย. 2569) + สาเหตุหลัก 5 อันดับ
 * · นับจาก `scope` (สาขา + แท็บ) ไม่ใช่ผลที่กรองแล้ว — กดแท่ง/สาเหตุ = ติ๊กตัวกรองคอลัมน์นั้น กดซ้ำเลิก
 */
function ExitInsights({
  rows,
  months,
  reasons,
  onMonth,
  onReason,
}: {
  rows: DriverListRecord[];
  months: string[];
  reasons: string[];
  onMonth: (key: string) => void;
  onReason: (code: string) => void;
}) {
  const data = useMemo(() => {
    const now = new Date();
    const keys: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    const byMonth = new Map(keys.map((k) => [k, { yes: 0, partial: 0, no: 0, na: 0 }]));
    const byReason = new Map<string, { label: string; count: number; ctl: boolean }>();
    for (const d of rows) {
      const m = byMonth.get(exitMonthKey(d));
      if (m) m[ctlKeyOf(d)]++;
      const code = d.resignation?.reasonCode;
      if (code) {
        const r = byReason.get(code);
        byReason.set(code, { label: d.resignation?.reasonLabel || r?.label || "", count: (r?.count ?? 0) + 1, ctl: isControllable(d) });
      }
    }
    const bars = keys.map((key) => {
      const b = byMonth.get(key)!;
      return { key, ...b, total: b.yes + b.partial + b.no + b.na };
    });
    const top = [...byReason.entries()]
      .map(([code, r]) => ({ code, ...r }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    const sum = bars.reduce((n, b) => n + b.total, 0);
    const active = bars.filter((b) => b.total).length;
    return { bars, max: Math.max(1, ...bars.map((b) => b.total)), top, avg: active ? Math.round(sum / active) : 0 };
  }, [rows]);

  const maxReason = data.top[0]?.count ?? 1;

  return (
    <div className="flex flex-wrap border-b border-line">
      <div className="flex min-w-0 flex-[1_1_32rem] flex-col gap-3 border-line px-(--sheet-px) py-4 lg:border-r">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
          <div className="min-w-0">
            <h2 className="text-13 font-semibold text-ink">พ้นสภาพรายเดือน · 12 เดือนล่าสุด</h2>
            <p className="text-11-5 text-mut">แยกตามควบคุมได้หรือไม่ · เฉลี่ย {data.avg.toLocaleString("th-TH")} คน/เดือน · กดแท่งเพื่อกรองเดือน</p>
          </div>
          <span className="flex flex-wrap gap-x-3.5 gap-y-1 text-11-5 text-mut">
            {CTL_BARS.map((c) => (
              <span key={c.key} className="flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-xs" style={{ background: c.color }} />
                {c.label}
              </span>
            ))}
          </span>
        </div>
        <div className="grid h-40 grid-cols-12 items-end gap-2 border-b border-line-strong">
          {data.bars.map((b) => {
            const on = months.includes(b.key);
            const dim = months.length > 0 && !on;
            return (
              <button
                key={b.key}
                type="button"
                onClick={() => onMonth(b.key)}
                aria-pressed={on}
                title={`${formatExitMonth(b.key)} · ${b.total} คน (${CTL_BARS.map((c) => `${c.label} ${b[c.key]}`).join(" · ")})`}
                className={`group flex h-full cursor-pointer flex-col items-center justify-end gap-1 transition-opacity ${dim ? "opacity-35 hover:opacity-80" : ""}`}
              >
                <span className={`text-11 tabular-nums ${on ? "font-semibold text-ink" : "text-mut"}`}>{b.total || ""}</span>
                {/* ซ้อนจากล่างขึ้นบน: ควบคุมได้ → บางส่วน → ไม่ได้ → ไม่ได้ข้อมูล (ลำดับเดียวกับแท็บ TurnOver) */}
                <span
                  className={`flex w-full max-w-8 flex-col-reverse overflow-hidden rounded-t-sm transition-[filter] group-hover:brightness-95 ${on ? "ring-2 ring-primary ring-offset-1" : ""}`}
                  style={{ height: `${(b.total / data.max) * 80}%` }}
                >
                  {CTL_BARS.map((c) => (b[c.key] ? <span key={c.key} style={{ flexGrow: b[c.key], background: c.color }} /> : null))}
                </span>
              </button>
            );
          })}
        </div>
        <div className="-mt-1.5 grid grid-cols-12 gap-2">
          {data.bars.map((b, i) => (
            <span key={b.key} className={`text-center text-11 ${i === 11 ? "font-semibold text-ink" : "text-mut"}`}>
              {THAI_MONTHS_SHORT[Number(b.key.slice(5, 7)) - 1]}
            </span>
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-[1_1_24rem] flex-col gap-3 border-t border-line px-(--sheet-px) py-4 lg:border-t-0">
        <h2 className="text-13 font-semibold text-ink">สาเหตุหลัก 5 อันดับ</h2>
        {data.top.length ? (
          <ul className="flex flex-col gap-1">
            {data.top.map((r) => {
              const on = reasons.includes(r.code);
              return (
                <li key={r.code}>
                  <button
                    type="button"
                    onClick={() => onReason(r.code)}
                    aria-pressed={on}
                    className={`grid w-full cursor-pointer grid-cols-[3.25rem_minmax(0,1fr)_2.5rem] items-center gap-2.5 rounded-selector px-1.5 py-1 text-left transition-colors ${
                      on ? "bg-soft/60" : "hover:bg-base-200/60"
                    }`}
                  >
                    <span className="font-mono text-12 font-semibold text-ink">{r.code}</span>
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="flex justify-between gap-2 text-12-5">
                        <span className="truncate text-ink" title={r.label}>
                          {r.label}
                        </span>
                        <span className="flex-none text-11-5 text-mut">{r.ctl ? "ควบคุมได้" : "ไม่ได้"}</span>
                      </span>
                      <span aria-hidden className="block h-1.5 rounded-xs bg-base-200">
                        <span
                          className={`block h-full rounded-xs ${on ? "bg-primary" : r.ctl ? "bg-ink" : "bg-ink/25"}`}
                          style={{ width: `${(r.count / maxReason) * 100}%` }}
                        />
                      </span>
                    </span>
                    <span className="text-right text-13 font-semibold text-ink tabular-nums">{r.count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-12-5 text-mut">ยังไม่มีรหัสสาเหตุในขอบเขตนี้</p>
        )}
      </div>
    </div>
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
    <div className="flex animate-fade-in flex-wrap items-center gap-2">
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
            className="flex animate-pop-in items-center gap-1.5 rounded-selector border border-line bg-base-200/60 py-0.5 pr-1 pl-2.5 text-12 text-ink"
          >
            <span className="text-mut">{FILTER_LABELS[key]}:</span>
            <span className="max-w-52 truncate font-medium" title={labels.join(", ")}>
              {shown}
            </span>
            <button
              type="button"
              onClick={() => onClear(key)}
              aria-label={`เลิกกรอง${FILTER_LABELS[key]}`}
              className="grid size-5 cursor-pointer place-items-center rounded-full text-mut transition-colors hover:bg-ink hover:text-base-100"
            >
              <X size={11} strokeWidth={2.4} aria-hidden />
            </button>
          </span>
        );
      })}

      <button
        type="button"
        onClick={onClearAll}
        className="flex cursor-pointer items-center px-1 py-1 text-12 text-primary underline underline-offset-4 transition-colors hover:text-ink"
      >
        ล้างทั้งหมด
      </button>
    </div>
  );
}

function siteFilterLabel(site: SiteFilter): string {
  if (site === "other") return "อื่น ๆ";
  return SITE_TAB_KEYS[site].map((key) => DRIVER_SITES.find((s) => s.key === key)?.label ?? key).join("+");
}

/**
 * แท็บสาขา — ของเดิมเป็นแท็บบนสุดของหน้า เพราะฝ่ายบุคคลแต่ละคนดูสาขาเดียวทั้งวัน
 * ไม่ใช่ดรอปดาวน์ที่ต้องกดสองครั้งเพื่อสลับ · แท็บ “อื่น ๆ” มีเฉพาะตอนที่มีคนอยู่จริง
 */
function SiteTabs({
  value,
  tabs,
  onChange,
}: {
  value: SiteFilter;
  tabs: SiteFilter[];
  onChange: (v: SiteFilter) => void;
}) {
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
    <div className="flex animate-fade-in flex-col items-center gap-2.5 px-5 py-12 text-center">
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
