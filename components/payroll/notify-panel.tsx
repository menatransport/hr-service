"use client";

import { useMemo, useRef, useState } from "react";
import { Bookmark, BookmarkX, Check, Copy, Mail, TriangleAlert } from "lucide-react";

import { ModalShell } from "@/components/ui/modal-shell";
import { gmailCompose, parseRecipients } from "@/lib/payroll/notify-compose";
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
            ต้องกดส่งเองในแท็บนั้น · ผู้รับและสำเนาแก้ได้ในช่องของแต่ละฝ่าย
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
  /* ผู้รับที่มาจากสมุดรายชื่อเป็นแค่ **ค่าเริ่มต้น** — HR แก้ได้ก่อนกดเปิด Gmail
     เพราะบางฝ่ายยังไม่ได้ผูกรหัสหน่วยงาน (ผู้รับว่าง) บางรอบต้องส่งถึงคนที่ไม่ใช่
     หัวหน้า/ผู้จัดการ และบางคนอีเมลในระบบใช้ไม่ได้ · ที่แก้อยู่แค่ในกล่องนี้
     ไม่ได้เขียนกลับเข้าสมุดรายชื่อ ซึ่งเป็นข้อมูลของ NCAC ไม่ใช่ของหน้านี้ */
  const [toText, setToText] = useState(draft.to.join(", "));
  const [ccText, setCcText] = useState(draft.cc.join(", "));
  /* ป้าย "บันทึกไว้แล้ว" ต้องขยับตามการกดในกล่องนี้ ไม่ใช่ค้างค่าที่โหลดมาตอนเปิด */
  const [stamp, setStamp] = useState<{ by: string; at: string } | null>(
    draft.savedBy && draft.savedAt ? { by: draft.savedBy, at: draft.savedAt } : null,
  );
  const [busy, setBusy] = useState(false);

  const to = useMemo(() => parseRecipients(toText), [toText]);
  const cc = useMemo(() => parseRecipients(ccText), [ccText]);
  const invalid = [...to.invalid, ...cc.invalid];

  /* คำนวณตอน render เพื่อบอกก่อนกด ไม่ใช่รู้หลังเปิดไปแล้ว · ผู้รับที่พิมพ์เองนับความยาว
     ลิงก์ด้วย ใส่ผู้รับเยอะจึงพลิกไปเป็นฉบับย่อได้ และป้ายจะเปลี่ยนให้เห็นทันที */
  const { url, shortened } = gmailCompose(
    { ...draft, to: to.emails, cc: cc.emails },
    senderEmail,
  );

  function open() {
    /* ไม่มีผู้รับก็เปิดได้ในทางเทคนิค แต่ได้หน้าเขียนเมลเปล่าที่คนต้องมาพิมพ์เองอยู่ดี
       — บอกตรงนี้ดีกว่าให้ไปรู้ตัวที่แท็บ Gmail */
    if (to.emails.length === 0) {
      void toastWarn("ยังไม่มีผู้รับ", "กรอกอีเมลในช่อง “ถึง” ก่อน แล้วกดเปิดอีกครั้ง");
      return;
    }
    if (invalid.length) {
      void toastWarn(
        "อีเมลบางตัวยังไม่ถูกรูปแบบ",
        `${invalid.join(", ")} — แก้ก่อน ไม่งั้นจะไม่ถูกใส่เป็นผู้รับ`,
      );
      return;
    }

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
    /* ก็อปไปวางใน Gmail เองตอนลิงก์ยาวเกิน — ผู้รับที่แก้ไว้ต้องไปด้วย ไม่งั้นต้องพิมพ์ใหม่ */
    const header = [
      `ถึง: ${to.emails.join(", ") || "—"}`,
      cc.emails.length ? `สำเนา: ${cc.emails.join(", ")}` : null,
      `หัวเรื่อง: ${draft.subject}`,
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(`${header.join("\n")}\n\n${draft.body}`);
      void toastSuccess("คัดลอกแล้ว", draft.owner);
    } catch {
      void toastError("คัดลอกไม่สำเร็จ", "เบราว์เซอร์ไม่อนุญาตให้เข้าถึงคลิปบอร์ด");
    }
  }

  /** บันทึกผู้รับของฝ่ายนี้ไว้ใช้รอบหน้า — ทับสมุดรายชื่อจนกว่าจะกดล้าง */
  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/payroll/notify/recipients", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ owner: draft.owner, to: toText, cc: ccText }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        saved?: { updatedBy: string; updatedAt: string };
        error?: string;
      };
      if (!res.ok || !json.saved) {
        void toastError("บันทึกผู้รับไม่สำเร็จ", json.error ?? "ลองใหม่อีกครั้ง");
        return;
      }
      setStamp({ by: json.saved.updatedBy, at: json.saved.updatedAt });
      void toastSuccess("บันทึกผู้รับแล้ว", `รอบหน้าของ${draft.owner}จะใช้ชุดนี้`);
    } catch {
      void toastError("บันทึกผู้รับไม่สำเร็จ", "เชื่อมต่อระบบไม่ได้ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  /** ล้างของที่บันทึกไว้ — ช่องกลับไปเป็นผู้รับจากสมุดรายชื่อที่ API ส่งมาตอนเปิดกล่อง */
  async function clear() {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/payroll/notify/recipients?owner=${encodeURIComponent(draft.owner)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        void toastError("ล้างไม่สำเร็จ", json.error ?? "ลองใหม่อีกครั้ง");
        return;
      }
      setStamp(null);
      void toastSuccess("ล้างผู้รับที่บันทึกไว้แล้ว", "รอบหน้าจะกลับไปใช้สมุดรายชื่อ");
    } catch {
      void toastError("ล้างไม่สำเร็จ", "เชื่อมต่อระบบไม่ได้ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
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
          <Badge>ยังไม่ได้ผูกรหัสหน่วยงาน — กรอกผู้รับเองด้านล่าง</Badge>
        ) : to.emails.length === 0 ? (
          <Badge>ยังไม่มีผู้รับ — กรอกเองด้านล่าง</Badge>
        ) : null}
        {shortened ? <Badge>เนื้อยาวเกินลิงก์ จะเปิดฉบับย่อ</Badge> : null}
        <span className="ml-auto flex gap-2">
          {shortened ? copyButton : openButton}
          {shortened ? openButton : copyButton}
        </span>
      </div>

      <div className="mt-2 space-y-1.5">
        <RecipientField
          label="ถึง"
          value={toText}
          onChange={setToText}
          placeholder="somchai@menatransport.co.th, somsri@menatransport.co.th"
          invalid={to.invalid}
        />
        <RecipientField
          label="สำเนา"
          value={ccText}
          onChange={setCcText}
          placeholder="ว่างไว้ได้ ถ้าไม่ต้องส่งสำเนาใคร"
          invalid={cc.invalid}
        />
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={save}
          disabled={busy || to.emails.length === 0 || invalid.length > 0}
          className="flex items-center gap-1 text-12 text-mut transition-colors hover:text-primary disabled:opacity-40"
        >
          <Bookmark size={12} aria-hidden />
          {stamp ? "บันทึกทับของเดิม" : "บันทึกไว้ใช้รอบหน้า"}
        </button>

        {stamp ? (
          <>
            <button
              type="button"
              onClick={clear}
              disabled={busy}
              className="flex items-center gap-1 text-12 text-mut transition-colors hover:text-sla disabled:opacity-40"
            >
              <BookmarkX size={12} aria-hidden />
              กลับไปใช้สมุดรายชื่อ
            </button>
            <span className="text-11-5 text-mut">
              ใช้ผู้รับที่บันทึกไว้ · {stamp.by} แก้ล่าสุด {when(stamp.at)}
            </span>
          </>
        ) : (
          <span className="text-11-5 text-mut">ตอนนี้ใช้หัวหน้า/ผู้จัดการจากสมุดรายชื่อ</span>
        )}
      </div>

      {draft.skipped.length ? (
        <p className="mt-1.5 text-12 text-warning text-pretty">
          อีเมลของ {draft.skipped.map((s) => s.name).join(", ")} ในระบบใช้ไม่ได้ จึงไม่ถูกใส่เป็นผู้รับ
          — กรอกที่อยู่ที่ใช้ได้ในช่องด้านบนได้
        </p>
      ) : null}
    </li>
  );
}

/**
 * ช่องกรอกผู้รับ — คั่นหลายคนด้วยอะไรก็ได้ (`parseRecipients` รับทั้งจุลภาค เว้นวรรค
 * และขึ้นบรรทัดใหม่) ที่อยู่ที่รูปแบบไม่ผ่านขึ้นเตือนใต้ช่องทันที ไม่ใช่รอตอนกดเปิด
 */
function RecipientField({
  label,
  value,
  onChange,
  placeholder,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  invalid: string[];
}) {
  return (
    <label className="block">
      <span className="text-12 text-mut">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        className="mt-0.5 w-full rounded-field border border-line bg-transparent px-2 py-1 text-12 text-ink placeholder:text-mut/60 focus:border-primary/50 focus:outline-none"
      />
      {invalid.length ? (
        <span className="mt-0.5 block text-12 text-warning">
          ยังไม่ถูกรูปแบบ: {invalid.join(", ")}
        </span>
      ) : null}
    </label>
  );
}

/** `9 ต.ค. 14:30` — สั้นพอจะอยู่ท้ายบรรทัดได้ และบอกเวลาเพราะแก้ซ้ำในวันเดียวกันได้ */
function when(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return `${at.toLocaleDateString("th-TH", { day: "numeric", month: "short" })} ${at.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`;
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1 rounded-field bg-warning/15 px-2 py-0.5 text-12 font-medium text-warning">
      <TriangleAlert size={12} aria-hidden />
      {children}
    </span>
  );
}
