/**
 * การ์ด “สรุป + เครื่องมือ” เหนือตาราง — ชิ้นส่วนกลางที่หน้าตั้งค่าเหตุผลการลาออก
 * ทะเบียน พจส. และตารางผู้สมัครใช้ร่วมกัน **หน้าไหนจะทำแถบสรุปใหม่ ให้ประกอบจากไฟล์นี้**
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
 *   <SummaryStrip>               แถบบาง ๆ ท้ายการ์ด (ทางลัด / ตัวกรองที่ใช้อยู่ / แท็บ)
 *     <SummaryTabs>              แท็บขีดเส้นใต้ที่วางทับขอบล่างของการ์ด
 * </SummaryPanel>
 * ```
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

type Tone = "ink" | "primary" | "alert" | "sla";

const TONE: Record<Tone, { value: string; bar: string; on: string; pill: string }> = {
  ink: { value: "text-ink", bar: "bg-ink/40", on: "bg-base-200", pill: "bg-base-200 text-mut" },
  primary: { value: "text-primary", bar: "bg-primary", on: "bg-soft", pill: "bg-primary/12 text-primary" },
  alert: { value: "text-alert", bar: "bg-alert", on: "bg-alert-soft", pill: "bg-alert/12 text-alert" },
  sla: { value: "text-sla", bar: "bg-sla", on: "bg-sla/10", pill: "bg-sla/12 text-sla" },
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
    <section
      aria-label={label}
      className={`overflow-hidden rounded-box border border-line bg-base-100 elev-card ${className}`}
    >
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
    <div className={`grid gap-px border-b border-line bg-line ${className}`}>{children}</div>
  );
}

/**
 * หนึ่งช่องตัวเลข — ส่ง `onClick` แล้วกลายเป็นปุ่มกรอง (`aria-pressed` ตาม `active`)
 *
 * ช่อง `lead` เป็นพื้น `head` (เขียวเข้ม) — ตัวหนังสือบนพื้นนั้นพลิกเป็นสีอ่อนเองผ่าน
 * บล็อก `.bg-head` ใน `globals.css`
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
  filterHint,
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
  /** แสดงป้าย “กดเพื่อกรอง / กรองอยู่” ที่มุมขวาของช่องที่กดได้ */
  filterHint?: boolean;
  title?: string;
  /** ช่องเตี้ย — สำหรับหน้าที่ตารางต้องได้ความสูงมากที่สุด */
  compact?: boolean;
  className?: string;
}) {
  const t = TONE[tone];
  const percent = share === undefined ? null : Math.min(100, Math.max(0, share * 100));
  const valueTone = lead && tone === "ink" ? "text-primary" : t.value;

  const body = (
    <>
      <span className="flex items-center gap-1.5 text-11-5 text-mut">
        {dot ? <span aria-hidden className={`size-2 flex-none rounded-full ${dot}`} /> : null}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {onClick && filterHint ? (
          <span
            aria-hidden
            className={`flex-none rounded-full px-1.5 py-0.5 text-10 whitespace-nowrap transition-opacity duration-200 ${
              active ? t.pill : "bg-base-200 text-mut opacity-0 group-hover:opacity-100"
            }`}
          >
            {active ? "กรองอยู่" : "กดเพื่อกรอง"}
          </span>
        ) : null}
      </span>

      <span className={`flex min-w-0 ${compact ? "items-baseline gap-1.5" : "flex-col gap-1"}`}>
        <span className="flex items-baseline gap-1">
          <span
            key={value}
            className={`animate-fade-in font-mono leading-none font-semibold tabular-nums ${
              compact ? "text-18" : "text-22"
            } ${valueTone}`}
          >
            {value.toLocaleString("th-TH")}
          </span>
          {unit ? <span className="text-12 text-mut">{unit}</span> : null}
          {percent !== null && !compact ? (
            <span
              className={`ml-1.5 flex-none rounded-full px-1.5 py-0.5 text-10-5 font-semibold tabular-nums ${t.pill}`}
            >
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

  const shell = `group relative flex min-w-0 flex-col overflow-hidden text-left ${
    compact ? "gap-1.5 px-3.5 py-2.5" : "gap-2 px-4 py-3.5"
  } ${lead ? "bg-head" : active ? t.on : "bg-base-100"} ${className}`;

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
    <div className={`flex flex-col gap-3 p-4 lg:flex-row lg:items-center ${className}`}>
      {children}
    </div>
  );
}

/** แถบบาง ๆ ท้ายการ์ด — ทางลัดไปหมวด ตัวกรองที่ใช้อยู่ หรือแท็บของตาราง */
export function SummaryStrip({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`border-t border-line bg-base-200/40 px-4 ${className}`}>{children}</div>
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
      className={`inline-flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-soft p-1 scrollbar-thin ${className}`}
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
              on ? "bg-base-100 font-semibold text-primary elev-card" : "text-mut hover:text-ink"
            }`}
          >
            {o.dot ? <span aria-hidden className={`size-1.5 rounded-full ${o.dot}`} /> : null}
            {o.label}
            {o.count !== undefined ? (
              <span className={`font-mono text-11 tabular-nums ${on ? "text-primary" : "text-mut"}`}>
                {o.count.toLocaleString("th-TH")}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
