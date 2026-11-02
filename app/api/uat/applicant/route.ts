import { ok } from "@/app/api/_lib/respond";
import { createUatApplication } from "@/app/recruitment/_lib/applications";
import { assertUatManager } from "@/lib/uat-store";

import { failUat } from "../_fail";

/** `POST /api/uat/applicant` — สุ่มผู้สมัครทดสอบ 1 ใบ (ปุ่มบนหน้า `/desk/uat`) คืน `{ ref, fullName }` */
export async function POST() {
  try {
    const by = await assertUatManager();
    return ok(await createUatApplication(by.name));
  } catch (err) {
    return failUat(err);
  }
}
