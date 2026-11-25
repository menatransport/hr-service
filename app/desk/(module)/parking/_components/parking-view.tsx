"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, BadgeCheck, Loader2, ScanLine, Camera, CarFront, IdCard, PencilLine, Plus, Printer, ShieldCheck, TableProperties, Undo2 } from "lucide-react";

import { HeaderSlot } from "@/components/shell/header-slot";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchField, TextareaField } from "@/components/ui/field";
import {
  SegmentedControl,
  SummaryBody,
  SummaryPanel,
  SummaryStat,
  SummaryStats,
  SummaryStrip,
  SummaryToolbar,
} from "@/components/ui/summary-panel";
import { useIsDesktop } from "@/lib/use-is-desktop";
import { toastError, toastSuccess } from "@/lib/swal";
import {
  KIND_LABEL,
  OWNERSHIP,
  SITES,
  STATUS_CHIP,
  STATUS_LABEL,
  thaiDate,
  type Ownership,
  type ParkingMe,
  type ParkingVehicle,
  type ScanResult,
  type VehicleStatus,
} from "@/lib/parking/types";
import type { ScanEntry } from "@/lib/parking/store";

import { Drawer, DrawerSection } from "../../rentals/_components/shared";
import { PermitCard, QrOrigin } from "./permit-card";
import {
  approveVehicleAction,
  cancelVehicleAction,
  listScansAction,
  registerVehicle,
  resubmitVehicleAction,
  returnVehicleAction,
  type ActionResult,
} from "../actions";
import { DOT, RegisterDrawer } from "./register-drawer";
import type { VehicleInput } from "@/lib/parking/types";

/**
 * บริการจอดรถบริษัท · เฟส 1 — ทะเบียนรถ + ออกบัตรจอด
 *
 * รายการมาจากหน้า server (กรองตามสิทธิ์แล้ว) · ทุกคำสั่งเรียก server action แล้ว `router.refresh()`
 *
 * สองมุมมอง (Bew 24 พ.ย. 2569): `admin` (HOD + Process Excellence) = ตารางทะเบียนทุกคัน · คนอื่น = “บัตรจอดของฉัน”
 * แอดมินสลับไปดูหน้าผู้ใช้ได้จากปุ่มบนแถบบน (`HeaderSlot`)
 *
 * - แถบสรุปกดกรองตามสถานะ · แถบประเภทกรองรถบริษัท/พนักงาน/ผู้มาติดต่อ
 * - คลิกแถว = แผงขวา: บัตร + ข้อมูลรถ + ปุ่มตามสถานะ (รอตรวจ → อนุมัติ/ส่งกลับ · ใช้งาน → พิมพ์/ยกเลิก)
 * - อนุมัติ = ออกรหัสบัตรถัดไปของ ประเภท × ศูนย์ (ตัวนับ `parking_counters` ฝั่งเซิร์ฟเวอร์)
 */

type StatusFilter = VehicleStatus | "all";
type OwnerFilter = Ownership | "all";
type DrawerState = { kind: "new" } | { kind: "edit"; id: string } | { kind: "view"; id: string } | null;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

export function ParkingView({
  vehicles: list,
  qrOrigin,
  admin,
  me,
  initialDesktop,
}: {
  /** แอดมิน = ทุกคัน · ผู้ใช้ทั่วไป = คันที่ตัวเองเป็นเจ้าของหรือเป็นคนยื่น (เซิร์ฟเวอร์กรองมาแล้ว) */
  vehicles: ParkingVehicle[];
  /** `https://โดเมน` สำหรับลิงก์ใน QR บนบัตร */
  qrOrigin: string;
  /** สิทธิ์ย่อย `parking-admin` — เห็นตารางทะเบียน + สลับดูหน้าผู้ใช้ได้ */
  admin: boolean;
  me: ParkingMe;
  initialDesktop: boolean;
}) {
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const [mode, setMode] = useState<"admin" | "mine">(admin ? "admin" : "mine");
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const asAdmin = admin && mode === "admin";

  /** ผลของ server action — สำเร็จ = รีเฟรชรายการจากเซิร์ฟเวอร์ · ไม่สำเร็จ = toast ข้อความจากเซิร์ฟเวอร์ */
  const done = <T,>(r: ActionResult<T>, title: string, text?: string): r is { ok: true; data: T } => {
    if (!r.ok) {
      toastError("ทำรายการไม่สำเร็จ", r.message);
      return false;
    }
    toastSuccess(title, text);
    startRefresh(() => router.refresh());
    return true;
  };

  const submit = async (input: VehicleInput): Promise<boolean> => {
    if (drawer?.kind === "edit") {
      const id = drawer.id;
      if (!done(await resubmitVehicleAction(id, input), "ส่งคำขอใหม่แล้ว", "HR จะตรวจข้อมูลอีกครั้ง")) return false;
      setDrawer({ kind: "view", id });
      return true;
    }
    const r = await registerVehicle(input);
    if (!done(r, "ส่งคำขอลงทะเบียนแล้ว", "รอ HR ตรวจข้อมูลและกรรมสิทธิ์")) return false;
    setDrawer({ kind: "view", id: r.data });
    return true;
  };

  const selected = drawer && drawer.kind !== "new" ? list.find((v) => v.id === drawer.id) : undefined;
  const openNew = () => setDrawer({ kind: "new" });
  const openView = (id: string) => setDrawer({ kind: "view", id });

  return (
    <QrOrigin value={qrOrigin}>
      {admin ? (
        <HeaderSlot>
          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === "admin" ? "mine" : "admin"));
              setDrawer(null);
            }}
            title={asAdmin ? "ดูหน้าที่ผู้ใช้ทั่วไปเห็น" : "กลับไปตารางทะเบียนรถ"}
            className="glass-btn flex h-10 flex-none items-center gap-2 rounded-xl px-3 text-13 font-semibold"
          >
            {asAdmin ? <IdCard size={17} aria-hidden /> : <TableProperties size={17} aria-hidden />}
            <span className="hidden sm:inline">{asAdmin ? "มุมมองผู้ใช้" : "ตารางทะเบียนรถ"}</span>
          </button>
        </HeaderSlot>
      ) : null}

      {asAdmin ? (
        <AdminTable list={list} initialDesktop={initialDesktop} onNew={openNew} onOpen={openView} />
      ) : (
        <MyParking list={list.filter((v) => v.ownerId === me.employeeId || v.requestedBy === me.employeeId)} me={me} onNew={openNew} onOpen={openView} />
      )}

      {drawer?.kind === "new" || (drawer?.kind === "edit" && selected) ? (
        <RegisterDrawer
          initial={drawer.kind === "edit" ? selected : undefined}
          prefill={
            asAdmin
              ? undefined
              : { ownerId: me.employeeId, ownerName: me.name, department: me.department, site: me.site }
          }
          vehicles={list}
          onClose={() => setDrawer(selected ? { kind: "view", id: selected.id } : null)}
          onSubmit={submit}
        />
      ) : drawer?.kind === "view" && selected ? (
        <VehicleDrawer
          v={selected}
          admin={asAdmin}
          onClose={() => setDrawer(null)}
          onEdit={() => setDrawer({ kind: "edit", id: selected.id })}
          onApprove={async () => {
            const r = await approveVehicleAction(selected.id);
            done(r, r.ok ? `ออกบัตร ${r.data} แล้ว` : "", "พิมพ์บัตรแล้วติดที่กระจกหน้ารถ");
          }}
          onReturn={async (note) => done(await returnVehicleAction(selected.id, note), "ส่งกลับให้ผู้ยื่นแก้ไขแล้ว")}
          onCancel={async (note) => done(await cancelVehicleAction(selected.id, note), "ยกเลิกบัตรแล้ว")}
        />
      ) : null}
    </QrOrigin>
  );
}

/** ตารางทะเบียนรถทุกคัน — HOD + Process Excellence · ปุ่มลงทะเบียนชิดขวาสุดของแถบเครื่องมือ */
function AdminTable({
  list,
  initialDesktop,
  onNew,
  onOpen,
}: {
  list: ParkingVehicle[];
  initialDesktop: boolean;
  onNew: () => void;
  onOpen: (id: string) => void;
}) {
  const desktop = useIsDesktop(initialDesktop);
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [owner, setOwner] = useState<OwnerFilter>("all");

  const counts = useMemo(() => {
    const c: Record<VehicleStatus, number> = { pending: 0, active: 0, returned: 0, cancelled: 0 };
    for (const v of list) c[v.status]++;
    return c;
  }, [list]);

  const results = useMemo(() => {
    const q = norm(deferred.trim());
    return list
      .filter(
        (v) =>
          (status === "all" || v.status === status) &&
          (owner === "all" || v.ownership === owner) &&
          (!q ||
            norm([v.code, v.plate, v.province, v.brand, v.model, v.ownerName, v.ownerId, v.department].join(" ")).includes(q)),
      )
      .sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending") || b.createdAt.localeCompare(a.createdAt));
  }, [list, deferred, status, owner]);

  const toggle = (s: VehicleStatus) => setStatus((cur) => (cur === s ? "all" : s));
  const filtering = Boolean(deferred.trim()) || status !== "all" || owner !== "all";
  const clearFilters = () => {
    setQuery("");
    setStatus("all");
    setOwner("all");
  };
  const byOwner = (o: Ownership) => list.filter((v) => v.ownership === o).length;

  return (
    <div className="flex animate-rise flex-col pb-6">
      <SummaryPanel label="สรุปทะเบียนรถ">
        <SummaryStats className="grid-cols-2 lg:grid-cols-5">
          <SummaryStat
            lead
            label="รถที่ลงทะเบียน"
            value={list.length}
            unit="คัน"
            sub={`รถบริษัท ${byOwner("company")} · พนักงาน ${byOwner("employee")} · ผู้มาติดต่อ ${byOwner("visitor")}`}
            className="col-span-2 lg:col-span-1"
            active={status === "all"}
            onClick={() => setStatus("all")}
          />
          <SummaryStat label="รอตรวจ" value={counts.pending} unit="คัน" sub="HR ต้องตรวจ" dot="bg-sla" tone="sla" active={status === "pending"} onClick={() => toggle("pending")} />
          <SummaryStat label="ใช้งาน" value={counts.active} unit="คัน" sub="ออกบัตรแล้ว" dot="bg-primary" tone="primary" share={counts.active / (list.length || 1)} active={status === "active"} onClick={() => toggle("active")} />
          <SummaryStat label="ส่งกลับแก้ไข" value={counts.returned} unit="คัน" dot="bg-ink/40" active={status === "returned"} onClick={() => toggle("returned")} />
          <SummaryStat label="ยกเลิก" value={counts.cancelled} unit="คัน" dot="bg-alert" tone="alert" active={status === "cancelled"} onClick={() => toggle("cancelled")} />
        </SummaryStats>

        <SummaryToolbar className="lg:flex-wrap">
          <SearchField
            value={query}
            onChange={setQuery}
            label="ค้นหารถ"
            placeholder="ค้นหาทะเบียน รหัสบัตร ชื่อ/รหัสพนักงาน ยี่ห้อ…"
            tone="filled"
            className="w-full lg:max-w-96 lg:flex-1"
          />
          <SegmentedControl
            label="ประเภทรถ"
            value={owner}
            onChange={setOwner}
            options={[
              { value: "all", label: "ทุกประเภท" },
              ...(Object.keys(OWNERSHIP) as Ownership[]).map((o) => ({ value: o, label: OWNERSHIP[o].label })),
            ]}
          />
          <button
            type="button"
            onClick={onNew}
            className="btn-pri inline-flex items-center gap-1.5 px-4 py-2 text-13 lg:ml-auto"
          >
            <Plus size={15} aria-hidden /> ลงทะเบียนรถ
          </button>
        </SummaryToolbar>

        <SummaryStrip>
          <p role="status" aria-live="polite" className="py-2.5 text-12-5 text-mut">
            {filtering ? "พบ " : "ทั้งหมด "}
            <b className="font-semibold text-ink tabular-nums">{results.length}</b> คัน
          </p>
        </SummaryStrip>

        {!results.length ? (
          <SummaryBody pad>
            <EmptyState title="ไม่พบรถตามเงื่อนไข" hint="ลองล้างตัวกรองหรือค้นด้วยทะเบียน/ชื่อ" onClear={clearFilters} />
          </SummaryBody>
        ) : desktop ? (
          <div className="border-t border-line">
            <table className="sheet-table w-full border-collapse text-13">
              <thead>
                <tr>
                  {["ทะเบียน", "รถ", "ผู้รับผิดชอบ", "ประเภท", "ศูนย์", "รหัสบัตร", "สถานะ"].map((h) => (
                    <th key={h} className="border-b border-line bg-base-100 px-3 py-2.5 text-left text-12 font-medium text-mut first:pl-(--sheet-px)">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((v) => (
                  <tr
                    key={v.id}
                    onClick={() => onOpen(v.id)}
                    className="cursor-pointer border-b border-line transition-colors hover:bg-base-200/60"
                  >
                    <td className="px-3 py-2.5 pl-(--sheet-px)">
                      <PlateChip v={v} />
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{[v.brand, v.model].filter(Boolean).join(" ")}</p>
                      <p className="text-12 text-mut">{[KIND_LABEL[v.kind], v.color && `สี${v.color}`].filter(Boolean).join(" · ")}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{v.ownerName}</p>
                      <p className="text-12 text-mut">{[v.ownerId, v.department].filter(Boolean).join(" · ")}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <OwnerTag o={v.ownership} />
                    </td>
                    <td className="px-3 py-2.5 text-mut">{SITES[v.site].replace("ศูนย์", "")}</td>
                    <td className="px-3 py-2.5 font-semibold tabular-nums">{v.code ?? <span className="font-normal text-mut">—</span>}</td>
                    <td className="px-3 py-2.5">
                      <span className={`chip ${STATUS_CHIP[v.status]}`}>{STATUS_LABEL[v.status]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {results.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => onOpen(v.id)}
                  className="flex w-full items-center gap-3 px-(--sheet-px) py-3 text-left"
                >
                  <PlateChip v={v} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-13 font-medium">{v.ownerName}</span>
                    <span className="block truncate text-12 text-mut">
                      {OWNERSHIP[v.ownership].label} · {[v.brand, v.model].filter(Boolean).join(" ")}
                    </span>
                  </span>
                  <span className={`chip ${STATUS_CHIP[v.status]}`}>{STATUS_LABEL[v.status]}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </SummaryPanel>
    </div>
  );
}

const STEPS = [
  { icon: Camera, title: "กรอกข้อมูลรถ", text: "ทะเบียน ยี่ห้อ และรูปด้านหน้าเห็นป้ายทะเบียน" },
  { icon: ShieldCheck, title: "HR ตรวจกรรมสิทธิ์", text: "ข้อมูลถูกต้องและไม่ซ้ำ ระบบออกรหัสบัตรให้" },
  { icon: IdCard, title: "รับบัตรติดรถ", text: "พิมพ์บัตรติดกระจกหน้า รปภ. ตรวจได้ทันที" },
];

/** สีแถบหัวบัตรแต่ละประเภท — ป้ายอธิบายใต้ขั้นตอน ให้รู้ว่าบัตรสีไหนคือรถแบบไหน */
const TYPE_LEGEND: { o: Ownership; text: string }[] = [
  { o: "company", text: "รถบริษัท" },
  { o: "employee", text: "รถพนักงาน" },
  { o: "visitor", text: "ผู้มาติดต่อ" },
];

/** พื้นฝั่งบัตร — teal ระบบไล่เข้ม + ดวงไฟทองจาง ๆ + เส้นถนนประ (ชุดเดียวกับลายน้ำบนบัตร) */
function CardStage({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`relative isolate overflow-hidden ${className}`}
      style={{
        background:
          "radial-gradient(120% 90% at 15% 0%, color-mix(in oklab, #f5c451 22%, transparent), transparent 55%), linear-gradient(150deg, #0f766e, #0b4f4a 70%)",
      }}
    >
      <svg aria-hidden viewBox="0 0 400 300" preserveAspectRatio="none" className="absolute inset-0 -z-10 size-full opacity-[.13]">
        <path d="M-20 300 C120 210 230 170 420 40" fill="none" stroke="#fff" strokeWidth="46" />
        <path d="M-20 300 C120 210 230 170 420 40" fill="none" stroke="#0b4f4a" strokeWidth="3" strokeDasharray="16 14" />
      </svg>
      {children}
    </div>
  );
}

/**
 * หน้าของผู้ใช้ทั่วไป — เห็นเฉพาะรถของตัวเอง (`ownerId` = รหัสคนที่ล็อกอิน)
 *
 * **กรอบเนื้อหาใบเดียว** (Bew 24 พ.ย. 2569 — ขอให้มีกรอบ ไม่ลอยบนแผ่น): ซ้ายเวทีสี teal วางบัตร · ขวาคำอธิบาย
 * - ยังไม่มีรถ = บัตรตัวอย่างชื่อตัวเอง + 3 ขั้น (เส้นต่อกัน) + ปุ่มลงทะเบียน + ป้ายสีประเภทบัตร
 * - มีแล้ว = หัวกรอบ “บัตรจอดของฉัน” + บัตรจริงเรียงเป็นกริดในกรอบเดียวกัน
 */
function MyParking({
  list,
  me,
  onNew,
  onOpen,
}: {
  list: ParkingVehicle[];
  me: ParkingMe;
  onNew: () => void;
  onOpen: (id: string) => void;
}) {
  if (!list.length)
    return (
      <div className="animate-rise py-6 lg:py-10">
        <section className="mx-auto grid max-w-[1080px] overflow-hidden rounded-[28px] border border-line bg-base-100 shadow-[0_24px_60px_-36px_rgba(11,79,74,.45)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
          <CardStage className="flex flex-col items-center justify-center gap-5 px-8 py-12 lg:px-12 lg:py-16">
            <span className="rounded-full bg-white/14 px-3 py-1 text-11-5 font-medium text-white/90 ring-1 ring-white/25">
              ตัวอย่างบัตรของคุณ
            </span>
            <div className="relative w-full max-w-[400px]">
              {/* ใบหลังเอียง — ให้อ่านเป็นบัตรจริงที่จับต้องได้ */}
              <div aria-hidden className="absolute inset-0 translate-x-4 translate-y-3 rotate-[5deg] rounded-[18px] bg-white/18 ring-1 ring-white/25" />
              <div className="relative -rotate-[2deg]">
                <PermitCard
                  v={{
                    code: null,
                    ownership: "employee",
                    kind: "car",
                    plate: "",
                    province: "",
                    brand: "",
                    model: "",
                    color: "",
                    ownerName: me.name,
                    site: me.site,
                    validUntil: "",
                  }}
                />
              </div>
            </div>
            <p className="max-w-[34ch] text-center text-12-5 leading-relaxed text-white/80">
              รหัสบัตร ทะเบียน และ QR จะขึ้นจริงเมื่อ HR อนุมัติ
            </p>
          </CardStage>

          <div className="flex flex-col gap-6 px-7 py-9 sm:px-10 lg:py-12">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-soft px-2.5 py-1 text-11-5 font-semibold text-primary">
                <CarFront size={13} aria-hidden /> บริการจอดรถบริษัท
              </span>
              <h1 className="mt-3 text-24 font-semibold tracking-[-0.01em] text-balance">ยังไม่มีรถที่ลงทะเบียน</h1>
              <p className="mt-1.5 max-w-[44ch] text-13-5 leading-[1.7] text-mut text-pretty">
                ลงทะเบียนครั้งเดียว รับบัตรจอดประจำรถ ใช้ได้ทุกวันตลอดการเป็นพนักงาน
              </p>
            </div>

            {/* ขั้นตอน — วงตัวเลขต่อกันด้วยเส้น อ่านลงเป็นลำดับ */}
            <ol className="flex flex-col">
              {STEPS.map((s, i) => (
                <li key={s.title} className="relative flex gap-4 pb-5 last:pb-0">
                  {i < STEPS.length - 1 ? (
                    <span aria-hidden className="absolute top-11 bottom-1 left-[21px] w-px bg-line" />
                  ) : null}
                  <span className="relative grid size-11 flex-none place-items-center rounded-2xl bg-soft text-primary ring-1 ring-primary/15">
                    <s.icon size={19} aria-hidden />
                    <span className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-primary text-10 font-bold text-primary-content ring-2 ring-base-100">
                      {i + 1}
                    </span>
                  </span>
                  <span className="pt-1">
                    <span className="block text-14 font-semibold">{s.title}</span>
                    <span className="block text-12-5 leading-relaxed text-mut">{s.text}</span>
                  </span>
                </li>
              ))}
            </ol>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <button type="button" onClick={onNew} className="btn-pri inline-flex items-center gap-2 px-6 py-3 text-14">
                <Plus size={17} aria-hidden /> ลงทะเบียนรถ
              </button>
              <span className="flex items-center gap-1.5 text-12 text-mut">
                <Camera size={14} aria-hidden /> เตรียมรูปด้านหน้ารถไว้ก่อน
              </span>
            </div>

            <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line pt-4 text-12 text-mut">
              <span className="font-medium text-ink">สีบัตร</span>
              {TYPE_LEGEND.map(({ o, text }) => (
                <span key={o} className="inline-flex items-center gap-1.5">
                  <span aria-hidden className={`h-2.5 w-5 rounded-full ${DOT[o]}`} />
                  {text}
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>
    );

  return (
    <div className="animate-rise py-6 lg:py-8">
      <section className="mx-auto max-w-[1180px] overflow-hidden rounded-[28px] border border-line bg-base-100 shadow-[0_24px_60px_-36px_rgba(11,79,74,.45)]">
        <CardStage className="flex flex-wrap items-center justify-between gap-4 px-7 py-6 text-white sm:px-9">
          <div>
            <p className="text-12 font-medium text-white/75">บริการจอดรถบริษัท</p>
            <h1 className="text-22 font-semibold tracking-[-0.01em]">บัตรจอดของฉัน</h1>
            <p className="text-12-5 text-white/80">{list.length} คัน · กดบัตรเพื่อดูรายละเอียดหรือพิมพ์</p>
          </div>
          <button
            type="button"
            onClick={onNew}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-13 font-semibold text-primary shadow-sm transition-colors hover:bg-white/90"
          >
            <Plus size={15} aria-hidden /> ลงทะเบียนรถเพิ่ม
          </button>
        </CardStage>

        <ul className="grid gap-x-7 gap-y-8 px-7 py-8 sm:grid-cols-2 sm:px-9 2xl:grid-cols-3">
          {list.map((v) => (
            <li key={v.id} className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => onOpen(v.id)}
                aria-label={`บัตรจอด ${v.plate} ${v.province}`}
                className={`rounded-[18px] text-left transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary ${
                  v.status === "active" ? "" : "opacity-75 grayscale-[.35]"
                }`}
              >
                <PermitCard v={v} />
              </button>
              <div className="flex items-center justify-between gap-2 px-1">
                <span className={`chip ${STATUS_CHIP[v.status]}`}>{STATUS_LABEL[v.status]}</span>
                <span className="text-12 text-mut">
                  {v.status === "active"
                    ? `ออกบัตร ${thaiDate(v.issuedAt)}`
                    : v.status === "pending"
                      ? `ยื่นเมื่อ ${thaiDate(v.createdAt)} · รอ HR ตรวจ`
                      : v.status === "returned"
                        ? "กดบัตรเพื่อแก้ไขแล้วส่งใหม่"
                        : "บัตรถูกยกเลิก"}
                </span>
              </div>
              {v.note && v.status === "returned" ? (
                <p className="rounded-lg bg-st-wait px-3 py-2 text-12 text-st-wait-ink">{v.note}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function PlateChip({ v }: { v: ParkingVehicle }) {
  return (
    <span className="inline-flex w-28 flex-none flex-col items-center rounded-md border-[1.5px] border-ink bg-base-100 px-2 py-0.5 leading-tight">
      <span className="text-13 font-bold whitespace-nowrap">{v.plate}</span>
      <span className="max-w-full truncate text-11 text-mut">{v.province}</span>
    </span>
  );
}

function OwnerTag({ o }: { o: Ownership }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-12-5">
      <span aria-hidden className={`size-2 rounded-full ${DOT[o]}`} />
      {OWNERSHIP[o].label}
    </span>
  );
}

/** แผงขวาของรถหนึ่งคัน — บัตร + ข้อมูล + ปุ่มตามสถานะ · ส่งกลับ/ยกเลิกต้องใส่เหตุผล */
function VehicleDrawer({
  v,
  admin,
  onClose,
  onEdit,
  onApprove,
  onReturn,
  onCancel,
}: {
  v: ParkingVehicle;
  /** ปุ่มอนุมัติ/ส่งกลับ/ยกเลิก เฉพาะมุมมองตาราง · เจ้าของรถเห็นแค่พิมพ์/แก้ไข */
  admin: boolean;
  onClose: () => void;
  onEdit: () => void;
  onApprove: () => Promise<unknown>;
  /** คืน `true` = สำเร็จ (ปิดช่องเหตุผล) */
  onReturn: (note: string) => Promise<boolean>;
  onCancel: (note: string) => Promise<boolean>;
}) {
  const card = useRef<HTMLDivElement>(null);
  const [reason, setReason] = useState<{ kind: "return" | "cancel"; text: string } | null>(null);
  /** กำลังรอ server action — กันกดซ้ำ (อนุมัติสองครั้ง = ออกเลขบัตรสองเลข) */
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  };

  const rows: [string, React.ReactNode][] = [
    ["ประเภท", <OwnerTag key="o" o={v.ownership} />],
    ["ยานพาหนะ", KIND_LABEL[v.kind]],
    ["ทะเบียน", `${v.plate} ${v.province}`],
    ["ยี่ห้อ / รุ่น / สี", [v.brand, v.model, v.color].filter(Boolean).join(" · ") || "—"],
    ...(v.ownership === "company" ? ([["เลขทรัพย์สิน", v.assetNo || "—"]] as [string, React.ReactNode][]) : []),
    [v.ownership === "visitor" ? "ผู้มาติดต่อ" : "ผู้รับผิดชอบ", [v.ownerId, v.ownerName].filter(Boolean).join(" · ")],
    [v.ownership === "visitor" ? "มาติดต่อ" : "สังกัด", v.department || "—"],
    ["ศูนย์", SITES[v.site]],
    ["เบอร์ติดต่อ", v.phone],
    ...(v.ownership === "visitor" ? ([["บัตรหมดอายุ", thaiDate(v.validUntil)]] as [string, React.ReactNode][]) : []),
    ["ยื่นเมื่อ", thaiDate(v.createdAt)],
    ["ออกบัตรเมื่อ", thaiDate(v.issuedAt)],
  ];

  const footer =
    reason ? (
      <>
        <button type="button" onClick={() => setReason(null)} className="btn-ghost px-4 py-2 text-13">
          ย้อนกลับ
        </button>
        <button
          type="button"
          disabled={!reason.text.trim() || busy}
          onClick={async () => {
            const ok = await act(() => (reason.kind === "return" ? onReturn : onCancel)(reason.text.trim()));
            if (ok) setReason(null);
          }}
          className={`${reason.kind === "return" ? "btn-warn" : "btn-danger"} px-4 py-2 text-13 disabled:opacity-50`}
        >
          {reason.kind === "return" ? "ยืนยันส่งกลับแก้ไข" : "ยืนยันยกเลิกบัตร"}
        </button>
      </>
    ) : v.status === "pending" && admin ? (
      <>
        <button type="button" onClick={() => setReason({ kind: "return", text: "" })} className="btn-sec inline-flex items-center gap-1.5 px-4 py-2 text-13">
          <Undo2 size={14} aria-hidden /> ส่งกลับแก้ไข
        </button>
        <button type="button" disabled={busy} onClick={() => act(onApprove)} className="btn-pri inline-flex items-center gap-1.5 px-4 py-2 text-13 disabled:opacity-60">
          <BadgeCheck size={15} aria-hidden /> อนุมัติ · ออกบัตร
        </button>
      </>
    ) : v.status === "active" ? (
      <>
        {admin ? (
          <button type="button" onClick={() => setReason({ kind: "cancel", text: "" })} className="btn-ghost mr-auto inline-flex items-center gap-1.5 px-3 py-2 text-13 text-alert">
            <Ban size={14} aria-hidden /> ยกเลิกบัตร
          </button>
        ) : null}
        <button type="button" onClick={() => printCard(card.current)} className="btn-pri inline-flex items-center gap-1.5 px-4 py-2 text-13">
          <Printer size={15} aria-hidden /> พิมพ์บัตร
        </button>
      </>
    ) : v.status === "returned" ? (
      <button type="button" onClick={onEdit} className="btn-pri inline-flex items-center gap-1.5 px-4 py-2 text-13">
        <PencilLine size={14} aria-hidden /> แก้ไขแล้วส่งใหม่
      </button>
    ) : null;

  return (
    <Drawer
      eyebrow={v.code ?? "คำขอลงทะเบียนรถ"}
      title={`${v.plate} ${v.province}`}
      sub={`${v.ownerName} · ${OWNERSHIP[v.ownership].label}`}
      badge={<span className={`chip ${STATUS_CHIP[v.status]}`}>{STATUS_LABEL[v.status]}</span>}
      onClose={onClose}
      footer={footer}
    >
      <div ref={card} className="mx-auto mb-4 max-w-[440px]">
        <PermitCard v={v} />
      </div>

      {v.note ? (
        <p className={`mb-4 rounded-lg px-3 py-2 text-12-5 ${v.status === "cancelled" ? "bg-alert-soft text-alert" : "bg-st-wait text-st-wait-ink"}`}>
          <b className="font-semibold">{v.status === "cancelled" ? "เหตุผลที่ยกเลิก" : "สิ่งที่ต้องแก้"}:</b> {v.note}
        </p>
      ) : null}

      {reason ? (
        <DrawerSection title={reason.kind === "return" ? "ส่งกลับให้ผู้ยื่นแก้ไข" : "ยกเลิกบัตรจอด"}>
          <TextareaField
            id="pk-reason"
            label={reason.kind === "return" ? "สิ่งที่ต้องแก้" : "เหตุผลที่ยกเลิก"}
            hint={reason.kind === "return" ? "ผู้ยื่นจะเห็นข้อความนี้ในคำขอของตัวเอง" : "เลขบัตรนี้จะไม่ถูกนำกลับมาใช้ใหม่"}
            value={reason.text}
            onChange={(text) => setReason({ ...reason, text })}
          />
        </DrawerSection>
      ) : null}

      {admin && v.code ? <ScanHistory vehicleId={v.id} /> : null}

      <DrawerSection title="ข้อมูลรถ">
        {v.photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- พรีวิว blob ในเครื่อง
          <img src={v.photo} alt="รูปถ่ายรถ" className="aspect-[16/9] w-full rounded-xl border border-line object-cover" />
        ) : null}
        <dl className="grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-2 text-13">
          {rows.map(([k, val]) => (
            <div key={k} className="contents">
              <dt className="text-mut">{k}</dt>
              <dd className="min-w-0 break-words">{val}</dd>
            </div>
          ))}
        </dl>
      </DrawerSection>
    </Drawer>
  );
}

/**
 * พิมพ์บัตรใบเดียว — เปิดหน้าต่างใหม่ที่มีแค่บัตร ขนาดจริง 85.6 × 54 มม. (คัดลอก stylesheet ของหน้ามาด้วย)
 * ไม่ใช้กติกา `@media print` ของทั้งระบบ เพราะกติกานั้นเขียนไว้ให้กล่องทำเอกสารอย่างเดียว
 */
function printCard(node: HTMLElement | null) {
  if (!node) return;
  const w = window.open("", "_blank", "width=720,height=560");
  if (!w) return;
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((el) => el.outerHTML)
    .join("");
  w.document.write(
    `<!doctype html><html lang="th" data-theme="hrs"><head><title>บัตรจอดรถ</title>${styles}
    <style>@page{size:auto;margin:10mm}html,body{background:#fff!important;zoom:1!important}
    body>*{zoom:1!important}.wrap{width:85.6mm;padding:0}.permit-card{box-shadow:none!important;border-radius:3mm!important}</style>
    </head><body><div class="wrap">${node.innerHTML}</div></body></html>`,
  );
  w.document.close();
  w.addEventListener("load", () => {
    w.focus();
    w.print();
  });
}

const SCAN_LABEL: Record<ScanResult, { text: string; chip: string }> = {
  valid: { text: "ผ่าน", chip: "chip-live" },
  expired: { text: "หมดอายุ", chip: "chip-wait" },
  pending: { text: "ยังไม่อนุมัติ", chip: "chip-wait" },
  returned: { text: "ยังไม่อนุมัติ", chip: "chip-wait" },
  cancelled: { text: "ยกเลิกแล้ว", chip: "chip-alert" },
  "not-found": { text: "ไม่พบ", chip: "chip-alert" },
  denied: { text: "ไม่มีสิทธิ์", chip: "chip-done" },
};

/** ประวัติการสแกน QR (log ผู้ดู) — ใครเปิดดูบัตรนี้ เมื่อไร เห็นผลอะไร จากอุปกรณ์ไหน · แอดมินเท่านั้น */
function ScanHistory({ vehicleId }: { vehicleId: string }) {
  const [rows, setRows] = useState<ScanEntry[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    listScansAction(vehicleId).then((r) => {
      if (!live) return;
      if (r.ok) setRows(r.data);
      else setError(r.message);
    });
    return () => {
      live = false;
    };
  }, [vehicleId]);

  return (
    <DrawerSection title={`ประวัติการสแกน QR${rows ? ` · ${rows.length} ครั้ง` : ""}`}>
      {error ? (
        <p className="text-12-5 text-alert">{error}</p>
      ) : !rows ? (
        <p className="flex items-center gap-2 text-12-5 text-mut">
          <Loader2 size={14} className="animate-spin" aria-hidden /> กำลังโหลด…
        </p>
      ) : !rows.length ? (
        <p className="text-12-5 text-mut">ยังไม่มีใครสแกนบัตรนี้</p>
      ) : (
        <ol className="flex max-h-64 flex-col divide-y divide-line overflow-y-auto rounded-xl border border-line">
          {rows.map((r, i) => (
            <li key={`${r.at}-${i}`} className="flex items-center gap-3 px-3 py-2 text-12-5">
              <ScanLine size={15} className="flex-none text-mut" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{r.byName || r.by || "ไม่ทราบชื่อ"}</span>
                <span className="block truncate text-11-5 text-mut">
                  {new Date(r.at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" })}
                  {r.device ? ` · ${r.device}` : ""}
                </span>
              </span>
              <span className={`chip ${SCAN_LABEL[r.result].chip}`}>{SCAN_LABEL[r.result].text}</span>
            </li>
          ))}
        </ol>
      )}
    </DrawerSection>
  );
}
