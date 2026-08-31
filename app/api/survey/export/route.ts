import { NextResponse, type NextRequest } from "next/server";

import { fail } from "@/app/api/_lib/respond";
import { getDeskIdentity } from "@/lib/auth/session";
import { listSurveyResponses } from "@/lib/newyear-survey";
import { buildSurveyWorkbook, surveyExportFileName } from "@/lib/survey-export";
import { filterSurveyResponses, surveyFiltersFromParams } from "@/lib/survey-filter";
import { DEFAULT_SURVEY_ID, SURVEY_FORMS } from "@/lib/survey-forms";

/**
 * `GET /api/survey/export` — ผลแบบสอบถามในรูปไฟล์ Excel (.xlsx)
 * คู่ขนานกับ `GET /api/record-cases/export`
 *
 * ตัวกรองส่งมาทาง query string ชุดเดียวกับที่ตารางใช้ (`lib/survey-filter.ts`)
 * แล้ว **อ่านข้อมูลสดจาก MongoDB มากรองใหม่ที่นี่** ไม่รับแถวที่หน้าจอถืออยู่มาเขียนลงไฟล์
 *
 * **ด่านนี้บังคับล็อกอินเอง** — `proxy.ts` ปล่อย `GET` ผ่านหมดเพราะหน้าที่เรียกมัน
 * อยู่ใต้ `/desk/**` ที่กั้นไว้แล้ว แต่เส้นนี้ยกคำตอบทั้งชุดออกไปเป็นไฟล์ในคำขอเดียว
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
    const params = request.nextUrl.searchParams;
    const surveyId = params.get("survey_id") ?? DEFAULT_SURVEY_ID;
    const form = SURVEY_FORMS.find((f) => f.id === surveyId);
    if (!form) {
      return NextResponse.json({ error: `ไม่รู้จักแบบฟอร์ม '${surveyId}'` }, { status: 400 });
    }

    const filters = surveyFiltersFromParams(params);
    const responses = await listSurveyResponses(surveyId);
    const rows = filterSurveyResponses(responses, filters);

    const exportedAt = new Date();
    const file = await buildSurveyWorkbook(rows, {
      form,
      filters,
      exportedBy: identity.name,
      exportedAt,
      totalResponses: responses.length,
    });
    const name = surveyExportFileName(surveyId, exportedAt);

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
