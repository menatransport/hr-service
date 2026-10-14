"use client";

import { useState } from "react";
import { Copy, Mail, TriangleAlert, X } from "lucide-react";

import type { NotifyDraft } from "@/lib/payroll/notify";
import type { IntakeOwner } from "@/lib/payroll/registry";
import { toastError, toastSuccess } from "@/lib/swal";

/**
 * แจ้งฝ่ายทางอีเมล — **ระบบไม่ส่งเมลเอง** (เหตุผลอยู่ที่หัว `lib/payroll/notify.ts`)
 * ปุ่ม “เปิด Gmail” เปิดหน้าเขียนเมลพร้อมผู้รับ/หัวเรื่อง/เนื้อความ แล้ว HR กดส่งเอง
 *
 * **ทำไมไม่เปิด Gmail รัวทุกฝ่ายในคลิกเดียว:** เบราว์เซอร์อนุญาตป๊อปอัปได้ต่อหนึ่งการคลิก
 * ถ้าเปิดหลายแท็บในคำสั่งเดียว แท็บที่สองเป็นต้นไปจะถูกบล็อกเงียบ ๆ จึงดึงร่างมาก่อน
 * แล้วให้กด “เปิด Gmail” ทีละฝ่าย — ทุกแท็บมาจากการคลิกของ HR จริง
 */

interface NotifyResponse {
  senderEmail: string | null;
  drafts: NotifyDraft[];
}

/**
 * เพดานความยาว URL หน้าเขียนเมล (หลัง encode) — ภาษาไทยกิน 9 ตัวอักษรต่อ 1 ตัว
 * เกินเพดานนี้ใช้เนื้อฉบับย่อแทน แล้วบอกให้ใช้ปุ่มคัดลอกเอาฉบับเต็ม
 */
const URL_LIMIT = 7000;

function gmailUrl(draft: NotifyDraft, senderEmail: string | null, short: boolean) {
  const build = (body: string) => {
    const params = new URLSearchParams({
      view: "cm",
      fs: "1",
      to: draft.to.join(","),
      su: draft.subject,
      body,
    });
    if (draft.cc.length) params.set("cc", draft.cc.join(","));
    if (senderEmail) params.set("authuser", senderEmail);
    /* `+` → `%20` ให้เป็น URL encoding ล้วน ๆ (เหตุผลเดียวกับ `notify-modal.tsx`) */
    return `https://mail.google.com/mail/?${params.toString().replace(/\+/g, "%20")}`;
  };
  const full = build(draft.body);
  if (!short && full.length <= URL_LIMIT) return { url: full, shortened: false };
  return { url: build(draft.shortBody), shortened: true };
}

export function NotifyButton({
  periodCode,
  owner,
  onlyOwners,
  label,
  warnMultiple = false,
}: {
  periodCode: string;
  /** ระบุ = แจ้งฝ่ายเดียว · ไม่ระบุ = ดึงทุกฝ่ายแล้วกรองด้วย `onlyOwners` */
  owner?: IntakeOwner;
  onlyOwners?: IntakeOwner[];
  label: string;
  /** ขึ้นคำเตือนบนปุ่มว่าจะมีหลายแท็บ */
  warnMultiple?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<NotifyResponse | null>(null);

  async function load() {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ period: periodCode });
      if (owner) qs.set("owner", owner);
      const res = await fetch(`/api/payroll/notify?${qs.toString()}`);
      const json = (await res.json().catch(() => ({}))) as Partial<NotifyResponse> & {
        error?: string;
      };
      if (!res.ok || !json.drafts) {
        void toastError("ร่างอีเมลไม่สำเร็จ", json.error ?? "ลองใหม่อีกครั้ง");
        return;
      }
      const drafts = onlyOwners
        ? json.drafts.filter((d) => onlyOwners.includes(d.owner))
        : json.drafts;
      if (drafts.length === 0) {
        void toastSuccess("ไม่มีฝ่ายที่ต้องแจ้ง", "ทุกฝ่ายส่งครบแล้ว");
        return;
      }
      setData({ senderEmail: json.senderEmail ?? null, drafts });
    } catch {
      void toastError("ร่างอีเมลไม่สำเร็จ", "เชื่อมต่อระบบไม่ได้ ลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={load}
        disabled={loading}
        title={
          warnMultiple
            ? "จะเปิดหน้าเขียนเมลของ Gmail ทีละฝ่าย หลายแท็บ — เปิดทีละแท็บตามที่กด"
            : undefined
        }
        className="flex items-center gap-1.5 rounded-field border border-line px-2.5 py-1.5 text-12-5 text-mut transition-colors hover:border-primary/40 hover:text-ink disabled:opacity-50"
      >
        <Mail size={13} strokeWidth={1.9} aria-hidden />
        {loading ? "กำลังร่างอีเมล…" : label}
        {warnMultiple ? <span className="text-11-5">(หลายแท็บ)</span> : null}
      </button>

      {data ? <DraftDialog data={data} onClose={() => setData(null)} /> : null}
    </>
  );
}

function DraftDialog({ data, onClose }: { data: NotifyResponse; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ร่างอีเมลแจ้งฝ่าย"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-box border border-line bg-base-100 p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-14 font-semibold">ร่างอีเมลแจ้งฝ่าย</h2>
            <p className="mt-0.5 text-12-5 text-mut text-pretty">
              ระบบไม่ได้ส่งเมลให้ — กด “เปิด Gmail” แล้วตรวจก่อนกดส่งจากบัญชีของคุณเอง
              ผู้รับจะต้องเข้าสู่ระบบก่อนจึงจะเห็นรายการของฝ่ายตัวเอง
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="rounded-field p-1 text-mut hover:text-ink"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <ul className="mt-3 space-y-2.5">
          {data.drafts.map((draft) => (
            <DraftRow key={draft.owner} draft={draft} senderEmail={data.senderEmail} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function DraftRow({
  draft,
  senderEmail,
}: {
  draft: NotifyDraft;
  senderEmail: string | null;
}) {
  const noRecipient = draft.to.length === 0;

  function open() {
    const { url, shortened } = gmailUrl(draft, senderEmail, false);
    const win = window.open(url, "_blank");
    if (!win) {
      void toastError(
        "เบราว์เซอร์บล็อกป๊อปอัป",
        "อนุญาตป๊อปอัปของเว็บนี้ แล้วกดอีกครั้ง — หรือกด “คัดลอก” ไปวางใน Gmail เอง",
      );
      return;
    }
    if (shortened) {
      void toastSuccess(
        "เปิด Gmail แล้ว (เนื้อฉบับย่อ)",
        "รายการเยอะเกินจะส่งผ่านลิงก์ได้ครบ — กด “คัดลอก” เพื่อเอาฉบับเต็มไปวางแทน",
      );
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${draft.subject}\n\n${draft.body}`);
      void toastSuccess("คัดลอกแล้ว", draft.owner);
    } catch {
      void toastError("คัดลอกไม่สำเร็จ", "เบราว์เซอร์ไม่อนุญาตให้เข้าถึงคลิปบอร์ด");
    }
  }

  return (
    <li className="rounded-box border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-13 font-semibold">{draft.owner}</span>
        {draft.directoryMissing ? (
          <span className="flex items-center gap-1 rounded-field bg-warning/15 px-2 py-0.5 text-12 font-medium text-warning">
            <TriangleAlert size={12} aria-hidden />
            ยังไม่ได้ผูกรหัสหน่วยงาน — ต้องกรอกผู้รับเอง
          </span>
        ) : noRecipient ? (
          <span className="flex items-center gap-1 rounded-field bg-warning/15 px-2 py-0.5 text-12 font-medium text-warning">
            <TriangleAlert size={12} aria-hidden />
            ไม่พบหัวหน้าหรือผู้จัดการที่มีอีเมลใช้ได้ — ต้องกรอกผู้รับเอง
          </span>
        ) : null}
        <span className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={copy}
            className="flex items-center gap-1 rounded-field border border-line px-2 py-1 text-12 text-mut hover:text-ink"
          >
            <Copy size={12} aria-hidden />
            คัดลอก
          </button>
          <button
            type="button"
            onClick={open}
            className="flex items-center gap-1 rounded-field bg-primary px-2.5 py-1 text-12 font-medium text-primary-content"
          >
            <Mail size={12} aria-hidden />
            เปิด Gmail
          </button>
        </span>
      </div>

      <dl className="mt-1.5 space-y-0.5 text-12 text-mut">
        <div>
          <dt className="inline">ถึง: </dt>
          <dd className="inline break-all">{draft.to.join(", ") || "—"}</dd>
        </div>
        {draft.cc.length ? (
          <div>
            <dt className="inline">สำเนา: </dt>
            <dd className="inline break-all">{draft.cc.join(", ")}</dd>
          </div>
        ) : null}
      </dl>

      {draft.skipped.length ? (
        <p className="mt-1.5 text-12 text-warning text-pretty">
          อีเมลของ {draft.skipped.map((s) => s.name).join(", ")} ในระบบใช้ไม่ได้ จึงไม่ถูกใส่เป็นผู้รับ
        </p>
      ) : null}
    </li>
  );
}
