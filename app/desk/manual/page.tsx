import Link from "next/link";

import { PageHead } from "@/components/desk/page-head";
import { getHiddenMenuIds } from "@/lib/menu-permissions";

import { Rich } from "./_components/rich";
import { CHANGELOG, GLOSSARY, MANUAL_EDITION, lastUpdated } from "./_lib/manual";
import { manualEntries, thaiDate } from "./_lib/menu";

export const metadata = { title: "คู่มือการใช้งาน" };

/** หน้ารวมคู่มือ — การ์ดของเมนูที่ผู้ใช้เห็น + ตัวย่อที่ใช้บ่อย + ประวัติการปรับปรุง (เฉพาะเมนูที่เห็นเช่นกัน) */
export default async function ManualIndexPage() {
  const hidden = new Set(await getHiddenMenuIds());
  const entries = manualEntries(hidden);
  const labelOf = new Map(entries.map((e) => [e.item.id, e.item.label]));
  const changes = CHANGELOG.map((v) => ({ ...v, items: v.items.filter(([id]) => labelOf.has(id)) })).filter(
    (v) => v.items.length,
  );

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHead
        title="คู่มือการใช้งาน"
        subtitle="เลือกเมนูที่ต้องการ — แสดงเฉพาะเมนูที่คุณมีสิทธิ์เห็น"
        actions={<span className="chip chip-live">ฉบับ {thaiDate(MANUAL_EDITION)}</span>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {entries.map(({ item, manual }) => {
          const updated = lastUpdated(item.id);
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={`/desk/manual/${item.id}`}
              className="group flex gap-3 rounded-xl border border-line bg-base-100 p-4 transition-colors hover:border-primary/50 hover:bg-soft/40"
            >
              <span aria-hidden className="brand-tile grid size-10 flex-none place-items-center rounded-[12px]">
                <Icon size={19} strokeWidth={1.8} />
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2 text-14-5 font-semibold group-hover:text-primary">
                  {item.label}
                  {updated === MANUAL_EDITION ? <span className="chip chip-new">อัปเดต</span> : null}
                </span>
                <span className="text-12-5 text-mut text-pretty">{manual.summary}</span>
              </span>
            </Link>
          );
        })}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-16 font-semibold">ตัวย่อที่ใช้บ่อย</h2>
        <dl className="grid gap-x-6 gap-y-2 rounded-xl border border-line bg-base-100 p-4 text-13 sm:grid-cols-2">
          {GLOSSARY.map(([term, meaning]) => (
            <div key={term} className="flex gap-3">
              <dt className="w-16 flex-none font-semibold text-primary">{term}</dt>
              <dd className="text-mut">{meaning}</dd>
            </div>
          ))}
        </dl>
      </section>

      {changes.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-16 font-semibold">ประวัติการปรับปรุง</h2>
          <ol className="flex flex-col divide-y divide-line rounded-xl border border-line bg-base-100">
            {changes.map((v) => (
              <li key={v.date + v.time}className="grid gap-1.5 px-4 py-3 sm:grid-cols-[110px_1fr]">
                <span className="flex flex-col text-12-5 text-mut tabular-nums">
                  <span className="font-medium">{thaiDate(v.date)}</span>
                  <span>{v.time} น.</span>
                </span>
                <ul className="flex flex-col gap-1.5 text-13">
                  {/* ชื่อหน้าขึ้นครั้งเดียว — หลายข้อของหน้าเดียวกันเป็น bullet ย่อยด้านล่าง */}
                  {byMenu(v.items).map(([id, texts]) => (
                    <li key={id}>
                      <Link href={`/desk/manual/${id}`} className="font-medium text-primary hover:underline">
                        {labelOf.get(id)}
                      </Link>
                      <ul className="mt-0.5 flex list-disc flex-col gap-0.5 pl-5 text-mut marker:text-line-strong">
                        {texts.map((text) => (
                          <li key={text}>
                            <Rich text={text} />
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

/** รวมข้อของฉบับเดียวกันตามหน้า — คงลำดับที่หน้านั้นขึ้นครั้งแรก */
function byMenu(items: [string, string][]): [string, string[]][] {
  const groups = new Map<string, string[]>();
  for (const [id, text] of items) groups.set(id, [...(groups.get(id) ?? []), text]);
  return [...groups];
}
