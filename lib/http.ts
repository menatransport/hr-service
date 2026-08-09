/**
 * ตัวเรียก API ฝั่งเบราว์เซอร์ตัวเดียวของทั้งระบบ
 *
 * ทุกที่ที่ยิงไป `/api/**` เคยเขียนท่าเดียวกันซ้ำ ๆ คือ `res.json().catch(() => null)`
 * แล้วโยน `json?.error` ทิ้งไว้เอง — รวมมาไว้ที่เดียวเพื่อให้ข้อความผิดพลาดที่ผู้ใช้
 * เห็นมาจากเซิร์ฟเวอร์จริงเสมอ ไม่ใช่ข้อความ generic ของ `fetch`
 *
 * โยน `Error` เมื่อไม่สำเร็จ (ไม่คืน `null`) เพราะฝั่งเรียกใช้ทำงานผ่าน
 * `runAction` ใน `lib/swal.ts` ซึ่งจับ error แล้วแปลงเป็นกล่องแจ้งเตือนให้อยู่แล้ว
 */

export type JsonBody = Record<string, unknown> | unknown[];

/** 204 หรือ body ที่ไม่ใช่ JSON ให้เป็น `null` แทนการโยน — ไม่ใช่ทุก endpoint ที่ตอบ JSON */
async function parse(res: Response): Promise<unknown> {
  return res.json().catch(() => null);
}

function messageOf(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === "string" && error.trim()) return error;
  }
  return fallback;
}

/**
 * ยิง request แล้วคืน JSON ที่ parse แล้ว — ไม่ 2xx เมื่อไหร่โยน `Error`
 * ที่มีข้อความจากฟิลด์ `error` ของเซิร์ฟเวอร์
 *
 * `body` ใส่เป็นอ็อบเจกต์ธรรมดาได้เลย (จะถูก `JSON.stringify` + ใส่ header ให้)
 * หรือส่ง `FormData` มาตรง ๆ ก็ได้ — กรณีนั้นจะไม่ยัด `Content-Type` ทับ
 * เพราะเบราว์เซอร์ต้องเป็นคนใส่ boundary เอง
 */
export async function requestJson<T = unknown>(
  url: string,
  init: Omit<RequestInit, "body"> & { body?: JsonBody | FormData | null } = {},
  fallbackMessage = "ดำเนินการไม่สำเร็จ",
): Promise<T> {
  const { body, headers, ...rest } = init;
  const isForm = body instanceof FormData;

  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: isForm || body == null ? headers : { "Content-Type": "application/json", ...headers },
      body: isForm ? body : body == null ? null : JSON.stringify(body),
    });
  } catch {
    // ยิงไม่ถึงเซิร์ฟเวอร์เลย — ต้องแยกจาก “เซิร์ฟเวอร์ตอบว่าไม่ผ่าน” ให้ผู้ใช้รู้ว่าควรลองใหม่
    throw new Error("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง");
  }

  const payload = await parse(res);
  if (!res.ok) throw new Error(messageOf(payload, fallbackMessage));
  return payload as T;
}
