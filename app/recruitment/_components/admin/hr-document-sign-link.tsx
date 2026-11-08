"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock3, Copy, ExternalLink, Link2, Loader2, TriangleAlert } from "lucide-react";

import { ModalShell } from "@/components/ui/modal-shell";
import { requestJson } from "@/lib/http";
import { alertError, runAction, toastSuccess } from "@/lib/swal";
import { HR_DOCUMENTS, thaiShortDateTime, type DocFill, type HrDocId } from "@/app/recruitment/_lib/hr-documents";
import type { HrDocumentState } from "@/app/recruitment/_lib/hr-document-records";
import { signKey } from "@/app/recruitment/_lib/hr-signatures";
import {
  SIGN_LINK_DAYS,
  SIGNABLE_DOCS,
  signPath,
  type SignLinkState,
} from "@/app/recruitment/_lib/sign-links";

/**
 * กล่อง “ลิงก์ให้ผู้สมัครเซ็น” (เปิดจากกล่องทำเอกสาร) — เลือกฉบับ → สร้างลิงก์ → คัดลอก
 * ส่งทาง LINE · กติกาของลิงก์อยู่ที่ `sign-links.ts`
 *
 * เอกสารบนลิงก์วาดจากค่าที่ **บันทึกแล้ว** — มีค่าค้างอยู่ในกล่องสร้างลิงก์ไม่ได้ ·
 * ผู้สมัครเซ็นแล้วลายเซ็นอยู่ในฐาน กล่องทำเอกสารที่เปิดค้างยังไม่เห็น → ปุ่ม “ดึงลายเซ็น”
 */
export function SignLinkModal({
  applicationId,
  applicantName,
  fill,
  unsaved,
  initialDoc,
  onPull,
  onClose,
}: {
  applicationId: string;
  applicantName: string;
  /** ค่าบนจอของกล่องทำเอกสาร — ใช้ดูว่าลายเซ็นในฐานยังไม่ได้ดึงเข้ามาหรือเปล่า */
  fill: DocFill;
  unsaved: boolean;
  /** ฉบับที่เปิดอยู่ในกล่อง — ติ๊กให้ตั้งต้นตอนยังไม่มีลิงก์ */
  initialDoc: HrDocId;
  /** เทลายเซ็นผู้สมัครจากฐานเข้ากล่อง */
  onPull: (state: HrDocumentState) => void;
  onClose: () => void;
}) {
  const [state, setState] = useState<SignLinkState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<HrDocId[]>([]);
  const [busy, setBusy] = useState(false);

  const endpoint = `/api/recruitment/applications/${applicationId}/sign-link`;

  const load = useCallback(async () => {
    setError(null);
    try {
      const next = await requestJson<SignLinkState>(endpoint, {}, "โหลดลิงก์ไม่สำเร็จ");
      setState(next);
      setPicked((prev) =>
        prev.length
          ? prev
          : next.link?.docs ?? [(SIGNABLE_DOCS as HrDocId[]).includes(initialDoc) ? initialDoc : "profile"],
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดลิงก์ไม่สำเร็จ");
    }
  }, [endpoint, initialDoc]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- โหลดครั้งแรกตอนเปิดกล่อง
    void load();
  }, [load]);

  const url = state?.link ? `${window.location.origin}${signPath(state.link.token)}` : "";
  const sameDocs =
    Boolean(state?.link) &&
    picked.length === state!.link!.docs.length &&
    picked.every((d) => state!.link!.docs.includes(d));

  /* ลายเซ็นผู้สมัครที่อยู่ในฐานแล้วแต่กล่องทำเอกสารยังไม่มี */
  const notPulled = SIGNABLE_DOCS.filter((d) => {
    const at = state?.signed[d];
    return at && fill.signatures?.[signKey(d, "applicant")]?.signedAt !== at;
  });

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toastSuccess("คัดลอกลิงก์แล้ว", "ส่งให้ผู้สมัครทาง LINE ได้เลย");
    } catch {
      alertError("คัดลอกไม่สำเร็จ", "เลือกข้อความในช่องลิงก์แล้วคัดลอกเอง");
    }
  }

  async function create() {
    const replacing = Boolean(state?.link);
    const out = await runAction({
      confirm: replacing
        ? {
            title: "สร้างลิงก์ใหม่?",
            text: "ลิงก์เดิมที่ส่งให้ผู้สมัครไปแล้วจะใช้ไม่ได้ทันที — ต้องส่งลิงก์ใหม่ให้อีกครั้ง",
            confirmText: "สร้างลิงก์ใหม่",
            tone: "warn",
          }
        : false,
      success: false,
      failureTitle: "สร้างลิงก์ไม่สำเร็จ",
      run: async () => {
        setBusy(true);
        try {
          return await requestJson<SignLinkState>(endpoint, { method: "POST", body: { docs: picked } }, "สร้างลิงก์ไม่สำเร็จ");
        } finally {
          setBusy(false);
        }
      },
    });
    if (out.status !== "done") return;
    setState(out.data);
    if (out.data.link) await copy(`${window.location.origin}${signPath(out.data.link.token)}`);
  }

  async function revoke() {
    const out = await runAction({
      confirm: {
        title: "ยกเลิกลิงก์?",
        text: "ผู้สมัครจะเปิดลิงก์นี้ไม่ได้อีก · ลายเซ็นที่เซ็นไปแล้วยังอยู่",
        confirmText: "ยกเลิกลิงก์",
        tone: "danger",
      },
      pending: "กำลังยกเลิกลิงก์…",
      success: "ยกเลิกลิงก์แล้ว",
      failureTitle: "ยกเลิกลิงก์ไม่สำเร็จ",
      run: () => requestJson<SignLinkState>(endpoint, { method: "DELETE" }, "ยกเลิกลิงก์ไม่สำเร็จ"),
    });
    if (out.status === "done") setState(out.data);
  }

  async function pull() {
    try {
      const latest = await requestJson<HrDocumentState>(
        `/api/recruitment/applications/${applicationId}/hr-documents`,
        {},
        "โหลดลายเซ็นไม่สำเร็จ",
      );
      onPull(latest);
      toastSuccess("ดึงลายเซ็นผู้สมัครแล้ว");
    } catch (err) {
      alertError("โหลดลายเซ็นไม่สำเร็จ", err instanceof Error ? err.message : undefined);
    }
  }

  const blocked = unsaved || !state?.hasRecord;

  return (
    <ModalShell
      title={`ลิงก์ให้ผู้สมัครเซ็น · ${applicantName}`}
      subtitle="ผู้สมัครเปิดได้โดยไม่ต้องเข้าสู่ระบบ อ่านเอกสาร แล้วเซ็นบนมือถือหรือแนบรูปลายเซ็น"
      onClose={onClose}
      width="560px"
      tone="plain"
      footer={
        <div className="flex w-full items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="btn-sec px-3.5 py-2.5 text-13 transition-colors hover:border-primary/40"
          >
            ปิด
          </button>
        </div>
      }
    >
      {!state && !error ? (
        <div className="flex items-center gap-2 py-6 text-13 text-mut">
          <Loader2 size={15} strokeWidth={2} aria-hidden className="animate-spin" />
          กำลังโหลด…
        </div>
      ) : error ? (
        <div className="flex items-center justify-between gap-2 rounded-field border border-alert/30 bg-alert-soft px-3 py-2.5 text-12-5 text-alert">
          <span>{error}</span>
          <button type="button" onClick={() => void load()} className="underline">
            ลองใหม่
          </button>
        </div>
      ) : state ? (
        <div className="flex flex-col gap-5">
          {blocked ? (
            <p className="flex items-start gap-2 rounded-field border border-warning/40 bg-warning/10 px-3 py-2.5 text-12-5 text-ink">
              <TriangleAlert size={14} strokeWidth={2} aria-hidden className="mt-0.5 flex-none text-warning" />
              กดบันทึกข้อมูลในกล่องทำเอกสารก่อน — ลิงก์แสดงเอกสารตามค่าที่บันทึกแล้วเท่านั้น
            </p>
          ) : null}

          <section className="flex flex-col gap-2">
            <h3 className="text-12-5 font-semibold">เอกสารที่ให้ผู้สมัครเซ็น</h3>
            <ul className="flex flex-col divide-y divide-line rounded-field border border-line">
              {SIGNABLE_DOCS.map((doc) => {
                const meta = HR_DOCUMENTS.find((d) => d.id === doc)!;
                const signedAt = state.signed[doc];
                return (
                  <li key={doc}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm checkbox-primary"
                        checked={picked.includes(doc)}
                        onChange={(e) =>
                          setPicked((prev) =>
                            e.target.checked ? SIGNABLE_DOCS.filter((d) => d === doc || prev.includes(d)) : prev.filter((d) => d !== doc),
                          )
                        }
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-13 font-medium">{meta.label}</span>
                        {meta.code ? <span className="font-mono text-10-5 text-mut">{meta.code}</span> : null}
                      </span>
                      {signedAt ? (
                        <span className="flex items-center gap-1 text-11-5 font-medium text-success">
                          <CheckCircle2 size={12} strokeWidth={2.2} aria-hidden />
                          เซ็นแล้ว {thaiShortDateTime(signedAt)}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-11-5 text-mut">
                          <Clock3 size={12} strokeWidth={2.2} aria-hidden />
                          ยังไม่เซ็น
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>

          {state.link ? (
            <section className="flex flex-col gap-2">
              <h3 className="flex items-baseline justify-between gap-2 text-12-5 font-semibold">
                ลิงก์ที่ใช้ได้อยู่
                <span className="text-11 font-normal text-mut">
                  สร้างโดย {state.link.createdBy} · ใช้ได้ถึง {thaiShortDateTime(state.link.expiresAt)}
                </span>
              </h3>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={url}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="ลิงก์ให้ผู้สมัครเซ็น"
                  className="field-ring min-w-0 flex-1 rounded-field border border-line bg-base-200/60 px-3 py-2 font-mono text-11-5"
                />
                <button
                  type="button"
                  onClick={() => void copy(url)}
                  className="btn-pri flex flex-none items-center gap-1.5 px-3.5 py-2 text-12-5 font-medium"
                >
                  <Copy size={13} strokeWidth={2} aria-hidden />
                  คัดลอก
                </button>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  title="เปิดดูหน้าที่ผู้สมัครเห็น"
                  className="btn-sec flex flex-none items-center p-2 transition-colors hover:border-primary/40 hover:text-primary"
                >
                  <ExternalLink size={14} strokeWidth={2} aria-hidden />
                  <span className="sr-only">เปิดดูหน้าที่ผู้สมัครเห็น</span>
                </a>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-11-5 text-mut">
                  ฉบับในลิงก์: {state.link.docs.map((d) => HR_DOCUMENTS.find((x) => x.id === d)!.label).join(" · ")}
                </span>
                <button
                  type="button"
                  onClick={() => void revoke()}
                  className="rounded-selector px-1.5 py-1 text-11-5 text-mut transition-colors hover:text-alert"
                >
                  ยกเลิกลิงก์
                </button>
              </div>
            </section>
          ) : null}

          {!state.link || !sameDocs ? (
            <button
              type="button"
              onClick={() => void create()}
              disabled={blocked || busy || !picked.length}
              className="btn-pri flex items-center justify-center gap-2 py-2.5 text-13 font-medium disabled:bg-none disabled:opacity-60"
            >
              {busy ? (
                <Loader2 size={14} strokeWidth={2} aria-hidden className="animate-spin" />
              ) : (
                <Link2 size={14} strokeWidth={2} aria-hidden />
              )}
              {state.link ? "สร้างลิงก์ใหม่ตามที่เลือก และคัดลอก" : "สร้างลิงก์และคัดลอก"}
            </button>
          ) : null}
          <p className="-mt-2 text-11-5 text-mut">
            ลิงก์ใช้ได้ {SIGN_LINK_DAYS} วัน · ผู้สมัครเซ็นได้ฉบับละครั้ง ถ้าเซ็นผิด ล้างลายเซ็นในกล่องทำเอกสาร บันทึก แล้วให้เปิดลิงก์เดิมเซ็นใหม่
          </p>

          {notPulled.length ? (
            <div className="flex items-center justify-between gap-3 rounded-field border border-primary/30 bg-soft px-3 py-2.5">
              <span className="text-12-5">
                ผู้สมัครเซ็นแล้ว {notPulled.length} ฉบับ — ยังไม่อยู่บนกระดาษในกล่องนี้
              </span>
              <button
                type="button"
                onClick={() => void pull()}
                className="btn-sec flex-none px-3 py-1.5 text-12 transition-colors hover:border-primary/40 hover:text-primary"
              >
                ดึงลายเซ็นเข้าเอกสาร
              </button>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => void load()}
            className="-mt-2 w-fit self-end text-11-5 text-mut underline-offset-2 hover:text-ink hover:underline"
          >
            รีเฟรชสถานะการเซ็น
          </button>
        </div>
      ) : null}
    </ModalShell>
  );
}
