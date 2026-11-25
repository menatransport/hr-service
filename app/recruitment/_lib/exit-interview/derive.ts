import { ObjectId } from "mongodb";

import { hrCol } from "@/lib/db";
import { linkedApplicationId } from "@/app/recruitment/_lib/drivers/portrait";
import { displayAnswer, findByRole } from "@/app/recruitment/_lib/form";
import type { InterviewReference } from "./types";

/**
 * ช่องทางสรรหา — **ระบบเติมให้เอง ไม่ต้องกรอก** (Bew 25 พ.ย. 2569)
 * = คำตอบข้อ “ทราบข่าวการรับสมัครจากที่ไหน” ในใบสมัครของคนนั้น
 * (ใบเดียวกับรูปหน้าตรง — ผูกผ่านคำขอสรรหา หรือเลขบัตรประชาชน) · คนเก่าที่ไม่มีใบสมัคร = ว่าง
 *
 * ST Zone / RC Mass เอาออกจากลิ้นชักก่อน (ข้อมูล sync ไม่ได้) — ค่าที่นำเข้าจาก DataLog ยังอยู่ในระเบียน
 * ค่าที่บันทึกไว้แล้วในระเบียนสัมภาษณ์ชนะเสมอ — เติมแค่ช่องที่ว่าง
 */

/** คำตอบในใบสมัคร → ชื่อช่องทางชุดเดียวกับ DataLog (`RECRUIT_CHANNELS`) · ตอบอย่างอื่น = ข้อความเดิม */
function normalizeChannel(raw: string): string {
  const v = raw.trim();
  if (!v || v === "-") return "";
  if (/facebook/i.test(v)) return "Facebook";
  if (/tiktok/i.test(v)) return "Tiktok";
  if (v.includes("พนักงานเก่า")) return "พจส.เก่ากลับมาใหม่";
  if (v.includes("เพื่อน")) return "เพื่อนชวนเพื่อน";
  if (v.includes("ไวนิล")) return "ป้ายไวนิล";
  return v;
}

type AppLite = {
  questionSnapshot?: { key: string; label: string; options?: { value: string; label: string }[] }[];
  answers?: Record<string, string | string[]>;
};

async function channelOf(drivercode: string, nationalId: unknown): Promise<string> {
  const id = await linkedApplicationId(drivercode, nationalId);
  if (!id) return "";
  const app = await (await hrCol<AppLite>("applications")).findOne(
    { _id: new ObjectId(id) },
    { projection: { questionSnapshot: 1, answers: 1 } },
  );
  const q = app && findByRole(app.questionSnapshot ?? [], "recruit_channel");
  if (!q) return "";
  const value = displayAnswer(app.answers?.[q.key], q.options ?? []);
  return value === "—" ? "" : normalizeChannel(value);
}

/** ช่องอ้างอิงที่ระบบเติมให้ได้ของคนเดียว (ลิ้นชัก / ตอนบันทึก) */
export async function deriveReference(d: { drivercode: string; nationalId?: string }): Promise<Partial<InterviewReference>> {
  return { channel: await channelOf(d.drivercode, d.nationalId).catch(() => "") };
}

/** ช่องที่บันทึกไว้แล้วชนะ — เติมเฉพาะช่องว่าง */
export function fillReference(saved: InterviewReference, derived: Partial<InterviewReference>): InterviewReference {
  return {
    stZone: saved.stZone || derived.stZone || "",
    rcOwner: saved.rcOwner || derived.rcOwner || "",
    channel: saved.channel || derived.channel || "",
  };
}
