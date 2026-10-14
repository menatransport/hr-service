"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Download,
  Eye,
  Filter,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { DataError } from "@/components/ui/data-error";
import {
  DateField,
  NumberField,
  SearchField,
  SelectField,
  TextareaField,
  TextField,
} from "@/components/ui/field";
import { Mascot, MascotLoader } from "@/components/ui/mascot";
import { ModalShell } from "@/components/ui/modal-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import { SegmentedControl } from "@/components/ui/summary-panel";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  alertError,
  alertSuccess,
  confirm,
  runAction,
  toastError,
  toastInfo,
  toastSuccess,
  toastWelcome,
} from "@/lib/swal";
import type { CaseStatus } from "@/lib/types";

/* ทุกอย่างในหน้านี้เป็นข้อมูลตัวอย่าง — ห้ามต่อ API จริง (หน้านี้เปิดสาธารณะ) */
const ROWS: { no: string; name: string; dept: string; topic: string; status: CaseStatus }[] = [
  { no: "REQ-0148", name: "สมชาย ใจดี", dept: "ขนส่ง · ลาดกระบัง", topic: "ขอหนังสือรับรองเงินเดือน", status: "open" },
  { no: "REQ-0147", name: "วิไลวรรณ ศรีสุข", dept: "บัญชี", topic: "ขอเปลี่ยนบัญชีรับเงินเดือน", status: "pending_review" },
  { no: "REQ-0146", name: "ประเสริฐ มั่นคง", dept: "พจส. · สระบุรี", topic: "ร้องเรียนตารางกะทำงาน", status: "assigned" },
  { no: "REQ-0145", name: "อรุณี แก้วตา", dept: "ทรัพยากรบุคคล", topic: "ขอสรรหาพนักงานขับรถ", status: "ready_to_close" },
  { no: "REQ-0144", name: "ธนพล วงศ์ใหญ่", dept: "ซ่อมบำรุง", topic: "ขอลาพักร้อนเกินสิทธิ์", status: "closed" },
];

const SECTIONS = [
  ["buttons", "ปุ่ม"],
  ["chips", "ป้ายสถานะ"],
  ["form", "ฟอร์ม"],
  ["table", "ตาราง"],
  ["feedback", "แจ้งเตือน"],
  ["states", "หน้าว่าง · โหลด"],
] as const;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function KitView() {
  return (
    <div className="page-canvas flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 flex h-14 flex-none items-center gap-3 border-b border-line bg-base-100/90 px-4 backdrop-blur-md">
        <span aria-hidden className="shell-accent absolute inset-x-0 top-0 h-[3px]" />
        <Mascot size={34} motion="none" />
        <span className="flex flex-col leading-none">
          <span className="text-14-5 font-semibold">HR Service · UI Kit</span>
          <span className="mt-0.5 text-10-5 tracking-[0.08em] text-mut">แม่แบบระบบใหม่</span>
        </span>
        <nav aria-label="ส่วนของหน้า" className="ml-6 hidden gap-1 lg:flex">
          {SECTIONS.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="btn-ghost px-3 py-1.5 text-12-5 text-ink hover:text-primary"
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Link href="/home" className="btn-sec px-3.5 py-1.5 text-12-5">
            เข้าระบบ HR
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 pb-20 sm:px-6">
        <Hero />
        <Buttons />
        <Chips />
        <FormDemo />
        <TableDemo />
        <Feedback />
        <States />
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ ส่วนประกอบ */

function Section({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-20 rounded-[24px] border border-line bg-base-100 p-5 elev-card sm:p-7"
    >
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-18 font-semibold">{title}</h2>
        {note ? <code className="font-mono text-11-5 text-mut">{note}</code> : null}
      </div>
      {children}
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2.5 text-11 font-semibold tracking-[0.06em] text-mut">{children}</p>
  );
}

function Hero() {
  return (
    <div className="shell-hero relative mt-6 overflow-hidden rounded-[28px] px-6 py-9 text-white sm:px-10">
      <span aria-hidden className="shell-orb absolute -top-28 -right-24 size-64 sm:size-72" />
      <div className="relative flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-13 opacity-90">Design system · แม่แบบระบบใหม่</p>
          <h1 className="mt-1 text-34 leading-tight font-bold sm:text-44">
            HR Service <span className="text-[#fcd38d]">UI Kit</span>
          </h1>
          <p className="mt-2 max-w-[56ch] text-14 leading-relaxed opacity-90 text-pretty">
            ปุ่ม · ป้ายสถานะ · ฟอร์ม · ตาราง · แจ้งเตือน · Dialog — หน้าจอใหม่ทุกหน้าหยิบจากที่นี่
            ไม่เขียนสีหรือเงาเอง
          </p>
        </div>
        <Mascot size={120} bubble="สวัสดีค่ะ! น้องมีนามาช่วยงาน HR แล้ว" label="น้องมีนา" />
      </div>
    </div>
  );
}

function Buttons() {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    await wait(1600);
    setBusy(false);
  };

  return (
    <Section id="buttons" title="ปุ่ม" note="btn-pri · btn-sec · btn-soft · btn-ghost · btn-danger">
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <Label>ชนิด — งานหลักใช้ btn-pri หนึ่งปุ่มต่อหนึ่งบริเวณ</Label>
          <div className="flex flex-wrap items-center gap-2.5">
            <button type="button" className="btn-pri px-5 py-2.5 text-13 font-medium">บันทึก</button>
            <button type="button" className="btn-sec px-5 py-2.5 text-13">ยกเลิก</button>
            <button type="button" className="btn-soft px-5 py-2.5 text-13 font-medium">บันทึกร่าง</button>
            <button type="button" className="btn-ghost px-4 py-2.5 text-13 font-medium">ดูทั้งหมด</button>
            <button type="button" className="btn-danger px-5 py-2.5 text-13 font-medium">ลบคำร้อง</button>
          </div>

          <Label>
            <span className="mt-5 block">สถานะ</span>
          </Label>
          <div className="flex flex-wrap items-center gap-2.5">
            <button type="button" disabled className="btn-pri px-5 py-2.5 text-13 font-medium disabled:opacity-45">
              ปิดใช้งาน
            </button>
            <button
              type="button"
              onClick={run}
              disabled={busy}
              aria-busy={busy}
              className="btn-pri flex items-center gap-2 px-5 py-2.5 text-13 font-medium disabled:opacity-80"
            >
              {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : null}
              {busy ? "กำลังบันทึก…" : "กดเพื่อดูสถานะโหลด"}
            </button>
          </div>
        </div>

        <div>
          <Label>ขนาด · ไอคอน</Label>
          <div className="flex flex-wrap items-center gap-2.5">
            <button type="button" className="btn-pri px-3.5 py-1.5 text-12-5 font-medium">เล็ก</button>
            <button type="button" className="btn-pri px-5 py-2.5 text-13 font-medium">กลาง</button>
            <button type="button" className="btn-pri px-6 py-3 text-14 font-medium">ใหญ่</button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <button type="button" className="btn-pri flex items-center gap-1.5 px-4 py-2.5 text-13 font-medium">
              <Plus size={16} aria-hidden />
              สร้างคำร้อง
            </button>
            <button type="button" className="btn-sec flex items-center gap-1.5 px-4 py-2.5 text-13">
              <Download size={16} aria-hidden />
              ส่งออก Excel
            </button>
            <button type="button" className="btn-ghost flex items-center gap-1.5 px-3.5 py-2.5 text-13 font-medium">
              ดูรายละเอียด
              <ArrowRight size={16} aria-hidden />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" aria-label="แก้ไข" className="btn-sec grid size-10 place-items-center">
              <Pencil size={16} aria-hidden />
            </button>
            <button type="button" aria-label="ดู" className="btn-soft grid size-10 place-items-center">
              <Eye size={16} aria-hidden />
            </button>
            <button type="button" aria-label="ตัวกรอง" className="btn-ghost grid size-10 place-items-center">
              <Filter size={16} aria-hidden />
            </button>
            <button type="button" aria-label="ลบ" className="btn-danger grid size-10 place-items-center">
              <Trash2 size={16} aria-hidden />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2.5 rounded-[18px] border border-line bg-base-200/60 px-4 py-3.5">
        <span className="text-12-5 text-mut">ท้ายฟอร์ม — primary ขวาสุดเสมอ</span>
        <span className="flex-1" />
        <button type="button" className="btn-sec px-4 py-2 text-13">ยกเลิก</button>
        <button type="button" className="btn-soft px-4 py-2 text-13 font-medium">บันทึกร่าง</button>
        <button type="button" className="btn-pri px-5 py-2 text-13 font-medium">ส่งคำขอ</button>
      </div>
    </Section>
  );
}

function Chips() {
  const statuses: CaseStatus[] = ["open", "assigned", "pending_review", "ready_to_close", "closed"];
  return (
    <Section id="chips" title="ป้ายสถานะ" note="chip + chip-{new,wait,live,done,alert,on} · <StatusBadge>">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="chip chip-new">เปิดคำร้อง</span>
        <span className="chip chip-wait">รออนุมัติ</span>
        <span className="chip chip-live">กำลังดำเนินการ</span>
        <span className="chip chip-done">ปิดแล้ว</span>
        <span className="chip chip-alert">ไม่อนุมัติ</span>
        <span className="chip chip-on">ด่วนที่สุด</span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        {statuses.map((s) => (
          <StatusBadge key={s} status={s} />
        ))}
      </div>
    </Section>
  );
}

function FormDemo() {
  const [name, setName] = useState("");
  const [dept, setDept] = useState("ldk");
  const [date, setDate] = useState("");
  const [qty, setQty] = useState<number | null>(3);
  const [why, setWhy] = useState("");
  const [kind, setKind] = useState<"perm" | "contract" | "replace">("perm");

  return (
    <Section id="form" title="ฟอร์ม" note="components/ui/field.tsx">
      <div className="overflow-hidden rounded-[18px] border border-line">
        <div className="flex items-center gap-2.5 border-y border-line bg-soft/60 px-5 py-2.5 text-14 font-semibold">
          <span className="grid size-6 place-items-center rounded-full tile-teal text-12">1</span>
          ข้อมูลตำแหน่งที่ขอ
        </div>
        <div className="grid gap-x-5 gap-y-4 p-5 sm:grid-cols-2">
          <TextField
            id="kit-name"
            label="ชื่อผู้ขอ"
            value={name}
            onChange={setName}
            placeholder="ชื่อ-นามสกุล"
            hint="ใช้ชื่อตามบัตรพนักงาน"
          />
          <SelectField
            id="kit-dept"
            label="หน่วยงาน"
            value={dept}
            onChange={setDept}
            options={[
              { value: "ldk", label: "ขนส่ง · ลาดกระบัง" },
              { value: "srb", label: "ขนส่ง · สระบุรี" },
              { value: "hr", label: "ทรัพยากรบุคคล" },
              { value: "acc", label: "บัญชีและการเงิน" },
            ]}
          />
          <NumberField id="kit-qty" label="จำนวนอัตรา" value={qty} onChange={setQty} />
          <DateField id="kit-date" label="วันที่ต้องการให้เริ่มงาน" value={date} onChange={setDate} />
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-13 font-medium">ประเภทการจ้าง</span>
            <SegmentedControl
              label="ประเภทการจ้าง"
              value={kind}
              onChange={setKind}
              options={[
                { value: "perm", label: "พนักงานประจำ" },
                { value: "contract", label: "สัญญาจ้าง" },
                { value: "replace", label: "ทดแทนตำแหน่ง" },
              ]}
            />
          </div>
          <div className="sm:col-span-2">
            <TextareaField
              id="kit-why"
              label="เหตุผลการขอ"
              optional
              value={why}
              onChange={setWhy}
              placeholder="อธิบายสั้น ๆ ว่าทำไมต้องเพิ่มคน"
            />
          </div>
          <TextField id="kit-ro" label="รหัสพนักงาน (อ่านอย่างเดียว)" value="EMP-004512" readOnly optional />
        </div>
        <div className="flex flex-wrap items-center gap-2.5 border-t border-line bg-base-200/60 px-5 py-3.5">
          <span className="text-12-5 text-mut">บันทึกร่างอัตโนมัติ</span>
          <span className="flex-1" />
          <button type="button" className="btn-sec px-4 py-2 text-13">ยกเลิก</button>
          <button type="button" className="btn-pri px-5 py-2 text-13 font-medium">ส่งคำขอ</button>
        </div>
      </div>
    </Section>
  );
}

function TableDemo() {
  const [q, setQ] = useState("");
  const rows = ROWS.filter((r) => !q || `${r.no} ${r.name} ${r.topic}`.includes(q.trim()));

  return (
    <Section id="table" title="ตาราง" note="หัว bg-head (ทึบ · sticky) · แถว hover bg-base-200/50">
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <SearchField value={q} onChange={setQ} label="ค้นหา" placeholder="ค้นหาชื่อ / เลขที่คำร้อง" className="w-full sm:w-72" />
        <span className="flex-1" />
        <button type="button" className="btn-sec flex items-center gap-1.5 px-3.5 py-2 text-13">
          <Download size={15} aria-hidden />
          ส่งออก
        </button>
        <button type="button" className="btn-pri flex items-center gap-1.5 px-4 py-2 text-13 font-medium">
          <Plus size={15} aria-hidden />
          สร้างคำร้อง
        </button>
      </div>
      <div className="overflow-hidden rounded-[18px] border border-line">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-0 text-13">
            <thead>
              <tr className="bg-head">
                {["เลขที่", "พนักงาน", "เรื่อง", "สถานะ", ""].map((h, i) => (
                  <th
                    key={i}
                    scope="col"
                    className="sticky top-0 border-b border-line-strong bg-head px-4 py-3 text-left text-12-5 font-semibold text-ink"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.no} className="transition-colors hover:bg-base-200/50">
                  <td className="border-b border-line px-4 py-3 font-mono text-12">{r.no}</td>
                  <td className="border-b border-line px-4 py-3">
                    <span className="block font-medium">{r.name}</span>
                    <span className="block text-12 text-mut">{r.dept}</span>
                  </td>
                  <td className="border-b border-line px-4 py-3">{r.topic}</td>
                  <td className="border-b border-line px-4 py-3">
                    <StatusBadge status={r.status} short />
                  </td>
                  <td className="border-b border-line px-4 py-3 text-right">
                    <button type="button" aria-label={`ดู ${r.no}`} className="btn-ghost inline-grid size-9 place-items-center text-mut">
                      <Eye size={16} aria-hidden />
                    </button>
                    <button type="button" aria-label={`เพิ่มเติม ${r.no}`} className="btn-ghost inline-grid size-9 place-items-center text-mut">
                      <MoreHorizontal size={16} aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? (
          <EmptyState
            title="ไม่มีคำร้องที่ตรงกับเงื่อนไข"
            bubble="ไม่เจอเลย ลองล้างตัวกรองดูนะ"
            hint="ลองล้างตัวกรองหรือเปลี่ยนคำค้นหา"
            onClear={() => setQ("")}
          />
        ) : null}
      </div>
    </Section>
  );
}

function Feedback() {
  const [modal, setModal] = useState(false);

  return (
    <Section id="feedback" title="แจ้งเตือน · Dialog" note="lib/swal.ts · ModalShell — กดลองได้">
      <div className="grid gap-6 lg:grid-cols-3">
        <div>
          <Label>TOAST — มุมบน หายเอง</Label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-sec px-3.5 py-2 text-13" onClick={() => toastSuccess("บันทึกเรียบร้อย", "ส่งให้ผู้อนุมัติแล้ว")}>สำเร็จ</button>
            <button type="button" className="btn-sec px-3.5 py-2 text-13" onClick={() => toastError("ส่งไม่สำเร็จ", "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้")}>ผิดพลาด</button>
            <button type="button" className="btn-sec px-3.5 py-2 text-13" onClick={() => toastInfo("มีผู้รับเรื่องแล้ว")}>ข้อมูล</button>
            <button type="button" className="btn-sec px-3.5 py-2 text-13" onClick={() => toastWelcome("ยินดีต้อนรับ คุณกิตติ!", "น้องมีนาพร้อมช่วยงาน HR แล้วค่ะ")}>ต้อนรับ</button>
          </div>
        </div>
        <div>
          <Label>กล่องกลางจอ</Label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-sec px-3.5 py-2 text-13" onClick={() => alertSuccess("ส่งคำขอเรียบร้อย!", "จะแจ้งผลทางกระดิ่งนะคะ")}>สำเร็จ (มาสคอต)</button>
            <button type="button" className="btn-sec px-3.5 py-2 text-13" onClick={() => alertError("บันทึกไม่สำเร็จ", "ลองใหม่อีกครั้ง")}>ล้มเหลว</button>
            <button type="button" className="btn-sec px-3.5 py-2 text-13" onClick={() => confirm({ title: "ยืนยันการส่งคำขอ?", text: "ส่งแล้วแก้ไขไม่ได้จนกว่าจะถูกตีกลับ" })}>ยืนยัน</button>
            <button type="button" className="btn-sec px-3.5 py-2 text-13" onClick={() => confirm({ title: "ลบคำร้องนี้?", text: "ลบแล้วกู้คืนไม่ได้", tone: "danger", confirmText: "ลบคำร้อง" })}>ยืนยันลบ</button>
          </div>
        </div>
        <div>
          <Label>ท่ามาตรฐาน · Modal</Label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-pri px-4 py-2 text-13 font-medium"
              onClick={() =>
                runAction({
                  confirm: { title: "ปิดคำร้องนี้?", text: "ปิดแล้วจะแก้ไขแผนไม่ได้อีก", tone: "warn" },
                  pending: "กำลังปิดคำร้อง…",
                  success: "ปิดคำร้องเรียบร้อย",
                  run: () => wait(1200),
                })
              }
            >
              runAction
            </button>
            <button type="button" className="btn-soft px-4 py-2 text-13 font-medium" onClick={() => setModal(true)}>
              เปิด Modal
            </button>
          </div>
        </div>
      </div>

      {modal ? (
        <ModalShell
          title="แก้ไขข้อมูลพนักงาน"
          subtitle="EMP-004512 · ตัวอย่าง"
          tone="plain"
          width="640px"
          onClose={() => setModal(false)}
          footer={
            <>
              <button type="button" className="btn-sec px-4 py-2 text-13" onClick={() => setModal(false)}>ยกเลิก</button>
              <button type="button" className="btn-pri px-5 py-2 text-13 font-medium" onClick={() => setModal(false)}>บันทึกการแก้ไข</button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="kit-m-tel" label="เบอร์โทรศัพท์" type="tel" placeholder="08x-xxx-xxxx" />
            <TextField id="kit-m-mail" label="อีเมล" type="email" optional placeholder="name@menatransport.co.th" />
          </div>
        </ModalShell>
      ) : null}
    </Section>
  );
}

function States() {
  return (
    <Section id="states" title="หน้าว่าง · โหลด · ผิดพลาด" note="<EmptyState> · <MascotLoader> · <DataError>">
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-[18px] border border-line">
          <EmptyState
            title="ยังไม่มีบันทึกเคส"
            bubble="เริ่มบันทึกเรื่องแรกกันเลย!"
            hint="กด “บันทึกเคสใหม่” เพื่อบันทึกเรื่องแรกเข้าระบบ"
          />
        </div>
        <div className="grid min-h-72 place-items-center rounded-[18px] border border-line">
          <MascotLoader text="กำลังโหลดข้อมูล" />
        </div>
        <DataError message="เชื่อมต่อระบบ NCAC ไม่ได้ในตอนนี้ (ตัวอย่าง)" />
      </div>
    </Section>
  );
}
