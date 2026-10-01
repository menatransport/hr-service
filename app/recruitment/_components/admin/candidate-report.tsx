"use client";

import { useState } from "react";
import { FileStack, Printer, ShieldCheck, SquarePen } from "lucide-react";

import { CandidateDocumentsModal } from "@/app/recruitment/_components/admin/candidate-documents";
import { CandidateEditModal } from "@/app/recruitment/_components/admin/candidate-edit";
import { StatusPill } from "@/app/recruitment/_components/status-pill";
import { AttachmentGallery } from "@/components/ui/attachment-gallery";
import { ModalShell } from "@/components/ui/modal-shell";
import { CONSENT_ITEMS, CONTROLLER } from "@/app/recruitment/_lib/consent";
import {
  displayAnswer,
  findByRole,
  formatPhone,
  maskNationalId,
  slotsForApplication,
  thaiDate,
  type DocSlot,
} from "@/app/recruitment/_lib/form";
import {
  DOCUMENT_FIELDS,
  INTERVIEW_RESULT_LABEL,
  QUESTION_SECTIONS,
  STATUS_LABEL,
  exitReasonText,
  type AnswerMap,
  type Application,
  type DocumentData,
} from "@/app/recruitment/_lib/types";

/**
 * รายงานผู้สมัครหนึ่งราย — **เอกสารสำหรับถือเข้าห้องสัมภาษณ์**
 *
 * ไม่ใช่ “หน้ารายละเอียด” ที่เอาไว้อ่านบนจอ แต่เป็นใบที่พิมพ์ออกมาแล้วใช้ได้จริง:
 * หัวกระดาษมีชื่อบริษัทและเลขอ้างอิง เนื้อในเรียงจากสรุปที่ต้องรู้ก่อนยกหูโทรศัพท์
 * ไปหาคำตอบทั้งใบ และปิดท้ายด้วยช่องบันทึกกับช่องลงนามที่กรอกด้วยปากกาได้
 * (ผู้สัมภาษณ์จดบนกระดาษเสมอ การพิมพ์ใบที่ไม่มีที่ให้จดคือการบังคับให้จดหลังใบ)
 *
 * **ทั้งใบเป็นพื้นขาวล้วน ไม่มีการ์ดและไม่มีแผงสี** — เอกสารราชการแยกส่วนด้วย
 * ช่องไฟกับหัวข้อ ไม่ใช่ด้วยกล่อง · กล่องสีทำให้ใบดูเป็นหน้าจอแอป และตอนพิมพ์
 * ออกกระดาษก็กลายเป็นแผ่นสีทึบที่กินหมึกโดยไม่ได้บอกอะไรเพิ่ม
 *
 * ลำดับความสำคัญจึงเล่าด้วย **ขนาดตัวอักษรและระยะห่าง** แทน:
 * - ชื่อผู้สมัคร 20px คือของชิ้นเดียวที่ใหญ่ที่สุดในใบ
 * - ระหว่างส่วนห่าง 40px · ระหว่างบรรทัดข้อมูลในส่วนเดียวกันห่าง 20px
 *   ช่องไฟที่ต่างกันเท่าตัวทำให้ตาแยกส่วนออกเองโดยไม่ต้องมีเส้นกรอบมาช่วย
 * - หัวข้อมีเลขกำกับ `01`–`07` และเส้นใต้บาง ๆ พาดเต็มความกว้าง
 *
 * สีแบรนด์เหลือไว้เป็น *หมึก* เท่านั้น (`brand-ink`) — เลขอ้างอิง เลขกำกับหัวข้อ
 * เส้นคาดหัวกระดาษ และคำว่า “ยินยอม” · ส่วนปุ่มบนจอยังเป็น `primary` เหมือน
 * ทั้งระบบ เพราะปุ่มไม่ได้เป็นส่วนหนึ่งของเอกสารที่พิมพ์ออกไป
 *
 * กติกาการพิมพ์อยู่ใน `@media print` ของ `app/globals.css` — ที่นั่นซ่อนหน้าเบื้องหลัง
 * คลี่กล่องลอยที่ปกติเลื่อนในตัวให้ไหลลงหลายหน้า และตรึงสีกลับเป็นชุดสว่างเสมอ
 * · ทุกส่วนที่ไม่ควรถูกตัดกลางหน้าติด `data-print-block` ไว้
 *
 * เลขบัตรประชาชนถูกปิดเหลือ 4 หลักท้ายเหมือนบนจอ — ใบที่พิมพ์ออกมาวางทิ้งไว้
 * บนโต๊ะได้ง่ายกว่าหน้าจอเสียอีก จึงไม่มีเหตุผลที่จะพิมพ์เลขเต็มลงกระดาษ
 */

const printedAt = new Intl.DateTimeFormat("th-TH", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Bangkok",
});

const stamp = new Intl.DateTimeFormat("th-TH", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Bangkok",
});

export function CandidateReport({
  application,
  docSlots,
  onPatch,
  onClose,
}: {
  application: Application;
  /** ช่องเอกสารทั้งหมดพร้อมค่าจาก Section 4 — รายงานแสดงเฉพาะที่ใบนี้ต้องใช้ */
  docSlots: DocSlot[];
  /** ไม่ส่งมา = ใบนี้อ่านอย่างเดียว ปุ่มแก้ไขจะไม่ขึ้น */
  onPatch?: (patch: {
    answers?: AnswerMap;
    files?: Record<string, string | null>;
    documents?: DocumentData;
  }) => Promise<void>;
  onClose: () => void;
}) {
  const snapshot = application.questionSnapshot;
  const { interview } = application;
  const [editing, setEditing] = useState(false);
  const [documenting, setDocumenting] = useState(false);

  /* ช่องที่เปิดอยู่ + ช่องที่ซ่อน/ลบไปแล้วแต่ใบนี้แนบมา — แก้คลังวันนี้ไฟล์เก่าต้องไม่หาย */
  const slots = slotsForApplication(docSlots, application.files);

  const answerOf = (role: Parameters<typeof findByRole>[1]) => {
    const question = findByRole(snapshot, role);
    if (!question) return "—";
    return displayAnswer(application.answers[question.key], question.options);
  };

  const workZone = answerOf("work_zone");
  const readyRaw = answerOf("ready_date");
  const erased = application.erased;

  /* ใบที่ผู้สมัครยกเลิกเองและขอให้ลบข้อมูลแล้วแก้อะไรไม่ได้อีก — ซ่อนปุ่มทิ้งไปเลย
     ไม่ใช่ปล่อยให้กดแล้วเจอข้อความปฏิเสธจากเซิร์ฟเวอร์ทีหลัง */
  const canEdit = Boolean(onPatch) && !erased;

  /* มีใครบันทึกข้อมูลจากเอกสารไว้แล้วหรือยัง — ใช้ร่องรอยผู้ตรวจเป็นตัวตัดสิน
     ไม่ใช่ “มีช่องไหนไม่ว่างบ้าง” เพราะเอกสารที่อ่านออกช่องเดียวก็ยังนับว่าตรวจแล้ว */
  const verified = Boolean(application.documentMeta.verifiedAt);

  return (
    <ModalShell
      title={`รายงานผู้สมัคร · ${application.fullName}`}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-11-5 tracking-wider text-primary">
            {application.ref}
          </span>
          <StatusPill status={application.status} />
          <span className="font-mono text-11-5 text-mut tabular-nums">
            {formatPhone(application.phone)}
          </span>
        </span>
      }
      onClose={onClose}
      width="1180px"
      tone="plain"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <span className="text-12 text-mut">
            สั่งพิมพ์แล้วเลือกปลายทางเป็น “บันทึกเป็น PDF” เพื่อเก็บเป็นไฟล์
          </span>
          <div className="flex items-center gap-2">
            {canEdit ? (
              <>
                <button
                  type="button"
                  onClick={() => setDocumenting(true)}
                  className="flex items-center gap-2 rounded-field border border-line px-3.5 py-2.5 text-13 transition-colors hover:border-primary/40 hover:text-primary"
                >
                  <FileStack size={14} strokeWidth={2} aria-hidden />
                  เอกสารและข้อมูล
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-2 rounded-field border border-line px-3.5 py-2.5 text-13 transition-colors hover:border-primary/40 hover:text-primary"
                >
                  <SquarePen size={14} strokeWidth={2} aria-hidden />
                  แก้ไขใบสมัคร
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-field border border-line px-3.5 py-2.5 text-13 transition-colors hover:border-primary/40"
            >
              ปิด
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-2 rounded-field bg-primary px-4 py-2.5 text-13 font-medium text-primary-content transition-opacity hover:opacity-90"
            >
              <Printer size={14} strokeWidth={2} aria-hidden />
              พิมพ์ / บันทึก PDF
            </button>
          </div>
        </div>
      }
    >
      <article
        data-print-area
        /* ช่องไฟระหว่างส่วน 40px — กว้างเป็นสองเท่าของช่องไฟในส่วนเดียวกัน
           นี่คือสิ่งที่ทำหน้าที่แทนเส้นกรอบทั้งหมดในใบนี้ */
        className="mx-auto flex w-full max-w-[860px] flex-col gap-10 py-1 text-13 print:max-w-none"
      >
        {/* ───────────────────────────── หัวกระดาษ */}
        <header data-print-block className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-16 leading-tight font-semibold">
                {CONTROLLER.company}
              </span>
              <span className="text-12 text-mut">
                ฝ่ายทรัพยากรบุคคล · รายงานข้อมูลผู้สมัครตำแหน่งพนักงานขับรถ
              </span>
            </div>
            <div className="flex flex-col items-end gap-1 text-right">
              <span className="font-mono text-13 font-semibold tracking-wider text-brand-ink">
                {application.ref}
              </span>
              <span className="font-mono text-10-5 text-mut">
                พิมพ์เมื่อ {printedAt.format(new Date())} น.
              </span>
            </div>
          </div>

          {/* เส้นคาดหัวกระดาษ — เขียวยาวปิดท้ายด้วยขีดแดงสั้น ล้อลายข้างรถของบริษัท */}
          <div aria-hidden className="flex h-[2px] items-stretch">
            <span className="flex-1 bg-brand-ink" />
            <span className="ml-1 w-6 bg-brand-red" />
          </div>
        </header>

        {/* ───────────────────────────── สรุปที่ต้องรู้ก่อน */}
        <Section index="01" title="ข้อมูลผู้สมัคร">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 pb-1">
            <span className="text-20 leading-tight font-semibold text-pretty">
              {application.fullName}
            </span>
            <StatusPill status={application.status} />
          </div>

          {application.status === "cancelled" ? (
            <p className="text-12 text-alert">
              เหตุผลที่ยกเลิก ·{" "}
              {application.exitReason
                ? exitReasonText(application)
                : "ยังไม่ระบุเหตุผล"}
            </p>
          ) : null}

          <FactGrid>
            <Fact label="เบอร์โทรศัพท์" value={formatPhone(application.phone)} mono />
            <Fact
              label="วันที่สมัคร"
              value={`${stamp.format(new Date(application.createdAt))} น.`}
            />
            <Fact label="สนใจงานเขต" value={workZone} />
            <Fact
              label="ความพร้อมเริ่มงาน"
              value={readyRaw === "—" ? "—" : thaiDate(readyRaw)}
            />
            <Fact label="ผู้ติดต่อกลับ" value={application.contactOwner || "ยังไม่มี"} />
            <Fact
              label="เอกสารแนบ"
              value={`${application.files.length} จาก ${slots.length} รายการ`}
            />
          </FactGrid>
        </Section>

        {/* ───────────────────────────── การสัมภาษณ์ */}
        <Section index="02" title="การนัดสัมภาษณ์">
          <FactGrid>
            <Fact
              label="วันสัมภาษณ์"
              value={interview.date ? thaiDate(interview.date) : "ยังไม่ได้นัด"}
              strong={Boolean(interview.date)}
            />
            <Fact label="เวลานัด" value={interview.time ? `${interview.time} น.` : "—"} />
            <Fact
              label="ผลการสัมภาษณ์"
              value={
                interview.result ? INTERVIEW_RESULT_LABEL[interview.result] : "ยังไม่มีผล"
              }
            />
          </FactGrid>

          <div className="flex flex-col gap-5 pt-1">
            <Fact label="แผนสัมภาษณ์" value={interview.plan || "—"} />
            <Fact label="บันทึกของผู้สัมภาษณ์" value={interview.note || "—"} />
          </div>
        </Section>

        {/* ───────────────────────────── คำตอบทั้งใบ */}
        <Section index="03" title="คำตอบในใบสมัคร">
          {erased ? (
            <p className="text-12-5 text-mut">
              ผู้สมัครยกเลิกใบสมัครเองและขอให้ลบข้อมูลแล้ว — คำตอบและเอกสารถูกลบออกจาก
              ระบบตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล มาตรา 33
            </p>
          ) : (
            /* กลุ่มคำถามห่างกัน 28px — แคบกว่าช่องไฟระหว่างส่วนหลัก (40px) พอให้
               ยังอ่านเป็นส่วนเดียวกัน แต่กว้างพอจะแยกกลุ่มย่อยออกจากกันได้ */
            <div className="flex flex-col gap-7">
              {QUESTION_SECTIONS.map((section) => {
                const list = snapshot.filter((q) => q.section === section.id);
                if (!list.length) return null;

                return (
                  <div key={section.id} data-print-block className="flex flex-col gap-2">
                    <h4 className="text-11-5 font-medium tracking-[0.06em] text-mut">
                      {section.title}
                    </h4>
                    <dl className="grid gap-x-12 sm:grid-cols-2">
                      {list.map((q) => {
                        const raw = application.answers[q.key];
                        const value =
                          q.kind === "nid"
                            ? maskNationalId(String(raw ?? ""))
                            : q.kind === "tel"
                              ? formatPhone(String(raw ?? ""))
                              : q.kind === "date"
                                ? thaiDate(String(raw ?? ""))
                                : displayAnswer(raw, q.options);

                        return (
                          <div
                            key={q.key}
                            className="flex justify-between gap-5 border-b border-line py-2.5 text-12-5"
                          >
                            <dt className="flex max-w-[58%] items-start gap-1 text-mut">
                              {q.label}
                              {q.sensitive ? (
                                <ShieldCheck
                                  size={11}
                                  strokeWidth={2}
                                  aria-label="ข้อมูลอ่อนไหว"
                                  className="mt-0.5 flex-none text-st-wait-ink"
                                />
                              ) : null}
                            </dt>
                            <dd className="m-0 text-right font-medium text-ink">
                              {value || "—"}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* ───────────────────────────── เอกสารแนบ */}
        <Section index="04" title="เอกสารแนบ">
          <div className="grid gap-x-12 gap-y-4 sm:grid-cols-2">
            {slots.map((slot) => {
              const file = application.files.find((f) => f.slot === slot.id);
              return (
                <div key={slot.id} className="flex items-center gap-3.5">
                  {file ? (
                    <div data-print-hide>
                      <AttachmentGallery urls={[file.url]} thumb={44} />
                    </div>
                  ) : (
                    <span
                      aria-hidden
                      data-print-hide
                      className="size-[44px] flex-none rounded-field border border-dashed border-line"
                    />
                  )}
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-12-5">{slot.label}</span>
                    <span
                      className={`text-11 ${file ? "text-brand-ink" : "text-mut"}`}
                    >
                      {file ? "แนบแล้ว" : "ยังไม่ได้แนบ"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* ───────────────────────────── ข้อมูลที่ถอดจากเอกสาร */}
        <Section index="05" title="ข้อมูลจากเอกสาร">
          {verified ? (
            <p className="text-11-5 text-mut">
              ตรวจโดย {application.documentMeta.verifiedBy} ·{" "}
              {stamp.format(new Date(application.documentMeta.verifiedAt))} น.
            </p>
          ) : (
            <p className="text-12-5 text-mut">
              ยังไม่มีใครบันทึกข้อมูลจากเอกสารของผู้สมัครรายนี้
            </p>
          )}

          {verified ? (
            <div className="flex flex-col gap-5">
              {docSlots.filter((slot) =>
                DOCUMENT_FIELDS.some((f) => f.slot === slot.id),
              ).map((slot) => {
                const fields = DOCUMENT_FIELDS.filter((f) => f.slot === slot.id);
                /* กลุ่มที่ยังว่างทั้งกลุ่มไม่ต้องขึ้นเป็นแถวขีดกลางสี่ช่อง —
                   บนกระดาษมันอ่านเหมือนข้อมูลหาย ทั้งที่แปลว่ายังไม่ได้ตรวจ */
                if (fields.every((f) => !application.documents[f.key])) return null;

                return (
                  <div key={slot.id} data-print-block className="flex flex-col gap-2">
                    <h4 className="text-11-5 font-medium tracking-[0.06em] text-mut">
                      {slot.label}
                    </h4>
                    <FactGrid>
                      {fields.map((field) => (
                        <Fact
                          key={field.key}
                          label={field.label}
                          value={docValue(application.documents, field.key)}
                          mono={field.kind === "nid" || field.kind === "digits"}
                        />
                      ))}
                    </FactGrid>
                  </div>
                );
              })}
            </div>
          ) : null}
        </Section>

        {/* ───────────────────────────── ไทม์ไลน์ */}
        <Section index="06" title="ประวัติการดำเนินการ">
          <ol className="flex flex-col">
            {[...application.timeline].reverse().map((entry, i) => (
              <li
                key={`${entry.at}-${i}`}
                className="flex flex-wrap justify-between gap-x-8 gap-y-1 border-b border-line py-2.5 text-12-5 last:border-b-0"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span>
                    <span className="text-mut">{entry.by}</span> เปลี่ยนเป็น{" "}
                    <span className="font-medium">{STATUS_LABEL[entry.to]}</span>
                  </span>
                  {entry.note ? (
                    <span className="text-11-5 text-mut">{entry.note}</span>
                  ) : null}
                </span>
                <span className="font-mono text-10-5 whitespace-nowrap text-mut tabular-nums">
                  {stamp.format(new Date(entry.at))} น.
                </span>
              </li>
            ))}
          </ol>
        </Section>

        {/* ───────────────────────────── ความยินยอม */}
        <Section index="06" title="หลักฐานความยินยอม (PDPA)">
          <div className="flex flex-col">
            {CONSENT_ITEMS.map((item) => {
              const record = application.consent?.items.find((c) => c.id === item.id);
              return (
                <div
                  key={item.id}
                  className="flex flex-wrap justify-between gap-x-8 border-b border-line py-2.5 text-12-5 last:border-b-0"
                >
                  <span className="text-mut">{item.title}</span>
                  <span
                    className={
                      record?.granted ? "font-medium text-brand-ink" : "text-mut"
                    }
                  >
                    {record?.granted ? "ยินยอม" : "ไม่ยินยอม"}
                  </span>
                </div>
              );
            })}
            <p className="pt-3 font-mono text-10 leading-relaxed text-mut">
              เวอร์ชัน {application.consent?.version} ·{" "}
              {application.consent?.acceptedAt
                ? stamp.format(new Date(application.consent.acceptedAt))
                : "—"}{" "}
              น. · IP {application.consent?.ip}
            </p>
          </div>
        </Section>

        {/* ───────────────────────────── ช่องเขียนด้วยปากกา */}
        <Section index="07" title="บันทึกระหว่างสัมภาษณ์">
          {/* เส้นบรรทัดเปล่า ไม่มีกรอบครอบ — บนกระดาษกรอบไม่ได้ช่วยให้เขียนง่ายขึ้น
              มีแต่บีบบรรทัดให้แคบลง · ระยะ 28px คือระยะที่เขียนด้วยปากกาได้จริง */}
          <div className="flex flex-col gap-7 pt-2">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} aria-hidden className="block border-b border-line" />
            ))}
          </div>

          <div className="grid grid-cols-2 gap-12 pt-12">
            <SignLine label="ผู้สัมภาษณ์" />
            <SignLine label="ผู้อนุมัติ" />
          </div>
        </Section>
      </article>

      {editing && onPatch ? (
        <CandidateEditModal
          application={application}
          onPatch={onPatch}
          onClose={() => setEditing(false)}
        />
      ) : null}

      {documenting && onPatch ? (
        <CandidateDocumentsModal
          application={application}
          docSlots={docSlots}
          onPatch={onPatch}
          onClose={() => setDocumenting(false)}
        />
      ) : null}
    </ModalShell>
  );
}

/* ─────────────────────────────────────────────────────────── ชิ้นส่วน */

/**
 * หัวข้อของส่วน — **เลขกำกับ + ชื่อ + เส้นใต้บาง**
 *
 * เดิมเป็นตัวพิมพ์ใหญ่สีเทาแบบ mono ซึ่งบางจนจมหายไปกับเนื้อที่ตามมา · เลขลำดับ
 * ทำให้ใบนี้อ่านเป็นเอกสารที่มีโครง ไม่ใช่กองข้อมูลที่ต่อกันมาเรื่อย ๆ และ
 * อ้างถึงกันได้ตอนคุยกัน (“ดูข้อ 05 ประวัติ”) โดยไม่ต้องเติมกล่องหรือสีพื้นอะไรเลย
 */
function Section({
  index,
  title,
  children,
}: {
  index: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section data-print-block className="flex flex-col gap-5">
      <div className="flex items-baseline gap-2.5 border-b border-ink/15 pb-2">
        <span className="font-mono text-11 font-bold text-brand-ink">{index}</span>
        <h3 className="text-13 font-semibold tracking-[0.06em]">{title}</h3>
      </div>
      {children}
    </section>
  );
}

/**
 * ตารางข้อมูลของส่วน — สามคอลัมน์ ช่องไฟแนวตั้ง 20px แนวนอน 48px
 *
 * กว้างกว่าเดิมทั้งสองแกนโดยตั้งใจ · ค่าที่อยู่ติดกันเกินไปทำให้ตาอ่านข้ามแถว
 * ไปหยิบค่าของอีกคอลัมน์มาจับคู่กับป้ายผิดตัว ซึ่งเป็นความผิดพลาดที่แพงมาก
 * ในใบที่คนถือเข้าไปคุยกับผู้สมัครจริง
 */
function FactGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-x-12 gap-y-5 sm:grid-cols-3">{children}</div>
  );
}

function Fact({
  label,
  value,
  strong = false,
  mono = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-10-5 tracking-[0.06em] text-mut">{label}</span>
      <span
        className={`leading-relaxed text-pretty ${strong ? "font-semibold" : ""} ${
          mono ? "font-mono tabular-nums" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * ค่าหนึ่งช่องของข้อมูลจากเอกสารบนใบที่พิมพ์ออกมา
 *
 * **เลขบัตรกับเลขบัญชีถูกปิดบางส่วน** เหมือนที่ทำกับคำตอบในใบสมัคร — ใบที่พิมพ์
 * ออกมาวางทิ้งไว้บนโต๊ะได้ง่ายกว่าหน้าจอเสียอีก · คนที่ต้องเห็นเลขเต็มเปิดดูใน
 * กล่องเอกสารบนหน้าจอได้อยู่แล้ว
 */
function docValue(documents: DocumentData, key: keyof DocumentData): string {
  const raw = documents[key];
  if (!raw) return "—";
  if (key === "nationalId") return maskNationalId(raw);
  if (key === "bankAccountNo") {
    return raw.length > 4 ? `${"x".repeat(raw.length - 4)}${raw.slice(-4)}` : raw;
  }
  if (key === "birthDate" || key === "idCardExpiry" || key === "licenseExpiry") {
    return thaiDate(raw);
  }
  return raw;
}

function SignLine({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span aria-hidden className="w-full border-b border-ink" />
      <span className="text-11-5 text-mut">
        {label} · วันที่ ......... / ......... / .........
      </span>
    </div>
  );
}
