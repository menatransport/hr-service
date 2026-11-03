import "server-only";

/**
 * พิกัดของที่พักจาก “ลิงก์แผนที่” ที่ HR วางไว้ — ไม่มีช่องกรอกพิกัดแยก ให้ระบบแกะเอง
 *
 * - ลิงก์เต็ม Google Maps: หมุดจริงอยู่ใน `!3d<lat>!4d<lng>` (แม่นกว่า `@lat,lng` ซึ่งเป็นกึ่งกลางจอ)
 * - ลิงก์สั้น `maps.app.goo.gl/…`: ขอแบบไม่ตาม redirect แล้วอ่าน `Location` ซึ่งเป็นลิงก์เต็ม
 * - พิมพ์พิกัดตรง ๆ `13.74, 100.63` ก็รับ
 * แกะไม่ได้ = `null` เงียบ ๆ — ที่พักยังบันทึกได้ แค่ไม่ขึ้นหมุดบนแผนที่
 */

export interface LatLng {
  lat: number;
  lng: number;
}

const valid = (lat: number, lng: number): LatLng | null =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat || lng)
    ? { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 }
    : null;

export function parseLatLng(text: string): LatLng | null {
  const s = decodeURIComponent(text);
  const pin = s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (pin) return valid(Number(pin[1]), Number(pin[2]));
  const q = s.match(/[?&](?:q|query|ll|destination)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (q) return valid(Number(q[1]), Number(q[2]));
  const at = s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (at) return valid(Number(at[1]), Number(at[2]));
  const raw = s.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (raw) return valid(Number(raw[1]), Number(raw[2]));
  return null;
}

/**
 * ค้นตำแหน่งจากข้อความที่อยู่ด้วย OpenStreetMap Nominatim (ใช้ตอนบันทึกเท่านั้น ปริมาณน้อยมาก)
 * ไม่เจอทั้งก้อนจะตัดคำหน้าทิ้งทีละคำ (มักเป็นชื่อหอที่ OSM ไม่รู้จัก) ไม่เกิน 3 รอบ
 */
async function geocode(text: string): Promise<LatLng | null> {
  let words = text.replace(/\+/g, " ").split(/\s+/).filter(Boolean);
  for (let round = 0; round < 3 && words.length > 2; round++, words = words.slice(1)) {
    try {
      const q = new URLSearchParams({ format: "json", limit: "1", countrycodes: "th", q: words.join(" ") });
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${q}`, {
        headers: { "User-Agent": "MenaHR-Service/1.0 (rentals map)", "Accept-Language": "th" },
        signal: AbortSignal.timeout(6000),
      });
      const [hit] = (await res.json()) as { lat: string; lon: string }[];
      if (hit) return valid(Number(hit.lat), Number(hit.lon));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * ตามลิงก์สั้นได้ไม่เกิน 3 ทอด · 5 วินาทีต่อทอด
 * ลิงก์ที่ปลายทางมีแต่ชื่อสถานที่ไม่มีพิกัด (`/maps/place/<ที่อยู่>/data=!4m2…`) → ค้นจากที่อยู่นั้นแทน
 * ไม่มีลิงก์เลยแต่มีที่อยู่ → ค้นจากที่อยู่
 */
export async function resolveLatLng(mapUrl: string, address = ""): Promise<LatLng | null> {
  let url = mapUrl.trim();
  if (!url) return address.trim() ? geocode(address) : null;
  for (let hop = 0; hop < 4; hop++) {
    const found = parseLatLng(url);
    if (found) return found;
    const place = url.match(/\/maps\/place\/([^/?]+)/);
    if (place) return geocode(decodeURIComponent(place[1]));
    if (hop === 3 || !/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl|g\.co)\//i.test(url)) break;
    try {
      const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5000) });
      const next = res.headers.get("location");
      if (!next) break;
      url = new URL(next, url).toString();
    } catch {
      break;
    }
  }
  return address.trim() ? geocode(address) : null;
}
