"use client";

import { useEffect, useState } from "react";
import { Link2, Loader2, TriangleAlert } from "lucide-react";

import { DateField, SelectField, TextField } from "@/components/ui/field";
import { ModalShell } from "@/components/ui/modal-shell";
import { requestJson } from "@/lib/http";
import { toastSuccess } from "@/lib/swal";
import { todayInBangkok } from "@/lib/record-case-flow";
import { isHiredStatus, type ApplicationStatus } from "@/app/recruitment/_lib/types";
import type { RcForm } from "@/app/recruitment/_lib/requisitions/onboarding-store";
import {
  END_OUTCOMES,
  OUTCOMES,
  type OnboardingPatch,
  type OnboardingRecord,
} from "@/app/recruitment/_lib/requisitions/onboarding";

/**
 * กล่อง “ข้อมูล RC” บนหน้าผู้สมัคร — **ที่เดียวที่ RC กรอกส่วนของตัวเอง** (ใบที่ผูกคำขอแล้ว)
 * บันทึกลง `onboarding.rc` ของคำขอ หน้าติดตามพนักงานใหม่เห็นทันที ·
 * ผลสิ้นสุด (ปลด/ลาออก …) ทำได้ที่นี่เท่านั้น
 */
export function CandidateRcForm({
  requisitionId,
  code,
  name,
  status,
  contactOwner,
  onClose,
  onSaved,
}: {
  requisitionId: string;
  code: string;
  name: string;
  status: ApplicationStatus;
  /** ผู้รับเรื่องของใบสมัคร — ตั้งเป็น RC ผู้แจ้งให้ก่อนถ้ายังว่าง */
  contactOwner: string;
  onClose: () => void;
  onSaved: (next: OnboardingRecord) => void;
}) {
  const [form, setForm] = useState<RcForm | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [drivercode, setDrivercode] = useState("");
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");

  useEffect(() => {
    let alive = true;
    requestJson<RcForm>(`/api/recruitment/requisitions/${requisitionId}/onboarding`, {}, "โหลดข้อมูล RC ไม่สำเร็จ")
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
  }, [requisitionId, contactOwner]);

  const set = (key: string) => (v: string) => setValues((prev) => ({ ...prev, [key]: v }));
  const outcome = values.outcome ?? "";
  /* ผลสิ้นสุดเปิดให้เฉพาะคนที่เริ่มฝึกแล้ว หรือมีค่าเดิมอยู่ */
  const showExit = isHiredStatus(status) || Boolean(form?.record.onboarding.rc?.values.outcome);
  const outcomeOptions = [
    ...END_OUTCOMES,
    ...OUTCOMES.filter((o) => o.value === outcome && !END_OUTCOMES.some((e) => e.value === o.value)),
  ].map((o) => ({ value: o.value, label: o.label }));

  async function submit() {
    if (END_OUTCOMES.some((o) => o.value === outcome) && !values.exitOn) {
      setFailure("ระบุวันที่สิ้นสุด");
      return;
    }
    setSaving(true);
    setFailure("");
    const body: OnboardingPatch = {
      section: "rc",
      values,
      drivercode,
      ...(showExit ? { exit: { outcome, exitOn: values.exitOn ?? "" } } : {}),
    };
    try {
      const next = await requestJson<OnboardingRecord>(
        `/api/recruitment/requisitions/${requisitionId}/onboarding`,
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
      title="ข้อมูล RC"
      subtitle={
        <span className="text-12 text-mut">
          {name} · <span className="font-mono tracking-wider text-primary">{code}</span>
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
            disabled={saving || !form}
            className="btn-pri flex items-center gap-1.5 px-4 py-2 text-13 font-medium disabled:opacity-60"
          >
            {saving ? <Loader2 size={15} className="animate-spin" aria-hidden /> : null}
            บันทึก
          </button>
        </>
      }
    >
      {!form && !failure ? (
        <div className="flex justify-center py-10">
          <Loader2 size={18} className="animate-spin text-mut" aria-hidden />
        </div>
      ) : null}

      {form ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <TextField id="rc-drivercode" label="รหัส พจส." value={drivercode} onChange={setDrivercode} optional />
              {!drivercode && form.codeMatch ? (
                <button
                  type="button"
                  onClick={() => setDrivercode(form.codeMatch!.drivercode)}
                  className="flex w-fit items-center gap-1 text-12 text-primary hover:underline"
                >
                  <Link2 size={12} aria-hidden />
                  พบในทะเบียน {form.codeMatch.drivercode}
                </button>
              ) : null}
            </div>
            <div>
              <TextField
                id="rc-rcName"
                label="RC ผู้แจ้ง"
                value={values.rcName ?? ""}
                onChange={set("rcName")}
                list="rc-rcName-list"
                optional
              />
              <datalist id="rc-rcName-list">
                {form.rcNames.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <DateField id="rc-notifiedOn" label="วันที่แจ้ง" value={values.notifiedOn ?? ""} onChange={set("notifiedOn")} optional />
            <DateField
              id="rc-trainingStartOn"
              label="วันเริ่มฝึก"
              value={values.trainingStartOn ?? ""}
              onChange={set("trainingStartOn")}
              optional
            />
          </div>

          {showExit ? (
            <fieldset className="grid gap-x-4 gap-y-3.5 border-t border-line pt-3.5 sm:grid-cols-2">
              <legend className="sr-only">ผลสิ้นสุด</legend>
              <SelectField
                id="rc-outcome"
                label="ผลสิ้นสุด (ปลด/ลาออก)"
                value={outcome}
                onChange={(v) =>
                  setValues((prev) => ({
                    ...prev,
                    outcome: v,
                    exitOn: v ? prev.exitOn || todayInBangkok() : "",
                  }))
                }
                options={outcomeOptions}
                placeholder="—"
                clearable
                optional
              />
              <DateField
                id="rc-exitOn"
                label="วันที่สิ้นสุด"
                value={values.exitOn ?? ""}
                onChange={set("exitOn")}
                optional={!outcome}
              />
            </fieldset>
          ) : null}
        </div>
      ) : null}

      {failure ? (
        <p role="alert" className="flex items-start gap-2 rounded-field bg-alert/10 px-3 py-2 text-12-5 text-alert">
          <TriangleAlert size={14} strokeWidth={1.9} aria-hidden className="mt-0.5 flex-none" />
          {failure}
        </p>
      ) : null}
    </ModalShell>
  );
}
