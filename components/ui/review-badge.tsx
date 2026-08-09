import { formatDateTime, reviewMeta } from "@/lib/case-flow";
import type { CaseReview } from "@/lib/types";

/** ผลการตรวจสอบของผู้อนุมัติหนึ่งระดับ */
export function ReviewBadge({ review }: { review: CaseReview }) {
  const meta = reviewMeta[review.status];

  return (
    <span
      className={`inline-flex flex-none items-center rounded-full px-2.5 py-[3px] text-[11.5px] font-medium whitespace-nowrap ${meta.chip}`}
    >
      {meta.label}
    </span>
  );
}

/** กล่องสรุปผลอนุมัติหนึ่งระดับ — ชื่อผู้อนุมัติ สถานะ หมายเหตุ และเวลา */
export function ReviewCard({ review }: { review: CaseReview }) {
  return (
    <div className="flex flex-col gap-2 rounded-box border border-line bg-base-200 p-3">
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[13px] font-medium">
            ระดับ {review.level} · {review.reviewerName}
          </span>
          <span className="text-[11.5px] text-mut">
            {review.reviewerPosition}
          </span>
        </div>
        <ReviewBadge review={review} />
      </div>
      {review.remark ? (
        <p className="text-[12.5px] text-mut text-pretty">
          “{review.remark}”
        </p>
      ) : null}
      {review.reviewedAt ? (
        <span className="text-[11.5px] text-mut">
          {formatDateTime(review.reviewedAt)}
        </span>
      ) : null}
    </div>
  );
}
