import { createHash, randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";

import { hrCol } from "@/lib/db";
import { NcacError, getUser } from "@/lib/ncac/client";
import { isInactive, toSessionUser } from "./user";
import type { SessionUser } from "./token";

/**
 * API key ส่วนตัว — เรียก `/api/**` ด้วย header `x-api-key` แทนคุกกี้ session
 *
 * - key **ผูกกับคนสร้าง** — `proxy.ts` เปลี่ยน key เป็น session อายุสั้นของคนนั้น route ทุกเส้นจึงเห็นผู้ใช้
 *   คนเดียวกับตอนล็อกอิน (ชื่อ สิทธิ์ ลงประวัติการแก้) โดยไม่ต้องแก้ route สักเส้น
 * - ฐานเก็บแค่ SHA-256 ของ key — key เต็มโชว์ครั้งเดียวตอนสร้าง หายแล้วต้องสร้างใหม่
 * - `scope: "read"` = GET อย่างเดียว (ค่าเริ่มต้น) · `"write"` = ทุกเมธอด
 * - หมดอายุ `API_KEY_TTL_DAYS` วัน · ยกเลิกเองได้ · เจ้าของเป็น Inactive / ไม่พบใน NCAC = ยกเลิกให้อัตโนมัติ
 *
 * ฝั่งเซิร์ฟเวอร์เท่านั้น (`node:crypto` + MongoDB) — `proxy.ts` ของ Next 16 รันบน Node จึงเรียกได้
 */

export const API_KEY_HEADER = "x-api-key";
export const API_KEY_TTL_DAYS = 90;
/** key ที่ยังใช้ได้ต่อคน — กันกดสร้างทิ้งไว้เรื่อย ๆ */
export const API_KEY_MAX_ACTIVE = 5;

const PREFIX = "hrs_";
const LABEL_MAX = 60;
/** อ่านผู้ใช้จาก NCAC ใหม่ทุกเท่านี้ — ไม่ใช่ทุกคำขอ (Render ตื่นช้า) */
const RECHECK_MS = 6 * 60 * 60 * 1000;
/** จำผลตรวจ key ในหน่วยความจำ — ยิงถี่ ๆ ไม่ต้องอ่านฐานทุกครั้ง · ยกเลิก key แล้วมีผลภายในเวลานี้ */
const CACHE_MS = 60 * 1000;
/** บันทึก `lastUsedAt` ห่างกันอย่างน้อยเท่านี้ */
const TOUCH_MS = 5 * 60 * 1000;

export type ApiKeyScope = "read" | "write";

export class ApiKeyError extends Error {}

interface ApiKeyDoc {
  _id: ObjectId;
  employeeId: string;
  /** ผู้ใช้ตอนสร้าง/ตรวจล่าสุด — ใช้ทำ session ของ key */
  user: SessionUser;
  label: string;
  scope: ApiKeyScope;
  hash: string;
  /** ต้น key ไว้ให้จำได้ว่าอันไหน (`hrs_ab12…`) */
  hint: string;
  createdAt: Date;
  expiresAt: Date;
  lastUsedAt: Date | null;
  userCheckedAt: Date;
  revokedAt: Date | null;
  revokedReason?: string;
}

/** รูปที่ส่งให้หน้าจอ — ไม่มี hash */
export interface ApiKeyInfo {
  id: string;
  label: string;
  scope: ApiKeyScope;
  hint: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  active: boolean;
}

const sha256 = (raw: string) => createHash("sha256").update(raw).digest("hex");
const keys = () => hrCol<ApiKeyDoc>("apiKeys");

function toInfo(doc: ApiKeyDoc, now = Date.now()): ApiKeyInfo {
  return {
    id: doc._id.toHexString(),
    label: doc.label,
    scope: doc.scope,
    hint: doc.hint,
    createdAt: doc.createdAt.toISOString(),
    expiresAt: doc.expiresAt.toISOString(),
    lastUsedAt: doc.lastUsedAt?.toISOString() ?? null,
    revokedAt: doc.revokedAt?.toISOString() ?? null,
    active: !doc.revokedAt && doc.expiresAt.getTime() > now,
  };
}

/** key ของฉัน — ใหม่สุดก่อน รวมที่ยกเลิก/หมดอายุแล้ว 90 วันล่าสุด */
export async function listApiKeys(employeeId: string): Promise<ApiKeyInfo[]> {
  const since = new Date(Date.now() - API_KEY_TTL_DAYS * 86_400_000);
  const docs = await (await keys())
    .find({ employeeId, $or: [{ revokedAt: null }, { revokedAt: { $gte: since } }] })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();
  return docs.map((d) => toInfo(d));
}

/** สร้าง key — คืน key เต็ม **ครั้งเดียว** */
export async function createApiKey(
  user: SessionUser,
  input: { label?: unknown; scope?: unknown },
): Promise<{ key: string; info: ApiKeyInfo }> {
  const label = typeof input.label === "string" ? input.label.trim().slice(0, LABEL_MAX) : "";
  if (!label) throw new ApiKeyError("ตั้งชื่อ key ก่อน เช่น “ระบบรายงาน HR”");
  const scope: ApiKeyScope = input.scope === "write" ? "write" : "read";

  const col = await keys();
  const now = new Date();
  const active = await col.countDocuments({ employeeId: user.employeeId, revokedAt: null, expiresAt: { $gt: now } });
  if (active >= API_KEY_MAX_ACTIVE) {
    throw new ApiKeyError(`มี key ที่ใช้งานอยู่ครบ ${API_KEY_MAX_ACTIVE} อันแล้ว — ยกเลิกอันที่ไม่ใช้ก่อน`);
  }

  const key = PREFIX + randomBytes(32).toString("base64url");
  const doc: ApiKeyDoc = {
    _id: new ObjectId(),
    employeeId: user.employeeId,
    user,
    label,
    scope,
    hash: sha256(key),
    hint: `${key.slice(0, PREFIX.length + 6)}…`,
    createdAt: now,
    expiresAt: new Date(now.getTime() + API_KEY_TTL_DAYS * 86_400_000),
    lastUsedAt: null,
    userCheckedAt: now,
    revokedAt: null,
  };
  await col.insertOne(doc);
  return { key, info: toInfo(doc) };
}

/** ยกเลิก key ของตัวเอง — คืน `false` ถ้าไม่พบ (หรือเป็นของคนอื่น) */
export async function revokeApiKey(employeeId: string, id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const res = await (await keys()).updateOne(
    { _id: new ObjectId(id), employeeId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: "owner" } },
  );
  cache.clear();
  return res.matchedCount > 0;
}

/* ---------------------------------------------------------------- ตรวจ key */

export interface ResolvedApiKey {
  user: SessionUser;
  scope: ApiKeyScope;
}

const cache = new Map<string, { at: number; value: ResolvedApiKey | null }>();

/**
 * key → ผู้ใช้ — `null` = ใช้ไม่ได้ (ผิด ยกเลิก หมดอายุ เจ้าของ Inactive)
 *
 * NCAC ล่ม/ช้าตอนตรวจซ้ำ = ใช้ข้อมูลผู้ใช้เดิมไปก่อน (กติกาเดียวกับ `refreshSession` ใน `proxy.ts`)
 */
export async function resolveApiKey(raw: string): Promise<ResolvedApiKey | null> {
  const key = raw.trim();
  if (!key.startsWith(PREFIX) || key.length > 100) return null;

  const hash = sha256(key);
  const hit = cache.get(hash);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const value = await lookup(hash);
  if (cache.size > 500) cache.clear();
  cache.set(hash, { at: Date.now(), value });
  return value;
}

async function lookup(hash: string): Promise<ResolvedApiKey | null> {
  const col = await keys();
  const doc = await col.findOne({ hash });
  const now = Date.now();
  if (!doc || doc.revokedAt || doc.expiresAt.getTime() <= now) return null;

  let user = doc.user;
  const set: Partial<ApiKeyDoc> = {};

  if (now - doc.userCheckedAt.getTime() > RECHECK_MS) {
    try {
      const fresh = await getUser(doc.employeeId, { signal: AbortSignal.timeout(4_000) });
      if (isInactive(fresh)) {
        await col.updateOne({ _id: doc._id }, { $set: { revokedAt: new Date(), revokedReason: "inactive" } });
        return null;
      }
      const next = toSessionUser(fresh);
      if (next.employeeId) user = next;
      Object.assign(set, { user, userCheckedAt: new Date() });
    } catch (err) {
      if (err instanceof NcacError && err.status === 404) {
        await col.updateOne({ _id: doc._id }, { $set: { revokedAt: new Date(), revokedReason: "not-found" } });
        return null;
      }
    }
  }

  if (!doc.lastUsedAt || now - doc.lastUsedAt.getTime() > TOUCH_MS) set.lastUsedAt = new Date();
  if (Object.keys(set).length) void col.updateOne({ _id: doc._id }, { $set: set }).catch(() => {});

  return { user, scope: doc.scope };
}
