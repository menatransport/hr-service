/**
 * ชิ้นส่วนของบัตรพนักงาน — ยกรูปทรงมาจากบัตรบนหน้า login (`components/login/sign-in-card.tsx`)
 * ใช้วาดบัตรใบใหญ่ที่ห้อยสายคล้องในหน้ารายคน (`EmployeeProfile`)
 *
 * ชิ้นส่วนที่ยกมาตรง ๆ: แถบหัวสี primary + ป้าย mono · ช่องร้อยสาย ·
 * แถวป้ายอังกฤษบนเส้นประ · ท้ายบัตรเส้นประกับแถบบาร์โค้ด
 *
 * **รูปไม่คร่อมแถบหัวบัตรแบบต้นแบบ** — เจ้าของงานสั่งเมื่อ 7 ส.ค. 2026 ว่าอย่าให้
 * ทับซ้อนกัน รูปจึงลงมาอยู่ในเนื้อบัตรเต็มใบ (อย่าย้ายกลับไปใช้ `-mt-*` ให้คร่อมอีก)
 *
 * หน้าค้นหาพนักงานเลิกใช้บัตรใบเล็กแล้ว (13 ต.ค. 2026) — เป็นแถวรายชื่อแบนใน
 * `employee-directory.tsx` ตามกติกาแผ่นเนื้อหาแผ่นเดียว ไม่มีการ์ดซ้อน
 */

/** แถบบาร์โค้ดท้ายบัตร — ความกว้างสุ่มไว้ตายตัวเพื่อไม่ให้ SSR/CSR ต่างกัน */
const BARCODE = [
  "w-0.5",
  "w-px",
  "w-[3px]",
  "w-px",
  "w-0.5",
  "w-px",
  "w-[3px]",
  "w-0.5",
  "w-px",
  "w-0.5",
] as const;

export function Barcode({ className = "h-4" }: { className?: string }) {
  return (
    <span aria-hidden className={`flex items-end gap-0.5 ${className}`}>
      {BARCODE.map((width, index) => (
        <i key={index} className={`block h-full bg-ink ${width}`} />
      ))}
    </span>
  );
}

/**
 * แถบหัวบัตร
 *
 * **ไม่มีแสงกวาด/ไล่เงา** — เจ้าของงานสั่งเอา effect เงาวาว ๆ ออกทั้งหมด
 * (7 ส.ค. 2026) เดิมมี gradient sweep วิ่งผ่านตอน hover · อย่าใส่กลับเข้ามา
 */
export function BadgeHeader({ tall }: { tall?: boolean }) {
  return (
    <div
      className={`flex items-start justify-between bg-primary ${
        tall ? "h-16 px-5.5 pt-5" : "h-12 px-4 pt-3.5"
      }`}
    >
      <span
        lang="en"
        className={`font-mono tracking-[0.14em] text-primary-content/85 ${
          tall ? "text-11" : "text-10"
        }`}
      >
        Employee ID Card
      </span>
      {/* ช่องร้อยสายคล้อง */}
      <span
        aria-hidden
        className={`rounded-full bg-primary-content/35 ${
          tall ? "h-2 w-8.5" : "h-1.5 w-7"
        }`}
      />
    </div>
  );
}

/** แถวข้อมูลบนบัตร — ป้ายอังกฤษตัวเล็ก แล้วค่าจริงวางบนเส้นประเดียวกับบัตรต้นแบบ */
export function BadgeRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <dt
        lang="en"
        className="w-18.5 flex-none font-mono text-9-5 tracking-[0.08em] text-mut/80"
      >
        {label}
      </dt>
      <dd
        className={`min-w-0 flex-1 truncate border-b border-dashed border-line pb-1 text-right text-12-5 ${
          mono ? "font-mono tracking-[0.02em]" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
