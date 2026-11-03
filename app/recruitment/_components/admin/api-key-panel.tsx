"use client";

import { useEffect, useId, useState } from "react";
import { Check, Copy, KeyRound, Loader2, Plus } from "lucide-react";

import { TextField } from "@/components/ui/field";
import { requestJson } from "@/lib/http";
import { runAction } from "@/lib/swal";
import { formatThaiDateTime } from "@/app/recruitment/_lib/drivers/types";
import type { ApiKeyInfo } from "@/lib/auth/api-keys";

/**
 * “API key ของฉัน” บนหน้า API Docs — สร้าง/ยกเลิก key ส่วนตัวที่ใช้เรียก API แทนการล็อกอิน
 *
 * key ผูกกับคนที่สร้าง: เรียกด้วย `x-api-key` แล้วได้ข้อมูล/สิทธิ์เดียวกับที่คนนั้นเห็นบนหน้าเว็บ
 * · key เต็มโชว์ครั้งเดียวหลังสร้าง (ฐานเก็บแค่ hash) · ค่าเริ่มต้นอ่านอย่างเดียว
 */

const COPY_MS = 1400;

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPY_MS);
    } catch {
      /* ไม่ได้สิทธิ์คลิปบอร์ด — ลากเลือกข้อความเองได้ */
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="btn-sec flex min-h-8 flex-none cursor-pointer items-center gap-1 px-2.5 text-12"
    >
      {copied ? <Check size={13} strokeWidth={2} aria-hidden /> : <Copy size={13} strokeWidth={2} aria-hidden />}
      {copied ? "คัดลอกแล้ว" : label}
    </button>
  );
}

export function ApiKeyPanel() {
  const id = useId();
  const [list, setList] = useState<ApiKeyInfo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [write, setWrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<{ key: string; info: ApiKeyInfo } | null>(null);

  useEffect(() => {
    requestJson<ApiKeyInfo[]>("/api/api-keys", {}, "โหลดรายการ key ไม่สำเร็จ")
      .then(setList)
      .catch((err: Error) => setLoadError(err.message));
  }, []);

  async function create() {
    setBusy(true);
    const out = await runAction({
      run: () =>
        requestJson<{ key: string; info: ApiKeyInfo }>("/api/api-keys", {
          method: "POST",
          body: { label, scope: write ? "write" : "read" },
        }),
      success: false,
      failureTitle: "สร้าง key ไม่สำเร็จ",
    });
    setBusy(false);
    if (out.status !== "done") return;
    setFresh(out.data);
    setList((l) => [out.data.info, ...(l ?? [])]);
    setLabel("");
    setWrite(false);
  }

  async function revoke(k: ApiKeyInfo) {
    const out = await runAction({
      confirm: {
        title: `ยกเลิก key “${k.label}”?`,
        text: "ระบบที่ใช้ key นี้อยู่จะเรียก API ไม่ได้ภายใน 1 นาที — กู้คืนไม่ได้ ต้องสร้างใหม่",
        confirmText: "ยกเลิก key",
        tone: "danger",
      },
      run: () => requestJson(`/api/api-keys/${k.id}`, { method: "DELETE" }),
      success: "ยกเลิก key แล้ว",
    });
    if (out.status !== "done") return;
    const now = new Date().toISOString();
    setList((l) => (l ?? []).map((x) => (x.id === k.id ? { ...x, active: false, revokedAt: now } : x)));
    if (fresh?.info.id === k.id) setFresh(null);
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const sampleKey = fresh?.key ?? "hrs_xxxxxxxx";
  const curl = `curl -H "x-api-key: ${sampleKey}" "${origin}/api/drivers?year=2569&month=10"`;

  return (
    <section id="api-key" className="sheet-bleed scroll-mt-20 border-y border-line">
      <h2 className="flex items-center gap-2 border-b border-line-strong bg-head px-(--sheet-px) py-3 text-14 font-semibold">
        <KeyRound size={15} strokeWidth={2} aria-hidden />
        API key ของฉัน
      </h2>

      <div className="grid gap-5 px-(--sheet-px) py-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        {/* ------------------------------------------------------ สร้าง */}
        <div className="flex flex-col gap-3">
          <p className="text-12-5 text-mut text-pretty">
            เรียก API จากระบบอื่นโดยไม่ต้องล็อกอิน — ใส่ header <code className="font-mono text-ink">x-api-key</code>{" "}
            แล้วจะได้ข้อมูลและสิทธิ์ <strong className="font-semibold text-ink">ชุดเดียวกับที่คุณเห็นบนหน้านี้</strong>{" "}
            การแก้ไขลงชื่อคุณ · อายุ 90 วัน · เก็บ key เป็นความลับเหมือนรหัสผ่าน
          </p>
          <TextField
            id={`${id}-label`}
            label="ชื่อ key"
            placeholder="เช่น ระบบรายงาน HR"
            value={label}
            onChange={setLabel}
          />
          <label className="flex cursor-pointer items-start gap-2 text-12-5">
            <input
              type="checkbox"
              className="checkbox checkbox-sm mt-0.5"
              checked={write}
              onChange={(e) => setWrite(e.target.checked)}
            />
            <span className="text-pretty">
              อนุญาตให้เขียนข้อมูล (POST · PUT · PATCH · DELETE)
              <span className="block text-11-5 text-mut">ไม่ติ๊ก = อ่านได้อย่างเดียว (GET) — แนะนำ</span>
            </span>
          </label>
          <button
            type="button"
            onClick={create}
            disabled={busy || !label.trim()}
            className="btn-pri flex min-h-9 cursor-pointer items-center gap-1.5 self-start px-3.5 text-13 font-medium disabled:opacity-50"
          >
            {busy ? (
              <Loader2 size={14} strokeWidth={2} className="animate-spin" aria-hidden />
            ) : (
              <Plus size={14} strokeWidth={2} aria-hidden />
            )}
            สร้าง key
          </button>
        </div>

        {/* ------------------------------------------------- key ใหม่ + รายการ */}
        <div className="flex min-w-0 flex-col gap-3">
          {fresh ? (
            <div role="status" className="flex flex-col gap-2 rounded-field border border-primary/40 bg-primary/5 px-3 py-3">
              <p className="text-12-5 font-medium">
                key “{fresh.info.label}” — คัดลอกเก็บไว้ตอนนี้ ระบบจะไม่แสดงซ้ำอีก
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 rounded-selector border border-line bg-base-100 px-2 py-1.5 font-mono text-12 break-all select-all">
                  {fresh.key}
                </code>
                <CopyButton text={fresh.key} label="คัดลอก key" />
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-11-5 font-semibold tracking-[0.04em] text-mut">ตัวอย่าง</span>
              <CopyButton text={curl} label="คัดลอก" />
            </div>
            <code className="rounded-field border border-line bg-base-100 px-3 py-2 font-mono text-12 break-all">{curl}</code>
          </div>

          {loadError ? (
            <p role="alert" className="text-12 text-alert">
              {loadError}
            </p>
          ) : list === null ? (
            <p className="text-12 text-mut">กำลังโหลด…</p>
          ) : list.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-12-5">
                <thead>
                  <tr className="border-b border-line text-left text-11-5 text-mut">
                    <th className="py-1.5 pr-3 font-medium">ชื่อ</th>
                    <th className="py-1.5 pr-3 font-medium">key</th>
                    <th className="py-1.5 pr-3 font-medium">สิทธิ์</th>
                    <th className="py-1.5 pr-3 font-medium">ใช้ล่าสุด</th>
                    <th className="py-1.5 pr-3 font-medium">หมดอายุ</th>
                    <th className="py-1.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {list.map((k) => (
                    <tr key={k.id} className={k.active ? "" : "text-mut"}>
                      <td className="py-2 pr-3">{k.label}</td>
                      <td className="py-2 pr-3 font-mono text-12">{k.hint}</td>
                      <td className="py-2 pr-3">
                        <span className={`chip ${k.scope === "write" ? "chip-wait" : "chip-live"} text-10-5`}>
                          {k.scope === "write" ? "อ่าน + เขียน" : "อ่านอย่างเดียว"}
                        </span>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {k.lastUsedAt ? formatThaiDateTime(k.lastUsedAt) : "ยังไม่เคยใช้"}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {k.revokedAt ? "ยกเลิกแล้ว" : k.active ? formatThaiDateTime(k.expiresAt) : "หมดอายุแล้ว"}
                      </td>
                      <td className="py-2 text-right">
                        {k.active ? (
                          <button
                            type="button"
                            onClick={() => revoke(k)}
                            className="min-h-8 cursor-pointer px-2 text-12 text-alert hover:underline"
                          >
                            ยกเลิก
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-12 text-mut">ยังไม่มี key</p>
          )}
        </div>
      </div>
    </section>
  );
}
