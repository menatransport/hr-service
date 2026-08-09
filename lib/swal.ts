"use client";

import Swal, { type SweetAlertOptions } from "sweetalert2";

/**
 * ชั้นแจ้งเตือนของทั้งระบบ (SweetAlert2)
 *
 * ทุกอย่างที่เด้งขึ้นมาบอกผลหรือขอคำยืนยัน **ต้องผ่านไฟล์นี้ที่เดียว** —
 * component ห้าม `import Swal` ตรง ๆ ไม่งั้นสีปุ่ม/ธีมมืด/ระยะขอบจะหลุดจากดีไซน์
 *
 * แบ่งเป็น 3 ระดับตามน้ำหนักของเรื่อง:
 *
 * | ระดับ | ใช้เมื่อ | หน้าตา |
 * |---|---|---|
 * | `toast*` | บอกผลที่ผู้ใช้เห็นการเปลี่ยนแปลงบนจอตามอยู่แล้ว | ขนมปังปิ้งมุมขวาบน หายเอง |
 * | `alert*` | เรื่องที่พลาดไม่ได้ (ล้มเหลว / เตือน) | กล่องกลางจอ ต้องกดรับทราบ |
 * | `confirm` | ก่อนยิงคำสั่งที่เปลี่ยนข้อมูลหลังบ้าน | กล่องกลางจอ 2 ปุ่ม |
 *
 * และ `runAction()` คือท่ามาตรฐานที่รวมทั้งสามเข้าด้วยกัน — ถาม → ยิง → บอกผล
 *
 * **สีทั้งหมดมาจาก token ผ่าน CSS ใน `app/globals.css`** (บล็อก `.swal2-*`)
 * ไม่ใช่จาก option ของไลบรารี ธีมมืดจึงตามไปเองโดยไม่ต้องอ่าน `data-theme`
 */

/**
 * ข้อความจากผู้ใช้/จาก API ที่จะไปโผล่ในช่อง `html` ต้องผ่านตัวนี้ก่อนเสมอ
 * (`html` ของ SweetAlert2 ใส่ลง DOM ตรง ๆ ไม่ได้ escape ให้)
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** โทนของกล่อง — กำหนดทั้งไอคอนและสีปุ่มยืนยัน */
export type Tone = "primary" | "danger" | "warn" | "info";

const ICON: Record<Tone, SweetAlertOptions["icon"]> = {
  primary: "question",
  danger: "warning",
  warn: "warning",
  info: "info",
};

/** ปุ่มใช้คลาสเดียวกับปุ่มในฟุตเตอร์ของ `case-modal.tsx` — กล่องจึงดูเป็นระบบเดียวกัน */
const BTN_BASE =
  "rounded-field px-4 py-2 text-[13px] font-medium transition-opacity hover:opacity-90";

const CONFIRM_CLASS: Record<Tone, string> = {
  primary: `${BTN_BASE} bg-primary text-primary-content`,
  danger: `${BTN_BASE} bg-alert text-ink-content`,
  warn: `${BTN_BASE} bg-sla text-ink-content`,
  info: `${BTN_BASE} bg-primary text-primary-content`,
};

const CANCEL_CLASS =
  "rounded-field border border-line px-3.5 py-2 text-[13px] text-mut transition-colors hover:text-ink";

/**
 * ค่าที่ทุกกล่องใช้ร่วมกัน
 *
 * - `buttonsStyling: false` — ปิดสไตล์ปุ่มของไลบรารีทิ้ง แล้วส่งคลาส Tailwind เข้าไปแทน
 * - `scrollbarPadding: false` — กันหน้าเขยิบตอนกล่องเปิด
 */
const SHARED = { buttonsStyling: false, scrollbarPadding: false } as const;

/**
 * กล่องกลางจอ · `heightAuto: false` ห้ามไลบรารีไปเซ็ต `height: auto` ที่ `<body>`
 * (body ของโปรเจกต์นี้เป็น flex `min-h-full` จะเสียทรงทั้งหน้า) — ตัวนี้ **ห้าม
 * ส่งให้ toast** ไลบรารีจะเตือนว่าใช้ด้วยกันไม่ได้ ทั้งสองชุดจึงแยก mixin กัน
 */
const base = Swal.mixin({
  ...SHARED,
  heightAuto: false,
  /* ยกเลิกซ้าย · ยืนยันขวา — ลำดับเดียวกับฟุตเตอร์ของโมดัลในระบบ */
  reverseButtons: true,
  customClass: {
    popup: "hrs-swal",
    confirmButton: CONFIRM_CLASS.primary,
    cancelButton: CANCEL_CLASS,
    denyButton: CONFIRM_CLASS.danger,
  },
});

const toastBase = Swal.mixin({
  ...SHARED,
  toast: true,
  position: "top",
  showConfirmButton: false,
  timer: 3200,
  timerProgressBar: true,
  customClass: { popup: "hrs-swal hrs-swal-toast" },
  didOpen: (el) => {
    // ค้างไว้เมื่อผู้ใช้เอาเมาส์ไปวาง — ข้อความยาว ๆ จะได้อ่านทัน
    el.addEventListener("mouseenter", Swal.stopTimer);
    el.addEventListener("mouseleave", Swal.resumeTimer);
  },
});

/* ------------------------------------------------------------------ ขนมปังปิ้ง */

export function toastSuccess(title: string, text?: string) {
  return toastBase.fire({ icon: "success", title, text });
}

export function toastError(title: string, text?: string) {
  return toastBase.fire({ icon: "error", title, text, timer: 5000 });
}

export function toastInfo(title: string, text?: string) {
  return toastBase.fire({ icon: "info", title, text });
}

/* ------------------------------------------------------------------- กล่องกลาง */

/** สำเร็จแบบที่ต้องให้ผู้ใช้รับรู้แน่ ๆ (เช่น สร้างเคสใหม่) — นอกนั้นใช้ `toastSuccess` */
export function alertSuccess(title: string, text?: string) {
  return base.fire({ icon: "success", title, text, confirmButtonText: "เรียบร้อย" });
}

export function alertError(title: string, text?: string) {
  return base.fire({
    icon: "error",
    title,
    text,
    confirmButtonText: "รับทราบ",
    customClass: { popup: "hrs-swal", confirmButton: CONFIRM_CLASS.danger },
  });
}

export function alertWarning(title: string, text?: string) {
  return base.fire({
    icon: "warning",
    title,
    text,
    confirmButtonText: "รับทราบ",
    customClass: { popup: "hrs-swal", confirmButton: CONFIRM_CLASS.warn },
  });
}

/* ----------------------------------------------------------------- ถามก่อนยิง */

export type ConfirmOptions = {
  title: string;
  /** บรรทัดรายละเอียด — บอกให้ชัดว่า “กดแล้วจะเกิดอะไร” ไม่ใช่ถามซ้ำว่าแน่ใจไหม */
  text?: string;
  /** ใช้เมื่อรายละเอียดต้องมีตัวหนา/ขึ้นบรรทัด — เขียนเป็น HTML แทน `text` */
  html?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: Tone;
};

/** คืน `true` เมื่อผู้ใช้กดยืนยัน · `false` เมื่อยกเลิก/กด Esc/คลิกนอกกล่อง */
export async function confirm({
  title,
  text,
  html,
  confirmText = "ยืนยัน",
  cancelText = "ยกเลิก",
  tone = "primary",
}: ConfirmOptions): Promise<boolean> {
  const res = await base.fire({
    icon: ICON[tone],
    title,
    text,
    html,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    /* เรื่องที่ย้อนกลับไม่ได้ให้โฟกัสไปที่ “ยกเลิก” — Enter รัว ๆ จะได้ไม่กลายเป็นการยืนยัน */
    focusCancel: tone === "danger" || tone === "warn",
    customClass: {
      popup: "hrs-swal",
      confirmButton: CONFIRM_CLASS[tone],
      cancelButton: CANCEL_CLASS,
    },
  });
  return res.isConfirmed;
}

/* --------------------------------------------------------------- ท่ามาตรฐาน */

export type ActionOutcome<T> =
  | { status: "done"; data: T }
  /** ผู้ใช้กดยกเลิกในกล่องยืนยัน — ยังไม่มีอะไรถูกส่งไปหลังบ้าน จึงไม่ต้อง rollback */
  | { status: "cancelled" }
  | { status: "failed"; error: Error };

export type RunActionOptions<T> = {
  /** งานจริงที่ยิงไปหลังบ้าน — โยน `Error` เมื่อไม่สำเร็จ (`requestJson` ทำให้แล้ว) */
  run: () => Promise<T>;
  /** ถามก่อนยิง · ใส่ `false` เมื่อเป็นคำสั่งที่ย้อนกลับได้เองอยู่แล้ว */
  confirm?: ConfirmOptions | false;
  /** ข้อความระหว่างรอ — ปล่อยว่างเมื่อหน้าจอมีตัวบอกสถานะของตัวเองอยู่แล้ว */
  pending?: string;
  /** ข้อความตอนสำเร็จ · รับ `false` เมื่อผู้เรียกจะแจ้งเอง */
  success?: string | ((data: T) => string) | false;
  successDetail?: string;
  /** ข้อความบนหัวกล่องตอนล้มเหลว — รายละเอียดมาจาก `Error.message` เสมอ */
  failureTitle?: string;
  /** `true` = สำเร็จแล้วขึ้นกล่องกลางจอแทนขนมปังปิ้ง (ใช้กับงานที่จบเป็นเรื่องเป็นราว) */
  loud?: boolean;
};

/**
 * ถาม → ยิง → บอกผล ในบรรทัดเดียว
 *
 * ```ts
 * const out = await runAction({
 *   confirm: { title: "ปิดเคสนี้?", text: "ปิดแล้วจะแก้ไขแผนไม่ได้อีก", tone: "warn" },
 *   pending: "กำลังปิดเคส…",
 *   success: "ปิดเคสเรียบร้อย",
 *   run: () => requestJson(`${endpoint}/close`, { method: "POST", body }),
 * });
 * if (out.status === "done") router.refresh();
 * ```
 *
 * ผู้เรียก **ต้องเช็ก `status` เสมอ** — `cancelled` กับ `failed` ต่างกันตรงที่
 * แบบหลังยิงไปแล้วจริง จึงเป็นจุดที่ต้องคืนค่าหน้าจอกลับ (ห้ามให้จอโกหกว่าบันทึกแล้ว)
 */
export async function runAction<T>({
  run,
  confirm: ask,
  pending,
  success,
  successDetail,
  failureTitle = "ดำเนินการไม่สำเร็จ",
  loud = false,
}: RunActionOptions<T>): Promise<ActionOutcome<T>> {
  if (ask && !(await confirm(ask))) return { status: "cancelled" };

  /**
   * `fire()` คืน promise ที่ resolve **หลังกล่องปิดจนสุดแอนิเมชัน** — เก็บไว้ `await`
   * ก่อนเปิดกล่องถัดไปเสมอ ไม่งั้นกล่องผลลัพธ์จะไปสวมท่าปิดของกล่อง “กำลังทำงาน”
   * (SweetAlert2 ใช้คอนเทนเนอร์เดียวร่วมกันทุกกล่อง)
   */
  const waiting = pending
    ? base.fire({
        title: pending,
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => Swal.showLoading(),
      })
    : null;

  const settle = async () => {
    if (!waiting) return;
    Swal.close();
    await waiting;
  };

  try {
    const data = await run();
    await settle();

    if (success !== false && success !== undefined) {
      const title = typeof success === "function" ? success(data) : success;
      if (loud) await alertSuccess(title, successDetail);
      else void toastSuccess(title, successDetail);
    }
    return { status: "done", data };
  } catch (err) {
    await settle();
    const error = err instanceof Error ? err : new Error(failureTitle);
    await alertError(failureTitle, error.message);
    return { status: "failed", error };
  }
}
