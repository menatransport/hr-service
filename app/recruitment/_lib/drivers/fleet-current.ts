/**
 * รถที่หยุดวิ่งอยู่ตอนนี้ตาม ATMS — **ฝั่งเซิร์ฟเวอร์เท่านั้น · อ่านอย่างเดียว**
 *
 * วิธีเดียวกับหน้า “รถค้างซ่อม” ของ dashboard-op3 (`/inspection/bymaintenance`) และ mena-wms
 * (`lib/atms-board.ts`): `GET fleet/current?status_id=2&status_id=4&status_id=5` = รถซ่อม (B/BA) ·
 * รถจอดอุบัติเหตุ (อ) · PM — สถานะสดของ ATMS ไม่ผ่าน ETL
 *
 * ใช้ host `fastapinextjs` แทน `MAIN_API_URL` เพราะ `main-api-mena/fleet/current` ตอบ 503
 * (“ไม่สามารถอ่าน fleet_events ได้” — ตรวจ 15 ต.ค. 2026) · เส้นนี้ไม่ต้องใช้ token
 */

const DEFAULT_FLEET_API_URL = "https://fastapinextjs-548129382487.asia-southeast3.run.app";
const STOPPED_STATUS_IDS = [2, 4, 5];
const TIMEOUT_MS = 10_000;

export interface FleetStop {
  /** สถานะหลัก เช่น “รถซ่อม” “รถจอดอุบัติเหตุ” */
  label: string;
  /** วันที่ค้างสถานะนี้ (ATMS คิดให้) · `null` = ไม่มีข้อมูล */
  days: number | null;
}

interface FleetTruck {
  truckplate?: string | null;
  trucknum?: string | null;
  duration_days?: number | null;
}
interface FleetCurrent {
  data?: {
    status_name?: string;
    branches?: { customers?: { vehicle_types?: { owner_types?: { trucks?: FleetTruck[] }[] }[] }[] }[];
  }[];
}

function baseUrl(): string {
  return (process.env.ATMS_FLEET_API_URL || DEFAULT_FLEET_API_URL).replace(/\/+$/, "");
}

/**
 * ทะเบียน **และ** เลขรถ → สถานะหยุดวิ่ง (คันที่วิ่งอยู่ไม่อยู่ในผลลัพธ์)
 * อ่านไม่ได้ → `null` ให้หน้าเลือกทางสำรองเอง ไม่ล้มทั้งหน้า
 */
export async function getFleetStops(): Promise<Map<string, FleetStop> | null> {
  const qs = STOPPED_STATUS_IDS.map((id) => `status_id=${id}`).join("&");
  try {
    const res = await fetch(`${baseUrl()}/fleet/current?${qs}&minimal=true`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as FleetCurrent;

    const out = new Map<string, FleetStop>();
    for (const status of body.data ?? [])
      for (const b of status.branches ?? [])
        for (const c of b.customers ?? [])
          for (const vt of c.vehicle_types ?? [])
            for (const o of vt.owner_types ?? [])
              for (const t of o.trucks ?? []) {
                const stop = { label: status.status_name?.trim() || "รถซ่อม", days: t.duration_days ?? null };
                for (const key of [t.truckplate, t.trucknum]) if (key?.trim()) out.set(key.trim(), stop);
              }
    return out;
  } catch {
    return null;
  }
}
