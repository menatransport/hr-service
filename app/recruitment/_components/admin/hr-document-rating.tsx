import { Loader2, Save, Star } from "lucide-react";

import { Sheet } from "@/app/recruitment/_components/admin/hr-document-paper";
import { SelectField } from "@/components/ui/field";
import {
  formatScore,
  type RatedItem,
  type RatingLevel,
  type RatingResult,
} from "@/app/recruitment/_lib/driver-rating";
import { displayAnswer, formatPhone } from "@/app/recruitment/_lib/form";
import { thaiLongDate, todayIso } from "@/app/recruitment/_lib/hr-documents";
import { customerLabel, type Requisition } from "@/app/recruitment/_lib/requisitions/types";
import type { Application, QuestionSnapshot } from "@/app/recruitment/_lib/types";

/**
 * Driver Rating — กระดาษ (`RatingSheet`) กับแผงให้คะแนน (`RatingEditor`)
 *
 * หน้าตากระดาษลอกชีต “หน้าแสดง report” ของ `driver_rating.xlsx`: หัวข้อมูลผู้สมัคร →
 * ตาราง 20 ข้อแบ่งตามหมวดพร้อมค่าเฉลี่ยท้ายหมวด → รวมคะแนน/เฉลี่ย/สรุปผล · เพิ่มแถบ
 * สรุปไว้บนสุดด้วย เพราะคนที่หยิบใบนี้ขึ้นมาอยากรู้ผลก่อนรายละเอียด
 *
 * สองชิ้นนี้ไม่มี state ของตัวเอง — ร่างคะแนนอยู่ที่ `hr-document-maker.tsx` เพราะ
 * กระดาษต้องขยับตามทันทีที่เลือกคำตอบในแผง
 */

/* ------------------------------------------------------------------ กระดาษ */

export function RatingSheet({
  application,
  result,
  requisition,
}: {
  application: Application;
  result: RatingResult;
  requisition: Requisition | null;
}) {
  const find = (words: string[], excludes: string[] = []) =>
    answerByWords(application, words, excludes);

  const license = [
    application.documents.licenseType || find(["ใบขับขี่"], ["หมดอายุ"]),
    application.documents.licenseExpiry
      ? `หมดอายุ ${thaiLongDate(application.documents.licenseExpiry)}`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const workplace = requisition
    ? [customerLabel(requisition), requisition.plant].filter(Boolean).join(" : ")
    : find(["เขต"]);

  return (
    <Sheet letterhead>
      <h1 className="hrdoc-title">Driver Rating</h1>
      <p className="hrdoc-small mb-[3mm] text-center text-paper-mut">
        แบบประเมินผู้สมัครพนักงานขับรถ · เลขที่ใบสมัคร {application.ref}
      </p>

      <table className="hrdoc-kv hrdoc-kv-4">
        <tbody>
          <tr>
            <th>เจ้าหน้าที่สรรหา (RC)</th>
            <td>{application.contactOwner || "—"}</td>
            <th>วันที่สัมภาษณ์</th>
            <td>{application.interview.date ? thaiLongDate(application.interview.date) : "—"}</td>
          </tr>
          <tr>
            <th>ชื่อ–นามสกุล</th>
            <td className="font-bold">{application.fullName}</td>
            <th>อายุ</th>
            <td>{find(["อายุ"], ["หมดอายุ"]) ? `${find(["อายุ"], ["หมดอายุ"])} ปี` : "—"}</td>
          </tr>
          <tr>
            <th>เบอร์ติดต่อ</th>
            <td>{formatPhone(application.phone)}</td>
            <th>ลูกค้า : สถานที่ทำงาน</th>
            <td>{workplace || "—"}</td>
          </tr>
          <tr>
            <th>ใบขับขี่ / วันหมดอายุ</th>
            <td>{license || "—"}</td>
            <th>ที่พักของบริษัท</th>
            <td>{find(["ที่พัก"], ["ปัจจุบัน"]) || "—"}</td>
          </tr>
          <tr>
            <th>ประสบการณ์ขับรถ</th>
            <td colSpan={3}>{find(["ขับรถประเภท"], ["เกียร์"]) || "—"}</td>
          </tr>
          <tr>
            <th>ทราบข่าวการรับสมัครจาก</th>
            <td>{find(["ทราบข่าว"]) || "—"}</td>
            <th>เคยทำงานกับมีนาทรานสปอร์ต</th>
            <td>{find(["มีนา"]) || "—"}</td>
          </tr>
        </tbody>
      </table>

      <ResultBand result={result} />

      <table className="hrdoc-table hrdoc-rating mt-[4mm]">
        <thead>
          <tr>
            <th className="w-[8mm]">ข้อ</th>
            <th>คำถาม</th>
            <th className="w-[16mm]">คะแนน (1–5)</th>
            <th className="w-[62mm]">คำตอบ / การตีความ</th>
          </tr>
        </thead>
        {result.categories.map((category) => (
          <tbody key={category.id}>
            <tr className="hrdoc-rating-cat">
              <td colSpan={4}>{category.label}</td>
            </tr>
            {category.items.map((item) => (
              <RatingRow key={item.question.id} item={item} />
            ))}
            <tr className="hrdoc-rating-avg">
              <td colSpan={2}>{category.label} · คะแนนเฉลี่ย</td>
              <td className="text-center">{formatScore(category.average)}</td>
              <td>{levelText(category.level)}</td>
            </tr>
          </tbody>
        ))}
        <tbody>
          <tr className="hrdoc-rating-total">
            <td colSpan={2}>รวมคะแนนทั้งหมด</td>
            <td className="text-center">{result.total}</td>
            <td>คะแนน / เต็ม {result.max}</td>
          </tr>
          <tr className="hrdoc-rating-total">
            <td colSpan={2}>Driver Rating คะแนนเฉลี่ย</td>
            <td className="text-center">{formatScore(result.average)}</td>
            <td>เฉลี่ยของค่าเฉลี่ยแต่ละหมวด</td>
          </tr>
          <tr className="hrdoc-rating-total">
            <td colSpan={2}>สรุปผลสัมภาษณ์</td>
            <td colSpan={2}>{levelText(result.level)}</td>
          </tr>
        </tbody>
      </table>

      {/* ไม่มีช่องลงนาม — ถอดออกตามคำสั่งเจ้าของงาน (29 ก.ย. 2026) ใบนี้เป็นผลประเมิน
          ไม่ใช่เอกสารที่ต้องเซ็นรับรอง · ใครประเมินล่าสุดดูได้จากบรรทัดท้ายใบ */}
      <p className="hrdoc-small mt-auto pt-[6mm] text-paper-mut">
        {application.rating.by
          ? `ให้คะแนนล่าสุดโดย ${application.rating.by} · `
          : ""}
        พิมพ์เมื่อ {thaiLongDate(todayIso())}
      </p>
    </Sheet>
  );
}

/** แถบผลรวมบนสุด — คะแนนเฉลี่ยตัวใหญ่ ระดับ และความหมาย */
function ResultBand({ result }: { result: RatingResult }) {
  return (
    <div className="hrdoc-keep hrdoc-rating-band">
      <div className="flex flex-col items-center">
        <span className="hrdoc-rating-score">{formatScore(result.average)}</span>
        <span className="hrdoc-small">คะแนนเฉลี่ย / 5</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-bold">
          {result.level ? `ระดับ “${result.level.label}”` : "ยังไม่มีคะแนน"}
          {/* ยังประเมินไม่ครบ 20 ข้อ = ผลอาจเปลี่ยนเมื่อสัมภาษณ์ครบ — บอกไว้บนกระดาษ
              กันคนอ่านเข้าใจว่าเป็นผลสรุปแล้ว */}
          {result.level && result.scored < result.count ? " · ผลชั่วคราว (ประเมินยังไม่ครบ)" : ""}
        </span>
        <span>{result.level?.meaning ?? "ให้คะแนนในแผงซ้ายของกล่องทำเอกสาร"}</span>
        <span className="hrdoc-small text-paper-mut">
          รวม {result.total} / {result.max} คะแนน · ประเมินแล้ว {result.scored} จาก {result.count} ข้อ
        </span>
      </div>
      <div className="hrdoc-small flex flex-col gap-[0.5mm]">
        {/* ค่าเฉลี่ยรายหมวด — อ่านจุดอ่อนได้ในตาเดียวโดยไม่ต้องไล่ตาราง */}
        {result.categories.map((c) => (
          <span key={c.id} className="flex justify-between gap-[3mm]">
            <span>{c.label}</span>
            <span className="font-bold">{formatScore(c.average)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function RatingRow({ item }: { item: RatedItem }) {
  const { answer } = item;
  return (
    <tr>
      <td className="text-center">{item.no}</td>
      <td>{item.question.label}</td>
      <td className="text-center font-bold text-paper-fill">{answer ? answer.score : "—"}</td>
      <td>
        {answer ? (
          <>
            <span className="text-paper-fill">{answer.label}</span>
            {answer.note ? <span className="block text-paper-mut">{answer.note}</span> : null}
            {item.source === "form" ? (
              <span className="hrdoc-small block text-paper-mut">(จากใบสมัครออนไลน์)</span>
            ) : null}
          </>
        ) : (
          <span className="text-paper-mut">
            ยังไม่ได้ประเมิน{item.formAnswer ? ` · ใบสมัครตอบ: ${item.formAnswer}` : ""}
          </span>
        )}
      </td>
    </tr>
  );
}

function levelText(level: RatingLevel | null): string {
  return level ? `[${level.label}] ${level.meaning}` : "—";
}

/** คำตอบในใบสมัครของข้อที่ข้อความคำถามมีคำเหล่านี้ครบ — ใช้เติมหัวข้อมูลของใบ */
function answerByWords(application: Application, words: string[], excludes: string[]): string {
  const q: QuestionSnapshot | undefined = application.questionSnapshot.find(
    (s) => words.every((w) => s.label.includes(w)) && !excludes.some((w) => s.label.includes(w)),
  );
  if (!q) return "";
  const text = displayAnswer(application.answers[q.key], q.options);
  return text === "—" ? "" : text;
}

/* ------------------------------------------------------------- แผงให้คะแนน */

/** โทนสีบนจอของแต่ละระดับ — ใช้ร่วมกับปุ่มดาวในตาราง */
export const RATING_TONE: Record<RatingLevel["tone"] | "none", string> = {
  excellent: "bg-st-live text-st-live-ink",
  good: "bg-st-live text-st-live-ink",
  fair: "bg-st-wait text-st-wait-ink",
  low: "bg-alert/12 text-alert",
  risk: "bg-alert/12 text-alert",
  none: "bg-base-200 text-mut",
};

export function RatingEditor({
  result,
  saved,
  dirty,
  saving,
  canEdit,
  onPick,
  onSave,
}: {
  result: RatingResult;
  /** คำตอบที่บันทึกไว้แล้ว — บอกว่าข้อไหนเป็นของที่ให้เองและยังไม่ได้แก้ */
  saved: Record<string, string>;
  /** จำนวนข้อที่แก้แล้วยังไม่บันทึก */
  dirty: number;
  saving: boolean;
  canEdit: boolean;
  onPick: (id: string, label: string) => void;
  onSave: () => void;
}) {
  const tone = RATING_TONE[result.level?.tone ?? "none"];

  return (
    <div className="flex flex-col gap-4">
      <div className={`flex items-center gap-3 rounded-field px-3 py-2.5 ${tone}`}>
        <Star size={18} strokeWidth={2} aria-hidden className="flex-none" />
        <div className="flex min-w-0 flex-col">
          <span className="text-15 font-semibold tabular-nums">
            {formatScore(result.average)}
            <span className="ml-1.5 text-12-5 font-medium">
              {result.level ? result.level.label : "ยังไม่มีคะแนน"}
            </span>
          </span>
          <span className="text-11-5">
            รวม {result.total}/{result.max} · ประเมินแล้ว {result.scored}/{result.count} ข้อ
          </span>
        </div>
      </div>

      {canEdit ? (
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || saving}
          className="btn-pri flex items-center justify-center gap-2 px-4 py-2.5 text-13 font-medium disabled:opacity-40"
        >
          {saving ? (
            <Loader2 size={14} strokeWidth={2} aria-hidden className="animate-spin" />
          ) : (
            <Save size={14} strokeWidth={2} aria-hidden />
          )}
          {dirty ? `บันทึกผลประเมิน (${dirty} ข้อ)` : "บันทึกแล้ว"}
        </button>
      ) : null}

      {result.categories.map((category) => (
        <div key={category.id} className="flex flex-col gap-3">
          <p className="flex items-baseline justify-between gap-2 border-b border-line pb-1 text-12-5 font-semibold">
            {category.label}
            <span className="font-mono text-11-5 text-mut tabular-nums">
              เฉลี่ย {formatScore(category.average)}
            </span>
          </p>
          {category.items.map((item) => {
            const id = item.question.id;
            return (
              <SelectField
                key={id}
                id={`rating-${id}`}
                label={`${item.no}. ${item.question.label}`}
                optional
                readOnly={!canEdit || saving}
                placeholder="เลือกคำตอบ"
                clearable={id in saved || item.source === "manual"}
                options={item.question.answers.map((a) => ({
                  value: a.label,
                  label: `${a.score} · ${a.label}`,
                }))}
                value={item.answer?.label ?? ""}
                onChange={(label) => onPick(id, label)}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
