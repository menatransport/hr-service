"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Lock, X } from "lucide-react";

import { useDeskIdentity } from "@/components/auth/identity-provider";
import { ApprovalPanel } from "@/components/desk/approval-panel";
import { AttachmentGallery } from "@/components/ui/attachment-gallery";
import { Avatar } from "@/components/ui/avatar";
import { CaseStepper } from "@/components/ui/case-stepper";
import {
  NumberField,
  SelectField,
  TextareaField,
  isDropdownOpen,
  type SelectGroupOption,
  type SelectOption,
} from "@/components/ui/field";
import {
  buildTimeline,
  canEditSection,
  departmentLabel,
  formatDateTime,
  isPendingFor,
  statusMeta,
} from "@/lib/case-flow";
import { complaintTypesFor, reasonGroups } from "@/lib/data";
import { requestJson } from "@/lib/http";
import { escapeHtml, runAction, type ConfirmOptions } from "@/lib/swal";
import type { Approver, DepartmentId, HrCase } from "@/lib/types";

/* ---------------------------------------------------------------- draft */

/**
 * ไม่มีช่อง “ปัญหาที่พบ” (`problem` ของ NCAC) โดยตั้งใจ — เจ้าของงานยืนยันว่าคำตอบ
 * ของหัวข้อนั้นถูกเก็บอยู่ใน “ประเภทเรื่อง” แล้ว จึงไม่ต้องให้ PIC กรอกซ้ำ
 */
interface Draft {
  complaintType: string;
  rootCause: string;
  solution: string;
  result: string;
  damageCost: number | null;
  approverL1: string;
  approverL2: string;
}

/**
 * “ประเภทเรื่อง” ผูกกับหน่วยงานผู้รับผิดชอบ (`complaintTypesFor`) — พอเคสถูกย้าย
 * หน่วยงานจากในตาราง ค่าที่เลือกไว้เดิมมักไม่มีอยู่ในรายการของหน่วยงานใหม่
 *
 * ถ้าปล่อยไว้ dropdown จะหาป้ายของค่านั้นไม่เจอ กลายเป็นช่องว่างเปล่าทั้งที่ NCAC
 * ยังเก็บค่าเดิมอยู่ — หน้าจอโกหก จึงตัดทิ้งตั้งแต่ตอนสร้าง draft แล้วให้ PIC เลือกใหม่
 * (ค่าใน NCAC จะถูกล้างจริงตอนกดบันทึกครั้งถัดไป เพราะ `nullable("")` = `null`)
 */
const typeFitsDepartment = (c: HrCase) =>
  !c.complaintType ||
  complaintTypesFor(c.departmentId as DepartmentId | null).some(
    (t) => t.value === c.complaintType,
  );

const draftOf = (c: HrCase): Draft => ({
  complaintType: typeFitsDepartment(c) ? (c.complaintType ?? "") : "",
  rootCause: c.rootCause ?? "",
  solution: c.solution ?? "",
  result: c.result ?? "",
  damageCost: c.damageCost,
  approverL1: c.reviews.find((r) => r.level === 1)?.reviewerId ?? "",
  approverL2: c.reviews.find((r) => r.level === 2)?.reviewerId ?? "",
});

const DRAFT_KEYS: (keyof Draft)[] = [
  "complaintType",
  "rootCause",
  "solution",
  "result",
  "damageCost",
  "approverL1",
  "approverL2",
];

/** ป้ายของแต่ละช่อง — ใช้บอกในกล่องยืนยันว่ากำลังจะบันทึกอะไรบ้าง */
const FIELD_LABEL: Record<keyof Draft, string> = {
  complaintType: "ประเภทเรื่อง",
  rootCause: "สาเหตุหลัก",
  solution: "แนวทางแก้ไข",
  result: "ผลการดำเนินการ",
  damageCost: "ความเสียหาย",
  approverL1: "ผู้อนุมัติระดับ 1",
  approverL2: "ผู้อนุมัติระดับ 2",
};

/** ช่องที่ส่งเป็น `null` ได้เมื่อผู้ใช้ล้างค่า — ฝั่ง API รับ null แปลว่า “ลบค่า” */
const nullable = (v: string) => (v.trim() ? v.trim() : null);

const rootCauseGroups: SelectGroupOption[] = reasonGroups.map((g) => ({
  label: `${g.label} (${g.code})`,
  options: g.items.map((i) => ({ value: i, label: i })),
}));

/* ---------------------------------------------------------------- modal */

export function CaseModal({
  hrCase,
  approvers,
}: {
  hrCase: HrCase;
  /** ผู้มีสิทธิ์อนุมัติจาก NCAC `/users` (ระดับ ≥ 4) — server ดึงมาให้แล้ว */
  approvers: Approver[];
}) {
  const router = useRouter();
  const me = useDeskIdentity();
  const dialog = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);

  const [saved, setSaved] = useState<Draft>(() => draftOf(hrCase));
  const [draft, setDraft] = useState<Draft>(() => draftOf(hrCase));
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<"approve" | "reject" | null>(
    null,
  );
  const [remark, setRemark] = useState("");

  const close = useCallback(() => router.push("/desk"), [router]);

  // Esc ปิด · ล็อกไม่ให้หน้าหลังเลื่อน · โฟกัสเข้ามาในกล่อง
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // dropdown เปิดอยู่ → Esc ครั้งนี้เป็นของ dropdown เท่านั้น (Radix ไม่ได้
      // หยุด event ให้ ถ้าไม่กันตรงนี้ modal จะปิดตามไปด้วยในการกดครั้งเดียว)
      if (isDropdownOpen()) return;
      close();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // preventScroll กันเบราว์เซอร์เลื่อนเนื้อใน modal ลงตอนโฟกัส
    dialog.current?.focus({ preventScroll: true });
    if (body.current) body.current.scrollTop = 0;
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [close]);

  /**
   * เมื่อเซิร์ฟเวอร์ส่งเคสเวอร์ชันใหม่มา (หลัง `router.refresh()`)
   * ให้ฟอร์มยึดค่าจากเซิร์ฟเวอร์เป็นหลัก — กันไม่ให้หน้าจอค้างค่าที่บันทึกไปแล้ว
   *
   * ปรับ state ระหว่าง render ไม่ใช่ใน effect — React จะ render ใหม่ทันทีก่อนวาดจอ
   * จึงไม่มีเฟรมที่โชว์ค่าเก่า (ดู “adjusting state when a prop changes”)
   */
  const version = `${hrCase.trackingNo}|${hrCase.updatedAt}`;
  const [syncedTo, setSyncedTo] = useState(version);
  if (syncedTo !== version) {
    const fresh = draftOf(hrCase);
    setSyncedTo(version);
    setSaved(fresh);
    setDraft(fresh);
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const changed = useMemo(
    () => DRAFT_KEYS.filter((k) => draft[k] !== saved[k]),
    [draft, saved],
  );
  const dirty = changed.length > 0;

  const canApprove = isPendingFor(hrCase, me.employeeId);
  const canClose = hrCase.status === "ready_to_close";

  /**
   * เคสที่ยังไม่มีหน่วยงานผู้รับผิดชอบทำให้ทั้งบล็อก 2 ถูกล็อก (กฎอยู่ใน
   * `canEditSection`) — แยกตัวแปรไว้เพราะข้อความที่ต้องบอกผู้ใช้คนละเรื่องกับ
   * การล็อกเพราะสถานะ
   */
  const unassigned = !hrCase.departmentId;
  const locked = !canEditSection(
    "actionPlan",
    hrCase.status,
    me.departmentId,
    hrCase.departmentId,
  );

  const typeOptions: SelectOption[] = complaintTypesFor(
    hrCase.departmentId as DepartmentId | null,
  ).map((t) => ({ value: t.value, label: t.value }));

  /** ค่าที่ `draftOf` ตัดทิ้งไปเพราะหน่วยงานเปลี่ยน — ต้องบอกให้ PIC รู้ว่าทำไมช่องว่าง */
  const staleType = Boolean(hrCase.complaintType) && !typeFitsDepartment(hrCase);

  /** ชื่อ + ระดับตำแหน่งภาษาอังกฤษเท่านั้น (`สมชาย ใจดี · Manager`) — ชื่อตำแหน่งเต็ม
      ยาวและซ้ำกันจนไล่ด้วยตาไม่ไหว ระดับบอกอำนาจอนุมัติได้ตรงกว่า */
  const approverOptions: SelectOption[] = approvers.map((a) => ({
    value: a.employeeId,
    label: `${a.name} · ${a.levelLabel}`,
  }));

  /**
   * ตัวกลางของทุกคำสั่งที่ยิงจริง — ถาม → ยิง → บอกผล → รีเฟรช ที่เดียว
   *
   * ตัวถาม/ตัวบอกผลทั้งหมดอยู่ใน `lib/swal.ts` แล้ว ที่นี่เหลือแค่ `busy`
   * ซึ่งฟุตเตอร์ยังต้องใช้ล็อกฟอร์มระหว่างรอ
   *
   * `busy` ถูกยกขึ้นเฉพาะ **ช่วงที่ยิงจริง** ไม่ใช่ตั้งแต่ตอนเปิดกล่องถาม —
   * ไม่งั้นฟุตเตอร์จะขึ้น “กำลังบันทึก…” ทั้งที่ผู้ใช้ยังไม่ได้กดยืนยันเลย
   */
  async function run(
    request: () => Promise<unknown>,
    opts: { confirm: ConfirmOptions; pending: string; success: string },
    after?: () => void,
  ) {
    const out = await runAction({
      ...opts,
      run: async () => {
        setBusy(true);
        try {
          return await request();
        } finally {
          setBusy(false);
        }
      },
    });
    if (out.status !== "done") return;
    after?.();
    router.refresh();
  }

  const endpoint = `/api/cases/${encodeURIComponent(hrCase.trackingNo)}`;

  function save() {
    const payload: Record<string, unknown> = {};
    if (changed.includes("complaintType"))
      payload.complaintType = nullable(draft.complaintType);
    if (changed.includes("rootCause")) payload.rootCause = nullable(draft.rootCause);
    if (changed.includes("solution")) payload.solution = nullable(draft.solution);
    if (changed.includes("result")) payload.result = nullable(draft.result);
    if (changed.includes("damageCost")) payload.damageCost = draft.damageCost;
    if (changed.includes("approverL1")) payload.approverL1 = draft.approverL1;
    if (changed.includes("approverL2")) payload.approverL2 = draft.approverL2;

    const count = changed.length;
    void run(
      () => requestJson(endpoint, { method: "PATCH", body: payload }, "บันทึกไม่สำเร็จ"),
      {
        // ลิสต์ช่องที่กำลังจะเปลี่ยนจริง ๆ — ถามว่า “แน่ใจไหม” เฉย ๆ ไม่ช่วยให้ใครตัดสินใจได้
        confirm: {
          title: `บันทึก ${count} รายการที่แก้ไข?`,
          html: `<span class="hrs-swal-list">${changed
            .map((k) => FIELD_LABEL[k])
            .join(" · ")}</span>`,
          confirmText: "บันทึก",
        },
        pending: "กำลังบันทึก…",
        success: `บันทึกแล้ว ${count} รายการ`,
      },
      () => setSaved(draft),
    );
  }

  function confirmAction() {
    if (!pendingAction || !remark.trim()) return;
    const action = pendingAction;
    const approve = action === "approve";
    const reason = remark.trim();

    void run(
      () =>
        requestJson(
          `${endpoint}/review`,
          // ไม่ต้องส่งว่าเราเป็นใคร — route อ่านจากคุกกี้ session เอง
          // (ค่าที่ client บอกว่าตัวเองเป็นใคร ใช้ลงลายเซ็นใน log ไม่ได้)
          { method: "POST", body: { action, remark: reason } },
          approve ? "อนุมัติไม่สำเร็จ" : "ปฏิเสธไม่สำเร็จ",
        ),
      {
        /* ทวนหมายเหตุที่พิมพ์ไว้ให้เห็นอีกครั้ง — ตัดสินไปแล้วเปลี่ยนตัวผู้อนุมัติไม่ได้อีก */
        confirm: {
          title: approve ? `อนุมัติแผนแก้ไขของ ${hrCase.trackingNo}?` : `ปฏิเสธแผนแก้ไขของ ${hrCase.trackingNo}?`,
          html: `${
            approve
              ? "เคสจะเปลี่ยนเป็น “รอปิดเคส” และแก้ไขแผนไม่ได้อีก"
              : "เคสจะถูกส่งกลับให้ผู้รับผิดชอบแก้ไขแผน"
          }<span class="hrs-swal-quote">${escapeHtml(reason)}</span>`,
          confirmText: approve ? "ยืนยันอนุมัติ" : "ยืนยันปฏิเสธ",
          tone: approve ? "primary" : "danger",
        },
        pending: approve ? "กำลังส่งการอนุมัติ…" : "กำลังส่งการปฏิเสธ…",
        success: approve
          ? "อนุมัติเรียบร้อย — เคสเปลี่ยนเป็น “รอปิดเคส”"
          : "ปฏิเสธเรียบร้อย — ส่งกลับให้ผู้รับผิดชอบแก้ไขแผน",
      },
      () => {
        setPendingAction(null);
        setRemark("");
      },
    );
  }

  function closeCase() {
    void run(
      () =>
        requestJson(
          `${endpoint}/close`,
          { method: "POST", body: {} },
          "ปิดเคสไม่สำเร็จ",
        ),
      {
        confirm: {
          title: `ปิดเคส ${hrCase.trackingNo}?`,
          text: "ปิดแล้วเคสจะออกจากคิวงานและแก้ไขข้อมูลไม่ได้อีก",
          confirmText: "ปิดเคส",
          tone: "warn",
        },
        pending: "กำลังปิดเคส…",
        success: "ปิดเคสเรียบร้อย",
      },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        aria-label="ปิดหน้ารายละเอียดเคส"
        onClick={close}
        className="absolute inset-0 cursor-default bg-ink/45 backdrop-blur-[2px]"
      />

      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="case-modal-title"
        tabIndex={-1}
        className="relative flex max-h-[94dvh] w-full max-w-[1080px] flex-col overflow-hidden rounded-[18px] border border-line bg-canvas shadow-[0_32px_80px_-24px_rgba(21,32,29,0.45)] outline-none animate-rise"
      >
        {/* หัว */}
        <header className="flex flex-none items-center gap-4 border-b border-line bg-base-100 px-5 py-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h2
              id="case-modal-title"
              className="text-lg leading-snug font-semibold text-pretty"
            >
           เรื่อง :   {hrCase.subject} 
                &nbsp;({hrCase.trackingNo})
            </h2>
          </div>

          <button
            type="button"
            onClick={close}
            aria-label="ปิด"
            className="flex size-9 flex-none items-center justify-center rounded-selector text-mut transition-colors hover:bg-base-200 hover:text-ink"
          >
            <X size={19} strokeWidth={1.9} aria-hidden />
          </button>
        </header>

        {/* กลาง */}
        <div
          ref={body}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5"
        >
          {/* ผล “สำเร็จ/ล้มเหลว” ไม่ได้อยู่ในนี้แล้ว — ไปอยู่ที่กล่องของ `lib/swal.ts`
              ซึ่งลอยเหนือโมดัล จึงเห็นได้โดยไม่ต้องเลื่อนกลับขึ้นมาบนสุด */}

          {/* ถึงไหนแล้ว + ต้องทำอะไร รวมอยู่ในแถบเดียว */}
          <CaseStepper steps={buildTimeline(hrCase)} compact />

          <div className="grid gap-4 lg:grid-cols-[330px_minmax(0,1fr)]">
            {/* บล็อก 1 · เรื่องที่ พจส. แจ้งมา */}
            <Card title="รายละเอียดเคสจาก พจส.">
              <div className="flex items-center gap-3 rounded-field bg-base-200 px-3 py-2.5">
                <Avatar name={hrCase.driverName} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium">
                    {hrCase.driverName}
                  </p>
                  <p className="truncate text-[11.5px] text-mut">
                    {/* สังกัดว่างเมื่อ พจส. ไม่มีใน `/users` — แสดงแค่รหัสก็พอ */}
                    {[hrCase.driverId, hrCase.driverMeta].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>

              {/*
               * ไม่มี “กลุ่มเรื่อง” โดยตั้งใจ — NCAC ไม่ได้ส่งฟิลด์นี้มา ระบบเดาจาก
               * `root_cause` ซึ่งก็คือช่อง “สาเหตุหลัก” ในบล็อก 2 (ดรอปดาวน์จัดกลุ่ม
               * ด้วย `reasonGroups` อยู่แล้ว) จึงเป็นข้อมูลซ้ำ
               */}
              <dl className="flex flex-col gap-1 text-[12.5px]">
                <Row label="แจ้งเมื่อ">{formatDateTime(hrCase.createdAt)}</Row>
                <Row label="ผู้รับผิดชอบ">
                  {departmentLabel(hrCase.departmentId)}
                </Row>
              </dl>

              {/*
               * เรื่องที่ พจส. เล่ามาเป็น “คำพูด” ไม่ใช่ฟิลด์ข้อมูล — จัดเป็นฟองแชท
               * หางชี้ขึ้นไปที่บล็อกข้อมูลผู้แจ้งด้านบน จึงไม่ต้องมีอวาตาร์ซ้ำ
               * ฟองไม่มีขอบโดยตั้งใจ ขอบจะตัดผ่านฐานหางเป็นรอยต่อ
               */}
              {hrCase.detail ? (
                <blockquote className="group/say relative rounded-[14px] bg-soft px-4 py-3.5 transition-colors duration-200 hover:bg-primary/15">
                  <span
                    aria-hidden
                    className="absolute -top-1.25 left-6 size-2.5 rotate-45 rounded-xs bg-soft transition-colors duration-200 group-hover/say:bg-primary/15"
                  />
                  <p className="relative text-[16px] leading-[1.7] text-pretty">
                    {/*
                     * อัญประกาศคู่เขียนเป็น entity ไม่ใช่ตัวอักษรดิบ — เคยหายไป
                     * ตอนไฟล์ถูกบันทึกข้ามเอนโค้ดจนเหลือ span ว่าง
                     */}
                    <span aria-hidden className="font-serif text-primary/45">
                      &ldquo; 
                    </span>
                    {hrCase.detail}
                    <span aria-hidden className="font-serif text-primary/45">
                      &rdquo;
                    </span>
                  </p>
                </blockquote>
              ) : (
                <p className="rounded-field border border-dashed border-line px-3 py-2.5 text-center text-[12.5px] text-mut">
                  — ไม่มีรายละเอียดเพิ่มเติม —
                </p>
              )}

              {hrCase.attachments.length ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11.5px] text-mut">
                    ไฟล์แนบ ({hrCase.attachments.length})
                  </span>
                  <AttachmentGallery urls={hrCase.attachments} />
                </div>
              ) : null}

              {hrCase.notes.length ? (
                <div className="flex flex-col gap-2 border-t border-line pt-3">
                  {hrCase.notes.map((note, i) => (
                    <div key={i} className="flex flex-col gap-0.5">
                      <span className="text-[11.5px] text-mut">
                        {note.author} · {formatDateTime(note.at)}
                      </span>
                      <p className="text-[12.5px] text-pretty">{note.body}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </Card>

            {/* บล็อก 2 · กรอกข้อมูล */}
            <Card
              title="กรอกข้อมูลแผนดำเนินการ"
              badge={
                locked ? (
                  <span className="flex items-center gap-1.5 rounded-full bg-base-200 px-2 py-[2px] text-[11px] text-mut">
                    <Lock size={11} strokeWidth={2} aria-hidden />
                    {unassigned ? "รอมอบหมายหน่วยงาน" : "แก้ไขไม่ได้"}
                  </span>
                ) : null
              }
            >
              {unassigned ? (
                <p className="flex items-start gap-2 rounded-field border border-line bg-base-200 px-3 py-2.5 text-[12px] leading-[1.7] text-mut text-pretty">
                  <Lock
                    size={14}
                    strokeWidth={1.8}
                    aria-hidden
                    className="mt-0.5 flex-none"
                  />
                  <span>
                    ยังไม่ได้มอบหมายหน่วยงาน — ฟอร์มนี้ล็อกอยู่ทั้งหมด
                    มอบหมายผู้รับผิดชอบจากตารางเคสก่อนจึงจะกรอกได้
                  </span>
                </p>
              ) : (
                <div className="flex items-center gap-2 rounded-field px-3 py-2.5 text-[15px]">
                  <span className="text-mut">ผู้รับผิดชอบเคสนี้</span>
                  <span className="font-semibold text-primary underline decoration-primary underline-offset-2">
                    {departmentLabel(hrCase.departmentId)}
                  </span>
                </div>
              )}

              <div className="grid gap-3.5 md:grid-cols-2">
                <SelectField
                  id="complaintType"
                  label="ประเภทเรื่อง"
                  value={draft.complaintType}
                  onChange={(v) => set("complaintType", v)}
                  placeholder={unassigned ? "รอมอบหมายหน่วยงาน" : "เลือก…"}
                  hint={
                    staleType
                      ? "ประเภทเดิมไม่มีในรายการของหน่วยงานนี้ — เลือกใหม่แล้วกดบันทึก"
                      : undefined
                  }
                  readOnly={locked || busy}
                  options={typeOptions}
                  clearable
                />
                <SelectField
                  id="rootCause"
                  label="สาเหตุหลัก"
                  value={draft.rootCause}
                  onChange={(v) => set("rootCause", v)}
                  placeholder="เลือก…"
                  readOnly={locked || busy}
                  groups={rootCauseGroups}
                  clearable
                />
              </div>

              <TextareaField
                id="solution"
                label="แผนแก้ไข"
                value={draft.solution}
                onChange={(v) => set("solution", v)}
                placeholder="จะทำอะไร ใครทำ เสร็จเมื่อไหร่"
                readOnly={locked || busy}
                rows={3}
              />

              <div className="grid gap-3.5 md:grid-cols-[minmax(0,1fr)_170px]">
                <TextareaField
                  id="result"
                  label="ผลการดำเนินงาน"
                  value={draft.result}
                  onChange={(v) => set("result", v)}
                  placeholder="ทำอะไรไปแล้ว ผลเป็นอย่างไร"
                  readOnly={locked || busy}
                  optional
                  rows={1}
                />
                <NumberField
                  id="damageCost"
                  label="ความเสียหาย (บาท)"
                  value={draft.damageCost}
                  onChange={(v) => set("damageCost", v)}
                  placeholder="0"
                  readOnly={locked || busy}
                  optional
                />
              </div>

              <ApprovalPanel
                hrCase={hrCase}
                options={approverOptions}
                draft={{ 1: draft.approverL1, 2: draft.approverL2 }}
                saved={{ 1: saved.approverL1, 2: saved.approverL2 }}
                onChange={(level, v) =>
                  set(level === 1 ? "approverL1" : "approverL2", v)
                }
                readOnly={locked || busy}
              />
            </Card>
          </div>
        </div>

        {/* ท้าย — ปุ่มบันทึกและปุ่มตัดสินใจอยู่ที่นี่ที่เดียว */}
        <footer className="flex flex-none flex-col gap-3 border-t border-line bg-base-100 px-5 py-3.5">
          {pendingAction ? (
            <TextareaField
              id="remark"
              label={
                pendingAction === "approve"
                  ? "หมายเหตุการอนุมัติ"
                  : "เหตุผลที่ปฏิเสธ"
              }
              value={remark}
              onChange={setRemark}
              placeholder="ระบุเหตุผลสั้น ๆ…"
              readOnly={busy}
              rows={2}
            />
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12.5px] text-mut">
              {busy ? (
                "กำลังบันทึก…"
              ) : dirty ? (
                <span className="text-sla">
                  ยังไม่ได้บันทึก {changed.length} รายการ
                </span>
              ) : hrCase.status === "closed" ? (
                `ปิดโดย ${hrCase.closedBy ?? "—"} · ${formatDateTime(hrCase.closedAt)}`
              ) : (
                `สถานะ “${statusMeta[hrCase.status].label}”`
              )}
            </p>

            <div className="flex flex-wrap items-center gap-2">
              {pendingAction ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setPendingAction(null);
                      setRemark("");
                    }}
                    className="rounded-field border border-line px-3.5 py-2 text-[13px] text-mut hover:text-ink disabled:opacity-40"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    onClick={confirmAction}
                    disabled={busy || !remark.trim()}
                    className={`flex items-center gap-1.5 rounded-field px-4 py-2 text-[13px] font-medium transition-opacity disabled:opacity-40 ${
                      pendingAction === "approve"
                        ? "bg-primary text-primary-content"
                        : "bg-alert text-ink-content"
                    }`}
                  >
                    <Check size={15} strokeWidth={2.2} aria-hidden />
                    ยืนยัน{pendingAction === "approve" ? "อนุมัติ" : "ปฏิเสธ"}
                  </button>
                </>
              ) : (
                <>
                  {dirty ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setDraft(saved)}
                      className="rounded-field border border-line px-3.5 py-2 text-[13px] text-mut hover:text-ink disabled:opacity-40"
                    >
                      ล้างที่แก้
                    </button>
                  ) : null}

                  {canApprove ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setPendingAction("reject")}
                        className="rounded-field border border-alert/40 px-3.5 py-2 text-[13px] font-medium text-alert hover:bg-alert/5 disabled:opacity-40"
                      >
                        ปฏิเสธ
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setPendingAction("approve")}
                        className="rounded-field border border-primary/45 px-3.5 py-2 text-[13px] font-medium text-primary hover:bg-soft disabled:opacity-40"
                      >
                        อนุมัติแผนแก้ไข
                      </button>
                    </>
                  ) : null}

                  {canClose ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={closeCase}
                      className="rounded-field border border-primary/45 px-3.5 py-2 text-[13px] font-medium text-primary hover:bg-soft disabled:opacity-40"
                    >
                      ปิดเคส
                    </button>
                  ) : null}

                  {/* ปุ่มบันทึกเดียวของทั้งหน้า */}
                  <button
                    type="button"
                    onClick={save}
                    disabled={!dirty || busy}
                    className="rounded-field bg-primary px-5 py-2 text-[13px] font-medium text-primary-content transition-opacity disabled:opacity-40"
                  >
                    บันทึก
                  </button>
                </>
              )}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- ส่วนประกอบเล็ก */

function Card({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex h-fit flex-col gap-3.5 rounded-box border border-line bg-base-100 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[13.5px] font-semibold">{title}</h3>
        {badge}
      </div>
      {children}
    </section>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-[74px] flex-none text-mut">{label}</dt>
      <dd className="min-w-0 flex-1 text-pretty">{children}</dd>
    </div>
  );
}
