import type { NextRequest } from "next/server";

import { badRequest, fail, ok } from "@/app/api/_lib/respond";
import { buildDirectory, toHrCase } from "@/lib/ncac/adapt";
import { createComplaint, getComplaint, listComplaints, listUsers } from "@/lib/ncac/client";

/** รับเฉพาะลิงก์ http(s) — กัน `javascript:` / `data:` ที่ปลายทางเอาไปใส่ `<img src>` ต่อ */
function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * `GET /api/cases` — คิวเคสทั้งหมดในรูป `HrCase`
 *
 * query ที่ส่งมาจะถูกส่งต่อให้ NCAC ตรง ๆ (`status`, `department_id`,
 * `start_date`, `end_date`) ส่วนการค้นหาข้อความทำฝั่งหน้าจอเหมือนเดิม
 */
export async function GET(request: NextRequest) {
  try {
    const params = new URLSearchParams(request.nextUrl.searchParams);
    params.delete("search");

    const [complaints, users] = await Promise.all([
      listComplaints(params),
      listUsers().catch(() => []),
    ]);
    const directory = buildDirectory(users);

    return ok(
      complaints
        .filter((c) => !c.is_deleted)
        .map((c) => toHrCase(c, directory))
        .sort((a, b) => b.trackingNo.localeCompare(a.trackingNo)),
    );
  } catch (err) {
    return fail(err);
  }
}

/**
 * `POST /api/cases` — แจ้งเรื่องเองจากฝั่ง desk (แทนคนขับ)
 *
 * `driverId` / `subject` / `detail` บังคับตาม `ComplaintCreate` ของ NCAC
 * `imageUrl` ไม่บังคับ → ไปเป็น `complaint_url` (NCAC เก็บได้ไฟล์เดียวต่อฝั่ง)
 * สร้างแล้วดึงเคสเต็มกลับมาด้วย `getComplaint()` เพราะ `POST` ตอบแค่ฟิลด์ย่อ
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      driverId?: string;
      subject?: string;
      detail?: string;
      imageUrl?: string;
    };

    const driverId = body.driverId?.trim();
    const subject = body.subject?.trim();
    const detail = body.detail?.trim();
    const imageUrl = body.imageUrl?.trim();
    if (!driverId) return badRequest("ต้องระบุรหัสคนขับ");
    if (!subject) return badRequest("ต้องระบุหัวเรื่อง");
    if (!detail) return badRequest("ต้องระบุรายละเอียด");
    if (imageUrl && !isHttpUrl(imageUrl))
      return badRequest("ลิงก์รูปภาพต้องขึ้นต้นด้วย http:// หรือ https://");

    const created = await createComplaint({
      driver_id: driverId,
      subject,
      detail,
      complaint_url: imageUrl || null,
    });

    const [complaint, users] = await Promise.all([
      getComplaint(created.tracking_no),
      listUsers().catch(() => []),
    ]);
    return ok(toHrCase(complaint, buildDirectory(users)));
  } catch (err) {
    return fail(err);
  }
}
