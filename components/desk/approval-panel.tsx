"use client";

import { Check, X } from "lucide-react";

import { useDeskIdentity } from "@/components/auth/identity-provider";
import { Select, type SelectOption } from "@/components/ui/field";
import { InfoTip } from "@/components/ui/info-tip";
import { formatDateTime, reviewOf } from "@/lib/case-flow";
import type { CaseReview, HrCase } from "@/lib/types";

/**
 * บล็อกผู้อนุมัติ 2 ระดับใน `CaseModal`
 *
 * รูปแบบคือ **ช่องเซ็นชื่อ** — ชื่อผู้อนุมัติตัวใหญ่วางอยู่บนเส้น มีป้ายกำกับเล็ก ๆ
 * ใต้เส้น ไม่มีกรอบการ์ดและไม่มีพื้นสี เพื่อไม่ให้แย่งสายตากับฟอร์มที่อยู่ข้างบน
 *
 * **สถานะอ่านจากสีของเส้น** (+ เครื่องหมาย ✓ / ✕ หน้าชื่อเมื่อตัดสินแล้ว)
 * ตัดสินไปแล้วหรือแก้ไม่ได้ → ไม่แสดงดรอปดาวน์เลย เหลือแค่ชื่อที่ “เซ็นไว้”
 *
 * สถานะทั้งหมด **คำนวณจาก `hrCase.reviews` + สถานะเคส** ไม่ได้เก็บเพิ่ม
 * (ระดับ 2 ยังไม่ถึงคิวจนกว่าระดับ 1 จะอนุมัติ — ตรงกับที่ NCAC บังคับไว้ฝั่ง backend)
 */

type SlotState =
  | "unset" /** ยังไม่เลือกใคร */
  | "draft" /** เลือกไว้แล้วแต่ยังไม่กดบันทึก */
  | "waiting" /** กำหนดแล้ว รอผู้รับผิดชอบส่งขออนุมัติ */
  | "queued" /** ระดับ 2 ที่ยังไม่ถึงคิว */
  | "active" /** ถึงคิวแล้ว รออีกฝ่ายตรวจ */
  | "mine" /** ถึงคิวแล้ว และคนที่ต้องกดคือผู้ใช้คนนี้ */
  | "approved"
  | "rejected";

/**
 * `line` = สีเส้นเซ็นชื่อ · `text` = สีป้ายกำกับใต้เส้น — ใช้คู่กันเสมอ
 * สถานะที่ยังไม่ต้องทำอะไรใช้สีกลาง (`line` / `mut`) เพื่อให้สถานะที่ต้องลงมือ
 * (`mine`, `draft`) กับที่ตัดสินแล้ว (`approved`, `rejected`) เด่นขึ้นมาเอง
 */
const slotMeta: Record<SlotState, { label: string; line: string; text: string }> = {
  unset: { label: "ยังไม่กำหนด", line: "border-line", text: "text-mut" },
  draft: { label: "ยังไม่บันทึก", line: "border-sla", text: "text-sla" },
  waiting: { label: "รอส่งอนุมัติ", line: "border-line", text: "text-mut" },
  queued: { label: "ยังไม่ถึงคิว", line: "border-line", text: "text-mut" },
  active: { label: "รอตรวจสอบ", line: "border-st-wait-ink/60", text: "text-mut" },
  mine: { label: "รอคุณอนุมัติ", line: "border-sla", text: "font-semibold text-sla" },
  approved: { label: "อนุมัติแล้ว", line: "border-primary", text: "text-primary" },
  rejected: { label: "ปฏิเสธ", line: "border-alert", text: "text-alert" },
};

function slotState(
  review: CaseReview | null,
  draftValue: string,
  savedValue: string,
  level: 1 | 2,
  hrCase: HrCase,
  /** รหัสพนักงานของคนที่ล็อกอินอยู่ — ตัวชี้ขาดว่าช่องนี้คือ “รอคุณอนุมัติ” หรือไม่ */
  viewerId: string,
): SlotState {
  if (draftValue !== savedValue) return "draft";
  if (!review) return "unset";
  if (review.status === "approved") return "approved";
  if (review.status === "rejected") return "rejected";

  // pending — ถึงคิวหรือยัง
  if (level === 2 && reviewOf(hrCase, 1)?.status !== "approved") return "queued";
  if (hrCase.status !== "pending_review") return "waiting";
  return review.reviewerId === viewerId ? "mine" : "active";
}

/** ต่อท้ายป้ายกำกับ — มีแค่ตอนตัดสินไปแล้ว (วันเวลาที่เซ็น) */
function slotStamp(state: SlotState, review: CaseReview | null): string | null {
  return state === "approved" || state === "rejected"
    ? formatDateTime(review?.reviewedAt ?? null)
    : null;
}

export function ApprovalPanel({
  hrCase,
  options,
  draft,
  saved,
  onChange,
  readOnly,
}: {
  hrCase: HrCase;
  /** รายชื่อผู้มีสิทธิ์อนุมัติ — label เป็น `ชื่อ · Manager` */
  options: SelectOption[];
  draft: Record<1 | 2, string>;
  saved: Record<1 | 2, string>;
  onChange: (level: 1 | 2, value: string) => void;
  readOnly: boolean;
}) {
  const l1 = reviewOf(hrCase, 1);
  const l2 = reviewOf(hrCase, 2);

  const rejected = [l1, l2].find((r) => r?.status === "rejected");
  const approved = [l1, l2].filter((r) => r?.status === "approved").length;

  return (
    <section className="flex flex-col gap-4 border-t border-line pt-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5">
          <h4 className="text-[13.5px] font-semibold">การอนุมัติ</h4>
          <InfoTip label="วิธีกำหนดผู้อนุมัติ">
            แจ้งให้<span className="font-semibold text-ink">หัวหน้า</span>
            รับทราบเรื่องก่อน แล้วใส่ชื่อไว้เป็นผู้อนุมัติระดับ 1
            <br />
            ถ้ามีผู้อนุมัติที่เกี่ยวข้องอีกคน ใส่เป็น
            <span className="font-semibold text-ink">ระดับ 2</span> เพื่อส่งอนุมัติต่อ
          </InfoTip>
        </span>

        <p
          className={`text-[12px] font-medium ${
            rejected ? "text-alert" : approved ? "text-primary" : "text-mut"
          }`}
        >
          {rejected ? `${rejected.reviewerName} ปฏิเสธ` : `อนุมัติแล้ว ${approved}/2`}
        </p>
      </div>

      <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
        {([1, 2] as const).map((level) => (
          <Slot
            key={level}
            level={level}
            hrCase={hrCase}
            review={level === 1 ? l1 : l2}
            options={options}
            draftValue={draft[level]}
            savedValue={saved[level]}
            onChange={onChange}
            readOnly={readOnly}
          />
        ))}
      </div>
    </section>
  );
}

function Slot({
  level,
  hrCase,
  review,
  options,
  draftValue,
  savedValue,
  onChange,
  readOnly,
}: {
  level: 1 | 2;
  hrCase: HrCase;
  review: CaseReview | null;
  options: SelectOption[];
  draftValue: string;
  savedValue: string;
  onChange: (level: 1 | 2, value: string) => void;
  readOnly: boolean;
}) {
  const me = useDeskIdentity();
  const state = slotState(review, draftValue, savedValue, level, hrCase, me.employeeId);
  const meta = slotMeta[state];
  const stamp = slotStamp(state, review);

  /* ผู้อนุมัติที่ถูกกำหนดไว้แล้วอาจไม่อยู่ในรายชื่อที่มีสิทธิ์ตอนนี้ (ย้ายตำแหน่ง/ลาออก)
     — เติมเข้าไปเองไม่งั้นดรอปดาวน์จะขึ้น placeholder ทั้งที่มีคนกำหนดไว้แล้ว */
  const list =
    review && !options.some((o) => o.value === review.reviewerId)
      ? [
          ...options,
          {
            value: review.reviewerId,
            label: `${review.reviewerName} · ${review.reviewerPosition}`,
          },
        ]
      : options;

  // ตัดสินไปแล้วห้ามเปลี่ยนตัว — แก้ได้อีกทีเมื่อเคสถูกส่งกลับมาแก้แผน
  const settled = state === "approved" || state === "rejected";
  const editable = !readOnly && !settled && options.length > 0;
  const signed = list.find((o) => o.value === draftValue)?.label ?? null;

  return (
    <div className="flex flex-col gap-1.5">
      {/* เส้นเซ็นชื่อ — ชื่อวางอยู่บนเส้น สีของเส้นคือสถานะ */}
      <div
        className={`flex min-h-9 items-center gap-2 border-b-[1.5px] pb-1 transition-colors ${meta.line} ${
          editable ? "hover:border-primary" : ""
        }`}
      >
        {settled ? (
          <span
            aria-hidden
            className={`flex-none ${state === "approved" ? "text-primary" : "text-alert"}`}
          >
            {state === "approved" ? (
              <Check size={17} strokeWidth={2.4} />
            ) : (
              <X size={17} strokeWidth={2.4} />
            )}
          </span>
        ) : null}

        {editable ? (
          <Select
            id={`approverL${level}`}
            label={`ผู้อนุมัติระดับ ${level}`}
            value={draftValue}
            onChange={(v) => onChange(level, v)}
            options={list}
            variant="sign"
            required={level === 1}
            placeholder={level === 1 ? "เลือกผู้อนุมัติ…" : "เลือกผู้อนุมัติ… (ถ้ามี)"}
          />
        ) : (
          <p
            className={`min-w-0 flex-1 truncate text-[15.5px] font-medium ${
              signed ? "" : "text-[13px] font-normal text-mut"
            }`}
          >
            {signed ?? (options.length ? "ไม่ได้กำหนด" : "โหลดรายชื่อไม่สำเร็จ")}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-[12px]">
        {/* ระดับ 1 บังคับ · ระดับ 2 ใส่เมื่อมีผู้อนุมัติที่เกี่ยวข้องอีกคน จึงไม่มีดอกจัน */}
        <span className="text-mut">
          ผู้อนุมัติระดับ {level}
          {level === 1 ? <span aria-hidden className="text-alert"> *</span> : null}
        </span>
        <span className={meta.text}>
          {meta.label}
          {stamp ? <span className="text-mut"> · {stamp}</span> : null}
        </span>
      </div>

      {review?.remark ? (
        <p
          className={`text-[12px] text-pretty ${
            state === "rejected" ? "text-alert" : "text-mut"
          }`}
        >
          “{review.remark}”
        </p>
      ) : null}
    </div>
  );
}
