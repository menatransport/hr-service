"use client";

import { useEffect, useState } from "react";
import { ExternalLink, FileSpreadsheet, Link2, Loader2, TriangleAlert } from "lucide-react";

import { DateField, SelectField, TextField } from "@/components/ui/field";
import { ModalShell } from "@/components/ui/modal-shell";
import { DRIVER_CODE_SHEET_URL } from "@/lib/google-sheet";
import { requestJson } from "@/lib/http";
import { confirm, toastSuccess } from "@/lib/swal";
import { daysUntil } from "@/app/recruitment/_lib/form";
import type { ApplicationStatus } from "@/app/recruitment/_lib/types";
import type { RcForm } from "@/app/recruitment/_lib/requisitions/onboarding-store";
import { customerLabel, type Requisition } from "@/app/recruitment/_lib/requisitions/types";
import type { OnboardingPatch, OnboardingRecord } from "@/app/recruitment/_lib/requisitions/onboarding";

/** วันเริ่มฝึกถึงแล้วหรือยัง — วันยังไม่ถึง = `waiting` · ไม่มีวัน = `null` */
function trainingState(start: string): "training" | "waiting" | null {
  const days = daysUntil(start);
  if (days === null) return null;
  return days > 0 ? "waiting" : "training";
}

function requisitionOption(r: Requisition): string {
  return [r.code, [customerLabel(r), r.plant].filter(Boolean).join(" ") || "ยังไม่ระบุลูกค้า"].join(" · ");
}

/** สถานะที่กล่องนี้พาไปหลังบันทึก — รอฝึกงาน (`interview_passed`) / ฝึกงาน */
export type RcTarget = "interview_passed" | "training";

const TARGET_LABEL: Record<RcTarget, string> = { interview_passed: "รอฝึกงาน", training: "ฝึกงาน" };

/**
 * กล่อง “ข้อมูล RC” บนหน้าผู้สมัคร — **ที่เดียวที่ RC กรอกส่วนของตัวเอง**
 * บันทึกลง `onboarding.rc` ของคำขอ หน้าติดตามพนักงานใหม่เห็นทันที
 *
 * ด้านบนคือ “ตำแหน่งที่สมัคร (คำขอสรรหา)” — เลือก/เปลี่ยน RQ ที่เปิดรับได้เสมอ (ผูกตอนกดบันทึก ·
 * เปลี่ยน = ปลดคำขอเดิมให้กลับไปเปิดรับ แล้วผูกคำขอใหม่ ข้อมูล RC ในฟอร์มบันทึกลงคำขอใหม่)
 * · `target` = เปิดจากการเลือกสถานะ “รอฝึกงาน”/“ฝึกงาน” (Bew 22/25 ต.ค. 2569): ต้องมี RQ + วันเริ่มฝึก
 * บันทึกแล้วหน้าแม่เลื่อนสถานะต่อ
 *
 * **ไม่มีช่อง RC ผู้แจ้ง / ผลสิ้นสุด / วันที่สิ้นสุดแล้ว** (Bew 25 ต.ค. 2569) — RC ผู้แจ้งตั้งจาก
 * ผู้ติดต่อกลับให้เองเงียบ ๆ ถ้ายังว่าง · ปลด/ลาออก/ฝึกงาน 1-2 วัน ลงที่ตารางรายวันแทน
 * (เลือก `ลอ`/`ปอ` → `exitFromDaily()` เขียนผลสิ้นสุดให้)
 */
export function CandidateRcForm({
  applicationId,
  linked,
  requisitions,
  name,
  contactOwner,
  target = null,
  onClose,
  onLinked,
  onSaved,
}: {
  applicationId: string;
  /** คำขอที่ใบนี้ผูกอยู่ · `null` = ยังไม่ผูก เลือกจากรายการที่เปิดรับ */
  linked: Requisition | null;
  requisitions: Requisition[];
  name: string;
  status: ApplicationStatus;
  /** ผู้รับเรื่องของใบสมัคร — ตั้งเป็น RC ผู้แจ้งให้ก่อนถ้ายังว่าง */
  contactOwner: string;
  target?: RcTarget | null;
  onClose: () => void;
  /** คำขอที่ผูก/ปลดไปแล้ว (ก่อนบันทึกข้อมูล RC) — หน้าแม่อัปเดตแถวคำขอ */
  onLinked: (rows: Requisition[]) => void;
  onSaved: (next: OnboardingRecord) => void;
}) {
  const [rqId, setRqId] = useState(linked?.id ?? "");
  const [form, setForm] = useState<RcForm | null>(null);
  const [values, setValues] = useState<Record<string, string>>({ rcName: contactOwner });
  const [drivercode, setDrivercode] = useState("");
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");

  /* ผูกอยู่ตอนเปิด = โหลดค่า RC เดิมของคำขอ · ยังไม่ผูก = ฟอร์มว่าง (RQ ที่เปิดรับยังไม่มีคน)
     — อ่านแค่ค่าตอนเปิด ผูกสำเร็จระหว่างบันทึกแล้วไม่โหลดทับค่าที่กรอกค้างไว้ */
  const [linkedId] = useState(linked?.id ?? "");
  useEffect(() => {
    if (!linkedId) return;
    let alive = true;
    requestJson<RcForm>(`/api/recruitment/requisitions/${linkedId}/onboarding`, {}, "โหลดข้อมูล RC ไม่สำเร็จ")
      .then((data) => {
        if (!alive) return;
        const rc = data.record.onboarding.rc?.values ?? {};
        setForm(data);
        setDrivercode(data.record.drivercode);
        setValues({ ...rc, rcName: rc.rcName || contactOwner });
      })
      .catch((err) => alive && setFailure(err instanceof Error ? err.message : "โหลดข้อมูล RC ไม่สำเร็จ"));
    return () => {
      alive = false;
    };
  }, [linkedId, contactOwner]);

  const loading = Boolean(linkedId) && !form && !failure;
  const rqOptions = requisitions
    .filter((r) => r.status === "open" || r.id === linked?.id)
    .sort((a, b) => b.code.localeCompare(a.code, "th", { numeric: true }))
    .map((r) => ({ value: r.id, label: requisitionOption(r) }));

  const set = (key: string) => (v: string) => setValues((prev) => ({ ...prev, [key]: v }));
  const start = values.trainingStartOn ?? "";
  const startState = trainingState(start);
  /* เลือก “ฝึกงาน” = เข้าทะเบียนประวัติทันที (Bew 3 พ.ย. 2569) — ทะเบียนผูกกับรหัส พจส. จึงต้องมีรหัสก่อน */
  const needsCode = target === "training";
  const ready =
    Boolean(rqId) && (!target || Boolean(startState)) && (!needsCode || Boolean(drivercode.trim())) && !loading;

  async function submit() {
    const picked = requisitions.find((r) => r.id === rqId);
    if (
      linked &&
      linked.id !== rqId &&
      !(await confirm({
        title: `ย้ายไป ${picked?.code ?? "คำขอใหม่"}?`,
        text: `${linked.code} จะกลับไปเปิดรับ · ข้อมูลฝ่ายอื่นของคำขอเดิม (KA/ST/…) ไม่ย้ายตาม`,
        confirmText: "ย้ายและบันทึก",
        tone: "warn",
      }))
    )
      return;

    setSaving(true);
    setFailure("");
    try {
      if (linked?.id !== rqId) {
        const written: Requisition[] = [];
        const link = (id: string, body: Record<string, unknown>, failed: string) =>
          requestJson<Requisition>(`/api/recruitment/requisitions/${id}`, { method: "PATCH", body }, failed).then(
            (row) => void written.push(row),
          );
        try {
          if (linked) await link(linked.id, { applicationId: null }, "ปลดคำขอเดิมไม่สำเร็จ");
          await link(rqId, { applicationId }, "ผูกคำขอสรรหาไม่สำเร็จ");
        } finally {
          if (written.length) onLinked(written);
        }
      }
      const body: OnboardingPatch = { section: "rc", values, drivercode };
      const next = await requestJson<OnboardingRecord>(
        `/api/recruitment/requisitions/${rqId}/onboarding`,
        { method: "PATCH", body: body as unknown as Record<string, unknown> },
        "บันทึกไม่สำเร็จ",
      );
      onSaved(next);
      toastSuccess("บันทึกข้อมูล RC แล้ว");
      onClose();
    } catch (err) {
      setFailure(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title={target ? `${TARGET_LABEL[target]} · ข้อมูล RC` : "ข้อมูล RC"}
      subtitle={
        <span className="text-12 text-mut">
          {name}
          {rqId ? (
            <>
              {" · "}
              <span className="font-mono tracking-wider text-primary">
                {requisitions.find((r) => r.id === rqId)?.code}
              </span>
            </>
          ) : null}
        </span>
      }
      onClose={onClose}
      width="560px"
      tone="plain"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-sec px-4 py-2 text-13">
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || !ready}
            className="btn-pri flex items-center gap-1.5 px-4 py-2 text-13 font-medium disabled:opacity-60"
          >
            {saving ? <Loader2 size={15} className="animate-spin" aria-hidden /> : null}
            {target ? `บันทึก · ${TARGET_LABEL[target]}` : "บันทึก"}
          </button>
        </>
      }
    >
      <SelectField
        id="rc-requisition"
        label="ตำแหน่งที่สมัคร (คำขอสรรหา)"
        placeholder={rqOptions.length ? "เลือก JR ที่เปิดรับ" : "ไม่มีคำขอที่เปิดรับอยู่"}
        searchable
        searchPlaceholder="ค้นเลข JR ลูกค้า แพล้น"
        readOnly={saving}
        options={rqOptions}
        value={rqId}
        onChange={setRqId}
      />

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 size={18} className="animate-spin text-mut" aria-hidden />
        </div>
      ) : (
        <div className="flex flex-col gap-4 border-t border-line pt-3.5">
          <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <TextField
                id="rc-drivercode"
                label="รหัส พจส."
                value={drivercode}
                onChange={setDrivercode}
                optional={!needsCode}
                hint={needsCode ? "จำเป็นตอนเริ่มฝึกงาน — บันทึกแล้วขึ้นหน้าทะเบียนประวัติทันที" : undefined}
              />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5">
                {!drivercode && form?.codeMatch ? (
                  <button
                    type="button"
                    onClick={() => setDrivercode(form.codeMatch!.drivercode)}
                    className="flex w-fit items-center gap-1 text-12 text-primary hover:underline"
                  >
                    <Link2 size={12} aria-hidden />
                    พบในทะเบียน {form.codeMatch.drivercode}
                  </button>
                ) : null}
                <a
                  href={DRIVER_CODE_SHEET_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="เปิด Google Sheet ในแท็บใหม่"
                  className="btn-excel flex w-fit items-center gap-1.5 px-2 py-1 text-12 font-medium"
                >
                  <FileSpreadsheet size={13} aria-hidden />
                  ชีตรหัส พจส.
                  <ExternalLink size={11} className="opacity-70" aria-hidden />
                </a>
              </div>
            </div>
            <DateField
              id="rc-trainingStartOn"
              label="วันเริ่มฝึก"
              value={start}
              onChange={set("trainingStartOn")}
              optional={!target}
              hint={startState === "waiting" ? `อีก ${daysUntil(start)} วัน` : undefined}
            />
          </div>
        </div>
      )}

      {failure ? (
        <p role="alert" className="flex items-start gap-2 rounded-field bg-alert/10 px-3 py-2 text-12-5 text-alert">
          <TriangleAlert size={14} strokeWidth={1.9} aria-hidden className="mt-0.5 flex-none" />
          {failure}
        </p>
      ) : null}
    </ModalShell>
  );
}
