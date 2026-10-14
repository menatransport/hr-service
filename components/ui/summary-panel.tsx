/**
 * section “สรุป + เครื่องมือ + ตาราง” ของหน้ารายการ — ชิ้นส่วนกลางที่หน้าตั้งค่าเหตุผลการลาออก
 * ทะเบียน พจส. ตารางผู้สมัคร คิวคำร้อง ฯลฯ ใช้ร่วมกัน **หน้าไหนจะทำแถบสรุปใหม่ ให้ประกอบจากไฟล์นี้**
 * ไม่ใช่เขียนการ์ดตัวเลขขึ้นใหม่อีกชุด
 *
 * โครง (บนลงล่าง ทุกชั้นไม่บังคับ):
 *
 * ```
 * <SummaryPanel>
 *   <SummaryStats>               ตัวเลขเรียงเป็นแถบเดียวต่อกัน
 *     <SummaryStat lead … />     ช่องแรกพื้น `head` = ยอดรวม
 *     <SummaryStat … />
 *   </SummaryStats>
 *   <SummaryToolbar>             ค้นหา · กรอง · ปุ่มเพิ่ม
 *   <SummaryStrip>               แถบบาง ๆ (ทางลัด / ตัวกรองที่ใช้อยู่ / แท็บ)
 *     <SummaryTabs>              แท็บขีดเส้นใต้ที่วางทับเส้นคั่นล่าง
 *   <SummaryBody>                ตาราง/รายการ
 *   <SummaryFooter>              แถบเลขหน้า
 * </SummaryPanel>
 * ```
 *
 * **แบน กินเต็มความกว้างแผ่นเนื้อหา** (13 ต.ค. 2026 · Bew) — ไม่มีกรอบ/มุมโค้ง/เงาของตัวเองแล้ว
 * แผ่นเนื้อหาของเชลล์คือ “การ์ด” ใบเดียวของทั้งหน้า แต่ละชั้นข้างในคั่นด้วยเส้นบางที่ยาวชนขอบแผ่น
 * (`sheet-bleed`) และเว้นขอบซ้ายขวาเท่าแผ่น (`--sheet-px`) ตัวหนังสือจึงตรงแนวกับหัวเรื่องของหน้า
 *
 * ตัวเลขทุกช่องติดกันด้วย `gap-px` บนพื้น `line` — เส้นคั่นจึงคมเท่ากันทุกเส้นโดยไม่ต้อง
 * ไล่ใส่ `border` ทีละช่อง · **จำนวนช่องต้องเต็มแถวพอดีทุกจอ** ไม่งั้นช่องที่ว่างจะเห็นเป็น
 * สีเส้น ให้ใช้ `className` ของช่อง `lead` ขยายคอลัมน์ชดเชย (ดูหน้าผู้สมัคร)
 *
 * **สัดส่วนอยู่ในช่องของตัวเอง ไม่มีแถบรวมยาวใต้แถว** — เดิมมีแถบรวมพาดใต้ทุกช่อง
 * แต่ส่วนของแถบไม่ได้อยู่ใต้ช่องที่มันแทน (ช่องแรกเป็นยอดรวม ท้ายแถบเป็น “ยกเลิก”
 * ที่ไม่มีช่อง) อ่านเหมือนแถบพัง · ตอนนี้ช่องที่ส่ง `share` มีแถบของตัวเองที่ขอบล่าง
 * สีเดียวกับจุดหน้าป้าย
 */

import { ListFilter } from "lucide-react";

type Tone = "ink" | "primary" | "alert" | "sla";

/**
 * สีของแต่ละโทน — **ตัวเลขเป็นสีหมึกเสมอ** (13 ต.ค. 2026) สีของโทนเหลือแค่จุดหน้าป้าย แถบสัดส่วน
 * และกรอบ/ขีดตอนช่องนั้นกรองอยู่ · เดิมตัวเลข ป้าย % จุด และแถบเป็นสีโทนพร้อมกันสี่ที่ต่อช่อง
 * แถบสรุปทั้งแถวเลยเป็นสีรุ้งแย่งสายตากับตาราง
 *
 * ช่องที่กรองอยู่เป็น **กรอบสีในตัว (ring inset) บนพื้นขาว** ไม่ใช่พื้นสี — ช่องยอดรวม (`lead`) เป็นพื้น
 * ไล่สีอยู่แล้ว ถ้าช่องที่เลือกเป็นพื้นสีอีกช่อง สองช่องจะดูเป็นช่องยอดรวมเหมือนกัน
 *
 * `badge` = พื้นทึบของวงไอคอนกรองในช่องที่กรองอยู่ (ไอคอนเป็น `text-base-100` — ขาวในโหมดสว่าง
 * เข้มในโหมดมืดที่สีโทนสว่างขึ้น อ่านออกทั้งคู่)
 */
const TONE: Record<Tone, { bar: string; on: string; badge: string }> = {
  ink: { bar: "bg-ink/40", on: "ring-2 ring-inset ring-ink/30", badge: "bg-ink" },
  primary: { bar: "bg-primary", on: "ring-2 ring-inset ring-primary/45", badge: "bg-primary" },
  alert: { bar: "bg-alert", on: "ring-2 ring-inset ring-alert/45", badge: "bg-alert" },
  sla: { bar: "bg-sla", on: "ring-2 ring-inset ring-sla/45", badge: "bg-sla" },
};

export function SummaryPanel({
  label,
  className = "",
  children,
}: {
  /** ชื่อของส่วนนี้สำหรับโปรแกรมอ่านจอ */
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={label} className={`sheet-bleed min-w-0 ${className}`}>
      {children}
    </section>
  );
}

export function SummaryStats({
  className = "grid-cols-2 sm:grid-cols-4",
  children,
}: {
  /** คลาสของ grid (จำนวนคอลัมน์ในแต่ละจอ) */
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`grid gap-px border-y border-line bg-line ${className}`}>{children}</div>
  );
}

/**
 * หนึ่งช่องตัวเลข — ส่ง `onClick` แล้วกลายเป็นปุ่มกรอง (`aria-pressed` ตาม `active`)
 *
 * ช่อง `lead` = ยอดรวม พื้นไล่มิ้นต์ → ทองอ่อน (`.stat-lead` ทิศเดียวกับดวงไฟของพื้นหลังระบบ)
 * ตัวหนังสือเขียวหัวเป็ดเข้ม · ช่องอื่นตัวเลขสีหมึก
 *
 * **ช่องที่กำลังกรองอยู่มีวงกลมทึบสีโทน + ไอคอนกรอง (`ListFilter`) ใหญ่ ๆ กลางขอบขวา** (13 ต.ค. 2026 ·
 * Bew) — ไอคอนเดียวกับหัวคอลัมน์ที่กรองอยู่ (`ColumnMenu`) จึงอ่านเป็นภาษาเดียวกันทั้งหน้า · ช่องแคบเกิน
 * ใช้วงเล็กท้ายป้ายแทน · ไม่ขึ้นบนช่อง `lead` (ช่องนั้น “active” แปลว่าดูทั้งหมด ไม่ได้กรอง)
 * · **แบบเดียวทุกหน้า** — ป้ายข้อความ “กดเพื่อกรอง / กรองอยู่” (`filterHint`) ของทะเบียน พจส. ถูกยุบมาใช้
 * วงนี้แทนแล้ว อย่าทำตัวบอกสถานะกรองแบบที่สองขึ้นมาอีก
 */
export function SummaryStat({
  label,
  value,
  unit,
  sub,
  dot,
  tone = "ink",
  share,
  lead,
  active,
  onClick,
  title,
  compact,
  className = "",
}: {
  label: string;
  value: number;
  /** หน่วยต่อท้ายตัวเลข เช่น “คน” */
  unit?: string;
  /** บรรทัดเล็กใต้ตัวเลข (หรือต่อท้ายในโหมด `compact`) */
  sub?: string;
  /** คลาสสีของจุดหน้าป้าย เช่น `bg-alert` */
  dot?: string;
  tone?: Tone;
  /** สัดส่วนต่อยอดรวม (0–1) — แถบบาง ๆ ที่ขอบล่างของช่อง (สีตาม `dot`) + ป้าย % (ยกเว้น `compact`) */
  share?: number;
  lead?: boolean;
  active?: boolean;
  onClick?: () => void;
  title?: string;
  /** ช่องเตี้ย — สำหรับหน้าที่ตารางต้องได้ความสูงมากที่สุด */
  compact?: boolean;
  className?: string;
}) {
  const t = TONE[tone];
  const percent = share === undefined ? null : Math.min(100, Math.max(0, share * 100));

  /*
    วงไอคอนกรอง — ขึ้นเฉพาะช่องที่กรองอยู่ · ช่องกว้างพอ = **วงใหญ่กลางขอบขวา** แล้วกันที่ข้างขวาของเนื้อหา
    ให้วง (ป้ายยาว ๆ ถึงตัดเป็น … แทนที่จะลอดใต้วง) · ช่องแคบ (มือถือ แท็บเล็ต) = วงเล็กท้ายป้ายแทน
    ไม่งั้นวงทับตัวเลข · วัดจากความกว้างของช่องเอง (`@container` — วัดพื้นที่เนื้อหา ไม่รวม padding)
    ไม่ใช่ความกว้างจอ เพราะแต่ละหน้าแบ่งช่องไม่เท่ากันและแถบข้างพับได้ · ชื่อคลาสต้องเขียนเต็ม ๆ
    Tailwind ถึงเห็น
  */
  const filterable = Boolean(onClick) && !lead;
  const filtering = filterable && active;
  const reserve = filtering ? (compact ? "@min-[6.75rem]:pr-10" : "@min-[10.5rem]:pr-[3.25rem]") : "";

  const body = (
    <>
      <span className={`flex items-center gap-1.5 text-11-5 text-mut ${reserve}`}>
        {dot ? <span aria-hidden className={`size-2 flex-none rounded-full ${dot}`} /> : null}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {filtering ? (
          /* วงเล็กของช่องแคบ — `-my-0.5` ไม่ให้ดันความสูงช่อง */
          <span
            aria-hidden
            className={`-my-0.5 flex size-4.5 flex-none animate-pop-in items-center justify-center rounded-full text-base-100 ${t.badge} ${
              compact ? "@min-[6.75rem]:hidden" : "@min-[10.5rem]:hidden"
            }`}
          >
            <ListFilter size={11} strokeWidth={2.4} />
          </span>
        ) : null}
      </span>

      {filtering ? (
        <span
          aria-hidden
          className={`absolute inset-y-0 my-auto hidden animate-pop-in items-center justify-center rounded-full text-base-100 ${t.badge} ${
            compact
              ? "right-3.5 size-8 @min-[6.75rem]:flex"
              : "right-(--sheet-px) size-10 @min-[10.5rem]:flex"
          }`}
        >
          <ListFilter size={compact ? 16 : 20} strokeWidth={2.2} />
        </span>
      ) : null}

      <span className={`flex min-w-0 ${compact ? "items-baseline gap-1.5" : "flex-col gap-1"} ${reserve}`}>
        <span className="flex items-baseline gap-1">
          <span
            key={value}
            className={`animate-fade-in font-mono leading-none font-semibold text-ink tabular-nums ${
              compact ? "text-18" : "text-22"
            }`}
          >
            {value.toLocaleString("th-TH")}
          </span>
          {unit ? <span className="text-12 text-mut">{unit}</span> : null}
          {percent !== null && !compact ? (
            <span className="ml-1.5 flex-none rounded-full bg-base-200 px-1.5 py-0.5 text-10-5 font-medium text-mut tabular-nums">
              {percent > 0 && percent < 0.1 ? "<0.1" : percent.toFixed(1)}%
            </span>
          ) : null}
        </span>
        {sub ? <span className="truncate text-11 text-mut">{sub}</span> : null}
      </span>

      {/* ช่องที่กรองอยู่ — ขีดสีของโทนตัวเองที่ขอบบน */}
      {active && !lead ? (
        <span aria-hidden className={`absolute inset-x-0 top-0 h-0.5 ${t.bar}`} />
      ) : null}

      {percent !== null ? (
        <span aria-hidden className="absolute inset-x-0 bottom-0 block h-[3px] bg-base-200">
          <span
            className={`block h-full rounded-r-full transition-[width] duration-700 ease-out ${dot ?? t.bar}`}
            style={{ width: `${Math.max(percent, percent > 0 ? 2 : 0)}%` }}
          />
        </span>
      ) : null}
    </>
  );

  const shell = `group relative flex min-w-0 flex-col overflow-hidden text-left ${filterable ? "@container" : ""} ${
    compact ? "gap-1.5 px-3.5 py-2.5" : "gap-2 px-(--sheet-px) py-3.5"
  } ${lead ? "stat-lead" : active ? `bg-base-100 ${t.on}` : "bg-base-100"} ${className}`;

  if (!onClick) return <div className={shell}>{body}</div>;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={`${shell} cursor-pointer transition-colors ${
        lead || active ? "" : "hover:bg-base-200/60"
      }`}
    >
      {body}
    </button>
  );
}

export function SummaryToolbar({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-col gap-3 px-(--sheet-px) py-3.5 lg:flex-row lg:items-center ${className}`}
    >
      {children}
    </div>
  );
}

/** แถบบาง ๆ — ทางลัดไปหมวด ตัวกรองที่ใช้อยู่ หรือแท็บของตาราง (ไม่มีพื้นของตัวเอง มีแค่เส้นคั่น) */
export function SummaryStrip({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`border-t border-line px-(--sheet-px) ${className}`}>{children}</div>;
}

/**
 * เนื้อของ section ใต้แถบสรุป — ตาราง/รายการ ไม่มีกรอบ/เงาของตัวเอง · ตารางชนขอบแผ่นทั้งสองข้าง
 * · `pad` = เว้นขอบเท่าแผ่น สำหรับรายการ/ข้อความที่ไม่ใช่ตาราง
 */
export function SummaryBody({
  pad,
  className = "",
  children,
}: {
  pad?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`border-t border-line ${pad ? "px-(--sheet-px) py-3.5" : ""} ${className}`}>
      {children}
    </div>
  );
}

/** แถบท้าย section — แถบเลขหน้า ยอดที่แสดงอยู่ */
export function SummaryFooter({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`border-t border-line px-(--sheet-px) py-2.5 ${className}`}>{children}</div>
  );
}

export interface SummaryTab<T extends string> {
  id: T;
  label: string;
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>;
  /** ตัวเลขงานค้างต่อท้ายป้าย — 0 = ไม่แสดง */
  count?: number;
  /** tooltip ของตัวเลข */
  countTitle?: string;
  tone?: "primary" | "alert";
}

/**
 * แท็บขีดเส้นใต้สำหรับวางใน `SummaryStrip` — ขีดของแท็บที่เปิดอยู่ทับขอบล่างของการ์ดพอดี
 * (ท่าเดียวกับแท็บ “พนักงานปัจจุบัน / พ้นสภาพแล้ว” ของทะเบียน พจส.)
 */
export function SummaryTabs<T extends string>({
  label,
  value,
  tabs,
  onChange,
}: {
  label: string;
  value: T;
  tabs: SummaryTab<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="tablist" aria-label={label} className="-mx-3 flex gap-1">
      {tabs.map(({ id, label: text, icon: Icon, count, countTitle, tone = "primary" }) => {
        const on = value === id;
        const ink = tone === "alert" ? "text-alert" : "text-primary";
        const bar = tone === "alert" ? "bg-alert" : "bg-primary";
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(id)}
            className={`group relative flex cursor-pointer items-center gap-1.5 px-3 pt-2.5 pb-2.5 text-13 transition-colors ${
              on ? `font-medium ${ink}` : "text-mut hover:text-ink"
            }`}
          >
            {Icon ? <Icon size={14} strokeWidth={1.9} aria-hidden /> : null}
            {text}
            {count ? (
              <span
                title={countTitle}
                className={`rounded-full px-1.5 text-10-5 font-semibold tabular-nums ${
                  on ? "bg-primary/12 text-primary" : "bg-base-200 text-mut"
                }`}
              >
                {count}
              </span>
            ) : null}
            <span
              aria-hidden
              className={`absolute inset-x-0 bottom-0 h-0.5 origin-left rounded-full transition-transform duration-300 ease-out ${
                on ? `scale-x-100 ${bar}` : "scale-x-0 bg-line group-hover:scale-x-100"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** คลาสสีของจุดหน้าป้าย */
  dot?: string;
  /** ตัวเลขต่อท้ายป้าย */
  count?: number;
}

/** ตัวเลือกแบบแถบเดียวต่อกัน (เลือกได้ทีละค่า) — ใช้แทนชิปกรองที่เรียงห่างกัน */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className = "",
}: {
  label: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`inline-flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-base-200 p-1 ring-1 ring-line ring-inset scrollbar-thin ${className}`}
    >
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`flex min-h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3.5 text-12-5 whitespace-nowrap transition-colors sm:flex-none ${
              on ? "bg-base-100 font-semibold text-primary ring-1 ring-line-strong/70" : "text-mut hover:text-ink"
            }`}
          >
            {o.dot ? <span aria-hidden className={`size-1.5 rounded-full ${o.dot}`} /> : null}
            {o.label}
            {o.count !== undefined ? (
              <span className={`font-mono text-11 tabular-nums ${on ? "text-primary" : "text-mut/80"}`}>
                {o.count.toLocaleString("th-TH")}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
