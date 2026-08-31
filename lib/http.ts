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

/* ------------------------------------------------------------------ ดาวน์โหลดไฟล์ */

/** ชื่อไฟล์จาก `Content-Disposition` — `filename*` (UTF-8) มาก่อนเสมอ ไทยจะได้ไม่เพี้ยน */
function fileNameOf(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;

  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      /* ชื่อที่ encode มาไม่ถูก — ตกไปใช้ `filename=` ธรรมดาแทน */
    }
  }

  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  return plain ? plain[1] : fallback;
}

/**
 * ยิง request แล้วเซฟผลลัพธ์เป็นไฟล์ให้ผู้ใช้
 *
 * มีคู่กับ `requestJson()` เพราะเส้นที่ตอบเป็นไฟล์ **ยังตอบ `{ error }` เป็น JSON
 * เมื่อพัง** — ถ้าปล่อยให้ `<a download>` พาไปเอง เบราว์เซอร์จะเซฟข้อความ error
 * ลงเครื่องเป็นไฟล์ `.xlsx` ที่เปิดไม่ขึ้นแทนที่จะบอกผู้ใช้ว่าเกิดอะไรขึ้น
 *
 * คืนชื่อไฟล์ที่เซฟจริง เพื่อให้ผู้เรียกเอาไปขึ้นข้อความยืนยันได้
 */
export async function downloadFile(
  url: string,
  fallbackName: string,
  fallbackMessage = "ดาวน์โหลดไฟล์ไม่สำเร็จ",
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, { method: "GET" });
  } catch {
    throw new Error("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง");
  }

  if (!res.ok) throw new Error(messageOf(await parse(res), fallbackMessage));

  const blob = await res.blob();
  const name = fileNameOf(res.headers.get("Content-Disposition"), fallbackName);

  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // ปล่อยทีหลังหนึ่งจังหวะ — บางเบราว์เซอร์ยังอ่าน blob อยู่ตอนที่ `click()` คืนค่ามาแล้ว
  setTimeout(() => URL.revokeObjectURL(href), 10_000);

  return name;
}
