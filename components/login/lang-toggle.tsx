"use client";

/**
 * สลับภาษา ไทย / EN
 *
 * ระบบยังไม่มี i18n จริง — ปุ่ม EN จึงเป็น `aria-disabled` ไม่ใช่ปุ่มที่กดแล้ว
 * ไม่เกิดอะไรขึ้นเงียบ ๆ (หน้าจอต้องไม่โกหกว่าทำได้). วันที่มี i18n ให้เอา
 * `aria-disabled` กับ `title` ออกแล้วต่อ handler เข้า router locale
 *
 * hit area ขยายด้วย `before:` ให้ครบ 44px โดยที่ตัว pill ยังสูง 32px ตามดีไซน์
 */
const OPTION =
  "relative isolate flex h-7 items-center rounded-full px-3 text-[12.5px] transition-colors " +
  "before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']";

export function LangToggle() {
  return (
    <div className="flex h-8 items-center rounded-full border border-line bg-base-200 p-0.5">
      <button
        type="button"
        aria-pressed="true"
        className={`${OPTION} bg-base-100 font-medium text-ink shadow-[0_1px_2px_rgba(21,32,29,0.06)]`}
      >
        ไทย
      </button>
      <button
        type="button"
        aria-disabled="true"
        aria-pressed="false"
        title="ยังไม่รองรับภาษาอังกฤษ"
        onClick={(event) => event.preventDefault()}
        className={`${OPTION} cursor-not-allowed text-mut/70`}
        lang="en"
      >
        EN
      </button>
    </div>
  );
}
