"use client";

import { useState } from "react";
import { Pencil, PencilLine } from "lucide-react";

import {
  statusActionIcon,
  statusActionTone,
  useRecordStatusChange,
} from "@/components/desk/record-status-actions";
import { AttachmentGallery } from "@/components/ui/attachment-gallery";
import {
  attachmentKind,
  attachmentUrl,
  formatDateTime,
  formatFileSize,
  isEditEntry,
  isImageAttachment,
  nextStatuses,
  recordStatusMeta,
  warningChip,
  warningLabel,
  type RecordAttachment,
  type RecordCase,
  type RecordStatus,
} from "@/lib/record-case-flow";

/**
 * แผงรายละเอียดที่กางออกในแถวของคิว — **ไม่ใช่โมดัลแล้ว** (21 ส.ค. 2026)
 *
 * ทรงเป็น **แผงข้อมูลของระบบงาน ไม่ใช่การ์ดลอย** (สั่งปรับ 21 ส.ค. 2026):
 * มุมตรงทั้งแผง · ไม่มีช่องไฟระหว่างก้อน · ทุกส่วนต่อกันเป็นผืนเดียวกินเต็มความกว้างของแถว
 * แบ่งด้วย **เส้นบาง + แถบหัวข้อพื้นเทา** อย่างเดียว — แบบเดียวกับหน้าจอ ERP/ทะเบียนราชการ
 * ที่ตากวาดตามเส้นได้โดยไม่มีเงาหรือขอบมนมาแย่งความสนใจ
 *
 * **สัดส่วน**: ซ้าย = ตัวเรื่อง (รายละเอียด + ข้อมูลประกอบ) · ขวา = หลักฐานและร่องรอย
 * (เอกสารแนบ + ประวัติ) คั่นด้วยเส้นตั้งเส้นเดียว · ปิดท้ายด้วยแถบดำเนินการเต็มความกว้าง
 *
 * กฎที่ยังใช้อยู่: **แผงแสดงเฉพาะสิ่งที่แถวบอกไม่ได้** — ประเภท/วันที่/ฝ่าย/สถานะ
 * เป็นคอลัมน์ในตารางแล้ว อย่าเอามาเขียนซ้ำที่นี่ ·
 * **หนังสือเตือน/โทษทางวินัยอยู่ในแผงนี้เท่านั้น** ไม่โผล่บนแถว (สั่งเปลี่ยน 21 ส.ค. 2026)
 * เป็นข้อมูลของบุคคล ไม่ควรอ่านได้จากการกวาดตาผ่านคิวทั้งหน้า
 *
 * **ไม่มีช่องหมายเหตุตอนเปลี่ยนสถานะแล้ว** (สั่งถอด 21 ส.ค. 2026) — อยากเขียนอะไรประกอบเคส
 * ให้กด **แก้ไข** แล้วกรอกช่อง “หมายเหตุ” ซึ่งแสดงอยู่ในตาราง *ข้อมูลประกอบ* ของแผงนี้
 * ปุ่มเปลี่ยนสถานะจึงเป็นการกดครั้งเดียวจบ ไม่มีขั้นตอนแทรกกลางทาง
 * (เอกสารเก่าที่เคยมีหมายเหตุติดอยู่ในประวัติยังแสดงตามปกติ)
 *
 * ปุ่ม **แก้ไข** ท้ายแผงเปิดฟอร์มเดิมในโหมดแก้ไข · ทั้งการเปลี่ยนสถานะและการแก้ไข
 * ถูกลงประวัติเสมอฝั่งเซิร์ฟเวอร์ (`changeRecordStatus()` / `updateRecordCase()`)
 * — หน้าจอไม่มีทางแตะเคสโดยไม่ทิ้งร่องรอย
 */

/** ปุ่มหลัก (อนุมัติเสร็จสิ้น) อยู่ขวาสุดเสมอ — ตำแหน่งเดิมทุกครั้งที่กางแผง */
const ACTION_ORDER: Record<RecordStatus, number> = {
  pending: 0,
  rejected: 1,
  completed: 2,
};

/** ประวัติที่แสดงก่อนกด “ดูทั้งหมด” — สามรายการพอเห็นว่าเรื่องเดินไปถึงไหน */
const HISTORY_PREVIEW = 3;

/** ปุ่มในแผงนี้เป็นทรงเหลี่ยมทั้งหมด — ทั้งแผงไม่มีมุมมนแม้แต่จุดเดียว */
const squareButton = "flex items-center gap-1.5 rounded-none px-3 py-1.5 transition-colors";

export function RecordCaseDetail({
  record,
  onEdit,
}: {
  record: RecordCase;
  /**
   * เปิดฟอร์มแก้ไข — **แผงนี้ไม่เรนเดอร์โมดัลเอง** เพราะมันอยู่ในกล่องที่ติด
   * `animate-rise` (มี `transform`) ซึ่งจะดึงโมดัล `position: fixed` ให้ยึดกล่องนี้
   * แทนขอบจอ · หน้าคิวเป็นคนเรนเดอร์ฟอร์มไว้นอกกล่องนั้นให้ (ดู `record-case-view.tsx`)
   */
  onEdit: () => void;
}) {
  const [allHistory, setAllHistory] = useState(false);
  const { change, busyId } = useRecordStatusChange();

  const busy = busyId === record.id;
  const images = record.attachments.filter(isImageAttachment);
  const docs = record.attachments.filter((f) => !isImageAttachment(f));
  const actions = nextStatuses(record.status).sort(
    (a, b) => ACTION_ORDER[a] - ACTION_ORDER[b],
  );

  const history = [...record.history].reverse();
  const shownHistory = allHistory ? history : history.slice(0, HISTORY_PREVIEW);

  return (
    <div className="border-t border-line bg-base-100 text-12-5">
      {/* สองคอลัมน์ต่อกันสนิท คั่นด้วยเส้นตั้งเส้นเดียว ไม่มีช่องไฟ */}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] lg:divide-x lg:divide-line">
        {/* ── ซ้าย: ตัวเรื่อง ── */}
        <div className="min-w-0">
          <Head title="รายละเอียดของเรื่อง" />
          {/* ย่อหน้าอ่านยาว — บรรทัดโปร่ง กว้างไม่เกิน 90 ตัวอักษรตามระยะที่ตาอ่านสบาย */}
          <p className="max-w-[90ch] px-4 py-3.5 text-13 leading-[1.95] whitespace-pre-wrap text-pretty">
            {record.detail}
          </p>

          <Head title="ข้อมูลประกอบ" divider />
          <dl>
            {/* โทษทางวินัยอยู่ในแผงเท่านั้น — ไม่ขึ้นบนแถวของคิว */}
            <Row label="หนังสือเตือน / โทษทางวินัย">
              {record.warnings.length ? (
                <ul className="flex flex-wrap gap-1.5">
                  {record.warnings.map((w) => (
                    <li
                      key={w}
                      className={`border px-2 py-0.5 text-11-5 ${warningChip(w)}`}
                    >
                      {warningLabel(w)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Row>

            <Row label="ผู้เกี่ยวข้อง">
              {record.involved.length ? (
                <span className="leading-[1.8]">{record.involved.join(" · ")}</span>
              ) : null}
            </Row>

            <Row label="หมายเหตุ">
              {record.remark ? (
                <span className="leading-[1.8] whitespace-pre-wrap">{record.remark}</span>
              ) : null}
            </Row>
          </dl>
        </div>

        {/* ── ขวา: หลักฐานและร่องรอย ── */}
        <div className="min-w-0 border-t border-line lg:border-t-0">
          <Head title="เอกสารแนบ" count={record.attachments.length} />
          {record.attachments.length ? (
            <>
              {/* รูปย่อใหญ่ มุมตรง — ดูออกว่าเป็นภาพอะไรตั้งแต่ยังไม่คลิก */}
              {images.length ? (
                <div className="px-4 py-3">
                  <AttachmentGallery urls={images.map(attachmentUrl)} thumb={92} square />
                </div>
              ) : null}

              {docs.length ? (
                <ul className={images.length ? "border-t border-line" : ""}>
                  {docs.map((file) => (
                    <li key={file.fileId} className="border-b border-line/70 last:border-0">
                      <DocLink file={file} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="px-4 py-3 text-mut">ไม่มีเอกสารแนบ</p>
          )}

          <Head
            title="ประวัติการเปลี่ยนแปลง"
            count={history.length}
            divider
            action={
              history.length > HISTORY_PREVIEW ? (
                <button
                  type="button"
                  onClick={() => setAllHistory((v) => !v)}
                  className="text-11 font-normal text-mut underline-offset-4 transition-colors hover:text-ink hover:underline"
                >
                  {allHistory ? "ย่อ" : "ดูทั้งหมด"}
                </button>
              ) : null
            }
          />
          <ol>
            {shownHistory.map((entry, i) => {
              const edited = isEditEntry(entry);
              return (
                <li
                  key={`${entry.at}-${i}`}
                  className="flex gap-2 border-b border-line/70 px-4 py-2.5 last:border-0"
                >
                  {/* แก้ไข = ไอคอนดินสอ · เปลี่ยนสถานะ = จุดสีของสถานะนั้น */}
                  {edited ? (
                    <PencilLine
                      size={12}
                      strokeWidth={1.8}
                      aria-hidden
                      className="mt-1 flex-none text-mut"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className={`mt-1.25 size-1.5 flex-none ${recordStatusMeta[entry.to].dot}`}
                    />
                  )}
                  <div className="flex min-w-0 flex-col">
                    <span>
                      <span className="font-medium">
                        {edited ? "แก้ไขข้อมูล" : recordStatusMeta[entry.to].label}
                      </span>
                      <span className="text-mut"> · {formatDateTime(entry.at)}</span>
                    </span>
                    <span className="text-11-5 text-mut">
                      โดย {entry.by.name}
                      {edited && entry.fields?.length
                        ? ` — ${entry.fields.join(" · ")}`
                        : ""}
                    </span>
                    {entry.note ? (
                      <span className="text-11-5 leading-[1.65] text-pretty">
                        “{entry.note}”
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {/* ── แถบดำเนินการ: ใครบันทึกไว้เมื่อไร + จะทำอะไรต่อ ── */}
      <div className="border-t border-line bg-base-200/60">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
          <span className="text-11-5 text-mut">
            บันทึกโดย {record.recorder.name} · {formatDateTime(record.createdAt)}
          </span>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onEdit}
              className={`${squareButton} flex-none border border-line bg-base-100 text-12 hover:border-ink/30 hover:text-ink`}
            >
              <Pencil size={14} strokeWidth={1.8} aria-hidden />
              แก้ไข
            </button>

            {actions.map((to) => {
              const Icon = statusActionIcon[to];
              return (
                <button
                  key={to}
                  type="button"
                  disabled={busy}
                  onClick={() => change(record, to)}
                  className={`${squareButton} px-3.5 text-12-5 font-medium disabled:opacity-45 ${statusActionTone[to]}`}
                >
                  <Icon size={14} strokeWidth={2} aria-hidden />
                  {recordStatusMeta[to].action}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * แถบหัวข้อพื้นเทาคาดเต็มความกว้างของคอลัมน์ — ไม่ใช่กล่อง ไม่มีมุมมน
 * `divider` = มีส่วนอื่นอยู่ข้างบน จึงต้องขีดเส้นบนคั่น (หัวข้อแรกของคอลัมน์ไม่ต้อง)
 */
function Head({
  title,
  count,
  action,
  divider = false,
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
  divider?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 border-b border-line bg-base-200 px-4 py-1.5 ${
        divider ? "border-t" : ""
      }`}
    >
      <h3 className="text-11 font-semibold tracking-[0.06em] text-mut">{title}</h3>
      {count === undefined ? null : (
        <span className="text-11 text-mut tabular-nums">({count})</span>
      )}
      {action ? <span className="ml-auto">{action}</span> : null}
    </div>
  );
}

/**
 * บรรทัด “หัวข้อ–ค่า” ของตารางข้อมูลประกอบ — คอลัมน์ซ้ายพื้นเทาอ่อนแบบตารางทะเบียน
 *
 * **แสดงทุกบรรทัดแม้ไม่มีค่า** (ขึ้น `—`) ตามธรรมเนียมแบบฟอร์ม — ช่องที่หายไปเฉย ๆ
 * ทำให้คนอ่านแยกไม่ออกว่า “ไม่มีข้อมูล” หรือ “ระบบไม่ได้เก็บ”
 */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(104px,180px)_minmax(0,1fr)] border-b border-line/70 last:border-0">
      <dt className="border-r border-line/70 bg-base-200/45 px-4 py-2.5 text-mut">
        {label}
      </dt>
      <dd className="min-w-0 px-4 py-2.5">
        {children ?? <span className="text-mut">—</span>}
      </dd>
    </div>
  );
}

/**
 * ไฟล์เอกสารหนึ่งรายการ — เป็น**แถวเต็มความกว้าง** ไม่ใช่การ์ดในกรอบของตัวเอง ·
 * **ไอคอนบอกชนิดไฟล์** (PDF/Word/Excel/…) จาก `attachmentKind()` ตาจึงแยกออก
 * ตั้งแต่ก่อนอ่านชื่อไฟล์ที่มักถูกตัดท้าย
 */
function DocLink({ file }: { file: RecordAttachment }) {
  const kind = attachmentKind(file);
  const Icon = kind.icon;

  return (
    <a
      href={attachmentUrl(file)}
      target="_blank"
      rel="noreferrer"
      title={file.name}
      className="flex items-center gap-2.5 px-4 py-2 transition-colors hover:bg-soft/50"
    >
      <span
        aria-hidden
        className={`flex size-8 flex-none items-center justify-center border border-line bg-base-200 ${kind.tone}`}
      >
        <Icon size={16} strokeWidth={1.7} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{file.name}</span>
        <span className="text-11 text-mut">
          {kind.label} · {formatFileSize(file.size)}
        </span>
      </span>
    </a>
  );
}
