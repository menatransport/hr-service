import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { badRequest, fail, ok } from "@/app/api/_lib/respond";
import { getActorEmployeeId } from "@/lib/auth/session";
import {
  attachDriverDocument,
  DriverRegistryError,
  getDriver,
} from "@/app/recruitment/_lib/drivers/registry";
import {
  ALLOWED_DOC_LABEL,
  ALLOWED_DOC_MIME,
  deleteDriverDocumentFile,
  MAX_DOC_BYTES,
  saveDriverDocumentFile,
} from "@/app/recruitment/_lib/drivers/documents";
import { isDriverDocType } from "@/app/recruitment/_lib/drivers/types";
import { StorageError } from "@/lib/s3";

/**
 * `POST /api/drivers/{drivercode}/documents` — แนบเอกสารเข้าแฟ้มประวัติ พจส.
 *
 * ส่งเป็น `multipart/form-data`: `file` · `docType` (รหัสใน `DRIVER_DOC_TYPES`) ·
 * `note` (ไม่บังคับ) · คืนรายการเอกสารทั้งแฟ้มที่อ่านกลับมาจากฐานข้อมูลจริง
 *
 * ลำดับสำคัญ **ตรวจรหัสคนขับก่อนอัปไฟล์เสมอ** — สลับลำดับเมื่อไรก็ได้ไฟล์กำพร้า
 * ค้างบน S3 ทุกครั้งที่ยิงผิดรหัส · และถ้าอัปสำเร็จแต่ผูกเข้าแฟ้มไม่ติด
 * (แถวหายไประหว่างนั้น) จะลบไฟล์ทิ้งก่อนตอบ ไม่ทิ้งขยะไว้ใน bucket
 *
 * ไฟล์ไปอยู่บน **S3 แบบ private** (`mass-image/drivers/{code}/documents/{docType}/`) —
 * เอกสารชุดนี้คือสำเนาบัตรประชาชนและสัญญาจ้างของคนจริง เปิดได้ด้วยลิงก์เปล่า ๆ ไม่ได้
 * (เหตุผลเต็มอยู่ที่หัวไฟล์ `app/recruitment/_lib/drivers/documents.ts`)
 *
 * ผู้บันทึกมาจาก session ฝั่งเซิร์ฟเวอร์เสมอ **ไม่รับจาก client**
 */

/** กันหมายเหตุยาวผิดปกติ — ช่องนี้ไว้เขียนบริบทสั้น ๆ เช่น “ฉบับต่ออายุปี 2569” */
const MAX_NOTE = 300;

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/drivers/[code]/documents">,
) {
  try {
    const { code } = await ctx.params;
    const drivercode = decodeURIComponent(code);

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    const docType = String(form?.get("docType") ?? "").trim();
    const note = String(form?.get("note") ?? "").trim();

    if (!(file instanceof File) || !file.size) return badRequest("ไม่พบไฟล์ที่แนบมา");
    if (!isDriverDocType(docType)) return badRequest("เลือกประเภทเอกสารก่อน");
    if (!ALLOWED_DOC_MIME.has(file.type))
      return badRequest(`แนบได้เฉพาะ${ALLOWED_DOC_LABEL}`);
    if (file.size > MAX_DOC_BYTES)
      return badRequest(`ไฟล์ใหญ่เกิน ${MAX_DOC_BYTES / 1024 / 1024} MB`);
    if (note.length > MAX_NOTE) return badRequest(`หมายเหตุยาวเกิน ${MAX_NOTE} ตัวอักษร`);

    const driver = await getDriver(drivercode);
    if (!driver) {
      return NextResponse.json(
        { error: `ไม่พบรหัส ${drivercode} ในทะเบียนประวัติ` },
        { status: 404 },
      );
    }

    const stored = await saveDriverDocumentFile(file, drivercode, docType);

    const documents = await attachDriverDocument(
      drivercode,
      { ...stored, docType, note },
      await getActorEmployeeId(),
    ).catch(async (err: unknown) => {
      await deleteDriverDocumentFile(stored.key);
      throw err;
    });

    if (!documents) {
      await deleteDriverDocumentFile(stored.key);
      return NextResponse.json(
        { error: `ไม่พบรหัส ${drivercode} ในทะเบียนประวัติ` },
        { status: 404 },
      );
    }

    return ok({ documents });
  } catch (err) {
    if (err instanceof DriverRegistryError) return badRequest(err.message);
    if (err instanceof StorageError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return fail(err);
  }
}
