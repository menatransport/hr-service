"use client";

import { useRef, useState } from "react";
import { Check, Copy, Mail, TriangleAlert } from "lucide-react";

import { ModalShell } from "@/components/ui/modal-shell";
import { gmailCompose } from "@/lib/payroll/notify-compose";
import type { NotifyDraft } from "@/lib/payroll/notify";
import type { IntakeOwner } from "@/lib/payroll/registry";
import { toastError, toastSuccess, toastWarn } from "@/lib/swal";

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

export function NotifyButton({
  periodCode,
  owner,
  onlyOwners,
  label,
}: {
  periodCode: string;
  /** ระบุ = แจ้งฝ่ายเดียว · ไม่ระบุ = ดึงทุกฝ่ายแล้วกรองด้วย `onlyOwners` */
  owner?: IntakeOwner;
  onlyOwners?: IntakeOwner[];
  label: string;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
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
        ref={trigger}
        type="button"
        onClick={load}
        disabled={loading}
        className="flex items-center gap-1.5 rounded-field border border-line px-2.5 py-1.5 text-12-5 text-mut transition-colors hover:border-primary/40 hover:text-ink disabled:opacity-50"
      >
        <Mail size={13} strokeWidth={1.9} aria-hidden />
        {loading ? "กำลังร่างอีเมล…" : label}
      </button>

      {data ? (
        <DraftDialog
          data={data}
          onClose={() => {
            setData(null);
            /* คืนโฟกัสให้ปุ่มที่เปิด — `ModalShell` ย้ายโฟกัสเข้ากล่องตอนเปิดแต่ไม่คืนตอนปิด */
            trigger.current?.focus();
          }}
        />
      ) : null}
    </>
  );
}

function DraftDialog({ data, onClose }: { data: NotifyResponse; onClose: () => void }) {
  /* ฝ่ายที่กด “เปิด Gmail” สำเร็จแล้ว — เปิดหน้าเขียนเมล **ไม่ใช่** ส่งเมล
     ผู้ใช้ยังต้องกดส่งในแท็บนั้นเอง จึงนับได้แค่ “เปิดแล้ว” */
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const markOpened = (owner: string) =>
    setOpened((was) => new Set(was).add(owner));

  return (
    <ModalShell
      title="ร่างอีเมลแจ้งฝ่าย"
      onClose={onClose}
      width="640px"
      tone="plain"
      subtitle={
        <>
          <span className="font-mono tabular-nums">
            เปิดแล้ว {opened.size}/{data.drafts.length}
          </span>
          <span>
            ระบบไม่ได้ส่งเมลให้ — “เปิด Gmail” แค่เปิดหน้าเขียนเมลที่กรอกไว้แล้ว
            ต้องกดส่งเองในแท็บนั้น
          </span>
        </>
      }
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded-field border border-line px-3 py-1.5 text-13 text-mut hover:text-ink"
        >
          ปิด
        </button>
      }
    >
      <p className="text-12-5 text-mut text-pretty">
        ผู้รับต้องเข้าสู่ระบบก่อนจึงจะเห็นรายการของฝ่ายตัวเอง
      </p>
      <ul className="space-y-2.5">
        {data.drafts.map((draft) => (
          <DraftRow
            key={draft.owner}
            draft={draft}
            senderEmail={data.senderEmail}
            opened={opened.has(draft.owner)}
            onOpened={() => markOpened(draft.owner)}
          />
        ))}
      </ul>
    </ModalShell>
  );
}

function DraftRow({
  draft,
  senderEmail,
  opened,
  onOpened,
}: {
  draft: NotifyDraft;
  senderEmail: string | null;
  opened: boolean;
  onOpened: () => void;
}) {
  const noRecipient = draft.to.length === 0;
  /* คำนวณตอน render เพื่อบอกก่อนกด ไม่ใช่รู้หลังเปิดไปแล้ว */
  const { url, shortened } = gmailCompose(draft, senderEmail);

  function open() {
    const win = window.open(url, "_blank");
    if (!win) {
      void toastError(
        "เบราว์เซอร์บล็อกป๊อปอัป",
        "อนุญาตป๊อปอัปของเว็บนี้ แล้วกดอีกครั้ง — หรือกด “คัดลอก” ไปวางใน Gmail เอง",
      );
      return;
    }
    onOpened();
    if (shortened) {
      void toastWarn(
        "เปิดได้แค่เนื้อเมลฉบับย่อ",
        "รายการเยอะเกินจะส่งผ่านลิงก์ได้ครบ — ใช้ “คัดลอก” เพื่อเอาฉบับเต็มไปวางแทน",
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

  const primary =
    "flex items-center gap-1 rounded-field bg-primary px-2.5 py-1 text-12 font-medium text-primary-content";
  const secondary =
    "flex items-center gap-1 rounded-field border border-line px-2 py-1 text-12 text-mut hover:text-ink";

  const copyButton = (
    <button type="button" onClick={copy} className={shortened ? primary : secondary}>
      <Copy size={12} aria-hidden />
      คัดลอก
    </button>
  );
  const openButton = (
    <button type="button" onClick={open} className={shortened ? secondary : primary}>
      <Mail size={12} aria-hidden />
      {opened ? "เปิด Gmail อีกครั้ง" : shortened ? "เปิด Gmail (ฉบับย่อ)" : "เปิด Gmail"}
    </button>
  );

  return (
    <li className="rounded-box border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-13 font-semibold">{draft.owner}</span>
        {opened ? (
          <span className="flex items-center gap-1 rounded-field bg-soft px-2 py-0.5 text-12 font-medium text-primary">
            <Check size={12} aria-hidden />
            เปิดแล้ว
          </span>
        ) : null}
        {draft.directoryMissing ? (
          <Badge>ยังไม่ได้ผูกรหัสหน่วยงาน — ต้องกรอกผู้รับเอง</Badge>
        ) : noRecipient ? (
          <Badge>ไม่พบหัวหน้าหรือผู้จัดการที่มีอีเมลใช้ได้ — ต้องกรอกผู้รับเอง</Badge>
        ) : null}
        {shortened ? <Badge>เนื้อยาวเกินลิงก์ จะเปิดฉบับย่อ</Badge> : null}
        <span className="ml-auto flex gap-2">
          {shortened ? copyButton : openButton}
          {shortened ? openButton : copyButton}
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

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1 rounded-field bg-warning/15 px-2 py-0.5 text-12 font-medium text-warning">
      <TriangleAlert size={12} aria-hidden />
      {children}
    </span>
  );
}
