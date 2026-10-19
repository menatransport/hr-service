/* eslint-disable react/no-unescaped-entities -- โค้ดเดิมจาก mena-partner-driver ย้ายมาโดยไม่แก้ตรรกะ (scripts/partner-codemod/lint-legacy-disable.mjs) */
"use client"

import Link from "next/link"
import { BookOpenCheck, Printer } from "lucide-react"

/**
 * SOP + WI การทำเงินเดือนรถร่วม Mixer รายเดือน — เอกสารมีชีวิตคู่ระบบ
 * หลักการ: เดือนในระบบ = เดือนงวดงาน (เช่น งวดงาน มิ.ย. จ่ายต้น ก.ค. → เลือกเดือน "มิถุนายน")
 */

const STEPS: {
  no: number; title: string; owner: string; when: string; link?: { href: string; label: string }
  wi: string[]; check: string[]; warn?: string
}[] = [
  {
    no: 1, title: "อัปโหลดวันทำงาน พจร.", owner: "ธุรการแผนกรถร่วม", when: "D+1 หลังสิ้นเดือน",
    link: { href: "/partner/attendance", label: "/partner/attendance" },
    wi: [
      "รับไฟล์ Excel \"สถานะทำเงินเดือนพจส.และสถานะวันทำงานพจร\" จากแผนกปฏิบัติการ",
      "เข้าเมนู วันทำงาน พจร. → เลือกเดือน (เดือนงวดงาน) → อัปโหลดไฟล์ทั้งไฟล์ ระบบหาชีต/หัวตารางเอง",
      "ตรวจ preview: จำนวนคน, วันรวม, เบี้ย 5 ตัว (วินัย/โซน/ฝีมือ/ขยัน/เช่าบ้าน) และช่อง \"สูตร\" ได้/ไม่ได้",
      "กดยืนยัน — ระบบแทนที่ข้อมูลทั้งเดือน (อัปซ้ำได้ถ้าไฟล์แก้)",
    ],
    check: ["จำนวน พจร. ≈ งวดก่อน (±5)", "คำเตือนยอดรวมไม่ตรง (ถ้ามี) ต้องเคลียร์ก่อนยืนยัน"],
  },
  {
    no: 2, title: "ดึงค่าเที่ยว + กระทบยอดน้ำมัน", owner: "ธุรการแผนกรถร่วม", when: "D+1 ถึง D+3",
    link: { href: "/partner/trip-fuel", label: "/partner/trip-fuel" },
    wi: [
      "รับไฟล์ \"ค่าเที่ยว Mixer พจร. MM.YY\" จากปฏิบัติการ (มีชีตสรุปค่าเที่ยว + รายละเอียดเชื้อเพลิง)",
      "เข้าเมนู ค่าเที่ยว & เชื้อเพลิง → เลือกเดือน → กด \"อัปโหลดไฟล์ค่าเที่ยว\" — ระบบอ่านชีตสรุปค่าเที่ยวเอง",
      "ตรวจ preview: จำนวนคน/เที่ยว, Σค่าเที่ยว, Σหักน้ำมัน (เกินเรต/คืนต่ำกว่าเรต) และรายชื่อที่จับคู่สัญญาไม่ได้",
      "กดยืนยัน — แทนที่ข้อมูลทั้งเดือน (ไฟล์ = แหล่งจริง อัปซ้ำได้เมื่อไฟล์แก้)",
    ],
    check: ["Σ ค่าเที่ยว/น้ำมัน ตรงไฟล์ 100%", "จับคู่สัญญาไม่ได้ = 0 (ถ้ามี → แก้ชื่อในข้อมูลหลักก่อน)"],
    warn: "ห้ามลืม: เดือนที่เลือก = เดือนงวดงาน ไม่ใช่เดือนที่จ่ายเงิน",
  },
  {
    no: 3, title: "บันทึกรับ-หักอื่นๆ", owner: "ธุรการ + การเงิน", when: "D+2 ถึง D+4",
    link: { href: "/partner/payroll-extras", label: "/partner/payroll-extras" },
    wi: [
      "รวบรวมรายการเดือนนี้: OT ลูกค้า, ค่ารถสะอาด/สกปรก, ครูฝึก, ค่าน้ำ-ไฟ, เบิกฉุกเฉิน ฯลฯ",
      "พิมพ์เพิ่มทีละรายการ หรือวางจาก Excel (คอลัมน์ อ้างอิง + จำนวนเงิน) — ระบบจับคู่ สัญญา > ทะเบียน > ชื่อ",
      "ตรวจธง หัก ณ ที่จ่าย (WHT) ของแต่ละรายการตามประเภท",
    ],
    check: ["ยอดรวมรับอื่น/หักอื่น ตรงกับเอกสารแนบ", "รายการจับคู่ไม่ได้ = 0"],
  },
  {
    no: 4, title: "ตรวจหนี้/เงินสะสม (ledger)", owner: "การเงิน", when: "D+3 ถึง D+4",
    link: { href: "/partner/driver-ledger", label: "/partner/driver-ledger" },
    wi: [
      "เช็ครายการหนี้ใหม่เดือนนี้ (ใบรับสภาพหนี้/เงินดาวน์/ค่างวด) ตั้งเข้า ledger ให้ครบ",
      "คนที่ขอพัก/ข้ามงวด → กดข้ามเป็นรายเดือนพร้อมเหตุผล",
      "ตรวจไม่ให้รายการซ้ำซ้อนกับช่องหักอัตโนมัติ (ภาษี-ประกัน/ผ่อนซ่อมในสัญญา) — หนึ่งหนี้อยู่ที่เดียวเท่านั้น",
    ],
    check: ["ไม่มีหนี้ตั้งซ้ำ 2 ที่ (เสี่ยงหักคู่)", "ยอดหักต่องวดของทุกรายการถูกต้อง"],
  },
  {
    no: 5, title: "สร้างงวดเงินเดือน", owner: "ธุรการแผนกรถร่วม", when: "D+4",
    link: { href: "/partner/payroll", label: "/partner/payroll" },
    wi: [
      "เมนู เงินเดือน → เลือกเดือน → กด \"สร้างงวดอัตโนมัติ\" (engine คำนวณทุกคนจากข้อมูลขั้น 1-4)",
      "ระบบดึง: ค่าเที่ยว, น้ำมัน (หัก/เกินเรต/คืนต่ำกว่าเรต), วันทำงาน+เบี้ย, รับ-หักอื่น, ภาษีประกัน, ค่างวด, ledger, หนี้ยกมา",
      "คนที่สร้างแล้วจะไม่ถูกสร้างซ้ำ — แก้รายคนได้ในหน้ารายละเอียด",
    ],
    check: ["จำนวนใบ = จำนวน พขร. ที่ active", "สุ่มเทียบสลิป 3-5 คนกับเอกสารต้นทาง"],
  },
  {
    no: 6, title: "ตรวจสอบ + ส่งอนุมัติ", owner: "แผนกรถร่วม → การเงิน", when: "D+5",
    wi: [
      "เปิดหน้า สรุปงวดเพื่ออนุมัติ (ปุ่มในหน้าเงินเดือนของเดือน) — ดูการ์ดรวม, รายการผิดปกติ, หนี้ยกไป",
      "แผนกรถร่วมตรวจครบ → กด \"ตรวจข้อมูลเสร็จ\"",
      "การเงินตรวจยอดจ่าย/WHT → กด \"ส่งผู้บริหารอนุมัติ\"",
      "พบปัญหา → \"ตีกลับแก้ไข\" พร้อมเหตุผล (ระบบบันทึกประวัติทุกครั้ง)",
    ],
    check: ["รายการผิดปกติ = 0 หรือมีคำอธิบายครบ", "ยอดจ่ายจริงรวม = ยอดที่การเงินเตรียมโอน"],
  },
  {
    no: 7, title: "ผู้บริหารอนุมัติ (C-level)", owner: "ผู้บริหาร", when: "D+6",
    wi: [
      "เปิดหน้าสรุปงวด (มือถือได้) — เห็นยอดรวม, MoM, ต่อแพล้นท์, Top 10, ผิดปกติ, หนี้-เงินสะสมทั้ง fleet",
      "กด \"อนุมัติจ่ายงวดนี้\" — ระบบตัดยอด ledger อัตโนมัติ + บันทึกผู้อนุมัติ/เวลา",
      "ไม่ผ่าน → ตีกลับพร้อมเหตุผล กลับไปขั้น 1-5 แก้แล้วเดินใหม่",
    ],
    check: ["ยอดจ่ายจริง + หนี้ยกไป สมเหตุผลเทียบเดือนก่อน"],
  },
  {
    no: 8, title: "จ่ายเงิน + แจกสลิป + ปิดงวด", owner: "การเงิน", when: "D+7",
    wi: [
      "โอนเงินตามยอด \"จ่ายจริง\" รายคน",
      "พิมพ์สลิปทั้งงวด (ปุ่มในหน้าเงินเดือน/หน้าอนุมัติ) แจก พจร.",
      "จ่ายเสร็จ → กด \"ล็อคปิดงวด\" — หลังล็อคแก้ไม่ได้ (ปลดล็อคเฉพาะแอดมิน มีบันทึก)",
    ],
    check: ["ยอดโอนจริง = ยอดจ่ายจริงในระบบ", "งวดขึ้นสถานะ ปิดงวด"],
  },
]

const RACI = [
  ["อัปโหลดวันทำงาน / ค่าเที่ยว / รับ-หักอื่น", "ธุรการรถร่วม", "หน.แผนกรถร่วม", "การเงิน", "-"],
  ["หนี้/เงินสะสม (ledger)", "การเงิน", "หน.การเงิน", "แผนกรถร่วม", "-"],
  ["สร้างงวด + ตรวจ", "ธุรการรถร่วม", "หน.แผนกรถร่วม", "-", "การเงิน"],
  ["ส่งอนุมัติ", "การเงิน", "หน.การเงิน", "-", "ผู้บริหาร"],
  ["อนุมัติจ่าย", "ผู้บริหาร", "ผู้บริหาร", "การเงิน", "ทุกแผนก"],
  ["จ่าย + ปิดงวด", "การเงิน", "หน.การเงิน", "-", "แผนกรถร่วม"],
]

export default function PayrollSopPage() {
  return (
    <div className="max-w-4xl space-y-6 print:text-[13px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BookOpenCheck className="w-5 h-5 text-blue-600" />
            SOP / WI — เงินเดือนรถร่วม Mixer รายเดือน
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            เอกสารเลขที่ SOP-PR-001 · ใช้กับระบบ MENA Partner · ปรับปรุงตามระบบเสมอ (เอกสารมีชีวิต)
          </p>
        </div>
        <button onClick={() => window.print()}
          className="print:hidden flex items-center gap-2 border border-zinc-200 text-zinc-600 hover:bg-zinc-50 text-sm px-3 py-2 rounded-lg shrink-0">
          <Printer className="w-4 h-4" /> พิมพ์
        </button>
      </div>

      {/* หลักการ */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-900 space-y-1">
        <p className="font-semibold">หลักการสำคัญ</p>
        <ul className="list-disc ml-5 space-y-0.5 text-[13px]">
          <li><b>เดือนในระบบ = เดือนงวดงาน</b> — งวดงาน มิ.ย. (จ่ายต้น ก.ค.) ให้เลือกเดือน "มิถุนายน" ทุกเมนู</li>
          <li>สูตรคำนวณมีตัวเดียว (engine กลาง) — สลิป หน้าแก้ไข และหน้าอนุมัติ เห็นเลขเดียวกันเสมอ</li>
          <li>หนี้หนึ่งก้อนอยู่ที่เดียว: ledger <b>หรือ</b> ช่องหักในสัญญา ห้ามตั้งคู่ (ระบบจะหักซ้ำ)</li>
          <li>เงินเดือนติดลบ → ระบบยกหนี้ไปงวดหน้าให้อัตโนมัติ (แสดงในสลิป หนี้ยกมา/ยกไป)</li>
          <li><b>อนุมัติแล้ว = ล็อคทันที และล็อคย้อนหลังทุกงวดก่อนหน้าอัตโนมัติ</b> (โซ่หนี้ยกยอด) — แก้ย้อนหลังต้องปลดล็อคจากงวดล่าสุดไล่ลงมา</li>
          <li>ทุกการเปลี่ยนสถานะงวดถูกบันทึก ใคร-เมื่อไหร่-เหตุผล ตรวจย้อนหลังได้</li>
        </ul>
      </div>

      {/* ปฏิทินงวด */}
      <div className="bg-white border border-zinc-100 rounded-xl p-4">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">ปฏิทินการปิดงวด (D = วันสิ้นเดือนงวดงาน)</h2>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {STEPS.map((s) => (
            <span key={s.no} className="px-2 py-1 rounded-full bg-zinc-50 border border-zinc-200 text-zinc-600">
              {s.when} · {s.title}
            </span>
          ))}
        </div>
      </div>

      {/* WI รายขั้น */}
      {STEPS.map((s) => (
        <div key={s.no} className="bg-white border border-zinc-100 rounded-xl p-5 break-inside-avoid">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="w-7 h-7 rounded-full bg-zinc-900 text-white text-sm font-bold flex items-center justify-center shrink-0">{s.no}</span>
            <h2 className="font-semibold">{s.title}</h2>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">{s.owner}</span>
            <span className="text-[11px] text-zinc-400">{s.when}</span>
            {s.link && (
              <Link href={s.link.href} className="print:hidden ml-auto text-xs text-blue-600 hover:underline">{s.link.label} →</Link>
            )}
          </div>
          <ol className="list-decimal ml-6 space-y-1 text-[13px] text-zinc-700">
            {s.wi.map((w, i) => <li key={i}>{w}</li>)}
          </ol>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {s.check.map((c, i) => (
              <span key={i} className="text-[11px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">✓ เช็คพอยต์: {c}</span>
            ))}
          </div>
          {s.warn && <p className="mt-2 text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5">⚠ {s.warn}</p>}
        </div>
      ))}

      {/* RACI */}
      <div className="bg-white border border-zinc-100 rounded-xl p-5 break-inside-avoid">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">RACI</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-400 border-b border-zinc-100">
                <th className="text-left py-1.5 font-medium">งาน</th>
                <th className="text-left font-medium">R ผู้ทำ</th>
                <th className="text-left font-medium">A ผู้รับผิดชอบ</th>
                <th className="text-left font-medium">C ปรึกษา</th>
                <th className="text-left font-medium">I รับทราบ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {RACI.map((r, i) => (
                <tr key={i}>{r.map((c, j) => <td key={j} className={`py-1.5 ${j === 0 ? "" : "text-zinc-500"}`}>{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-zinc-300 pb-6">
        แทนที่กระบวนการเดิม: ไฟล์ Payroll 30 ชีต + 13 ไฟล์แนบ (Mixer.rar) — ระบบผ่าน parallel run งวด มิ.ย. ตรงไฟล์จริง 112/112 คน
      </p>

      <style>{`@media print { .print\\:hidden { display: none } @page { margin: 12mm } }`}</style>
    </div>
  )
}
