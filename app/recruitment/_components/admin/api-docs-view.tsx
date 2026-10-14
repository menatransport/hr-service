"use client";

import { useState } from "react";
import { ChevronRight, Globe, Lock, LockOpen } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { SearchField } from "@/components/ui/field";
import {
  ApiConsole,
  JsonBlock,
  requestDoc,
  responseDoc,
} from "@/app/recruitment/_components/admin/api-console";
import { formatThaiDate } from "@/app/recruitment/_lib/drivers/types";
import {
  API_CHANGELOG,
  API_GROUPS,
  type ApiAccess,
  type ApiEndpoint,
  type HttpMethod,
} from "@/app/recruitment/_lib/api-docs";

/**
 * เนื้อหาหน้า API Docs — ภาพรวม → ดัชนีกลุ่ม → รายการเส้น (กางดูรายละเอียดทีละเส้น) → ประวัติ
 *
 * เป็น client เพราะมีช่องค้นหาและตัวกรองเมธอด · ข้อมูลเป็นค่าคงที่จาก `_lib/api-docs.ts`
 * จึงไม่มีอะไรต้องโหลด
 */

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const METHOD_CHIP: Record<HttpMethod, string> = {
  GET: "chip-live",
  POST: "chip-new",
  PUT: "chip-wait",
  PATCH: "chip-wait",
  DELETE: "chip-alert",
};

const ACCESS: Record<ApiAccess, { label: string; icon: LucideIcon; hint: string }> = {
  public: { label: "สาธารณะ", icon: Globe, hint: "เรียกได้โดยไม่ต้องล็อกอิน" },
  login: { label: "ต้องล็อกอิน", icon: Lock, hint: "ต้องมีคุกกี้ session — ไม่มีได้ 401" },
  "open-get": {
    label: "อ่านภายใน",
    icon: LockOpen,
    hint: "proxy ไม่ตรวจ session สำหรับ GET — ใช้จากหน้าที่อยู่หลังด่านล็อกอินแล้ว",
  },
};

const STATUS_CODES: [number, string][] = [
  [200, "สำเร็จ — ตัวข้อมูลตอบกลับตรง ๆ ไม่มีซองห่อ"],
  [302, "เปลี่ยนเส้นทาง (เฉพาะเส้นล็อกอิน)"],
  [400, "ข้อมูลที่ส่งมาไม่ผ่านการตรวจ — ข้อความใน error บอกช่องที่ต้องแก้"],
  [401, "ไม่มี session หรือหมดอายุ — ต้องเข้าสู่ระบบใหม่"],
  [404, "ไม่พบข้อมูลตามรหัสที่ระบุ"],
  [500, "ข้อผิดพลาดฝั่งเซิร์ฟเวอร์หรือฐานข้อมูล"],
  [502, "ขั้นแรกสำเร็จแต่ขั้นบันทึกไม่ติด (เช่น อัปรูปแล้วบันทึกลงทะเบียนไม่สำเร็จ)"],
];

const anchorOf = (e: ApiEndpoint) =>
  `${e.method}-${e.path}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");

/** ข้อความในเอกสารใช้ `backtick` แทนโค้ด — แปลงเป็น <code> ตอนแสดง */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("`") ? (
          <code key={i} className="rounded-selector bg-base-200 px-1 py-px font-mono text-ink">
            {part.slice(1, -1)}
          </code>
        ) : part.startsWith("**") ? (
          <strong key={i} className="font-semibold text-ink">
            {part.slice(2, -2)}
          </strong>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function ApiDocsView() {
  const [q, setQ] = useState("");
  const [method, setMethod] = useState<HttpMethod | "ALL">("ALL");

  const needle = q.trim().toLowerCase();
  const match = (e: ApiEndpoint) =>
    (method === "ALL" || e.method === method) &&
    (!needle ||
      e.path.toLowerCase().includes(needle) ||
      e.summary.toLowerCase().includes(needle) ||
      (e.description ?? "").toLowerCase().includes(needle));

  const groups = API_GROUPS.map((g) => ({ ...g, rows: g.endpoints.filter(match) })).filter(
    (g) => g.rows.length,
  );
  const filtering = Boolean(needle) || method !== "ALL";

  return (
    <div className="flex flex-col gap-5">
      {/* ------------------------------------------------------------ ภาพรวม */}
      <section className="sheet-bleed border-y border-line">
        <h2 className="border-b border-line-strong bg-head px-(--sheet-px) py-3 text-14 font-semibold">ภาพรวม</h2>
        <dl className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-4">
          <Fact term="Base URL">
            <code className="font-mono text-13">/api</code> บนโดเมนเดียวกับระบบ
          </Fact>
          <Fact term="รูปแบบข้อมูล">
            JSON (UTF-8) · อัปโหลดไฟล์ใช้ <code className="font-mono">multipart/form-data</code>
          </Fact>
          <Fact term="การยืนยันตัวตน">
            คุกกี้ <code className="font-mono">hrs.session</code> จากการล็อกอิน Google · ผู้ทำรายการอ่านจาก session เสมอ
            ไม่รับจาก body
          </Fact>
          <Fact term="รูปแบบข้อผิดพลาด">
            <code className="font-mono">{`{ "error": "ข้อความภาษาไทย" }`}</code> พร้อม HTTP status
          </Fact>
        </dl>

        <div className="grid gap-5 border-t border-line px-(--sheet-px) py-5 lg:grid-cols-2">
          <div className="flex flex-col gap-2">
            <h3 className="text-13 font-semibold">รหัสสถานะ HTTP</h3>
            <table className="w-full text-12-5">
              <tbody className="divide-y divide-line">
                {STATUS_CODES.map(([code, desc]) => (
                  <tr key={code}>
                    <td className="w-14 py-1.5 align-top font-mono font-semibold">{code}</td>
                    <td className="py-1.5 text-mut text-pretty">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-13 font-semibold">ระดับการเข้าถึง</h3>
            <ul className="flex flex-col gap-2.5">
              {(Object.keys(ACCESS) as ApiAccess[]).map((a) => (
                <li key={a} className="flex items-start gap-2.5 text-12-5">
                  <AccessBadge access={a} />
                  <span className="text-mut text-pretty">{ACCESS[a].hint}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1 rounded-field bg-base-200 px-3 py-2 text-11-5 text-mut text-pretty">
              คำสั่งเขียนข้อมูลทุกเส้น (POST · PUT · PATCH · DELETE) ถูกกันที่ด่าน <code className="font-mono">proxy.ts</code>{" "}
              ยกเว้นเส้นใต้ <code className="font-mono">/api/recruitment/public/</code>,{" "}
              <code className="font-mono">/api/uploads</code> และ <code className="font-mono">/api/auth/</code>
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- ค้นหา + ดัชนี */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-2.5 md:flex-row md:items-center">
          <SearchField
            value={q}
            onChange={setQ}
            label="ค้นหา endpoint"
            placeholder="ค้นพาธหรือคำอธิบาย เช่น resign-reasons"
            tone="filled"
            className="md:max-w-md md:flex-1"
          />
          <div role="radiogroup" aria-label="กรองเมธอด" className="flex flex-wrap gap-1.5">
            {(["ALL", ...METHODS] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={method === m}
                onClick={() => setMethod(m)}
                className={`min-h-9 cursor-pointer rounded-full border px-3 font-mono text-11-5 transition-colors ${
                  method === m
                    ? "border-ink bg-ink font-semibold text-ink-content"
                    : "border-line text-mut hover:text-ink"
                }`}
              >
                {m === "ALL" ? "ทั้งหมด" : m}
              </button>
            ))}
          </div>
        </div>
        <nav aria-label="กลุ่ม API" className="flex flex-wrap gap-1.5 border-t border-line pt-3">
          {groups.map((g) => (
            <a
              key={g.id}
              href={`#${g.id}`}
              className="flex items-center gap-1.5 rounded-selector border border-line px-2 py-1 text-12 text-mut transition-colors hover:border-primary/40 hover:text-primary"
            >
              {g.title}
              <span className="font-mono text-11 text-ink">{g.rows.length}</span>
            </a>
          ))}
        </nav>
      </section>

      {/* ---------------------------------------------------------- endpoints */}
      {groups.map((g) => (
        <section key={g.id} id={g.id} className="flex scroll-mt-20 flex-col gap-2.5">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-16 font-semibold">{g.title}</h2>
            <p className="max-w-[80ch] text-12-5 text-mut text-pretty">
              <Rich text={g.description} />
            </p>
          </div>
          <div className="sheet-bleed border-y border-line">
            {g.rows.map((e) => (
              <Endpoint key={anchorOf(e)} e={e} defaultOpen={filtering && g.rows.length <= 3} />
            ))}
          </div>
        </section>
      ))}

      {!groups.length ? (
        <p className="px-4 py-10 text-center text-13 text-mut">
          ไม่พบ endpoint ที่ตรงกับเงื่อนไข
        </p>
      ) : null}

      {/* --------------------------------------------------------- changelog */}
      <section id="changelog" className="flex scroll-mt-20 flex-col gap-2.5">
        <h2 className="text-16 font-semibold">ประวัติการเปลี่ยนแปลง</h2>
        <ol className="sheet-bleed flex flex-col border-y border-line">
          {API_CHANGELOG.map((c) => (
            <li key={c.version} className="grid gap-2 border-b border-line px-(--sheet-px) py-4 last:border-b-0 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <div className="flex flex-col">
                <span className="font-mono text-13 font-semibold">v{c.version}</span>
                <span className="text-11-5 text-mut">{formatThaiDate(c.date, "full")}</span>
              </div>
              <ul className="flex list-disc flex-col gap-1 pl-4 text-12-5 text-pretty marker:text-mut">
                {c.changes.map((line) => (
                  <li key={line}>
                    <Rich text={line} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ ชิ้นย่อย */

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 bg-base-100 px-(--sheet-px) py-3.5">
      <dt className="text-11-5 tracking-[0.04em] text-mut">{term}</dt>
      <dd className="text-12-5 text-pretty">{children}</dd>
    </div>
  );
}

function MethodBadge({ method }: { method: HttpMethod }) {
  return (
    <span className={`chip ${METHOD_CHIP[method]} w-16 justify-center font-mono text-10-5 font-semibold`}>
      {method}
    </span>
  );
}

function AccessBadge({ access }: { access: ApiAccess }) {
  const { label, icon: Icon } = ACCESS[access];
  return (
    <span className="inline-flex flex-none items-center gap-1 rounded-selector border border-line px-1.5 py-0.5 text-11 whitespace-nowrap text-mut">
      <Icon size={11} strokeWidth={2} aria-hidden />
      {label}
    </span>
  );
}

function Endpoint({ e, defaultOpen }: { e: ApiEndpoint; defaultOpen: boolean }) {
  return (
    <details
      id={anchorOf(e)}
      open={defaultOpen || undefined}
      className="group/ep scroll-mt-20 border-b border-line last:border-b-0"
    >
      <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-(--sheet-px) py-2.5 transition-colors hover:bg-base-200/50 [&::-webkit-details-marker]:hidden">
        <MethodBadge method={e.method} />
        <code className="min-w-0 font-mono text-12-5 font-medium break-all text-ink">{e.path}</code>
        <span className="min-w-0 flex-1 truncate text-12-5 text-mut max-sm:basis-full max-sm:pl-19">
          {e.summary}
        </span>
        <AccessBadge access={e.access} />
        <ChevronRight
          size={15}
          strokeWidth={2}
          aria-hidden
          className="flex-none text-mut transition-transform group-open/ep:rotate-90"
        />
      </summary>

      <div className="flex flex-col gap-4 border-t border-line bg-base-200/30 px-(--sheet-px) py-4">
        <div className="flex flex-col gap-1">
          <p className="text-13 font-medium">{e.summary}</p>
          {e.description ? (
            <p className="max-w-[80ch] text-12-5 text-mut text-pretty">
              <Rich text={e.description} />
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-3">
            <h4 className="text-11-5 font-semibold tracking-[0.04em] text-mut">เอกสาร</h4>
            <JsonBlock title="REQUEST" value={requestDoc(e)} />
            <JsonBlock title="RESPONSE" value={responseDoc(e)} />
          </div>
          <div className="min-w-0 xl:border-l xl:border-line xl:pl-4">
            <ApiConsole e={e} />
          </div>
        </div>
      </div>
    </details>
  );
}
