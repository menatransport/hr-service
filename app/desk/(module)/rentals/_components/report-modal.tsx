"use client";

import { useMemo, useState } from "react";
import { Printer, TriangleAlert } from "lucide-react";

import { DateField, TextField } from "@/components/ui/field";
import { ModalShell } from "@/components/ui/modal-shell";
import { Section, printAs } from "@/app/recruitment/_components/admin/hr-document-maker";
import { MenaLogo, Sheet } from "@/app/recruitment/_components/admin/hr-document-paper";
import { bahtText, thaiLongDate } from "@/app/recruitment/_lib/hr-documents";
import {
  THAI_MONTHS_SHORT,
  monthEnd,
  monthLabel,
  occupantName,
  reportGroups,
  shiftMonth,
  stayRange,
  thaiDate,
  vehicleClass,
  type BoardOccupant,
  type BoardRoom,
  type RentalBoard,
  type ReportApartment,
} from "@/lib/rentals/types";

/**
 * “รายงานขอเบิกค่าเช่า” ของหน้าห้องเช่า — ชุดเอกสารที่ฝ่ายบุคคลส่งบัญชีทุกเดือน
 * (ต้นแบบ: `สรุปค่าที่พักของบริษัท เดือนตุลาคม 2569` ที่ส่งบัญชีแล้ว · รอบจ่ายวันที่ 5 ของเดือนถัดไป)
 *
 * 1. บันทึกขออนุมัติจ่าย (HR0601-02) — หนึ่งแถวต่อที่พัก · จำนวนห้อง · ยอดรวม · บัญชีรับเงิน
 * 2. แบบฟอร์มขอเบิกเงินค่าเช่าบ้าน — หนึ่งแผ่นต่อที่พัก แยกค่าห้อง/ไฟ/น้ำ/อื่น ๆ รายห้อง
 * 3. สรุปยอดหักค่าที่พัก พจส. — ส่วนของแต่ละคนตามวันที่พักจริง (`chargeRoom`)
 *
 * ท่าเดียวกับกล่องทำเอกสาร HR (`hr-document-maker.tsx`): ซ้ายกรอก · ขวากระดาษจริง · พิมพ์/บันทึก PDF
 * ตัวเลขทุกตัวมาจากกระดานเดือนนั้น (`getRentalBoard`) ไม่คิดใหม่ที่นี่ · ชื่อผู้ลงนามจำไว้ในเครื่อง
 */

type DocId = "memo" | "forms" | "deduct";

const DOCS: { id: DocId; label: string; hint: string; code?: string }[] = [
  { id: "memo", label: "บันทึกขออนุมัติจ่าย", hint: "สรุปรายที่พัก · ส่งแผนกบัญชี", code: "HR0601-02" },
  { id: "forms", label: "แบบฟอร์มขอเบิกค่าเช่าบ้าน", hint: "หนึ่งแผ่นต่อที่พัก · แยกค่าห้อง ไฟ น้ำ" },
  { id: "deduct", label: "สรุปยอดหักค่าที่พัก พจส.", hint: "ส่วนของแต่ละคนตามวันที่พักจริง" },
];

interface Signer {
  name: string;
  role: string;
}

interface Fill {
  payDate: string;
  docDate: string;
  preparer: Signer;
  checker: Signer;
  reviewer: Signer;
  approver: Signer;
}

type SignerKey = "preparer" | "checker" | "reviewer" | "approver";

/** ผู้ลงนามตามบันทึก ต.ค. 2569 — แก้ได้ในกล่อง ค่าที่แก้จำไว้ในเครื่อง */
const DEFAULT_SIGNERS: Record<SignerKey, Signer> = {
  preparer: { name: "แพรวา พลอยสีสังข์", role: "เจ้าหน้าที่ธุรการ แผนกสรรหา Mass" },
  checker: { name: "ศักดิ์ดาเดช แสงดิษฐ", role: "ผู้จัดการแผนกสรรหาบุคลากร (Mass)" },
  reviewer: { name: "วรกมล ศรีดวงมณีฉาย", role: "ผู้อำนวยการสายงานสนับสนุน" },
  approver: { name: "สุวรรณา ขจรวุฒิเดช", role: "ประธานเจ้าหน้าที่บริหาร" },
};

const SIGNER_ROWS: { key: SignerKey; label: string; duty: string }[] = [
  { key: "preparer", label: "ผู้จัดทำ", duty: "ผู้จัดทำ" },
  { key: "checker", label: "ตรวจสอบ", duty: "ตรวจสอบ" },
  { key: "reviewer", label: "ผู้ตรวจสอบ", duty: "ผู้ตรวจสอบ" },
  { key: "approver", label: "อนุมัติ", duty: "อนุมัติ" },
];

const STORAGE_KEY = "hrs.rentals.report.signers";

function loadSigners(): Record<SignerKey, Signer> {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Record<SignerKey, Signer>> | null;
    return { ...DEFAULT_SIGNERS, ...(saved ?? {}) };
  } catch {
    return DEFAULT_SIGNERS;
  }
}

function saveSigners(fill: Fill) {
  try {
    const { preparer, checker, reviewer, approver } = fill;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ preparer, checker, reviewer, approver }));
  } catch {
    /* โหมดส่วนตัว — ครั้งหน้าก็แค่กรอกชื่อใหม่ */
  }
}

/** `6493` → `6,493.00` — แบบตัวเลขในเอกสารบัญชี (คั่นหลักพันเองแทน `Intl`) */
function amount(n: number): string {
  const [whole, frac] = (Math.round(n * 100) / 100).toFixed(2).split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${frac}`;
}

/** ช่องเงินที่ไม่มีค่า = ขีด (เอกสารบัญชีไม่เว้นช่องว่างเปล่า) */
const cell = (n: number) => (n ? amount(n) : "–");

export function RentalReportModal({
  board,
  monthTotals,
  onClose,
}: {
  board: RentalBoard;
  monthTotals: Record<string, number | null>;
  onClose: () => void;
}) {
  const next = shiftMonth(board.month, 1);
  const [fill, setFill] = useState<Fill>(() => ({
    payDate: `${next}-05`,
    docDate: board.today,
    ...loadSigners(),
  }));
  const [docs, setDocs] = useState<Record<DocId, boolean>>({ memo: true, forms: true, deduct: true });

  const groups = useMemo(() => reportGroups(board.rooms), [board.rooms]);
  const roomCount = groups.reduce((t, g) => t + g.rooms.length, 0);
  const grand = Math.round(groups.reduce((t, g) => t + g.total, 0) * 100) / 100;
  const deductRows = useMemo(() => deductionRows(groups, board.month), [groups, board.month]);

  /* สิ่งที่ควรดูก่อนส่ง — ห้องที่ยังไม่มีบิลเดือนนี้ (ยอดจะเป็นค่าห้องอย่างเดียว) · ผู้พักที่ยังไม่ผูกทะเบียน */
  const noBill = groups.flatMap((g) => g.rooms).filter((r) => !r.bill).length;
  const unlinked = groups.flatMap((g) => g.rooms).flatMap((r) => r.occupants).filter((o) => !o.stay.drivercode).length;

  const set = <K extends keyof Fill>(key: K) => (value: Fill[K]) => setFill((p) => ({ ...p, [key]: value }));
  const setSigner = (key: SignerKey, part: keyof Signer) => (value: string) =>
    setFill((p) => ({ ...p, [key]: { ...p[key], [part]: value } }));

  const picked = DOCS.filter((d) => docs[d.id]);
  function print() {
    saveSigners(fill);
    printAs(`สรุปค่าที่พักของบริษัท ${monthLabel(board.month, "full")}`);
  }

  return (
    <ModalShell
      title={`รายงานขอเบิกค่าเช่าที่พัก · ${monthLabel(board.month, "full")}`}
      subtitle={`${groups.length.toLocaleString("th-TH")} ที่พัก · ${roomCount.toLocaleString("th-TH")} ห้อง · รวม ${amount(grand)} บาท — ตัวเลขจากหน้าห้องเช่าเดือนนี้ แก้บิลที่ตารางแล้วเปิดใหม่`}
      onClose={onClose}
      width="1320px"
      tone="form"
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="btn-sec px-3.5 py-2.5 text-13 transition-colors hover:border-primary/40"
          >
            ปิด
          </button>
          <button
            type="button"
            onClick={print}
            disabled={!picked.length}
            className="btn-pri flex items-center gap-2 px-4 py-2.5 text-13 font-medium disabled:opacity-45"
          >
            <Printer size={14} strokeWidth={2} aria-hidden />
            พิมพ์ / บันทึก PDF
          </button>
        </div>
      }
    >
      <div className="flex min-h-0 flex-col lg:h-[calc(94dvh-9rem)] lg:flex-row print:block print:h-auto">
        <aside
          data-print-hide
          className="hrdoc-fields flex flex-col gap-5 border-b border-line bg-base-100 p-4 lg:w-[360px] lg:flex-none lg:overflow-y-auto lg:border-r lg:border-b-0"
        >
          <Section title="เอกสารที่จะพิมพ์">
            <div className="flex flex-col gap-1.5">
              {DOCS.map((d) => {
                const on = docs[d.id];
                return (
                  <label
                    key={d.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-field border px-3 py-2.5 transition-colors ${
                      on ? "border-primary/50 bg-soft" : "border-line hover:border-primary/40"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => setDocs((p) => ({ ...p, [d.id]: e.target.checked }))}
                      className="checkbox checkbox-sm checkbox-primary"
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-13 font-medium">{d.label}</span>
                      <span className="truncate text-11-5 text-mut">{d.hint}</span>
                    </span>
                    {d.code ? <span className="flex-none font-mono text-10-5 text-mut">{d.code}</span> : null}
                  </label>
                );
              })}
            </div>
          </Section>

          {noBill || unlinked ? (
            <div role="note" className="flex gap-2 rounded-field border border-st-wait-line bg-st-wait/60 p-3 text-12 text-st-wait-ink">
              <TriangleAlert size={14} aria-hidden className="mt-0.5 flex-none" />
              <ul className="flex flex-col gap-0.5">
                {noBill ? <li>{noBill} ห้องยังไม่มีบิลเดือนนี้ — ยอดเป็นค่าห้องตามสัญญาอย่างเดียว</li> : null}
                {unlinked ? <li>{unlinked} ผู้พักยังไม่ผูกทะเบียน — ชื่อมาจากไฟล์เดิม ไม่มีประเภทรถ</li> : null}
              </ul>
            </div>
          ) : null}

          <Section title="รอบจ่าย">
            <div className="grid grid-cols-2 gap-3">
              <DateField id="rp-pay" label="วันที่จ่าย" value={fill.payDate} onChange={set("payDate")} />
              <DateField id="rp-doc" label="วันที่จัดทำ" value={fill.docDate} onChange={set("docDate")} />
            </div>
          </Section>

          <Section title="ผู้ลงนาม">
            {SIGNER_ROWS.map(({ key, label }) => (
              <div key={key} className="grid grid-cols-2 gap-3">
                <TextField id={`rp-${key}-name`} label={label} value={fill[key].name} onChange={setSigner(key, "name")} />
                <TextField id={`rp-${key}-role`} label="ตำแหน่ง" value={fill[key].role} onChange={setSigner(key, "role")} />
              </div>
            ))}
            <p className="text-11-5 text-mut">ใบขอเบิกรายที่พักใช้ ผู้จัดทำ + ตรวจสอบ (เป็นผู้อนุมัติ) · ชื่อที่แก้จำไว้ในเครื่องนี้</p>
          </Section>
        </aside>

        <div
          data-print-area
          className="flex min-h-0 flex-1 flex-col items-center gap-6 overflow-auto bg-canvas p-6 print:block print:overflow-visible print:bg-transparent print:p-0"
        >
          {!picked.length ? (
            <p className="m-auto text-13 text-mut">เลือกเอกสารอย่างน้อยหนึ่งฉบับทางซ้าย</p>
          ) : null}
          {docs.memo ? (
            <MemoSheet
              month={board.month}
              fill={fill}
              groups={groups}
              roomCount={roomCount}
              grand={grand}
              monthTotals={monthTotals}
            />
          ) : null}
          {docs.forms ? groups.map((g) => <FormSheet key={g.apartment.id} g={g} month={board.month} fill={fill} />) : null}
          {docs.deduct ? <DeductSheet month={board.month} fill={fill} rows={deductRows} /> : null}
        </div>
      </div>
    </ModalShell>
  );
}

/* ------------------------------------------------------------------ 1. บันทึกขออนุมัติ */

function MemoSheet({
  month,
  fill,
  groups,
  roomCount,
  grand,
  monthTotals,
}: {
  month: string;
  fill: Fill;
  groups: ReportApartment[];
  roomCount: number;
  grand: number;
  monthTotals: Record<string, number | null>;
}) {
  const trend = Object.keys(monthTotals).sort();
  return (
    <Sheet>
      <header className="flex items-start justify-between">
        <MenaLogo className="h-[15mm]" />
        <div className="flex flex-col items-end gap-[2mm]">
          <span className="hrdoc-small font-bold">HR0601-02</span>
          <span className="flex gap-[6mm] text-[9.5pt]">
            <span>☐ เพื่อทราบ/ เพื่ออ้างอิง</span>
            <span>☑ เพื่ออนุมัติ</span>
          </span>
        </div>
      </header>
      <h1 className="hrdoc-title mt-[3mm]">Memo บันทึกภายใน</h1>
      <div className="mt-[3mm] grid grid-cols-[14mm_1fr] gap-y-[1mm] border-b-2 border-paper-line pb-[2mm]">
        <span>เรียน</span>
        <span>แผนกบัญชี</span>
        <span>เรื่อง</span>
        <span>
          ขออนุมัติจ่ายค่าเช่าที่พักของบริษัทประจำเดือน{" "}
          <b>
            {monthLabel(month, "full").split(" ")[0]} รอบจ่ายวันที่ {thaiLongDate(fill.payDate)}
          </b>
        </span>
      </div>

      <table className="hrdoc-table mt-[3mm] text-[9pt]">
        <thead>
          <tr>
            <th className="w-[8mm]">ลำดับ</th>
            <th>ชื่อหอพัก</th>
            <th className="w-[11mm]">จำนวนห้องพัก</th>
            <th className="w-[19mm]">จำนวนเงินทั้งหมด</th>
            <th className="w-[34mm]">ชื่อบัญชี</th>
            <th className="w-[15mm]">ธนาคาร</th>
            <th className="w-[23mm]">เลขบัญชี</th>
            <th className="w-[16mm]">วันที่จ่าย</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g, i) => (
            <tr key={g.apartment.id} className="break-inside-avoid">
              <td className="text-center">{i + 1}</td>
              <td>{g.apartment.name}</td>
              <td className="text-center">{g.rooms.length}</td>
              <td className="text-right tabular-nums">{amount(g.total)}</td>
              <td>{g.apartment.bankAccountName || "—"}</td>
              <td>{shortBank(g.apartment.bankName) || "—"}</td>
              <td className="tabular-nums">{g.apartment.bankAccountNo || "—"}</td>
              <td className="text-center whitespace-nowrap">{thaiDate(fill.payDate, "full")}</td>
            </tr>
          ))}
          <tr className="break-inside-avoid font-bold">
            <td colSpan={2} className="text-center">
              รวมทั้งสิ้น
            </td>
            <td className="text-center whitespace-nowrap">{roomCount} ห้อง</td>
            <td className="text-right tabular-nums underline">{amount(grand)}</td>
            <td colSpan={4}>{bahtText(grand)}</td>
          </tr>
        </tbody>
      </table>

      {trend.length ? (
        <table className="hrdoc-table mt-[3mm] table-fixed text-[8pt]" data-print-block>
          <tbody>
            <tr>
              <th className="w-[17mm]">เดือน</th>
              {trend.map((m) => (
                <th key={m} className={m === month ? "bg-paper-shade" : ""}>
                  {THAI_MONTHS_SHORT[Number(m.slice(5)) - 1]}
                </th>
              ))}
            </tr>
            <tr>
              <th>สรุปค่าเช่า</th>
              {trend.map((m) => (
                <td key={m} className={`text-right tabular-nums ${m === month ? "bg-paper-shade font-bold" : ""}`}>
                  {monthTotals[m] == null ? "–" : amount(monthTotals[m]!)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      ) : null}

      <div className="hrdoc-keep mt-[5mm]">
        <p className="font-bold">ผู้ที่เกี่ยวข้องลงชื่อรับทราบ</p>
        <table className="hrdoc-table text-[9pt]">
          <thead>
            <tr>
              <th className="w-[10mm]">ลำดับ</th>
              <th>รายละเอียดการตรวจสอบ</th>
              <th className="w-[42mm]">ผู้เกี่ยวข้อง</th>
              <th className="w-[48mm]">ตำแหน่ง</th>
              <th className="w-[30mm]">ลงชื่อ</th>
            </tr>
          </thead>
          <tbody>
            {SIGNER_ROWS.map(({ key, duty }, i) => (
              <tr key={key}>
                <td className="text-center align-middle">{i + 1}</td>
                <td />
                <td className="text-center">
                  <p className="font-bold">{fill[key].name}</p>
                  <p className="hrdoc-small">{duty}</p>
                </td>
                <td className="text-center align-middle">{fill[key].role}</td>
                <td className="h-[13mm]" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Sheet>
  );
}

/** `กสิกรไทย (KBANK)` → `กสิกรไทย` — ช่องธนาคารของบันทึกแคบ */
const shortBank = (name: string) => name.replace(/\s*\(.*?\)\s*/g, "").trim();

/* ------------------------------------------------------------------ 2. ใบขอเบิกรายที่พัก */

/** แพล้นท์ที่ห้องนี้ประจำ (ตามใบขอเบิกเดิม) — ห้องที่ไม่ได้ระบุใช้ลูกค้า · แพล้นท์ของผู้พักจากทะเบียน */
function planOf(r: BoardRoom): string {
  if (r.room.plant) return r.room.plant;
  const p = r.occupants.find((o) => o.person)?.person;
  return [p?.customer, p?.plant].filter(Boolean).join(" · ") || "—";
}

/** ชื่อในใบขอเบิก — คนที่พักเดือนนั้นทุกคน · เข้า/ออกกลางเดือนมีวันที่กำกับ · ไม่มีใคร = ห้องว่าง */
function namesOf(r: BoardRoom, month: string): { text: string; note: string }[] {
  if (!r.occupants.length) return [{ text: r.room.recruitRequested ? "ห้องว่าง (รอสรรหา)" : "ห้องว่าง", note: "" }];
  const end = monthEnd(month);
  return r.occupants.map((o) => {
    const notes: string[] = [];
    if (o.stay.checkIn && o.stay.checkIn > `${month}-01`) notes.push(`เข้า ${thaiDate(o.stay.checkIn)}`);
    if (o.stay.checkOut && o.stay.checkOut <= end) notes.push(`ออก ${thaiDate(o.stay.checkOut)}`);
    return { text: occupantName(o), note: notes.join(" · ") };
  });
}

function FormSheet({ g, month, fill }: { g: ReportApartment; month: string; fill: Fill }) {
  const a = g.apartment;
  const sum = (pick: (r: BoardRoom) => number) => g.rooms.reduce((t, r) => t + pick(r), 0);
  return (
    <Sheet>
      <h1 className="hrdoc-title">แบบฟอร์มขอเบิกเงินค่าเช่าบ้าน</h1>
      <p className="text-center text-[10pt]">ประจำเดือน {monthLabel(month, "full")}</p>

      <div className="mt-[4mm] grid grid-cols-[auto_1fr_auto_1fr] items-baseline gap-x-[2mm] gap-y-[1.5mm]">
        <span>ชื่อ - สกุล</span>
        <span className="border-b border-dotted border-paper-mut">{fill.preparer.name}</span>
        <span>ตำแหน่งงาน</span>
        <span className="border-b border-dotted border-paper-mut">{fill.preparer.role}</span>
      </div>
      <p className="mt-[2mm]">
        ขอเบิกเงินค่าห้องเช่า <b>{a.name}</b>
      </p>

      <dl className="mt-[2mm] grid grid-cols-[22mm_1fr_20mm_1fr] border border-paper-line text-[9.5pt] [&>dd]:border-paper-line [&>dd]:px-[2mm] [&>dd]:py-[1mm] [&>dt]:border-paper-line [&>dt]:bg-paper-shade [&>dt]:px-[2mm] [&>dt]:py-[1mm] [&>dt]:font-bold">
        <dt className="border-r border-b">ชื่อบัญชี</dt>
        <dd className="border-r border-b">{a.bankAccountName || "—"}</dd>
        <dt className="border-r border-b">ธนาคาร</dt>
        <dd className="border-b">{a.bankName || "—"}</dd>
        <dt className="border-r">เลขที่บัญชี</dt>
        <dd className="border-r tabular-nums">{a.bankAccountNo || "—"}</dd>
        <dt className="border-r">วันที่จ่าย</dt>
        <dd>{thaiDate(fill.payDate, "full")}</dd>
      </dl>

      <table className="hrdoc-table mt-[3mm] text-[9pt]">
        <thead>
          <tr>
            <th className="w-[8mm]">ลำดับ</th>
            <th className="w-[30mm]">ค่าเช่าบ้านประจำแพลน</th>
            <th className="w-[16mm]">เบอร์ห้อง</th>
            <th>ชื่อ พจส.</th>
            <th className="w-[12mm]">ประเภท</th>
            <th className="w-[16mm]">ค่าห้อง</th>
            <th className="w-[14mm]">ค่าไฟ</th>
            <th className="w-[14mm]">ค่าน้ำ</th>
            <th className="w-[14mm]">อื่น ๆ</th>
            <th className="w-[19mm]">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {g.rooms.map((r, i) => (
            <tr key={r.room.id} className="break-inside-avoid">
              <td className="text-center">{i + 1}</td>
              <td>{planOf(r)}</td>
              <td className="text-center">{r.room.roomNo}</td>
              <td>
                {namesOf(r, month).map((n) => (
                  <p key={n.text + n.note}>
                    {n.text}
                    {n.note ? <span className="hrdoc-small"> ({n.note})</span> : null}
                  </p>
                ))}
              </td>
              <td className="text-center">{vehicleClass(r.occupants.find((o) => o.person)?.person?.position) || "—"}</td>
              <td className="text-right tabular-nums">{cell(r.charge.rent)}</td>
              <td className="text-right tabular-nums">{cell(r.bill?.electric ?? 0)}</td>
              <td className="text-right tabular-nums">{cell(r.bill?.water ?? 0)}</td>
              <td className="text-right tabular-nums">{cell(r.bill?.common ?? 0)}</td>
              <td className="text-right font-bold tabular-nums">{amount(r.charge.total)}</td>
            </tr>
          ))}
          <tr className="break-inside-avoid font-bold">
            <td colSpan={5}>รวมเงินทั้งสิ้น {bahtText(g.total)}</td>
            <td className="text-right tabular-nums">{cell(sum((r) => r.charge.rent))}</td>
            <td className="text-right tabular-nums">{cell(sum((r) => r.bill?.electric ?? 0))}</td>
            <td className="text-right tabular-nums">{cell(sum((r) => r.bill?.water ?? 0))}</td>
            <td className="text-right tabular-nums">{cell(sum((r) => r.bill?.common ?? 0))}</td>
            <td className="text-right tabular-nums underline">{amount(g.total)}</td>
          </tr>
        </tbody>
      </table>

      <div className="hrdoc-keep mt-[10mm] grid grid-cols-2 gap-[10mm] text-center">
        <Signature signer={fill.preparer} duty="ผู้จัดทำ" date={fill.docDate} />
        <Signature signer={fill.checker} duty="ผู้อนุมัติ" date={fill.docDate} />
      </div>
    </Sheet>
  );
}

function Signature({ signer, duty, date }: { signer: Signer; duty: string; date: string }) {
  return (
    <div className="flex flex-col items-center gap-[1mm]">
      <span className="mb-[1mm] h-[10mm]" />
      <span>ลงชื่อ.........................................</span>
      <span>({signer.name || "......................................"})</span>
      <span>{thaiDate(date)}</span>
      <span>{duty}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ 3. สรุปยอดหัก พจส. */

interface DeductRow {
  o: BoardOccupant;
  r: BoardRoom;
  days: number;
  from: string;
  to: string;
}

/** ทุกคนที่มียอดหักเดือนนั้น เรียงตามที่พัก/ห้อง */
function deductionRows(groups: ReportApartment[], month: string): DeductRow[] {
  return groups.flatMap((g) =>
    g.rooms.flatMap((r) =>
      r.occupants
        .filter((o) => o.charge.deduct > 0)
        .map((o) => ({ o, r, ...stayRange(o.stay, month) })),
    ),
  );
}

function DeductSheet({ month, fill, rows }: { month: string; fill: Fill; rows: DeductRow[] }) {
  const total = (pick: (c: BoardOccupant["charge"]) => number) =>
    Math.round(rows.reduce((t, x) => t + pick(x.o.charge), 0) * 100) / 100;
  const monthDays = rows[0]?.r.charge.monthDays ?? Number(monthEnd(month).slice(8));
  return (
    <Sheet>
      <h1 className="hrdoc-title">สรุปยอดหักค่าที่พัก พจส.</h1>
      <p className="text-center text-[10pt]">ประจำเดือน {monthLabel(month, "full")}</p>
      <p className="hrdoc-small mt-[2mm] text-paper-mut">
        น้ำ ไฟ ส่วนกลาง พจส. จ่ายเองทุกรูปแบบ · ห้องที่เปลี่ยนผู้พักกลางเดือนหารตามวันที่พักจริง (วันย้ายออกไม่นับ
        ผู้ที่ย้ายเข้าวันเดียวกันเริ่มนับวันนั้น) จากจำนวนวันของเดือน {monthDays} วัน · ปัดเป็นบาท ผลรวมเท่ายอดบิล
      </p>

      {rows.length ? (
        <table className="hrdoc-table mt-[3mm] text-[8.5pt]">
          <thead>
            <tr>
              <th className="w-[8mm]">ลำดับ</th>
              <th className="w-[15mm]">รหัส</th>
              <th className="w-[32mm]">ชื่อ พจส.</th>
              <th>ที่พัก · ห้อง</th>
              <th className="w-[17mm]">วันที่พัก</th>
              <th className="w-[13mm]">ค่าห้อง</th>
              <th className="w-[12mm]">ค่าไฟ</th>
              <th className="w-[12mm]">ค่าน้ำ</th>
              <th className="w-[12mm]">อื่น ๆ</th>
              <th className="w-[15mm]">รวมหัก</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x, i) => {
              const c = x.o.charge;
              const partial = x.days < x.r.charge.monthDays;
              return (
                <tr key={x.o.stay.id} className="break-inside-avoid">
                  <td className="text-center">{i + 1}</td>
                  <td className="tabular-nums">{x.o.stay.drivercode || "—"}</td>
                  <td>{occupantName(x.o)}</td>
                  <td>
                    {x.r.apartment.name} · {x.r.room.roomNo}
                  </td>
                  <td className="text-center">
                    {partial ? (
                      <>
                        {x.days}/{x.r.charge.monthDays}
                        <span className="hrdoc-small block">
                          {Number(x.from.slice(8))}–{Number(x.to.slice(8))} {THAI_MONTHS_SHORT[Number(month.slice(5)) - 1]}
                        </span>
                      </>
                    ) : (
                      "ทั้งเดือน"
                    )}
                  </td>
                  <td className="text-right tabular-nums">{cell(c.rent)}</td>
                  <td className="text-right tabular-nums">{cell(c.electric)}</td>
                  <td className="text-right tabular-nums">{cell(c.water)}</td>
                  <td className="text-right tabular-nums">{cell(c.common)}</td>
                  <td className="text-right font-bold tabular-nums">{amount(c.deduct)}</td>
                </tr>
              );
            })}
            <tr className="break-inside-avoid font-bold">
              <td colSpan={5} className="text-center">
                รวม {rows.length} คน
              </td>
              <td className="text-right tabular-nums">{cell(total((c) => c.rent))}</td>
              <td className="text-right tabular-nums">{cell(total((c) => c.electric))}</td>
              <td className="text-right tabular-nums">{cell(total((c) => c.water))}</td>
              <td className="text-right tabular-nums">{cell(total((c) => c.common))}</td>
              <td className="text-right tabular-nums underline">{amount(total((c) => c.deduct))}</td>
            </tr>
          </tbody>
        </table>
      ) : (
        <p className="mt-[6mm] text-center text-paper-mut">ไม่มียอดหัก พจส. ในเดือนนี้</p>
      )}

      <div className="hrdoc-keep mt-[10mm] grid grid-cols-2 gap-[10mm] text-center">
        <Signature signer={fill.preparer} duty="ผู้จัดทำ" date={fill.docDate} />
        <Signature signer={fill.checker} duty="ผู้ตรวจสอบ" date={fill.docDate} />
      </div>
    </Sheet>
  );
}
