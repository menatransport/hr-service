import { badRequest, fail } from "@/app/api/_lib/respond";
import { RecordCategoryError } from "@/lib/record-categories";

/**
 * แปลง `RecordCategoryError` (ข้อมูลที่กรอกไม่ผ่าน) ให้เป็น 400 แทน 500
 * เหมือน `failRecord()` ของ `/api/record-cases` — คนละไฟล์เพราะคนละ error class
 */
export function failCategory(err: unknown) {
  if (err instanceof RecordCategoryError) return badRequest(err.message);
  return fail(err);
}
