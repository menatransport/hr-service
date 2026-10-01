import {
  Blank,
  Box,
  MenaLogo,
  Row,
  Sheet,
  SignLine,
} from "@/app/recruitment/_components/admin/hr-document-paper";
import {
  personName,
  thaiLongDate,
  type ApplicantFacts,
  type DocFill,
} from "@/app/recruitment/_lib/hr-documents";
import { sectionTitle, type SectionId } from "@/app/recruitment/_lib/types";

/**
 * ⏸ **พักไว้ — ไม่มีใครเรียกใช้** ถอดออกจากกล่องทำเอกสารตามคำสั่งเจ้าของงาน
 * (29 ก.ย. 2026) · วิธีเปิดกลับอยู่หัวไฟล์ `hr-documents.ts`
 *
 * ใบสมัครงาน `HR0221 – 04` — สามหน้าตามแบบฟอร์มกระดาษ + หน้าสรุปผลสัมภาษณ์เบื้องต้น
 *
 * **ไล่ตามแบบฟอร์มจริงทีละบรรทัด** ไม่ได้จัดใหม่ให้สวย เพราะฝ่ายบุคคลเก็บเข้าแฟ้ม
 * รวมกับใบที่ผู้สมัครเขียนมือ ใบที่หน้าตาไม่เหมือนกันคือใบที่หาไม่เจอในแฟ้ม
 *
 * ช่องที่ฟอร์มออนไลน์ไม่ได้ถาม (กรุ๊ปเลือด · ชื่อบิดามารดา · ประวัติทหาร ฯลฯ) เว้น
 * เส้นประไว้ให้ผู้สมัครเขียนเพิ่มวันมาเซ็น · ชื่อบิดา/มารดา/คู่สมรสเติมให้เมื่อ
 * ผู้ติดต่อฉุกเฉินเป็นคนนั้นพอดี (ตัวอย่างจริงของฝ่ายบุคคลก็เติมแบบนี้)
 */

const ADDRESS_HQ = "280/8 หมู่ที่ 9 ตำบลทับกวาง อำเภอแก่งคอย จังหวัดสระบุรี 18260";
const ADDRESS_BKK = "455/12-14 ถนนพระรามหก แขวงถนนเพชรบุรี เขตราชเทวี กรุงเทพฯ 10400";

const MARITAL = ["โสด", "สมรส", "หม้าย", "หย่าร้าง"];

const CRIMES = [
  "คดีฆ่าคนตายโดยเจตนา",
  "คดีลักทรัพย์นายจ้าง (อนุโลม: การประมาททำให้ผู้อื่นถึงแก่ความตาย อายุความ 5 ปีขึ้นไป)",
  "คดีฉ้อโกง/ทุจริตทุกกรณี",
  "คดีจำหน่ายยาเสพติด",
  "คดีข่มขืน/อนาจาร",
  "ให้ร้ายทำความเสื่อมเสียแก่นายจ้าง (ทุกช่องทาง)",
];

/** ช่องแนบในระบบ → รายการ “เอกสารที่แนบมาด้วย” ท้ายใบ */
const ATTACHMENTS: { label: string; slot?: string }[] = [
  { label: "ทะเบียนบ้าน", slot: "house_reg" },
  { label: "ใบรับรองการปฏิบัติงานจากที่เดิม (ถ้ามี)" },
  { label: "บัตรประชาชน", slot: "id_card" },
  { label: "ใบขับขี่", slot: "license_front" },
  { label: "รูปถ่าย 2 ใบ", slot: "portrait" },
  { label: "หลักฐานการศึกษา" },
  { label: "หลักฐานการรับราชการทหาร" },
  { label: "อื่น ๆ" },
];

export function ApplicationForm({ facts, fill }: { facts: ApplicantFacts; fill: DocFill }) {
  const name = personName(fill);
  const relation = facts.emergencyRelation;
  const kin = (who: string) => (relation.includes(who) ? facts.emergencyName : "");
  const kinPhone = (who: string) => (relation.includes(who) ? facts.emergencyPhone : "");
  const spouse = relation.includes("ภรรยา") || relation.includes("สามี");

  const source = facts.source;
  const friendSource = source.includes("เพื่อน");
  const signSource = source.includes("ป้าย");
  const facebookSource = /facebook|เฟส/i.test(source);
  const webSource = /เว็บ|web/i.test(source);
  const otherSource =
    source && !friendSource && !signSource && !facebookSource && !webSource ? source : "";

  return (
    <>
      {/* ───────────────────────────────────────────── หน้า 1 · ประวัติส่วนตัว */}
      <Sheet>
        <header className="flex items-start gap-[4mm]">
          <MenaLogo className="h-[24mm]" />
          <div className="hrdoc-small flex flex-1 flex-col items-center pt-[2mm] text-center leading-snug">
            <span className="hrdoc-company-sm">บริษัท มีนาทรานสปอร์ต จำกัด (มหาชน)</span>
            <span>{ADDRESS_HQ}</span>
            <span>{ADDRESS_BKK}</span>
            <span>โทรศัพท์ 0-2613-9450 , โทรสาร 0-2613-9927</span>
          </div>
          <div className="flex flex-col items-end gap-[2mm]">
            <span className="hrdoc-small border border-paper-line px-[3mm] py-[1mm]">
              HR0221 – 04
            </span>
            <div className="hrdoc-photo">
              {facts.portraitUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={facts.portraitUrl} alt="" className="size-full object-cover" />
              ) : (
                <span className="hrdoc-small">รูปถ่าย</span>
              )}
            </div>
          </div>
        </header>

        <h1 className="hrdoc-title -mt-[10mm] mb-[4mm]">ใบสมัครงาน</h1>

        <Row>
          <span>สมัครงานตำแหน่ง</span>
          <Blank v={fill.appliedPosition} grow />
          <span>เงินเดือนที่ต้องการ</span>
          <Blank v={fill.expectedSalary} w="8em" />
          <span>บาท</span>
        </Row>
        <Row>
          <span>วันที่เขียนใบสมัคร</span>
          <Blank v={thaiLongDate(facts.writtenOn)} w="10em" />
          <span>ท่านสามารถเริ่มงานได้วันที่</span>
          <Blank v={thaiLongDate(facts.readyToStart)} grow />
        </Row>

        <h2 className="hrdoc-h">ประวัติส่วนตัว</h2>
        <Row>
          <span>คำนำหน้า</span>
          <Blank v={fill.title} w="3.5em" />
          <span>ชื่อ</span>
          <Blank v={fill.firstName} grow />
          <span>นามสกุล</span>
          <Blank v={fill.lastName} grow />
          <span>ชื่อเล่น</span>
          <Blank v={facts.nickname} w="4.5em" />
        </Row>
        <Row>
          <span>Name</span>
          <Blank grow />
          <span>Surname</span>
          <Blank grow />
          <span>Nickname</span>
          <Blank w="4.5em" />
        </Row>
        <Row>
          <span>กรุ๊ปเลือด</span>
          <Blank w="3.5em" />
          <span>โทรศัพท์บ้าน (ถ้ามี)</span>
          <Blank grow />
          <span>มือถือ</span>
          <Blank v={facts.phone} grow />
        </Row>
        <Row>
          <span>E-mail</span>
          <Blank grow />
          <span>Line ID (ถ้ามี)</span>
          <Blank grow />
        </Row>
        <Row>
          <span>Facebook</span>
          <Blank grow />
          <span>IG</span>
          <Blank grow />
          <span>Page</span>
          <Blank grow />
        </Row>
        <Row>
          <span>ที่อยู่ตามทะเบียนบ้าน</span>
          <Blank v={fill.address} grow left />
        </Row>
        <Row>
          <Blank grow />
        </Row>
        <Row>
          <span>ที่อยู่ปัจจุบัน</span>
          <Blank v={facts.curAddress} grow left />
        </Row>
        <Row>
          <Blank grow />
        </Row>
        <Row>
          <span>เกิดวันที่</span>
          <Blank v={thaiLongDate(facts.birthDate)} w="9em" />
          <span>เวลาเกิด</span>
          <Blank w="4em" />
          <span>สัญชาติ</span>
          <Blank w="4em" />
          <span>ศาสนา</span>
          <Blank v={facts.religion} grow />
          <span>อายุ</span>
          <Blank v={fill.age} w="3em" />
          <span>ปี</span>
        </Row>
        <Row>
          <span>ส่วนสูง</span>
          <Blank v={facts.height} w="3.5em" />
          <span>ซ.ม.</span>
          <span>น้ำหนัก</span>
          <Blank v={facts.weight} w="3.5em" />
          <span>ก.ก.</span>
          <span>บัตรประชาชนเลขที่</span>
          <Blank v={fill.nationalId} grow />
        </Row>
        <Row>
          <span>ออกให้ ณ</span>
          <Blank grow />
          <span>วันที่ออกบัตร</span>
          <Blank w="8em" />
          <span>บัตรหมดอายุ</span>
          <Blank v={thaiLongDate(facts.idCardExpiry)} w="8em" />
        </Row>
        <Row>
          <span>หมายเลขหนังสือเดินทาง (ถ้ามี)</span>
          <Blank grow />
          <span>วันที่ออก</span>
          <Blank w="6em" />
          <span>วันที่หมดอายุ</span>
          <Blank w="6em" />
        </Row>

        <h2 className="hrdoc-h">รายละเอียดทางครอบครัว</h2>
        {(["บิดา", "มารดา"] as const).map((who) => (
          <Row key={who}>
            <span>ชื่อ{who}</span>
            <Blank v={kin(who)} grow />
            <span>อาชีพ</span>
            <Blank w="5em" />
            <span>ที่อยู่</span>
            <Blank grow />
            <span>โทร</span>
            <Blank v={kinPhone(who)} w="7em" />
          </Row>
        ))}
        <Row className="gap-x-[1.2em]">
          <span>สถานภาพ</span>
          {MARITAL.map((m) => (
            <Box key={m} on={facts.marital === m}>
              {m}
            </Box>
          ))}
          {facts.marital && !MARITAL.includes(facts.marital) ? (
            <Blank v={facts.marital} w="6em" />
          ) : null}
        </Row>
        <Row>
          <span>ชื่อคู่สมรส</span>
          <Blank v={spouse ? facts.emergencyName : ""} grow />
          <span>ที่อยู่</span>
          <Blank grow />
          <span>โทร</span>
          <Blank v={spouse ? facts.emergencyPhone : ""} w="7em" />
        </Row>
        <Row>
          <span>ที่ทำงาน</span>
          <Blank grow />
          <span>โทร</span>
          <Blank w="7em" />
          <span>มือถือ</span>
          <Blank w="7em" />
        </Row>
        <Row className="gap-x-[1.2em]">
          <span>ทะเบียนสมรส</span>
          <Box>มี</Box>
          <Box>ไม่มี</Box>
          <span className="flex items-end gap-[0.3em]">
            จำนวนบุตร <Blank w="4em" /> คน
          </span>
        </Row>
        <p className="hrdoc-small mt-auto pt-[4mm] text-center">(1)</p>
      </Sheet>

      {/* ──────────────────────────────── หน้า 2 · การศึกษา ประสบการณ์ ข้อมูลฉุกเฉิน */}
      <Sheet>
        <h2 className="hrdoc-h mt-0">ประวัติการศึกษา</h2>
        <table className="hrdoc-table">
          <thead>
            <tr>
              <th className="w-[36%]">วุฒิการศึกษาสูงสุดระดับ</th>
              <th>สถานศึกษา</th>
              <th className="w-[26%]">สาขาวิชา / แผนก</th>
            </tr>
          </thead>
          <tbody>
            <tr className="h-[16mm]">
              <td className="text-paper-fill">{facts.education}</td>
              <td />
              <td />
            </tr>
          </tbody>
        </table>

        <h2 className="hrdoc-h">ประสบการณ์ในการทำงาน</h2>
        <table className="hrdoc-table">
          <thead>
            <tr>
              <th colSpan={2}>วัน เดือน ปี</th>
              <th rowSpan={2}>ชื่อบริษัทและหมายเลขโทรศัพท์</th>
              <th rowSpan={2}>ตำแหน่ง / ลักษณะงาน</th>
              <th colSpan={2}>เงินเดือน</th>
              <th rowSpan={2}>สาเหตุที่ออก</th>
            </tr>
            <tr>
              <th className="w-[10%]">จาก</th>
              <th className="w-[10%]">ถึง</th>
              <th className="w-[11%]">เริ่ม</th>
              <th className="w-[11%]">ล่าสุด</th>
            </tr>
          </thead>
          <tbody>
            <tr className="h-[15mm] text-paper-fill">
              <td colSpan={2}>{facts.prevTenure}</td>
              <td>{facts.prevCompany}</td>
              <td>{facts.vehicleTypes}</td>
              <td colSpan={2}>{facts.prevIncome}</td>
              <td>{facts.exitReason}</td>
            </tr>
            {[0, 1].map((i) => (
              <tr key={i} className="h-[9mm]">
                {Array.from({ length: 7 }, (_, j) => (
                  <td key={j} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="hrdoc-h">รายละเอียด / ข้อมูลฉุกเฉิน</h2>
        <ol className="hrdoc-list">
          <li>
            <Row className="flex-wrap gap-x-[0.9em]">
              <span>ที่พักในปัจจุบันของท่าน</span>
              {["หอพัก", "บ้านเช่า", "บ้านบิดามารดา", "บ้านญาติ", "บ้านตนเอง"].map((p) => (
                <Box key={p}>{p}</Box>
              ))}
              <Box>
                อื่นๆ <Blank w="5em" />
              </Box>
            </Row>
          </li>
          <li>
            <Row className="gap-x-[0.9em]">
              <span>ท่านเคยป่วยหนักและเป็นโรคติดต่อร้ายแรงมาก่อนหรือไม่?</span>
              <Box on={facts.healthy === true}>ไม่เคย</Box>
              <Box on={facts.healthy === false}>เคย โปรดระบุชื่อโรค</Box>
              <Blank v={facts.healthy === false ? facts.health : ""} grow />
            </Row>
          </li>
          <li>
            <Row>
              <span>ท่านกำลังตั้งครรภ์อยู่หรือไม่ (กรุณาระบุ) :</span>
              <Blank grow />
            </Row>
          </li>
          <li>
            <strong>ในกรณีฉุกเฉิน กรุณาให้รายละเอียดเกี่ยวกับบุคคลที่บริษัทสามารถติดต่อได้ *</strong>
            <Row>
              <span>ชื่อ</span>
              <Blank v={facts.emergencyName} grow />
              <span>เกี่ยวข้องเป็น</span>
              <Blank v={relation} w="7em" />
              <span>อาชีพ</span>
              <Blank grow />
            </Row>
            <Row>
              <span>สถานที่ติดต่อ</span>
              <Blank grow />
            </Row>
            <Row>
              <span>โทรศัพท์</span>
              <Blank v={facts.emergencyPhone} w="14em" />
            </Row>
          </li>
          <li>
            <Row>
              <span>การรับราชการทหาร ถูกเกณฑ์เมื่อ</span>
              <Blank grow />
              <span>ปลดเมื่อ</span>
              <Blank grow />
            </Row>
            <Row>
              <span>ได้รับการยกเว้นเพราะ</span>
              <Blank grow />
            </Row>
          </li>
          <li>
            <Row className="gap-x-[0.9em]">
              <span>ท่านมีประวัติอาชญากรรมกลุ่มเหล่านี้หรือไม่</span>
              <Box on={facts.criminalClean === true}>ไม่มี</Box>
              <Box on={facts.criminalClean === false}>มี (กรุณาระบุ)</Box>
              <Blank v={facts.criminalClean === false ? facts.criminal : ""} grow />
            </Row>
            <div className="mt-[1mm] flex flex-col gap-[0.5mm] pl-[4mm]">
              {CRIMES.map((c) => (
                <Box key={c}>{c}</Box>
              ))}
            </div>
          </li>
        </ol>
        <p className="hrdoc-small mt-auto pt-[4mm] text-center">(2)</p>
      </Sheet>

      {/* ────────────────────────────────────── หน้า 3 · คำรับรองและเอกสารแนบ */}
      <Sheet>
        <ol className="hrdoc-list" start={7}>
          <li>
            <Row className="flex-wrap gap-x-[0.9em]">
              <span>มียานพาหนะที่สามารถนำมาปฏิบัติงานได้</span>
              <Box>รถยนต์</Box>
              <Box>รถจักรยานยนต์</Box>
              <Box>ไม่มี</Box>
              <Box>อื่นๆ ระบุ</Box>
            </Row>
            {facts.vehicle ? (
              <Row>
                <span>คำตอบในใบสมัครออนไลน์:</span>
                <Blank v={facts.vehicle} grow left />
              </Row>
            ) : null}
          </li>
          <li>
            <span>ทราบข่าวการรับสมัครจาก</span>
            <Row className="gap-x-[0.9em]">
              <Box on={friendSource}>เพื่อนแนะนำ (ชื่อ)</Box>
              <Blank v={facts.friend} grow />
              <Box on={webSource}>เว็บไซต์</Box>
              <Blank grow />
              <Box on={Boolean(otherSource)}>อื่นๆ</Box>
              <Blank v={otherSource} w="5em" />
            </Row>
            <Row className="gap-x-[0.9em]">
              <Box on={facebookSource}>เฟสบุ๊ค (ชื่อเพจ/ชื่อกลุ่ม)</Box>
              <Blank grow />
              <Box on={signSource}>ป้ายรับสมัคร (สถานที่)</Box>
              <Blank grow />
            </Row>
          </li>
        </ol>

        <hr className="my-[4mm] border-t border-dashed border-paper-line" />

        <ul className="flex flex-col gap-[1.5mm]">
          {[
            "ข้าพเจ้ายินยอมให้ เก็บ ใช้ เปิดเผย ข้อมูลส่วนบุคคลตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562",
            "ข้าพเจ้ายินดีให้บริษัทฯ ติดต่อสอบถามรายละเอียดเกี่ยวกับการสมัครงาน ประวัติการทำงานและประวัติอาชญากรรมของข้าพเจ้าเพื่อประกอบการพิจารณาได้ตลอดเวลา",
            "ข้าพเจ้าขอรับรองว่า ข้อความที่ได้กรอกไว้ข้างต้นเป็นความจริงทุกประการ ถ้าปรากฏว่ามีการกรอกข้อความที่ไม่เป็นจริง ข้าพเจ้ายอมรับการลงโทษ ตามกฎข้อบังคับของบริษัทฯ ทุกประการ รวมทั้งการพิจารณาไล่ออก โดยไม่ขอรับค่าชดเชย เงินแทนการบอกกล่าวล่วงหน้า หรือค่าเสียหายใด ๆ",
          ].map((line) => (
            <li key={line} className="flex gap-[2mm]">
              <span aria-hidden className="font-bold">✓</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>

        <div className="mt-[18mm] ml-auto flex w-[62%] flex-col items-center">
          <Row className="w-full">
            <span>ลายมือชื่อผู้สมัคร</span>
            <Blank grow />
            <span>วันที่</span>
            <Blank v={thaiLongDate(facts.writtenOn)} w="8em" />
          </Row>
          <Row>
            <span>(</span>
            <Blank v={name} w="15em" />
            <span>)</span>
          </Row>
        </div>

        <h2 className="hrdoc-h mt-[16mm]">เอกสารที่แนบมาด้วย</h2>
        <div className="mt-[2mm] grid grid-cols-2 gap-x-[6mm] gap-y-[1.5mm]">
          {ATTACHMENTS.map((a) => (
            <span key={a.label} className="flex items-end gap-[1.5mm]">
              <span>(</span>
              <span className="w-[4mm] text-center text-paper-fill">
                {a.slot && facts.attached.includes(a.slot) ? "✓" : " "}
              </span>
              <span>)</span>
              <span>{a.label}</span>
            </span>
          ))}
        </div>
        <p className="hrdoc-small mt-auto pt-[4mm] text-center">(3)</p>
      </Sheet>

      {/* ─────────────────────────────────── หน้า 4 · สรุปผลสัมภาษณ์เบื้องต้น */}
      <Sheet>
        <h2 className="hrdoc-title mb-[1mm] text-left">
          สรุปผลสัมภาษณ์เบื้องต้น <span className="text-paper-fill">{name}</span>
        </h2>
        <p>
          ตำแหน่ง <span className="text-paper-fill">{fill.appliedPosition || fill.position}</span>
          <span className="hrdoc-small ml-[4mm] text-paper-mut">
            เลขที่ใบสมัคร {facts.ref}
          </span>
        </p>

        {groupBySection(facts.summary).map(([section, rows]) => (
          <div key={section} className="mt-[4mm]">
            <h3 className="font-bold">{sectionTitle(section)}</h3>
            <ul className="mt-[1mm] flex flex-col gap-[1.2mm]">
              {rows.map((row) => (
                <li key={row.label} className="hrdoc-qa">
                  <span>➢ {row.label}</span>
                  <span>
                    ➢ ตอบ : <span className="text-paper-fill">{row.answer}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="mt-[5mm]">
          <h3 className="font-bold">ความเห็นผู้สัมภาษณ์</h3>
          {facts.interviewNote ? (
            <p className="mt-[1mm] text-paper-fill">{facts.interviewNote}</p>
          ) : null}
          {[0, 1, 2].map((i) => (
            <Row key={i}>
              <Blank grow />
            </Row>
          ))}
        </div>

        <div className="mt-[10mm] ml-auto w-[55%]">
          <SignLine role="ผู้สัมภาษณ์" />
        </div>
      </Sheet>
    </>
  );
}

function groupBySection(rows: ApplicantFacts["summary"]): [SectionId, ApplicantFacts["summary"]][] {
  const map = new Map<SectionId, ApplicantFacts["summary"]>();
  for (const row of rows) {
    map.set(row.section, [...(map.get(row.section) ?? []), row]);
  }
  return [...map.entries()];
}
