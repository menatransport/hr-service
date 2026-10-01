import { Sarabun } from "next/font/google";

/**
 * ชิ้นส่วนกระดาษของเอกสาร HR — แผ่น A4 · ช่องเส้นประ · ช่องติ๊ก · ช่องลงนาม
 *
 * ใช้ร่วมกันระหว่างใบสมัคร (`hr-document-application.tsx`) กับสัญญาสามฉบับ
 * (`hr-document-contracts.tsx`) · ขนาดและสีของกระดาษอยู่ที่คลาส `.hrdoc-*`
 * ใน `app/globals.css` ส่วน “เอกสาร HR” — กระดาษขาวทั้งสองธีมโดยตั้งใจ
 *
 * **ค่าที่ระบบเติมเป็นหมึกน้ำเงิน ส่วนช่องที่ไม่มีข้อมูลเหลือเส้นประเปล่า** — ท่าเดียวกับ
 * เอกสารที่ฝ่ายบุคคลพิมพ์เติมเองมาตลอด คนเซ็นแยกออกทันทีว่าช่องไหนต้องเขียนมือ
 *
 * ฟอนต์ Sarabun (ตระกูลเดียวกับ TH Sarabun ของเอกสารราชการ) โหลดเฉพาะตอนเปิด
 * กล่องทำเอกสาร — ไม่ได้ผูกไว้ที่ `app/layout.tsx` เพราะหน้าอื่นไม่ใช้
 */

const sarabun = Sarabun({
  subsets: ["thai", "latin"],
  weight: ["400", "700"],
  display: "swap",
});

/** แผ่น A4 หนึ่งแผ่นบนจอ — ตอนพิมพ์คลี่ตามเนื้อหาและขึ้นหน้าใหม่ก่อนแผ่นถัดไป */
export function Sheet({
  code,
  letterhead = false,
  children,
}: {
  /** รหัสแบบฟอร์มมุมขวาบน เช่น `HR 0204-04` */
  code?: string;
  /** หัวกระดาษบริษัทแบบสัญญา — ใบสมัครวาดหัวของตัวเอง */
  letterhead?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`hrdoc-sheet elev-card ${sarabun.className}`}>
      {letterhead ? (
        <Letterhead code={code} />
      ) : code ? (
        <p className="hrdoc-small text-right">{code}</p>
      ) : null}
      {children}
    </section>
  );
}

/** หัวกระดาษของสัญญา — โลโก้ + ชื่อบริษัทสองภาษา + รหัสแบบฟอร์ม */
function Letterhead({ code }: { code?: string }) {
  return (
    <header className="mb-[5mm] flex items-center gap-[4mm] border-b-2 border-brand-red pb-[2mm]">
      <MenaLogo className="h-[17mm]" />
      <div className="flex flex-col">
        <span className="hrdoc-company text-brand">บริษัท มีนาทรานสปอร์ต จำกัด (มหาชน)</span>
        <span className="hrdoc-small tracking-[0.06em] text-brand">
          MENA TRANSPORT PUBLIC COMPANY LIMITED
        </span>
      </div>
      {code ? <span className="hrdoc-small mb-auto ml-auto">{code}</span> : null}
    </header>
  );
}

export function MenaLogo({ className = "" }: { className?: string }) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src="/mena-logo.png" alt="Mena" className={`w-auto flex-none ${className}`} />
  );
}

/**
 * ช่องเติมคำ — มีค่าเป็นหมึกน้ำเงินบนเส้นประ · ไม่มีค่าเหลือเส้นประเปล่ายาวตาม `w`
 * `grow` = ยืดกินที่ที่เหลือของบรรทัด (ใช้ใน `Row`)
 */
export function Blank({
  v,
  w = "5em",
  grow = false,
  left = false,
}: {
  v?: string;
  w?: string;
  grow?: boolean;
  left?: boolean;
}) {
  const value = v?.trim();
  return (
    <span
      className={`hrdoc-blank ${grow ? "hrdoc-grow" : ""} ${left ? "text-left" : ""}`}
      style={{ minWidth: w }}
    >
      {value || " "}
    </span>
  );
}

/** บรรทัดแบบฟอร์ม — ป้ายกับช่องเติมเรียงกัน ช่อง `grow` ยืดชนขอบขวา */
export function Row({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`hrdoc-row ${className}`}>{children}</div>;
}

/** ช่องติ๊ก ☐ / ☑ — ติ๊กเป็นหมึกน้ำเงินเหมือนค่าที่เติม */
export function Box({ on = false, children }: { on?: boolean; children?: React.ReactNode }) {
  return (
    <span className="hrdoc-choice">
      <span className="hrdoc-box" aria-label={on ? "เลือก" : "ไม่เลือก"}>
        {on ? "✓" : ""}
      </span>
      {children}
    </span>
  );
}

/** ข้อสัญญาหนึ่งย่อหน้า — ย่อหน้าแรกเยื้องเข้า ตามรูปเอกสารจริง */
export function Clause({
  no,
  indent = 1,
  children,
}: {
  no?: string;
  /** ระดับการเยื้อง — ข้อย่อย `8.1` เยื้องลึกกว่าข้อหลัก */
  indent?: 1 | 2 | 3;
  children: React.ReactNode;
}) {
  return (
    <p className={`hrdoc-clause hrdoc-indent-${indent}`}>
      {no ? <span>{no} </span> : null}
      {children}
    </p>
  );
}

/** ค่าที่เติมกลางประโยค — หมึกน้ำเงิน ขีดเส้นประใต้ ไม่มีค่าก็เว้นเส้นประไว้ */
export function Fill({ v, w = "6em" }: { v?: string; w?: string }) {
  return <Blank v={v} w={v?.trim() ? "0" : w} />;
}

/** ช่องลงนาม — `ลงชื่อ.......บทบาท` แล้ววงเล็บชื่อบรรทัดล่าง */
export function SignLine({ role, name }: { role: string; name?: string }) {
  return (
    <div className="hrdoc-sign">
      <Row>
        <span>ลงชื่อ</span>
        <Blank w="15em" />
        <span>{role}</span>
      </Row>
      <Row className="justify-center">
        <span>(</span>
        <Blank v={name} w="14em" />
        <span>)</span>
      </Row>
    </div>
  );
}
