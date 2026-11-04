import { CircleCheck, Clock, TriangleAlert } from "lucide-react";

import type { CheckResult } from "@/lib/payroll/rules";

/**
 * ผลตรวจด่าน 1 — แยกสามกลุ่มตามลำดับที่คนต้องลงมือ
 *
 * 1. **ต้องแก้** (`blocking`) · 2. **ควรดู** (`warn` ที่ active) · 3. **รอยืนยัน** (`pending`)
 *
 * กลุ่มที่สาม **ตั้งใจให้สีจางและติดป้ายว่ารอใคร ไม่ใช่สีแดง** — เป็นกติกาที่ยังไม่มีใคร
 * ตอบ ไม่ใช่ความผิดของไฟล์ ถ้าทาแดงเหมือนข้อผิดพลาด คนทำเงินเดือนจะตามแก้ของที่
 * แก้ไม่ได้ · `blocking` มาจาก `rules.ts` ที่เดียว ที่นี่แค่อ่าน ห้ามคำนวณซ้ำ
 */
export function ChecksPanel({ checks }: { checks: CheckResult[] }) {
  const must = checks.filter((c) => c.blocking);
  const should = checks.filter((c) => c.severity === "warn" && c.status === "active");
  const waiting = checks.filter((c) => c.status === "pending");

  if (!must.length && !should.length && !waiting.length) {
    return (
      <div className="flex items-center gap-2 rounded-box border border-primary/30 bg-soft/60 p-3.5 text-13">
        <CircleCheck size={17} strokeWidth={1.8} aria-hidden className="text-primary" />
        ระบบตรวจด่านแรกแล้ว ไม่พบอะไรผิดปกติ
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {must.length ? (
        <Group
          title={`ต้องแก้ก่อน ${must.length} ข้อ`}
          tone="border-sla/30 bg-sla/6"
          titleTone="text-sla"
          icon={<TriangleAlert size={16} strokeWidth={1.8} aria-hidden className="text-sla" />}
          checks={must}
        />
      ) : null}
      {should.length ? (
        <Group
          title={`ควรดู ${should.length} ข้อ`}
          tone="border-warning/35 bg-warning/8"
          titleTone="text-warning"
          icon={<TriangleAlert size={16} strokeWidth={1.8} aria-hidden className="text-warning" />}
          checks={should}
        />
      ) : null}
      {waiting.length ? (
        <Group
          title={`รอยืนยันกติกา ${waiting.length} ข้อ`}
          tone="border-line bg-base-200/50"
          titleTone="text-mut"
          icon={<Clock size={16} strokeWidth={1.8} aria-hidden className="text-mut" />}
          checks={waiting}
          pending
        />
      ) : null}
    </div>
  );
}

function Group({
  title,
  tone,
  titleTone,
  icon,
  checks,
  pending,
}: {
  title: string;
  tone: string;
  titleTone: string;
  icon: React.ReactNode;
  checks: CheckResult[];
  pending?: boolean;
}) {
  return (
    <section className={`flex flex-col gap-2 rounded-box border p-3.5 ${tone}`}>
      <h3 className={`flex items-center gap-2 text-13 font-semibold ${titleTone}`}>
        {icon}
        {title}
      </h3>
      <ul className="flex flex-col gap-2">
        {checks.map((check) => (
          <li key={check.id} className={`flex flex-col gap-0.5 ${pending ? "opacity-75" : ""}`}>
            <span className="flex flex-wrap items-center gap-2 text-13 font-medium">
              {check.title}
              {pending ? (
                <span className="rounded-field border border-line px-1.5 py-0.5 text-11-5 font-normal text-mut">
                  รอฝ่ายเจ้าของกติกายืนยัน
                </span>
              ) : null}
            </span>
            <span className="text-12-5 text-mut text-pretty">{check.detail}</span>
            {check.rows?.length ? (
              <span className="font-mono text-11-5 text-mut tabular-nums">
                แถวที่ {check.rows.join(", ")}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
