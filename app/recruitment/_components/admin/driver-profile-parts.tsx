import { ShieldOff, type LucideIcon } from "lucide-react";

/* ชิ้นย่อยของหน้าประวัติคนขับ — ใช้ร่วมกันระหว่าง `driver-profile.tsx` กับแท็บข้อมูลฝึกงาน (`driver-training.tsx`) */

export function Section({
  title,
  action,
  note,
  children,
}: {
  title: string;
  /** ปุ่มท้ายหัวกล่อง เช่น “แก้ไขข้อมูล” */
  action?: React.ReactNode;
  /** บรรทัดเล็กใต้หัวกล่อง */
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-14 font-semibold">{title}</h2>
          {action ? <div className="flex flex-none items-center gap-2">{action}</div> : null}
        </div>
        {note ? <p className="text-11-5 text-mut">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function Field({
  icon: Icon,
  label,
  value,
  note,
  noteTone = "mut",
  href,
  noteHref,
  mono,
}: {
  /** ไม่ใส่ = ไม่มีไอคอนหน้าช่อง (ช่องในกลุ่มเอกสาร — หัวกลุ่มมีไอคอนแล้ว) */
  icon?: LucideIcon;
  label: string;
  value: string;
  note?: string;
  noteTone?: "mut" | "sla" | "alert" | "primary";
  href?: string;
  /** ลิงก์ของบรรทัดรอง เช่น เบอร์ผู้ติดต่อฉุกเฉิน */
  noteHref?: string;
  mono?: boolean;
}) {
  const tone =
    noteTone === "alert"
      ? "text-alert font-medium"
      : noteTone === "sla"
        ? "text-sla font-medium"
        : noteTone === "primary"
          ? "text-primary font-medium"
          : "text-mut";

  const text = value.trim();
  const body = text ? (
    <span className={mono ? "font-mono text-13" : "text-13-5"}>{text}</span>
  ) : (
    <span className="text-13 text-mut">ยังไม่ระบุ</span>
  );

  return (
    <div className="flex min-w-0 gap-2.5">
      {Icon ? (
        <Icon size={15} strokeWidth={1.7} aria-hidden className="mt-0.5 flex-none text-mut" />
      ) : null}
      <div className="flex min-w-0 flex-col gap-0.5">
        <dt className="text-11-5 text-mut">{label}</dt>
        <dd className="m-0 flex flex-col gap-0.5">
          {href && text ? (
            <a href={href} className="w-fit transition-colors hover:text-primary">
              {body}
            </a>
          ) : (
            body
          )}
          {note ? (
            noteHref ? (
              <a
                href={noteHref}
                className={`w-fit font-mono text-12 transition-colors hover:text-primary ${tone}`}
              >
                {note}
              </a>
            ) : (
              <span className={`text-11-5 ${tone}`}>{note}</span>
            )
          ) : null}
        </dd>
      </div>
    </div>
  );
}

/**
 * เอกสารหนึ่งใบ = หนึ่งแถว — หัวแถว (ไอคอน + ชื่อเอกสาร) ซ้าย ช่องของใบนั้นขวา
 * ช่องในแถวจึงตั้งชื่อสั้นได้ (“วันหมดอายุ”) เพราะหัวแถวบอกแล้วว่าของใบไหน
 * จอเล็ก = หัวแถวขึ้นบรรทัดบน ช่องเรียงลงมา
 */
export function DocGroup({
  icon: Icon,
  title,
  badge,
  children,
}: {
  icon: LucideIcon;
  title: string;
  /** บรรทัดเล็กใต้ชื่อเอกสาร เช่น ชนิดใบขับขี่ */
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-6">
      <div className="flex items-start gap-2.5">
        <span className="flex size-8 flex-none items-center justify-center rounded-field bg-primary/10 text-primary">
          <Icon size={15} strokeWidth={1.8} aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
          <h3 className="text-13 font-semibold leading-tight">{title}</h3>
          {badge ? <span className="text-11-5 text-mut">{badge}</span> : null}
        </div>
      </div>
      <dl className="grid gap-x-10 gap-y-3 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">{children}</dl>
    </div>
  );
}

/**
 * ช่องที่ถูกซ่อนเพราะคนคนนี้พ้นสภาพแล้ว
 *
 * **ขึ้นเป็นช่องว่างที่บอกว่าซ่อน ไม่ใช่เอาแถวออกไปเงียบ ๆ** — แถวที่หายไปเฉย ๆ
 * อ่านได้ว่า “ระบบไม่เคยมีข้อมูลนี้” ซึ่งไม่จริง และคนที่ต้องใช้จริงจะไม่รู้ว่า
 * ต้องไปขอจากใคร
 */
export function Hidden({ icon: Icon, label }: { icon?: LucideIcon; label: string }) {
  return (
    <div className="flex min-w-0 gap-2.5">
      {Icon ? (
        <Icon size={15} strokeWidth={1.7} aria-hidden className="mt-0.5 flex-none text-mut" />
      ) : null}
      <div className="flex min-w-0 flex-col gap-0.5">
        <dt className="text-11-5 text-mut">{label}</dt>
        <dd className="m-0 flex items-center gap-1.5">
          <ShieldOff size={13} strokeWidth={1.8} aria-hidden className="flex-none text-mut" />
          <span className="text-12-5 text-mut">ซ่อนไว้ — พ้นสภาพแล้ว</span>
        </dd>
      </div>
    </div>
  );
}
