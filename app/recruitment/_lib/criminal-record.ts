import "server-only";

import {
  CRIMINAL_DEPARTMENTS,
  type CriminalRecordResult,
} from "@/app/recruitment/_lib/criminal-record-types";

/**
 * ผลตรวจประวัติอาชญากรรม — อ่านจาก Google Apps Script ของชีต “สรุปรายชื่อตรวจประวัติ”
 * (Bew 9 พ.ย. 2569) · ค้นได้ทีละคนด้วย `department` (คอลัมน์ C) + `name` (คอลัมน์ D) แบบตรงตัว
 *
 * - **URL ฝังในโค้ดโดยตั้งใจ ไม่ใช้ env** (ตามคำสั่งเจ้าของงาน) — เปลี่ยนสคริปต์ = แก้ค่าข้างล่างที่เดียว
 * - ชีตแยกฝ่ายเป็นชื่อสาขา (`จัดส่ง ศลบ` / `จัดส่ง สสบ` / `TDM`) — ลองฝ่ายของสาขาคนนั้นก่อน
 *   ไม่เจอค่อยไล่ฝ่ายที่เหลือ เจอที่ไหนหยุดที่นั่น
 * - แคชในหน่วยความจำ + จำกัดยิงพร้อมกัน — Apps Script ตอบหน้า HTML (ไม่ใช่ JSON) เมื่อโดนยิงถี่
 */
const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyveVC9T8T-7PSoVFR-HtMvrVftz4sD1IpgNBmnd5R24dT2eL4dTODM9rS6jsmLAMdNXg/exec";

/** ฝ่ายในชีตของแต่ละสาขา — สาขาที่ไม่อยู่ในนี้ไล่ทุกฝ่ายตามลำดับ `CRIMINAL_DEPARTMENTS` */
const DEPARTMENT_OF_SITE: Record<string, string> = {
  ลาดกระบัง: "จัดส่ง ศลบ",
  สระบุรี: "จัดส่ง สสบ",
};

const FOUND_TTL = 30 * 60_000;
const MISS_TTL = 5 * 60_000;
const MAX_PARALLEL = 4;
const TIMEOUT_MS = 20_000;

const TITLE = /^(นาย|นางสาว|นาง|น\.ส\.|ว่าที่\s*ร\.ต\.)\s*/;

/** ชื่อแบบที่ชีตใช้ — ตัดอักขระล่องหน (เคยเจอ ZWSP ในทะเบียน) · ช่องว่างเหลือช่องเดียว · ไม่มีคำนำหน้า */
export function sheetName(raw: string): string {
  return raw
    .replace(/[​-‍﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(TITLE, "")
    .trim();
}

type Cached = { at: number; value: CriminalRecordResult };
const cache = new Map<string, Cached>();
const inflight = new Map<string, Promise<CriminalRecordResult>>();

let running = 0;
const waiting: (() => void)[] = [];

async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    return await work();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

type ScriptRow = { department?: string; name?: string; background_check?: string; case_detail?: string };
type ScriptReply = { success?: boolean; found?: boolean; message?: string; data?: ScriptRow[] };

async function ask(department: string, name: string): Promise<ScriptRow[]> {
  const url = new URL(SCRIPT_URL);
  url.searchParams.set("department", department);
  url.searchParams.set("name", name);

  const res = await slot(() => fetch(url, { cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) }));
  const text = await res.text();
  let reply: ScriptReply;
  try {
    reply = JSON.parse(text) as ScriptReply;
  } catch {
    throw new Error("ชีตตรวจประวัติตอบไม่ใช่ข้อมูล (อาจถูกเรียกถี่เกินไป) — ลองใหม่อีกครั้ง");
  }
  if (!reply.success) throw new Error(reply.message || "ชีตตรวจประวัติตอบว่าไม่สำเร็จ");
  return reply.data ?? [];
}

async function lookup(name: string, site: string): Promise<CriminalRecordResult> {
  const first = DEPARTMENT_OF_SITE[site];
  const order = first ? [first, ...CRIMINAL_DEPARTMENTS.filter((d) => d !== first)] : [...CRIMINAL_DEPARTMENTS];

  for (const department of order) {
    const rows = await ask(department, name);
    if (rows.length) {
      return {
        found: true,
        name,
        records: rows.map((r) => ({
          department: (r.department ?? department).trim(),
          result: (r.background_check ?? "").trim(),
          detail: (r.case_detail ?? "").trim(),
        })),
      };
    }
  }
  return { found: false, name, records: [] };
}

/** ผลตรวจของคนหนึ่งคน — `site` = ชื่อสาขา (ลาดกระบัง/สระบุรี/…) ใช้เลือกฝ่ายที่ลองก่อน · ว่างได้ */
export async function getCriminalRecord(rawName: string, site = ""): Promise<CriminalRecordResult> {
  const name = sheetName(rawName);
  if (!name) return { found: false, name, records: [] };

  const key = `${site.trim()}|${name}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < (hit.value.found ? FOUND_TTL : MISS_TTL)) return hit.value;

  const pending = inflight.get(key);
  if (pending) return pending;

  const job = lookup(name, site.trim())
    .then((value) => {
      cache.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}
