"use client";

import { createContext, useContext, useMemo } from "react";
import QRCode from "qrcode";
import { Bike, CarFront, Truck } from "lucide-react";

import {
  KIND_LABEL,
  OWNERSHIP,
  SITES,
  thaiDate,
  verifyPath,
  type Ownership,
  type ParkingVehicle,
} from "@/lib/parking/types";

/**
 * บัตรจอดรถ (Parking Permit) — สัดส่วนบัตร ID-1 (85.6 × 54 มม.) ใช้ได้ทั้งพิมพ์บัตรแข็งและสติ๊กเกอร์ติดกระจก
 *
 * อ่านจากระยะไกลก่อน: แถบสีบนบอกประเภทรถทันที (เขียว = รถบริษัท · น้ำเงิน = รถพนักงาน · อำพัน = ผู้มาติดต่อ)
 * → รหัสบัตรตัวใหญ่ → ป้ายทะเบียนแบบป้ายจริง ให้ รปภ. เทียบกับรถตรงหน้าได้ในแวบเดียว · QR ขวามือไว้สแกน (เฟส ③)
 *
 * สีของบัตรตรึงเป็นค่าคงที่ ไม่ตามธีมมืด — บัตรคือของจริงที่พิมพ์ออกไป หน้าตาต้องเหมือนกันทุกจอ
 */

/**
 * origin ของเว็บ (`https://…`) สำหรับลิงก์ใน QR — หน้า server อ่านจาก header แล้วส่งลงมา
 * (QR ต้องเป็น URL เต็ม แต่ `window.location` ใช้ตอน SSR ไม่ได้)
 */
export const QrOrigin = createContext("");

const TONE: Record<Ownership, { band: string; ink: string; soft: string }> = {
  company: { band: "#0b5e54", ink: "#0b5e54", soft: "#e3f1ee" },
  employee: { band: "#2456a3", ink: "#1f4a8c", soft: "#e5eefb" },
  visitor: { band: "#b26a0f", ink: "#8f550c", soft: "#fbf0df" },
};

type CardData = Pick<
  ParkingVehicle,
  "code" | "ownership" | "kind" | "plate" | "province" | "brand" | "model" | "color" | "ownerName" | "site" | "validUntil"
>;

export function PermitCard({ v, className = "" }: { v: CardData; className?: string }) {
  const tone = TONE[v.ownership];
  const meta = OWNERSHIP[v.ownership];
  const KindIcon = v.kind === "motorcycle" ? Bike : v.kind === "other" ? Truck : CarFront;
  const vehicle = [v.brand, v.model].filter(Boolean).join(" ") || "ยี่ห้อ / รุ่น";
  const code = v.code ?? `${meta.prefix}-${v.site}-····`;

  return (
    <div
      className={`permit-card relative isolate flex aspect-[85.6/54] w-full flex-col overflow-hidden rounded-[18px] bg-white text-[#15201d] shadow-[0_1px_0_rgba(0,0,0,.04),0_10px_30px_-12px_rgba(16,40,36,.35)] ring-1 ring-black/8 select-none [container-type:inline-size] [print-color-adjust:exact] ${className}`}
    >
      {/* ลายน้ำเส้นถนนจาง ๆ มุมขวาล่าง — ให้บัตรไม่โล่ง แต่ไม่แย่งสายตา */}
      <svg aria-hidden viewBox="0 0 200 120" className="absolute -right-[6%] -bottom-[18%] -z-10 w-[62%] opacity-[.07]">
        <path d="M10 118 C70 70 120 60 198 8" fill="none" stroke={tone.band} strokeWidth="26" />
        <path d="M10 118 C70 70 120 60 198 8" fill="none" stroke="#fff" strokeWidth="2.4" strokeDasharray="10 9" />
      </svg>

      {/* แถบหัว — สีประเภทรถ */}
      <div
        className="flex items-center justify-between px-[5.2cqw] py-[2.6cqw] text-white"
        style={{ background: `linear-gradient(100deg, ${tone.band}, color-mix(in oklab, ${tone.band} 78%, #000))` }}
      >
        <div className="flex items-center gap-[2cqw]">
          <span className="grid size-[6.4cqw] place-items-center rounded-[1.6cqw] bg-white/16 ring-1 ring-white/30">
            <span className="text-[3.4cqw] font-bold">P</span>
          </span>
          <div className="leading-none">
            <p className="text-[3.4cqw] font-bold tracking-[.08em]">MENA</p>
            <p className="mt-[.6cqw] text-[2.1cqw] font-medium tracking-[.16em] opacity-85">PARKING PERMIT</p>
          </div>
        </div>
        <div className="text-right leading-none">
          <p className="text-[2.9cqw] font-bold tracking-[.1em]">{meta.en}</p>
          <p className="mt-[.8cqw] text-[2.5cqw] opacity-90">{meta.label}</p>
        </div>
      </div>

      {/* เนื้อบัตร */}
      <div className="flex flex-1 gap-[4cqw] px-[5.2cqw] pt-[3.4cqw]">
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="text-[2.3cqw] font-medium tracking-[.12em] text-[#5c6b65]">PERMIT NO.</p>
          <p
            className="text-[8.4cqw] leading-[1.05] font-bold tracking-[-.01em] tabular-nums"
            style={{ color: v.code ? tone.ink : "#9aa8a3" }}
          >
            {code}
          </p>

          {/* ป้ายทะเบียนแบบป้ายจริง: เลขใหญ่ บรรทัดล่างจังหวัด */}
          <div className="mt-[2.4cqw] flex items-center gap-[2.6cqw]">
            <div className="rounded-[1.4cqw] border-[.5cqw] border-[#15201d] bg-white px-[2.6cqw] py-[.9cqw] text-center leading-none">
              <p className="text-[4.6cqw] font-bold whitespace-nowrap">{v.plate || "กข 0000"}</p>
              <p className="mt-[.7cqw] text-[2.1cqw] text-[#3d4a46]">{v.province || "จังหวัด"}</p>
            </div>
            <div className="min-w-0 leading-tight">
              <p className="flex items-center gap-[1cqw] truncate text-[2.9cqw] font-semibold">
                <KindIcon aria-hidden className="size-[3.4cqw] flex-none" strokeWidth={2} />
                <span className="truncate">{vehicle}</span>
              </p>
              <p className="mt-[.6cqw] truncate text-[2.5cqw] text-[#5c6b65]">
                {[KIND_LABEL[v.kind], v.color && `สี${v.color}`].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-none flex-col items-center">
          <div className="rounded-[2cqw] bg-white p-[1.2cqw] ring-1 ring-black/10">
            <QrMark code={v.code} seed={code} className="size-[21cqw]" />
          </div>
          <p className="mt-[1cqw] text-[1.9cqw] tracking-[.08em] text-[#5c6b65]">SCAN TO VERIFY</p>
        </div>
      </div>

      {/* ท้ายบัตร — ผู้รับผิดชอบ · ศูนย์ · วันหมดอายุ */}
      <div
        className="mt-auto flex items-end justify-between gap-[3cqw] px-[5.2cqw] py-[2.4cqw]"
        style={{ background: tone.soft }}
      >
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[2.9cqw] font-semibold">{v.ownerName || "ชื่อผู้รับผิดชอบ"}</p>
          <p className="truncate text-[2.4cqw] text-[#5c6b65]">{SITES[v.site]}</p>
        </div>
        <div className="flex-none text-right leading-tight">
          <p className="text-[2.1cqw] tracking-[.08em] text-[#5c6b65]">VALID UNTIL</p>
          <p className="text-[2.8cqw] font-semibold" style={{ color: tone.ink }}>
            {v.ownership === "visitor" ? thaiDate(v.validUntil) : "ตลอดการเป็นพนักงาน"}
          </p>
        </div>
      </div>
      <p className="bg-[#15201d] py-[.8cqw] text-center text-[1.8cqw] font-medium tracking-[.28em] text-white/80">
        ONE TEAM • ONE AIM • ONE MENA
      </p>
    </div>
  );
}

/**
 * QR จริงของบัตรที่ออกแล้ว — ลิงก์ไปหน้าตรวจบัตร (`verifyPath`) ต้องล็อกอินก่อนเห็นข้อมูล · ใน QR ไม่มีข้อมูลส่วนตัว
 * ใช้ `QRCode.create()` (sync) แล้ววาด SVG เอง: คมทุกขนาดทั้งจอและพิมพ์ · ยังไม่ออกบัตร = ลายจำลองจาง ๆ
 */
function QrMark({ code, seed, className }: { code: string | null; seed: string; className?: string }) {
  const origin = useContext(QrOrigin);
  const qr = useMemo(() => {
    if (!code || !origin) return null;
    const m = QRCode.create(`${origin}${verifyPath(code)}`, { errorCorrectionLevel: "M" }).modules;
    const d: string[] = [];
    for (let y = 0; y < m.size; y++) for (let x = 0; x < m.size; x++) if (m.get(y, x)) d.push(`M${x} ${y}h1v1h-1z`);
    return { size: m.size, d: d.join("") };
  }, [code, origin]);

  if (!qr)
    return (
      <span className="relative block">
        <PseudoQr seed={seed} className={`${className} opacity-25`} />
        <span className="absolute inset-0 grid place-items-center text-center text-[2.2cqw] leading-tight font-semibold text-[#5c6b65]">
          QR ออก
          <br />
          เมื่ออนุมัติ
        </span>
      </span>
    );
  return (
    <svg viewBox={`-1 -1 ${qr.size + 2} ${qr.size + 2}`} className={className} shapeRendering="crispEdges" role="img" aria-label={`QR ตรวจบัตร ${code}`}>
      <rect x="-1" y="-1" width={qr.size + 2} height={qr.size + 2} fill="#fff" />
      <path d={qr.d} fill="#15201d" />
    </svg>
  );
}

/** ลายจำลองสำหรับบัตรที่ยังไม่ออกรหัส (finder 3 มุม + ลายจากรหัส) — สแกนไม่ได้ */
function PseudoQr({ seed, className }: { seed: string; className?: string }) {
  const n = 25;
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rand = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 1000) / 1000;
  };
  const inFinder = (x: number, y: number) =>
    (x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8);
  const cells: string[] = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) if (!inFinder(x, y) && rand() > 0.52) cells.push(`M${x} ${y}h1v1h-1z`);
  const finder = (x: number, y: number) =>
    `M${x} ${y}h7v7h-7zM${x + 1} ${y + 1}v5h5v-5zM${x + 2} ${y + 2}h3v3h-3z`;

  return (
    <svg viewBox={`0 0 ${n} ${n}`} className={className} shapeRendering="crispEdges" aria-label="QR ตรวจสิทธิ์">
      <path d={cells.join("")} fill="#15201d" />
      <path d={[finder(0, 0), finder(n - 7, 0), finder(0, n - 7)].join("")} fill="#15201d" fillRule="evenodd" />
    </svg>
  );
}
