import Link from "next/link";
import { ArrowUpRight, BedDouble, Building2, CalendarDays, MapPin, Phone, Wallet } from "lucide-react";

import { SOON } from "@/lib/modules";
import { getStaysOfDriver } from "@/lib/rentals/store";
import { LIVING_WITH_LABEL, PAY_MODE_LABEL, daysBetween, payModeShort, stayLength, thaiDate } from "@/lib/rentals/types";
import { todayInBangkok } from "@/app/recruitment/_lib/drivers/registry";

/**
 * ส่วน “ห้องพักบริษัท” บนหน้าประวัติ พจส. — **อ่านสดจากเมนูจัดการห้องเช่า** (`rental_stays` ด้วย `drivercode`)
 * ไม่มีข้อมูลห้องเก็บซ้ำในทะเบียน · ย้ายห้อง/ย้ายออกที่หน้าห้องเช่าแล้วหน้านี้ตามเอง
 */
export async function DriverRental({ drivercode }: { drivercode: string }) {
  let rows: Awaited<ReturnType<typeof getStaysOfDriver>>;
  try {
    rows = await getStaysOfDriver(drivercode);
  } catch {
    return <p className="text-13 text-mut">อ่านข้อมูลห้องเช่าไม่สำเร็จ — ลองรีเฟรชอีกครั้ง</p>;
  }

  const today = todayInBangkok();
  const current = rows.find((r) => !r.stay.checkOut || r.stay.checkOut >= today);
  const past = rows.filter((r) => r !== current);

  return (
    <div className="flex flex-col gap-4">
      {current ? (
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <Item icon={Building2} label="ที่พัก" value={current.apartment.name} />
          <Item
            icon={BedDouble}
            label="ห้อง"
            value={`ห้อง ${current.room.roomNo}`}
            note={[current.room.plant, LIVING_WITH_LABEL[current.stay.livingWith]].filter(Boolean).join(" · ")}
          />
          <Item
            icon={CalendarDays}
            label="เข้าพัก"
            value={current.stay.checkIn ? thaiDate(current.stay.checkIn, "full") : "ไม่ทราบ"}
            note={
              current.stay.checkOut
                ? `ย้ายออก ${thaiDate(current.stay.checkOut, "full")}`
                : current.stay.checkIn
                  ? `พักมา ${stayLength(daysBetween(current.stay.checkIn, today))}`
                  : undefined
            }
          />
          <Item
            icon={Wallet}
            label="ค่าห้อง"
            value={`${current.room.rent.toLocaleString("th-TH")} บาท/เดือน`}
            note={payModeShort(current.room.payMode, current.room.cap)}
            title={PAY_MODE_LABEL[current.room.payMode]}
          />
          {current.apartment.phone ? (
            <Item
              icon={Phone}
              label="ติดต่อที่พัก"
              value={current.apartment.phone}
              note={current.apartment.owner || undefined}
              href={`tel:${current.apartment.phone.replace(/[^\d+]/g, "")}`}
            />
          ) : null}
          {current.apartment.mapUrl ? (
            <Item icon={MapPin} label="แผนที่" value="เปิด Google Maps" href={current.apartment.mapUrl} external />
          ) : null}
        </dl>
      ) : (
        <p className="text-13 text-mut">ไม่ได้พักห้องเช่าของบริษัท</p>
      )}

      {past.length ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-11-5 text-mut">เคยพัก</p>
          <ul className="flex flex-col">
            {past.map(({ stay, room, apartment }) => (
              <li key={stay.id} className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line/70 py-1.5 text-12-5 last:border-b-0">
                <span>
                  {apartment.name} · ห้อง {room.roomNo}
                </span>
                <span className="text-mut tabular-nums">
                  {thaiDate(stay.checkIn) || "?"} – {stay.checkOut ? thaiDate(stay.checkOut) : "ปัจจุบัน"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!SOON ? (
        <Link
          href="/desk/rentals"
          className="inline-flex w-fit items-center gap-1 text-12-5 text-primary hover:underline"
        >
          จัดการห้องเช่า <ArrowUpRight size={13} aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

function Item({
  icon: Icon,
  label,
  value,
  note,
  href,
  external,
  title,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean; className?: string }>;
  label: string;
  value: string;
  note?: string;
  href?: string;
  external?: boolean;
  title?: string;
}) {
  const body = <span className="text-13-5">{value}</span>;
  return (
    <div className="flex min-w-0 gap-2.5" title={title}>
      <Icon size={15} strokeWidth={1.7} aria-hidden className="mt-0.5 flex-none text-mut" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <dt className="text-11-5 text-mut">{label}</dt>
        <dd className="m-0 flex flex-col gap-0.5">
          {href ? (
            <a
              href={href}
              {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
              className="w-fit transition-colors hover:text-primary"
            >
              {body}
            </a>
          ) : (
            body
          )}
          {note ? <span className="text-11-5 text-mut">{note}</span> : null}
        </dd>
      </div>
    </div>
  );
}
