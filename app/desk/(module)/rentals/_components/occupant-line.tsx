"use client";

import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import {
  LIVING_WITH_LABEL,
  ROOM_STATE_LABEL,
  exitText,
  monthEnd,
  occupantName,
  stayLength,
  thaiDate,
  type BoardOccupant,
  type BoardRoom,
} from "@/lib/rentals/types";

import { STATE_CHIP } from "./shared";

/** สถานะห้อง — “พักอยู่” เป็นค่าปกติของเกือบทุกแถว จึงเป็นตัวหนังสือเรียบ ๆ ให้ชิปเหลือแค่แถวที่ต้องดู */
export function StateChip({ r, month }: { r: BoardRoom; month: string }) {
  if (r.state === "occupied") return <span className="text-12 whitespace-nowrap text-mut">{ROOM_STATE_LABEL.occupied}</span>;
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span className={`chip px-2 py-0.5 text-11-5 whitespace-nowrap ${STATE_CHIP[r.state]}`}>
        {ROOM_STATE_LABEL[r.state]}
      </span>
      {r.state === "cancelled" && r.room.cancelledOn && r.room.cancelledOn <= monthEnd(month) ? (
        <span className="text-11 text-alert">{thaiDate(r.room.cancelledOn)}</span>
      ) : null}
    </span>
  );
}

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/**
 * ลูกค้า · แพล้นท์ของคน — ไม่ซ้ำกับแพล้นท์ของห้องที่ขึ้นอยู่แล้วในคอลัมน์ห้อง
 * (ห้อง “Scco Mobile Fleet 2” + คน “Scco · Mobile Fleet 2” = ตัดของคนทิ้ง)
 */
function workplaceOf(p: BoardOccupant["person"], roomPlant: string): string {
  const room = squash(roomPlant);
  const parts = [p?.customer, p?.plant].filter((v): v is string => Boolean(v));
  if (room && parts.every((v) => room.includes(squash(v)))) return "";
  return parts.join(" · ");
}

export function OccupantLine({
  o,
  month,
  roomPlant = "",
  link = true,
}: {
  o: BoardOccupant;
  month: string;
  /** แพล้นท์ของห้อง — ถ้าตรงกับของคน ไม่ต้องขึ้นซ้ำ */
  roomPlant?: string;
  link?: boolean;
}) {
  const name = occupantName(o);
  const p = o.person;
  const movedOut = o.stay.checkOut && o.stay.checkOut <= monthEnd(month);
  const meta = [o.stay.drivercode, p?.position, workplaceOf(p, roomPlant)].filter(Boolean);

  return (
    <div className={`flex min-w-0 items-start gap-2.5 ${movedOut ? "opacity-60" : ""}`}>
      <Avatar name={name} src={p?.photoUrl || null} size="sm" className="mt-0.5 flex-none" />
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          {link && o.stay.drivercode && p ? (
            <Link
              href={`/recruitment/admin/drivers/${encodeURIComponent(o.stay.drivercode)}`}
              className="font-medium hover:text-primary hover:underline"
            >
              {name}
            </Link>
          ) : (
            <span className="font-medium">{name}</span>
          )}
          {!o.stay.drivercode ? (
            <span className="chip chip-sla px-1.5 py-0 text-10-5">ยังไม่ผูกทะเบียน</span>
          ) : !p ? (
            <span className="chip chip-sla px-1.5 py-0 text-10-5">ไม่พบในทะเบียน</span>
          ) : !p.active ? (
            <span
              className="chip chip-alert px-1.5 py-0 text-10-5"
              title={p.exit?.source === "work" ? "จากสถานะงานรายวัน — ยังไม่ได้บันทึกพ้นสภาพในทะเบียน" : undefined}
            >
              {exitText(p.exit)}
            </span>
          ) : null}
          {o.stay.livingWith === "family" ? (
            <span className="text-11 text-mut">· {LIVING_WITH_LABEL.family}</span>
          ) : null}
        </p>
        {meta.length ? <p className="truncate text-11-5 text-mut">{meta.join(" · ")}</p> : null}
        <p className="text-11-5 text-mut">
          {movedOut ? (
            <>ย้ายออก {thaiDate(o.stay.checkOut)}</>
          ) : o.stay.checkIn ? (
            <>
              เข้าพัก {thaiDate(o.stay.checkIn)} · {stayLength(o.charge?.days ?? 0)}
            </>
          ) : (
            "ไม่ทราบวันเข้าพัก"
          )}
        </p>
      </div>
    </div>
  );
}
