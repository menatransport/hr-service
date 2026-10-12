"use client";

import { ChevronDown, Download, TriangleAlert } from "lucide-react";

import {
  emptyRecord,
  lateDays,
  needsChasing,
  STAGE_LABEL,
  STAGE_TONE,
  STAGE_URGENCY,
  tallyOwner,
  type IntakeRecord,
} from "@/lib/payroll/intake-status";
import { kindOf, type ItemKind } from "@/lib/payroll/classify";
import type { IntakeItem, IntakeOwner } from "@/lib/payroll/registry";
import { dueDaysOf } from "@/lib/payroll/registry";
import type { PeriodRef } from "@/lib/payroll/period";

/**
 * หนึ่งเจ้าของข้อมูล = หนึ่งกล่อง — แถวข้างในคือของที่ฝ่ายนั้นต้องส่งในรอบนี้
 *
 * **จัดกลุ่มตามคนที่ต้องตาม ไม่ใช่ตามประเภทเงิน** เพราะงานจริงของคนทำเงินเดือนคือ
 * โทรตามเป็นรายฝ่าย ไม่ใช่ไล่ทีละรายการข้ามฝ่ายไปมา · ข้อมูลยืนยันเรื่องนี้ด้วย:
 * อัตราส่งตรงกำหนดเกาะกลุ่มตามฝ่ายชัดมาก (ยานยนต์ 0% · HR C&B 54%)
 *
 * **หัวกล่องบอกจำนวนที่ต้องตามก่อนบอกความคืบหน้า** — คนเปิดหน้านี้มาหาว่า
 * “เหลือตามใครบ้าง” ไม่ได้มาหาว่า “ทำไปกี่เปอร์เซ็นต์แล้ว”
 */
export function OwnerGroup({
  owner,
  items,
  period,
  records,
  now,
  open,
  onToggle,
  activeId,
  onPick,
  templateHref,
}: {
  owner: IntakeOwner;
  items: IntakeItem[];
  period: PeriodRef;
  records: Map<string, IntakeRecord>;
  now: Date;
  open: boolean;
  onToggle: () => void;
  activeId: string | null;
  onPick: (item: IntakeItem) => void;
  /** ลิงก์ดาวน์โหลดแบบฟอร์มของรายการหนึ่ง */
  templateHref: (item: IntakeItem) => string;
}) {
  const sum = tallyOwner(items, period, records, now);
  const dueDays = dueDaysOf(owner);

  /* ของที่ต้องตามขึ้นก่อนเสมอ ของที่ผ่านแล้วไปท้าย — ลำดับในทะเบียนไม่ช่วยอะไร
     เมื่อเหลือของต้องตามอยู่ 3 ชิ้นในกลุ่มที่มี 12 รายการ */
  const sorted = [...items].sort((a, b) => {
    const ra = records.get(a.id) ?? emptyRecord(a.id);
    const rb = records.get(b.id) ?? emptyRecord(b.id);
    const byStage = STAGE_URGENCY[ra.stage] - STAGE_URGENCY[rb.stage];
    if (byStage !== 0) return byStage;
    const la = lateDays(a, period, ra, now);
    const lb = lateDays(b, period, rb, now);
    if (la !== lb) return lb - la;
    return a.id.localeCompare(b.id);
  });

  return (
    <section className="overflow-hidden rounded-box border border-line bg-base-100">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-left transition-colors hover:bg-base-200/50"
      >
        <ChevronDown
          size={15}
          strokeWidth={2}
          aria-hidden
          className={`flex-none text-mut transition-transform ${open ? "" : "-rotate-90"}`}
        />

        <h2 className="text-13-5 font-semibold">{owner}</h2>

        <span className="font-mono text-11-5 text-mut tabular-nums">
          กำหนดส่งวันที่ {dueDays.join(" และ ")}
        </span>

        {sum.chasing > 0 ? (
          <span className="flex items-center gap-1 rounded-field bg-sla/12 px-2 py-0.5 text-12 font-medium text-sla">
            <TriangleAlert size={12} strokeWidth={2} aria-hidden />
            ต้องตาม {sum.chasing}
          </span>
        ) : null}

        {/* คนละตัวนับกับ “ต้องตาม” — อันนี้ลูกบอลอยู่ที่ HR ไม่ใช่ที่ฝ่ายนี้ */}
        {sum.awaitingReview > 0 ? (
          <span className="rounded-field bg-warning/15 px-2 py-0.5 text-12 font-medium text-warning">
            รอตรวจ {sum.awaitingReview}
          </span>
        ) : null}

        <span className="ml-auto flex items-center gap-2.5">
          <span className="font-mono text-12-5 tabular-nums">
            <span className="font-semibold text-primary">{sum.passed}</span>
            <span className="text-mut">/{sum.total} ผ่าน</span>
          </span>
          <Bar passed={sum.passed} total={sum.total} />
        </span>
      </button>

      {open ? (
        <ul className="border-t border-line">
          {sorted.map((item) => {
            const record = records.get(item.id) ?? emptyRecord(item.id);
            const late = lateDays(item, period, record, now);
            const chase = needsChasing(item, period, record, now);

            return (
              <li
                key={item.id}
                /* ลิงก์ดาวน์โหลดเป็นพี่น้องกับปุ่ม ไม่ใช่ลูกของปุ่ม — <a> ซ้อนใน
                   <button> เป็น HTML ที่ไม่ถูกต้อง และคีย์บอร์ดจะเข้าไม่ถึงลิงก์ */
                className={`flex items-center border-b border-line/60 transition-colors last:border-b-0 ${
                  activeId === item.id ? "bg-soft/70" : "hover:bg-base-200/40"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onPick(item)}
                  aria-current={activeId === item.id}
                  className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 py-2.5 pl-4 text-left"
                >
                  <span className="font-mono text-11-5 text-mut tabular-nums">
                    {item.id}
                  </span>

                  <span className="min-w-0 flex-1 truncate text-13">{item.title}</span>

                  <KindChip kind={kindOf(item.id)} />

                  {/* ลายเซ็นสองชุด: ใครอัปโหลด และใครตรวจผ่าน — **ต้องเห็นทั้งคู่**
                      เพราะเป็นคนละคนคนละเวลา ถ้าเหลือชุดเดียวจะตอบไม่ได้ว่าของที่
                      ผ่านไปแล้วใครเป็นคนส่งมา หรือใครเป็นคนรับผิดชอบการผ่าน
                      แถวที่ถูกตีกลับใช้ `updatedAt/updatedBy` เพราะ `receivedAt`
                      ถูกล้างไปแล้วตอนตีกลับ */}
                  {record.receivedBy ? (
                    <Stamp
                      verb="อัปโหลด"
                      at={record.receivedAt}
                      by={record.receivedBy}
                    />
                  ) : null}

                  {record.passedBy ? (
                    <Stamp
                      verb="ผ่าน"
                      at={record.passedAt}
                      by={record.passedBy}
                      tone="text-primary"
                    />
                  ) : null}

                  {record.stage === "returned" && record.updatedBy ? (
                    <Stamp
                      verb="ตีกลับ"
                      at={record.updatedAt}
                      by={record.updatedBy}
                      tone="text-sla"
                    />
                  ) : null}

                  {/* ช้ากี่วันสำคัญกว่าวันครบกำหนด — คนอ่านตัดสินใจจากส่วนต่าง ไม่ใช่จากวันที่ */}
                  {chase && late > 0 ? (
                    <span className="font-mono text-12 font-medium text-sla tabular-nums">
                      ช้า {late} วัน
                    </span>
                  ) : record.stage === "passed" && late > 0 ? (
                    <span className="font-mono text-12 text-mut tabular-nums">
                      ส่งช้า {late} วัน
                    </span>
                  ) : null}

                  <span
                    className={`rounded-field px-2 py-0.5 text-12 font-medium ${STAGE_TONE[record.stage]}`}
                  >
                    {STAGE_LABEL[record.stage]}
                  </span>
                </button>

                <a
                  href={templateHref(item)}
                  title={`ดาวน์โหลดแบบฟอร์ม “${item.title}”`}
                  className="flex flex-none items-center gap-1 px-4 py-2.5 text-12 text-mut transition-colors hover:text-primary"
                >
                  <Download size={13} strokeWidth={1.9} aria-hidden />
                  <span className="sr-only sm:not-sr-only">แบบฟอร์ม</span>
                </a>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

/* ป้ายทิศทางเงินของรายการ — "ผสม" กับ "รอยืนยัน" ต้องเด่น เพราะเป็นสองกลุ่มที่
   คนตรวจต้องเปิดดูรายช่องก่อนรับเข้ารอบ ไม่ใช่ดูแค่ยอดรวม */
const KIND_TONE: Record<ItemKind, string> = {
  ฐาน: "border-line text-mut",
  เพิ่ม: "border-primary/30 text-primary",
  หัก: "border-alert/40 text-alert",
  ผสม: "border-alert/40 bg-alert/8 text-alert font-medium",
  รอยืนยัน: "border-warning/50 bg-warning/10 text-warning font-medium",
};

function KindChip({ kind }: { kind: ItemKind }) {
  return (
    <span
      className={`hidden rounded-field border px-1.5 py-px text-11 sm:inline ${KIND_TONE[kind]}`}
    >
      {kind}
    </span>
  );
}

/** `อัปโหลด 9 ต.ค. 14:30 โดย สมหญิง` — ใครทำอะไรเมื่อไหร่ในบรรทัดเดียว */
function Stamp({
  verb,
  at,
  by,
  tone = "text-mut",
}: {
  verb: string;
  at: string | undefined;
  by: string;
  tone?: string;
}) {
  return (
    <span className={`flex items-center gap-1.5 text-11-5 ${tone}`}>
      <span className="font-mono tabular-nums">
        {verb} {stamp(at ?? "")}
      </span>
      <span>โดย {by}</span>
    </span>
  );
}

/**
 * วันเวลาแบบสั้น เช่น `9 ต.ค. 14:30`
 *
 * **มีเวลาด้วย ไม่ใช่แค่วันที่** — ของที่ส่งใหม่หลังถูกตีกลับมักเกิดในวันเดียวกัน
 * ถ้าเหลือแต่วันที่จะดูไม่ออกว่ารอบไหนคือรอบล่าสุด
 */
function stamp(iso: string): string {
  if (!iso) return "";
  const at = new Date(iso);
  return `${at.toLocaleDateString("th-TH", { day: "numeric", month: "short" })} ${at.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`;
}

function Bar({ passed, total }: { passed: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((passed / total) * 100);
  return (
    <span
      aria-hidden
      className="hidden h-1.5 w-20 flex-none overflow-hidden rounded-full bg-base-200 sm:block"
    >
      <span
        className="block h-full rounded-full bg-primary transition-[width]"
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}
