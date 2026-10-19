"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleCheck, Download, Info, RotateCcw, TriangleAlert } from "lucide-react";

import { PartnerPanel } from "@/app/payroll/summary/partner-panel";
import { PageHead } from "@/components/desk/page-head";
import { NotifyButton } from "@/components/payroll/notify-panel";
import { PeriodPicker } from "@/components/payroll/period-picker";
import type { DeskIdentity } from "@/lib/auth/identity";
import { HR_DEPARTMENT_LABEL } from "@/lib/payroll/approver";
import type { IntakeRecord } from "@/lib/payroll/intake-status";
import { isLocked, periodCode, periodLabel, type PeriodRef } from "@/lib/payroll/period";
import { ownerScope } from "@/lib/payroll/scope";
import { visibleItems } from "@/lib/payroll/scope-filter";
import { NO_REASON_TEXT, readinessLine, SCOPED_NOTE, statusText, summarizePeriod } from "@/lib/payroll/summary";

/**
 * หน้าสรุปรอบ — ตอบว่า “รอบนี้ครบหรือยัง” แล้วเปิดทางให้ดาวน์โหลดสรุปเป็น Excel
 *
 * อ่านสถานะจาก `/api/payroll/intake` เส้นเดียวกับหน้ารับข้อมูล (ถูกกรองตามฝ่ายที่
 * server แล้ว) แล้วคิดสรุปด้วย `summarizePeriod` — ไม่มีกฎขอบเขตชุดที่สองที่นี่
 *
 * **ไฟล์ที่อ่านไม่ออกแสดงเป็นป้ายของตัวเอง** ไม่รวมกับ “ผิด 1 ข้อ” (เหตุผลที่ `isUnreadable`)
 * และ **ของที่ผ่านโดยข้ามด่านแสดงเหตุผลไว้ตรงนี้** เพราะเหตุผลคือร่องรอยการตรวจสอบ
 */
export function SummaryView({
  canPass,
  identity,
  initialPeriod,
}: {
  canPass: boolean;
  identity: DeskIdentity;
  initialPeriod: PeriodRef;
}) {
  const items = useMemo(() => visibleItems(identity), [identity]);
  const [period, setPeriod] = useState<PeriodRef>(initialPeriod);
  const [records, setRecords] = useState<Map<string, IntakeRecord>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [reloadAt, setReloadAt] = useState(0);

  const code = periodCode(period);
  const locked = isLocked(period);

  /* โครงเดียวกับหน้ารับข้อมูล: setState อยู่หลัง await และ `alive` กันผลรอบเก่าทับรอบใหม่ */
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

  const summary = useMemo(
    () => summarizePeriod(period, records, now, items),
    [period, records, now, items],
  );

  const total = summary.rows.length;
  const passed = total - summary.blockers.length;
  const missing = summary.rows.filter((row) => row.record.stage !== "passed");
  const overridden = summary.rows.filter((row) => row.overridden);
  const chaseOwners = summary.owners
    .filter(({ tally }) => tally.waiting > 0 || tally.returned > 0)
    .map(({ owner }) => owner);

  return (
    <div className="animate-rise flex flex-col gap-5">
      <PageHead
        title="สรุปรอบ"
        subtitle="ดูว่ารอบนี้ครบหรือยัง ใครยังค้าง และดาวน์โหลดสรุปไว้ส่งต่อ"
      />

      <section className="flex flex-col gap-3 rounded-box border border-line bg-base-100 p-4">
        <PeriodPicker
          value={period}
          onChange={(next) => {
            setLoading(true);
            setPeriod(next);
          }}
        />
      </section>

      {loadError ? (
        <p role="status" className="rounded-box border border-sla/30 bg-sla/6 px-3.5 py-3 text-12-5 text-sla">
          {loadError}
        </p>
      ) : null}

      {total === 0 ? (
        <div className="rounded-xl border border-base-300 bg-base-100 p-6 text-sm text-mut">
          <p className="font-medium text-base-content">
            หน่วยงานของคุณยังไม่มีรายการในทะเบียนรับข้อมูลเงินเดือน
          </p>
          <p className="mt-2">แจ้ง{HR_DEPARTMENT_LABEL} เพื่อเพิ่มหน่วยงานให้ตรงกับทะเบียน</p>
        </div>
      ) : loading ? (
        <p className="px-1 text-12-5 text-mut">กำลังอ่านสถานะรอบ {periodLabel(period)}…</p>
      ) : (
        <>
          {/* คำตอบก่อนรายละเอียด */}
          <div
            className={`flex flex-wrap items-center gap-x-5 gap-y-2 rounded-box border p-3.5 ${
              summary.ready ? "border-primary/30 bg-soft/60" : "border-sla/30 bg-sla/6"
            }`}
          >
            {summary.ready ? (
              <CircleCheck size={19} strokeWidth={1.8} aria-hidden className="text-primary" />
            ) : (
              <TriangleAlert size={19} strokeWidth={1.8} aria-hidden className="text-sla" />
            )}
            <span className="flex items-baseline gap-2.5">
              <span
                className={`font-mono text-26 leading-none font-semibold tabular-nums ${
                  summary.ready ? "text-primary" : "text-sla"
                }`}
              >
                {passed}/{total}
              </span>
              <span className="text-13 text-pretty">
                รอบ {periodLabel(period)}: {readinessLine(summary)}
              </span>
            </span>

            <span className="ml-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  setReloadAt(Date.now());
                }}
                className="flex items-center gap-1.5 rounded-field border border-line px-2.5 py-1.5 text-12-5 text-mut transition-colors hover:border-primary/40 hover:text-ink"
              >
                <RotateCcw size={13} strokeWidth={1.9} aria-hidden />
                รีเฟรช
              </button>
              <a
                href={`/api/payroll/summary?period=${code}`}
                className="flex items-center gap-1.5 rounded-field border border-primary/40 px-2.5 py-1.5 text-12-5 font-medium text-primary transition-colors hover:bg-soft"
              >
                <Download size={13} strokeWidth={1.9} aria-hidden />
                ดาวน์โหลดสรุป Excel
              </a>
            </span>
          </div>

          {summary.scoped ? (
            <p className="flex items-start gap-2 rounded-box border border-warning/40 bg-warning/10 px-3.5 py-2.5 text-12-5 text-pretty">
              <Info size={14} strokeWidth={1.9} aria-hidden className="mt-0.5 flex-none text-warning" />
              {SCOPED_NOTE}
            </p>
          ) : null}

          {/* ตารางรายฝ่าย */}
          <section className="overflow-x-auto rounded-box border border-line bg-base-100">
            <table className="w-full min-w-[40rem] text-13">
              <thead>
                <tr className="border-b border-line text-left text-12 text-mut">
                  <th className="px-4 py-2.5 font-medium">ฝ่าย</th>
                  <Th>ทั้งหมด</Th>
                  <Th>ผ่าน</Th>
                  <Th>รอตรวจ</Th>
                  <Th>ตีกลับ</Th>
                  <Th>รอส่ง</Th>
                  <Th>ช้าสุด (วัน)</Th>
                </tr>
              </thead>
              <tbody>
                {summary.owners.map(({ owner, tally, unreadable, overridden: skipped }) => (
                  <tr key={owner} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{owner}</span>
                      {unreadable > 0 ? (
                        <span className="ml-2 rounded-field bg-sla/12 px-2 py-0.5 text-12 font-medium text-sla">
                          ไฟล์อ่านไม่ได้ {unreadable}
                        </span>
                      ) : null}
                      {skipped > 0 ? (
                        <span className="ml-2 rounded-field bg-warning/15 px-2 py-0.5 text-12 font-medium text-warning">
                          ผ่านโดยข้ามด่าน {skipped}
                        </span>
                      ) : null}
                    </td>
                    <Td>{tally.total}</Td>
                    <Td tone="text-primary">{tally.passed}</Td>
                    <Td tone={tally.submitted ? "text-warning" : undefined}>{tally.submitted}</Td>
                    <Td tone={tally.returned ? "text-sla" : undefined}>{tally.returned}</Td>
                    <Td>{tally.waiting}</Td>
                    <Td tone={tally.worstLate ? "text-sla" : undefined}>{tally.worstLate}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* ที่ยังขาด */}
          {missing.length > 0 ? (
            <section className="flex flex-col gap-2.5 rounded-box border border-line bg-base-100 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-13-5 font-semibold">รายการที่ยังไม่ผ่าน ({missing.length})</h2>
                {canPass && !locked && chaseOwners.length > 0 ? (
                  <span className="ml-auto flex flex-wrap gap-2">
                    {chaseOwners.map((owner) => (
                      <NotifyButton
                        key={owner}
                        periodCode={code}
                        owner={owner}
                        label={`แจ้ง ${owner}`}
                      />
                    ))}
                  </span>
                ) : null}
              </div>
              <ul className="flex flex-col divide-y divide-line">
                {missing.map((row) => (
                  <li key={row.item.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-13">
                    <span className="font-mono text-12 text-mut tabular-nums">{row.item.id}</span>
                    <span className="min-w-0 flex-1 text-pretty">{row.item.title}</span>
                    <span className="text-12 text-mut">{row.item.owner}</span>
                    <span
                      className={`rounded-field px-2 py-0.5 text-12 font-medium ${
                        row.unreadable ? "bg-sla/12 text-sla" : "bg-base-200 text-mut"
                      }`}
                    >
                      {statusText(row)}
                    </span>
                  </li>
                ))}
              </ul>
              {canPass ? null : (
                <p className="text-12 text-mut">
                  การแจ้งฝ่ายทางอีเมลทำได้เฉพาะ{HR_DEPARTMENT_LABEL}
                </p>
              )}
            </section>
          ) : null}

          {/* ร่องรอยการข้ามด่าน */}
          {overridden.length > 0 ? (
            <section className="flex flex-col gap-2.5 rounded-box border border-warning/40 bg-base-100 p-4">
              <h2 className="text-13-5 font-semibold">ผ่านโดยข้ามด่านแรก ({overridden.length})</h2>
              <p className="text-12-5 text-mut">
                นับเป็นผ่านแล้ว แต่ไฟล์เหล่านี้ยังมีข้อผิดพลาดค้างจากการตรวจด่านแรก — เหตุผลที่ HR ให้ไว้อยู่ด้านล่าง
              </p>
              <ul className="flex flex-col divide-y divide-line">
                {overridden.map((row) => (
                  <li key={row.item.id} className="flex flex-col gap-0.5 py-2 text-13">
                    <span>
                      <span className="font-mono text-12 text-mut tabular-nums">{row.item.id}</span>{" "}
                      {row.item.title}{" "}
                      <span className="text-12 text-mut">
                        · ค้าง {row.record.errors} ข้อ{row.record.passedBy ? ` · ผ่านโดย ${row.record.passedBy}` : ""}
                      </span>
                    </span>
                    <span className="text-12-5">
                      เหตุผล:{" "}
                      {row.record.overrideReason ? (
                        row.record.overrideReason
                      ) : (
                        <span className="text-sla">{NO_REASON_TEXT}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

        </>
      )}

      {/* รายการจากระบบ (รถร่วม) — จุดเสียบเดียวของเลน 3 · เฉพาะคนที่เห็นทุกฝ่าย */}
      {ownerScope(identity).all ? <PartnerPanel periodCode={code} /> : null}

      {/* ขั้นถัดไปที่ยังไม่มี — บอกตรง ๆ ว่าทำไม */}
      <div className="flex items-start gap-2.5 rounded-box border border-line bg-base-200/50 p-3.5 text-12-5 text-mut">
        <Info size={15} strokeWidth={1.9} aria-hidden className="mt-0.5 flex-none" />
        <p className="text-pretty">
          ขั้นถัดไปคือทำไฟล์นำเข้า Tiger Soft ซึ่งยังรอสเปกไฟล์จาก HR ค่าจ้างและสวัสดิการ
          จึงยังไม่มีปุ่มสร้างไฟล์นั้นในหน้านี้ · Excel ที่ดาวน์โหลดจากหน้านี้เป็นไฟล์สรุปไว้ดูเท่านั้น
          ห้ามนำไปอัปโหลดเข้า Tiger Soft
        </p>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2.5 text-center font-medium">{children}</th>;
}

function Td({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return (
    <td className={`px-3 py-2.5 text-center font-mono tabular-nums ${tone ?? "text-ink"}`}>
      {children}
    </td>
  );
}
