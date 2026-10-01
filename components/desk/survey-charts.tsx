"use client";

import { useMemo, useState } from "react";
import { MessageSquareQuote, TrendingUp, UserCheck, UserX, Users } from "lucide-react";

import {
  SURVEY_QUESTIONS,
  type SurveyQuestion,
  type SurveyResponse,
} from "@/lib/survey-forms";

/**
 * หน้าวิเคราะห์ผลแบบสอบถาม — กราฟทำด้วย SVG/CSS ตรง ๆ เหมือน `case-volume-chart.tsx`
 * ไม่ได้ลงไลบรารีกราฟเพิ่ม เพราะสีทั้งหมดต้องมาจาก token ของธีม (ตามกฎใน
 * `.claude/docs/design-system.md`) ไลบรารีสำเร็จรูปจะพาสีของตัวเองเข้ามา
 * แล้วธีมมืดจะหลุดทันที
 *
 * สีในโดนัท/แท่ง เป็น **ไล่เฉดเดียวจาก `primary`** ไม่ใช่หลายสี — ชุดสีหลายสีต้อง
 * ผ่านการตรวจ 6 ข้อตามเอกสารก่อนถึงจะใช้ได้ ส่วนกราฟพวกนี้เป็น “สัดส่วนของทั้งหมด”
 * ที่เรียงจากมากไปน้อยอยู่แล้ว ไล่เฉดจึงสื่อความหมายตรงกว่า และมีป้ายชื่อ + ตัวเลข
 * กำกับทุกชิ้น ไม่ได้ใช้สีเป็นช่องทางเดียวในการอ่าน
 */

/**
 * ไล่เฉดสีเดียวจากเข้ม→อ่อน (ผสมกับพื้นการ์ด ธีมมืดจึงตามไปเอง)
 *
 * `tone` มีสองแบบเท่านั้น: `primary` สำหรับคำถามทั่วไป และ `alert` (แดง) สำหรับ
 * ข้อ 6 “เหตุผลที่ไม่มา” ซึ่งเป็นข้อมูลด้านลบ — ใช้สีเดียวกับที่ระบบใช้บอกเรื่อง
 * ที่ต้องระวังอยู่แล้ว ไม่ได้เพิ่ม token ใหม่
 */
type Tone = "primary" | "alert";

function shade(i: number, n: number, tone: Tone = "primary"): string {
  const pct = n <= 1 ? 88 : 88 - (i * 60) / (n - 1);
  return `color-mix(in oklab, var(--color-${tone}) ${pct}%, var(--color-base-100))`;
}

interface Tally {
  label: string;
  count: number;
  pct: number;
}

/** นับคำตอบของคำถามหนึ่งข้อ เรียงมาก→น้อย · `base` = ตัวหารของ % */
function tally(responses: SurveyResponse[], id: string): { rows: Tally[]; base: number } {
  const counts = new Map<string, number>();
  let base = 0;

  for (const r of responses) {
    const list = r.answers[id] ?? [];
    if (!list.length) continue;
    base += 1;
    for (const v of list) counts.set(v, (counts.get(v) ?? 0) + 1);
  }

  const rows = [...counts.entries()]
    .map(([label, count]) => ({ label, count, pct: base ? (count / base) * 100 : 0 }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "th"));

  return { rows, base };
}

export function SurveyCharts({ responses }: { responses: SurveyResponse[] }) {
  const attending = responses.filter((r) => r.attending === true).length;
  const absent = responses.filter((r) => r.attending === false).length;

  const single = SURVEY_QUESTIONS.filter((q) => q.kind === "single");
  const multi = SURVEY_QUESTIONS.filter((q) => q.kind === "multi");
  const rank = SURVEY_QUESTIONS.filter((q) => q.kind === "rank");
  const free = SURVEY_QUESTIONS.filter((q) => q.kind === "text");

  if (!responses.length) {
    return (
      <p className="rounded-box border border-line bg-base-100 px-5 py-14 text-center text-13 text-mut">
        ยังไม่มีคำตอบให้วิเคราะห์
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={Users} label="ผู้ตอบทั้งหมด" value={responses.length} unit="คน" />
        <Stat
          icon={UserCheck}
          label="ตั้งใจมาร่วมงาน"
          value={attending}
          unit="คน"
          note={responses.length ? `${Math.round((attending / responses.length) * 100)}% ของผู้ตอบ` : undefined}
        />
        <Stat icon={UserX} label="ไม่สะดวกมา" value={absent} unit="คน" tone="sla" />
      </div>

      <ResponseTrend responses={responses} />

      {rank.map((q) => (
        <RankCard key={q.id} question={q} responses={responses} />
      ))}

      <div className="grid gap-3 lg:grid-cols-2">
        {single.map((q) => (
          <DonutCard key={q.id} question={q} responses={responses} />
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {multi.map((q) => (
          // ข้อ 6 เป็นเหตุผลที่ “ไม่มา” — ข้อมูลด้านลบ ใช้โทนแดงให้แยกออกจากข้ออื่นทันที
          <BarCard
            key={q.id}
            question={q}
            responses={responses}
            tone={q.id === "q6" ? "alert" : "primary"}
          />
        ))}
      </div>

      {free.map((q) => (
        <CommentsCard key={q.id} question={q} responses={responses} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ ตัวเลขสรุป */

function Stat({
  icon: Icon,
  label,
  value,
  unit,
  note,
  tone = "primary",
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  value: number;
  unit: string;
  note?: string;
  tone?: "primary" | "sla";
}) {
  return (
    <div className="flex items-center gap-3 rounded-box border border-line bg-base-100 px-4 py-3.5">
      <span
        className={`flex size-9 flex-none items-center justify-center rounded-full ${
          tone === "sla" ? "bg-sla/10 text-sla" : "bg-soft text-primary"
        }`}
      >
        <Icon size={17} strokeWidth={1.7} aria-hidden />
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="text-12 text-mut">{label}</span>
        <span className="text-lg font-semibold leading-tight">
          {value.toLocaleString("th-TH")}{" "}
          <span className="text-12 font-normal text-mut">{unit}</span>
        </span>
        {note ? <span className="text-11-5 text-mut">{note}</span> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ แนวโน้มผู้ตอบ */

/** เส้นสะสมรายวัน — ดูว่าคำตอบยังไหลเข้าอยู่ไหม หรือนิ่งแล้วพอสรุปได้ */
function ResponseTrend({ responses }: { responses: SurveyResponse[] }) {
  const points = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const r of responses) {
      if (!r.submittedAt) continue;
      const day = r.submittedAt.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }
    const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    // สะสมด้วย reduce ต่อจุด — จำนวนวันมีไม่กี่แถว ไม่ต้องห่วงเรื่อง O(n²)
    return days.map(([day, n], i) => ({
      day,
      added: n,
      total: days.slice(0, i + 1).reduce((s, [, c]) => s + c, 0),
    }));
  }, [responses]);

  if (points.length < 2) {
    return (
      <figure className="flex flex-col gap-1 rounded-box border border-line bg-base-100 p-5">
        <figcaption className="flex items-center gap-2 text-sm font-semibold">
          <TrendingUp size={16} strokeWidth={1.8} className="text-primary" aria-hidden />
          แนวโน้มการตอบกลับ
        </figcaption>
        <p className="text-12-5 text-mut">
          {points.length === 1
            ? `คำตอบทั้งหมดเข้ามาวันเดียว (${fmtDay(points[0].day)}) — ยังดูแนวโน้มไม่ได้`
            : "ยังไม่มีข้อมูลวันที่ตอบ"}
        </p>
      </figure>
    );
  }

  const max = points[points.length - 1].total;
  const W = 100;
  const H = 34;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - (v / max) * H;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(p.total).toFixed(2)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;

  return (
    <figure className="flex flex-col gap-3 rounded-box border border-line bg-base-100 p-5">
      <figcaption className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <TrendingUp size={16} strokeWidth={1.8} className="text-primary" aria-hidden />
            แนวโน้มการตอบกลับ
          </h2>
          <p className="text-12 text-mut">จำนวนผู้ตอบสะสม · หน่วยเป็นคน</p>
        </div>
        <span className="text-12 text-mut">
          รวม <span className="font-semibold text-ink">{max}</span> คน ใน {points.length} วัน
        </span>
      </figcaption>

      <div className="flex gap-2">
        <div className="relative w-7 flex-none text-10-5 text-mut" aria-hidden>
          <span className="absolute right-0 top-0 -translate-y-1/2">{max}</span>
          <span className="absolute right-0 bottom-0 translate-y-1/2">0</span>
        </div>
        <div className="relative min-w-0 flex-1">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="h-[150px] w-full"
            role="img"
            aria-label={`ผู้ตอบสะสม ${max} คน ตั้งแต่ ${fmtDay(points[0].day)} ถึง ${fmtDay(points[points.length - 1].day)}`}
          >
            <line x1="0" y1={H} x2={W} y2={H} className="stroke-line" strokeWidth="0.4" />
            <line x1="0" y1={H / 2} x2={W} y2={H / 2} className="stroke-line/60" strokeWidth="0.4" />
            <path d={area} fill="var(--color-primary)" opacity="0.09" />
            <path
              d={line}
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth="0.9"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
      </div>

      <div className="flex justify-between pl-9 text-11-5 text-mut">
        <span>{fmtDay(points[0].day)}</span>
        <span>{fmtDay(points[points.length - 1].day)}</span>
      </div>
    </figure>
  );
}

function fmtDay(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? day
    : new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short" }).format(d);
}

/* ------------------------------------------------------------------ โดนัท (เลือกข้อเดียว) */

function DonutCard({
  question,
  responses,
}: {
  question: SurveyQuestion;
  responses: SurveyResponse[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const { rows, base } = tally(responses, question.id);

  if (!base) return <EmptyCard question={question} />;

  // วงกลมวาดด้วย stroke-dasharray บนวงเดียว — ไม่ต้องคำนวณ path ของแต่ละชิ้น
  const R = 15.9155; // เส้นรอบวง = 100 พอดี ทำให้ dasharray ใช้ % ได้ตรง ๆ
  // จุดเริ่มของแต่ละชิ้น นับถอยจาก 25 (12 นาฬิกา) ตามสัดส่วนที่วางไปแล้ว
  const slices = rows.map((row, i) => ({
    ...row,
    offset: 25 - rows.slice(0, i).reduce((s, r) => s + r.pct, 0),
  }));

  return (
    <figure className="flex flex-col gap-3 rounded-box border border-line bg-base-100 p-5">
      <CardHead question={question} base={base} />

      <div className="flex flex-wrap items-center gap-5">
        <svg viewBox="0 0 36 36" className="size-[132px] flex-none" role="img" aria-label={question.question}>
          <circle cx="18" cy="18" r={R} fill="none" className="stroke-base-300" strokeWidth="4.6" />
          {slices.map((row, i) => (
            <circle
              key={row.label}
              cx="18"
              cy="18"
              r={R}
              fill="none"
              stroke={shade(i, slices.length)}
              strokeWidth={hover === i ? 5.6 : 4.6}
              strokeDasharray={`${row.pct} ${100 - row.pct}`}
              strokeDashoffset={row.offset}
              transform="rotate(-90 18 18)"
              opacity={hover === null || hover === i ? 1 : 0.45}
              className="transition-all"
            />
          ))}
          {/*
            ขนาดตัวอักษรสองตัวนี้เป็น **หน่วยของ SVG ไม่ใช่พิกเซลบนจอ** — วงกราฟนี้
            วาดใน `viewBox` 36×36 หน่วย ตัวเลข `5` กับ `2.6` จึงอ่านเทียบกับวงแหวน
            ไม่ใช่เทียบกับตัวหนังสือรอบ ๆ · **ห้ามเปลี่ยนไปใช้โทเคน `text-*`**
            ของสเกลตัวอักษร ไม่งั้นตัวเลขจะโตทะลุออกนอกวงตอนจอกว้าง
            (SVG สเกลตัวเองตามกรอบอยู่แล้ว ข้อความในนั้นจึงโตตามจอโดยอัตโนมัติ)
          */}
          <text
            x="18"
            y="17.2"
            textAnchor="middle"
            className="fill-ink text-[5px] font-semibold"
          >
            {hover === null ? base : rows[hover].count}
          </text>
          <text x="18" y="21.6" textAnchor="middle" className="fill-mut text-[2.6px]">
            {hover === null ? "ผู้ตอบ" : `${Math.round(rows[hover].pct)}%`}
          </text>
        </svg>

        <ul className="flex min-w-[180px] flex-1 flex-col gap-1.5">
          {rows.map((row, i) => (
            <li
              key={row.label}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              className="flex items-start gap-2 text-12-5"
            >
              <span
                className="mt-1 size-2.5 flex-none rounded-[3px]"
                style={{ backgroundColor: shade(i, rows.length) }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 text-pretty">{row.label}</span>
              <span className="flex-none tabular-nums text-mut">
                {row.count} · {Math.round(row.pct)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}

/* ------------------------------------------------------------------ แท่งนอน (เลือกหลายข้อ) */

function BarCard({
  question,
  responses,
  tone = "primary",
}: {
  question: SurveyQuestion;
  responses: SurveyResponse[];
  tone?: Tone;
}) {
  const { rows, base } = tally(responses, question.id);
  if (!base) return <EmptyCard question={question} tone={tone} />;

  const max = rows[0]?.count ?? 1;
  const red = tone === "alert";

  return (
    <figure
      className={`flex flex-col gap-3 rounded-box border bg-base-100 p-5 ${
        red ? "border-alert/25" : "border-line"
      }`}
    >
      <CardHead
        question={question}
        base={base}
        note="เลือกได้หลายข้อ — % คิดจากจำนวนผู้ตอบ"
        tone={tone}
      />

      <ul className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <li key={row.label} className="flex flex-col gap-1">
            <span className="flex items-baseline justify-between gap-3 text-12-5">
              <span className="min-w-0 text-pretty">{row.label}</span>
              <span className="flex-none tabular-nums text-mut">
                {row.count} · {Math.round(row.pct)}%
              </span>
            </span>
            <span
              className={`h-2 w-full overflow-hidden rounded-full ${
                red ? "bg-alert/8" : "bg-base-200"
              }`}
              aria-hidden
            >
              <span
                className="block h-full rounded-full transition-[width]"
                style={{
                  width: `${(row.count / max) * 100}%`,
                  backgroundColor: shade(i, rows.length, tone),
                }}
              />
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/* ------------------------------------------------------------------ อันดับความสำคัญ */

/**
 * คะแนนเฉลี่ยของอันดับ — ต่ำ = สำคัญกว่า
 * แสดงทั้งค่าเฉลี่ยและจำนวนคนที่ยกให้เป็น “อันดับ 1” เพราะสองอย่างนี้อาจไม่ตรงกัน
 * (ของที่ไม่มีใครให้ที่หนึ่งเลย แต่ทุกคนให้ที่สอง จะได้เฉลี่ยดีกว่า)
 */
function RankCard({
  question,
  responses,
}: {
  question: SurveyQuestion;
  responses: SurveyResponse[];
}) {
  const rows = useMemo(() => {
    const sum = new Map<string, number>();
    const firsts = new Map<string, number>();
    let base = 0;

    for (const r of responses) {
      const list = r.answers[question.id] ?? [];
      if (!list.length) continue;
      base += 1;
      list.forEach((label, i) => {
        sum.set(label, (sum.get(label) ?? 0) + i + 1);
        if (i === 0) firsts.set(label, (firsts.get(label) ?? 0) + 1);
      });
    }

    return {
      base,
      items: [...sum.entries()]
        .map(([label, total]) => ({
          label,
          avg: total / base,
          first: firsts.get(label) ?? 0,
        }))
        .sort((a, b) => a.avg - b.avg),
    };
  }, [responses, question.id]);

  if (!rows.base) return <EmptyCard question={question} />;

  const worst = Math.max(...rows.items.map((i) => i.avg), 1);

  return (
    <figure className="flex flex-col gap-3 rounded-box border border-line bg-base-100 p-5">
      <CardHead
        question={question}
        base={rows.base}
        note="อันดับเฉลี่ย — ยิ่งน้อยยิ่งสำคัญ (1 = สำคัญที่สุด)"
      />

      <ul className="flex flex-col gap-2.5">
        {rows.items.map((item, i) => (
          <li key={item.label} className="flex items-center gap-3">
            <span className="flex size-6 flex-none items-center justify-center rounded-full bg-soft text-11-5 font-semibold text-primary">
              {i + 1}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex items-baseline justify-between gap-3 text-12-5">
                <span className="min-w-0 text-pretty">{item.label}</span>
                <span className="flex-none tabular-nums text-mut">
                   {item.first} คน
                </span>
              </span>
              <span className="h-2 w-full overflow-hidden rounded-full bg-base-200" aria-hidden>
                <span
                  className="block h-full rounded-full"
                  style={{
                    // แท่งยาว = สำคัญมาก จึงกลับด้านค่าเฉลี่ย
                    width: `${((worst - item.avg + 0.25) / worst) * 100}%`,
                    backgroundColor: shade(i, rows.items.length),
                  }}
                />
              </span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/* ------------------------------------------------------------------ ข้อความปลายเปิด */

function CommentsCard({
  question,
  responses,
}: {
  question: SurveyQuestion;
  responses: SurveyResponse[];
}) {
  const comments = responses
    .map((r) => ({
      name: r.driverName || r.drivercode,
      plant: r.plant,
      text: (r.answers[question.id] ?? []).join(" ").trim(),
    }))
    .filter((c) => c.text.length > 0);

  return (
    <figure className="flex flex-col gap-3 rounded-box border border-line bg-base-100 p-5">
      <figcaption className="flex flex-col gap-0.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <MessageSquareQuote size={16} strokeWidth={1.8} className="text-primary" aria-hidden />
          {question.short}
        </h2>
        <p className="text-12 text-mut text-pretty">
          {question.question} · {comments.length} คนเขียนมา
        </p>
      </figcaption>

      {comments.length ? (
        <ul className="flex max-h-[320px] flex-col gap-2 overflow-y-auto">
          {comments.map((c) => (
            <li
              key={`${c.name}-${c.text}`}
              className="rounded-box border border-line bg-canvas px-3.5 py-2.5"
            >
              <p className="text-13 text-pretty">{c.text}</p>
              <p className="mt-1 text-11-5 text-mut">
                {c.name}
                {c.plant ? ` · ${c.plant}` : ""}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-12-5 text-mut">ยังไม่มีใครเขียนข้อความมา</p>
      )}
    </figure>
  );
}

/* ------------------------------------------------------------------ ชิ้นร่วม */

function CardHead({
  question,
  base,
  note,
  tone = "primary",
}: {
  question: SurveyQuestion;
  base: number;
  note?: string;
  tone?: Tone;
}) {
  return (
    <figcaption className="flex flex-wrap items-start justify-between gap-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2
          className={`text-sm font-semibold text-pretty ${tone === "alert" ? "text-alert" : ""}`}
        >
          <span className={tone === "alert" ? "text-alert/70" : "text-mut"}>
            ข้อ {question.no} ·{" "}
          </span>
          {question.short}
        </h2>
        <p className="text-12 text-mut text-pretty">{note ?? question.question}</p>
      </div>
      <span className="flex-none text-11-5 text-mut">ตอบ {base} คน</span>
    </figcaption>
  );
}

function EmptyCard({ question, tone = "primary" }: { question: SurveyQuestion; tone?: Tone }) {
  return (
    <figure
      className={`flex flex-col gap-1 rounded-box border bg-base-100 p-5 ${
        tone === "alert" ? "border-alert/25" : "border-line"
      }`}
    >
      <h2 className={`text-sm font-semibold ${tone === "alert" ? "text-alert" : ""}`}>
        <span className={tone === "alert" ? "text-alert/70" : "text-mut"}>
          ข้อ {question.no} ·{" "}
        </span>
        {question.short}
      </h2>
      <p className="text-12-5 text-mut">ยังไม่มีใครตอบข้อนี้</p>
    </figure>
  );
}
