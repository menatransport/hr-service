"use client";

import { useState } from "react";
import { FilePenLine, Printer } from "lucide-react";

import {
  CheckboxGroupField,
  DateField,
  SelectField,
  TextField,
  TextareaField,
} from "@/components/ui/field";
import { ModalShell } from "@/components/ui/modal-shell";
import { Section, printAs } from "@/app/recruitment/_components/admin/hr-document-maker";
import {
  ExitInterview,
  ResignationLetter,
} from "@/app/recruitment/_components/admin/resign-document-papers";
import { thaiLongDate } from "@/app/recruitment/_lib/hr-documents";
import {
  EXIT_QUESTIONS,
  EXIT_REASON_GROUPS,
  REPLACEMENT_CHOICES,
  RESIGN_DOCUMENTS,
  exitReasonKey,
  initialResignFill,
  rememberResignSigners,
  resignPersonName,
  type ReplacementChoice,
  type ResignDocId,
  type ResignFill,
} from "@/app/recruitment/_lib/resign-documents";
import type { DriverRecord } from "@/app/recruitment/_lib/drivers/types";

/**
 * “ทำเอกสาร” ของคนที่พ้นสภาพ — ใบลาออกพนักงานจัดส่ง + แบบสอบถามพนักงานลาออก
 * (ตามคำสั่งเจ้าของงาน 1 ต.ค. 2026 · ต้นฉบับ PDF อยู่ใน `เอกสารHR/ลาออก`)
 *
 * **ท่าเดียวกับกล่องทำเอกสารของผู้สมัคร** (`hr-document-maker.tsx`) ทุกอย่างที่คนใช้เห็น:
 * ซ้าย = ช่องกรอก · ขวา = กระดาษจริงที่ขยับตามทันที · เลือกพิมพ์ได้ทีละฉบับ ·
 * ค่าที่กรอกเป็นก้อนเดียว สลับฉบับแล้วไม่หาย (ตำแหน่ง ลูกค้า แพล้นท์ ใช้ร่วมกันสองฉบับ)
 *
 * ต่างกันที่ **ยังไม่บันทึกลงฐาน** — ดูเหตุผลที่หัวไฟล์ `resign-documents.ts`
 *
 * มาพร้อมปุ่มของตัวเอง (`ResignDocumentsButton`) เพราะเปิดได้สองที่: แถวในแท็บ
 * “พ้นสภาพแล้ว” ของทะเบียน และแถบข้อมูลการพ้นสภาพในหน้าประวัติ (server component)
 */

/** ปุ่มเปิดกล่อง — ถือ state เปิด/ปิดเอง หน้าที่วางไม่ต้องรู้อะไรเกี่ยวกับกล่อง */
export function ResignDocumentsButton({
  driver,
  variant = "icon",
}: {
  driver: DriverRecord;
  /** `icon` = ปุ่มสี่เหลี่ยมในแถวตาราง · `label` = ปุ่มมีข้อความ (หน้าประวัติ / การ์ดจอแคบ) */
  variant?: "icon" | "label";
}) {
  const [open, setOpen] = useState(false);

  return (
    /* อยู่ในแถวตารางที่กดทั้งแถวแล้วเปิดประวัติ — event จากในกล่อง (portal) ก็ยังไหลขึ้น
       ตามต้นไม้ของ React จึงหยุดไว้ที่นี่ทั้งหมด (กติกาเดียวกับ `DriverStatusControl`) */
    <span onClick={(e) => e.stopPropagation()} className="inline-flex">
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="ทำเอกสาร: ใบลาออก · แบบสอบถามพนักงานลาออก"
        className={
          variant === "icon"
            ? "inline-flex size-8 items-center justify-center rounded-selector border border-line text-mut transition-colors hover:border-alert/40 hover:text-alert"
            : "inline-flex items-center gap-2 rounded-field border border-line bg-base-100 px-3 py-2 text-13 transition-colors hover:border-alert/40 hover:text-alert"
        }
      >
        <FilePenLine size={14} strokeWidth={1.9} aria-hidden />
        {variant === "icon" ? (
          <span className="sr-only">ทำเอกสารพ้นสภาพของ {driver.name}</span>
        ) : (
          "ทำเอกสาร"
        )}
      </button>
      {open ? <ResignDocumentMaker driver={driver} onClose={() => setOpen(false)} /> : null}
    </span>
  );
}

const DOC_NO = Object.fromEntries(RESIGN_DOCUMENTS.map((d, i) => [d.id, `${i + 1})`])) as Record<
  ResignDocId,
  string
>;

function ResignDocumentMaker({ driver, onClose }: { driver: DriverRecord; onClose: () => void }) {
  const [fill, setFill] = useState<ResignFill>(() => initialResignFill(driver));
  const [current, setCurrent] = useState<ResignDocId>(RESIGN_DOCUMENTS[0].id);
  const doc = RESIGN_DOCUMENTS.find((d) => d.id === current) ?? RESIGN_DOCUMENTS[0];
  const name = resignPersonName(fill);

  const set =
    <K extends keyof ResignFill>(key: K) =>
    (value: ResignFill[K]) =>
      setFill((prev) => ({ ...prev, [key]: value }));

  function toggleReason(key: string) {
    setFill((prev) => ({
      ...prev,
      reasons: prev.reasons.includes(key)
        ? prev.reasons.filter((k) => k !== key)
        : [...prev.reasons, key],
    }));
  }

  function setOther(groupId: string, text: string) {
    setFill((prev) => ({ ...prev, otherReasons: { ...prev.otherReasons, [groupId]: text } }));
  }

  function setAnswer(index: number, text: string) {
    setFill((prev) => ({
      ...prev,
      answers: prev.answers.map((a, i) => (i === index ? text : a)),
    }));
  }

  function print() {
    rememberResignSigners(fill);
    printAs(`${driver.drivercode} ${name} - ${doc.label}`);
  }

  return (
    <ModalShell
      title={`ทำเอกสารพ้นสภาพ · ${driver.name || driver.drivercode}`}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-11-5 tracking-wider text-alert">{driver.drivercode}</span>
          <span>
            เติมจากทะเบียนและข้อมูลพ้นสภาพให้แล้ว แก้ได้ทุกช่อง · ยังไม่บันทึกลงระบบ
            ปิดกล่องแล้วค่าที่กรอกจะหาย
          </span>
        </span>
      }
      onClose={onClose}
      width="1320px"
      tone="form"
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-field border border-line px-3.5 py-2.5 text-13 transition-colors hover:border-primary/40"
          >
            ปิด
          </button>
          <button
            type="button"
            onClick={print}
            className="flex items-center gap-2 rounded-field bg-primary px-4 py-2.5 text-13 font-medium text-primary-content transition-opacity hover:opacity-90"
          >
            <Printer size={14} strokeWidth={2} aria-hidden />
            พิมพ์ / บันทึก PDF · {doc.label}
          </button>
        </div>
      }
    >
      <div className="flex min-h-0 flex-col lg:h-[calc(94dvh-9rem)] lg:flex-row print:block print:h-auto">
        {/* ─────────────────────────────── แผงซ้าย: เลือกเอกสาร + ช่องกรอก */}
        <aside
          data-print-hide
          className="hrdoc-fields flex flex-col gap-5 border-b border-line bg-base-100 p-4 lg:w-[360px] lg:flex-none lg:overflow-y-auto lg:border-r lg:border-b-0"
        >
          <Section title="เลือกเอกสาร">
            <div role="radiogroup" aria-label="เอกสารที่จะพรีวิวและพิมพ์" className="flex flex-col gap-1.5">
              {RESIGN_DOCUMENTS.map((d) => {
                const on = d.id === doc.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setCurrent(d.id)}
                    className={`flex items-center gap-3 rounded-field border px-3 py-2.5 text-left transition-colors ${
                      on ? "border-primary/50 bg-soft" : "border-line hover:border-primary/40"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`flex size-4.5 flex-none items-center justify-center rounded-full border ${
                        on ? "border-primary" : "border-line"
                      }`}
                    >
                      {on ? <span className="size-2.5 rounded-full bg-primary" /> : null}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-13 font-medium">
                        {DOC_NO[d.id]} {d.label}
                      </span>
                      <span className="truncate text-11-5 text-mut">{d.hint}</span>
                    </span>
                    <span className="flex-none font-mono text-10-5 text-mut">{d.code}</span>
                  </button>
                );
              })}
            </div>
          </Section>

          <Section no={DOC_NO[doc.id]} title={doc.label} code={doc.code}>
            {doc.id === "letter" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <TextField id="rs-ref-no" label="ที่ มท.10-" optional value={fill.refNo} onChange={set("refNo")} />
                  <TextField id="rs-ref-year" label="/ ปี" optional value={fill.refYear} onChange={set("refYear")} />
                </div>
                <DateField id="rs-doc-date" label="วันที่ทำเอกสาร" optional value={fill.docDate} onChange={set("docDate")} />
                <div className="grid grid-cols-[6.5rem_1fr] gap-3">
                  <TextField
                    id="rs-title"
                    label="คำนำหน้า"
                    optional
                    value={fill.title}
                    onChange={set("title")}
                  />
                  <TextField id="rs-name" label="ชื่อ–นามสกุล" optional labelRight={<Shared />} value={fill.name} onChange={set("name")} />
                </div>
                <PlaceFields fill={fill} set={set} />
                <TextField id="rs-office" label="สำนักงาน/ศูนย์" optional value={fill.office} onChange={set("office")} />
                <DateField
                  id="rs-last"
                  label="ทำงานวันสุดท้าย"
                  optional
                  hint="ตั้งต้นจากวันที่พ้นสภาพที่บันทึกไว้"
                  value={fill.lastWorkDate}
                  onChange={set("lastWorkDate")}
                />
                <DateField
                  id="rs-effective"
                  label="ลาออกมีผล"
                  optional
                  hint={
                    fill.effectiveDate
                      ? `ตั้งต้นเป็นวันถัดจากวันทำงานวันสุดท้าย · ${thaiLongDate(fill.effectiveDate)}`
                      : "ตั้งต้นเป็นวันถัดจากวันทำงานวันสุดท้าย"
                  }
                  value={fill.effectiveDate}
                  onChange={set("effectiveDate")}
                />
                <TextareaField
                  id="rs-reason"
                  label="เนื่องจาก (สาเหตุการลาออก)"
                  optional
                  rows={2}
                  value={fill.reason}
                  onChange={set("reason")}
                />

                <div className="flex flex-col gap-3 rounded-field border border-line p-3">
                  <p className="flex items-baseline justify-between gap-2 text-12-5 font-medium">
                    ผู้บังคับบัญชาต้นสังกัด
                    <span className="text-11 font-normal text-mut">เว้นว่างได้ ถ้าจะเขียนมือ</span>
                  </p>
                  <SelectField
                    id="rs-replacement"
                    label="1.ผู้มีอำนาจอนุมัติประจำฝ่าย"
                    optional
                    placeholder="ยังไม่เลือก"
                    clearable={Boolean(fill.replacement)}
                    options={REPLACEMENT_CHOICES.map((c) => ({ value: c.value, label: c.label }))}
                    value={fill.replacement}
                    onChange={(v) => set("replacement")(v as ReplacementChoice)}
                  />
                  <TextField id="rs-supervisor" label="1. ผู้บังคับบัญชาโดยตรง" optional value={fill.supervisor} onChange={set("supervisor")} />
                  <TextField id="rs-manager-dept" label="2. ผู้จัดการฝ่าย (ชื่อฝ่าย)" optional value={fill.managerDept} onChange={set("managerDept")} />
                  <TextField id="rs-manager" label="2. ผู้จัดการฝ่าย (ชื่อผู้ลงนาม)" optional value={fill.manager} onChange={set("manager")} />
                  <TextField id="rs-executive" label="3. ผู้บริหารสายงาน" optional value={fill.executive} onChange={set("executive")} />
                  <TextField id="rs-hr" label="ผู้จัดการฝ่ายทรัพยากรบุคคล" optional value={fill.hrManager} onChange={set("hrManager")} />
                  <p className="text-11 text-mut">ชื่อในข้อ 2–3 และฝ่ายบุคคล เครื่องนี้จำไว้เมื่อกดพิมพ์</p>
                </div>
              </>
            ) : (
              <>
                <TextField
                  id="rs-name-i"
                  label="ชื่อผู้ตอบ (ใต้ลายมือชื่อ)"
                  optional
                  labelRight={<Shared />}
                  value={fill.name}
                  onChange={set("name")}
                />
                <PlaceFields fill={fill} set={set} />

                {EXIT_REASON_GROUPS.map((g) => (
                  <div key={g.id} className="flex flex-col gap-2">
                    <CheckboxGroupField
                      id={`rs-reason-${g.id}`}
                      label={g.label}
                      optional
                      value={fill.reasons}
                      onToggle={toggleReason}
                      options={g.options.map((o) => ({ value: exitReasonKey(g.id, o), label: o }))}
                    />
                    <TextField
                      id={`rs-other-${g.id}`}
                      label="อื่นๆ"
                      srLabel
                      optional
                      placeholder="อื่นๆ (พิมพ์แล้วติ๊กให้เอง)"
                      value={fill.otherReasons[g.id] ?? ""}
                      onChange={(v) => setOther(g.id, v)}
                    />
                  </div>
                ))}

                <TextareaField
                  id="rs-detail"
                  label="รายละเอียดเพิ่มเติม"
                  optional
                  rows={2}
                  value={fill.detail}
                  onChange={set("detail")}
                />

                <div className="flex flex-col gap-3 rounded-field border border-line p-3">
                  <p className="text-12-5 font-medium">ความคิดเห็นเพิ่มเติม</p>
                  {EXIT_QUESTIONS.map((q, i) => (
                    <TextareaField
                      key={q}
                      id={`rs-q${i + 1}`}
                      label={`${i + 1}.${q}`}
                      optional
                      rows={2}
                      value={fill.answers[i] ?? ""}
                      onChange={(v) => setAnswer(i, v)}
                    />
                  ))}
                </div>
              </>
            )}
          </Section>
        </aside>

        {/* ──────────────────────────────────────── แผงขวา: กระดาษจริง */}
        <div
          key={doc.id}
          data-print-area
          className="flex min-h-0 flex-1 flex-col items-center gap-6 overflow-auto bg-canvas p-6 print:block print:overflow-visible print:bg-transparent print:p-0"
        >
          {doc.id === "letter" ? <ResignationLetter fill={fill} /> : <ExitInterview fill={fill} name={name} />}
        </div>
      </div>
    </ModalShell>
  );
}

/** ตำแหน่ง · ลูกค้า · แพล้นท์ — อยู่บนกระดาษทั้งสองฉบับ แก้ที่ฉบับไหนอีกฉบับก็เปลี่ยนตาม */
function PlaceFields({
  fill,
  set,
}: {
  fill: ResignFill;
  set: <K extends keyof ResignFill>(key: K) => (value: ResignFill[K]) => void;
}) {
  return (
    <>
      <TextField
        id="rs-position"
        label="ตำแหน่ง"
        optional
        hint="ตำแหน่ง ลูกค้า แพล้นท์ และชื่อ ใช้ร่วมกันทั้งสองฉบับ"
        value={fill.position} onChange={set("position")} />
      <div className="grid grid-cols-2 gap-3">
        <TextField id="rs-customer" label="ลูกค้า" optional value={fill.customer} onChange={set("customer")} />
        <TextField id="rs-plant" label="แพล้นท์" optional value={fill.plant} onChange={set("plant")} />
      </div>
    </>
  );
}

/** ป้ายข้างชื่อช่องที่สองฉบับใช้ร่วมกัน */
function Shared() {
  return <span className="text-11 text-mut">ใช้ร่วมกับอีกฉบับ</span>;
}
