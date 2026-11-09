import { ObjectId } from "mongodb";

import { hrCol } from "@/lib/db";

/**
 * รูปโปรไฟล์ พจส. = **รูปถ่ายหน้าตรง (ช่อง `portrait`) ในใบสมัครของคนนั้น** (Bew 8 พ.ย. 2569)
 *
 * รูปมีที่เดียวคือในใบสมัคร — ทะเบียนประวัติไม่ได้ก๊อปมาเก็บ แต่ `readDrivers()` ทับ `photoUrl`
 * ให้ตอนอ่าน ทุกหน้าที่อ่านรูปจากทะเบียน (ตาราง · หน้าประวัติ · ติดตามฝึกงาน · ห้องเช่า) จึงได้รูปเดียวกับ
 * หน้าผู้สมัครเสมอ ไม่มีสำเนาให้ค้างเมื่อใบสมัครเปลี่ยนรูป/ถูกลบตามคำขอ · เปลี่ยนรูปจากทะเบียนก็เขียนลง
 * ช่องหน้าตรงของใบนั้น (`PUT /api/drivers/{code}/photo`)
 *
 * ใบสมัครของคนขับหาจาก:
 * 1. คำขอสรรหาที่ผูกรหัส พจส. นี้ไว้กับใบสมัคร (`recruitment_requests.drivercode` + `match.applicationId`)
 * 2. ไม่มี → ใบที่เลขบัตรประชาชนในช่องเอกสารตรงกับทะเบียน (ใบใหม่สุด)
 *
 * คนที่ไม่มีใบสมัคร (คนเก่าจาก Excel) ใช้รูปที่อัปไว้ในทะเบียนเอง (`master_driver.photoUrl`) ·
 * ไม่มีทั้งคู่ = ไม่มีรูป (ขึ้นตัวย่อชื่อ) จนกว่าจะมีคนอัป
 */

const PORTRAIT_SLOT = "portrait";

type AppLite = {
  _id: ObjectId;
  files?: { slot?: string; url?: string }[];
  documents?: { nationalId?: string };
  createdAt?: string;
  erasedAt?: unknown;
  status?: string;
};

const digits = (v: unknown) => (typeof v === "string" ? v.replace(/[^0-9]/g, "") : "");
const isNationalId = (v: string) => v.length === 13;
/** ใบที่ผู้สมัครยกเลิกเองแล้วข้อมูลถูกลบ — กติกาเดียวกับ `erasedOf()` ใน applications.ts */
const erased = (a: AppLite) => Boolean(a.erasedAt) || a.status === "withdrawn";
const portraitOf = (a: AppLite) => a.files?.find((f) => f.slot === PORTRAIT_SLOT)?.url || "";

/** รหัส พจส. → ใบสมัครที่ผูกไว้ผ่านคำขอสรรหา (คำขอที่แก้ล่าสุดชนะ) */
export async function requisitionLinks(codes?: readonly string[]): Promise<Map<string, string>> {
  const rows = await (
    await hrCol("requisitions")
  )
    .find(
      {
        drivercode: codes ? { $in: [...codes] } : { $nin: ["", null] },
        "match.applicationId": { $nin: ["", null] },
      },
      {
        projection: {
          _id: 0,
          drivercode: 1,
          "match.applicationId": 1,
          updatedAt: 1,
        },
      },
    )
    .sort({ updatedAt: 1 })
    .toArray();
  const out = new Map<string, string>();
  for (const r of rows) {
    const code = String(r.drivercode ?? "").trim();
    const id = String(r.match?.applicationId ?? "");
    if (code && ObjectId.isValid(id)) out.set(code, id);
  }
  return out;
}

export type PortraitIndex = {
  resolve: (drivercode: string, nationalId: unknown) => string | null;
};

/**
 * ดัชนีรูปหน้าตรงสำหรับอ่านทะเบียนทั้งก้อน — สอง query เล็ก (ใบที่มีรูปหน้าตรง ~ไม่กี่สิบใบ +
 * คำขอที่ผูกทั้งรหัสและใบสมัคร) · `resolve()` คืน `null` = คนนี้ไม่มีใบสมัครที่มีรูป
 */
export async function loadPortraitIndex(codes?: readonly string[]): Promise<PortraitIndex> {
  const [links, apps] = await Promise.all([
    requisitionLinks(codes),
    (await hrCol<AppLite>("applications"))
      .find(
        { "files.slot": PORTRAIT_SLOT },
        {
          projection: {
            files: 1,
            "documents.nationalId": 1,
            createdAt: 1,
            erasedAt: 1,
            status: 1,
          },
        },
      )
      .sort({ createdAt: 1 })
      .toArray(),
  ]);

  const byId = new Map<string, string>();
  const byNationalId = new Map<string, string>();
  for (const a of apps) {
    const url = portraitOf(a);
    if (!url || erased(a)) continue;
    byId.set(a._id.toHexString(), url);
    const nid = digits(a.documents?.nationalId);
    if (isNationalId(nid)) byNationalId.set(nid, url); // เรียงเก่า→ใหม่ ใบใหม่สุดทับ
  }

  return {
    resolve(drivercode, nationalId) {
      const linked = links.get(drivercode.trim());
      const nid = digits(nationalId);
      return (linked && byId.get(linked)) || (isNationalId(nid) && byNationalId.get(nid)) || null;
    },
  };
}

/**
 * ใบสมัครของคนขับคนนี้ (ยังไม่ถูกลบตามคำขอ) — เปลี่ยนรูปจากทะเบียนต้องเขียนลงใบนี้ ·
 * `null` = ไม่มีใบสมัคร รูปอยู่ที่ทะเบียนเอง
 */
export async function linkedApplicationId(drivercode: string, nationalId: unknown): Promise<string | null> {
  const col = await hrCol<AppLite>("applications");
  const projection = { erasedAt: 1, status: 1 };

  const linked = (await requisitionLinks([drivercode.trim()])).get(drivercode.trim());
  if (linked) {
    const a = await col.findOne({ _id: new ObjectId(linked) }, { projection });
    if (a && !erased(a)) return linked;
  }

  const nid = digits(nationalId);
  if (!isNationalId(nid)) return null;
  const candidates = await col
    .find(
      { "documents.nationalId": { $exists: true } },
      {
        projection: { ...projection, "documents.nationalId": 1, createdAt: 1 },
      },
    )
    .sort({ createdAt: -1 })
    .toArray();
  const hit = candidates.find((a) => !erased(a) && digits(a.documents?.nationalId) === nid);
  return hit ? hit._id.toHexString() : null;
}
