"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Copy, ExternalLink } from "lucide-react";

import { TextareaField } from "@/components/ui/field";
import { ModalShell } from "@/components/ui/modal-shell";
import { requestJson } from "@/lib/http";
import { toastError, toastSuccess } from "@/lib/swal";

/**
 * กล่อง “แจ้งหน่วยงานผู้รับผิดชอบทางอีเมล”
 *
 * **ระบบไม่ได้ส่งเมลเอง** — กดปุ่มแล้วเปิดหน้าเขียนเมลของ Gmail ในแท็บใหม่ โดยกรอก
 * ผู้รับ (TO/CC) หัวเรื่อง และเนื้อความไว้ให้ครบแล้ว ผู้ใช้ตรวจแล้วกดส่งจากบัญชีของ
 * ตัวเอง — บริษัทจึงไม่ต้องมีบัญชี Gmail กลาง และเมลที่ออกไปมีชื่อคนส่งจริงเสมอ
 * (เจ้าของงานสั่ง 8 ก.ย. 2026)
 *
 * ผู้รับมาจากเซิร์ฟเวอร์ (`GET …/notify`) ตามกฎ **TO = หัวหน้า · CC = ผู้จัดการ**
 * ของหน่วยงานที่ถือเคส — ติ๊กออกได้ทีละคนก่อนเปิด Gmail (เพิ่มคนนอกรายการทำที่
 * หน้าเขียนเมลของ Gmail ได้อยู่แล้ว ไม่ต้องมีช่องซ้ำที่นี่)
 */

interface Recipient {
  employeeId: string;
  name: string;
  position: string;
  levelLabel: string;
  email: string;
}

interface NotifyDraft {
  trackingNo: string;
  departmentLabel: string;
  subject: string;
  body: { intro: string; details: string };
  /** อีเมลของผู้ใช้ที่ล็อกอินอยู่ — บอก Gmail ว่าให้เปิดด้วยบัญชีไหน */
  senderEmail: string | null;
  to: Recipient[];
  cc: Recipient[];
  skipped: { name: string; position: string; email: string }[];
}

/**
 * เพดานข้อความเพิ่มเติม — เนื้อเมลทั้งฉบับเดินทางไปกับ **URL** ของหน้าเขียนเมล
 * ภาษาไทยหนึ่งตัวกินที่ 9 ตัวอักษรตอน encode ปล่อยยาวกว่านี้ URL จะทะลุเพดาน
 * (พิมพ์ยาวกว่านี้ให้ไปพิมพ์ต่อในหน้าเขียนเมลของ Gmail ซึ่งไม่มีข้อจำกัดนี้)
 */
const NOTE_LIMIT = 400;

/** ข้อความที่ผู้ส่งพิมพ์เพิ่มแทรกกลาง — เหตุผลอยู่ที่ `bodyOf` ใน `lib/case-notify.ts` */
const composeBody = (body: NotifyDraft["body"], note: string): string =>
  [body.intro, note.trim(), body.details].filter(Boolean).join("\n\n");

/**
 * URL หน้าเขียนเมลของ Gmail
 *
 * `authuser` ทำให้เปิดถูกบัญชีบนเครื่องที่ล็อกอิน Gmail ไว้หลายบัญชี · `fs=1` บังคับ
 * ให้เป็นหน้าต่างเขียนเมลเต็ม ไม่ใช่กล่องเล็กมุมจอที่ผู้ใช้มองข้าม
 */
function gmailUrl(draft: NotifyDraft, to: string[], cc: string[], note: string) {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: to.join(","),
    su: draft.subject,
    body: composeBody(draft.body, note),
  });
  if (cc.length) params.set("cc", cc.join(","));
  if (draft.senderEmail) params.set("authuser", draft.senderEmail);
  /* `URLSearchParams` เข้ารหัสช่องว่างเป็น `+` ตามแบบฟอร์ม — เปลี่ยนเป็น `%20`
     ให้เป็น URL encoding ล้วน ๆ กันตัวอ่านฝั่ง Gmail แสดง `+` ออกมาตรง ๆ ในเนื้อเมล */
  return `https://mail.google.com/mail/?${params.toString().replace(/\+/g, "%20")}`;
}

export function NotifyModal({
  trackingNo,
  onClose,
}: {
  trackingNo: string;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<NotifyDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [opened, setOpened] = useState(false);

  /** อีเมลที่ยัง “ติ๊กอยู่” — ตั้งต้นเป็นทุกคนที่เซิร์ฟเวอร์เสนอมา */
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    requestJson<NotifyDraft>(
      `/api/cases/${encodeURIComponent(trackingNo)}/notify`,
      {},
      "เตรียมอีเมลไม่สำเร็จ",
    )
      .then((data) => {
        if (!alive) return;
        setDraft(data);
        setPicked(new Set([...data.to, ...data.cc].map((r) => r.email)));
      })
      .catch((err: Error) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [trackingNo]);

  const toggle = useCallback((email: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }, []);

  const to = draft?.to.filter((r) => picked.has(r.email)).map((r) => r.email) ?? [];
  const cc = draft?.cc.filter((r) => picked.has(r.email)).map((r) => r.email) ?? [];

  const preview = useMemo(
    () => (draft ? composeBody(draft.body, note) : ""),
    [draft, note],
  );

  const canOpen = Boolean(draft) && to.length > 0;

  function openGmail() {
    if (!draft || !canOpen) return;

    /**
     * **ห้ามส่ง `noopener` ใน features ของ `window.open`** — ตามสเปกแล้วกรณีนั้น
     * ฟังก์ชันจะคืน `null` เสมอ **แม้เปิดแท็บสำเร็จ** ทำให้แยกไม่ออกจากตอนถูกบล็อก
     * (ผู้ใช้จะเห็นข้อความ “ถูกบล็อก” ทุกครั้งทั้งที่ Gmail เปิดขึ้นมาแล้ว)
     *
     * จึงเปิดแบบธรรมดาเพื่อให้เช็กผลได้จริง แล้วค่อยตัดสาย `opener` เองทีหลัง —
     * ห่อ try/catch ไว้เพราะแท็บที่ข้ามโดเมนไปแล้วอาจไม่ให้เขียนพร็อพเพอร์ตี้นี้
     */
    const win = window.open(gmailUrl(draft, to, cc, note), "_blank");
    if (!win) {
      toastError(
        "เบราว์เซอร์บล็อกแท็บใหม่",
        "อนุญาตป๊อปอัปของเว็บนี้ แล้วกดอีกครั้ง — หรือกด “คัดลอกเนื้อหา” ไปวางใน Gmail เอง",
      );
      return;
    }
    try {
      win.opener = null;
    } catch {
      /* เขียนไม่ได้ก็ไม่เป็นไร — ปลายทางเป็นโดเมนของ Google ไม่ใช่หน้าที่ไม่รู้จัก */
    }
    setOpened(true);
    toastSuccess("เปิด Gmail แล้ว", "ตรวจความถูกต้องแล้วกดส่งในแท็บใหม่ได้เลย");
  }

  async function copyBody() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(
        `ถึง: ${to.join(", ")}\nสำเนา: ${cc.join(", ") || "—"}\nหัวเรื่อง: ${draft.subject}\n\n${preview}`,
      );
      toastSuccess("คัดลอกแล้ว", "วางในหน้าเขียนเมลได้เลย");
    } catch {
      toastError("คัดลอกไม่สำเร็จ", "เบราว์เซอร์ไม่อนุญาตให้เข้าถึงคลิปบอร์ด");
    }
  }

  return (
    <ModalShell
      title="แจ้งหน่วยงานผู้รับผิดชอบทางอีเมล"
      subtitle={
        draft ? (
          <>
            <span className="font-medium text-ink">{draft.trackingNo}</span>
            <span aria-hidden>·</span>
            <span>{draft.departmentLabel}</span>
            <span aria-hidden>·</span>
            <span>ส่งจากบัญชี Gmail ของคุณเอง</span>
          </>
        ) : (
          <span>{trackingNo}</span>
        )
      }
      onClose={onClose}
      width="720px"
      tone="plain"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="mr-auto rounded-field border border-line px-3.5 py-2 text-[13px] text-mut transition-colors hover:text-ink"
          >
            {opened ? "เสร็จแล้ว" : "ปิด"}
          </button>

          <button
            type="button"
            onClick={copyBody}
            disabled={!draft}
            className="flex items-center gap-2 rounded-field border border-line px-3.5 py-2 text-[13px] text-mut transition-colors hover:text-ink disabled:opacity-45"
          >
            <Copy size={15} strokeWidth={1.9} aria-hidden />
            คัดลอกเนื้อหา
          </button>

          <button
            type="button"
            onClick={openGmail}
            disabled={!canOpen}
            className="flex items-center gap-2 rounded-field bg-primary px-4 py-2 text-[13px] font-medium text-primary-content transition-opacity hover:opacity-90 disabled:opacity-45"
          >
            <ExternalLink size={15} strokeWidth={2} aria-hidden />
            {opened ? "เปิด Gmail อีกครั้ง" : `เปิด Gmail (${to.length + cc.length})`}
          </button>
        </>
      }
    >
      {error ? (
        <p className="rounded-field border border-alert/30 bg-alert/10 px-3.5 py-3 text-[13px] leading-relaxed text-ink">
          {error}
        </p>
      ) : !draft ? (
        <p className="px-1 py-6 text-center text-[13px] text-mut">กำลังเตรียมอีเมล…</p>
      ) : (
        <>
          <p className="rounded-field border border-line bg-base-200/60 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-mut">
            ระบบจะ<span className="text-ink"> ไม่ส่งอีเมลเอง </span>— กด “เปิด Gmail”
            แล้วหน้าเขียนเมลจะขึ้นมาพร้อมผู้รับและเนื้อหาครบ ตรวจแล้วกดส่งได้เลย
            {draft.senderEmail ? (
              <>
                {" "}(บัญชี <span className="text-ink">{draft.senderEmail}</span>)
              </>
            ) : null}
          </p>

          <RecipientBlock
            label="ถึง (TO)"
            hint="หัวหน้าของหน่วยงานผู้รับผิดชอบ"
            people={draft.to}
            picked={picked}
            onToggle={toggle}
            emptyHint="ไม่พบหัวหน้าที่มีอีเมลในหน่วยงานนี้"
          />

          <RecipientBlock
            label="สำเนา (CC)"
            hint="ผู้จัดการของหน่วยงานเดียวกัน"
            people={draft.cc}
            picked={picked}
            onToggle={toggle}
            emptyHint="ไม่มีผู้จัดการที่ต้องสำเนาถึง"
          />

          {draft.skipped.length ? (
            <div className="flex gap-2.5 rounded-field border border-sla/35 bg-sla/10 px-3.5 py-3">
              <AlertTriangle
                size={16}
                strokeWidth={2}
                className="mt-0.5 flex-none text-sla"
                aria-hidden
              />
              <div className="min-w-0 text-[12.5px] leading-relaxed">
                <p className="font-medium">
                  ข้ามไป {draft.skipped.length} คน — อีเมลในสมุดรายชื่อใช้ไม่ได้
                </p>
                <p className="text-mut">
                  {draft.skipped.map((s) => `${s.name} (${s.email})`).join(" · ")}
                </p>
              </div>
            </div>
          ) : null}

          <TextareaField
            id="notify-note"
            label="ข้อความเพิ่มเติม"
            optional
            rows={3}
            value={note}
            onChange={(v) => setNote(v.slice(0, NOTE_LIMIT))}
            hint={`แทรกไว้ก่อนรายละเอียดเคส · เหลือ ${NOTE_LIMIT - note.length} ตัวอักษร — พิมพ์ต่อในหน้าเขียนเมลของ Gmail ได้ไม่จำกัด`}
            placeholder="เช่น เร่งด่วน กรุณาตอบกลับภายในวันนี้"
          />

          <details className="rounded-field border border-line bg-base-200/60">
            <summary className="cursor-pointer px-3.5 py-2.5 text-[13px] font-medium">
              ดูตัวอย่างอีเมล
            </summary>
            <div className="flex flex-col gap-2 border-t border-line px-3.5 py-3">
              <p className="text-[12px] text-mut">
                หัวเรื่อง · <span className="text-ink">{draft.subject}</span>
              </p>
              {/* ข้อความล้วนล้วน ๆ — Gmail รับเนื้อความผ่าน URL ได้แค่แบบนี้
                  จึงโชว์ตรงตามที่จะไปโผล่ในหน้าเขียนเมลจริง ไม่ตกแต่งเพิ่ม */}
              <pre className="max-h-[300px] overflow-auto rounded-field border border-line bg-base-100 px-3 py-2.5 text-[12px] leading-relaxed whitespace-pre-wrap">
                {preview}
              </pre>
            </div>
          </details>
        </>
      )}
    </ModalShell>
  );
}

/* ---------------------------------------------------------------- ผู้รับหนึ่งกลุ่ม */

function RecipientBlock({
  label,
  hint,
  people,
  picked,
  onToggle,
  emptyHint,
}: {
  label: string;
  hint: string;
  people: Recipient[];
  picked: Set<string>;
  onToggle: (email: string) => void;
  emptyHint: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <h3 className="text-[13px] font-semibold">{label}</h3>
        <p className="text-[12px] text-mut">{hint}</p>
      </div>

      {people.length ? (
        <ul className="flex flex-col gap-1.5">
          {people.map((r) => {
            const on = picked.has(r.email);
            return (
              <li key={r.email}>
                <button
                  type="button"
                  onClick={() => onToggle(r.email)}
                  aria-pressed={on}
                  className={`flex w-full items-center gap-3 rounded-field border px-3 py-2 text-left transition-colors ${
                    on
                      ? "border-primary/40 bg-primary/8"
                      : "border-line bg-base-200/50 opacity-60"
                  }`}
                >
                  <span
                    className={`flex size-[18px] flex-none items-center justify-center rounded-[5px] border ${
                      on ? "border-primary bg-primary text-primary-content" : "border-line"
                    }`}
                    aria-hidden
                  >
                    {on ? <Check size={12} strokeWidth={3} /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">
                      {r.name}
                      <span className="ml-1.5 text-[11.5px] font-normal text-mut">
                        {r.levelLabel}
                      </span>
                    </span>
                    <span className="block truncate text-[11.5px] text-mut">
                      {r.email} · {r.position}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-field border border-dashed border-line px-3.5 py-2.5 text-[12.5px] text-mut">
          {emptyHint}
        </p>
      )}
    </section>
  );
}
