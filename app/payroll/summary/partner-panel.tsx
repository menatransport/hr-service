"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Info } from "lucide-react";

import { combineTotals, notesOf, PHASE_LABEL, type SystemItemSummary } from "@/lib/payroll/partner/summary";

/**
 * แผง "รายการจากระบบ" บนหน้าสรุปรอบ — ยอดรถร่วมจาก mena-partner
 *
 * **ไม่นับในตัวเลข x/y ของความครบของรอบ** — ตัวนั้นคือรายการไฟล์ที่ HR ต้องตรวจรับ
 * ส่วนรายการนี้สถานะมาจากการปิดงวดของระบบรถร่วม (ดูหัว `lib/payroll/partner/summary.ts`)
 * จึงแสดงสถานะงวดของมันเองแยกไว้ตรงนี้
 *
 * เห็นเฉพาะ HR ค่าจ้างและสวัสดิการ (หน้าที่เรียกตัดสินแล้ว และเส้น API กันซ้ำอีกชั้น)
 */
const baht = (n: number) =>
  n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PartnerPanel({ periodCode }: { periodCode: string }) {
  const [summary, setSummary] = useState<SystemItemSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`/api/payroll/summary/partner?period=${periodCode}`);
        const json = (await res.json()) as SystemItemSummary | { error: string };
        if (!alive) return;
        if (!res.ok || "error" in json) {
          throw new Error("error" in json ? json.error : "อ่านยอดรถร่วมไม่สำเร็จ");
        }
        setSummary(json);
        setError(null);
      } catch (err) {
        if (!alive) return;
        setSummary(null);
        setError(err instanceof Error ? err.message : "อ่านยอดรถร่วมไม่สำเร็จ");
      }
    })();
    return () => {
      alive = false;
    };
  }, [periodCode]);

  const total = summary ? combineTotals([summary]) : null;

  return (
    <section className="flex flex-col gap-3 rounded-box border border-line bg-base-100 p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-13-5 font-semibold">รายการจากระบบ</h2>
        <span className="text-12 text-mut">ระบบส่งยอดเอง ไม่ต้องอัปโหลดไฟล์ · ไม่นับในตัวเลขความครบด้านบน</span>
      </div>

      {error ? (
        <p role="status" className="text-12-5 text-sla">{error}</p>
      ) : !summary || !total ? (
        <p className="text-12-5 text-mut">กำลังอ่านยอดรถร่วม…</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-13">
              <thead>
                <tr className="border-b border-line text-left text-12 text-mut">
                  <th className="py-2 pr-3 font-medium">รายการ</th>
                  <th className="px-3 py-2 font-medium">สถานะงวด</th>
                  <th className="px-3 py-2 text-right font-medium">สัญญา</th>
                  <th className="px-3 py-2 text-right font-medium">รับ</th>
                  <th className="px-3 py-2 text-right font-medium">หัก</th>
                  <th className="py-2 pl-3 text-right font-medium">ยอดโอนสุทธิ</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-line">
                  <td className="py-2.5 pr-3">
                    <span className="font-medium">{summary.title}</span>
                    <span className="block text-12 text-mut">
                      งวด {summary.month} · {summary.system}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded-field px-2 py-0.5 text-12 font-medium ${
                        summary.final ? "bg-soft text-primary" : "bg-warning/15 text-warning"
                      }`}
                    >
                      {PHASE_LABEL[summary.phase]}
                    </span>
                  </td>
                  <Num>{summary.payees}</Num>
                  <Num>{baht(summary.add)}</Num>
                  <Num>{baht(summary.cut)}</Num>
                  <Num strong>{baht(summary.net)}</Num>
                </tr>
                <tr>
                  <td className="py-2.5 pr-3 font-medium" colSpan={3}>
                    รวมรายการจากระบบ
                  </td>
                  <Num>{baht(total.add)}</Num>
                  <Num>{baht(total.cut)}</Num>
                  <Num strong>{baht(total.net)}</Num>
                </tr>
              </tbody>
            </table>
          </div>

          {notesOf(summary).length > 0 ? (
            <ul className="flex flex-col gap-1 text-12-5">
              {notesOf(summary).map((note) => (
                <li key={note} className="flex items-start gap-2">
                  <Info size={13} strokeWidth={1.9} aria-hidden className="mt-0.5 flex-none text-warning" />
                  <span className="text-pretty">{note}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {summary.rows.length > 0 ? (
            <div>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="flex items-center gap-1.5 text-12-5 text-mut hover:text-ink"
              >
                <ChevronDown
                  size={14}
                  strokeWidth={1.9}
                  aria-hidden
                  className={`transition-transform ${open ? "rotate-180" : ""}`}
                />
                {open ? "ซ่อนรายสัญญา" : `ดูรายสัญญา (${summary.rows.length})`}
              </button>
              {open ? (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[44rem] text-12-5">
                    <thead>
                      <tr className="border-b border-line text-left text-12 text-mut">
                        <th className="py-2 pr-3 font-medium">สัญญา</th>
                        <th className="px-3 py-2 font-medium">ชื่อ</th>
                        <th className="px-3 py-2 font-medium">ทะเบียน</th>
                        <th className="px-3 py-2 font-medium">รหัสพนักงาน</th>
                        <th className="px-3 py-2 text-right font-medium">รับ</th>
                        <th className="px-3 py-2 text-right font-medium">หัก</th>
                        <th className="py-2 pl-3 text-right font-medium">ยอดโอนสุทธิ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.rows.map((row) => (
                        <tr key={row.payeeId} className="border-b border-line last:border-0">
                          <td className="py-2 pr-3 font-mono tabular-nums">
                            {row.payeeId}
                            {row.adjusted ? (
                              <span className="ml-1.5 rounded-field bg-warning/15 px-1.5 py-0.5 text-11 text-warning">
                                มีส่วนต่าง
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">{row.personName || "—"}</td>
                          <td className="px-3 py-2">{row.plate || "—"}</td>
                          <td className="px-3 py-2 font-mono tabular-nums">
                            {row.unlinked ? <span className="text-mut">ยังไม่จับคู่</span> : row.personId}
                          </td>
                          <Num>{baht(row.add)}</Num>
                          <Num>{baht(row.cut)}</Num>
                          <Num strong>{baht(row.net)}</Num>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function Num({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <td className={`px-3 py-2 text-right font-mono tabular-nums ${strong ? "font-semibold text-ink" : "text-ink"}`}>
      {children}
    </td>
  );
}
