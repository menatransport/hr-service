"use client"

import { memo } from "react"

/**
 * เอกสารเปิดเจ้าหนี้รายใหม่ (vendor onboarding pack) — 3 ส่วน / 4 หน้า A4
 * ถอดแบบจากไฟล์ PDF ต้นฉบับ "เอกสารเปิดเจ้าหนี้รายใหม่ vender.pdf":
 *  1) ใบขอเปิดเจ้าหนี้รายใหม่/สาขา — แบบฟอร์มลงทะเบียนผู้ขาย/ผู้ให้บริการ
 *  2) หนังสือให้ความยินยอม PDPA (Rev.1 1.11.65)
 *  3) ใบคัดเลือกผู้ส่งมอบ FC102-07
 * ใช้ร่วมกันระหว่างหน้าพิมพ์ /contracts/[id]/vendor-document และ live preview
 */

import type { Contract } from "@/lib/partner/types"
import { sarabun } from "@/lib/partner/fonts"
import { CORDIA_FONT_CSS } from "@/components/partner/cordia-font"
import { thaiDate, formatNationalId } from "@/lib/partner/thai-format"


const COMPANY = {
  name: "บริษัท มีนาทรานสปอร์ต จำกัด (มหาชน)",
  nameEn: "MENA TRANSPORT PUBLIC COMPANY LIMITED",
  hqAddress: "455/12-14 ถนนพระราม 6 แขวงถนนเพชรบุรี เขตราชเทวี กรุงเทพมหานคร 10400",
  website: "www.menatransport.co.th",
  phone: "02-613-9450",
  privacyEmail: "data.privacy@menatransport.co.th",
}

/** Render value or a dotted blank. */
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

/** Checkbox ตามต้นฉบับ */
function CB({ on = false }: { on?: boolean }) {
  return (
    <span
      style={{
        display: "inline-block", width: "14px", height: "14px",
        border: "1.2px solid #000", textAlign: "center",
        lineHeight: "12px", fontSize: "11pt", marginRight: "6px",
        verticalAlign: "-2px", fontWeight: 700,
      }}
    >
      {on ? "✓" : " "}
    </span>
  )
}

function VendorDocDocumentImpl({ contract }: { contract: Contract }) {
  const c = contract

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
          font-size: 15pt; line-height: normal;
        }
        .doc-title { text-align: center; font-weight: 700; font-size: 17pt; }
        .sheet p { margin: 0; text-align: justify; text-justify: inter-character; orphans: 3; widows: 3; }
        .indent { text-indent: 36pt; }
        .attach-sheet { break-before: page; page-break-before: always; }
        .sig-block { break-inside: avoid; page-break-inside: avoid; }
        .box-table { border-collapse: collapse; width: 100%; margin: 6pt 0; }
        .box-table th, .box-table td { border: 1px solid #000; padding: 3pt 8pt; font-weight: 400; vertical-align: top; }
        .box-table th { font-weight: 700; text-align: center; text-decoration: underline; }
        .mena-brand { display: flex; align-items: center; gap: 10px; margin-bottom: 8pt; }
        .mena-logo { background: #c1121f; color: #fff; font-weight: 800; font-style: italic;
                     border-radius: 999px; padding: 2px 16px; font-size: 16pt; }

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

      {/* ════════ หน้า 1: ใบขอเปิดเจ้าหนี้รายใหม่ ════════ */}
      <div className="sheet">
        <div className="mena-brand">
          <span className="mena-logo">Mena</span>
          <span>
            <b>{COMPANY.name}</b>
            <br />
            <span style={{ fontSize: "11pt", color: "#1d4ed8" }}>{COMPANY.nameEn}</span>
          </span>
        </div>

        <table style={{ marginLeft: "auto", borderCollapse: "collapse", fontSize: "13pt" }}>
          <tbody>
            <tr>
              <td style={{ paddingRight: 8, textAlign: "right" }}>รหัสเจ้าหนี้ Winspeed</td>
              <td style={{ border: "1px solid #000", width: 120, height: 24, textAlign: "center", fontWeight: 700 }}>{c.vendorCodeWinspeed || ""}</td>
            </tr>
            <tr>
              <td style={{ paddingRight: 8, textAlign: "right" }}>รหัสเจ้าหนี้ ATMS</td>
              <td style={{ border: "1px solid #000", width: 120, height: 24, textAlign: "center", fontWeight: 700 }}>{c.vendorCodeAtms || ""}</td>
            </tr>
          </tbody>
        </table>

        <div className="doc-title">ใบขอเปิดเจ้าหนี้รายใหม่ / สาขา</div>
        <div className="doc-title" style={{ marginBottom: "8pt" }}>แบบฟอร์มลงทะเบียนผู้ขาย / ผู้ให้บริการ</div>

        <p style={{ textAlign: "right" }}>วันที่ <V w={110}>{c.contractDate ? thaiDate(c.contractDate) : undefined}</V></p>

        <p>
          ชื่อเจ้าหนี้ (ภาษาไทย) <V w={200}>{c.buyerName}</V>{" "}
          ชื่อเจ้าหนี้ (ภาษาอังกฤษ) <V w={160}>{c.buyerNameEn}</V>
        </p>
        <p>
          เลขประจำตัวผู้เสียภาษี/เลขทะเบียนพาณิชย์/เลขบัตรประชาชน{" "}
          <V w={220}>{c.nationalId ? formatNationalId(c.nationalId) : undefined}</V>
        </p>
        <p>ที่อยู่ (ภาษาไทย) <V w={420}>{c.driverAddress}</V></p>

        <div style={{ display: "flex", gap: "40px", marginTop: "4pt" }}>
          <span><CB /> สำนักงานใหญ่</span>
          <span><CB /> จดทะเบียนภาษีมูลค่าเพิ่ม</span>
        </div>
        <div style={{ display: "flex", gap: "40px" }}>
          <span><CB /> สาขา (สาขาที่ ........)</span>
          <span><CB on /> ภาษีหัก ณ ที่จ่าย <b>3</b> %</span>
        </div>

        <p>เครดิตการชำระเงิน <b>30</b> วัน</p>
        <p>เงื่อนไขการจ่ายชำระเงิน <V w={380}>โอนเข้าบัญชีธนาคารภายในวันทำการสุดท้ายของเดือนถัดไป</V></p>
        <p>
          ชื่อผู้ติดต่อ (1) <V w={170}>{c.buyerName}</V> เบอร์โทร <V w={110}>{c.phone}</V>{" "}
          Email Address <V w={120}>{c.email}</V>
        </p>
        <p>
          ชื่อผู้ติดต่อ (2) <V w={170} /> เบอร์โทร <V w={110} /> Email Address <V w={120} />
        </p>

        <table className="box-table">
          <tbody>
            <tr>
              <th>บริษัท</th>
              <th>ร้านค้า</th>
              <th>บุคคลธรรมดา</th>
            </tr>
            <tr>
              <td><CB /> หนังสือรับรองบริษัท (ไม่เกิน 6 เดือน)</td>
              <td><CB /> สำเนาหนังสือจดทะเบียนการค้า</td>
              <td><CB on /> สำเนาบัตรประชาชน</td>
            </tr>
          </tbody>
        </table>

        <p style={{ marginTop: "4pt" }}>
          <CB /> สำเนาทะเบียนภาษีมูลค่าเพิ่ม ภ.พ.20 (กรณีจด VAT){" "}
          <span style={{ marginLeft: 24 }}><CB /> อื่นๆ ระบุ <V w={140} /></span>
        </p>
        <p><CB on /> สำเนาหน้าสมุดบัญชี (กรณีโอนเงิน)</p>

        <p style={{ marginTop: "4pt" }}>
          ชื่อเจ้าของบัญชี / หน้าเช็คสั่งจ่าย <V w={220}>{c.buyerName}</V>{" "}
          ประเภทบัญชี <V w={130}>{c.bankAccountType}</V>
        </p>
        <p>
          หมายเลขบัญชีธนาคาร <V w={180}>{c.accountNumber ? `${c.accountNumber}${c.bankName ? ` (${c.bankName})` : ""}` : undefined}</V>{" "}
          สาขา <V w={150}>{c.bankBranch}</V>
        </p>

        <p style={{ marginTop: "6pt", fontSize: "13pt" }}>*** เอกสารทุกฉบับต้องมีลายเซ็นรับรองของผู้มีอำนาจจากผู้ขาย / ผู้ให้บริการด้วย</p>
        <p style={{ fontSize: "13pt" }}>*** กรณีบริษัท ต้องมีกรรมการเซ็นรับรองพร้อมประทับตราบริษัทฯ</p>

        <div className="sig-block">
          <p style={{ textAlign: "center", marginTop: "14pt" }}>
            ลงชื่อและประทับตราผู้มีอำนาจบริษัทผู้ขาย/ผู้บริการ.............................................................
          </p>
          <p style={{ textAlign: "center" }}>( {c.buyerName ? <b>{c.buyerName}</b> : " ".repeat(40)} )</p>
          <p style={{ textAlign: "center" }}>ตำแหน่ง....................................................................</p>

          <table style={{ border: "1.5px solid #000", marginTop: "12pt", width: "62%", fontSize: "13pt" }}>
            <tbody>
              <tr>
                <td style={{ padding: "6pt 10pt" }}>
                  <b>ส่วนนี้สำหรับ บมจ.มีนาทรานสปอร์ต</b>
                  <br />ผู้ขอเปิด ....................................................... ฝ่าย....................................
                  <br />ผู้อนุมัติ (ผู้จัดการฝ่าย)........................................... วันที่........................
                  <br />บัญชีบันทึก...................................... ผู้ตรวจทาน......................................
                </td>
              </tr>
            </tbody>
          </table>
          <p style={{ textAlign: "right", fontSize: "12pt", marginTop: "6pt" }}>Rev.1</p>
        </div>
      </div>

      {/* ════════ หน้า 2-3: หนังสือยินยอม PDPA ════════ */}
      <div className="sheet attach-sheet">
        <p style={{ textAlign: "right", fontSize: "13pt" }}>Rev.1 (1.11.65)</p>
        <div className="doc-title" style={{ marginBottom: "8pt" }}>
          หนังสือให้ความยินยอมเก็บรวบรวม ใช้ เปิดเผยข้อมูลส่วนบุคคลสำหรับ ลูกค้า คู่ค้า
        </div>
        <p className="indent">
          อ้างถึง พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ.2562 (พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล)
          บริษัท มีนาทรานสปอร์ต จำกัด (มหาชน) (บริษัท) ในฐานะผู้ควบคุมข้อมูลส่วนบุคคล
          ได้จัดทำนโยบายความเป็นส่วนตัวขึ้น เพื่อแจ้งให้ท่านในฐานะเจ้าของข้อมูลส่วนบุคคล
          ได้ทราบเกี่ยวกับรายละเอียดและวัตถุประสงค์ รวมถึงรายละเอียดเกี่ยวกับการเปิดเผยข้อมูลส่วนบุคคล
          ระยะเวลาในการจัดเก็บข้อมูลส่วนบุคคล ตลอดจนสิทธิตามกฎหมายของท่านที่เกี่ยวข้องกับข้อมูลส่วนบุคคล
        </p>
        <p className="indent">
          เพื่อให้สอดคล้องกับ พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล บริษัทมีความจำเป็นต้องขอความยินยอมในการเก็บ
          รวบรวม ใช้ หรือเปิดเผยข้อมูลส่วนบุคคลของท่านแก่บริษัท
          และ/หรือบุคคลที่ได้รับมอบหมายให้เป็นผู้ประมวลผลข้อมูลส่วนบุคคลจากบริษัท
          และ/หรือหน่วยงานของรัฐ และ/หรือเอกชนเพื่อปฏิบัติให้เป็นไปตามกฎหมาย ดังนี้
        </p>
        <p className="indent">
          ข้าพเจ้า (ชื่อ-สกุล) <V w={220}>{c.buyerName}</V> เลขบัตรประชาชน{" "}
          <V w={160}>{c.nationalId ? formatNationalId(c.nationalId) : undefined}</V> ในฐานะเจ้าของข้อมูลส่วนบุคคล
          ได้อ่านและรับทราบนโยบายความเป็นส่วนตัวของบริษัทแล้ว และขอให้ความยินยอมแก่บริษัท
          ในการเก็บรวบรวม ใช้ หรือเปิดเผยข้อมูลส่วนบุคคลของข้าพเจ้าที่มีอยู่กับบริษัทได้ภายใต้ข้อกำหนด
          เงื่อนไข และวัตถุประสงค์ ดังนี้
        </p>

        <p className="indent" style={{ marginTop: "4pt" }}>
          1. ข้อมูลที่จัดเก็บและใช้โดยบริษัท ข้อมูลส่วนบุคคลของเจ้าของข้อมูลส่วนบุคคลที่บริษัทได้รับมา ได้แก่
        </p>
        <p className="indent">
          - ข้อมูลส่วนบุคคล หมายถึง ข้อมูลที่ทำให้สามารถระบุตัวบุคคลนั้นได้ไม่ว่าทางตรงหรือทางอ้อม
          จากคู่ค้า ลูกค้า เช่น คำนำหน้า ชื่อ นามสกุล วัน เดือน ปีเกิด เพศ อายุ สัญชาติ
          หมายเลขบัตรประชาชน เลขหนังสือเดินทาง เลขประจำตัวผู้เสียภาษีอากร เบอร์โทรศัพท์ อีเมล์ ที่อยู่
          ไลน์ไอดี
        </p>
        <p className="indent">
          - ข้อมูลด้านการทำธุรกิจ หมายถึง ข้อมูลหรือสิ่งใดๆ ที่แสดงออกมาในรูปแบบเอกสาร แฟ้ม รายงาน
          หนังสือ แผนผัง แผนที่ ภาพวาด ภาพถ่าย ฟิล์ม การบันทึกภาพนิ่ง หรือภาพเคลื่อนไหว
          หรือเสียงการบันทึกโดยเครื่องมือทางอิเลคโทรนิกส์ที่ทำให้สิ่งที่บันทึกไว้ปรากฏขึ้นในเรื่องเกี่ยวกับการดำเนินธุรกิจของบุคคลที่สามารถระบุตัวบุคคลได้
        </p>
        <p className="indent">
          - ข้อมูลส่วนบุคคลที่มีความอ่อนไหว ได้แก่ ข้อมูลสุขภาพ ชีวภาพ ประวัติอาชญากรรม ศาสนา
          โดยเป็นข้อมูลส่วนบุคคลที่มีความสมบูรณ์ ถูกต้อง เป็นปัจจุบัน และมีคุณภาพ
          และถูกนำไปใช้ให้เป็นไปตามวัตถุประสงค์ที่กำหนดไว้ตามหนังสือนี้เท่านั้น
          และบริษัทจะดำเนินมาตรการที่เข้มงวดในการรักษาความมั่นคงปลอดภัย
          ตลอดจนการป้องกันมิให้มีการนำข้อมูลส่วนบุคคลไปใช้โดยมิได้รับอนุญาตจากเจ้าของข้อมูลส่วนบุคคลก่อน
        </p>

        <p className="indent" style={{ marginTop: "4pt" }}>
          2. ความยินยอมในการเก็บรวบรวม ใช้ และเปิดเผยข้อมูลส่วนบุคคล
          ข้าพเจ้าตกลงยินยอมให้บริษัทเก็บรวบรวม ใช้
          และเปิดเผยข้อมูลส่วนบุคคลและข้อมูลการใช้บริการของข้าพเจ้าได้ และยินยอมให้บริษัท ส่ง โอน ใช้
          และ/หรือ เปิดเผยข้อมูลส่วนบุคคลให้แก่บุคคลใน บริษัท บริษัทอื่นๆ ในเครือเดียวกัน
          ผู้ประมวลผลข้อมูล นิติบุคคลหรือบุคคลใดๆ ที่เกี่ยวข้องตามสัญญา
          หรือคู่ค้าหรือพันธมิตรทางการค้าและธุรกิจ หรือให้ผู้บริการที่เป็นบุคคลภายนอก เช่น ผู้สอบบัญชี
          ผู้ตรวจสอบภายใน และผู้ตรวจสอบภายนอกของบริษัท
          ที่ปรึกษากฎหมายและทนายความ ผู้ให้บริการเกี่ยวกับเทคโนโลยีสารสนเทศ การวิเคราะห์ข้อมูล สถิติ
          การวิจัยและพัฒนาผลิตภัณฑ์ เป็นต้น หรือดำเนินการตามกฎหมาย หน่วยงานภาครัฐ
          หน่วยงานกำกับดูแล สถาบันการเงิน ผู้รับโอนสิทธิเรียกร้อง
        </p>
        <p className="indent">
          โดยมีวัตถุประสงค์ของการเก็บรวบรวม ใช้ หรือเปิดเผยข้อมูลส่วนบุคคล คือ 1.
          เพื่อวัตถุประสงค์ในการขายสินค้า ให้บริการ วิเคราะห์ข้อมูล
          ปรับปรุงคุณภาพสินค้าหรือการให้บริการ 2. เพื่อประโยชน์ในการดำเนินงานของบริษัท เช่น
          การจัดซื้อจัดจ้าง การทำสัญญา การทำธุรกรรมทางการเงิน การดำเนินกิจกรรมบริษัท
          การติดต่อประสานงาน การโฆษณา ประชาสัมพันธ์ หรือให้ข้อมูลข่าวสารต่างๆ 3.
          เพื่อปรับปรุงคุณภาพการทำงานให้มีประสิทธิภาพมากยิ่งขึ้น เช่น การจัดทำฐานข้อมูล
          วิเคราะห์และพัฒนากระบวนการดำเนินงานของบริษัท 4.
          เพื่อตรวจสอบรายการธุรกรรมที่อาจบ่งชี้ถึงการทุจริต 5.
          เพื่อประโยชน์ในการยืนยันหรือระบุตัวตนของเจ้าของข้อมูลส่วนบุคคล 6.
          เพื่อวัตถุประสงค์อื่นใดที่เกี่ยวข้องกับการขายสินค้าหรือให้บริการระหว่างท่านกับบริษัท 7.
          เพื่อปฏิบัติตามกฎหมายหรือกฎระเบียบของหน่วยงานราชการที่เกี่ยวข้องต่อการดำเนินงานของบริษัท
          โดยบริษัทจะจัดเก็บและใช้ข้อมูลดังกล่าวตามระยะเวลาเท่าที่จำเป็นตามวัตถุประสงค์ที่ได้แจ้งเจ้าของข้อมูลส่วนบุคคลหรือตามที่กฎหมายกำหนดไว้
          หรือตามความจำเป็นทางเทคนิคเท่านั้น
        </p>
        <p className="indent">
          3. ข้าพเจ้ายินยอมให้บริษัทเก็บรวบรวมข้อมูลส่วนบุคคลของข้าพเจ้าจากแหล่งอื่นได้ เป็นต้นว่า
          ส่วนราชการ หรือหน่วยงานของรัฐ เป็นต้น
        </p>
        <p className="indent">4. วิธีการเพิกถอนความยินยอม และผลการเพิกถอนความยินยอม</p>
        <p className="indent">
          ข้าพเจ้าในฐานะเจ้าของข้อมูลส่วนบุคคลอาจเพิกถอนความยินยอมทั้งหมดหรือส่วนใดส่วนหนึ่งตามหนังสือฉบับนี้โดยข้าพเจ้าจะแจ้งให้บริษัททราบเป็นหนังสือ
          และบริษัทอาจขอทราบถึงเหตุผลแห่งการนั้น
        </p>
        <p className="indent">
          การเพิกถอนความยินยอมของข้าพเจ้า จะไม่ส่งผลกระทบต่อการเก็บ รวบรวม ใช้
          หรือเปิดเผยข้อมูลส่วนบุคคล ที่ข้าพเจ้าได้ยินยอมแก่บริษัทไปแล้วก่อนหน้านั้น
          ในกรณีที่การเพิกถอนความยินยอมเกิดผลกระทบต่อสิทธิหรือหน้าที่ใดๆ ของข้าพเจ้า
          ข้าพเจ้ายอมรับผลกระทบที่เกิดจากการนั้นได้
        </p>
        <p className="indent">
          ในกรณีที่มีการกำหนดหลักเกณฑ์วิธีการใดๆ
          ในอนาคตที่มีผลทำให้การให้ความยินยอมตามหนังสือฉบับนี้ จะต้องเปลี่ยนแปลง ปรับปรุง หรือแก้ไข
          เพื่อให้สอดคล้องกับหลักเกณฑ์และวิธีการดังกล่าว
          ข้าพเจ้ายินดีที่จะให้บริษัทดำเนินการจัดทำหนังสือขึ้นใหม่
        </p>
        <p className="indent">5. เจ้าของข้อมูลส่วนบุคคลสามารถติดต่อได้ที่</p>
        <p>{COMPANY.name}</p>
        <p>ที่อยู่สำนักงาน: {COMPANY.hqAddress}</p>
        <p>
          เว็บไซต์ของบริษัท: {COMPANY.website} เบอร์โทรศัพท์: {COMPANY.phone} อีเมล์: {COMPANY.privacyEmail}
        </p>

        <div className="sig-block">
          <p className="indent" style={{ marginTop: "8pt" }}>
            ข้าพเจ้าได้อ่าน และเข้าใจข้อความซึ่งระบุไว้ข้างต้นของหนังสือยินยอมนี้อย่างชัดแจ้งแล้ว
            จึงได้ลงลายมือชื่อไว้เป็นหลักฐาน
          </p>
          <table className="box-table" style={{ marginTop: "10pt" }}>
            <tbody>
              <tr>
                <td style={{ width: "35%" }}>
                  ชื่อบริษัท
                  <br /><br />..................................................
                  <br /><br />วันที่..........................................
                </td>
                <td>
                  ชื่อของบุคคลผู้ให้ความยินยอม
                  <br /><br />{c.buyerName ? <b>{c.buyerName}</b> : ".............................................................."}
                  <br /><br />ลายเซ็น : ..............................................................
                  <br />วันที่ลงนาม: ..............................................................
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ════════ หน้า 4: ใบคัดเลือกผู้ส่งมอบ FC102-07 ════════ */}
      <div className="sheet attach-sheet">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div className="doc-title" style={{ flex: 1 }}>ใบคัดเลือกผู้ส่งมอบ</div>
          <b style={{ fontSize: "13pt" }}>FC102-07</b>
        </div>
        <p style={{ textAlign: "right", marginTop: "6pt" }}>
          วันที่ <V w={110}>{c.contractDate ? thaiDate(c.contractDate) : undefined}</V>
        </p>

        <p>ชื่อบริษัท <V w={320}>{c.buyerName}</V></p>
        <p>ที่อยู่ <V w={400}>{c.driverAddress}</V></p>
        <p>ชนิดสินค้า <V w={280}>บริการขนส่ง (รถร่วม)</V></p>
        <p>
          ชื่อผู้ติดต่อ 1. <V w={180}>{c.buyerName}</V> โทร <V w={110}>{c.phone}</V> แฟกซ์ <V w={90} />
        </p>
        <p style={{ marginLeft: "62pt" }}>
          2. <V w={180} /> โทร <V w={110} /> แฟกซ์ <V w={90} />
        </p>

        <p style={{ marginTop: "6pt", fontWeight: 700 }}>ข้อมูลทั่วไป เอกสารอ้างอิง</p>
        <p><CB on /> การชำระเงิน <b>เครดิตตามระบบจ่าย 30 วัน</b></p>
        <p><CB /> Catalog ใบเสนอราคา <V w={260} /></p>
        <p><CB /> การรับรองผลิตภัณฑ์/รับรองระบบคุณภาพ <V w={200} /></p>
        <p><CB /> อื่นๆ <V w={300} /></p>

        <p style={{ marginTop: "6pt", fontWeight: 700 }}>คุณสมบัติประกอบการพิจารณา</p>
        <p><CB on /> 1. ต้องเป็นผู้ที่จดทะเบียนการค้าเป็นนิติบุคคล เช่น ห้างร้าน บริษัท หรือบุคคลธรรมดาที่มีประสบการณ์ในงานนั้น ๆ</p>
        <p><CB /> 2. ต้องมีสำนักงานที่สามารถติดต่อได้สะดวกและต้องมีหนังสือรับรองการจดทะเบียนหรือเอกสาร ภพ.20</p>
        <p><CB on /> 3. การจัดส่งสินค้า/การบริการ/การรับประกันการส่งมอบ</p>
        <p><CB on /> 4. ต้องเสนอราคาที่ยุติธรรมไม่สูงเกินความเป็นจริง โดยใช้วิธีการสอบราคาหรือวิธีการที่เหมาะสมตามลักษณะงาน</p>
        <p><CB on /> 5. ด้านคุณภาพจากการทดลองใช้งานหรือทดสอบจากตัวอย่างสินค้า</p>
        <p><CB on /> 6. ให้เครดิตในการชำระเงิน ระบุ <b>30 วัน</b></p>

        <p style={{ marginTop: "6pt", fontWeight: 700 }}>เกณฑ์ในการประเมิน</p>
        <p>- เกณฑ์ในการคัดเลือกผู้ส่งมอบ หรือผู้รับเหมา ต้องผ่านเกณฑ์ในข้อ 1-6 อย่างน้อย 4 ข้อขึ้นไป จึงจะผ่านเกณฑ์</p>
        <p>- กรณีที่ไม่ได้ตามเกณฑ์ แต่ต้องรับพิจารณาเพราะ <V w={300} /></p>
        <p>
          - ติดต่อผู้ส่งมอบ หรือผู้รับเหมาเพื่อปรับปรุงให้ได้ตามเกณฑ์
          หรือคัดเลือกผู้ส่งมอบรายใหม่มาทดแทนโดยพิจารณาใหม่ตามรอบการประเมินทุก 6 เดือน
        </p>

        <div className="sig-block">
          <p style={{ marginTop: "6pt", fontWeight: 700 }}>สรุปผลการประเมิน</p>
          <table style={{ width: "100%", marginTop: "4pt" }}>
            <tbody>
              <tr>
                {[0, 1, 2].map((i) => (
                  <td key={i} style={{ width: "33%", verticalAlign: "top", padding: "0 6pt" }}>
                    <p><CB /> ยอมรับ <span style={{ marginLeft: 14 }}><CB /> ไม่ยอมรับ</span></p>
                    <p style={{ marginTop: "6pt" }}>.........................................................</p>
                    <p>.........................................................</p>
                    <p style={{ marginTop: "10pt" }}>ลงชื่อ ..........................................</p>
                    <p style={{ textAlign: "center" }}>( )</p>
                    <p style={{ textAlign: "center", fontSize: "13pt" }}>
                      {i === 0 ? "ผู้จัดทำ / จัดซื้อ" : i === 1 ? "ผู้ช่วยหัวหน้าฝ่ายจัดซื้อ/หัวหน้าจัดซื้อ" : "ผู้จัดการฝ่ายจัดซื้อ"}
                    </p>
                    <p style={{ textAlign: "center" }}>วันที่....................................</p>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export const VendorDocDocument = memo(VendorDocDocumentImpl)
