import Link from "next/link";

import { PageHead } from "@/components/desk/page-head";
import { getHiddenMenuIds } from "@/lib/menu-permissions";

import { Rich } from "./_components/rich";
import { CHANGELOG, MANUAL_EDITION, lastUpdated } from "./_lib/manual";
import { manualEntries, thaiDate } from "./_lib/menu";

export const metadata = { title: "คู่มือการใช้งาน" };

/** หน้ารวมคู่มือ — การ์ดของเมนูที่ผู้ใช้เห็น + ประวัติการปรับปรุง (เฉพาะเมนูที่เห็นเช่นกัน) */
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

      {changes.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-16 font-semibold">ประวัติการปรับปรุง</h2>
          <ol className="flex flex-col divide-y divide-line rounded-xl border border-line bg-base-100">
            {changes.map((v) => (
              <li key={v.date} className="grid gap-1.5 px-4 py-3 sm:grid-cols-[110px_1fr]">
                <span className="text-12-5 font-medium text-mut tabular-nums">{thaiDate(v.date)}</span>
                <ul className="flex flex-col gap-1 text-13">
                  {v.items.map(([id, text]) => (
                    <li key={id + text}>
                      <Link href={`/desk/manual/${id}`} className="font-medium text-primary hover:underline">
                        {labelOf.get(id)}
                      </Link>{" "}
                      <span className="text-mut">
                        — <Rich text={text} />
                      </span>
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
