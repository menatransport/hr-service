import {
  Blank,
  Box,
  Clause,
  Fill,
  Row,
  Sheet,
} from "@/app/recruitment/_components/admin/hr-document-paper";
import { thaiDateParts } from "@/app/recruitment/_lib/hr-documents";
import {
  EXIT_QUESTIONS,
  EXIT_REASON_GROUPS,
  REPLACEMENT_CHOICES,
  exitReasonKey,
  type ResignFill,
} from "@/app/recruitment/_lib/resign-documents";

/**
 * กระดาษสองฉบับตอนพ้นสภาพ — ใบลาออกพนักงานจัดส่ง · แบบสอบถามพนักงานลาออก
 *
 * **ถ้อยคำทุกบรรทัดคัดจาก PDF ของฝ่ายบุคคล (`เอกสารHR/ลาออก`) ห้ามแต่งเพิ่มหรือตัดทอน**
 * — แก้ได้แค่สระอำที่ PDF ถอดมาแตก (`ต าแหน่ง` → `ตำแหน่ง`) · คำที่ต้นฉบับสะกดไว้
 * (“ดังล่าว” “ปรากฎ”) คงไว้ตามกระดาษ · อยากเปลี่ยนถ้อยคำต้องให้ฝ่ายบุคคลส่งฉบับใหม่มา
 *
 * ส่วนที่เพิ่มจากต้นฉบับมีจุดเดียว: วงเล็บชื่อใต้ “ลงชื่อ” ของแบบสอบถาม — กระดาษเดิม
 * ไม่มีชื่อผู้ตอบเลยสักที่ เข้าแฟ้มแล้วตามกลับไม่ได้ว่าเป็นของใคร
 */

/** ใบลาออกพนักงานจัดส่ง (HR0501-07) */
export function ResignationLetter({ fill }: { fill: ResignFill }) {
  const doc = thaiDateParts(fill.docDate);

  return (
    <Sheet code="HR0501-07" letterhead>
      <h1 className="hrdoc-title">ใบลาออกพนักงานจัดส่ง</h1>
      <p className="text-center">(Driver Resignation Form)</p>

      <Row className="mt-[5mm]">
        <span>ที่ มท.10-</span>
        <Blank v={fill.refNo} w="5em" />
        <span>/</span>
        <Blank v={fill.refYear} w="3.5em" />
      </Row>
      <Row className="justify-end">
        <ThaiDate iso={fill.docDate} />
      </Row>

      <p className="mt-[5mm]">เรื่อง แจ้งความประสงค์ขอลาออกจากการเป็นพนักงาน</p>
      <p>เรียน ผู้จัดการฝ่ายต้นสังกัด</p>

      <Clause>
        ข้าพเจ้า {fill.title.trim() || "นาย/นาง/นางสาว"} <Fill v={fill.name} w="14em" /> ตำแหน่ง{" "}
        <Fill v={fill.position} w="10em" /> ลูกค้า <Fill v={fill.customer} w="9em" /> แพล้นท์{" "}
        <Fill v={fill.plant} w="9em" /> สำนักงาน/ศูนย์ <Fill v={fill.office} w="7em" />{" "}
        มีความประสงค์ขอลาออกจากการเป็นพนักงานของบริษัทมีนาทรานสปอร์ต จำกัด (มหาชน) โดย
      </Clause>
      <Row className="pl-[12mm]">
        <span className="w-[30mm]">• ทำงานวันสุดท้าย</span>
        <ThaiDate iso={fill.lastWorkDate} />
      </Row>
      <Row className="pl-[12mm]">
        <span className="w-[30mm]">• ลาออกมีผล</span>
        <ThaiDate iso={fill.effectiveDate} />
      </Row>
      <Row>
        <span>เนื่องจาก (สาเหตุการลาออก)</span>
        <Blank v={fill.reason} grow left />
      </Row>

      <Clause>
        โดยข้าพเจ้า ฯ จะส่งมอบงาน ทรัพย์สินของบริษัทฯ
        และจะปฏิบัติหน้าที่ต่อไปจนกว่าจะถึงวันลาออกดังล่าว
        และข้าพเจ้าทราบดีว่าสิทธิต่างๆที่พึงมี พึงได้ระหว่างเป็นพนักงานเป็นอันระงับนับตั้งแต่วันที่มีผลลาออก
        รวมทั้งไม่ติดใจเรียกร้องค่าเสียหายใดๆ และหรือไม่ติดใจฟ้องร้องทั้งทางแพ่งและอาญาต่อ บริษัทฯ
        อีกทั้งหากข้าพเจ้ามีหนี้สิน หรือมีค่าเสียหายที่จะต้องชำระให้กับบริษัทฯ ไม่ว่าด้วยกรณีใดๆ ก็ตาม
        ข้าพเจ้ายินยอมให้บริษัทฯ หักจากเงินค่าค้ำประกันค่าคอมมิชชั่น และเงินได้อื่นๆ
        ที่ข้าพเจ้าจะได้รับจากบริษัทฯได้ และหากปรากฎว่าจำนวนเงินดังกล่าวไม่เพียงพอต่อการชำระหนี้หรือค่าเสียหาย
        ข้าพเจ้ารับที่จะนำเงินมาชำระหนี้คงค้างให้เป็นที่เรียบร้อยก่อนที่จะพ้นสภาพจากการเป็นพนักงานของบริษัทฯ
      </Clause>
      <p>จึงเรียนมาเพื่อทราบ</p>

      <div className="hrdoc-keep mt-[6mm] ml-auto flex flex-col items-start">
        <Row>
          <span>ลงชื่อ</span>
          <Blank w="14em" />
          <span>พนักงาน</span>
        </Row>
        <Row>
          <span>{fill.title.trim() || "นาย"}</span>
          <Blank v={fill.name} w="15em" />
        </Row>
        <Row className="self-center">
          <span>วันที่</span>
          <Blank v={doc?.day} w="2.5em" />
          <span>/</span>
          <Blank v={doc ? String(Number(fill.docDate.slice(5, 7))) : ""} w="3.5em" />
          <span>/</span>
          <Blank v={doc?.year} w="3em" />
        </Row>
      </div>

      <div className="hrdoc-keep mt-[6mm] border-t border-paper-line pt-[4mm]">
        <p>ผู้บังคับบัญชาต้นสังกัด</p>
        <Row>
          <span>1.ผู้มีอำนาจอนุมัติประจำฝ่าย</span>
          {REPLACEMENT_CHOICES.map((c) => (
            /* `.hrdoc-row` ตั้ง gap เองนอก layer — ระยะห่างระหว่างช่องจึงใช้ margin */
            <span key={c.value} className="ml-[5mm]">
              <Box on={fill.replacement === c.value}>{c.label}</Box>
            </span>
          ))}
        </Row>

        <table className="hrdoc-table mt-[4mm] table-fixed text-[9.5pt]">
          <thead>
            <tr>
              <th>1. ผู้บังคับบัญชาโดยตรง</th>
              <th>
                2. ผู้จัดการฝ่าย<Fill v={fill.managerDept} w="4em" />
              </th>
              <th>3. ผู้บริหารสายงาน</th>
              <th>ผู้จัดการฝ่ายทรัพยากรบุคคล</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              {[fill.supervisor, fill.manager, fill.executive, fill.hrManager].map((name, i) => (
                <td key={i} className="pt-[6mm]">
                  <Row>
                    <span>ลงชื่อ</span>
                    <Blank grow />
                  </Row>
                  <Row>
                    <span>(</span>
                    <Blank v={name} grow />
                    <span>)</span>
                  </Row>
                  <Row>
                    <span>วันที่</span>
                    <Blank grow />
                  </Row>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </Sheet>
  );
}

/** แบบสอบถามพนักงานลาออก (HR0233-00) */
export function ExitInterview({ fill, name }: { fill: ResignFill; name: string }) {
  /* ตารางห้าคอลัมน์ — แต่ละคอลัมน์ไล่ตัวเลือกลงมาแล้วปิดท้ายด้วย “อื่นๆ” เหมือนกระดาษ */
  const depth = Math.max(...EXIT_REASON_GROUPS.map((g) => g.options.length)) + 1;
  const picked = new Set(fill.reasons);

  return (
    <Sheet code="HR0233-00" letterhead>
      <h1 className="hrdoc-title">แบบสอบถามพนักงานลาออก</h1>
      <p className="text-center">(Exit Interview Form)</p>

      <h2 className="hrdoc-h">ข้อมูลบุคคล</h2>
      <Row>
        <span>ตำแหน่ง</span>
        <Blank v={fill.position} grow />
        <span>ลูกค้า</span>
        <Blank v={fill.customer} grow />
        <span>แพล้นท์</span>
        <Blank v={fill.plant} grow />
      </Row>

      <h2 className="hrdoc-h">เหตุผลหลักที่ทำให้ท่านตัดสินใจลาออก</h2>
      <table className="hrdoc-table table-fixed text-[9.5pt]">
        <thead>
          <tr>
            {EXIT_REASON_GROUPS.map((g) => (
              <th key={g.id} className="py-[2.5mm]">
                {g.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: depth }, (_, row) => (
            <tr key={row}>
              {EXIT_REASON_GROUPS.map((g) => {
                if (row < g.options.length) {
                  const option = g.options[row];
                  return (
                    <td key={g.id}>
                      <CellTick on={picked.has(exitReasonKey(g.id, option))}>{option}</CellTick>
                    </td>
                  );
                }
                if (row === g.options.length) {
                  const other = fill.otherReasons[g.id]?.trim() ?? "";
                  return (
                    <td key={g.id}>
                      <CellTick on={Boolean(other)}>
                        อื่นๆ <Fill v={other} w="4.5em" />
                      </CellTick>
                    </td>
                  );
                }
                return <td key={g.id} />;
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <Row className="mt-[4mm]">
        <span>รายละเอียดเพิ่มเติม</span>
        <Blank v={fill.detail} grow left />
      </Row>

      <h2 className="hrdoc-h">ความคิดเห็นเพิ่มเติม</h2>
      {EXIT_QUESTIONS.map((q, i) => (
        <Row key={q}>
          <span>
            {i + 1}.{q}
          </span>
          <Blank v={fill.answers[i]} grow left />
        </Row>
      ))}

      <div className="hrdoc-keep mt-[8mm] ml-auto flex flex-col items-center">
        <Row>
          <span>ลงชื่อ</span>
          <Blank w="14em" />
        </Row>
        <Row>
          <span>(</span>
          <Blank v={name} w="13em" />
          <span>)</span>
        </Row>
      </div>
    </Sheet>
  );
}

/**
 * ช่องติ๊กในตารางแบบสอบถาม — ช่องคอลัมน์แคบ ป้ายยาวตัดบรรทัด จึงยึดกล่องไว้มุมซ้ายบน
 * (`Box` ปกติจัดชิดบรรทัดล่าง ป้ายสองบรรทัดแล้วกล่องหล่นไปอยู่บรรทัดที่สอง)
 */
function CellTick({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span className="flex items-start gap-[0.35em]">
      <span
        className="hrdoc-box flex-none"
        style={{ margin: "0.25em 0 0" }}
        aria-label={on ? "เลือก" : "ไม่เลือก"}
      >
        {on ? "✓" : ""}
      </span>
      <span>{children}</span>
    </span>
  );
}

/** `วันที่ 30 เดือน กันยายน พ.ศ. 2569` — ไม่มีค่าก็เหลือเส้นประสามช่อง */
function ThaiDate({ iso }: { iso: string }) {
  const parts = thaiDateParts(iso);
  return (
    <>
      <span>วันที่</span>
      <Blank v={parts?.day} w="3.5em" />
      <span>เดือน</span>
      <Blank v={parts?.month} w="7em" />
      <span>พ.ศ.</span>
      <Blank v={parts?.year} w="3.5em" />
    </>
  );
}
