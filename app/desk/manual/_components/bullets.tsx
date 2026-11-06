import type { Btn } from "../_lib/manual";

import { Rich } from "./rich";

/** สิ่งที่เห็นบนจอ — bullet ธรรมดา */
export function PointList({ points }: { points: string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-13 marker:text-line-strong">
      {points.map((p) => (
        <li key={p}>
          <Rich text={p} />
        </li>
      ))}
    </ul>
  );
}

/**
 * ปุ่มและหน้าที่ — หนึ่งปุ่มหนึ่ง bullet: [ชื่อปุ่ม] กดแล้วเกิดอะไร · รายละเอียดย่อยเป็น bullet ซ้อน
 * ชื่อปุ่มอยู่ในกรอบเหมือนปุ่มจริง คนอ่านจึงหาเจอบนจอได้ทันที
 */
export function ButtonList({ buttons }: { buttons: Btn[] }) {
  return (
    <ul className="flex flex-col gap-2 text-13">
      {buttons.map(([label, does, more]) => (
        <li key={label} className="flex flex-col gap-1">
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span aria-hidden className="text-primary">•</span>
            <span className="rounded-md border border-line-strong bg-base-100 px-1.5 text-12-5 font-medium">{label}</span>
            <span>
              <Rich text={does} />
            </span>
          </p>
          {more?.length ? (
            <ul className="ml-6 flex list-[circle] flex-col gap-0.5 pl-4 text-12-5 text-mut">
              {more.map((m) => (
                <li key={m}>
                  <Rich text={m} />
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
