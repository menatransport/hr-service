import { notFound } from "next/navigation";
import { Send } from "lucide-react";

import { Screen } from "@/components/m/screen";
import { ScreenHeader } from "@/components/m/screen-header";
import { AttachmentGallery } from "@/components/ui/attachment-gallery";
import { CaseStepper } from "@/components/ui/case-stepper";
import { TextField } from "@/components/ui/field";
import { ReviewCard } from "@/components/ui/review-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  buildTimeline,
  caseAgeDays,
  departmentLabel,
  formatDateTime,
  isSlaBreached,
  slaTarget,
} from "@/lib/case-flow";
import { getCase } from "@/lib/cases";
import { reasonGroup } from "@/lib/data";

/** เคสมาจาก NCAC API — ห้าม prerender ไว้ตั้งแต่ตอน build */
export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/m/cases/[id]">) {
  const { id } = await props.params;
  const hrCase = await getCase(id);
  return { title: hrCase ? hrCase.trackingNo : "ไม่พบเคส" };
}

export default async function MobileCaseDetailPage(
  props: PageProps<"/m/cases/[id]">,
) {
  const { id } = await props.params;
  const hrCase = await getCase(id);
  if (!hrCase) notFound();

  const overdue = isSlaBreached(hrCase);

  return (
    <>
      <ScreenHeader title={hrCase.trackingNo} backHref="/m/cases" />

      <Screen className="flex flex-col gap-4 px-5 pt-4 pb-6">
        <div className="flex flex-col gap-2">
          <h2 className="text-[17px] leading-snug font-semibold text-pretty">
            {hrCase.subject}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={hrCase.status} />
            <span className="text-[12.5px] text-mut">
              {reasonGroup(hrCase.reasonGroup).label}
            </span>
          </div>
        </div>

        {overdue ? (
          <p className="rounded-box border border-sla/30 bg-sla/6 px-3 py-2 text-[12.5px] text-sla">
            เปิดมา {caseAgeDays(hrCase)} วัน เกินเกณฑ์ {slaTarget(hrCase.priority)}{" "}
            วัน — ทีมงานได้รับการแจ้งเตือนแล้ว
          </p>
        ) : null}

        {/* ความคืบหน้าขึ้นก่อน — คนขับเปิดมาเพื่อดูว่าถึงไหนแล้ว */}
        <CaseStepper steps={buildTimeline(hrCase)} />

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">เรื่องที่แจ้งไว้</h3>
          <p className="text-[13.5px] leading-relaxed text-mut text-pretty">
            {hrCase.detail}
          </p>
        </section>

        <dl className="divide-y divide-line overflow-hidden rounded-box border border-line">
          <Fact label="แจ้งเมื่อ" value={formatDateTime(hrCase.createdAt)} />
          <Fact label="ผู้รับผิดชอบ" value={departmentLabel(hrCase.departmentId)} />
          {hrCase.complaintType ? (
            <Fact label="ประเภทเรื่อง" value={hrCase.complaintType} />
          ) : null}
          <Fact
            label={hrCase.closedAt ? "ใช้เวลาทั้งหมด" : "เปิดมาแล้ว"}
            value={`${caseAgeDays(hrCase)} วัน`}
          />
        </dl>

        {hrCase.solution ? (
          <section className="flex flex-col gap-2 border-t border-line pt-4">
            <h3 className="text-sm font-semibold">แนวทางแก้ไข</h3>
            <p className="text-[13.5px] leading-relaxed text-mut text-pretty">
              {hrCase.solution}
            </p>
            {hrCase.result ? (
              <>
                <h3 className="pt-2 text-sm font-semibold">ผลการดำเนินงาน</h3>
                <p className="text-[13.5px] leading-relaxed text-mut text-pretty">
                  {hrCase.result}
                </p>
              </>
            ) : null}
          </section>
        ) : null}

        {hrCase.reviews.length ? (
          <section className="flex flex-col gap-2.5 border-t border-line pt-4">
            <h3 className="text-sm font-semibold">การอนุมัติ</h3>
            {hrCase.reviews.map((r) => (
              <ReviewCard key={r.level} review={r} />
            ))}
          </section>
        ) : null}

        {hrCase.notes.length ? (
          <section className="flex flex-col gap-2.5 border-t border-line pt-4">
            <h3 className="text-sm font-semibold">ข้อความจากทีมงาน</h3>
            {hrCase.notes.map((note, i) => (
              <div
                key={i}
                className="flex flex-col gap-1.5 rounded-box bg-base-200 p-3.5"
              >
                <span className="text-[12px] text-mut">
                  {note.author} · {formatDateTime(note.at)}
                </span>
                <p className="text-[13.5px] text-pretty">{note.body}</p>
              </div>
            ))}
          </section>
        ) : null}

        {hrCase.attachments.length ? (
          <section className="flex flex-col gap-3 border-t border-line pt-4">
            <h3 className="text-sm font-semibold">
              ไฟล์แนบ ({hrCase.attachments.length})
            </h3>
            <AttachmentGallery urls={hrCase.attachments} thumb={70} />
          </section>
        ) : null}
      </Screen>

      <form className="flex flex-none items-center gap-2.5 border-t border-line px-5 pt-3.5 pb-safe md:pb-5">
        <TextField
          id="reply"
          label="ส่งข้อความถึงผู้รับผิดชอบ"
          srLabel
          size="lg"
          placeholder="ส่งข้อความถึงผู้รับผิดชอบ"
          className="min-w-0 flex-1"
        />
        <button
          type="submit"
          aria-label="ส่งข้อความ"
          className="flex size-[46px] flex-none items-center justify-center rounded-field bg-primary text-primary-content transition-transform active:scale-[0.96]"
        >
          <Send size={20} strokeWidth={1.7} aria-hidden />
        </button>
      </form>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 px-3.5 py-2.5">
      <dt className="flex-none text-[12.5px] text-mut">{label}</dt>
      <dd className="min-w-0 flex-1 text-right text-[13px] font-medium text-pretty">
        {value}
      </dd>
    </div>
  );
}
