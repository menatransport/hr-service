"use client";

import { useId, useState } from "react";
import { ExternalLink, Loader2, Play } from "lucide-react";

import { TextField, TextareaField } from "@/components/ui/field";
import { requestRaw, type RawResponse } from "@/lib/http";
import { confirm } from "@/lib/swal";
import type { ApiEndpoint, ApiParam } from "@/app/recruitment/_lib/api-docs";

/**
 * กล่อง JSON + คอนโซลยิงทดสอบของหน้า API Docs
 *
 * แยกจาก `api-docs-view.tsx` เพราะไฟล์นั้นจะยาวเกิน ~400 บรรทัด และ `JsonBlock`
 * ถูกใช้ทั้งฝั่งเอกสาร (ซ้าย) และฝั่งผลลัพธ์ (ขวา)
 *
 * **คอนโซลยิงของจริงด้วย session ของผู้ใช้เอง** — คำสั่งเขียนทุกตัวถามยืนยันก่อน
 * และบอกตรง ๆ ว่าเขียนลงฐานข้อมูลจริง · เส้นที่ทดสอบจากที่นี่ไม่ได้ (ล็อกอิน/ออกจากระบบ
 * และเส้นอัปโหลดไฟล์) ปิดปุ่มพร้อมเหตุผล
 */

/* ------------------------------------------------------------ JSON สีตามชนิด */

const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

function highlight(json: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of json.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(json.slice(last, at));
    const cls = m[1]
      ? m[2]
        ? "text-primary"
        : "text-series-a"
      : m[3]
        ? "text-alert"
        : "text-sla";
    out.push(
      <span key={at} className={cls}>
        {m[1] ?? m[0]}
      </span>,
    );
    if (m[2]) out.push(m[2]);
    last = at + m[0].length;
  }
  out.push(json.slice(last));
  return out;
}

export function JsonBlock({
  title,
  value,
  aside,
}: {
  title: string;
  value: unknown;
  aside?: React.ReactNode;
}) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-field border border-line bg-base-100">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-base-200 px-3 py-1.5">
        <span className="font-mono text-11 font-semibold tracking-[0.04em] text-mut">{title}</span>
        {aside}
      </div>
      <pre className="max-h-[26rem] overflow-auto px-3 py-2.5 font-mono text-12 leading-relaxed whitespace-pre text-ink">
        {typeof value === "string" ? text : highlight(text)}
      </pre>
    </div>
  );
}

/* --------------------------------------------------------- เอกสารในรูป JSON */

const ACCESS_TEXT = {
  public: "สาธารณะ — ไม่ต้องล็อกอิน",
  login: "ต้องล็อกอิน (คุกกี้ hrs.session)",
  "open-get": "อ่านภายใน — proxy ไม่ตรวจ session",
} as const;

/** `"a / b"` ในเอกสารคือพารามิเตอร์หลายตัวที่ใช้คำอธิบายเดียวกัน — แตกเป็นรายตัว */
const namesOf = (p: ApiParam) => p.name.split(" / ").map((n) => n.trim());

const describe = (p: ApiParam) =>
  [p.type, p.required ? "จำเป็น" : "ไม่บังคับ", p.desc.replace(/`/g, "")].join(" · ");

function paramsIn(e: ApiEndpoint, where: ApiParam["in"]) {
  return (e.params ?? []).filter((p) => p.in === where);
}

function section(e: ApiEndpoint, where: ApiParam["in"]) {
  const list = paramsIn(e, where);
  if (!list.length) return undefined;
  return Object.fromEntries(list.flatMap((p) => namesOf(p).map((n) => [n, describe(p)])));
}

export function requestDoc(e: ApiEndpoint) {
  return {
    method: e.method,
    url: e.path,
    auth: ACCESS_TEXT[e.access],
    path: section(e, "path"),
    query: section(e, "query"),
    body: section(e, "body"),
    "form-data": section(e, "form"),
  };
}

export function responseDoc(e: ApiEndpoint) {
  const out: Record<string, unknown> = {};
  out[e.response?.startsWith("302") ? "302" : "200"] = e.response ?? "—";
  for (const er of e.errors ?? []) out[String(er.status)] = { error: er.when };
  if (e.access === "login") out["401"] = { error: "หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง" };
  out["500"] = { error: "ข้อความจากเซิร์ฟเวอร์" };
  return out;
}

/* --------------------------------------------------------------- คอนโซล */

/** ค่าเริ่มต้นในกล่อง body — ใส่เฉพาะช่องจำเป็น กันยิง PATCH แล้วไปทับช่องที่ไม่ได้ตั้งใจ */
function sample(type: string): unknown {
  const literal = /"([^"]+)"/.exec(type);
  if (literal) return literal[1];
  if (/^number/.test(type)) return 0;
  if (/^boolean/.test(type)) return false;
  if (/\[\]/.test(type)) return [];
  return "";
}

function bodyTemplate(e: ApiEndpoint): string {
  const list = paramsIn(e, "body");
  if (!list.length) return "";
  const required = list.filter((p) => p.required);
  const pick = required.length ? required : list.slice(0, 1);
  const obj = Object.fromEntries(pick.flatMap((p) => namesOf(p).map((n) => [n, sample(p.type)])));
  return JSON.stringify(obj, null, 2);
}

function blockedReason(e: ApiEndpoint): string | null {
  if (e.path.startsWith("/api/auth/"))
    return "เส้นล็อกอิน/ออกจากระบบ ทดสอบจากที่นี่ไม่ได้ — จะพาออกจากหน้านี้หรือตัด session ปัจจุบัน";
  if (paramsIn(e, "form").length)
    return "เส้นนี้รับไฟล์ (multipart/form-data) — ทดสอบผ่านหน้าจอที่ใช้งานจริงแทน";
  return null;
}

const STATUS_CHIP = (s: number) =>
  s >= 200 && s < 300 ? "chip-live" : s >= 300 && s < 500 && s !== 0 ? "chip-wait" : "chip-alert";

export function ApiConsole({ e }: { e: ApiEndpoint }) {
  const id = useId();
  const pathParams = paramsIn(e, "path").flatMap(namesOf);
  const queryParams = paramsIn(e, "query").flatMap(namesOf);
  const hasBody = e.method !== "GET" && paramsIn(e, "body").length > 0;

  const [values, setValues] = useState<Record<string, string>>({});
  const [body, setBody] = useState(() => bodyTemplate(e));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<(RawResponse & { url: string }) | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const blocked = blockedReason(e);

  function buildUrl(): string | null {
    let url = e.path;
    for (const name of pathParams) {
      const v = (values[`p:${name}`] ?? "").trim();
      if (!v) return null;
      url = url.replace(`{${name}}`, encodeURIComponent(v));
    }
    const qs = new URLSearchParams();
    for (const name of queryParams) {
      const v = (values[`q:${name}`] ?? "").trim();
      if (v) qs.set(name, v);
    }
    const q = qs.toString();
    return q ? `${url}?${q}` : url;
  }

  async function send() {
    setProblem(null);
    const url = buildUrl();
    if (!url) return setProblem("กรอกพารามิเตอร์ path ให้ครบก่อน");

    let payload: string | null = null;
    if (hasBody && body.trim()) {
      try {
        payload = JSON.stringify(JSON.parse(body));
      } catch {
        return setProblem("body ไม่ใช่ JSON ที่ถูกต้อง");
      }
    }

    if (e.method !== "GET") {
      const ok = await confirm({
        title: `ยิง ${e.method} ${url}?`,
        text: "คำขอนี้เขียนข้อมูลจริงในนามของคุณ (ฐานข้อมูลหรือ NCAC) — ไม่ใช่โหมดจำลอง",
        confirmText: "ยิงคำขอ",
        tone: e.method === "DELETE" ? "danger" : "warn",
      });
      if (!ok) return;
    }

    setBusy(true);
    try {
      setResult({ ...(await requestRaw(url, e.method, payload)), url });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-11-5 font-semibold tracking-[0.04em] text-mut">ทดสอบยิงจริง</h4>
        {e.method !== "GET" && !blocked ? (
          <span className="chip chip-wait text-10-5">เขียนข้อมูลจริง</span>
        ) : null}
      </div>

      {blocked ? (
        <p className="rounded-field border border-dashed border-line bg-base-100 px-3 py-3 text-12 text-mut text-pretty">
          {blocked}
        </p>
      ) : (
        <>
          {pathParams.length || queryParams.length ? (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {pathParams.map((n) => (
                <TextField
                  key={`p:${n}`}
                  id={`${id}-p-${n}`}
                  label={`{${n}}`}
                  value={values[`p:${n}`] ?? ""}
                  onChange={(v) => setValues((s) => ({ ...s, [`p:${n}`]: v }))}
                />
              ))}
              {queryParams.map((n) => (
                <TextField
                  key={`q:${n}`}
                  id={`${id}-q-${n}`}
                  label={`?${n}`}
                  optional
                  value={values[`q:${n}`] ?? ""}
                  onChange={(v) => setValues((s) => ({ ...s, [`q:${n}`]: v }))}
                />
              ))}
            </div>
          ) : null}

          {hasBody ? (
            <TextareaField
              id={`${id}-body`}
              label="Body (JSON)"
              hint="ใส่ไว้ให้เฉพาะช่องจำเป็น — เพิ่มช่องอื่นได้ตามเอกสารด้านซ้าย"
              optional
              mono
              rows={7}
              value={body}
              onChange={setBody}
            />
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={send}
              disabled={busy}
              className="flex min-h-9 cursor-pointer items-center gap-1.5 rounded-field bg-primary px-3.5 text-13 font-medium text-primary-content transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 size={14} strokeWidth={2} className="animate-spin" aria-hidden />
              ) : (
                <Play size={14} strokeWidth={2} aria-hidden />
              )}
              ส่งคำขอ
            </button>
            {problem ? (
              <span role="alert" className="text-12 text-alert">
                {problem}
              </span>
            ) : null}
          </div>
        </>
      )}

      {result ? (
        <JsonBlock
          title="RESPONSE"
          aside={
            <span className="flex items-center gap-2 text-11">
              <span className={`chip ${STATUS_CHIP(result.status)} font-mono text-10-5`}>
                {result.status || "ERR"}
              </span>
              <span className="font-mono text-mut">{result.ms} ms</span>
            </span>
          }
          value={
            result.size !== null
              ? {
                  file: true,
                  contentType: result.contentType,
                  bytes: result.size,
                }
              : (result.body ?? { empty: true })
          }
        />
      ) : (
        !blocked && (
          <div className="rounded-field border border-dashed border-line px-3 py-6 text-center text-12 text-mut">
            ผลลัพธ์จะแสดงที่นี่ในรูปแบบ JSON
          </div>
        )
      )}

      {result && result.size !== null && e.method === "GET" && result.status === 200 ? (
        <a
          href={result.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 self-start text-12 text-primary hover:underline"
        >
          <ExternalLink size={12} strokeWidth={2} aria-hidden />
          เปิดไฟล์ในแท็บใหม่
        </a>
      ) : null}
    </div>
  );
}
