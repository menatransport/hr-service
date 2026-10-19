/**
 * ฝั่ง Google ของการล็อกอิน — **authorization code flow ล้วน ๆ ฝั่งเซิร์ฟเวอร์**
 *
 * ไม่ใช้สคริปต์ Google Identity Services บนเบราว์เซอร์โดยตั้งใจ: `client_secret`
 * และ `client_id` จึงไม่ต้องหลุดเข้า bundle เลย และปุ่มบนหน้า login ยังเป็นปุ่มของ
 * เราเอง (ดีไซน์บัตรพนักงาน) ไม่ใช่ปุ่มสำเร็จรูปของ Google
 *
 * ที่เราต้องการจริง ๆ มีอย่างเดียวคือ **`id_token`** — NCAC เป็นฝ่ายตรวจกับ Google
 * เองอีกที (`POST /auth/login/google`) เราไม่ตรวจซ้ำ ไม่งั้นกฎโดเมนจะมีสองที่
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** โดเมนบริษัท — ส่งเป็น `hd` เพื่อให้หน้าเลือกบัญชีของ Google กรองให้ตั้งแต่แรก */
export const COMPANY_DOMAIN = "menatransport.co.th";

/** ค่าที่ตั้งใน `.env.local` มีเครื่องหมายคำพูดคร่อมอยู่ — ปอกทิ้งก่อนใช้เสมอ */
const clean = (value: string | undefined): string =>
  (value ?? "").trim().replace(/^['"]|['"]$/g, "");

export function googleClientId(): string {
  const id = clean(process.env.GOOGLE_CLIENT_ID);
  if (!id) throw new Error("ยังไม่ได้ตั้งค่า GOOGLE_CLIENT_ID ใน .env.local");
  return id;
}

function googleClientSecret(): string {
  const secret = clean(process.env.GOOGLE_CLIENT_SECRET);
  if (!secret) throw new Error("ยังไม่ได้ตั้งค่า GOOGLE_CLIENT_SECRET ใน .env.local");
  return secret;
}

/**
 * ปลายทางที่ Google จะส่งผู้ใช้กลับมา — **ต้องตรงกับที่ลงทะเบียนไว้ใน Google Console
 * ตัวอักษรต่อตัวอักษร** ไม่งั้นได้ `redirect_uri_mismatch`
 *
 * ⚠️ พาธ `/api/auth/callback/google` **เลือกให้ตรงกับของที่ลงทะเบียนไว้แล้ว** ไม่ใช่
 * เพราะโปรเจกต์นี้ใช้ NextAuth (ไม่ได้ใช้) — client id ตัวนี้ถูกใช้ร่วมกับ `menaIT/my-app`
 * ซึ่งเป็น NextAuth และลงทะเบียน `http://localhost:3000/api/auth/callback/google` กับ
 * `http://localhost:4000/…` ไว้แล้ว (ยิงถาม Google ยืนยันแล้ว 9 ส.ค. 2026)
 * **ห้ามเปลี่ยนพาธนี้** จนกว่าจะได้เพิ่ม URI ใหม่ใน Google Console ก่อน
 *
 * ปกติสร้างจาก origin ของคำขอ (localhost ตอน dev · โดเมนจริงตอน deploy) แต่ถ้า
 * อยู่หลัง proxy ที่เขียน header ไม่ครบ ให้ตั้ง `APP_URL` มาทับได้
 */
export const CALLBACK_PATH = "/api/auth/callback/google";

export function callbackUrl(request: Request): string {
  const configured = clean(process.env.APP_URL);
  if (configured) return `${configured.replace(/\/+$/, "")}${CALLBACK_PATH}`;

  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}${CALLBACK_PATH}`;
}

export function authorizeUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: googleClientId(),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    // จำกัดให้เห็นเฉพาะบัญชีในโดเมนบริษัท — ไม่ใช่ด่านความปลอดภัย (ปลอมได้)
    // ด่านจริงอยู่ที่ NCAC ที่ตรวจ `hd`/อีเมลใน id_token อีกชั้น
    hd: COMPANY_DOMAIN,
    // ให้เลือกบัญชีทุกครั้ง — เครื่องที่ใช้ร่วมกันจะได้ไม่ล็อกอินค้างเป็นคนก่อนหน้า
    prompt: "select_account",
    access_type: "online",
  });
  return `${AUTH_ENDPOINT}?${params}`;
}

/**
 * แลก `code` เป็น `id_token` — เรียกครั้งเดียวต่อ code (ยิงซ้ำ Google จะปฏิเสธ)
 *
 * เราสนใจแค่ `id_token` · `access_token` ของ Google ไม่ได้ใช้ เพราะข้อมูลพนักงาน
 * มาจาก NCAC ไม่ใช่จาก Google People API
 */
export async function exchangeCodeForIdToken(
  code: string,
  redirectUri: string,
): Promise<string> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: googleClientId(),
      client_secret: googleClientSecret(),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });

  const payload = (await res.json().catch(() => null)) as {
    id_token?: string;
    error?: string;
    error_description?: string;
  } | null;

  if (!res.ok || !payload?.id_token) {
    const reason =
      payload?.error_description ?? payload?.error ?? `Google ตอบ ${res.status}`;
    throw new Error(`แลกรหัสกับ Google ไม่สำเร็จ — ${reason}`);
  }

  return payload.id_token;
}

/* ---------------------------------------------------------------- ตรวจ id_token */

/**
 * ตรวจ `id_token` ของ Google ด้วยตัวเอง แล้วคืนอีเมลบริษัทที่เชื่อได้ — **ห้ามถอด claim
 * ไปใช้โดยไม่ผ่านตัวนี้** เพราะอีเมลเป็นกุญแจหาบทบาทในระบบรถร่วม (ปลอมอีเมลได้ = ได้บทบาท admin)
 *
 * ปกติ NCAC ตรวจ id_token อีกชั้นอยู่แล้ว แต่ NCAC ไม่คืนอีเมลมา และเราไม่อยากผูกความปลอดภัย
 * ของสิทธิ์ฝั่งนี้ไว้กับรายละเอียดภายในของอีกระบบ จึงตรวจครบทุกข้อที่ OIDC กำหนดที่นี่:
 * ลายเซ็น RS256 กับกุญแจสาธารณะของ Google (JWKS) · `iss` · `aud` = client id ของเรา ·
 * `exp` · `email_verified` · โดเมนบริษัท (`hd` และท้ายอีเมล)
 *
 * Web Crypto ล้วน (ไม่เพิ่ม dependency) · ไม่ผ่านข้อไหนจะโยน — ผู้เรียกตัดสินเองว่าจะทำอะไรต่อ
 */

export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
/** เผื่อนาฬิกาเครื่องเราคลาดกับ Google */
const CLOCK_SKEW_SEC = 300;

export interface GoogleJwk {
  kid: string;
  kty: string;
  alg?: string;
  n: string;
  e: string;
}

export type JwksLoader = () => Promise<GoogleJwk[]>;

let jwksCache: { at: number; keys: GoogleJwk[] } | null = null;

/** กุญแจของ Google หมุนเวียนราววันละครั้ง — cache 1 ชม. พอ (kid ไม่เจอค่อยดึงใหม่) */
async function fetchGoogleJwks(force = false): Promise<GoogleJwk[]> {
  if (!force && jwksCache && Date.now() - jwksCache.at < 60 * 60 * 1000) return jwksCache.keys;
  const res = await fetch(GOOGLE_JWKS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`ดึงกุญแจสาธารณะของ Google ไม่สำเร็จ (${res.status})`);
  const body = (await res.json()) as { keys?: GoogleJwk[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  jwksCache = { at: Date.now(), keys };
  return keys;
}

function b64urlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const b64urlJson = (value: string): Record<string, unknown> =>
  JSON.parse(new TextDecoder().decode(b64urlToBytes(value))) as Record<string, unknown>;

export interface VerifyIdTokenOptions {
  clientId: string;
  /** แทนการดึง JWKS จริง — สำหรับเทสต์ */
  loadJwks?: JwksLoader;
  /** epoch วินาที — สำหรับเทสต์ */
  nowSec?: number;
  /** ค่าเริ่มต้น = โดเมนบริษัท */
  domain?: string;
}

export async function verifyGoogleIdToken(
  idToken: string,
  options: VerifyIdTokenOptions,
): Promise<{ email: string }> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("id_token รูปแบบไม่ถูกต้อง");
  const [headerB64, payloadB64, sigB64] = parts;

  const header = b64urlJson(headerB64);
  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    throw new Error("id_token ไม่ได้เซ็นด้วย RS256");
  }

  const custom = options.loadJwks;
  let keys = custom ? await custom() : await fetchGoogleJwks();
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk && !custom) {
    keys = await fetchGoogleJwks(true);
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) throw new Error("ไม่พบกุญแจที่ใช้เซ็น id_token");

  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlToBytes(sigB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`),
  );
  if (!valid) throw new Error("ลายเซ็น id_token ไม่ถูกต้อง");

  const claims = b64urlJson(payloadB64);
  const now = options.nowSec ?? Math.floor(Date.now() / 1000);

  if (!GOOGLE_ISSUERS.has(String(claims.iss))) throw new Error("id_token ไม่ได้ออกโดย Google");
  const aud = claims.aud;
  const audOk = Array.isArray(aud) ? aud.includes(options.clientId) : aud === options.clientId;
  if (!audOk) throw new Error("id_token ไม่ได้ออกให้แอปนี้");
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_SEC < now) {
    throw new Error("id_token หมดอายุแล้ว");
  }
  if (claims.email_verified !== true && claims.email_verified !== "true") {
    throw new Error("อีเมลใน id_token ยังไม่ผ่านการยืนยัน");
  }

  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  const domain = (options.domain ?? COMPANY_DOMAIN).toLowerCase();
  if (!email || !email.endsWith(`@${domain}`) || String(claims.hd ?? "").toLowerCase() !== domain) {
    throw new Error("อีเมลใน id_token ไม่ใช่อีเมลบริษัท");
  }

  return { email };
}
