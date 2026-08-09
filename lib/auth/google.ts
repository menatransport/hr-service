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
