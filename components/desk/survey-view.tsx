"use client";

import { useState } from "react";
import { BarChart3, CheckCircle2, ClipboardPenLine, Table2 } from "lucide-react";

import { PageHead } from "@/components/desk/page-head";
import { SurveyCharts } from "@/components/desk/survey-charts";
import { SurveyTable } from "@/components/desk/survey-table";
import { SURVEY_FORMS, type SurveyResponse } from "@/lib/survey-forms";

/**
 * หน้าดูผลแบบสอบถาม — เลือกแบบฟอร์มก่อน แล้วค่อยดูผล
 *
 * ตอนนี้มีฟอร์มเดียว ตัวเลือกจึงถูกเลือกไว้ให้เลย ไม่ต้องคลิกซ้ำ แต่ยังโชว์การ์ด
 * ให้เห็นว่ากำลังดูชุดไหน และรองรับการเพิ่มชุดที่สองโดยไม่ต้องรื้อหน้า
 * (ฟอร์มใหม่ใส่ที่ `SURVEY_FORMS` ใน `lib/survey-forms.ts`)
 */

type Tab = "table" | "charts";

const TABS: { id: Tab; label: string; icon: typeof Table2 }[] = [
  { id: "table", label: "ตารางคำตอบ", icon: Table2 },
  { id: "charts", label: "วิเคราะห์ผล", icon: BarChart3 },
];

export function SurveyView({ responses }: { responses: SurveyResponse[] }) {
  const [formId, setFormId] = useState(SURVEY_FORMS[0]?.id ?? "");
  const [tab, setTab] = useState<Tab>("table");

  const form = SURVEY_FORMS.find((f) => f.id === formId) ?? SURVEY_FORMS[0];

  return (
    <div className="flex animate-rise flex-col gap-5">
      <PageHead
        title="แบบสอบถาม"
        subtitle="เลือกแบบฟอร์มที่ต้องการดูผล แล้วอ่านคำตอบเป็นตารางหรือดูภาพรวมเป็นกราฟ"
      />

      <section className="flex flex-col gap-2.5">
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {SURVEY_FORMS.map((f) => {
            const on = f.id === form?.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFormId(f.id)}
                aria-pressed={on}
                className={`flex items-start gap-3 rounded-box border p-4 text-left transition-colors ${
                  on
                    ? "border-primary/45 bg-soft"
                    : "border-line bg-base-100 hover:border-primary/30"
                }`}
              >
                <span
                  className={`flex size-9 flex-none items-center justify-center rounded-full ${
                    on ? "bg-primary text-ink-content" : "bg-base-200 text-mut"
                  }`}
                >
                  <ClipboardPenLine size={17} strokeWidth={1.7} aria-hidden />
                </span>

                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-[13.5px] font-semibold text-pretty">{f.title}</span>
                    {on ? (
                      <CheckCircle2
                        size={16}
                        strokeWidth={1.9}
                        className="mt-0.5 flex-none text-primary"
                        aria-hidden
                      />
                    ) : null}
                  </span>
                  <span className="text-[12px] text-mut text-pretty">{f.subtitle}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div
          role="tablist"
          aria-label="มุมมองผลแบบสอบถาม"
          className="flex w-fit gap-1 rounded-full border border-line bg-base-100 p-1"
        >
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors ${
                tab === id ? "bg-ink text-ink-content" : "text-mut hover:text-ink"
              }`}
            >
              <Icon size={14} strokeWidth={1.9} aria-hidden />
              {label}
            </button>
          ))}
        </div>

        {tab === "table" ? (
          <SurveyTable responses={responses} surveyId={form?.id ?? formId} />
        ) : (
          <SurveyCharts responses={responses} />
        )}
      </section>
    </div>
  );
}
