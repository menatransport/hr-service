import { Box, Row, Blank, Sheet } from "@/app/recruitment/_components/admin/hr-document-paper";
import { CONSENT_ITEMS } from "@/app/recruitment/_lib/consent";
import {
  displayAnswer,
  findByRole,
  formatPhone,
  maskNationalId,
  slotsForApplication,
  type DocSlot,
} from "@/app/recruitment/_lib/form";
import {
  requisitionPosition,
  thaiDateTime,
  thaiLongDate,
  todayIso,
} from "@/app/recruitment/_lib/hr-documents";
import { customerLabel, type Requisition } from "@/app/recruitment/_lib/requisitions/types";
import {
  DOCUMENT_FIELDS,
  INTERVIEW_RESULT_LABEL,
  QUESTION_SECTIONS,
  STATUS_LABEL,
  exitReasonText,
  type Application,
  type DocumentData,
  type QuestionSnapshot,
} from "@/app/recruitment/_lib/types";

/**
 * รายงานผู้สมัคร — **เอกสารฉบับแรกในกล่องทำเอกสาร** แทนปุ่มรายงานเดิมในตาราง
 * (ย้ายตามคำสั่งเจ้าของงาน 29 ก.ย. 2026 · ตัวเดิม `candidate-report.tsx` ถูกถอดออก)
 *
 * **ทรงเอกสารทางการของบริษัท** — หัวกระดาษบริษัท · หัวข้อเป็นแถบ “ส่วนที่ ๑–๖” ·
 * ข้อมูลเป็นตารางสองช่อง (หัวข้อ | ข้อมูล) ที่คนเซ็นอ่านไล่ลงได้ทีละบรรทัด
 * แทนการ์ดหลายคอลัมน์ของหน้าจอ ซึ่งบนกระดาษอ่านข้ามคอลัมน์ผิดแถวได้ง่าย
 *
 * อ่านจากใบสมัคร **ตรง ๆ ทุกช่อง** ไม่ผ่าน `DocFill` — รายงานคือสิ่งที่ผู้สมัครกรอก
 * มาจริง ไม่ใช่สิ่งที่ฝ่ายบุคคลแก้ในกล่อง · ค่าที่ระบบเติมเป็นหมึกน้ำเงินเหมือน
 * เอกสารฉบับอื่น ส่วนผลพิจารณากับลายเซ็นเว้นไว้เขียนมือ
 *
 * เลขบัตรประชาชนกับเลขบัญชีถูกปิดบางส่วนเหมือนรายงานเดิม — กระดาษที่พิมพ์ออกมา
 * วางทิ้งไว้บนโต๊ะได้ง่ายกว่าหน้าจอ คนที่ต้องเห็นเลขเต็มเปิดดูในระบบได้อยู่แล้ว
 */

const SECTION_NO = ["๑", "๒", "๓", "๔", "๕", "๖", "๗", "๘"];

export function ApplicantProfile({
  application,
  docSlots,
  requisition,
}: {
  application: Application;
  docSlots: DocSlot[];
  /** คำขอสรรหาที่เลือกในกล่อง (ผูกแล้วหรือเลือกไว้ใช้บนเอกสาร) — `null` ขึ้นเป็นขีด */
  requisition: Requisition | null;
}) {
  const snapshot = application.questionSnapshot;
  const { interview } = application;
  const slots = slotsForApplication(docSlots, application.files);
  const portrait = application.files.find((f) => f.slot === "portrait")?.url ?? "";
  const verified = Boolean(application.documentMeta.verifiedAt);

  const answerOf = (role: Parameters<typeof findByRole>[1]) => {
    const q = findByRole(snapshot, role);
    return q ? answerText(application, q) : "";
  };
  const ready = answerOf("ready_date");

  const status =
    application.status === "cancelled"
      ? `${STATUS_LABEL.cancelled} — ${
          application.exitReason ? exitReasonText(application) : "ยังไม่ระบุเหตุผล"
        }`
      : STATUS_LABEL[application.status];

  /* เลขส่วนนับต่อกันเอง — หมวดคำถามที่ไม่มีข้อในใบนี้ไม่กินเลข */
  let no = 0;
  const next = () => SECTION_NO[no++] ?? String(no);

  const questionSections = QUESTION_SECTIONS.map((section) => ({
    section,
    list: snapshot.filter((q) => q.section === section.id),
  })).filter((s) => s.list.length);

  const documentGroups = slots
    .map((slot) => ({
      slot,
      fields: DOCUMENT_FIELDS.filter(
        (f) => f.slot === slot.id && application.documents[f.key],
      ),
    }))
    .filter((g) => g.fields.length);

  return (
    <Sheet letterhead>
      <div className="hrdoc-keep flex items-start gap-[5mm]">
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="hrdoc-title">แบบสรุปข้อมูลผู้สมัครงาน</h1>
          <p className="hrdoc-small mb-[3mm] text-center text-paper-mut">
            ฝ่ายทรัพยากรบุคคล
          </p>

          <table className="hrdoc-kv">
            <tbody>
              <Kv label="เลขที่ใบสมัคร" value={application.ref} />
              <Kv label="วันที่สมัคร" value={thaiDateTime(application.createdAt)} />
              <Kv label="ชื่อ–นามสกุล" value={application.fullName} strong />
              <Kv label="เบอร์โทรศัพท์" value={formatPhone(application.phone)} />
              <Kv
                label="ตำแหน่งที่สมัคร"
                value={requisition ? `${requisitionPosition(requisition)} (${requisition.code})` : ""}
              />
              {requisition ? (
                <>
                  <Kv
                    label="ลูกค้า / แพล้น"
                    value={[customerLabel(requisition), requisition.plant].filter(Boolean).join(" · ")}
                  />
                  <Kv label="ครูฝึก" value={requisition.trainer?.name ?? ""} />
                  <Kv
                    label="ทะเบียนรถ"
                    value={
                      requisition.vehicle
                        ? [requisition.vehicle.plateNo, requisition.vehicle.code]
                            .filter(Boolean)
                            .join(" · ")
                        : ""
                    }
                  />
                </>
              ) : null}
              <Kv label="สนใจงานเขต" value={answerOf("work_zone")} />
              <Kv label="พร้อมเริ่มงาน" value={ready} />
              <Kv label="สถานะการสมัคร" value={status} />
            </tbody>
          </table>
        </div>

        <div className="hrdoc-photo mt-[2mm] h-[40mm] w-[32mm]">
          {portrait ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={portrait} alt="" className="size-full object-cover" />
          ) : (
            <span className="hrdoc-small text-center">
              ติดรูปถ่าย
              <br />
              1 นิ้ว
            </span>
          )}
        </div>
      </div>

      {application.erased ? (
        <>
          <Band no={next()} title="ข้อมูลในใบสมัคร" />
          <p className="mt-[2mm]">
            ผู้สมัครยกเลิกใบสมัครเองและขอให้ลบข้อมูลแล้ว — คำตอบและเอกสารถูกลบออกจากระบบตาม
            พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 มาตรา 33
          </p>
        </>
      ) : (
        questionSections.map(({ section, list }) => (
          <div key={section.id}>
            <Band no={next()} title={section.title} />
            <table className="hrdoc-kv">
              <tbody>
                {list.map((q) => (
                  <Kv key={q.key} label={q.label.trim()} value={answerText(application, q)} />
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}

      <Band no={next()} title="การนัดสัมภาษณ์" />
      <table className="hrdoc-kv">
        <tbody>
          <Kv
            label="วันและเวลาสัมภาษณ์"
            value={
              interview.date
                ? `${thaiLongDate(interview.date)}${interview.time ? ` เวลา ${interview.time} น.` : ""}`
                : "ยังไม่ได้นัด"
            }
          />
          <Kv label="ผู้ติดต่อกลับ" value={application.contactOwner} />
          <Kv
            label="ผลการสัมภาษณ์"
            value={interview.result ? INTERVIEW_RESULT_LABEL[interview.result] : "ยังไม่มีผล"}
          />
          <Kv label="แผนสัมภาษณ์" value={interview.plan} />
          <Kv label="บันทึกของผู้สัมภาษณ์" value={interview.note} />
        </tbody>
      </table>

      <Band no={next()} title="เอกสารประกอบการสมัคร" />
      <table className="hrdoc-kv">
        <tbody>
          {slots.map((slot) => {
            const attached = application.files.some((f) => f.slot === slot.id);
            return (
              <tr key={slot.id}>
                <th>{slot.label}</th>
                <td>
                  <Box on={attached}>{attached ? "แนบแล้ว" : "ยังไม่ได้แนบ"}</Box>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {documentGroups.length ? (
        <>
          <p className="hrdoc-small mt-[2mm] text-paper-mut">
            ข้อมูลที่ถอดจากเอกสาร
            {verified
              ? ` · ตรวจโดย ${application.documentMeta.verifiedBy} เมื่อ ${thaiDateTime(application.documentMeta.verifiedAt)}`
              : ""}
          </p>
          <table className="hrdoc-kv">
            <tbody>
              {documentGroups.flatMap(({ slot, fields }) =>
                fields.map((field) => (
                  <Kv
                    key={field.key}
                    label={`${field.label} (${slot.label})`}
                    value={docValue(application.documents, field.key)}
                  />
                )),
              )}
            </tbody>
          </table>
        </>
      ) : null}

      <Band no={next()} title="การให้ความยินยอม (พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล)" />
      <table className="hrdoc-kv">
        <tbody>
          {CONSENT_ITEMS.map((item) => {
            const granted = application.consent?.items.find((c) => c.id === item.id)?.granted;
            return (
              <tr key={item.id}>
                <th>{item.title}</th>
                <td>
                  <Box on={Boolean(granted)}>{granted ? "ยินยอม" : "ไม่ยินยอม"}</Box>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {application.consent?.acceptedAt ? (
        <p className="hrdoc-small mt-[1mm] text-paper-mut">
          ให้ความยินยอมผ่านระบบเมื่อ {thaiDateTime(application.consent.acceptedAt)} · ฉบับ{" "}
          {application.consent.version}
        </p>
      ) : null}

      {/* ─────────────────────────── ผลพิจารณา — เขียนมือทั้งส่วน */}
      <div className="hrdoc-keep">
        <Band no={next()} title="ความเห็นและผลการพิจารณา" />
        {[0, 1, 2].map((i) => (
          <Row key={i}>
            <Blank grow />
          </Row>
        ))}
        <Row className="mt-[3mm] gap-x-[1.4em]">
          <span>ผลการพิจารณา</span>
          <Box>ผ่าน รับเข้าทำงาน</Box>
          <Box>ไม่ผ่าน</Box>
          <Box>สำรองไว้พิจารณา</Box>
        </Row>

        <div className="mt-[10mm] grid grid-cols-2 gap-x-[10mm]">
          {["ผู้สัมภาษณ์", "ผู้อนุมัติ"].map((role) => (
            <div key={role} className="hrdoc-sign">
              <Row>
                <span>ลงชื่อ</span>
                <Blank w="14em" />
                <span>{role}</span>
              </Row>
              <Row>
                <span>(</span>
                <Blank w="14em" />
                <span>)</span>
              </Row>
              <Row>
                <span>วันที่</span>
                <Blank w="12em" />
              </Row>
            </div>
          ))}
        </div>
      </div>

      <p className="hrdoc-small mt-auto pt-[6mm] text-paper-mut">
        จัดทำจากระบบรับสมัครออนไลน์ · พิมพ์เมื่อ {thaiLongDate(todayIso())}
      </p>
    </Sheet>
  );
}

/** แถบหัวข้อ “ส่วนที่ ๑ …” */
function Band({ no, title }: { no: string; title: string }) {
  return (
    <h2 className="hrdoc-band">
      ส่วนที่ {no} &nbsp;{title}
    </h2>
  );
}

/** หนึ่งแถวของตารางสองช่อง — ไม่มีค่าขึ้นขีด ไม่ปล่อยช่องว่างให้สงสัยว่าพิมพ์ตกไป */
function Kv({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <tr>
      <th>{label}</th>
      <td className={strong ? "font-bold" : ""}>{value.trim() || "—"}</td>
    </tr>
  );
}

/** คำตอบหนึ่งข้อบนกระดาษ — เลขบัตรปิดบางส่วน · เบอร์มีขีด · วันที่เป็น พ.ศ. เต็ม */
function answerText(application: Application, q: QuestionSnapshot): string {
  const raw = application.answers[q.key];
  if (q.kind === "nid") return maskNationalId(String(raw ?? ""));
  if (q.kind === "tel") return formatPhone(String(raw ?? ""));
  if (q.kind === "date") return thaiLongDate(String(raw ?? ""));
  const text = displayAnswer(raw, q.options);
  return text === "—" ? "" : text;
}

/** ค่าจากเอกสาร — เลขบัตร/เลขบัญชีปิดบางส่วน · วันที่เป็น พ.ศ. */
function docValue(documents: DocumentData, key: keyof DocumentData): string {
  const raw = documents[key];
  if (!raw) return "";
  if (key === "nationalId") return maskNationalId(raw);
  if (key === "bankAccountNo") {
    return raw.length > 4 ? `${"x".repeat(raw.length - 4)}${raw.slice(-4)}` : raw;
  }
  if (key === "birthDate" || key === "idCardExpiry" || key === "licenseExpiry") {
    return thaiLongDate(raw);
  }
  return raw;
}
