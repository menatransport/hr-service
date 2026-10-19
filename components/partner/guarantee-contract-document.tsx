"use client"

import { memo } from "react"

/**
 * สัญญาค้ำประกัน — เนื้อเอกสาร A4
 * ถอดแบบจากไฟล์ Word ต้นฉบับ (สัญญาค้ำประกัน ขวัญชัย แสนกันยา 71-2820)
 * ใช้ร่วมกันระหว่าง:
 *  - /contracts/[id]/guarantee-document  (หน้าพิมพ์ / Save as PDF)
 *  - live preview บน /contracts/new และ /contracts/[id]
 * ระบบตัวอักษร/หน้ากระดาษชุดเดียวกับ components/contract-document.tsx
 */

import type { Contract } from "@/lib/partner/types"
import { sarabun } from "@/lib/partner/fonts"
import { CORDIA_FONT_CSS } from "@/components/partner/cordia-font"
import { thaiDateParts, formatNationalId } from "@/lib/partner/thai-format"


const COMPANY = {
  name: "บริษัท มีนาทรานสปอร์ต จำกัด (มหาชน)",
  witnesses: ["นางสาวนัชภัค ขจรวุฒิเดช", "นางสาวธัญรดี ตะกิ่นนอก"],
}

/** Render value or a dotted blank (for hand-filling on paper). */
function V({ children, w }: { children?: React.ReactNode; w?: number }) {
  const empty =
    children === null || children === undefined || children === "" || children === "-"
  if (empty)
    return (
      <span
        className="inline-block border-b border-dotted border-zinc-500 align-baseline"
        style={{ minWidth: (w ?? 60) + "px" }}
      >
        &nbsp;
      </span>
    )
  return <b>{children}</b>
}

function GuaranteeContractDocumentImpl({ contract }: { contract: Contract }) {
  const c = contract
  const dateParts = thaiDateParts(c.contractDate)

  return (
    <div className={sarabun.className}>
      <style>{`
        ${CORDIA_FONT_CSS}
        .contract-doc { background: #d4d4d8; margin: -28px -32px; padding: 24px 8px; min-height: 100%; }
        .sheet { font-family: "CordiaUPC", "Cordia New", ${sarabun.style.fontFamily}; }
        .sheet {
          width: 210mm; min-height: 297mm; margin: 0 auto 16px;
          background: #fff; color: #000;
          padding: 12.5mm 16mm 10mm 20mm;
          box-shadow: 0 4px 24px rgba(0,0,0,.18);
          font-size: 16pt; line-height: normal;
        }
        .doc-title { text-align: center; font-weight: 700; font-size: 18pt; margin-bottom: 6pt; }
        /* ย่อหน้าข้อสัญญาแบบ hanging indent ตามต้นฉบับ Word (ind left=720 hanging=720):
           "ข้อ N." ชิดซ้าย เนื้อหาต่อท้าย บรรทัดที่ตัดขึ้นใหม่ตรงระดับ 36pt */
        .clause { margin-top: 12pt; padding-left: 42pt; text-indent: -42pt; }
        .clause-no { font-weight: 700; display: inline-block; min-width: 42pt; }
        .cont { margin-left: 42pt; }
        .indent { text-indent: 36pt; }
        .sheet p { margin: 0; text-align: justify; text-justify: inter-character; orphans: 3; widows: 3; }
        .sig-table { width: 100%; margin-top: 18px; }
        .sig-table td { width: 50%; text-align: center; padding: 14px 8px 2px; vertical-align: bottom; }
        .sig-block { break-inside: avoid; page-break-inside: avoid; }

        @page { size: A4 portrait; margin: 12.5mm 16mm 10mm 20mm; }
        @media print {
          html, body { display: block !important; height: auto !important; overflow: visible !important;
                       background: #fff !important; }
          aside, header, nav { display: none !important; }
          main, .overflow-hidden { overflow: visible !important; height: auto !important; }
          main { padding: 0 !important; }
          .contract-doc { background: #fff; margin: 0; padding: 0; }
          .sheet { width: auto; min-height: 0; margin: 0; box-shadow: none; padding: 0; }
          .print-hide { display: none !important; }
        }
      `}</style>

      <div className="sheet">
        <div className="doc-title">สัญญาค้ำประกัน</div>

        <p style={{ textAlign: "right" }}>ทำที่ {COMPANY.name}</p>
        <p style={{ textAlign: "right" }}>
          วันที่ <V w={30}>{dateParts?.day}</V> เดือน <V w={80}>{dateParts?.monthName}</V> พ.ศ.{" "}
          <V w={50}>{dateParts?.yearBE}</V>
        </p>

        <p className="indent" style={{ marginTop: 8 }}>
          ข้าพเจ้า <V w={200}>{c.guarantorName}</V> เลขประจำตัวประชาชน{" "}
          <V w={140}>{c.guarantorNationalId ? formatNationalId(c.guarantorNationalId) : undefined}</V>{" "}
          อยู่บ้านเลขที่ <V w={260}>{c.guarantorAddress}</V> ซึ่งต่อไปในสัญญานี้จะเรียกว่า
          “ผู้ค้ำประกัน” ขอทำสัญญาค้ำประกันฉบับนี้ให้ไว้ต่อ{COMPANY.name}{" "}
          ซึ่งต่อไปในสัญญานี้จะเรียกว่า “ผู้ขาย” โดยมีข้อความดังต่อไปนี้
        </p>

        <p className="clause"><span className="clause-no">ข้อ 1.</span>
          ตามที่ <V w={200}>{c.buyerName}</V> ซึ่งต่อไปในสัญญานี้จะเรียกว่า “ผู้ซื้อ”
          ได้ทำสัญญาซื้อขายรถยนต์บรรทุก (แบบผ่อนชำระราคา) ฉบับลงวันที่{" "}
          <V w={30}>{dateParts?.day}</V> <V w={80}>{dateParts?.monthName}</V> พ.ศ.{" "}
          <V w={50}>{dateParts?.yearBE}</V> (สัญญาซื้อขาย) ไว้กับผู้ขาย
          ผู้ค้ำประกันตกลงยินยอมผูกพันตนต่อผู้ขาย เพื่อค้ำประกันหนี้และจะชำระหนี้พร้อมดอกเบี้ย
          รวมทั้งบรรดาค่าเสียหายต่าง ๆ ค่าเบี้ยปรับ ค่าธรรมเนียม
          และค่าใช้จ่ายที่เกิดขึ้นตามสัญญาซื้อขายฉบับดังกล่าว
          จนกว่าผู้ขายจะได้รับชำระหนี้หรือได้รับชดใช้จนสิ้นเชิงครบถ้วนสมบูรณ์
        </p>

        <p className="clause"><span className="clause-no">ข้อ 2.</span>
          เมื่อผู้ซื้อตกเป็นผู้ผิดนัดไม่ชำระหนี้ตามสัญญาซื้อขายที่ระบุในข้อ 1.
          หรือผู้ซื้อถูกศาลสั่งพิทักษ์ทรัพย์ หรือศาลมีคำสั่งรับคำร้องขอฟื้นฟูกิจการผู้ซื้อ
          หรือผู้ซื้อถึงแก่ความตาย หรือตกเป็นผู้ไร้ความสามารถ หรือผู้เสมือนไร้ความสามารถ
          หรือเป็นผู้สาบสูญ หรือไปเสียจากถิ่นที่อยู่หาตัวไม่พบ
          และผู้ขายได้มีหนังสือบอกกล่าวไปยังผู้ค้ำประกันโดยชอบตามกฎหมายแล้ว
          ผู้ค้ำประกันตกลงเข้ารับผิดในหนี้ตามสัญญาซื้อขายดังกล่าวในฐานะผู้ค้ำประกันทันที
          โดยสัญญาว่าจะนำเงินที่ผู้ซื้อค้างชำระมาชำระให้แก่ผู้ขาย
          แต่ไม่ตัดสิทธิผู้ค้ำประกันที่จะชำระหนี้เมื่อถึงกำหนดชำระ
        </p>

        <p className="clause"><span className="clause-no">ข้อ 3.</span>
          ในกรณีที่ผู้ขายผ่อนเวลาส่งเงินงวดชำระหนี้ตามที่กำหนดไว้ให้แก่ผู้ซื้อ
          หากผู้ขายได้ส่งคำบอกกล่าวให้ผู้ค้ำประกันทราบโดยชอบแล้ว
          ผู้ค้ำประกันตกลงจะให้ความยินยอมกับการผ่อนเวลานั้นทุกครั้ง
        </p>

        <p className="clause"><span className="clause-no">ข้อ 4.</span>
          ผู้ค้ำประกันจะไม่เพิกถอนการค้ำประกันนี้ หรือทำให้ผู้ขายเสียสิทธิใด ๆ ตามสัญญานี้
          จนกว่าผู้ซื้อจะได้ชำระหนี้ตามสัญญาซื้อขายหรือความรับผิดใด ๆ
          ที่มีอยู่ต่อผู้ขายครบถ้วนสมบูรณ์แล้ว
        </p>

        <p className="clause"><span className="clause-no">ข้อ 5.</span>
          แม้จะปรากฏว่า การกระทำอย่างใดอย่างหนึ่งของผู้ขาย
          เป็นเหตุให้ผู้ค้ำประกันไม่อาจเข้ารับช่วงได้ทั้งหมดหรือแต่เพียงบางส่วนในสิทธิใด ๆ
          ไม่ว่าจะเป็น จำนอง จำนำ และบุริมสิทธิอื่นใด
          ซึ่งผู้ซื้อได้ให้ไว้แก่ผู้ขายก่อนหรือในขณะทำสัญญาฉบับนี้
          ผู้ค้ำประกันไม่หลุดพ้นจากความรับผิดตามความในสัญญาฉบับนี้ไม่ว่าจะทั้งหมดหรือแต่เพียงบางส่วนก็ตาม
        </p>

        <p className="clause"><span className="clause-no">ข้อ 6.</span>
          หากเงินที่ผู้ขายได้รับชำระหนี้ไว้จากผู้ซื้อ และ/หรือผู้ค้ำประกัน
          ถูกเพิกถอนการชำระหนี้ตามกฎหมายแพ่งหรือกฎหมายล้มละลาย หรือเหตุอื่นใดตามกฎหมาย
          ผู้ค้ำประกันยินยอมชดใช้เงินที่ผู้ขายต้องเสียไปดังกล่าวคืนแก่ผู้ขายทันทีที่ได้รับหนังสือทวงถามจากผู้ขาย
        </p>

        <p className="clause"><span className="clause-no">ข้อ 7.</span>
          ในระหว่างที่สัญญาค้ำประกันนี้ยังมีผลใช้บังคับอยู่ หากผู้ค้ำประกันเป็นเจ้าหนี้ของผู้ซื้อ
          ผู้ค้ำประกันยินยอมให้หนี้ของตนเป็นหนี้ลำดับรองจากหนี้ของผู้ขาย
          และหากได้รับเงินหรือทรัพย์สินอื่นใด ๆ จากผู้ซื้อไว้เพื่อชำระคืนหนี้ของตน
          ผู้ค้ำประกันตกลงส่งมอบเงินหรือทรัพย์สินนั้นให้แก่ผู้ขายทันทีที่ได้รับหนังสือทวงถามจากผู้ขาย
        </p>

        <p className="clause"><span className="clause-no">ข้อ 8.</span>
          สัญญาค้ำประกันฉบับนี้ให้มีผลผูกพันต่อบรรดาผู้สืบสิทธิ ผู้รับโอน ผู้จัดการมรดก
          และผู้แทนของผู้ค้ำประกัน
          แต่ผู้ค้ำประกันจะโอนหน้าที่ตามสัญญาค้ำประกันนี้ให้แก่บุคคลอื่นโดยปราศจากความยินยอมเป็นลายลักษณ์อักษรของผู้ขายก่อนหาได้ไม่
        </p>

        <p className="clause"><span className="clause-no">ข้อ 9.</span>
          ผู้ค้ำประกันตกลงและให้ความยินยอมโดยไม่มีการเพิกถอนให้ผู้ขายเก็บ รวบรวม ใช้
          เปิดเผยข้อมูลเกี่ยวกับผู้ค้ำประกันที่มีอยู่กับผู้ขายให้แก่ผู้ถือหุ้นรายใหญ่
          หรือบริษัทในกลุ่มซึ่งมีผู้ถือหุ้นรายใหญ่รายเดียวกัน
          เพื่อประโยชน์ในการที่จะได้รับข้อเสนอเกี่ยวกับบริการ วิเคราะห์
          จัดทำฐานข้อมูลของผู้ค้ำประกัน การตลาด หรือดำเนินการต่าง ๆ รวมทั้งการใช้เพื่อการอ้างอิง
          การติดต่อ การวางแผนการจัดทำสถิติ และการอื่นใดตามกฎหมายกำหนด
          แม้ว่าการค้ำประกันนั้นสิ้นสุดไปแล้วก็ตาม
        </p>

        <p className="clause"><span className="clause-no">ข้อ 10.</span>
          ผู้ค้ำประกันรับรองว่า ผู้ขายมีสิทธิโดยชอบและสมบูรณ์ที่จะขาย โอน มอบ จำนำ ก่อภาระผูกพัน
          นำไปเป็นหลักประกัน
          หรือจำหน่ายโดยประการอื่นซึ่งส่วนหนึ่งส่วนใดหรือทั้งหมดของสิทธิ
          กรรมสิทธิ์และผลประโยชน์ของผู้ขายตามสัญญาซื้อขายและสัญญาค้ำประกันนี้
        </p>

        <p className="clause"><span className="clause-no">ข้อ 11.</span>
          การแจ้งไปยังผู้ค้ำประกันให้ทราบภาระการชำระหนี้
          หรือส่งคำบอกกล่าวเป็นหนังสือบอกกล่าวทวงถาม
          หรือหนังสืออื่นใดที่จะส่งให้แก่ผู้ค้ำประกันโดยไปรษณีย์ลงทะเบียนหรือไม่ลงทะเบียน
          ถ้าหากได้ส่งไปยังสถานที่ที่ระบุไว้ข้างต้นของสัญญาหรือที่อยู่ที่ผู้ค้ำประกันแจ้งการเปลี่ยนแปลงไว้เป็นหนังสือหลังสุดนี้แล้ว
          ให้ถือว่าเป็นการส่งโดยชอบด้วยกฎหมาย
          และหากส่งให้ไม่ได้เพราะสถานที่ดังกล่าวเปลี่ยนแปลงหรือรื้อถอนไปโดยผู้ค้ำประกันไม่มีการแจ้งให้ผู้ขายทราบล่วงหน้าเป็นลายลักษณ์อักษรแล้ว
          การส่งหนังสือต่าง ๆ ที่ได้ส่งไปแล้ว ให้ถือว่าชอบด้วยกฎหมาย
        </p>

        <p className="clause"><span className="clause-no">ข้อ 12.</span>
          ผู้ค้ำประกันสัญญาว่า ถ้าผู้ค้ำประกันเปลี่ยนแปลงที่อยู่ไปจากที่ระบุไว้ในสัญญาค้ำประกันนี้
          ผู้ค้ำประกันจะมีหนังสือแจ้งที่อยู่ใหม่ให้ผู้ขายทราบภายใน 7 วัน
          นับตั้งแต่ที่มีการเปลี่ยนแปลง
        </p>

        <p className="clause"><span className="clause-no">ข้อ 13.</span>
          ข้อกำหนดและเงื่อนไขในข้อสัญญาแต่ละข้อของสัญญาฉบับนี้
          ต่างมีผลบังคับใช้แยกต่างหากจากกัน กล่าวคือ
          ความสมบูรณ์และการมีผลบังคับใช้ของข้อสัญญาอื่น ๆ
          จะไม่ได้รับผลกระทบหากข้อสัญญาข้อใดข้อหนึ่งตกเป็นโมฆะ
          และในกรณีที่ข้อสัญญาเหล่านั้นต้องตกเป็นโมฆะ
          แต่การแก้ไขตัดทอนข้อความบางส่วนจะทำให้ข้อสัญญาดังกล่าวมีผลโดยชอบ
          ก็ให้บังคับใช้ข้อสัญญาข้อนั้น โดยให้ถือว่า
          มีการแก้ไขตัดทอนข้อความบางส่วนที่เป็นโมฆะนั้นเสีย
          เฉพาะเท่าที่จะทำให้ข้อสัญญาดังกล่าวมีผลบังคับใช้โดยชอบด้วยกฎหมาย
        </p>

        {/* ── ปิดท้าย + ลายเซ็น ── */}
        <div className="sig-block">
          <p className="indent" style={{ marginTop: 12 }}>
            ผู้ค้ำประกันได้อ่านข้อความแห่งสัญญานี้เป็นที่เข้าใจและเห็นว่าถูกต้องตรงตามเจตนาแล้ว
            จึงลงลายมือชื่อไว้เป็นหลักฐานต่อหน้าพยาน
          </p>
          <table className="sig-table">
            <tbody>
              <tr>
                <td>
                  ลงชื่อ.............................................ผู้ค้ำประกัน
                  <br />( {c.guarantorName || "................................."} )
                </td>
                <td>
                  ลงชื่อ.............................................คู่สมรส / ผู้ยินยอม
                  <br />( ................................. )
                </td>
              </tr>
              <tr>
                <td>
                  ลงชื่อ.............................................พยาน
                  <br />( {COMPANY.witnesses[0]} )
                </td>
                <td>
                  ลงชื่อ.............................................พยาน
                  <br />( {COMPANY.witnesses[1]} )
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export const GuaranteeContractDocument = memo(GuaranteeContractDocumentImpl)
