"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { History, Loader2, RotateCcw, TriangleAlert } from "lucide-react";

import { requestJson } from "@/lib/http";
import {
  HR_DOCUMENTS,
  thaiDateTime,
  thaiShortDateTime,
  type DocFill,
} from "@/app/recruitment/_lib/hr-documents";
import type {
  HrDocumentPrint,
  HrDocumentPrintFull,
  HrDocumentRecord,
  HrDocumentState,
  HrRecordDocId,
} from "@/app/recruitment/_lib/hr-document-records";

/**
 * ค่าที่กรอกในหน้าทำเอกสาร ↔ ฐานข้อมูล (29 ก.ย. 2026) — ฝั่งจอของ
 * `app/recruitment/_lib/hr-document-records.ts` ซึ่งอธิบายสองคอลเลกชันไว้แล้ว
 *
 * แยกไฟล์ออกจาก `hr-document-maker.tsx` เพราะกล่องนั้นยาวพอแล้ว และส่วนนี้มีกติกา
 * ของตัวเองครบชุด: โหลด · บันทึกพร้อม `revision` · ลงประวัติการพิมพ์ · เปิดฉบับที่พิมพ์ไปแล้ว
 */

const base = (applicationId: string) =>
  `/api/recruitment/applications/${applicationId}/hr-documents`;

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; record: HrDocumentRecord | null; prints: HrDocumentPrint[] };

/**
 * `onLoaded` ถูกเรียกครั้งเดียวต่อการโหลดแต่ละรอบ พร้อมค่าที่บันทึกไว้ (หรือ `null`)
 * — ตัวกล่องเอาไปเทลงช่องกรอกเอง hook นี้ไม่ถือ `fill` เพราะกล่องถืออยู่แล้ว
 */
export function useHrDocumentRecord(
  applicationId: string,
  enabled: boolean,
  onLoaded: (record: HrDocumentRecord | null) => void,
) {
  const [state, setState] = useState<LoadState>(
    enabled ? { status: "loading" } : { status: "ready", record: null, prints: [] },
  );

  /* เก็บตัวเรียกกลับไว้ใน ref — ไม่งั้นทุกครั้งที่กล่อง render ใหม่ `load` จะเปลี่ยน
     แล้ว effect ข้างล่างยิงโหลดซ้ำไม่รู้จบ */
  const loaded = useRef(onLoaded);
  useEffect(() => {
    loaded.current = onLoaded;
  });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const data = await requestJson<HrDocumentState>(
        base(applicationId),
        {},
        "โหลดเอกสารที่บันทึกไว้ไม่สำเร็จ",
      );
      setState({ status: "ready", record: data.record, prints: data.prints });
      loaded.current(data.record);
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "โหลดเอกสารที่บันทึกไว้ไม่สำเร็จ",
      });
    }
  }, [applicationId]);

  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- โหลดครั้งแรกตอนเปิดกล่อง
    void load();
  }, [enabled, load]);

  /**
   * บันทึกตอนสั่งพิมพ์ — โยน error ต่อ (ผู้เรียกห่อด้วย `runAction`)
   *
   * **ค่าบนจอตอนกดพิมพ์ชนะเสมอ** — อ่าน `revision` ล่าสุดจากฐานก่อนยิง ไม่ใช้ค่าที่จอ
   * ถือไว้ตอนเปิด เพราะการบันทึกผูกกับการพิมพ์แล้ว สิ่งที่อยู่บนกระดาษต้องเป็นค่าล่าสุดใน
   * ฐานด้วย · ค่าของคนก่อนหน้าไม่หาย มีสำเนาอยู่ในประวัติการพิมพ์ของเขา
   * (ยังได้ 409 ถ้าสองคนกดพิมพ์ในเสี้ยววินาทีเดียวกัน — กดใหม่ก็ผ่าน)
   */
  async function save(fill: DocFill): Promise<HrDocumentRecord> {
    const latest = await requestJson<HrDocumentState>(
      base(applicationId),
      {},
      "อ่านค่าล่าสุดก่อนบันทึกไม่สำเร็จ",
    );
    const revision = latest.record?.revision ?? 0;
    const record = await requestJson<HrDocumentRecord>(
      base(applicationId),
      { method: "PUT", body: { fill, revision } as unknown as Record<string, unknown> },
      "บันทึกเอกสารไม่สำเร็จ",
    );
    setState((prev) =>
      prev.status === "ready"
        ? { ...prev, record }
        : { status: "ready", record, prints: latest.prints },
    );
    return record;
  }

  /** บันทึกการพิมพ์ล่าสุดของฉบับนี้ (เขียนทับครั้งก่อน) — โยน error ต่อ */
  async function logPrint(docId: HrRecordDocId, fill: DocFill): Promise<HrDocumentPrint> {
    const print = await requestJson<HrDocumentPrint>(
      `${base(applicationId)}/prints`,
      { method: "POST", body: { docId, fill } as unknown as Record<string, unknown> },
      "บันทึกประวัติการพิมพ์ไม่สำเร็จ",
    );
    /* ฉบับละแถว — แถวเดิมของฉบับนี้ถูกแทนด้วยครั้งล่าสุดแล้วขึ้นไปบนสุด */
    setState((prev) =>
      prev.status === "ready"
        ? { ...prev, prints: [print, ...prev.prints.filter((p) => p.docId !== print.docId)] }
        : prev,
    );
    return print;
  }

  /** สำเนาค่าบนกระดาษของการพิมพ์ครั้งหนึ่ง — โยน error ต่อ */
  function openPrint(printId: string): Promise<HrDocumentPrintFull> {
    return requestJson<HrDocumentPrintFull>(
      `${base(applicationId)}/prints/${printId}`,
      {},
      "เปิดฉบับที่พิมพ์ไว้ไม่สำเร็จ",
    );
  }

  return { state, reload: load, save, logPrint, openPrint };
}

/** เทียบค่าสองก้อนแบบไม่สนลำดับคีย์ — ใช้ตัดสินว่ามีอะไรยังไม่บันทึก */
export function sameFill(a: DocFill, b: DocFill): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof DocFill>;
  for (const key of keys) {
    if ((a[key] ?? null) !== (b[key] ?? null)) return false;
  }
  return true;
}

const docLabel = (id: string) => HR_DOCUMENTS.find((d) => d.id === id)?.label ?? id;

/**
 * การพิมพ์ล่าสุด ฉบับละแถว — **อย่างเดียว** (ตามคำสั่งเจ้าของงาน 29 ก.ย. 2026 ไม่มีปุ่ม
 * บันทึกแยก การบันทึกค่าอยู่ในปุ่มพิมพ์ · ไม่เก็บทุกครั้ง พิมพ์ใหม่ = เวลาอัปเดตทับ)
 * · กดรายการเพื่อเทค่าบนกระดาษครั้งนั้นกลับลงช่องกรอก
 */
export function PrintHistory({
  state,
  onReload,
  onOpenPrint,
  openingPrint,
}: {
  state: LoadState;
  onReload: () => void;
  onOpenPrint: (print: HrDocumentPrint) => void;
  openingPrint: string | null;
}) {
  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-2 rounded-field border border-line px-3 py-2.5 text-12 text-mut">
        <Loader2 size={13} strokeWidth={2} aria-hidden className="animate-spin" />
        กำลังโหลดการพิมพ์ล่าสุด…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-col gap-2 rounded-field border border-alert/30 bg-alert-soft px-3 py-2.5 text-12 text-alert">
        <span className="flex items-start gap-1.5">
          <TriangleAlert size={13} strokeWidth={2} aria-hidden className="mt-0.5 flex-none" />
          <span>{state.message} — ช่องกรอกเติมจากใบสมัครให้แทน ยังพิมพ์ได้ตามปกติ</span>
        </span>
        <button
          type="button"
          onClick={onReload}
          className="flex w-fit items-center gap-1.5 rounded-field border border-alert/40 bg-base-100 px-2.5 py-1 transition-colors hover:border-alert"
        >
          <RotateCcw size={12} strokeWidth={2} aria-hidden />
          ลองโหลดใหม่
        </button>
      </div>
    );
  }

  const { prints } = state;

  return (
    <div className="flex flex-col gap-1 rounded-field border border-line p-3">
      <span className="flex items-center gap-1.5 text-11-5 font-medium text-mut">
        <History size={12} strokeWidth={2} aria-hidden />
        พิมพ์ล่าสุด
      </span>
      {prints.length === 0 ? (
        <span className="text-11-5 text-mut">ยังไม่เคยพิมพ์ฉบับไหนของใบนี้</span>
      ) : (
        <ul className="flex max-h-40 flex-col overflow-y-auto">
          {prints.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onOpenPrint(p)}
                disabled={openingPrint !== null}
                title={`${thaiDateTime(p.printedAt)} — กดเพื่อเทค่าที่อยู่บนกระดาษครั้งนั้นกลับลงช่องกรอก`}
                className="flex w-full items-center gap-2 rounded-selector px-1.5 py-1 text-left text-11-5 transition-colors hover:bg-base-200 disabled:opacity-60"
              >
                <span className="flex-none font-medium">{docLabel(p.docId)}</span>
                <span className="min-w-0 flex-1 truncate text-mut">
                  {p.printedBy.name} · {thaiShortDateTime(p.printedAt)}
                </span>
                {openingPrint === p.id ? (
                  <Loader2 size={12} strokeWidth={2} aria-hidden className="flex-none animate-spin text-mut" />
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
