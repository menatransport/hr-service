import { NextResponse, type NextRequest } from "next/server";

import { fail } from "@/app/api/_lib/respond";
import { getDeskIdentity } from "@/lib/auth/session";
import { filterRecordCases, recordFiltersFromParams } from "@/lib/record-case-filter";
import { buildRecordCaseWorkbook, recordExportFileName } from "@/lib/record-case-export";
import { listRecordCases } from "@/lib/record-cases";
import { listRecordCategories } from "@/lib/record-categories";

/**
 * `GET /api/record-cases/export` — คิวบันทึกเคสในรูปไฟล์ Excel (.xlsx)
 * คู่ขนานกับ `GET /api/cases/export` ของฝั่งคำร้อง พจส. — อ่านเหตุผลเรื่องกรองซ้ำที่นั่น
 *
 * ตัวกรองส่งมาทาง query string ชุดเดียวกับที่ตารางใช้ (`lib/record-case-filter.ts`)
 * แล้ว **อ่านข้อมูลสดจาก MongoDB มากรองใหม่ที่นี่** ไม่รับแถวที่หน้าจอถืออยู่มาเขียนลงไฟล์
 *
 * **ด่านนี้บังคับล็อกอินเอง** — `proxy.ts` ปล่อย `GET` ผ่านหมดเพราะหน้าที่เรียกมัน
 * อยู่ใต้ `/desk/**` ที่กั้นไว้แล้ว แต่เส้นนี้ยกข้อมูลทั้งคิวออกไปเป็นไฟล์ในคำขอเดียว
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const identity = await getDeskIdentity();
  if (!identity.authenticated) {
    return NextResponse.json(
      { error: "หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง" },
      { status: 401 },
    );
  }

  try {
    const filters = recordFiltersFromParams(request.nextUrl.searchParams);
    const [records, categories] = await Promise.all([listRecordCases(), listRecordCategories()]);
    const rows = filterRecordCases(records, filters, categories);

    const exportedAt = new Date();
    const file = await buildRecordCaseWorkbook(rows, {
      filters,
      categories,
      exportedBy: identity.name,
      exportedAt,
      totalInQueue: records.length,
    });
    const name = recordExportFileName(exportedAt);

    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        // ไฟล์นี้เป็นภาพ ณ เวลาที่กด — เก็บแคชไว้ใช้ซ้ำไม่ได้เลย
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return fail(err);
  }
}
