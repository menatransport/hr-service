import Link from "next/link";
import {
  Bike,
  CarFront,
  CircleAlert,
  Clock3,
  FileClock,
  Lock,
  Phone,
  ShieldCheck,
  ShieldX,
  TableProperties,
  Truck,
} from "lucide-react";

import {
  KIND_LABEL,
  OWNERSHIP,
  SITES,
  thaiDate,
  type Ownership,
  type ParkingVehicle,
  type ScanResult,
} from "@/lib/parking/types";

import { LiveClock } from "./live-clock";

/**
 * ผลตรวจบัตรจอด — ออกแบบให้ รปภ. อ่านจากมือถือในแวบเดียว
 *
 * 1. แถบสถานะใหญ่บนสุด (สี + ไอคอน + คำเดียว) — ผ่าน / ไม่ผ่าน รู้ก่อนอ่านอะไร
 * 2. รูปรถ + ป้ายทะเบียนแบบป้ายจริง — เทียบกับคันตรงหน้า
 * 3. ผู้รับผิดชอบ + ปุ่มโทร — ติดต่อเจ้าของรถได้ทันที
 * นาฬิกาเดินบนแถบสถานะกันแคปหน้าจอเก่ามาโชว์ · ท้ายหน้าบอกว่าการตรวจนี้ถูกบันทึกแล้ว
 */

const TONE: Record<
  ScanResult,
  { from: string; to: string; icon: typeof ShieldCheck; title: string; sub: string }
> = {
  valid: { from: "#0f8a6e", to: "#0b5e54", icon: ShieldCheck, title: "บัตรใช้งานได้", sub: "อนุญาตให้จอดในพื้นที่บริษัท" },
  expired: { from: "#c27a12", to: "#8f550c", icon: Clock3, title: "บัตรหมดอายุแล้ว", sub: "บัตรชั่วคราวเลยวันหมดอายุ — ไม่อนุญาตตามปกติ" },
  pending: { from: "#c27a12", to: "#8f550c", icon: FileClock, title: "ยังไม่ได้รับอนุมัติ", sub: "คำขออยู่ระหว่าง HR ตรวจ — ยังไม่ใช่บัตรที่ใช้ได้" },
  returned: { from: "#c27a12", to: "#8f550c", icon: FileClock, title: "ยังไม่ได้รับอนุมัติ", sub: "คำขอถูกส่งกลับให้แก้ไข — ยังไม่ใช่บัตรที่ใช้ได้" },
  cancelled: { from: "#c2362c", to: "#8c1d16", icon: ShieldX, title: "บัตรถูกยกเลิก", sub: "ไม่อนุญาตให้จอด — แจ้ง HR หากพบรถคันนี้" },
  "not-found": { from: "#c2362c", to: "#8c1d16", icon: CircleAlert, title: "ไม่พบบัตรนี้ในระบบ", sub: "บัตรอาจปลอมหรือพิมพ์ผิด — ตรวจกับ HR ก่อนอนุญาต" },
  denied: { from: "#475569", to: "#1e293b", icon: Lock, title: "ไม่มีสิทธิ์ตรวจบัตร", sub: "บัญชีนี้ยังไม่ได้รับสิทธิ์ “ตรวจบัตรจอด” — ติดต่อ HR" },
};

const OWNER_DOT: Record<Ownership, string> = {
  company: "#0b5e54",
  employee: "#2456a3",
  visitor: "#b26a0f",
};

export function ScanView({
  code,
  result,
  vehicle: v,
  inspector,
  checkedAt,
  logged,
  admin,
}: {
  code: string;
  result: ScanResult;
  /** `null` = ไม่พบ หรือไม่มีสิทธิ์เห็น */
  vehicle: ParkingVehicle | null;
  inspector: string;
  checkedAt: string;
  logged: boolean;
  admin: boolean;
}) {
  const tone = TONE[result];
  const Icon = tone.icon;
  const KindIcon = v?.kind === "motorcycle" ? Bike : v?.kind === "other" ? Truck : CarFront;

  return (
    <div className="mx-auto flex w-full max-w-[480px] animate-rise flex-col gap-4 py-5 sm:py-8">
      {/* 1 · แถบสถานะ */}
      <section
        aria-live="polite"
        className="relative isolate overflow-hidden rounded-[28px] px-6 pt-7 pb-6 text-white shadow-[0_24px_50px_-28px_rgba(0,0,0,.55)]"
        style={{ background: `linear-gradient(155deg, ${tone.from}, ${tone.to})` }}
      >
        <svg aria-hidden viewBox="0 0 400 220" preserveAspectRatio="none" className="absolute inset-0 -z-10 size-full opacity-[.12]">
          <path d="M-20 220 C120 150 230 120 420 20" fill="none" stroke="#fff" strokeWidth="40" />
          <path d="M-20 220 C120 150 230 120 420 20" fill="none" stroke={tone.to} strokeWidth="3" strokeDasharray="14 12" />
        </svg>
        <div className="flex items-start justify-between gap-3">
          <span className="relative grid size-16 place-items-center">
            {result === "valid" ? (
              <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-white/25 [animation-duration:2.4s]" />
            ) : null}
            <span className="relative grid size-16 place-items-center rounded-full bg-white/18 ring-1 ring-white/35 backdrop-blur-sm">
              <Icon size={32} strokeWidth={2} aria-hidden />
            </span>
          </span>
          <span className="rounded-full bg-black/20 px-3 py-1 font-mono text-12-5 font-semibold tracking-wider ring-1 ring-white/20">
            {code || "—"}
          </span>
        </div>
        <h1 className="mt-5 text-[28px] leading-tight font-bold tracking-[-0.01em]">{tone.title}</h1>
        <p className="mt-1 text-13-5 text-white/85 text-pretty">{tone.sub}</p>
        <p className="mt-4 flex items-center gap-1.5 text-12 text-white/75">
          <Clock3 size={13} aria-hidden /> ตรวจเมื่อ <LiveClock initial={checkedAt} /> ·{" "}
          {new Date(checkedAt).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" })}
        </p>
      </section>

      {/* 2 · รถ */}
      {v ? (
        <section className="overflow-hidden rounded-[24px] border border-line bg-base-100 shadow-[0_18px_40px_-30px_rgba(11,79,74,.45)]">
          <div className="relative aspect-[16/10] bg-base-200">
            {v.photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- รูปจาก Spaces ขนาดไม่แน่นอน
              <img src={v.photo} alt={`รูปรถทะเบียน ${v.plate}`} className="size-full object-cover" />
            ) : (
              <div className="grid size-full place-items-center text-mut">
                <KindIcon size={48} strokeWidth={1.4} aria-hidden />
              </div>
            )}
            <div aria-hidden className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/55 to-transparent" />
            {/* ป้ายทะเบียนแบบป้ายจริง ลอยมุมล่างซ้ายของรูป */}
            <div className="absolute bottom-3.5 left-3.5 rounded-xl border-[3px] border-[#15201d] bg-white px-4 py-1.5 text-center leading-none text-[#15201d] shadow-lg">
              <p className="text-[26px] font-bold whitespace-nowrap">{v.plate}</p>
              <p className="mt-1 text-12 text-[#3d4a46]">{v.province}</p>
            </div>
          </div>

          <div className="flex flex-col gap-4 px-5 py-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-17 font-semibold">
                  <KindIcon size={18} className="flex-none text-mut" aria-hidden />
                  <span className="truncate">{[v.brand, v.model].filter(Boolean).join(" ")}</span>
                </p>
                <p className="mt-0.5 text-13 text-mut">
                  {[KIND_LABEL[v.kind], v.color && `สี${v.color}`].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span
                className="inline-flex flex-none items-center gap-1.5 rounded-full px-2.5 py-1 text-12 font-semibold text-white"
                style={{ background: OWNER_DOT[v.ownership] }}
              >
                {OWNERSHIP[v.ownership].label}
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-line text-13">
              <Cell label="ศูนย์" value={SITES[v.site]} />
              <Cell
                label={v.ownership === "visitor" ? "หมดอายุ" : "อายุบัตร"}
                value={v.ownership === "visitor" ? thaiDate(v.validUntil) : "ตลอดการเป็นพนักงาน"}
              />
              <Cell label="ออกบัตรเมื่อ" value={thaiDate(v.issuedAt)} />
              <Cell label={v.ownership === "company" ? "เลขทรัพย์สิน" : "รหัสบัตร"} value={v.ownership === "company" ? v.assetNo || "—" : v.code ?? "—"} />
            </dl>

            <div className="flex items-center gap-3 rounded-2xl bg-soft px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-11-5 text-mut">{v.ownership === "visitor" ? "ผู้มาติดต่อ" : "ผู้รับผิดชอบรถ"}</p>
                <p className="truncate text-14 font-semibold">{v.ownerName}</p>
                <p className="truncate text-12 text-mut">{[v.ownerId, v.department].filter(Boolean).join(" · ")}</p>
              </div>
              {v.phone ? (
                <a
                  href={`tel:${v.phone.replace(/[^\d+]/g, "")}`}
                  className="btn-pri inline-flex flex-none items-center gap-1.5 px-4 py-2.5 text-13"
                >
                  <Phone size={15} aria-hidden /> โทร
                </a>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {/* 3 · การตรวจนี้ถูกบันทึก */}
      <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 px-4 text-center text-12 text-mut">
        <ShieldCheck size={13} className="text-primary" aria-hidden />
        {logged ? "บันทึกการตรวจนี้แล้ว" : "บันทึกการตรวจไม่สำเร็จ"} · ผู้ตรวจ {inspector || "—"}
      </p>

      {admin ? (
        <Link href="/desk/parking" className="btn-sec mx-auto inline-flex items-center gap-1.5 px-4 py-2 text-13">
          <TableProperties size={15} aria-hidden /> เปิดตารางทะเบียนรถ
        </Link>
      ) : null}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-base-100 px-3.5 py-2.5">
      <dt className="text-11-5 text-mut">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}
