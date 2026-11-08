import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Lock, TriangleAlert } from "lucide-react";

import { getHiddenMenuIds } from "@/lib/menu-permissions";

import { ButtonList, PointList } from "../_components/bullets";
import { CardViews } from "../_components/card-views";
import { Rich } from "../_components/rich";
import { ScreenSketch } from "../_components/screen-sketch";
import { changesOf, lastUpdated, type Tone } from "../_lib/manual";
import { manualEntries, thaiDate } from "../_lib/menu";

const TONE: Record<Tone, string> = {
  new: "chip-new",
  wait: "chip-wait",
  live: "chip-live",
  done: "chip-done",
  ok: "chip-ok",
  alert: "chip-alert",
  pink: "chip-pink",
};

export async function generateMetadata(props: PageProps<"/desk/manual/[page]">) {
  const { page } = await props.params;
  const entry = manualEntries(new Set(await getHiddenMenuIds())).find((e) => e.item.id === page);
  return { title: entry ? `คู่มือ · ${entry.item.label}` : "คู่มือการใช้งาน" };
}

/**
 * คู่มือของหนึ่งเมนู — บน → ล่าง: ส่วนต่าง ๆ บนจอ (ภาพจำลอง + ปุ่ม) · การ์ดสรุป (ถ้ามี) · ขั้นตอน · สถานะ · ตัวอย่าง · ข้อควรรู้
 * เมนูที่ผู้ใช้มองไม่เห็นก็เปิดคู่มือไม่ได้ (หาไม่เจอเหมือนเมนูเอง)
 */
export default async function ManualPage(props: PageProps<"/desk/manual/[page]">) {
  const { page } = await props.params;
  const hidden = new Set(await getHiddenMenuIds());
  const entry = manualEntries(hidden).find((e) => e.item.id === page);
  if (!entry) notFound();

  const { manual, item, group, parentLabel } = entry;
  const Icon = item.icon;
  const updated = lastUpdated(item.id);
  const changes = changesOf(item.id);

  return (
    <article className="mx-auto flex max-w-[960px] flex-col gap-8 pt-4 pb-12 sm:pt-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <span aria-hidden className="brand-tile grid size-11 flex-none place-items-center rounded-[14px]">
            <Icon size={21} strokeWidth={1.8} />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-12 text-mut">
              {group.label}
              {parentLabel ? ` / ${parentLabel}` : ""}
            </p>
            <h1 className="text-22 font-semibold tracking-[-0.01em] text-balance">{item.label}</h1>
            <p className="max-w-[62ch] text-13-5 text-mut text-pretty">
              <Rich text={manual.summary} />
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {updated ? <span className="chip chip-live">ปรับล่าสุด {thaiDate(updated)}</span> : null}
          <Link href={item.href} className="btn-sec flex items-center gap-1 px-3 py-1.5 text-13 hover:text-primary">
            เปิดหน้านี้
            <ArrowUpRight size={14} strokeWidth={2} aria-hidden />
          </Link>
        </div>
      </header>

      {manual.banner ? (
        <p className="flex items-center gap-2 rounded-xl border border-st-wait-line bg-st-wait px-4 py-3 text-13-5 text-st-wait-ink">
          <TriangleAlert size={16} aria-hidden className="flex-none" />
          {manual.banner}
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-16 font-semibold">บนหน้าจอ · บน → ล่าง</h2>
        <ol className="flex flex-col gap-3">
          {manual.parts.map((part, i) => {
            const locked = part.perm ? hidden.has(part.perm) : false;
            return (
              <li
                key={part.title}
                className={`grid gap-3 rounded-xl border border-line bg-base-100 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] ${locked ? "opacity-55" : ""}`}
              >
                <div className="flex min-w-0 gap-3">
                  <span className="grid size-6 flex-none place-items-center rounded-full bg-primary text-12 font-semibold text-primary-content tabular-nums">
                    {i + 1}
                  </span>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <h3 className="flex flex-wrap items-center gap-2 text-14-5 font-semibold">
                      {part.title}
                      {locked ? (
                        <span className="chip chip-done">
                          <Lock size={11} aria-hidden /> คุณไม่มีสิทธิ์ส่วนนี้
                        </span>
                      ) : null}
                    </h3>
                    {part.points?.length ? <PointList points={part.points} /> : null}
                    {part.buttons?.length ? <ButtonList buttons={part.buttons} /> : null}
                  </div>
                </div>
                {part.sketch ? <ScreenSketch sketch={part.sketch} /> : null}
              </li>
            );
          })}
        </ol>
      </section>

      {manual.cards ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-16 font-semibold">กดการ์ดสรุป แล้วเห็นอะไร</h2>
          <CardViews cards={manual.cards} />
        </section>
      ) : null}

      {manual.steps?.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-16 font-semibold">ขั้นตอนที่ใช้บ่อย</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {manual.steps.map((step) => {
              const locked = step.perm ? hidden.has(step.perm) : false;
              return (
                <div key={step.title} className={`rounded-xl border border-line bg-base-100 p-4 ${locked ? "opacity-55" : ""}`}>
                  <h3 className="mb-2 text-14 font-semibold">{step.title}</h3>
                  <ol className="flex flex-col gap-1.5 text-13">
                    {step.items.map((s, i) => (
                      <li key={s} className="flex gap-2">
                        <span className="grid size-5 flex-none place-items-center rounded-md border border-primary/60 text-11 font-semibold text-primary tabular-nums">
                          {i + 1}
                        </span>
                        <span>
                          <Rich text={s} />
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {manual.statuses?.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-16 font-semibold">สถานะ</h2>
          <ul className="grid gap-x-6 gap-y-2 text-13 sm:grid-cols-2">
            {manual.statuses.map(([label, tone, meaning]) => (
              <li key={label} className="flex items-center gap-2">
                <span className={`chip ${TONE[tone]} flex-none`}>{label}</span>
                <span className="text-mut">{meaning}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {manual.example ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-16 font-semibold">{manual.example.title}</h2>
          <ul className="flex flex-col gap-1.5 rounded-xl border border-line bg-base-100 p-4 text-13">
            {manual.example.items.map((t) => (
              <li key={t} className="flex gap-2">
                <span aria-hidden className="text-primary">•</span>
                <span>
                  <Rich text={t} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {manual.tips?.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-16 font-semibold">ข้อควรรู้</h2>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-13 text-mut">
            {manual.tips.map((t) => (
              <li key={t}>
                <Rich text={t} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {changes.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-16 font-semibold">มีอะไรใหม่</h2>
          <ul className="flex flex-col gap-1 text-13">
            {changes.map((c) => (
              <li key={c.date + c.text} className="flex gap-3">
                <span className="w-36 flex-none text-mut tabular-nums">
                  {thaiDate(c.date)} · {c.time} น.
                </span>
                <span>
                  <Rich text={c.text} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
