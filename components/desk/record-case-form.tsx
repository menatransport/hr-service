"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { useDeskIdentity } from "@/components/auth/identity-provider";
import { AttachmentField } from "@/components/ui/attachment-field";
import {
  CheckboxGroupField,
  DateField,
  SelectField,
  TagsField,
  TextField,
  TextareaField,
  type SelectOption,
} from "@/components/ui/field";
import { ModalShell } from "@/components/ui/modal-shell";
import { departments } from "@/lib/data";
import { requestJson } from "@/lib/http";
import { escapeHtml, runAction } from "@/lib/swal";
import {
  MAX_INVOLVED,
  RECORD_CATEGORY_ICON,
  WARNING_LEVELS,
  toggleWarning,
  todayInBangkok,
  type RecordAttachment,
  type RecordCase,
  type RecordCategory,
} from "@/lib/record-case-flow";

/**
 * ฟอร์มบันทึกเคส — **ใบเดียวใช้ทั้งสร้างใหม่และแก้ไข** (แก้ไขเปิดให้ทำได้ 21 ส.ค. 2026)
 *
 * ส่ง `record` มา = โหมดแก้ไข (ยิง `PUT /api/record-cases/{id}`) · ไม่ส่ง = สร้างใหม่
 * (`POST /api/record-cases`) · ใช้ฟอร์มร่วมกันเพื่อไม่ให้ชุดช่องกรอกสองที่หลุด sync กัน
 * เวลาเพิ่มฟิลด์ใหม่
 *
 * **แบ่งเป็นส่วน ๆ แบบแบบฟอร์มราชการ** (สั่งปรับ 21 ส.ค. 2026) — แต่ละส่วนมีแถบหัวข้อ
 * พื้นเทากินเต็มความกว้าง (`tone="form"` ของ `ModalShell` เอา padding ออกให้) และ
 * **ไม่มีข้อความ hint ใต้ช่องเลย** ป้ายชื่อช่องกับดอกจันแดงบอกครบแล้ว ถ้าต้องเขียนอธิบาย
 * เพิ่มแปลว่าชื่อช่องยังไม่ดีพอ — ให้แก้ชื่อช่องแทนการใส่ hint กลับมา
 *
 * ลำดับส่วนเรียงตามลำดับที่คนเล่าเรื่อง: **เรื่องอะไร → เกิดอะไรขึ้น → ผลทางวินัย →
 * มีหลักฐานอะไร** ไม่ใช่เรียงตามหน้าตาของตารางในฐานข้อมูล
 *
 * สองอย่างที่ผู้ใช้ไม่ต้องกรอกเพราะระบบรู้อยู่แล้ว:
 * - **ผู้บันทึก** มาจาก session (แสดงบนหัวกล่องว่าจะบันทึกในนามใคร)
 * - **สถานะ** เคสใหม่เริ่มที่ “รอดำเนินการ” เสมอ และ **แก้ที่ฟอร์มนี้ไม่ได้**
 *   ต้องกดปุ่มเปลี่ยนสถานะในแผงรายละเอียดเท่านั้น (จะได้ลงประวัติทางเดียว)
 *
 * ฟอร์มวางบนพื้น `base-100` ตรง ๆ ไม่ต้องมีการ์ดซ้อนในกล่องอีกชั้น — กล่องเองก็เป็น
 * กรอบอยู่แล้ว ซ้อนอีกชั้นจะกลายเป็นกรอบในกรอบโดยไม่ได้แบ่งอะไรเพิ่ม
 */
export function RecordCaseForm({
  record,
  categories,
  onClose,
}: {
  /** มี = แก้ไขเคสนี้ · ไม่มี = บันทึกเคสใหม่ */
  record?: RecordCase;
  categories: RecordCategory[];
  onClose: () => void;
}) {
  const router = useRouter();
  const me = useDeskIdentity();
  const editing = Boolean(record);

  const [title, setTitle] = useState(record?.title ?? "");
  const [occurredOn, setOccurredOn] = useState(record?.occurredOn ?? todayInBangkok());
  const [departmentId, setDepartmentId] = useState(record?.departmentId ?? "");
  const [category, setCategory] = useState(record?.category ?? "");
  const [involved, setInvolved] = useState<string[]>(record?.involved ?? []);
  const [warnings, setWarnings] = useState<string[]>(record?.warnings ?? []);
  const [remark, setRemark] = useState(record?.remark ?? "");
  const [detail, setDetail] = useState(record?.detail ?? "");
  const [attachments, setAttachments] = useState<RecordAttachment[]>(
    record?.attachments ?? [],
  );
  const [busy, setBusy] = useState(false);

  const ready = Boolean(
    title.trim() && detail.trim() && occurredOn && departmentId && category,
  );

  const categoryOptions: SelectOption[] = categories.map((c) => ({
    value: c.id,
    label: c.label,
    icon: RECORD_CATEGORY_ICON,
  }));

  async function save() {
    const out = await runAction({
      confirm: {
        title: editing ? "บันทึกการแก้ไข?" : "บันทึกเคสนี้?",
        html: `<div class="hrs-swal-quote">${escapeHtml(title.trim())}</div>`,
        confirmText: "บันทึก",
      },
      /* ยกธง busy เฉพาะตอนยิงจริง ไม่ใช่ตั้งแต่เปิดกล่องถาม */
      run: async () => {
        setBusy(true);
        try {
          return await requestJson<RecordCase>(
            record ? `/api/record-cases/${record.id}` : "/api/record-cases",
            {
              method: record ? "PUT" : "POST",
              body: {
                title: title.trim(),
                detail: detail.trim(),
                occurredOn,
                departmentId,
                category,
                involved,
                warnings,
                remark: remark.trim(),
                attachments,
              },
            },
            editing ? "แก้ไขเคสไม่สำเร็จ" : "บันทึกเคสไม่สำเร็จ",
          );
        } finally {
          setBusy(false);
        }
      },
      pending: "กำลังบันทึก…",
      success: (saved) =>
        editing ? `แก้ไขเคส ${saved.code} แล้ว` : `บันทึกเคส ${saved.code} แล้ว`,
      failureTitle: editing ? "แก้ไขเคสไม่สำเร็จ" : "บันทึกเคสไม่สำเร็จ",
      loud: true,
    });

    /* `cancelled` = ยังไม่ได้ยิงอะไร ฟอร์มต้องคาอยู่ให้แก้ต่อ ·
       `failed` ก็เช่นกัน ห้ามปิดฟอร์มทิ้งข้อมูลที่ผู้ใช้พิมพ์ไว้ */
    if (out.status !== "done") return;
    router.refresh();
    onClose();
  }

  return (
    <ModalShell
      title={editing ? "แก้ไขบันทึกเคส" : "บันทึกเคสใหม่"}
      subtitle={
        editing
          ? `${record?.code} · แก้ไขในนาม ${me.name} — ทุกการแก้ไขถูกบันทึกลงประวัติ`
          : `บันทึกในนาม ${me.name} · ${me.department}`
      }
      onClose={onClose}
      width="680px"
      tone="form"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-field border border-line px-3.5 py-2 text-[13px] text-mut transition-colors hover:text-ink"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!ready || busy}
            className="flex items-center gap-2 rounded-field bg-primary px-4 py-2 text-[13px] font-medium text-primary-content transition-opacity hover:opacity-90 disabled:opacity-45"
          >
            <Check size={16} strokeWidth={2} aria-hidden />
            {busy ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "บันทึกเคส"}
          </button>
        </>
      }
    >
      <Section title="ข้อมูลเคส">
        <TextField id="rc-title" label="หัวเรื่อง" value={title} onChange={setTitle} />

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="rc-category"
            label="ประเภทเคส"
            placeholder="เลือกประเภท…"
            value={category}
            onChange={setCategory}
            options={categoryOptions}
          />
          <DateField
            id="rc-date"
            label="วันที่ของเคส"
            value={occurredOn}
            onChange={setOccurredOn}
          />
          <SelectField
            id="rc-dept"
            label="ฝ่ายที่เกี่ยวข้อง"
            placeholder="เลือกฝ่าย…"
            value={departmentId}
            onChange={setDepartmentId}
            options={departmentOptions}
            className="sm:col-span-2"
          />
        </div>
      </Section>

      <Section title="รายละเอียดเหตุการณ์">
        <TagsField
          id="rc-involved"
          label="ชื่อพจส."
          optional
          placeholder="พิมพ์ชื่อแล้วกด Enter"
          max={MAX_INVOLVED}
          value={involved}
          onChange={setInvolved}
        />

        <TextareaField
          id="rc-detail"
          label="รายละเอียด"
          placeholder="อธิบายเหตุการณ์…"
          rows={6}
          value={detail}
          onChange={setDetail}
        />
      </Section>

      <Section title="ผลทางวินัยและหมายเหตุ">
        {/*
         * โทษทางวินัย — เลือกได้หลายข้อเพราะเรื่องเดียวไล่ระดับได้หลายขั้น
         * กฎ “ไม่ได้รับอยู่ลำพัง” อยู่ใน `toggleWarning()` ไม่ได้เขียนซ้ำตรงนี้
         */}
        <CheckboxGroupField
          id="rc-warnings"
          label="หนังสือเตือน / โทษทางวินัย"
          optional
          value={warnings}
          onToggle={(w) => setWarnings((cur) => toggleWarning(cur, w))}
          options={warningOptions}
        />

        <TextareaField
          id="rc-remark"
          label="หมายเหตุ"
          optional
          placeholder="ข้อมูลประกอบเพิ่มเติมของเคสนี้"
          rows={2}
          value={remark}
          onChange={setRemark}
        />
      </Section>

      <Section title="เอกสารแนบ" last>
        <AttachmentField
          id="rc-files"
          value={attachments}
          onChange={setAttachments}
          hideLabel
        />
      </Section>
    </ModalShell>
  );
}

/**
 * ส่วนหนึ่งของฟอร์ม — แถบหัวข้อพื้นเทาเต็มความกว้าง แล้วชุดช่องกรอกอยู่ข้างใต้
 * ทรงเดียวกับ `Head` ของแผงรายละเอียด (`record-case-detail.tsx`) ให้ทั้งหน้าอ่านเป็นระบบเดียวกัน
 *
 * `last` = ส่วนสุดท้าย ไม่ต้องขีดเส้นล่างซ้ำกับเส้นของ footer กล่อง
 */
function Section({
  title,
  last = false,
  children,
}: {
  title: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={last ? "" : "border-b border-line"}>
      <h3 className="border-b border-line bg-base-200 px-5 py-1.5 text-[11px] font-semibold tracking-[0.06em] text-mut">
        {title}
      </h3>
      <div className="flex flex-col gap-4 px-5 py-4">{children}</div>
    </section>
  );
}

const warningOptions = WARNING_LEVELS.map((w) => ({ value: w.id, label: w.label }));

const departmentOptions: SelectOption[] = departments.map((d) => ({
  value: d.id,
  label: d.label,
  icon: d.icon,
}));
