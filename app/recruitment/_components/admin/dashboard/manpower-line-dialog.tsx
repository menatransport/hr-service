"use client";

import { useMemo, useState } from "react";
import { Check, Copy, ExternalLink, RotateCcw } from "lucide-react";

import { ModalShell } from "@/components/ui/modal-shell";
import {
  LINE_EMOJI_RE,
  buildLineMessage,
  lineDigitOf,
  scopeLabel,
  type LineKind,
  type LineOptions,
  type MpBoard,
  type MpScope,
} from "@/app/recruitment/_lib/dashboard/manpower-daily-shared";

/**
 * ข้อความสรุป Manpower ส่งกลุ่มไลน์ — สร้างจากข้อมูลชุดเดียวกับแดชบอร์ด (ขอบเขตตามแถบบนหน้า)
 * · แก้ก่อนส่งได้ · “คัดลอก” แบบเดียวกับ RC Alert · “เปิด LINE” = หน้าแชร์ของ LINE พร้อมข้อความ
 *   (ส่งจริงเมื่อเลือกห้องแชทแล้วกดส่งใน LINE เท่านั้น ระบบไม่ส่งเอง)
 * · กล่องนี้ถูก portal ออกนอก `.dash` จึงใช้สีธีมระบบ ไม่ใช่ตัวแปร `--dash-*`
 */
export function ManpowerLineDialog({ board, scope, onClose }: { board: MpBoard; scope: MpScope; onClose: () => void }) {
  const [opt, setOpt] = useState<LineOptions>({ kind: "day", icons: true, vacancies: false, digits: "line" });
  const generated = useMemo(() => buildLineMessage(board, scope, opt, new Date()), [board, scope, opt]);
  const [edited, setEdited] = useState<{ base: string; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  /* เปลี่ยนตัวเลือก = สร้างใหม่ (ทิ้งที่แก้ไว้) · ข้อความที่แก้ผูกกับข้อความต้นทางที่แก้จาก */
  const text = edited?.base === generated ? edited.text : generated;
  const isEdited = edited?.base === generated && edited.text !== generated;
  const set = <K extends keyof LineOptions>(k: K, v: LineOptions[K]) => setOpt((o) => ({ ...o, [k]: v }));

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setError("");
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("คัดลอกไม่สำเร็จ — เลือกข้อความในช่องแล้วคัดลอกเองได้");
    }
  }

  return (
    <ModalShell
      title="ข้อความสรุป Manpower · ส่งกลุ่มไลน์"
      subtitle={<span className="text-12 text-mut">ขอบเขต: {scopeLabel(scope)} · ตรวจ/แก้ก่อนส่งได้</span>}
      onClose={onClose}
      width="860px"
      tone="plain"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-sec mr-auto px-4 py-2 text-13">
            ปิด
          </button>
          {error ? <span className="text-12 text-alert">{error}</span> : null}
          <a
            href={`https://line.me/R/share?text=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-sec flex items-center gap-1.5 px-4 py-2 text-13"
          >
            <ExternalLink size={15} aria-hidden />
            เปิด LINE เลือกห้องแชท
          </a>
          <button
            type="button"
            onClick={copy}
            disabled={!text}
            className="flex cursor-pointer items-center gap-1.5 rounded-field bg-chat px-4 py-2 text-13 font-semibold text-white shadow-[0_4px_12px_-6px] shadow-chat transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
            {copied ? "คัดลอกแล้ว" : "คัดลอก"}
          </button>
        </>
      }
    >
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <Seg
          label="รอบรายงาน"
          value={opt.kind}
          onChange={(v) => set("kind", v as LineKind)}
          options={[
            { value: "day", label: "รายวัน" },
            { value: "week", label: "รายสัปดาห์" },
            { value: "month", label: "รายเดือน" },
          ]}
        />
        <Seg
          label="รูปแบบ"
          value={opt.icons ? "icon" : "plain"}
          onChange={(v) => set("icons", v === "icon")}
          options={[
            { value: "icon", label: opt.kind === "day" ? "สรุปสถานะ (อีโมจิ)" : "มีไอคอน" },
            { value: "plain", label: "ทางการ" },
          ]}
        />
        {opt.kind === "day" && opt.icons ? (
          <Seg
            label="ตัวเลข"
            value={opt.digits}
            onChange={(v) => set("digits", v as LineOptions["digits"])}
            options={[
              { value: "line", label: "อีโมจิ LINE (two)" },
              { value: "unicode", label: "อีโมจิทั่วไป 2️⃣" },
            ]}
          />
        ) : null}
        <Seg
          label="รายละเอียด"
          value={opt.vacancies ? "yes" : "no"}
          onChange={(v) => set("vacancies", v === "yes")}
          options={[
            { value: "no", label: "ยอดรวม" },
            { value: "yes", label: "+ ลูกค้าที่ยังว่าง" },
          ]}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="flex items-center justify-between text-12 text-mut">
            ข้อความ (แก้ไขได้)
            {isEdited ? (
              <button type="button" onClick={() => setEdited(null)} className="btn-ghost flex items-center gap-1 px-2 py-0.5 text-12">
                <RotateCcw size={12} aria-hidden />
                คืนค่าจากระบบ
              </button>
            ) : null}
          </span>
          <textarea
            value={text}
            onChange={(e) => setEdited({ base: generated, text: e.target.value })}
            spellCheck={false}
            rows={20}
            className="field-ring min-h-80 w-full resize-y rounded-field border border-line bg-base-100 px-3.5 py-3 font-mono text-12-5 leading-relaxed outline-none focus:border-primary/60"
          />
          <span className="text-11-5 text-mut">{text.length.toLocaleString("th-TH")} ตัวอักษร</span>
        </label>

        {/* ตัวอย่างในห้องแชท */}
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-12 text-mut">ตัวอย่างในกลุ่มไลน์</span>
          <div className="max-h-[520px] overflow-y-auto rounded-box bg-[#1f2128] p-3">
            <p className="mb-1 ml-1 text-11 text-white/55">RC · ฝ่ายบุคคล</p>
            <div className="rounded-2xl rounded-tl-md bg-[#2c2f37] px-3 py-2.5 text-12-5 leading-relaxed break-words whitespace-pre-wrap text-white/90">
              <LineText text={text} />
            </div>
          </div>
          {opt.kind === "day" && opt.icons && opt.digits === "line" ? (
            <span className="text-11-5 text-mut">
              รหัส (two) (up) … เป็นอีโมจิของ LINE — ถ้าวางแล้วไม่ขึ้นเป็นรูป ให้เลือก “อีโมจิทั่วไป”
            </span>
          ) : null}
        </div>
      </div>
    </ModalShell>
  );
}

function Seg({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-12 text-mut">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex rounded-field border border-line bg-base-100 p-0.5">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.value)}
              className={`h-8 cursor-pointer rounded-[calc(var(--radius-field)-2px)] px-3 text-12-5 whitespace-nowrap transition-colors ${
                on ? "bg-primary font-semibold text-primary-content" : "text-mut hover:text-ink"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ ตัวอย่างแบบ LINE */

/* สีตัวเลขอีโมจิ LINE (ตัวเลขฟองสีพาสเทลขอบขาว) · ลูกศรขึ้น = ชมพู ลง = ฟ้า เท่ากับ = ชมพู — เลียนแบบภาพที่ RC ส่งจริง */
const DIGIT_COLOR = ["#f9a8d4", "#f9a8d4", "#f9a8d4", "#93c5fd", "#67e8f9", "#c4b5fd", "#fdba74", "#fde047", "#86efac", "#f9a8d4"];
const ARROW: Record<string, { ch: string; color: string }> = {
  up: { ch: "↑", color: "#f472b6" },
  down: { ch: "↓", color: "#22d3ee" },
  "=": { ch: "=", color: "#f472b6" },
};

/** ข้อความ → แทนรหัส `(two)` `(up)` ด้วยภาพเลียนแบบอีโมจิ LINE (เฉพาะกล่องตัวอย่าง — ข้อความที่คัดลอกยังเป็นรหัส) */
function LineText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(LINE_EMOJI_RE)) {
    const i = m.index ?? 0;
    if (i > last) parts.push(text.slice(last, i));
    const word = m[1];
    const d = lineDigitOf(word);
    const a = ARROW[word];
    parts.push(
      d >= 0 ? (
        <span
          key={i}
          className="mx-[1.5px] inline-block align-[-4px] text-[22px] leading-none font-black"
          style={{ color: DIGIT_COLOR[d], WebkitTextStroke: "1.5px #fff", paintOrder: "stroke fill", fontFamily: "'Arial Rounded MT Bold', 'Nunito', system-ui, sans-serif" }}
        >
          {d}
        </span>
      ) : (
        <span key={i} className="mx-1 inline-block align-[-3px] text-[19px] leading-none font-black" style={{ color: a.color }}>
          {a.ch}
        </span>
      ),
    );
    last = i + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
