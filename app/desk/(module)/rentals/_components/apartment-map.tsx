"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useMemo, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import {
  BedDouble,
  Building2,
  ExternalLink,
  Landmark,
  MapPinOff,
  Navigation,
  Phone,
  ScrollText,
  User,
  X,
} from "lucide-react";

import { BILL_SOURCE_LABEL, ROOM_STATE_LABEL, occupantName, type RentalApartment, type RentalBoard } from "@/lib/rentals/types";

import { STATE_CHIP, baht } from "./shared";

/**
 * แผนที่ที่พัก (แท็บ “ที่พัก · เจ้าของ” → มุมมองแผนที่) — OpenStreetMap ผ่าน Leaflet
 *
 * - หมุด = ป้ายเล็ก ไอคอน + ชื่อเรียกสั้น + ค่าห้องต่อห้อง · ป้ายที่จะทับกันเหลือแต่จุดไอคอน (ที่พักห้องมากได้ป้ายก่อน) ซูมเข้าแล้วโผล่ครบ
 * - กดหมุด = การ์ดรายละเอียดลอยมุมซ้าย (จอเล็ก = แผ่นล่าง) · “เปิดรายละเอียด” ไปแผงขวาตัวเดิมเพื่อแก้ไข
 * - พิกัดมาจาก `lat/lng` ที่ระบบแกะจากลิงก์แผนที่ตอนบันทึก (`lib/rentals/geo.ts`) — ไม่มีพิกัดไปอยู่ในรายการ “ยังไม่มีพิกัด”
 * - กล่องแผนที่ `isolate` — pane ของ Leaflet ใช้ z-index 400–1000 ห้ามลอยทับแผงขวา / dropdown ของหน้า
 */

interface Spot {
  apartment: RentalApartment;
  short: string;
  rooms: RentalBoard["rooms"];
  live: number;
  occupied: number;
  /** ห้องว่างเดือนนี้ — มี = หมุดสีม่วง (`#7c3aed` ตรงกับ `.apt-pin.is-free`) */
  vacant: number;
  /** ค่าห้องต่อห้อง (ตามสัญญา) ต่ำสุด–สูงสุด ของห้องที่ยังเช่าอยู่ · 0 = ไม่มีข้อมูล */
  rentMin: number;
  rentMax: number;
}

/**
 * “ห้องเช่า ป้าจุ๊ป (หัวหมาก)” → “ป้าจุ๊ป” — ป้ายบนหมุดเอาแค่ชื่อเรียก
 * คำนำหน้าซ้ำทุกหมุด และย่านในวงเล็บแผนที่บอกอยู่แล้ว
 */
const shortName = (name: string) =>
  name
    .replace(/^(ห้องเช่า|หอพัก|ห้องพัก)\s*/, "")
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/[​\s]+/g, " ")
    .trim() || name;

/** “฿2,400” หรือ “฿2,200–2,700” เมื่อแต่ละห้องราคาไม่เท่ากัน */
const rentText = (s: Spot) =>
  !s.rentMax ? "" : s.rentMin === s.rentMax ? `฿${baht(s.rentMax)}` : `฿${baht(s.rentMin)}–${baht(s.rentMax)}`;

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** lucide `building-2` เป็นสตริง — ไอคอนใน divIcon ต้องเป็น HTML ล้วน */
const PIN_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 12h4"/><path d="M10 8h4"/><path d="M14 21v-3a2 2 0 0 0-4 0v3"/><path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2"/><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/></svg>';

/** ซูมไกลกว่านี้เป็นจุดไอคอนล้วนทุกหมุด */
const COMPACT_BELOW = 8;

/** กว้างโดยประมาณของป้ายเต็ม (px) — ใช้หาป้ายที่ทับกัน ไม่ต้องวัด DOM */
const labelWidth = (s: Spot) => 44 + Math.min(s.short.length, 16) * 6.6 + rentText(s).length * 6.4;

/**
 * เลือกหมุดที่ได้ป้ายเต็ม: ไล่จากที่เลือกอยู่ → ค่าห้องรวมมากสุด (ห้องมากก่อน) ใครทับป้ายที่วางไปแล้วเหลือแค่จุดไอคอน
 * (ซูมเข้าแล้วป้ายจะค่อย ๆ โผล่ครบเอง)
 */
function fullLabels(map: Leaflet.Map, spots: Spot[], selected: string | null): Set<string> {
  const out = new Set<string>();
  if (map.getZoom() < COMPACT_BELOW) {
    if (selected) out.add(selected);
    return out;
  }
  const placed: [number, number, number, number][] = [];
  const order = [...spots].sort(
    (a, b) => Number(b.apartment.id === selected) - Number(a.apartment.id === selected) || b.live - a.live,
  );
  for (const s of order) {
    const p = map.latLngToContainerPoint([s.apartment.lat!, s.apartment.lng!]);
    const box: [number, number, number, number] = [p.x - 18, p.y - 38, p.x - 18 + labelWidth(s), p.y + 2];
    const hit = placed.some((q) => box[0] < q[2] && box[2] > q[0] && box[1] < q[3] && box[3] > q[1]);
    if (!hit || s.apartment.id === selected) {
      out.add(s.apartment.id);
      placed.push(box);
    }
  }
  return out;
}

function pinHtml(s: Spot, on: boolean, compact: boolean) {
  const cls = `apt-pin${on ? " is-on" : ""}${compact ? " is-compact" : ""}${s.vacant ? " is-free" : ""}`;
  return `<span class="${cls}"><span class="apt-pin-ic">${PIN_ICON}</span>${
    compact
      ? ""
      : `<span class="apt-pin-tx"><b>${esc(s.short)}</b>${rentText(s) ? `<i>${esc(rentText(s))}</i>` : ""}</span>`
  }</span>`;
}

export function ApartmentMap({ board, onOpen }: { board: RentalBoard; onOpen: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const markers = useRef(new Map<string, Leaflet.Marker>());
  const [L, setL] = useState<typeof Leaflet | null>(null);
  const [zoom, setZoom] = useState(6);
  const [selected, setSelected] = useState<string | null>(null);
  const [missingOpen, setMissingOpen] = useState(false);

  const { spots, missing } = useMemo(() => {
    const all: Spot[] = board.apartments.map((apartment) => {
      const rooms = board.rooms.filter((r) => r.apartment.id === apartment.id);
      const live = rooms.filter((r) => r.state !== "cancelled");
      const rents = live.map((r) => r.room.rent).filter((v) => v > 0);
      return {
        apartment,
        short: shortName(apartment.name),
        rooms,
        live: live.length,
        occupied: live.filter((r) => r.occupants.length).length,
        vacant: live.filter((r) => r.state === "vacant").length,
        rentMin: rents.length ? Math.min(...rents) : 0,
        rentMax: rents.length ? Math.max(...rents) : 0,
      };
    });
    return {
      spots: all.filter((s) => s.apartment.lat != null && s.apartment.lng != null),
      missing: all.filter((s) => s.apartment.lat == null || s.apartment.lng == null),
    };
  }, [board.apartments, board.rooms]);

  /* สร้างแผนที่ครั้งเดียว — Leaflet แตะ `window` ตอน import จึงโหลดฝั่งเบราว์เซอร์เท่านั้น */
  useEffect(() => {
    let cancelled = false;
    const pins = markers.current;
    import("leaflet").then((mod) => {
      const lib = (mod as unknown as { default?: typeof Leaflet }).default ?? mod;
      if (cancelled || !box.current || mapRef.current) return;
      const map = lib.map(box.current, { zoomControl: false, attributionControl: true }).setView([13.75, 100.6], 6);
      lib
        .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        })
        .addTo(map);
      lib.control.zoom({ position: "bottomright" }).addTo(map);
      map.attributionControl.setPrefix(false);
      map.on("zoomend", () => setZoom(map.getZoom()));
      map.on("click", () => setSelected(null));
      mapRef.current = map;
      setL(lib);
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      pins.clear();
    };
  }, []);

  /* หมุด — สร้าง/ลบตามข้อมูล แล้วซูมให้เห็นครบตอนเปิดครั้งแรก */
  const fitted = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!L || !map) return;
    const keep = new Set(spots.map((s) => s.apartment.id));
    for (const [id, m] of markers.current) {
      if (!keep.has(id)) {
        m.remove();
        markers.current.delete(id);
      }
    }
    for (const s of spots) {
      const at: Leaflet.LatLngExpression = [s.apartment.lat!, s.apartment.lng!];
      let m = markers.current.get(s.apartment.id);
      if (!m) {
        m = L.marker(at, { icon: L.divIcon({ className: "apt-pin-wrap", html: "" }), keyboard: true, title: s.apartment.name, riseOnHover: true })
          .on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            setSelected(s.apartment.id);
          })
          .addTo(map);
        markers.current.set(s.apartment.id, m);
      } else m.setLatLng(at);
    }
    if (!fitted.current && spots.length) {
      fitted.current = true;
      map.fitBounds(L.latLngBounds(spots.map((s) => [s.apartment.lat!, s.apartment.lng!])), {
        padding: [48, 48],
        maxZoom: 13,
      });
    }
  }, [L, spots]);

  /* หน้าตาหมุดตามซูม + หมุดที่เลือก */
  useEffect(() => {
    const map = mapRef.current;
    if (!L || !map) return;
    const full = fullLabels(map, spots, selected);
    for (const s of spots) {
      const m = markers.current.get(s.apartment.id);
      if (!m) continue;
      const on = s.apartment.id === selected;
      const compact = !full.has(s.apartment.id);
      m.setIcon(
        L.divIcon({
          html: pinHtml(s, on, compact),
          className: "apt-pin-wrap",
          iconSize: undefined,
          iconAnchor: compact ? [13, 13] : [16, 34],
        }),
      );
      m.setZIndexOffset(on ? 1000 : 0);
    }
  }, [L, spots, zoom, selected]);

  /* เลือกแล้วเลื่อนให้หมุดไม่ไปอยู่ใต้การ์ด (การ์ดกว้าง ~22rem ฝั่งซ้าย) */
  useEffect(() => {
    const map = mapRef.current;
    const s = spots.find((x) => x.apartment.id === selected);
    if (!map || !s) return;
    const wide = (box.current?.clientWidth ?? 0) >= 640;
    map.panInside([s.apartment.lat!, s.apartment.lng!], {
      paddingTopLeft: wide ? [384, 48] : [32, 32],
      paddingBottomRight: wide ? [48, 48] : [32, 320],
    });
  }, [selected, spots]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelected(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected]);

  const current = spots.find((s) => s.apartment.id === selected);

  return (
    <div className="relative isolate h-[calc(100dvh-14rem)] min-h-[460px] overflow-hidden border-t border-line">
      <div ref={box} className="rental-map absolute inset-0 bg-base-200" aria-label="แผนที่ที่พัก" />

      {/* ป้ายนับมุมขวาบน */}
      <div className="pointer-events-none absolute top-3 right-3 z-[1000] rounded-full bg-base-100/92 px-3 py-1.5 text-11-5 text-mut shadow-[0_4px_14px_-6px_rgba(21,32,29,0.3)] ring-1 ring-line backdrop-blur">
        ปักหมุดแล้ว <b className="font-semibold text-ink tabular-nums">{spots.length}</b> /{" "}
        {board.apartments.length} ที่พัก
      </div>

      {/* คำอธิบายสีหมุด */}
      <div className="pointer-events-none absolute top-12 right-3 z-[1000] flex items-center gap-3 rounded-full bg-base-100/92 px-3 py-1.5 text-11-5 text-mut shadow-[0_4px_14px_-6px_rgba(21,32,29,0.3)] ring-1 ring-line backdrop-blur">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full bg-[#7c3aed]" /> มีห้องว่าง
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full bg-primary" /> เต็ม
        </span>
      </div>

      {/* ที่พักที่ยังไม่มีพิกัด */}
      {missing.length ? (
        <div className="absolute bottom-3 left-3 z-[1000] flex max-w-[calc(100%-5rem)] flex-col items-start gap-2">
          {missingOpen ? (
            <div className="max-h-64 w-72 overflow-auto rounded-[8px] bg-base-100 p-1 shadow-[0_18px_44px_-18px_rgba(21,32,29,0.45)] ring-1 ring-line">
              <p className="px-2.5 pt-2 pb-1 text-11-5 text-mut">กดเพื่อเปิด แล้ววางลิงก์ Google Maps</p>
              {missing.map((s) => (
                <button
                  key={s.apartment.id}
                  type="button"
                  onClick={() => onOpen(s.apartment.id)}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-[5px] px-2.5 py-1.5 text-left text-12-5 hover:bg-soft"
                >
                  <span className="min-w-0 truncate">{s.short}</span>
                  <span className="flex-none text-11-5 text-mut tabular-nums">{s.live} ห้อง</span>
                </button>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setMissingOpen((v) => !v)}
            aria-expanded={missingOpen}
            className="flex cursor-pointer items-center gap-1.5 rounded-full bg-base-100/95 px-3 py-1.5 text-12 text-mut shadow-[0_4px_14px_-6px_rgba(21,32,29,0.3)] ring-1 ring-line backdrop-blur hover:text-ink"
          >
            <MapPinOff size={13} aria-hidden /> ยังไม่มีพิกัด {missing.length} แห่ง
          </button>
        </div>
      ) : null}

      {current ? <SpotCard s={current} onClose={() => setSelected(null)} onOpen={() => onOpen(current.apartment.id)} /> : null}
    </div>
  );
}

function SpotCard({ s, onClose, onOpen }: { s: Spot; onClose: () => void; onOpen: () => void }) {
  const a = s.apartment;
  const nav = a.mapUrl || `https://www.openstreetmap.org/?mlat=${a.lat}&mlon=${a.lng}#map=17/${a.lat}/${a.lng}`;
  const shown = s.rooms.slice(0, 6);
  return (
    <section
      aria-label={a.name}
      className="absolute z-[1000] flex flex-col overflow-hidden bg-base-100 text-ink shadow-[0_24px_60px_-24px_rgba(21,32,29,0.5)] ring-1 ring-line max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[62%] max-sm:rounded-t-[16px] sm:top-3 sm:bottom-3 sm:left-3 sm:w-[22rem] sm:rounded-[10px] animate-pop-in"
    >
      <header className="flex items-start gap-3 border-b border-line px-4 pt-4 pb-3">
        <span className="mt-0.5 grid size-9 flex-none place-items-center rounded-[8px] bg-primary/12 text-primary">
          <Building2 size={18} strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-11 font-medium tracking-wide text-mut">ที่พัก</p>
          <h3 className="text-15 leading-snug font-semibold text-balance">{a.name}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิด"
          className="btn-ghost -mt-1 -mr-1 grid size-8 flex-none place-items-center rounded-full text-mut"
        >
          <X size={16} aria-hidden />
        </button>
      </header>

      <div className="grid grid-cols-3 border-b border-line text-center">
        <Fig label="ห้อง" value={s.live.toLocaleString("th-TH")} />
        <Fig label="ห้องว่าง" value={s.vacant.toLocaleString("th-TH")} tone={s.vacant ? "text-[#7c3aed]" : ""} />
        <Fig label="ค่าห้อง / ห้อง" value={rentText(s) || "—"} strong />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <dl className="flex flex-col gap-2.5 px-4 py-3 text-12-5">
          <Row icon={User} label="เจ้าของ">
            {a.owner || "—"}
            {a.phone ? (
              <a href={`tel:${a.phone.replace(/[^\d+]/g, "")}`} className="ml-2 inline-flex items-center gap-1 font-mono text-12 text-primary hover:underline">
                <Phone size={11} aria-hidden /> {a.phone}
              </a>
            ) : null}
          </Row>
          <Row icon={Landmark} label="บัญชี">
            {a.bankAccountNo ? (
              <>
                <span className="font-mono">{a.bankAccountNo}</span>
                <span className="block text-11-5 text-mut">{[a.bankName, a.bankAccountName].filter(Boolean).join(" · ")}</span>
              </>
            ) : (
              "—"
            )}
          </Row>
          <Row icon={ScrollText} label="สัญญา">
            {a.minContract || "—"}
            <span className="block text-11-5 text-mut">{BILL_SOURCE_LABEL[a.billSource]}</span>
          </Row>
        </dl>

        {shown.length ? (
          <div className="border-t border-line px-4 py-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-11-5 font-medium text-mut">
              <BedDouble size={13} aria-hidden /> ห้องในเดือนนี้
            </p>
            <ul className="flex flex-col">
              {shown.map((r) => (
                <li key={r.room.id} className="flex items-center gap-2 py-1 text-12-5">
                  <span className="w-14 font-medium">{r.room.roomNo}</span>
                  <span className="min-w-0 flex-1 truncate text-mut">
                    {r.occupants.length ? r.occupants.map(occupantName).join(", ") : "—"}
                  </span>
                  <span className="text-12 tabular-nums">{r.room.rent ? baht(r.room.rent) : "—"}</span>
                  <span className={`chip px-1.5 py-0 text-10-5 ${STATE_CHIP[r.state]}`}>{ROOM_STATE_LABEL[r.state]}</span>
                </li>
              ))}
            </ul>
            {s.rooms.length > shown.length ? (
              <p className="pt-1 text-11-5 text-mut">และอีก {s.rooms.length - shown.length} ห้อง</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <footer className="flex gap-2 border-t border-line px-4 py-3">
        <button type="button" onClick={onOpen} className="btn-pri flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-12-5">
          <ExternalLink size={14} aria-hidden /> เปิดรายละเอียด
        </button>
        <a
          href={nav}
          target="_blank"
          rel="noreferrer"
          className="btn-sec flex items-center justify-center gap-1.5 px-3 py-2 text-12-5"
        >
          <Navigation size={14} aria-hidden /> นำทาง
        </a>
      </footer>
    </section>
  );
}

function Fig({ label, value, strong, tone = "" }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-2 py-2.5 not-last:border-r not-last:border-line">
      <span className="text-10-5 text-mut">{label}</span>
      <span className={`font-semibold whitespace-nowrap tabular-nums ${value.length > 8 ? "text-12-5" : "text-14"} ${strong ? "text-primary" : tone}`}>{value}</span>
    </div>
  );
}

function Row({ icon: Icon, label, children }: { icon: typeof User; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="flex w-16 flex-none items-start gap-1.5 pt-px text-mut">
        <Icon size={13} aria-hidden className="mt-0.5 flex-none" /> {label}
      </dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}
