/**
 * Export ข้อมูลเป็นไฟล์ Excel (.xlsx) — ใช้ร่วมทุกหน้า
 * lazy import `xlsx` เพื่อไม่ให้ไปเพิ่มขนาด client bundle ตอนโหลดหน้า
 *
 * ตัวอย่าง:
 *   exportToExcel([{ name: "สัญญา", rows }], `contracts-${date}`)
 *   exportToExcel([{ name: "งบ", rows1 }, { name: "รายการ", rows2 }], "promotions")
 */
export async function exportToExcel(
  sheets: { name: string; rows: Record<string, unknown>[] }[],
  filename: string,
): Promise<void> {
  const XLSX = await import("xlsx")
  const wb = XLSX.utils.book_new()
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows)
    // ชื่อชีตใน Excel จำกัด 31 ตัวอักษร + ห้ามอักขระ : \ / ? * [ ]
    const safe = (s.name || "Sheet").replace(/[:\\/?*[\]]/g, " ").slice(0, 31) || "Sheet"
    XLSX.utils.book_append_sheet(wb, ws, safe)
  }
  const name = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`
  XLSX.writeFile(wb, name)
}

/** วันที่วันนี้รูปแบบ YYYY-MM-DD สำหรับตั้งชื่อไฟล์ */
export function todayStamp(): string {
  return new Date().toISOString().slice(0, 10)
}
