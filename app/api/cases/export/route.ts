import { NextResponse, type NextRequest } from "next/server";

import { fail } from "@/app/api/_lib/respond";
import { getDeskIdentity } from "@/lib/auth/session";
import { buildCaseWorkbook, exportFileName } from "@/lib/case-export";
import { filterCases, filtersFromParams } from "@/lib/case-filter";
import { getCases } from "@/lib/cases";

/**
 * `GET /api/cases/export` — คิวคำร้องในรูปไฟล์ Excel (.xlsx)
 *
 * ตัวกรองส่งมาทาง query string ชุดเดียวกับที่ตารางใช้ (`lib/case-filter.ts`)
 * แล้ว **อ่านข้อมูลสดจาก NCAC มากรองใหม่ที่นี่** ไม่ได้รับแถวที่หน้าจอถืออยู่มาเขียนลงไฟล์
 * — ไฟล์ที่ส่งต่อให้คนอื่นจึงเป็นข้อมูล ณ วินาทีที่กดส่งออกจริง ไม่ใช่ของค้างในแท็บ
 *
 * ต่างจาก `GET` เส้นอื่นตรงที่ **ด่านนี้บังคับล็อกอิน** — `proxy.ts` ปล่อย `GET`
 * ผ่านได้ทั้งหมดเพราะหน้าที่เรียกมันอยู่ใต้ `/desk/**` ที่กั้นไว้แล้ว แต่เส้นนี้
 * ยกข้อมูลคำร้องทั้งคิวออกไปเป็นไฟล์ในคำขอเดียว จึงตรวจ session ซ้ำเองอีกชั้น
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
    const filters = filtersFromParams(request.nextUrl.searchParams);
    const cases = await getCases();
    const rows = filterCases(cases, filters);

    const exportedAt = new Date();
    const file = await buildCaseWorkbook(rows, {
      filters,
      exportedBy: identity.name,
      exportedAt,
      totalInQueue: cases.length,
    });
    const name = exportFileName(exportedAt);

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
