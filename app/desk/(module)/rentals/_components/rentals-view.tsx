"use client";

import { Fragment, useDeferredValue, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BedDouble,
  Building2,
  ChevronLeft,
  ChevronRight,
  FileText,
  MapPin,
  Phone,
  Plus,
  TriangleAlert,
  Users,
} from "lucide-react";

import { PageHead } from "@/components/desk/page-head";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchField, Select } from "@/components/ui/field";
import {
  SegmentedControl,
  SummaryBody,
  SummaryPanel,
  SummaryStat,
  SummaryStats,
  SummaryStrip,
  SummaryTabs,
  SummaryToolbar,
} from "@/components/ui/summary-panel";
import { XlsxExportButton } from "@/components/ui/xlsx-export-button";
import {
  DEFAULT_CAP,
  EXIT_KIND_LABEL,
  LIVING_WITH_LABEL,
  PAY_MODE_LABEL,
  ROOM_STATE_LABEL,
  BILL_SOURCE_LABEL,
  monthLabel,
  needsCheckOut,
  occupantName,
  payModeShort,
  shiftMonth,
  thaiDate,
  type BoardOccupant,
  type BoardRoom,
  type BoardRoomState,
  type RentalApartment,
  type RentalBoard,
} from "@/lib/rentals/types";

import { AddMenu } from "./add-menu";
import { ApartmentDrawer } from "./apartment-drawer";
import { ApartmentMap } from "./apartment-map";
import { ExitAlertBell } from "./exit-alert-bell";
import { MoneyCell } from "./money-cell";
import { RentalReportModal } from "./report-modal";
import { RoomDrawer } from "./room-drawer";
import { OccupantLine, StateChip } from "./occupant-line";
import { baht } from "./shared";

/**
 * หน้า “จัดการห้องเช่า” — **ตารางเดียว ไม่มีการ์ด** (Bew 3 พ.ย. 2569) แทน Mena-Next `/apartment` ที่แยกเป็นการ์ดรายห้อง
 *
 * - หนึ่งแถวต่อห้อง จัดกลุ่มใต้แถบชื่อที่พัก (เหมือนไฟล์คุมเดิม) · ห้องพัก 2 คนมีสองบรรทัดในช่องผู้พัก
 * - ชื่อ ตำแหน่ง ลูกค้า แพล้นท์ สถานะ ของคนมาจากทะเบียนประวัติ พจส. สด ๆ
 * - ค่าไฟ/น้ำ/ส่วนกลาง กรอกในตารางได้เลย (บันทึกตอนออกจากช่อง) · ที่เหลือคิดให้ตามรูปแบบการจ่าย
 * - คลิกแถว = แผงขวาของห้อง (ผู้พัก · ย้ายเข้า/ออก · รายละเอียดสัญญา · ยกเลิกสัญญา)
 */

type StateFilter = "all" | "occupied" | "vacant" | "moving-out" | "cancelled";
type Tab = "rooms" | "apartments";
type DrawerState =
  | { kind: "room"; id: string }
  | { kind: "new-room"; apartmentId: string }
  | { kind: "apartment"; id: string }
  | { kind: "new-apartment" }
  | null;

const STATE_MATCH: Record<Exclude<StateFilter, "all">, BoardRoomState[]> = {
  occupied: ["occupied", "partial"],
  vacant: ["vacant"],
  "moving-out": ["moving-out"],
  cancelled: ["cancelled"],
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

function searchText(r: BoardRoom): string {
  return norm(
    [
      r.apartment.name,
      r.room.roomNo,
      r.room.plant,
      ...r.occupants.flatMap((o) => [
        occupantName(o),
        o.stay.drivercode,
        o.person?.plant ?? "",
        o.person?.customer ?? "",
        o.person?.position ?? "",
      ]),
    ].join(" "),
  );
}

export function RentalsView({
  board,
  monthTotals,
}: {
  board: RentalBoard;
  /** ยอดจ่ายรวมรายเดือนของปีนั้น (ม.ค.–เดือนที่เปิด) — แถวสรุปในบันทึกขออนุมัติ */
  monthTotals: Record<string, number | null>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>("rooms");
  const [aptView, setAptView] = useState<"table" | "map">("table");
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const [state, setState] = useState<StateFilter>("all");
  const [aptFilter, setAptFilter] = useState("");
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [report, setReport] = useState(false);

  const goMonth = (month: string) =>
    startTransition(() => router.push(`?m=${month}`, { scroll: false }));

  const counts = useMemo(() => {
    const c = { total: 0, occupied: 0, vacant: 0, recruit: 0, movingOut: 0, cancelled: 0, people: 0 };
    for (const r of board.rooms) {
      c.total++;
      if (r.state === "occupied" || r.state === "partial") c.occupied++;
      if (r.state === "vacant") {
        c.vacant++;
        if (r.room.recruitRequested) c.recruit++;
      }
      if (r.state === "moving-out") c.movingOut++;
      if (r.state === "cancelled") c.cancelled++;
      c.people += r.occupants.length;
    }
    return c;
  }, [board.rooms]);

  const results = useMemo(() => {
    const q = norm(deferred.trim());
    return board.rooms.filter(
      (r) =>
        (state === "all" || STATE_MATCH[state].includes(r.state)) &&
        (!aptFilter || r.apartment.id === aptFilter) &&
        (!q || searchText(r).includes(q)),
    );
  }, [board.rooms, deferred, state, aptFilter]);

  const totals = useMemo(
    () =>
      results.reduce(
        (t, r) => ({
          rent: t.rent + r.charge.rent,
          deduct: t.deduct + r.charge.deduct,
          total: t.total + r.charge.total,
        }),
        { rent: 0, deduct: 0, total: 0 },
      ),
    [results],
  );

  const groups = useMemo(() => {
    const out: { apartment: RentalApartment; rooms: BoardRoom[] }[] = [];
    for (const r of results) {
      const last = out.at(-1);
      if (last?.apartment.id === r.apartment.id) last.rooms.push(r);
      else out.push({ apartment: r.apartment, rooms: [r] });
    }
    return out;
  }, [results]);

  /** พ้นสภาพแล้ว (ลาออก · ปลดออก) แต่ยังไม่บันทึกย้ายออกภายในเดือนที่เปิด — วันออกล่าสุดขึ้นก่อน */
  const exits = useMemo(
    () =>
      board.rooms
        .flatMap((r) => r.occupants.filter((o) => needsCheckOut(o, board.month)).map((o) => ({ r, o })))
        .sort((a, b) => (b.o.person?.exit?.on ?? "").localeCompare(a.o.person?.exit?.on ?? "")),
    [board.rooms, board.month],
  );

  const filtering = Boolean(deferred.trim()) || state !== "all" || Boolean(aptFilter);
  const clearFilters = () => {
    setQuery("");
    setState("all");
    setAptFilter("");
  };
  const toggleState = (s: StateFilter) => setState((cur) => (cur === s ? "all" : s));

  const aptOptions = useMemo(
    () => [{ value: "all", label: "ทุกที่พัก" }, ...board.apartments.map((a) => ({ value: a.id, label: a.name }))],
    [board.apartments],
  );

  const selectedRoom = drawer?.kind === "room" ? board.rooms.find((r) => r.room.id === drawer.id) : undefined;
  const selectedApt = drawer?.kind === "apartment" ? board.apartments.find((a) => a.id === drawer.id) : undefined;
  const isCurrentMonth = board.month === board.today.slice(0, 7);

  return (
    <div className="flex animate-rise flex-col gap-4 pb-6">
      <PageHead
        title="จัดการห้องเช่า"
        subtitle="ห้องเช่าของบริษัทรายเดือน · ข้อมูลผู้พักดึงจากทะเบียนประวัติ พจส. · ยกเลิกสัญญาแล้วยังเห็นย้อนหลังในเดือนก่อน ๆ"
        actions={
          <>
            <ExitAlertBell items={exits} onOpenRoom={(id) => setDrawer({ kind: "room", id })} />
            <AddMenu
              apartmentName={board.apartments.find((a) => a.id === aptFilter)?.name}
              canAddRoom={board.apartments.length > 0}
              onAddRoom={() => setDrawer({ kind: "new-room", apartmentId: aptFilter })}
              onAddApartment={() => setDrawer({ kind: "new-apartment" })}
            />
          </>
        }
      />

      {board.registryFailed ? (
        <p role="alert" className="flex items-center gap-2 border-y border-line py-2.5 text-12-5 text-sla">
          <TriangleAlert size={15} aria-hidden /> อ่านทะเบียนประวัติ พจส. ไม่สำเร็จ — ห้องยังครบ แต่ชื่อ/สถานะผู้พักอาจไม่ขึ้น ลองรีเฟรชอีกครั้ง
        </p>
      ) : null}

      <SummaryPanel label="สรุปห้องเช่า">
        <SummaryStats className="grid-cols-2 lg:grid-cols-5">
          <SummaryStat
            lead
            label={`ห้องเช่า · ${monthLabel(board.month, "full")}`}
            value={counts.total}
            unit="ห้อง"
            sub={`${board.apartments.length.toLocaleString("th-TH")} ที่พัก · ผู้พัก ${counts.people.toLocaleString("th-TH")} คน`}
            className="col-span-2 lg:col-span-1"
            active={state === "all"}
            onClick={() => setState("all")}
          />
          <SummaryStat
            label="มีผู้พัก"
            value={counts.occupied}
            unit="ห้อง"
            dot="bg-primary"
            tone="primary"
            share={counts.occupied / (counts.total || 1)}
            active={state === "occupied"}
            onClick={() => toggleState("occupied")}
          />
          <SummaryStat
            label="ห้องว่าง"
            value={counts.vacant}
            unit="ห้อง"
            sub={counts.recruit ? `แจ้งสรรหาแล้ว ${counts.recruit} ห้อง` : undefined}
            dot="bg-ink/40"
            share={counts.vacant / (counts.total || 1)}
            active={state === "vacant"}
            onClick={() => toggleState("vacant")}
          />
          <SummaryStat
            label="รอย้ายออก"
            value={counts.movingOut}
            unit="ห้อง"
            sub="ผู้พักพ้นสภาพแล้ว"
            dot="bg-sla"
            tone="sla"
            active={state === "moving-out"}
            onClick={() => toggleState("moving-out")}
          />
          <SummaryStat
            label="ยกเลิกสัญญา"
            value={counts.cancelled}
            unit="ห้อง"
            sub="ในเดือนนี้"
            dot="bg-alert"
            tone="alert"
            active={state === "cancelled"}
            onClick={() => toggleState("cancelled")}
          />
        </SummaryStats>

        <SummaryToolbar className="lg:flex-wrap">
          <div className="flex items-center gap-1">
            <StepButton label="เดือนก่อนหน้า" onClick={() => goMonth(shiftMonth(board.month, -1))} disabled={pending}>
              <ChevronLeft size={15} strokeWidth={1.9} aria-hidden />
            </StepButton>
            <span
              aria-live="polite"
              className={`min-w-28 text-center text-13-5 font-semibold transition-opacity ${pending ? "opacity-40" : ""}`}
            >
              {monthLabel(board.month)}
            </span>
            <StepButton label="เดือนถัดไป" onClick={() => goMonth(shiftMonth(board.month, 1))} disabled={pending}>
              <ChevronRight size={15} strokeWidth={1.9} aria-hidden />
            </StepButton>
            {!isCurrentMonth ? (
              <button
                type="button"
                onClick={() => goMonth(board.today.slice(0, 7))}
                className="btn-ghost ml-1 px-2.5 py-1.5 text-12 text-primary"
              >
                เดือนนี้
              </button>
            ) : null}
          </div>

          <SearchField
            value={query}
            onChange={setQuery}
            label="ค้นหาห้องเช่า"
            placeholder="ค้นหาที่พัก เลขห้อง ชื่อ/รหัส พจส. แพล้นท์…"
            tone="filled"
            className="w-full lg:max-w-88 lg:flex-1"
          />

          <div className="w-full lg:w-64">
            <Select
              id="rental-apartment-filter"
              value={aptFilter || "all"}
              onChange={(v) => setAptFilter(v === "all" ? "" : v)}
              options={aptOptions}
              placeholder="ทุกที่พัก"
              searchable
              searchPlaceholder="ค้นหาที่พัก…"
            />
          </div>

          <div className="flex items-center gap-2 lg:ml-auto">
            <button
              type="button"
              onClick={() => setReport(true)}
              className="btn-sec inline-flex items-center gap-1.5 px-3.5 py-2 text-12-5 transition-colors hover:border-primary/40"
            >
              <FileText size={14} strokeWidth={1.9} aria-hidden /> รายงานขอเบิกค่าเช่า
            </button>
            <XlsxExportButton
              name={`ห้องเช่าบริษัท-${board.month}`}
              count={results.length}
              build={() => exportSheet(board, results, filtering)}
            />
          </div>
        </SummaryToolbar>

        <SummaryStrip className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <SummaryTabs
            label="มุมมอง"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "rooms", label: "ห้องพัก", icon: BedDouble },
              { id: "apartments", label: "ที่พัก · เจ้าของ", icon: Building2, count: board.apartments.length },
            ]}
          />
          {tab === "rooms" ? (
            <p role="status" aria-live="polite" className="flex flex-wrap gap-x-4 pb-2.5 text-12-5 text-mut">
              <span>
                {filtering ? "พบ " : "ทั้งหมด "}
                <b className="font-semibold text-ink tabular-nums">{results.length.toLocaleString("th-TH")}</b> ห้อง
              </span>
              <span>
                ค่าห้อง <b className="font-semibold text-ink tabular-nums">{baht(totals.rent)}</b>
              </span>
              <span>
                หัก พจส. <b className="font-semibold text-ink tabular-nums">{baht(totals.deduct)}</b>
              </span>
              <span>
                รวมจ่าย <b className="font-semibold text-primary tabular-nums">{baht(totals.total)}</b>
              </span>
            </p>
          ) : (
            <SegmentedControl
              label="มุมมองที่พัก"
              value={aptView}
              onChange={setAptView}
              options={[
                { value: "table", label: "ตาราง" },
                { value: "map", label: "แผนที่" },
              ]}
              className="mb-2"
            />
          )}
        </SummaryStrip>

        {tab === "apartments" && aptView === "map" ? (
          <ApartmentMap board={board} onOpen={(id) => setDrawer({ kind: "apartment", id })} />
        ) : tab === "apartments" ? (
          <ApartmentTable
            board={board}
            onOpen={(id) => setDrawer({ kind: "apartment", id })}
          />
        ) : !results.length ? (
          <SummaryBody pad>
            {board.rooms.length ? (
              <EmptyState title="ไม่พบห้องตามเงื่อนไข" hint="ลองล้างตัวกรองหรือค้นหาด้วยคำอื่น" onClear={clearFilters} />
            ) : (
              <EmptyState
                title={`ยังไม่มีห้องเช่าในเดือน${monthLabel(board.month, "full")}`}
                hint="กด “เพิ่ม” → ที่พักใหม่ ก่อน แล้วเพิ่มห้องเช่าและผู้พักจากทะเบียนประวัติ พจส."
              />
            )}
          </SummaryBody>
        ) : (
          <>
            {/* จอ ≥lg — ตารางเต็ม เลื่อนในกล่องของมันเอง หัวตาราง + คอลัมน์ห้องติดขอบ */}
            <div className="relative hidden max-h-[calc(100dvh-10.5rem)] overflow-auto border-t border-line bg-base-100 lg:block">
              <table className="sheet-table w-full min-w-[1320px] border-collapse text-13">
                <thead>
                  <tr>
                    <Th className="left-0 z-20 w-36">ห้อง</Th>
                    <Th className="min-w-72">ผู้พัก (จากทะเบียน พจส.)</Th>
                    <Th>สัญญา</Th>
                    <Th>รูปแบบจ่าย</Th>
                    <Th className="text-right">ค่าห้อง</Th>
                    <Th className="w-24 text-right">ค่าไฟ</Th>
                    <Th className="w-24 text-right">ค่าน้ำ</Th>
                    <Th className="w-24 text-right">ส่วนกลาง</Th>
                    <Th className="text-right">หัก พจส.</Th>
                    <Th className="text-right">รวมจ่าย</Th>
                    <Th>สถานะ</Th>
                  </tr>
                </thead>
                <tbody key={`${board.month}-${results.length}`}>
                  {groups.map(({ apartment, rooms }) => (
                    <Fragment key={apartment.id}>
                      <GroupRow
                        apartment={apartment}
                        rooms={rooms}
                        onOpen={() => setDrawer({ kind: "apartment", id: apartment.id })}
                        onAddRoom={() => setDrawer({ kind: "new-room", apartmentId: apartment.id })}
                      />
                      {rooms.map((r) => (
                        <RoomRow
                          key={r.room.id}
                          r={r}
                          month={board.month}
                          onOpen={() => setDrawer({ kind: "room", id: r.room.id })}
                        />
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* จอ <lg — แถวละห้อง คั่นเส้น */}
            <SummaryBody className="lg:hidden">
              <ul className="divide-y divide-line">
                {results.map((r) => (
                  <li key={r.room.id}>
                    <button
                      type="button"
                      onClick={() => setDrawer({ kind: "room", id: r.room.id })}
                      className="flex w-full flex-col gap-2 px-(--sheet-px) py-3 text-left hover:bg-soft"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-11-5 text-mut">{r.apartment.name}</p>
                          <p className="text-14 font-semibold">ห้อง {r.room.roomNo}</p>
                        </div>
                        <StateChip r={r} month={board.month} />
                      </div>
                      {r.occupants.length ? (
                        <div className="flex flex-col gap-1.5">
                          {r.occupants.map((o) => (
                            <OccupantLine key={o.stay.id} o={o} month={board.month} roomPlant={r.room.plant} link={false} />
                          ))}
                        </div>
                      ) : (
                        <p className="text-12-5 text-mut">ไม่มีผู้พัก</p>
                      )}
                      <p className="flex flex-wrap gap-x-3 text-12 text-mut">
                        <span>ค่าห้อง {baht(r.charge.rent)}</span>
                        <span>หัก พจส. {baht(r.charge.deduct)}</span>
                        <span className="font-semibold text-ink">รวม {baht(r.charge.total)}</span>
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </SummaryBody>
          </>
        )}
      </SummaryPanel>

      {drawer?.kind === "room" && selectedRoom ? (
        <RoomDrawer
          key={selectedRoom.room.id}
          board={board}
          r={selectedRoom}
          onClose={() => setDrawer(null)}
        />
      ) : null}
      {drawer?.kind === "new-room" ? (
        <RoomDrawer
          key="new-room"
          board={board}
          newApartmentId={drawer.apartmentId}
          onClose={() => setDrawer(null)}
          onCreated={(id) => setDrawer({ kind: "room", id })}
        />
      ) : null}
      {drawer?.kind === "apartment" && selectedApt ? (
        <ApartmentDrawer
          key={selectedApt.id}
          apartment={selectedApt}
          rooms={board.rooms.filter((r) => r.apartment.id === selectedApt.id)}
          onClose={() => setDrawer(null)}
          onAddRoom={() => setDrawer({ kind: "new-room", apartmentId: selectedApt.id })}
        />
      ) : null}
      {drawer?.kind === "new-apartment" ? (
        <ApartmentDrawer key="new-apartment" onClose={() => setDrawer(null)} />
      ) : null}
      {report ? <RentalReportModal board={board} monthTotals={monthTotals} onClose={() => setReport(false)} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ ชิ้นย่อย */

function StepButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-9 cursor-pointer place-items-center rounded-full border border-line text-mut transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Th({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className={`sticky top-0 z-10 border-b border-line-strong bg-head px-3 py-2.5 text-left text-11 font-semibold tracking-[0.03em] whitespace-nowrap text-mut ${className}`}
    >
      {children}
    </th>
  );
}

function GroupRow({
  apartment,
  rooms,
  onOpen,
  onAddRoom,
}: {
  apartment: RentalApartment;
  rooms: BoardRoom[];
  onOpen: () => void;
  onAddRoom: () => void;
}) {
  const total = rooms.reduce((t, r) => t + r.charge.total, 0);
  return (
    <tr className="group/apt">
      <td colSpan={11} className="border-b border-line bg-soft/70 p-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
          <button
            type="button"
            onClick={onOpen}
            className="flex min-w-0 cursor-pointer items-center gap-2 text-left font-semibold hover:text-primary"
          >
            <Building2 size={15} aria-hidden className="flex-none text-primary" />
            <span>{apartment.name}</span>
          </button>
          <span className="flex items-center gap-3 text-12 text-mut">
            {apartment.owner ? <span>{apartment.owner}</span> : null}
            {apartment.phone ? (
              <a href={`tel:${apartment.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 hover:text-primary">
                <Phone size={12} aria-hidden /> {apartment.phone}
              </a>
            ) : null}
            {apartment.mapUrl ? (
              <a href={apartment.mapUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-primary">
                <MapPin size={12} aria-hidden /> แผนที่
              </a>
            ) : null}
          </span>
          <span className="ml-auto flex items-center gap-3 text-12 text-mut">
            <span>{rooms.length} ห้อง</span>
            <span>
              รวม <b className="font-semibold text-ink tabular-nums">{baht(total)}</b>
            </span>
            <button
              type="button"
              onClick={onAddRoom}
              className="btn-ghost inline-flex items-center gap-1 px-2 py-1 text-12 text-primary opacity-0 transition-opacity group-hover/apt:opacity-100 focus-visible:opacity-100"
            >
              <Plus size={13} aria-hidden /> เพิ่มห้อง
            </button>
          </span>
        </div>
      </td>
    </tr>
  );
}

/**
 * สีแถว — ทุกช่องใช้สีทึบเดียวกัน (ช่องห้องติดขอบซ้ายจึงไม่ต่างสีจากช่องอื่นตอน hover)
 * hover = ฟ้าอ่อนของ primary + แถบสีที่ขอบซ้าย · ยกเลิกสัญญาเป็นชมพูอ่อน
 */
const ROW_TONES = {
  "--row-hover": "color-mix(in oklab, var(--color-primary) 6%, var(--color-base-100))",
  "--row-cancel": "color-mix(in oklab, var(--color-alert) 4%, var(--color-base-100))",
} as React.CSSProperties;

/** คลิกที่ช่องกรอก/ลิงก์ในแถว ไม่ให้เปิดแผงห้อง */
const fromControl = (e: React.MouseEvent) => Boolean((e.target as HTMLElement).closest("input,a,button"));

function RoomRow({ r, month, onOpen }: { r: BoardRoom; month: string; onOpen: () => void }) {
  const cancelled = r.state === "cancelled";
  return (
    <tr
      onClick={(e) => !fromControl(e) && onOpen()}
      className={`group cursor-pointer align-top [&>td]:border-b [&>td]:border-line/70 [&>td]:transition-colors [&>td]:duration-150 ${
        cancelled ? "[&>td]:bg-(--row-cancel)" : "[&>td]:bg-base-100"
      } hover:[&>td]:bg-(--row-hover)`}
      style={ROW_TONES}
    >
      <td className="sticky left-0 z-[1] px-3 py-2.5 shadow-[inset_3px_0_0_transparent] group-hover:shadow-[inset_3px_0_0_var(--color-primary)]">
        <p className={`font-semibold ${cancelled ? "text-alert line-through decoration-alert/50" : ""}`}>{r.room.roomNo}</p>
        <p className="max-w-36 text-11-5 text-mut" title={r.room.plant}>
          {r.room.plant || "—"}
        </p>
        {r.room.capacity === 2 ? (
          <p className="mt-0.5 inline-flex items-center gap-1 text-11 text-mut">
            <Users size={11} aria-hidden /> พักได้ 2 คน
          </p>
        ) : null}
      </td>
      <td className="px-3 py-2.5">
        {r.occupants.length ? (
          <div className="flex flex-col gap-2">
            {r.occupants.map((o) => (
              <OccupantLine key={o.stay.id} o={o} month={month} roomPlant={r.room.plant} />
            ))}
          </div>
        ) : (
          <span className="inline-flex items-center gap-2 text-12-5 text-mut">
            ว่าง
            {r.room.recruitRequested && !cancelled ? <span className="chip chip-new px-2 py-0 text-11">แจ้งสรรหาแล้ว</span> : null}
          </span>
        )}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <p>{r.room.contractStart ? thaiDate(r.room.contractStart) : <span className="text-mut">—</span>}</p>
        <p className="text-11-5 text-mut">ประกัน {baht(r.room.deposit)}</p>
      </td>
      <td className="px-3 py-2.5">
        <p className="max-w-44 text-12-5">{PAY_MODE_LABEL[r.room.payMode]}</p>
        {r.room.payMode === "COMPANY_CAP" ? (
          <p className="text-11-5 text-mut tabular-nums">เพดาน {baht(r.room.cap ?? DEFAULT_CAP)}</p>
        ) : null}
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
        <p className="font-medium">{baht(r.charge.rent)}</p>
        {r.charge.rentOverride ? (
          <p className="text-11-5 text-sla" title="ค่าห้องตามบิลเดือนนี้ไม่เท่าสัญญา — แก้ได้ในแผงห้อง">
            สัญญา {baht(r.room.rent)}
          </p>
        ) : null}
        {/* แยกส่วนเฉพาะห้องที่ พจส. ร่วมจ่ายค่าห้อง — ที่เหลือบริษัทจ่ายเต็ม ไม่ต้องขึ้นซ้ำทุกแถว */}
        {r.charge.employeeRent ? (
          <p className="text-11-5 text-mut">
            บ. {baht(r.charge.companyRent)} · พจส. {baht(r.charge.employeeRent)}
          </p>
        ) : null}
      </td>
      {(["electric", "water", "common"] as const).map((k) => (
        <td key={k} className="px-1.5 py-1.5 text-right">
          <MoneyCell month={month} roomId={r.room.id} field={k} value={r.bill?.[k] ?? null} />
        </td>
      ))}
      <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
        <span className={r.charge.deduct ? "font-semibold" : "text-mut"}>{baht(r.charge.deduct)}</span>
      </td>
      <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap tabular-nums">{baht(r.charge.total)}</td>
      <td className="px-3 py-2.5">
        <StateChip r={r} month={month} />
      </td>
    </tr>
  );
}

function ApartmentTable({ board, onOpen }: { board: RentalBoard; onOpen: (id: string) => void }) {
  const roomsOf = (id: string) => board.rooms.filter((r) => r.apartment.id === id);
  if (!board.apartments.length) {
    return (
      <SummaryBody pad>
        <EmptyState title="ยังไม่มีที่พัก" hint="กด “เพิ่ม” → ที่พักใหม่ เพื่อเริ่มต้น" />
      </SummaryBody>
    );
  }
  return (
    <div className="relative max-h-[calc(100dvh-10.5rem)] overflow-auto border-t border-line bg-base-100">
      <table className="sheet-table w-full min-w-[1080px] border-collapse text-13">
        <thead>
          <tr>
            <Th>ที่พัก</Th>
            <Th>เจ้าของ / ผู้ดูแล</Th>
            <Th>บัญชีรับเงิน</Th>
            <Th>เงื่อนไขสัญญา</Th>
            <Th>บิลค่าเช่า</Th>
            <Th className="text-right">ห้อง (เดือนนี้)</Th>
            <Th className="text-right">ค่าห้องรวม</Th>
          </tr>
        </thead>
        <tbody>
          {board.apartments.map((a) => {
            const rooms = roomsOf(a.id);
            const live = rooms.filter((r) => r.state !== "cancelled");
            const occupied = live.filter((r) => r.occupants.length).length;
            return (
              <tr
                key={a.id}
                onClick={(e) => !fromControl(e) && onOpen(a.id)}
                className="cursor-pointer align-top transition-colors hover:bg-soft/50 [&>td]:border-b [&>td]:border-line/70"
              >
                <td className="px-3 py-2.5">
                  <p className="font-medium">{a.name}</p>
                  {a.mapUrl ? (
                    <a
                      href={a.mapUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-11-5 text-mut hover:text-primary"
                    >
                      <MapPin size={11} aria-hidden /> แผนที่
                    </a>
                  ) : null}
                </td>
                <td className="px-3 py-2.5">
                  <p>{a.owner || <span className="text-mut">—</span>}</p>
                  {a.phone ? <p className="font-mono text-12 text-mut">{a.phone}</p> : null}
                </td>
                <td className="px-3 py-2.5">
                  {a.bankAccountNo ? (
                    <>
                      <p className="font-mono text-12-5">{a.bankAccountNo}</p>
                      <p className="text-11-5 text-mut">
                        {[a.bankName, a.bankAccountName].filter(Boolean).join(" · ")}
                      </p>
                    </>
                  ) : (
                    <span className="text-mut">—</span>
                  )}
                </td>
                <td className="max-w-56 px-3 py-2.5 text-12-5">{a.minContract || <span className="text-mut">—</span>}</td>
                <td className="px-3 py-2.5 text-12-5">
                  <span className={a.billSource === "self" ? "chip chip-wait px-2 py-0.5 text-11" : "text-mut"}>
                    {BILL_SOURCE_LABEL[a.billSource]}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  <p>{live.length}</p>
                  <p className="text-11-5 text-mut">มีผู้พัก {occupied}</p>
                </td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                  {baht(live.reduce((t, r) => t + r.charge.rent, 0))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ Excel */

interface ExportRow {
  r: BoardRoom;
  o: BoardOccupant | null;
  n: number;
}

/**
 * คอลัมน์ชุดเดียวกับไฟล์คุมเดิม — หนึ่งแถวต่อผู้พัก (ห้องว่าง = หนึ่งแถว)
 * น้ำ/ไฟ/ส่วนกลางเป็นส่วนของคนนั้นตามวันที่พัก (`chargeRoom`) · ยอดระดับห้องหารตามจำนวนผู้พัก
 */
function exportSheet(board: RentalBoard, rooms: BoardRoom[], filtering: boolean) {
  const rows = rooms.flatMap((r): ExportRow[] =>
    r.occupants.length ? r.occupants.map((o) => ({ r, o, n: r.occupants.length })) : [{ r, o: null, n: 1 }],
  );
  const per = (row: ExportRow, v: number | null | undefined) => (v == null ? null : Math.round((v / row.n) * 100) / 100);
  return {
    sheet: board.month,
    title: `ทะเบียนคุมห้องเช่าของบริษัท · ${monthLabel(board.month, "full")}`,
    filter: filtering ? "กรองตามหน้าจอ" : "",
    total: board.rooms.length,
    rows,
    columns: [
      { header: "ชื่อที่พัก", width: 30, value: (x: ExportRow) => x.r.apartment.name },
      { header: "เจ้าของห้อง", width: 20, value: (x: ExportRow) => x.r.apartment.owner },
      { header: "เบอร์ติดต่อ", width: 14, value: (x: ExportRow) => x.r.apartment.phone, kind: "code" as const },
      { header: "วันที่ทำสัญญา", width: 13, value: (x: ExportRow) => x.r.room.contractStart || null, kind: "date" as const },
      { header: "ค่าห้อง", width: 10, value: (x: ExportRow) => x.r.charge.rent, kind: "decimal" as const },
      { header: "เงินประกัน", width: 10, value: (x: ExportRow) => x.r.room.deposit, kind: "decimal" as const },
      { header: "จ่ายก่อนเข้า", width: 11, value: (x: ExportRow) => x.r.room.advance, kind: "decimal" as const },
      { header: "ประจำแพล้นท์", width: 22, value: (x: ExportRow) => x.r.room.plant },
      { header: "เบอร์ห้อง", width: 10, value: (x: ExportRow) => x.r.room.roomNo, kind: "code" as const },
      { header: "สถานะห้อง", width: 14, value: (x: ExportRow) => ROOM_STATE_LABEL[x.r.state] },
      { header: "รหัสพนักงาน", width: 12, value: (x: ExportRow) => x.o?.stay.drivercode ?? "", kind: "code" as const },
      { header: "ชื่อพนักงาน", width: 24, value: (x: ExportRow) => (x.o ? occupantName(x.o) : "") },
      { header: "สถานะคน", width: 12, value: (x: ExportRow) => (x.o?.person ? (x.o.person.active ? "ปฏิบัติงาน" : EXIT_KIND_LABEL[x.o.person.exit?.kind ?? "left"]) : "") },
      { header: "เบอร์ พจส.", width: 14, value: (x: ExportRow) => x.o?.person?.phone ?? "", kind: "code" as const },
      { header: "ประเภทโม่", width: 12, value: (x: ExportRow) => x.o?.person?.position ?? "" },
      { header: "ลูกค้า", width: 14, value: (x: ExportRow) => x.o?.person?.customer ?? "" },
      { header: "แพล้นท์ (ทะเบียน)", width: 18, value: (x: ExportRow) => x.o?.person?.plant ?? "" },
      { header: "วันเริ่มงาน", width: 12, value: (x: ExportRow) => x.o?.person?.startDate || null, kind: "date" as const },
      { header: "วันพ้นสภาพ", width: 12, value: (x: ExportRow) => x.o?.person?.exit?.on || null, kind: "date" as const },
      { header: "วันเข้าอยู่", width: 12, value: (x: ExportRow) => x.o?.stay.checkIn || null, kind: "date" as const },
      { header: "วันย้ายออก", width: 12, value: (x: ExportRow) => x.o?.stay.checkOut || null, kind: "date" as const },
      { header: "จำนวนคนพัก", width: 14, value: (x: ExportRow) => (x.o ? LIVING_WITH_LABEL[x.o.stay.livingWith] : "") },
      { header: "รูปแบบการจ่าย", width: 26, value: (x: ExportRow) => payModeShort(x.r.room.payMode, x.r.room.cap) },
      { header: "ค่าห้อง (บริษัท)", width: 13, value: (x: ExportRow) => per(x, x.r.charge.companyRent), kind: "decimal" as const },
      { header: "ค่าห้อง (พจส.)", width: 12, value: (x: ExportRow) => x.o?.charge.rent ?? 0, kind: "decimal" as const },
      { header: "วันที่พักในเดือน", width: 12, value: (x: ExportRow) => x.o?.charge.monthDays ?? null, kind: "decimal" as const },
      { header: "ค่าไฟ", width: 9, value: (x: ExportRow) => (x.o ? x.o.charge.electric : x.r.bill?.electric ?? null), kind: "decimal" as const },
      { header: "ค่าน้ำ", width: 9, value: (x: ExportRow) => (x.o ? x.o.charge.water : x.r.bill?.water ?? null), kind: "decimal" as const },
      { header: "ค่าส่วนกลาง", width: 11, value: (x: ExportRow) => (x.o ? x.o.charge.common : x.r.bill?.common ?? null), kind: "decimal" as const },
      { header: "รวมยอดหัก พจส.", width: 13, value: (x: ExportRow) => x.o?.charge.deduct ?? 0, kind: "decimal" as const },
      { header: "รวมจ่ายทั้งหมด", width: 13, value: (x: ExportRow) => per(x, x.r.charge.total), kind: "decimal" as const },
      { header: "บิลค่าเช่า", width: 14, value: (x: ExportRow) => BILL_SOURCE_LABEL[x.r.apartment.billSource] },
      { header: "ชื่อบัญชี", width: 24, value: (x: ExportRow) => x.r.apartment.bankAccountName },
      { header: "ธนาคาร", width: 14, value: (x: ExportRow) => x.r.apartment.bankName },
      { header: "เลขที่บัญชี", width: 16, value: (x: ExportRow) => x.r.apartment.bankAccountNo, kind: "code" as const },
      { header: "เงื่อนไขสัญญา", width: 22, value: (x: ExportRow) => x.r.apartment.minContract },
      { header: "หมายเหตุ", width: 30, value: (x: ExportRow) => [x.r.room.remark, x.o?.stay.note].filter(Boolean).join(" · ") },
    ],
  };
}
