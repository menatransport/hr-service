import type { SessionUser } from "@/lib/auth/token";

import { buildOverview } from "./overview";
import { DuplicateLinkError, type DriverLinksRepo } from "./repo";
import type { Confidence, MatchedBy } from "./match";
import type { ConfirmLinkBody, DriverLinksOverview, LinkDoc } from "./types";

/**
 * ตรรกะของ `app/api/driver-links/**` — route เป็นแค่เปลือกที่ส่ง session + repo จริงเข้ามา
 * แยกไว้ที่นี่ให้ทดสอบด้วย repo ปลอมได้ (ไม่ต่อฐาน)
 *
 * - ทุกเส้น **รวม GET** ต้องมี session — `proxy.ts` ปล่อย GET ผ่าน
 * - ผู้ยืนยัน/ผู้ปลด = `employeeId` จาก session เสมอ ไม่รับจาก body
 */

export interface ApiResult<T = unknown> {
  status: number;
  body: T | { error: string };
}

export interface ApiDeps {
  readUser: () => Promise<SessionUser | null>;
  repo: Pick<
    DriverLinksRepo,
    "loadSources" | "listLinks" | "contractExists" | "driverExists" | "findLink" | "insertLink" | "deleteLink"
  >;
  now?: () => Date;
  /**
   * จดประวัติยืนยัน/ปลดคู่ — ของจริงลง `partner_driver_link_events` (`audit.ts`)
   * ล้มได้โดยไม่กระทบผลของคำสั่ง (ข้อมูลหลักบันทึกไปแล้ว)
   */
  audit?: (event: Record<string, unknown>) => void | Promise<void>;
}

const MATCHED_BY: readonly MatchedBy[] = ["nationalId", "name+plate", "name", "manual"];
const CONFIDENCE: readonly Confidence[] = ["high", "medium", "low"];
const CODE_RE = /^[\p{L}\p{N}][\p{L}\p{N}._\-/]{0,39}$/u;
const MAX_NOTE = 300;

const err = (status: number, error: string): ApiResult<never> => ({ status, body: { error } });
const NEED_LOGIN = err(401, "กรุณาเข้าสู่ระบบก่อน");

const defaultAudit = (event: Record<string, unknown>) => console.info("[driver-links]", JSON.stringify(event));

/** จดประวัติแบบไม่ทำให้คำสั่งล้ม — audit โยน error ก็แค่เตือน */
async function record(deps: ApiDeps, event: Record<string, unknown>): Promise<void> {
  try {
    await (deps.audit ?? defaultAudit)(event);
  } catch (e) {
    console.warn("[driver-links] audit ล้ม —", e);
  }
}

/** `GET /api/driver-links` — ข้อเสนอ · คู่ที่ยืนยันแล้ว · ตัวเลขคนขับ · ขัดแย้ง */
export async function getOverview(deps: ApiDeps): Promise<ApiResult<DriverLinksOverview>> {
  if (!(await deps.readUser())) return NEED_LOGIN;
  const [sources, links] = await Promise.all([deps.repo.loadSources(), deps.repo.listLinks()]);
  return { status: 200, body: buildOverview(sources, links, { now: deps.now?.() ?? new Date() }) };
}

export function parseConfirmBody(raw: unknown): ConfirmLinkBody | string {
  if (!raw || typeof raw !== "object") return "อ่านข้อมูลที่ส่งมาไม่ได้";
  const b = raw as Record<string, unknown>;
  const contractCode = typeof b.contractCode === "string" ? b.contractCode.trim() : "";
  const drivercode = typeof b.drivercode === "string" ? b.drivercode.trim() : "";
  if (!CODE_RE.test(contractCode)) return "รหัสสัญญาไม่ถูกต้อง";
  if (!CODE_RE.test(drivercode)) return "รหัส พจส. ไม่ถูกต้อง";
  if (!MATCHED_BY.includes(b.matchedBy as MatchedBy)) return "ไม่รู้ว่าจับคู่ด้วยวิธีไหน";
  const matchedBy = b.matchedBy as MatchedBy;
  // กรอกรหัสเอง = ระบบไม่มีหลักฐานอะไรเลย ความมั่นใจของระบบจึงเป็น low เสมอ
  const confidence = matchedBy === "manual" ? "low" : (b.confidence as Confidence);
  if (!CONFIDENCE.includes(confidence)) return "ระดับความมั่นใจไม่ถูกต้อง";
  const note = typeof b.note === "string" ? b.note.trim() : "";
  if (note.length > MAX_NOTE) return `หมายเหตุยาวเกิน ${MAX_NOTE} ตัวอักษร`;
  if (matchedBy === "manual" && !note) return "กรอกรหัสเองต้องเขียนหมายเหตุสั้น ๆ ว่ารู้ได้อย่างไร";
  return { contractCode, drivercode, matchedBy, confidence, ...(note ? { note } : {}) };
}

/** `POST /api/driver-links` — ยืนยันคู่ */
export async function confirmLink(deps: ApiDeps, raw: unknown): Promise<ApiResult<{ link: LinkDoc }>> {
  const user = await deps.readUser();
  if (!user) return NEED_LOGIN;

  const body = parseConfirmBody(raw);
  if (typeof body === "string") return err(400, body);

  const [hasContract, hasDriver] = await Promise.all([
    deps.repo.contractExists(body.contractCode),
    deps.repo.driverExists(body.drivercode),
  ]);
  if (!hasContract) return err(404, `ไม่พบสัญญา ${body.contractCode} ในรายชื่อคนขับรถร่วม`);
  if (!hasDriver) return err(404, `ไม่พบรหัส ${body.drivercode} ในทะเบียน พจส.`);

  const link: LinkDoc = {
    ...body,
    confirmedBy: user.employeeId,
    confirmedByName: user.name,
    confirmedAt: deps.now?.() ?? new Date(),
  };

  try {
    await deps.repo.insertLink(link);
  } catch (e) {
    if (e instanceof DuplicateLinkError) {
      const by = e.existing;
      return err(
        409,
        by
          ? `สัญญา ${body.contractCode} จับคู่กับ ${by.drivercode} ไปแล้ว (${by.confirmedByName || by.confirmedBy}) — ถ้าผิด ให้ปลดคู่เดิมก่อน`
          : `สัญญา ${body.contractCode} จับคู่ไปแล้ว — รีเฟรชหน้าดูอีกครั้ง`,
      );
    }
    throw e;
  }
  await record(deps, {
    action: "confirm",
    contractCode: link.contractCode,
    drivercode: link.drivercode,
    matchedBy: link.matchedBy,
    confidence: link.confidence,
    by: user.employeeId,
    byName: user.name,
    at: link.confirmedAt.toISOString(),
  });
  return { status: 201, body: { link } };
}

/** `DELETE /api/driver-links/{contractCode}` — ปลดคู่ */
export async function unlink(deps: ApiDeps, contractCode: string): Promise<ApiResult<{ removed: LinkDoc }>> {
  const user = await deps.readUser();
  if (!user) return NEED_LOGIN;
  const code = contractCode.trim();
  if (!CODE_RE.test(code)) return err(400, "รหัสสัญญาไม่ถูกต้อง");

  const removed = await deps.repo.deleteLink(code);
  if (!removed) return err(404, `สัญญา ${code} ไม่มีคู่อยู่แล้ว`);

  await record(deps, {
    action: "unlink",
    contractCode: code,
    drivercode: removed.drivercode,
    by: user.employeeId,
    byName: user.name,
    at: (deps.now?.() ?? new Date()).toISOString(),
    was: { matchedBy: removed.matchedBy, confirmedBy: removed.confirmedBy, confirmedAt: removed.confirmedAt },
  });
  return { status: 200, body: { removed } };
}
