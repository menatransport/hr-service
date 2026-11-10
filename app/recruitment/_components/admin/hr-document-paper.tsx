import { Sarabun } from "next/font/google";

import { thaiLongDate } from "@/app/recruitment/_lib/hr-documents";

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

/**
 * แผ่น A4 หนึ่งแผ่นบนจอ — ตอนพิมพ์คลี่ตามเนื้อหาและขึ้นหน้าใหม่ก่อนแผ่นถัดไป
 *
 * `letterhead` = กระดาษบริษัทเต็มชุด: หัว (โลโก้ + ชื่อบริษัท) และท้าย (ISO + ที่อยู่
 * สำนักงาน — `public/hr-doc-footer.jpg`, Bew 8 พ.ย. 2569) · บนจอท้ายกระดาษอยู่ล่างสุดของแผ่น
 * ตอนพิมพ์ต้องขึ้น**ทุกหน้า** (สัญญาจ้างยาวเจ็ดหน้าในแผ่นเดียว) จึงเป็น `position: fixed`
 * ซึ่ง Chrome วาดซ้ำทุกหน้า + ตาราง `.hrdoc-frame` ที่ `tfoot` เว้นที่ว่างเท่าท้ายกระดาษ
 * ซ้ำทุกหน้า เนื้อหาจึงไม่ไหลทับ · บนจอตารางเป็น `display: contents` — ลูกยังเป็น
 * flex item ของแผ่นเหมือนเดิม
 */
export function Sheet({
  code,
  letterhead = false,
  dense = false,
  children,
}: {
  /** รหัสแบบฟอร์มมุมขวาบน เช่น `HR0204-04` */
  code?: string;
  /** หัว + ท้ายกระดาษบริษัท — ใบสมัครวาดหัวของตัวเอง */
  letterhead?: boolean;
  /**
   * บรรทัดชิดขึ้น — `true` = 1.4 (สัญญาจ้าง/สัญญาค้ำ) · `"tight"` = 10pt/1.32 สำหรับ
   * ยินยอมคืนเงินค้ำที่เนื้อหาเต็มหน้าพอดี ชุดลงนามต้องอยู่หน้าเดียวกันเสมอ (Bew 10 พ.ย. 2569)
   */
  dense?: boolean | "tight";
  children: React.ReactNode;
}) {
  const cls = `hrdoc-sheet elev-card ${dense === "tight" ? "hrdoc-tight" : dense ? "hrdoc-dense" : ""} ${sarabun.className}`;
  if (!letterhead) {
    return (
      <section className={cls}>
        {code ? <p className="hrdoc-small text-right">{code}</p> : null}
        {children}
      </section>
    );
  }
  return (
    <section className={cls}>
      <table className="hrdoc-frame">
        <tbody>
          <tr>
            <td>
              <Letterhead code={code} />
              {children}
            </td>
          </tr>
        </tbody>
        <tfoot aria-hidden>
          <tr>
            <td>
              <div className="hrdoc-footer-space" />
            </td>
          </tr>
        </tfoot>
      </table>
      <footer className="hrdoc-footer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/hr-doc-footer.jpg" alt="ISO 9001 · ISO 45001 · ที่อยู่สำนักงาน" />
      </footer>
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

/**
 * ช่องลงนาม — `ลงชื่อ.......บทบาท` แล้ววงเล็บชื่อบรรทัดล่าง · มีรูปลายเซ็น (`signature`)
 * = วางรูปทับเส้นประ ท่าเดียวกับเซ็นปากกาบนกระดาษ · `dated` = มีบรรทัดวันที่ด้วย
 * (เติมวันที่เซ็นให้เมื่อมีลายเซ็น)
 */
export function SignLine({
  role,
  name,
  signature,
  dated = false,
  compact = false,
}: {
  role: string;
  name?: string;
  signature?: { image: string; signedAt: string };
  dated?: boolean;
  /**
   * แบบกระชับสำหรับวางสี่ช่องในแถวเดียว — บทบาทลงบรรทัดใต้ชื่อแทนท้ายเส้น
   * เส้นลงชื่อยืดเต็มคอลัมน์ · ใช้ให้ชุดลงนามอยู่หน้าเดียวกับเนื้อหา (Bew 10 พ.ย. 2569)
   */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="hrdoc-sign hrdoc-sign-compact">
        <Row className="w-full">
          <span>ลงชื่อ</span>
          <span className="hrdoc-blank hrdoc-sig-slot hrdoc-grow">
            {signature ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={signature.image} alt="" className="hrdoc-sig-img" />
            ) : null}
            {" "}
          </span>
        </Row>
        {/* ชื่อตัวเล็กลงหนึ่งขั้นและไม่ตัดบรรทัด — คอลัมน์กว้าง ~40mm ชื่อยาวแตกสองบรรทัดแล้วดันทั้งแถว */}
        <Row className="hrdoc-sign-name w-full justify-center">
          <span>(</span>
          <Blank v={name} grow />
          <span>)</span>
        </Row>
        <span className="hrdoc-sign-name text-center">{role}</span>
      </div>
    );
  }
  return (
    <div className="hrdoc-sign">
      <Row>
        <span>ลงชื่อ</span>
        <span className="hrdoc-blank hrdoc-sig-slot" style={{ minWidth: "15em" }}>
          {signature ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={signature.image} alt="" className="hrdoc-sig-img" />
          ) : null}
          {" "}
        </span>
        <span>{role}</span>
      </Row>
      <Row className="justify-center">
        <span>(</span>
        <Blank v={name} w="14em" />
        <span>)</span>
      </Row>
      {dated ? (
        <Row className="justify-center">
          <span>วันที่</span>
          <Blank v={signature ? thaiLongDate(bangkokDate(signature.signedAt)) : ""} w="12em" />
        </Row>
      ) : null}
    </div>
  );
}

/** ประทับเวลา ISO → `YYYY-MM-DD` ตามเวลาไทย */
function bangkokDate(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? "" : new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);
}
