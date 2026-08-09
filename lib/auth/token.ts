/**
 * คุกกี้ session ของระบบ — เข้ารหัส/ตรวจลายเซ็นด้วย Web Crypto ล้วน
 *
 * **ไฟล์นี้ต้องรันได้ทั้งบน Node และ Edge** (`middleware.ts` อยู่บน Edge)
 * จึงห้าม import `next/headers`, `node:crypto` หรืออะไรที่ผูกกับ Node
 * ตัวช่วยที่ต้องใช้ `cookies()` อยู่ที่ `lib/auth/session.ts` แทน
 *
 * รูปแบบ: `<payload base64url>.<hmac-sha256 base64url>` — ไม่ใช่การเข้ารหัสลับ
 * (ผู้ใช้เปิดอ่านเนื้อในได้) แต่ **แก้ไม่ได้** เพราะลายเซ็นจะไม่ตรง จึงพอสำหรับ
 * ข้อมูลที่เก็บอยู่: ชื่อ/รหัสพนักงาน/รูป ซึ่งเป็นข้อมูลที่ผู้ใช้เห็นบนจอตัวเองอยู่แล้ว
 */

export const SESSION_COOKIE = "hrs.session";
export const STATE_COOKIE = "hrs.oauth_state";
/** ปลายทางที่ผู้ใช้ตั้งใจจะไปก่อนโดนเด้งมาล็อกอิน — ฝากไว้ระหว่างวิ่งไป Google */
export const NEXT_COOKIE = "hrs.oauth_next";

/**
 * ปลายทางหลังล็อกอินที่ยอมรับ — **ต้องเป็นเส้นทางภายในของ desk เท่านั้น**
 * (`//evil.com` เป็น path ที่ถูกต้องตามไวยากรณ์แต่พาออกนอกเว็บ จึงต้องกันด้วย)
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/desk") || value.startsWith("//")) return null;
  return value;
}

/** อายุ session — 1 วันทำงาน หมดแล้วเด้งกลับหน้าล็อกอิน */
export const SESSION_MAX_AGE_SEC = 8 * 60 * 60;

/** ผู้ใช้ที่ล็อกอินอยู่ — ชุดย่อของ `user` ที่ `POST /auth/login/google` ตอบกลับมา */
export interface SessionUser {
  employeeId: string;
  username: string;
  /** ชื่อ–สกุลรวมกันแล้ว (`firstname lastname`) */
  name: string;
  firstName: string;
  position: string;
  /** ชื่อหน่วยงานภาษาอังกฤษจาก NCAC (`department_name_en`) */
  department: string;
  /** `department_id` ของ NCAC — **ยังไม่การันตีว่าตรงกับ `DepartmentId` ฝั่งคำร้อง** */
  departmentId: number | null;
  positionLevel: string | null;
  site: string;
  /** `image_url` — ส่วนใหญ่คือรูปบัญชี Google ที่ NCAC บันทึกไว้ตอนล็อกอินครั้งแรก */
  imageUrl: string | null;
}

export interface SessionPayload {
  user: SessionUser;
  /**
   * JWT ของ NCAC (HS256 อายุ 30 นาที) — ยังไม่มี endpoint ไหนบังคับ `Authorization`
   * เก็บไว้เพื่อให้วันที่ backend เปิดใช้จริง ไม่ต้องให้ผู้ใช้ล็อกอินใหม่ทั้งระบบ
   */
  token: string;
  /** เวลาหมดอายุของ session ฝั่งเรา (epoch ms) */
  exp: number;
}

/**
 * กุญแจลงลายเซ็น — ใช้ `AUTH_SECRET` ก่อน ถ้าไม่ได้ตั้งจะตกไปใช้
 * `GOOGLE_CLIENT_SECRET` ซึ่งเป็นค่าลับฝั่งเซิร์ฟเวอร์ที่ flow นี้ต้องมีอยู่แล้ว
 * (ตั้ง `AUTH_SECRET` แยกจะดีกว่า — เปลี่ยน client secret แล้ว session เดิมจะไม่หลุดทั้งระบบ)
 */
function secretKey(): string | null {
  return process.env.AUTH_SECRET || process.env.GOOGLE_CLIENT_SECRET || null;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function b64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* `new Uint8Array(n)` ไม่ใช่ `Uint8Array.from()` — ต้องได้ตัวที่ผูกกับ `ArrayBuffer`
   จริง ๆ ไม่งั้น TS ไม่ยอมให้ส่งเข้า `crypto.subtle` (ซึ่งรับ `BufferSource`) */
function b64urlDecode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** เซ็น payload เป็นสตริงเดียวสำหรับใส่คุกกี้ — โยนเมื่อยังไม่ได้ตั้งค่าคีย์ลับ */
export async function signSession(payload: SessionPayload): Promise<string> {
  const secret = secretKey();
  if (!secret) {
    throw new Error(
      "ยังไม่ได้ตั้งค่า AUTH_SECRET (หรือ GOOGLE_CLIENT_SECRET) — เซ็นคุกกี้ session ไม่ได้",
    );
  }

  // ชื่อพนักงานเป็นภาษาไทย จึงต้องผ่าน TextEncoder ก่อน — `btoa` รับได้แค่ ASCII
  const body = b64urlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    encoder.encode(body),
  );
  return `${body}.${b64urlEncode(new Uint8Array(signature))}`;
}

/**
 * ตรวจลายเซ็น + วันหมดอายุ แล้วคืน payload — ไม่ผ่านข้อไหนก็ `null` เท่ากันหมด
 * (ผู้เรียกทั้งหมดปฏิบัติกับ “คุกกี้ปลอม” กับ “คุกกี้หมดอายุ” เหมือนกัน คือยังไม่ล็อกอิน)
 */
export async function verifySession(
  raw: string | undefined | null,
): Promise<SessionPayload | null> {
  const secret = secretKey();
  if (!raw || !secret) return null;

  const [body, signature] = raw.split(".");
  if (!body || !signature) return null;

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      b64urlDecode(signature),
      encoder.encode(body),
    );
    if (!valid) return null;

    const payload = JSON.parse(decoder.decode(b64urlDecode(body))) as SessionPayload;
    if (!payload?.user?.employeeId || typeof payload.exp !== "number") return null;
    if (payload.exp <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
