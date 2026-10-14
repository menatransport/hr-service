"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CircleCheck,
  Download,
  FileSpreadsheet,
  RotateCcw,
  TriangleAlert,
  X,
} from "lucide-react";

import { PageHead } from "@/components/desk/page-head";
import { ColumnList } from "@/components/payroll/column-list";
import { ChecksPanel } from "@/components/payroll/checks-panel";
import { NotifyButton } from "@/components/payroll/notify-panel";
import { OwnerGroup } from "@/components/payroll/owner-group";
import { PeriodPicker } from "@/components/payroll/period-picker";
import {
  isLocked,
  periodCode,
  periodLabel,
  type PeriodRef,
} from "@/lib/payroll/period";
import { eventLine, type IntakeEvent } from "@/lib/payroll/intake-events";
import { reviewActions } from "@/lib/payroll/intake-gate";
import {
  emptyRecord,
  lateDays,
  needsChasing,
  needsReview,
  STAGE_LABEL,
  STAGE_TONE,
  type IntakeRecord,
  type IntakeStage,
} from "@/lib/payroll/intake-status";
import type { DeskIdentity } from "@/lib/auth/identity";
import { HR_DEPARTMENT_LABEL } from "@/lib/payroll/approver";
import { unmappedOwners } from "@/lib/payroll/owner-directory";
import { visibleItems } from "@/lib/payroll/scope-filter";
import { classify, KIND_LABEL } from "@/lib/payroll/classify";
import {
  OWNER_ORDER,
  type IntakeItem,
} from "@/lib/payroll/registry";
import {
  defaultSelection,
  tally,
  type FileProfile,
} from "@/lib/payroll/profile";
import type { CheckResult, CheckTally } from "@/lib/payroll/rules";
import { confirm, toastError, toastSuccess } from "@/lib/swal";

/**
 * หน้ารับข้อมูล — **รอบหนึ่งเดือน แยกตามเจ้าของข้อมูล**
 *
 * เดิมหน้านี้เป็นวิซาร์ดอัปโหลดไฟล์เดียวจบ ซึ่งตอบไม่ได้ว่า “รอบนี้ยังขาดอะไร” —
 * ทั้งที่นั่นคือคำถามเดียวที่คนทำเงินเดือนถามทุกวันระหว่างวันที่ 10 ถึง 25
 * ตอนนี้จึงเป็นตัวไล่ของทั้งรอบ: 30 รายการ 6 เจ้าของข้อมูล แล้วค่อยเจาะทีละชิ้น
 *
 * **จัดกลุ่มตามคนที่ต้องตาม ไม่ใช่ตามประเภทเงิน** — ดูเหตุผลใน `owner-group.tsx`
 *
 * ขั้นบนหน้าตรงกับกระบวนการเป้าหมาย: เลือกรอบ (1) → ฝ่ายส่งไฟล์ (2) → ตรวจคุณภาพ (3)
 * **จุดตัดสินอยู่ที่ขั้น 3 เท่านั้น** ผ่านแล้วเข้ารอบ ไม่ผ่านตีกลับพร้อมเหตุผล
 * ส่วนขั้น 4–7 (รวมยอด · กระทบยอด · ส่ง Tiger Soft · ปิดรอบ) อยู่คนละหน้า
 *
 * **การอัปโหลดกับการรับเข้ารอบเป็นสองการกระทำ** — อัปโหลดเสร็จบันทึกเป็น
 * “อัปโหลดแล้ว” ทันที (ไม่ต้องรอใคร ไม่หายถ้าปิดจอ) แล้วค้างรอ HR มากดผ่านเอง
 * ของเดิมกดผ่านทีเดียวแล้วเขียนทั้งสองสถานะต่อกัน ซึ่งเท่ากับไม่มีขั้นรอตรวจจริง
 *
 * **ไฟล์ถูกอ่านจริงที่ `POST /api/payroll/parse`** แล้วได้ทั้งโปรไฟล์คอลัมน์และผลตรวจ
 * ด่าน 1 (`checks`) · ผลตรวจถูกบันทึกกับแถวสถานะ และ **ด่านที่สอง (HR กดผ่าน) ถูกบังคับ
 * ที่เซิร์ฟเวอร์** — ถ้ายังมีข้อผิดพลาดค้าง HR ข้ามได้ต้องเขียนเหตุผลเท่านั้น
 */
export function IntakeView({
  canPass,
  identity,
  initialPeriod,
}: {
  canPass: boolean;
  identity: DeskIdentity;
  /** รอบที่เปิดตอนเข้าหน้า — มาจาก `?period=` ในลิงก์ (ตรวจแล้วที่ `page.tsx`) */
  initialPeriod: PeriodRef;
}) {
  /* ซ่อนบนหน้าจอเพื่อให้อ่านง่าย — การกันจริงอยู่ที่ API (`scope-filter.ts`) */
  const items = useMemo(() => visibleItems(identity), [identity]);
  const owners = useMemo(
    () => OWNER_ORDER.filter((owner) => items.some((item) => item.owner === owner)),
    [items],
  );
  const unmapped = unmappedOwners();

  const [period, setPeriod] = useState<PeriodRef>(initialPeriod);
  const [records, setRecords] = useState<Map<string, IntakeRecord>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openOwners, setOpenOwners] = useState<Set<string>>(
    () => new Set(OWNER_ORDER),
  );

  const [active, setActive] = useState<IntakeItem | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [profile, setProfile] = useState<FileProfile | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [events, setEvents] = useState<IntakeEvent[]>([]);
  /* กระตุ้นให้โหลดร่องรอยใหม่หลังมีการตัดสิน — ไม่ได้ถูกอ่านที่ไหน */
  const [trailAt, setTrailAt] = useState(0);
  const [sortMode, setSortMode] = useState<"file" | "risk">("file");
  const [filterMode, setFilterMode] = useState<"all" | "issue">("all");
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const code = periodCode(period);
  const locked = isLocked(period);
  const counts = useMemo(() => (profile ? tally(profile) : null), [profile]);

  /* วันปัจจุบันถูกคิดครั้งเดียวต่อการโหลดรอบ ไม่ใช่ทุก render — ไม่งั้นตัวเลข
     “ช้ากี่วัน” จะกระพริบเปลี่ยนเองระหว่างที่ผู้ใช้ยังไม่ได้ทำอะไร */
  const [now, setNow] = useState(() => new Date());
  const [reloadAt, setReloadAt] = useState(0);

  /* โหลดใหม่ทุกครั้งที่เปลี่ยนรอบ หรือกดรีเฟรช — `reloadAt` เป็นตัวกระตุ้นอย่างเดียว
     ไม่ได้ถูกอ่านที่ไหน · ทุก setState อยู่หลัง await เพื่อไม่ให้เกิด cascading render
     (กฎ react-hooks/set-state-in-effect) และ `alive` กันไม่ให้ผลของรอบเก่า
     มาทับรอบใหม่เมื่อผู้ใช้กดสลับเดือนรัว ๆ */
  useEffect(() => {
    let alive = true;

    void (async () => {
      try {
        const res = await fetch(`/api/payroll/intake?period=${code}`);
        const json = (await res.json()) as IntakeRecord[] | { error: string };
        if (!alive) return;
        if (!res.ok || !Array.isArray(json)) {
          throw new Error("error" in json ? json.error : "อ่านสถานะรอบไม่สำเร็จ");
        }
        setRecords(new Map(json.map((row) => [row.itemId, row])));
        setNow(new Date());
        setLoadError(null);
      } catch (err) {
        if (!alive) return;
        setLoadError(err instanceof Error ? err.message : "อ่านสถานะรอบไม่สำเร็จ");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [code, reloadAt]);

  const reload = useCallback(() => {
    setLoading(true);
    setReloadAt(Date.now());
  }, []);

  /* แบบฟอร์มถูกสร้างสดตอนกด จึงผูกกับรอบที่เลือกอยู่เสมอ — ชีต "ข้อมูลรอบ"
     ในไฟล์จะมีชื่อรอบกรอกมาให้แล้ว คนกรอกไม่ต้องมาพิมพ์เองให้ผิด */
  const templateHref = useCallback(
    (item: IntakeItem) =>
      `/api/payroll/intake/template?period=${code}&itemId=${item.id}`,
    [code],
  );

  const total = items.length;

  /* `?owner=` ในลิงก์จากอีเมลเลื่อนมาที่กลุ่มนั้นเท่านั้น ไม่ให้สิทธิ์อะไร —
     ขอบเขตมาจาก session (`items` กรองแล้ว) ฝ่ายที่ไม่ใช่ของตัวเองไม่มีกล่องให้เลื่อนไปหา */
  useEffect(() => {
    if (loading) return;
    const owner = new URLSearchParams(window.location.search).get("owner");
    if (!owner) return;
    document.getElementById(`owner-${owner}`)?.scrollIntoView({ block: "start" });
  }, [loading]);

  /* ร่องรอยการตัดสินของใบที่เปิดอยู่ — ตอบว่า "เกิดอะไรขึ้นมาแล้วบ้าง" ซึ่งแถวสถานะ
     ตอบไม่ได้ เพราะทุกการเขียนทับที่เดิม · โหลดใหม่ทุกครั้งที่เปลี่ยนใบหรือมีการตัดสิน */
  useEffect(() => {
    const itemId = active?.id;
    if (!itemId) return;
    let alive = true;

    void (async () => {
      try {
        const res = await fetch(
          `/api/payroll/intake/events?period=${code}&itemId=${itemId}`,
        );
        const json = (await res.json()) as IntakeEvent[] | { error: string };
        if (!alive) return;
        setEvents(Array.isArray(json) ? json : []);
      } catch {
        if (alive) setEvents([]);
      }
    })();

    return () => {
      alive = false;
    };
  }, [code, active?.id, trailAt]);

  /* ฝ่ายที่ยังมีของรอส่งหรือถูกตีกลับ — ของที่ส่งแล้วรอตรวจไม่นับ ลูกบอลอยู่ที่ HR */
  const unsentOwners = useMemo(
    () =>
      owners.filter((owner) =>
        items.some((item) => {
          if (item.owner !== owner) return false;
          const stage = (records.get(item.id) ?? emptyRecord(item.id)).stage;
          return stage === "waiting" || stage === "returned";
        }),
      ),
    [owners, items, records],
  );

  const summary = useMemo(() => {
    let passed = 0;
    let chasing = 0;
    let review = 0;
    for (const item of items) {
      const record = records.get(item.id) ?? emptyRecord(item.id);
      if (record.stage === "passed") passed += 1;
      if (needsChasing(item, period, record, now)) chasing += 1;
      if (needsReview(record)) review += 1;
    }
    return { passed, chasing, review };
  }, [items, records, period, now]);

  function clearFile() {
    setFile(null);
    setProfile(null);
    setSelected(new Set());
    if (inputRef.current) inputRef.current.value = "";
  }

  function pick(item: IntakeItem) {
    setActive((was) => (was?.id === item.id ? null : item));
    clearFile();
  }

  /**
   * รับไฟล์เข้ามา — **บันทึกสถานะ “อัปโหลดแล้ว” ทันที ไม่รอให้ใครกดอะไรต่อ**
   *
   * ของเดิมสถานะถูกเขียนตอนกดรับเข้ารอบเท่านั้น ซึ่งแปลว่าคนที่อัปโหลดเสร็จแล้ว
   * ปิดจอไป ทะเบียนยังขึ้น “รอส่ง” อยู่ดี แล้ว HR ก็โทรตามของที่มาถึงแล้ว
   *
   * การบันทึกทำที่เซิร์ฟเวอร์ในคำขอเดียวกับการอ่านไฟล์ (`/api/payroll/parse`) พร้อมผลตรวจ
   * ด่าน 1 — หน้าจอไม่ส่งตัวเลขผลตรวจกลับไปเอง
   */
  async function read(next: File) {
    if (!active) return;
    if (!next.name.toLowerCase().endsWith(".xlsx")) {
      void toastError("รองรับเฉพาะไฟล์ .xlsx");
      return;
    }
    if (locked) {
      void toastError("รอบนี้ปิดแล้ว", "เลือกรอบที่ยังเปิดอยู่ก่อนจึงจะอัปโหลดได้");
      return;
    }
    /* ใบที่รับเข้ารอบแล้วรับไฟล์ใหม่ทับไม่ได้ — เซิร์ฟเวอร์ตอบ 409 อยู่แล้ว ที่นี่แค่
       บอกก่อนจะส่งไฟล์ขึ้นไปเสียเวลา และชี้ทางออกให้ตรง */
    if ((records.get(active.id)?.stage ?? "waiting") === "passed") {
      void toastError(
        "รายการนี้รับเข้ารอบไปแล้ว",
        `ส่งไฟล์ชุดใหม่ทับไม่ได้ — ให้${HR_DEPARTMENT_LABEL}เปิดใบกลับมาก่อน`,
      );
      return;
    }

    setFile(next);

    const body = new FormData();
    body.append("file", next);
    body.append("period", code);
    body.append("itemId", active.id);

    let json:
      | {
          profile: FileProfile;
          checks: CheckResult[];
          tally: CheckTally;
          file: { fileId: string };
          record: IntakeRecord;
        }
      | { error: string; file?: { fileId: string } };
    let res: Response;
    try {
      res = await fetch("/api/payroll/parse", { method: "POST", body });
      json = await res.json();
    } catch {
      void toastError("อ่านไฟล์ไม่สำเร็จ", "ติดต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง");
      clearFile();
      return;
    }

    if (!res.ok || !("profile" in json)) {
      const error = "error" in json ? json.error : undefined;
      /* มี `file` = ไฟล์ถูกเก็บไว้แล้ว (422 อ่านไม่ออก · 500 บันทึกสถานะไม่ได้) — บอกตรง ๆ
         ว่าระบบได้ไฟล์ไปแล้ว ไม่ทำเหมือนไม่มีอะไรเกิดขึ้น เพราะ HR ต้องเปิดไฟล์นั้นดูได้
         และไม่คงโปรไฟล์ไว้บนจอ เพราะแถวสถานะไม่ตรงกับมัน */
      if ("file" in json && json.file) {
        void toastError(
          res.status === 422
            ? "รับไฟล์ไว้แล้ว แต่อ่านเนื้อหาไม่สำเร็จ"
            : "เก็บไฟล์ไว้แล้ว แต่ยังไม่ได้บันทึกสถานะ",
          `${error ? `${error} · ` : ""}ไฟล์ถูกเก็บไว้ในระบบ (เลขไฟล์ ${json.file.fileId}) ให้ ${HR_DEPARTMENT_LABEL} เปิดดูได้`,
        );
      } else {
        void toastError("อ่านไฟล์ไม่สำเร็จ", error);
      }
      /* 422 เซิร์ฟเวอร์เขียนแถว “อัปโหลดแล้ว” ให้แล้ว — โหลดทะเบียนใหม่ให้ตรง */
      if (res.status === 422) setReloadAt(Date.now());
      clearFile();
      return;
    }

    setProfile(json.profile);
    setSelected(defaultSelection(json.profile));
    /* สถานะและผลตรวจถูกบันทึกฝั่งเซิร์ฟเวอร์ในคำขอเดียวกับการอ่านไฟล์ — หน้าจอแค่รับแถวที่ได้มา */
    setRecords((was) => new Map(was).set(json.record.itemId, json.record));
    setTrailAt(Date.now());
    void toastSuccess(
      "บันทึกว่าอัปโหลดแล้ว",
      canPass
        ? "ตรวจผลด้านล่าง แล้วกดรับเข้ารอบ"
        : `รอ${HR_DEPARTMENT_LABEL}ตรวจแล้วกดรับเข้ารอบ`,
    );
  }

  function toggle(letter: string) {
    setSelected((was) => {
      const next = new Set(was);
      if (next.has(letter)) next.delete(letter);
      else next.add(letter);
      return next;
    });
  }

  async function save(stage: IntakeStage, extra: Partial<IntakeRecord> = {}) {
    if (!active) return;
    setSaving(true);
    try {
      const res = await fetch("/api/payroll/intake", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          period: code,
          itemId: active.id,
          stage,
          fileName: extra.fileName ?? file?.name,
          returnedReason: extra.returnedReason,
          overrideReason: extra.overrideReason,
        }),
      });
      const json = (await res.json()) as IntakeRecord | { error: string };
      if (!res.ok || !("itemId" in json)) {
        throw new Error("error" in json ? json.error : "บันทึกไม่สำเร็จ");
      }
      setRecords((was) => new Map(was).set(json.itemId, json));
      setTrailAt(Date.now());
      return json;
    } catch (err) {
      void toastError(
        "บันทึกไม่สำเร็จ",
        err instanceof Error ? err.message : undefined,
      );
      return null;
    } finally {
      setSaving(false);
    }
  }

  /* เปิดใบที่รับเข้ารอบแล้วกลับมา — ต้องมีเหตุผล เพราะเป็นการยกเลิกคำตัดสินที่ลงไปแล้ว
     และทั้งการเปิดกับเหตุผลถูกเก็บในร่องรอยถาวร */
  async function reopen(item: IntakeItem) {
    const reason = window.prompt(
      `เปิด “${item.title}” กลับมาแก้ — ใบนี้รับเข้ารอบไปแล้ว บอกเหตุผลที่ต้องรับไฟล์ชุดใหม่`,
    );
    if (!reason?.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/payroll/intake", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          period: code,
          itemId: item.id,
          action: "reopen",
          reason: reason.trim(),
        }),
      });
      const json = (await res.json()) as IntakeRecord | { error: string };
      if (!res.ok || !("itemId" in json)) {
        throw new Error("error" in json ? json.error : "เปิดใบกลับมาไม่สำเร็จ");
      }
      setRecords((was) => new Map(was).set(json.itemId, json));
      setTrailAt(Date.now());
      void toastSuccess("เปิดใบกลับมาแล้ว", `${item.owner} ส่งไฟล์ชุดใหม่ของ “${item.title}” ได้แล้ว`);
    } catch (err) {
      void toastError(
        "เปิดใบกลับมาไม่สำเร็จ",
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setSaving(false);
    }
  }

  /* คอลัมน์คีย์ที่ยังมีช่องว่าง — ใช้เป็นเหตุผลตั้งต้นตอนตีกลับ (แปลว่าเงินก้อนนั้น
     ไม่รู้จะเข้าใคร) · การกันผ่านเป็นหน้าที่ของด่าน 1 ไม่ใช่ตัวแปรนี้ */
  const brokenKey =
    profile?.columns.find(
      (column) => column.isKey && selected.has(column.letter) && column.empty > 0,
    ) ?? null;

  const activeRecord = active
    ? (records.get(active.id) ?? emptyRecord(active.id))
    : null;

  /* **ผลตรวจมาจากแถวที่เก็บไว้ ไม่ใช่จากไฟล์ที่เพิ่ง parse ในเบราว์เซอร์นี้** —
     คนที่ตรวจ (HR) กับคนที่อัปโหลดเป็นคนละคนเกือบทุกครั้ง ถ้าแผงนี้อยู่ได้เฉพาะ
     หลังอัปโหลดในแท็บเดียวกัน HR ก็ไม่มีทางตรวจอะไรได้เลย · เส้น parse เขียนผลตรวจ
     ลงแถวแล้วคืนแถวนั้นกลับมา ทั้งสองคนจึงอ่านของชุดเดียวกันเสมอ */
  const storedChecks = activeRecord?.checks ?? [];
  const openErrors = activeRecord?.errors ?? 0;
  const openBlocking = storedChecks.filter((c) => c.blocking).length;
  const actions = activeRecord
    ? reviewActions(activeRecord, canPass)
    : null;
  /* ของที่เคยมีไฟล์เข้ามาแล้ว — แผงตรวจและปุ่มตัดสินขึ้นจากแถว ไม่ต้องรออัปโหลดซ้ำ */
  const hasHistory = !!activeRecord && activeRecord.stage !== "waiting";

  return (
    <div className="animate-rise flex flex-col gap-5">
      <PageHead
        title="รับข้อมูล"
        subtitle="ไล่ของที่แต่ละฝ่ายต้องส่งในรอบนี้ แล้วตรวจคุณภาพทีละไฟล์ก่อนรับเข้ารอบ"
      />

      {/* ─────────────────────────────────────────── 1. เลือกรอบ */}
      <section className="flex flex-col gap-3 rounded-box border border-line bg-base-100 p-4">
        <StepHead
          no={1}
          done
          title="เลือกรอบที่จะรับข้อมูลเข้า"
          meta={`รอบ ${periodLabel(period)} · ${code}`}
        />
        <PeriodPicker
          value={period}
          onChange={(next) => {
            setPeriod(next);
            setActive(null);
            clearFile();
          }}
        />
      </section>

      {/* ───────────────────────────── 2. ของที่ต้องได้ แยกตามฝ่าย */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <StepHead
            no={2}
            done={total > 0 && summary.passed === total}
            title="ของที่ต้องได้ในรอบนี้"
            meta={`${owners.length} เจ้าของข้อมูล · ${total} รายการ`}
          />
        </div>

        {items.length > 0 && (
          <>
        {/* คำตอบก่อนรายละเอียด — รอบนี้ยังขาดอะไร */}
        <div
          className={`flex flex-wrap items-center gap-x-5 gap-y-2 rounded-box border p-3.5 ${
            summary.chasing
              ? "border-sla/30 bg-sla/6"
              : summary.passed === total
                ? "border-primary/30 bg-soft/60"
                : "border-line bg-base-100"
          }`}
        >
          {summary.chasing ? (
            <TriangleAlert size={19} strokeWidth={1.8} aria-hidden className="text-sla" />
          ) : (
            <CircleCheck size={19} strokeWidth={1.8} aria-hidden className="text-primary" />
          )}

          <span className="flex items-baseline gap-2.5">
            <span
              className={`font-mono text-26 leading-none font-semibold tabular-nums ${
                summary.chasing ? "text-sla" : "text-primary"
              }`}
            >
              {summary.chasing}
            </span>
            <span className="text-13 text-pretty">
              {summary.chasing
                ? "รายการที่ต้องตาม — เลยกำหนดหรือถูกตีกลับ"
                : "ไม่มีรายการค้าง ทุกฝ่ายส่งตามกำหนด"}
            </span>
          </span>

          <dl className="ml-auto flex flex-wrap gap-x-4 gap-y-1 text-12-5">
            <Count
              label="รอ HR ตรวจ"
              value={summary.review}
              tone={summary.review ? "text-warning" : undefined}
            />
            <Count label="ตรวจผ่านแล้ว" value={summary.passed} tone="text-primary" />
            <Count label="ทั้งหมด" value={total} />
          </dl>

          {canPass && !locked && unsentOwners.length > 0 ? (
            <NotifyButton
              periodCode={code}
              onlyOwners={unsentOwners}
              label="ดูร่างอีเมลทุกฝ่ายที่ยังไม่ส่ง"
            />
          ) : null}

          <a
            href={`/api/payroll/intake/template?period=${code}`}
            className="flex items-center gap-1.5 rounded-field border border-line px-2.5 py-1.5 text-12-5 text-mut transition-colors hover:border-primary/40 hover:text-ink"
          >
            <Download size={13} strokeWidth={1.9} aria-hidden />
            แบบฟอร์มทั้งชุด
          </a>

          <button
            type="button"
            onClick={reload}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-field border border-line px-2.5 py-1.5 text-12-5 text-mut transition-colors hover:border-primary/40 hover:text-ink disabled:opacity-50"
          >
            <RotateCcw size={13} strokeWidth={1.9} aria-hidden />
            รีเฟรช
          </button>
        </div>
          </>
        )}

        {loadError ? (
          <p role="status" className="rounded-box border border-sla/30 bg-sla/6 px-3.5 py-3 text-12-5 text-sla">
            {loadError}
          </p>
        ) : null}

        {items.length === 0 && (
          <div className="rounded-xl border border-base-300 bg-base-100 p-6 text-sm text-mut">
            <p className="font-medium text-base-content">
              หน่วยงานของคุณยังไม่มีรายการในทะเบียนรับข้อมูลเงินเดือน
            </p>
            <p className="mt-2">
              ทะเบียนรอบนี้มีผู้รับผิดชอบ {OWNER_ORDER.length} ฝ่าย ({OWNER_ORDER.join(" · ")}) — ถ้าฝ่ายของคุณ
              ต้องส่งข้อมูลด้วย แจ้ง{HR_DEPARTMENT_LABEL} เพื่อเพิ่มหน่วยงานให้ตรงกับทะเบียน
            </p>
            {unmapped.length > 0 && (
              <p className="mt-2">
                ตอนนี้ยังไม่ได้ผูกรหัสหน่วยงานของ {unmapped.join(" และ ")} ไว้ — สองฝ่ายนี้ต้องให้
                {HR_DEPARTMENT_LABEL} ตั้งค่าก่อนจึงจะเข้ามาส่งเองได้
              </p>
            )}
          </div>
        )}

        {loading ? (
          <p className="px-1 text-12-5 text-mut">กำลังอ่านสถานะรอบ {periodLabel(period)}…</p>
        ) : (
          owners.map((owner) => (
            <OwnerGroup
              key={owner}
              owner={owner}
              items={items.filter((item) => item.owner === owner)}
              period={period}
              records={records}
              now={now}
              open={openOwners.has(owner)}
              onToggle={() =>
                setOpenOwners((was) => {
                  const next = new Set(was);
                  if (next.has(owner)) next.delete(owner);
                  else next.add(owner);
                  return next;
                })
              }
              activeId={active?.id ?? null}
              onPick={pick}
              templateHref={templateHref}
              action={
                canPass && !locked ? (
                  <NotifyButton
                    periodCode={code}
                    owner={owner}
                    label="แจ้งฝ่ายนี้ทางอีเมล"
                  />
                ) : undefined
              }
            />
          ))
        )}
      </section>

      {/* ─────────────────────── 3. ตรวจคุณภาพของชิ้นที่เลือก */}
      {active && activeRecord ? (
        <section className="flex flex-col gap-3 rounded-box border border-primary/30 bg-base-100 p-4">
          <StepHead
            no={3}
            done={activeRecord.stage === "passed"}
            title={`ตรวจคุณภาพ — ${active.title}`}
            meta={`${active.owner} · ${active.category} · กำหนดวันที่ ${active.dueDay}`}
          />

          {/* บอกคนตรวจก่อนเปิดไฟล์ว่าช่องไหนลงสลิปทิศไหน และเงินเข้าใคร — ของที่ผสม
              กับรอยืนยันคือจุดที่เคยจ่ายผิดทิศได้โดยไม่มีอะไรเตือน */}
          {(() => {
            const cls = classify(active.id);
            if (!cls) return null;
            return (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-12 text-mut">
                <span className="font-medium text-ink">{KIND_LABEL[cls.kind]}</span>
                {cls.posted.map((p) => (
                  <span
                    key={p.column}
                    className={`rounded-field border px-1.5 py-px font-mono text-11 ${
                      p.effect === "หัก"
                        ? "border-alert/40 text-alert"
                        : p.effect === "รอยืนยัน"
                          ? "border-warning/50 text-warning"
                          : "border-primary/30 text-primary"
                    }`}
                  >
                    {p.effect} · {p.column}
                  </span>
                ))}
                {cls.payeeColumn !== "รหัสพนักงาน" ? (
                  <span className="text-alert">เงินเข้าช่อง “{cls.payeeColumn}” ไม่ใช่รหัสพนักงาน</span>
                ) : null}
                {cls.dataMonthOffset ? (
                  <span>ข้อมูลเป็นของ {Math.abs(cls.dataMonthOffset.months)} เดือนก่อนรอบจ่าย</span>
                ) : null}
                {cls.formOf ? <span>ฟอร์มเดียวกับ #{cls.formOf}</span> : null}
              </div>
            );
          })()}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-field bg-base-200/60 px-3.5 py-2.5">
            <span
              className={`rounded-field px-2 py-0.5 text-12 font-medium ${STAGE_TONE[activeRecord.stage]}`}
            >
              {STAGE_LABEL[activeRecord.stage]}
            </span>

            {activeRecord.receivedAt ? (
              <span className="font-mono text-11-5 text-mut tabular-nums">
                อัปโหลด{" "}
                {new Date(activeRecord.receivedAt).toLocaleString("th-TH", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {(() => {
                  const late = lateDays(active, period, activeRecord, now);
                  return late > 0 ? ` · ช้า ${late} วัน` : " · ตรงกำหนด";
                })()}
              </span>
            ) : null}

            {activeRecord.receivedBy ? (
              <span className="text-11-5 text-mut">โดย {activeRecord.receivedBy}</span>
            ) : activeRecord.updatedBy ? (
              <span className="text-11-5 text-mut">
                แก้ไขล่าสุดโดย {activeRecord.updatedBy}
              </span>
            ) : null}

            {/* ลายเซ็นคนตรวจ — ตัวที่ตอบได้ว่าใครรับผิดชอบว่าของชิ้นนี้ใช้ได้ */}
            {activeRecord.passedBy ? (
              <span className="font-mono text-11-5 text-primary tabular-nums">
                ผ่าน{" "}
                {new Date(activeRecord.passedAt ?? "").toLocaleString("th-TH", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                โดย {activeRecord.passedBy}
              </span>
            ) : null}

            {/* **ไฟล์ที่เก็บไว้เปิดได้จากที่นี่** — ด่าน 2 ต้องเปิดไฟล์จริงดู และคนที่
                ตรวจไม่ใช่คนที่อัปโหลด เมื่อก่อนไม่มีหน้าไหนลิงก์ไปที่ไฟล์เลย
                ทางเดียวที่ HR จะดูได้คือเอาไฟล์มาอัปโหลดเองใหม่ ซึ่งเขียนชื่อคนส่ง
                กับเวลาที่ของมาถึงทับเป็นของตัวเอง */}
            {activeRecord.fileId ? (
              <a
                href={`/api/payroll/files/${activeRecord.fileId}`}
                className="flex min-w-0 items-center gap-1.5 rounded-field border border-line px-2.5 py-1 text-12 text-mut transition-colors hover:border-primary/40 hover:text-primary"
                title={activeRecord.fileName ?? "ไฟล์ที่ฝ่ายส่งเข้ามา"}
              >
                <Download size={12} strokeWidth={2} aria-hidden />
                <span className="truncate">{activeRecord.fileName ?? "เปิดไฟล์ที่ส่งมา"}</span>
              </a>
            ) : activeRecord.fileName ? (
              <span className="truncate text-11-5 text-mut" title={activeRecord.fileName}>
                {activeRecord.fileName}
              </span>
            ) : null}

            <a
              href={templateHref(active)}
              className="ml-auto flex items-center gap-1.5 rounded-field border border-line px-2.5 py-1 text-12 text-mut transition-colors hover:border-primary/40 hover:text-primary"
            >
              <Download size={12} strokeWidth={2} aria-hidden />
              ดาวน์โหลดแบบฟอร์ม
            </a>

            <button
              type="button"
              onClick={() => setActive(null)}
              className="flex items-center gap-1 rounded-field border border-line px-2.5 py-1 text-12 text-mut transition-colors hover:border-alert/40 hover:text-alert"
            >
              <X size={12} strokeWidth={2} aria-hidden />
              ปิด
            </button>
          </div>

          {activeRecord.stage === "returned" && activeRecord.returnedReason ? (
            <p className="rounded-box border border-sla/30 bg-sla/6 px-3.5 py-2.5 text-12-5 text-sla text-pretty">
              ตีกลับไปแล้ว — {activeRecord.returnedReason}
            </p>
          ) : null}

          {/* อัปโหลดไฟล์ของรายการนี้ */}
          {profile ? (
            <div className="flex flex-wrap items-center gap-3 rounded-field bg-base-200/70 px-3.5 py-3">
              <FileSpreadsheet
                size={18}
                strokeWidth={1.7}
                aria-hidden
                className="flex-none text-primary"
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-13 font-medium">
                  {file?.name ?? profile.fileName}
                </span>
                <span className="font-mono text-11-5 text-mut tabular-nums">
                  ชีต “{profile.sheetName}”
                  {profile.sheetCount > 1 ? ` (จาก ${profile.sheetCount} ชีต)` : ""} ·
                  หัวตารางแถวที่ {profile.headerRow} · ข้อมูล{" "}
                  {profile.totalRows.toLocaleString("th-TH")} แถว ·{" "}
                  {profile.columns.length} คอลัมน์
                </span>
              </span>
              <button
                type="button"
                onClick={clearFile}
                className="ml-auto flex items-center gap-1 rounded-field border border-line px-2.5 py-1.5 text-12-5 text-mut transition-colors hover:border-alert/40 hover:text-alert"
              >
                <X size={13} strokeWidth={1.9} aria-hidden />
                เอาไฟล์ออก
              </button>
            </div>
          ) : (
            <div
              onDragOver={(event) => {
                event.preventDefault();
                if (!locked) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const dropped = event.dataTransfer.files?.[0];
                if (dropped) read(dropped);
              }}
              className={`flex flex-col items-center gap-2 rounded-box border border-dashed px-5 py-7 text-center transition-colors ${
                dragging ? "border-primary bg-soft/60" : "border-line bg-base-200/50"
              } ${locked ? "opacity-60" : ""}`}
            >
              <FileSpreadsheet size={20} strokeWidth={1.6} aria-hidden className="text-mut" />
              <p className="text-13 font-medium">
                {locked ? "รอบนี้ปิดแล้ว อัปโหลดไม่ได้" : `ลากไฟล์ของ “${active.title}” มาวางที่นี่`}
              </p>
              <p className="max-w-[48ch] text-12 leading-relaxed text-mut text-pretty">
                ระบบจะอ่านหัวตารางและวิเคราะห์ข้อมูลทุกแถวให้ก่อน ยังไม่รับเข้ารอบ
              </p>
              <button
                type="button"
                disabled={locked}
                onClick={() => inputRef.current?.click()}
                className={`mt-1 rounded-field px-3.5 py-2 text-13 font-medium transition-opacity ${
                  locked
                    ? "cursor-not-allowed border border-line text-mut"
                    : "bg-primary text-primary-content hover:opacity-90"
                }`}
              >
                เลือกไฟล์
              </button>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(event) => {
              const chosen = event.target.files?.[0];
              if (chosen) read(chosen);
            }}
          />

          {/* ผลตรวจคอลัมน์ */}
          {profile && counts ? (
            <>
              <div
                className={`flex flex-wrap items-center gap-x-5 gap-y-2 rounded-box border p-3.5 ${
                  counts.error || openBlocking
                    ? "border-sla/30 bg-sla/6"
                    : counts.warn
                      ? "border-warning/35 bg-warning/8"
                      : "border-primary/30 bg-soft/60"
                }`}
              >
                {counts.error || openBlocking ? (
                  <TriangleAlert size={19} strokeWidth={1.8} aria-hidden className="text-sla" />
                ) : (
                  <CircleCheck size={19} strokeWidth={1.8} aria-hidden className="text-primary" />
                )}

                <span className="flex items-baseline gap-2.5">
                  <span
                    className={`font-mono text-26 leading-none font-semibold tabular-nums ${
                      counts.error ? "text-sla" : "text-primary"
                    }`}
                  >
                    {counts.error}
                  </span>
                  <span className="text-13 text-pretty">
                    {counts.error
                      ? "คอลัมน์ที่ต้องดูก่อน"
                      : openBlocking
                        ? `คอลัมน์ไม่ติดขัด แต่การตรวจด่านแรกยังพบข้อผิดพลาด ${openBlocking} ข้อ ดูด้านล่าง`
                        : "ไม่มีคอลัมน์ที่ติดขัดและไม่พบข้อผิดพลาดจากการตรวจ รับเข้ารอบได้"}
                  </span>
                </span>

                <dl className="ml-auto flex flex-wrap gap-x-4 gap-y-1 text-12-5">
                  <Count label="พร้อมนำเข้า" value={counts.ok} tone="text-primary" />
                  <Count label="ควรดู" value={counts.warn} tone="text-warning" />
                  <Count label="ข้ามอัตโนมัติ" value={counts.skip} />
                  <Count label="ทั้งหมด" value={counts.total} />
                </dl>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-12 text-mut">เรียงตาม</span>
                <Toggle
                  active={sortMode === "file"}
                  onClick={() => setSortMode("file")}
                  label="ลำดับในไฟล์"
                />
                <Toggle
                  active={sortMode === "risk"}
                  onClick={() => setSortMode("risk")}
                  label="ปัญหามากขึ้นก่อน"
                />

                <span className="ml-2 text-12 text-mut">แสดง</span>
                <Toggle
                  active={filterMode === "all"}
                  onClick={() => setFilterMode("all")}
                  label="ทุกคอลัมน์"
                />
                <Toggle
                  active={filterMode === "issue"}
                  onClick={() => setFilterMode("issue")}
                  label="เฉพาะที่มีปัญหา"
                />

                <span className="ml-auto font-mono text-11-5 text-mut tabular-nums">
                  เลือกไว้ {selected.size}/{counts.total} คอลัมน์
                </span>
              </div>

              <ColumnList
                profile={profile}
                selected={selected}
                onToggle={toggle}
                sortMode={sortMode}
                filterMode={filterMode}
              />
            </>
          ) : null}

          {/* ─────────── ด่าน 2 — อ่านจากแถวที่เก็บไว้ ไม่ใช่จากไฟล์ในเบราว์เซอร์นี้ */}
          {hasHistory && actions ? (
            <>
              {/* **ไม่ให้แผงผลตรวจพูดแทนความจริง** — ไฟล์ที่อ่านไม่ออกไม่มีผลตรวจให้แสดง
                  และแถวที่เขียนไว้ก่อนจะมีด่าน 1 ก็ไม่มี ถ้าปล่อยให้ `ChecksPanel`
                  ขึ้นสถานะว่างของมันเอง ทั้งสองกรณีจะอ่านได้ว่า "ตรวจแล้วไม่พบอะไรผิด" */}
              {activeRecord.unreadable ? (
                <p
                  role="status"
                  className="rounded-box border border-sla/30 bg-sla/6 px-3.5 py-2.5 text-12-5 text-sla text-pretty"
                >
                  ระบบอ่านไฟล์นี้ไม่ได้ — ไฟล์ถูกเก็บไว้แล้ว เปิดดูได้จากลิงก์ด้านบน แต่ตีความ
                  เนื้อหาไม่ได้เลย จึงไม่มีผลตรวจด่านแรก ทางออกคือให้ฝ่ายส่งไฟล์ใหม่
                </p>
              ) : activeRecord.checkedAt ? (
                <ChecksPanel checks={storedChecks} />
              ) : (
                <p role="status" className="rounded-box border border-line bg-base-200/50 px-3.5 py-2.5 text-12-5 text-mut text-pretty">
                  แถวนี้ไม่มีผลตรวจด่านแรกบันทึกไว้ — ให้ฝ่ายอัปโหลดไฟล์ใหม่อีกครั้ง แล้วระบบจะตรวจ
                  และเก็บผลไว้ให้คนที่มาตรวจทีหลังอ่านได้
                </p>
              )}

              {/* จุดตัดสินของกระบวนการ — ผ่านเข้ารอบ หรือ ตีกลับให้แก้ */}
              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
                {/* บอกขนาดของไฟล์ที่กำลังตัดสิน — ไฟล์ที่อ่านไม่ออกไม่มีอะไรให้นับ
                    จึงพูดตรง ๆ ไม่ขึ้นเลขศูนย์ให้เข้าใจผิดว่าไฟล์ว่าง */}
                <span className="text-12-5 text-mut text-pretty">
                  {storedFileLine(activeRecord)} · รอบ{" "}
                  <span className="font-medium text-ink">{periodLabel(period)}</span>
                </span>

                <span className="ml-auto flex flex-wrap gap-2">
                  {actions.canReopen ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => reopen(active)}
                      className="rounded-field border border-line px-3.5 py-2 text-13 text-mut transition-colors hover:border-warning/50 hover:text-warning disabled:opacity-50"
                    >
                      เปิดใบกลับมาแก้
                    </button>
                  ) : null}

                  <button
                    type="button"
                    disabled={!actions.canReturn || saving}
                    onClick={async () => {
                      const reason = window.prompt(
                        `ตีกลับ “${active.title}” ให้ ${active.owner} แก้ — บอกให้ชัดว่าต้องแก้อะไร`,
                        brokenKey
                          ? `คอลัมน์ “${brokenKey.header}” ยังมีช่องว่าง ${brokenKey.empty} แถว`
                          : (storedChecks.find((c) => c.blocking)?.title ?? ""),
                      );
                      if (!reason?.trim()) return;
                      const saved = await save("returned", {
                        returnedReason: reason.trim(),
                      });
                      if (saved) {
                        void toastSuccess("ตีกลับแล้ว", `แจ้ง ${active.owner} ให้แก้แล้วส่งใหม่`);
                        clearFile();
                      }
                    }}
                    className="rounded-field border border-line px-3.5 py-2 text-13 text-mut transition-colors hover:border-sla/50 hover:text-sla disabled:opacity-50"
                  >
                    ตีกลับให้แก้
                  </button>

                  <button
                    type="button"
                    disabled={!actions.canApprove || saving}
                    onClick={async () => {
                      const late = lateDays(active, period, activeRecord, now);
                      /* ยังมีข้อผิดพลาดค้าง = ข้ามได้ แต่ต้องเขียนเหตุผล และเหตุผลถูกเก็บถาวร
                         กับแถวนี้ · เซิร์ฟเวอร์ตรวจซ้ำเอง ไม่เชื่อว่าหน้าจอถามมาแล้ว */
                      let overrideReason: string | undefined;
                      if (openErrors > 0) {
                        const typed = window.prompt(
                          `“${active.title}” ยังมีข้อผิดพลาด ${openErrors} ข้อจากการตรวจด่านแรก — ถ้าจะรับเข้ารอบทั้งอย่างนี้ ให้เขียนเหตุผลว่าทำไมยอดถึงใช้ได้ (ระบบเก็บไว้กับรายการนี้)`,
                        );
                        if (!typed?.trim()) {
                          void toastError(
                            "ยังไม่ได้รับเข้ารอบ",
                            "ต้องเขียนเหตุผลก่อนจึงข้ามข้อผิดพลาดได้",
                          );
                          return;
                        }
                        overrideReason = typed.trim();
                      }
                      const okToGo = await confirm({
                        title: `รับ “${active.title}” เข้ารอบ ${periodLabel(period)}`,
                        text:
                          late > 0
                            ? `ของชิ้นนี้มาช้ากว่ากำหนด ${late} วัน ระบบจะบันทึกไว้ในประวัติของรอบ`
                            : `${activeRecord.fileName ?? "ไฟล์ที่ส่งมา"} · ${(activeRecord.rows ?? 0).toLocaleString("th-TH")} แถว`,
                        confirmText: "รับเข้ารอบ",
                      });
                      if (!okToGo) return;
                      /* เขียนครั้งเดียว — สถานะ `submitted` ถูกบันทึกไว้ตอนอัปโหลดแล้ว
                         เขียนทับอีกจะรีเซ็ต `receivedAt` เป็นเวลาที่ตรวจ ทำให้
                         ของที่มาช้ากลายเป็นมาตรงกำหนดโดยไม่มีใครรู้ */
                      const saved = await save("passed", { overrideReason });
                      if (saved) {
                        void toastSuccess("รับเข้ารอบแล้ว", active.title);
                        setActive(null);
                        clearFile();
                      }
                    }}
                    className={`flex items-center gap-1.5 rounded-field px-4 py-2 text-13 font-medium transition-opacity ${
                      actions.canApprove && !saving
                        ? "bg-primary text-primary-content hover:opacity-90"
                        : "cursor-not-allowed border border-line text-mut opacity-60"
                    }`}
                  >
                    <CircleCheck size={15} strokeWidth={1.9} aria-hidden />
                    รับเข้ารอบ
                  </button>
                </span>

                {actions.note ? (
                  <p role="status" className="basis-full text-12 text-mut text-pretty">
                    {actions.note}
                  </p>
                ) : openErrors > 0 ? (
                  <p role="status" className="basis-full text-12 text-sla text-pretty">
                    ไฟล์นี้ยังมีข้อผิดพลาด {openErrors} ข้อ — ตีกลับให้แก้ที่ไฟล์ต้นทางก่อนจะดีที่สุด
                    ถ้ายืนยันว่ายอดถูกแล้ว กดรับเข้ารอบได้ แต่ต้องเขียนเหตุผลกำกับ
                  </p>
                ) : null}
              </div>

              <EventTrail events={events} />
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

/* ──────────────────────────────────────────────────────── ชิ้นเล็ก ๆ */

/**
 * บรรทัดบอกขนาดของไฟล์ที่กำลังตัดสิน
 *
 * ไฟล์ที่อ่านไม่ออกไม่มีอะไรให้นับ ถ้าขึ้น "0 แถว 0 คอลัมน์" คนอ่านจะเข้าใจว่า
 * ฝ่ายส่งไฟล์เปล่ามา ซึ่งคนละเรื่องกับไฟล์ที่เปิดไม่ได้ (สิ่งที่ต้องทำต่างกัน)
 */
function storedFileLine(record: IntakeRecord): string {
  if (record.unreadable) {
    return "ไฟล์ที่ส่งมาอ่านไม่ออก — ต้องให้ฝ่ายส่งไฟล์ใหม่ ไม่ใช่แก้ข้อมูลในไฟล์เดิม";
  }
  if (typeof record.rows !== "number") {
    return "ไฟล์นี้ไม่มีตัวเลขจากการอ่านบันทึกไว้ — เปิดไฟล์ดูก่อนตัดสิน";
  }
  return `ไฟล์ที่เก็บไว้มี ${record.rows.toLocaleString("th-TH")} แถว · ${record.columns ?? 0} คอลัมน์`;
}

/**
 * ร่องรอยการตัดสินของใบนี้ — **ตอบคำถาม “ใครอนุมัติยอดนี้ ด้วยเหตุผลอะไร”**
 *
 * แถวสถานะเก็บแต่สถานะล่าสุด ทุกการเขียนทับที่เดิม พออัปโหลดไฟล์ใหม่ลายเซ็นการผ่าน
 * ครั้งก่อนก็หายไป · คอลเลกชัน `payroll_intake_events` เก็บทุกการตัดสินแบบเพิ่มได้
 * เท่านั้น ที่นี่แสดงไม่กี่รายการล่าสุด ซึ่งพอสำหรับคนที่กำลังตรวจใบนี้อยู่
 */
function EventTrail({ events }: { events: IntakeEvent[] }) {
  if (!events.length) return null;
  return (
    <section className="flex flex-col gap-1.5 rounded-box border border-line bg-base-200/40 p-3.5">
      <h3 className="text-12-5 font-semibold text-mut">สิ่งที่เกิดขึ้นกับรายการนี้</h3>
      <ol className="flex flex-col gap-1.5">
        {events.map((event) => (
          <li
            key={`${event.at}-${event.kind}`}
            className="flex flex-col gap-0.5 text-12 text-mut"
          >
            <span className="font-mono tabular-nums">{eventLine(event)}</span>
            {event.kind === "passed" && typeof event.errors === "number" ? (
              <span>
                {event.errors > 0
                  ? `รับเข้ารอบทั้งที่ยังมีข้อผิดพลาด ${event.errors} ข้อ`
                  : "ด่านแรกไม่พบข้อผิดพลาด"}
                {event.overrideReason ? ` — เหตุผล: ${event.overrideReason}` : ""}
              </span>
            ) : null}
            {event.reason ? <span>เหตุผล: {event.reason}</span> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function StepHead({
  no,
  done,
  title,
  meta,
}: {
  no: number;
  done: boolean;
  title: string;
  meta: string;
}) {
  return (
    <div className="flex flex-1 flex-wrap items-center gap-x-2.5 gap-y-1">
      <span
        aria-hidden
        className={`flex size-6.5 flex-none items-center justify-center rounded-field font-mono text-12 font-medium ${
          done ? "bg-primary text-primary-content" : "bg-base-200 text-mut"
        }`}
      >
        {no}
      </span>
      <h2 className="text-13-5 font-semibold">{title}</h2>
      <span className="ml-auto text-12 text-mut">{meta}</span>
    </div>
  );
}

function Toggle({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-field border px-2.5 py-1 text-12-5 transition-colors ${
        active
          ? "border-ink bg-ink font-medium text-ink-content"
          : "border-line bg-base-100 text-mut hover:border-primary/40 hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

function Count({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <dt className="text-mut">{label}</dt>
      <dd className={`font-mono font-medium tabular-nums ${tone ?? "text-ink"}`}>
        {value}
      </dd>
    </span>
  );
}
