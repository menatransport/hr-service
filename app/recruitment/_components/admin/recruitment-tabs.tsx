"use client";

import { useState } from "react";
import { ClipboardList, UserRoundSearch } from "lucide-react";

import { CandidatesView } from "@/app/recruitment/_components/admin/candidates-view";
import { RequisitionsView } from "@/app/recruitment/_components/admin/requisitions-view";
import { SummaryTabs } from "@/components/ui/summary-panel";
import type { RequisitionOptions } from "@/app/recruitment/_lib/requisitions/options";
import type { Requisition } from "@/app/recruitment/_lib/requisitions/types";
import type { DocSlot } from "@/app/recruitment/_lib/form";
import type { ApplicationSummary, BlacklistEntry } from "@/app/recruitment/_lib/types";

/**
 * ขอสรรหาและผู้สมัคร — **หน้าเดียว สองแท็บ**
 *
 * เดิมเป็นสองเมนูแยกกัน (`/requisitions` กับ `/candidates`) ซึ่งบังคับให้ฝ่ายสรรหา
 * เด้งไปมาทั้งวัน เพราะคำถามที่เขาถามจริงคร่อมสองตาราง: *อัตรานี้ได้คนหรือยัง*
 * และ *คนนี้มารับอัตราไหน* · รวมมาไว้ใต้หัวเดียวกันแล้วคำตอบอยู่ห่างกันแค่คลิกเดียว
 *
 * **ตัวที่ถือข้อมูลคือที่นี่ ไม่ใช่ตัวตาราง** — ตารางรับ `rows` + `setRows` ลงไป
 * ทั้งคู่ เพราะตัวเลขบนแท็บต้องสดตลอด: ยกเลิกคำขอในแท็บหนึ่งแล้วตัวเลขบนหัวแท็บ
 * ต้องลดตาม ถ้าปล่อยให้ตารางถือ state เอง หัวแท็บจะค้างอยู่กับค่าที่โหลดมาตอนเปิดหน้า
 * และกลายเป็นตัวเลขที่โกหก
 *
 * **เรนเดอร์เฉพาะแท็บที่เปิดอยู่** (ท่าเดียวกับ `components/desk/survey-view.tsx`)
 * ไม่ได้ซ่อนอีกตัวไว้เบื้องหลัง — ตัวกรองของตารางจึงรีเซ็ตเมื่อสลับแท็บ ซึ่งแลกมา
 * กับการไม่ต้องแบกสองตารางเต็ม ๆ ไว้ใน DOM ตลอดเวลา · ข้อมูลไม่ได้โหลดใหม่
 * (อยู่ที่นี่แล้ว) การสลับแท็บจึงยังทันทีเสมอ
 *
 * แท็บที่เปิดอยู่เขียนกลับลง URL ด้วย `history.replaceState` **ไม่ใช่ `router.push`**
 * เพราะหน้าเป็น `force-dynamic` — `push` จะยิงอ่าน Mongo ใหม่ทั้งชุดเพียงเพราะ
 * กดสลับแท็บ ทั้งที่ข้อมูลอีกแท็บมาถึงตั้งแต่เปิดหน้าแล้ว
 */

export type RecruitmentTab = "requisitions" | "candidates";

const TABS = [
  { id: "requisitions", label: "คำขอสรรหา", icon: ClipboardList },
  { id: "candidates", label: "ผู้สมัคร", icon: UserRoundSearch },
] as const;

const TITLE = "ขอสรรหาและผู้สมัคร";

export function RecruitmentTabs({
  initialTab,
  initialRequisitions,
  options,
  initialApplications,
  contactOptions,
  docSlots,
  blacklist,
  /** เลขที่ใบสมัครจาก `?ref=` — คิวงานหน้าภาพรวมส่งมาเพื่อเปิดตรงที่แถวนั้นเลย */
  initialRef = "",
}: {
  initialTab: RecruitmentTab;
  initialRequisitions: Requisition[];
  options: RequisitionOptions;
  initialApplications: ApplicationSummary[];
  contactOptions: string[];
  /** ช่องเอกสารพร้อมค่าแสดง/บังคับจาก Section 4 ของคลังคำถาม */
  docSlots: DocSlot[];
  /** ทุกใบที่ติด Blacklist — ตารางผู้สมัครใช้จับชื่อ/เบอร์ของใบที่รอการติดต่อ */
  blacklist: BlacklistEntry[];
  initialRef?: string;
}) {
  const [tab, setTab] = useState<RecruitmentTab>(initialTab);
  const [requisitions, setRequisitions] = useState(initialRequisitions);
  const [applications, setApplications] = useState(initialApplications);
  /**
   * ใบสมัครที่อยากให้ตารางผู้สมัครกรองไว้ให้ตั้งแต่เปิด
   *
   * ตั้งได้สองทาง: `?ref=` ตอนเปิดหน้า และการกดชื่อในคอลัมน์ “ผู้สมัครที่รับอัตรา”
   * ของตารางคำขอ · **กดหัวแท็บเองล้างค่านี้ทิ้ง** เพราะการกดแท็บคือการขอดู
   * “ทั้งหมด” ไม่ใช่ขอดูคนที่เผอิญเคยกดค้างไว้เมื่อกี้
   */
  const [focusRef, setFocusRef] = useState(initialRef);

  /** งานค้างของแต่ละแท็บ — ความหมายเดียวกันทั้งคู่คือ “ยังรอให้ทำอยู่” */
  const pending = {
    requisitions: requisitions.filter((r) => r.status === "open").length,
    candidates: applications.filter((a) => a.status === "pending_contact").length,
  };

  function go(next: RecruitmentTab, ref = "") {
    setTab(next);
    setFocusRef(ref);

    /* URL ต้องสะท้อนแท็บที่เปิดอยู่เสมอ — รีเฟรชแล้วอยู่ที่เดิม และแชร์ลิงก์
       ให้เพื่อนร่วมงานได้ตรงแท็บ · `?ref=` ติดไปด้วยเฉพาะตอนกระโดดจากคำขอ */
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    if (ref) url.searchParams.set("ref", ref);
    else url.searchParams.delete("ref");
    window.history.replaceState(null, "", url);
  }

  /* วางอยู่ในแถบท้ายการ์ดสรุปของแต่ละตาราง (`SummaryStrip`) ไม่ใช่ลอยอยู่ใต้หัวเรื่อง
     — ขีดใต้แท็บทับขอบล่างของการ์ดพอดี ท่าเดียวกับแท็บของทะเบียน พจส. */
  const tabs = (
    <SummaryTabs
      label="มุมมองของหน้าขอสรรหา"
      value={tab}
      onChange={(id) => go(id)}
      tabs={TABS.map(({ id, label, icon }) => ({
        id,
        label,
        icon,
        count: pending[id],
        countTitle:
          id === "requisitions"
            ? `อัตราที่ยังเปิดรับ ${pending[id]} รายการ`
            : `ใบสมัครที่ยังไม่ได้ติดต่อ ${pending[id]} ใบ`,
      }))}
    />
  );

  return tab === "requisitions" ? (
    <RequisitionsView
      title={TITLE}
      tabs={tabs}
      rows={requisitions}
      setRows={setRequisitions}
      options={options}
      /* สะพานเส้นเดียวระหว่างสองตาราง — กดชื่อผู้สมัครที่รับอัตราแล้วข้ามมาที่
         ใบของเขาโดยไม่ต้องจำชื่อไปพิมพ์ค้นเอง */
      onOpenCandidate={(ref) => go("candidates", ref)}
    />
  ) : (
    <CandidatesView
      title={TITLE}
      tabs={tabs}
      rows={applications}
      setRows={setApplications}
      initialTerm={focusRef}
      contactOptions={contactOptions}
      docSlots={docSlots}
      blacklist={blacklist}
      /* กล่องทำเอกสารเลือก RQ ที่เปิดรับเป็น “ตำแหน่งที่สมัคร” และผูก/ปลดได้เอง —
         ส่งตัวแก้ลงไปด้วย ตัวเลขบนแท็บคำขอสรรหาจะได้ขยับตามทันที */
      requisitions={requisitions}
      setRequisitions={setRequisitions}
    />
  );
}
