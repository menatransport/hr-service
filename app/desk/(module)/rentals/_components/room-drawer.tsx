"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, CalendarDays, Link2, LogOut, RotateCcw, Save, UserPlus } from "lucide-react";

import { DateField, NumberField, SelectField, TextField, TextareaField } from "@/components/ui/field";
import { SegmentedControl } from "@/components/ui/summary-panel";
import { requestJson } from "@/lib/http";
import { runAction, toastError } from "@/lib/swal";
import {
  BILL_FIELDS,
  BILL_FIELD_LABEL,
  DEFAULT_CAP,
  LIVING_WITH_LABEL,
  PAY_MODES,
  PAY_MODE_HINT,
  PAY_MODE_LABEL,
  ROOM_STATE_LABEL,
  monthEnd,
  monthLabel,
  occupantName,
  thaiDate,
  type BoardOccupant,
  type BoardRoom,
  type LivingWith,
  type RegistryPerson,
  type RentPayMode,
  type RentalBoard,
  type RentalRoom,
  type RentalStay,
} from "@/lib/rentals/types";
import type { DriverPick } from "@/app/recruitment/_lib/drivers/types";

import { MoneyCell } from "./money-cell";
import { OccupantLine } from "./occupant-line";
import { ResidentPicker } from "./resident-picker";
import { Drawer, DrawerSection, STATE_CHIP, baht } from "./shared";

/**
 * แผงขวาของห้อง — ผู้พัก (เข้า/ออก/ผูกทะเบียน) · ค่าใช้จ่ายเดือนนี้ · รายละเอียดสัญญา · ประวัติผู้พัก · ยกเลิกสัญญา
 * ส่ง `newApartmentId` แทน `r` = ฟอร์มเพิ่มห้องใหม่
 *
 * ทุกคำสั่งบันทึกแล้ว `router.refresh()` — ตัวเลขทั้งตาราง/แผงคิดใหม่จากเซิร์ฟเวอร์ ไม่คิดซ้ำฝั่งนี้
 */
export function RoomDrawer({
  board,
  r,
  newApartmentId,
  onClose,
  onCreated,
}: {
  board: RentalBoard;
  r?: BoardRoom;
  newApartmentId?: string;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());

  if (!r) {
    return (
      <Drawer eyebrow="เพิ่มห้องเช่า" title="ห้องใหม่" onClose={onClose}>
        <RoomForm
          board={board}
          apartmentId={newApartmentId ?? ""}
          onSaved={(room) => {
            refresh();
            onCreated?.(room.id);
          }}
        />
      </Drawer>
    );
  }

  const { room, apartment } = r;
  const cancelled = r.state === "cancelled";
  const end = monthEnd(board.month);
  const current = r.occupants.filter((o) => !o.stay.checkOut || o.stay.checkOut > end);
  const canAdd = room.status === "active" && current.length < room.capacity;

  return (
    <Drawer
      eyebrow={apartment.name}
      title={`ห้อง ${room.roomNo}`}
      badge={<span className={`chip px-2 py-0.5 text-11-5 ${STATE_CHIP[r.state]}`}>{ROOM_STATE_LABEL[r.state]}</span>}
      sub={[room.plant, room.capacity === 2 ? "พักได้ 2 คน" : "พักได้ 1 คน", PAY_MODE_LABEL[room.payMode]]
        .filter(Boolean)
        .join(" · ")}
      onClose={onClose}
    >
      <DrawerSection title={`ผู้พัก · ${monthLabel(board.month, "full")}`}>
        {r.occupants.length ? (
          <ul className="flex flex-col divide-y divide-line">
            {r.occupants.map((o) => (
              <li key={o.stay.id} className="py-2.5 first:pt-0">
                <OccupantRow
                  o={o}
                  month={board.month}
                  monthDays={r.charge.monthDays}
                  today={board.today}
                  payMode={room.payMode}
                  onSaved={refresh}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-12-5 text-mut">ไม่มีผู้พักในเดือนนี้{room.recruitRequested ? " · แจ้งสรรหาแล้ว" : ""}</p>
        )}
        {canAdd ? (
          <CheckInForm
            roomId={room.id}
            today={board.today}
            contractStart={room.contractStart}
            exclude={current.map((o) => o.stay.drivercode)}
            onSaved={refresh}
          />
        ) : null}
      </DrawerSection>

      <DrawerSection title={`ค่าใช้จ่าย · ${monthLabel(board.month, "full")}`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {BILL_FIELDS.map((k) => (
            <label key={k} className="flex flex-col gap-1">
              <span className="text-12-5 font-medium text-mut">{BILL_FIELD_LABEL[k]}</span>
              <MoneyCell
                month={board.month}
                roomId={room.id}
                field={k}
                value={r.bill?.[k] ?? null}
                placeholder={k === "rent" ? baht(room.rent) : undefined}
                className="h-10 border-line! bg-base-100 px-3"
              />
            </label>
          ))}
        </div>
        <p className="text-11-5 text-mut text-pretty">
          ค่าห้องเดือนนี้ว่าง = ใช้ค่าห้องตามสัญญา ({baht(room.rent)}) · กรอกเมื่อบิลไม่เท่าสัญญา เช่น คิดครึ่งเดือน หรือจ่ายล่วงหน้าไปแล้ว (0)
        </p>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 border-t border-line pt-3 text-13">
          <Money label={r.charge.rentOverride ? "ค่าห้อง (ตามบิลเดือนนี้)" : "ค่าห้อง"} value={r.charge.rent} />
          <Money label="น้ำ + ไฟ + ส่วนกลาง" value={r.charge.utility} />
          <Money label="ค่าห้องส่วนบริษัท" value={r.charge.companyRent} />
          <Money label="ค่าห้องส่วน พจส." value={r.charge.employeeRent} />
          {r.charge.companyUtility && r.occupants.length ? (
            <Money label="น้ำไฟวันที่ห้องว่าง (บริษัท)" value={r.charge.companyUtility} />
          ) : null}
          <Money label="รวมยอดหัก พจส." value={r.charge.deduct} strong />
          <Money label="รวมจ่ายเจ้าของห้อง" value={r.charge.total} strong />
        </dl>
        <p className="text-11-5 text-mut text-pretty">
          {PAY_MODE_HINT[room.payMode]} · หารตามวันที่พักจริงในเดือน (วันย้ายออกไม่นับ คนที่เข้าวันเดียวกันเริ่มนับวันนั้น)
        </p>
      </DrawerSection>

      <DrawerSection title="รายละเอียดห้องและสัญญา">
        <RoomForm
          board={board}
          room={room}
          apartmentId={room.apartmentId}
          staying={r.occupants.filter((o) => !o.stay.checkOut).length}
          onSaved={refresh}
        />
      </DrawerSection>

      <DrawerSection title="ประวัติผู้พักห้องนี้">
        <StayHistory roomId={room.id} version={r.occupants.map((o) => `${o.stay.id}${o.stay.checkOut}`).join()} />
      </DrawerSection>

      <DrawerSection title="สัญญาเช่า">
        {cancelled ? (
          <ReopenRoom room={room} onSaved={refresh} />
        ) : (
          <CancelRoom room={room} today={board.today} hasCurrent={current.length > 0} onSaved={refresh} />
        )}
      </DrawerSection>
    </Drawer>
  );
}

function Money({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-mut">{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-semibold" : ""}`}>{baht(value)}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ ผู้พัก */

function OccupantRow({
  o,
  month,
  monthDays,
  today,
  payMode,
  onSaved,
}: {
  o: BoardOccupant;
  month: string;
  monthDays: number;
  today: string;
  payMode: RentPayMode;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<"" | "in" | "out" | "link">("");
  const [date, setDate] = useState("");
  const toggle = (m: "in" | "out" | "link", initial = "") => {
    setDate(initial);
    setMode(mode === m ? "" : m);
  };
  const [pick, setPick] = useState<DriverPick | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(body: Record<string, unknown>, success: string) {
    setBusy(true);
    const out = await runAction({
      success,
      failureTitle: "บันทึกไม่สำเร็จ",
      run: () => requestJson(`/api/rentals/stays/${o.stay.id}`, { method: "PATCH", body }),
    });
    setBusy(false);
    if (out.status === "done") {
      setMode("");
      onSaved();
    }
  }

  const c = o.charge;
  const outBeforeIn = mode === "out" && Boolean(date && o.stay.checkIn && date < o.stay.checkIn);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <OccupantLine o={o} month={month} />
        {!o.stay.checkOut ? (
          <div className="flex flex-none gap-1">
            {!o.stay.drivercode ? (
              <button
                type="button"
                onClick={() => toggle("link")}
                className="btn-soft inline-flex items-center gap-1 px-2.5 py-1 text-12"
              >
                <Link2 size={13} aria-hidden /> ผูกทะเบียน
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => toggle("in", o.stay.checkIn || o.person?.startDate || "")}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-12 ${o.stay.checkIn ? "btn-ghost" : "btn-soft text-sla"}`}
            >
              <CalendarDays size={13} aria-hidden /> {o.stay.checkIn ? "วันเข้าพัก" : "ใส่วันเข้าพัก"}
            </button>
            <button
              type="button"
              onClick={() => toggle("out", today)}
              className="btn-ghost inline-flex items-center gap-1 px-2.5 py-1 text-12"
            >
              <LogOut size={13} aria-hidden /> ย้ายออก
            </button>
          </div>
        ) : null}
      </div>

      {c ? (
        <p className="pl-10.5 text-11-5 text-mut">
          หัก พจส. <b className="font-semibold text-ink tabular-nums">{baht(c.deduct)}</b>
          {c.deduct ? ` (ค่าห้อง ${baht(c.rent)} · ไฟ ${baht(c.electric)} · น้ำ ${baht(c.water)}${c.common ? ` · ส่วนกลาง ${baht(c.common)}` : ""})` : ""}
          {c.monthDays < monthDays ? ` · พัก ${c.monthDays}/${monthDays} วัน` : ""}
          {payMode === "COMPANY_CAP" && !c.pastGrace ? " · ยังไม่ครบ 4 เดือน" : ""}
        </p>
      ) : null}

      {mode === "in" ? (
        <div className="ml-10.5 flex flex-col gap-1.5">
          <div className="flex items-end gap-2">
            <DateField id={`in-${o.stay.id}`} label="วันเข้าพัก" value={date} onChange={setDate} className="flex-1" />
            <button
              type="button"
              disabled={!date || busy}
              onClick={() => save({ checkIn: date }, "บันทึกวันเข้าพักแล้ว")}
              className="btn-pri px-4 py-2.5 text-13 disabled:opacity-45"
            >
              บันทึก
            </button>
          </div>
          {o.person?.startDate ? <StartDateHint iso={o.person.startDate} onUse={setDate} /> : null}
        </div>
      ) : null}

      {mode === "out" ? (
        <div className="ml-10.5 flex flex-col gap-1.5">
          <div className="flex items-end gap-2">
            <DateField id={`out-${o.stay.id}`} label="วันย้ายออก" value={date} onChange={setDate} className="flex-1" />
            <button
              type="button"
              disabled={!date || busy || outBeforeIn}
              onClick={() => save({ checkOut: date }, "บันทึกย้ายออกแล้ว")}
              className="btn-pri px-4 py-2.5 text-13 disabled:opacity-45"
            >
              บันทึก
            </button>
          </div>
          {outBeforeIn ? (
            <p className="text-12 text-alert">วันย้ายออกต้องไม่ก่อนวันเข้าพัก ({thaiDate(o.stay.checkIn)})</p>
          ) : (
            <p className="text-11-5 text-mut">วันย้ายออกไม่นับเป็นวันพัก — ค่าน้ำไฟคิดถึงวันก่อนหน้า</p>
          )}
        </div>
      ) : null}

      {mode === "link" ? (
        <div className="ml-10.5 flex flex-col gap-2">
          <p className="text-11-5 text-mut">
            นำเข้าจากไฟล์เดิมเป็นชื่อ “{o.stay.nameAtEntry}” — เลือกคนเดียวกันในทะเบียนประวัติ
          </p>
          <ResidentPicker value={pick} onChange={setPick} />
          <button
            type="button"
            disabled={!pick || busy}
            onClick={() => pick && save({ drivercode: pick.code }, "ผูกกับทะเบียนแล้ว")}
            className="btn-pri self-end px-4 py-2 text-13 disabled:opacity-45"
          >
            ผูกทะเบียน
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CheckInForm({
  roomId,
  today,
  contractStart,
  exclude,
  onSaved,
}: {
  roomId: string;
  today: string;
  contractStart: string;
  exclude: string[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<DriverPick | null>(null);
  const [checkIn, setCheckIn] = useState(today);
  const [livingWith, setLivingWith] = useState<LivingWith>("alone");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-soft inline-flex w-fit items-center gap-1.5 px-3.5 py-2 text-12-5"
      >
        <UserPlus size={14} aria-hidden /> เพิ่มผู้พัก
      </button>
    );
  }

  async function save() {
    if (!pick) return;
    setBusy(true);
    const out = await runAction({
      success: `${pick.name} เข้าพักแล้ว`,
      failureTitle: "บันทึกผู้พักไม่สำเร็จ",
      run: () =>
        requestJson("/api/rentals/stays", {
          method: "POST",
          body: { roomId, drivercode: pick.code, checkIn, livingWith, note },
        }),
    });
    setBusy(false);
    if (out.status === "done") {
      setOpen(false);
      setPick(null);
      setNote("");
      onSaved();
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-box bg-base-200/60 p-3.5">
      <p className="text-12-5 font-medium">เพิ่มผู้พักจากทะเบียนประวัติ พจส.</p>
      <ResidentPicker value={pick} onChange={setPick} exclude={exclude} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <DateField id="checkin-date" label="วันเข้าพัก" value={checkIn} onChange={setCheckIn} />
          {pick?.startDate ? (
            /* เริ่มงานก่อนห้องมีสัญญา → เข้าพักได้เร็วสุดวันทำสัญญา */
            contractStart && pick.startDate < contractStart ? (
              <StartDateHint iso={contractStart} label="วันทำสัญญาห้อง" onUse={setCheckIn} />
            ) : (
              <StartDateHint iso={pick.startDate} onUse={setCheckIn} />
            )
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-12-5 font-medium text-mut">พักกับ</span>
          <SegmentedControl
            label="พักกับ"
            value={livingWith}
            onChange={setLivingWith}
            options={(["alone", "family"] as const).map((v) => ({ value: v, label: LIVING_WITH_LABEL[v] }))}
          />
        </div>
      </div>
      <TextField id="checkin-note" label="หมายเหตุ" optional value={note} onChange={setNote} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="btn-sec px-4 py-2 text-13">
          ยกเลิก
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!pick || !checkIn || busy}
          className="btn-pri px-4 py-2 text-13 disabled:opacity-45"
        >
          บันทึกเข้าพัก
        </button>
      </div>
    </div>
  );
}

/** ปุ่มเล็กใต้ช่องวันที่ — ไฟล์คุมเดิมดึงวันเข้าอยู่จากวันเริ่มงานในทะเบียน */
function StartDateHint({ iso, label = "วันเริ่มงาน", onUse }: { iso: string; label?: string; onUse: (v: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onUse(iso)}
      className="w-fit cursor-pointer text-left text-11-5 text-primary hover:underline"
    >
      ใช้{label} {thaiDate(iso, "full")}
    </button>
  );
}

function StayHistory({ roomId, version }: { roomId: string; version: string }) {
  const [rows, setRows] = useState<{ stay: RentalStay; person: RegistryPerson | null }[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    requestJson<{ stay: RentalStay; person: RegistryPerson | null }[]>(`/api/rentals/rooms/${roomId}`)
      .then((r) => alive && setRows(r))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [roomId, version]);

  if (error) return <p className="text-12-5 text-alert">{error}</p>;
  if (!rows) return <p className="text-12-5 text-mut">กำลังโหลด…</p>;
  if (!rows.length) return <p className="text-12-5 text-mut">ยังไม่มีผู้พัก</p>;
  return (
    <ol className="flex flex-col">
      {rows.map(({ stay, person }) => (
        <li key={stay.id} className="flex items-baseline gap-3 border-b border-line/70 py-2 text-13 last:border-b-0">
          <span className={`size-2 flex-none translate-y-[-1px] rounded-full ${stay.checkOut ? "bg-line-strong" : "bg-primary"}`} />
          <span className="min-w-0 flex-1 truncate">
            {occupantName({ stay, person })}
            {stay.drivercode ? <span className="ml-1.5 font-mono text-11-5 text-mut">{stay.drivercode}</span> : null}
          </span>
          <span className="flex-none text-12 text-mut tabular-nums">
            {thaiDate(stay.checkIn) || "?"} – {stay.checkOut ? thaiDate(stay.checkOut) : "ปัจจุบัน"}
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ สัญญา */

function CancelRoom({
  room,
  today,
  hasCurrent,
  onSaved,
}: {
  room: RentalRoom;
  today: string;
  hasCurrent: boolean;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(today);
  const [reason, setReason] = useState("");

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-12-5 text-mut text-pretty">
          ยกเลิกแล้ว<b className="font-semibold text-ink">ไม่ลบห้อง</b> — เดือนก่อน ๆ ยังเห็นครบ เดือนที่ยกเลิกขึ้นสีแดง
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={hasCurrent}
          title={hasCurrent ? "บันทึกย้ายออกผู้พักก่อน" : undefined}
          className="btn-danger inline-flex items-center gap-1.5 px-3.5 py-2 text-12-5 disabled:opacity-45"
        >
          <Ban size={14} aria-hidden /> ยกเลิกสัญญา
        </button>
      </div>
    );
  }

  async function save() {
    const out = await runAction({
      confirm: {
        title: `ยกเลิกสัญญาห้อง ${room.roomNo}?`,
        text: `มีผลตั้งแต่ ${thaiDate(on, "full")} — ห้องยังอยู่ในข้อมูลเดือนก่อน ๆ และเปิดใช้อีกครั้งได้`,
        tone: "danger",
        confirmText: "ยกเลิกสัญญา",
      },
      success: "ยกเลิกสัญญาแล้ว",
      failureTitle: "ยกเลิกสัญญาไม่สำเร็จ",
      run: () =>
        requestJson(`/api/rentals/rooms/${room.id}`, {
          method: "PATCH",
          body: { action: "cancel", cancelledOn: on, cancelReason: reason },
        }),
    });
    if (out.status === "done") {
      setOpen(false);
      onSaved();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <DateField id="cancel-on" label="วันที่ยกเลิกสัญญา" value={on} onChange={setOn} />
        <TextField id="cancel-reason" label="เหตุผล" optional value={reason} onChange={setReason} placeholder="เช่น ไม่มีแจ้งสรรหา" />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="btn-sec px-4 py-2 text-13">
          ไม่ยกเลิก
        </button>
        <button type="button" onClick={save} disabled={!on} className="btn-danger px-4 py-2 text-13 disabled:opacity-45">
          ยืนยันยกเลิกสัญญา
        </button>
      </div>
    </div>
  );
}

function ReopenRoom({ room, onSaved }: { room: RentalRoom; onSaved: () => void }) {
  async function reopen() {
    const out = await runAction({
      confirm: { title: `เปิดใช้ห้อง ${room.roomNo} อีกครั้ง?`, text: "ล้างการยกเลิกสัญญา ห้องกลับมานับในทุกเดือน" },
      success: "เปิดใช้ห้องแล้ว",
      failureTitle: "เปิดใช้ห้องไม่สำเร็จ",
      run: () => requestJson(`/api/rentals/rooms/${room.id}`, { method: "PATCH", body: { action: "reopen" } }),
    });
    if (out.status === "done") onSaved();
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-12-5 text-alert">
        ยกเลิกสัญญาเมื่อ {thaiDate(room.cancelledOn, "full")}
        {room.cancelReason ? ` · ${room.cancelReason}` : ""}
      </p>
      <button type="button" onClick={reopen} className="btn-sec inline-flex items-center gap-1.5 px-3.5 py-2 text-12-5">
        <RotateCcw size={14} aria-hidden /> เปิดใช้อีกครั้ง
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ ฟอร์มห้อง */

function RoomForm({
  board,
  room,
  apartmentId: initialApt,
  staying = 0,
  onSaved,
}: {
  board: RentalBoard;
  room?: RentalRoom;
  apartmentId: string;
  /** ผู้พักที่ยังไม่ย้ายออก — ห้องเต็มแล้วแจ้งสรรหาไม่ได้ */
  staying?: number;
  onSaved: (room: RentalRoom) => void;
}) {
  const [apartmentId, setApartmentId] = useState(initialApt);
  const [roomNo, setRoomNo] = useState(room?.roomNo ?? "");
  const [plant, setPlant] = useState(room?.plant ?? "");
  const [rent, setRent] = useState<number | null>(room?.rent ?? null);
  const [deposit, setDeposit] = useState<number | null>(room?.deposit ?? null);
  const [advance, setAdvance] = useState<number | null>(room?.advance ?? null);
  const [contractStart, setContractStart] = useState(room?.contractStart ?? "");
  const [capacity, setCapacity] = useState<"1" | "2">(room?.capacity === 2 ? "2" : "1");
  const [payMode, setPayMode] = useState<RentPayMode>(room?.payMode ?? "COMPANY_CAP");
  const [cap, setCap] = useState<number | null>(room?.cap ?? DEFAULT_CAP);
  const [recruit, setRecruit] = useState(room?.recruitRequested ?? false);
  const [remark, setRemark] = useState(room?.remark ?? "");
  const [busy, setBusy] = useState(false);

  /* แพล้นท์ที่เคยกรอก — แนะนำให้พิมพ์ตรงกัน */
  const plants = [...new Set(board.rooms.map((x) => x.room.plant).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th"));

  async function save() {
    if (!apartmentId) return toastError("กรุณาเลือกที่พัก");
    if (!roomNo.trim()) return toastError("กรุณาระบุเลขห้อง");
    if (payMode === "COMPANY_CAP" && !cap) return toastError("กรุณาระบุเพดานที่บริษัทจ่าย");
    setBusy(true);
    const body = {
      apartmentId,
      roomNo,
      plant,
      rent,
      deposit,
      advance,
      contractStart,
      capacity: Number(capacity),
      payMode,
      cap: payMode === "COMPANY_CAP" ? cap : null,
      recruitRequested: canRecruit && recruit,
      remark,
    };
    const out = await runAction({
      success: room ? "บันทึกรายละเอียดห้องแล้ว" : `เพิ่มห้อง ${roomNo} แล้ว`,
      failureTitle: "บันทึกห้องไม่สำเร็จ",
      run: () =>
        room
          ? requestJson<RentalRoom>(`/api/rentals/rooms/${room.id}`, { method: "PATCH", body: { action: "edit", ...body } })
          : requestJson<RentalRoom>("/api/rentals/rooms", { method: "POST", body }),
    });
    setBusy(false);
    if (out.status === "done") onSaved(out.data);
  }

  /* แจ้งสรรหาได้เฉพาะห้องที่ยังมีที่ว่าง — คนเดิมยังไม่ย้ายออก ห้องยังไม่ว่าง */
  const canRecruit = staying < Number(capacity);

  return (
    <div className="flex flex-col gap-3.5">
      {!room ? (
        <SelectField
          id="room-apartment"
          label="ที่พัก"
          value={apartmentId}
          onChange={setApartmentId}
          options={board.apartments.map((a) => ({ value: a.id, label: a.name }))}
          placeholder="เลือกที่พัก"
          searchable
        />
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField id="room-no" label="เลขห้อง" value={roomNo} onChange={setRoomNo} />
        <TextField id="room-plant" label="ประจำแพล้นท์" optional value={plant} onChange={setPlant} list="rental-plants" />
        <datalist id="rental-plants">
          {plants.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <NumberField id="room-rent" label="ค่าห้อง / เดือน" value={rent} onChange={setRent} />
        <DateField id="room-contract" label="วันที่ทำสัญญา" optional value={contractStart} onChange={setContractStart} />
        <NumberField id="room-deposit" label="เงินประกัน" optional value={deposit} onChange={setDeposit} />
        <NumberField id="room-advance" label="จ่ายก่อนเข้า" optional value={advance} onChange={setAdvance} />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-12-5 font-medium text-mut">พักได้</span>
        <SegmentedControl
          label="พักได้"
          value={capacity}
          onChange={setCapacity}
          options={[
            { value: "1", label: "1 คน" },
            { value: "2", label: "2 คน (หารค่าน้ำไฟ)" },
          ]}
          className="w-fit"
        />
      </div>
      <SelectField
        id="room-paymode"
        label="รูปแบบการจ่าย"
        value={payMode}
        onChange={(v) => setPayMode(v as RentPayMode)}
        options={PAY_MODES.map((m) => ({ value: m, label: PAY_MODE_LABEL[m] }))}
        hint={PAY_MODE_HINT[payMode]}
      />
      {payMode === "COMPANY_CAP" ? (
        <NumberField
          id="room-cap"
          label="เพดานที่บริษัทจ่าย (บาท / เดือน)"
          value={cap}
          onChange={setCap}
          placeholder="เช่น 2000"
        />
      ) : null}
      {canRecruit ? (
        <label className="flex cursor-pointer items-center gap-2.5 text-13">
          <input
            type="checkbox"
            checked={recruit}
            onChange={(e) => setRecruit(e.target.checked)}
            className="checkbox checkbox-sm checkbox-primary"
          />
          {staying ? "ว่าง 1 ที่ — แจ้งสรรหาแล้ว" : "ห้องว่าง — แจ้งสรรหาแล้ว"}
        </label>
      ) : (
        <p className="text-12-5 text-mut">ห้องมีผู้พักเต็ม — แจ้งสรรหาได้เมื่อบันทึกย้ายออกแล้ว</p>
      )}
      <TextareaField id="room-remark" label="หมายเหตุ" optional value={remark} onChange={setRemark} rows={2} />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="btn-pri inline-flex items-center gap-1.5 px-4 py-2 text-13 disabled:opacity-45"
        >
          <Save size={14} aria-hidden /> {room ? "บันทึกรายละเอียด" : "เพิ่มห้อง"}
        </button>
      </div>
    </div>
  );
}
