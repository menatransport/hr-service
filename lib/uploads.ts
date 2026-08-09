/**
 * อัปโหลดไฟล์แนบขึ้น DigitalOcean Spaces — **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 * (เรียกจาก `app/api/uploads/route.ts` · เบราว์เซอร์ยิงเข้า `/api/uploads` แทน)
 *
 * NCAC เก็บไฟล์แนบเป็น **URL** (`complaint_url` / `solution_url`) ไม่ได้เก็บตัวไฟล์ —
 * ไฟล์จริงอยู่บน bucket `mn-bucket` ซึ่งเข้าถึงผ่าน presign API ตัวเดียวกับที่แอปมือถือ
 * mena-go ใช้ (`src/hooks/usePresignedUpload.js`) ขั้นตอนตรงกันทุกอย่าง:
 *
 * 1. `POST /presign-upload-batch` → ได้ `uploadUrl` (ลิงก์ PUT อายุ 5 นาที) + `publicUrl`
 * 2. `PUT uploadUrl` พร้อมตัวไฟล์
 * 3. `POST /set-public-acl-batch` → เปิดสิทธิ์อ่านสาธารณะ ไม่งั้น `<img>` จะได้ 403
 *
 * ทำครบสามขั้นฝั่งเซิร์ฟเวอร์โดยตั้งใจ — เบราว์เซอร์ PUT ตรงไป Spaces เองก็ได้
 * แต่จะติด CORS ของ bucket ซึ่งโปรเจกต์นี้แก้ไม่ได้ และไฟล์แนบต่อเคสมีแค่ไฟล์เดียว
 * ขนาดไม่กี่ MB จึงไม่คุ้มที่จะแลกความซับซ้อนนั้น
 */

const TIMEOUT_MS = 30_000;

/** ค่าเริ่มต้นเดียวกับ `DEFAULT_MEDIA_API_URL` ของ mena-go — override ได้ด้วย env */
const DEFAULT_PRESIGN_URL =
  "https://presign-api-548129382487.asia-southeast1.run.app";

/**
 * โฟลเดอร์ปลายทางบน bucket
 *
 * `complaints` = โฟลเดอร์เดียวกับที่ไฟล์จากแอปมือถือลง เพื่อให้ไฟล์แนบของเคส
 * อยู่ที่เดียวกันหมด · `employees` = รูปโปรไฟล์พนักงาน แยกไว้เพราะอายุการใช้งาน
 * ต่างกันคนละเรื่อง (ไฟล์แนบผูกกับเคสที่ปิดแล้วจบ ส่วนรูปพนักงานอยู่ยาว)
 */
export type UploadFolder = "complaints" | "employees";

export class UploadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

interface PresignedFile {
  key: string;
  uploadUrl: string;
  publicUrl: string;
}

function baseUrl(): string {
  return (process.env.API_PRESIGN_URL || DEFAULT_PRESIGN_URL).replace(/\/+$/, "");
}

async function call<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new UploadError(`ติดต่อบริการอัปโหลดไม่ได้ (${reason})`, 502);
  }

  const text = await res.text();
  if (!res.ok) {
    throw new UploadError(
      `บริการอัปโหลดตอบ ${res.status}${text ? ` — ${text.slice(0, 200)}` : ""}`,
      res.status,
    );
  }
  return JSON.parse(text) as T;
}

/**
 * ชื่อไฟล์ต้องไม่ซ้ำ — presign API ไม่ได้เติมอะไรให้ ยิงชื่อเดิมซ้ำคือทับของเดิม
 * (สูตรเดียวกับ mena-go: `ชื่อเดิม_เวลา_สุ่ม.นามสกุล`)
 */
function uniqueName(original: string): string {
  const clean = original.replace(/[^\w.\-]+/g, "_");
  const dot = clean.lastIndexOf(".");
  const base = (dot > 0 ? clean.slice(0, dot) : clean) || "upload";
  const ext = (dot > 0 ? clean.slice(dot + 1) : "jpg").toLowerCase();
  const random = Math.random().toString(36).slice(2, 13);
  return `${base}_${Date.now()}_${random}.${ext}`;
}

/** อัปไฟล์เดียวจบครบทุกขั้น → คืน URL สาธารณะที่เอาไปเก็บใน NCAC ได้เลย */
export async function uploadImage(
  file: File,
  folder: UploadFolder = "complaints",
): Promise<string> {
  const { files } = await call<{ files?: PresignedFile[] }>(
    "/presign-upload-batch",
    { files: [uniqueName(file.name || "upload.jpg")], folder },
  );

  const target = files?.[0];
  if (!target?.uploadUrl || !target.publicUrl) {
    throw new UploadError("บริการอัปโหลดไม่ได้ส่งลิงก์กลับมา", 502);
  }

  let put: Response;
  try {
    put = await fetch(target.uploadUrl, {
      method: "PUT",
      // ต้องตรงกับตอน presign — Spaces ปฏิเสธถ้า Content-Type ไม่ตรงลายเซ็น
      headers: { "Content-Type": file.type || "image/jpeg" },
      body: await file.arrayBuffer(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new UploadError(`อัปโหลดไฟล์ไม่สำเร็จ (${reason})`, 502);
  }
  if (!put.ok) {
    throw new UploadError(`อัปโหลดไฟล์ไม่สำเร็จ (${put.status})`, 502);
  }

  /* ข้ามขั้นนี้ไม่ได้ — ไฟล์ที่เพิ่ง PUT เป็น private ตามค่าตั้งต้นของ bucket
     ถ้า ACL ไม่ผ่านก็ถือว่าอัปโหลดไม่สำเร็จ ดีกว่าเก็บ URL ที่เปิดดูไม่ได้ลง NCAC */
  const acl = await call<{ failedCount?: number }>("/set-public-acl-batch", {
    keys: [target.key],
  });
  if (acl.failedCount) {
    throw new UploadError("อัปโหลดแล้วแต่เปิดสิทธิ์ให้ดูรูปไม่สำเร็จ", 502);
  }

  return target.publicUrl;
}
